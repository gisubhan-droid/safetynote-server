-- SafetyNOTE NAS 중복 데이터 정리 v2
-- 실행일: 2026-07-04
-- 
-- 현황:
--   work_categories: 19건 (id 9~27) → id 9~17 정본 8건, id 18~27 중복 (불필요, 단 준공/현장실사 포함)
--   work_types:      72건 (id 1~72) → id 1~18 정본, 19~36, 37~54, 55~72 중복 3세트
--   risk_assessment_items: 744건 (work_type_id 1~18 참조 → 정상)
--
-- 전략:
--   1. risk_assessment_items는 work_type_id 1~18을 참조 중 → 건드리지 않음
--   2. work_types id 19~72 삭제 (중복 3세트)
--   3. work_categories id 18~27 삭제 (중복분)
--      단, work_types가 참조하는 category_id는 9~17 이므로 안전하게 삭제 가능

BEGIN TRANSACTION;

-- ① work_types 중복 3세트 삭제 (id 19~72)
DELETE FROM work_types WHERE id >= 19;

-- ② work_categories 중복분 삭제 (id 18~27)
--    id 9~17: 용접절단/기타/관로설비/별도경비/서류작업/선로설비/자재입출고/전송설비/전원설비시설
--    id 18~27: 준공검사/현장실사 등 — work_types(id 1~18)의 category_id 범위(11~19)와 비교
--    work_types에서 사용하는 category_id 목록 확인 후 삭제
DELETE FROM work_categories WHERE id NOT IN (
  SELECT DISTINCT category_id FROM work_types
);

COMMIT;

-- 정리 후 확인
SELECT 'work_categories' as tbl, COUNT(*) as cnt FROM work_categories
UNION ALL SELECT 'work_types', COUNT(*) FROM work_types
UNION ALL SELECT 'risk_assessment_items', COUNT(*) FROM risk_assessment_items;

-- 상세 확인
SELECT id, name FROM work_categories ORDER BY id;
