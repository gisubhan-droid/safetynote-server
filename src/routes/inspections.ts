import { Hono } from 'hono'
import { getUser, buildStoragePath } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

const DEFAULT_UPLOAD_ROOT = './public/uploads'

async function getFs() {
  // @ts-ignore
  const fs = await import('node:fs/promises')
  // @ts-ignore
  const path = await import('node:path')
  return { fs, path }
}

function generateFileName(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg'
  return `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`
}

/** 점검에 연결된 작업+공사 정보로 inspection 저장 폴더 결정 */
async function resolveInspectionDir(db: D1Database, taskId: number | null): Promise<string> {
  let conRequestNo: string | null = null
  let conTitle:     string | null = null
  let conCreatedAt: string | null = null
  let taskNumber:   string | null = null
  let workDate:     string | null = null
  let workType:     string | null = null

  if (taskId) {
    const task = await db.prepare(
      `SELECT t.task_number, t.sub_task_number, t.work_date, t.planned_date,
              t.construction_type, c.request_no AS con_request_no, c.title AS con_title,
              c.created_at AS con_created_at
       FROM tasks t
       LEFT JOIN constructions c ON c.id = t.construction_id
       WHERE t.id = ?`
    ).bind(taskId).first<any>()
    if (task) {
      conRequestNo = task.con_request_no
      conTitle     = task.con_title
      conCreatedAt = task.con_created_at
      taskNumber   = task.sub_task_number || task.task_number
      workDate     = task.work_date || task.planned_date
      workType     = task.construction_type
    }
  }

  // 업로드 루트는 system_settings에서 조회, 실패 시 기본값
  let uploadRoot = DEFAULT_UPLOAD_ROOT
  try {
    const sv = await db.prepare(`SELECT value FROM system_settings WHERE key='upload_root_path'`).first<any>()
    if (sv?.value) uploadRoot = sv.value
  } catch (_) {}

  const pathInfo = buildStoragePath({
    uploadRoot, conRequestNo, conTitle, conCreatedAt,
    taskNumber, workDate, workType, stage: 'inspection',
  })
  return pathInfo.uploadDir
}

// 현장 점검 목록
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { status, hazard_level, task_id, date_from, date_to, user_id } = c.req.query()
  const params: any[] = []
  const wheres: string[] = []
  if (status)      { wheres.push('si.status = ?');        params.push(status) }
  if (hazard_level){ wheres.push('si.hazard_level = ?');  params.push(hazard_level) }
  if (task_id)     { wheres.push('si.task_id = ?');       params.push(task_id) }
  if (user_id)     { wheres.push('si.inspector_id = ?');  params.push(user_id) }
  if (date_from)   { wheres.push(`date(COALESCE(si.inspection_date_only, si.created_at)) >= ?`); params.push(date_from) }
  if (date_to)     { wheres.push(`date(COALESCE(si.inspection_date_only, si.created_at)) <= ?`); params.push(date_to) }

  // [BUG-039] LGU+ 역할: is_auto_request_no=0 (요청번호 자동부여 미체크) 건만 조회 허용
  // [FEAT-048] role='lgu_plus' 단일 역할 + 구버전 호환 (role='lgu', sub_role='lgu_plus')
  const isLgu = user.role === 'lgu_plus' || user.role === 'lgu' || (user as any).sub_role === 'lgu_plus'
  if (isLgu) {
    wheres.push('COALESCE(con.is_auto_request_no, -1) = 0')
  }

  const where = wheres.length ? ' WHERE ' + wheres.join(' AND ') : ''
  const order = ' ORDER BY si.created_at DESC'

  // GPS 컬럼 포함 쿼리 먼저 시도 — 컬럼 없으면 fallback
  // LGU+ 필터: constructions JOIN 추가 (is_auto_request_no 조건용)
  let rows: any[] = []
  try {
    const q = `SELECT si.*, u.name as inspector_name,
                t.title as task_title, t.task_number, t.status as task_status,
                t.gps_lat, t.gps_lon, t.gps_address,
                t.confirmed_address as task_confirmed_address,
                t.confirmed_address_source as task_confirmed_address_source,
                t.work_order_address as task_work_order_address
             FROM site_inspections si
             LEFT JOIN users u ON u.id = si.inspector_id
             LEFT JOIN tasks t ON t.id = si.task_id
             LEFT JOIN constructions con ON con.id = t.construction_id${where}${order}`
    const result = await c.env.DB.prepare(q).bind(...params).all<any>()
    rows = result.results || []
  } catch(_) {
    // GPS 컬럼 없는 구버전 DB — NULL 로 채워 반환
    const q = `SELECT si.*, u.name as inspector_name,
                t.title as task_title, t.task_number, t.status as task_status,
                NULL as gps_lat, NULL as gps_lon, NULL as gps_address,
                t.confirmed_address as task_confirmed_address,
                t.confirmed_address_source as task_confirmed_address_source,
                t.work_order_address as task_work_order_address
             FROM site_inspections si
             LEFT JOIN users u ON u.id = si.inspector_id
             LEFT JOIN tasks t ON t.id = si.task_id
             LEFT JOIN constructions con ON con.id = t.construction_id${where}${order}`
    const result = await c.env.DB.prepare(q).bind(...params).all<any>()
    rows = result.results || []
  }
  return c.json(rows)
})

