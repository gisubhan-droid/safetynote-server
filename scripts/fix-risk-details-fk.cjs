#!/usr/bin/env node
/**
 * fix-risk-details-fk.cjs  v2
 * ─────────────────────────────────────────────────────────────────────────────
 * NAS SSH에서 직접 실행하는 DB 수정 스크립트
 *
 * 문제: risk_assessments 테이블 재생성 과정에서 아래 테이블들의 FK가
 *       'risk_assessments_old'를 참조하는 채로 남아있어
 *       INSERT/DELETE 시 "no such table: main.risk_assessments_old" 500 에러
 *         - risk_assessment_details
 *         - risk_assessment_members
 *
 * 실행:
 *   node /volume1/safetynote/scripts/fix-risk-details-fk.cjs
 *   (DB 경로 자동 탐지: data/safety.db → safety.db 순서)
 *
 *   또는 직접 지정:
 *   node /volume1/safetynote/scripts/fix-risk-details-fk.cjs /volume1/safetynote/data/safety.db
 */

const path = require('path')
const fs   = require('fs')

// ── DB 경로 결정 ──────────────────────────────────────────────────────────────
function findDbPath() {
  // 1) 명령행 인수
  if (process.argv[2] && fs.existsSync(process.argv[2])) return process.argv[2]
  // 2) 환경변수
  if (process.env.DB_PATH && fs.existsSync(process.env.DB_PATH)) return process.env.DB_PATH
  // 3) NAS 실제 경로 우선 탐색
  const candidates = [
    '/volume1/safetynote/data/safety.db',
    '/volume1/safetynote/safety.db',
    path.join(__dirname, '..', 'data', 'safety.db'),
    path.join(__dirname, '..', 'safety.db'),
    './data/safety.db',
    './safety.db',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

const dbPath = findDbPath()
if (!dbPath) {
  console.error('❌ DB 파일을 찾을 수 없습니다.')
  console.error('   사용법: node fix-risk-details-fk.cjs [DB경로]')
  process.exit(1)
}

// ── better-sqlite3 로드 ───────────────────────────────────────────────────────
let Database
const dbDir = path.dirname(dbPath)
const tryPaths = [
  path.join(dbDir, 'node_modules', 'better-sqlite3'),
  path.join(dbDir, '..', 'node_modules', 'better-sqlite3'),
  'better-sqlite3',
]
for (const p of tryPaths) {
  try { Database = require(p); break } catch(_) {}
}
if (!Database) {
  console.error('❌ better-sqlite3 로드 실패')
  process.exit(1)
}

console.log('✅ DB 연결:', dbPath)
const db = new Database(dbPath)

// ── 수정 대상 테이블 정의 ─────────────────────────────────────────────────────
// [테이블명, 새 DDL (FK 교정 버전), 복사할 컬럼 목록]
const TARGETS = [
  {
    name: 'risk_assessment_details',
    getNewDdl: (extraColDefs) => `
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
      )`,
    baseCols: ['id','assessment_id','item_id','category','hazard','risk_factor',
      'before_frequency','before_severity','before_risk_level','control_measures',
      'after_frequency','after_severity','after_risk_level','is_confirmed',
      'final_severity','final_risk_level','is_final','member_measures','final_frequency'],
  },
  {
    name: 'risk_assessment_members',
    getNewDdl: (extraColDefs) => `
      CREATE TABLE risk_assessment_members_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
        user_id       INTEGER NOT NULL REFERENCES users(id),
        role          TEXT    DEFAULT 'member',
        assigned_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        ${extraColDefs ? ',\n' + extraColDefs : ''}
        , UNIQUE(assessment_id, user_id)
      )`,
    baseCols: ['id','assessment_id','user_id','role','assigned_at'],
  },
]

let anyFixed = false

for (const target of TARGETS) {
  const row = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`
  ).get(target.name)

  if (!row) {
    console.log(`ℹ️  ${target.name}: 테이블 없음 — 건너뜀`)
    continue
  }

  const ddl = row.sql || ''
  if (!ddl.includes('risk_assessments_old')) {
    console.log(`✅ ${target.name}: FK 정상 — 수정 불필요`)
    continue
  }

  console.log(`\n⚠️  ${target.name}: risk_assessments_old 참조 감지 → 재생성 시작`)

  // 기존 컬럼 및 데이터 수 확인
  const cols = db.prepare(`PRAGMA table_info(${target.name})`).all()
  const colNames = cols.map(c => c.name)
  const countBefore = db.prepare(`SELECT COUNT(*) as c FROM ${target.name}`).get().c
  console.log(`   컬럼: ${colNames.join(', ')}`)
  console.log(`   데이터: ${countBefore}건`)

  // 추가 컬럼 (baseCols에 없는 것)
  const extraCols = colNames.filter(c => !target.baseCols.includes(c))
  const extraColDefs = extraCols.map(c => `  ${c} TEXT`).join(',\n')

  try {
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec(`DROP TABLE IF EXISTS ${target.name}_new`)
    db.exec(target.getNewDdl(extraColDefs))

    // 공통 컬럼만 복사
    const copyColList = [...target.baseCols.filter(c => colNames.includes(c)), ...extraCols].join(', ')
    db.exec(`INSERT INTO ${target.name}_new (${copyColList}) SELECT ${copyColList} FROM ${target.name}`)

    const countAfter = db.prepare(`SELECT COUNT(*) as c FROM ${target.name}_new`).get().c
    db.exec(`DROP TABLE ${target.name}`)
    db.exec(`ALTER TABLE ${target.name}_new RENAME TO ${target.name}`)

    // 인덱스 재생성
    if (target.name === 'risk_assessment_details') {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_rad_assessment_id ON risk_assessment_details(assessment_id)`)
    }
    if (target.name === 'risk_assessment_members') {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ram_assessment_id ON risk_assessment_members(assessment_id)`)
    }

    db.exec('PRAGMA foreign_keys = ON')

    // 결과 확인
    const newRow = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(target.name)
    const fixed = !newRow.sql.includes('risk_assessments_old')
    console.log(`   복사: ${countBefore}건 → ${countAfter}건`)
    console.log(`   결과: ${fixed ? '✅ FK 수정 완료' : '❌ 아직 _old 참조 존재'}`)
    anyFixed = true

  } catch(e) {
    console.error(`   ❌ 재생성 실패: ${e.message}`)
    try { db.exec('PRAGMA foreign_keys = ON') } catch(_) {}
  }
}

db.close()

if (anyFixed) {
  console.log('\n🎉 수정 완료! 서버를 재시작하세요:')
  console.log('   pm2 restart safetynote')
} else {
  console.log('\n✅ 모든 테이블 FK 정상 — 수정 불필요')
}
