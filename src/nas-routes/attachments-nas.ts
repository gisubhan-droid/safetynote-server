/**
 * attachments-nas.ts — 첨부파일 API (NAS 전용)
 *
 * 포함 라우트 (4개):
 *   GET    /api/attachments
 *   GET    /api/attachments/:id/download
 *   POST   /api/attachments
 *   DELETE /api/attachments/:id
 *
 * 의존:
 *   - getRawDb(), getDB(), getUser(), getSetting(), getUploadRootNow() from ../nas-db
 *   - existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync from node:fs
 *
 * 참고:
 *   - POST /api/attachments 는 DB.prepare().bind().all() (D1 래퍼) 사용
 *     — task/system_settings 조회는 D1 래퍼로도 무방 (읽기 전용)
 *     — INSERT는 rawDb 동기로 처리 (BUG-025 방지)
 */

import { Hono } from 'hono'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getRawDb, getDB, getUser, getSetting, getUploadRootNow } from '../nas-db'

const app = new Hono()

// ─── 내부 헬퍼 함수들 ────────────────────────────────────────────────────────

/** 파일시스템 안전 문자열 변환 */
function safeFsName(s: string): string {
  return (s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim()
}

/** 날짜 문자열 포맷 (YYYY-MM-DD) */
function fmtDateStr(d: string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

/** caption을 폴더명으로 변환 */
function captionToFolderName(caption: string | null | undefined): string | null {
  if (!caption || !caption.trim()) return null
  const cleaned = caption.trim()
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 40)
    .trimEnd()
  return cleaned || null
}

/** 단계별 폴더명 매핑 */
const STAGE_DIRS: Record<string, string> = {
  order:      '01_작업지시서',
  tbm:        '02_TBM',
  photo:      '03_작업사진',
  inspection: '04_현장점검',
  other:      '05_기타',
}

/** 고유 파일명 생성 */
function genAttachFileName(originalName: string): string {
  const ext  = originalName.split('.').pop()?.toLowerCase() || 'bin'
  const ts   = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  return `${ts}_${rand}.${ext}`
}

/**
 * 파일 저장 폴더 반환 — 없으면 자동 생성
 * 공사 연결 시: {root}/{년도}/{월}/{conFolder}/{taskFolder}/{stageDir}
 * 미연결 시:    {root}/미분류/{taskFolder}/{stageDir}
 */
function getUploadDir(
  task: {
    task_number?: string | null; sub_task_number?: string | null
    work_date?: string | null;   planned_date?: string | null
    construction_type?: string | null
    con_request_no?: string | null; con_title?: string | null
    con_created_at?: string | null
  } | string,
  stage: string = 'photo'
): string {
  const root = getUploadRootNow()

  if (typeof task === 'string') {
    const stageDir = STAGE_DIRS[stage] || STAGE_DIRS.other
    const dir = join(root, '미분류', safeFsName(task), stageDir)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  const hasConInfo = !!(task.con_request_no && task.con_title)
  const conFolder  = hasConInfo
    ? safeFsName(`${task.con_request_no}_${task.con_title}`)
    : '미분류'

  // 년도/월 폴더: 공사 등록일(con_created_at) 기준
  let yearFolder  = ''
  let monthFolder = ''
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
  const taskFolder = `${taskNum}_${workDate}_${workType}`
  const stageDir   = STAGE_DIRS[stage] || STAGE_DIRS.other

  const basePath = (yearFolder && monthFolder)
    ? join(root, yearFolder, monthFolder, conFolder)
    : join(root, conFolder)
  const dir = join(basePath, taskFolder, stageDir)
  mkdirSync(dir, { recursive: true })
  return dir
}

// ─── GET /api/attachments?task_id=X ─────────────────────────────────────────
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { task_id } = c.req.query()
  if (!task_id) return c.json({ error: 'task_id 필요' }, 400)
  const DB     = getDB()
  const result = await DB.prepare(
    `SELECT ta.*, u.name as uploader_name
     FROM task_attachments ta
     LEFT JOIN users u ON u.id = ta.uploader_id
     WHERE ta.task_id = ?
     ORDER BY ta.created_at DESC`
  ).bind(task_id).all()
  return c.json(result.results || [])
})

