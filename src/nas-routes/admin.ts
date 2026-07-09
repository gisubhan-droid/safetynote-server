/**
 * admin.ts — NAS 관리자 전용 라우트
 *
 * 포함 라우트:
 *   GET  /api/admin/settings
 *   PATCH /api/admin/settings
 *   GET  /api/app-version
 *   GET  /api/admin/folders
 *   GET  /api/admin/folders/detail
 *   GET  /api/admin/reset/counts
 *   POST /api/admin/reset
 *   GET  /api/admin/update/status
 *   POST /api/admin/update/check
 *   POST /api/admin/update/apply
 *   POST /api/admin/update/webhook  ← FEAT-036: GitHub Actions 자동 업데이트
 *   GET  /api/admin/update/history  ← FEAT-053: 롤백용 커밋 목록
 *   GET  /api/admin/update/backups  ← FEAT-053: DB 백업 목록
 *   POST /api/admin/update/rollback ← FEAT-053: 특정 커밋으로 코드 롤백
 *   POST /api/admin/update/restore-db ← FEAT-053: DB 백업 파일 복원
 *   GET  /qr/:userId  ← node-server.ts에서 별도 마운트
 *
 * 의존:
 *   - getRawDb(), getUser(), getSetting(), setSysSettings(), getUploadRootNow() from ../nas-db
 *   - spawn from node:child_process
 */

