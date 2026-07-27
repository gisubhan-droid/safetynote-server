# 작업종류 분류 구조 및 영향 범위 맵

> 작성일: 2025-07-27 | 세션 91
> 목적: 작업종류(work_class) 분류 수정 시 영향 파일·위치 전체 파악을 위한 참조 문서

---

## 1. 이중 체계 구조 개요

이 프로젝트의 "작업종류"는 **완전히 다른 두 개의 체계**가 공존합니다.  
두 체계는 용도가 다르며, 수정 시 반드시 분리하여 파악해야 합니다.

```
┌─────────────────────────────────────┬─────────────────────────────────────────┐
│ 체계 A: 작업분류 (WORK_CLASS_DEF)   │ 체계 B: 체크리스트 조건부 작업유형      │
├─────────────────────────────────────┼─────────────────────────────────────────┤
│ 영문 키 4종                          │ 영문 키 6종                              │
│  cable_install                       │  bucket   (바켓차량작업)                 │
│  cable_splice                        │  pole     (전주승주)                     │
│  equipment_other                     │  rooftop  (옥상옥탑작업)                 │
│  conduit                             │  ladder   (사다리사용작업)               │
│                                      │  heavy    (중장비사용)                   │
│                                      │  confined (밀폐공간작업)                 │
├─────────────────────────────────────┼─────────────────────────────────────────┤
│ DB 컬럼: tasks.work_class_new        │ DB 컬럼: checklist_items.work_class      │
│          tasks.work_class (레거시)   │          checklist_assessments.work_class│
├─────────────────────────────────────┼─────────────────────────────────────────┤
│ 사용 화면:                           │ 사용 화면:                               │
│  - 작업등록/수정 폼 (select)         │  - 위험성평가 체크리스트 조건부 항목     │
│  - 작업목록 배지 (모바일/PC)         │  - 안전설정 work_type_safety_settings    │
│  - 작업상세 배지                     │                                          │
│  - 작업통계 도넛차트                 │                                          │
│  - 현장점검 PDF 리포트               │                                          │
│  - 엑셀 내보내기                     │                                          │
│  - 내 작업 목록 필터                 │                                          │
└─────────────────────────────────────┴─────────────────────────────────────────┘
```

> **연결 고리**: `work_type_safety_settings` 테이블이 두 체계를 연결합니다.  
> `type_key`(한글 7종) + `work_class`(체크리스트 6종 영문키)로 안전설정을 체크리스트와 매핑합니다.

---

## 2. DB 컬럼 저장 구조

### 2-1. tasks 테이블 (체계 A 저장)

| 컬럼명 | 타입 | 기본값 | 상태 | 유효값 |
|--------|------|--------|------|--------|
| `work_class` | TEXT | `'line'` | **레거시** (구버전 호환용) | line, inside, other (구 체계) |
| `work_class_new` | TEXT | `'cable_install'` | **현용** (실제 사용) | cable_install, cable_splice, equipment_other, conduit |

**조회 시 항상 COALESCE 사용:**
```sql
COALESCE(work_class_new, work_class, 'cable_install') AS work_class
```

### 2-2. checklist_items 테이블 (체계 B 저장)

| 컬럼명 | 타입 | 유효값 |
|--------|------|--------|
| `work_class` | TEXT | bucket, pole, rooftop, ladder, heavy, confined |

- 조건부 체크리스트 항목 — 해당 work_class에 속한 항목만 체크 화면에 표시

### 2-3. checklist_assessments 테이블 (체계 B 저장)

| 컬럼명 | 유효값 | 비고 |
|--------|--------|------|
| `work_class` | bucket, pole, rooftop, ladder, heavy, confined | 위험성 평가 결과 저장 |

- INSERT 시 `tasks.work_class_new` 컬럼도 함께 업데이트됨 (checklist.ts 221라인)

### 2-4. work_type_safety_settings 테이블 (연결 테이블)

