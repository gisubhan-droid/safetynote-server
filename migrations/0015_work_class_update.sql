-- work_class 새 분류 체계로 업데이트
-- SQLite는 CHECK 제약 직접 수정 불가 → 컬럼 재생성 방식 사용

-- 1. 임시 컬럼 추가 (제약 없음)
ALTER TABLE tasks ADD COLUMN work_class_new TEXT DEFAULT 'cable_install';

-- 2. 기존 값 마이그레이션
UPDATE tasks SET work_class_new = CASE
  WHEN work_class = 'line' THEN 'cable_install'
  WHEN work_class = 'equipment' THEN 'equipment_other'
  WHEN work_class = 'pipe' THEN 'conduit'
  WHEN work_class IN ('cable_install','cable_splice','equipment_other','conduit') THEN work_class
  ELSE 'cable_install'
END;

-- checklist_items work_class도 업데이트
UPDATE checklist_items SET work_class = 'cable_install' WHERE work_class = 'line';
UPDATE checklist_items SET work_class = 'equipment_other' WHERE work_class = 'equipment';
UPDATE checklist_items SET work_class = 'conduit' WHERE work_class = 'pipe';

-- checklist_assessments work_class도 업데이트
UPDATE checklist_assessments SET work_class = 'cable_install' WHERE work_class = 'line';
UPDATE checklist_assessments SET work_class = 'equipment_other' WHERE work_class = 'equipment';
UPDATE checklist_assessments SET work_class = 'conduit' WHERE work_class = 'pipe';
