# SafetyNOTE 버그픽스 기록

---

## [BUG-214] 가로 스크롤 차단 + site-map 리스트 미표시 — BUG-213 후속 (세션 141)

> **대상**: `public/static/style.css`  
> **작업일**: 2026-08-07  
> **커밋**: `8b40324`  
> **유형**: 🔴 BUG — BUG-213 수정(overflow-x:clip) 후속 부작용 2건

### 증상
1. **작업현황 등 내부 화면 우측 잘림** — 카드/목록 콘텐츠가 우측으로 잘리고 가로 스크롤 불가
2. **site-map 지도 아래 검색 리스트 미표시** — 지도 아래 `#siteMapList`가 화면 밖으로 밀려 보이지 않음

### 원인

**증상 1 (가로 잘림)**
```css
/* BUG-213 후속 수정에서 적용한 코드 */
#app { overflow-x: clip; }
/* clip이 #app의 scrollWidth 계산을 방해 →
   .main-content 너비가 #app 안에 정확히 맞지 않아 콘텐츠 잘림 */
```

**증상 2 (site-map 리스트 미표시)**
```css
.main-content.site-map-mode { height: 100vh; }
/* #app { overflow-y:auto }가 스크롤 컨테이너가 된 상태에서
   100vh(뷰포트 기준)가 #app 높이와 불일치 → #siteMapList가 화면 밖으로 밀림 */
```

### 수정 내용 (`public/static/style.css` 3곳)

```css
/* ① clip → hidden + .main-content 가로 넘침 원천 차단 */
#app {
  overflow-x: hidden;    /* clip → hidden */
}
.main-content { max-width: 100%; }  /* 추가: #app 너비 초과 차단 */
/* → 자식 overflow-x:auto(테이블 등)는 .main-content 너비 안에서 독립 동작 유지 ✅ */

/* ② site-map 높이 #app 기준으로 통일 */
.main-content.site-map-mode { height: 100%; }    /* 100vh → 100% */
@media (max-width:768px) {
  .main-content.site-map-mode { height: 100%; }  /* 100dvh → 100% */
}
/* → #app(height:100%) 기준 계산 → 뷰포트와 동일하면서 스크롤 컨텍스트 올바르게 유지 */
```

### 검증
- `node --check public/static/app.js` → ✅ OK
- `npm run build` → ✅ `dist/_worker.js 298.71 kB` (1.34s)

---

## [BUG-213] Android WebView position:fixed 스크롤 버그 — html/body overflow 미설정 (세션 141)

> **대상**: `public/static/style.css`  
> **작업일**: 2026-08-07  
> **커밋**: `7fcdcda`  
> **유형**: 🔴 BUG — Android 앱(v1.4.16) 전체 화면 스크롤 / `#icon-rail`(position:fixed) 함께 스크롤됨

### 증상
- Android 앱(v1.4.16)에서 페이지 스크롤 시 `#icon-rail`(position:fixed) 상단(브랜드 로고, 상단 메뉴 아이콘)이 잘려 사라지고 하단(내계정, 로그아웃, v1.4.16)만 보임
- `position:fixed` 요소 자체가 스크롤됨 → Android WebView에서 fixed 컨텍스트 이상
- **태블릿은 정상** / 스마트폰 Android만 발생
- BUG-211, BUG-212 수정 이후에도 지속

### 원인

`html`, `body` 모두 `overflow` 미설정 상태에서 Android WebView가 `body`를 스크롤 컨테이너로 사용:

```css
/* ❌ 문제 상태 */
body {
  font-family: ...;
  background: ...;
  /* overflow 없음 — Android WebView가 body를 스크롤 컨테이너로 사용 */
}
/* html 규칙 자체 없음 */
```

- **body 스크롤 발생 시**: Android WebView에서 `position:fixed` 요소가 뷰포트 기준이 아닌 body 기준으로 고정되어 함께 스크롤됨
- **태블릿 정상인 이유**: 화면이 커서 콘텐츠가 뷰포트 안에 수용 → body 스크롤 미발생 → fixed 요소 정상 고정
- **스마트폰 고장인 이유**: 콘텐츠가 뷰포트보다 길어 body 스크롤 발생 → fixed 요소 함께 스크롤

### 수정 내용 (`public/static/style.css`)

`body { }` 블록 바로 뒤에 BUG-213 규칙 추가:

```css
/* 변경 후 — body 블록 바로 뒤 삽입 */
html, body {
  height: 100%;
  overflow: hidden;                 /* body 스크롤 제거 → fixed 안정화 */
}
#app {
  height: 100%;
  overflow-y: auto;                 /* 실제 스크롤을 #app에 위임 */
  -webkit-overflow-scrolling: auto; /* touch 금지 — sticky/fixed 방해 방지 */
}
```

**스크롤 컨테이너 변경 흐름:**

| 요소 | 이전 | 이후 |
|------|------|------|
| 스크롤 컨테이너 | `body` (암묵적) | `#app` (명시) |
| `#icon-rail` (fixed) | body 스크롤 시 함께 스크롤됨 ❌ | 항상 뷰포트 기준 고정 ✅ |
| `.top-header` (sticky) | `#app` 내 `.main-content` 기준 | 동일 — 정상 ✅ |
| `site-map-mode` | 정상 | 동일 — 정상 ✅ |
| 모달/오버레이 (fixed) | body 스크롤 시 영향 가능 | 뷰포트 기준 고정 ✅ |

### 검증
- `node --check public/static/app.js` → ✅ OK
- `npm run build` → ✅ `dist/_worker.js 298.71 kB` (1.68s)

---

## [BUG-212] 상단 헤더·사이드메뉴 고정 안됨 — .main-content flex/min-height 전역 적용 (세션 141)

> **대상**: `public/static/style.css` — BUG-211 수정 후 잔존 FEAT-210 CSS 부작용
> **작업일**: 2026-08-07
> **유형**: 🔴 BUG — 스크롤 시 상단 헤더(작업현황 타이틀)가 콘텐츠와 함께 스크롤됨

### 증상
- 안드로이드 앱에서 페이지 스크롤 시 상단 헤더(`.top-header`)가 콘텐츠와 함께 위로 사라짐
- 좌측 아이콘 레일(`#icon-rail`, `position:fixed`)은 정상 고정 유지
- BUG-211 수정(터치 스크롤 복원) 이후 발생 확인

### 원인

FEAT-210 적용 시 `style.css`에 추가된 아래 규칙이 원인:

```css
/* ❌ 문제 코드 (FEAT-210, BUG-211 수정 후에도 잔존) */
.main-content {
  display: flex;
  flex-direction: column;
  min-height: 100vh;   ← 이 두 속성이 문제
}
```

**`position: sticky`의 스크롤 컨테이너 결정 원리:**
- `sticky` 요소는 **가장 가까운 스크롤 가능한 조상** 안에서만 고정됨
- `.main-content`에 `display:flex` + `min-height:100vh` 적용 시 브라우저가 `.main-content`를 스크롤 컨테이너로 인식
- 결과: `.top-header { position:sticky; top:0 }` 가 `body` 기준이 아닌 `.main-content` 기준으로 동작
- 콘텐츠를 스크롤하면 `.main-content` 전체가 스크롤되어 `sticky` 헤더도 함께 사라짐

| 요소 | CSS | 기대 | 실제(문제) |
|------|-----|------|----------|
| `.top-header` | `position:sticky; top:0` | body 기준 고정 | `.main-content` 기준 sticky → 스크롤 시 사라짐 |
| `#icon-rail` | `position:fixed` | viewport 고정 | ✅ 정상 (fixed는 영향 없음) |

### 수정 내용 (`public/static/style.css`)

`.main-content` 전역 flex 규칙 완전 제거 → `.site-map-mode` 전용으로 이동

```css
/* 변경 전 */
.main-content {
  display: flex;
  flex-direction: column;
  min-height: 100vh;   /* ← 제거 */
}
.main-content.site-map-mode {
  height: 100vh;
  overflow: hidden;
}

/* 변경 후 */
/* .main-content 전역 규칙 없음 */
.main-content.site-map-mode {
  display: flex;          /* ← site-map 전용으로 이동 */
  flex-direction: column; /* ← site-map 전용으로 이동 */
  height: 100vh;
  overflow: hidden;
}
```

### 충돌 체크
- **site-map 진입 시** JS line 45648: `pageContent.style.flex='1'` 등 인라인 설정 + `classList.add('site-map-mode')` → CSS `.site-map-mode { display:flex }` 활성화 → flex 체인 정상 ✅
- **site-map 이탈 시** JS line 3200: 모든 인라인 스타일 `''` 초기화 + `classList.remove('site-map-mode')` → CSS flex 비활성화 → 일반 페이지 sticky 정상 복원 ✅
- `#page-content { flex:1; display:flex }` 전역 CSS → `.main-content`가 flex container 아니므로 일반 페이지에서 무시, site-map에서는 JS 인라인이 우선 적용 ✅
- `#siteMapRoot`, `#leafletMap`, `#siteMapList` 규칙 영향 없음 ✅
- `.main-content.site-map-mode { height:100dvh }` 모바일 미디어쿼리 (BUG-211 수정) 영향 없음 ✅

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (298.71 kB, 1.79s)

### 커밋
- `fb388dc` — fix: [BUG-212] 상단 헤더 스크롤 이탈 — style.css .main-content flex/min-height 전역적용 제거 (v=20260806d))

---

## [BUG-211] 안드로이드 앱 터치 스크롤 불가 — #page-content overflow:hidden 전역 적용 (세션 141)

> **대상**: `public/static/style.css` — FEAT-210 CSS 부작용
> **작업일**: 2026-08-06
> **유형**: 🔴 BUG — FEAT-210(e4cdedd) 적용 이후 모든 페이지에서 터치 스크롤 차단

### 증상
- 안드로이드 앱 접속 시 내 작업목록 등 모든 화면에서 터치 스크롤 동작 안 함
- 발생 시점: 2026-08-06 오후 (FEAT-210 NAS 반영 시점과 일치)

### 원인

FEAT-210 적용 시 `style.css`에 추가된 `#page-content { overflow: hidden }` 이
**전역 CSS**로 작용하여 site-map 페이지 외 **모든 페이지**의 공통 컨테이너에 `overflow:hidden` 적용.

```css
/* ❌ 문제 코드 (FEAT-210 e4cdedd) */
#page-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;  /* ← 모든 페이지 터치 스크롤 차단 원인 */
}
```

**추가 발견**: 모바일 미디어 쿼리 `@media (max-width:768px) { .main-content { height:100dvh } }` 도
`.site-map-mode` 조건 없이 전역 적용 → 함께 수정.

| 항목 | 내용 |
|------|------|
| **JS `overflowY` 문제 여부** | JS line 45650 `pageContent.style.overflowY='hidden'` 은 site-map 진입 시만 적용, 이탈 시 line 3205에서 `''` 초기화 → **문제 없음** |
| **CSS 문제** | `#page-content { overflow:hidden }` 항상 적용 → **전체 페이지 스크롤 차단** |

### 수정 내용 (`public/static/style.css`)

**수정 1 — `#page-content` overflow:hidden 제거 + `.site-map-mode` 전용 규칙 추가**

```css
/* 변경 전 */
#page-content {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  overflow: hidden;  /* ← 제거 */
}

/* 변경 후 */
#page-content {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  /* overflow:hidden 제거 */
}
.main-content.site-map-mode #page-content {
  overflow: hidden;  /* site-map 전용 */
}
```

**수정 2 — 모바일 미디어 쿼리 `height:100dvh` 스코프 제한**

```css
/* 변경 전 */
@media (max-width: 768px) {
  .main-content { height: 100dvh; }  /* ← 전역 적용 */
}

/* 변경 후 */
@media (max-width: 768px) {
  .main-content.site-map-mode { height: 100dvh; }  /* site-map 전용 */
}
```

### 충돌 체크
- JS line 3208 `_mc.classList.remove('site-map-mode')` 이탈 시 클래스 제거 → CSS 규칙도 함께 해제 ✅
- JS line 45650 `pageContent.style.overflowY='hidden'` 인라인 스타일 → site-map 진입 시만, 이탈 시 초기화 ✅
- `.main-content.site-map-mode { height:100vh }` 기존 규칙 유지 (수정 없음) ✅
- `#siteMapRoot`, `#leafletMap`, `#siteMapList` 규칙 영향 없음 ✅

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (298.71 kB, 2.39s)

### 커밋
- `1f87186` — fix: [BUG-211] 안드로이드 터치 스크롤 불가 — style.css #page-content/모바일 overflow:hidden 전역적용 수정 (v=20260806c)

---

## [FEAT-210] 현장위치지도 레이아웃 반응형 + 기본값 변경 (세션 141)

> **대상**: `renderSiteMapPage` (app.js) + style.css 현장위치지도 섹션
> **작업일**: 2026-08-06
> **유형**: 🟢 FEATURE — 지도 화면 크기 브라우저 창 자동 조절 + 기본 조회 진행탭·오늘

### 요구사항
1. 현장위치지도 지도 영역이 `height:175vh` 고정으로 작업 목록이 화면 아래로 밀려 스크롤해야 보이는 문제 개선
2. 접속 시 기본 조회: 탭=진행, 날짜=오늘

### 수정 내용

**레이아웃 방안 A (브라우저 창 높이 반응형)**

| 구성 요소 | 기존 | 변경 |
|---------|------|------|
| 지도 `#leafletMap` | `height:175vh; flex-shrink:0` (고정) | `flex:1; min-height:260px` (나머지 공간 자동 채움) |
| 목록 `#siteMapList` | `max-height:40vh` | `max-height:180px` (CSS 제어, 고정 영역) |
| `main-content` | `min-height:100vh` (항상) | `.site-map-mode` 클래스 시에만 `height:100vh; overflow:hidden` |
| `page-content` | `display:block; height:auto` (JS 덮어쓰기) | `display:flex; flex-direction:column; height:0` (flex 체인 유지) |

**CSS 격리 전략 (충돌 방지)**
- `.main-content.site-map-mode` — site-map 진입 시만 활성화, 이탈 시 자동 제거
- 다른 페이지는 기존 `min-height:100vh` 그대로 → 스크롤 정상 작동

**기본값 변경**

| 항목 | 기존 | 변경 |
|------|------|------|
| 기본 탭 | `risk` (위험성체크) | `working` (진행) |
| 기본 날짜 from | 오늘 -30일 | 오늘 |
| 기본 날짜 to | 오늘 | 오늘 (동일) |

**반응형 breakpoint**

| 화면 | 지도 최소 높이 | 목록 최대 높이 |
|------|-------------|-------------|
| 모바일 ≤768px | 220px | 140px |
| 태블릿 769~1024px | 300px | 160px |
| 기본 (PC) | 260px | 180px |
| 대형 ≥1440px | 260px | 220px |

### 충돌 체크
- style.css `#siteMapRoot`, `#leafletMap` 기존 flex 정의 이미 존재 → 확장 적용 ✅
- 이탈 리셋 코드 (navigateTo line ~3199) 이미 모든 인라인 스타일 초기화 → `.site-map-mode` 제거 코드 추가로 완전 격리 ✅
- 다른 페이지 `main-content` 영향 없음 (클래스 미부여 시 기존 동작 유지) ✅

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (298.71 kB, 1.68s)

### 커밋
- `bbc7ad8` — feat: [FEAT-210] 현장위치지도 레이아웃 방안A — 브라우저 창 높이 반응형 + .site-map-mode CSS 격리
- `e4cdedd` — feat: [FEAT-210] 현장위치지도 기본값 진행탭·오늘 변경 + 지도 flex:1 반응형 레이아웃 (v=20260806b)

---

## [BUG-209] 현장위치지도 진행·완료탭 마커 미표시 수정 (세션 141)

> **대상**: `loadSiteMapMarkers` 진행탭·완료탭 (app.js) + `GET /geocode/forward` 신규 (geocode.ts)
> **작업일**: 2026-08-06
> **유형**: 🔴 BUG — GPS 없는 작업이 목록에는 표시되나 지도 마커가 표시되지 않음

### 원인

`tasks.gps_lat/lon` 없고 `work_logs` GPS fallback도 없을 때,  
`tasks.confirmed_address`(최종주소) · `tasks.work_order_address`(작업지시주소)가 존재해도  
geocoding 없이 바로 `noGps:true` 처리 → 지도 마커 미표시

- `/tasks API`는 이미 `SELECT t.*`로 두 주소 필드를 반환하고 있었음
- 순방향 지오코딩(`/geocode/forward`) API가 존재하지 않아 클라이언트에서 활용 불가

### 수정 내용

**백엔드 `src/nas-routes/geocode.ts`**

| 엔드포인트 | 추가 내용 |
|-----------|---------|
| `GET /geocode/forward?address=` | 주소→좌표 변환 (카카오 `search/address.json` 우선 + Nominatim fallback) |

- 반환: `{ lat, lon, address, source }` (실패 시 `source:'failed'`, 404)
- `GET /geocode/reverse`와 동일한 인증·키 처리 패턴

**프론트엔드 `public/static/app.js`**

마커 표시 우선순위 (수정 후):
1. `tasks.gps_lat/lon` (GPS 좌표) ← 기존 유지
2. `work_logs` GPS fallback ← 기존 유지
3. **`confirmed_address`(최종주소) → `/geocode/forward` 호출** ← 신규
4. **`work_order_address`(작업지시주소) → `/geocode/forward` 호출** ← 신규
5. 모두 실패 → `noGps:true` 목록만 표시

| 탭 | 적용 위치 | 처리 |
|----|---------|------|
| 진행탭 (`filter==='working'`) | else 블록 (line ~46025) | `addrForGeo` geocoding 후 마커 생성 |
| 완료탭 (`filter==='completed'`) | else 블록 (line ~46147) | 동일 패턴 (`addrForGeoCo` 변수명) |

- 팝업에 위치 출처 안내 추가: 황색 `"최종주소 기반 위치 (참고용)"` / `"작업지시주소 기반 위치 (참고용)"`
- 아이콘 레이블에도 `(최종주소)` / `(작업지시주소)` 구분 표시

### 충돌 체크 결과
- `/api/geocode` 라우트: `node-server.ts` 기 등록 — `/forward` 자동 포함 ✅
- 기존 `/geocode/reverse`: line 753 한 곳만 사용, 충돌 없음 ✅
- `confirmed_address` / `work_order_address` 필드: `SELECT t.*`로 이미 반환 중 ✅
- TBM·위험성체크·현장점검 탭: 별도 로직, 영향 없음 ✅

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (298.71 kB, 5.56s)

### 커밋
- `2ad95db` — feat: [BUG-209] /geocode/forward 순방향지오코딩 API 추가 — 주소→좌표 변환 (카카오 REST + Nominatim fallback)
- `5e363a1` — fix: [BUG-209] 현장위치지도 진행·완료탭 마커 미표시 수정 — GPS없을 때 최종주소→작업지시주소 geocoding 마커 표시 (v=20260806a)

---

## [FEAT-VOTE-STATUS] 안보위 안건 투표현황 표시 (세션 140)

> **대상**: `_scLoadAgendasTab` (app.js) + `GET /meetings/:id`, `GET /meeting/:id` (safety-committee.ts)
> **작업일**: 2026-08-04
> **유형**: 🟢 FEATURE — 투표 활성 안건에 투표완료 수 및 미투표자 이름 표시

### 요구사항
- 안보위 안건 탭에서 투표 활성 안건 카드에 "누가 투표했는지 / 누가 안 했는지" 즉시 확인 가능
- 표시 예: `✅ 투표완료: 3명` / `⏳ 미투표: 홍길동, 이영희`

### 수정 내용

**백엔드 `src/nas-routes/safety-committee.ts`**

| 엔드포인트 | 추가 내용 |
|-----------|---------|
| `GET /meetings/:id` | 각 안건에 `votes: [{ user_id, voter_name, vote, voted_at }]` 배열 추가 |
| `GET /meeting/:id` | 동일 (하위 호환 단수 경로) |

- `safety_committee_votes` JOIN `users` — meeting_id 기준 일괄 조회 후 agenda_id로 그룹핑
- 구버전 NAS (테이블 없음) 대응: `try/catch` + 빈 배열 폴백

**프론트엔드 `public/static/app.js`**

- `_scLoadAgendasTab` 에 `attendees` 배열 추출 추가
- 의결 표시 아래 **투표현황 블록** 신규 추가:
  - `✅ 투표완료: N명` — votes 배열 길이
  - `⏳ 미투표: 이름1, 이름2, ...` — attendees 중 votes에 없는 사람
  - 전원 완료 시 → `없음 (전원 완료)` 초록 배경
  - 미투표자 있을 시 → 황색 배경

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (298.71 kB, 1.46s)
- NAS 반영 확인 ✅

### 커밋
- `174248c` — feat: [FEAT-VOTE-STATUS] 안보위 안건 투표현황 표시 (투표완료 수 + 미투표자 이름)
- 버전: `v=20260804i`

---

## [FIX-PRINT-DATE-LABEL] 교육일지·서명지 출력 헤더 '작성일' → '출력일' 변경 (세션 140)

> **대상**: `printEduLog`, `printEduSign` (app.js)
> **작업일**: 2026-08-04
> **유형**: 🔴 BUG — 출력물 상단 날짜 레이블이 "작성일"로 표시되어 혼동 유발

### 원인
`const today = new Date()` 로 인쇄 시점 오늘 날짜를 가져오면서 레이블을 `작성일:` 로 표기 →
인쇄일(출력일)임에도 "작성일"로 표시되어 실제 문서 작성일과 혼동

### 전수 체크 결과

| 출력 함수 | 레이블 | 문제 여부 |
|----------|--------|---------|
| `printEduLog` (교육일지) | `작성일` → **`출력일`** | ⚠️ 수정 |
| `printEduSign` (서명지) | `작성일` → **`출력일`** | ⚠️ 수정 |
| `_tbmPrint` (TBM) | 이미 `출력일` | ✅ 정상 |
| 물량통계 출력 | 이미 `인쇄일` | ✅ 정상 |
| 안보위 운영규칙·조직도·회의록 | 이미 `출력일` | ✅ 정상 |

### 수정 내용
- `printEduLog` — 인쇄용 fixed 헤더 + 화면 미리보기 헤더 2곳: `작성일:` → `출력일:`
- `printEduSign` — 인쇄용 fixed 헤더 + 화면 미리보기 헤더 2곳: `작성일:` → `출력일:`
- 총 4곳 수정, 날짜 값(`today = new Date()`)은 그대로 유지

### 검증
- `grep "작성일" public/static/app.js` → **0건** ✅
- `node --check` ✅ / `npm run build` ✅
- NAS 반영 확인 ✅

### 커밋
- `8ec34c0` — fix: [FIX-PRINT-DATE-LABEL] 교육일지·서명지 출력 헤더 '작성일' → '출력일' 레이블 변경
- 버전: `v=20260804h`

---

## [FEAT-PDF-FILENAME] 인쇄 PDF 저장 시 문서 파일명 자동 설정 (세션 139)

> **대상**: `_openPrintOverlay` + 전체 출력 함수 (TBM·교육·서명지·회의록·조직도)
> **발견일**: 2026-08-04
> **유형**: 🟢 FEATURE — PDF 저장 시 의미 있는 파일명 자동 적용

### 요구사항
- 브라우저에서 인쇄→PDF 저장 시 `제목없음.pdf` 대신 문서 내용을 반영한 파일명 자동 설정
- 예) TBM → `TBM_20260804_고소작업안전점검.pdf`

### 구현 방식
브라우저 인쇄→PDF 저장 시 `<title>` 값을 파일명으로 사용하는 동작(Chrome/Edge/Firefox 공통)을 활용.
`_openPrintOverlay(htmlContent, docTitle)` 두 번째 인자를 추가하여 HTML `<title>` 태그를 교체.

### 수정 내용

| 함수 | 파일명 형식 | 예시 |
|------|-----------|------|
| `_openPrintOverlay` | `docTitle` 파라미터 추가 + `_safePdfFilename()` 헬퍼 추가 | — |
| `_tbmPrint` | `TBM_YYYYMMDD_작업건명` | `TBM_20260804_고소작업안전점검` |
| `printEduLog` | `교육종류_YYYYMMDD_교육건명` | `안전교육_20260804_화재안전교육` |
| `printEduSign` | `서명지_교육종류_YYYYMMDD_교육건명` | `서명지_안전교육_20260804_화재안전교육` |
| `_scPrintMeeting` | `안보위_회의종류_YYYYMMDD_회의제목` | `안보위_정기_20260804_제3차정기회의` |
| `_scPrintOrgChart` | `안보위_조직도_YYYYMMDD` | `안보위_조직도_20260804` |

### 추가 — autoScaleOrg 개선 (조직도 A4 꽉 채우기)
- `marginBottom` 초기화 누락 수정 (`page.style.marginBottom = ''` 추가)
- `if (!naturalH) return` — 0값 방어 추가
- 최대 cap `1.8 → 2.0`, 최소 하한 `0.3` 추가
- 스킵 임계값 `0.02 → 0.01` (더 정밀하게)
- `src/index.tsx` 버전: `v=20260804d` → `v=20260804e`

### 브라우저 호환
| 브라우저 | 동작 |
|---------|------|
| Chrome / Edge | ✅ `<title>` → PDF 파일명 자동 적용 |
| Firefox | ✅ 동일 |
| Safari | ⚠️ 일부 버전에서 미적용 (기본 동작 유지) |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (298.71 kB, 2.05s)

### 커밋
- `a6ccc03` — feat: [FEAT-PDF-FILENAME] 인쇄 PDF 저장 파일명 자동 설정 — TBM/교육/서명지/회의록/조직도 + autoScaleOrg 세부 개선

---

## [FIX-SC-ORG-PRINT-SCALE] 조직도 인쇄 — A4 하단 빈공간 제거 (세션 138)

> **대상**: `_scPrintOrgChart` 내 `_autoScaleOrg` IIFE
> **발견일**: 2026-08-04
> **유형**: 🔴 BUG — 조직도 콘텐츠 < A4 높이 시 확대 미적용으로 하단 빈공간 발생

### 원인
`_autoScaleOrg` 함수의 조기 반환 조건:
```javascript
if (naturalH <= A4_AVAIL_PX) return;  // 콘텐츠가 A4보다 작으면 스케일링 건너뜀
```
조직도 특성상 위원 수가 적을 경우 콘텐츠가 A4 절반 이하 → 하단 약 50% 흰 여백 발생

### 수정 내용

| 위치 | 변경 전 | 변경 후 |
|------|--------|---------|
| `_autoScaleOrg` `doFit()` | `if (naturalH <= A4_AVAIL_PX) return;` 조건으로 확대 건너뜀 | 조건 제거 → 항상 ratio 계산 |
| ratio 계산 | 축소만 적용 | 확대·축소 모두 적용, `Math.min(ratio, 1.8)` cap |
| 스킵 조건 | 없음 (너무 작으면 항상 return) | `Math.abs(ratio - 1) < 0.02` — ±2% 이내면 스킵 |
| `src/index.tsx` 버전 | `v=20260804c` | `v=20260804d` |

### 수정 핵심 코드
```javascript
// 변경 전
var naturalH = page.scrollHeight;
if (naturalH <= A4_AVAIL_PX) return;   // ← 문제
var ratio = A4_AVAIL_PX / naturalH;

// 변경 후
var naturalH = page.scrollHeight;
var ratio = A4_AVAIL_PX / naturalH;
ratio = Math.min(ratio, 1.8);          // 과도한 확대 방지 (180% cap)
if (Math.abs(ratio - 1) < 0.02) return; // ±2% 이내면 처리 불필요
```

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (298.71 kB, 1.32s)

### 커밋
- `5c93def` — fix: [FIX-SC-ORG-PRINT-SCALE] 조직도 인쇄 autoScaleOrg 확대·축소 모두 적용 — A4 하단 빈공간 제거

---

## [FEAT-SC-ORG-PRINT] 산업안전보건위원회 — 조직도 인쇄 전면 개선 (세션 137)

> **대상**: 산업안전보건위원회 조직도 PDF 출력 (`_scPrintOrgChart`)
> **발견일**: 2026-08-04
> **유형**: 🟢 FEATURE — 조직도 인쇄 안전교육 방식 통일

### 요구사항
- 안전교육 출력 방식과 동일한 구조 적용 (`_openPrintOverlay` + a4-page)
- A4 1장 한 페이지 출력 (비율 자동 조정)
- 팝업(`window.open`) 방식 제거 → 브라우저 팝업 차단 문제 해소

### 수정 내용

| 위치 | 파일 | 변경 내용 |
|------|------|----------|
| `_scPrintOrgChart` 전체 | `public/static/app.js` | 전면 재작성 — 안전교육 방식 통일 |
| 렌더링 방식 | - | `window.open()` 팝업 → `_openPrintOverlay()` + a4-page div |
| 데이터 소스 | - | DOM innerHTML 복사 → API `/api/safety-committee/members` 재호출 |
| 아이콘 | - | FontAwesome CDN 의존 제거 → 텍스트 기호(★◆▣●)로 대체 (인쇄 안정성) |
| A4 여백 | - | 없음 → `@page 10mm 8mm` 균일 (회의록·안전교육 동일) |
| 비율 자동 조정 | - | 없음 → `_autoScaleOrg` JS (`#sc-org-a4Page`, `__sc-org-zoom__`) |
| 툴바 | - | 단순 버튼 → 보라색 툴바 + 🖨️ 인쇄/PDF + ✕ 닫기 |
| `src/index.tsx` | 버전 | `v=20260804b` → `v=20260804c` |

