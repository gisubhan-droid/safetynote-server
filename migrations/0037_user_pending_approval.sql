-- 0037: 사용자 가입 승인 대기 기능
-- is_pending: 1=승인대기(자체가입), 0=정상(관리자가 직접 등록 or 승인완료)
-- is_active: 1=활성, 0=정지/비활성

ALTER TABLE users ADD COLUMN is_pending INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN rejection_reason TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN approved_by INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN approved_at DATETIME DEFAULT NULL;
