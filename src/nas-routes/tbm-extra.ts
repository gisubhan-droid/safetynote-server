/**
 * tbm-extra.ts — TBM 인라인 라우트 (NAS 전용)
 *
 * 포함 라우트 (8개):
 *   GET    /api/tasks/:id/tbm-info          ← RULE-002: taskRoutes 마운트 앞에 등록
 *   GET    /api/tbm/:id/signatures
 *   POST   /api/tbm/:id/signatures
 *   DELETE /api/tbm/:id/signatures/:sigId
 *   GET    /api/tbm/:id/approval-status
 *   POST   /api/tbm/:id/approval-sign
 *   DELETE /api/tbm/:id                     ← RULE-002: tbmRoutes 마운트 앞에 등록
 *   PATCH  /api/tbm/:id/attendees           ← RULE-002: tbmRoutes 마운트 앞에 등록
 *
 * 의존:
 *   - getRawDb(), getUser() from ../nas-db
 *   - sendToUser, broadcastToRoles from ../sse
 *   - sendFcmToUsers from ./push-helper
 *
 * ⚠️ generateTbmApprovalPdf: node-server.ts에 남아있음
 *    global.__generateTbmApprovalPdf 콜백 방식으로 호출
 */

import { Hono } from 'hono'
import { getRawDb, getUser } from '../nas-db'
import { sendToUser, broadcastToRoles } from '../sse'
import { sendFcmToUsers } from './push-helper'

const app = new Hono()

// ─── ensureTbmSignaturesTable (로컬 재구현) ──────────────────────────────────
let _tbmSigTableEnsured = false
function ensureTbmSignaturesTable() {
  if (_tbmSigTableEnsured) return
  _tbmSigTableEnsured = true
  const rawDb = getRawDb()
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS tbm_signatures (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tbm_id      INTEGER NOT NULL,
        user_id     INTEGER,
        user_name   TEXT NOT NULL DEFAULT '',
        position    TEXT DEFAULT '',
        role        TEXT DEFAULT 'attendee',
        signed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        sign_method TEXT DEFAULT 'account',
        sign_data   TEXT
      )
    `)
  } catch (e: any) { console.warn('[ensureTbmSig] 테이블 생성 실패(무시):', e?.message) }
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_tbm_sig_tbm  ON tbm_signatures(tbm_id)`) } catch (_) {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_tbm_sig_name ON tbm_signatures(tbm_id, user_name)`) } catch (_) {}
  try {
    const triggers = rawDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND (
         tbl_name='tbm_signatures' OR tbl_name='tbm_records' OR
         sql LIKE '%tbm_records_old%'
       )`
    ).all() as any[]
    for (const trig of triggers) {
      try { rawDb.exec(`DROP TRIGGER IF EXISTS "${trig.name}"`) } catch (_) {}
    }
  } catch (_) {}
}

// ─── GET /api/tasks/:id/tbm-info ─────────────────────────────────────────────
// ⚠️ RULE-002: node-server.ts에서 app.route('/api/tasks') 마운트 앞에 직접 등록
export function registerTbmTasksRoute(serverApp: any) {
  serverApp.get('/api/tasks/:id/tbm-info', async (c: any) => {
    try {
      const user = getUser(c)
      if (!user) return c.json({ error: '인증 필요' }, 401)
      const rawDb = getRawDb()
      const id    = c.req.param('id')

      const tbm = rawDb.prepare(
        `SELECT id, location, gps_address, gps_lat, gps_lon, created_at, tbm_date, attendees
         FROM tbm_records
         WHERE task_id = ? AND status = 'completed'
         ORDER BY created_at DESC LIMIT 1`
      ).get(Number(id)) as any

      if (!tbm) return c.json({ tbm: null })

      let attendees: string[] = []
      try { attendees = tbm.attendees ? JSON.parse(tbm.attendees) : [] } catch (_) {}

      if (attendees.length === 0) {
        try {
          const assigned = rawDb.prepare(
            `SELECT u.name FROM task_assignments ta
             JOIN users u ON u.id = ta.worker_id
             WHERE ta.task_id = ?`
          ).all(Number(id)) as any[]
          attendees = assigned.map((r: any) => r.name).filter(Boolean)
        } catch (_) {}
      }

      let tbmDate = '', tbmTime = ''
      if (tbm.created_at) {
        const raw      = tbm.created_at.replace(' ', 'T')
        const hasOffset = raw.includes('+') || raw.endsWith('Z')
        const utcStr   = hasOffset ? raw : raw + 'Z'
        const kstMs    = new Date(utcStr).getTime() + 9 * 60 * 60 * 1000
        const kstDt    = new Date(kstMs).toISOString()
        tbmDate = kstDt.slice(0, 10)
        tbmTime = kstDt.slice(11, 16)
      }

      return c.json({
        tbm: {
          id:         tbm.id,
          address:    tbm.gps_address || tbm.location || '',
          tbm_date:   tbmDate,
          tbm_time:   tbmTime,
          created_at: tbm.created_at,
          attendees,
        }
      })
    } catch (e: any) {
      console.error('[GET /tasks/:id/tbm-info] 에러:', e?.message)
      return c.json({ tbm: null })
    }
  })
}

