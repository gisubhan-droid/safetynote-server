import { Hono } from 'hono'
import { getUser } from '../utils'
import { sendToUser, broadcastAll, broadcastToRoles, sendToUsers } from '../sse'
import { refreshConstructionStatus } from './constructions'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ─── helper: task_work_types 조회 ───────────────────────────────────────────
async function getWorkTypes(db: D1Database, taskId: number) {
  const res = await db.prepare(
    `SELECT wt.id, wt.name, wt.code,
            COUNT(rai.id) as risk_item_count
     FROM task_work_types twt
     JOIN work_types wt ON wt.id = twt.work_type_id
     LEFT JOIN risk_assessment_items rai ON rai.work_type_id = wt.id AND rai.is_active = 1
     WHERE twt.task_id = ?
     GROUP BY wt.id`
  ).bind(taskId).all<any>()
  return res.results || []
}

// ─── helper: task_work_types 동기화 ─────────────────────────────────────────
async function syncWorkTypes(db: D1Database, taskId: number, workTypeIds: number[], userId: number) {
  // task_work_types 테이블이 없을 수 있으므로 개별 try/catch
  try {
    await db.prepare('DELETE FROM task_work_types WHERE task_id = ?').bind(taskId).run()
    for (const wtId of workTypeIds) {
      await db.prepare(
        'INSERT OR IGNORE INTO task_work_types (task_id, work_type_id) VALUES (?, ?)'
      ).bind(taskId, wtId).run()
    }
  } catch(e: any) {
    if (!e.message?.includes('no such table')) throw e
    console.warn('[syncWorkTypes] task_work_types 테이블 없음 (무시):', e.message)
  }
  // tasks.work_type_id를 첫 번째 값으로 유지 (하위 호환)
  const primary = workTypeIds.length > 0 ? workTypeIds[0] : null
  try {
    await db.prepare('UPDATE tasks SET work_type_id = ? WHERE id = ?').bind(primary, taskId).run()
  } catch(e: any) {
    console.warn('[syncWorkTypes] work_type_id UPDATE 실패 (무시):', e.message)
  }
}

// 작업 목록 조회
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const { status, date, start_date, end_date, worker_id, supervisor_id, risk_level, search_type, keyword,
          construction_id: constructionIdStr,
          page: pageStr, limit: limitStr } = c.req.query()
  // 다중 공사담당자: con_manager_names[] 배열 파라미터
  const rawConMgrNames = c.req.queries('con_manager_names') || []
  const conManagerNames = rawConMgrNames.flatMap((n: string) => n.split(',').map((s: string) => s.trim())).filter(Boolean)
  // 페이지네이션 파라미터 (기본: limit=0 → 전체, limit>0 → 페이징)
  const limitNum = Math.min(500, Math.max(0, parseInt(limitStr || '0') || 0))
  const pageNum  = Math.max(1, parseInt(pageStr  || '1') || 1)
  const offset   = limitNum > 0 ? (pageNum - 1) * limitNum : 0
  let query = `SELECT t.*, COALESCE(t.work_class_new, t.work_class, 'cable_install') as work_class, wc.name as category_name, wt.name as work_type_name,
    u.name as supervisor_name, cb.name as created_by_name,
    t.construction_type, t.request_no, t.contractor_name,
    t.construction_id, t.sub_task_number,
    con.title as construction_title, con.request_no as con_request_no,
    COALESCE(con.is_auto_request_no, -1) as is_auto_request_no,
    COALESCE(con_mgr.name, con.manager_name, '') AS con_manager_display_name
    FROM tasks t
    LEFT JOIN work_categories wc ON t.category_id = wc.id
    LEFT JOIN work_types wt ON t.work_type_id = wt.id
    LEFT JOIN users u ON t.supervisor_id = u.id
    LEFT JOIN users cb ON t.created_by = cb.id
    LEFT JOIN constructions con ON con.id = t.construction_id
    LEFT JOIN users con_mgr ON con_mgr.id = con.manager_id`
  const params: any[] = []
  const wheres: string[] = []

  if (user.role === 'worker') {
    query = `SELECT t.*, COALESCE(t.work_class_new, t.work_class, 'cable_install') as work_class, wc.name as category_name, wt.name as work_type_name,
      u.name as supervisor_name, cb.name as created_by_name,
      t.construction_type, t.request_no, t.contractor_name,
      t.construction_id, t.sub_task_number,
      con.title as construction_title, con.request_no as con_request_no,
      COALESCE(con.is_auto_request_no, -1) as is_auto_request_no,
      COALESCE(con_mgr.name, con.manager_name, '') AS con_manager_display_name
      FROM tasks t
      LEFT JOIN work_categories wc ON t.category_id = wc.id
      LEFT JOIN work_types wt ON t.work_type_id = wt.id
      LEFT JOIN users u ON t.supervisor_id = u.id
      LEFT JOIN users cb ON t.created_by = cb.id
      LEFT JOIN constructions con ON con.id = t.construction_id
      LEFT JOIN users con_mgr ON con_mgr.id = con.manager_id
      INNER JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?`
    params.push(user.id)
  }

  // [BUG-039/BUG-041] LGU+ 역할: is_auto_request_no=0 (요청번호 자동부여 미체크) 건만 조회 허용
  // [FEAT-048] role='lgu_plus' 단일 역할 + 구버전 호환 (role='lgu', sub_role='lgu_plus')
  if (user.role === 'lgu_plus' || user.role === 'lgu' || (user as any).sub_role === 'lgu_plus') {
    wheres.push('COALESCE(con.is_auto_request_no, -1) = 0')
  }

  if (status) {
    // 다중 상태 지원 (콤마 구분): assigned,in_progress,working
    const statuses = status.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (statuses.length === 1) {
      wheres.push('t.status = ?'); params.push(statuses[0])
    } else if (statuses.length > 1) {
      wheres.push(`t.status IN (${statuses.map(() => '?').join(',')})`)
      params.push(...statuses)
    }
  }
  if (date)       { wheres.push('t.planned_date = ?');                       params.push(date) }
  if (start_date && end_date) {
    wheres.push('t.planned_date BETWEEN ? AND ?'); params.push(start_date, end_date)
  } else if (start_date) { wheres.push('t.planned_date >= ?'); params.push(start_date) }
  else if (end_date)     { wheres.push('t.planned_date <= ?'); params.push(end_date) }
  if (worker_id && user.role !== 'worker') {
    query += ` INNER JOIN task_assignments ta2 ON ta2.task_id = t.id AND ta2.worker_id = ?`
    params.push(worker_id)
  }
  if (supervisor_id) { wheres.push('t.supervisor_id = ?'); params.push(supervisor_id) }
  // 공사담당자 다중 이름 OR LIKE: 연결된 공사의 담당자(users.name FK 또는 manager_name 직접입력)
  if (conManagerNames.length) {
    const orClauses = conManagerNames.map(() => '(con_mgr.name LIKE ? OR con.manager_name LIKE ?)').join(' OR ')
    wheres.push(`(${orClauses})`)
    conManagerNames.forEach((n: string) => { const mk = `%${n}%`; params.push(mk, mk) })
  }
  if (risk_level) { wheres.push('t.risk_level = ?'); params.push(risk_level) }
  // [FEAT-NEW] construction_id 필터: 해당 공사의 작업만 조회 (서브작업번호 자동카운트/중복방지용)
  if (constructionIdStr) {
    const constructionIdNum = parseInt(constructionIdStr, 10)
    if (!isNaN(constructionIdNum)) { wheres.push('t.construction_id = ?'); params.push(constructionIdNum) }
  }
  // 키워드 검색 (search_type: request_no | task_number | title)
  // [FEAT-061] task_number = 내부 시스템번호(TASK-timestamp) → 사용자 정의 작업번호로 변경
  //   사용자 정의 작업번호: con.work_number(WKS-######-#####) + t.sub_task_number(####) 조합
  //   - work_number만 입력 시: con.work_number LIKE 또는 t.work_number LIKE
  //   - sub_task_number만 입력 시: t.sub_task_number LIKE
  //   - 조합(WKS-xxx-yyy-zzzz) 입력 시: CONCAT 방식 OR 분리 검색
  if (keyword && keyword.trim()) {
    const raw = keyword.trim()
    const kw  = `%${raw}%`
    if (search_type === 'request_no') {
      wheres.push('t.request_no LIKE ?')
      params.push(kw)
    } else if (search_type === 'task_number') {
      // 사용자 정의 작업번호 = work_number + '-' + sub_task_number 조합
      // 숫자만 입력, WKS- 포함 부분, sub_task_number 단독 입력 모두 지원
      // con.work_number(공사의 작업번호) 또는 t.work_number(tasks에 복사된 값) 또는 sub_task_number LIKE
      wheres.push(`(
        con.work_number LIKE ?
        OR t.work_number LIKE ?
        OR t.sub_task_number LIKE ?
        OR (con.work_number IS NOT NULL AND t.sub_task_number IS NOT NULL
            AND (con.work_number || '-' || t.sub_task_number) LIKE ?)
        OR (t.work_number != '' AND t.sub_task_number != ''
            AND (t.work_number || '-' || t.sub_task_number) LIKE ?)
      )`)
      params.push(kw, kw, kw, kw, kw)
    } else {
      wheres.push('t.title LIKE ?')
      params.push(kw)
    }
  }

  if (wheres.length) query += ' WHERE ' + wheres.join(' AND ')
  query += ' ORDER BY t.planned_date DESC, t.created_at DESC'

  // 전체 건수 (페이지네이션용) — limitNum > 0 일 때만 COUNT 조회
  let total: number | undefined
  if (limitNum > 0) {
    // COUNT 쿼리: SELECT * → COUNT(*) 로 교체 (같은 WHERE/JOIN 조건 재사용)
    const countQuery = query
      .replace(/SELECT t\.\*.*?FROM tasks t/is, 'SELECT COUNT(*) AS cnt FROM tasks t')
    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<any>()
    total = countResult?.cnt ?? 0
    query += ` LIMIT ? OFFSET ?`
    params.push(limitNum, offset)
  }

  const result = await c.env.DB.prepare(query).bind(...params).all<any>()
  const tasks = result.results || []

  if (tasks.length > 0) {
    // ── 배치 조회: N+1 → 2회 병렬 쿼리로 해결 ──────────────────────────────
    const taskIds = tasks.map((t: any) => t.id)
    const idPlaceholders = taskIds.map(() => '?').join(',')

    const [workersRes, typesRes, reportsRes] = await Promise.all([
      // 배정 작업자 + 팀명 (한 번에)
      c.env.DB.prepare(`
        SELECT ta.task_id, u.id, u.name, u.position, tm.name AS team_name
        FROM task_assignments ta
        JOIN users u ON u.id = ta.worker_id
        LEFT JOIN teams tm ON tm.id = u.team_id
        WHERE ta.task_id IN (${idPlaceholders})
        ORDER BY ta.task_id
      `).bind(...taskIds).all<any>(),

      // 다중 작업 유형 (한 번에)
      c.env.DB.prepare(`
        SELECT twt.task_id, twt.work_type_id, wt.name
        FROM task_work_types twt
        JOIN work_types wt ON wt.id = twt.work_type_id
        WHERE twt.task_id IN (${idPlaceholders})
      `).bind(...taskIds).all<any>(),

      // 일보 report_id + report_status (한 번에)
      c.env.DB.prepare(`
        SELECT task_id, id AS report_id, status AS report_status
        FROM work_reports
        WHERE task_id IN (${idPlaceholders})
      `).bind(...taskIds).all<any>(),
    ])

    // task_id → workers 맵 구성
    const workersMap: Record<number, any[]> = {}
    const teamNameMap: Record<number, string> = {}  // task_id → 팀명
    for (const w of (workersRes.results || [])) {
      if (!workersMap[w.task_id]) workersMap[w.task_id] = []
      workersMap[w.task_id].push({ id: w.id, name: w.name, position: w.position })
      if (w.team_name && !teamNameMap[w.task_id]) teamNameMap[w.task_id] = w.team_name
    }

    // task_id → work_types 맵 구성
    const typesMap: Record<number, any[]> = {}
    for (const wt of (typesRes.results || [])) {
      if (!typesMap[wt.task_id]) typesMap[wt.task_id] = []
      typesMap[wt.task_id].push({ id: wt.work_type_id, name: wt.name })
    }

    // task_id → report 맵 구성
    const reportMap: Record<number, { report_id: number; report_status: string }> = {}
    for (const r of (reportsRes.results || [])) {
      reportMap[r.task_id] = { report_id: r.report_id, report_status: r.report_status }
    }

    for (const task of tasks) {
      task.assigned_workers = workersMap[task.id] || []
      task.work_types        = typesMap[task.id]  || []
      task.team_name         = teamNameMap[task.id] || null
      task.report_id         = reportMap[task.id]?.report_id    ?? null
      task.report_status     = reportMap[task.id]?.report_status ?? null
    }
  } else {
    // tasks 없을 때 빈 배열 초기화
    for (const task of tasks) {
      task.assigned_workers = []
      task.work_types = []
      task.team_name = null
    }
  }

  return c.json({ tasks, ...(total !== undefined ? { total, page: pageNum, limit: limitNum } : {}) })
})

