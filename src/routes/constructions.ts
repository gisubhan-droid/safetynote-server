import { Hono } from 'hono'
import { getUser } from '../utils'
import { sendToUser } from '../sse'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ─── 공사 목록 조회 ──────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { status, start_date, end_date, year, month, keyword } = c.req.query()
    // 다중 담당자: manager_names[] 배열 파라미터 (쉼표 구분 또는 반복 키)
    const rawManagerNames = c.req.queries('manager_names') || []
    // 쉼표로 join된 단일 값도 지원 (프론트 전송 방식 호환)
    const managerNames = rawManagerNames.flatMap((n: string) => n.split(',').map((s: string) => s.trim())).filter(Boolean)

    const params: any[] = []
    const wheres: string[] = []

    if (status) { wheres.push('c.status = ?'); params.push(status) }
    // 공사담당자 다중 이름 OR LIKE: users.name(FK) 또는 manager_name(직접입력) 모두 포함
    if (managerNames.length) {
      const orClauses = managerNames.map(() => '(u.name LIKE ? OR c.manager_name LIKE ?)').join(' OR ')
      wheres.push(`(${orClauses})`)
      managerNames.forEach((n: string) => { const mk = `%${n}%`; params.push(mk, mk) })
    }

    // 기간 필터: 월 기준 or 범위
    if (year && month) {
      const y = year, m = String(month).padStart(2, '0')
      wheres.push("strftime('%Y-%m', c.created_at) = ?")
      params.push(`${y}-${m}`)
    } else if (year) {
      wheres.push("strftime('%Y', c.created_at) = ?")
      params.push(year)
    } else if (start_date && end_date) {
      wheres.push("date(c.created_at) BETWEEN ? AND ?")
      params.push(start_date, end_date)
    }

    if (keyword) {
      wheres.push('(c.request_no LIKE ? OR c.title LIKE ? OR c.work_number LIKE ?)')
      const kw = `%${keyword}%`
      params.push(kw, kw, kw)
    }

    const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : ''

    const rows = await c.env.DB.prepare(`
      SELECT c.*,
        COALESCE(c.is_auto_request_no, 0) AS is_auto_request_no,
        u.name  AS manager_display_name,
        cb.name AS created_by_name,
        COUNT(t.id)                             AS task_total,
        SUM(CASE WHEN t.status NOT IN ('completed','cancelled') AND t.status IS NOT NULL THEN 1 ELSE 0 END) AS task_in_progress,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS task_completed
      FROM constructions c
      LEFT JOIN users u  ON u.id  = c.manager_id
      LEFT JOIN users cb ON cb.id = c.created_by
      LEFT JOIN tasks t  ON t.construction_id = c.id
      ${where}
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).bind(...params).all<any>()

    return c.json(rows.results || [])
  } catch (e: any) {
    return c.json({ error: e.message || '공사 목록 조회 실패' }, 500)
  }
})

// ─── 공사 단건 조회 (+ 연결된 작업 목록 포함) ───────────────────────────────
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  try {
    const con = await c.env.DB.prepare(`
      SELECT c.*,
        u.name  AS manager_display_name,
        cb.name AS created_by_name
      FROM constructions c
      LEFT JOIN users u  ON u.id  = c.manager_id
      LEFT JOIN users cb ON cb.id = c.created_by
      WHERE c.id = ?
    `).bind(id).first<any>()

    if (!con) return c.json({ error: '공사 없음' }, 404)

    // 연결된 작업 목록
    const tasks = await c.env.DB.prepare(`
      SELECT t.id, t.task_number, t.sub_task_number, t.title, t.status,
             t.work_order_address, t.work_class_new, t.risk_level,
             t.planned_date, t.created_at,
             wt.name AS work_type_name,
             u.name  AS supervisor_name
      FROM tasks t
      LEFT JOIN work_types wt ON wt.id = t.work_type_id
      LEFT JOIN users u       ON u.id  = t.supervisor_id
      WHERE t.construction_id = ?
      ORDER BY t.sub_task_number ASC, t.id ASC
    `).bind(id).all<any>()

    con.tasks = tasks.results || []
    return c.json(con)
  } catch (e: any) {
    return c.json({ error: e.message || '공사 단건 조회 실패' }, 500)
  }
})

// ─── 공사 요청번호로 조회 (작업 생성 시 자동 연동용) ─────────────────────────
app.get('/by-request-no/:reqNo', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const reqNo = c.req.param('reqNo')

  try {
    const con = await c.env.DB.prepare(`
      SELECT c.*, u.name AS manager_display_name
      FROM constructions c
      LEFT JOIN users u ON u.id = c.manager_id
      WHERE c.request_no = ?
    `).bind(reqNo).first<any>()

    if (!con) return c.json({ error: '해당 공사요청번호 없음' }, 404)
    return c.json(con)
  } catch (e: any) {
    return c.json({ error: e.message || '공사 요청번호 조회 실패' }, 500)
  }
})

// ─── 공사 생성 ───────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor') {
    return c.json({ error: '권한 없음' }, 403)
  }

  const body = await c.req.json<any>()
  const { request_no, work_number, work_class, title, work_order_address, manager_id, manager_name, supervisor_name, description, is_auto_request_no } = body

  if (!request_no || !title) return c.json({ error: '공사요청번호와 공사명은 필수입니다' }, 400)

  // 요청번호 형식 검증: 숫자 12자리
  if (!/^\d{12}$/.test(request_no)) {
    return c.json({ error: '공사요청번호는 숫자 12자리여야 합니다' }, 400)
  }
  // 작업번호 형식 검증: WKS-######-##### (입력된 경우)
  if (work_number && !/^WKS-\d{6}-\d{5}$/.test(work_number)) {
    return c.json({ error: '작업번호 형식: WKS-######-#####' }, 400)
  }
  // 공사종류 유효값 검증 — CON_TYPE_DEF key 목록과 동기화 필요
  // app.js CON_TYPE_DEF 에 항목 추가 시 이 배열도 함께 추가할 것
  const VALID_WORK_CLASS = ['relocation', 'subscription', 'conduit', 'environment', 'separate', 'other']
  if (work_class && !VALID_WORK_CLASS.includes(work_class)) {
    return c.json({ error: '공사종류 값이 올바르지 않습니다' }, 400)
  }

  // [v0.143 LGU+] 자동부여 여부 (1=자동부여, 0=수동입력)
  const autoReqNo = is_auto_request_no ? 1 : 0

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO constructions
        (request_no, work_number, work_class, title, work_order_address, manager_id, manager_name, supervisor_name, description, created_by, is_auto_request_no)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      request_no,
      work_number || '',
      work_class || 'relocation',
      title,
      work_order_address || '',
      manager_id || null,
      manager_name || '',
      supervisor_name || '',
      description || '',
      user.id,
      autoReqNo
    ).run()

    const newId = result.meta.last_row_id
    const con = await c.env.DB.prepare('SELECT * FROM constructions WHERE id = ?').bind(newId).first<any>()
    return c.json(con, 201)
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) {
      return c.json({ error: '이미 존재하는 공사요청번호입니다' }, 409)
    }
    return c.json({ error: '공사 생성 실패', detail: e?.message }, 500)
  }
})

// ─── 공사 수정 ───────────────────────────────────────────────────────────────
app.put('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor') {
    return c.json({ error: '권한 없음' }, 403)
  }

  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const { work_number, work_class, title, work_order_address, manager_id, manager_name, supervisor_name, description } = body

  if (work_number && !/^WKS-\d{6}-\d{5}$/.test(work_number)) {
    return c.json({ error: '작업번호 형식: WKS-######-#####' }, 400)
  }
  // 공사종류 유효값 검증
  const VALID_WORK_CLASS_PUT = ['relocation', 'subscription', 'conduit', 'environment', 'separate', 'other']
  if (work_class && !VALID_WORK_CLASS_PUT.includes(work_class)) {
    return c.json({ error: '공사종류 값이 올바르지 않습니다' }, 400)
  }

  try {
    // 현재값 조회 (work_class 미입력 시 기존값 유지)
    const existing = await c.env.DB.prepare('SELECT work_class FROM constructions WHERE id = ?').bind(id).first<any>()

    await c.env.DB.prepare(`
      UPDATE constructions SET
        work_number        = ?,
        work_class         = ?,
        title              = ?,
        work_order_address = ?,
        manager_id         = ?,
        manager_name       = ?,
        supervisor_name    = ?,
        description        = ?,
        updated_at         = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      work_number || '',
      work_class || existing?.work_class || 'relocation',
      title || '',
      work_order_address || '',
      manager_id || null,
      manager_name || '',
      supervisor_name || '',
      description || '',
      id
    ).run()

    const con = await c.env.DB.prepare('SELECT * FROM constructions WHERE id = ?').bind(id).first<any>()
    return c.json(con)
  } catch (e: any) {
    return c.json({ error: e.message || '공사 수정 실패' }, 500)
  }
})

