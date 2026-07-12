# SafetyNOTE 버그픽스 기록

> 코드 수정 전 반드시 이 파일을 확인할 것.
> 동일 에러 재발 방지 및 NAS 듀얼 구조 이해를 위한 핵심 기록.

---

## 🚀 [최우선] 배포 방식 (반드시 먼저 확인)

> ⚠️ 코드 수정 후 NAS 반영은 **항상 방식1(업데이트 버튼)을 먼저 시도**한다.
> 방식2(NAS 직접 적용)는 방식1이 실패했을 때만 사용하는 긴급 우회 수단이다.

---

### ✅ 방식1: 표준 배포 — 업데이트 버튼 사용 (기본)

```
[개발서버]
1. 코드 수정 완료
2. git add .
3. git commit -m "feat/fix: 변경 내용 설명"
4. git push origin main         ← GitHub에 업로드

[NAS 브라우저]
5. 시스템설정 → 서버 업데이트 탭 접속
6. [버전 확인] 버튼 클릭         ← git fetch origin main 실행
7. 새 버전 확인 후 비밀번호 입력
8. [업데이트 적용] 버튼 클릭     ← 자동 순서 실행:
   ① git reset --hard origin/main
   ② npm run build
   ③ pm2 restart safetynote
9. 완료 후 브라우저 새로고침 (Ctrl+F5)
```

**주의사항**
- NAS branch가 `master`여도 업데이트 버튼은 `origin/main`을 직접 참조 → 정상 동작
- `ensureCorrectRemote()` 함수가 remote URL 자동 교정 (구버전 URL 감지 시 자동 수정)
- GitHub Token은 remote URL에 포함됨: `https://ghp_...@github.com/gisubhan-droid/safetynote-server.git`

---

### ⚠️ 방식2: 긴급 우회 — NAS 직접 적용 (방식1 실패 시만 사용)

> 방식1이 동작하지 않을 때만 사용. git 이력에 반영되지 않으므로 이후 방식1 업데이트 시 덮어씌워짐.

```bash
# NAS SSH 접속 후 python3 스크립트 실행
python3 << 'EOF'
import shutil
shutil.copy(
    '/volume1/safetynote/public/static/app.js',
    '/volume1/safetynote/dist/static/app.js'
)
print("복사 완료")
EOF

# PM2 재시작
pm2 restart safetynote
```

**방식2 사용 후 반드시 처리**
- 동일 내용을 개발서버에도 반영 → git commit → git push → 방식1로 NAS 재동기화

---

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

## [BUG-002] 사진 탭 그룹 표시 미반영 ✅ 완료 (2026-06-17, `b245c84`)

### 증상
- `photo_type + caption` 기준 2단계 그룹 표시가 실제 앱에서 미반영
- `public/static/app.js` 수정했으나 사용자 확인 결과 미반영

### 관련 파일
- `src/utils.ts` — `PHOTO_TYPE_DIRS`, `captionToFolderName()`, `buildStoragePath()`
- `src/routes/photos.ts` — `buildStoragePath` 호출에 `photoType+caption` 전달
- `public/static/app.js` — 사진 탭 UI (photo_type+caption 2단계 그룹핑)

### 상태
- ~~**미해결** — 별도 세션에서 재수정 필요~~
- ✅ **완료** — 커밋 `b245c84` (2026-06-17) 에서 최종 수정 완료
- 상세 내용은 하단 **[BUG-002] 사진 탭 그룹 표시 미반영 — 최종 수정** 항목 참조

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

## [FEAT-024] 모바일 터치 스크롤 시 팝업 닫힘 방지 (2026-06-17) ✅ 실기기 확인 완료

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
| `rollback/pre-feat-024` | `b7a0801` | FEAT-024 전체 작업 직전 (FEAT-023 완료 후) — 가장 안전한 완전 롤백 |
| `rollback/pre-feat-024-v4` | `4008cfc` | FEAT-024 v4 적용 직전 (v3까지 적용된 상태) |

**롤백 명령 (전체 롤백 — FEAT-023 완료 상태로):**
```bash
git push origin b7a0801:main --force
# NAS:
cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
```

**롤백 명령 (v4만 롤백 — v3 상태로):**
```bash
git push origin 4008cfc:main --force
# NAS:
cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
```

### 커밋
- `06d793a` — fix: 모바일 터치 스크롤 시 팝업 닫힘 방지 (FEAT-024) — JS 플래그 방식 (실기기 미적용)
- `2103642` — fix: overlay pointer-events:none CSS 방식으로 근본 차단 (FEAT-024 재수정)
- `4008cfc` — fix: 모바일 전체화면 모달 스와이프 닫기 차단 (FEAT-024 근본 원인 수정) (실기기 미적용)
- `e531fc2` — fix: FEAT-024 v4 — modal-sm 여부만으로 스와이프 닫기 완전 차단 ← **최신 ✅ NAS 반영 + 실기기 확인 완료 (2026-06-17)**

### 실기기 피드백 및 재수정 이력
- **1차 구현** (`06d793a`): JS `_touchScrolling` 플래그 + capture click 차단 → 실기기 미적용
  - **실패 원인**: touchmove의 e.target이 내부 스크롤 요소일 경우 overlay 감지 불가. 내부 콘텐츠 스크롤 중 손가락이 overlay 영역에 닿으면 여전히 click 이벤트 발생
- **2차 구현** (`2103642`): CSS `pointer-events: none` 방식으로 전환
  - `.modal-overlay { pointer-events: none }` → overlay 배경 터치/클릭 원천 차단
  - `.modal-overlay > * { pointer-events: auto }` → 내부 콘텐츠 정상 동작
  - `.modal-overlay.modal-sm { pointer-events: auto }` → 소형 팝업 overlay 클릭 닫힘 허용
  - `node-server.ts` 캐시 버전 `v=20260617d` → `v=20260617e`
  - **실기기 미적용** — `mobile-app.js` touchend 스와이프 닫기 코드가 여전히 동작
- **3차 구현** (`4008cfc`): `mobile-app.js` touchend 핸들러에 `isMobileFullscreen` 조건 추가
  - `isMobileFullscreen = !top.classList.contains('modal-sm') && window.innerWidth <= 768`
  - 전체화면 모달이면 early return
  - 캐시 버전 `v=20260617h` → `v=20260617i`
  - **실기기 미적용** — `window.innerWidth <= 768` 조건 실패 가능성 + `e.target.closest('.modal-body')` null 반환 경로 미차단
  - **실패 원인 분석**: `.modal-body` 밖 요소(헤더·탭 버튼·sticky 영역)를 터치할 때 `sb`가 `null` → `!sb` 조건 true → 닫힘 여전히 발동. `window.innerWidth` 조건도 기기/브라우저 따라 실패 가능
- **4차 구현** (`e531fc2`): `modal-sm` 여부만으로 완전 차단 — **근본 해결**
  - `if (!top.classList.contains('modal-sm')) return;` 단 1줄
  - `window.innerWidth` 조건 제거 (기기 해상도/논리픽셀 차이 무관)
  - `e.target` 위치 판단 완전 제거 (헤더·탭·body·footer 어디 터치해도 차단)
  - `modal-sm` 소형 확인팝업만 기존 스와이프 닫기 동작 유지
  - 캐시 버전 `v=20260617i` → `v=20260617j`

### ⚠️ 재발 방지 (최종 정리)
- **CSS `pointer-events: none`**: overlay 배경 직접 클릭/탭 차단 (overlay layer 이벤트 무력화)
- **JS touchend `modal-sm` 조건**: `mobile-app.js` 스와이프 닫기 완전 차단
  - `e.target` 위치 판단은 절대 사용 금지 → `.modal-body` 밖 요소 터치 시 null 반환
  - `window.innerWidth` 조건은 절대 사용 금지 → 기기/브라우저 차이로 실패 가능
- `modal-sm` 소형 확인팝업만 스와이프·overlay 클릭 닫기 허용 (CSS + JS 동일 예외 처리)

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

---

## [BUG-002] 사진 탭 그룹 표시 미반영 — 최종 수정 (2026-06-17)

### 재분석 결과 (Phase 1 안정화 세션)

기존 BUGFIX_LOG에 "미해결"로 기록되어 있었으나 실제 원인 파악 완료.

### 진짜 원인

#### 1. UI — `TYPE_LABEL` / `TYPE_ORDER` / `TYPE_COLOR` 누락
업로드 폼에 `hazard`(위험 상황), `tbm`(TBM), `completion`(완료) 3개 유형이 있으나
렌더링 로직의 상수 테이블에 정의가 없었음:
- `TYPE_LABEL[type]` → `undefined` → 유형 코드값 그대로 표시 (`hazard` 등)
- `TYPE_COLOR[type]` → `undefined` → `|| 'bg-gray-500'` fallback으로 무채색 표시
- `TYPE_ORDER[type]` → `undefined` → `?? 99` → 정렬 맨 뒤로 밀림
- **2곳 동시 미반영**: `showTaskDetail` 최초 렌더링 + `_refreshPhotoTab` 갱신 함수

#### 2. 서버 — `PHOTO_TYPE_DIRS` 누락
NAS 파일 저장 시 폴더 분류에 사용하는 `PHOTO_TYPE_DIRS`에 동일 3개 유형 미정의:
- `hazard`, `tbm`, `completion` → `PHOTO_TYPE_DIRS[type]` = `undefined`
- `getUploadDir()` 내 `if (PHOTO_TYPE_DIRS[photoType])` 조건 미충족 → 폴더 미분류 저장

### 수정 내용

**app.js (2곳 동일 수정):**
```javascript
const TYPE_ORDER = { before:0, progress:1, after:2, hazard:3, tbm:4, completion:5 };
const TYPE_LABEL = { before:'작업 전', progress:'작업 중', after:'작업 후',
                     hazard:'위험 상황', tbm:'TBM', completion:'완료' };
const TYPE_COLOR = { before:'bg-blue-500', progress:'bg-yellow-500', after:'bg-green-500',
                     hazard:'bg-red-500', tbm:'bg-purple-500', completion:'bg-teal-500' };
```

**node-server.ts:**
```typescript
const PHOTO_TYPE_DIRS = {
  before:'01_작업 전', progress:'02_작업 중', after:'03_작업 후',
  hazard:'04_위험 상황', tbm:'05_TBM', completion:'06_완료',
}
```

### ⚠️ 재발 방지
- 업로드 폼 `<select>` 유형 추가 시 반드시 3곳 동시 업데이트:
  1. `app.js` — `TYPE_ORDER`, `TYPE_LABEL`, `TYPE_COLOR` (showTaskDetail)
  2. `app.js` — 동일 상수 (_refreshPhotoTab)
  3. `node-server.ts` — `PHOTO_TYPE_DIRS`

### 커밋
- `b245c84` — fix: 사진 탭 유형 표시 누락 수정 (BUG-002)

---

## [BUG-007-PWA] PC 브라우저 PWA 설치 배너 표시 (2026-06-17)

### 증상
- Windows Edge / Chrome PC 환경에서 로그인 화면 하단에
  **"SafetyNOTE 앱 설치 / 홈 화면에 추가하면 더 빠르게 접속"** 배너가 표시됨
- 설치·닫기 버튼 포함된 보라색 배너 — PC에서는 불필요

### 원인
- `beforeinstallprompt` 이벤트는 **PC 브라우저(Edge/Chrome)에서도 발생**
- 기존 코드에 `isMobile` 조건 없이 `showInstallBanner()` 호출
- PC에서도 4초 후 배너 표시

### 해결
```javascript
// mobile-app.js — beforeinstallprompt 핸들러
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isMobile) return; // [BUG-007-PWA] PC 브라우저 차단
  if (!localStorage.getItem('pwa-dismissed') && ...) {
    setTimeout(showInstallBanner, 4000);
  }
});
```

### 영향 범위
- **PC 브라우저**: 설치 배너 완전 차단 ✅
- **Android Chrome 모바일**: 기존대로 배너 표시 유지 ✅
- **iOS Safari**: `showIOSGuide()` — `isIOS` 조건 있어 기존대로 유지 ✅

### 수정 파일
- `public/static/mobile-app.js` — `if (!isMobile) return;` 1줄 추가
- `node-server.ts` — 캐시 버전 `20260617j` → `20260617k`

### 롤백 태그
| 태그 | 커밋 | 설명 |
|------|------|------|
| `rollback/pre-feat-pwa-banner` | `85bdbca` | 수정 직전 상태 |

**롤백 명령:**
```bash
git push origin 85bdbca:main --force
cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
```

### 커밋
- `1efa79c` — fix: PC 브라우저 PWA 설치 배너 미표시 (BUG-007-PWA)

---

## [FEAT-025-TAB] 상세화면 탭바 스크롤 시 분리 — sticky 고정 (2026-06-17)

### 증상
- 모바일 작업 상세화면(showTaskDetail 모달) 내부 스크롤 시
  탭바(기본정보 / 체크리스트 / 위험성평가 / TBM / 작업일지 / 사진 / 현장점검)가
  콘텐츠와 함께 위로 스크롤되어 화면에서 사라짐
- 탭이 사라지면 탭 전환 불가 → UX 저하

### 원인
- `.modal`이 `overflow-y: auto` 스크롤 컨테이너
- `.tab-bar`에 `position: sticky` 미적용 → 일반 흐름으로 스크롤과 함께 이동

### 해결
```css
/* PC 기준 — modal-header 높이 약 62px */
.tab-bar {
  position: sticky;
  top: 62px;
  z-index: 9;
}

/* 모바일 @media (max-width:768px) */
.modal .tab-bar {
  position: sticky !important;
  top: 52px !important;        /* modal-header min-height 기준 */
  z-index: 9 !important;
  margin-left: -24px !important;   /* full width */
  margin-right: -24px !important;
  padding-left: 24px !important;
  padding-right: 24px !important;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}
```

### 영향 범위
- 탭바: 스크롤 시 modal-header 바로 아래 고정 ✅
- 좌우 스크롤: overflow-x:auto 유지 → 탭 항목 가로 스크롤 정상 ✅
- modal-sm 소형 팝업: tab-bar 미사용 → 영향 없음 ✅
- 기타 .tab-bar 사용 화면(목록 필터 등): PC sticky top:62px 적용 — 해당 화면은 modal 밖이므로 top:62px가 화면 최상단 기준 → 스크롤 시 상단 고정됨 (의도된 동작)

### 수정 파일
- `public/static/style.css` — .tab-bar sticky 추가, @media 모바일 .modal .tab-bar 추가
- `node-server.ts` — 캐시 버전 `20260617k` → `20260617l`

### 롤백 태그
| 태그 | 커밋 | 설명 |
|------|------|------|
| `rollback/pre-feat-tab-sticky` | `56a8999` | 수정 직전 상태 |

**롤백 명령:**
```bash
git push origin 56a8999:main --force
cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
```

### 커밋
- `ac214ca` — feat: 상세화면 탭바 sticky 고정 (FEAT-025-TAB)

---

## [FEAT-025-TAB v2] 탭바 세로 줄바꿈 / 높이 팽창 수정 (2026-06-18)

### 증상 (v1 적용 후 발생)
- 탭바가 sticky 고정은 되었으나, 탭 항목들이 **세로로 줄바꿈**되어 쌓임
- 탭 텍스트 겹침/잘림, 탭바 높이 비정상적으로 팽창
- 핑크 활성 밑줄 아래 흰 공간 과도하게 생김

### 원인
- `margin-left: -24px; margin-right: -24px` 음수 margin 적용 시
  flex 컨테이너의 **가용 너비 계산 오류** 발생
- 계산된 너비보다 탭 항목 합계가 초과 → `flex-wrap: wrap` 기본값으로 세로 줄바꿈

### 해결 (v2)
- **margin 음수값 완전 제거** — 탭바가 modal-body 패딩 안에서 자연 너비 유지
- **`flex-wrap: nowrap` 명시** — 탭 항목 가로 1줄 강제 유지
- **`overflow-x: auto` 명시** — 탭 항목 많을 때 좌우 스크롤
- sticky / top:52px / z-index:9 / box-shadow 유지

### 수정 파일
- `public/static/style.css` — margin 음수값 제거, flex-wrap:nowrap 추가
- `node-server.ts` — 캐시 버전 `20260617l` → `20260617m`

### 롤백 태그
| 태그 | 커밋 | 설명 |
|------|------|------|
| `rollback/pre-feat-tab-sticky-v2` | `b5383d7` | v2 수정 직전 (v1 적용 상태) |
| `rollback/pre-feat-tab-sticky` | `56a8999` | v1 수정 직전 (tab-sticky 전체 롤백) |

**롤백 명령 (v2만 롤백):**
```bash
git push origin b5383d7:main --force
cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
```

### 커밋
- `eb4a5b4` — fix: 탭바 sticky v2 — margin 음수값 제거 + flex-wrap:nowrap (FEAT-025-TAB)

---

## [FEAT-025-TAB v3] 탭바 sticky 모바일 미작동 — HTML 구조 근본 수정 (2026-06-18)

### 증상 (v2 적용 후 여전히 발생)
- **PC**: 탭바 sticky 정상 동작
- **모바일 브라우저(iOS Safari/Chrome)**: 탭바가 스크롤과 함께 올라감 (변화 없음)
- 사용자 재신고: "아직도 변함이 없습니다. 해당 부분은 모바일 브라우저 접속시에만 발생합니다."

