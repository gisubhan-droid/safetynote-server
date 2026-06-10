import { Hono } from 'hono'
import { getUser, buildStoragePath, type StageKey } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// Node.js fs/path 동적 import
async function getFs() {
  // @ts-ignore
  const fs   = await import('node:fs/promises')
  // @ts-ignore
  const path = await import('node:path')
  return { fs, path }
}

// 고유 파일명 생성
function generateFileName(originalName: string): string {
  const ext  = originalName.split('.').pop()?.toLowerCase() || 'bin'
  const ts   = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  return `${ts}_${rand}.${ext}`
}

// attach_type → StageKey 매핑
function toStageKey(attachType: string): StageKey {
  if (attachType === 'tbm')        return 'tbm'
  if (attachType === 'photo')      return 'photo'
  if (attachType === 'inspection') return 'inspection'
  if (attachType === 'order')      return 'order'
  return 'other'
}

// ─── 목록 조회 ────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const { task_id, attach_type } = c.req.query()
  if (!task_id) return c.json({ error: 'task_id 필요' }, 400)

  let query: string
  let bindings: any[]

  if (attach_type) {
    query = `SELECT ta.*, u.name as uploader_name
     FROM task_attachments ta
     LEFT JOIN users u ON u.id = ta.uploader_id
     WHERE ta.task_id = ? AND ta.attach_type = ?
     ORDER BY ta.created_at DESC`
    bindings = [task_id, attach_type]
  } else {
    query = `SELECT ta.*, u.name as uploader_name
     FROM task_attachments ta
     LEFT JOIN users u ON u.id = ta.uploader_id
     WHERE ta.task_id = ?
     ORDER BY ta.created_at DESC`
    bindings = [task_id]
  }

  const result = await c.env.DB.prepare(query).bind(...bindings).all<any>()

  return c.json(result.results || [])
})

