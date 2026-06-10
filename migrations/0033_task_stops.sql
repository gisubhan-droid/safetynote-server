-- 작업중지 이력 테이블
CREATE TABLE IF NOT EXISTS task_stops (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reported_by   INTEGER NOT NULL REFERENCES users(id),
  stop_reason   TEXT    NOT NULL,   -- 작업환경 | 고위험 | 고객취소 | 기타
  notes         TEXT,               -- 비고 (자유 입력)
  photo_data    TEXT,               -- base64 사진
  stopped_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_stops_task_id ON task_stops(task_id);
