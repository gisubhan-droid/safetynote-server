/**
 * education-extra.ts — 안전교육 증빙사진 + 결과보고서 API (NAS 전용)
 *
 * 포함 라우트 (4개):
 *   GET    /api/education/sessions/:id/photos
 *   POST   /api/education/sessions/:id/photos
 *   DELETE /api/education/photos/:photoId
 *   GET    /api/education/sessions/:id/report
 *   PUT    /api/education/sessions/:id/report
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
}
