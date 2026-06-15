import { Hono } from 'hono'
import { getUser } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()


// 위험성 평가 목록
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { task_id, assessment_type, date_from, date_to, user_id } = c.req.query()
  const params: any[] = []
  const conditions: string[] = []
  if (task_id)        { conditions.push('ra.task_id = ?');         params.push(task_id) }
  if (assessment_type){ conditions.push('ra.assessment_type = ?'); params.push(assessment_type) }
  if (user_id)        { conditions.push('ra.assessor_id = ?');     params.push(user_id) }
  if (date_from)      { conditions.push("date(ra.created_at) >= ?"); params.push(date_from) }
  if (date_to)        { conditions.push("date(ra.created_at) <= ?"); params.push(date_to) }
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''
  const order = ' ORDER BY ra.created_at DESC'

  // GPS 컬럼 포함 쿼리 먼저 시도 — 컬럼 없으면 fallback
  let rows: any[] = []
  try {
    const q = `SELECT ra.*, t.title as task_title, t.status as task_status,
      t.gps_lat, t.gps_lon, t.gps_address,
      t.confirmed_address, t.work_order_address, t.location as task_location,
      u.name as assessor_name, wt.name as work_type_name
      FROM risk_assessments ra
      LEFT JOIN tasks t ON t.id = ra.task_id
      LEFT JOIN work_types wt ON wt.id = t.work_type_id
      LEFT JOIN users u ON u.id = ra.assessor_id${where}${order}`
    const result = await c.env.DB.prepare(q).bind(...params).all<any>()
    rows = result.results || []
  } catch(_) {
    // GPS 컬럼 없는 구버전 DB — NULL 로 채워 반환
    const q = `SELECT ra.*, t.title as task_title, t.status as task_status,
      NULL as gps_lat, NULL as gps_lon, NULL as gps_address,
      t.confirmed_address, t.work_order_address, t.location as task_location,
      u.name as assessor_name, wt.name as work_type_name
      FROM risk_assessments ra
      LEFT JOIN tasks t ON t.id = ra.task_id
      LEFT JOIN work_types wt ON wt.id = t.work_type_id
      LEFT JOIN users u ON u.id = ra.assessor_id${where}${order}`
    const result = await c.env.DB.prepare(q).bind(...params).all<any>()
    rows = result.results || []
  }
  return c.json(rows)
})

// 위험성 평가 상세
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const ra = await c.env.DB.prepare(
    `SELECT ra.*, t.title as task_title,
     COALESCE(ra.location, t.location) as location,
     wt.name as work_type_name,
     u.name as assessor_name
     FROM risk_assessments ra
     LEFT JOIN tasks t ON t.id = ra.task_id
     LEFT JOIN work_types wt ON wt.id = t.work_type_id
     LEFT JOIN users u ON u.id = ra.assessor_id
     WHERE ra.id = ?`
  ).bind(id).first<any>()
  if (!ra) return c.json({ error: '평가 없음' }, 404)
  const details = await c.env.DB.prepare(
    'SELECT * FROM risk_assessment_details WHERE assessment_id = ? ORDER BY id'
  ).bind(id).all<any>()
  ra.details = details.results || []

  // 평가위원 목록도 함께 반환
  const members = await c.env.DB.prepare(
    `SELECT ram.id, ram.user_id, ram.role, ram.assigned_at,
     u.name, u.position, u.department
     FROM risk_assessment_members ram
     JOIN users u ON u.id = ram.user_id
     WHERE ram.assessment_id = ?
     ORDER BY CASE ram.role WHEN 'chair' THEN 0 ELSE 1 END, ram.assigned_at`
  ).bind(id).all<any>()
  ra.members = members.results || []

  return c.json(ra)
})

