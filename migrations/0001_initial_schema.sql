-- 현장 안전관리 시스템 초기 스키마

-- 사용자 테이블 (관리감독자 / 근로자)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'worker')),
  department TEXT,
  phone TEXT,
  position TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 작업 분류 테이블
CREATE TABLE IF NOT EXISTS work_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 작업 하위 유형 테이블
CREATE TABLE IF NOT EXISTS work_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES work_categories(id)
);

-- 작업 목록 테이블
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category_id INTEGER,
  work_type_id INTEGER,
  location TEXT,
  planned_date DATE,
  planned_quantity REAL,
  quantity_unit TEXT DEFAULT '개',
  supervisor_id INTEGER,
  status TEXT NOT NULL DEFAULT 'unassigned' CHECK(status IN ('unassigned','assigned','in_progress','tbm_done','working','completed','cancelled')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES work_categories(id),
  FOREIGN KEY (work_type_id) REFERENCES work_types(id),
  FOREIGN KEY (supervisor_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 작업 배정 테이블 (작업자 다수 배정 가능)
CREATE TABLE IF NOT EXISTS task_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  worker_id INTEGER NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  assigned_by INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (worker_id) REFERENCES users(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  UNIQUE(task_id, worker_id)
);

-- 위험성 평가 항목 마스터 (작업안전가이드 기준)
CREATE TABLE IF NOT EXISTS risk_assessment_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_type_id INTEGER,
  category TEXT NOT NULL,
  hazard TEXT NOT NULL,
  risk_factor TEXT NOT NULL,
  before_frequency INTEGER DEFAULT 3,
  before_severity INTEGER DEFAULT 3,
  before_risk_level TEXT,
  control_measures TEXT NOT NULL,
  after_frequency INTEGER DEFAULT 1,
  after_severity INTEGER DEFAULT 2,
  after_risk_level TEXT,
  responsible TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_type_id) REFERENCES work_types(id)
);

-- 작업별 위험성 평가 기록
CREATE TABLE IF NOT EXISTS risk_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  assessor_id INTEGER NOT NULL,
  assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  weather TEXT,
  temperature TEXT,
  workers_count INTEGER DEFAULT 1,
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','completed','approved')),
  kakao_shared INTEGER DEFAULT 0,
  kakao_shared_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (assessor_id) REFERENCES users(id)
);

-- 위험성 평가 세부 항목 기록
CREATE TABLE IF NOT EXISTS risk_assessment_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL,
  item_id INTEGER,
  category TEXT NOT NULL,
  hazard TEXT NOT NULL,
  risk_factor TEXT NOT NULL,
  before_frequency INTEGER,
  before_severity INTEGER,
  before_risk_level TEXT,
  control_measures TEXT,
  after_frequency INTEGER,
  after_severity INTEGER,
  after_risk_level TEXT,
  is_confirmed INTEGER DEFAULT 0,
  FOREIGN KEY (assessment_id) REFERENCES risk_assessments(id),
  FOREIGN KEY (item_id) REFERENCES risk_assessment_items(id)
);

-- TBM (Tool Box Meeting) 기록
CREATE TABLE IF NOT EXISTS tbm_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  conductor_id INTEGER NOT NULL,
  tbm_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  location TEXT,
  weather TEXT,
  temperature TEXT,
  workers_count INTEGER DEFAULT 1,
  attendees TEXT,  -- JSON array of worker names
  safety_topics TEXT,  -- 안전 교육 내용
  precautions TEXT,  -- 주의사항
  special_notes TEXT,  -- 특이사항
  signature_data TEXT,  -- 서명 데이터 (base64)
  kakao_shared INTEGER DEFAULT 0,
  kakao_shared_at DATETIME,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','completed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (conductor_id) REFERENCES users(id)
);

-- 작업 진행 기록 (작업 일지)
CREATE TABLE IF NOT EXISTS work_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  worker_id INTEGER NOT NULL,
  log_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  actual_quantity REAL DEFAULT 0,
  quantity_unit TEXT DEFAULT '개',
  work_description TEXT,
  issues TEXT,
  tomorrow_plan TEXT,
  status TEXT DEFAULT 'working' CHECK(status IN ('working','completed','paused')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (worker_id) REFERENCES users(id)
);

-- 작업 사진 테이블
CREATE TABLE IF NOT EXISTS task_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL,
  photo_type TEXT DEFAULT 'progress' CHECK(photo_type IN ('before','progress','after','hazard','tbm','completion')),
  file_name TEXT NOT NULL,
  file_data TEXT NOT NULL,  -- base64 encoded image
  file_size INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  caption TEXT,
  taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (uploader_id) REFERENCES users(id)
);

-- 현장 점검 테이블
CREATE TABLE IF NOT EXISTS site_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspector_id INTEGER NOT NULL,
  inspection_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  location TEXT NOT NULL,
  inspection_type TEXT DEFAULT 'routine' CHECK(inspection_type IN ('routine','special','safety')),
  findings TEXT,
  corrective_actions TEXT,
  hazard_level TEXT DEFAULT 'low' CHECK(hazard_level IN ('low','medium','high','critical')),
  status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')),
  due_date DATE,
  closed_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspector_id) REFERENCES users(id)
);

-- 현장 점검 사진
CREATE TABLE IF NOT EXISTS inspection_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_data TEXT NOT NULL,
  caption TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspection_id) REFERENCES site_inspections(id)
);

-- 위험 작업 포착 (위험 상황 신고)
CREATE TABLE IF NOT EXISTS hazard_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  task_id INTEGER,
  report_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  location TEXT NOT NULL,
  hazard_type TEXT NOT NULL,
  hazard_description TEXT NOT NULL,
  risk_level TEXT DEFAULT 'medium' CHECK(risk_level IN ('low','medium','high','critical')),
  immediate_action TEXT,
  photo_data TEXT,  -- base64
  status TEXT DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved')),
  resolved_by INTEGER,
  resolved_at DATETIME,
  resolution_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_supervisor ON tasks(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_tasks_planned_date ON tasks(planned_date);
CREATE INDEX IF NOT EXISTS idx_task_assignments_worker ON task_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_task ON work_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_worker ON work_logs(worker_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_task_photos_task ON task_photos(task_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_task ON risk_assessments(task_id);
CREATE INDEX IF NOT EXISTS idx_tbm_records_task ON tbm_records(task_id);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_status ON hazard_reports(status);
