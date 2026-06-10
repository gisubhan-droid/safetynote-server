-- 작업지시서 첨부파일 테이블
CREATE TABLE IF NOT EXISTS task_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL,
  file_name   TEXT NOT NULL,          -- 원본 파일명
  file_path   TEXT NOT NULL,          -- 서버 저장 경로
  file_size   INTEGER DEFAULT 0,      -- 바이트
  mime_type   TEXT DEFAULT 'application/octet-stream',
  attach_type TEXT DEFAULT 'order',   -- 'order'=작업지시서, 'etc'=기타
  description TEXT DEFAULT '',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id)     REFERENCES tasks(id),
  FOREIGN KEY (uploader_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

-- system_settings: 첨부파일 용량 및 저장 위치 설정 추가
INSERT OR IGNORE INTO system_settings (key, value, label, description) VALUES
  ('attach_max_mb',    '20',   '첨부파일 최대 용량(MB)', '작업지시서 등 첨부파일 1개당 최대 허용 용량 (MB)'),
  ('attach_total_mb',  '200',  '첨부파일 총 용량 한도(MB)', '작업 1건당 첨부파일 총 용량 합계 상한 (MB)'),
  ('attach_subdir',    '작업지시서', '첨부파일 하위폴더명', '작업 폴더 내 첨부파일을 저장하는 하위 폴더명'),
  ('attach_allowed_ext', 'pdf,doc,docx,xls,xlsx,ppt,pptx,hwp,txt,jpg,jpeg,png,gif,webp,heic,mp4,zip', '허용 확장자', '쉼표로 구분. 업로드 가능한 파일 확장자 목록');
