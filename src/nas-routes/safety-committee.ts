/**
 * nas-routes/safety-committee.ts — 산업안전보건위원회 API (NAS 전용)
 *
 * 근거법령: 산업안전보건법 제24조(산업안전보건위원회)
 * 보존기간: 3년 (산업안전보건법 시행규칙 제30조)
 *
 * 포함 라우트:
 *   GET    /api/safety-committee/members                        — 상시위원 명단
 *   POST   /api/safety-committee/members                        — 위원 등록
 *   PATCH  /api/safety-committee/members/:id                    — 위원 수정
 *   DELETE /api/safety-committee/members/:id                    — 위원 해제
 *
 *   GET    /api/safety-committee/meetings                       — 회의 목록
 *   POST   /api/safety-committee/meetings                       — 회의 생성
 *   GET    /api/safety-committee/meetings/:id                   — 회의 상세
 *   PATCH  /api/safety-committee/meetings/:id                   — 회의 수정
 *   DELETE /api/safety-committee/meetings/:id                   — 회의 삭제
 *
 *   POST   /api/safety-committee/meetings/:id/attendees         — 참석자 추가
 *   DELETE /api/safety-committee/meetings/:id/attendees/:aid    — 참석자 삭제
 *   PATCH  /api/safety-committee/meetings/:id/attendees/:aid/sign — 참석자 서명
 *
 *   POST   /api/safety-committee/agendas/:agendaId/vote         — 안건 찬반투표
 *
 *   POST   /api/safety-committee/meetings/:id/photos            — 회의 사진 업로드
 *   DELETE /api/safety-committee/photos/:photoId                — 사진 삭제
 *   GET    /api/safety-committee/photos/:photoId/img            — 사진 이미지 조회
 *
 *   POST   /api/safety-committee/meetings/:id/docs              — 회의 자료 첨부
 *   DELETE /api/safety-committee/docs/:docId                    — 회의 자료 삭제
 *   GET    /api/safety-committee/docs/:docId/download           — 회의 자료 다운로드
 */

import { Hono } from 'hono'
import { getRawDb, getUser, getUploadRootNow } from '../nas-db'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const app = new Hono()

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function safeName(s: string): string {
  return (s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim()
}

function genFileName(original: string): string {
  const ext  = (original.split('.').pop() || 'bin').toLowerCase()
  const ts   = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  return `${ts}_${rand}.${ext}`
}

function getScUploadDir(subDir: string): string {
  const root = getUploadRootNow()
  const dir  = join(root, 'safety_committee', subDir)
  mkdirSync(dir, { recursive: true })
  return dir
}

// ─── 상시위원 API ─────────────────────────────────────────────────────────────

// GET /api/safety-committee/members
app.get('/members', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const rows = rawDb.prepare(`
    SELECT scm.*, u.name as user_name, u.position as user_position,
           u.department as user_department, u.role as user_role
    FROM safety_committee_members scm
    LEFT JOIN users u ON u.id = scm.user_id
    WHERE scm.is_active = 1
    ORDER BY scm.sort_order ASC, scm.id ASC
  `).all()
  return c.json(rows)
})

// POST /api/safety-committee/members
app.post('/members', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const body = await c.req.json().catch(() => ({})) as any
  // app.js 필드명: user_id, side, role_type, custom_title, appointed_at
  const { user_id, side, role_type, custom_title, appointed_at } = body

  if (!user_id)
    return c.json({ error: 'user_id 필수' }, 400)

  const info = rawDb.prepare(`
    INSERT INTO safety_committee_members
      (user_id, role_type, custom_title, side, appointed_at, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(
    Number(user_id),
    role_type || 'member',
    custom_title || null,
    side || 'employer',
    appointed_at || null
  )
  return c.json({ ok: true, id: info.lastInsertRowid })
})

// PATCH /api/safety-committee/members/:id
app.patch('/members/:id', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const id   = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({})) as any
  // app.js 필드명: side, role_type, custom_title, appointed_at, is_active
  const { side, role_type, custom_title, appointed_at, is_active } = body

  rawDb.prepare(`
    UPDATE safety_committee_members SET
      role_type    = COALESCE(?, role_type),
      custom_title = COALESCE(?, custom_title),
      side         = COALESCE(?, side),
      appointed_at = COALESCE(?, appointed_at),
      is_active    = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    role_type    || null,
    custom_title != null ? custom_title : null,
    side         || null,
    appointed_at || null,
    is_active != null ? Number(is_active) : null,
    id
  )
  return c.json({ ok: true })
})

