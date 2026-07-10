import { Hono } from 'hono'
import { getUser } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()


// 위험성 평가 목록
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
  const { task_id, assessment_type, date_from, date_to, user_id, status: raStatus } = c.req.query()
  const params: any[] = []
  const conditions: string[] = []
  if (task_id)        { conditions.push('ra.task_id = ?');         params.push(task_id) }
  if (assessment_type){ conditions.push('ra.assessment_type = ?'); params.push(assessment_type) }
  if (user_id)        { conditions.push('ra.assessor_id = ?');     params.push(user_id) }
  if (date_from)      { conditions.push("date(ra.created_at) >= ?"); params.push(date_from) }
  if (date_to)        { conditions.push("date(ra.created_at) <= ?"); params.push(date_to) }
  // [BUG-082] 현장위치 지도 위험성체크 탭: 완료된 평가만 표시 (status='completed')
  // status 파라미터 없으면 기본 'completed' 적용 (지도 탭 전용)
  // status='all' 파라미터를 보내면 전체 조회 (현장점검 화면 등에서 사용)
  if (raStatus === 'all') {
    // 전체 조회 — 필터 없음
  } else if (raStatus) {
    conditions.push('ra.status = ?'); params.push(raStatus)
  } else {
    conditions.push("ra.status = 'completed'")  // 기본: 완료된 평가만
  }
  // [BUG-039] LGU+ 역할: is_auto_request_no=0 (요청번호 자동부여 미체크) 건만 조회 허용
  // [FEAT-048] role='lgu_plus' 단일 역할 + 구버전 호환 (role='lgu', sub_role='lgu_plus')
  const isLgu = user.role === 'lgu_plus' || user.role === 'lgu' || (user as any).sub_role === 'lgu_plus'
  if (isLgu) {
    conditions.push('COALESCE(con.is_auto_request_no, -1) = 0')
  }
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''
  const order = ' ORDER BY ra.created_at DESC'

  // GPS 우선순위: checklist_assessments.gps_lat > tasks.gps_lat
  // BUG-050: 위험성체크 탭에서 마커 미표시 — 체크리스트 완료 시 GPS가
  //           checklist_assessments 테이블에 저장되므로 해당 테이블도 LEFT JOIN
  let rows: any[] = []
  try {
    // LGU+ 필터용 constructions JOIN 포함 (is_auto_request_no 조건)
    const q = `SELECT ra.*, t.title as task_title, t.status as task_status,
      COALESCE(ca.gps_lat, t.gps_lat) as gps_lat,
      COALESCE(ca.gps_lon, t.gps_lon) as gps_lon,
      COALESCE(ca.gps_address, t.gps_address) as gps_address,
      t.confirmed_address, t.work_order_address, t.location as task_location,
      u.name as assessor_name, wt.name as work_type_name,
      COALESCE(con.is_auto_request_no, -1) as is_auto_request_no
      FROM risk_assessments ra
      LEFT JOIN tasks t ON t.id = ra.task_id
      LEFT JOIN work_types wt ON wt.id = t.work_type_id
      LEFT JOIN users u ON u.id = ra.assessor_id
      LEFT JOIN constructions con ON con.id = t.construction_id
      LEFT JOIN (
        SELECT task_id,
               gps_lat, gps_lon, gps_address
        FROM checklist_assessments
        WHERE gps_lat IS NOT NULL AND gps_lon IS NOT NULL
        GROUP BY task_id
      ) ca ON ca.task_id = ra.task_id${where}${order}`
    const result = await c.env.DB.prepare(q).bind(...params).all<any>()
    rows = result.results || []
  } catch(_) {
    // checklist_assessments 테이블 없는 구버전 DB — tasks GPS만 사용 (fallback)
    try {
      const q = `SELECT ra.*, t.title as task_title, t.status as task_status,
        t.gps_lat, t.gps_lon, t.gps_address,
        t.confirmed_address, t.work_order_address, t.location as task_location,
        u.name as assessor_name, wt.name as work_type_name,
        COALESCE(con.is_auto_request_no, -1) as is_auto_request_no
        FROM risk_assessments ra
        LEFT JOIN tasks t ON t.id = ra.task_id
        LEFT JOIN work_types wt ON wt.id = t.work_type_id
        LEFT JOIN users u ON u.id = ra.assessor_id
        LEFT JOIN constructions con ON con.id = t.construction_id${where}${order}`
      const result = await c.env.DB.prepare(q).bind(...params).all<any>()
      rows = result.results || []
    } catch(_2) {
      // GPS 컬럼도 없는 최구버전 DB — NULL 로 채워 반환
      const q = `SELECT ra.*, t.title as task_title, t.status as task_status,
        NULL as gps_lat, NULL as gps_lon, NULL as gps_address,
        t.confirmed_address, t.work_order_address, t.location as task_location,
        u.name as assessor_name, wt.name as work_type_name,
        COALESCE(con.is_auto_request_no, -1) as is_auto_request_no
        FROM risk_assessments ra
        LEFT JOIN tasks t ON t.id = ra.task_id
        LEFT JOIN work_types wt ON wt.id = t.work_type_id
        LEFT JOIN users u ON u.id = ra.assessor_id
        LEFT JOIN constructions con ON con.id = t.construction_id${where}${order}`
      const result = await c.env.DB.prepare(q).bind(...params).all<any>()
      rows = result.results || []
    }
  }
  return c.json(rows)
  } catch (e: any) {
    console.error('[risk GET /]', e.message)
    return c.json({ error: e.message || '목록 조회 실패' }, 500)
  }
})

