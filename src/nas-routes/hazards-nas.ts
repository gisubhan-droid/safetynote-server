/**
 * nas-routes/hazards-nas.ts — 위험신고·아차사고·안전건의사항 파일 API (NAS 전용)
 *
 * [FEAT-196] 사진/첨부파일을 base64 inline 에서 NAS 파일 저장으로 변경
 *
 * 폴더 구조:
 *   danger     → {root}/{년도}/위험신고/{날짜}_{위치요약}/신고사진|처리사진/
 *   nearmiss   → {root}/{년도}/아차사고/{날짜}_{위치요약}/신고사진|처리사진/
 *   suggestion → {root}/{년도}/안전건의사항/{날짜}_{위치요약}/사진|첨부파일/
 *
 * 포함 라우트 (9개):
 *   POST   /api/hazard-reports/:id/photos              — 신고 사진 업로드
 *   DELETE /api/hazard-reports/photos/:photoId         — 신고 사진 삭제
 *   GET    /api/hazard-reports/photos/:photoId/img     — 신고 사진 조회
 *
 *   POST   /api/hazard-reports/:id/resolve-photos      — 처리 사진 업로드
 *   DELETE /api/hazard-reports/resolve-photos/:photoId — 처리 사진 삭제
 *   GET    /api/hazard-reports/resolve-photos/:photoId/img — 처리 사진 조회
 *
 *   POST   /api/hazard-reports/:id/docs                — 첨부파일 업로드
 *   DELETE /api/hazard-reports/docs/:docId             — 첨부파일 삭제
 *   GET    /api/hazard-reports/docs/:docId/download    — 첨부파일 다운로드
 */

import { Hono } from 'hono'
import { getRawDb, getUser, getUploadRootNow } from '../nas-db'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const app = new Hono()

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function safeName(s: string): string {
  return (s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 30)
}

function genFileName(original: string): string {
  const ext  = (original.split('.').pop() || 'bin').toLowerCase()
  const ts   = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  return `${ts}_${rand}.${ext}`
}

/**
 * 위험신고·아차사고·안전건의사항 파일 저장 디렉토리 반환
 * @param reportId - hazard_reports.id
 * @param subDir   - 'report_photos' | 'resolve_photos' | 'docs'
 * @returns { dir: 절대경로, relBase: URL 상대경로 }
 */
function getHazardUploadDir(
  reportId: number,
  subDir: 'report_photos' | 'resolve_photos' | 'docs'
): { dir: string; relBase: string } {
  const rawDb = getRawDb()
  const root  = getUploadRootNow()

  const row: any = rawDb.prepare(
    `SELECT report_type, location, report_date, created_at FROM hazard_reports WHERE id=?`
  ).get(reportId)

  if (!row) {
    // 레코드 없으면 임시 경로 사용
    const fallbackDir = join(root, 'hazard_reports', String(reportId), subDir)
    mkdirSync(fallbackDir, { recursive: true })
    return { dir: fallbackDir, relBase: `/uploads/hazard_reports/${reportId}/${subDir}` }
  }

  // 카테고리 폴더명 결정
  const reportType = row.report_type || 'danger'
  let category: string
  if (reportType === 'nearmiss') {
    category = '아차사고'
  } else if (reportType === 'suggestion') {
    category = '안전건의사항'
  } else {
    category = '위험신고'
  }

  // 날짜 추출 (report_date 또는 created_at)
  const dateRaw = (row.report_date || row.created_at || '').substring(0, 10)
  const year    = dateRaw.substring(0, 4) || String(new Date().getFullYear())

  // 위치 요약 (최대 30자)
  const locStr     = safeName(row.location || '')
  const folderName = `${dateRaw}_${locStr}` || `report_${reportId}`

  // 서브 디렉토리 한글 레이블
  let subLabel: string
  if (subDir === 'report_photos') {
    subLabel = reportType === 'suggestion' ? '사진' : '신고사진'
  } else if (subDir === 'resolve_photos') {
    subLabel = '처리사진'
  } else {
    subLabel = '첨부파일'
  }

  const dir = join(root, year, category, folderName, subLabel)
  mkdirSync(dir, { recursive: true })

  const relBase = `/uploads/${year}/${category}/${folderName}/${subLabel}`
  return { dir, relBase }
}

// ─── DB 테이블 자동생성 (호출 시 1회) ────────────────────────────────────────
// patchSchema v0.190 에서도 생성하지만, 라우트 핸들러 최초 호출 시 보장

