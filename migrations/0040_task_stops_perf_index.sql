-- 작업중지현황 페이지 로딩 성능 개선: stopped_at 정렬 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_task_stops_stopped_at ON task_stops(stopped_at DESC);
