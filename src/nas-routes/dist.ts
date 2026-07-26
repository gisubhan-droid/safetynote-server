/**
 * dist.ts — APK 배포 API
 *
 * 포함 라우트 (8개):
 *   GET  /api/dist/apk/version
 *   GET  /api/dist/apk/download
 *   POST /api/dist/apk/upload
 *   POST /api/dist/apk/webhook          ← APK 수신 후 슬레이브 자동 릴레이 포함
 *   GET  /api/dist/apk/relay/targets    ← 슬레이브 NAS 목록 조회 (관리자)
 *   POST /api/dist/apk/relay/targets    ← 슬레이브 NAS 등록 (관리자)
 *   DELETE /api/dist/apk/relay/targets/:id  ← 슬레이브 NAS 삭제 (관리자)
 *   PATCH  /api/dist/apk/relay/targets/:id  ← 슬레이브 NAS active 토글 (관리자)
 *
 * 의존:
 *   - getRawDb(), getUser(), getSetting(), setSysSettings(), applyUploadRootOverride(),
 *     getUploadRootNow(), getApkFilePath() from ../nas-db
 *
 * 릴레이 동작:
 *   - POST /apk/webhook 성공(APK 다운로드+DB저장) 직후 비동기 실행
 *   - apk_relay_targets 테이블에서 active=1 슬레이브 목록 조회
 *   - 각 슬레이브의 POST /api/dist/apk/webhook 에 동일 payload 전송
 *   - 슬레이브 응답과 무관하게 메인 응답에 영향 없음 (fire-and-forget)
 */

import { Hono } from 'hono'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getRawDb,
  getUser,
  getSetting,
  setSysSettings,
  applyUploadRootOverride,
  getUploadRootNow,
} from '../nas-db'

const app = new Hono()

// ─── 설정 재로드 헬퍼 ────────────────────────────────────────────────────────
async function reloadSysSettings(): Promise<void> {
  const rawDb = getRawDb()
  try {
    const rows = rawDb.prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[]
    const updated: Record<string, string> = {}
    for (const row of rows) updated[row.key] = row.value
    setSysSettings(updated)
    const envUploadRoot = process.env.UPLOAD_PATH
      ? process.env.UPLOAD_PATH.replace(/\/+$/, '')
      : join(process.cwd(), 'public', 'uploads')
    applyUploadRootOverride(envUploadRoot)
  } catch (e: any) {
    console.warn('[dist] system_settings 재로드 실패:', e.message)
  }
}

// ─── APK 파일 경로 헬퍼 (local) ────────────────────────────────────────────
function apkFilePath(): string {
  return join(getUploadRootNow(), 'apk', 'safetynote.apk')
}

