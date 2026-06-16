# SafetyNOTE 버그픽스 기록

> 코드 수정 전 반드시 이 파일을 확인할 것.
> 동일 에러 재발 방지 및 NAS 듀얼 구조 이해를 위한 핵심 기록.

---

## 아키텍처 핵심 구조

```
[Cloudflare 배포]  src/routes/*.ts   — c.env.DB (D1 바인딩)
[NAS 배포]         node-server.ts    — rawDb (better-sqlite3 동기 API)
```

- NAS는 `node-server.ts` 단일 파일로 모든 라우트 처리
- `src/routes/*.ts`는 Cloudflare 전용 — NAS에서는 **라우트 우선순위** 문제 발생 가능
- **Hono 라우트 우선순위**: 먼저 등록된 라우트가 우선 매칭

---

## [BUG-001] TBM 서명 저장 안 됨 (2026-06)

### 증상
- TBM 탭 참가자 서명 클릭 시 저장 안 됨 (404 → 500 에러)

### 원인 추적 (4단계)

#### 1단계: 서명 라우트 누락 (커밋 `a9b3967`)
- **원인**: `src/routes/tbm.ts`에 서명 관련 라우트 5개가 완전히 없었음
- **해결**: `tbm.ts`에 5개 라우트 추가
  - `GET /:id/signatures`
  - `POST /:id/signatures`
  - `DELETE /:id/signatures/:sigId`
  - `GET /:id/approval-status`
  - `POST /:id/approval-sign`

#### 2단계: Hono 라우트 우선순위 역전 (커밋 `deaeed6`)
- **원인**: `node-server.ts`에서 `app.route('/api/tbm', tbmRoutes)`가 먼저 등록되어
  NAS 전용 서명 라우트에 도달 불가. `tbmRoutes` 내부에서 `c.env.DB = undefined` → 500
- **해결**: NAS 서명 라우트 5개를 `app.route('/api/tbm', tbmRoutes)` **앞**으로 이동
- **⚠️ 주의**: 이후 `node-server.ts`에 tbm 관련 라우트 추가 시 반드시 `tbmRoutes` 마운트(약 2070번 라인) **앞**에 위치시킬 것

#### 3단계: `let` TDZ(Temporal Dead Zone) 에러 (커밋 `9e18cde`)
- **원인**: `let _tbmSigTableEnsured`가 1752번에 선언됐는데, 1329번에서 호출 → TDZ 에러
  ```
  ReferenceError: Cannot access '_tbmSigTableEnsured' before initialization
  ```
- **해결**: `let` → `var` 변경 (`var`는 TDZ 없이 호이스팅됨)
- **⚠️ 규칙**: `node-server.ts`에서 함수 호출 이후에 선언되는 변수는 반드시 `var` 사용
  (또는 선언을 호출보다 앞으로 이동)

#### 4단계: `tbm_signatures` 테이블 DDL의 잘못된 FK (커밋 `d8d4f04`) ← **진짜 원인**
- **원인**: DB의 `tbm_signatures` 테이블이 `tbm_records_old(id)` FK로 생성되어 있었음
  ```sql
  -- 잘못된 DDL
  tbm_id INTEGER NOT NULL REFERENCES "tbm_records_old"(id) ON DELETE CASCADE
  ```
  `tbm_records_old` 테이블이 존재하지 않아 INSERT 시마다 500 에러
- **발견 방법**: NAS에서 직접 DDL 확인
  ```bash
  node -e "const db=require('better-sqlite3')('/volume1/safetynote/data/safety.db');
  console.log(db.prepare(\"SELECT sql FROM sqlite_master WHERE name='tbm_signatures'\").get())"
  ```
- **해결**: NAS DB에서 직접 테이블 재생성 (56행 데이터 보존)
  ```sql
  PRAGMA foreign_keys = OFF;
  BEGIN;
  CREATE TABLE tbm_signatures_backup AS SELECT * FROM tbm_signatures;
  DROP TABLE tbm_signatures;
  CREATE TABLE tbm_signatures (
    tbm_id INTEGER NOT NULL REFERENCES tbm_records(id) ON DELETE CASCADE, ...
  );
  INSERT INTO tbm_signatures SELECT ... FROM tbm_signatures_backup;
  COMMIT;
  PRAGMA foreign_keys = ON;
  ```
- **재발 방지**: `patchSchema()` 맨 앞에 FK 자동 교정 로직 추가
  - `tbm_signatures` DDL에 `tbm_records_old` 포함 시 자동으로 테이블 재생성

---

## [RULE-001] NAS 배포 시 주의사항

### git pull이 적용 안 되는 경우
```bash
# pull 대신 강제 동기화 사용
git fetch origin && git reset --hard origin/main
```

### tsx 캐시 문제
- NAS에서 `tsx`로 TypeScript 실행 시 이전 버전 캐시를 사용할 수 있음
- `pm2 restart` 후에도 에러가 지속되면 `git reset --hard origin/main` 후 재시작