// DELETE /api/safety-committee/members/:id
app.delete('/members/:id', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const id = Number(c.req.param('id'))
  rawDb.prepare(`UPDATE safety_committee_members SET is_active = 0 WHERE id = ?`).run(id)
  return c.json({ success: true })
})

// ─── 회의 목록/생성 API ───────────────────────────────────────────────────────

// GET /api/safety-committee/meetings?year=&quarter=
app.get('/meetings', async (c) => {
  const rawDb  = getRawDb()
  const user   = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const year    = c.req.query('year')    || ''
  const quarter = c.req.query('quarter') || ''

  // DB 컬럼: held_date (TEXT), meeting_type, confirmed
  let where = 'WHERE 1=1'
  const params: (string | number)[] = []
  if (year)    { where += " AND substr(m.held_date,1,4) = ?"; params.push(String(year)) }
  if (quarter) {
    const q = Number(quarter)
    // quarter 1→월1~3, 2→4~6, 3→7~9, 4→10~12
    const mStart = String((q - 1) * 3 + 1).padStart(2, '0')
    const mEnd   = String(q * 3).padStart(2, '0')
    where += ` AND substr(m.held_date,6,2) >= ? AND substr(m.held_date,6,2) <= ?`
    params.push(mStart, mEnd)
  }

  const rows = rawDb.prepare(`
    SELECT m.*,
           u.name as created_by_name,
           (SELECT COUNT(*) FROM safety_committee_attendees WHERE meeting_id = m.id) as attendee_count,
           (SELECT COUNT(*) FROM safety_committee_agendas   WHERE meeting_id = m.id) as agenda_count,
           (SELECT COUNT(*) FROM safety_committee_docs      WHERE meeting_id = m.id) as doc_count
    FROM safety_committee_meetings m
    LEFT JOIN users u ON u.id = m.created_by
    ${where}
    ORDER BY m.held_date DESC
  `).all(...params)
  return c.json(rows)
})

// POST /api/safety-committee/meetings
app.post('/meetings', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const body = await c.req.json().catch(() => ({})) as any
  // app.js 필드명: title, held_date, meeting_type, location, summary
  const { title, held_date, meeting_type, location, summary } = body

  if (!title || !held_date)
    return c.json({ error: 'title, held_date 필수' }, 400)

  const info = rawDb.prepare(`
    INSERT INTO safety_committee_meetings
      (title, held_date, meeting_type, location, summary, confirmed, created_by)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(
    title,
    held_date,
    meeting_type || 'regular',
    location || '',
    summary  || '',
    user.id
  )
  return c.json({ ok: true, id: info.lastInsertRowid })
})

// GET /api/safety-committee/meetings/:id
app.get('/meetings/:id', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = Number(c.req.param('id'))
  const meeting: any = rawDb.prepare(`
    SELECT m.*, u.name as created_by_name
    FROM safety_committee_meetings m
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.id = ?
  `).get(id)
  if (!meeting) return c.json({ error: '회의 없음' }, 404)

  const attendees = rawDb.prepare(`
    SELECT a.*, u.name as user_name, u.position as user_position,
           u.department as user_department
    FROM safety_committee_attendees a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.meeting_id = ?
    ORDER BY a.id ASC
  `).all(id)

  const agendas = rawDb.prepare(`
    SELECT ag.*, u.name as assignee_name,
           (SELECT COUNT(*) FROM safety_committee_votes WHERE agenda_id = ag.id AND vote='agree')    as vote_agree,
           (SELECT COUNT(*) FROM safety_committee_votes WHERE agenda_id = ag.id AND vote='disagree') as vote_disagree,
           (SELECT COUNT(*) FROM safety_committee_votes WHERE agenda_id = ag.id AND vote='abstain')  as vote_abstain
    FROM safety_committee_agendas ag
    LEFT JOIN users u ON u.id = ag.assignee_id
    WHERE ag.meeting_id = ?
    ORDER BY ag.agenda_no ASC
  `).all(id)

  const photos = rawDb.prepare(`
    SELECT id, file_name, caption, created_at, mime_type
    FROM safety_committee_photos
    WHERE meeting_id = ?
    ORDER BY id ASC
  `).all(id)

  const docs = rawDb.prepare(`
    SELECT id, file_name, file_size, mime_type, caption, uploader_id,
           u.name as uploader_name, created_at
    FROM safety_committee_docs sd
    LEFT JOIN users u ON u.id = sd.uploader_id
    WHERE sd.meeting_id = ?
    ORDER BY sd.id ASC
  `).all(id)

  return c.json({ meeting, attendees, agendas, photos, docs })
})

// PATCH /api/safety-committee/meetings/:id
app.patch('/meetings/:id', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const id   = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({})) as any
  // app.js 필드명: title, held_date, meeting_type, location, summary, confirmed, legal_items
  const { title, held_date, meeting_type, location, summary, confirmed, legal_items } = body

  rawDb.prepare(`
    UPDATE safety_committee_meetings SET
      title        = COALESCE(?, title),
      held_date    = COALESCE(?, held_date),
      meeting_type = COALESCE(?, meeting_type),
      location     = COALESCE(?, location),
      summary      = COALESCE(?, summary),
      confirmed    = COALESCE(?, confirmed),
      legal_items  = COALESCE(?, legal_items),
      updated_at   = datetime('now','localtime')
    WHERE id = ?
  `).run(
    title        || null,
    held_date    || null,
    meeting_type || null,
    location     != null ? location     : null,
    summary      != null ? summary      : null,
    confirmed    != null ? Number(confirmed) : null,
    legal_items  != null ? legal_items  : null,
    id
  )

  // 안건 일괄 저장 (있을 경우)
  if (body.agendas && Array.isArray(body.agendas)) {
    // 기존 삭제 후 재삽입
    rawDb.prepare(`DELETE FROM safety_committee_agendas WHERE meeting_id = ?`).run(id)
    for (const ag of body.agendas) {
      rawDb.prepare(`
        INSERT INTO safety_committee_agendas
          (meeting_id, agenda_no, title, content, decision, assignee_id, due_date, vote_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, Number(ag.agenda_no) || 1,
        ag.title || '',
        ag.content || null, ag.decision || null,
        ag.assignee_id ? Number(ag.assignee_id) : null,
        ag.due_date || null,
        ag.vote_enabled ? 1 : 0
      )
    }
  }
  return c.json({ success: true })
})

