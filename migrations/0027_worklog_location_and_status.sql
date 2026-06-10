-- work_logs 테이블에 work_location 컬럼 추가 (TBM GPS 주소 자동 기입)
ALTER TABLE work_logs ADD COLUMN work_location TEXT DEFAULT '';

-- tasks 테이블에 work_completed_at 보완 (이미 존재할 수 있으므로 IF NOT EXISTS 우회)
-- tasks 상태 워크플로우:
-- unassigned → assigned → in_progress → tbm_done → working → work_completed → completed
-- work_completed: 작업이 완료됐지만 일지 작성 전 단계
ALTER TABLE tasks ADD COLUMN work_log_required INTEGER DEFAULT 0;
