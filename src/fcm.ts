// ─── FCM (Firebase Cloud Messaging) 헬퍼 모듈 ───────────────────────────────
// NAS node-server.ts 전용 — FCM HTTP v1 API (OAuth2 Bearer)
// 외부 라이브러리 없이 Node.js 내장 https 모듈 사용 (NAS 환경 호환)
//
// [BUGFIX 참조]
// - RULE-002: node-server.ts에서 import 후 사용. var 선언 주의
// - NAS 환경: firebase-admin SDK는 glibc 이슈로 설치 불가 → 순수 HTTP 방식 사용
// ─────────────────────────────────────────────────────────────────────────────

import * as https from 'node:https'
import * as crypto from 'node:crypto'

// ─── FCM 서비스 계정 설정 ─────────────────────────────────────────────────────
// NAS .env 파일에 FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY 저장
// (줄바꿈 \n은 실제 개행으로 변환 필요)
// ─────────────────────────────────────────────────────────────────────────────

export interface FcmPayload {
  title: string
  body: string
  data?: Record<string, string>   // 앱에서 받을 추가 데이터 (string만 허용)
}

export interface FcmResult {
  success: boolean
  messageId?: string
  error?: string
}

// ─── JWT 생성 (RS256) ────────────────────────────────────────────────────────
// firebase-admin SDK 없이 순수 crypto로 OAuth2 access_token 취득
function base64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getAccessToken(projectId: string, clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64urlEncode(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }))

  const signingInput = `${header}.${payload}`

  // PEM 키 정리 (환경변수의 \\n → 실제 개행)
  const pem = privateKey.replace(/\\n/g, '\n')

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = base64urlEncode(sign.sign(pem))

  const jwt = `${signingInput}.${signature}`

  // Google OAuth2 토큰 교환
  return new Promise((resolve, reject) => {
    const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.access_token) resolve(json.access_token)
          else reject(new Error(`OAuth2 실패: ${data}`))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

// ─── FCM 단일 메시지 발송 ────────────────────────────────────────────────────
async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  payload: FcmPayload
): Promise<FcmResult> {
  const message = {
    message: {
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channel_id: 'safetynote_push',   // Android 앱의 알림 채널 ID
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
    },
  }

  const postData = JSON.stringify(message)

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'fcm.googleapis.com',
      path: `/v1/projects/${projectId}/messages:send`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (res.statusCode === 200 && json.name) {
            resolve({ success: true, messageId: json.name })
          } else {
            resolve({ success: false, error: json.error?.message || data })
          }
        } catch (e: any) {
          resolve({ success: false, error: e.message })
        }
      })
    })
    req.on('error', (e) => resolve({ success: false, error: e.message }))
    req.write(postData)
    req.end()
  })
}

// ─── access_token 캐시 (1시간 유효) ─────────────────────────────────────────
let _cachedToken = ''
let _tokenExpiry = 0

async function getCachedAccessToken(projectId: string, clientEmail: string, privateKey: string): Promise<string> {
  const now = Date.now()
  if (_cachedToken && now < _tokenExpiry - 60000) return _cachedToken  // 만료 1분 전 갱신
  _cachedToken = await getAccessToken(projectId, clientEmail, privateKey)
  _tokenExpiry = now + 3600 * 1000
  return _cachedToken
}

// ─── 공개 인터페이스 ─────────────────────────────────────────────────────────

/**
 * FCM 푸시 알림 발송 (단일 토큰)
 * @param fcmToken  대상 기기의 FCM 등록 토큰
 * @param payload   { title, body, data? }
 */
export async function sendFcmPush(fcmToken: string, payload: FcmPayload): Promise<FcmResult> {
  const projectId   = process.env.FCM_PROJECT_ID   || ''
  const clientEmail = process.env.FCM_CLIENT_EMAIL || ''
  const privateKey  = process.env.FCM_PRIVATE_KEY  || ''

  if (!projectId || !clientEmail || !privateKey) {
    return { success: false, error: 'FCM 환경변수 미설정 (FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY)' }
  }
  if (!fcmToken) {
    return { success: false, error: 'FCM 토큰 없음' }
  }

  try {
    const accessToken = await getCachedAccessToken(projectId, clientEmail, privateKey)
    return await sendFcmMessage(accessToken, projectId, fcmToken, payload)
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export interface FcmMultiResult {
  sent: number
  failed: number
  details: Array<{ token_preview: string; success: boolean; messageId?: string; error?: string }>
}

/**
 * FCM 푸시 알림 발송 (여러 토큰 — 순차 발송)
 * @param fcmTokens 대상 기기들의 FCM 토큰 배열
 * @param payload   { title, body, data? }
 */
export async function sendFcmPushMulti(fcmTokens: string[], payload: FcmPayload): Promise<FcmMultiResult> {
  const projectId   = process.env.FCM_PROJECT_ID   || ''
  const clientEmail = process.env.FCM_CLIENT_EMAIL || ''
  const privateKey  = process.env.FCM_PRIVATE_KEY  || ''

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[FCM] 환경변수 미설정 — 발송 생략')
    return { sent: 0, failed: fcmTokens.length, details: [] }
  }

  let sent = 0, failed = 0
  const details: FcmMultiResult['details'] = []
  try {
    const accessToken = await getCachedAccessToken(projectId, clientEmail, privateKey)
    for (const token of fcmTokens) {
      const preview = token ? token.slice(0, 20) + '...' : '(empty)'
      if (!token) {
        failed++
        details.push({ token_preview: preview, success: false, error: '빈 토큰' })
        continue
      }
      const result = await sendFcmMessage(accessToken, projectId, token, payload)
      if (result.success) {
        sent++
        details.push({ token_preview: preview, success: true, messageId: result.messageId })
      } else {
        failed++
        details.push({ token_preview: preview, success: false, error: result.error })
        console.warn(`[FCM] 발송 실패 (token: ${preview}):`, result.error)
      }
    }
  } catch (e: any) {
    console.error('[FCM] 전체 발송 오류:', e.message)
    failed += fcmTokens.length - sent
  }
  return { sent, failed, details }
}
