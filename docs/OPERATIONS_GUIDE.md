# SafetyNOTE — 장기 운영 종합 권고사항

> 작성: 세션 47 (2026-06-21)  
> 대상: 월 최대 1,000건↑, 연 수만 건 처리 환경  
> 아키텍처: NAS better-sqlite3 (node-server.ts) + Cloudflare D1 (src/routes/*.ts)  

---

## 목차

1. [데이터 증가 대응 전략](#1-데이터-증가-대응-전략)
2. [DB 유지보수 전략](#2-db-유지보수-전략)
3. [코드 유지보수 전략 (Phase 3 방안 C)](#3-코드-유지보수-전략-phase-3-방안-c)
4. [기능 추가·업데이트 규칙](#4-기능-추가업데이트-규칙)
5. [백업 및 복구 전략](#5-백업-및-복구-전략)
6. [보안 운영 전략](#6-보안-운영-전략)
7. [성능 모니터링](#7-성능-모니터링)
8. [운영 사고 대응 절차](#8-운영-사고-대응-절차)
9. [장기 로드맵 권고](#9-장기-로드맵-권고)
10. [운영 체크리스트 (주간·월간)](#10-운영-체크리스트-주간월간)

---

## 1. 데이터 증가 대응 전략

### 1-A. 예상 데이터 규모

| 테이블 | 월 증가 예상 | 3년 누적 예상 | 비고 |
|--------|-------------|--------------|------|
| `tasks` (작업) | ~300건 | ~10,800행 | 공사 1건당 작업 3~5개 |
| `work_reports` | ~200건 | ~7,200행 | 일보 |
| `work_report_cables` | ~600행 | ~21,600행 | 케이블 1보고당 3행 |
| `work_report_lines` | ~400행 | ~14,400행 | 선로 1보고당 2행 |
| `tbm_records` | ~300건 | ~10,800행 | 작업 1건당 TBM 1건 |
| `tbm_signatures` | ~900건 | ~32,400행 | TBM 1건당 서명 3개 |
| `notifications` | ~2,000건 | ~72,000행 | 이벤트 알림 누적 |
| `photos` / attachments | ~500건 | ~18,000건 | 파일 용량 별도 관리 필요 |

**3년 기준 SQLite DB 파일 크기 예상: 500MB ~ 2GB**  
→ NAS better-sqlite3 환경에서 2GB 이하는 성능 이슈 없음 (WAL 모드 필수)

---

### 1-B. SQLite WAL 모드 활성화 ✅ **최우선 조치**

```typescript
// node-server.ts — DB 초기화 직후 적용
rawDb.pragma('journal_mode = WAL');   // Write-Ahead Logging: 읽기/쓰기 동시 처리
rawDb.pragma('synchronous = NORMAL'); // 성능↑, 안전성 유지 (FULL 대비 2~3x 빠름)
rawDb.pragma('cache_size = -32000');  // 32MB 캐시 (기본 2MB → 16x 향상)
rawDb.pragma('temp_store = MEMORY');  // 임시 데이터 메모리 처리
rawDb.pragma('mmap_size = 268435456'); // 256MB mmap (대용량 읽기 최적화)
```

**효과**: 동시 읽기 성능 3~5배 향상, 잠금 오류 제거  
**적용 위치**: `node-server.ts` DB 초기화 직후 (현재 `rawDb = new Database(...)` 바로 다음)

---

### 1-C. 데이터 보관 정책 (아카이빙)

연 수만 건이 쌓이면 최근 데이터 조회 성능을 유지하기 위해 **정기 아카이빙** 필요:

```sql
-- 예시: 2년 이전 완료된 공사 데이터 아카이브 테이블로 이동
-- 매년 1월 1일 실행 권장

-- 1. 아카이브 테이블 생성 (최초 1회)
CREATE TABLE IF NOT EXISTS tasks_archive AS SELECT * FROM tasks WHERE 0;

-- 2. 2년 이전 완료 데이터 이동
INSERT INTO tasks_archive SELECT * FROM tasks 
  WHERE status = 'done' AND updated_at < date('now', '-2 years');

-- 3. 원본에서 제거
DELETE FROM tasks WHERE status = 'done' AND updated_at < date('now', '-2 years');

-- 4. VACUUM으로 파일 크기 최적화
VACUUM;
```

**권고 주기**: 연 1회 (1~2월, 비수기)  
**보관 기간**: 완료 공사 2년 → 아카이브 테이블, 5년 이후 → 별도 백업 파일  

---

### 1-D. 파일(사진·첨부) 용량 관리

업로드 파일은 DB보다 빠르게 용량이 증가합니다:

```
예상 용량:
- 사진: 평균 2MB × 500건/월 = 1GB/월
- 3년 누적: 약 36GB (NAS 여유 공간 확인 필요)
```

**권고사항**:
1. **업로드 제한 설정** — 현재 코드에 파일 크기 제한 추가
   ```typescript
   // node-server.ts — 파일 업로드 라우트
   const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB 제한
   if (file.size > MAX_FILE_SIZE) return c.json({ error: '파일 크기 초과' }, 400);
   ```
2. **이미지 자동 리사이징** — 모바일 업로드 원본(8~12MB) → 서버에서 2MB로 압축  
   (sharp 라이브러리: `npm install sharp`)
3. **연도별 폴더 분리** — 현재 구현된 `UPLOAD_SUBDIR` 연도/월 구조 유지 ✅
4. **오래된 임시파일 정리** — 미연결 업로드 파일 주기적 제거

---

## 2. DB 유지보수 전략

### 2-A. 인덱스 최적화 (성능 핵심)

현재 인덱스 현황을 확인하고 쿼리 패턴에 맞는 인덱스를 추가해야 합니다:

```sql
-- 자주 조회되는 패턴 기반 인덱스 추가 (safeAlter 방식으로 node-server.ts에 추가)

-- 1. 작업 목록 조회 (status + 날짜 범위 필터)
CREATE INDEX IF NOT EXISTS idx_tasks_status_date ON tasks(status, start_date);

-- 2. 작업일보 날짜 범위 조회
CREATE INDEX IF NOT EXISTS idx_work_reports_date ON work_reports(work_date, task_id);

-- 3. TBM 레코드 작업별 조회
CREATE INDEX IF NOT EXISTS idx_tbm_task ON tbm_records(task_id, created_at);

-- 4. 알림 미읽음 조회
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);

-- 5. 서명 요청 대기 조회
CREATE INDEX IF NOT EXISTS idx_sig_requests ON signature_requests(target_user_id, status);
```

**적용 방법**: `patchSchema()` 함수 끝에 추가 (서버 재시작 시 자동 생성)

---

### 2-B. VACUUM 및 ANALYZE 정기 실행

```typescript
// node-server.ts — 관리자 API 라우트에 추가 (또는 주기적 실행)
app.post('/api/admin/db-optimize', requireAdmin, async (c) => {
  rawDb.exec('PRAGMA optimize');  // 쿼리 플래너 통계 업데이트
  rawDb.exec('ANALYZE');          // 인덱스 통계 갱신
  // VACUUM은 DB 크기가 크면 수 분 소요 → 별도 스케줄링 권고
  return c.json({ ok: true, message: 'DB 최적화 완료' });
});
```

**권고 주기**:
- `PRAGMA optimize` + `ANALYZE`: 월 1회 (cron 또는 수동)
- `VACUUM`: 연 1회 (아카이빙 직후, 서버 점검 시간대)

---

### 2-C. DB 스키마 마이그레이션 관리 강화

현재 `safeAlter` 방식은 단순 컬럼 추가에 효과적이지만, 장기 운영 시 **마이그레이션 이력 관리** 필요:

```sql
-- migrations 이력 테이블 추가 (patchSchema 초반에 생성)
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT UNIQUE NOT NULL,    -- 예: '20260621_add_asset_type'
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);
```

```typescript
// 마이그레이션 실행 헬퍼
function runMigration(version: string, sql: string, desc: string) {
  const exists = rawDb.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
  if (exists) return; // 이미 실행됨
  rawDb.exec(sql);
  rawDb.prepare('INSERT INTO schema_migrations (version, description) VALUES (?, ?)').run(version, desc);
  console.log(`[migration] ${version}: ${desc}`);
}
```

**효과**: 어떤 마이그레이션이 언제 적용되었는지 DB에서 직접 확인 가능

---

### 2-D. 쿼리 성능 모니터링

```typescript
// node-server.ts — 느린 쿼리 감지 (개발/운영 모두 유용)
const SLOW_QUERY_MS = 100; // 100ms 이상이면 로그

function profiledPrepare(sql: string) {
  return {
    get: (...args: any[]) => {
      const start = Date.now();
      const result = rawDb.prepare(sql).get(...args);
      const elapsed = Date.now() - start;
      if (elapsed > SLOW_QUERY_MS) {
        console.warn(`[SLOW QUERY ${elapsed}ms] ${sql.slice(0, 80)}`);
      }
      return result;
    },
    all: (...args: any[]) => { /* 동일 패턴 */ },
    run: (...args: any[]) => { /* 동일 패턴 */ },
  };
}
```

---

## 3. 코드 유지보수 전략 (Phase 3 방안 C)

### 3-A. Phase 3 파일 분리 구조 (확정)

```
node-server.ts (5,815줄 → 약 600줄)
    ↓ 분리