### 근본 원인 (CSS로 해결 불가)
- **`.tab-bar`가 `.modal-body` 안에 있었음** — sticky 요소는 스크롤 컨테이너의 **직계 자식**이어야 모바일에서 정상 동작
- `.modal`(overflow-y:auto)이 스크롤 컨테이너, `.modal-body`가 중간 계층으로 존재
- `.modal-body` → `.tab-bar` 구조에서 모바일 Safari/Chrome sticky 미동작
- `-webkit-overflow-scrolling: touch`가 내부 sticky를 방해 (iOS Safari 알려진 이슈)
- `.tab-bar`에 `overflow-x: auto`와 `position: sticky` 동시 적용 시 일부 모바일에서 sticky 무효화

```
[문제 구조]
.modal (overflow-y:auto = 스크롤 컨테이너)
  └── .modal-header (sticky top:0 ✅)
  └── .modal-body
        └── [작업 진행 단계]
        └── .tab-bar (sticky → 모바일 미작동 ❌ — modal 직계 자식 아님)

[수정 구조]  
.modal (overflow-y:auto = 스크롤 컨테이너)
  └── .modal-header (sticky top:0 ✅)
  └── .tab-bar-wrap (sticky top:52px ✅ — modal 직계 자식)
  └── .modal-body
        └── [작업 진행 단계]
        └── [탭 콘텐츠]
```

### 해결 (v3) — HTML 구조 변경

#### 1. `app.js` — `showTaskDetail` HTML 구조 변경
- `.tab-bar-wrap`을 `.modal-body` **밖**, `.modal` 직계 자식으로 이동
- 기존 `.modal-body` 안의 `.tab-bar` 블록 제거
- `.tab-item` 7개는 `.tab-bar-wrap` 안으로 이동

#### 2. `style.css` — 신규 클래스 및 CSS 수정
- `.tab-bar-wrap` 신규 정의 (PC 기준 기본 스타일)
- `.tab-bar-wrap::-webkit-scrollbar { display: none }` — 웹킷 스크롤바 숨김
- `@media (max-width: 768px)` 내:
  - `.modal > .tab-bar-wrap { position: sticky !important; top: 52px !important; }` — 모바일 sticky
  - `-webkit-overflow-scrolling: auto !important` — iOS sticky 방해 방지
  - `.modal .tab-bar { position: relative !important }` — 기존 tab-bar 호환성 유지
- `.modal { -webkit-overflow-scrolling: touch → auto }` — iOS sticky 방해 원천 차단

#### 3. `node-server.ts` — 캐시 버전 `20260617m` → `20260617n`

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `public/static/app.js` | `showTaskDetail`: `.tab-bar` → `.tab-bar-wrap` 로 교체, modal 직계 자식으로 이동 |
| `public/static/style.css` | `.tab-bar-wrap` 신규 정의, 모바일 sticky, -webkit-overflow-scrolling 수정 |
| `node-server.ts` | 캐시 버전 `20260617m` → `20260617n` |

### 롤백 태그
| 태그 | 커밋 | 설명 |
|------|------|------|
| `rollback/pre-feat-tab-sticky-v3` | `5add4ae` | v3 수정 직전 (v2 적용 상태) |
| `rollback/pre-feat-tab-sticky-v2` | `b5383d7` | v2 수정 직전 |
| `rollback/pre-feat-tab-sticky` | `56a8999` | tab-sticky 전체 롤백 |

**롤백 명령 (v3만 롤백):**
```bash
git push origin 5add4ae:main --force
cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
```

### 커밋
- `5d3e8d0` — fix: 탭바 sticky v3 — tab-bar-wrap을 modal 직계 자식으로 이동 (FEAT-025-TAB)

---

## [FEAT-025-FCM] FCM 푸시 알림 서버 구현 (Phase 2)

> **커밋**: `d32c632`  
> **날짜**: 2026-06-18  
> **상태**: ✅ 서버 구현 완료 / 🔄 Android 앱 연동 진행 중

### 배경

기존 실시간 알림은 SSE(Server-Sent Events)로만 발송 → 앱이 꺼져 있으면 수신 불가.  
FCM HTTP v1 API를 추가로 병행 발송하여 앱 미실행 시에도 푸시 알림 수신.

### 핵심 설계 결정

| 문제 | 결정 |
|------|------|
| firebase-admin SDK NAS glibc 비호환 | Node.js 내장 `crypto`+`https`로 FCM HTTP v1 직접 구현 |
| access_token 매 요청 발급 비효율 | 1시간 캐싱 + 만료 1분 전 자동 갱신 (`_cachedToken`, `_tokenExpiry`) |
| 기존 SSE 코드 수정 최소화 | `.catch(()=>{})` 패턴으로 FCM 병행 — SSE 코드 변경 없음 |
| RULE-002 TDZ 방지 | `sendFcmToUsers`, `sendFcmToRoles`를 patchSchema() 이후에 배치 |

### 추가된 파일 / 수정 사항

#### `src/fcm.ts` (신규)
- RS256 JWT 생성 → Google OAuth2 토큰 교환 → FCM Bearer 인증
- `sendFcmPush(token, payload)` — 단건 발송
- `sendFcmPushMulti(tokens[], payload)` — 다건 순차 발송
- Android 전용 알림 채널 `safetynote_push`, priority: high

#### `node-server.ts`
- **patchSchema v0.134**: `ALTER TABLE users ADD COLUMN fcm_token TEXT DEFAULT NULL`
- **헬퍼 함수**: `sendFcmToUsers(userIds)`, `sendFcmToRoles(roles[])`
- **FCM 병행 발송 추가 위치 (5곳)**:
  - TBM 결재: approval_safety → approval_general
  - TBM 결재: approval_general → approval_ceo
  - TBM 결재: approval_ceo → 안전관리자 완료 알림
  - 서명요청 단건 (POST /api/signature-requests)
  - 서명요청 일괄 (POST /api/signature-requests/bulk)
- **FCM API 4개**:
  - `POST   /api/push/register`  — FCM 토큰 등록/갱신
  - `DELETE /api/push/register`  — 로그아웃 시 토큰 삭제
  - `POST   /api/push/send`      — 관리자 수동 발송 (all|role:xxx|user:123)
  - `GET    /api/push/status`    — 토큰 등록 현황

#### `app.js`
- 관리자 설정 화면에 푸시 알림 발송 UI 섹션 추가 (#fcm-status-bar, #push-target, #push-title, #push-body)
- `_loadFcmStatus()` — GET /api/push/status 호출, 현황 바 업데이트
- `sendManualPush()` — POST /api/push/send 호출, 확인 후 발송
- `renderAdminSettingsPage()` 내 `_loadFcmStatus()` 자동 호출 추가

### NAS .env 설정 (필수)

```env
FCM_PROJECT_ID=safetynote-c1e8c
FCM_CLIENT_EMAIL=firebase-adminsdk-fbsvc@safetynote-c1e8c.iam.gserviceaccount.com
FCM_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
```

> ⚠️ FCM_PRIVATE_KEY의 개행은 반드시 `\n` (리터럴 백슬래시+n) 으로 저장할 것.  
> 실제 개행으로 저장하면 multi-line env 파싱 오류 발생.

### 롤백 태그

| 태그 | 커밋 | 설명 |
|------|------|------|
| `rollback/pre-phase2-fcm` | `d2d2bb3` | Phase 2 시작 직전 |

**롤백 명령:**
```bash
git push origin d2d2bb3:main --force
cd /volume1/safetynote && git pull origin main && pm2 restart safetynote
```

### 남은 작업 (Android 앱)

- [ ] `app/google-services.json` 추가 (safetynote-c1e8c 프로젝트)
- [ ] `app/build.gradle`: `com.google.firebase:firebase-messaging:23.4.0` 의존성 추가
- [ ] `MyFirebaseMessagingService.java`: 토큰 자동 등록, 포그라운드/백그라운드 알림 처리
- [ ] `AndroidManifest.xml`: FCM 서비스 등록, 알림 채널 권한


---

## [BUG-008] APK 업데이트 불가 (v1.4.3) + 서버 주소 설정 화면 문제 (2026-06-18)

### 증상 1: APK 업데이트 불가
- v1.4.3 설치 후 앱 업데이트가 되지 않는 에러 발생
- 이전 BUG-006(ReferenceError: Log is not defined)과 동일 패턴으로 보고됨

### 증상 2: 서버 주소/포트 입력 화면 수정 불가
- APK 최초 설치 후 서버 주소 잘못 입력 시 수정 불가
- 접속 테스트 기능 없음 (최초 APK에는 있었던 기능)
- 포트 기본값 미설정

---

### 원인 분석

#### BUG-008-1: APK 업데이트 불가

`app.js`의 `doApkDownload()` 확인 결과:
- `typeof Log !== 'undefined'` 수정은 **이미 적용됨** (BUG-006 수정 커밋 `d51f355` 반영)
- `MainActivity.java` APK URL 감지 조건 정상 (`url.contains("/apk/")` 포함)

**실제 원인**: `www/index.html`의 앱 시작 로직 문제
```javascript
// 수정 전: 저장된 주소 있으면 무조건 자동 연결 → 설정 화면 진입 불가
if (savedUrl) {
  // 스플래시 → 자동 연결 (설정 화면 표시 안 함)
  setTimeout(function() { window.location.replace(savedUrl); }, 400);
}
```
- 저장된 서버 주소 있을 때 바로 자동 연결 → 사용자가 주소를 변경할 수 없음
- 잘못된 주소 저장 시 연결 실패 → 계속 실패 루프 (설정 화면 접근 불가)
- 포트 기본값 미설정 (`placeholder`만 있고 `value` 없음)
- 접속 테스트 버튼 없음

#### BUG-008-2: 서버 설정 화면 개선 필요

---

### 해결 — `www/index.html` 전면 개선

#### 1. 저장된 주소 있을 때 → 수정 가능하도록 변경
```javascript
// 수정 후: 저장된 주소 표시 + "이 서버로 연결" / "주소 변경" 버튼 제공
if (savedUrl) {
  document.getElementById('currentConnUrl').textContent = savedUrl;
  document.getElementById('currentConn').style.display = 'flex';  // 저장 주소 카드 표시
  document.getElementById('inputForm').style.display = 'none';    // 입력 폼 숨김
  // "주소 변경" 클릭 시 → showInputForm() 으로 입력 폼 표시
}
```

#### 2. 포트 기본값 3443 설정
```html
<!-- 수정 후: value="3443" 명시 -->
<input id="portInput" type="number" placeholder="3443" value="3443" ... />
```
- `getSavedPort()` 도 기본값 `'3443'` 반환 (`|| '3443'` 추가)

#### 3. 접속 테스트 버튼 추가
```javascript
function testConnection() {
  // fetch + no-cors 모드로 서버 도달 여부 확인
  // 타임아웃 8초
  // 테스트 중/성공/실패 상태별 UI 표시
  fetch(url + '/api/health', { method: 'GET', signal: controller.signal, mode: 'no-cors' })
    .then(() => { /* ✅ 서버 연결 성공 */ })
    .catch(err => {
      if (isAbort) { /* ⏱ 연결 시간 초과 */ }
      else { /* ✅ 서버 응답 확인 (no-cors opaque response) */ }
    });
}
```

#### 4. 프리셋 클릭 시 입력 폼에 값 채우기
- 기존: `doConnect(url)` 바로 실행
- 수정: `loadPreset(url)` → URL 파싱 후 주소/포트 입력 필드에 채워넣기

#### 5. 기타 UX 개선
- 초기화 버튼: 포트 기본값 3443으로 리셋
- 저장된 주소 카드: "저장된 서버 주소" 레이블 + URL 표시 + 2개 버튼 (이 서버로 연결 / 주소 변경)

---

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `safetynote-android/www/index.html` | 서버 설정 화면 전면 개선 |
| `safetynote-android/.github/workflows/build-apk.yml` | 버전 기본값 `1.4.4`로 업데이트 |

### ⚠️ 재발 방지
- 저장된 URL이 있더라도 **반드시 수정 가능한 경로 제공** (`주소 변경` 버튼)
- 포트 기본값은 `value="3443"` 으로 명시 (`placeholder`만으로는 실제 입력값 없음)
- 접속 테스트 버튼은 최초 APK와 동일하게 항상 포함

### 커밋
- `c74b6ab` (safetynote-android repo)

---

## [BUG-009] FCM 푸시 알림 미수신 — JS→SharedPreferences JWT 브릿지 누락 (2026-06-18)

### 증상
- APK v1.4.4 설치 후 로그인해도 FCM 푸시 알림이 수신되지 않음
- `/api/push/status` 확인 시 FCM 토큰 등록 건수 0건
- `MyFirebaseMessagingService` 로그: `"JWT 없음 — 로그인 후 토큰 등록 예정"` 반복 출력

### 원인 분석

#### 데이터 흐름 불일치
```
[앱 로그인 시]
app.js(WebView)
  └→ localStorage.setItem('token', jwt)   ← WebView 전용 저장소
  └→ (없음) SharedPreferences 저장 코드   ← ❌ 누락

MyFirebaseMessagingService.onNewToken()
  └→ SharedPreferences("SafetyNotePrefs")["authToken"] 읽기
  └→ null → "JWT 없음 — 로그인 후 토큰 등록 예정" → 서버 등록 생략  ← 결과
```

- **localStorage** : WebView(JS) 전용 — Java/네이티브 코드에서 접근 불가
- **SharedPreferences** : Android 네이티브 저장소 — Java 코드에서만 읽기/쓰기
- Capacitor의 `@capacitor/preferences` 플러그인이 **미설치**여서 자동 동기화 없음
- `MainActivity.java`에 `@JavascriptInterface` 브릿지가 **없었음** → JWT가 SharedPreferences에 저장되는 경로 자체가 없었음

### 해결 방법 (BUG-009 Fix)

#### 1. `MainActivity.java` — `@JavascriptInterface` 브릿지 내부 클래스 추가

```java
// ① import 추가
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;

// ② 상수 추가 (MyFirebaseMessagingService 와 동일 키)
private static final String PREFS_NAME = "SafetyNotePrefs";
private static final String KEY_JWT    = "authToken";
private static final String KEY_SERVER = "serverUrl";

// ③ onCreate() 에서 WebView 에 브릿지 등록
getBridge().getWebView().addJavascriptInterface(
    new SafetyNoteAppBridge(), "SafetyNoteApp"
);

// ④ 내부 클래스 SafetyNoteAppBridge
private class SafetyNoteAppBridge {
    @JavascriptInterface
    public void saveAuthToken(String token) {
        // SharedPreferences 에 JWT 저장 + FCM 토큰 즉시 재등록 시도
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit().putString(KEY_JWT, token).apply();
        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(fcmToken -> triggerFcmRegistration(fcmToken));
    }

    @JavascriptInterface
    public void clearAuthToken() {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit().remove(KEY_JWT).apply();
    }

    @JavascriptInterface
    public void saveServerUrl(String url) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit().putString(KEY_SERVER, url).apply();
    }
}

// ⑤ triggerFcmRegistration() — 로그인 직후 FCM 토큰 서버 등록
//    (onNewToken 에서 JWT 없어 생략된 경우 보완)
```

#### 2. `app.js` — `doLogin()` / `doLogout()` 에 브릿지 호출 추가

```javascript
// doLogin() 로그인 성공 직후
localStorage.setItem('token', res.data.token);
// [BUG-009 Fix] SharedPreferences 에 JWT 저장
if (window.SafetyNoteApp && typeof window.SafetyNoteApp.saveAuthToken === 'function') {
  try { window.SafetyNoteApp.saveAuthToken(res.data.token); } catch(e) { /* ignore */ }
}

// doLogout() 로그아웃 시
localStorage.removeItem('token');
// [BUG-009 Fix] SharedPreferences 에서 JWT 삭제
if (window.SafetyNoteApp && typeof window.SafetyNoteApp.clearAuthToken === 'function') {
  try { window.SafetyNoteApp.clearAuthToken(); } catch(e) { /* ignore */ }
}
```

#### 3. `www/index.html` — `doConnect()` 에 `saveServerUrl` 호출 추가

```javascript
function doConnect(url) {
  // ... (기존 화면 전환 코드)
  // [BUG-009 Fix] SharedPreferences 에 서버 URL 저장
  if (window.SafetyNoteApp && typeof window.SafetyNoteApp.saveServerUrl === 'function') {
    try { window.SafetyNoteApp.saveServerUrl(url); } catch(e) { /* ignore */ }
  }
  setTimeout(() => { window.location.replace(url); }, 400);
}
```

### 브라우저(PWA) 호환성
- `window.SafetyNoteApp` 존재 여부를 항상 먼저 체크
- 브릿지 없는 환경(PWA, 데스크톱 브라우저)에서는 조용히 스킵 → 기존 동작 유지

### 재발 방지
- Capacitor 앱에서 Java 코드가 사용할 데이터는 **반드시 SharedPreferences에 저장**
- `@JavascriptInterface` 브릿지는 `onCreate()` 에서 WebView 초기화 직후 등록
- `window.SafetyNoteApp?.saveXxx()` 호출 패턴으로 PWA/네이티브 양립

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `safetynote-android/android-overrides/app/src/main/java/me/linkmax/safetynote/MainActivity.java` | `@JavascriptInterface` 브릿지 내부 클래스 추가, `triggerFcmRegistration()` 추가 |
| `safetynote-android/www/index.html` | `doConnect()` 에 `saveServerUrl()` 브릿지 호출 추가 |
| `safetynote-server/public/static/app.js` | `doLogin()` `saveAuthToken()`, `doLogout()` `clearAuthToken()` 브릿지 호출 추가 |
| `safetynote-android/.github/workflows/build-apk.yml` | 버전 기본값 `1.4.5`로 업데이트 |

### 커밋
- `safetynote-android`: `06380c1`
- `safetynote-server`: `decb91e`

---

## [BUG-010] FCM 등록 0명 + APK 다운로드 안됨 (v1.4.5) (2026-06-18)

### 증상
1. v1.4.5 재설치 후 로그인해도 앱 설치(FCM 등록): **0명** 유지
2. 앱 실행 시 업데이트 알림은 표시되나 **다운로드 클릭 → 아무 반응 없음**

---

### BUG-010-1: FCM 등록 0명 — SSL 오류

#### 원인
`triggerFcmRegistration()` / `registerTokenToServer()` 에서 `https://` URL로 `HttpURLConnection` 직접 호출
→ Android `HttpURLConnection`은 WebView SSL 예외와 **별도 TrustStore** 사용
→ NAS 자체서명 인증서를 신뢰하지 않아 **`SSLHandshakeException`** 발생
→ catch(Exception) 에서 조용히 삼켜짐 → 서버에 토큰 미등록 → 0명

```
// 실제 발생 오류 (LogCat)
FCMService: 토큰 등록 중 오류: javax.net.ssl.SSLHandshakeException:
  java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.
```

#### 해결
`MyFirebaseMessagingService.java` + `MainActivity.triggerFcmRegistration()` 모두 수정:
```java
// https → http 변환 (AndroidManifest usesCleartextTraffic=true 전제)
String effectiveUrl = serverUrl;
if (effectiveUrl.startsWith("https://")) {
    effectiveUrl = "http://" + effectiveUrl.substring(8);
}
String apiUrl = effectiveUrl.replaceAll("/+$", "") + "/api/push/register";
```

---

### BUG-010-2: APK 다운로드 안됨 — window.open + URL 감지 이중 실패

#### 원인 1 — `window.open(url, '_system')` 미트리거
Capacitor 6에서 `window.open(url, '_system')` 이 `shouldOverrideUrlLoading` 을 **경우에 따라 트리거하지 않음**.
Capacitor는 `_system` 타겟을 내부적으로 처리(Intent 실행)하는 경우가 있어 커스텀 WebViewClient 를 거치지 않음.

#### 원인 2 — URL 감지 조건 미충족
```java
// 기존 감지 조건
if (url.endsWith(".apk") || url.contains(".apk?") || url.contains("/apk/")) { ... }
```
`apk_url` 이 `/api/dist/apk/download` 경로로 설정된 경우:
- `.apk`로 끝나지 않음 ✗
- `.apk?` 없음 ✗  
- `/apk/` 없음 ✗ → **감지 실패 → DownloadManager 미호출 → 다운로드 없음**

#### 해결

**`MainActivity.java`** — `SafetyNoteAppBridge` 에 `downloadApk()` 메서드 추가:
```java
@JavascriptInterface
public void downloadApk(String apkUrl) {
    Log.d(TAG, "downloadApk 브릿지 호출: " + apkUrl);
    runOnUiThread(() -> startApkDownload(apkUrl));  // DownloadManager 직접 실행
}
```

**`app.js`** — `doApkDownload()` Capacitor 분기 수정:
```javascript
if (isCapacitor) {
  // 브릿지로 DownloadManager 직접 실행 (URL 형태 무관)
  if (window.SafetyNoteApp && typeof window.SafetyNoteApp.downloadApk === 'function') {
    window.SafetyNoteApp.downloadApk(url);
    return;
  }
  // 폴백: 구버전 APK
  window.open(url, '_system');
}
```

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `MainActivity.java` | `triggerFcmRegistration()` https→http 폴백, `downloadApk()` 브릿지 추가 |
| `MyFirebaseMessagingService.java` | `registerTokenToServer()` https→http 폴백 |
| `app.js` | `doApkDownload()` Capacitor 분기 — 브릿지 우선 사용 |
| `build-apk.yml` | 버전 기본값 `1.4.6` |

### 커밋
- `safetynote-android`: `8e5144f`
- `safetynote-server`: `f1c05c1`

---

## [BUG-010-3] NAS 미배포 — app.js BUG-009/010 수정분 미반영 (2026-06-18)

### 증상
v1.4.6 APK 설치 후에도 동일 증상 지속:
- FCM 등록: 0명 / 전체 46명
- APK 다운로드 클릭 → 무반응

### 원인
APK(Java 코드)는 올바르게 빌드됨. 그러나 **NAS 서버가 구버전 `app.js` 서빙 중**.

```bash
# 확인 명령어
curl -sk "https://linkmax.myds.me:3443/static/app.js" | grep -c "downloadApk"
# → 0  ← BUG-010 수정분 없음

curl -sk "https://linkmax.myds.me:3443/" | grep -o "app\.js.*v=[^\"]*"
# → app.js?v=20260617n  ← 세션 27 구버전
```

| 항목 | 상태 |
|------|------|
| NAS 배포 커밋 | `a473c4a` (세션 27 — BUG-009/010 수정 전) |
| GitHub main 최신 | `4f2a285` (BUG-010 수정 포함) |
| 미배포 커밋 수 | 4개 (`decb91e`, `f1c05c1` 등) |

**근본 원인**: GitHub Actions 빌드는 성공했으나 NAS에서 `git pull`이 실행되지 않음.
APK(v1.4.6)에는 `saveAuthToken()` / `downloadApk()` 브릿지 수신 코드가 있으나,
**NAS app.js에는 해당 브릿지를 호출하는 코드가 없음** → 브릿지 연결 불가.

### 해결 — NAS git pull + 캐시 버전 업데이트

**서버 코드 변경**:
- `node-server.ts` 캐시 버전 `v=20260617n` → `v=20260618a` 로 업데이트 (커밋 `(see below)`)

**NAS 배포 명령** (NAS SSH에서 실행):
```bash
cd /volume1/safetynote
git pull origin main
pm2 restart safetynote
```

**배포 자동화 스크립트** (`scripts/nas-deploy.sh`):
```bash
# NAS에서 실행
bash /volume1/safetynote/scripts/nas-deploy.sh
```

### 재발 방지 규칙

**⚠️ RULE-003**: `app.js` 수정 후 반드시 **NAS git pull + pm2 restart** 실행
- GitHub 커밋/푸시만으로는 NAS에 반영되지 않음
- APK 빌드 + NAS 서버 배포 **두 가지 모두** 필요한 경우 체크리스트 사용:
  ```
  [ ] GitHub main 푸시 완료 (app.js + android java 모두)
  [ ] NAS git pull 완료
  [ ] pm2 restart 완료
  [ ] curl로 app.js 버전/코드 확인
  [ ] APK 빌드 트리거
  ```

### 관련 스크립트
- `scripts/nas-deploy.sh` — 배포 + 검증 자동화
- `scripts/rollback.sh` — 버전별 롤백 툴

---

## [RULE-003] NAS 배포 체크리스트

### app.js / node-server.ts 수정 후
```bash
# 1. GitHub 커밋/푸시
git add . && git commit -m "fix: ..." && git push origin main

# 2. NAS 배포 (NAS SSH에서 실행)
cd /volume1/safetynote
git pull origin main          # 또는: git fetch && git reset --hard origin/main
pm2 restart safetynote

# 3. 반영 확인
curl -sk https://linkmax.myds.me:3443/ | grep app.js  # 캐시 버전 확인
curl -sk https://linkmax.myds.me:3443/static/app.js | grep -c "saveAuthToken"
```

### 캐시 버전 업데이트 규칙
`node-server.ts` Line 5217~5223:
- `v=YYYYMMDD[알파벳]` 형식으로 업데이트
- 앱이 app.js를 새로 받게 강제 (브라우저/WebView 캐시 초기화)
- **app.js 수정 시 반드시 캐시 버전도 함께 올림**

| 버전 | 날짜 | 주요 변경 |
|------|------|---------|
| `v=20260617n` | 세션 27 | FCM 서버 구현 |
| `v=20260618a` | 세션 30 | BUG-009/010 브릿지 호출 코드 추가 |


---

## [BUG-010-4] FCM 등록 0명 지속 — HTTPS 전용 포트 3443에 HTTP 요청 (2026-06-18)

### 증상
v1.4.6 설치 + NAS git pull 완료 후에도 FCM 등록 0명 유지.
서버 PM2 로그에 FCM 토큰 등록 흔적 **전혀 없음**.

### 진단

```bash
# 서버 로그: FCM 시도 흔적 없음
grep -i "fcm\|push" /root/.pm2/logs/safetynote-out.log | tail -20
# → [patchSchema] v0.134 users.fcm_token 컬럼 추가 완료 (단 1줄)

# HTTP로 직접 테스트 → 빈 응답
curl -sk -X POST http://linkmax.myds.me:3443/api/push/register \
  -H "Authorization: Bearer AAAA" -d '{"fcm_token":"test"}' ; echo ""
# → (아무것도 출력 안 됨)
```

### 원인

**3443 포트는 HTTPS 전용** — NAS `node-server.ts`가 `https.createServer()`로 3443 포트에 바인딩.
Android `HttpURLConnection`은 `https→http` 변환 후 `http://linkmax.myds.me:3443`으로 요청하지만,
3443은 TLS handshake를 기대하는 HTTPS 소켓 → 평문 HTTP 패킷 수신 시 즉시 연결 종료.
결과: 빈 응답(connect 성공, 즉시 EOF) → Exception → 조용히 삼켜짐.

```
[BUG-010-1 v1 흐름]  Android → https://...:3443 → SSLHandshakeException (자체서명)
[BUG-010-1 Fix v1]   Android → http://...:3443  → 빈 응답 (HTTPS 소켓에 HTTP 요청)
[BUG-010-1 Fix v2]   Android → http://...:3444  → 정상 응답 ✅
                      서버: HTTP 전용 3444 포트 동시 오픈
```

### 해결

#### 서버 (`node-server.ts`) — HTTP 포트 3444 추가 (`c4c77de`)
```typescript
// HTTPS 서버(3443) 외에 HTTP 전용 서버(3444)를 동시에 기동
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3444')
const httpServer = http.createServer((req, res) => {
  app.fetch(...).then(...)
})
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`✅ HTTP 내부 포트 실행 중: http://0.0.0.0:${HTTP_PORT} (Android FCM 전용)`)
})
httpServer.on('error', (err) => {
  console.warn(`[HTTP] 내부 포트 ${HTTP_PORT} 오류 (무시 가능):`, err.message)
  // ⚠️ process.exit() 없음 — HTTPS 서버는 계속 실행
})
```

#### Android (`MainActivity.java` + `MyFirebaseMessagingService.java`) — 포트 3443→3444 변환 (`e8d4bd2`)
```java
// https→http 변환 후 추가: 포트 3443 → 3444
effectiveUrl = effectiveUrl.replaceAll(":3443(/|$)", ":3444$1");
// 결과: http://linkmax.myds.me:3444/api/push/register
```

### 검증 방법 (NAS에서)

```bash
# NAS git pull + 재시작 후
pm2 restart safetynote

