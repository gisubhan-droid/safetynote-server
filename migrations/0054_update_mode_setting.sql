-- 0054: 업데이트 모드 설정 추가 (manual=수동, auto=자동)
-- 기본값: manual (수동 업데이트)
INSERT OR IGNORE INTO system_settings (key, value, label, description, updated_at)
VALUES (
  'update_mode',
  'manual',
  '업데이트 모드',
  'manual: 관리자가 직접 업데이트 / auto: GitHub push 시 자동 업데이트',
  datetime('now')
);
