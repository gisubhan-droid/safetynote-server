/**
 * work-reports.ts — 외선작업일보 + 물량단가 API
 *
 * 포함 라우트 (11개):
 *   GET  /api/work-reports/other-work-types
 *   GET  /api/work-reports/volume-stats
 *   GET  /api/volume-unit-prices
 *   PUT  /api/volume-unit-prices
 *   POST /api/volume-unit-prices
 *   DELETE /api/volume-unit-prices/:key
 *   GET  /api/work-reports/task/:taskId
 *   POST /api/work-reports
 *   POST /api/work-reports/:reportId/submit
 *   POST /api/work-reports/:reportId/revert
 *   POST /api/work-reports/:reportId/other-works
 *
 * 의존:
 *   - getRawDb(), getUser() from ../nas-db
 *
 * ⚠️ RULE-002: /work-reports/other-work-types, /work-reports/volume-stats,
 *              /work-reports/task/:taskId 는 /work-reports 마운트 전에 등록되어야 함
 *              → 이 파일 내에서 순서 보장 (/:reportId 이전에 등록)
 *
 * ⚠️ rawDb 동기 방식 사용: DB.prepare().run() 비동기 래퍼 절대 사용 금지
 */

import { Hono } from 'hono'
import { getRawDb, getUser } from '../nas-db'

const app = new Hono()

// ─── GET /other-work-types ───────────────────────────────────────────────────
app.get('/other-work-types', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const rows = rawDb.prepare(`SELECT * FROM other_work_types WHERE is_active=1 ORDER BY sort_order`).all()
  return c.json({ types: rows })
})

// ─── GET /monthly-amount — 월별 외선일보 작성완료 금액 합계 ─────────────────
// ⚠️ RULE-002: /volume-stats 보다 앞에 등록 (경로 우선순위)
app.get('/monthly-amount', async (c) => {
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
  const conJoinClause   = hasConFilter
    ? `LEFT JOIN tasks t ON t.id = r.task_id`
    : ''
  const conWhereClause  = hasConFilter
    ? `AND (t.construction_type IN (${conTypeList.map(() => '?').join(',')}) OR (r.task_id IS NULL))`
    : ''

  try {
    // ① 해당 월 작성완료(submitted) 외선일보 목록 (con_types 필터 적용)
    const baseParams: any[] = [start, end, ...conTypeList]
    const reports: any[] = rawDb.prepare(
      `SELECT r.id,
              (SELECT COALESCE(SUM(rc.usage_m),0) FROM work_report_cables rc WHERE rc.report_id=r.id AND rc.proc='신설') AS cable_new_m,
              (SELECT COALESCE(SUM(rc.usage_m),0) FROM work_report_cables rc WHERE rc.report_id=r.id AND rc.proc='철거') AS cable_remove_m,
              (SELECT COALESCE(SUM(rc.usage_m),0) FROM work_report_cables rc WHERE rc.report_id=r.id AND rc.proc='이설') AS cable_move_m
       FROM work_reports r
       ${conJoinClause}
       WHERE r.status = 'submitted'
         AND r.work_date BETWEEN ? AND ?
         ${conWhereClause}`
    ).all(...baseParams) as any[]

    if (reports.length === 0) {
      return c.json({ year: y, month: m, work_report_amount: 0 })
    }

    // ② 현재 단가 맵 (스냅샷 없는 건 fallback)
    const priceRows: any[] = rawDb.prepare(
      `SELECT item_key, unit_price FROM volume_unit_prices`
    ).all() as any[]
    const priceMap: Record<string, number> = {}
    priceRows.forEach((p: any) => { priceMap[p.item_key] = Number(p.unit_price) || 0 })

    // 케이블 단가 (고정 키)
    const pNew    = priceMap['a000001'] || 0
    const pRemove = priceMap['a000002'] || 0
    const pMove   = priceMap['a000003'] || 0

    // ③ extras 배치 조회 (스냅샷 단가 포함)
    const reportIds = reports.map((r: any) => r.id)
    const ph = reportIds.map(() => '?').join(',')
    const extras: any[] = rawDb.prepare(
      `SELECT report_id, item_key, SUM(qty) AS qty,
              MIN(unit_price_snapshot) AS unit_price_snapshot
       FROM work_report_extras
       WHERE report_id IN (${ph})
       GROUP BY report_id, item_key`
    ).all(...reportIds) as any[]

    // ④ 금액 합산
    let totalAmt = 0
    // 케이블 금액
    for (const r of reports) {
      totalAmt += (Number(r.cable_new_m)    || 0) * pNew
      totalAmt += (Number(r.cable_remove_m) || 0) * pRemove
      totalAmt += (Number(r.cable_move_m)   || 0) * pMove
    }
    // extras 금액 (item_key별 스냅샷 단가 우선, 없으면 현재 단가)
    for (const e of extras) {
      const qty  = Number(e.qty) || 0
      const snap = e.unit_price_snapshot != null ? Number(e.unit_price_snapshot) : null
      const up   = snap != null ? snap : (priceMap[e.item_key] || 0)
      totalAmt  += qty * up
    }

    return c.json({ year: y, month: m, work_report_amount: Math.round(totalAmt) })
  } catch (e: any) {
    console.error('[work-reports GET /monthly-amount]', e.message)
    return c.json({ error: e.message || '외선일보 금액 조회 실패' }, 500)
  }
})