let _tablesEnsured = false
function ensureHazardNasTables(): void {
  if (_tablesEnsured) return
  _tablesEnsured = true
  const rawDb = getRawDb()
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS hazard_report_photos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id   INTEGER NOT NULL,
      photo_type  TEXT    NOT NULL DEFAULT 'report',
      file_path   TEXT    NOT NULL DEFAULT '',
      file_name   TEXT    NOT NULL DEFAULT '',
      mime_type   TEXT    NOT NULL DEFAULT 'image/jpeg',
      file_size   INTEGER NOT NULL DEFAULT 0,
      caption     TEXT    NOT NULL DEFAULT '',
      created_by  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `)
  rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_hazard_report_photos_report_id
    ON hazard_report_photos(report_id, photo_type)
  `)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS hazard_report_docs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id   INTEGER NOT NULL,
      file_path   TEXT    NOT NULL DEFAULT '',
      file_name   TEXT    NOT NULL DEFAULT '',
      orig_name   TEXT    NOT NULL DEFAULT '',
      mime_type   TEXT    NOT NULL DEFAULT 'application/octet-stream',
      file_size   INTEGER NOT NULL DEFAULT 0,
      created_by  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `)
  rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_hazard_report_docs_report_id
    ON hazard_report_docs(report_id)
  `)
}

// ─── 신고 사진 업로드 ─────────────────────────────────────────────────────────

// POST /api/hazard-reports/:id/photos
app.post('/:id/photos', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  ensureHazardNasTables()
  const rawDb    = getRawDb()
  const reportId = Number(c.req.param('id'))

  const report: any = rawDb.prepare(`SELECT id FROM hazard_reports WHERE id=?`).get(reportId)
  if (!report) return c.json({ error: '신고 없음' }, 404)

  let formData: FormData
  try { formData = await c.req.formData() }
  catch(_) { return c.json({ error: '파일 파싱 실패' }, 400) }

  const caption = (formData.get('caption') as string) || ''
  const file    = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file 필드 필수' }, 400)

  const { dir, relBase } = getHazardUploadDir(reportId, 'report_photos')
  const savedName = genFileName(file.name)
  const filePath  = join(dir, savedName)
  const buf = await file.arrayBuffer()
  writeFileSync(filePath, Buffer.from(buf))

  const info = rawDb.prepare(`
    INSERT INTO hazard_report_photos
      (report_id, photo_type, file_path, file_name, mime_type, file_size, caption, created_by)
    VALUES (?, 'report', ?, ?, ?, ?, ?, ?)
  `).run(reportId, filePath, file.name, file.type || 'image/jpeg', buf.byteLength, caption, user.id)

  return c.json({ success: true, id: Number(info.lastInsertRowid), url: `${relBase}/${savedName}` })
})

// DELETE /api/hazard-reports/photos/:photoId
app.delete('/photos/:photoId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  ensureHazardNasTables()
  const rawDb   = getRawDb()
  const photoId = Number(c.req.param('photoId'))

  const row: any = rawDb.prepare(
    `SELECT file_path, created_by FROM hazard_report_photos WHERE id=? AND photo_type='report'`
  ).get(photoId)
  if (!row) return c.json({ error: '사진 없음' }, 404)

  // worker는 본인 사진만 삭제
  if (user.role === 'worker' && row.created_by !== user.id) {
    return c.json({ error: '권한 없음' }, 403)
  }

  if (row.file_path && existsSync(row.file_path)) {
    try { unlinkSync(row.file_path) } catch(_) {}
  }
  rawDb.prepare(`DELETE FROM hazard_report_photos WHERE id=?`).run(photoId)
  return c.json({ success: true })
})

