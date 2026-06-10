-- 작업일(work_date) 및 작업지시 주소(work_order_address) 필드 추가
-- tasks 테이블에 추가
ALTER TABLE tasks ADD COLUMN work_date TEXT;        -- 실제 작업일 (등록 시 자동 설정, 수정 불가)
ALTER TABLE tasks ADD COLUMN work_order_address TEXT; -- 작업 지시 주소 (등록 시 GPS 자동입력, 수정 불가)

-- 기존 데이터에 work_date 기본값 설정 (created_at 기준)
UPDATE tasks SET work_date = DATE(created_at) WHERE work_date IS NULL;

-- checklist_assessments 테이블에 GPS 주소 필드 추가
ALTER TABLE checklist_assessments ADD COLUMN gps_address TEXT;   -- 체크리스트 작성 위치 주소
ALTER TABLE checklist_assessments ADD COLUMN gps_lat REAL;       -- 위도
ALTER TABLE checklist_assessments ADD COLUMN gps_lon REAL;       -- 경도

-- tbm_records 테이블에 GPS 주소 필드 추가
ALTER TABLE tbm_records ADD COLUMN gps_address TEXT;   -- TBM 실시 위치 주소
ALTER TABLE tbm_records ADD COLUMN gps_lat REAL;       -- 위도
ALTER TABLE tbm_records ADD COLUMN gps_lon REAL;       -- 경도
