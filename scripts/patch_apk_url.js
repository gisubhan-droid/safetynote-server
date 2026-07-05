/**
 * patch_apk_url.js — APK URL을 GitHub Releases 직접 URL로 패치
 *
 * 사용법 (NAS에서):
 *   node scripts/patch_apk_url.js
 *
 * 역할:
 *   system_settings의 apk_url을 GitHub Releases 직접 다운로드 URL로 업데이트
 *   apk_version도 함께 최신화
 */

const path = require('path');
const fs   = require('fs');

// DB 경로 탐색 (.env 또는 기본 경로)
let dbPath = null;
const envFile = path.join(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  const env = fs.readFileSync(envFile, 'utf8');
  const m = env.match(/DB_PATH\s*=\s*(.+)/);
  if (m) dbPath = m[1].trim().replace(/^['"]|['"]$/g, '');
}
if (!dbPath) dbPath = path.join(process.cwd(), 'data', 'safety.db');

if (!fs.existsSync(dbPath)) {
  console.error('❌ DB 파일 없음:', dbPath);
  process.exit(1);
}

const Database = require('better-sqlite3');
const db = new Database(dbPath);

const APK_VERSION = '1.4.7';
const APK_URL = 'https://github.com/gisubhan-droid/safetynote-android/releases/download/v1.4.7/safetynote-v1.4.7.apk';

// 현재 값 확인
const before = db.prepare("SELECT key, value FROM system_settings WHERE key IN ('apk_url','apk_version')").all();
console.log('\n현재 설정:');
before.forEach(r => console.log(` ${r.key} = ${r.value || '(없음)'}`));

// 업데이트
db.prepare("UPDATE system_settings SET value = ? WHERE key = 'apk_url'").run(APK_URL);
db.prepare("UPDATE system_settings SET value = ? WHERE key = 'apk_version'").run(APK_VERSION);

// 결과 확인
const after = db.prepare("SELECT key, value FROM system_settings WHERE key IN ('apk_url','apk_version')").all();
console.log('\n업데이트 완료:');
after.forEach(r => console.log(` ${r.key} = ${r.value}`));

db.close();
console.log('\n✅ 패치 완료! pm2 restart safetynote 불필요 (DB 직접 수정 — 서버 재시작 없이 즉시 반영)');
console.log('   단, 서버 캐시가 있다면 pm2 restart safetynote 실행 권장');