// 위험성 평가 생성
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
  const body = await c.req.json()
  // assessment_type: 'task'(기본,작업별), 'periodic'(정기), 'adhoc'(수시)
  const { task_id, weather, temperature, workers_count, notes, details,
          assessment_type, title, location, work_type, source_adhoc_ids } = body
  const aType = assessment_type || 'task'

  const result = await c.env.DB.prepare(
    `INSERT INTO risk_assessments
     (task_id, assessor_id, weather, temperature, workers_count, notes, status, assessment_type, title, location, source_adhoc_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    task_id || null, user.id,
    weather || '', temperature || '', workers_count || 1, notes || '',
    'draft', aType,
    title || null,
    location || null,
    source_adhoc_ids || null
  ).run()

  const assessmentId = result.meta.last_row_id

  if (details && details.length > 0) {
    for (const d of details) {
      await c.env.DB.prepare(
        `INSERT INTO risk_assessment_details (assessment_id, item_id, category, hazard, risk_factor,
         before_frequency, before_severity, before_risk_level, control_measures,
         after_frequency, after_severity, after_risk_level, is_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(assessmentId, d.item_id || null, d.category || '', d.hazard || '', d.risk_factor || '',
        d.before_frequency || 3, d.before_severity || 3, d.before_risk_level || '보통',
        d.control_measures || '', d.after_frequency || 1, d.after_severity || 2, d.after_risk_level || '낮음',
        d.is_confirmed ? 1 : 0
      ).run()
    }
  }

  // 작업별 평가인 경우에만 작업 상태 업데이트
  if (task_id && aType === 'task') {
    await c.env.DB.prepare("UPDATE tasks SET status='in_progress', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(task_id).run()

    // confirmed_address 갱신: 위험성평가에서 입력된 location이 있으면 최신 주소로 기록
    if (location) {
      const nowKst = (() => {
        const d = new Date(); const k = new Date(d.getTime() + 9*60*60*1000);
        return k.toISOString().replace('T',' ').slice(0,19);
      })();
      await c.env.DB.prepare(
        `UPDATE tasks SET confirmed_address=?, confirmed_address_source='risk', confirmed_address_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(location, nowKst, task_id).run();
    }
  }

  return c.json({ success: true, id: assessmentId })
  } catch (e: any) {
    console.error('[risk POST /]', e.message)
    return c.json({ error: e.message || '평가 생성 실패' }, 500)
  }
})

// ─── 위험성 평가 삭제 ────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  try {
  // 완료(completed) 상태는 삭제 불가
  const row = await c.env.DB.prepare(
    `SELECT status FROM risk_assessments WHERE id=?`
  ).bind(id).first<any>()
  if (!row) return c.json({ error: '존재하지 않습니다.' }, 404)
  if (row.status === 'completed') return c.json({ error: '완료된 위험성평가는 삭제할 수 없습니다.' }, 400)
  // 연관 데이터 먼저 삭제 (FK CASCADE 없는 테이블 모두 명시 삭제)
  // 각 단계 개별 try-catch로 정확한 에러 위치 파악
  const steps: Array<[string, string]> = [
    ['risk_assessment_details',    `DELETE FROM risk_assessment_details    WHERE assessment_id=${id}`],
    ['risk_assessment_members',    `DELETE FROM risk_assessment_members    WHERE assessment_id=${id}`],
    ['risk_assessment_signatures', `DELETE FROM risk_assessment_signatures WHERE assessment_id=${id}`],
  ]
  for (const [tbl, sql] of steps) {
    try {
      await c.env.DB.prepare(sql).run()
    } catch(e: any) {
      // FK 오류면 PRAGMA로 FK 비활성화 후 재시도 (NAS DB 스키마 불일치 방어)
      if (e.message?.includes('risk_assessments_old') || e.message?.includes('no such table')) {
        try {
          await c.env.DB.prepare(`PRAGMA foreign_keys = OFF`).run()
          await c.env.DB.prepare(sql).run()
          await c.env.DB.prepare(`PRAGMA foreign_keys = ON`).run()
          console.warn(`[risk DELETE /:id] ${tbl}: FK 비활성화로 재시도 성공`)
        } catch(e2: any) {
          console.error(`[risk DELETE /:id] ${tbl} FAILED (retry):`, e2.message)
          return c.json({ error: `[${tbl}] ${e2.message}` }, 500)
        }
      } else {
        console.error(`[risk DELETE /:id] ${tbl} FAILED:`, e.message)
        return c.json({ error: `[${tbl}] ${e.message}` }, 500)
      }
    }
  }
  // signature_requests — 테이블 없을 수 있으므로 무시
  try {
    await c.env.DB.prepare(`DELETE FROM signature_requests WHERE ref_type='risk_assessment' AND ref_id=?`).bind(id).run()
  } catch(_) {}
  // 본 레코드 삭제
  try {
    await c.env.DB.prepare(`DELETE FROM risk_assessments WHERE id=?`).bind(id).run()
  } catch(e: any) {
    console.error(`[risk DELETE /:id] risk_assessments FAILED:`, e.message)
    return c.json({ error: `[risk_assessments] ${e.message}` }, 500)
  }
  return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk DELETE /:id] outer catch:', e.message)
    return c.json({ error: e.message || '평가 삭제 실패' }, 500)
  }
})

// ─── 임시 저장 (draft/in_review/measures_done: 회의일자·장소·메모 저장) ──────
app.patch('/:id/save-draft', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  try {
    const body = await c.req.json().catch(() => ({})) as any
    const { meeting_date, meeting_place, notes } = body
    await c.env.DB.prepare(
      `UPDATE risk_assessments
       SET meeting_date  = COALESCE(?, meeting_date),
           meeting_place = COALESCE(?, meeting_place),
           review_notes  = COALESCE(?, review_notes)
       WHERE id = ?`
    ).bind(meeting_date || null, meeting_place || null, notes || null, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk PATCH /:id/save-draft]', e.message)
    return c.json({ error: e.message || '임시저장 실패' }, 500)
  }
})

// 위험성 평가 완료
app.patch('/:id/complete', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare("UPDATE risk_assessments SET status='completed' WHERE id=?").bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk PATCH /:id/complete]', e.message)
    return c.json({ error: e.message || '완료 처리 실패' }, 500)
  }
})

// ─── 워크플로우 상태 전이 ────────────────────────────────────────────────────
// 수시: draft → in_review → measures_done → completed
// 정기: draft → in_review → measures_done → completed

// 상태 전이: draft → in_review (평가위원 선정 완료 → 감소대책 수립 시작)
app.patch('/:id/start-review', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  try {
    const body = await c.req.json().catch(() => ({}))
    const { meeting_date, meeting_place } = body as any
    await c.env.DB.prepare(
      `UPDATE risk_assessments
       SET status='in_review',
           meeting_date=?, meeting_place=?
       WHERE id=?`
    ).bind(meeting_date || null, meeting_place || null, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk PATCH /:id/start-review]', e.message)
    return c.json({ error: e.message || '상태 전이 실패' }, 500)
  }
})

// 상태 전이: in_review → measures_done (감소대책 수립 완료 → 최종 위험도 선정)
app.patch('/:id/finish-measures', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  try {
    const body = await c.req.json().catch(() => ({}))
    const { review_notes } = body as any
    await c.env.DB.prepare(
      `UPDATE risk_assessments SET status='measures_done', review_notes=? WHERE id=?`
    ).bind(review_notes || null, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk PATCH /:id/finish-measures]', e.message)
    return c.json({ error: e.message || '상태 전이 실패' }, 500)
  }
})

// 상태 전이: measures_done → completed (최종 위험도 확정)
app.patch('/:id/finalize', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  try {
    const body = await c.req.json().catch(() => ({}))
    const { final_notes, details } = body as any

    // 최종 위험도 일괄 업데이트
    if (details && Array.isArray(details)) {
      for (const d of details) {
        try {
          const ff = Number(d.final_frequency) || 1
          const fs_ = Number(d.final_severity) || 1
          function rl(s: number) {
            if (s <= 4) return '낮음'; if (s <= 9) return '보통';
            if (s <= 16) return '높음'; return '중대'
          }
          await c.env.DB.prepare(
            `UPDATE risk_assessment_details
             SET final_frequency=?, final_severity=?, final_risk_level=?,
                 member_measures=?, is_final=1
             WHERE id=? AND assessment_id=?`
          ).bind(ff, fs_, rl(ff * fs_), d.member_measures || null, d.id, id).run()
        } catch (detailErr: any) {
          console.warn('[risk PATCH /:id/finalize] detail 업데이트 실패 (무시):', detailErr.message)
        }
      }
    }

    await c.env.DB.prepare(
      `UPDATE risk_assessments
       SET status='completed', final_notes=?, review_date=date('now')
       WHERE id=?`
    ).bind(final_notes || null, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk PATCH /:id/finalize]', e.message)
    return c.json({ error: e.message || '최종화 실패' }, 500)
  }
})

// 평가위원 조회
app.get('/:id/members', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  try {
    const result = await c.env.DB.prepare(
      `SELECT ram.id, ram.assessment_id, ram.user_id, ram.role, ram.assigned_at,
       u.name, u.position, u.department, u.role as user_role
       FROM risk_assessment_members ram
       JOIN users u ON u.id = ram.user_id
       WHERE ram.assessment_id = ?
       ORDER BY CASE ram.role WHEN 'chair' THEN 0 ELSE 1 END, ram.assigned_at`
    ).bind(id).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    console.error('[risk GET /:id/members]', e.message)
    return c.json({ error: e.message || '평가위원 조회 실패' }, 500)
  }
})

// 평가위원 일괄 추가 (체크박스 방식)
app.post('/:id/members/bulk', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  // members: [{ user_id, role }]
  const members: { user_id: number; role: string }[] = body.members || []
  if (!members.length) return c.json({ error: '선택된 위원이 없습니다.' }, 400)

  let added = 0
  let skipped = 0
  for (const m of members) {
    if (!m.user_id) continue
    try {
      await c.env.DB.prepare(
        `INSERT INTO risk_assessment_members (assessment_id, user_id, role) VALUES (?, ?, ?)`
      ).bind(id, m.user_id, m.role || 'member').run()
      added++
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) skipped++
      else throw e
    }
  }
  return c.json({ success: true, added, skipped })
})

// 평가위원 추가 (단건)
app.post('/:id/members', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json()
  const { user_id, role } = body
  if (!user_id) return c.json({ error: 'user_id 필요' }, 400)
  try {
    const r = await c.env.DB.prepare(
      `INSERT INTO risk_assessment_members (assessment_id, user_id, role)
       VALUES (?, ?, ?)`
    ).bind(id, user_id, role || 'member').run()
    return c.json({ success: true, id: r.meta.last_row_id })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 추가된 위원입니다.' }, 409)
    throw e
  }
})

// 평가위원 삭제
app.delete('/:id/members/:memberId', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const { id, memberId } = c.req.param()
  try {
    await c.env.DB.prepare(
      'DELETE FROM risk_assessment_members WHERE id=? AND assessment_id=?'
    ).bind(memberId, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk DELETE /:id/members/:memberId]', e.message)
    return c.json({ error: e.message || '평가위원 삭제 실패' }, 500)
  }
})

// 평가 세부항목 감소대책 업데이트 (위원 입력)
app.patch('/:id/details/:detailId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { id, detailId } = c.req.param()
  try {
    const body = await c.req.json()
    const { member_measures, control_measures } = body
    await c.env.DB.prepare(
      `UPDATE risk_assessment_details
       SET member_measures=?, control_measures=COALESCE(?, control_measures)
       WHERE id=? AND assessment_id=?`
    ).bind(member_measures || null, control_measures || null, detailId, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk PATCH /:id/details/:detailId]', e.message)
    return c.json({ error: e.message || '세부항목 업데이트 실패' }, 500)
  }
})

// 수시평가 목록 (정기평가 검토용) — adhoc + task 타입만
app.get('/adhoc/for-review', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
  const result = await c.env.DB.prepare(
    `SELECT ra.id, ra.assessment_type, ra.title, ra.assessment_date,
     ra.status, ra.location, ra.workers_count,
     u.name as assessor_name,
     COUNT(rad.id) as detail_count,
     SUM(CASE WHEN rad.before_risk_level IN ('높음','매우높음') THEN 1 ELSE 0 END) as high_risk_count,
     SUM(CASE WHEN rad.is_final=1 THEN 1 ELSE 0 END) as final_count
     FROM risk_assessments ra
     LEFT JOIN users u ON u.id = ra.assessor_id
     LEFT JOIN risk_assessment_details rad ON rad.assessment_id = ra.id
     WHERE ra.assessment_type IN ('adhoc','task')
     GROUP BY ra.id
     ORDER BY ra.created_at DESC
     LIMIT 100`
  ).all<any>()
  return c.json(result.results || [])
  } catch (e: any) {
    console.error('[risk GET /adhoc/for-review]', e.message)
    return c.json({ error: e.message || '수시평가 목록 조회 실패' }, 500)
  }
})



// 작업 카테고리 목록 조회 (엑셀 기반 표준 데이터 포함)
app.get('/categories/list', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    const result = await c.env.DB.prepare(
      `SELECT wc.id, wc.name, wc.code, wc.description,
       COUNT(wt.id) as work_type_count
       FROM work_categories wc
       LEFT JOIN work_types wt ON wt.category_id = wc.id
       GROUP BY wc.id ORDER BY wc.name`
    ).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    console.error('[risk GET /categories/list]', e.message)
    return c.json({ error: e.message || '카테고리 목록 조회 실패' }, 500)
  }
})

// 카테고리별 작업 유형 조회
app.get('/categories/:category_id/types', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const category_id = c.req.param('category_id')
  try {
    const result = await c.env.DB.prepare(
      `SELECT wt.id, wt.name, wt.code, wt.description,
       COUNT(rai.id) as item_count
       FROM work_types wt
       LEFT JOIN risk_assessment_items rai ON rai.work_type_id = wt.id AND COALESCE(rai.is_active, 1) = 1
       WHERE wt.category_id = ?
       GROUP BY wt.id ORDER BY wt.name`
    ).bind(category_id).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    console.error('[risk GET /categories/:category_id/types]', e.message)
    return c.json({ error: e.message || '작업유형 조회 실패' }, 500)
  }
})

// 작업 유형별 위험성 평가 항목 조회 (엑셀 기반 표준 데이터)
app.get('/items/by-type', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    const { work_type_id, work_type_code, category_code } = c.req.query()
    
    let q = `SELECT rai.*, wt.name as work_type_name, wt.code as work_type_code,
      wc.name as category_name, wc.code as category_code
      FROM risk_assessment_items rai
      LEFT JOIN work_types wt ON wt.id = rai.work_type_id
      LEFT JOIN work_categories wc ON wc.id = wt.category_id
      WHERE COALESCE(rai.is_active, 1) = 1`
    const params: any[] = []

    if (work_type_id) {
      q += ' AND (rai.work_type_id = ? OR rai.work_type_id IS NULL)'
      params.push(work_type_id)
    } else if (work_type_code) {
      q += ' AND wt.code = ?'
      params.push(work_type_code)
    } else if (category_code) {
      q += ' AND wc.code = ?'
      params.push(category_code)
    }
    
    q += ' ORDER BY rai.category, rai.id'
    const result = await c.env.DB.prepare(q).bind(...params).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    console.error('[risk GET /items/by-type]', e.message)
    return c.json({ error: e.message || '평가항목 조회 실패' }, 500)
  }
})

// 위험성평가 표준 양식 조회 (작업유형 선택 시 전체 표준 항목 반환)
app.get('/items/standard-form', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { work_type_id } = c.req.query()
  if (!work_type_id) return c.json({ error: 'work_type_id 필요' }, 400)
  try {
  const result = await c.env.DB.prepare(
    `SELECT rai.*,
     wt.name as work_type_name,
     wc.name as category_name
     FROM risk_assessment_items rai
     LEFT JOIN work_types wt ON wt.id = rai.work_type_id
     LEFT JOIN work_categories wc ON wc.id = wt.category_id
     WHERE rai.work_type_id = ? AND COALESCE(rai.is_active, 1) = 1
     ORDER BY rai.category, rai.before_risk_level DESC, rai.id`
  ).bind(work_type_id).all<any>()

  const items = result.results || []

  // 카테고리별 그룹화
  const grouped: Record<string, any[]> = {}
  for (const item of items) {
    const cat = item.category || '기타'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  }

  return c.json({
    work_type_id,
    total: items.length,
    grouped,
    items
  })
  } catch (e: any) {
    console.error('[risk GET /items/standard-form]', e.message)
    return c.json({ error: e.message || '표준양식 조회 실패' }, 500)
  }
})

// 전체 작업유형 + 위험항목 수 요약
app.get('/items/summary', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    const result = await c.env.DB.prepare(
      `SELECT wc.name as category_name, wc.code as category_code,
       wt.id as work_type_id, wt.name as work_type_name, wt.code as work_type_code,
       COUNT(rai.id) as item_count,
       SUM(CASE WHEN COALESCE(rai.before_risk_level,'') IN ('높음','매우높음') THEN 1 ELSE 0 END) as high_risk_count
       FROM work_types wt
       JOIN work_categories wc ON wc.id = wt.category_id
       LEFT JOIN risk_assessment_items rai ON rai.work_type_id = wt.id AND COALESCE(rai.is_active, 1) = 1
       GROUP BY wt.id ORDER BY wc.name, wt.name`
    ).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    console.error('[risk GET /items/summary]', e.message)
    return c.json({ error: e.message || '요약 조회 실패' }, 500)
  }
})

// 작업유형별 실제 위험성평가 이력 조회 (정기/수시 구분)
// GET /risk/items/by-type/assessments?work_type_id=17&assessment_type=periodic
app.get('/items/by-type/assessments', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
  const { work_type_id, assessment_type } = c.req.query()
  if (!work_type_id) return c.json({ error: 'work_type_id 필요' }, 400)

  const params: any[] = [Number(work_type_id)]
  let typeFilter = ''
  if (assessment_type) {
    typeFilter = ' AND ra.assessment_type = ?'
    params.push(assessment_type)
  }

  // 1) 해당 work_type을 가진 작업(task) 기반 평가 이력
  const taskBased = await c.env.DB.prepare(`
    SELECT ra.id, ra.assessment_type, ra.title, ra.assessment_date,
           ra.status, ra.workers_count, ra.weather, ra.temperature, ra.notes,
           ra.location, ra.task_id,
           t.title as task_title,
           wt.name as work_type_name,
           u.name as assessor_name,
           COUNT(rad.id) as detail_count,
           SUM(CASE WHEN rad.before_risk_level IN ('높음','매우높음') THEN 1 ELSE 0 END) as high_risk_count
    FROM risk_assessments ra
    JOIN tasks t ON t.id = ra.task_id
    LEFT JOIN work_types wt ON wt.id = t.work_type_id
    LEFT JOIN users u ON u.id = ra.assessor_id
    LEFT JOIN risk_assessment_details rad ON rad.assessment_id = ra.id
    WHERE t.work_type_id = ?${typeFilter}
    GROUP BY ra.id
    ORDER BY ra.created_at DESC
    LIMIT 50
  `).bind(...params).all<any>()

  // 2) work_type_id가 없는 정기/수시 평가 중 제목이나 연결이 없는 것 (task_id IS NULL)
  //    → work_type 직접 연결이 없으므로 표준항목 기반으로만 연결되는 케이스
  const standaloneBased = await c.env.DB.prepare(`
    SELECT ra.id, ra.assessment_type, ra.title, ra.assessment_date,
           ra.status, ra.workers_count, ra.weather, ra.temperature, ra.notes,
           ra.location, ra.task_id,
           NULL as task_title,
           NULL as work_type_name,
           u.name as assessor_name,
           COUNT(rad.id) as detail_count,
           SUM(CASE WHEN rad.before_risk_level IN ('높음','매우높음') THEN 1 ELSE 0 END) as high_risk_count
    FROM risk_assessments ra
    LEFT JOIN users u ON u.id = ra.assessor_id
    LEFT JOIN risk_assessment_details rad ON rad.assessment_id = ra.id
    WHERE ra.task_id IS NULL
      AND ra.assessment_type IN ('periodic','adhoc')
      ${assessment_type ? 'AND ra.assessment_type = ?' : ''}
    GROUP BY ra.id
    ORDER BY ra.created_at DESC
    LIMIT 20
  `).bind(...(assessment_type ? [assessment_type] : [])).all<any>()

  const allAssessments = [
    ...(taskBased.results || []),
    ...(standaloneBased.results || [])
  ]

  return c.json({
    work_type_id: Number(work_type_id),
    assessments: allAssessments,
    total: allAssessments.length
  })
  } catch (e: any) {
    console.error('[risk GET /items/by-type/assessments]', e.message)
    return c.json({ error: e.message || '평가이력 조회 실패' }, 500)
  }
})

// ─── 분류별 위험성 평가 항목 관리 ────────────────────────────────────────────

// 작업 유형별 위험성 평가 항목 전체 조회 (항목 관리용)
app.get('/items/manage', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    const { category_id, work_type_id } = c.req.query()

    let query = `SELECT rai.*, wt.name as work_type_name, wc.name as category_name
       FROM risk_assessment_items rai
       JOIN work_types wt ON wt.id = rai.work_type_id
       JOIN work_categories wc ON wc.id = wt.category_id
       WHERE COALESCE(rai.is_active, 1) = 1`
    const params: any[] = []

    if (work_type_id) {
      query += ' AND rai.work_type_id = ?'
      params.push(Number(work_type_id))
    } else if (category_id) {
      query += ' AND wt.category_id = ?'
      params.push(Number(category_id))
    }

    query += ' ORDER BY wc.name, wt.name, rai.category, rai.id'

    const result = await c.env.DB.prepare(query).bind(...params).all<any>()
    return c.json({ items: result.results || [] })
  } catch (e: any) {
    console.error('[risk GET /items/manage]', e.message)
    return c.json({ error: e.message || '항목 목록 조회 실패' }, 500)
  }
})

// 위험성 평가 항목 단건 추가
app.post('/items/manage', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  try {
    const body = await c.req.json()
    const { work_type_id, category, hazard, risk_factor,
      before_frequency, before_severity, control_measures,
      after_frequency, after_severity, responsible,
      likelihood, severity, countermeasure, note } = body

    if (!work_type_id || !hazard) return c.json({ error: 'work_type_id, hazard 필요' }, 400)

    // FEAT-046: likelihood/severity/countermeasure 필드도 허용
    const bf = Number(before_frequency ?? likelihood) || 1
    const bs = Number(before_severity ?? severity) || 1
    const af = Number(after_frequency ?? likelihood) || 1
    const as_ = Number(after_severity ?? severity) || 1
    const cm = control_measures ?? countermeasure ?? ''

    function riskLevel(score: number) {
      if (score <= 4) return '낮음'
      if (score <= 9) return '보통'
      if (score <= 16) return '높음'
      return '중대'
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO risk_assessment_items
       (work_type_id, category, hazard, risk_factor,
        before_frequency, before_severity, before_risk_level,
        control_measures, after_frequency, after_severity, after_risk_level,
        responsible, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`
    ).bind(
      Number(work_type_id), category || '', hazard, risk_factor || '',
      bf, bs, riskLevel(bf * bs),
      cm, af, as_, riskLevel(af * as_),
      responsible || '관리감독자'
    ).run()

    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (e: any) {
    console.error('[risk POST /items/manage]', e.message)
    return c.json({ error: e.message || '항목 추가 실패' }, 500)
  }
})

// 위험성 평가 항목 수정
app.put('/items/manage/:itemId', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  try {
    const itemId = c.req.param('itemId')
    const body = await c.req.json()
    const { category, hazard, risk_factor,
      before_frequency, before_severity, control_measures,
      after_frequency, after_severity, responsible,
      likelihood, severity, countermeasure, note } = body

    // FEAT-046: likelihood/severity/countermeasure 필드도 허용
    const bf = Number(before_frequency ?? likelihood) || 1
    const bs = Number(before_severity ?? severity) || 1
    const af = Number(after_frequency ?? likelihood) || 1
    const as_ = Number(after_severity ?? severity) || 1
    const cm = control_measures ?? countermeasure ?? ''

    function riskLevel(score: number) {
      if (score <= 4) return '낮음'
      if (score <= 9) return '보통'
      if (score <= 16) return '높음'
      return '중대'
    }

    await c.env.DB.prepare(
      `UPDATE risk_assessment_items SET
       category=?, hazard=?, risk_factor=?,
       before_frequency=?, before_severity=?, before_risk_level=?,
       control_measures=?, after_frequency=?, after_severity=?, after_risk_level=?,
       responsible=?
       WHERE id=?`
    ).bind(
      category || '', hazard, risk_factor || '',
      bf, bs, riskLevel(bf * bs),
      cm, af, as_, riskLevel(af * as_),
      responsible || '관리감독자',
      Number(itemId)
    ).run()

    return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk PUT /items/manage/:itemId]', e.message)
    return c.json({ error: e.message || '항목 수정 실패' }, 500)
  }
})

