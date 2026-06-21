/**
 * nas-routes/push.ts — FCM 푸시 알림 API (NAS 전용)
 *
 * 포함 라우트:
 *   POST   /api/push/register   — FCM 토큰 등록
 *   DELETE /api/push/register   — FCM 토큰 삭제 (로그아웃)
 *   POST   /api/push/send       — 수동 푸시 발송 (관리자용)
 *   GET    /api/push/status     — 토큰 등록 현황 (관리자용)
 *   GET    /api/push/diagnose   — FCM 환경 진단 (관리자용)
 */

import { Hono } from 'hono'
import { getRawDb, getUser } from '../nas-db'
import { sendFcmPushMulti } from '../fcm'
// sendFcmToUsers는 push.ts 내 수동발송에서 직접 처리하므로 helper 불필요

const app = new Hono()

// POST /api/push/register — FCM 토큰 등록
app.post('/register', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const body = await c.req.json().catch(() => ({})) as any
  const { fcm_token } = body
  if (!fcm_token || typeof fcm_token !== 'string')
    return c.json({ error: 'fcm_token 필수' }, 400)

  const beforeCount = (rawDb.prepare(
    `SELECT COUNT(*) as cnt FROM users WHERE fcm_token IS NOT NULL AND fcm_token != ''`
  ).get() as any)?.cnt ?? 0
  const prevToken = (rawDb.prepare(`SELECT fcm_token FROM users WHERE id = ?`).get(user.id) as any)?.fcm_token

  rawDb.prepare(`UPDATE users SET fcm_token = ? WHERE id = ?`).run(fcm_token, user.id)

  const afterCount = (rawDb.prepare(
    `SELECT COUNT(*) as cnt FROM users WHERE fcm_token IS NOT NULL AND fcm_token != ''`
  ).get() as any)?.cnt ?? 0
  const isUpdate = !!prevToken
  console.log(`[FCM] 토큰 ${isUpdate ? '갱신' : '신규등록'} — user:${user.id}(${user.name}) token:${fcm_token.slice(0, 20)}... | DB 등록 기기: ${beforeCount} → ${afterCount}개`)

  return c.json({ success: true })
})

// DELETE /api/push/register — 로그아웃 시 FCM 토큰 삭제
app.delete('/register', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  rawDb.prepare(`UPDATE users SET fcm_token = NULL WHERE id = ?`).run(user.id)
  console.log(`[FCM] 토큰 삭제 — user:${user.id}(${user.name})`)
  return c.json({ success: true })
})

