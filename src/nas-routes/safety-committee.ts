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
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const app = new Hono()

// ─── SC 전체 권한 미들웨어 ─────────────────────────────────────────────────────
// 산업안전보건위원회는 admin/supervisor 전용 메뉴
// 근로자(worker, lgu, lgu_plus) 접근 완전 차단
app.use('/*', async (c, next) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const blockedRoles = ['worker', 'lgu', 'lgu_plus']
  if (blockedRoles.includes(user.role))
    return c.json({ error: '산업안전보건위원회는 관리자/감독자 전용 메뉴입니다.' }, 403)
  return next()
})

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

// ─── SC 회의 폴더 구조 헬퍼 [세션 110] ───────────────────────────────────────
// 폴더 구조: {root}/{년도}/산업안전보건위원회/{날짜}_{제목}/사진|자료/
/**
 * SC 회의 사진/자료 업로드 디렉토리 반환 [세션 110]
 * @param meetingId - 회의 ID
 * @param subDir    - 'photos' | 'docs'
 * @returns { dir: 절대경로, relBase: URL 상대경로(/uploads/~) }
 */
function getScMeetingUploadDir(meetingId: number, subDir: 'photos' | 'docs'): { dir: string; relBase: string } {
  const rawDb = getRawDb()
  const root  = getUploadRootNow()
  const mtg: any = rawDb.prepare(
    `SELECT held_date, title FROM safety_committee_meetings WHERE id=?`
  ).get(meetingId)

  if (!mtg) {
    // 회의가 없으면 레거시 경로 사용
    const legacyDir = join(root, 'safety_committee', subDir)
    mkdirSync(legacyDir, { recursive: true })
    return { dir: legacyDir, relBase: `/uploads/safety_committee/${subDir}` }
  }

  // 년도 추출 (held_date: YYYY-MM-DD 또는 YYYY-MM-DD HH:mm:ss)
  const year       = (mtg.held_date || '').substring(0, 4) || String(new Date().getFullYear())
  const dateStr    = (mtg.held_date || '').substring(0, 10)
  const titleStr   = safeName(mtg.title || '')
  const folderName = `${dateStr}_${titleStr}` || dateStr || `meeting_${meetingId}`
  const subLabel   = subDir === 'photos' ? '사진' : '자료'

  const dir = join(root, year, '산업안전보건위원회', folderName, subLabel)
  mkdirSync(dir, { recursive: true })

  const relBase = `/uploads/${year}/산업안전보건위원회/${folderName}/${subLabel}`
  return { dir, relBase }
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
    ORDER BY scm.side ASC, scm.id ASC
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
    role_type    || 'member',
    custom_title || '',
    side         || 'employer',
    appointed_at || ''
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
    role_type    != null ? (role_type    || 'member')   : null,
    custom_title != null ?  custom_title                : null,
    side         != null ? (side         || 'employer') : null,
    appointed_at != null ?  appointed_at                : null,
    is_active    != null ?  Number(is_active)           : null,
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

  // ─── [BUG-182b] try/catch + 서브 테이블 빈 배열 fallback ─────────────────
  // 원인: NAS DB 마이그레이션 시 patchSchema 컬럼명 불일치 가능성
  //   - agendas: patchSchema(seq) vs 쿼리(agenda_no), patchSchema에 decision/due_date 없음
  //   - docs: patchSchema에 caption/uploader_id 없음
  // 대응: 각 서브 테이블 조회를 독립 try/catch로 감싸 빈 배열 반환 + 상세 에러 로깅
  // ─────────────────────────────────────────────────────────────────────────

  let meeting: any
  try {
    meeting = rawDb.prepare(`
      SELECT m.*, u.name as created_by_name
      FROM safety_committee_meetings m
      LEFT JOIN users u ON u.id = m.created_by
      WHERE m.id = ?
    `).get(id)
  } catch(e: any) {
    console.error('[SC] GET /meetings/:id — meetings 조회 오류:', e.message)
    return c.json({ error: 'DB 오류: ' + e.message }, 500)
  }
  if (!meeting) return c.json({ error: '회의 없음' }, 404)

  let attendees: any[] = []
  try {
    attendees = rawDb.prepare(`
      SELECT a.*, u.name as user_name, u.position as user_position,
             u.department as user_department
      FROM safety_committee_attendees a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.meeting_id = ?
      ORDER BY a.id ASC
    `).all(id)
  } catch(e: any) {
    console.warn('[SC] GET /meetings/:id — attendees 조회 실패 (빈 배열 반환):', e.message)
  }

  // agendas: agenda_no 컬럼 유무를 동적으로 판별하여 안전하게 조회
  let agendas: any[] = []
  try {
    // 1차 시도: agenda_no 컬럼 사용 (최신 스키마)
    agendas = rawDb.prepare(`
      SELECT ag.*,
             COALESCE(u.name, ag.assignee_name, '') as assignee_name,
             (SELECT COUNT(*) FROM safety_committee_votes WHERE agenda_id = ag.id AND vote='agree')    as vote_agree,
             (SELECT COUNT(*) FROM safety_committee_votes WHERE agenda_id = ag.id AND vote='disagree') as vote_disagree,
             (SELECT COUNT(*) FROM safety_committee_votes WHERE agenda_id = ag.id AND vote='abstain')  as vote_abstain
      FROM safety_committee_agendas ag
      LEFT JOIN users u ON u.id = ag.assignee_id
      WHERE ag.meeting_id = ?
      ORDER BY COALESCE(ag.agenda_no, ag.seq, ag.id) ASC
    `).all(id)
  } catch(e: any) {
    console.warn('[SC] GET /meetings/:id — agendas 1차 조회 실패, 단순 조회 시도:', e.message)
    try {
      // 2차 폴백: 컬럼명 문제 우회 — ag.* 만 조회
      agendas = rawDb.prepare(`
        SELECT ag.* FROM safety_committee_agendas ag
        WHERE ag.meeting_id = ? ORDER BY ag.id ASC
      `).all(id)
    } catch(e2: any) {
      console.warn('[SC] GET /meetings/:id — agendas 2차 조회도 실패 (빈 배열 반환):', e2.message)
    }
  }

  let photos: any[] = []
  try {
    photos = rawDb.prepare(`
      SELECT id, file_name, caption, created_at, mime_type
      FROM safety_committee_photos
      WHERE meeting_id = ?
      ORDER BY id ASC
    `).all(id)
  } catch(e: any) {
    console.warn('[SC] GET /meetings/:id — photos 조회 실패 (빈 배열 반환):', e.message)
    try {
      // caption 컬럼 없는 구 버전 대응
      photos = rawDb.prepare(`
        SELECT id, file_name, created_at, mime_type FROM safety_committee_photos
        WHERE meeting_id = ? ORDER BY id ASC
      `).all(id)
    } catch(e2: any) {
      console.warn('[SC] GET /meetings/:id — photos 2차 조회도 실패:', e2.message)
    }
  }

  let docs: any[] = []
  try {
    docs = rawDb.prepare(`
      SELECT id, file_name, file_size, mime_type, caption, uploader_id,
             u.name as uploader_name, created_at
      FROM safety_committee_docs sd
      LEFT JOIN users u ON u.id = sd.uploader_id
      WHERE sd.meeting_id = ?
      ORDER BY sd.id ASC
    `).all(id)
  } catch(e: any) {
    console.warn('[SC] GET /meetings/:id — docs 1차 조회 실패 (caption/uploader_id 없을 수 있음):', e.message)
    try {
      // caption / uploader_id 컬럼 없는 구 버전 대응
      docs = rawDb.prepare(`
        SELECT id, file_name, file_size, mime_type, created_by as uploader_id,
               created_at FROM safety_committee_docs
        WHERE meeting_id = ? ORDER BY id ASC
      `).all(id)
    } catch(e2: any) {
      console.warn('[SC] GET /meetings/:id — docs 2차 조회도 실패 (빈 배열 반환):', e2.message)
    }
  }

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
          (meeting_id, seq, title, content, assignee_id, assignee_name, result, vote_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        Number(ag.seq || ag.agenda_no) || 1,
        ag.title || '',
        ag.content || '',
        ag.assignee_id ? Number(ag.assignee_id) : null,
        ag.assignee_name || '',
        ag.result || ag.decision || '',
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
  // [BUG-190] 시스템관리자(admin)만 회의 삭제 가능 — 처리 단계 구분 없이 삭제 허용
  if (user.role !== 'admin')
    return c.json({ error: '시스템관리자만 회의를 삭제할 수 있습니다.' }, 403)

  const id = Number(c.req.param('id'))
  // [BUG-184b] 연관 데이터 cascade 삭제 — 각 테이블을 개별 try/catch로 보호
  // votes: meeting_id 컬럼이 없는 구버전 DB에서 500 방지
  // 방법1: meeting_id 컬럼 직접 삭제 시도
  // 방법2: 실패 시 agenda_id를 통한 간접 삭제로 폴백
  try {
    rawDb.prepare(`DELETE FROM safety_committee_votes WHERE meeting_id = ?`).run(id)
  } catch(e1: any) {
    // meeting_id 컬럼 없음 → agenda_id 경유 폴백 삭제
    console.warn('[SC] DELETE votes by meeting_id 실패, agenda_id 경유 폴백:', e1.message)
    try {
      const agendaIds: any[] = rawDb.prepare(`SELECT id FROM safety_committee_agendas WHERE meeting_id = ?`).all(id)
      for (const ag of agendaIds) {
        try { rawDb.prepare(`DELETE FROM safety_committee_votes WHERE agenda_id = ?`).run(ag.id) } catch(_) {}
      }
    } catch(e2: any) {
      console.warn('[SC] DELETE votes 폴백도 실패 (무시):', e2.message)
    }
  }
  try {
    rawDb.prepare(`DELETE FROM safety_committee_agendas WHERE meeting_id = ?`).run(id)
  } catch(e: any) { console.warn('[SC] DELETE agendas 오류 (무시):', e.message) }
  try {
    rawDb.prepare(`DELETE FROM safety_committee_attendees WHERE meeting_id = ?`).run(id)
  } catch(e: any) { console.warn('[SC] DELETE attendees 오류 (무시):', e.message) }
  // 사진 파일 삭제
  try {
    const photos: any[] = rawDb.prepare(`SELECT file_path FROM safety_committee_photos WHERE meeting_id = ?`).all(id)
    for (const p of photos) {
      if (p.file_path && existsSync(p.file_path)) {
        try { unlinkSync(p.file_path) } catch(_) {}
      }
    }
    rawDb.prepare(`DELETE FROM safety_committee_photos WHERE meeting_id = ?`).run(id)
  } catch(e: any) { console.warn('[SC] DELETE photos 오류 (무시):', e.message) }
  // 회의 자료 파일 삭제
  try {
    const docsRows: any[] = rawDb.prepare(`SELECT file_path FROM safety_committee_docs WHERE meeting_id = ?`).all(id)
    for (const d of docsRows) {
      if (d.file_path && existsSync(d.file_path)) {
        try { unlinkSync(d.file_path) } catch(_) {}
      }
    }
    rawDb.prepare(`DELETE FROM safety_committee_docs WHERE meeting_id = ?`).run(id)
  } catch(e: any) { console.warn('[SC] DELETE docs 오류 (무시):', e.message) }
  // 회의 본체 삭제
  try {
    rawDb.prepare(`DELETE FROM safety_committee_meetings WHERE id = ?`).run(id)
  } catch(e: any) {
    console.error('[SC] DELETE meetings 오류:', e.message)
    return c.json({ error: '회의 삭제 실패: ' + e.message }, 500)
  }
  return c.json({ success: true })
})

