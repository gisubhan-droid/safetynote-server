import { Hono } from 'hono'
import { getUser } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()


// 전체 대시보드 통계
app.get('/dashboard', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    // 기간 파라미터: start_date / end_date 또는 year+month 조합 지원
    const { start_date, end_date, year, month } = c.req.query()
    let periodStart: string | null = null
    let periodEnd: string | null = null

    if (start_date && end_date) {
      periodStart = start_date
      periodEnd = end_date
    } else if (year && month) {
      const y = Number(year)
      const m = Number(month)
      periodStart = `${y}-${String(m).padStart(2,'0')}-01`
      periodEnd = new Date(y, m, 0).toISOString().split('T')[0]
    } else if (year) {
      periodStart = `${year}-01-01`
      periodEnd = `${year}-12-31`
    }
    // periodStart/periodEnd가 null이면 전체 기간

    // planned_date 기간 조건절 생성 (t. 별칭 통일 — BUG-081)
    // 모든 쿼리에서 tasks 테이블을 't'로 별칭하므로 t.planned_date 형태 사용
    const periodWhere = periodStart && periodEnd
      ? `AND t.planned_date BETWEEN '${periodStart}' AND '${periodEnd}'`
      : ''

    const today = new Date().toISOString().split('T')[0]

    // [FEAT-048] LGU+ 역할 판별: role='lgu_plus' 단일 + 구버전 호환 (role='lgu', sub_role='lgu_plus')
    const isLgu = user.role === 'lgu_plus' || user.role === 'lgu' || (user as any).sub_role === 'lgu_plus'
    // [BUG-081] 모든 쿼리를 't' 별칭으로 통일 — constructions.status와 tasks.status 모호성 방지
    // constructions 테이블에도 status 컬럼이 있으므로 반드시 t.컬럼명 형태로 명시 필요
    const lguJoin  = isLgu ? `LEFT JOIN constructions con ON con.id = t.construction_id` : ''
    const lguWhere = isLgu ? `AND COALESCE(con.is_auto_request_no, -1) = 0` : ''

    const [taskCounts, recentTasks, highRiskCount, categoryStats, todayTasks] = await Promise.all([
      // [LGU+ 필터] 기간 필터 적용한 작업 상태별 건수
      // [BUG-081] 'tasks' → 't' 별칭 통일: t.status, t.planned_date 명시
      c.env.DB.prepare(
        `SELECT t.status, COUNT(*) as count FROM tasks t
         ${lguJoin}
         WHERE 1=1 ${periodWhere} ${lguWhere}
         GROUP BY t.status`
      ).all<any>(),
      // [LGU+ 필터] 진행중 작업 (기간 내)
      c.env.DB.prepare(
        `SELECT t.*, wc.name as category_name FROM tasks t
         LEFT JOIN work_categories wc ON wc.id = t.category_id
         ${lguJoin}
         WHERE t.status IN ('working','in_progress','tbm_done','assigned') ${periodWhere} ${lguWhere}
         ORDER BY t.updated_at DESC LIMIT 10`
      ).all<any>(),
      // [LGU+ 필터] 고위험 작업건수: risk_level = 'high', 완료/취소 제외
      // [BUG-081] t.risk_level, t.status 명시 — constructions.status 모호성 제거
      c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM tasks t
         ${lguJoin}
         WHERE t.risk_level = 'high'
           AND t.status NOT IN ('completed','cancelled')
           ${periodWhere} ${lguWhere}`
      ).first<any>(),
      // [LGU+ 필터] 공사종류별 배정현황: construction_type 기준 전체/진행중/완료 작업 수 (기간 필터)
      // [BUG-081] t.construction_type, t.status 명시 — 모호성 제거
      c.env.DB.prepare(
        `SELECT
           CASE WHEN t.construction_type = '' OR t.construction_type IS NULL THEN '미분류' ELSE t.construction_type END as category_name,
           COUNT(*) as total_count,
           SUM(CASE WHEN t.status IN ('working','in_progress','tbm_done','assigned') THEN 1 ELSE 0 END) as active_count,
           SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_count
         FROM tasks t
         ${lguJoin}
         WHERE 1=1 ${periodWhere} ${lguWhere}
         GROUP BY t.construction_type
         ORDER BY total_count DESC`
      ).all<any>(),
      // [LGU+ 필터] 금일 예정 작업: planned_date = 오늘, 상태·공사종류 포함
      c.env.DB.prepare(
        `SELECT t.id, t.task_number, t.title, t.location, t.status,
                t.construction_type, t.risk_level, t.planned_date,
                GROUP_CONCAT(u.name, ', ') as worker_names
         FROM tasks t
         LEFT JOIN task_assignments ta ON ta.task_id = t.id
         LEFT JOIN users u ON u.id = ta.worker_id
         ${lguJoin}
         WHERE t.planned_date = ? ${lguWhere}
         GROUP BY t.id
         ORDER BY t.status, t.id`
      ).bind(today).all<any>()
    ])

    return c.json({
      taskCounts: taskCounts.results || [],
      recentTasks: recentTasks.results || [],
      highRiskCount: highRiskCount?.count || 0,
      categoryStats: categoryStats.results || [],
      todayTasks: todayTasks.results || [],
      today,
      period: { start: periodStart, end: periodEnd }
    })
  } catch (e: any) {
    console.error('[stats GET /dashboard]', e.message)
    return c.json({ error: e.message || '대시보드 통계 조회 실패' }, 500)
  }
})

// 일별 통계
app.get('/daily', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { date } = c.req.query()
    const targetDate = date || new Date().toISOString().split('T')[0]

    const [tasks, logs] = await Promise.all([
      c.env.DB.prepare(
        `SELECT t.*, wc.name as category_name FROM tasks t
         LEFT JOIN work_categories wc ON wc.id = t.category_id
         WHERE t.planned_date = ? ORDER BY t.status`
      ).bind(targetDate).all<any>(),
      c.env.DB.prepare(
        `SELECT wl.*, t.title as task_title, u.name as worker_name
         FROM work_logs wl LEFT JOIN tasks t ON t.id = wl.task_id LEFT JOIN users u ON u.id = wl.worker_id
         WHERE wl.log_date = ? ORDER BY wl.created_at DESC`
      ).bind(targetDate).all<any>()
    ])

    return c.json({
      date: targetDate,
      tasks: tasks.results || [],
      logs: logs.results || []
    })
  } catch (e: any) {
    console.error('[stats GET /daily]', e.message)
    return c.json({ error: e.message || '일별 통계 조회 실패' }, 500)
  }
})

// 주별 통계 — 직전 4주간 데이터
app.get('/weekly', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    // 직전 4주 범위 계산 (오늘 포함 주 기준 4주 전 월요일 ~ 오늘)
    const today = new Date()
    // 이번 주 월요일 기준으로 4주 전 월요일 계산
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay() // 1=Mon ... 7=Sun
    const thisMonday = new Date(today)
    thisMonday.setDate(today.getDate() - (dayOfWeek - 1))

    const fourWeeksAgo = new Date(thisMonday)
    fourWeeksAgo.setDate(thisMonday.getDate() - 21) // 3주 전 월요일 = 4주 전체 시작

    const start = fourWeeksAgo.toISOString().split('T')[0]
    const end = today.toISOString().split('T')[0]

    // 주차별 메타데이터 생성 (4주: W-3, W-2, W-1, 이번주)
    const weeks: { label: string; start: string; end: string }[] = []
    for (let i = 0; i < 4; i++) {
      const wStart = new Date(fourWeeksAgo)
      wStart.setDate(fourWeeksAgo.getDate() + i * 7)
      const wEnd = new Date(wStart)
      wEnd.setDate(wStart.getDate() + 6)
      const label = i === 3 ? '이번 주' : `${3 - i}주 전`
      weeks.push({
        label,
        start: wStart.toISOString().split('T')[0],
        end: wEnd.toISOString().split('T')[0]
      })
    }

    const [taskStats, quantityStats] = await Promise.all([
      c.env.DB.prepare(
        `SELECT planned_date, status, COUNT(*) as count FROM tasks
         WHERE planned_date BETWEEN ? AND ? GROUP BY planned_date, status ORDER BY planned_date`
      ).bind(start, end).all<any>(),
      c.env.DB.prepare(
        `SELECT log_date, SUM(actual_quantity) as total_quantity, COUNT(*) as log_count
         FROM work_logs WHERE log_date BETWEEN ? AND ? GROUP BY log_date ORDER BY log_date`
      ).bind(start, end).all<any>()
    ])

    return c.json({
      start, end,
      weeks,                              // 4주차 메타 배열
      taskStats: taskStats.results || [],
      quantityStats: quantityStats.results || []
    })
  } catch (e: any) {
    console.error('[stats GET /weekly]', e.message)
    return c.json({ error: e.message || '주별 통계 조회 실패' }, 500)
  }
})

// 월별 통계
app.get('/monthly', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { year, month } = c.req.query()
    // con_types: 쉼표 구분 문자열 또는 배열 파라미터 모두 지원
    // 예) ?con_types=지장이설,청약개통  또는  ?con_types[]=지장이설&con_types[]=청약개통
    const rawConTypes = c.req.queries('con_types') || []
    const conTypes: string[] = rawConTypes
      .flatMap((s: string) => s.split(',').map((x: string) => x.trim()))
      .filter(Boolean)
    const hasConFilter = conTypes.length > 0
    const conPlaceholders = conTypes.map(() => '?').join(',')
    // con_types 필터 SQL 절 (tasks.construction_type 컬럼은 한글 저장)
    const conFilterClause = hasConFilter
      ? `AND t.construction_type IN (${conPlaceholders})`
      : ''
    // tasks 테이블 직접 필터 (JOIN 없는 쿼리용)
    const conFilterDirect = hasConFilter
      ? `AND construction_type IN (${conPlaceholders})`
      : ''

    const now = new Date()
    const y = year || now.getFullYear()
    const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

    const [taskStats, categoryStats, quantityStats, workClassStats, workClassCompletedStats, ctStats, ctCompletedStats] = await Promise.all([
      // con_types 필터 적용 — tasks 직접
      c.env.DB.prepare(
        `SELECT status, COUNT(*) as count FROM tasks
         WHERE planned_date BETWEEN ? AND ? ${conFilterDirect} GROUP BY status`
      ).bind(start, end, ...conTypes).all<any>(),
      // 카테고리 통계 — con_types 필터 적용
      c.env.DB.prepare(
        `SELECT wc.name as category, COUNT(t.id) as count
         FROM tasks t LEFT JOIN work_categories wc ON wc.id = t.category_id
         WHERE t.planned_date BETWEEN ? AND ? ${conFilterClause} GROUP BY t.category_id ORDER BY count DESC`
      ).bind(start, end, ...conTypes).all<any>(),
      c.env.DB.prepare(
        `SELECT SUM(actual_quantity) as total_quantity, COUNT(*) as log_count
         FROM work_logs WHERE log_date BETWEEN ? AND ?`
      ).bind(start, end).first<any>(),
      // 작업 분류별(work_class) 전체 건수 — con_types 필터 적용
      c.env.DB.prepare(
        `SELECT COALESCE(work_class_new, work_class, 'cable_install') as work_class, COUNT(*) as count
         FROM tasks WHERE planned_date BETWEEN ? AND ? ${conFilterDirect}
         GROUP BY COALESCE(work_class_new, work_class, 'cable_install') ORDER BY count DESC`
      ).bind(start, end, ...conTypes).all<any>(),
      // 작업 분류별(work_class) 완료 건수 — con_types 필터 적용
      c.env.DB.prepare(
        `SELECT COALESCE(work_class_new, work_class, 'cable_install') as work_class, COUNT(*) as completed_count
         FROM tasks WHERE planned_date BETWEEN ? AND ? AND status = 'completed' ${conFilterDirect}
         GROUP BY COALESCE(work_class_new, work_class, 'cable_install')`
      ).bind(start, end, ...conTypes).all<any>(),
      // 공사종류(construction_type) 기준 전체 건수 — 항상 고정 4종 전체 반환 (필터 미적용)
      c.env.DB.prepare(
        `SELECT ct.key as construction_type, COUNT(t.id) as count
         FROM (
           SELECT '지장이설' as key, 1 as ord UNION ALL
           SELECT '청약개통' as key, 2 as ord UNION ALL
           SELECT '관로'     as key, 3 as ord UNION ALL
           SELECT '환경공사' as key, 4 as ord
         ) ct
         LEFT JOIN tasks t ON t.construction_type = ct.key
           AND t.planned_date BETWEEN ? AND ?
         GROUP BY ct.key ORDER BY ct.ord`
      ).bind(start, end).all<any>(),
      // 공사종류(construction_type) 기준 완료 건수 — 항상 고정 4종 전체 반환 (필터 미적용)
      c.env.DB.prepare(
        `SELECT ct.key as construction_type, COUNT(t.id) as completed_count
         FROM (
           SELECT '지장이설' as key, 1 as ord UNION ALL
           SELECT '청약개통' as key, 2 as ord UNION ALL
           SELECT '관로'     as key, 3 as ord UNION ALL
           SELECT '환경공사' as key, 4 as ord
         ) ct
         LEFT JOIN tasks t ON t.construction_type = ct.key
           AND t.planned_date BETWEEN ? AND ?
           AND t.status = 'completed'
         GROUP BY ct.key ORDER BY ct.ord`
      ).bind(start, end).all<any>()
    ])

    return c.json({
      year: y, month: m, start, end,
      taskStats: taskStats.results || [],
      categoryStats: categoryStats.results || [],
      quantityStats: quantityStats || { total_quantity: 0, log_count: 0 },
      workClassStats: workClassStats.results || [],
      workClassCompletedStats: workClassCompletedStats.results || [],
      ctStats: ctStats.results || [],
      ctCompletedStats: ctCompletedStats.results || []
    })
  } catch (e: any) {
    console.error('[stats GET /monthly]', e.message)
    return c.json({ error: e.message || '월별 통계 조회 실패' }, 500)
  }
})

// 공사종류별 완료건수 통계 — construction_type(등록폼 기준 4종) 기반
// planned_date OR work_date 이중 필터
app.get('/completed/by-category', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { year, month } = c.req.query()
    // con_types 필터 파라미터
    const rawConTypes = c.req.queries('con_types') || []
    const conTypes: string[] = rawConTypes
      .flatMap((s: string) => s.split(',').map((x: string) => x.trim()))
      .filter(Boolean)
    const hasConFilter = conTypes.length > 0
    const conPlaceholders = conTypes.map(() => '?').join(',')
    // LEFT JOIN 조건에 추가 (ct 고정목록과 tasks 조인 시 공사종류 한정)
    const conJoinClause = hasConFilter
      ? `AND t.construction_type IN (${conPlaceholders})`
      : ''

    const now = new Date()
    const y = year || now.getFullYear()
    const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

    // construction_type 4종 고정 목록 기준 (작업 등록폼 공사종류와 일치)
    // planned_date 또는 work_date 중 하나라도 기간 내이면 집계
    // con_types 필터: LEFT JOIN 조건에 추가하여 필터된 종류만 집계
    const rows = await c.env.DB.prepare(
      `SELECT
         ct.key as category_code,
         ct.label as category_name,
         COUNT(DISTINCT CASE WHEN t.status = 'completed'
           AND (t.planned_date BETWEEN ? AND ? OR t.work_date BETWEEN ? AND ?)
           THEN t.id END) as completed_count,
         COUNT(DISTINCT CASE WHEN
           (t.planned_date BETWEEN ? AND ? OR t.work_date BETWEEN ? AND ?)
           THEN t.id END) as total_count
       FROM (
         SELECT '지장이설' as key, '지장이설' as label, 1 as ord UNION ALL
         SELECT '청약개통' as key, '청약개통' as label, 2 as ord UNION ALL
         SELECT '관로'     as key, '관로'     as label, 3 as ord UNION ALL
         SELECT '환경공사' as key, '환경공사' as label, 4 as ord
       ) ct
       LEFT JOIN tasks t ON t.construction_type = ct.key ${conJoinClause}
       GROUP BY ct.key
       ORDER BY ct.ord`
    ).bind(start, end, start, end, start, end, start, end, ...conTypes).all<any>()

    return c.json({ year: y, month: m, start, end, rows: rows.results || [] })
  } catch (e: any) {
    console.error('[stats GET /completed/by-category]', e.message)
    return c.json({ error: e.message || '공사종류별 통계 조회 실패' }, 500)
  }
})

// 공사종류별 완료 작업 목록 — construction_type 기반, planned_date OR work_date 필터
app.get('/completed/by-category/:categoryCode/tasks', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const categoryCode = decodeURIComponent(c.req.param('categoryCode'))  // construction_type 값(한글) 또는 'all'
    const { year, month } = c.req.query()
    const now = new Date()
    const y = year || now.getFullYear()
    const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

    const tasks = await c.env.DB.prepare(
      `SELECT t.id, t.task_number, t.title, t.location, t.work_order_address,
              t.planned_date, t.work_date, t.status, t.construction_type,
              t.work_class, t.work_class_new,
              GROUP_CONCAT(u.name, ', ') as worker_names
       FROM tasks t
       LEFT JOIN task_assignments ta ON ta.task_id = t.id
       LEFT JOIN users u ON u.id = ta.worker_id
       WHERE t.status = 'completed'
         AND (t.planned_date BETWEEN ? AND ? OR t.work_date BETWEEN ? AND ?)
         AND (? = 'all' OR t.construction_type = ?)
       GROUP BY t.id
       ORDER BY COALESCE(t.work_date, t.planned_date) DESC`
    ).bind(start, end, start, end, categoryCode, categoryCode).all<any>()

    return c.json({ tasks: tasks.results || [] })
  } catch (e: any) {
    console.error('[stats GET /completed/by-category/:categoryCode/tasks]', e.message)
    return c.json({ error: e.message || '공사종류별 작업 목록 조회 실패' }, 500)
  }
})

// 현장팀별 완료건수 통계
app.get('/completed/by-team', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { year, month } = c.req.query()
    // con_types 필터 파라미터
    const rawConTypes = c.req.queries('con_types') || []
    const conTypes: string[] = rawConTypes
      .flatMap((s: string) => s.split(',').map((x: string) => x.trim()))
      .filter(Boolean)
    const hasConFilter = conTypes.length > 0
    const conPlaceholders = conTypes.map(() => '?').join(',')
    // LEFT JOIN tasks 조건에 추가
    const conJoinClause = hasConFilter
      ? `AND t.construction_type IN (${conPlaceholders})`
      : ''

    const now = new Date()
    const y = year || now.getFullYear()
    const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

    const rows = await c.env.DB.prepare(
      `SELECT tm.id as team_id, tm.name as team_name,
              COUNT(DISTINCT CASE WHEN t.status = 'completed' AND
                (t.planned_date BETWEEN ? AND ? OR t.work_date BETWEEN ? AND ?) THEN t.id END) as completed_count,
              COUNT(DISTINCT t.id) as total_count,
              GROUP_CONCAT(DISTINCT u.name) as member_names,
              COUNT(DISTINCT u.id) as member_count
       FROM teams tm
       LEFT JOIN users u ON u.team_id = tm.id AND u.is_active = 1
       LEFT JOIN task_assignments ta ON ta.worker_id = u.id
       LEFT JOIN tasks t ON t.id = ta.task_id ${conJoinClause}
       WHERE tm.is_active = 1
       GROUP BY tm.id
       ORDER BY completed_count DESC, tm.id`
    ).bind(start, end, start, end, ...conTypes).all<any>()

    return c.json({ year: y, month: m, start, end, rows: rows.results || [] })
  } catch (e: any) {
    console.error('[stats GET /completed/by-team]', e.message)
    return c.json({ error: e.message || '팀별 통계 조회 실패' }, 500)
  }
})

// 팀별 진행중 작업건수 (완료·취소 제외)
app.get('/active/by-team', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const rows = await c.env.DB.prepare(
      `SELECT tm.id as team_id, tm.name as team_name,
              COUNT(DISTINCT u.id) as member_count,
              GROUP_CONCAT(DISTINCT u.name) as member_names,
              COUNT(DISTINCT CASE WHEN t.status NOT IN ('completed','cancelled') THEN t.id END) as active_count,
              COUNT(DISTINCT CASE WHEN t.status = 'unassigned'    THEN t.id END) as unassigned_count,
              COUNT(DISTINCT CASE WHEN t.status = 'assigned'      THEN t.id END) as assigned_count,
              COUNT(DISTINCT CASE WHEN t.status = 'in_progress'   THEN t.id END) as inprogress_count,
              COUNT(DISTINCT CASE WHEN t.status = 'tbm_done'      THEN t.id END) as tbm_count,
              COUNT(DISTINCT CASE WHEN t.status = 'working'       THEN t.id END) as working_count,
              COUNT(DISTINCT CASE WHEN t.status = 'work_completed' THEN t.id END) as work_completed_count
       FROM teams tm
       LEFT JOIN users u ON u.team_id = tm.id AND u.is_active = 1
       LEFT JOIN task_assignments ta ON ta.worker_id = u.id
       LEFT JOIN tasks t ON t.id = ta.task_id AND t.status NOT IN ('completed','cancelled')
       WHERE tm.is_active = 1
       GROUP BY tm.id
       ORDER BY active_count DESC, tm.id`
    ).all<any>()

    return c.json({ rows: rows.results || [] })
  } catch (e: any) {
    console.error('[stats GET /active/by-team]', e.message)
    return c.json({ error: e.message || '팀별 진행중 통계 조회 실패' }, 500)
  }
})

// 팀별 진행중 작업 상세 목록 (완료·취소 제외)
app.get('/active/by-team/:teamId/tasks', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const teamId = c.req.param('teamId')
    const tasks = await c.env.DB.prepare(
      `SELECT DISTINCT t.id, t.task_number, t.title, t.location, t.work_order_address,
              t.planned_date, t.work_date, t.status,
              wc.name as category_name,
              GROUP_CONCAT(DISTINCT u2.name) as worker_names
       FROM tasks t
       INNER JOIN task_assignments ta ON ta.task_id = t.id
       INNER JOIN users u ON u.id = ta.worker_id AND u.team_id = ?
       LEFT JOIN work_categories wc ON wc.id = t.category_id
       LEFT JOIN task_assignments ta2 ON ta2.task_id = t.id
       LEFT JOIN users u2 ON u2.id = ta2.worker_id
       WHERE t.status NOT IN ('completed','cancelled')
       GROUP BY t.id
       ORDER BY COALESCE(t.planned_date, t.created_at) ASC`
    ).bind(teamId).all<any>()

    return c.json({ tasks: tasks.results || [] })
  } catch (e: any) {
    console.error('[stats GET /active/by-team/:teamId/tasks]', e.message)
    return c.json({ error: e.message || '팀별 진행중 작업 목록 조회 실패' }, 500)
  }
})

// 팀별 완료 작업 목록
app.get('/completed/by-team/:teamId/tasks', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const teamId = c.req.param('teamId')
    const { year, month } = c.req.query()
    const now = new Date()
    const y = year || now.getFullYear()
    const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

    const tasks = await c.env.DB.prepare(
      `SELECT DISTINCT t.id, t.task_number, t.title, t.location, t.work_order_address,
              t.planned_date, t.work_date, t.status, t.work_class,
              wc.name as category_name,
              GROUP_CONCAT(DISTINCT u2.name) as worker_names
       FROM tasks t
       INNER JOIN task_assignments ta ON ta.task_id = t.id
       INNER JOIN users u ON u.id = ta.worker_id AND u.team_id = ?
       LEFT JOIN work_categories wc ON wc.id = t.category_id
       LEFT JOIN task_assignments ta2 ON ta2.task_id = t.id
       LEFT JOIN users u2 ON u2.id = ta2.worker_id
       WHERE t.status = 'completed'
         AND (t.planned_date BETWEEN ? AND ? OR t.work_date BETWEEN ? AND ?)
       GROUP BY t.id
       ORDER BY COALESCE(t.work_date, t.planned_date) DESC`
    ).bind(teamId, start, end, start, end).all<any>()

    return c.json({ tasks: tasks.results || [] })
  } catch (e: any) {
    console.error('[stats GET /completed/by-team/:teamId/tasks]', e.message)
    return c.json({ error: e.message || '팀별 작업 목록 조회 실패' }, 500)
  }
})

// (하위호환) 작업자별 완료건수 — by-worker 경로 유지
app.get('/completed/by-worker', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { year, month } = c.req.query()
    const now = new Date()
    const y = year || now.getFullYear()
    const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

    const rows = await c.env.DB.prepare(
      `SELECT u.id as worker_id, u.name as worker_name, u.position,
              COUNT(DISTINCT t.id) as completed_count
       FROM users u
       INNER JOIN task_assignments ta ON ta.worker_id = u.id
       INNER JOIN tasks t ON t.id = ta.task_id
       WHERE u.role = 'worker' AND u.is_active = 1
         AND t.status = 'completed' AND t.planned_date BETWEEN ? AND ?
       GROUP BY u.id
       ORDER BY completed_count DESC`
    ).bind(start, end).all<any>()

    return c.json({ year: y, month: m, start, end, rows: rows.results || [] })
  } catch (e: any) {
    console.error('[stats GET /completed/by-worker]', e.message)
    return c.json({ error: e.message || '작업자별 통계 조회 실패' }, 500)
  }
})

// (하위호환) 작업자별 완료 작업 목록
app.get('/completed/by-worker/:workerId/tasks', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const workerId = c.req.param('workerId')
    const { year, month } = c.req.query()
    const now = new Date()
    const y = year || now.getFullYear()
    const m = (month || (now.getMonth() + 1)).toString().padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = new Date(Number(y), Number(m), 0).toISOString().split('T')[0]

    const tasks = await c.env.DB.prepare(
      `SELECT t.id, t.task_number, t.title, t.location, t.planned_date, t.status,
              wc.name as category_name,
              GROUP_CONCAT(u2.name, ', ') as worker_names
       FROM tasks t
       INNER JOIN task_assignments ta2 ON ta2.task_id = t.id AND ta2.worker_id = ?
       LEFT JOIN work_categories wc ON wc.id = t.category_id
       LEFT JOIN task_assignments ta ON ta.task_id = t.id
       LEFT JOIN users u2 ON u2.id = ta.worker_id
       WHERE t.status = 'completed' AND t.planned_date BETWEEN ? AND ?
       GROUP BY t.id
       ORDER BY t.planned_date DESC`
    ).bind(workerId, start, end).all<any>()

    return c.json({ tasks: tasks.results || [] })
  } catch (e: any) {
    console.error('[stats GET /completed/by-worker/:workerId/tasks]', e.message)
    return c.json({ error: e.message || '작업자별 작업 목록 조회 실패' }, 500)
  }
})

// 근로자 개인 통계
app.get('/worker/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const workerId = c.req.param('id') === 'me' ? user.id : c.req.param('id')

    // ── [FEAT-160] 일보 총금액: 본인이 배정된 팀(task_assignments) 전체 기준 ─────
    // 옵션A: submitted + confirmed 상태만 집계
    // 외선일보: work_report_extras.qty × COALESCE(unit_price_snapshot, volume_unit_prices.unit_price)
    // 접속일보: splice_work_items.qty × COALESCE(unit_price_snapshot, splice_unit_prices.unit_price)
    //           + is_night × night_price + is_aerial × aerial_price (스냅샷 우선)
    const [taskStats, recentLogs, totalQuantity, workReportAmt, spliceReportAmt] = await Promise.all([
      c.env.DB.prepare(
        `SELECT t.status, COUNT(*) as count FROM tasks t
         INNER JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?
         GROUP BY t.status`
      ).bind(workerId).all<any>(),
      c.env.DB.prepare(
        `SELECT wl.*, t.title as task_title FROM work_logs wl
         LEFT JOIN tasks t ON t.id = wl.task_id WHERE wl.worker_id = ?
         ORDER BY wl.log_date DESC LIMIT 10`
      ).bind(workerId).all<any>(),
      c.env.DB.prepare(
        `SELECT SUM(actual_quantity) as total FROM work_logs WHERE worker_id = ?`
      ).bind(workerId).first<any>(),
      // 외선일보 금액: 본인 팀 배정 작업의 제출/확인된 일보
      c.env.DB.prepare(
        `SELECT COALESCE(SUM(
           wre.qty * COALESCE(wre.unit_price_snapshot, vup.unit_price, 0)
         ), 0) AS total
         FROM work_report_extras wre
         JOIN work_reports wr ON wr.id = wre.report_id
         JOIN tasks t ON t.id = wr.task_id
         JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?
         LEFT JOIN volume_unit_prices vup ON vup.item_key = wre.item_key
         WHERE wr.status IN ('submitted','confirmed')`
      ).bind(workerId).first<any>(),
      // 접속일보 금액: 본인 팀 배정 작업의 제출/확인된 일보 (야간/가공 추가금 포함)
      c.env.DB.prepare(
        `SELECT COALESCE(SUM(
           swi.qty * (
             COALESCE(swi.unit_price_snapshot,  sup.unit_price,  0)
             + CASE WHEN swi.is_night   = 1 THEN COALESCE(swi.night_price_snapshot,  sup.night_price,  0) ELSE 0 END
             + CASE WHEN swi.is_aerial  = 1 THEN COALESCE(swi.aerial_price_snapshot, sup.aerial_price, 0) ELSE 0 END
           )
         ), 0) AS total
         FROM splice_work_items swi
         JOIN splice_reports sr ON sr.id = swi.report_id
         JOIN tasks t ON t.id = sr.task_id
         JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?
         LEFT JOIN splice_unit_prices sup ON sup.item_label = swi.work_label
         WHERE sr.status IN ('submitted','confirmed')`
      ).bind(workerId).first<any>()
    ])
    // ── [FEAT-160] 끝 ─────────────────────────────────────────────────────────

    const totalReportAmount = Math.round(
      (Number(workReportAmt?.total) || 0) + (Number(spliceReportAmt?.total) || 0)
    )

    return c.json({
      taskStats: taskStats.results || [],
      recentLogs: recentLogs.results || [],
      totalQuantity: totalQuantity?.total || 0,
      totalReportAmount
    })
  } catch (e: any) {
    console.error('[stats GET /worker/:id]', e.message)
    return c.json({ error: e.message || '개인 통계 조회 실패' }, 500)
  }
})

export default app