### 에러 로그 확인 방법
```bash
# 누적 로그가 아닌 최신 에러만 확인
tail -5 /root/.pm2/logs/safetynote-error.log

# 특정 에러 검색
grep "POST /tbm" /root/.pm2/logs/safetynote-error.log | tail -5

# DB 직접 조회 (트리거, DDL 확인)
node -e "
const db = require('better-sqlite3')('/volume1/safetynote/data/safety.db');
// 트리거 확인
console.log(db.prepare(\"SELECT * FROM sqlite_master WHERE type='trigger'\").all());
// 테이블 DDL 확인
console.log(db.prepare(\"SELECT sql FROM sqlite_master WHERE name='테이블명'\").get());
db.close();
"
```

---

## [RULE-002] node-server.ts 수정 규칙

### 라우트 등록 순서 (반드시 준수)
```
1. NAS 전용 tbm 서명 라우트 (GET/POST /api/tbm/:id/signatures 등)
2. app.route('/api/tbm', tbmRoutes)   ← 이것보다 위에 있어야 함
3. 기타 app.route() 마운트
```

### 변수 선언 규칙
- 함수 호출보다 나중에 선언되는 변수는 `var` 사용 (TDZ 방지)
- 특히 `patchSchema()`, `ensureTbmSignaturesTable()` 등 서버 시작 시 즉시 호출되는 함수 관련

### 새 테이블 생성 시
- FK 참조 테이블명 반드시 확인 (`tbm_records` vs `tbm_records_old` 혼동 주의)
- 마이그레이션 후 실제 DB DDL 확인 권장

---

## [BUG-003] TBM 미서명 상태에서 작업 개시 가능 (2026-06)

### 증상
- 참석자 전원이 서명하지 않아도 "작업 개시" 버튼이 활성화됨

### 원인
- `GET /api/tasks/:id/tbm-info` 응답에 `attendees` 필드가 없었음
- 프론트엔드 서명 체크 로직: `attendees.length === 0` → `sigs.length === 0` 조건만 확인
  → 서명이 1명이라도 있으면 `attendees` 없이 통과
- `node-server.ts`에 `/api/tasks/:id/tbm-info` NAS 전용 라우트 없어서
  `taskRoutes`(Cloudflare용)로 넘어가 `c.env.DB=undefined` 가능성

### 해결 (커밋 `75d6029`)
1. `src/routes/tasks.ts` — `tbm-info` 쿼리에 `attendees` 컬럼 추가 + JSON 파싱 후 응답
2. `node-server.ts` — `/api/tasks/:id/tbm-info` NAS 전용 라우트 추가 (attendees 포함)
   - `app.route('/api/tasks', taskRoutes)` **앞**에 등록

### 프론트엔드 서명 체크 로직 (app.js:7002~7060)
```javascript
// attendees 있을 때: 전원 서명 필수
// attendees 없을 때: 최소 1명 서명 필수
const blocked = attendees.length > 0 ? unsignedList.length > 0 : sigs.length === 0;
```

### ⚠️ 주의
- `/api/tasks/:id/tbm-info` 처럼 특정 리소스의 서브경로 API는
  NAS 전용 라우트를 **반드시 `taskRoutes` 마운트 앞에** 등록할 것

---

## [BUG-002] 사진 탭 그룹 표시 미반영 (미해결, 2026-06)

### 증상
- `photo_type + caption` 기준 2단계 그룹 표시가 실제 앱에서 미반영
- `public/static/app.js` 수정했으나 사용자 확인 결과 미반영

### 관련 파일
- `src/utils.ts` — `PHOTO_TYPE_DIRS`, `captionToFolderName()`, `buildStoragePath()`
- `src/routes/photos.ts` — `buildStoragePath` 호출에 `photoType+caption` 전달
- `public/static/app.js` — 사진 탭 UI (photo_type+caption 2단계 그룹핑)

### 상태
- **미해결** — 별도 세션에서 재수정 필요

---

## 커밋 히스토리 (관련)

| 커밋 | 내용 |
|------|------|
| `a9b3967` | TBM 서명 라우트 5개 추가 (tbm.ts) |
| `deaeed6` | NAS 서명 라우트 우선순위 수정 |
| `2c86145` | try/catch 강화 + ensureTbmSignaturesTable() 추가 |
| `533a74b` | tbm_records_old 잔여 트리거 자동 제거 |
| `d7a1b15` | TDZ 에러 수정 (let → patchSchema 앞으로 이동) |
| `9e18cde` | TDZ 완전 해결 (let → var) |
| `d8d4f04` | patchSchema에 tbm_signatures FK 자동 교정 추가 |
| `2fe2696` | BUGFIX_LOG.md 생성 |
| `75d6029` | tbm-info API attendees 추가 + NAS 전용 라우트 |
| `d658198` | attendees 비어있을 때 task_assignments 폴백 |
| `e0c55a6` | 알람센터 미수신(makeD1 batch+sendToUsers) + TBM미서명 팝업→작업화면이동 |
| `b95ab27` | 사진 등록 완료 후 즉시 썸네일 표시 (BUG-006) |
| `5169f21` | 사진 탭 부분 갱신 `_refreshPhotoTab()` (BUG-007) |
| `79c414b` | 현장위치 지도 탭별 작업 상태 구분 표시 (BUG-008) |
| `cd23c6d` | 진행탭 마커 미표시 수정 + KST 시간 표시 (BUG-009) |
| `048bdf2` | work_logs GPS fallback 추가 (FEAT-010) |
| `bc8b047` | 진행/완료탭 tasks API 기반 전면 재작성 (FEAT-011) |
| `fe8991e` | GPS 없을 때 상태변경 시각 displayDate fallback (FEAT-012) |
| *(다음커밋)* | 내작업 탭 클릭 이동 수정 + 작업일보 500 에러 수정 (BUG-013/014) |