// ─── 하위 호환 라우트: /meeting (단수) → /meetings (복수) 리다이렉트 ─────────
// 구버전 클라이언트(app.js 미업데이트 NAS)가 단수 경로로 요청할 때 동일 처리
app.get('/meeting', async (c) => {
  return c.redirect('/api/safety-committee/meetings' + (c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : ''), 301)
})
app.get('/meeting/:id', async (c) => {
  // [BUG-182b] 단수 경로 하위호환 — /meetings/:id GET과 동일 로직 (try/catch fallback 포함)
  const rawDb  = getRawDb()
  const user   = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = Number(c.req.param('id'))
  let meeting: any
  try {
    meeting = rawDb.prepare(`
      SELECT m.*, u.name as created_by_name
      FROM safety_committee_meetings m
      LEFT JOIN users u ON u.id = m.created_by
      WHERE m.id = ?
    `).get(id)
  } catch(e: any) {
    console.error('[SC] GET /meeting/:id — meetings 조회 오류:', e.message)
    return c.json({ error: 'DB 오류: ' + e.message }, 500)
  }
  if (!meeting) return c.json({ error: '회의 없음' }, 404)
  let attendees: any[] = []
  try {
    attendees = rawDb.prepare(`
      SELECT a.*, u.name as user_name, u.position as user_position, u.department as user_department
      FROM safety_committee_attendees a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.meeting_id = ? ORDER BY a.id ASC
    `).all(id)
  } catch(e: any) {
    console.warn('[SC] GET /meeting/:id — attendees 조회 실패 (빈 배열):', e.message)
  }
  let agendas: any[] = []
  try {
    agendas = rawDb.prepare(`
      SELECT ag.*,
             COALESCE(u.name, ag.assignee_name, '') as assignee_name,
             (SELECT COUNT(*) FROM safety_committee_votes WHERE agenda_id = ag.id AND vote='agree')    as vote_agree,
             (SELECT COUNT(*) FROM safety_committee_votes WHERE agenda_id = ag.id AND vote='disagree') as vote_disagree,
             (SELECT COUNT(*) FROM safety_committee_votes WHERE agenda_id = ag.id AND vote='abstain')  as vote_abstain
      FROM safety_committee_agendas ag
      LEFT JOIN users u ON u.id = ag.assignee_id
      WHERE ag.meeting_id = ? ORDER BY COALESCE(ag.agenda_no, ag.seq, ag.id) ASC
    `).all(id)
  } catch(e: any) {
    console.warn('[SC] GET /meeting/:id — agendas 1차 실패, 단순 조회 시도:', e.message)
    try { agendas = rawDb.prepare(`SELECT ag.* FROM safety_committee_agendas ag WHERE ag.meeting_id = ? ORDER BY ag.id ASC`).all(id) } catch(e2: any) {
      console.warn('[SC] GET /meeting/:id — agendas 2차도 실패 (빈 배열):', e2.message)
    }
  }
  let photos: any[] = []
  try {
    photos = rawDb.prepare(`SELECT id, file_name, caption, created_at, mime_type FROM safety_committee_photos WHERE meeting_id = ? ORDER BY id ASC`).all(id)
  } catch(e: any) {
    console.warn('[SC] GET /meeting/:id — photos 실패 (빈 배열):', e.message)
    try { photos = rawDb.prepare(`SELECT id, file_name, created_at, mime_type FROM safety_committee_photos WHERE meeting_id = ? ORDER BY id ASC`).all(id) } catch(_) {}
  }
  let docs: any[] = []
  try {
    docs = rawDb.prepare(`
      SELECT id, file_name, file_size, mime_type, caption, uploader_id, u.name as uploader_name, created_at
      FROM safety_committee_docs sd LEFT JOIN users u ON u.id = sd.uploader_id
      WHERE sd.meeting_id = ? ORDER BY sd.id ASC
    `).all(id)
  } catch(e: any) {
    console.warn('[SC] GET /meeting/:id — docs 1차 실패 (빈 배열):', e.message)
    try { docs = rawDb.prepare(`SELECT id, file_name, file_size, mime_type, created_by as uploader_id, created_at FROM safety_committee_docs WHERE meeting_id = ? ORDER BY id ASC`).all(id) } catch(_) {}
  }
  return c.json({ meeting, attendees, agendas, photos, docs })
})
app.patch('/meeting/:id', async (c) => {
  // 단수 경로 호환 — /meetings/:id PATCH와 동일
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id   = Number(c.req.param('id'))
  const body: any = await c.req.json().catch(() => ({}))
  const fields: string[] = []
  const vals:   any[]    = []
  if (body.title     !== undefined) { fields.push('title=?');     vals.push(body.title) }
  if (body.held_date !== undefined) { fields.push('held_date=?'); vals.push(body.held_date) }
  if (body.location  !== undefined) { fields.push('location=?');  vals.push(body.location) }
  if (body.summary   !== undefined) { fields.push('summary=?');   vals.push(body.summary) }
  if (body.confirmed !== undefined) { fields.push('confirmed=?'); vals.push(body.confirmed ? 1 : 0) }
  if (body.legal_items !== undefined) { fields.push('legal_items=?'); vals.push(body.legal_items) }
  if (body.agendas   !== undefined) { fields.push('agendas=?');   vals.push(body.agendas) }
  if (fields.length === 0) return c.json({ error: '수정할 항목 없음' }, 400)
  vals.push(id)
  rawDb.prepare(`UPDATE safety_committee_meetings SET ${fields.join(',')} WHERE id=?`).run(...vals)
  return c.json({ success: true })
})
app.delete('/meeting/:id', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor') return c.json({ error: '권한 없음' }, 403)
  const id = Number(c.req.param('id'))
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
// [SC-서명] 자필패드 서명 방식 (위험성평가/TBM 동일 방식)
// → sign_data(base64 PNG) 수신 + signature_data + signed_at 저장
app.patch('/meetings/:id/attendees/:aid/sign', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const aid  = Number(c.req.param('aid'))
  const body = await c.req.json().catch(() => ({})) as any
  const signData: string = body.sign_data || ''

  let att: any
  try {
    att = rawDb.prepare(`SELECT * FROM safety_committee_attendees WHERE id=?`).get(aid)
  } catch(e: any) {
    console.error('[SC] PATCH /sign — attendees 조회 오류:', e.message)
    return c.json({ error: 'DB 조회 오류: ' + e.message }, 500)
  }
  if (!att) return c.json({ error: '참석자 없음' }, 404)

  // 본인 서명만 허용 (admin 예외)
  if (att.user_id && att.user_id !== user.id && user.role !== 'admin')
    return c.json({ error: '본인 서명만 가능합니다.' }, 403)

  // 누락 컬럼 보완 (구버전 DB 대응)
  try { rawDb.exec(`ALTER TABLE safety_committee_attendees ADD COLUMN signature_data TEXT NOT NULL DEFAULT ''`) } catch(_) {}
  try { rawDb.exec(`ALTER TABLE safety_committee_attendees ADD COLUMN signed_at TEXT`) } catch(_) {}

  // signature_data + signed_at 업데이트
  // 1차: signature_data + signed_at 동시 업데이트
  // 2차: signed_at 만 업데이트 (예외 대비)
  try {
    rawDb.prepare(`
      UPDATE safety_committee_attendees
      SET signature_data = ?, signed_at = datetime('now','localtime')
      WHERE id = ?
    `).run(signData, aid)
  } catch(e1: any) {
    console.warn('[SC] PATCH /sign 1차 실패:', e1.message)
    try {
      rawDb.prepare(`
        UPDATE safety_committee_attendees
        SET signed_at = datetime('now','localtime')
        WHERE id = ?
      `).run(aid)
    } catch(e2: any) {
      console.error('[SC] PATCH /sign 2차 실패:', e2.message)
      return c.json({ error: '서명 처리 실패: ' + e2.message }, 500)
    }
  }

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

  // 테이블 없으면 FK 없는 버전으로 생성
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS safety_committee_votes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        agenda_id  INTEGER NOT NULL,
        meeting_id INTEGER,
        user_id    INTEGER NOT NULL,
        vote       TEXT    NOT NULL DEFAULT 'agree',
        voted_at   TEXT,
        created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        UNIQUE(agenda_id, user_id)
      )
    `)
  } catch(_) {}

  // voted_at / meeting_id 컬럼 보장
  try { rawDb.exec(`ALTER TABLE safety_committee_votes ADD COLUMN voted_at TEXT`) } catch(_) {}
  try { rawDb.exec(`ALTER TABLE safety_committee_votes ADD COLUMN meeting_id INTEGER`) } catch(_) {}

  // UPSERT — FK OFF로 감싸서 구DB FK 제약 오류 방지
  try {
    rawDb.pragma('foreign_keys = OFF')
    rawDb.prepare(`
      INSERT INTO safety_committee_votes (agenda_id, meeting_id, user_id, vote, voted_at)
      VALUES (?, ?, ?, ?, datetime('now','localtime'))
      ON CONFLICT(agenda_id, user_id) DO UPDATE SET vote=excluded.vote, voted_at=datetime('now','localtime')
    `).run(agendaId, agenda.meeting_id, user.id, vote)
    rawDb.pragma('foreign_keys = ON')
  } catch(e: any) {
    try { rawDb.pragma('foreign_keys = ON') } catch(_) {}
    console.error('[SC/vote] INSERT 실패:', e.message)
    return c.json({ error: '투표 저장 실패: ' + e.message }, 500)
  }

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

  // [BUG-196c] caption null → '' 처리 (NOT NULL DEFAULT '' 제약 위반 방지)
  const caption = (formData.get('caption') as string) || ''
  const file    = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file 필드 필수' }, 400)

  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
  // [세션 110] 새 폴더 구조 적용
  const { dir: photoDir, relBase: photoRelBase } = getScMeetingUploadDir(meetingId, 'photos')
  const savedName = genFileName(file.name)
  const filePath  = join(photoDir, savedName)
  const buf = await file.arrayBuffer()
  writeFileSync(filePath, Buffer.from(buf))

  let info: any
  try {
    info = rawDb.prepare(`
      INSERT INTO safety_committee_photos (meeting_id, file_name, file_path, mime_type, caption)
      VALUES (?, ?, ?, ?, ?)
    `).run(meetingId, file.name, filePath, file.type || `image/${ext}`, caption)
  } catch(dbErr: any) {
    console.error('[SC photos] INSERT 오류:', dbErr.message)
    return c.json({ error: 'DB 저장 실패: ' + dbErr.message }, 500)
  }
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

  // [세션 110] 새 폴더 구조 적용
  const { dir: docsDir } = getScMeetingUploadDir(meetingId, 'docs')

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
    const filePath  = join(docsDir, savedName)
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

// ─── 운영 규칙 API ────────────────────────────────────────────────────────────

// GET /api/safety-committee/rules — 전체 규칙 조회 (key→value 객체 반환)
app.get('/rules', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const rows: any[] = rawDb.prepare(
    `SELECT rule_key, rule_value FROM safety_committee_rules ORDER BY id ASC`
  ).all()

  const result: Record<string, string> = {}
  for (const r of rows) result[r.rule_key] = r.rule_value
  return c.json(result)
})

// PUT /api/safety-committee/rules — 규칙 일괄 저장 (body: { rule_key: rule_value, ... })
app.put('/rules', async (c) => {
  const rawDb = getRawDb()
  const user  = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin' && user.role !== 'supervisor')
    return c.json({ error: '권한 없음' }, 403)

  const body = await c.req.json().catch(() => ({})) as Record<string, string>

  const upsert = rawDb.prepare(`
    INSERT INTO safety_committee_rules (rule_key, rule_value, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(rule_key) DO UPDATE SET
      rule_value = excluded.rule_value,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `)

  const tx = rawDb.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) upsert.run(k, v, user.id)
  })
  tx(Object.entries(body))

  return c.json({ ok: true })
})

export default app