// 위험성 평가 항목 비활성화(삭제)
app.delete('/items/manage/:itemId', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const itemId = c.req.param('itemId')
  try {
    await c.env.DB.prepare(
      'UPDATE risk_assessment_items SET is_active=0 WHERE id=?'
    ).bind(Number(itemId)).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[risk DELETE /items/manage/:itemId]', e.message)
    return c.json({ error: e.message || '항목 삭제 실패' }, 500)
  }
})

// FEAT-046: 작업유형별 항목 전체 조회 (리스트 페이지용)
app.get('/items/by-work-type/:workTypeId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const workTypeId = c.req.param('workTypeId')
  try {
    // COALESCE로 컬럼 누락 시 기본값 사용 (BUG-075: 구버전 DB 호환)
    const result = await c.env.DB.prepare(
      `SELECT rai.id, rai.work_type_id, rai.hazard,
              COALESCE(rai.risk_factor, '') as risk_factor,
              COALESCE(rai.before_frequency, 1) as likelihood,
              COALESCE(rai.before_severity, 1)  as severity,
              COALESCE(rai.control_measures, '') as countermeasure,
              COALESCE(rai.responsible, '관리감독자') as responsible,
              COALESCE(rai.after_frequency, 1) as after_frequency,
              COALESCE(rai.after_severity, 1)  as after_severity,
              COALESCE(rai.category, '')  as category,
              COALESCE(rai.note, '')       as note,
              COALESCE(rai.is_active, 1)   as is_active
       FROM risk_assessment_items rai
       WHERE rai.work_type_id = ?
         AND COALESCE(rai.is_active, 1) = 1
       ORDER BY rai.id`
    ).bind(Number(workTypeId)).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    console.error('[risk GET /items/by-work-type/:workTypeId]', e.message)
    return c.json({ error: e.message || '항목 조회 실패' }, 500)
  }
})