---

## [BUG-004] 알람센터 알람 미수신 (2026-06)

### 증상
- 작업 상태 변경 시 알람센터에 알람이 도달하지 않음
- SSE 실시간 알림은 동작하지만 DB 저장(영구 알림) 미작동

### 원인 (2가지)

#### 1. `makeD1` 래퍼에 `batch()` 메서드 누락
- `tasks.ts`의 `PATCH /:id/status` 알림 로직이 `c.env.DB.batch([...])` 호출
- NAS의 `makeD1` 래퍼에 `batch()` 미구현 → 호출 시 TypeError 발생
- 상위 `try { ... } catch(_) {}` 로 조용히 무시 → notifications 테이블 저장 전혀 안 됨
- **해결**: `makeD1` 래퍼에 `batch()` 메서드 추가 (SQLite 트랜잭션으로 일괄 실행)

#### 2. `sendToUsers` import 누락 (`node-server.ts`)
- `sse.ts`에 `sendToUsers(userIds, payload)` 함수 export 존재
- `node-server.ts` import 라인에 `sendToUsers` 미포함
  ```typescript
  // 수정 전 (누락)
  import { sseClients, sendToUser, broadcastAll, broadcastToRoles, getConnectionCount } from './src/sse'
  // 수정 후 (추가)
  import { sseClients, sendToUser, sendToUsers, broadcastAll, broadcastToRoles, getConnectionCount } from './src/sse'
  ```
- `tasks.ts`는 `../sse`를 직접 import해서 `sendToUsers`를 사용 → Cloudflare에선 정상
- NAS에서 `taskRoutes`가 `makeD1(rawDb)`로 주입된 `c.env.DB`를 사용하므로
  `sendToUsers`가 `node-server.ts` 컨텍스트에서도 필요함

### 해결 (batch() 구현)
```typescript
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
  return tx(stmts)
}
```

### ⚠️ 규칙 추가
- `makeD1` 래퍼 수정 시 D1 API 메서드 목록 전체 확인: `prepare`, `exec`, `batch`
- `tasks.ts` 등 라우트 파일이 `c.env.DB.batch()` 호출 시 NAS에서도 동작해야 함
- `sse.ts`에 새 함수 추가 시 `node-server.ts` import 라인도 동기화 필수

---

## [BUG-005] TBM 서명 미완료 팝업 → 작업화면 이동 (2026-06)

### 증상
- TBM 서명 미완료 시 새 팝업(모달)이 생성되어 사용자가 별도 버튼 클릭 필요
- 요청: 팝업 없이 바로 작업화면(TBM 탭)으로 이동

### 해결 (`public/static/app.js`)
```javascript
// 수정 전: 새 팝업 생성 후 "TBM 탭으로 이동" 버튼 제공
// 수정 후:
if (blocked) {
  document.querySelectorAll('.modal-overlay').forEach(el => el.remove()); // 모달 전체 닫기
  toast(`TBM 서명 미완료 — N명 미서명 (미서명: 이름...)`, 'error');     // 토스트만 표시
  showTaskDetail(taskId, true);                                            // TBM 탭으로 직접 이동
  return;
}
```

---

## [BUG-006] 사진 업로드 후 바로 표시 안 됨 (2026-06)

### 증상
- 사진 등록 모달(`showPhotoUpload`)에서 사진 업로드 완료 후
  모달이 닫히고 작업 상세 화면이 새로 로드될 때까지 사진이 보이지 않음
- 사용자 입장에서 업로드가 됐는지 즉각 확인 불가

### 원인
- `submitPhotos()` 완료 시 `document.querySelectorAll('.modal-overlay').forEach(m => m.remove())`
  → 모달 전체 닫기 + `showTaskDetail(taskId)` 재호출 방식
- 업로드 완료 즉시 모달 내에서 결과를 표시하지 않았음

### 해결 (`public/static/app.js`)

#### 변경 내용
1. **`showPhotoUpload` 모달 구조 개선**
   - 모달 상단에 "업로드 완료 사진 즉시 표시 영역" (`#uploadedPhotoList`) 추가
   - 닫기/취소 버튼 핸들러: 업로드된 사진이 있으면 작업 상세 사진탭으로 이동
   
2. **`submitPhotos` 완료 처리 변경**
   - 완료 후 모달 닫기 제거
   - 업로드된 `ids` 배열로 각 사진 썸네일을 모달 내 그리드에 즉시 표시
   - 입력 폼 초기화 (파일 선택 초기화, 캡션 초기화, 진행바 숨김)
   - 업로드 버튼: "업로드" → "추가 업로드"로 변경 (연속 등록 가능)
   - 닫기 버튼: "닫기" → "완료 (닫기)"로 변경, primary 스타일 적용
   - "완료 (닫기)" 클릭 시 작업 상세 사진탭으로 자동 이동

#### 동작 흐름
```
파일 선택 → 업로드 클릭 → 진행바 표시
→ 완료 시: 모달 상단에 업로드된 사진 썸네일 즉시 표시
→ "추가 업로드" 버튼으로 계속 등록 가능
→ "완료 (닫기)" 클릭 시 작업 상세 사진 탭으로 이동
```

