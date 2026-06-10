-- risk_assessments.task_id를 nullable로 변경 (정기/수시 독립 평가 지원)
-- SQLite에서는 컬럼 제약 변경을 위해 테이블 재생성 필요

-- 1. 기존 데이터 백업 (새 임시 테이블)
CREATE TABLE IF NOT EXISTS risk_assessments_backup AS SELECT * FROM risk_assessments;

-- 2. 기존 테이블 삭제
DROP TABLE IF EXISTS risk_assessments;

-- 3. 새 테이블 생성 (task_id nullable, assessment_type 포함, location 포함)
CREATE TABLE IF NOT EXISTS risk_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
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
  assessment_type TEXT NOT NULL DEFAULT 'task',
  title TEXT,
  location TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (assessor_id) REFERENCES users(id)
);

-- 4. 백업 데이터 복원
INSERT INTO risk_assessments 
  (id, task_id, assessor_id, assessment_date, weather, temperature, workers_count,
   notes, status, kakao_shared, kakao_shared_at, created_at, assessment_type, title, location)
SELECT 
  id, task_id, assessor_id, assessment_date, weather, temperature, workers_count,
  notes, status, kakao_shared, kakao_shared_at, created_at,
  COALESCE(assessment_type, 'task'),
  title,
  location
FROM risk_assessments_backup;

-- 5. 백업 테이블 삭제
DROP TABLE IF EXISTS risk_assessments_backup;

-- 6. 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_risk_assessments_task ON risk_assessments(task_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_type ON risk_assessments(assessment_type);