// 현장 점검 상세
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const inspection = await c.env.DB.prepare(
    `SELECT si.*, u.name as inspector_name,
            t.title as task_title, t.task_number, t.location as task_location,
            t.confirmed_address as task_confirmed_address,
            t.confirmed_address_source as task_confirmed_address_source,
            t.confirmed_address_at as task_confirmed_address_at,
            t.work_order_address as task_work_order_address
     FROM site_inspections si
     LEFT JOIN users u ON u.id = si.inspector_id
     LEFT JOIN tasks t ON t.id = si.task_id
     WHERE si.id = ?`
  ).bind(id).first<any>()
  if (!inspection) return c.json({ error: '점검 없음' }, 404)
  const photos = await c.env.DB.prepare('SELECT * FROM inspection_photos WHERE inspection_id = ?').bind(id).all<any>()
  inspection.photos = photos.results || []
  // 연결된 작업자 목록 — 구버전 DB에 inspection_workers 없을 수 있으므로 try/catch
  try {
    const workers = await c.env.DB.prepare(
      `SELECT iw.worker_id, iw.result_type, u.name as worker_name, u.position
       FROM inspection_workers iw JOIN users u ON u.id = iw.worker_id
       WHERE iw.inspection_id = ?`
    ).bind(id).all<any>()
    inspection.workers = workers.results || []
  } catch (_) {
    inspection.workers = []
  }
  return c.json(inspection)
})

