/**
 * nas-db.ts — NAS 전용 DB 공유 모듈 (Phase 3 방안 C)
 *
 * rawDb singleton 패턴:
 *   - node-server.ts 에서 setRawDb(db) 로 초기화
 *   - 각 nas-routes-*.ts 에서 getRawDb() 로 사용
 *
 * 포함 항목:
 *   - rawDb singleton (setRawDb / getRawDb)
 *   - makeD1() — better-sqlite3 → D1 호환 어댑터
 *   - sysSettings 캐시 + getSetting() + setSysSettings()
 *   - getUser() — JWT(base64) 파싱 헬퍼
 *   - getApkFilePath() — APK 파일 경로 헬퍼
 *   - getUploadRoot() — 동적 업로드 루트 반환
 */

import type Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'

// ─── rawDb singleton ──────────────────────────────────────────────────────────
let _rawDb: Database.Database | null = null

export function setRawDb(db: Database.Database): void {
  _rawDb = db
}

export function getRawDb(): Database.Database {
  if (!_rawDb) throw new Error('[nas-db] rawDb 미초기화 — setRawDb() 를 먼저 호출하세요')
  return _rawDb
}

// ─── makeD1 — better-sqlite3 → Cloudflare D1 호환 어댑터 ─────────────────────
export function makeD1(db: Database.Database) {
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
          return { success: true, meta: { last_row_id: info.lastInsertRowid, changes: info.changes, duration: 0 } }
        } catch(e: any) { throw new Error(`D1_ERROR: ${e.message}`) }
      }
    }
  }
  return {
    prepare(query: string) { return makeStmt(query) },
    async exec(query: string) { db.exec(query); return { success: true } },
    // batch(): D1 호환 — 트랜잭션으로 일괄 실행
    async batch(stmts: any[]) {
      const tx = db.transaction((items: any[]) => {
        const results: any[] = []
        for (const s of items) {
          try {
            const info = db.prepare(s._query).run(...(s._params || []))
            results.push({ success: true, meta: { last_row_id: info.lastInsertRowid, changes: info.changes } })
          } catch(e: any) {
            results.push({ success: false, error: e.message })
          }
        }
        return results
      })
      try {
        return tx(stmts)
      } catch(e: any) {
        throw new Error(`D1_BATCH_ERROR: ${e.message}`)
      }
    }
  }
}

// ─── 시스템 설정 캐시 ────────────────────────────────────────────────────────
let _sysSettings: Record<string, string> = {
  upload_root_path:    '',
  attach_max_mb:       '20',
  attach_total_mb:     '200',
  attach_allowed_ext:  'pdf,doc,docx,xls,xlsx,ppt,pptx,hwp,txt,jpg,jpeg,png,gif,webp,heic,mp4,zip',
}

export function getSetting(key: string): string {
  return _sysSettings[key] ?? ''
}

export function setSysSettings(settings: Record<string, string>): void {
  _sysSettings = { ..._sysSettings, ...settings }
}

export function getSysSettings(): Record<string, string> {
  return { ..._sysSettings }
}

// ─── 업로드 루트 ─────────────────────────────────────────────────────────────
/**
 * 현재 유효한 업로드 루트 반환
 * DB 설정(upload_root_path)이 있으면 그것을 우선 사용
 */
export function getUploadRoot(envUploadRoot: string): string {
  const override = (global as any).__UPLOAD_ROOT_OVERRIDE
  return override || envUploadRoot
}

/**
 * 무인수 버전: node-server.ts의 UPLOAD_ROOT 상수 없이도 호출 가능
 * admin/dist 라우트 등 nas-routes 내부에서 사용
 */
export function getUploadRootNow(): string {
  const override = (global as any).__UPLOAD_ROOT_OVERRIDE
  if (override) return override
  const envPath = process.env.UPLOAD_PATH
  if (envPath) return envPath.replace(/\/+$/, '')
  // 기본값: 현재 실행 디렉터리 기준 public/uploads
  return join(process.cwd(), 'public', 'uploads')
}

/**
 * DB 설정에서 업로드 루트 재정의 (loadSystemSettings 내에서 호출)
 */
export function applyUploadRootOverride(envUploadRoot: string): void {
  const dbPath = getSetting('upload_root_path')
  if (dbPath) {
    const resolved = dbPath.replace(/\/+$/, '')
    if (resolved !== envUploadRoot) {
      ;(global as any).__UPLOAD_ROOT_OVERRIDE = resolved
      mkdirSync(resolved, { recursive: true })
      console.log(`[설정] 업로드 루트 → ${resolved}`)
    }
  }
}

// ─── APK 파일 경로 ────────────────────────────────────────────────────────────
import { join } from 'node:path'

/** APK 파일 저장 경로: {uploadRoot}/apk/safetynote.apk */
export function getApkFilePath(uploadRoot: string): string {
  return join(getUploadRoot(uploadRoot), 'apk', 'safetynote.apk')
}

// ─── JWT 파싱 헬퍼 ────────────────────────────────────────────────────────────
/**
 * Authorization: Bearer <base64(JSON)> 에서 사용자 정보 추출
 * 이 앱은 서명 없는 base64 방식 사용 (lightweight)
 *
 * ✅ DownloadManager 대응: 헤더 없이 쿼리 파라미터로 token 전달 가능
 *    - DownloadManager는 WebView SSL 예외를 공유하지 않아 Authorization 헤더를 추가해도
 *      NAS 자체서명 인증서 문제로 실패할 수 있음
 *    - 해결: ?token=... 쿼리 파라미터를 추가로 허용 (다운로드 전용 엔드포인트)
 */
export function getUser(c: any): any {
  // 1순위: Authorization 헤더
  const auth = c.req.header('Authorization') || ''
  if (auth.startsWith('Bearer ')) {
    try {
      const token = auth.slice(7)
      const buf = Buffer.from(token, 'base64')
      return JSON.parse(buf.toString('utf-8'))
    } catch(_) { return null }
  }
  // 2순위: ?token= 쿼리 파라미터 (DownloadManager / 직접 링크 다운로드용)
  try {
    const qToken = c.req.query('token')
    if (qToken) {
      const buf = Buffer.from(qToken, 'base64')
      return JSON.parse(buf.toString('utf-8'))
    }
  } catch(_) {}
  return null
}

// ─── 역할 변환 헬퍼 ──────────────────────────────────────────────────────────
/**
 * DB 저장 역할(role) + position + sub_role → UI 역할 변환
 * node-server.ts의 dbRoleToUi()와 완전 동일
 */
export function dbRoleToUi(dbRole: string, position: string, subRole: string): string {
  if (subRole) return subRole
  if (dbRole === 'admin') {
    if ((position || '') === '시스템관리자') return 'sysadmin'
    return 'ceo'
  }
  if (dbRole === 'supervisor') return 'safety'
  return 'worker'
}

// ─── DB 인스턴스 (D1 래퍼) — nas-routes-*.ts 에서 사용 ───────────────────────
/**
 * node-server.ts 에서 rawDb 초기화 후 makeD1(rawDb) 결과를 저장
 * nas-routes-*.ts 에서 getDB() 로 접근
 */
let _DB: ReturnType<typeof makeD1> | null = null

export function setDB(db: ReturnType<typeof makeD1>): void {
  _DB = db
}

export function getDB(): ReturnType<typeof makeD1> {
  if (!_DB) throw new Error('[nas-db] DB 미초기화 — setDB() 를 먼저 호출하세요')
  return _DB
}
