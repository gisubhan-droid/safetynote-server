import { Hono } from 'hono'
import { getUser } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// UTF-8 안전한 base64 인코딩 (한국어 지원)
function encodeToken(payload: object): string {
  const json = JSON.stringify(payload)
  // TextEncoder를 사용하여 UTF-8로 인코딩
  const encoder = new TextEncoder()
  const bytes = encoder.encode(json)
  let binary = ''
  bytes.forEach(b => binary += String.fromCharCode(b))
  return btoa(binary)
}

function decodeToken(token: string): any {
  const binary = atob(token)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const decoder = new TextDecoder()
  return JSON.parse(decoder.decode(bytes))
}

// 로그인
app.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any
  const { username, password } = body
  if (!username || !password) return c.json({ error: '아이디와 비밀번호를 입력하세요.' }, 400)

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE username = ? AND is_active = 1'
  ).bind(String(username)).first<any>()

  if (!user || user.password_hash !== password) {
    return c.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401)
  }

  const token = encodeToken({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    sub_role: user.sub_role || '',
    position: user.position || '',
  })
  // permissions 파싱 (null = 전체 허용)
  let permissions: string[] | null = null
  try { if (user.permissions) permissions = JSON.parse(user.permissions) } catch { permissions = null }
  return c.json({
    token,
    user: {
      id: user.id, username: user.username, name: user.name,
      role: user.role, department: user.department,
      position: user.position, phone: user.phone,
      sub_role: user.sub_role || '',   // [BUG-079] LGU+ 클라이언트 필터용 — 누락 시 현장점검/지도 필터 불가
      permissions,
    }
  })
})

// 현재 사용자 정보
app.get('/me', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: '인증이 필요합니다.' }, 401)
  try {
    const token = auth.replace('Bearer ', '')
    const decoded = decodeToken(token)
    const user = await c.env.DB.prepare(
      // [FEAT-048] sub_role 추가 — LGU+ 클라이언트 필터(dbRoleToUi) 정상 작동에 필요
      'SELECT id, username, name, role, sub_role, department, position, phone FROM users WHERE id = ?'
    ).bind(decoded.id).first<any>()
    if (!user) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)
    return c.json(user)
  } catch { return c.json({ error: '유효하지 않은 토큰입니다.' }, 401) }
})

// 회원가입 (관리자만)
app.post('/register', async (c) => {
  // 🔒 인증 체크: 관리자(admin/supervisor)만 직접 등록 가능
  const reqUser = getUser(c)
  if (!reqUser) return c.json({ error: '인증 필요' }, 401)
  if (reqUser.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const body = await c.req.json()
  const {
    username, password, name, grade, role, sub_role,
    department, position, phone,
    company, blood_type, emergency_contact, health_info,
    edu_hire_date, edu_special_electric, edu_special_confined,
    edu_special_loading, edu_experience_date, permissions,
  } = body
  if (!username || !password || !name || !role) return c.json({ error: '필수 항목을 입력하세요.' }, 400)

  // permissions 직렬화 (null = 전체허용, 배열 = 제한)
  let permValue: string | null = null
  if (Array.isArray(permissions) && permissions.length > 0) {
    permValue = JSON.stringify(permissions)
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO users (
         username, password_hash, name, grade, role, sub_role,
         department, position, phone,
         company, blood_type, emergency_contact, health_info,
         edu_hire_date, edu_special_electric, edu_special_confined,
         edu_special_loading, edu_experience_date, permissions
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      username, password, name, grade || '', role, sub_role || '',
      department || '', position || '', phone || '',
      company || '', blood_type || '', emergency_contact || '', health_info || '',
      edu_hire_date || '', edu_special_electric || '', edu_special_confined || '',
      edu_special_loading || '', edu_experience_date || '', permValue
    ).run()
    return c.json({ success: true, message: '사용자가 등록되었습니다.' })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 사용 중인 아이디입니다.' }, 409)
    return c.json({ error: '등록 중 오류가 발생했습니다.' }, 500)
  }
})

// 자체 가입 신청 (인증 불필요 — is_pending=1, is_active=0 으로 생성)
app.post('/self-register', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any
  const {
    username, password, name, grade, role,
    department, position, phone, company,
    blood_type, emergency_contact, health_info,
    id_number, privacy_agreed, security_agreed, location_agreed,
  } = body
  if (!username || !password || !name || !role) {
    return c.json({ error: '필수 항목(아이디, 비밀번호, 이름, 역할)을 입력하세요.' }, 400)
  }
  // 필수 동의 검증 (개인정보보호법 제15조, 위치정보법 제18조 준수)
  if (!privacy_agreed || !security_agreed || !location_agreed) {
    return c.json({ error: '개인정보 수집·이용 동의, 업무 보안·비밀 준수 서약, 위치정보 수집·이용 동의에 모두 동의하셔야 가입 신청이 가능합니다.' }, 400)
  }
  // 주민번호 앞자리 검증 (7자리: YYMMDDG)
  if (!id_number || !/^\d{7}$/.test(id_number)) {
    return c.json({ error: '주민등록번호 앞자리(생년월일 6자리 + 성별코드 1자리)를 올바르게 입력하세요.' }, 400)
  }
  // 허용 역할 제한 (worker, supervisor, admin 중 자체가입 가능한 것만)
  const allowedRoles = ['worker', 'supervisor', 'admin']
  if (!allowedRoles.includes(role)) {
    return c.json({ error: '허용되지 않은 역할입니다.' }, 400)
  }
  try {
    const now = new Date().toISOString()
    await c.env.DB.prepare(
      `INSERT INTO users (
         username, password_hash, name, grade, role,
         department, position, phone, company,
         blood_type, emergency_contact, health_info,
         id_number, privacy_agreed, privacy_agreed_at,
         security_agreed, security_agreed_at,
         location_agreed, location_agreed_at,
         is_pending, is_active
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`
    ).bind(
      username, password, name, grade || '', role,
      department || '', position || '', phone || '', company || '',
      blood_type || '', emergency_contact || '', health_info || '',
      id_number,
      privacy_agreed ? 1 : 0, now,
      security_agreed ? 1 : 0, now,
      location_agreed ? 1 : 0, now
    ).run()
    return c.json({ success: true, message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.' })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 사용 중인 아이디입니다.' }, 409)
    return c.json({ error: '가입 신청 중 오류가 발생했습니다.' }, 500)
  }
})