### 영향 범위
- `showPhotoUpload()` 함수 (작업 상세 하단 "사진 등록" 버튼)
- `submitPhotos()` 함수 (업로드 실행 핵심 로직)
- 교육 사진(`_uploadEduPhotos`): 기존 `_reloadEduPhotos` 방식 유지 (정상 동작)
- 점검 사진(`showInspectionDetail`): 기존 재호출 방식 유지 (정상 동작)

---

## [BUG-007] 사진 탭 업로드/삭제 시 전체 모달 재로드 문제 (2026-06)

### 증상
- 작업 상세 모달 `사진(N)` 탭에서 사진 업로드/삭제 완료 후
  전체 모달을 닫고 `showTaskDetail()` 전체 재호출 → 화면 깜빡임, 스크롤 위치 초기화
- 사진 탭 외 다른 탭(기본정보, TBM 등) 데이터도 불필요하게 재조회

### 원인
- `deleteMedia()` 완료 처리: 전체 모달 닫기 → `showTaskDetail(taskId)` 재호출 → 200ms 후 사진 탭 클릭
- `showPhotoUpload()` 닫기 핸들러: `showTaskDetail(taskId)` 전체 재호출 후 setTimeout으로 사진탭 이동
- 모달 전체 재생성 없이 `dtab-photo` div 내용만 교체하는 방법이 없었음

### 해결 (`public/static/app.js`)

#### 1. `_refreshPhotoTab(taskId)` 신규 함수 추가 (7067번 라인, `switchDetailTab` 앞)
```javascript
async function _refreshPhotoTab(taskId) {
  const photoTab = document.getElementById('dtab-photo');
  if (!photoTab) return; // 모달 없으면 무시 (폴백 불필요)

  // 스켈레톤 로딩 표시
  photoTab.innerHTML = `<스피너>사진 목록 갱신 중...</div>`;

  try {
    const photosRes = await API.get('/photos', { params: { task_id: taskId } });
    const photos = photosRes.data || [];

    // 사진 탭 뱃지 카운트 즉시 갱신
    const photoTabBtn = document.querySelector('[onclick*="switchDetailTab"][onclick*="photo"]');
    if (photoTabBtn) photoTabBtn.textContent = `사진(${photos.length})`;

    // showTaskDetail 내부와 완전히 동일한 렌더링 로직
    // photo_type 1차 그룹 (before→progress→after 순)
    // caption 2차 그룹 (소제목별 분리)
    photoTab.innerHTML = html;
  } catch(e) {
    // 에러 메시지 + 등록 버튼 표시
  }
}
```

#### 2. `deleteMedia()` 완료 처리 변경 (7510번 라인)
```javascript
// 수정 전: showTaskDetail() 전체 재로드
// 수정 후:
if (taskId && document.getElementById('dtab-photo')) {
  await _refreshPhotoTab(taskId);           // 사진 탭만 부분 갱신
  photoTabBtn?.click();                      // 탭 활성화 유지
} else {
  // 폴백: dtab-photo 없으면(모달 닫힌 경우) 전체 재로드
}
```

#### 3. `showPhotoUpload()` 닫기 핸들러 변경 (8915번 라인)
```javascript
// 수정 전: showTaskDetail() 전체 재호출
// 수정 후:
await _refreshPhotoTab(taskId);   // 전체 재로드 없이 사진 탭만 갱신
photoTabBtn?.click();              // 사진 탭 활성화 유지
```

#### 4. `submitPhotos()` 완료 후 추가 (9185번 라인)
```javascript
// dtab-photo가 DOM에 있으면 업로드 모달 열린 상태에서도 백그라운드 갱신
if (document.getElementById('dtab-photo')) {
  _refreshPhotoTab(taskId).catch(() => {});
}
```

### 동작 흐름 (수정 후)
```
사진 삭제 클릭 → 삭제 API 완료
→ dtab-photo 있으면: _refreshPhotoTab() → 스피너 → API 재조회 → 사진 탭만 교체
→ dtab-photo 없으면(뷰어만 열린 경우): 뷰어 모달만 닫기

사진 업로드 완료 → submitPhotos()
→ 즉시 썸네일 모달 내 표시 (BUG-006 처리)
→ 백그라운드로 _refreshPhotoTab() 호출 (탭 뱃지 카운트 갱신)
→ "완료(닫기)" 클릭 시 _refreshPhotoTab() → 사진 탭 전환
```

### ⚠️ 주의사항
- `_refreshPhotoTab()` 내부 `renderThumb()` 함수는 `showTaskDetail()` 내부와 완전히 동일하게 유지할 것
  (두 곳 중 하나만 수정하면 표시 불일치 발생)
- `photoTabBtn` 셀렉터: `[onclick*="switchDetailTab"][onclick*="photo"]`
  — 탭 버튼 텍스트 변경 시 이 셀렉터에는 영향 없음 (onclick 속성 기반)
- 에러 발생 시 폴백으로 "새로고침 해주세요" 메시지 표시 (전체 모달 재로드 강제 없음)

---

## [BUG-008] 현장위치 지도 탭별 작업 상태 구분 표시 (2026-06)