// ─── GET /api/tbm/:id/signatures ─────────────────────────────────────────────
app.get('/:id/signatures', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const id    = c.req.param('id')
    ensureTbmSignaturesTable()
    const rows = rawDb.prepare(
      `SELECT ts.*, u.name as user_name_from_users, u.position
       FROM tbm_signatures ts
       LEFT JOIN users u ON u.id = ts.user_id
       WHERE ts.tbm_id = ?
       ORDER BY ts.signed_at ASC`
    ).all(Number(id))
    return c.json(rows)
  } catch (e: any) {
    console.error('[GET /tbm/:id/signatures] 에러:', e?.message, e?.stack)
    return c.json({ error: e?.message || '서명 목록 조회 실패' }, 500)
  }
})

// ─── POST /api/tbm/:id/signatures ────────────────────────────────────────────
app.post('/:id/signatures', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const id    = c.req.param('id')
    const body  = await c.req.json().catch(() => ({})) as any

    const role        = body.role || 'attendee'
    const signData    = body.sign_data || null
    const signMethod  = signData ? 'pad' : 'account'
    const isNamedSign = !!(body.signer_name && String(body.signer_name).trim())
    const signerName  = isNamedSign ? String(body.signer_name).trim() : (user.name || '')

    ensureTbmSignaturesTable()
    let resultId: any = null

    if (isNamedSign) {
      const existing = rawDb.prepare(
        `SELECT id FROM tbm_signatures WHERE tbm_id=? AND user_name=? AND user_id IS NULL`
      ).get(Number(id), signerName) as any
      if (existing) {
        rawDb.prepare(
          `UPDATE tbm_signatures SET sign_data=?, sign_method=?, role=?, signed_at=CURRENT_TIMESTAMP WHERE id=?`
        ).run(signData, signMethod, role, existing.id)
        resultId = existing.id
      } else {
        const info = rawDb.prepare(
          `INSERT INTO tbm_signatures (tbm_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
           VALUES (?, NULL, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`
        ).run(Number(id), signerName, '', role, signMethod, signData)
        resultId = info.lastInsertRowid
      }
    } else {
      const existing = rawDb.prepare(
        `SELECT id FROM tbm_signatures WHERE tbm_id=? AND user_id=? AND role=?`
      ).get(Number(id), user.id, role) as any
      if (existing) {
        rawDb.prepare(
          `UPDATE tbm_signatures SET sign_data=?, sign_method=?, signed_at=CURRENT_TIMESTAMP WHERE id=?`
        ).run(signData, signMethod, existing.id)
        resultId = existing.id
      } else {
        const info = rawDb.prepare(
          `INSERT INTO tbm_signatures (tbm_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`
        ).run(Number(id), user.id, user.name || '', user.position || '', role, signMethod, signData)
        resultId = info.lastInsertRowid
      }
    }
    return c.json({ success: true, id: resultId })
  } catch (e: any) {
    console.error('[POST /tbm/:id/signatures] 에러:', e?.message, e?.stack)
    return c.json({ error: e?.message || '서명 등록 실패' }, 500)
  }
})