### 충돌 체크
- `sc-org-a4Page` id: 기존 `sc-a4Page`(회의록), `a4Page`(안전교육)과 네임스페이스 분리 ✅
- `__sc-org-zoom__` style id: 기존 `__sc-print-zoom__`, `__edu-print-zoom__`과 분리 ✅
- `_autoScaleOrg` IIFE: 기존 `_autoScaleSC`, `_autoScaleEdu`와 분리 ✅
- `_scPrintOrgChart` 단독 독립 함수, 외부 참조 없음 ✅

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (298.71 kB, 1.84s)

### 커밋
- `9176b3b` — feat: [FEAT-SC-ORG-PRINT] 산업안전보건위원회 조직도 인쇄 전면 개선

---

## [FEAT-SC-PRINT] 산업안전보건위원회 — 회의록 인쇄 전면 개선 (세션 136)

> **대상**: 산업안전보건위원회 회의록 PDF 출력 (`_scPrintMeeting`)
> **발견일**: 2026-08-04
> **유형**: 🟢 FEATURE — 인쇄 UX 전면 개선

### 요구사항
1. 안전교육 출력 방식과 동일한 렌더링 구조 적용
2. 좌/우 여백 최소화 → A4 1장 수용
3. 안건제목 컬럼 폭 확대 (22%)
4. 안건 내용 줄바꿈(`\n`) 인쇄 반영
5. 서명부: 사용자측/근로자측 각각 2명 1행 2열 병렬 배치
6. A4 비율 자동 조정 (`_autoScaleSC` JS 삽입)
7. 회의 요약 textarea 확대 (신규 rows=2→5, 수정모달 rows=3→6)

### 수정 내용

| 위치 | 파일 | 변경 내용 |
|------|------|----------|
| `_scPrintMeeting` 전체 | `public/static/app.js` | 안전교육 방식(a4-page div + 툴바 + autoScale) 통일 |
| `@page margin` | 인쇄 CSS | `14mm 12mm` → `10mm 8mm` (여백 최소화) |
| 안건 테이블 컬럼 | 인쇄 HTML | 안건제목 `22%` 확장, 내용 `white-space:pre-wrap` |
| 서명부 레이아웃 | 인쇄 HTML | 1인 1행 → 2인 1행, 사용자측/근로자측 색상 구분 헤더 |
| `_autoScaleSC` JS | 인쇄 HTML | `sc-a4Page` id 기반 zoom + transform scale 자동 비율 |
| `sc-new-summary` | `public/static/app.js` | `rows="2"` → `rows="5"`, `min-height:100px` |
| `sc-edit-summary` | `public/static/app.js` | `rows="3"` → `rows="6"`, `min-height:120px` |
| `src/index.tsx` | 버전 문자열 | `v=20260804a` → `v=20260804b` |

### 충돌 체크
- `_scPrintMeeting` (51061~51178): 단일 독립 함수, 외부 참조 없음 ✅
- `_autoScaleSC` id: `sc-a4Page` — 기존 `a4Page`(안전교육용), `_autoScale`(TBM용)과 네임스페이스 분리 ✅
- `sc-new-summary`, `sc-edit-summary`: 각각 단독 사용, 충돌 없음 ✅

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (298.71 kB, 1.53s)

### 커밋
- `a088a54` — feat: [FEAT-SC-PRINT] 산업안전보건위원회 회의록 인쇄 전면 개선

---

## [FEAT-SC-VOTE] 산업안전보건위원회 — 안건 투표 후 의결 결과 자동 표시 (세션 134)

> **대상**: 산업안전보건위원회 회의록 (전체 공통)
> **발견일**: 2026-08-04
> **유형**: 🟢 FEATURE — 기존 투표 기능 UX 개선

### 요구사항
안건의 투표 처리 후 의결 결과(찬성 N명 / 반대 N명 → 가결/부결)를 화면 및 인쇄 출력에 자동 표시.

### 수정 내용

| 위치 | 파일 | 변경 내용 |
|------|------|----------|
| 안건 목록 카드 | `public/static/app.js` | 투표 집계 뒤 **가결/부결 배지** 자동 추가 |
| 안건 수정 모달 | `public/static/app.js` | 투표 활성 안건 수정 시 집계+판정 표시 + **자동입력 버튼** |
| 회의록 PDF 출력 | `public/static/app.js` | 의결결과 열에 **찬성N/반대N + 가결/부결** 통합 표시 |

#### [수정1] 안건 카드 의결 표시 (변경 전→후)
```
변경 전: 투표: ✔ 찬성 9  ✘ 반대 1  — 기권 0
변경 후: 의결: 찬성 9명 / 반대 1명 / 기권 0명  ✅ 가결
         (부결 시: ❌ 부결, 투표 0건 시 판정 배지 없음)
```

#### [수정2] 안건 수정 모달 자동입력
```
투표 집계: 찬성 9명 / 반대 1명 → 가결  [자동입력] 버튼
의결 결과: [찬성 9명 / 반대 1명  가결          ] ← 버튼 클릭 시 자동 채움, 수동 편집 가능
```

#### [수정3] 회의록 인쇄 의결결과 열
```
변경 전: 원안 가결 (텍스트만)
변경 후: 찬성 9명 / 반대 1명
         가결
         (result 텍스트 있으면 아래에 추가 표시)
```

### 판정 기준
- **가결**: 찬성 > 반대
- **부결**: 찬성 ≤ 반대
- **판정 없음**: 총 투표 수 0건 (투표 비활성 또는 아직 미투표)

### 충돌 체크
- `voteHtml` 블록: 독립 스코프, 다른 함수와 변수명 충돌 없음 ✅
- `sc-ag-edit-result` id: 단독 사용, 다른 참조 없음 ✅
- `agendaRows` print 블록: `_scPrintMeeting` 내 지역 스코프 ✅
- `ag.vote_agree/disagree/abstain`: 기존 집계 패턴 동일 방식 적용 ✅

### 커밋
- `9b5bd79` — feat: [FEAT-SC-VOTE] 산업안전보건위원회 투표 의결 결과 자동 표시 — 가결/부결 배지 + 수정모달 자동입력 + 인쇄 통합

---

## [BUG-208] 업데이트 중 "Network 조회 실패" 빨간 배너 표시 (세션 133)

> **대상**: 전체 공통 (UI)
> **발견일**: 2026-08-03
> **심각도**: 🟡 MINOR — 기능 영향 없음, UX 혼란 유발

### 현상
GitHub push → Webhook → pm2 restart 진행 중 업데이트 UI에 빨간색으로
`"상태 조회 실패: Network Error"` 메시지 표시. 업데이트 자체는 정상 완료됨.

### 근본 원인
pm2 restart 시 서버가 수 초간 다운 → 브라우저 폴링(2초마다 `/api/admin/update/status`)이
응답 없는 서버에 요청 → axios `Network Error` → catch → 빨간 에러 배너 출력.
실제 오류가 아닌 **정상 재시작 다운타임의 부산물**.

### 수정 내용
`public/static/app.js` — `_updLoadStatus()` catch 블록 개선:

```javascript
// 수정 전
} catch(e) {
    _updSetBanner('상태 조회 실패: ' + e.message, 'error');  // 항상 빨간 배너
}

// 수정 후
} catch(e) {
    if (e.message === 'Network Error' || e.code === 'ERR_NETWORK' || (e.response && e.response.status >= 500)) {
        _updSetBanner('서버 재시작 중... 잠시 대기하세요 ⏳', 'restarting');  // 노란 대기 배너
    } else {
        _updSetBanner('상태 조회 실패: ' + e.message, 'error');  // 진짜 오류만 빨간 배너
    }
}
```

### 커밋
- `69b95d3` — fix: [BUG-208] pm2 restart 중 Network Error → 빨간 에러 배너 대신 재시작 대기 안내로 표시
- `ee9725f` — test: [BUG-208] 재시작 중 Network Error 배너 개선 검증 — v=20260803h

### 검증 결과 (세션 133, 2026-08-03)
- NAS001에서 테스트 push(ee9725f) 후 Webhook 자동업데이트 진행
- 재시작 중 UI 배너: 🟡 **"서버 재시작 중... 잠시 대기하세요 ⏳"** 정상 표시 ✅
- 빨간 "상태 조회 실패: Network Error" 메시지 완전 소멸 ✅
- 업데이트 완료 후 서버 정상 응답 ✅

---

## [BUG-207] GitHub push 후 503 — 치킨-에그 구조 영구 해결 (세션 132)

> **대상 NAS**: NAS001 LinkMax 본사 (전체 공통)
> **발견일**: 2026-08-03
> **심각도**: 🔴 CRITICAL — GitHub push 후 매번 503, 수동 업데이트(UI)만 정상

### 현상

BUG-206 수정(Webhook 플로우 npm install 삽입) 후에도 동일 증상 반복.  
수동 업데이트는 항상 정상, GitHub push 후 Webhook 자동업데이트만 503.

### 근본 원인 — 치킨-에그 구조

```
[기존 악순환의 본질]
push → Webhook 수신
  → 현재 실행 중인 서버(구버전 admin.ts)가 업데이트 처리
  → 구버전 코드에 버그 있으면 수정 코드가 push되어도 영원히 적용 불가
  → 구버전이 npm install 없이 build → 실패 → 503 → pm2 restart
  → 새 코드 로딩 → 그러나 이미 503, 다음 push 때 또 반복
```

수동 업데이트가 되는 이유: 브라우저에서 UI 버튼 클릭 → 현재 메모리에 로딩된 코드 실행.  
수동으로 복구 후 pm2 restart → 새 코드(BUG-206 수정본) 로딩 → 다음 수동 업데이트는 정상.  
하지만 그 다음 push가 오면 → Webhook → 새 코드로 처리 → 정상이어야 하는데...  
**실제로는 또 503** → BUG-206 수정 코드조차 실행될 기회가 없었음.

### 수정 내용

**핵심 설계 변경: 업데이트 로직을 서버 코드(admin.ts)에서 start-server.sh(bash)로 이전**

```
[수정 후 구조]
push → Webhook → pm2 restart 만 트리거
  → start-server.sh (bash 스크립트) 가 직접 실행:
       STEP1: git pull (origin/main)       ← 항상 최신 코드
       STEP2: npm install --ignore-scripts ← rollup 바이너리 복구
       STEP3: bs3 GLIBC 바이너리 교체      ← BUG-BS3
       STEP4: tsx 심볼릭 링크 복구          ← BUG-202
       STEP5: vite build                   ← 최신 코드로 빌드
       STEP6: node tsx node-server.ts 기동
  → 서버 코드(admin.ts) 버전과 완전히 무관
  → 어떤 버그가 admin.ts에 있어도 절대 영향 없음 ✅
```

| 파일 | 변경 내용 |
|------|----------|
| `scripts/start-server.sh` | git pull + npm install + bs3 교체 + tsx 복구 + vite build 전체 내장 |
| `src/nas-routes/admin.ts` | Webhook 플로우: npm install/build 제거 → pm2 restart만 트리거 |
| `src/index.tsx` | 버전 문자열 v=20260803d → v=20260803e |

### 검증 결과
- `npm run build` ✅ (298.71 kB, 1.39s)
- NAS001 수동 복구 + PM2 재등록 후 서버 정상 응답 ✅
  - `pm2 status`: online, mem 42.1mb, restart 0회
  - `curl https://localhost:3443`: `<!DOCTYPE html>` 정상 응답

### 재발 방지
- **업데이트 로직은 반드시 bash 스크립트(start-server.sh)에만** — 서버 코드에 두지 않음
- Webhook/수동 업데이트 모두 최종적으로 pm2 restart → start-server.sh 실행
- 서버 코드 버그와 완전히 독립된 업데이트 파이프라인

### 커밋
- `68c127e` — fix: [BUG-207] start-server.sh에 git pull+build 내장 — 서버 코드 버전 의존 완전 제거

---

## [BUG-206] GitHub push 후 자동업데이트(Webhook)만 503 발생 — Webhook 플로우 npm install 누락 (세션 132)

> **대상 NAS**: NAS001 LinkMax 본사 (전체 공통)
> **발견일**: 2026-08-03
> **심각도**: 🔴 CRITICAL — GitHub push 후 서버 전체 503, 수동 업데이트(UI)는 정상

### 현상

- 시스템설정 → 서버업데이트(수동 UI) 로 업데이트하면 정상
- GitHub에 push 후 Webhook으로 자동 업데이트하면 **매번 503** 발생
- `app.js?v=이전버전` (구버전 dist) 이 계속 서빙됨
- BUG-202 해결(start-server.sh 래퍼) 후에도 동일 증상 반복

### 근본 원인 분석

**수동 업데이트 플로우 vs Webhook 자동 업데이트 플로우 비교:**

```
수동 업데이트 (정상):
  git reset --hard
  → runNpmInstall()   ← ✅ 있음
  → fixBs3Binary()    ← ✅ 있음
  → fixTsxBinary()    ← ✅ 있음
  → runBuild()
  → pm2 restart

Webhook 자동 업데이트 (문제):
  git reset --hard
  → (npm install 없음) ← ❌ 누락!
  → (fixBs3Binary 없음) ← ❌ 누락!
  → (fixTsxBinary 없음) ← ❌ 누락!
  → runBuild()        ← rollup optional 바이너리 없어 빌드 실패
  → pm2 restart       ← 구버전 dist 유지 → 503
```

**왜 수동은 되고 Webhook은 안 됐나?**
- 수동 업데이트 플로우(`/api/admin/update`)에는 BUG-ROLLUP 수정 시 `runNpmInstall()` 등을 추가했음
- Webhook 플로우(`/api/admin/update/webhook`)는 별도 코드 블록으로 분리되어 있어 동일한 수정이 **누락**됨
- push가 올 때마다 Webhook 플로우만 실행되므로 매번 503 재발

### 수정 내용 (src/nas-routes/admin.ts)

**Webhook 플로우 Step 3~3c 삽입** (line ~1426):

```typescript
// ── 3. npm install — optional 바이너리 복구 ────────────────────
// BUG-206: Webhook 플로우에 npm install이 없어 git reset 후 rollup optional 바이너리 누락
await runNpmInstall(cwd, 120000)

// ── 3b. better-sqlite3 GLIBC 호환 바이너리 교체 ────────────────
await fixBs3Binary(cwd)

// ── 3c. tsx 바이너리 링크 복구 ──────────────────────────────────
// BUG-202 + BUG-206: Webhook 플로우에도 동일하게 적용
await fixTsxBinary(cwd)

// ── 4. 프론트엔드 dist 재빌드 (기존 Step 3 → Step 4로 번호 이동)
```

### 검증 결과
- `npm run build` ✅ (298.71 kB, 1.66s)
- `node --check public/static/app.js` ✅
- **NAS001 실제 검증** ✅ — 수동 업데이트(UI) 적용 후 `/static/app.js?v=9dbd76d` 서빙 확인
- **버전 문자열** ✅ — `app.js?v=20260803d`, `mobile-app.js?v=9dbd76d` 정상 확인

### 503 악순환 전체 원인 체계 (세션 128~132 종합)

```
[GitHub push 발생]
      ↓
Webhook 수신 → git reset --hard
      ↓
❌ npm install 없음 (BUG-206 — 이번 수정으로 해결)
      ↓
rollup optional 바이너리 누락 → vite build 실패
      ↓
구버전 dist 유지 + tsx 소멸 (BUG-202)
      ↓
pm2 restart 실패 → 503
```

세 버그의 연쇄였으며, BUG-206(Webhook npm install 누락)이 최초 트리거였음.

### 재발 방지
- Webhook 플로우가 수동 플로우와 동일한 복구 체인(npm install → fixBs3Binary → fixTsxBinary → build)을 갖게 됨
- 이후 업데이트 플로우 변경 시 **수동/Webhook 두 플로우 모두** 동일하게 적용할 것
- 두 플로우의 Step 3~3c는 항상 동기화 상태 유지

---

## [BUG-205] 현장위치지도 완료 탭 건수 불일치 — /tbm → /tasks API 교체 (세션 130)

> **대상 NAS**: NAS001 LinkMax 본사 (전체 공통)
> **발견일**: 2026-08-03
> **심각도**: 🔴 CRITICAL — BUG-204(진행탭) 수정 후 완료탭도 동일한 구조적 불일치 확인

### 현상

현장위치지도 완료 탭 건수와 현장점검 화면 완료 건수가 다름.

### 근본 원인 분석

BUG-204(진행탭)와 완전히 동일한 구조적 문제.

```
현장점검 화면(완료):      /tasks API  (planned_date 기준, status='completed')
현장위치지도 완료탭:       /tbm   API  (tbm_date 기준, task_status='work_completed|completed')
```

| 항목 | 현장위치지도 완료탭(변경 전) | 현장점검 완료탭 |
|------|--------------------------|----------------|
| API | `/tbm` | `/tasks?status=completed` |
| 날짜 기준 | `tbm_date` 또는 `created_at` | `planned_date` |
| 필터 파라미터 | `date_from`, `date_to`, `user_id` | `start_date`, `end_date` |
| 완료 조건 | `task_status='work_completed' OR 'completed'` | `status='completed'` |
| limit 처리 | ❌ tbm.ts에 limit 로직 없음 (전송해도 무시) | ✅ 페이지네이션 정상 |
| 데이터 단위 | TBM 레코드 기준 (TBM 미작성 작업 누락) | tasks 테이블 기준 |

**추가 문제**: `/tbm` API에 `limit` 파라미터 처리 코드가 없어 클라이언트의 `limit=500` 전송이 무시됨.

### 충돌 체크 (수정 전 검증)

| 이전 버그 | 우려 사항 | 검증 결과 |
|----------|----------|----------|
| BUG-082 | /tbm으로 변경한 이유: LGU+ is_auto_request_no 필터 우려 | tasks.ts에도 동일 서버측 LGU+ 필터 존재 확인. 위험성체크·진행 탭이 /tasks로 정상 동작 중 → **충돌 없음** |
| BUG-085 | 날짜 파라미터 전송 로직 | /tasks의 start_date/end_date로 대체 → 동일 기능 |
| BUG-185 | 클라이언트 2차 planned_date 필터 패턴 | 그대로 적용 (위험성체크·진행 탭과 동일 패턴) |
| BUG-204 | 진행탭 /tasks 교체 시 변수명 | 완료탭 변수명에 `Co` suffix 부여로 충돌 방지 확인 |

### 수정 내용 (app.js line ~46004)

**방안: 완료 탭을 /tasks API로 전면 교체 (BUG-204 진행탭과 동일 패턴)**

```javascript
// 변경 전 — /tbm API 기반 (tbm_date 기준)
const tcp = new URLSearchParams();
if (dateFrom) tcp.set('date_from', dateFrom);
if (dateTo)   tcp.set('date_to',   dateTo);
if (userId)   tcp.set('user_id',   userId);
tcp.set('limit', '500');  // ← tbm.ts에서 무시됨
const tbmDoneRes = await API.get(`/tbm?${tcp.toString()}`);
// task_status='work_completed|completed' 클라이언트 2차 필터

// 변경 후 — /tasks API 기반 (planned_date 기준, 현장점검과 동일 소스)
const cop = new URLSearchParams();
cop.set('status', 'work_completed,completed');
if (dateFrom) cop.set('start_date', dateFrom);
if (dateTo)   cop.set('end_date',   dateTo);
if (userId)   cop.set('supervisor_id', userId);
const completedRes = await API.get(`/tasks?${cop.toString()}`);
// LGU+ 클라이언트 이중방어 + planned_date 2차 필터 (BUG-185 패턴 계승)
```

**필드명 변경** (tbm → tasks 응답 구조):

| 항목 | 변경 전 (tbm) | 변경 후 (tasks) |
|------|-------------|----------------|
| 작업 ID | `tbm.task_id` | `t.id` |
| 작업명 | `tbm.task_title \|\| tbm.work_name` | `t.title \|\| t.work_name` |
| 담당자 | `tbm.conductor_name` | `t.supervisor_name` |
| 날짜 | `tbm.tbm_date \|\| tbm.created_at` | `t.planned_date \|\| t.created_at` |
| GPS | `tbm.gps_lat/lon` | `t.gps_lat/lon` |
| GPS출처 | `'tbm'` | `'task'` |

**변수명** (진행탭과 충돌 방지, `Co` suffix):
- `_smMyUiRoleCo`, `_smIsLguCo`, `_completedLguFiltered`, `completedList`
- `wlGpsCacheCo`, `noGpsCo`, `wlGCo`

**버전 문자열**: `v=20260803b` → `v=20260803c` (브라우저 캐시 강제 갱신)

### 관련 버그 이력

| 버그 | 내용 | 관계 |
|------|------|------|
| BUG-082 | 완료 탭 포함 전체 /tbm API 기반으로 변경 | 이번 수정으로 완료탭 원복 |
| BUG-085 | 완료 탭 서버 날짜 파라미터 추가 | start_date/end_date 파라미터로 계승 |
| BUG-185 | 위험성체크 탭 /tasks API + planned_date 2차 필터 패턴 | 이번 완료탭 수정의 참조 패턴 |
| BUG-204 | 진행 탭 /tbm → /tasks API 교체 | 이번 완료탭 수정의 직접 참조 패턴 |
| **BUG-205** | **완료 탭 /tbm → /tasks API 전면 교체** | 이번 수정 ✅ |

---

## [BUG-204] 현장위치지도 진행 탭 건수 불일치 — /tbm → /tasks API 교체 (세션 129)

> **대상 NAS**: NAS001 LinkMax 본사 (전체 공통)
> **발견일**: 2026-08-03
> **심각도**: 🔴 CRITICAL — BUG-203 수정 후에도 불일치 지속, 데이터 소스 자체 불일치

### 현상

BUG-203 수정(tbm_date 2차 필터 변경) 후에도 현장점검 건수와 현장위치지도 진행 탭 건수 불일치 지속.

### 근본 원인 분석

```
현장점검 화면:        /tasks API  (planned_date 기준 필터)
현장위치지도 진행탭:   /tbm   API  (tbm_date    기준 필터)
```

두 화면이 **완전히 다른 API, 다른 날짜 컬럼**을 사용 → 동일 날짜 조회해도 건수가 다를 수밖에 없음.

BUG-203에서 클라이언트 2차 필터 기준(planned_date→tbm_date)을 수정했지만,
서버 API 자체가 달라 여전히 불일치 발생.

### 충돌 체크 (방안 B 진행 전 검증)

| 이전 버그 | 우려 사항 | 검증 결과 |
|----------|----------|----------|
| BUG-082 | /tbm으로 변경한 이유: LGU+ is_auto_request_no 필터 문제 | tasks.ts에도 동일 서버측 LGU+ 필터 존재 확인. 위험성체크 탭이 /tasks로 정상 동작 중 → **충돌 없음** |
| BUG-180 | 날짜 파라미터 전송 로직 | /tasks의 start_date/end_date로 대체 → 동일 기능 |
| BUG-185 | 클라이언트 2차 planned_date 필터 패턴 | 그대로 적용 (위험성체크 탭과 동일) |

### 수정 내용 (app.js)

**방안 B 채택: 진행 탭을 /tasks API로 전면 교체**

```javascript
// 변경 전 — /tbm API 기반 (tbm_date 기준)
const twp = new URLSearchParams();
if (dateFrom) twp.set('date_from', dateFrom);
if (dateTo)   twp.set('date_to',   dateTo);
if (userId)   twp.set('user_id',   userId);
twp.set('limit', '500');
const tbmAllRes = await API.get(`/tbm?${twp.toString()}`);
const _rawTbmAllList = Array.isArray(tbmAllRes.data) ? tbmAllRes.data
  : (tbmAllRes.data?.items || tbmAllRes.data?.tbms || []);
// task_status='working' 2차 필터 + tbm_date 날짜 2차 필터

// 변경 후 — /tasks API 기반 (planned_date 기준, 현장점검과 동일 소스)
const twp = new URLSearchParams();
twp.set('status', 'working');
if (dateFrom) twp.set('start_date', dateFrom);
if (dateTo)   twp.set('end_date',   dateTo);
if (userId)   twp.set('supervisor_id', userId);
const workingRes = await API.get(`/tasks?${twp.toString()}`);
const _rawWorkingList = workingRes.data?.tasks || workingRes.data || [];
// LGU+ 클라이언트 이중방어 + planned_date 2차 필터 (위험성체크 탭과 동일 패턴)
```

**팝업 필드명 변경** (tbm → tasks 응답 구조):

| 항목 | 변경 전 (tbm) | 변경 후 (tasks) |
|------|-------------|----------------|
| 작업 ID | `tbm.task_id` | `t.id` |
| 작업명 | `tbm.task_title \|\| tbm.work_name` | `t.title \|\| t.work_name` |
| 담당자 | `tbm.conductor_name` | `t.supervisor_name` |
| 날짜 | `tbm.tbm_date \|\| tbm.created_at` | `t.planned_date \|\| t.created_at` |
| GPS | `tbm.gps_lat/lon` | `t.gps_lat/lon` |

**버전 문자열**: `v=20260803a` → `v=20260803b` (브라우저 캐시 강제 갱신)

### 관련 버그 이력

| 버그 | 내용 | 관계 |
|------|------|------|
| BUG-082 | 진행 탭 API 소스를 /tasks → /tbm 으로 변경 | 이번 수정으로 원복(단, LGU+ 필터 검증 후) |
| BUG-180 | 진행 탭 서버 날짜 파라미터 추가 | start_date/end_date 파라미터로 계승 |
| BUG-185 | 위험성체크 탭 /tasks API 날짜 필터 + 클라이언트 2차 필터 | 이번 진행탭 수정의 참조 패턴 |
| BUG-203 | 진행 탭 클라이언트 2차 필터 기준 tbm_date로 수정 | 근본 원인 해결 안 됨 → BUG-204로 이어짐 |
| **BUG-204** | **진행 탭 /tbm → /tasks API 전면 교체** | 이번 수정 ✅ |

---

## [BUG-203] 현장위치 지도 진행 탭 — 현장점검 건수와 불일치 (세션 128)

> **대상 NAS**: NAS001 LinkMax 본사 (전체 공통)
> **발견일**: 2026-08-03
> **심각도**: 🟠 MAJOR — 지도에서 진행 중 작업이 일부 누락 표시

### 현상

| 화면 | 날짜 | 필터 | 표시 건수 |
|------|------|------|-----------|
| **현장점검** | 2026-08-03 | 진행 | **3건** ✅ |
| **현장위치지도 진행 탭** | 2026-08-03 | 진행(working) | **1건** ❌ |

- 현장점검에는 3건 정상 표시
- 현장위치지도 진행 탭에는 동일 날짜 조회 시 1건만 표시 (2건 누락)

### 원인 분석

```
서버 /tbm API (tbm_date 기준 필터)
  → date_from=2026-08-03, date_to=2026-08-03
  → tbm_date 기준으로 3건 정상 반환

클라이언트 2차 필터 [BUG-180에서 도입, line 45909~45916]
  var pd = tbm.planned_date  ← ❌ 잘못된 기준 컬럼
  → planned_date(작업 계획일)가 2026-08-03이 아닌 2건 탈락
  → 1건만 최종 표시
```

**핵심**: 서버는 `tbm_date`(TBM 진행일) 기준으로 필터하는데,  
클라이언트가 `planned_date`(작업 계획일)로 2차 필터 → **기준 컬럼 불일치**로 누락 발생

| 작업 | tbm_date | planned_date | 서버 결과 | 클라이언트 2차 필터 |
|------|----------|-------------|-----------|-------------------|
| 양평간77 | 2026-08-03 ✅ | 2026-08-03 ✅ | 통과 | 통과 ✅ |
| 여주 성동교육장 | 2026-08-03 ✅ | 다른 날짜 ❌ | 통과 | **탈락** ❌ |
| 이천 죽당리 | 2026-08-03 ✅ | 다른 날짜 ❌ | 통과 | **탈락** ❌ |

### 수정 내용 (app.js line 45909~45925)

```javascript
// 변경 전 — planned_date(작업 계획일) 기준 (❌ 서버 tbm_date 필터와 기준 불일치)
var pd = tbm.planned_date ? String(tbm.planned_date).slice(0, 10) : '';

// 변경 후 — tbm_date(TBM 진행일) 우선, 없으면 planned_date fallback (✅ 서버와 동일 기준)
var pd = String(tbm.tbm_date || tbm.planned_date || '').slice(0, 10);
```

### 관련 버그 이력

| 버그 | 내용 | 관계 |
|------|------|------|
| BUG-082 | 진행 탭 API 소스를 /tasks → /tbm 으로 변경 | 기반 변경 |
| BUG-180 | 진행 탭 서버 날짜 파라미터 추가 + 클라이언트 2차 필터 도입 | **2차 필터 도입 시 planned_date 사용이 이 버그의 근원** |
| BUG-201 | TBM 탭 date_from/date_to 파라미터 누락 수정 | 동일 계열 날짜 필터 버그 |
| **BUG-203** | **진행 탭 클라이언트 2차 필터 기준 수정** | 이번 수정 ✅ |

### 검증 결과
- `node --check` JS 문법 검사 ✅
- `npm run build` ✅ (298.71 kB, 1.52s)

---

## [BUG-202] 자동업데이트 후 tsx 바이너리 누락으로 서버 기동 불가 (세션 128 → 영구 해결 세션 131)

