/**
 * admin.ts — NAS 관리자 전용 라우트
 *
 * 포함 라우트 (9개):
 *   GET  /api/admin/settings
 *   PATCH /api/admin/settings
 *   GET  /api/app-version
 *   GET  /api/admin/folders
 *   GET  /api/admin/reset/counts
 *   POST /api/admin/reset
 *   GET  /api/admin/update/status
 *   POST /api/admin/update/check
 *   POST /api/admin/update/apply
 *   POST /api/admin/update/webhook  ← FEAT-036: GitHub Actions 자동 업데이트 (DEPLOY_WEBHOOK_SECRET 인증)
 *   GET  /qr/:userId  ← node-server.ts에서 별도 마운트
 *
 * 의존:
 *   - getRawDb(), getUser(), getSetting(), setSysSettings(), getUploadRootNow() from ../nas-db
 *   - spawn from node:child_process
 */

import { Hono } from 'hono'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  getRawDb,
  getUser,
  getSetting,
  setSysSettings,
  getSysSettings,
  applyUploadRootOverride,
  getUploadRootNow,
} from '../nas-db'

const app = new Hono()

// ─── loadSystemSettings 로컬 재구현 ─────────────────────────────────────────
// node-server.ts의 loadSystemSettings(DB) 와 동일한 역할
// admin/settings PATCH 또는 dist/apk/upload 후 캐시 갱신에 사용
async function reloadSysSettings(): Promise<void> {
  const rawDb = getRawDb()
  try {
    const rows = rawDb.prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[]
    const updated: Record<string, string> = {}
    for (const row of rows) updated[row.key] = row.value
    setSysSettings(updated)
    // upload_root_path 변경 시 global override 갱신
    const envUploadRoot = process.env.UPLOAD_PATH
      ? process.env.UPLOAD_PATH.replace(/\/+$/, '')
      : join(process.cwd(), 'public', 'uploads')
    applyUploadRootOverride(envUploadRoot)
  } catch (e: any) {
    console.warn('[admin] system_settings 재로드 실패:', e.message)
  }
}

// ─── GET /api/admin/settings ────────────────────────────────────────────────
app.get('/settings', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const rawDb = getRawDb()
  const rows = rawDb.prepare(
    'SELECT key, value, label, description, updated_at FROM system_settings'
  ).all()
  const effectiveUploadRoot = getUploadRootNow()
  return c.json({ settings: rows, effectiveUploadRoot })
})

// ─── PATCH /api/admin/settings ──────────────────────────────────────────────
app.patch('/settings', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const rawDb = getRawDb()
  const body = await c.req.json() as Record<string, string>
  const now = new Date().toISOString()
  const stmt = rawDb.prepare(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  )
  for (const [key, value] of Object.entries(body)) {
    stmt.run(key, String(value), now)
  }
  // 설정 재로드 (캐시 갱신)
  await reloadSysSettings()
  return c.json({ success: true, effectiveUploadRoot: getUploadRootNow() })
})