// ─── sleep 헬퍼 ──────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// ─── 슬레이브 NAS 릴레이 헬퍼 (비동기, 실패해도 메인 응답 영향 없음) ────────
// 배치 전송: relay_batch_size 대씩 묶어 병렬 전송, 배치 간 relay_batch_delay_sec 초 대기
// system_settings 키:
//   relay_batch_size      — 배치당 NAS 수 (기본 3)
//   relay_batch_delay_sec — 배치 간 대기(초) (기본 10)
async function relayApkToSlaves(payload: {
  version: string
  apk_url: string
  release_note: string
  force_update: string
}): Promise<void> {
  const rawDb = getRawDb()
  const secret = process.env.DEPLOY_WEBHOOK_SECRET || ''
  if (!secret) {
    console.warn('[APK Relay] DEPLOY_WEBHOOK_SECRET 미설정 — 릴레이 스킵')
    return
  }

  let targets: { id: number; name: string; url: string }[] = []
  try {
    targets = rawDb
      .prepare(`SELECT id, name, url FROM apk_relay_targets WHERE active = 1 ORDER BY id ASC`)
      .all() as { id: number; name: string; url: string }[]
  } catch (e: any) {
    console.warn('[APK Relay] 슬레이브 목록 조회 실패:', e.message)
    return
  }

  if (targets.length === 0) {
    console.log('[APK Relay] 등록된 슬레이브 NAS 없음 — 릴레이 스킵')
    return
  }

  // 배치 설정값 읽기 (system_settings, 없으면 기본값)
  const batchSize  = Math.max(1, parseInt(getSetting('relay_batch_size')      || '3',  10))
  const batchDelay = Math.max(0, parseInt(getSetting('relay_batch_delay_sec') || '10', 10)) * 1000

  const totalBatches = Math.ceil(targets.length / batchSize)
  console.log(
    `[APK Relay] 슬레이브 ${targets.length}대 배치 릴레이 시작 — v${payload.version} ` +
    `| ${batchSize}대씩 ${totalBatches}배치, 배치 간 ${batchDelay / 1000}초 대기`
  )

  const relayPayload = JSON.stringify({
    secret:       secret,
    version:      payload.version,
    apk_url:      payload.apk_url,
    release_note: payload.release_note,
    force_update: payload.force_update,
  })

  // 단일 NAS 전송 헬퍼
  const sendOne = async (target: { id: number; name: string; url: string }) => {
    const endpoint = `${target.url.replace(/\/+$/, '')}/api/dist/apk/webhook`
    const startAt  = new Date().toISOString()
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'SafetyNOTE-Relay/1.0' },
        body:    relayPayload,
        signal:  AbortSignal.timeout(30_000), // 30초 타임아웃
      })
      const statusText = res.ok ? `OK(${res.status})` : `FAIL(${res.status})`
      console.log(`[APK Relay] ${target.name || target.url} → ${statusText}`)
      try {
        rawDb.prepare(
          `UPDATE apk_relay_targets SET last_relay_at = ?, last_relay_status = ? WHERE id = ?`
        ).run(startAt, statusText, target.id)
      } catch (_) { /* DB 업데이트 실패 무시 */ }
      return { id: target.id, ok: res.ok }
    } catch (err: any) {
      const errMsg = `ERROR: ${err.message}`
      console.error(`[APK Relay] ${target.name || target.url} → ${errMsg}`)
      try {
        rawDb.prepare(
          `UPDATE apk_relay_targets SET last_relay_at = ?, last_relay_status = ? WHERE id = ?`
        ).run(startAt, errMsg.slice(0, 100), target.id)
      } catch (_) { /* DB 업데이트 실패 무시 */ }
      return { id: target.id, ok: false }
    }
  }

  // 배치 단위 순차 전송 (배치 내부는 병렬)
  let totalOk = 0
  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batch = targets.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize)
    console.log(`[APK Relay] 배치 ${batchIdx + 1}/${totalBatches} — ${batch.length}대 전송 중...`)
    const results = await Promise.allSettled(batch.map(sendOne))
    totalOk += results.filter(r => r.status === 'fulfilled' && (r.value as any).ok).length
    // 마지막 배치가 아니면 대기
    if (batchIdx < totalBatches - 1 && batchDelay > 0) {
      console.log(`[APK Relay] 다음 배치까지 ${batchDelay / 1000}초 대기...`)
      await sleep(batchDelay)
    }
  }

  console.log(`[APK Relay] 전체 완료 — 성공 ${totalOk}대 / 실패 ${targets.length - totalOk}대`)
}

// ─── GET /apk/version ────────────────────────────────────────────────────────
// 앱의 checkApkVersion() 에서 호출 (인증 불필요)
app.get('/apk/version', (c) => {
  const version     = getSetting('apk_version')     || ''
  const apkUrl      = getSetting('apk_url')          || ''
  const releaseNote = getSetting('apk_release_note') || ''
  const forceUpdate = getSetting('apk_force_update') || '0'
  if (!version && !apkUrl) return c.json({ available: false, version: '' })
  return c.json({
    available:    true,
    version,
    apk_url:      apkUrl,
    release_note: releaseNote,
    force_update: forceUpdate === '1',
  })
})