// 현장 점검 생성 (multipart/form-data OR application/json)
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  const contentType = c.req.header('Content-Type') || ''

  let location = '', inspection_type = 'routine', findings = '', corrective_actions = ''
  let hazard_level = 'low', notes = '', task_id: number | null = null
  let inspection_date_only = '', inspection_result = 'none', result_reason = ''
  let photoFiles: File[] = []
  let legacyPhotos: any[] = []

  let workerIds: number[] = []

  if (contentType.includes('multipart/form-data')) {
    // ── multipart: 원본 파일 저장 방식 ──
    const fd = await c.req.formData()
    location           = (fd.get('location')            as string) || ''
    inspection_type    = (fd.get('inspection_type')     as string) || 'routine'
    findings           = (fd.get('findings')            as string) || ''
    corrective_actions = (fd.get('corrective_actions')  as string) || ''
    hazard_level       = (fd.get('hazard_level')        as string) || 'low'
    notes              = (fd.get('notes')               as string) || ''
    inspection_date_only = (fd.get('inspection_date_only') as string) || ''
    inspection_result  = (fd.get('inspection_result')   as string) || 'none'
    result_reason      = (fd.get('result_reason')       as string) || ''
    const tid = fd.get('task_id')
    task_id = tid ? Number(tid) : null
    photoFiles = fd.getAll('photos') as File[]
    const wids = fd.get('worker_ids') as string
    if (wids) workerIds = wids.split(',').map(Number).filter(Boolean)
  } else {
    // ── JSON: 하위호환(base64) ──
    const body = await c.req.json()
    location           = body.location           || ''
    inspection_type    = body.inspection_type    || 'routine'
    findings           = body.findings           || ''
    corrective_actions = body.corrective_actions || ''
    hazard_level       = body.hazard_level       || 'low'
    notes              = body.notes              || ''
    inspection_date_only = body.inspection_date_only || ''
    inspection_result  = body.inspection_result  || 'none'
    result_reason      = body.result_reason      || ''
    task_id            = body.task_id            || null
    legacyPhotos       = body.photos             || []
    workerIds          = Array.isArray(body.worker_ids) ? body.worker_ids.map(Number).filter(Boolean) : []
  }

  if (!location) return c.json({ error: '점검 위치를 입력하세요.' }, 400)

  const today = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).replace(/\. /g, '-').replace('.', '')
  const insDateOnly = inspection_date_only || today

  const result = await c.env.DB.prepare(
    `INSERT INTO site_inspections
       (inspector_id, task_id, location, inspection_type, findings, corrective_actions,
        hazard_level, notes, inspection_date_only, inspection_result, result_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id, task_id || null, location, inspection_type, findings,
    corrective_actions, hazard_level, notes, insDateOnly, inspection_result, result_reason
  ).run()

  const inspectionId = Number(result.meta.last_row_id)  // BigInt 방지

  // 불량/우수 선택 작업자 저장 — 구버전 DB에 테이블 없을 수 있으므로 try/catch
  try {
    if (['불량','우수'].includes(inspection_result) && workerIds.length > 0) {
      for (const wid of workerIds) {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO inspection_workers (inspection_id, worker_id, result_type) VALUES (?, ?, ?)`
        ).bind(inspectionId, wid, inspection_result).run()
      }
    }
  } catch (_) { /* inspection_workers 테이블 미존재 시 무시 */ }

  // 파일 저장 (multipart)
  if (photoFiles.length > 0) {
    const { fs } = await getFs()
    const uploadDir = await resolveInspectionDir(c.env.DB, task_id)
    await fs.mkdir(uploadDir, { recursive: true })
    for (const file of photoFiles) {
      if (!file || typeof file === 'string') continue
      const fileName = generateFileName(file.name || 'photo.jpg')
      const filePath = `${uploadDir}/${fileName}`
      const buf = await file.arrayBuffer()
      await fs.writeFile(filePath, Buffer.from(buf))
      await c.env.DB.prepare(
        'INSERT INTO inspection_photos (inspection_id, file_name, file_path, file_data, caption) VALUES (?, ?, ?, NULL, ?)'
      ).bind(inspectionId, file.name || fileName, filePath, '').run()
    }
  }

  // base64 저장 (JSON 하위호환)
  if (legacyPhotos.length > 0) {
    for (const p of legacyPhotos) {
      await c.env.DB.prepare(
        'INSERT INTO inspection_photos (inspection_id, file_name, file_path, file_data, caption) VALUES (?, ?, NULL, ?, ?)'
      ).bind(inspectionId, p.file_name || 'photo.jpg', p.file_data, p.caption || '').run()
    }
  }

  return c.json({ success: true, id: inspectionId })
})

