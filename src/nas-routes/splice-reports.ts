/**
 * splice-reports.ts — 접속일보 + 접속단가 API
 *
 * 포함 라우트 (11개):
 *   GET    /api/splice-reports
 *   GET    /api/splice-reports/stats      ← /:id 보다 반드시 먼저
 *   GET    /api/splice-reports/:id
 *   POST   /api/splice-reports
 *   POST   /api/splice-reports/:id/submit
 *   POST   /api/splice-reports/:id/revert
 *   DELETE /api/splice-reports/:id
 *   GET    /api/splice-unit-prices
 *   PUT    /api/splice-unit-prices
 *   POST   /api/splice-unit-prices
 *   DELETE /api/splice-unit-prices/:key
 *
 * 의존:
 *   - getRawDb(), getUser(), dbRoleToUi() from ../nas-db
 *
 * ⚠️ rawDb 동기 방식 사용: DB.prepare().run() 비동기 래퍼 절대 사용 금지
 */

import { Hono } from 'hono'
import { getRawDb, getUser, dbRoleToUi } from '../nas-db'

// ─── splice-reports 라우트 ────────────────────────────────────────────────────
const spliceApp = new Hono()

// GET / — 목록 (작업 정보 포함, 페이지네이션)
spliceApp.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const { from_date, to_date, page: pageStr, limit: limitStr } = c.req.query()

  const limitNum = Math.min(500, Math.max(0, parseInt(limitStr || '0') || 0))
  const pageNum  = Math.max(1, parseInt(pageStr || '1') || 1)
  const offset   = limitNum > 0 ? (pageNum - 1) * limitNum : 0

  let where = `WHERE 1=1`
  const params: any[] = []
  if (from_date) { where += ` AND sr.work_date >= ?`; params.push(from_date) }
  if (to_date)   { where += ` AND sr.work_date <= ?`; params.push(to_date) }

  const roleUi = dbRoleToUi(user.role, user.position, user.sub_role)
  if (roleUi !== 'sysadmin' && roleUi !== 'manager') {
    where += ` AND sr.created_by=?`
    params.push(user.id)
  }

  let rows: any[] = []
  let total: number | undefined

  try {
    if (limitNum > 0) {
      const countRow = rawDb.prepare(
        `SELECT COUNT(*) AS cnt FROM splice_reports sr ${where}`
      ).get(...params) as any
      total = countRow?.cnt ?? 0
    }

    const pageClause = limitNum > 0 ? ` LIMIT ? OFFSET ?` : ''
    const pageParams = limitNum > 0 ? [...params, limitNum, offset] : params
    rows = rawDb.prepare(`
      SELECT sr.*,
             (SELECT COUNT(*) FROM splice_work_items WHERE report_id=sr.id AND qty>0) AS item_count
      FROM splice_reports sr
      ${where}
      ORDER BY sr.work_date DESC, sr.id DESC${pageClause}
    `).all(...pageParams)
  } catch (e: any) {
    console.error('[GET /api/splice-reports] 단순 조회 에러:', e.message)
    return c.json({ error: 'DB 조회 실패: ' + e.message }, 500)
  }

  // task 정보 별도 병합 (에러나도 무시)
  if (rows.length > 0) {
    try {
      const ids          = rows.map((r: any) => r.id)
      const placeholders = ids.map(() => '?').join(',')
      const taskInfo     = rawDb.prepare(`
        SELECT sr.id, t.title AS task_title, t.request_no AS task_request_no
        FROM splice_reports sr
        LEFT JOIN tasks t ON sr.task_id = t.id
        WHERE sr.id IN (${placeholders})
      `).all(...ids) as any[]
      const joinMap: Record<number, any> = {}
      taskInfo.forEach((r: any) => { joinMap[r.id] = r })
      rows = rows.map((r: any) => ({ ...r, ...(joinMap[r.id] || {}) }))
    } catch (joinErr: any) {
      console.warn('[GET /api/splice-reports] tasks JOIN 실패 (무시):', joinErr.message)
    }
  }

  return c.json({ reports: rows, ...(total !== undefined ? { total, page: pageNum, limit: limitNum } : {}) })
})

