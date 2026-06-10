-- ─── 공사(Construction) 마스터 테이블 ────────────────────────────────────────
-- 공사 1건에 작업 여러 건(1:N) 구조 지원
CREATE TABLE IF NOT EXISTS constructions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 공사요청번호: 숫자 12자리 "############"
  request_no           TEXT UNIQUE NOT NULL,
  -- 작업번호: "WKS-######-#####" 형식
  work_number          TEXT NOT NULL DEFAULT '',
  -- 공사명
  title                TEXT NOT NULL,
  -- 작업지시주소
  work_order_address   TEXT DEFAULT '',
  -- 공사담당자 (users.id)
  manager_id           INTEGER,
  manager_name         TEXT DEFAULT '',
  -- 공사감독자 (LGU+ supervisor 이름 텍스트)
  supervisor_name      TEXT DEFAULT '',
  -- 작업설명
  description          TEXT DEFAULT '',
  -- 공사상태: registered(등록) | in_progress(진행) | completed(완료) | settled(정산)
  status               TEXT NOT NULL DEFAULT 'registered'
                       CHECK(status IN ('registered','in_progress','completed','settled')),
  -- 등록자
  created_by           INTEGER,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (manager_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- tasks 테이블에 construction_id FK 추가 (기존 컬럼 유지, NULL 허용)
ALTER TABLE tasks ADD COLUMN construction_id INTEGER REFERENCES constructions(id);
-- tasks에 하위작업번호 컬럼 추가 (4자리 숫자, ex: "0001")
ALTER TABLE tasks ADD COLUMN sub_task_number TEXT DEFAULT '';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_constructions_request_no ON constructions(request_no);
CREATE INDEX IF NOT EXISTS idx_constructions_status     ON constructions(status);
CREATE INDEX IF NOT EXISTS idx_tasks_construction_id    ON tasks(construction_id);
