-- 작업 시작 주소 및 시작 일시 필드 추가
-- 체크리스트 또는 TBM 최초 작성 시 GPS 기반으로 자동 기입
ALTER TABLE tasks ADD COLUMN work_start_address TEXT;   -- 작업 시작 주소 (GPS 자동입력)
ALTER TABLE tasks ADD COLUMN work_start_at TEXT;        -- 작업 시작 일시 (체크리스트/TBM 최초 제출 시각)
