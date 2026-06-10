-- tasks 테이블에 high_subtypes 컬럼 추가
-- 고위험(high) 선택 시 세부 유형을 JSON 배열로 저장
-- 예: '["confined","heavy","fall","electric"]'
ALTER TABLE tasks ADD COLUMN high_subtypes TEXT DEFAULT '[]';
