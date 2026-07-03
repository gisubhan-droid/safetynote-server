-- FEAT-037: TBM 완료 결과 공유 토큰 테이블 (7일 유효, 로그인 불필요 공개 URL)
CREATE TABLE IF NOT EXISTS tbm_share_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT UNIQUE NOT NULL,
  tbm_id      INTEGER NOT NULL,
  task_id     INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME,
  view_count  INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tbm_share_tokens_token  ON tbm_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_tbm_share_tokens_tbm_id ON tbm_share_tokens(tbm_id);