// ─── 공사 상태 자동 갱신 헬퍼 (내부 호출용 export) ──────────────────────────
// 공사 상태 전이 규칙 (5단계):
//   registered           → 연결 작업 없음
//   in_progress          → 작업 1건 이상, 아직 모두 completed 아님
//   completed            → 연결된 모든 작업이 completed 상태
//   settlement_requested → 정산요청 클릭 후 (이 함수에서 절대 덮어쓰지 않음)
//   settled              → 정산완료 클릭 후 (이 함수에서 절대 덮어쓰지 않음)
export async function refreshConstructionStatus(db: D1Database, constructionId: number) {
  // settlement_requested / settled 상태는 이 함수에서 절대 변경하지 않음
  const con = await db.prepare(
    'SELECT status FROM constructions WHERE id = ?'
  ).bind(constructionId).first<any>()
  if (!con) return
  if (con.status === 'settlement_requested' || con.status === 'settled') return

  const stats = await db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_cnt,
      SUM(CASE WHEN status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS active_cnt
    FROM tasks
    WHERE construction_id = ? AND status != 'cancelled'
  `).bind(constructionId).first<any>()

  const total        = Number(stats?.total        ?? 0)
  const completedCnt = Number(stats?.completed_cnt ?? 0)
  const activeCnt    = Number(stats?.active_cnt    ?? 0)

  let newStatus: string
  if (total === 0) {
    // 연결된 유효 작업 없음 → 등록 상태 유지
    newStatus = 'registered'
  } else if (completedCnt === total) {
    // 모든 작업 완료
    newStatus = 'completed'
  } else {
    // 1건이라도 완료되지 않은 작업 존재 → 진행 중
    newStatus = 'in_progress'
  }

  // 현재 상태와 같으면 불필요한 UPDATE 생략
  if (con.status === newStatus) return

  await db.prepare(`
    UPDATE constructions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(newStatus, constructionId).run()
}

// ─── 정산요청 (completed → settlement_requested) ────────────────────────────
app.post('/:id/settle', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = parseInt(c.req.param('id'))

  try {
    const con = await c.env.DB.prepare('SELECT * FROM constructions WHERE id = ?').bind(id).first<any>()
    if (!con) return c.json({ error: '공사 없음' }, 404)
    if (con.status !== 'completed') {
      return c.json({ error: '모든 작업이 완료된 경우에만 정산요청 가능합니다' }, 400)
    }

    // settlement_requested 상태로 변경
    await c.env.DB.prepare(`
      UPDATE constructions SET status = 'settlement_requested', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()

    // ─── 정산담당자 알림 발송 (실패해도 정산요청 성공에 영향 없음) ──────────
    try {
      const conName   = con.title || `공사 #${id}`
      const actorName = user.name || '담당자'
      const notifTitle = '정산요청 접수'
      const notifMsg   = `[정산요청] "${conName}" 공사가 완료되어 정산요청이 접수되었습니다. 처리를 확인해 주세요.`

      const settlers = await c.env.DB.prepare(`
        SELECT id, name FROM users WHERE position = '정산담당자' AND is_active = 1
      `).all<{ id: number; name: string }>()

      for (const settler of settlers.results) {
        try {
          await c.env.DB.prepare(`
            INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type)
            VALUES (?, 'settlement_request', ?, ?, ?, 'construction')
          `).bind(settler.id, notifTitle, notifMsg, id).run()
        } catch (notifErr: any) {
          console.warn('[constructions POST /:id/settle] 알림 INSERT 실패 (무시):', notifErr.message)
        }

        sendToUser(settler.id, {
          type:    'settlement_request',
          conId:   id, conName, actor: actorName,
          title:   notifTitle, message: notifMsg, ts: Date.now(),
        })
      }

      return c.json({ success: true, message: '정산요청이 완료되었습니다', notified: settlers.results.length })
    } catch (notifErr: any) {
      console.warn('[constructions POST /:id/settle] 알림 발송 실패 (무시):', notifErr.message)
      return c.json({ success: true, message: '정산요청이 완료되었습니다', notified: 0 })
    }
  } catch (e: any) {
    return c.json({ error: e.message || '정산요청 처리 실패' }, 500)
  }
})

