/**
 * nas-routes/legal-notices.ts — 법령안내 API (NAS 전용)
 *
 * ⚠️ src/routes/legal-notices.ts (Cloudflare D1 버전)와 별개 파일
 *
 * 포함 라우트:
 *   GET    /api/legal-notices        — 전체 조회
 *   GET    /api/legal-notices/:key   — 단건 조회
 *   POST   /api/legal-notices        — 신규 추가 (admin)
 *   PUT    /api/legal-notices/:key   — 수정 (admin/supervisor)
 *   DELETE /api/legal-notices/:key   — 삭제 (admin, 소프트)
 */

import { Hono } from 'hono'
import { getRawDb, getUser } from '../nas-db'

const app = new Hono()

// GET / — 전체 조회
app.get('/', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const rows = rawDb.prepare(
    `SELECT ln.*, u.name as updated_by_name
     FROM legal_notices ln
     LEFT JOIN users u ON u.id = ln.updated_by
     WHERE ln.is_active = 1
     ORDER BY ln.id`
  ).all()
  return c.json(rows)
})

// GET /:key — 단건 조회
app.get('/:key', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const key = c.req.param('key')
  try {
    const row = rawDb.prepare('SELECT * FROM legal_notices WHERE notice_key=? AND is_active=1').get(key)
    // BUG-076: 키가 없을 때 404 대신 null 반환 — 프론트에서 catch 없이도 조용히 처리 가능
    if (!row) return c.json(null, 200)
    return c.json(row)
  } catch(e: any) {
    // legal_notices 테이블 없는 구버전 DB 방어
    return c.json(null, 200)
  }
})

// POST / — 신규 추가 (admin만)
app.post('/', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자만 추가할 수 있습니다.' }, 403)
  const body = await c.req.json().catch(() => ({})) as any
  const { notice_key, title, law_ref, content } = body
  if (!notice_key || !title || !content) return c.json({ error: '키, 제목, 내용은 필수입니다.' }, 400)
  if (!/^[a-zA-Z0-9_]+$/.test(notice_key)) return c.json({ error: '키는 영문, 숫자, 언더바(_)만 가능합니다.' }, 400)
  const existing = rawDb.prepare('SELECT id FROM legal_notices WHERE notice_key=?').get(notice_key)
  if (existing) return c.json({ error: '이미 존재하는 키입니다: ' + notice_key }, 409)
  rawDb.prepare(
    `INSERT INTO legal_notices (notice_key, title, law_ref, content, is_active, updated_by, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)`
  ).run(notice_key, title, law_ref || null, content, user.id)
  const created = rawDb.prepare('SELECT * FROM legal_notices WHERE notice_key=?').get(notice_key)
  return c.json({ success: true, data: created }, 201)
})

// PUT /:key — 수정 (admin/supervisor만)
app.put('/:key', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role === 'worker') return c.json({ error: '권한이 없습니다.' }, 403)
  const key = c.req.param('key')
  const body = await c.req.json().catch(() => ({})) as any
  const { title, content, law_ref } = body
  if (!title || !content) return c.json({ error: '제목과 내용은 필수입니다.' }, 400)
  rawDb.prepare(
    `UPDATE legal_notices SET title=?, content=?, law_ref=?,
     updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE notice_key=?`
  ).run(title, content, law_ref || null, user.id, key)
  return c.json({ success: true })
})

// DELETE /:key — 소프트 삭제 (admin만)
app.delete('/:key', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자만 삭제할 수 있습니다.' }, 403)
  const key = c.req.param('key')
  const row = rawDb.prepare('SELECT id FROM legal_notices WHERE notice_key=? AND is_active=1').get(key)
  if (!row) return c.json({ error: '존재하지 않는 법령안내입니다.' }, 404)
  rawDb.prepare(`UPDATE legal_notices SET is_active=0, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE notice_key=?`).run(user.id, key)
  return c.json({ success: true })
})

export default app
