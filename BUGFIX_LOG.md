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
| `63d0c8c` | 내작업 탭 클릭 이동 수정 + 작업일보 500 에러 수정 (BUG-013/014) |
| `5bde50f` | 외선 작업일보 작성내역 미저장 수정 (BUG-015) |
| *(다음커밋)* | 근로자 작업일보 접근 + 제출완료 일보 수정 기능 (FEAT-016) |

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

---

## [BUG-015] 외선 작업일보 작성 내용 미저장 — lines 항상 빈 배열 (2026-06)

### 증상
- 외선 작업일보 화면에서 내용 작성 후 "임시저장" / "제출" 실행 시
  작성된 내용(작업내역 섹션)이 DB에 저장되지 않음
- 500 에러가 아님 — `{ ok: true }` 응답 반환되지만 `work_report_lines` 테이블에 데이터 없음

### 근본 원인 (4가지)

#### 원인 1 — `mkCableSetHTML`에 `line-tbody` 섹션 자체 누락
```javascript
// mkCableSetHTML(n, cableData, lineData)
// lnRows를 파라미터로 받지만 HTML 템플릿에 line-tbody가 없었음
// 케이블 세트 = cable-tbody + extra-tbody 만 존재
// → _collectWrData()에서 getElementById(`cs1-line-tbody`) → null
// → lines 배열 항상 빈 배열 → DB에 라인 데이터 미저장
```

#### 원인 2 — `_wrAddCableSet()` 동적 추가 함수에도 line-tbody 누락
- `lineRows3` HTML 변수를 선언하지만 `div.innerHTML`에 포함하지 않음

#### 원인 3 — `_wrRenumberSets()` tbody 인덱스 오매핑
```javascript
// 수정 전 (잘못됨) — line-tbody 없어서 tbodies[1] = extra-tbody
if (tbodies[1]) tbodies[1].id = `${sid}-line-tbody`;   // ❌ 실제로 extra-tbody
if (tbodies[2]) tbodies[2].id = `${sid}-extra-tbody`;  // ❌ undefined
```

#### 원인 4 — 프론트 수집 필드 vs DB 컬럼 완전 불일치
| 기존 프론트 필드 | DB work_report_lines 컬럼 |
|----------------|--------------------------|
| maker, od, id_val, purpose, start_point, end_point, usage_length, optical_city, base_no, mat_qty | mgmt_zone, mgmt_no, line_name, line_no, digital_no, section_dist, pole_count, ip_pole, grounding, remark |

### 수정 내용

#### 1. `mkCableSetHTML` — `${sid}-line-tbody` 섹션 추가 (DB 컬럼 기준 UI)
- 작업내역 섹션: `구분, 관리구간, 관리번호, 선로명, 선번, 디지털번호, 구간거리(M), 전주수, IP전주, 접지, 비고`
- `lnRows` 데이터로 초기값 복원 가능

#### 2. `_wrAddCableSet()` — `div.innerHTML`에 line-tbody 섹션 추가
- `lineRows3`(DB 컬럼 기준) 활용, 케이블 세트 추가 시 작업내역 섹션도 같이 생성

#### 3. `_wrAddLineRow()` — DB 컬럼 기준으로 재작성
- 클래스명: `wrl-work-div, wrl-mgmt-zone, wrl-mgmt-no, wrl-line-name, wrl-line-no, wrl-digital-no, wrl-section-dist, wrl-pole-count, wrl-ip-pole, wrl-grounding, wrl-remark`

#### 4. `_wrRenumberSets()` — tbody 인덱스 재조정 + 버튼 셀렉터 개선
```javascript
// 수정 후 — 3개 tbody 순서: cable(0), line(1), extra(2)
if (tbodies[0]) tbodies[0].id = `${sid}-cable-tbody`;  // ✅
if (tbodies[1]) tbodies[1].id = `${sid}-line-tbody`;   // ✅
if (tbodies[2]) tbodies[2].id = `${sid}-extra-tbody`;  // ✅
// 버튼 onclick 속성으로 찾음 (인덱스 대신)
const cBtn = Array.from(allBtns).find(b => b.getAttribute('onclick')?.includes('_wrAddCableRow'));
const lBtn = Array.from(allBtns).find(b => b.getAttribute('onclick')?.includes('_wrAddLineRow'));
```

#### 5. `_collectWrData()` — lines 수집 필드를 DB 컬럼명 기준으로 수정
```javascript
lines.push({
  work_div, mgmt_zone, mgmt_no, line_name, line_no, digital_no,
  section_dist, pole_count, ip_pole, grounding, remark
});
```

#### 6. `src/routes/work-reports.ts` — cables INSERT에 `proc`, `remark` 추가 (D1용)
- `work_report_cables` 테이블에 컬럼 있었으나 D1 INSERT 바인딩에서 누락됨
- `node-server.ts`는 이미 포함 (정상)

### 수정 파일
- `public/static/app.js`: `mkCableSetHTML`, `_wrAddCableSet`, `_wrAddLineRow`, `_wrRenumberSets`, `_collectWrData`
- `src/routes/work-reports.ts`: `POST /` cables INSERT — `proc`, `remark` 추가

### DOM 구조 (수정 후)
```
.wr-cable-set[data-set="N"]
  ├─ .border-blue-100   — 케이블 정보 섹션 → tbody#csN-cable-tbody
  ├─ .border-green-100  — 작업내역 섹션   → tbody#csN-line-tbody  ← NEW
  └─ .border-orange-100 — 추가입력 섹션   → tbody#csN-extra-tbody
```

### 롤백 정보
- **안전 커밋**: `63d0c8c` (BUG-013/014)
- **롤백 태그**: `rollback/pre-bugfix-015`
- **롤백 명령**:
  ```bash
  git push origin 63d0c8c:main --force
  # NAS:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  ```

### ⚠️ 주의사항
- `work_report_lines` DB 컬럼 중 `bind_wire, hanger, hardware, cabinet, name_tag, warning_sign, other_work`는 현재 UI에서 미입력 → 서버 INSERT 시 빈 값으로 저장
- 기존에 저장된 lines 데이터(구버전 필드 기준)는 새 UI에서 빈 값으로 표시됨 (재입력 필요)

---

## [FEAT-016] 근로자 작업일보 접근 + 제출완료 일보 수정 기능 (2026-06)

