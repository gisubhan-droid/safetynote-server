-- ============================================================
-- v0.101: 안전교육 관리 테이블 (산업안전보건법 제29조)
-- ============================================================

-- 교육 세션(회차) 테이블
CREATE TABLE IF NOT EXISTS safety_education_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  edu_type         TEXT NOT NULL,          -- 'periodic'|'hire'|'job_change'|'special'|'supervisor'
  edu_subject      TEXT NOT NULL,          -- 교육 과목/내용
  edu_date         DATE NOT NULL,          -- 교육 실시일
  edu_hours        REAL NOT NULL,          -- 교육 시간
  instructor       TEXT,                  -- 강사명
  location         TEXT,                  -- 교육 장소
  quarter          INTEGER,               -- 분기 (정기교육용: 1~4)
  year             INTEGER,               -- 연도
  target_type      TEXT,                  -- 'office'|'field'|'daily'|'supervisor' 대상구분
  special_work_type TEXT,                 -- 특별교육 작업 종류
  notes            TEXT,                  -- 비고
  created_by       INTEGER REFERENCES users(id),
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 교육 참석자 테이블
CREATE TABLE IF NOT EXISTS safety_education_attendees (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL REFERENCES safety_education_sessions(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id),
  user_name      TEXT NOT NULL,           -- 비등록 참석자 지원
  department     TEXT,                   -- 부서
  position       TEXT,                   -- 직위/직책
  signature_data TEXT,                   -- base64 서명 이미지
  attended       INTEGER DEFAULT 1,      -- 출석 여부
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_edu_sessions_type  ON safety_education_sessions(edu_type);
CREATE INDEX IF NOT EXISTS idx_edu_sessions_date  ON safety_education_sessions(edu_date);
CREATE INDEX IF NOT EXISTS idx_edu_sessions_year  ON safety_education_sessions(year);
CREATE INDEX IF NOT EXISTS idx_edu_attendees_sess ON safety_education_attendees(session_id);
CREATE INDEX IF NOT EXISTS idx_edu_attendees_user ON safety_education_attendees(user_id);