// 승인 대기 목록 조회 (관리자 이상)
app.get('/pending-users', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const result = await c.env.DB.prepare(
    `SELECT id, username, name, role, department, position, phone, company,
            blood_type, emergency_contact, is_pending, is_active, created_at
     FROM users WHERE is_pending = 1 ORDER BY created_at DESC`
  ).all<any>()
  return c.json(result.results || [])
})

// 가입 승인 (안전관리자·시스템관리자·현장대리인 역할)
app.post('/approve/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const target = await c.env.DB.prepare(
    'SELECT id, is_pending FROM users WHERE id = ?'
  ).bind(id).first<any>()
  if (!target) return c.json({ error: '사용자 없음' }, 404)
  if (!target.is_pending) return c.json({ error: '승인 대기 중인 계정이 아닙니다.' }, 400)
  await c.env.DB.prepare(
    `UPDATE users SET is_pending=0, is_active=1,
     approved_by=?, approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).bind(user.id, id).run()
  return c.json({ success: true, message: '계정이 승인되었습니다.' })
})

// 가입 거절 (승인 대기 → 삭제)
app.post('/reject/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  const reason = body.reason || ''
  const target = await c.env.DB.prepare(
    'SELECT id, is_pending FROM users WHERE id = ?'
  ).bind(id).first<any>()
  if (!target) return c.json({ error: '사용자 없음' }, 404)
  if (!target.is_pending) return c.json({ error: '승인 대기 중인 계정이 아닙니다.' }, 400)
  // 거절 시 계정 완전 삭제 (가입 신청 데이터 제거)
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  return c.json({ success: true, message: '가입 신청이 거절되었습니다.' })
})

// ─── 일괄 사용자 등록 (sysadmin 전용) ───────────────────────────────────────
app.post('/bulk-register', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '시스템 관리자만 사용할 수 있습니다.' }, 403)

  const body = await c.req.json().catch(() => ({})) as any
  const users: any[] = Array.isArray(body.users) ? body.users : []
  if (!users.length) return c.json({ error: '등록할 사용자 데이터가 없습니다.' }, 400)

  const results: { row: number; username: string; success: boolean; error?: string }[] = []

  for (let i = 0; i < users.length; i++) {
    const u = users[i]
    const { username, password, name, role, sub_role,
            company, department, position, phone,
            blood_type, emergency_contact } = u

    if (!username || !password || !name || !role) {
      results.push({ row: i + 2, username: username || '(없음)', success: false, error: '필수값(아이디/비밀번호/이름/역할) 누락' })
      continue
    }
    try {
      await c.env.DB.prepare(
        `INSERT INTO users (
           username, password_hash, name, grade, role, sub_role,
           company, department, position, phone,
           blood_type, emergency_contact,
           is_active, is_pending
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,0)`
      ).bind(
        username.trim(), password, name.trim(), u.grade || '', role, sub_role || '',
        company || '', department || '', position || '', phone || '',
        blood_type || '', emergency_contact || ''
      ).run()
      results.push({ row: i + 2, username, success: true })
    } catch (e: any) {
      const msg = e.message?.includes('UNIQUE') ? '이미 사용 중인 아이디' : '등록 오류'
      results.push({ row: i + 2, username, success: false, error: msg })
    }
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length
  return c.json({ success: true, total: users.length, successCount, failCount, results })
})

// 비밀번호 변경
app.put('/password', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: '인증이 필요합니다.' }, 401)
  const { currentPassword, newPassword } = await c.req.json()
  const token = auth.replace('Bearer ', '')
  const decoded = decodeToken(token)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(decoded.id).first<any>()
  if (!user || user.password_hash !== currentPassword) return c.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 400)

  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newPassword, decoded.id).run()
  return c.json({ success: true })
})

export default app