// 미배정 작업 목록 (작업자 직접 선택용) - /:id 보다 먼저 등록
app.get('/unassigned-list', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const result = await c.env.DB.prepare(
    `SELECT t.*, wc.name as category_name, wt.name as work_type_name,
     u.name as supervisor_name, cb.name as created_by_name
     FROM tasks t
     LEFT JOIN work_categories wc ON t.category_id = wc.id
     LEFT JOIN work_types wt ON t.work_type_id = wt.id
     LEFT JOIN users u ON t.supervisor_id = u.id
     LEFT JOIN users cb ON t.created_by = cb.id
     WHERE t.status = 'unassigned'
     ORDER BY t.planned_date ASC, t.created_at DESC`
  ).all<any>()

  const tasks = result.results || []
  for (const task of tasks) {
    task.assigned_workers = []
    task.work_types = await getWorkTypes(c.env.DB, task.id)
  }
  return c.json(tasks)
})

// ── 작업중지 전체 목록 조회 (작업중지현황 페이지용) — /:id 보다 먼저 등록 필수 ──
app.get('/stops', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  // category: '위험작업중지' | '작업중단' | 'all'
  // detail: 세부 사유 필터
  const { category, detail, start_date, end_date, search } = c.req.query()

  // ── 필터 WHERE 절 (목록 + 세부통계용) ──
  let where = 'WHERE 1=1'
  const binds: any[] = []
  if (category && category !== 'all') { where += ' AND ts.stop_category = ?'; binds.push(category) }
  if (detail   && detail   !== 'all') { where += ' AND ts.stop_detail = ?';   binds.push(detail)   }
  if (start_date) { where += ' AND DATE(ts.stopped_at) >= ?'; binds.push(start_date) }
  if (end_date)   { where += ' AND DATE(ts.stopped_at) <= ?'; binds.push(end_date)   }
  if (search) {
    where += ' AND (t.title LIKE ? OR u.name LIKE ? OR ts.notes LIKE ?)'
    const kw = `%${search}%`; binds.push(kw, kw, kw)
  }

  // ── 전체통계용 WHERE (category/detail 필터 제외, 날짜·검색만) ──
  let globalWhere = 'WHERE 1=1'
  const globalBinds: any[] = []
  if (start_date) { globalWhere += ' AND DATE(ts.stopped_at) >= ?'; globalBinds.push(start_date) }
  if (end_date)   { globalWhere += ' AND DATE(ts.stopped_at) <= ?'; globalBinds.push(end_date)   }
  if (search) {
    globalWhere += ' AND (t.title LIKE ? OR u.name LIKE ? OR ts.notes LIKE ?)'
    const kw = `%${search}%`; globalBinds.push(kw, kw, kw)
  }

  // ── 3개 쿼리 병렬 실행 (task_stops 테이블/컬럼 없는 경우 빈 결과 fallback) ──
  // photo_data 제외: 목록에는 has_photo(boolean) 만 전달 → 페이로드 10MB → ~8KB
  let stopsRes: any = { results: [] }
  let catStatsRes: any = { results: [] }
  let detailStatsRes: any = { results: [] }
  try {
    ;[stopsRes, catStatsRes, detailStatsRes] = await Promise.all([
      c.env.DB.prepare(`
        SELECT
          ts.id,
          ts.task_id,
          ts.stop_category,
          ts.stop_detail,
          ts.stop_reason,
          ts.notes,
          CASE WHEN ts.photo_data IS NOT NULL AND ts.photo_data != '' THEN 1 ELSE 0 END AS has_photo,
          ts.stopped_at,
          t.title    AS task_title,
          t.status   AS task_status,
          t.location AS task_location,
          u.name     AS reporter_name,
          u.position AS reporter_position
        FROM task_stops ts
        LEFT JOIN tasks t ON t.id = ts.task_id
        LEFT JOIN users u ON u.id = ts.reported_by
        ${where}
        ORDER BY ts.stopped_at DESC
        LIMIT 200
      `).bind(...binds).all<any>(),

      // 카테고리별 집계 (전체 기준 — 카드 숫자용)
      c.env.DB.prepare(`
        SELECT stop_category, COUNT(*) as cnt
        FROM task_stops ts
        LEFT JOIN tasks t ON t.id = ts.task_id
        LEFT JOIN users u ON u.id = ts.reported_by
        ${globalWhere}
        GROUP BY stop_category
      `).bind(...globalBinds).all<any>(),

      // 세부사유별 집계 (현재 필터 기준)
      c.env.DB.prepare(`
        SELECT stop_category, stop_detail, COUNT(*) as cnt
        FROM task_stops ts
        LEFT JOIN tasks t ON t.id = ts.task_id
        LEFT JOIN users u ON u.id = ts.reported_by
        ${where}
        GROUP BY stop_category, stop_detail
      `).bind(...binds).all<any>(),
    ])
  } catch(e: any) {
    console.warn('[tasks/stops] task_stops 쿼리 실패 (테이블/컬럼 없음):', e.message)
  }

  const catStats: Record<string, number> = {}
  for (const row of (catStatsRes.results || [])) {
    catStats[row.stop_category] = row.cnt
  }

  const detailStats: Record<string, Record<string, number>> = {}
  for (const row of (detailStatsRes.results || [])) {
    const cat = row.stop_category || '위험작업중지'
    if (!detailStats[cat]) detailStats[cat] = {}
    detailStats[cat][row.stop_detail || '기타'] = row.cnt
  }

  return c.json({
    stops: stopsRes.results || [],
    catStats,
    detailStats,
    total: (stopsRes.results || []).length,
  })
})

