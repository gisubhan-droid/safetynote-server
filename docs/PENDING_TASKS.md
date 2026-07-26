# SafetyNOTE — 작업 대기 목록

> 최초 작성: 2026-06-19 (세션 37)
> 마지막 업데이트: 2026-07-26 (세션 90 FEAT-171 완료)
>
> ⚠️ 번호는 우선순위가 아님
> ⚠️ 완료 항목은 하단 "✅ 완료된 작업"으로 이동

---

## 📋 현재 대기 목록

> 세션 90 완료 기준.

| Phase | 내용 | 상태 | 우선순위 |
|-------|------|------|----------|
| PERF-001 | 서명 처리 로딩 개선 — 3중 지연 구조 해소 (모니터링 후 결정) | 🔍 모니터링 중 | 중간 |
| Phase 3 | node-server.ts 라우트 파일 분리 (코드 구조 정리) | ⏳ 대기 | 낮음 (선택적) |

### 🔍 PERF-001 상세 — 서명 처리 로딩 지연 (세션 89 분석 완료)

| 원인 | 위치 | 내용 | 예상 개선 |
|------|------|------|-----------|
| **①** sign_data PNG 크기 | `app.js` `showSignaturePad()` `toDataURL('image/png')` | dpr 반영 고해상도 캔버스 → Base64 약 70~200KB 전송 | **1순위** — JPEG 80% 압축 시 70~80% 감소 |
| **②** FCM 순차 발송 | `src/fcm.ts` `sendFcmPushMulti()` | 토큰 수만큼 Google API 순차 호출 (for await loop) | 병렬화(`Promise.all`) 또는 FCM batch API 전환 |
| **③** 서명 완료 후 API 4회 재호출 | `app.js` `_signReqSign()` 완료 후 | PATCH 1 + GET count 1 + GET×3 (pending/signed/rejected) | 낙관적 UI 업데이트로 재조회 횟수 감소 |

**적용 방안 (우선순위 순)**:
1. `toDataURL('image/png')` → `toDataURL('image/jpeg', 0.8)` 변경 (`app.js` 1줄)
2. `sendFcmPushMulti` for-await → `Promise.all` 병렬화 (`src/fcm.ts`)
3. `_signReqSign` 완료 후 count 중복 조회 제거 (`app.js`)

> ⚠️ 모니터링 기간 이후 사용자 확인 후 적용 예정

---

## 📌 남은 Phase 대기 목록

| Phase | 내용 | 상태 | 우선순위 |
|-------|------|------|----------|
| Phase 3 | node-server.ts 라우트 파일 분리 (코드 구조 정리) | ⏳ 대기 | 낮음 (선택적) |
| Phase 4 | NAS 설치 · 운영 매뉴얼 PDF | ✅ 완료 (세션 57) | — |
| Phase 6 — 타 NAS 원클릭 설치 패키지 (install.sh v2.1) | ✅ 완료 (세션 57) | — |
| Phase 6-5 | 실제 신규 NAS 환경 설치 테스트 | ⏳ 대기 (사용자 직접) | 낮음 |

---

## 📌 Phase 3 세부 대기 목록 (선택적 진행)

| 항목 | 내용 | 상태 |
|------|------|------|
| Phase 3 Step 1 | `src/db.ts` 생성 — rawDb 공유 모듈 | ⏳ 대기 |
| Phase 3 Step 2 | 신규 라우트 파일 9개 생성 + 인라인 라우트 이동 | ⏳ 대기 |
| Phase 3 Step 3 | 기존 라우트 파일 7개에 인라인 라우트 병합 | ⏳ 대기 |
| Phase 3 Step 4 | node-server.ts 정리 + 빌드 검증 + 커밋 | ⏳ 대기 |

> Phase 3은 기능 변화 없는 코드 구조 정리입니다.
> 운영 중 기능 불편이 없다면 후순위로 진행해도 무방합니다.

---

## ✅ 완료된 작업