### 요구사항
1. **FEAT-016A**: 작업일보 작성 사이드메뉴를 근로자도 접근 가능하도록 변경 (소속팀 해당건만)
2. **FEAT-016B**: 기존 제출 완료된 작업일보에 수정 기능 추가

### 구현 내용

#### FEAT-016A — 근로자 사이드메뉴 접근
1. **근로자 메뉴 배열에 `report-write` 추가** (`app.js` L.2093):
   ```javascript
   { id:'report-write', icon:'fas fa-pen-to-square', label:'작업일보 작성' }
   ```

2. **`renderWorkReportForm` 뒤로가기 버튼 분기** (`app.js`):
   ```javascript
   // 수정 전
   onclick="navigateTo('field-report')"
   // 수정 후 — 근로자는 report-write로, 나머지는 field-report로
   onclick="navigateTo(currentUser?.role==='worker'?'report-write':'field-report')"
   ```

3. **tasks API 필터링**: `src/routes/tasks.ts`에서 근로자 역할 시 `INNER JOIN task_assignments`로 소속 작업만 반환 — 이미 구현됨, 추가 작업 불필요

4. **헤더 상태 배지 개선**:
   - `submitted` → 초록 배지 `제출완료`
   - `confirmed` → 파란 배지 `확정` (신규)

#### FEAT-016B — 제출완료 일보 수정 기능

**서버 side — `node-server.ts` (NAS)**:
- `POST /api/work-reports/:reportId/revert` 엔드포인트 추가:
  - `confirmed` 상태 → 403 (수정 불가)
  - `submitted` 상태 → `draft`로 전환, 200 반환
- `POST /api/work-reports` 차단 로직 수정:
  - `confirmed` → 409 유지
  - `submitted` → 409 + "수정하기 버튼을 먼저 눌러주세요" 메시지 (revert 후 draft 상태에서만 저장 가능)

**서버 side — `src/routes/work-reports.ts` (D1/Cloudflare)**:
- 동일 `POST /:reportId/revert` 엔드포인트 추가 (D1 비동기 방식)
- `POST /` 핸들러: `SELECT id, status`로 쿼리 변경 + confirmed/submitted 차단 로직 추가

**프론트 side — `app.js`**:

1. **저장 버튼 영역 상태별 분기**:
   - `draft` 상태: 기존 임시저장/제출 버튼
   - `submitted` 상태: 목록으로 버튼 + **수정하기** 버튼 (amber색)
   - `confirmed` 상태: 목록으로 버튼 + 확정됨(수정불가) 버튼 (비활성)

2. **`_revertWorkReport(reportId, taskId)` 함수 추가**:
   ```javascript
   async function _revertWorkReport(reportId, taskId) {
     // 확인 다이얼로그 → POST /api/work-reports/:reportId/revert 호출
     // 성공 시 toast + renderWorkReportForm 재로드 (draft 상태로 표시)
   }
   ```

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `public/static/app.js` | 근로자 사이드메뉴 report-write 추가; 뒤로가기 버튼 role 분기; 상태별 버튼 UI 분기; `_revertWorkReport` 함수 신규 추가; 헤더 배지 개선 |
| `node-server.ts` | `POST /revert` 엔드포인트 추가; submitted 차단 메시지 개선 |
| `src/routes/work-reports.ts` | `POST /:reportId/revert` 엔드포인트 추가; `POST /` 핸들러 status 체크 추가 |

### 상태 흐름
```
draft ──[제출]──▶ submitted ──[수정하기]──▶ draft
                     │
                  [확정처리]
                     │
                     ▼
                 confirmed (수정 불가)
```

### 롤백 정보
- **안전 커밋**: `5bde50f` (BUG-015)
- **롤백 태그**: `rollback/pre-feat-016`
- **롤백 명령**:
  ```bash
  git push origin 5bde50f:main --force
  # NAS:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  ```

### ⚠️ 주의사항
- revert(수정하기)는 `submitted` 상태에서만 가능. `confirmed`는 불가
- revert 후 폼이 재로드되면서 draft 상태로 전환되어 임시저장/제출 버튼이 다시 표시됨
- tasks API 근로자 필터링은 `task_assignments` 기반 — 팀 배정이 안 된 작업은 표시되지 않음

---

## [BUG-016] 작업일보 내용 저장 안 됨 (2026-06)

### 증상
- 작업일보 작성 후 임시저장/제출 시 "완료" 메시지는 표시됨
- 다시 열면 저장된 내용이 없음 (빈 폼)

### 원인 분석

#### 원인 1 — `work_report_lines` 컬럼 누락 (NAS DB 구버전 호환 문제) ★핵심
- `CREATE TABLE IF NOT EXISTS`는 **기존 테이블에 컬럼을 추가하지 않음**
- NAS DB가 초기 스키마로 생성된 경우, 이후 추가된 컬럼들이 실제 테이블에 없음
- INSERT 시 "no such column" 에러 발생 → `try/catch(무시)`로 조용히 실패 → `ok:true` 반환
- 영향 컬럼: `work_div, mgmt_zone, mgmt_no, line_name, line_no, digital_no, section_dist, pole_count, ip_pole, bind_wire, hanger, hardware, cabinet, name_tag, warning_sign, grounding, other_work, remark`
- `work_report_cables` 일부도 동일: `cable_type, work_div, cable_code, special_note`

#### 원인 2 — 빈 기본 3행 무조건 저장
- 입력 없는 기본 3행이 항상 저장되어 데이터로 착각될 수 있음
- (수정: 유효 데이터가 있는 행만 저장)

#### 원인 3 — 임시저장 후 목록으로 이동
- 저장 성공 후 `renderReportWritePage`로 이동 → 사용자가 다시 클릭해야 내용 확인
- (수정: 폼 재로드로 즉시 저장 내용 확인)

### 수정 내용