// 작업중지 단건 사진 lazy 로드 (목록에서 photo_data 제외 → 클릭 시 단건 요청)
// GET /tasks/stops/:stopId/photo
app.get('/stops/:stopId/photo', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const stopId = c.req.param('stopId')
  const row = await c.env.DB.prepare(
    'SELECT photo_data FROM task_stops WHERE id = ?'
  ).bind(stopId).first<any>()
  if (!row) return c.json({ error: '없음' }, 404)
  return c.json({ photo_data: row.photo_data || null })
})

// 작업 상세 조회
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  const task = await c.env.DB.prepare(
    `SELECT t.*, COALESCE(t.work_class_new, t.work_class, 'cable_install') as work_class, wc.name as category_name, wt.name as work_type_name,
     u.name as supervisor_name,
     t.construction_type, t.request_no, t.contractor_name,
     t.construction_id, t.sub_task_number,
     con.title as construction_title, con.request_no as con_request_no,
     con.work_number as con_work_number, con.manager_name as con_manager_name,
     con.supervisor_name as con_supervisor_name, con.work_order_address as con_work_order_address,
     COALESCE(con.is_auto_request_no, -1) as is_auto_request_no
     FROM tasks t
     LEFT JOIN work_categories wc ON t.category_id = wc.id
     LEFT JOIN work_types wt ON t.work_type_id = wt.id
     LEFT JOIN users u ON t.supervisor_id = u.id
     LEFT JOIN constructions con ON con.id = t.construction_id
     WHERE t.id = ?`
  ).bind(id).first<any>()

  if (!task) return c.json({ error: '작업을 찾을 수 없습니다.' }, 404)

  // 3개 순차 쿼리 → Promise.all 병렬화
  const [workers, workTypes, latestAss] = await Promise.all([
    c.env.DB.prepare(
      `SELECT u.id, u.name, u.position FROM task_assignments ta JOIN users u ON u.id = ta.worker_id WHERE ta.task_id = ?`
    ).bind(id).all<any>(),
    getWorkTypes(c.env.DB, parseInt(id)),
    c.env.DB.prepare(
      `SELECT id FROM checklist_assessments WHERE task_id = ? ORDER BY id DESC LIMIT 1`
    ).bind(id).first<any>(),
  ])

  task.assigned_workers = workers.results || []
  task.work_types = workTypes
  task.checklist_assessment_id = latestAss?.id || null

  return c.json(task)
})

