-- 0029: 자식 테이블들의 FOREIGN KEY를 "tasks_old" → tasks 로 수정
-- 원인: 0028 마이그레이션에서 tasks 테이블 재생성 시 자식 테이블 FK가 "tasks_old" 참조로 남아
--       UPDATE tasks 실행 시 "no such table: main.tasks_old" 에러 발생
-- 영향 테이블: task_assignments, tbm_records, work_logs, site_inspections,
--             hazard_reports, task_work_types, task_photos, checklist_assessments,
--             risk_assessments, task_attachments

PRAGMA foreign_keys = OFF;

-- ── 1. task_assignments ──────────────────────────────────────────────
ALTER TABLE task_assignments RENAME TO task_assignments_old;
CREATE TABLE task_assignments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL,
  worker_id   INTEGER NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  assigned_by INTEGER,
  FOREIGN KEY (task_id)     REFERENCES tasks(id),
  FOREIGN KEY (worker_id)   REFERENCES users(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  UNIQUE(task_id, worker_id)
);
INSERT INTO task_assignments SELECT * FROM task_assignments_old;
DROP TABLE task_assignments_old;

-- ── 2. tbm_records ──────────────────────────────────────────────────
ALTER TABLE tbm_records RENAME TO tbm_records_old;
CREATE TABLE tbm_records (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id         INTEGER NOT NULL,
  conductor_id    INTEGER NOT NULL,
  tbm_date        DATETIME DEFAULT CURRENT_TIMESTAMP,
  location        TEXT,
  weather         TEXT,
  temperature     TEXT,
  workers_count   INTEGER DEFAULT 1,
  attendees       TEXT,
  safety_topics   TEXT,
  precautions     TEXT,
  special_notes   TEXT,
  signature_data  TEXT,
  kakao_shared    INTEGER DEFAULT 0,
  kakao_shared_at DATETIME,
  status          TEXT DEFAULT 'draft' CHECK(status IN ('draft','completed')),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  gps_address     TEXT,
  gps_lat         REAL,
  gps_lon         REAL,
  FOREIGN KEY (task_id)      REFERENCES tasks(id),
  FOREIGN KEY (conductor_id) REFERENCES users(id)
);
INSERT INTO tbm_records SELECT * FROM tbm_records_old;
DROP TABLE tbm_records_old;

-- ── 3. work_logs ─────────────────────────────────────────────────────
ALTER TABLE work_logs RENAME TO work_logs_old;
CREATE TABLE work_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id           INTEGER NOT NULL,
  worker_id         INTEGER NOT NULL,
  log_date          DATE NOT NULL,
  start_time        TIME,
  end_time          TIME,
  actual_quantity   REAL DEFAULT 0,
  quantity_unit     TEXT DEFAULT '개',
  work_description  TEXT,
  issues            TEXT,
  tomorrow_plan     TEXT,
  status            TEXT DEFAULT 'working' CHECK(status IN ('working','completed','paused')),
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  work_location     TEXT DEFAULT '',
  FOREIGN KEY (task_id)   REFERENCES tasks(id),
  FOREIGN KEY (worker_id) REFERENCES users(id)
);
INSERT INTO work_logs SELECT * FROM work_logs_old;
DROP TABLE work_logs_old;

-- ── 4. site_inspections ──────────────────────────────────────────────
ALTER TABLE site_inspections RENAME TO site_inspections_old;
CREATE TABLE site_inspections (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  inspector_id        INTEGER NOT NULL,
  inspection_date     DATETIME DEFAULT CURRENT_TIMESTAMP,
  location            TEXT NOT NULL,
  inspection_type     TEXT DEFAULT 'routine' CHECK(inspection_type IN ('routine','special','safety')),
  findings            TEXT,
  corrective_actions  TEXT,
  hazard_level        TEXT DEFAULT 'low' CHECK(hazard_level IN ('low','medium','high','critical')),
  status              TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')),
  due_date            DATE,
  closed_at           DATETIME,
  notes               TEXT,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  task_id             INTEGER REFERENCES tasks(id),
  inspection_date_only TEXT,
  inspection_result   TEXT DEFAULT 'none',
  result_reason       TEXT DEFAULT '',
  FOREIGN KEY (inspector_id) REFERENCES users(id)
);
INSERT INTO site_inspections SELECT * FROM site_inspections_old;
DROP TABLE site_inspections_old;

-- ── 5. hazard_reports ────────────────────────────────────────────────
ALTER TABLE hazard_reports RENAME TO hazard_reports_old;
CREATE TABLE hazard_reports (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id       INTEGER NOT NULL,
  task_id           INTEGER,
  report_date       DATETIME DEFAULT CURRENT_TIMESTAMP,
  location          TEXT NOT NULL,
  hazard_type       TEXT NOT NULL,
  hazard_description TEXT NOT NULL,
  risk_level        TEXT DEFAULT 'medium' CHECK(risk_level IN ('low','medium','high','critical')),
  immediate_action  TEXT,
  photo_data        TEXT,
  status            TEXT DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved')),
  resolved_by       INTEGER,
  resolved_at       DATETIME,
  resolution_notes  TEXT,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id),
  FOREIGN KEY (task_id)     REFERENCES tasks(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);
