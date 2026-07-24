/**
 * Safety NOTE - Node.js 통합 서버
 * wrangler 없이 순수 Node.js로 실행
 * @hono/node-server + better-sqlite3 + 원본 파일 업로드 지원
 *
 * 실행: npx tsx node-server.ts
 *
 * 환경변수 (.env 또는 시스템 환경변수):
 *   PORT        - 포트 번호 (기본: 3000)
 *   DB_PATH     - SQLite DB 파일 경로
 *   UPLOAD_PATH - 파일 저장 루트 폴더 (기본: ./public/uploads)
 *                 NAS 예시: /mnt/nas/safetynote/uploads
 *                 서브폴더(연도/월)가 자동 생성됩니다.
 *   UPLOAD_SUBDIR - 'true' 이면 연도/월 하위폴더 사용 (기본: true)
 *
 * ============================================================
 * ⚠️  HTTPS / SSL 중요 주의사항 — 절대 수정 금지 구간
 * ============================================================
 *
 * 이 서버는 NAS(운영)와 샌드박스(개발) 환경을 자동으로 구분하여
 * HTTPS / HTTP 서버를 선택적으로 시작합니다.
 *
 *  [NAS 운영 환경]
 *    - loadSynologyCert() 가 Synology DSM 인증서를 자동 탐지
 *    - https.createServer() 로 HTTPS 직접 서빙 (PORT=3443)
 *    - 인증서 경로: /usr/syno/etc/certificate/_archive/<DEFAULT>/
 *    - 앱/브라우저 → https://linkmax.myds.me:3443 → 공유기 포트포워딩 → NAS:3443
 *    - Synology 리버스 프록시 없음 (설정하면 이중 SSL 충돌!)
 *
 *  [샌드박스 / 개발 환경]
 *    - 인증서 경로 없음 → HTTP 자동 폴백 (코드 변경 불필요)
 *    - @hono/node-server serve() 로 HTTP 서빙 (PORT=3000)
 *
 *  ❌ 절대 하지 말 것:
 *    1. loadSynologyCert() 함수 삭제 또는 비활성화
 *    2. https.createServer() 블록을 serve() 로 교체
 *    3. 인증서 경로 하드코딩 (DEFAULT 파일로 동적 탐지해야 함)
 *    4. PORT 3443 변경 (공유기 포트포워딩 고정값)
 *    5. Synology 리버스 프록시 설정 추가
 *
 *  📖 상세 가이드: NAS-HTTPS-SETUP.md
 * ============================================================
 */

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import Database from 'better-sqlite3'
import {
  readFileSync, writeFileSync, unlinkSync,
  mkdirSync, existsSync, readdirSync, statSync, createReadStream
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { spawn, execSync } from 'node:child_process'
import * as https from 'node:https'
import * as http from 'node:http'

// SSE 공유 모듈
import { sseClients, sendToUser, sendToUsers, broadcastAll, broadcastToRoles, getConnectionCount } from './src/sse'

// FCM 푸시 알림 모듈 (Phase 2 — FEAT-025-FCM)
import { sendFcmPush, sendFcmPushMulti } from './src/fcm'

// 라우트 임포트
import authRoutes from './src/routes/auth'
import taskRoutes from './src/routes/tasks'
import userRoutes from './src/routes/users'
import riskRoutes from './src/routes/risk'
import tbmRoutes from './src/routes/tbm'
import statsRoutes from './src/routes/stats'
import inspectionRoutes from './src/routes/inspections'
import hazardRoutes from './src/routes/hazards'
import worklogRoutes from './src/routes/worklogs'
import { checklistRoutes } from './src/routes/checklist'
import teamRoutes from './src/routes/teams'
import educationRoutes from './src/routes/education'
import constructionRoutes from './src/routes/constructions'
import notificationRoutes from './src/routes/notifications'

// NAS 전용 라우트 임포트 (Phase 3 — src/nas-routes/)
import { setRawDb, setDB, makeD1 as nasD1, getUploadRootNow, setSysSettings as nasSetSysSettings } from './src/nas-db'
import adminRoutes, { createAppVersionRoute } from './src/nas-routes/admin'
import distRoutes from './src/nas-routes/dist'
import workReportsRoutes, { createVolumeUnitPricesRoutes } from './src/nas-routes/work-reports'
import spliceReportsRoutes, { createSpliceUnitPricesRoutes } from './src/nas-routes/splice-reports'
import tbmExtraRoutes, { registerTbmTasksRoute, registerTbmDeleteRoute, registerTbmAttendeesRoute } from './src/nas-routes/tbm-extra'
import { registerEducationExtraRoutes } from './src/nas-routes/education-extra'
import { registerEventsRoutes } from './src/nas-routes/events'
import attachmentsNasRoutes from './src/nas-routes/attachments-nas'
import pushRoutes from './src/nas-routes/push'
import signatureRequestsRoutes from './src/nas-routes/signature-requests'
import legalNoticesNasRoutes from './src/nas-routes/legal-notices'
import geocodeRoutes from './src/nas-routes/geocode'
import photosRoutes from './src/routes/photos'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── [FEAT-164] 캐시 버전 자동화 ─────────────────────────────────────
// pm2 restart 시마다 현재 git 커밋 해시 7자리를 자동 취득 → ?v= 하드코딩 불필요
// git 명령 실패(git 미설치 or git 저장소 아닌 환경) 시 폴백값 유지
const CACHE_VER: string = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore','pipe','ignore'] })
      .toString().trim()
  } catch (_) {
    return '20260714a'  // 폴백: git 명령 실패 시 기존 버전 유지
  }
})()
console.log(`[CACHE] 캐시 버전: ?v=${CACHE_VER}`)
// ─── [FEAT-164] 끝 ───────────────────────────────────────────────────

// ─── .env 파일 로드 (dotenv 없이 직접 파싱) ─────────────────────────
function loadEnvFile(): void {
  const envPath = join(__dirname, '.env')
  if (!existsSync(envPath)) return
  try {
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !(key in process.env)) process.env[key] = val  // 시스템 환경변수 우선
    }
    console.log('[ENV] .env 파일 로드 완료:', envPath)
  } catch (e) {
    console.warn('[ENV] .env 파일 로드 실패:', e)
  }
}
loadEnvFile()

const PORT = parseInt(process.env.PORT || '3000')

// ─── DB 경로 결정 ─────────────────────────────────────────────────────
// 우선순위: 1) DB_PATH 환경변수  2) wrangler D1 로컬 sqlite (10KB 이상)  3) safety.db
function resolveDbPath(): string {
  if (process.env.DB_PATH && existsSync(process.env.DB_PATH)) return process.env.DB_PATH

  // wrangler local D1 탐색 — 가장 큰 sqlite 파일 선택 (빈 파일 제외)
  // ※ safety.db보다 D1 sqlite를 우선 사용 (실수로 빈 safety.db가 생성돼도 무시)
  const d1Dir = join(__dirname, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  if (existsSync(d1Dir)) {
    const files = readdirSync(d1Dir)
      .filter(f => f.endsWith('.sqlite') && !f.includes('metadata') && f !== '*.sqlite')
      .map(f => ({ name: f, size: statSync(join(d1Dir, f)).size }))
      .filter(f => f.size > 10240)         // 10KB 이상인 파일만 (실데이터 있는 DB)
      .sort((a, b) => b.size - a.size)     // 가장 큰 파일 우선
    if (files.length > 0) {
      const p = join(d1Dir, files[0].name)
      console.log(`[DB] wrangler local D1 사용: ${p}`)
      return p
    }
  }

  // fallback: safety.db (NAS 환경 등 wrangler D1 없는 경우)
  const localDb = join(__dirname, 'safety.db')
  if (existsSync(localDb)) {
    console.log(`[DB] safety.db 사용: ${localDb}`)
    return localDb
  }

  console.log(`[DB] 새 DB 생성: ${localDb}`)
  return localDb
}

const DB_FILE = resolveDbPath()
console.log(`[DB] ${DB_FILE}`)

// ─── better-sqlite3 D1 호환 어댑터 ───────────────────────────────────
const rawDb = new Database(DB_FILE)
rawDb.pragma('journal_mode = WAL')
rawDb.pragma('foreign_keys = ON')

// ─── SQLite 성능 최적화 pragma (장기 운영 대응) ────────────────────────
// synchronous = NORMAL: WAL 모드에서 안전하고 FULL 대비 2~3x 빠름
rawDb.pragma('synchronous = NORMAL')
// cache_size = -32000: 32MB 메모리 캐시 (기본 2MB → 16x, 음수=KB 단위)
rawDb.pragma('cache_size = -32000')
// temp_store = MEMORY: 정렬/집계 임시 데이터를 디스크 대신 메모리에 저장
rawDb.pragma('temp_store = MEMORY')
// mmap_size = 256MB: 대용량 읽기 시 mmap으로 OS 캐시 활용 (읽기 성능 향상)
rawDb.pragma('mmap_size = 268435456')
// busy_timeout = 5000ms: 잠금 대기 시간 (동시 접근 시 SQLITE_BUSY 방지)
rawDb.pragma('busy_timeout = 5000')
console.log('[DB] pragma 최적화 적용 완료 (WAL+NORMAL+32MB캐시+mmap256MB+busy5s)')

// ─── 자동 스키마 패치 (마이그레이션 누락분 보완) ──────────────────────
;(function autoMigrate() {
  // 테이블별 컬럼 목록 조회 헬퍼
  function getCols(table: string): string[] {
    try {
      const info = rawDb.prepare(`PRAGMA table_info(${table})`).all() as any[]
      return info.map((r: any) => r.name)
    } catch(_) { return [] }
  }

  // ── [긴급복구] tasks 재생성 트랜잭션 중단 잔해 자동 정리 ─────────────────────
  // tasks RENAME → tasks_old 이후 실패 시 tasks 테이블이 사라지고 tasks_old만 남음
  // tasks_new 가 남아있을 경우도 정리
  try {
    const tables: string[] = (rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((r: any) => r.name)
    const hasTasksOld  = tables.includes('tasks_old')
    const hasTasksNew  = tables.includes('tasks_new')
    const hasTasks     = tables.includes('tasks')

    if (hasTasksOld && !hasTasks) {
      // tasks가 없고 tasks_old만 있음 → 트랜잭션 중단 잔해: tasks_old → tasks 복원
      console.warn('[AutoMigrate] ⚠️ tasks 테이블 없음! tasks_old → tasks 로 복원합니다...')
      rawDb.pragma('foreign_keys = OFF')
      if (hasTasksNew) rawDb.exec('DROP TABLE IF EXISTS tasks_new')
      rawDb.exec('ALTER TABLE tasks_old RENAME TO tasks')
      rawDb.pragma('foreign_keys = ON')
      console.log('[AutoMigrate] ✅ tasks 복원 완료 (tasks_old → tasks)')
    } else if (hasTasksOld && hasTasks) {
      // tasks도 있고 tasks_old도 남아있음 → 잔해만 정리
      console.warn('[AutoMigrate] ⚠️ tasks_old 잔해 발견, 정리합니다...')
      rawDb.exec('DROP TABLE IF EXISTS tasks_old')
      console.log('[AutoMigrate] ✅ tasks_old 잔해 제거 완료')
    }
    if (hasTasksNew && hasTasks) {
      // tasks도 있고 tasks_new도 남아있음 → 잔해만 정리
      console.warn('[AutoMigrate] ⚠️ tasks_new 잔해 발견, 정리합니다...')
      rawDb.exec('DROP TABLE IF EXISTS tasks_new')
      console.log('[AutoMigrate] ✅ tasks_new 잔해 제거 완료')
    }
  } catch(e: any) {
    console.warn('[AutoMigrate] tasks 잔해 정리 실패 (무시):', e.message)
    try { rawDb.pragma('foreign_keys = ON') } catch(_) {}
  }

  // ── [영구수정] tasks_old FK 참조 자식 테이블 자동 복구 ─────────────────────────
  // 이전 buggy autoMigrate(tasks RENAME → tasks_old)가 자식 테이블 FK를
  // "tasks_old"(id) 참조로 남겨두는 버그가 있었음.
  // 서버 시작 시마다 감지하여 tasks(id) 참조로 교체.
  //
  // 대상 테이블 11개:
  //   site_inspections, risk_assessments, checklist_assessments,
  //   task_assignments, tbm_records, task_work_types, task_photos,
  //   hazard_reports, task_stops, work_reports, work_logs
  try {
    // tasks_old 참조가 남아있는 테이블 목록 조회
    const badTables: string[] = (rawDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%tasks_old%'`
    ).all() as any[]).map((r: any) => r.name)

    if (badTables.length > 0) {
      console.warn(`[AutoMigrate] ⚠️ tasks_old FK 참조 테이블 발견: ${badTables.join(', ')}`)
      rawDb.pragma('foreign_keys = OFF')

      // 각 테이블의 CREATE SQL에서 "tasks_old" → tasks 로 교체 후 재생성
      const fixFkTx = rawDb.transaction(() => {
        for (const tbl of badTables) {
          try {
            const row: any = rawDb.prepare(
              `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`
            ).get(tbl)
            if (!row?.sql) continue

            // "tasks_old" 참조를 tasks 로 교체
            const newSql = row.sql
              .replace(new RegExp(`REFERENCES\\s+"tasks_old"`, 'gi'), 'REFERENCES tasks')
              .replace(new RegExp(`"tasks_old"\\s*\\(`, 'gi'), 'tasks(')
              .replace(new RegExp(`CREATE TABLE "${tbl}"`, 'i'), `CREATE TABLE ${tbl}_fixed`)
              .replace(new RegExp(`CREATE TABLE ${tbl}\\b`, 'i'), `CREATE TABLE ${tbl}_fixed`)

            // 기존 컬럼 목록 (INSERT SELECT 용)
            const cols = (rawDb.prepare(`PRAGMA table_info(${tbl})`).all() as any[])
              .map((c: any) => c.name).join(', ')

            rawDb.exec(`ALTER TABLE ${tbl} RENAME TO ${tbl}_fk_old`)
            rawDb.exec(newSql)
            rawDb.exec(`INSERT INTO ${tbl}_fixed (${cols}) SELECT ${cols} FROM ${tbl}_fk_old`)
            rawDb.exec(`DROP TABLE ${tbl}_fk_old`)
            rawDb.exec(`ALTER TABLE ${tbl}_fixed RENAME TO ${tbl}`)
            console.log(`[AutoMigrate] ✅ FK 복구 완료: ${tbl} (tasks_old → tasks)`)
          } catch(tblErr: any) {
            console.warn(`[AutoMigrate] FK 복구 실패 (${tbl}):`, tblErr.message)
          }
        }
      })
      fixFkTx()
      rawDb.pragma('foreign_keys = ON')
      console.log('[AutoMigrate] ✅ tasks_old FK 참조 전체 복구 완료')
    } else {
      console.log('[AutoMigrate] tasks_old FK 참조 없음 (정상)')
    }
  } catch(e: any) {
    console.warn('[AutoMigrate] tasks_old FK 복구 실패 (무시):', e.message)
    try { rawDb.pragma('foreign_keys = ON') } catch(_) {}
  }

  const taskCols = getCols('tasks')
  const tbmCols  = getCols('tbm_records')
  console.log('[AutoMigrate] tasks cols:', taskCols.join(', '))
  console.log('[AutoMigrate] tbm_records cols:', tbmCols.join(', '))

  const patches: { table: string; column: string; def: string }[] = [
    // ── tasks GPS 컬럼
    { table: 'tasks', column: 'gps_address',              def: 'TEXT     DEFAULT NULL' },
    { table: 'tasks', column: 'gps_lat',                  def: 'REAL     DEFAULT NULL' },
    { table: 'tasks', column: 'gps_lon',                  def: 'REAL     DEFAULT NULL' },
    // ── tasks 주소/공사 컬럼
    { table: 'tasks', column: 'confirmed_address',         def: "TEXT     DEFAULT ''"   },
    { table: 'tasks', column: 'confirmed_address_source',  def: "TEXT     DEFAULT ''"   },
    { table: 'tasks', column: 'confirmed_address_at',      def: 'DATETIME DEFAULT NULL'  },
    { table: 'tasks', column: 'work_order_address',        def: 'TEXT     DEFAULT NULL'  },
    { table: 'tasks', column: 'construction_id',           def: 'INTEGER  DEFAULT NULL'  },
    // ── tasks 기타
    { table: 'tasks', column: 'high_subtypes',             def: "TEXT     DEFAULT '[]'"  },
    { table: 'tasks', column: 'sub_task_number',           def: "TEXT     DEFAULT ''"    },
    { table: 'tasks', column: 'contractor_name',           def: "TEXT     DEFAULT ''"    },
    { table: 'tasks', column: 'work_log_required',         def: 'INTEGER  DEFAULT 0'     },
    // ── tbm_records GPS 컬럼
    { table: 'tbm_records', column: 'gps_address', def: 'TEXT DEFAULT NULL' },
    { table: 'tbm_records', column: 'gps_lat',     def: 'REAL DEFAULT NULL' },
    { table: 'tbm_records', column: 'gps_lon',     def: 'REAL DEFAULT NULL' },
    // ── work_logs GPS 컬럼 (0050 미적용 대비)
    { table: 'work_logs', column: 'gps_lat',         def: 'REAL     DEFAULT NULL' },
    { table: 'work_logs', column: 'gps_lon',         def: 'REAL     DEFAULT NULL' },
    { table: 'work_logs', column: 'gps_recorded_at', def: 'DATETIME DEFAULT NULL' },
    // ── work_logs 기타 (0027 미적용 대비)
    { table: 'work_logs', column: 'work_location',   def: "TEXT     DEFAULT ''"   },
    { table: 'work_logs', column: 'tomorrow_plan',   def: "TEXT     DEFAULT ''"   },
    // ── task_stops 컬럼 (0033/0035 미적용 대비)
    { table: 'task_stops', column: 'stop_category',  def: "TEXT DEFAULT '위험작업중지'" },
    { table: 'task_stops', column: 'stop_detail',    def: 'TEXT DEFAULT NULL' },
    { table: 'task_stops', column: 'reported_by',    def: 'INTEGER DEFAULT NULL' },
    { table: 'task_stops', column: 'photo_data',     def: 'TEXT DEFAULT NULL' },
    { table: 'task_stops', column: 'notes',          def: 'TEXT DEFAULT NULL' },  // FIX-050: NAS 구버전 task_stops에 notes 컬럼 누락
  ]

  // ── task_stops 테이블 없으면 자동 생성 (0033 migration 미적용 대비) ──────────
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS task_stops (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id       INTEGER NOT NULL,
        reported_by   INTEGER DEFAULT NULL,
        stop_reason   TEXT    NOT NULL DEFAULT '',
        stop_category TEXT    DEFAULT '위험작업중지',
        stop_detail   TEXT    DEFAULT NULL,
        notes         TEXT,
        photo_data    TEXT,
        stopped_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_task_stops_task_id   ON task_stops(task_id)`)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_task_stops_stopped_at ON task_stops(stopped_at DESC)`)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_task_stops_category   ON task_stops(stop_category)`)
    console.log('[AutoMigrate] task_stops 테이블 준비 완료')
  } catch(e: any) {
    if (!e.message?.includes('already exists')) console.warn('[AutoMigrate] task_stops 생성 실패:', e.message)
  }

  // ── task_types 테이블 자동 생성 (buggy 커밋에서 FOREIGN KEY 삽입된 경우 대비) ──
  // tasks 테이블에 task_type_id REFERENCES task_types(id) FK가 있을 수 있음
  // task_types 테이블이 없으면 foreign_keys=ON 상태에서 INSERT 시 500 에러 발생
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS task_types (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL DEFAULT '',
        code       TEXT    DEFAULT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('[AutoMigrate] task_types 테이블 준비 완료')
  } catch(e: any) {
    if (!e.message?.includes('already exists')) console.warn('[AutoMigrate] task_types 생성 실패:', e.message)
  }

  // ── work_logs CHECK 제약 완화 (status 'work_completed' 허용) ─────────────────
  // 기존: CHECK(status IN ('working','completed','paused'))
  // → 앱이 'work_completed' 전송 시 CHECK 실패 → 테이블 재생성으로 제약 제거
  try {
    const wlSql: any = rawDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='work_logs'").get()
    if (wlSql?.sql && wlSql.sql.includes("CHECK(status IN")) {
      console.log('[AutoMigrate] work_logs CHECK 제약 제거 중...')
      rawDb.pragma('foreign_keys = OFF')
      const fixWL = rawDb.transaction(() => {
        // 기존 컬럼 목록 동적 조회
        const existingCols: any[] = rawDb.prepare("PRAGMA table_info(work_logs)").all()
        const colNames = existingCols.map((c: any) => c.name).join(', ')
        rawDb.exec('ALTER TABLE work_logs RENAME TO work_logs_old')
        rawDb.exec(`
          CREATE TABLE work_logs (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id          INTEGER NOT NULL,
            worker_id        INTEGER NOT NULL,
            log_date         DATE NOT NULL,
            start_time       TIME,
            end_time         TIME,
            actual_quantity  REAL DEFAULT 0,
            quantity_unit    TEXT DEFAULT '개',
            work_description TEXT,
            issues           TEXT,
            tomorrow_plan    TEXT DEFAULT '',
            status           TEXT DEFAULT 'working',
            work_location    TEXT DEFAULT '',
            gps_lat          REAL DEFAULT NULL,
            gps_lon          REAL DEFAULT NULL,
            gps_recorded_at  DATETIME DEFAULT NULL,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id)   REFERENCES tasks(id),
            FOREIGN KEY (worker_id) REFERENCES users(id)
          )
        `)
        // 기존 컬럼 중 새 테이블에도 있는 것만 복사
        const newCols = ['id','task_id','worker_id','log_date','start_time','end_time',
          'actual_quantity','quantity_unit','work_description','issues','tomorrow_plan',
          'status','work_location','gps_lat','gps_lon','gps_recorded_at','created_at','updated_at']
        const copyColNames = existingCols.map((c: any) => c.name).filter((n: string) => newCols.includes(n)).join(', ')
        rawDb.exec(`INSERT INTO work_logs (${copyColNames}) SELECT ${copyColNames} FROM work_logs_old`)
        rawDb.exec('DROP TABLE work_logs_old')
        rawDb.exec('CREATE INDEX IF NOT EXISTS idx_work_logs_task   ON work_logs(task_id)')
        rawDb.exec('CREATE INDEX IF NOT EXISTS idx_work_logs_worker ON work_logs(worker_id)')
        rawDb.exec('CREATE INDEX IF NOT EXISTS idx_work_logs_date   ON work_logs(log_date)')
      })
      fixWL()
      rawDb.pragma('foreign_keys = ON')
      console.log('[AutoMigrate] ✅ work_logs CHECK 제약 제거 완료')
    } else {
      console.log('[AutoMigrate] work_logs CHECK 제약 이미 제거됨 (skip)')
    }
  } catch(e: any) {
    console.warn('[AutoMigrate] work_logs CHECK 제약 제거 실패 (무시):', e.message)
    try { rawDb.pragma('foreign_keys = ON') } catch(_) {}
  }

  // ── tasks CHECK 제약 완화 ('paused' 추가) ─────────────────────────────────────
  // 기존: CHECK(status IN ('unassigned','assigned','in_progress','tbm_done','working','completed','cancelled'))
  // → 작업중지(paused) 처리 시 CHECK 실패
  // ★ 핵심: 기존 테이블의 컬럼을 PRAGMA로 동적 조회 → 그대로 복사 (컬럼 누락 방지)
  try {
    const tSql: any = rawDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get()
    const needsFix = tSql?.sql && tSql.sql.includes("CHECK(status IN") && !tSql.sql.includes("'paused'")
    if (needsFix) {
      console.log('[AutoMigrate] tasks CHECK 제약 제거 중 (paused 미포함)...')
      rawDb.pragma('foreign_keys = OFF')
      const fixTasks = rawDb.transaction(() => {
        // ① 기존 컬럼 전체 조회
        const existingCols: any[] = rawDb.prepare("PRAGMA table_info(tasks)").all()
        const allColNames = existingCols.map((c: any) => c.name).join(', ')

        // ② 기존 CREATE SQL에서 CHECK(status IN ...) 구문만 제거
        //    (컬럼 정의는 그대로 유지 → 컬럼 누락 없음)
        const oldSql: string = tSql.sql
        // status 컬럼의 CHECK 제약만 제거 (다른 CHECK는 유지)
        // + task_type_id FOREIGN KEY → task_types 미존재 시 FK 오류 방지용 제거
        const newSql = oldSql
          .replace(/CREATE TABLE tasks/i, 'CREATE TABLE tasks_new')
          .replace(/\bstatus\s+TEXT[^,\n]*CHECK\s*\(status\s+IN\s*\([^)]+\)\)[^,\n]*/gi,
            "status TEXT NOT NULL DEFAULT 'unassigned'")
          .replace(/,?\s*FOREIGN KEY\s*\(task_type_id\)[^\n,)]*(\n|,)?/gi, '$1')

        rawDb.exec('ALTER TABLE tasks RENAME TO tasks_old')
        rawDb.exec(newSql)
        rawDb.exec(`INSERT INTO tasks_new (${allColNames}) SELECT ${allColNames} FROM tasks_old`)
        rawDb.exec('DROP TABLE tasks_old')
        rawDb.exec('ALTER TABLE tasks_new RENAME TO tasks')
        // 인덱스 재생성
        rawDb.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status)')
        rawDb.exec('CREATE INDEX IF NOT EXISTS idx_tasks_planned_date ON tasks(planned_date)')
        try { rawDb.exec('CREATE INDEX IF NOT EXISTS idx_tasks_construction ON tasks(construction_id)') } catch(_) {}
        try { rawDb.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to  ON tasks(assigned_to)') } catch(_) {}
      })
      fixTasks()
      rawDb.pragma('foreign_keys = ON')
      console.log('[AutoMigrate] ✅ tasks CHECK 제약 제거 완료 (paused 허용, 전체 컬럼 보존)')
    } else {
      console.log('[AutoMigrate] tasks CHECK 제약 이미 제거됨 또는 paused 포함 (skip)')
    }
  } catch(e: any) {
    console.warn('[AutoMigrate] tasks CHECK 제약 제거 실패 (무시):', e.message)
    try { rawDb.pragma('foreign_keys = ON') } catch(_) {}
  }

  // ── [긴급복구] tasks 필수 컬럼 누락 시 자동 추가 ──────────────────────────────
  // 이전 버전 autoMigrate 버그로 컬럼이 유실된 경우를 대비한 안전망
  const taskColsNow = getCols('tasks')
  const taskEssentialPatches: { column: string; def: string }[] = [
    { column: 'task_number',         def: "TEXT DEFAULT ''" },
    { column: 'category_id',         def: 'INTEGER DEFAULT NULL' },
    { column: 'work_type_id',        def: 'INTEGER DEFAULT NULL' },
    { column: 'planned_date',        def: 'DATE DEFAULT NULL' },
    { column: 'planned_quantity',    def: 'REAL DEFAULT 0' },
    { column: 'supervisor_id',       def: 'INTEGER DEFAULT NULL' },
    { column: 'risk_level',          def: "TEXT DEFAULT 'normal'" },
    { column: 'construction_id',     def: 'INTEGER DEFAULT NULL' },
    { column: 'construction_type',   def: "TEXT DEFAULT ''" },
    { column: 'work_class',          def: "TEXT DEFAULT 'line'" },
    { column: 'work_class_new',      def: "TEXT DEFAULT 'cable_install'" },
    { column: 'work_date',           def: 'TEXT DEFAULT NULL' },
    { column: 'work_number',         def: "TEXT DEFAULT ''" },
    { column: 'work_order_address',  def: 'TEXT DEFAULT NULL' },
    { column: 'work_start_address',  def: 'TEXT DEFAULT NULL' },
    { column: 'work_start_at',       def: 'TEXT DEFAULT NULL' },
    { column: 'work_started_at',     def: 'TEXT DEFAULT NULL' },
    { column: 'work_completed_at',   def: 'TEXT DEFAULT NULL' },
    { column: 'work_log_required',   def: 'INTEGER DEFAULT 0' },
    { column: 'contractor_name',     def: "TEXT DEFAULT ''" },
    { column: 'lgu_supervisor',      def: "TEXT DEFAULT ''" },
    { column: 'request_no',          def: "TEXT DEFAULT ''" },
    { column: 'sub_task_number',     def: "TEXT DEFAULT ''" },
    { column: 'high_subtypes',       def: "TEXT DEFAULT '[]'" },
    { column: 'checklist_started_at',def: 'TEXT DEFAULT NULL' },
    { column: 'tbm_done_at',         def: 'DATETIME DEFAULT NULL' },
    { column: 'gps_lat',             def: 'REAL DEFAULT NULL' },
    { column: 'gps_lon',             def: 'REAL DEFAULT NULL' },
    { column: 'gps_address',         def: 'TEXT DEFAULT NULL' },
    { column: 'confirmed_address',       def: "TEXT DEFAULT ''" },
    { column: 'confirmed_address_source',def: "TEXT DEFAULT ''" },
    { column: 'confirmed_address_at',    def: 'DATETIME DEFAULT NULL' },
  ]
  for (const ep of taskEssentialPatches) {
    if (!taskColsNow.includes(ep.column)) {
      try {
        rawDb.exec(`ALTER TABLE tasks ADD COLUMN ${ep.column} ${ep.def}`)
        console.log(`[AutoMigrate] ✅ 복구: tasks.${ep.column} 추가`)
      } catch(e: any) {
        if (!e.message?.includes('duplicate column')) {
          console.warn(`[AutoMigrate] tasks.${ep.column} 추가 실패:`, e.message)
        }
      }
    }
  }

  const colCache: Record<string, string[]> = { tasks: taskCols, tbm_records: tbmCols }

  for (const p of patches) {
    const cols = colCache[p.table] ?? getCols(p.table)
    colCache[p.table] = cols
    if (cols.includes(p.column)) continue
    try {
      rawDb.exec(`ALTER TABLE ${p.table} ADD COLUMN ${p.column} ${p.def}`)
      console.log(`[AutoMigrate] ✅ Added ${p.table}.${p.column}`)
      colCache[p.table] = getCols(p.table) // 갱신
    } catch(e: any) {
      console.error(`[AutoMigrate] ❌ Failed ${p.table}.${p.column}: ${e.message}`)
    }
  }
  // FEAT-037: TBM 공유 토큰 테이블 (tbm_share_tokens)
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS tbm_share_tokens (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        token       TEXT UNIQUE NOT NULL,
        tbm_id      INTEGER NOT NULL,
        task_id     INTEGER,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at  DATETIME,
        view_count  INTEGER DEFAULT 0
      )
    `)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_tbm_share_tokens_token  ON tbm_share_tokens(token)`)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_tbm_share_tokens_tbm_id ON tbm_share_tokens(tbm_id)`)
    console.log('[AutoMigrate] ✅ tbm_share_tokens 테이블 준비')
  } catch(e: any) {
    console.warn('[AutoMigrate] tbm_share_tokens:', e.message)
  }

  console.log('[AutoMigrate] 완료')
})()

function makeD1(db: Database.Database) {
  function makeStmt(query: string, params: any[] = []) {
    return {
      _query: query,
      _params: params,
      bind(...newParams: any[]) {
        return makeStmt(query, newParams)
      },
      async first(col?: string) {
        try {
          const stmt = db.prepare(query)
          const row: any = stmt.get(...params)
          if (col !== undefined) return row ? row[col] : null
          return row || null
        } catch(e: any) { throw new Error(`D1_ERROR: ${e.message}`) }
      },
      async all() {
        try {
          const results = db.prepare(query).all(...params) as any[]
          return { results: results || [], success: true, meta: { duration: 0 } }
        } catch(e: any) { throw new Error(`D1_ERROR: ${e.message}`) }
      },
      async run() {
        try {
          const info = db.prepare(query).run(...params)
          // BigInt → Number 변환: JSON 직렬화 및 bind 인자 호환성 보장
          return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes, duration: 0 } }
        } catch(e: any) { throw new Error(`D1_ERROR: ${e.message}`) }
      }
    }
  }
  return {
    prepare(query: string) { return makeStmt(query) },
    async exec(query: string) { db.exec(query); return { success: true } },
    // ── batch(): D1 호환 메서드 — 트랜잭션으로 일괄 실행 ──────────────────
    // tasks.ts 등에서 c.env.DB.batch([stmt1, stmt2, ...]) 형태로 호출
    // NAS makeD1 래퍼에 없으면 notifications 알림 저장이 조용히 실패함
    async batch(stmts: any[]) {
      const tx = db.transaction((items: any[]) => {
        const results: any[] = []
        for (const s of items) {
          try {
            const info = db.prepare(s._query).run(...(s._params || []))
            results.push({ success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } })
          } catch(e: any) {
            results.push({ success: false, error: e.message })
          }
        }
        return results
      })
      try {
        const results = tx(stmts)
        return results
      } catch(e: any) {
        throw new Error(`D1_BATCH_ERROR: ${e.message}`)
      }
    }
  }
}

const DB = makeD1(rawDb)

// ─── nas-db singleton 초기화 (nas-routes/*.ts 에서 getRawDb()/getDB() 사용) ──
setRawDb(rawDb)
setDB(DB as any)

// ─── 업로드 디렉토리 ──────────────────────────────────────────────────
// 환경변수 UPLOAD_PATH 로 NAS/외부 폴더 지정 가능
// 예) UPLOAD_PATH=/mnt/nas/safetynote/uploads
const UPLOAD_ROOT = process.env.UPLOAD_PATH
  ? process.env.UPLOAD_PATH.replace(/\/+$/, '')          // 끝 슬래시 제거
  : join(__dirname, 'public', 'uploads')

// 연도/월 하위폴더 사용 여부 (기본 true)
const USE_SUBDIR = (process.env.UPLOAD_SUBDIR ?? 'true') !== 'false'

// 루트 폴더 생성 보장
mkdirSync(UPLOAD_ROOT, { recursive: true })

// ─── 시스템 설정 캐시 (DB 준비 후 로드) ─────────────────────────────
// DB가 초기화된 뒤 loadSystemSettings()로 채워짐
let sysSettings: Record<string, string> = {
  upload_root_path: '',
  attach_max_mb:    '20',
  attach_total_mb:  '200',
  attach_allowed_ext: 'pdf,doc,docx,xls,xlsx,ppt,pptx,hwp,txt,jpg,jpeg,png,gif,webp,heic,mp4,zip',
}

function getSetting(key: string): string {
  return sysSettings[key] ?? ''
}

// ─── [FEAT-027] 그룹별 권한 헬퍼 ────────────────────────────────────────────
// getGroupPerm(groupKey, permKey) → true(허용) / false(차단)
// group_permissions 테이블에서 조회 (patchSchema v0.145에서 생성)
function getGroupPerm(groupKey: string, permKey: string): boolean {
  try {
    const row = rawDb.prepare(
      `SELECT is_enabled FROM group_permissions WHERE group_key=? AND perm_key=?`
    ).get(groupKey, permKey) as any
    return row ? row.is_enabled === 1 : false
  } catch (_) { return false }
}

// ─── [FEAT-029] group_permissions 기반 알림 수신자 조회 헬퍼 ─────────────────
// getUsersWithPerm(permKey, excludeId?) → 해당 권한이 활성화된 그룹의 모든 유저 id[]
// sub_role → group_key 매핑 (users.sub_role 컬럼 기준)
// sub_role이 없는 경우 role+position으로 추정
function getUserGroupKey(u: any): string {
  const sr = (u.sub_role || '').trim()
  if (sr === 'lgu_plus') return 'lgu_plus'
  if (sr === 'safety')   return 'safety'
  if (sr === 'site_rep') return 'site_rep'
  if (sr === 'engineer') return 'engineer'
  if (sr === 'ceo')      return 'ceo'
  if (sr === 'worker')   return 'worker'
  // sub_role 미설정 시 role+position으로 추정
  const role = (u.role || '').trim()
  const pos  = (u.position || '').trim()
  if (role === 'admin' && pos === '대표이사') return 'ceo'
  if (role === 'admin') return 'ceo'
  if (role === 'supervisor' && pos === '안전관리자') return 'safety'
  if (role === 'supervisor' && pos === '총괄책임자')  return 'site_rep'
  if (role === 'supervisor' && pos === '관리감독자')  return 'engineer'
  if (role === 'supervisor') return 'engineer'
  if (role === 'worker'  && pos === 'LGU+') return 'lgu_plus'  // 구버전 호환
  if (role === 'lgu')      return 'lgu_plus'                    // 구버전 호환 (v0.154 마이그레이션 전 데이터 방어)
  if (role === 'lgu_plus') return 'lgu_plus'                    // [FEAT-048] 신규 단일 역할
  return 'worker'
}

function getUsersWithPerm(permKey: string, excludeId?: number): number[] {
  try {
    // 권한이 활성화된 group_key 목록
    const enabledGroups = (rawDb.prepare(
      `SELECT group_key FROM group_permissions WHERE perm_key=? AND is_enabled=1`
    ).all(permKey) as any[]).map((r: any) => r.group_key as string)
    if (enabledGroups.length === 0) return []
    // 활성 유저 전체 조회 (sub_role + role + position)
    const allUsers = rawDb.prepare(
      `SELECT id, role, position, sub_role FROM users WHERE is_active=1`
    ).all() as any[]
    const result: number[] = []
    for (const u of allUsers) {
      if (excludeId && u.id === excludeId) continue
      const gk = getUserGroupKey(u)
      if (enabledGroups.includes(gk)) result.push(u.id as number)
    }
    return [...new Set(result)]
  } catch (_) { return [] }
}

// ─── TBM 서명 테이블 보장 + 잔여 트리거 제거 ───────────────────────────────────
// var 사용: let/const 와 달리 TDZ 없음 → 선언 위치 무관하게 호이스팅됨
var _tbmSigTableEnsured = false
function ensureTbmSignaturesTable() {
  if (_tbmSigTableEnsured) return
  _tbmSigTableEnsured = true

  // 1. 테이블 생성 보장
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS tbm_signatures (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tbm_id      INTEGER NOT NULL,
        user_id     INTEGER,
        user_name   TEXT NOT NULL DEFAULT '',
        position    TEXT DEFAULT '',
        role        TEXT DEFAULT 'attendee',
        signed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        sign_method TEXT DEFAULT 'account',
        sign_data   TEXT
      )
    `)
  } catch(e: any) { console.warn('[ensureTbmSig] 테이블 생성 실패(무시):', e?.message) }
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_tbm_sig_tbm  ON tbm_signatures(tbm_id)`) } catch(_) {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_tbm_sig_name ON tbm_signatures(tbm_id, user_name)`) } catch(_) {}

  // 2. tbm_records_old 참조 트리거 모두 제거 (잔여 트리거가 INSERT/UPDATE/DELETE 시 에러 유발)
  try {
    const triggers = rawDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND (
         tbl_name='tbm_signatures' OR tbl_name='tbm_records' OR
         sql LIKE '%tbm_records_old%'
       )`
    ).all() as any[]
    for (const trig of triggers) {
      try {
        rawDb.exec(`DROP TRIGGER IF EXISTS "${trig.name}"`)
        console.log(`[ensureTbmSig] 잔여 트리거 제거: ${trig.name}`)
      } catch(e: any) { console.warn(`[ensureTbmSig] 트리거 제거 실패(무시): ${trig.name}`, e?.message) }
    }
  } catch(e: any) { console.warn('[ensureTbmSig] 트리거 조회 실패(무시):', e?.message) }
}

// ─── 스키마 안전 패치 (컬럼 없으면 자동 추가) ─────────────────────────────────
function patchSchema() {
  // ── 맨 먼저: tbm_records_old 참조 잔여 트리거 강제 제거 ──────────────────────
  try {
    const badTriggers = rawDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND (
         sql LIKE '%tbm_records_old%' OR
         tbl_name='tbm_signatures' OR tbl_name='tbm_records'
       )`
    ).all() as any[]
    for (const t of badTriggers) {
      try {
        rawDb.exec(`DROP TRIGGER IF EXISTS "${t.name}"`)
        console.log(`[patchSchema] 잔여 트리거 제거: ${t.name}`)
      } catch(e: any) { console.warn(`[patchSchema] 트리거 제거 실패(무시): ${t.name}`, e?.message) }
    }
  } catch(e: any) { console.warn('[patchSchema] 트리거 조회 실패(무시):', e?.message) }

  // ── tbm_signatures FK 자동 수정: tbm_records_old 참조 → tbm_records 참조 ────
  // (이전 마이그레이션 오류로 잘못된 FK가 생성된 경우 자동 교정)
  try {
    const sigDdl = rawDb.prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='tbm_signatures'`
    ).get() as any
    if (sigDdl?.sql?.includes('tbm_records_old')) {
      console.log('[patchSchema] tbm_signatures FK 오류 감지 — 테이블 재생성 시작')
      rawDb.exec('PRAGMA foreign_keys = OFF')
      rawDb.exec('BEGIN')
      try {
        rawDb.exec('CREATE TABLE IF NOT EXISTS tbm_signatures_backup AS SELECT * FROM tbm_signatures')
        rawDb.exec('DROP TABLE tbm_signatures')
        rawDb.exec(`CREATE TABLE tbm_signatures (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          tbm_id      INTEGER NOT NULL REFERENCES tbm_records(id) ON DELETE CASCADE,
          user_id     INTEGER REFERENCES users(id),
          user_name   TEXT NOT NULL DEFAULT '',
          position    TEXT DEFAULT '',
          role        TEXT DEFAULT 'attendee',
          signed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
          sign_method TEXT DEFAULT 'account',
          sign_data   TEXT
        )`)
        rawDb.exec(`INSERT INTO tbm_signatures
          SELECT id,tbm_id,user_id,user_name,position,role,signed_at,sign_method,sign_data
          FROM tbm_signatures_backup`)
        rawDb.exec('CREATE INDEX IF NOT EXISTS idx_tbm_sig_tbm  ON tbm_signatures(tbm_id)')
        rawDb.exec('CREATE INDEX IF NOT EXISTS idx_tbm_sig_name ON tbm_signatures(tbm_id, user_name)')
        rawDb.exec('COMMIT')
        console.log('[patchSchema] tbm_signatures FK 재생성 완료 (tbm_records_old → tbm_records)')
      } catch(e: any) {
        rawDb.exec('ROLLBACK')
        console.error('[patchSchema] tbm_signatures 재생성 실패:', e?.message)
      }
      rawDb.exec('PRAGMA foreign_keys = ON')
    }
  } catch(e: any) { console.warn('[patchSchema] tbm_signatures FK 확인 실패(무시):', e?.message) }
  // ────────────────────────────────────────────────────────────────────────────

  const safeAlter = (sql: string) => {
    try { rawDb.exec(sql) } catch(e: any) {
      // "duplicate column name" 은 이미 있는 것이므로 무시
      if (!e.message?.includes('duplicate column')) console.warn('[patchSchema]', e.message)
    }
  }
  // BUG-055: hazard_reports 처리 사진 컬럼 추가
  safeAlter("ALTER TABLE hazard_reports ADD COLUMN resolve_photo_data TEXT DEFAULT NULL")

  // v0.96: tasks 최종 확인 주소
  safeAlter("ALTER TABLE tasks ADD COLUMN confirmed_address TEXT DEFAULT ''")
  safeAlter("ALTER TABLE tasks ADD COLUMN confirmed_address_source TEXT DEFAULT ''")
  safeAlter("ALTER TABLE tasks ADD COLUMN confirmed_address_at DATETIME")

  // v0.100: users 가입 승인 컬럼
  safeAlter("ALTER TABLE users ADD COLUMN is_pending INTEGER DEFAULT 0")
  safeAlter("ALTER TABLE users ADD COLUMN rejection_reason TEXT DEFAULT NULL")
  safeAlter("ALTER TABLE users ADD COLUMN approved_by INTEGER DEFAULT NULL")
  safeAlter("ALTER TABLE users ADD COLUMN approved_at DATETIME DEFAULT NULL")

  // v0.101: 안전교육 관리 테이블
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS safety_education_sessions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      edu_type         TEXT NOT NULL,
      edu_subject      TEXT NOT NULL,
      edu_date         DATE NOT NULL,
      edu_hours        REAL NOT NULL,
      instructor       TEXT,
      location         TEXT,
      quarter          INTEGER,
      year             INTEGER,
      target_type      TEXT,
      special_work_type TEXT,
      notes            TEXT,
      created_by       INTEGER REFERENCES users(id),
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS safety_education_attendees (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id     INTEGER NOT NULL REFERENCES safety_education_sessions(id) ON DELETE CASCADE,
      user_id        INTEGER REFERENCES users(id),
      user_name      TEXT NOT NULL,
      department     TEXT,
      position       TEXT,
      signature_data TEXT,
      attended       INTEGER DEFAULT 1,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_edu_sessions_type ON safety_education_sessions(edu_type)`)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_edu_sessions_date ON safety_education_sessions(edu_date)`)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_edu_sessions_year ON safety_education_sessions(year)`)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_edu_attendees_sess ON safety_education_attendees(session_id)`)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_edu_attendees_user ON safety_education_attendees(user_id)`)

  // v0.98: tbm_photo_sections FK 수정 (checklist_assessments_old → checklist_assessments)
  try {
    const tpsSql: any = rawDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tbm_photo_sections'").get()
    if (tpsSql?.sql?.includes('checklist_assessments_old')) {
      console.log('[patchSchema] tbm_photo_sections FK 수정 중...')
      rawDb.pragma('foreign_keys = OFF')
      const fix1 = rawDb.transaction(() => {
        const existing: any[] = rawDb.prepare('SELECT * FROM tbm_photo_sections').all()
        rawDb.exec('DROP TABLE tbm_photo_sections')
        rawDb.exec(`CREATE TABLE tbm_photo_sections (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          assessment_id   INTEGER NOT NULL,
          section_type    TEXT NOT NULL,
          section_name    TEXT NOT NULL,
          is_required     INTEGER DEFAULT 1,
          FOREIGN KEY (assessment_id) REFERENCES checklist_assessments(id) ON DELETE CASCADE
        )`)
        const ins = rawDb.prepare('INSERT INTO tbm_photo_sections (id, assessment_id, section_type, section_name, is_required) VALUES (?,?,?,?,?)')
        for (const r of existing) ins.run(r.id, r.assessment_id, r.section_type, r.section_name, r.is_required ?? 1)
      })
      fix1()
      rawDb.pragma('foreign_keys = ON')
      console.log('[patchSchema] tbm_photo_sections FK 수정 완료')
    }
  } catch(e: any) { console.warn('[patchSchema] tbm_photo_sections FK 수정 실패:', e.message) }

  // v0.98: risk_assessments status CHECK 제약 확장 (in_review, measures_done 추가)
  try {
    const raSql: any = rawDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='risk_assessments'").get()
    if (raSql?.sql && !raSql.sql.includes('in_review')) {
      console.log('[patchSchema] risk_assessments status CHECK 확장 중...')
      rawDb.pragma('foreign_keys = OFF')
      const fix2 = rawDb.transaction(() => {
        rawDb.exec('DROP TABLE IF EXISTS risk_assessments_new')
        rawDb.exec(`CREATE TABLE risk_assessments_new (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id         INTEGER,
          assessor_id     INTEGER NOT NULL,
          assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          weather         TEXT,
          temperature     TEXT,
          workers_count   INTEGER DEFAULT 1,
          notes           TEXT,
          status          TEXT DEFAULT 'draft' CHECK(status IN ('draft','in_review','measures_done','completed','approved')),
          kakao_shared    INTEGER DEFAULT 0,
          kakao_shared_at DATETIME,
          created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
          assessment_type TEXT NOT NULL DEFAULT 'task',
          title           TEXT,
          location        TEXT,
          review_notes    TEXT,
          final_notes     TEXT,
          source_adhoc_ids TEXT,
          review_date     DATE,
          meeting_date    DATE,
          meeting_place   TEXT,
          adhoc_trigger   TEXT,
          assessment_method TEXT DEFAULT '빈도·강도법(5×5 매트릭스)',
          risk_acceptance_criteria TEXT DEFAULT '허용가능: 낮음(4점 이하) / 허용불가: 보통 이상(5점 이상)',
          scan_files      TEXT,
          FOREIGN KEY (task_id)     REFERENCES tasks(id),
          FOREIGN KEY (assessor_id) REFERENCES users(id)
        )`)
        // 기존 테이블의 실제 컬럼 목록을 동적으로 조회하여 INSERT (컬럼 수 불일치 방지)
        const existingCols: any[] = rawDb.prepare("PRAGMA table_info(risk_assessments)").all()
        const newCols = [
          'id','task_id','assessor_id','assessment_date','weather','temperature',
          'workers_count','notes','status','kakao_shared','kakao_shared_at','created_at',
          'assessment_type','title','location','review_notes','final_notes',
          'source_adhoc_ids','review_date','meeting_date','meeting_place',
          'adhoc_trigger','assessment_method','risk_acceptance_criteria','scan_files'
        ]
        const existingColNames = new Set(existingCols.map((c: any) => c.name))
        const copyCols = newCols.filter(c => existingColNames.has(c)).join(', ')
        rawDb.exec(`INSERT INTO risk_assessments_new (${copyCols}) SELECT ${copyCols} FROM risk_assessments`)
        rawDb.exec('DROP TABLE risk_assessments')
        rawDb.exec('ALTER TABLE risk_assessments_new RENAME TO risk_assessments')
      })
      fix2()
      rawDb.pragma('foreign_keys = ON')
      console.log('[patchSchema] risk_assessments status CHECK 확장 완료')
    }
  } catch(e: any) { console.warn('[patchSchema] risk_assessments status CHECK 수정 실패:', e.message) }
  // v0.98: checklist_responses FK 수정 (checklist_assessments_old → checklist_assessments)
  try {
    const crSql: any = rawDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='checklist_responses'").get()
    if (crSql?.sql?.includes('checklist_assessments_old')) {
      console.log('[patchSchema] checklist_responses FK 수정 중...')
      rawDb.pragma('foreign_keys = OFF')
      const fixCR = rawDb.transaction(() => {
        const existing: any[] = rawDb.prepare('SELECT * FROM checklist_responses').all()
        rawDb.exec('DROP TABLE checklist_responses')
        rawDb.exec(`CREATE TABLE checklist_responses (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          assessment_id   INTEGER NOT NULL,
          item_id         INTEGER NOT NULL,
          response        TEXT DEFAULT NULL CHECK(response IS NULL OR response IN ('na','ok','nok')),
          memo            TEXT,
          FOREIGN KEY (assessment_id) REFERENCES checklist_assessments(id) ON DELETE CASCADE,
          FOREIGN KEY (item_id) REFERENCES checklist_items(id),
          UNIQUE(assessment_id, item_id)
        )`)
        const ins = rawDb.prepare('INSERT INTO checklist_responses (id, assessment_id, item_id, response, memo) VALUES (?,?,?,?,?)')
        for (const r of existing) ins.run(r.id, r.assessment_id, r.item_id, r.response, r.memo)
      })
      fixCR()
      rawDb.pragma('foreign_keys = ON')
      console.log('[patchSchema] checklist_responses FK 수정 완료')
    }
  } catch(e: any) { console.warn('[patchSchema] checklist_responses FK 수정 실패:', e.message) }

  // v0.98: inspection_photos FK 수정 (site_inspections_old → site_inspections)
  try {
    const ipSql: any = rawDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='inspection_photos'").get()
    if (ipSql?.sql?.includes('site_inspections_old')) {
      console.log('[patchSchema] inspection_photos FK 수정 중...')
      rawDb.pragma('foreign_keys = OFF')
      const fixIP = rawDb.transaction(() => {
        const existing: any[] = rawDb.prepare('SELECT * FROM inspection_photos').all()
        rawDb.exec('DROP TABLE inspection_photos')
        rawDb.exec(`CREATE TABLE inspection_photos (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          inspection_id   INTEGER NOT NULL,
          file_name       TEXT NOT NULL,
          file_path       TEXT,
          file_data       TEXT,
          caption         TEXT,
          created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
          mime_type       TEXT DEFAULT 'image/jpeg',
          FOREIGN KEY (inspection_id) REFERENCES site_inspections(id)
        )`)
        const ins = rawDb.prepare('INSERT INTO inspection_photos (id, inspection_id, file_name, file_path, file_data, caption, created_at, mime_type) VALUES (?,?,?,?,?,?,?,?)')
        for (const r of existing) ins.run(r.id, r.inspection_id, r.file_name, r.file_path, r.file_data, r.caption, r.created_at, r.mime_type || 'image/jpeg')
      })
      fixIP()
      rawDb.pragma('foreign_keys = ON')
      console.log('[patchSchema] inspection_photos FK 수정 완료')
    }
  } catch(e: any) { console.warn('[patchSchema] inspection_photos FK 수정 실패:', e.message) }

  // v0.107: 안전교육 법령기준 레코드 시드 (교육 유형별 대상/시간/과태료)
  // content 컬럼에 JSON 배열 저장: [{target, hours, fine}, ...]
  // law_ref 컬럼에 교육 페이지 서브타이틀 텍스트 저장
  try {
    const eduSeeds = [
      {
        key: 'edu_periodic',
        title: '정기교육 법적 기준',
        law_ref: '매 분기 실시 | 사무직 6h↑ / 그 외 12h↑ (산안법 제29조)',
        content: JSON.stringify([
          { target: '사무직/판매직', hours: '분기별 6시간 이상', fine: '10→20→50만원' },
          { target: '그 외 근로자', hours: '분기별 12시간 이상', fine: '10→20→50만원' },
        ])
      },
      {
        key: 'edu_hire',
        title: '채용시 교육 법적 기준',
        law_ref: '채용 즉시 실시 | 일용 1h↑ / 기간제 4h↑ / 그 외 8h↑',
        content: JSON.stringify([
          { target: '일용근로자 (1주 이하)', hours: '1시간 이상', fine: '10→20→50만원' },
          { target: '기간제 (1주~1개월)', hours: '4시간 이상', fine: '10→20→50만원' },
          { target: '그 외 근로자', hours: '8시간 이상', fine: '10→20→50만원' },
        ])
      },
      {
        key: 'edu_job_change',
        title: '작업내용 변경시 교육 법적 기준',
        law_ref: '작업 변경 전 실시 | 일용 1h↑ / 그 외 2h↑',
        content: JSON.stringify([
          { target: '일용근로자 (1주 이하)', hours: '1시간 이상', fine: '10→20→50만원' },
          { target: '그 외 근로자', hours: '2시간 이상', fine: '10→20→50만원' },
        ])
      },
      {
        key: 'edu_special',
        title: '특별교육 법적 기준',
        law_ref: '특별 작업 전 실시 | 일용 2h↑ / 그 외 16h↑ (분할 가능)',
        content: JSON.stringify([
          { target: '일용근로자 (타워크레인 제외)', hours: '2시간 이상', fine: '50→100→150만원' },
          { target: '타워크레인 신호 일용', hours: '8시간 이상', fine: '50→100→150만원' },
          { target: '그 외 근로자', hours: '16시간 이상 (단기 2h 가능)', fine: '50→100→150만원' },
        ])
      },
      {
        key: 'edu_supervisor',
        title: '관리감독자 교육 법적 기준',
        law_ref: '연간 16시간 이상 | 과태료 50~500만원',
        content: JSON.stringify([
          { target: '관리감독자', hours: '연간 16시간 이상', fine: '50→250→500만원' },
        ])
      },
    ]
    const insStmt = rawDb.prepare(
      `INSERT OR IGNORE INTO legal_notices (notice_key, title, law_ref, content, is_active)
       VALUES (?, ?, ?, ?, 1)`
    )
    for (const s of eduSeeds) {
      insStmt.run(s.key, s.title, s.law_ref, s.content)
    }
    console.log('[patchSchema] 교육 법령기준 시드 완료')
  } catch(e: any) { console.warn('[patchSchema] 교육 법령기준 시드 실패:', e.message) }

  // ─── [FEAT-163] v0.107s: safety_* 법령안내 시드 (신규 NAS 설치 시 자동 삽입) ──
  // edu_* 5건은 위 v0.107에서 처리, safety_* 5건은 migration 파일에만 존재하여
  // 신규 DB에서 법령안내 페이지가 빈 상태로 표시되는 문제 방지.
  // INSERT OR IGNORE: 이미 존재하면 무시 (기존 NAS 수동 삽입 데이터 보호)
  try {
    const safetySeeds = [
      {
        key: 'safety_general',
        title: '산업안전보건법 주요 의무사항',
        law_ref: '산업안전보건법 제5조, 제38조, 제39조',
        content: JSON.stringify([
          { target: '사업주', obligation: '안전·보건 조치 의무', fine: '위반 시 5년 이하 징역 또는 5천만원 이하 벌금' },
          { target: '근로자', obligation: '안전·보건 조치 준수 의무', fine: '위반 시 300만원 이하 과태료' },
        ])
      },
      {
        key: 'safety_ppe',
        title: '개인보호구 지급 및 착용 의무',
        law_ref: '산업안전보건법 제38조, 산업안전보건기준에 관한 규칙 제32조',
        content: JSON.stringify([
          { target: '사업주', obligation: '작업 특성에 맞는 보호구 지급 의무', fine: '미지급 시 5백만원 이하 과태료' },
          { target: '근로자', obligation: '지급된 보호구 착용 의무', fine: '미착용 시 5만원 과태료' },
        ])
      },
      {
        key: 'safety_stop',
        title: '중대재해 발생 시 작업중지 의무',
        law_ref: '산업안전보건법 제54조, 중대재해처벌법 제4조',
        content: JSON.stringify([
          { target: '사업주', obligation: '중대재해 발생 즉시 해당 작업 중지 및 근로자 대피', fine: '미조치 시 5년 이하 징역 또는 5천만원 이하 벌금' },
          { target: '사업주', obligation: '중대산업재해 발생 시 고용노동부 즉시 보고 의무', fine: '미보고·허위보고 시 3천만원 이하 과태료' },
        ])
      },
      {
        key: 'safety_hazard',
        title: '위험성 평가 실시 의무',
        law_ref: '산업안전보건법 제36조, 사업장 위험성평가에 관한 지침',
        content: JSON.stringify([
          { target: '사업주', obligation: '최초·정기(연 1회)·수시 위험성평가 실시', fine: '미실시 시 5백만원 이하 과태료' },
          { target: '사업주', obligation: '근로자 참여 보장 및 평가 결과 게시', fine: '미이행 시 과태료 부과' },
        ])
      },
      {
        key: 'safety_tbm',
        title: 'TBM(작업 전 안전점검) 실시',
        law_ref: '산업안전보건법 제29조, KOSHA GUIDE H-57',
        content: JSON.stringify([
          { target: '관리감독자', obligation: '작업 시작 전 TBM 실시 — 위험요인 확인 및 안전수칙 교육', fine: '미실시 시 관리·감독 소홀로 과태료 부과 가능' },
          { target: '근로자', obligation: 'TBM 참여 및 안전수칙 준수', fine: '미준수 시 시정 조치' },
        ])
      },
    ]
    const safetyInsStmt = rawDb.prepare(
      `INSERT OR IGNORE INTO legal_notices (notice_key, title, law_ref, content, is_active)
       VALUES (?, ?, ?, ?, 1)`
    )
    for (const s of safetySeeds) {
      safetyInsStmt.run(s.key, s.title, s.law_ref, s.content)
    }
    console.log('[patchSchema FEAT-163] safety_* 법령안내 시드 완료 (5건)')
  } catch(e: any) { console.warn('[patchSchema FEAT-163] safety_* 시드 실패:', e.message) }
  // ─── [FEAT-163] 끝 ──────────────────────────────────────────────────────────

  // v0.109: 안전교육 증빙사진 + 결과보고서 테이블
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS edu_photos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  INTEGER NOT NULL REFERENCES safety_education_sessions(id) ON DELETE CASCADE,
      file_name   TEXT NOT NULL,
      file_path   TEXT NOT NULL,
      caption     TEXT,
      uploaded_by INTEGER REFERENCES users(id),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_edu_photos_session ON edu_photos(session_id)`)

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS edu_reports (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER NOT NULL UNIQUE REFERENCES safety_education_sessions(id) ON DELETE CASCADE,
      report_title TEXT,
      objectives   TEXT,
      content_desc TEXT,
      outcomes     TEXT,
      improvements TEXT,
      created_by   INTEGER REFERENCES users(id),
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_edu_reports_session ON edu_reports(session_id)`)
  console.log('[patchSchema] edu_photos/edu_reports 테이블 준비 완료')

  // v0.110: safety_education_sessions 새 컬럼 추가
  //  - start_time / end_time : 시작·종료 시간 (HH:MM)
  //  - edu_content           : 교육 내용 (법령 기본값 포함, 수정 가능)
  //  - is_completed          : 완료처리 여부 (0/1)
  //  - completed_at          : 완료처리 일시
  const eduAlters = [
    `ALTER TABLE safety_education_sessions ADD COLUMN start_time   TEXT`,
    `ALTER TABLE safety_education_sessions ADD COLUMN end_time     TEXT`,
    `ALTER TABLE safety_education_sessions ADD COLUMN edu_content  TEXT`,
    `ALTER TABLE safety_education_sessions ADD COLUMN is_completed INTEGER DEFAULT 0`,
    `ALTER TABLE safety_education_sessions ADD COLUMN completed_at DATETIME`,
  ]
  for (const sql of eduAlters) {
    try { rawDb.exec(sql) } catch(e: any) {
      if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.110]', e.message)
    }
  }
  console.log('[patchSchema] v0.110 교육 컬럼 패치 완료')

  // v0.110: users 테이블 교육 이수현황 컬럼 추가
  const userEduAlters = [
    `ALTER TABLE users ADD COLUMN edu_periodic_date   DATE`,
    `ALTER TABLE users ADD COLUMN edu_job_change_date DATE`,
    `ALTER TABLE users ADD COLUMN edu_special_date    DATE`,
    `ALTER TABLE users ADD COLUMN edu_supervisor_date DATE`,
  ]
  for (const sql of userEduAlters) {
    try { rawDb.exec(sql) } catch(e: any) {
      if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.110 users]', e.message)
    }
  }
  console.log('[patchSchema] v0.110 users 교육 이수 컬럼 패치 완료')

  // v0.160: users 테이블 특별안전교육 종류별 이수현황 JSON 컬럼 추가
  // 형식: {"전기 기계·기구 점검":"2024-03-15","밀폐공간 작업":"2024-05-20"}
  try {
    rawDb.exec(`ALTER TABLE users ADD COLUMN edu_special_records TEXT DEFAULT '{}'`)
    console.log('[patchSchema v0.160] ✅ users.edu_special_records 컬럼 추가')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.160 users]', e.message)
  }

  // v0.111m: 서명 이미지(Canvas) 저장 컬럼 추가
  // ※ risk_assessment_signatures 테이블이 없으면 먼저 생성 (0049 migration 미적용 대비)
  try {
    rawDb.exec(`CREATE TABLE IF NOT EXISTS risk_assessment_signatures (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      user_name     TEXT NOT NULL,
      position      TEXT DEFAULT '',
      role          TEXT DEFAULT 'member',
      signed_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      sign_method   TEXT DEFAULT 'account',
      sign_data     TEXT,
      UNIQUE(assessment_id, user_id)
    )`)
  } catch(e: any) { if (!e.message?.includes('already exists')) console.warn('[patchSchema v0.111m] risk_assessment_signatures 생성 실패:', e.message) }

  // legal_notices 테이블도 없으면 생성 (0049 migration 미적용 대비)
  try {
    rawDb.exec(`CREATE TABLE IF NOT EXISTS legal_notices (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      notice_key TEXT UNIQUE NOT NULL,
      title      TEXT NOT NULL,
      law_ref    TEXT,
      content    TEXT,
      is_active  INTEGER DEFAULT 1,
      updated_by INTEGER REFERENCES users(id),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)
  } catch(e: any) { if (!e.message?.includes('already exists')) console.warn('[patchSchema v0.111m] legal_notices 생성 실패:', e.message) }

  const signDataAlters = [
    `ALTER TABLE tbm_signatures               ADD COLUMN sign_data TEXT`,
    `ALTER TABLE risk_assessment_signatures   ADD COLUMN sign_data TEXT`,
  ]
  for (const sql of signDataAlters) {
    try { rawDb.exec(sql) } catch(e: any) {
      if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.111m]', e.message)
    }
  }
  console.log('[patchSchema] v0.111m sign_data 컬럼 패치 완료')

  // v0.112p: 서명 요청 테이블
  // ref_type: 'tbm' | 'risk_assessment' | 'education'
  // status: 'pending' | 'signed' | 'rejected'
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS signature_requests (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_type     TEXT NOT NULL,
      ref_id       INTEGER NOT NULL,
      ref_sub_type TEXT,
      title        TEXT NOT NULL,
      description  TEXT,
      requester_id INTEGER NOT NULL REFERENCES users(id),
      target_user_id INTEGER NOT NULL REFERENCES users(id),
      status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','signed','rejected')),
      sign_data    TEXT,
      signed_at    DATETIME,
      rejected_reason TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at   DATETIME
    )
  `)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_sig_req_target ON signature_requests(target_user_id, status)`)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_sig_req_ref ON signature_requests(ref_type, ref_id)`)
  console.log('[patchSchema] v0.112p signature_requests 테이블 준비 완료')

  // v0.118h: tbm_signatures 테이블 없으면 생성 후 인덱스 추가
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS tbm_signatures (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tbm_id      INTEGER NOT NULL REFERENCES tbm_records(id) ON DELETE CASCADE,
      user_id     INTEGER REFERENCES users(id),
      user_name   TEXT NOT NULL,
      position    TEXT,
      role        TEXT DEFAULT 'attendee',
      signed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      sign_method TEXT DEFAULT 'account',
      sign_data   TEXT,
      UNIQUE(tbm_id, user_id)
    )
  `)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_tbm_sig_tbm  ON tbm_signatures(tbm_id)`)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_tbm_sig_name ON tbm_signatures(tbm_id, user_name)`)
  console.log('[patchSchema] v0.118h tbm_signatures 테이블 및 인덱스 준비 완료')

  // v0.119i: tbm_signatures — user_id FK 제약 완화 (이름 기반 서명 시 user_id NULL 허용)
  // 기존: user_id INTEGER NOT NULL REFERENCES users(id)
  // 변경: user_id INTEGER REFERENCES users(id)  (NULL 허용 → 이름 기반 서명 저장 가능)
  {
    const colInfo = rawDb.prepare(`PRAGMA table_info(tbm_signatures)`).all() as any[]
    const uidCol = colInfo.find((c: any) => c.name === 'user_id')
    // notnull=1 이면 아직 마이그레이션 전
    if (uidCol && uidCol.notnull === 1) {
      console.log('[patchSchema] v0.119i tbm_signatures user_id NULL 허용 마이그레이션 시작...')
      rawDb.exec(`
        PRAGMA foreign_keys=OFF;
        BEGIN;
        CREATE TABLE IF NOT EXISTS tbm_signatures_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          tbm_id      INTEGER NOT NULL REFERENCES tbm_records(id) ON DELETE CASCADE,
          user_id     INTEGER REFERENCES users(id),
          user_name   TEXT NOT NULL,
          position    TEXT,
          role        TEXT DEFAULT 'attendee',
          signed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
          sign_method TEXT DEFAULT 'account',
          sign_data   TEXT,
          UNIQUE(tbm_id, user_id)
        );
        INSERT INTO tbm_signatures_new SELECT * FROM tbm_signatures;
        DROP TABLE tbm_signatures;
        ALTER TABLE tbm_signatures_new RENAME TO tbm_signatures;
        CREATE INDEX IF NOT EXISTS idx_tbm_sig_tbm  ON tbm_signatures(tbm_id);
        CREATE INDEX IF NOT EXISTS idx_tbm_sig_name ON tbm_signatures(tbm_id, user_name);
        COMMIT;
        PRAGMA foreign_keys=ON;
      `)
      console.log('[patchSchema] v0.119i tbm_signatures user_id NULL 허용 마이그레이션 완료')
    } else {
      console.log('[patchSchema] v0.119i tbm_signatures 이미 마이그레이션됨 (skip)')
    }
  }

  // v0.121u: tbm_signatures UNIQUE 제약 (tbm_id, user_id) → (tbm_id, user_id, role)
  // 결재 서명은 동일 user가 role별로 서명 가능해야 하므로 role을 UNIQUE 키에 포함
  {
    const idxInfo = rawDb.prepare(`PRAGMA index_list(tbm_signatures)`).all() as any[]
    const hasRoleUniq = idxInfo.some((ix: any) => {
      // (tbm_id, user_id, role) 3컬럼 unique 인덱스가 있으면 skip
      const cols = rawDb.prepare(`PRAGMA index_info(${ix.name})`).all() as any[]
      return ix.unique === 1 && cols.length === 3 && cols.some((c: any) => c.name === 'role')
    })
    if (!hasRoleUniq) {
      console.log('[patchSchema] v0.121u tbm_signatures UNIQUE 제약 role 포함으로 변경 시작...')
      rawDb.exec(`
        PRAGMA foreign_keys=OFF;
        BEGIN;
        CREATE TABLE IF NOT EXISTS tbm_signatures_v121 (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          tbm_id      INTEGER NOT NULL REFERENCES tbm_records(id) ON DELETE CASCADE,
          user_id     INTEGER REFERENCES users(id),
          user_name   TEXT NOT NULL,
          position    TEXT,
          role        TEXT DEFAULT 'attendee',
          signed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
          sign_method TEXT DEFAULT 'account',
          sign_data   TEXT,
          UNIQUE(tbm_id, user_id, role)
        );
        INSERT OR IGNORE INTO tbm_signatures_v121 SELECT * FROM tbm_signatures;
        DROP TABLE tbm_signatures;
        ALTER TABLE tbm_signatures_v121 RENAME TO tbm_signatures;
        CREATE INDEX IF NOT EXISTS idx_tbm_sig_tbm  ON tbm_signatures(tbm_id);
        CREATE INDEX IF NOT EXISTS idx_tbm_sig_name ON tbm_signatures(tbm_id, user_name);
        COMMIT;
        PRAGMA foreign_keys=ON;
      `)
      console.log('[patchSchema] v0.121u tbm_signatures UNIQUE(tbm_id, user_id, role) 변경 완료')
    } else {
      console.log('[patchSchema] v0.121u tbm_signatures UNIQUE 제약 이미 적용됨 (skip)')
    }
  }

  // v0.120n: notifications 테이블 (정산요청 등 알림 영구 저장)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      type        TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      ref_id      INTEGER,
      ref_type    TEXT,
      is_read     INTEGER NOT NULL DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  rawDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
      ON notifications(user_id, is_read, created_at DESC)
  `)
  console.log('[patchSchema] v0.120n notifications 테이블 준비 완료')

  // v0.121g: users.grade 컬럼 추가 (직급)
  try {
    rawDb.exec(`ALTER TABLE users ADD COLUMN grade TEXT NOT NULL DEFAULT ''`)
    console.log('[patchSchema] v0.121g users.grade 컬럼 추가 완료')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.121g]', e.message)
  }

  // v0.130w: 외선작업일보 / 기타공종 / 물량통계 테이블
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS work_reports (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id      INTEGER NOT NULL UNIQUE,
        detail_type  TEXT DEFAULT '',
        work_date    TEXT DEFAULT '',
        worker_team  TEXT DEFAULT '',
        manager_name TEXT DEFAULT '',
        status       TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','confirmed')),
        created_by   INTEGER REFERENCES users(id),
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS work_report_lines (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id     INTEGER NOT NULL,
        line_order    INTEGER DEFAULT 0,
        work_div      TEXT DEFAULT '',
        mgmt_zone     TEXT DEFAULT '',
        mgmt_no       TEXT DEFAULT '',
        line_name     TEXT DEFAULT '',
        line_no       TEXT DEFAULT '',
        digital_no    TEXT DEFAULT '',
        section_dist  REAL DEFAULT 0,
        pole_count    INTEGER DEFAULT 0,
        ip_pole       TEXT DEFAULT '',
        bind_wire     TEXT DEFAULT '',
        hanger        TEXT DEFAULT '',
        hardware      TEXT DEFAULT '',
        cabinet       TEXT DEFAULT '',
        name_tag      INTEGER DEFAULT 0,
        warning_sign  INTEGER DEFAULT 0,
        grounding     TEXT DEFAULT '',
        other_work    TEXT DEFAULT '',
        remark        TEXT DEFAULT '',
        FOREIGN KEY (report_id) REFERENCES work_reports(id) ON DELETE CASCADE
      )
    `)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS work_report_cables (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id    INTEGER NOT NULL,
        cable_order  INTEGER DEFAULT 0,
        lot_no       TEXT DEFAULT '',
        spec         TEXT DEFAULT '',
        maker        TEXT DEFAULT '',
        mfg_year     TEXT DEFAULT '',
        cable_type   TEXT DEFAULT '',
        work_div     TEXT DEFAULT '',
        start_point  TEXT DEFAULT '',
        end_point    TEXT DEFAULT '',
        usage_m      REAL DEFAULT 0,
        cable_kind   TEXT DEFAULT '',
        cable_code   TEXT DEFAULT '',
        special_note TEXT DEFAULT '',
        proc         TEXT DEFAULT '',
        remark       TEXT DEFAULT '',
        FOREIGN KEY (report_id) REFERENCES work_reports(id) ON DELETE CASCADE
      )
    `)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS other_work_types (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        unit       TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        is_active  INTEGER DEFAULT 1,
        unit_price INTEGER DEFAULT 0
      )
    `)
    rawDb.exec(`
      INSERT OR IGNORE INTO other_work_types (name, unit, sort_order, unit_price) VALUES
        ('지선신설','M',1,35000),('전주세움','개소',2,45000),
        ('가요전선관','M',3,600),('내관포설','M',4,400),
        ('완금설치(한전주)','개소',5,28000),
        ('단순1','본',6,15000),('단순1-2','경간',7,29000),('단순2','경간',8,80000)
    `)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS work_report_other (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id     INTEGER NOT NULL,
        other_type_id INTEGER NOT NULL,
        quantity      REAL DEFAULT 0,
        FOREIGN KEY (report_id)     REFERENCES work_reports(id) ON DELETE CASCADE,
        FOREIGN KEY (other_type_id) REFERENCES other_work_types(id),
        UNIQUE(report_id, other_type_id)
      )
    `)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS volume_unit_prices (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        item_key   TEXT NOT NULL UNIQUE,
        item_label TEXT NOT NULL,
        unit_price INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0
      )
    `)
    rawDb.exec(`
      INSERT OR IGNORE INTO volume_unit_prices (item_key, item_label, unit_price, sort_order) VALUES
        ('a000001', '광케이블 신설',        1100,  1),
        ('a000002', '광케이블 철거',         300,  2),
        ('a000003', '광케이블 이설',        1400,  3),
        ('a000004', '조가선신설',            400,  4),
        ('a000005', '커넥터취부',          38000,  5),
        ('a000006', '조가선 철거',           100,  6),
        ('a000007', '전주 건식',          120000,  7),
        ('a000008', '전주 철거',           30000,  8),
        ('a000009', 'B 형접지(대지)',      35000,  9),
        ('a000010', 'A 형접지(대지)',       6000, 10),
        ('a000011', '지선신설',            35000, 11),
        ('a000012', '전주세움',            45000, 12),
        ('a000013', '가요전선관',            600, 13),
        ('a000014', '내관포설',             400, 14),
        ('a000015', '완금설치 (한전주)',    28000, 15),
        ('a000016', '단순1',             15000, 16),
        ('a000017', '단순1-2',           29000, 17),
        ('a000018', '단순2',             80000, 18)
    `)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_work_reports_task  ON work_reports(task_id)`)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_report_lines       ON work_report_lines(report_id)`)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_report_cables      ON work_report_cables(report_id)`)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_report_other       ON work_report_other(report_id)`)
    // ── BUG-018: work_report_cables spec 컬럼 타입 수정 + proc/remark 보증 ──────
    // spec 컬럼이 REAL이면 '1C','12C' 같은 문자열이 0으로 저장됨 → TEXT로 재생성
    safeAlter(`ALTER TABLE work_report_cables ADD COLUMN proc TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_cables ADD COLUMN remark TEXT DEFAULT ''`)
    // ── TASK-005: 자산구분 컬럼 추가 ──────────────────────────────────────────
    safeAlter(`ALTER TABLE work_report_cables ADD COLUMN asset_type TEXT DEFAULT ''`)
    // spec 컬럼 타입 확인 후 REAL이면 테이블 재생성 (데이터 보존)
    try {
      const cablesDDL = (rawDb.prepare(`SELECT sql FROM sqlite_master WHERE name='work_report_cables'`).get() as any)?.sql || ''
      if (cablesDDL.includes('spec') && (cablesDDL.match(/spec\s+REAL/i) || !cablesDDL.match(/proc\s+TEXT/i))) {
        console.log('[patchSchema] work_report_cables 재생성 시작 (spec REAL→TEXT, proc/remark 추가)')
        rawDb.exec(`
          BEGIN;
          CREATE TABLE IF NOT EXISTS work_report_cables_new (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id    INTEGER NOT NULL,
            cable_order  INTEGER DEFAULT 0,
            lot_no       TEXT DEFAULT '',
            spec         TEXT DEFAULT '',
            maker        TEXT DEFAULT '',
            mfg_year     TEXT DEFAULT '',
            cable_type   TEXT DEFAULT '',
            work_div     TEXT DEFAULT '',
            start_point  TEXT DEFAULT '',
            end_point    TEXT DEFAULT '',
            usage_m      REAL DEFAULT 0,
            cable_kind   TEXT DEFAULT '',
            cable_code   TEXT DEFAULT '',
            special_note TEXT DEFAULT '',
            proc         TEXT DEFAULT '',
            remark       TEXT DEFAULT ''
          );
          INSERT INTO work_report_cables_new
            (id,report_id,cable_order,lot_no,spec,maker,mfg_year,cable_type,work_div,
             start_point,end_point,usage_m,cable_kind,cable_code,special_note,proc,remark)
          SELECT
            id,report_id,cable_order,lot_no,
            CAST(spec AS TEXT),
            maker,mfg_year,
            COALESCE(cable_type,''), COALESCE(work_div,''),
            COALESCE(start_point,''), COALESCE(end_point,''),
            COALESCE(usage_m,0),
            COALESCE(cable_kind,''), COALESCE(cable_code,''), COALESCE(special_note,''),
            COALESCE(proc,''), COALESCE(remark,'')
          FROM work_report_cables;
          DROP TABLE work_report_cables;
          ALTER TABLE work_report_cables_new RENAME TO work_report_cables;
          COMMIT;
        `)
        rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_report_cables ON work_report_cables(report_id)`)
        console.log('[patchSchema] work_report_cables 재생성 완료 (spec TEXT)')
      }
    } catch(rebuildErr: any) {
      console.error('[patchSchema] work_report_cables 재생성 실패 (무시):', rebuildErr.message)
    }
    // ── BUG-016: work_report_lines 컬럼 누락 보정 (구버전 NAS DB 호환) ──────
    // CREATE TABLE IF NOT EXISTS는 기존 테이블에 컬럼을 추가하지 않으므로
    // 초기 DB에 없는 컬럼들을 safeAlter로 보정
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN work_div     TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN mgmt_zone    TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN mgmt_no      TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN line_name    TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN line_no      TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN digital_no   TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN section_dist REAL DEFAULT 0`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN pole_count   INTEGER DEFAULT 0`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN ip_pole      TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN bind_wire    TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN hanger       TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN hardware     TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN cabinet      TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN name_tag     INTEGER DEFAULT 0`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN warning_sign INTEGER DEFAULT 0`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN grounding    TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN other_work   TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_lines ADD COLUMN remark       TEXT DEFAULT ''`)
    // work_report_cables 추가 컬럼 보정 (재생성 실패 fallback용)
    safeAlter(`ALTER TABLE work_report_cables ADD COLUMN cable_type  TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_cables ADD COLUMN work_div    TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_cables ADD COLUMN cable_code  TEXT DEFAULT ''`)
    safeAlter(`ALTER TABLE work_report_cables ADD COLUMN special_note TEXT DEFAULT ''`)
    // volume_unit_prices 항목을 신규 단가표로 교체 (기존 구버전 키 삭제)
    const newKeys = ['a000001','a000002','a000003','a000004','a000005','a000006',
      'a000007','a000008','a000009','a000010','a000011','a000012',
      'a000013','a000014','a000015','a000016','a000017','a000018']
    const oldKeys = [
      'joga_new','connector','joga_remove','ip_new','ip_remove','ground_b','ground_a',
      // v0.141: 한글/혼용 구버전 키 (INSERT OR IGNORE 잔존 방지용 선제 삭제)
      'cable_new','cable_remove','cable_move',
      '조가선신설','커넥터취부','조가선 철거','전주 건식','전주 철거',
      'B 형접지(대지)','A 형접지(대지)','지선신설','전주세움',
      '가요전선관','내관포설','완금설치 (한전주)','단순1','단순1-2','단순2',
    ]
    oldKeys.forEach(k => { try { rawDb.prepare(`DELETE FROM volume_unit_prices WHERE item_key=?`).run(k) } catch(_){} })
    // 추가입력(공종별 작업량) 테이블 생성
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS work_report_extras (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id  INTEGER NOT NULL,
        set_no     INTEGER DEFAULT 1,
        item_key   TEXT NOT NULL,
        qty        REAL DEFAULT 0,
        FOREIGN KEY (report_id) REFERENCES work_reports(id) ON DELETE CASCADE
      )
    `)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_report_extras ON work_report_extras(report_id)`)
    // ── BUG-020: work_report_extras FK 오염 수정 ────────────────────────────────
    // 이전 patchSchema에서 work_reports → work_reports_old RENAME 잔해가 남은 경우
    // work_report_extras DDL의 FK가 work_reports_old(id)를 참조하게 됨 → INSERT 시 에러
    // 감지 후 테이블 재생성으로 FK를 work_reports(id) 로 정상화
    try {
      const extrasDDL = (rawDb.prepare(`SELECT sql FROM sqlite_master WHERE name='work_report_extras'`).get() as any)?.sql || ''
      if (extrasDDL.includes('work_reports_old')) {
        console.log('[patchSchema] work_report_extras FK 오염 감지 (work_reports_old 참조) → 재생성 시작')
        rawDb.exec(`
          BEGIN;
          CREATE TABLE work_report_extras_new (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id  INTEGER NOT NULL,
            set_no     INTEGER DEFAULT 1,
            item_key   TEXT NOT NULL,
            qty        REAL DEFAULT 0,
            FOREIGN KEY (report_id) REFERENCES work_reports(id) ON DELETE CASCADE
          );
          INSERT INTO work_report_extras_new (id, report_id, set_no, item_key, qty)
            SELECT id, report_id, set_no, item_key, qty FROM work_report_extras;
          DROP TABLE work_report_extras;
          ALTER TABLE work_report_extras_new RENAME TO work_report_extras;
          COMMIT;
        `)
        rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_report_extras ON work_report_extras(report_id)`)
        console.log('[patchSchema] work_report_extras FK 재생성 완료 (→ work_reports(id))')
      }
    } catch(extrasFixErr: any) {
      console.error('[patchSchema] work_report_extras FK 수정 실패:', extrasFixErr.message)
    }
    console.log('[patchSchema] v0.131w 외선작업일보 proc/extras 컬럼 준비 완료')

    // ── v0.132w: 접속일보 테이블 ───────────────────────────────────────────────
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS splice_reports (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id      INTEGER,
        work_date    TEXT DEFAULT '',
        worker_team  TEXT DEFAULT '',
        manager_name TEXT DEFAULT '',
        remark       TEXT DEFAULT '',
        status       TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','confirmed')),
        created_by   INTEGER REFERENCES users(id),
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS splice_work_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id   INTEGER NOT NULL,
        item_order  INTEGER DEFAULT 0,
        work_label  TEXT DEFAULT '',
        is_night    INTEGER DEFAULT 0,
        is_aerial   INTEGER DEFAULT 0,
        qty         INTEGER DEFAULT 0,
        unit        TEXT DEFAULT '',
        remark      TEXT DEFAULT '',
        FOREIGN KEY (report_id) REFERENCES splice_reports(id) ON DELETE CASCADE
      )
    `)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_splice_items ON splice_work_items(report_id)`)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS splice_unit_prices (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        item_key   TEXT NOT NULL UNIQUE,
        item_label TEXT NOT NULL,
        unit       TEXT DEFAULT '',
        unit_price INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0
      )
    `)
    // 한글 구버전 키 선제 삭제 (INSERT OR IGNORE 잔존 방지)
    ;['함체작업','중간분기','선번확인','광케이블코아접속','광케이블성단',
      '광탭작업','광탭중간분기','광커넥터현장조립','광탭결합고정',
      'FTTH레벨측정','신호수배치'
    ].forEach(k => { try { rawDb.prepare(`DELETE FROM splice_unit_prices WHERE item_key=?`).run(k) } catch(_){} })
    rawDb.exec(`
      INSERT OR IGNORE INTO splice_unit_prices (item_key, item_label, unit, unit_price, sort_order) VALUES
        ('b000001', '함체작업',              '개소', 0, 1),
        ('b000002', '중간분기',              '개소', 0, 2),
        ('b000003', '선번확인',              '개소', 0, 3),
        ('b000004', '광케이블 코아접속',      '코어', 0, 4),
        ('b000005', '광케이블 성단',          '코어', 0, 5),
        ('b000006', '광탭작업',              '개소', 0, 6),
        ('b000007', '광탭 중간분기',          '개소', 0, 7),
        ('b000008', '광커넥터 현장조립/취부', '개소', 0, 8),
        ('b000009', '광탭 결합/고정 작업',   '개소', 0, 9),
        ('b000010', 'FTTH 레벨 측정시험',    '코어', 0, 10),
        ('b000011', '신호수배치',            '건',   0, 11)
    `)
    console.log('[patchSchema] v0.132w 접속일보 테이블 준비 완료')
  } catch(e: any) {
    if (!e.message?.includes('already exists')) console.warn('[patchSchema v0.130w]', e.message)
  }

  // ── v0.133: tasks.created_by / sub_task_number 컬럼 (tasks.ts API 호환) ─────
  try {
    rawDb.exec(`ALTER TABLE tasks ADD COLUMN created_by INTEGER DEFAULT NULL`)
    console.log('[patchSchema] v0.133 tasks.created_by 컬럼 추가 완료')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.133]', e.message)
  }
  try {
    rawDb.exec(`ALTER TABLE tasks ADD COLUMN sub_task_number TEXT DEFAULT NULL`)
    console.log('[patchSchema] v0.133 tasks.sub_task_number 컬럼 추가 완료')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.133]', e.message)
  }

  // ── v0.133t: teams 테이블 (users.team_id JOIN 대응) ────────────────────────
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        description TEXT,
        is_active   INTEGER DEFAULT 1,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    rawDb.exec(`ALTER TABLE users ADD COLUMN team_id INTEGER DEFAULT NULL`)
    console.log('[patchSchema] v0.133t teams 테이블 / users.team_id 준비 완료')
  } catch(e: any) {
    if (!e.message?.includes('already exists') && !e.message?.includes('duplicate column'))
      console.warn('[patchSchema v0.133t]', e.message)
  }

  // ── v0.134: users.fcm_token 컬럼 추가 (Phase 2 — FCM 푸시 알림) ───────────
  // [RULE-002] var 사용 — patchSchema() 호출 이전 선언 불가 → duplicate column 무시
  try {
    rawDb.exec(`ALTER TABLE users ADD COLUMN fcm_token TEXT DEFAULT NULL`)
    console.log('[patchSchema] v0.134 users.fcm_token 컬럼 추가 완료')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column'))
      console.warn('[patchSchema v0.134]', e.message)
  }

  // ── v0.135: splice_unit_prices — 야간/가공 추가단가 컬럼 (함체작업 추가단가 지원) ──
  try {
    rawDb.exec(`ALTER TABLE splice_unit_prices ADD COLUMN night_price INTEGER DEFAULT 0`)
    console.log('[patchSchema] v0.135 splice_unit_prices.night_price 컬럼 추가 완료')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.135a]', e.message)
  }
  try {
    rawDb.exec(`ALTER TABLE splice_unit_prices ADD COLUMN aerial_price INTEGER DEFAULT 0`)
    console.log('[patchSchema] v0.135 splice_unit_prices.aerial_price 컬럼 추가 완료')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.135b]', e.message)
  }

  // ── v0.136: volume_unit_prices — unit 컬럼 추가 (외선 공종 단위 표시용) ──────
  try {
    rawDb.exec(`ALTER TABLE volume_unit_prices ADD COLUMN unit TEXT DEFAULT '식'`)
    console.log('[patchSchema] v0.136 volume_unit_prices.unit 컬럼 추가 완료')
    // 기존 항목 단위 일괄 업데이트 (영문 순차 키 기준)
    const unitMap: Record<string,string> = {
      'a000001':'M', 'a000002':'M', 'a000003':'M',
      'a000004':'M', 'a000005':'개', 'a000006':'M',
      'a000007':'본', 'a000008':'본', 'a000009':'건',
      'a000010':'건', 'a000011':'건', 'a000012':'본',
      'a000013':'M', 'a000014':'M', 'a000015':'식',
      'a000016':'본', 'a000017':'경간', 'a000018':'경간'
    }
    const updUnit = rawDb.prepare(`UPDATE volume_unit_prices SET unit=? WHERE item_key=? AND (unit IS NULL OR unit='식')`)
    for (const [k, u] of Object.entries(unitMap)) updUnit.run(u, k)
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.136]', e.message)
  }

  // ── v0.137: work_report_extras — unit_price_snapshot 컬럼 추가 (단가 불변 정책) ──
  // 일보 저장 시점의 단가를 스냅샷으로 보존 → 이후 단가 수정 시 기존 공량 금액 불변
  try {
    rawDb.exec(`ALTER TABLE work_report_extras ADD COLUMN unit_price_snapshot REAL DEFAULT NULL`)
    console.log('[patchSchema v0.137] work_report_extras.unit_price_snapshot 컬럼 추가 완료')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.137]', e.message)
  }

  // ── v0.140k: item_key 영문 순차 부여 마이그레이션 ────────────────────────────
  // 기존 DB의 한글·혼용 item_key를 영문 순차 키(a000001~, b000001~)로 일괄 변환
  // ※ 영문 키가 이미 존재하면 UPDATE(SKIP) → 한글 구키 행은 v0.141에서 DELETE
  try {
    const volMapping: [string, string][] = [
      ['cable_new',          'a000001'], ['cable_remove',      'a000002'], ['cable_move',         'a000003'],
      ['조가선신설',          'a000004'], ['커넥터취부',          'a000005'], ['조가선 철거',         'a000006'],
      ['전주 건식',           'a000007'], ['전주 철거',           'a000008'], ['B 형접지(대지)',      'a000009'],
      ['A 형접지(대지)',      'a000010'], ['지선신설',            'a000011'], ['전주세움',            'a000012'],
      ['가요전선관',          'a000013'], ['내관포설',            'a000014'], ['완금설치 (한전주)',    'a000015'],
      ['단순1',              'a000016'], ['단순1-2',            'a000017'], ['단순2',              'a000018'],
    ]
    for (const [oldKey, newKey] of volMapping) {
      // 영문 키 없으면 UPDATE, 있으면 SKIP (구 키는 v0.141에서 정리)
      rawDb.prepare(
        `UPDATE volume_unit_prices SET item_key=? WHERE item_key=? AND NOT EXISTS (SELECT 1 FROM volume_unit_prices WHERE item_key=?)`
      ).run(newKey, oldKey, newKey)
      // work_report_extras 스냅샷 키도 함께 변환
      rawDb.prepare(`UPDATE work_report_extras SET item_key=? WHERE item_key=?`).run(newKey, oldKey)
    }
    const spliceMapping: [string, string][] = [
      ['함체작업',        'b000001'], ['중간분기',          'b000002'], ['선번확인',          'b000003'],
      ['광케이블코아접속', 'b000004'], ['광케이블성단',       'b000005'], ['광탭작업',          'b000006'],
      ['광탭중간분기',    'b000007'], ['광커넥터현장조립',   'b000008'], ['광탭결합고정',       'b000009'],
      ['FTTH레벨측정',   'b000010'], ['신호수배치',         'b000011'],
    ]
    for (const [oldKey, newKey] of spliceMapping) {
      rawDb.prepare(
        `UPDATE splice_unit_prices SET item_key=? WHERE item_key=? AND NOT EXISTS (SELECT 1 FROM splice_unit_prices WHERE item_key=?)`
      ).run(newKey, oldKey, newKey)
    }
    console.log('[patchSchema v0.140k] item_key 영문 순차 마이그레이션 완료')
  } catch(e: any) {
    console.warn('[patchSchema v0.140k]', e.message)
  }

  // ── v0.141: 구버전 한글/혼용 키 잔존 행 완전 정리 ────────────────────────────
  // v0.140k에서 영문 키가 이미 존재해 UPDATE가 SKIP된 경우 구 키 행이 잔존함
  // → 영문 키가 존재하는 경우에만 구 키 행을 DELETE (데이터 중복 제거)
  try {
    // 외선: 구버전 키 목록 (한글 + 혼용 영문)
    const volOldKeys = [
      'cable_new', 'cable_remove', 'cable_move',
      '조가선신설', '커넥터취부', '조가선 철거', '전주 건식', '전주 철거',
      'B 형접지(대지)', 'A 형접지(대지)', '지선신설', '전주세움',
      '가요전선관', '내관포설', '완금설치 (한전주)', '단순1', '단순1-2', '단순2',
    ]
    // 영문 키(a000001~a000018) 중 하나라도 존재하면 구 키 전체 삭제
    const volHasNew = rawDb.prepare(
      `SELECT COUNT(*) as cnt FROM volume_unit_prices WHERE item_key LIKE 'a0%'`
    ).get() as { cnt: number }
    if (volHasNew.cnt > 0) {
      const placeholders = volOldKeys.map(() => '?').join(',')
      const deleted = rawDb.prepare(
        `DELETE FROM volume_unit_prices WHERE item_key IN (${placeholders})`
      ).run(...volOldKeys)
      if (deleted.changes > 0)
        console.log(`[patchSchema v0.141] volume_unit_prices 구 키 ${deleted.changes}건 삭제 완료`)
    }

    // 접속: 구버전 키 목록 (한글)
    const spliceOldKeys = [
      '함체작업', '중간분기', '선번확인', '광케이블코아접속', '광케이블성단',
      '광탭작업', '광탭중간분기', '광커넥터현장조립', '광탭결합고정',
      'FTTH레벨측정', '신호수배치',
    ]
    const spliceHasNew = rawDb.prepare(
      `SELECT COUNT(*) as cnt FROM splice_unit_prices WHERE item_key LIKE 'b0%'`
    ).get() as { cnt: number }
    if (spliceHasNew.cnt > 0) {
      const placeholders = spliceOldKeys.map(() => '?').join(',')
      const deleted = rawDb.prepare(
        `DELETE FROM splice_unit_prices WHERE item_key IN (${placeholders})`
      ).run(...spliceOldKeys)
      if (deleted.changes > 0)
        console.log(`[patchSchema v0.141] splice_unit_prices 구 키 ${deleted.changes}건 삭제 완료`)
    }

    console.log('[patchSchema v0.141] 구버전 키 정리 완료')
  } catch(e: any) {
    console.warn('[patchSchema v0.141]', e.message)
  }

  // 서버 시작 시 자동 생성 (CREATE INDEX IF NOT EXISTS → 이미 있으면 무시)
  ;(function addPerfIndexes() {
    const idxList: [string, string][] = [
      // 1. tasks: status + planned_date 복합 인덱스 (작업 목록 status/날짜 필터 조회 최적화)
      // ※ tasks 테이블에는 start_date 컬럼이 없음 — 올바른 컬럼은 planned_date
      ['idx_tasks_status_date',
       'CREATE INDEX IF NOT EXISTS idx_tasks_status_date ON tasks(status, planned_date)'],
      // 2. work_reports: work_date + task_id 복합 인덱스 (일보 날짜 범위 조회 최적화)
      ['idx_work_reports_date',
       'CREATE INDEX IF NOT EXISTS idx_work_reports_date ON work_reports(work_date, task_id)'],
      // 3. tbm_records: task_id + created_at 복합 인덱스 (작업별 TBM 목록 조회 최적화)
      ['idx_tbm_records_task',
       'CREATE INDEX IF NOT EXISTS idx_tbm_records_task ON tbm_records(task_id, created_at)'],
      // 4. notifications: user_id + is_read + created_at 복합 인덱스 (미읽음 알림 조회 최적화)
      ['idx_notifications_user_read',
       'CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at)'],
      // 5. signature_requests: target_user_id + status 복합 인덱스 (서명 대기 건수 배지 조회 최적화)
      ['idx_sig_req_target_status',
       'CREATE INDEX IF NOT EXISTS idx_sig_req_target_status ON signature_requests(target_user_id, status)'],
    ]
    let added = 0
    for (const [name, sql] of idxList) {
      try {
        rawDb.exec(sql)
        added++
      } catch(e: any) {
        // 이미 존재하거나 테이블 없는 경우 조용히 무시 (운영 중 안전)
        if (!e.message?.includes('already exists') && !e.message?.includes('no such table'))
          console.warn(`[patchSchema] 인덱스 ${name} 생성 실패:`, e.message)
      }
    }
    console.log(`[patchSchema] 성능 인덱스 ${added}/${idxList.length}개 적용 완료`)
  })()

  // ── [v0.142 LGU+] users.role CHECK 확장 + lgu_role_permissions 테이블 추가 ──────
  ;(function patchLguRole() {
    try {
      // ① users 테이블 role CHECK 확장: 'lgu' 값 허용 (테이블 재생성 방식)
      // SQLite는 ALTER TABLE로 CHECK 제약 수정 불가 → 테이블 재생성 필요
      // sub_role = 'lgu_plus' 방식도 유지하되, role='lgu' 방식을 추가로 지원
      const usersSchema = (rawDb.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get() as any)?.sql || ''
      if (!usersSchema.includes("'lgu'")) {
        console.log('[patchSchema v0.142] users.role CHECK에 lgu 추가 시작...')
        rawDb.pragma('foreign_keys = OFF')
        rawDb.exec(`BEGIN;
          CREATE TABLE IF NOT EXISTS users_new AS SELECT * FROM users WHERE 0;
          DROP TABLE users_new;
          CREATE TABLE users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'worker', 'lgu')),
            department TEXT,
            phone TEXT,
            position TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            company TEXT, blood_type TEXT, emergency_contact TEXT, health_info TEXT,
            edu_hire_date TEXT, edu_special_electric TEXT, edu_special_confined TEXT,
            edu_special_loading TEXT, edu_experience_date TEXT,
            team_id INTEGER REFERENCES teams(id),
            is_leader INTEGER DEFAULT 0, is_pending INTEGER DEFAULT 0,
            rejection_reason TEXT DEFAULT NULL, approved_by INTEGER DEFAULT NULL,
            approved_at DATETIME DEFAULT NULL, id_number TEXT,
            privacy_agreed INTEGER DEFAULT 0, privacy_agreed_at DATETIME,
            security_agreed INTEGER DEFAULT 0, security_agreed_at DATETIME,
            location_agreed INTEGER DEFAULT 0, location_agreed_at DATETIME,
            sub_role TEXT NOT NULL DEFAULT '', grade TEXT DEFAULT '',
            edu_periodic_date DATE, edu_job_change_date DATE,
            edu_special_date DATE, edu_supervisor_date DATE,
            fcm_token TEXT DEFAULT NULL
          );
          INSERT INTO users_new SELECT
            id, username, password_hash, name, role, department, phone, position,
            is_active, created_at, updated_at, company, blood_type, emergency_contact,
            health_info, edu_hire_date, edu_special_electric, edu_special_confined,
            edu_special_loading, edu_experience_date, team_id, is_leader, is_pending,
            rejection_reason, approved_by, approved_at, id_number,
            privacy_agreed, privacy_agreed_at, security_agreed, security_agreed_at,
            location_agreed, location_agreed_at, sub_role, grade,
            edu_periodic_date, edu_job_change_date, edu_special_date, edu_supervisor_date,
            COALESCE(fcm_token, NULL)
          FROM users;
          DROP TABLE users;
          ALTER TABLE users_new RENAME TO users;
          COMMIT;`)
        rawDb.pragma('foreign_keys = ON')
        console.log('[patchSchema v0.142] users.role CHECK 확장 완료 (lgu 추가)')
      } else {
        console.log('[patchSchema v0.142] users.role CHECK 이미 lgu 포함 (skip)')
      }
    } catch (e: any) {
      rawDb.pragma('foreign_keys = ON')
      console.error('[patchSchema v0.142] users 재생성 실패:', e.message)
    }

    // ② system_settings에 LGU+ 관련 기본값 추가
    try {
      rawDb.exec(`
        INSERT OR IGNORE INTO system_settings (key, value, label, description) VALUES
          ('lgu_menu_dashboard',        '1', 'LGU+ 메뉴: 작업현황',     'LGU+ 역할이 작업현황 메뉴를 볼 수 있으면 1'),
          ('lgu_menu_inspections',      '1', 'LGU+ 메뉴: 현장점검',     'LGU+ 역할이 현장점검 메뉴를 볼 수 있으면 1'),
          ('lgu_menu_site_map',         '1', 'LGU+ 메뉴: 현장위치지도', 'LGU+ 역할이 현장위치 지도 메뉴를 볼 수 있으면 1'),
          ('lgu_menu_constructions',    '0', 'LGU+ 메뉴: 공사현황',     'LGU+ 역할이 공사현황 메뉴를 볼 수 있으면 1'),
          ('lgu_menu_tasks',            '0', 'LGU+ 메뉴: 작업관리',     'LGU+ 역할이 작업관리 메뉴를 볼 수 있으면 1'),
          ('lgu_menu_stats',            '0', 'LGU+ 메뉴: 안전현황',     'LGU+ 역할이 안전현황 통계 메뉴를 볼 수 있으면 1'),
          ('lgu_notify_checklist_done', '1', 'LGU+ 알림: 체크리스트완료', 'LGU+ 대상 알림 — 체크리스트 완료 단계 (공사요청번호 자동부여 미체크 공사만 해당)'),
          ('lgu_notify_tbm_done',       '1', 'LGU+ 알림: TBM완료',      'LGU+ 대상 알림 — TBM 완료 단계 (공사요청번호 자동부여 미체크 공사만 해당)'),
          ('lgu_notify_working',        '1', 'LGU+ 알림: 작업중',       'LGU+ 대상 알림 — 작업중 단계 (공사요청번호 자동부여 미체크 공사만 해당)'),
          ('lgu_notify_work_completed', '1', 'LGU+ 알림: 작업완료',     'LGU+ 대상 알림 — 작업완료 단계 (공사요청번호 자동부여 미체크 공사만 해당)'),
          ('lgu_notify_completed',      '0', 'LGU+ 알림: 최종완료',     'LGU+ 대상 알림 — 최종완료 단계 (공사요청번호 자동부여 미체크 공사만 해당)'),
          ('lgu_notify_cancelled',      '0', 'LGU+ 알림: 취소',         'LGU+ 대상 알림 — 취소 단계 (공사요청번호 자동부여 미체크 공사만 해당)');
      `)
      console.log('[patchSchema v0.142] system_settings LGU+ 기본값 추가 완료')
    } catch (e: any) {
      console.warn('[patchSchema v0.142] system_settings LGU+ 추가 실패:', e.message)
    }

    // ③ lgu_role_permissions 테이블 생성 (확장 가능한 권한 구조)
    try {
      rawDb.exec(
        'CREATE TABLE IF NOT EXISTS lgu_role_permissions (' +
        '  id         INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '  perm_type  TEXT NOT NULL,' +
        '  perm_key   TEXT NOT NULL,' +
        '  perm_label TEXT NOT NULL DEFAULT \'\',' +
        '  is_enabled INTEGER NOT NULL DEFAULT 0,' +
        '  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,' +
        '  UNIQUE(perm_type, perm_key)' +
        ')'
      )
      console.log('[patchSchema v0.142] lgu_role_permissions 테이블 준비 완료')
    } catch (e: any) {
      if (!e.message?.includes('already exists')) console.warn('[patchSchema v0.142] lgu_role_permissions 생성 실패:', e.message)
    }
    try {
      rawDb.exec('CREATE INDEX IF NOT EXISTS idx_lgu_perms_type ON lgu_role_permissions(perm_type)')
    } catch (_) {}

    // ④ users.permissions 컬럼 추가 (auth.ts INSERT 호환 — NAS DB에 없을 경우 대비)
    try {
      rawDb.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL")
      console.log('[patchSchema v0.142] users.permissions 컬럼 추가 완료')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.142] users.permissions 컬럼:', e.message)
    }
  })()

  // ── [v0.143 LGU+ 재수정] constructions.is_auto_request_no 컬럼 추가 ──────────
  // "공사요청번호 자동부여" 체크박스 선택 여부를 DB에 저장
  // LGU+ 역할은 is_auto_request_no=1인 공사/작업에 접근 불가 (알림·조회 모두 차단)
  ;(function patchConstructionsAutoReqNo() {
    try {
      rawDb.exec("ALTER TABLE constructions ADD COLUMN is_auto_request_no INTEGER NOT NULL DEFAULT 0")
      console.log('[patchSchema v0.143] constructions.is_auto_request_no 컬럼 추가 완료')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.143] constructions.is_auto_request_no:', e.message)
    }
    // [v0.143] system_settings lgu_notify_* description 전체 업데이트
    // v0.142에서 '(request_no 1로 시작)' 잘못된 설명 → '공사요청번호 자동부여 체크 공사만 해당'으로 교정
    try {
      const lguNotifyDescs: Record<string, string> = {
        'lgu_notify_checklist_done': 'LGU+ 대상 알림 — 체크리스트 완료 단계 (공사요청번호 자동부여 미체크 공사만 해당)',
        'lgu_notify_tbm_done':       'LGU+ 대상 알림 — TBM 완료 단계 (공사요청번호 자동부여 미체크 공사만 해당)',
        'lgu_notify_working':        'LGU+ 대상 알림 — 작업중 단계 (공사요청번호 자동부여 미체크 공사만 해당)',
        'lgu_notify_work_completed': 'LGU+ 대상 알림 — 작업완료 단계 (공사요청번호 자동부여 미체크 공사만 해당)',
        'lgu_notify_completed':      'LGU+ 대상 알림 — 최종완료 단계 (공사요청번호 자동부여 미체크 공사만 해당)',
        'lgu_notify_cancelled':      'LGU+ 대상 알림 — 취소 단계 (공사요청번호 자동부여 미체크 공사만 해당)',
      }
      const updateDesc = rawDb.prepare(`UPDATE system_settings SET description = ? WHERE key = ?`)
      for (const [k, v] of Object.entries(lguNotifyDescs)) {
        updateDesc.run(v, k)
      }
      console.log('[patchSchema v0.143] system_settings lgu_notify_* description 교정 완료')
    } catch (_) {}

    // ── [v0.144 BUG-038] LGU+ 계정 sub_role 누락 자동 복구 ─────────────────────
    // 자가가입 버그로 인해 LGU+ 계정이 position='LGU+'이고 sub_role=''인 경우
    // sub_role='lgu_plus' 자동 보정 → 알림 발송 쿼리 (sub_role='lgu_plus') 에 포함
    try {
      const fixed = rawDb.prepare(
        `UPDATE users SET sub_role='lgu_plus'
         WHERE position='LGU+' AND (sub_role='' OR sub_role IS NULL) AND is_active=1`
      ).run()
      if (fixed.changes > 0) {
        console.log(`[patchSchema v0.144] LGU+ sub_role 누락 계정 ${fixed.changes}개 자동 복구 (position='LGU+' → sub_role='lgu_plus')`)
      }
    } catch(e: any) { console.warn('[patchSchema v0.144] LGU+ sub_role 복구 실패(무시):', e.message) }

  // ── [v0.145 FEAT-027] group_permissions 테이블 생성 + 그룹별 기본 권한값 ──────
  // 그룹(역할)별 권한을 DB에서 관리 — 코드 하드코딩 제거
  // 권한 키:
  //   notify_own_task  : 본인 작업 알림 수신
  //   notify_all_tasks : 전체 작업 알림 수신
  //   notify_lgu_tasks : LGU+ 대상 작업 알림 (is_auto_request_no=0 공사)
  //   view_all_tasks   : 전체 작업 조회
  //   edit_task        : 작업 수정
  //   sign_tbm         : TBM 결재 서명 권한
  ;(function patchV0145() {
    try {
      rawDb.exec(`
        CREATE TABLE IF NOT EXISTS group_permissions (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          group_key  TEXT NOT NULL,
          perm_key   TEXT NOT NULL,
          perm_label TEXT NOT NULL DEFAULT '',
          is_enabled INTEGER NOT NULL DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(group_key, perm_key)
        )
      `)
      rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_grp_perm ON group_permissions(group_key)`)
      console.log('[patchSchema v0.145] group_permissions 테이블 준비 완료')
    } catch(e: any) {
      if (!e.message?.includes('already exists')) console.warn('[patchSchema v0.145] group_permissions 생성 실패:', e.message)
    }

    // 그룹별 기본 권한값 삽입 (기존 값 유지 — INSERT OR IGNORE)
    const defaults: Array<[string, string, string, number]> = [
      // [group_key, perm_key, perm_label, is_enabled]
      // ── 근로자 ──
      ['worker',   'notify_own_task',  '본인 작업 알림 수신',           1],
      ['worker',   'view_all_tasks',   '전체 작업 조회',                 0],
      ['worker',   'notify_all_tasks', '전체 작업 알림 수신',            0],
      ['worker',   'edit_task',        '작업 수정',                     0],
      ['worker',   'sign_tbm',         'TBM 결재 서명',                  0],
      ['worker',   'notify_lgu_tasks', 'LGU+ 대상 작업 알림',           0],
      // ── 공무 ──
      ['engineer', 'notify_own_task',  '본인 작업 알림 수신',            0],
      ['engineer', 'notify_all_tasks', '전체 작업 알림 수신',            1],
      ['engineer', 'view_all_tasks',   '전체 작업 조회',                 1],
      ['engineer', 'edit_task',        '작업 수정',                     1],
      ['engineer', 'sign_tbm',         'TBM 결재 서명',                  0],
      ['engineer', 'notify_lgu_tasks', 'LGU+ 대상 작업 알림',           0],
      // ── 안전관리자 ──
      ['safety',   'notify_own_task',  '본인 작업 알림 수신',            0],
      ['safety',   'notify_all_tasks', '전체 작업 알림 수신',            1],
      ['safety',   'view_all_tasks',   '전체 작업 조회',                 1],
      ['safety',   'edit_task',        '작업 수정',                     1],
      ['safety',   'sign_tbm',         'TBM 결재 서명',                  1],
      ['safety',   'notify_lgu_tasks', 'LGU+ 대상 작업 알림',           0],
      // ── 현장대리인 ──
      ['site_rep', 'notify_own_task',  '본인 작업 알림 수신',            0],
      ['site_rep', 'notify_all_tasks', '전체 작업 알림 수신',            1],
      ['site_rep', 'view_all_tasks',   '전체 작업 조회',                 1],
      ['site_rep', 'edit_task',        '작업 수정',                     1],
      ['site_rep', 'sign_tbm',         'TBM 결재 서명',                  1],
      ['site_rep', 'notify_lgu_tasks', 'LGU+ 대상 작업 알림',           0],
      // ── CEO ──
      ['ceo',      'notify_own_task',  '본인 작업 알림 수신',            0],
      ['ceo',      'notify_all_tasks', '전체 작업 알림 수신',            1],
      ['ceo',      'view_all_tasks',   '전체 작업 조회',                 1],
      ['ceo',      'edit_task',        '작업 수정',                     1],
      ['ceo',      'sign_tbm',         'TBM 결재 서명',                  1],
      ['ceo',      'notify_lgu_tasks', 'LGU+ 대상 작업 알림',           0],
      // ── LGU+ ──
      ['lgu_plus', 'notify_own_task',  '본인 작업 알림 수신',            0],
      ['lgu_plus', 'notify_all_tasks', '전체 작업 알림 수신',            0],
      ['lgu_plus', 'notify_lgu_tasks', 'LGU+ 대상 작업 알림 수신',      1],
      ['lgu_plus', 'view_all_tasks',   '전체 작업 조회',                 0],
      ['lgu_plus', 'edit_task',        '작업 수정 (열람 전용 — 비활성)', 0],
      ['lgu_plus', 'sign_tbm',         'TBM 결재 서명',                  0],
    ]
    const insStmt = rawDb.prepare(
      `INSERT OR IGNORE INTO group_permissions (group_key, perm_key, perm_label, is_enabled)
       VALUES (?, ?, ?, ?)`
    )
    for (const row of defaults) insStmt.run(...row)
    console.log('[patchSchema v0.145] group_permissions 기본값 삽입 완료')
  })()
  })()

  // ── [v0.146 BUG-042] site_inspections 결과 컬럼 + inspection_workers 테이블 ──
  // inspection_result, result_reason 컬럼이 NAS 구버전 DB에 없어 POST /api/inspections 500 발생
  safeAlter(`ALTER TABLE site_inspections ADD COLUMN inspection_result TEXT NOT NULL DEFAULT 'none'`)
  safeAlter(`ALTER TABLE site_inspections ADD COLUMN result_reason     TEXT NOT NULL DEFAULT ''`)
  safeAlter(`ALTER TABLE site_inspections ADD COLUMN updated_at        DATETIME`)
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS inspection_workers (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        inspection_id INTEGER NOT NULL,
        worker_id     INTEGER NOT NULL,
        result_type   TEXT    NOT NULL DEFAULT '',
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inspection_id) REFERENCES site_inspections(id) ON DELETE CASCADE,
        FOREIGN KEY (worker_id)     REFERENCES users(id),
        UNIQUE(inspection_id, worker_id)
      )
    `)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_ins_workers_ins ON inspection_workers(inspection_id)`)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_ins_workers_usr ON inspection_workers(worker_id)`)
    console.log('[patchSchema v0.146] inspection_workers 테이블 및 site_inspections 결과 컬럼 준비 완료')
  } catch(e: any) {
    if (!e.message?.includes('already exists')) console.warn('[patchSchema v0.146] inspection_workers 생성 실패:', e.message)
  }

  // ── [v0.147 BUG-045-2] inspection_workers FK site_inspections_old → site_inspections 수정 ──
  // v0.146에서 CREATE TABLE IF NOT EXISTS 로 생성했으나,
  // 이미 DB에 site_inspections_old 를 참조하는 잘못된 FK의 inspection_workers 가 존재하면
  // IF NOT EXISTS 조건으로 인해 재생성이 건너뛰어짐 → INSERT 시 FK 오류 → 저장 실패
  try {
    const iwSql: any = rawDb.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='inspection_workers'"
    ).get()
    if (iwSql?.sql?.includes('site_inspections_old')) {
      console.log('[patchSchema v0.147] inspection_workers FK 오류 감지 — 재생성 시작')
      rawDb.pragma('foreign_keys = OFF')
      const fixIW = rawDb.transaction(() => {
        // 기존 데이터 백업
        const existing: any[] = rawDb.prepare('SELECT * FROM inspection_workers').all()
        // 인덱스 삭제
        rawDb.exec('DROP INDEX IF EXISTS idx_ins_workers_ins')
        rawDb.exec('DROP INDEX IF EXISTS idx_ins_workers_usr')
        // 테이블 삭제 후 올바른 FK로 재생성
        rawDb.exec('DROP TABLE inspection_workers')
        rawDb.exec(`
          CREATE TABLE inspection_workers (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            inspection_id INTEGER NOT NULL,
            worker_id     INTEGER NOT NULL,
            result_type   TEXT    NOT NULL DEFAULT '',
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (inspection_id) REFERENCES site_inspections(id) ON DELETE CASCADE,
            FOREIGN KEY (worker_id)     REFERENCES users(id),
            UNIQUE(inspection_id, worker_id)
          )
        `)
        rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_ins_workers_ins ON inspection_workers(inspection_id)`)
        rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_ins_workers_usr ON inspection_workers(worker_id)`)
        // 유효한 데이터만 복원 (site_inspections 에 실제 존재하는 inspection_id만)
        if (existing.length > 0) {
          const validIds = new Set(
            (rawDb.prepare('SELECT id FROM site_inspections').all() as any[]).map((r: any) => r.id)
          )
          const ins = rawDb.prepare(
            `INSERT OR IGNORE INTO inspection_workers (id, inspection_id, worker_id, result_type, created_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          let restored = 0
          for (const r of existing) {
            if (validIds.has(r.inspection_id)) {
              ins.run(r.id, r.inspection_id, r.worker_id, r.result_type || '', r.created_at)
              restored++
            }
          }
          console.log(`[patchSchema v0.147] 기존 데이터 ${restored}/${existing.length}건 복원`)
        }
      })
      fixIW()
      rawDb.pragma('foreign_keys = ON')
      console.log('[patchSchema v0.147] inspection_workers FK 재생성 완료 (site_inspections 참조)')
    } else {
      console.log('[patchSchema v0.147] inspection_workers FK 정상 — 재생성 불필요')
    }
  } catch(e: any) {
    rawDb.pragma('foreign_keys = ON')
    console.warn('[patchSchema v0.147] inspection_workers FK 수정 실패:', e.message)
  }

  // ── [v0.148 FEAT-045/046] work_categories + work_types + risk_assessment_items 테이블 생성 ──
  // FEAT-045(엑셀 업/다운) + FEAT-046(분류별 항목 관리) 에서 사용
  // NAS autoMigrate에 누락되어 API 404 / 서버 crash 발생 → 여기서 보완
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS work_categories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS work_types (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name        TEXT    NOT NULL,
        code        TEXT,
        description TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES work_categories(id)
      )
    `)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS risk_assessment_items (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        work_type_id        INTEGER NOT NULL,
        category            TEXT    DEFAULT '',
        hazard              TEXT    NOT NULL,
        risk_factor         TEXT    DEFAULT '',
        before_frequency    INTEGER DEFAULT 1,
        before_severity     INTEGER DEFAULT 1,
        before_risk_level   TEXT    DEFAULT '낮음',
        control_measures    TEXT    DEFAULT '',
        after_frequency     INTEGER DEFAULT 1,
        after_severity      INTEGER DEFAULT 1,
        after_risk_level    TEXT    DEFAULT '낮음',
        responsible         TEXT    DEFAULT '관리감독자',
        note                TEXT    DEFAULT '',
        is_active           INTEGER DEFAULT 1,
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_type_id) REFERENCES work_types(id)
      )
    `)
    // 인덱스
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_rai_work_type_id ON risk_assessment_items(work_type_id)`)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_rai_is_active    ON risk_assessment_items(is_active)`)
    console.log('[patchSchema v0.148] work_categories/work_types/risk_assessment_items 테이블 준비 완료')
  } catch(e: any) {
    console.warn('[patchSchema v0.148] 테이블 생성 실패 (무시):', e.message)
  }

  // ── [v0.149 BUG-075] risk_assessment_items 컬럼 누락 보완 ──────────────────
  // v0.148에서 CREATE TABLE IF NOT EXISTS 로 생성하지만,
  // 기존에 다른 스키마로 생성된 테이블이 있으면 IF NOT EXISTS는 아무것도 안 함
  // → safeAlter 로 누락 컬럼 개별 추가 보장
  try {
    const _safeAlt = (sql: string) => {
      try { rawDb.exec(sql) } catch(e: any) {
        if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.149]', e.message)
      }
    }
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN risk_factor TEXT DEFAULT ''`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN before_frequency INTEGER DEFAULT 1`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN before_severity INTEGER DEFAULT 1`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN before_risk_level TEXT DEFAULT '낮음'`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN control_measures TEXT DEFAULT ''`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN after_frequency INTEGER DEFAULT 1`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN after_severity INTEGER DEFAULT 1`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN after_risk_level TEXT DEFAULT '낮음'`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN responsible TEXT DEFAULT '관리감독자'`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN note TEXT DEFAULT ''`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN is_active INTEGER DEFAULT 1`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN category TEXT DEFAULT ''`)
    _safeAlt(`ALTER TABLE risk_assessment_items ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`)
    console.log('[patchSchema v0.149] risk_assessment_items 컬럼 보완 완료')
  } catch(e: any) {
    console.warn('[patchSchema v0.149] 컬럼 보완 실패 (무시):', e.message)
  }

  // ── [v0.151 BUG-076] risk_assessment_items 클린 리셋 — reset_risk_master_data.sql 자동 실행 ──
  // NAS DB에 잘못된(구버전) work_categories/work_types/risk_assessment_items가 있을 경우
  // reset_risk_master_data.sql 로 완전 교체한다.
  // 정상 기준: work_categories 9건 && MIN(id)=9, work_types 18건 && MIN(id)=17, items>=700
  try {
    const hasItems = (rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='risk_assessment_items'").get() as any)
    const hasTypes = (rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_types'").get() as any)
    const hasCats  = (rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_categories'").get() as any)
    if (hasItems && hasTypes && hasCats) {
      // ① categories 체크 — 개발 DB 기준: 9건, MIN(id)=9 (NAS 구버전은 id=1부터 시작)
      const catCount  = (rawDb.prepare('SELECT COUNT(*) as c FROM work_categories').get() as any).c
      const minCatId  = (rawDb.prepare('SELECT MIN(id) as m FROM work_categories').get() as any)?.m ?? 0
      // ② types 체크 — 개발 DB 기준: 18건, MIN(id)=17
      const typeCount = (rawDb.prepare('SELECT COUNT(*) as c FROM work_types').get() as any).c
      const minTypeId = (rawDb.prepare('SELECT MIN(id) as m FROM work_types').get() as any)?.m ?? 0
      // ③ items 체크
      const itemCount = (rawDb.prepare('SELECT COUNT(*) as c FROM risk_assessment_items').get() as any).c
      // 정상 조건: categories 9건이며 id가 9부터 시작, types 18건이며 id가 17부터 시작, items 700+
      const isClean = (catCount === 9 && minCatId === 9 && typeCount === 18 && minTypeId === 17 && itemCount >= 700)
      console.log(`[patchSchema v0.151] 상태 — cats:${catCount}(min=${minCatId}) types:${typeCount}(min=${minTypeId}) items:${itemCount} isClean:${isClean}`)
      if (!isClean) {
        // SQL 파일 위치: 서버 파일과 같은 디렉토리 (process.cwd() 및 절대경로 모두 시도)
        const cwd = process.cwd()
        const scriptDir = (() => { try { return dirname(fileURLToPath(import.meta.url)) } catch(_) { return cwd } })()
        const candidates = [
          join(cwd, 'reset_risk_master_data.sql'),
          join(scriptDir, 'reset_risk_master_data.sql'),
          '/volume1/safetynote/reset_risk_master_data.sql'
        ]
        const sqlPath = candidates.find(p => existsSync(p)) ?? null
        if (sqlPath) {
          console.log(`[patchSchema v0.151] 비정상 데이터 감지 — cats:${catCount}(min=${minCatId}) types:${typeCount}(min=${minTypeId}) items:${itemCount} — 클린 리셋 시작: ${sqlPath}`)
          const sql = readFileSync(sqlPath, 'utf-8')
          rawDb.exec(sql)
          const afterCats  = (rawDb.prepare('SELECT COUNT(*) as c FROM work_categories').get() as any).c
          const afterTypes = (rawDb.prepare('SELECT COUNT(*) as c FROM work_types').get() as any).c
          const afterItems = (rawDb.prepare('SELECT COUNT(*) as c FROM risk_assessment_items').get() as any).c
          console.log(`[patchSchema v0.151] ✅ 클린 리셋 완료 — categories:${afterCats} types:${afterTypes} items:${afterItems}`)
        } else {
          console.warn(`[patchSchema v0.151] ⚠️ reset_risk_master_data.sql 없음 — 탐색 경로: ${candidates.join(', ')} — git pull 후 pm2 restart 필요`)
        }
      } else {
        console.log(`[patchSchema v0.151] ✅ 정상 데이터 확인 — 리셋 생략`)
      }
    }
  } catch(e: any) {
    console.warn('[patchSchema v0.151] 클린 리셋 실패 (무시):', e.message)
  }

  // ── v0.152: risk_assessment_details + risk_assessment_members FK 수정 ────────
  // 0029 마이그레이션에서 risk_assessments 재생성 시 연관 테이블들의 FK가
  // "risk_assessments_old"를 참조한 채로 남아
  // INSERT/DELETE 시 "D1_ERROR: no such table: main.risk_assessments_old" 발생
  const _fixFkTargets: Array<{
    name: string
    newDdlFn: (extra: string) => string
    baseCols: string[]
    indexSql?: string
  }> = [
    {
      name: 'risk_assessment_details',
      newDdlFn: (extra) => `
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
          ${extra ? ',\n' + extra : ''}
          , FOREIGN KEY (assessment_id) REFERENCES risk_assessments(id)
          , FOREIGN KEY (item_id)       REFERENCES risk_assessment_items(id)
        )`,
      baseCols: ['id','assessment_id','item_id','category','hazard','risk_factor',
        'before_frequency','before_severity','before_risk_level','control_measures',
        'after_frequency','after_severity','after_risk_level','is_confirmed',
        'final_severity','final_risk_level','is_final','member_measures','final_frequency'],
      indexSql: 'CREATE INDEX IF NOT EXISTS idx_rad_assessment_id ON risk_assessment_details(assessment_id)',
    },
    {
      name: 'risk_assessment_members',
      newDdlFn: (extra) => `
        CREATE TABLE risk_assessment_members_new (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
          user_id       INTEGER NOT NULL REFERENCES users(id),
          role          TEXT    DEFAULT 'member',
          assigned_at   DATETIME DEFAULT CURRENT_TIMESTAMP
          ${extra ? ',\n' + extra : ''}
          , UNIQUE(assessment_id, user_id)
        )`,
      baseCols: ['id','assessment_id','user_id','role','assigned_at'],
      indexSql: 'CREATE INDEX IF NOT EXISTS idx_ram_assessment_id ON risk_assessment_members(assessment_id)',
    },
  ]

  for (const tgt of _fixFkTargets) {
    try {
      const tgtSql = (rawDb.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tgt.name}'`).get() as any)?.sql || ''
      if (!tgtSql.includes('risk_assessments_old')) {
        console.log(`[patchSchema v0.152] ${tgt.name} FK 정상 — 재생성 불필요`)
        continue
      }
      console.log(`[patchSchema v0.152] ${tgt.name} FK 오류 감지 — 재생성 시작`)
      rawDb.exec('PRAGMA foreign_keys = OFF')
      const tgtCols: any[] = rawDb.prepare(`PRAGMA table_info(${tgt.name})`).all() as any[]
      const tgtColNames = tgtCols.map((r: any) => r.name)
      const extraCols = tgtColNames.filter((c: string) => !tgt.baseCols.includes(c))
      const extraDefs = extraCols.map((c: string) => `  ${c} TEXT`).join(',\n')

      rawDb.exec(`DROP TABLE IF EXISTS ${tgt.name}_new`)
      rawDb.exec(tgt.newDdlFn(extraDefs))

      const copyList = tgtColNames.join(', ')
      rawDb.exec(`INSERT INTO ${tgt.name}_new (${copyList}) SELECT ${copyList} FROM ${tgt.name}`)
      rawDb.exec(`DROP TABLE ${tgt.name}`)
      rawDb.exec(`ALTER TABLE ${tgt.name}_new RENAME TO ${tgt.name}`)
      if (tgt.indexSql) rawDb.exec(tgt.indexSql)
      rawDb.exec('PRAGMA foreign_keys = ON')
      console.log(`[patchSchema v0.152] ${tgt.name} FK 재생성 완료`)
    } catch(e: any) {
      console.warn(`[patchSchema v0.152] ${tgt.name} FK 수정 실패 (무시):`, e.message)
      try { rawDb.exec('PRAGMA foreign_keys = ON') } catch(_) {}
    }
  }

  // ── [v0.153 FIX-050] 누락 컬럼 강제 확인 — PRAGMA table_info 직접 조회 ────────
  // v0.149 ALTER가 NAS에서 실행됐음에도 note 컬럼 없는 경우 대비
  // (v0.151 클린 리셋이 DELETE/INSERT만 하고 컬럼 구조는 건드리지 않지만
  //  만약 v0.149 실행 전 서버가 크래시됐거나, 특정 NAS 상태에서 스킵된 경우 커버)
  try {
    // ① risk_assessment_items.note 컬럼 강제 확인
    const raiCols = (rawDb.prepare(`PRAGMA table_info(risk_assessment_items)`).all() as any[]).map((r: any) => r.name)
    if (!raiCols.includes('note')) {
      rawDb.exec(`ALTER TABLE risk_assessment_items ADD COLUMN note TEXT DEFAULT ''`)
      console.log('[patchSchema v0.153] ✅ risk_assessment_items.note 컬럼 추가 완료 (FIX-050)')
    } else {
      console.log('[patchSchema v0.153] risk_assessment_items.note 컬럼 이미 존재 — 생략')
    }
    // ② risk_assessment_items.category 컬럼도 동일하게 확인 (FEAT-047 방어)
    if (!raiCols.includes('category')) {
      rawDb.exec(`ALTER TABLE risk_assessment_items ADD COLUMN category TEXT DEFAULT ''`)
      console.log('[patchSchema v0.153] ✅ risk_assessment_items.category 컬럼 추가 완료')
    }
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.153] risk_assessment_items 컬럼 확인 실패 (무시):', e.message)
  }

  try {
    // ③ task_stops.notes 컬럼 강제 확인
    const tsCols = (rawDb.prepare(`PRAGMA table_info(task_stops)`).all() as any[]).map((r: any) => r.name)
    if (!tsCols.includes('notes')) {
      rawDb.exec(`ALTER TABLE task_stops ADD COLUMN notes TEXT DEFAULT NULL`)
      console.log('[patchSchema v0.153] ✅ task_stops.notes 컬럼 추가 완료 (FIX-050)')
    } else {
      console.log('[patchSchema v0.153] task_stops.notes 컬럼 이미 존재 — 생략')
    }
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.153] task_stops 컬럼 확인 실패 (무시):', e.message)
  }
  // ── [v0.154 FEAT-048] LGU+ 역할 단일화: role='lgu' → role='lgu_plus' ─────────
  // role='lgu' 방식을 완전히 제거하고 role='lgu_plus' 단일 역할로 통일
  // ① users 테이블 role CHECK에 'lgu_plus' 추가 (테이블 재생성, better-sqlite3 안전 방식)
  // ② 기존 role='lgu' 데이터를 role='lgu_plus'로 일괄 마이그레이션
  // ③ sub_role='lgu_plus' + role='worker' 방식도 role='lgu_plus'로 통일
  // [BUG-081 fix] rawDb.exec() 다중 DDL → 개별 실행 방식으로 변경 (better-sqlite3 호환)
  ;(function patchLguPlusUnify() {
    try {
      const usersSchema = (rawDb.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get() as any)?.sql || ''
      // role CHECK에 'lgu_plus' 가 없으면 테이블 재생성
      if (!usersSchema.includes("'lgu_plus'")) {
        console.log('[patchSchema v0.154] users.role CHECK에 lgu_plus 추가 — 테이블 재생성 시작')
        rawDb.pragma('foreign_keys = OFF')
        try {
          // 이전 실패 잔여물 정리
          rawDb.exec(`DROP TABLE IF EXISTS users_v154`)
          // 새 스키마로 임시 테이블 생성 (개별 실행 — better-sqlite3 안전 방식)
          rawDb.exec(`CREATE TABLE users_v154 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'worker', 'lgu', 'lgu_plus')),
            department TEXT,
            phone TEXT,
            position TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            company TEXT, blood_type TEXT, emergency_contact TEXT, health_info TEXT,
            edu_hire_date TEXT, edu_special_electric TEXT, edu_special_confined TEXT,
            edu_special_loading TEXT, edu_experience_date TEXT,
            team_id INTEGER REFERENCES teams(id),
            is_leader INTEGER DEFAULT 0, is_pending INTEGER DEFAULT 0,
            rejection_reason TEXT DEFAULT NULL, approved_by INTEGER DEFAULT NULL,
            approved_at DATETIME DEFAULT NULL, id_number TEXT,
            privacy_agreed INTEGER DEFAULT 0, privacy_agreed_at DATETIME,
            security_agreed INTEGER DEFAULT 0, security_agreed_at DATETIME,
            location_agreed INTEGER DEFAULT 0, location_agreed_at DATETIME,
            sub_role TEXT NOT NULL DEFAULT '', grade TEXT DEFAULT '',
            edu_periodic_date DATE, edu_job_change_date DATE,
            edu_special_date DATE, edu_supervisor_date DATE,
            fcm_token TEXT DEFAULT NULL,
            permissions TEXT DEFAULT NULL
          )`)
          // 데이터 복사 (트랜잭션으로 안전하게)
          const copyTx = rawDb.transaction(() => {
            rawDb.exec(`INSERT INTO users_v154 SELECT
              id, username, password_hash, name,
              CASE WHEN role='lgu' THEN 'lgu_plus' ELSE role END,
              department, phone, position, is_active, created_at, updated_at,
              company, blood_type, emergency_contact, health_info,
              edu_hire_date, edu_special_electric, edu_special_confined,
              edu_special_loading, edu_experience_date, team_id, is_leader, is_pending,
              rejection_reason, approved_by, approved_at, id_number,
              privacy_agreed, privacy_agreed_at, security_agreed, security_agreed_at,
              location_agreed, location_agreed_at, sub_role, grade,
              edu_periodic_date, edu_job_change_date, edu_special_date, edu_supervisor_date,
              fcm_token, permissions
            FROM users`)
            rawDb.exec(`DROP TABLE users`)
            rawDb.exec(`ALTER TABLE users_v154 RENAME TO users`)
          })
          copyTx()
          rawDb.pragma('foreign_keys = ON')
          console.log('[patchSchema v0.154] ✅ users 재생성 완료 (lgu_plus 추가)')
        } catch (innerErr: any) {
          // 재생성 실패 시 임시 테이블 정리 후 foreign_keys 복원
          try { rawDb.exec(`DROP TABLE IF EXISTS users_v154`) } catch(_) {}
          rawDb.pragma('foreign_keys = ON')
          console.error('[patchSchema v0.154] users 재생성 실패 (무시, 구버전 유지):', innerErr.message)
        }
      } else {
        console.log('[patchSchema v0.154] users.role CHECK에 이미 lgu_plus 포함 — 재생성 생략')
      }

      // ② role='lgu' → role='lgu_plus' 데이터 마이그레이션 (재생성 성공 여부와 무관하게 실행)
      // CHECK 제약이 아직 없어도 실행 — 이미 'lgu_plus' CHECK가 있는 경우에만 유효
      try {
        const migrated = rawDb.prepare(`UPDATE users SET role='lgu_plus' WHERE role='lgu'`).run()
        if (migrated.changes > 0) {
          console.log(`[patchSchema v0.154] ✅ role='lgu' → 'lgu_plus' 마이그레이션 ${migrated.changes}건 완료`)
        }
      } catch (_) {}

      // ③ sub_role='lgu_plus' + role='worker' 방식 → role='lgu_plus', sub_role='' 통일
      try {
        const unified = rawDb.prepare(
          `UPDATE users SET role='lgu_plus', sub_role='' WHERE sub_role='lgu_plus' AND role='worker'`
        ).run()
        if (unified.changes > 0) {
          console.log(`[patchSchema v0.154] ✅ sub_role='lgu_plus'+role='worker' → role='lgu_plus' 통일 ${unified.changes}건 완료`)
        }
      } catch (_) {}

      // ④ group_permissions 테이블 lgu_plus 그룹 권한 갱신 (이미 있으면 유지)
      try {
        rawDb.prepare(
          `INSERT OR IGNORE INTO group_permissions (group_key, perm_key, perm_label, default_val)
           VALUES ('lgu_plus','notify_lgu_tasks','LGU+ 대상 작업 알림 수신',1)`
        ).run()
      } catch(_) {}

    } catch (e: any) {
      rawDb.pragma('foreign_keys = ON')
      console.error('[patchSchema v0.154] LGU+ 단일화 실패 (무시):', e.message)
    }
  })()

  // ── [v0.155 BUG-082] LGU+ 메뉴 기본값 활성화: tasks/stats '0'→'1' ────────────
  // [BUG-082] LGU+ 계정이 /admin/settings(관리자 전용)에 접근 불가해서
  // lgu_menu_tasks, lgu_menu_stats 설정값을 읽지 못함.
  // 실사용 환경에서는 작업관리·작업통계가 LGU+ 필수 메뉴이므로 기본값 '1'로 교정.
  ;(function patchLguMenuDefaults() {
    try {
      const checkRow = rawDb.prepare(
        `SELECT value FROM system_settings WHERE key='lgu_menu_tasks'`
      ).get() as { value: string } | undefined
      if (checkRow && checkRow.value === '0') {
        rawDb.prepare(`UPDATE system_settings SET value='1' WHERE key='lgu_menu_tasks'`).run()
        rawDb.prepare(`UPDATE system_settings SET value='1' WHERE key='lgu_menu_stats'`).run()
        console.log('[patchSchema v0.155] ✅ lgu_menu_tasks/stats 기본값 0→1 업데이트 완료')
      } else {
        console.log('[patchSchema v0.155] lgu_menu_tasks/stats 기본값 이미 활성 — 스킵')
      }
    } catch (e: any) {
      console.warn('[patchSchema v0.155] lgu_menu 기본값 교정 실패 (무시):', e.message)
    }
  })()
  // ── [v0.156 FEAT-055] 교육 점심시간 제외 여부 컬럼 추가 ──────────────────────
  // lunch_break: 1=점심시간(12~13시) 제외 적용, 0=미적용(기본값)
  try {
    rawDb.exec(`ALTER TABLE safety_education_sessions ADD COLUMN lunch_break INTEGER DEFAULT 0`)
    console.log('[patchSchema v0.156] ✅ safety_education_sessions.lunch_break 컬럼 추가')
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.156] lunch_break 컬럼 추가 실패 (무시):', e.message)
    else console.log('[patchSchema v0.156] lunch_break 컬럼 이미 존재 — 생략')
  }
  // ── [v0.157 FEAT-060] 교육 결재 서명 테이블 생성 ─────────────────────────────
  // safety_education_approvals: 안전보건교육 결재란 서명 (안전관리자→총괄책임 2단계)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS safety_education_approvals (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    INTEGER NOT NULL REFERENCES safety_education_sessions(id) ON DELETE CASCADE,
      role          TEXT    NOT NULL,
      user_id       INTEGER REFERENCES users(id),
      user_name     TEXT    NOT NULL DEFAULT '',
      user_position TEXT    DEFAULT '',
      sign_method   TEXT    DEFAULT 'pad',
      sign_data     TEXT,
      signed_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, role)
    )
  `)
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_edu_appr_session ON safety_education_approvals(session_id)`)
  console.log('[patchSchema v0.157] ✅ safety_education_approvals 테이블 준비 완료')

  // ── [v0.158 BUG-071] constructions 신규 컬럼 자동 추가 ───────────────────────
  // 마이그레이션 0056: completion_date  (공사완료예정일)
  // 마이그레이션 0057: notification_date  (시공통보일)
  // 마이그레이션 0058: notification_amount (시공통보 금액)
  // NAS 운영 DB에 wrangler 마이그레이션이 적용되지 않은 경우 서버 시작 시 자동 추가
  ;(function patchConstructionsColumns() {
    const colPatches: { col: string; ddl: string; label: string }[] = [
      {
        col:   'completion_date',
        ddl:   `ALTER TABLE constructions ADD COLUMN completion_date DATE DEFAULT NULL`,
        label: 'constructions.completion_date',
      },
      {
        col:   'notification_date',
        ddl:   `ALTER TABLE constructions ADD COLUMN notification_date DATE DEFAULT NULL`,
        label: 'constructions.notification_date',
      },
      {
        col:   'notification_amount',
        ddl:   `ALTER TABLE constructions ADD COLUMN notification_amount INTEGER DEFAULT NULL`,
        label: 'constructions.notification_amount',
      },
    ]

    for (const { col, ddl, label } of colPatches) {
      try {
        // 컬럼 존재 여부를 PRAGMA로 확인 후 없으면 ALTER
        const cols = rawDb.prepare(`PRAGMA table_info(constructions)`).all() as { name: string }[]
        const exists = cols.some((r) => r.name === col)
        if (!exists) {
          rawDb.exec(ddl)
          // notification_date 는 기존 데이터를 created_at 기반으로 초기화
          if (col === 'notification_date') {
            rawDb.exec(`UPDATE constructions SET notification_date = date(created_at) WHERE notification_date IS NULL`)
          }
          console.log(`[patchSchema v0.158] ✅ ${label} 컬럼 추가 완료`)
        } else {
          console.log(`[patchSchema v0.158] ${label} 컬럼 이미 존재 — 생략`)
        }
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) {
          console.warn(`[patchSchema v0.158] ${label} 패치 실패 (무시):`, e.message)
        }
      }
    }
  })()
  // ── [v0.159 BUG-097] site_inspections.inspection_type CHECK constraint 확장 ──
  // 구버전 DDL: CHECK(inspection_type IN ('routine','special','safety'))
  // 현재 UI 선택지: 'routine'(정기), 'special'(합동), 'safety'(수시) 로 통일
  // → 기존 DB에서 'joint','frequent' 값이 저장되어 있으면 매핑 업데이트 후
  //   CHECK constraint를 제거한 새 컬럼으로 재생성
  ;(function patchInspectionTypeConstraint() {
    try {
      // 1) 현재 inspection_type 컬럼 DDL 확인
      const tblSql = (rawDb.prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='site_inspections'`
      ).get() as any)?.sql || ''

      const hasOldCheck = tblSql.includes("'routine','special','safety'") ||
                          tblSql.includes("'routine', 'special', 'safety'")

      if (hasOldCheck) {
        // 2) 기존 'joint' → 'special', 'frequent' → 'safety' 데이터 마이그레이션
        rawDb.exec(`UPDATE site_inspections SET inspection_type='special' WHERE inspection_type='joint'`)
        rawDb.exec(`UPDATE site_inspections SET inspection_type='safety'  WHERE inspection_type='frequent'`)

        // 3) 컬럼 재생성 (SQLite는 CHECK 제거 불가 → 테이블 재생성 없이 UPDATE만으로 해결)
        //    → 실제로는 기존 값이 'routine'/'special'/'safety' 범위 내이므로 더 이상 CHECK 위반 없음
        //    단, 신규 INSERT 시 'joint'/'frequent' 전송 차단을 위해 app.js select 값도 변경
        console.log('[patchSchema v0.159] ✅ inspection_type joint→special, frequent→safety 데이터 마이그레이션 완료')
      } else {
        console.log('[patchSchema v0.159] inspection_type CHECK 패치 불필요 (이미 적용됨)')
      }
    } catch (e: any) {
      console.warn('[patchSchema v0.159] inspection_type 패치 실패 (무시):', e.message)
    }

  // ─── patchSchema v0.161: inspection_checklist_results 테이블 ──────────────
  // 현장점검 항목별 양호/불량/해당없음 체크 결과 저장 테이블
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS inspection_checklist_results (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        inspection_id   INTEGER NOT NULL REFERENCES site_inspections(id) ON DELETE CASCADE,
        item_key        TEXT    NOT NULL,
        item_group      TEXT,
        item_text       TEXT,
        item_basis      TEXT,
        result          TEXT    CHECK(result IN ('good','bad','na')),
        memo            TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(inspection_id, item_key)
      )
    `)
    rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_ins_chk_ins ON inspection_checklist_results(inspection_id)`)
    console.log('[patchSchema v0.161] ✅ inspection_checklist_results 테이블 준비 완료')
  } catch(e: any) {
    if (!e.message?.includes('already exists')) console.warn('[patchSchema v0.161] inspection_checklist_results 생성 실패 (무시):', e.message)
    else console.log('[patchSchema v0.161] inspection_checklist_results 이미 존재 — 스킵')
  }

  // ─── patchSchema v0.162: inspection_checklist_results 에 photo_path 컬럼 추가 ──
  // 체크리스트 항목별 사진 1장 저장 (등록 모달에서 업로드)
  try {
    rawDb.exec(`ALTER TABLE inspection_checklist_results ADD COLUMN photo_path TEXT`)
    rawDb.exec(`ALTER TABLE inspection_checklist_results ADD COLUMN photo_name TEXT`)
    rawDb.exec(`ALTER TABLE inspection_checklist_results ADD COLUMN photo_mime TEXT`)
    console.log('[patchSchema v0.162] ✅ inspection_checklist_results photo 컬럼 추가 완료')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.162]', e.message)
    else console.log('[patchSchema v0.162] photo 컬럼 이미 존재 — 스킵')
  }

  // ─── patchSchema v0.163: splice_work_items — unit_price_snapshot 컬럼 추가 ──
  // 접속일보 단가 불변 정책 (FEAT-161):
  //   저장 시점의 단가를 스냅샷으로 보존 → 이후 단가 변경 시에도 과거 금액 불변
  //   외선일보(work_report_extras)의 unit_price_snapshot 정책과 동일하게 통일
  //   기존 데이터: NULL → 금액 계산 시 splice_unit_prices 현재 단가로 폴백
  try {
    rawDb.exec(`ALTER TABLE splice_work_items ADD COLUMN unit_price_snapshot    REAL DEFAULT NULL`)
    rawDb.exec(`ALTER TABLE splice_work_items ADD COLUMN night_price_snapshot   REAL DEFAULT NULL`)
    rawDb.exec(`ALTER TABLE splice_work_items ADD COLUMN aerial_price_snapshot  REAL DEFAULT NULL`)
    console.log('[patchSchema v0.163] ✅ splice_work_items 단가 스냅샷 3컬럼 추가 완료')
  } catch(e: any) {
    if (!e.message?.includes('duplicate column')) console.warn('[patchSchema v0.163]', e.message)
    else console.log('[patchSchema v0.163] splice_work_items 단가 스냅샷 컬럼 이미 존재 — 스킵')
  }

  // ─── patchSchema v0.164: work_type_safety_settings 테이블 생성 + 5개 기본 시드 ──
  // 작업유형별 안전내용 관리 메뉴 (FEAT-WT-SAFETY):
  //   안전관리자·현장대리인이 UI에서 직접 작업유형/안전내용/사진레이블 관리
  //   type_key: 고유 키 (바켓차량작업/전주승주/옥상옥탑작업/사다리사용작업/중장비사용)
  //   safety_items/tbm_items/precaution_items/photo_labels: JSON 배열 문자열
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS work_type_safety_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type_key TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        icon TEXT DEFAULT 'fa-hard-hat',
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        safety_items TEXT DEFAULT '[]',
        tbm_items TEXT DEFAULT '[]',
        precaution_items TEXT DEFAULT '[]',
        photo_labels TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('[patchSchema v0.164] ✅ work_type_safety_settings 테이블 생성 완료')
  } catch(e: any) {
    if (!e.message?.includes('already exists')) console.warn('[patchSchema v0.164] 테이블 생성 실패 (무시):', e.message)
    else console.log('[patchSchema v0.164] work_type_safety_settings 이미 존재 — 스킵')
  }

  // 기본 5개 시드 데이터 (INSERT OR IGNORE — 중복 시 무시)
  const _wtSeeds = [
    {
      type_key: '바켓차량작업', label: '바켓차량작업', icon: 'fa-truck', sort_order: 1,
      safety_items: JSON.stringify(['바켓차량 작업 반경(5m) 내 출입 통제','고소작업 안전대 착용 및 안전고리 체결 확인','차량 아웃트리거 완전 전개 및 지반 침하 여부 확인','작업 전 차량 점검 및 이상 없음 확인','2인 1조 작업 원칙 준수 (1인 지상 감시)']),
      tbm_items: JSON.stringify(['바켓 탑승 전 안전대 착용 상태 상호 확인','지상 감시자 배치 및 신호 체계 확인','차량 안전거리 확보 및 도로 점용 안전시설 설치','작업 중 고압선 접근 금지 확인','돌풍·강풍 시 즉시 작업 중단 기준 확인']),
      precaution_items: JSON.stringify(['바켓 탑승 중 신체 외부 이탈 절대 금지','아웃트리거 미전개 상태 작업 금지','운전자 이탈 시 바켓 비워두고 안전핀 체결','강풍(풍속 10m/s 초과) 시 작업 중단','인근 고압선(LV/HV) 안전거리(충전부 2m↑) 유지']),
      photo_labels: JSON.stringify(['아웃트리거 확장 및 받침목 설치','고임목 설치','안전고리 체결']),
    },
    {
      type_key: '전주승주', label: '전주승주', icon: 'fa-person-arrow-up-from-line', sort_order: 2,
      safety_items: JSON.stringify(['승주 전 전주 상태(균열·부식·매설깊이) 육안 점검','안전대 착용 및 안전고리 전주 결속 확인','승주용 발판볼트·슈라우드 체결 상태 확인','지상 감시자 1인 배치 및 통신 방법 확인','낙하물 위험 구역(반경 3m) 출입 통제']),
      tbm_items: JSON.stringify(['전주 승주 전 전주 흔들림·기울기 측정 확인','안전대 D링·로프 마모 상태 확인','공구 및 자재 추락 방지(공구낙하방지끈) 확인','활선(充電) 여부 확인 및 충전부 접촉 금지 교육','우천·결빙 시 승주 금지 기준 확인']),
      precaution_items: JSON.stringify(['안전대 미착용 승주 절대 금지','전주 균열·기울기 이상 시 작업 중단 및 보고','전주 정상부 작업 시 2중 안전고리 체결','강풍·우천·결빙 시 작업 즉시 중단','활선 작업 금지 — 정전 확인 후 작업']),
      photo_labels: JSON.stringify(['전주 상태 점검 사진','안전대 착용 확인','지상 감시자 배치']),
    },
    {
      type_key: '옥상옥탑작업', label: '옥상옥탑작업', icon: 'fa-building', sort_order: 3,
      safety_items: JSON.stringify(['옥상 개구부·외곽 안전난간 설치 및 덮개 확인','개인보호구(안전모·안전대·안전화) 착용 확인','안전대 부착설비(로프·D링·앵커) 사전 설치 확인','출입구 잠금장치 확인 및 관계자 외 출입 통제','바닥 미끄럼 방지 및 낙하물 방지망 설치']),
      tbm_items: JSON.stringify(['옥상 외곽부 1.5m 이내 작업 시 안전대 체결 의무','낙하물 위험 구역 지상 출입 통제 조치 확인','야간·우천 시 미끄럼 위험 강화 안전조치 확인','헬기 착륙장·방수 구조물 손상 금지 교육','긴급 대피 경로 및 연락체계 확인']),
      precaution_items: JSON.stringify(['안전대 미체결 상태 외곽부 접근 금지','슬레이트·패널 지붕 직접 올라서기 금지','강풍·낙뢰·우천 시 즉시 작업 중단','지반 취약부(채광창·환기구 덮개) 하중 집중 금지','작업 완료 후 개구부 복구 및 난간 원상태 확인']),
      photo_labels: JSON.stringify(['안전난간 설치 상태','안전대 체결 확인','낙하물 방지망 설치']),
    },
    {
      type_key: '사다리사용작업', label: '사다리사용작업', icon: 'fa-stairs', sort_order: 4,
      safety_items: JSON.stringify(['사다리 상단 2단(30cm 이상) 작업 금지 확인','사다리 기울기 각도(75°±5°) 준수 확인','사다리 미끄럼방지 장치 및 지반 안정성 확인','2인 1조 — 1인 하부 고정 지지 의무','사다리 위에서 공구·자재 직접 전달 금지']),
      tbm_items: JSON.stringify(['사다리 사용 전 발판·지주 결함 육안 점검','사다리 상부 결속 또는 하부 고정 방법 확인','양 발 동시 딛기 원칙 및 신체 외측 이탈 금지 교육','자재 운반 시 등짐·손잡이 장비 사용 교육','설치 각도 불량 시 즉시 재설치 기준 확인']),
      precaution_items: JSON.stringify(['사다리 최상단 2개 발판 탑승 절대 금지','1인 탑승 원칙 — 동시 다인 사용 금지','강풍(풍속 7m/s 초과) 시 사다리 작업 중단','알루미늄 사다리 활선 근접 사용 금지','젖은 손·발 사다리 접촉 금지']),
      photo_labels: JSON.stringify(['사다리 설치 상태','하부 고정 확인']),
    },
    {
      type_key: '중장비사용', label: '중장비사용', icon: 'fa-truck-monster', sort_order: 5,
      safety_items: JSON.stringify(['중장비 작업 반경(선회 반경+2m) 내 출입 통제','신호수 배치 및 신호 방법 사전 교육·확인','지반 지내력 확인 및 아웃트리거 패드 사용','장비 점검 일지 확인 및 이상 없음 서명','야간 작업 시 조명 및 반사형 안전조끼 착용']),
      tbm_items: JSON.stringify(['운전원 자격증 및 특수건강검진 유효 기간 확인','인양·굴착 전 지하 매설물 위치 확인','줄걸이 와이어로프 상태(킹크·단선) 점검','장비 최대 허용 하중 초과 작업 금지 교육','작업 중단 시 붐·버켓 지상 안착 및 키 보관 교육']),
      precaution_items: JSON.stringify(['장비 운전반경 내 작업자 절대 접근 금지','신호수 없는 단독 작업 금지','연약지반·경사면 장비 전도 위험 확인 후 진입','인양물 아래 작업자 통과 금지','강풍(풍속 10m/s 초과) 인양 작업 중단']),
      photo_labels: JSON.stringify(['작업계획서','유도원 배치']),
    },
  ]
  for (const s of _wtSeeds) {
    try {
      rawDb.prepare(`
        INSERT OR IGNORE INTO work_type_safety_settings
          (type_key, label, icon, is_active, sort_order, safety_items, tbm_items, precaution_items, photo_labels)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
      `).run(s.type_key, s.label, s.icon, s.sort_order, s.safety_items, s.tbm_items, s.precaution_items, s.photo_labels)
    } catch(e: any) {
      console.warn('[patchSchema v0.164] 시드 삽입 실패 (무시):', s.type_key, e.message)
    }
  }
  console.log('[patchSchema v0.164] ✅ work_type_safety_settings 기본 시드 완료')

  // ─── patchSchema v0.165: TBM회의 섹션 시드 추가 ─────────────────────────────
  // tbm_meeting(TBM 회의) 사진 항목을 work_type_safety_settings DB로 관리
  // checklist.ts updateTbmSections()에서 type_key='TBM회의'를 조회하여 photo_labels 동적 사용
  // INSERT OR IGNORE: 이미 존재하면 기존 데이터 보호 (사용자 수정 내용 유지)
  try {
    rawDb.prepare(`
      INSERT OR IGNORE INTO work_type_safety_settings
        (type_key, label, icon, is_active, sort_order, safety_items, tbm_items, precaution_items, photo_labels)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      'TBM회의',
      'TBM 회의',
      'fa-shield-alt',
      6,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify(['TBM회의 사진', '작업현장 전경', '라바콘 입간판 설치상태'])
    )
    console.log('[patchSchema v0.165] ✅ TBM회의 시드 추가 완료')
  } catch(e: any) {
    console.warn('[patchSchema v0.165] TBM회의 시드 실패 (무시):', e.message)
  }

  // ─── patchSchema v0.166: 밀폐공간작업 체크리스트 항목 시드 추가 ──────────────
  // app.js conditionalList에 confined(밀폐공간작업) 추가 대응
  // work_class='confined' 항목이 없으면 체크해도 빈 목록 → 항목 시드 추가
  // INSERT OR IGNORE: 이미 존재하면 기존 데이터 보호
  try {
    const confinedItems = [
      { category: '작업환경', question: '밀폐공간(맨홀, 지하피트 등) 진입 전 산소 및 유해가스 농도를 측정하였는가?',          sort_order: 610, note: '산소 18% 이상, 황화수소 10ppm 이하, 일산화탄소 30ppm 이하' },
      { category: '작업환경', question: '밀폐공간 진입 전 충분한 환기(자연환기 또는 강제환기)를 실시하였는가?',                 sort_order: 620, note: '작업 중에도 지속적 환기 유지' },
      { category: '보호구',   question: '송기마스크 또는 공기호흡기(SCBA)를 착용하고 이상 여부를 확인하였는가?',               sort_order: 630, note: '방독면은 밀폐공간에서 사용 금지' },
      { category: '작업환경', question: '밀폐공간 외부에 감시인(감독자)을 배치하고 비상연락체계를 확인하였는가?',               sort_order: 640, note: '감시인은 공간 내부 진입 금지' },
      { category: '작업환경', question: '비상구조 장비(구명줄, 안전대, 구급약품 등)를 현장에 비치하였는가?',                   sort_order: 650, note: '구조 장비 위치 전 작업자 공유' },
    ]
    const confinedStmt = rawDb.prepare(`
      INSERT OR IGNORE INTO checklist_items (work_class, category, question, sort_order, note)
      VALUES ('confined', ?, ?, ?, ?)
    `)
    for (const item of confinedItems) {
      confinedStmt.run(item.category, item.question, item.sort_order, item.note)
    }
    console.log('[patchSchema v0.166] ✅ 밀폐공간작업(confined) 체크리스트 항목 시드 완료')
  } catch(e: any) {
    console.warn('[patchSchema v0.166] 밀폐공간 시드 실패 (무시):', e.message)
  }

  // ─── patchSchema v0.167: work_type_safety_settings에 밀폐공간작업 시드 추가 ──
  // v0.164에서 5종(바켓/전주/옥상/사다리/중장비)만 시드 → 밀폐공간작업 누락
  // _wtSafetyCache가 이 테이블 기반 → 없으면 체크박스에 표시 안 됨
  try {
    rawDb.prepare(`
      INSERT OR IGNORE INTO work_type_safety_settings
        (type_key, label, icon, is_active, sort_order, safety_items, tbm_items, precaution_items, photo_labels)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      '밀폐공간작업',
      '밀폐공간작업',
      'fa-door-closed',
      7,
      JSON.stringify(['밀폐공간 진입 전 산소(18% 이상) 및 유해가스 농도 측정 확인','강제환기 장치 설치 및 지속 운전 확인','송기마스크 또는 SCBA 착용 및 이상 여부 확인','외부 감시인 배치 및 비상연락체계(무전기·호루라기) 확인','비상구조 장비(구명줄·안전대·구급약품) 현장 비치 확인']),
      JSON.stringify(['밀폐공간 작업허가서 발급 및 내용 공유','작업 전 산소·가스 측정값 및 합격 기준 공유','감시인 역할·권한(작업중단 명령권) 교육','비상 시 대피 경로 및 연락처 확인','공기호흡기(SCBA) 착용·해제 방법 교육']),
      JSON.stringify(['작업허가서 없는 밀폐공간 진입 절대 금지','방독면 착용 후 밀폐공간 진입 금지 (산소결핍 환경 무효)','환기 불량 시 작업 즉시 중단','감시인 자리 이탈 금지 (감시인의 내부 진입도 금지)','이상 징후 발생 즉시 대피 및 119 신고']),
      JSON.stringify(['산소·가스 측정 결과표','환기장치 설치 상태','감시인 배치 확인'])
    )
    console.log('[patchSchema v0.167] ✅ work_type_safety_settings 밀폐공간작업 시드 완료')
  } catch(e: any) {
    console.warn('[patchSchema v0.167] 밀폐공간작업 시드 실패 (무시):', e.message)
  }

  // ─── patchSchema v0.168: checklist_items 중복 항목 정리 ──────────────────────
  // 원인: 0011 plain INSERT → 0016 INSERT OR IGNORE(id미지정) → 0017 일부 미지정
  //       + v0.166 confined 시드(id미지정) → UNIQUE 제약 없어 동일 question 중복 행 발생
  // 해결:
  //   ① (work_class, question) 기준 MIN(id)만 남기고 응답기록 없는 중복행 삭제
  //   ② 응답기록 있는 중복행은 is_active=0 비활성화
  //   ③ 서버 재시작 마다 실행(멱등) — 중복 없으면 0행 삭제로 무해
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    // [1] 중복 중 응답 기록 없는 행 하드 삭제
    rawDb.exec(`
      DELETE FROM checklist_items
      WHERE id NOT IN (
        SELECT MIN(id) FROM checklist_items GROUP BY work_class, question
      )
      AND id NOT IN (SELECT DISTINCT item_id FROM checklist_responses)
    `)
    // [2] 중복 중 응답 기록 있는 행 비활성화 (보존)
    rawDb.exec(`
      UPDATE checklist_items SET is_active = 0
      WHERE id NOT IN (
        SELECT MIN(id) FROM checklist_items GROUP BY work_class, question
      )
      AND id IN (SELECT DISTINCT item_id FROM checklist_responses)
    `)
    console.log('[patchSchema v0.168] ✅ checklist_items 중복 항목 정리 완료')
  } catch(e: any) {
    console.warn('[patchSchema v0.168] 중복 정리 실패 (무시):', e.message)
  }

  // ─── patchSchema v0.169: work_type_safety_settings에 work_class 컬럼 추가 ────
  // 목적: type_key(한글) ↔ work_class(영문) 매핑을 하드코딩에서 DB 관리로 전환
  //       작업유형 추가 시 코드 수정 없이 체크리스트와 자동 연동
  // 기존 6개 매핑값 자동 채우기 (ALTER TABLE — 이미 있으면 IGNORE)
  try {
    rawDb.exec(`ALTER TABLE work_type_safety_settings ADD COLUMN work_class TEXT DEFAULT ''`)
    console.log('[patchSchema v0.169] ✅ work_class 컬럼 추가 완료')
  } catch(e: any) {
    if (e.message?.includes('duplicate column')) {
      console.log('[patchSchema v0.169] work_class 컬럼 이미 존재 — 스킵')
    } else {
      console.warn('[patchSchema v0.169] work_class 컬럼 추가 실패 (무시):', e.message)
    }
  }
  // 기존 6개 type_key → work_class 매핑값 채우기 (빈 값인 경우만)
  try {
    const _wc169Map: Record<string,string> = {
      '바켓차량작업':   'bucket',
      '전주승주':       'pole',
      '옥상옥탑작업':   'rooftop',
      '사다리사용작업': 'ladder',
      '중장비사용':     'heavy',
      '밀폐공간작업':   'confined',
    }
    const _stmt169 = rawDb.prepare(
      `UPDATE work_type_safety_settings SET work_class=? WHERE type_key=? AND (work_class IS NULL OR work_class='')`
    )
    for (const [tk, wc] of Object.entries(_wc169Map)) {
      _stmt169.run(wc, tk)
    }
    console.log('[patchSchema v0.169] ✅ 기존 6개 type_key work_class 매핑 완료')
  } catch(e: any) {
    console.warn('[patchSchema v0.169] work_class 매핑 실패 (무시):', e.message)
  }

  // ─── patchSchema v0.170: work_type_safety_settings에 input_fields 컬럼 추가 ────
  // 목적: 작업유형별 필수 입력 레이블(가스측정값 등) 정의 — JSON 배열로 저장
  //       각 항목: { label, unit, validate_type, min, max }
  try {
    rawDb.exec(`ALTER TABLE work_type_safety_settings ADD COLUMN input_fields TEXT DEFAULT '[]'`)
    console.log('[patchSchema v0.170] ✅ input_fields 컬럼 추가 완료')
  } catch(e: any) {
    if (e.message?.includes('duplicate column')) {
      console.log('[patchSchema v0.170] input_fields 컬럼 이미 존재 — 스킵')
    } else {
      console.warn('[patchSchema v0.170] input_fields 컬럼 추가 실패 (무시):', e.message)
    }
  }

  })()
  // ─────────────────────────────────────────────────────────────────────────────
}
patchSchema()
// 서버 시작 시 tbm_signatures 테이블 + 잔여 트리거 정리 (1회)
ensureTbmSignaturesTable()
// ─────────────────────────────────────────────────────────────────────────────

// ─── FCM 푸시 알림 헬퍼 (NAS 전용) ──────────────────────────────────────────
// users 테이블에서 userId 목록의 fcm_token을 꺼내 FCM 발송
// [RULE-002] var 사용: patchSchema 이후에 정의되므로 안전
async function sendFcmToUsers(userIds: number[], payload: { title: string; body: string; data?: Record<string,string> }): Promise<void> {
  if (!userIds || userIds.length === 0) return
  // FCM 환경변수 사전 체크 (조용히 실패 방지 — 명시적 로그)
  const _pid = process.env.FCM_PROJECT_ID || ''
  const _ce  = process.env.FCM_CLIENT_EMAIL || ''
  const _pk  = process.env.FCM_PRIVATE_KEY || ''
  if (!_pid || !_ce || !_pk) {
    console.warn(`[FCM] ⚠️ 환경변수 미설정 — FCM_PROJECT_ID:${!!_pid} FCM_CLIENT_EMAIL:${!!_ce} FCM_PRIVATE_KEY:${!!_pk} — 발송 생략 (target:${userIds})`)
    return
  }
  try {
    const placeholders = userIds.map(() => '?').join(',')
    const rows = rawDb.prepare(
      `SELECT id, name, fcm_token FROM users WHERE id IN (${placeholders}) AND fcm_token IS NOT NULL AND fcm_token != ''`
    ).all(...userIds) as any[]
    const tokens = rows.map((r: any) => r.fcm_token).filter(Boolean)
    if (tokens.length === 0) {
      console.warn(`[FCM] 등록된 토큰 없음 — target:${userIds} (FCM 토큰 미등록 또는 로그아웃 상태)`)
      return
    }
    console.log(`[FCM] 발송 시도 — "${payload.title}" → target:${userIds} tokens:${tokens.length}개`)
    const result = await sendFcmPushMulti(tokens, payload)
    console.log(`[FCM] 발송 완료 — sent:${result.sent} failed:${result.failed} target:${userIds}`)
  } catch (e: any) {
    console.error('[FCM] sendFcmToUsers 오류:', e.message)
  }
}

async function sendFcmToRoles(roles: string[], payload: { title: string; body: string; data?: Record<string,string> }): Promise<void> {
  if (!roles || roles.length === 0) return
  const _pid = process.env.FCM_PROJECT_ID || ''
  const _ce  = process.env.FCM_CLIENT_EMAIL || ''
  const _pk  = process.env.FCM_PRIVATE_KEY || ''
  if (!_pid || !_ce || !_pk) {
    console.warn(`[FCM] ⚠️ 환경변수 미설정 — roles(${roles}) 발송 생략`)
    return
  }
  try {
    const placeholders = roles.map(() => '?').join(',')
    const rows = rawDb.prepare(
      `SELECT fcm_token FROM users WHERE role IN (${placeholders}) AND is_active=1 AND fcm_token IS NOT NULL AND fcm_token != ''`
    ).all(...roles) as any[]
    const tokens = rows.map((r: any) => r.fcm_token).filter(Boolean)
    if (tokens.length === 0) {
      console.warn(`[FCM] roles(${roles}) 등록 토큰 없음`)
      return
    }
    console.log(`[FCM] roles(${roles}) 발송 시도 — "${payload.title}" tokens:${tokens.length}개`)
    const result = await sendFcmPushMulti(tokens, payload)
    console.log(`[FCM] roles(${roles}) 발송 완료 — sent:${result.sent} failed:${result.failed}`)
  } catch (e: any) {
    console.error('[FCM] sendFcmToRoles 오류:', e.message)
  }
}
// ─────────────────────────────────────────────────────────────────────────────

async function loadSystemSettings(db: any): Promise<void> {
  try {
    // 테이블 없으면 자동 생성
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        label TEXT,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT OR IGNORE INTO system_settings (key, value, label, description) VALUES
        ('upload_root_path',           '',    '파일 저장 루트 경로', 'NAS 또는 로컬 경로. 비워두면 기본 경로(./public/uploads) 사용'),
        ('attach_max_mb',              '20',  '[공통] 파일 1개 최대 용량(MB)', '단계별 설정이 없을 때 사용되는 기본값'),
        ('attach_total_mb',            '200', '[공통] 작업 총 첨부 한도(MB)', '단계별 설정이 없을 때 사용되는 기본값'),
        ('attach_allowed_ext',         'pdf,doc,docx,xls,xlsx,ppt,pptx,hwp,txt,jpg,jpeg,png,gif,webp,heic,mp4,zip', '[공통] 허용 확장자', '단계별 설정이 없을 때 사용되는 기본값'),
        ('attach_order_max_mb',        '',    '01_작업지시서 파일 1개 최대(MB)', '비워두면 공통값 사용'),
        ('attach_order_total_mb',      '',    '01_작업지시서 총 한도(MB)', '비워두면 공통값 사용'),
        ('attach_order_allowed_ext',   '',    '01_작업지시서 허용 확장자', '비워두면 공통값 사용'),
        ('attach_tbm_max_mb',          '',    '02_TBM 파일 1개 최대(MB)', '비워두면 공통값 사용'),
        ('attach_tbm_total_mb',        '',    '02_TBM 총 한도(MB)', '비워두면 공통값 사용'),
        ('attach_tbm_allowed_ext',     '',    '02_TBM 허용 확장자', '비워두면 공통값 사용'),
        ('attach_photo_max_mb',        '',    '03_작업사진 파일 1개 최대(MB)', '비워두면 공통값 사용'),
        ('attach_photo_total_mb',      '',    '03_작업사진 총 한도(MB)', '비워두면 공통값 사용'),
        ('attach_photo_allowed_ext',   '',    '03_작업사진 허용 확장자', '비워두면 공통값 사용'),
        ('attach_inspection_max_mb',   '',    '04_현장점검 파일 1개 최대(MB)', '비워두면 공통값 사용'),
        ('attach_inspection_total_mb', '',    '04_현장점검 총 한도(MB)', '비워두면 공통값 사용'),
        ('attach_inspection_allowed_ext','',  '04_현장점검 허용 확장자', '비워두면 공통값 사용'),
        ('attach_other_max_mb',        '',    '05_기타 파일 1개 최대(MB)', '비워두면 공통값 사용'),
        ('attach_other_total_mb',      '',    '05_기타 총 한도(MB)', '비워두면 공통값 사용'),
        ('attach_other_allowed_ext',   '',    '05_기타 허용 확장자', '비워두면 공통값 사용'),
        ('kakao_rest_api_key',         '',    '카카오 REST API 키', 'GPS 역지오코딩(지번주소 포함)에 사용. 없으면 Nominatim(도로명만) 사용'),
        ('kakao_js_api_key',           '',    '카카오 JavaScript API 키', '카카오맵 지도 표시에 사용. 카카오 개발자 콘솔 → JavaScript 키'),
        ('apk_version',                '',    'APK 버전', '현재 배포 중인 Android APK 버전 (예: 1.2.0)'),
        ('apk_url',                    '',    'APK 다운로드 URL', 'APK 파일 URL. NAS 경로(/static/apk/safetynote.apk) 또는 외부 URL'),
        ('apk_release_note',           '',    'APK 업데이트 내역', '사용자에게 표시할 버전 업데이트 내용'),
        ('apk_force_update',           '0',   'APK 강제 업데이트', '1이면 구버전 앱에서 강제 업데이트 팝업 표시');
    `)
    // ① D1(Cloudflare) 설정 로드 — 개발/배포 환경 기준
    const rows = await db.prepare('SELECT key, value FROM system_settings').all()
    for (const row of (rows.results || [])) {
      sysSettings[row.key] = row.value
    }

    // ② [BUG-106 수정] NAS rawDb(SQLite) 설정으로 덮어씌우기
    //    NAS 운영 환경에서는 rawDb에 실제 설정값(카카오 API 키 등)이 저장됨.
    //    서버 재시작 후 D1에는 해당 키가 없어 sysSettings가 빈 값이 되는 문제 해결.
    //    rawDb 값이 D1보다 우선함 (NAS 환경의 실제 운영값 보장).
    try {
      const rawRows = rawDb.prepare('SELECT key, value FROM system_settings').all() as Array<{key: string, value: string}>
      for (const row of rawRows) {
        if (row.key && row.value !== undefined && row.value !== null) {
          sysSettings[row.key] = String(row.value)
        }
      }
      // nas-db.ts의 _sysSettings 인메모리 캐시도 동기화
      // (geocode.ts 등 nas-routes에서 getSetting()으로 접근하는 경우를 위해)
      nasSetSysSettings(sysSettings)
      console.log('[설정] rawDb system_settings 동기화 완료 (' + rawRows.length + '건)')
    } catch (rawErr) {
      console.warn('[설정] rawDb system_settings 로드 실패 (무시):', rawErr)
    }

    // DB 설정값이 있으면 UPLOAD_ROOT 재정의
    const dbPath = getSetting('upload_root_path')
    if (dbPath) {
      const resolved = dbPath.replace(/\/+$/, '')
      if (resolved !== UPLOAD_ROOT) {
        ;(global as any).__UPLOAD_ROOT_OVERRIDE = resolved
        mkdirSync(resolved, { recursive: true })
        console.log(`[설정] 업로드 루트 → ${resolved}`)
      }
    }
  } catch (e) {
    console.warn('[설정] system_settings 로드 실패:', e)
  }
}

/** 현재 유효한 업로드 루트 반환 */
function getUploadRoot(): string {
  const override = (global as any).__UPLOAD_ROOT_OVERRIDE
  return override || UPLOAD_ROOT
}

// ─── 새 폴더 구조 (v3 FEAT-042) ──────────────────────────────────────────────
// {uploadRoot}/{년도}/{월}/{공사요청번호}_{공사명}/{서브번호}_{작업일}_{작업종류}/{단계폴더}/
// 공사 미연결(미분류): {uploadRoot}/미분류/{taskFolder}/{단계폴더}/
// photo 단계: {단계폴더}/{photo_type 하위폴더}/
const STAGE_DIRS: Record<string, string> = {
  order:      '01_작업지시서',
  tbm:        '02_TBM',
  photo:      '03_작업사진',
  inspection: '04_현장점검',
  other:      '05_기타',
}

// photo_type → 작업사진 하위 폴더 매핑
const PHOTO_TYPE_DIRS: Record<string, string> = {
  before:     '01_작업 전',
  progress:   '02_작업 중',
  after:      '03_작업 후',
  hazard:     '04_위험 상황',
  tbm:        '05_TBM',
  completion: '06_완료',
}

/** caption(설명) 값을 폴더명으로 변환 — 비어있으면 null */
function captionToFolderName(caption: string | null | undefined): string | null {
  if (!caption || !caption.trim()) return null
  const cleaned = caption.trim()
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 40)
    .trimEnd()
  return cleaned || null
}

function safeFsName(s: string): string {
  return (s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim()
}

// KST(UTC+9) 기준 현재 날짜 문자열 (YYYY-MM-DD)
function kstDateStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

// KST(UTC+9) 기준 현재 datetime 문자열 (YYYY-MM-DD HH:MM:SS)
function kstNowStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

function fmtDateStr(d: string | null | undefined): string {
  if (!d) return kstDateStr()
  return String(d).slice(0, 10)
}

/**
 * 파일 저장 폴더 반환 — 없으면 자동 생성
 * @param task      tasks + constructions JOIN 결과 (또는 하위호환용 문자열)
 * @param stage     'order'|'tbm'|'photo'|'inspection'|'other'
 * @param photoType 'before'|'progress'|'after' — photo 단계일 때 하위 폴더 생성
 * @param caption   사진 설명 — 입력값 있으면 photo_type 폴더 아래 추가 하위 폴더 생성
 */
function getUploadDir(
  task: {
    task_number?: string | null; sub_task_number?: string | null
    work_date?: string | null;   planned_date?: string | null
    construction_type?: string | null
    con_request_no?: string | null; con_title?: string | null
    con_created_at?: string | null  // [FEAT-042] 공사 등록일 → 년도/월 폴더
    team_name?: string | null  // [FEAT-050] 작업팀명 추가
  } | string,
  stage: string = 'photo',
  photoType?: string,
  caption?: string
): string {
  const root = getUploadRoot()

  // 하위 호환: 문자열 전달 시 미분류 처리
  if (typeof task === 'string') {
    const stageDir = STAGE_DIRS[stage] || STAGE_DIRS.other
    let dir = join(root, '미분류', safeFsName(task), stageDir)
    if (stage === 'photo' && photoType && PHOTO_TYPE_DIRS[photoType]) {
      dir = join(dir, PHOTO_TYPE_DIRS[photoType])
      const captionFolder = captionToFolderName(caption)
      if (captionFolder) dir = join(dir, captionFolder)
    }
    mkdirSync(dir, { recursive: true })
    return dir
  }

  const hasConInfo = !!(task.con_request_no && task.con_title)
  const conFolder = hasConInfo
    ? safeFsName(`${task.con_request_no}_${task.con_title}`)
    : '미분류'

  // [FEAT-042] 년도/월 폴더: 공사 등록일(con_created_at) 기준
  // 공사 연결 시만 년도/월 적용, 미분류는 기존 구조 유지
  let yearFolder  = ''
  let monthFolder = ''
  if (hasConInfo && task.con_created_at) {
    const dt = new Date(task.con_created_at)
    if (!isNaN(dt.getTime())) {
      yearFolder  = String(dt.getFullYear())
      monthFolder = String(dt.getMonth() + 1).padStart(2, '0')
    }
  }

  const taskNum  = safeFsName(task.sub_task_number || task.task_number || 'UNKNOWN')
  const workDate = fmtDateStr(task.work_date || task.planned_date)
  const workType = safeFsName(task.construction_type || '작업')
  // [FEAT-050] 팀명 있으면 폴더명 뒤에 추가: {서브작업번호}_{작업일}_{작업종류}_[작업팀]
  const teamSuffix  = task.team_name ? `_[${safeFsName(task.team_name)}]` : ''
  const taskFolder  = `${taskNum}_${workDate}_${workType}${teamSuffix}`
  const stageDir    = STAGE_DIRS[stage] || STAGE_DIRS.other

  // [FEAT-042] 년도/월 있으면: {root}/{년도}/{월}/{conFolder}/{taskFolder}/{stageDir}
  // 없으면(미분류 또는 con_created_at 없음): {root}/{conFolder}/{taskFolder}/{stageDir}
  const basePath = (yearFolder && monthFolder)
    ? join(root, yearFolder, monthFolder, conFolder)
    : join(root, conFolder)

  // photo 단계 + photoType → 하위 폴더 추가
  // before → 01_작업 전 / progress → 02_작업 중 / after → 03_작업 후
  // caption 입력 시 → photo_type 폴더 아래 설명명 폴더 추가 생성
  let dir = join(basePath, taskFolder, stageDir)
  if (stage === 'photo' && photoType && PHOTO_TYPE_DIRS[photoType]) {
    dir = join(dir, PHOTO_TYPE_DIRS[photoType])
    const captionFolder = captionToFolderName(caption)
    if (captionFolder) dir = join(dir, captionFolder)
  }

  mkdirSync(dir, { recursive: true })
  return dir
}

/** 하위 호환 */
const UPLOAD_DIR = UPLOAD_ROOT

/** @deprecated getUploadDir(task, stage) 사용 */
function buildTaskFolderName(task: {
  request_no?: string | null; work_number?: string | null; id?: number
}): string {
  return safeFsName(task.request_no || task.work_number || `task_${task.id || 'UNKNOWN'}`)
}

function generateFileName(originalName: string): string {
  const ext = (originalName.split('.').pop() || 'jpg').toLowerCase()
  return `${Date.now()}_${randomBytes(3).toString('hex')}.${ext}`
}

// ─── TBM 결재 완료 PDF 자동 저장 ──────────────────────────────────────────
const HEADLESS_SHELL = '/home/user/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell'

function htmlFileToPdf(htmlPath: string, pdfPath: string, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(HEADLESS_SHELL, [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--no-zygote', '--single-process',
      `--print-to-pdf=${pdfPath}`,
      '--no-pdf-header-footer',
      `file://${htmlPath}`,
    ], { stdio: 'pipe' })
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error(`chrome-headless-shell timeout (${timeoutMs}ms)`))
    }, timeoutMs)
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`chrome-headless-shell exited with code ${code}`))
    })
    proc.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

async function generateTbmApprovalPdf(tbmId: number): Promise<void> {
  const tmpHtml = join('/tmp', `tbm_${tbmId}_${Date.now()}.html`)
  try {
    console.log(`[PDF] TBM #${tbmId} 결과보고서 생성 시작`)

    const tbm = rawDb.prepare(`
      SELECT tr.*,
             t.title              AS task_title,
             t.task_number        AS task_number,
             t.sub_task_number    AS sub_task_number,
             t.work_date          AS work_date,
             t.planned_date       AS planned_date,
             t.construction_type  AS construction_type,
             c.request_no         AS con_request_no,
             c.title              AS con_title,
             c.created_at         AS con_created_at,
             u.name               AS conductor_name,
             u.position           AS conductor_position,
             tm.name              AS team_name
      FROM   tbm_records tr
      LEFT JOIN tasks         t  ON t.id  = tr.task_id
      LEFT JOIN constructions c  ON c.id  = t.construction_id
      LEFT JOIN users         u  ON u.id  = tr.conductor_id
      LEFT JOIN teams         tm ON tm.id = u.team_id
      WHERE  tr.id = ?
    `).get(tbmId) as any
    if (!tbm) { console.warn(`[PDF] TBM #${tbmId} 없음`); return }

    const sigs = rawDb.prepare(`
      SELECT user_name, position, role, signed_at, sign_method, sign_data
      FROM   tbm_signatures WHERE tbm_id = ?
      ORDER BY CASE role
        WHEN 'attendee' THEN 0 WHEN 'approval_safety' THEN 1
        WHEN 'approval_general' THEN 2 WHEN 'approval_ceo' THEN 3 ELSE 4
      END, signed_at ASC
    `).all(tbmId) as any[]

    const sigMap: Record<string, any> = {}
    for (const s of sigs) { sigMap[s.role] = s }
    const attendees = sigs.filter((s: any) => s.role === 'attendee')

    const taskObj = {
      task_number: tbm.task_number, sub_task_number: tbm.sub_task_number,
      work_date: tbm.work_date, planned_date: tbm.planned_date,
      construction_type: tbm.construction_type,
      con_request_no: tbm.con_request_no, con_title: tbm.con_title,
      con_created_at: tbm.con_created_at || null,  // [FEAT-042] 년도/월 폴더용
      team_name: tbm.team_name || null,  // [FEAT-050] 팀명 포함
    }
    const saveDir  = getUploadDir(taskObj, 'tbm')
    const dateStr  = kstDateStr().replace(/-/g, '')
    const filePath = join(saveDir, `TBM결과보고_${dateStr}.pdf`)

    const fmtDt = (v?: string) =>
      v ? new Date(v).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '-'
    const fmtD = (v?: string) =>
      v ? new Date(v).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' }) : '-'
    const esc = (s: any) => String(s ?? '-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const signCell = (sig: any) => {
      if (!sig) return '<div class="sc empty">미서명</div>'
      if (sig.sign_method === 'pad' && sig.sign_data)
        return `<div class="sc"><img src="${sig.sign_data}" style="max-width:100%;max-height:54px"/></div>`
      return `<div class="sc name">${esc(sig.user_name)}</div>`
    }
    const safetyTopics = (tbm.safety_topics || '').split('\n').filter(Boolean)
    const precautions  = (tbm.precautions   || '').split('\n').filter(Boolean)
    const attendeeRows = attendees.length > 0
      ? attendees.map((a: any) =>
          `<tr><td>${esc(a.user_name)}</td><td>${esc(a.position)}</td><td>${fmtDt(a.signed_at)}</td><td>${signCell(a)}</td></tr>`
        ).join('')
      : `<tr><td colspan="4" class="empty-row">참석자 서명 없음</td></tr>`

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:11px;color:#111}
.page{width:190mm;margin:0 auto;padding:8mm 0}
h1{font-size:16px;text-align:center;border-bottom:2px solid #1a237e;padding-bottom:5px;margin-bottom:10px;color:#1a237e}
.sec{margin-bottom:9px}
.sec-t{font-size:11px;font-weight:bold;background:#e8eaf6;border-left:4px solid #1a237e;padding:3px 7px;margin-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:10px}
th,td{border:1px solid #bbb;padding:3px 5px;vertical-align:middle}
th{background:#f5f5f5;font-weight:bold;text-align:center;width:85px}
td{text-align:left}
ul{padding-left:13px;margin:3px 0}li{margin-bottom:1px}
.aw{display:flex;gap:8px;margin-top:5px}
.ab{flex:1;border:1px solid #bbb;border-radius:3px;padding:5px;text-align:center}
.ab .rl{font-size:8.5px;color:#666;margin-bottom:2px}
.ab .sn{font-weight:bold;font-size:10.5px;margin-bottom:3px}
.sc{min-height:52px;display:flex;align-items:center;justify-content:center;border:1px dashed #aaa;border-radius:2px;padding:2px}
.sc.empty{color:#bbb;font-size:9px}.sc.name{font-size:10px;font-weight:bold;color:#1a237e}
.ab .at{font-size:7.5px;color:#888;margin-top:2px}
.notes{background:#fffde7;border:1px solid #f9a825;border-radius:2px;padding:5px;font-size:10px;white-space:pre-wrap}
.empty-row{text-align:center;color:#999}
.footer{margin-top:10px;text-align:right;font-size:7.5px;color:#aaa}
</style></head><body><div class="page">
<h1>TBM 결과보고서</h1>
<div class="sec"><div class="sec-t">기본 정보</div>
<table>
<tr><th>공사명</th><td>${esc(tbm.con_title)}</td><th>공사번호</th><td>${esc(tbm.con_request_no)}</td></tr>
<tr><th>작업명</th><td>${esc(tbm.task_title)}</td><th>작업일</th><td>${fmtD(tbm.work_date || tbm.planned_date)}</td></tr>
<tr><th>TBM 일시</th><td>${fmtDt(tbm.tbm_date)}</td><th>장소</th><td>${esc(tbm.location)}</td></tr>
<tr><th>날씨/기온</th><td>${esc(tbm.weather)} / ${esc(tbm.temperature)}</td><th>참석인원</th><td>${esc(tbm.workers_count)}명</td></tr>
<tr><th>진행자</th><td>${esc(tbm.conductor_name)} (${esc(tbm.conductor_position)})</td><th>GPS</th><td>${esc(tbm.gps_address)}</td></tr>
</table></div>
${safetyTopics.length > 0 ? `<div class="sec"><div class="sec-t">안전 주제</div><ul>${safetyTopics.map((t:string)=>`<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
${precautions.length > 0 ? `<div class="sec"><div class="sec-t">안전 수칙 / 위험 요소</div><ul>${precautions.map((p:string)=>`<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
${tbm.special_notes ? `<div class="sec"><div class="sec-t">특이사항</div><div class="notes">${esc(tbm.special_notes)}</div></div>` : ''}
<div class="sec"><div class="sec-t">참석자 서명</div>
<table><thead><tr><th>이름</th><th>직책</th><th>서명일시</th><th>서명</th></tr></thead>
<tbody>${attendeeRows}</tbody></table></div>
<div class="sec"><div class="sec-t">결재란</div>
<div class="aw">
<!-- BUG-089: 안전관리자→총괄책임 서명만 표시, 대표이사 제외 -->
<div class="ab"><div class="rl">안전관리자</div><div class="sn">${esc(sigMap['approval_safety']?.user_name||'미서명')}</div>${signCell(sigMap['approval_safety'])}<div class="at">${sigMap['approval_safety']?fmtDt(sigMap['approval_safety'].signed_at):''}</div></div>
<div class="ab"><div class="rl">총괄책임</div><div class="sn">${esc(sigMap['approval_general']?.user_name||'미서명')}</div>${signCell(sigMap['approval_general'])}<div class="at">${sigMap['approval_general']?fmtDt(sigMap['approval_general'].signed_at):''}</div></div>
</div></div>
<div class="footer">생성일시: ${new Date().toLocaleString('ko-KR')} | Safety NOTE</div>
</div></body></html>`

    writeFileSync(tmpHtml, html, 'utf-8')
    await htmlFileToPdf(tmpHtml, filePath)
    console.log(`[PDF] 저장 완료: ${filePath}`)
  } catch (err) {
    console.error(`[PDF] TBM #${tbmId} PDF 생성 오류:`, err)
  } finally {
    try { if (existsSync(tmpHtml)) unlinkSync(tmpHtml) } catch (_) {}
  }
}

// tbm-extra.ts 에서 approval_ceo 서명 시 PDF 자동 생성 콜백 등록
;(global as any).__generateTbmApprovalPdf = generateTbmApprovalPdf

// MIME 타입 매핑
const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  webm: 'video/webm', mkv: 'video/x-matroska', m4v: 'video/mp4'
}

function getMimeType(filePath: string, fallback = 'application/octet-stream'): string {
  const ext = (filePath.split('.').pop() || '').toLowerCase()
  return MIME_MAP[ext] || fallback
}

// 동영상 Range 서빙 (브라우저 스트리밍용)
function serveFileWithRange(filePath: string, rangeHeader: string | null, mimeType: string): Response {
  const stat = statSync(filePath)
  const fileSize = stat.size
  const isVideo = mimeType.startsWith('video/')

  if (isVideo && rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-')
    const start = parseInt(startStr, 10)
    const end = endStr ? parseInt(endStr, 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1)
    const chunkSize = end - start + 1
    const stream = createReadStream(filePath, { start, end })
    const nodeToWeb = new ReadableStream({
      start(controller) {
        stream.on('data', chunk => controller.enqueue(chunk))
        stream.on('end', () => controller.close())
        stream.on('error', e => controller.error(e))
      }
    })
    return new Response(nodeToWeb, {
      status: 206,
      headers: {
        'Content-Type': mimeType,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Cache-Control': 'no-cache'
      }
    })
  }

  if (isVideo) {
    // 동영상 첫 요청 - 전체 크기 알림
    const stream = createReadStream(filePath)
    const nodeToWeb = new ReadableStream({
      start(controller) {
        stream.on('data', chunk => controller.enqueue(chunk))
        stream.on('end', () => controller.close())
        stream.on('error', e => controller.error(e))
      }
    })
    return new Response(nodeToWeb, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      }
    })
  }

  // 이미지 - 그냥 전체 읽기
  const buf = readFileSync(filePath)
  return new Response(buf, {
    headers: { 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=86400' }
  })
}

// ─── 앱 생성 ─────────────────────────────────────────────────────────
type Bindings = { DB: typeof DB }
const app = new Hono<{ Bindings: Bindings }>()

// DB 주입 미들웨어
app.use('*', async (c, next) => {
  c.env = { DB } as any
  await next()
})

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// ─── 정적 파일 서빙 (/static/*) ──────────────────────────────────────
// Phase 3 리팩토링 중 누락됨 — serveStatic import 후 라우트 등록 필수
app.use('/static/*', serveStatic({ root: './public' }))

// ─── 업로드 파일 서빙 (/uploads/*) — BUG-052 ─────────────────────────
// edu_photos(안전교육 사진) 등 업로드된 파일을 /uploads/... URL로 서빙
// UPLOAD_ROOT가 ./public/uploads이면 /static/uploads/*와 동일하나,
// NAS에서는 UPLOAD_ROOT가 외부 경로(/volume1/safetynote/uploads 등)이므로
// serveStatic으로 처리 불가 → readFileSync로 직접 서빙
app.get('/uploads/*', async (c) => {
  // URL: /uploads/edu_photos/edu_123_1234567890.jpg
  const urlPath = c.req.path  // ex) /uploads/edu_photos/edu_123_xxx.jpg
  const uploadRoot = getUploadRootNow()
  // urlPath에서 /uploads/ 접두사 제거 후 uploadRoot와 결합
  const relPath = urlPath.replace(/^\/uploads\//, '')
  const absPath = join(uploadRoot, relPath)

  if (!existsSync(absPath)) {
    return c.json({ error: 'Not Found' }, 404)
  }

  try {
    const buf  = readFileSync(absPath)
    const ext  = absPath.split('.').pop()?.toLowerCase() || 'bin'
    const mime: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif',  webp: 'image/webp', heic: 'image/heic',
      pdf: 'application/pdf',
    }
    const contentType = mime[ext] || 'application/octet-stream'
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'max-age=86400' },
    })
  } catch (err: any) {
    console.error('[/uploads] 파일 서빙 오류:', err.message)
    return c.json({ error: 'Read Error' }, 500)
  }
})

// ─── API 라우트 ───────────────────────────────────────────────────────
// [RULE-002] NAS 전용 라우트는 app.route() 앞에 등록

// ── NAS 전용: POST /api/auth/register — rawDb 직접 처리 (c.env.DB 없음) ──────
// auth.ts(Cloudflare용)는 c.env.DB.prepare()를 사용 → NAS에서 500 발생
// → rawDb(better-sqlite3 동기)로 동일 로직 구현
app.post('/api/auth/register', async (c) => {
  const reqUser = getUser(c)
  if (!reqUser) return c.json({ error: '인증 필요' }, 401)
  if (reqUser.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const body = await c.req.json().catch(() => ({})) as any
  const {
    username, password, name, grade, role, sub_role,
    ui_role,  // BUG-038: 자가가입 시 ui_role로 전송됨 → sub_role 자동 변환
    department, position, phone,
    company, blood_type, emergency_contact, health_info,
    edu_hire_date, edu_special_electric, edu_special_confined,
    edu_special_loading, edu_experience_date, permissions,
  } = body
  if (!username || !password || !name || !role) {
    return c.json({ error: '필수 항목을 입력하세요.' }, 400)
  }
  // BUG-038: ui_role → sub_role 자동 변환
  // 자가가입(submitRegister)은 sub_role 대신 ui_role을 전송함
  // safety/engineer/site_rep/ceo/sysadmin 등 세부 역할을 sub_role에 저장
  // [FEAT-048] lgu_plus: role='lgu_plus' 단일 역할로 식별 → sub_role은 '' 저장
  const uiRoleToSubRole: Record<string, string> = {
    safety: 'safety', engineer: 'engineer', site_rep: 'site_rep',
    lgu_plus: '',     // [FEAT-048] role='lgu_plus'가 단일 식별자 — sub_role 불필요
    ceo: 'ceo', sysadmin: 'sysadmin', worker: '',
  }
  const effectiveSubRole = sub_role || (ui_role ? (uiRoleToSubRole[ui_role] ?? ui_role) : '')
  let permValue: string | null = null
  if (Array.isArray(permissions) && permissions.length > 0) {
    permValue = JSON.stringify(permissions)
  }
  try {
    rawDb.prepare(
      'INSERT INTO users (' +
      '  username, password_hash, name, grade, role, sub_role,' +
      '  department, position, phone,' +
      '  company, blood_type, emergency_contact, health_info,' +
      '  edu_hire_date, edu_special_electric, edu_special_confined,' +
      '  edu_special_loading, edu_experience_date, permissions' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      username, password, name, grade || '', role, effectiveSubRole,
      department || '', position || '', phone || '',
      company || '', blood_type || '', emergency_contact || '', health_info || '',
      edu_hire_date || '', edu_special_electric || '', edu_special_confined || '',
      edu_special_loading || '', edu_experience_date || '', permValue
    )
    return c.json({ success: true, message: '사용자가 등록되었습니다.' })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 사용 중인 아이디입니다.' }, 409)
    console.error('[NAS register] 등록 실패:', e.message)
    return c.json({ error: '등록 중 오류가 발생했습니다.' }, 500)
  }
})

// ── NAS 전용: POST /api/auth/bulk-register — rawDb 직접 처리 ─────────────────
app.post('/api/auth/bulk-register', async (c) => {
  const reqUser = getUser(c)
  if (!reqUser) return c.json({ error: '인증 필요' }, 401)
  if (reqUser.role !== 'admin') return c.json({ error: '시스템 관리자만 사용할 수 있습니다.' }, 403)
  const body = await c.req.json().catch(() => ({})) as any
  const users: any[] = Array.isArray(body.users) ? body.users : []
  if (users.length === 0) return c.json({ error: '등록할 사용자 목록이 없습니다.' }, 400)
  const results: any[] = []
  for (const u of users) {
    const { username, password, name, role, sub_role,
      department, position, phone, company,
      blood_type, emergency_contact, health_info,
      edu_hire_date, edu_special_electric, edu_special_confined,
      edu_special_loading, edu_experience_date, permissions, grade,
    } = u
    if (!username || !password || !name || !role) {
      results.push({ username, success: false, error: '필수 항목 누락' }); continue
    }
    let permValue: string | null = null
    if (Array.isArray(permissions) && permissions.length > 0) permValue = JSON.stringify(permissions)
    try {
      rawDb.prepare(
        'INSERT INTO users (' +
        '  username, password_hash, name, grade, role, sub_role,' +
        '  department, position, phone, company,' +
        '  blood_type, emergency_contact, health_info,' +
        '  edu_hire_date, edu_special_electric, edu_special_confined,' +
        '  edu_special_loading, edu_experience_date, permissions' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        username.trim(), password, name.trim(), grade || '', role, sub_role || '',
        department || '', position || '', phone || '', company || '',
        blood_type || '', emergency_contact || '', health_info || '',
        edu_hire_date || '', edu_special_electric || '', edu_special_confined || '',
        edu_special_loading || '', edu_experience_date || '', permValue
      )
      results.push({ username, success: true })
    } catch (e: any) {
      results.push({ username, success: false, error: e.message?.includes('UNIQUE') ? '이미 사용 중인 아이디' : e.message })
    }
  }
  const successCount = results.filter(r => r.success).length
  return c.json({ success: true, total: users.length, registered: successCount, results })
})

app.route('/api/auth', authRoutes)

// ── NAS 전용: tasks/:id/tbm-info — tbm-extra.ts (RULE-002: taskRoutes 앞에 등록)
registerTbmTasksRoute(app)

// ── NAS 전용: PATCH /api/tasks/:id/status — FCM 발송 추가 ────────────────────
// [BUG-011 Fix] tasks.ts(Cloudflare용)에는 FCM 발송 코드가 없음
// → Node.js crypto/https를 사용하는 sendFcmToUsers()를 NAS에서만 호출
// → taskRoutes보다 앞에 등록해서 NAS에서 가로채고, FCM 발송 후 taskRoutes로 위임하지 않고 직접 처리
app.patch('/api/tasks/:id/status', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({})) as any
  const { status, confirmed_address, confirmed_address_source, work_started_at, work_completed_at } = body

  if (!status) return c.json({ error: 'status 필수' }, 400)

  // ── 상태 업데이트 ──────────────────────────────────────────────────────────
  const statusLabel: Record<string, string> = {
    unassigned: '미배정', assigned: '배정완료', working: '작업중',
    in_progress: '진행중', tbm_done: 'TBM완료', work_completed: '작업완료',
    completed: '완료', cancelled: '취소', paused: '일시중지'
  }
  const sLabel = statusLabel[status] || status

  try {
    if (status === 'working') {
      // 3차 GPS: 작업개시 시점 주소 + source + at 함께 저장
      const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
      const addrSource = confirmed_address_source || 'working'
      rawDb.prepare(
        `UPDATE tasks SET status=?, confirmed_address=?, confirmed_address_source=?, confirmed_address_at=?,
         work_started_at=COALESCE(work_started_at,?), updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).run(status, confirmed_address || null, confirmed_address ? addrSource : null, confirmed_address ? nowKst : null,
            work_started_at || nowKst, id)
    } else if (status === 'work_completed') {
      rawDb.prepare(
        `UPDATE tasks SET status=?, work_completed_at=?, work_log_required=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).run(status, work_completed_at || kstNowStr(), id)
    } else if (status === 'completed') {
      rawDb.prepare(
        `UPDATE tasks SET status=?, work_log_required=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).run(status, id)
    } else {
      rawDb.prepare(
        `UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).run(status, id)
    }
  } catch (e: any) {
    console.error('[PATCH /tasks/:id/status] DB 업데이트 실패:', e.message)
    return c.json({ error: '상태 업데이트 실패' }, 500)
  }

  // ── 작업 정보 조회 (알림용) ─────────────────────────────────────────────────
  let taskTitle = String(id), taskNumDisplay = String(id)
  let supervisorId: number | null = null
  let workerIds: number[] = []
  try {
    const taskRow = rawDb.prepare(
      `SELECT t.title, t.supervisor_id, t.work_number, t.sub_task_number, t.task_number,
              GROUP_CONCAT(ta.worker_id) as worker_ids
       FROM tasks t
       LEFT JOIN task_assignments ta ON ta.task_id = t.id
       WHERE t.id = ? GROUP BY t.id`
    ).get(id) as any
    if (taskRow) {
      taskTitle = taskRow.title || String(id)
      supervisorId = taskRow.supervisor_id || null
      taskNumDisplay = taskRow.work_number
        ? (taskRow.sub_task_number ? `${taskRow.work_number}-${taskRow.sub_task_number}` : taskRow.work_number)
        : (taskRow.task_number || String(id))
      if (taskRow.worker_ids) {
        workerIds = String(taskRow.worker_ids).split(',').map(Number).filter(Boolean)
      }
    }
  } catch(_) {}

  const statusMsg = `[작업상태] "${taskTitle}": ${user.name}님이 상태를 [${sLabel}]로 변경했습니다.`

  // ── SSE 실시간 알림 — [FEAT-029] group_permissions 기반 ──────────────────
  try {
    const ssePayload = {
      type: 'task_status', taskId: id, status, statusLabel: sLabel,
      actor: user.name, title: taskTitle, message: statusMsg, ts: Date.now()
    }
    // notify_all_tasks 권한 그룹에게 SSE
    const sseAllTargets = getUsersWithPerm('notify_all_tasks', user.id)
    for (const uid of sseAllTargets) sendToUser(uid, ssePayload)
    // notify_own_task 권한 그룹 중 배정된 작업자에게 SSE
    const sseOwnPerm = getUsersWithPerm('notify_own_task')
    for (const wid of workerIds) {
      if (wid !== user.id && sseOwnPerm.includes(wid) && !sseAllTargets.includes(wid)) {
        sendToUser(wid, ssePayload)
      }
    }
  } catch(_) {}

  // ── notifications DB 저장 — [FEAT-029] group_permissions 기반 ────────────
  try {
    const notifTitle = `작업 상태 변경: ${sLabel}`
    const notifTargets = getUsersWithPerm('notify_all_tasks', user.id)
    // notify_own_task 그룹 중 배정 작업자도 추가
    const notifOwnPerm = getUsersWithPerm('notify_own_task')
    for (const wid of workerIds) {
      if (wid !== user.id && notifOwnPerm.includes(wid) && !notifTargets.includes(wid)) {
        notifTargets.push(wid)
      }
    }
    for (const uid of notifTargets) {
      rawDb.prepare(
        `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
         VALUES (?, 'task_status_change', ?, ?, ?, 'task', 0)`
      ).run(uid, notifTitle, statusMsg, id)
    }
  } catch(_) {}

  // ── FCM 발송 — [FEAT-029] group_permissions 기반 수신자 결정 ──────────────
  // notify_all_tasks=1 그룹: 전체 작업 알림 수신 (기존 관리감독자/총괄책임자/대표이사)
  // notify_own_task=1 그룹:  본인 배정 작업 알림 (배정 작업자)
  // notify_lgu_tasks=1 그룹: LGU+ 대상 작업 알림 (별도 블록에서 처리)
  const FCM_NOTIFY_STATUSES = ['tbm_done', 'working', 'work_completed', 'completed', 'cancelled']
  if (FCM_NOTIFY_STATUSES.includes(status)) {
    try {
      const fcmTitle = `작업 상태 변경: ${sLabel}`
      const fcmBody  = `[${taskNumDisplay}] "${taskTitle}" 작업이 [${sLabel}]로 변경되었습니다. (${user.name})`
      const fcmData  = { type: 'task_status', taskId: String(id), status }

      // ① notify_all_tasks 권한 그룹 → 전체 알림 수신
      const allTaskTargets = getUsersWithPerm('notify_all_tasks', user.id)

      // ② notify_own_task 권한 그룹 중 배정된 작업자만 추가
      const ownTaskPerm = getUsersWithPerm('notify_own_task')
      for (const wid of workerIds) {
        if (wid !== user.id && ownTaskPerm.includes(wid) && !allTaskTargets.includes(wid)) {
          allTaskTargets.push(wid)
        }
      }

      if (allTaskTargets.length > 0) {
        console.log(`[FCM/FEAT-029] 작업상태 변경 발송 — task:${id} status:${status} → targets:${allTaskTargets}`)
        sendFcmToUsers(allTaskTargets, { title: fcmTitle, body: fcmBody, data: fcmData })
          .catch((e: any) => console.error('[FCM] 작업상태 FCM 오류:', e.message))
      }
    } catch(e: any) {
      console.error('[FCM] 작업상태 FCM 준비 오류:', e.message)
    }
  }

  // ── [FEAT-029] LGU+ 알림 — notify_lgu_tasks 그룹 + is_auto_request_no=0 조건 ──
  try {
    const lguNotifyKey = `lgu_notify_${status}`
    const lguEnabled = getSetting(lguNotifyKey)
    if (lguEnabled === '1') {
      const taskConRow = rawDb.prepare(
        `SELECT c.is_auto_request_no, c.request_no as c_req
         FROM tasks t LEFT JOIN constructions c ON c.id = t.construction_id
         WHERE t.id = ?`
      ).get(id) as any
      // is_auto_request_no === 0 인 경우만 LGU+ 알림 발송
      const isLguTarget = taskConRow?.is_auto_request_no === 0
      if (isLguTarget) {
        // notify_lgu_tasks 권한 그룹 조회 (group_permissions 기반)
        const lguIds = getUsersWithPerm('notify_lgu_tasks').filter(uid => uid !== user.id)
        if (lguIds.length > 0) {
          const lguFcmTitle = `[LGU+] 작업 상태 변경: ${sLabel}`
          const lguFcmBody  = `[${taskNumDisplay}] "${taskTitle}" 작업이 [${sLabel}]로 변경되었습니다. (${user.name})`
          console.log(`[FCM/LGU+/FEAT-029] 발송 — task:${id} conReq:${taskConRow?.c_req} → lgu:${lguIds}`)
          sendFcmToUsers(lguIds, {
            title: lguFcmTitle, body: lguFcmBody,
            data:  { type: 'task_status_lgu', taskId: String(id), status }
          }).catch((e: any) => console.error('[FCM/LGU+] FCM 오류:', e.message))
          try {
            for (const lguUid of lguIds) {
              rawDb.prepare(
                `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
                 VALUES (?, 'task_status_lgu', ?, ?, ?, 'task', 0)`
              ).run(lguUid, lguFcmTitle, lguFcmBody, id)
            }
          } catch(_) {}
        }
      }
    }
  } catch(e: any) {
    console.error('[FCM/LGU+] LGU+ 알림 준비 오류:', e.message)
  }

  return c.json({ success: true })
})

// ─── [BUG-087] NAS 전용: DELETE /api/tasks/:id — rawDb로 완전한 연쇄 삭제 ────
// tasks.ts(Cloudflare D1)의 safeDelete 체인이 NAS SQLite FK 환경에서 실패하는 문제 해결
// rawDb를 직접 사용하여 FK pragma 비활성화 후 순차 삭제
// [FEAT-060] 등록자: unassigned/assigned 상태(위험성평가 전 단계)에서 추가 허용
app.delete('/api/tasks/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: '잘못된 ID' }, 400)

  const taskRow: any = rawDb.prepare(`SELECT id, status, title, created_by FROM tasks WHERE id = ?`).get(id)
  if (!taskRow) return c.json({ error: '작업을 찾을 수 없습니다.' }, 404)

  const isSysAdmin = user.role === 'admin' && user.position === '시스템관리자'
  const isCreator  = user.id === taskRow.created_by

  // [FEAT-053] 시스템관리자: 완료(completed) 또는 취소(cancelled) 상태만 허용
  if (isSysAdmin) {
    if (taskRow.status !== 'completed' && taskRow.status !== 'cancelled') {
      return c.json({ error: `완료 또는 취소된 작업만 삭제할 수 있습니다. 현재 상태: ${taskRow.status}` }, 409)
    }
  } else if (isCreator) {
    // [FEAT-060] 등록자: 위험성평가 전 단계(unassigned/assigned)만 허용
    const PRE_CHECKLIST = ['unassigned', 'assigned']
    if (!PRE_CHECKLIST.includes(taskRow.status)) {
      return c.json({ error: `위험성(체크리스트)평가 이전 단계(작업지시·작업등록)의 작업만 삭제할 수 있습니다. 현재 상태: ${taskRow.status}` }, 409)
    }
  } else {
    return c.json({ error: '삭제 권한이 없습니다. 등록자 또는 시스템 관리자만 삭제할 수 있습니다.' }, 403)
  }

  try {
    // FK 제약 임시 비활성화 (NAS SQLite 환경에서 안전한 연쇄 삭제)
    rawDb.exec('PRAGMA foreign_keys = OFF')

    const sd = (sql: string, ...params: any[]) => {
      try { rawDb.prepare(sql).run(...params) } catch(e: any) {
        if (!e.message?.includes('no such table') && !e.message?.includes('no such column'))
          console.warn(`[BUG-087/safeDelete] ${e.message} | SQL: ${sql.slice(0,80)}`)
      }
    }

    // ① TBM 관련 (tbm_records 참조 자식 먼저)
    sd(`DELETE FROM tbm_signatures   WHERE tbm_id IN (SELECT id FROM tbm_records WHERE task_id=?)`, id)
    sd(`DELETE FROM tbm_share_tokens WHERE tbm_id IN (SELECT id FROM tbm_records WHERE task_id=?)`, id)
    sd(`DELETE FROM signature_requests WHERE ref_type='tbm' AND ref_id IN (SELECT id FROM tbm_records WHERE task_id=?)`, id)
    sd(`DELETE FROM notifications      WHERE ref_type='tbm' AND ref_id IN (SELECT id FROM tbm_records WHERE task_id=?)`, id)
    sd(`DELETE FROM tbm_records WHERE task_id=?`, id)

    // ② checklist 관련
    sd(`DELETE FROM tbm_photo_items WHERE section_id IN (SELECT id FROM tbm_photo_sections WHERE assessment_id IN (SELECT id FROM checklist_assessments WHERE task_id=?))`, id)
    sd(`DELETE FROM tbm_photo_sections WHERE assessment_id IN (SELECT id FROM checklist_assessments WHERE task_id=?)`, id)
    sd(`DELETE FROM checklist_responses WHERE assessment_id IN (SELECT id FROM checklist_assessments WHERE task_id=?)`, id)
    sd(`DELETE FROM checklist_assessments WHERE task_id=?`, id)

    // ③ risk 관련
    sd(`DELETE FROM risk_assessment_details WHERE assessment_id IN (SELECT id FROM risk_assessments WHERE task_id=?)`, id)
    sd(`DELETE FROM risk_assessments WHERE task_id=?`, id)

    // ④ 기타 task 연관 테이블
    sd(`DELETE FROM task_stops        WHERE task_id=?`, id)
    sd(`DELETE FROM work_logs         WHERE task_id=?`, id)
    sd(`DELETE FROM task_photos       WHERE task_id=?`, id)
    sd(`DELETE FROM notifications     WHERE ref_type='task' AND ref_id=?`, id)
    sd(`DELETE FROM signature_requests WHERE ref_type='task' AND ref_id=?`, id)

    // ⑤ 첨부파일 물리 삭제
    try {
      const attRows: any[] = rawDb.prepare(`SELECT file_path FROM task_attachments WHERE task_id=?`).all(id)
      for (const att of attRows) {
        if (att.file_path) {
          try { require('fs').unlinkSync(att.file_path) } catch(_) {}
        }
      }
    } catch(_) {}
    sd(`DELETE FROM task_attachments WHERE task_id=?`, id)
    sd(`DELETE FROM task_assignments WHERE task_id=?`, id)
    sd(`DELETE FROM task_work_types  WHERE task_id=?`, id)

    // ⑥ tasks 본체 삭제
    rawDb.prepare(`DELETE FROM tasks WHERE id=?`).run(id)

    console.log(`[BUG-087] 작업 삭제 완료: task_id=${id} title="${taskRow.title}" by ${user.name}`)
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[BUG-087] 작업 삭제 실패:', e.message)
    return c.json({ error: e.message || '삭제 실패' }, 500)
  } finally {
    // FK 제약 반드시 재활성화
    try { rawDb.exec('PRAGMA foreign_keys = ON') } catch(_) {}
  }
})

app.route('/api/tasks', taskRoutes)

// ─── [BUG-104] NAS 전용: DELETE /api/users/:id/hard-delete ──────────────────
// src/routes/users.ts(D1)의 hard-delete가 NAS에서 c.env.DB(undefined) → 500 오류 해결
// rawDb 직접 사용 + PRAGMA foreign_keys OFF 연쇄 삭제
// RULE-002: /api/users/:id/hard-delete 고정 경로를 app.route('/api/users') 동적 라우트보다 먼저 등록
app.delete('/api/users/:id/hard-delete', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)

  // 시스템관리자 여부 추가 확인
  const meRow: any = rawDb.prepare('SELECT position FROM users WHERE id = ?').get(user.id)
  if (!meRow || meRow.position !== '시스템관리자') {
    return c.json({ error: '시스템관리자 전용 기능입니다.' }, 403)
  }

  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: '잘못된 ID' }, 400)

  // 자기 자신 삭제 방지
  if (id === user.id) return c.json({ error: '자신의 계정은 삭제할 수 없습니다.' }, 400)

  const targetRow: any = rawDb.prepare('SELECT id, name FROM users WHERE id = ?').get(id)
  if (!targetRow) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)

  try {
    rawDb.exec('PRAGMA foreign_keys = OFF')

    const sd = (sql: string, ...params: any[]) => {
      try { rawDb.prepare(sql).run(...params) } catch(e: any) {
        if (!e.message?.includes('no such table') && !e.message?.includes('no such column'))
          console.warn(`[BUG-104/hard-delete] ${e.message} | SQL: ${sql.slice(0,80)}`)
      }
    }

    // ① 서명 요청 (signature_requests)
    sd('DELETE FROM signature_requests WHERE requester_id = ? OR target_user_id = ?', id, id)

    // ② TBM 서명 (tbm_signatures)
    sd('DELETE FROM tbm_signatures WHERE user_id = ?', id)

    // ③ 알림 (notifications)
    sd('DELETE FROM notifications WHERE user_id = ?', id)

    // ④ TBM 참석자 연결 정리 (tbm_records conductor — 이름 필드이므로 NULL 처리)
    // tbm_records.conductor_name 은 TEXT이므로 직접 삭제 불필요

    // ⑤ 안전교육 참석자 (education_attendees)
    sd('DELETE FROM education_attendees WHERE user_id = ?', id)

    // ⑥ 현장점검 작업자 (inspection_workers)
    sd('DELETE FROM inspection_workers WHERE user_id = ?', id)

    // ⑦ 작업 배정 (task_assignments)
    sd('DELETE FROM task_assignments WHERE worker_id = ?', id)

    // ⑧ work_logs
    sd('DELETE FROM work_logs WHERE worker_id = ?', id)

    // ⑨ team_id 정리 (팀장/팀원 참조 해제)
    sd('UPDATE users SET team_id = NULL, is_leader = 0 WHERE id = ?', id)

    // ⑩ 마지막으로 users 본체 삭제
    rawDb.prepare('DELETE FROM users WHERE id = ?').run(id)

    console.log(`[BUG-104] 사용자 완전 삭제 완료: user_id=${id} name="${targetRow.name}" by ${user.name}`)
    return c.json({ success: true })
  } catch (e: any) {
    console.error('[BUG-104] 사용자 삭제 실패:', e.message)
    return c.json({ error: e.message || '사용자 삭제 실패' }, 500)
  } finally {
    try { rawDb.exec('PRAGMA foreign_keys = ON') } catch(_) {}
  }
})

app.route('/api/users', userRoutes)
app.route('/api/risk', riskRoutes)

// ─── NAS 전용: DB 진단 API (BUG-075/076 디버깅용) ───────────────────────────
// GET /api/diagnostics/risk-db — risk 관련 테이블 상태 + work_type별 항목 수 상세
app.get('/api/diagnostics/risk-db', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '로그인 필요' }, 401)
  // worker 제외, admin/supervisor/manager 모두 허용
  if (user.role === 'worker') return c.json({ error: '관리자만 사용 가능' }, 403)
  try {
    const tables = (rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((r: any) => r.name)
    const hasCats  = tables.includes('work_categories')
    const hasTypes = tables.includes('work_types')
    const hasItems = tables.includes('risk_assessment_items')

    const catCount   = hasCats  ? (rawDb.prepare('SELECT COUNT(*) as c FROM work_categories').get() as any).c : 0
    const typeCount  = hasTypes ? (rawDb.prepare('SELECT COUNT(*) as c FROM work_types').get() as any).c : 0
    const itemCount  = hasItems ? (rawDb.prepare('SELECT COUNT(*) as c FROM risk_assessment_items').get() as any).c : 0
    const itemActive = hasItems ? (rawDb.prepare("SELECT COUNT(*) as c FROM risk_assessment_items WHERE COALESCE(is_active,1)=1").get() as any).c : 0

    const cats  = hasCats  ? rawDb.prepare('SELECT id, name FROM work_categories ORDER BY id').all() : []
    const types = hasTypes ? rawDb.prepare('SELECT id, category_id, name FROM work_types ORDER BY id').all() : []
    const itemCols = hasItems ? (rawDb.prepare('PRAGMA table_info(risk_assessment_items)').all() as any[]).map((r: any) => r.name) : []

    // work_type별 항목 수 (복원 상태 상세 파악용)
    const itemsByType = (hasItems && hasTypes) ? rawDb.prepare(`
      SELECT wt.id as type_id, wt.name as type_name, wc.name as cat_name,
             COUNT(rai.id) as total,
             SUM(CASE WHEN COALESCE(rai.is_active,1)=1 THEN 1 ELSE 0 END) as active
      FROM work_types wt
      LEFT JOIN work_categories wc ON wc.id = wt.category_id
      LEFT JOIN risk_assessment_items rai ON rai.work_type_id = wt.id
      GROUP BY wt.id ORDER BY wt.id
    `).all() : []

    // items의 work_type_id 분포 (orphan 감지용: work_types에 없는 id 포함)
    const itemsWtDist = hasItems ? rawDb.prepare(`
      SELECT work_type_id, COUNT(*) as cnt,
             SUM(CASE WHEN COALESCE(is_active,1)=1 THEN 1 ELSE 0 END) as active_cnt
      FROM risk_assessment_items
      GROUP BY work_type_id ORDER BY work_type_id
    `).all() : []

    // orphan items (work_types에 없는 work_type_id 참조하는 items)
    const orphanItems = (hasItems && hasTypes) ? rawDb.prepare(`
      SELECT rai.work_type_id, COUNT(rai.id) as cnt
      FROM risk_assessment_items rai
      LEFT JOIN work_types wt ON wt.id = rai.work_type_id
      WHERE wt.id IS NULL
      GROUP BY rai.work_type_id ORDER BY rai.work_type_id
    `).all() : []

    // created_at 컬럼 존재 여부 확인 (patchSchema v0.151 이전 DB 방어)
    const hasCreatedAt = itemCols.includes('created_at')
    const hasCategoryCol = itemCols.includes('category')

    // 최근 추가된 항목 5건 (복원 시점 확인용)
    const recentItems = hasItems ? rawDb.prepare(`
      SELECT id, work_type_id, hazard${hasCreatedAt ? ', created_at' : ", '' as created_at"}
      FROM risk_assessment_items
      ORDER BY id DESC LIMIT 5
    `).all() : []

    // 가장 오래된 항목 (기존 데이터 기준)
    const oldestItem = hasItems ? rawDb.prepare(`
      SELECT id, work_type_id, hazard${hasCreatedAt ? ', created_at' : ", '' as created_at"}
      FROM risk_assessment_items
      ORDER BY id ASC LIMIT 1
    `).get() : null

    // category 컬럼 분포 (분류별 항목 현황 파악용)
    const categoryDist = (hasItems && hasCategoryCol) ? rawDb.prepare(`
      SELECT COALESCE(category,'') as category, COUNT(*) as cnt
      FROM risk_assessment_items
      GROUP BY category ORDER BY category
    `).all() : []

    return c.json({
      tables_exist: { work_categories: hasCats, work_types: hasTypes, risk_assessment_items: hasItems },
      counts: { work_categories: catCount, work_types: typeCount, risk_assessment_items: itemCount, items_active: itemActive },
      work_categories: cats,
      work_types: types,
      items_by_type: itemsByType,
      items_wt_distribution: itemsWtDist,
      orphan_items: orphanItems,
      recent_items: recentItems,
      oldest_item: oldestItem,
      risk_assessment_items_columns: itemCols,
      category_distribution: categoryDist,
    })
  } catch(e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ── [BUG-076] POST /api/admin/risk-master-restore — 위험성평가 마스터 데이터 클린 리셋 ──
// reset_risk_master_data.sql 파일을 실행하여 work_categories/work_types/risk_assessment_items 완전 교체
// ⚠️ 기존 NAS의 분류별 항목 데이터가 모두 삭제되고 개발 DB 기준으로 교체됨
app.post('/api/admin/risk-master-restore', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '로그인 필요' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자만 실행 가능합니다.' }, 403)
  try {
    const cwd2 = process.cwd()
    const scriptDir2 = (() => { try { return dirname(fileURLToPath(import.meta.url)) } catch(_) { return cwd2 } })()
    const candidates2 = [
      join(cwd2, 'reset_risk_master_data.sql'),
      join(scriptDir2, 'reset_risk_master_data.sql'),
      '/volume1/safetynote/reset_risk_master_data.sql'
    ]
    const sqlPath = candidates2.find(p => existsSync(p)) ?? null
    if (!sqlPath) {
      return c.json({ error: `reset_risk_master_data.sql 파일이 없습니다. 탐색 경로: ${candidates2.join(', ')} — git pull 후 재시도하세요.` }, 404)
    }
    const sql = readFileSync(sqlPath, 'utf-8') as string
    const beforeItems = (rawDb.prepare('SELECT COUNT(*) as c FROM risk_assessment_items').get() as any).c
    const beforeTypes = (rawDb.prepare('SELECT COUNT(*) as c FROM work_types').get() as any).c
    const beforeCats  = (rawDb.prepare('SELECT COUNT(*) as c FROM work_categories').get() as any).c
    rawDb.exec(sql)
    const afterItems = (rawDb.prepare('SELECT COUNT(*) as c FROM risk_assessment_items').get() as any).c
    const afterTypes = (rawDb.prepare('SELECT COUNT(*) as c FROM work_types').get() as any).c
    const afterCats  = (rawDb.prepare('SELECT COUNT(*) as c FROM work_categories').get() as any).c
    console.log(`[BUG-076] risk master clean reset: cats ${beforeCats}→${afterCats} types ${beforeTypes}→${afterTypes} items ${beforeItems}→${afterItems}`)
    return c.json({
      success: true,
      before: { work_categories: beforeCats, work_types: beforeTypes, risk_assessment_items: beforeItems },
      after:  { work_categories: afterCats,  work_types: afterTypes,  risk_assessment_items: afterItems }
    })
  } catch(e: any) {
    console.error('[BUG-076] risk-master-restore error:', e.message)
    return c.json({ error: e.message || '클린 리셋 실패' }, 500)
  }
})
// ─── FEAT-037: POST /api/tbm/:id/share-token (RULE-002: tbmExtraRoutes·tbmRoutes 앞에 등록) ───
// 공유 토큰 발급 (로그인 필요, 7일 유효, 기존 유효 토큰 재사용)
// 응답에 텍스트 복사용 작업 정보 포함
app.post('/api/tbm/:id/share-token', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const tbmId = Number(c.req.param('id'))

  // TBM + 작업 기본정보 조회 (텍스트 복사용)
  const tbmRow = rawDb.prepare(`
    SELECT tbm.id, tbm.task_id, tbm.attendees,
           tbm.gps_address,
           tk.work_number, tk.sub_task_number, tk.title AS task_title,
           tk.gps_address AS task_gps_address,
           tk.confirmed_address AS task_confirmed_address,
           tk.contractor_name,
           tk.lgu_supervisor
    FROM tbm_records tbm
    LEFT JOIN tasks tk ON tk.id = tbm.task_id
    WHERE tbm.id = ?
  `).get(tbmId) as any
  if (!tbmRow) return c.json({ error: 'TBM 없음' }, 404)

  // 배정 작업자 목록
  let assignedWorkers: string[] = []
  if (tbmRow.task_id) {
    try {
      const wRows = rawDb.prepare(
        `SELECT u.name FROM task_assignments ta JOIN users u ON u.id = ta.worker_id WHERE ta.task_id = ? ORDER BY u.name`
      ).all(tbmRow.task_id) as any[]
      assignedWorkers = wRows.map((r: any) => r.name).filter(Boolean)
    } catch(_) {}
  }

  // attendees (TBM 참석자) — 배정 작업자와 다를 수 있으므로 별도 반환
  let attendees: string[] = []
  try { attendees = typeof tbmRow.attendees === 'string' ? JSON.parse(tbmRow.attendees) : (tbmRow.attendees || []) } catch(_) {}

  // 기존 유효 토큰 재사용 (7일 이내)
  const existing = rawDb.prepare(
    `SELECT token FROM tbm_share_tokens WHERE tbm_id = ? AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`
  ).get(tbmId) as any

  let token: string
  if (existing?.token) {
    token = existing.token
  } else {
    // 새 토큰 생성
    token = crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    rawDb.prepare(
      `INSERT INTO tbm_share_tokens (token, tbm_id, task_id, expires_at) VALUES (?, ?, ?, ?)`
    ).run(token, tbmId, tbmRow.task_id || null, expiresAt)
  }

  return c.json({
    token,
    url: `/tbm-share/${token}`,
    // 텍스트 복사용 정보
    work_number:       tbmRow.work_number || '',
    sub_task_number:   tbmRow.sub_task_number || '',
    task_title:        tbmRow.task_title || '',
    contractor_name:   tbmRow.contractor_name || '',   // 공사담당자 (담당자)
    lgu_supervisor:    tbmRow.lgu_supervisor || '',    // 공사감독자
    assigned_workers:  assignedWorkers,
    attendees,
    gps_address:       tbmRow.task_confirmed_address || tbmRow.gps_address || tbmRow.task_gps_address || ''
  })
})

// ─── [FEAT-052] NAS 전용: POST /api/tbm — TBM 생성 후 planned_date 자동갱신 ──
// RULE-002: tbmExtraRoutes·tbmRoutes 앞에 등록 (NAS에서 가로채기)
// 로직: TBM 등록 시점의 KST 날짜가 tasks.planned_date보다 늦으면 자동 갱신
// (FEAT-033 체크리스트 완료 자동갱신과 동일 패턴, TBM 완료 트리거 추가)
app.post('/api/tbm', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  // ① 요청 본문 읽기 (tbm.ts 원본에 그대로 전달하기 위해 clone)
  const body = await c.req.json().catch(() => ({})) as any
  const { task_id, location, weather, temperature, workers_count, attendees,
    safety_topics, precautions, special_notes, signature_data,
    gps_address, gps_lat, gps_lon } = body

  if (!task_id) return c.json({ error: 'task_id 필수' }, 400)

  // ② TBM 레코드 삽입 (tbm.ts 원본 로직 동일)
  let tbmId: number
  try {
    const ins = rawDb.prepare(
      `INSERT INTO tbm_records (task_id, conductor_id, location, weather, temperature, workers_count,
       attendees, safety_topics, precautions, special_notes, signature_data, status,
       gps_address, gps_lat, gps_lon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`
    ).run(
      task_id, user.id, location || '', weather || '', temperature || '',
      workers_count || 1, JSON.stringify(attendees || []),
      safety_topics || '', precautions || '', special_notes || '',
      signature_data || '',
      gps_address || null, gps_lat || null, gps_lon || null
    )
    tbmId = Number(ins.lastInsertRowid)
  } catch (e: any) {
    console.error('[FEAT-052] TBM 삽입 실패:', e.message)
    return c.json({ error: 'TBM 저장 실패' }, 500)
  }

  // ③ tasks 상태 → tbm_done (tbm.ts 원본 동일)
  try {
    rawDb.prepare(`UPDATE tasks SET status='tbm_done', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(task_id)
  } catch(e: any) { console.warn('[FEAT-052] task status 업데이트 실패(무시):', e.message) }

  // ③-B confirmed_address 갱신: GPS 주소 우선, 없으면 location 텍스트 (tbm.ts 원본 동일)
  // 2차 GPS — TBM 처리 시점의 실제 현장 주소를 tasks.confirmed_address에 저장
  try {
    const tbmConfirmedAddr = gps_address || location || ''
    if (tbmConfirmedAddr) {
      const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
      rawDb.prepare(
        `UPDATE tasks SET confirmed_address=?, confirmed_address_source='tbm', confirmed_address_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).run(tbmConfirmedAddr, nowKst, task_id)
      console.log(`[FEAT-052] confirmed_address 갱신(TBM): task_id=${task_id} addr="${tbmConfirmedAddr}"`)
    }
    // TBM GPS 주소가 있고, work_start_address 미설정인 경우 기입
    if (gps_address) {
      const taskRowAddr: any = rawDb.prepare(`SELECT work_start_address FROM tasks WHERE id=?`).get(task_id)
      if (!taskRowAddr?.work_start_address) {
        const tbmTs = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
        rawDb.prepare(
          `UPDATE tasks SET work_start_address=?, work_start_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
        ).run(gps_address, tbmTs, task_id)
        console.log(`[FEAT-052] work_start_address 기입(TBM): task_id=${task_id} addr="${gps_address}"`)
      }
    }
  } catch(e: any) { console.warn('[FEAT-052] confirmed_address 갱신 실패(무시):', e.message) }

  // ④ [FEAT-052] TBM 등록 시점 KST 날짜가 planned_date보다 늦으면 자동 갱신
  try {
    const nowTs  = new Date()
    const kstTs  = new Date(nowTs.getTime() + 9 * 60 * 60 * 1000)
    const kstDateStr = kstTs.toISOString().slice(0, 10) // 'YYYY-MM-DD'
    const pRow: any = rawDb.prepare(`SELECT planned_date FROM tasks WHERE id=?`).get(task_id)
    const currentPlanned = pRow?.planned_date ? String(pRow.planned_date).slice(0, 10) : null
    if (kstDateStr > (currentPlanned || '')) {
      rawDb.prepare(`UPDATE tasks SET planned_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(kstDateStr, task_id)
      console.log(`[FEAT-052] planned_date 자동갱신(TBM완료): task_id=${task_id} ${currentPlanned||'null'} → ${kstDateStr}`)
    }
  } catch(e: any) {
    console.warn('[FEAT-052] planned_date 자동갱신 실패(무시):', e.message)
  }

  // ⑤ 안전관리자 결재 서명 요청 알림 (tbm.ts 원본 로직 이관)
  try {
    const taskRow: any = rawDb.prepare(`SELECT title, task_number FROM tasks WHERE id=?`).get(task_id)
    const tbmTitle = `TBM: ${taskRow?.title || task_id}`
    const safetyUsers: any[] = rawDb.prepare(
      `SELECT id, name FROM users WHERE position='안전관리자' AND is_active=1`
    ).all()
    for (const su of safetyUsers) {
      const already = rawDb.prepare(
        `SELECT id FROM signature_requests WHERE ref_type='tbm' AND ref_id=? AND ref_sub_type='approval_safety' AND target_user_id=? AND status='pending'`
      ).get(tbmId, su.id)
      if (!already) {
        const reqIns = rawDb.prepare(`
          INSERT INTO signature_requests (ref_type, ref_id, ref_sub_type, title, description, requester_id, target_user_id)
          VALUES ('tbm', ?, 'approval_safety', ?, ?, ?, ?)
        `).run(tbmId, `[결재요청] ${tbmTitle}`, `TBM이 완료되었습니다. 안전관리자 서명을 요청합니다.`, user.id, su.id)
        sendToUser(su.id, {
          type: 'sign_request', id: Number(reqIns.lastInsertRowid),
          title: `[TBM 결재요청] ${tbmTitle}`,
          requester: user.name, ref_type: 'tbm', ref_sub_type: 'approval_safety',
          message: `[TBM 완료] TBM이 등록되었습니다. 안전관리자 서명을 요청합니다.`,
          ts: Date.now()
        })
        rawDb.prepare(`
          INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
          VALUES (?, 'sign_request', ?, ?, ?, 'tbm', 0)
        `).run(su.id, `[TBM 결재요청] ${tbmTitle}`, `TBM이 등록되었습니다. 안전관리자 서명을 요청합니다.`, tbmId)
      }
    }
  } catch(e: any) { console.warn('[FEAT-052] 결재 서명 요청 알림 실패(무시):', e.message) }

  // ⑥ LGU+ FCM 알림 (tbm.ts 원본 로직 이관, FCM_NOTIFY_STATUSES에 tbm_done 포함)
  try {
    const FCM_TBM_COND = `(COALESCE(con.is_auto_request_no,-1)=0)`
    const taskRow2: any = rawDb.prepare(
      `SELECT t.title, t.task_number, t.work_number, t.sub_task_number, t.supervisor_id,
              GROUP_CONCAT(ta.worker_id) as worker_ids,
              c.is_auto_request_no
       FROM tasks t
       LEFT JOIN task_assignments ta ON ta.task_id=t.id
       LEFT JOIN constructions c ON c.id=t.construction_id
       WHERE t.id=? GROUP BY t.id`
    ).get(task_id) as any
    if (taskRow2) {
      const tNum = taskRow2.work_number
        ? (taskRow2.sub_task_number ? `${taskRow2.work_number}-${taskRow2.sub_task_number}` : taskRow2.work_number)
        : (taskRow2.task_number || String(task_id))
      const statusMsg = `[작업상태] \"${taskRow2.title || task_id}\": ${user.name}님이 상태를 [TBM완료]로 변경했습니다.`
      // SSE 실시간 알림
      const ssePayload = { type:'task_status', taskId:task_id, status:'tbm_done', statusLabel:'TBM완료',
        actor:user.name, title:taskRow2.title||String(task_id), message:statusMsg, ts:Date.now() }
      const sseAllTargets = getUsersWithPerm('notify_all_tasks', user.id)
      for (const uid of sseAllTargets) sendToUser(uid, ssePayload)
    }
  } catch(e: any) { console.warn('[FEAT-052] SSE 알림 실패(무시):', e.message) }

  return c.json({ success: true, id: tbmId })
})

// ─── BUG-091: NAS TBM 단건 GET 오버라이드 — sub_task_number 포함 (RULE-002) ───
// tbmRoutes의 GET /:id 는 t.sub_task_number 를 조회하지 않아 NAS에서 rawDb로 직접 조회
app.get('/api/tbm/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = Number(c.req.param('id'))
  try {
    const tbm: any = rawDb.prepare(`
      SELECT tr.*, t.title as task_title, t.location, t.task_number, t.sub_task_number,
             t.work_number, t.contractor_name, t.status as task_status,
             u.name as conductor_name, u.position as conductor_position
      FROM tbm_records tr
      LEFT JOIN tasks t ON t.id = tr.task_id
      LEFT JOIN users u ON u.id = tr.conductor_id
      WHERE tr.id = ?
    `).get(id)
    if (!tbm) return c.json({ error: 'TBM 없음' }, 404)
    tbm.attendees = tbm.attendees ? JSON.parse(tbm.attendees) : []
    return c.json(tbm)
  } catch(e: any) {
    console.warn('[BUG-091] TBM 단건 GET 오류:', e.message)
    return c.json({ error: 'TBM 조회 실패' }, 500)
  }
})

// ─── TBM 서명/결재 → nas-routes/tbm-extra.ts (RULE-002: tbmRoutes 앞에 마운트) ─
app.route('/api/tbm', tbmExtraRoutes)
app.route('/api/tbm', tbmRoutes)

// ─── [FEAT-160 / RULE-002] NAS 전용: GET /api/stats/worker/me ─────────────────
// Cloudflare stats.ts의 /worker/:id 와 동일 엔드포인트를 NAS rawDb 로 직접 계산.
// totalReportAmount = 외선일보 + 접속일보 금액 (팀 전체, submitted+confirmed)
// 단가 스냅샷 우선, 없으면 현재 단가 폴백 (FEAT-161 정책)
// RULE-002: statsRoutes app.route 보다 반드시 먼저 등록
app.get('/api/stats/worker/me', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  // getRawDb()는 nas-routes/*.ts 전용 — node-server.ts에서는 rawDb 직접 사용
  const workerId = user.id

  try {
    // ① 작업 상태별 카운트 (본인 배정 작업)
    const taskStats: any[] = rawDb.prepare(
      `SELECT t.status, COUNT(*) as count FROM tasks t
       INNER JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?
       GROUP BY t.status`
    ).all(workerId) as any[]

    // ② 최근 작업일지 10건
    const recentLogs: any[] = rawDb.prepare(
      `SELECT wl.*, t.title as task_title FROM work_logs wl
       LEFT JOIN tasks t ON t.id = wl.task_id WHERE wl.worker_id = ?
       ORDER BY wl.log_date DESC LIMIT 10`
    ).all(workerId) as any[]

    // ③ 총 시공 물량 (기존 필드 — 하위호환 유지)
    const totalQuantityRow: any = rawDb.prepare(
      `SELECT SUM(actual_quantity) as total FROM work_logs WHERE worker_id = ?`
    ).get(workerId) as any

    // ④ 외선일보 총금액: 본인 팀 배정 작업, submitted+confirmed
    //    단가 스냅샷 우선 → 없으면 volume_unit_prices 현재 단가 폴백 (FEAT-161)
    const workReportAmtRow: any = rawDb.prepare(
      `SELECT COALESCE(SUM(
         wre.qty * COALESCE(wre.unit_price_snapshot, vup.unit_price, 0)
       ), 0) AS total
       FROM work_report_extras wre
       JOIN work_reports wr ON wr.id = wre.report_id
       JOIN tasks t ON t.id = wr.task_id
       JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?
       LEFT JOIN volume_unit_prices vup ON vup.item_key = wre.item_key
       WHERE wr.status IN ('submitted','confirmed')`
    ).get(workerId) as any

    // ⑤ 접속일보 총금액: 본인 팀 배정 작업, submitted+confirmed
    //    야간/가공 추가금 포함, 단가 스냅샷 우선 → 없으면 splice_unit_prices 폴백 (FEAT-161)
    const spliceReportAmtRow: any = rawDb.prepare(
      `SELECT COALESCE(SUM(
         swi.qty * (
           COALESCE(swi.unit_price_snapshot,  sup.unit_price,  0)
           + CASE WHEN swi.is_night  = 1 THEN COALESCE(swi.night_price_snapshot,  sup.night_price,  0) ELSE 0 END
           + CASE WHEN swi.is_aerial = 1 THEN COALESCE(swi.aerial_price_snapshot, sup.aerial_price, 0) ELSE 0 END
         )
       ), 0) AS total
       FROM splice_work_items swi
       JOIN splice_reports sr ON sr.id = swi.report_id
       JOIN tasks t ON t.id = sr.task_id
       JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?
       LEFT JOIN splice_unit_prices sup ON sup.item_label = swi.work_label
       WHERE sr.status IN ('submitted','confirmed')`
    ).get(workerId) as any

    const totalReportAmount = Math.round(
      (Number(workReportAmtRow?.total) || 0) + (Number(spliceReportAmtRow?.total) || 0)
    )

    return c.json({
      taskStats,
      recentLogs,
      totalQuantity:     totalQuantityRow?.total || 0,
      totalReportAmount
    })
  } catch(e: any) {
    console.error('[FEAT-160] GET /api/stats/worker/me NAS 오류:', e.message)
    return c.json({ error: e.message || '개인 통계 조회 실패' }, 500)
  }
})
// ─── [FEAT-160] NAS 오버라이드 끝 ──────────────────────────────────────────────

app.route('/api/stats', statsRoutes)

// ─── [RULE-002] NAS 전용: GET /api/inspections/:id — 추가 필드 포함 ──────────────
// inspections.ts GET /:id 는 tasks JOIN에서 sub_task_number, construction_type, work_class,
// contractor_name, supervisor_name, con_request_no, con_title 등을 포함하지 않음
// → NAS rawDb로 직접 조회하여 안전점검일지 출력에 필요한 필드 모두 반환
app.get('/api/inspections/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = Number(c.req.param('id'))
  if (!id) return c.json({ error: '잘못된 ID' }, 400)
  try {
    const ins: any = rawDb.prepare(`
      SELECT si.*,
             u.name    AS inspector_name,
             u.company AS inspector_company,
             t.title AS task_title,
             t.task_number,
             t.sub_task_number,
             t.work_number,
             t.construction_type,
             t.work_class,
             t.contractor_name,
             t.location   AS task_location,
             t.confirmed_address                AS task_confirmed_address,
             t.confirmed_address_source         AS task_confirmed_address_source,
             t.confirmed_address_at             AS task_confirmed_address_at,
             t.work_order_address               AS task_work_order_address,
             sv.name AS supervisor_name,
             c.request_no  AS con_request_no,
             c.title       AS con_title,
             c.manager_name AS con_manager_name
      FROM site_inspections si
      LEFT JOIN users u    ON u.id  = si.inspector_id
      LEFT JOIN tasks t    ON t.id  = si.task_id
      LEFT JOIN users sv   ON sv.id = t.supervisor_id
      LEFT JOIN constructions c ON c.id = t.construction_id
      WHERE si.id = ?
    `).get(id) as any
    if (!ins) return c.json({ error: '점검 없음' }, 404)

    // 사진 목록
    ins.photos = (rawDb.prepare(
      'SELECT * FROM inspection_photos WHERE inspection_id = ? ORDER BY id ASC'
    ).all(id) as any[])

    // 연결된 작업자 목록
    try {
      ins.workers = (rawDb.prepare(`
        SELECT iw.worker_id, iw.result_type, u.name AS worker_name, u.position,
               COALESCE(u.is_leader, 0) AS is_leader
        FROM inspection_workers iw
        JOIN users u ON u.id = iw.worker_id
        WHERE iw.inspection_id = ?
        ORDER BY COALESCE(u.is_leader, 0) DESC, u.name ASC
      `).all(id) as any[])
    } catch (_) {
      ins.workers = []
    }
    // 작업자 없으면 해당 task의 배정 작업자(task_assignments)로 폴백
    if ((!ins.workers || ins.workers.length === 0) && ins.task_id) {
      try {
        const taRows = rawDb.prepare(`
          SELECT u.name AS worker_name, u.position,
                 COALESCE(u.is_leader, 0) AS is_leader
          FROM task_assignments ta
          JOIN users u ON u.id = ta.worker_id
          WHERE ta.task_id = ?
          ORDER BY COALESCE(u.is_leader, 0) DESC, u.name ASC
        `).all(ins.task_id) as any[]
        if (taRows && taRows.length > 0) ins.workers = taRows
      } catch (_) {}
    }
    return c.json(ins)
  } catch (e: any) {
    console.error('[GET /api/inspections/:id NAS] 오류:', e.message)
    return c.json({ error: '점검 조회 실패' }, 500)
  }
})

// 점검 사진/동영상 서빙 - inspectionRoutes보다 먼저 등록해야 인증 없이 <img> 서빙 가능
app.get('/api/inspections/photo/:id/img', async (c) => {
  const photo: any = await DB.prepare(
    'SELECT file_path, file_data, mime_type, file_name FROM inspection_photos WHERE id = ?'
  ).bind(c.req.param('id')).first()
  if (!photo) return c.json({ error: '미디어 없음' }, 404)
  if (photo.file_path && existsSync(photo.file_path)) {
    const mimeType = photo.mime_type || getMimeType(photo.file_path, 'image/jpeg')
    const rangeHeader = c.req.header('Range') || null
    return serveFileWithRange(photo.file_path, rangeHeader, mimeType)
  }
  if (photo.file_data) {
    return new Response(Buffer.from(photo.file_data, 'base64'), {
      headers: { 'Content-Type': photo.mime_type || 'image/jpeg' }
    })
  }
  return c.json({ error: '데이터 없음' }, 404)
})

// ─── 점검 사진 독립 API (NAS 전용) — BUG-035 ─────────────────────────────────
// app.js: POST /api/inspection-photos (점검 사진 별도 업로드, addInsPhoto)
//         DELETE /api/inspection-photos/:id (점검 사진 삭제)
// RULE-002: inspectionRoutes 마운트 앞에 등록

// POST /api/inspection-photos — 기존 점검에 사진 추가 (addInsPhoto 호출)
// formData: inspection_id, photos(File[])
app.post('/api/inspection-photos', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  try {
    const formData     = await c.req.formData()
    const inspectionId = formData.get('inspection_id') as string
    const files        = formData.getAll('photos') as File[]

    if (!inspectionId) return c.json({ error: 'inspection_id 필요' }, 400)
    if (!files || files.length === 0) return c.json({ error: '파일 없음' }, 400)

    // 점검 → 연결된 task_id 조회 (폴더 경로 결정용)
    const ins = rawDb.prepare(
      'SELECT id, task_id FROM site_inspections WHERE id = ?'
    ).get(Number(inspectionId)) as any
    if (!ins) return c.json({ error: '점검 없음' }, 404)

    // [FEAT-050] 업로더(user) 소속 팀명 조회
    const uploaderTeam = rawDb.prepare(
      `SELECT tm.name AS team_name FROM users u LEFT JOIN teams tm ON tm.id = u.team_id WHERE u.id = ?`
    ).get(user.id) as any

    // task_id 있으면 task 정보로 폴더 결정, 없으면 inspection 미분류 폴더
    let task: any = null
    if (ins.task_id) {
      task = rawDb.prepare(
        `SELECT t.task_number, t.sub_task_number, t.work_date, t.planned_date,
                t.construction_type, t.construction_id,
                c.request_no AS con_request_no, c.title AS con_title,
                c.created_at AS con_created_at
         FROM tasks t LEFT JOIN constructions c ON c.id = t.construction_id
         WHERE t.id = ?`
      ).get(Number(ins.task_id)) as any
      // team_name 주입 (업로더 팀 기준)
      if (task) task.team_name = uploaderTeam?.team_name || null
    }

    const uploadDir = getUploadDir(task || '점검', 'inspection')
    const savedIds: number[] = []

    for (const file of files) {
      if (!file || typeof file === 'string') continue

      const fileName = generateFileName(file.name || 'photo.jpg')
      const filePath = join(uploadDir, fileName)
      const buf      = await file.arrayBuffer()
      writeFileSync(filePath, Buffer.from(buf))

      const result = rawDb.prepare(
        `INSERT INTO inspection_photos
           (inspection_id, file_name, file_path, file_data, caption, mime_type)
         VALUES (?, ?, ?, NULL, ?, ?)`
      ).run(
        Number(inspectionId),
        file.name || fileName,
        filePath, '',
        file.type || 'image/jpeg'
      )
      savedIds.push(result.lastInsertRowid as number)
    }

    return c.json({ success: true, ids: savedIds, count: savedIds.length })
  } catch (e: any) {
    console.error('[점검사진] 업로드 오류:', e)
    return c.json({ error: `업로드 실패: ${e.message}` }, 500)
  }
})

// DELETE /api/inspection-photos/:id — 점검 사진 삭제
app.delete('/api/inspection-photos/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = c.req.param('id')

  const photo = rawDb.prepare(
    'SELECT file_path FROM inspection_photos WHERE id = ?'
  ).get(Number(id)) as any
  if (!photo) return c.json({ error: '사진 없음' }, 404)

  if (photo.file_path) {
    try { unlinkSync(photo.file_path) } catch (_) {}
  }
  rawDb.prepare('DELETE FROM inspection_photos WHERE id = ?').run(Number(id))
  return c.json({ success: true })
})

// ─── [RULE-002] NAS 전용: POST /api/inspections — rawDb 직접 처리 ───────────────
// inspections.ts(Cloudflare용)의 POST는 c.env.DB(makeD1 래퍼) 사용
// NAS에서 inspection_workers INSERT 시 에러가 catch(_){} 에 묻혀 저장 실패
// → rawDb(better-sqlite3 동기)로 직접 처리하여 안정성 확보
app.post('/api/inspections', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  const contentType = c.req.header('Content-Type') || ''
  let location = '', inspection_type = 'routine', findings = '', corrective_actions = ''
  let hazard_level = 'low', notes = '', task_id: number | null = null
  let inspection_date_only = '', inspection_result = 'none', result_reason = ''
  let photoFiles: File[] = []
  let legacyPhotos: any[] = []
  let workerIds: number[] = []

  try {
    if (contentType.includes('multipart/form-data')) {
      const fd = await c.req.formData()
      location             = (fd.get('location')             as string) || ''
      inspection_type      = (fd.get('inspection_type')      as string) || 'routine'
      findings             = (fd.get('findings')             as string) || ''
      corrective_actions   = (fd.get('corrective_actions')   as string) || ''
      hazard_level         = (fd.get('hazard_level')         as string) || 'low'
      notes                = (fd.get('notes')                as string) || ''
      inspection_date_only = (fd.get('inspection_date_only') as string) || ''
      inspection_result    = (fd.get('inspection_result')    as string) || 'none'
      result_reason        = (fd.get('result_reason')        as string) || ''
      const tid = fd.get('task_id')
      task_id = tid ? Number(tid) : null
      photoFiles = fd.getAll('photos') as File[]
      const wids = fd.get('worker_ids') as string
      if (wids) workerIds = wids.split(',').map(Number).filter(Boolean)
    } else {
      const body = await c.req.json()
      location             = body.location             || ''
      inspection_type      = body.inspection_type      || 'routine'
      findings             = body.findings             || ''
      corrective_actions   = body.corrective_actions   || ''
      hazard_level         = body.hazard_level         || 'low'
      notes                = body.notes                || ''
      inspection_date_only = body.inspection_date_only || ''
      // body.inspection_result 이 빈 문자열('')인 경우도 'none' 폴백 방지
      inspection_result    = (body.inspection_result != null && body.inspection_result !== '')
                               ? body.inspection_result : 'none'
      result_reason        = body.result_reason        || ''
      task_id              = body.task_id              || null
      legacyPhotos         = body.photos               || []
      workerIds            = Array.isArray(body.worker_ids)
                               ? body.worker_ids.map(Number).filter(Boolean) : []
    }
  } catch (e: any) {
    return c.json({ error: `요청 파싱 실패: ${e.message}` }, 400)
  }

  if (!location) return c.json({ error: '점검 위치를 입력하세요.' }, 400)

  const today = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).replace(/\. /g, '-').replace('.', '')
  const insDateOnly = inspection_date_only || today

  // ── 1) site_inspections INSERT (rawDb 동기) ──
  let inspectionId: number
  try {
    const ins = rawDb.prepare(`
      INSERT INTO site_inspections
        (inspector_id, task_id, location, inspection_type, findings, corrective_actions,
         hazard_level, notes, inspection_date_only, inspection_result, result_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id, task_id || null, location, inspection_type, findings,
      corrective_actions, hazard_level, notes, insDateOnly, inspection_result, result_reason
    )
    inspectionId = Number(ins.lastInsertRowid)
  } catch (e: any) {
    console.error('[POST /api/inspections] site_inspections INSERT 실패:', e.message)
    return c.json({ error: `점검 저장 실패: ${e.message}` }, 500)
  }

  // ── 2) inspection_workers INSERT (rawDb 동기) ──
  let workersSaved = 0
  if (['불량', '우수'].includes(inspection_result) && workerIds.length > 0) {
    try {
      const stmt = rawDb.prepare(
        `INSERT OR IGNORE INTO inspection_workers (inspection_id, worker_id, result_type) VALUES (?, ?, ?)`
      )
      const insertMany = rawDb.transaction((wids: number[]) => {
        for (const wid of wids) {
          stmt.run(inspectionId, wid, inspection_result)
          workersSaved++
        }
      })
      insertMany(workerIds)
      console.log(`[POST /api/inspections] inspection_workers 저장: ${workersSaved}명 (결과: ${inspection_result})`)
    } catch (e: any) {
      console.warn('[POST /api/inspections] inspection_workers INSERT 실패:', e.message)
      // 작업자 저장 실패는 점검 등록 자체를 실패시키지 않음
    }
  }

  // ── 3) 사진 저장 (multipart) ──
  if (photoFiles.length > 0) {
    try {
      // [FEAT-050] 업로더 팀명 조회 (루트 버그 수정 + 팀명 폴더 추가)
      const inspUploaderTeam = rawDb.prepare(
        `SELECT tm.name AS team_name FROM users u LEFT JOIN teams tm ON tm.id = u.team_id WHERE u.id = ?`
      ).get(user.id) as any
      const taskObj: any = task_id
        ? rawDb.prepare(
            `SELECT t.task_number, t.sub_task_number, t.work_date, t.planned_date,
                    t.construction_type, t.construction_id,
                    c.request_no AS con_request_no, c.title AS con_title,
                    c.created_at AS con_created_at
             FROM tasks t LEFT JOIN constructions c ON c.id = t.construction_id
             WHERE t.id = ?`
          ).get(task_id)
        : null
      // team_name 주입 (업로더 팀 기준)
      if (taskObj) taskObj.team_name = inspUploaderTeam?.team_name || null
      // task_id 없을 때: null → '점검' 문자열 폴백으로 루트 생성 버그 → null 유지하되 팀명 활용
      const uploadDir = getUploadDir(taskObj || '점검', 'inspection')
      const { mkdirSync: mkd } = await import('fs')
      mkdirSync(uploadDir, { recursive: true })

      for (const file of photoFiles) {
        if (!file || typeof file === 'string') continue
        const fileName = generateFileName(file.name || 'photo.jpg')
        const filePath = join(uploadDir, fileName)
        const buf = await file.arrayBuffer()
        writeFileSync(filePath, Buffer.from(buf))
        rawDb.prepare(
          `INSERT INTO inspection_photos (inspection_id, file_name, file_path, file_data, caption, mime_type)
           VALUES (?, ?, ?, NULL, ?, ?)`
        ).run(inspectionId, file.name || fileName, filePath, '', file.type || 'image/jpeg')
      }
    } catch (e: any) {
      console.warn('[POST /api/inspections] 사진 저장 실패:', e.message)
    }
  }

  // ── 4) base64 사진 (JSON 하위호환) ──
  if (legacyPhotos.length > 0) {
    try {
      for (const p of legacyPhotos) {
        rawDb.prepare(
          `INSERT INTO inspection_photos (inspection_id, file_name, file_path, file_data, caption)
           VALUES (?, ?, NULL, ?, ?)`
        ).run(inspectionId, p.file_name || 'photo.jpg', p.file_data, p.caption || '')
      }
    } catch (e: any) {
      console.warn('[POST /api/inspections] base64 사진 저장 실패:', e.message)
    }
  }

  return c.json({ success: true, id: inspectionId, workers_saved: workersSaved })
})

// ─── [RULE-002] NAS 전용: PUT /api/inspections/:id — rawDb 직접 처리 ──────────
app.put('/api/inspections/:id', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  const id = Number(c.req.param('id'))
  const existing = rawDb.prepare(
    'SELECT id, inspector_id FROM site_inspections WHERE id = ?'
  ).get(id) as any
  if (!existing) return c.json({ error: '점검 없음' }, 404)
  if (user.role !== 'admin' && existing.inspector_id !== user.id)
    return c.json({ error: '본인이 작성한 점검만 수정할 수 있습니다.' }, 403)

  let body: any
  try { body = await c.req.json() } catch (e: any) {
    return c.json({ error: `요청 파싱 실패: ${e.message}` }, 400)
  }
  const {
    location          = '',
    inspection_type   = 'routine',
    hazard_level      = 'low',
    findings          = '',
    corrective_actions = '',
    notes             = '',
    inspection_date_only = '',
    result_reason     = '',
    worker_ids        = [],
  } = body
  const inspection_result = (body.inspection_result != null && body.inspection_result !== '')
                              ? body.inspection_result : 'none'

  if (!location) return c.json({ error: '점검 위치를 입력하세요.' }, 400)

  try {
    rawDb.prepare(`
      UPDATE site_inspections SET
        location           = ?,
        inspection_type    = ?,
        hazard_level       = ?,
        findings           = ?,
        corrective_actions = ?,
        notes              = ?,
        inspection_date_only = ?,
        inspection_result  = ?,
        result_reason      = ?,
        updated_at         = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      location, inspection_type, hazard_level,
      findings, corrective_actions, notes,
      inspection_date_only, inspection_result, result_reason,
      id
    )
  } catch (e: any) {
    console.error('[PUT /api/inspections/:id] UPDATE 실패:', e.message)
    return c.json({ error: `수정 저장 실패: ${e.message}` }, 500)
  }

  // inspection_workers 재저장
  let workersSaved = 0
  try {
    rawDb.prepare('DELETE FROM inspection_workers WHERE inspection_id = ?').run(id)
    const wids: number[] = Array.isArray(worker_ids) ? worker_ids.map(Number).filter(Boolean) : []
    if (['불량', '우수'].includes(inspection_result) && wids.length > 0) {
      const stmt = rawDb.prepare(
        `INSERT OR IGNORE INTO inspection_workers (inspection_id, worker_id, result_type) VALUES (?, ?, ?)`
      )
      const insertMany = rawDb.transaction((ids: number[]) => {
        for (const wid of ids) {
          stmt.run(id, wid, inspection_result)
          workersSaved++
        }
      })
      insertMany(wids)
      console.log(`[PUT /api/inspections/:id=${id}] inspection_workers 재저장: ${workersSaved}명`)
    }
  } catch (e: any) {
    console.warn('[PUT /api/inspections/:id] inspection_workers 재저장 실패:', e.message)
  }

  return c.json({ success: true, workers_saved: workersSaved })
})

// ─── [RULE-002] NAS 전용: GET /api/inspections/:id/checklist-results ─────────
// 현장점검 항목별 체크 결과 조회
app.get('/api/inspections/:id/checklist-results', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = Number(c.req.param('id'))
  if (!id) return c.json({ error: '잘못된 ID' }, 400)
  try {
    const rows = rawDb.prepare(
      `SELECT * FROM inspection_checklist_results WHERE inspection_id = ? ORDER BY id ASC`
    ).all(id) as any[]
    return c.json({ results: rows })
  } catch (e: any) {
    // 테이블 없으면 빈 배열 반환 (방어)
    return c.json({ results: [] })
  }
})

// ─── [RULE-002] NAS 전용: POST /api/inspections/:id/checklist-results ─────────
// 현장점검 항목별 체크 결과 일괄 저장 (UPSERT)
app.post('/api/inspections/:id/checklist-results', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)
  const id = Number(c.req.param('id'))
  if (!id) return c.json({ error: '잘못된 ID' }, 400)
  let body: any
  try { body = await c.req.json() } catch (e: any) {
    return c.json({ error: `요청 파싱 실패: ${e.message}` }, 400)
  }
  const { items } = body  // [{ item_key, item_group, item_text, item_basis, result, memo }]
  if (!Array.isArray(items)) return c.json({ error: 'items 배열 필요' }, 400)
  try {
    const upsert = rawDb.prepare(`
      INSERT INTO inspection_checklist_results
        (inspection_id, item_key, item_group, item_text, item_basis, result, memo, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(inspection_id, item_key) DO UPDATE SET
        result     = excluded.result,
        memo       = excluded.memo,
        item_group = excluded.item_group,
        item_text  = excluded.item_text,
        item_basis = excluded.item_basis,
        updated_at = CURRENT_TIMESTAMP
    `)
    const saveAll = rawDb.transaction((rows: any[]) => {
      for (const row of rows) {
        upsert.run(
          id,
          row.item_key || '',
          row.item_group || '',
          row.item_text  || '',
          row.item_basis || '',
          row.result     || null,
          row.memo       || null
        )
      }
    })
    saveAll(items)
    return c.json({ success: true, saved: items.length })
  } catch (e: any) {
    console.error('[POST /api/inspections/:id/checklist-results]', e.message)
    return c.json({ error: `저장 실패: ${e.message}` }, 500)
  }
})

// ─── [RULE-002] NAS 전용: POST /api/inspections/:id/checklist-photos ─────────
// 체크리스트 항목별 사진 업로드 (등록 모달 전용)
// FormData: items = JSON array of { item_key, item_group, item_text, item_basis, result }
//           각 item_key에 대응하는 파일: photo_<item_key_encoded>
app.post('/api/inspections/:id/checklist-photos', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  const insId = Number(c.req.param('id'))
  if (!insId) return c.json({ error: '잘못된 ID' }, 400)

  // 점검 존재 확인
  const ins = rawDb.prepare('SELECT id, task_id FROM site_inspections WHERE id = ?').get(insId) as any
  if (!ins) return c.json({ error: '점검 없음' }, 404)

  try {
    const formData = await c.req.formData()
    const itemsJson = formData.get('items') as string
    if (!itemsJson) return c.json({ error: 'items 필드 없음' }, 400)

    const items: any[] = JSON.parse(itemsJson)

    // task 폴더 결정
    const uploaderTeam = rawDb.prepare(
      `SELECT tm.name AS team_name FROM users u LEFT JOIN teams tm ON tm.id = u.team_id WHERE u.id = ?`
    ).get(user.id) as any
    let task: any = null
    if (ins.task_id) {
      task = rawDb.prepare(
        `SELECT t.task_number, t.sub_task_number, t.work_date, t.planned_date,
                t.construction_type, t.construction_id,
                c.request_no AS con_request_no, c.title AS con_title,
                c.created_at AS con_created_at
         FROM tasks t LEFT JOIN constructions c ON c.id = t.construction_id
         WHERE t.id = ?`
      ).get(Number(ins.task_id)) as any
      if (task) task.team_name = uploaderTeam?.team_name || null
    }
    const uploadDir = getUploadDir(task || '점검', 'inspection')

    const savedCount = { total: 0, photos: 0 }

    for (const item of items) {
      const key: string = item.item_key
      if (!key) continue

      // 파일 키: photo_<base64 of key> 또는 photo_<idx>
      // app.js에서 field name을 "chk_photo_<idx>" 로 전송
      const fileFieldName = 'chk_photo_' + item._idx
      const file = formData.get(fileFieldName) as File | null

      // UPSERT checklist result (사진 있든 없든)
      const upsertStmt = rawDb.prepare(`
        INSERT INTO inspection_checklist_results
          (inspection_id, item_key, item_group, item_text, item_basis, result, memo)
        VALUES (?,?,?,?,?,?,NULL)
        ON CONFLICT(inspection_id, item_key) DO UPDATE SET
          item_group  = excluded.item_group,
          item_text   = excluded.item_text,
          item_basis  = excluded.item_basis,
          result      = excluded.result,
          updated_at  = CURRENT_TIMESTAMP
      `)
      upsertStmt.run(insId, key, item.item_group||'', item.item_text||'', item.item_basis||'', item.result||'na')
      savedCount.total++

      if (file && typeof file !== 'string' && file.size > 0) {
        const fileName = generateFileName(file.name || 'chk_photo.jpg')
        const filePath = join(uploadDir, fileName)
        const buf = await file.arrayBuffer()
        writeFileSync(filePath, Buffer.from(buf))

        // photo 컬럼 업데이트
        rawDb.prepare(`
          UPDATE inspection_checklist_results
          SET photo_path = ?, photo_name = ?, photo_mime = ?, updated_at = CURRENT_TIMESTAMP
          WHERE inspection_id = ? AND item_key = ?
        `).run(filePath, file.name || fileName, file.type || 'image/jpeg', insId, key)
        savedCount.photos++
      }
    }

    return c.json({ success: true, saved: savedCount.total, photos: savedCount.photos })
  } catch(e: any) {
    console.error('[POST /api/inspections/:id/checklist-photos]', e.message)
    return c.json({ error: `저장 실패: ${e.message}` }, 500)
  }
})

// ─── [RULE-002] NAS 전용: GET /api/inspections/:id/checklist-photo/:key ───────
// 체크리스트 항목별 사진 이미지 반환
app.get('/api/inspections/:id/checklist-photo/:key', async (c) => {
  const insId = Number(c.req.param('id'))
  const key   = decodeURIComponent(c.req.param('key'))
  if (!insId || !key) return c.json({ error: '잘못된 파라미터' }, 400)

  const row = rawDb.prepare(
    `SELECT photo_path, photo_mime FROM inspection_checklist_results WHERE inspection_id = ? AND item_key = ?`
  ).get(insId, key) as any

  if (!row || !row.photo_path) return c.notFound()

  try {
    const { readFileSync: rfs } = await import('fs')
    const buf = rfs(row.photo_path)
    return new Response(buf, {
      headers: {
        'Content-Type': row.photo_mime || 'image/jpeg',
        'Cache-Control': 'max-age=86400',
      }
    })
  } catch(_e) {
    return c.json({ error: '파일 없음' }, 404)
  }
})

// ─── [RULE-002] NAS 전용: PATCH /api/inspections/:id/status ─────────────────
// inspections.ts(Cloudflare용)의 PATCH는 c.env.DB 사용 → NAS에서는 rawDb로 직접 처리
// 완료(closed) 전환 시: 안전관리자(safety) + 현장대리인(site_rep) + 대표이사(ceo) 에게
//   - notifications DB 저장
//   - FCM 푸시 발송
//   - SSE 실시간 알림
app.patch('/api/inspections/:id/status', async (c) => {
  const user = getUser(c)
  if (!user || user.role === 'worker') return c.json({ error: '권한 없음' }, 403)

  const id = Number(c.req.param('id'))
  let body: any
  try { body = await c.req.json() } catch (e: any) {
    return c.json({ error: `요청 파싱 실패: ${e.message}` }, 400)
  }
  const { status } = body
  if (!['open', 'in_progress', 'closed'].includes(status)) {
    return c.json({ error: `유효하지 않은 상태값: ${status}` }, 400)
  }

  // 점검 정보 조회
  const ins = rawDb.prepare(
    `SELECT si.id, si.location, si.inspection_type, si.status as prev_status,
            si.inspection_date_only, si.inspection_result,
            u.name as inspector_name
     FROM site_inspections si
     LEFT JOIN users u ON u.id = si.inspector_id
     WHERE si.id = ?`
  ).get(id) as any
  if (!ins) return c.json({ error: '점검 없음' }, 404)

  // DB 업데이트
  try {
    rawDb.prepare(
      `UPDATE site_inspections SET status=?, closed_at=${status === 'closed' ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id=?`
    ).run(status, id)
  } catch (e: any) {
    console.error('[PATCH /api/inspections/:id/status] UPDATE 실패:', e.message)
    return c.json({ error: `상태 저장 실패: ${e.message}` }, 500)
  }

  const statusLabelMap: Record<string, string> = { open:'미처리', in_progress:'처리중', closed:'완료' }
  const statusLabel = statusLabelMap[status] || status
  const insTypeLabelMap: Record<string, string> = { routine:'정기점검', joint:'합동점검', frequent:'수시점검' }
  const insTypeLabel = insTypeLabelMap[ins.inspection_type] || ins.inspection_type || '현장점검'

  // ── 완료(closed) 전환 시: 알림 + FCM 발송 ──────────────────────────────────
  if (status === 'closed') {
    const notifTitle = `현장 점검 완료: ${ins.location || insTypeLabel}`
    const notifMsg   = `[${insTypeLabel}] "${ins.location || '-'}" 점검이 완료 처리되었습니다. (처리자: ${user.name})`
    const fcmData    = { type: 'inspection_closed', inspectionId: String(id) }

    // 수신 대상: safety(안전관리자) + site_rep(현장대리인) + ceo(대표이사)
    // getUsersWithPerm('notify_all_tasks') 는 group_permissions 기반으로 이 세 그룹을 포함
    // 작성자 본인은 제외(excludeId=user.id)
    const targetIds = getUsersWithPerm('notify_all_tasks', user.id)

    // ① notifications DB 저장
    try {
      for (const uid of targetIds) {
        rawDb.prepare(
          `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
           VALUES (?, 'inspection_closed', ?, ?, ?, 'inspection', 0)`
        ).run(uid, notifTitle, notifMsg, id)
      }
      console.log(`[PATCH /inspection/:id/status] 알림 DB 저장 — targets:${targetIds} ids`)
    } catch (e: any) {
      console.warn('[PATCH /api/inspections/:id/status] 알림 DB 저장 실패:', e.message)
    }

    // ② SSE 실시간 알림
    try {
      const ssePayload = {
        type: 'inspection_closed',
        inspectionId: id,
        location: ins.location,
        actor: user.name,
        message: notifMsg,
        ts: Date.now()
      }
      for (const uid of targetIds) sendToUser(uid, ssePayload)
    } catch (e: any) {
      console.warn('[PATCH /api/inspections/:id/status] SSE 발송 실패:', e.message)
    }

    // ③ FCM 푸시 (비동기 — 실패해도 응답 영향 없음)
    if (targetIds.length > 0) {
      sendFcmToUsers(targetIds, {
        title: notifTitle,
        body: notifMsg,
        data: fcmData
      }).catch((e: any) => console.error('[FCM] 점검완료 FCM 오류:', e.message))
    }

    console.log(`[PATCH /api/inspections/:id=${id}] 완료 처리 — 알림 대상:${targetIds.length}명`)
  }

  return c.json({ success: true, status, status_label: statusLabel })
})

app.route('/api/inspections', inspectionRoutes)
app.route('/api/hazards', hazardRoutes)
app.route('/api/worklogs', worklogRoutes)

// ── [v0.142 LGU+] NAS 전용: 체크리스트 완료 후 LGU+ 알림 자동 트리거 ─────────
// RULE-002: checklistRoutes 마운트보다 앞에 등록 (NAS 전용 라우트 우선순위)
// PATCH /api/checklist/:id/complete 를 가로채서 원본 처리 후 LGU+ 알림 발송
// checklist.ts(Cloudflare용) c.env.DB 사용 → NAS에서는 rawDb로 직접 처리
app.patch('/api/checklist/:id/complete', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  var assessId = Number(c.req.param('id'))

  // ① checklist.ts 원본 로직을 NAS 환경에서 직접 실행 (better-sqlite3 동기 API)
  try {
    var asmRow: any = rawDb.prepare(
      `SELECT ca.*, t.work_class FROM checklist_assessments ca JOIN tasks t ON t.id = ca.task_id WHERE ca.id = ?`
    ).get(assessId)
    if (!asmRow) return c.json({ error: '체크리스트 평가를 찾을 수 없습니다.' }, 404)
    if (asmRow.status === 'completed') {
      // 이미 완료된 경우: 재처리 방지, LGU+ 알림만 발송
    }

    // NOK 항목 조회 (컬럼명: ci.question — ci.text 아님, BUGFIX v0.143)
    var nokItems = rawDb.prepare(
      `SELECT cr.*, ci.question, ci.category FROM checklist_responses cr
       JOIN checklist_items ci ON ci.id = cr.item_id
       WHERE cr.assessment_id = ? AND cr.response = 'no'`
    ).all(assessId) as any[]

    // 완료 처리
    rawDb.prepare(`UPDATE checklist_assessments SET status = 'completed' WHERE id = ?`).run(assessId)

    // KST 현재 시각
    const nowTs = new Date()
    const kstTs = new Date(nowTs.getTime() + 9 * 60 * 60 * 1000)
    const kstStr = kstTs.toISOString().replace('T', ' ').slice(0, 19)

    // tasks 상태 업데이트 (assigned → in_progress)
    if (asmRow.task_id) {
      try {
        var tRow: any = rawDb.prepare(
          `SELECT work_start_address, checklist_started_at, status FROM tasks WHERE id = ?`
        ).get(asmRow.task_id)
        if (tRow?.status === 'assigned') {
          if (asmRow.gps_address && !tRow?.work_start_address) {
            rawDb.prepare(
              `UPDATE tasks SET status='in_progress', checklist_started_at=?, work_start_address=?, work_start_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
            ).run(kstStr, asmRow.gps_address, kstStr, asmRow.task_id)
          } else {
            rawDb.prepare(
              `UPDATE tasks SET status='in_progress', checklist_started_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
            ).run(kstStr, asmRow.task_id)
          }
        } else if (!tRow?.checklist_started_at) {
          rawDb.prepare(
            `UPDATE tasks SET checklist_started_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
          ).run(kstStr, asmRow.task_id)
        }
      } catch(_) {}

      // ── [FEAT-033] 체크리스트 시행일이 작업예정일보다 늦으면 planned_date 자동 갱신 ──
      // 로직: assessment_date(체크리스트 시행일) 날짜 부분이 tasks.planned_date 보다 크면
      //       planned_date 를 시행일의 날짜로 업데이트
      try {
        const kstDateStr = kstStr.slice(0, 10) // 'YYYY-MM-DD'
        var pRow: any = rawDb.prepare(
          `SELECT planned_date FROM tasks WHERE id = ?`
        ).get(asmRow.task_id)
        const currentPlanned = pRow?.planned_date ? String(pRow.planned_date).slice(0, 10) : null
        if (currentPlanned && kstDateStr > currentPlanned) {
          rawDb.prepare(
            `UPDATE tasks SET planned_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
          ).run(kstDateStr, asmRow.task_id)
          console.log(`[FEAT-033] planned_date 자동갱신: task_id=${asmRow.task_id} ${currentPlanned} → ${kstDateStr}`)
        }
      } catch(e: any) {
        console.warn('[FEAT-033] planned_date 자동갱신 실패(무시):', e.message)
      }
    }

    // ② [FEAT-029] 체크리스트 완료 알림 — group_permissions 기반 수신자 결정
    try {
      if (asmRow.task_id) {
        var chkTaskRow: any = rawDb.prepare(
          `SELECT t.title, t.task_number, t.work_number, t.sub_task_number,
                  c.is_auto_request_no, c.request_no as c_req
           FROM tasks t LEFT JOIN constructions c ON c.id = t.construction_id
           WHERE t.id = ?`
        ).get(asmRow.task_id)
        var chkTaskTitle = chkTaskRow?.title || String(asmRow.task_id)
        var chkTaskNum   = chkTaskRow?.work_number
          ? (chkTaskRow.sub_task_number ? `${chkTaskRow.work_number}-${chkTaskRow.sub_task_number}` : chkTaskRow.work_number)
          : (chkTaskRow?.task_number || String(asmRow.task_id))

        // (a) notify_all_tasks 그룹 → 전체 관리자 알림
        var chkAllTargets = getUsersWithPerm('notify_all_tasks', user.id)
        if (chkAllTargets.length > 0) {
          var chkTitle = `체크리스트 완료`
          var chkBody  = `[${chkTaskNum}] "${chkTaskTitle}" 작업 체크리스트가 완료되었습니다. (${user.name})`
          sendFcmToUsers(chkAllTargets, {
            title: chkTitle, body: chkBody,
            data: { type: 'task_status', taskId: String(asmRow.task_id), status: 'checklist_done' }
          }).catch((e: any) => console.error('[FCM] 체크리스트 FCM 오류:', e.message))
          for (var chkUid of chkAllTargets) {
            try {
              rawDb.prepare(
                `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
                 VALUES (?, 'task_status_change', ?, ?, ?, 'task', 0)`
              ).run(chkUid, chkTitle, chkBody, asmRow.task_id)
            } catch(_) {}
          }
        }

        // (b) notify_lgu_tasks 그룹 → is_auto_request_no === 0 공사에만 LGU+ 알림
        var lguChkEnabled = getSetting('lgu_notify_checklist_done')
        if (lguChkEnabled === '1' && chkTaskRow && chkTaskRow.is_auto_request_no === 0) {
          var lguChkTargets = getUsersWithPerm('notify_lgu_tasks').filter(uid => uid !== user.id)
          if (lguChkTargets.length > 0) {
            var lguChkTitle = `[LGU+] 체크리스트 완료`
            var lguChkBody  = `[${chkTaskNum}] "${chkTaskTitle}" 체크리스트 완료 (${user.name})`
            console.log(`[FCM/LGU+/FEAT-029] 체크리스트 완료 → lgu:${lguChkTargets}`)
            sendFcmToUsers(lguChkTargets, {
              title: lguChkTitle, body: lguChkBody,
              data: { type: 'task_status_lgu', taskId: String(asmRow.task_id), status: 'checklist_done' }
            }).catch((e: any) => console.error('[FCM/LGU+] 체크리스트 FCM 오류:', e.message))
            for (var lguChkUid of lguChkTargets) {
              try {
                rawDb.prepare(
                  `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
                   VALUES (?, 'task_status_lgu', ?, ?, ?, 'task', 0)`
                ).run(lguChkUid, lguChkTitle, lguChkBody, asmRow.task_id)
              } catch(_) {}
            }
          }
        }
      }
    } catch(e: any) {
      console.error('[FCM/FEAT-029] 체크리스트 완료 알림 오류(무시):', e.message)
    }

    return c.json({ success: true, nok_items: nokItems, has_warnings: nokItems.length > 0 })
  } catch (e: any) {
    console.error('[checklist PATCH NAS /:id/complete]', e.message)
    return c.json({ error: e.message || '평가 완료 처리 실패' }, 500)
  }
})

// ── [v0.142 LGU+] 내부 호출 전용: 체크리스트 완료 LGU+ 알림만 ─────────────────
// 외부에서는 직접 호출하지 않음
app.patch('/api/checklist/:id/complete-lgu-notify', async (c) => {
  // 이 라우트는 내부 호출 전용 — 외부에서 직접 호출하지 않음
  // 체크리스트 /:id/complete 완료 후 LGU+ 알림만 별도 처리
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const assessId = Number(c.req.param('id'))
  try {
    const lguEnabled = getSetting('lgu_notify_checklist_done')
    if (lguEnabled !== '1') return c.json({ lgu_notified: false, reason: 'disabled' })

    // 체크리스트 평가의 task_id 조회
    const asmRow = rawDb.prepare(
      `SELECT task_id FROM checklist_assessments WHERE id = ?`
    ).get(assessId) as any
    if (!asmRow?.task_id) return c.json({ lgu_notified: false, reason: 'no_task' })
    const taskId = asmRow.task_id

    // [v0.143] 해당 작업의 연결 공사 is_auto_request_no 조회 (구: reqNo.startsWith('1') 조건 제거)
    const taskRow = rawDb.prepare(
      `SELECT t.title, t.task_number, t.work_number, t.sub_task_number,
              c.is_auto_request_no, c.request_no as c_req
       FROM tasks t
       LEFT JOIN constructions c ON c.id = t.construction_id
       WHERE t.id = ?`
    ).get(taskId) as any
    if (!taskRow) return c.json({ lgu_notified: false, reason: 'no_task_row' })

    // ❌ 오기록(v0.143): is_auto_request_no !== 1 로 잘못 구현 — BUG-039 수정
    // BUG-040→FEAT-027 단순화: is_auto_request_no === 0 인 경우만 LGU+ 허용
    //   null/undefined/1 → !== 0 → early return  |  0 → 통과 → 알림 발송 ✅
    if (taskRow.is_auto_request_no !== 0)
      return c.json({ lgu_notified: false, reason: 'not_lgu_target' })

    const taskTitle = taskRow.title || String(taskId)
    const taskNumDisplay = taskRow.work_number
      ? (taskRow.sub_task_number ? `${taskRow.work_number}-${taskRow.sub_task_number}` : taskRow.work_number)
      : (taskRow.task_number || String(taskId))

    // LGU+ 역할 사용자 조회
    const lguUsers = rawDb.prepare(
      `SELECT id FROM users WHERE (role='lgu_plus' OR role='lgu' OR sub_role='lgu_plus') AND is_active=1`  // [FEAT-048] lgu_plus 단일화 + 구버전 호환
    ).all() as any[]
    const lguIds = lguUsers.map((r: any) => r.id as number).filter(uid => uid !== user.id)

    if (lguIds.length > 0) {
      const fcmTitle = `[LGU+] 체크리스트 완료`
      const fcmBody  = `[${taskNumDisplay}] "${taskTitle}" 작업 체크리스트가 완료되었습니다. (${user.name})`
      console.log(`[FCM/LGU+] 체크리스트 완료 알림 — task:${taskId} conReq:${taskRow.c_req}(자동부여) → lgu:${lguIds}`)
      sendFcmToUsers(lguIds, {
        title: fcmTitle,
        body:  fcmBody,
        data:  { type: 'task_status_lgu', taskId: String(taskId), status: 'checklist_done' }
      }).catch((e: any) => console.error('[FCM/LGU+] 체크리스트 FCM 오류:', e.message))
      // notifications DB 저장
      try {
        for (const lguUid of lguIds) {
          rawDb.prepare(
            `INSERT INTO notifications (user_id, type, title, message, ref_id, ref_type, is_read)
             VALUES (?, 'task_status_lgu', ?, ?, ?, 'task', 0)`
          ).run(lguUid, fcmTitle, fcmBody, taskId)
        }
      } catch(_) {}
      return c.json({ lgu_notified: true, count: lguIds.length })
    }
    return c.json({ lgu_notified: false, reason: 'no_lgu_users' })
  } catch (e: any) {
    console.error('[FCM/LGU+] 체크리스트 완료 알림 오류:', e.message)
    return c.json({ lgu_notified: false, error: e.message }, 500)
  }
})

// ─── [RULE-002] NAS 전용: 체크리스트 항목 관리 CRUD ──────────────────────────
// GET  /api/checklist/items/all   — 관리 화면용 전체 조회 (is_active 무관)
// POST /api/checklist/items       — 항목 추가
// PUT  /api/checklist/items/:id   — 항목 수정
// DELETE /api/checklist/items/:id — 항목 삭제(소프트) or 하드삭제(?hard=1)
// GET  /api/checklist/items       — 기존 필수/조건부 조회 (confined 추가 허용)
// RULE-002: checklistRoutes 마운트보다 반드시 앞에 등록
app.get('/api/checklist/items/all', async (c) => {
  var user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  var allowedRoles = ['admin', 'supervisor', '안전관리자', '현장대리인']
  if (!allowedRoles.includes(user.role)) return c.json({ error: '권한 없음' }, 403)
  try {
    var wc = c.req.query('work_class') || ''
    var rows: any[]
    if (wc) {
      rows = rawDb.prepare('SELECT * FROM checklist_items WHERE work_class = ? ORDER BY sort_order, id').all(wc) as any[]
    } else {
      rows = rawDb.prepare('SELECT * FROM checklist_items ORDER BY work_class, sort_order, id').all() as any[]
    }
    return c.json({ items: rows })
  } catch(e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/checklist/items', async (c) => {
  var user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  var allowedRoles = ['admin', 'supervisor', '안전관리자', '현장대리인']
  if (!allowedRoles.includes(user.role)) return c.json({ error: '권한 없음' }, 403)
  try {
    var body = await c.req.json() as any
    var { work_class, category, question, note, sort_order, is_active } = body
    if (!work_class || !category || !question) return c.json({ error: 'work_class, category, question 필수' }, 400)
    var stmt = rawDb.prepare(
      'INSERT INTO checklist_items (work_class, category, question, note, sort_order, is_active) VALUES (?,?,?,?,?,?)'
    )
    var result = stmt.run(
      work_class, category, question,
      note || null,
      sort_order != null ? Number(sort_order) : 0,
      is_active != null ? (is_active ? 1 : 0) : 1
    )
    return c.json({ id: result.lastInsertRowid, success: true })
  } catch(e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.put('/api/checklist/items/:id', async (c) => {
  var user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  var allowedRoles = ['admin', 'supervisor', '안전관리자', '현장대리인']
  if (!allowedRoles.includes(user.role)) return c.json({ error: '권한 없음' }, 403)
  try {
    var itemId = Number(c.req.param('id'))
    var body = await c.req.json() as any
    var { work_class, category, question, note, sort_order, is_active } = body
    if (!work_class || !category || !question) return c.json({ error: 'work_class, category, question 필수' }, 400)
    rawDb.prepare(
      'UPDATE checklist_items SET work_class=?, category=?, question=?, note=?, sort_order=?, is_active=? WHERE id=?'
    ).run(
      work_class, category, question,
      note || null,
      sort_order != null ? Number(sort_order) : 0,
      is_active != null ? (is_active ? 1 : 0) : 1,
      itemId
    )
    return c.json({ success: true })
  } catch(e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.delete('/api/checklist/items/:id', async (c) => {
  var user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  var allowedRoles = ['admin', 'supervisor', '안전관리자', '현장대리인']
  if (!allowedRoles.includes(user.role)) return c.json({ error: '권한 없음' }, 403)
  try {
    var itemId = Number(c.req.param('id'))
    var hard = c.req.query('hard') === '1'
    if (hard) {
      var used: any = rawDb.prepare('SELECT COUNT(*) as cnt FROM checklist_responses WHERE item_id = ?').get(itemId)
      if (used && used.cnt > 0) {
        rawDb.prepare('UPDATE checklist_items SET is_active = 0 WHERE id = ?').run(itemId)
        return c.json({ success: true, deleted: false, deactivated: true })
      }
      rawDb.prepare('DELETE FROM checklist_items WHERE id = ?').run(itemId)
      return c.json({ success: true, deleted: true })
    } else {
      rawDb.prepare('UPDATE checklist_items SET is_active = 0 WHERE id = ?').run(itemId)
      return c.json({ success: true, deleted: false, deactivated: true })
    }
  } catch(e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// NAS 전용: GET /api/checklist/items — confined 포함 모든 클래스 허용
app.get('/api/checklist/items', async (c) => {
  var user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    var workClassParam = c.req.query('work_class') || 'all'
    var requestedClasses = workClassParam.split(',').map(function(s: string) { return s.trim(); }).filter(Boolean)
    var queryClasses: string[] = []
    if (requestedClasses.includes('all') || requestedClasses.length === 0) {
      queryClasses.push('all')
    }
    var _allClasses = ['bucket','pole','rooftop','ladder','heavy','confined']
    for (var _ri = 0; _ri < requestedClasses.length; _ri++) {
      var _rc = requestedClasses[_ri]
      if (_allClasses.includes(_rc) || _rc !== 'all') {
        if (!queryClasses.includes(_rc)) queryClasses.push(_rc)
      }
    }
    var placeholders = queryClasses.map(function() { return '?'; }).join(',')
    var rows = rawDb.prepare(
      'SELECT * FROM checklist_items WHERE work_class IN (' + placeholders + ') AND is_active = 1 ORDER BY sort_order'
    ).all(...queryClasses) as any[]
    return c.json({ items: rows })
  } catch(e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.route('/api/checklist', checklistRoutes)
app.route('/api/teams', teamRoutes)
// ─── 교육 사진/리포트 → nas-routes/education-extra.ts (RULE-002: educationRoutes 앞) ─
registerEducationExtraRoutes(app)
app.route('/api/education', educationRoutes)

// ─────────────────────────────────────────────────────────────────────────────
// [FEAT-063] GET /api/constructions/stats — 공사통계 (년/월/주 기간 집계)
// Query: period=yearly|monthly|weekly  year=YYYY  month=MM(월간전용)  week_start=YYYY-MM-DD(주간전용)
//        work_classes=relocation,subscription,...  (쉼표 구분 영문키 복수선택, 생략시 전체)
// Response:
//   summary   : { total, completed, settled, notify_total }
//   by_type   : [{ work_class, label, total, completed, settled, notify_total }]
//   by_manager: [{ manager, total, completed, notify_total }]
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/constructions/stats', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const period     = c.req.query('period')       || 'yearly'   // yearly | monthly | weekly
  const year       = c.req.query('year')         || String(new Date(Date.now() + 9*3600*1000).getUTCFullYear())
  const month      = c.req.query('month')        || ''          // 월간: '1'~'12'
  const weekStart  = c.req.query('week_start')   || ''          // 주간: 'YYYY-MM-DD'
  // work_classes: 쉼표 구분 영문 key (예: 'relocation,subscription') — 생략 시 전체
  const rawWorkClasses = c.req.query('work_classes') || ''
  const workClassList: string[] = rawWorkClasses
    ? rawWorkClasses.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []
  const hasWcFilter = workClassList.length > 0
  const wcPlaceholders = workClassList.map(() => '?').join(',')
  // WHERE 절 추가 조각: constructions.work_class IN (?,?)
  const wcWhere = hasWcFilter
    ? `AND COALESCE(c.work_class, 'other') IN (${wcPlaceholders})`
    : ''

  // ── 기간 WHERE 절 생성 ─────────────────────────────────────────────────────
  let dateWhere = ''
  const dateParams: (string | number)[] = []

  if (period === 'yearly') {
    // 연간: created_at 연도 기준
    dateWhere = `AND strftime('%Y', c.created_at) = ?`
    dateParams.push(year)
  } else if (period === 'monthly') {
    const m = month.padStart(2, '0')
    dateWhere = `AND strftime('%Y', c.created_at) = ? AND strftime('%m', c.created_at) = ?`
    dateParams.push(year, m)
  } else if (period === 'weekly') {
    // 주간: week_start ~ week_start+6일
    if (weekStart) {
      // SQLite date arithmetic
      dateWhere = `AND date(c.created_at) >= date(?) AND date(c.created_at) <= date(?, '+6 days')`
      dateParams.push(weekStart, weekStart)
    } else {
      // 기본: 이번 주 월요일 계산 (KST 기준)
      const nowKstMs = Date.now() + 9 * 3600 * 1000
      const nowKstD  = new Date(nowKstMs)
      const dayOfWeek = nowKstD.getUTCDay() // 0=일
      const monday = new Date(nowKstMs)
      monday.setUTCDate(nowKstD.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      const ws = monday.toISOString().slice(0, 10)
      dateWhere = `AND date(c.created_at) >= date(?) AND date(c.created_at) <= date(?, '+6 days')`
      dateParams.push(ws, ws)
    }
  }

  // 최종 바인딩 파라미터 = 날짜 파라미터 + work_class 파라미터 (순서 준수)
  const allParams: (string | number)[] = [...dateParams, ...workClassList]

  // ── 공사 종류 라벨 매핑 ───────────────────────────────────────────────────
  const WORK_CLASS_LABEL: Record<string, string> = {
    relocation:   '지장이설',
    subscription: '청약개통',
    conduit:      '관로공사',
    environment:  '환경공사',
    separate:     '별도사업',
    other:        '기타',
  }
  const WORK_CLASS_ORDER = ['relocation','subscription','conduit','environment','separate','other']

  try {
    // ── ① 전체 요약 ──────────────────────────────────────────────────────────
    const summaryRow = rawDb.prepare(`
      SELECT
        COUNT(*)                                                              AS total,
        SUM(CASE WHEN c.status = 'completed'           THEN 1 ELSE 0 END)   AS completed,
        SUM(CASE WHEN c.status = 'settled'             THEN 1 ELSE 0 END)   AS settled,
        SUM(CASE WHEN c.status = 'settlement_requested' THEN 1 ELSE 0 END)  AS settlement_requested,
        COALESCE(SUM(c.notification_amount), 0)                             AS notify_total
      FROM constructions c
      WHERE 1=1 ${dateWhere} ${wcWhere}
    `).get(...allParams) as any

    // ── ② 작업 종류별 집계 ───────────────────────────────────────────────────
    const byTypeRows = rawDb.prepare(`
      SELECT
        COALESCE(c.work_class, 'other')                                       AS work_class,
        COUNT(*)                                                               AS total,
        SUM(CASE WHEN c.status = 'completed'            THEN 1 ELSE 0 END)   AS completed,
        SUM(CASE WHEN c.status = 'settled'              THEN 1 ELSE 0 END)   AS settled,
        SUM(CASE WHEN c.status = 'settlement_requested' THEN 1 ELSE 0 END)   AS settlement_requested,
        COALESCE(SUM(c.notification_amount), 0)                              AS notify_total
      FROM constructions c
      WHERE 1=1 ${dateWhere} ${wcWhere}
      GROUP BY COALESCE(c.work_class, 'other')
      ORDER BY total DESC
    `).all(...allParams) as any[]

    // 종류 순서 정렬 + 한글 라벨 추가
    // 필터가 있으면 선택된 work_class만, 없으면 전체 WORK_CLASS_ORDER 기준
    const orderBase = hasWcFilter ? workClassList : WORK_CLASS_ORDER
    const byTypeSorted = orderBase
      .map(key => {
        const row = byTypeRows.find((r: any) => r.work_class === key) || { work_class: key, total: 0, completed: 0, settled: 0, settlement_requested: 0, notify_total: 0 }
        return { ...row, label: WORK_CLASS_LABEL[key] || key }
      })
      .filter(r => r.total > 0)

    // 필터 없을 때: unknown work_class(WORK_CLASS_ORDER 외) 행 추가
    if (!hasWcFilter) {
      byTypeRows.forEach((r: any) => {
        if (!WORK_CLASS_ORDER.includes(r.work_class)) {
          byTypeSorted.push({ ...r, label: r.work_class || '기타' })
        }
      })
    }

    // ── ③ 담당자별 집계 ──────────────────────────────────────────────────────
    const byManagerRows = rawDb.prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(c.manager_name), ''), '미지정')                  AS manager,
        COUNT(*)                                                               AS total,
        SUM(CASE WHEN c.status = 'completed'            THEN 1 ELSE 0 END)   AS completed,
        SUM(CASE WHEN c.status = 'settled'              THEN 1 ELSE 0 END)   AS settled,
        SUM(CASE WHEN c.status = 'settlement_requested' THEN 1 ELSE 0 END)   AS settlement_requested,
        COALESCE(SUM(c.notification_amount), 0)                              AS notify_total
      FROM constructions c
      WHERE 1=1 ${dateWhere} ${wcWhere}
      GROUP BY COALESCE(NULLIF(TRIM(c.manager_name), ''), '미지정')
      ORDER BY total DESC
      LIMIT 30
    `).all(...allParams) as any[]

    return c.json({
      period, year, month, week_start: weekStart,
      summary: {
        total:                 Number(summaryRow?.total                  ?? 0),
        completed:             Number(summaryRow?.completed              ?? 0),
        settled:               Number(summaryRow?.settled                ?? 0),
        settlement_requested:  Number(summaryRow?.settlement_requested   ?? 0),
        notify_total:          Number(summaryRow?.notify_total           ?? 0),
      },
      by_type:    byTypeSorted,
      by_manager: byManagerRows.map((r: any) => ({
        manager:              r.manager,
        total:                Number(r.total               ?? 0),
        completed:            Number(r.completed           ?? 0),
        settled:              Number(r.settled             ?? 0),
        settlement_requested: Number(r.settlement_requested ?? 0),
        notify_total:         Number(r.notify_total        ?? 0),
      })),
    })
  } catch (e: any) {
    console.error('[FEAT-063] /api/constructions/stats 오류:', e)
    return c.json({ error: e.message || '통계 조회 실패' }, 500)
  }
})

// ─── NAS 전용: 공사요청번호 자동생성 순번 조회 ───────────────────────────────
// [TASK-003] GET /api/constructions/request-no-seq?date=YYMMDDhhmm
// 형식: YYMMDDhhmm## (12자리 순수 숫자, 기존 검증 그대로 통과)
// date 파라미터: YYMMDDhhmm (10자리, KST 기준 클라이언트에서 전달)
app.get('/api/constructions/request-no-seq', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const dateParam = c.req.query('date') // ex: "2606211435" (YYMMDDhhmm)
  if (!dateParam || dateParam.length !== 10) {
    return c.json({ error: 'date 파라미터 필요 (YYMMDDhhmm 10자리)' }, 400)
  }

  // 동일 YYMMDDhhmm prefix 로 시작하는 건수 조회
  const prefix = dateParam // ex: "2606211435"
  const row = rawDb.prepare(
    `SELECT COUNT(*) as cnt FROM constructions WHERE request_no LIKE ?`
  ).get(`${prefix}%`) as any

  const nextSeq = String((row?.cnt ?? 0) + 1).padStart(2, '0')
  const nextNo = `${prefix}${nextSeq}` // ex: "260621143501"

  return c.json({ next_no: nextNo, seq: nextSeq, prefix })
})

// ─── NAS 전용: 공사 삭제 (FEAT-060 + BUG-FIX) ───────────────────────────────
// [TASK-001 → FEAT-053 → FEAT-060] RULE-002 준수 — app.route('/api/constructions') 마운트 앞에 등록
// [FEAT-053] 시스템관리자: 완료(completed/settled) 상태만 허용
// [FEAT-060] 등록자: registered 상태 + 연결 작업 0건일 때 추가 허용
// [BUG-FIX] isSysAdmin && isCreator 동시 케이스: creator 규칙 우선 (registered 삭제 허용)
//           Number() 강제 변환으로 타입 불일치(string vs number) 방어
app.delete('/api/constructions/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: '잘못된 ID' }, 400)

  const con = rawDb.prepare(`SELECT id, title, status, created_by FROM constructions WHERE id = ?`).get(id) as any
  if (!con) return c.json({ error: '공사 없음' }, 404)

  const isSysAdmin = user.role === 'admin' && user.position === '시스템관리자'
  // [BUG-FIX] Number() 강제 변환으로 타입 불일치(string vs number) 방어
  const isCreator  = Number(user.id) === Number(con.created_by)

  if (isCreator && con.status === 'registered') {
    // [FEAT-060] 등록자(sysadmin 포함): registered 상태 + 연결 작업 0건 → 삭제 허용
    const taskCount = rawDb.prepare(
      `SELECT COUNT(*) as cnt FROM tasks WHERE construction_id = ?`
    ).get(id) as any
    if ((taskCount?.cnt ?? 0) > 0) {
      return c.json({ error: `연결된 작업이 ${taskCount.cnt}건 있어 삭제할 수 없습니다. 작업을 먼저 삭제해 주세요.` }, 409)
    }
    // 조건 통과 → 삭제 진행
  } else if (isSysAdmin) {
    // [FEAT-053] 시스템관리자: 완료(completed) 또는 정산완료(settled) 상태만 허용
    if (con.status !== 'completed' && con.status !== 'settled') {
      return c.json({ error: `완료되거나 정산완료된 공사만 삭제할 수 있습니다. 현재 상태: ${con.status}` }, 409)
    }
    // 진행 중인 작업 잔존 여부 확인
    const linked = rawDb.prepare(
      `SELECT COUNT(*) as cnt FROM tasks WHERE construction_id = ? AND status NOT IN ('completed','cancelled')`
    ).get(id) as any
    if ((linked?.cnt ?? 0) > 0) {
      return c.json({ error: `진행 중인 작업이 ${linked.cnt}건 있어 삭제할 수 없습니다. 작업을 먼저 완료하거나 취소해 주세요.` }, 409)
    }
  } else if (isCreator) {
    // 등록자이지만 registered 상태가 아님
    return c.json({ error: `등록 상태의 공사만 삭제할 수 있습니다. 현재 상태: ${con.status}` }, 409)
  } else {
    // 권한 없음 (sysadmin도 아니고 등록자도 아님)
    return c.json({ error: '삭제 권한이 없습니다. 등록자 또는 시스템 관리자만 삭제할 수 있습니다.' }, 403)
  }

  rawDb.prepare(`DELETE FROM constructions WHERE id = ?`).run(id)
  console.log(`[FEAT-060] 공사 삭제 완료: id=${id} title="${con.title}" by ${user.name}(${isSysAdmin?'sysadmin':'creator'})`)
  return c.json({ success: true, message: `"${con.title}" 공사가 삭제되었습니다.` })
})

app.route('/api/constructions', constructionRoutes)

// ─── NAS 전용: 알림센터 전체 삭제 ────────────────────────────────────────────
// [BUG-023] RULE-002 준수 — app.route('/api/notifications') 앞에 등록
// notifications.ts (Cloudflare용)의 /clear-all 과 동일 기능, NAS rawDb 버전
app.delete('/api/notifications/clear-all', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  rawDb.prepare(`DELETE FROM notifications WHERE user_id = ?`).run(user.id)
  console.log(`[알림] 전체삭제 — user:${user.id}(${user.name})`)
  return c.json({ success: true })
})

app.route('/api/notifications', notificationRoutes)

// ─── FCM 푸시 알림 API (Phase 2 — FEAT-025-FCM) ───────────────────────────────
// [RULE-001] NAS 전용 라우트 — app.route() 마운트 이후에 위치해도 독립 경로이므로 충돌 없음

// POST /api/push/register — 앱에서 FCM 토큰 등록/갱신
// ─── FCM 푸시 API → nas-routes/push.ts ─────────────────────────────────────────
app.route('/api/push', pushRoutes)
// ─── 서명 API ─────────────────────────────────────────────────────────────────
// 위험성평가 서명 조회
app.get('/api/risk/:id/signatures', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const rows = rawDb.prepare(
    `SELECT ras.*, u.name as user_name_from_users, u.position
     FROM risk_assessment_signatures ras
     LEFT JOIN users u ON u.id = ras.user_id
     WHERE ras.assessment_id = ?
     ORDER BY ras.signed_at ASC`
  ).all(Number(id))
  return c.json(rows)
})

// 위험성평가 서명 등록 (본인 계정 또는 서명 패드)
app.post('/api/risk/:id/signatures', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  const role = body.role || 'member'
  const signData = body.sign_data || null   // base64 서명 이미지
  const signMethod = signData ? 'pad' : 'account'
  try {
    const info = rawDb.prepare(
      `INSERT OR REPLACE INTO risk_assessment_signatures
       (assessment_id, user_id, user_name, position, role, signed_at, sign_method, sign_data)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`
    ).run(Number(id), user.id, user.name, user.position || '', role, signMethod, signData)
    return c.json({ success: true, id: info.lastInsertRowid })
  } catch(e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// 위험성평가 서명 삭제 (본인만)
app.delete('/api/risk/:id/signatures/:sigId', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { id, sigId } = c.req.param()
  const sig = rawDb.prepare(
    'SELECT * FROM risk_assessment_signatures WHERE id=? AND assessment_id=?'
  ).get(Number(sigId), Number(id))
  if (!sig) return c.json({ error: '서명을 찾을 수 없습니다.' }, 404)
  if ((sig as any).user_id !== user.id && user.role !== 'admin')
    return c.json({ error: '본인 서명만 삭제할 수 있습니다.' }, 403)
  rawDb.prepare('DELETE FROM risk_assessment_signatures WHERE id=?').run(Number(sigId))
  return c.json({ success: true })
})


// TBM 레코드 삭제
// - admin 또는 작성자(conductor_id)만 삭제 가능
// - ON DELETE CASCADE로 tbm_signatures 자동 삭제
// - 해당 task에 TBM이 더 이상 없으면 task.status를 tbm_done → in_progress로 되돌림
// ─── TBM delete + attendees → nas-routes/tbm-extra.ts (RULE-002 등록) ──────────
registerTbmDeleteRoute(app)
registerTbmAttendeesRoute(app)

// ─── 서명 요청 API ─────────────────────────────────────────────────────────────

// 내 서명 요청 목록 조회 (pending/signed 분리)
// ─── 서명요청 API → nas-routes/signature-requests.ts ───────────────────────────
app.route('/api/signature-requests', signatureRequestsRoutes)
// ─── 작업유형별 안전내용 관리 API (FEAT-WT-SAFETY) ────────────────────────────
// [RULE-002] NAS 오버라이드 라우트는 Cloudflare 라우트 앞에 등록

// GET /api/work-type-safety — 전체 목록 조회 (로그인 필요)
app.get('/api/work-type-safety', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    const rows = rawDb.prepare(
      `SELECT id, type_key, work_class, label, icon, is_active, sort_order, safety_items, tbm_items, precaution_items, photo_labels, input_fields
       FROM work_type_safety_settings ORDER BY sort_order ASC, id ASC`
    ).all()
    const list = rows.map((r: any) => ({
      id: r.id,
      type_key: r.type_key,
      work_class: r.work_class || '',
      label: r.label,
      icon: r.icon || 'fa-hard-hat',
      is_active: r.is_active === 1,
      sort_order: r.sort_order || 0,
      safety_items: (() => { try { return JSON.parse(r.safety_items || '[]') } catch { return [] } })(),
      tbm_items: (() => { try { return JSON.parse(r.tbm_items || '[]') } catch { return [] } })(),
      precaution_items: (() => { try { return JSON.parse(r.precaution_items || '[]') } catch { return [] } })(),
      photo_labels: (() => { try { return JSON.parse(r.photo_labels || '[]') } catch { return [] } })(),
      input_fields: (() => { try { return JSON.parse(r.input_fields || '[]') } catch { return [] } })(),
    }))
    return c.json({ data: list })
  } catch (e: any) {
    console.error('[GET /api/work-type-safety] 오류:', e.message)
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/work-type-safety/:typeKey — 단건 조회
app.get('/api/work-type-safety/:typeKey', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const typeKey = decodeURIComponent(c.req.param('typeKey'))
  try {
    const row = rawDb.prepare(
      `SELECT id, type_key, work_class, label, icon, is_active, sort_order, safety_items, tbm_items, precaution_items, photo_labels, input_fields
       FROM work_type_safety_settings WHERE type_key = ?`
    ).get(typeKey) as any
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ data: {
      id: row.id, type_key: row.type_key, work_class: row.work_class || '',
      label: row.label, icon: row.icon || 'fa-hard-hat',
      is_active: row.is_active === 1, sort_order: row.sort_order || 0,
      safety_items: (() => { try { return JSON.parse(row.safety_items || '[]') } catch { return [] } })(),
      tbm_items: (() => { try { return JSON.parse(row.tbm_items || '[]') } catch { return [] } })(),
      precaution_items: (() => { try { return JSON.parse(row.precaution_items || '[]') } catch { return [] } })(),
      photo_labels: (() => { try { return JSON.parse(row.photo_labels || '[]') } catch { return [] } })(),
      input_fields: (() => { try { return JSON.parse(row.input_fields || '[]') } catch { return [] } })(),
    }})
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/work-type-safety — 신규 추가 (안전관리자/현장대리인/admin/supervisor만)
app.post('/api/work-type-safety', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const allowedRoles = ['admin', 'supervisor']
  const allowedPositions = ['안전관리자', '현장대리인']
  const isAllowed = allowedRoles.includes(user.role) || allowedPositions.includes(user.position || '')
  if (!isAllowed) return c.json({ error: '권한이 없습니다.' }, 403)
  try {
    const body = await c.req.json()
    const typeKey = (body.type_key || '').trim()
    if (!typeKey) return c.json({ error: 'type_key 필수' }, 400)
    const workClass = (body.work_class || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!workClass) return c.json({ error: 'work_class 필수 (영문 소문자/숫자/언더바)' }, 400)
    const label = (body.label || typeKey).trim()
    const icon = (body.icon || 'fa-hard-hat').trim()
    const isActive = body.is_active !== false ? 1 : 0
    const sortOrder = Number(body.sort_order) || 0
    const safetyItems = JSON.stringify(Array.isArray(body.safety_items) ? body.safety_items : [])
    const tbmItems = JSON.stringify(Array.isArray(body.tbm_items) ? body.tbm_items : [])
    const precautionItems = JSON.stringify(Array.isArray(body.precaution_items) ? body.precaution_items : [])
    const photoLabels = JSON.stringify(Array.isArray(body.photo_labels) ? body.photo_labels : [])
    const inputFields = JSON.stringify(Array.isArray(body.input_fields) ? body.input_fields : [])
    const now = new Date().toISOString()
    const result = rawDb.prepare(`
      INSERT INTO work_type_safety_settings
        (type_key, work_class, label, icon, is_active, sort_order, safety_items, tbm_items, precaution_items, photo_labels, input_fields, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(typeKey, workClass, label, icon, isActive, sortOrder, safetyItems, tbmItems, precautionItems, photoLabels, inputFields, now, now)
    return c.json({ ok: true, id: result.lastInsertRowid })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 존재하는 type_key입니다.' }, 409)
    console.error('[POST /api/work-type-safety] 오류:', e.message)
    return c.json({ error: e.message }, 500)
  }
})

// PUT /api/work-type-safety/:typeKey — 수정
app.put('/api/work-type-safety/:typeKey', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const allowedRoles = ['admin', 'supervisor']
  const allowedPositions = ['안전관리자', '현장대리인']
  const isAllowed = allowedRoles.includes(user.role) || allowedPositions.includes(user.position || '')
  if (!isAllowed) return c.json({ error: '권한이 없습니다.' }, 403)
  const typeKey = decodeURIComponent(c.req.param('typeKey'))
  try {
    const body = await c.req.json()
    const workClass = (body.work_class || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    const label = (body.label || typeKey).trim()
    const icon = (body.icon || 'fa-hard-hat').trim()
    const isActive = body.is_active !== false ? 1 : 0
    const sortOrder = Number(body.sort_order) || 0
    const safetyItems = JSON.stringify(Array.isArray(body.safety_items) ? body.safety_items : [])
    const tbmItems = JSON.stringify(Array.isArray(body.tbm_items) ? body.tbm_items : [])
    const precautionItems = JSON.stringify(Array.isArray(body.precaution_items) ? body.precaution_items : [])
    const photoLabels = JSON.stringify(Array.isArray(body.photo_labels) ? body.photo_labels : [])
    const inputFields = JSON.stringify(Array.isArray(body.input_fields) ? body.input_fields : [])
    const now = new Date().toISOString()
    const result = rawDb.prepare(`
      UPDATE work_type_safety_settings
      SET work_class=?, label=?, icon=?, is_active=?, sort_order=?, safety_items=?, tbm_items=?, precaution_items=?, photo_labels=?, input_fields=?, updated_at=?
      WHERE type_key=?
    `).run(workClass || null, label, icon, isActive, sortOrder, safetyItems, tbmItems, precautionItems, photoLabels, inputFields, now, typeKey)
    if (result.changes === 0) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  } catch (e: any) {
    console.error('[PUT /api/work-type-safety] 오류:', e.message)
    return c.json({ error: e.message }, 500)
  }
})

// DELETE /api/work-type-safety/:typeKey — 삭제
app.delete('/api/work-type-safety/:typeKey', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const allowedRoles = ['admin', 'supervisor']
  const allowedPositions = ['안전관리자', '현장대리인']
  const isAllowed = allowedRoles.includes(user.role) || allowedPositions.includes(user.position || '')
  if (!isAllowed) return c.json({ error: '권한이 없습니다.' }, 403)
  const typeKey = decodeURIComponent(c.req.param('typeKey'))
  try {
    const result = rawDb.prepare(`DELETE FROM work_type_safety_settings WHERE type_key=?`).run(typeKey)
    if (result.changes === 0) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── 법령안내 API ──────────────────────────────────────────────────────────────
// 법령안내 전체 조회
// ─── 법령안내 API → nas-routes/legal-notices.ts ────────────────────────────────
app.route('/api/legal-notices', legalNoticesNasRoutes)
// ─── 지오코딩 API → nas-routes/geocode.ts ──────────────────────────────────────
app.route('/api/geocode', geocodeRoutes)
// ─── 관리자 설정 + 앱버전 → nas-routes/admin.ts ────────────────────────────────
app.route('/api/admin', adminRoutes)
app.route('/api/app-version', createAppVersionRoute())
// ─── APK 배포 API → nas-routes/dist.ts ─────────────────────────────────────────
app.route('/api/dist', distRoutes)
// ─── work-reports + volume-unit-prices → nas-routes/work-reports.ts ────────────
app.route('/api/work-reports', workReportsRoutes)
app.route('/api/volume-unit-prices', createVolumeUnitPricesRoutes())
// ─── splice-reports + splice-unit-prices → nas-routes/splice-reports.ts ────────
app.route('/api/splice-reports', spliceReportsRoutes)
app.route('/api/splice-unit-prices', createSpliceUnitPricesRoutes())
// admin folders/reset/update → nas-routes/admin.ts (adminRoutes 에 포함됨)
// ─── 사진 API (NAS 전용) — BUG-033: photos.ts 동적 async import 실패로 NAS에서 직접 구현 ──
// [BUG-033] photos.ts의 `await import('node:fs/promises')` 동적 비동기 import가
//   NAS tsx 런타임에서 실패하여 업로드 불가. attachments-nas.ts 패턴(정적 동기 import +
//   rawDb 직접 사용)으로 NAS 전용 라우트를 node-server.ts에 직접 구현.
// RULE-002: app.route('/api/photos', photosRoutes) 앞에 등록하여 우선 처리.

/** photo_type → stage 변환 */
function photoTypeToStage(photoType: string): string {
  const map: Record<string, string> = {
    tbm: 'tbm', tbm_photo: 'tbm',
    order: 'order', work_order: 'order',
    inspection: 'inspection',
    before: 'photo', progress: 'photo', after: 'photo', photo: 'photo',
  }
  return map[photoType] || 'photo'
}

// GET /api/photos?task_id=X&photo_type=Y — 목록 조회
// [FEAT-112 세션152 NAS FIX] construction_id + exclude_task_id 파라미터 추가
//   construction_id 지정 시: 해당 공사의 특정 상태 작업 사진만 반환 (tasks JOIN)
//   exclude_task_id: 현재 작업 본인 제외
app.get('/api/photos', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const { task_id, photo_type, construction_id, exclude_task_id } = c.req.query()

  const LINKED_STATUSES = ['in_progress', 'tbm_done', 'working', 'work_completed', 'completed']

  let q: string
  const params: any[] = []
  const wheres: string[] = []

  if (construction_id) {
    // construction_id 기반: tasks JOIN으로 해당 공사 작업 사진 조회
    q = `SELECT p.id, p.task_id, p.photo_type, p.file_name, p.file_path, p.file_size, p.mime_type,
      p.caption, p.taken_at, p.created_at, u.name as uploader_name,
      t.sub_task_number, t.title as task_title, t.status as task_status
      FROM task_photos p
      LEFT JOIN users u ON u.id = p.uploader_id
      INNER JOIN tasks t ON t.id = p.task_id`
    wheres.push('t.construction_id = ?')
    params.push(parseInt(construction_id, 10))
    wheres.push(`t.status IN (${LINKED_STATUSES.map(() => '?').join(',')})`)
    params.push(...LINKED_STATUSES)
    if (exclude_task_id) {
      wheres.push('p.task_id != ?')
      params.push(parseInt(exclude_task_id, 10))
    }
    if (photo_type) { wheres.push('p.photo_type = ?'); params.push(photo_type) }
    q += ' WHERE ' + wheres.join(' AND ')
    q += ' ORDER BY t.sub_task_number ASC, p.task_id ASC, p.created_at ASC'
  } else {
    q = `SELECT p.id, p.task_id, p.photo_type, p.file_name, p.file_path, p.file_size, p.mime_type,
      p.caption, p.taken_at, p.created_at, u.name as uploader_name
      FROM task_photos p LEFT JOIN users u ON u.id = p.uploader_id`
    if (task_id) { wheres.push('p.task_id = ?'); params.push(task_id) }
    if (photo_type) { wheres.push('p.photo_type = ?'); params.push(photo_type) }
    if (wheres.length) q += ' WHERE ' + wheres.join(' AND ')
    q += ' ORDER BY p.created_at DESC'
  }

  const rows = rawDb.prepare(q).all(...params)
  return c.json(rows)
})

// GET /api/photos/:id/img — 이미지 파일 서빙
app.get('/api/photos/:id/img', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const photo = rawDb.prepare(
    'SELECT file_path, file_data, mime_type, file_name FROM task_photos WHERE id = ?'
  ).get(Number(id)) as any
  if (!photo) return c.json({ error: '사진 없음' }, 404)

  // 파일 기반 (신규)
  if (photo.file_path) {
    try {
      const fileBuffer = readFileSync(photo.file_path)
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': photo.mime_type || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
          'Content-Disposition': `inline; filename="${photo.file_name}"`,
        },
      })
    } catch (_) {
      return c.json({ error: '파일을 찾을 수 없습니다.' }, 404)
    }
  }

  // 하위호환: base64 기반 (기존 데이터)
  if (photo.file_data) {
    const binary = atob(photo.file_data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': photo.mime_type || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }
  return c.json({ error: '사진 데이터 없음' }, 404)
})

// GET /api/photos/:id/data — base64 데이터 반환 (하위호환)
app.get('/api/photos/:id/data', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const photo = rawDb.prepare(
    'SELECT file_path, file_data, mime_type FROM task_photos WHERE id = ?'
  ).get(Number(id)) as any
  if (!photo) return c.json({ error: '사진 없음' }, 404)

  if (photo.file_path) {
    try {
      const fileBuffer = readFileSync(photo.file_path)
      const b64 = Buffer.from(fileBuffer).toString('base64')
      return c.json({ file_data: b64, mime_type: photo.mime_type })
    } catch (_) {
      return c.json({ error: '파일을 찾을 수 없습니다.' }, 404)
    }
  }
  return c.json({ file_data: photo.file_data, mime_type: photo.mime_type })
})

// POST /api/photos — 사진 업로드 (multipart/form-data)
app.post('/api/photos', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const contentType = c.req.header('Content-Type') || ''

  // ── multipart/form-data (원본 파일 업로드) ─────────────────────────
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData  = await c.req.formData()
      const taskId    = formData.get('task_id')
      const photoType = (formData.get('photo_type') as string) || 'progress'
      const caption   = (formData.get('caption')    as string) || ''
      const files     = formData.getAll('photos') as File[]

      if (!taskId) return c.json({ error: 'task_id 필요' }, 400)
      if (files.length === 0) return c.json({ error: '파일 없음' }, 400)

      // task + constructions 조회 (rawDb 동기), [FEAT-050] 업로더 팀명 포함
      const task = rawDb.prepare(
        `SELECT t.id, t.task_number, t.sub_task_number, t.planned_date, t.work_date,
                t.construction_type, t.construction_id,
                c.request_no AS con_request_no, c.title AS con_title,
                c.created_at AS con_created_at,
                tm.name AS team_name
         FROM tasks t
         LEFT JOIN constructions c ON c.id = t.construction_id
         LEFT JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?
         LEFT JOIN users           wu ON wu.id = ta.worker_id
         LEFT JOIN teams           tm ON tm.id = wu.team_id
         WHERE t.id = ?`
      ).get(user.id, Number(taskId)) as any
      if (!task) return c.json({ error: '작업을 찾을 수 없습니다' }, 404)

      const stage     = photoTypeToStage(photoType)
      const uploadDir = getUploadDir(task, stage, photoType, caption)
      // getUploadDir 내부에서 mkdirSync 호출됨 — 폴더 자동 생성

      const savedIds: number[] = []

      for (const file of files) {
        if (!file || typeof file === 'string') continue

        const fileName = generateFileName(file.name || 'photo.jpg')
        const filePath = join(uploadDir, fileName)
        const buf      = await file.arrayBuffer()
        writeFileSync(filePath, Buffer.from(buf))  // 동기 저장 — NAS 확실히 동작

        // INSERT는 rawDb 동기 사용 (BUG-025 방지)
        const result = rawDb.prepare(
          `INSERT INTO task_photos
             (task_id, uploader_id, photo_type, file_name, file_path, file_data, file_size, mime_type, caption)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`
        ).run(
          Number(taskId), user.id, photoType,
          file.name || fileName, filePath,
          file.size, file.type || 'image/jpeg', caption
        )
        savedIds.push(result.lastInsertRowid as number)
      }

      // FEAT-057: 사진 첨부 완료 → supervisor/safety 역할에게 FCM 알림
      if (savedIds.length > 0) {
        try {
          const photoTypeLabel: Record<string, string> = {
            before:   '착공 전', progress: '진행 중', after: '완료',
            tbm: 'TBM', inspection: '점검', default: '작업',
          }
          const ptLabel = photoTypeLabel[photoType] || photoTypeLabel.default
          const taskLabel = task.task_number
            ? `${task.task_number}${task.sub_task_number ? '-' + task.sub_task_number : ''}`
            : String(taskId)
          sendFcmToRoles(['supervisor', 'safety'], {
            title: `[사진 첨부] 작업 ${taskLabel}`,
            body:  `${user.name}님이 ${ptLabel} 사진 ${savedIds.length}장을 첨부했습니다.`,
            data:  { type: 'photo_uploaded', ref_type: 'task', ref_id: String(taskId) }
          }).catch(() => {})
        } catch (_) {}
      }

      return c.json({ success: true, ids: savedIds, count: savedIds.length })
    } catch (e: any) {
      console.error('[사진] 업로드 오류:', e)
      return c.json({ error: `업로드 실패: ${e.message}` }, 500)
    }
  }

  // ── application/json (base64 — 하위호환) ──────────────────────────
  const body = await c.req.json()
  const { task_id, photo_type, file_name, file_data, file_size, mime_type, caption } = body
  if (!task_id || !file_data) return c.json({ error: '필수 항목 누락' }, 400)

  const result = rawDb.prepare(
    `INSERT INTO task_photos
       (task_id, uploader_id, photo_type, file_name, file_path, file_data, file_size, mime_type, caption)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`
  ).run(
    task_id, user.id, photo_type || 'progress',
    file_name || 'photo.jpg', file_data,
    file_size || 0, mime_type || 'image/jpeg', caption || ''
  )
  // FEAT-057: base64 경로도 FCM 알림 발송
  try {
    const photoTypeLabel2: Record<string, string> = {
      before: '착공 전', progress: '진행 중', after: '완료',
      tbm: 'TBM', inspection: '점검', default: '작업',
    }
    const pt2 = photo_type || 'progress'
    const pt2Label = photoTypeLabel2[pt2] || photoTypeLabel2.default
    sendFcmToRoles(['supervisor', 'safety'], {
      title: `[사진 첨부] 작업 ${task_id}`,
      body:  `${user.name}님이 ${pt2Label} 사진을 첨부했습니다.`,
      data:  { type: 'photo_uploaded', ref_type: 'task', ref_id: String(task_id) }
    }).catch(() => {})
  } catch (_) {}

  return c.json({ success: true, id: result.lastInsertRowid })
})

// DELETE /api/photos/:id — 사진 삭제
app.delete('/api/photos/:id', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')

  const photo = rawDb.prepare(
    'SELECT uploader_id, file_path FROM task_photos WHERE id = ?'
  ).get(Number(id)) as any
  if (!photo) return c.json({ error: '사진 없음' }, 404)

  if (user.role === 'worker' && photo.uploader_id !== user.id) {
    return c.json({ error: '본인이 업로드한 사진만 삭제할 수 있습니다.' }, 403)
  }

  if (photo.file_path) {
    try { unlinkSync(photo.file_path) } catch (_) {}
  }
  rawDb.prepare('DELETE FROM task_photos WHERE id = ?').run(Number(id))
  return c.json({ success: true })
})

// POST /api/photos/upload — TBM 안전조치 사진 전용 업로드 (BUG-034)
// app.js의 uploadTbmPhoto()가 호출: formData 필드 = photo(File), label, section_id, photo_item_id, task_id
// 응답 형식: { id, file_path, file_name, mime_type } — checklist/tbm-photos에서 file_path 등 사용
// RULE-002: app.route('/api/photos', photosRoutes) 앞에 등록
app.post('/api/photos/upload', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  try {
    const formData   = await c.req.formData()
    const file       = formData.get('photo') as File | null
    const label      = (formData.get('label')         as string) || ''
    const taskIdStr  = (formData.get('task_id')       as string) || ''

    if (!file || typeof file === 'string') return c.json({ error: '파일 없음 (photo 필드)' }, 400)

    // task 정보 조회 (task_id 있으면) — 없으면 미분류 폴더 사용
    // [FEAT-050] 업로더 팀명 포함
    let task: any = null
    if (taskIdStr) {
      task = rawDb.prepare(
        `SELECT t.id, t.task_number, t.sub_task_number, t.planned_date, t.work_date,
                t.construction_type, t.construction_id,
                c.request_no AS con_request_no, c.title AS con_title,
                c.created_at AS con_created_at,
                tm.name AS team_name
         FROM tasks t
         LEFT JOIN constructions c  ON c.id  = t.construction_id
         LEFT JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?
         LEFT JOIN users           wu ON wu.id = ta.worker_id
         LEFT JOIN teams           tm ON tm.id = wu.team_id
         WHERE t.id = ?`
      ).get(user.id, Number(taskIdStr)) as any
    }

    // 업로드 폴더: task 있으면 TBM 폴더, 없으면 미분류
    const uploadDir = getUploadDir(task || 'tbm-photo', 'tbm', 'tbm_photo', label)

    const fileName = generateFileName(file.name || 'photo.jpg')
    const filePath = join(uploadDir, fileName)
    const buf      = await file.arrayBuffer()
    writeFileSync(filePath, Buffer.from(buf))

    // task_photos에 INSERT — checklist/tbm-photos가 file_path로 참조
    const mimeType = file.type || 'image/jpeg'
    const result   = rawDb.prepare(
      `INSERT INTO task_photos
         (task_id, uploader_id, photo_type, file_name, file_path, file_data, file_size, mime_type, caption)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    ).run(
      task ? Number(taskIdStr) : null,
      user.id, 'tbm',          // ← BUG-036 수정: 'tbm_photo' → 'tbm' (CHECK constraint 허용값)
      file.name || fileName, filePath,
      file.size, mimeType, label
    )

    return c.json({
      success: true,
      id:        result.lastInsertRowid,
      file_path: filePath,
      file_name: file.name || fileName,
      mime_type: mimeType,
    })
  } catch (e: any) {
    console.error('[TBM사진/upload] 오류:', e)
    return c.json({ error: `업로드 실패: ${e.message}` }, 500)
  }
})

// GET /api/tbm-photos/:id/img — TBM 안전조치 사진 서빙 (BUG-056)
// tbm_photo_items.id → file_path 직접 서빙 (task_photos와 별도 테이블)
app.get('/api/tbm-photos/:id/img', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const id = c.req.param('id')
  const item = rawDb.prepare(
    'SELECT file_path, file_name, mime_type FROM tbm_photo_items WHERE id = ?'
  ).get(Number(id)) as any
  if (!item || !item.file_path) return c.json({ error: 'TBM 사진 없음' }, 404)
  try {
    const fileBuffer = readFileSync(item.file_path)
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': item.mime_type || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Content-Disposition': `inline; filename="${item.file_name || 'photo.jpg'}"`,
      },
    })
  } catch (_) {
    return c.json({ error: '파일을 찾을 수 없습니다.' }, 404)
  }
})

// ─── photosRoutes (src/routes/photos.ts) 마운트 — Cloudflare 빌드용, NAS에선 위 라우트가 우선 처리 ──
// [BUG-033] NAS에서는 위 직접 구현 라우트가 우선 처리됨 (RULE-002: app.route 앞에 등록)
app.route('/api/photos', photosRoutes)

// GET /tbm-share/:token/photo/:photoId — 공유 사진 서빙 (인증 불필요)
app.get('/tbm-share/:token/photo/:photoId', async (c) => {
  const token = c.req.param('token')
  const photoId = Number(c.req.param('photoId'))
  const row = rawDb.prepare(
    `SELECT id FROM tbm_share_tokens WHERE token = ? AND expires_at > datetime('now')`
  ).get(token) as any
  if (!row) return c.json({ error: '만료되었거나 유효하지 않은 링크' }, 403)

  const item = rawDb.prepare(
    'SELECT file_path, file_name, mime_type FROM tbm_photo_items WHERE id = ?'
  ).get(photoId) as any
  if (!item || !item.file_path) return c.json({ error: '사진 없음' }, 404)
  try {
    const fileBuffer = readFileSync(item.file_path)
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': item.mime_type || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `inline; filename="${item.file_name || 'photo.jpg'}"`,
      },
    })
  } catch (_) {
    return c.json({ error: '파일을 찾을 수 없습니다.' }, 404)
  }
})

// GET /tbm-share/:token — 공개 TBM 결과 페이지 (인증 불필요, 7일 유효)
// XSS 방지용 HTML 이스케이프 헬퍼 (공개 페이지 전용)
function _esc(s: any): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}
app.get('/tbm-share/:token', async (c) => {
  const token = c.req.param('token')
  const shareRow = rawDb.prepare(
    `SELECT tbm_id, task_id, expires_at FROM tbm_share_tokens WHERE token = ? AND expires_at > datetime('now')`
  ).get(token) as any
  if (!shareRow) {
    return c.html(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>링크 만료 — Safety NOTE</title>
      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
      <style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#F9FAFB;margin:0}</style>
    </head><body>
      <div style="text-align:center;padding:32px">
        <i class="fas fa-link-slash" style="font-size:48px;color:#EF4444;margin-bottom:16px"></i>
        <h2 style="color:#1F2937;margin:0 0 8px">링크가 만료되었습니다</h2>
        <p style="color:#6B7280;font-size:14px">이 TBM 공유 링크는 7일 후 자동으로 만료됩니다.</p>
      </div>
    </body></html>`, 410)
  }

  // 조회수 증가
  rawDb.prepare(`UPDATE tbm_share_tokens SET view_count = view_count + 1 WHERE token = ?`).run(token)

  const tbmId = shareRow.tbm_id
  const taskId = shareRow.task_id

  // TBM 기본 정보 (tasks.manager_name 없음 → supervisor_id JOIN으로 담당자 조회)
  const tbm = rawDb.prepare(`
    SELECT t.*, u.name AS conductor_name,
           tk.work_number, tk.sub_task_number, tk.title AS task_title,
           tk.gps_address AS task_gps_address,
           tk.confirmed_address AS task_confirmed_address,
           sv.name AS supervisor_name
    FROM tbm_records t
    LEFT JOIN users u ON u.id = t.conductor_id
    LEFT JOIN tasks tk ON tk.id = t.task_id
    LEFT JOIN users sv ON sv.id = tk.supervisor_id
    WHERE t.id = ?
  `).get(tbmId) as any
  if (!tbm) return c.json({ error: 'TBM 없음' }, 404)

  // 참가자(작업자) 목록
  let attendees: string[] = []
  try { attendees = typeof tbm.attendees === 'string' ? JSON.parse(tbm.attendees) : (tbm.attendees || []) } catch(_) {}

  // 배정 작업자 목록 (task_assignments → users)
  let assignedWorkers: string[] = []
  if (taskId) {
    try {
      const workerRows = rawDb.prepare(`
        SELECT u.name FROM task_assignments ta
        JOIN users u ON u.id = ta.worker_id
        WHERE ta.task_id = ?
        ORDER BY u.name
      `).all(taskId || 0) as any[]
      assignedWorkers = workerRows.map((r: any) => r.name).filter(Boolean)
    } catch(_) {}
  }

  // TBM 안전조치 사진 (task_id → checklist_assessments → tbm_photo_sections → tbm_photo_items)
  const checklistRows = rawDb.prepare(`
    SELECT tps.section_name,
      json_group_array(json_object(
        'id', tpi.id,
        'label', tpi.label,
        'file_path', tpi.file_path
      )) AS photos
    FROM checklist_assessments ca
    JOIN tbm_photo_sections tps ON tps.assessment_id = ca.id
    JOIN tbm_photo_items tpi ON tpi.section_id = tps.id
    WHERE ca.task_id = ? AND tpi.file_path IS NOT NULL AND tpi.file_path != ''
    GROUP BY tps.id, tps.section_name
  `).all(taskId || 0) as any[]

  // 사진 2열 HTML 생성
  let photoSectionHtml = ''
  if (checklistRows.length > 0) {
    const allPhotos: any[] = checklistRows.flatMap((sec: any) => {
      let ps: any[] = []
      try { ps = typeof sec.photos === 'string' ? JSON.parse(sec.photos) : [] } catch(_) {}
      return ps.filter((p: any) => p.file_path).map((p: any) => ({ ...p, section_name: sec.section_name || '' }))
    })
    if (allPhotos.length > 0) {
      let grid = ''
      for (let i = 0; i < allPhotos.length; i += 2) {
        const L = allPhotos[i], R = allPhotos[i + 1]
        const Lcap = `[${L.section_name}] ${L.label || ''}`.trim()
        const Rcap = R ? `[${R.section_name}] ${R.label || ''}`.trim() : ''
        // onclick: _lbOpen(src, caption) — caption은 싱글쿼트+이스케이프로 HTML 속성 안에 안전하게 전달
        // JSON.stringify는 큰따옴표를 포함하므로 onclick="..." 속성이 끊어지는 버그 발생 → 싱글쿼트 방식으로 수정
        const LcapJs = Lcap.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
        const RcapJs = Rcap.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
        grid += `<div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;cursor:pointer"
            onclick="_lbOpen('/tbm-share/${token}/photo/${L.id}','${LcapJs}')">
            <img src="/tbm-share/${token}/photo/${L.id}" style="width:100%;aspect-ratio:4/3;object-fit:cover" loading="lazy" onerror="this.style.opacity='.3'">
            <div style="padding:4px 6px;font-size:11px;color:#374151;background:#F9FAFB">${_esc(Lcap)}</div>
          </div>
          ${R ? `<div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;cursor:pointer"
            onclick="_lbOpen('/tbm-share/${token}/photo/${R.id}','${RcapJs}')">
            <img src="/tbm-share/${token}/photo/${R.id}" style="width:100%;aspect-ratio:4/3;object-fit:cover" loading="lazy" onerror="this.style.opacity='.3'">
            <div style="padding:4px 6px;font-size:11px;color:#374151;background:#F9FAFB">${_esc(Rcap)}</div>
          </div>` : '<div></div>'}`
      }
      photoSectionHtml = `
        <div style="background:white;border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
          <h3 style="font-size:13px;font-weight:700;color:#0369A1;margin:0 0 10px"><i class="fas fa-camera" style="margin-right:6px"></i>TBM 안전조치 촬영사진 <span style="font-size:11px;font-weight:400;color:#0284C7">${allPhotos.length}장</span></h3>
          <p style="font-size:11px;color:#6B7280;margin:0 0 8px"><i class="fas fa-hand-pointer" style="margin-right:4px"></i>사진을 클릭하면 크게 볼 수 있습니다</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${grid}</div>
        </div>`
    }
  }

  const attendeeListHtml = attendees.length > 0
    ? attendees.map((name: string) => `<span style="display:inline-block;background:#F3F4F6;border-radius:9999px;padding:3px 10px;font-size:12px;margin:2px">${_esc(name)}</span>`).join('')
    : '<span style="font-size:12px;color:#9CA3AF">정보 없음</span>'

  const expiresDate = (shareRow.expires_at || '').slice(0, 10)

  // 지도 주소 (geo: 링크용)
  const gpsAddr = tbm.task_confirmed_address || tbm.gps_address || tbm.location || ''

  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>TBM 결과 — ${_esc(tbm.task_title) || '작업'}</title>
  <link rel="icon" type="image/png" href="/static/app-icon.png">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Noto Sans KR', sans-serif; background: #F1F5F9; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 0 auto; padding: 16px; }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .label { font-size: 11px; color: #9CA3AF; margin-bottom: 2px; }
    .value { font-size: 13px; font-weight: 600; color: #1F2937; }
    .badge { display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600; }
    /* 사진 라이트박스 */
    #_lb { display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;align-items:center;justify-content:center;flex-direction:column }
    #_lb.open { display:flex }
    #_lb img { max-width:96vw;max-height:80vh;object-fit:contain;border-radius:8px }
    #_lb ._lb-cap { color:#e5e7eb;font-size:12px;margin-top:10px;text-align:center;max-width:90vw }
    #_lb ._lb-close { position:absolute;top:16px;right:18px;color:white;font-size:28px;cursor:pointer;background:none;border:none;line-height:1 }
    /* 지도 버튼 */
    .map-btn { display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;border:1px solid #BFDBFE;background:#EFF6FF;color:#1D4ED8;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;margin-top:6px }
    .map-btn:hover { background:#DBEAFE }
  </style>
</head>
<body>
  <!-- 사진 라이트박스 -->
  <div id="_lb" onclick="if(event.target===this)_lbClose()">
    <button class="_lb-close" onclick="_lbClose()">&times;</button>
    <img id="_lb-img" src="" alt="">
    <div class="_lb-cap" id="_lb-cap"></div>
  </div>

  <div class="container">
    <!-- 헤더 -->
    <div style="background:linear-gradient(135deg,#1D4ED8,#3B82F6);color:white;border-radius:12px;padding:16px 20px;margin-bottom:12px">
      <div style="font-size:11px;opacity:.75;margin-bottom:4px"><i class="fas fa-hard-hat" style="margin-right:4px"></i>TBM (Tool Box Meeting) 완료 결과</div>
      <h1 style="font-size:16px;font-weight:700;margin:0 0 4px">${_esc(tbm.task_title) || '작업명 없음'}</h1>
      ${tbm.work_number ? `<div style="font-size:11px;opacity:.8">작업번호: ${_esc(tbm.sub_task_number ? tbm.work_number + '-' + tbm.sub_task_number : tbm.work_number)}</div>` : ''}
      <div style="font-size:11px;opacity:.7;margin-top:6px"><i class="fas fa-clock" style="margin-right:4px"></i>이 링크는 ${_esc(expiresDate)}까지 유효합니다</div>
    </div>

    <!-- 기본 정보 -->
    <div class="card">
      <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px"><i class="fas fa-info-circle" style="margin-right:5px;color:#3B82F6"></i>TBM 기본 정보</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><div class="label">담당자</div><div class="value">${_esc(tbm.supervisor_name || tbm.conductor_name) || '-'}</div></div>
        <div><div class="label">TBM 실시자</div><div class="value">${_esc(tbm.conductor_name) || '-'}</div></div>
        <div><div class="label">TBM 실시 일시</div><div class="value">${_esc((tbm.tbm_date || '').slice(0, 16).replace('T', ' '))}</div></div>
        <div><div class="label">날씨/기온</div><div class="value">${_esc(tbm.weather) || '-'} / ${tbm.temperature != null ? _esc(tbm.temperature) + '°C' : '-'}</div></div>
      </div>
      ${gpsAddr ? `
      <div style="margin-top:8px">
        <div class="label">TBM 실시 주소</div>
        <div class="value" style="font-size:12px">${_esc(gpsAddr)}</div>
        <a class="map-btn"
           href="https://map.kakao.com/?q=${encodeURIComponent(gpsAddr)}"
           target="_blank" rel="noopener">
          <i class="fas fa-map-marker-alt"></i> 카카오맵
        </a>
        <a class="map-btn" style="margin-left:4px"
           href="https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(gpsAddr)}"
           target="_blank" rel="noopener">
          <i class="fas fa-map"></i> 네이버지도
        </a>
      </div>` : ''}
    </div>

    <!-- 작업자 -->
    <div class="card">
      <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px"><i class="fas fa-users" style="margin-right:5px;color:#10B981"></i>참석 작업자 <span style="font-size:11px;font-weight:400;color:#9CA3AF">${attendees.length}명</span></h3>
      <div style="line-height:2">${attendeeListHtml}</div>
    </div>

    <!-- TBM 사진 -->
    ${photoSectionHtml}

    <!-- 안전 주의사항 -->
    ${tbm.safety_topics ? `
    <div class="card">
      <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px"><i class="fas fa-book" style="margin-right:5px;color:#3B82F6"></i>작업 내용 및 안전교육</h3>
      <div style="font-size:12px;color:#374151;white-space:pre-wrap;background:#F9FAFB;padding:10px;border-radius:8px">${_esc(tbm.safety_topics)}</div>
    </div>` : ''}
    ${tbm.precautions ? `
    <div class="card">
      <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px"><i class="fas fa-exclamation-triangle" style="margin-right:5px;color:#F59E0B"></i>주의사항</h3>
      <div style="font-size:12px;color:#374151;white-space:pre-wrap;background:#FFFBEB;padding:10px;border-radius:8px">${_esc(tbm.precautions)}</div>
    </div>` : ''}

    <!-- 푸터 -->
    <div style="text-align:center;padding:12px 0;font-size:11px;color:#9CA3AF">
      <i class="fas fa-shield-alt" style="margin-right:4px"></i>Safety NOTE — 현장 안전관리 시스템<br>
      이 페이지는 로그인 없이 열람 가능한 공개 링크입니다.
    </div>
  </div>

  <script>
    // ── 라이트박스 ──────────────────────────────────────────────────────────────
    function _lbOpen(src, cap) {
      document.getElementById('_lb-img').src = src;
      document.getElementById('_lb-cap').textContent = cap || '';
      document.getElementById('_lb').classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function _lbClose() {
      document.getElementById('_lb').classList.remove('open');
      document.getElementById('_lb-img').src = '';
      document.body.style.overflow = '';
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') _lbClose(); });
  </script>
</body>
</html>`)
})

// ─── 첨부파일 API → nas-routes/attachments-nas.ts ──────────────────────────────
app.route('/api/attachments', attachmentsNasRoutes)
app.get('/qr/:userId', async (c) => {
  const userId = c.req.param('userId')
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>작업자 안전 프로필 — Safety NOTE</title>
  <link rel="icon" type="image/png" href="/static/app-icon.png">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: linear-gradient(135deg, #F2F0EB 0%, #FDE8F3 100%); min-height: 100vh; font-family: 'LG Smart KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; }
    .profile-wrap { max-width: 440px; margin: 0 auto; padding: 20px 14px 54px; }
    /* ─── 헤더 ─── */
    .lgu-header { background: linear-gradient(135deg, #E6007E 0%, #6B5B9A 100%); border-radius: 22px 22px 0 0; padding: 28px 24px 20px; text-align: center; color: white; }
    .lgu-avatar { width: 80px; height: 80px; border-radius: 50%; background: rgba(255,255,255,0.22); display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 900; color: white; margin: 0 auto 10px; border: 3px solid rgba(255,255,255,0.45); }
    .lgu-name { font-size: 23px; font-weight: 900; letter-spacing: -0.5px; }
    .lgu-sub { font-size: 13px; opacity: 0.82; margin-top: 3px; }
    .lgu-badges { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin-top: 8px; }
    .lgu-badge { display: inline-block; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.38); border-radius: 20px; padding: 3px 13px; font-size: 12px; font-weight: 700; }
    .blood-badge { background: rgba(255,80,80,0.3); border-color: rgba(255,120,120,0.5); }
    /* 헤더 내 안전점수 배지 */
    .header-score-wrap { margin-top: 12px; display: flex; justify-content: center; }
    .header-score-badge { display: inline-flex; align-items: center; gap: 7px; background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.38); border-radius: 30px; padding: 6px 18px 6px 12px; }
    .header-score-num { font-size: 20px; font-weight: 900; line-height: 1; }
    .header-score-label { font-size: 11px; font-weight: 700; opacity: 0.88; }
    /* ─── 카드 공통 ─── */
    .info-card { background: white; box-shadow: 0 8px 32px rgba(230,0,126,0.10); overflow: hidden; }
    .section-title { display: flex; align-items: center; gap: 7px; padding: 12px 18px 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.3px; border-bottom: 1px solid #F5F0EB; }
    .info-row { display: flex; align-items: flex-start; padding: 11px 18px; border-bottom: 1px solid #F5F0EB; gap: 12px; }
    .info-row:last-child { border-bottom: none; }
    .info-icon { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; margin-top: 1px; }
    .info-label { font-size: 10px; font-weight: 700; color: #9CA3AF; line-height: 1; text-transform: uppercase; letter-spacing: 0.3px; }
    .info-value { font-size: 14px; font-weight: 600; color: #1A1A1A; line-height: 1.4; margin-top: 3px; }
    /* ─── 교육 카드 ─── */
    .edu-card { background: white; border-top: 1px solid #F5F0EB; }
    .edu-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 18px; border-bottom: 1px solid #F9F6F2; }
    .edu-row:last-child { border-bottom: none; }
    .edu-name { font-size: 12px; color: #4B5563; font-weight: 500; }
    .edu-date { font-size: 12px; font-weight: 700; color: #1A1A1A; }
    .status-badge { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .footer-note { text-align: center; font-size: 11px; color: #9CA3AF; margin-top: 20px; line-height: 1.6; }
    /* ─── LinkMak 크레딧 바 ─── */
    .qr-credit-bar { position: fixed; bottom: 0; left: 0; right: 0; height: 22px; background: rgba(248,246,242,0.96); border-top: 1px solid #EDE8E3; display: flex; align-items: center; justify-content: flex-end; padding: 0 14px; z-index: 50; gap: 5px; backdrop-filter: blur(4px); }
    .qr-credit-bar .acb-text { font-size: 10px; color: #adb5bd; white-space: nowrap; }
    .qr-credit-bar .acb-sep { width: 1px; height: 9px; background: #dee2e6; flex-shrink: 0; }
    .qr-credit-bar .acb-brand { font-size: 10px; font-weight: 700; color: #D70072; letter-spacing: -0.2px; white-space: nowrap; }
    /* ─── Accordion 공통 ─── */
    .acc-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 18px; cursor: pointer; user-select: none; transition: background 0.15s; }
    .acc-header:active { background: #F9F6F2; }
    .acc-arrow { font-size: 11px; color: #9CA3AF; transition: transform 0.25s; flex-shrink: 0; }
    .acc-body { display: none; overflow: hidden; }
    .acc-body.open { display: block; }
    .acc-arrow.open { transform: rotate(180deg); }
    /* 현장배정작업 accordion */
    .task-acc-header { background: #FEF0F8; border-bottom: 1px solid #FAD4EA; }
    .task-acc-body { background: white; }
    .task-acc-item { padding: 12px 18px; border-bottom: 1px solid #F5F0EB; }
    .task-acc-item:last-child { border-bottom: none; }
    /* 안전점수 섹션 */
    .score-section { background: white; border-top: 1px solid #F5F0EB; }
    .score-badges { display: flex; gap: 8px; padding: 14px 18px 10px; }
    .score-badge { flex: 1; border-radius: 14px; padding: 12px 6px; text-align: center; }
    .score-badge .num { font-size: 22px; font-weight: 900; line-height: 1; }
    .score-badge .lbl { font-size: 10px; font-weight: 700; color: #6B7280; margin-top: 4px; }
    .score-hint { font-size: 10px; color: #9CA3AF; text-align: right; padding: 0 18px 10px; }
    /* 우수/불량 accordion */
    .result-acc { border-top: 1px solid #F5F0EB; }
    .result-acc-header { padding: 12px 18px; cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; transition: background 0.15s; }
    .result-acc-header:active { background: #F9F6F2; }
    .result-acc-body { display: none; }
    .result-acc-body.open { display: block; }
    .rec-card { margin: 0 14px 10px; padding: 10px 12px; border-radius: 10px; font-size: 12px; }
    /* ─── 동의 화면 스타일 ─── */
    #qrConsentScreen { display: none; }
    #qrProfileScreen { display: none; }
    .consent-card { background: white; border-radius: 22px; box-shadow: 0 8px 32px rgba(0,0,0,0.10); overflow: hidden; }
    .consent-header { background: linear-gradient(135deg, #E6007E 0%, #6B5B9A 100%); padding: 28px 24px 20px; text-align: center; color: white; }
    .consent-body { padding: 20px; }
    .consent-section { border: 1.5px solid #E5E7EB; border-radius: 12px; margin-bottom: 14px; overflow: hidden; }
    .consent-section-head { padding: 12px 16px; background: #F9FAFB; font-size: 13px; font-weight: 700; color: #1E293B; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
    .consent-section-body { padding: 14px 16px; font-size: 12px; color: #374151; line-height: 1.7; background: #FAFAFA; border-top: 1px solid #E5E7EB; display: none; }
    .consent-check-row { padding: 12px 16px; background: white; display: flex; align-items: center; gap: 10px; }
    .consent-check-row label { font-size: 13px; font-weight: 600; color: #1E293B; cursor: pointer; flex: 1; }
    .consent-all-row { background: #F5F3FF; border: 2px solid #7C3AED; border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 14px; }
    .consent-all-row label { font-size: 13px; font-weight: 800; color: #4C1D95; cursor: pointer; flex: 1; }
    .consent-btn { width: 100%; padding: 14px; border-radius: 12px; border: none; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
    .consent-btn:disabled { background: #D1D5DB; color: #9CA3AF; cursor: not-allowed; }
    .consent-btn:not(:disabled) { background: linear-gradient(135deg, #E6007E, #6B5B9A); color: white; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
<div class="profile-wrap">

  <!-- 로딩 초기 화면 -->
  <div id="qrLoadingScreen" style="text-align:center;padding:80px 20px">
    <div style="width:44px;height:44px;border:4px solid #F0EDE8;border-top-color:#E6007E;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px"></div>
    <p style="color:#9CA3AF;font-size:14px">확인 중...</p>
  </div>

  <!-- 개인정보 동의 화면 (비회원) -->
  <div id="qrConsentScreen">
    <div class="consent-card">
      <div class="consent-header">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
          <i class="fas fa-shield-alt" style="font-size:24px"></i>
        </div>
        <div style="font-size:19px;font-weight:900;margin-bottom:4px">개인정보 유의사항 안내</div>
        <div style="font-size:12px;opacity:0.85">Safety NOTE · LGU+ 협력사 현장 안전관리 시스템</div>
      </div>
      <div class="consent-body">
        <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:12px 14px;margin-bottom:16px">
          <p style="font-size:12px;color:#9A3412;line-height:1.6">
            <i class="fas fa-info-circle mr-1"></i>
            이 QR 코드에는 <strong>근로자의 개인정보</strong>(성명, 소속, 연락처, 교육 이력 등)가 포함되어 있습니다.<br>
            조회한 개인정보는 <strong>업무 목적 이외에 사용할 수 없으며</strong>, 무단 유출 시 개인정보보호법에 따른 법적 책임이 발생합니다.
          </p>
        </div>

        <!-- 동의 1: 개인정보 열람 목적 -->
        <div class="consent-section">
          <div class="consent-section-head" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
            <span><i class="fas fa-user-shield mr-2" style="color:#685182"></i>[필수] 개인정보 열람 목적 확인 및 동의</span>
            <span style="font-size:11px;color:#6B7280">▼</span>
          </div>
          <div class="consent-section-body">
            <p class="mb-2"><strong>■ 법적 근거:</strong> 개인정보보호법 제15조, 제19조(개인정보의 목적 외 이용·제공 제한)</p>
            <p style="margin-bottom:6px"><strong>■ 개인정보 열람 유의사항</strong></p>
            <p style="margin-bottom:4px">1. 본 QR 코드를 통해 조회되는 개인정보(성명, 소속, 연락처, 교육이력 등)는 <strong>현장 안전관리 목적에 한해</strong> 열람이 허용됩니다.</p>
            <p style="margin-bottom:4px">2. 조회한 개인정보를 <strong>제3자에게 제공·공유·유출하는 행위는 금지</strong>됩니다.</p>
            <p style="margin-bottom:4px">3. 조회한 정보를 캡처·촬영·저장하여 업무 외 용도로 사용하는 행위는 금지됩니다.</p>
            <p style="margin-bottom:4px">4. 위반 시 <strong>개인정보보호법 제71조</strong>(5년 이하 징역 또는 5천만원 이하 벌금)가 적용될 수 있습니다.</p>
            <p style="margin-top:8px;padding:8px;background:#FEF2F2;border-radius:6px;color:#991B1B;font-weight:600;font-size:11px">
              ※ 본 동의는 해당 기기에서 24시간 동안 유효하며, 이후 재동의가 필요합니다.
            </p>
          </div>
          <div class="consent-check-row">
            <input type="checkbox" id="qrPrivacyCheck" onchange="_updateQrConsentBtn()"
              style="width:18px;height:18px;accent-color:#D70072;flex-shrink:0;cursor:pointer">
            <label for="qrPrivacyCheck">
              개인정보 열람 목적 및 유의사항을 확인하였으며, <strong style="color:#D70072">동의</strong>합니다.
            </label>
          </div>
        </div>

        <!-- 동의 2: 보안 서약 -->
        <div class="consent-section">
          <div class="consent-section-head" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
            <span><i class="fas fa-lock mr-2" style="color:#685182"></i>[필수] 정보 보안 준수 서약</span>
            <span style="font-size:11px;color:#6B7280">▼</span>
          </div>
          <div class="consent-section-body">
            <p class="mb-2"><strong>■ 법적 근거:</strong> 부정경쟁방지 및 영업비밀보호에 관한 법률, 개인정보보호법 제29조</p>
            <p style="margin-bottom:4px">1. 본 시스템을 통해 열람하는 근로자의 개인정보는 <strong>현장 안전 확인 목적으로만</strong> 사용합니다.</p>
            <p style="margin-bottom:4px">2. 열람한 정보를 <strong>업무 이외의 목적으로 이용하거나 외부에 유출하지 않겠습니다.</strong></p>
            <p style="margin-bottom:4px">3. 해당 정보를 타인과 공유하거나 SNS 등에 게시하지 않겠습니다.</p>
            <p style="margin-top:8px;padding:8px;background:#FEF2F2;border-radius:6px;color:#991B1B;font-weight:600;font-size:11px">
              ※ 개인정보 무단 유출 시: 개인정보보호법 제71조(형사) 및 제39조(민사 손해배상) 적용
            </p>
          </div>
          <div class="consent-check-row">
            <input type="checkbox" id="qrSecurityCheck" onchange="_updateQrConsentBtn()"
              style="width:18px;height:18px;accent-color:#D70072;flex-shrink:0;cursor:pointer">
            <label for="qrSecurityCheck">
              정보 보안 준수 서약에 <strong style="color:#D70072">동의</strong>합니다.
            </label>
          </div>
        </div>

        <!-- 전체 동의 -->
        <div class="consent-all-row" onclick="document.getElementById('qrAllCheck').click()">
          <input type="checkbox" id="qrAllCheck" onchange="_toggleQrAllCheck(this)"
            style="width:20px;height:20px;accent-color:#7C3AED;flex-shrink:0;cursor:pointer">
          <label for="qrAllCheck" onclick="event.preventDefault()">
            <i class="fas fa-check-double mr-1"></i> 위 필수 동의 사항 전체에 동의합니다.
          </label>
        </div>

        <button id="qrConsentBtn" class="consent-btn" disabled onclick="_proceedAfterConsent()">
          <i class="fas fa-eye mr-2"></i> 동의 후 프로필 보기
        </button>

        <p style="font-size:11px;color:#9CA3AF;text-align:center;margin-top:12px;line-height:1.6">
          <i class="fas fa-shield-alt" style="color:#E6007E"></i>&nbsp;
          동의 내역은 개인정보보호법 준수를 위해 기록됩니다.<br>
          동의 유효 시간: 24시간 (이후 재동의 필요)
        </p>
      </div>
    </div>
  </div>

  <!-- 프로필 화면 -->
  <div id="qrProfileScreen">
    <div id="profileCard">
      <div style="text-align:center;padding:80px 20px">
        <div style="width:44px;height:44px;border:4px solid #F0EDE8;border-top-color:#E6007E;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px"></div>
        <p style="color:#9CA3AF;font-size:14px">프로필 불러오는 중...</p>
      </div>
    </div>
  </div>

  <p class="footer-note"><i class="fas fa-shield-alt" style="color:#E6007E"></i>&nbsp;Safety NOTE<br>LGU+ 협력사 현장 안전관리 시스템</p>
</div>

<!-- LinkMak 크레딧 바 (하단 고정) -->
<div class="qr-credit-bar">
  <span class="acb-text">Powered by</span>
  <span class="acb-sep"></span>
  <span class="acb-brand">LinkMak Co., Ltd.</span>
</div>

<script>
(function() {
  const userId = '${userId}';
  // localStorage 동의 캐시 키 (24시간 유효)
  const CONSENT_KEY = 'qr_consent_v1';
  const CONSENT_TTL = 24 * 60 * 60 * 1000; // 24시간

  function isConsentValid() {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (!stored) return false;
      const data = JSON.parse(stored);
      return data.agreed && (Date.now() - data.ts) < CONSENT_TTL;
    } catch(e) { return false; }
  }

  function isSystemUser() {
    // Safety NOTE 앱 로그인 사용자 확인 (token 존재 여부)
    try {
      const token = localStorage.getItem('safety_token') || localStorage.getItem('token') || sessionStorage.getItem('safety_token');
      return !!token;
    } catch(e) { return false; }
  }

  function saveConsent() {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ agreed: true, ts: Date.now() }));
    } catch(e) {}
  }

  // 초기화: 동의 여부 확인
  function init() {
    document.getElementById('qrLoadingScreen').style.display = 'none';
    if (isSystemUser() || isConsentValid()) {
      // 시스템 가입자이거나 이미 동의한 경우 → 바로 프로필 표시
      document.getElementById('qrProfileScreen').style.display = 'block';
      loadProfile();
    } else {
      // 비회원 → 동의 화면 표시
      document.getElementById('qrConsentScreen').style.display = 'block';
    }
  }

  // 동의 버튼 활성화 상태 업데이트
  window._updateQrConsentBtn = function() {
    const privacy  = document.getElementById('qrPrivacyCheck')?.checked;
    const security = document.getElementById('qrSecurityCheck')?.checked;
    const btn      = document.getElementById('qrConsentBtn');
    const allCheck = document.getElementById('qrAllCheck');
    if (allCheck) allCheck.checked = !!(privacy && security);
    if (btn) btn.disabled = !(privacy && security);
  };

  // 전체 동의 토글
  window._toggleQrAllCheck = function(checkbox) {
    const checked = checkbox.checked;
    const p = document.getElementById('qrPrivacyCheck');
    const s = document.getElementById('qrSecurityCheck');
    if (p) p.checked = checked;
    if (s) s.checked = checked;
    const btn = document.getElementById('qrConsentBtn');
    if (btn) btn.disabled = !checked;
  };

  // 동의 후 프로필 이동
  window._proceedAfterConsent = function() {
    saveConsent();
    document.getElementById('qrConsentScreen').style.display = 'none';
    document.getElementById('qrProfileScreen').style.display = 'block';
    loadProfile();
  };

  function fmtDate(d) {
    if (!d) return '';
    return d.replace(/-/g, '.');
  }

  function infoRow(iconBg, iconColor, iconClass, label, value) {
    if (!value) return '';
    return \`<div class="info-row">
      <div class="info-icon" style="background:\${iconBg}"><i class="fas \${iconClass}" style="color:\${iconColor}"></i></div>
      <div><div class="info-label">\${label}</div><div class="info-value">\${value}</div></div>
    </div>\`;
  }
  function infoRowAlways(iconBg, iconColor, iconClass, label, value) {
    return \`<div class="info-row">
      <div class="info-icon" style="background:\${iconBg}"><i class="fas \${iconClass}" style="color:\${iconColor}"></i></div>
      <div><div class="info-label">\${label}</div><div class="info-value" style="\${value ? '' : 'color:#C9CBD0;font-weight:500'}">\${value || '미입력'}</div></div>
    </div>\`;
  }

  // 이수 이력이 있을 때만 행 반환 (없으면 빈 문자열)
  function eduRow(label, dateVal) {
    if (!dateVal) return '';
    return \`<div class="edu-row">
      <span class="edu-name">\${label}</span>
      <span class="edu-date">\${fmtDate(dateVal)}</span>
    </div>\`;
  }

  async function loadProfile() {
    const card = document.getElementById('profileCard');
    try {
      const res = await fetch('/api/users/qr-profile/' + userId);
      if (!res.ok) throw new Error('사용자를 찾을 수 없습니다.');
      const u = await res.json();

      const statusMap = {
        unassigned:     { label: '미배정',            bg: '#F0EFEB', color: '#6B7280' },
        assigned:       { label: '배정완료',           bg: '#FDE8F3', color: '#E6007E' },
        in_progress:    { label: '진행중',             bg: '#FFF3CD', color: '#B45309' },
        tbm_done:       { label: 'TBM완료',            bg: '#EDE9F7', color: '#6B5B9A' },
        working:        { label: '작업중',             bg: '#E8F5E9', color: '#2E7D32' },
        work_completed: { label: '작업완료(일지대기)', bg: '#FEF3C7', color: '#92400E' },
        completed:      { label: '일지작성완료',       bg: '#DCFCE7', color: '#166534' },
      };

      // ─── 안전점수 계산 ───────────────────────────────────────────────
      const poorCnt  = u.insp_summary?.poor  || 0;
      const excelCnt = u.insp_summary?.excel || 0;
      const safetyScore = excelCnt * 5 + poorCnt * (-10);
      const scoreColor = safetyScore > 0 ? '#685182' : '#D70072';
      const scoreBg    = safetyScore > 0 ? '#F5F0F8'  : '#FDE8F3';
      const scoreStr   = (safetyScore > 0 ? '+' : '') + safetyScore;

      // ─── 배정 작업 목록 (복수 지원) ──────────────────────────────────
      const assignedTasks = u.assigned_tasks || (u.current_task ? [u.current_task] : []);

      // ─── 점검이력 분류 ────────────────────────────────────────────────
      const inspHistory = u.insp_history || [];
      const poorRecs  = inspHistory.filter(r => r.result_type === '불량');
      const excelRecs = inspHistory.filter(r => r.result_type === '우수');

      // ─── 헤더 생성 ────────────────────────────────────────────────────
      card.innerHTML = \`
        <div class="lgu-header">
          <div class="lgu-avatar">\${u.name.charAt(0)}</div>
          <div class="lgu-name">\${u.name}</div>
          \${(u.company || u.position) ? \`<div class="lgu-sub">\${[u.company, u.position].filter(Boolean).join(' · ')}</div>\` : ''}
          <div class="lgu-badges">
            <span class="lgu-badge">\${u.role_label}</span>
            \${u.blood_type ? \`<span class="lgu-badge blood-badge"><i class="fas fa-tint"></i> \${u.blood_type}</span>\` : ''}
          </div>
          <!-- 헤더 안전점수 -->
          \${(poorCnt + excelCnt) > 0 ? \`
          <div class="header-score-wrap">
            <div class="header-score-badge">
              <i class="fas fa-shield-alt" style="font-size:15px;opacity:0.9"></i>
              <div>
                <div class="header-score-num">\${scoreStr}점</div>
                <div class="header-score-label">안전점수</div>
              </div>
              \${poorCnt > 0 ? \`<span style="font-size:10px;opacity:0.8">불량\${poorCnt}</span>\` : ''}
              \${excelCnt > 0 ? \`<span style="font-size:10px;opacity:0.8">우수\${excelCnt}</span>\` : ''}
            </div>
          </div>\` : ''}
        </div>

        <!-- ① 인적사항 -->
        <div class="info-card">
          <div class="section-title" style="color:#E6007E"><i class="fas fa-id-card"></i> 인적사항</div>
          \${infoRow('#FDE8F3','#E6007E','fa-building','소속 부서', u.department)}
          \${infoRowAlways('#EDE9F7','#6B5B9A','fa-phone','연락처', u.phone)}
          \${infoRowAlways('#FFF8E1','#B45309','fa-exclamation-triangle','긴급연락처', u.emergency_contact)}
          \${infoRowAlways('#FFF0F0','#E53E3E','fa-tint','혈액형', u.blood_type)}
          \${infoRowAlways('#F0FFF4','#2E7D32','fa-heartbeat','건강정보', u.health_info)}
          <div class="info-row">
            <div class="info-icon" style="background:#FFF3CD"><i class="fas fa-clipboard-check" style="color:#B45309"></i></div>
            <div><div class="info-label">완료 작업</div><div class="info-value">\${u.completed_tasks}건</div></div>
          </div>
        </div>

        <!-- ② 현장배정작업 (accordion) -->
        <div class="info-card" style="border-top:1px solid #F5F0EB">
          \${assignedTasks.length > 0 ? \`
          <!-- 배정 작업 있음 → accordion -->
          <div class="acc-header task-acc-header" id="taskAccHeader" onclick="toggleAcc('taskAccHeader','taskAccBody')">
            <div style="display:flex;align-items:center;gap:7px">
              <i class="fas fa-hard-hat" style="color:#E6007E;font-size:13px"></i>
              <span style="font-size:11px;font-weight:800;color:#E6007E">현장배정작업</span>
              <span style="font-size:10px;background:#E6007E;color:white;border-radius:20px;padding:1px 7px;font-weight:700">\${assignedTasks.length}건</span>
            </div>
            <i class="fas fa-chevron-down acc-arrow" id="taskAccArrow"></i>
          </div>
          <div class="acc-body task-acc-body" id="taskAccBody">
            \${assignedTasks.map(t => {
              const st = statusMap[t.status] || { label: t.status, bg: '#F0EFEB', color: '#6B7280' };
              return \`<div class="task-acc-item">
                <div style="font-size:13px;font-weight:700;color:#1A1A1A;margin-bottom:6px">\${t.title}\${t.task_number ? \` <span style="font-size:10px;color:#9CA3AF;font-weight:500">[WKS-\${t.task_number}]</span>\` : ''}</div>
                <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
                  <span class="status-badge" style="background:\${st.bg};color:\${st.color}">\${st.label}</span>
                  \${t.work_order_address ? \`<span style="font-size:11px;color:#6B7280"><i class="fas fa-map-marker-alt"></i> \${t.work_order_address}</span>\` : ''}
                </div>
              </div>\`;
            }).join('')}
          </div>\` : \`
          <!-- 배정 작업 없음 -->
          <div style="padding:13px 18px;font-size:12px;color:#9CA3AF;display:flex;align-items:center;gap:7px">
            <i class="fas fa-hard-hat" style="font-size:13px;color:#D1D5DB"></i>
            <span style="font-weight:600">현장배정작업</span>
            <span style="margin-left:4px;color:#D1D5DB">현재 배정된 작업 없음</span>
          </div>\`}
        </div>

        <!-- ③ 근로자 안전 점수 섹션 -->
        <div class="score-section">
          <div class="section-title" style="color:#685182"><i class="fas fa-shield-halved"></i> 근로자 안전 점수</div>

          <!-- 요약 배지 4개 -->
          <div class="score-badges">
            <div class="score-badge" style="background:#FDE8F3;border:1px solid #D7007233">
              <div class="num" style="color:#D70072">\${poorCnt}</div>
              <div class="lbl"><i class="fas fa-exclamation-triangle mr-1" style="color:#D70072"></i>불량</div>
            </div>
            <div class="score-badge" style="background:#F5F0F8;border:1px solid #68518233">
              <div class="num" style="color:#685182">\${excelCnt}</div>
              <div class="lbl"><i class="fas fa-star mr-1" style="color:#685182"></i>우수</div>
            </div>
            <div class="score-badge" style="background:#F5F0F8;border:1px solid #D8D0DC">
              <div class="num" style="color:#374151">\${poorCnt + excelCnt}</div>
              <div class="lbl"><i class="fas fa-list mr-1"></i>전체</div>
            </div>
            <div class="score-badge" style="background:\${scoreBg};border:1px solid \${scoreColor}33">
              <div class="num" style="color:\${scoreColor}">\${scoreStr}</div>
              <div class="lbl"><i class="fas fa-shield-alt mr-1" style="color:\${scoreColor}"></i>안전점수</div>
            </div>
          </div>
          <div class="score-hint">우수×+5점 · 불량×-10점</div>

          <!-- 우수 기록 accordion -->
          <div class="result-acc">
            <div class="result-acc-header" onclick="toggleAcc('excelAccHeader','excelAccBody')" id="excelAccHeader"
                 style="background:\${excelRecs.length > 0 ? '#F5F0F8' : '#FAFAFA'}">
              <div style="display:flex;align-items:center;gap:7px">
                <i class="fas fa-star" style="color:#685182;font-size:12px"></i>
                <span style="font-size:12px;font-weight:800;color:#685182">우수 기록</span>
                <span style="font-size:10px;background:\${excelRecs.length > 0 ? '#685182' : '#D1D5DB'};color:white;border-radius:20px;padding:1px 7px;font-weight:700">\${excelRecs.length}건</span>
              </div>
              \${excelRecs.length > 0 ? \`<i class="fas fa-chevron-down acc-arrow" id="excelAccArrow"></i>\` : '<span style="font-size:11px;color:#D1D5DB">기록 없음</span>'}
            </div>
            \${excelRecs.length > 0 ? \`
            <div class="result-acc-body" id="excelAccBody">
              <div style="padding:10px 14px 14px">
                \${excelRecs.map(r => \`
                <div class="rec-card" style="background:#F5F0F8;border:1px solid #68518233;margin-bottom:8px">
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;flex-wrap:wrap">
                    <span style="font-size:11px;font-weight:800;background:#685182;color:white;border-radius:20px;padding:2px 8px"><i class="fas fa-star mr-1"></i>우수</span>
                    <span style="font-size:11px;color:#6B7280"><i class="fas fa-calendar-alt mr-1 opacity-40"></i>\${r.inspection_date_only || '-'}</span>
                    \${r.task_title ? \`<span style="font-size:11px;color:#3B82F6;font-weight:600"><i class="fas fa-hammer mr-1"></i>\${r.task_number ? '[WKS-'+r.task_number+'] ':''}\${r.task_title}</span>\` : ''}
                  </div>
                  <div style="font-size:11px;color:#6B7280;margin-bottom:3px"><i class="fas fa-map-marker-alt mr-1 opacity-40"></i>\${r.location || '-'}</div>
                  \${r.findings ? \`<div style="font-size:11px;color:#374151;margin-top:4px">\${r.findings}</div>\` : ''}
                  <div style="font-size:10px;color:#9CA3AF;margin-top:4px">점검자: \${r.inspector_name || '-'}</div>
                </div>\`).join('')}
              </div>
            </div>\` : ''}
          </div>

          <!-- 불량 기록 accordion -->
          <div class="result-acc" style="border-bottom:none">
            <div class="result-acc-header" onclick="toggleAcc('poorAccHeader','poorAccBody')" id="poorAccHeader"
                 style="background:\${poorRecs.length > 0 ? '#FDE8F3' : '#FAFAFA'}">
              <div style="display:flex;align-items:center;gap:7px">
                <i class="fas fa-exclamation-triangle" style="color:#D70072;font-size:12px"></i>
                <span style="font-size:12px;font-weight:800;color:#D70072">불량 기록</span>
                <span style="font-size:10px;background:\${poorRecs.length > 0 ? '#D70072' : '#D1D5DB'};color:white;border-radius:20px;padding:1px 7px;font-weight:700">\${poorRecs.length}건</span>
              </div>
              \${poorRecs.length > 0 ? \`<i class="fas fa-chevron-down acc-arrow" id="poorAccArrow"></i>\` : '<span style="font-size:11px;color:#D1D5DB">기록 없음</span>'}
            </div>
            \${poorRecs.length > 0 ? \`
            <div class="result-acc-body" id="poorAccBody">
              <div style="padding:10px 14px 14px">
                \${poorRecs.map(r => \`
                <div class="rec-card" style="background:#FDE8F3;border:1px solid #D7007233;margin-bottom:8px">
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;flex-wrap:wrap">
                    <span style="font-size:11px;font-weight:800;background:#D70072;color:white;border-radius:20px;padding:2px 8px"><i class="fas fa-exclamation-triangle mr-1"></i>불량</span>
                    <span style="font-size:11px;color:#6B7280"><i class="fas fa-calendar-alt mr-1 opacity-40"></i>\${r.inspection_date_only || '-'}</span>
                    \${r.task_title ? \`<span style="font-size:11px;color:#3B82F6;font-weight:600"><i class="fas fa-hammer mr-1"></i>\${r.task_number ? '[WKS-'+r.task_number+'] ':''}\${r.task_title}</span>\` : ''}
                  </div>
                  <div style="font-size:11px;color:#6B7280;margin-bottom:3px"><i class="fas fa-map-marker-alt mr-1 opacity-40"></i>\${r.location || '-'}</div>
                  \${r.findings ? \`<div style="font-size:11px;color:#374151;margin-top:4px">\${r.findings}</div>\` : ''}
                  <div style="font-size:10px;color:#9CA3AF;margin-top:4px">점검자: \${r.inspector_name || '-'}</div>
                </div>\`).join('')}
              </div>
            </div>\` : ''}
          </div>
        </div>

        <!-- ④ 안전교육 이수 현황 -->
        \${(() => {
          let eduRows = '';
          eduRows += eduRow('채용시교육', u.edu_hire_date);
          eduRows += eduRow('정기안전교육', u.edu_periodic_date);
          let specialRecords = {};
          try { specialRecords = JSON.parse(u.edu_special_records || '{}'); } catch(_) {}
          const specialEntries = Object.entries(specialRecords).filter(([,v]) => v);
          if (specialEntries.length > 0) {
            specialEntries.forEach(([type, date]) => {
              eduRows += eduRow('특별안전교육 — ' + type, date);
            });
          } else {
            eduRows += eduRow('특별안전교육 — 전기작업', u.edu_special_electric);
            eduRows += eduRow('특별안전교육 — 밀폐공간작업', u.edu_special_confined);
            eduRows += eduRow('특별안전교육 — 하역작업', u.edu_special_loading);
          }
          eduRows += eduRow('작업내용변경 교육', u.edu_job_change_date);
          eduRows += eduRow('관리감독자 교육', u.edu_supervisor_date);
          eduRows += eduRow('대전안전체험교육', u.edu_experience_date);
          if (!eduRows.trim()) return '';
          return \`<div class="edu-card" style="border-radius:0 0 22px 22px;overflow:hidden">
            <div class="section-title" style="color:#B45309"><i class="fas fa-graduation-cap"></i> 안전교육 이수 현황</div>
            \${eduRows}
          </div>\`;
        })()}

        <div style="margin-top:12px;padding:10px 14px;background:rgba(255,255,255,0.7);border-radius:10px;text-align:center">
          <p style="font-size:10px;color:#9CA3AF;line-height:1.6">
            <i class="fas fa-shield-alt" style="color:#E6007E"></i>
            이 프로필 정보는 개인정보보호법에 의해 보호됩니다.<br>
            무단 수집·유출 시 법적 책임이 따릅니다.
          </p>
        </div>
      \`;
      // 마지막 카드 하단 모서리 처리
      const scoreSection = card.querySelector('.score-section');
      if (scoreSection && !card.querySelector('.edu-card')) {
        scoreSection.style.borderRadius = '0 0 22px 22px';
        scoreSection.style.overflow = 'hidden';
      }

    } catch(e) {
      card.innerHTML = \`<div style="background:white;border-radius:22px;padding:40px 24px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
        <i class="fas fa-user-slash" style="font-size:40px;color:#E6007E;margin-bottom:12px;display:block"></i>
        <p style="color:#1A1A1A;font-weight:700;font-size:16px">프로필을 불러올 수 없습니다</p>
        <p style="color:#9CA3AF;font-size:13px;margin-top:4px">\${e.message}</p>
      </div>\`;
    }
  }

  // accordion 토글 함수
  window.toggleAcc = function(headerId, bodyId) {
    const body  = document.getElementById(bodyId);
    const arrow = document.getElementById(headerId + 'Arrow') || document.querySelector('#' + headerId + ' .acc-arrow');
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    if (arrow) arrow.classList.toggle('open', !isOpen);
  };

  // 페이지 로드 시 초기화
  init();
})();
</script>
</body>
</html>`)
})

// ─── SSE 실시간 알림 시스템 (공유 모듈 src/sse.ts 사용) ───────────────────────
// sseClients, sendToUser, broadcastAll, broadcastToRoles, getConnectionCount
// → 최상단 import에서 로드됨

// ─── [FEAT-027] 그룹별 권한 설정 API ────────────────────────────────────────
// GET  /api/group-permissions        ← 전체 권한 조회 (admin 전용)
// POST /api/group-permissions        ← 권한 일괄 저장 (admin 전용)
app.get('/api/group-permissions', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  try {
    const rows = rawDb.prepare(
      `SELECT group_key, perm_key, perm_label, is_enabled FROM group_permissions ORDER BY group_key, perm_key`
    ).all() as any[]
    // group_key별로 그룹화
    const result: Record<string, any> = {}
    for (const row of rows) {
      if (!result[row.group_key]) result[row.group_key] = {}
      result[row.group_key][row.perm_key] = { is_enabled: row.is_enabled, perm_label: row.perm_label }
    }
    return c.json(result)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/group-permissions', async (c) => {
  const user = getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: '관리자 권한 필요' }, 403)
  try {
    // body: { group_key: { perm_key: 0|1, ... }, ... }
    const body = await c.req.json() as Record<string, Record<string, number>>
    const stmt = rawDb.prepare(
      `INSERT INTO group_permissions (group_key, perm_key, is_enabled, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(group_key, perm_key) DO UPDATE SET is_enabled=excluded.is_enabled, updated_at=CURRENT_TIMESTAMP`
    )
    let count = 0
    for (const [groupKey, perms] of Object.entries(body)) {
      for (const [permKey, isEnabled] of Object.entries(perms)) {
        stmt.run(groupKey, permKey, isEnabled ? 1 : 0)
        count++
      }
    }
    console.log(`[FEAT-027] 그룹별 권한 저장 — ${count}개 항목 (by ${user.name})`)
    return c.json({ success: true, updated: count })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── [BUG-082] LGU+ 메뉴 설정 조회 (인증 필요, 역할 무관) ──────────────────────
// GET /api/lgu-menu-settings
// LGU+ 역할은 /admin/settings(관리자 전용)에 접근 불가 → loadLguSettings() 가 빈 객체 반환
// → lgu_menu_tasks/stats 설정값을 읽지 못해 해당 메뉴가 사이드바에서 숨겨지고
//   LGU_PLUS_ALLOWED_MENUS에도 포함되지 않아 화면 진입이 차단되는 버그 수정.
// 해결: lgu_menu_* 키만 읽는 별도 경량 공개 API 제공 (로그인된 모든 역할 허용)
app.get('/api/lgu-menu-settings', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  try {
    const rows = rawDb.prepare(
      `SELECT key, value FROM system_settings WHERE key LIKE 'lgu_menu_%'`
    ).all() as { key: string; value: string }[]
    const settings: Record<string, string> = {}
    for (const row of rows) settings[row.key] = row.value
    return c.json({ settings })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})
// ─────────────────────────────────────────────────────────────────────────────

// SSE 연결 엔드포인트: GET /api/events
// EventSource는 커스텀 헤더 불가 → ?token= 쿼리스트링으로도 인증 허용
// ─── SSE 이벤트 + SSE stats → events.ts ───────────────────────────────────────
registerEventsRoutes(app)
// manifest.json + service-worker.js → events.ts registerEventsRoutes() 에 포함
app.get('*', (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  c.header('Pragma', 'no-cache')
  c.header('Expires', '0')
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Safety NOTE</title>
  <link rel="icon" type="image/png" href="/static/app-icon.png">
  <!-- PWA -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#4E3A63">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="SafetyNOTE">
  <link rel="apple-touch-icon" href="/static/app-icon.png">
  <!-- SheetJS: 로컬 서빙 (app.js보다 먼저 로드) -->
  <script src="/static/xlsx.full.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <link rel="stylesheet" href="/static/style.css?v=${CACHE_VER}">
</head>
<body class="bg-gray-50 min-h-screen">
  <div id="app"></div>
  <script src="/static/app.js?v=${CACHE_VER}"></script>
  <!-- PWA 모바일 앱 기능 (Service Worker / 탭바 / 설치 배너) -->
  <script src="/static/mobile-app.js?v=${CACHE_VER}"></script>
</body>
</html>`)
})

// ─── 역할 변환 헬퍼 ───────────────────────────────────────────────────
function dbRoleToUi(dbRole: string, position: string, subRole: string): string {
  if (subRole) return subRole
  if (dbRole === 'admin') {
    if ((position || '') === '시스템관리자') return 'sysadmin'
    return 'ceo'
  }
  if (dbRole === 'supervisor') return 'safety'
  return 'worker'
}

// ─── JWT 파싱 헬퍼 ────────────────────────────────────────────────────
function getUser(c: any): any {
  // 1순위: Authorization 헤더 (fetch/XHR 호출)
  const auth = c.req.header('Authorization') || ''
  // 2순위: ?token= 쿼리스트링 (img src 태그 — 헤더 불가)
  const queryToken = c.req.query('token') || ''
  const rawToken = auth.startsWith('Bearer ') ? auth.slice(7) : queryToken
  if (!rawToken) return null
  try {
    const buf = Buffer.from(rawToken, 'base64')
    return JSON.parse(buf.toString('utf-8'))
  } catch(_) { return null }
}

// ─── 서버 시작 ────────────────────────────────────────────────────────
console.log(`\n🚀 Safety NOTE - Node.js 서버`)
console.log(`   포트: ${PORT}`)
console.log(`   DB:   ${DB_FILE}`)
console.log(`   업로드 루트:  ${UPLOAD_ROOT}`)
console.log(`   연도/월 폴더: ${USE_SUBDIR ? '활성화 (YYYY/MM 자동 생성)' : '비활성화'}\n`)

// DB 초기화 후 시스템 설정 로드
loadSystemSettings(DB).then(() => {
  console.log(`[설정] 업로드 루트: ${getUploadRoot()}`)
  console.log(`[설정] 폴더 구조: {공사요청번호}_{공사명}/{서브번호}_{작업일}_{작업종류}/01~05단계`)
})

// ─── 자동 DB 백업 & 오래된 알림 정리 ────────────────────────────────────────
// 1) 오래된 알림 자동 정리 (90일 초과 삭제) — 서버 시작 시 1회 + 매일 자정
function pruneOldNotifications() {
  try {
    const res = rawDb.prepare(
      `DELETE FROM notifications WHERE created_at < datetime('now', '-90 days')`
    ).run()
    if (res.changes > 0)
      console.log(`[자동정리] 오래된 알림 ${res.changes}건 삭제 완료`)
  } catch(e: any) {
    console.warn('[자동정리] 알림 정리 실패(무시):', e.message)
  }
}
pruneOldNotifications()
setInterval(pruneOldNotifications, 24 * 60 * 60 * 1000) // 매 24시간

// 2) 자동 DB 백업 — 매일 새벽 2시, 30일 보관
// runCmd: spawn 기반 비동기 셸 헬퍼 (백업용)
function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 30000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '', stderr = ''
    const proc = spawn(cmd, args, { cwd, stdio: 'pipe' })
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      resolve({ code: -1, stdout, stderr: stderr + '\n[TIMEOUT]' })
    }, timeoutMs)
    proc.on('close', (code: number | null) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

function scheduleDailyBackup() {
  const now   = new Date()
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const next  = new Date(now)
  // KST 기준 새벽 2시 = UTC 전날 17:00
  next.setUTCDate(kstNow.getUTCDate() + (kstNow.getUTCHours() >= 2 ? 1 : 0))
  next.setUTCHours(17, 0, 0, 0)                 // UTC 17:00 = KST 02:00
  const delay = next.getTime() - now.getTime()

  setTimeout(async () => {
    await runDailyBackup()
    setInterval(runDailyBackup, 24 * 60 * 60 * 1000) // 이후 매 24시간
  }, delay)

  const h = Math.floor(delay / 3600000)
  const m = Math.floor((delay % 3600000) / 60000)
  console.log(`[백업] 다음 자동 백업 예약: ${h}시간 ${m}분 후 (새벽 2:00)`)
}

async function runDailyBackup() {
  try {
    const backupDir = join(__dirname, 'backups')
    mkdirSync(backupDir, { recursive: true })

    const stamp   = kstDateStr().replace(/-/g, '') // YYYYMMDD (KST 기준)
    const dbSrc   = DB_FILE
    const destPath = join(backupDir, `safety_${stamp}.db`)

    // 오늘 백업이 이미 있으면 건너뜀
    if (existsSync(destPath)) {
      console.log(`[백업] 오늘 백업 이미 존재: safety_${stamp}.db — 건너뜀`)
      pruneOldBackups(backupDir)
      return
    }

    // WAL 체크포인트 후 복사 (데이터 일관성 보장)
    try { rawDb.pragma('wal_checkpoint(TRUNCATE)') } catch(_) {}
    const res = await runCmd('cp', [dbSrc, destPath], __dirname, 15000)
    if (res.code === 0) {
      console.log(`[백업] ✅ 자동 백업 완료: backups/safety_${stamp}.db`)
    } else {
      console.error(`[백업] ❌ 백업 실패:`, res.stderr.trim())
    }

    // 30일 초과 백업 자동 삭제
    pruneOldBackups(backupDir)
  } catch(e: any) {
    console.error('[백업] 자동 백업 오류:', e.message)
  }
}

function pruneOldBackups(backupDir: string) {
  try {
    const files = readdirSync(backupDir)
      .filter(f => /^safety_\d{8}\.db$/.test(f)) // safety_YYYYMMDD.db 패턴만
      .map(f => ({ name: f, mtime: statSync(join(backupDir, f)).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000 // 30일 전
    let pruned = 0
    for (const f of files) {
      if (f.mtime.getTime() < cutoff) {
        try { unlinkSync(join(backupDir, f.name)); pruned++ } catch(_) {}
      }
    }
    if (pruned > 0) console.log(`[백업] 오래된 백업 ${pruned}개 삭제 (30일 초과)`)
  } catch(e: any) {
    console.warn('[백업] 오래된 백업 정리 실패(무시):', e.message)
  }
}

scheduleDailyBackup()
// ─── 자동 백업 끝 ────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// ⚠️  HTTPS / SSL 핵심 구간 — 수정 전 반드시 NAS-HTTPS-SETUP.md 확인
//
//  NAS(운영):   Synology 인증서 자동 탐지 → https.createServer() HTTPS 서빙
//  샌드박스:    인증서 없음 → serve() HTTP 폴백 (자동, 코드 변경 불필요)
//
//  ❌ loadSynologyCert() 삭제 금지
//  ❌ https.createServer() → serve() 교체 금지
//  ❌ 이 if/else 블록 구조 변경 금지
// ═══════════════════════════════════════════════════════════════

// ─── HTTPS 인증서 로드 (Synology DSM 인증서) ─────────────────────────
// DEFAULT 파일 → 현재 활성 인증서 폴더명 동적 탐지
// (DSM 인증서 갱신 시 폴더명이 바뀌어도 자동 대응)
function loadSynologyCert(): { key: string; cert: string; ca?: string } | null {
  try {
    const defaultPath = '/usr/syno/etc/certificate/_archive/DEFAULT'
    if (!existsSync(defaultPath)) return null
    const archiveName = readFileSync(defaultPath, 'utf-8').trim()
    const certDir = `/usr/syno/etc/certificate/_archive/${archiveName}`
    const keyPath  = join(certDir, 'privkey.pem')
    const certPath = join(certDir, 'cert.pem')
    const chainPath = join(certDir, 'fullchain.pem')
    if (!existsSync(keyPath) || !existsSync(certPath)) return null
    const result: { key: string; cert: string; ca?: string } = {
      key:  readFileSync(keyPath, 'utf-8'),
      cert: existsSync(chainPath)
              ? readFileSync(chainPath, 'utf-8')   // fullchain 우선 (중간 CA 포함)
              : readFileSync(certPath, 'utf-8'),
    }
    console.log(`[SSL] Synology 인증서 로드 완료: ${certDir}`)
    return result
  } catch (e) {
    console.warn('[SSL] 인증서 로드 실패:', e)
    return null
  }
}

const tlsCert = loadSynologyCert()

if (tlsCert) {
  // ── ✅ NAS 운영 환경: HTTPS 직접 서빙 ────────────────────────────────
  // Synology DSM 인증서로 https.createServer() 사용
  // https://linkmax.myds.me:3443 → 공유기 포트포워딩 → 이 서버
  const httpsServer = https.createServer(
    { key: tlsCert.key, cert: tlsCert.cert },
    (req, res) => {
      // @hono/node-server의 내부 핸들러를 직접 호출
      app.fetch(
        new Request(
          `https://${req.headers.host || `localhost:${PORT}`}${req.url}`,
          {
            method: req.method,
            headers: req.headers as any,
            body: ['GET','HEAD'].includes(req.method ?? '') ? undefined : req as any,
            duplex: 'half',
          } as any
        ),
        { incoming: req, outgoing: res } as any
      ).then((honoRes: Response) => {
        res.writeHead(honoRes.status, Object.fromEntries(honoRes.headers.entries()))
        if (honoRes.body) {
          const reader = honoRes.body.getReader()
          const pump = () => reader.read().then(({ done, value }) => {
            if (done) { res.end(); return }
            res.write(value)
            pump()
          })
          pump()
        } else {
          res.end()
        }
      }).catch((err: any) => {
        console.error('[HTTPS] 요청 처리 오류:', err)
        res.writeHead(500)
        res.end('Internal Server Error')
      })
    }
  )

  httpsServer.keepAliveTimeout = 65000
  httpsServer.headersTimeout   = 66000

  httpsServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 서버 실행 중 (HTTPS): https://0.0.0.0:${PORT}`)
  })

  httpsServer.on('error', (err: any) => {
    if (err.code === 'EACCES') {
      console.error(`[SSL] 포트 ${PORT} 권한 없음 — root 권한 필요`)
    } else if (err.code === 'EADDRINUSE') {
      console.error(`[SSL] 포트 ${PORT} 이미 사용 중`)
    } else {
      console.error('[SSL] 서버 오류:', err)
    }
    process.exit(1)
  })

  // ── HTTP 내부 포트 (Android FCM 등록 전용) ────────────────────────────
  // [BUG-010-1 Fix] Android HttpURLConnection 은 자체서명 인증서를 신뢰하지 않음.
  // https→http 변환 후 요청하지만, NAS는 HTTPS(3443)만 리슨 → 빈 응답(연결 거부).
  // 해결: HTTP 전용 포트 3444를 추가로 열어 Android 내부 API 호출에 사용.
  // 외부(인터넷)에서는 공유기 포트포워딩에 3444가 없으므로 접근 불가 → 보안 유지.
  const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3444')
  const httpServer = http.createServer((req, res) => {
    app.fetch(
      new Request(
        `http://${req.headers.host || `localhost:${HTTP_PORT}`}${req.url}`,
        {
          method: req.method,
          headers: req.headers as any,
          body: ['GET','HEAD'].includes(req.method ?? '') ? undefined : req as any,
          duplex: 'half',
        } as any
      ),
      { incoming: req, outgoing: res } as any
    ).then((honoRes: Response) => {
      res.writeHead(honoRes.status, Object.fromEntries(honoRes.headers.entries()))
      if (honoRes.body) {
        const reader = honoRes.body.getReader()
        const pump = () => reader.read().then(({ done, value }) => {
          if (done) { res.end(); return }
          res.write(value)
          pump()
        })
        pump()
      } else {
        res.end()
      }
    }).catch((err: any) => {
      res.writeHead(500)
      res.end('Internal Server Error')
    })
  })
  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`✅ HTTP 내부 포트 실행 중: http://0.0.0.0:${HTTP_PORT} (Android FCM 전용)`)
  })
  httpServer.on('error', (err: any) => {
    console.warn(`[HTTP] 내부 포트 ${HTTP_PORT} 오류 (무시 가능):`, err.message)
  })

} else {
  // ── ✅ 샌드박스 / 개발 환경: HTTP 자동 폴백 ──────────────────────────
  // Synology 인증서 없음 → HTTP로 서빙 (개발/테스트 환경 정상 동작)
  // ⚠️  이 블록을 NAS에서 실행하면 HTTPS가 안 됨 — 인증서 경로 확인 필요
  console.warn('[SSL] 인증서 없음 → HTTP 서버로 시작 (개발 환경)')

  const serverInstance = serve({
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0'
  }, (info) => {
    console.log(`✅ 서버 실행 중 (HTTP): http://0.0.0.0:${info.port}`)
  })

  // 프록시/게이트웨이 502 방지: Keep-Alive 타임아웃을 65초로 설정
  try {
    const srv = serverInstance as any
    if (srv && srv.keepAliveTimeout !== undefined) {
      Object.defineProperty(srv, 'keepAliveTimeout', { value: 65000, writable: true })
      Object.defineProperty(srv, 'headersTimeout',   { value: 66000, writable: true })
      console.log('[서버] keepAliveTimeout=65s 설정 완료')
    }
  } catch(_) { /* 설정 실패 시 무시 */ }
}
// ═══════════════════════════════════════════════════════════════
// ⚠️  HTTPS 구간 끝 — NAS-HTTPS-SETUP.md 참고
// ═══════════════════════════════════════════════════════════════