// ─── 정산요청 취소 (settlement_requested → completed) ────────────────────────
app.post('/:id/settle-cancel', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = parseInt(c.req.param('id'))

  try {
    const con = await c.env.DB.prepare('SELECT * FROM constructions WHERE id = ?').bind(id).first<any>()
    if (!con) return c.json({ error: '공사 없음' }, 404)
    if (con.status !== 'settlement_requested') {
      return c.json({ error: '정산요청 상태인 공사만 취소할 수 있습니다' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE constructions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()

    return c.json({ success: true, message: '정산요청이 취소되었습니다. 공사가 현장완료 상태로 돌아갔습니다.' })
  } catch (e: any) {
    return c.json({ error: e.message || '정산요청 취소 실패' }, 500)
  }
})

// ─── 정산완료 (settlement_requested → settled) ───────────────────────────────
app.post('/:id/settle-complete', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = parseInt(c.req.param('id'))

  try {
    const con = await c.env.DB.prepare('SELECT * FROM constructions WHERE id = ?').bind(id).first<any>()
    if (!con) return c.json({ error: '공사 없음' }, 404)
    if (con.status !== 'settlement_requested') {
      return c.json({ error: '정산요청 상태인 공사만 정산완료 처리 가능합니다' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE constructions SET status = 'settled', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()

    return c.json({ success: true, message: '정산완료 처리되었습니다' })
  } catch (e: any) {
    return c.json({ error: e.message || '정산완료 처리 실패' }, 500)
  }
})

// ─── [TASK-001] 공사 삭제 ────────────────────────────────────────────────────
// 연결된 tasks 존재 시 409 차단
// [FEAT-053] 공사 삭제 — 시스템관리자 전용, 완료(completed/settled) 상태만 허용
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  // [FEAT-053] 시스템관리자만 삭제 가능
  const isSysAdmin = user.role === 'admin' && user.position === '시스템관리자'
  if (!isSysAdmin) return c.json({ error: '시스템 관리자만 삭제할 수 있습니다.' }, 403)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: '잘못된 ID' }, 400)

  try {
    const con = await c.env.DB.prepare(`SELECT id, title, status FROM constructions WHERE id = ?`).bind(id).first<any>()
    if (!con) return c.json({ error: '공사 없음' }, 404)

    // [FEAT-053] 완료(completed) 또는 정산완료(settled) 상태만 삭제 허용
    if (con.status !== 'completed' && con.status !== 'settled') {
      return c.json({
        error: `완료되거나 정산완료된 공사만 삭제할 수 있습니다. 현재 상태: ${con.status}`
      }, 409)
    }

    // 연결 작업 존재 여부 확인 — 모든 작업이 completed/cancelled 인 경우만 허용
    const linked = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM tasks WHERE construction_id = ? AND status NOT IN ('completed','cancelled')`
    ).bind(id).first<any>()
    if ((linked?.cnt ?? 0) > 0) {
      return c.json({
        error: `진행 중인 작업이 ${linked.cnt}건 있어 삭제할 수 없습니다. 작업을 먼저 완료하거나 취소해 주세요.`
      }, 409)
    }

    await c.env.DB.prepare(`DELETE FROM constructions WHERE id = ?`).bind(id).run()
    return c.json({ success: true, message: `"${con.title}" 공사가 삭제되었습니다.` })
  } catch (e: any) {
    return c.json({ error: e.message || '삭제 실패' }, 500)
  }
})

export default app
