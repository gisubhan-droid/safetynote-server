-- constructions 테이블에 작업종류(work_class) 컬럼 추가
ALTER TABLE constructions ADD COLUMN work_class TEXT NOT NULL DEFAULT 'cable_install'
  CHECK(work_class IN ('cable_install','cable_splice','equipment_other','conduit'));
