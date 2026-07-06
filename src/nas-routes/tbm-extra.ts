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
    // ── [FEAT-028] 근로자(attendee) 서명 완료 → 전원 서명 여부 체크 → 안전관리자 알림 ──
    // 연쇄 흐름:
    //   [1] 근로자 전원 서명 완료 → 안전관리자 알림  ← 여기서 처리
    //   [2] 안전관리자(approval_safety) 서명 → 현장대리인 알림  (approval-sign 엔드포인트)
    //   [3] 현장대리인(approval_general) 서명 → CEO 알림         (approval-sign 엔드포인트)
    //   [4] CEO(approval_ceo) 서명 → 안전관리자 완료 알림        (approval-sign 엔드포인트)
    if (role === 'attendee') {
      try {
        const tbmNum = Number(id)
        // TBM 정보 및 연결 작업 조회
        const tbmRow = rawDb.prepare(
          `SELECT tr.id, tr.attendees, tr.task_id, t.title as task_title, t.work_number, t.task_number
           FROM tbm_records tr LEFT JOIN tasks t ON t.id = tr.task_id
           WHERE tr.id = ?`
        ).get(tbmNum) as any

        if (tbmRow) {
          // 참석자 목록 파악 (JSON 배열 또는 배정 작업자)
          let attendeeNames: string[] = []
          try {
            attendeeNames = tbmRow.attendees ? JSON.parse(tbmRow.attendees) : []
          } catch (_) { attendeeNames = [] }

          // attendees 없으면 task_assignments에서 조회
          if (attendeeNames.length === 0 && tbmRow.task_id) {
            const assigned = rawDb.prepare(
              `SELECT u.name FROM task_assignments ta
               JOIN users u ON u.id = ta.user_id
               WHERE ta.task_id = ? AND ta.is_active = 1`
            ).all(tbmRow.task_id) as any[]
            attendeeNames = assigned.map((r: any) => r.name).filter(Boolean)
          }

          // 현재 attendee 서명 완료자 목록 (서명 데이터 있는 것만)
          const signedRows = rawDb.prepare(
            `SELECT user_name FROM tbm_signatures
             WHERE tbm_id = ? AND role = 'attendee'`
          ).all(tbmNum) as any[]
          const signedNames = new Set(signedRows.map((r: any) => r.user_name))

          // 전원 서명 완료 여부 (attendees 목록의 모든 이름이 서명됨)
          const totalCount  = attendeeNames.length
          const signedCount = attendeeNames.filter(n => signedNames.has(n)).length
          const allSigned   = totalCount > 0 && signedCount >= totalCount

          const tbmTitle  = `TBM: ${tbmRow.task_title || tbmRow.id}`
          const taskNumDisplay = tbmRow.work_number || tbmRow.task_number || String(tbmRow.task_id || id)

          if (allSigned) {
            // ── 전원 서명 완료 → 안전관리자에게 결재 요청 알림 ──────────────
            // 안전관리자: sub_role='safety' OR position='안전관리자'
            const safetyUsers = rawDb.prepare(
              `SELECT id, name FROM users
               WHERE (sub_role='safety' OR position='안전관리자') AND is_active=1`
            ).all() as any[]

            const notifyTitle = `[TBM 서명완료] ${tbmTitle}`
            const notifyBody  = `[${taskNumDisplay}] TBM 참석자 전원(${signedCount}명) 서명이 완료되었습니다. 안전관리자 결재를 진행해주세요.`

            for (const su of safetyUsers) {
              // 이미 approval_safety 서명이 있으면 알림 생략
              const alreadySigned = rawDb.prepare(
                `SELECT id FROM tbm_signatures WHERE tbm_id=? AND role='approval_safety'`
              ).get(tbmNum)
              if (alreadySigned) continue

              // SSE 실시간 알림
              sendToUser(su.id, {
                type: 'tbm_attendee_all_signed',
                title: notifyTitle,
                message: notifyBody,
                tbmId: tbmNum,
                taskId: tbmRow.task_id,
                ts: Date.now()
              })

              // FCM 푸시 알림
              sendFcmToUsers([su.id], {
                title: notifyTitle,
                body:  notifyBody,
                data:  { type: 'tbm_attendee_all_signed', ref_type: 'tbm', ref_id: String(tbmNum) }
              }).catch(() => {})

              // notifications DB 저장
              rawDb.prepare(
                `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
                 VALUES (?, 'tbm_attendee_all_signed', ?, ?, ?, 'tbm', 0)`
              ).run(su.id, notifyTitle, notifyBody, tbmNum)
            }

            console.log(`[FCM/TBM] 참석자 전원 서명 완료 — tbm:${tbmNum} (${signedCount}/${totalCount}명) → 안전관리자 ${safetyUsers.length}명 알림`)
          } else {
            // 일부 서명 — 진행 상황 로그만
            console.log(`[TBM] 서명 진행 — tbm:${tbmNum} ${signedCount}/${totalCount}명 완료`)
          }
        }
      } catch (notifyErr: any) {
        // 알림 실패는 서명 저장 성공에 영향 없음
        console.warn('[TBM] 참석자 서명 완료 알림 실패(무시):', notifyErr?.message)
      }
    }
    // ── END [FEAT-028] ──────────────────────────────────────────────────────────

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
      WHERE ts.tbm_id = ? AND ts.role IN ('approval_general','approval_safety')
      ORDER BY ts.signed_at ASC
    `).all(id) as any[]
    // BUG-089: approval_ceo 제거 — 안전관리자→총괄책임 2단계
    return c.json({
      approval_general: sigs.find(s => s.role === 'approval_general') || null,
      approval_safety:  sigs.find(s => s.role === 'approval_safety')  || null,
      approval_ceo:     null,  // 하위호환 유지 (앱측에서 참조할 수 있음)
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

    // BUG-089: approval_ceo 제거 — 안전관리자 → 총괄책임 2단계로 변경
    const validRoles = ['approval_general', 'approval_safety']
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
      SELECT role FROM tbm_signatures WHERE tbm_id = ? AND role IN ('approval_general','approval_safety')
    `).all(id) as any[]
    const signedRoles = new Set(existing.map((s: any) => s.role))

    if (approval_role === 'approval_general' && !signedRoles.has('approval_safety'))
      return c.json({ error: '안전관리자 서명 후 총괄책임 서명이 가능합니다.' }, 409)
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
      // FEAT-056: BUG-089 — approval_general이 최종 결재
      // 1) 안전관리자에게 결재 완료 SSE/FCM/알림
      const safetyUsers = rawDb.prepare(
        `SELECT id, name FROM users WHERE position = '안전관리자' AND is_active = 1`
      ).all() as any[]
      for (const su of safetyUsers) {
        sendToUser(su.id, {
          type: 'tbm_approval_done',
          title: `[TBM 결재완료] ${tbmTitle}`,
          message: `[TBM 결재] 총괄책임(${user.name}) 서명 완료. TBM 결재가 모두 완료되었습니다.`,
          tbmId: id, ts: Date.now()
        })
        sendFcmToUsers([su.id], {
          title: `[TBM 결재완료] ${tbmTitle}`,
          body:  `총괄책임 서명 완료. TBM 결재가 모두 완료되었습니다.`,
          data:  { type: 'tbm_approval_done', ref_type: 'tbm', ref_id: String(id) }
        }).catch(() => {})
        rawDb.prepare(`
          INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
          VALUES (?, 'tbm_approval_done', ?, ?, ?, 'tbm', 0)
        `).run(su.id, `[TBM 결재완료] ${tbmTitle}`, `총괄책임 서명 완료. TBM 결재가 모두 완료되었습니다.`, id)
      }

      // FEAT-056: 2) 작업 배정 근로자들에게 "TBM 결재 완료" FCM 발송
      if (tbm.task_id) {
        const taskWorkers = rawDb.prepare(
          `SELECT DISTINCT u.id FROM task_assignments ta JOIN users u ON u.id = ta.worker_id
           WHERE ta.task_id = ? AND u.is_active = 1`
        ).all(tbm.task_id) as any[]
        const workerIds = taskWorkers.map((w: any) => w.id)
        if (workerIds.length > 0) {
          sendFcmToUsers(workerIds, {
            title: `[TBM 결재완료] ${tbmTitle}`,
            body:  `TBM 결재가 완료되었습니다. 안전하게 작업을 진행하세요.`,
            data:  { type: 'tbm_approval_done', ref_type: 'tbm', ref_id: String(id) }
          }).catch(() => {})
          // 근로자 notification 등록
          for (const wid of workerIds) {
            rawDb.prepare(`
              INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
              VALUES (?, 'tbm_approval_done', ?, ?, ?, 'tbm', 0)
            `).run(wid, `[TBM 결재완료] ${tbmTitle}`, `TBM 결재가 완료되었습니다. 안전하게 작업을 진행하세요.`, id)
          }
        }
      }
    }

    // BUG-089: approval_ceo 제거
    const roleLabel: Record<string, string> = {
      approval_safety:  '안전관리자',
      approval_general: '총괄책임',
    }
    broadcastToRoles(['admin', 'supervisor'], {
      type: 'tbm_approval', tbmId: id,
      role: approval_role, roleLabel: roleLabel[approval_role],
      signer: user.name,
      message: `[TBM 결재] ${roleLabel[approval_role]} ${user.name}님이 "${tbmTitle}" 결재에 서명했습니다.`,
      ts: Date.now()
    })

    // BUG-089: approval_general이 최종 결재 → PDF 자동 생성 (기존 approval_ceo에서 변경)
    // FEAT-056: 총괄책임 서명 완료 시 PDF 자동 생성
    if (approval_role === 'approval_general') {
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
