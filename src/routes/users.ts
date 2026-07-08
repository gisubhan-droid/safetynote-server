import { Hono } from 'hono'
import { getUser } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// 확장 필드 목록 (SELECT / UPDATE에 공통 사용)
const EXTENDED_FIELDS = [
  'company', 'blood_type', 'emergency_contact', 'health_info',
  'edu_hire_date', 'edu_special_electric', 'edu_special_confined',
  'edu_special_loading', 'edu_experience_date',
  'edu_special_records',  // 특별안전교육 종류별 이수현황 JSON {"작업종류":"날짜"}
]

// 허용 메뉴 ID 목록 (유효성 검증용)
const VALID_MENU_IDS = [
  'dashboard', 'tasks', 'inspections', 'risk-periodic', 'risk-adhoc',
  'hazards', 'stats-task', 'stats-inspection', 'stats-worker-safety', 'users', 'teams', 'admin-settings',
]

// ─── 교육일 수정 가능 역할 체크 헬퍼 ───────────────────────────────────────
// 현장대리인(position='현장대리인') / 안전관리자(position='안전관리자') / 시스템관리자(position='시스템관리자') / admin 롤
function canEditEduDates(role: string, position: string): boolean {
  if (role === 'admin') return true                              // 관리자(admin) 전체 허용
  const pos = (position || '').trim()
  return pos === '현장대리인' || pos === '안전관리자' || pos === '시스템관리자'
}

// ─── 본인 계정 조회 (/me) ────────────────────────────────────────────────────
app.get('/me', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const u = await c.env.DB.prepare(
      `SELECT id, username, name, grade, role, sub_role, department, position, phone,
              company, blood_type, emergency_contact, health_info,
              edu_hire_date, edu_special_electric, edu_special_confined,
              edu_special_loading, edu_experience_date, edu_special_records
       FROM users WHERE id = ? AND is_active = 1`
    ).bind(user.id).first<any>()
    if (!u) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)
    return c.json(u)
  } catch (e: any) {
    return c.json({ error: e.message || '본인 계정 조회 실패' }, 500)
  }
})

// ─── 본인 기본정보 수정 (PUT /me) ────────────────────────────────────────────
app.put('/me', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const body = await c.req.json()
    const {
      name, department, position, phone,
      company, blood_type, emergency_contact, health_info,
      edu_hire_date, edu_special_electric, edu_special_confined,
      edu_special_loading, edu_experience_date, edu_special_records,
    } = body

    if (!name || !String(name).trim()) return c.json({ error: '이름은 필수입니다.' }, 400)

    // 교육일 수정 권한 확인: 토큰에 position이 없으므로 DB에서 조회
    const me = await c.env.DB.prepare(
      'SELECT role, position FROM users WHERE id = ? AND is_active = 1'
    ).bind(user.id).first<any>()
    if (!me) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)

    const eduAllowed = canEditEduDates(me.role, me.position || '')

    if (eduAllowed) {
      // 교육일 포함 전체 업데이트 (특별안전교육 records JSON 포함)
      const specialRecordsVal = edu_special_records != null
        ? (typeof edu_special_records === 'string' ? edu_special_records : JSON.stringify(edu_special_records))
        : null
      await c.env.DB.prepare(
        `UPDATE users SET
           name=?, department=?, position=?, phone=?,
           company=?, blood_type=?, emergency_contact=?, health_info=?,
           edu_hire_date=?, edu_special_electric=?, edu_special_confined=?,
           edu_special_loading=?, edu_experience_date=?,
           edu_special_records=COALESCE(?, edu_special_records, '{}'),
           updated_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).bind(
        String(name).trim(),
        department || '', position || '', phone || '',
        company || '', blood_type || '', emergency_contact || '', health_info || '',
        edu_hire_date || '', edu_special_electric || '', edu_special_confined || '',
        edu_special_loading || '', edu_experience_date || '',
        specialRecordsVal,
        user.id
      ).run()
    } else {
      // 교육일 제외 업데이트 (권한 없는 사용자)
      await c.env.DB.prepare(
        `UPDATE users SET
           name=?, department=?, position=?, phone=?,
           company=?, blood_type=?, emergency_contact=?, health_info=?,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).bind(
        String(name).trim(),
        department || '', position || '', phone || '',
        company || '', blood_type || '', emergency_contact || '', health_info || '',
        user.id
      ).run()
    }

    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || '본인 정보 수정 실패' }, 500)
  }
})