// 작업 생성 (관리자·감독자만 가능)
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor') {
    return c.json({ error: '작업 생성은 관리자 또는 감독자만 가능합니다.' }, 403)
  }

  const body = await c.req.json()
  const { title, description, category_id, work_type_ids, work_type_id,
    location, planned_date, planned_quantity, quantity_unit,
    supervisor_id, priority, notes, worker_ids, work_class,
    work_order_address, gps_lat, gps_lon,
    construction_type, request_no, contractor_name, risk_level, high_subtypes, lgu_supervisor, work_number,
    construction_id, sub_task_number } = body

  if (!title) return c.json({ error: '작업명을 입력하세요.' }, 400)

  // ─── 공사 연결 시 공사 상태 검증 ────────────────────────────────────────
  if (construction_id) {
    const con = await c.env.DB.prepare(
      'SELECT id, title, status FROM constructions WHERE id = ?'
    ).bind(construction_id).first<any>()

    if (con) {
      if (con.status === 'settled') {
        // 정산완료: 어떠한 경우에도 작업 생성 불가
        return c.json({
          error: '정산완료된 공사에는 작업을 생성할 수 없습니다.',
          code: 'CONSTRUCTION_SETTLED',
          construction_title: con.title,
        }, 403)
      }
      if (con.status === 'settlement_requested') {
        // 정산요청 중: 어떠한 경우에도 작업 생성 불가
        return c.json({
          error: '정산요청 중인 공사에는 작업을 생성할 수 없습니다.',
          code: 'CONSTRUCTION_SETTLEMENT_REQUESTED',
          construction_title: con.title,
        }, 403)
      }
      if (con.status === 'completed') {
        // 완료 상태: body에 force_create 플래그가 없으면 경고 응답 (프론트에서 confirm 후 재요청)
        if (!body.force_create) {
          return c.json({
            error: '완료된 공사입니다. 작업을 생성하면 해당 공사는 진행중으로 변경됩니다. 계속하시겠습니까?',
            code: 'CONSTRUCTION_COMPLETED_CONFIRM',
            construction_title: con.title,
          }, 409)
        }
        // force_create=true → 공사 상태를 in_progress로 되돌리고 생성 허용
      }
    }
  }

  // work_type_ids 배열 또는 단일 work_type_id 지원
  const typeIds: number[] = Array.isArray(work_type_ids)
    ? work_type_ids.filter(Boolean).map(Number)
    : work_type_id ? [Number(work_type_id)] : []

  const primaryTypeId = typeIds.length > 0 ? typeIds[0] : null
  const taskNumber = 'TASK-' + Date.now()
  const workClass = work_class || 'cable_install'

  // 작업일: 등록 시간 기준으로 자동 설정 (KST = UTC+9)
  const now = new Date()
  const kstOffset = 9 * 60 * 60 * 1000
  const kstDate = new Date(now.getTime() + kstOffset)
  const workDate = kstDate.toISOString().slice(0, 10) // YYYY-MM-DD

  // construction_id가 있으면 공사 테이블에서 request_no / work_number 자동 연동
  // (tasks.request_no가 비어 있는 경우 공사 정보로 채움)
  if (construction_id && !request_no) {
    try {
      const conRow = await c.env.DB.prepare(
        'SELECT request_no, work_number FROM constructions WHERE id = ?'
      ).bind(construction_id).first<any>()
      if (conRow?.request_no) {
        // body의 request_no / work_number에 공사 정보 반영
        body.request_no = conRow.request_no
        body.work_number = body.work_number || conRow.work_number || ''
      }
    } catch(_) {}
  }
  const finalRequestNo = body.request_no || request_no || ''
  const finalWorkNumber = body.work_number || work_number || ''

  let result: any
  try {
    result = await c.env.DB.prepare(
      `INSERT INTO tasks (task_number, title, description, category_id, work_type_id, location,
       planned_date, planned_quantity, quantity_unit, supervisor_id, priority, notes, created_by, status, work_class_new,
       work_date, work_order_address, construction_type, request_no, contractor_name, risk_level, high_subtypes, lgu_supervisor, work_number,
       construction_id, sub_task_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(taskNumber, title, description || '', category_id || null, primaryTypeId,
      location || '', planned_date || null, planned_quantity || 0, quantity_unit || '개',
      supervisor_id || null, priority || 'normal', notes || '', user.id,
      worker_ids && worker_ids.length > 0 ? 'assigned' : 'unassigned', workClass,
      workDate, work_order_address || location || '',
      construction_type || '', finalRequestNo, contractor_name || '',
      risk_level || 'normal', high_subtypes || '[]', lgu_supervisor || '', finalWorkNumber,
      construction_id || null, sub_task_number || ''
    ).run()
  } catch(insertErr: any) {
    console.error('[tasks/POST] INSERT 실패:', insertErr.message)
    // 컬럼 없음 또는 FK 참조 테이블 없음 에러: 최소 컬럼으로 재시도
    if (insertErr.message?.includes('no column') || insertErr.message?.includes('table tasks has no column')
        || insertErr.message?.includes('no such table') || insertErr.message?.includes('FOREIGN KEY')) {
      try {
        result = await c.env.DB.prepare(
          `INSERT INTO tasks (task_number, title, description, location,
           planned_date, quantity_unit, supervisor_id, priority, notes, created_by, status,
           work_date, work_order_address, construction_type, request_no, risk_level,
           construction_id, sub_task_number)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(taskNumber, title, description || '', location || '',
          planned_date || null, quantity_unit || '개',
          supervisor_id || null, priority || 'normal', notes || '', user.id,
          worker_ids && worker_ids.length > 0 ? 'assigned' : 'unassigned',
          workDate, work_order_address || location || '',
          construction_type || '', finalRequestNo, risk_level || 'normal',
          construction_id || null, sub_task_number || ''
        ).run()
        console.warn('[tasks/POST] 최소 컬럼으로 재시도 성공')
      } catch(fallbackErr: any) {
        console.error('[tasks/POST] 최소 컬럼 재시도도 실패:', fallbackErr.message)
        return c.json({ error: `작업 저장 실패: ${fallbackErr.message}` }, 500)
      }
    } else {
      return c.json({ error: `작업 저장 실패: ${insertErr.message}` }, 500)
    }
  }

  const taskId = result.meta.last_row_id as number

  // 다중 작업 유형 저장
  if (typeIds.length > 0) {
    await syncWorkTypes(c.env.DB, taskId, typeIds, user.id)
  }

  // ─── 팀장 배정 시 해당 팀 전체 자동 배정 ───────────────────────────────
  let finalWorkerIds: number[] = worker_ids && worker_ids.length > 0 ? [...worker_ids] : []

  if (finalWorkerIds.length > 0) {
    // 팀장 포함 시 팀원 자동 포함 — N+1 → 배치 쿼리
    const leaderPlaceholders = finalWorkerIds.map(() => '?').join(',')
    const leadersRes = await c.env.DB.prepare(
      `SELECT id, team_id FROM users WHERE id IN (${leaderPlaceholders}) AND is_leader = 1 AND team_id IS NOT NULL`
    ).bind(...finalWorkerIds).all<any>()
    const leaderTeamIds = (leadersRes.results || []).map((r: any) => r.team_id)

    if (leaderTeamIds.length > 0) {
      const teamPlaceholders = leaderTeamIds.map(() => '?').join(',')
      const memberExcludes   = finalWorkerIds.map(() => '?').join(',')
      const membersRes = await c.env.DB.prepare(
        `SELECT id FROM users WHERE team_id IN (${teamPlaceholders}) AND is_active = 1 AND id NOT IN (${memberExcludes})`
      ).bind(...leaderTeamIds, ...finalWorkerIds).all<any>()
      for (const tm of (membersRes.results || [])) {
        if (!finalWorkerIds.includes(tm.id)) finalWorkerIds.push(tm.id)
      }
    }

    // INSERT 배치 처리
    const assignPlaceholders = finalWorkerIds.map(() => '(?, ?, ?)').join(', ')
    const assignBinds: any[] = []
    for (const wid of finalWorkerIds) assignBinds.push(taskId, wid, user.id)
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO task_assignments (task_id, worker_id, assigned_by) VALUES ${assignPlaceholders}`
    ).bind(...assignBinds).run()

    // 상태 보정 (unassigned → assigned)
    await c.env.DB.prepare(
      `UPDATE tasks SET status = 'assigned' WHERE id = ? AND status = 'unassigned'`
    ).bind(taskId).run()
  }

  // ─── SSE: 작업 생성 알림 (관리자/감독자 전체 + 배정된 작업자)
  const taskPayload = {
    type: 'task_created',
    taskId,
    taskNumber,
    title,
    actor: user.name,
    message: `[작업 등록] ${user.name}님이 "${title}" 작업을 등록했습니다.`,
    ts: Date.now()
  }
  broadcastToRoles(['admin', 'supervisor'], taskPayload)
  // 배정된 작업자에게 개별 알림
  for (const wid of finalWorkerIds) {
    sendToUser(wid, {
      type: 'task_assigned',
      taskId,
      title,
      actor: user.name,
      message: `[작업 배정] "${title}" 작업이 배정되었습니다.`,
      ts: Date.now()
    })
  }

  // 공사 상태 자동 갱신
  if (construction_id) {
    // completed/settled 공사에 새 작업 추가 시 → in_progress로 명시 전환
    const conRow = await c.env.DB.prepare(
      'SELECT status FROM constructions WHERE id = ?'
    ).bind(construction_id).first<any>()
    if (conRow?.status === 'completed' || conRow?.status === 'settled' || conRow?.status === 'settlement_requested') {
      await c.env.DB.prepare(
        'UPDATE constructions SET status = \'in_progress\', updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(construction_id).run()
    } else {
      await refreshConstructionStatus(c.env.DB, construction_id)
    }
  }

  return c.json({ success: true, id: taskId, task_number: taskNumber })
})

// 작업 수정
app.put('/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json()
  const { title, description, category_id, work_type_ids, work_type_id,
    location, planned_date, planned_quantity, quantity_unit,
    supervisor_id, status, priority, notes, worker_ids, work_class,
    construction_type, request_no, contractor_name, risk_level, high_subtypes, lgu_supervisor, work_number } = body

  // 수정 전 기존 공사 ID 저장 (공사 상태 갱신에 사용)
  const prevTask = await c.env.DB.prepare(
    'SELECT construction_id, COALESCE(work_class_new, work_class, \'cable_install\') as work_class_cur, status FROM tasks WHERE id=?'
  ).bind(id).first<any>()
  const oldConId: number | null = prevTask?.construction_id ?? null

  // work_type_ids 배열 또는 단일 work_type_id 지원
  const typeIds: number[] = Array.isArray(work_type_ids)
    ? work_type_ids.filter(Boolean).map(Number)
    : work_type_id ? [Number(work_type_id)] : []

  const primaryTypeId = typeIds.length > 0 ? typeIds[0] : null

  // 기존값 조회 (body에 없으면 기존값 유지)
  // work_date, work_order_address는 수정 불가 (최초 등록 시 자동 설정)
  const finalWorkClass = work_class || prevTask?.work_class_cur || 'cable_install'
  const finalStatus = status || prevTask?.status || 'unassigned'

  // 수정 후 body에 포함된 새 공사 ID
  const newConId: number | null = (body.construction_id != null) ? Number(body.construction_id) : oldConId

  try {
    await c.env.DB.prepare(
      `UPDATE tasks SET title=?, description=?, category_id=?, work_type_id=?, location=?,
       planned_date=?, planned_quantity=?, quantity_unit=?, supervisor_id=?, status=?,
       priority=?, notes=?, work_class_new=?,
       construction_type=?, request_no=?, contractor_name=?, risk_level=?, high_subtypes=?, lgu_supervisor=?, work_number=?,
       updated_at=CURRENT_TIMESTAMP WHERE id=?`
      /* work_date, work_order_address 는 의도적으로 제외 → 수정 불가 */
    ).bind(title, description || '', category_id || null, primaryTypeId, location || '',
      planned_date || null, planned_quantity || 0, quantity_unit || '개', supervisor_id || null,
      finalStatus, priority || 'normal', notes || '', finalWorkClass,
      construction_type || '', request_no || '', contractor_name || '',
      risk_level || 'normal', high_subtypes || '[]', lgu_supervisor || '', work_number || '', id
    ).run()
  } catch(updateErr: any) {
    console.error('[tasks/PUT] UPDATE 실패:', updateErr.message)
    return c.json({ error: `수정 저장 실패: ${updateErr.message}` }, 500)
  }

  // 다중 작업 유형 동기화 (task_work_types 테이블 없으면 무시)
  try {
    await syncWorkTypes(c.env.DB, parseInt(id), typeIds, user.id)
  } catch(syncErr: any) {
    console.warn('[tasks/PUT] syncWorkTypes 실패 (무시):', syncErr.message)
  }

  // 작업자 재배정 (팀장 배정 시 팀원 자동 포함) — N+1 → 배치 쿼리
  if (worker_ids !== undefined) {
    try {
      await c.env.DB.prepare('DELETE FROM task_assignments WHERE task_id = ?').bind(id).run()
    } catch(e: any) { console.warn('[tasks/PUT] task_assignments DELETE 실패 (무시):', e.message) }

    let finalWorkerIds: number[] = [...worker_ids]

    if (worker_ids.length > 0) {
      try {
        // 팀장 정보 일괄 조회 (N+1 → 1회 IN 쿼리)
        const leaderPlaceholders = worker_ids.map(() => '?').join(',')
        const leadersRes = await c.env.DB.prepare(
          `SELECT id, team_id FROM users WHERE id IN (${leaderPlaceholders}) AND is_leader = 1 AND team_id IS NOT NULL`
        ).bind(...worker_ids).all<any>()
        const leaderTeamIds = (leadersRes.results || []).map((r: any) => r.team_id)

        if (leaderTeamIds.length > 0) {
          const teamPlaceholders = leaderTeamIds.map(() => '?').join(',')
          const memberExcludes   = worker_ids.map(() => '?').join(',')
          const membersRes = await c.env.DB.prepare(
            `SELECT id FROM users WHERE team_id IN (${teamPlaceholders}) AND is_active = 1 AND id NOT IN (${memberExcludes})`
          ).bind(...leaderTeamIds, ...worker_ids).all<any>()
          for (const tm of (membersRes.results || [])) {
            if (!finalWorkerIds.includes(tm.id)) finalWorkerIds.push(tm.id)
          }
        }

        // INSERT 배치 처리
        const assignPlaceholders = finalWorkerIds.map(() => '(?, ?, ?)').join(', ')
        const assignBinds: any[] = []
        for (const wid of finalWorkerIds) assignBinds.push(id, wid, user.id)
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO task_assignments (task_id, worker_id, assigned_by) VALUES ${assignPlaceholders}`
        ).bind(...assignBinds).run()

        // 상태 보정: unassigned 상태인 경우 → assigned 로 전환
        await c.env.DB.prepare(
          `UPDATE tasks SET status='assigned', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='unassigned'`
        ).bind(id).run()
      } catch(assignErr: any) {
        console.warn('[tasks/PUT] task_assignments INSERT 실패 (무시):', assignErr.message)
      }
    } else {
      try {
        // worker_ids = [] (전원 제거): 배정 없으면 unassigned로 되돌림
        await c.env.DB.prepare(
          `UPDATE tasks SET status='unassigned', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='assigned'`
        ).bind(id).run()
      } catch(e: any) { console.warn('[tasks/PUT] unassigned 상태 복귀 실패 (무시):', e.message) }
    }
  }

  // 공사 상태 자동 갱신 (기존 공사 + 새 공사)
  try {
    const conIds = new Set<number>([oldConId, newConId].filter(Boolean) as number[])
    for (const cid of conIds) await refreshConstructionStatus(c.env.DB, cid)
  } catch(conErr: any) {
    console.warn('[tasks/PUT] refreshConstructionStatus 실패 (무시):', conErr.message)
  }

  return c.json({ success: true })
})