// ─── GET /apk/download ───────────────────────────────────────────────────────
// resolveApkUrl(null) 기본값으로 참조됨 (인증 불필요)
app.get('/apk/download', (c) => {
  const apkUrl = getSetting('apk_url') || ''

  // 외부 URL → 리다이렉트
  if (apkUrl.startsWith('http://') || apkUrl.startsWith('https://')) {
    return c.redirect(apkUrl, 302)
  }

  let filePath: string
  if (!apkUrl || apkUrl === '/api/dist/apk/download' || apkUrl.startsWith('/api/')) {
    filePath = apkFilePath()
  } else if (apkUrl.startsWith('/')) {
    filePath = join(process.cwd(), 'public', apkUrl)
    if (!existsSync(filePath)) filePath = apkFilePath()
  } else {
    filePath = apkFilePath()
  }

  if (!existsSync(filePath)) {
    console.warn(`[APK Download] 파일 없음: ${filePath} (apk_url=${apkUrl})`)
    return c.json(
      { error: 'APK 파일이 서버에 없습니다. 관리자 설정에서 APK를 업로드하거나 URL을 입력하세요.' },
      404
    )
  }

  const stat       = statSync(filePath)
  const fileBuffer = readFileSync(filePath)
  const apkVersion = getSetting('apk_version') || ''
  const apkFilename = apkVersion ? `safetynote-v${apkVersion}.apk` : 'safetynote.apk'

  c.header('Content-Type', 'application/vnd.android.package-archive')
  c.header('Content-Disposition', `attachment; filename="${apkFilename}"`)
  c.header('Content-Length', String(stat.size))
  c.header('Cache-Control', 'no-cache')
  console.log(`[APK Download] 서빙: ${filePath} → ${apkFilename} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)
  return c.body(fileBuffer)
})

// ─── POST /apk/upload ────────────────────────────────────────────────────────
app.post('/apk/upload', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const formData = await c.req.formData()
  const file        = formData.get('apk') as File | null
  const version     = (formData.get('version')      as string || '').trim()
  const releaseNote = (formData.get('release_note') as string || '').trim()
  const forceUpdate = (formData.get('force_update') as string || '0')

  if (!file || typeof file === 'string') return c.json({ error: 'APK 파일이 없습니다. 필드명: apk' }, 400)
  if (!file.name.toLowerCase().endsWith('.apk')) return c.json({ error: '.apk 파일만 업로드 가능합니다.' }, 400)

  const rawDb  = getRawDb()
  const apkDir = join(getUploadRootNow(), 'apk')
  mkdirSync(apkDir, { recursive: true })
  const filePath = join(apkDir, 'safetynote.apk')
  writeFileSync(filePath, Buffer.from(await file.arrayBuffer()))

  const newUrl = '/api/dist/apk/download'
  rawDb.prepare(`UPDATE system_settings SET value = ? WHERE key = 'apk_url'`).run(newUrl)
  if (version) rawDb.prepare(`UPDATE system_settings SET value = ? WHERE key = 'apk_version'`).run(version)
  if (releaseNote !== '') rawDb.prepare(`UPDATE system_settings SET value = ? WHERE key = 'apk_release_note'`).run(releaseNote)
  rawDb.prepare(`UPDATE system_settings SET value = ? WHERE key = 'apk_force_update'`).run(forceUpdate === '1' ? '1' : '0')

  await reloadSysSettings()

  const stat = statSync(filePath)
  return c.json({
    success:   true,
    file_path: filePath,
    file_size: stat.size,
    apk_url:   newUrl,
    version:   version || getSetting('apk_version') || '',
  })
})

// ─── POST /apk/webhook ───────────────────────────────────────────────────────
// GitHub Actions에서 호출: secret 검증 → APK 다운로드 → DB저장 → 슬레이브 릴레이
app.post('/apk/webhook', async (c) => {
  const body = await c.req.json() as {
    secret?: string
    version?: string
    apk_url?: string
    release_note?: string
    force_update?: string
  }

  const expectedSecret = process.env.DEPLOY_WEBHOOK_SECRET || ''
  if (!expectedSecret) {
    console.error('[APK Webhook] DEPLOY_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.')
    return c.json({ error: 'Webhook이 비활성화되어 있습니다. 서버에 DEPLOY_WEBHOOK_SECRET을 설정하세요.' }, 503)
  }
  if (!body.secret || body.secret !== expectedSecret) {
    console.warn('[APK Webhook] Secret 불일치 — 요청 거부')
    return c.json({ error: '인증 실패' }, 401)
  }

  const version     = (body.version      || '').trim()
  const apkUrl      = (body.apk_url      || '').trim()
  const releaseNote = (body.release_note || '').trim()
  const forceUpdate = body.force_update === 'true' || body.force_update === '1' ? '1' : '0'

  if (!apkUrl)  return c.json({ error: 'apk_url 필드가 없습니다.' }, 400)
  if (!version) return c.json({ error: 'version 필드가 없습니다.' }, 400)

  console.log(`[APK Webhook] 요청 수신 — v${version} / ${apkUrl}`)

  const rawDb  = getRawDb()
  const apkDir  = join(getUploadRootNow(), 'apk')
  const apkPath = join(apkDir, 'safetynote.apk')
  mkdirSync(apkDir, { recursive: true })

  const upsertSync = (key: string, val: string) =>
    rawDb.prepare(
      `INSERT INTO system_settings(key,value) VALUES(?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`
    ).run(key, val)

  try {
    const res = await fetch(apkUrl, {
      headers: { 'User-Agent': 'SafetyNOTE-Server/1.0' },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`APK 다운로드 실패: HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    if (buf.byteLength < 1024 * 100) throw new Error(`APK 크기가 너무 작습니다: ${buf.byteLength} bytes`)
    writeFileSync(apkPath, Buffer.from(buf))
    const sizeMB = (buf.byteLength / 1024 / 1024).toFixed(1)
    console.log(`[APK Webhook] 다운로드 완료 — ${sizeMB} MB → ${apkPath}`)
  } catch (err: any) {
    console.error('[APK Webhook] 다운로드 오류:', err.message)
    // 다운로드 실패 → 외부 URL로 DB 저장 (fallback)
    upsertSync('apk_url',          apkUrl)
    upsertSync('apk_version',      version)
    upsertSync('apk_release_note', releaseNote)
    upsertSync('apk_force_update', forceUpdate)
    await reloadSysSettings()
    return c.json({
      success: true,
      warning: `APK 로컬 저장 실패 (${err.message}). 외부 URL로 대체 설정됨.`,
      apk_url: apkUrl,
      version,
    })
  }

  // 로컬 서빙으로 DB 업데이트
  const localUrl = '/api/dist/apk/download'
  upsertSync('apk_url',          localUrl)
  upsertSync('apk_version',      version)
  upsertSync('apk_release_note', releaseNote)
  upsertSync('apk_force_update', forceUpdate)

  await reloadSysSettings()

  const stat = statSync(apkPath)
  console.log(`[APK Webhook] DB 업데이트 완료 — v${version} / ${localUrl}`)

  // ─── 슬레이브 NAS 자동 릴레이 (비동기 fire-and-forget) ────────────────────
  // 메인 응답 반환 후 백그라운드에서 실행 — 슬레이브 실패가 메인 응답에 영향 없음
  relayApkToSlaves({
    version,
    apk_url:      localUrl,          // 슬레이브도 마스터 URL에서 받도록 외부 URL 대신 로컬 URL 사용
    release_note: releaseNote,
    force_update: forceUpdate,
  }).catch((e: any) => console.error('[APK Relay] 예기치 못한 오류:', e.message))
  // ─────────────────────────────────────────────────────────────────────────

  return c.json({
    success:   true,
    version,
    apk_url:   localUrl,
    file_size: stat.size,
    message:   `v${version} APK가 서버에 저장되었습니다. 로그인 화면에 다운로드 버튼이 표시됩니다.`,
  })
})

// ─── GET /apk/relay/targets ──────────────────────────────────────────────────
// 슬레이브 NAS 목록 조회 (관리자 전용)
app.get('/apk/relay/targets', (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const rawDb = getRawDb()
  try {
    const rows = rawDb
      .prepare(`SELECT id, name, url, active, last_relay_at, last_relay_status, created_at
                FROM apk_relay_targets ORDER BY id ASC`)
      .all()
    return c.json({ success: true, targets: rows })
  } catch (e: any) {
    console.error('[APK Relay] targets 조회 오류:', e.message)
    return c.json({ error: '슬레이브 목록 조회 실패', detail: e.message }, 500)
  }
})

// ─── POST /apk/relay/targets ─────────────────────────────────────────────────
// 슬레이브 NAS 등록 (관리자 전용)
// Body: { url: string, name?: string }
app.post('/apk/relay/targets', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const body = await c.req.json() as { url?: string; name?: string }
  const url  = (body.url  || '').trim()
  const name = (body.name || '').trim()

  if (!url) return c.json({ error: 'url 필드가 필요합니다.' }, 400)

  // URL 형식 기본 검증
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return c.json({ error: 'URL은 http:// 또는 https://로 시작해야 합니다.' }, 400)
  }

  const rawDb = getRawDb()
  try {
    const result = rawDb
      .prepare(`INSERT INTO apk_relay_targets (name, url, active) VALUES (?, ?, 1)`)
      .run(name, url)
    const inserted = rawDb
      .prepare(`SELECT id, name, url, active, last_relay_at, last_relay_status, created_at FROM apk_relay_targets WHERE id = ?`)
      .get(result.lastInsertRowid)
    console.log(`[APK Relay] 슬레이브 등록 — ${name || url} / ${url}`)
    return c.json({ success: true, target: inserted })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      return c.json({ error: '이미 등록된 URL입니다.' }, 409)
    }
    console.error('[APK Relay] 슬레이브 등록 오류:', e.message)
    return c.json({ error: '등록 실패', detail: e.message }, 500)
  }
})