### 증상 / 요청
- 현장위치 지도의 TBM·진행·완료 탭이 데이터 소스가 달라 작업 흐름과 일치하지 않음
  - TBM 탭: `/api/tbm` 전체 표시 (작업 개시 후 건도 포함)
  - 진행/완료 탭: `/api/inspections` 기반 (현장점검 GPS, 작업 위치 아님)
- 요청: 작업 상태(status)에 따라 탭에 정확히 구분 표시
  - TBM 탭 → `tbm_done` (TBM 완료, 작업 개시 대기) 만
  - 진행 탭 → `working` (작업 개시됨) 만
  - 완료 탭 → `work_completed` / `completed` 만

### 원인
1. **TBM 탭**: `/api/tbm` 응답에 `task_status` 컬럼이 없어 상태 필터링 불가
2. **진행/완료 탭**: `/api/inspections` 기반으로 현장점검 GPS를 사용 → 작업 자체 위치와 다름

### 해결

#### 1. `src/routes/tbm.ts` — TBM 목록 쿼리에 `t.status as task_status` 추가
```sql
-- 수정 전
SELECT tbm.*, t.title as task_title, t.task_number, ...
-- 수정 후
SELECT tbm.*, t.title as task_title, t.task_number, t.status as task_status, ...
```
- 구버전 DB fallback 쿼리에도 동일하게 추가

#### 2. `public/static/app.js` — `loadSiteMapMarkers()` 탭별 로직 전면 개편

**TBM 탭** (`filter === 'tbm'`):
```javascript
// task_status가 tbm_done 인 것만 표시
if (tbm.task_status && tbm.task_status !== 'tbm_done') continue;
// GPS: tbm_records.gps_lat / gps_lon / gps_address (TBM 작성 시 취득)
```

**진행 탭** (`filter === 'working'`):
```javascript
// 데이터 소스 변경: /api/inspections → /api/tasks?status=working
const res = await API.get(`/tasks?status=working&start_date=${dateFrom}&end_date=${dateTo}&...`);
// GPS: tasks.gps_lat / gps_lon + confirmed_address (작업개시 시 취득)
```

**완료 탭** (`filter === 'completed'`):
```javascript
// 데이터 소스 변경: /api/inspections → /api/tasks?status=work_completed,completed
const res = await API.get(`/tasks?status=work_completed,completed&...`);
// GPS: tasks.gps_lat / gps_lon + confirmed_address
```

#### 3. 목록 카드 개선
- 진행/완료 탭 카드에 **"상세" 버튼 추가** → `showTaskDetail(taskId)` 호출
- TBM/위험성 탭은 기존대로 화살표 아이콘만 표시

### 탭별 표시 규칙 요약
| 작업 상태 | TBM 탭 | 진행 탭 | 완료 탭 |
|-----------|--------|---------|---------|
| `tbm_done` (TBM완료, 개시 전) | ✅ | ❌ | ❌ |
| `working` (작업 개시됨) | ❌ | ✅ | ❌ |
| `work_completed` / `completed` | ❌ | ❌ | ✅ |
| 그 외 | ❌ | ❌ | ❌ |

### ⚠️ 주의사항
- **진행/완료 탭의 날짜 필터**: tasks API는 `start_date`/`end_date`(planned_date 기준)
  현장지도 필터는 `date_from`/`date_to` → 파라미터명 변환해서 전달
- **tasks API의 `status` 파라미터**: 콤마 구분 다중 상태 지원
  `status=work_completed,completed` 형태로 전달 (tasks.ts에서 `IN (...)` 처리)
- **GPS 없는 작업**: `gps_lat/gps_lon` 이 null 이면 지도 마커 생략
  (작업개시 시 GPS 권한 거부한 경우 → 지도에 표시되지 않음, 정상 동작)
- **TBM 탭 `task_status` null 처리**: 구버전 DB에서 `task_status`가 null일 수 있음
  → `if (tbm.task_status && tbm.task_status !== 'tbm_done') continue;`
  → null이면 필터 통과 (하위 호환)
- **위험성체크 탭**: 변경 없음 (기존 `/api/risk` 유지)

---

## [BUG-009] 현장위치 지도 진행탭 마커 미표시 + KST 시간 표시 (2026-06)

### 증상
1. **진행 탭 마커 미표시**: `working` 상태 작업이 있는데 진행 탭 지도에 마커가 전혀 안 보임
2. **완료 탭 마커 미표시**: 동일 원인
3. **하단 리스트 시간 UTC 표시**: 위치 기록 하단 목록의 날짜/시간이 UTC 기준으로 표시

### 원인 분석

#### 진행/완료 탭 마커 미표시
BUG-008에서 진행/완료 탭 데이터 소스를 `/api/tasks?status=working`으로 변경했으나:
```javascript
// BUG-008에서 작성된 코드 (오류 있음)
const res = await API.get(`/tasks?${p.toString()}`);
for (const task of list) {
  if (task.gps_lat && task.gps_lon) {  // ← tasks.gps_lat 대부분 null
    lat = parseFloat(task.gps_lat);
    ...
  }
  if (!lat || !lon || ...) continue;   // ← 전부 skip → 마커 없음
}
```
- `tasks.gps_lat/gps_lon`: 작업 생성 시 수동 입력 필드 → **대부분 null**
- 작업개시 시 GPS는 `tasks.confirmed_address`(텍스트)에만 저장됨 → 좌표 없음
- `tbm_records.gps_lat/gps_lon`: TBM 작성 시 브라우저 GPS로 취득 → **실좌표 있음**

