-- 위험성평가에 location 필드 추가 (정기/수시 독립 평가 시 위치 정보)
ALTER TABLE risk_assessments ADD COLUMN location TEXT;
