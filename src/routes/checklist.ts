import { Hono } from 'hono'
import { getUser } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// 조건부 작업 유형 work_class 값 목록
const CONDITIONAL_CLASSES = ['bucket', 'pole', 'rooftop', 'ladder', 'heavy']

// ─── 체크리스트 항목 조회 ─────────────────────────────────────────────────────
// work_class=all → 필수 항목만
// work_class=bucket,pole,... → 해당 조건부 항목만
// work_class=all,bucket,pole,... → 필수 + 선택된 조건부 항목 모두
app.get('/items', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const workClassParam = c.req.query('work_class') || 'all'
    const requestedClasses = workClassParam.split(',').map((s: string) => s.trim()).filter(Boolean)

    // 조회할 work_class 목록 구성
    const queryClasses: string[] = []
    if (requestedClasses.includes('all') || requestedClasses.length === 0) {
      queryClasses.push('all')
    }
    // 조건부 항목 추가
    for (const cls of requestedClasses) {
      if (CONDITIONAL_CLASSES.includes(cls)) {
        queryClasses.push(cls)
      }
    }

    const placeholders = queryClasses.map(() => '?').join(',')
    const items = await c.env.DB.prepare(
      `SELECT * FROM checklist_items WHERE work_class IN (${placeholders}) AND is_active = 1 ORDER BY sort_order`
    ).bind(...queryClasses).all()

    return c.json({ items: items.results || [] })
  } catch (e: any) {
    console.error('[checklist GET /items]', e.message)
    return c.json({ error: e.message || '항목 조회 실패' }, 500)
  }
})

// ─── 평가 생성/조회 ───────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const body = await c.req.json()
    const { task_id, work_class, gps_address, gps_lat, gps_lon } = body
    if (!task_id || !work_class) return c.json({ error: 'task_id, work_class 필요' }, 400)

    // 기존 draft 평가 있으면 반환 (gps_address 업데이트)
    const existing = await c.env.DB.prepare(
      `SELECT * FROM checklist_assessments WHERE task_id = ? AND assessor_id = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`
    ).bind(task_id, user.id).first() as any

    if (existing) {
      // gps 정보 업데이트
      if (gps_address) {
        await c.env.DB.prepare(
          `UPDATE checklist_assessments SET gps_address=?, gps_lat=?, gps_lon=? WHERE id=?`
        ).bind(gps_address, gps_lat || null, gps_lon || null, existing.id).run()
      }
      const updated = await c.env.DB.prepare(
        `SELECT * FROM checklist_assessments WHERE id = ?`
      ).bind(existing.id).first()
      return c.json({ assessment: updated, created: false })
    }

    // 기존 completed 평가가 있어도 gps_address 업데이트 요청이면 반환 (재완료 허용)
    const completedExisting = await c.env.DB.prepare(
      `SELECT * FROM checklist_assessments WHERE task_id = ? ORDER BY id DESC LIMIT 1`
    ).bind(task_id).first() as any

    if (completedExisting && gps_address) {
      await c.env.DB.prepare(
        `UPDATE checklist_assessments SET gps_address=?, gps_lat=?, gps_lon=? WHERE id=?`
      ).bind(gps_address, gps_lat || null, gps_lon || null, completedExisting.id).run()
      const updated = await c.env.DB.prepare(
        `SELECT * FROM checklist_assessments WHERE id = ?`
      ).bind(completedExisting.id).first()
      return c.json({ assessment: updated, created: false })
    }

    if (completedExisting) {
      return c.json({ assessment: completedExisting, created: false })
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO checklist_assessments (task_id, work_class, assessor_id, gps_address, gps_lat, gps_lon) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(task_id, work_class, user.id, gps_address || null, gps_lat || null, gps_lon || null).run()

    // tasks.work_class_new 업데이트 (구형 work_class 컬럼은 CHECK 제약으로 수정 불가)
    try {
      await c.env.DB.prepare(
        `UPDATE tasks SET work_class_new = ? WHERE id = ?`
      ).bind(work_class, task_id).run()
    } catch (e: any) {
      console.warn('[checklist POST /] tasks.work_class_new 업데이트 실패 (무시):', e.message)
    }

    const newAss = await c.env.DB.prepare(
      `SELECT * FROM checklist_assessments WHERE id = ?`
    ).bind(result.meta.last_row_id).first()

    return c.json({ assessment: newAss, created: true })
  } catch (e: any) {
    console.error('[checklist POST /]', e.message)
    return c.json({ error: e.message || '평가 생성 실패' }, 500)
  }
})

