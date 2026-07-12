-- 시공통보일(notification_date) 컬럼 추가
-- 기존 데이터: created_at(공사등록일) 값으로 1회 일괄 초기화
ALTER TABLE constructions ADD COLUMN notification_date DATE DEFAULT NULL;
UPDATE constructions SET notification_date = date(created_at) WHERE notification_date IS NULL;
