// src/routes/work-reports.ts — 외선작업일보 API

import { Hono } from 'hono'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// ─── 헬퍼: DB 가져오기 ────────────────────────────────────────
function getDB(c: any) { return c.env?.DB || (c as any).db }

// ═══════════════════════════════════════════════════════════════
// GET /api/work-reports/task/:taskId
// 특정 작업의 일보 전체 조회 (헤더 + 라인 + 케이블 + 기타공종)
// ═══════════════════════════════════════════════════════════════
app.get('/task/:taskId', async (c) => {
  const db      = getDB(c)
  const taskId  = Number(c.req.param('taskId'))

  const report = await db.prepare(`
    SELECT r.*,
           t.task_number, t.work_number, t.request_no, t.title,
           t.construction_type, t.work_completed_at, t.work_date AS task_work_date,
           cs.title AS construction_title, cs.manager_name, cs.work_class
    FROM work_reports r
    JOIN tasks t ON t.id = r.task_id
    LEFT JOIN constructions cs ON cs.request_no = t.request_no
    WHERE r.task_id = ?
  `).bind(taskId).first()

  if (!report) return c.json({ report: null })

  const rid = (report as any).id
  const [lines, cables, others] = await Promise.all([
    db.prepare(`SELECT * FROM work_report_lines WHERE report_id = ? ORDER BY line_order`).bind(rid).all(),
    db.prepare(`SELECT * FROM work_report_cables WHERE report_id = ? ORDER BY cable_order`).bind(rid).all(),
    db.prepare(`
      SELECT o.*, wt.name, wt.unit, wt.sort_order
      FROM work_report_other o
      JOIN other_work_types wt ON wt.id = o.other_type_id
      WHERE o.report_id = ?
      ORDER BY wt.sort_order
    `).bind(rid).all()
  ])

  return c.json({ report, lines: lines.results, cables: cables.results, others: others.results })
})