src/
├── nas-db.ts           (rawDb singleton + makeD1 + getUser + getSetting + 헬퍼)
├── nas-routes-tbm.ts   (TBM 서명/결재 라우트: ~750줄)
├── nas-routes-push.ts  (FCM 푸시 라우트: ~200줄)
├── nas-routes-work.ts  (외선/접속일보: ~350줄)
├── nas-routes-admin.ts (설정/APK/지오코딩/초기화: ~300줄)
└── nas-routes-misc.ts  (서명요청/법령/첨부/SSE/QR: ~400줄)
```

**핵심 원칙**:
- `rawDb`는 `nas-db.ts`의 `getRawDb()` / `setRawDb()` 로만 접근
- `RULE-002` 준수: 인라인 라우트는 `app.route()` 마운트 **이전** 등록
- 각 파일은 `new Hono()` 로 독립 앱 생성 → `export default router`

---

### 3-B. 파일당 최대 줄수 가이드라인

| 파일 | 권장 최대 | 경고 기준 |
|------|-----------|-----------|
| `node-server.ts` | 800줄 | 1,200줄 초과 시 분리 검토 |
| `src/nas-routes-*.ts` | 600줄 | 800줄 초과 시 세분화 |
| `src/routes/*.ts` | 500줄 | 700줄 초과 시 세분화 |
| `public/static/app.js` | 제한 없음 | 함수 단위 관리 |

---

### 3-C. 코드 품질 규칙 (추가 권고)

현재 규칙 (`RULE-001` ~ `RULE-003`) 에 추가:

**RULE-004**: 새 DB 컬럼 추가 시 반드시 3곳 동시 수정
```
1. patchSchema() → safeAlter 추가 (NAS 자동 마이그레이션)
2. INSERT/UPDATE 쿼리 → 컬럼 포함
3. 관련 프론트엔드 렌더링 → 필드 표시
```

**RULE-005**: `app.js` 함수 수정 후 반드시 검증
```bash
node --check public/static/app.js && echo "✅ 문법 오류 없음"
```

**RULE-006**: 배포 전 반드시 빌드 테스트
```bash
npm run build && echo "✅ 빌드 성공"
```

**RULE-007**: 세션 종료 전 커밋 의무화
```bash
git add . && git commit -m "feat/fix/docs: [내용] — v=YYYYMMDD[알파벳]"
```

---

### 3-D. 세션 간 인계 문서 표준화

현재 방식(시스템 프롬프트로 인계)을 보완하여:

```
docs/
├── PENDING_TASKS.md      ✅ 현재 운영 중
├── BUGFIX_LOG.md         ✅ 현재 운영 중
├── PROJECT_HISTORY.md    ✅ 현재 운영 중
├── OPERATIONS_GUIDE.md   📌 이 문서 (신규)
├── NAS-HTTPS-SETUP.md    ✅ 현재 존재
└── SCHEMA_HISTORY.md     📌 권고 신규 — DB 스키마 변경 이력
```

**SCHEMA_HISTORY.md** 신규 권고:
```markdown
## 스키마 변경 이력
| 날짜 | 버전 | 테이블 | 변경 내용 | 담당 세션 |
|------|------|--------|-----------|-----------|
| 2026-06-21 | v0.9.7 | work_report_cables | asset_type 컬럼 추가 | 세션 44 |
```

---

## 4. 기능 추가·업데이트 규칙

### 4-A. 기능 추가 전 체크리스트

기능 추가 요청 시 **반드시 사전 확인**:

```
□ 1. DB 변경 필요 여부 확인
     → 필요 시: safeAlter + Cloudflare D1 마이그레이션 동시 계획
□ 2. NAS/Cloudflare 양쪽 반영 대상 확인
     → node-server.ts 수정이면: 해당 라우트 파일(Phase 3 후)도 확인
     → src/routes/*.ts 수정이면: Cloudflare 배포 필요
□ 3. app.js 캐시버전 갱신 필요 여부
     → app.js 수정 시 항상 필요 (RULE-003)
□ 4. 영향받는 기존 기능 목록 작성
□ 5. 롤백 방법 사전 확인
```

---

### 4-B. 버전 관리 전략

**현재**: `v=YYYYMMDD[알파벳]` 방식 (예: `v=20260621h`)  
**권고 추가**: 주요 기능 추가 시 서버 버전 상수도 갱신

```typescript
// node-server.ts 상단 (현재 없다면 추가)
const APP_VERSION = '1.0.0'; // 주요 기능 추가 시 업데이트
const APP_BUILD = '20260621h';

// 상태 API에 포함
app.get('/api/health', (c) => c.json({ 
  version: APP_VERSION, 
  build: APP_BUILD,
  uptime: process.uptime() 
}));
```

---

### 4-C. 기능 플래그 패턴 (장기 권고)

대규모 기능 추가 시 즉시 배포 대신 단계적 롤아웃:

```typescript
// system_settings 테이블 활용
const FEATURES = {
  NEW_REPORT_FORMAT: await getSetting('feature_new_report') === 'on',
  ADVANCED_GPS: await getSetting('feature_advanced_gps') === 'on',
};

app.get('/api/reports/new', async (c) => {
  if (!FEATURES.NEW_REPORT_FORMAT) return c.json({ error: '준비 중' }, 503);
  // 새 로직
});
```

---

## 5. 백업 및 복구 전략

### 5-A. 다중 백업 체계 (필수)

```
[현재] GitHub 코드 백업 ✅
[필요] DB + 파일 백업 ❌ → 추가 필요
```

**권고 백업 체계**:

| 레벨 | 대상 | 주기 | 보관 |
|------|------|------|------|
| L1 | SQLite DB 파일 | 매일 새벽 2시 | NAS 내 `/backup/db/` 30일 보관 |
| L2 | 업로드 파일 전체 | 매주 일요일 | NAS 내 `/backup/files/` 12주 보관 |
| L3 | DB + 파일 통합 | 매월 1일 | 외부 스토리지 (USB/클라우드) 12개월 |

---

### 5-B. 자동 백업 스크립트 (NAS Synology Task Scheduler)

```bash
#!/bin/bash
# /usr/local/bin/safetynote-backup.sh
# Synology 작업 스케줄러에 등록: 매일 02:00

DATE=$(date +%Y%m%d)
DB_PATH="/var/db/safetynote/safetynote.db"  # 실제 경로로 수정
BACKUP_DIR="/volume1/backup/safetynote/db"
LOG="/var/log/safetynote-backup.log"

mkdir -p "$BACKUP_DIR"

# SQLite 온라인 백업 (서버 중지 불필요)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/safetynote_$DATE.db'"

# 30일 이전 파일 삭제
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete

echo "[$DATE] 백업 완료" >> "$LOG"
```

**Synology 등록 방법**:  
`DSM → 제어판 → 작업 스케줄러 → 생성 → 사용자 정의 스크립트`

---

### 5-C. 복구 절차

```bash
# 1. 서버 중지
pm2 stop safetynote  # 또는 systemctl stop

# 2. 기존 DB 백업
cp /var/db/safetynote.db /var/db/safetynote.db.bak.$(date +%Y%m%d)

# 3. 백업 파일 복원
cp /backup/safetynote_20260620.db /var/db/safetynote.db

# 4. 서버 재시작 (patchSchema 자동 실행됨)
pm2 start safetynote

# 5. 복구 확인
curl http://localhost:3443/api/health
```

---

## 6. 보안 운영 전략

### 6-A. 인증 토큰 관리

```typescript
// 현재 JWT 만료 시간 권고
const JWT_EXPIRES = '8h';  // 업무 시간 기준 (현재 설정 확인 필요)

// 권고: 리프레시 토큰 도입 (장기 로그인 유지)
// 현재는 매 8시간마다 재로그인 필요 → UX 불편
// → refresh_tokens 테이블 추가 (Phase 4 권고)
```

---

### 6-B. API Rate Limiting (DoS 방지)

```typescript
// node-server.ts — 업로드/인증 라우트에 적용 권고
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxReq: number, windowMs: number) {
  return async (c: any, next: any) => {
    const ip = c.req.header('x-forwarded-for') || 'local';
    const now = Date.now();
    const record = requestCounts.get(ip);
    
    if (!record || now > record.resetAt) {
      requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    } else if (record.count >= maxReq) {
      return c.json({ error: '요청 한도 초과' }, 429);
    } else {
      record.count++;
    }
    await next();
  };
}

// 로그인 API: 분당 10회
app.post('/api/auth/login', rateLimit(10, 60_000), loginHandler);

// 파일 업로드: 분당 20회  
app.post('/api/photos', rateLimit(20, 60_000), uploadHandler);
```

---

### 6-C. 민감 정보 보호

```typescript
// 현재 확인 필요 항목
□ JWT_SECRET — 환경변수로 관리 (하드코딩 금지)
□ FCM 서비스 계정 키 — 환경변수 또는 파일 경로로 관리
□ DB 경로 — 환경변수 DB_PATH로 관리 ✅ (이미 구현됨)
□ 로그에 비밀번호/토큰 출력 금지
```

---

### 6-D. 보안 헤더 추가

```typescript
// node-server.ts — 전역 미들웨어에 추가
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  // HTTPS 환경에서만:
  c.header('Strict-Transport-Security', 'max-age=31536000');
});
```

---

## 7. 성능 모니터링

### 7-A. 헬스체크 API 강화

```typescript
// 현재보다 상세한 상태 정보 제공
app.get('/api/health', (c) => {
  const dbInfo = rawDb.prepare('PRAGMA page_count').get() as any;
  const dbPages = rawDb.prepare('PRAGMA page_size').get() as any;
  const dbSizeMB = ((dbInfo.page_count * dbPages.page_size) / 1024 / 1024).toFixed(1);
  
  return c.json({
    status: 'ok',
    version: APP_VERSION,
    build: APP_BUILD,
    uptime_sec: Math.floor(process.uptime()),
    db_size_mb: dbSizeMB,
    db_wal_mode: rawDb.pragma('journal_mode', { simple: true }),
    memory_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
    timestamp: new Date().toISOString(),
  });
});
```

---

### 7-B. 에러 로깅 강화

```typescript
// node-server.ts — 전역 에러 핸들러
app.onError((err, c) => {
  const errorId = `ERR_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  console.error(`[${errorId}] ${c.req.method} ${c.req.url}`, err);
  
  // 운영 환경에서는 내부 오류 숨기기
  return c.json({ 
    error: '서버 오류가 발생했습니다',
    errorId,  // 사용자에게 ID 제공 → 로그에서 추적 가능
  }, 500);
});
```

---

### 7-C. 로그 파일 관리

```typescript
// node-server.ts — 파일 로그 추가 (현재 console만 사용)
import fs from 'fs';

const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_FILE = `${LOG_DIR}/server-${new Date().toISOString().slice(0,7)}.log`; // 월별

function appLog(level: 'INFO'|'WARN'|'ERROR', message: string) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG_FILE, line); // 파일에도 기록
}
```

**Synology 로그 보관**: 3개월치 유지, 90일 이전 자동 삭제  
```bash
find /var/log/safetynote -name "*.log" -mtime +90 -delete
```

---

## 8. 운영 사고 대응 절차

### 8-A. 서비스 중단 시 대응

```
[1단계 — 즉시 확인 (5분 이내)]
1. pm2 status → 프로세스 상태 확인
2. pm2 logs --nostream → 최근 에러 확인
3. curl http://localhost:3443/api/health → 응답 확인

[2단계 — 원인 파악 (15분 이내)]
4. 최근 Git 커밋 확인: git log --oneline -5
5. DB 잠금 확인: lsof | grep safetynote.db
6. 디스크 용량 확인: df -h

[3단계 — 복구]
7a. 코드 문제 → git revert HEAD && npm run build && pm2 restart
7b. DB 문제 → 백업 복원 (5-C 절차)
7c. 프로세스 충돌 → pm2 delete all && pm2 start ecosystem.config.cjs
```

---

### 8-B. 데이터 불일치 대응

```sql
-- 고아(orphan) 레코드 확인
SELECT COUNT(*) FROM tbm_signatures WHERE tbm_record_id NOT IN (SELECT id FROM tbm_records);
SELECT COUNT(*) FROM work_report_cables WHERE work_report_id NOT IN (SELECT id FROM work_reports);

-- 정리
DELETE FROM tbm_signatures WHERE tbm_record_id NOT IN (SELECT id FROM tbm_records);
```

---

### 8-C. 롤백 절차

```bash
# GitHub에서 이전 버전으로 롤백
git log --oneline -10  # 되돌릴 커밋 확인
git revert HEAD        # 최근 커밋 취소 (새 커밋 생성)
# 또는
git checkout [커밋해시] -- node-server.ts  # 특정 파일만 롤백

# NAS에서 pull 후 재시작
git pull origin main
pm2 restart safetynote
```

---

## 9. 장기 로드맵 권고

### 9-A. 단기 (1~3개월) — Phase 3 + 안정화

| 우선순위 | 항목 | 내용 |
|---------|------|------|
| 🔴 1 | **Phase 3 방안 C** | node-server.ts 분리 (현재 확정) |
| 🔴 2 | **WAL 모드 적용** | DB 성능 최우선 조치 |
| 🟠 3 | **자동 백업 스크립트** | Synology 스케줄러 등록 |
| 🟠 4 | **헬스체크 API 강화** | 운영 모니터링 기반 |
| 🟡 5 | **에러 로깅 파일화** | 장애 추적 체계 |

---

### 9-B. 중기 (3~6개월) — 데이터 관리

| 우선순위 | 항목 | 내용 |
|---------|------|------|
| 🟠 1 | **인덱스 최적화** | 데이터 증가 대비 쿼리 성능 |
| 🟠 2 | **마이그레이션 이력 테이블** | schema_migrations 도입 |
| 🟡 3 | **이미지 리사이징** | 업로드 용량 절감 |
| 🟡 4 | **Rate Limiting** | 보안 강화 |
| 🟢 5 | **보안 헤더** | X-Frame-Options 등 |

---

### 9-C. 장기 (6개월~1년) — 기능 확장

| 항목 | 내용 | 전제 조건 |
|------|------|-----------|
| **데이터 내보내기** | 월별/연별 엑셀 보고서 자동 생성 | Phase 3 완료 후 |
| **대시보드 강화** | 실시간 통계 (공사 진행률, 서명 현황) | 인덱스 최적화 완료 후 |
| **오프라인 모드** | PWA + IndexedDB 로컬 캐시 | 안정화 후 |
| **리프레시 토큰** | 8시간 → 자동 갱신 (UX 개선) | Phase 3 완료 후 |
| **아카이빙 UI** | 완료 공사 아카이브/복원 관리 화면 | 데이터 1만건 도달 전 |

---

### 9-D. 아키텍처 전환 검토 시점

**현재 SQLite(NAS) 방식 유지 가능 범위**:
- DB 파일 크기 2GB 이하 → 현재 아키텍처 적합
- 동시 사용자 50명 이하 → WAL 모드로 충분
- 3년 누적 예상 데이터 → SQLite로 충분히 처리 가능

**PostgreSQL/MySQL 전환 검토 시점** (참고용):
- DB 파일 5GB 초과
- 동시 접속 100명 이상
- 복잡한 집계 쿼리 응답 2초 초과

→ **3~5년 내 전환 불필요 예상** (현재 규모 기준)

---

## 10. 운영 체크리스트 (주간·월간)

### 주간 체크리스트 (매주 월요일)

```
□ pm2 status → 모든 프로세스 online 확인
□ pm2 logs --nostream | grep ERROR → 에러 로그 확인
□ df -h → 디스크 여유 공간 확인 (70% 이하 유지)
□ curl /api/health → 응답 확인
□ GitHub → NAS 동기화 확인 (git log 일치 여부)
```

### 월간 체크리스트 (매월 1일)

```
□ DB 파일 크기 확인: ls -lh safetynote.db
□ PRAGMA optimize + ANALYZE 실행
□ 백업 파일 생성 확인 (L1/L2 백업 존재 여부)
□ 업로드 폴더 크기 확인: du -sh uploads/
□ 불필요한 임시 파일 정리
□ PENDING_TASKS.md 업데이트
□ PROJECT_HISTORY.md 월간 요약 추가
□ 보안: JWT_SECRET 마지막 교체일 확인 (6개월마다 교체 권고)
```

### 연간 체크리스트 (매년 1월)

```
□ 완료 공사 2년치 아카이빙 실행
□ VACUUM 실행 (서버 점검 시간대)
□ 인덱스 효율 분석: EXPLAIN QUERY PLAN
□ 전년도 로그 파일 압축 보관
□ NAS 인증서 만료일 확인 (Synology DDNS 갱신)
□ 라이브러리 취약점 점검: npm audit
□ 의존성 업데이트 검토: npm outdated
```

---

## 부록: 즉시 적용 가능한 최우선 5가지

> Phase 3 방안 C 구현 전이라도 즉시 적용 가능한 항목

| 순위 | 항목 | 코드 위치 | 효과 |
|------|------|-----------|------|
| 1 | **WAL 모드 + pragma 설정** | node-server.ts DB 초기화 직후 | 성능 3~5배 향상 |
| 2 | **자동 백업 스크립트 등록** | Synology Task Scheduler | 데이터 유실 방지 |
| 3 | **헬스체크 API 강화** | node-server.ts | 장애 조기 감지 |
| 4 | **에러 로그 파일화** | node-server.ts | 장애 원인 추적 |
| 5 | **인덱스 4개 추가** | patchSchema() | 조회 쿼리 성능 |

---

> 문서 작성: 세션 47  
> 다음 업데이트: Phase 3 완료 후 (코드 구조 변경 반영)
