/**
 * nas-routes/push-helper.ts — FCM 공유 헬퍼 (sendFcmToUsers / sendFcmToRoles)
 *
 * node-server.ts의 인라인 함수를 이곳으로 이동.
 * signature-requests, tbm-extra 등 여러 라우트에서 공유.
 */

import { getRawDb } from '../nas-db'
import { sendFcmPushMulti } from '../fcm'

type FcmPayload = {
  title: string
  body: string
  data?: Record<string, string>
}

export async function sendFcmToUsers(userIds: number[], payload: FcmPayload): Promise<void> {
  if (!userIds || userIds.length === 0) return
  const rawDb = getRawDb()
  const _pid = process.env.FCM_PROJECT_ID   || ''
  const _ce  = process.env.FCM_CLIENT_EMAIL || ''
  const _pk  = process.env.FCM_PRIVATE_KEY  || ''
  if (!_pid || !_ce || !_pk) {
    console.warn(`[FCM] ⚠️ 환경변수 미설정 — 발송 생략 (target:${userIds})`)
    return
  }
  try {
    const placeholders = userIds.map(() => '?').join(',')
    const rows = rawDb.prepare(
      `SELECT id, name, fcm_token FROM users WHERE id IN (${placeholders}) AND fcm_token IS NOT NULL AND fcm_token != ''`
    ).all(...userIds) as any[]
    const tokens = rows.map((r: any) => r.fcm_token).filter(Boolean)
    if (tokens.length === 0) {
      console.warn(`[FCM] 등록된 토큰 없음 — target:${userIds}`)
      return
    }
    console.log(`[FCM] 발송 시도 — "${payload.title}" → target:${userIds} tokens:${tokens.length}개`)
    const result = await sendFcmPushMulti(tokens, payload)
    console.log(`[FCM] 발송 완료 — sent:${result.sent} failed:${result.failed} target:${userIds}`)
  } catch (e: any) {
    console.error('[FCM] sendFcmToUsers 오류:', e.message)
  }
}

export async function sendFcmToRoles(roles: string[], payload: FcmPayload): Promise<void> {
  if (!roles || roles.length === 0) return
  const rawDb = getRawDb()
  const _pid = process.env.FCM_PROJECT_ID   || ''
  const _ce  = process.env.FCM_CLIENT_EMAIL || ''
  const _pk  = process.env.FCM_PRIVATE_KEY  || ''
  if (!_pid || !_ce || !_pk) {
    console.warn(`[FCM] ⚠️ 환경변수 미설정 — roles(${roles}) 발송 생략`)
    return
  }
  try {
    const placeholders = roles.map(() => '?').join(',')
    const rows = rawDb.prepare(
      `SELECT fcm_token FROM users WHERE role IN (${placeholders}) AND is_active=1 AND fcm_token IS NOT NULL AND fcm_token != ''`
    ).all(...roles) as any[]
    const tokens = rows.map((r: any) => r.fcm_token).filter(Boolean)
    if (tokens.length === 0) {
      console.warn(`[FCM] roles(${roles}) 등록 토큰 없음`)
      return
    }
    console.log(`[FCM] roles(${roles}) 발송 시도 — "${payload.title}" tokens:${tokens.length}개`)
    const result = await sendFcmPushMulti(tokens, payload)
    console.log(`[FCM] roles(${roles}) 발송 완료 — sent:${result.sent} failed:${result.failed}`)
  } catch (e: any) {
    console.error('[FCM] sendFcmToRoles 오류:', e.message)
  }
}
