-- ─── 공사 완료예정일 컬럼 추가 ───────────────────────────────────────────────
-- completion_date: 공사 완료 예정일 (DATE 형식 'YYYY-MM-DD')
-- 기존 데이터: created_at 기준 등록일 확정 + completion_date = 등록일 + 7일 일괄 처리

-- 1) completion_date 컬럼 추가 (없을 경우만)
ALTER TABLE constructions ADD COLUMN completion_date DATE DEFAULT NULL;

-- 2) 기존 등록 데이터 중 completion_date 가 NULL인 행 → 등록일+7일로 일괄 업데이트
--    (최초 1회 실행, 이후 NULL이 없으므로 재실행 무해)
UPDATE constructions
   SET completion_date = date(created_at, '+7 days')
 WHERE completion_date IS NULL;