// ─── GET /api/admin/folders ──────────────────────────────────────────────────
app.get('/folders', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const root = getUploadRootNow()

  const IMG_EXT = new Set(['jpg','jpeg','png','gif','webp','heic','bmp','tiff','svg'])
  const DOC_EXT = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','hwp','hwpx','txt','csv'])
  const VID_EXT = new Set(['mp4','avi','mov','mkv','wmv','flv'])

  let totalBytes = 0
  let imgCount   = 0
  let docCount   = 0
  let vidCount   = 0
  let etcCount   = 0

  function scanDir(dirPath: string) {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const fullPath = join(dirPath, e.name)
        if (e.isDirectory()) {
          scanDir(fullPath)
        } else {
          try {
            const st = statSync(fullPath)
            totalBytes += st.size
            const ext = e.name.split('.').pop()?.toLowerCase() || ''
            if (IMG_EXT.has(ext))      imgCount++
            else if (DOC_EXT.has(ext)) docCount++
            else if (VID_EXT.has(ext)) vidCount++
            else                        etcCount++
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  try {
    if (!existsSync(root)) {
      return c.json({ root, totalBytes: 0, imgCount: 0, docCount: 0, vidCount: 0, etcCount: 0 })
    }
    scanDir(root)
  } catch (e) {
    return c.json({ error: '폴더 읽기 실패', detail: String(e) }, 500)
  }

  return c.json({ root, totalBytes, imgCount, docCount, vidCount, etcCount })
})

// ─── GET /api/admin/reset/counts ────────────────────────────────────────────
app.get('/reset/counts', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const rawDb = getRawDb()
  const count = (table: string) => {
    try { return (rawDb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as any)?.n ?? 0 }
    catch { return 0 }
  }
  return c.json({
    constructions : count('constructions'),
    tasks         : count('tasks'),
    work_reports  : count('work_reports'),
    splice_reports: count('splice_reports'),
    inspections   : count('inspections'),
    tbm           : count('tbm_sessions'),
    education     : count('safety_education_sessions'),
    risk          : count('risk_assessments'),
    users         : count('users'),
  })
})

// ─── POST /api/admin/reset ───────────────────────────────────────────────────
app.post('/reset', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const rawDb = getRawDb()

  const body = await c.req.json() as any
  const { targets, confirm_password } = body

  // 비밀번호 재확인
  const userRow = rawDb.prepare(`SELECT password_hash FROM users WHERE id=?`).get(user.id) as any
  if (!userRow) return c.json({ error: '사용자 정보 없음' }, 403)
  const inputPw = String(confirm_password || '')
  if (!inputPw || userRow.password_hash !== inputPw) {
    return c.json({ error: '비밀번호가 올바르지 않습니다.' }, 403)
  }

  if (!Array.isArray(targets) || targets.length === 0)
    return c.json({ error: '초기화 항목을 선택하세요.' }, 400)

  const deleted: Record<string, number> = {}

  const delTable = (table: string, label: string) => {
    try {
      const n = (rawDb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as any)?.n ?? 0
      rawDb.prepare(`DELETE FROM ${table}`).run()
      try { rawDb.prepare(`DELETE FROM sqlite_sequence WHERE name=?`).run(table) } catch {}
      deleted[label] = n
    } catch (e: any) { console.warn(`[reset] ${table} 삭제 실패:`, e.message) }
  }

  if (targets.includes('work_reports')) {
    delTable('work_report_extras',  '외선일보-추가공종')
    delTable('work_report_other',   '외선일보-기타공종')
    delTable('work_report_cables',  '외선일보-케이블')
    delTable('work_report_lines',   '외선일보-내역')
    delTable('work_reports',        '외선일보')
  }
  if (targets.includes('splice_reports')) {
    delTable('splice_work_items',   '접속일보-공종')
    delTable('splice_reports',      '접속일보')
  }
  if (targets.includes('tbm')) {
    try {
      delTable('tbm_signatures',      'TBM서명')
      delTable('tbm_attendees',       'TBM참석자')
      delTable('tbm_photos',          'TBM사진')
      delTable('tbm_sessions',        'TBM')
    } catch {}
  }
  if (targets.includes('education')) {
    delTable('edu_photos',           '교육사진')
    delTable('edu_reports',          '교육리포트')
    delTable('safety_education_attendees', '교육참석자')
    delTable('safety_education_sessions', '안전교육')
  }
  if (targets.includes('risk')) {
    try {
      delTable('risk_assessment_signatures', '위험성평가서명')
      delTable('risk_assessment_items',      '위험성평가항목')
      delTable('risk_assessments',           '위험성평가')
    } catch {}
  }
  if (targets.includes('inspections')) {
    try {
      delTable('inspection_items',    '현장점검항목')
      delTable('inspections',         '현장점검')
    } catch {}
  }
  if (targets.includes('tasks')) {
    if (!targets.includes('work_reports')) {
      delTable('work_report_extras', '외선일보-추가공종')
      delTable('work_report_other',  '외선일보-기타공종')
      delTable('work_report_cables', '외선일보-케이블')
      delTable('work_report_lines',  '외선일보-내역')
      delTable('work_reports',       '외선일보')
    }
    if (!targets.includes('splice_reports')) {
      delTable('splice_work_items',  '접속일보-공종')
      delTable('splice_reports',     '접속일보')
    }
    delTable('task_assignments',    '작업배정')
    delTable('task_checklist',      '작업체크리스트')
    delTable('worklogs',            '작업로그')
    delTable('hazards',             '위험요소')
    delTable('tasks',               '작업')
  }
  if (targets.includes('constructions')) {
    if (!targets.includes('tasks')) {
      delTable('work_report_extras', '외선일보-추가공종')
      delTable('work_report_other',  '외선일보-기타공종')
      delTable('work_report_cables', '외선일보-케이블')
      delTable('work_report_lines',  '외선일보-내역')
      delTable('work_reports',       '외선일보')
      delTable('splice_work_items',  '접속일보-공종')
      delTable('splice_reports',     '접속일보')
      delTable('task_assignments',   '작업배정')
      delTable('task_checklist',     '작업체크리스트')
      delTable('worklogs',           '작업로그')
      delTable('hazards',            '위험요소')
      delTable('tasks',              '작업')
    }
    delTable('constructions',       '공사')
  }
  if (targets.includes('notifications')) {
    delTable('notifications',       '알림')
  }
  if (targets.includes('signature_requests')) {
    delTable('signature_requests',  '서명요청')
  }

  const summary = Object.entries(deleted)
    .map(([k, v]) => `${k}(${v}건)`)
    .join(', ')
  console.log(`[DB초기화] 관리자(id=${user.id}) 실행 — ${summary || '없음'}`)

  return c.json({ ok: true, deleted, summary })
})

