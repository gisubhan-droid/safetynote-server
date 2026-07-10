-- =============================================================================
-- [FEAT-063] tasks.construction_type 일괄 동기화
-- 대상: construction_type이 비어있거나 구버전('관로')인 작업등록건
--       → 연결된 constructions.work_class 영문키를 한글명으로 변환하여 반영
--
-- 실행 방법 (NAS):
--   sqlite3 /volume1/safetynote/safety.db < sync_construction_type.sql
--
-- ※ 주의: 실행 전 반드시 STEP 1(사전 조회)로 영향 건수를 확인하세요.
-- ※ 주의: BUG-040 — is_auto_request_no(LGU+ 자동생성) 컬럼은 건드리지 않습니다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: 사전 조회 — 영향 건수 및 내용 확인 (READ-ONLY, 안전)
-- -----------------------------------------------------------------------------

-- 1-A) 전체 현황 요약
SELECT
    '전체 tasks 건수'                                           AS 항목,
    COUNT(*)                                                    AS 건수
FROM tasks

UNION ALL

SELECT
    '공사 미연결(construction_id 없음)',
    COUNT(*)
FROM tasks
WHERE construction_id IS NULL OR construction_id = 0

UNION ALL

SELECT
    '이미 정상값 보유(변경 불필요)',
    COUNT(*)
FROM tasks
WHERE construction_type IN ('지장이설','청약개통','관로공사','환경공사','별도사업','기타')
  AND (construction_id IS NOT NULL AND construction_id != 0)

UNION ALL

SELECT
    '업데이트 대상(빈값 또는 구버전)',
    COUNT(*)
FROM tasks
WHERE (construction_type IS NULL OR construction_type = '' OR construction_type = '관로')
  AND (construction_id IS NOT NULL AND construction_id != 0);


-- 1-B) 업데이트 대상 상세 목록 (최대 50건 미리보기)
SELECT
    t.id                    AS task_id,
    t.task_number           AS 작업번호,
    t.construction_type     AS 현재값,
    c.work_class            AS 공사종류_영문,
    CASE c.work_class
        WHEN 'relocation'   THEN '지장이설'
        WHEN 'subscription' THEN '청약개통'
        WHEN 'conduit'      THEN '관로공사'
        WHEN 'environment'  THEN '환경공사'
        WHEN 'separate'     THEN '별도사업'
        WHEN 'other'        THEN '기타'
        ELSE                     c.work_class   -- 알 수 없는 값은 그대로 표시
    END                     AS 변경후값
FROM tasks t
JOIN constructions c ON c.id = t.construction_id
WHERE (t.construction_type IS NULL OR t.construction_type = '' OR t.construction_type = '관로')
  AND (t.construction_id IS NOT NULL AND t.construction_id != 0)
ORDER BY t.id
LIMIT 50;


-- -----------------------------------------------------------------------------
-- STEP 2: 실제 UPDATE — 위 조회 결과 확인 후 실행
-- (아래 주석을 제거하면 실행됩니다)
-- -----------------------------------------------------------------------------

/*

BEGIN TRANSACTION;

-- 2-A) 본 업데이트
UPDATE tasks
SET
    construction_type = (
        SELECT
            CASE c.work_class
                WHEN 'relocation'   THEN '지장이설'
                WHEN 'subscription' THEN '청약개통'
                WHEN 'conduit'      THEN '관로공사'
                WHEN 'environment'  THEN '환경공사'
                WHEN 'separate'     THEN '별도사업'
                WHEN 'other'        THEN '기타'
                ELSE                     c.work_class
            END
        FROM constructions c
        WHERE c.id = tasks.construction_id
    ),
    updated_at = DATETIME('now', 'localtime')
WHERE (construction_type IS NULL OR construction_type = '' OR construction_type = '관로')
  AND construction_id IS NOT NULL
  AND construction_id != 0;

-- 2-B) 업데이트 결과 확인
SELECT
    '업데이트 완료 건수' AS 항목,
    changes()           AS 건수;

-- 2-C) 최종 현황 재확인
SELECT
    construction_type   AS 공사종류,
    COUNT(*)            AS 건수
FROM tasks
WHERE construction_id IS NOT NULL AND construction_id != 0
GROUP BY construction_type
ORDER BY 건수 DESC;

COMMIT;

*/

-- -----------------------------------------------------------------------------
-- STEP 3: 롤백 (문제 발생 시)
-- -----------------------------------------------------------------------------
-- ROLLBACK;  -- COMMIT 전이라면 이 명령으로 되돌릴 수 있습니다.
