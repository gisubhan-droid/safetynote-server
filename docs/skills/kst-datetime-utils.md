# SKILL: kst-datetime-utils

> NAS/서버의 TZ 환경(UTC 또는 Asia/Seoul)에 관계없이 KST(UTC+9) 날짜·시간을
> 정확하게 처리하는 패턴. BUG-156 / 세션 84 UTC 파싱 버그 수정 경험에서 추출.
> `src/kst-utils.ts` 로 구현 완료, 전체 프로젝트에 적용 확인.

---

## 언제 사용하는가

다음 상황에서 반드시 이 스킬을 적용한다:

- SQLite(D1/NAS) DB에 datetime 값을 저장하고 한국 시간으로 표시해야 할 때
- 서버가 UTC 또는 Asia/Seoul 어느 TZ로도 실행될 수 있을 때
- `toLocaleString()` / `toLocaleDateString()` 을 쓰고 싶을 때 (→ 금지, 대체 필요)
- 서버 렌더 HTML(공유 페이지 등)에서도 시간을 KST로 표시해야 할 때
- 날짜 관련 버그(`+9h`가 두 번 적용, UTC가 KST로 잘못 해석)가 발생했을 때

---

## 근본 원칙

```
DB 저장: 항상 UTC 기준 ISO 문자열
  예) "2026-07-25 16:51:00" (SQLite CURRENT_TIMESTAMP 형식)

화면 표시: 반드시 kst-utils 함수를 통해 KST로 변환
  예) toKSTDateTime("2026-07-25 16:51:00") → "2026-07-26 01:51"

절대 금지:
  - new Date(rawFromDB).toLocaleString()  ← 서버 TZ에 따라 결과 달라짐
  - new Date(rawFromDB).toLocaleDateString('ko-KR')  ← 동일
  - rawFromDB.replace('T', ' ').slice(0, 16)  ← UTC를 KST 변환 없이 표시
```

---

## 핵심 버그 패턴 (반드시 숙지)

### SQLite timezone 없는 문자열 함정

```typescript
// SQLite CURRENT_TIMESTAMP 결과: "2026-07-26 05:20:00" (timezone 표시 없음)

// ❌ 잘못된 방법 — 서버 TZ가 Asia/Seoul이면 KST로 해석 → +9h 두 번 적용
const d = new Date("2026-07-26 05:20:00")  // Node가 KST로 해석
const kst = new Date(d.getTime() + 9*60*60*1000)  // 또 +9h → 완전히 틀린 시각

// ✅ 올바른 방법 — timezone 없는 문자열은 항상 UTC로 강제 파싱
function _parseAsUTC(s: string): Date {
  if (s.includes('Z') || s.match(/[+-]\d{2}:?\d{2}$/)) return new Date(s)
  return new Date(s.replace(' ', 'T') + 'Z')  // 'Z' 추가로 UTC 강제
}
```

---

## 서버측 TypeScript 구현 (src/kst-utils.ts)

```typescript
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// timezone 없는 문자열 → UTC 강제 파싱
function _parseAsUTC(s: string): Date {
  if (s.includes('Z') || s.match(/[+-]\d{2}:?\d{2}$/)) return new Date(s)
  return new Date(s.replace(' ', 'T') + 'Z')
}

// UTC → KST Date 객체
function _toKSTDate(v: Date | string | number): Date {
  const ms = typeof v === 'number' ? v : v instanceof Date ? v.getTime() : _parseAsUTC(v as string).getTime()
  return new Date(ms + KST_OFFSET_MS)
}

// KST Date → 문자열 포맷 (항상 getUTC* 사용)
function _fmt(d: Date, includeTime = true, includeSec = false): string {
  const yy = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  if (!includeTime) return `${yy}-${mo}-${dd}`
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mn = String(d.getUTCMinutes()).padStart(2, '0')
  if (includeSec) return `${yy}-${mo}-${dd} ${hh}:${mn}:${String(d.getUTCSeconds()).padStart(2, '0')}`
  return `${yy}-${mo}-${dd} ${hh}:${mn}`
}

// ── 현재 시각 ──
export function kstNow(): Date { return _toKSTDate(Date.now()) }
export function kstDateStr(): string { return _fmt(kstNow(), false) }           // "2026-07-26"
export function kstDateTimeStr(sec = true): string { return _fmt(kstNow(), true, sec) }  // "2026-07-26 01:51:00"
export function kstYear(): number { return kstNow().getUTCFullYear() }
export function kstMonth(): number { return kstNow().getUTCMonth() + 1 }
export function kstTimeStr(): string {
  const d = kstNow()
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
}

// ── DB INSERT용 ──
export function nowForDB(): string { return kstDateTimeStr(true) }

// ── UTC 문자열 → KST 표시 (DB 값 화면 표시) ──
export function toKST(raw?: string | null): Date | null {
  if (!raw) return null
  const d = _parseAsUTC(raw)
  return isNaN(d.getTime()) ? null : _toKSTDate(d)
}
export function toKSTDateTime(raw?: string | null): string {   // "2026-07-26 01:51"
  if (!raw) return '-'
  const d = _parseAsUTC(raw)
  return isNaN(d.getTime()) ? raw.slice(0,16).replace('T',' ') : _fmt(_toKSTDate(d), true, false)
}
export function toKSTDate(raw?: string | null): string {       // "2026-07-26"
  if (!raw) return '-'
  const d = _parseAsUTC(raw)
  return isNaN(d.getTime()) ? raw.slice(0,10) : _fmt(_toKSTDate(d), false)
}
export function toKSTDateOnly(raw?: string | null): string {   // 날짜만 저장된 컬럼 (변환 불필요)
  return raw ? raw.slice(0,10) : '-'
}
export function toKSTDateKo(raw?: string | null): string {     // "2026년 07월 26일"
  const d = toKSTDate(raw)
  if (d === '-') return '-'
  const [yy, mo, dd] = d.split('-')
  return `${yy}년 ${mo}월 ${dd}일`
}
```