import { Hono } from 'hono'
import { spawn, execSync } from 'node:child_process'
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

  // 파일 카운트 누적 헬퍼 타입
  interface FileStat {
    bytes: number
    imgCount: number
    docCount: number
    vidCount: number
    etcCount: number
  }
  const emptyStat = (): FileStat => ({ bytes: 0, imgCount: 0, docCount: 0, vidCount: 0, etcCount: 0 })
  const addFile = (stat: FileStat, ext: string, size: number) => {
    stat.bytes += size
    if      (IMG_EXT.has(ext)) stat.imgCount++
    else if (DOC_EXT.has(ext)) stat.docCount++
    else if (VID_EXT.has(ext)) stat.vidCount++
    else                        stat.etcCount++
  }

  // 전체 합계
  const total = emptyStat()

  // 년도→월 계층 통계
  // yearStats[year][month] = FileStat  (month: '01'~'12')
  // yearStats[year]['__total__'] = 연간 합계
  const yearStats: Record<string, Record<string, FileStat>> = {}

  // 재귀 스캔 (어느 depth에서든 파일을 찾으면 stat에 누적)
  function scanDir(dirPath: string, stat: FileStat) {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const fullPath = join(dirPath, e.name)
        if (e.isDirectory()) {
          scanDir(fullPath, stat)
        } else {
          try {
            const st = statSync(fullPath)
            const ext = e.name.split('.').pop()?.toLowerCase() || ''
            addFile(stat, ext, st.size)
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  try {
    if (!existsSync(root)) {
      return c.json({ root, totalBytes: 0, imgCount: 0, docCount: 0, vidCount: 0, etcCount: 0, yearStats: {} })
    }

    // 루트 바로 아래 엔트리 순회
    const rootEntries = readdirSync(root, { withFileTypes: true })
    for (const e of rootEntries) {
      if (e.name.startsWith('.')) continue
      const fullPath = join(root, e.name)

      if (e.isDirectory()) {
        // 년도 폴더 여부 판별: 4자리 숫자
        const isYearDir = /^\d{4}$/.test(e.name)

        if (isYearDir) {
          const year = e.name
          if (!yearStats[year]) yearStats[year] = {}

          // 년도 폴더 아래 월 폴더 순회
          let yearDirEntries: ReturnType<typeof readdirSync> = []
          try { yearDirEntries = readdirSync(fullPath, { withFileTypes: true }) } catch (_) {}

          for (const me of yearDirEntries) {
            if (me.name.startsWith('.')) continue
            const monthPath = join(fullPath, me.name)

            if (me.isDirectory()) {
              // 월 폴더 여부 판별: 01~12 (2자리 숫자)
              const isMonthDir = /^(0[1-9]|1[0-2])$/.test(me.name)
              const month = isMonthDir ? me.name : '__other__'

              if (!yearStats[year][month]) yearStats[year][month] = emptyStat()
              scanDir(monthPath, yearStats[year][month])
            } else {
              // 년도 폴더 바로 아래 파일 (비정형)
              try {
                const st = statSync(join(fullPath, me.name))
                const ext = me.name.split('.').pop()?.toLowerCase() || ''
                if (!yearStats[year]['__other__']) yearStats[year]['__other__'] = emptyStat()
                addFile(yearStats[year]['__other__'], ext, st.size)
              } catch (_) {}
            }
          }

          // 년도 합계 계산
          const yearTotal = emptyStat()
          for (const mStat of Object.values(yearStats[year])) {
            yearTotal.bytes    += mStat.bytes
            yearTotal.imgCount += mStat.imgCount
            yearTotal.docCount += mStat.docCount
            yearTotal.vidCount += mStat.vidCount
            yearTotal.etcCount += mStat.etcCount
          }
          yearStats[year]['__total__'] = yearTotal

          // 전체 합계에도 누적
          total.bytes    += yearTotal.bytes
          total.imgCount += yearTotal.imgCount
          total.docCount += yearTotal.docCount
          total.vidCount += yearTotal.vidCount
          total.etcCount += yearTotal.etcCount

        } else {
          // 년도 패턴이 아닌 기존 폴더 (미분류) → 전체 합계에만 누적
          const misc = emptyStat()
          scanDir(fullPath, misc)
          total.bytes    += misc.bytes
          total.imgCount += misc.imgCount
          total.docCount += misc.docCount
          total.vidCount += misc.vidCount
          total.etcCount += misc.etcCount
        }

      } else {
        // 루트 바로 아래 파일 (거의 없지만 처리)
        try {
          const st = statSync(fullPath)
          const ext = e.name.split('.').pop()?.toLowerCase() || ''
          addFile(total, ext, st.size)
        } catch (_) {}
      }
    }

  } catch (e) {
    return c.json({ error: '폴더 읽기 실패', detail: String(e) }, 500)
  }

  return c.json({
    root,
    totalBytes: total.bytes,
    imgCount:   total.imgCount,
    docCount:   total.docCount,
    vidCount:   total.vidCount,
    etcCount:   total.etcCount,
    yearStats,  // 년도→월 계층 통계 (신규)
  })
})

// ─── GET /api/admin/folders/detail ──────────────────────────────────────────
// 쿼리: ?year=2026  또는  ?year=2026&month=07
// year만 → 해당 년도 폴더 아래 월별 공사폴더 목록 요약 반환
// year+month → 해당 년도/월 폴더 아래 공사폴더(서브작업) 목록 + 통계 반환
app.get('/folders/detail', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const root  = getUploadRootNow()
  const year  = (c.req.query('year')  || '').trim()
  const month = (c.req.query('month') || '').trim()

  if (!year || !/^\d{4}$/.test(year)) {
    return c.json({ error: 'year 파라미터가 올바르지 않습니다. (예: 2026)' }, 400)
  }
  if (month && !/^(0[1-9]|1[0-2])$/.test(month)) {
    return c.json({ error: 'month 파라미터가 올바르지 않습니다. (예: 07)' }, 400)
  }

  const IMG_EXT = new Set(['jpg','jpeg','png','gif','webp','heic','bmp','tiff','svg'])
  const DOC_EXT = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','hwp','hwpx','txt','csv'])
  const VID_EXT = new Set(['mp4','avi','mov','mkv','wmv','flv'])

  interface FolderStat {
    name: string        // 폴더명 (예: 202501010001_공사명)
    bytes: number
    imgCount: number
    docCount: number
    vidCount: number
    etcCount: number
    fileCount: number
  }

  // 한 디렉터리 재귀 스캔 → 합계 반환
  function scanDir(dirPath: string): { bytes: number; img: number; doc: number; vid: number; etc: number } {
    let bytes = 0, img = 0, doc = 0, vid = 0, etc = 0
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const fp = join(dirPath, e.name)
        if (e.isDirectory()) {
          const sub = scanDir(fp)
          bytes += sub.bytes; img += sub.img; doc += sub.doc; vid += sub.vid; etc += sub.etc
        } else {
          try {
            const st = statSync(fp)
            bytes += st.size
            const ext = e.name.split('.').pop()?.toLowerCase() || ''
            if      (IMG_EXT.has(ext)) img++
            else if (DOC_EXT.has(ext)) doc++
            else if (VID_EXT.has(ext)) vid++
            else                        etc++
          } catch (_) {}
        }
      }
    } catch (_) {}
    return { bytes, img, doc, vid, etc }
  }

  // 스캔 대상 경로 결정
  const scanRoot = month
    ? join(root, year, month)
    : join(root, year)

  if (!existsSync(scanRoot)) {
    return c.json({
      root, year, month: month || null,
      path: scanRoot,
      folders: [],
      totalBytes: 0, imgCount: 0, docCount: 0, vidCount: 0, etcCount: 0,
    })
  }

  const folders: FolderStat[] = []
  let totalBytes = 0, totalImg = 0, totalDoc = 0, totalVid = 0, totalEtc = 0

  try {
    const entries = readdirSync(scanRoot, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith('.') || !e.isDirectory()) continue
      const fp = join(scanRoot, e.name)

      // month 지정 시: 공사폴더(또는 하위 작업폴더) 직접 스캔
      // month 미지정 시: 월 폴더 → 그 하위를 합산
      if (month) {
        // {루트}/{년도}/{월}/{공사폴더}/...
        const s = scanDir(fp)
        const fc: FolderStat = {
          name: e.name,
          bytes: s.bytes, imgCount: s.img, docCount: s.doc, vidCount: s.vid, etcCount: s.etc,
          fileCount: s.img + s.doc + s.vid + s.etc,
        }
        folders.push(fc)
        totalBytes += s.bytes; totalImg += s.img; totalDoc += s.doc; totalVid += s.vid; totalEtc += s.etc
      } else {
        // e.name = 월 폴더 (01~12) 또는 미분류
        const s = scanDir(fp)
        const fc: FolderStat = {
          name: e.name,
          bytes: s.bytes, imgCount: s.img, docCount: s.doc, vidCount: s.vid, etcCount: s.etc,
          fileCount: s.img + s.doc + s.vid + s.etc,
        }
        folders.push(fc)
        totalBytes += s.bytes; totalImg += s.img; totalDoc += s.doc; totalVid += s.vid; totalEtc += s.etc
      }
    }
    // 이름순 정렬
    folders.sort((a, b) => a.name.localeCompare(b.name))
  } catch (e) {
    return c.json({ error: '폴더 읽기 실패', detail: String(e) }, 500)
  }

  return c.json({
    root, year, month: month || null,
    path: scanRoot,
    folders,
    totalBytes, imgCount: totalImg, docCount: totalDoc, vidCount: totalVid, etcCount: totalEtc,
  })
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
    inspections   : count('site_inspections'),   // BUG-062: inspections → site_inspections
    tbm           : count('tbm_records'),          // BUG-060: tbm_sessions → tbm_records
    education     : count('safety_education_sessions'),
    risk          : count('risk_assessments'),
    notifications : count('notifications'),
    signature_requests: count('signature_requests'),
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
    // BUG-060: 올바른 테이블명으로 수정
    // tbm_attendees  → 없음 (attendees는 tbm_records JSON 컬럼)
    // tbm_photos     → tbm_photo_items + tbm_photo_sections (checklist_assessments 하위)
    // tbm_sessions   → tbm_records
    delTable('tbm_signatures',      'TBM서명')
    delTable('tbm_share_tokens',    'TBM공유토큰')
    delTable('tbm_records',         'TBM')
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
    // BUG-060: inspection_photos, inspection_workers 연쇄 삭제 추가
    delTable('inspection_photos',   '현장점검사진')
    delTable('inspection_workers',  '현장점검작업자')
    delTable('inspection_items',    '현장점검항목')
    delTable('site_inspections',         '현장점검')
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
    if (!targets.includes('tbm')) {
      // tasks 단독 삭제 시 TBM 연쇄 삭제
      delTable('tbm_signatures',    'TBM서명')
      delTable('tbm_share_tokens',  'TBM공유토큰')
      delTable('tbm_records',       'TBM')
    }
    if (!targets.includes('risk')) {
      // tasks 단독 삭제 시 위험성평가 연쇄 삭제 (risk_assessments → tasks FK)
      delTable('risk_assessment_signatures', '위험성평가서명')
      delTable('risk_assessment_items',      '위험성평가항목')
      delTable('risk_assessments',           '위험성평가')
    }
    if (!targets.includes('inspections')) {
      // tasks 단독 삭제 시 현장점검 연쇄 삭제 (site_inspections → tasks FK)
      delTable('inspection_photos',   '현장점검사진')
      delTable('inspection_workers',  '현장점검작업자')
      delTable('inspection_items',    '현장점검항목')
      delTable('site_inspections',         '현장점검')
    }
    // BUG-062: 테이블명 오류 수정 + 누락 테이블 추가
    // worklogs → work_logs (실제 테이블명)
    // hazards  → hazard_reports (실제 테이블명)
    // task_work_types, task_attachments 추가 (tasks FK 자식 테이블)
    delTable('tbm_photo_items',             'TBM사진항목')
    delTable('tbm_photo_sections',          'TBM사진섹션')
    delTable('checklist_responses',         '체크리스트응답')
    delTable('checklist_assessments',       '체크리스트평가')
    delTable('task_photos',                 '작업사진')
    delTable('task_stops',                  '작업중지')
    delTable('task_work_types',             '작업공종')
    delTable('task_attachments',            '작업첨부파일')
    delTable('task_assignments',            '작업배정')
    delTable('work_logs',                   '작업로그')
    delTable('hazard_reports',              '위험요소')
    delTable('tasks',                       '작업')
  }
  if (targets.includes('constructions')) {
    if (!targets.includes('tasks')) {
      // constructions 단독 선택 시 하위 tasks 전체 연쇄 삭제
      // BUG-062: 테이블명 오류 수정 + 누락 테이블 추가
      if (!targets.includes('work_reports')) {
        delTable('work_report_extras',        '외선일보-추가공종')
        delTable('work_report_other',         '외선일보-기타공종')
        delTable('work_report_cables',        '외선일보-케이블')
        delTable('work_report_lines',         '외선일보-내역')
        delTable('work_reports',              '외선일보')
      }
      if (!targets.includes('splice_reports')) {
        delTable('splice_work_items',         '접속일보-공종')
        delTable('splice_reports',            '접속일보')
      }
      if (!targets.includes('tbm')) {
        delTable('tbm_signatures',            'TBM서명')
        delTable('tbm_share_tokens',          'TBM공유토큰')
        delTable('tbm_records',               'TBM')
      }
      if (!targets.includes('risk')) {
        delTable('risk_assessment_signatures','위험성평가서명')
        delTable('risk_assessment_items',     '위험성평가항목')
        delTable('risk_assessments',          '위험성평가')
      }
      if (!targets.includes('inspections')) {
        delTable('inspection_photos',         '현장점검사진')
        delTable('inspection_workers',        '현장점검작업자')
        delTable('inspection_items',          '현장점검항목')
        delTable('site_inspections',               '현장점검')
      }
      delTable('tbm_photo_items',             'TBM사진항목')
      delTable('tbm_photo_sections',          'TBM사진섹션')
      delTable('checklist_responses',         '체크리스트응답')
      delTable('checklist_assessments',       '체크리스트평가')
      delTable('task_photos',                 '작업사진')
      delTable('task_stops',                  '작업중지')
      delTable('task_work_types',             '작업공종')
      delTable('task_attachments',            '작업첨부파일')
      delTable('task_assignments',            '작업배정')
      delTable('work_logs',                   '작업로그')
      delTable('hazard_reports',              '위험요소')
      delTable('tasks',                       '작업')
    }
    delTable('constructions',                 '공사')
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
// 버전 규칙:
//   - BASE_COMMIT(573) 이후 커밋 1개 = minor +1
//   - minor 00~99 → major 2, minor 99 초과 시 major 올라감
//   - 예: 커밋 575 → V2.02, 커밋 672 → V2.99, 커밋 673 → V3.00
//   - 형식: V{major}.{minor(2자리)}_{YYMMDD}{HHMM(KST)}
const _VERSION_BASE_COMMIT = 573  // 이 커밋 수 = V2.00
const _VERSION_BASE_MAJOR  = 2    // 시작 major

function _makeVersionTag(_commitHash: string, updatedAt: string | null): string {
  // 1) git rev-list --count HEAD 로 현재 총 커밋 수 조회
  let totalCommits = _VERSION_BASE_COMMIT
  try {
    const out = execSync('git rev-list --count HEAD', { encoding: 'utf8', timeout: 5000, cwd: process.cwd() }).trim()
    totalCommits = parseInt(out, 10) || _VERSION_BASE_COMMIT
  } catch (_) { /* git 조회 실패 시 base 값 유지 */ }

  // 2) V{major}.{minor} 계산
  const offset = Math.max(0, totalCommits - _VERSION_BASE_COMMIT)  // 0 이상
  const majorInc = Math.floor(offset / 100)
  const minor    = offset % 100
  const major    = _VERSION_BASE_MAJOR + majorInc

  const majorStr = String(major)
  const minorStr = String(minor).padStart(2, '0')

  // 3) KST(UTC+9) 기준 날짜·시각
  const base = updatedAt ? new Date(updatedAt) : new Date()
  const kst  = new Date(base.getTime() + 9 * 60 * 60 * 1000)
  const yy   = String(kst.getUTCFullYear()).slice(2)
  const mm   = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const dd   = String(kst.getUTCDate()).padStart(2, '0')
  const hh   = String(kst.getUTCHours()).padStart(2, '0')
  const mn   = String(kst.getUTCMinutes()).padStart(2, '0')

  return `V${majorStr}.${minorStr}_${yy}${mm}${dd}${hh}${mn}`
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
    '/volume1/@appstore/Node.js_v20/usr/local/bin/npm',
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

// git remote URL 자동 교정 (BUG-061)
// NAS의 .git/config 가 구버전 repo URL을 가리키는 경우 자동 수정
const CORRECT_REMOTE_URL = 'https://github.com/gisubhan-droid/safetynote-server.git'
const OLD_REMOTE_URLS    = [
  'https://github.com/Jinwoo-Yeom/safetynote.git',
  'https://github.com/Jinwoo-Yeom/safetynote-server.git',
]
async function ensureCorrectRemote(cwd: string): Promise<string> {
  const getUrl = await runCmd('git', ['remote', 'get-url', 'origin'], cwd, 5000)
  const currentUrl = getUrl.stdout.trim()
  if (!currentUrl) {
    // remote 자체가 없으면 추가
    await runCmd('git', ['remote', 'add', 'origin', CORRECT_REMOTE_URL], cwd, 5000)
    return `remote 없음 → origin 추가: ${CORRECT_REMOTE_URL}`
  }
  if (OLD_REMOTE_URLS.includes(currentUrl) || !currentUrl.includes('gisubhan-droid/safetynote-server')) {
    // 구버전 URL → 자동 교정
    const setRes = await runCmd('git', ['remote', 'set-url', 'origin', CORRECT_REMOTE_URL], cwd, 5000)
    if (setRes.code === 0) {
      return `remote URL 자동 수정: ${currentUrl} → ${CORRECT_REMOTE_URL}`
    } else {
      return `remote URL 수정 실패(${setRes.stderr.trim()}) — 현재: ${currentUrl}`
    }
  }
  return `remote OK: ${currentUrl}`
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
      // ── remote URL 자동 교정 (BUG-061) ──────────────────────────
      const remoteMsg = await ensureCorrectRemote(process.cwd())
      _addUpdateLog(remoteMsg)

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

      // ── 2. git remote URL 자동 교정 + fetch + reset --hard ──────
      const remoteMsg = await ensureCorrectRemote(cwd)
      _addUpdateLog(remoteMsg)
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

// ─── GET /api/admin/update/history — FEAT-053 롤백: 최근 커밋 목록 ───────────────
// git log --oneline -15 결과 반환 (커밋 해시 + 메시지 + 날짜)
app.get('/update/history', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const cwd = process.cwd()
  try {
    // 현재 HEAD 해시 (짧은 형식)
    const headRes = await runCmd('git', ['rev-parse', '--short', 'HEAD'], cwd, 5000)
    const headHash = headRes.stdout.trim()

    // 최근 15개 커밋 (해시|날짜|메시지 형식)
    const logRes = await runCmd(
      'git',
      ['log', '--format=%h|%ad|%s', '--date=format:%Y-%m-%d %H:%M', '-20'],
      cwd, 10000
    )
    if (logRes.code !== 0) {
      return c.json({ error: 'git log 실패', detail: logRes.stderr.trim() }, 500)
    }

    const commits = logRes.stdout.trim().split('\n').filter(Boolean).map(line => {
      const [hash, date, ...msgParts] = line.split('|')
      return {
        hash:    hash?.trim() || '',
        date:    date?.trim() || '',
        message: msgParts.join('|').trim() || '',
        isCurrent: (hash?.trim() || '') === headHash,
      }
    })

    return c.json({ commits, currentHash: headHash })
  } catch (e: any) {
    return c.json({ error: '커밋 목록 조회 실패', detail: e.message }, 500)
  }
})

// ─── GET /api/admin/update/backups — FEAT-053 롤백: DB 백업 목록 ─────────────────
app.get('/update/backups', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const backupDir = join(process.cwd(), 'backups')
  try {
    if (!existsSync(backupDir)) {
      return c.json({ backups: [] })
    }
    const files = readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        try {
          const st = statSync(join(backupDir, f))
          return {
            filename: f,
            size:     st.size,
            mtime:    st.mtime.toISOString().slice(0, 16).replace('T', ' '),
          }
        } catch {
          return { filename: f, size: 0, mtime: '' }
        }
      })
      // 최신 파일이 위로 (mtime 역순)
      .sort((a, b) => (b.mtime > a.mtime ? 1 : -1))
      .slice(0, 20)  // 최대 20개

    return c.json({ backups: files })
  } catch (e: any) {
    return c.json({ error: '백업 목록 조회 실패', detail: e.message }, 500)
  }
})

