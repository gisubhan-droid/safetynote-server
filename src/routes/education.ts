/**
 * 안전교육 관리 API (산업안전보건법 제29조)
 * edu_type: 'periodic' | 'hire' | 'job_change' | 'special' | 'supervisor'
 */
import { Hono } from 'hono'
import { getUser } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

/** 현재 연도/분기 계산 */
function getCurrentYearQuarter() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const quarter = Math.ceil(month / 3)
  return { year, quarter }
}

/** 참석자 배치 INSERT — for 루프 N+1 방지용 헬퍼 */
async function batchInsertAttendees(
  DB: D1Database,
  sessionId: number,
  attendees: any[]
) {
  const valid = attendees.filter((a: any) => !!a.user_name)
  if (valid.length === 0) return
  // D1 은 단일 VALUES(?,?,...),(?,?,...) 멀티 INSERT 지원
  const placeholders = valid.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
  const binds: any[] = []
  for (const att of valid) {
    binds.push(
      sessionId,
      att.user_id || null,
      att.user_name,
      att.department || null,
      att.position || null,
      att.attended !== undefined ? att.attended : 1
    )
  }
  await DB.prepare(
    `INSERT INTO safety_education_attendees
       (session_id, user_id, user_name, department, position, attended)
     VALUES ${placeholders}`
  ).bind(...binds).run()
}

/** 교육 유형별 한글명 */
const EDU_TYPE_LABEL: Record<string, string> = {
  periodic:   '정기안전교육',
  hire:       '채용시안전교육',
  job_change: '작업내용변경시교육',
  special:    '특별안전교육',
  supervisor: '관리감독자교육',
}

/** 대상 유형별 한글명 */
const TARGET_TYPE_LABEL: Record<string, string> = {
  office:     '사무직/판매직',
  field:      '그 외 근로자',
  daily:      '일용근로자(1주 이하)',
  daily_month:'기간제(1주~1개월)',
  supervisor: '관리감독자',
}

/** 산업안전보건법 제29조 기준 최소 교육시간 */
const LEGAL_MIN_HOURS: Record<string, Record<string, number>> = {
  periodic: {
    office:  6,   // 매 분기 6시간 이상 (사무직/판매직)
    field:   12,  // 매 분기 12시간 이상 (그 외)
  },
  hire: {
    daily:       1,  // 1시간 이상 (일용 1주 이하)
    daily_month: 4,  // 4시간 이상 (기간제 1주~1개월)
    field:       8,  // 8시간 이상 (그 외)
  },
  job_change: {
    daily: 1,  // 1시간 이상 (일용 1주 이하)
    field: 2,  // 2시간 이상 (그 외)
  },
  special: {
    daily:      2,   // 2시간 이상 (일용 1주 이하, 타워크레인 제외)
    daily_crane: 8,  // 8시간 이상 (타워크레인 신호 일용)
    field:      16,  // 16시간 이상 (그 외)
  },
  supervisor: {
    supervisor: 16, // 연간 16시간 이상
  },
}