#### 1. `node-server.ts` — patchSchema에 컬럼 보정 ALTER TABLE 추가
```javascript
// work_report_lines 전체 컬럼 safeAlter (중복 시 무시)
safeAlter(`ALTER TABLE work_report_lines ADD COLUMN work_div TEXT DEFAULT ''`)
safeAlter(`ALTER TABLE work_report_lines ADD COLUMN mgmt_zone TEXT DEFAULT ''`)
// ... (총 18개 컬럼)
// work_report_cables 추가 컬럼 보정
safeAlter(`ALTER TABLE work_report_cables ADD COLUMN cable_type TEXT DEFAULT ''`)
safeAlter(`ALTER TABLE work_report_cables ADD COLUMN work_div TEXT DEFAULT ''`)
safeAlter(`ALTER TABLE work_report_cables ADD COLUMN cable_code TEXT DEFAULT ''`)
safeAlter(`ALTER TABLE work_report_cables ADD COLUMN special_note TEXT DEFAULT ''`)
```

#### 2. `node-server.ts` — lines/cables INSERT 개선
- 빈 행 필터링: 모든 필드가 기본값인 행은 INSERT 건너뜀
- 에러 로그 강화: `console.warn` → `console.error` + 행 데이터 출력
- 저장 완료 로그 추가: `[work-reports POST] lines 저장 완료: reportId=N, 저장행수=M/K`

#### 3. `public/static/app.js` — saveWorkReport 성공 후 처리 변경
```javascript
// 수정 전: 목록 페이지로 이동
await renderReportWritePage(content, 'cable', 'draft', 'pending');
// 수정 후: 폼 재로드 (저장 내용 즉시 확인 가능)
await renderWorkReportForm(content, taskId);
```

### 수정 파일
- `node-server.ts`: patchSchema 컬럼 보정, lines/cables INSERT 개선
- `public/static/app.js`: saveWorkReport 목록이동 → 폼재로드

### 롤백 정보
- **안전 커밋**: `16fe707` (FEAT-016)
- **롤백 태그**: `rollback/pre-bugfix-016b`
- **롤백 명령**:
  ```bash
  git push origin 16fe707:main --force
  # NAS:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  ```

### ⚠️ 중요: NAS 재시작 필수
- `pm2 restart safetynote` 시 `patchSchema()`가 실행되어 누락 컬럼이 자동 추가됨
- DB 재생성 불필요 — 기존 데이터 유지

---

## [BUG-017] 작업일보 저장 여전히 안 됨 + 작업내역 섹션 삭제 (2026-06)

### 증상
1. LOT NO. / 규격 / 시작점 등 케이블 입력 후 저장해도 저장 안 됨 (성공 메시지는 뜸)
2. 화면에 "작업내역" 섹션(구분/관리구간/관리번호/선로명/선번/디지털번호/구간거리/전주수/IP전주/접지/비고) 표시

### 원인 분석

#### 원인 1 — cables 프론트 수집 데이터 누락 ★핵심 저장 버그
- `_collectWrData` 에서 `start_point`, `end_point` 수집 시:
  ```javascript
  // 기존 (버그): 값이 0이어도 0||0 = 0, 빈 값이면 0으로 변환됨 — 문제없음
  // 실제 문제: hasData 조건에서 cb.start_point && cb.start_point !== 0 → start_point=0이면 falsy!
  ```
- `hasData` 조건: `cb.start_point && cb.start_point !== 0` → `start_point=0`이면 `0 && true = false` → 유효한 데이터임에도 빈 행으로 판정하여 저장 스킵

#### 원인 2 — start_point/end_point null vs 0 혼동
- 프론트: `parseInt(value) || 0` → 빈 입력도 0으로 변환 → hasData 조건에서 0은 falsy
- 수정: 빈 입력은 `null`로 전송, 0 입력은 `0`으로 전송하여 명확히 구분
- 서버 INSERT: `null → ''`, `0 → 0` 으로 정확히 저장

#### 원인 3 — D1 라우트 extras 미저장
- `src/routes/work-reports.ts` POST / 핸들러에 `cable_sets` extras 저장 로직 없었음
- NAS(node-server.ts)에는 있었으나 D1에는 누락

### 수정 내용

#### `public/static/app.js` — 작업내역 섹션 전체 삭제
- `mkCableSetHTML`: 작업내역 div 블록 (선로내역 테이블) 제거
- `_wrAddCableSet`: 동일 블록 제거, `lineRows3` 생성 코드 제거
- `_wrRenumberSets`: `tbodies[1]` line-tbody 처리 제거, lt(line title) 참조 제거
  - 이제 tbody[0]=cable, tbody[1]=extra (2개만)
- `_collectWrData`: lines 수집 코드 전체 제거, `cable_sets[0].lines` / `body.lines` 참조 제거
  - start_point/end_point: `parseInt(value) || 0` → 빈 값이면 `null`, 숫자면 그대로
  - hasData 조건 제거 (서버 측에서 처리)
- `_wrAddLineRow` 함수 전체 제거
- `_wrAddLine` 하위호환 함수 전체 제거

#### `node-server.ts` — cables INSERT + lines INSERT 제거
- lines INSERT 블록 전체 제거 (작업내역 섹션 UI 삭제에 따른 정리)
- cables hasData 조건 수정:
  ```typescript
  // 기존 (버그)
  (cb.start_point && cb.start_point !== 0)  // start_point=0 → false → 저장 스킵
  // 수정
  (cb.start_point != null)  // null이 아닌 모든 값(0 포함) → true → 저장
  ```
- cables INSERT: `cb.start_point||''` → `cb.start_point != null ? cb.start_point : ''`
  - 0이 빈 문자열로 저장되던 버그 수정
- request body 수신 로그 추가

#### `src/routes/work-reports.ts` — D1 라우트 정리
- lines INSERT 블록 전체 제거
- cables INSERT: 동일 패턴으로 hasData + null 처리 수정
- extras (cable_sets) 저장 로직 신규 추가

### 수정 파일
| 파일 | 수정 내용 |
|------|-----------|
| `public/static/app.js` | 작업내역 섹션 삭제, cables 수집 null 처리, lines 수집 제거 |
| `node-server.ts` | lines INSERT 제거, cables hasData+null 수정, 로그 추가 |
| `src/routes/work-reports.ts` | lines INSERT 제거, cables 수정, extras 추가 |

### 롤백 정보
- **안전 커밋**: `c90536a` (BUG-016)
- **롤백 태그**: `rollback/pre-bugfix-017`
- **롤백 명령**:
  ```bash
  git push origin c90536a:main --force
  # NAS:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  ```

### ⚠️ NAS 반영 명령
```bash
cd /volume1/safetynote
git pull origin main
pm2 restart safetynote
```