// ─── GET /api/attachments/:id/download ──────────────────────────────────────
app.get('/:id/download', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const DB  = getDB()
  const id  = c.req.param('id')
  const att = await DB.prepare(
    'SELECT file_path, file_name, mime_type FROM task_attachments WHERE id = ?'
  ).bind(id).first()
  if (!att) return c.json({ error: '첨부파일 없음' }, 404)
  try {
    const buf    = readFileSync(att.file_path)
    const inline = (att.mime_type || '').startsWith('image/') || att.mime_type === 'application/pdf'
    return new Response(buf, {
      headers: {
        'Content-Type': att.mime_type || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(att.file_name)}`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (_) {
    return c.json({ error: '파일을 찾을 수 없습니다.' }, 404)
  }
})

// ─── POST /api/attachments (업로드) ──────────────────────────────────────────
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const contentType = c.req.header('Content-Type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'multipart/form-data 필요' }, 400)
  }

  try {
    const DB           = getDB()
    const rawDb        = getRawDb()
    const formData     = await c.req.formData()
    const taskId       = formData.get('task_id') as string
    const attachType   = (formData.get('attach_type') as string) || 'order'
    const description  = (formData.get('description') as string) || ''
    const files        = formData.getAll('files') as File[]

    if (!taskId) return c.json({ error: 'task_id 필요' }, 400)
    if (!files || files.length === 0) return c.json({ error: '파일 없음' }, 400)

    // 시스템 설정 조회
    const settRows = await DB.prepare(
      `SELECT key, value FROM system_settings WHERE key LIKE 'attach_%'`
    ).all()
    const sv: Record<string, string> = {}
    for (const r of (settRows.results || [])) sv[r.key] = r.value

    const attachStageMap: Record<string, string> = {
      order: 'order', work_order: 'order',
      tbm: 'tbm',
      photo: 'photo', progress: 'photo',
      inspection: 'inspection',
    }
    const attachStage = attachStageMap[attachType] || 'other'

    const defMaxMb   = parseInt(sv.attach_max_mb   || '20')
    const defTotalMb = parseInt(sv.attach_total_mb  || '200')
    const defExt     = sv.attach_allowed_ext || 'pdf,doc,docx,xls,xlsx,ppt,pptx,hwp,txt,jpg,jpeg,png,gif,webp,heic,mp4,zip'

    const maxMb      = parseInt(sv[`attach_${attachStage}_max_mb`]  || '') || defMaxMb
    const totalMb    = parseInt(sv[`attach_${attachStage}_total_mb`] || '') || defTotalMb
    const allowedExt = (sv[`attach_${attachStage}_allowed_ext`] || defExt)
                         .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)

    // 작업 정보 조회 (D1 래퍼 — 읽기 전용 OK)
    const task = await DB.prepare(
      `SELECT t.id, t.task_number, t.sub_task_number, t.planned_date, t.work_date,
              t.construction_type, t.construction_id,
              c.request_no AS con_request_no, c.title AS con_title,
              c.created_at AS con_created_at
       FROM tasks t LEFT JOIN constructions c ON c.id = t.construction_id
       WHERE t.id = ?`
    ).bind(taskId).first()
    if (!task) return c.json({ error: '작업 없음' }, 404)

    // 현재 총 용량
    const totalRow = await DB.prepare(
      'SELECT COALESCE(SUM(file_size),0) as total FROM task_attachments WHERE task_id = ?'
    ).bind(taskId).first()
    let usedBytes = totalRow?.total || 0

    const uploadDir = getUploadDir(task, attachStage)
    mkdirSync(uploadDir, { recursive: true })

    const savedIds: number[] = []
    const errors: string[]   = []

    for (const file of files) {
      if (!file || typeof file === 'string') continue

      const ext = (file.name.split('.').pop() || '').toLowerCase()
      if (allowedExt.length && !allowedExt.includes(ext)) {
        errors.push(`${file.name}: 허용되지 않는 파일 형식 (.${ext})`)
        continue
      }
      if (file.size > maxMb * 1024 * 1024) {
        errors.push(`${file.name}: 파일 크기 초과 (최대 ${maxMb}MB)`)
        continue
      }
      if (usedBytes + file.size > totalMb * 1024 * 1024) {
        errors.push(`${file.name}: 작업 총 첨부 용량 초과 (최대 ${totalMb}MB)`)
        continue
      }

      const savedName = genAttachFileName(file.name)
      const filePath  = join(uploadDir, savedName)
      const buf       = await file.arrayBuffer()
      writeFileSync(filePath, Buffer.from(buf))

      const mimeType = file.type || 'application/octet-stream'
      // ⚠️ INSERT는 rawDb 동기 사용 (BUG-025 방지: D1 래퍼 비동기 미반영 문제)
      const result = rawDb.prepare(
        `INSERT INTO task_attachments (task_id, uploader_id, file_name, file_path, file_size, mime_type, attach_type, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(Number(taskId), user.id, file.name, filePath, file.size, mimeType, attachType, description)

      savedIds.push(result.lastInsertRowid as number)
      usedBytes += file.size
    }

    if (savedIds.length === 0 && errors.length > 0) {
      return c.json({ error: errors.join(' / ') }, 400)
    }
    return c.json({ success: true, ids: savedIds, count: savedIds.length, errors })

  } catch (e: any) {
    console.error('[첨부] 업로드 오류:', e)
    return c.json({ error: `업로드 실패: ${e.message}` }, 500)
  }
})

// ─── DELETE /api/attachments/:id ─────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const DB  = getDB()
  const id  = c.req.param('id')

  const att = await DB.prepare(
    'SELECT uploader_id, file_path FROM task_attachments WHERE id = ?'
  ).bind(id).first()
  if (!att) return c.json({ error: '첨부파일 없음' }, 404)

  if (user.role === 'worker' && att.uploader_id !== user.id) {
    return c.json({ error: '권한 없음' }, 403)
  }

  if (att.file_path) {
    try { unlinkSync(att.file_path) } catch (_) {}
  }
  // ⚠️ DELETE는 rawDb 동기 사용
  const rawDb = getRawDb()
  rawDb.prepare('DELETE FROM task_attachments WHERE id = ?').run(Number(id))

  return c.json({ success: true })
})

export default app