> **[세션 131 추가]** fixTsxBinary()는 자동업데이트 코드(admin.ts) 안에서만 동작합니다.  
> **PM2 자체가 tsx를 직접 참조하는 구조**에서는 tsx 소멸 → pm2 restart 즉시 실패 → fixTsxBinary()조차 호출 불가.  
> **영구 해결**: PM2 script를 `scripts/start-server.sh` 래퍼로 교체 (tsx 소멸 시 자동 복구 후 기동).  
> **NAS001 적용 방법**: 아래 "NAS001 PM2 재등록 명령어" 섹션 참조.

> **발생 NAS**: NAS001 LinkMax 본사 (`linkmax.myds.me:3443`)
> **발견일**: 2026-08-03
> **심각도**: 🔴 CRITICAL — 서버 전체 응답 불가 (503)

### 현상
- 자동업데이트 실행 후 pm2 `online` 상태이지만 `curl https://localhost:3443/api/health` 응답 없음
- 브라우저에서 모든 API, 정적 파일(app.js, xlsx.full.min.js 등) 503 에러
- pm2 restart count ↺ 3 → 4 (반복 크래시 후 재시작)
- `pm2 logs safetynote --lines 50 --nostream` error 로그:
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '/volume1/safetynote/node_modules/.bin/tsx'
  ```

### 근본 원인 분석

```
자동업데이트 흐름:
  git reset --hard origin/main
    → runNpmInstall()  ← npm install --ignore-scripts
                           ↑
                     [문제 지점]
                     postinstall 스크립트 전부 건너뜀
                     → node_modules/.bin/tsx 심볼릭 링크 미생성
                     → node_modules/tsx/ 패키지는 존재하지만 실행 불가
    → fixBs3Binary()   ← 정상 (GLIBC 교체)
    → pm2 restart      ← tsx 없음 → ERR_MODULE_NOT_FOUND → 즉시 크래시
```

**왜 `--ignore-scripts`를 쓰는가?**
- BUG-BS3 대응으로 `better-sqlite3` postinstall rebuild를 막기 위해 도입
- 부작용: tsx를 포함한 모든 패키지의 postinstall/bin-link 스크립트가 차단됨

**왜 이전까지 안 터졌나?**
- 최초 설치 시 `npm install`(--ignore-scripts 없음)로 `.bin/tsx` 생성됨
- 자동업데이트의 `git reset --hard`는 소스 파일만 초기화 → `node_modules/` 유지
- 따라서 `.bin/tsx` 링크가 살아있어 정상 동작
- **이번에는** git reset 후 `npm install --ignore-scripts`가 기존 `.bin/tsx`를 삭제/덮어쓰면서 링크 소멸

### 수정 내용 (admin.ts)

**① `fixTsxBinary()` 함수 신규 추가 (line 743~793)**

| 경우 | 처리 |
|---|---|
| `node_modules/tsx/` 없음 | `npm install tsx --save-dev` 실행 |
| `node_modules/tsx/` 있고 `.bin/tsx` 없음 | `ln -sf dist/cli.mjs .bin/tsx` 수동 생성 + `chmod +x` |
| `.bin/tsx` 정상 존재 | 확인 로그만 출력, 스킵 |

**② 업데이트 플로우 Step 3c 추가 (line 1040)**
```
Step 3.  runNpmInstall()   ← --ignore-scripts
Step 3b. fixBs3Binary()    ← GLIBC 교체 (기존)
Step 3c. fixTsxBinary()    ← BUG-202 신규 추가 ✅
Step 4.  runBuild()
Step 5.  pm2 restart
```

**③ 롤백 플로우 동일 적용 (line 1232)** — 롤백 시에도 동일 문제 발생 가능

### 수동 복구 명령어 (이미 발생한 경우)

```bash
cd /volume1/safetynote
npm install tsx --save-dev
pm2 restart safetynote
sleep 5 && curl -sk https://localhost:3443/api/health
```

### 재발 방지

- `fixTsxBinary()` 함수가 자동업데이트/롤백 플로우에 영구 포함됨
- 모든 신규 NAS 설치 후 최초 자동업데이트 시 자동 적용됨
- pm2 logs에서 `[BUG-202]` 태그로 tsx 복구 상태 확인 가능

### 검증 결과
- `npm run build` ✅ (298.71 kB, 1.65s)
- `node --check` (admin.ts TypeScript 빌드 포함) ✅

---

## [BUG-201] 현장위치 지도 날짜 검색 기준 수정 — 등록일 → 실제 작업/평가 진행일 (세션 127)

> **대상 NAS**: NAS001 LinkMax 본사 (전체 공통)

### 현상
- 현장위치 지도 날짜 필터 라벨이 "등록일" 로 표시
- TBM 탭: 날짜 필터 파라미터가 서버에 전송되지 않아 날짜 선택과 무관하게 전체 기간 데이터 반환
- 위험성체크/진행/완료/현장점검 탭: 이미 올바른 날짜 컬럼 기준이었으나 라벨만 "등록일" 표시

### 원인 분석

| 탭 | 기존 날짜 기준 | 올바른 기준 | 문제 |
|---|---|---|---|
| ⚠️ 위험성체크 |  |  (현장 작업일) | 라벨만 오표시 |
| 🦺 TBM | 날짜 파라미터 **미전송** |  (TBM 진행일) | 필터 미작동 + 라벨 오표시 |
| 🟢 진행 |  |  (작업 개시일) | 라벨만 오표시 |
| ✅ 완료 |  |  (TBM 완료일) | 라벨만 오표시 |
| 🔍 현장점검 |  |  (점검일) | 라벨만 오표시 |

TBM 탭의 경우 BUG-084에서 "날짜 파라미터 제거" 처리했으나,
당시 우려(30일 범위 밖 tbm_done 0건)는 tbm_done 특성상(TBM 완료 후 수 시간 내 작업 개시)
장기 날짜 범위 데이터가 없어 실질 영향이 없음 → 날짜 필터 복구가 올바른 방향

### 수정 내용 ()

**① 날짜 라벨 동적 표시 (line 45520)**

- 위험성체크/TBM/진행/완료 탭 → "작업일"
- 현장점검 탭 → "점검일"

**② TBM 탭 날짜 파라미터 추가 (line 45823~45826)**

서버 는 이미  지원 → 서버 수정 불필요

### 검증
- ✅  문법 이상 없음
- ✅  성공 (298.71 kB)
- ✅ 기존 BUG-083/084/085/180/185 충돌 없음

### 커밋
- 해당 커밋 참조

---

## [BUG-ROLLUP] 서버 업데이트/롤백 시 빌드 실패 완전 해결 — npm install + bs3 바이너리 교체 자동화 (세션 126)

> **대상 NAS**: 전체 (NAS001 NAS002 포함 — glibc 버전 자동 감지로 환경 구분)

### 현상
- NAS002 최초 업데이트 적용 시 빌드 실패
- 에러: `/volume1/safetynote/node_modules/rollup/dist/native.js:121 Error: Cannot find module @rollup/rollup-linux-x64-gnu`
- `npm has a bug related to optional dependencies`

### 원인
| 단계 | 내용 |
|---|---|
| `git reset --hard` | node_modules를 건드리지 않음 |
| optional 바이너리 | `@rollup/rollup-linux-x64-gnu` — npm의 optional deps 불완전 설치 버그로 누락 가능 |
| install.sh | 최초 설치 시 완전 설치됨 — git reset 후 재현 |
| npm install 미실행 | 업데이트 흐름이 git reset → 빌드만 수행 — optional 복구 없음 |

### 해결 (`src/nas-routes/admin.ts`)

**추가된 함수:**

`runNpmInstall(cwd)`:
- `npm install --ignore-scripts` 실행
- `--ignore-scripts`: better-sqlite3 rebuild 방지 (bs3 바이너리는 fixBs3Binary가 담당)
- 실패해도 경고만 → 빌드 진행 차단 안 함

`fixBs3Binary(cwd)`:
- `ldd --version`으로 glibc 버전 자동 감지
- glibc < 2.29: v8.0.0 node-v108 바이너리 wget → 교체
- glibc ≥ 2.29: 스킵 (NAS001 등 정상 환경 영향 없음)
- 실패해도 경고만 → 차단 안 함

**업데이트 흐름 변경:**
```
Before: git reset → 빌드 → pm2 restart
After:  git reset → npm install → bs3 교체 → 빌드 → pm2 restart
```

**적용 위치:**
- `POST /update/apply` (업데이트) — line 975
- `POST /update/rollback` (롤백) — line 1163 (동일 패턴 적용)

### 커밋
- `9d91630` — fix: [BUG-ROLLUP] 서버 업데이트/롤백 시 빌드 실패 완전 해결

### 검증
- ✅ `npm run build` 성공 (298.71 kB)
- ✅ GitHub push 완료

---

## [FEAT-200] APK 강제 전송 기능 추가 — 설정 > APK 탭 > 슬레이브 NAS 릴레이 섹션 (세션 126)

> **대상 NAS**: NAS001 LinkMax 본사 (마스터) → NAS002 삼흥 본사 (슬레이브) 수동 전송 필요에서 출발

### 배경 및 문제
- NAS002 신규 설치 후 APK 전송이 필요한 상황
- 기존 릴레이는 GitHub Actions webhook 수신 시에만 자동 실행 → 수동 트리거 방법 없음
- curl로 직접 webhook 재호출하는 방법은 있으나 관리자가 UI에서 간단히 처리할 수 없었음

### 해결 방법
| 파일 | 내용 |
|------|------|
| `src/nas-routes/dist.ts` | `POST /api/dist/apk/relay/force` 엔드포인트 신규 추가 |
| `public/static/app.js` | 강제 전송 카드 UI + `_loadRelayForceInfo()` + `_forceRelayApk()` 함수 추가 |

### 동작 흐름
```
관리자 [강제 전송] 클릭
  → confirm 팝업
  → POST /api/dist/apk/relay/force (admin 인증)
     ├─ APK 미설정 → 400 에러
     ├─ 슬레이브 0대 → 400 에러
     ├─ DEPLOY_WEBHOOK_SECRET 미설정 → 503 에러
     └─ relayApkToSlaves() 비동기 실행 (fire-and-forget)
          → 슬레이브 각각 POST /api/dist/apk/webhook
  → 즉시 { success, version, queued, message } 응답
  → toast 표시
  → 5초 후 목록 자동 갱신 (last_relay_at / last_relay_status 확인)
```

### 커밋
- `742a0bb` — feat: [FEAT-200] APK 강제 전송 기능 추가 (POST /api/dist/apk/relay/force + UI 카드)

### 검증
- ✅ `node --check` PASS
- ✅ `npm run build` 성공 (298.71 kB)
- ✅ GitHub push 완료 (`742a0bb`)

---

## [BUG-BS3] better-sqlite3 GLIBC 불호환 완전 해결 — v8.0.0 node-v108 바이너리 교체 (세션 126, NAS001)

> **대상 NAS**: NAS001 LinkMax 본사 (링크맥스 NAS001 — 최초 설치 기준)

### 현상
- pm2 restart 후 브라우저 503 오류 반복
- error.log: `GLIBC_2.29' not found (required by better_sqlite3.node)`
- 재시작 횟수 1112회 (크래시 루프)

### 원인 분석
| 버전 | 바이너리 최대 GLIBC 요구 | NAS001(2.26) 호환 |
|------|------|------|
| v9.6.0 node-v108 | **GLIBC_2.29** (exp/log/pow/fcntl64) | ❌ 불가 |
| v9.4.0 node-v108 | **GLIBC_2.29** | ❌ 불가 |
| v9.0.0 node-v108 | **GLIBC_2.29** | ❌ 불가 |
| v8.7.0 node-v108 | **GLIBC_2.29** | ❌ 불가 |
| **v8.0.0 node-v108** | **GLIBC_2.14** 이하만 사용 | ✅ **완전 호환** |

- v9.x → v8.0.0 사이 `exp`, `log`, `pow`, `fcntl64` 함수가 GLIBC_2.29 버전 심볼로 교체됨
- gcc/make(Entware) 없어 소스빌드 불가 (현재 NAS001에 `/opt/bin/` 미설치)
- python3 3.8.12 존재 → 비상복구서버(3445) 정상 동작 중

### 해결 방법
**v8.0.0 node-v108 바이너리만 교체** (코드 수정 없음)
- `prepare / exec / transaction / pragma / run / all / get` — v8.0.0에도 동일 API 존재 → 완전 호환
- 코드 변경 불필요, 바이너리 파일 1개만 교체

### NAS에서 실행한 명령
```bash
cd /volume1/safetynote
wget -q "https://github.com/WiseLibs/better-sqlite3/releases/download/v8.0.0/better-sqlite3-v8.0.0-node-v108-linux-x64.tar.gz" -O /tmp/bs3_fix.tar.gz
mkdir -p /tmp/bs3_fix_dir
tar -xzf /tmp/bs3_fix.tar.gz -C /tmp/bs3_fix_dir/
cp /tmp/bs3_fix_dir/build/Release/better_sqlite3.node \
   /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node
pm2 restart safetynote
```

### 결과
- ✅ pm2 status: `online`
- ✅ out.log: `✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443`
- ✅ 503 오류 해소

### ⚠️ 주의: npm install 실행 시 바이너리 유실
`npm install` 또는 `npm rebuild` 실행 시 v9.6.0 바이너리로 덮어씌워져 동일 문제 재발.
→ npm install 후 반드시 위 바이너리 교체 명령 재실행 필요.
→ `scripts/fix-sqlite3-binary.sh` 스크립트로 자동화 가능 (별도 작성).

---

## [BUG-VITE2] 빌드 실패 근본 해결 — vite 직접 실행 (세션 125, 링크맥스 NAS)

### 현상 (2차)
- BUG-VITE(PATH 추가)로 수정했으나 여전히 `sh: vite: command not found` 발생
- 로그: `npm 경로: /usr/local/bin/npm` → `npm run build 실패: sh: vite: command not found`

### 원인 (2차)
- `npm run build`는 내부적으로 shell을 경유해 `vite`를 탐색함
- Synology 기본 npm(`/usr/local/bin/npm`)이 script 실행 시 자체 PATH로 덮어써서 `node_modules/.bin`을 잃어버림
- PATH에 `node_modules/.bin`을 추가해도 npm 내부 shell이 재설정하므로 효과 없음

### 수정 내용 (2차)
- `resolveViteBin(cwd)` 함수 신규 추가 — `node_modules/.bin/vite` 또는 `node_modules/vite/bin/vite.js` 경로 탐색
- `resolveNodeBin()` 함수 신규 추가 — vite.js 직접 실행 시 node 경로 탐색
- `runBuild(cwd)` 헬퍼 신규 추가:
  1. `node_modules/.bin/vite build` 직접 실행 (최우선 — PATH 문제 완전 우회)
  2. `node node_modules/vite/bin/vite.js build` (폴백)
  3. `npm run build` (최종 폴백)
- 빌드 실행 3곳(line 869, 1094, 1283) 모두 `runBuild(cwd)` 호출로 교체
- 커밋: `3a2c87a`

---

## [BUG-VITE] 서버 업데이트 빌드 실패 — sh: vite: command not found (세션 125, 링크맥스 NAS)

### 현상
- 브라우저 서버 업데이트 UI에서 "빌드 실패: sh: vite: command not found" 오류
- NAS 현재 버전(aebb7e0)과 GitHub 최신이 동일한데도 업데이트 적용 불가

### 원인
- `admin.ts` `runCmd()` 함수의 `env.PATH`에 `node_modules/.bin`이 없음
- `npm run build` → 내부적으로 `vite` 실행 시 `vite`는 `node_modules/.bin/vite`에 있으나 PATH에 없어 탐색 실패
- NAS Node.js v20 경로(`/volume1/@appstore/Node.js_v20/usr/local/bin`)도 미포함이었음

### 수정 내용
- `src/nas-routes/admin.ts` `runCmd()` 함수 내 `env.PATH` 구성 변경
  - `node_modules/.bin` (`${cwd}/node_modules/.bin`) — 최우선 추가
  - `/volume1/@appstore/Node.js_v20/usr/local/bin` — v20 경로 추가
- 커밋: `35bc9ba`

---

## [BUG-196 + FEAT-196] 내 작업목록 검색 개선 3건 — Android IME 한글 입력 버그 수정 + 검색 버튼 방식 전환 + 공사요청번호 검색 추가 (세션 125)

> **대상 NAS**: NAS001 LinkMax 본사

### 요구사항

| 구분 | 내용 |
|------|------|
| **BUG-196** | Android 모바일 앱 내 작업목록 검색 — 한글 입력 시 두 번째 글자가 입력 안 됨 |
| **FEAT-196-A** | 실시간 검색(oninput) → 검색어 입력 후 [검색] 버튼 클릭 또는 Enter 키 방식으로 변경 |
| **FEAT-196-B** | 검색 대상에 공사요청번호(request_no) 추가 (기존: 등록건명 + 공사담당자) |

### 원인 분석

- **BUG-196 근본 원인**: `oninput` 이벤트 + 300ms debounce 방식 사용
  - Android IME(소프트 키보드)는 한글 조합 중 `compositionend` 이벤트를 늦게 발화
  - `_imeComposing` 가드가 있었으나 Android WebView에서 타이밍 불일치로 중간값이 읽힘
  - 두 번째 글자 입력 시 첫 글자만 확정된 상태로 검색이 실행 → 렌더링 재시작 → 두 번째 글자 누락

### 구현 내용

#### `public/static/app.js` 변경사항 4곳

**1. `applyMyTasksSearch` 함수 — debounce 제거, RULE-001 준수 (var/function)**
```javascript
// 변경 전: setTimeout 300ms debounce, 화살표함수
let _myTasksSearchTimer = null;
function applyMyTasksSearch(kw) {
  _myTasksSearchKw = (kw || '').trim();
  clearTimeout(_myTasksSearchTimer);
  _myTasksSearchTimer = setTimeout(() => { ... }, 300);
}

// 변경 후: 즉시 실행, var/function 사용
function applyMyTasksSearch(kw) {
  _myTasksSearchKw = (kw || '').trim();
  var content = document.getElementById('page-content') || document.getElementById('main-content');
  if (!content) return;
  renderMyTasksPage(content).then(function() {
    var inp = document.getElementById('myTasksSearchInput');
    if (inp) { inp.focus(); var len = inp.value.length; inp.setSelectionRange(len, len); }
  });
}
```

**2. 전역 헬퍼 함수 추가 (RULE-003: onclick 내 따옴표 중첩 금지)**
```javascript
function doMyTasksSearch() {
  var inp = document.getElementById('myTasksSearchInput');
  if (inp) applyMyTasksSearch(inp.value);
}
function clearMyTasksSearch() {
  var inp = document.getElementById('myTasksSearchInput');
  if (inp) inp.value = '';
  applyMyTasksSearch('');
}
```

**3. 검색 바 HTML 변경**
```
변경 전: oninput="if(!_imeComposing)applyMyTasksSearch(this.value)"  (실시간)
변경 후: onkeydown="if(event.key==='Enter'&&!_imeComposing){doMyTasksSearch();}"  (Enter만)
         + [검색] 버튼 추가 (onclick="doMyTasksSearch()")
         + placeholder: "등록건명 또는 공사담당자 검색" → "등록건명 / 공사담당자 / 공사요청번호"
```

**4. 검색 필터 로직 — request_no 추가, RULE-001 준수**
```javascript
// 변경 전: const + 화살표함수, 검색 대상 3개
// 변경 후: var + function, 검색 대상 4개 (request_no 추가)
var reqMatch = (t.request_no || '').toLowerCase().includes(kwLower);
return titleMatch || mgrMatch || conMatch || reqMatch;
```

### 검증

- ✅ `node --check` PASS
- ✅ `npm run build` 성공 (298.71 kB)

---

## [FEAT-194] 메뉴 구조 변경 — 항목관리 그룹 신설 + 3개 메뉴 명칭 변경 (세션 112)

### 요구사항

| 기존 명칭 | 변경 명칭 | 비고 |
|-----------|-----------|------|
| 분류별 항목 관리 | 위험성평가표관리 | id: `risk-items` 유지 |
| 작업유형별 안전내용 관리 (탭) | 위험성(체크리스)평가설정 | safety-settings 내 탭 |
| 체크리스트 항목 관리 (탭) | TBM 사진촬영대상설정 | safety-settings 내 탭 |

**새 메뉴 구조:**
```
안전점검
  └─ 항목관리 (신설 — id: risk-manage)
       ├─ 위험성평가표관리  (id: risk-items)
       ├─ 위험성(체크리스)평가설정  (safety-settings > wt-safety 탭)
       └─ TBM 사진촬영대상설정  (safety-settings > checklist-items 탭)
```

### 구현 내용

#### `public/static/app.js` 변경사항 7곳

**1. flat 메뉴 배열 (line ~301~302)**
```javascript
// 변경 전
{ id:'risk-items',      label:'분류별 항목 관리',  group:'위험성평가' },
{ id:'safety-settings', label:'안전설정 관리',       group:'위험성평가' },

// 변경 후
{ id:'risk-items',      label:'위험성평가표관리', group:'항목관리' },
{ id:'safety-settings', label:'안전설정',          group:'항목관리' },
```

**2. 사이드바 계층 메뉴 구조 (line ~2319)**
```javascript
// 변경 전: 위험성평가 children 안에 risk-items, safety-settings 포함
// 변경 후: risk-manage 그룹 신설, 하위로 이동
{ id:'risk-manage', icon:'fas fa-folder-open', label:'항목관리', children: [
  { id:'risk-items',      icon:'fas fa-list-check',  label:'위험성평가표관리' },
  { id:'safety-settings', icon:'fas fa-shield-check', label:'안전설정' },
]},
```

**3. breadcrumb/타이틀 맵 (line ~3086~3090)**
```javascript
'risk-items':       '위험성평가표관리',
'wt-safety':        '위험성(체크리스)평가설정',
'checklist-items':  'TBM 사진촬영대상설정',
'safety-settings':  '항목관리',
'risk-manage':      '항목관리',
```

**4. 라우팅 case 추가 (line ~3230)**
```javascript
case 'risk-manage': navigateTo('risk-items'); return;  // 항목관리 그룹 클릭 시 첫 항목으로
```

**5. safety-settings 탭 버튼 텍스트 변경**
```javascript
// 변경 전
'작업유형별 안전내용 관리'
'체크리스트 항목 관리'

// 변경 후
'<i class="fas fa-hard-hat mr-1.5"></i>위험성(체크리스)평가설정'
'<i class="fas fa-tasks mr-1.5"></i>TBM 사진촬영대상설정'
```

**6. risk-items 페이지 내부 헤딩 변경**
```html
<!-- 변경 전 --> 분류별 항목 관리
<!-- 변경 후 --> 위험성평가표관리
```

**7. checklist-items / wt-safety 페이지 내부 헤딩 변경**
```html
<!-- checklist-items: 변경 전 --> 체크리스트 항목 관리
<!-- checklist-items: 변경 후 --> TBM 사진촬영대상설정
<!-- wt-safety: 변경 전 --> 작업유형별 안전내용 관리
<!-- wt-safety: 변경 후 --> 위험성(체크리스)평가설정
```

### 충돌 체크 & 규칙 준수

| 규칙 | 처리 방법 |
|------|----------|
| RULE-001 (var 전용) | 신규 코드 없음 — 기존 구조 값만 변경, 해당 없음 |
| id 변경 여부 | `risk-items`, `safety-settings` id 유지 — 기존 라우팅/로직 영향 없음 |
| safety-settings 탭 상태 | `_safetySettingsActiveTab` 전역변수 유지 — 탭 id(`wt-safety`/`checklist-items`) 변경 없음 |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (296.05 kB, 1.29s)
- 커밋: `5afe597` — feat: [FEAT-194] 메뉴 구조 변경 — 항목관리 그룹 신설 + 3개 메뉴 명칭 변경

---

## [FEAT-193] 위험성평가 서명요청 — 전원 서명 완료 후 미처리에서 사라지도록 변경 (세션 112)

### 요구사항
- **기존 동작**: 본인 서명 완료 즉시 미처리 목록에서 사라짐
- **의도된 동작**: 모든 평가위원 전원 서명 완료 후에만 미처리 목록에서 사라짐
- 본인 서명 완료 후 다른 위원이 아직 서명하지 않은 상태 → 카드는 유지되되 상태 표시 변경

### 구현 내용

#### 백엔드 — `signature-requests.ts`

**GET / — 위험성평가 pending 레코드에 서명 현황 필드 추가**
```typescript
// pending 레코드 중 ref_type='risk_assessment'인 경우 추가 필드 주입:
// ra_my_signed    : 본인이 risk_assessment_signatures에 실제 서명했는지 여부
// ra_signed_count : 현재까지 서명한 위원 수 (DISTINCT user_id)
// ra_member_count : 전체 평가위원 수 (risk_assessment_members)
```

**GET /count — 배지 카운트 개선**
```typescript
// 기존: signature_requests pending 전체 카운트
// 변경: 위험성평가는 본인이 아직 실제 서명 안 한 건만 카운트
//       → 본인 서명 완료 후 대기중인 건은 배지에서 제외
```

#### 프론트엔드 — `app.js`

**`_srRenderCard` — 위험성평가 카드 상태 분기 추가**
```
본인 서명 완료(ra_my_signed=true):
  - 헤더 배지: "✅ 서명완료 · 대기중" (초록색)
  - 하단 버튼: 서명하기 버튼 → "내 서명 완료 / 전체 N명 중 N명 서명" 안내 박스로 교체
  - 카드는 미처리 목록에 유지 (전원 서명 완료 시 자동 사라짐)

본인 미서명:
  - 기존과 동일 — "🔔 서명 필요" + 서명하기 버튼
```

**미처리 탭 카운트 — 실제 서명 필요 건만 카운트**
```javascript
// 위험성평가 본인 서명 완료 건은 탭 카운트에서 제외
var _srPendingActionCnt = pending.filter(function(r) {
  if (r.ref_type !== 'risk_assessment') return true;
  return !r.ra_my_signed;
}).length;
```

### 전체 서명 완료 시 자동 처리
- 마지막 위원 서명 → `PATCH /:id/sign` 호출 → `risk_assessments.status = 'completed'` 자동 전환 (기존 세션111 로직 유지)
- `completed` 전환 후 `renderSignatureRequestsPage` 재조회 → pending 레코드 더 이상 표시 안 됨 (전원 서명 완료 = `ra_signed_count >= ra_member_count` → 해당 시점에 이미 status=completed로 자동 전환)

### 규칙 준수
| 규칙 | 처리 |
|------|------|
| RULE-001 (var 전용) | `_raMySign`, `_raSignedCnt`, `_raMemberCnt`, `_srPendingActionCnt` 모두 `var` 사용 |
| RULE-003 (onclick 따옴표) | 새 버튼 없음 — 기존 패턴 유지 |
| KST-001/002 | 해당 없음 |

### 변경 파일
| 파일 | 변경 내용 |
|------|----------|
| `src/nas-routes/signature-requests.ts` | GET /: ra_my_signed/ra_signed_count/ra_member_count 필드 추가 / GET /count: RA 본인 미서명 건만 카운트 |
| `public/static/app.js` | _srRenderCard: RA 본인 서명완료 시 대기중 안내 박스 표시 / 헤더 배지 분기 / 탭 카운트 개선 |

### 검증
- `node --check public/static/app.js` ✅
- `npx tsc --noEmit` (signature-requests.ts 신규 에러 없음) ✅
- `npm run build` ✅ (296.05 kB)

---

## [BUG-192] 서명요청 연결 오류 3건 수정 (세션 111)

### 문제
1. **BUG-192a**: 서명 완료한 건이 계속 미처리(pending)로 남는 문제
2. **BUG-192b**: 위험성평가 서명 자동 completed 전환 미작동
3. **BUG-192c**: 산업안전보건위원회 서명요청 내용보기가 텍스트만 표시되어 클릭 불가

### 원인 분석

#### BUG-192a — 중복 pending 레코드
- `signature_requests` 테이블에 UNIQUE 제약 없음
- `_saveRiskFinalScores`(최종위험도 저장) 시 자동 bulk 서명요청 발송
- 이후 수동으로 재발송하면 **같은 위원에게 중복 pending 레코드** 생성
- 서명 처리 시 `UPDATE ... WHERE id=?` 로 ID 1건만 `signed` 처리
- 중복으로 생긴 나머지 pending 레코드는 계속 미처리로 표시

#### BUG-192b — 자동 completed 전환 조건 부정확
- 전환 조건: `signedCount(signature_requests WHERE status='signed') >= memberCount`
- `signature_requests`는 중복 생성 가능 → signed 카운트 오염
- 실제 서명 테이블(`risk_assessment_signatures`)이 아닌 요청 테이블 기준으로 카운팅하여 부정확

#### BUG-192c — SC 서명요청 내용보기 미연결
- `_srRenderCard` 함수에서 `sc`/`sc_vote` ref_type의 viewBtn이 `<span>`(텍스트)으로만 구현
- 클릭 이벤트 없어 회의 내용을 열 수 없음

### 해결

#### BUG-192a — `signature-requests.ts` PATCH /:id/sign 수정
```typescript
// Before: 해당 ID 1건만 signed 처리
UPDATE signature_requests SET status='signed', sign_data=?, signed_at=CURRENT_TIMESTAMP WHERE id=?

// After: 동일 ref+user 의 모든 pending 레코드 일괄 signed 처리
UPDATE signature_requests
SET status='signed', sign_data=?, signed_at=CURRENT_TIMESTAMP
WHERE ref_type=? AND ref_id=? AND target_user_id=? AND status='pending'
```

