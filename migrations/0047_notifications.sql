-- 알림 영구 저장 테이블
-- SSE로 실시간 전송하지만, 미접속 사용자를 위해 DB에도 보관
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,          -- 수신 대상 사용자 ID
  type        TEXT    NOT NULL,          -- 알림 유형 (settlement_request, task_created, ...)
  title       TEXT    NOT NULL,          -- 알림 제목
  message     TEXT    NOT NULL,          -- 알림 본문
  ref_id      INTEGER,                   -- 연관 레코드 ID (construction_id 등)
  ref_type    TEXT,                      -- 연관 레코드 종류 ('construction', 'task', ...)
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);
