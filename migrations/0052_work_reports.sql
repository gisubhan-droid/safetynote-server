-- 0052: 외선작업일보 / 기타공종 / 물량통계 테이블 생성

-- ═══════════════════════════════════════════════════════════════
-- 1. 외선작업일보 헤더 (1 task = 1 report)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS work_reports (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id          INTEGER NOT NULL UNIQUE,          -- tasks.id 연결
  detail_type      TEXT DEFAULT '',                  -- 상세구분 (사용자 입력)
  work_date        TEXT DEFAULT '',                  -- 작업일 (tasks.work_completed_at 자동)
  worker_team      TEXT DEFAULT '',                  -- 작업자(팀명) 자동입력
  manager_name     TEXT DEFAULT '',                  -- 담당공무(작업지시자) 자동
  status           TEXT DEFAULT 'draft'
                   CHECK(status IN ('draft','submitted','confirmed')),
  created_by       INTEGER REFERENCES users(id),
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- ═══════════════════════════════════════════════════════════════
-- 2. 외선일보 메인 그리드 행 (전산화번호 단위)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS work_report_lines (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id        INTEGER NOT NULL,
  line_order       INTEGER DEFAULT 0,               -- 행 순서
  -- 구분/위치 정보
  work_div         TEXT DEFAULT '',                  -- 구분: 신설/철거/이설
  mgmt_zone        TEXT DEFAULT '',                  -- 관리구
  mgmt_no          TEXT DEFAULT '',                  -- 관리번호
  line_name        TEXT DEFAULT '',                  -- 간선명
  line_no          TEXT DEFAULT '',                  -- 간선번호
  digital_no       TEXT DEFAULT '',                  -- 전산화번호
  -- 수량 정보
  section_dist     REAL DEFAULT 0,                   -- 구간거리
  pole_count       INTEGER DEFAULT 0,                -- 장주
  ip_pole          TEXT DEFAULT '',                  -- IP주: 신설/철거/없음
  bind_wire        TEXT DEFAULT '',                  -- 바인드: 철거/신설/없음
  hanger           TEXT DEFAULT '',                  -- 행거: 기설/신설/없음
  hardware         TEXT DEFAULT '',                  -- 금구류: 유/무
  cabinet          TEXT DEFAULT '',                  -- 함체
  name_tag         INTEGER DEFAULT 0,                -- 명찰 (0/1)
  warning_sign     INTEGER DEFAULT 0,                -- 주의판 (0/1)
  grounding        TEXT DEFAULT '',                  -- 접지: B/A/없음
  other_work       TEXT DEFAULT '',                  -- 기타공정(CD관 등)
  remark           TEXT DEFAULT '',                  -- 비고/포트번호
  FOREIGN KEY (report_id) REFERENCES work_reports(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════════
-- 3. 광케이블 정보 (report당 최대 5행)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS work_report_cables (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id        INTEGER NOT NULL,
  cable_order      INTEGER DEFAULT 0,
  lot_no           TEXT DEFAULT '',                  -- LOT NO.
  spec             REAL DEFAULT 0,                   -- 규격(C)
  maker            TEXT DEFAULT '',                  -- 제조사
  mfg_year         TEXT DEFAULT '',                  -- 제작년도
  cable_type       TEXT DEFAULT '',                  -- 가공/일반/지중/난연 (A/CDA/CD/F)
  work_div         TEXT DEFAULT '',                  -- 공정구분: 신설/철거/이설
  start_point      TEXT DEFAULT '',                  -- 시작점
  end_point        TEXT DEFAULT '',                  -- 종단점
  usage_m          REAL DEFAULT 0,                   -- 사용량(M)
  cable_kind       TEXT DEFAULT '',                  -- 케이블종류: 가공/일반/지중/난연
  cable_code       TEXT DEFAULT '',                  -- 구분: AOFC/CDAOFC/CDOFC/FOFC
  special_note     TEXT DEFAULT '',                  -- 특이사항
  FOREIGN KEY (report_id) REFERENCES work_reports(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════════
-- 4. 기타공종 마스터 (관리자가 항목 추가/수정 가능)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS other_work_types (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL UNIQUE,             -- 지선신설/전주세움 등
  unit             TEXT DEFAULT '',                  -- M/개소/본/경간
  sort_order       INTEGER DEFAULT 0,
  is_active        INTEGER DEFAULT 1,
  unit_price       INTEGER DEFAULT 0                 -- 단가(원) — 물량통계용
);

-- 기본 기타공종 데이터 시드
INSERT OR IGNORE INTO other_work_types (name, unit, sort_order, unit_price) VALUES
  ('지선신설',       'M',   1, 35000),
  ('전주세움',       '개소', 2, 45000),
  ('가요전선관',     'M',   3, 600),
  ('내관포설',       'M',   4, 400),
  ('완금설치(한전주)','개소', 5, 28000),
  ('단순1',         '본',  6, 15000),
  ('단순1-2',       '경간', 7, 29000),
  ('단순2',         '경간', 8, 80000);

-- ═══════════════════════════════════════════════════════════════
-- 5. 기타공종 입력값 (외선일보 저장 후 팝업에서 입력)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS work_report_other (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id        INTEGER NOT NULL,
  other_type_id    INTEGER NOT NULL,
  quantity         REAL DEFAULT 0,
  FOREIGN KEY (report_id)     REFERENCES work_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (other_type_id) REFERENCES other_work_types(id),
  UNIQUE(report_id, other_type_id)
);

-- ═══════════════════════════════════════════════════════════════
-- 6. 물량통계 단가 설정 (시스템설정에서 관리자 수정 가능)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS volume_unit_prices (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key         TEXT NOT NULL UNIQUE,             -- cable_new / joga_new 등
  item_label       TEXT NOT NULL,                    -- 표시명
  unit_price       INTEGER DEFAULT 0,                -- 단가(원)
  sort_order       INTEGER DEFAULT 0
);

-- 기본 단가 시드
INSERT OR IGNORE INTO volume_unit_prices (item_key, item_label, unit_price, sort_order) VALUES
  ('cable_new',    '광케이블(신설/이설)', 1100, 1),
  ('joga_new',     '조가선(신설)',        400,  2),
  ('connector',    '커넥터취부',          38000,3),
  ('cable_remove', '광케이블(철거/이설)', 300,  4),
  ('joga_remove',  '조가선(철거)',        100,  5),
  ('ip_new',       'IP주(신설)',          120000,6),
  ('ip_remove',    'IP주(철거)',          30000, 7),
  ('ground_b',     '접지(대지B)',         35000, 8),
  ('ground_a',     '접지(연동A)',         6000,  9);

CREATE INDEX IF NOT EXISTS idx_work_reports_task_id  ON work_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_report_lines_report   ON work_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_report_cables_report  ON work_report_cables(report_id);
CREATE INDEX IF NOT EXISTS idx_report_other_report   ON work_report_other(report_id);