/** 교육 유형별 법령 기본 교육내용 (시행규칙 별표 5) */
const LEGAL_DEFAULT_CONTENT: Record<string, string> = {
  periodic: `1. 산업안전 및 사고 예방에 관한 사항
2. 산업보건 및 직업병 예방에 관한 사항
3. 건강증진 및 질병 예방에 관한 사항
4. 유해·위험 작업환경 관리에 관한 사항
5. 산업안전보건법령 및 산업재해보상보험 제도에 관한 사항
6. 직무스트레스 예방 및 관리에 관한 사항
7. 직장 내 괴롭힘, 고객의 폭언 등으로 인한 건강장해 예방 및 관리에 관한 사항`,

  hire: `1. 기계·기구의 위험성과 작업의 순서 및 동선에 관한 사항
2. 작업 개시 전 점검에 관한 사항
3. 정리정돈 및 청소에 관한 사항
4. 사고 발생 시 긴급조치에 관한 사항
5. 산업보건 및 직업병 예방에 관한 사항
6. 물질안전보건자료에 관한 사항
7. 산업안전보건법령 및 산업재해보상보험 제도에 관한 사항`,

  job_change: `1. 기계·기구의 위험성과 작업의 순서 및 동선에 관한 사항
2. 작업 개시 전 점검에 관한 사항
3. 변경된 작업방법 및 공정 안전조치에 관한 사항
4. 해당 설비 또는 작업의 유해·위험성에 관한 사항
5. 이상 발생 시 긴급조치에 관한 사항`,

  special: `1. 해당 작업의 유해·위험성에 관한 사항
2. 작업 절차 및 안전작업 방법에 관한 사항
3. 보호구 착용 및 관리에 관한 사항
4. 이상 시 비상조치 및 응급처치에 관한 사항
5. 물질안전보건자료에 관한 사항
6. 관련 법령에 관한 사항`,

  supervisor: `1. 작업공정의 유해·위험과 재해 예방대책에 관한 사항
2. 표준안전 작업방법 및 지도 요령에 관한 사항
3. 관리감독자의 역할과 임무에 관한 사항
4. 산업보건의 관리에 관한 사항
5. 안전보건교육 능력 배양에 관한 사항
6. 위험성평가의 실시에 관한 사항`,
}

// ─── 교육 세션 목록 조회 ────────────────────────────────────────────────────

/**
 * GET /api/education/sessions
 * query: edu_type, year, quarter, page, limit
 */