// 특정 task의 최신 평가 조회
app.get('/task/:taskId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const taskId = c.req.param('taskId')

  try {
    const assessment = await c.env.DB.prepare(
      `SELECT ca.*, u.name as assessor_name
       FROM checklist_assessments ca
       LEFT JOIN users u ON u.id = ca.assessor_id
       WHERE ca.task_id = ? ORDER BY ca.id DESC LIMIT 1`
    ).bind(taskId).first() as any

    if (!assessment) return c.json({ assessment: null })

    // 응답 항목 조회 (ci.work_class 포함 — TBM 작업유형 자동선택에 사용)
    const responses = await c.env.DB.prepare(
      `SELECT cr.*, ci.category, ci.question, ci.note, ci.sort_order, ci.work_class as item_work_class
       FROM checklist_responses cr
       JOIN checklist_items ci ON ci.id = cr.item_id
       WHERE cr.assessment_id = ?
       ORDER BY ci.sort_order`
    ).bind(assessment.id).all()

    // TBM 사진 섹션
    const sections = await c.env.DB.prepare(
      `SELECT tps.*, 
         (SELECT json_group_array(json_object('id',tpi.id,'label',tpi.label,'file_path',tpi.file_path,'file_name',tpi.file_name,'mime_type',tpi.mime_type))
          FROM tbm_photo_items tpi WHERE tpi.section_id = tps.id) as photos
       FROM tbm_photo_sections tps
       WHERE tps.assessment_id = ?`
    ).bind(assessment.id).all()

    return c.json({
      assessment,
      responses: responses.results,
      tbm_sections: sections.results
    })
  } catch (e: any) {
    console.error('[checklist GET /task/:taskId]', e.message)
    return c.json({ error: e.message || '평가 조회 실패' }, 500)
  }
})

// 평가 상세 조회
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  try {
    const assessment = await c.env.DB.prepare(
      `SELECT ca.*, u.name as assessor_name, t.title as task_title, t.work_class as task_work_class
       FROM checklist_assessments ca
       LEFT JOIN users u ON u.id = ca.assessor_id
       LEFT JOIN tasks t ON t.id = ca.task_id
       WHERE ca.id = ?`
    ).bind(id).first() as any

    if (!assessment) return c.json({ error: '평가 없음' }, 404)

    const responses = await c.env.DB.prepare(
      `SELECT cr.*, ci.category, ci.question, ci.note, ci.sort_order
       FROM checklist_responses cr
       JOIN checklist_items ci ON ci.id = cr.item_id
       WHERE cr.assessment_id = ?
       ORDER BY ci.sort_order`
    ).bind(id).all()

    const sections = await c.env.DB.prepare(
      `SELECT tps.*, 
         (SELECT json_group_array(json_object('id',tpi.id,'label',tpi.label,'file_path',tpi.file_path,'file_name',tpi.file_name,'mime_type',tpi.mime_type))
          FROM tbm_photo_items tpi WHERE tpi.section_id = tps.id) as photos
       FROM tbm_photo_sections tps
       WHERE tps.assessment_id = ?`
    ).bind(id).all()

    return c.json({ assessment, responses: responses.results, tbm_sections: sections.results })
  } catch (e: any) {
    console.error('[checklist GET /:id]', e.message)
    return c.json({ error: e.message || '평가 상세 조회 실패' }, 500)
  }
})

