-- =============================================================================
-- [진단] 현장위치 지도 LGU+ 조회 불가 원인 분석
-- 실행: sqlite3 /volume1/safetynote/safety.db < diagnose_lgu_sitemap.sql
-- =============================================================================

-- 1. LGU+ 계정 현황 (role / sub_role 확인)
SELECT '=== 1. LGU+ 계정 현황 ===' AS section;
SELECT id, username, name, role, sub_role, position, is_active
FROM users
WHERE role = 'lgu_plus'
   OR role = 'lgu'
   OR sub_role = 'lgu_plus'
   OR position = 'LGU+'
ORDER BY id;

-- 2. constructions 테이블 is_auto_request_no 분포
SELECT '=== 2. 공사등록 is_auto_request_no 분포 ===' AS section;
SELECT
  is_auto_request_no,
  COUNT(*) AS 건수,
  CASE is_auto_request_no
    WHEN 0 THEN '수동입력(LGU+허용)'
    WHEN 1 THEN '자동부여(LGU+차단)'
    ELSE '기타/NULL'
  END AS 설명
FROM constructions
GROUP BY is_auto_request_no;

-- 3. tasks 중 is_auto_request_no=0 공사에 연결된 건수 (LGU+가 봐야 할 작업)
SELECT '=== 3. LGU+ 대상 작업 건수 ===' AS section;
SELECT COUNT(*) AS lgu_대상_작업수
FROM tasks t
JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0;

-- 4. risk_assessments 중 LGU+ 대상 건수 + GPS 보유 여부
SELECT '=== 4. 위험성체크 LGU+ 대상 + GPS ===' AS section;
SELECT
  COUNT(*) AS 총건수,
  SUM(CASE WHEN COALESCE(c.is_auto_request_no,-1) = 0 THEN 1 ELSE 0 END) AS lgu_대상,
  SUM(CASE WHEN t.gps_lat IS NOT NULL AND t.gps_lon IS NOT NULL
            AND COALESCE(c.is_auto_request_no,-1) = 0 THEN 1 ELSE 0 END) AS lgu_대상_GPS보유
FROM risk_assessments ra
LEFT JOIN tasks t ON t.id = ra.task_id
LEFT JOIN constructions c ON c.id = t.construction_id;

-- 5. tbm_records 중 LGU+ 대상 건수 + GPS 보유 여부
SELECT '=== 5. TBM LGU+ 대상 + GPS ===' AS section;
SELECT
  COUNT(*) AS 총건수,
  SUM(CASE WHEN COALESCE(c.is_auto_request_no,-1) = 0 THEN 1 ELSE 0 END) AS lgu_대상,
  SUM(CASE WHEN tbm.gps_lat IS NOT NULL AND tbm.gps_lon IS NOT NULL
            AND COALESCE(c.is_auto_request_no,-1) = 0 THEN 1 ELSE 0 END) AS lgu_대상_GPS보유
FROM tbm_records tbm
LEFT JOIN tasks t ON t.id = tbm.task_id
LEFT JOIN constructions c ON c.id = t.construction_id;

-- 6. tasks(진행중/완료) LGU+ 대상 + GPS 보유 여부
SELECT '=== 6. 작업(진행중/완료) LGU+ 대상 + GPS ===' AS section;
SELECT
  t.status,
  COUNT(*) AS 건수,
  SUM(CASE WHEN t.gps_lat IS NOT NULL AND t.gps_lon IS NOT NULL THEN 1 ELSE 0 END) AS GPS보유
FROM tasks t
JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0
  AND t.status IN ('working','work_completed','completed')
GROUP BY t.status;

-- 7. system_settings lgu_menu_site_map 값 확인
SELECT '=== 7. lgu_menu_site_map 설정값 ===' AS section;
SELECT key, value FROM system_settings WHERE key LIKE 'lgu_menu%' ORDER BY key;