| 컬럼명 | 유효값 | 비고 |
|--------|--------|------|
| `type_key` | 한글 7종 | 바켓차량작업, 전주승주, 옥상옥탑작업, 사다리사용작업, 중장비사용, 밀폐공간작업, TBM회의 |
| `work_class` | 체계 B 6종 | bucket, pole, rooftop, ladder, heavy, confined (TBM회의는 null) |

### 2-5. constructions 테이블 (별도 체계 — 공사관리)

> ⚠️ **주의**: constructions 테이블의 `work_class`는 tasks와 **완전히 다른 별도 체계**입니다.

| 컬럼명 | 유효값 | 비고 |
|--------|--------|------|
| `work_class` | relocation, subscription, conduit, environment, separate, other | 공사관리 전용 |

---

## 3. 체계 A (작업분류 4종) — 수정 필요 위치 전체 목록

### 3-1. `public/static/app.js` — 하드코딩 위치 10곳

| 라인 | 변수/함수명 | 역할 | 수정 방법 |
|------|-----------|------|-----------|
| **5313~5318** | `WORK_CLASS_DEF` 배열 | **단일 진실 공급원** — 작업분류 4종 정의 | ✅ 이 배열만 수정 → 자동 반영되는 곳 多 |
| **6348** | `wcShort` | 작업목록 모바일 카드 배지 | 별도 수정 필요 |
| **6447** | `wcShortMap2` | 작업목록 PC 테이블 배지 | 별도 수정 필요 |
| **7100** | `wcMap` | 엑셀 내보내기 열 텍스트 | 별도 수정 필요 |
| **7114~7122** | `workClassBadge()` 내 map | 작업상세 배지 HTML (색상+아이콘 포함) | 별도 수정 필요 |
| **7125~7127** | `workClassName()` 내 map | 작업분류 변경 토스트 메시지 | 별도 수정 필요 |
| **7336~7339** | `<select id="mWorkClass">` 옵션 | 작업등록/수정 폼 select | 별도 수정 필요 |
| **8636~8641** | `wcList` 배열 | 작업분류 빠른 변경 모달 버튼 | 별도 수정 필요 |
| **18099~18106** | `WC_MAP` | 현장점검 PDF 리포트 작업종류 변환 | 별도 수정 필요 (레거시 키도 포함) |
| **20769~20770** | `wcOrder`, `wcLabelMap` | 작업통계 도넛차트 | 별도 수정 필요 |

**WORK_CLASS_DEF 자동 반영 위치 (별도 수정 불필요):**
```
15682: _myTasksWcFilter = WORK_CLASS_DEF.map(...)     → 내 작업 목록 전체선택 필터
15720: WORK_CLASS_DEF.forEach(...)                     → 내 작업 목록 체크박스 렌더링
16040: WORK_CLASS_DEF.map(...)                         → 내 작업 목록 필터 드롭다운
6724:  WORK_CLASS_DEF.map(...)                         → 작업등록 모달 배지 목록
27799: wcList (체크리스트 작업분류 버튼)              → 자동 참조
```

### 3-2. 서버 파일

| 파일 | 라인 | 내용 | 수정 방법 |
|------|------|------|-----------|
| `src/routes/tasks.ts` | **1167** | `valid = ['cable_install', 'cable_splice', 'equipment_other', 'conduit']` | 키 변경/추가 시 수정 필수 |
| `src/routes/tasks.ts` | **506** | `workClass = work_class \|\| 'cable_install'` | 기본값 변경 시 수정 |
| `src/routes/tasks.ts` | **688** | `finalWorkClass = work_class \|\| ... \|\| 'cable_install'` | 기본값 변경 시 수정 |
| `src/routes/tasks.ts` | **61, 79, 408, 675, 1106** | COALESCE fallback `'cable_install'` | 기본값 변경 시 수정 (5곳) |
| `node-server.ts` | **505** | `work_class_new TEXT DEFAULT 'cable_install'` | DB 스키마 기본값 변경 시 수정 |

### 3-3. 영향 없는 파일 (동적 집계 — 하드코딩 없음)