# 3444 포트 응답 확인
curl -s -X POST http://linkmax.myds.me:3444/api/push/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer AAAA" \
  -d '{"fcm_token":"test"}' ; echo ""
# 기대값: {"error":"인증 필요"}  ← API 살아있음 확인

# PM2 로그에서 HTTP 3444 포트 기동 확인
grep "3444\|HTTP 내부" /root/.pm2/logs/safetynote-out.log | tail -3
```

### ⚠️ 재발 방지 규칙 (RULE-004)

**HTTPS 전용 포트에 HttpURLConnection HTTP 요청 금지**
- NAS 서버: 3443 = HTTPS 전용, 3444 = HTTP 내부 전용
- Android `HttpURLConnection` 사용 시: 항상 `http://...:3444` 사용
- WebView(Capacitor): HTTPS(3443) 그대로 사용 (WebView는 자체서명 인증서 예외 적용됨)
- 공유기 포트포워딩: 3443만 외부 오픈 → 3444는 내부망 전용 (보안 유지)

### 관련 버그 연결
| 버그 | 원인 | 해결 |
|------|------|------|
| BUG-010-1 v1 | SSLHandshakeException (자체서명) | https→http 변환 |
| **BUG-010-4** | **3443 HTTPS 전용 포트에 HTTP 요청** | **3444 HTTP 포트 추가** |

### 커밋
- `safetynote-server`: `c4c77de`
- `safetynote-android`: `e8d4bd2`
- APK: v1.4.7

---

## [RULE-004] NAS 포트 구조 (필수 숙지)

```
외부(인터넷) ─┐
              │ 공유기 포트포워딩: 3443만 오픈
              ▼
NAS :3443  HTTPS 전용 (브라우저/WebView 접속용)
NAS :3444  HTTP  전용 (Android HttpURLConnection FCM 등록 전용, 내부망 only)
```

| 클라이언트 | 프로토콜 | 포트 | 비고 |
|-----------|---------|------|------|
| 브라우저 | HTTPS | 3443 | 외부 공개 |
| WebView(Capacitor) | HTTPS | 3443 | 외부 공개, 자체서명 예외 적용 |
| Android HttpURLConnection | HTTP | 3444 | 내부망 전용, 외부 차단 |

**⚠️ 이 구조를 변경하려면 반드시 BUGFIX_LOG RULE-004 확인 후 진행**

---

## [BUG-011] FCM 토큰 등록 성공 후에도 알림 미도달 (2026-06-18)

### 증상
- v1.4.7 APK 설치 후 FCM 토큰 DB 등록 확인 (`[FCM] 토큰 등록 — user:10(한기섭) ...`)
- 그러나 작업 상태 변경, TBM 결재 등 알림 트리거 발생 시 기기에 알림 미도달

### 의심 원인 (현재 진단 중)

#### 원인 A (최우선 의심): NAS `.env`에 FCM 환경변수 미설정
- `src/fcm.ts`의 `sendFcmPushMulti()` 내부에서 환경변수 미설정 시 **조용히 실패**
  ```typescript
  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[FCM] 환경변수 미설정 — 발송 생략')
    return { sent: 0, failed: fcmTokens.length }  // ← 로그만 남기고 조용히 종료
  }
  ```
- 이전 `sendFcmToUsers()` 도 환경변수 체크 없이 `sendFcmPushMulti()` 에 위임 → 발송 실패 로그가 PM2 아웃 로그에 나타나지 않았음

#### 원인 B: FCM 발송 트리거 자체가 호출되지 않음
- `sendFcmToUsers()` 는 TBM 결재, 작업 상태 변경 등 특정 이벤트에서만 호출
- 테스트 중 해당 이벤트가 발생하지 않았을 가능성

#### 원인 C: Android 알림 채널 미등록
- `src/fcm.ts`에서 `channel_id: 'safetynote_push'` 지정
- Android 앱 내 해당 채널이 등록되지 않으면 알림이 수신되어도 표시 안 됨

### 해결 — 진단 도구 추가 (`d5bfc70`)

#### 1. `sendFcmToUsers()` / `sendFcmToRoles()` 로그 강화
- 환경변수 미설정 시 명시적 경고 로그 추가:
  ```
  [FCM] ⚠️ 환경변수 미설정 — FCM_PROJECT_ID:false FCM_CLIENT_EMAIL:false FCM_PRIVATE_KEY:false — 발송 생략 (target:[10])
  ```
- 발송 전 시도 로그 추가:
  ```
  [FCM] 발송 시도 — "작업상태 변경" → target:[10] tokens:1개
  [FCM] 발송 완료 — sent:1 failed:0 target:[10]
  ```

#### 2. `GET /api/push/diagnose` 신규 API
관리자/감독자 권한으로 FCM 전체 파이프라인 진단:
```bash
curl -sk https://linkmax.myds.me:3443/api/push/diagnose \
  -H "Authorization: Bearer [관리자토큰]"
```
응답 구조:
```json
{
  "env": {
    "FCM_PROJECT_ID": "✅ 설정됨 (safetynote-xxxxx)",
    "FCM_CLIENT_EMAIL": "✅ 설정됨 (firebase-adminsdk...)",
    "FCM_PRIVATE_KEY": "✅ 설정됨 (길이: 1678자)",
    "all_set": true
  },
  "oauth2": "✅ OAuth2 access_token 취득 성공 (FCM 서버 응답 확인됨)",
  "registered_tokens": { "count": 2, "users": [...] },
  "test_send": "(생략) test_token 쿼리 파라미터로 실제 발송 테스트 가능",
  "diagnosis": "✅ FCM 환경 정상 — 발송 가능 상태"
}
```

실제 기기 발송 테스트:
```bash
curl -sk "https://linkmax.myds.me:3443/api/push/diagnose?test_token=기기의_FCM_토큰" \
  -H "Authorization: Bearer [관리자토큰]"
```

#### 3. `GET /api/push/status` 강화
- `token_preview`: 토큰 앞 25자 미리보기 추가 (등록 여부 직관적 확인)
- `without_token`: 토큰 미등록 사용자 수 필드 추가

### 진단 순서 (NAS에서 실행)