// ─── POST /api/admin/update/rollback — FEAT-053 롤백: 특정 커밋으로 복원 ─────────
// body: { confirm_password, target_hash }
// 동작: DB 자동 백업 → git reset --hard {target_hash} → npm run build → pm2 restart
app.post('/update/rollback', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  if (_updateState.status === 'pulling' || _updateState.status === 'restarting')
    return c.json({ error: '업데이트/롤백 진행 중입니다.' }, 409)

  const rawDb = getRawDb()
  const body = await c.req.json().catch(() => ({})) as any
  const { confirm_password, target_hash } = body

  if (!target_hash || typeof target_hash !== 'string' || !/^[a-f0-9]{4,40}$/.test(target_hash))
    return c.json({ error: '유효하지 않은 커밋 해시입니다.' }, 400)

  const userRow = rawDb.prepare(`SELECT password_hash FROM users WHERE id=?`).get(user.id) as any
  if (!userRow || !confirm_password || userRow.password_hash !== String(confirm_password))
    return c.json({ error: '비밀번호가 올바르지 않습니다.' }, 403)

  _updateState.status    = 'pulling'
  _updateState.message   = `롤백 준비 중... (${target_hash})`
  _updateState.log       = []
  _updateState.updatedAt = null
  _addUpdateLog(`롤백 시작 → 대상 커밋: ${target_hash}`)

  const cwd = process.cwd()

  ;(async () => {
    try {
      // ── 1. DB 자동 백업 (롤백 전) ─────────────────────────────
      _addUpdateLog('DB 백업 중...')
      const dbSrc     = String(process.env.DB_PATH || join(cwd, 'data/safety.db'))
      const backupDir  = join(cwd, 'backups')
      const stamp      = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')
      const backupPath = join(backupDir, `safety_${stamp}_before_rollback.db`)
      try {
        await runCmd('mkdir', ['-p', backupDir], cwd, 5000)
        if (existsSync(dbSrc)) {
          const cpRes = await runCmd('cp', [dbSrc, backupPath], cwd, 10000)
          _addUpdateLog(
            cpRes.code === 0
              ? `DB 백업 완료: backups/safety_${stamp}_before_rollback.db`
              : `DB 백업 경고: ${cpRes.stderr.trim()}`
          )
        } else { _addUpdateLog('DB 파일 없음 — 백업 건너뜀') }
      } catch (be: any) { _addUpdateLog(`DB 백업 오류(무시): ${be.message}`) }

      // ── 2. git reset --hard {target_hash} ─────────────────────
      _addUpdateLog(`git reset --hard ${target_hash} 실행...`)
      const resetRes = await runCmd('git', ['reset', '--hard', target_hash], cwd, 30000)
      if (resetRes.code !== 0) {
        _addUpdateLog(`git reset 실패: ${resetRes.stderr.trim()}`)
        _updateState.status  = 'error'
        _updateState.message = `롤백 실패: ${resetRes.stderr.trim().slice(0, 100)}`
        return
      }
      _addUpdateLog(`git reset 완료 ✅  → ${resetRes.stdout.trim()}`)

      const newCommit = await runCmd('git', ['rev-parse', '--short', 'HEAD'], cwd, 5000)
      _updateState.currentCommit = newCommit.stdout.trim()
      _updateState.updatedAt     = new Date().toISOString()
      const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
      _updateState.appliedAt = kstNow.toISOString().replace('T', ' ').slice(0, 19)

      // ── 3. npm run build ──────────────────────────────────────
      _updateState.status  = 'restarting'
      _updateState.message = '프론트엔드 빌드 중... (30초~1분 소요)'
      _addUpdateLog('npm run build 시작...')

      const npmBin = resolveNpmBin()
      const buildRes = await runCmd(npmBin, ['run', 'build'], cwd, 120000)
      if (buildRes.code !== 0) {
        _addUpdateLog(`npm run build 실패: ${buildRes.stderr.trim().slice(0, 200)}`)
        _updateState.status  = 'error'
        _updateState.message = `빌드 실패: ${buildRes.stderr.trim().slice(0, 100)}`
        return
      }
      _addUpdateLog('npm run build 완료 ✅')

      // ── 4. pm2 restart ────────────────────────────────────────
      _updateState.message = '서버 재시작 중... 잠시 후 페이지를 새로고침하세요'
      _addUpdateLog('pm2 restart safetynote 실행...')

      setTimeout(async () => {
        const restartRes = await runCmd('pm2', ['restart', 'safetynote'], cwd, 15000)
        if (restartRes.code === 0) {
          _addUpdateLog('pm2 restart 완료 ✅')
          _updateState.status  = 'done'
          _updateState.message = `롤백 완료! (${_updateState.currentCommit})`
        } else {
          _addUpdateLog(`pm2 restart 실패: ${restartRes.stderr.trim()}`)
          _updateState.status  = 'error'
          _updateState.message = `서버 재시작 실패: ${restartRes.stderr.trim().slice(0, 80)}`
        }
      }, 1000)

    } catch (e: any) {
      _addUpdateLog(`롤백 오류: ${e.message}`)
      _updateState.status  = 'error'
      _updateState.message = `오류: ${e.message}`
    }
  })()

  return c.json({ ok: true, message: '롤백 시작됨' })
})