| 파일 | 이유 |
|------|------|
| `src/routes/stats.ts` | COALESCE 기반 동적 집계 — DB에 있는 값 그대로 집계 |
| `src/routes/inspections.ts` | work_class 직접 참조 없음 |
| `src/nas-routes/work-reports.ts` | `construction_type AS work_class` 별칭 사용 (실제 work_class_new와 무관) |

---

## 4. 체계 B (체크리스트 조건부 유형 6종) — 수정 필요 위치

### 4-1. `public/static/app.js`

| 라인 | 변수명 | 역할 |
|------|--------|------|
| **12620~12626** | `conditionalClassMap` | 영문키 → 한글명 맵 (체크리스트 화면) |
| **12627** | `conditionalClasses` | 조건부 유형 Set (조건부 항목 표시 여부 판별) |

### 4-2. 서버 파일

| 파일 | 라인 | 내용 |
|------|------|------|
| `src/routes/checklist.ts` | **10** | `CONDITIONAL_CLASSES = ['bucket','pole','rooftop','ladder','heavy','confined']` |
| `node-server.ts` | **5663** | `_allClasses = ['bucket','pole','rooftop','ladder','heavy','confined']` |
| `node-server.ts` | **3013~3021** | `patchSchema v0.169` — 한글 type_key → 영문 work_class 매핑 |

### 4-3. DB 직접 영향

- `checklist_items.work_class` 컬럼 값 — 체크리스트 항목 등록 시 직접 저장
- `work_type_safety_settings.work_class` 컬럼 — 안전설정과 체크리스트 연결 키

---

## 5. 변경 유형별 체크리스트

### 5-A. 체계 A — 한글 라벨(표시명)만 변경 시

```
□ app.js WORK_CLASS_DEF 배열 label 수정 (5313~5318라인)
□ app.js wcShort 맵 수정 (6348라인)
□ app.js wcShortMap2 맵 수정 (6447라인)
□ app.js wcMap 수정 (7100라인)
□ app.js workClassBadge() 내 HTML 텍스트 수정 (7114~7122라인)
□ app.js workClassName() 내 맵 수정 (7125~7127라인)
□ app.js mWorkClass select 옵션 텍스트 수정 (7336~7339라인)
□ app.js wcList 배열 label 수정 (8636~8641라인)
□ app.js WC_MAP 수정 (18099~18106라인)
□ app.js wcLabelMap 수정 (20770라인)
□ node --check → npm run build 이중 검증
□ git commit + push
※ 서버 파일 수정 불필요 (영문 키 변경 없음)
```

### 5-B. 체계 A — 영문 키 변경 (예: equipment_other → device_other) 시

```
□ app.js WORK_CLASS_DEF 배열 key 수정 (5313~5318라인)
□ [5-A 체크리스트 전체 포함]
□ src/routes/tasks.ts valid 배열 수정 (1167라인)
□ src/routes/tasks.ts 기본값 'cable_install' fallback 확인 (506, 688라인)
□ node-server.ts DB 스키마 DEFAULT 값 확인 (505라인)
□ DB 데이터 마이그레이션: UPDATE tasks SET work_class_new='신키' WHERE work_class_new='구키'
□ node --check → npm run build 이중 검증
□ git commit + push
⚠️ 기존 DB 데이터 마이그레이션 반드시 필요
```

### 5-C. 체계 A — 항목 추가 시 (4종 → 5종)

```
□ app.js WORK_CLASS_DEF 배열에 항목 추가 (5313~5318라인)
□ app.js wcShort 맵에 추가 (6348라인)
□ app.js wcShortMap2 맵에 추가 (6447라인)
□ app.js wcMap에 추가 (7100라인)
□ app.js workClassBadge() map에 추가 — 색상/아이콘 선택 필요 (7114라인)
□ app.js workClassName() map에 추가 (7125라인)
□ app.js mWorkClass select에 option 추가 (7336~7339라인)
□ app.js wcList 배열에 항목 추가 (8636라인)
□ app.js WC_MAP에 추가 (18099라인)
□ app.js wcOrder 배열에 추가, wcLabelMap에 추가 (20769~20770라인)
□ src/routes/tasks.ts valid 배열에 추가 (1167라인)
□ node --check → npm run build 이중 검증
□ git commit + push
```

