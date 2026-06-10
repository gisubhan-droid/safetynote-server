-- Migration: 0039_user_id_number.sql
-- 목적: users 테이블에 주민번호 앞자리(생년월일 6자리 + 성별코드 1자리) 컬럼 추가
-- 관련법: 개인정보보호법 제23조(민감정보 처리 제한), 제29조(안전성 확보 조치)
-- 비고: id_number는 YYMMDDG 7자리 형식 (예: 9001011 = 1990년 1월 1일 남성)
--       저장 시 암호화 처리 권장 (추후 적용 예정)

ALTER TABLE users ADD COLUMN id_number TEXT;
ALTER TABLE users ADD COLUMN privacy_agreed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN privacy_agreed_at DATETIME;
ALTER TABLE users ADD COLUMN security_agreed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN security_agreed_at DATETIME;
ALTER TABLE users ADD COLUMN location_agreed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN location_agreed_at DATETIME;