// ─── DELETE /api/tbm/:id/signatures/:sigId ───────────────────────────────────
app.delete('/:id/signatures/:sigId', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const { id, sigId } = c.req.param()
    ensureTbmSignaturesTable()
    const sig = rawDb.prepare(
      'SELECT * FROM tbm_signatures WHERE id=? AND tbm_id=?'
    ).get(Number(sigId), Number(id))
    if (!sig) return c.json({ error: '서명을 찾을 수 없습니다.' }, 404)
    if ((sig as any).user_id !== user.id && user.role !== 'admin')
      return c.json({ error: '본인 서명만 삭제할 수 있습니다.' }, 403)
    rawDb.prepare('DELETE FROM tbm_signatures WHERE id=?').run(Number(sigId))
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[DELETE /tbm/:id/signatures/:sigId] 에러:', e?.message)
    return c.json({ error: e?.message || '서명 삭제 실패' }, 500)
  }
})

// ─── GET /api/tbm/:id/approval-status ────────────────────────────────────────
app.get('/:id/approval-status', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const id    = Number(c.req.param('id'))
    ensureTbmSignaturesTable()
    const sigs = rawDb.prepare(`
      SELECT ts.*, u.name as user_display_name
      FROM tbm_signatures ts
      LEFT JOIN users u ON u.id = ts.user_id
      WHERE ts.tbm_id = ? AND ts.role IN ('approval_general','approval_ceo','approval_safety')
      ORDER BY ts.signed_at ASC
    `).all(id) as any[]
    return c.json({
      approval_general: sigs.find(s => s.role === 'approval_general') || null,
      approval_ceo:     sigs.find(s => s.role === 'approval_ceo')     || null,
      approval_safety:  sigs.find(s => s.role === 'approval_safety')  || null,
    })
  } catch (e: any) {
    console.error('[GET /tbm/:id/approval-status] 에러:', e?.message)
    return c.json({ approval_general: null, approval_ceo: null, approval_safety: null })
  }
})

