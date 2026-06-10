-- users 테이블에 sub_role 컬럼 추가
-- supervisor 역할의 하위 구분: safety(안전관리자) | engineer(공무) | site_rep(현장대리인)
-- 기존 데이터 복원: position 값으로 역추정하여 초기화
ALTER TABLE users ADD COLUMN sub_role TEXT NOT NULL DEFAULT '';

-- 기존 데이터 복원: position 기반으로 sub_role 설정
UPDATE users SET sub_role = 'safety'   WHERE role = 'supervisor' AND position = '안전관리자';
UPDATE users SET sub_role = 'engineer' WHERE role = 'supervisor' AND position = '공무';
UPDATE users SET sub_role = 'site_rep' WHERE role = 'supervisor' AND position = '현장대리인';
-- 위 세 경우 외 supervisor (직위가 부장/과장 등): sub_role이 비어있으면 safety 기본
UPDATE users SET sub_role = 'safety'   WHERE role = 'supervisor' AND sub_role = '';