// ═══════════════════════════════════════════════════════════════
// POST /api/work-reports
// 일보 생성 또는 업데이트 (upsert)
// body: { task_id, detail_type, lines: [...], cables: [...] }
// ═══════════════════════════════════════════════════════════════
app.post('/', async (c) => {
  const db   = getDB(c)
  const user = (c as any).user || (c.get as any)?.('user')
  const body = await c.req.json()
  const { task_id, detail_type = '' } = body

  if (!task_id) return c.json({ error: 'task_id 필수' }, 400)

  // 작업 정보 자동 조회
  const task = await db.prepare(`
    SELECT t.*, cs.manager_name, cs.title AS construction_title
    FROM tasks t
    LEFT JOIN constructions cs ON cs.request_no = t.request_no
    WHERE t.id = ?
  `).bind(task_id).first() as any

  if (!task) return c.json({ error: '작업을 찾을 수 없습니다' }, 404)

  // 작업팀 자동 조회 (배정된 근로자의 팀)
  const teamRow = await db.prepare(`
    SELECT DISTINCT tm.name AS team_name
    FROM task_assignments ta
    JOIN users u ON u.id = ta.worker_id
    JOIN teams tm ON tm.id = u.team_id
    WHERE ta.task_id = ?
    LIMIT 1
  `).bind(task_id).first() as any

  const worker_team  = teamRow?.team_name || task.contractor_name || ''
  const manager_name = task.manager_name || task.lgu_supervisor || ''
  const work_date    = task.work_completed_at || task.work_date || task.task_work_date || ''

  // upsert work_reports
  const existing = await db.prepare(`SELECT id FROM work_reports WHERE task_id = ?`).bind(task_id).first() as any

  let reportId: number
  if (existing) {
    await db.prepare(`
      UPDATE work_reports SET detail_type=?, worker_team=?, manager_name=?, work_date=?, updated_at=CURRENT_TIMESTAMP
      WHERE task_id=?
    `).bind(detail_type, worker_team, manager_name, work_date, task_id).run()
    reportId = existing.id
  } else {
    const ins = await db.prepare(`
      INSERT INTO work_reports (task_id, detail_type, worker_team, manager_name, work_date, status, created_by)
      VALUES (?,?,?,?,?,'draft',?)
    `).bind(task_id, detail_type, worker_team, manager_name, work_date, user?.id || null).run()
    reportId = (ins.meta as any).last_row_id
  }

  // 라인 데이터 교체
  if (Array.isArray(body.lines)) {
    await db.prepare(`DELETE FROM work_report_lines WHERE report_id=?`).bind(reportId).run()
    for (let i = 0; i < body.lines.length; i++) {
      const l = body.lines[i]
      await db.prepare(`
        INSERT INTO work_report_lines
          (report_id,line_order,work_div,mgmt_zone,mgmt_no,line_name,line_no,digital_no,
           section_dist,pole_count,ip_pole,bind_wire,hanger,hardware,cabinet,
           name_tag,warning_sign,grounding,other_work,remark)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        reportId, i,
        l.work_div||'', l.mgmt_zone||'', l.mgmt_no||'', l.line_name||'', l.line_no||'', l.digital_no||'',
        l.section_dist||0, l.pole_count||0,
        l.ip_pole||'', l.bind_wire||'', l.hanger||'', l.hardware||'', l.cabinet||'',
        l.name_tag||0, l.warning_sign||0, l.grounding||'', l.other_work||'', l.remark||''
      ).run()
    }
  }

  // 케이블 데이터 교체
  if (Array.isArray(body.cables)) {
    await db.prepare(`DELETE FROM work_report_cables WHERE report_id=?`).bind(reportId).run()
    for (let i = 0; i < body.cables.length; i++) {
      const cb = body.cables[i]
      await db.prepare(`
        INSERT INTO work_report_cables
          (report_id,cable_order,lot_no,spec,maker,mfg_year,cable_type,work_div,
           start_point,end_point,usage_m,cable_kind,cable_code,special_note)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        reportId, i,
        cb.lot_no||'', cb.spec||0, cb.maker||'', cb.mfg_year||'',
        cb.cable_type||'', cb.work_div||'',
        cb.start_point||'', cb.end_point||'', cb.usage_m||0,
        cb.cable_kind||'', cb.cable_code||'', cb.special_note||''
      ).run()
    }
  }

  return c.json({ ok: true, reportId })
})

