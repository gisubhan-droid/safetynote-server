-- 작업 유형 다중 선택을 위한 연결 테이블
CREATE TABLE IF NOT EXISTS task_work_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  work_type_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (work_type_id) REFERENCES work_types(id),
  UNIQUE(task_id, work_type_id)
);

CREATE INDEX IF NOT EXISTS idx_task_work_types_task ON task_work_types(task_id);
CREATE INDEX IF NOT EXISTS idx_task_work_types_type ON task_work_types(work_type_id);

-- 기존 tasks.work_type_id 데이터를 새 테이블로 마이그레이션
INSERT OR IGNORE INTO task_work_types (task_id, work_type_id)
SELECT id, work_type_id FROM tasks WHERE work_type_id IS NOT NULL;