// GET /api/hazard-reports/photos/:photoId/img
app.get('/photos/:photoId/img', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  ensureHazardNasTables()
  const rawDb   = getRawDb()
  const photoId = Number(c.req.param('photoId'))

  const row: any = rawDb.prepare(
    `SELECT file_path, mime_type FROM hazard_report_photos WHERE id=? AND photo_type='report'`
  ).get(photoId)
  if (!row) return c.json({ error: '사진 없음' }, 404)

  if (!row.file_path || !existsSync(row.file_path)) {
    return c.json({ error: '파일 없음' }, 404)
  }
  let buf: Buffer
  try { buf = readFileSync(row.file_path) }
  catch(_) { return c.json({ error: '파일 읽기 실패' }, 500) }

  return new Response(buf, {
    headers: {
      'Content-Type': row.mime_type || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

// ─── 처리 사진 업로드 ─────────────────────────────────────────────────────────

// POST /api/hazard-reports/:id/resolve-photos
app.post('/:id/resolve-photos', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  ensureHazardNasTables()
  const rawDb    = getRawDb()
  const reportId = Number(c.req.param('id'))

  const report: any = rawDb.prepare(`SELECT id FROM hazard_reports WHERE id=?`).get(reportId)
  if (!report) return c.json({ error: '신고 없음' }, 404)

  let formData: FormData
  try { formData = await c.req.formData() }
  catch(_) { return c.json({ error: '파일 파싱 실패' }, 400) }

  const caption = (formData.get('caption') as string) || ''
  const file    = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file 필드 필수' }, 400)

  const { dir, relBase } = getHazardUploadDir(reportId, 'resolve_photos')
  const savedName = genFileName(file.name)
  const filePath  = join(dir, savedName)
  const buf = await file.arrayBuffer()
  writeFileSync(filePath, Buffer.from(buf))

  const info = rawDb.prepare(`
    INSERT INTO hazard_report_photos
      (report_id, photo_type, file_path, file_name, mime_type, file_size, caption, created_by)
    VALUES (?, 'resolve', ?, ?, ?, ?, ?, ?)
  `).run(reportId, filePath, file.name, file.type || 'image/jpeg', buf.byteLength, caption, user.id)

  return c.json({ success: true, id: Number(info.lastInsertRowid), url: `${relBase}/${savedName}` })
})

// DELETE /api/hazard-reports/resolve-photos/:photoId
app.delete('/resolve-photos/:photoId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  ensureHazardNasTables()
  const rawDb   = getRawDb()
  const photoId = Number(c.req.param('photoId'))

  const row: any = rawDb.prepare(
    `SELECT file_path FROM hazard_report_photos WHERE id=? AND photo_type='resolve'`
  ).get(photoId)
  if (!row) return c.json({ error: '사진 없음' }, 404)

  if (row.file_path && existsSync(row.file_path)) {
    try { unlinkSync(row.file_path) } catch(_) {}
  }
  rawDb.prepare(`DELETE FROM hazard_report_photos WHERE id=?`).run(photoId)
  return c.json({ success: true })
})

// GET /api/hazard-reports/resolve-photos/:photoId/img
app.get('/resolve-photos/:photoId/img', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  ensureHazardNasTables()
  const rawDb   = getRawDb()
  const photoId = Number(c.req.param('photoId'))

  const row: any = rawDb.prepare(
    `SELECT file_path, mime_type FROM hazard_report_photos WHERE id=? AND photo_type='resolve'`
  ).get(photoId)
  if (!row) return c.json({ error: '사진 없음' }, 404)

  if (!row.file_path || !existsSync(row.file_path)) {
    return c.json({ error: '파일 없음' }, 404)
  }
  let buf: Buffer
  try { buf = readFileSync(row.file_path) }
  catch(_) { return c.json({ error: '파일 읽기 실패' }, 500) }

  return new Response(buf, {
    headers: {
      'Content-Type': row.mime_type || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

// ─── 첨부파일 (docs) ─────────────────────────────────────────────────────────

const ALLOWED_DOC_EXT = [
  'pdf','doc','docx','xls','xlsx','ppt','pptx','hwp','hwpx','txt',
  'jpg','jpeg','png','gif','webp','heic','mp4','zip','7z'
]
const MAX_DOC_MB = 50

// POST /api/hazard-reports/:id/docs
app.post('/:id/docs', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  ensureHazardNasTables()
  const rawDb    = getRawDb()
  const reportId = Number(c.req.param('id'))

  const report: any = rawDb.prepare(`SELECT id FROM hazard_reports WHERE id=?`).get(reportId)
  if (!report) return c.json({ error: '신고 없음' }, 404)

  let formData: FormData
  try { formData = await c.req.formData() }
  catch(_) { return c.json({ error: '파일 파싱 실패' }, 400) }

  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file 필드 필수' }, 400)

  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_DOC_EXT.includes(ext)) {
    return c.json({ error: `허용되지 않는 파일 형식: ${ext}` }, 400)
  }
  const buf = await file.arrayBuffer()
  if (buf.byteLength > MAX_DOC_MB * 1024 * 1024) {
    return c.json({ error: `파일 크기 초과 (최대 ${MAX_DOC_MB}MB)` }, 400)
  }

  const { dir } = getHazardUploadDir(reportId, 'docs')
  const savedName = genFileName(file.name)
  const filePath  = join(dir, savedName)
  writeFileSync(filePath, Buffer.from(buf))

  const info = rawDb.prepare(`
    INSERT INTO hazard_report_docs
      (report_id, file_path, file_name, orig_name, mime_type, file_size, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(reportId, filePath, savedName, file.name, file.type || 'application/octet-stream', buf.byteLength, user.id)

  return c.json({ success: true, id: Number(info.lastInsertRowid) })
})

// DELETE /api/hazard-reports/docs/:docId
app.delete('/docs/:docId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  ensureHazardNasTables()
  const rawDb = getRawDb()
  const docId = Number(c.req.param('docId'))

  const row: any = rawDb.prepare(
    `SELECT file_path, created_by FROM hazard_report_docs WHERE id=?`
  ).get(docId)
  if (!row) return c.json({ error: '파일 없음' }, 404)

  // worker는 본인 파일만 삭제
  if (user.role === 'worker' && row.created_by !== user.id) {
    return c.json({ error: '권한 없음' }, 403)
  }

  if (row.file_path && existsSync(row.file_path)) {
    try { unlinkSync(row.file_path) } catch(_) {}
  }
  rawDb.prepare(`DELETE FROM hazard_report_docs WHERE id=?`).run(docId)
  return c.json({ success: true })
})

// GET /api/hazard-reports/docs/:docId/download
app.get('/docs/:docId/download', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  ensureHazardNasTables()
  const rawDb = getRawDb()
  const docId = Number(c.req.param('docId'))

  const row: any = rawDb.prepare(
    `SELECT file_path, orig_name, mime_type FROM hazard_report_docs WHERE id=?`
  ).get(docId)
  if (!row) return c.json({ error: '파일 없음' }, 404)

  if (!row.file_path || !existsSync(row.file_path)) {
    return c.json({ error: '파일 없음' }, 404)
  }
  let buf: Buffer
  try { buf = readFileSync(row.file_path) }
  catch(_) { return c.json({ error: '파일 읽기 실패' }, 500) }

  const origName = encodeURIComponent(row.orig_name || 'file')
  return new Response(buf, {
    headers: {
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${origName}`,
    },
  })
})

// ─── 보조: 단건 신고 + 사진 목록 조회 ────────────────────────────────────────
// GET /api/hazard-reports/:id  — 단건 상세 (사진목록 포함)
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  ensureHazardNasTables()
  const rawDb    = getRawDb()
  const reportId = Number(c.req.param('id'))

  const row: any = rawDb.prepare(`
    SELECT hr.*, u.name as reporter_name, t.title as task_title,
      ru.name as resolved_by_name
    FROM hazard_reports hr
    LEFT JOIN users u ON u.id = hr.reporter_id
    LEFT JOIN tasks t ON t.id = hr.task_id
    LEFT JOIN users ru ON ru.id = hr.resolved_by
    WHERE hr.id = ?
  `).get(reportId)

  if (!row) return c.json({ error: '신고 없음' }, 404)

  // worker는 본인 신고만 조회
  if (user.role === 'worker' && row.reporter_id !== user.id) {
    return c.json({ error: '권한 없음' }, 403)
  }

  // 신고 사진 목록
  const reportPhotos = rawDb.prepare(
    `SELECT id, caption, created_at FROM hazard_report_photos WHERE report_id=? AND photo_type='report' ORDER BY id ASC`
  ).all(reportId) as any[]

  // 처리 사진 목록
  const resolvePhotos = rawDb.prepare(
    `SELECT id, caption, created_at FROM hazard_report_photos WHERE report_id=? AND photo_type='resolve' ORDER BY id ASC`
  ).all(reportId) as any[]

  // 첨부파일 목록
  const docs = rawDb.prepare(
    `SELECT id, orig_name, mime_type, file_size, created_at FROM hazard_report_docs WHERE report_id=? ORDER BY id ASC`
  ).all(reportId) as any[]

  return c.json({
    ...row,
    report_photos:   reportPhotos,
    resolve_photos:  resolvePhotos,
    docs,
  })
})

export default app