| 작업 | 완료 세션 | 커밋 |
|------|-----------|------|
| BUG-021 수동 푸시 FCM 0명 UI 무응답 | 세션 35 | `e86553f` |
| BUG-022 수동 푸시 발송 버튼 무반응 | 세션 36 | `fcabd66` |
| BUG-023 알림센터 전체 삭제 후 재로그인 시 알림 복원 | 세션 38 | `40eef26` |
| TASK-002 공사 상세에서 작업 생성 후 화면 유지 | 세션 39 | `7ddd3c1` |
| TASK-003 공사요청번호 자동생성 옵션 추가 (YYMMDDhhmm##) | 세션 39~41 | `ff72d58` |
| TASK-001 공사현황 수정/삭제 기능 추가 | 세션 39 | `7ddd3c1` |
| TASK-006 공사종류 "기타"(other) 추가 | 세션 43 | `872f353` |
| TASK-005 외선작업일보 자산구분(N-1/N-2) 필드 추가 | 세션 44 | `dfff447` |
| TASK-004 시스템설정 탭 5개 방식으로 개편 | 세션 45 | `9fe3661` |
| BUG-021(재발) TASK-004 JS 문법 오류 수정 | 세션 45 | `eccdd25` |
| BUG-023~026 외선일보 인라인 편집 버그 4종 수정 | 세션 51 | `bcec93b` |
| 작업일보 work_class 필터 적용 (외선/접속 분리) | 세션 52 | `b906d1e` |
| Phase 5 — 브라우저 원클릭 서버 업데이트 자동화 | 세션 53 | `808959f` |
| 자동 DB 백업 (매일 새벽 2시, 30일 보관) | 세션 54 | `8f7d502` |
| 페이지네이션 적용 (tasks · splice_reports, 50건 단위) | 세션 54 | `8f7d502` |
| 오래된 알림 자동 정리 (90일 초과, 매 24시간) | 세션 54 | `8f7d502` |
| Phase 6 — install.sh v2.0 완성 (신규·업데이트·재설치 3모드) | 세션 55 | `808959f` |
| .env.example NAS용 전면 보완 (FCM 항목 추가) | 세션 55 | `808959f` |
| 단가 엑셀 다운로드/업로드 기능 추가 (외선/접속 CSV export/import) | 세션 56 | `ef50287` |
| item_key 영문 순차 전면 적용 (a000001~a000018, b000001~b000011) | 세션 56 | `0858eb1` |
| 구버전 한글/혼용 item_key 잔존 행 완전 정리 (v0.141) | 세션 57 | `322cd58` |
| install.sh v2.1 — 다운로드 방법 2가지 안내 추가 | 세션 57 | `1fbcae5` |
| Phase 4 — NAS 설치·운영 매뉴얼 PDF 제작 | 세션 57 | (외부 문서) |
| BUG-166: photoCaption 한글 IME 입력 지연 수정 | 세션 86 | `ffc0b30` |
| BUG-167: WebView HTTP 캐시 우회 (Cache-Control no-cache) | 세션 86 | `8fab226` |
| BUG-IME: captureInput false — Android WebView 한글 IME 근본 수정 | 세션 86 | `a172a6f` |
| APK v1.4.15 빌드 및 현장 배포 완료 | 세션 87 | (GitHub Actions) |
| BUG-168: 검색 input 한글 IME 자음/모음 분리 수정 | 세션 87 | `26fba0f` |
| DECK-2~5 사용자 설명서 — "Safety NOTE 통합 사용자 가이드"로 완료 | 세션 87 | (외부 문서) |
| docs/APK_BUILD_GUIDE.md 최초 작성 | 세션 87 | `bf1be78` |
| docs/BUILD_AND_DEPLOY_GUIDE.md 최초 작성 | 세션 87 | `f5d3d2f` |
| BUGFIX_LOG.md BUG-166/167/IME/168 기록 정리 완료 | 세션 87 마무리 | `0eb439f` |
| docs/skills/ 스킬 3개 작성 (android-ime-guard / kst-datetime-utils / github-actions-dispatch) | 세션 88 | `33e8c30` |
| node-server.ts TS2339 오류 원인 분석 완료 (수정 미착수 → 다음 세션 예정) | 세션 88 | — |
| src/index.tsx 로그인/프로필 페이지 LG스마트체 Regular 적용 | 세션 88 | `b69e80b` |
| BUG-169: node-server.ts app.fetch() TS2339 타입 오류 수정 (Promise.resolve 래핑) | 세션 88 | `e664b34` |
| FEAT-170: 서명요청 renderCard() 내용 보기 링크 추가 (_signReqOpenRisk helper + ref_type별 버튼) | 세션 89 | `b1a539b` |
| UI: 시스템 설정 메뉴를 법령안내 관리 아래로 이동 (NAV 배열 + 트리 메뉴 2곳) | 세션 89 | `6e18fd7` |
| FEAT-171: TBM 사진 등록 시 갤러리·카메라 선택 가능하도록 변경 (capture="environment" 속성 제거 — 28735, 28753라인) | 세션 90 | `4029bf4` |
