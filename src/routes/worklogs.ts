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

  let body: any = {}
  try { body = await c.req.json() }
  catch(e: any) { return c.json({ error: `요청 본문 파싱 실패: ${e.message}` }, 400) }

  const { task_id, log_date, start_time, end_time, actual_quantity, quantity_unit,
    work_location, work_description, issues, tomorrow_plan,
    gps_lat, gps_lon } = body

  // 필수값 검증
  if (!task_id) return c.json({ error: 'task_id 필수' }, 400)
  if (!log_date) return c.json({ error: 'log_date 필수' }, 400)

  // status 정규화: work_logs CHECK('working','completed','paused') 제약 대응
  // 앱이 'work_completed' 전송 시 → 'completed' 로 변환
  const rawStatus = body.status || 'working'
  const VALID_LOG_STATUS: Record<string, string> = {
    working:        'working',
    completed:      'completed',
    work_completed: 'completed',   // 앱 호환
    paused:         'paused',
    '작업중':       'working',
    '작업완료':     'completed',
    '중지':         'paused',
  }
  const status = VALID_LOG_STATUS[rawStatus] ?? 'working'

  const gps_recorded_at = (gps_lat != null && gps_lon != null)
    ? new Date(Date.now() + 9*60*60*1000).toISOString().replace('T',' ').slice(0,19)
    : null

  // 같은 날 같은 작업 일지 있으면 업데이트
  let existing: any = null
  try {
    existing = await c.env.DB.prepare(
      'SELECT id FROM work_logs WHERE task_id = ? AND worker_id = ? AND log_date = ?'
    ).bind(task_id, user.id, log_date).first<any>()
  } catch(e: any) {
    return c.json({ error: `일지 조회 실패: ${e.message}` }, 500)
  }

  if (existing) {
    // GPS 컬럼 포함 UPDATE 시도 → 없으면 GPS 제외 fallback
    let updateOk = false
    try {
      await c.env.DB.prepare(
        `UPDATE work_logs SET start_time=?, end_time=?, actual_quantity=?, quantity_unit=?,
         work_location=?, work_description=?, issues=?, tomorrow_plan=?, status=?,
         gps_lat=?, gps_lon=?, gps_recorded_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(start_time || '', end_time || '', actual_quantity || 0, quantity_unit || '개',
        work_location || '', work_description || '', issues || '', tomorrow_plan || '', status || 'working',
        gps_lat ?? null, gps_lon ?? null, gps_recorded_at, existing.id
      ).run()
      updateOk = true
    } catch(e1: any) {
      console.warn('[worklogs POST update-gps] fallback:', e1.message)
    }

    if (!updateOk) {
      try {
        await c.env.DB.prepare(
          `UPDATE work_logs SET start_time=?, end_time=?, actual_quantity=?, quantity_unit=?,
           work_description=?, issues=?, status=?,
           updated_at=CURRENT_TIMESTAMP WHERE id=?`
        ).bind(start_time || '', end_time || '', actual_quantity || 0, quantity_unit || '개',
          work_description || '', issues || '', status || 'working', existing.id
        ).run()
      } catch(e2: any) {
        return c.json({ error: `일지 수정 실패: ${e2.message}` }, 500)
      }
    }

    // work_completed → completed 전환 체크
    try {
      const taskRow2 = await c.env.DB.prepare(
        'SELECT status, construction_id FROM tasks WHERE id=?'
      ).bind(task_id).first<any>()
      if (taskRow2?.status === 'work_completed') {
        await c.env.DB.prepare(
          "UPDATE tasks SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?"
        ).bind(task_id).run()
        if (taskRow2.construction_id) {
          try { await refreshConstructionStatus(c.env.DB, taskRow2.construction_id) } catch(_) {}
        }
      }
    } catch(_) {}

    return c.json({ success: true, id: existing.id, updated: true })
  }

  // INSERT — GPS 컬럼 포함 시도 → 없으면 GPS 제외 fallback
  let insertId: any = null
  let insertOk = false
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO work_logs (task_id, worker_id, log_date, start_time, end_time, actual_quantity,
       quantity_unit, work_location, work_description, issues, tomorrow_plan, status,
       gps_lat, gps_lon, gps_recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(task_id, user.id, log_date, start_time || '', end_time || '', actual_quantity || 0,
      quantity_unit || '개', work_location || '', work_description || '', issues || '',
      tomorrow_plan || '', status || 'working',
      gps_lat ?? null, gps_lon ?? null, gps_recorded_at
    ).run()
    insertId = result.meta.last_row_id
    insertOk = true
  } catch(e1: any) {
    console.warn('[worklogs POST insert-gps] fallback:', e1.message)
  }

  if (!insertOk) {
    // GPS/work_location/tomorrow_plan 컬럼 없는 구버전 DB fallback
    try {
      const result = await c.env.DB.prepare(
        `INSERT INTO work_logs (task_id, worker_id, log_date, start_time, end_time, actual_quantity,
         quantity_unit, work_description, issues, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(task_id, user.id, log_date, start_time || '', end_time || '', actual_quantity || 0,
        quantity_unit || '개', work_description || '', issues || '', status || 'working'
      ).run()
      insertId = result.meta.last_row_id
    } catch(e2: any) {
      return c.json({ error: `일지 저장 실패: ${e2.message}` }, 500)
    }
  }

  // 작업 상태 전환 (work_completed → completed)
  try {
    const taskRow = await c.env.DB.prepare(
      'SELECT status, construction_id FROM tasks WHERE id=?'
    ).bind(task_id).first<any>()

    if (taskRow?.status === 'work_completed') {
      await c.env.DB.prepare(
        "UPDATE tasks SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(task_id).run()
      if (taskRow.construction_id) {
        try { await refreshConstructionStatus(c.env.DB, taskRow.construction_id) } catch(_) {}
      }
    }
  } catch(_) {}

  return c.json({ success: true, id: insertId })
})

// 작업 일지 수정
app.put('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const body = await c.req.json()
  const { start_time, end_time, actual_quantity, quantity_unit, work_location, work_description, issues, tomorrow_plan,
    gps_lat, gps_lon } = body

  // status 정규화
  const rawStatus = body.status || 'working'
  const VALID_LOG_STATUS: Record<string, string> = {
    working: 'working', completed: 'completed', work_completed: 'completed', paused: 'paused',
    '작업중': 'working', '작업완료': 'completed', '중지': 'paused',
  }
  const status = VALID_LOG_STATUS[rawStatus] ?? 'working'
  const gps_recorded_at = (gps_lat != null && gps_lon != null)
    ? new Date(Date.now() + 9*60*60*1000).toISOString().replace('T',' ').slice(0,19)
    : null

  // 수정 전 일지에서 task_id 조회
  const logRow = await c.env.DB.prepare(
    'SELECT task_id FROM work_logs WHERE id=?'
  ).bind(id).first<any>()

  // GPS 컬럼 포함 UPDATE 시도 → 없으면 GPS 제외 fallback
  try {
    await c.env.DB.prepare(
      `UPDATE work_logs SET start_time=?, end_time=?, actual_quantity=?, quantity_unit=?,
       work_location=?, work_description=?, issues=?, tomorrow_plan=?, status=?,
       gps_lat=?, gps_lon=?, gps_recorded_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(start_time || '', end_time || '', actual_quantity || 0, quantity_unit || '개',
      work_location || '', work_description || '', issues || '', tomorrow_plan || '', status || 'working',
      gps_lat ?? null, gps_lon ?? null, gps_recorded_at, id
    ).run()
  } catch(_) {
    // GPS/work_location/tomorrow_plan 컬럼 없는 구버전 DB fallback
    try {
      await c.env.DB.prepare(
        `UPDATE work_logs SET start_time=?, end_time=?, actual_quantity=?, quantity_unit=?,
         work_description=?, issues=?, status=?,
         updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(start_time || '', end_time || '', actual_quantity || 0, quantity_unit || '개',
        work_description || '', issues || '', status || 'working', id
      ).run()
    } catch(e2: any) {
      return c.json({ error: e2.message }, 500)
    }
  }

  // ── 일지 수정 시 work_completed → completed 전환 체크 ────────────────────
  if (logRow?.task_id) {
    try {
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
    } catch(_) {}
  }

  return c.json({ success: true })
})

export default app
