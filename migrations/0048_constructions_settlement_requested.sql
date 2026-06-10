-- 공사 진행 단계 5단계 확장
-- registered → in_progress → completed → settlement_requested → settled
-- settlement_requested: 정산요청 클릭 후 상태
-- settled: 정산완료 클릭 후 상태 (기존 settled 역할 유지, 단계만 분리)

-- constructions.status CHECK 제약은 D1(SQLite)에서 ALTER로 변경 불가이므로
-- 기존 테이블을 재생성 방식으로 마이그레이션

-- 1) 기존 데이터 임시 보관
CREATE TABLE IF NOT EXISTS _constructions_backup AS SELECT * FROM constructions;

-- 2) 기존 테이블 삭제
DROP TABLE IF EXISTS constructions;

-- 3) 새 테이블 생성 (status 값에 settlement_requested 추가)
CREATE TABLE constructions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  request_no         TEXT UNIQUE NOT NULL,
  work_number        TEXT DEFAULT '',
  work_class         TEXT DEFAULT 'relocation',
  title              TEXT NOT NULL,
  work_order_address TEXT DEFAULT '',
  manager_id         INTEGER REFERENCES users(id),
  manager_name       TEXT DEFAULT '',
  supervisor_name    TEXT DEFAULT '',
  description        TEXT DEFAULT '',
  status             TEXT DEFAULT 'registered'
                     CHECK(status IN ('registered','in_progress','completed','settlement_requested','settled')),
  created_by         INTEGER REFERENCES users(id),
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4) 데이터 복원
INSERT INTO constructions SELECT * FROM _constructions_backup;

-- 5) 임시 테이블 제거
DROP TABLE IF EXISTS _constructions_backup;
