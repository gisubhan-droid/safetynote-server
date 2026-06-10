-- 현장점검 작업자 연결 테이블 (불량/우수 시 해당 작업자 기록)
CREATE TABLE IF NOT EXISTS inspection_workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL,
  worker_id     INTEGER NOT NULL,
  result_type   TEXT NOT NULL CHECK(result_type IN ('불량','우수')),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspection_id) REFERENCES site_inspections(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id)     REFERENCES users(id),
  UNIQUE(inspection_id, worker_id)
);
CREATE INDEX IF NOT EXISTS idx_inspection_workers_inspection_id ON inspection_workers(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_workers_worker_id     ON inspection_workers(worker_id);
