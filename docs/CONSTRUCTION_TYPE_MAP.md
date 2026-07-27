# 공사종류(construction_type) 구조 및 영향 범위 맵

> 작성일: 2026-07-27
> 목적: 공사종류 분류 변경 시 수정이 필요한 위치를 사전에 파악해두기 위한 참조 문서
> ⚠️ 현재 변경 예정 없음 — 참조용 정리

---

## 1. 현재 공사종류 목록

단일 진실 공급원: `public/static/app.js` — `CON_TYPE_DEF` 배열 (5209~5248라인)

| # | 영문키 (key) | 한글명 (label) | 비고 |
|---|---|---|---|
| 1 | `relocation`   | 지장이설 | |
| 2 | `subscription` | 청약개통 | |
| 3 | `conduit`      | 관로공사 | 구데이터에 `'관로'` 형태 존재 (레거시 호환 처리 중) |
| 4 | `environment`  | 환경공사 | |
| 5 | `separate`     | 별도사업 | |
| 6 | `other`        | 기타     | |

---

## 2. DB 저장 구조

| 테이블 | 컬럼 | 저장 형식 | 예시 |
|--------|------|-----------|------|
| `constructions` | `work_class`        | **영문키** | `relocation` |
| `tasks`         | `construction_type` | **한글명** | `지장이설` |

> 두 컬럼이 다른 형식으로 저장되므로 변환 시 주의 필요.  
> `tasks.construction_type`은 공사등록 폼의 한글 선택값이 그대로 저장됨.

---

## 3. 변경 시 수정 필요 위치

### 🔴 직접 수정 필요 (하드코딩)

#### `public/static/app.js`

| 라인 | 변수명 / 역할 | 비고 |
|------|---------------|------|
| **5209~5248** | `CON_TYPE_DEF` 배열 | **단일 진실 공급원** — 가장 먼저 수정 |
| **4273~4274** | `_conTypeKeyMap`  | 공사목록 **테이블** 행 렌더링 — CON_TYPE_DEF 미참조 하드코딩 |
| **4377~4378** | `_conTypeKeyMap3` | 공사목록 **모바일 카드** 렌더링 — CON_TYPE_DEF 미참조 하드코딩 |
| **4586~4587** | `_conTypeKeyMap2` | 공사목록 **PC 카드** 렌더링 — CON_TYPE_DEF 미참조 하드코딩 |
| **18110~18111** | `CON_TYPE_KR`   | 현장점검 **PDF 리포트** 생성 — CON_TYPE_DEF 미참조 하드코딩 |
| **5300** | `legacyNorm` (`conLabelToDef`) | 구데이터 호환 맵 (`'관로'` → `'관로공사'`) |

> ⚠️ 4273·4377·4586·18110 라인의 하드코딩 맵들은 `CON_TYPE_DEF`를 참조하지 않음.  
> `CON_TYPE_DEF`만 수정하면 이 4곳은 반영되지 않으므로 **반드시 함께 수정**해야 함.

#### `src/routes/constructions.ts`

| 라인 | 변수명 / 역할 | 비고 |
|------|---------------|------|
| **160** | `VALID_WORK_CLASS` 배열 | 공사등록 시 영문키 유효값 서버 검증. 항목 추가·삭제 시 동기화 필수 |

```typescript
// 현재값
const VALID_WORK_CLASS = ['relocation', 'subscription', 'conduit', 'environment', 'separate', 'other']
```

#### `src/routes/stats.ts`

| 라인 | 역할 | 비고 |
|------|------|------|
| **269~285** | 월별 통계 `ctStats` SQL | `'지장이설','청약개통','관로','환경공사'` **4종 고정 하드코딩** |
| **350~353** | 완료건수 통계 SQL | 동일 4종 고정 하드코딩 |

```sql
-- 현재 SQL 하드코딩 (stats.ts 269~285라인)
SELECT '지장이설' as key, 1 as ord UNION ALL
SELECT '청약개통' as key, 2 as ord UNION ALL
SELECT '관로'     as key, 3 as ord UNION ALL   -- ⚠️ '관로공사'가 아닌 '관로'
SELECT '환경공사' as key, 4 as ord
```

> ⚠️ stats.ts SQL은 6종 전체가 아닌 **4종만** 하드코딩.  
> `별도사업`, `기타`는 통계 SQL에 포함되지 않음.  
> `관로`가 `관로공사`와 불일치 — 구데이터 기준으로 작성된 것으로 추정.

#### `node-server.ts`

| 라인 | 변수명 / 역할 | 비고 |
|------|---------------|------|
| **5751~5758** | `WORK_CLASS_LABEL` 맵 + `WORK_CLASS_ORDER` 배열 | 공사 **엑셀 다운로드** 시 한글 라벨 및 출력 순서 |

