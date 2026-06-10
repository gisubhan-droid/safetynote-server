-- 공사감독자(LGU+) 필드 추가
ALTER TABLE tasks ADD COLUMN lgu_supervisor TEXT DEFAULT '';
