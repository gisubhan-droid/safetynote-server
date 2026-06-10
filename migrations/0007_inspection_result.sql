-- 현장점검: 점검일, 점검결과, 결과사유 컬럼 추가
ALTER TABLE site_inspections ADD COLUMN inspection_date_only TEXT;  -- 점검일 (YYYY-MM-DD)
ALTER TABLE site_inspections ADD COLUMN inspection_result TEXT DEFAULT 'none'; -- 불량/적정/양호/우수/none
ALTER TABLE site_inspections ADD COLUMN result_reason TEXT DEFAULT '';         -- 결과 사유