// FEAT-046: 단일 항목 조회
app.get('/items/manage/:itemId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const itemId = c.req.param('itemId')
  try {
    const row = await c.env.DB.prepare(
      `SELECT rai.id, rai.work_type_id, rai.hazard,
              COALESCE(rai.risk_factor, '') as risk_factor,
              COALESCE(rai.before_frequency, 1) as likelihood,
              COALESCE(rai.before_severity, 1)  as severity,
              COALESCE(rai.control_measures, '') as countermeasure,
              COALESCE(rai.responsible, '관리감독자') as responsible,
              COALESCE(rai.after_frequency, 1) as after_frequency,
              COALESCE(rai.after_severity, 1)  as after_severity,
              COALESCE(rai.category, '') as category,
              COALESCE(rai.note, '')     as note
       FROM risk_assessment_items rai
       WHERE rai.id = ? AND COALESCE(rai.is_active, 1) = 1`
    ).bind(Number(itemId)).first<any>()
    if (!row) return c.json({ error: '항목 없음' }, 404)
    return c.json(row)
  } catch (e: any) {
    console.error('[risk GET /items/manage/:itemId]', e.message)
    return c.json({ error: e.message || '항목 조회 실패' }, 500)
  }
})

// ─── 작업유형(work_types) 관리 ────────────────────────────────────────────────