---

## [BUG-018] 케이블 저장 버그 완전 해결 — spec REAL 타입 문제 (2026-06)

### 증상
- 케이블 정보(LOT NO, 규격, 제조사, 시작점 등) 작성 후 저장/제출 시
  성공 메시지는 뜨지만 DB에 케이블 데이터가 저장되지 않음

### 근본 원인 (BUG-017에서 미해결 부분)

#### 원인 1 ★★★ — `work_report_cables.spec` 컬럼 타입이 `REAL`
```sql
-- 기존 DDL (잘못됨)
spec REAL DEFAULT 0
-- 프론트에서 '1C', '12C', '72C' 같은 문자열 전송
-- SQLite: REAL 컬럼에 문자열 → 0.0으로 변환 (저장은 됨)
-- 실제 영향: spec 값이 무조건 0으로 저장되어 표시 불가
```

#### 원인 2 — `proc`, `remark` 컬럼 누락
- 기존 NAS DB: `work_report_cables`에 `proc`, `remark` 컬럼 없음
- safeAlter로 추가 코드는 있었으나 **NAS pm2 restart 전** 상태라면 미적용
- INSERT 시 없는 컬럼에 바인딩 → `table work_report_cables has no column named proc` 에러
- 에러는 try-catch로 무시되어 성공 응답이 반환됨 → "저장됐는데 안 보임" 현상

#### 원인 3 — 테이블 재생성 없이는 `spec REAL → TEXT` 변환 불가
- SQLite는 `ALTER TABLE ... MODIFY COLUMN` 지원 안 함
- 기존 NAS DB에서 `spec REAL`을 `TEXT`로 바꾸려면 테이블 재생성 필요

### 수정 내용

#### `node-server.ts` — patchSchema 테이블 재생성 로직
1. **DDL 수정**: `CREATE TABLE IF NOT EXISTS work_report_cables` — `spec REAL` → `spec TEXT`, `proc/remark` 컬럼 기본 포함
2. **테이블 재생성**: patchSchema 실행 시 DDL에 `spec REAL` 또는 `proc` 누락 감지하면 자동 재생성
   - 기존 데이터 보존 (`INSERT INTO ... SELECT ... CAST(spec AS TEXT)`)
   - 트랜잭션으로 안전하게 처리
3. **INSERT 안정화**:
   - `specVal = cb.spec != null ? String(cb.spec) : ''` — 타입 명확화
   - `sp = String(cb.start_point)`, `ep = String(cb.end_point)` — TEXT 컬럼에 맞게
   - hasData 조건 간결화

### 수정 파일
| 파일 | 수정 내용 |
|------|-----------|
| `node-server.ts` | `work_report_cables` DDL에 `spec TEXT` + `proc/remark` 추가; patchSchema에 테이블 재생성 로직; INSERT specVal TEXT 처리 |

### 롤백 정보
- **안전 커밋**: `00f80c4` (BUG-017)
- **롤백 태그**: `rollback/pre-bugfix-018`
- **롤백 명령**:
  ```bash
  git push origin 00f80c4:main --force
  # NAS:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  ```

### ⚠️ NAS 반영 명령 (필수 — pm2 restart로 patchSchema 자동 실행)
```bash
cd /volume1/safetynote
git pull origin main
pm2 restart safetynote
# 확인: 로그에 "[patchSchema] work_report_cables 재생성 완료" 표시 확인
tail -20 /root/.pm2/logs/safetynote-out.log | grep -i "patchSchema\|cables"
```

### ⚠️ patchSchema 실행 확인 방법
```bash
# NAS에서 직접 DB 컬럼 확인
node -e "
const db = require('better-sqlite3')('/volume1/safetynote/data/safety.db');
console.log(db.prepare(\"SELECT sql FROM sqlite_master WHERE name='work_report_cables'\").get());
db.close();
"
# spec TEXT, proc TEXT, remark TEXT 가 포함되어야 정상
```

---

## [BUG-019] extras(추가입력) 복원 버그 — extrasMap HTML value= 직접 주입 (2026-06)

### 증상
- 외선일보 임시저장 후 폼 재로드 시 추가입력(extras) 항목 값이 복원되지 않음
- DB에는 저장되어 있으나 UI에 표시 안 됨

### 근본 원인
- `mkCableSetHTML` 함수가 `extrasData` 파라미터를 받지 않아 extrasMap이 빈 객체
- 기존 JS 복원 루프가 DOM 렌더링 타이밍 불일치로 동작 불안정

### 수정 내용
- `mkCableSetHTML(n, cableData, extrasData)` — 세 번째 파라미터 추가
- `extrasMap = {}` 를 extrasData에서 구성 후 HTML value= 직접 주입
- 기존 JS extras 복원 루프 제거 (HTML value= 방식으로 대체)
- 서버 extras INSERT 로그 및 에러 처리 강화

### 수정 파일
| 파일 | 수정 내용 |
|------|-----------|
| `public/static/app.js` | mkCableSetHTML extrasData 파라미터 추가 + extrasMap HTML value 직접 주입 |
| `node-server.ts` | extras INSERT 로그/에러처리 강화 |

### 롤백 정보
- **롤백 태그**: `rollback/pre-bugfix-019`
- **안전 커밋**: `f38dc96` (BUG-018 수정 후)

---

## [BUG-020] 외선일보 저장 전체 미동작 — 근본 원인 분석 및 수정 (2026-06)

### 증상
- 외선일보 임시저장/제출 시 성공 메시지는 뜨지만 실제 DB 저장 안 됨
- extras (추가입력) 최신 report에 전혀 없음 (DB 확인)
- 케이블 spec이 '0.0'으로 저장된 오염 데이터 존재 (report_id 7, 8)
- PM2 로그에 `[WR-POST]` 출력 없음 → NAS 미반영 상태 확인

### 근본 원인

#### 원인 1 ★★★ — NAS 미반영 (가장 직접적 원인)
- `pm2 restart` 없이 구버전 코드 실행 중
- `[WR-POST]` 로그 미출력으로 확인
- **해결**: NAS에서 `git pull origin main && pm2 restart safetynote` 필수

