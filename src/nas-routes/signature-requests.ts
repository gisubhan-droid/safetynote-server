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
// 파라미터:
//   status  : pending | signed | rejected (기본: pending)
//   year    : 처리완료 연도 필터 (status=signed|rejected 시 적용, signed_at 기준)
//   month   : 처리완료 월 필터  (status=signed|rejected 시 적용, 1~12)
app.get('/', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const status = c.req.query('status') || 'pending'
  const year   = c.req.query('year')  || ''
  const month  = c.req.query('month') || ''

  // 처리완료(signed/rejected) 상태이고 year+month 가 모두 지정된 경우 날짜 필터 적용
  const isDone = status === 'signed' || status === 'rejected'
  let dateWhere = ''
  const dateParams: (string | number)[] = []

  if (isDone && year && month) {
    const mm = String(Number(month)).padStart(2, '0')
    const fromDate = `${year}-${mm}-01`
    // 다음 달 1일 미만으로 범위 계산
    const nextMonth = Number(month) === 12 ? 1 : Number(month) + 1
    const nextYear  = Number(month) === 12 ? Number(year) + 1 : Number(year)
    const toDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
    dateWhere = `AND date(sr.signed_at) >= ? AND date(sr.signed_at) < ?`
    dateParams.push(fromDate, toDate)
  }

  const rows = rawDb.prepare(`
    SELECT sr.*,
           ru.name as requester_name, ru.position as requester_position,
           tu.name as target_name
    FROM signature_requests sr
    LEFT JOIN users ru ON ru.id = sr.requester_id
    LEFT JOIN users tu ON tu.id = sr.target_user_id
    WHERE sr.target_user_id = ? AND sr.status = ?
    ${dateWhere}
    ORDER BY sr.${isDone ? 'signed_at' : 'created_at'} DESC
    LIMIT 200
  `).all(user.id, status, ...dateParams)
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
    INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  // [BUG-FIX] risk_assessment의 경우 이미 실제 서명(risk_assessment_signatures)한 사용자 목록 취득
  let actuallySignedUserIds = new Set<number>()
  if (ref_type === 'risk_assessment') {
    try {
      const rasSigned: any[] = rawDb.prepare(
        `SELECT DISTINCT user_id FROM risk_assessment_signatures WHERE assessment_id=?`
      ).all(Number(ref_id))
      rasSigned.forEach((r: any) => actuallySignedUserIds.add(Number(r.user_id)))
    } catch(_) { /* 테이블 없으면 무시 */ }
  }

  const newlyNotifiedUids: number[] = []
  const insert = rawDb.transaction(() => {
    let created = 0
    for (const uid of target_user_ids) {
      // [BUG-FIX] 이미 실제 서명한 사용자는 중복 요청 생성 완전 차단
      if (actuallySignedUserIds.has(Number(uid))) continue

      const existing: any = rawDb.prepare(
        `SELECT id FROM signature_requests WHERE ref_type=? AND ref_id=? AND ref_sub_type IS ? AND target_user_id=? AND status='pending'`
      ).get(ref_type, Number(ref_id), ref_sub_type || null, Number(uid))
      if (!existing) {
        stmt.run(ref_type, Number(ref_id), ref_sub_type || null, title, description || null, user.id, Number(uid), expires_at || null)
        newlyNotifiedUids.push(Number(uid))
        created++
      }
    }
    return created
  })
  const created = insert()

  // [BUG-FIX] 새로 생성된 요청(newlyNotifiedUids)에게만 SSE/FCM 발송 (기존 pending 중복 알림 방지)
  const notifyUids = newlyNotifiedUids.length > 0 ? newlyNotifiedUids : []
  for (const uid of notifyUids) {
    sendToUser(uid, {
      type: 'sign_request',
      title, description: description || '',
      requester: user.name, ref_type,
      message: `[서명 요청] ${user.name}님이 서명을 요청했습니다`,
      ts: Date.now()
    })
  }
  if (notifyUids.length > 0) {
    sendFcmToUsers(notifyUids, {
      title: `[서명 요청] ${title}`,
      body: `${user.name}님이 서명을 요청했습니다`,
      data: { type: 'sign_request', ref_type, ref_id: String(ref_id) }
    }).catch(() => {})
  }
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
  // [BUG-FIX] 중복 pending 레코드 일괄 처리:
  // 같은 ref_type + ref_id + target_user_id 조합으로 중복 발송된 pending 요청을 모두 signed로 갱신
  rawDb.prepare(`
    UPDATE signature_requests
    SET status='signed', sign_data=?, signed_at=CURRENT_TIMESTAMP
    WHERE ref_type=? AND ref_id=? AND target_user_id=? AND status='pending'
  `).run(signData, req.ref_type, req.ref_id, user.id)

  try {
    if (req.ref_type === 'tbm') {
      const signMethod = signData ? 'pad' : 'account'
      // ref_sub_type에 따라 role 결정:
      //   approval_safety  → 결재란(안전관리자)
      //   approval_general → 결재란(총괄책임/현장대리인)
      //   그 외(attendee)  → 참석자란
      const tbmRole = (req.ref_sub_type === 'approval_safety' || req.ref_sub_type === 'approval_general')
        ? req.ref_sub_type
        : 'attendee'

      if (tbmRole === 'approval_safety' || tbmRole === 'approval_general') {
        // 결재란 서명: approval-sign 엔드포인트와 동일하게 처리
        // 서명 순서 잠금 확인
        const existingApproval = rawDb.prepare(`
          SELECT role FROM tbm_signatures WHERE tbm_id = ? AND role IN ('approval_general','approval_safety')
        `).all(req.ref_id) as any[]
        const signedRoles = new Set(existingApproval.map((s: any) => s.role))

        if (tbmRole === 'approval_general' && !signedRoles.has('approval_safety')) {
          return c.json({ error: '안전관리자 서명 후 총괄책임 서명이 가능합니다.' }, 409)
        }
        if (signedRoles.has(tbmRole)) {
          // 이미 서명됨 — 중복 방지, 성공으로 처리
          console.warn(`[sig-req/sign] 이미 결재 서명됨: tbm=${req.ref_id} role=${tbmRole}`)
        } else {
          rawDb.prepare(`
            INSERT INTO tbm_signatures (tbm_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
          `).run(req.ref_id, user.id, user.name, user.position || '', tbmRole, signMethod, signData)

          // 다음 단계 알림 연쇄 (approval_safety 서명 완료 → 현장대리인 알림)
          if (tbmRole === 'approval_safety') {
            const tbmRow = rawDb.prepare(
              `SELECT tr.*, t.title as task_title FROM tbm_records tr LEFT JOIN tasks t ON t.id = tr.task_id WHERE tr.id = ?`
            ).get(req.ref_id) as any
            const tbmTitle = tbmRow ? `TBM: ${tbmRow.task_title || tbmRow.id}` : `TBM #${req.ref_id}`
            const generalUsers = rawDb.prepare(
              `SELECT id, name FROM users WHERE position = '현장대리인' AND is_active = 1`
            ).all() as any[]
            for (const gu of generalUsers) {
              const already = rawDb.prepare(
                `SELECT id FROM signature_requests WHERE ref_type='tbm' AND ref_id=? AND ref_sub_type='approval_general' AND target_user_id=? AND status='pending'`
              ).get(req.ref_id, gu.id)
              if (!already) {
                const info = rawDb.prepare(`
                  INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
                  VALUES ('tbm', ?, 'approval_general', ?, ?, ?, ?)
                `).run(req.ref_id, `[결재요청] ${tbmTitle}`, `안전관리자(${user.name}) 서명 완료. 총괄책임 결재를 요청합니다.`, user.id, gu.id)
                sendToUser(gu.id, {
                  type: 'sign_request', id: info.lastInsertRowid,
                  title: `[결재요청] ${tbmTitle}`,
                  requester: user.name, ref_type: 'tbm', ref_sub_type: 'approval_general',
                  message: `[TBM 결재] 안전관리자 서명 완료. 총괄책임 결재를 요청합니다.`,
                  ts: Date.now()
                })
                sendFcmToUsers([gu.id], {
                  title: `[결재요청] ${tbmTitle}`,
                  body: `안전관리자 서명 완료. 총괄책임 결재를 요청합니다.`,
                  data: { type: 'sign_request', ref_type: 'tbm', ref_id: String(req.ref_id) }
                }).catch(() => {})
                rawDb.prepare(`
                  INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
                  VALUES (?, 'sign_request', ?, ?, ?, 'tbm', 0)
                `).run(gu.id, `[결재요청] ${tbmTitle}`, `안전관리자 서명 완료. 총괄책임 결재를 요청합니다.`, req.ref_id)
              }
            }
          }
        }
      } else {
        // 일반 참석자 서명
        rawDb.prepare(`
          INSERT OR REPLACE INTO tbm_signatures (tbm_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
          VALUES (?, ?, ?, ?, 'attendee', CURRENT_TIMESTAMP, ?, ?)
        `).run(req.ref_id, user.id, user.name, user.position || '', signMethod, signData)
      }
    } else if (req.ref_type === 'risk_assessment') {
      const signMethod = signData ? 'pad' : 'account'
      rawDb.prepare(`
        INSERT OR REPLACE INTO risk_assessment_signatures (assessment_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
        VALUES (?, ?, ?, ?, 'member', CURRENT_TIMESTAMP, ?, ?)
      `).run(req.ref_id, user.id, user.name, user.position || '', signMethod, signData)

      // ── 모든 위원 서명 완료 시 자동 평가완료(completed) 전환 ──────────────
      try {
        const raRow: any = rawDb.prepare(`SELECT status FROM risk_assessments WHERE id=?`).get(req.ref_id)
        // measures_done 상태에서 서명 완료 → completed 자동 전환
        if (raRow && raRow.status === 'measures_done') {
          // 등록된 평가위원 수
          const memberCount: any = rawDb.prepare(
            `SELECT COUNT(*) as cnt FROM risk_assessment_members WHERE assessment_id=?`
          ).get(req.ref_id)
          // [BUG-FIX] 실제 서명된 위원 수: signature_requests(중복 가능) 대신
          // risk_assessment_signatures(실제 서명 테이블, DISTINCT user_id)로 카운팅
          const signedCount: any = rawDb.prepare(
            `SELECT COUNT(DISTINCT user_id) as cnt FROM risk_assessment_signatures WHERE assessment_id=?`
          ).get(req.ref_id)
          const totalMembers = memberCount?.cnt || 0
          const totalSigned  = signedCount?.cnt  || 0
          if (totalMembers > 0 && totalSigned >= totalMembers) {
            rawDb.prepare(`UPDATE risk_assessments SET status='completed' WHERE id=?`).run(req.ref_id)
          }
        }
      } catch(_autoComplete) { /* 자동완료 실패 시 무시 */ }
    } else if (req.ref_type === 'sc') {
      // 산업안전보건위원회 회의록 — attendee signature_data + signed_at 업데이트
      try { rawDb.exec(`ALTER TABLE safety_committee_attendees ADD COLUMN signature_data TEXT NOT NULL DEFAULT ''`) } catch(_) {}
      try { rawDb.exec(`ALTER TABLE safety_committee_attendees ADD COLUMN signed_at TEXT`) } catch(_) {}
      rawDb.prepare(`
        UPDATE safety_committee_attendees
        SET signature_data = ?, signed_at = datetime('now','localtime')
        WHERE meeting_id = ? AND user_id = ?
      `).run(signData || '', Number(req.ref_id), user.id)
    } else if (req.ref_type === 'sc_vote') {
      // 산업안전보건위원회 투표 요청 — sign_data 값이 vote(agree/disagree/abstain)
      // ref_sub_type = agenda_id (bulk 전송 시 ref_sub_type 필드에 안건 ID 저장)
      const voteValue = (body.vote || signData || '').trim()
      const agendaId  = Number(req.ref_sub_type || req.ref_id)
      const agenda: any = rawDb.prepare(`SELECT * FROM safety_committee_agendas WHERE id=?`).get(agendaId)
      if (!agenda) {
        return c.json({ error: '안건을 찾을 수 없습니다.' }, 404)
      }
      if (!['agree','disagree','abstain'].includes(voteValue)) {
        return c.json({ error: '유효하지 않은 투표값 (agree|disagree|abstain 중 하나)' }, 400)
      }
      // votes 테이블 보장 (FK 없는 버전)
      try {
        rawDb.exec(`
          CREATE TABLE IF NOT EXISTS safety_committee_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agenda_id INTEGER NOT NULL, meeting_id INTEGER,
            user_id INTEGER NOT NULL, vote TEXT NOT NULL DEFAULT 'agree',
            voted_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(agenda_id, user_id)
          )
        `)
      } catch(_) {}
      try { rawDb.exec(`ALTER TABLE safety_committee_votes ADD COLUMN voted_at TEXT`) } catch(_) {}
      try { rawDb.exec(`ALTER TABLE safety_committee_votes ADD COLUMN meeting_id INTEGER`) } catch(_) {}
      try {
        rawDb.pragma('foreign_keys = OFF')
        rawDb.prepare(`
          INSERT INTO safety_committee_votes (agenda_id, meeting_id, user_id, vote, voted_at)
          VALUES (?, ?, ?, ?, datetime('now','localtime'))
          ON CONFLICT(agenda_id, user_id) DO UPDATE SET vote=excluded.vote, voted_at=datetime('now','localtime')
        `).run(agendaId, agenda.meeting_id, user.id, voteValue)
        rawDb.pragma('foreign_keys = ON')
      } catch(ve: any) {
        try { rawDb.pragma('foreign_keys = ON') } catch(_) {}
        return c.json({ error: '투표 저장 실패: ' + ve.message }, 500)
      }
    } else if (req.ref_type === 'education') {
      rawDb.prepare(`
        UPDATE safety_education_attendees SET signature_data=? WHERE session_id=? AND user_id=?
      `).run(signData, req.ref_id, user.id)
    }
  } catch(e: any) { console.warn('[signature-request/sign] ref 반영 실패:', e.message) }

  broadcastToRoles(['admin','supervisor'], {
    type: `${req.ref_type === 'tbm' ? 'tbm' : req.ref_type === 'risk_assessment' ? 'risk' : (req.ref_type === 'sc' || req.ref_type === 'sc_vote') ? 'sc' : 'edu'}_sign`,
    signer: user.name, title: req.title,
    message: req.ref_type === 'sc_vote'
      ? `[투표완료] ${user.name}님이 "${req.title}"에 투표했습니다`
      : `[서명완료] ${user.name}님이 "${req.title}"에 서명했습니다`,
    ts: Date.now()
  })
  sendToUser(req.requester_id, {
    type: req.ref_type === 'sc_vote' ? 'vote_done' : 'sign_done',
    title: req.title, signer: user.name,
    message: req.ref_type === 'sc_vote'
      ? `[투표완료] ${user.name}님이 투표를 완료했습니다`
      : `[서명완료] ${user.name}님이 서명을 완료했습니다`,
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