// ─── GET /volume-stats ───────────────────────────────────────────────────────
app.get('/volume-stats', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const { construction_id, from_date, to_date } = c.req.query()

  let mainWhere  = `WHERE r.status  IN ('draft','submitted','confirmed')`
  let innerWhere = `WHERE r2.status IN ('draft','submitted','confirmed')`
  const params: any[]      = []
  const innerParams: any[] = []

  if (construction_id) {
    const sub = `(SELECT request_no FROM constructions WHERE id=?)`
    mainWhere  += ` AND t.request_no=${sub}`;  params.push(construction_id)
    innerWhere += ` AND t2.request_no=${sub}`; innerParams.push(construction_id)
  }
  if (from_date) {
    mainWhere  += ` AND r.work_date>=?`;  params.push(from_date)
    innerWhere += ` AND r2.work_date>=?`; innerParams.push(from_date)
  }
  if (to_date) {
    mainWhere  += ` AND r.work_date<=?`;  params.push(to_date)
    innerWhere += ` AND r2.work_date<=?`; innerParams.push(to_date)
  }
  if (user.role === 'worker') {
    mainWhere  += ` AND EXISTS (SELECT 1 FROM task_assignments ta  WHERE ta.task_id=t.id  AND ta.worker_id=?)`;  params.push(user.id)
    innerWhere += ` AND EXISTS (SELECT 1 FROM task_assignments ta2 WHERE ta2.task_id=t2.id AND ta2.worker_id=?)`; innerParams.push(user.id)
  }

  const rows = rawDb.prepare(`
    SELECT r.id AS report_id, r.work_date, r.worker_team,
           t.request_no, t.construction_type AS work_class, r.manager_name,
           (SELECT COALESCE(SUM(rl.usage_m),0) FROM work_report_cables rl WHERE rl.report_id=r.id) AS cable_total,
           (SELECT COALESCE(SUM(rl.usage_m),0) FROM work_report_cables rl WHERE rl.report_id=r.id AND rl.proc='신설') AS cable_new_m,
           (SELECT COALESCE(SUM(rl.usage_m),0) FROM work_report_cables rl WHERE rl.report_id=r.id AND rl.proc='철거') AS cable_remove_m,
           (SELECT COALESCE(SUM(rl.usage_m),0) FROM work_report_cables rl WHERE rl.report_id=r.id AND rl.proc='이설') AS cable_move_m
    FROM work_reports r JOIN tasks t ON t.id=r.task_id
    ${mainWhere} ORDER BY r.work_date DESC
  `).all(...params)

  const extras = rawDb.prepare(`
    SELECT re.report_id, re.item_key, SUM(re.qty) AS qty,
           MIN(re.unit_price_snapshot) AS unit_price_snapshot
    FROM work_report_extras re
    WHERE re.report_id IN (
      SELECT r2.id FROM work_reports r2 JOIN tasks t2 ON t2.id=r2.task_id
      ${innerWhere}
    )
    GROUP BY re.report_id, re.item_key
  `).all(...innerParams)

  const cables = rawDb.prepare(`
    SELECT rc.report_id, rc.lot_no, rc.spec, rc.maker, rc.mfg_year,
           rc.cable_type, rc.proc, rc.start_point, rc.end_point,
           rc.usage_m, rc.cable_kind, rc.special_note,
           r3.work_date, r3.worker_team, t3.request_no,
           t3.construction_type AS work_class
    FROM work_report_cables rc
    JOIN work_reports r3 ON r3.id = rc.report_id
    JOIN tasks t3 ON t3.id = r3.task_id
    WHERE rc.report_id IN (
      SELECT r2.id FROM work_reports r2 JOIN tasks t2 ON t2.id=r2.task_id
      ${innerWhere}
    )
    ORDER BY r3.work_date DESC, rc.report_id, rc.cable_order
  `).all(...innerParams)

  return c.json({ rows, extras, cables })
})