// ─── 버전 태그 생성 헬퍼 (V{major}.{minor}_{YYMMDD}{HHMM}) ──────────────────
// 예: V2.9d_260702173  →  V2.9d_2607021703  (시분 4자리, 서울 KST 기준)
// major: 고정 2, minor: 커밋 해시 앞 2자리(16진수→10진수) % 100 zero-pad
// 시분: HHMM 4자리 (KST = UTC+9)
function _makeVersionTag(commitHash: string, updatedAt: string | null): string {
  // KST(UTC+9) 기준 시각 계산
  const base  = updatedAt ? new Date(updatedAt) : new Date()
  const kst   = new Date(base.getTime() + 9 * 60 * 60 * 1000)
  const yy    = String(kst.getUTCFullYear()).slice(2)
  const mm    = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const dd    = String(kst.getUTCDate()).padStart(2, '0')
  const hh    = String(kst.getUTCHours()).padStart(2, '0')
  const mn    = String(kst.getUTCMinutes()).padStart(2, '0')
  // minor: 커밋 해시 앞 2글자를 16→10진수 변환 후 % 100
  const minor = commitHash
    ? String(parseInt(commitHash.slice(0, 2), 16) % 100).padStart(2, '0')
    : '00'
  return `V2.${minor}_${yy}${mm}${dd}${hh}${mn}`
}

// ─── 업데이트 상태 싱글턴 ────────────────────────────────────────────────────
let _updateState: {
  status: 'idle' | 'checking' | 'pulling' | 'restarting' | 'done' | 'error'
  message: string
  currentCommit: string
  latestCommit: string
  updatedAt: string | null
  appliedAt: string | null   // 마지막 업데이트 반영 시각 (KST)
  log: string[]
} = {
  status: 'idle',
  message: '대기 중',
  currentCommit: '',
  latestCommit: '',
  updatedAt: null,
  appliedAt: null,
  log: [],
}

function _addUpdateLog(msg: string) {
  _updateState.log.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)
  if (_updateState.log.length > 50) _updateState.log = _updateState.log.slice(-50)
  console.log('[update]', msg)
}

/**
 * 비동기 셸 명령 실행 헬퍼 (타임아웃 지원)
 */