### 5-D. 체계 A — 항목 삭제 시 (4종 → 3종)

```
□ [5-C 전체를 역방향으로] — 해당 키 제거
□ 기존 DB 데이터 처리 결정 필요:
    옵션1: 삭제 키 데이터를 다른 키로 마이그레이션
    옵션2: COALESCE fallback 기본값으로 처리 (cable_install)
□ DB 마이그레이션 실행 후 배포
□ node --check → npm run build 이중 검증
□ git commit + push
⚠️ 기존 DB 데이터 처리 계획 반드시 수립 후 진행
```

### 5-E. 체계 B — 체크리스트 유형 변경 시

```
□ app.js conditionalClassMap 수정 (12620~12626라인)
□ app.js conditionalClasses Set 수정 (12627라인)
□ src/routes/checklist.ts CONDITIONAL_CLASSES 배열 수정 (10라인)
□ node-server.ts _allClasses 배열 수정 (5663라인)
□ node-server.ts patchSchema 한글→영문 매핑 수정 (3013~3021라인)
□ work_type_safety_settings DB 데이터 확인 (work_class 컬럼 값)
□ node --check → npm run build 이중 검증
□ git commit + push
⚠️ 체계 A(WORK_CLASS_DEF)와 완전히 별도 — 혼동 주의
```

---

## 6. 현재 운영 중인 값 요약

### 체계 A — 작업분류 (`tasks.work_class_new`)

| 영문 키 | 한글 표시명 | 색상 | 아이콘 |
|---------|-----------|------|--------|
| `cable_install` | 광케이블 시설 | blue (#1D4ED8) | fas fa-ethernet |
| `cable_splice` | 광케이블 접속 | indigo (#4338CA) | fas fa-plug |
| `equipment_other` | 장비 시설및 기타 | orange (#C2410C) | fas fa-tools |
| `conduit` | 관로시설 | green (#15803D) | fas fa-circle-nodes |

### 체계 B — 체크리스트 조건부 유형 (`checklist_items.work_class`)

| 영문 키 | 한글 표시명 | 안전설정 type_key |
|---------|-----------|-----------------|
| `bucket` | 바켓차량작업 | 바켓차량작업 |
| `pole` | 전주승주 | 전주승주 |
| `rooftop` | 옥상옥탑작업 | 옥상옥탑작업 |
| `ladder` | 사다리사용작업 | 사다리사용작업 |
| `heavy` | 중장비사용 | 중장비사용 |
| `confined` | 밀폐공간작업 | 밀폐공간작업 |
| — | — | TBM회의 (work_class=null) |

---

## 7. 관련 파일 위치 요약

```
app.js (클라이언트)
├── 5313~5318  WORK_CLASS_DEF           ← 체계A 단일 진실 공급원
├── 6348       wcShort                  ← 체계A 모바일 배지
├── 6447       wcShortMap2              ← 체계A PC 배지
├── 7100       wcMap                    ← 체계A 엑셀 텍스트
├── 7114~7122  workClassBadge()         ← 체계A 상세 배지 HTML
├── 7125~7127  workClassName()          ← 체계A 분류명 함수
├── 7336~7339  mWorkClass select        ← 체계A 등록폼 옵션
├── 8636~8641  wcList 배열              ← 체계A 변경 모달
├── 12620~12626 conditionalClassMap     ← 체계B 한글명 맵
├── 12627      conditionalClasses       ← 체계B Set
├── 18099~18106 WC_MAP                 ← 체계A PDF 변환 (레거시 키 포함)
└── 20769~20770 wcOrder, wcLabelMap     ← 체계A 통계 차트

서버 파일
├── src/routes/tasks.ts:1167            ← 체계A valid 배열 (API 검증)
├── src/routes/checklist.ts:10          ← 체계B CONDITIONAL_CLASSES
├── node-server.ts:505                  ← DB 스키마 (work_class_new DEFAULT)
├── node-server.ts:5663                 ← 체계B _allClasses
└── node-server.ts:3013~3021           ← 체계B 한글→영문 매핑
```