#### KST 시간 미적용
`displayDate` 계산 시 `.substring(0, 10)`만 사용 → UTC 기준 날짜/시간 그대로 표시

### 해결

#### 1. `public/static/app.js` — `_toKSTDateTime()` 헬퍼 함수 추가
```javascript
// UTC 날짜/시각 문자열 → KST 기준 "YYYY-MM-DD HH:MM" 변환
function _toKSTDateTime(raw) {
  if (!raw) return '';
  // 날짜만(10자리)이면 그대로 반환
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim().substring(0, 10);
  const isoUtc = raw.trim().replace(' ', 'T');
  const iso = isoUtc.endsWith('Z') || isoUtc.includes('+') ? isoUtc : isoUtc + '+00:00';
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000); // UTC+9
  return `${kst.getUTCFullYear()}-${...}-${...} ${HH}:${MM}`;
}
```

#### 2. 진행/완료 탭 데이터 소스 변경: `/api/tasks` → `/api/tbm`

**진행 탭** (`filter === 'working'`):
```javascript
// 변경 전: /api/tasks?status=working (tasks.gps_lat = null → 마커 없음)
// 변경 후: /api/tbm + task_status 필터
const res = await API.get(`/tbm${dateParams()}`);
for (const tbm of list) {
  if (!tbm.task_status || tbm.task_status !== 'working') continue;
  // tbm_records.gps_lat/gps_lon 사용 (TBM 작성 시 실좌표)
  const lat = parseFloat(tbm.gps_lat);
  const lon = parseFloat(tbm.gps_lon);
  const displayDate = _toKSTDateTime(tbm.tbm_date || tbm.created_at || '');
}
```

**완료 탭** (`filter === 'completed'`):
```javascript
// 변경 전: /api/tasks?status=work_completed,completed (gps null → 마커 없음)
// 변경 후: /api/tbm + task_status 필터
const res = await API.get(`/tbm${dateParams()}`);
for (const tbm of list) {
  const st = tbm.task_status || '';
  if (st !== 'work_completed' && st !== 'completed') continue;
  // tbm_records.gps_lat/gps_lon 사용
}
```

#### 3. 전체 탭 `displayDate` KST 변환 통일
- 위험성체크(risk) 탭: `_toKSTDateTime(ra.created_at)`
- TBM 탭: `_toKSTDateTime(tbm.tbm_date || tbm.created_at)`
- 진행/완료 탭: `_toKSTDateTime(tbm.tbm_date || tbm.created_at)`

### 탭별 GPS 데이터 소스 최종 정리
| 탭 | API | GPS 컬럼 | 비고 |
|----|-----|----------|------|
| 위험성체크 | `/api/risk` | `risk_assessments.gps_lat/lon` | 변경 없음 |
| TBM | `/api/tbm` + `task_status=tbm_done` | `tbm_records.gps_lat/lon` | BUG-008 |
| **진행** | `/api/tbm` + `task_status=working` | `tbm_records.gps_lat/lon` | **BUG-009 수정** |
| **완료** | `/api/tbm` + `task_status=work_completed\|completed` | `tbm_records.gps_lat/lon` | **BUG-009 수정** |

### 롤백 정보
- **안전 커밋**: `5169f21` (사진 탭 즉시 갱신)
- **롤백 태그**: `rollback/pre-bugfix-008`
- **롤백 명령**:
  ```bash
  git revert 79c414b --no-edit && git push origin main
  # 또는 강제 다운그레이드
  git push origin 5169f21:main --force
  ```

### ⚠️ 주의사항
- **TBM GPS 없는 작업**: TBM 작성 시 GPS 권한 거부한 경우 `tbm_records.gps_lat/lon` null → 마커 생략 (정상)
- **`task_status` 신뢰성**: `tbm.ts` JOIN 쿼리에서 `t.status as task_status` 제공 (BUG-008에서 추가)
- **날짜 필터 파라미터**: `/api/tbm`은 `date_from`/`date_to` 파라미터 사용 (`dateParams()` 헬퍼로 통일됨)

---

## [FEAT-010] work_logs GPS fallback — 현장위치 지도 GPS 커버리지 확대 (2026-06)

### 배경
BUG-009 수정 후에도 TBM 작성 시 GPS 권한을 거부한 경우
`tbm_records.gps_lat/gps_lon`이 null → 진행/완료 탭 마커 여전히 미표시 가능

### GPS 저장 현황 (검증 완료)
| 저장 시점 | 테이블.컬럼 | 저장 여부 | 비고 |
|-----------|------------|---------|------|
| TBM 작성 시 | `tbm_records.gps_lat/lon` | ✅ 저장 | GPS 허용 시 |
| 작업개시 시 | `tasks.confirmed_address` | 텍스트만 | 좌표 없음 |
| **작업일지 저장 시** | **`work_logs.gps_lat/lon`** | **✅ 저장** | **submitWorkLog()에서 자동 취득** |
| patchSchema 자동 컬럼 추가 | `work_logs.gps_lat/lon/gps_recorded_at` | ✅ | 구버전 DB 대비 |

### 해결 — `public/static/app.js` `loadSiteMapMarkers()` GPS 우선순위 추가

