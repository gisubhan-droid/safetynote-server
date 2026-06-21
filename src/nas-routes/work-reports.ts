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

  return r
}