// GET /monthly-amount — 월별 접속일보 작성완료 금액 합계
// ⚠️ /:id 및 /stats 보다 반드시 먼저 등록
spliceApp.get('/monthly-amount', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const { year, month } = c.req.query()
  const now = new Date()
  const y = year || now.getFullYear()
  const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
  const start = `${y}-${m}-01`
  const end   = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

  // con_types 필터: 쉼표 구분 문자열 → 배열 (tasks.construction_type 한글 기준)
  const rawConTypes = c.req.query('con_types') || ''
  const conTypeList: string[] = rawConTypes
    ? rawConTypes.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []
  const hasConFilter = conTypeList.length > 0
  // con_types 필터가 있으면 tasks JOIN으로 construction_type 필터링
  const conJoinClause  = hasConFilter
    ? `LEFT JOIN tasks t ON t.id = sr.task_id`
    : ''
  const conWhereClause = hasConFilter
    ? `AND (t.construction_type IN (${conTypeList.map(() => '?').join(',')}) OR (sr.task_id IS NULL))`
    : ''

  try {
    // ① 해당 월 작성완료(submitted) 접속일보 ID 목록 (con_types 필터 적용)
    const baseParams: any[] = [start, end, ...conTypeList]
    const reports: any[] = rawDb.prepare(
      `SELECT sr.id FROM splice_reports sr
       ${conJoinClause}
       WHERE sr.status = 'submitted'
         AND sr.work_date BETWEEN ? AND ?
         ${conWhereClause}`
    ).all(...baseParams) as any[]

    if (reports.length === 0) {
      return c.json({ year: y, month: m, splice_report_amount: 0 })
    }

    // ② 단가 맵 로드 (unit_price + night_price + aerial_price)
    const priceRows: any[] = rawDb.prepare(
      `SELECT item_key, item_label, unit_price, night_price, aerial_price FROM splice_unit_prices`
    ).all() as any[]
    const priceMap: Record<string, { base: number; night: number; aerial: number }> = {}
    priceRows.forEach((p: any) => {
      priceMap[p.item_key] = {
        base:   Number(p.unit_price)   || 0,
        night:  Number(p.night_price)  || 0,
        aerial: Number(p.aerial_price) || 0,
      }
    })
    // item_label → 단가 매핑 (work_label이 label로 저장된 경우 대응)
    const labelPriceMap: Record<string, { base: number; night: number; aerial: number }> = {}
    priceRows.forEach((p: any) => {
      if (p.item_label) labelPriceMap[p.item_label] = {
        base:   Number(p.unit_price)   || 0,
        night:  Number(p.night_price)  || 0,
        aerial: Number(p.aerial_price) || 0,
      }
    })

    // ③ splice_work_items 배치 조회
    const reportIds = reports.map((r: any) => r.id)
    const ph = reportIds.map(() => '?').join(',')
    const items: any[] = rawDb.prepare(
      `SELECT work_label, qty, is_night, is_aerial
       FROM splice_work_items
       WHERE report_id IN (${ph})`
    ).all(...reportIds) as any[]

    // ④ 금액 합산 (야간/가공 추가금 포함)
    let totalAmt = 0
    for (const it of items) {
      const qty    = Number(it.qty) || 0
      const p      = labelPriceMap[it.work_label] || { base: 0, night: 0, aerial: 0 }
      const unitAmt = p.base
                    + (it.is_night   ? p.night  : 0)
                    + (it.is_aerial  ? p.aerial : 0)
      totalAmt += qty * unitAmt
    }

    return c.json({ year: y, month: m, splice_report_amount: Math.round(totalAmt) })
  } catch (e: any) {
    console.error('[splice-reports GET /monthly-amount]', e.message)
    return c.json({ error: e.message || '접속일보 금액 조회 실패' }, 500)
  }
})

