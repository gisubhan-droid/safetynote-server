#!/usr/bin/env node
/**
 * NAS002 DB 완전 초기화 스크립트
 * ============================================================
 * 용도: patchSchema v0.154+ 정상 동작을 위한 핵심 테이블 생성
 *       기존 테이블(task_stops, task_types, teams 등)은 보존됨
 *
 * 실행 전 반드시: pm2 stop safetynote
 * 실행: /volume1/@appstore/Node.js_v18/usr/local/bin/node /volume1/safetynote/scripts/nas002_db_init.js
 * 실행 후: pm2 start safetynote && pm2 logs safetynote --nostream --lines 30
 *
 * 생성일: 2025-07-31
 * ============================================================
 */

'use strict';

const Database = require('/volume1/safetynote/node_modules/better-sqlite3');
const DB_PATH  = '/volume1/safetynote/safety.db';

console.log('='.repeat(60));
console.log('NAS002 DB 초기화 스크립트 시작');
console.log('DB 경로:', DB_PATH);
console.log('='.repeat(60));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');   // 마이그레이션 중 FK 해제
db.pragma('synchronous = NORMAL');

// ── 현재 테이블 목록 출력 ──────────────────────────────────────
const existingTables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).all().map(r => r.name);
console.log('\n[현재 존재하는 테이블]');
console.log(existingTables.join(', ') || '(없음)');

// ── 헬퍼: 컬럼 존재 여부 확인 ─────────────────────────────────
function hasColumn(table, col) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
    return cols.includes(col);
  } catch(_) { return false; }
}

// ── 헬퍼: 안전한 ALTER (중복 컬럼 무시) ──────────────────────
function safeAlter(sql, label) {
  try {
    db.exec(sql);
    console.log(`  ✅ ${label}`);
  } catch(e) {
    if (e.message && e.message.includes('duplicate column')) {
      console.log(`  ⏩ ${label} (이미 존재, 건너뜀)`);
    } else {
      console.log(`  ⚠️  ${label} 실패 (무시): ${e.message}`);
    }
  }
}

