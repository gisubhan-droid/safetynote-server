-- SafetyNOTE NAS 중복 work_types 정리 + risk_assessment_items 복원
-- 실행일: 2026-07-04
-- 목적: work_types 72건 → 18건으로 정리, risk_assessment_items 744건 복원

BEGIN TRANSACTION;

-- ① 유효하지 않은 work_type_id의 risk_assessment_items 삭제 (중복/잘못된 항목)
DELETE FROM risk_assessment_items WHERE work_type_id NOT IN (17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34);

-- ② 유효하지 않은 work_types 삭제 (id 17~34 외 모두 삭제)
DELETE FROM work_types WHERE id NOT IN (17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34);

-- ③ work_categories 정리 (id 9~17만 유지)
DELETE FROM work_categories WHERE id NOT IN (9,10,11,12,13,14,15,16,17);

COMMIT;

-- 정리 후 확인
SELECT 'work_categories' as tbl, COUNT(*) as cnt FROM work_categories
UNION ALL SELECT 'work_types', COUNT(*) FROM work_types
UNION ALL SELECT 'risk_assessment_items', COUNT(*) FROM risk_assessment_items;
