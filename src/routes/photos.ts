import { Hono } from 'hono'
import { getUser, buildStoragePath, type StageKey } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// Node.js fs 동적 import (Cloudflare Workers 런타임에서는 nodejs_compat 필요)
async function getFs() {
  // @ts-ignore
  const fs = await import('node:fs/promises')
  // @ts-ignore
  const path = await import('node:path')
  return { fs, path }
}

// 고유 파일명 생성
function generateFileName(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg'
  const ts = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  return `${ts}_${rand}.${ext}`
}

/** system_settings 에서 upload_root_path 조회 (없으면 기본값) */
async function getUploadRoot(db: D1Database): Promise<string> {
  try {
    const row = await db.prepare(
      `SELECT value FROM system_settings WHERE key = 'upload_root_path' LIMIT 1`
    ).first<any>()
    return row?.value || './public/uploads'
  } catch (_) {
    return './public/uploads'
  }
}

/** photo_type → StageKey 변환 */
function photoTypeToStage(photoType: string): StageKey {
  const map: Record<string, StageKey> = {
    tbm:        'tbm',
    tbm_photo:  'tbm',
    order:      'order',
    work_order: 'order',
    inspection: 'inspection',
    progress:   'photo',
    photo:      'photo',
  }
  return map[photoType] || 'photo'
}

/** task_id → task 행 (constructions JOIN) 조회 */
async function fetchTaskWithCon(db: D1Database, taskId: number) {
  return db.prepare(
    `SELECT t.id, t.task_number, t.sub_task_number, t.planned_date, t.work_date,
            t.construction_type, t.construction_id,
            c.request_no AS con_request_no, c.title AS con_title
     FROM tasks t LEFT JOIN constructions c ON c.id = t.construction_id
     WHERE t.id = ?`
  ).bind(taskId).first<any>()
}

// 사진 목록 조회
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { task_id, photo_type } = c.req.query()

  let q = `SELECT p.id, p.task_id, p.photo_type, p.file_name, p.file_path, p.file_size, p.mime_type,
    p.caption, p.taken_at, p.created_at, u.name as uploader_name
    FROM task_photos p LEFT JOIN users u ON u.id = p.uploader_id`
  const params: any[] = []
  const wheres: string[] = []
  if (task_id) { wheres.push('p.task_id = ?'); params.push(task_id) }
  if (photo_type) { wheres.push('p.photo_type = ?'); params.push(photo_type) }
  if (wheres.length) q += ' WHERE ' + wheres.join(' AND ')
  q += ' ORDER BY p.created_at DESC'

  const result = await c.env.DB.prepare(q).bind(...params).all<any>()
  return c.json(result.results || [])
})

// 사진 원본 파일 서빙 (file_path 기반)
app.get('/:id/img', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  const photo = await c.env.DB.prepare(
    'SELECT file_path, file_data, mime_type, file_name FROM task_photos WHERE id = ?'
  ).bind(id).first<any>()
  if (!photo) return c.json({ error: '사진 없음' }, 404)

  // 파일 기반 (신규)
  if (photo.file_path) {
    try {
      const { fs } = await getFs()
      const fileBuffer = await fs.readFile(photo.file_path)
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': photo.mime_type || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
          'Content-Disposition': `inline; filename="${photo.file_name}"`,
        },
      })
    } catch (_) {
      return c.json({ error: '파일을 찾을 수 없습니다.' }, 404)
    }
  }

  // 하위호환: base64 기반 (기존 데이터)
  if (photo.file_data) {
    const binary = atob(photo.file_data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': photo.mime_type || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }

  return c.json({ error: '사진 데이터 없음' }, 404)
})

// 사진 원본 데이터 조회 (JSON, 하위호환)
app.get('/:id/data', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const photo = await c.env.DB.prepare(
    'SELECT file_path, file_data, mime_type FROM task_photos WHERE id = ?'
  ).bind(id).first<any>()
  if (!photo) return c.json({ error: '사진 없음' }, 404)

  // 파일 기반이면 파일을 읽어 base64로 반환
  if (photo.file_path) {
    try {
      const { fs } = await getFs()
      const fileBuffer = await fs.readFile(photo.file_path)
      // Buffer to base64
      const b64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)))
      return c.json({ file_data: b64, mime_type: photo.mime_type })
    } catch (_) {
      return c.json({ error: '파일을 찾을 수 없습니다.' }, 404)
    }
  }

  return c.json({ file_data: photo.file_data, mime_type: photo.mime_type })
})

