/**
 * nas-routes/signature-requests.ts — 서명 요청 API (NAS 전용)
 *
 * 포함 라우트:
 *   GET    /api/signature-requests          — 목록 조회
 *   GET    /api/signature-requests/count    — 미처리 건수 (배지용)
 *   POST   /api/signature-requests          — 요청 생성
 *   POST   /api/signature-requests/bulk     — 일괄 생성
 *   PATCH  /api/signature-requests/:id/sign — 서명 처리
 *   PATCH  /api/signature-requests/:id/reject — 서명 거부
 *   DELETE /api/signature-requests/:id      — 삭제
 */

import { Hono } from 'hono'
import { getRawDb, getUser } from '../nas-db'
import { sendToUser, broadcastToRoles } from '../sse'
import { sendFcmToUsers } from './push-helper'

const app = new Hono()

// GET /api/signature-requests
app.get('/', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const status = c.req.query('status') || 'pending'
  const rows = rawDb.prepare(`
    SELECT sr.*,
           ru.name as requester_name, ru.position as requester_position,
           tu.name as target_name
    FROM signature_requests sr
    LEFT JOIN users ru ON ru.id = sr.requester_id
    LEFT JOIN users tu ON tu.id = sr.target_user_id
    WHERE sr.target_user_id = ? AND sr.status = ?
    ORDER BY sr.created_at DESC
    LIMIT 100
  `).all(user.id, status)
  return c.json(rows)
})

// GET /api/signature-requests/count — 미처리 건수 (배지용)
app.get('/count', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const row: any = rawDb.prepare(
    `SELECT COUNT(*) as cnt FROM signature_requests WHERE target_user_id = ? AND status = 'pending'`
  ).get(user.id)
  return c.json({ count: row?.cnt || 0 })
})

// POST /api/signature-requests — 요청 생성
app.post('/', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const body = await c.req.json().catch(() => ({})) as any
  const { ref_type, ref_id, ref_sub_type, title, description, target_user_id, expires_at } = body
  if (!ref_type || !ref_id || !title || !target_user_id)
    return c.json({ error: 'ref_type, ref_id, title, target_user_id 필수' }, 400)

  const existing: any = rawDb.prepare(
    `SELECT id FROM signature_requests WHERE ref_type=? AND ref_id=? AND ref_sub_type IS ? AND target_user_id=? AND status='pending'`
  ).get(ref_type, Number(ref_id), ref_sub_type || null, Number(target_user_id))
  if (existing) return c.json({ id: existing.id, already_exists: true })

  const info = rawDb.prepare(`
    INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ref_type, Number(ref_id), ref_sub_type || null, title, description || null, user.id, Number(target_user_id), expires_at || null)

  sendToUser(Number(target_user_id), {
    type: 'sign_request', id: info.lastInsertRowid,
    title, description: description || '',
    requester: user.name, ref_type,
    message: `[서명 요청] ${user.name}님이 서명을 요청했습니다`,
    ts: Date.now()
  })
  sendFcmToUsers([Number(target_user_id)], {
    title: `[서명 요청] ${title}`,
    body: `${user.name}님이 서명을 요청했습니다`,
    data: { type: 'sign_request', ref_type, ref_id: String(ref_id) }
  }).catch(() => {})
  return c.json({ success: true, id: info.lastInsertRowid })
})

// POST /api/signature-requests/bulk — 일괄 생성
app.post('/bulk', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const body = await c.req.json().catch(() => ({})) as any
  const { ref_type, ref_id, ref_sub_type, title, description, target_user_ids, expires_at } = body
  if (!ref_type || !ref_id || !title || !Array.isArray(target_user_ids) || target_user_ids.length === 0)
    return c.json({ error: '필수 필드 누락' }, 400)

  const stmt = rawDb.prepare(`
    INSERT OR IGNORE INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insert = rawDb.transaction(() => {
    let created = 0
    for (const uid of target_user_ids) {
      const existing: any = rawDb.prepare(
        `SELECT id FROM signature_requests WHERE ref_type=? AND ref_id=? AND ref_sub_type IS ? AND target_user_id=? AND status='pending'`
      ).get(ref_type, Number(ref_id), ref_sub_type || null, Number(uid))
      if (!existing) {
        stmt.run(ref_type, Number(ref_id), ref_sub_type || null, title, description || null, user.id, Number(uid), expires_at || null)
        created++
      }
    }
    return created
  })
  const created = insert()

  for (const uid of target_user_ids) {
    sendToUser(Number(uid), {
      type: 'sign_request',
      title, description: description || '',
      requester: user.name, ref_type,
      message: `[서명 요청] ${user.name}님이 서명을 요청했습니다`,
      ts: Date.now()
    })
  }
  sendFcmToUsers(target_user_ids.map(Number), {
    title: `[서명 요청] ${title}`,
    body: `${user.name}님이 서명을 요청했습니다`,
    data: { type: 'sign_request', ref_type, ref_id: String(ref_id) }
  }).catch(() => {})
  return c.json({ success: true, created })
})

