-- 사진 파일 저장 방식 전환: DB base64 → 파일시스템 저장
-- file_data를 nullable로, file_path 컬럼 추가

-- SQLite는 컬럼 NOT NULL 제약 제거가 어려우므로 테이블 재생성
CREATE TABLE IF NOT EXISTS task_photos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL,
  photo_type TEXT DEFAULT 'progress' CHECK(photo_type IN ('before','progress','after','hazard','tbm','completion')),
  file_name TEXT NOT NULL,
  file_path TEXT,           -- 파일시스템 저장 경로 (신규)
  file_data TEXT,           -- base64 (하위호환, 신규는 NULL)
  file_size INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  caption TEXT,
  taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (uploader_id) REFERENCES users(id)
);

INSERT INTO task_photos_new SELECT id, task_id, uploader_id, photo_type, file_name, NULL, file_data, file_size, mime_type, caption, taken_at, created_at FROM task_photos;
DROP TABLE task_photos;
ALTER TABLE task_photos_new RENAME TO task_photos;
CREATE INDEX IF NOT EXISTS idx_task_photos_task ON task_photos(task_id);

-- 점검 사진도 동일하게
CREATE TABLE IF NOT EXISTS inspection_photos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,           -- 파일시스템 저장 경로 (신규)
  file_data TEXT,           -- base64 (하위호환)
  caption TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspection_id) REFERENCES site_inspections(id)
);

INSERT INTO inspection_photos_new SELECT id, inspection_id, file_name, NULL, file_data, caption, created_at FROM inspection_photos;
DROP TABLE inspection_photos;
ALTER TABLE inspection_photos_new RENAME TO inspection_photos;