function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 30000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '', stderr = ''
    // NAS PATH 보강 — Node.js_v18 bin이 PATH에 없어도 npm/git/pm2 인식
    const nasNodeBin = '/volume1/@appstore/Node.js_v18/usr/local/bin'
    const env = {
      ...process.env,
      PATH: [nasNodeBin, process.env.PATH || '', '/usr/local/bin', '/usr/bin', '/bin'].join(':'),
    }
    const proc = spawn(cmd, args, { cwd, stdio: 'pipe', env })
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      resolve({ code: -1, stdout, stderr: stderr + '\n[TIMEOUT]' })
    }, timeoutMs)
    proc.on('close', (code: number | null) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

// npm 실행 파일 경로 탐색 (NAS 환경 대응 — BUG-049)
function resolveNpmBin(): string {
  const candidates = [
    process.env.NPM_EXEC,
    '/volume1/@appstore/Node.js_v18/usr/local/bin/npm',
    '/usr/local/bin/npm',
    '/usr/bin/npm',
    'npm',
  ]
  for (const c of candidates) {
    if (c && (c === 'npm' || existsSync(c))) return c
  }
  return 'npm'
}

// ─── GET /api/admin/update/status ───────────────────────────────────────────
app.get('/update/status', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const gitHead = await runCmd('git', ['rev-parse', '--short', 'HEAD'], process.cwd(), 5000)
  _updateState.currentCommit = gitHead.stdout.trim() || _updateState.currentCommit
  // 버전 태그 생성
  const versionTag  = _makeVersionTag(_updateState.currentCommit, _updateState.updatedAt)
  const updateMode  = getSetting('update_mode') || 'manual'
  return c.json({ ..._updateState, versionTag, updateMode })
})

// ─── POST /api/admin/update/check ───────────────────────────────────────────
app.post('/update/check', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  if (_updateState.status === 'pulling' || _updateState.status === 'restarting')
    return c.json({ error: '업데이트 진행 중입니다. 잠시 후 다시 시도하세요.' }, 409)

  _updateState.status  = 'checking'
  _updateState.message = 'GitHub 최신 버전 확인 중...'
  _updateState.log     = []
  _addUpdateLog('git fetch origin main 시작')

  ;(async () => {
    try {
      const fetchRes = await runCmd('git', ['fetch', 'origin', 'main'], process.cwd(), 20000)
      if (fetchRes.code !== 0) {
        _addUpdateLog(`fetch 실패: ${fetchRes.stderr.trim()}`)
        _updateState.status  = 'error'
        _updateState.message = `GitHub 연결 실패: ${fetchRes.stderr.trim().slice(0, 80)}`
        return
      }
      const cur    = await runCmd('git', ['rev-parse', '--short', 'HEAD'], process.cwd(), 5000)
      const latest = await runCmd('git', ['rev-parse', '--short', 'origin/main'], process.cwd(), 5000)
      const curC   = cur.stdout.trim()
      const latC   = latest.stdout.trim()
      _updateState.currentCommit = curC
      _updateState.latestCommit  = latC

      if (curC === latC) {
        _addUpdateLog(`이미 최신 버전입니다 (${curC})`)
        _updateState.status  = 'idle'
        _updateState.message = `이미 최신 버전입니다 (${curC})`
      } else {
        const logRes = await runCmd('git', ['log', '--oneline', `${curC}..origin/main`], process.cwd(), 5000)
        const newLogs = logRes.stdout.trim().split('\n').filter(Boolean).slice(0, 5)
        newLogs.forEach(l => _addUpdateLog(`새 변경: ${l}`))
        _updateState.status  = 'idle'
        _updateState.message = `새 버전 있음: ${curC} → ${latC} (${newLogs.length}개 변경)`
      }
    } catch (e: any) {
      _updateState.status  = 'error'
      _updateState.message = `확인 중 오류: ${e.message}`
      _addUpdateLog(`오류: ${e.message}`)
    }
  })()

  return c.json({ ok: true, message: '버전 확인 중...' })
})