// PATCH /api/signature-requests/:id/sign — 서명 처리
app.patch('/:id/sign', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = Number(c.req.param('id'))
  const req: any = rawDb.prepare(`SELECT * FROM signature_requests WHERE id=?`).get(id)
  if (!req) return c.json({ error: '요청을 찾을 수 없습니다.' }, 404)
  if (req.target_user_id !== user.id && user.role !== 'admin')
    return c.json({ error: '본인 서명 요청만 처리할 수 있습니다.' }, 403)
  if (req.status !== 'pending') return c.json({ error: '이미 처리된 요청입니다.' }, 409)

  const body = await c.req.json().catch(() => ({})) as any
  const signData = body.sign_data || null
  rawDb.prepare(`
    UPDATE signature_requests SET status='signed', sign_data=?, signed_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(signData, id)

  try {
    if (req.ref_type === 'tbm') {
      const signMethod = signData ? 'pad' : 'account'
      rawDb.prepare(`
        INSERT OR REPLACE INTO tbm_signatures (tbm_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
        VALUES (?, ?, ?, ?, 'attendee', CURRENT_TIMESTAMP, ?, ?)
      `).run(req.ref_id, user.id, user.name, user.position || '', signMethod, signData)
    } else if (req.ref_type === 'risk_assessment') {
      const signMethod = signData ? 'pad' : 'account'
      rawDb.prepare(`
        INSERT OR REPLACE INTO risk_assessment_signatures (assessment_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
        VALUES (?, ?, ?, ?, 'member', CURRENT_TIMESTAMP, ?, ?)
      `).run(req.ref_id, user.id, user.name, user.position || '', signMethod, signData)
    } else if (req.ref_type === 'education') {
      rawDb.prepare(`
        UPDATE safety_education_attendees SET signature_data=? WHERE session_id=? AND user_id=?
      `).run(signData, req.ref_id, user.id)
    }
  } catch(e: any) { console.warn('[signature-request/sign] ref 반영 실패:', e.message) }

  broadcastToRoles(['admin','supervisor'], {
    type: `${req.ref_type === 'tbm' ? 'tbm' : req.ref_type === 'risk_assessment' ? 'risk' : 'edu'}_sign`,
    signer: user.name, title: req.title,
    message: `[서명완료] ${user.name}님이 "${req.title}"에 서명했습니다`,
    ts: Date.now()
  })
  sendToUser(req.requester_id, {
    type: 'sign_done', title: req.title, signer: user.name,
    message: `[서명완료] ${user.name}님이 서명을 완료했습니다`,
    ts: Date.now()
  })
  return c.json({ success: true })
})

// PATCH /api/signature-requests/:id/reject — 서명 거부
app.patch('/:id/reject', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = Number(c.req.param('id'))
  const req: any = rawDb.prepare(`SELECT * FROM signature_requests WHERE id=?`).get(id)
  if (!req) return c.json({ error: '요청을 찾을 수 없습니다.' }, 404)
  if (req.target_user_id !== user.id && user.role !== 'admin')
    return c.json({ error: '본인 서명 요청만 처리할 수 있습니다.' }, 403)
  if (req.status !== 'pending') return c.json({ error: '이미 처리된 요청입니다.' }, 409)

  const body = await c.req.json().catch(() => ({})) as any
  rawDb.prepare(`
    UPDATE signature_requests SET status='rejected', rejected_reason=?, signed_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(body.reason || null, id)

  sendToUser(req.requester_id, {
    type: 'sign_rejected', title: req.title, signer: user.name,
    reason: body.reason || '',
    message: `[서명거부] ${user.name}님이 서명을 거부했습니다`,
    ts: Date.now()
  })
  return c.json({ success: true })
})

// DELETE /api/signature-requests/:id — 삭제
app.delete('/:id', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = Number(c.req.param('id'))
  const req: any = rawDb.prepare(`SELECT * FROM signature_requests WHERE id=?`).get(id)
  if (!req) return c.json({ error: '요청을 찾을 수 없습니다.' }, 404)
  if (req.requester_id !== user.id && user.role !== 'admin')
    return c.json({ error: '요청자만 삭제할 수 있습니다.' }, 403)
  rawDb.prepare(`DELETE FROM signature_requests WHERE id=?`).run(id)
  return c.json({ success: true })
})

export default app