// GET /monthly-amount-by-team — 팀별 접속일보 금액 합계
// ⚠️ /:id, /stats 보다 반드시 먼저 등록
spliceApp.get('/monthly-amount-by-team', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const { year, month } = c.req.query()
  const now = new Date()
  const y = year || now.getFullYear()
  const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
  const start = `${y}-${m}-01`
  const end   = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

  const rawConTypes = c.req.query('con_types') || ''
  const conTypeList: string[] = rawConTypes
    ? rawConTypes.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []
  const hasConFilter = conTypeList.length > 0
  const conJoinClause  = hasConFilter ? `LEFT JOIN tasks t ON t.id = sr.task_id` : ''
  const conWhereClause = hasConFilter
    ? `AND (t.construction_type IN (${conTypeList.map(() => '?').join(',')}) OR (sr.task_id IS NULL))`
    : ''

  try {
    const baseParams: any[] = [start, end, ...conTypeList]
    const reports: any[] = rawDb.prepare(
      `SELECT sr.id, sr.worker_team FROM splice_reports sr
       ${conJoinClause}
       WHERE sr.status = 'submitted'
         AND sr.work_date BETWEEN ? AND ?
         ${conWhereClause}`
    ).all(...baseParams) as any[]

    if (reports.length === 0) {
      return c.json({ year: y, month: m, by_team: [] })
    }

    const priceRows: any[] = rawDb.prepare(
      `SELECT item_key, item_label, unit_price, night_price, aerial_price FROM splice_unit_prices`
    ).all() as any[]
    const labelPriceMap: Record<string, { base: number; night: number; aerial: number }> = {}
    priceRows.forEach((p: any) => {
      if (p.item_label) labelPriceMap[p.item_label] = {
        base:   Number(p.unit_price)   || 0,
        night:  Number(p.night_price)  || 0,
        aerial: Number(p.aerial_price) || 0,
      }
    })

    const reportIds = reports.map((r: any) => r.id)
    const ph = reportIds.map(() => '?').join(',')
    const items: any[] = rawDb.prepare(
      `SELECT report_id, work_label, qty, is_night, is_aerial
       FROM splice_work_items
       WHERE report_id IN (${ph})`
    ).all(...reportIds) as any[]

    // report_id → 금액 맵
    const amtByReport: Record<number, number> = {}
    for (const it of items) {
      const qty     = Number(it.qty) || 0
      const p       = labelPriceMap[it.work_label] || { base: 0, night: 0, aerial: 0 }
      const unitAmt = p.base + (it.is_night ? p.night : 0) + (it.is_aerial ? p.aerial : 0)
      amtByReport[it.report_id] = (amtByReport[it.report_id] || 0) + qty * unitAmt
    }

    // 팀별 합산
    const teamAmtMap: Record<string, number> = {}
    for (const r of reports) {
      const team = r.worker_team || '미지정'
      teamAmtMap[team] = (teamAmtMap[team] || 0) + (amtByReport[r.id] || 0)
    }

    const byTeam = Object.entries(teamAmtMap).map(([team_name, amount]) => ({
      team_name,
      splice_amount: Math.round(amount)
    }))

    return c.json({ year: y, month: m, by_team: byTeam })
  } catch (e: any) {
    console.error('[splice-reports GET /monthly-amount-by-team]', e.message)
    return c.json({ error: e.message || '팀별 접속일보 금액 조회 실패' }, 500)
  }
})