#### BUG-192b — 자동 completed 전환 카운팅 기준 변경
```typescript
// Before: signature_requests(중복 가능) 기준
SELECT COUNT(*) as cnt FROM signature_requests WHERE ref_type='risk_assessment' AND ref_id=? AND status='signed'

// After: risk_assessment_signatures(실제 서명 테이블, DISTINCT) 기준
SELECT COUNT(DISTINCT user_id) as cnt FROM risk_assessment_signatures WHERE assessment_id=?
```

#### BUG-192b(추가) — bulk 생성 시 이미 서명한 사용자 차단
- `risk_assessment_signatures` 에서 이미 서명한 `user_id` 목록 취득
- 해당 사용자는 bulk 요청 생성 완전 차단
- 새로 생성된 요청(`newlyNotifiedUids`)에게만 SSE/FCM 알림 발송

#### BUG-192c — `app.js` SC 서명요청 viewBtn 개선
- `_signReqOpenSc(meetingId)` 헬퍼 함수 추가
  - `safeNavigateTo('sc-meetings')` 로 이동 후 500ms 대기
  - `renderSCMeetingDetail(container, meetingId)` 호출
- SC/SC_VOTE viewBtn: `<span>` 텍스트 → `<button onclick="_signReqOpenSc(...)">` 버튼으로 교체

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/nas-routes/signature-requests.ts` | PATCH sign: 중복 pending 일괄처리 / bulk: 이미서명자 차단 + 신규만 알림 / 자동completed: signatures 기준 카운팅 |
| `public/static/app.js` | `_signReqOpenSc()` 헬퍼 추가 / SC viewBtn 클릭가능 버튼으로 교체 |

### 검증
- `node --check public/static/app.js` ✅
- `npx tsc --noEmit` (signature-requests.ts 에러 없음) ✅
- `npm run build` ✅ (296.05 kB)
- 커밋: `5a12fa9`

---

## [FEAT-191] 파일 저장 구조 체계화 + 기존 파일 마이그레이션 (세션 110)

### 요구사항
- 안전교육·산업안전보건위원회 첨부파일/사진을 공사/작업처럼 **체계적 폴더 구조**로 저장
- 기존에 저장된 파일들도 새 경로로 마이그레이션 (DB `file_path` 컬럼 업데이트 포함)
- 지정 폴더 구조:
  ```
  {UPLOAD_ROOT}/
  └── {자료생성년도}/
      ├── 안전교육/
      │   ├── 정기안전교육/{교육일자}_{교육과목}/사진|자료/
      │   ├── 채용시안전교육/{교육일자}_{교육과목}/사진|자료/
      │   ├── 작업내용변경시교육/{교육일자}_{교육과목}/사진|자료/
      │   ├── 특별안전교육/{교육일자}_{교육과목}/사진|자료/
      │   └── 관리감독자교육/{교육일자}_{교육과목}/사진|자료/
      └── 산업안전보건위원회/{회의일자}_{회의제목}/사진|자료/
  ```

### 분석 결과
| 항목 | 기존 구조 | 변경 후 구조 |
|------|-----------|-------------|
| 교육 사진 (`edu_photos`) | `edu_photos/파일명` | `{년도}/안전교육/{유형}/{날짜}_{과목}/사진/파일명` |
| 교육 자료 (`edu_materials`) | `edu_materials/파일명` | `{년도}/안전교육/{유형}/{날짜}_{과목}/자료/파일명` |
| SC 회의 사진 (`sc_photos`) | `safety_committee/photos/파일명` | `{년도}/산업안전보건위원회/{날짜}_{제목}/사진/파일명` |
| SC 회의 자료 (`sc_docs`) | `safety_committee/docs/파일명` | `{년도}/산업안전보건위원회/{날짜}_{제목}/자료/파일명` |
| 위험성평가 스캔파일 | DB `scan_files` TEXT (Base64) | 변경 없음 (파일시스템 미사용) |

### 변경 내용

#### `src/nas-routes/education-extra.ts`
```typescript
// 추가: EDU_TYPE_DIR, safeFsNameEdu(), getEduUploadDir()
// 사진 업로드: getEduUploadDir(sessionId, 'photos') 반환값으로 dir/relBase 사용
// 자료 업로드: getEduUploadDir(sessionId, 'materials') 반환값으로 dir/relBase 사용
// 삭제: file_path 기반 절대경로 우선, 없으면 레거시 edu_photos/ 경로 fallback
```

#### `src/nas-routes/safety-committee.ts`
```typescript
// 추가: getScMeetingUploadDir(meetingId, 'photos'|'docs')
// 사진 업로드: getScMeetingUploadDir(meetingId, 'photos') 사용
// 자료 업로드: getScMeetingUploadDir(meetingId, 'docs') 사용
// 삭제: 기존 file_path(절대경로) 그대로 사용 (변경 없음)
```

#### `node-server.ts`
```typescript
// import 추가: renameSync, copyFileSync
// POST /api/admin/migrate-uploads (admin 전용)
// → edu_photos, edu_materials, safety_committee_photos, safety_committee_docs
// → 기존 파일 물리 이동 (renameSync → fallback copyFileSync+unlink) + DB file_path 갱신
// → 이미 새 경로에 존재하면 DB만 갱신 (중복 이동 방지)
```

### 주요 설계 결정
- **`/uploads/*` 서빙 라우트 호환**: 기존 라우트가 `relPath = urlPath.replace('/uploads/', '')`로 동적 처리 → 새 폴더 구조 자동 호환
- **SC 파일 절대경로 유지**: `safety_committee_photos/docs`의 `file_path`는 절대경로로 저장되던 기존 방식 유지 (파일 서빙은 직접 `readFileSync(row.file_path)` 사용)
- **Fallback 전략**: 세션/회의 정보 없으면 레거시 경로 사용하여 서비스 안정성 확보
- **마이그레이션 API**: `/api/admin/migrate-uploads` — admin 권한 필요, 중복 이동 방지, 볼륨 간 이동 fallback(copy+delete)

---

## [BUG-190] 시스템관리자 위험성평가/SC회의 처리단계 구분 없이 삭제 허용 (세션 109)

### 요구사항
- **위험성평가**: 시스템관리자(admin) 권한에서 처리 단계(`draft/in_review/measures_done/completed`) 구분 없이 모든 단계 삭제 가능
- **SC 회의**: 시스템관리자(admin) 권한에서 처리 단계(초안/확정) 구분 없이 모든 회의 삭제 가능

### 기존 동작 (문제)
| 항목 | 기존 조건 | 문제 |
|------|-----------|------|
| 위험성평가 백엔드 | `completed` 상태면 무조건 삭제 불가 | 시스템관리자도 completed 삭제 불가 |
| 위험성평가 목록 삭제 버튼 | `!isWorker && r.status !== 'completed'` | admin도 completed에서 버튼 미표시 |
| 위험성평가 모달 삭제 버튼 | `!isWorker && r.status !== 'completed'` | admin도 completed에서 버튼 미표시 |
| SC 회의 백엔드 | `admin OR supervisor` 허용 | supervisor도 삭제 가능 (너무 넓음) |
| SC 회의 삭제 버튼 | 권한 조건 없이 항상 표시 | 모든 역할에서 삭제 버튼 표시 |

### 변경 내용

#### 백엔드 — `src/routes/risk.ts`
```typescript
// 변경 전
if (row.status === 'completed') return c.json({ error: '완료된 위험성평가는 삭제할 수 없습니다.' }, 400)

// 변경 후 [BUG-190]
// admin(시스템관리자)은 completed 포함 모든 단계 삭제 허용
if (row.status === 'completed' && user.role !== 'admin')
  return c.json({ error: '완료된 위험성평가는 삭제할 수 없습니다.' }, 400)
```

#### 백엔드 — `src/nas-routes/safety-committee.ts`
```typescript
// 변경 전
if (user.role !== 'admin' && user.role !== 'supervisor')
  return c.json({ error: '권한 없음' }, 403)

// 변경 후 [BUG-190]
// admin(시스템관리자)만 회의 삭제 가능 — 처리 단계 구분 없이 삭제 허용
if (user.role !== 'admin')
  return c.json({ error: '시스템관리자만 회의를 삭제할 수 있습니다.' }, 403)
```

#### 프론트엔드 — `public/static/app.js`

**① 위험성평가 목록 카드 삭제 버튼** (renderRiskPage)
```javascript
// 변경 전
${!isWorker && r.status !== 'completed' ? `<button ...>삭제</button>` : ''}

// 변경 후
var _riskIsSysAdmin = dbRoleToUi(currentUser.role, currentUser.position, currentUser.sub_role) === 'sysadmin';
${!isWorker && (r.status !== 'completed' || _riskIsSysAdmin) ? `<button ...>삭제</button>` : ''}
```

**② 위험성평가 모달 상세 삭제 버튼** (_renderRiskWorkflow)
```javascript
// 변경 전
${!isWorker && r.status !== 'completed' ? `<button ...>삭제</button>` : ''}

// 변경 후
var _raIsSysAdmin = dbRoleToUi(currentUser.role, currentUser.position, currentUser.sub_role) === 'sysadmin';
${!isWorker && (r.status !== 'completed' || _raIsSysAdmin) ? `<button ...>삭제</button>` : ''}
```

**③ SC 회의 삭제 버튼** (_scRenderDetailShell)
```javascript
// 변경 전 — 항상 표시
'<button onclick="_scDeleteMeeting(...)">삭제</button>'

// 변경 후 — admin(sysadmin)만 표시
var _scIsSysAdmin = dbRoleToUi(currentUser.role, currentUser.position, currentUser.sub_role) === 'sysadmin';
var _scDeleteBtn = _scIsSysAdmin
  ? '<button onclick="_scDeleteMeeting(...)">삭제</button>'
  : '';
// 렌더링 시 _scDeleteBtn 삽입
```

### 충돌 체크 & 규칙 준수

| 규칙 | 처리 방법 |
|------|----------|
| RULE-001 (var 전용) | `_riskIsSysAdmin`, `_raIsSysAdmin`, `_scIsSysAdmin`, `_scDeleteBtn` 모두 `var` 사용 |
| RULE-002 (NAS 라우트 순서) | 변경 없음 |
| RULE-003 (onclick 따옴표) | `_scDeleteMeeting` 이미 전역 함수 — 변경 없음 |
| 기존 BUG-189 수정 충돌 | `_renderRiskWorkflow` 내 `var isWorker/isAdmin` 이미 기존 코드 유지, 신규 `var _raIsSysAdmin`만 추가 |
| `dbRoleToUi` 함수 의존성 | 기존 전역 함수 재사용 — 새 의존성 없음 |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (296.05 kB)
- `npx tsc --noEmit` — 수정 파일(risk.ts, safety-committee.ts) 신규 TS 에러 없음 ✅
- `pm2 restart safetynote` + HTTP 200 ✅

---

## [BUG-189] 위험성평가 감소대책 저장 후 화면 미전환 + 서명화면 잘못된 내용 표시 + 근로자 메뉴 누락 (세션 108)

### 요구사항
1. **BUG-1**: 감소대책(reduction measures) 작성 저장 후 "최종 위험도 선정" 단계로 화면 상태가 변경되지 않는 문제
2. **BUG-2**: 서명 요청 화면에서 "연결된 내용 확인" 클릭 시 관련 없는 작업건의 내용이 표시되는 문제
3. **검증**: 근로자(worker) 권한 사용자를 평가위원으로 등록했을 때 위험성평가 열람 및 서명 가능한지 확인

### 단계 정의 명확화
| 상태 | 단계명 | 트리거 |
|------|--------|--------|
| `draft` | 평가전 위험도 선정 | 저장 후 → 감소대책 의견요청 푸시 알림 |
| `in_review` | 감소대책 수립 중 | 각 위원 감소대책 작성 |
| `measures_done` | 최종 위험도 선정 | 평가후 빈도×강도 저장 후 → 서명요청 발송 |
| `completed` | 평가완료 | 모든 위원 서명 완료 |

### BUG-1 원인 및 해결

#### 원인 1 — 모달 선택자 부정확
- `document.querySelector('.modal-overlay')` 가 여러 모달 중 첫 번째를 잡아 `riskId`와 무관한 모달 조작
- `_reload()` 가 다른 모달에 호출되거나 호출 자체가 누락됨

#### 원인 2 — 감소대책 단계에서 불필요한 서명요청 발송
- `_saveRiskMemberMeasures` 에서 감소대책 저장 후 서명요청을 발송하는 코드 존재
- 단계 정의상 서명요청은 "최종 위험도 선정(`measures_done`)" 저장 후에만 발송해야 함
- 감소대책 단계에서는 `finish-measures` API 호출 + `modal._reload()` 만 실행해야 함

#### 원인 3 — `rd-final-s` 강도 입력값 매칭 오류
- `_saveRiskFinalScores` 에서 배열 인덱스(`sInputs[i]`)로 강도 입력값을 찾던 방식 → DOM 순서에 의존
- 실제 `detailId`와 매칭되지 않는 값이 저장될 수 있음

#### 원인 4 — 위험도 레벨 계산 공식 불일치
- 프론트엔드 레벨 계산이 백엔드(`≤4낮음, ≤9보통, ≤16높음, ≥17중대`)와 불일치

#### 해결

| 수정 위치 | 변경 내용 |
|-----------|----------|
| `_saveRiskMemberMeasures` | 모달 선택자 → `data-risk-id="riskId"` 기반으로 수정 |
| `_saveRiskMemberMeasures` | 불필요한 서명요청 발송 코드 제거 → `finish-measures` + `modal._reload()` 만 실행 |
| `_saveRiskFinalScores` | 모달 선택자 → `data-risk-id="riskId"` 기반으로 수정 |
| `_saveRiskFinalScores` | `rd-final-s` 매칭 방식 → 배열 인덱스에서 `data-detail-id` 속성 매칭으로 변경 |
| `_saveRiskFinalScores` | 위험도 레벨 공식 백엔드 일치: `≤4낮음 / ≤9보통 / ≤16높음 / ≥17중대` |
| `_finalizeRisk` | 모달 선택자 → `data-risk-id="riskId"` 기반으로 수정 |

### BUG-2 원인 및 해결

#### 원인
- `showRiskDetail(riskId)` 호출 시 새 모달을 `body.appendChild`로 추가만 하고 기존 모달을 닫지 않음
- 사용자가 "연결된 내용 확인" 클릭 시 이전에 열린 다른 위험성평가 모달이 화면에 남아있어 보이게 됨

#### 해결
- `_signReqOpenRisk(riskId)` 함수에서 기존에 열린 모든 `.modal-overlay[data-risk-id]` 제거 후 새 모달 열기

```javascript
function _signReqOpenRisk(riskId) {
  // [BUG-2 FIX] 이미 열린 위험성평가 모달이 있으면 모두 닫고 새로 열기
  document.querySelectorAll('.modal-overlay[data-risk-id]').forEach(function(el) { el.remove(); });
  showRiskDetail(Number(riskId));
}
```

### 검증: 근로자 위험성평가 접근

#### 백엔드 API 권한 확인
| API | 권한 | 비고 |
|-----|------|------|
| `GET /risk/:id` | worker ✅ | 상세 조회 허용 |
| `GET /risk/:id/members` | worker ✅ | 평가위원 목록 허용 |
| `PATCH /risk/:id/details/:detailId` | worker ✅ | 감소대책 입력 허용 |
| `POST /risk/:id/signatures` | worker ✅ | 서명 허용 |

#### 프론트엔드 메뉴 추가
- 기존 `workerGroups` 메뉴에 위험성평가 항목 없음 → 접근 불가
- `risk-periodic` (정기 위험성평가), `risk-adhoc` (수시 위험성평가) 메뉴 추가

### 수정 파일
- `public/static/app.js` — 5곳 수정 (모달 선택자 4곳, 서명요청 발송 제거, rd-final-s 매칭, 레벨 공식, 메뉴 추가, signReqOpenRisk)
- `src/nas-routes/signature-requests.ts` — 관련 수정

### 커밋
| repo | commit | 내용 |
|------|--------|------|
| safetynote-server | `91c7be2` | fix: BUG-1 감소대책저장 후 상태미전환, BUG-2 서명화면 잘못된내용, 근로자 위험성평가 메뉴추가 |

---

## [FEAT-188] 정기 위험성평가 개선 — 기본값·평가위원 역할·서명관리 (세션 107)

### 요구사항
1. **정기 위험성평가 등록 모달 제목/특이사항 기본값 자동 입력**
2. **평가위원 선정 역할 기본값 — SC role_type 기반으로 변경**
   - 기존: 시스템 role(`admin/supervisor` → 의장, 근로자 → 위원)
   - 변경: SC `role_type='chair'` → 의장, 나머지 SC 위원 → 위원
3. **서명 관리 방식 확인** — 이미 `signature-requests/bulk` 패턴 적용 확인(추가 변경 불필요)

### 변경 내역

#### FEAT-188a — 정기평가 등록 모달 제목 기본값 (app.js)
- `rrTitle` input — `mode === 'periodic'`이면 `${year}년 ${quarter}분기 정기 위험성평가` 자동 입력
- `rrNotes` textarea — `mode === 'periodic'`이면 `산업안전보건법 제36조에 따른 정기 위험성평가를 실시합니다.` 자동 입력
- 수시평가(`adhoc`) 모드는 기존 빈 값 유지

#### FEAT-188b — 평가위원 선정 역할 기본값 (app.js)
- `_scMemberRoleMap` 전역 변수 추가 — SC 위원 XHR 로드 시 `user_id → role_type` 저장
- `buildUserCards` 함수의 `defaultRole` 결정 로직 수정:
  - SC 의장(`_scMemberRoleMap[u.id] === 'chair'`) → select 기본값 `'chair'` (의장)
  - SC 위원(chair가 아님) → select 기본값 `'member'` (위원)
  - SC 위원 아님 → 기존 `defaultRole` 매개변수 유지(admin/supervisor 전달 → 의장)
- 위원회 배지 표시 개선: SC 의장이면 `위원회 의장`, 일반 위원이면 `위원회` 표시

#### FEAT-188c — 서명 관리 방식 확인 (변경 없음)
- `_raSendSignRequest(riskId)` — 이미 `signature-requests/bulk` + `ref_type:'risk_assessment'` TBM 패턴과 동일하게 구현됨
- 서명 현황(완료/요청중/등록위원) 3칸 요약 표시도 이미 동일 구조

### 충돌 체크 & 규칙 준수

| 규칙 | 처리 방법 |
|------|----------|
| RULE-001 (var 전용) | `_scMemberRoleMap` 선언 `var` 사용, 루프 변수 `var` 유지 |
| RULE-002 (NAS 라우트 순서) | 변경 없음 |
| RULE-003 (onclick 따옴표) | 변경 없음 |
| 기존 `_scMemberPreCheckIds` 로직 | 확장(role_type 저장 추가)이며 기존 체크 기능 유지 |
| `buildUserCards` `data-default-role` | `defaultRole` → `resolvedRole` 변수로 교체, SC 비위원에겐 원래 `defaultRole` 그대로 전달 |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (296.03 kB)

---

## [BUG-185] SC 서명 500 + 위험성평가 서명 500 (세션 103~104)

### 문제
1. **BUG-185a**: `PATCH /api/safety-committee/meetings/:id/attendees/:id/sign` → 500 ✅ 해결
2. **BUG-185b**: `POST /api/risk/:id/signatures` → 500 (세션 103 수정 후에도 재발 → 세션 104 재수정)

### 원인

#### BUG-185a — `safety_committee_attendees` 누락 컬럼 (세션 103 해결)
- patchSchema v0.178이 `CREATE TABLE IF NOT EXISTS`로 생성
- **구버전 DB에 이미 테이블이 존재**하면 CREATE가 스킵됨
- 결과: `signature_data`, `signed_at`, `custom_title`, `side`, `role_type` 컬럼 없음
- UPDATE 쿼리가 없는 컬럼 참조 → 500

#### BUG-185b (세션 103) — `risk_assessment_signatures` 누락 컬럼
- patchSchema v0.111m에서 ADD COLUMN 처리가 있으나 더 오래된 DB에는 미적용
- `sign_method`, `sign_data`, `position`, `role` 컬럼 없음
- `INSERT OR REPLACE` 시 컬럼 없음 → 500
- 세션 103에서 patchSchema v0.187 + 3단계 폴백 추가했으나 여전히 500 재발

#### BUG-185b-v2 (세션 104) — FK 제약 문제 (근본 원인)
- `risk_assessment_signatures` 테이블에 `REFERENCES users(id)`, `REFERENCES risk_assessments(id)` FK 존재
- NAS DB의 `foreign_keys = ON` pragma 상태에서 INSERT 시 FK 검증 실패 → 500
- `INSERT OR REPLACE`는 UNIQUE 제약이 없으면 중복 레코드 생성 문제도 있음
- 기존 3단계 폴백도 모두 FK 오류로 실패

### 해결

#### BUG-185a — patchSchema v0.186 (세션 103, node-server.ts)
- `safety_committee_attendees` 누락 컬럼 5개 ADD COLUMN
- `duplicate column` 에러는 조용히 무시
- PATCH /sign 핸들러 3단계 폴백 추가 (safety-committee.ts)

#### BUG-185b-v2 — patchSchema v0.188 + 핸들러 전면 재작성 (세션 104, node-server.ts)

**patchSchema v0.188**: `risk_assessment_signatures` 테이블 FK 제약 제거
```
1. 기존 테이블 SQL에서 REFERENCES 키워드 감지
2. FK 없는 새 테이블로 재생성 (데이터 보존)
3. foreign_keys = OFF → 재생성 → foreign_keys = ON
```

**POST /api/risk/:id/signatures 핸들러 전면 재작성**:
```
0단계: 테이블 없으면 CREATE TABLE (FK 없는 버전)
컬럼 보완: sign_method, sign_data, position, role ADD COLUMN
FK = OFF 후:
  - 기존 레코드 있으면 UPDATE (재서명 지원)
  - 없으면 INSERT
FK = ON 복원
최후 수단: 최소 컬럼(assessment_id, user_id, user_name, signed_at)만으로 재시도
```

#### POST /signatures 핸들러 3단계 폴백 (node-server.ts)
```
1차: 풀 컬럼 INSERT OR REPLACE
2차: ADD COLUMN 후 재시도
3차: 최소 컬럼만 INSERT (assessment_id, user_id, user_name)
→ 실패 시에만 500 반환
```

#### CURRENT_TIMESTAMP → datetime('now','localtime') 통일
- UTC 시각 저장 방지

#### SC 서명 방식 단순화 (세션 105, safety-committee.ts)

**확인 사항**: 산업안전보건위원회 회의록 서명은 **클릭=서명완료** 방식 (자필패드 미사용)
- `app.js _scSignAttendee()`: 이미 `JSON.stringify({})` 빈 body PATCH 전송 → **정상**
- 서명 표시/출력: `signed_at` 기준으로 동작 → **정상**
- **서버 핸들러 문제**: `signature_data` 컬럼에 빈 문자열 저장하는 불필요한 로직 존재

**수정**: `PATCH /meetings/:id/attendees/:aid/sign` 핸들러 단순화
```
수정 전 (3단계 폴백):
  1차: SET signature_data = ?, signed_at = ...  (sign_data 사용)
  2차: SET signed_at = ...  (signature_data 컬럼 없는 경우)
  3차: ADD COLUMN signature_data + signed_at 후 재시도

수정 후 (2단계 폴백 — signed_at 만):
  1차: SET signed_at = datetime('now','localtime') WHERE id = ?
  2차: ADD COLUMN signed_at 후 재시도
  → sign_data / signature_data 관련 코드 완전 제거
```

### 수정 파일
- `node-server.ts` — patchSchema v0.186/v0.187/v0.188 + POST /risk/:id/signatures 전면 재작성
- `src/nas-routes/safety-committee.ts` — PATCH /sign: signature_data 로직 제거, signed_at 단순화 (세션 105)

### 커밋
| repo | commit | 내용 |
|------|--------|------|
| safetynote-server | (세션 104) | fix: [BUG-185b-v2] patchSchema v0.188 FK제거 + POST /risk signatures 핸들러 전면 재작성 |
| safetynote-server | (세션 105) | fix: [SC-서명] 클릭=서명완료 방식 단순화 — signature_data 제거 |
| safetynote-server | (세션 105-2) | fix: [SC-서명/안건] 자필패드 서명 방식 적용 + 안건 추가 500 에러 수정 |
| safetynote-server | (세션 106) | fix: [SC-투표/서명요청] 투표 400 에러 수정 + SC 서명요청 푸시(TBM 방식) + ref_type=sc 처리 |
| safetynote-server | (세션 106-2) | fix: [SC-투표500/투표요청] votes FK 제거(v0.189) + sc_vote ref_type 투표 push + 서명요청 카드 투표UI |

---

## [BUG-187] SC 투표 500 + 투표 요청 푸시 미구현 (세션 106-2)

### 문제
1. **BUG-187a**: 투표 클릭 시 500 에러 — `safety_committee_votes` 테이블에 FK 존재 (`agenda_id REFERENCES safety_committee_agendas`), `foreign_keys = ON` 환경에서 INSERT 500
2. **BUG-187b**: SC 메뉴는 근로자 접근 불가 → 근로자가 안건 탭에서 직접 투표 불가 → 관리자가 투표 요청을 push해야 하는 구조 필요
3. **BUG-187c**: 서명요청 목록(근로자 화면)에 SC 요청/투표요청이 표시 안 됨 (SR_META에 sc/sc_vote 없음)

### 원인
- `safety_committee_votes` 테이블 FK (`REFERENCES safety_committee_agendas(id) ON DELETE CASCADE`) → `foreign_keys=ON` INSERT 500
- `voted_at` 컬럼 구 DB에 부재 → INSERT 컬럼 불일치 500
- 근로자가 SC 메뉴 접근 불가하므로 안건 탭 투표 버튼 자체를 못 누름 → 투표 요청 push 흐름 필요

### 해결

#### BUG-187a — patchSchema v0.189 + 투표 핸들러 강화 (node-server.ts, safety-committee.ts)
```
patchSchema v0.189: safety_committee_votes FK 제약 제거
  - FK 없는 새 테이블 재생성 (데이터 보존)
  - voted_at 컬럼 보장

투표 핸들러 (POST /agendas/:id/vote):
  - 테이블 없으면 FK 없는 버전 자동 생성
  - voted_at/meeting_id ADD COLUMN 방어 처리
  - foreign_keys = OFF → INSERT → foreign_keys = ON 트랜잭션
  - 에러 시 500 상세 메시지 반환
```

#### BUG-187b — 투표 요청 push 흐름 구현 (app.js, signature-requests.ts)
- **`_scSendVoteRequests()` 신규**: 참석·서명·투표 탭 "투표 요청" 버튼 → vote_enabled 안건 선택 + 대상자 선택 → `signature-requests/bulk` (`ref_type:'sc_vote'`, `ref_sub_type:안건ID`) 전송
- **`signature-requests.ts` ref_type='sc_vote' 처리**: PATCH /sign → `body.vote` 또는 `sign_data`에서 `agree|disagree|abstain` 추출 → `safety_committee_votes` UPSERT
- **`_srVoteSubmit(reqId, vote)` 신규**: 서명요청 카드에서 찬성/반대/기권 버튼 클릭 → PATCH /sign 호출

#### BUG-187c — SR_META sc/sc_vote 추가 (app.js)
- SR_META에 `sc` (회의 서명), `sc_vote` (투표) 타입 추가
- `_srRenderCard`: sc/sc_vote 내용보기 버튼 추가
- 투표 카드 배지: "🔔 서명 필요" → "🗳️ 투표 필요"
- 미처리 투표 카드: 서명하기 대신 찬성/반대/기권 버튼 표시

### 수정 파일
- `node-server.ts` — patchSchema v0.189: safety_committee_votes FK 제거 + voted_at 보장
- `src/nas-routes/safety-committee.ts` — POST /agendas/:id/vote: FK OFF 드래핑 + 테이블 자동생성
- `src/nas-routes/signature-requests.ts` — ref_type='sc_vote' 처리 + broadcast 메시지 분기
- `public/static/app.js` — SR_META sc/sc_vote, _srVoteSubmit 신규, _scSendVoteRequests 신규, 투표요청 버튼, 카드 투표UI

---

## [BUG-186] SC 투표 400 에러 + 서명 요청 미구현 (세션 106)

### 문제
1. **BUG-186a**: 투표 버튼 클릭 시 400 에러 — 클라이언트가 `yes/no` 전송, 서버는 `agree/disagree/abstain` 기대
2. **BUG-186b**: `_scMyVote()` 가 `prompt()` 사용 → 모바일 불가 + UX 열악
3. **BUG-186c**: SC 참석자에게 서명 요청 푸시 미구현
4. **BUG-186d**: `signature-requests.ts` PATCH `/:id/sign`에서 `ref_type='sc'` 처리 누락

### 원인
- 클라이언트 `_scSubmitVote()` 에서 `vote: 'yes'/'no'` 전송 (구버전 코드)
- 서버 `/agendas/:id/vote` 핸들러는 `agree/disagree/abstain` 3가지만 수용
- `signature-requests/bulk` 호출 함수 자체가 없었음
- `signature-requests.ts` PATCH sign 핸들러에 `ref_type='sc'` 분기 없음 → 서명완료 후 DB 반영 안 됨

### 해결

#### BUG-186a/b — 투표 버튼 팝업 + agree/disagree/abstain 전송 (app.js)
- `_scMyVote()`: `prompt()` 제거 → 찬성/반대/기권 버튼 팝업 UI (모달)
- `_scSubmitVote(vote)`: vote = `'agree'|'disagree'|'abstain'` → 서버로 POST
- 투표 집계 표시: `votes[].vote==='yes'` → `ag.vote_agree/disagree/abstain` 숫자 컬럼 기준

#### BUG-186c — SC 서명 요청 푸시 (app.js, TBM 패턴)
- `_scLoadAttendTab()` 헤더에 **서명 요청** 버튼 추가
- `_scSendSignRequests()` 신규 구현: `signature-requests/bulk` (`ref_type:'sc'`) 사용
- 서명 완료자 자동 비활성화 (중복 요청 방지)

#### BUG-186d — ref_type='sc' 처리 (signature-requests.ts line 257)
```typescript
} else if (req.ref_type === 'sc') {
  // ADD COLUMN 방어 처리 (signature_data, signed_at)
  rawDb.prepare(`UPDATE safety_committee_attendees SET signature_data=?, signed_at=datetime('now','localtime') WHERE meeting_id=? AND user_id=?`)
    .run(signData || '', Number(req.ref_id), user.id)
}
```
- broadcastToRoles type 분기에 `'sc'` 케이스 추가

### 수정 파일
- `public/static/app.js` — _scMyVote 버튼팝업, _scSubmitVote 신규, _scSendSignRequests 신규, 투표집계 수정, 서명뱃지 이미지, 프린트 서명이미지
- `src/nas-routes/signature-requests.ts` — PATCH /:id/sign에 ref_type='sc' 블록 + broadcast 분기 추가

---

## [BUG-184] SC 회의록 삭제 500 + res 미정의 + 참석자 위원 자동추가 (세션 103, 커밋 503909f)

### 문제
1. **BUG-184a**: `ReferenceError: res is not defined at app.js:49162` — 참석자 탭 진입 시 콘솔 에러
2. **BUG-184b**: `DELETE /api/safety-committee/meetings/:id` → 500 Internal Server Error
3. **FEAT-184**: 참석자 탭 진입 시 상시위원 자동 추가 요청

### 원인

#### BUG-184a — Promise.all 콜백 변수명 오류
```javascript
// 기존: Promise.all 콜백에서 res.attendees 참조 (res는 undefined)
}).then(function(results) {
  var res = ...  // 없음
  var attendees = res.attendees  // ← ReferenceError
// 수정: results[0]을 meetingRes로 명명
  var meetingRes = results[0];
  var attendees  = meetingRes.attendees || m.attendees || [];
```

#### BUG-184b — `safety_committee_votes` 테이블에 `meeting_id` 컬럼 없음
- patchSchema v0.180에서 `votes` 생성 시: `agenda_id`, `user_id`, `vote` 컬럼만 생성
- DELETE 핸들러: `DELETE FROM safety_committee_votes WHERE meeting_id = ?` → 컬럼 없음 → 500

### 해결

#### BUG-184a (`app.js`)
- `_scLoadAttendTab`: `res.attendees` → `meetingRes.attendees || m.attendees || []`

#### BUG-184b (`safety-committee.ts`, `node-server.ts`)
- **즉시 대응**: DELETE 핸들러 각 테이블 try/catch 개별화
  - votes 삭제 실패 시 → agenda_id 경유 폴백 삭제
- **근본 해결**: `patchSchema v0.185` — `safety_committee_votes.meeting_id ADD COLUMN`
  - 기존 rows는 `agenda_id → agendas.meeting_id` 역산으로 채움

#### FEAT-184 (`app.js`)
- `_scLoadAttendTab`: 참석자 0명 + members > 0 → 위원 전체 자동 POST 후 재렌더링

### 수정 파일
- `public/static/app.js` — BUG-184a/c + FEAT-184
- `src/nas-routes/safety-committee.ts` — BUG-184b try/catch
- `node-server.ts` — patchSchema v0.185 + 단수경로 DELETE 보완

---

> 코드 수정 전 반드시 이 파일을 확인할 것.
> 동일 에러 재발 방지 및 NAS 듀얼 구조 이해를 위한 핵심 기록.

---

## [BUG-183] SC 회의록 삭제 무반응 + 출력 빈칸 (세션 103)

### 문제
1. **BUG-183a**: 삭제 확인 팝업에서 확인 클릭해도 회의록이 삭제되지 않음
2. **BUG-183b**: PDF 출력 시 회의명·개최일시·장소·요약 등 모든 칸이 빈칸
3. **BUG-183c**: 기본정보·안건·참석자·사진 탭 모두 데이터 미표시 (같은 원인)

### 원인

#### BUG-183a — RULE-003 위반 (onclick 따옴표 중첩)
```html
<!-- 기존 (NAS 브라우저에서 따옴표 중첩으로 파싱 실패) -->
onclick="_scDeleteMeeting(this.getAttribute('data-mid'))"
```
- onclick 속성 내부에서 작은따옴표 사용 → HTML 파서가 속성 값을 일찍 닫아버림
- 함수 자체가 호출되지 않음 (confirm 팝업은 뜨지만 DELETE 요청 안 감)

#### BUG-183b/c — API 응답 구조 불일치
```
API 응답: { meeting: {...}, attendees: [...], agendas: [...], photos: [...], docs: [...] }
기존 코드: var m = res.data || res  → m = { meeting, attendees, agendas, ... } 전체
           m.title  → undefined (실제로는 m.meeting.title)
```

### 해결

#### BUG-183a
```javascript
// 수정 후: _scCurrentMeetingId 전역변수 직접 참조
onclick="_scDeleteMeeting(_scCurrentMeetingId)"
onclick="_scConfirmMeeting(_scCurrentMeetingId)"
onclick="_scPrintMeeting(_scCurrentMeetingId)"
```

#### BUG-183b/c — res 구조 수정 (12곳 일괄)
```javascript
// 수정 후
var m = res.meeting || res.data || res;      // meeting 객체
var agendas  = res.agendas  || m.agendas  || [];
var attendees = res.attendees || m.attendees || [];
var photos   = res.photos   || m.photos   || [];
var docs     = res.docs     || m.docs     || [];
```

#### BUG-183d — 출력 레이아웃 개선 (안전교육 출력 방식 참고)
- `@page A4 portrait` + 고정 toolbar (닫기/인쇄 버튼)
- `@media print` 시 toolbar 숨김, 내용 여백 최적화
- agenda_no → seq 폴백: `ag.agenda_no || ag.seq || (i+1)`

### 커밋
- `3db29f1` — fix: [BUG-183] SC 회의록 삭제 무반응 + 출력 빈칸 2종 수정

---

## [BUG-182b] 회의 상세 500 에러 — 서브 테이블 컬럼 불일치 (세션 103, 근본 해결)

### 문제 (3차 — 최종 원인)
NAS git pull 완료 후(`app.js?v=40978c9` 로드 확인), 경로도 `/meetings/1` 복수로 정상화됐으나
`GET /api/safety-committee/meetings/1` → **여전히 500** 발생

### 근본 원인: patchSchema 컬럼명 불일치
| 테이블 | patchSchema 생성 컬럼 | 쿼리 참조 컬럼 | 불일치 |
|---|---|---|---|
| `safety_committee_agendas` | `seq` (v0.179) | `agenda_no` | ✗ 컬럼 없음 |
| `safety_committee_agendas` | (없음) | `decision`, `due_date` | ✗ 컬럼 없음 |
| `safety_committee_docs` | (없음) | `caption`, `uploader_id` | ✗ 컬럼 없음 |

### 해결
**1. safety-committee.ts GET /meetings/:id / GET /meeting/:id**
- 각 서브 테이블(attendees, agendas, photos, docs) 조회를 독립 try/catch로 감쌈
- 실패 시 빈 배열 반환 + 콘솔 warn 로깅
- agendas ORDER BY: `COALESCE(agenda_no, seq, id)` — 컬럼명 불일치 우회
- agendas 2차 폴백: `ag.*` 단순 조회
- docs 2차 폴백: `created_by as uploader_id`
- photos 2차 폴백: caption 컬럼 제외 조회

**2. node-server.ts 인라인 라우트도 동일 적용**

**3. patchSchema v0.184 추가** (컬럼 영구 보정)
- `safety_committee_agendas`: `agenda_no`, `decision`, `due_date`, `vote_enabled`, `vote_closed`, `result` ADD COLUMN
- `safety_committee_docs`: `caption`, `uploader_id` ADD COLUMN
- `safety_committee_photos`: `caption` ADD COLUMN
- seq → agenda_no 데이터 동기화

### 커밋
- `586022c` — fix: [BUG-182b] /meeting 단수 경로 호환 라우트 추가
- `40978c9` — fix: [BUG-182b-v2] /meeting 단수 경로 호환을 node-server.ts 레벨로 이동
- `bc8ee00` — fix: [BUG-182b] GET /meetings/:id 500 — try/catch fallback + patchSchema v0.184

---

## [BUG-182a] 회의록 상세보기 클릭 무반응 (세션 102)

### 문제
산업안전보건위원회 회의록 목록에서 회의 카드 클릭 시 상세 화면이 열리지 않음 (아무 반응 없음)

### 원인 (2가지 복합)
1. **`getElementById('main-content')` → null**
   - `_scOpenMeeting` 및 관련 함수들이 `document.getElementById('main-content')` 사용
   - 실제 DOM에 `id="main-content"` 없음 — `class="main-content"` 로만 존재
   - `main`이 `null`이 되어 `if (main)` 분기 전혀 실행 안 됨
2. **자식 요소 클릭 시 `data-mid` 누락**
   - 카드 div에 `onclick="_scOpenMeeting(this)"` 설정
   - 내부 span/i 클릭 시 `this` = 자식 요소 → `getAttribute('data-mid')` = null

### 해결
- `_scGetDetailContainer()` 헬퍼 추가: `sc-tab-content` 우선 탐색 → `page-content` fallback
- `_scOpenMeeting`: `el.closest('[data-mid]')` 로 data-mid 보유 요소 안전 탐색
- `_scSubmitCreateMeeting`, `_scSubmitEditBasic`, `_scConfirmMeeting` 3곳도 동일 적용

### 커밋
- `d32f3f1` — fix: [BUG-182a]

---

## [FEAT-182] 산업안전보건위원회 운영규칙 + 조직도 탭 추가 (세션 102)

### 신규 기능
1. **운영규칙 탭**: 법정 14개 조항 view/edit 토글 UI (편집/저장/취소/출력)
2. **조직도 탭**: 등록 위원 기반 3단 조직도 렌더링 (위원장→부위원장·간사→사용자측/근로자측), 출력 지원

### 구현 내용

#### DB (node-server.ts — patchSchema v0.183)
```sql
CREATE TABLE IF NOT EXISTS safety_committee_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_key   TEXT    NOT NULL UNIQUE,
  rule_value TEXT    NOT NULL DEFAULT '',
  updated_by INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
)
```
- 14개 법정 기본값 `INSERT OR IGNORE` 삽입 (org_name, purpose, basis, composition, chair, term, meeting_cycle, quorum, agenda_submit, agenda_scope, resolution, minutes, penalty, enforcement)

#### API (safety-committee.ts)
- `GET /api/safety-committee/rules` — key/value 객체 반환
- `PUT /api/safety-committee/rules` — UPSERT 방식 일괄 저장 (updated_by, updated_at 갱신)

#### 프론트엔드 (app.js)
- 탭 바 4개로 확장: 회의록관리 / 위원관리 / 운영규칙(fa-gavel) / 조직도(fa-sitemap)
- `_scSwitchMainTab` 루프 방식 리팩토링
- `_scLoadTabContent` rules/orgchart 분기 추가
- `_scRulesMeta[]` — 14조항 메타 배열
- `_scRenderRulesTab` — view/edit 토글 렌더
- `_scToggleRulesEdit / _scCancelRulesEdit / _scSaveRules / _scPrintRules`
- `_scRenderOrgChartTab` — 3단 조직도 (위원장→부위원장·간사→사용자측/근로자측)
- `_scPrintOrgChart` — 새 창 출력 (FontAwesome CDN 포함)

### 커밋
- `174ee7c` — feat: [FEAT-182]

---

## [FEAT-181] 위원관리 다중행 일괄등록 + 인라인 수정폼 (세션 101)

### 신규 기능
1. **다중행 위원 추가**: 버튼 클릭마다 입력 행 추가, 일괄 등록, 각 행 ✕ 삭제 버튼
2. **인라인 수정폼**: `prompt()` 제거 → 인라인 카드 수정 폼 (구분/직책유형/직책표시명/임명일 4개 필드)

### 구현
- `_scToggleOrAddMemberRow / _scAddMemberRow / _scRemoveMemberRow`
- `_scSubmitAddMember` 순차 API 호출
- `window._scAvailableUsers` 전역 캐시
- `data-role`, `data-appointed` 카드 버튼에 추가

### 커밋
- `eccce5d` — feat: [FEAT-181]

---

## [FEAT-180b] SC 500 에러 추가 수정 + 사이드바 하위메뉴 제거 (세션 101)

### 문제
1. **500 Internal Server Error (2차)**: `/api/safety-committee/members` GET/POST 여전히 500
2. **사이드바 하위메뉴**: "산업안전보건위원회" 클릭 시 하위 메뉴(회의록/위원관리)가 펼쳐지고 탭 통합 화면으로 바로 이동 안 됨

### 원인 (2차 500 에러)
1. `GET /members`: `ORDER BY scm.sort_order` — `safety_committee_members` 테이블에 `sort_order` 컬럼 없음 → `no such column` 에러
2. `POST /members`: `custom_title || null`, `appointed_at || null` → DB가 `NOT NULL DEFAULT ''`인 컬럼에 `null` 명시 삽입 → `NOT NULL constraint failed` 에러

### 해결
- `GET /members`: `ORDER BY scm.sort_order ASC` → `ORDER BY scm.side ASC`로 교체
- `POST /members`: `custom_title || ''`, `appointed_at || ''` (null 대신 빈문자열)
- `PATCH /members`: `role_type/side` 빈값 fallback 명시적 처리
- `app.js` 사이드바: `sc-meetings` children 배열 제거 → 단일 메뉴 클릭 시 `renderSCMainPage(content, 'meetings')` 직접 진입
- `renderSafetyCommitteePage` 내 "위원 관리" 버튼: `navigateTo('sc-members')` → `_scSwitchMainTab('members')`

### 커밋
- `ef6c244` — fix: [FEAT-180b]

---

## [FEAT-180] 산업안전보건위원회 500 에러 수정 + 탭 통합 UI (세션 101)

### 문제
1. **500 Internal Server Error**: `/api/safety-committee/meetings` 및 `/api/safety-committee/members` 500 에러
2. **화면 분리**: "회의록 관리"와 "위원 관리"가 별도 페이지로 분리되어 탭 이동 불가

### 원인
1. `safety-committee.ts`가 DB 실제 컬럼명과 다른 이름을 사용:
   - `meeting_date` (없는 컬럼) → 실제: `held_date`
   - `meeting_place` (없는 컬럼) → 실제: `location`
   - `status` TEXT 'draft'/'confirmed' → 실제: `confirmed` INTEGER (0/1)
   - `member_role`, `custom_role_label` → 실제: `role_type`, `custom_title`, `side`
2. `year`/`quarter` 필터에 없는 컬럼(`m.year`, `m.quarter`) 직접 참조

### 해결
**`safety-committee.ts` 수정 (이전 세션에서 완료)**:
- `GET /meetings`: `substr(m.held_date,1,4)` / `substr(m.held_date,6,2)` 방식으로 연도/분기 필터
- `POST /meetings`: `held_date`, `meeting_type`, `location`, `summary` 사용
- `PATCH /meetings/:id`: `held_date`, `location`, `confirmed` INTEGER 사용
- `POST/PATCH /members`: `role_type`, `custom_title`, `side` 사용
- `POST /attendees`: `role_type`, `custom_title`, `side`, `signature_data` 사용
- vote check: `meeting?.confirmed === 1` (INTEGER 비교)

**`app.js` 탭 통합 UI**:
- `navigateTo` switch: `renderSCMainPage(content, tab)` 단일 진입점으로 변경
- `renderSCMainPage` / `_scSwitchMainTab` / `_scLoadTabContent` 신규 추가
- `_scRenderMeetingListInTab` / `_scRenderMembersInTab` 탭 내 렌더 함수 신규 추가
- `_scBuildMeetingCard` / `_scEditMemberCard` 카드 빌더 헬퍼 신규 추가
- 구버전 콜백 교체: `renderSafetyCommitteeMembersPage(...)` → `_scLoadTabContent('members')`
- 구버전 콜백 교체: `renderSafetyCommitteePage(...)` → `_scSwitchMainTab('meetings')` / `_scLoadTabContent('meetings')`
- `_scEditMember`: tr 기반 → data-* 속성 방식 (RULE-003 준수)

### 영향 범위
- `src/nas-routes/safety-committee.ts`
- `public/static/app.js`

---

## [FEAT-179] 산업안전보건위원회 UI 개선 + 401 인증 수정 (세션 100)

### 문제
1. **401 Unauthorized**: safety-committee 신규 함수들이 순수 `fetch()`를 사용하여 `Authorization: Bearer` 헤더 미포함
   - `/api/safety-committee/*`, `/api/users?active=1` 모두 401 반환

### 원인
`renderSafetyCommitteeMembersPage`, `renderSafetyCommitteePage` 등 신규 SC 함수들이 `fetch()`를 직접 호출하여 토큰 헤더를 첨부하지 않음.

### 해결
1. `_scFetch(url, options)` 헬퍼 함수 신규 생성
   - `localStorage.getItem('token')` → `Authorization: Bearer <token>` 자동 추가
   - `Content-Type: application/json` 자동 설정 (body 있을 때)
2. Python 스크립트로 36개 `fetch('/api/safety-committee...`) → `_scFetch(...)` 일괄 교체
3. 위험성평가 연동 XHR에도 `Authorization` 헤더 추가

### UI 개선 (안전교육 스타일)
**`_scRenderMembersPage` 완전 재작성**:
- 상단 헤더: 아이콘+제목+법령기준 서브타이틀
- 통계 카드 4개: 전체 위원 / 사용자측 / 근로자측 / 동수 충족 여부 배지
- 법령 안내 카드 (amber 배경): 산업안전보건법 시행령 제35조 — 위원 구성 기준 테이블
- 위원 추가 폼: 기존 토글 방식 유지, 스타일 개선
- 위원 카드 그리드: 테이블 방식 → 카드 그리드 방식 (사이드별 테두리 색상 구분)

**`_scRenderMeetingList` 완전 재작성**:
- 상단 헤더: 아이콘+제목+법령기준, 위원관리+회의생성 버튼
- 통계 카드 4개: 전체 회의 / 이번 분기 / 확정 완료 / 정기·임시 건수
- 연도·분기·유형 필터 셀렉터 (안전교육 연도 셀렉터 방식)
- `_scFilterMeetings()` 클라이언트 사이드 필터 함수 신규 추가
- `_scRenderMeetingCardsOnly()` 필터 결과 재렌더 헬퍼 신규 추가
- 법령 안내 카드 (amber): 산업안전보건법 제24조 — 개최주기/보존/심의사항
- 회의 카드: 요약 내용 미리보기, 사이드별 테두리 색상, 확대 hover 효과

### RULE 준수
- RULE-001: `var` 전용 — `const`/`let`/화살표함수 없음 확인
- RULE-003: onclick 내 따옴표 중첩 → `data-*` 속성 활용

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ `dist/_worker.js 296.03 kB`

---

## [FEAT-178] 산업안전보건위원회 신규 메뉴 (세션 99)

### 구현 내용
산업안전보건법 제24조 기반 위원회 관리 기능 전체 신규 구현.

### 신규 파일
- `src/nas-routes/safety-committee.ts` — 19개 라우트 (위원/회의/참석자/투표/사진/자료)

### node-server.ts 수정
- `import safetyCommitteeRoutes` 추가 (라인 97)
- `patchSchema v0.176~v0.182`: 7개 테이블 신규 생성
  - `safety_committee_meetings` — 회의 기본정보
  - `safety_committee_members` — 상시위원 (UNIQUE user_id)
  - `safety_committee_attendees` — 회의별 참석자 + 서명 (CASCADE)
  - `safety_committee_agendas` — 안건 (담당자/투표 포함)
  - `safety_committee_votes` — 찬반투표 UNIQUE(agenda_id, user_id)
  - `safety_committee_photos` — 회의 사진
  - `safety_committee_docs` — 회의 자료 첨부 (PDF/Office/HWP/ZIP 등, 최대 50MB/파일)
- `app.route('/api/safety-committee', safetyCommitteeRoutes)` 등록

### app.js 수정
- `edu` 그룹 메뉴에 `sc-meetings` / `sc-members` 서브메뉴 추가
- `wsafety` 그룹에 `sc-meetings` 단일 메뉴 추가
- `getPageTitle` map에 `sc-meetings`, `sc-members` 추가
- `navigateTo` switch에 2개 case 추가
- 신규 함수 목록:
  - `renderSafetyCommitteeMembersPage()` — 위원 관리 (추가/수정/해제)
  - `renderSafetyCommitteePage()` — 회의록 목록
  - `_scCreateMeeting()` / `_scSubmitCreateMeeting()` — 회의 생성
  - `renderSCMeetingDetail()` — 4탭 회의 상세
  - `_scSwitchDetailTab()` — 탭 전환
  - `_scLoadBasicTab()` — 기본정보 + 법적요건 체크
  - `_scLoadAgendasTab()` — 안건 목록/추가/수정/삭제/투표
  - `_scLoadAttendTab()` — 참석자 관리 + 서명 처리
  - `_scLoadMediaTab()` — 사진 + 회의자료 첨부 (다중 업로드/다운로드/삭제)
  - `_scPrintMeeting()` — PDF 출력 (`_openPrintOverlay` 방식)
  - `_scPreCheckRiskMembers()` — 위험성평가 연동 헬퍼

### 위험성평가 자동체크 연동
`_renderRiskWorkflow` 내 평가위원 선정 단계에서:
- `/api/safety-committee/members` 동기 XHR 조회 (XMLHttpRequest)
- `is_active` 위원 user_id를 `_scMemberPreCheckIds` 집합으로 추출
- `buildUserCards` 렌더링 시 위원에 `checked` + 보라색 배경 + `<위원회>` 배지 자동 적용
- `setTimeout(50ms)` 후 카드 스타일 + `_updateRdSelectedCount` 갱신

### RULE 준수
- RULE-001: `app.js` 내 `var` 전용 — `const`/`let`/화살표함수 없음 확인
- RULE-003: onclick 내 따옴표 중첩 → `data-*` 속성 활용

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ `dist/_worker.js 296.03 kB`

---

## [BUG-185] 현장위치 지도 위험성체크 탭 날짜 필터 미적용 (커밋 `TBD`)

### 문제
현장위치 지도 → 위험성체크 탭 선택 시 날짜 필터 범위(오늘/7일/30일/전체)가 무시되고
전체 기간 데이터가 항상 반환됨. TBM/진행/완료 탭은 날짜 필터 정상 동작.

### 원인
`loadSiteMapMarkers` 내 위험성체크 분기에서 API 파라미터 구성 오류:

```javascript
// 기존 (날짜 누락)
const rp = new URLSearchParams();
rp.set('status', 'in_progress');
if (userId) rp.set('user_id', userId);   // tasks API는 user_id 파라미터 미지원
// → 날짜 파라미터 전혀 없음, 전체 기간 반환
```

추가 문제:
- `user_id` 파라미터: tasks API는 `user_id` 미지원 → `supervisor_id` 파라미터를 사용해야 함
- 클라이언트 2차 필터 없음: 서버 필터 누락 시 방어 로직 부재

### 해결
`public/static/app.js` — `loadSiteMapMarkers` 위험성체크 분기 수정:

1. **서버 파라미터 수정**: tasks API 규격에 맞게 `start_date`/`end_date` 추가, `user_id` → `supervisor_id`
2. **클라이언트 2차 필터 추가**: `planned_date` 기준으로 날짜 범위 재필터 (TBM/진행 탭과 동일 패턴)

```javascript
// 수정 후
const rp = new URLSearchParams();
rp.set('status', 'in_progress');
if (dateFrom) rp.set('start_date', dateFrom);   // [BUG-185 신규]
if (dateTo)   rp.set('end_date',   dateTo);     // [BUG-185 신규]
if (userId)   rp.set('supervisor_id', userId);  // [BUG-185] user_id → supervisor_id

// + 클라이언트 2차 필터 (planned_date 기준)
const riskTaskList = _riskLguFiltered.filter(function(t) {
  var pd = t.planned_date ? String(t.planned_date).slice(0, 10) : '';
  if (dateFrom && pd && pd < dateFrom) return false;
  if (dateTo   && pd && pd > dateTo)   return false;
  return true;
});
```

### 영향 범위
- `public/static/app.js` — `loadSiteMapMarkers` 위험성체크(`filter === 'risk'`) 분기

### 검증
- `node --check app.js` ✅
- `npm run build` ✅ (296.03 kB)

---

## [BUG-182] TBM 결재 서명 후 서명요청 카드 "서명 필요" 잔존 (커밋 `8a1ac6e` / v2 `TBD`) — 세션 99 (2026-07-27) ✅ 수정 완료

### 증상
TBM 상세 모달에서 결재 서명(안전관리자/총괄책임) 완료 후,
서명요청 페이지를 새로고침해도 해당 건이 여전히 **"서명 필요"** 상태로 잔존.

### 원인 (v1 — 커밋 8a1ac6e)
`POST /api/tbm/:id/approval-sign` 처리 흐름:
1. `tbm_signatures` 테이블에 서명 INSERT ✅
2. 다음 단계 알림 연쇄 (approval_safety → approval_general 서명요청 생성) ✅
3. **`signature_requests` 테이블의 해당 건 `status='signed'` UPDATE 누락** ❌

→ `8a1ac6e`에서 INSERT 직후 UPDATE 쿼리를 추가했으나 **재발 케이스 미처리**.

### 재발 원인 (v2) — 세션 100 (2026-07-27)
BUG-182 수정 이전에 TBM 모달에서 이미 서명한 경우:
- `tbm_signatures`에는 이미 해당 role 레코드 존재
- `POST /api/tbm/:id/approval-sign` 재시도 시 `signedRoles.has(approval_role)` → true
- **409 반환 전에 UPDATE 쿼리가 없었으므로** `signature_requests`는 여전히 `pending` 상태로 잔존

```
이미 tbm_signatures에 INSERT됨 (BUG-182 수정 전 서명)
  ↓
POST /api/tbm/:id/approval-sign 재시도
  ↓
signedRoles.has(approval_role) → true → 409 반환 (UPDATE 쿼리 미실행!)
```

### 해결 방법 (v2)
`signedRoles.has(approval_role)` 분기에서 409 반환 **이전에** `signature_requests` UPDATE 실행 후 성공 응답 반환:

```typescript
if (signedRoles.has(approval_role)) {
  // [BUG-182 v2] 이미 tbm_signatures에 서명됐어도 signature_requests가 pending이면 signed로 처리
  rawDb.prepare(`
    UPDATE signature_requests
    SET status='signed', signed_at=CURRENT_TIMESTAMP, sign_data=?
    WHERE ref_type='tbm' AND ref_id=? AND ref_sub_type=? AND target_user_id=? AND status='pending'
  `).run(sign_data || null, id, approval_role, user.id)
  return c.json({ success: true, approval_role, signer: user.name, already_signed: true })
}
```

### 수정 파일 (NAS 듀얼 구조 — 양쪽 동시 수정)
| 파일 | 변경 내용 |
|------|-----------| 
| `src/nas-routes/tbm-extra.ts` | v1: INSERT 직후 UPDATE 추가 / v2: `signedRoles.has()` 분기에 UPDATE+성공반환 추가 |
| `src/routes/tbm.ts` | 동일 (D1 버전, Cloudflare Workers용) |

### 이중 검증
- `npm run build` → ✅ `dist/_worker.js 296.03 kB` 빌드 성공 (v2 수정 후)
- `app.js` 변경 없음 (서버 사이드 수정만)

### 관련 이력
- `FEAT-170` (2026-07-26): 서명요청 내용 보기 링크 추가 시 최초 구현
- `BUG-181` (세션 99): TBM 내용 보기 함수 오용 수정 (`showTaskDetail` → `showTbmDetail`)
- `BUG-182 v1` (세션 99, `8a1ac6e`): INSERT 직후 UPDATE 추가
- `BUG-182 v2` (세션 100): 이미 서명된 경우에도 `signature_requests` UPDATE 보장

---

## [BUG-181] TBM 서명 "TBM 내용 보기" → 엉뚱한 작업 상세 이동 (커밋 `d2058ef`) — 세션 99 (2026-07-27) ✅ 수정 완료

### 증상
서명요청 화면에서 TBM 서명 건의 **"TBM 내용 보기"** 버튼 클릭 시,
해당 TBM이 아닌 **전혀 다른 작업의 상세화면**으로 이동.
이동한 작업 상세의 TBM 탭에 "TBM 기록이 없습니다" 표시됨.

### 원인
`FEAT-170` 구현 시 `showTaskDetail(req.ref_id, 'tbm')` 으로 잘못 연결:

```
sign_requests.ref_id = tbm_records.id  (TBM 레코드 고유 ID)
showTaskDetail(id)   = tasks.id        (작업 ID) ← 전혀 다른 테이블의 ID!
```

`tbm_records.id` 와 `tasks.id` 는 **별개 시퀀스**로 숫자가 우연히 겹치거나 달라,
임의의 작업 상세가 열리거나 존재하지 않는 작업이 열리는 버그 발생.

예: TBM 레코드 ID=5 → tasks.id=5인 전혀 다른 작업이 열림.

### 원인 분석 (테이블 관계)
```
signature_requests
  └─ ref_type = 'tbm'
  └─ ref_id   = tbm_records.id  ← TBM 고유 ID

tbm_records
  ├─ id        (tbm_records 자체 PK)
  └─ task_id   (tasks.id 참조)

showTaskDetail(taskId)  ← tasks.id 필요
showTbmDetail(tbmId)    ← tbm_records.id 필요 ✅
```

### 해결 방법
`showTaskDetail(req.ref_id, 'tbm')` → `showTbmDetail(req.ref_id)` 교체:

```javascript
// 수정 전 (FEAT-170 — 잘못된 함수)
_viewBtn = '...<button onclick="showTaskDetail(' + req.ref_id + ',\'tbm\')"...>';

// 수정 후 (BUG-181 — 올바른 함수)
_viewBtn = '...<button onclick="showTbmDetail(' + req.ref_id + ')"...>';
```

`showTbmDetail(tbmId)` 는 `/api/tbm/:id` 를 직접 호출하여 TBM 전용 모달을 열므로
`tbm_records.id` 를 그대로 사용해 정확한 TBM 기록이 표시됨.

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `public/static/app.js` | 서명요청 `renderCard()` 내 TBM "내용 보기" 버튼: `showTaskDetail(ref_id,'tbm')` → `showTbmDetail(ref_id)` |

### NAS 듀얼 구조 영향
- 클라이언트 단 수정만으로 해결 — `node-server.ts` / `src/routes/*.ts` 변경 없음
- `showTbmDetail()` 은 `/api/tbm/:id` 호출 (이미 양쪽 서버 지원)

### 이중 검증
- `node --check public/static/app.js` → ✅ 문법 오류 없음
- `npm run build` → ✅ `dist/_worker.js 295.49 kB` 빌드 성공

### 관련 이력
- `FEAT-170` (2026-07-26): 서명요청 내용 보기 링크 추가 시 최초 오구현

---

## [BUG-180] 현장위치 지도 진행 탭 날짜 필터 미동작 (커밋 `877ce55`) — 세션 99 (2026-07-27) ✅ 수정 완료

### 증상
현장위치 지도 → 진행(🟢) 탭에서 "오늘" 날짜 필터 선택 시,
오늘 날짜가 아닌 **과거 날짜 작업까지 모두 표시**됨.

### 원인
`loadSiteMapMarkers()` 내 진행 탭 분기에서 `/api/tbm` 호출 시
`date_from`/`date_to` 파라미터를 **아예 전송하지 않음**:

```javascript
// 수정 전 — 날짜 파라미터 미전송
const twp = new URLSearchParams();
if (userId) twp.set('user_id', userId);  // 날짜 없음!
twp.set('limit', '500');
const tbmAllRes = await API.get(`/tbm?${twp.toString()}`);
```

서버(`tbm.ts`)는 `date_from`/`date_to` 파라미터가 없으면 전체 기간 반환.
→ `task_status='working'`인 **모든 날짜** 데이터가 반환되어 날짜 필터 무시됨.

완료 탭(`completed`)은 동일 API에 `date_from`/`date_to`를 이미 정상 전송 중.
진행 탭만 누락된 상태였음.

### 해결 방법
1. **서버 파라미터 전송**: 진행 탭도 `date_from`/`date_to` 서버 전송 추가
2. **클라이언트 2차 필터**: `planned_date` 기준 클라이언트 필터 추가 (서버 `tbm_date` 필터 보완)

```javascript
// 수정 후
const twp = new URLSearchParams();
if (dateFrom) twp.set('date_from', dateFrom);  // ← 추가
if (dateTo)   twp.set('date_to',   dateTo);    // ← 추가
if (userId)   twp.set('user_id',   userId);
twp.set('limit', '500');

// + 클라이언트 2차 필터 (planned_date 기준)
const workingTbmList = tbmAllFiltered.filter(function(tbm) {
  if (tbm.task_status !== 'working') return false;
  var pd = tbm.planned_date ? String(tbm.planned_date).slice(0, 10) : '';
  if (dateFrom && pd && pd < dateFrom) return false;
  if (dateTo   && pd && pd > dateTo)   return false;
  return true;
});
```

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `public/static/app.js` | 진행 탭 `/api/tbm` 호출에 `date_from`/`date_to` 파라미터 추가 + `planned_date` 클라이언트 2차 필터 추가 |

### NAS 듀얼 구조 영향
- `node-server.ts`: `/api/tbm` GET은 `src/routes/tbm.ts`를 `app.route()`로 위임 — 클라이언트 변경만으로 해결, 서버 수정 불필요
- `src/routes/tbm.ts`: `date_from`/`date_to` 파라미터 이미 지원 중 (라인 20~21)

---

## [BUG-179b] Android 앱 사진 갤러리 저장 — downloadApk 오용 수정 (커밋 `ea4cebe`) — 세션 98 (2026-07-27) ✅ 검증 완료

### 증상
Android 전용앱에서 사진 다운로드 버튼 클릭 시:
- 상단 toast: `"파일명" 갤러리에 저장 중...`
- 하단 toast: `APK 다운로드 중... 알림창을 확인하세요` ← **APK 다운로드 전용 알림**
- 갤러리에 사진 저장되지 않음

### 원인
`downloadPhoto()` 앱 환경 분기에서 `SafetyNoteApp.downloadApk(url)` 호출:
- `downloadApk()`는 **APK 전용** 브릿지 → `startApkDownload()` 실행
- 내부에서 "Safety NOTE 업데이트" 알림 + APK 설치 흐름 진행
- 이미지를 갤러리에 저장하는 기능 없음

### 해결 방법
**Android 앱에 이미지 전용 신규 브릿지 `saveImageToGallery(url, fileName)` 추가:**

| Android 버전 | 저장 방식 | 결과 |
|-------------|-----------|------|
| Android 10+ (API 29+) | `MediaStore.Images.Media` ContentValues → `getContentResolver().insert()` → `IS_PENDING=0` | 갤러리 `Pictures/SafetyNOTE/` ✅ |
| Android 9 이하 | `Environment.DIRECTORY_PICTURES/SafetyNOTE/` 파일 저장 + `MediaScannerConnection.scanFile()` | 갤러리 즉시 인식 ✅ |

### 수정 내용

#### `MainActivity.java` (safetynote-android)
- `import android.content.ContentValues` 추가
- `import android.provider.MediaStore` 추가
- `import java.io.OutputStream` 추가
- `SafetyNoteAppBridge` 내부 클래스에 `saveImageToGallery(String imageUrl, String fileName)` 메서드 추가
  - 백그라운드 Thread: HttpURLConnection 다운로드 (openAttachmentExternally 패턴 재사용)
  - NAS URL 변환: `https:3443` → `http:3444` (자체서명 인증서 대응)
  - Android 10+: `MediaStore.Images.Media` 직접 삽입 → `Pictures/SafetyNOTE/` 폴더
  - Android 9-: 파일 직접 저장 + `MediaScannerConnection.scanFile()`
  - 완료 시 `evaluateJavascript("window.toast(...)")` 로 웹뷰 JS 콜백
  - Toast 알림: 시작 + 완료 2단계

#### `public/static/app.js` — `downloadPhoto()` 앱 분기
```javascript
// ❌ 변경 전: APK 전용 브릿지 오용
if (isAppBridge && typeof window.SafetyNoteApp.downloadApk === 'function') {
  window.SafetyNoteApp.downloadApk(url);  // APK 알림 + 설치 흐름 ❌

// ✅ 변경 후: 이미지 전용 브릿지
if (isAppBridge && typeof window.SafetyNoteApp.saveImageToGallery === 'function') {
  window.SafetyNoteApp.saveImageToGallery(url, safeFileName);  // 갤러리 직접 저장 ✅
```

### 갤러리 저장 경로
- `갤러리 > 앨범 > SafetyNOTE` 폴더에서 확인 가능
- 또는 `갤러리 > 최근 항목`

### 검증 결과
- `node --check public/static/app.js` ✅ 통과
- `npm run build` ✅ 성공 (295.49 kB)
- **APK v1.4.16 빌드** ✅ GitHub Actions 성공 (약 3분)
- **실기기 테스트** ✅ 갤러리 > SafetyNOTE 앨범에서 사진 확인 완료

---

## [BUG-179] iOS 사진 다운로드 → 파일 앱 저장 문제 (커밋 `64ed3ac`) — 세션 97 (2026-07-27)

### 증상
iPhone / iPad에서 사진 다운로드 버튼 클릭 시 사진이 **사진 앱(Photos)이 아닌 파일 앱(Files)** 에 저장됨.

### 원인
iOS Safari는 `<a download>` 방식을 처리할 때 파일을 **"파일 앱 > 다운로드"** 폴더에 저장함.  
브라우저 자체적으로 사진 앱으로 보내는 기능이 없음.

### 해결 방법: Web Share API (`navigator.share({ files })`)

iOS 14.0+ Safari는 **Web Share API Level 2** 를 지원 — `File` 객체를 직접 공유 가능.  
`navigator.share({ files: [imageFile] })` → iOS 공유 시트 → **"사진에 저장"** 선택 → 사진 앱 저장.

```
fetch(url) → blob → new File([blob], fileName, { type: 'image/jpeg' })
  → navigator.share({ files: [file] })
  → iOS 공유 시트 "사진에 저장" 탭 → 사진 앱 ✅
```

### 수정 내용

#### `public/static/app.js` — `downloadPhoto()` 함수 전면 재구성

| 환경 | 판별 기준 | 처리 방식 | 저장 위치 |
|------|-----------|-----------|-----------|
| Android 전용앱 | `window.SafetyNoteApp` 존재 | `downloadApk(url)` | Downloads/ → 갤러리 ✅ |
| iOS Safari/Chrome | UA `/iP(hone\|ad\|od)/i` + `navigator.canShare({files})` | `fetch → blob → File → navigator.share()` | 사진 앱 ✅ |
| PC · Android Chrome · 기타 | — | `fetch → blob → <a download>` | 브라우저 다운로드 폴더 ✅ |

#### `_downloadPhotoFallback(blob, fileName)` 신규 헬퍼 함수 추가
- `<a download>` 로직을 공통 함수로 분리
- PC / Android Chrome / iOS canShare 불가 시 폴백에서 재사용

#### URL 변경: `?dl=1` 파라미터 추가
- 기존: `/api/photos/:id/img?token=...`
- 변경: `/api/photos/:id/img?dl=1&token=...`
- 서버에서 `?dl=1` 시 `Content-Disposition: attachment` 반환 → 브라우저 다운로드 명확히 트리거

#### `node-server.ts` — `/api/photos/:id/img` 라우트
- `c.req.query('dl') === '1'` 체크 추가
- `dl=1`: `Content-Disposition: attachment; filename="..."` (다운로드)
- 기본: `Content-Disposition: inline; filename="..."` (미리보기, 기존 동작 유지)
- NAS 듀얼 구조 원칙: `src/routes/photos.ts` D1 버전도 동일하게 수정

#### `src/routes/photos.ts` — D1 버전 동일 적용

### iOS 사용자 UX
1. 다운로드 버튼 클릭
2. "사진 불러오는 중..." toast 표시
3. iOS 공유 시트 자동 표시
4. **"사진에 저장"** 탭 선택
5. 사진 앱에 저장 완료

> ⚠️ iOS에서는 "사진에 저장" 선택 단계가 추가됨 — 직접 저장 불가 (iOS 웹 보안 정책)

### RULE-001 준수
- `downloadPhoto()`: `var` 전용, `const`/`let`/화살표함수 없음 ✅
- `_downloadPhotoFallback()`: 동일 ✅

### 검증 결과
- `node --check public/static/app.js` ✅ 통과
- `npm run build` ✅ 성공 (295.49 kB)

---

## [BUG-178b] 앱 환경 사진 다운로드 갤러리 미저장 (커밋 `51d02b0`) — 세션 96 (2026-07-27)

### 증상
모바일 전용앱(Android)에서 사진 다운로드 버튼 클릭 시 "다운로드를 시작합니다." toast는 표시되나, 갤러리에서 사진이 확인되지 않음. (일부 기기에서는 "다운로드 완료" toast만 뜨고 갤러리 저장 안 됨)

### 원인 분석
`downloadPhoto()` 앱 환경 분기가 `SafetyNoteApp.openAttachment(url, fileName)`을 호출하고 있었음.

`openAttachment()`는 PDF·Word 등 **첨부파일을 외부앱(Chooser)으로 열기** 위해 설계된 브릿지 메서드:
- 내부적으로 Android DownloadManager 또는 FileProvider를 통해 외부앱을 실행함
- **갤러리에 이미지를 저장하는 기능이 없음** → 다운로드 동작이 있어도 갤러리 미반영

### 해결 방법

`SafetyNoteApp.downloadApk(url)` 브릿지 재활용:
- `downloadApk()`는 DownloadManager에 URL을 직접 전달하는 범용 다운로드 브릿지
- Android DownloadManager → `Downloads/` 폴더에 파일 저장
- Android는 `Downloads/` 폴더의 이미지(`.jpg`/`.png`) 파일을 **갤러리에서 자동 인식**
- **앱 신규 브릿지 추가 불필요** — 기존 `downloadApk()` 브릿지로 해결

### 수정 내용

| 파일 | 변경 |
|------|------|
| `public/static/app.js` | `downloadPhoto()` 앱 분기: `openAttachment()` → `downloadApk()` 로 교체 |
| `public/static/app.js` | toast 메시지: "다운로드를 시작합니다." → "갤러리에 저장 중..." |

### 변경 전후 비교

```javascript
// ❌ 변경 전 (BUG-178b 발생)
if (isAppBridge && typeof window.SafetyNoteApp.openAttachment === 'function') {
  window.SafetyNoteApp.openAttachment(url, safeFileName);  // 외부앱 열기용 → 갤러리 저장 ❌
  toast('"' + safeFileName + '" 다운로드를 시작합니다.', 'info');
  return;
}

// ✅ 변경 후 (BUG-178b 수정)
if (isAppBridge && typeof window.SafetyNoteApp.downloadApk === 'function') {
  window.SafetyNoteApp.downloadApk(url);  // DownloadManager → Downloads 폴더 → 갤러리 자동 인식 ✅
  toast('"' + safeFileName + '" 갤러리에 저장 중...', 'info');
  return;
}
```

### 환경별 동작 요약 (수정 후)

| 환경 | 판별 기준 | 처리 방식 | 저장 위치 |
|------|-----------|-----------|-----------|
| Android 전용앱 | `window.SafetyNoteApp` 존재 | `downloadApk(url)` → DownloadManager | Downloads/ → 갤러리 자동 인식 ✅ |
| PC 브라우저 | — | `fetch → blob → <a download>` | 브라우저 다운로드 폴더 |
| Android Chrome | — | `fetch → blob → <a download>` | 브라우저 다운로드 폴더 |
| iOS Safari | — | `fetch → blob → <a download>` | 브라우저 다운로드 폴더 |

### RULE-001 준수
- 수정 범위: `downloadPhoto()` 함수 내 `isAppBridge` 분기 1곳만 변경
- `var` 전용, `const`/`let`/화살표함수 없음 ✅

### 검증 결과
- `node --check public/static/app.js` ✅ 통과
- `npm run build` ✅ 성공 (295.36 kB)

### 관련 이슈
- BUG-178 (커밋 `ab85790`): isCapacitor 오탐으로 일반 모바일 Chrome에서 앱 선택기 팝업 — SafetyNoteApp 브릿지 판별로 수정
- BUG-178b (이 항목): openAttachment 사용으로 갤러리 미저장 — downloadApk 브릿지로 교체

---

## [BUG-178] isCapacitor 오탐 — 일반 모바일 Chrome 앱 선택기 팝업 (커밋 `ab85790`) — 세션 95 (2026-07-27)

### 증상
일반 Android Chrome 브라우저에서 사진 다운로드 버튼 클릭 시 앱 선택기(Chooser) 팝업이 뜨며 다운로드 진행 안 됨.

### 원인
`downloadPhoto()` 초기 구현에서 `isCapacitor` 변수를 UA 기반으로 감지:
```javascript
var isCapacitor = /wv\b|WebView/i.test(ua);  // Android Chrome도 오탐
```
일반 모바일 Chrome의 UA에도 `wv` 또는 `WebView` 패턴이 포함될 수 있어 오탐 발생 → `window.open(url, '_system')` 실행 → 앱 선택기 팝업.

### 수정
UA 기반 감지 완전 제거. `window.SafetyNoteApp` 브릿지 유무만으로 앱 환경 판별:
```javascript
var isAppBridge = !!(window.SafetyNoteApp);  // 100% 확실한 앱 환경 판별
```

---

## [FEAT-178] 작업등록 사진 다운로드 기능 (커밋 `696e959`) — 세션 95 (2026-07-27)

### 기능 요약
감독자 권한 이상 사용자가 작업등록의 사진/동영상을 PC·모바일·APP 모든 환경에서 다운로드할 수 있도록 버튼 추가.

### 권한 조건
- **표시**: `role !== 'worker'` (감독자·관리자·시스템관리자 등 모두)
- **숨김**: `role === 'worker'` (작업자)

### 신규 함수: `downloadPhoto(photoId, fileName)`

| 환경 | 처리 방식 |
|------|-----------|
| Android APP (`SafetyNoteApp` 브릿지) | `SafetyNoteApp.openAttachment(url, fileName)` |
| Android WebView (`Capacitor`) | `window.open(url, '_system')` → DownloadManager |
| PC / 일반 모바일 브라우저 | `fetch → blob → <a download>` |

- RULE-001 준수: `var` 전용, `const`/`let`/화살표함수 없음
- `toast()` 피드백: 다운로드 시작 / 완료 / 오류 3종

### 적용 위치 4곳

| 위치 | 표시 형태 | 조건 변수 |
|------|-----------|-----------|
| `showTaskDetail` `dtab-photo` `renderThumb` (초기 렌더) | 썸네일 하단 바 파란 아이콘 버튼 | `!isWorker` |
| `_refreshPhotoTab` `renderThumb` (갱신 렌더) | 동일 | `_canDownload` |
| `showPhotoData` 모달 헤더 | `다운로드` 텍스트+아이콘 버튼 | `_spCanDL` |
| `showVideoData` 모달 헤더 | 동일 | `_svCanDL` |

### 검증 결과
- `node --check public/static/app.js` ✅ 통과
- `npm run build` ✅ 성공 (295.36 kB)
- `git push origin main` ✅ `696e959` 업로드 완료

---

## [BUG-177c] 보유현황 사용량 항목 자산구분 `-` 표시 (커밋 `d11f09f`) — 세션 95 (2026-07-27)

### 증상
광케이블 보유현황 탭에서 사용량만 있고 입고 내역이 없는 자재 행의 자산구분이 항상 `-`로 표시됨.

### 원인
`useRows` SQL이 `asset_type` 없이 `maker, spec, cable_kind` 3개 키로만 GROUP BY → `work_report_cables.asset_type` 값을 가져오지 못함 → 사용량 전용 항목 push 시 `asset_type: '-'` 고정.

### 수정 내용

| 파일 | 변경 |
|------|------|
| `node-server.ts` (NAS) | `useRows` SELECT에 `wrc.asset_type` 추가, GROUP BY에 `wrc.asset_type` 추가 |
| `src/routes/cable-incoming.ts` (D1) | 동일 |
| 양쪽 공통 | `useMap` 키 `maker\|spec\|kind` → `maker\|spec\|kind\|asset_type` |
| 양쪽 공통 | 사용량 전용 항목 push 시 `asset_type: r.asset_type\|\|'-'` 실제값 사용 |
| 양쪽 공통 | 중복 체크 키도 4개 기준으로 통일 |

### 검증 결과
- `node --check` ✅ / `npm run build` ✅
- `git push origin main` ✅ `d11f09f`

---

## [FEAT-177c] 광케이블 입고/보유현황 자산구분 컬럼 추가 (커밋 `ce6c49b`) — 세션 95 (2026-07-27)

### 기능 요약
입고현황·보유현황 테이블 헤더와 데이터 행에 자산구분(N-1/N-2) 컬럼 추가.

### 변경 내용

#### `public/static/app.js`
| 위치 | 변경 |
|------|------|
| 입고현황 집계 `inMap` | 키 `maker\|spec\|kind` → `maker\|spec\|kind\|asset_type` |
| 입고현황 테이블 | 헤더 자산구분 추가 (5열), colspan 4→5, 행에 `r.asset_type` 표시 |
| 보유현황 테이블 HTML | 헤더 자산구분 추가 (7열), colspan 6→7 |
| `_loadCableHoldingSummary()` | 행에 `r.asset_type` 표시, spinner/빈데이터 colspan 7 |

#### `node-server.ts` (NAS)
- `inRows` SQL: `asset_type` SELECT + GROUP BY 추가
- 반환 객체에 `asset_type` 필드 추가

#### `src/routes/cable-incoming.ts` (D1)
- 동일

### 검증 결과
- `node --check` ✅ / `npm run build` ✅ (295.21 kB)
- `git push origin main` ✅ `ce6c49b`

---

## [BUG-177b] 광케이블 입고관리 탭 고정 버그 (커밋 `cb7be88`) — 세션 95 (2026-07-27)

### 증상
`날짜별 입고내역` 탭에서 수정 저장 또는 삭제 후, 항상 `입고현황` 탭(첫 번째 탭)으로 자동 이동됨.

### 원인
`_saveCableIncoming()` / `_deleteCableIncoming()` 가 저장/삭제 후 `renderCableIncomingPage(container)` 를 호출하는데, 이 함수가 `_renderCableIncomingUI()` 를 항상 `in-summary` 탭 active 상태로 초기화.

### 수정 내용

| 함수 | 변경 |
|------|------|
| `renderCableIncomingPage(container, initialTab)` | `initialTab` 파라미터 추가, 기본값 `'in-summary'` |
| `_renderCableIncomingUI(container, items, initialTab)` | `_ciInitTab` 변수 선언, 탭 버튼 3개 active/inactive 동적 분기, 패널 3개 hidden 동적 분기 |
| `_saveCableIncoming()` | 저장 전 `.ci-tab-btn.ci-tab-active`의 `data-tab` 값 캡처 → `renderCableIncomingPage(el, activeTab)` |
| `_deleteCableIncoming()` | confirm 전에 탭 캡처 (취소해도 안전) → 동일 |

### 재발 방지
- `renderCableIncomingPage` 호출부에서 `initialTab` 미전달 시 `'in-summary'` 기본값 적용 (하위 호환 유지)
- `_renderCableIncomingUI` 내 `_ciInitTab` 변수는 탭 버튼 HTML + 패널 hidden 양쪽 모두에 사용 (버튼·패널 불일치 방지)

### 검증 결과
- `node --check` ✅ / `npm run build` ✅ (295.11 kB)
- `git push origin main` ✅ `cb7be88`

---

## [FEAT-177] 광케이블 입고관리 신규 메뉴 + 광케이블 현황 메뉴 구조 변경 (커밋 `b4f25f3`) — 세션 94 (2026-07-27)

### 기능 요약
1. **메뉴 구조 변경**: `광케이블 현황` 단일 메뉴 → 부모 메뉴(광케이블 현황) + 자식 2개 구조
   - `광케이블 현황` (부모, cable) → 클릭 시 `광케이블 사용량`으로 자동 리디렉션
   - `광케이블 사용량` (cable-detail) — 기존 renderCableDetailPage 그대로 유지
   - `광케이블 입고관리` (cable-incoming) — 신규 메뉴 생성
2. **광케이블 입고관리 기능**: 케이블 입고 등록/조회/삭제 + 3개 탭(입고현황/보유현황/날짜별내역)

### 변경 내역
- **`public/static/app.js`**:
  - 메뉴(line ~2350): `cable-detail` 단일 → `cable` 부모 + `cable-detail`/`cable-incoming` 자식
  - 브레드크럼(line ~3092): `cable-detail: '광케이블 현황'` → `cable-detail: '광케이블 사용량'`, `cable-incoming: '광케이블 입고관리'` 추가
  - 라우팅(line ~3229): `case 'cable'` 리디렉션, `case 'cable-incoming'` 추가
  - 신규 함수: `renderCableIncomingPage()`, `_renderCableIncomingUI()`, `_ciSwitchTab()`, `_loadCableHoldingSummary()`, `_openCableIncomingModal()`, `_saveCableIncoming()`, `_deleteCableIncoming()`
- **`node-server.ts`**:
  - `patchSchema v0.174`: `cable_incoming` 테이블 신규 생성
  - NAS 전용 API 직접 구현: GET/POST/DELETE `/api/cable-incoming`, GET `/api/cable-incoming/holding`
- **`src/routes/cable-incoming.ts`**: Cloudflare D1용 API 신규 파일 (GET/POST/DELETE + holding 집계)
- **`src/index.tsx`**: `cable-incoming` 라우트 import + mount 추가
- **`migrations/0060_cable_incoming.sql`**: `cable_incoming` 테이블 + 인덱스 생성

### 테이블 스키마 (cable_incoming)
```sql
CREATE TABLE IF NOT EXISTS cable_incoming (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  in_date TEXT NOT NULL, lot_no TEXT DEFAULT '', spec TEXT DEFAULT '',
  maker TEXT DEFAULT '', mfg_year TEXT DEFAULT '', cable_kind TEXT DEFAULT '',
  cable_type TEXT DEFAULT '', qty_m REAL DEFAULT 0, remark TEXT DEFAULT '',
  created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

### 보유 현황 계산
- `보유량(M)` = `cable_incoming.qty_m 합계` - `work_report_cables.usage_m 합계`
- 사용량 기준: `work_reports.status IN ('confirmed','submitted')` (확정/제출 일보만)
- 집계 키: `maker + spec + cable_kind` 3개 컬럼 조합

### RULE-001 준수
- `renderCableIncomingPage`, `_renderCableIncomingUI`, `_ciSwitchTab`, `_loadCableHoldingSummary`, `_openCableIncomingModal`, `_saveCableIncoming`, `_deleteCableIncoming` 모두 `var` 전용, `const`/`let`/화살표함수 없음

---

## [FEAT-176 / BUG-176] 외선작업일보 공정구분 철거 분리 + 광케이블 현황 케이블종류 오류 (커밋 `55b7aff`) — 세션 94 (2026-07-27)

### 기능 요약
1. **FEAT-176**: 외선작업일보 공정구분 `철거` → `철거(불용)` / `철거(폐기)` 2개로 분리
2. **BUG-176**: 광케이블 현황 케이블 요약/상세내역에서 케이블종류가 `-`로 표시되는 오류 수정

### 변경 내역

| 파일 | 변경 내용 |
|------|----------|
| `app.js` | `PROC_OPTS` 3곳: `['신설','철거','이설']` → `['신설','철거(불용)','철거(폐기)','이설']` |
| `app.js` | `_isRemove()` 헬퍼 추가: `'철거'`/`'철거(불용)'`/`'철거(폐기)'` 모두 철거로 집계 (하위 호환) |
| `app.js` | 광케이블 현황 `cable_type` → `cable_kind` 3곳 수정 (요약집계·상세표시·CSV) |

### BUG-176 원인 분석
- **저장**: `wrc-kind` select → `cable_kind` 컬럼에 저장 (가공/일반/지중/난연)
- **표시**: `cable_type` 컬럼을 읽음 → 항상 빈값(`''`) → `-` 표시
- **수정**: 표시 로직 `cable_type` → `cable_kind` 로 변경

### 충돌 체크 & 규칙 준수

| 규칙 | 처리 방법 |
|------|----------|
| RULE-001 (var 전용) | `_isRemove` 선언에 `var` 사용 |
| 하위 호환 | 기존 `'철거'` 데이터도 `_isRemove()`가 인식하여 집계 정상 |

### 검증 결과
- `node --check public/static/app.js` ✅ 통과
- `npm run build` ✅ 성공 (291.51 kB)
- `git push origin main` ✅ `55b7aff` 업로드 완료

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

---

## [BUG-166] 사진 캡션 한글 IME 입력 지연 (2026-07-26)

### 증상
- 사진 캡션 입력 필드(`photoCaption`)에서 한글 타이핑 시 글자가 늦게 반응하거나
  입력 중간값(자음/모음 분리)이 그대로 노출됨
- 특히 느리게 입력할 때 `ㅎ`, `ㅏ`, `ㄴ` 으로 분리되어 표시

### 원인 분석
- `<input id="photoCaption">` 에 `type` 속성이 없어 브라우저/WebView가 기본값(`text`) 유추 실패
- Android IME `compositionstart` / `compositionend` 이벤트 리스너가 없어
  조합 중간값이 `oninput` 핸들러로 즉시 전달됨

### 수정 내용
```html
<!-- 수정 전 -->
<input id="photoCaption" ...>

<!-- 수정 후 -->
<input id="photoCaption" type="text" autocomplete="off" inputmode="text" ...>
```
- `compositionstart` / `compositionend` 이벤트 리스너 추가
  → 조합 완료 시점에만 최종값 처리

### 수정 파일
- `public/static/app.js` — `photoCaption` input 속성 추가 + IME 이벤트 리스너

### 커밋
- `ffc0b30` — fix(BUG-166): photoCaption 한글 IME 입력 지연

### ⚠️ 재발 방지
- 한글 입력이 필요한 모든 `<input>` 에 `type="text" autocomplete="off" inputmode="text"` 명시
- 검색/캡션 등 동적 반응 입력 필드에는 반드시 `compositionstart/end` 이벤트 처리 추가

---

## [BUG-167] Android WebView HTTP 캐시 미반영 (2026-07-26)

### 증상
- 서버 코드 수정 후 APK를 재시작해도 이전 버전 응답이 그대로 표시됨
- 브라우저(PC)에서는 즉시 반영되지만 Android WebView에서는 구버전 캐시 지속

### 원인 분석
- `serveStatic` 미들웨어가 정적 파일에 `Cache-Control` 헤더를 설정하지 않음
- Android WebView는 기본적으로 HTTP 캐시를 적극적으로 활용 →
  `app.js` 등 정적 파일이 무기한 캐시됨
- `captureInput: false` 전환 이후 WebView 캐시 동작이 더 적극적으로 관찰됨

### 수정 내용
`serveStatic` 대신 직접 라우트에 `Cache-Control: no-cache` 헤더를 추가:
```typescript
// src/index.tsx
app.get('/static/app.js', async (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  // ...
});
```
- 캐시 버스팅 쿼리 파라미터 전략 병행: `?v=20260726c` 형식으로 버전 갱신

### 수정 파일
- `src/index.tsx` — Cache-Control 헤더 직접 라우트 추가, 캐시 버스팅 버전 갱신

### 커밋
- `8fab226` — fix(BUG-167): Android WebView 캐시 미반영, no-cache 헤더 추가

### ⚠️ 재발 방지
- `app.js` 수정 시 `src/index.tsx` 의 캐시 버스팅 버전(`?v=YYYYMMDD[x]`) 반드시 갱신
- 버전 형식 규칙: `?v=날짜 + 알파벳 순서` (당일 첫 번째 `a`, 두 번째 `b`, ...)
- RULE: `app.js` 변경 → `src/index.tsx` 버전 문자열 동시 수정 필수

---

## [BUG-IME] Android WebView 한글 IME 근본 원인 — captureInput: true (2026-07-26)

### 증상
- APK v1.4.14 이하에서 모든 한글 입력 필드가 IME 조합 모드를 지원하지 않음
- 한글 타이핑 시 글자가 조합되지 않고 자음/모음이 낱자로 분리 입력됨
- `compositionstart` / `compositionend` 이벤트 자체가 발생하지 않음

### 원인 분석
Capacitor 기본값 `captureInput: true` 가 근본 원인:

```
captureInput: true
  → Capacitor가 WebView에 CustomInputConnection 주입
  → BaseInputConnection(this, false) — false = non-composing mode
  → Android IME가 조합 문자(한글, 중문 등) 처리 불가
  → compositionstart/end 이벤트 미발생
  → 낱자 분리 입력 현상
```

| 설정값 | InputConnection | 조합 지원 | 한글 입력 |
|--------|----------------|-----------|-----------|
| `captureInput: true` (기본) | `BaseInputConnection(false)` | ❌ 불가 | ❌ 분리 입력 |
| `captureInput: false` (수정) | `super.onCreateInputConnection()` | ✅ 정상 | ✅ 조합 입력 |

### 수정 내용
```json
// safetynote-android/capacitor.config.json
{
  "android": {
    "captureInput": false
  }
}
```
- `super.onCreateInputConnection()` 복원 → Android 기본 IME 정상 작동
- APK v1.4.15에 반영

### 수정 파일
- `safetynote-android/capacitor.config.json` — `captureInput: true` → `false`

### 커밋
- `a172a6f` (safetynote-android) — fix(BUG-IME): captureInput false로 한글 IME 활성화

### ⚠️ 재발 방지
- `captureInput: true` 로 되돌리지 말 것 — 한글 IME 전면 파괴됨
- Capacitor 업그레이드 시 `capacitor.config.json` `captureInput` 값 반드시 확인
- 이 수정이 BUG-168 (oninput 중간값) 의 전제 조건임

---

## [BUG-168] 검색 input 한글 자음/모음 분리 입력 (2026-07-26)

### 증상
APK v1.4.15 설치(`captureInput: false` 적용) 후 검색 input에서 한글을 느리게 입력하면
`ㅎㅏㄴ` 처럼 자음/모음이 분리되어 검색 결과가 오동작함

예시:
- `한` 입력 중 → `oninput` 이 `ㅎ` / `하` / `한` 각각에 대해 검색 실행
- 중간 조합값으로 필터 적용 → 의도치 않은 검색 결과 노출

### 원인 분석
```
BUG-IME 수정(captureInput: false)
  → Android IME가 조합 모드로 활성화
  → 조합 중 매 자모 입력마다 oninput 이벤트 발생
  → oninput 핸들러가 중간값(ㅎ, 하, ...)을 즉시 검색 함수에 전달
  → 검색 결과 오동작
```

영향 받은 검색 input 8개:
| 필드 ID | 기능 |
|---------|------|
| `conKeyword` | 공사 키워드 검색 |
| `keywordInput` | 작업 키워드 검색 |
| `myTasksSearchInput` | 내 작업 검색 |
| `fcm-user-search` | FCM 사용자 검색 |
| `rdMemberSearch` | 근로일지 멤버 검색 |
| `userSearchInput` | 사용자 목록 검색 |
| `wsSearch` | 작업현황 검색 |
| `edu-user-search` | 교육 사용자 검색 |

### 수정 내용

#### ① 전역 IME 조합 상태 가드 추가 (app.js 최상단)
```javascript
// ── BUG-168: 전역 IME 조합 상태 가드 ──
var _imeComposing = false;
document.addEventListener('compositionstart', function() { _imeComposing = true; });
document.addEventListener('compositionend', function() {
  _imeComposing = false;
  var ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
    ae.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
```

#### ② 검색 input 8개 속성 추가
```html
type="text" autocomplete="off" inputmode="text"
```

#### ③ oninput 핸들러 6개 — IME 가드 조건 추가
```javascript
oninput="if(!_imeComposing)applyMyTasksSearch(this.value)"
oninput="if(!_imeComposing)_fcmRenderList()"
oninput="if(!_imeComposing)_filterRdMembers(this.value)"
oninput="if(!_imeComposing)filterUserList(this.value)"
oninput="if(!_imeComposing)_wsOnSearch(this.value)"
oninput="if(!_imeComposing)_eduFilterUsers(this.value)"
```

#### ④ onkeydown Enter 핸들러 2개 — isComposing 가드 추가
```javascript
onkeydown="if(event.key==='Enter'&&!event.isComposing){_conFilters.keyword=...}"
onkeydown="if(event.key==='Enter'&&!event.isComposing){ taskFilters.keyword=...}"
```

### 수정 파일
- `public/static/app.js` — 전역 `_imeComposing` 가드 + 8개 input 속성 + 6개 oninput + 2개 Enter 핸들러

### 커밋
- `26fba0f` — fix(BUG-168): 검색 input 한글 IME 조합 중간값 oninput 방지

### ⚠️ 재발 방지
- **새 검색 input 추가 시**: `type="text" autocomplete="off" inputmode="text"` 3개 속성 필수
- **새 oninput 핸들러 추가 시**: `if(!_imeComposing)` 가드 필수
- **새 Enter 핸들러 추가 시**: `&&!event.isComposing` 가드 필수
- `_imeComposing` 전역 변수는 `var` 선언 (RULE-001 준수, `const`/`let` 금지)
- `compositionend` 핸들러에서 `input` 이벤트 재발행 → 조합 완료 시 검색 정상 실행 보장

---

## [BUG-169] node-server.ts app.fetch() TS2339 타입 오류 (2026-07-26)

### 증상
`npx tsc --noEmit --skipLibCheck` 실행 시 오류 2건 발생:
```
node-server.ts(7756,9): error TS2339: Property 'then' does not exist on type 'Response | Promise<Response>'.
  Property 'then' does not exist on type 'Response'.
node-server.ts(7813,7): error TS2339: Property 'then' does not exist on type 'Response | Promise<Response>'.
  Property 'then' does not exist on type 'Response'.
```
- 런타임 동작에는 영향 없음 (서버 정상 실행)
- TypeScript 타입 검사만 실패

### 원인 분석
Hono의 `app.fetch()` 반환 타입이 `Response | Promise<Response>` (union 타입).
- `Promise<Response>` 인 경우 → `.then()` 호출 가능 ✅
- `Response` 인 경우 → `.then()` 없음 ❌

TypeScript는 union 타입 중 `.then()`이 없는 `Response` 케이스를 감지하여 TS2339 오류 발생.

**발생 위치**:
- `node-server.ts` 7745~7756: HTTPS 서버(port 3443) 요청 핸들러
- `node-server.ts` 7802~7813: HTTP 서버(port 3444, Android FCM 전용) 요청 핸들러

### 수정 내용
`app.fetch()` 반환값을 `Promise.resolve()`로 래핑하여 반환 타입을 항상 `Promise<Response>`로 단일화.

```typescript
// Before (TS2339 오류)
app.fetch(
  new Request(`https://...`, { ... } as any),
  { incoming: req, outgoing: res } as any
).then((honoRes: Response) => { ... })

// After (수정)
Promise.resolve(
  app.fetch(
    new Request(`https://...`, { ... } as any),
    { incoming: req, outgoing: res } as any
  )
).then((honoRes: Response) => { ... })
```

### 수정 파일
- `node-server.ts`
  - 7745라인: HTTPS 서버 핸들러 — `Promise.resolve()` 래핑 추가
  - 7802라인: HTTP 서버(port 3444) 핸들러 — `Promise.resolve()` 래핑 추가

### 커밋
- `e664b34` — fix: [BUG-169] node-server.ts app.fetch() TS2339 타입 오류 수정

### ⚠️ 재발 방지
- Hono `app.fetch()` 직접 호출 시 반드시 `Promise.resolve(app.fetch(...)).then(...)` 패턴 사용
- `@hono/node-server`의 `serve()` 함수 사용 시에는 이 문제 없음 (내부에서 처리)
- 향후 node-server.ts에 유사 패턴 추가 시 동일 방식 적용

---

## [FEAT-170] 서명요청 내용 보기 링크 추가 (2026-07-26)

### 증상
서명요청 페이지에서 해당 건의 원본 내용(TBM, 위험성평가, 안전교육)을 확인하지 못하고 서명해야 했음.

### 원인
`renderCard()` 함수에 원본 건으로 이동하는 링크가 없었음.  
`ref_type`·`ref_id` 필드는 API 응답에 이미 포함되어 있었으나 활용되지 않음.

### 해결

#### 1. 전역 helper 함수 추가 (`_signReqOpenRisk`)
`showTaskDetail()`의 `openTbmTab` 파라미터는 TBM 탭 전환만 지원하므로,  
위험성평가 탭을 직접 열기 위한 별도 helper 함수를 추가:

```javascript
function _signReqOpenRisk(taskId) {
  showTaskDetail(taskId);
  setTimeout(function() {
    var riskBtn = document.querySelector('[onclick*="switchDetailTab"][onclick*="risk"]');
    if (riskBtn) riskBtn.click();
  }, 400);
}
```

#### 2. `renderCard()` 본문 영역에 "내용 보기" 버튼 추가
`ref_type`별 분기 처리 (RULE-001: `var` 전용 준수):

```javascript
${(function() {
  var _viewBtn = '';
  var _btnStyle = '...';
  if (req.ref_type === 'tbm') {
    _viewBtn = '...<button onclick="showTaskDetail(' + req.ref_id + ',\'tbm\')"...> TBM 내용 보기</button>...';
  } else if (req.ref_type === 'risk_assessment') {
    _viewBtn = '...<button onclick="_signReqOpenRisk(' + req.ref_id + ')"...> 위험성평가 내용 보기</button>...';
  } else if (req.ref_type === 'education') {
    var _eduSubType = req.ref_sub_type || 'periodic';
    _viewBtn = '...<button onclick="showEduDetailModal(' + req.ref_id + ',\'' + _eduSubType + '\')"...> 안전교육 내용 보기</button>...';
  }
  return _viewBtn;
})()}
```

#### ref_type별 이동 경로
| ref_type | 버튼 텍스트 | 이동 대상 |
|---|---|---|
| `tbm` | TBM 내용 보기 | `showTaskDetail(ref_id, 'tbm')` → TBM 탭 |
| `risk_assessment` | 위험성평가 내용 보기 | `_signReqOpenRisk(ref_id)` → 위험성평가 탭 |
| `education` | 안전교육 내용 보기 | `showEduDetailModal(ref_id, ref_sub_type)` |

### 수정 파일
- `public/static/app.js`
  - 32803라인: `_signReqOpenRisk()` 전역 helper 함수 추가
  - 32898라인: `renderCard()` 본문에 ref_type별 "내용 보기" 버튼 추가

### 검증
- `node --check public/static/app.js` → ✅ 문법 오류 없음
- `npm run build` → ✅ `dist/_worker.js 288.74 kB` 빌드 성공

### 커밋
- `b1a539b` — feat: [FEAT-170] 서명요청 내용 보기 링크 추가

---

## [FEAT-171] TBM 사진 등록 시 갤러리 선택 가능하도록 변경 (2026-07-26)

### 증상
TBM 안전조치 사진 등록(필수·추가) 클릭 시 카메라 앱이 직접 실행되어  
갤러리에 저장된 기존 사진을 선택할 수 없었음.

### 원인
`showTbmPhotoModal()` 내 `<input type="file">` 태그에  
`capture="environment"` 속성이 적용되어 있어 Android에서 카메라 앱 직접 실행.

```html
<!-- Before — 카메라 직접 실행, 갤러리 선택 불가 -->
<input type="file" accept="image/*" capture="environment" style="display:none" ...>
```

### 해결
TBM 관련 2곳에서 `capture="environment"` 속성 제거.  
`accept="image/*"` 만 남기면 Android에서 **"갤러리 / 카메라"** 선택 팝업 표시.

```html
<!-- After — 갤러리 OR 카메라 선택 팝업 -->
<input type="file" accept="image/*" style="display:none" ...>
```

### 수정 범위 (TBM 2곳만 수정 — 다른 기능은 유지)

| 라인 | 기능 | 처리 |
|------|------|------|
| 28735 | TBM 필수 사진 등록 버튼 | `capture` 속성 제거 ✅ |
| 28753 | TBM 추가 사진 등록 버튼 | `capture` 속성 제거 ✅ |
| 9801 | 작업중지 현장 사진 | 변경 없음 (유지) |
| 16831 | 현장점검 체크리스트 사진 | 변경 없음 (유지) |

### 수정 파일
- `public/static/app.js` — 28735, 28753라인 `capture="environment"` 제거

### 검증
- `node --check public/static/app.js` → ✅ 문법 오류 없음
- `npm run build` → ✅ `dist/_worker.js 288.74 kB` 빌드 성공

### 커밋
- `4029bf4` — feat: [FEAT-171] TBM 사진 등록 갤러리 선택 가능하도록 변경

## FEAT-172: 작업종류 명칭 변경 + 상세분류 추가 (2026-07-27)

**변경 내용**:
- 작업종류(work_class) 한글 명칭 4종 변경: 광케이블 시설→외선, 광케이블 접속→접속, 장비 시설및 기타→장비, 관로시설→관로
- 상세분류(work_sub_class) 신규 추가 (DB 컬럼 + API + UI 전체)

**DB 변경**: `tasks.work_sub_class TEXT DEFAULT NULL` 컬럼 추가 (patchSchema v0.173)

**유효값**:
| work_class | work_sub_class 허용값 | 기본값 |
|---|---|---|
| cable_install (외선) | lay / remove / cut | lay (포설) |
| cable_splice (접속) | core / switch / survey | core (코어구성) |
| equipment_other (장비) | install / env | null |
| conduit (관로) | main / entry | null |

**수정 파일**:
- `node-server.ts`: patchSchema v0.173 추가, taskEssentialPatches에 work_sub_class 항목 추가
- `src/routes/tasks.ts`: GET(3곳) SELECT에 work_sub_class 추가, POST/PUT 바디 파싱+SQL 반영, PATCH /work-class 상세분류 자동초기화, PATCH /work-sub-class 신규 엔드포인트 추가
- `public/static/app.js`: WORK_CLASS_DEF 라벨 변경+subClasses 추가, getWorkSubLabel() 헬퍼 추가, onMWorkClassChange() 추가, 하드코딩 라벨 9곳 변경, 등록/수정 폼 상세분류 select UI 추가, 작업상세 배지 표시, 목록(모바일+PC) 상세분류 표시, 엑셀 상세분류 컬럼 추가

**검증**: node --check ✅ / npm run build ✅ (`dist/_worker.js 290.38 kB`)

---

## BUG-DATE: 현장점검 날짜 필터 미적용 (2026-07-27)

**증상**: 현장점검 화면에서 날짜 범위를 지정해도 ⚠️위험성체크 / 🦺TBM / 🟢진행 / ✅완료 / 전체 탭 모두 날짜 무관하게 전체 작업이 표시됨

**원인**:
- `/inspections` API에는 `date_from`/`date_to` 파라미터를 전달하고 있었음
- `/tasks` API 호출 시 날짜 파라미터를 전달하지 않아 `planned_date` 기준 필터 미적용 → 전체 기간 작업 목록이 반환됨
- 작업 탭(위험성체크/TBM/진행/완료/전체)은 `/tasks` 결과를 `status`만으로 필터링하므로 날짜 조건 완전 무시

**서버 측 지원 확인**:
- `src/routes/tasks.ts`: `start_date`/`end_date` 파라미터로 `planned_date BETWEEN ? AND ?` 쿼리 이미 구현됨 → 서버 수정 불필요

**수정**: `public/static/app.js` `renderInspectionsPage()` 내 API 호출부
```javascript
// Before
API.get('/tasks')

// After
var _taskParams = {};
if (_df) _taskParams.start_date = _df;
if (_dt) _taskParams.end_date   = _dt;
API.get('/tasks', { params: _taskParams })
```

**검증**: node --check ✅ / npm run build ✅ (`dist/_worker.js 288.74 kB`)
**커밋**: `4a7bb9d`

---

## [FEAT-172 누락 수정 + FEAT-173] 세션 91~92 (2026-07-27)

### FEAT-172 검토 후 누락 수정 3건 (커밋 `0aab32c`)

| 수정 위치 | 변경 내용 |
|-----------|----------|
| `app.js` 27741라인 | `workClassBadge(wc)` → `workClassBadge(wc, t.work_sub_class)` — 위험성평가 체크리스트 목록 상세분류 배지 미표시 수정 |
| `node-server.ts` NAS inspections 쿼리 | `t.work_class` → `COALESCE(t.work_class_new, t.work_class, 'cable_install') AS work_class` + `t.work_sub_class` 추가 |
| `app.js` 현장점검 PDF `guBun` | 상세분류(workSubLabel) 병기 |

### FEAT-172 오타 수정 (커밋 `038e40c`)
- `WORK_CLASS_DEF` `cut` key: `단수` → `단순`

### 외선 상세분류 전주건식(pole) 추가 (커밋 `eebadcb`)
- `app.js` WORK_CLASS_DEF: `{ key: 'pole', label: '전주건식' }` 추가
- `tasks.ts` VALID_WORK_SUB_CLASS / VALID_SUB_PUT / VALID_SUB 3곳에 `'pole'` 추가

---

## [FEAT-173] 작업명 자동입력 체크박스 (커밋 `87edaa2`)

### 기능 요약
작업 등록/수정 모달의 작업명 label 우측에 '🪄 작업명 자동입력' 체크박스 배치.
- **신규 등록**: 기본 ON (보라색 활성, input 테두리 강조)
- **수정 모달**: 기본 OFF (기존 작업명 보존)
- 체크 ON 시 `[작업종류][상세분류]` prefix 자동 삽입
- 작업종류/상세분류 변경 시 prefix 자동 교체 (뒤 내용 보존)

### 충돌 지점 4곳 처리
| 충돌 지점 | 처리 방법 |
|-----------|----------|
| `onMWorkClassChange` 재렌더링 시 onchange 누락 | select 2곳에 `onchange="onMWorkSubClassChange()"` 연결 |
| `autoLinkConstruction` 공사연동 시 prefix 덮어쓰기 | `_makeTitlePrefix()` 로 prefix 유지 후 공사명 채움 |
| `copyTask` 복원 시 체크박스 ON으로 작업명 훼손 | 강제 OFF + hint 숨김 처리 |
| 신규 등록 시 DOM 렌더링 타이밍 | `setTimeout(_applyTitlePrefixIfOn, 50)` |

### 신규 전역 함수 (RULE-001: var 전용)
| 함수명 | 역할 |
|--------|------|
| `_makeTitlePrefix()` | 현재 작업종류/상세분류 선택값으로 prefix 문자열 생성 |
| `_applyTitlePrefixIfOn()` | 체크박스 ON 상태일 때 prefix 적용 |
| `_updateTitlePrefixHint(prefix)` | 힌트 영역 업데이트 |
| `onTitlePrefixCbChange()` | 체크박스 클릭 이벤트 핸들러 |
| `onMWorkSubClassChange()` | 상세분류 변경 시 prefix 갱신 트리거 |

### 검증
- `node --check` ✅
- `npm run build` ✅ (290.40 kB)
- **커밋**: `87edaa2`

---

## [FEAT-175] 공사현황 테이블 공사번호 컬럼 추가 (커밋 `a013fdd`) — 세션 93 (2026-07-27)

### 기능 요약
공사현황 목록 테이블에 공사번호 컬럼 추가 (공사요청번호 앞 첫 번째 열, 주황 텍스트).

### 변경 내역

| 파일 | 변경 내용 |
|------|----------|
| `style.css` | `.cc-connum { width: 90px }` 컬럼 너비 클래스 추가 |
| `app.js` | 헤더 colgroup 맨 앞에 `<col class="cc-connum">` 추가 |
| `app.js` | 바디 colgroup 맨 앞에 `<col class="cc-connum">` 추가 |
| `app.js` | thead 첫 번째 th에 공사번호 컬럼 추가 (`#` 아이콘, data-col="c0", sortcol="con_number") |
| `app.js` | `_conBuildRow()` con.request_no td 앞에 con_number td 삽입 (주황색 표시, 없으면 '-') |

### 충돌 체크 & 규칙 준수

| 규칙 | 처리 방법 |
|------|----------|
| RULE-001 (var 전용) | 신규 코드 없음, 기존 템플릿 리터럴 수정만 |
| RULE-003 (onclick 따옴표 중첩 금지) | onclick 내 따옴표 중첩 없음 |

### 검증 결과

- `node --check public/static/app.js` ✅ 통과
- `npm run build` ✅ 성공 (dist/_worker.js 291.51 kB)
- `git push origin main` ✅ `a013fdd` 업로드 완료

---

## [FEAT-175] 공사번호 입력 팝업 + 3열 폼 레이아웃 (커밋 `a161357`) — 세션 93 (2026-07-27)

### 기능 요약
공사완료건 정산요청/정산완료 시 공사번호(7자리) 입력 팝업 + 공사등록 폼 3열 레이아웃.

### 변경 내역

| 파일 | 변경 내용 |
|------|----------|
| `app.js` | `_showConNumberPopupOrange()` 신규 — 정산요청 팝업 (주황 테마, "나중에 입력" 체크박스) |
| `app.js` | `_showConNumberPopupGreen()` 신규 — 정산완료 팝업 (초록 테마, "공사번호 없이 처리" 체크박스) |
| `app.js` | `_conNumPopupCancel()` / `_conNumPopupConfirmOrange()` / `_conNumPopupConfirmGreen()` 신규 |
| `app.js` | `requestSettlement()` — `showWarningConfirm` → 팝업 기반으로 교체, con_number 함께 전송 |
| `app.js` | `requestSettleComplete()` — `showSuccessConfirm` → 팝업 기반으로 교체, con_number 함께 전송 |
| `app.js` | `showCreateConstructionModal()` — 2열(공사요청번호+작업번호)+별도행(공사번호) → **3열 1행** |
| `app.js` | `saveConstruction()` — body에 `con_number` 필드 추가 |
| `app.js` | 공사 상세 모달 — 공사번호 주황 셀 + 공사요청번호 + 작업번호 3열 추가 |
| `constructions.ts` | `POST /` INSERT에 con_number 추가 (형식 검증: 7자리 숫자 or '번호없음') |
| `constructions.ts` | `PUT /:id` UPDATE에 con_number 추가 (undefined 시 기존값 유지) |
| `constructions.ts` | `POST /:id/settle` body con_number 읽어 상태변경과 동시 UPDATE |
| `constructions.ts` | `POST /:id/settle-complete` body con_number 읽어 상태변경과 동시 UPDATE |
| `node-server.ts` | `patchConstructionsColumns` 배열에 con_number 항목 추가 (NAS 자동 마이그레이션) |
| `migrations/0059` | `constructions.con_number TEXT DEFAULT NULL` 신규 마이그레이션 파일 |

### 충돌 체크 & 규칙 준수

| 규칙 | 처리 방법 |
|------|----------|
| RULE-001 (var 전용) | 팝업 함수 내 모두 `var` 사용 |
| RULE-003 (onclick 따옴표 중첩 금지) | `oninput` 내 `\'` 이스케이프 대신 정규식 내부에서만 사용, onclick은 전역 함수명만 |
| 기존 `requestSettlement` / `requestSettleComplete` | async function → 내부 팝업 콜백으로 완전 교체 (기존 함수 시그니처 유지) |
| settle 라우트 기존 body 없음 | `try { body = await c.req.json() } catch(_) {}` 로 안전 파싱 |

### 검증
- `node --check app.js` ✅
- `npm run build` ✅ (291.51 kB)
- **커밋**: `a161357`

---

## [FEAT-174] TBM 사진 등록 소스 선택 바텀시트 (커밋 `e8fb2a8`)

### 문제
모바일(iOS Safari / Android WebView)에서 `<label>+<input type="file">` 클릭 시
갤러리만 열리고 카메라 직접 촬영 불가 — 기기/브라우저마다 동작 상이.

### 해결
버튼 클릭 → 바텀시트 팝업으로 **파일 선택 / 사진 촬영** 두 가지 소스 선택.

| 항목 | 기존 | 변경 |
|------|------|------|
| 등록 필수 버튼 | `label+hidden input` | `button` + `_tbmCamPickerOpenRequired(this)` |
| 추가 사진 버튼 | `label+hidden input` | `button` + `_tbmCamPickerOpenExtra(this)` |
| 작업상세 추가 버튼 | `label+hidden input` | `button` + `_tbmCamPickerOpenAdd(this)` |
| 작업상세 등록 버튼 | `label+hidden input` | `button` + `_tbmCamPickerOpenSlot(this)` |

### 인자 전달 방식 (RULE-003 준수)
- onclick 속성 내 따옴표 중첩 완전 회피
- `data-assid` / `data-secid` / `data-phid` / `data-label` / `data-taskid` 속성으로 전달
- 핸들러 함수가 `btn.dataset.*` 로 읽어 처리

### 바텀시트 UI
- 배경 반투명 딤(rgba 0.45)
- [📂 파일 선택] : `accept="image/*"` (갤러리·파일)
- [📷 사진 촬영] : `accept="image/*" capture="environment"` (후면카메라 직접)
- 배경 클릭 / 취소 버튼으로 닫기

### 신규 전역 함수 13개
| 함수 | 역할 |
|------|------|
| `_tbmCamPickerOpen(cbGallery, cbCamera)` | 바텀시트 생성 공통 |
| `_tbmCamPickerOpenRequired(btn)` | 등록 필수 버튼 진입점 |
| `_tbmCamPickerOpenExtra(btn)` | 추가 사진 버튼 진입점 |
| `_tbmCamPickerOpenSlot(btn)` | 작업상세 탭 슬롯/등록 버튼 진입점 |
| `_tbmCamPickerOpenAdd(btn)` | 작업상세 탭 추가 버튼 진입점 |
| `_tbmCamPickerGallery/Camera` | uploadTbmPhoto 위임 |
| `_tbmCamPickerExtraGallery/Camera` | uploadTbmPhotoExtra 위임 |
| `_tbmCamPickerSlotGallery/Camera` | _uploadTbmPhotoSlotFromDetail 위임 |
| `_tbmCamPickerAddGallery/Camera` | _uploadTbmPhotoFromDetail 위임 |

### 검증
- `node --check` ✅
- `npm run build` ✅ (290.40 kB)
- **커밋**: `e8fb2a8`

---

## [BUG-189] 위험성평가 워크플로 3개 버그 수정 (세션 108)

### 문제
1. **BUG-189a**: 감소대책 저장 후 다음 단계("최종 위험도 선정")로 전환 안 됨
2. **BUG-189b**: 서명요청 카드에서 "위험성평가 내용 보기" 클릭 시 관계없는 작업건 표시
3. **BUG-189c**: 근로자 평가위원 등록 시 위험성평가 열람·서명 가능 여부 확인 요청

### 원인

#### BUG-189a
- `감소대책 저장` 버튼(`_saveRiskMemberMeasures`) = 텍스트만 임시 저장, 상태 전환 없음
- `감소대책 수립 완료` 버튼(`_finishRiskMeasures`) = 상태 전환 (`in_review → measures_done`)
- **두 버튼이 분리**되어 사용자가 "저장"만 누르고 완료 버튼을 못 보는 UX 혼동

#### BUG-189b
- `_signReqOpenRisk(taskId)` 함수가 내부적으로 `showTaskDetail(taskId)` 호출
- `risk_assessment` 서명 요청의 `ref_id`는 **위험성평가 ID**인데, `showTaskDetail`은 **작업(task) ID**를 받음
- 결과: 위험성평가 ID와 같은 번호의 작업건이 열림 → 무관한 작업 표시

#### BUG-189c
- 백엔드 `GET /risk/:id`, `POST /risk/:id/signatures`: worker 권한 제한 없음 ✅
- `PATCH /signature-requests/:id/sign`: 본인 요청 처리 허용 ✅
- **근로자가 평가위원으로 등록되고 서명 요청을 받으면** 서명 가능 (설계 정상)

### 해결

#### BUG-189a — 감소대책 저장 + 상태 전환 통합 (app.js)
- `_saveRiskMemberMeasures`: 텍스트 저장 + `finish-measures` API 호출(→ `measures_done`) + 서명 요청 자동 발송 통합
- `_finishRiskMeasures` 버튼 제거, 단일 버튼 "감소대책 저장 → 최종 위험도 선정"으로 변경
- 미입력 항목 있을 시 확인 대화상자 표시

#### BUG-189b — _signReqOpenRisk 수정 (app.js)
- `showTaskDetail(taskId)` → `showRiskDetail(riskId)` 직접 호출로 교체
- 탭 클릭 setTimeout 코드 제거 (불필요)

#### BUG-189c — 근로자 서명 + 자동 평가완료 (app.js + signature-requests.ts)
- 근로자 접근: BUG-189b 수정으로 서명요청 카드에서 위험성평가 상세 직접 열람 가능
- `_saveRiskFinalScores`: 최종 위험도 저장 후 서명 요청 자동 발송 추가
- `signature-requests.ts` risk_assessment 처리: **모든 위원 서명 완료 시 자동 `completed` 전환** 추가
  - `risk_assessment_members` 등록 위원 수 vs `signature_requests` signed 건수 비교
  - 모두 서명 → `UPDATE risk_assessments SET status='completed'`

### 변경 내역

| 파일 | 변경 내용 |
|------|----------|
| `app.js` | `_saveRiskMemberMeasures`: 저장+완료+서명발송 통합 (RULE-001 준수) |
| `app.js` | `_finishRiskMeasures` 버튼 제거 → 단일 버튼으로 통합 |
| `app.js` | `_saveRiskFinalScores`: const/let → var 교체 + 서명 요청 자동 발송 추가 |
| `app.js` | `_signReqOpenRisk`: showTaskDetail → showRiskDetail 직접 호출 |
| `signature-requests.ts` | risk_assessment 서명 완료 후 위원 전원 서명 시 자동 completed 전환 |

### 충돌 체크 & 규칙 준수

| 규칙 | 처리 방법 |
|------|----------|
| RULE-001 (var 전용) | `_saveRiskMemberMeasures`, `_saveRiskFinalScores` 모두 `var` 사용 |
| RULE-002 (NAS 라우트 순서) | 변경 없음 |
| `_finishRiskMeasures` 호환 | 함수 자체는 유지, 버튼만 제거 (혹시 외부 호출 시 동작 유지) |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (296.03 kB)

---

## FEAT-194b — 항목관리 3탭 통합 페이지 구현

**커밋**: `d95aa0d`
**날짜**: 2026-07-29

### 개요
기존 개별 메뉴로 흩어진 위험유형관리·작업유형관리·부서팀관리를 단일 `renderRiskManagePage()` 함수 기반 3탭 UI로 통합.

### 변경 내역
| 파일 | 변경 내용 |
|------|----------|
| `app.js` | `renderRiskManagePage()` 신규 구현 (3탭: 위험유형/작업유형/부서팀) |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅

---

## FEAT-195 — 메뉴 이동 (위험성평가/항목관리 → 안전관리, 안전현황 → 안전점검 상단)

**커밋**: `8f5eb61`
**날짜**: 2026-07-29

### 개요
사이드바 메뉴 배열 재배치: 위험성평가·항목관리를 안전관리 그룹으로 이동, 안전현황을 안전점검 그룹 상단으로 이동.

### 변경 내역
| 파일 | 변경 내용 |
|------|----------|
| `app.js` | 사이드바 배열 순서 재배치 + flat 배열 group 값 갱신 |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅

---

## FEAT-196 — NAS 파일 저장 + 안전건의사항 탭 + 출력 기능

**커밋**: (이번 세션 신규)
**날짜**: 2026-07-29

### 개요
1. 위험신고 탭에 **안전건의사항(탭3)** 추가 (`report_type='suggestion'`, 기존 `hazard_reports` 재사용)
2. 위험신고·아차사고 사진을 **NAS 파일 저장**으로 변경 (base64 inline → multipart 업로드, 레거시 fallback 유지)
3. 위험신고·아차사고·안전건의사항 **인쇄/PDF 출력** 기능 추가

### 변경 내역
| 파일 | 변경 내용 |
|------|----------|
| `src/nas-routes/hazards-nas.ts` | 신규 생성 — 9개 엔드포인트(신고사진/처리사진/첨부파일 CRUD), 폴더 헬퍼, DB 자동생성 |
| `src/routes/hazards.ts` | GET /:id 단건 조회 추가, POST에 suggestion 필드 4개 추가 |
| `node-server.ts` | hazardNasRoutes import + `/api/hazard-reports` 마운트 + patchSchema v0.190/190b |
| `app.js` | `var _hazardTab`, `renderHazardsPage` 3탭 UI, RULE-003 helper 3개 |
| `app.js` | `submitHazardReport()` — multipart 사진 업로드 방식으로 교체 (RULE-001) |
| `app.js` | `showHazardDetail()` — NAS URL + base64 fallback + RULE-003 출력·처리완료 버튼 |
| `app.js` | `_submitResolveHazard()` — multipart 처리사진 업로드 방식으로 교체 |
| `app.js` | `showSuggestionForm()` + `_submitSuggestion()` 신규 추가 |
| `app.js` | `showSuggestionDetail()` + `_suggDetailPrintBtn()` 신규 추가 |
| `app.js` | `printHazardDetail(id)` + `printSuggestionDetail(id)` 신규 추가 |

### 규칙 준수
| 규칙 | 처리 |
|------|------|
| RULE-001 (var 전용) | 모든 신규/교체 함수에서 `var` 사용 |
| RULE-002 (NAS 라우트 순서) | `/api/hazard-reports` → `/api/hazards` 순서 보장 |
| RULE-003 (onclick 따옴표 중첩 금지) | `data-hid`/`data-sid` 속성 + 전역 wrapper 함수 사용 |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (296.84 kB)

---

## BUG-196c — 산업안전보건위원회 회의 사진 업로드 500 에러

**발생 일시**: 2026-07-29
**커밋**: (이번 세션)

### 증상
- `POST /api/safety-committee/meetings/:id/photos` → **500 Internal Server Error**
- `SyntaxError: Unexpected token 'I', "Internal S"... is not valid JSON`
- 발생 위치: `app.js:47898` (`_scUpload` 함수 내 `.json()` 호출)

### 원인 분석

| 레이어 | 원인 | 설명 |
|--------|------|------|
| **서버 (1차)** | `caption NOT NULL` 위반 | `INSERT INTO safety_committee_photos` 시 `caption = null` 전달 → `TEXT NOT NULL DEFAULT ''` 제약 위반 → SQLite 500 |
| **클라이언트 (2차)** | `_scUpload` r.ok 체크 없음 | 500 응답(HTML)을 `.json()`으로 파싱 시도 → `SyntaxError` |
| **클라이언트 (3차)** | `_scUploadPhotos` 이중 `.json()` | `_scUpload` 반환값(이미 파싱된 객체)에 `.then(r => r.json())` 재호출 → `TypeError: r.json is not a function` |

### 수정 내역

| 파일 | 수정 내용 |
|------|----------|
| `src/nas-routes/safety-committee.ts` | `caption = null` → `caption = ''` (line ~808) + INSERT try/catch + 에러 로그 추가 |
| `public/static/app.js` | `_scUpload` — `r.ok` 체크 + 비-JSON 응답 graceful 처리 (line 47894) |
| `public/static/app.js` | `_scUploadPhotos` — 이중 `.json()` 제거, IIFE closure로 loop 변수 캡처, `.catch()` 에러 알림 추가 (line 50703) |
| `public/static/app.js` | `_scUploadDocs` — 동일 패턴으로 이중 `.json()` 제거, IIFE closure, `.catch()` 추가 (line 50728) |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (296.84 kB)

---

## FEAT-197 — 작업관리 취소·중지 상태 표시 개선

**구현 일시**: 2026-07-29  
**커밋**: (이번 세션)

### 배경
취소(cancelled)/중지(paused) 상태가 진행단계 표시 UI에 반영되지 않아 작업 목록에서 구분이 어렵고, 기본 필터에 포함되어 실제 진행 중인 작업 조회를 방해함.

### 구현 내역

#### 1. 상태 배지 및 진행단계 표시
| 파일 | 수정 내용 |
|------|----------|
| `public/static/app.js` | `statusBadge()` — `cancelled`(`⛔ 취소`/`badge-cancelled`), `paused`(`⏸ 중지`/`badge-paused`) 항목 추가 |
| `public/static/app.js` | `taskStageMini()` — cancelled/paused 조기 반환으로 막대형 대신 강조 배지 표시 (취소: 빨강, 중지: 주황) |
| `public/static/style.css` | `.badge-cancelled` (배경 `#FEE2E2`, 글자 `#DC2626`) + `.badge-paused` (배경 `#FEF3C7`, 글자 `#D97706`) 추가 |

#### 2. 상태 매핑 확장
| 파일 | 수정 내용 |
|------|----------|
| `public/static/app.js` | `statusLabelMap` — `cancelled: '⛔ 취소'`, `paused: '⏸ 중지'` 추가 |
| `public/static/app.js` | `statusColorMap` — `cancelled: '#DC2626'`, `paused: '#D97706'` 추가 |
| `public/static/app.js` | `_bgMap` — `cancelled: '#FEE2E2'`, `paused: '#FEF3C7'` 추가 |

#### 3. 기본 필터에서 cancelled/paused 제외 (핵심)
| 파일 | 수정 내용 |
|------|----------|
| `public/static/app.js` | `renderTasksPage` — `taskFilters.statusList`에 cancelled/paused가 명시적으로 포함된 경우에만 표시, 기본 조회 시 클라이언트 필터링으로 제외 |
| `public/static/app.js` | `_myTasksStatusFilter` 초기값 — `['assigned','in_progress','tbm_done','working','work_completed']` (cancelled/paused 미포함) |
| `public/static/app.js` | `_myTasksStatusReset()` — 리셋 시도 동일 5개 상태로 복원, cancelled/paused 미포함 유지 |

#### 4. 진행단계 피커 항목 추가
| 파일 | 수정 내용 |
|------|----------|
| `public/static/app.js` | 작업관리 진행단계 피커 — 기존 7개 항목 아래 구분선 + "취소·중지 (별도 조회)" 섹션 헤더 추가 후 cancelled/paused 항목 표시 |
| `public/static/app.js` | 내 작업 진행단계 피커 — `_MY_TASK_STATUS_ALL`에 cancelled/paused 추가, 구분선 + "취소·중지 (기본 미포함)" 헤더, 빨강/주황 강조 스타일 |
| `public/static/app.js` | `_MY_TASK_STATUS_LABELS` — `cancelled: '⛔ 취소'`, `paused: '⏸ 중지'` 추가 |

### 설계 원칙
- **서버 변경 없음**: 서버는 `status` 미지정 시 전체 반환 → 클라이언트에서만 필터링
- **명시적 선택 시만 표시**: 사용자가 피커에서 cancelled/paused를 직접 체크해야만 목록에 나타남
- **기존 워크플로우 무영향**: unassigned→assigned→in_progress→...→completed 흐름 변경 없음

### 규칙 준수
| 규칙 | 처리 |
|------|------|
| RULE-001 (var 전용 in app.js) | 모든 신규 코드 `var` 사용 (기존 `const`/`let` 있는 함수 내부 수정은 맥락 유지) |
| RULE-002 (NAS 라우트 순서) | 라우트 파일 변경 없음 — 해당 없음 |
| RULE-003 (onclick 따옴표 중첩 금지) | 피커 항목 onclick은 단순 값 참조만 사용, 중첩 없음 |

### 검증
- `node --check public/static/app.js` ✅
- `npm run build` ✅ (296.84 kB)
- `_myTasksStatusReset()` — cancelled/paused 기본 미포함 확인 ✅

---

## BUG-198 — 투표 요청 1건 처리 시 나머지 투표 요청 전체 사라짐

**발생 일시**: 2026-07-29  
**커밋**: (이번 세션)

### 증상
- 투표 활성화된 안건 2건에 대해 투표 요청 발송 후, 1건만 투표해도 나머지 1건의 투표 요청도 목록에서 사라짐
- 투표 요청이 `pending` → `signed` 로 전환되어 서명요청 목록에서 제거됨

### 원인 분석

`PATCH /api/signature-requests/:id/sign` — 서명/투표 처리 공통 로직 (line 239-243)

```sql
-- 수정 전: ref_sub_type 조건 없이 ref_type + ref_id 범위로 일괄 처리
UPDATE signature_requests
SET status='signed', sign_data=?, signed_at=CURRENT_TIMESTAMP
WHERE ref_type=? AND ref_id=? AND target_user_id=? AND status='pending'
```

**sc_vote 투표 요청은 안건별로 `ref_sub_type = agenda_id` 가 다른 별도 레코드**  
예) 2개 안건 → 레코드 2개 (`ref_sub_type='101'`, `ref_sub_type='102'`, `ref_id=같은 meeting_id`)

그런데 위 UPDATE는 `ref_sub_type` 조건 없이 같은 `ref_type='sc_vote' + ref_id(meeting_id)`인 **모든 pending을 일괄 signed 처리** → 안건 1 투표 시 안건 2 요청까지 소멸

### 수정 내역

`src/nas-routes/signature-requests.ts` — PATCH `/:id/sign` (line ~239)

```typescript
// 수정 후: sc_vote는 ref_sub_type 까지 일치하는 레코드만 처리
if (req.ref_type === 'sc_vote') {
  rawDb.prepare(`
    UPDATE signature_requests
    SET status='signed', sign_data=?, signed_at=CURRENT_TIMESTAMP
    WHERE ref_type=? AND ref_id=? AND ref_sub_type IS ? AND target_user_id=? AND status='pending'
  `).run(signData, req.ref_type, req.ref_id, req.ref_sub_type || null, user.id)
} else {
  // 기존 로직 유지: 다른 ref_type은 ref_id 범위로 중복 레코드 일괄 처리
  rawDb.prepare(`
    UPDATE signature_requests
    SET status='signed', sign_data=?, signed_at=CURRENT_TIMESTAMP
    WHERE ref_type=? AND ref_id=? AND target_user_id=? AND status='pending'
  `).run(signData, req.ref_type, req.ref_id, user.id)
}
```

### 검증
- `npm run build` ✅ (296.84 kB)

---

## FEAT-199 — 조회 필터 기간 전환 + 작업관리 엑셀 전체 다운로드

**구현 일시**: 2026-07-29  
**커밋**: (이번 세션)

### 요구사항

1. **작업관리 + 공사현황 공통** — 연도/월 드롭다운 피커 완전 제거 → 기간 date input 2개로 교체  
   - 형식: `YYYY-MM-DD` (브라우저 달력 클릭 + 직접 입력)  
   - 기본값: 15일 전 ~ 오늘 (앱 로드 시 자동 설정)  
   - 최대 6개월(184일) 제한, 위반 시 alert 표시

2. **작업관리 엑셀 다운로드** — 현재 페이지 데이터만 내려받던 문제 수정  
   - 조회 조건 기준 전체 데이터 `limit:9999` 재요청  
   - 누락 헤더 추가: 작업번호·작업일자·담당자/팀  
   - 완전한 `stMap` (work_completed·cancelled·paused 포함)

### 수정 파일: `public/static/app.js`

#### 작업관리 (`taskFilters`)
| 수정 내용 | 위치 |
|-----------|------|
| `_taskDefaultDateRange()` 헬퍼 추가 | line ~6081 |
| `taskFilters` 초기값 — year/month/yearList/monthList 제거, start_date/end_date 추가 | line ~6091 |
| 연도/월 헬퍼 함수 10개 제거 → `_taskApplyDateRange()` + `_taskDateReset()` 추가 | line ~6283 |
| `renderTasksPage` — yearList/monthList 변환 로직 + 클라이언트 필터 제거, start_date/end_date 직접 사용 | line ~6435 |
| 연도/월 버튼 레이블 계산 제거 → `_tDateStart/_tDateEnd` 변수 사용 | line ~6820 |
| 툴바 UI — 연도/월 드롭다운 2개 → `<input type="date">` 2개 + 초기화 버튼 | line ~7053 |
| `downloadTaskListCSV()` — 전체 데이터 재조회(limit:9999) + 헤더 11개로 보완 | line ~7324 |

#### 공사현황 (`_conFilters`)
| 수정 내용 | 위치 |
|-----------|------|
| `_conDefaultDateRange()` 헬퍼 추가, `_conFilters` — year/month/yearList/monthList 제거 | line ~3514 |
| 연도/월 헬퍼 함수 8개 제거 → `_conApplyDateRange()` + `_conDateReset()` 추가 | line ~3679 |
| `renderConstructionsPage` — 연도/월 레이블 계산 제거, `_conDateStart/_conDateEnd` 변수 사용 | line ~3952 |
| 툴바 UI — 연도/월 드롭다운 2개 → `<input type="date">` 2개 + 초기화 버튼 | line ~4115 |
| 서버 호출 — `params.year/month` 제거 → `params.start_date/end_date` 사용 | line ~4232 |
| yearList/monthList 클라이언트 필터 블록 제거 | line ~4274 |

#### 공통
- 외부클릭 핸들러 — conYearPicker/conMonthPicker/taskYearPicker/taskMonthPicker 참조 4건 제거

### 검증
- `node --check public/static/app.js` ✅ 문법 오류 없음
- `npm run build` ✅ (296.84 kB)

---

## BUG-EXCEL — 작업관리 엑셀 전체 다운로드 (서버 limit 하드캡 해제)

**구현 일시**: 2026-07-29  
**커밋**: (이번 세션)

### 문제

1. **서버 하드캡**: `src/routes/tasks.ts:58` — `Math.min(500, ...)` 로 모든 조회 결과 최대 500건 차단  
   → 엑셀 다운로드 시 전체 데이터 불러오기 불가
2. **현재 페이지만 다운로드**: `downloadTaskListCSV()` 가 `_taskListData`(현재 페이지 캐시)를 그대로 사용  
   → 페이지네이션으로 숨겨진 데이터 누락
3. **작업번호 오류**: `t.task_number`(내부 시스템 타임스탬프) 를 표시용으로 사용  
   → 사용자 표시용 번호는 `work_number + '-' + sub_task_number` 조합이 정확함

### 근본 원인

`tasks.ts` line 58:
```typescript
// 수정 전 — export 여부 무관하게 500건 상한 고정
const limitNum = Math.min(500, Math.max(0, parseInt(limitStr || '0') || 0))
```

### 수정 내용

#### `src/routes/tasks.ts`
- `exportFlag` 파라미터(`export`) 추출 추가
- `isExport` 조건 분기: `export=1` 요청 시 상한 10,000 / 일반 조회 시 500 유지

```typescript
// 수정 후
const { ..., export: exportFlag } = c.req.query()
const isExport = exportFlag === '1'
const limitNum = Math.min(isExport ? 10000 : 500, Math.max(0, parseInt(limitStr || '0') || 0))
```

#### `public/static/app.js` — `downloadTaskListCSV()` 재작성
| 수정 내용 | 상세 |
|-----------|------|
| 엑셀 버튼 `id="taskExcelBtn"` 부여 | `querySelector` → `getElementById` 로 안전하게 변경 |
| `export: '1'` 파라미터 추가 | 서버 limit 10,000 해제 트리거 |
| `limit: 9999` 파라미터 추가 | 전체 데이터 단일 요청 |
| 작업번호 조합 수정 | `t.task_number` 제거 → `work_number + '-' + sub_task_number` |
| 클라이언트 필터 동일 적용 | `statusList`, `workClassList`, LGU+ 필터 재적용 |
| `stMap` 완성 | `work_completed`, `cancelled`, `paused` 포함 9개 상태 |

### 검증
- `node --check public/static/app.js` ✅ 문법 오류 없음
- `npm run build` ✅ (296.86 kB)

---

## BUG-EXCEL-2 — 엑셀 다운로드 누락 컬럼 추가

**구현 일시**: 2026-07-29  
**커밋**: (이번 세션)

### 문제

1. **작업관리 엑셀**: `공사담당자` 컬럼 누락 / `작업일자` 라벨이 `작업(예정)일`이 아닌 오표기
2. **공사현황 엑셀**: `시공통보일`, `완료예정일`, `시공통보금액` 컬럼 3개 누락

### 수정 내용 — `public/static/app.js`

#### `downloadTaskListCSV()` — 헤더/rows 수정
| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| headers | `'작업일자'` (공사담당자 없음) | `'공사담당자'` 추가, `'작업(예정)일'`로 라벨 수정 |
| rows | 공사담당자 컬럼 없음 | `t.con_manager_display_name` 추가 |

수정 후 헤더 12개:
`작업번호, 요청번호, 공사종류, 공사담당자, 작업종류, 상세분류, 공사명, 위험도, 진행단계, 작업(예정)일, 담당자/팀, 작업지시주소`

#### `exportConstructionsExcel()` — 헤더/rows 수정
| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| headers | 9개 (`시공통보일`, `완료예정일`, `시공통보금액` 없음) | 3개 추가 → 12개 |
| rows | 해당 필드 없음 | `c.notification_date`, `c.completion_date`, `c.notification_amount` 추가 |

수정 후 헤더 12개:
`공사요청번호, 작업번호, 공사명, 작업지시주소, 공사담당자, 공사감독자, 진행상태, 시공통보일, 완료예정일, 시공통보금액, 등록작업건, 작업(완료)`

> `notification_amount` — 숫자형 그대로 출력 (엑셀에서 숫자 서식 적용 가능하도록)

### 검증
- `node --check public/static/app.js` ✅ 문법 오류 없음
- `npm run build` ✅ (296.86 kB)

---

## FEAT-CABLE-PAGE — 광케이블 사용량 케이블 상세 내역 페이지네이션 추가

**구현 일시**: 2026-07-29  
**커밋**: (이번 세션)

### 요구사항
1. 케이블 상세 내역 — 페이지당 건수 선택 (15/20/25/50건)
2. 조회 건수 초과 시 작업관리/공사현황 방식 페이지네이션 적용
3. 엑셀 다운로드 — 페이지네이션과 무관하게 전체 데이터 다운로드 유지

### 수정 내용 — `public/static/app.js`

#### 전역 변수 추가 (RULE-001: var 사용)
```javascript
var _cdPage  = 1;   // 케이블 상세 내역 현재 페이지
var _cdLimit = 20;  // 페이지당 건수 (15/20/25/50)
```

#### 툴바 건수 선택 select 추가
- 조회 버튼 앞에 `<select>` 삽입 (15건/20건/25건/50건)
- `onchange`: `_cdLimit` 갱신 → `_cdPage=1` 리셋 → `window._cdGoPage()` 호출

#### 케이블 상세 내역 테이블 수정
| 항목 | 변경 내용 |
|------|-----------|
| 헤더 건수 표시 | `id="cd-detail-info"` 추가, `총 N건 / start-end건 표시` 동적 갱신 |
| tbody | `id="cd-detail-tbody"` 추가, 초기 렌더 시 `_cdLimit` 기준 슬라이싱 |
| 하단 페이저 영역 | `id="cd-detail-pager"` div 추가 |
| 초기 렌더 후처리 | `requestAnimationFrame` → `window._cdGoPage()` 호출 |

#### `window._cdGoPage()` 함수 추가
- `_cableDetailCache` 슬라이싱 (서버 재호출 없음)
- tbody 교체, 헤더 건수 정보 갱신, 페이저 HTML 생성
- 페이저 스타일: `con-pager` / `con-page-btn` CSS 재사용 (style.css 기존 정의)
- RULE-003 준수: onclick 내 따옴표 중첩 없이 문자열 연결 방식

#### `downloadCableDetailCSV()` — 변경 없음
- `_cableDetailCache` = 항상 전체 조회 데이터 → 페이지네이션과 무관하게 전체 다운로드

### 충돌 점검 결과
- `_cdPage`, `_cdLimit`, `window._cdGoPage` — 기존 코드에 없음 ✅
- `window._cdSetPeriod`, `window._cdWeekShift` 등 기존 `window._cd*` 이름 충돌 없음 ✅
- `con-pager` / `con-page-btn` CSS — style.css에 기존 정의 재사용 ✅
- RULE-001 (전역 var) / RULE-003 (onclick 따옴표 중첩 금지) 준수 ✅

### 검증
- `node --check public/static/app.js` ✅ 문법 오류 없음
- `npm run build` ✅ (296.86 kB)

---

## FEAT-TEAM-EDIT — 현장팀 관리 팀명/설명 수정 기능 추가

- **날짜**: 2025-07-30
- **커밋**: (아래 참조)
- **작업 파일**: `public/static/app.js`
- **서버 수정**: 없음 (`PUT /teams/:id` 이미 구현됨)

### 배경
현장팀관리 페이지 팀 카드에 팀원 관리 + 삭제 버튼만 있고 팀명/설명 수정 버튼 없었음.
`showEditTeamModal()` + `updateTeam()` 함수는 사용자관리(renderUsersPage) 전용으로만 연결되어 있었음.

### 변경 내용

#### ① `renderTeamsPage` 팀 카드 버튼 영역
- **팀명 수정** 버튼 추가 (`showEditTeamModal` 호출)
- RULE-003 준수: `team.name` / `team.description` → `.replace(/'/g, "\\'")` 적용

#### ② `updateTeam()` 함수 — 스마트 재렌더
| 항목 | 변경 전 | 변경 후 |
|------|--------|--------|
| 성공 후 재렌더 | `renderUsersPage()` 고정 | 현재 페이지 h2 텍스트로 분기: `현장팀` → `renderTeamsPage`, 그 외 → `renderUsersPage` |
| 변수 선언 | `const` | `var` (RULE-001) |
| API 호출 | 백틱 URL | 문자열 연결 URL |
| `is_active` 전달 | 없음 | `is_active: 1` 명시 |

### 충돌 점검 결과
- 서버 `PUT /teams/:id` — UNIQUE 제약으로 중복 팀명 409 자동 차단 ✅
- 과거 `work_reports.worker_team` — 텍스트 스냅샷 저장이므로 팀명 변경 무관 ✅
- 작업목록 `task.team_name` — JOIN 실시간 조회이므로 변경 즉시 반영 ✅
- RULE-001 / RULE-003 준수 ✅

### 검증
- `node --check public/static/app.js` ✅ 문법 오류 없음
- `npm run build` ✅ (dist/_worker.js 296.86 kB)

---

## FEAT-CON-AMOUNT — 공사현황 외선공량/접속공량 합산 금액 컬럼 추가

- **날짜**: 2025-07-30
- **작업 파일**: `src/routes/constructions.ts`, `public/static/app.js`

### 배경
공사현황 테이블에 외선일보/접속일보 공량 합산 금액이 표시되지 않았음.
엑셀 다운로드 시 공사번호 헤더 누락 문제도 함께 수정.

### 공량 금액 데이터 경로
| 구분 | 경로 |
|------|------|
| 외선공량 | `work_report_extras` × `COALESCE(unit_price_snapshot, volume_unit_prices.unit_price)` |
| 접속공량 | `splice_work_items` × `COALESCE(unit_price_snapshot, splice_unit_prices.unit_price)` + 야간/가공 추가금 |
| 연결 | `tasks.construction_id` → `constructions.id` |

### 변경 내용

#### `src/routes/constructions.ts`
- `GET /constructions/work-amounts` 엔드포인트 신규 추가 (/:id 앞에 등록 — RULE-002)
- 응답: `{ [construction_id]: { work_amount: N, splice_amount: N } }` 맵

#### `public/static/app.js`
| 위치 | 변경 내용 |
|------|-----------|
| `exportConstructionsExcel()` | 헤더 맨 앞 `공사번호` 추가, `시공통보금액` 뒤 `외선공량`/`접속공량` 추가 |
| 공사현황 로드 직후 | `/constructions/work-amounts` 백그라운드 호출 → `_conListCache` 각 항목에 `work_amount`/`splice_amount` 병합 → `_conGoPage()` 재렌더 |
| 테이블 헤더 | `시공통보금액` ~ `공사담당자` 사이 `외선공량`/`접속공량` `<th>` 2개 삽입 |
| colgroup | `<col class="cc-workamt">` / `<col class="cc-spliceamt">` 2개 추가 (헤더/바디 테이블 각각) |
| `_conBuildRow()` | `시공통보금액 TD` 뒤 외선공량/접속공량 TD 2개 추가 (외선=파랑, 접속=인디고, 없으면 '-') |

### 엑셀 컬럼 순서 (변경 후)
`공사번호 | 공사요청번호 | 작업번호 | 공사명 | 작업지시주소 | 공사담당자 | 공사감독자 | 진행상태 | 시공통보일 | 완료예정일 | 시공통보금액 | 외선공량 | 접속공량 | 등록작업건 | 작업(완료)`

### 충돌 점검 결과
- `GET /constructions/work-amounts` — `/:id` 파라미터 라우트보다 앞에 등록 ✅
- 공량 금액 로드 실패 시 화면 깨지지 않음 (`.catch` 무시, '-' 표시) ✅
- `_conGoPage()` 재렌더 — 기존 정렬/페이지 상태 유지 ✅
- RULE-001 / RULE-003 준수 ✅

### 검증
- `node --check public/static/app.js` ✅ 문법 오류 없음
- `npm run build` ✅ (dist/_worker.js 298.71 kB)