app.get('/sessions', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { DB } = c.env
    const eduType = c.req.query('edu_type') || ''
    const year    = c.req.query('year')     || new Date().getFullYear().toString()
    const quarter = c.req.query('quarter')  || ''
    const page    = parseInt(c.req.query('page')  || '1')
    const limit   = parseInt(c.req.query('limit') || '20')
    const offset  = (page - 1) * limit

    let where = 'WHERE 1=1'
    const params: any[] = []

    if (eduType) { where += ' AND s.edu_type = ?'; params.push(eduType) }
    if (year)    { where += ' AND s.year = ?';     params.push(Number(year)) }
    if (quarter) { where += ' AND s.quarter = ?';  params.push(Number(quarter)) }

    const countRow: any = await DB.prepare(
      `SELECT COUNT(*) as cnt FROM safety_education_sessions s ${where}`
    ).bind(...params).first()
    const total = countRow?.cnt || 0

    const rows = (await DB.prepare(`
      SELECT s.*,
             u.name as creator_name,
             COUNT(a.id) as attendee_count
      FROM safety_education_sessions s
      LEFT JOIN users u ON u.id = s.created_by
      LEFT JOIN safety_education_attendees a ON a.session_id = s.id
      ${where}
      GROUP BY s.id
      ORDER BY s.edu_date DESC, s.id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()).results

    return c.json({ sessions: rows, total, page, limit })
  } catch (e: any) {
    console.error('[education GET /sessions]', e.message)
    return c.json({ error: e.message || '교육 세션 목록 조회 실패' }, 500)
  }
})

// ─── 교육 유형별 기본 교육내용 조회 ──────────────────────────────────────────

/**
 * GET /api/education/default-content/:eduType
 * 교육 유형별 법령 기본 교육내용 반환
 */
app.get('/default-content/:eduType', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const eduType = c.req.param('eduType')
  const content = LEGAL_DEFAULT_CONTENT[eduType] || ''
  return c.json({ edu_type: eduType, content })
})

// ─── 교육 세션 단건 조회 ───────────────────────────────────────────────────

/**
 * GET /api/education/sessions/:id
 */
app.get('/sessions/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { DB } = c.env
    const id = Number(c.req.param('id'))

    const session: any = await DB.prepare(`
      SELECT s.*, u.name as creator_name
      FROM safety_education_sessions s
      LEFT JOIN users u ON u.id = s.created_by
      WHERE s.id = ?
    `).bind(id).first()

    if (!session) return c.json({ error: '교육 세션을 찾을 수 없습니다.' }, 404)

    const attendees = (await DB.prepare(`
      SELECT a.*, u.name as user_real_name, u.department as user_department, u.position as user_position
      FROM safety_education_attendees a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.session_id = ?
      ORDER BY a.id
    `).bind(id).all()).results

    return c.json({ session, attendees })
  } catch (e: any) {
    console.error('[education GET /sessions/:id]', e.message)
    return c.json({ error: e.message || '교육 세션 조회 실패' }, 500)
  }
})

// ─── 교육 세션 생성 ────────────────────────────────────────────────────────

/**
 * POST /api/education/sessions
 */
app.post('/sessions', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { DB } = c.env
    const body: any = await c.req.json()

    const {
      edu_type, edu_subject, edu_date, edu_hours,
      start_time, end_time, edu_content,
      instructor, location, quarter, year,
      target_type, special_work_type, notes,
      lunch_break,
      attendees = []
    } = body

    // 필수 항목 검증
    if (!edu_type || !edu_subject || !edu_date || !edu_hours) {
      return c.json({ error: '교육유형, 과목, 일자, 시간은 필수입니다.' }, 400)
    }

    // 법적 최소 시간 경고 (차단은 안 함)
    const minHours = LEGAL_MIN_HOURS[edu_type]?.[target_type || 'field'] || 0
    const legalWarning = edu_hours < minHours
      ? `법적 최소 교육시간(${minHours}시간)에 미달합니다.`
      : null

    // 연도 자동 계산
    const computedYear = year || new Date(edu_date).getFullYear()

    const result = await DB.prepare(`
      INSERT INTO safety_education_sessions
        (edu_type, edu_subject, edu_date, edu_hours, start_time, end_time, edu_content,
         instructor, location, quarter, year, target_type, special_work_type, notes,
         lunch_break, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      edu_type, edu_subject, edu_date, edu_hours,
      start_time || null, end_time || null,
      edu_content || LEGAL_DEFAULT_CONTENT[edu_type] || null,
      instructor || null, location || null,
      quarter || null, computedYear,
      target_type || null, special_work_type || null,
      notes || null,
      lunch_break ? 1 : 0,
      user.id
    ).run()

    const sessionId = Number(result.meta.last_row_id)

    // 참석자 배치 INSERT (N+1 → 단일 쿼리)
    try {
      await batchInsertAttendees(DB, sessionId, attendees)
    } catch (attErr: any) {
      console.warn('[education POST /sessions] 참석자 INSERT 실패 (무시):', attErr.message)
    }

    return c.json({ success: true, id: sessionId, legal_warning: legalWarning }, 201)
  } catch (e: any) {
    console.error('[education POST /sessions]', e.message)
    return c.json({ error: e.message || '교육 세션 생성 실패' }, 500)
  }
})

// ─── 교육 세션 수정 ────────────────────────────────────────────────────────

/**
 * PUT /api/education/sessions/:id
 */