```bash
# STEP 1: 환경변수 설정 여부 확인
grep -i "FCM_PROJECT\|FCM_CLIENT\|FCM_PRIVATE" /volume1/safetynote/.env

# STEP 2: PM2 로그에서 FCM 관련 로그 확인 (NAS git pull + restart 후)
grep -i "\[FCM\]" /root/.pm2/logs/safetynote-out.log | tail -20

# STEP 3: diagnose API 호출 (관리자 토큰 필요)
curl -sk https://linkmax.myds.me:3443/api/push/diagnose \
  -H "Authorization: Bearer [관리자토큰]"

# STEP 4: 환경변수 미설정 확인 시 → .env에 추가 후 restart
nano /volume1/safetynote/.env
# 아래 3줄 추가:
# FCM_PROJECT_ID=your-firebase-project-id
# FCM_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
# FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
pm2 restart safetynote

# STEP 5: 실기기 FCM 토큰으로 직접 발송 테스트
curl -sk "https://linkmax.myds.me:3443/api/push/diagnose?test_token=기기토큰" \
  -H "Authorization: Bearer [관리자토큰]"
```

### Firebase 서비스 계정 키 발급 방법
1. [Firebase Console](https://console.firebase.google.com) → 프로젝트 선택
2. 톱니바퀴 → **프로젝트 설정** → **서비스 계정** 탭
3. **새 비공개 키 생성** 클릭 → JSON 파일 다운로드
4. JSON 내용에서 추출:
   - `project_id` → `FCM_PROJECT_ID`
   - `client_email` → `FCM_CLIENT_EMAIL`
   - `private_key` → `FCM_PRIVATE_KEY` (줄바꿈 `\n` 그대로 유지)

### 진단 결과 (세션 33)
- FCM 환경변수 3개 모두 설정됨 ✅ (`grep -i FCM /volume1/safetynote/.env` 확인)
- `POST /api/push/send` 수동 테스트: `sent:2, failed:0` ✅ — FCM 서버 발송 정상
- **실기기에서 수동 발송 알림 수신 확인** ✅
- **그러나 서버 자동 발송(작업 상태 변경 등)은 미수신** ← 진짜 버그

### 근본 원인 확정
`tasks.ts`(Cloudflare용) `PATCH /:id/status` 핸들러에 **FCM 발송 코드가 없음**.
SSE(`broadcastToRoles`, `sendToUser`)만 있어서 앱이 백그라운드/종료 상태면 알림 도달 불가.

```
tasks.ts PATCH /:id/status 에:
  ✅ broadcastToRoles(['admin','supervisor'], ...)  ← SSE (앱 열려있을 때만)
  ✅ sendToUser(wid, ...)                           ← SSE (앱 열려있을 때만)
  ❌ sendFcmToUsers() 호출 없음                    ← 백그라운드 알림 없음
```

`tasks.ts`는 Cloudflare용 파일 → Node.js `https`/`crypto` 사용하는 `sendFcmToUsers()` 호출 불가.
→ **NAS 전용 PATCH 라우트를 `node-server.ts`에 추가해서 해결**.

### 해결 (`cc860f1`)
`node-server.ts`에 NAS 전용 `PATCH /api/tasks/:id/status` 라우트 추가:
- `app.route('/api/tasks', taskRoutes)` **앞**에 등록 (NAS에서 가로채도록)
- DB 업데이트: `working`/`work_completed`/`completed` 상태별 컬럼 처리
- SSE 알림 유지 (기존 동작 보존)
- `notifications` DB 저장 유지
- **FCM 발송 추가** (`tbm_done`/`working`/`work_completed`/`completed`/`cancelled`)
  - 대상: `관리감독자`/`총괄책임자`/`대표이사` + `admin`/`supervisor` + 배정 작업자 (본인 제외)

### ⚠️ 재발 방지 규칙 (RULE-005)
> `tasks.ts` (Cloudflare용)에 상태 변경/이벤트 발생 코드를 추가할 때,
> FCM 발송이 필요하면 반드시 `node-server.ts`에 NAS 전용 라우트를 별도로 추가해야 함.
> `tasks.ts`에서는 `Node.js https/crypto` 모듈 사용 불가 → `sendFcmToUsers()` 직접 호출 불가.

### 상태
- [x] **원인 확정** — tasks.ts에 FCM 발송 코드 누락
- [x] **해결 코드 배포** — `cc860f1` GitHub push 완료
- [ ] **NAS git pull + pm2 restart** — 실기기 테스트 필요
- [ ] 실기기 알림 수신 확인 (작업 상태 변경 시 알림 도달 여부)

### 연관 커밋
| 커밋 | 내용 |
|------|------|
| `d5bfc70` | FCM 진단 API + sendFcmToUsers 로그 강화 |
| `a65acc0` | diagnose 오탐 수정 + push/send 상세 결과 |
| `cc860f1` | **BUG-011 근본 해결 — 작업 상태 변경 FCM 발송 추가** |


---

## [BUG-012] 시스템 설정 수동 푸시 발송 실패 (2026-06-18)

### 증상
- 관리자 시스템 설정 → 푸시 알림 발송 버튼 클릭 시 `sent:0, failed:0` 반환
- FCM 환경변수가 설정되어 있고 `POST /api/push/send`는 200 응답이지만 실제 알림 미도달
- PM2 에러 로그에 아무 기록 없음

### 원인 분석

#### 원인 1: `tokens` 배열과 `targetUsers` 배열 **이중 조회 + 순서 불일치**
```typescript
// ❌ 기존 코드 — tokens 먼저 조회, targetUsers 별도 조회 (순서 다를 수 있음)
const rows = rawDb.prepare(`SELECT fcm_token FROM users WHERE ... ORDER BY ...`).all()
tokens = rows.map(r => r.fcm_token)  // 순서: DB 기본 정렬

const targetUsers = rawDb.prepare(`SELECT id, name, role, fcm_token FROM users WHERE ...`).all()
// → 두 번 조회 시 DB 내부 정렬이 다를 수 있음

const result = await sendFcmPushMulti(tokens, payload)
// result.details[0] → tokens[0] 기준
// userDetails[0]    → targetUsers[0] 기준 → 불일치 가능
```

`result.details[idx]`와 `targetUsers[idx]`의 순서가 달라지면:
- 무효 토큰 삭제가 엉뚱한 사용자 토큰 삭제
- 상세 결과 표시 오류

#### 원인 2: FCM 환경변수 미설정 시 조용한 실패 (기존 문제 — 이미 인지)
- `sendFcmPushMulti()`: 환경변수 없으면 `details: []` 반환
- `userDetails` 매핑: `d?.success ?? false` → 모두 false
- 응답: `sent:0, failed:0` (오해를 부르는 응답)

### 해결 (`node-server.ts`)

#### 1. FCM 환경변수 사전 체크 추가
```typescript
const _pid = process.env.FCM_PROJECT_ID   || ''
const _ce  = process.env.FCM_CLIENT_EMAIL || ''
const _pk  = process.env.FCM_PRIVATE_KEY  || ''
if (!_pid || !_ce || !_pk) {
  console.warn(`[FCM] ⚠️ 수동 발송 실패 — 환경변수 미설정 ...`)
  return c.json({ error: 'FCM 환경변수가 설정되지 않았습니다. ...', sent: 0, failed: 0 }, 500)
}
```
→ 미설정 시 즉시 500 에러 반환 + 명확한 에러 메시지

#### 2. `tokens`/`targetUsers` 단일 쿼리로 통합 (`ORDER BY id` 고정)
```typescript
// ✅ 수정 — 한 번만 조회, ORDER BY id로 순서 고정
targetUsers = rawDb.prepare(
  `SELECT id, name, role, fcm_token FROM users
   WHERE is_active=1 AND fcm_token IS NOT NULL AND fcm_token != ''
   ORDER BY id`
).all()
const tokens = targetUsers.map(u => u.fcm_token)  // 동일 순서 보장
```

#### 3. 무효 토큰 삭제 로직 — 인덱스 기반으로 수정
```typescript
// ✅ details[i] → targetUsers[i] 순서 일치 → 정확한 토큰 삭제
for (let i = 0; i < result.details.length; i++) {
  const d = result.details[i]
  if (d.error?.includes('UNREGISTERED') ...) {
    rawDb.prepare(`UPDATE users SET fcm_token = NULL WHERE fcm_token = ?`)
      .run(targetUsers[i]?.fcm_token)
  }
}
```

#### 4. notifications 저장 try-catch 추가
- `notifications` 테이블 없을 시 전체 발송 실패 방지

### ⚠️ 재발 방지 규칙 (RULE-006)
> `sendFcmPushMulti(tokens, payload)` 호출 전 반드시:
> 1. FCM 환경변수 3개 사전 체크 (미설정 → 즉시 에러 반환)
> 2. `tokens` 배열과 `userDetails` 배열은 **반드시 동일 쿼리에서 같은 순서로** 추출
>    (`ORDER BY id` 고정 또는 단일 배열에서 `.map()` 으로 파생)
> 3. `try-catch`로 notifications 저장 실패가 FCM 발송 결과를 가리지 않도록 분리

### 연관 커밋
- 수정 커밋: (이번 세션 34 커밋)

---

## [BUG-013-APK] APK 다운로드 파일명 버전 미포함 (2026-06-18)

### 증상
- `/api/dist/apk/download` 로 APK 다운로드 시 파일명이 `safetynote.apk`
- 버전 구분 없이 동일한 파일명 → 기기 저장 폴더에서 구분 불가

### 원인
```typescript
// ❌ 기존
c.header('Content-Disposition', 'attachment; filename="safetynote.apk"')
```
버전 정보가 `system_settings.apk_version`에 있는데 파일명에 반영 안 됨

### 해결
```typescript
// ✅ 수정
const apkVersion = getSetting('apk_version') || ''
const apkFilename = apkVersion ? `safetynote-v${apkVersion}.apk` : 'safetynote.apk'
c.header('Content-Disposition', `attachment; filename="${apkFilename}"`)
```
→ `safetynote-v1.4.7.apk` 형태로 다운로드

### 영향 범위
- `GET /api/dist/apk/download` 핸들러만 수정
- 파일 저장 경로(서버 내부)는 변경 없음 (`safetynote.apk` 그대로 유지)
- 다운로드 시 브라우저/DownloadManager가 수신하는 `Content-Disposition` 파일명만 변경

---

## [BUG-017] TBM 안전조치 사진 등록 창이 기존 팝업 뒤에 표시됨 (2026-06-18)

### 증상
- "TBM 안전조치 사진 등록" 창이 최상위로 열리지 않고 기존 팝업(작업상세 모달 등) 뒤에 숨어 보임

### 원인
- `showTbmPhotoModal()` 함수에서 `document.body.appendChild(modal)` 호출 시
  별도 z-index 설정이 없었음
- 기존 모든 `.modal-overlay`가 CSS에서 `z-index: 1000`으로 고정되어 있어
  새로 추가된 TBM 사진 등록 모달이 기존 모달과 동일한 레이어에 쌓임
- DOM에 나중에 추가되어도 동일 z-index인 경우 스태킹 컨텍스트 순서에 의해
  기존 모달 위에 제대로 표시되지 않을 수 있음

### 해결 (`9a30fe8`)
```javascript
// showTbmPhotoModal() 함수 — document.body.appendChild 직전에 z-index 강제 설정
modal.style.zIndex = '10020';  // 기존 모달(1000), 다른 최상위 모달(10010)보다 높게
document.body.appendChild(modal);
```
- 캐시버전: `v=20260618a` → `v=20260618b`

### 영향 범위
- `showTbmPhotoModal()` 함수만 수정
- 다른 모달 z-index는 변경 없음

### 재발 방지
- 팝업 위에 팝업을 띄울 때는 반드시 `modal.style.zIndex` 명시적 설정 필요
- 현재 앱의 z-index 계층:
  - 일반 모달: `1000` (CSS `.modal-overlay`)
  - 알림/로딩 등: `10000`
  - TBM 서명/사진 모달: `10010`
  - **TBM 안전조치 사진 등록 모달: `10020` (최상위)**


---

## [BUG-021] 수동 푸시 발송 UI — FCM 토큰 0명 케이스 무응답처럼 보임 (2026-06-18)

### 증상
- 관리자 시스템 설정 → 수동 푸시 알람 발송 클릭 시
  `sent:0, failed:0` 결과가 반환되어 발송된 것도 아니고 에러도 아닌 상태로 표시됨
- 기존 UI: `"발송 완료 ✅ 성공: 0명 / 실패: 0명"` 토스트 → 사용자가 동작 안 함으로 인식

### 근본 원인
- `users.fcm_token` 컬럼에 등록된 토큰이 없음 (`with_token: 0`)
  → `/api/push/send` 호출 시 `{ success:true, sent:0, failed:0, total:0, message:'등록된 FCM 토큰 없음' }` 반환
- **서버 자체는 정상 동작** — 단지 DB에 토큰이 없을 뿐
- UI에서 `total:0` / `sent:0, failed:0` 케이스를 성공과 동일하게 처리해 사용자 혼동 유발

### FCM 토큰 미등록 원인 (참고)
- Android `onNewToken()` 은 **앱 최초 설치 / 토큰 갱신 시에만** 자동 호출됨
- 기존 설치 기기: `saveAuthToken()` → `triggerFcmRegistration()` 흐름으로 로그인 시 재등록 시도
- HTTP 3444 포트 연결 실패 시 조용히 실패 → DB에 토큰 미저장 가능
- 해결 방법: 앱에서 로그아웃 후 재로그인 (triggerFcmRegistration 재호출)

### 해결 (`e86553f`)

#### 1. `public/static/app.js` — `_loadFcmStatus()` 개선
```javascript
// with_token === 0 이면 RED 경고 배너 표시
const isZero = with_token === 0;
bar.className = 'mb-4 p-3 rounded-xl border text-xs ' +
  (isZero ? 'bg-red-50 border-red-300 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700');
bar.innerHTML = isZero
  ? `FCM 토큰 등록된 기기 없음 — 앱에서 로그인해야 토큰이 등록됩니다. (전체 ${total}명 중 0명)`
  : `... 정상 진행률 바 ...`;
```

#### 2. `public/static/app.js` — `sendManualPush()` 개선
```javascript
// 발송 전 /push/status 사전 확인 → with_token:0 이면 즉시 에러 토스트
const statusRes = await API.get('/push/status');
const { total, with_token } = statusRes.data;
if (with_token === 0) {
  toast(`FCM 토큰 등록된 앱 기기가 없습니다 (전체 ${total}명 중 0명).\n앱에서 로그인해야 토큰이 등록됩니다.`, 'error');
  return;
}

// 발송 후 케이스별 다른 메시지
if (total === 0 || (sent === 0 && failed === 0)) {
  toast(message || `발송 대상 없음 — 「${targetLabel}」 중 앱 로그인 사용자 없음`, 'warning');
} else if (sent === 0 && failed > 0) {
  toast(`⚠️ 전송 실패: ${failed}명 모두 실패. FCM 토큰이 만료되었을 수 있습니다.`, 'error');
} else {
  toast(`발송 완료 ✅  성공: ${sent}명 / 실패: ${failed}명 (전체: ${total}명)`, 'success');
}
```

#### 3. `node-server.ts` — `POST /api/push/register` 로그 강화
```typescript
// 등록 전후 토큰 수 출력 → 3444 포트 접근 및 DB 저장 확인 가능
const beforeCount = rawDb.prepare(`SELECT COUNT(*) as cnt FROM users WHERE fcm_token IS NOT NULL AND fcm_token != ''`).get().cnt;
rawDb.prepare(`UPDATE users SET fcm_token = ? WHERE id = ?`).run(fcm_token, user.id);
const afterCount = rawDb.prepare(`SELECT COUNT(*) as cnt FROM users WHERE fcm_token IS NOT NULL AND fcm_token != ''`).get().cnt;
console.log(`[FCM] 토큰 ${isUpdate ? '갱신' : '신규등록'} — user:${user.id}(${user.name}) | DB 등록 기기: ${beforeCount} → ${afterCount}개`);
```

#### 4. 캐시버전: `v=20260618b` → `v=20260618c`

### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `public/static/app.js` | `_loadFcmStatus()` RED 경고 배너 + `sendManualPush()` 사전확인 + 케이스별 메시지 |
| `node-server.ts` | 캐시버전 업데이트 + push/register 로그 강화 |

### ⚠️ BUG-012 재발 방지 확인 사항
- `push/send` 토큰 순서 버그 (BUG-012): **단일 쿼리 ORDER BY id** — 변경 없음 ✅
- FCM 환경변수 사전 체크: `_pid/_ce/_pk` 확인 → 미설정 시 500 반환 — 변경 없음 ✅
- `tokens[]` / `targetUsers[]` 동일 순서 보장 — 변경 없음 ✅

### 재발 방지 규칙
- `total:0` 또는 `sent:0, failed:0` 응답은 반드시 **별도 케이스로 처리**
  → 성공 토스트 절대 금지, warning 또는 error 토스트 필수
- FCM 토큰 등록 현황은 발송 전 UI에서 **시각적으로 명확히 표시** (RED 경고)
- `push/register` 로그에 등록 전후 토큰 수 출력으로 트러블슈팅 용이화


---

## [BUG-022] 수동 푸시 발송 버튼 클릭 시 아무 반응 없음 (2026-06-18)

### 증상
- 관리자 시스템 설정 → 제목/내용 입력 후 "푸시 알림 발송" 버튼 클릭 시
  확인 다이얼로그도 안 뜨고 아무 반응 없음
- 서버 로그에도 아무 기록 없음

### 근본 원인
`sendManualPush()` 내부에서 존재하지 않는 `showConfirm()` 함수 호출:
```javascript
// ❌ 잘못된 코드 — showConfirm 함수 미존재
const confirmed = await showConfirm(`「${targetLabel}」에게 ...`);
if (!confirmed) return;  // undefined → !undefined = true → 즉시 return
```
- `showConfirm()` 는 앱에 정의되지 않은 함수
- `await undefined` → `undefined` 반환
- `!confirmed` → `!undefined` → `true` → 즉시 `return`
- 결과: 버튼 클릭 시 **아무 반응 없이 즉시 종료**

실제 확인 다이얼로그 함수명: **`showConfirmDialog(title, message, confirmLabel, cancelLabel, type)`**

### ⚠️ 재발 방지 규칙
- 확인 다이얼로그 호출 시 반드시 `showConfirmDialog()` 사용
- 단축 헬퍼: `showDeleteConfirm`, `showWarningConfirm`, `showInfoConfirm`, `showSuccessConfirm`
- `showConfirm` 이라는 이름의 함수는 **존재하지 않음** — 절대 사용 금지

### 해결 (`fcabd66`)
```javascript
// ✅ 수정된 코드 — showConfirmDialog 올바른 호출
const confirmed = await showConfirmDialog(
  `「${targetLabel}」에게 푸시 알림을 발송하시겠습니까?`,
  `제목: ${title}\n내용: ${body}`,
  '발송', '취소', 'info'
);
```
- 캐시버전: `v=20260618c` → `v=20260618d`

### BUG-021과의 관계
- BUG-021: `total:0` 응답을 UI에서 명확히 구분 못함 → 해결됨
- BUG-022: 버튼 자체가 동작 안 함 (`showConfirm` 미존재) → 이번에 해결
- 두 버그가 겹쳐서 "수동 푸시 발송 기능이 동작 안 함"으로 보였음

### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `public/static/app.js` | `showConfirm` → `showConfirmDialog` (line ~14904) |
| `node-server.ts` | 캐시버전 `v=20260618c` → `v=20260618d` |

---

## [BUG-023] 알림센터 전체 삭제 후 재로그인 시 알림 기록 복원됨 (2026-06-19)

### 발견 경위
- 파일럿 테스트 중 발견 (세션 37)
- ⚠️ **미수정 상태** — 기록만 보관, 추후 일괄 처리 예정

### 증상
1. 상단 메뉴 알림센터(🔔) 진입
2. "전체 삭제" 실행 → UI상 알림 목록이 비워짐 (정상처럼 보임)
3. 로그아웃 후 재로그인
4. 알림센터 재진입 → **삭제된 알림 기록이 그대로 남아 있음**

### 예상 원인 (미확인 — 수정 전 검증 필요)
- **가설 A**: 전체 삭제 API 호출 자체가 실패하고 있으나 UI가 성공으로 처리
  - 삭제 API 응답 코드 미검증 가능성
- **가설 B**: 삭제가 클라이언트 상태(메모리)에서만 이루어지고 DB에 미반영
  - `DELETE /api/notifications` 또는 유사 엔드포인트의 실제 DB 처리 누락
- **가설 C**: 소프트 삭제(soft delete) 방식인데 조회 시 필터 미적용
  - `is_deleted` 또는 `read_at` 플래그만 변경하고 실제 레코드 미삭제

### 확인이 필요한 항목 (수정 전 점검)
- [ ] 전체 삭제 버튼 클릭 시 호출되는 API 엔드포인트 확인 (`app.js`)
- [ ] 해당 API의 서버 처리 로직 확인 (`node-server.ts` 또는 `src/routes/notifications.ts`)
- [ ] DB에서 실제 레코드 삭제 여부 확인 (`DELETE FROM notifications WHERE user_id = ?`)
- [ ] 조회 API에서 삭제된 항목 필터링 여부 확인

### 우선순위
- 🟡 **중간** — 데이터 손실은 아니나 사용자 혼란 유발, 파일럿 테스트 완료 후 수정 예정

### 변경 파일
- 미정 (수정 전 원인 확인 필요)

### ✅ 해결 (`40eef26`) — 세션 38

#### 근본 원인 확정
`clearNotifHistory()`가 클라이언트 메모리(`_notifHistory` 배열)만 비울 뿐,  
서버 DB에 **DELETE API를 전혀 호출하지 않음**.  
또한 `notifications.ts`에 전체 삭제 엔드포인트 자체가 없었음.

```
[기존 동작]
전체삭제 버튼 클릭
    → clearNotifHistory() 호출
    → _notifHistory.length = 0  (메모리만 삭제)
    → UI 비워짐 (정상처럼 보임)
    → 재로그인 시 DB에서 다시 조회 → 알림 복원됨 ❌

[수정 후 동작]
전체삭제 버튼 클릭
    → clearNotifHistory() 호출
    → DELETE /api/notifications/clear-all (서버 DB 삭제)
    → 성공 시 _notifHistory.length = 0 + UI 갱신
    → 재로그인 시 DB에 데이터 없음 → 빈 목록 ✅
```

#### 수정 내용

**1. `src/routes/notifications.ts` — 전체 삭제 API 추가 (Cloudflare용)**
```typescript
// DELETE /api/notifications/clear-all
app.delete('/clear-all', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  await c.env.DB.prepare(`DELETE FROM notifications WHERE user_id = ?`).bind(user.id).run()
  return c.json({ success: true })
})
```

**2. `node-server.ts` — NAS 전용 전체 삭제 라우트 추가 (RULE-002 준수)**
```typescript
// app.route('/api/notifications', notificationRoutes) 앞에 등록
app.delete('/api/notifications/clear-all', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  rawDb.prepare(`DELETE FROM notifications WHERE user_id = ?`).run(user.id)
  console.log(`[알림] 전체삭제 — user:${user.id}(${user.name})`)
  return c.json({ success: true })
})
```

**3. `public/static/app.js` — clearNotifHistory() API 호출로 수정**
```javascript
// [BUG-023] 메모리만 삭제 → API 호출 후 메모리/UI 갱신으로 수정
async function clearNotifHistory() {
  try {
    await API.delete('/notifications/clear-all')
  } catch (e) {
    toast('알림 삭제 중 오류가 발생했습니다.', 'error')
    return
  }
  _notifHistory.length = 0
  _unreadCount = 0
  updateNotifBadge()
  renderNotifPanel()
}
```

### ⚠️ 재발 방지 규칙
- **UI에서 "삭제" 동작은 반드시 서버 API 호출 포함** — 메모리/UI만 바꾸는 것은 임시처리
- 새 API 엔드포인트 추가 시: `src/routes/` (Cloudflare용) + `node-server.ts` (NAS용) 동시 추가
- NAS 전용 라우트는 반드시 `app.route()` 마운트 **앞**에 등록 (RULE-002)

### 변경 파일 (최종)
| 파일 | 변경 내용 |
|------|-----------|
| `src/routes/notifications.ts` | `DELETE /clear-all` 엔드포인트 추가 |
| `node-server.ts` | NAS 전용 `DELETE /api/notifications/clear-all` 라우트 추가 (RULE-002 준수) + 캐시버전 `v=20260619a` |
| `public/static/app.js` | `clearNotifHistory()` → async 함수로 변경, API 호출 후 UI 갱신 |
| `scripts/rollback.sh` | `pre-bug023` 항목 추가 (커밋 `f98fb2e`) |

---

## TASK-001 — 공사 삭제 기능 (신규)
- **날짜**: 2026-06-21
- **커밋**: `7ddd3c1`

### 문제
공사 상세 화면에 수정 버튼만 있고 삭제 버튼이 없었음.

### 해결

**1. `app.js` — 공사 상세 하단 삭제 버튼 + deleteConstruction() 함수 추가**
- 하단 `modal-footer`를 `justify-between` 2열로 변경 (좌: 삭제, 우: 수정+상태)
- `deleteConstruction(conId)`: `showConfirmDialog` → `API.delete` → 목록 갱신

**2. `node-server.ts` — NAS 전용 삭제 라우트 (RULE-002 준수)**
```typescript
// app.route('/api/constructions', constructionRoutes) 앞에 등록
app.delete('/api/constructions/:id', async (c) => {
  // 연결 tasks 존재 시 409 차단
  const linked = rawDb.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE construction_id = ?`).get(id)
  if (linked.cnt > 0) return c.json({ error: `연결된 작업 ${linked.cnt}건 — 차단` }, 409)
  rawDb.prepare(`DELETE FROM constructions WHERE id = ?`).run(id)
  return c.json({ success: true })
})
```

**3. `src/routes/constructions.ts` — Cloudflare용 DELETE /:id 추가**

### ⚠️ 재발 방지 규칙
- 삭제 API는 반드시 **연결 데이터 존재 여부 먼저 확인** 후 차단 (409)
- 삭제 버튼은 항상 좌측, 일반 액션 버튼은 우측 (UX 일관성)

---

## TASK-003 — 공사요청번호 자동부여 (LM_YY.MM.DD_##)
- **날짜**: 2026-06-21
- **커밋**: `7ddd3c1`

### 내용
공사 신규 등록 시 수동 12자리 숫자 입력 대신 `LM_YY.MM.DD_##` 형식 자동부여 옵션 추가.

