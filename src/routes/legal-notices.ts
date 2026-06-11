import { Hono } from 'hono'
import { jwt } from 'hono/jwt'

type Bindings = { DB: D1Database }
type Variables = { jwtPayload: { id: number; role: string; name: string } }

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// JWT 인증
router.use('*', (c, next) => {
  const jwtMiddleware = jwt({ secret: c.env.SESSION_SECRET || 'safetynote-secret' })
  return jwtMiddleware(c, next)
})

// ─── GET /api/legal-notices ─────────────────────────────────────────────────
// 모든 법령안내 목록 반환
router.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT
        ln.*,
        u.name AS updated_by_name
      FROM legal_notices ln
      LEFT JOIN users u ON u.id = ln.updated_by
      WHERE ln.is_active = 1
      ORDER BY ln.notice_key ASC
    `).all()
    return c.json(results || [])
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── GET /api/legal-notices/:key ────────────────────────────────────────────
// 개별 법령안내 조회
router.get('/:key', async (c) => {
  const key = c.req.param('key')
  try {
    const row = await c.env.DB.prepare(`
      SELECT
        ln.*,
        u.name AS updated_by_name
      FROM legal_notices ln
      LEFT JOIN users u ON u.id = ln.updated_by
      WHERE ln.notice_key = ? AND ln.is_active = 1
    `).bind(key).first()

    if (!row) {
      // 키가 없으면 빈 객체 반환 (프론트 호환)
      return c.json({ notice_key: key, title: '', law_ref: '', content: '' })
    }
    return c.json(row)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── PUT /api/legal-notices/:key ────────────────────────────────────────────
// 법령안내 생성 또는 수정 (admin/supervisor 전용)
router.put('/:key', async (c) => {
  const payload = c.get('jwtPayload')
  if (!payload || (payload.role !== 'admin' && payload.role !== 'supervisor')) {
    return c.json({ error: '관리자·감독자만 수정할 수 있습니다.' }, 403)
  }

  const key = c.req.param('key')
  const { title, law_ref, content } = await c.req.json()

  try {
    // UPSERT: 있으면 UPDATE, 없으면 INSERT
    await c.env.DB.prepare(`
      INSERT INTO legal_notices (notice_key, title, law_ref, content, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(notice_key) DO UPDATE SET
        title      = excluded.title,
        law_ref    = excluded.law_ref,
        content    = excluded.content,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `).bind(key, title || '', law_ref || '', content || '', payload.id).run()

    const updated = await c.env.DB.prepare(
      `SELECT * FROM legal_notices WHERE notice_key = ?`
    ).bind(key).first()

    return c.json({ success: true, data: updated })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── DELETE /api/legal-notices/:key (소프트 삭제) ───────────────────────────
router.delete('/:key', async (c) => {
  const payload = c.get('jwtPayload')
  if (!payload || payload.role !== 'admin') {
    return c.json({ error: '관리자만 삭제할 수 있습니다.' }, 403)
  }
  const key = c.req.param('key')
  try {
    await c.env.DB.prepare(
      `UPDATE legal_notices SET is_active = 0 WHERE notice_key = ?`
    ).bind(key).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default router