app.put('/sessions/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { DB } = c.env
    const id = Number(c.req.param('id'))
    const body: any = await c.req.json()

    const session: any = await DB.prepare(
      'SELECT * FROM safety_education_sessions WHERE id = ?'
    ).bind(id).first()
    if (!session) return c.json({ error: '세션 없음' }, 404)

    const {
      edu_type, edu_subject, edu_date, edu_hours,
      start_time, end_time, edu_content,
      instructor, location, quarter, year,
      target_type, special_work_type, notes,
      lunch_break,
      attendees
    } = body

    await DB.prepare(`
      UPDATE safety_education_sessions SET
        edu_type = ?, edu_subject = ?, edu_date = ?, edu_hours = ?,
        start_time = ?, end_time = ?, edu_content = ?,
        instructor = ?, location = ?, quarter = ?, year = ?,
        target_type = ?, special_work_type = ?, notes = ?,
        lunch_break = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      edu_type, edu_subject, edu_date, edu_hours,
      start_time || null, end_time || null, edu_content || null,
      instructor || null, location || null,
      quarter || null, year || new Date(edu_date).getFullYear(),
      target_type || null, special_work_type || null,
      notes || null,
      lunch_break ? 1 : 0,
      id
    ).run()

    // 참석자 업데이트 (전달된 경우) — DELETE 후 배치 INSERT
    if (attendees !== undefined) {
      try {
        await DB.prepare('DELETE FROM safety_education_attendees WHERE session_id = ?').bind(id).run()
        await batchInsertAttendees(DB, id, attendees || [])
      } catch (attErr: any) {
        console.warn('[education PUT /sessions/:id] 참석자 업데이트 실패 (무시):', attErr.message)
      }
    }

    return c.json({ success: true })
  } catch (e: any) {
    console.error('[education PUT /sessions/:id]', e.message)
    return c.json({ error: e.message || '교육 세션 수정 실패' }, 500)
  }
})

// ─── 교육 세션 삭제 ────────────────────────────────────────────────────────

/**
 * DELETE /api/education/sessions/:id
 */
app.delete('/sessions/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (!['system_admin', 'safety_manager'].includes(user.role || '')) {
    return c.json({ error: '권한 없음' }, 403)
  }

  try {
    const { DB } = c.env
    const id = Number(c.req.param('id'))

    await DB.prepare('DELETE FROM safety_education_sessions WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[education DELETE /sessions/:id]', e.message)
    return c.json({ error: e.message || '교육 세션 삭제 실패' }, 500)
  }
})

// ─── 교육 완료처리 ────────────────────────────────────────────────────────

/**
 * POST /api/education/sessions/:id/complete
 * 교육 완료처리 + 참석자(user_id 있는 경우) 안전교육 이수현황 자동 업데이트
 *
 * 업데이트 필드 (users 테이블):
 *   - periodic   → edu_periodic_date (마지막 정기교육일)
 *   - hire       → edu_hire_date
 *   - job_change → edu_job_change_date (없으면 edu_hire_date 보조)
 *   - special    → edu_special_date (마지막 특별교육일)
 *   - supervisor → edu_supervisor_date
 */
app.post('/sessions/:id/complete', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (!['system_admin', 'safety_manager'].includes(user.role || '')) {
    return c.json({ error: '권한 없음 (관리자만 완료처리 가능)' }, 403)
  }

  try {
    const { DB } = c.env
    const sessionId = Number(c.req.param('id'))

    const session: any = await DB.prepare(
      'SELECT * FROM safety_education_sessions WHERE id = ?'
    ).bind(sessionId).first()
    if (!session) return c.json({ error: '교육 세션 없음' }, 404)
    if (session.is_completed) return c.json({ error: '이미 완료처리된 교육입니다.' }, 409)

    // 1) 세션 완료 표시
    await DB.prepare(`
      UPDATE safety_education_sessions
      SET is_completed = 1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(sessionId).run()

    // 2) 참석한 등록 사용자의 이수현황 업데이트
    const attendees: any[] = (await DB.prepare(`
      SELECT user_id FROM safety_education_attendees
      WHERE session_id = ? AND attended = 1 AND user_id IS NOT NULL
    `).bind(sessionId).all()).results

    const eduDate = session.edu_date
    const eduType = session.edu_type

    // 교육 유형 → users 컬럼 매핑
    const colMap: Record<string, string> = {
      periodic:   'edu_periodic_date',
      hire:       'edu_hire_date',
      job_change: 'edu_job_change_date',
      special:    'edu_special_date',
      supervisor: 'edu_supervisor_date',
    }
    const col = colMap[eduType]

    let updatedCount = 0
    if (col) {
      // users 테이블에 해당 컬럼이 없을 경우 조용히 스킵 (ALTER는 patchSchema에서 처리)
      for (const att of attendees) {
        try {
          await DB.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`)
            .bind(eduDate, att.user_id).run()
          updatedCount++
        } catch(e: any) {
          console.warn(`[education complete] users.${col} 업데이트 실패 uid=${att.user_id}:`, e.message)
        }
      }
    }

    return c.json({
      success: true,
      session_id: sessionId,
      edu_type: eduType,
      edu_date: eduDate,
      updated_users: updatedCount,
    })
  } catch (e: any) {
    console.error('[education POST /sessions/:id/complete]', e.message)
    return c.json({ error: e.message || '교육 완료처리 실패' }, 500)
  }
})

// ─── 참석자 추가/삭제 ──────────────────────────────────────────────────────

/**
 * POST /api/education/sessions/:id/attendees
 */
app.post('/sessions/:id/attendees', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { DB } = c.env
    const sessionId = Number(c.req.param('id'))
    const body: any = await c.req.json()
    const { attendees = [] } = body

    const validAtts = attendees.filter((a: any) => !!a.user_name)
    await batchInsertAttendees(DB, sessionId, validAtts)

    return c.json({ success: true, added: validAtts.length })
  } catch (e: any) {
    console.error('[education POST /sessions/:id/attendees]', e.message)
    return c.json({ error: e.message || '참석자 추가 실패' }, 500)
  }
})

/**
 * PATCH /api/education/attendees/:id/signature  — 서명 이미지 저장
 */
app.patch('/attendees/:id/signature', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { DB } = c.env
    const id = Number(c.req.param('id'))
    const body: any = await c.req.json().catch(() => ({}))
    const signData: string | null = body.sign_data || null

    await DB.prepare(
      'UPDATE safety_education_attendees SET signature_data = ? WHERE id = ?'
    ).bind(signData, id).run()

    return c.json({ success: true })
  } catch (e: any) {
    console.error('[education PATCH /attendees/:id/signature]', e.message)
    return c.json({ error: e.message || '서명 저장 실패' }, 500)
  }
})

/**
 * DELETE /api/education/attendees/:id
 */
app.delete('/attendees/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { DB } = c.env
    const id = Number(c.req.param('id'))
    await DB.prepare('DELETE FROM safety_education_attendees WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[education DELETE /attendees/:id]', e.message)
    return c.json({ error: e.message || '참석자 삭제 실패' }, 500)
  }
})

// ─── 통계 ──────────────────────────────────────────────────────────────────

/**
 * GET /api/education/stats
 * 연도별 교육 현황 요약
 * query: year
 */
app.get('/stats', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { DB } = c.env
    const year = parseInt(c.req.query('year') || new Date().getFullYear().toString())

    // 교육유형별 집계
    const typeSummary = (await DB.prepare(`
      SELECT
        edu_type,
        COUNT(*) as session_count,
        SUM(edu_hours) as total_hours,
        (SELECT COUNT(*) FROM safety_education_attendees a
         WHERE a.session_id IN (
           SELECT id FROM safety_education_sessions WHERE edu_type = s.edu_type AND year = ?
         ) AND a.attended = 1) as total_attendees
      FROM safety_education_sessions s
      WHERE year = ?
      GROUP BY edu_type
      ORDER BY edu_type
    `).bind(year, year).all()).results

    // 분기별 정기교육 현황
    const quarterlyPeriodic = (await DB.prepare(`
      SELECT
        quarter,
        target_type,
        SUM(edu_hours) as total_hours,
        COUNT(*) as session_count
      FROM safety_education_sessions
      WHERE year = ? AND edu_type = 'periodic'
      GROUP BY quarter, target_type
      ORDER BY quarter
    `).bind(year).all()).results

    // 최근 6개월 교육 트렌드
    const trend = (await DB.prepare(`
      SELECT
        strftime('%Y-%m', edu_date) as month,
        edu_type,
        COUNT(*) as cnt,
        SUM(edu_hours) as hours
      FROM safety_education_sessions
      WHERE edu_date >= date('now', '-6 months')
      GROUP BY month, edu_type
      ORDER BY month, edu_type
    `).all()).results

    // 연도별 전체 요약
    const yearTotal = (await DB.prepare(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(edu_hours) as total_hours,
        (SELECT COUNT(*) FROM safety_education_attendees a2
         WHERE a2.session_id IN (SELECT id FROM safety_education_sessions WHERE year = ?)
         AND a2.attended = 1) as total_attendees
      FROM safety_education_sessions
      WHERE year = ?
    `).bind(year, year).first()) as any

    // 법적 준수 여부 체크 (정기교육 분기별) — for 루프 N+1 → 단일 GROUP BY 쿼리
    const { quarter: currentQ } = getCurrentYearQuarter()
    const legalCheck = []
    const periodicRows = (await DB.prepare(`
      SELECT quarter, target_type, COALESCE(SUM(edu_hours), 0) as hours
      FROM safety_education_sessions
      WHERE year = ? AND edu_type = 'periodic' AND quarter IS NOT NULL
      GROUP BY quarter, target_type
    `).bind(year).all()).results as any[]

    // quarter×target_type → hours 맵
    const periodicMap: Record<string, number> = {}
    for (const row of periodicRows) {
      periodicMap[`${row.quarter}_${row.target_type}`] = Number(row.hours) || 0
    }
    for (let q = 1; q <= currentQ; q++) {
      const officeH = periodicMap[`${q}_office`] || 0
      const fieldH  = periodicMap[`${q}_field`]  || 0
      legalCheck.push({
        quarter: q,
        office_hours: officeH,
        office_min: 6,
        office_ok: officeH >= 6,
        field_hours: fieldH,
        field_min: 12,
        field_ok: fieldH >= 12,
      })
    }

    // 관리감독자 연간 교육시간 체크
    const supervisorHours: any = await DB.prepare(`
      SELECT COALESCE(SUM(edu_hours), 0) as hours
      FROM safety_education_sessions
      WHERE year = ? AND edu_type = 'supervisor'
    `).bind(year).first()

    return c.json({
      year,
      year_total: yearTotal,
      type_summary: typeSummary,
      quarterly_periodic: quarterlyPeriodic,
      trend,
      legal_check: {
        periodic_quarterly: legalCheck,
        supervisor_annual: {
          hours: supervisorHours?.hours || 0,
          min: 16,
          ok: (supervisorHours?.hours || 0) >= 16,
        }
      },
      edu_type_labels: EDU_TYPE_LABEL,
      target_type_labels: TARGET_TYPE_LABEL,
      legal_min_hours: LEGAL_MIN_HOURS,
    })
  } catch (e: any) {
    console.error('[education GET /stats]', e.message)
    return c.json({ error: e.message || '교육 통계 조회 실패' }, 500)
  }
})

/**
 * GET /api/education/user-history/:userId
 * 특정 사용자의 교육 이수 이력
 */
app.get('/user-history/:userId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { DB } = c.env
    const userId = Number(c.req.param('userId'))

    const history = (await DB.prepare(`
      SELECT a.*, s.edu_type, s.edu_subject, s.edu_date, s.edu_hours,
             s.instructor, s.location, s.year, s.quarter, s.target_type, s.is_completed
      FROM safety_education_attendees a
      JOIN safety_education_sessions s ON s.id = a.session_id
      WHERE a.user_id = ? AND a.attended = 1
      ORDER BY s.edu_date DESC
    `).bind(userId).all()).results

    return c.json({ user_id: userId, history })
  } catch (e: any) {
    console.error('[education GET /user-history/:userId]', e.message)
    return c.json({ error: e.message || '교육 이수 이력 조회 실패' }, 500)
  }
})

export default app
