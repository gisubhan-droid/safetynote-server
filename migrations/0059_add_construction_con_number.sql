-- [FEAT-175] constructions 테이블에 공사번호(con_number) 컬럼 추가
-- 정산요청/정산완료 시 입력하는 7자리 공사번호 (선택 입력)
-- '번호없음' 문자열도 허용 (나중에 입력 체크박스 ON 시)
ALTER TABLE constructions ADD COLUMN con_number TEXT DEFAULT NULL;