// GET /monthly-amount-by-category — 분류별 접속일보 금액 합계
// ⚠️ /:id, /stats 보다 반드시 먼저 등록
spliceApp.get('/monthly-amount-by-category', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const { year, month } = c.req.query()
  const now = new Date()
  const y = year || now.getFullYear()
  const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
  const start = `${y}-${m}-01`
  const end   = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

  const rawConTypes = c.req.query('con_types') || ''
  const conTypeList: string[] = rawConTypes
    ? rawConTypes.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []
  const hasConFilter = conTypeList.length > 0
  const conJoinClause  = `LEFT JOIN tasks t ON t.id = sr.task_id`
  const conWhereClause = hasConFilter
    ? `AND (t.construction_type IN (${conTypeList.map(() => '?').join(',')}) OR (sr.task_id IS NULL))`
    : ''

  try {
    const baseParams: any[] = [start, end, ...conTypeList]
    const reports: any[] = rawDb.prepare(
      `SELECT sr.id, COALESCE(t.construction_type, '미분류') AS construction_type
       FROM splice_reports sr
       ${conJoinClause}
       WHERE sr.status = 'submitted'
         AND sr.work_date BETWEEN ? AND ?
         ${conWhereClause}`
    ).all(...baseParams) as any[]

    if (reports.length === 0) {
      return c.json({ year: y, month: m, by_category: [] })
    }

    const priceRows: any[] = rawDb.prepare(
      `SELECT item_key, item_label, unit_price, night_price, aerial_price FROM splice_unit_prices`
    ).all() as any[]
    const labelPriceMap: Record<string, { base: number; night: number; aerial: number }> = {}
    priceRows.forEach((p: any) => {
      if (p.item_label) labelPriceMap[p.item_label] = {
        base:   Number(p.unit_price)   || 0,
        night:  Number(p.night_price)  || 0,
        aerial: Number(p.aerial_price) || 0,
      }
    })

    const reportIds = reports.map((r: any) => r.id)
    const ph = reportIds.map(() => '?').join(',')
    const items: any[] = rawDb.prepare(
      `SELECT report_id, work_label, qty, is_night, is_aerial
       FROM splice_work_items
       WHERE report_id IN (${ph})`
    ).all(...reportIds) as any[]

    const amtByReport: Record<number, number> = {}
    for (const it of items) {
      const qty     = Number(it.qty) || 0
      const p       = labelPriceMap[it.work_label] || { base: 0, night: 0, aerial: 0 }
      const unitAmt = p.base + (it.is_night ? p.night : 0) + (it.is_aerial ? p.aerial : 0)
      amtByReport[it.report_id] = (amtByReport[it.report_id] || 0) + qty * unitAmt
    }

    // 분류별 합산
    const catAmtMap: Record<string, number> = {}
    for (const r of reports) {
      const cat = r.construction_type || '미분류'
      catAmtMap[cat] = (catAmtMap[cat] || 0) + (amtByReport[r.id] || 0)
    }

    const byCategory = Object.entries(catAmtMap).map(([category, amount]) => ({
      category,
      splice_amount: Math.round(amount)
    }))

    return c.json({ year: y, month: m, by_category: byCategory })
  } catch (e: any) {
    console.error('[splice-reports GET /monthly-amount-by-category]', e.message)
    return c.json({ error: e.message || '분류별 접속일보 금액 조회 실패' }, 500)
  }
})

