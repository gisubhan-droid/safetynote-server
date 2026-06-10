-- ===================================================
-- 체크리스트법 위험성평가 관련 테이블
-- ===================================================

-- 작업 대분류 (선로/장비/관로) - tasks 테이블에 컬럼 추가
ALTER TABLE tasks ADD COLUMN work_class TEXT DEFAULT 'line'
  CHECK(work_class IN ('line','equipment','pipe'));

-- 체크리스트 마스터 테이블 (항목 정의)
CREATE TABLE IF NOT EXISTS checklist_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  work_class  TEXT NOT NULL DEFAULT 'all',  -- 'all','line','equipment','pipe'
  category    TEXT NOT NULL,                -- 건강상태, 공구상태, 보호구, 작업환경, 추락, 충돌, 전도, 감전, 중장비, TBM
  question    TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  note        TEXT,                         -- * 비고(보라색 작은 글자)
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 체크리스트 평가 기록 (헤더)
CREATE TABLE IF NOT EXISTS checklist_assessments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL,
  work_class    TEXT NOT NULL,              -- line / equipment / pipe
  assessor_id   INTEGER NOT NULL,
  assessed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  status        TEXT DEFAULT 'draft'        -- draft / completed
    CHECK(status IN ('draft','completed')),
  kakao_shared  INTEGER DEFAULT 0,
  notes         TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (assessor_id) REFERENCES users(id)
);

-- 체크리스트 평가 상세 (항목별 체크 결과)
CREATE TABLE IF NOT EXISTS checklist_responses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id   INTEGER NOT NULL,
  item_id         INTEGER NOT NULL,
  response        TEXT DEFAULT NULL         -- NULL=미선택, 'na'=비대상, 'ok'=OK, 'nok'=NOK
    CHECK(response IS NULL OR response IN ('na','ok','nok')),
  memo            TEXT,
  FOREIGN KEY (assessment_id) REFERENCES checklist_assessments(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES checklist_items(id),
  UNIQUE(assessment_id, item_id)
);

-- TBM 사진 조치 항목 (체크리스트 → TBM 연동)
CREATE TABLE IF NOT EXISTS tbm_photo_sections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id   INTEGER NOT NULL,
  section_type    TEXT NOT NULL,            -- 'ppe'=보호구, 'bucket'=버켓/스카이, 'heavy'=중장비
  section_name    TEXT NOT NULL,
  is_required     INTEGER DEFAULT 1,
  FOREIGN KEY (assessment_id) REFERENCES checklist_assessments(id) ON DELETE CASCADE
);

-- TBM 사진 조치 상세 사진
CREATE TABLE IF NOT EXISTS tbm_photo_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id      INTEGER NOT NULL,
  label           TEXT NOT NULL,            -- 아웃트리거 확장, 고임목, 안전고리 등
  file_path       TEXT,
  file_name       TEXT,
  mime_type       TEXT,
  uploaded_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES tbm_photo_sections(id) ON DELETE CASCADE
);

-- 정기/수시 위험성평가 테이블 (기존 risk_assessments 와 별도 운영)
CREATE TABLE IF NOT EXISTS periodic_risk_assessments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type            TEXT NOT NULL DEFAULT 'periodic'
    CHECK(type IN ('periodic','special')),  -- periodic=정기, special=수시
  title           TEXT NOT NULL,
  work_type       TEXT,
  location        TEXT,
  assessor_id     INTEGER NOT NULL,
  assessed_date   DATE NOT NULL,
  status          TEXT DEFAULT 'draft'
    CHECK(status IN ('draft','submitted','approved')),
  notes           TEXT,
  kakao_shared    INTEGER DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assessor_id) REFERENCES users(id)
);

-- 정기/수시 위험성평가 상세 항목
CREATE TABLE IF NOT EXISTS periodic_risk_details (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id     INTEGER NOT NULL,
  hazard_category   TEXT NOT NULL,
  hazard_factor     TEXT NOT NULL,
  risk_before       INTEGER DEFAULT 1,
  risk_after        INTEGER DEFAULT 1,
  control_measures  TEXT,
  responsible       TEXT,
  due_date          DATE,
  status            TEXT DEFAULT 'pending'
    CHECK(status IN ('pending','done')),
  FOREIGN KEY (assessment_id) REFERENCES periodic_risk_assessments(id) ON DELETE CASCADE
);

-- ===================================================
-- 체크리스트 항목 데이터 입력 (공통: work_class='all')
-- ===================================================

