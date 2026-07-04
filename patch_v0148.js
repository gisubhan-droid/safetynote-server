#!/usr/bin/env node
/**
 * patch_v0148.js — NAS 긴급 패치 스크립트
 * 
 * work_categories / work_types / risk_assessment_items 테이블 생성
 * (FEAT-045/046 에서 추가, patchSchema에 누락됨)
 * 
 * NAS 실행: node /volume1/safetynote/patch_v0148.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB 경로 탐색 (node-server.ts의 resolveDbPath 로직과 동일)
function resolveDbPath() {
  if (process.env.DB_PATH && fs.existsSync(process.env.DB_PATH)) return process.env.DB_PATH;
  const candidates = [
    '/volume1/safetynote/safety.db',
    path.join(__dirname, 'safety.db'),
    path.join(process.cwd(), 'safety.db'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('safety.db를 찾을 수 없습니다. DB_PATH 환경변수를 설정하세요.');
}

const dbPath = resolveDbPath();
console.log(`[patch_v0148] DB: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

try {
  // 1. work_categories 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('[patch_v0148] ✅ work_categories 테이블 준비 완료');

  // 2. work_types 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name        TEXT    NOT NULL,
      code        TEXT,
      description TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES work_categories(id)
    )
  `);
  console.log('[patch_v0148] ✅ work_types 테이블 준비 완료');

  // 3. risk_assessment_items 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS risk_assessment_items (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      work_type_id      INTEGER NOT NULL,
      category          TEXT    DEFAULT '',
      hazard            TEXT    NOT NULL,
      risk_factor       TEXT    DEFAULT '',
      before_frequency  INTEGER DEFAULT 1,
      before_severity   INTEGER DEFAULT 1,
      before_risk_level TEXT    DEFAULT '낮음',
      control_measures  TEXT    DEFAULT '',
      after_frequency   INTEGER DEFAULT 1,
      after_severity    INTEGER DEFAULT 1,
      after_risk_level  TEXT    DEFAULT '낮음',
      responsible       TEXT    DEFAULT '관리감독자',
      note              TEXT    DEFAULT '',
      is_active         INTEGER DEFAULT 1,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (work_type_id) REFERENCES work_types(id)
    )
  `);
  console.log('[patch_v0148] ✅ risk_assessment_items 테이블 준비 완료');

  // 4. 인덱스
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rai_work_type_id ON risk_assessment_items(work_type_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rai_is_active    ON risk_assessment_items(is_active)`);
  console.log('[patch_v0148] ✅ 인덱스 생성 완료');

  // 5. 현재 상태 확인
  const wc = db.prepare('SELECT COUNT(*) as cnt FROM work_categories').get();
  const wt = db.prepare('SELECT COUNT(*) as cnt FROM work_types').get();
  const ri = db.prepare('SELECT COUNT(*) as cnt FROM risk_assessment_items').get();
  console.log(`[patch_v0148] 📊 현재 데이터: work_categories=${wc.cnt}건, work_types=${wt.cnt}건, risk_assessment_items=${ri.cnt}건`);

  if (wc.cnt === 0) {
    console.log('[patch_v0148] ⚠️  work_categories 데이터가 없습니다.');
    console.log('              복원 SQL: restore_risk_master_data.sql 을 실행하세요.');
    console.log('              명령: sqlite3 safety.db < restore_risk_master_data.sql');
  }

  console.log('\n[patch_v0148] 🎉 패치 완료! pm2 restart safetynote 를 실행하세요.');

} catch (e) {
  console.error('[patch_v0148] ❌ 오류:', e.message);
  process.exit(1);
} finally {
  db.close();
}