---

## 프론트엔드 (app.js) 인라인 헬퍼

서버에서 `kst-utils.ts`를 import할 수 없는 클라이언트 측 JavaScript용.
HTML `<script>` 또는 `app.js`에 삽입:

```javascript
// ── 날짜·시간 포맷 전역 헬퍼 (UTC → KST) ──
function _toKSTDateTime(raw) {
  if (!raw) return '-';
  var s = String(raw);
  // timezone 미명시 → UTC 강제 ('Z' 추가)
  if (!s.includes('Z') && !s.match(/[+-]\d{2}:?\d{2}$/)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  var d = new Date(s);
  if (isNaN(d.getTime())) return raw.slice(0,16).replace('T',' ');
  var kst = new Date(d.getTime() + 9*60*60*1000);
  var yy = kst.getUTCFullYear();
  var mo = String(kst.getUTCMonth()+1).padStart(2,'0');
  var dd = String(kst.getUTCDate()).padStart(2,'0');
  var hh = String(kst.getUTCHours()).padStart(2,'0');
  var mn = String(kst.getUTCMinutes()).padStart(2,'0');
  return yy+'-'+mo+'-'+dd+' '+hh+':'+mn;
}

function _toKSTDateOnly(raw) {
  return raw ? String(raw).slice(0,10) : '-';
}

// 현재 KST 날짜 "YYYY-MM-DD"
function getKSTDate() {
  var now = new Date(Date.now() + 9*60*60*1000);
  return now.getUTCFullYear()+'-'+
    String(now.getUTCMonth()+1).padStart(2,'0')+'-'+
    String(now.getUTCDate()).padStart(2,'0');
}
```

---

## 서버 렌더 HTML 주입 패턴 (공유 페이지)

```typescript
// src/nas-routes/tbm-share.ts 등 서버 렌더 라우트에서
import { KST_JS_HELPER, toKSTDate } from '../kst-utils'

app.get('/share/tbm/:token', async (c) => {
  // ...
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>...</head>
    <body>
      <script>
        ${KST_JS_HELPER}
        // 이제 _toKSTDateTime() 을 클라이언트에서도 사용 가능
      </script>
      <p>작업일: ${toKSTDate(tbm.work_date)}</p>
    </body>
    </html>
  `)
})
```

---

## 함수 선택 가이드

| 상황 | 사용 함수 | 출력 예시 |
|---|---|---|
| DB INSERT용 현재 시각 | `nowForDB()` | `"2026-07-26 01:51:00"` |
| 현재 KST 날짜 문자열 | `kstDateStr()` | `"2026-07-26"` |
| DB UTC값 → 화면 날짜+시간 | `toKSTDateTime(raw)` | `"2026-07-26 01:51"` |
| DB UTC값 → 화면 날짜만 | `toKSTDate(raw)` | `"2026-07-26"` |
| 날짜만 저장된 컬럼 | `toKSTDateOnly(raw)` | `"2026-07-26"` (변환 없음) |
| 한국어 날짜 표시 | `toKSTDateKo(raw)` | `"2026년 07월 26일"` |
| 통계 연도 | `kstYear()` | `2026` |
| 통계 월 | `kstMonth()` | `7` |

---

## 관련 버그 이력

| BUG ID | 증상 | 원인 | 커밋 |
|---|---|---|---|
| BUG-156 | 작업중지현황 stopped_at UTC→KST 변환 누락 | `toLocaleString()` 직접 사용 | `7587688` |
| 세션 84 | kst-utils UTC 파싱 버그 | `TZ=Asia/Seoul` 환경에서 `new Date(str)` → KST 해석 | `9a97b31` |
| 세션 85 | 브라우저 로컬TZ 방식 전면 전환 | 서버 TZ 의존 제거 | `fc33a03` |

---

## 주의사항

1. **`toLocaleString()` 절대 금지**: 서버 TZ 설정에 따라 결과가 달라짐
2. **날짜 전용 컬럼**: `work_date`, `planned_date` 등 날짜만 저장하는 컬럼은 `toKSTDateOnly()` 사용 (UTC 변환 불필요)
3. **`getUTC*` 사용**: KST 변환 후 항상 `getUTCFullYear()`, `getUTCMonth()` 등 UTC 계열 메서드 사용 (`getFullYear()` 금지)
4. **DB 저장 형식**: SQLite `CURRENT_TIMESTAMP`는 `"YYYY-MM-DD HH:MM:SS"` (timezone 없음) → 반드시 UTC로 해석