INSERT INTO hazard_reports SELECT * FROM hazard_reports_old;
DROP TABLE hazard_reports_old;

-- ── 6. task_work_types ───────────────────────────────────────────────
ALTER TABLE task_work_types RENAME TO task_work_types_old;
CREATE TABLE task_work_types (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      INTEGER NOT NULL,
  work_type_id INTEGER NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id)      REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (work_type_id) REFERENCES work_types(id),
  UNIQUE(task_id, work_type_id)
);
INSERT INTO task_work_types SELECT * FROM task_work_types_old;
DROP TABLE task_work_types_old;

-- ── 7. task_photos ───────────────────────────────────────────────────
ALTER TABLE task_photos RENAME TO task_photos_old;
CREATE TABLE task_photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL,
  photo_type  TEXT DEFAULT 'progress' CHECK(photo_type IN ('before','progress','after','hazard','tbm','completion')),
  file_name   TEXT NOT NULL,
  file_path   TEXT,
  file_data   TEXT,
  file_size   INTEGER,
  mime_type   TEXT DEFAULT 'image/jpeg',
  caption     TEXT,
  taken_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id)     REFERENCES tasks(id),
  FOREIGN KEY (uploader_id) REFERENCES users(id)
);
INSERT INTO task_photos SELECT * FROM task_photos_old;
DROP TABLE task_photos_old;

-- ── 8. checklist_assessments ─────────────────────────────────────────
ALTER TABLE checklist_assessments RENAME TO checklist_assessments_old;
CREATE TABLE checklist_assessments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      INTEGER NOT NULL,
  work_class   TEXT NOT NULL,
  assessor_id  INTEGER NOT NULL,
  assessed_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  status       TEXT DEFAULT 'draft' CHECK(status IN ('draft','completed')),
  kakao_shared INTEGER DEFAULT 0,
  notes        TEXT,
  gps_address  TEXT,
  gps_lat      REAL,
  gps_lon      REAL,
  FOREIGN KEY (task_id)     REFERENCES tasks(id),
  FOREIGN KEY (assessor_id) REFERENCES users(id)
);
INSERT INTO checklist_assessments SELECT * FROM checklist_assessments_old;
DROP TABLE checklist_assessments_old;

-- ── 9. risk_assessments ──────────────────────────────────────────────
ALTER TABLE risk_assessments RENAME TO risk_assessments_old;
CREATE TABLE risk_assessments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id         INTEGER,
  assessor_id     INTEGER NOT NULL,
  assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  weather         TEXT,
  temperature     TEXT,
  workers_count   INTEGER DEFAULT 1,
  notes           TEXT,
  status          TEXT DEFAULT 'draft' CHECK(status IN ('draft','completed','approved')),
  kakao_shared    INTEGER DEFAULT 0,
  kakao_shared_at DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  assessment_type TEXT NOT NULL DEFAULT 'task',
  title           TEXT,
  location        TEXT,
  FOREIGN KEY (task_id)     REFERENCES tasks(id),
  FOREIGN KEY (assessor_id) REFERENCES users(id)
);
INSERT INTO risk_assessments SELECT * FROM risk_assessments_old;
DROP TABLE risk_assessments_old;

-- ── 10. task_attachments ─────────────────────────────────────────────
ALTER TABLE task_attachments RENAME TO task_attachments_old;
CREATE TABLE task_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   INTEGER DEFAULT 0,
  mime_type   TEXT DEFAULT 'application/octet-stream',
  attach_type TEXT DEFAULT 'order',
  description TEXT DEFAULT '',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id)     REFERENCES tasks(id),
  FOREIGN KEY (uploader_id) REFERENCES users(id)
);
INSERT INTO task_attachments SELECT * FROM task_attachments_old;
DROP TABLE task_attachments_old;

-- ── 인덱스 재생성 ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_task_assignments_task   ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_worker ON task_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_tbm_records_task        ON tbm_records(task_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_task          ON work_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_photos_task        ON task_photos(task_id);
CREATE INDEX IF NOT EXISTS idx_checklist_task          ON checklist_assessments(task_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_task   ON risk_assessments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task   ON task_attachments(task_id);

PRAGMA foreign_keys = ON;

-- 검증: tasks_old 참조가 남아있지 않은지 확인
-- SELECT name FROM sqlite_master WHERE sql LIKE '%tasks_old%';
-- → 결과 없으면 정상