// 점검 사진 원본 서빙
app.get('/photo/:id/img', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const photo = await c.env.DB.prepare(
    'SELECT file_path, file_data, mime_type, file_name FROM inspection_photos WHERE id = ?'
  ).bind(id).first<any>()
  if (!photo) return c.json({ error: '사진 없음' }, 404)

  // 파일 기반 (신규)
  if (photo.file_path) {
    try {
      // @ts-ignore
      const fs = await import('node:fs/promises')
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

  // 하위호환: base64 기반
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

// ─── 현장 점검 수정 (PUT /:id) ───────────────────────────────────────────────
app.put('/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  const id = Number(c.req.param('id'))

  // 존재 여부 + 권한 확인 (본인 작성 or admin)
  const existing = await c.env.DB.prepare(
    'SELECT id, inspector_id FROM site_inspections WHERE id = ?'
  ).bind(id).first<any>()
  if (!existing) return c.json({ error: '점검 없음' }, 404)
  if (user.role !== 'admin' && existing.inspector_id !== user.id)
    return c.json({ error: '본인이 작성한 점검만 수정할 수 있습니다.' }, 403)

  const body = await c.req.json()
  const {
    location          = '',
    inspection_type   = 'routine',
    hazard_level      = 'low',
    findings          = '',
    corrective_actions = '',
    notes             = '',
    inspection_date_only = '',
    inspection_result = 'none',
    result_reason     = '',
    worker_ids        = [],
  } = body

  if (!location) return c.json({ error: '점검 위치를 입력하세요.' }, 400)

  await c.env.DB.prepare(`
    UPDATE site_inspections SET
      location           = ?,
      inspection_type    = ?,
      hazard_level       = ?,
      findings           = ?,
      corrective_actions = ?,
      notes              = ?,
      inspection_date_only = ?,
      inspection_result  = ?,
      result_reason      = ?,
      updated_at         = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    location, inspection_type, hazard_level,
    findings, corrective_actions, notes,
    inspection_date_only, inspection_result, result_reason,
    id
  ).run()

  // 기존 작업자 연결 삭제 후 재삽입 — 구버전 DB에 테이블 없을 수 있으므로 try/catch
  try {
    await c.env.DB.prepare('DELETE FROM inspection_workers WHERE inspection_id = ?').bind(id).run()
    const wids: number[] = Array.isArray(worker_ids) ? worker_ids.map(Number).filter(Boolean) : []
    if (['불량', '우수'].includes(inspection_result) && wids.length > 0) {
      for (const wid of wids) {
        await c.env.DB.prepare(
          'INSERT OR IGNORE INTO inspection_workers (inspection_id, worker_id, result_type) VALUES (?, ?, ?)'
        ).bind(id, wid, inspection_result).run()
      }
    }
  } catch (_) { /* inspection_workers 테이블 미존재 시 무시 (patchSchema v0.146 이전 DB) */ }

  return c.json({ success: true })
})

// ─── 현장 점검 삭제 (DELETE /:id) ────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  const id = Number(c.req.param('id'))

  const existing = await c.env.DB.prepare(
    'SELECT id, inspector_id FROM site_inspections WHERE id = ?'
  ).bind(id).first<any>()
  if (!existing) return c.json({ error: '점검 없음' }, 404)
  if (user.role !== 'admin' && existing.inspector_id !== user.id)
    return c.json({ error: '본인이 작성한 점검만 삭제할 수 있습니다.' }, 403)

  // 첨부 사진 파일 경로 조회 → 물리 파일 삭제 시도
  const photos = await c.env.DB.prepare(
    'SELECT id, file_path FROM inspection_photos WHERE inspection_id = ?'
  ).bind(id).all<any>()

  if ((photos.results || []).length > 0) {
    try {
      // @ts-ignore
      const fs = await import('node:fs/promises')
      for (const p of photos.results) {
        if (p.file_path) {
          try { await fs.unlink(p.file_path) } catch (_) { /* 파일 없으면 무시 */ }
        }
      }
    } catch (_) { /* 환경 미지원 시 무시 */ }
  }

  // DB 삭제 — inspection_workers 는 구버전 DB에 없을 수 있으므로 오류 무시
  try {
    await c.env.DB.prepare('DELETE FROM inspection_workers WHERE inspection_id = ?').bind(id).run()
  } catch (_) { /* 테이블 미존재 시 무시 */ }
  await c.env.DB.prepare('DELETE FROM inspection_photos WHERE inspection_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM site_inspections  WHERE id = ?').bind(id).run()

  return c.json({ success: true })
})

// 점검 상태 변경
app.patch('/:id/status', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const { status } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE site_inspections SET status=?, closed_at=${status === 'closed' ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id=?`
  ).bind(status, id).run()
  return c.json({ success: true })
})

// ─── 통계 API ─────────────────────────────────────────

// 점검자별 통계
app.get('/stats/by-inspector', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { year, month } = c.req.query()
  const now = new Date()
  const y = year || now.getFullYear()
  const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
  const start = `${y}-${m}-01`
  const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

  const rows = await c.env.DB.prepare(`
    SELECT u.id as inspector_id, u.name as inspector_name, u.position,
           COUNT(si.id) as total_count,
           SUM(CASE WHEN si.status='closed' THEN 1 ELSE 0 END) as closed_count,
           SUM(CASE WHEN si.status='open' THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN si.status='in_progress' THEN 1 ELSE 0 END) as inprogress_count,
           SUM(CASE WHEN si.hazard_level='critical' THEN 1 ELSE 0 END) as critical_count,
           SUM(CASE WHEN si.hazard_level='high' THEN 1 ELSE 0 END) as high_count,
           SUM(CASE WHEN si.inspection_result='불량' THEN 1 ELSE 0 END) as result_poor,
           SUM(CASE WHEN si.inspection_result='적정' THEN 1 ELSE 0 END) as result_fair,
           SUM(CASE WHEN si.inspection_result='양호' THEN 1 ELSE 0 END) as result_good,
           SUM(CASE WHEN si.inspection_result='우수' THEN 1 ELSE 0 END) as result_excellent
    FROM site_inspections si
    LEFT JOIN users u ON u.id = si.inspector_id
    WHERE (si.inspection_date_only BETWEEN ? AND ? OR (si.inspection_date_only IS NULL AND date(si.created_at) BETWEEN ? AND ?))
    GROUP BY si.inspector_id
    ORDER BY total_count DESC
  `).bind(start, end, start, end).all<any>()

  return c.json({ year: y, month: m, start, end, rows: rows.results || [] })
})

// 위험도별 통계
app.get('/stats/by-hazard', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { year, month } = c.req.query()
  const now = new Date()
  const y = year || now.getFullYear()
  const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
  const start = `${y}-${m}-01`
  const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

  const rows = await c.env.DB.prepare(`
    SELECT hazard_level,
           COUNT(*) as total_count,
           SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed_count
    FROM site_inspections
    WHERE (inspection_date_only BETWEEN ? AND ? OR (inspection_date_only IS NULL AND date(created_at) BETWEEN ? AND ?))
    GROUP BY hazard_level
    ORDER BY CASE hazard_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
  `).bind(start, end, start, end).all<any>()

  return c.json({ year: y, month: m, rows: rows.results || [] })
})

