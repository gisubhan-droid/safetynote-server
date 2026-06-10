-- 0023: tasks 테이블에 작업위험도(risk_level) 컬럼 추가
-- risk_level: 'high'(고위험) | 'medium'(중위험) | 'normal'(일반)
ALTER TABLE tasks ADD COLUMN risk_level TEXT DEFAULT 'normal';
