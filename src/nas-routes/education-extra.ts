/**
 * education-extra.ts — 안전교육 증빙사진 + 결과보고서 + 결재 API (NAS 전용)
 *
 * 포함 라우트 (7개):
 *   GET    /api/education/sessions/:id/photos
 *   POST   /api/education/sessions/:id/photos
 *   DELETE /api/education/photos/:photoId
 *   GET    /api/education/sessions/:id/report
 *   PUT    /api/education/sessions/:id/report
 *   GET    /api/education/sessions/:id/approval-status  [FEAT-060]
 *   POST   /api/education/sessions/:id/approval-sign    [FEAT-060]
 *
 * 의존:
 *   - getRawDb(), getUser(), getUploadRootNow() from ../nas-db
 *   - existsSync, mkdirSync, writeFileSync, unlinkSync from node:fs
 *
 * ⚠️ RULE-002: educationRoutes 마운트 앞에 등록 필요
 *    node-server.ts에서 registerEducationExtraRoutes(app) 로 직접 등록
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getRawDb, getUser, getUploadRootNow } from '../nas-db'
import { sendToUser, broadcastToRoles } from '../sse'
import { sendFcmToUsers } from './push-helper'

/**
 * education-extra 라우트를 serverApp에 직접 등록
 * (RULE-002: educationRoutes 마운트 앞에 위치해야 함)
 */