// ─── 응답 저장 (항목별 체크) ──────────────────────────────────────────────────
app.post('/:id/responses', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  try {
    const assessment = await c.env.DB.prepare(
      `SELECT * FROM checklist_assessments WHERE id = ?`
    ).bind(id).first() as any
    if (!assessment) return c.json({ error: '평가 없음' }, 404)

    const body = await c.req.json()
    const { responses } = body  // [{item_id, response, memo}]

    // 배치 UPSERT — for 루프 N+1 → 단일 멀티 VALUES INSERT
    if (responses && responses.length > 0) {
      const placeholders = responses.map(() => '(?, ?, ?, ?)').join(', ')
      const binds: any[] = []
      for (const r of responses) {
        binds.push(id, r.item_id, r.response || null, r.memo || null)
      }
      await c.env.DB.prepare(
        `INSERT INTO checklist_responses (assessment_id, item_id, response, memo)
         VALUES ${placeholders}
         ON CONFLICT(assessment_id, item_id) DO UPDATE SET response=excluded.response, memo=excluded.memo`
      ).bind(...binds).run()
    }

    // TBM 사진 섹션 자동 생성 로직 (실패해도 응답 저장은 성공 반환)
    try {
      await updateTbmSections(c.env.DB, parseInt(id), responses)
    } catch (e: any) {
      console.warn('[checklist POST /:id/responses] updateTbmSections 실패 (무시):', e.message)
    }

    return c.json({ success: true })
  } catch (e: any) {
    console.error('[checklist POST /:id/responses]', e.message)
    return c.json({ error: e.message || '응답 저장 실패' }, 500)
  }
})

// ─── 평가 완료 처리 ──────────────────────────────────────────────────────────
app.patch('/:id/complete', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  try {
    // 미응답/NOK 항목 확인
    const assessment = await c.env.DB.prepare(
      `SELECT ca.*, t.work_class FROM checklist_assessments ca JOIN tasks t ON t.id = ca.task_id WHERE ca.id = ?`
    ).bind(id).first() as any

    if (!assessment) return c.json({ error: '평가 없음' }, 404)

    // 체크리스트 항목 수
    const itemCount = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM checklist_items WHERE work_class = 'all' AND is_active = 1`
    ).first() as any

    // 응답 수 및 NOK/미응답 조회
    const nokItems = await c.env.DB.prepare(
      `SELECT cr.item_id, ci.question, ci.category, cr.response
       FROM checklist_responses cr
       JOIN checklist_items ci ON ci.id = cr.item_id
       WHERE cr.assessment_id = ? AND (cr.response = 'nok' OR cr.response IS NULL)`
    ).bind(id).all()

    await c.env.DB.prepare(
      `UPDATE checklist_assessments SET status = 'completed' WHERE id = ?`
    ).bind(id).run()

    // KST 현재 시각
    const nowTs = new Date()
    const kstTs = new Date(nowTs.getTime() + 9 * 60 * 60 * 1000)
    const kstStr = kstTs.toISOString().replace('T', ' ').slice(0, 19)

    // ── 체크리스트 시행일시 + 작업 시작 주소 / 시작 일시 자동 기입
    //    + 작업 상태를 in_progress(위험성(체크리스트)평가 완료)로 자동 전환 ──
    //    ※ tasks 업데이트 실패는 complete 자체 성공에 영향 없음 (개별 try/catch)
    if (assessment.task_id) {
      try {
        const taskRow = await c.env.DB.prepare(
          `SELECT work_start_address, checklist_started_at, status FROM tasks WHERE id = ?`
        ).bind(assessment.task_id).first() as any

        // ① 작업 상태: assigned → in_progress 자동 전환 (체크리스트 완료 시)
        if (taskRow?.status === 'assigned') {
          if (assessment.gps_address && !taskRow?.work_start_address) {
            await c.env.DB.prepare(
              `UPDATE tasks SET status='in_progress', checklist_started_at=?, work_start_address=?, work_start_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
            ).bind(kstStr, assessment.gps_address, kstStr, assessment.task_id).run()
          } else if (assessment.gps_address) {
            await c.env.DB.prepare(
              `UPDATE tasks SET status='in_progress', checklist_started_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
            ).bind(kstStr, assessment.task_id).run()
          } else {
            await c.env.DB.prepare(
              `UPDATE tasks SET status='in_progress', checklist_started_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
            ).bind(kstStr, assessment.task_id).run()
          }
        } else {
          // ② 이미 in_progress 이상인 경우: checklist_started_at 최초 1회만 기록
          if (!taskRow?.checklist_started_at) {
            if (assessment.gps_address && !taskRow?.work_start_address) {
              await c.env.DB.prepare(
                `UPDATE tasks SET checklist_started_at=?, work_start_address=?, work_start_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
              ).bind(kstStr, assessment.gps_address, kstStr, assessment.task_id).run()
            } else {
              await c.env.DB.prepare(
                `UPDATE tasks SET checklist_started_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
              ).bind(kstStr, assessment.task_id).run()
            }
          }
        }
      } catch (taskErr: any) {
        // tasks 업데이트 실패는 complete 성공에 영향 없음
        console.warn('[checklist PATCH /:id/complete] tasks 상태 업데이트 실패 (무시):', taskErr.message)
      }
    }

    return c.json({
      success: true,
      nok_items: nokItems.results,
      has_warnings: nokItems.results.length > 0
    })
  } catch (e: any) {
    console.error('[checklist PATCH /:id/complete]', e.message)
    return c.json({ error: e.message || '평가 완료 처리 실패' }, 500)
  }
})

