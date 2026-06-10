// ─── SSE 브로드캐스트 공유 모듈 ─────────────────────────────────────────────
// node-server.ts 의 sseClients Map을 참조하는 싱글턴 헬퍼
// 라우트 파일(tasks.ts, hazards.ts 등)에서 import해서 사용

interface SseClient {
  controller: ReadableStreamDefaultController
  userId: number
  userName: string
  role: string
  heartbeat?: ReturnType<typeof setInterval>
}

// 전역 싱글턴 Map (node-server.ts에서 동일 인스턴스 공유)
export const sseClients: Map<number, Set<SseClient>> = (() => {
  const g = globalThis as any
  if (!g.__sseClients) g.__sseClients = new Map<number, Set<SseClient>>()
  return g.__sseClients
})()

/** 특정 유저에게 SSE 이벤트 전송 */
export function sendToUser(userId: number, payload: object): void {
  const clients = sseClients.get(userId)
  if (!clients || clients.size === 0) return
  const data = `data: ${JSON.stringify(payload)}\n\n`
  const encoded = new TextEncoder().encode(data)
  for (const client of clients) {
    try { client.controller.enqueue(encoded) } catch (_) {}
  }
}

/** 전체 접속 사용자에게 SSE 이벤트 전송 */
export function broadcastAll(payload: object): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`
  const encoded = new TextEncoder().encode(data)
  for (const clients of sseClients.values()) {
    for (const client of clients) {
      try { client.controller.enqueue(encoded) } catch (_) {}
    }
  }
}

/** 특정 역할 사용자에게만 전송 */
export function broadcastToRoles(roles: string[], payload: object): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`
  const encoded = new TextEncoder().encode(data)
  for (const clients of sseClients.values()) {
    for (const client of clients) {
      if (roles.includes(client.role)) {
        try { client.controller.enqueue(encoded) } catch (_) {}
      }
    }
  }
}

/** 특정 userId 목록에게만 전송 */
export function sendToUsers(userIds: number[], payload: object): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`
  const encoded = new TextEncoder().encode(data)
  for (const uid of userIds) {
    const clients = sseClients.get(uid)
    if (!clients) continue
    for (const client of clients) {
      try { client.controller.enqueue(encoded) } catch (_) {}
    }
  }
}

/** 접속 중인 총 클라이언트 수 */
export function getConnectionCount(): number {
  let total = 0
  for (const clients of sseClients.values()) total += clients.size
  return total
}