// 유형별 통계
app.get('/stats/by-type', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { year, month } = c.req.query()
  const now = new Date()
  const y = year || now.getFullYear()
  const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
  const start = `${y}-${m}-01`
  const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

  const rows = await c.env.DB.prepare(`
    SELECT inspection_type,
           COUNT(*) as total_count,
           SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed_count
    FROM site_inspections
    WHERE (inspection_date_only BETWEEN ? AND ? OR (inspection_date_only IS NULL AND date(created_at) BETWEEN ? AND ?))
    GROUP BY inspection_type
    ORDER BY total_count DESC
  `).bind(start, end, start, end).all<any>()

  return c.json({ year: y, month: m, rows: rows.results || [] })
})

// 주차별 점검 건수 통계
app.get('/stats/by-week', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { year, month } = c.req.query()
  const now = new Date()
  const y = Number(year || now.getFullYear())
  const m = Number(month || (now.getMonth() + 1))
  const start = `${y}-${String(m).padStart(2,'0')}-01`
  const end = new Date(y, m, 0).toISOString().split('T')[0]

  // 날짜별 점검 건수 조회 후 JS에서 주차 분류
  const rows = await c.env.DB.prepare(`
    SELECT
      COALESCE(si.inspection_date_only, date(si.created_at)) as ins_date,
      COUNT(*) as count,
      u.name as inspector_name,
      si.inspector_id
    FROM site_inspections si
    LEFT JOIN users u ON u.id = si.inspector_id
    WHERE COALESCE(si.inspection_date_only, date(si.created_at)) BETWEEN ? AND ?
    GROUP BY ins_date, si.inspector_id
    ORDER BY ins_date
  `).bind(start, end).all<any>()

  // 주차 계산 (해당 월 기준 1~5주)
  const weeklyData: Record<number, { total: number, byInspector: Record<string, number> }> = {}
  for (let w = 1; w <= 5; w++) weeklyData[w] = { total: 0, byInspector: {} }

  for (const r of (rows.results || [])) {
    const d = new Date(r.ins_date)
    const day = d.getDate()
    const week = Math.ceil(day / 7)
    const w = Math.min(week, 5)
    weeklyData[w].total += r.count
    const name = r.inspector_name || '미확인'
    weeklyData[w].byInspector[name] = (weeklyData[w].byInspector[name] || 0) + r.count
  }

  // 점검자 목록
  const inspectors = [...new Set((rows.results || []).map((r:any) => r.inspector_name || '미확인'))]

  return c.json({ year: y, month: m, weeklyData, inspectors })
})

