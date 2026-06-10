-- constructions.work_class CHECK 제약 재정의
-- SQLite는 컬럼 수정 불가 → 임시 테이블 방식으로 재생성
-- 공사종류: 지장이설(relocation) / 청약개통(subscription) / 관로(conduit) / 환경공사(environment)

CREATE TABLE constructions_new (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  request_no         TEXT UNIQUE NOT NULL,
  work_number        TEXT NOT NULL DEFAULT '',
  work_class         TEXT NOT NULL DEFAULT 'relocation'
                     CHECK(work_class IN ('relocation','subscription','conduit','environment')),
  title              TEXT NOT NULL,
  work_order_address TEXT DEFAULT '',
  manager_id         INTEGER,
  manager_name       TEXT DEFAULT '',
  supervisor_name    TEXT DEFAULT '',
  description        TEXT DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'registered'
                     CHECK(status IN ('registered','in_progress','completed','settled')),
  created_by         INTEGER,
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO constructions_new
  (id, request_no, work_number, work_class, title, work_order_address,
   manager_id, manager_name, supervisor_name, description,
   status, created_by, created_at, updated_at)
SELECT
  id, request_no, work_number,
  CASE work_class
    WHEN 'cable_install'   THEN 'relocation'
    WHEN 'cable_splice'    THEN 'relocation'
    WHEN 'equipment_other' THEN 'environment'
    WHEN 'conduit'         THEN 'conduit'
    WHEN 'relocation'      THEN 'relocation'
    WHEN 'subscription'    THEN 'subscription'
    WHEN 'environment'     THEN 'environment'
    ELSE 'relocation'
  END,
  title, work_order_address,
  manager_id, manager_name, supervisor_name, description,
  status, created_by, created_at, updated_at
FROM constructions;

DROP TABLE constructions;
ALTER TABLE constructions_new RENAME TO constructions;

CREATE INDEX IF NOT EXISTS idx_constructions_request_no ON constructions(request_no);
CREATE INDEX IF NOT EXISTS idx_constructions_status     ON constructions(status);