// GET /stats — 공량내역/물량통계
// ⚠️ /:id 보다 반드시 먼저 등록
spliceApp.get('/stats', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const { construction_id, from_date, to_date } = c.req.query()

  let where = `WHERE sr.status IN ('draft','submitted','confirmed')`
  const params: any[] = []
  if (from_date) { where += ` AND sr.work_date >= ?`; params.push(from_date) }
  if (to_date)   { where += ` AND sr.work_date <= ?`; params.push(to_date) }

  let rows: any[] = []
  try {
    rows = rawDb.prepare(`
      SELECT sr.id, sr.work_date, sr.worker_team, sr.manager_name, sr.status
      FROM splice_reports sr
      ${where}
      ORDER BY sr.work_date DESC, sr.id DESC
    `).all(...params) as any[]
  } catch (e: any) {
    return c.json({ error: 'DB 조회 실패: ' + e.message }, 500)
  }

  // construction_id 필터 (별도 처리)
  if (construction_id && rows.length > 0) {
    try {
      const ids          = rows.map((r: any) => r.id)
      const placeholders = ids.map(() => '?').join(',')
      const filtered     = rawDb.prepare(`
        SELECT sr.id
        FROM splice_reports sr
        LEFT JOIN tasks t ON sr.task_id = t.id
        WHERE sr.id IN (${placeholders})
          AND t.request_no = (SELECT request_no FROM constructions WHERE id=?)
      `).all(...ids, construction_id) as any[]
      const filteredIds = new Set(filtered.map((r: any) => r.id))
      rows = rows.filter((r: any) => filteredIds.has(r.id))
    } catch (joinErr: any) {
      console.warn('[GET /api/splice-reports/stats] construction_id 필터 JOIN 실패 (무시):', joinErr.message)
    }
  }

  // tasks + constructions JOIN (실패해도 무시)
  if (rows.length > 0) {
    try {
      const ids          = rows.map((r: any) => r.id)
      const placeholders = ids.map(() => '?').join(',')
      const taskInfo     = rawDb.prepare(`
        SELECT sr.id,
               t.request_no,
               t.title AS task_title,
               COALESCE(cs1.work_class, cs2.work_class) AS construction_work_class,
               (SELECT DISTINCT tm.name
                FROM task_assignments ta
                JOIN users u  ON u.id  = ta.worker_id
                JOIN teams tm ON tm.id = u.team_id
                WHERE ta.task_id = t.id
                LIMIT 1) AS team_name
        FROM splice_reports sr
        LEFT JOIN tasks t   ON sr.task_id = t.id
        LEFT JOIN constructions cs1 ON cs1.id         = t.construction_id
        LEFT JOIN constructions cs2 ON cs2.request_no = t.request_no
        WHERE sr.id IN (${placeholders})
      `).all(...ids) as any[]
      const taskMap: Record<number, any> = {}
      taskInfo.forEach((r: any) => { taskMap[r.id] = r })
      rows = rows.map((r: any) => ({
        ...r,
        request_no:              taskMap[r.id]?.request_no              || '',
        task_title:              taskMap[r.id]?.task_title              || '',
        construction_work_class: taskMap[r.id]?.construction_work_class || '',
        worker_team:             taskMap[r.id]?.team_name || r.worker_team || '',
      }))
    } catch (joinErr: any) {
      console.warn('[GET /api/splice-reports/stats] tasks/constructions JOIN 실패 (무시):', joinErr.message)
    }
  }

  // items: 공종별 상세
  const reportIds = rows.map((r: any) => r.id)
  let items: any[] = []
  if (reportIds.length > 0) {
    const placeholders = reportIds.map(() => '?').join(',')
    items = rawDb.prepare(`
      SELECT swi.report_id, swi.work_label, swi.unit, swi.is_night, swi.is_aerial,
             SUM(swi.qty) AS total_qty
      FROM splice_work_items swi
      WHERE swi.report_id IN (${placeholders})
      GROUP BY swi.report_id, swi.work_label, swi.unit, swi.is_night, swi.is_aerial
      ORDER BY swi.report_id, swi.item_order
    `).all(...reportIds) as any[]
  }

  // stats: 프론트가 기대하는 flat 구조
  const rowMap: Record<number, any> = {}
  rows.forEach((r: any) => { rowMap[r.id] = r })
  const stats = items.map((it: any) => ({
    work_label:               it.work_label,
    unit:                     it.unit,
    total_qty:                it.total_qty || 0,
    worker_team:              rowMap[it.report_id]?.worker_team              || '',
    request_no:               rowMap[it.report_id]?.request_no               || '',
    task_title:               rowMap[it.report_id]?.task_title               || '',
    construction_work_class:  rowMap[it.report_id]?.construction_work_class  || '',
    status:                   rowMap[it.report_id]?.status                   || '',
    is_night:                 it.is_night,
    is_aerial:                it.is_aerial,
    report_id:                it.report_id,
  }))

  return c.json({ stats, rows, items })
})

