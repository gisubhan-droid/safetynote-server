import { Hono } from 'hono'
import { getUser } from '../utils'
import { refreshConstructionStatus } from './constructions'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()


// 작업 일지 목록
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { task_id, worker_id, start_date, end_date } = c.req.query()

  let q = `SELECT wl.*, t.title as task_title, u.name as worker_name
    FROM work_logs wl LEFT JOIN tasks t ON t.id = wl.task_id LEFT JOIN users u ON u.id = wl.worker_id`
  const params: any[] = []
  const wheres: string[] = []

  if (user.role === 'worker') { wheres.push('wl.worker_id = ?'); params.push(user.id) }
  else if (worker_id) { wheres.push('wl.worker_id = ?'); params.push(worker_id) }
  if (task_id) { wheres.push('wl.task_id = ?'); params.push(task_id) }
  if (start_date) { wheres.push('wl.log_date >= ?'); params.push(start_date) }
  if (end_date) { wheres.push('wl.log_date <= ?'); params.push(end_date) }

  if (wheres.length) q += ' WHERE ' + wheres.join(' AND ')
  q += ' ORDER BY wl.log_date DESC, wl.created_at DESC'

  const result = await c.env.DB.prepare(q).bind(...params).all<any>()
  return c.json(result.results || [])
})

// 작업 일지 생성/수정
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const body = await c.req.json()
  const { task_id, log_date, start_time, end_time, actual_quantity, quantity_unit,
    work_location, work_description, issues, tomorrow_plan, status,
    gps_lat, gps_lon } = body
  const gps_recorded_at = (gps_lat != null && gps_lon != null)
    ? new Date(Date.now() + 9*60*60*1000).toISOString().replace('T',' ').slice(0,19)
    : null

  // 같은 날 같은 작업 일지 있으면 업데이트
  const existing = await c.env.DB.prepare(
    'SELECT id FROM work_logs WHERE task_id = ? AND worker_id = ? AND log_date = ?'
  ).bind(task_id, user.id, log_date).first<any>()

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE work_logs SET start_time=?, end_time=?, actual_quantity=?, quantity_unit=?,
       work_location=?, work_description=?, issues=?, tomorrow_plan=?, status=?,
       gps_lat=?, gps_lon=?, gps_recorded_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(start_time || '', end_time || '', actual_quantity || 0, quantity_unit || '개',
      work_location || '', work_description || '', issues || '', tomorrow_plan || '', status || 'working',
      gps_lat ?? null, gps_lon ?? null, gps_recorded_at, existing.id
    ).run()

    // ── 기존 일지 수정 시에도 work_completed → completed 전환 체크 ──────────
    const taskRow2 = await c.env.DB.prepare(
      'SELECT status, construction_id FROM tasks WHERE id=?'
    ).bind(task_id).first<any>()
    if (taskRow2?.status === 'work_completed') {
      await c.env.DB.prepare(
        "UPDATE tasks SET status='completed', work_log_required=0, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(task_id).run()
      // 공사 상태 자동 갱신
      if (taskRow2.construction_id) {
        try { await refreshConstructionStatus(c.env.DB, taskRow2.construction_id) } catch(_) {}
      }
    }

    return c.json({ success: true, id: existing.id, updated: true })
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO work_logs (task_id, worker_id, log_date, start_time, end_time, actual_quantity,
     quantity_unit, work_location, work_description, issues, tomorrow_plan, status,
     gps_lat, gps_lon, gps_recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(task_id, user.id, log_date, start_time || '', end_time || '', actual_quantity || 0,
    quantity_unit || '개', work_location || '', work_description || '', issues || '', tomorrow_plan || '', status || 'working',
    gps_lat ?? null, gps_lon ?? null, gps_recorded_at
  ).run()

  // 작업 일지 저장 후 작업 상태를 'completed'로 전환 (work_completed → completed)
  const wlNow = new Date()
  const wlKst = new Date(wlNow.getTime() + 9 * 60 * 60 * 1000)
  const wlTs = wlKst.toISOString().replace('T', ' ').slice(0, 19)

  // 현재 작업 상태 확인
  const taskRow = await c.env.DB.prepare(
    'SELECT status, work_started_at FROM tasks WHERE id=?'
  ).bind(task_id).first<any>()

  if (taskRow?.status === 'work_completed') {
    // 작업완료 후 일지 작성 → 최종 완료 처리
    await c.env.DB.prepare(
      "UPDATE tasks SET status='completed', work_log_required=0, updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(task_id).run()
    // 공사 상태 자동 갱신
    const conRow = await c.env.DB.prepare(
      'SELECT construction_id FROM tasks WHERE id=?'
    ).bind(task_id).first<any>()
    if (conRow?.construction_id) {
      try { await refreshConstructionStatus(c.env.DB, conRow.construction_id) } catch(_) {}
    }
  } else if (taskRow?.status === 'working') {
    // 작업중 상태에서 일지 작성 시 그대로 유지 (working)
    // 별도 처리 없음
  }

  return c.json({ success: true, id: result.meta.last_row_id })
})

// 작업 일지 수정
app.put('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const body = await c.req.json()
  const { start_time, end_time, actual_quantity, quantity_unit, work_location, work_description, issues, tomorrow_plan, status,
    gps_lat, gps_lon } = body
  const gps_recorded_at = (gps_lat != null && gps_lon != null)
    ? new Date(Date.now() + 9*60*60*1000).toISOString().replace('T',' ').slice(0,19)
    : null

  // 수정 전 일지에서 task_id 조회
  const logRow = await c.env.DB.prepare(
    'SELECT task_id FROM work_logs WHERE id=?'
  ).bind(id).first<any>()

  await c.env.DB.prepare(
    `UPDATE work_logs SET start_time=?, end_time=?, actual_quantity=?, quantity_unit=?,
     work_location=?, work_description=?, issues=?, tomorrow_plan=?, status=?,
     gps_lat=?, gps_lon=?, gps_recorded_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(start_time || '', end_time || '', actual_quantity || 0, quantity_unit || '개',
    work_location || '', work_description || '', issues || '', tomorrow_plan || '', status || 'working',
    gps_lat ?? null, gps_lon ?? null, gps_recorded_at, id
  ).run()

  // ── 일지 수정 시 work_completed → completed 전환 체크 ────────────────────
  if (logRow?.task_id) {
    const taskRow = await c.env.DB.prepare(
      'SELECT status, construction_id FROM tasks WHERE id=?'
    ).bind(logRow.task_id).first<any>()
    if (taskRow?.status === 'work_completed') {
      await c.env.DB.prepare(
        "UPDATE tasks SET status='completed', work_log_required=0, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(logRow.task_id).run()
      // 공사 상태 자동 갱신
      if (taskRow.construction_id) {
        try { await refreshConstructionStatus(c.env.DB, taskRow.construction_id) } catch(_) {}
      }
    }
  }

  return c.json({ success: true })
})

export default app
