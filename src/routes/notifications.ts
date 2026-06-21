import { Hono } from 'hono'
import { getUser } from '../utils'

const app = new Hono<{ Bindings: CloudflareBindings }>()

// ─── 내 알림 목록 조회 (최근 50건) ──────────────────────────────────────────
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const rows = await c.env.DB.prepare(`
    SELECT id, type, title, message, ref_id, ref_type, is_read, created_at
    FROM   notifications
    WHERE  user_id = ?
    ORDER  BY created_at DESC
    LIMIT  50
  `).bind(user.id).all<any>()

  return c.json(rows.results)
})

// ─── 읽음 처리 (단건) ────────────────────────────────────────────────────────
app.patch('/:id/read', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = parseInt(c.req.param('id'))

  await c.env.DB.prepare(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).run()

  return c.json({ success: true })
})

// ─── 전체 읽음 처리 ──────────────────────────────────────────────────────────
app.patch('/read-all', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  await c.env.DB.prepare(
    `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`
  ).bind(user.id).run()

  return c.json({ success: true })
})

// ─── 미읽음 개수 ─────────────────────────────────────────────────────────────
app.get('/unread-count', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`
  ).bind(user.id).first<any>()

  return c.json({ count: row?.cnt ?? 0 })
})

// ─── 전체 삭제 ───────────────────────────────────────────────────────────────
// [BUG-023] 알림센터 전체 삭제 — DB에서 실제 레코드 삭제
app.delete('/clear-all', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  await c.env.DB.prepare(
    `DELETE FROM notifications WHERE user_id = ?`
  ).bind(user.id).run()

  return c.json({ success: true })
})

export default app