// ── Step 1: users 테이블 (patchSchema v0.154가 기대하는 최종 스키마) ──
console.log('\n[Step 1] users 테이블 생성...');
if (!existingTables.includes('users')) {
  // teams 테이블이 먼저 있어야 team_id FK가 가능 → teams 먼저 생성
  if (!existingTables.includes('teams')) {
    db.exec(`CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('  ✅ teams 테이블 생성 (users FK 선행)');
  }

  // users 테이블: v0.154 최종 스키마 (모든 마이그레이션 컬럼 포함)
  db.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'worker', 'lgu', 'lgu_plus')),
    department TEXT,
    phone TEXT,
    position TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- 0021: 확장 정보
    company TEXT,
    blood_type TEXT,
    emergency_contact TEXT,
    health_info TEXT,
    edu_hire_date TEXT,
    edu_special_electric TEXT,
    edu_special_confined TEXT,
    edu_special_loading TEXT,
    edu_experience_date TEXT,
    -- 0022: 팀 관리
    team_id INTEGER REFERENCES teams(id),
    is_leader INTEGER DEFAULT 0,
    -- 0037: 승인 대기
    is_pending INTEGER DEFAULT 0,
    rejection_reason TEXT DEFAULT NULL,
    approved_by INTEGER DEFAULT NULL,
    approved_at DATETIME DEFAULT NULL,
    -- 0039: 주민번호/동의
    id_number TEXT,
    privacy_agreed INTEGER DEFAULT 0,
    privacy_agreed_at DATETIME,
    security_agreed INTEGER DEFAULT 0,
    security_agreed_at DATETIME,
    location_agreed INTEGER DEFAULT 0,
    location_agreed_at DATETIME,
    -- 0045: sub_role
    sub_role TEXT NOT NULL DEFAULT '',
    -- 0046: grade
    grade TEXT DEFAULT '',
    -- 0110: 교육 이수 날짜
    edu_periodic_date DATE,
    edu_job_change_date DATE,
    edu_special_date DATE,
    edu_supervisor_date DATE,
    -- 0160: 특별교육 기록
    edu_special_records TEXT DEFAULT '{}',
    -- FCM / 권한 (patchSchema 후반부)
    fcm_token TEXT DEFAULT NULL,
    permissions TEXT DEFAULT NULL
  )`);
  console.log('  ✅ users 테이블 생성 완료 (v0.154 최종 스키마)');

  // admin 계정 삽입
  db.prepare(`INSERT OR IGNORE INTO users
    (username, password_hash, name, role, department, position, is_active, sub_role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('admin', 'admin1234', '시스템관리자', 'admin', '관리부', '시스템관리자', 1, '');
  console.log('  ✅ admin 계정 삽입 (username=admin, pw=admin1234)');
} else {
  console.log('  ⏩ users 테이블 이미 존재 — 컬럼 보완만 수행');
  // 컬럼 보완 (누락된 것만 추가)
  const missingAlters = [
    ['company',              `ALTER TABLE users ADD COLUMN company TEXT`],
    ['blood_type',           `ALTER TABLE users ADD COLUMN blood_type TEXT`],
    ['emergency_contact',    `ALTER TABLE users ADD COLUMN emergency_contact TEXT`],
    ['health_info',          `ALTER TABLE users ADD COLUMN health_info TEXT`],
    ['edu_hire_date',        `ALTER TABLE users ADD COLUMN edu_hire_date TEXT`],
    ['edu_special_electric', `ALTER TABLE users ADD COLUMN edu_special_electric TEXT`],
    ['edu_special_confined', `ALTER TABLE users ADD COLUMN edu_special_confined TEXT`],
    ['edu_special_loading',  `ALTER TABLE users ADD COLUMN edu_special_loading TEXT`],
    ['edu_experience_date',  `ALTER TABLE users ADD COLUMN edu_experience_date TEXT`],
    ['team_id',              `ALTER TABLE users ADD COLUMN team_id INTEGER`],
    ['is_leader',            `ALTER TABLE users ADD COLUMN is_leader INTEGER DEFAULT 0`],
    ['is_pending',           `ALTER TABLE users ADD COLUMN is_pending INTEGER DEFAULT 0`],
    ['rejection_reason',     `ALTER TABLE users ADD COLUMN rejection_reason TEXT DEFAULT NULL`],
    ['approved_by',          `ALTER TABLE users ADD COLUMN approved_by INTEGER DEFAULT NULL`],
    ['approved_at',          `ALTER TABLE users ADD COLUMN approved_at DATETIME DEFAULT NULL`],
    ['id_number',            `ALTER TABLE users ADD COLUMN id_number TEXT`],
    ['privacy_agreed',       `ALTER TABLE users ADD COLUMN privacy_agreed INTEGER DEFAULT 0`],
    ['privacy_agreed_at',    `ALTER TABLE users ADD COLUMN privacy_agreed_at DATETIME`],
    ['security_agreed',      `ALTER TABLE users ADD COLUMN security_agreed INTEGER DEFAULT 0`],
    ['security_agreed_at',   `ALTER TABLE users ADD COLUMN security_agreed_at DATETIME`],
    ['location_agreed',      `ALTER TABLE users ADD COLUMN location_agreed INTEGER DEFAULT 0`],
    ['location_agreed_at',   `ALTER TABLE users ADD COLUMN location_agreed_at DATETIME`],
    ['sub_role',             `ALTER TABLE users ADD COLUMN sub_role TEXT NOT NULL DEFAULT ''`],
    ['grade',                `ALTER TABLE users ADD COLUMN grade TEXT DEFAULT ''`],
    ['edu_periodic_date',    `ALTER TABLE users ADD COLUMN edu_periodic_date DATE`],
    ['edu_job_change_date',  `ALTER TABLE users ADD COLUMN edu_job_change_date DATE`],
    ['edu_special_date',     `ALTER TABLE users ADD COLUMN edu_special_date DATE`],
    ['edu_supervisor_date',  `ALTER TABLE users ADD COLUMN edu_supervisor_date DATE`],
    ['edu_special_records',  `ALTER TABLE users ADD COLUMN edu_special_records TEXT DEFAULT '{}'`],
    ['fcm_token',            `ALTER TABLE users ADD COLUMN fcm_token TEXT DEFAULT NULL`],
    ['permissions',          `ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL`],
  ];
  for (const [col, sql] of missingAlters) {
    if (!hasColumn('users', col)) {
      safeAlter(sql, `users.${col} 추가`);
    }
  }

  // role CHECK에 lgu_plus가 없으면 (드문 케이스) 경고만
  const usersSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get() || {}).sql || '';
  if (!usersSchema.includes("'lgu_plus'")) {
    console.log('  ⚠️  users.role CHECK에 lgu_plus 없음 → patchSchema v0.154가 재생성 시도합니다');
  } else {
    console.log('  ✅ users.role CHECK에 lgu_plus 포함 확인');
  }
}

// ── Step 2: work_categories / work_types ──────────────────────
console.log('\n[Step 2] work_categories, work_types 테이블...');
db.exec(`CREATE TABLE IF NOT EXISTS work_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE TABLE IF NOT EXISTS work_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES work_categories(id)
)`);
console.log('  ✅ work_categories, work_types');

// ── Step 3: tasks 테이블 ──────────────────────────────────────
console.log('\n[Step 3] tasks 테이블...');
if (!existingTables.includes('tasks')) {
  db.exec(`CREATE TABLE tasks (
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
    status TEXT NOT NULL DEFAULT 'unassigned'
      CHECK(status IN ('unassigned','assigned','in_progress','tbm_done','working','completed','cancelled','work_completed')),
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- 0011: work_class
    work_class TEXT DEFAULT 'line' CHECK(work_class IN ('line','equipment','pipe','bucket','pole','rooftop','ladder','heavy','all')),
    -- 0020: 타임스탬프
    started_at DATETIME,
    completed_at DATETIME,
    tbm_done_at DATETIME,
    -- 0022: 공사 관련
    construction_type TEXT DEFAULT '',
    request_no TEXT DEFAULT '',
    contractor_name TEXT DEFAULT '',
    -- 0023: 위험도
    risk_level TEXT DEFAULT 'low' CHECK(risk_level IN ('low','medium','high')),
    -- 0024: LGU 감독자
    lgu_supervisor TEXT DEFAULT '',
    -- 0025: 작업번호
    work_number TEXT DEFAULT '',
    -- 0028: work_completed 상태 관련
    work_completed_at DATETIME,
    -- 0036: 확정주소
    confirmed_address TEXT DEFAULT '',
    -- 0041: 공사 연결
    construction_id INTEGER REFERENCES constructions(id),
    sub_task_number TEXT DEFAULT '',
    -- 0050: GPS
    gps_lat REAL,
    gps_lng REAL,
    gps_accuracy REAL,
    gps_captured_at DATETIME,
    -- 0053: GPS 추가
    start_gps_lat REAL,
    start_gps_lng REAL,
    start_gps_accuracy REAL,
    start_gps_captured_at DATETIME,
    -- 0173: work_sub_class
    work_sub_class TEXT DEFAULT '',
    FOREIGN KEY (category_id) REFERENCES work_categories(id),
    FOREIGN KEY (work_type_id) REFERENCES work_types(id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);
  console.log('  ✅ tasks 테이블 생성 완료 (전체 컬럼 포함)');

  // 인덱스
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_supervisor ON tasks(supervisor_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_planned_date ON tasks(planned_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_construction_id ON tasks(construction_id)`);
  console.log('  ✅ tasks 인덱스 생성');
} else {
  console.log('  ⏩ tasks 테이블 이미 존재 — 컬럼 보완');
  const taskAlters = [
    ['work_class',            `ALTER TABLE tasks ADD COLUMN work_class TEXT DEFAULT 'line'`],
    ['construction_type',     `ALTER TABLE tasks ADD COLUMN construction_type TEXT DEFAULT ''`],
    ['request_no',            `ALTER TABLE tasks ADD COLUMN request_no TEXT DEFAULT ''`],
    ['contractor_name',       `ALTER TABLE tasks ADD COLUMN contractor_name TEXT DEFAULT ''`],
    ['risk_level',            `ALTER TABLE tasks ADD COLUMN risk_level TEXT DEFAULT 'low'`],
    ['lgu_supervisor',        `ALTER TABLE tasks ADD COLUMN lgu_supervisor TEXT DEFAULT ''`],
    ['work_number',           `ALTER TABLE tasks ADD COLUMN work_number TEXT DEFAULT ''`],
    ['confirmed_address',     `ALTER TABLE tasks ADD COLUMN confirmed_address TEXT DEFAULT ''`],
    ['construction_id',       `ALTER TABLE tasks ADD COLUMN construction_id INTEGER`],
    ['sub_task_number',       `ALTER TABLE tasks ADD COLUMN sub_task_number TEXT DEFAULT ''`],
    ['gps_lat',               `ALTER TABLE tasks ADD COLUMN gps_lat REAL`],
    ['gps_lng',               `ALTER TABLE tasks ADD COLUMN gps_lng REAL`],
    ['gps_accuracy',          `ALTER TABLE tasks ADD COLUMN gps_accuracy REAL`],
    ['gps_captured_at',       `ALTER TABLE tasks ADD COLUMN gps_captured_at DATETIME`],
    ['work_sub_class',        `ALTER TABLE tasks ADD COLUMN work_sub_class TEXT DEFAULT ''`],
  ];
  for (const [col, sql] of taskAlters) {
    if (!hasColumn('tasks', col)) safeAlter(sql, `tasks.${col} 추가`);
  }
}

// ── Step 4: task_assignments ───────────────────────────────────
console.log('\n[Step 4] task_assignments...');
db.exec(`CREATE TABLE IF NOT EXISTS task_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  worker_id INTEGER NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  assigned_by INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (worker_id) REFERENCES users(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  UNIQUE(task_id, worker_id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_task_assignments_worker ON task_assignments(worker_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id)`);
console.log('  ✅ task_assignments');

// ── Step 4b: task_work_types ──────────────────────────────────
console.log('\n[Step 4b] task_work_types...');
db.exec(`CREATE TABLE IF NOT EXISTS task_work_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  work_type_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (work_type_id) REFERENCES work_types(id),
  UNIQUE(task_id, work_type_id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_task_work_types_task ON task_work_types(task_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_task_work_types_type ON task_work_types(work_type_id)`);
console.log('  ✅ task_work_types');

// ── Step 4c: task_attachments ─────────────────────────────────
console.log('\n[Step 4c] task_attachments...');
db.exec(`CREATE TABLE IF NOT EXISTS task_attachments (
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
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id)`);
console.log('  ✅ task_attachments');

// ── Step 5: constructions 테이블 ─────────────────────────────
console.log('\n[Step 5] constructions 테이블...');
if (!existingTables.includes('constructions')) {
  db.exec(`CREATE TABLE constructions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    request_no           TEXT UNIQUE NOT NULL,
    work_number          TEXT NOT NULL DEFAULT '',
    title                TEXT NOT NULL,
    work_order_address   TEXT DEFAULT '',
    manager_id           INTEGER,
    manager_name         TEXT DEFAULT '',
    supervisor_name      TEXT DEFAULT '',
    description          TEXT DEFAULT '',
    status               TEXT NOT NULL DEFAULT 'registered'
                         CHECK(status IN ('registered','in_progress','completed','settled')),
    -- 0043: work_class
    work_class           TEXT DEFAULT '',
    -- 0048: 정산 요청
    settlement_requested INTEGER DEFAULT 0,
    settlement_requested_at DATETIME,
    -- 0056: 준공일
    completion_date      DATE,
    -- 0057: 통지일
    notification_date    DATE,
    -- 0058: 통지금액
    notification_amount  REAL DEFAULT 0,
    -- 0059: 공사번호
    con_number           TEXT DEFAULT '',
    created_by           INTEGER,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_constructions_request_no ON constructions(request_no)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_constructions_status ON constructions(status)`);
  console.log('  ✅ constructions 테이블 생성 완료 (전체 컬럼 포함)');
} else {
  console.log('  ⏩ constructions 테이블 이미 존재 — 컬럼 보완');
  const conAlters = [
    ['work_class',               `ALTER TABLE constructions ADD COLUMN work_class TEXT DEFAULT ''`],
    ['settlement_requested',     `ALTER TABLE constructions ADD COLUMN settlement_requested INTEGER DEFAULT 0`],
    ['settlement_requested_at',  `ALTER TABLE constructions ADD COLUMN settlement_requested_at DATETIME`],
    ['completion_date',          `ALTER TABLE constructions ADD COLUMN completion_date DATE`],
    ['notification_date',        `ALTER TABLE constructions ADD COLUMN notification_date DATE`],
    ['notification_amount',      `ALTER TABLE constructions ADD COLUMN notification_amount REAL DEFAULT 0`],
    ['con_number',               `ALTER TABLE constructions ADD COLUMN con_number TEXT DEFAULT ''`],
  ];
  for (const [col, sql] of conAlters) {
    if (!hasColumn('constructions', col)) safeAlter(sql, `constructions.${col} 추가`);
  }
}

// ── Step 6: checklist_items ───────────────────────────────────
console.log('\n[Step 6] checklist_items...');
db.exec(`CREATE TABLE IF NOT EXISTS checklist_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  work_class  TEXT NOT NULL DEFAULT 'all',
  category    TEXT NOT NULL,
  question    TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  note        TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
console.log('  ✅ checklist_items');

// ── Step 7: 기타 핵심 테이블들 ───────────────────────────────
console.log('\n[Step 7] 기타 핵심 테이블...');

// risk_assessment_items
db.exec(`CREATE TABLE IF NOT EXISTS risk_assessment_items (
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
)`);

// risk_assessments
db.exec(`CREATE TABLE IF NOT EXISTS risk_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  assessor_id INTEGER NOT NULL,
  assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  weather TEXT,
  temperature TEXT,
  workers_count INTEGER DEFAULT 1,
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','completed','approved','submitted')),
  kakao_shared INTEGER DEFAULT 0,
  kakao_shared_at DATETIME,
  type TEXT DEFAULT 'checklist',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (assessor_id) REFERENCES users(id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_risk_assessments_task ON risk_assessments(task_id)`);

// risk_assessment_details
db.exec(`CREATE TABLE IF NOT EXISTS risk_assessment_details (
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
)`);

// tbm_records
db.exec(`CREATE TABLE IF NOT EXISTS tbm_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  conductor_id INTEGER NOT NULL,
  tbm_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  location TEXT,
  weather TEXT,
  temperature TEXT,
  workers_count INTEGER DEFAULT 1,
  attendees TEXT,
  safety_topics TEXT,
  precautions TEXT,
  special_notes TEXT,
  signature_data TEXT,
  kakao_shared INTEGER DEFAULT 0,
  kakao_shared_at DATETIME,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','completed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (conductor_id) REFERENCES users(id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tbm_records_task ON tbm_records(task_id)`);

// work_logs
db.exec(`CREATE TABLE IF NOT EXISTS work_logs (
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
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_work_logs_task ON work_logs(task_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_work_logs_worker ON work_logs(worker_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(log_date)`);

// task_photos
db.exec(`CREATE TABLE IF NOT EXISTS task_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL,
  photo_type TEXT DEFAULT 'progress'
    CHECK(photo_type IN ('before','progress','after','hazard','tbm','completion')),
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  caption TEXT,
  stage TEXT DEFAULT '03',
  taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (uploader_id) REFERENCES users(id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_task_photos_task ON task_photos(task_id)`);

// site_inspections (0006: task_id, 0007: inspection_date_only/result/reason, patchSchema: updated_at)
db.exec(`CREATE TABLE IF NOT EXISTS site_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspector_id INTEGER NOT NULL,
  inspection_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  location TEXT NOT NULL,
  inspection_type TEXT DEFAULT 'routine'
    CHECK(inspection_type IN ('routine','special','safety')),
  findings TEXT,
  corrective_actions TEXT,
  hazard_level TEXT DEFAULT 'low'
    CHECK(hazard_level IN ('low','medium','high','critical')),
  status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')),
  due_date DATE,
  closed_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  task_id INTEGER REFERENCES tasks(id),
  inspection_date_only TEXT,
  inspection_result TEXT NOT NULL DEFAULT 'none',
  result_reason TEXT NOT NULL DEFAULT '',
  updated_at DATETIME,
  FOREIGN KEY (inspector_id) REFERENCES users(id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_site_inspections_task_id ON site_inspections(task_id)`);

// inspection_photos
db.exec(`CREATE TABLE IF NOT EXISTS inspection_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  caption TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspection_id) REFERENCES site_inspections(id)
)`);

// hazard_reports
db.exec(`CREATE TABLE IF NOT EXISTS hazard_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  task_id INTEGER,
  report_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  location TEXT NOT NULL,
  hazard_type TEXT NOT NULL,
  hazard_description TEXT NOT NULL,
  risk_level TEXT DEFAULT 'medium'
    CHECK(risk_level IN ('low','medium','high','critical')),
  immediate_action TEXT,
  suggestion TEXT DEFAULT '',
  photo_data TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved')),
  report_type TEXT DEFAULT 'hazard'
    CHECK(report_type IN ('hazard','near_miss','improvement')),
  resolved_by INTEGER,
  resolved_at DATETIME,
  resolution_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_hazard_reports_status ON hazard_reports(status)`);

console.log('  ✅ 기타 핵심 테이블 생성 완료');

// ── Step 8: checklist 관련 테이블들 ──────────────────────────
console.log('\n[Step 8] 체크리스트 관련 테이블...');
db.exec(`CREATE TABLE IF NOT EXISTS checklist_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  work_class TEXT NOT NULL,
  assessor_id INTEGER NOT NULL,
  assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','completed')),
  kakao_shared INTEGER DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (assessor_id) REFERENCES users(id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS checklist_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  response TEXT DEFAULT NULL
    CHECK(response IS NULL OR response IN ('na','ok','nok')),
  memo TEXT,
  FOREIGN KEY (assessment_id) REFERENCES checklist_assessments(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES checklist_items(id),
  UNIQUE(assessment_id, item_id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS tbm_photo_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL,
  section_type TEXT NOT NULL,
  section_name TEXT NOT NULL,
  is_required INTEGER DEFAULT 1,
  FOREIGN KEY (assessment_id) REFERENCES checklist_assessments(id) ON DELETE CASCADE
)`);

db.exec(`CREATE TABLE IF NOT EXISTS tbm_photo_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  file_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES tbm_photo_sections(id) ON DELETE CASCADE
)`);
console.log('  ✅ 체크리스트 관련 테이블');

// ── Step 9: system_settings ───────────────────────────────────
console.log('\n[Step 9] system_settings...');
db.exec(`CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  label TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
// 기본값 삽입
const defaultSettings = [
  ['upload_root_path',  '', '파일 저장 루트 경로', 'NAS 또는 로컬 경로'],
  ['use_task_folder',   'true', '작업별 폴더 구조 사용', ''],
  ['task_photo_subdir', '작업사진', '작업 사진 하위폴더명', ''],
  ['inspection_subdir', '안전점검', '점검 사진 하위폴더명', ''],
];
const insertSetting = db.prepare(
  `INSERT OR IGNORE INTO system_settings (key, value, label, description) VALUES (?, ?, ?, ?)`
);
for (const [k, v, l, d] of defaultSettings) {
  insertSetting.run(k, v, l, d);
}
console.log('  ✅ system_settings');

// ── Step 10: periodic_risk_assessments ───────────────────────
console.log('\n[Step 10] periodic_risk_assessments...');
db.exec(`CREATE TABLE IF NOT EXISTS periodic_risk_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'periodic'
    CHECK(type IN ('periodic','special')),
  title TEXT NOT NULL,
  work_type TEXT,
  location TEXT,
  assessor_id INTEGER NOT NULL,
  assessed_date DATE NOT NULL,
  status TEXT DEFAULT 'draft'
    CHECK(status IN ('draft','submitted','approved')),
  notes TEXT,
  kakao_shared INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assessor_id) REFERENCES users(id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS periodic_risk_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL,
  hazard_category TEXT NOT NULL,
  hazard_factor TEXT NOT NULL,
  risk_before INTEGER DEFAULT 1,
  risk_after INTEGER DEFAULT 1,
  control_measures TEXT,
  responsible TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','done')),
  FOREIGN KEY (assessment_id) REFERENCES periodic_risk_assessments(id) ON DELETE CASCADE
)`);
console.log('  ✅ periodic_risk_assessments');

// ── Step 11: risk_assessment_workflow ─────────────────────────
console.log('\n[Step 11] risk_assessment 워크플로우 테이블...');
db.exec(`CREATE TABLE IF NOT EXISTS risk_assessment_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  position TEXT DEFAULT '',
  role TEXT DEFAULT 'member',
  signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sign_method TEXT DEFAULT 'account',
  sign_data TEXT,
  UNIQUE(assessment_id, user_id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ra_sigs_assessment ON risk_assessment_signatures(assessment_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ra_sigs_user ON risk_assessment_signatures(user_id)`);
console.log('  ✅ risk_assessment_signatures');

// ── Step 12: 기타 보조 테이블들 ──────────────────────────────
console.log('\n[Step 12] 보조 테이블들...');

db.exec(`CREATE TABLE IF NOT EXISTS legal_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  law_ref TEXT,
  content TEXT,
  is_active INTEGER DEFAULT 1,
  updated_by INTEGER REFERENCES users(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS signature_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  worker_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','signed','rejected')),
  requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME,
  sign_data TEXT,
  UNIQUE(assessment_id, worker_id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS safety_education_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edu_type TEXT NOT NULL,
  edu_subject TEXT NOT NULL,
  edu_date DATE NOT NULL,
  edu_hours REAL NOT NULL,
  edu_location TEXT DEFAULT '',
  instructor TEXT DEFAULT '',
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  notes TEXT DEFAULT '',
  edu_content TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_edu_sessions_type ON safety_education_sessions(edu_type)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_edu_sessions_date ON safety_education_sessions(edu_date)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_edu_sessions_year ON safety_education_sessions(year)`);

db.exec(`CREATE TABLE IF NOT EXISTS safety_education_attendees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES safety_education_sessions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  department TEXT DEFAULT '',
  position TEXT DEFAULT '',
  sign_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_edu_attendees_sess ON safety_education_attendees(session_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_edu_attendees_user ON safety_education_attendees(user_id)`);

db.exec(`CREATE TABLE IF NOT EXISTS edu_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES safety_education_sessions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_edu_photos_session ON edu_photos(session_id)`);

db.exec(`CREATE TABLE IF NOT EXISTS edu_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL UNIQUE REFERENCES safety_education_sessions(id) ON DELETE CASCADE,
  report_data TEXT,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  generated_by INTEGER REFERENCES users(id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_edu_reports_session ON edu_reports(session_id)`);

db.exec(`CREATE TABLE IF NOT EXISTS work_report_extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT '',
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
)`);

console.log('  ✅ 보조 테이블들');

// ── Step 13: teams 테이블 확인 ────────────────────────────────
console.log('\n[Step 13] teams 테이블 확인...');
db.exec(`CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id)`);
console.log('  ✅ teams');

// ── Step 14: notifications ────────────────────────────────────
console.log('\n[Step 14] notifications...');
db.exec(`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)`);
console.log('  ✅ notifications');

// ── 최종: PRAGMA 복원 및 검증 ─────────────────────────────────
db.pragma('foreign_keys = ON');

console.log('\n' + '='.repeat(60));
console.log('[최종 검증] 생성된 테이블 목록:');
const finalTables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).all().map(r => r.name);
console.log(finalTables.join(', '));

// 핵심 테이블 존재 확인
const criticalTables = ['users', 'tasks', 'constructions', 'checklist_items', 'system_settings', 'teams'];
let allOk = true;
console.log('\n[핵심 테이블 체크]');
for (const t of criticalTables) {
  const exists = finalTables.includes(t);
  console.log(`  ${exists ? '✅' : '❌'} ${t}`);
  if (!exists) allOk = false;
}

// users 컬럼 확인
console.log('\n[users 컬럼 확인]');
const userCols = db.prepare('PRAGMA table_info(users)').all().map(r => r.name);
console.log('  컬럼:', userCols.join(', '));
const requiredCols = ['company', 'sub_role', 'grade', 'team_id', 'is_pending', 'id_number', 'edu_special_records'];
for (const col of requiredCols) {
  const has = userCols.includes(col);
  console.log(`  ${has ? '✅' : '❌'} users.${col}`);
  if (!has) allOk = false;
}

// users role CHECK 확인
const usersSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get() || {}).sql || '';
const hasLguPlus = usersSchema.includes("'lgu_plus'");
console.log(`\n[users.role CHECK]`);
console.log(`  ${hasLguPlus ? '✅' : '⚠️ '} lgu_plus 포함: ${hasLguPlus}`);
if (!hasLguPlus) {
  console.log('  → patchSchema v0.154가 서버 시작 시 자동으로 추가합니다');
}

// admin 계정 확인
console.log('\n[admin 계정 확인]');
const admin = db.prepare("SELECT id, username, name, role FROM users WHERE username='admin'").get();
if (admin) {
  console.log(`  ✅ admin 계정: id=${admin.id}, name=${admin.name}, role=${admin.role}`);
} else {
  console.log('  ⚠️  admin 계정 없음 — 로그인 후 생성 필요');
}

db.close();

console.log('\n' + '='.repeat(60));
if (allOk) {
  console.log('✅ DB 초기화 완료! 이제 서버를 시작하세요:');
  console.log('   pm2 start safetynote');
  console.log('   pm2 logs safetynote --nostream --lines 30');
  console.log('\n   patchSchema v0.154가 lgu_plus CHECK를 자동 추가합니다.');
  console.log('   (재생성 성공 시 "users 재생성 완료" 로그 확인)');
} else {
  console.log('⚠️  일부 항목 실패 — 위 로그를 확인하세요');
}
console.log('='.repeat(60));