// ── 작업자 재배정 전용 API (진행 전 상태에서 작업자 교체) ──────────────────────
// PATCH /tasks/:id/workers  { worker_ids: number[] }
// 허용 상태: unassigned / assigned / in_progress / tbm_done (작업 개시 전)
app.patch('/:id/workers', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  const { worker_ids } = body

  if (!Array.isArray(worker_ids)) return c.json({ error: 'worker_ids 배열 필요' }, 400)

  const task = await c.env.DB.prepare('SELECT id, status FROM tasks WHERE id = ?').bind(id).first<any>()
  if (!task) return c.json({ error: '작업 없음' }, 404)

  // working 이후 상태에서는 재배정 불가
  const BLOCKED = ['working', 'work_completed', 'completed']
  if (BLOCKED.includes(task.status)) return c.json({ error: '작업 개시 이후에는 작업자 재배정이 불가합니다.' }, 409)

  // 기존 배정 전체 삭제
  await c.env.DB.prepare('DELETE FROM task_assignments WHERE task_id = ?').bind(id).run()

  if (worker_ids.length > 0) {
    // 팀장 배정 시 팀원 자동 포함
    let finalWorkerIds: number[] = [...worker_ids]
    const leaderPlaceholders = worker_ids.map(() => '?').join(',')
    const leadersRes = await c.env.DB.prepare(
      `SELECT id, team_id FROM users WHERE id IN (${leaderPlaceholders}) AND is_leader = 1 AND team_id IS NOT NULL`
    ).bind(...worker_ids).all<any>()
    const leaderTeamIds = (leadersRes.results || []).map((r: any) => r.team_id)
    if (leaderTeamIds.length > 0) {
      const teamPh  = leaderTeamIds.map(() => '?').join(',')
      const excPh   = worker_ids.map(() => '?').join(',')
      const members = await c.env.DB.prepare(
        `SELECT id FROM users WHERE team_id IN (${teamPh}) AND is_active = 1 AND id NOT IN (${excPh})`
      ).bind(...leaderTeamIds, ...worker_ids).all<any>()
      for (const m of (members.results || [])) {
        if (!finalWorkerIds.includes(m.id)) finalWorkerIds.push(m.id)
      }
    }

    const ph = finalWorkerIds.map(() => '(?,?,?)').join(',')
    const binds: any[] = []
    for (const wid of finalWorkerIds) binds.push(id, wid, user.id)
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO task_assignments (task_id, worker_id, assigned_by) VALUES ${ph}`
    ).bind(...binds).run()

    // 상태 보정: unassigned → assigned
    await c.env.DB.prepare(
      `UPDATE tasks SET status='assigned', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='unassigned'`
    ).bind(id).run()

    // 재배정된 작업자에게 SSE + 알림
    const taskRow = await c.env.DB.prepare('SELECT title FROM tasks WHERE id=?').bind(id).first<any>()
    const taskTitle = taskRow?.title || `작업 #${id}`
    const { sendToUser } = await import('../sse')
    for (const wid of finalWorkerIds) {
      sendToUser(wid, {
        type: 'task_assigned', taskId: Number(id),
        title: `[작업 재배정] ${taskTitle}`,
        message: `"${taskTitle}" 작업에 재배정되었습니다.`,
        ts: Date.now()
      })
      await c.env.DB.prepare(
        `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read) VALUES (?,?,?,?,?,'task',0)`
      ).bind(wid, 'task_assigned', `[작업 재배정] ${taskTitle}`, `"${taskTitle}" 작업에 재배정되었습니다.`, id).run()
    }
  } else {
    // 전원 제거 → unassigned / in_progress 이상은 유지
    await c.env.DB.prepare(
      `UPDATE tasks SET status='unassigned', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='assigned'`
    ).bind(id).run()
  }

  // 재배정 후 최신 작업자 목록 반환
  const workers = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.position FROM task_assignments ta JOIN users u ON u.id = ta.worker_id WHERE ta.task_id = ?`
  ).bind(id).all<any>()
  return c.json({ success: true, assigned_workers: workers.results || [] })
})

// KST 현재 시각 문자열 반환 (YYYY-MM-DD HH:MM:SS)
function kstNow(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().replace('T', ' ').slice(0, 19)
}

// 작업일지 작성용 TBM 정보 조회 (최신 TBM 1건)
app.get('/:id/tbm-info', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  // 해당 작업의 가장 최신 TBM 레코드 조회 (attendees 포함)
  const tbm = await c.env.DB.prepare(
    `SELECT id, location, gps_address, gps_lat, gps_lon, created_at, tbm_date, attendees
     FROM tbm_records
     WHERE task_id = ? AND status = 'completed'
     ORDER BY created_at DESC LIMIT 1`
  ).bind(id).first<any>()

  if (!tbm) return c.json({ tbm: null })

  // TBM 완료시각 KST 변환
  // tbm_records.created_at 은 CURRENT_TIMESTAMP(SQLite UTC)로 저장되므로 +9h 적용
  let tbmDate = ''
  let tbmTime = ''
  if (tbm.created_at) {
    // SQLite CURRENT_TIMESTAMP는 UTC로 저장됨 → +09:00 강제 부여 후 KST 변환
    const raw = tbm.created_at.replace(' ', 'T')
    // 이미 timezone 정보가 붙어 있으면 그대로, 없으면 UTC로 간주하고 +9h
    const hasOffset = raw.includes('+') || raw.endsWith('Z')
    const utcStr = hasOffset ? raw : raw + 'Z'  // UTC로 명시
    const utcMs = new Date(utcStr).getTime()
    const kstMs = utcMs + 9 * 60 * 60 * 1000
    const kstDt = new Date(kstMs).toISOString() // 내부적으로 UTC지만 이미 +9h 적용됨
    tbmDate = kstDt.slice(0, 10)   // YYYY-MM-DD
    tbmTime = kstDt.slice(11, 16)  // HH:MM
  }

  // attendees 파싱 (JSON 문자열 → 배열)
  let attendees: string[] = []
  try { attendees = tbm.attendees ? JSON.parse(tbm.attendees) : [] } catch(_) {}

  // attendees가 비어있으면 task_assignments에서 배정 근로자 이름으로 대체
  if (attendees.length === 0) {
    try {
      const assigned = await c.env.DB.prepare(
        `SELECT u.name FROM task_assignments ta
         JOIN users u ON u.id = ta.worker_id
         WHERE ta.task_id = ?`
      ).bind(id).all<any>()
      attendees = (assigned.results || []).map((r: any) => r.name).filter(Boolean)
    } catch(_) {}
  }

  return c.json({
    tbm: {
      id: tbm.id,
      address: tbm.gps_address || tbm.location || '',
      tbm_date: tbmDate,
      tbm_time: tbmTime,
      created_at: tbm.created_at,
      attendees  // ← tbm_records.attendees 또는 task_assignments 배정 근로자 이름
    }
  })
})

// 작업 상태 변경
app.patch('/:id/status', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const body = await c.req.json()
  const { status, location } = body

  // 상태별 타임스탬프 자동 기록
  const tsNow = kstNow()
  if (status === 'in_progress' || status === 'working') {
    // 작업 개시: work_started_at (최초 1회만)
    const existing = await c.env.DB.prepare(
      'SELECT work_started_at FROM tasks WHERE id=?'
    ).bind(id).first<any>()
    if (!existing?.work_started_at) {
      await c.env.DB.prepare(
        'UPDATE tasks SET status=?, work_started_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
      ).bind(status, tsNow, id).run()
    } else {
      await c.env.DB.prepare(
        'UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
      ).bind(status, id).run()
    }
    // 작업개시 시점 GPS/위치를 confirmed_address로 갱신 (provided)
    if (status === 'working' && location) {
      await c.env.DB.prepare(
        `UPDATE tasks SET confirmed_address=?, confirmed_address_source='working', confirmed_address_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(location, tsNow, id).run()
    }
  } else if (status === 'work_completed') {
    // 작업 완료 (일지 작성 전 단계): work_completed_at 기록, 일지작성 필요 표시
    await c.env.DB.prepare(
      'UPDATE tasks SET status=?, work_completed_at=?, work_log_required=1, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(status, tsNow, id).run()
  } else if (status === 'completed') {
    // 최종 완료 (일지 작성 완료 후): work_log_required 해제
    await c.env.DB.prepare(
      'UPDATE tasks SET status=?, work_log_required=0, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(status, id).run()
  } else {
    await c.env.DB.prepare(
      'UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(status, id).run()
  }

  // ─── SSE: 작업 상태 변경 알림
  try {
    const taskRow = await c.env.DB.prepare(
      `SELECT t.title, t.supervisor_id, t.work_number, t.sub_task_number, t.task_number,
              u.name as supervisor_name,
              GROUP_CONCAT(ta.worker_id) as worker_ids
       FROM tasks t
       LEFT JOIN users u ON u.id = t.supervisor_id
       LEFT JOIN task_assignments ta ON ta.task_id = t.id
       WHERE t.id = ? GROUP BY t.id`
    ).bind(id).first<any>()

    const statusLabel: Record<string, string> = {
      unassigned: '미배정', assigned: '배정완료', working: '작업중',
      in_progress: '진행중', tbm_done: 'TBM완료', work_completed: '작업완료',
      completed: '완료', cancelled: '취소'
    }
    const sLabel = statusLabel[status] || status

    // 작업번호 표시 (WKS-######-#####-####)
    const taskNumDisplay = taskRow?.work_number
      ? (taskRow.sub_task_number ? `${taskRow.work_number}-${taskRow.sub_task_number}` : taskRow.work_number)
      : (taskRow?.task_number || String(id))

    const ssePayload = {
      type: 'task_status',
      taskId: Number(id),
      status,
      statusLabel: sLabel,
      actor: user.name,
      title: taskRow?.title || '',
      message: `[작업상태] "${taskRow?.title || id}": ${user.name}님이 상태를 [${sLabel}]로 변경했습니다.`,
      ts: Date.now()
    }
    // 관리자/감독자에게 브로드캐스트
    broadcastToRoles(['admin', 'supervisor'], ssePayload)

    // ─── 모든 상태변경 → admin/supervisor DB 저장 (배지 카운트 유지용)
    try {
      const notifTitle = `작업 상태 변경: ${sLabel}`
      const notifMsg   = ssePayload.message
      const adminUsers = await c.env.DB.prepare(
        `SELECT id FROM users WHERE role IN ('admin','supervisor') AND is_active=1`
      ).all<any>()
      if (adminUsers.results?.length > 0) {
        const insertStmt = c.env.DB.prepare(
          `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
           VALUES (?, 'task_status_change', ?, ?, ?, 'task', 0)`
        )
        await c.env.DB.batch(
          adminUsers.results
            .filter((u: any) => u.id !== user.id)
            .map((u: any) => insertStmt.bind(u.id, notifTitle, notifMsg, Number(id)))
        )
      }
    } catch(_) {}

    // 배정된 작업자들에게 개별 알림
    if (taskRow?.worker_ids) {
      const wids = String(taskRow.worker_ids).split(',').map(Number).filter(Boolean)
      for (const wid of wids) {
        if (wid !== user.id) sendToUser(wid, ssePayload)
      }
    }

    // ─── 체크리스트 완료 이후 단계 변경 시 → 관리감독자/총괄책임자/대표이사 알림
    const POST_CHECKLIST_STATUSES = ['tbm_done', 'working', 'work_completed', 'completed']
    if (POST_CHECKLIST_STATUSES.includes(status)) {
      const TARGET_POSITIONS = ['관리감독자', '총괄책임자', '대표이사']
      const placeholders = TARGET_POSITIONS.map(() => '?').join(',')

      // 대상 직책 사용자 조회
      const targetUsers = await c.env.DB.prepare(
        `SELECT id, name, position FROM users
         WHERE position IN (${placeholders}) AND is_active = 1`
      ).bind(...TARGET_POSITIONS).all<any>()

      if (targetUsers.results && targetUsers.results.length > 0) {
        const notifTitle  = `작업 상태 변경: ${sLabel}`
        const notifMsg    = `[${taskNumDisplay}] "${taskRow?.title || id}" 작업이 [${sLabel}] 단계로 변경되었습니다. (처리: ${user.name})`

        const managerPayload = {
          ...ssePayload,
          type: 'task_status_manager',
          message: notifMsg,
        }

        const targetIds = targetUsers.results.map((u: any) => u.id as number)

        // SSE 실시간 알림 (접속 중인 경우)
        sendToUsers(targetIds, managerPayload)

        // notifications 테이블에 영구 저장 (접속 여부 무관)
        const insertStmt = c.env.DB.prepare(
          `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
           VALUES (?, 'task_status_change', ?, ?, ?, 'task', 0)`
        )
        await c.env.DB.batch(
          targetIds.map((uid: number) =>
            insertStmt.bind(uid, notifTitle, notifMsg, Number(id))
          )
        )
      }
    }
  } catch (_) {}

  // 공사 상태 자동 갱신 (상태가 변경되면 공사 진척도 재계산)
  try {
    const conRow = await c.env.DB.prepare('SELECT construction_id FROM tasks WHERE id=?').bind(id).first<any>()
    if (conRow?.construction_id) {
      await refreshConstructionStatus(c.env.DB, conRow.construction_id)
    }
  } catch (_) {}

  return c.json({ success: true })
})

// 작업자 자기 배정 (작업자가 미배정 작업을 직접 선택)
app.post('/:id/self-assign', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = c.req.param('id')

  // 작업 확인
  const task = await c.env.DB.prepare('SELECT *, COALESCE(work_class_new, work_class, \'cable_install\') as work_class_cur FROM tasks WHERE id = ?').bind(id).first<any>()
  if (!task) return c.json({ error: '작업을 찾을 수 없습니다.' }, 404)

  // 이미 배정된 경우 worker도 배정 가능하지만 중복 방지
  const existing = await c.env.DB.prepare(
    'SELECT id FROM task_assignments WHERE task_id = ? AND worker_id = ?'
  ).bind(id, user.id).first<any>()

  if (!existing) {
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO task_assignments (task_id, worker_id, assigned_by) VALUES (?, ?, ?)'
    ).bind(id, user.id, user.id).run()
  }

  // 상태를 assigned로 변경 (미배정인 경우)
  if (task.status === 'unassigned') {
    await c.env.DB.prepare(
      'UPDATE tasks SET status=\'assigned\', updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(id).run()
  }

  // ─── SSE: 자기 배정 알림 (관리자/감독자에게)
  broadcastToRoles(['admin', 'supervisor'], {
    type: 'task_assigned',
    taskId: Number(id),
    title: task.title,
    actor: user.name,
    message: `[작업 배정] ${user.name}님이 "${task.title}" 작업을 자기 배정했습니다.`,
    ts: Date.now()
  })

  return c.json({ success: true })
})

