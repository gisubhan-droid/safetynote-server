-- 사용자 확장 정보 필드 추가
-- 소속(회사명), 혈액형, 긴급연락처, 건강정보, 안전교육 이수 현황

ALTER TABLE users ADD COLUMN company TEXT;             -- 소속(회사명)
ALTER TABLE users ADD COLUMN blood_type TEXT;          -- 혈액형 (A/B/O/AB +/-)
ALTER TABLE users ADD COLUMN emergency_contact TEXT;   -- 긴급연락처 (이름|관계|번호)
ALTER TABLE users ADD COLUMN health_info TEXT;         -- 건강정보 (지병, 복용약 등)

-- 안전교육 이수 현황
ALTER TABLE users ADD COLUMN edu_hire_date TEXT;         -- 채용시교육 수료일
ALTER TABLE users ADD COLUMN edu_special_electric TEXT;  -- 특별안전교육 - 전기작업 수료일
ALTER TABLE users ADD COLUMN edu_special_confined TEXT;  -- 특별안전교육 - 밀폐공간작업 수료일
ALTER TABLE users ADD COLUMN edu_special_loading TEXT;   -- 특별안전교육 - 하역작업 수료일
ALTER TABLE users ADD COLUMN edu_experience_date TEXT;   -- 체험안전교육 수료일
