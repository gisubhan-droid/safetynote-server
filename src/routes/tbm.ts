import { Hono } from 'hono'
import { getUser } from '../utils'
import { sendToUser } from '../sse'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()


// TBM 목록
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { task_id, date_from, date_to, user_id } = c.req.query()
  const params: any[] = []
  const wheres: string[] = []
  if (task_id)  { wheres.push('tbm.task_id = ?');      params.push(task_id) }
  if (user_id)  { wheres.push('tbm.conductor_id = ?'); params.push(user_id) }
  // 날짜 필터: tbm_date → created_at 기준 (work_date는 tbm_records에 없음)
  if (date_from) { wheres.push(`date(COALESCE(tbm.tbm_date, tbm.created_at)) >= ?`); params.push(date_from) }
  if (date_to)   { wheres.push(`date(COALESCE(tbm.tbm_date, tbm.created_at)) <= ?`); params.push(date_to) }
  const where = wheres.length ? ' WHERE ' + wheres.join(' AND ') : ''
  const order = ' ORDER BY tbm.created_at DESC'

  let rows: any[] = []
  try {
    const q = `SELECT tbm.*, t.title as task_title, t.task_number, t.contractor_name,
                     t.status as task_status,
                     u.name as conductor_name, u.position as conductor_position
      FROM tbm_records tbm
      LEFT JOIN tasks t ON t.id = tbm.task_id
      LEFT JOIN users u ON u.id = tbm.conductor_id${where}${order}`
    const result = await c.env.DB.prepare(q).bind(...params).all<any>()
    rows = result.results || []
  } catch(_) {
    // contractor_name 없는 구버전 DB fallback
    const q = `SELECT tbm.*, t.title as task_title, t.task_number,
                     '' as contractor_name,
                     t.status as task_status,
                     u.name as conductor_name, u.position as conductor_position
      FROM tbm_records tbm
      LEFT JOIN tasks t ON t.id = tbm.task_id
      LEFT JOIN users u ON u.id = tbm.conductor_id${where}${order}`
    const result = await c.env.DB.prepare(q).bind(...params).all<any>()
    rows = result.results || []
  }
  return c.json(rows.map((r: any) => ({ ...r, attendees: r.attendees ? JSON.parse(r.attendees) : [] })))
})

// TBM 상세
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const tbm = await c.env.DB.prepare(
    `SELECT tbm.*, t.title as task_title, t.location, t.task_number, t.contractor_name,
            u.name as conductor_name, u.position as conductor_position
     FROM tbm_records tbm
     LEFT JOIN tasks t ON t.id = tbm.task_id
     LEFT JOIN users u ON u.id = tbm.conductor_id
     WHERE tbm.id = ?`
  ).bind(id).first<any>()
  if (!tbm) return c.json({ error: 'TBM 없음' }, 404)
  tbm.attendees = tbm.attendees ? JSON.parse(tbm.attendees) : []
  return c.json(tbm)
})

