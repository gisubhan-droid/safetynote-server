/**
 * events.ts — SSE 실시간 알림 + PWA 리소스 라우트 (NAS 전용)
 *
 * 포함 라우트 (4개):
 *   GET /api/events          ← SSE 연결 엔드포인트
 *   GET /api/events/stats    ← SSE 연결 현황 (관리자)
 *   GET /manifest.json       ← PWA 매니페스트
 *   GET /service-worker.js   ← PWA 서비스 워커
 *
 * 의존:
 *   - getUser() from ../nas-db
 *   - sseClients, getConnectionCount from ../sse
 *   - readFileSync from node:fs
 *
 * ⚠️ node-server.ts에서 registerEventsRoutes(app) 로 직접 등록
 *    (경로 충돌 방지를 위해 app.route 미사용)
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getUser } from '../nas-db'
import { sseClients, getConnectionCount } from '../sse'

/**
 * events/manifest/service-worker 라우트를 serverApp에 직접 등록
 */
export function registerEventsRoutes(serverApp: any) {

  // ─── GET /api/events — SSE 연결 엔드포인트 ──────────────────────────────
  // EventSource는 커스텀 헤더 불가 → ?token= 쿼리스트링 fallback 허용
  serverApp.get('/api/events', (c: any) => {
    let user = getUser(c)
    if (!user) {
      const qToken = c.req.query('token')
      if (qToken) {
        try {
          const binary = Buffer.from(qToken, 'base64').toString('binary')
          const bytes  = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          user = JSON.parse(new TextDecoder().decode(bytes))
        } catch (_) {}
      }
    }
    if (!user) return c.json({ error: '인증 필요' }, 401)

    let clientEntry: any = null
    const userId = user.id

    const stream = new ReadableStream({
      start(controller) {
        clientEntry = { controller, userId, userName: user.name, role: user.role }
        if (!sseClients.has(userId)) sseClients.set(userId, new Set())
        sseClients.get(userId)!.add(clientEntry)

        // 연결 성공 이벤트
        const welcome = `data: ${JSON.stringify({
          type: 'connected',
          message: '실시간 알림 연결됨',
          userId,
          connections: getConnectionCount(),
          ts: Date.now()
        })}\n\n`
        controller.enqueue(new TextEncoder().encode(welcome))

        // 30초마다 heartbeat (연결 유지)
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`))
          } catch (_) {
            clearInterval(heartbeat)
          }
        }, 30000)
        clientEntry.heartbeat = heartbeat
      },
      cancel() {
        if (clientEntry) {
          clearInterval(clientEntry.heartbeat)
          sseClients.get(userId)?.delete(clientEntry)
          if (sseClients.get(userId)?.size === 0) sseClients.delete(userId)
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      }
    })
  })

  // ─── GET /api/events/stats — SSE 연결 현황 (관리자) ─────────────────────
  serverApp.get('/api/events/stats', (c: any) => {
    const user = getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '권한 없음' }, 403)
    const stats: any[] = []
    for (const [uid, clients] of sseClients.entries()) {
      for (const cl of clients) {
        stats.push({ userId: uid, userName: cl.userName, role: cl.role })
      }
    }
    return c.json({ total: stats.length, clients: stats })
  })

  // ─── GET /manifest.json — PWA 매니페스트 ────────────────────────────────
  serverApp.get('/manifest.json', (c: any) => {
    c.header('Content-Type', 'application/manifest+json')
    c.header('Cache-Control', 'public, max-age=86400')
    return c.body(readFileSync(join(process.cwd(), 'public/static/manifest.json'), 'utf-8'))
  })

  // ─── GET /service-worker.js — PWA 서비스 워커 ───────────────────────────
  serverApp.get('/service-worker.js', (c: any) => {
    c.header('Content-Type', 'application/javascript')
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    c.header('Service-Worker-Allowed', '/')
    return c.body(readFileSync(join(process.cwd(), 'public/static/service-worker.js'), 'utf-8'))
  })
}
