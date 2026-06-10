-- 위험성평가 구분 컬럼 추가 (정기/수시/작업별)
-- assessment_type: 'periodic'=정기, 'adhoc'=수시, 'task'=작업별(기존)
ALTER TABLE risk_assessments ADD COLUMN assessment_type TEXT NOT NULL DEFAULT 'task';

-- 기존 데이터는 'task'로 설정 (이미 DEFAULT로 처리됨)
-- 독립 평가(task_id 없는)는 periodic 또는 adhoc

-- 위험성평가에 title 필드 추가 (정기/수시 독립 등록 시 제목)
ALTER TABLE risk_assessments ADD COLUMN title TEXT;