// 작업 분류 변경 (광케이블 시설/광케이블 접속/장비 시설및 기타/관로시설)
app.patch('/:id/work-class', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const { work_class } = await c.req.json()
  const valid = ['cable_install', 'cable_splice', 'equipment_other', 'conduit']
  if (!valid.includes(work_class)) {
    return c.json({ error: 'work_class는 cable_install/cable_splice/equipment_other/conduit 중 하나여야 합니다.' }, 400)
  }
  await c.env.DB.prepare(
    'UPDATE tasks SET work_class_new=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).bind(work_class, id).run()
  return c.json({ success: true })
})

// 작업 삭제 — [FEAT-053] 시스템관리자 전용, 완료(completed/cancelled) 상태만 허용
// [FEAT-060] 등록자(created_by)는 unassigned/assigned 상태(위험성평가 전 단계)에서 추가 허용
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = c.req.param('id')

  const taskRow = await c.env.DB.prepare(`SELECT id, status, title, created_by FROM tasks WHERE id = ?`).bind(id).first<any>()
  if (!taskRow) return c.json({ error: '작업을 찾을 수 없습니다.' }, 404)

  const isSysAdmin = user.role === 'admin' && user.position === '시스템관리자'
  const isCreator  = user.id === taskRow.created_by

  // [FEAT-053] 시스템관리자: 완료(completed) 또는 취소(cancelled) 상태만 허용
  if (isSysAdmin) {
    if (taskRow.status !== 'completed' && taskRow.status !== 'cancelled') {
      return c.json({ error: `완료 또는 취소된 작업만 삭제할 수 있습니다. 현재 상태: ${taskRow.status}` }, 409)
    }
  } else if (isCreator) {
    // [FEAT-060] 등록자: 위험성평가 전 단계(unassigned/assigned)만 허용
    const PRE_CHECKLIST = ['unassigned', 'assigned']
    if (!PRE_CHECKLIST.includes(taskRow.status)) {
      return c.json({ error: `위험성(체크리스트)평가 이전 단계(작업지시·작업등록)의 작업만 삭제할 수 있습니다. 현재 상태: ${taskRow.status}` }, 409)
    }
  } else {
    return c.json({ error: '삭제 권한이 없습니다. 등록자 또는 시스템 관리자만 삭제할 수 있습니다.' }, 403)
  }

  // 테이블이 없을 수 있으므로 각 DELETE를 개별 try/catch로 처리
  // (마이그레이션 미적용 NAS 환경 대비)
  async function safeDelete(sql: string, ...params: any[]) {
    try {
      await c.env.DB.prepare(sql).bind(...params).run()
    } catch(e: any) {
      // 테이블 없음 / 컬럼 없음 에러는 무시, 그 외는 경고만
      if (!e.message?.includes('no such table') && !e.message?.includes('no such column')) {
        console.warn(`[task delete] safeDelete 경고: ${e.message} | SQL: ${sql.slice(0,80)}`)
      }
    }
  }

  try {
    // 연관 데이터 모두 삭제 (순서 중요 — FK 자식 테이블 먼저)
    // tbm_photo_sections는 checklist_assessments(assessment_id)에 연결됨
    await safeDelete('DELETE FROM tbm_photo_items WHERE section_id IN (SELECT id FROM tbm_photo_sections WHERE assessment_id IN (SELECT id FROM checklist_assessments WHERE task_id=?))', id)
    await safeDelete('DELETE FROM tbm_photo_sections WHERE assessment_id IN (SELECT id FROM checklist_assessments WHERE task_id=?)', id)
    await safeDelete('DELETE FROM checklist_responses WHERE assessment_id IN (SELECT id FROM checklist_assessments WHERE task_id=?)', id)
    await safeDelete('DELETE FROM checklist_assessments WHERE task_id = ?', id)
    // [BUG-087] tbm_records 삭제 전에 참조 자식 테이블 먼저 삭제 (FK constraint 방지)
    // tbm_signatures: REFERENCES tbm_records(id)
    await safeDelete('DELETE FROM tbm_signatures WHERE tbm_id IN (SELECT id FROM tbm_records WHERE task_id=?)', id)
    // tbm_share_tokens: tbm_id 참조
    await safeDelete('DELETE FROM tbm_share_tokens WHERE tbm_id IN (SELECT id FROM tbm_records WHERE task_id=?)', id)
    // signature_requests: ref_type='tbm', ref_id=tbm_id (FK 없지만 정합성)
    await safeDelete('DELETE FROM signature_requests WHERE ref_type=\'tbm\' AND ref_id IN (SELECT id FROM tbm_records WHERE task_id=?)', id)
    // notifications: ref_type='tbm', ref_id=tbm_id (FK 없지만 정합성)
    await safeDelete('DELETE FROM notifications WHERE ref_type=\'tbm\' AND ref_id IN (SELECT id FROM tbm_records WHERE task_id=?)', id)
    // tbm_records 본체 삭제
    await safeDelete('DELETE FROM tbm_records WHERE task_id = ?', id)
    await safeDelete('DELETE FROM task_stops WHERE task_id = ?', id)
    await safeDelete('DELETE FROM risk_assessment_details WHERE assessment_id IN (SELECT id FROM risk_assessments WHERE task_id=?)', id)
    await safeDelete('DELETE FROM risk_assessments WHERE task_id = ?', id)
    await safeDelete('DELETE FROM work_logs WHERE task_id = ?', id)
    await safeDelete('DELETE FROM task_photos WHERE task_id = ?', id)
    // 첨부파일 물리 삭제 후 DB 삭제
    try {
      const attRows = await c.env.DB.prepare('SELECT file_path FROM task_attachments WHERE task_id = ?').bind(id).all<any>()
      for (const att of (attRows.results || [])) {
        if (att.file_path) {
          try {
            // @ts-ignore
            const fs = await import('node:fs/promises')
            await fs.unlink(att.file_path)
          } catch (_) {}
        }
      }
    } catch(_) {}
    await safeDelete('DELETE FROM task_attachments WHERE task_id = ?', id)
    await safeDelete('DELETE FROM task_assignments WHERE task_id = ?', id)
    await safeDelete('DELETE FROM task_work_types WHERE task_id = ?', id)
    // tasks 자체 삭제 — 이것만 실패하면 에러 반환
    await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || '삭제 실패' }, 500)
  }
})