// ─── 파일 다운로드/미리보기 ──────────────────────────────────────────────────
app.get('/:id/download', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  const att = await c.env.DB.prepare(
    'SELECT file_path, file_name, mime_type FROM task_attachments WHERE id = ?'
  ).bind(id).first<any>()
  if (!att) return c.json({ error: '첨부파일 없음' }, 404)

  try {
    const { fs } = await getFs()
    const buf = await fs.readFile(att.file_path)
    const inline = att.mime_type?.startsWith('image/') || att.mime_type === 'application/pdf'
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

// ─── 업로드 (multipart/form-data) ─────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const contentType = c.req.header('Content-Type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'multipart/form-data 필요' }, 400)
  }

  try {
    const formData   = await c.req.formData()
    const taskId     = formData.get('task_id') as string
    const attachType = (formData.get('attach_type') as string) || 'order'
    const description = (formData.get('description') as string) || ''
    const files      = formData.getAll('files') as File[]

    if (!taskId) return c.json({ error: 'task_id 필요' }, 400)
    if (!files || files.length === 0) return c.json({ error: '파일 없음' }, 400)

    // ── 시스템 설정 조회 — 공통값 + 단계별 오버라이드 값 모두 로드 ──────────
    const settRows = await c.env.DB.prepare(
      `SELECT key, value FROM system_settings WHERE key LIKE 'attach_%' OR key = 'upload_root_path'`
    ).all<any>()
    const sv: Record<string, string> = {}
    for (const r of (settRows.results || [])) sv[r.key] = r.value

    // attachType → stage 매핑 (설정 키 접두사로 사용)
    const attachStageMap: Record<string, string> = {
      order: 'order', work_order: 'order',
      tbm: 'tbm',
      photo: 'photo', progress: 'photo',
      inspection: 'inspection',
      work_log: 'other',
    }
    const attachStage = attachStageMap[attachType] || 'other'

    // 단계별 설정 우선, 없으면 공통값 fallback
    const defMaxMb   = parseInt(sv.attach_max_mb  || '20')
    const defTotalMb = parseInt(sv.attach_total_mb || '200')
    const defExt     = sv.attach_allowed_ext || 'pdf,doc,docx,xls,xlsx,ppt,pptx,hwp,txt,jpg,jpeg,png,gif,webp,heic,mp4,zip'

    const maxMb      = parseInt(sv[`attach_${attachStage}_max_mb`]  || '') || defMaxMb
    const totalMb    = parseInt(sv[`attach_${attachStage}_total_mb`] || '') || defTotalMb
    const allowedExt = (sv[`attach_${attachStage}_allowed_ext`] || defExt)
                         .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
    const uploadRoot = sv.upload_root_path || './public/uploads'

    // ── 작업 + 연결된 공사 정보 조회 ──────────────────────────────────────
    const task = await c.env.DB.prepare(
      `SELECT t.id, t.task_number, t.sub_task_number, t.work_date, t.planned_date,
              t.construction_type, t.construction_id,
              c.request_no  AS con_request_no,
              c.title       AS con_title
       FROM tasks t
       LEFT JOIN constructions c ON c.id = t.construction_id
       WHERE t.id = ?`
    ).bind(taskId).first<any>()
    if (!task) return c.json({ error: '작업 없음' }, 404)

    // ── 이미 저장된 총 용량 확인 ──────────────────────────────────────────
    const totalRow = await c.env.DB.prepare(
      'SELECT COALESCE(SUM(file_size),0) as total FROM task_attachments WHERE task_id = ?'
    ).bind(taskId).first<any>()
    let usedBytes = totalRow?.total || 0

    // ── 저장 폴더 결정 (공사요청번호_공사명 / 서브번호_작업일_작업종류 / 단계) ─
    const { fs } = await getFs()
    const taskNum   = task.sub_task_number || task.task_number
    const workDate  = task.work_date || task.planned_date
    const pathInfo  = buildStoragePath({
      uploadRoot,
      conRequestNo: task.con_request_no,
      conTitle:     task.con_title,
      taskNumber:   taskNum,
      workDate,
      workType:     task.construction_type,
      stage:        toStageKey(attachStage),
    })
    await fs.mkdir(pathInfo.uploadDir, { recursive: true })

    const savedIds: number[] = []
    const errors: string[]   = []

    for (const file of files) {
      if (!file || typeof file === 'string') continue

      // 확장자 검사
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      if (allowedExt.length && !allowedExt.includes(ext)) {
        errors.push(`${file.name}: 허용되지 않는 파일 형식 (.${ext})`)
        continue
      }

      // 개별 파일 용량 검사
      if (file.size > maxMb * 1024 * 1024) {
        errors.push(`${file.name}: 파일 크기 초과 (최대 ${maxMb}MB)`)
        continue
      }

      // 총 용량 검사
      if (usedBytes + file.size > totalMb * 1024 * 1024) {
        errors.push(`${file.name}: 작업 총 첨부 용량 초과 (최대 ${totalMb}MB)`)
        continue
      }

      // 저장
      const savedName = generateFileName(file.name)
      const filePath  = `${pathInfo.uploadDir}/${savedName}`
      const buf       = await file.arrayBuffer()
      await fs.writeFile(filePath, Buffer.from(buf))

      const mimeType = file.type || 'application/octet-stream'

      const result = await c.env.DB.prepare(
        `INSERT INTO task_attachments (task_id, uploader_id, file_name, file_path, file_size, mime_type, attach_type, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        Number(taskId), user.id,
        file.name, filePath, file.size,
        mimeType, attachType, description
      ).run()

      savedIds.push(result.meta.last_row_id as number)
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

// ─── 삭제 ────────────────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  const att = await c.env.DB.prepare(
    'SELECT uploader_id, file_path FROM task_attachments WHERE id = ?'
  ).bind(id).first<any>()
  if (!att) return c.json({ error: '첨부파일 없음' }, 404)

  // 본인 또는 관리자/감독자만 삭제
  if (user.role === 'worker' && att.uploader_id !== user.id) {
    return c.json({ error: '권한 없음' }, 403)
  }

  // 파일 삭제
  if (att.file_path) {
    try {
      const { fs } = await getFs()
      await fs.unlink(att.file_path)
    } catch (_) {}
  }

  await c.env.DB.prepare('DELETE FROM task_attachments WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
