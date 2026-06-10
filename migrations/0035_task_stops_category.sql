-- 작업중지 유형 구조 변경
-- 기존 4유형(작업환경/고위험/고객취소/기타) →
-- "위험작업중지" (급박한 위험) + "작업중단" (비위험 중단) 2카테고리로 분리

-- stop_category 컬럼 추가: '위험작업중지' | '작업중단'
ALTER TABLE task_stops ADD COLUMN stop_category TEXT DEFAULT '위험작업중지';

-- stop_detail 컬럼 추가: 세부 사유 (새 구조)
-- 위험작업중지: 구조적위험 | 설비위험 | 화학적위험 | 전기적위험 | 환경적위험 | 붕괴위험 | 기타
-- 작업중단: 고객취소 | 공사환경미비 | 기타
ALTER TABLE task_stops ADD COLUMN stop_detail TEXT;

-- 기존 데이터 마이그레이션: stop_reason → stop_category + stop_detail
UPDATE task_stops SET
  stop_category = CASE
    WHEN stop_reason IN ('작업환경', '고위험') THEN '위험작업중지'
    WHEN stop_reason IN ('고객취소') THEN '작업중단'
    ELSE '위험작업중지'
  END,
  stop_detail = CASE
    WHEN stop_reason = '작업환경' THEN '환경적위험'
    WHEN stop_reason = '고위험'   THEN '구조적위험'
    WHEN stop_reason = '고객취소' THEN '고객취소'
    ELSE '기타'
  END;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_task_stops_category ON task_stops(stop_category);
