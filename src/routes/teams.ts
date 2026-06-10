import { Hono } from 'hono'
import { getUser } from '../utils'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ─── 팀 목록 (팀원 포함) ────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const teams = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.description, t.is_active,
            COUNT(u.id) as member_count
     FROM teams t
     LEFT JOIN users u ON u.team_id = t.id AND u.is_active = 1
     WHERE t.is_active = 1
     GROUP BY t.id
     ORDER BY t.name`
  ).all<any>()

  const teamList = teams.results || []

  if (teamList.length > 0) {
    // 배치 조회: 팀원 N+1 → 1회 쿼리로 해결
    const teamIds = teamList.map((t: any) => t.id)
    const idPlaceholders = teamIds.map(() => '?').join(',')
    const membersRes = await c.env.DB.prepare(`
      SELECT id, name, role, position, phone, company, is_leader, team_id
      FROM users
      WHERE team_id IN (${idPlaceholders}) AND is_active = 1
      ORDER BY team_id, is_leader DESC, name
    `).bind(...teamIds).all<any>()

    // team_id → members 맵 구성
    const membersMap: Record<number, any[]> = {}
    for (const m of (membersRes.results || [])) {
      if (!membersMap[m.team_id]) membersMap[m.team_id] = []
      membersMap[m.team_id].push(m)
    }

    for (const team of teamList) {
      team.members = membersMap[team.id] || []
      team.leader  = team.members.find((m: any) => m.is_leader === 1) || null
    }
  } else {
    for (const team of teamList) { team.members = []; team.leader = null }
  }

  return c.json(teamList)
})

// ─── 팀 상세 ────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  const team = await c.env.DB.prepare(
    'SELECT * FROM teams WHERE id = ?'
  ).bind(id).first<any>()
  if (!team) return c.json({ error: '팀을 찾을 수 없습니다.' }, 404)

  const members = await c.env.DB.prepare(
    `SELECT id, name, role, position, phone, company, is_leader
     FROM users WHERE team_id = ? AND is_active = 1
     ORDER BY is_leader DESC, name`
  ).bind(id).all<any>()
  team.members = members.results || []
  team.leader = team.members.find((m: any) => m.is_leader === 1) || null

  return c.json(team)
})

// ─── 팀 생성 (관리자만) ─────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  const { name, description } = await c.req.json()
  if (!name) return c.json({ error: '팀명을 입력하세요.' }, 400)

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO teams (name, description) VALUES (?, ?)`
    ).bind(name, description || '').run()
    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 존재하는 팀명입니다.' }, 409)
    return c.json({ error: e.message }, 500)
  }
})

// ─── 팀 수정 (관리자만) ─────────────────────────────────────────────────────
app.put('/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const id = c.req.param('id')
  const { name, description, is_active } = await c.req.json()

  await c.env.DB.prepare(
    `UPDATE teams SET name=?, description=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(name, description || '', is_active ?? 1, id).run()
  return c.json({ success: true })
})

// ─── 팀원 배정 (관리자만) ───────────────────────────────────────────────────
// PUT /teams/:id/members  body: { user_ids: [], leader_id: number }
app.put('/:id/members', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const teamId = c.req.param('id')
  const { user_ids, leader_id } = await c.req.json()

  // 기존 팀원 전체 해제 (이 팀 소속만)
  await c.env.DB.prepare(
    `UPDATE users SET team_id = NULL, is_leader = 0 WHERE team_id = ?`
  ).bind(teamId).run()

  // 신규 팀원 배정
  if (Array.isArray(user_ids) && user_ids.length > 0) {
    for (const uid of user_ids) {
      const isLeader = uid === leader_id ? 1 : 0
      await c.env.DB.prepare(
        `UPDATE users SET team_id = ?, is_leader = ? WHERE id = ?`
      ).bind(teamId, isLeader, uid).run()
    }
  }

  return c.json({ success: true })
})

// ─── 팀장 지정 (관리자만) ───────────────────────────────────────────────────
app.patch('/:id/leader', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const teamId = c.req.param('id')
  const { leader_id } = await c.req.json()

  // 팀 내 기존 팀장 해제
  await c.env.DB.prepare(
    `UPDATE users SET is_leader = 0 WHERE team_id = ?`
  ).bind(teamId).run()

  // 새 팀장 지정
  if (leader_id) {
    await c.env.DB.prepare(
      `UPDATE users SET is_leader = 1, team_id = ? WHERE id = ?`
    ).bind(teamId, leader_id).run()
  }

  return c.json({ success: true })
})

// ─── 팀 삭제 (관리자만, 소프트 삭제) ────────────────────────────────────────
app.delete('/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  const id = c.req.param('id')

  // 팀 비활성화 + 소속 멤버 팀 해제
  await c.env.DB.prepare(
    `UPDATE users SET team_id = NULL, is_leader = 0 WHERE team_id = ?`
  ).bind(id).run()
  await c.env.DB.prepare(
    `UPDATE teams SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(id).run()
  return c.json({ success: true })
})

export default app
