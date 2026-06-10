-- ─── 팀 관리 시스템 ───────────────────────────────────────────────────────────
-- teams 테이블 생성
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,          -- 팀명 (외선1팀, 접속1팀, 관로1팀 등)
  description TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- users 테이블에 팀 관련 컬럼 추가
ALTER TABLE users ADD COLUMN team_id INTEGER REFERENCES teams(id);
ALTER TABLE users ADD COLUMN is_leader INTEGER DEFAULT 0;  -- 1 = 팀장

-- ─── 작업(tasks) 테이블 신규 필드 ────────────────────────────────────────────
-- 공사종류 (지장이설 / 청약개통 / 관로 / 환경공사)
ALTER TABLE tasks ADD COLUMN construction_type TEXT DEFAULT '';
-- 요청번호
ALTER TABLE tasks ADD COLUMN request_no TEXT DEFAULT '';
-- 공사 담당자(협력사) — 기존 supervisor_id는 유지, 텍스트 필드 추가
ALTER TABLE tasks ADD COLUMN contractor_name TEXT DEFAULT '';

-- ─── 기본 팀 데이터 삽입 ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO teams (name, description) VALUES ('외선1팀', 'LGU+ 외선 공사 1팀');
INSERT OR IGNORE INTO teams (name, description) VALUES ('접속1팀', 'LGU+ 접속 공사 1팀');
INSERT OR IGNORE INTO teams (name, description) VALUES ('관로1팀', 'LGU+ 관로 공사 1팀');

-- ─── 기존 근로자 팀 자동 분류 ────────────────────────────────────────────────
-- 외선1팀: id 4, 5, 6, 16, 17, 18, 19 (7명) — 박철수(외선팀), 최영희, 정민수, 이수진, 박지훈, 최민석, 조영철
UPDATE users SET team_id = (SELECT id FROM teams WHERE name='외선1팀') WHERE id IN (4, 5, 6, 16, 17, 18, 19);

-- 접속1팀: id 20, 21, 22, 23, 24, 25, 26 (7명) — 강서연, 윤재혁, 신미경, 홍준표, 오다은, 임현우, 장예린
UPDATE users SET team_id = (SELECT id FROM teams WHERE name='접속1팀') WHERE id IN (20, 21, 22, 23, 24, 25, 26);

-- 관로1팀: id 27, 28, 29, 30, 31, 32, 33, 34 (8명) — 배성민, 권지수, 한솔, 류동현, 문서영, 서준영, 안채원, 전민재
UPDATE users SET team_id = (SELECT id FROM teams WHERE name='관로1팀') WHERE id IN (27, 28, 29, 30, 31, 32, 33, 34);

-- supervisor 중 팀장 배정: 각 팀에서 1명씩 팀장으로 지정
-- 외선1팀 팀장: 강민준(id=7)
UPDATE users SET team_id = (SELECT id FROM teams WHERE name='외선1팀'), is_leader = 1 WHERE id = 7;

-- 접속1팀 팀장: 윤성호(id=8)
UPDATE users SET team_id = (SELECT id FROM teams WHERE name='접속1팀'), is_leader = 1 WHERE id = 8;

-- 관로1팀 팀장: 장혜원(id=9)
UPDATE users SET team_id = (SELECT id FROM teams WHERE name='관로1팀'), is_leader = 1 WHERE id = 9;

-- teams 인덱스
CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_construction_type ON tasks(construction_type);
