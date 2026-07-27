// src/routes/cable-incoming.ts — 광케이블 입고관리 API [FEAT-177]

import { Hono } from 'hono'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// ─── 헬퍼: DB 가져오기 ────────────────────────────────────────
function getDB(c: any) { return c.env?.DB || (c as any).db }

// ═══════════════════════════════════════════════════════════════
// GET /api/cable-incoming
// 전체 입고 내역 조회 (최신순)
// ═══════════════════════════════════════════════════════════════
app.get('/', async (c) => {
  const db = getDB(c)
  try {
    const rows = await db.prepare(`
      SELECT * FROM cable_incoming
      ORDER BY in_date DESC, id DESC
    `).all()
    return c.json({ items: rows.results || [] })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════
// GET /api/cable-incoming/holding
// 보유 현황 집계: 입고량 - 사용량(일보 기준)
// 사용량: work_report_cables 테이블에서 spec/maker/cable_kind 기준 집계
// ═══════════════════════════════════════════════════════════════
app.get('/holding', async (c) => {
  const db = getDB(c)
  try {
    // 입고량 집계
    const inRows = await db.prepare(`
      SELECT
        maker,
        spec,
        cable_kind,
        asset_type,
        SUM(qty_m) AS in_qty
      FROM cable_incoming
      GROUP BY maker, spec, cable_kind, asset_type
    `).all()

    // 사용량 집계 (work_report_cables — 확정 또는 제출 일보 기준)
    const useRows = await db.prepare(`
      SELECT
        wrc.maker,
        wrc.spec,
        wrc.cable_kind,
        wrc.asset_type,
        SUM(wrc.usage_m) AS use_qty
      FROM work_report_cables wrc
      JOIN work_reports wr ON wr.id = wrc.report_id
      WHERE wr.status IN ('confirmed','submitted')
      GROUP BY wrc.maker, wrc.spec, wrc.cable_kind, wrc.asset_type
    `).all()

    // 사용량 맵 (maker|spec|kind|asset_type 키)
    const useMap: Record<string, number> = {}
    const useList = useRows.results || []
    for (const r of useList as any[]) {
      const k = (r.maker || '') + '|' + (r.spec || '') + '|' + (r.cable_kind || '') + '|' + (r.asset_type || '')
      useMap[k] = (useMap[k] || 0) + (r.use_qty || 0)
    }

    // 합산
    const items = (inRows.results || []).map((r: any) => {
      const k = (r.maker || '') + '|' + (r.spec || '') + '|' + (r.cable_kind || '') + '|' + (r.asset_type || '')
      return {
        maker:      r.maker      || '-',
        spec:       r.spec       || '-',
        cable_kind: r.cable_kind || '-',
        asset_type: r.asset_type || '-',
        in_qty:     r.in_qty     || 0,
        use_qty:    useMap[k]    || 0,
      }
    })

    // 사용량만 있고 입고가 없는 항목도 표시 (asset_type 포함)
    for (const r of useList as any[]) {
      const k = (r.maker || '') + '|' + (r.spec || '') + '|' + (r.cable_kind || '') + '|' + (r.asset_type || '')
      const alreadyIn = (inRows.results || []).some(
        (i: any) => ((i.maker||'')+'|'+(i.spec||'')+'|'+(i.cable_kind||'')+'|'+(i.asset_type||'')) === k
      )
      if (!alreadyIn) {
        items.push({
          maker:      r.maker      || '-',
          spec:       r.spec       || '-',
          cable_kind: r.cable_kind || '-',
          asset_type: r.asset_type || '-',
          in_qty:     0,
          use_qty:    r.use_qty    || 0,
        })
      }
    }

    items.sort((a, b) => (a.maker + a.spec + a.cable_kind + a.asset_type).localeCompare(b.maker + b.spec + b.cable_kind + b.asset_type))
    return c.json({ items })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════
// POST /api/cable-incoming
// 입고 등록
// Body: { in_date, lot_no, spec, maker, mfg_year, cable_kind, qty_m, remark }
// ═══════════════════════════════════════════════════════════════
app.post('/', async (c) => {
  const db = getDB(c)
  try {
    const body = await c.req.json() as any
    const { in_date, lot_no = '', spec = '', maker = '', mfg_year = '', cable_kind = '', cable_type = '', asset_type = '', qty_m = 0, remark = '' } = body

    if (!in_date) return c.json({ error: '입고일은 필수입니다.' }, 400)
    if (!qty_m || Number(qty_m) <= 0) return c.json({ error: '입고량(M)은 0보다 커야 합니다.' }, 400)

    const result = await db.prepare(`
      INSERT INTO cable_incoming
        (in_date, lot_no, spec, maker, mfg_year, cable_kind, cable_type, asset_type, qty_m, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(in_date, lot_no, spec, maker, mfg_year, cable_kind, cable_type, asset_type, Number(qty_m), remark).run()

    return c.json({ id: result.meta?.last_row_id, success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════
// GET /api/cable-incoming/:id
// 단건 조회 (수정 모달용)
// ═══════════════════════════════════════════════════════════════
app.get('/:id', async (c) => {
  const db = getDB(c)
  const id = Number(c.req.param('id'))
  try {
    const row = await db.prepare('SELECT * FROM cable_incoming WHERE id = ?').bind(id).first()
    if (!row) return c.json({ error: '항목을 찾을 수 없습니다.' }, 404)
    return c.json({ item: row })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════
// PUT /api/cable-incoming/:id
// 입고 내역 수정
// Body: { in_date, lot_no, spec, maker, mfg_year, cable_kind, asset_type, qty_m, remark }
// ═══════════════════════════════════════════════════════════════
app.put('/:id', async (c) => {
  const db = getDB(c)
  const id = Number(c.req.param('id'))
  try {
    const body = await c.req.json() as any
    const { in_date, lot_no = '', spec = '', maker = '', mfg_year = '', cable_kind = '', cable_type = '', asset_type = '', qty_m = 0, remark = '' } = body

    if (!in_date) return c.json({ error: '입고일은 필수입니다.' }, 400)
    if (!qty_m || Number(qty_m) <= 0) return c.json({ error: '입고량(M)은 0보다 커야 합니다.' }, 400)

    await db.prepare(`
      UPDATE cable_incoming
      SET in_date=?, lot_no=?, spec=?, maker=?, mfg_year=?, cable_kind=?, cable_type=?, asset_type=?, qty_m=?, remark=?
      WHERE id=?
    `).bind(in_date, lot_no, spec, maker, mfg_year, cable_kind, cable_type, asset_type, Number(qty_m), remark, id).run()

    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════
// DELETE /api/cable-incoming/:id
// 입고 내역 삭제
// ═══════════════════════════════════════════════════════════════
app.delete('/:id', async (c) => {
  const db = getDB(c)
  const id = Number(c.req.param('id'))
  try {
    await db.prepare('DELETE FROM cable_incoming WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default app
