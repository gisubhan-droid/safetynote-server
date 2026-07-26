/**
 * kst-utils.ts — KST(UTC+9) 날짜/시간 유틸리티 모음
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 근본 원칙
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * - NAS 서버는 UTC(TZ=UTC) 또는 Asia/Seoul 어느 환경에서도 동일하게 동작
 * - DB(SQLite)에 저장된 모든 datetime은 UTC 기준 ISO 문자열
 *   (예: "2026-07-25T16:51:00" 또는 "2026-07-25 16:51:00")
 * - 화면/PDF/공유 페이지에 표시할 때는 반드시 이 파일의 함수를 사용
 * - toLocaleString() / toLocaleDateString() 을 직접 호출하지 말 것
 *   → 서버 TZ 설정에 따라 결과가 달라지기 때문
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 사용 방법
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * import { kstNow, kstDateStr, kstDateTimeStr, toKST, toKSTDate, toKSTDateTime, toKSTDateOnly } from '../kst-utils'
 *
 * // 현재 KST 시각
 * kstNow()              → Date 객체 (KST 기준 UTC 오프셋 적용)
 * kstDateStr()          → "2026-07-26"          (오늘 KST 날짜)
 * kstDateTimeStr()      → "2026-07-26 01:51:00"  (현재 KST 날짜+시간)
 *
 * // UTC 문자열 → KST 변환 (DB 값 표시용)
 * toKST("2026-07-25T16:51:00")      → Date 객체 (KST 기준)
 * toKSTDateTime("2026-07-25T16:51") → "2026-07-26 01:51"  (날짜+시간)
 * toKSTDate("2026-07-25T16:51")     → "2026-07-26"        (날짜만)
 * toKSTDateOnly("2026-07-25")       → "2026-07-25"        (날짜 문자열 그대로 — 날짜만 저장된 경우)
 */

// ─── 내부 헬퍼 ──────────────────────────────────────────────────────────────
const KST_OFFSET_MS = 9 * 60 * 60 * 1000  // UTC+9 = 32,400,000ms

/** UTC Date 또는 UTC 문자열을 KST 기준 Date 객체로 반환 */
function _toKSTDate(v: Date | string | number): Date {
  const ms = typeof v === 'number' ? v : new Date(v).getTime()
  return new Date(ms + KST_OFFSET_MS)
}

/** KST Date → "YYYY-MM-DD HH:MM:SS" (항상 UTC 해석) */
function _fmt(d: Date, includeTime = true, includeSec = false): string {
  const yy = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  if (!includeTime) return `${yy}-${mo}-${dd}`
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mn = String(d.getUTCMinutes()).padStart(2, '0')
  if (includeSec) {
    const ss = String(d.getUTCSeconds()).padStart(2, '0')
    return `${yy}-${mo}-${dd} ${hh}:${mn}:${ss}`
  }
  return `${yy}-${mo}-${dd} ${hh}:${mn}`
}

// ─── 현재 시각 ──────────────────────────────────────────────────────────────

/** 현재 KST 기준 Date 객체 */
export function kstNow(): Date {
  return _toKSTDate(Date.now())
}

/** 현재 KST 날짜 문자열 "YYYY-MM-DD" */
export function kstDateStr(): string {
  return _fmt(kstNow(), false)
}

/** 현재 KST 날짜+시간 문자열 "YYYY-MM-DD HH:MM:SS" */
export function kstDateTimeStr(includeSec = true): string {
  return _fmt(kstNow(), true, includeSec)
}

/** 현재 KST 연도 (number) */
export function kstYear(): number {
  return kstNow().getUTCFullYear()
}

/** 현재 KST 월 1~12 (number) */
export function kstMonth(): number {
  return kstNow().getUTCMonth() + 1
}

