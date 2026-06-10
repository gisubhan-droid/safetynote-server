-- 외래키 제약 비활성화 후 구 분류 정리
PRAGMA foreign_keys = OFF;

-- 구 분류에 속한 위험성 평가 항목 삭제 (work_type_id 1~16 중 구 분류 소속)
DELETE FROM risk_assessment_items WHERE work_type_id IN (
  SELECT id FROM work_types WHERE category_id IN (1,2,3,4,5,6,7,8)
);

-- 구 분류 work_types 삭제
DELETE FROM work_types WHERE category_id IN (1,2,3,4,5,6,7,8);

-- 구 카테고리 삭제 (토목,건축,기계,전기,배관,도장,고소,밀폐)
DELETE FROM work_categories WHERE id IN (1,2,3,4,5,6,7,8);

-- 엑셀 기반 카테고리 표시명 정리 (사용자 요청 명칭에 맞춤)
UPDATE work_categories SET name='관로설비' WHERE code='CONDUIT';
UPDATE work_categories SET name='별도경비' WHERE code='EXTRASEC';
UPDATE work_categories SET name='서류작업' WHERE code='DOCWORK';
UPDATE work_categories SET name='선로설비' WHERE code='LINEWORK';
UPDATE work_categories SET name='자재입출고' WHERE code='MATERIAL';
UPDATE work_categories SET name='전송설비' WHERE code='TRANSMIT';
UPDATE work_categories SET name='전원설비시설' WHERE code='POWER';
UPDATE work_categories SET name='준공검사' WHERE code='FINALINSP';
UPDATE work_categories SET name='현장실사' WHERE code='SITEINSP';

-- 자재입출고 work_type명 일치
UPDATE work_types SET name='자재입출고' WHERE code='MAT-INOUT';

PRAGMA foreign_keys = ON;
