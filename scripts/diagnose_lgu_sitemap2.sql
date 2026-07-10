-- =============================================================================
-- [진단2] 현장위치 지도 LGU+ 탭별 조회 상태 정밀 진단
-- 실행: sqlite3 /volume1/safetynote/safety.db < diagnose_lgu_sitemap2.sql
-- =============================================================================

-- ① TBM 탭: task_status별 분포 + GPS 보유 여부
SELECT '=== ① TBM 탭: task_status 분포 (LGU+ 대상, GPS보유) ===' AS section;
SELECT
  t.status AS task_status,
  COUNT(*) AS 총건수,
  SUM(CASE WHEN tbm.gps_lat IS NOT NULL AND tbm.gps_lon IS NOT NULL THEN 1 ELSE 0 END) AS GPS보유,
  GROUP_CONCAT(DISTINCT tbm.tbm_date) AS 날짜목록
FROM tbm_records tbm
LEFT JOIN tasks t ON t.id = tbm.task_id
LEFT JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0
GROUP BY t.status
ORDER BY 총건수 DESC;

-- ② TBM 탭: tbm_done 상태 상세 (존재하는지 확인)
SELECT '=== ② TBM 탭: tbm_done 상태 상세 ===' AS section;
SELECT tbm.id, tbm.tbm_date, tbm.gps_lat, tbm.gps_lon, t.status AS task_status, t.title
FROM tbm_records tbm
LEFT JOIN tasks t ON t.id = tbm.task_id
LEFT JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0
  AND t.status = 'tbm_done'
ORDER BY tbm.created_at DESC;

-- ③ 진행 탭: status=working 작업 GPS 확인
SELECT '=== ③ 진행 탭: working 상태 작업 + TBM GPS 보유 ===' AS section;
SELECT
  t.id AS task_id, t.title, t.status, t.work_started_at,
  tbm.gps_lat AS tbm_gps_lat, tbm.gps_lon AS tbm_gps_lon
FROM tasks t
LEFT JOIN constructions c ON c.id = t.construction_id
LEFT JOIN tbm_records tbm ON tbm.task_id = t.id AND tbm.gps_lat IS NOT NULL
WHERE COALESCE(c.is_auto_request_no, -1) = 0
  AND t.status = 'working'
ORDER BY t.updated_at DESC
LIMIT 10;

-- ④ 완료 탭: work_completed/completed 상태 GPS 확인
SELECT '=== ④ 완료 탭: work_completed/completed 상태 작업 ===' AS section;
SELECT
  t.id AS task_id, t.title, t.status, t.work_completed_at,
  tbm.gps_lat AS tbm_gps_lat, tbm.gps_lon AS tbm_gps_lon
FROM tasks t
LEFT JOIN constructions c ON c.id = t.construction_id
LEFT JOIN tbm_records tbm ON tbm.task_id = t.id AND tbm.gps_lat IS NOT NULL
WHERE COALESCE(c.is_auto_request_no, -1) = 0
  AND t.status IN ('work_completed', 'completed')
ORDER BY t.updated_at DESC
LIMIT 10;

-- ⑤ 위험성체크 탭: risk_assessments 전체 + GPS 현황
SELECT '=== ⑤ 위험성체크: risk_assessments GPS 현황 ===' AS section;
SELECT
  COUNT(*) AS 총건수,
  SUM(CASE WHEN ra.gps_lat IS NOT NULL THEN 1 ELSE 0 END) AS RA_GPS보유,
  SUM(CASE WHEN t.gps_lat IS NOT NULL THEN 1 ELSE 0 END) AS TASK_GPS보유,
  SUM(CASE WHEN t.work_order_address IS NOT NULL THEN 1 ELSE 0 END) AS 작업지시주소보유,
  SUM(CASE WHEN t.confirmed_address IS NOT NULL THEN 1 ELSE 0 END) AS 확정주소보유
FROM risk_assessments ra
LEFT JOIN tasks t ON t.id = ra.task_id
LEFT JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0;

-- ⑥ 날짜 기본값 확인: 최근 7일 내 TBM 레코드 존재 여부
SELECT '=== ⑥ 최근 7일 TBM (GPS보유, LGU+ 대상) ===' AS section;
SELECT tbm.id, tbm.tbm_date, tbm.gps_lat, tbm.gps_lon, t.status AS task_status
FROM tbm_records tbm
LEFT JOIN tasks t ON t.id = tbm.task_id
LEFT JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0
  AND tbm.gps_lat IS NOT NULL
  AND date(COALESCE(tbm.tbm_date, tbm.created_at)) >= date('now', '-7 days')
ORDER BY tbm.tbm_date DESC;

-- ⑦ 전체 TBM GPS 보유건 날짜 + task_status 원본 확인
SELECT '=== ⑦ 전체 TBM GPS 보유건 (날짜순) ===' AS section;
SELECT tbm.id, tbm.tbm_date, substr(tbm.created_at,1,10) AS 생성일, 
  tbm.gps_lat, tbm.gps_lon, t.status AS task_status, t.title
FROM tbm_records tbm
LEFT JOIN tasks t ON t.id = tbm.task_id
LEFT JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0
  AND tbm.gps_lat IS NOT NULL
ORDER BY COALESCE(tbm.tbm_date, tbm.created_at) DESC;
