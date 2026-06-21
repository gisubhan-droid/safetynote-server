/**
 * dist.ts — APK 배포 API
 *
 * 포함 라우트 (4개):
 *   GET  /api/dist/apk/version
 *   GET  /api/dist/apk/download
 *   POST /api/dist/apk/upload
 *   POST /api/dist/apk/webhook
 *
 * 의존:
 *   - getRawDb(), getUser(), getSetting(), setSysSettings(), applyUploadRootOverride(),
 *     getUploadRootNow(), getApkFilePath() from ../nas-db
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

  return c.json({
    success:   true,
    version,
    apk_url:   localUrl,
    file_size: stat.size,
    message:   `v${version} APK가 서버에 저장되었습니다. 로그인 화면에 다운로드 버튼이 표시됩니다.`,
  })
})

export default app