-- 공통 항목 (선로/장비/관로 모두 적용)
INSERT INTO checklist_items (work_class, category, question, sort_order, note) VALUES
('all','건강상태','작업자는 작업에 투입 전 건강상태를 확인 하였는가?',10,'야간 작업 이후 작업 투입, 음주상태 등'),
('all','공구상태','수동/전동공구는 양호한 상태인가?',20,'전원코드, 손잡이 파손 및 방호구 임의해제 등'),
('all','보호구','안전보호구는 작업현장 도착즉시 착용하여, 작업 종료 시까지 착용상태를 유지하겠습니다.',30,'안전모, 안전화, 안전장갑, 그네식 안전대, 절연보호구 (착용 전 상태확인)'),
('all','보호구','착용한 안전보호구는 안전보건공단의 안전인증(KCS)을 받은 제품입니까?',40,NULL),
('all','작업환경','작업구간 접근통제 및 위험요인 확인, 장애물 제거(이동)를 하였는가?',50,'기상상황, 작업환경, 고압선 등'),
('all','작업환경','버켓차량, 스카이 차량 등 사용 전 작업내용(작업방법, 순서, 변경 등)을 전 근로자가 확인하였는가?',60,NULL),
('all','작업환경','버켓차량, 스카이 차량 등 사용 전 설치 장소의 지반상태(강도, 경사 등)를 확인하였는가?',70,NULL),
('all','작업환경','창문/난간을 밟는 등 정상적이지 않은 출입문으로 작업장소에 이동하는가?',80,NULL),
('all','작업환경','작업장소 이동시 견고하지 않은 고정식 사다리를 이용하는가?',90,NULL),
('all','작업환경','실내작업시 창문, 난간 등 근처 1m이내 추락위험이 있는가?',100,NULL),
('all','작업환경','승주/승탑을 하는 작업인가?',110,NULL),
('all','작업환경','승주를 하는 경우 스텝볼트 등 작업발판이 없는가?',120,NULL),
('all','작업환경','A형사다리 사용시 작업발판의 높이가 1.2m이상 인가?',130,NULL),
('all','작업환경','A형사다리가 필요한 장소에서 설치공간이 좁거나 수평불량 우려가 있는가?',140,NULL),
('all','작업환경','천정 작업 높이가 3.5m 초과인가?',150,NULL),
('all','작업환경','천정 작업 높이가 3.5m 이하인 경우 이동식사다리로 작업 하는가?',160,NULL),
('all','작업환경','천정 작업 높이가 3.5m 초과인 경우 비계 또는 고소작업대를 사용하여 작업 하는가?',170,NULL),
('all','작업환경','천정 작업 높이가 3.5m 초과 작업건에 대해 영상통화를 실시 했는가?',180,'비계설치 or 고소작업대 사용 여부 점검'),
('all','작업환경','작업장소가 고리체결을 할 수 없는 옥상/옥탑 내 인가?',190,NULL),
('all','작업환경','작업장소가 고리체결을 할 수 없는 경사형 지붕 내 인가?',200,NULL),
('all','추락','작업 중 기존 시설물(난간, 사다리 등)에 신체 지지를 금지하였는가?',210,NULL),
('all','추락','버켓차량 스카이 차량 등 상승 전 안전고리를 체결하였는가?',220,NULL),
('all','충돌','버켓차량, 스카이 차량 등 사용 전 작업계획서 작성 및 유도원(신호수)을 배치하였는가?',230,NULL),
('all','전도','버켓차량, 스카이 차량 등 사용 전 아웃트리거 확장 및 받침목 설치를 하였는가?',240,'경사로 작업시 바퀴 고임목 설치'),
('all','감전','활선접근경보기 착용, 검전기를 통한 정전여부 잔류전하를 확인하였는가?',250,'조가선 및 스텝볼트 등 누전 확인'),
('all','중장비','중장비(굴착기) 사용 전 작업내용 확인. 지반상태 확인, 작업계획서 작성, 유도원 배치 등 확실히 하였는가?',260,NULL),
('all','중장비','중장비(덤프트럭) 사용 전 작업내용 확인, 지반상태 확인, 작업계획서 작성, 유도원 배치 등 확실히 하였는가?',270,NULL),
('all','중장비','중장비(탑승형 로울러(Ride-on Roller)) 사용 전 작업내용 확인, 작업계획서 작성, 유도원 배치 등 확실히 하였는가?',280,NULL),
('all','TBM','작업자간 보호구 착용 상태와 컨디션(건강상태)을 서로 확인했나요?',290,NULL),
('all','TBM','작업자간 작업내용 및 작업 중 발생할 수 있는 위험요인(추락, 감전 등)을 서로 확인했나요?',300,NULL),
('all','TBM','신규입사자 또는 타업무 담당자 지원시에는 작업내용과 위험요인을 한번 더 설명해주세요.',310,NULL),
('all','TBM','작업 중 위험요인 발견 시 작업중지권을 사용하세요.',320,NULL);

-- 선로 전용 추가 항목 (공통 항목과 동일하므로 별도 추가 없음 - work_class 필터로 관리)
-- 장비 전용: 중장비 관련 감전 항목 제외 (공통에서 감전 항목 제거 후 장비용 재정의)
-- 관로 전용 추가 항목 (창문/실내/승주 등 항목 제외)
-- ※ 관로 체크리스트는 공통에서 제외 항목 표시
-- 아래는 관로 전용으로 '비대상' 처리할 항목 목록을 코드에서 처리

-- ===================================================
-- 기존 작업 분류 자동 배정
-- (work_class 기본값 'line', category_id 기반 추론)
-- ===================================================

-- 장비 계열 카테고리 (예: 장비, 설비)
UPDATE tasks SET work_class = 'equipment'
 WHERE category_id IN (
   SELECT id FROM work_categories WHERE name LIKE '%장비%' OR name LIKE '%설비%' OR code LIKE '%equip%'
 );

-- 관로 계열 카테고리 (예: 관로, 토목)
UPDATE tasks SET work_class = 'pipe'
 WHERE category_id IN (
   SELECT id FROM work_categories WHERE name LIKE '%관로%' OR name LIKE '%토목%' OR name LIKE '%굴착%' OR code LIKE '%pipe%'
 );

-- 나머지는 기본 'line'(선로)로 유지
