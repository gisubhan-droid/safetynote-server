import { Hono } from 'hono'
import { getUser } from '../utils'
import { broadcastToRoles } from '../sse'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()


// 위험 상황 목록
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { status, risk_level } = c.req.query()
  let q = `SELECT hr.*, u.name as reporter_name, t.title as task_title,
    ru.name as resolved_by_name
    FROM hazard_reports hr
    LEFT JOIN users u ON u.id = hr.reporter_id
    LEFT JOIN tasks t ON t.id = hr.task_id
    LEFT JOIN users ru ON ru.id = hr.resolved_by`
  const params: any[] = []
  const wheres: string[] = []
  if (status) { wheres.push('hr.status = ?'); params.push(status) }
  if (risk_level) { wheres.push('hr.risk_level = ?'); params.push(risk_level) }
  if (user.role === 'worker') { wheres.push('hr.reporter_id = ?'); params.push(user.id) }
  if (wheres.length) q += ' WHERE ' + wheres.join(' AND ')
  q += ' ORDER BY hr.created_at DESC'
  const result = await c.env.DB.prepare(q).bind(...params).all<any>()
  return c.json(result.results || [])
})

// 위험 상황 신고
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const body = await c.req.json()
  const {
    task_id, location, hazard_type, hazard_description, risk_level,
    immediate_action, photo_data,
    report_type, near_miss_cause, recurrence_prevention
  } = body

  if (!location || !hazard_description) return c.json({ error: '필수 항목을 입력하세요.' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO hazard_reports
      (reporter_id, task_id, location, hazard_type, hazard_description, risk_level,
       immediate_action, photo_data, report_type, near_miss_cause, recurrence_prevention)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id, task_id || null, location,
    hazard_type || '기타', hazard_description,
    risk_level || 'medium',
    immediate_action || null, photo_data || null,
    report_type || 'danger',
    near_miss_cause || null,
    recurrence_prevention || null
  ).run()

  const newId = result.meta.last_row_id as number

  // ─── SSE: 위험 신고 접수 알림 (관리자/감독자 전체)
  const riskLevelLabel: Record<string, string> = { low: '낮음', medium: '중간', high: '높음', critical: '매우높음' }
  const reportTypeLabel: Record<string, string> = { danger: '위험상황', near_miss: '아차사고' }
  broadcastToRoles(['admin', 'supervisor'], {
    type: 'hazard_report',
    hazardId: newId,
    reporter: user.name,
    riskLevel: risk_level || 'medium',
    riskLevelLabel: riskLevelLabel[risk_level || 'medium'] || risk_level,
    reportType: report_type || 'danger',
    reportTypeLabel: reportTypeLabel[report_type || 'danger'] || '위험신고',
    location,
    message: `[위험신고] ${user.name}님이 ${reportTypeLabel[report_type || 'danger'] || '위험'}을 신고했습니다. (위치: ${location}, 위험도: ${riskLevelLabel[risk_level || 'medium'] || risk_level})`,
    ts: Date.now()
  })

  return c.json({ success: true, id: newId })
})

// 위험 상황 처리 (BUG-055: resolve_photo_data 저장 추가)
app.patch('/:id/resolve', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const { resolution_notes, status, resolve_photo_data } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE hazard_reports SET status=?, resolved_by=?, resolved_at=CURRENT_TIMESTAMP, resolution_notes=?, resolve_photo_data=? WHERE id=?`
  ).bind(status || 'resolved', user.id, resolution_notes || '', resolve_photo_data || null, id).run()
  return c.json({ success: true })
})

export default app
