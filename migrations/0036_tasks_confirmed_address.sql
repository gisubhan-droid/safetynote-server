-- 작업 최종 확인 주소: 위험성평가/TBM/작업개시 시점에 GPS/입력된 location으로 자동 갱신
ALTER TABLE tasks ADD COLUMN confirmed_address TEXT DEFAULT '';
-- 최종 주소가 어떤 단계에서 갱신되었는지 추적 (risk / tbm / working)
ALTER TABLE tasks ADD COLUMN confirmed_address_source TEXT DEFAULT '';
-- 최종 주소 갱신 시각
ALTER TABLE tasks ADD COLUMN confirmed_address_at DATETIME;