// ─── POST /api/admin/update/apply ───────────────────────────────────────────
app.post('/update/apply', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  if (_updateState.status === 'pulling' || _updateState.status === 'restarting')
    return c.json({ error: '업데이트 진행 중입니다.' }, 409)

  const rawDb = getRawDb()
  const body = await c.req.json().catch(() => ({})) as any
  const { confirm_password } = body

  const userRow = rawDb.prepare(`SELECT password_hash FROM users WHERE id=?`).get(user.id) as any
  if (!userRow || !confirm_password || userRow.password_hash !== String(confirm_password))
    return c.json({ error: '비밀번호가 올바르지 않습니다.' }, 403)

  _updateState.status    = 'pulling'
  _updateState.message   = 'GitHub에서 최신 코드 다운로드 중...'
  _updateState.log       = []
  _updateState.updatedAt = null
  _addUpdateLog('업데이트 시작')

  const cwd = process.cwd()

  ;(async () => {
    try {
      // ── 1. DB 자동 백업 ─────────────────────────────────────
      _addUpdateLog('DB 백업 중...')
      const dbSrc = String(process.env.DB_PATH || join(cwd, 'data/safety.db'))
      const backupDir  = join(cwd, 'backups')
      const stamp      = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')
      const backupPath = join(backupDir, `safety_${stamp}_before_update.db`)
      try {
        await runCmd('mkdir', ['-p', backupDir], cwd, 5000)
        if (existsSync(dbSrc)) {
          const cpRes = await runCmd('cp', [dbSrc, backupPath], cwd, 10000)
          _addUpdateLog(
            cpRes.code === 0
              ? `DB 백업 완료: backups/safety_${stamp}_before_update.db`
              : `DB 백업 경고: ${cpRes.stderr.trim()}`
          )
        } else { _addUpdateLog('DB 파일 없음 — 백업 건너뜀') }
      } catch (be: any) { _addUpdateLog(`DB 백업 오류(무시): ${be.message}`) }

      // ── 2. git fetch + reset --hard (로컬 변경사항 자동 처리) ──
      _addUpdateLog('git fetch origin 시작...')
      const fetchRes = await runCmd('git', ['fetch', 'origin', 'main'], cwd, 60000)
      if (fetchRes.code !== 0) {
        _addUpdateLog(`git fetch 실패: ${fetchRes.stderr.trim()}`)
        _updateState.status  = 'error'
        _updateState.message = `git fetch 실패: ${fetchRes.stderr.trim().slice(0, 100)}`
        return
      }
      _addUpdateLog('git fetch 완료 — 로컬 변경사항 초기화 중...')
      const resetRes = await runCmd('git', ['reset', '--hard', 'origin/main'], cwd, 30000)
      if (resetRes.code !== 0) {
        _addUpdateLog(`git reset 실패: ${resetRes.stderr.trim()}`)
        _updateState.status  = 'error'
        _updateState.message = `git reset 실패: ${resetRes.stderr.trim().slice(0, 100)}`
        return
      }
      _addUpdateLog(`git reset 완료: ${resetRes.stdout.trim()}`)

      const newCommit = await runCmd('git', ['rev-parse', '--short', 'HEAD'], cwd, 5000)
      _updateState.currentCommit = newCommit.stdout.trim()
      _updateState.updatedAt     = new Date().toISOString()
      // KST 반영 시각 (UTC+9)
      const _kstNow = new Date(Date.now() + 9 * 3600 * 1000)
      _updateState.appliedAt = _kstNow.toISOString().replace('T', ' ').slice(0, 19)

      // ── 3. npm run build (프론트엔드 dist 재빌드) ──────────────
      // BUG-049: git reset 후 빌드 없이 pm2 restart만 하면 dist/ 가 이전 버전 그대로 유지됨
      _updateState.status  = 'restarting'
      _updateState.message = '프론트엔드 빌드 중... (30초~1분 소요)'
      _addUpdateLog('npm run build 시작...')

      // NAS Node.js 경로 자동 탐색 (BUG-049)
      const npmBin = resolveNpmBin()
      _addUpdateLog(`npm 경로: ${npmBin}`)
      const buildRes = await runCmd(npmBin, ['run', 'build'], cwd, 120000)
      if (buildRes.code !== 0) {
        _addUpdateLog(`npm run build 실패: ${buildRes.stderr.trim().slice(0, 200)}`)
        _updateState.status  = 'error'
        _updateState.message = `빌드 실패: ${buildRes.stderr.trim().slice(0, 100)}`
        return
      }
      _addUpdateLog(`npm run build 완료 ✅`)

      // ── 4. pm2 restart ─────────────────────────────────────
      _updateState.message = '서버 재시작 중... 잠시 후 페이지를 새로고침하세요'
      _addUpdateLog('pm2 restart safetynote 실행...')

      setTimeout(async () => {
        const restartRes = await runCmd('pm2', ['restart', 'safetynote'], cwd, 15000)
        if (restartRes.code === 0) {
          _addUpdateLog('pm2 restart 완료 ✅')
          _updateState.status  = 'done'
          _updateState.message = `업데이트 완료! (${_updateState.currentCommit})`
        } else {
          _addUpdateLog(`pm2 restart 실패: ${restartRes.stderr.trim()}`)
          _updateState.status  = 'error'
          _updateState.message = `서버 재시작 실패: ${restartRes.stderr.trim().slice(0, 80)}`
        }
      }, 1000)

    } catch (e: any) {
      _addUpdateLog(`업데이트 오류: ${e.message}`)
      _updateState.status  = 'error'
      _updateState.message = `오류: ${e.message}`
    }
  })()

  return c.json({ ok: true, message: '업데이트 시작됨' })
})