#### 원인 2 — `spec: '0.0'` 오염 데이터 — hasData 조건 우회
- `spec REAL→TEXT` 마이그레이션(BUG-018) 이전 데이터: `'1C'→0→CAST→'0'` 또는 `'0.0'`
- 구버전 hasData: `cb.spec`이 `'0.0'`이면 truthy → 빈 행으로 저장됨
- UI 복원 시: SPEC_OPTS에 `value="0.0"` 없음 → selected 불일치 → 빈값 표시

#### 원인 3 — extras key 필드명 불일치 가능성
- 프론트: `extras.push({ key, qty })` → `ex.key`
- 서버: `ex.key || ex.item_key` 모두 지원하도록 방어코드 추가

### 수정 내용

#### `node-server.ts`
1. **hasData 강화**: `spec '0.0'` / `'0'` 은 오염값이므로 hasData 판정 제외
   ```typescript
   const specVal = cb.spec != null ? String(cb.spec) : ''
   const specHasData = !!(specVal && specVal !== '0' && specVal !== '0.0')
   const hasData = !!(cb.lot_no || cb.maker || cb.cable_kind || cb.proc || cb.remark ||
                      specHasData || ...)
   ```
2. **specNorm 정규화**: `'0.0'`, `'0'` → `''` 변환 후 저장
3. **extras 로그 강화**: `ex.key || ex.item_key` 지원, 저장 건별 로그, 배열 타입 체크

#### `public/static/app.js`
1. **mkCable spec 복원 정규화**: `cb.spec === '0.0'` / `'0'` → `''` 처리
   ```javascript
   const cbSpec = (cb.spec && cb.spec !== '0.0' && cb.spec !== '0') ? cb.spec : '';
   ```

### 수정 파일
| 파일 | 수정 내용 |
|------|-----------|
| `node-server.ts` | hasData spec 오염값 제외; specNorm 정규화; extras 로그 강화 + key/item_key 방어 |
| `public/static/app.js` | mkCable cbSpec 정규화 ('0.0'→'') |

### 롤백 정보
- **롤백 태그**: `rollback/pre-bugfix-020-final` (= 커밋 `a849e37`)
- **롤백 명령**:
  ```bash
  git push origin a849e37:main --force
  # NAS:
  cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
  ```

### ⚠️ NAS 반영 필수 명령
```bash
cd /volume1/safetynote
git pull origin main
pm2 restart safetynote
# 확인: 외선일보 저장 후 로그에 [WR-POST] 출력 확인
pm2 logs safetynote --nostream | grep "\[WR-POST\]" | tail -20
```

### ⚠️ DB 오염 데이터 정리 (선택 — report_id 7, 8)
```bash
# NAS에서 직접 실행 (오염된 빈 cables 행 삭제)
node -e "
const db = require('better-sqlite3')('/volume1/safetynote/data/safety.db');
// spec이 '0.0'이고 다른 모든 필드도 비어있는 오염 행 삭제
const result = db.prepare(\"DELETE FROM work_report_cables WHERE spec='0.0' AND lot_no='' AND maker='' AND cable_kind='' AND proc='' AND remark='' AND usage_m=0\").run();
console.log('삭제된 오염 행 수:', result.changes);
db.close();
"
```

---

## [BUG-020b] work_report_extras FK 오염 — extras 저장 에러 완전 해결 (2026-06)

### 증상
BUG-020 패치(`86fe9b0`) NAS 적용 후:
```
[work-reports POST] extras 저장 실패: no such table: main.work_reports_old
```
케이블은 저장되나 extras(추가입력)만 저장 실패.

### 근본 원인
NAS DB 내부의 `work_report_extras` 테이블 DDL이 아래와 같이 오염되어 있었음:
```sql
-- 오염 상태 (NAS DB)
FOREIGN KEY (report_id) REFERENCES work_reports_old(id) ON DELETE CASCADE
--                                  ^^^^^^^^^^^^^^^^ 잘못된 참조
```
이전 patchSchema에서 `work_reports` RENAME 작업이 중간에 실패하여
`work_reports_old` 잔해가 남은 상태에서 `work_report_extras`가 생성됨.
`CREATE TABLE IF NOT EXISTS`는 기존 테이블을 건드리지 않으므로 이후 재시작에서도 수정 안 됨.

### 수정 내용 (`node-server.ts` — patchSchema)
```typescript
// work_report_extras DDL에 'work_reports_old' 참조 감지 시 자동 재생성
const extrasDDL = rawDb.prepare(`SELECT sql FROM sqlite_master WHERE name='work_report_extras'`).get()?.sql || ''
if (extrasDDL.includes('work_reports_old')) {
  // BEGIN; ... 재생성 ... COMMIT; (기존 데이터 보존)
}
```
`pm2 restart` 한 번으로 자동 수리됨. 기존 extras 데이터 전량 보존.

### 커밋
- `4bcc5f6` — fix: BUG-020 work_report_extras FK 오염 자동 수정

### 결과
- extras(추가입력) 저장 ✅ 정상 확인
- 외선일보 케이블 + extras 전체 저장/복원 ✅ 완전 해결

---

## [FEAT-021] 공량내역 화면 헤더 가로 표시 + 컬럼 너비 드래그 조절 (2026-06)

### 배경
- 이전: 공종 컬럼 헤더가 `writing-mode:vertical-rl`로 세로 표시 → 뒤집힘 버그 발생
- 요청 1: 헤더를 세로 대신 가로 1~2줄로 표시
- 요청 2: 각 컬럼 너비를 엑셀처럼 드래그로 조절하고 저장

### 수정 내용 (`public/static/app.js`)

#### 헤더 표시 방식 변경
- `writing-mode:vertical-rl` 완전 제거
- `word-break:keep-all; white-space:normal; line-height:1.25` 적용 → 2자 이내 짧은 라벨은 1줄, 긴 이름은 자동 2줄 줄바꿈
- 테이블 레이아웃: `table-layout:fixed` + 각 컬럼 기본 너비(px) 고정

#### 컬럼 너비 드래그 리사이즈 (엑셀 방식)
- 각 `<th>`의 오른쪽 경계에 5px 투명 드래그 핸들 추가 (cursor:col-resize)
- `_frResizeStart / _frResizeMove / _frResizeEnd` 3단계 이벤트로 구현
- 드래그 중 세로 가이드라인(보라색 1px 선) 표시
- 너비 변경 시 `<tbody>/<tfoot>`의 동일 `data-col-idx` td도 즉시 동기화
- **저장**: `localStorage['fr_cable_col_widths']`, `localStorage['fr_splice_col_widths']` (JSON 객체)
- **복원**: 페이지 재진입 시 저장된 너비 자동 적용
- **초기화**: `_frResetColWidths('cable'|'splice')` → localStorage 삭제 후 페이지 재렌더