// DELETE /api/safety-committee/meetings/:id
app.delete('/meetings/:id', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const id = Number(c.req.param('id'))
  // 연관 데이터 cascade 삭제
  rawDb.prepare(`DELETE FROM safety_committee_votes     WHERE meeting_id = ?`).run(id)
  rawDb.prepare(`DELETE FROM safety_committee_agendas   WHERE meeting_id = ?`).run(id)
  rawDb.prepare(`DELETE FROM safety_committee_attendees WHERE meeting_id = ?`).run(id)
  // 사진 파일 삭제
  const photos: any[] = rawDb.prepare(`SELECT file_path FROM safety_committee_photos WHERE meeting_id = ?`).all(id)
  for (const p of photos) {
    if (p.file_path && existsSync(p.file_path)) {
      try { unlinkSync(p.file_path) } catch(_) {}
    }
  }
  rawDb.prepare(`DELETE FROM safety_committee_photos WHERE meeting_id = ?`).run(id)
  // 회의 자료 파일 삭제
  const docsRows: any[] = rawDb.prepare(`SELECT file_path FROM safety_committee_docs WHERE meeting_id = ?`).all(id)
  for (const d of docsRows) {
    if (d.file_path && existsSync(d.file_path)) {
      try { unlinkSync(d.file_path) } catch(_) {}
    }
  }
  rawDb.prepare(`DELETE FROM safety_committee_docs WHERE meeting_id = ?`).run(id)
  rawDb.prepare(`DELETE FROM safety_committee_meetings WHERE id = ?`).run(id)
  return c.json({ success: true })
})

// ─── 참석자 API ───────────────────────────────────────────────────────────────