// ─── POST /api/admin/update/webhook — FEAT-036 ───────────────────────────────
// GitHub Actions에서 push 이벤트 시 자동 호출 → git fetch + reset + build + pm2 restart
// 인증: DEPLOY_WEBHOOK_SECRET 환경변수
// ⚠️  update_mode=auto 일 때만 실행됨 (기본값: manual → 거부)
app.post('/update/webhook', async (c) => {
  // ── 업데이트 모드 확인 (manual이면 자동 업데이트 차단) ──────────────
  const updateMode = getSetting('update_mode') || 'manual'
  if (updateMode !== 'auto') {
    console.log('[Update Webhook] 수동 업데이트 모드 — Webhook 차단')
    return c.json({ error: '이 NAS는 수동 업데이트 모드입니다. 시스템설정 → 서버 업데이트에서 자동 모드로 변경하세요.' }, 403)
  }

  const expectedSecret = process.env.DEPLOY_WEBHOOK_SECRET || ''
  if (!expectedSecret) {
    console.error('[Update Webhook] DEPLOY_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.')
    return c.json({ error: 'Webhook이 비활성화되어 있습니다. DEPLOY_WEBHOOK_SECRET을 서버에 설정하세요.' }, 503)
  }

  const body = await c.req.json().catch(() => ({})) as { secret?: string }
  if (!body.secret || body.secret !== expectedSecret) {
    console.warn('[Update Webhook] Secret 불일치 — 요청 거부')
    return c.json({ error: '인증 실패' }, 401)
  }

  if (_updateState.status === 'pulling' || _updateState.status === 'restarting') {
    return c.json({ error: '업데이트 진행 중입니다.' }, 409)
  }

  console.log('[Update Webhook] 자동 업데이트 모드 — GitHub Actions 트리거 수신')

  _updateState.status    = 'pulling'
  _updateState.message   = 'GitHub Actions Webhook — 최신 코드 다운로드 중...'
  _updateState.log       = []
  _updateState.updatedAt = null
  _addUpdateLog('GitHub Actions Webhook 수신 — 자동 업데이트 시작')

  const cwd = process.cwd()

  ;(async () => {
    try {
      // ── 1. git fetch + reset --hard ─────────────────────────────
      _addUpdateLog('git fetch origin main...')
      const fetchRes = await runCmd('git', ['fetch', 'origin', 'main'], cwd, 60000)
      if (fetchRes.code !== 0) {
        _addUpdateLog(`git fetch 실패: ${fetchRes.stderr.trim()}`)
        _updateState.status  = 'error'
        _updateState.message = `git fetch 실패: ${fetchRes.stderr.trim().slice(0, 100)}`
        return
      }

      const resetRes = await runCmd('git', ['reset', '--hard', 'origin/main'], cwd, 30000)
      if (resetRes.code !== 0) {
        _addUpdateLog(`git reset 실패: ${resetRes.stderr.trim()}`)
        _updateState.status  = 'error'
        _updateState.message = `git reset 실패: ${resetRes.stderr.trim().slice(0, 100)}`
        return
      }
      _addUpdateLog(`git reset 완료: ${resetRes.stdout.trim()}`)

      // ── 2. 현재 커밋 해시 갱신 ──────────────────────────────────
      const hashRes = await runCmd('git', ['rev-parse', '--short', 'HEAD'], cwd, 5000)
      if (hashRes.code === 0) _updateState.currentCommit = hashRes.stdout.trim()
      _updateState.updatedAt = new Date().toISOString()
      const _kstNow2 = new Date(Date.now() + 9 * 3600 * 1000)
      _updateState.appliedAt = _kstNow2.toISOString().replace('T', ' ').slice(0, 19)

      // ── 3. npm run build ─────────────────────────────────────────
      _updateState.status  = 'restarting'
      _updateState.message = 'npm run build 실행 중...'
      _addUpdateLog('npm run build 시작...')
      const buildRes = await runCmd('npm', ['run', 'build'], cwd, 120000)
      if (buildRes.code !== 0) {
        _addUpdateLog(`npm run build 실패: ${buildRes.stderr.trim()}`)
        _updateState.status  = 'error'
        _updateState.message = `빌드 실패: ${buildRes.stderr.trim().slice(0, 100)}`
        return
      }
      _addUpdateLog('npm run build 완료 ✅')

      // ── 4. pm2 restart ───────────────────────────────────────────
      _updateState.message = '서버 재시작 중...'
      _addUpdateLog('pm2 restart safetynote 실행...')
      setTimeout(async () => {
        const restartRes = await runCmd('pm2', ['restart', 'safetynote'], cwd, 15000)
        if (restartRes.code === 0) {
          _addUpdateLog('pm2 restart 완료 ✅')
          _updateState.status  = 'done'
          _updateState.message = `Webhook 자동 업데이트 완료! (${_updateState.currentCommit})`
        } else {
          _addUpdateLog(`pm2 restart 실패: ${restartRes.stderr.trim()}`)
          _updateState.status  = 'error'
          _updateState.message = `서버 재시작 실패: ${restartRes.stderr.trim().slice(0, 80)}`
        }
      }, 1000)

    } catch (e: any) {
      _addUpdateLog(`Webhook 업데이트 오류: ${e.message}`)
      _updateState.status  = 'error'
      _updateState.message = `오류: ${e.message}`
    }
  })()

  return c.json({ ok: true, message: 'Webhook 업데이트 시작됨' })
})

export default app

// ─── app-version 라우트 (별도 export — node-server.ts에서 직접 마운트) ────────
// GET /api/app-version — 인증 없이 공개
export function createAppVersionRoute() {
  const r = new Hono()
  r.get('/', (c) => {
    const version     = getSetting('apk_version')     || ''
    const apkUrl      = getSetting('apk_url')          || ''
    const releaseNote = getSetting('apk_release_note') || ''
    const forceUpdate = getSetting('apk_force_update') || '0'
    if (!apkUrl) return c.json({ available: false })
    return c.json({
      available:    true,
      version,
      apk_url:      apkUrl,
      release_note: releaseNote,
      force_update: forceUpdate === '1',
    })
  })
  return r
}