// 작업 분류 목록 (엑셀 기반 카테고리만, 위험항목 수 포함)
app.get('/meta/categories', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const cats = await c.env.DB.prepare(
    `SELECT wc.id, wc.name, wc.code, wc.description,
     COUNT(DISTINCT wt.id) as work_type_count,
     COUNT(DISTINCT rai.id) as risk_item_count
     FROM work_categories wc
     LEFT JOIN work_types wt ON wt.category_id = wc.id
     LEFT JOIN risk_assessment_items rai ON rai.work_type_id = wt.id AND rai.is_active = 1
     GROUP BY wc.id
     ORDER BY wc.id`
  ).all<any>()
  return c.json(cats.results || [])
})

// 작업 유형 목록 (카테고리별, 위험항목 수 포함)
app.get('/meta/types', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { category_id } = c.req.query()
  let q = `SELECT wt.id, wt.name, wt.code, wt.category_id,
    wc.name as category_name,
    COUNT(rai.id) as risk_item_count,
    SUM(CASE WHEN rai.before_risk_level IN ('높음','매우높음') THEN 1 ELSE 0 END) as high_risk_count
    FROM work_types wt
    LEFT JOIN work_categories wc ON wc.id = wt.category_id
    LEFT JOIN risk_assessment_items rai ON rai.work_type_id = wt.id AND rai.is_active = 1`
  const params: any[] = []
  if (category_id) { q += ' WHERE wt.category_id = ?'; params.push(category_id) }
  q += ' GROUP BY wt.id ORDER BY wt.name'
  const types = await c.env.DB.prepare(q).bind(...params).all<any>()
  return c.json(types.results || [])
})

