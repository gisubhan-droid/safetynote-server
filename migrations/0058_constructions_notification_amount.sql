-- 시공통보 금액(notification_amount) 컬럼 추가
ALTER TABLE constructions ADD COLUMN notification_amount INTEGER DEFAULT NULL;
