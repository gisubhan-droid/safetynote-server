#!/usr/bin/env node
/**
 * fix-risk-details-fk.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * NAS SSH에서 직접 실행하는 DB 수정 스크립트
 * 
 * 문제: risk_assessment_details 테이블의 FK가 'risk_assessments_old'를 참조하고
 *       있어 INSERT/DELETE 시 "no such table: main.risk_assessments_old" 500 에러
 *
 * 실행:
 *   node /volume1/safetynote/scripts/fix-risk-details-fk.cjs
 *   또는
 *   node /volume1/safetynote/scripts/fix-risk-details-fk.cjs /volume1/safetynote/safety.db
 */

const path = require('path')
const fs   = require('fs')

// ── DB 경로 결정 ──────────────────────────────────────────────────────────────
const dbPath = process.argv[2]
  || process.env.DB_PATH
  || '/volume1/safetynote/safety.db'

if (!fs.existsSync(dbPath)) {
  console.error('❌ DB 파일을 찾을 수 없습니다:', dbPath)
  console.error('   사용법: node fix-risk-details-fk.cjs [DB경로]')
  process.exit(1)
}

// ── better-sqlite3 로드 ───────────────────────────────────────────────────────
let Database
try {
  Database = require(path.join(path.dirname(dbPath), 'node_modules', 'better-sqlite3'))
} catch(_) {
  try {
    Database = require('better-sqlite3')
  } catch(e) {
    console.error('❌ better-sqlite3 로드 실패:', e.message)
    process.exit(1)
  }
}

const db = new Database(dbPath)
console.log('✅ DB 연결:', dbPath)

// ── 현재 상태 확인 ────────────────────────────────────────────────────────────
const radRow = db.prepare(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='risk_assessment_details'"
).get()

if (!radRow) {
  console.log('ℹ️  risk_assessment_details 테이블이 없습니다. 수정 불필요.')
  db.close(); process.exit(0)
}

const radSql = radRow.sql || ''
console.log('\n현재 DDL (처음 400자):')
console.log(radSql.substring(0, 400))

if (!radSql.includes('risk_assessments_old')) {
  console.log('\n✅ FK가 이미 정상 상태입니다 (risk_assessments_old 참조 없음). 수정 불필요.')
  db.close(); process.exit(0)
}

console.log('\n⚠️  risk_assessments_old 참조 감지 → 테이블 재생성 시작...')

// ── 컬럼 목록 확인 ────────────────────────────────────────────────────────────
const cols = db.prepare('PRAGMA table_info(risk_assessment_details)').all()
const colNames = cols.map(c => c.name)
console.log('기존 컬럼:', colNames.join(', '))

// ── 기존 데이터 건수 ──────────────────────────────────────────────────────────
const countBefore = db.prepare('SELECT COUNT(*) as c FROM risk_assessment_details').get().c
console.log('기존 데이터:', countBefore, '건')

// ── 재생성 ────────────────────────────────────────────────────────────────────
const BASE_COLS = [
  'id','assessment_id','item_id','category','hazard','risk_factor',
  'before_frequency','before_severity','before_risk_level','control_measures',
  'after_frequency','after_severity','after_risk_level','is_confirmed',
  'final_severity','final_risk_level','is_final','member_measures','final_frequency'
]
const extraCols = colNames.filter(c => !BASE_COLS.includes(c))
const extraColDefs = extraCols.map(c => `  ${c} TEXT`).join(',\n')

try {
  db.exec('PRAGMA foreign_keys = OFF')

  // 기존 _new 테이블 혹시 있으면 제거
  db.exec('DROP TABLE IF EXISTS risk_assessment_details_new')

  db.exec(`
    CREATE TABLE risk_assessment_details_new (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id    INTEGER NOT NULL,
      item_id          INTEGER,
      category         TEXT NOT NULL DEFAULT '',
      hazard           TEXT NOT NULL DEFAULT '',
      risk_factor      TEXT NOT NULL DEFAULT '',
      before_frequency INTEGER,
      before_severity  INTEGER,
      before_risk_level TEXT,
      control_measures TEXT,
      after_frequency  INTEGER,
      after_severity   INTEGER,
      after_risk_level TEXT,
      is_confirmed     INTEGER DEFAULT 0,
      final_severity   INTEGER DEFAULT 1,
      final_risk_level TEXT,
      is_final         INTEGER DEFAULT 0,
      member_measures  TEXT,
      final_frequency  INTEGER DEFAULT 1
      ${extraColDefs ? ',\n' + extraColDefs : ''}
      , FOREIGN KEY (assessment_id) REFERENCES risk_assessments(id)
      , FOREIGN KEY (item_id)       REFERENCES risk_assessment_items(id)
    )
  `)
  console.log('✅ risk_assessment_details_new 생성 완료')

  // 공통 컬럼 복사
  const copyColList = [...BASE_COLS.filter(c => colNames.includes(c)), ...extraCols].join(', ')
  db.exec(`INSERT INTO risk_assessment_details_new (${copyColList}) SELECT ${copyColList} FROM risk_assessment_details`)
  
  const countAfter = db.prepare('SELECT COUNT(*) as c FROM risk_assessment_details_new').get().c
  console.log(`✅ 데이터 복사 완료: ${countBefore}건 → ${countAfter}건`)

  db.exec('DROP TABLE risk_assessment_details')
  db.exec('ALTER TABLE risk_assessment_details_new RENAME TO risk_assessment_details')
  db.exec('CREATE INDEX IF NOT EXISTS idx_rad_assessment_id ON risk_assessment_details(assessment_id)')
  db.exec('PRAGMA foreign_keys = ON')

  // 결과 확인
  const newRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='risk_assessment_details'").get()
  const fixed = !newRow.sql.includes('risk_assessments_old')
  console.log('\n' + (fixed ? '✅ FK 수정 완료!' : '❌ 여전히 risk_assessments_old 참조 존재'))
  console.log('수정 후 DDL (처음 400자):')
  console.log(newRow.sql.substring(0, 400))

} catch(e) {
  console.error('❌ 재생성 실패:', e.message)
  try { db.exec('PRAGMA foreign_keys = ON') } catch(_) {}
  db.close()
  process.exit(1)
}

db.close()
console.log('\n🎉 완료. 서버를 재시작해주세요: pm2 restart safetynote')