// 작업자별 점검 이력 (불량/우수)
app.get('/worker-history/:workerId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const workerId = c.req.param('workerId')
  const { start, end, result_type } = c.req.query()

  const conditions: string[] = ['iw.worker_id = ?']
  const binds: any[] = [workerId]

  if (start && end) {
    conditions.push(`COALESCE(si.inspection_date_only, date(si.created_at)) BETWEEN ? AND ?`)
    binds.push(start, end)
  }
  if (result_type) {
    conditions.push(`iw.result_type = ?`)
    binds.push(result_type)
  }

  const where = conditions.join(' AND ')
  try {
    const rows = await c.env.DB.prepare(`
      SELECT iw.result_type, iw.created_at as recorded_at,
             si.id as inspection_id,
             COALESCE(si.inspection_date_only, date(si.created_at)) as inspection_date_only,
             si.location, si.findings, si.inspection_result, si.hazard_level,
             si.corrective_actions, si.result_reason, si.status as ins_status,
             t.id as task_id, t.title as task_title, t.task_number, t.status as task_status,
             u.name as inspector_name
      FROM inspection_workers iw
      JOIN site_inspections si ON si.id = iw.inspection_id
      LEFT JOIN tasks t ON t.id = si.task_id
      LEFT JOIN users u ON u.id = si.inspector_id
      WHERE ${where}
      ORDER BY COALESCE(si.inspection_date_only, date(si.created_at)) DESC, iw.created_at DESC
    `).bind(...binds).all<any>()
    return c.json(rows.results || [])
  } catch (_) {
    return c.json([]) /* inspection_workers 테이블 미존재 시 빈 배열 */
  }
})