export function registerEducationExtraRoutes(serverApp: any) {

  // ─── GET /api/education/sessions/:id/photos ───────────────────────────────
  serverApp.get('/api/education/sessions/:id/photos', async (c: any) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const id    = Number(c.req.param('id'))
    const rows  = rawDb.prepare(
      `SELECT ep.*, u.name as uploader_name
       FROM edu_photos ep LEFT JOIN users u ON u.id = ep.uploaded_by
       WHERE ep.session_id=? ORDER BY ep.created_at`
    ).all(id)
    return c.json(rows)
  })

  // ─── POST /api/education/sessions/:id/photos ──────────────────────────────
  serverApp.post('/api/education/sessions/:id/photos', async (c: any) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
    const rawDb     = getRawDb()
    const sessionId = Number(c.req.param('id'))
    const session   = rawDb.prepare('SELECT id FROM safety_education_sessions WHERE id=?').get(sessionId)
    if (!session) return c.json({ error: '교육 세션을 찾을 수 없습니다.' }, 404)

    let formData: FormData
    try { formData = await c.req.formData() } catch (_) { return c.json({ error: '파일 파싱 실패' }, 400) }
    const file    = formData.get('photo') as File | null
    const caption = (formData.get('caption') as string || '').trim()
    if (!file || !file.size) return c.json({ error: '사진 파일이 없습니다.' }, 400)

    const ext   = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fname = `edu_${sessionId}_${Date.now()}.${ext}`
    const dir   = join(getUploadRootNow(), 'edu_photos')
    mkdirSync(dir, { recursive: true })
    const fpath = join(dir, fname)
    const buf   = Buffer.from(await file.arrayBuffer())
    writeFileSync(fpath, buf)

    const rel    = `/uploads/edu_photos/${fname}`
    const result = rawDb.prepare(
      `INSERT INTO edu_photos (session_id, file_name, file_path, caption, uploaded_by) VALUES (?,?,?,?,?)`
    ).run(sessionId, fname, rel, caption || null, user.id)
    return c.json({ id: result.lastInsertRowid, file_name: fname, file_path: rel, caption })
  })

  // ─── DELETE /api/education/photos/:photoId ────────────────────────────────
  serverApp.delete('/api/education/photos/:photoId', async (c: any) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
    const rawDb   = getRawDb()
    const photoId = Number(c.req.param('photoId'))
    const photo   = rawDb.prepare('SELECT * FROM edu_photos WHERE id=?').get(photoId) as any
    if (!photo) return c.json({ error: '사진을 찾을 수 없습니다.' }, 404)
    try {
      const absPath = join(getUploadRootNow(), 'edu_photos', photo.file_name)
      if (existsSync(absPath)) unlinkSync(absPath)
    } catch (_) {}
    rawDb.prepare('DELETE FROM edu_photos WHERE id=?').run(photoId)
    return c.json({ success: true })
  })

  // ─── GET /api/education/sessions/:id/report ──────────────────────────────
  serverApp.get('/api/education/sessions/:id/report', async (c: any) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const rawDb = getRawDb()
    const id    = Number(c.req.param('id'))
    const row   = rawDb.prepare(
      `SELECT er.*, u.name as author_name
       FROM edu_reports er LEFT JOIN users u ON u.id = er.created_by
       WHERE er.session_id=?`
    ).get(id)
    return c.json(row || null)
  })

  // ─── PUT /api/education/sessions/:id/report ───────────────────────────────
  serverApp.put('/api/education/sessions/:id/report', async (c: any) => {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
    const rawDb     = getRawDb()
    const sessionId = Number(c.req.param('id'))
    const session   = rawDb.prepare('SELECT id FROM safety_education_sessions WHERE id=?').get(sessionId)
    if (!session) return c.json({ error: '교육 세션을 찾을 수 없습니다.' }, 404)
    const body = await c.req.json().catch(() => ({})) as any
    const { report_title, objectives, content_desc, outcomes, improvements } = body
    rawDb.prepare(`
      INSERT INTO edu_reports (session_id, report_title, objectives, content_desc, outcomes, improvements, created_by, updated_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(session_id) DO UPDATE SET
        report_title=excluded.report_title, objectives=excluded.objectives,
        content_desc=excluded.content_desc, outcomes=excluded.outcomes,
        improvements=excluded.improvements, updated_at=CURRENT_TIMESTAMP
    `).run(sessionId, report_title||null, objectives||null, content_desc||null, outcomes||null, improvements||null, user.id)
    return c.json({ success: true })
  })

  // ─── GET /api/education/sessions/:id/approval-status [FEAT-060/061] ───────
  // 교육일지 결재 현황 조회 (안전관리자 → 현장대리인 → 대표이사 3단계)
  serverApp.get('/api/education/sessions/:id/approval-status', async (c: any) => {
    try {
      const user = getUser(c)
      if (!user) return c.json({ error: '인증 필요' }, 401)
      const rawDb     = getRawDb()
      const sessionId = Number(c.req.param('id'))
      const rows = rawDb.prepare(`
        SELECT ea.*, u.name as user_display_name
        FROM safety_education_approvals ea
        LEFT JOIN users u ON u.id = ea.user_id
        WHERE ea.session_id = ?
        ORDER BY ea.signed_at ASC
      `).all(sessionId) as any[]
      return c.json({
        approval_safety:  rows.find((r: any) => r.role === 'approval_safety')  || null,
        approval_general: rows.find((r: any) => r.role === 'approval_general') || null,
        approval_ceo:     rows.find((r: any) => r.role === 'approval_ceo')     || null,
      })
    } catch (e: any) {
      console.error('[GET /education/sessions/:id/approval-status] 에러:', e?.message)
      return c.json({ approval_safety: null, approval_general: null, approval_ceo: null })
    }
  })

  // ─── POST /api/education/sessions/:id/approval-sign [FEAT-060/061] ─────────
  // 교육일지 결재 서명 저장 (안전관리자 → 현장대리인 → 대표이사 3단계)
  serverApp.post('/api/education/sessions/:id/approval-sign', async (c: any) => {
    try {
      const user = getUser(c)
      if (!user) return c.json({ error: '인증 필요' }, 401)
      const rawDb     = getRawDb()
      const sessionId = Number(c.req.param('id'))
      const body      = await c.req.json().catch(() => ({})) as any
      const { approval_role, sign_data } = body

      // 유효한 결재 역할만 허용 (3단계)
      const validRoles = ['approval_safety', 'approval_general', 'approval_ceo']
      if (!validRoles.includes(approval_role))
        return c.json({ error: '유효하지 않은 결재 역할' }, 400)

      // 권한 체크: worker·lgu·lgu_plus가 아니면 결재 가능
      const pos     = user.position || ''
      const canSign = user.role !== 'worker' && user.role !== 'lgu' && user.role !== 'lgu_plus'
      if (!canSign)
        return c.json({ error: '결재 권한 없음' }, 403)

      // 세션 존재 확인 (알림용 제목 포함)
      const session = rawDb.prepare(
        `SELECT ses.*, u.name as creator_name
         FROM safety_education_sessions ses
         LEFT JOIN users u ON u.id = ses.created_by
         WHERE ses.id=?`
      ).get(sessionId) as any
      if (!session) return c.json({ error: '교육 세션을 찾을 수 없습니다.' }, 404)

      // 서명 순서 강제: 안전관리자 → 현장대리인 → 대표이사
      const existing = rawDb.prepare(
        `SELECT role FROM safety_education_approvals WHERE session_id = ?`
      ).all(sessionId) as any[]
      const signedRoles = new Set(existing.map((r: any) => r.role))

      if (approval_role === 'approval_general' && !signedRoles.has('approval_safety'))
        return c.json({ error: '안전관리자 서명 후 현장대리인 서명이 가능합니다.' }, 409)
      if (approval_role === 'approval_ceo' && !signedRoles.has('approval_general'))
        return c.json({ error: '현장대리인 서명 후 대표이사 서명이 가능합니다.' }, 409)
      if (signedRoles.has(approval_role))
        return c.json({ error: '이미 서명된 결재란입니다.' }, 409)

      const signMethod = sign_data ? 'pad' : 'account'
      rawDb.prepare(`
        INSERT INTO safety_education_approvals
          (session_id, role, user_id, user_name, user_position, sign_method, sign_data, signed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(sessionId, approval_role, user.id, user.name || '', pos, signMethod, sign_data || null)

      const roleLabel: Record<string, string> = {
        approval_safety:  '안전관리자',
        approval_general: '현장대리인',
        approval_ceo:     '대표이사',
      }
      const eduTitle = `교육: ${session.edu_subject || sessionId}`
      console.log(`[edu approval-sign] session=${sessionId} role=${approval_role} signer=${user.name}`)

      // ── 단계별 알림 연쇄 ────────────────────────────────────────────────────
      // [1] 안전관리자 서명 완료 → 현장대리인에게 결재 요청
      if (approval_role === 'approval_safety') {
        const nextUsers = rawDb.prepare(
          `SELECT id, name FROM users WHERE position IN ('현장대리인','총괄책임자') AND is_active=1`
        ).all() as any[]
        for (const nu of nextUsers) {
          try {
            const already = rawDb.prepare(
              `SELECT id FROM signature_requests
               WHERE ref_type='education' AND ref_id=? AND ref_sub_type='approval_general'
               AND target_user_id=? AND status='pending'`
            ).get(sessionId, nu.id)
            if (!already) {
              const info = rawDb.prepare(`
                INSERT INTO signature_requests
                  (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
                VALUES ('education', ?, 'approval_general', ?, ?, ?, ?)
              `).run(sessionId,
                `[결재요청] ${eduTitle}`,
                `안전관리자(${user.name}) 서명 완료. 현장대리인 결재를 요청합니다.`,
                user.id, nu.id)
              sendToUser(nu.id, {
                type: 'sign_request', id: info.lastInsertRowid,
                title: `[결재요청] ${eduTitle}`,
                requester: user.name,
                ref_type: 'education', ref_sub_type: 'approval_general',
                message: `[교육 결재] 안전관리자 서명 완료. 현장대리인 결재를 요청합니다.`,
                ts: Date.now()
              })
              sendFcmToUsers([nu.id], {
                title: `[결재요청] ${eduTitle}`,
                body:  `안전관리자 서명 완료. 현장대리인 결재를 요청합니다.`,
                data:  { type: 'sign_request', ref_type: 'education', ref_id: String(sessionId) }
              }).catch(() => {})
              rawDb.prepare(`
                INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
                VALUES (?, 'sign_request', ?, ?, ?, 'education', 0)
              `).run(nu.id, `[결재요청] ${eduTitle}`,
                `안전관리자 서명 완료. 현장대리인 결재를 요청합니다.`, sessionId)
            }
          } catch(ne: any) { console.warn('[edu approval-sign] 현장대리인 알림 실패(무시):', ne?.message) }
        }
      }
      // [2] 현장대리인 서명 완료 → 대표이사에게 결재 요청
      else if (approval_role === 'approval_general') {
        const ceoUsers = rawDb.prepare(
          `SELECT id, name FROM users WHERE (position='대표이사' OR role='admin') AND is_active=1`
        ).all() as any[]
        for (const cu of ceoUsers) {
          try {
            const already = rawDb.prepare(
              `SELECT id FROM signature_requests
               WHERE ref_type='education' AND ref_id=? AND ref_sub_type='approval_ceo'
               AND target_user_id=? AND status='pending'`
            ).get(sessionId, cu.id)
            if (!already) {
              const info = rawDb.prepare(`
                INSERT INTO signature_requests
                  (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
                VALUES ('education', ?, 'approval_ceo', ?, ?, ?, ?)
              `).run(sessionId,
                `[결재요청] ${eduTitle}`,
                `현장대리인(${user.name}) 서명 완료. 대표이사 결재를 요청합니다.`,
                user.id, cu.id)
              sendToUser(cu.id, {
                type: 'sign_request', id: info.lastInsertRowid,
                title: `[결재요청] ${eduTitle}`,
                requester: user.name,
                ref_type: 'education', ref_sub_type: 'approval_ceo',
                message: `[교육 결재] 현장대리인 서명 완료. 대표이사 결재를 요청합니다.`,
                ts: Date.now()
              })
              sendFcmToUsers([cu.id], {
                title: `[결재요청] ${eduTitle}`,
                body:  `현장대리인 서명 완료. 대표이사 결재를 요청합니다.`,
                data:  { type: 'sign_request', ref_type: 'education', ref_id: String(sessionId) }
              }).catch(() => {})
              rawDb.prepare(`
                INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
                VALUES (?, 'sign_request', ?, ?, ?, 'education', 0)
              `).run(cu.id, `[결재요청] ${eduTitle}`,
                `현장대리인 서명 완료. 대표이사 결재를 요청합니다.`, sessionId)
            }
          } catch(ne: any) { console.warn('[edu approval-sign] 대표이사 알림 실패(무시):', ne?.message) }
        }
      }
      // [3] 대표이사 서명 완료 → 안전관리자에게 최종 완료 알림 + broadcast
      else if (approval_role === 'approval_ceo') {
        const safetyUsers = rawDb.prepare(
          `SELECT id, name FROM users WHERE position='안전관리자' AND is_active=1`
        ).all() as any[]
        for (const su of safetyUsers) {
          try {
            sendToUser(su.id, {
              type: 'edu_approval_done',
              title: `[교육 결재완료] ${eduTitle}`,
              message: `대표이사(${user.name}) 서명 완료. 교육일지 결재가 모두 완료되었습니다.`,
              sessionId, ts: Date.now()
            })
            sendFcmToUsers([su.id], {
              title: `[교육 결재완료] ${eduTitle}`,
              body:  `대표이사 서명 완료. 교육일지 결재가 완료되었습니다.`,
              data:  { type: 'edu_approval_done', ref_type: 'education', ref_id: String(sessionId) }
            }).catch(() => {})
            rawDb.prepare(`
              INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
              VALUES (?, 'edu_approval_done', ?, ?, ?, 'education', 0)
            `).run(su.id, `[교육 결재완료] ${eduTitle}`,
              `대표이사 서명 완료. 교육일지 결재가 모두 완료되었습니다.`, sessionId)
          } catch(ne: any) { console.warn('[edu approval-sign] 완료알림 실패(무시):', ne?.message) }
        }
        broadcastToRoles(['admin', 'supervisor'], {
          type: 'edu_approval', sessionId,
          role: approval_role, roleLabel: roleLabel[approval_role],
          signer: user.name,
          message: `[교육 결재완료] 대표이사 ${user.name}님이 "${eduTitle}" 최종 결재를 완료했습니다.`,
          ts: Date.now()
        })
      }

      return c.json({ success: true, approval_role, signer: user.name, label: roleLabel[approval_role] })
    } catch (e: any) {
      console.error('[POST /education/sessions/:id/approval-sign] 에러:', e?.message)
      return c.json({ error: e?.message || '결재 서명 처리 실패' }, 500)
    }
  })
}