### 해결

**1. `app.js` — UI + 함수 수정**
- `cReqNo` 블록에 `자동부여` 체크박스 추가 (신규 등록 시만 표시)
- `_toggleReqNoAuto(checked)`: KST 날짜 계산 → `/api/constructions/request-no-seq` 호출 → 입력란 채움
- `saveConstruction()`: `dataset.autoNo === '1'` 시 12자리 숫자 검증 건너뜀

**2. `node-server.ts`** — `GET /api/constructions/request-no-seq` (TASK-003, RULE-002 준수)
- LM_ prefix 기반 COUNT+1 방식으로 순번 계산

### ⚠️ 재발 방지 규칙
- 자동부여 번호는 `dataset.autoNo` 플래그로 직접입력과 구분
- 저장 검증 분기 시 `isAutoNo` 변수 명시적으로 선언 후 사용

---

## [BUG-021] TASK-004 시스템설정 5탭 개편 후 웹 접속 불가 (2026-06-21)

### 증상
- TASK-004 NAS 적용(`pm2 restart`) 후 웹 페이지 전체 접속 불가
- 서버는 정상 기동(`pm2 status: online`) 되지만 브라우저에서 화면이 안 열림

### 원인
- `renderAdminSettingsPage()` 재작성 시 **구버전 HTML 코드 538줄이 JS 파일 내 템플릿 리터럴 밖**에 남음
- 14860번에서 `container.innerHTML` 백틱이 닫힌 후, 14862~15398번 사이에 구버전 HTML이 그대로 노출
- HTML 주석(`<!-- 헤더 -->`)이 JS 코드 영역에 위치 → 브라우저 JS 파싱 오류 발생
- 페이지 JS 전체가 실행 안 되어 화면이 빈 상태로 표시

### 확인 방법
```bash
node --check public/static/app.js
# SyntaxError: HTML comments are not allowed in modules
# at line 14862: <!-- 헤더 -->
```

### 해결
- 14861~15398번 줄 (구버전 HTML 잔해 538줄) `sed -i '14861,15398d'` 로 삭제
- 커밋: `eccdd25` — fix: TASK-004 renderAdminSettingsPage 구버전 HTML 잔해 제거