// ─── 본인 비밀번호 변경 (PUT /me/password) ───────────────────────────────────
app.put('/me/password', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { currentPassword, newPassword } = await c.req.json()

    if (!currentPassword || !newPassword)
      return c.json({ error: '현재 비밀번호와 새 비밀번호를 모두 입력하세요.' }, 400)
    if (String(newPassword).length < 4)
      return c.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, 400)

    // 현재 비밀번호 확인
    const row = await c.env.DB.prepare(
      'SELECT password_hash FROM users WHERE id = ? AND is_active = 1'
    ).bind(user.id).first<any>()
    if (!row) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)
    if (row.password_hash !== String(currentPassword))
      return c.json({ error: '현재 비밀번호가 일치하지 않습니다.' }, 400)

    await c.env.DB.prepare(
      'UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(String(newPassword), user.id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || '비밀번호 변경 실패' }, 500)
  }
})

// 사용자 목록 (활성 사용자만 — 업무중사용자 화면용)
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const { role } = c.req.query()
    let q = `SELECT u.id, u.username, u.name, u.grade, u.role, u.sub_role, u.department, u.position, u.phone,
                     u.company, u.blood_type, u.emergency_contact,
                     u.is_active, u.is_pending, u.created_at,
                     t.name as team_name
             FROM users u
             LEFT JOIN teams t ON t.id = u.team_id
             WHERE u.is_active = 1 AND (u.is_pending = 0 OR u.is_pending IS NULL)`
    const params: any[] = []
    if (role) { q += ' AND u.role = ?'; params.push(role) }
    q += ' ORDER BY u.name'
    const result = await c.env.DB.prepare(q).bind(...params).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    return c.json({ error: e.message || '사용자 목록 조회 실패' }, 500)
  }
})

// 중지(비활성) 사용자 목록 — 중지사용자 화면용
app.get('/suspended', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  // [FEAT-048] lgu_plus는 worker 동급 — 중지사용자 목록 접근 불가
  if (user.role === 'worker' || user.role === 'lgu_plus' || user.role === 'lgu' || (user as any).sub_role === 'lgu_plus') return c.json({ error: '권한 없음' }, 403)

  try {
    const result = await c.env.DB.prepare(
      `SELECT u.id, u.username, u.name, u.role, u.sub_role, u.department, u.position, u.phone,
              u.company, u.is_active, u.is_pending, u.created_at, u.updated_at,
              t.name as team_name
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id
       WHERE u.is_active = 0 AND (u.is_pending = 0 OR u.is_pending IS NULL)
       ORDER BY u.updated_at DESC`
    ).all<any>()
    return c.json(result.results || [])
  } catch (e: any) {
    return c.json({ error: e.message || '중지 사용자 목록 조회 실패' }, 500)
  }
})