// GET /:id — 단건 상세 (items 포함)
spliceApp.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const id    = Number(c.req.param('id'))
  const report = rawDb.prepare(`SELECT * FROM splice_reports WHERE id=?`).get(id) as any
  if (!report) return c.json({ error: '없음' }, 404)
  const items = rawDb.prepare(
    `SELECT * FROM splice_work_items WHERE report_id=? ORDER BY item_order`
  ).all(id)
  return c.json({ report, items })
})

// POST / — 저장(임시저장)
spliceApp.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const body  = await c.req.json() as any
  const { task_id, work_date, worker_team, manager_name, remark, items } = body

  let reportId = body.report_id || null

  if (reportId) {
    const cur = rawDb.prepare(`SELECT status FROM splice_reports WHERE id=?`).get(reportId) as any
    if (cur && (cur.status === 'submitted' || cur.status === 'confirmed')) {
      return c.json({ error: '이미 제출된 일보는 수정할 수 없습니다.', reportId, status: cur.status }, 409)
    }
    rawDb.prepare(`
      UPDATE splice_reports
      SET task_id=?, work_date=?, worker_team=?, manager_name=?, remark=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(task_id || null, work_date || '', worker_team || '', manager_name || '', remark || '', reportId)
  } else {
    if (task_id) {
      const existing = rawDb.prepare(`SELECT id, status FROM splice_reports WHERE task_id=?`).get(task_id) as any
      if (existing) {
        return c.json({ error: '이미 작성된 접속일보가 있습니다.', reportId: existing.id, status: existing.status }, 409)
      }
    }
    const res = rawDb.prepare(`
      INSERT INTO splice_reports (task_id, work_date, worker_team, manager_name, remark, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'draft', ?)
    `).run(task_id || null, work_date || '', worker_team || '', manager_name || '', remark || '', user.id) as any
    reportId = res.lastInsertRowid
  }

  rawDb.prepare(`DELETE FROM splice_work_items WHERE report_id=?`).run(reportId)
  const stmt = rawDb.prepare(`
    INSERT INTO splice_work_items (report_id, item_order, work_label, is_night, is_aerial, qty, unit, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  let order = 0
  for (const it of (items || [])) {
    if (!it.work_label) continue
    stmt.run(reportId, order++, it.work_label, it.is_night ? 1 : 0, it.is_aerial ? 1 : 0,
             parseInt(it.qty) || 0, it.unit || '', it.remark || '')
  }

  return c.json({ ok: true, reportId })
})

// POST /:id/submit
spliceApp.post('/:id/submit', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const id    = Number(c.req.param('id'))
  rawDb.prepare(`UPDATE splice_reports SET status='submitted', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id)
  return c.json({ ok: true })
})

// POST /:id/revert
spliceApp.post('/:id/revert', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const id    = Number(c.req.param('id'))
  const existing = rawDb.prepare(`SELECT id, status FROM splice_reports WHERE id=?`).get(id) as any
  if (!existing) return c.json({ error: '일보를 찾을 수 없습니다.' }, 404)
  if (existing.status === 'confirmed') return c.json({ error: '확정된 일보는 수정할 수 없습니다.' }, 403)
  rawDb.prepare(`UPDATE splice_reports SET status='draft', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id)
  return c.json({ ok: true })
})

// DELETE /:id
spliceApp.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const id    = Number(c.req.param('id'))
  rawDb.prepare(`DELETE FROM splice_reports WHERE id=?`).run(id)
  return c.json({ ok: true })
})

export default spliceApp