// ═══════════════════════════════════════════════════════════════
// POST /api/work-reports/:reportId/submit
// 일보 제출(draft → submitted)
// ═══════════════════════════════════════════════════════════════
app.post('/:reportId/submit', async (c) => {
  const db       = getDB(c)
  const reportId = Number(c.req.param('reportId'))
  await db.prepare(`UPDATE work_reports SET status='submitted', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(reportId).run()
  return c.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════
// POST /api/work-reports/:reportId/other-works
// 기타공종 저장 (팝업에서 입력)
// body: [ { other_type_id, quantity }, ... ]
// ═══════════════════════════════════════════════════════════════
app.post('/:reportId/other-works', async (c) => {
  const db       = getDB(c)
  const reportId = Number(c.req.param('reportId'))
  const items    = await c.req.json() as any[]

  await db.prepare(`DELETE FROM work_report_other WHERE report_id=?`).bind(reportId).run()
  for (const item of items) {
    if (!item.other_type_id || item.quantity == null) continue
    await db.prepare(`
      INSERT OR REPLACE INTO work_report_other (report_id, other_type_id, quantity)
      VALUES (?,?,?)
    `).bind(reportId, item.other_type_id, item.quantity).run()
  }
  return c.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════
// GET /api/work-reports/other-work-types
// 기타공종 마스터 목록
// ═══════════════════════════════════════════════════════════════
app.get('/other-work-types', async (c) => {
  const db  = getDB(c)
  const res = await db.prepare(`SELECT * FROM other_work_types WHERE is_active=1 ORDER BY sort_order`).all()
  return c.json({ types: res.results })
})

// ═══════════════════════════════════════════════════════════════
// GET /api/work-reports/volume-stats
// 물량통계 조회
// query: construction_id, from_date, to_date, role(admin/worker)
// ═══════════════════════════════════════════════════════════════
app.get('/volume-stats', async (c) => {
  const db         = getDB(c)
  const user       = (c as any).user || {}
  const { construction_id, from_date, to_date } = c.req.query()

  let where = `WHERE r.status IN ('submitted','confirmed')`
  const params: any[] = []

  if (construction_id) {
    where += ` AND t.request_no = (SELECT request_no FROM constructions WHERE id=?)`
    params.push(construction_id)
  }
  if (from_date) { where += ` AND r.work_date >= ?`; params.push(from_date) }
  if (to_date)   { where += ` AND r.work_date <= ?`; params.push(to_date) }
  // 근로자는 본인 작업건만
  if (user.role === 'worker') {
    where += ` AND EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id=t.id AND ta.worker_id=?)`
    params.push(user.id)
  }

  // 헤더 정보
  const rows = await db.prepare(`
    SELECT
      r.id AS report_id,
      r.work_date,
      t.created_at AS order_date,
      r.worker_team,
      t.request_no,
      t.construction_type AS work_class,
      r.manager_name,
      -- 신설 광케이블: 구분=신설or이설 행의 usage_m 합계
      (SELECT COALESCE(SUM(rl.usage_m),0) FROM work_report_cables rl
       WHERE rl.report_id=r.id AND rl.work_div IN ('신설','이설')) AS cable_new,
      -- 신설 조가선: 구분=신설 & pole_count>0 행의 section_dist 합계
      (SELECT COALESCE(SUM(rl2.section_dist),0) FROM work_report_lines rl2
       WHERE rl2.report_id=r.id AND rl2.work_div='신설' AND rl2.pole_count>0) AS joga_new,
      -- 커넥터: 규격=1인 케이블 개수
      (SELECT COUNT(*) FROM work_report_cables rl3
       WHERE rl3.report_id=r.id AND rl3.spec=1) AS connector,
      -- 철거 광케이블
      (SELECT COALESCE(SUM(rl4.usage_m),0) FROM work_report_cables rl4
       WHERE rl4.report_id=r.id AND rl4.work_div IN ('철거','이설')) AS cable_remove,
      -- 철거 조가선
      (SELECT COALESCE(SUM(rl5.section_dist),0) FROM work_report_lines rl5
       WHERE rl5.report_id=r.id AND rl5.work_div='철거' AND rl5.pole_count>0) AS joga_remove,
      -- IP주 신설/철거
      (SELECT COUNT(*) FROM work_report_lines rl6 WHERE rl6.report_id=r.id AND rl6.ip_pole='신설') AS ip_new,
      (SELECT COUNT(*) FROM work_report_lines rl7 WHERE rl7.report_id=r.id AND rl7.ip_pole='철거') AS ip_remove,
      -- 접지
      (SELECT COUNT(*) FROM work_report_lines rl8 WHERE rl8.report_id=r.id AND rl8.grounding='B') AS ground_b,
      (SELECT COUNT(*) FROM work_report_lines rl9 WHERE rl9.report_id=r.id AND rl9.grounding='A') AS ground_a,
      r.id AS rid
    FROM work_reports r
    JOIN tasks t ON t.id = r.task_id
    ${where}
    ORDER BY r.work_date DESC
  `).bind(...params).all()

  // 기타공종 집계 (report별)
  const otherTypes = await db.prepare(`SELECT * FROM other_work_types WHERE is_active=1 ORDER BY sort_order`).all()
  const otherRows  = await db.prepare(`
    SELECT wo.report_id, wo.other_type_id, wo.quantity
    FROM work_report_other wo
    JOIN work_reports wr ON wr.id = wo.report_id
    JOIN tasks t ON t.id = wr.task_id
    ${where.replace('WHERE', 'WHERE wr.id IS NOT NULL AND')}
  `).bind(...params).all()

  // 단가 정보
  const prices = await db.prepare(`SELECT * FROM volume_unit_prices ORDER BY sort_order`).all()

  return c.json({
    rows: rows.results,
    otherTypes: otherTypes.results,
    otherRows: otherRows.results,
    prices: prices.results
  })
})

export default app
