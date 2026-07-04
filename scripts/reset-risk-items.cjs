#!/usr/bin/env node
/**
 * reset-risk-items.js
 * NAS SSH에서 직접 실행: node scripts/reset-risk-items.js
 * 
 * work_categories / work_types / risk_assessment_items 를
 * reset_risk_master_data.sql 기준으로 완전 교체합니다.
 */

const path = require('path');
const fs   = require('fs');

// better-sqlite3 로드
let Database;
try {
  Database = require('better-sqlite3');
} catch(e) {
  console.error('better-sqlite3 로드 실패:', e.message);
  console.error('node_modules가 없으면: npm install');
  process.exit(1);
}

// DB 경로 결정
const dbPath  = path.join(__dirname, '..', 'safety.db');
const sqlPath = path.join(__dirname, '..', 'reset_risk_master_data.sql');

if (!fs.existsSync(dbPath)) {
  console.error('safety.db 없음:', dbPath);
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error('reset_risk_master_data.sql 없음:', sqlPath);
  console.error('git pull을 먼저 실행하세요.');
  process.exit(1);
}

const db = new Database(dbPath);

// 실행 전 현재 상태
const before = {
  categories: db.prepare('SELECT COUNT(*) as c FROM work_categories').get().c,
  types:      db.prepare('SELECT COUNT(*) as c FROM work_types').get().c,
  items:      db.prepare('SELECT COUNT(*) as c FROM risk_assessment_items').get().c,
};
console.log('=== 실행 전 ===');
console.log('work_categories:', before.categories, '건');
console.log('work_types:     ', before.types,      '건');
console.log('risk_assessment_items:', before.items, '건');

// 현재 work_categories 이름 출력
const catNames = db.prepare('SELECT id, name FROM work_categories ORDER BY id').all();
console.log('\n기존 대분류:', catNames.map(c => c.id+':'+c.name).join(', '));

// SQL 실행
console.log('\n⏳ reset_risk_master_data.sql 실행 중...');
const sql = fs.readFileSync(sqlPath, 'utf-8');
db.exec(sql);

// 실행 후 상태
const after = {
  categories: db.prepare('SELECT COUNT(*) as c FROM work_categories').get().c,
  types:      db.prepare('SELECT COUNT(*) as c FROM work_types').get().c,
  items:      db.prepare('SELECT COUNT(*) as c FROM risk_assessment_items').get().c,
};
console.log('\n=== 실행 후 ===');
console.log('work_categories:', after.categories, '건');
console.log('work_types:     ', after.types,      '건');
console.log('risk_assessment_items:', after.items, '건');

const newCats = db.prepare('SELECT id, name FROM work_categories ORDER BY id').all();
console.log('\n새 대분류:', newCats.map(c => c.id+':'+c.name).join(', '));

// 검증
if (after.categories === 9 && after.types === 18 && after.items === 744) {
  console.log('\n✅ 클린 리셋 성공!');
  console.log('   pm2 restart safetynote 으로 서버를 재시작해 주세요.');
} else {
  console.log('\n⚠️ 결과가 예상과 다릅니다. DB를 확인해 주세요.');
  console.log('   예상: categories=9, types=18, items=744');
}

db.close();