// POST /api/push/send — 관리자용 수동 푸시 발송
app.post('/send', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user || !['admin', 'supervisor'].includes(user.role))
    return c.json({ error: '관리자 권한 필요' }, 403)
  const body = await c.req.json().catch(() => ({})) as any
  const { title, body: msgBody, target, data } = body
  if (!title || !msgBody) return c.json({ error: 'title, body 필수' }, 400)

  const payload = {
    title: String(title),
    body:  String(msgBody),
    data:  data || { type: 'manual_push' }
  }

  const _pid = process.env.FCM_PROJECT_ID   || ''
  const _ce  = process.env.FCM_CLIENT_EMAIL || ''
  const _pk  = process.env.FCM_PRIVATE_KEY  || ''
  if (!_pid || !_ce || !_pk) {
    console.warn(`[FCM] ⚠️ 수동 발송 실패 — 환경변수 미설정`)
    return c.json({ error: 'FCM 환경변수가 설정되지 않았습니다.', sent: 0, failed: 0 }, 500)
  }

  let targetUsers: any[] = []
  const targetStr = String(target || 'all')

  if (targetStr === 'all') {
    targetUsers = rawDb.prepare(
      `SELECT id, name, role, fcm_token FROM users WHERE is_active=1 AND fcm_token IS NOT NULL AND fcm_token != '' ORDER BY id`
    ).all() as any[]
  } else if (targetStr.startsWith('role:')) {
    const role = targetStr.replace('role:', '')
    targetUsers = rawDb.prepare(
      `SELECT id, name, role, fcm_token FROM users WHERE role=? AND is_active=1 AND fcm_token IS NOT NULL AND fcm_token != '' ORDER BY id`
    ).all(role) as any[]
  } else if (targetStr.startsWith('user:')) {
    const uid = parseInt(targetStr.replace('user:', ''))
    const row: any = rawDb.prepare(
      `SELECT id, name, role, fcm_token FROM users WHERE id=? AND fcm_token IS NOT NULL AND fcm_token != ''`
    ).get(uid)
    if (row) targetUsers = [row]
  } else {
    return c.json({ error: 'target 형식 오류 (all | role:xxx | user:123)' }, 400)
  }

  if (targetUsers.length === 0)
    return c.json({ success: true, sent: 0, failed: 0, total: 0, message: '등록된 FCM 토큰 없음' })

  const tokens = targetUsers.map((u: any) => u.fcm_token)
  console.log(`[FCM] 수동 발송 시도 — by:${user.name} target:${targetStr} tokens:${tokens.length}개`)
  const result = await sendFcmPushMulti(tokens, payload)
  const { sent, failed } = result

  const userDetails = targetUsers.map((u: any, idx: number) => {
    const d = result.details[idx]
    return {
      id:            u.id,
      name:          u.name,
      role:          u.role,
      token_preview: u.fcm_token ? u.fcm_token.slice(0, 20) + '...' : null,
      success:       d?.success  ?? false,
      messageId:     d?.messageId,
      error:         d?.error,
    }
  })

  // 무효 토큰 자동 삭제
  for (let i = 0; i < result.details.length; i++) {
    const d = result.details[i]
    if (d.error?.includes('UNREGISTERED') || d.error?.includes('NotRegistered') ||
        d.error?.includes('registration-token-not-registered')) {
      const invalidToken = targetUsers[i]?.fcm_token
      if (invalidToken) {
        rawDb.prepare(`UPDATE users SET fcm_token = NULL WHERE fcm_token = ?`).run(invalidToken)
        console.log(`[FCM] 무효 토큰 자동 삭제 — user:${targetUsers[i]?.id}`)
      }
    }
  }

  // 발송 이력 notifications 저장
  for (const u of targetUsers) {
    try {
      rawDb.prepare(`
        INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
        VALUES (?, 'push_manual', ?, ?, 0, 'push', 0)
      `).run(u.id, title, msgBody)
    } catch (_) {}
  }

  console.log(`[FCM] 수동 발송 완료 — by:${user.name} target:${targetStr} sent:${sent} failed:${failed}`)
  return c.json({ success: true, sent, failed, total: tokens.length, details: userDetails })
})

// GET /api/push/status — FCM 토큰 등록 현황
app.get('/status', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user || !['admin', 'supervisor'].includes(user.role))
    return c.json({ error: '관리자 권한 필요' }, 403)
  const rows = rawDb.prepare(`
    SELECT id, name, role, position,
           CASE WHEN fcm_token IS NOT NULL AND fcm_token != '' THEN 1 ELSE 0 END as has_token,
           CASE WHEN fcm_token IS NOT NULL AND fcm_token != ''
                THEN substr(fcm_token, 1, 25) || '...'
                ELSE NULL END as token_preview
    FROM users WHERE is_active = 1 ORDER BY role, name
  `).all()
  const total   = (rows as any[]).length
  const withToken = (rows as any[]).filter((r: any) => r.has_token).length
  return c.json({ total, with_token: withToken, without_token: total - withToken, users: rows })
})

