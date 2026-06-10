-- 시스템 설정 테이블
CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  label TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 기본 설정값 삽입
INSERT OR IGNORE INTO system_settings (key, value, label, description) VALUES
  ('upload_root_path',  '',     '파일 저장 루트 경로', 'NAS 또는 로컬 경로. 비워두면 기본 경로(public/uploads) 사용'),
  ('use_task_folder',   'true', '작업별 폴더 구조 사용', '활성화 시 작업명 폴더를 생성하고 하위에 사진/점검 폴더를 분리 저장'),
  ('task_photo_subdir', '작업사진', '작업 사진 하위폴더명', '작업명 폴더 하위에 생성되는 작업사진 폴더명'),
  ('inspection_subdir', '안전점검', '점검 사진 하위폴더명', '작업명 폴더 하위에 생성되는 점검사진 폴더명');
