-- =============================================================================
-- [진단] LGU+ 사용자 조회 0건 원인 분석
-- 실행: sqlite3 /volume1/safetynote/safety.db < diagnose_lgu_zero.sql
-- =============================================================================

-- ① LGU+ 계정 확인 (role, sub_role 실제값)
SELECT '=== ① LGU+ 계정 목록 ===' AS section;
SELECT id, name, role, sub_role, position, is_active
FROM users
WHERE role IN ('lgu_plus','lgu') OR sub_role='lgu_plus' OR position='LGU+'
ORDER BY id;

-- ② constructions 테이블의 is_auto_request_no 분포
SELECT '=== ② constructions.is_auto_request_no 분포 ===' AS section;
SELECT
  COALESCE(is_auto_request_no, -1) AS is_auto_val,
  COUNT(*) AS 건수,
  CASE COALESCE(is_auto_request_no,-1)
    WHEN 0 THEN '수동입력(LGU+허용)'
    WHEN 1 THEN '자동부여(LGU+차단)'
    ELSE 'NULL→-1(LGU+차단)'
  END AS 의미
FROM constructions
GROUP BY COALESCE(is_auto_request_no, -1);

-- ③ tasks 중 is_auto_request_no=0인 것의 status 분포
SELECT '=== ③ LGU+ 허용 작업(is_auto=0) status 분포 ===' AS section;
SELECT
  t.status,
  COUNT(*) AS 건수
FROM tasks t
LEFT JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0
GROUP BY t.status
ORDER BY 건수 DESC;

-- ④ tasks 중 construction_id=NULL인 것의 status 분포 (공사 미연결)
SELECT '=== ④ 공사 미연결(construction_id=NULL) 작업 status 분포 ===' AS section;
SELECT
  t.status,
  COUNT(*) AS 건수
FROM tasks t
WHERE t.construction_id IS NULL
GROUP BY t.status;

-- ⑤ tasks.is_auto_request_no 컬럼이 tasks 테이블 자체에 있는지 확인
SELECT '=== ⑤ tasks 테이블 컬럼 목록 (is_auto 관련) ===' AS section;
SELECT name, type FROM pragma_table_info('tasks')
WHERE name LIKE '%auto%' OR name LIKE '%request_no%';

-- ⑥ constructions 테이블에 is_auto_request_no 컬럼 존재 여부
SELECT '=== ⑥ constructions 테이블 is_auto_request_no 컬럼 ===' AS section;
SELECT name, type, dflt_value FROM pragma_table_info('constructions')
WHERE name='is_auto_request_no';

-- ⑦ tbm_records: LGU+ 허용 건 + task_status 분포
SELECT '=== ⑦ TBM 기록 중 LGU+ 허용(is_auto=0) task_status 분포 ===' AS section;
SELECT
  t.status AS task_status,
  COUNT(*) AS TBM건수,
  SUM(CASE WHEN tr.gps_lat IS NOT NULL THEN 1 ELSE 0 END) AS GPS보유
FROM tbm_records tr
LEFT JOIN tasks t ON t.id = tr.task_id
LEFT JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0
GROUP BY t.status;

-- ⑧ site_inspections: LGU+ 허용 건 수
SELECT '=== ⑧ 현장점검 LGU+ 허용 건수 ===' AS section;
SELECT
  COUNT(*) AS 총건수,
  SUM(CASE WHEN COALESCE(c.is_auto_request_no,-1)=0 THEN 1 ELSE 0 END) AS LGU허용,
  SUM(CASE WHEN t.gps_lat IS NOT NULL THEN 1 ELSE 0 END) AS GPS보유
FROM site_inspections si
LEFT JOIN tasks t ON t.id = si.task_id
LEFT JOIN constructions c ON c.id = t.construction_id;

-- ⑨ 핵심: tasks.status='in_progress' 이면서 LGU+ 허용인 건
SELECT '=== ⑨ 위험성체크 대상(status=in_progress, LGU+허용) ===' AS section;
SELECT
  t.id, t.title, t.status,
  COALESCE(c.is_auto_request_no,-1) AS is_auto_val,
  t.gps_lat, t.gps_lon
FROM tasks t
LEFT JOIN constructions c ON c.id = t.construction_id
WHERE t.status = 'in_progress'
  AND COALESCE(c.is_auto_request_no, -1) = 0
ORDER BY t.updated_at DESC
LIMIT 10;

-- ⑩ checklist_assessments GPS 보유 현황 (LGU+ 허용 작업)
SELECT '=== ⑩ checklist_assessments GPS 현황 (LGU+허용 작업) ===' AS section;
SELECT
  COUNT(*) AS 총건수,
  SUM(CASE WHEN ca.gps_lat IS NOT NULL THEN 1 ELSE 0 END) AS GPS보유
FROM checklist_assessments ca
LEFT JOIN tasks t ON t.id = ca.task_id
LEFT JOIN constructions c ON c.id = t.construction_id
WHERE COALESCE(c.is_auto_request_no, -1) = 0;