// ─── 근로자 안전준수 통계 ─────────────────────────────────
// 기간 유형: weekly(주별) / monthly(월별) / quarterly(분기별)
app.get('/stats/worker-safety', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const { period_type, year, month, quarter } = c.req.query()
  const now = new Date()
  const y = Number(year || now.getFullYear())

  let start = '', end = ''

  if (period_type === 'weekly') {
    const m = (month || String(now.getMonth() + 1)).toString().padStart(2, '0')
    start = `${y}-${m}-01`
    end   = new Date(y, Number(m), 0).toISOString().split('T')[0]
  } else if (period_type === 'quarterly') {
    const q = Number(quarter || Math.ceil((now.getMonth() + 1) / 3))
    const startMonth = (q - 1) * 3 + 1
    const endMonth   = q * 3
    start = `${y}-${String(startMonth).padStart(2,'0')}-01`
    end   = new Date(y, endMonth, 0).toISOString().split('T')[0]
  } else {
    const m = (month || String(now.getMonth() + 1)).toString().padStart(2, '0')
    start = `${y}-${m}-01`
    end   = new Date(y, Number(m), 0).toISOString().split('T')[0]
  }

  // inspection_workers 테이블 없으면 빈 결과 반환 (구버전 DB 호환)
  let workerRows: any = { results: [] }
  let dailyRows:  any = { results: [] }
  try {
    workerRows = await c.env.DB.prepare(`
      SELECT u.id as worker_id, u.name as worker_name, u.position, u.department,
             t.name as team_name,
             COUNT(iw.id) as total_records,
             SUM(CASE WHEN iw.result_type='불량' THEN 1 ELSE 0 END) as poor_count,
             SUM(CASE WHEN iw.result_type='우수' THEN 1 ELSE 0 END) as excel_count,
             MAX(iw.created_at) as last_record_at
      FROM inspection_workers iw
      JOIN users u ON u.id = iw.worker_id
      LEFT JOIN teams t ON t.id = u.team_id
      JOIN site_inspections si ON si.id = iw.inspection_id
      WHERE COALESCE(si.inspection_date_only, date(si.created_at)) BETWEEN ? AND ?
      GROUP BY u.id
      ORDER BY poor_count DESC, excel_count DESC
    `).bind(start, end).all<any>()

    dailyRows = await c.env.DB.prepare(`
      SELECT COALESCE(si.inspection_date_only, date(si.created_at)) as ins_date,
             iw.result_type,
             COUNT(*) as cnt
      FROM inspection_workers iw
      JOIN site_inspections si ON si.id = iw.inspection_id
      WHERE COALESCE(si.inspection_date_only, date(si.created_at)) BETWEEN ? AND ?
      GROUP BY ins_date, iw.result_type
      ORDER BY ins_date
    `).bind(start, end).all<any>()
  } catch (_) { /* inspection_workers 테이블 미존재 시 빈 결과 */ }

  const totals = (workerRows.results || []).reduce((acc: any, r: any) => {
    acc.poor  += r.poor_count
    acc.excel += r.excel_count
    acc.total += r.total_records
    return acc
  }, { poor: 0, excel: 0, total: 0 })

  return c.json({
    period_type: period_type || 'monthly',
    start, end, year: y,
    month: month || String(now.getMonth() + 1).padStart(2,'0'),
    quarter: quarter || Math.ceil((now.getMonth() + 1) / 3),
    workers: workerRows.results || [],
    daily:   dailyRows.results  || [],
    totals,
  })
})

// 근로자별 불량 기록 작업 리스트
app.get('/worker-poor-tasks/:workerId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const workerId = c.req.param('workerId')
  const { start, end } = c.req.query()

  let dateFilter = ''
  const binds: any[] = [workerId]
  if (start && end) {
    dateFilter = `AND COALESCE(si.inspection_date_only, date(si.created_at)) BETWEEN ? AND ?`
    binds.push(start, end)
  }

  try {
    const rows = await c.env.DB.prepare(`
      SELECT
        t.id as task_id, t.title as task_title, t.task_number,
        t.status as task_status, t.location as task_location,
        t.planned_date, t.work_date,
        COUNT(iw.id) as poor_count,
        GROUP_CONCAT(COALESCE(si.inspection_date_only, date(si.created_at)), ',') as ins_dates,
        MAX(COALESCE(si.inspection_date_only, date(si.created_at))) as last_ins_date,
        GROUP_CONCAT(si.findings, '||') as findings_list,
        GROUP_CONCAT(u_ins.name, ',') as inspector_names
      FROM inspection_workers iw
      JOIN site_inspections si ON si.id = iw.inspection_id
      LEFT JOIN tasks t ON t.id = si.task_id
      LEFT JOIN users u_ins ON u_ins.id = si.inspector_id
      WHERE iw.worker_id = ? AND iw.result_type = '불량'
      ${dateFilter}
      GROUP BY t.id
      ORDER BY last_ins_date DESC
    `).bind(...binds).all<any>()
    return c.json(rows.results || [])
  } catch (_) {
    return c.json([]) /* inspection_workers 테이블 미존재 시 빈 배열 */
  }
})