// 위험성 평가 생성
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const body = await c.req.json()
  // assessment_type: 'task'(기본,작업별), 'periodic'(정기), 'adhoc'(수시)
  const { task_id, weather, temperature, workers_count, notes, details,
          assessment_type, title, location, work_type, source_adhoc_ids } = body
  const aType = assessment_type || 'task'

  const result = await c.env.DB.prepare(
    `INSERT INTO risk_assessments
     (task_id, assessor_id, weather, temperature, workers_count, notes, status, assessment_type, title, location, source_adhoc_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    task_id || null, user.id,
    weather || '', temperature || '', workers_count || 1, notes || '',
    'draft', aType,
    title || null,
    location || null,
    source_adhoc_ids || null
  ).run()

  const assessmentId = result.meta.last_row_id

  if (details && details.length > 0) {
    for (const d of details) {
      await c.env.DB.prepare(
        `INSERT INTO risk_assessment_details (assessment_id, item_id, category, hazard, risk_factor,
         before_frequency, before_severity, before_risk_level, control_measures,
         after_frequency, after_severity, after_risk_level, is_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(assessmentId, d.item_id || null, d.category || '', d.hazard || '', d.risk_factor || '',
        d.before_frequency || 3, d.before_severity || 3, d.before_risk_level || '보통',
        d.control_measures || '', d.after_frequency || 1, d.after_severity || 2, d.after_risk_level || '낮음',
        d.is_confirmed ? 1 : 0
      ).run()
    }
  }

  // 작업별 평가인 경우에만 작업 상태 업데이트
  if (task_id && aType === 'task') {
    await c.env.DB.prepare("UPDATE tasks SET status='in_progress', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(task_id).run()

    // confirmed_address 갱신: 위험성평가에서 입력된 location이 있으면 최신 주소로 기록
    if (location) {
      const nowKst = (() => {
        const d = new Date(); const k = new Date(d.getTime() + 9*60*60*1000);
        return k.toISOString().replace('T',' ').slice(0,19);
      })();
      await c.env.DB.prepare(
        `UPDATE tasks SET confirmed_address=?, confirmed_address_source='risk', confirmed_address_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(location, nowKst, task_id).run();
    }
  }

  return c.json({ success: true, id: assessmentId })
})

// ─── 위험성 평가 삭제 ────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  // 완료(completed) 상태는 삭제 불가
  const row = await c.env.DB.prepare(
    `SELECT status FROM risk_assessments WHERE id=?`
  ).bind(id).first<any>()
  if (!row) return c.json({ error: '존재하지 않습니다.' }, 404)
  if (row.status === 'completed') return c.json({ error: '완료된 위험성평가는 삭제할 수 없습니다.' }, 400)
  // 연관 데이터 먼저 삭제
  await c.env.DB.prepare(`DELETE FROM risk_assessment_details  WHERE assessment_id=?`).bind(id).run()
  await c.env.DB.prepare(`DELETE FROM risk_assessment_members  WHERE assessment_id=?`).bind(id).run()
  await c.env.DB.prepare(`DELETE FROM risk_assessments         WHERE id=?`).bind(id).run()
  return c.json({ success: true })
})

// ─── 임시 저장 (draft/in_review/measures_done: 회의일자·장소·메모 저장) ──────
app.patch('/:id/save-draft', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  const { meeting_date, meeting_place, notes } = body
  await c.env.DB.prepare(
    `UPDATE risk_assessments
     SET meeting_date  = COALESCE(?, meeting_date),
         meeting_place = COALESCE(?, meeting_place),
         review_notes  = COALESCE(?, review_notes)
     WHERE id = ?`
  ).bind(meeting_date || null, meeting_place || null, notes || null, id).run()
  return c.json({ success: true })
})

// 위험성 평가 완료
app.patch('/:id/complete', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  await c.env.DB.prepare("UPDATE risk_assessments SET status='completed' WHERE id=?").bind(id).run()
  return c.json({ success: true })
})

// ─── 워크플로우 상태 전이 ────────────────────────────────────────────────────
// 수시: draft → in_review → measures_done → completed
// 정기: draft → in_review → measures_done → completed

// 상태 전이: draft → in_review (평가위원 선정 완료 → 감소대책 수립 시작)
app.patch('/:id/start-review', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const { meeting_date, meeting_place } = body as any
  await c.env.DB.prepare(
    `UPDATE risk_assessments
     SET status='in_review',
         meeting_date=?, meeting_place=?
     WHERE id=?`
  ).bind(meeting_date || null, meeting_place || null, id).run()
  return c.json({ success: true })
})

// 상태 전이: in_review → measures_done (감소대책 수립 완료 → 최종 위험도 선정)
app.patch('/:id/finish-measures', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const { review_notes } = body as any
  await c.env.DB.prepare(
    `UPDATE risk_assessments SET status='measures_done', review_notes=? WHERE id=?`
  ).bind(review_notes || null, id).run()
  return c.json({ success: true })
})

// 상태 전이: measures_done → completed (최종 위험도 확정)
app.patch('/:id/finalize', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const { final_notes, details } = body as any

  // 최종 위험도 일괄 업데이트
  if (details && Array.isArray(details)) {
    for (const d of details) {
      const ff = Number(d.final_frequency) || 1
      const fs_ = Number(d.final_severity) || 1
      function rl(s: number) {
        if (s <= 4) return '낮음'; if (s <= 9) return '보통';
        if (s <= 16) return '높음'; return '중대'
      }
      await c.env.DB.prepare(
        `UPDATE risk_assessment_details
         SET final_frequency=?, final_severity=?, final_risk_level=?,
             member_measures=?, is_final=1
         WHERE id=? AND assessment_id=?`
      ).bind(ff, fs_, rl(ff * fs_), d.member_measures || null, d.id, id).run()
    }
  }

  await c.env.DB.prepare(
    `UPDATE risk_assessments
     SET status='completed', final_notes=?, review_date=date('now')
     WHERE id=?`
  ).bind(final_notes || null, id).run()
  return c.json({ success: true })
})

// 평가위원 조회
app.get('/:id/members', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const result = await c.env.DB.prepare(
    `SELECT ram.id, ram.assessment_id, ram.user_id, ram.role, ram.assigned_at,
     u.name, u.position, u.department, u.role as user_role
     FROM risk_assessment_members ram
     JOIN users u ON u.id = ram.user_id
     WHERE ram.assessment_id = ?
     ORDER BY CASE ram.role WHEN 'chair' THEN 0 ELSE 1 END, ram.assigned_at`
  ).bind(id).all<any>()
  return c.json(result.results || [])
})

// 평가위원 일괄 추가 (체크박스 방식)
app.post('/:id/members/bulk', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  // members: [{ user_id, role }]
  const members: { user_id: number; role: string }[] = body.members || []
  if (!members.length) return c.json({ error: '선택된 위원이 없습니다.' }, 400)

  let added = 0
  let skipped = 0
  for (const m of members) {
    if (!m.user_id) continue
    try {
      await c.env.DB.prepare(
        `INSERT INTO risk_assessment_members (assessment_id, user_id, role) VALUES (?, ?, ?)`
      ).bind(id, m.user_id, m.role || 'member').run()
      added++
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) skipped++
      else throw e
    }
  }
  return c.json({ success: true, added, skipped })
})

// 평가위원 추가 (단건)
app.post('/:id/members', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json()
  const { user_id, role } = body
  if (!user_id) return c.json({ error: 'user_id 필요' }, 400)
  try {
    const r = await c.env.DB.prepare(
      `INSERT INTO risk_assessment_members (assessment_id, user_id, role)
       VALUES (?, ?, ?)`
    ).bind(id, user_id, role || 'member').run()
    return c.json({ success: true, id: r.meta.last_row_id })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 추가된 위원입니다.' }, 409)
    throw e
  }
})

// 평가위원 삭제
app.delete('/:id/members/:memberId', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const { id, memberId } = c.req.param()
  await c.env.DB.prepare(
    'DELETE FROM risk_assessment_members WHERE id=? AND assessment_id=?'
  ).bind(memberId, id).run()
  return c.json({ success: true })
})

// 평가 세부항목 감소대책 업데이트 (위원 입력)
app.patch('/:id/details/:detailId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { id, detailId } = c.req.param()
  const body = await c.req.json()
  const { member_measures, control_measures } = body
  await c.env.DB.prepare(
    `UPDATE risk_assessment_details
     SET member_measures=?, control_measures=COALESCE(?, control_measures)
     WHERE id=? AND assessment_id=?`
  ).bind(member_measures || null, control_measures || null, detailId, id).run()
  return c.json({ success: true })
})

// 수시평가 목록 (정기평가 검토용) — adhoc + task 타입만
app.get('/adhoc/for-review', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const result = await c.env.DB.prepare(
    `SELECT ra.id, ra.assessment_type, ra.title, ra.assessment_date,
     ra.status, ra.location, ra.workers_count,
     u.name as assessor_name,
     COUNT(rad.id) as detail_count,
     SUM(CASE WHEN rad.before_risk_level IN ('높음','매우높음') THEN 1 ELSE 0 END) as high_risk_count,
     SUM(CASE WHEN rad.is_final=1 THEN 1 ELSE 0 END) as final_count
     FROM risk_assessments ra
     LEFT JOIN users u ON u.id = ra.assessor_id
     LEFT JOIN risk_assessment_details rad ON rad.assessment_id = ra.id
     WHERE ra.assessment_type IN ('adhoc','task')
     GROUP BY ra.id
     ORDER BY ra.created_at DESC
     LIMIT 100`
  ).all<any>()
  return c.json(result.results || [])
})



// 작업 카테고리 목록 조회 (엑셀 기반 표준 데이터 포함)
app.get('/categories/list', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const result = await c.env.DB.prepare(
    `SELECT wc.id, wc.name, wc.code, wc.description,
     COUNT(wt.id) as work_type_count
     FROM work_categories wc
     LEFT JOIN work_types wt ON wt.category_id = wc.id
     GROUP BY wc.id ORDER BY wc.name`
  ).all<any>()
  return c.json(result.results || [])
})

// 카테고리별 작업 유형 조회
app.get('/categories/:category_id/types', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const category_id = c.req.param('category_id')
  const result = await c.env.DB.prepare(
    `SELECT wt.id, wt.name, wt.code, wt.description,
     COUNT(rai.id) as item_count
     FROM work_types wt
     LEFT JOIN risk_assessment_items rai ON rai.work_type_id = wt.id AND rai.is_active = 1
     WHERE wt.category_id = ?
     GROUP BY wt.id ORDER BY wt.name`
  ).bind(category_id).all<any>()
  return c.json(result.results || [])
})

// 작업 유형별 위험성 평가 항목 조회 (엑셀 기반 표준 데이터)
app.get('/items/by-type', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { work_type_id, work_type_code, category_code } = c.req.query()
  
  let q = `SELECT rai.*, wt.name as work_type_name, wt.code as work_type_code,
    wc.name as category_name, wc.code as category_code
    FROM risk_assessment_items rai
    LEFT JOIN work_types wt ON wt.id = rai.work_type_id
    LEFT JOIN work_categories wc ON wc.id = wt.category_id
    WHERE rai.is_active = 1`
  const params: any[] = []

  if (work_type_id) {
    q += ' AND (rai.work_type_id = ? OR rai.work_type_id IS NULL)'
    params.push(work_type_id)
  } else if (work_type_code) {
    q += ' AND wt.code = ?'
    params.push(work_type_code)
  } else if (category_code) {
    q += ' AND wc.code = ?'
    params.push(category_code)
  }
  
  q += ' ORDER BY rai.category, rai.id'
  const result = await c.env.DB.prepare(q).bind(...params).all<any>()
  return c.json(result.results || [])
})

// 위험성평가 표준 양식 조회 (작업유형 선택 시 전체 표준 항목 반환)
app.get('/items/standard-form', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { work_type_id } = c.req.query()
  if (!work_type_id) return c.json({ error: 'work_type_id 필요' }, 400)
  
  const result = await c.env.DB.prepare(
    `SELECT rai.*,
     wt.name as work_type_name,
     wc.name as category_name
     FROM risk_assessment_items rai
     LEFT JOIN work_types wt ON wt.id = rai.work_type_id
     LEFT JOIN work_categories wc ON wc.id = wt.category_id
     WHERE rai.work_type_id = ? AND rai.is_active = 1
     ORDER BY rai.category, rai.before_risk_level DESC, rai.id`
  ).bind(work_type_id).all<any>()

  const items = result.results || []

  // 카테고리별 그룹화
  const grouped: Record<string, any[]> = {}
  for (const item of items) {
    const cat = item.category || '기타'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  }

  return c.json({
    work_type_id,
    total: items.length,
    grouped,
    items
  })
})

// 전체 작업유형 + 위험항목 수 요약
app.get('/items/summary', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const result = await c.env.DB.prepare(
    `SELECT wc.name as category_name, wc.code as category_code,
     wt.id as work_type_id, wt.name as work_type_name, wt.code as work_type_code,
     COUNT(rai.id) as item_count,
     SUM(CASE WHEN rai.before_risk_level IN ('높음','매우높음') THEN 1 ELSE 0 END) as high_risk_count
     FROM work_types wt
     JOIN work_categories wc ON wc.id = wt.category_id
     LEFT JOIN risk_assessment_items rai ON rai.work_type_id = wt.id AND rai.is_active = 1
     GROUP BY wt.id ORDER BY wc.name, wt.name`
  ).all<any>()
  return c.json(result.results || [])
})

// 작업유형별 실제 위험성평가 이력 조회 (정기/수시 구분)
// GET /risk/items/by-type/assessments?work_type_id=17&assessment_type=periodic
app.get('/items/by-type/assessments', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const { work_type_id, assessment_type } = c.req.query()
  if (!work_type_id) return c.json({ error: 'work_type_id 필요' }, 400)

  const params: any[] = [Number(work_type_id)]
  let typeFilter = ''
  if (assessment_type) {
    typeFilter = ' AND ra.assessment_type = ?'
    params.push(assessment_type)
  }

  // 1) 해당 work_type을 가진 작업(task) 기반 평가 이력
  const taskBased = await c.env.DB.prepare(`
    SELECT ra.id, ra.assessment_type, ra.title, ra.assessment_date,
           ra.status, ra.workers_count, ra.weather, ra.temperature, ra.notes,
           ra.location, ra.task_id,
           t.title as task_title,
           wt.name as work_type_name,
           u.name as assessor_name,
           COUNT(rad.id) as detail_count,
           SUM(CASE WHEN rad.before_risk_level IN ('높음','매우높음') THEN 1 ELSE 0 END) as high_risk_count
    FROM risk_assessments ra
    JOIN tasks t ON t.id = ra.task_id
    LEFT JOIN work_types wt ON wt.id = t.work_type_id
    LEFT JOIN users u ON u.id = ra.assessor_id
    LEFT JOIN risk_assessment_details rad ON rad.assessment_id = ra.id
    WHERE t.work_type_id = ?${typeFilter}
    GROUP BY ra.id
    ORDER BY ra.created_at DESC
    LIMIT 50
  `).bind(...params).all<any>()

  // 2) work_type_id가 없는 정기/수시 평가 중 제목이나 연결이 없는 것 (task_id IS NULL)
  //    → work_type 직접 연결이 없으므로 표준항목 기반으로만 연결되는 케이스
  const standaloneBased = await c.env.DB.prepare(`
    SELECT ra.id, ra.assessment_type, ra.title, ra.assessment_date,
           ra.status, ra.workers_count, ra.weather, ra.temperature, ra.notes,
           ra.location, ra.task_id,
           NULL as task_title,
           NULL as work_type_name,
           u.name as assessor_name,
           COUNT(rad.id) as detail_count,
           SUM(CASE WHEN rad.before_risk_level IN ('높음','매우높음') THEN 1 ELSE 0 END) as high_risk_count
    FROM risk_assessments ra
    LEFT JOIN users u ON u.id = ra.assessor_id
    LEFT JOIN risk_assessment_details rad ON rad.assessment_id = ra.id
    WHERE ra.task_id IS NULL
      AND ra.assessment_type IN ('periodic','adhoc')
      ${assessment_type ? 'AND ra.assessment_type = ?' : ''}
    GROUP BY ra.id
    ORDER BY ra.created_at DESC
    LIMIT 20
  `).bind(...(assessment_type ? [assessment_type] : [])).all<any>()

  const allAssessments = [
    ...(taskBased.results || []),
    ...(standaloneBased.results || [])
  ]

  return c.json({
    work_type_id: Number(work_type_id),
    assessments: allAssessments,
    total: allAssessments.length
  })
})

// ─── 분류별 위험성 평가 항목 관리 ────────────────────────────────────────────

// 작업 유형별 위험성 평가 항목 전체 조회 (항목 관리용)
app.get('/items/manage', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const { category_id, work_type_id } = c.req.query()

  let query = `SELECT rai.*, wt.name as work_type_name, wc.name as category_name
     FROM risk_assessment_items rai
     JOIN work_types wt ON wt.id = rai.work_type_id
     JOIN work_categories wc ON wc.id = wt.category_id
     WHERE rai.is_active = 1`
  const params: any[] = []

  if (work_type_id) {
    query += ' AND rai.work_type_id = ?'
    params.push(Number(work_type_id))
  } else if (category_id) {
    query += ' AND wt.category_id = ?'
    params.push(Number(category_id))
  }

  query += ' ORDER BY wc.name, wt.name, rai.category, rai.id'

  const result = await c.env.DB.prepare(query).bind(...params).all<any>()
  return c.json({ items: result.results || [] })
})

// 위험성 평가 항목 단건 추가
app.post('/items/manage', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  const body = await c.req.json()
  const { work_type_id, category, hazard, risk_factor,
    before_frequency, before_severity, control_measures,
    after_frequency, after_severity, responsible } = body

  if (!work_type_id || !hazard) return c.json({ error: 'work_type_id, hazard 필요' }, 400)

  const bf = Number(before_frequency) || 1
  const bs = Number(before_severity) || 1
  const af = Number(after_frequency) || 1
  const as_ = Number(after_severity) || 1

  function riskLevel(score: number) {
    if (score <= 4) return '낮음'
    if (score <= 9) return '보통'
    if (score <= 16) return '높음'
    return '중대'
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO risk_assessment_items
     (work_type_id, category, hazard, risk_factor,
      before_frequency, before_severity, before_risk_level,
      control_measures, after_frequency, after_severity, after_risk_level,
      responsible, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`
  ).bind(
    Number(work_type_id), category || '', hazard, risk_factor || '',
    bf, bs, riskLevel(bf * bs),
    control_measures || '', af, as_, riskLevel(af * as_),
    responsible || '관리감독자'
  ).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// 위험성 평가 항목 수정
app.put('/items/manage/:itemId', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  const itemId = c.req.param('itemId')
  const body = await c.req.json()
  const { category, hazard, risk_factor,
    before_frequency, before_severity, control_measures,
    after_frequency, after_severity, responsible } = body

  const bf = Number(before_frequency) || 1
  const bs = Number(before_severity) || 1
  const af = Number(after_frequency) || 1
  const as_ = Number(after_severity) || 1

  function riskLevel(score: number) {
    if (score <= 4) return '낮음'
    if (score <= 9) return '보통'
    if (score <= 16) return '높음'
    return '중대'
  }

  await c.env.DB.prepare(
    `UPDATE risk_assessment_items SET
     category=?, hazard=?, risk_factor=?,
     before_frequency=?, before_severity=?, before_risk_level=?,
     control_measures=?, after_frequency=?, after_severity=?, after_risk_level=?,
     responsible=?
     WHERE id=?`
  ).bind(
    category || '', hazard, risk_factor || '',
    bf, bs, riskLevel(bf * bs),
    control_measures || '', af, as_, riskLevel(af * as_),
    responsible || '관리감독자',
    Number(itemId)
  ).run()

  return c.json({ success: true })
})

// 위험성 평가 항목 비활성화(삭제)
app.delete('/items/manage/:itemId', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자만 삭제 가능합니다.' }, 403)
  const itemId = c.req.param('itemId')
  await c.env.DB.prepare(
    'UPDATE risk_assessment_items SET is_active=0 WHERE id=?'
  ).bind(Number(itemId)).run()
  return c.json({ success: true })
})

export default app