// GET /risk/work-types — 전체 작업유형 목록 (대분류 포함)
app.get('/work-types', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    const result = await c.env.DB.prepare(
      `SELECT wt.id, wt.name, wt.code, wt.description, wt.category_id,
       wc.name as category_name,
       COUNT(rai.id) as item_count
       FROM work_types wt
       JOIN work_categories wc ON wc.id = wt.category_id
       LEFT JOIN risk_assessment_items rai
         ON rai.work_type_id = wt.id AND COALESCE(rai.is_active, 1) = 1
       GROUP BY wt.id ORDER BY wc.name, wt.name`
    ).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /risk/work-categories — 대분류 목록
app.get('/work-categories', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM work_categories ORDER BY name'
    ).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /risk/work-categories — 대분류 추가
app.post('/work-categories', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  try {
    const { name } = await c.req.json() as any
    if (!name?.trim()) return c.json({ error: '대분류명 필요' }, 400)
    const dup = await c.env.DB.prepare('SELECT id FROM work_categories WHERE name=?').bind(name.trim()).first<any>()
    if (dup) return c.json({ error: '이미 존재하는 대분류입니다.' }, 409)
    const r = await c.env.DB.prepare('INSERT INTO work_categories (name) VALUES (?)').bind(name.trim()).run()
    return c.json({ success: true, id: r.meta.last_row_id })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// DELETE /risk/work-categories/:id — 대분류 삭제 (하위 유형 없을 때만)
app.delete('/work-categories/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자만 삭제 가능합니다.' }, 403)
  const id = c.req.param('id')
  try {
    const child = await c.env.DB.prepare('SELECT id FROM work_types WHERE category_id=? LIMIT 1').bind(Number(id)).first<any>()
    if (child) return c.json({ error: '하위 작업유형이 있어 삭제할 수 없습니다. 유형을 먼저 삭제하세요.' }, 409)
    await c.env.DB.prepare('DELETE FROM work_categories WHERE id=?').bind(Number(id)).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /risk/work-types — 작업유형 추가
app.post('/work-types', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  try {
    const { category_id, name, code, description } = await c.req.json() as any
    if (!category_id || !name?.trim()) return c.json({ error: 'category_id, name 필요' }, 400)
    const dup = await c.env.DB.prepare('SELECT id FROM work_types WHERE name=? AND category_id=?').bind(name.trim(), Number(category_id)).first<any>()
    if (dup) return c.json({ error: '같은 대분류에 이미 동일한 유형명이 있습니다.' }, 409)
    const r = await c.env.DB.prepare(
      'INSERT INTO work_types (category_id, name, code, description) VALUES (?,?,?,?)'
    ).bind(Number(category_id), name.trim(), (code||'').trim().toUpperCase(), (description||'').trim()).run()
    return c.json({ success: true, id: r.meta.last_row_id })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// DELETE /risk/work-types/:id — 작업유형 삭제 (항목 없을 때만)
app.delete('/work-types/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자만 삭제 가능합니다.' }, 403)
  const id = c.req.param('id')
  try {
    const itemCnt = await c.env.DB.prepare('SELECT COUNT(*) as c FROM risk_assessment_items WHERE work_type_id=? AND COALESCE(is_active,1)=1').bind(Number(id)).first<any>()
    if (itemCnt && itemCnt.c > 0) return c.json({ error: `위험성평가 항목 ${itemCnt.c}건이 있어 삭제할 수 없습니다. 항목을 먼저 삭제하세요.` }, 409)
    await c.env.DB.prepare('DELETE FROM work_types WHERE id=?').bind(Number(id)).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── 엑셀 템플릿 다운로드 ─────────────────────────────────────────────────────
// GET /risk/items/template — 위험성평가 항목 입력양식 CSV 다운로드
app.get('/items/template', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    // 작업유형 목록 주석으로 포함
    const types = await c.env.DB.prepare(
      'SELECT wt.id, wc.name as cat, wt.name, wt.code FROM work_types wt JOIN work_categories wc ON wc.id=wt.category_id ORDER BY wc.name, wt.name'
    ).all<any>()
    const typeList = (types.results || []).map((t: any) => `# ${t.id}\t${t.cat}\t${t.name}\t(${t.code})`).join('\n')

    const header = '작업유형ID,분류,위험요인,위험사항,평가전빈도(1-5),평가전강도(1-5),감소대책,평가후빈도(1-5),평가후강도(1-5),담당자'
    const sample1 = '17,1. 기계적 요인,1-1 협착위험 부분(감김 끼임),줄자 사용 시 손가락 끼임,1,1,안전장갑 착용,1,1,관리감독자'
    const sample2 = '17,2. 전기적 요인,2-1 감전위험,전기공구 사용 시 감전,2,3,절연장갑 및 절연공구 사용,1,2,관리감독자'

    const bom = '\uFEFF'
    const content = bom +
      '# =====================================================\n' +
      '# SafetyNOTE 위험성평가 항목 입력 양식\n' +
      '# 이 파일을 엑셀에서 열어 데이터 입력 후 저장하세요\n' +
      '# =====================================================\n' +
      '#\n' +
      '# [빈도/강도 기준]\n' +
      '# 1=거의없음/경미  2=가끔/보통  3=종종/중간  4=자주/심각  5=항상/치명\n' +
      '#\n' +
      '# [사용 가능한 작업유형ID 목록]\n' +
      typeList + '\n' +
      '#\n' +
      header + '\n' +
      sample1 + '\n' +
      sample2 + '\n'

    return new Response(content, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="risk_items_template.csv"'
      }
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── 엑셀/CSV 업로드로 항목 일괄 등록 ───────────────────────────────────────
// POST /risk/items/import — CSV 파싱 후 risk_assessment_items 일괄 INSERT
app.post('/items/import', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: '파일이 없습니다.' }, 400)

    const text = await file.text()
    // BOM 제거
    const clean = text.replace(/^\uFEFF/, '')
    const lines = clean.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'))

    if (lines.length < 2) return c.json({ error: '데이터 행이 없습니다. 헤더 + 데이터 행이 필요합니다.' }, 400)

    // 헤더 파싱
    const headers = lines[0].split(',').map(h => h.trim())
    const iWorkTypeId    = headers.findIndex(h => h.includes('작업유형') || h.toLowerCase().includes('work_type'))
    const iCategory      = headers.findIndex(h => h.includes('분류'))
    const iHazard        = headers.findIndex(h => h.includes('위험요인') || h.includes('hazard'))
    const iRiskFactor    = headers.findIndex(h => h.includes('위험사항') || h.includes('risk_factor'))
    const iBeforeFreq    = headers.findIndex(h => h.includes('평가전빈도') || h.includes('before_frequency'))
    const iBeforeSev     = headers.findIndex(h => h.includes('평가전강도') || h.includes('before_severity'))
    const iControlMeas   = headers.findIndex(h => h.includes('감소대책') || h.includes('control'))
    const iAfterFreq     = headers.findIndex(h => h.includes('평가후빈도') || h.includes('after_frequency'))
    const iAfterSev      = headers.findIndex(h => h.includes('평가후강도') || h.includes('after_severity'))
    const iResponsible   = headers.findIndex(h => h.includes('담당자') || h.includes('responsible'))

    if (iWorkTypeId < 0 || iHazard < 0) {
      return c.json({ error: '필수 컬럼 없음 — 작업유형ID, 위험요인 컬럼이 필요합니다.' }, 400)
    }

    function riskLevel(score: number): string {
      if (score <= 4) return '낮음'
      if (score <= 9) return '보통'
      if (score <= 16) return '높음'
      return '중대'
    }

    // 유효한 work_type ids 캐시
    const validTypes = await c.env.DB.prepare('SELECT id FROM work_types').all<any>()
    const validTypeIds = new Set((validTypes.results || []).map((r: any) => Number(r.id)))

    let inserted = 0
    let skipped = 0
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c2 => c2.trim().replace(/^"|"$/g, ''))
      const workTypeId = Number(cols[iWorkTypeId] || 0)
      const hazard     = cols[iHazard] || ''

      if (!workTypeId || !hazard) { skipped++; continue }
      if (!validTypeIds.has(workTypeId)) {
        errors.push(`${i+1}행: 작업유형ID ${workTypeId} 없음`)
        skipped++; continue
      }

      const bf  = Math.min(5, Math.max(1, Number(iBeforeFreq  >= 0 ? cols[iBeforeFreq]  : 1) || 1))
      const bs  = Math.min(5, Math.max(1, Number(iBeforeSev   >= 0 ? cols[iBeforeSev]   : 1) || 1))
      const af  = Math.min(5, Math.max(1, Number(iAfterFreq   >= 0 ? cols[iAfterFreq]   : 1) || 1))
      const as_ = Math.min(5, Math.max(1, Number(iAfterSev    >= 0 ? cols[iAfterSev]    : 1) || 1))

      try {
        await c.env.DB.prepare(
          `INSERT INTO risk_assessment_items
           (work_type_id,category,hazard,risk_factor,
            before_frequency,before_severity,before_risk_level,
            control_measures,after_frequency,after_severity,after_risk_level,
            responsible,is_active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`
        ).bind(
          workTypeId,
          iCategory    >= 0 ? (cols[iCategory]    || '') : '',
          hazard,
          iRiskFactor  >= 0 ? (cols[iRiskFactor]  || '') : '',
          bf, bs, riskLevel(bf * bs),
          iControlMeas >= 0 ? (cols[iControlMeas] || '') : '',
          af, as_, riskLevel(af * as_),
          iResponsible >= 0 ? (cols[iResponsible] || '관리감독자') : '관리감독자'
        ).run()
        inserted++
      } catch (rowErr: any) {
        errors.push(`${i+1}행 오류: ${rowErr.message}`)
        skipped++
      }
    }

    return c.json({ success: true, inserted, skipped, errors: errors.slice(0, 10) })
  } catch (e: any) {
    console.error('[risk POST /items/import]', e.message)
    return c.json({ error: e.message || '업로드 실패' }, 500)
  }
})