// POST /api/safety-committee/meetings/:id/attendees
app.post('/meetings/:id/attendees', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const meetingId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({})) as any
  // DB 컬럼: user_id, name, role_type, custom_title, side
  const { user_id, name, role_type, custom_title, side } = body

  if (!name && !user_id)
    return c.json({ error: 'user_id 또는 name 필수' }, 400)

  // user_id 중복 방지
  if (user_id) {
    const exist: any = rawDb.prepare(
      `SELECT id FROM safety_committee_attendees WHERE meeting_id=? AND user_id=?`
    ).get(meetingId, Number(user_id))
    if (exist) return c.json({ error: '이미 참석자로 등록됨', id: exist.id }, 409)
  }

  const info = rawDb.prepare(`
    INSERT INTO safety_committee_attendees
      (meeting_id, user_id, name, role_type, custom_title, side)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    meetingId,
    user_id ? Number(user_id) : null,
    name || null,
    role_type    || 'member',
    custom_title || null,
    side         || 'employer'
  )
  return c.json({ ok: true, id: info.lastInsertRowid })
})

// DELETE /api/safety-committee/meetings/:id/attendees/:aid
app.delete('/meetings/:id/attendees/:aid', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const aid = Number(c.req.param('aid'))
  rawDb.prepare(`DELETE FROM safety_committee_attendees WHERE id = ?`).run(aid)
  return c.json({ success: true })
})

// PATCH /api/safety-committee/meetings/:id/attendees/:aid/sign
app.patch('/meetings/:id/attendees/:aid/sign', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const aid  = Number(c.req.param('aid'))
  const body = await c.req.json().catch(() => ({})) as any
  const { sign_data } = body

  const att: any = rawDb.prepare(`SELECT * FROM safety_committee_attendees WHERE id=?`).get(aid)
  if (!att) return c.json({ error: '참석자 없음' }, 404)

  // 본인 서명만 허용 (admin 예외)
  if (att.user_id && att.user_id !== user.id && user.role !== 'admin')
    return c.json({ error: '본인 서명만 가능합니다.' }, 403)

  rawDb.prepare(`
    UPDATE safety_committee_attendees
    SET signature_data = ?, signed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(sign_data || null, aid)
  return c.json({ success: true })
})

// ─── 찬반투표 API ─────────────────────────────────────────────────────────────

// POST /api/safety-committee/agendas/:agendaId/vote
app.post('/agendas/:agendaId/vote', async (c) => {
  const rawDb   = getRawDb()
  const user    = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const agendaId = Number(c.req.param('agendaId'))
  const body = await c.req.json().catch(() => ({})) as any
  const { vote } = body  // agree | disagree | abstain

  if (!['agree','disagree','abstain'].includes(vote))
    return c.json({ error: 'vote는 agree|disagree|abstain 중 하나' }, 400)

  const agenda: any = rawDb.prepare(`SELECT * FROM safety_committee_agendas WHERE id=?`).get(agendaId)
  if (!agenda) return c.json({ error: '안건 없음' }, 404)
  if (!agenda.vote_enabled) return c.json({ error: '이 안건은 투표가 비활성화됨' }, 400)

  // 회의 상태 확인 — confirmed 이면 투표 마감
  const meeting: any = rawDb.prepare(`SELECT confirmed FROM safety_committee_meetings WHERE id=?`).get(agenda.meeting_id)
  if (meeting?.confirmed === 1)
    return c.json({ error: '확정된 회의는 투표 변경 불가' }, 409)

  // UPSERT (기존 투표 변경 허용)
  rawDb.prepare(`
    INSERT INTO safety_committee_votes (agenda_id, meeting_id, user_id, vote)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(agenda_id, user_id) DO UPDATE SET vote=excluded.vote, voted_at=CURRENT_TIMESTAMP
  `).run(agendaId, agenda.meeting_id, user.id, vote)

  // 현재 집계 반환
  const counts: any = rawDb.prepare(`
    SELECT
      SUM(CASE WHEN vote='agree'    THEN 1 ELSE 0 END) as agree,
      SUM(CASE WHEN vote='disagree' THEN 1 ELSE 0 END) as disagree,
      SUM(CASE WHEN vote='abstain'  THEN 1 ELSE 0 END) as abstain
    FROM safety_committee_votes WHERE agenda_id=?
  `).get(agendaId)
  return c.json({ success: true, counts })
})

// ─── 회의 사진 API ────────────────────────────────────────────────────────────

// POST /api/safety-committee/meetings/:id/photos  (multipart)
app.post('/meetings/:id/photos', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const meetingId = Number(c.req.param('id'))
  let formData: FormData
  try { formData = await c.req.formData() }
  catch(_) { return c.json({ error: '파일 파싱 실패' }, 400) }

  const caption = (formData.get('caption') as string) || null
  const file    = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file 필드 필수' }, 400)

  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const dir  = getScUploadDir('photos')
  const savedName = genFileName(file.name)
  const filePath  = join(dir, savedName)
  const buf = await file.arrayBuffer()
  writeFileSync(filePath, Buffer.from(buf))

  const info = rawDb.prepare(`
    INSERT INTO safety_committee_photos (meeting_id, file_name, file_path, mime_type, caption)
    VALUES (?, ?, ?, ?, ?)
  `).run(meetingId, file.name, filePath, file.type || `image/${ext}`, caption)
  return c.json({ success: true, id: info.lastInsertRowid })
})