// ─── GET /task/:taskId ───────────────────────────────────────────────────────
// ⚠️ RULE-002: 반드시 /:reportId 등록 전에 위치
app.get('/task/:taskId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()
  const taskId = Number(c.req.param('taskId'))
  const report = rawDb.prepare(`
    SELECT r.*, t.task_number, t.work_number, t.request_no, t.title,
           t.construction_type, t.work_completed_at, t.work_date AS task_work_date,
           cs.title AS construction_title, cs.manager_name, cs.work_class
    FROM work_reports r JOIN tasks t ON t.id=r.task_id
    LEFT JOIN constructions cs ON cs.request_no=t.request_no
    WHERE r.task_id=?
  `).get(taskId)
  if (!report) return c.json({ report: null })
  const rid    = (report as any).id
  const lines  = rawDb.prepare(`SELECT * FROM work_report_lines WHERE report_id=? ORDER BY line_order`).all(rid)
  const cables = rawDb.prepare(`SELECT * FROM work_report_cables WHERE report_id=? ORDER BY cable_order`).all(rid)
  const others = rawDb.prepare(`
    SELECT o.*, wt.name, wt.unit, wt.sort_order FROM work_report_other o
    JOIN other_work_types wt ON wt.id=o.other_type_id WHERE o.report_id=? ORDER BY wt.sort_order
  `).all(rid)
  const extras = rawDb.prepare(
    `SELECT set_no, item_key, qty FROM work_report_extras WHERE report_id=? ORDER BY set_no, id`
  ).all(rid)
  return c.json({ report, lines, cables, others, extras })
})

