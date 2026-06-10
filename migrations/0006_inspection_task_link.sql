-- 현장점검에 작업 연결 컬럼 추가
ALTER TABLE site_inspections ADD COLUMN task_id INTEGER REFERENCES tasks(id);
CREATE INDEX IF NOT EXISTS idx_site_inspections_task_id ON site_inspections(task_id);
CREATE INDEX IF NOT EXISTS idx_site_inspections_inspector_id ON site_inspections(inspector_id);