// ── 작업중지 등록 ──────────────────────────────────────────────────────────────
app.post('/:id/stop', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = c.req.param('id')
  const task = await c.env.DB.prepare('SELECT id, status FROM tasks WHERE id=?').bind(id).first<any>()
  if (!task) return c.json({ error: '작업을 찾을 수 없습니다.' }, 404)

  const body = await c.req.json().catch(() => ({})) as any
  const { stop_category, stop_detail, notes, photo_data } = body

  if (!stop_category) return c.json({ error: '중지 유형을 선택해주세요.' }, 400)

  const validCategories = ['위험작업중지', '작업중단', '작업취소']
  if (!validCategories.includes(stop_category)) {
    return c.json({ error: '유효하지 않은 중지 유형입니다.' }, 400)
  }

  // 작업취소: stop_detail 불필요 (비고만)
  if (stop_category !== '작업취소' && !stop_detail) {
    return c.json({ error: '세부 사유를 선택해주세요.' }, 400)
  }

  const validDangerDetails = ['구조적위험', '설비위험', '화학적위험', '전기적위험', '환경적위험', '붕괴위험', '기타']
  const validStopDetails   = ['고객취소', '공사환경미비', '기타']
  if (stop_category === '위험작업중지' && stop_detail && !validDangerDetails.includes(stop_detail)) {
    return c.json({ error: '유효하지 않은 세부 사유입니다.' }, 400)
  }
  if (stop_category === '작업중단' && stop_detail && !validStopDetails.includes(stop_detail)) {
    return c.json({ error: '유효하지 않은 세부 사유입니다.' }, 400)
  }

  const stop_reason = stop_detail || '작업취소'

  // 작업취소 → cancelled(종료) / 나머지 → paused(일시중지)
  const newStatus = stop_category === '작업취소' ? 'cancelled' : 'paused'

  // task_stops 이력 저장 (컬럼 없을 경우 fallback: stop_reason만으로 INSERT)
  try {
    await c.env.DB.prepare(
      `INSERT INTO task_stops (task_id, reported_by, stop_category, stop_detail, stop_reason, notes, photo_data, stopped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(id, user.id, stop_category, stop_detail || '작업취소', stop_reason, notes || null, photo_data || null).run()
  } catch(insertErr: any) {
    console.warn('[tasks/stop] task_stops 상세 INSERT 실패, 기본 컬럼으로 재시도:', insertErr.message)
    try {
      await c.env.DB.prepare(
        `INSERT INTO task_stops (task_id, stop_reason, notes, stopped_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(id, stop_reason, notes || null).run()
    } catch(fallbackErr: any) {
      // task_stops 저장 실패는 무시하고 status 업데이트는 진행
      console.error('[tasks/stop] task_stops fallback INSERT도 실패 (무시):', fallbackErr.message)
    }
  }

  // tasks.status 업데이트 (CHECK 제약 문제 시 상세 에러 반환)
  try {
    await c.env.DB.prepare(
      `UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(newStatus, id).run()
  } catch(statusErr: any) {
    console.error('[tasks/stop] tasks.status 업데이트 실패:', statusErr.message)
    return c.json({ error: `작업 상태 업데이트 실패: ${statusErr.message}` }, 500)
  }

  // 작업취소 시 공사 완료 여부 재계산
  if (stop_category === '작업취소') {
    try {
      const conRow = await c.env.DB.prepare('SELECT construction_id FROM tasks WHERE id=?').bind(id).first<any>()
      if (conRow?.construction_id) {
        await refreshConstructionStatus(c.env.DB, conRow.construction_id)
      }
    } catch (_) {}
  }

  // SSE 알림
  try {
    const taskRow = (await c.env.DB.prepare(
      `SELECT t.title, GROUP_CONCAT(ta.worker_id) as worker_ids
       FROM tasks t LEFT JOIN task_assignments ta ON ta.task_id = t.id
       WHERE t.id = ? GROUP BY t.id`
    ).bind(id).first()) as any
    const { sendToUser, broadcastToRoles } = await import('../sse')
    const sseMsg = stop_category === '작업취소'
      ? `[작업취소] "${taskRow?.title || id}" 작업이 취소(종료)되었습니다.`
      : `[작업중지] "${taskRow?.title || id}" 작업이 중지되었습니다.`
    const ssePayload = {
      type: stop_category === '작업취소' ? 'task_cancelled' : 'task_stopped',
      taskId: Number(id), status: newStatus,
      title: stop_category === '작업취소' ? `[작업취소] ${taskRow?.title||''}` : `[작업중지] ${taskRow?.title||''}`,
      message: sseMsg, ts: Date.now()
    }
    broadcastToRoles(['admin', 'supervisor'], ssePayload)
    if (taskRow?.worker_ids) {
      const wids = String(taskRow.worker_ids).split(',').map(Number).filter(Boolean)
      for (const wid of wids) sendToUser(wid, ssePayload)
    }
  } catch (_) {}

  return c.json({ success: true, category: stop_category, detail: stop_detail, status: newStatus })
})

// ── 작업중지 이력 조회 ─────────────────────────────────────────────────────────
app.get('/:id/stops', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = c.req.param('id')
  try {
    const stops = await c.env.DB.prepare(
      `SELECT ts.*, u.name as reporter_name, u.position as reporter_position
       FROM task_stops ts
       LEFT JOIN users u ON u.id = ts.reported_by
       WHERE ts.task_id = ?
       ORDER BY ts.stopped_at DESC`
    ).bind(id).all<any>()
    return c.json(stops.results || [])
  } catch(e: any) {
    console.warn('[tasks/:id/stops] task_stops 쿼리 실패:', e.message)
    return c.json([])
  }
})

// ── 작업자 개별 추가 (관리자/감독자 전용) ─────────────────────────────────────
// POST /tasks/:id/workers  { worker_id: number }
app.post('/:id/workers', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json()
  const { worker_id } = body
  if (!worker_id) return c.json({ error: 'worker_id 필요' }, 400)

  const task = await c.env.DB.prepare('SELECT id, status, title FROM tasks WHERE id = ?').bind(id).first<any>()
  if (!task) return c.json({ error: '작업 없음' }, 404)

  // 이미 배정된 경우 중복 방지
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO task_assignments (task_id, worker_id, assigned_by) VALUES (?, ?, ?)'
  ).bind(id, worker_id, user.id).run()

  // 미배정 상태면 assigned로 변경
  if (task.status === 'unassigned') {
    await c.env.DB.prepare(
      "UPDATE tasks SET status='assigned', updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(id).run()
  }

  // SSE: 배정받은 작업자에게 알림
  sendToUser(worker_id, {
    type: 'task_assigned',
    taskId: Number(id),
    title: task.title,
    actor: user.name,
    message: `[작업 배정] "${task.title}" 작업에 배정되었습니다.`,
    ts: Date.now()
  })

  return c.json({ success: true })
})

// ── 작업자 개별 제거 (관리자/감독자 전용, 미착수 작업자만) ────────────────────
// DELETE /tasks/:id/workers/:workerId
app.delete('/:id/workers/:workerId', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const workerId = c.req.param('workerId')

  const task = await c.env.DB.prepare('SELECT id, status, title FROM tasks WHERE id = ?').bind(id).first<any>()
  if (!task) return c.json({ error: '작업 없음' }, 404)

  // 착수 이후(in_progress~completed) 상태에서는 제거 불가
  const progressStatuses = ['in_progress', 'tbm_done', 'working', 'work_completed', 'completed']
  if (progressStatuses.includes(task.status)) {
    return c.json({ error: '작업이 이미 진행 중이어서 작업자를 제거할 수 없습니다.' }, 409)
  }

  await c.env.DB.prepare(
    'DELETE FROM task_assignments WHERE task_id = ? AND worker_id = ?'
  ).bind(id, workerId).run()

  // 남은 배정 작업자 확인 → 없으면 unassigned 로 복귀
  const remaining = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM task_assignments WHERE task_id = ?'
  ).bind(id).first<any>()
  if ((remaining?.cnt ?? 0) === 0 && task.status === 'assigned') {
    await c.env.DB.prepare(
      "UPDATE tasks SET status='unassigned', updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(id).run()
  }

  return c.json({ success: true })
})

// ── 작업 단계(steps) API — task_steps 테이블이 없는 경우 빈 배열 반환 ──────────
// NAS 구버전 앱에서 GET /api/tasks/:id/steps 를 호출하는 경우 500 방지
app.get('/:id/steps', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  try {
    const rows = await c.env.DB.prepare(
      `SELECT * FROM task_steps WHERE task_id = ? ORDER BY step_order ASC, id ASC`
    ).bind(id).all<any>()
    return c.json(rows.results || [])
  } catch(_) {
    // task_steps 테이블이 없는 경우 빈 배열 반환
    return c.json([])
  }
})

export default app