// GET /api/push/diagnose — FCM 환경 진단
app.get('/diagnose', async (c) => {
  const rawDb = getRawDb()
  const user = getUser(c)
  if (!user || !['admin', 'supervisor'].includes(user.role))
    return c.json({ error: '관리자 권한 필요' }, 403)

  const report: Record<string, any> = {}
  const projectId   = process.env.FCM_PROJECT_ID   || ''
  const clientEmail = process.env.FCM_CLIENT_EMAIL || ''
  const privateKey  = process.env.FCM_PRIVATE_KEY  || ''

  report.env = {
    FCM_PROJECT_ID:   projectId   ? `✅ 설정됨 (${projectId})` : '❌ 미설정',
    FCM_CLIENT_EMAIL: clientEmail ? `✅ 설정됨 (${clientEmail.slice(0, 30)}...)` : '❌ 미설정',
    FCM_PRIVATE_KEY:  privateKey  ? `✅ 설정됨 (길이: ${privateKey.length}자)` : '❌ 미설정',
    all_set: !!(projectId && clientEmail && privateKey),
  }

  if (!report.env.all_set) {
    report.diagnosis = '❌ FCM 환경변수 미설정'
    report.fix = [
      '1. Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성',
      '2. NAS에서: nano /volume1/safetynote/.env',
      '3. FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY 추가',
      '4. pm2 restart safetynote',
    ]
    return c.json(report)
  }

  try {
    const { sendFcmPush } = await import('../fcm')
    const dummyResult = await sendFcmPush('__diagnose_dummy_token__', {
      title: '진단 테스트', body: '이 메시지는 표시되지 않습니다.',
    })
    const err = dummyResult.error || ''
    const isFcmServerError =
      err.includes('UNREGISTERED') || err.includes('INVALID_ARGUMENT') ||
      err.includes('registration-token-not-registered') ||
      err.includes('not a valid FCM registration token') ||
      err.includes('InvalidRegistration') || err.includes('NotRegistered')
    if (isFcmServerError || dummyResult.success) {
      report.oauth2 = '✅ OAuth2 access_token 취득 성공 (FCM 서버 응답 확인됨)'
    } else if (err.includes('FCM 환경변수 미설정')) {
      report.oauth2 = '❌ FCM 환경변수 미설정'
    } else {
      report.oauth2 = `⚠️ OAuth2 또는 네트워크 오류: ${err}`
    }
  } catch (e: any) {
    report.oauth2 = `❌ import/실행 오류: ${e.message}`
  }

  const tokenRows = rawDb.prepare(
    `SELECT id, name, role, substr(fcm_token,1,25)||'...' as token_preview
     FROM users WHERE fcm_token IS NOT NULL AND fcm_token != '' AND is_active=1`
  ).all() as any[]
  report.registered_tokens = { count: tokenRows.length, users: tokenRows }

  const testToken = c.req.query('test_token')
  if (testToken) {
    try {
      const { sendFcmPush } = await import('../fcm')
      const result = await sendFcmPush(testToken, {
        title: '🔔 FCM 진단 테스트',
        body: `SafetyNOTE FCM 테스트 — ${new Date().toLocaleString('ko-KR')}`,
        data: { type: 'diagnose_test' },
      })
      report.test_send = result.success
        ? `✅ 발송 성공 (messageId: ${result.messageId})`
        : `❌ 발송 실패: ${result.error}`
    } catch (e: any) {
      report.test_send = `❌ 발송 오류: ${e.message}`
    }
  } else {
    report.test_send = '(생략) test_token 쿼리 파라미터로 실제 발송 테스트 가능'
    report.example = `GET /api/push/diagnose?test_token=YOUR_FCM_TOKEN`
  }

  report.diagnosis = report.oauth2?.startsWith('✅')
    ? '✅ FCM 환경 정상 — 발송 가능 상태'
    : '⚠️ FCM 발송 환경 문제 있음 — oauth2 항목 확인'

  console.log(`[FCM] 진단 실행 — by:${user.name} env:${report.env.all_set} tokens:${tokenRows.length}`)
  return c.json(report)
})

export default app