#### 하단 상태 바 개선
- 숨김 컬럼 있음 → 기존 표시 유지
- 너비 조정됨 → 새 표시 + "너비 초기화" 버튼 추가
- 안내 문구 변경: "헤더 경계를 드래그해 컬럼 너비 조절 가능"

### localStorage 키 목록
| 키 | 내용 |
|----|------|
| `fr_cable_hidden_cols` | 외선 숨김 컬럼 인덱스 배열 |
| `fr_cable_col_widths`  | 외선 컬럼 너비 맵 `{ci: px}` |
| `fr_splice_hidden_cols`| 접속 숨김 컬럼 인덱스 배열 |
| `fr_splice_col_widths` | 접속 컬럼 너비 맵 `{ci: px}` |

### 롤백 태그
- `rollback/pre-feat-volume-ui-v2` → FEAT-021 적용 직전 상태

### 커밋
- `73dfdb2` — fix: 공량내역 헤더 글씨 뒤집힘 수정 (rotate 제거)
- `4e59464` — feat: 공량내역 헤더 가로 표시 + 컬럼 너비 드래그 조절 (FEAT-021)

---

## [FEAT-022] 공량내역 완전 재작성 — 조회 기준 일치화 + renderFieldReportPage 복원 (2026-06-17)

### 배경
- FEAT-021 구현 중 Python 스크립트 교체 작업이 불완전하게 완료됨
  - `renderFieldReportPage`의 `container.innerHTML` 템플릿이 25193번 줄에서 잘림
  - 외선 테이블이 전혀 렌더링되지 않는 심각한 버그
- 조회 기준이 외선/접속 탭별로 분리되어 있어 불편함
- 브라우저 캐시로 인해 이전 변경사항이 미반영

### 근본 원인
```
container.innerHTML = `...
  <div id="fr-cable-section" ...>
  ← 여기서 잘림 (25193줄) → 이후 줄에 _frUpdatePeriodUI 함수가 이어짐