// ─── POST / (외선일보 저장/갱신) ─────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb = getRawDb()

  let body: any
  try { body = await c.req.json() } catch (_) { return c.json({ error: '요청 형식 오류' }, 400) }

  const { task_id, detail_type = '' } = body
  if (!task_id) return c.json({ error: 'task_id 필수' }, 400)

  try {
    const task = rawDb.prepare(`
      SELECT t.*, cs.manager_name FROM tasks t
      LEFT JOIN constructions cs ON cs.request_no=t.request_no WHERE t.id=?
    `).get(task_id) as any
    if (!task) return c.json({ error: '작업 없음' }, 404)

    let worker_team = task.contractor_name || ''
    try {
      const teamRow = rawDb.prepare(`
        SELECT DISTINCT tm.name AS team_name FROM task_assignments ta
        JOIN users u ON u.id=ta.worker_id JOIN teams tm ON tm.id=u.team_id
        WHERE ta.task_id=? LIMIT 1
      `).get(task_id) as any
      if (teamRow?.team_name) worker_team = teamRow.team_name
    } catch (_) { /* teams 테이블 없는 구버전 DB 무시 */ }

    const manager_name = task.manager_name || task.lgu_supervisor || ''
    const work_date    = task.work_completed_at || task.work_date || ''

    const existing = rawDb.prepare(`SELECT id, status FROM work_reports WHERE task_id=?`).get(task_id) as any
    let reportId: number

    if (existing) {
      if (existing.status === 'confirmed') {
        return c.json({ error: '확정된 일보는 수정할 수 없습니다.', reportId: existing.id, status: existing.status }, 409)
      }
      if (existing.status === 'submitted') {
        return c.json({ error: '이미 제출된 일보가 있습니다. 수정하기 버튼을 먼저 눌러주세요.', reportId: existing.id, status: existing.status }, 409)
      }
      rawDb.prepare(
        `UPDATE work_reports SET detail_type=?,worker_team=?,manager_name=?,work_date=?,updated_at=CURRENT_TIMESTAMP WHERE task_id=?`
      ).run(detail_type, worker_team, manager_name, work_date, task_id)
      reportId = existing.id
    } else {
      const ins = rawDb.prepare(
        `INSERT INTO work_reports (task_id,detail_type,worker_team,manager_name,work_date,status,created_by) VALUES (?,?,?,?,?,'draft',?)`
      ).run(task_id, detail_type, worker_team, manager_name, work_date, user.id)
      reportId = ins.lastInsertRowid as number
    }

    // [BUG-020] 수신 데이터 상세 로그
    console.log(`[WR-POST] reportId=${reportId}, task_id=${body.task_id}`)
    console.log(`[WR-POST] cables 배열 길이=${body.cables?.length ?? 'undefined'}, cable_sets 배열 길이=${body.cable_sets?.length ?? 'undefined'}`)
    if (Array.isArray(body.cables) && body.cables.length > 0) {
      console.log(`[WR-POST] cables[0] 샘플:`, JSON.stringify(body.cables[0]))
    }
    if (Array.isArray(body.cable_sets) && body.cable_sets.length > 0) {
      console.log(`[WR-POST] cable_sets[0] extras 수:`, body.cable_sets[0]?.extras?.length ?? 0)
    }

    // 케이블 데이터 저장 (BUG-020: 빈 행 제외, 오염 spec값 정규화)
    if (Array.isArray(body.cables) && body.cables.length > 0) {
      try {
        rawDb.prepare(`DELETE FROM work_report_cables WHERE report_id=?`).run(reportId)
        const cableStmt = rawDb.prepare(`
          INSERT INTO work_report_cables
            (report_id,cable_order,lot_no,spec,maker,mfg_year,cable_type,work_div,
             start_point,end_point,usage_m,cable_kind,cable_code,special_note,proc,remark,asset_type)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        let cableOrder = 0
        let skipCount  = 0
        for (const cb of body.cables) {
          const specVal  = cb.spec != null ? String(cb.spec) : ''
          const specHasData = !!(specVal && specVal !== '0' && specVal !== '0.0')
          const hasData  = !!(cb.lot_no || cb.maker || cb.cable_kind || cb.proc || cb.remark ||
                              specHasData ||
                              (cb.usage_m && cb.usage_m !== 0) ||
                              cb.start_point != null || cb.end_point != null)
          if (!hasData) { skipCount++; continue }
          const sp       = cb.start_point != null ? String(cb.start_point) : ''
          const ep       = cb.end_point   != null ? String(cb.end_point)   : ''
          const specNorm = (specVal === '0.0' || specVal === '0') ? '' : specVal
          cableStmt.run(
            reportId, cableOrder++,
            cb.lot_no||'', specNorm, cb.maker||'', cb.mfg_year||'',
            '', '',
            sp, ep,
            cb.usage_m||0,
            cb.cable_kind||'', '', '',
            cb.proc||'', cb.remark||'',
            cb.asset_type||''
          )
        }
        console.log(`[WR-POST] cables 저장: reportId=${reportId}, 저장=${cableOrder}행, 스킵=${skipCount}행`)
      } catch (cableErr: any) {
        console.error('[WR-POST] cables 저장 실패:', cableErr.message)
      }
    } else {
      if (!Array.isArray(body.cables)) {
        console.warn(`[WR-POST] ⚠️ cables가 배열이 아님: typeof=${typeof body.cables}`)
      } else {
        console.log(`[WR-POST] cables 빈 배열 — 저장 스킵`)
      }
    }

    // cable_sets의 extras(추가입력) 저장 (BUG-020)
    if (Array.isArray(body.cable_sets) && body.cable_sets.length > 0) {
      try {
        rawDb.prepare(`DELETE FROM work_report_extras WHERE report_id=?`).run(reportId)
        const priceSnapshotRows = rawDb.prepare(`SELECT item_key, unit_price FROM volume_unit_prices`).all() as any[]
        const priceSnapshotMap: Record<string, number> = {}
        for (const p of priceSnapshotRows) priceSnapshotMap[p.item_key] = Number(p.unit_price) || 0

        const extraStmt = rawDb.prepare(
          `INSERT INTO work_report_extras (report_id, set_no, item_key, qty, unit_price_snapshot) VALUES (?,?,?,?,?)`
        )
        let extraCount = 0
        for (const cs of body.cable_sets) {
          const setNo    = cs.set_no || 1
          const csExtras = cs.extras
          if (!Array.isArray(csExtras)) {
            console.warn(`[WR-POST] cable_sets[set_no=${setNo}].extras가 배열이 아님: ${typeof csExtras}`)
            continue
          }
          console.log(`[WR-POST] set_no=${setNo} extras 수신: ${csExtras.length}개`)
          for (const ex of csExtras) {
            const qty = Number(ex.qty)
            const key = ex.key || ex.item_key || ''
            if (key && qty > 0) {
              const snapshot = priceSnapshotMap[key] ?? null
              extraStmt.run(reportId, setNo, String(key), qty, snapshot)
              extraCount++
              console.log(`[WR-POST]   extras INSERT: key="${key}", qty=${qty}, price_snapshot=${snapshot}`)
            }
          }
        }
        console.log(`[WR-POST] extras 저장 완료: reportId=${reportId}, 저장항목=${extraCount}`)
      } catch (extrasErr: any) {
        console.error('[WR-POST] extras 저장 실패:', extrasErr.message)
      }
    } else {
      if (!Array.isArray(body.cable_sets)) {
        console.warn(`[WR-POST] ⚠️ cable_sets가 배열이 아님: typeof=${typeof body.cable_sets}`)
      } else {
        console.log(`[WR-POST] cable_sets 빈 배열 — extras 저장 스킵 (reportId=${reportId})`)
      }
    }

    return c.json({ ok: true, reportId })

  } catch (e: any) {
    console.error('[work-reports POST /] 오류:', e.message, e.stack)
    return c.json({ error: e.message || '일보 저장 실패' }, 500)
  }
})

// ─── POST /:reportId/submit ───────────────────────────────────────────────────
app.post('/:reportId/submit', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb    = getRawDb()
  const reportId = Number(c.req.param('reportId'))
  rawDb.prepare(`UPDATE work_reports SET status='submitted', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reportId)
  return c.json({ ok: true })
})

// ─── POST /:reportId/revert ──────────────────────────────────────────────────
app.post('/:reportId/revert', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb    = getRawDb()
  const reportId = Number(c.req.param('reportId'))
  const existing = rawDb.prepare(`SELECT id, status FROM work_reports WHERE id=?`).get(reportId) as any
  if (!existing) return c.json({ error: '일보를 찾을 수 없습니다.' }, 404)
  if (existing.status === 'confirmed') return c.json({ error: '확정된 일보는 수정할 수 없습니다.' }, 403)
  rawDb.prepare(`UPDATE work_reports SET status='draft', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reportId)
  return c.json({ ok: true })
})

// ─── POST /:reportId/other-works ─────────────────────────────────────────────
app.post('/:reportId/other-works', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rawDb    = getRawDb()
  const reportId = Number(c.req.param('reportId'))
  const items    = await c.req.json() as any[]
  rawDb.prepare(`DELETE FROM work_report_other WHERE report_id=?`).run(reportId)
  const stmt = rawDb.prepare(
    `INSERT OR REPLACE INTO work_report_other (report_id,other_type_id,quantity) VALUES (?,?,?)`
  )
  for (const item of items) {
    if (!item.other_type_id || item.quantity == null) continue
    stmt.run(reportId, item.other_type_id, item.quantity)
  }
  return c.json({ ok: true })
})

export default app

// ─── volume-unit-prices 라우트 (별도 Hono 앱) ───────────────────────────────
// node-server.ts에서 app.route('/api/volume-unit-prices', volumeUnitPricesRoutes) 로 마운트
export function createVolumeUnitPricesRoutes() {
  const r = new Hono()

  // GET / — 단가 목록 조회
  r.get('/', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const prices = rawDb.prepare(
      `SELECT item_key, item_label, unit_price, unit, sort_order FROM volume_unit_prices ORDER BY sort_order`
    ).all()
    return c.json({ prices })
  })

  // PUT / — 단가 수정 (sysadmin)
  r.put('/', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const isSysadmin = user.sub_role === 'sysadmin' || user.position === '시스템관리자'
    if (!isSysadmin) return c.json({ error: '시스템관리자만 수정할 수 있습니다' }, 403)
    const rawDb = getRawDb()
    const { prices } = await c.req.json()
    if (!Array.isArray(prices)) return c.json({ error: '잘못된 요청' }, 400)

    const stmtFull  = rawDb.prepare(`UPDATE volume_unit_prices SET unit_price=?, item_label=?, unit=? WHERE item_key=?`)
    const stmtUnit  = rawDb.prepare(`UPDATE volume_unit_prices SET unit_price=?, unit=? WHERE item_key=?`)
    const stmtPrice = rawDb.prepare(`UPDATE volume_unit_prices SET unit_price=? WHERE item_key=?`)

    const update = rawDb.transaction((list: any[]) => {
      for (const p of list) {
        const label = (p.item_label || '').trim()
        const unit  = (p.unit !== undefined) ? ((p.unit || '').trim() || '식') : undefined
        const price = Number(p.unit_price) || 0
        if (label && unit !== undefined) {
          stmtFull.run(price, label, unit, p.item_key)
        } else if (unit !== undefined) {
          stmtUnit.run(price, unit, p.item_key)
        } else if (label) {
          const cur = rawDb.prepare(`SELECT unit FROM volume_unit_prices WHERE item_key=?`).get(p.item_key) as any
          stmtFull.run(price, label, cur?.unit || '식', p.item_key)
        } else {
          stmtPrice.run(price, p.item_key)
        }
      }
    })
    update(prices)
    return c.json({ ok: true })
  })

  // POST / — 외선 공종 추가 (sysadmin)
  r.post('/', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const isSysadmin = user.sub_role === 'sysadmin' || user.position === '시스템관리자'
    if (!isSysadmin) return c.json({ error: '권한 없음' }, 403)
    const rawDb = getRawDb()
    const { item_key, item_label, unit_price, unit } = await c.req.json() as any
    if (!item_key || !item_label) return c.json({ error: 'item_key, item_label 필수' }, 400)
    const maxSort = (rawDb.prepare(`SELECT MAX(sort_order) AS m FROM volume_unit_prices`).get() as any)?.m || 0
    rawDb.prepare(
      `INSERT OR IGNORE INTO volume_unit_prices (item_key, item_label, unit_price, unit, sort_order) VALUES (?,?,?,?,?)`
    ).run(item_key, item_label, Number(unit_price) || 0, unit || '식', maxSort + 1)
    return c.json({ ok: true })
  })

  // DELETE /:key — 외선 공종 삭제 (sysadmin)
  r.delete('/:key', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const isSysadmin = user.sub_role === 'sysadmin' || user.position === '시스템관리자'
    if (!isSysadmin) return c.json({ error: '권한 없음' }, 403)
    const rawDb = getRawDb()
    const key = c.req.param('key')
    rawDb.prepare(`DELETE FROM volume_unit_prices WHERE item_key=?`).run(key)
    return c.json({ ok: true })
  })

  // GET /export — 엑셀(CSV) 다운로드 (sysadmin)
  r.get('/export', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const isSysadmin = user.sub_role === 'sysadmin' || user.position === '시스템관리자'
    if (!isSysadmin) return c.json({ error: '권한 없음' }, 403)
    const rawDb = getRawDb()
    const rows = rawDb.prepare(
      `SELECT item_key, item_label, unit_price, unit, sort_order FROM volume_unit_prices ORDER BY sort_order`
    ).all() as any[]

    // BOM + CSV 생성 (엑셀에서 한글 깨짐 방지)
    const BOM = '\uFEFF'
    const header = '공종키,공종명,단가(원),단위,정렬순서'
    const csvEsc = (v: any) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = rows.map(r =>
      [r.item_key, r.item_label, r.unit_price ?? 0, r.unit ?? '식', r.sort_order ?? 0].map(csvEsc).join(',')
    )
    const csv = BOM + [header, ...lines].join('\r\n')

    c.header('Content-Type', 'text/csv; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('외선단가_' + new Date().toISOString().slice(0,10) + '.csv')}`)
    return c.body(csv)
  })

  // POST /import — 엑셀(CSV) 일괄 업로드 (sysadmin)
  // 업로드된 CSV를 파싱하여 DB upsert
  // 처리 규칙: item_key 기준으로 UPSERT (기존 = UPDATE, 신규 = INSERT)
  r.post('/import', async (c) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const isSysadmin = user.sub_role === 'sysadmin' || user.position === '시스템관리자'
    if (!isSysadmin) return c.json({ error: '권한 없음' }, 403)
    const rawDb = getRawDb()

    try {
      const body = await c.req.text()
      // BOM 제거
      const text = body.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) return c.json({ error: '데이터가 없습니다' }, 400)

      // 헤더 파싱
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
      // 컬럼 인덱스 탐색 (헤더명 유연하게 대응)
      const iKey   = headers.findIndex(h => h.includes('키') || h === 'item_key')
      const iLabel = headers.findIndex(h => h.includes('공종명') || h === 'item_label')
      const iPrice = headers.findIndex(h => h.includes('단가') || h === 'unit_price')
      const iUnit  = headers.findIndex(h => h.includes('단위') || h === 'unit')

      if (iKey < 0 || iLabel < 0 || iPrice < 0) {
        return c.json({ error: '필수 컬럼 없음 — 공종키, 공종명, 단가(원) 컬럼이 필요합니다' }, 400)
      }

      const dataLines = lines.slice(1)
      let upserted = 0, skipped = 0

      // ── 공종키 접두어 검증: 외선은 반드시 'a'로 시작해야 함 ──
      const parsed = dataLines.map(l => parseCSVLine(l))
      const invalidKeys = parsed
        .map(cols => (cols[iKey] || '').trim())
        .filter(k => k && !k.toLowerCase().startsWith('a'))
      if (invalidKeys.length > 0) {
        return c.json({
          error: `외선 단가 파일 오류: 공종키는 반드시 'a'로 시작해야 합니다.\n잘못된 공종키: ${invalidKeys.slice(0,5).join(', ')}${invalidKeys.length > 5 ? ` 외 ${invalidKeys.length - 5}건` : ''}\n(접속 단가는 접속 탭에서 업로드하세요)`
        }, 400)
      }

      const maxSort = (rawDb.prepare(`SELECT MAX(sort_order) AS m FROM volume_unit_prices`).get() as any)?.m || 0
      const stmtUpsert = rawDb.prepare(`
        INSERT INTO volume_unit_prices (item_key, item_label, unit_price, unit, sort_order)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(item_key) DO UPDATE SET
          item_label = excluded.item_label,
          unit_price = excluded.unit_price,
          unit       = COALESCE(excluded.unit, unit)
      `)

      const doImport = rawDb.transaction((rows: any[]) => {
        rows.forEach((cols, idx) => {
          const key   = (cols[iKey]   || '').trim()
          const label = (cols[iLabel] || '').trim()
          const price = Number((cols[iPrice] || '0').replace(/[^0-9.-]/g, '')) || 0
          const unit  = iUnit >= 0 ? (cols[iUnit] || '').trim() || '식' : '식'
          if (!key || !label) { skipped++; return }
          stmtUpsert.run(key, label, price, unit, maxSort + idx + 1)
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
