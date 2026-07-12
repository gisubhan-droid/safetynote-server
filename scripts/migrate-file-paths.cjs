#!/usr/bin/env node
/**
 * migrate-file-paths.js
 * ─────────────────────────────────────────────────────────────────────────────
 * FEAT-042 소급 적용 마이그레이션
 *
 * [목적]
 * FEAT-042 적용(2026-07-04) 이전에 저장된 파일들이 년도/월 폴더 없이
 * {루트}/{공사요청번호}_{공사명}/... 에 저장되어 있음.
 * 이를 올바른 경로 {루트}/{년도}/{월}/{공사요청번호}_{공사명}/... 로 이동.
 *
 * [대상 테이블]
 * 1. task_photos      — 작업사진(photo), TBM사진(tbm)
 * 2. inspection_photos — 현장점검 사진
 * 3. task_attachments  — 작업지시서(order), 기타(other) 첨부파일
 * 4. TBM PDF           — tbm_records 기준으로 파일시스템 직접 탐색
 *
 * [실행 방법]
 *   cd /volume1/safetynote
 *   node scripts/migrate-file-paths.js [--dry-run] [--db /path/to/db.sqlite] [--root /path/to/uploads]
 *
 * [옵션]
 *   --dry-run   실제 이동 없이 변경될 경로만 출력 (기본: false)
 *   --db        DB 파일 경로 (기본: .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite 자동 탐색)
 *   --root      업로드 루트 경로 (기본: ./public/uploads 또는 DB system_settings.upload_root_path)
 *
 * [안전 장치]
 * - dry-run 먼저 실행하여 예상 변경 목록 확인 권장
 * - 실제 이동 시: 파일 존재 확인 → 대상 폴더 생성 → 파일 복사 → 원본 삭제 → DB 업데이트
 * - DB 업데이트 실패 시: 이동된 파일 원복 시도
 * - 이미 올바른 경로에 있는 파일은 건너뜀
 * - 실패 항목은 migration-errors.log 에 기록
 */

'use strict'

const path = require('path')
const fs   = require('fs')
const os   = require('os')

// ─── CLI 파라미터 파싱 ──────────────────────────────────────────────────────
const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')

function getArg(name) {
  const idx = args.indexOf(name)
  return idx >= 0 ? args[idx + 1] : null
}

// ─── DB 경로 자동 탐색 ──────────────────────────────────────────────────────
function findDbPath() {
  const explicit = getArg('--db')
  if (explicit) return explicit

  // Wrangler D1 로컬 sqlite 자동 탐색
  const d1Dir = path.join(process.cwd(), '.wrangler', 'state', 'v3', 'd1')
  if (fs.existsSync(d1Dir)) {
    const entries = fs.readdirSync(d1Dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sub = path.join(d1Dir, entry.name)
        const files = fs.readdirSync(sub).filter(f => f.endsWith('.sqlite'))
        if (files.length > 0) return path.join(sub, files[0])
      }
    }
  }

  // NAS 실서버 경로 패턴 탐색
  const nasCandidates = [
    '/volume1/safetynote/data/safetynote.db',
    '/volume1/safetynote/safetynote.db',
    path.join(process.cwd(), 'data', 'safetynote.db'),
    path.join(process.cwd(), 'safetynote.db'),
  ]
  for (const p of nasCandidates) {
    if (fs.existsSync(p)) return p
  }

  throw new Error('DB 파일을 찾을 수 없습니다. --db 옵션으로 경로를 지정하세요.')
}

// ─── 업로드 루트 결정 ───────────────────────────────────────────────────────
function findUploadRoot(db) {
  const explicit = getArg('--root')
  if (explicit) return explicit.replace(/\/+$/, '')

  // DB system_settings 에서 upload_root_path 조회
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key='upload_root_path'").get()
    if (row && row.value && row.value.trim()) {
      return row.value.trim().replace(/\/+$/, '')
    }
  } catch (_) {}

  // 환경변수
  if (process.env.UPLOAD_PATH) return process.env.UPLOAD_PATH.replace(/\/+$/, '')

  // 기본값
  return path.join(process.cwd(), 'public', 'uploads')
}