// ─── 위험성 평가 상세 (반드시 마지막에 위치 — /:id 가 다른 경로를 덮어쓰지 않도록) ─
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  try {
  const ra = await c.env.DB.prepare(
    `SELECT ra.*, t.title as task_title,
     COALESCE(ra.location, t.location) as location,
     wt.name as work_type_name,
     u.name as assessor_name
     FROM risk_assessments ra
     LEFT JOIN tasks t ON t.id = ra.task_id
     LEFT JOIN work_types wt ON wt.id = t.work_type_id
     LEFT JOIN users u ON u.id = ra.assessor_id
     WHERE ra.id = ?`
  ).bind(id).first<any>()
  if (!ra) return c.json({ error: '평가 없음' }, 404)
  const details = await c.env.DB.prepare(
    'SELECT * FROM risk_assessment_details WHERE assessment_id = ? ORDER BY id'
  ).bind(id).all<any>()
  ra.details = details.results || []

  // 평가위원 목록도 함께 반환
  const members = await c.env.DB.prepare(
    `SELECT ram.id, ram.user_id, ram.role, ram.assigned_at,
     u.name, u.position, u.department
     FROM risk_assessment_members ram
     JOIN users u ON u.id = ram.user_id
     WHERE ram.assessment_id = ?
     ORDER BY CASE ram.role WHEN 'chair' THEN 0 ELSE 1 END, ram.assigned_at`
  ).bind(id).all<any>()
  ra.members = members.results || []

  return c.json(ra)
  } catch (e: any) {
    console.error('[risk GET /:id]', e.message)
    return c.json({ error: e.message || '평가 상세 조회 실패' }, 500)
  }
})

export default app
