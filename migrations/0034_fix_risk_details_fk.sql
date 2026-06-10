-- 0034: risk_assessment_details FK 수정
-- 원인: 0029 마이그레이션에서 risk_assessments 재생성 시
--       risk_assessment_details 의 FK가 "risk_assessments_old" 참조로 남아
--       DELETE risk_assessments 실행 시 "no such table: main.risk_assessments_old" 에러 발생

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS risk_assessment_details_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id    INTEGER NOT NULL,
  item_id          INTEGER,
  category         TEXT NOT NULL,
  hazard           TEXT NOT NULL,
  risk_factor      TEXT NOT NULL,
  before_frequency INTEGER,
  before_severity  INTEGER,
  before_risk_level TEXT,
  control_measures TEXT,
  after_frequency  INTEGER,
  after_severity   INTEGER,
  after_risk_level TEXT,
  is_confirmed     INTEGER DEFAULT 0,
  final_severity   INTEGER DEFAULT 1,
  final_risk_level TEXT,
  is_final         INTEGER DEFAULT 0,
  member_measures  TEXT,
  final_frequency  INTEGER DEFAULT 1,
  FOREIGN KEY (assessment_id) REFERENCES risk_assessments(id),
  FOREIGN KEY (item_id)       REFERENCES risk_assessment_items(id)
);

INSERT INTO risk_assessment_details_new SELECT * FROM risk_assessment_details;
DROP TABLE risk_assessment_details;
ALTER TABLE risk_assessment_details_new RENAME TO risk_assessment_details;
CREATE INDEX IF NOT EXISTS idx_rad_assessment_id ON risk_assessment_details(assessment_id);

PRAGMA foreign_keys = ON;
