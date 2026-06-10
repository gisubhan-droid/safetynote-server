-- ============================================================
-- v0.49: 누락 테이블 추가 (patchSchema에서 참조되지만 migrations에 없던 테이블)
-- ============================================================

-- ① 위험성평가 서명 테이블
CREATE TABLE IF NOT EXISTS risk_assessment_signatures (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  user_name     TEXT NOT NULL,
  position      TEXT DEFAULT '',
  role          TEXT DEFAULT 'member',   -- 'chair' | 'member'
  signed_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  sign_method   TEXT DEFAULT 'account',  -- 'account' | 'pad'
  sign_data     TEXT,                    -- base64 서명 이미지 (v0.111m 추가)
  UNIQUE(assessment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ra_sigs_assessment ON risk_assessment_signatures(assessment_id);
CREATE INDEX IF NOT EXISTS idx_ra_sigs_user       ON risk_assessment_signatures(user_id);

-- ② 교육 법령기준 테이블 (안전보건교육 법적 기준 데이터)
CREATE TABLE IF NOT EXISTS legal_notices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_key  TEXT UNIQUE NOT NULL,   -- 'edu_periodic' | 'edu_hire' | 'edu_job_change' | 'edu_special' | 'edu_supervisor'
  title       TEXT NOT NULL,
  law_ref     TEXT,                   -- 법령 참조 텍스트 (서브타이틀)
  content     TEXT,                   -- JSON 배열: [{target, hours, fine}, ...]
  is_active   INTEGER DEFAULT 1,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
