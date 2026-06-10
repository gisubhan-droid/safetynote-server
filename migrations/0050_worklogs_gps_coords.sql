-- work_logs 테이블에 GPS 좌표 컬럼 추가 (2단계: GPS 위치 추적)
-- work_location(TEXT)은 이미 0027에서 추가됨
-- 여기서는 위도/경도 좌표 + 기록 시점 구분 컬럼 추가

ALTER TABLE work_logs ADD COLUMN gps_lat  REAL    DEFAULT NULL; -- 위도
ALTER TABLE work_logs ADD COLUMN gps_lon  REAL    DEFAULT NULL; -- 경도
ALTER TABLE work_logs ADD COLUMN gps_recorded_at DATETIME DEFAULT NULL; -- GPS 기록 시점
