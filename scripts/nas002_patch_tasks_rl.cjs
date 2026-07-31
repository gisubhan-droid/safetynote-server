'use strict';
/**
 * NAS002 패치: tasks.risk_level CHECK에 urgent 추가 + voted_at 컬럼 추가
 * 실행: /volume1/@appstore/Node.js_v18/usr/local/bin/node /volume1/safetynote/scripts/nas002_patch_tasks_rl.cjs
 */
const Database = require('/volume1/safetynote/node_modules/better-sqlite3');
const db = new Database('/volume1/safetynote/safety.db');
db.pragma('foreign_keys = OFF');

// ── 1. tasks.risk_level CHECK에 urgent 추가 ──────────────────
try {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name='tasks'").get();
  const schema = (row || {}).sql || '';
  const hasUrgent = schema.indexOf("'urgent'") !== -1;

  if (!hasUrgent) {
    console.log('tasks.risk_level CHECK에 urgent 없음 → 재생성 시작');
    const cols = db.prepare('PRAGMA table_info(tasks)').all().map(function(r){ return r.name; }).join(', ');
    console.log('현재 컬럼 수:', db.prepare('PRAGMA table_info(tasks)').all().length);

    // 백업
    db.exec('ALTER TABLE tasks RENAME TO tasks_backup_rl');

    // CHECK 제약 교체: ('low','medium','high') → ('low','medium','high','urgent')
    const newSchema = schema
      .replace('CREATE TABLE tasks', 'CREATE TABLE tasks')
      .replace(
        "CHECK(risk_level IN ('low','medium','high'))",
        "CHECK(risk_level IN ('low','medium','high','urgent'))"
      );

    db.exec(newSchema);
    db.exec('INSERT INTO tasks SELECT * FROM tasks_backup_rl');
    db.exec('DROP TABLE tasks_backup_rl');

    // 인덱스 재생성
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)'); } catch(_) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_supervisor ON tasks(supervisor_id)'); } catch(_) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_planned_date ON tasks(planned_date)'); } catch(_) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_construction_id ON tasks(construction_id)'); } catch(_) {}

    console.log('tasks 재생성 완료 (urgent 추가)');

    // 검증
    const newRow = db.prepare("SELECT sql FROM sqlite_master WHERE name='tasks'").get();
    const ok = newRow.sql.indexOf("'urgent'") !== -1;
    console.log(ok ? 'urgent CHECK 확인 OK' : '경고: urgent 여전히 없음');
  } else {
    console.log('tasks.risk_level 이미 urgent 포함 — 건너뜀');
  }
} catch(e) {
  console.log('tasks 재생성 실패:', e.message);
  try { db.exec('ALTER TABLE tasks_backup_rl RENAME TO tasks'); } catch(_) {}
}

// ── 2. safety_committee_votes.voted_at 추가 ──────────────────
try {
  db.exec('ALTER TABLE safety_committee_votes ADD COLUMN voted_at TEXT');
  console.log('safety_committee_votes.voted_at 추가 완료');
} catch(e) {
  var msg = e.message || '';
  if (msg.indexOf('duplicate column') !== -1) {
    console.log('voted_at 이미 존재 — 건너뜀');
  } else if (msg.indexOf('no such table') !== -1) {
    console.log('safety_committee_votes 테이블 없음 — 무시');
  } else {
    console.log('voted_at 추가 실패:', msg);
  }
}

db.pragma('foreign_keys = ON');
db.close();
console.log('=== 패치 완료 ===');