// 계정 복구 (중지 → 활성)
app.post('/:id/restore', async (c) => {
  const user = getUser(c)
  // [FEAT-048] lgu_plus는 worker 동급 — 계정 복구 권한 없음
  if (!user || user.role === 'worker' || user.role === 'lgu_plus' || user.role === 'lgu' || (user as any).sub_role === 'lgu_plus') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')

  try {
    await c.env.DB.prepare(
      'UPDATE users SET is_active=1, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || '계정 복구 실패' }, 500)
  }
})

// ─── QR 공개 프로필 조회 (인증 불필요 - 안전모 QR 스캔용) ────────────────
// ⚠️ 반드시 /:id 라우트보다 앞에 위치해야 함 (Hono 순서 매칭)
app.get('/qr-profile/:userId', async (c) => {
  const userId = c.req.param('userId')
  if (!/^\d+$/.test(userId)) return c.json({ error: '잘못된 요청' }, 400)

  try {
    const u = await c.env.DB.prepare(
      `SELECT id, name, role, sub_role, department, position, phone, created_at,
              company, blood_type, emergency_contact, health_info,
              edu_hire_date, edu_special_electric, edu_special_confined,
              edu_special_loading, edu_experience_date,
              edu_periodic_date, edu_job_change_date, edu_supervisor_date,
              edu_special_records
       FROM users WHERE id = ? AND is_active = 1`
    ).bind(userId).first<any>()

    if (!u) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)

    // 현재 배정된 작업
    const currentTask = await c.env.DB.prepare(
      `SELECT t.id, t.title, t.status, t.work_order_address, t.planned_date
       FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       WHERE ta.worker_id = ? AND t.status NOT IN ('completed','cancelled')
       ORDER BY t.created_at DESC LIMIT 1`
    ).bind(userId).first<any>()

    // 완료된 작업 수
    const completedCount = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       WHERE ta.worker_id = ? AND t.status = 'completed'`
    ).bind(userId).first<any>()

    // 점검 이력 (불량/우수, 최신 10건)
    const inspHistory = await c.env.DB.prepare(`
      SELECT iw.result_type, iw.created_at as recorded_at,
             si.inspection_date_only, si.location, si.findings,
             t.title as task_title, t.task_number,
             u2.name as inspector_name
      FROM inspection_workers iw
      JOIN site_inspections si ON si.id = iw.inspection_id
      LEFT JOIN tasks t  ON t.id  = si.task_id
      LEFT JOIN users u2 ON u2.id = si.inspector_id
      WHERE iw.worker_id = ?
      ORDER BY iw.created_at DESC
      LIMIT 10
    `).bind(userId).all<any>()

    // 요약 집계
    const inspSummary = await c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN iw.result_type='불량' THEN 1 ELSE 0 END) as poor_count,
        SUM(CASE WHEN iw.result_type='우수' THEN 1 ELSE 0 END) as excel_count,
        COUNT(*) as total_count
      FROM inspection_workers iw
      WHERE iw.worker_id = ?
    `).bind(userId).first<any>()

    const roleLabel: Record<string, string> = {
      admin: '관리자', supervisor: '감독자', worker: '근로자'
    }

    return c.json({
      id: u.id,
      name: u.name,
      role: u.role,
      role_label: roleLabel[u.role] || u.role,
      department: u.department || '',
      position: u.position || '',
      phone: u.phone || '',
      company: u.company || '',
      blood_type: u.blood_type || '',
      emergency_contact: u.emergency_contact || '',
      edu_hire_date: u.edu_hire_date || '',
      edu_special_electric: u.edu_special_electric || '',
      edu_special_confined: u.edu_special_confined || '',
      edu_special_loading: u.edu_special_loading || '',
      edu_experience_date: u.edu_experience_date || '',
      edu_periodic_date: u.edu_periodic_date || '',
      edu_job_change_date: u.edu_job_change_date || '',
      edu_supervisor_date: u.edu_supervisor_date || '',
      edu_special_records: u.edu_special_records || '{}',
      joined: u.created_at ? u.created_at.slice(0, 10) : '',
      current_task: currentTask || null,
      completed_tasks: completedCount?.cnt || 0,
      insp_history: inspHistory?.results || [],
      insp_summary: {
        poor:  inspSummary?.poor_count  || 0,
        excel: inspSummary?.excel_count || 0,
        total: inspSummary?.total_count || 0,
      },
    })
  } catch (e: any) {
    return c.json({ error: e.message || 'QR 프로필 조회 실패' }, 500)
  }
})

// 사용자 상세
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  try {
    const u = await c.env.DB.prepare(
      `SELECT id, username, name, grade, role, sub_role, department, position, phone,
              company, blood_type, emergency_contact, health_info,
              edu_hire_date, edu_special_electric, edu_special_confined,
              edu_special_loading, edu_experience_date, edu_special_records,
              permissions, is_active, created_at
       FROM users WHERE id = ?`
    ).bind(id).first<any>()
    if (!u) return c.json({ error: '사용자 없음' }, 404)
    return c.json(u)
  } catch (e: any) {
    return c.json({ error: e.message || '사용자 상세 조회 실패' }, 500)
  }
})

