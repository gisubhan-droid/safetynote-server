-- 위험신고/아차사고 신고 유형 구분 컬럼 추가
-- 실제 테이블명: hazard_reports
ALTER TABLE hazard_reports ADD COLUMN report_type TEXT DEFAULT 'danger';
-- 'danger': 위험신고, 'nearmiss': 아차사고(Near Miss)

ALTER TABLE hazard_reports ADD COLUMN near_miss_cause TEXT;
-- 발생 원인 (유형 + 상세 설명)

ALTER TABLE hazard_reports ADD COLUMN recurrence_prevention TEXT;
-- 재발 방지 제안
