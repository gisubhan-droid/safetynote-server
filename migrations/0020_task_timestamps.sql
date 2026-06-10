-- 작업 타임스탬프 필드 추가
-- checklist_started_at: 체크리스트 최초 제출(평가 시작) 일시
-- work_started_at:      작업 진행 상태로 변경된 일시
-- work_completed_at:    작업 완료 처리 일시

ALTER TABLE tasks ADD COLUMN checklist_started_at TEXT;   -- 체크리스트 시행일시
ALTER TABLE tasks ADD COLUMN work_started_at TEXT;        -- 작업진행일시
ALTER TABLE tasks ADD COLUMN work_completed_at TEXT;      -- 작업완료일시

-- 시스템 설정: 각 폴더명 관리 항목 추가 (없으면 insert)
INSERT OR IGNORE INTO system_settings (key, value, label, description) VALUES
  ('checklist_subdir', '체크리스트', '체크리스트 폴더명', '체크리스트 자료 저장 하위 폴더명'),
  ('tbm_subdir', 'TBM', 'TBM 폴더명', 'TBM 자료 저장 하위 폴더명'),
  ('worklog_subdir', '작업일지', '작업일지 폴더명', '작업일지 자료 저장 하위 폴더명'),
  ('order_doc_subdir', '작업지시서', '작업지시서 폴더명', '작업지시서 파일 저장 하위 폴더명'),
  ('max_upload_size_mb', '20', '최대 업로드 용량(MB)', '단일 파일 최대 업로드 허용 용량(MB)'),
  ('allowed_upload_types', 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.hwp', '허용 파일 형식', '업로드 허용 MIME 타입 (콤마 구분)');