// ─── DELETE /apk/relay/targets/:id ───────────────────────────────────────────
// 슬레이브 NAS 삭제 (관리자 전용)
app.delete('/apk/relay/targets/:id', (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const id = Number(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: '유효하지 않은 ID입니다.' }, 400)

  const rawDb = getRawDb()
  try {
    const result = rawDb.prepare(`DELETE FROM apk_relay_targets WHERE id = ?`).run(id)
    if (result.changes === 0) return c.json({ error: '해당 ID의 슬레이브가 없습니다.' }, 404)
    console.log(`[APK Relay] 슬레이브 삭제 — id=${id}`)
    return c.json({ success: true, deleted_id: id })
  } catch (e: any) {
    console.error('[APK Relay] 슬레이브 삭제 오류:', e.message)
    return c.json({ error: '삭제 실패', detail: e.message }, 500)
  }
})

// ─── PATCH /apk/relay/targets/:id ────────────────────────────────────────────
// 슬레이브 NAS active 토글 (관리자 전용)
// Body: { active: 0 | 1 }  또는 Body 없으면 현재값 반전
app.patch('/apk/relay/targets/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const id = Number(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: '유효하지 않은 ID입니다.' }, 400)

  const rawDb = getRawDb()
  const existing = rawDb
    .prepare(`SELECT id, active FROM apk_relay_targets WHERE id = ?`)
    .get(id) as { id: number; active: number } | undefined

  if (!existing) return c.json({ error: '해당 ID의 슬레이브가 없습니다.' }, 404)

  let body: { active?: number } = {}
  try { body = await c.req.json() } catch (_) { /* body 없는 경우 토글 */ }

  const newActive = (body.active !== undefined) ? (body.active ? 1 : 0) : (existing.active ? 0 : 1)

  try {
    rawDb.prepare(`UPDATE apk_relay_targets SET active = ? WHERE id = ?`).run(newActive, id)
    const updated = rawDb
      .prepare(`SELECT id, name, url, active, last_relay_at, last_relay_status, created_at FROM apk_relay_targets WHERE id = ?`)
      .get(id)
    console.log(`[APK Relay] 슬레이브 상태 변경 — id=${id} active=${newActive}`)
    return c.json({ success: true, target: updated })
  } catch (e: any) {
    console.error('[APK Relay] 슬레이브 토글 오류:', e.message)
    return c.json({ error: '상태 변경 실패', detail: e.message }, 500)
  }
})