// ─── splice-unit-prices 라우트 (별도 Hono 앱) ───────────────────────────────
export function createSpliceUnitPricesRoutes() {
  const r = new Hono()

  // GET /
  r.get('/', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const rows  = rawDb.prepare(`SELECT * FROM splice_unit_prices ORDER BY sort_order`).all()
    return c.json({ prices: rows })
  })

  // PUT /
  r.put('/', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const roleUi = dbRoleToUi(user.role, user.position, user.sub_role)
    if (roleUi !== 'sysadmin') return c.json({ error: '권한 없음' }, 403)
    const rawDb = getRawDb()
    const { prices } = await c.req.json() as any

    const stmtFull  = rawDb.prepare(`UPDATE splice_unit_prices SET unit_price=?, night_price=?, aerial_price=?, item_label=?, unit=? WHERE item_key=?`)
    const stmtPrice = rawDb.prepare(`UPDATE splice_unit_prices SET unit_price=?, night_price=?, aerial_price=? WHERE item_key=?`)

    for (const p of (prices || [])) {
      if (p.item_label !== undefined || p.unit !== undefined) {
        const label = (p.item_label || '').trim() || undefined
        const unit  = (p.unit || '').trim() || '개소'
        if (label) {
          stmtFull.run(p.unit_price || 0, p.night_price || 0, p.aerial_price || 0, label, unit, p.item_key)
        } else {
          stmtPrice.run(p.unit_price || 0, p.night_price || 0, p.aerial_price || 0, p.item_key)
        }
      } else {
        stmtPrice.run(p.unit_price || 0, p.night_price || 0, p.aerial_price || 0, p.item_key)
      }
    }
    return c.json({ ok: true })
  })

  // POST /
  r.post('/', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const roleUi = dbRoleToUi(user.role, user.position, user.sub_role)
    if (roleUi !== 'sysadmin') return c.json({ error: '권한 없음' }, 403)
    const rawDb = getRawDb()
    const { item_key, item_label, unit, unit_price } = await c.req.json() as any
    if (!item_key || !item_label) return c.json({ error: 'item_key, item_label 필수' }, 400)
    const maxSort = (rawDb.prepare(`SELECT MAX(sort_order) AS m FROM splice_unit_prices`).get() as any)?.m || 0
    rawDb.prepare(
      `INSERT OR IGNORE INTO splice_unit_prices (item_key, item_label, unit, unit_price, night_price, aerial_price, sort_order) VALUES (?,?,?,?,0,0,?)`
    ).run(item_key, item_label, unit || '개소', Number(unit_price) || 0, maxSort + 1)
    return c.json({ ok: true })
  })

  // DELETE /:key
  r.delete('/:key', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const roleUi = dbRoleToUi(user.role, user.position, user.sub_role)
    if (roleUi !== 'sysadmin') return c.json({ error: '권한 없음' }, 403)
    const rawDb = getRawDb()
    const key   = c.req.param('key')
    rawDb.prepare(`DELETE FROM splice_unit_prices WHERE item_key=?`).run(key)
    return c.json({ ok: true })
  })

  // GET /export — 엑셀(CSV) 다운로드 (sysadmin)
  r.get('/export', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const roleUi = dbRoleToUi(user.role, user.position, user.sub_role)
    if (roleUi !== 'sysadmin') return c.json({ error: '권한 없음' }, 403)
    const rawDb = getRawDb()
    const rows = rawDb.prepare(
      `SELECT item_key, item_label, unit, unit_price, night_price, aerial_price, sort_order FROM splice_unit_prices ORDER BY sort_order`
    ).all() as any[]

    const BOM = '\uFEFF'
    const header = '공종키,공종명,단위,기본단가(원),야간추가금액(원),신호수배치(원),정렬순서'
    const csvEsc = (v: any) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = rows.map(r =>
      [r.item_key, r.item_label, r.unit ?? '개소',
       r.unit_price ?? 0, r.night_price ?? 0, r.aerial_price ?? 0, r.sort_order ?? 0
      ].map(csvEsc).join(',')
    )
    const csv = BOM + [header, ...lines].join('\r\n')

    c.header('Content-Type', 'text/csv; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('접속단가_' + new Date().toISOString().slice(0,10) + '.csv')}`)
    return c.body(csv)
  })

  // POST /import — 엑셀(CSV) 일괄 업로드 (sysadmin)
  r.post('/import', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const roleUi = dbRoleToUi(user.role, user.position, user.sub_role)
    if (roleUi !== 'sysadmin') return c.json({ error: '권한 없음' }, 403)
    const rawDb = getRawDb()

    try {
      const body = await c.req.text()
      const text = body.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) return c.json({ error: '데이터가 없습니다' }, 400)

      const parseCSVLine = (line: string): string[] => {
        const result: string[] = []
        let cur = '', inQ = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') {
            if (inQ && line[i+1] === '"') { cur += '"'; i++ }
            else inQ = !inQ
          } else if (ch === ',' && !inQ) {
            result.push(cur.trim()); cur = ''
          } else {
            cur += ch
          }
        }
        result.push(cur.trim())
        return result
      }

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase())
      const iKey    = headers.findIndex(h => h.includes('키') || h === 'item_key')
      const iLabel  = headers.findIndex(h => h.includes('공종명') || h === 'item_label')
      const iUnit   = headers.findIndex(h => h.includes('단위') || h === 'unit')
      const iPrice  = headers.findIndex(h =>
        (h.includes('기본단가') || h.includes('단가') || h.includes('기본'))
        && !h.includes('야간') && !h.includes('가공') && !h.includes('신호'))
      const iNight  = headers.findIndex(h => h.includes('야간'))
      const iAerial = headers.findIndex(h => h.includes('가공') || h.includes('신호수') || h.includes('aerial'))

      if (iKey < 0 || iLabel < 0 || iPrice < 0) {
        return c.json({ error: '필수 컬럼 없음 — 공종키, 공종명, 기본단가(원) 또는 기본(원) 컬럼이 필요합니다' }, 400)
      }

      const dataLines = lines.slice(1)
      let upserted = 0, skipped = 0

      // ── 공종키 접두어 검증: 접속은 반드시 'b'로 시작해야 함 ──
      const parsed = dataLines.map(l => parseCSVLine(l))
      const invalidKeys = parsed
        .map(cols => (cols[iKey] || '').trim())
        .filter(k => k && !k.toLowerCase().startsWith('b'))
      if (invalidKeys.length > 0) {
        return c.json({
          error: `접속 단가 파일 오류: 공종키는 반드시 'b'로 시작해야 합니다.\n잘못된 공종키: ${invalidKeys.slice(0,5).join(', ')}${invalidKeys.length > 5 ? ` 외 ${invalidKeys.length - 5}건` : ''}\n(외선 단가는 외선 탭에서 업로드하세요)`
        }, 400)
      }

      const maxSort = (rawDb.prepare(`SELECT MAX(sort_order) AS m FROM splice_unit_prices`).get() as any)?.m || 0
      const stmtUpsert = rawDb.prepare(`
        INSERT INTO splice_unit_prices (item_key, item_label, unit, unit_price, night_price, aerial_price, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_key) DO UPDATE SET
          item_label   = excluded.item_label,
          unit         = COALESCE(excluded.unit, unit),
          unit_price   = excluded.unit_price,
          night_price  = excluded.night_price,
          aerial_price = excluded.aerial_price
      `)

      const doImport = rawDb.transaction((rows: any[]) => {
        rows.forEach((cols, idx) => {
          const key    = (cols[iKey]   || '').trim()
          const label  = (cols[iLabel] || '').trim()
          const unit   = iUnit  >= 0 ? (cols[iUnit]  || '').trim() || '개소' : '개소'
          const price  = Number((cols[iPrice]  || '0').replace(/[^0-9.-]/g, '')) || 0
          const night  = iNight  >= 0 ? Number((cols[iNight]  || '0').replace(/[^0-9.-]/g, '')) || 0 : 0
          const aerial = iAerial >= 0 ? Number((cols[iAerial] || '0').replace(/[^0-9.-]/g, '')) || 0 : 0
          if (!key || !label) { skipped++; return }
          stmtUpsert.run(key, label, unit, price, night, aerial, maxSort + idx + 1)
          upserted++
        })
      })

      doImport(parsed)

      return c.json({ ok: true, upserted, skipped, total: dataLines.length })
    } catch (e: any) {
      return c.json({ error: 'CSV 파싱 실패: ' + e.message }, 400)
    }
  })

  return r
}