// 사용자 수정
app.put('/:id', async (c) => {
  const user = getUser(c)
  // [FEAT-048] lgu_plus는 worker 동급 — 타인 계정 수정 권한 없음
  if (!user || user.role === 'worker' || user.role === 'lgu_plus' || user.role === 'lgu' || (user as any).sub_role === 'lgu_plus') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')

  try {
    const body = await c.req.json()
    const {
      name, grade, role, sub_role, department, position, phone, is_active,
      company, blood_type, emergency_contact, health_info,
      edu_hire_date, edu_special_electric, edu_special_confined,
      edu_special_loading, edu_experience_date, edu_special_records, permissions,
    } = body

    // permissions 처리: body에 permissions 키가 없으면 기존 DB 값 유지
    const hasPermissionsField = Object.prototype.hasOwnProperty.call(body, 'permissions')

    let permissionsClause = ''
    let permissionsParam: string | null | undefined = undefined

    if (hasPermissionsField) {
      // sysadmin이 명시적으로 permissions를 전송한 경우만 업데이트
      let permissionsValue: string | null = null
      if (Array.isArray(permissions)) {
        const valid = permissions.filter((m: string) => VALID_MENU_IDS.includes(m))
        permissionsValue = valid.length > 0 ? JSON.stringify(valid) : null
      } else if (permissions === null) {
        permissionsValue = null  // 명시적 null = 전체 허용
      }
      permissionsClause = ', permissions=?'
      permissionsParam = permissionsValue
    }
    // hasPermissionsField가 false이면 permissions 컬럼을 UPDATE에서 제외 → 기존 값 유지

    // edu_special_records: JSON 직렬화 처리
    const specialRecordsVal = edu_special_records != null
      ? (typeof edu_special_records === 'string' ? edu_special_records : JSON.stringify(edu_special_records))
      : null

    const baseBinds: any[] = [
      name, grade || '', role, sub_role || '', department || '', position || '', phone || '',
      company || '', blood_type || '', emergency_contact || '', health_info || '',
      edu_hire_date || '', edu_special_electric || '', edu_special_confined || '',
      edu_special_loading || '', edu_experience_date || '',
      specialRecordsVal,
    ]
    const endBinds: any[] = [is_active ?? 1, id]
    const allBinds = hasPermissionsField
      ? [...baseBinds, permissionsParam, ...endBinds]
      : [...baseBinds, ...endBinds]

    await c.env.DB.prepare(
      `UPDATE users SET
         name=?, grade=?, role=?, sub_role=?, department=?, position=?, phone=?,
         company=?, blood_type=?, emergency_contact=?, health_info=?,
         edu_hire_date=?, edu_special_electric=?, edu_special_confined=?,
         edu_special_loading=?, edu_experience_date=?,
         edu_special_records=COALESCE(?, edu_special_records, '{}')
         ${permissionsClause},
         is_active=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    ).bind(...allBinds).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || '사용자 수정 실패' }, 500)
  }
})

// 비밀번호 리셋 (관리자)
app.put('/:id/reset-password', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const id = c.req.param('id')

  try {
    const { newPassword } = await c.req.json()
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newPassword, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || '비밀번호 리셋 실패' }, 500)
  }
})

// 사용자 비활성화
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const id = c.req.param('id')

  try {
    await c.env.DB.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || '사용자 비활성화 실패' }, 500)
  }
})

// 사용자 완전 삭제 (시스템관리자 전용 - position='시스템관리자' 확인)
app.delete('/:id/hard-delete', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  try {
    // position으로 sysadmin 여부 추가 확인
    const me = await c.env.DB.prepare(
      'SELECT position FROM users WHERE id = ?'
    ).bind(user.id).first<any>()
    if (!me || me.position !== '시스템관리자') return c.json({ error: '시스템관리자 전용 기능입니다.' }, 403)

    const id = c.req.param('id')
    // 자기 자신 삭제 방지
    if (String(id) === String(user.id)) return c.json({ error: '자신의 계정은 삭제할 수 없습니다.' }, 400)

    // 연관 데이터 정리 후 삭제
    try {
      await c.env.DB.prepare('DELETE FROM task_assignments WHERE worker_id = ?').bind(id).run()
    } catch (cleanErr: any) {
      console.warn('[users DELETE /:id/hard-delete] task_assignments 정리 실패 (무시):', cleanErr.message)
    }
    try {
      await c.env.DB.prepare('UPDATE users SET team_id = NULL, is_leader = 0 WHERE id = ?').bind(id).run()
    } catch (cleanErr: any) {
      console.warn('[users DELETE /:id/hard-delete] team_id 정리 실패 (무시):', cleanErr.message)
    }
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || '사용자 삭제 실패' }, 500)
  }
})

export default app