// ─── GET /apk/relay/settings ─────────────────────────────────────────────────
// 배치 릴레이 설정 조회 (관리자 전용)
// 반환: { batch_size, batch_delay_sec }
app.get('/apk/relay/settings', (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  return c.json({
    success: true,
    batch_size:       parseInt(getSetting('relay_batch_size')      || '3',  10),
    batch_delay_sec:  parseInt(getSetting('relay_batch_delay_sec') || '10', 10),
  })
})

// ─── PATCH /apk/relay/settings ───────────────────────────────────────────────
// 배치 릴레이 설정 저장 (관리자 전용)
// Body: { batch_size?: number, batch_delay_sec?: number }
app.patch('/apk/relay/settings', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const body = await c.req.json() as { batch_size?: number; batch_delay_sec?: number }

  const batchSize  = Math.max(1, Math.min(50, parseInt(String(body.batch_size      ?? 3),  10)))
  const batchDelay = Math.max(0, Math.min(300, parseInt(String(body.batch_delay_sec ?? 10), 10)))

  const rawDb = getRawDb()
  const upsert = (key: string, val: string) =>
    rawDb.prepare(
      `INSERT INTO system_settings(key,value) VALUES(?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`
    ).run(key, val)

  try {
    upsert('relay_batch_size',      String(batchSize))
    upsert('relay_batch_delay_sec', String(batchDelay))
    await reloadSysSettings()
    console.log(`[APK Relay] 배치 설정 저장 — ${batchSize}대/${batchDelay}초`)
    return c.json({ success: true, batch_size: batchSize, batch_delay_sec: batchDelay })
  } catch (e: any) {
    console.error('[APK Relay] 배치 설정 저장 오류:', e.message)
    return c.json({ error: '설정 저장 실패', detail: e.message }, 500)
  }
})

export default app