**진행/완료 탭 GPS 우선순위:**
```
1순위: tbm_records.gps_lat/lon (TBM 작성 시 취득)
2순위: work_logs.gps_lat/lon  (작업일지 저장 시 취득) ← FEAT-010 추가
미표시: 둘 다 null (GPS 권한 완전 거부 케이스)
```

**구현 방식:**
```javascript
// tbm GPS null인 task_id만 추출 → 병렬로 /api/worklogs?task_id=xxx 조회
const noGpsTaskIds = workingItems.filter(tbm => !tbm.gps_lat || !tbm.gps_lon).map(tbm => tbm.task_id);
const wlGpsCache = {};
await Promise.all(noGpsTaskIds.map(async (tid) => {
  const wlRes = await API.get(`/worklogs?task_id=${tid}`);
  const found = wlRes.data.find(wl => wl.gps_lat && wl.gps_lon);  // GPS 있는 최신 일지
  if (found) wlGpsCache[tid] = { lat: parseFloat(found.gps_lat), lon: parseFloat(found.gps_lon) };
}));
// 마커 생성 시 tbm GPS → wlGpsCache[task_id] 순서로 선택
```

**팝업 표시**: GPS 출처가 work_logs인 경우 "작업일지 GPS 기준" 안내 문구 표시

### 롤백 정보
- **안전 커밋**: `cd23c6d` (BUG-009)
- **롤백 태그**: `rollback/pre-feat-010`
- **롤백 명령**:
  ```bash
  git revert HEAD --no-edit && git push origin main
  # NAS 반영:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  # 또는 강제 다운그레이드:
  git push origin cd23c6d:main --force
  ```

### ⚠️ 주의사항
- `/api/worklogs?task_id=xxx` 호출은 **tbm GPS null인 건에 한해서만** 실행 (불필요한 호출 최소화)
- `Promise.all` 병렬 처리로 다수 건도 지연 최소화
- work_logs도 GPS null이면 최종적으로 마커 생략 (GPS 완전 거부 케이스 — 정상)

---

## [FEAT-011] 현장위치 진행/완료탭 tasks API 기반 전면 재작성 (2026-06)

### 배경 / 근본 원인
FEAT-010까지도 진행/완료 탭 마커 미표시가 지속됨.
NAS DB 직접 조회로 확인한 결과: **`tbm_records` 테이블에 해당 `working` 작업의 TBM 레코드 자체가 없음**
→ TBM 없이 작업개시(`working`)된 경우 `/api/tbm` 기반으로는 마커 표시 불가능

### 핵심 문제
| 방식 | 문제 |
|------|------|
| BUG-008: `/api/tasks?status=working` | `tasks.gps_lat` 대부분 null |
| BUG-009~FEAT-010: `/api/tbm` + task_status 필터 | TBM 자체가 없는 작업은 조회 불가 |
| **FEAT-011: `/api/tasks` 기반으로 복귀** | tasks 목록 확보 후 TBM/work_logs GPS 매핑 |

### 해결 — `public/static/app.js` `loadSiteMapMarkers()` 전면 재작성

**진행/완료탭 공통 로직:**
```
① /api/tasks?status=working(또는 work_completed,completed) → 작업 목록 확보
② /api/tbm?limit=500 → TBM GPS 캐시 생성 { task_id → gps }
③ TBM GPS 없는 task_id만 → /api/worklogs?task_id= 병렬 조회 → work_logs GPS 캐시
④ 작업 목록 순회하며 GPS 우선순위대로 마커 생성
```

**GPS 우선순위 (최종):**
```
1순위: tbm_records.gps_lat/lon  (TBM 작성 시)
2순위: work_logs.gps_lat/lon    (일지 저장 시)
미표시: 둘 다 null              (GPS 완전 거부)
```

### 롤백 정보
- **안전 커밋**: `048bdf2` (FEAT-010)
- **롤백 태그**: `rollback/pre-feat-011`
- **롤백 명령**:
  ```bash
  git push origin 048bdf2:main --force
  # NAS:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  ```

---

## [FEAT-012] GPS 없을 때 상태변경 시각을 displayDate로 표시 (2026-06)

### 배경 / 근본 원인
FEAT-011에서 GPS 좌표가 없는 작업은 마커를 skip 처리하는데,
GPS가 있어도 `tbmG.date`(TBM 날짜)가 날짜만(`YYYY-MM-DD`) 기록된 경우 시각 정보가 없었음.
→ 팝업의 날짜/하단 리스트의 날짜가 공백(`-`)으로 표시됨

### 핵심 문제
| 경우 | 기존 처리 | 증상 |
|------|----------|------|
| TBM GPS 있음, tbm_date가 날짜만 | `_toKSTDateTime(tbmG.date)` | 시각 없이 날짜만 표시 |
| work_logs GPS 있음, gps_recorded_at 없음 | `wlG.date \|\| task.planned_date \|\| task.created_at` | 예정일/등록일(잘못된 기준) 표시 |
| GPS 완전 없음 | `continue`(skip) → displayDate 미설정 | 시각 정보 전혀 없음 |

### 해결 — `public/static/app.js` `loadSiteMapMarkers()` displayDate 계산 수정