// ─── POST /api/admin/update/restore-db — FEAT-053 롤백: DB 백업 복원 ────────────
// body: { confirm_password, filename }
// 동작: backups/{filename} → data/safety.db 복사 후 pm2 restart
app.post('/update/restore-db', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  if (_updateState.status === 'pulling' || _updateState.status === 'restarting')
    return c.json({ error: '업데이트/롤백 진행 중입니다.' }, 409)

  const rawDb = getRawDb()
  const body = await c.req.json().catch(() => ({})) as any
  const { confirm_password, filename } = body

  // 파일명 보안 검증 (경로 탐색 방지 — 파일명에 / \ .. 포함 불허)
  if (!filename || typeof filename !== 'string' ||
      /[/\\]/.test(filename) || !filename.endsWith('.db')) {
    return c.json({ error: '유효하지 않은 파일명입니다.' }, 400)
  }

  const userRow = rawDb.prepare(`SELECT password_hash FROM users WHERE id=?`).get(user.id) as any
  if (!userRow || !confirm_password || userRow.password_hash !== String(confirm_password))
    return c.json({ error: '비밀번호가 올바르지 않습니다.' }, 403)

  const cwd        = process.cwd()
  const backupDir  = join(cwd, 'backups')
  const srcPath    = join(backupDir, filename)
  const dbDest     = String(process.env.DB_PATH || join(cwd, 'data/safety.db'))

  if (!existsSync(srcPath))
    return c.json({ error: `백업 파일을 찾을 수 없습니다: ${filename}` }, 404)

  _updateState.status  = 'restarting'
  _updateState.message = `DB 복원 중: ${filename}`
  _updateState.log     = []
  _addUpdateLog(`DB 복원 시작: ${filename} → ${dbDest}`)

  ;(async () => {
    try {
      // ── 현재 DB 백업 (복원 전 안전망) ─────────────────────────
      const stamp      = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')
      const preSavePath = join(backupDir, `safety_${stamp}_before_restore.db`)
      if (existsSync(dbDest)) {
        const preCp = await runCmd('cp', [dbDest, preSavePath], cwd, 10000)
        _addUpdateLog(
          preCp.code === 0
            ? `현재 DB 임시 저장: safety_${stamp}_before_restore.db`
            : `현재 DB 임시 저장 실패(무시): ${preCp.stderr.trim()}`
        )
      }

      // ── 백업 파일 → DB 경로 복사 ──────────────────────────────
      const cpRes = await runCmd('cp', [srcPath, dbDest], cwd, 15000)
      if (cpRes.code !== 0) {
        _addUpdateLog(`DB 복사 실패: ${cpRes.stderr.trim()}`)
        _updateState.status  = 'error'
        _updateState.message = `DB 복원 실패: ${cpRes.stderr.trim().slice(0, 100)}`
        return
      }
      _addUpdateLog('DB 파일 복사 완료 ✅')

      // ── pm2 restart ───────────────────────────────────────────
      _addUpdateLog('pm2 restart safetynote 실행...')
      setTimeout(async () => {
        const restartRes = await runCmd('pm2', ['restart', 'safetynote'], cwd, 15000)
        if (restartRes.code === 0) {
          _addUpdateLog('pm2 restart 완료 ✅')
          _updateState.status  = 'done'
          _updateState.message = `DB 복원 완료! 서버가 재시작됩니다.`
        } else {
          _addUpdateLog(`pm2 restart 실패: ${restartRes.stderr.trim()}`)
          _updateState.status  = 'error'
          _updateState.message = `서버 재시작 실패: ${restartRes.stderr.trim().slice(0, 80)}`
        }
      }, 1000)

    } catch (e: any) {
      _addUpdateLog(`DB 복원 오류: ${e.message}`)
      _updateState.status  = 'error'
      _updateState.message = `오류: ${e.message}`
    }
  })()

  return c.json({ ok: true, message: 'DB 복원 시작됨' })
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