/** 현재 KST 시간 "HH:MM" */
export function kstTimeStr(): string {
  const d = kstNow()
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// ─── DB 저장용 (UTC ISO 문자열 생성) ────────────────────────────────────────

/**
 * DB INSERT/UPDATE용 현재 KST 시각 → UTC ISO 문자열
 * SQLite CURRENT_TIMESTAMP 대체용
 * 예: "2026-07-26 01:51:00" → DB에 그대로 저장 (KST 기준 표시용 문자열)
 *
 * ⚠️ 주의: DB에 KST 문자열로 저장할 경우 toKSTDateTime() 변환 불필요
 *    → 이미 KST이므로 slice(0,16)으로 바로 사용 가능
 */
export function nowForDB(): string {
  return kstDateTimeStr(true)
}

// ─── UTC → KST 변환 (DB 값 → 화면 표시) ───────────────────────────────────

/**
 * UTC 문자열 → KST Date 객체
 * @param raw UTC 기준 날짜 문자열 (ISO 또는 "YYYY-MM-DD HH:MM:SS")
 */
export function toKST(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  if (isNaN(d.getTime())) return null
  return _toKSTDate(d)
}

/**
 * UTC 문자열 → KST "YYYY-MM-DD HH:MM" 표시용 문자열
 * @example toKSTDateTime("2026-07-25T16:51:00") → "2026-07-26 01:51"
 */
export function toKSTDateTime(raw: string | null | undefined): string {
  if (!raw) return '-'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw.slice(0, 16).replace('T', ' ')
  return _fmt(_toKSTDate(d), true, false)
}

/**
 * UTC 문자열 → KST "YYYY-MM-DD HH:MM:SS" 표시용 문자열 (초 포함)
 * @example toKSTDateTimeSec("2026-07-25T16:51:30") → "2026-07-26 01:51:30"
 */
export function toKSTDateTimeSec(raw: string | null | undefined): string {
  if (!raw) return '-'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw.slice(0, 19).replace('T', ' ')
  return _fmt(_toKSTDate(d), true, true)
}

/**
 * UTC 문자열 → KST "YYYY-MM-DD" 날짜만 표시
 * @example toKSTDate("2026-07-25T16:51:00") → "2026-07-26"
 */
export function toKSTDate(raw: string | null | undefined): string {
  if (!raw) return '-'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw.slice(0, 10)
  return _fmt(_toKSTDate(d), false)
}

/**
 * 날짜만 저장된 문자열 그대로 반환 (변환 불필요)
 * "YYYY-MM-DD" 형식의 날짜 전용 컬럼용 (예: work_date, planned_date)
 * → 이미 KST 날짜로 저장된 경우 변환 없이 그대로 사용
 */
export function toKSTDateOnly(raw: string | null | undefined): string {
  if (!raw) return '-'
  return raw.slice(0, 10)
}

/**
 * UTC 문자열 → KST 기준 한국어 날짜 표시
 * @example toKSTDateKo("2026-07-26") → "2026년 07월 26일"
 */
export function toKSTDateKo(raw: string | null | undefined): string {
  const d = toKSTDate(raw)
  if (d === '-') return '-'
  const [yy, mo, dd] = d.split('-')
  return `${yy}년 ${mo}월 ${dd}일`
}

// ─── app.js 프론트엔드 호환용 (서버 렌더 HTML에 주입) ───────────────────────

/**
 * 공유 페이지 / 서버 렌더 HTML에서 UTC→KST 변환 인라인 함수 문자열 반환
 * HTML <script> 태그 안에 삽입하여 클라이언트 측에서도 동일한 변환 사용
 */
export const KST_JS_HELPER = `
function _toKSTDateTime(raw) {
  if (!raw) return '-';
  var d = new Date(raw);
  if (isNaN(d.getTime())) return raw.slice(0,16).replace('T',' ');
  var kst = new Date(d.getTime() + 9*60*60*1000);
  var yy=kst.getUTCFullYear(), mo=String(kst.getUTCMonth()+1).padStart(2,'0'),
      dd=String(kst.getUTCDate()).padStart(2,'0'),
      hh=String(kst.getUTCHours()).padStart(2,'0'),
      mn=String(kst.getUTCMinutes()).padStart(2,'0');
  return yy+'-'+mo+'-'+dd+' '+hh+':'+mn;
}
`.trim()