```
→ 이전 Python 교체 스크립트의 `end_marker` 감지 오류로 발생

### 수정 내용

#### 1. `renderFieldReportPage` 완전 재작성
- `container.innerHTML` 완전한 구조 복원 (공유 조회 바 + 탭 버튼 + 외선 섹션 + 접속 섹션)
- 외선 테이블 HTML 빌드 로직을 함수 내부에 완전히 포함 (cableTableHTML 변수)
- 가로 1~2줄 헤더 (`word-break:keep-all`), 드래그 리사이즈 핸들 정상 포함
- 조건부 렌더링: rows.length === 0 시 "데이터 없음" 메시지

#### 2. 공유 단일 조회 바 구현
- **ID 통일**: `fr-period-mode`, `fr-period-week`, `fr-period-month`, `fr-period-year`, `fr-period-quarter`, `fr-construction`
- 주간/월간/분기/연간/전체 5가지 모드
- 탭(외선/접속) 전환과 무관하게 동일 조회 조건 적용

#### 3. `_frUpdatePeriodUI()` week 모드 추가
```javascript
const weekInp = document.getElementById('fr-period-week');
if (weekInp) weekInp.classList.toggle('hidden', mode !== 'week');
// year 셀렉터: month/week/all 제외
if (yearSel) yearSel.classList.toggle('hidden', mode === 'month' || mode === 'week' || mode === 'all');
```

#### 4. `_frLoadSpliceStats()` 공유 ID 적용
```javascript
// 구 ID (제거)
document.getElementById('fr-splice-period-mode')
document.getElementById('fr-splice-construction')
// → 공유 ID (적용)
const { from: fromDate, to: toDate } = _frCalcDateRange();  // 공통 헬퍼
const consVal = document.getElementById('fr-construction')?.value || '';
```

#### 5. `_frSplicePeriodUI()` 함수 제거
- 접속 탭 전용 조회 바가 삭제되어 더 이상 불필요

#### 6. `node-server.ts` 캐시 버전 업데이트
- `v=20260614a` → `v=20260617b` (3곳)

### 롤백 태그
| 태그 | 커밋 | 설명 |
|------|------|------|
| `rollback/pre-feat-volume-ui-v4` | `4e59464` | FEAT-022 적용 직전 |
| `rollback/pre-feat-volume-ui-v3` | `4e59464` | (동일) FEAT-021 커밋 직후 |
| `rollback/pre-feat-volume-ui-v2` | `73dfdb2` | 헤더 뒤집힘 수정 전 |
| `rollback/pre-feat-volume-ui`    | `fbc7631` | 공량내역 UI 수정 전 |

### 커밋
- `d90f02f` — feat: 공량내역 완전 재작성 (FEAT-022)

---

## [FEAT-023] 모바일 팝업 전체화면 전환 (2026-06-17)

### 증상 (3가지)
1. 모바일 접속 시 팝업 상단이 `top-header`(56px)에 가려짐
2. 닫기(✕) 버튼이 헤더 뒤에 숨어 클릭 불가
3. 팝업 내 스크롤 시 팝업이 닫히는 문제

### 원인 분석
기존 모바일 모달 방식: `bottom-sheet` (하단에서 올라오는 슬라이드, `max-height:92vh`)
- `top-header` z-index:1100 이 모달(1000)보다 높아 헤더 아래쪽 영역은 정상이나,
  모달 상단이 헤더 높이(56px) 아래에서 시작하지 않고 `top:0`에서 시작하는 문제
- `overscroll-behavior` 미설정 → 모달 내 스크롤이 배경(`modal-overlay`)으로 전파
- 모달 닫기 버튼(`font-size:xl ~24px`)이 터치 타겟 44px 미달

### 기존 패턴 재발 방지
- **[BUG-005]**: `modal-overlay` z-index 충돌로 인한 헤더 가려짐 → `top-header z-index:1100` 이미 적용됨
  → 이번 FEAT-023은 z-index 문제가 아닌 **모달 시작 위치(top:0 → top:56px) 문제**임을 구분할 것
- 닫기 버튼 CSS(`modal-header > button:last-child`)로 44px 터치 타겟 보장 — 신규 모달 추가 시 `modal-header` 구조 준수

### 해결

#### 1. `style.css` — 모바일 미디어쿼리 내 모달 블록 전면 교체

**업무 모달 (기본 동작):**
```css
/* 모달 시작: top-header(56px) 아래에서 시작 */
.modal-overlay {
  align-items: flex-start !important;
  justify-content: flex-start !important;
  padding: 0 !important;
  top: 56px !important;           /* ← 핵심: 헤더 아래에서 시작 */
  background: rgba(0,0,0,0) !important;   /* dim 제거 */
  backdrop-filter: none !important;
}
.modal {
  height: calc(100dvh - 56px) !important;  /* 헤더 아래 전체 높이 */
  overscroll-behavior: contain;   /* 스크롤 배경 전파 차단 */
}
.modal-header {
  position: sticky !important;   /* 헤더가 스크롤 따라 사라지지 않음 */
  top: 0 !important;
}
/* 닫기 버튼 44×44px 터치 타겟 */
.modal-header > button:last-child,
.modal-header button[onclick*="remove"] {
  min-width: 44px !important; min-height: 44px !important;
}
```

**소형 확인 팝업 예외 (`modal-sm`):**
```css
.modal-overlay.modal-sm {
  align-items: center !important;
  justify-content: center !important;
  top: 0 !important;             /* ← 중앙 팝업: top:0 유지 */
  background: rgba(0,0,0,0.5) !important;
}
.modal-overlay.modal-sm .modal {
  max-width: 420px !important;
  height: auto !important;       /* ← 자동 높이 */
  border-radius: 20px !important;
}
```

#### 2. `app.js` — 소형 모달 29곳 `modal-sm` 클래스 추가 (Python으로 일괄 처리)

`modal-sm` 적용 목록 (확인 팝업, 선택 팝업 등 소형):
- `getGPSAddressWithConsent` GPS 동의 모달
- `showGpsPermissionModal` GPS 권한 모달
- `showMapModal` 지도 선택 모달 (max-width:360px)
- `submitSelfRegister` 성공 알림 모달
- `showAddWorkerModal` 작업자 추가 모달
- `showConfirmDialog` 범용 확인 다이얼로그
- `showChangeWorkClassModal` 작업분류 변경 모달
- `confirmWorkComplete` 작업완료 확인 모달
- `selfAssignTask` 자기배정 확인 모달
- `changeTaskStatus` 상태변경 확인 모달
- `deleteAttachment` 첨부파일 삭제 확인
- `showPhotoData` / `showVideoData` 미디어 뷰어
- `deleteMedia` 미디어 삭제 확인
- TBM 관련 소형 확인 팝업 (서명요청, 외 다수)

**`modal-sm` 적용 기준:**
- `max-width ≤ 420px` → modal-sm
- `max-width ≥ 500px` 또는 복잡한 폼 → 전체화면 (showTaskDetail 등)

#### 3. `app.js` — 전역 touchmove 이벤트 추가 (배경 직접 터치 시 스크롤 전파 차단)
```javascript
document.addEventListener('touchmove', function(e) {
  const overlay = e.target.closest('.modal-overlay');
  if (!overlay) return;
  if (overlay.classList.contains('modal-sm')) return;  // 소형 팝업 제외
  if (e.target === overlay) {
    e.preventDefault();  // overlay 배경 직접 터치 → 스크롤 차단
  }
}, { passive: false });
```

#### 4. `node-server.ts` — 캐시 버전 업데이트
- `v=20260617b` → `v=20260617c` (3곳: style.css, app.js, mobile-app.js)

### 롤백 태그
| 태그 | 커밋 | 설명 |
|------|------|------|
| `rollback/pre-feat-mobile-modal-v2` | `ffd904a` | FEAT-023 적용 직전 (FEAT-022 완료 후) |
| `rollback/pre-feat-mobile-modal`    | `ffd904a` | (동일) FEAT-023 첫 시도 직전 |

**롤백 명령:**
```bash
git push origin ffd904a:main --force
# NAS:
cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
```

### 커밋
- `cd91c24` — feat: 모바일 팝업 전체화면 전환 (FEAT-023)

---

## [FEAT-024] 모바일 터치 스크롤 시 팝업 닫힘 방지 (2026-06-17)

### 증상
- 모바일 전체화면 모달(대형 팝업) 내부에서 아래로 터치 스크롤 시 팝업이 닫혀버림
- 닫기(✕) 버튼을 누르지 않았는데도 팝업이 사라지는 문제

### 원인
- 모바일에서 터치 스크롤 후 손가락을 떼면 브라우저가 `click` 이벤트를 발생시킴
- 이 `click`의 `e.target`이 `.modal-overlay`(배경 영역)와 일치하면 `e.target === modal` 조건 충족
- 기존 패턴 `modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); })` 7개소 전체에서 발생

### 해결
#### 1. `_isMobileFullscreen(overlay)` 헬퍼 추가
```javascript
function _isMobileFullscreen(overlay) {
  return !overlay.classList.contains('modal-sm') && window.innerWidth <= 768;
}
```
- `modal-sm` 클래스가 없고 화면 너비 ≤ 768px → 모바일 전체화면 모달로 판단

#### 2. `addOverlayClickClose(overlay, closeFn)` 헬퍼 추가
```javascript
function addOverlayClickClose(overlay, closeFn) {
  overlay.addEventListener('click', function(e) {
    if (e.target !== overlay) return;
    if (_isMobileFullscreen(overlay)) return;  // 모바일 전체화면 → 닫힘 차단
    closeFn();
  });
}
```
- 모바일 전체화면 모달: overlay 직접 클릭으로도 닫히지 않음 (✕ 버튼만 동작)
- `modal-sm` 소형 팝업: 기존과 동일하게 overlay 클릭으로 닫힘

#### 3. `_touchScrolling` 플래그 + 전역 이벤트 핸들러 추가
```javascript
let _touchStartY = 0;
let _touchScrolling = false;