// ─── 폴더명 유틸 (node-server.ts 와 동일 로직) ──────────────────────────────
function safeFsName(s) {
  return (s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim()
}

function fmtDateStr(d) {
  if (!d) return new Date().toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

const STAGE_DIRS = {
  order:      '01_작업지시서',
  tbm:        '02_TBM',
  photo:      '03_작업사진',
  inspection: '04_현장점검',
  other:      '05_기타',
}

const PHOTO_TYPE_DIRS = {
  before:     '01_작업 전',
  progress:   '02_작업 중',
  after:      '03_작업 후',
  hazard:     '04_위험 상황',
  tbm:        '05_TBM',
  completion: '06_완료',
}

function captionToFolderName(caption) {
  if (!caption || !caption.trim()) return null
  const cleaned = caption.trim()
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 40)
    .trimEnd()
  return cleaned || null
}

/**
 * 올바른 저장 경로 계산
 * task: { task_number, sub_task_number, work_date, planned_date,
 *         construction_type, con_request_no, con_title, con_created_at, team_name }
 */
function calcCorrectDir(root, task, stage, photoType, caption) {
  const hasConInfo = !!(task.con_request_no && task.con_title)
  const conFolder  = hasConInfo
    ? safeFsName(`${task.con_request_no}_${task.con_title}`)
    : '미분류'

  let yearFolder = '', monthFolder = ''
  if (hasConInfo && task.con_created_at) {
    const dt = new Date(task.con_created_at)
    if (!isNaN(dt.getTime())) {
      yearFolder  = String(dt.getFullYear())
      monthFolder = String(dt.getMonth() + 1).padStart(2, '0')
    }
  }

  const taskNum    = safeFsName(task.sub_task_number || task.task_number || 'UNKNOWN')
  const workDate   = fmtDateStr(task.work_date || task.planned_date)
  const workType   = safeFsName(task.construction_type || '작업')
  const teamSuffix = task.team_name ? `_[${safeFsName(task.team_name)}]` : ''
  const taskFolder = `${taskNum}_${workDate}_${workType}${teamSuffix}`
  const stageDir   = STAGE_DIRS[stage] || STAGE_DIRS.other

  const basePath = (yearFolder && monthFolder)
    ? path.join(root, yearFolder, monthFolder, conFolder)
    : path.join(root, conFolder)

  let dir = path.join(basePath, taskFolder, stageDir)
  if (stage === 'photo' && photoType && PHOTO_TYPE_DIRS[photoType]) {
    dir = path.join(dir, PHOTO_TYPE_DIRS[photoType])
    const captionFolder = captionToFolderName(caption)
    if (captionFolder) dir = path.join(dir, captionFolder)
  }
  return dir
}

// ─── 파일 이동 + DB 업데이트 ────────────────────────────────────────────────
function moveFile(oldPath, newPath, dryRun) {
  if (oldPath === newPath) return 'same'

  if (!fs.existsSync(oldPath)) return 'missing'

  if (dryRun) return 'would-move'

  try {
    fs.mkdirSync(path.dirname(newPath), { recursive: true })
    fs.copyFileSync(oldPath, newPath)
    fs.unlinkSync(oldPath)
    return 'moved'
  } catch (e) {
    return `error: ${e.message}`
  }
}

// ─── 통계 ────────────────────────────────────────────────────────────────────
const stats = {
  task_photos:      { total: 0, skipped: 0, moved: 0, missing: 0, error: 0 },
  inspection_photos:{ total: 0, skipped: 0, moved: 0, missing: 0, error: 0 },
  task_attachments: { total: 0, skipped: 0, moved: 0, missing: 0, error: 0 },
  tbm_pdf:          { total: 0, skipped: 0, moved: 0, missing: 0, error: 0 },
}
const errors = []

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=' .repeat(60))
  console.log('SafetyNote 파일 경로 마이그레이션 (FEAT-042 소급 적용)')
  console.log(DRY_RUN ? '*** DRY-RUN 모드 — 실제 변경 없음 ***' : '*** 실제 이동 모드 ***')
  console.log('=' .repeat(60))

  // better-sqlite3 로드
  let Database
  try {
    Database = require('better-sqlite3')
  } catch (e) {
    // NAS 경로에서 require
    try {
      Database = require('/volume1/safetynote/node_modules/better-sqlite3')
    } catch (e2) {
      console.error('better-sqlite3 를 찾을 수 없습니다:', e2.message)
      process.exit(1)
    }
  }

  const dbPath = findDbPath()
  console.log(`\n[DB] ${dbPath}`)

  const db = new Database(dbPath, { readonly: DRY_RUN })
  const uploadRoot = findUploadRoot(db)
  console.log(`[루트] ${uploadRoot}`)
  console.log()

  // ── 1. task_photos 마이그레이션 ─────────────────────────────────────────
  console.log('[ 1/4 ] task_photos 처리 중...')
  migrateTaskPhotos(db, uploadRoot)

  // ── 2. inspection_photos 마이그레이션 ───────────────────────────────────
  console.log('[ 2/4 ] inspection_photos 처리 중...')
  migrateInspectionPhotos(db, uploadRoot)

  // ── 3. task_attachments 마이그레이션 ────────────────────────────────────
  console.log('[ 3/4 ] task_attachments 처리 중...')
  migrateTaskAttachments(db, uploadRoot)

  // ── 4. TBM PDF 파일시스템 탐색 이동 ────────────────────────────────────
  console.log('[ 4/4 ] TBM PDF 처리 중...')
  migrateTbmPdf(db, uploadRoot)

  db.close()

  // ── 결과 요약 ────────────────────────────────────────────────────────────
  console.log()
  console.log('=' .repeat(60))
  console.log('마이그레이션 결과 요약')
  console.log('=' .repeat(60))
  for (const [tbl, s] of Object.entries(stats)) {
    console.log(`  ${tbl.padEnd(22)} 전체:${s.total} 이동:${s.moved} 건너뜀:${s.skipped} 파일없음:${s.missing} 오류:${s.error}`)
  }

  if (errors.length > 0) {
    const logPath = path.join(process.cwd(), 'migration-errors.log')
    fs.writeFileSync(logPath, errors.join('\n') + '\n')
    console.log(`\n[!] 오류 ${errors.length}건 → ${logPath}`)
  }

  if (DRY_RUN) {
    console.log('\n*** DRY-RUN 완료. 실제 이동하려면 --dry-run 없이 재실행하세요. ***')
  } else {
    console.log('\n✅ 마이그레이션 완료')
    console.log('   - pm2 restart safetynote 권장 (경로 캐시 초기화)')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. task_photos
// ─────────────────────────────────────────────────────────────────────────────
function migrateTaskPhotos(db, root) {
  const rows = db.prepare(`
    SELECT tp.id, tp.file_path, tp.photo_type, tp.caption,
           t.task_number, t.sub_task_number, t.work_date, t.planned_date,
           t.construction_type,
           c.request_no AS con_request_no, c.title AS con_title,
           c.created_at AS con_created_at,
           tm.name AS team_name
    FROM task_photos tp
    LEFT JOIN tasks        t  ON t.id  = tp.task_id
    LEFT JOIN constructions c  ON c.id  = t.construction_id
    LEFT JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = tp.uploader_id
    LEFT JOIN users        wu ON wu.id  = ta.worker_id
    LEFT JOIN teams        tm ON tm.id  = wu.team_id
    WHERE tp.file_path IS NOT NULL AND tp.file_path != ''
    ORDER BY tp.id
  `).all()

  const s = stats.task_photos
  s.total = rows.length

  for (const row of rows) {
    const oldPath = row.file_path
    const fileName = path.basename(oldPath)

    // photo_type → stage 결정
    let stage = 'photo'
    if (row.photo_type === 'tbm') stage = 'tbm'

    const taskInfo = {
      task_number:        row.task_number,
      sub_task_number:    row.sub_task_number,
      work_date:          row.work_date,
      planned_date:       row.planned_date,
      construction_type:  row.construction_type,
      con_request_no:     row.con_request_no,
      con_title:          row.con_title,
      con_created_at:     row.con_created_at,
      team_name:          row.team_name,
    }

    const newDir  = calcCorrectDir(root, taskInfo, stage, row.photo_type, row.caption)
    const newPath = path.join(newDir, fileName)

    const result = moveFile(oldPath, newPath, DRY_RUN)

    if (result === 'same') { s.skipped++; continue }
    if (result === 'missing') {
      s.missing++
      const msg = `[task_photos] id=${row.id} 파일없음: ${oldPath}`
      console.log('  [SKIP-missing]', msg)
      errors.push(msg)
      continue
    }
    if (result.startsWith('error')) {
      s.error++
      const msg = `[task_photos] id=${row.id} ${result}: ${oldPath}`
      console.log('  [ERROR]', msg)
      errors.push(msg)
      continue
    }

    // would-move or moved → 로그 출력
    console.log(`  [${result.toUpperCase()}] id=${row.id}`)
    console.log(`    이전: ${oldPath}`)
    console.log(`    이후: ${newPath}`)

    if (result === 'moved') {
      // DB 업데이트
      try {
        db.prepare(`UPDATE task_photos SET file_path = ? WHERE id = ?`).run(newPath, row.id)
        s.moved++
      } catch (e) {
        // DB 업데이트 실패 → 파일 원복
        try { fs.renameSync(newPath, oldPath) } catch (_) {}
        s.error++
        const msg = `[task_photos] id=${row.id} DB 업데이트 실패 (파일 원복): ${e.message}`
        console.log('  [ERROR]', msg)
        errors.push(msg)
      }
    } else {
      s.moved++ // dry-run 에서는 would-move 카운트
    }
  }

  console.log(`  → 완료: ${s.total}건 중 이동 ${s.moved}, 동일경로 ${s.skipped}, 파일없음 ${s.missing}, 오류 ${s.error}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. inspection_photos
// ─────────────────────────────────────────────────────────────────────────────
function migrateInspectionPhotos(db, root) {
  // inspection_photos 에는 uploaded_by 컬럼 없음
  // → site_inspections.inspector_id 로 팀명 조회
  const rows = db.prepare(`
    SELECT ip.id, ip.file_path, ip.caption,
           t.task_number, t.sub_task_number, t.work_date, t.planned_date,
           t.construction_type,
           c.request_no AS con_request_no, c.title AS con_title,
           c.created_at AS con_created_at,
           tm.name AS team_name
    FROM inspection_photos ip
    LEFT JOIN site_inspections si ON si.id = ip.inspection_id
    LEFT JOIN tasks            t  ON t.id  = si.task_id
    LEFT JOIN constructions    c  ON c.id  = t.construction_id
    LEFT JOIN users            u  ON u.id  = si.inspector_id
    LEFT JOIN teams            tm ON tm.id = u.team_id
    WHERE ip.file_path IS NOT NULL AND ip.file_path != ''
    ORDER BY ip.id
  `).all()

  const s = stats.inspection_photos
  s.total = rows.length

  for (const row of rows) {
    const oldPath = row.file_path
    const fileName = path.basename(oldPath)

    const taskInfo = {
      task_number:        row.task_number,
      sub_task_number:    row.sub_task_number,
      work_date:          row.work_date,
      planned_date:       row.planned_date,
      construction_type:  row.construction_type,
      con_request_no:     row.con_request_no,
      con_title:          row.con_title,
      con_created_at:     row.con_created_at,
      team_name:          row.team_name,
    }

    const newDir  = calcCorrectDir(root, taskInfo, 'inspection', null, null)
    const newPath = path.join(newDir, fileName)

    const result = moveFile(oldPath, newPath, DRY_RUN)

    if (result === 'same') { s.skipped++; continue }
    if (result === 'missing') {
      s.missing++
      const msg = `[inspection_photos] id=${row.id} 파일없음: ${oldPath}`
      console.log('  [SKIP-missing]', msg)
      errors.push(msg)
      continue
    }
    if (result.startsWith('error')) {
      s.error++
      const msg = `[inspection_photos] id=${row.id} ${result}: ${oldPath}`
      console.log('  [ERROR]', msg)
      errors.push(msg)
      continue
    }

    console.log(`  [${result.toUpperCase()}] id=${row.id}`)
    console.log(`    이전: ${oldPath}`)
    console.log(`    이후: ${newPath}`)

    if (result === 'moved') {
      try {
        db.prepare(`UPDATE inspection_photos SET file_path = ? WHERE id = ?`).run(newPath, row.id)
        s.moved++
      } catch (e) {
        try { fs.renameSync(newPath, oldPath) } catch (_) {}
        s.error++
        const msg = `[inspection_photos] id=${row.id} DB 업데이트 실패: ${e.message}`
        console.log('  [ERROR]', msg)
        errors.push(msg)
      }
    } else {
      s.moved++
    }
  }

  console.log(`  → 완료: ${s.total}건 중 이동 ${s.moved}, 동일경로 ${s.skipped}, 파일없음 ${s.missing}, 오류 ${s.error}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. task_attachments
// ─────────────────────────────────────────────────────────────────────────────
function migrateTaskAttachments(db, root) {
  // attachment_type → stage 매핑 (node-server.ts 4847라인 기준)
  // task_attachments 의 실제 컬럼명은 attach_type (attachments-nas.ts INSERT 참조)
  const typeToStage = {
    order:      'order',
    work_order: 'order',
    tbm:        'tbm',
    photo:      'photo',
    inspection: 'inspection',
    other:      'other',
  }

  const rows = db.prepare(`
    SELECT ta.id, ta.file_path, ta.attach_type,
           t.task_number, t.sub_task_number, t.work_date, t.planned_date,
           t.construction_type,
           c.request_no AS con_request_no, c.title AS con_title,
           c.created_at AS con_created_at,
           tm.name AS team_name
    FROM task_attachments ta
    LEFT JOIN tasks        t  ON t.id  = ta.task_id
    LEFT JOIN constructions c  ON c.id  = t.construction_id
    LEFT JOIN users         u  ON u.id  = ta.uploader_id
    LEFT JOIN teams         tm ON tm.id = u.team_id
    WHERE ta.file_path IS NOT NULL AND ta.file_path != ''
    ORDER BY ta.id
  `).all()

  const s = stats.task_attachments
  s.total = rows.length

  for (const row of rows) {
    const oldPath = row.file_path
    const fileName = path.basename(oldPath)

    const stage = typeToStage[row.attach_type] || 'other'

    const taskInfo = {
      task_number:        row.task_number,
      sub_task_number:    row.sub_task_number,
      work_date:          row.work_date,
      planned_date:       row.planned_date,
      construction_type:  row.construction_type,
      con_request_no:     row.con_request_no,
      con_title:          row.con_title,
      con_created_at:     row.con_created_at,
      team_name:          row.team_name,
    }

    const newDir  = calcCorrectDir(root, taskInfo, stage, null, null)
    const newPath = path.join(newDir, fileName)

    const result = moveFile(oldPath, newPath, DRY_RUN)

    if (result === 'same') { s.skipped++; continue }
    if (result === 'missing') {
      s.missing++
      const msg = `[task_attachments] id=${row.id} 파일없음: ${oldPath}`
      console.log('  [SKIP-missing]', msg)
      errors.push(msg)
      continue
    }
    if (result.startsWith('error')) {
      s.error++
      const msg = `[task_attachments] id=${row.id} ${result}: ${oldPath}`
      console.log('  [ERROR]', msg)
      errors.push(msg)
      continue
    }

    console.log(`  [${result.toUpperCase()}] id=${row.id}`)
    console.log(`    이전: ${oldPath}`)
    console.log(`    이후: ${newPath}`)

    if (result === 'moved') {
      try {
        db.prepare(`UPDATE task_attachments SET file_path = ? WHERE id = ?`).run(newPath, row.id)
        s.moved++
      } catch (e) {
        try { fs.renameSync(newPath, oldPath) } catch (_) {}
        s.error++
        const msg = `[task_attachments] id=${row.id} DB 업데이트 실패: ${e.message}`
        console.log('  [ERROR]', msg)
        errors.push(msg)
      }
    } else {
      s.moved++
    }
  }

  console.log(`  → 완료: ${s.total}건 중 이동 ${s.moved}, 동일경로 ${s.skipped}, 파일없음 ${s.missing}, 오류 ${s.error}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TBM PDF — DB에 경로 없음, 파일시스템 탐색 후 이동
//    패턴: {root}/*/02_TBM/TBM결과보고_*.pdf  (년도/월 없는 구버전)
//    또는: {root}/*/*/02_TBM/TBM결과보고_*.pdf (이미 올바른 경로)
// ─────────────────────────────────────────────────────────────────────────────
function migrateTbmPdf(db, root) {
  const s = stats.tbm_pdf

  // DB에서 tbm_records → task → construction 정보 가져오기
  const tbmRows = db.prepare(`
    SELECT tr.id AS tbm_id,
           t.task_number, t.sub_task_number, t.work_date, t.planned_date,
           t.construction_type,
           c.request_no AS con_request_no, c.title AS con_title,
           c.created_at AS con_created_at,
           tm.name AS team_name
    FROM tbm_records tr
    LEFT JOIN tasks        t  ON t.id  = tr.task_id
    LEFT JOIN constructions c  ON c.id  = t.construction_id
    LEFT JOIN users         u  ON u.id  = tr.conductor_id
    LEFT JOIN teams         tm ON tm.id = u.team_id
    ORDER BY tr.id
  `).all()

  if (!fs.existsSync(root)) {
    console.log('  [SKIP] 업로드 루트 폴더 없음:', root)
    return
  }

  // {root}/**/{conFolder}/{taskFolder}/02_TBM/TBM결과보고_*.pdf 탐색
  // 년도/월 없는 구버전 경로에 있는 PDF만 처리
  for (const row of tbmRows) {
    const taskInfo = {
      task_number:        row.task_number,
      sub_task_number:    row.sub_task_number,
      work_date:          row.work_date,
      planned_date:       row.planned_date,
      construction_type:  row.construction_type,
      con_request_no:     row.con_request_no,
      con_title:          row.con_title,
      con_created_at:     row.con_created_at,
      team_name:          row.team_name,
    }

    // 올바른 경로 계산
    const correctDir = calcCorrectDir(root, taskInfo, 'tbm', null, null)

    // 구버전 경로 계산 (con_created_at 제거)
    const taskInfoOld = { ...taskInfo, con_created_at: null }
    const oldDir = calcCorrectDir(root, taskInfoOld, 'tbm', null, null)

    if (oldDir === correctDir) continue // 년도/월 없는 공사이거나 이미 올바른 경로

    // 구버전 폴더에 PDF 파일 탐색
    if (!fs.existsSync(oldDir)) continue

    const pdfFiles = fs.readdirSync(oldDir).filter(f => f.endsWith('.pdf') && f.startsWith('TBM결과보고_'))
    s.total += pdfFiles.length

    for (const pdfFile of pdfFiles) {
      const oldPath = path.join(oldDir, pdfFile)
      const newPath = path.join(correctDir, pdfFile)

      const result = moveFile(oldPath, newPath, DRY_RUN)

      if (result === 'same') { s.skipped++; continue }
      if (result === 'missing') {
        s.missing++
        errors.push(`[tbm_pdf] tbm_id=${row.tbm_id} 파일없음: ${oldPath}`)
        continue
      }
      if (result.startsWith('error')) {
        s.error++
        const msg = `[tbm_pdf] tbm_id=${row.tbm_id} ${result}: ${oldPath}`
        console.log('  [ERROR]', msg)
        errors.push(msg)
        continue
      }

      console.log(`  [${result.toUpperCase()}] tbm_id=${row.tbm_id}`)
      console.log(`    이전: ${oldPath}`)
      console.log(`    이후: ${newPath}`)
      s.moved++
    }
  }

  // 집계에 포함 안 된 고아 PDF (tbm_records 없이 파일만 존재하는 경우) — 정보성 출력
  console.log(`  → 완료: ${s.total}건 중 이동 ${s.moved}, 동일경로 ${s.skipped}, 파일없음 ${s.missing}, 오류 ${s.error}`)
}

// ─── 실행 ────────────────────────────────────────────────────────────────────
main().catch(e => {
  console.error('\n[FATAL]', e.message)
  process.exit(1)
})
