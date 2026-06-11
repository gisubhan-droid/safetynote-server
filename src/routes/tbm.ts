import { Hono } from 'hono'
import { getUser } from '../utils'
import { sendToUser } from '../sse'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()


// TBM 목록
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { task_id } = c.req.query()
  let q = `SELECT tbm.*, t.title as task_title, t.task_number, t.contractor_name,
                   u.name as conductor_name, u.position as conductor_position
    FROM tbm_records tbm
    LEFT JOIN tasks t ON t.id = tbm.task_id
    LEFT JOIN users u ON u.id = tbm.conductor_id`
  const params: any[] = []
  if (task_id) { q += ' WHERE tbm.task_id = ?'; params.push(task_id) }
  q += ' ORDER BY tbm.created_at DESC'
  const result = await c.env.DB.prepare(q).bind(...params).all<any>()
  const records = result.results || []
  return c.json(records.map((r: any) => ({ ...r, attendees: r.attendees ? JSON.parse(r.attendees) : [] })))
})

// TBM 상세
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const tbm = await c.env.DB.prepare(
    `SELECT tbm.*, t.title as task_title, t.location, t.task_number, t.contractor_name,
            u.name as conductor_name, u.position as conductor_position
     FROM tbm_records tbm
     LEFT JOIN tasks t ON t.id = tbm.task_id
     LEFT JOIN users u ON u.id = tbm.conductor_id
     WHERE tbm.id = ?`
  ).bind(id).first<any>()
  if (!tbm) return c.json({ error: 'TBM 없음' }, 404)
  tbm.attendees = tbm.attendees ? JSON.parse(tbm.attendees) : []
  return c.json(tbm)
})

// TBM 생성
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const body = await c.req.json()
  const { task_id, location, weather, temperature, workers_count, attendees,
    safety_topics, precautions, special_notes, signature_data,
    gps_address, gps_lat, gps_lon } = body

  const result = await c.env.DB.prepare(
    `INSERT INTO tbm_records (task_id, conductor_id, location, weather, temperature, workers_count,
     attendees, safety_topics, precautions, special_notes, signature_data, status,
     gps_address, gps_lat, gps_lon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(task_id, user.id, location || '', weather || '', temperature || '',
    workers_count || 1, JSON.stringify(attendees || []),
    safety_topics || '', precautions || '', special_notes || '',
    signature_data || '', 'completed',
    gps_address || null, gps_lat || null, gps_lon || null
  ).run()

  // 작업 상태 업데이트: TBM 완료 → tbm_done (워크플로우: 체크리스트→TBM→작업진행)
  await c.env.DB.prepare("UPDATE tasks SET status='tbm_done', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(task_id).run()

  // ── TBM 완료 시 안전관리자에게 결재 서명 요청 알림 ─────────────────────────
  const tbmId = result.meta.last_row_id
  const taskRow = await c.env.DB.prepare(`SELECT title, task_number FROM tasks WHERE id = ?`).bind(task_id).first<any>()
  const tbmTitle = `TBM: ${taskRow?.title || task_id}`
  const safetyUsers = await c.env.DB.prepare(
    `SELECT id, name FROM users WHERE position = '안전관리자' AND is_active = 1`
  ).all<any>()
  for (const su of (safetyUsers.results || [])) {
    // signature_requests 에 중복 방지 후 삽입
    const alreadyReq = await c.env.DB.prepare(
      `SELECT id FROM signature_requests WHERE ref_type='tbm' AND ref_id=? AND ref_sub_type='approval_safety' AND target_user_id=? AND status='pending'`
    ).bind(tbmId, su.id).first()
    if (!alreadyReq) {
      const reqResult = await c.env.DB.prepare(`
        INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
        VALUES ('tbm', ?, 'approval_safety', ?, ?, ?, ?)
      `).bind(tbmId, `[결재요청] ${tbmTitle}`, `TBM이 완료되었습니다. 안전관리자 서명을 요청합니다.`, user.id, su.id).run()
      // SSE 실시간 알림
      sendToUser(su.id, {
        type: 'sign_request', id: reqResult.meta.last_row_id,
        title: `[TBM 결재요청] ${tbmTitle}`,
        requester: user.name, ref_type: 'tbm', ref_sub_type: 'approval_safety',
        message: `[TBM 완료] TBM이 등록되었습니다. 안전관리자 서명을 요청합니다.`,
        ts: Date.now()
      })
      // notifications 영구 저장
      await c.env.DB.prepare(`
        INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
        VALUES (?, 'sign_request', ?, ?, ?, 'tbm', 0)
      `).bind(su.id, `[TBM 결재요청] ${tbmTitle}`, `TBM이 등록되었습니다. 안전관리자 서명을 요청합니다.`, tbmId).run()
    }
  }

  // ── confirmed_address 갱신: GPS 주소 우선, 없으면 location 텍스트 사용 ────
  const tbmConfirmedAddr = gps_address || location || ''
  if (tbmConfirmedAddr) {
    const tbmConfirmedNow = (() => {
      const d = new Date(); const k = new Date(d.getTime() + 9*60*60*1000);
      return k.toISOString().replace('T',' ').slice(0,19);
    })();
    await c.env.DB.prepare(
      `UPDATE tasks SET confirmed_address=?, confirmed_address_source='tbm', confirmed_address_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(tbmConfirmedAddr, tbmConfirmedNow, task_id).run();
  }

  // ── 작업 시작 주소 / 시작 일시 자동 기입 ──────────────────────────────────
  // TBM GPS 주소가 있고, tasks.work_start_address 가 아직 비어 있으면 기입
  // (체크리스트에서 이미 기입된 경우 덮어쓰지 않음)
  const tbmNow = new Date()
  const tbmKst = new Date(tbmNow.getTime() + 9 * 60 * 60 * 1000)
  const tbmTs = tbmKst.toISOString().replace('T', ' ').slice(0, 19)

  if (gps_address) {
    const taskRowAddr = await c.env.DB.prepare(
      `SELECT work_start_address FROM tasks WHERE id = ?`
    ).bind(task_id).first() as any

    if (!taskRowAddr?.work_start_address) {
      await c.env.DB.prepare(
        `UPDATE tasks SET work_start_address = ?, work_start_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(gps_address, tbmTs, task_id).run()
    }
  }

  // ── TBM 완료 시 admin/supervisor에게 알림 ─────────────────────────────────
  try {
    const notifTitle = `TBM 완료: ${taskRow?.title || task_id}`
    const notifMsg   = `${user.name}님이 TBM을 완료했습니다. (${taskRow?.task_number || ''})`
    const adminUsers = await c.env.DB.prepare(
      `SELECT id FROM users WHERE role IN ('admin','supervisor') AND is_active=1`
    ).all<any>()
    if (adminUsers.results?.length > 0) {
      const insertStmt = c.env.DB.prepare(
        `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
         VALUES (?, 'tbm_completed', ?, ?, ?, 'tbm', 0)`
      )
      await c.env.DB.batch(
        adminUsers.results
          .filter((u: any) => u.id !== user.id)
          .map((u: any) => insertStmt.bind(u.id, notifTitle, notifMsg, Number(tbmId)))
      )
      // SSE 실시간 푸시
      for (const u of adminUsers.results.filter((u: any) => u.id !== user.id)) {
        sendToUser(u.id, {
          type: 'tbm_completed',
          title: notifTitle,
          message: notifMsg,
          ref_id: Number(tbmId),
          ref_type: 'tbm',
          ts: Date.now()
        })
      }
    }
  } catch(_) {}

  return c.json({ success: true, id: result.meta.last_row_id })
})

export default app