// DELETE /api/safety-committee/photos/:photoId
app.delete('/photos/:photoId', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const id = Number(c.req.param('photoId'))
  const row: any = rawDb.prepare(`SELECT file_path FROM safety_committee_photos WHERE id=?`).get(id)
  if (row?.file_path && existsSync(row.file_path)) {
    try { unlinkSync(row.file_path) } catch(_) {}
  }
  rawDb.prepare(`DELETE FROM safety_committee_photos WHERE id=?`).run(id)
  return c.json({ success: true })
})

// GET /api/safety-committee/photos/:photoId/img
app.get('/photos/:photoId/img', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = Number(c.req.param('photoId'))
  const row: any = rawDb.prepare(
    `SELECT file_path, file_data, mime_type, file_name FROM safety_committee_photos WHERE id=?`
  ).get(id)
  if (!row) return c.json({ error: '사진 없음' }, 404)

  let buf: Buffer | null = null
  if (row.file_path && existsSync(row.file_path)) {
    try { buf = readFileSync(row.file_path) } catch(_) {}
  }
  if (!buf && row.file_data) {
    buf = Buffer.from(row.file_data)
  }
  if (!buf) return c.json({ error: '파일 없음' }, 404)

  return new Response(buf, {
    headers: {
      'Content-Type': row.mime_type || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

// ─── 회의 자료 첨부 API ───────────────────────────────────────────────────────

// POST /api/safety-committee/meetings/:id/docs  (multipart)
app.post('/meetings/:id/docs', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const meetingId = Number(c.req.param('id'))
  const meeting: any = rawDb.prepare(`SELECT id FROM safety_committee_meetings WHERE id=?`).get(meetingId)
  if (!meeting) return c.json({ error: '회의 없음' }, 404)

  let formData: FormData
  try { formData = await c.req.formData() }
  catch(_) { return c.json({ error: '파일 파싱 실패' }, 400) }

  const caption = (formData.get('caption') as string) || null
  const files   = formData.getAll('files') as File[]
  const singleFile = formData.get('file') as File | null
  const allFiles   = singleFile ? [singleFile] : files

  if (allFiles.length === 0) return c.json({ error: 'file 또는 files 필드 필수' }, 400)

  const ALLOWED_EXT = ['pdf','doc','docx','xls','xlsx','ppt','pptx','hwp','hwpx','txt',
                       'jpg','jpeg','png','gif','webp','heic','mp4','zip','7z']
  const MAX_MB = 50

  const saved: any[] = []
  const errors: string[] = []

  const dir = getScUploadDir('docs')

  for (const file of allFiles) {
    if (!file || typeof file === 'string') continue
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) {
      errors.push(`${file.name}: 허용되지 않는 파일 형식`)
      continue
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      errors.push(`${file.name}: ${MAX_MB}MB 초과`)
      continue
    }
    const savedName = genFileName(file.name)
    const filePath  = join(dir, savedName)
    const buf = await file.arrayBuffer()
    writeFileSync(filePath, Buffer.from(buf))

    const mimeType = file.type || 'application/octet-stream'
    const info = rawDb.prepare(`
      INSERT INTO safety_committee_docs
        (meeting_id, file_name, file_path, file_size, mime_type, caption, uploader_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(meetingId, file.name, filePath, file.size, mimeType, caption, user.id)
    saved.push({ id: info.lastInsertRowid, file_name: file.name, file_size: file.size, mime_type: mimeType })
  }
  return c.json({ success: true, saved, errors })
})

// DELETE /api/safety-committee/docs/:docId
app.delete('/docs/:docId', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const id = Number(c.req.param('docId'))
  const row: any = rawDb.prepare(`SELECT file_path FROM safety_committee_docs WHERE id=?`).get(id)
  if (row?.file_path && existsSync(row.file_path)) {
    try { unlinkSync(row.file_path) } catch(_) {}
  }
  rawDb.prepare(`DELETE FROM safety_committee_docs WHERE id=?`).run(id)
  return c.json({ success: true })
})

// GET /api/safety-committee/docs/:docId/download
app.get('/docs/:docId/download', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = Number(c.req.param('docId'))
  const row: any = rawDb.prepare(
    `SELECT file_path, file_name, mime_type FROM safety_committee_docs WHERE id=?`
  ).get(id)
  if (!row) return c.json({ error: '파일 없음' }, 404)

  let buf: Buffer
  try { buf = readFileSync(row.file_path) }
  catch(_) { return c.json({ error: '파일을 찾을 수 없습니다.' }, 404) }

  const inline = (row.mime_type || '').startsWith('image/') || row.mime_type === 'application/pdf'
  return new Response(buf, {
    headers: {
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

export default app