// ─── TBM 사진 섹션 업로드 ────────────────────────────────────────────────────
app.post('/:id/tbm-photos', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const body = await c.req.json()
    const { section_id, label, file_path, file_name, mime_type } = body

    // 같은 section_id + label의 기존 항목이 있으면 UPDATE, 없으면 INSERT
    const existing: any = await c.env.DB.prepare(
      `SELECT id FROM tbm_photo_items WHERE section_id = ? AND label = ? LIMIT 1`
    ).bind(section_id, label).first()

    let resultId: number
    if (existing) {
      // 기존 항목 업데이트
      await c.env.DB.prepare(
        `UPDATE tbm_photo_items SET file_path=?, file_name=?, mime_type=?, uploaded_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).bind(file_path, file_name, mime_type || 'image/jpeg', existing.id).run()
      resultId = existing.id
    } else {
      // 신규 INSERT
      const result = await c.env.DB.prepare(
        `INSERT INTO tbm_photo_items (section_id, label, file_path, file_name, mime_type) VALUES (?, ?, ?, ?, ?)`
      ).bind(section_id, label, file_path, file_name, mime_type || 'image/jpeg').run()
      resultId = result.meta.last_row_id as number
    }

    return c.json({ success: true, id: resultId })
  } catch (e: any) {
    console.error('[checklist POST /:id/tbm-photos]', e.message)
    return c.json({ error: e.message || 'TBM 사진 저장 실패' }, 500)
  }
})

// TBM 사진 삭제
app.delete('/:id/tbm-photos/:photoId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const photoId = c.req.param('photoId')

  try {
    await c.env.DB.prepare(`DELETE FROM tbm_photo_items WHERE id = ?`).bind(photoId).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[checklist DELETE /:id/tbm-photos/:photoId]', e.message)
    return c.json({ error: e.message || 'TBM 사진 삭제 실패' }, 500)
  }
})

// ─── 정기/수시 위험성평가 ──────────────────────────────────────────────────────
app.get('/periodic', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const type = c.req.query('type') || ''
    let query = `SELECT pra.*, u.name as assessor_name
                 FROM periodic_risk_assessments pra
                 LEFT JOIN users u ON u.id = pra.assessor_id`
    const params: any[] = []
    if (type) { query += ` WHERE pra.type = ?`; params.push(type) }
    query += ` ORDER BY pra.assessed_date DESC`

    const rows = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ assessments: rows.results })
  } catch (e: any) {
    console.error('[checklist GET /periodic]', e.message)
    return c.json({ error: e.message || '정기평가 목록 조회 실패' }, 500)
  }
})

app.post('/periodic', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  try {
    const body = await c.req.json()
    const { type, title, work_type, location, assessed_date, notes, details } = body

    const result = await c.env.DB.prepare(
      `INSERT INTO periodic_risk_assessments (type, title, work_type, location, assessor_id, assessed_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(type || 'periodic', title, work_type || '', location || '', user.id, assessed_date, notes || '').run()

    const assessmentId = result.meta.last_row_id

    if (details && details.length > 0) {
      for (const d of details) {
        try {
          await c.env.DB.prepare(
            `INSERT INTO periodic_risk_details (assessment_id, hazard_category, hazard_factor, risk_before, risk_after, control_measures, responsible, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(assessmentId, d.hazard_category, d.hazard_factor, d.risk_before || 1, d.risk_after || 1,
                 d.control_measures || '', d.responsible || '', d.due_date || null).run()
        } catch (detailErr: any) {
          console.warn('[checklist POST /periodic] detail INSERT 실패 (무시):', detailErr.message)
        }
      }
    }

    return c.json({ success: true, id: assessmentId })
  } catch (e: any) {
    console.error('[checklist POST /periodic]', e.message)
    return c.json({ error: e.message || '정기평가 생성 실패' }, 500)
  }
})

app.get('/periodic/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  try {
    const assessment = await c.env.DB.prepare(
      `SELECT pra.*, u.name as assessor_name FROM periodic_risk_assessments pra
       LEFT JOIN users u ON u.id = pra.assessor_id WHERE pra.id = ?`
    ).bind(id).first()

    if (!assessment) return c.json({ error: '평가 없음' }, 404)

    const details = await c.env.DB.prepare(
      `SELECT * FROM periodic_risk_details WHERE assessment_id = ?`
    ).bind(id).all()

    return c.json({ assessment, details: details.results })
  } catch (e: any) {
    console.error('[checklist GET /periodic/:id]', e.message)
    return c.json({ error: e.message || '정기평가 상세 조회 실패' }, 500)
  }
})

app.delete('/periodic/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')

  try {
    await c.env.DB.prepare(`DELETE FROM periodic_risk_assessments WHERE id = ?`).bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[checklist DELETE /periodic/:id]', e.message)
    return c.json({ error: e.message || '정기평가 삭제 실패' }, 500)
  }
})

// ─── helper: TBM 사진 섹션 자동 생성 (upsert 방식 — 사진 보존) ────────────────
async function updateTbmSections(db: D1Database, assessmentId: number, responses: any[]) {
  try {
    // 보호구 관련 항목 ID 확인
    const ppeItems = await db.prepare(
      `SELECT id FROM checklist_items WHERE category IN ('건강상태','공구상태','보호구') AND is_active = 1`
    ).all()
    const ppeIds = new Set((ppeItems.results as any[]).map(r => r.id))

    // 버켓/스카이 관련 항목 ID — work_class='bucket' 기준으로 정밀 조회
    // (이전: category IN ('충돌','전도','감전') 포함 → '감전'이 pole 항목이라 오분류 발생)
    const bucketItems = await db.prepare(
      `SELECT id FROM checklist_items WHERE work_class = 'bucket' AND is_active = 1`
    ).all()
    const bucketIds = new Set((bucketItems.results as any[]).map(r => r.id))

    // 중장비 관련 항목 ID
    const heavyItems = await db.prepare(
      `SELECT id FROM checklist_items WHERE category = '중장비' AND is_active = 1`
    ).all()
    const heavyIds = new Set((heavyItems.results as any[]).map(r => r.id))

    // TBM 관련 항목 ID
    const tbmItems = await db.prepare(
      `SELECT id FROM checklist_items WHERE category = 'TBM' AND is_active = 1`
    ).all()
    const tbmIds = new Set((tbmItems.results as any[]).map(r => r.id))

    const hasOk = (ids: Set<number>) =>
      responses.some(r => ids.has(r.item_id) && r.response === 'ok')

    // ── 섹션 정의 (section_type → labels) ────────────────────────────────────
    const sectionDefs: { type: string; name: string; labels: string[]; needed: boolean }[] = [
      { type: 'ppe',         name: '개인보호구 점검',      labels: ['안전보호구 착용 상태 확인'],                                                 needed: hasOk(ppeIds)    },
      { type: 'bucket',      name: '버켓/스카이 안전점검', labels: ['아웃트리거 확장 및 받침목 설치', '고임목 설치', '안전고리 체결'],             needed: hasOk(bucketIds) },
      { type: 'heavy',       name: '중장비 안전점검',      labels: ['작업계획서', '유도원 배치'],                                                  needed: hasOk(heavyIds)  },
      { type: 'tbm_meeting', name: 'TBM 회의',             labels: ['TBM회의 사진', '작업현장 전경', '라바콘 입간판 설치상태'],                    needed: hasOk(tbmIds)    },
    ]

    // ── 기존 섹션 조회 (section_type → section_id 매핑) ──────────────────────
    const existingSecs = await db.prepare(
      `SELECT id, section_type FROM tbm_photo_sections WHERE assessment_id = ?`
    ).bind(assessmentId).all()
    const secMap: Record<string, number> = {}
    for (const s of existingSecs.results as any[]) secMap[s.section_type] = s.id

    for (const def of sectionDefs) {
      try {
        if (!def.needed) {
          // 필요 없어진 섹션: photo_items 먼저 삭제 후 섹션 삭제
          if (secMap[def.type]) {
            await db.prepare(`DELETE FROM tbm_photo_items WHERE section_id = ?`).bind(secMap[def.type]).run()
            await db.prepare(`DELETE FROM tbm_photo_sections WHERE id = ?`).bind(secMap[def.type]).run()
          }
          continue
        }

        let sId: number
        if (secMap[def.type]) {
          // 기존 섹션 유지 (ID 재사용)
          sId = secMap[def.type]
        } else {
          // 신규 섹션 생성
          const r = await db.prepare(
            `INSERT INTO tbm_photo_sections (assessment_id, section_type, section_name) VALUES (?, ?, ?)`
          ).bind(assessmentId, def.type, def.name).run()
          sId = r.meta.last_row_id as number
        }

        // ── photo_items: label 기준 upsert ─────────────────────────────────────
        // 기존 항목 조회
        const existingItems = await db.prepare(
          `SELECT id, label, file_path FROM tbm_photo_items WHERE section_id = ?`
        ).bind(sId).all()
        const itemByLabel: Record<string, { id: number; file_path: string | null }> = {}
        for (const it of existingItems.results as any[]) {
          // 같은 label이 중복인 경우: 사진 있는 것 우선, 없으면 id 큰 것 유지
          if (!itemByLabel[it.label] || (!itemByLabel[it.label].file_path && it.file_path)) {
            // 이전 중복 항목(사진 없는 것) 삭제
            if (itemByLabel[it.label]) {
              await db.prepare(`DELETE FROM tbm_photo_items WHERE id = ?`).bind(itemByLabel[it.label].id).run()
            }
            itemByLabel[it.label] = { id: it.id, file_path: it.file_path }
          } else {
            // 현재 항목이 열등 → 삭제
            await db.prepare(`DELETE FROM tbm_photo_items WHERE id = ?`).bind(it.id).run()
          }
        }

        // 정의에 있는 label은 없으면 추가
        for (const label of def.labels) {
          if (!itemByLabel[label]) {
            await db.prepare(
              `INSERT INTO tbm_photo_items (section_id, label) VALUES (?, ?)`
            ).bind(sId, label).run()
          }
        }

        // 정의에 없는 label(삭제된 항목)의 photo_item 제거 (사진 없는 것만)
        for (const [label, item] of Object.entries(itemByLabel)) {
          if (!def.labels.includes(label) && !item.file_path) {
            await db.prepare(`DELETE FROM tbm_photo_items WHERE id = ?`).bind(item.id).run()
          }
        }
      } catch (sectionErr: any) {
        console.warn(`[updateTbmSections] 섹션 '${def.type}' 처리 실패 (무시):`, sectionErr.message)
      }
    }
  } catch (e: any) {
    console.warn('[updateTbmSections] 전체 실패 (무시):', e.message)
    throw e  // 호출부에서 개별 catch로 처리
  }
}

export { app as checklistRoutes }