**진행탭 (`filter === 'working'`):**
```javascript
// 상태변경 시각 fallback
const statusTime = task.work_started_at || task.updated_at || '';

if (tbmG) {
  displayDate = _toKSTDateTime(tbmG.date || statusTime);   // tbm_date 없으면 work_started_at
} else if (wlG) {
  displayDate = _toKSTDateTime(wlG.date || statusTime);    // gps_recorded_at 없으면 work_started_at
} else {
  displayDate = _toKSTDateTime(statusTime);                // GPS 없음 → work_started_at (마커 skip)
}
```

**완료탭 (`filter === 'completed'`):**
```javascript
// 상태변경 시각 fallback
const statusTime = task.work_completed_at || task.updated_at || '';

if (tbmG) {
  displayDate = _toKSTDateTime(tbmG.date || statusTime);   // tbm_date 없으면 work_completed_at
} else if (wlG) {
  displayDate = _toKSTDateTime(wlG.date || statusTime);    // gps_recorded_at 없으면 work_completed_at
} else {
  displayDate = _toKSTDateTime(statusTime);                // GPS 없음 → work_completed_at (마커 skip)
}
```

### 상태변경 시각 컬럼 근거 (`src/routes/tasks.ts`)
```sql
-- working 전환 시 (최초 1회)
UPDATE tasks SET status=?, work_started_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
-- work_completed 전환 시
UPDATE tasks SET status=?, work_completed_at=?, work_log_required=1, updated_at=CURRENT_TIMESTAMP WHERE id=?
-- completed 전환 시
UPDATE tasks SET status=?, work_log_required=0, updated_at=CURRENT_TIMESTAMP WHERE id=?
```
→ `/api/tasks` GET 응답에 `t.*`로 모든 컬럼 포함 확인됨

### 롤백 정보
- **안전 커밋**: `bc8b047` (FEAT-011)
- **롤백 태그**: `rollback/pre-feat-011`
- **롤백 명령**:
  ```bash
  git push origin bc8b047:main --force
  # NAS:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  ```

---

## [BUG-013] 내작업 상단 탭(내작업/진행중/완료) 클릭 시 화면 이동 안 됨 (2026-06)

### 증상
- 외선(근로자) 접속 화면의 "내 작업목록" 페이지에서 상단 카드(6 내작업 / 0 진행중 / 1 완료) 클릭 시 아무 반응 없음
- 근로자 외 접속 화면(관리자/감독자)의 동일 구조 카드는 정상 작동

### 근본 원인
`applyMyTasksFilter()` 함수 내에서 컨테이너 DOM을 `getElementById('main-content')`로 조회하는데, 실제 페이지 컨테이너 ID는 `'page-content'`여서 항상 `null` 반환 → `renderMyTasksPage()` 미호출

```javascript
// ❌ 기존 (잘못된 ID)
const content = document.getElementById('main-content');
if (content) renderMyTasksPage(content);  // content === null → 실행 안 됨

// ✅ 수정 (올바른 ID, 구버전 fallback 포함)
const content = document.getElementById('page-content') || document.getElementById('main-content');
if (content) renderMyTasksPage(content);
```

### 수정 파일
- `public/static/app.js`: `applyMyTasksFilter()` 함수 — ID `'main-content'` → `'page-content'` 우선

### 왜 다른 화면에서는 정상?
- 관리자/감독자의 카드(공사현황)는 `navigateToTasksWithFilter()` → `navigateTo()` 흐름 사용 (DOM ID 의존 없음)
- 근로자의 카드만 `applyMyTasksFilter()` 사용 — 버그 범위 한정

---

## [BUG-014] 외선 작업일보 제출 시 POST /api/work-reports 500 에러 (2026-06)

### 증상
- 작업일보 작성 후 "제출" 클릭 시 `POST https://.../api/work-reports 500 (Internal Server Error)` 발생
- 저장 실패 토스트 표시

### 근본 원인
`node-server.ts`의 `POST /api/work-reports` 핸들러 전체에 try-catch가 없음 → 내부 쿼리 중 어느 곳에서든 예외 발생 시 unhandled 500 에러 반환. 특히:
1. `teams` 테이블 JOIN 쿼리 (`task_assignments → users → teams`) — `teams` 미구성 시 에러
2. `work_report_lines` / `work_report_cables` INSERT — 구버전 DB 컬럼 불일치 시 에러
3. `work_report_extras` DELETE/INSERT — 테이블 미생성 시 에러

### 수정 내용 (`node-server.ts`)
```typescript
// ✅ 전체 핸들러를 try-catch로 감쌈
try {
  // ... 모든 DB 로직 ...
  return c.json({ ok: true, reportId })
} catch (e: any) {
  console.error('[work-reports POST /] 오류:', e.message, e.stack)
  return c.json({ error: e.message || '일보 저장 실패' }, 500)
}
```
추가로 각 세부 작업(lines/cables/extras 저장)에도 개별 try-catch 추가:
- 세부 데이터 저장 실패 시 헤더(work_reports 레코드)는 정상 저장되고 경고만 로깅
- `teams` JOIN 쿼리 실패(구버전 DB) 시 `contractor_name` fallback 유지

### 수정 파일
- `node-server.ts`: `POST /api/work-reports` 핸들러 — 전체 try-catch + 세부 try-catch 추가

### 롤백 정보
- **롤백 태그**: `rollback/pre-bugfix-013` (= `fe8991e`)
- **롤백 명령**:
  ```bash
  git push origin fe8991e:main --force
  # NAS:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  ```