```typescript
// 현재값 (node-server.ts 5751~5758라인)
const WORK_CLASS_LABEL = {
  relocation:   '지장이설',
  subscription: '청약개통',
  conduit:      '관로공사',
  environment:  '환경공사',
  separate:     '별도사업',
  other:        '기타',
}
const WORK_CLASS_ORDER = ['relocation','subscription','conduit','environment','separate','other']
```

---

### 🟢 자동 반영 (수정 불필요)

`CON_TYPE_DEF`만 수정하면 아래 영역은 자동으로 반영됨.

| 영역 | 참조 방식 |
|------|-----------|
| 공사등록 폼 select 옵션 | `conTypeSelectOptions()` → `CON_TYPE_DEF` 순회 |
| 작업등록 폼 select 옵션 | `conTypeTaskSelectOptions()` → `CON_TYPE_DEF` 순회 |
| 공사통계 화면 체크박스 필터 | `CON_TYPE_DEF.map()` 으로 렌더링 |
| 내 작업목록 공사종류 다중필터 | `CON_TYPE_DEF.map()` 으로 렌더링 |
| 통계 도넛차트 색상·범례 | `CON_TYPE_DEF.color` 자동 참조 |
| 작업상세 배지 (`WC_LABEL`) | `CON_TYPE_DEF`에서 자동 생성 |

---

## 4. 변경 유형별 체크리스트

### A. 한글명 변경 (예: `관로공사` → `관로시설`)

- [ ] `app.js` — `CON_TYPE_DEF` label 수정 (5209~5248)
- [ ] `app.js` — `_conTypeKeyMap` 수정 (4273~4274)
- [ ] `app.js` — `_conTypeKeyMap3` 수정 (4377~4378)
- [ ] `app.js` — `_conTypeKeyMap2` 수정 (4586~4587)
- [ ] `app.js` — `CON_TYPE_KR` 수정 (18110~18111)
- [ ] `app.js` — `legacyNorm` 구데이터 호환 맵 검토 (5300)
- [ ] `stats.ts` — SQL 하드코딩 한글명 수정 (269~285, 350~353)
- [ ] **DB** — `tasks.construction_type` 기존 데이터 UPDATE 필요
  ```sql
  UPDATE tasks SET construction_type = '새한글명' WHERE construction_type = '구한글명';
  ```

### B. 항목 추가 (새 공사종류 신설)

- [ ] `app.js` — `CON_TYPE_DEF`에 항목 추가 (key·label·색상 등)
- [ ] `app.js` — `_conTypeKeyMap` 추가 (4273~4274)
- [ ] `app.js` — `_conTypeKeyMap3` 추가 (4377~4378)
- [ ] `app.js` — `_conTypeKeyMap2` 추가 (4586~4587)
- [ ] `app.js` — `CON_TYPE_KR` 추가 (18110~18111)
- [ ] `constructions.ts` — `VALID_WORK_CLASS`에 영문키 추가 (160라인)
- [ ] `node-server.ts` — `WORK_CLASS_LABEL` + `WORK_CLASS_ORDER` 추가 (5751~5758)
- [ ] `stats.ts` — 필요 시 통계 SQL에 항목 추가 (269~285, 350~353)

### C. 항목 삭제

- [ ] A 항목 추가 체크리스트 전체 역방향 수행
- [ ] **DB** — 해당 종류로 등록된 기존 공사/작업의 처리 방침 결정  
  (삭제 또는 `other(기타)`로 마이그레이션)
- [ ] `stats.ts` — SQL에서 해당 항목 제거

### D. 영문키 변경 (⚠️ 위험도 높음)

- [ ] A·B·C 체크리스트 전체 수행
- [ ] **DB** — `constructions.work_class` 기존 데이터 UPDATE
  ```sql
  UPDATE constructions SET work_class = '새영문키' WHERE work_class = '구영문키';
  ```
- [ ] `constructions.ts` — `VALID_WORK_CLASS` 영문키 교체

---

## 5. 기타 참고사항

- `work-reports.ts`, `splice-reports.ts`: `construction_type` 컬럼을 **필터 조건**으로 사용.  
  한글명이 바뀌면 기존 필터 파라미터와 불일치 발생 가능 — 조회 테스트 필요.
- `stats.ts` SQL의 `'관로'` 항목은 구데이터 기준으로 보임. `'관로공사'`와 **불일치 상태** — 현재 통계에서 관로공사 건수가 누락될 수 있음. (별도 확인 필요)
- 공사통계 기본 선택값: `let _csWorkClasses = ['relocation']` (지장이설만 기본 선택 — app.js 40382라인)