// 사진 업로드 (multipart/form-data — 원본 파일 그대로 저장)
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const contentType = c.req.header('Content-Type') || ''

  // ── multipart/form-data (원본 파일 업로드) ──────────────────────
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await c.req.formData()
      const taskId    = formData.get('task_id')
      const photoType = (formData.get('photo_type') as string) || 'progress'
      const caption   = (formData.get('caption')    as string) || ''
      const files     = formData.getAll('photos') as File[]

      if (!taskId) return c.json({ error: 'task_id 필요' }, 400)
      if (files.length === 0) return c.json({ error: '파일 없음' }, 400)

      // task + constructions 조회
      const task = await fetchTaskWithCon(c.env.DB, Number(taskId))
      if (!task) return c.json({ error: '작업을 찾을 수 없습니다' }, 404)

      // 업로드 루트 조회
      const uploadRoot = await getUploadRoot(c.env.DB)
      const stage = photoTypeToStage(photoType)

      const { fs, path } = await getFs()
      const savedIds: number[] = []

      for (const file of files) {
        if (!file || typeof file === 'string') continue

        const pathInfo = buildStoragePath({
          uploadRoot,
          conRequestNo: task.con_request_no,
          conTitle:     task.con_title,
          taskNumber:   task.sub_task_number || task.task_number,
          workDate:     task.work_date || task.planned_date,
          workType:     task.construction_type,
          stage,
        })
        await fs.mkdir(pathInfo.uploadDir, { recursive: true })

        const fileName = generateFileName(file.name || 'photo.jpg')
        const filePath = path.join(pathInfo.uploadDir, fileName)
        const arrayBuf = await file.arrayBuffer()
        await fs.writeFile(filePath, Buffer.from(arrayBuf))

        const result = await c.env.DB.prepare(
          `INSERT INTO task_photos
             (task_id, uploader_id, photo_type, file_name, file_path, file_data, file_size, mime_type, caption)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`
        ).bind(
          Number(taskId), user.id, photoType,
          file.name || fileName, filePath,
          file.size, file.type || 'image/jpeg', caption
        ).run()

        savedIds.push(result.meta.last_row_id as number)
      }

      return c.json({ success: true, ids: savedIds, count: savedIds.length })
    } catch (e: any) {
      console.error('파일 업로드 오류:', e)
      return c.json({ error: `업로드 실패: ${e.message}` }, 500)
    }
  }

  // ── application/json (base64 — 하위호환 유지) ──────────────────
  const body = await c.req.json()
  const { task_id, photo_type, file_name, file_data, file_size, mime_type, caption } = body
  if (!task_id || !file_data) return c.json({ error: '필수 항목 누락' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO task_photos
       (task_id, uploader_id, photo_type, file_name, file_path, file_data, file_size, mime_type, caption)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`
  ).bind(
    task_id, user.id, photo_type || 'progress',
    file_name || 'photo.jpg', file_data,
    file_size || 0, mime_type || 'image/jpeg', caption || ''
  ).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// 사진 삭제
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  const photo = await c.env.DB.prepare(
    'SELECT uploader_id, file_path FROM task_photos WHERE id = ?'
  ).bind(id).first<any>()
  if (!photo) return c.json({ error: '사진 없음' }, 404)

  if (user.role === 'worker' && photo.uploader_id !== user.id) {
    return c.json({ error: '본인이 업로드한 사진만 삭제할 수 있습니다.' }, 403)
  }

  // 파일 삭제
  if (photo.file_path) {
    try {
      const { fs } = await getFs()
      await fs.unlink(photo.file_path)
    } catch (_) {}
  }

  await c.env.DB.prepare('DELETE FROM task_photos WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