// ─── POST /api/tbm/:id/approval-sign ─────────────────────────────────────────
app.post('/:id/approval-sign', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const id    = Number(c.req.param('id'))
    const body  = await c.req.json().catch(() => ({})) as any
    const { approval_role, sign_data } = body

    const validRoles = ['approval_general', 'approval_ceo', 'approval_safety']
    if (!validRoles.includes(approval_role))
      return c.json({ error: '유효하지 않은 결재 역할' }, 400)

    ensureTbmSignaturesTable()
    const tbm = rawDb.prepare(`
      SELECT tr.*, t.title as task_title
      FROM tbm_records tr LEFT JOIN tasks t ON t.id = tr.task_id
      WHERE tr.id = ?
    `).get(id) as any
    if (!tbm) return c.json({ error: 'TBM을 찾을 수 없습니다.' }, 404)

    // 서명 순서 잠금
    const existing = rawDb.prepare(`
      SELECT role FROM tbm_signatures WHERE tbm_id = ? AND role IN ('approval_general','approval_ceo','approval_safety')
    `).all(id) as any[]
    const signedRoles = new Set(existing.map((s: any) => s.role))

    if (approval_role === 'approval_general' && !signedRoles.has('approval_safety'))
      return c.json({ error: '안전관리자 서명 후 총괄책임 서명이 가능합니다.' }, 409)
    if (approval_role === 'approval_ceo' && !signedRoles.has('approval_general'))
      return c.json({ error: '총괄책임 서명 후 대표이사 서명이 가능합니다.' }, 409)
    if (signedRoles.has(approval_role))
      return c.json({ error: '이미 서명된 결재란입니다.' }, 409)

    const signMethod = sign_data ? 'pad' : 'account'
    rawDb.prepare(`
      INSERT INTO tbm_signatures (tbm_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).run(id, user.id, user.name || '', user.position || '', approval_role, signMethod, sign_data || null)

    const tbmTitle = `TBM: ${tbm.task_title || tbm.id}`

    // ── 다음 단계 알림 연쇄 ───────────────────────────────────────────────────
    if (approval_role === 'approval_safety') {
      const generalUsers = rawDb.prepare(
        `SELECT id, name FROM users WHERE position = '현장대리인' AND is_active = 1`
      ).all() as any[]
      for (const gu of generalUsers) {
        const already = rawDb.prepare(
          `SELECT id FROM signature_requests WHERE ref_type='tbm' AND ref_id=? AND ref_sub_type='approval_general' AND target_user_id=? AND status='pending'`
        ).get(id, gu.id)
        if (!already) {
          const info = rawDb.prepare(`
            INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
            VALUES ('tbm', ?, 'approval_general', ?, ?, ?, ?)
          `).run(id, `[결재요청] ${tbmTitle}`, `안전관리자(${user.name}) 서명 완료. 총괄책임 결재를 요청합니다.`, user.id, gu.id)
          sendToUser(gu.id, {
            type: 'sign_request', id: info.lastInsertRowid,
            title: `[결재요청] ${tbmTitle}`,
            requester: user.name, ref_type: 'tbm', ref_sub_type: 'approval_general',
            message: `[TBM 결재] 안전관리자 서명 완료. 총괄책임 결재를 요청합니다.`,
            ts: Date.now()
          })
          sendFcmToUsers([gu.id], {
            title: `[결재요청] ${tbmTitle}`,
            body:  `안전관리자 서명 완료. 총괄책임 결재를 요청합니다.`,
            data:  { type: 'sign_request', ref_type: 'tbm', ref_id: String(id) }
          }).catch(() => {})
          rawDb.prepare(`
            INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
            VALUES (?, 'sign_request', ?, ?, ?, 'tbm', 0)
          `).run(gu.id, `[결재요청] ${tbmTitle}`, `안전관리자 서명 완료. 총괄책임 결재를 요청합니다.`, id)
        }
      }
    } else if (approval_role === 'approval_general') {
      const ceoUsers = rawDb.prepare(
        `SELECT id, name FROM users WHERE position = '대표이사' AND is_active = 1`
      ).all() as any[]
      for (const ceo of ceoUsers) {
        const already = rawDb.prepare(
          `SELECT id FROM signature_requests WHERE ref_type='tbm' AND ref_id=? AND ref_sub_type='approval_ceo' AND target_user_id=? AND status='pending'`
        ).get(id, ceo.id)
        if (!already) {
          const info = rawDb.prepare(`
            INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
            VALUES ('tbm', ?, 'approval_ceo', ?, ?, ?, ?)
          `).run(id, `[결재요청] ${tbmTitle}`, `총괄책임(${user.name}) 서명 완료. 대표이사 결재를 요청합니다.`, user.id, ceo.id)
          sendToUser(ceo.id, {
            type: 'sign_request', id: info.lastInsertRowid,
            title: `[결재요청] ${tbmTitle}`,
            requester: user.name, ref_type: 'tbm', ref_sub_type: 'approval_ceo',
            message: `[TBM 결재] 총괄책임 서명 완료. 대표이사 결재를 요청합니다.`,
            ts: Date.now()
          })
          sendFcmToUsers([ceo.id], {
            title: `[결재요청] ${tbmTitle}`,
            body:  `총괄책임 서명 완료. 대표이사 결재를 요청합니다.`,
            data:  { type: 'sign_request', ref_type: 'tbm', ref_id: String(id) }
          }).catch(() => {})
          rawDb.prepare(`
            INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
            VALUES (?, 'sign_request', ?, ?, ?, 'tbm', 0)
          `).run(ceo.id, `[결재요청] ${tbmTitle}`, `총괄책임 서명 완료. 대표이사 결재를 요청합니다.`, id)
        }
      }
    } else if (approval_role === 'approval_ceo') {
      const safetyUsers = rawDb.prepare(
        `SELECT id, name FROM users WHERE position = '안전관리자' AND is_active = 1`
      ).all() as any[]
      for (const su of safetyUsers) {
        sendToUser(su.id, {
          type: 'tbm_approval_done',
          title: `[TBM 결재완료] ${tbmTitle}`,
          message: `[TBM 결재] 대표이사(${user.name}) 서명 완료. TBM 결재가 모두 완료되었습니다.`,
          tbmId: id, ts: Date.now()
        })
        sendFcmToUsers([su.id], {
          title: `[TBM 결재완료] ${tbmTitle}`,
          body:  `대표이사 서명 완료. TBM 결재가 모두 완료되었습니다.`,
          data:  { type: 'tbm_approval_done', ref_type: 'tbm', ref_id: String(id) }
        }).catch(() => {})
        rawDb.prepare(`
          INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
          VALUES (?, 'tbm_approval_done', ?, ?, ?, 'tbm', 0)
        `).run(su.id, `[TBM 결재완료] ${tbmTitle}`, `대표이사 서명 완료. TBM 결재가 모두 완료되었습니다.`, id)
      }
    }

    const roleLabel: Record<string, string> = {
      approval_safety:  '안전관리자',
      approval_general: '총괄책임(현장대리인)',
      approval_ceo:     '대표이사',
    }
    broadcastToRoles(['admin', 'supervisor'], {
      type: 'tbm_approval', tbmId: id,
      role: approval_role, roleLabel: roleLabel[approval_role],
      signer: user.name,
      message: `[TBM 결재] ${roleLabel[approval_role]} ${user.name}님이 "${tbmTitle}" 결재에 서명했습니다.`,
      ts: Date.now()
    })

    // 대표이사 서명 완료 → PDF 자동 생성 (node-server.ts 글로벌 콜백)
    if (approval_role === 'approval_ceo') {
      setImmediate(() => (global as any).__generateTbmApprovalPdf?.(id))
    }

    return c.json({ success: true, approval_role, signer: user.name })
  } catch (e: any) {
    console.error('[POST /tbm/:id/approval-sign] 에러:', e?.message, e?.stack)
    return c.json({ error: e?.message || '결재 서명 처리 실패' }, 500)
  }
})

// ─── DELETE /api/tbm/:id ─────────────────────────────────────────────────────
// ⚠️ RULE-002: node-server.ts에서 tbmRoutes 마운트 앞에 직접 등록
export function registerTbmDeleteRoute(serverApp: any) {
  serverApp.delete('/api/tbm/:id', async (c: any) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const id    = c.req.param('id')
    const tbm   = rawDb.prepare('SELECT * FROM tbm_records WHERE id=?').get(Number(id)) as any
    if (!tbm) return c.json({ error: 'TBM을 찾을 수 없습니다.' }, 404)
    if (user.role !== 'admin' && tbm.conductor_id !== user.id) {
      return c.json({ error: '삭제 권한이 없습니다. (작성자 또는 관리자만 삭제 가능)' }, 403)
    }
    try {
      rawDb.prepare('DELETE FROM tbm_records WHERE id=?').run(Number(id))
      const remaining = rawDb.prepare(
        `SELECT COUNT(*) as cnt FROM tbm_records WHERE task_id=? AND status='completed'`
      ).get(tbm.task_id) as any
      if (remaining.cnt === 0) {
        const task = rawDb.prepare('SELECT status FROM tasks WHERE id=?').get(tbm.task_id) as any
        if (task && task.status === 'tbm_done') {
          rawDb.prepare("UPDATE tasks SET status='in_progress', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(tbm.task_id)
        }
      }
      return c.json({ success: true, task_id: tbm.task_id, remaining_tbm: remaining.cnt })
    } catch (e: any) {
      return c.json({ error: (e as any).message }, 500)
    }
  })
}

// ─── PATCH /api/tbm/:id/attendees ────────────────────────────────────────────
// ⚠️ RULE-002: node-server.ts에서 tbmRoutes 마운트 앞에 직접 등록
export function registerTbmAttendeesRoute(serverApp: any) {
  serverApp.patch('/api/tbm/:id/attendees', async (c: any) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const id    = c.req.param('id')
    const body  = await c.req.json().catch(() => ({})) as any
    if (!Array.isArray(body.attendees)) return c.json({ error: 'attendees 배열 필요' }, 400)
    const cleaned = [...new Set((body.attendees as string[]).map(s => String(s).trim()).filter(Boolean))]
    try {
      rawDb.prepare(`UPDATE tbm_records SET attendees=? WHERE id=?`).run(JSON.stringify(cleaned), Number(id))
      return c.json({ success: true, attendees: cleaned })
    } catch (e: any) {
      return c.json({ error: (e as any).message }, 500)
    }
  })
}

export default app
