-- 작업번호: 사용자가 직접 입력하는 번호 필드 추가
ALTER TABLE tasks ADD COLUMN work_number TEXT DEFAULT '';
