-- 0053: tasks 테이블에 GPS 컬럼 추가
-- risk.ts / inspections.ts / site map 기능에서 tasks GPS 좌표 활용을 위해 필요
ALTER TABLE tasks ADD COLUMN gps_address TEXT DEFAULT NULL; -- 작업 현장 주소 (GPS 역지오코딩)
ALTER TABLE tasks ADD COLUMN gps_lat     REAL DEFAULT NULL; -- 위도
ALTER TABLE tasks ADD COLUMN gps_lon     REAL DEFAULT NULL; -- 경도
