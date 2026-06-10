-- 0028: tasks.status CHECK constraint에 'work_completed' 추가
-- SQLite는 CHECK constraint를 ALTER로 수정할 수 없으므로 테이블 재생성 방식 사용
-- 워크플로우: unassigned → assigned → in_progress → tbm_done → working → work_completed → completed

PRAGMA foreign_keys = OFF;

-- 1. 기존 tasks 테이블을 임시 이름으로 백업
ALTER TABLE tasks RENAME TO tasks_old;

-- 2. 새 tasks 테이블 생성 (실제 컬럼 기준 + work_completed CHECK 추가)
CREATE TABLE tasks (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  task_number           TEXT UNIQUE NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  category_id           INTEGER,
  work_type_id          INTEGER,
  location              TEXT,
  planned_date          DATE,
  planned_quantity      REAL,
  quantity_unit         TEXT DEFAULT '개',
  supervisor_id         INTEGER,
  status                TEXT NOT NULL DEFAULT 'unassigned'
                        CHECK(status IN ('unassigned','assigned','in_progress','tbm_done','working','work_completed','completed','cancelled')),
  priority              TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  notes                 TEXT,
  created_by            INTEGER,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  work_class            TEXT,
  work_class_new        TEXT,
  work_date             TEXT,
  work_order_address    TEXT,
  work_start_address    TEXT,
  work_start_at         TEXT,
  checklist_started_at  TEXT,
  work_started_at       TEXT,
  work_completed_at     TEXT,
  construction_type     TEXT DEFAULT '',
  request_no            TEXT DEFAULT '',
  contractor_name       TEXT,
  risk_level            TEXT DEFAULT 'normal',
  lgu_supervisor        TEXT,
  work_number           TEXT DEFAULT '',
  work_log_required     INTEGER DEFAULT 0,
  FOREIGN KEY (category_id)  REFERENCES work_categories(id),
  FOREIGN KEY (work_type_id) REFERENCES work_types(id),
  FOREIGN KEY (supervisor_id) REFERENCES users(id),
  FOREIGN KEY (created_by)    REFERENCES users(id)
);

-- 3. 기존 데이터 전체 복사
INSERT INTO tasks SELECT
  id, task_number, title, description, category_id, work_type_id,
  location, planned_date, planned_quantity, quantity_unit, supervisor_id,
  status, priority, notes, created_by, created_at, updated_at,
  work_class, work_class_new, work_date, work_order_address,
  work_start_address, work_start_at,
  checklist_started_at, work_started_at, work_completed_at,
  construction_type, request_no, contractor_name,
  risk_level, lgu_supervisor, work_number, work_log_required
FROM tasks_old;

-- 4. 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_tasks_status            ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_planned_date      ON tasks(planned_date);
CREATE INDEX IF NOT EXISTS idx_tasks_supervisor        ON tasks(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_tasks_construction_type ON tasks(construction_type);

-- 5. 임시 테이블 삭제
DROP TABLE tasks_old;

PRAGMA foreign_keys = ON;