document.addEventListener('touchstart', ...) // _touchScrolling = false 리셋
document.addEventListener('touchmove', ...)  // dy > 5px → _touchScrolling = true
document.addEventListener('click', ..., true) // capture 단계에서 스크롤 후 click 차단
```
- 스크롤 중 발생한 `click` 이벤트를 capture 단계에서 `stopImmediatePropagation()`으로 원천 차단

#### 4. 7개소 overlay click 패턴 → `addOverlayClickClose()` 교체
| 모달 | 라인 | modal-sm |
|------|------|----------|
| showMapModal | L.1059 | ✅ |
| showNavigationWarning | L.2771 | ✅ (이번에 추가) |
| showConfirmDialog | L.5625 | ✅ |
| 통계 완료작업 목록 | L.13109 | ❌ (대형) |
| 점검 목록 | L.13622 | ❌ (대형) |
| wsPhotoModal | L.22619 | ✅ |
| APK 업데이트 | L.24923 | ❌ (대형) |

#### 5. `showNavigationWarning` — `modal-sm` 클래스 추가
- 소형 확인 팝업이지만 `modal-sm` 누락 → 이번에 추가

#### 6. `node-server.ts` 캐시 버전 업데이트
- `v=20260617c` → `v=20260617d` (3곳: style.css, app.js, mobile-app.js)

### 주의 사항 (재발 방지)
- **신규 모달 추가 시**: 반드시 `addOverlayClickClose(overlay, closeFn)` 사용
  - 소형 확인팝업 → `modal-sm` 클래스 추가 필수
  - 대형 모달 → `modal-sm` 없이 `addOverlayClickClose` 사용 → 자동으로 모바일 닫힘 차단
- **직접 click 이벤트 등록 금지**: `modal.addEventListener('click', e => ...)` 패턴은 사용하지 말 것

### 롤백 태그
| 태그 | 커밋 | 설명 |
|------|------|------|
| `rollback/pre-feat-024` | `b7a0801` | FEAT-024 적용 직전 (FEAT-023 완료 후) |

**롤백 명령:**
```bash
git push origin b7a0801:main --force
# NAS:
cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
```

### 커밋
- `06d793a` — fix: 모바일 터치 스크롤 시 팝업 닫힘 방지 (FEAT-024) — JS 플래그 방식 (실기기 미적용)
- `2103642` — fix: overlay pointer-events:none CSS 방식으로 근본 차단 (FEAT-024 재수정)

### 실기기 피드백 및 재수정 이력
- **1차 구현** (`06d793a`): JS `_touchScrolling` 플래그 + capture click 차단 → 실기기 미적용
  - **실패 원인**: touchmove의 e.target이 내부 스크롤 요소일 경우 overlay 감지 불가. 내부 콘텐츠 스크롤 중 손가락이 overlay 영역에 닿으면 여전히 click 이벤트 발생
- **2차 구현** (`2103642`): CSS `pointer-events: none` 방식으로 전환
  - `.modal-overlay { pointer-events: none }` → overlay 배경 터치/클릭 원천 차단
  - `.modal-overlay > * { pointer-events: auto }` → 내부 콘텐츠 정상 동작
  - `.modal-overlay.modal-sm { pointer-events: auto }` → 소형 팝업 overlay 클릭 닫힘 허용
  - `node-server.ts` 캐시 버전 `v=20260617d` → `v=20260617e`

### ⚠️ 재발 방지 (CSS 방식이 JS 방식보다 우선)
- 모바일 전체화면 모달의 overlay 닫힘 차단은 **CSS `pointer-events: none`이 유일하게 확실한 방법**
- JS 이벤트 플래그 방식은 `e.target` 불일치로 인해 모바일 실기기에서 미동작 가능
- `modal-sm` 예외 처리는 CSS `pointer-events: auto` 복원으로 처리

---

## [BUG-006] APK 다운로드 실패 — ReferenceError: Log is not defined (2026-06-17)

### 증상
- 로그인 화면 APK 다운로드 버튼 클릭 시 "다운로드 중입니다" 토스트는 표시
- 실제 APK 파일 다운로드 미실행
- DevTools 콘솔: `ReferenceError: Log is not defined at doApkDownload`

### 원인

#### 1. `Log` 미선언 변수 참조 (주원인)
- `doApkDownload()` 내부: `Log && Log.d && Log.d(...)` 패턴
- `Log`는 Capacitor 네이티브 앱 환경의 Java 브릿지 객체 — 일반 브라우저에 미존재
- JS에서 `선언되지 않은 변수 && ...` 평가 시 → `ReferenceError` throw → 함수 즉시 중단
- 결과: `localStorage` 저장 후 다운로드 실행 코드(`window.open` 등)에 도달 불가

#### 2. `window.open(_blank)` 방식의 팝업 차단 문제
- 브라우저 팝업 차단 시 `null` 반환 → fallback으로 `window.location.href = url` 실행
- 로그인 페이지가 APK URL로 이동 → 화면 전환 발생

### 해결
```javascript
// 수정 전 (ReferenceError 발생)
Log && Log.d && Log.d('doApkDownload', 'installed version → ' + newVersion);

// 수정 후 (typeof로 안전하게 체크)
typeof Log !== 'undefined' && Log.d && Log.d('doApkDownload', 'installed version → ' + newVersion);
```

- 다운로드 방식: `window.open(_blank)` → `<a download>` 태그 방식으로 변경
  - 팝업 차단 영향 없음
  - 페이지 이동(location.href) 없음
  - 클릭 즉시 다운로드 시작

#### 서비스워커 에러 (부수 에러)
- `service-worker.js:84 TypeError: Failed to execute 'clone' on 'Response': Response body is already used`
- NAS에 남아있는 구버전(v9) 서비스워커 캐시 문제
- 현재 서비스워커는 `res.clone()` 올바르게 사용 중 — 버전을 v9 → v10으로 올려 강제 갱신

### ⚠️ 재발 방지
- **Capacitor 전용 API(`Log`, `StatusBar`, `Haptics` 등)**: 반드시 `typeof XXX !== 'undefined'` 로 체크
- `Log && ...` 패턴은 선언되지 않은 변수에서 ReferenceError 발생 — 절대 사용 금지
- APK 다운로드는 `<a download>` 방식 사용 (window.open 방식 사용 금지)

### 커밋
- `d51f355` — fix: APK 다운로드 ReferenceError(Log) + 다운로드 방식 개선 + 서비스워커 v10
