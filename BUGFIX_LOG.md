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
| *(다음커밋)* | 현장위치 지도 탭별 작업 상태 구분 표시 (BUG-008) |

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