// TBM 생성
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const body = await c.req.json()
  const { task_id, location, weather, temperature, workers_count, attendees,
    safety_topics, precautions, special_notes, signature_data,
    gps_address, gps_lat, gps_lon } = body

  const result = await c.env.DB.prepare(
    `INSERT INTO tbm_records (task_id, conductor_id, location, weather, temperature, workers_count,
     attendees, safety_topics, precautions, special_notes, signature_data, status,
     gps_address, gps_lat, gps_lon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(task_id, user.id, location || '', weather || '', temperature || '',
    workers_count || 1, JSON.stringify(attendees || []),
    safety_topics || '', precautions || '', special_notes || '',
    signature_data || '', 'completed',
    gps_address || null, gps_lat || null, gps_lon || null
  ).run()

  // 작업 상태 업데이트: TBM 완료 → tbm_done (워크플로우: 체크리스트→TBM→작업진행)
  await c.env.DB.prepare("UPDATE tasks SET status='tbm_done', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(task_id).run()

  // ── TBM 완료 시 안전관리자에게 결재 서명 요청 알림 ─────────────────────────
  const tbmId = result.meta.last_row_id
  const taskRow = await c.env.DB.prepare(`SELECT title, task_number FROM tasks WHERE id = ?`).bind(task_id).first<any>()
  const tbmTitle = `TBM: ${taskRow?.title || task_id}`
  const safetyUsers = await c.env.DB.prepare(
    `SELECT id, name FROM users WHERE position = '안전관리자' AND is_active = 1`
  ).all<any>()
  for (const su of (safetyUsers.results || [])) {
    // signature_requests 에 중복 방지 후 삽입
    const alreadyReq = await c.env.DB.prepare(
      `SELECT id FROM signature_requests WHERE ref_type='tbm' AND ref_id=? AND ref_sub_type='approval_safety' AND target_user_id=? AND status='pending'`
    ).bind(tbmId, su.id).first()
    if (!alreadyReq) {
      const reqResult = await c.env.DB.prepare(`
        INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
        VALUES ('tbm', ?, 'approval_safety', ?, ?, ?, ?)
      `).bind(tbmId, `[결재요청] ${tbmTitle}`, `TBM이 완료되었습니다. 안전관리자 서명을 요청합니다.`, user.id, su.id).run()
      // SSE 실시간 알림
      sendToUser(su.id, {
        type: 'sign_request', id: reqResult.meta.last_row_id,
        title: `[TBM 결재요청] ${tbmTitle}`,
        requester: user.name, ref_type: 'tbm', ref_sub_type: 'approval_safety',
        message: `[TBM 완료] TBM이 등록되었습니다. 안전관리자 서명을 요청합니다.`,
        ts: Date.now()
      })
      // notifications 영구 저장
      await c.env.DB.prepare(`
        INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
        VALUES (?, 'sign_request', ?, ?, ?, 'tbm', 0)
      `).bind(su.id, `[TBM 결재요청] ${tbmTitle}`, `TBM이 등록되었습니다. 안전관리자 서명을 요청합니다.`, tbmId).run()
    }
  }

  // ── confirmed_address 갱신: GPS 주소 우선, 없으면 location 텍스트 사용 ────
  const tbmConfirmedAddr = gps_address || location || ''
  if (tbmConfirmedAddr) {
    const tbmConfirmedNow = (() => {
      const d = new Date(); const k = new Date(d.getTime() + 9*60*60*1000);
      return k.toISOString().replace('T',' ').slice(0,19);
    })();
    await c.env.DB.prepare(
      `UPDATE tasks SET confirmed_address=?, confirmed_address_source='tbm', confirmed_address_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(tbmConfirmedAddr, tbmConfirmedNow, task_id).run();
  }

  // ── 작업 시작 주소 / 시작 일시 자동 기입 ──────────────────────────────────
  // TBM GPS 주소가 있고, tasks.work_start_address 가 아직 비어 있으면 기입
  // (체크리스트에서 이미 기입된 경우 덮어쓰지 않음)
  const tbmNow = new Date()
  const tbmKst = new Date(tbmNow.getTime() + 9 * 60 * 60 * 1000)
  const tbmTs = tbmKst.toISOString().replace('T', ' ').slice(0, 19)

  if (gps_address) {
    const taskRowAddr = await c.env.DB.prepare(
      `SELECT work_start_address FROM tasks WHERE id = ?`
    ).bind(task_id).first() as any

    if (!taskRowAddr?.work_start_address) {
      await c.env.DB.prepare(
        `UPDATE tasks SET work_start_address = ?, work_start_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(gps_address, tbmTs, task_id).run()
    }
  }

  // ── TBM 완료 시 admin/supervisor에게 알림 ─────────────────────────────────
  try {
    const taskNum    = taskRow?.task_number ? `[${taskRow.task_number}] ` : ''
    const notifTitle = `TBM 완료: ${taskNum}${taskRow?.title || task_id}`
    const notifMsg   = `${user.name}님이 TBM을 완료했습니다.${taskRow?.task_number ? ` (${taskRow.task_number})` : ''}`
    const adminUsers = await c.env.DB.prepare(
      `SELECT id FROM users WHERE role IN ('admin','supervisor') AND is_active=1`
    ).all<any>()
    if (adminUsers.results?.length > 0) {
      const insertStmt = c.env.DB.prepare(
        `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
         VALUES (?, 'tbm_completed', ?, ?, ?, 'tbm', 0)`
      )
      await c.env.DB.batch(
        adminUsers.results
          .filter((u: any) => u.id !== user.id)
          .map((u: any) => insertStmt.bind(u.id, notifTitle, notifMsg, Number(tbmId)))
      )
      // SSE 실시간 푸시
      for (const u of adminUsers.results.filter((u: any) => u.id !== user.id)) {
        sendToUser(u.id, {
          type: 'tbm_completed',
          title: notifTitle,
          message: notifMsg,
          ref_id: Number(tbmId),
          ref_type: 'tbm',
          ts: Date.now()
        })
      }
    }
  } catch(_) {}

  return c.json({ success: true, id: result.meta.last_row_id })
})

// ──────────────────────────────────────────────────────────────────────────────
// TBM 서명 라우트
// ──────────────────────────────────────────────────────────────────────────────

// GET /:id/signatures — 서명 목록 조회
app.get('/:id/signatures', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const id = c.req.param('id')
    const result = await c.env.DB.prepare(
      `SELECT ts.*, u.name as user_name_from_users, u.position
       FROM tbm_signatures ts
       LEFT JOIN users u ON u.id = ts.user_id
       WHERE ts.tbm_id = ?
       ORDER BY ts.signed_at ASC`
    ).bind(id).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    return c.json({ error: e.message || '서명 목록 조회 실패' }, 500)
  }
})

// POST /:id/signatures — 서명 등록 (본인 계정 또는 이름 기반 현장 순차 서명)
app.post('/:id/signatures', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({})) as any
    const role       = body.role || 'attendee'
    const signData   = body.sign_data   || null
    const signMethod = signData ? 'pad' : 'account'
    const isNamedSign = !!(body.signer_name && String(body.signer_name).trim())
    const signerName  = isNamedSign ? String(body.signer_name).trim() : user.name

    if (isNamedSign) {
      // 이름 기반 서명 (현장 순차 서명): user_id=NULL, user_name=signerName
      // 동일 tbm_id + user_name + user_id IS NULL 이면 기존 서명 업데이트
      const existing = await c.env.DB.prepare(
        `SELECT id FROM tbm_signatures WHERE tbm_id=? AND user_name=? AND user_id IS NULL`
      ).bind(id, signerName).first<any>()
      if (existing) {
        await c.env.DB.prepare(
          `UPDATE tbm_signatures SET sign_data=?, sign_method=?, role=?, signed_at=CURRENT_TIMESTAMP WHERE id=?`
        ).bind(signData, signMethod, role, existing.id).run()
        return c.json({ success: true, id: existing.id })
      } else {
        const info = await c.env.DB.prepare(
          `INSERT INTO tbm_signatures (tbm_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
           VALUES (?, NULL, ?, '', ?, CURRENT_TIMESTAMP, ?, ?)`
        ).bind(id, signerName, role, signMethod, signData).run()
        return c.json({ success: true, id: info.meta.last_row_id })
      }
    } else {
      // 계정 기반 서명: (tbm_id, user_id) UNIQUE 기준으로 upsert
      const existing = await c.env.DB.prepare(
        `SELECT id FROM tbm_signatures WHERE tbm_id=? AND user_id=?`
      ).bind(id, user.id).first<any>()
      if (existing) {
        await c.env.DB.prepare(
          `UPDATE tbm_signatures SET sign_data=?, sign_method=?, role=?, signed_at=CURRENT_TIMESTAMP WHERE id=?`
        ).bind(signData, signMethod, role, existing.id).run()
        return c.json({ success: true, id: existing.id })
      } else {
        const info = await c.env.DB.prepare(
          `INSERT INTO tbm_signatures (tbm_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`
        ).bind(id, user.id, user.name, user.position || '', role, signMethod, signData).run()
        return c.json({ success: true, id: info.meta.last_row_id })
      }
    }
  } catch (e: any) {
    return c.json({ error: e.message || '서명 등록 실패' }, 500)
  }
})

// DELETE /:id/signatures/:sigId — 서명 취소 (본인 또는 admin)
app.delete('/:id/signatures/:sigId', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const { id, sigId } = c.req.param()
    const sig = await c.env.DB.prepare(
      'SELECT * FROM tbm_signatures WHERE id=? AND tbm_id=?'
    ).bind(sigId, id).first<any>()
    if (!sig) return c.json({ error: '서명을 찾을 수 없습니다.' }, 404)
    if (sig.user_id !== user.id && user.role !== 'admin')
      return c.json({ error: '본인 서명만 삭제할 수 있습니다.' }, 403)
    await c.env.DB.prepare('DELETE FROM tbm_signatures WHERE id=?').bind(sigId).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || '서명 삭제 실패' }, 500)
  }
})

// ──────────────────────────────────────────────────────────────────────────────
// TBM 결재 서명 라우트
// 서명 순서: 안전관리자(approval_safety) → 총괄책임(approval_general) → 대표이사(approval_ceo)
// ──────────────────────────────────────────────────────────────────────────────

// GET /:id/approval-status — 결재 서명 현황 조회
app.get('/:id/approval-status', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const id = c.req.param('id')
    const result = await c.env.DB.prepare(`
      SELECT ts.*, u.name as user_display_name
      FROM tbm_signatures ts
      LEFT JOIN users u ON u.id = ts.user_id
      WHERE ts.tbm_id = ? AND ts.role IN ('approval_general','approval_ceo','approval_safety')
      ORDER BY ts.signed_at ASC
    `).bind(id).all<any>()
    const sigs = result.results || []
    return c.json({
      approval_general: sigs.find((s: any) => s.role === 'approval_general') || null,
      approval_ceo:     sigs.find((s: any) => s.role === 'approval_ceo')     || null,
      approval_safety:  sigs.find((s: any) => s.role === 'approval_safety')  || null,
    })
  } catch (e: any) {
    return c.json({ error: e.message || '결재 현황 조회 실패' }, 500)
  }
})

// POST /:id/approval-sign — 결재 서명 처리 + 다음 단계 알림 연쇄
app.post('/:id/approval-sign', async (c) => {
  try {
    const user = getUser(c)
    if (!user) return c.json({ error: '인증 필요' }, 401)
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({})) as any
    const { approval_role, sign_data } = body

    const validRoles = ['approval_general', 'approval_ceo', 'approval_safety']
    if (!validRoles.includes(approval_role))
      return c.json({ error: '유효하지 않은 결재 역할' }, 400)

    const tbm = await c.env.DB.prepare(`
      SELECT tr.*, t.title as task_title
      FROM tbm_records tr LEFT JOIN tasks t ON t.id = tr.task_id
      WHERE tr.id = ?
    `).bind(id).first<any>()
    if (!tbm) return c.json({ error: 'TBM을 찾을 수 없습니다.' }, 404)

    // 서명 순서 검증: 안전관리자 → 총괄책임 → 대표이사
    const existingResult = await c.env.DB.prepare(`
      SELECT role FROM tbm_signatures
      WHERE tbm_id = ? AND role IN ('approval_general','approval_ceo','approval_safety')
    `).bind(id).all<any>()
    const signedRoles = new Set((existingResult.results || []).map((s: any) => s.role))

    if (approval_role === 'approval_general' && !signedRoles.has('approval_safety'))
      return c.json({ error: '안전관리자 서명 후 총괄책임 서명이 가능합니다.' }, 409)
    if (approval_role === 'approval_ceo' && !signedRoles.has('approval_general'))
      return c.json({ error: '총괄책임 서명 후 대표이사 서명이 가능합니다.' }, 409)
    if (signedRoles.has(approval_role))
      return c.json({ error: '이미 서명된 결재란입니다.' }, 409)

    // 서명 저장
    const signMethod = sign_data ? 'pad' : 'account'
    await c.env.DB.prepare(`
      INSERT INTO tbm_signatures (tbm_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).bind(id, user.id, user.name, user.position || '', approval_role, signMethod, sign_data || null).run()

    const tbmTitle = `TBM: ${tbm.task_title || id}`

    // ── 다음 단계 알림 연쇄 ────────────────────────────────────────────────────
    try {
      if (approval_role === 'approval_safety') {
        // 안전관리자 서명 완료 → 총괄책임(현장대리인)에게 서명 요청
        const generalUsers = await c.env.DB.prepare(
          `SELECT id, name FROM users WHERE position = '현장대리인' AND is_active = 1`
        ).all<any>()
        for (const gu of (generalUsers.results || [])) {
          const already = await c.env.DB.prepare(
            `SELECT id FROM signature_requests WHERE ref_type='tbm' AND ref_id=? AND ref_sub_type='approval_general' AND target_user_id=? AND status='pending'`
          ).bind(id, gu.id).first()
          if (!already) {
            const info = await c.env.DB.prepare(`
              INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
              VALUES ('tbm', ?, 'approval_general', ?, ?, ?, ?)
            `).bind(id, `[결재요청] ${tbmTitle}`, `안전관리자(${user.name}) 서명 완료. 총괄책임 결재를 요청합니다.`, user.id, gu.id).run()
            sendToUser(gu.id, {
              type: 'sign_request', id: info.meta.last_row_id,
              title: `[결재요청] ${tbmTitle}`,
              requester: user.name, ref_type: 'tbm', ref_sub_type: 'approval_general',
              message: `[TBM 결재] 안전관리자 서명 완료. 총괄책임 결재를 요청합니다.`,
              ts: Date.now()
            })
            try {
              await c.env.DB.prepare(`
                INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
                VALUES (?, 'sign_request', ?, ?, ?, 'tbm', 0)
              `).bind(gu.id, `[결재요청] ${tbmTitle}`, `안전관리자 서명 완료. 총괄책임 결재를 요청합니다.`, Number(id)).run()
            } catch (_) {}
          }
        }
      } else if (approval_role === 'approval_general') {
        // 총괄책임 서명 완료 → 대표이사에게 서명 요청
        const ceoUsers = await c.env.DB.prepare(
          `SELECT id, name FROM users WHERE position = '대표이사' AND is_active = 1`
        ).all<any>()
        for (const ceo of (ceoUsers.results || [])) {
          const already = await c.env.DB.prepare(
            `SELECT id FROM signature_requests WHERE ref_type='tbm' AND ref_id=? AND ref_sub_type='approval_ceo' AND target_user_id=? AND status='pending'`
          ).bind(id, ceo.id).first()
          if (!already) {
            const info = await c.env.DB.prepare(`
              INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
              VALUES ('tbm', ?, 'approval_ceo', ?, ?, ?, ?)
            `).bind(id, `[결재요청] ${tbmTitle}`, `총괄책임(${user.name}) 서명 완료. 대표이사 결재를 요청합니다.`, user.id, ceo.id).run()
            sendToUser(ceo.id, {
              type: 'sign_request', id: info.meta.last_row_id,
              title: `[결재요청] ${tbmTitle}`,
              requester: user.name, ref_type: 'tbm', ref_sub_type: 'approval_ceo',
              message: `[TBM 결재] 총괄책임 서명 완료. 대표이사 결재를 요청합니다.`,
              ts: Date.now()
            })
            try {
              await c.env.DB.prepare(`
                INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
                VALUES (?, 'sign_request', ?, ?, ?, 'tbm', 0)
              `).bind(ceo.id, `[결재요청] ${tbmTitle}`, `총괄책임 서명 완료. 대표이사 결재를 요청합니다.`, Number(id)).run()
            } catch (_) {}
          }
        }
      } else if (approval_role === 'approval_ceo') {
        // 대표이사 서명 완료 → 안전관리자에게 최종 완료 알림
        const safetyUsers = await c.env.DB.prepare(
          `SELECT id, name FROM users WHERE position = '안전관리자' AND is_active = 1`
        ).all<any>()
        for (const su of (safetyUsers.results || [])) {
          sendToUser(su.id, {
            type: 'tbm_approval_done',
            title: `[TBM 결재완료] ${tbmTitle}`,
            message: `[TBM 결재] 대표이사(${user.name}) 서명 완료. TBM 결재가 모두 완료되었습니다.`,
            tbmId: Number(id),
            ts: Date.now()
          })
          try {
            await c.env.DB.prepare(`
              INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
              VALUES (?, 'tbm_approval_done', ?, ?, ?, 'tbm', 0)
            `).bind(su.id, `[TBM 결재완료] ${tbmTitle}`, `대표이사 서명 완료. TBM 결재가 모두 완료되었습니다.`, Number(id)).run()
          } catch (_) {}
        }
      }
    } catch (_) {}

    return c.json({ success: true, approval_role, signer: user.name })
  } catch (e: any) {
    return c.json({ error: e.message || '결재 서명 처리 실패' }, 500)
  }
})

export default app