// 점검자별 점검 목록
app.get('/stats/by-inspector/:inspectorId/list', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const inspectorId = c.req.param('inspectorId')
  const { year, month } = c.req.query()
  const now = new Date()
  const y = year || now.getFullYear()
  const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
  const start = `${y}-${m}-01`
  const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

  const rows = await c.env.DB.prepare(`
    SELECT si.id, si.location, si.inspection_type, si.hazard_level, si.status,
           si.findings, si.corrective_actions, si.created_at,
           si.inspection_date_only, si.inspection_result, si.result_reason,
           u.name as inspector_name,
           t.title as task_title, t.task_number
    FROM site_inspections si
    LEFT JOIN users u ON u.id = si.inspector_id
    LEFT JOIN tasks t ON t.id = si.task_id
    WHERE (si.inspection_date_only BETWEEN ? AND ? OR (si.inspection_date_only IS NULL AND date(si.created_at) BETWEEN ? AND ?))
      AND (? = '0' OR si.inspector_id = ?)
    ORDER BY COALESCE(si.inspection_date_only, date(si.created_at)) DESC
  `).bind(start, end, start, end, inspectorId, inspectorId).all<any>()

  return c.json({ rows: rows.results || [] })
})

// ─── 본인 안전점수 조회 (근로자 전용) ──────────────────────
app.get('/stats/my-safety', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const now  = new Date()
  const year = Number(c.req.query('year') || now.getFullYear())

  // inspection_workers 테이블 없으면 빈 결과 반환 (구버전 DB 호환)
  let monthlyRows: any = { results: [] }
  let totalRow: any    = null
  let recentRows: any  = { results: [] }
  try {
    monthlyRows = await c.env.DB.prepare(`
      SELECT strftime('%m', COALESCE(si.inspection_date_only, date(si.created_at))) as month,
             SUM(CASE WHEN iw.result_type='불량' THEN 1 ELSE 0 END) as poor_count,
             SUM(CASE WHEN iw.result_type='우수' THEN 1 ELSE 0 END) as excel_count,
             COUNT(iw.id) as total_records
      FROM inspection_workers iw
      JOIN site_inspections si ON si.id = iw.inspection_id
      WHERE iw.worker_id = ?
        AND strftime('%Y', COALESCE(si.inspection_date_only, date(si.created_at))) = ?
      GROUP BY month
      ORDER BY month
    `).bind(user.id, String(year)).all<any>()

    totalRow = await c.env.DB.prepare(`
      SELECT COUNT(iw.id) as total_records,
             SUM(CASE WHEN iw.result_type='불량' THEN 1 ELSE 0 END) as poor_count,
             SUM(CASE WHEN iw.result_type='우수' THEN 1 ELSE 0 END) as excel_count
      FROM inspection_workers iw
      JOIN site_inspections si ON si.id = iw.inspection_id
      WHERE iw.worker_id = ?
    `).bind(user.id).first<any>()

    recentRows = await c.env.DB.prepare(`
      SELECT iw.result_type, iw.created_at,
             si.location, si.inspection_date_only,
             si.result_reason,
             COALESCE(si.inspection_date_only, date(si.created_at)) as ins_date
      FROM inspection_workers iw
      JOIN site_inspections si ON si.id = iw.inspection_id
      WHERE iw.worker_id = ?
      ORDER BY ins_date DESC
      LIMIT 10
    `).bind(user.id).all<any>()
  } catch (_) { /* inspection_workers 테이블 미존재 시 빈 결과 */ }

  const total  = totalRow || { total_records: 0, poor_count: 0, excel_count: 0 }
  const score  = (Number(total.excel_count) * 5) + (Number(total.poor_count) * -10)
  const monthly = monthlyRows.results || []
  const recent  = recentRows.results  || []

  return c.json({ score, total, monthly, recent, year })
})

export default app