### 재발 방지
- `renderAdminSettingsPage()` 같은 대형 HTML 블록 재작성 시, **기존 함수 전체 범위를 확인 후 교체**할 것
- 수정 후 반드시 `node --check public/static/app.js` 실행하여 JS 문법 검증
- 특히 템플릿 리터럴(`` ` ``) 닫는 위치 확인 필수

---

## [BUG-022] 접속일보 폼 단가 공란 — mkItemRow itemKey 불일치 (2026-06-21)

### 증상
- 접속일보 작성 폼 공종별 작업량 테이블에서 단가 셀 공란
  - 광커넥터 현장조립/취부, 광탭 결합/고정 작업, FTTH 레벨 측정시험 3개 항목
- 단가 관리 화면에서 기본단가를 입력해도 폼에서 반영 안 됨

### 원인
- `mkItemRow` 함수 내 `itemKey` 변환이 단순 치환(공백·슬래시 제거)만 사용
  ```
  '광커넥터 현장조립/취부' → '광커넥터현장조립취부'  ≠  DB key '광커넥터현장조립'
  '광탭 결합/고정 작업'   → '광탭결합고정작업'      ≠  DB key '광탭결합고정'
  'FTTH 레벨 측정시험'    → 'FTTH레벨측정시험'      ≠  DB key 'FTTH레벨측정'
  ```
- 세션 48에서 `_spliceLabelToKey` 역방향 맵을 `공량내역` 계산부에만 적용,
  `mkItemRow`에는 미적용 상태였음

### 해결
- `_mkLabelToKey` 맵 + `mkLabelToKey()` 헬퍼를 `mkItemRow` 바로 앞에 선언
- SPLICE_ITEMS_DEF label→key 직접 매핑 우선, 폴백: 공백/슬래시 제거
- hasPricePreview=false → `—` 에서 `단가없음` 텍스트로 명확화
- total=0 → `—` 에서 `기본단가 0원`으로 명확화 (사용자가 "X"로 오인하던 문제 해결)
- 캐시버전: `v=20260621j` → `v=20260621k`

### 커밋
`4bb3084` — fix: 접속일보 폼 단가 공란 수정 — mkItemRow에 SPLICE_ITEMS_DEF 역방향 맵 적용

### "X" 표시 설명
사용자가 문의한 "X" 표시의 실체:
1. **단가 셀 공란/—**: `hasPricePreview=false`인 커스텀 항목에 `—` 대시 표시
2. **커스텀 행 삭제 버튼**: `<i class="fas fa-times">` 아이콘 — 삭제(✕) 버튼 (정상)
3. **야간/가공 비해당**: `has_aerial=false` 항목의 가공 체크박스 위치에 `—` 대시 (정상)
→ 이번 수정으로 "—"를 "단가없음"/"기본단가 0원"으로 교체하여 의미 명확화

---

## [BUG-023] 접속일보 로드 실패 — _mkLabelToKey before initialization (2026-06-21)

### 증상
- 작성 완료된 접속일보 열람(renderSpliceReportForm) 시 화면 로드 실패
- 에러: `Cannot access '_mkLabelToKey' before initialization`

### 원인
- 세션51 단가관리 개편 과정에서 `renderWorkReportForm` 내 코드 순서 역전
  - `const _mkLabelToKey = {}` 선언: 27926번
  - `_mkLabelToKey` 참조(`customItems` 필터): 27898번
  - **선언보다 참조가 먼저** → `const` TDZ(Temporal Dead Zone) 에러
- 잘못된 방어코드 `typeof _mkLabelToKey === 'function'` 도 TDZ를 피하지 못함
  (`const`는 typeof 체크 시에도 TDZ 안에 있으면 에러 발생)

### 해결 (커밋 `66e5adc`)
- `_mkLabelToKey` / `mkLabelToKey` 선언 블록을 `customItems` 사용 **앞**으로 이동
- 잘못된 `typeof _mkLabelToKey === 'function'` 방어코드 제거 → `mkLabelToKey(...)` 직접 호출로 교체

### ⚠️ 재발 방지 규칙
- `const` / `let` 선언은 **반드시** 첫 사용 앞에 위치시킬 것
- 대형 함수 내 코드 이동 시 선언-사용 순서 반드시 재확인
- `typeof 변수 === 'function'` 패턴은 `const`/`let` TDZ를 피하지 못함
- BUG-001 3단계 (`let` TDZ)와 동일 패턴 — **`var` 사용** 또는 **선언을 앞으로 이동**

---

## [BUG-024] 공량내역 로드 실패 — extrasSnapMap before initialization (2026-06-21)

### 증상
- 공량내역 메뉴 접근 시 `공량내역 로드 실패: Cannot access 'extrasSnapMap' before initialization`

### 원인
- `renderFlowReportPage` 내 코드 순서 역전
  - `_frCacheExtrasSnap = extrasSnapMap` 대입: 25468번
  - `const extrasSnapMap = {}` 선언: 25486번
  - **선언보다 18줄 앞**에서 참조 → `const` TDZ 에러

### 해결 (커밋 `66e5adc`)
- 25468번의 `_frCacheExtrasSnap = extrasSnapMap` 라인 제거
- `extrasSnapMap` 선언(25486) 직후에 `_frCacheExtrasSnap = extrasSnapMap` 대입 추가

### ⚠️ 재발 방지 규칙
- BUG-023과 동일: `const` 선언은 사용 앞에 위치
- `_frCache*` 캐시 등록은 해당 변수 선언 직후에 수행

---

## [BUG-025] 외선 단가관리 단위 수정 저장 안 됨 (2026-06-21)

### 증상
- 단가관리 외선 탭에서 단위 셀 클릭 → 값 수정 → 저장 클릭
- "✅ 저장되었습니다" 메시지 표시됨
- 하지만 페이지 새로고침 시 단위가 원래 값으로 돌아옴

### 원인 (2단계 복합)

#### 1단계: node-server.ts PUT API 분기 오류
```typescript
// 기존 코드 (잘못됨)
const label = (p.item_label || '').trim() || undefined
if (label) {
  stmtFull.run(price, label, unit, p.item_key)  // 공종명+단위 저장
} else {
  stmtPrice.run(price, p.item_key)  // ← 단가만! unit 무시
}
```
`item_label`이 없으면(undefined) 무조건 `stmtPrice`(단가만)로 빠짐 → unit 변경사항 버려짐

#### 2단계: app.js _saveUnitPrices() labelInputs 수집 오류
```javascript
// 기존 코드 (잘못됨)
const v = (el.value || '').trim();
if (v) dataMap[k].item_label = v;  // ← 빈값이면 item_label 자체를 dataMap에서 제외
```
공종명을 수정하지 않으면 `item_label = undefined` → 서버에서 1단계 조건 진입 → unit 무시

### 해결 (커밋 `2d00b56`)
**node-server.ts**: `stmtUnit` 추가 (단가+단위만 업데이트, 공종명 기존값 유지)
- `label O + unit O` → `stmtFull` (전체 업데이트)
- `label X + unit O` → `stmtUnit` (단가+단위, 공종명 기존값 유지)
- `label O + unit X` → DB에서 기존 unit 조회 후 `stmtFull`
- `label X + unit X` → `stmtPrice` (단가만)

**app.js**: `labelInputs` 수집 시 빈값도 `undefined`로 명시 전송
→ 서버에서 `unit !== undefined` 조건으로 단위 저장 여부 판단 가능

### ⚠️ 재발 방지 규칙
- 복합 조건 UPDATE 분기: 각 필드의 **존재 여부(undefined 체크)**와 **빈값 여부**를 분리하여 처리
- `item_label`이 없어도 `unit`이 있으면 반드시 unit 저장 경로로 진입해야 함
- 프론트엔드에서 "현재값 유지" 의도를 서버에 명확히 전달할 것 (undefined vs 빈string 구분)

---

## [BUG-026] 외선 단위 수정 저장 후에도 화면에 반영 안 됨 (2026-06-21)

### 증상
- BUG-025 수정 후에도 단위 수정이 안 되는 것처럼 보임
- 단위를 수정 → 저장 → 새로고침 → 여전히 기존 값(식)으로 표시

### 원인
`GET /api/volume-unit-prices` SELECT 쿼리에 `unit` 컬럼 누락

```typescript
// 잘못된 코드
SELECT item_key, item_label, unit_price, sort_order
// ↑ unit 없음 → p.unit = undefined → 화면: '식' (기본값) 고정
```

DB에는 저장이 됐지만 조회 시 unit을 안 읽어오니 항상 기본값만 표시.
BUG-025 수정으로 저장 로직은 고쳤지만 조회 로직을 빠뜨린 것.

### 해결 (커밋 `d6bc5a4`)
```typescript
// 수정된 코드
SELECT item_key, item_label, unit_price, unit, sort_order
```
한 줄 수정 — `unit` 컬럼 SELECT에 추가

### ⚠️ 재발 방지 규칙
- 컬럼 추가(ALTER TABLE) 후 반드시 해당 컬럼을 **SELECT 쿼리에도 추가** 확인
- 신규 컬럼을 저장(UPDATE/INSERT)만 하고 조회(SELECT)에 빠뜨리면
  저장은 됐지만 화면에 반영 안 되는 증상으로 나타남 (디버깅 어려움)

## [BUG-027] LGU+ 기능 적용 후 사용자 등록 500 오류 (2026-06-22)

### 증상
- 사용자 등록 폼에서 등록 버튼 클릭 시 `POST /api/auth/register 500 (Internal Server Error)`
- 화면에 "등록 중 오류가 발생했습니다." 토스트 메시지

### 원인 (2가지 복합)

**원인 1: auth.ts는 Cloudflare용 — NAS에서 c.env.DB 없음**
`src/routes/auth.ts`의 `/register` 라우트는 `c.env.DB.prepare()` (Cloudflare D1 API)를 사용.
NAS 환경에서는 `c.env.DB`가 존재하지 않아 즉시 500 발생.

**원인 2: users.permissions 컬럼 NAS DB에 없음**
`auth.ts`의 INSERT 쿼리가 `permissions` 컬럼에 값을 넣으려 했으나
NAS의 `safety.db`에 해당 컬럼이 없어 `table users has no column named permissions` 오류.

### 해결 (커밋 `f019ebb`)

1. **patchSchema v0.142에 `users.permissions` 컬럼 ADD** (서버 시작 시 자동 추가)
```typescript
rawDb.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL")
```

2. **NAS 전용 오버라이드 라우트 등록** (RULE-002 준수 — `app.route()` 앞에 등록)
```typescript
// app.route('/api/auth', authRoutes) 앞에:
app.post('/api/auth/register', async (c) => {
  // rawDb(better-sqlite3 동기 API)로 직접 처리
  rawDb.prepare('INSERT INTO users (...) VALUES (...)').run(...)
})
app.post('/api/auth/bulk-register', async (c) => { ... })
```

### ⚠️ 재발 방지 규칙 (RULE-003 신설)
- **Cloudflare용 라우트(`c.env.DB`)를 NAS에서 그대로 마운트하지 말 것**
- `src/routes/*.ts` 파일에 `c.env.DB`가 있으면 NAS에서 반드시 오버라이드 필요
- 오버라이드는 항상 `app.route()` 앞에 등록 (RULE-002)
- NAS DB 스키마에 없는 컬럼은 patchSchema에서 `ALTER TABLE ADD COLUMN`으로 보완

---

## [BUG-028] LGU+ 설정 화면 알림 조건 설명 오류 (2026-06)

### 증상
- 시스템 설정 → LGU+ 권한 설정 탭의 알림 설명이
  **"요청번호가 1로 시작하는 공사"** 로 표시됨
- 실제 구현은 `is_auto_request_no=1`(자동부여 체크) 기반인데 UI 설명만 구버전 텍스트

### 원인
- v0.142 초기 구현 시 잘못된 조건(`request_no LIKE '1%'`)을 UI 설명에 반영
- v0.143에서 백엔드 로직은 `is_auto_request_no=1`로 수정했으나 **UI 텍스트만 미수정**
- 영향 범위:
  1. `app.js` line 15029 — 설정 탭 알림 섹션 설명 문구
  2. `node-server.ts` — `system_settings` lgu_notify_* `description` 컬럼 (DB 저장값)

### 해결 (`세션 59`)
1. `app.js` — 알림 설명 텍스트 수정
   - ❌ 구: `요청번호가 1로 시작하는 공사에 연계된 작업`
   - ✅ 신: `공사 등록 시 "공사요청번호 자동부여"를 체크한 공사에 연계된 작업`
2. `app.js` — 부가 설명 추가
   - `자동부여 체크 공사만 LGU+ 알림·조회 대상입니다. 수동 입력 공사는 LGU+ 접근이 차단됩니다.`
3. `node-server.ts` — patchSchema v0.143 확장: lgu_notify_* description 6개 전부 UPDATE
4. `node-server.ts` — system_settings INSERT 기본값 텍스트도 동일하게 수정

### ⚠️ 재발 방지
- 백엔드 로직 조건 변경 시 **UI 설명 텍스트(app.js)와 DB description 값도 반드시 동시에 수정**
- `system_settings`의 `description` 컬럼은 patchSchema UPDATE로 기존 DB 행도 교정

---

## [BUG-029] 체크리스트 완료 500 에러 — ci.text 컬럼 없음 (2026-06)

### 증상
- 체크리스트 완료 버튼 클릭 시 `PATCH /api/checklist/:id/complete 500` 에러
- NAS 에러 로그: `[checklist PATCH NAS /:id/complete] no such column: ci.text`

### 원인
- `node-server.ts` NAS 전용 `PATCH /api/checklist/:id/complete` 라우트에서
  `checklist_items` 테이블 JOIN 시 존재하지 않는 컬럼명 `ci.text` 사용
- 실제 `checklist_items` 테이블의 질문 컬럼명은 `question`
- Cloudflare용 `src/routes/checklist.ts`는 `ci.question`을 올바르게 사용 중

### 해결
```typescript
// ❌ 구 (잘못된 컬럼명)
SELECT cr.*, ci.text, ci.category FROM checklist_responses cr
JOIN checklist_items ci ON ci.id = cr.item_id
WHERE cr.assessment_id = ? AND cr.response = 'no'

// ✅ 신 (올바른 컬럼명)
SELECT cr.*, ci.question, ci.category FROM checklist_responses cr
JOIN checklist_items ci ON ci.id = cr.item_id
WHERE cr.assessment_id = ? AND cr.response = 'no'
```

### ⚠️ 재발 방지
- `node-server.ts` NAS 전용 라우트 작성 시 **반드시 `src/routes/*.ts` 파일의 동일 쿼리와 컬럼명 대조**
- `checklist_items` 컬럼: `id`, `category`, `question`, `note`, `sort_order`, `work_class`, `is_active`
- `text` 컬럼은 존재하지 않음

---

## [BUG-030] LGU+ 설정 화면 알림 조건 설명 방향 오류 (2026-06)

### 증상
- 시스템 설정 → LGU+ 역할 알림 수신 단계 섹션에
  **"공사 등록 시 '공사요청번호 자동부여'를 체크한 공사에 연계된 작업"** 으로 표시됨
- 실제 구현은 `is_auto_request_no=0`(자동부여 **미체크**, 수동 입력) 공사가 LGU+ 알림 대상인데
  UI 설명이 **반대**(체크한 공사)로 기술됨

### 원인
- BUG-028(세션 59) 수정 시 `is_auto_request_no=1`(자동부여 **체크**) 공사만 LGU+ 접근 허용으로
  잘못 이해하여 설명 텍스트를 "체크한 공사" 방향으로 작성
- 실제 로직: `is_auto_request_no=1`이면 LGU+ 접근 **차단**, `is_auto_request_no=0`(미체크)이면 LGU+ **허용**
- **⚠️ 중요**: 접근 차단 로직(`showConstructionDetail`, `renderTasksPage`)의 조건
  `is_auto_request_no !== 1` (1이 아니면 허용, 1이면 차단) 은 코드상 올바름 — **UI 설명만 오류**

### 수정 범위
1. `app.js` line 15029 — 알림 섹션 메인 설명 문구
   - ❌ 구: `"공사요청번호 자동부여"를 체크한 공사에 연계된 작업`
   - ✅ 신: `"공사요청번호 자동부여"를 미체크한(수동 입력) 공사에 연계된 작업`
2. `app.js` line 15030 — 부가 설명 문구
   - ❌ 구: `자동부여 체크 공사만 LGU+ 알림·조회 대상입니다. 수동 입력 공사는 LGU+ 접근이 차단됩니다.`
   - ✅ 신: `자동부여 미체크(수동 입력) 공사만 LGU+ 알림·조회 대상입니다. 자동부여 체크 공사는 LGU+ 접근이 차단됩니다.`
3. `node-server.ts` line 1848~1853 — system_settings INSERT 기본값 6개 description
   - ❌ 구: `(공사요청번호 자동부여 체크 공사만 해당)`
   - ✅ 신: `(공사요청번호 자동부여 미체크 공사만 해당)`
4. `node-server.ts` line 1904~1909 — patchSchema v0.143 UPDATE 딕셔너리 6개 동일 교정

### ⚠️ 재발 방지
- **LGU+ 접근 제어 방향 정리**:
  - `is_auto_request_no = 1` (자동부여 체크) → LGU+ **접근 차단** (공사 상세 조회 불가, 작업 목록 필터 제외)
  - `is_auto_request_no = 0` (자동부여 미체크, 수동 입력) → LGU+ **접근 허용** + **알림 발송 대상**
- UI 설명 수정 시 코드 로직(`is_auto_request_no !== 1` 조건)과 방향 대조 필수
- `patchSchema` description UPDATE도 함께 수정해야 기존 DB 행 교정됨

---

## [BUG-031] 사진 등록 로딩 지연 + 업로드 실패 — Service Worker clone() 에러 (2026-06)

### 증상
- TBM 안전조치 사진 등록 시 로딩이 오래 걸리고 업로드가 완료되지 않음
- 브라우저 콘솔 에러:
  ```
  Uncaught (in promise) TypeError: Failed to execute 'clone' on 'Response': Response body is already used
    at service-worker.js:84
  Uncaught (in promise) NetworkError: Failed to execute 'put' on 'Cache': Cache.put() encountered a network error
    at service-worker.js:1
  ```

### 원인
- `public/static/service-worker.js` API 캐싱 로직에서 `/api/photos/:id/img` 등
  이미지 바이너리 스트리밍 응답에 대해 `res.clone()` → `cache.put()` 시도
- 이미지 스트리밍 응답은 body가 이미 소비(consumed)된 상태라 `clone()` 불가
  → `Response body is already used` TypeError 발생
  → `Cache.put()` NetworkError 발생
  → 업로드 후 썸네일 로드가 막혀 "업로드 안 됨"으로 오인

### 해결 (`public/static/service-worker.js` v10 → v11)
1. **이미지/파일 경로 완전 제외** — fetch 이벤트 초반에 regex로 bypass
   ```javascript
   // /api/photos/:id/img, /api/inspection-photos/:id/img 등
   if (url.pathname.match(/\/api\/(photos|inspection-photos|attachments)\/\d+\/(img|file|thumb)/)) return;
   ```
2. **Content-Type 기반 바이너리 캐싱 제외** — API 캐시 블록에서 image/video/octet-stream 응답 건너뜀
   ```javascript
   const ct = res.headers.get('Content-Type') || '';
   const isBinary = ct.startsWith('image/') || ct.startsWith('video/') || ct.startsWith('application/octet-stream');
   if (res.ok && !isBinary) { /* 캐싱 */ }
   ```
3. **전체 `clone()` try-catch 방어** — API 블록 + 정적 파일 블록 모두 적용
   ```javascript
   try { const toCache = res.clone(); caches.open(...).then(...).catch(() => {}); }
   catch (_) { /* clone 실패 무시 */ }
   ```
4. **캐시 버전 v10 → v11** — 구버전 캐시 자동 삭제 트리거

### ⚠️ 재발 방지
- Service Worker에서 바이너리 스트리밍 응답(이미지, 파일, 동영상)은 **절대 캐싱하지 말 것**
- 새 파일 다운로드/스트리밍 API 추가 시 경로를 위 regex 패턴에 추가
- `clone()` 호출은 항상 try-catch로 감싸야 안전함
- STATIC_CACHE/API_CACHE 버전 번호는 수정마다 반드시 올릴 것 (구버전 캐시 자동 제거)

---

## [BUG-032] 사진 업로드 근본 원인 — /api/photos 라우트 마운트 누락 (2026-06)

### 증상
- TBM 안전조치 사진 등록 시 로딩 지연 후 업로드 실패
- 브라우저 Network 탭: `POST /api/photos 404` 또는 응답 없음
- BUG-031(Service Worker clone 에러)과 동시에 발생 — SW 수정 후에도 여전히 업로드 안 됨

### 근본 원인
`node-server.ts`에 `photosRoutes` import 및 `app.route('/api/photos', ...)` 마운트가 **완전히 누락**
- `src/routes/photos.ts`는 Cloudflare용으로 개발됐고 NAS에서 마운트하지 않았음
- `/api/photos` 경로로 오는 모든 요청(GET 목록, POST 업로드, GET 이미지)이 404 반환
- BUG-031은 표면적 에러(SW 캐싱 오류)였고, 실제 업로드 불가의 근본 원인은 본 버그

### 해결
1. `node-server.ts` 상단 import에 `photosRoutes` 추가
   ```typescript
   import photosRoutes from './src/routes/photos'
   ```
2. `app.route('/api/attachments', ...)` 바로 앞에 마운트 등록
   ```typescript
   // photos.ts는 c.env.DB 사용 → 전역 app.use('*') 미들웨어에서 makeD1(rawDb) 주입 완료
   app.route('/api/photos', photosRoutes)
   ```
3. `task_photos` 테이블은 기존 DB에 이미 존재 — patchSchema 추가 불필요

### ⚠️ 재발 방지
- `src/routes/` 아래 새 라우트 파일 추가 시 **반드시 `node-server.ts`에도 import + 마운트 추가**
- Cloudflare/NAS 이중 구조 체크리스트:
  - Cloudflare: `src/index.tsx`에 라우트 포함 여부
  - NAS: `node-server.ts` import + `app.route()` 마운트 여부
- `src/routes/*.ts`의 `c.env.DB` 사용 라우트는 **전역 DB 미들웨어**(app.use('*'))가 주입하므로
  별도 미들웨어 불필요 — `app.route()` 한 줄로 충분
- NAS 전용 오버라이드가 필요한 특수 라우트만 RULE-002에 따라 마운트 앞에 등록할 것

---

## [BUG-035] 점검 사진 업로드/삭제 실패 — POST/DELETE /api/inspection-photos 라우트 누락 (2026-06)

### 증상
- 현장 점검 등록 후 사진 업로드 실패
- 점검 상세에서 사진 추가/삭제 실패

### 근본 원인
app.js의 `addInsPhoto()` 및 점검 사진 삭제 핸들러가 `/api/inspection-photos`를 호출하지만
서버에 해당 독립 라우트가 없었음:

```javascript
// app.js — 점검 사진 별도 업로드 (2단계)
await _uploadWithProgress('/api/inspection-photos', formData, ...)
// app.js — 점검 사진 삭제
fetch(`/api/inspection-photos/${photoId}`, { method: 'DELETE' })
```

- `inspectionRoutes` (`src/routes/inspections.ts`)는 `/api/inspections` 아래에 마운트됨
- 독립 경로 `/api/inspection-photos`는 전혀 존재하지 않았음

### 앱 업로드 2단계 구조
```
1단계: POST /api/inspections   — JSON (photos: [] 빈 배열로 전송)
2단계: POST /api/inspection-photos — FormData (사진 파일 별도 업로드)
```
→ inspections.ts 내부의 getFs() 파일 저장 코드는 실제로 실행되지 않음 (BUG-036 해당 없음)

### 해결
`node-server.ts`에 NAS 전용 점검 사진 라우트 추가 (RULE-002 준수):
- `POST /api/inspection-photos` — formData의 `photos` 파일 수신, writeFileSync 저장
  - inspection의 task_id로 task 정보 조회 → getUploadDir(task, 'inspection')
  - inspection_photos INSERT, rawDb 동기
- `DELETE /api/inspection-photos/:id` — unlinkSync + rawDb DELETE

### ⚠️ 재발 방지
- `POST /api/XXX-photos` 패턴은 독립 라우트 확인 필수
- `src/routes/inspections.ts` 내부의 사진 라우트는 `/api/inspections/...` 경로로만 처리됨
- `/api/inspection-photos` 독립 경로는 별도 NAS 라우트 필요

---

## [BUG-034] TBM 안전조치 사진 업로드 실패 — POST /api/photos/upload 라우트 누락 (2026-06)

### 증상
- BUG-033 수정 후에도 TBM 안전조치 탭 사진 등록 계속 실패
- "그래도 안됩니다" — BUG-031/032/033 모두 수정했는데도 동일 증상

### 근본 원인
**`POST /api/photos/upload`** 라우트가 서버에 전혀 없었음

app.js의 `uploadTbmPhoto()` 함수(TBM 안전조치 사진 등록)는 **`/api/photos`가 아니라
`/api/photos/upload`** 를 호출함:

```javascript
// app.js line 18821 — TBM 안전조치 사진 업로드
const result = await _uploadWithProgress('/api/photos/upload', formData, { ... });
const { file_path, file_name, mime_type, id: uploadedPhotoId } = result.data;
// 이후 POST /api/checklist/:id/tbm-photos 에 file_path 등 전달
```

- **formData 필드**: `photo`(File 단수), `label`, `section_id`, `photo_item_id`, `task_id`
- **기대 응답**: `{ id, file_path, file_name, mime_type }` — checklist/tbm-photos에서 사용
- BUG-032에서 `photosRoutes` 마운트를 추가했지만 `photos.ts`에 `/upload` 서브라우트 자체가 없었음
- BUG-033에서 NAS 직접 구현 라우트를 추가했지만 `/api/photos` (POST /) 만 구현, `/upload` 누락

### 왜 이전에 발견 못 했나
- BUG-031~033 조사 과정에서 `POST /api/photos` (일반 작업 사진) 만 분석
- TBM 안전조치 사진이 **별도 엔드포인트**(`/upload`)를 사용한다는 것을 코드 분석에서 놓침
- `app.js` grep 결과에 `18821: '/api/photos/upload'` 가 나왔지만 `/api/photos` 검색에서 묻혔음

### 해결
`node-server.ts`에 `POST /api/photos/upload` 추가 (BUG-034 fix):
- RULE-002: `app.route('/api/photos', photosRoutes)` 앞에 등록
- formData의 `photo`(단수) 필드로 File 수신
- `getUploadDir(task, 'tbm', 'tbm_photo', label)` — TBM 폴더 저장
- `task_photos` INSERT → `{ id, file_path, file_name, mime_type }` 반환
- `task_id` 없어도 허용 (미분류 처리)

### ⚠️ 재발 방지
- **app.js에서 API 호출 엔드포인트 목록을 먼저 grep 한 후 서버 구현 여부 확인할 것**
  ```bash
  grep -n "fetch\|API\.\|_uploadWithProgress\|xhr.open" public/static/app.js | grep "api/"
  ```
- 특히 `/api/엔드포인트/서브경로` 패턴은 별도 라우트로 서버에 등록해야 함
- `photosRoutes` import 만으로는 `photos.ts`에 없는 서브라우트는 동작하지 않음

---

## [BUG-033] 사진 업로드 여전히 실패 — photos.ts 동적 async import NAS 호환 문제 (2026-06)

### 증상
- BUG-032(photosRoutes 마운트 추가) 수정 후에도 사진 업로드 여전히 실패
- "그래도 안됩니다" — 마운트는 됐지만 실제 업로드 핸들러가 오류 발생

### 근본 원인
`src/routes/photos.ts`의 **동적 비동기 `import()`** 가 NAS(tsx 런타임)에서 실패

```typescript
// photos.ts 내 문제 코드
async function getFs() {
  const fs = await import('node:fs/promises')   // ← NAS tsx에서 실패
  const path = await import('node:path')
  return { fs, path }
}
// POST 업로드 핸들러에서
const { fs, path } = await getFs()
await fs.mkdir(...)    // getFs() 실패 시 TypeError
await fs.writeFile(...)
```

- `attachments-nas.ts`는 **정적 동기 import** 사용 → NAS에서 확실히 동작
  ```typescript
  import { writeFileSync, mkdirSync } from 'node:fs'  // ← 정적 import, 항상 동작
  ```
- tsx 런타임에서 ESM 동적 import()의 node:// 내장 모듈 참조가 불안정할 수 있음
- photos.ts 자체는 Cloudflare Workers용으로 개발 — NAS에서 직접 사용하면 안전하지 않음

### 해결
`node-server.ts`에 NAS 전용 `/api/photos` 라우트를 직접 구현 (BUG-033 fix):

1. **RULE-002 준수**: `app.route('/api/photos', photosRoutes)` **앞**에 NAS 전용 라우트 등록
2. **정적 동기 import 사용**: `readFileSync`, `writeFileSync`, `unlinkSync`, `mkdirSync` — 이미 node-server.ts 상단에 import됨
3. **rawDb 직접 사용**: `rawDb.prepare().run()` / `.get()` / `.all()` — 동기 better-sqlite3 API
4. **기존 헬퍼 재활용**: `getUploadDir()`, `generateFileName()`, `photoTypeToStage()` — node-server.ts에 이미 있거나 신규 추가
5. 구현된 라우트:
   - `GET /api/photos` — rawDb 동기 목록 조회
   - `GET /api/photos/:id/img` — readFileSync 이미지 서빙
   - `GET /api/photos/:id/data` — readFileSync + Buffer.toString('base64')
   - `POST /api/photos` — writeFileSync + rawDb INSERT (multipart/form-data + JSON 하위호환)
   - `DELETE /api/photos/:id` — unlinkSync + rawDb DELETE

### ⚠️ 재발 방지 — **NAS에서 src/routes/*.ts 사용 시 체크리스트**

1. **동적 import 사용 여부 확인**: `await import(...)` 형태가 있으면 NAS에서 실패 가능
2. **fs 작업 방식 확인**: `node:fs/promises` 비동기 대신 `node:fs` 동기(writeFileSync 등) 사용
3. **DB 접근 방식 확인**: `c.env.DB` 사용 시 전역 미들웨어 주입에 의존 → rawDb 직접 사용이 더 안전
4. **패턴 기준**: `attachments-nas.ts` = NAS 정상 동작 레퍼런스 (정적 import + rawDb + writeFileSync)
5. **Cloudflare 전용 라우트 식별**: `getFs()` 패턴 / `await import('node:...')` 패턴 → NAS에서 직접 구현 필요

---

## [BUG-036] TBM 사진 업로드 500 에러 — photo_type CHECK constraint 위반 (2026-06)

### 증상
- TBM 안전조치 탭 사진 업로드 시 `500 Internal Server Error` 반복 발생
- 에러 메시지: `CHECK constraint failed: photo_type IN ('before','progress','after','hazard','tbm','completion')`
- `POST /api/photos/upload` → 3회 연속 500 에러 (스크린샷 확인)
- BUG-034 수정 후에도 동일 증상 계속됨

### 근본 원인
**`node-server.ts`의 `POST /api/photos/upload` 핸들러에서 잘못된 `photo_type` 값 사용**

```typescript
// 수정 전 (BUG-034에서 잘못 작성됨)
user.id, 'tbm_photo',   // ← CHECK constraint 위반! 허용 목록에 없음

// task_photos 테이블 CHECK 제약 (migrations/0001, 0008, 0029):
// CHECK(photo_type IN ('before','progress','after','hazard','tbm','completion'))
// → 'tbm_photo'는 존재하지 않는 값 → SQLite CONSTRAINT 에러 → 500
```

**허용 값**: `before`, `progress`, `after`, `hazard`, **`tbm`**, `completion`  
**불허 값**: `tbm_photo` ← BUG-034에서 INSERT 시 사용한 잘못된 값

### 에러 흐름
```
uploadTbmPhoto() (app.js:18821)
  → POST /api/photos/upload
  → node-server.ts 핸들러
  → rawDb.prepare(...).run(... 'tbm_photo' ...)
  → SQLITE_CONSTRAINT: CHECK constraint failed
  → catch → 500 반환
```

### 해결
`node-server.ts` line 3387 수정:

```typescript
// 수정 후
user.id, 'tbm',          // ← BUG-036 수정: 'tbm_photo' → 'tbm' (CHECK constraint 허용값)
```

### 전수 확인 결과
- `POST /api/photos` (일반 작업사진): `photoType` 변수를 그대로 사용 → UI 셀렉트 박스 옵션이 `before/progress/after/hazard/tbm/completion`으로 모두 허용값
- `POST /api/inspection-photos`: `inspection_photos` 테이블에 INSERT (photo_type 컬럼 없음) → 문제 없음
- `photoTypeToStage()` 맵에 `tbm_photo: 'tbm'` 존재 → 폴더 경로용이므로 유지 (DB INSERT에는 사용 안 됨)

### ⚠️ 재발 방지
- **DB INSERT 전 CHECK 제약 반드시 확인**: migration 파일에서 허용 값 목록 확인
- `task_photos.photo_type` 허용 값: `before`, `progress`, `after`, `hazard`, **`tbm`**, `completion` (총 6개)
- `tbm_photo`, `tbm-photo`, `tbmsafety` 등은 **모두 허용되지 않음**
- 새로운 photo_type 추가 시 migration 파일과 CHECK 제약 동시 업데이트 필요

---

## [BUG-037] 사진 이미지 로드 401 에러 — img src에 Authorization 헤더 불가 (2026-06)

### 증상
- 사진 업로드는 성공 (BUG-036 수정 후)
- 콘솔에 `GET /api/photos/190/img 401 (Unauthorized)` 에러 반복 발생
- 이미지가 화면에 로드되지 않거나 onerror 처리됨

### 근본 원인
**브라우저 `<img src>` 태그는 HTTP 요청 시 커스텀 헤더를 붙일 수 없음**

```html
<!-- 브라우저가 Authorization 헤더 없이 단순 GET 요청 -->
<img src="/api/photos/190/img">
<!-- → 서버: getUser() → auth 헤더 없음 → null → 401 반환 -->
```

- `getUser()` 함수가 `Authorization: Bearer ...` 헤더만 인식
- `<img src>`, `<video src>` 태그는 fetch/XHR과 달리 헤더 커스터마이즈 불가
- 콘솔에 401 에러 발생, 이미지 로드 실패

### 해결

#### 1. 서버: `getUser()` — 쿼리스트링 `?token` 폴백 추가 (node-server.ts)
```typescript
function getUser(c: any): any {
  // 1순위: Authorization 헤더 (fetch/XHR)
  const auth = c.req.header('Authorization') || ''
  // 2순위: ?token= 쿼리스트링 (img src 태그 — 헤더 불가)
  const queryToken = c.req.query('token') || ''
  const rawToken = auth.startsWith('Bearer ') ? auth.slice(7) : queryToken
  if (!rawToken) return null
  ...
}
```

#### 2. 앱: `photoImgSrc()` 헬퍼 함수 추가 (app.js)
```javascript
function photoImgSrc(photoId) {
  const token = localStorage.getItem('token') || '';
  return `/api/photos/${photoId}/img${token ? '?token=' + encodeURIComponent(token) : ''}`;
}
```

#### 3. 앱: 모든 `/api/photos/${id}/img` → `${photoImgSrc(id)}` 교체 (10곳)
- `<img src="${photoImgSrc(p.id)}">` 패턴으로 통일
- `<video src="${photoImgSrc(videoId)}">` 포함

### 교체 위치 (app.js)
| 라인 | 컨텍스트 |
|------|---------|
| 6355 | TBM 체크리스트 사진 썸네일 |
| 6539 | 작업사진 탭 비디오 썸네일 |
| 6549 | 작업사진 탭 이미지 썸네일 |
| 7375 | 작업사진 모달 비디오 |
| 7385 | 작업사진 모달 이미지 |
| 7701 | `loadPhotoData()` 함수 |
| 7724 | `showPhotoData()` 모달 이미지 |
| 7743 | `showVideoData()` 모달 비디오 |
| 9435 | 업로드 후 썸네일 미리보기 |
| 18757 | TBM 안전조치 사진 목록 |
| 18851 | TBM 안전조치 업로드 완료 후 표시 |

### ⚠️ 재발 방지
- **`<img src>` / `<video src>` 태그는 헤더 불가** → 인증된 API는 `?token=` 쿼리스트링 필수
- 새로운 인증 이미지 API 추가 시 반드시 `photoImgSrc()` 또는 동일 패턴 사용
- `getUser()` 함수는 헤더와 쿼리스트링 모두 지원 (우선순위: 헤더 > 쿼리스트링)

---

## [BUG-038] LGU+ 계정 알림 미수신 — sub_role 누락 + register API ui_role 미변환 (2026-06)

### 증상
- LGU+ 역할 계정으로 로그인해도 작업 상태 변경 시 FCM 알림 미수신
- 시스템에서 LGU+ 계정이 "근로자"로 표시됨

### 계정 역할 구조 (설계 정의)

| UI 표시명 | DB `role` | DB `sub_role` | DB `position` |
|-----------|-----------|---------------|--------------|
| 근로자 | `worker` | `''` | 다양 |
| 공무 | `supervisor` | `engineer` | `관리감독자` 등 |
| 안전관리자 | `supervisor` | `safety` | `안전관리자` |
| 현장대리인 | `supervisor` | `site_rep` | `총괄책임자` |
| CEO | `admin` | `ceo` | `대표이사` |
| **LGU+** | `worker` ← 설계 의도(열람전용) | **`lgu_plus`** | `LGU+` |
| 시스템관리자 | `admin` | `sysadmin` | `시스템관리자` |

**LGU+가 DB `role=worker`인 것은 설계 의도** (열람 전용 권한). `sub_role='lgu_plus'`로 근로자와 구분.

### 근본 원인 — 2가지

#### 원인 1: `POST /api/auth/register` — `ui_role` → `sub_role` 미변환
```javascript
// app.js submitRegister() 전송 데이터
{ role: 'worker',  ui_role: 'lgu_plus' }  // sub_role 없음!
```
서버는 `body.sub_role`을 직접 저장 → `sub_role = ''` (빈값)  
알림 쿼리: `WHERE role='lgu' OR sub_role='lgu_plus'` → sub_role='' → LGU+ 계정 미포함 → 알림 0건

#### 원인 2: 기존 등록된 LGU+ 계정 sub_role 누락
위 버그로 등록된 계정 전부 `position='LGU+'`이지만 `sub_role=''` 상태

### 해결

#### 1. `node-server.ts` register API — ui_role → sub_role 변환 로직 추가
```typescript
const uiRoleToSubRole = {
  safety: 'safety', engineer: 'engineer', site_rep: 'site_rep',
  lgu_plus: 'lgu_plus', ceo: 'ceo', sysadmin: 'sysadmin', worker: '',
}
const effectiveSubRole = sub_role || (ui_role ? (uiRoleToSubRole[ui_role] ?? ui_role) : '')
```

#### 2. `node-server.ts` patchSchema v0.144 — 기존 LGU+ 계정 자동 복구
```sql
UPDATE users SET sub_role='lgu_plus'
WHERE position='LGU+' AND (sub_role='' OR sub_role IS NULL) AND is_active=1
```
서버 재시작 시 1회 자동 실행 → 기존 계정 모두 복구

### LGU+ 알림 조건 구조 (⚠️ BUG-038 당시 오기록 — BUG-039에서 정정)
- ~~**알림 대상 공사**: `is_auto_request_no=1` (공사 등록 시 "자동부여" 체크한 공사)~~
- ~~**접근 가능 공사**: `is_auto_request_no=1` 공사만 목록/상세 표시~~
- **정정**: 실제 의도는 `is_auto_request_no=0`(자동부여 **미체크**, 수동입력) 공사가 LGU+ 허용·알림 대상
- **알림 대상 사용자**: `role='lgu' OR sub_role='lgu_plus'` AND `is_active=1` (이 부분은 정확)
- ▶ BUG-039 참조

### ⚠️ 재발 방지
- register/update API에서 `ui_role` 수신 시 반드시 `sub_role`로 변환 후 저장
- LGU+ 계정 확인: `sub_role='lgu_plus'` 필수 (position='LGU+' 만으로는 알림 쿼리에서 누락)
- 알림 발송 전 DB에서 `WHERE sub_role='lgu_plus'` 조건 결과 건수 로그 확인 가능

---

## [BUG-039] LGU+ 알림 조건 방향 전면 반전 (2026-06-23)

### 증상
- LGU+ 계정으로 로그인 시 공사 목록/작업 목록이 비어 있음
- 실제 공사에 알림이 오지 않음 (알림을 받아야 하는 공사에서 미수신)
- 반대로 접근 차단되어야 할 공사가 표시되는 경우 발생

### 원인
- **BUG-030 오기록**: BUGFIX_LOG BUG-030에 "코드상 올바름 — UI 설명만 오류"라고 잘못 기록
- 실제로는 **코드도 잘못된 방향**으로 구현되어 있었음
- **v0.143(BUG-028) 당시 잘못 구현**: `is_auto_request_no=1`(자동부여 체크) 공사를 LGU+ 허용 대상으로 처리
- **실제 의도**: `is_auto_request_no=0`(자동부여 **미체크**, 수동 입력) 공사가 LGU+ 허용·알림 대상

### is_auto_request_no 값의 의미 (확정)
| 값 | UI 체크박스 | 의미 | LGU+ 처리 |
|----|------------|------|----------|
| `0` | ☐ 미체크 (수동 입력) | 공사요청번호를 수동으로 입력 | **허용** — 목록 표시, 상세 열람, 알림 발송 |
| `1` | ☑ 체크 (자동부여) | 공사요청번호 자동부여 | **차단** — 목록 제외, 상세 차단, 알림 미발송 |

### 수정 내용

#### `node-server.ts` — 3곳 수정

**① line ~2670: 작업상태 알림 조건**
```typescript
// 수정 전 (❌ 잘못됨)
const isLguTarget = taskConRow?.is_auto_request_no === 1

// 수정 후 (✅ 정확)
const isLguTarget = taskConRow?.is_auto_request_no !== 1
// is_auto_request_no=0(수동입력) → LGU+ 허용 → 알림 발송
```

**② line ~2894: 체크리스트 완료 알림 조건**
```typescript
// 수정 전 (❌ 잘못됨)
if (lguTaskRow && lguTaskRow.is_auto_request_no === 1) {

// 수정 후 (✅ 정확)
if (lguTaskRow && lguTaskRow.is_auto_request_no !== 1) {
```

**③ line ~2963: 수동 알림 엔드포인트 차단**
```typescript
// 수정 전 (❌ 잘못됨) — 수동입력 공사에서 알림 차단, 자동부여 공사에서 허용
if (taskRow.is_auto_request_no !== 1) return c.json({ lgu_notified: false, reason: 'not_auto_req_no' })

// 수정 후 (✅ 정확) — 자동부여 공사 차단, 수동입력 공사 허용
if (taskRow.is_auto_request_no === 1) return c.json({ lgu_notified: false, reason: 'auto_req_no_blocked' })
```

#### `public/static/app.js` — 3곳 수정

**① line ~3101: 공사 목록 필터**
```javascript
// 수정 전 (❌ 잘못됨)
? rawList.filter(function(con) { return con.is_auto_request_no === 1; })

// 수정 후 (✅ 정확)
? rawList.filter(function(con) { return con.is_auto_request_no !== 1; })
```

**② line ~3175: 공사 상세 접근 차단**
```javascript
// 수정 전 (❌ 잘못됨) — 수동입력 공사 차단, 자동부여 공사 허용
if (_conIsLguPlus && con.is_auto_request_no !== 1) {

// 수정 후 (✅ 정확) — 자동부여 공사 차단, 수동입력 공사 허용
if (_conIsLguPlus && con.is_auto_request_no === 1) {
```

**③ line ~4228: 작업 목록 필터**
```javascript
// 수정 전 (❌ 잘못됨)
? _rawNewTasks.filter(function(t) { return t.is_auto_request_no === 1; })

// 수정 후 (✅ 정확)
? _rawNewTasks.filter(function(t) { return t.is_auto_request_no !== 1; })
```

### 복원 방법
BUG-039 수정 후 문제 발생 시:
```bash
bash /home/user/webapp/restore_lgu_notify.sh
# 또는 직접 롤백:
git reset --hard 9c7b2fb && npm run build && pm2 restart safetynote
```

### ⚠️ 재발 방지
- `is_auto_request_no` 관련 코드 수정 시 **반드시** 이 표를 참조:
  - `=== 0` 또는 `!== 1` → LGU+ **허용** (수동입력 공사)
  - `=== 1` → LGU+ **차단** (자동부여 공사)
- BUG-030 오기록을 신뢰하지 말 것 — 실제 로직 방향은 이 BUG-039 기록이 정확
- 공사 등록 UI: "자동부여" 체크박스 = `is_auto_request_no=1` → LGU+ 차단
- 향후 LGU+ 관련 알림/접근 제어 수정 시 6곳 모두 일관성 유지 필수

---

## [BUG-040] LGU+ 알림 — 공사 미연결/NULL 시 대상 아닌 작업에 알림 누출 (2026-06-23)

### 증상
- BUG-039 수정 후에도 일부 LGU+ 계정으로 대상이 아닌 알림 수신
- `is_auto_request_no` 값이 없는(NULL/공사 미연결) 작업에서도 알림 발송

### 원인 — `!== 1` 조건의 null 취약점

```typescript
// ❌ 문제 코드 (BUG-039 수정 후 상태)
const isLguTarget = taskConRow?.is_auto_request_no !== 1

// 케이스별 평가:
// taskConRow = null       → undefined !== 1 → true  ❌ (공사 미연결인데 알림 발송)
// is_auto_request_no = null → null !== 1    → true  ❌ (LEFT JOIN 미조인인데 알림 발송)
// is_auto_request_no = 0  → 0 !== 1         → true  ✅ (수동입력 → 정상 발송)
// is_auto_request_no = 1  → 1 !== 1         → false ✅ (자동부여 → 정상 차단)
```

`null !== 1` 은 JavaScript에서 **`true`** 이므로, `is_auto_request_no`가 NULL이거나 `taskConRow` 자체가 null이면 의도치 않게 알림이 발송됨.

### 수정 내용 — 3곳 null 안전 처리 추가

#### ① `node-server.ts` line ~2679 — 작업상태 알림
```typescript
// 수정 전 (❌)
const isLguTarget = taskConRow?.is_auto_request_no !== 1

// 수정 후 (✅) — null 명시 체크
const rawAutoNo = taskConRow?.is_auto_request_no
const isLguTarget = taskConRow != null && rawAutoNo != null && rawAutoNo !== 1
// taskConRow=null → false (공사 미연결 → 알림 안 함)
// rawAutoNo=null  → false (LEFT JOIN 미조인 → 알림 안 함)
// rawAutoNo=0     → true  (수동입력 → 알림 발송 ✅)
// rawAutoNo=1     → false (자동부여 → 알림 안 함 ✅)
```

#### ② `node-server.ts` line ~2910 — 체크리스트 완료 알림
```typescript
// 수정 전 (❌)
if (lguTaskRow && lguTaskRow.is_auto_request_no !== 1) {

// 수정 후 (✅)
if (lguTaskRow && lguTaskRow.is_auto_request_no != null && lguTaskRow.is_auto_request_no !== 1) {
```

#### ③ `node-server.ts` line ~2983 — 수동 알림 엔드포인트
```typescript
// 수정 전 (❌)
if (taskRow.is_auto_request_no === 1) return c.json(...)

// 수정 후 (✅) — null이면 공사 미연결이므로 차단
if (taskRow.is_auto_request_no == null || taskRow.is_auto_request_no === 1)
  return c.json({ lgu_notified: false, reason: taskRow.is_auto_request_no == null
    ? 'no_construction_linked'
    : 'auto_req_no_blocked' })
```

### 허용 조건 (최종 확정)
| `taskConRow` | `is_auto_request_no` | 결과 |
|---|---|---|
| null (row 없음) | — | ❌ 알림 안 함 |
| 있음 | null (공사 미연결) | ❌ 알림 안 함 |
| 있음 | `0` (수동입력) | ✅ **알림 발송** |
| 있음 | `1` (자동부여) | ❌ 알림 안 함 |

### ⚠️ 재발 방지
- `!== 1` 단독 사용 금지 — null 취약. 반드시 `!= null && !== 1` 함께 사용
- LEFT JOIN 결과에서 숫자 컬럼은 항상 null 가능성 고려
- `=== 0` 명시적 비교가 가장 안전 (단, DEFAULT 0 보장 시에만)

---

## [FEAT-027] 그룹별 권한 관리 — DB 테이블 + 관리자 UI (2026-06-23)

### 개요
6개 그룹(근로자/공무/안전관리자/현장대리인/CEO/LGU+)의 6가지 권한을
`group_permissions` 테이블로 관리하고, 관리자 설정 화면에서 UI로 제어 가능하도록 구현.

### 구현 내용

#### ① patchSchema v0.145 — `group_permissions` 테이블 + 기본값
```sql
CREATE TABLE IF NOT EXISTS group_permissions (
  group_key TEXT NOT NULL,
  perm_key  TEXT NOT NULL,
  perm_label TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 0,
  UNIQUE(group_key, perm_key)
);
-- 36개 기본값 INSERT OR IGNORE (6 그룹 × 6 권한)
```
- 위치: `node-server.ts` patchV0145()

#### ② `getGroupPerm()` 헬퍼 함수
```typescript
function getGroupPerm(groupKey: string, permKey: string): boolean {
  const row = rawDb.prepare(
    `SELECT is_enabled FROM group_permissions WHERE group_key=? AND perm_key=?`
  ).get(groupKey, permKey) as any
  return row ? row.is_enabled === 1 : false
}
```

#### ③ `/api/group-permissions` REST API
- `GET`  → 전체 권한 조회 (group_key별 그룹화)
- `POST` → 권한 일괄 업데이트 (`ON CONFLICT DO UPDATE`)
- admin 전용 (role='admin' 체크)

#### ④ 관리자 설정 UI — "그룹별 권한 설정" 탭
- 설정 탭 목록에 `grpperm` 탭 추가 (LGU+ 탭 앞)
- `_loadGroupPermPanel()`: API 조회 후 6개 그룹 카드 렌더링
- `saveGroupPerms()`: 체크박스 상태 수집 → POST 저장
- 위치: `app.js`

#### ⑤ BUG-040→FEAT-027 LGU+ 조건 단순화 (6곳)
BUG-040 임시 수정(`!= null && !== 1`)을 FEAT-027 맥락에서 `=== 0`으로 최종 단순화.

| 파일 | 위치 | 변경 전 | 변경 후 |
|------|------|---------|---------|
| `node-server.ts` | 작업상태 알림 | `!= null && !== 1` | `=== 0` |
| `node-server.ts` | 체크리스트 완료 알림 | `!= null && !== 1` | `=== 0` |
| `node-server.ts` | 수동 알림 엔드포인트 | `== null \|\| === 1` | `!== 0` |
| `app.js` | 공사 목록 필터 | `!== 1` | `=== 0` |
| `app.js` | 공사 상세 접근 차단 | `=== 1` | `!== 0` |
| `app.js` | 작업 목록 필터 | `!== 1` | `=== 0` |

### 그룹별 권한 기본값
| 그룹 | notify_own | notify_all | notify_lgu | view_all | edit_task | sign_tbm |
|------|-----------|-----------|-----------|----------|-----------|----------|
| worker    | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| engineer  | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| safety    | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| site_rep  | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| ceo       | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| lgu_plus  | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |

---

## [FEAT-028] TBM 근로자 전원 서명 완료 → 안전관리자 연쇄 알림 (2026-06-23)

### 개요
TBM 서명 연쇄 흐름 중 첫 단계(근로자 전원 서명 → 안전관리자 알림)가 미구현 상태였음.
`POST /api/tbm/:id/signatures` 핸들러에 attendee 전원 서명 완료 체크 로직 추가.

### 연쇄 흐름 전체 현황
| 단계 | 구현 여부 | 파일 |
|------|----------|------|
| attendee 전원 서명 완료 → 안전관리자 알림 | ✅ **FEAT-028 추가** | `tbm-extra.ts` |
| 안전관리자(`approval_safety`) 서명 → 현장대리인 알림 | ✅ 기존 구현 | `tbm-extra.ts` |
| 현장대리인(`approval_general`) 서명 → CEO 알림 | ✅ 기존 구현 | `tbm-extra.ts` |
| CEO(`approval_ceo`) 서명 → 완료 알림 | ✅ 기존 구현 | `tbm-extra.ts` |

### 구현 위치
- `src/nas-routes/tbm-extra.ts` — `POST /api/tbm/:id/signatures` 핸들러
- `role === 'attendee'` 서명 완료 후 `attendeeNames` 전원 서명 여부 확인
- 안전관리자(`sub_role='safety'` OR `position='안전관리자'`) 대상 SSE + FCM + notifications 발송
- 중복 방지: `approval_safety` 서명이 이미 있으면 skip

### 알림 발송 흐름
```
[근로자 서명] role=attendee
  → 전원 서명 완료 체크
    → 안전관리자 SSE sendToUser()
    → 안전관리자 FCM sendFcmToUsers()
    → notifications INSERT (type='tbm_attendee_all_signed')
```

### ⚠️ 재발 방지
- TBM 서명 추가 시 반드시 연쇄 알림 체인 확인 (attendee → safety → site_rep → ceo)
- 중복 방지 로직(이미 서명된 역할 체크) 필수

---

## [BUG-041] LGU+ 수동입력 공사 조회 안 됨 + 공사 미연결 작업 오포함 (2026-06-23)

### 증상
- LGU+ 계정으로 로그인 시 수동입력(is_auto_request_no=0) 공사가 목록에 표시 안 됨
- 공사에 연결되지 않은 작업(construction_id=NULL)이 LGU+ 작업 목록에 포함됨

### 원인 분석

#### ① constructions.ts — NULL 반환으로 필터 불통과
```sql
-- 기존: SELECT c.* → is_auto_request_no 컬럼이 D1에 없는 경우 NULL 반환
-- 프론트 필터: con.is_auto_request_no === 0 → null === 0 → false → 수동입력 공사도 숨김
SELECT c.* FROM constructions c ...
```

#### ② tasks.ts — COALESCE(NULL, 0) = 0 오포함
```sql
-- 기존: COALESCE(con.is_auto_request_no, 0)
-- 공사 미연결 작업(LEFT JOIN 미조인): NULL → 0 → LGU+ 필터 통과 → 오포함
COALESCE(con.is_auto_request_no, 0) as is_auto_request_no
```

### 수정 내용

#### ① constructions.ts — COALESCE 명시로 NULL 보장
```sql
-- 수정 후: c.* + 명시적 COALESCE
COALESCE(c.is_auto_request_no, 0) AS is_auto_request_no
```
- D1에 컬럼 없어도 0 반환 → `=== 0` 필터 통과 (수동입력 공사 정상 표시)

#### ② tasks.ts — COALESCE(NULL, -1) 로 공사 미연결 구분
```sql
-- 수정 후: NULL(공사 미연결) → -1 → === 0 필터 불통과 → LGU+ 대상 아님
COALESCE(con.is_auto_request_no, -1) as is_auto_request_no
```
| 값 | 의미 | LGU+ === 0 필터 |
|----|------|----------------|
| -1 | 공사 미연결 (NULL fallback) | ❌ 불통과 |
| 0  | 수동입력 공사 | ✅ 통과 |
| 1  | 자동부여 공사 | ❌ 불통과 |

### 수정 파일
- `src/routes/constructions.ts` — 목록 SELECT에 `COALESCE(c.is_auto_request_no, 0)` 추가
- `src/routes/tasks.ts` — 3곳 `COALESCE(con.is_auto_request_no, 0)` → `-1`로 변경

### ⚠️ 재발 방지
- `LEFT JOIN constructions` 결과에서 `is_auto_request_no` 는 **항상 COALESCE 명시 필수**
- 공사 미연결 작업의 fallback은 반드시 `-1` (0이면 LGU+ 허용 오발생)
- constructions 목록 조회는 `c.*` 대신 `COALESCE(c.is_auto_request_no, 0)` 명시

---

## [FEAT-029] 푸시 알림 group_permissions 기반 그룹별 발송 (2026-06-23)

### 개요
기존 하드코딩된 `position IN ('관리감독자','총괄책임자','대표이사')` 방식을
`group_permissions` 테이블 기반 `getUsersWithPerm(permKey)` 헬퍼로 전환.

### 추가된 헬퍼 함수 (node-server.ts)

#### `getUserGroupKey(u)` — 사용자 → group_key 매핑
```typescript
// sub_role 우선, 없으면 role+position으로 추정
// worker/engineer/safety/site_rep/ceo/lgu_plus
```

#### `getUsersWithPerm(permKey, excludeId?)` — 권한별 수신자 조회
```typescript
// group_permissions에서 permKey=is_enabled=1 그룹 조회
// 해당 그룹에 속한 is_active=1 유저 id[] 반환
```

### 변경된 발송 로직

| 발송 지점 | 기존 | 변경 후 |
|-----------|------|---------|
| 작업상태 변경 FCM | `position IN (...)` 하드코딩 | `getUsersWithPerm('notify_all_tasks')` |
| 작업상태 변경 SSE | `broadcastToRoles(['admin','supervisor'])` | `getUsersWithPerm('notify_all_tasks')` |
| 작업상태 변경 notifications | `role IN ('admin','supervisor')` | `getUsersWithPerm('notify_all_tasks')` |
| 배정 작업자 알림 | workerIds 직접 추가 | `getUsersWithPerm('notify_own_task')` 교집합 |
| LGU+ 작업상태 알림 | `role='lgu' OR sub_role='lgu_plus'` | `getUsersWithPerm('notify_lgu_tasks')` |
| 체크리스트 완료 알림 | LGU+만 발송 | 전체관리자 + LGU+ 분리 발송 |

### ⚠️ 재발 방지
- 새 알림 발송 로직 추가 시 반드시 `getUsersWithPerm()` 사용
- `broadcastToRoles(['admin','supervisor'])` 직접 사용 금지 (group_permissions 우회)
- 수신자 하드코딩(`position IN (...)`) 금지
