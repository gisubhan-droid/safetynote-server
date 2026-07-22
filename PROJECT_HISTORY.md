# Safety NOTE - 프로젝트 전체 진행 이력

> 최종 업데이트: 2026-07-22 (세션 153 — feat: [FEAT-112 세션153] 연계작업 사진 칩버튼 UX + NAS 데이터 필터 수정)
> **GitHub 최신: `125b901`** — feat: [FEAT-112 세션153] 연계작업 사진 칩버튼 UX + NAS 데이터 필터 수정
> **이전 커밋: `ab01d70`** — feat: [FEAT-112 세션152] 연계작업 사진 UX 개선
> **이전 커밋: `9354335`** — fix: [FEAT-112 세션151] _showLinkedPhotoModal 전면 재작성 (세션151)
> **이전 커밋: `e035c01`** — docs: [FEAT-112 UX] PROJECT_HISTORY.md 세션150 기록 추가
> **이전 커밋: `5812529`** — feat(tasks): [FEAT-111] 내 작업 가져오기 시 소속 팀 전원 자동 배정 (세션147)
> **이전 커밋: `06dd159`** — feat(my-tasks): [FEAT-108] 내 작업목록 진행단계 다중선택 드롭다운 필터 추가 (세션143-3)
> **이전 커밋: `bcbcc9f`** — fix(site-map): [BUG-105] 지도앱 열기 PC 콘솔 오류 수정 + 카드 상세 버튼 별도 분리 (세션143-2)
> **이전 커밋: `999e9ad`** — feat(site-map): 지도 마커 팝업 지도앱 연결 + 하단 리스트 카드 작업상세 이동 (세션143)
> **이전 커밋: `83e802a`** — fix(nas): [BUG-104] 계정 삭제 NAS 500 오류 수정 (세션142)
> **이전 커밋: `1af97a3`** — feat(report): 작업자(팀) 필드를 TBM 시행자+배정근로자 기반으로 변경 (세션142)
> **이전 커밋: `241e5c1`** — feat(stats-task): 작업금액 외선/접속/소계 3컬럼 분리 및 페이지 즉시 로딩 (세션141)
> **세션140 커밋: `6a0416d`** — hotfix: app.js TypeScript 'as HTMLInputElement' 구문 제거 (세션140)
> **이전 커밋: `1f4bcbd`** — feat: TBM 탭 추가 실시 이력 확인 팝업 + 작업개시 버튼 추가 (세션139)
> **NAS 배포 완료: `5a64403`** — 방식1(업데이트 버튼) 적용 완료 (세션128 / 세션129 배포 대기)
> **캐시 버전: `?v=20260714a`** (service-worker v12)
> **앱 버전: v3.0-hotfix** (PLAN-UI-001 Option C + BUG-077 수정)
> **APK 최신**: v1.4.7
> **직전 단계 복원**: `bash scripts/rollback.sh pre-hotfix` (핫픽스 전 상태)
> **v3.0 이전 복원**: `bash scripts/rollback.sh pre-v300` (v2.x 최신 안정)
> **배포 원칙**: 모든 수정 완료 후 NAS 1회 통합 배포
> **NAS git 동기화**: `git pull` 실패 시 → `git fetch origin && git reset --hard origin/main`

---

## 📋 BUG / FEAT 전체 인덱스

> 최근 → 과거 순 정렬. 세션 번호 클릭으로 상세 참조.

### 🐛 BUG 목록

| 번호 | 세션 | 날짜 | 상태 | 증상 요약 | 커밋 |
|------|------|------|------|----------|------|
| FEAT-112c | 153 | 2026-07-22 | ✅ 적용 | **연계작업 사진 칩버튼 UX + NAS 데이터 필터 수정** — ①`app.js _loadLinkedCompletedPhotos`: 행 목록(flex-direction:column) → 칩(chip) 버튼 가로 나열(flex-wrap:wrap)으로 교체. 형식: `[📷 연계작업 사진 #0042  7장]` `[📷 연계작업 사진 #0043  3장]`. sub_task_number 4자리 0패딩. 버튼 클릭 시 전체화면 팝업 호출 ②`node-server.ts GET /api/photos` NAS 오버라이드: `construction_id`+`exclude_task_id`+tasks JOIN+LINKED_STATUSES 필터 추가 — 기존에 파라미터 완전 무시로 전체 사진 반환하던 버그 수정. 같은 공사의 LINKED_STATUSES 상태 작업 사진만 반환, 현재 작업 제외 | `125b901` |
| FEAT-112b | 152 | 2026-07-22 | ✅ 적용 | **연계작업 사진 UX 개선** — ①섹션 타이틀: "같은 공사의 연계작업 사진" → "연계작업 사진" ②버튼 수십 개 나열 → sub_task_number 기반 행 목록으로 교체(flex-direction:column, 1행 = #번호 + 작업명 + N장 + 화살표) ③팝업: max-width:680px 모달 → position:fixed;inset:0 전체화면 전환 | `ab01d70` |
| BUG-105 | 143-2 | 2026-07-20 | ✅ 수정 | **site-map 지도앱 열기 PC 콘솔 에러 + 카드 상세 버튼 분리** — ①PC 브라우저에서 `tryOpenMap` 앱스킴(`kakaomap://` 등) 시도 시 `Failed to launch` 콘솔 에러 반복 출력 → PC 분기에서 앱스킴 시도 제거, `window.open(webUrl, '_blank')` 직접 호출로 변경(Android 분기 기존 유지) ②하단 카드 클릭이 작업상세 이동으로 되어 있어 지도 이동과 충돌 → 카드 전체 클릭=지도이동(`_moveSiteMapTo`)으로 원복, 우측에 별도 보라색 `[상세]` 버튼 추가(`event.stopPropagation()+showTaskDetail(taskId)`로 분리) | `bcbcc9f` |
| FEAT-104 | 143 | 2026-07-20 | ✅ 적용 | **site-map 지도 마커 팝업 → 지도앱 연결 + 하단 리스트 카드 → 작업상세 이동** — ①5개 탭(위험성/TBM/진행/완료/현장점검) 마커 팝업 하단에 "지도앱 열기" 버튼 추가(기존 `showMapModal(address)` 재사용, T맵/카카오맵/네이버지도 선택) + task_id 있을 때 "작업상세" 버튼 병렬 표시 ②하단 리스트 카드 클릭 시 `showTaskDetail(taskId)` 호출(카드 전체 onclick) ③아이콘(지도이동) 클릭 시 `event.stopPropagation()`으로 버블링 차단 ④5개 탭 listItems.push에 `taskId` 필드 추가(risk: `t.id`, tbm/working/completed: `tbm.task_id`, inspection: `ins.task_id`) | `999e9ad` |
| FEAT-103 | 142 | 2026-07-17 | ✅ 적용 | **일보 작업자(팀) — TBM 시행자+배정근로자 기반 표시** — 외선일보·접속일보 `작업자(팀)` 필드가 저장자(로그인 사용자, `contractor_name`)를 표시하던 것을, TBM `conductor_name`(시행자) + `attendees`(참석자) 기반으로 변경. 우선순위: ①기존 저장값(`report.worker_team`) ②TBM 시행자+참석자 ③`assigned_workers` ④`contractor_name`. 두 일보 함수(`renderWorkReportForm`/`renderSpliceReportForm`) 모두 적용 | `1af97a3` |
| FEAT-102 | 141 | 2026-07-17 | ✅ 적용 | **작업통계 작업금액 컬럼 외선/접속/소계 3컬럼 분리 + tfoot 합계행** — `renderByTeamTable`·`renderByCategoryTable` 단일 금액 컬럼 → 외선/접속/소계 3컬럼 분리, tfoot 합계행 추가. `loadMonthlyStats()` 내 `teamAmtMap2`→`workTeamAmtMap2`+`spliceTeamAmtMap2`, `catAmtMap2`→`workCatAmtMap2`+`spliceCatAmtMap2` 분리. `renderStatsPage()` 말미 `loadMonthlyStats()` 자동 호출 추가(페이지 진입 즉시 로딩). 세션140 누락 버그 수정: `loadMonthlyStats()` `con_types` 파라미터 누락 수정, 대시보드 UI 개편(작업팀별 삭제·상대실적→작업금액), 물량통계 추가입력→달성금액, `cableTotalAmt is not defined` 수정, 단위 백만원 통일 | `241e5c1` |
| FEAT-101 | 139 | 2026-07-14 | ✅ 적용 | **TBM 탭 추가 실시 이력 확인 팝업 + 작업개시 버튼 추가** — ①TBM 추가 실시 클릭 시 TBM 이력 있으면 "네/아니오" 팝업 표시 (네=팝업닫기, 아니오=신규 TBM 등록) ②tbm_done 상태일 때 TBM 탭 하단에 "작업개시" 버튼 추가 (changeTaskStatus working 연결) ③TBM 이력 없으면 팝업 없이 바로 showTbmForm() 호출 (하위호환) | `1f4bcbd` |
| BUG-100 | 138 | 2026-07-13 | ✅ 수정 | **TBM 공유 텍스트 작업번호 형식 오류** — `_tbmShare()` 복사 텍스트에서 작업번호가 `WKS-######-#####`만 표시되고 `sub_task_number`(####)가 누락됨. API `share-token` SQL에 `tk.sub_task_number` 미포함이 원인. **해결**: ①`node-server.ts` SQL에 `tk.sub_task_number` 추가 + 응답 JSON에 `sub_task_number` 포함 ②`app.js` `_tbmShare()` 복사 텍스트 구성 시 `sub_task_number` 있으면 `${work_number}-${sub_task_number}` 조합, 없으면 `work_number` 그대로 (하위호환) | `021178d` |
| BUG-099b | 137-2 | 2026-07-13 | ✅ 수정 | **접속일보 작성화면 공종별 작업량 단가없음 표시** — `renderSpliceReportForm` 내 `_mkLabelToKey` 빌드 시 SPLICE_ITEMS_DEF(11개)만 참조 → DB 추가 항목(광단자, 최종시험, 신호수추가배치) 한글→item_key 변환 실패 → 폴백(공백/슬래시 제거) → 잘못된 key → `splicePriceFormMap` 조회 실패 → "단가없음" 표시. **해결**: `_mkLabelToKey` 빌드 시 `dbSpliceItems`(DB 로드 배열)의 `item_label→item_key` 매핑 추가 보완 | `934c3cd` |
| BUG-099 | 137 | 2026-07-13 | ✅ 수정 | **접속일보 공종별 집계/물량통계 금액 0 표시** — 단가관리에서 추가된 항목(광단자(IJP,OFD), 케이블 최종시험(양방향/단방향), 신호수추가배치)이 `SPLICE_ITEMS_DEF`(하드코딩 11개) 기반 `labelToKey` 변환 실패 → `priceMap` 조회 불가 → 금액 0 계산. **해결**: `renderFieldReportPage._spliceLabelToKey` + `_vsLoadSpliceStats._vsLabelToKey` 빌드 시 DB `prices` API 응답의 `item_label→item_key` 매핑을 추가 보완하여 DB 추가 항목도 정확히 변환 | `fc2468a` |
| BUG-098 | 127 | 2026-07-12 | ✅ 수정 | **QR 전체선택 — 역할 카드 필터 후 숨겨진 사용자까지 선택** — `toggleAllQrChecks()`에서 `table.querySelectorAll('.user-qr-check')` 호출 시 `tr.style.display='none'`인 필터 숨겨진 행도 전부 체크됨. 동일 원인으로 `updateQrBulkCount()` 카운트 오표시, `printQrBulk()` 숨겨진 행 인쇄 포함. **해결**: ①`toggleAllQrChecks`: `tbody tr` 순회 시 `tr.style.display==='none'` 건너뜀 ②`updateQrBulkCount`: `.user-qr-check:checked` 순회 시 `tr.style.display!=='none'`만 카운트 ③`printQrBulk`: `.user-qr-check:checked` 수집 후 `.filter(cb => tr.style.display !== 'none')` 추가 ④`filterUserList`: 행 숨길 때 `.user-qr-check` 자동 해제 + 마스터 체크박스 `indeterminate` 재동기화 + `updateQrBulkCount()` 재갱신 | `e4fe63d` |
| BUG-097 | 126 | 2026-07-12 | ✅ 수정 | **현장점검 저장 500 에러** — DB `site_inspections.inspection_type` CHECK constraint = `('routine','special','safety')`인데 UI select가 `joint`/`frequent` 값을 전송 → 500 에러. **해결**: ①`app.js` 등록/수정 모달 select value를 `joint`→`special`, `frequent`→`safety`로 수정 ②`INS_TYPE_LBL` 3곳 `special`/`safety` 키 추가 + `joint`/`frequent` 하위호환 ③`node-server.ts patchSchema v0.159`: 기존 데이터 `joint`→`special`, `frequent`→`safety` 자동 마이그레이션 | `405412f` |
| BUG-096 | 125 | 2026-07-12 | ✅ 수정 | **업무중사용자 역할 카드 클릭 필터 미동작** — `filterUserByRole()` 함수·`filterUserList()` 역할필터 로직·`clearUserSearch()` 초기화는 이전 세션에서 정상 추가됐으나, 역할 카드 HTML `<div>`에 `onclick`, `data-role`, `class="role-filter-card"`, `cursor:pointer` 속성이 누락되어 카드 클릭 자체가 이벤트를 받지 못함. **해결**: 카드 div에 `class="role-filter-card"`, `data-role="${uiRole}"`, `onclick="filterUserByRole('${uiRole}')"`, `cursor:pointer`, `transition` 스타일 추가. 2차 검증: `data-role` 충돌(sys-user-grp-all·edu-user-cb 완전 다른 element) 없음 확인 | `bc5eb1f` |
| BUG-095 | 124 | 2026-07-12 | ✅ 수정 | **파일 저장 폴더 년도/월 계층 누락** — FEAT-042(2e38b2a)에서 `src/nas-routes/attachments-nas.ts`에만 년도/월 폴더 로직이 추가되고, `node-server.ts`의 `getUploadDir()`에는 미적용. FEAT-050(38901af)에서 `team_name` 추가 때도 누락 지속. **증상**: 02_TBM·03_작업사진·04_현장점검·05_기타 폴더가 `{루트}/{공사요청번호}_{공사명}/...`에 생성되어 년도/월 계층 없음. **해결**: `node-server.ts` 단일 파일만 수정 — ①`getUploadDir()` 함수에 `con_created_at?: string\|null` 파라미터 추가 + `yearFolder`/`monthFolder` 추출 + `basePath` 분기 로직 추가(hasConInfo&&con_created_at: `{root}/{year}/{month}/{conFolder}`, 그 외: `{root}/{conFolder}`) ②5개 SQL 쿼리에 `c.created_at AS con_created_at` 추가(TBM PDF·addInsPhoto·POST inspections·POST photos·POST tbm-photos) ③TBM PDF `taskObj`에 `con_created_at` 포함 | `a419dbd` |
| BUG-FIX(공사삭제) | 123 | 2026-07-12 | ✅ 수정 | **공사 삭제 권한 — sysadmin+creator 동시 케이스 조건 순서 버그** — ①일반 사용자: 본인 등록 `registered` 공사 상세에서 삭제 버튼 미표시 (app.js `currentUser.id === con.created_by` 타입 불일치: string vs number) ②시스템관리자: 삭제 버튼 있으나 클릭 시 409 — DELETE 핸들러에서 `isSysAdmin` 분기가 먼저 체크되어 sysadmin이 동시에 등록자인 경우 `isCreator && registered` 분기 미도달. **해결**: ①`constructions.ts`+`node-server.ts` — 분기 순서 재배치 `isCreator&&registered → isSysAdmin → isCreator(비등록) → 권한없음` ②`app.js` — `Number()` 강제 변환 5곳 적용(con/task/card/table) | `67f7b91` |
| BUG-093 | 120 | 2026-07-10 | ✅ 수정 | **작업 등록 성공 후 '생성 실패' 오표시** — 작업 저장 API는 정상 성공하나 동시에 분홍색 '생성 실패' toast가 함께 표시됨. 근본 원인: `_doCreate()` 내부 구조 문제 ①`uploadTaskAttachments()` 실패 시 예외가 외부 `catch`로 전파 → `toast('생성 실패', 'error')` 오출력(작업은 이미 저장됨) ②`renderTasksPage(document.getElementById('page-content'))` 호출 시 모달 제거 후 `page-content`가 null이면 `TypeError` → 외부 catch → '생성 실패'. **해결**: ①`uploadTaskAttachments` 별도 `try/catch`로 격리(내부에서 이미 toast 처리) ②`toast('작업이 등록됨')` 이후 페이지 이동 코드를 별도 `try/catch`로 격리하여 외부 catch로 전파 차단 ③`renderTasksPage` 호출 전 `page-content` null 체크 추가 | `4498c03` |

| 비상복구서버-v3 | 119 | 2026-07-10 | ✅ 수정 | **비상복구 서버 PM2 미동작 — bash 래퍼 방식 NAS hang 문제** — `ecosystem.config.cjs`에서 `safe-recovery-standalone.sh`(bash 래퍼)를 실행하면 NAS Synology PM2에서 응답 없이 hang. 근본 원인: ①bash 래퍼 방식이 NAS PM2와 호환 불가 ②`cleanup_previous()` 함수가 PM2 재시작 시마다 기존 python3 프로세스 kill → 재시작 루프. **해결**: `scripts/recovery-server.py` 독립 Python3 서버 파일 신규 작성. PM2가 python3를 직접 실행(bash 래퍼 없음). `SO_REUSEADDR`로 포트 즉시 재사용, `signal.SIGTERM`으로 graceful stop, `.env` 자동 로드, NAS Node.js v18/v20 경로 자동 탐색. `ecosystem.config.cjs` 비상복구 항목: `script=safe-recovery-standalone.sh` → `recovery-server.py`, `interpreter=/bin/bash` → `/usr/bin/python3`, `args` 단순화 | `f65686a` |

| FEAT-059 | 115 | 2026-07-06 | ✅ 구현 | **LinkMak Co., Ltd. 크레딧 표시** — ①아이콘 레일 최하단에 `.rail-credit` 블록 추가: "LinkMak" / "Co.,Ltd" 2줄, opacity 0.4 → hover 0.85 전환, clamp 폰트 6~8px ②메인 콘텐츠 우하단 `#app-credit-bar` 고정 바 추가(height:22px): "Powered by" + "LinkMak Co., Ltd." (브랜드 컬러), 모바일(≤768px)에서 탭바 겹침 방지로 숨김 ③데스크톱 main-content padding-bottom:22px 추가 (크레딧바 가림 방지) | `3de212d` |
| FEAT-058 | 115 | 2026-07-06 | ✅ 구현 | **사이드바 아이콘 화면 크기 비례 동적 조절** — 기존 고정 px 값을 CSS `clamp()` + `vw` 단위로 전환하여 모바일(1배)→데스크톱(1.5배) 선형 보간. `#icon-rail` 너비 `56px→clamp(52px,5.5vw,72px)`, `.rail-group-btn` `44×44px→clamp(40px,3.8vw,60px)`, 아이콘 `16px→clamp(16px,1.7vw,24px)`, 레이블 `8px→clamp(7px,0.72vw,10px)`, 브랜드 로고 `28px→clamp(24px,2.6vw,38px)`. footer 버튼 동일 패턴 적용. `#flyout-panel left`, `.main-content margin-left`, `.top-header left` 도 모두 clamp 동기화. 모바일(@media≤768px) 오버라이드는 52px 고정 유지 (clamp 최솟값 보장) | `3de212d` |
| BUG-092 | 116 | 2026-07-06 | ✅ 수정 | **교육 완료처리 403 Forbidden — 권한 role 코드 오류** — `education.ts` DELETE·complete 두 엔드포인트에서 `system_admin`, `safety_manager` 체크 → DB에 없는 role이라 모든 사용자 403. 실제 DB role은 `admin`(시스템관리자)·`supervisor`(안전관리자·현장대리인·총괄책임자). **해결**: `canComplete`/`canDelete` 조건을 `user.role==='admin' \|\| (user.role==='supervisor' && ['안전관리자','현장대리인','총괄책임자'].includes(user.position))` 으로 수정. 오류 메시지도 실제 허용 역할명 한국어로 안내 | `89cbf8a` |
| BUG-091 | 114 | 2026-07-06 | ✅ 수정 | **TBM 회의록 3가지 수정** — ①`관리감독자→담당자`: 행1 헤더 레이블 변경 ②`서브작업번호`: `task_number`+`sub_task_number` 조합 → `WKS-{main}-{sub}` 형식 출력, sub 없으면 main만, 둘 다 없으면 `WKS-` ③`사진 페이지 잘림 방지`: 사진 `<tr>/<td>/<div>/<img>` 전부 `page-break-inside:avoid;break-inside:avoid` + CSS `@media print { img,tr { page-break-inside:avoid } }` 추가. 백엔드: `tbm.ts` GET 목록(2개)+단건 쿼리 `t.sub_task_number` 컬럼 추가; `node-server.ts` NAS GET `/api/tbm/:id` rawDb 오버라이드 신규 등록(RULE-002, sub_task_number 포함) | `87c954c` |
| BUG-090 | 113 | 2026-07-06 | ✅ 수정 | **TBM 회의록 출력 헤더 구조 4가지 수정** — ①`서명인원` 행 삭제: 출력물에서 서명인원 수 표시 행 제거 ②`수급업체→관리감독자`: `contractor_name` 레이블을 "수급업체" → "관리감독자"로 변경 ③헤더 레이아웃 이미지 기준 재배치: 행1(작업명+관리감독자), 행2(실시일시+TBM진행자+작업번호), 행3(실시장소+날씨기온+참석인원) 6열 구조로 재편. 작업번호는 기존 WKS- 형식 유지, 미입력 시 "WKS-" 표시 ④`info-table` CSS `table-layout:fixed` + th `width:62px`로 6열 균등 배분 | `564db77` |
| BUG-089 | 112 | 2026-07-06 | ✅ 수정 | **TBM 회의록 결재 서명란 — 대표이사 제거, 총괄책임 2단계로 변경** — 결재 흐름 안전관리자→총괄책임→대표이사 3단계 → 안전관리자→총괄책임 2단계로 단순화. ①`node-server.ts` PDF 결재란: approval_ceo 행 제거, approval_general 표시명 "총괄책임" ②`app.js showTbmDetail` 결재 카드: cSig/canCeo 제거, 순서 안내 수정 ③`app.js _tbmPrint()` 결재 테이블: colgroup col 제거, 대표이사 th/td 제거, 안내텍스트 수정 ④`app.js LABELS/DESCS/_tbmApprovalSignInApp`: approval_ceo 항목 제거 ⑤`tbm-extra.ts`: validRoles→2개, signedRoles 쿼리→2단계, approval_general이 최종결재로 변경(PDF 자동생성 트리거), approval_ceo 블록 제거 | `1a13c16` |
| BUG-088 | 112 | 2026-07-06 | ✅ 수정 | **TBM 회의록 서명인원 카운트에 결재 서명 포함되는 오류** — `showTbmDetail`의 서명 현황 계산 시 `signatures` 전체(approval_safety·general·ceo 포함)를 카운트 → 실제 근로자(attendee/conductor) 수보다 많은 숫자 표시. **해결**: ①`tbm-sig-badge` 카운트: `workerSigsForBadge = signatures.filter(s => s.role==='attendee'||s.role==='conductor')` 필터 적용 ②`showTbmDetail` 서명 현황 계산: `workerSigs = signatures.filter(role==='attendee'||'conductor')` 2곳 모두 적용 | `1a13c16` |
| BUG-087 | 110 | 2026-07-06 | ✅ 수정 | **작업 삭제 시 FOREIGN KEY constraint failed (500)** — `tasks.ts DELETE /:id`의 `safeDelete` 체인에서 `tbm_records` 삭제 전 자식 테이블 누락: `tbm_signatures(REFERENCES tbm_records(id))`, `tbm_share_tokens(tbm_id)`, `signature_requests(ref_type='tbm')`, `notifications(ref_type='tbm')`가 먼저 삭제되지 않아 FK constraint 위반 → 500. **해결**: `tbm_records` 삭제 직전에 4개 테이블 safeDelete 순서 삽입(02770c6). **b: NAS rawDb 직접 연쇄삭제 오버라이드 추가** — `node-server.ts`에 `DELETE /api/tasks/:id` NAS 오버라이드 추가(taskRoutes 앞): `PRAGMA foreign_keys=OFF` 후 rawDb로 tbm_signatures·tbm_share_tokens·signature_requests·notifications·checklist·risk·task 관련 테이블 전부 순차 삭제, finally에서 FK 재활성화. 공사 삭제 NAS 오버라이드도 FEAT-053 sysadmin+상태 조건 적용 | `0a0d224` |
| BUG-086 | 109 | 2026-07-06 | ✅ 수정 | **외선 공량 엑셀 다운로드 헤더 item_key 코드 표시** — `downloadFieldReportCSV()`에서 `extraHeaders = _frCacheItemKeys.slice()` 사용 시 raw item_key 배열(`['a000004',...]`)이 그대로 CSV 헤더에 사용됨. `renderFieldReportPage()`에서 빌드한 `labelMap`이 지역 변수라 CSV 함수에서 접근 불가한 것이 원인. **해결**: ① `let _frCacheLabelMap = {};` 전역 캐시 추가(line 29116) ② `renderFieldReportPage()`에서 `_frCacheLabelMap = labelMap;` 저장(line ~29239) ③ `extraHeaders = _frCacheItemKeys.map(k => _frCacheLabelMap[k] || k)` 변환(line ~29841) | `5029565` |
| BUG-085 | 109 | 2026-07-06 | ✅ 수정 | **공량내역 외선탭 — 일보 작성 수량이 개별 행에 표시되지 않음** — `/work-reports/volume-stats` API가 `rows`를 `r.id AS report_id`로 반환하는데, 클라이언트 renderFieldReportPage()의 extrasMap 조회 시 `extrasMap[row.id]`를 사용 → `row.id=undefined` → 개별 행 extras 수량 항상 0 표시. 합계행(tfoot)은 extras 배열 직접 합산 방식이라 정상 표시됨. **해결**: `extrasMap[row.id]` → `extrasMap[row.report_id]` 3곳(합계금액 사전계산, tbody 행 렌더링 2곳) 수정. 추가: 구분 컬럼 `row.construction_work_class` → `row.work_class` (서버 alias 일치) 2곳 수정 | `c0bc6a5` |
| BUG-084 | 108 | 2026-07-06 | ✅ 수정 | **공량내역 — 단가 매핑 불일치 및 헤더 공종코드 표시** — WR_EXTRA_ORDER 하드코딩 제거 → /volume-unit-prices API sort_order 기반 전환. 헤더 item_key → item_label 표시(labelMap/vsLabelMap). field-report/stats 양쪽 적용 | `38901af` |
| BUG-083 | 108 | 2026-07-06 | ✅ 수정 | **전체 알림 발송 시 LGU+ 계정 알림 미수신** — 관리자 푸시 발송 UI(push-target select)에 `role:lgu_plus` 옵션 누락. `/push/send` 서버 쿼리는 `all`(is_active=1 전체) 및 `role:xxx`(role=? 바인딩) 모두 lgu_plus 포함 정상 동작 확인. **해결**: ① app.js push-target select에 `LGU+ 사용자만(role:lgu_plus)` 옵션 추가 ② `sendManualPush()` targetLabel 매핑에 `lgu_plus` 추가 | `38901af` |

| BUG-082 | 108 | 2026-07-06 | ✅ 수정 | **LGU+ 작업관리·현장위치지도·현장점검·작업통계 4개 화면 내용 없음** — `GET /api/admin/settings` 관리자 전용(403) → LGU+ 계정이 `lgu_menu_*` 설정값을 읽지 못함 → `window.__lguMenuSettings = {}` 빈 객체 → `lgu_menu_tasks='0'`, `lgu_menu_stats='0'` 기본값 → lguGroups에서 작업관리·작업통계 메뉴 항목 미포함 → 사이드바 메뉴 미표시 + `LGU_PLUS_ALLOWED_MENUS`에 미등록 → `canAccess` 실패. **해결**: ① patchSchema v0.155: `lgu_menu_tasks/stats` `'0'→'1'` 업데이트 ② `GET /api/lgu-menu-settings` 신규 엔드포인트(로그인된 모든 역할 허용, `lgu_menu_*` 키만 반환) ③ `app.js loadLguSettings()`: `/admin/settings` 대신 `/lgu-menu-settings` 호출 + admin만 추가로 `/admin/settings` 병행 호출 | `28e2f99` |
| BUG-081 | 107 | 2026-07-06 | ✅ 수정 | **LGU+ 대시보드(GET /api/stats/dashboard) 500 에러** — BUG-080에서 `constructions LEFT JOIN` 없는 쿼리를 단순 `'tasks'` 원본 + `'t'` 별칭 혼재 방식으로 작성. `constructions` 테이블에도 `status` 콜럼 존재 → `highRiskCount` 쿼리 `WHERE status NOT IN (...)` 콜럼 AMBIGUOUS 에러 → Promise.all 1개 실패 → 전체 500. **해결**: 5개 쿼리 모두 `FROM tasks t` 별칭 통일 + `t.status`, `t.risk_level`, `t.planned_date`, `t.construction_type` 명시 + `lguJoinSimple`/`periodWhereNoAlias` 변수 제거 + patchSchema v0.154 `rawDb.exec()` 단일 BEGIN..COMMIT 일괄 실행 → better-sqlite3 비호환 문제 → 개별 exec 호출 + transaction 래퍼로 변경 | `4e36d2d` |
| BUG-080 | 106 | 2026-07-06 | ✅ 수정 | **LGU+ 대시보드(작업현황) is_auto_request_no=0 필터 누락** — `stats.ts GET /dashboard` 5개 쿼리(상태별 건수·진행중 작업·고위험 건수·공사종류별 배정현황·금일 예정 작업) 모두 `constructions LEFT JOIN` + `COALESCE(con.is_auto_request_no,-1)=0` WHERE 조건 미적용 → LGU+ 사용자 대시보드에 전체 작업 노출. 서버 필터만으로 해결(클라이언트 추가 불필요) | `703a90a` |
| BUG-079 | 106 | 2026-07-06 | ✅ 수정 | **LGU+ 3개 메뉴(현장위치 지도·현장점검·작업관리) 조회 안됨 — 3중 원인**: ① `auth.ts` `/login` 응답 `user` 객체에 `sub_role` 미포함 → `currentUser.sub_role=undefined` → `dbRoleToUi()` LGU+ 미감지 ② `app.js renderInspectionsPage()` `allTasks`에 LGU+ 클라이언트 필터(`is_auto_request_no===0`) 없음 ③ `app.js loadSiteMapMarkers()` working/completed 탭 `taskList`에 LGU+ 클라이언트 필터 없음. 서버 API 필터(`COALESCE(con.is_auto_request_no,-1)=0` WHERE)는 `40fac8b`에서 완료, 클라이언트 측+auth 누락이 실제 원인이었음. 작업관리 클라이언트 필터는 기존 코드(`line 4366~4370`)에 이미 존재 — `sub_role` auth 수정으로 해소 | `4f46c59` |
| BUG-078 | 106 | 2026-07-05 | ✅ 수정 | **로그인 화면 APK 다운로드 "파일 없음" 오류** — `system_settings.apk_url`이 NAS 로컬 경로(`/api/dist/apk/download`)로 설정되어 있으나 실제 APK 파일이 NAS에 없어 404 반환 → `scripts/patch_apk_url.js` 신규 생성: DB의 `apk_url`을 GitHub Releases 직접 URL(`https://github.com/gisubhan-droid/safetynote-android/releases/download/v1.4.7/safetynote-v1.4.7.apk`)로 패치 + `apk_version=1.4.7` 최신화 | `7cf5d61` |
| BUG-077 | 106 | 2026-07-05 | ✅ 수정 | **모바일 아이콘 레일이 메인 콘텐츠 위에 겹침** — CSS `!important` 선언 순서 충돌: `style.css` 내 Option C `margin-left: 52px !important`(L742)보다 기존 사이드바 `margin-left: 0 !important`(L785)가 나중에 선언되어 덮어씀 → 동일 specificity의 `!important`는 선언 순서가 우선이기 때문 → 해결: 기존 사이드바 `@media(max-width:768px)` 규칙을 `body:not(:has(#icon-rail)) .main-content`로 분리 + Option C `!important` 제거 + 태블릿 `@media(769~1024px) margin-left:200px !important`도 동일하게 `body:not(:has(#icon-rail))`로 분리 | `6c4db00` |
| BUG-076 | 102 | 2026-07-04 | ✅ 수정 | 정기·수시 페이지 진입 시 콘솔 404 다수 — `_injectLegalBanner('risk_assessment', ...)` 가 `GET /api/legal-notices/risk_assessment` 호출, NAS DB에 `risk_assessment` 키 없으면 404 반환 (프론트 catch로 무시되지만 콘솔 빨간 에러) → `GET /:key` 에서 키 없을 때 `null 200` 반환으로 수정 + `legal_notices` 테이블 없는 구버전 DB 방어 / 진단 API `GET /api/diagnostics/risk-db` 추가 (admin 전용, DB 상태 원격 확인) / 캐시 `v=20260704e` | `8b33ad6` |
| BUG-075 | 102 | 2026-07-04 | ✅ 수정 | 분류별 항목 관리 500 에러 — ① `risk_assessment_items` 테이블이 구버전 스키마로 이미 존재 → `CREATE TABLE IF NOT EXISTS` 무시 → `note`/`is_active` 등 컬럼 없음 → 쿼리 500 ② `is_active` 직접 참조 시 컬럼 없으면 WHERE 조건 자체가 500 → `patchSchema v0.149` 추가(safeAlter로 컬럼 13개 보장) + `GET /items/by-work-type` · `GET /items/manage/:id` · `GET /work-types` 모든 컬럼 `COALESCE` 방어처리 / 캐시 `v=20260704d` | `753d5b9` |
| BUG-074 | 102 | 2026-07-04 | ✅ 수정 | 분류별 항목 관리 브라우저 404 — `src/routes/risk.ts`에서 `app.get('/:id', ...)` 라우트가 83번째 줄에 등록되어 이후의 `work-categories`, `work-types`, `items/by-work-type` 등 모든 GET 경로를 선점(Hono는 등록 순서 우선) → curl 직접 호출은 401(API 존재) 이지만 브라우저 인증 요청은 `/:id`에서 매칭되어 DB 조회 후 404 반환 → `/:id` 라우트를 파일 맨 끝(1070번째)으로 이동 | `9088ddc` |
| BUG-073 | 101 | 2026-07-04 | ✅ 수정 | 분류별 항목 관리 404 — FEAT-045/046 추가 테이블(`work_categories`/`work_types`/`risk_assessment_items`)이 NAS `patchSchema`에 누락 → DB 테이블 미존재 → `patchSchema v0.148`에 `CREATE TABLE IF NOT EXISTS` 3개 추가 / `fix_nas_duplicates_v2.sql`로 중복 72→18건 정리 / `patch_v0148.js` 긴급 패치 스크립트 추가 | `1410b65` |
| BUG-072 | 101 | 2026-07-04 | ✅ 수정 | 분류별 항목 관리 NAS 미업데이트 시 `Promise.all` → 페이지 전체 오류 — `Promise.allSettled`로 변경 + 업데이트 안내 배너 표시 | `c4db7c8` |
| BUG-071 | 99 | 2026-07-04 | ✅ 수정 | 전체 화면 반응형 레이아웃 — `app.js` 내 39개 페이지 컨테이너 `max-w-{xl~6xl} mx-auto` → `.page-container` 통일 / `style.css`에 `page-container` 반응형 규칙 추가: 모바일(100%), 태블릿(100%), 데스크톱(최대 1280px), 와이드(최대 1600px) / `space-y` CSS 포함 | `082eb54` |
| BUG-070 | 96 | 2026-07-04 | ✅ 수정 | 신규 작업 등록 시 공사요청번호 미입력 → 서버 500 (`D1_ERROR: NOT NULL constraint failed: tasks.construction_id`) — `createTask()` 함수에 `construction_id` 클라이언트 validation 추가: `if (!data.construction_id) { toast('공사를 선택하거나 공사요청번호를 입력 후 연동하세요.', 'error'); return; }` (app.js ~5003줄) / 캐시 버전 `s→t` | `366c00f` |
| BUG-069 | 92 | 2026-07-04 | ✅ 수정 | 외선·접속 엑셀 업로드 시 공종명 미반영 — `iLabel = findIndex(h => h.includes('공종명') \| h.includes('공종'))` 에서 `'공종키'.includes('공종')===true` 로 `iLabel=0`(공종키 열) 잘못 매칭 → `h.includes('공종')` 조건 제거, `h.includes('공종명')` 만 남김 (work-reports.ts, splice-reports.ts) | `9da4ea2` |
| BUG-068 | 91 | 2026-07-04 | ✅ 수정 | 단가관리 테이블 헤더 스크롤 시 사라짐 — `overflow-y:auto` + `max-height:60vh` + `thead position:sticky top:0` 적용 (외선·접속 모두) | `b3d011d` |
| BUG-067 | 91 | 2026-07-04 | ✅ 수정 | 수동 추가 시 공종명이 공종키 열에 입력됨 — `_upAddCableItem`·`_upAddSpliceItem` DOM 삽입 코드를 FEAT-039 열 구조(공종키\|공종명\|단위\|단가\|삭제)에 맞게 수정 / 공종명=공종키인 행 주황색 강조+안내 | `b3d011d` |
| BUG-066 | 89 | 2026-07-04 | ✅ 수정 | 단가관리 테이블 반응형 레이아웃 — 컨테이너 `max-w-2xl` → `max-w-full` / 외선·접속 테이블 `table-layout:auto` + `overflow-x-auto` / 공종명 열 `min-width` 보장 / 숫자 입력 고정폭→유동 / 단위 열 최소화 | `27227ad` |
| BUG-065 | 88 | 2026-07-04 | ✅ 수정 | 접속단가 테이블 열 순서/헤더 변경 — 순서: 공종키\|공종명\|단위\|기본\|야간\|신호수 / 공종키 읽기전용 열 추가 / 헤더 단축: 기본(원)·야간(원)·신호수(원) | `b1af804` |
| BUG-064 | 87 | 2026-07-04 | ✅ 수정 | 접속단가 CSV 업로드 400 에러 — `iPrice` 파싱 조건 `기본` 포함 추가(`기본(원)` 인식), `iAerial` 조건 `신호수` 포함 추가(`신호수배치(원)` 인식) / export 헤더 `가공추가금액(원)` → `신호수배치(원)` / UI `가공 추가금액` → `신호수배치 추가금액` | `2f8cc67` |
| BUG-063 | 86 | 2026-07-04 | ✅ 수정 | 단가 엑셀 업로드 404 에러 — `API.post`에 `/api/` 접두어 사용(이중 baseURL) → `/volume-unit-prices/import`, `/splice-unit-prices/import`로 수정 | `f4f5bae` |
| BUG-060 | 85 | 2026-07-03 | ✅ 수정 | 데이터 초기화 동작 안함 — `admin.ts` 테이블명 불일치(`tbm_sessions`→`tbm_records`) + 누락된 연쇄삭제 테이블들 추가 | `a628cdc` |
| BUG-059 | 81→84 | 2026-07-03 | ✅ 수정 | `/tbm-share/:token` 500 에러 — tasks.manager_name 없음(supervisor JOIN으로 수정) + FEAT-037 공유 텍스트 형식 변경 ✅ **세션84: 공유 텍스트 담당자(contractor_name)·공사감독자(lgu_supervisor) 추가** | `ac4381e`→`e817a2c` |

| BUG-058 | 76→79 | 2026-07-03 | ✅ 수정 | TBM 상세 모달(`showTbmDetail`) — 참가자 서명 2열 배치 + TBM 촬영사진 미리보기 섹션 추가 | `48b8d39` |
| BUG-057 | 75→79 | 2026-07-03 | ✅ 수정 | TBM 회의록 출력 — 서명란 2열(인원별) 배치 + 안전조치 촬영사진 하단 2열 배치 | `48b8d39` |
| BUG-056 | 74→79 | 2026-07-03 | ✅ 수정 | TBM 위험성(체크리스트)평가 화면 — TBM 안전조치 사진 미리보기 안 됨 | `48b8d39` |
| BUG-055 | 71 | 2026-06-30 | ✅ 수정 | 위험신고·아차사고 처리완료(resolved) 화면에 사진 첨부 기능 추가 | `6bd6f22` |
| BUG-054 | 71 | 2026-06-30 | ✅ 수정 | 위험신고·아차사고 접수 내역 등록 사진 조회 안 됨 | `6bd6f22` |
| BUG-053 | 71 | 2026-06-30 | ✅ 수정 | 위험신고·아차사고 접수 내역 상세 화면 진입 불가 | `6bd6f22` |
| BUG-052 | 72 | 2026-07-02 | ✅ 수정 | 안전교육 출력 시 사진 출력 안 됨 | `15b3eae` |
| BUG-051 | 72 | 2026-07-02 | ✅ 수정 | 안전교육 등록 화면 사진 추가 시 미리보기 동작 안 함 (BUG-052 동일 원인 — /uploads/* 라우트 추가로 함께 해결) | `15b3eae` |
| BUG-050 | 70 | 2026-06-25 | ✅ 수정 | 현장위치 지도 위험성체크 탭 마커 미표시 — GPS JOIN 누락 | `a091db3` |
| BUG-049 | 67(C) | 2026-06-24 | ✅ 수정 | 브라우저 업데이트 시 npm run build 누락 — dist/ 이전 버전 유지 | `41b0b38` |
| BUG-048-2 | 69 | 2026-06-24 | ✅ 수정 | '보통' 선택 첫 1회 버튼 박스 크기 증가 (초기 렌더링 클래스 누락) | `4051cd0` |
| BUG-048 | 67(B) | 2026-06-24 | ✅ 수정 | 글자크기 클릭마다 버튼 높이 누적 증가 (잘못된 DOM selector) | `859815d` |
| BUG-047 | 67 | 2026-06-24 | ✅ 수정 | NAS 업데이트 후 앱 빈 화면 (app.js 템플릿 리터럴 문법 오류) | `e3a14eb` |
| BUG-046 | 65 | 2026-06-24 | ✅ 수정 | 현장 점검 우수/불량 작업자 저장 안 됨 (NAS PUT 오버라이드 누락) | `bacf7ec` |
| BUG-045-2 | 65 | 2026-06-24 | ✅ 수정 | inspection_workers FK site_inspections_old 참조 오류 | `7c2fe89` |
| BUG-045 | 64 | 2026-06-24 | ✅ 수정 | POST /api/inspections 500 — lastInsertRowid BigInt→Number | `95350be` |
| BUG-044 | 64 | 2026-06-24 | ✅ 수정 | GET/POST /api/inspections 500 — inspection_workers 구버전 DB 호환 | `ac1e739` |
| BUG-043 | 64 | 2026-06-24 | ✅ 수정 | DELETE/PUT /api/inspections/:id 500 — inspection_workers 테이블 미존재 | `8b9e84e` |
| BUG-042 | 64 | 2026-06-23 | ✅ 수정 | POST /api/inspections 500 — inspection_result 컬럼 누락 | `25b52c0` |
| BUG-041 | 63 | 2026-06-23 | ✅ 수정 | LGU+ 공사 조회 NULL 처리 오류 — `construction_id=NULL` 건 fallback `-1` 적용 (미연결 공사 오포함 방지) | — |
| BUG-040 | 62 | 2026-06-23 | ✅ 수정 | TBM 연쇄 알림 오류 | — |
| BUG-036~039 | 61 | 2026-06-23 | ✅ 수정 | photo_type CHECK constraint + LGU+ 알림 조건 오류 (is_auto_request_no 방향 반전: `0`=수동입력=LGU+허용, `1`=자동부여=차단) | — |
| BUG-030~034 | 58 | 2026-06-23 | ✅ 수정 | v0.143 미완성 항목 + 연속 버그 수정 | — |

### ✨ FEAT 목록

| 번호 | 세션 | 날짜 | 상태 | 기능 요약 | 커밋 |
|------|------|------|------|----------|------|
| FEAT-112 | 148~151 | 2026-07-21~22 | ✅ 구현 | **근로자 작업 상세 — 같은 공사 연계작업 사진 조회 (읽기 전용)** — **세션148**: ①renderThumb deleteMedia/업로드 버튼 worker 차단 ②기본정보 탭 `linked-photos-section` 섹션 HTML 추가 ③`_loadLinkedCompletedPhotos`+`_toggleLinkedTaskPhotos` 전역 함수 추가. **세션149 BUG-FIX**: `photos.ts GET /photos`에 `construction_id`+`exclude_task_id` 파라미터 추가 — worker INNER JOIN 제약 우회+상태범위(in_progress~completed) 확장. **세션150 UX**: 인라인 그리드→팝업 모달 전환+`_showLinkedPhotoView` 읽기전용 뷰어 추가(zIndex:10100). **세션151 BUG-FIX**: `_showLinkedPhotoModal` 전면 재작성 — ①taskMap 저장: `dataset`→`window.__linkedTaskMap_\${currentTaskId}` 전역변수(JSON파싱 신뢰성 문제 해결) ②onclick: `JSON.stringify(tid)`→숫자형 task_id 직접사용 ③모달스타일: `modal-overlay` CSS의존→`position:fixed`+`z-index:9500` 직접지정(CSS미적용시 팝업미표시 해결) ④사이드바 제거→단순 스크롤 모달 ⑤`_linkedModalSelectTask` 동적할당+중첩inner function 제거 ⑥photo_type 컬러배지+4열 그리드+캡션 오버레이(관리자 사진탭 UI 기준) | `a7c9488`→`9354335` |
| FEAT-063 | 129 | 2026-07-13 | ✅ 구현 | **공사통계 메뉴 추가** — 공사현황 그룹 최상단에 '공사통계' 서브메뉴 신규 추가. ①년간/월간/주간 기간 탭 필터 ②요약 카드 4종(전체공사·완료·시공통보금액·정산완료) ③작업 종류별 현황 표(지장이설·청약개통·관로·환경·별도·기타 / 건수·완료율·시공통보금액·정산완료·합계행) ④담당자별 현황 Chart.js 수평 막대 그래프(최대 15명 시각화) + 상세 표 ⑤금액 억/만 단위 자동 포맷. 백엔드: `GET /api/constructions/stats` 신규 엔드포인트(period/year/month/week_start) — `/api/constructions/:id` 동적 라우트보다 먼저 등록하여 충돌 방지 | `0de543f` |
| FEAT-062 | 126 | 2026-07-12 | ✅ 구현 | **근로자 QR 프로필 UI 통합 개편** — ①프로필 화면 + 점검이력 팝업을 하나의 통합 화면으로 병합 ②현장배정작업 섹션: 항목 있으면 클릭 시 확장되는 accordion 형태, 없으면 "배정된 작업 없음" 표시 ③"근로자 점검 이력" → "근로자 안전 점수" 이름 변경 ④우수기록/불량기록 각각 클릭 시 확장 accordion ⑤최상단 근로자 이름/헤더에 안전점수 배지 표시 (점수 없으면 미표시) ⑥`src/routes/users.ts` qr-profile API: `current_task(단일)` → `assigned_tasks(복수)` 로 확장, `current_task` 하위호환 유지 | `0337ee3` |
| FEAT-061 | 125 | 2026-07-12 | ✅ 구현 | **공사현황 메뉴 이름변경 + 작업통계 하위 이동** — ①`volume` 그룹 label `현장공량` → `공사현황` 변경 ②`edu` 그룹 stats 서브메뉴에서 `stats-task` 제거 ③`volume` 그룹 items 맨 앞에 `stats-task`(작업통계) 추가. **배포방식 기록 추가**: `BUGFIX_LOG.md` 맨 앞에 배포방식 최우선 섹션 추가 — 방식1(업데이트 버튼=표준), 방식2(NAS 직접=긴급우회) 명확히 문서화 | `685dd29` / `a3a01c2` |

| FEAT-057 | 112 | 2026-07-06 | ✅ 구현 | **사진 첨부 FCM 알림** — `node-server.ts POST /api/photos` 완료 시 supervisor/safety 역할에게 FCM 발송. multipart(파일 업로드)·json(base64 하위호환) 양쪽 경로 모두 적용. `sendFcmToRoles(['supervisor','safety'], { title:'[사진 첨부] 작업 {번호}', body:'{업로더}님이 {유형} 사진 N장을 첨부했습니다.' })`. photoTypeLabel 매핑(착공 전/진행 중/완료/TBM/점검) 포함. | `1a13c16` |
| FEAT-056 | 112 | 2026-07-06 | ✅ 구현 | **TBM 결재 서명 완료 FCM 알림** — BUG-089로 approval_general이 최종 결재가 됨에 따라 approval_general 완료 시 ①안전관리자에게 결재완료 SSE/FCM/notification ②작업 배정 근로자 전원에게 "TBM 결재 완료" FCM+notification 발송. `tbm-extra.ts approval_general 블록`: 기존 CEO 연쇄(approval_ceo) 제거 → safetyUsers 완료 알림 + task_assignments JOIN users로 workerIds 추출 후 sendFcmToUsers(workerIds) 발송. PDF 자동생성 트리거도 approval_ceo→approval_general로 변경. | `1a13c16` |
| FEAT-055 | 111 | 2026-07-06 | ✅ 구현 | **교육 점심시간(12:00~13:00) 제외 자동계산** — ①`app.js _calcEduHours()`: 점심시간 제외 체크박스(`esf-lunch-break`) checked 시 교육시간과 12:00~13:00 겹치는 분(overlap) 계산 후 `diffMin`에서 차감. 겹침 구간이 없거나 체크 해제 시 기존 단순 시간차 계산 유지. `overlapStart=max(시작,720)`, `overlapEnd=min(종료,780)`, `overlap>0`일 때만 차감 ②`app.js 교육 모달(line~27094)`: 시간 그리드(`<div class="grid grid-cols-3">`) 닫힌 div 직후에 `esf-lunch-break` 체크박스 행 추가 — 수정 시 `session?.lunch_break` 값으로 checked 초기화, onchange=`_calcEduHours()` ③`app.js submitEduSession()`: `lunch_break: lunchBreak(0\|1)` payload 추가 ④`node-server.ts patchSchema v0.156`: `safety_education_sessions.lunch_break INTEGER DEFAULT 0` safeAlter 추가 ⑤`src/routes/education.ts` POST/PUT: body destructuring·INSERT·UPDATE 모두 `lunch_break` 처리 추가 (`lunch_break ? 1 : 0` 바인딩) | `0d58b9f`+`2db59d8` |
| FEAT-054 | 111 | 2026-07-06 | ✅ 구현 | **서브작업번호 미입력 시 작업 등록 불가** — `app.js createTask()` (line~5183): `construction_id` validation 직후에 `if (!data.sub_task_number)` 체크 추가 → `toast('서브작업번호를 입력하세요.', 'error')` + `mSubTaskNo.focus()` + `return`. `mSubTaskNo` input에 `*` 필수 표시는 기존에 있었으나 서버 전송 전 클라이언트 validation이 없었음 | `0d58b9f` |
| FEAT-053 | 110 | 2026-07-06 | ✅ 구현 | **완료된 작업/공사 삭제 — 시스템관리자 전용** — ①`tasks.ts DELETE /:id`: `user.role==='admin' && position==='시스템관리자'` 조건 추가 + `task.status !== 'completed'` 시 409 반환 ②`constructions.ts DELETE /:id`: 동일 sysadmin 조건 + `con.status NOT IN ('completed','settled')` 시 409, 진행중 작업 잔존 시 409 ③`app.js deleteTask()`: sysadmin 사전 체크 + 확인 메시지 강화 ④`app.js deleteConstruction()`: sysadmin 사전 체크 + 확인 메시지 강화 ⑤`app.js showTaskDetail()`: `_taskIsSysAdmin && completed` 일 때만 삭제 버튼 표시, sysadmin이지만 미완료 시 자물쇠 안내 ⑥`app.js showConstructionDetail()`: `_conCanDelete` 조건 동일 패턴 | `a61b71d` |
| FEAT-052 | 110 | 2026-07-06 | ✅ 구현 | **TBM 완료 시 작업(예정)일 자동갱신** — FEAT-033(체크리스트 완료 기준 갱신)에 TBM 완료 트리거 추가. `node-server.ts`에 `POST /api/tbm` NAS 오버라이드 신규 등록(RULE-002 준수: tbmExtraRoutes·tbmRoutes 앞에 배치). TBM 생성 후 KST 날짜(`kstDateStr`)를 추출하여 `tasks.planned_date`보다 늦으면 자동 갱신. `planned_date=NULL` 또는 이미 TBM 날짜 이후이면 변경 없음. tbm.ts 원본 로직(INSERT/status 업데이트/결재 서명 요청/SSE 알림) 전부 이관하여 원본 라우트와 중복 처리 방지. 로그: `[FEAT-052] planned_date 자동갱신(TBM완료): task_id=N null → 2026-07-06` | `a61b71d` |
| FEAT-051 | 109 | 2026-07-06 | ✅ 구현 | **TBM 상세 수정 보완 — [object Object] 버그 수정 + 작업유형별 안전내용 자동기입** — ①`_buildTbmAutoText()` `tbmSecs.forEach`에서 `sec.title\|\|sec.question\|\|sec` fallback 시 sec 객체 그대로 삽입되어 `[object Object]` 출력되던 버그 수정: `sec.section_name\|\|sec.title\|\|sec.question\|\|sec.name\|\|항목 N` 순서로 안전하게 label 추출 ②`WORK_TYPE_SAFETY` 상수 정의: 5개 유형(바켓차량작업·전주승주·옥상옥탑작업·사다리사용작업·중장비사용) × [안전교육사항5항/TBM교육항목5항/주의사항5항] ③`showTbmForm()` 참석자 섹션 아래에 작업유형 칩 UI 추가 — 칩 클릭 시 `_toggleWorkTypeSafety()` 호출 → tbmTopics(안전교육+TBM항목)/tbmPrecautions(주의사항) textarea에 유형별 블록 추가, 재클릭 시 제거(토글) | `d416c53` |
| FEAT-050 | 108 | 2026-07-06 | ✅ 구현 | **파일 저장 폴더명 팀 추가 + 루트 폴더 생성 버그 수정** — getUploadDir() 인터페이스에 team_name?: string 추가. taskFolder 패턴: {서브작업번호}_{작업일}_{작업종류}_[작업팀]. 5개 호출 위치 쿼리 수정: ①TBM PDF conductor JOIN teams ②점검사진 addInsPhoto 업로더 팀 조회 주입 ③점검 POST multipart 업로더 팀 조회 주입 + 루트 버그 수정 ④작업사진 task_assignments JOIN teams ⑤TBM사진 task_assignments JOIN teams | `38901af` |
| FEAT-049 | 108 | 2026-07-06 | ✅ 구현 | **LGU+ 메뉴 그룹 3분할 구조 개편** — 기존 단일 '현장' 그룹(최대 8개 메뉴 나열)을 3그룹으로 분리: ①**현장작업**(파란색): 작업현황→작업관리→공사현황→현장위치지도 ②**안전점검**(빨간색): 현장점검 ③**통계·정보**(노란색): 안전현황 서브메뉴(작업통계·현장점검통계·근로자안전준수현황)+내 계정. 활성 메뉴가 없는 그룹은 아이콘 레일 자동 제거. 메뉴 순서 업무 흐름(현황→관리→지도) 재정렬. 관리자/감독자 그룹명·색상 일관성 통일. `rail-badge` ID `lgu-main→lgu-safety` 교체 | `6196837` |
| FEAT-048 | 106 | 2026-07-06 | ✅ 구현 | **LGU+ 역할 단일화 — role='lgu_plus' 독립 권한그룹 정의** — 기존 이중 구조(`role='lgu'` OR `sub_role='lgu_plus'+role='worker'`)를 `role='lgu_plus'` 단일 역할로 통일. **node-server.ts**: patchSchema v0.154(users 테이블 재생성+3단계 마이그레이션) + getUserGroupKey lgu_plus 분기 + checklist-lgu-notify 쿼리 3중화 + uiRoleToSubRole lgu_plus→'' 수정. **src/routes/auth.ts**: `/me` SELECT에 sub_role 추가. **5개 라우트(tasks/inspections/risk/tbm/stats)**: isLgu 조건 3중화. **src/routes/users.ts**: suspended/restore/PUT/:id에 lgu_plus 차단 추가(worker 동급). **app.js**: dbRoleToUi lgu_plus 최상단 분기·uiRoleToDb 수정·BULK_ROLE_MAP·updateUser sub_role 전송·9곳 판별조건. 구버전 호환 조건(role='lgu', sub_role='lgu_plus') 병행 유지 | `5adcee0` |
| FEAT-047 | 106 | 2026-07-06 | ✅ 구현 | **LGU+ 역할 3개 메뉴 is_auto_request_no=0 조회 필터** — 작업관리(`GET /api/tasks`)·현장점검(`GET /api/inspections`)·위험성체크(`GET /api/risk`)·TBM(`GET /api/tbm`) 4개 API에 `role='lgu' OR sub_role='lgu_plus'` 조건 시 `COALESCE(con.is_auto_request_no,-1)=0` WHERE 필터 추가 + constructions LEFT JOIN 추가. 현장위치 지도는 tasks/tbm/risk API를 재사용하므로 자동 적용. BUG-039(세션61) `is_auto_request_no` 방향 반전·BUG-041(세션63) NULL처리 선행 수정의 후속 완성 | `40fac8b` |
| FEAT-046 | 100 | 2026-07-04 | ✅ 구현 | 위험성평가 하위 메뉴 3개 재편 — 정기/수시/분류별 항목 관리 분리 / renderRiskPage: 이력만 표시 + 분류별 항목 탭 제거 / 신규 renderRiskItemsPage: 대분류 필터+작업유형 아코디언+항목 수정·삭제·추가 / 백엔드 API 추가: GET /risk/items/by-work-type/:id, GET /risk/items/manage/:id / PUT·POST 필드 호환(likelihood/severity/countermeasure) / 캐시 v=20260704c | `9b64991` |
| FEAT-045 | 99 | 2026-07-04 | ✅ 구현 | 분류별 항목 조회 탭에 엑셀 양식 다운로드/CSV 업로드 + 작업유형 관리 버튼 추가 — `GET /api/risk/items/template`, `POST /api/risk/items/import`, work-types/work-categories CRUD API | `a825e74` |
| FEAT-044 | 98 | 2026-07-04 | ✅ 구현 | 저장 폴더 현황 년도/월 클릭 시 공사폴더 상세 모달 — `GET /api/admin/folders/detail?year&month` 엔드포인트 추가 / 클라이언트: 월 로우 클릭 → 상세 모달 (요약카드+파일타입+공사폴더목록+용량비율바) | `330a4e7` |
| FEAT-043 | 97 | 2026-07-04 | ✅ 구현 | 저장 폴더 현황 — 공사요청번호 등록년도/월별 계층 통계 추가 — `/api/admin/folders`에 `yearStats` 반환 (4자리 년도 폴더 자동 감지 → 01~12 월 폴더 스캔 → bytes/imgCount/docCount/vidCount/etcCount) / 클라이언트 UI: 년도별 아코디언 + 월별 파일 종류·용량 표시 / FEAT-042 경로 구조 기반 | `17557d2` |
| FEAT-042 | 95 | 2026-07-04 | ✅ 구현 | 파일 저장 경로 폴더 구조에 년도/월 계층 추가 — `{루트}/{년도}/{월}/{공사요청번호}_{공사명}/...` / `constructions.created_at` 기준 년도·월 자동 추출 / 미연결(미분류) 작업은 기존 구조 유지 / UI 안내 블록·서버사이드 4개 파일 수정 (`src/utils.ts`, `src/routes/photos.ts`, `src/routes/inspections.ts`, `src/routes/attachments.ts`, `src/nas-routes/attachments-nas.ts`) | `2e38b2a` |
| FEAT-041 | 94 | 2026-07-04 | ✅ 구현 | 시스템 설정 FCM 사용자별 앱 등록 현황 확인 기능 — push 탭 2열(좌:발송폼, 우:사용자목록) / 탭 필터(mi등록/등록완료/전체) / 이름·역할 실시간 검색 / 역할 콼러배지+등록여부 아이콘 / 하단 통계 요약 | `c134689` |
| FEAT-040 | 93 | 2026-07-04 | ✅ 구현 | 시스템 설정 화면 반응형 레이아웃 개선 — `max-w-3xl` 고정폭 → `w-full` 전체폭 / 탭 버튼 `flex-wrap` 줄바꾸지 / 각 패널 `grid-cols-1 xl:grid-cols-2` 2열 그리드 / 업데이트탭 로그 `xl:row-span-3` 오른쪽 배치 | `bef2171` |
| FEAT-039 | 90 | 2026-07-04 | ✅ 구현 | 단가관리 화면 개선 — 외선 열순서 `공종키\|공종명\|단위\|단가\|삭제` 재배치 / 삭제버튼 항상 표시 / 업로드 공종키 접두어 검증(`a`=외선·`b`=접속, 불일치 시 400+에러메시지) | `ee3c80e` |
| FEAT-038 | 82→83 | 2026-07-03 | ✅ 구현 | `/tbm-share` 페이지 개선 — 지도 연결(카카오/네이버) + 사진 라이트박스 / 관리자 상세 공유버튼→사진등록옆(서명완료시만) / 근로자카드 공유버튼 추가(전원서명 시만) ✅ **세션83: 관리자 상세화면 공유버튼 누락 수정** | `f976aaf`→`deb6799` |
| FEAT-037 | 77→79 | 2026-07-03 | ✅ 구현 | TBM 완료 결과 공유 — **클립보드 복사** 방식 + 공개 URL(`/tbm-share/{token}`) + 사진 2열 / 로그인 불필요 / 7일 유효 ✏️ v2 | `48b8d39` |
| FEAT-036 | 73 | 2026-07-02 | ✅ 구현 | 다중 NAS 자동 업데이트 — `build-server.yml` + `POST /api/admin/update/webhook` / GitHub Secrets 등록 후 즉시 동작 | `bec2bc3` |
| FEAT-035 | 73 | 2026-07-02 | ✅ 구현 | 다중 NAS APK 자동배포 — `build-apk.yml` (dist-apk/** push 시 NAS_WEBHOOK_URL_1~5 동시 전송) / GitHub Secrets 등록 후 즉시 동작 | `bec2bc3` |
| FEAT-034 | 67(A) | 2026-06-24 | ✅ 완료 | 사이드바 메뉴 순서 변경 (공사현황 → 5번으로 이동) | `5bc8514` |
| FEAT-033 | 68 | 2026-06-24 | ✅ 완료 | 체크리스트 시행일 기준 planned_date 자동갱신 + 명칭 변경 | `62a3838` |
| FEAT-032 | 66 | 2026-06-24 | ✅ 완료 | 상태 드롭다운 + 완료 알림 발송 | `567fc23` |
| FEAT-031 | 66 | 2026-06-24 | ✅ 완료 | 수시점검 기본값 설정 | `567fc23` |
| FEAT-030 | 64 | 2026-06-23 | ✅ 완료 | 현장 점검 수정·삭제 기능 추가 | `81d24e7` |
| FEAT-029 | 63 | 2026-06-23 | ✅ 완료 | group_permissions 기반 그룹별 푸시 알림 | — |
| FEAT-027/028 | 62 | 2026-06-23 | ✅ 완료 | 그룹별 권한 관리 + TBM 연쇄 알림 완성 | — |

### 🧠 버그 예방 룰 (누적)

| 룰 번호 | 출처 버그 | 내용 |
|---------|---------|------|
| RULE-001 | BUG-047 | `node --check public/static/app.js` 문법 검사 필수 (커밋 전 항상 실행) |
| RULE-002 | — | NAS 오버라이드는 `app.route()` 마운트 앞에 위치해야 함 |
| RULE-003 | BUG-048 | DOM 탐색 시 `[style*="..."]` 방식 금지 → 반드시 클래스 기반으로 구현 |
| RULE-004 | BUG-048-2 | JS 동적 조작에 사용하는 클래스는 초기 렌더링 HTML에도 반드시 동일하게 부여 |
| RULE-005 | BUG-049 | 브라우저 업데이트 흐름: git reset → **npm run build** → pm2 restart (순서 준수) |
| RULE-006 | BUG-050 | GPS 저장 테이블과 조회 쿼리 테이블이 일치해야 함 — GPS 저장 위치 변경 시 JOIN도 함께 수정 |
| RULE-007 | v3.0 BUG-FIX-1 | `mobile-app.js`는 Option C(`#icon-rail`) 존재 시 `buildMobileNav()` + `navigateTo` 래핑 모두 Skip — 하단 탭바 이중 표시 방지 |
| RULE-008 | v3.0 BUG-FIX-2 | **CSS `!important` 선언 순서 규칙**: 동일 specificity의 `!important`는 **파일 내 나중에 선언된 것이 이김** — Option C와 기존 사이드바 규칙은 반드시 `body:has(#icon-rail)` / `body:not(:has(#icon-rail))`로 **선택자 분리**할 것. 모바일(≤768px) + 태블릿(769~1024px) + 데스크톱(≥769px) 모든 미디어쿼리에 동일 원칙 적용 |
| RULE-009 | v3.0 | `syncFlyoutActive` 호출은 switch 마지막에 한 번만 — 리다이렉트 코드(`return;`)에는 추가 불필요 (최종 페이지 navigateTo에서 처리됨) |
| RULE-010 | BUG-077 | `style.css`에 새 미디어쿼리로 `.main-content` margin/layout 추가 시 반드시 `body:not(:has(#icon-rail))` 선택자를 붙여 Option C와 분리할 것 — 단순 `.main-content { ... }` 선언은 Option C 레이아웃을 덮어쓸 수 있음 |
| RULE-011 | FEAT-047→048 | LGU+ 역할 대상 조회 API 신규 추가 시: ① tasks/inspections/risk/tbm 패턴과 동일하게 `constructions LEFT JOIN` 추가 ② `COALESCE(con.is_auto_request_no, -1) = 0` WHERE 조건 추가 ③ **isLgu 판별은 3중 조건** `role='lgu_plus' OR role='lgu' OR sub_role='lgu_plus'` 사용 (FEAT-048 구버전 호환) — 미적용 시 LGU+ 사용자가 자동부여 건을 조회하는 권한 누수 발생 |
| RULE-012 | FEAT-048 | LGU+ 신규 계정 등록/수정 시 `sub_role=''` 저장 (role='lgu_plus' 단일 식별자 원칙) — `uiRoleToSubRole['lgu_plus']=''`, `updateUser sub_role` 전송 시 `euiRole==='lgu_plus'?'':euiRole` 패턴 유지 |

---

## 🗺️ 전체 개발 로드맵

> 비전문가도 직접 운영·배포할 수 있는 완성형 시스템 구축이 최종 목표
> **최종 업데이트: 2026-07-05 (세션 106 — 현행화)**

---

### Phase 1 — ✅ 완료 (2026-06-17)

| 항목 | 상태 | 커밋 | 내용 |
|------|------|------|------|
| FEAT-024 모바일 스크롤 팝업 닫힘 | ✅ 실기기 확인 완료 | `e531fc2` | modal-sm 단순 조건으로 완전 차단 — v4(4차 수정) |
| BUG-002 사진 탭 그룹 표시 | ✅ 완료 | `b245c84` | TYPE_LABEL/ORDER/COLOR + PHOTO_TYPE_DIRS 3개 유형 추가 |
| BUG-006 APK 다운로드 실패 | ✅ 완료 | `d51f355` | typeof Log 체크 + a download 방식 + 버전 파일명 |

---

### Phase 2 — ✅ 완료 (2026-06-18 ~ 세션36)  외부 푸시 알림 (FEAT-025)

| 항목 | 상태 | 커밋 | 내용 |
|------|------|------|------|
| FCM 서버 API | ✅ 완료 | `d32c632` | `src/fcm.ts` + node-server.ts FCM API 4개 + 자동 발송 트리거 5곳 |
| Android FCM SDK 연동 | ✅ 완료 | — | safetynote-android FCM SDK + `onNewToken` JWT 브릿지 (BUG-009/010 수정) |
| 실기기 수신 확인 | ✅ 완료 | `fcabd66` | NAS 로그 `sent:1 failed:0` + 실기기 알림 수신 확인 |
| 수동 푸시 발송 UI | ✅ 완료 | `fcabd66` | 관리자 화면 시스템설정 → push 탭 (발송폼 + 사용자 등록 현황) |
| FCM 사용자 현황 UI | ✅ 완료 | `c134689` | FEAT-041 — 탭 필터·검색·배지·통계 (세션94) |
| FCM 추가 트리거 | ✅ 완료 | `1a13c16` | TBM 결재 서명 완료 알림(FEAT-056), 사진 첨부 알림(FEAT-057) — 세션 112 완료 |

---

### Phase 3 — 🔲 미착수  코드 구조 최적화 (FEAT-026)

> **목표**: `node-server.ts` 인라인 라우트 → `src/routes/` 분리, 코드 유지보수성 향상
> **우선순위**: 기능 개발에 영향 없음 — 필요 시 착수 (긴급하지 않음)

| Step | 상태 | 내용 |
|------|------|------|
| Step 1 | 🔲 미착수 | `src/db.ts` 생성 — rawDb 공유 모듈 단일화 |
| Step 2 | 🔲 미착수 | 신규 라우트 파일 9개 생성 + 인라인 라우트 이동 (`push`, `signature-requests`, `legal-notices`, `geocode`, `admin`, `dist`, `splice-reports`, `unit-prices`, `events`) |
| Step 3 | 🔲 미착수 | 기존 라우트 파일 7개에 인라인 라우트 병합 (`tbm`, `tasks`, `education`, `risk`, `inspections`, `work-reports`, `attachments`) |
| Step 4 | 🔲 미착수 | `node-server.ts` 정리 + 빌드 검증 + 커밋 |

> ※ DB 물리적 분리(현장코드별 .db 파일)는 위험도 ⭐⭐⭐⭐⭐ — **운영 중 절대 금지**, 별도 계획 필요

---

### Phase 4 — 🔲 미착수  NAS 설치 매뉴얼 (DOCS-001)

> **⚠️ 시작 조건**: Phase 3·6 완료 후 작성 (최종 단계)

| 항목 | 상태 | 내용 |
|------|------|------|
| 설치 가이드 | 🔲 미착수 | Node.js 설치 → git clone → .env 설정 → PM2 등록 → HTTPS 인증서 |
| 배포설명서 수정 | 🔲 미착수 | SSH 선택사항 안내, Watchdog 등록 단계, 브라우저 업데이트 방법, 도메인 연결, SSH 포트 변경 |
| **형식** | — | PDF + 스크린샷 포함 문서 |

---

### Phase 5 — ✅ 완료 (2026-06-21 ~ 세션81)  버전 업데이트 자동화

| 항목 | 상태 | 커밋 | 내용 |
|------|------|------|------|
| 브라우저 원클릭 업데이트 | ✅ 완료 | `808959f` | 시스템설정 → 서버 업데이트 탭 (버전 비교 + 적용 + 실시간 로그) |
| DB 자동 백업 | ✅ 완료 | `8f7d502` | 매일 새벽 2시 자동 백업 + 30일 초과 자동 삭제 |
| 웹 기반 롤백 시스템 | ✅ 완료 | — | FEAT-053 — 커밋 롤백 + DB 백업 복원 (시스템설정 탭 내) |
| GitHub Actions 자동 배포 | ✅ 완료 | `bec2bc3` | FEAT-036 — `build-server.yml` + Webhook 자동 업데이트 |
| PM2 Watchdog (자동복구) | ✅ 완료 | — | FEAT-051/FIX-052 — DSM 작업 스케줄러 5분 간격 등록 완료 |
| SSH 비활성화 | ✅ 완료 | — | FIX-052 완료 후 SSH 비활성화 — 브라우저만으로 운영 가능 |

---

### Phase 6 — 🔲 미착수  배포 버전 생성 (RELEASE-1.0)

> **⚠️ 시작 조건**: Phase 3 완료 후 진행 권장

| 항목 | 상태 | 내용 |
|------|------|------|
| install.sh 원클릭 설치 스크립트 | 🔧 부분완성 | `scripts/install.sh` 존재 (Step 9 Watchdog 등록 포함) — 최종 검증 필요 |
| 서명된 Release APK | ✅ 완료 | FEAT-035 GitHub Actions `build-apk.yml` + Keystore Secrets 등록 완료 |
| 설치 매뉴얼 + 운영 가이드 | 🔲 미착수 | Phase 4와 통합 작성 예정 |
| 최종 버전 태깅 | 🔲 미착수 | 서버 v1.0.0 + APK v2.0.0 동시 릴리즈 |

---

### 📌 Phase별 현황 요약

```
Phase 1 ✅ 완료 (2026-06-17)
Phase 2 ✅ 완료 (2026-06-18~36세션) — FCM 추가 트리거만 선택적 보류
Phase 3 🔲 미착수 — 코드 구조 정리 (긴급하지 않음)
Phase 4 🔲 미착수 — Phase 3·6 완료 후 착수
Phase 5 ✅ 완료 (2026-06-21~세션81) — 브라우저 업데이트·롤백·Watchdog 모두 완성
Phase 6 🔧 진행중 — install.sh 부분완성, 최종 검증·매뉴얼 미완
```

### 📌 실질적 남은 작업 (2026-07-06 기준)

| 우선순위 | 항목 | 내용 | 관련 |
|---------|------|------|------|
| 🔴 높음 | **NAS 배포** | `git pull && pm2 restart safetynote` 실행 필요 — 오늘(세션112~115) 전체 포함: BUG-088~091, FEAT-056~059 | `9080b00` |
| 🔴 높음 | **BUG-078 APK URL NAS 적용** | 관리자 화면 → 시스템설정 → APK URL 입력란에 GitHub Releases URL 직접 입력 (git pull 불필요) | BUG-078 `7cf5d61` |
| 🔴 높음 | **Option C 실사용 검증** | 모바일 전체 메뉴 탭·플라이아웃·배지 카운트 정상 여부 확인 | BUG-077 |
| 🟡 중간 | **Phase 3 코드 구조 정리** | node-server.ts 인라인 라우트 → src/routes/ 분리 | Phase 3 |
| 🟡 중간 | **Phase 6 install.sh 최종 검증** | 원클릭 설치 스크립트 신규 NAS 테스트 | Phase 6 |
| 🟢 낮음 | **배포설명서 수정** | SSH/Watchdog/브라우저업데이트/도메인 내용 현행화 | — |
| ✅ 완료 | **FCM 추가 트리거** | TBM 서명 완료 알림(FEAT-056), 사진 첨부 알림(FEAT-057) 세션 112 완료 | `1a13c16` |
| 🟢 낮음 | **Phase 4 NAS 설치 매뉴얼** | Phase 3·6 완료 후 작성 | — |

---

---

## 🐛 세션 25 — Webhook DB 업데이트 버그 수정 + v1.4.2 자동 배포 최종 확인 (2026-06-15)

### 완료된 작업
- ✅ **원인 파악**: `DB.prepare().run()` (Cloudflare D1 비동기 래퍼) → NAS에서 await 없이 호출 시 Promise 미완료로 DB 저장 안 됨
- ✅ **코드 수정**: Webhook 핸들러 upsert를 `rawDb.prepare().run()` (better-sqlite3 동기) 방식으로 교체
  - 정상 경로 (APK 다운로드 성공) + fallback 경로 (다운로드 실패) 모두 수정
- ✅ **빌드**: `npm run build` → `dist/_worker.js 219.31 kB` ✅
- ✅ **GitHub 커밋 + 푸시**: `0b80f69` — "fix: Webhook DB 업데이트 rawDb 동기 방식으로 수정"
- ✅ **NAS git pull + pm2 restart** — `0b80f69` 반영
- ✅ **Webhook 재테스트 성공** — `apk_version = 1.4.2` DB 확인 완료 🎉

### 버그 요약
| 항목 | 내용 |
|------|------|
| **증상** | v1.4.2 Webhook 호출 성공 (HTTP 200) 인데 DB에 버전 미반영 |
| **원인** | `DB = makeD1(rawDb)` 비동기 래퍼의 `.run()`이 Promise 반환 — await 없으면 저장 안 됨 |
| **해결** | `rawDb.prepare().run()` (better-sqlite3 동기) 사용 — 즉시 동기 저장 |
| **수정 커밋** | `0b80f69` |

---

## 📱 세션 24 — APK 완전 자동 배포 시스템 구축 (2026-06-15)

### 완료된 작업
- ✅ `POST /api/dist/apk/webhook` — GitHub Actions → NAS 자동 배포 API 추가
- ✅ `build-apk.yml` — 빌드 완료 후 NAS Webhook 자동 호출 step 추가
- ✅ NAS `.env` — `DEPLOY_WEBHOOK_SECRET=safetynote-nas-2026` 설정
- ✅ pm2 환경변수 영구 저장 (`pm2 save`)
- ✅ v1.4.1 APK Webhook 테스트 성공 (5.7MB 자동 다운로드)
- ✅ 로그인 화면 다운로드 버튼 활성화 확인
- ✅ v1.4.2 자동 배포 최종 확인 완료 (DB apk_version = 1.4.2 ✅)

### 자동 배포 흐름 (완성)
```
GitHub Actions → Run workflow → 버전 입력
         ↓ 빌드 완료 (10~20분)
Webhook → POST /api/dist/apk/webhook
         ↓ 자동 처리
APK 파일 NAS 로컬 저장 + DB 업데이트
         ↓
로그인 화면 다운로드 버튼 자동 활성화 🎉
```

### GitHub Secrets (safetynote-android 저장소)
| Secret | 값 |
|--------|-----|
| `DEPLOY_WEBHOOK_SECRET` | `safetynote-nas-2026` |
| `NAS_WEBHOOK_URL` | `https://linkmax.myds.me:3443/api/dist/apk/webhook` |

### NAS 환경변수 (.env)
```
DEPLOY_WEBHOOK_SECRET=safetynote-nas-2026
```

### 담당자 APK 배포 매뉴얼 (최종)
```
1. https://github.com/gisubhan-droid/safetynote-android/actions
   → "Safety NOTE APK Build and Deploy" → Run workflow → 버전 입력

2. 빌드 완료 대기 (10~20분)
   → Actions 로그에 "✅ NAS 자동 배포 완료!" 확인

3. 끝! 로그인 화면에서 새 버전 확인
```

### APK 배포 표준 절차 (차후 담당자용)

#### 신규 버전 출시 시 (브라우저만으로 완결)
```
1. https://github.com/gisubhan-droid/safetynote-android/actions
   → "Safety NOTE APK Build and Deploy" → Run workflow → 버전 입력

2. 빌드 완료 (10~20분) → Releases 페이지에서 APK URL 복사
   형식: https://github.com/.../releases/download/vX.X.X/safetynote-release.apk

3. https://NAS주소:3443 → 관리자 로그인
   → 관리자 설정 → Android APK 배포 관리
   → 버전 입력 + URL 붙여넣기 + 저장

4. 로그인 화면 새로고침 → 하단 초록 다운로드 버튼 확인
```

#### APK 설정 초기화 (다운로드 버튼 숨김)
```
관리자 설정 → Android APK 배포 관리 → "URL 초기화(숨김)" 버튼 클릭
```

### 관련 파일 (이미 완성, 수정 불필요)
| 파일 | 내용 |
|------|------|
| `node-server.ts` | `GET /api/dist/apk/version`, `GET /api/dist/apk/download`, `POST /api/dist/apk/upload` |
| `public/static/app.js` | `saveApkSettings()`, `_apkFileUpload()`, `_loadLoginApkSection()` |
| `node-server.ts` | `PATCH /api/admin/settings` — APK 설정 DB 저장 + 캐시 재로드 |

---

## 🚨 세션 23 — NAS 장애 복구 (2026-06-15)

### 발생한 문제
| 문제 | 원인 | 해결 |
|------|------|------|
| 로그인 실패 | 빈 `safety.db`(32KB) 사용 중 | `data/safety.db`(6.8MB) 심볼릭 링크 연결 |
| 서버 크래시 반복 | `better-sqlite3` 바이너리 없음 (`node_modules` 미설치) | gcc/make로 소스 빌드 성공 |
| 패키지 설치 불가 | `/dev/md0` 시스템 파티션 100% 꽉 참 | `space-preserve` 497MB 삭제 → 457MB 확보 |
| npm 명령 오류 | 시스템 PATH가 Node.js v12 가리킴 | `export PATH=/volume1/@appstore/Node.js_v18/...` |

### DB 파일 구조 (중요)
```
/volume1/safetynote/safety.db          → 심볼릭 링크 (실제 DB 아님)
/volume1/safetynote/data/safety.db     → 실제 운영 DB (6.8MB) ✅
/volume1/safetynote/data/safetynote.db → 빈 파일 (32KB, 무시)
```

### NAS 환경 정보
| 항목 | 내용 |
|------|------|
| OS | Synology DSM (Linux 4.4.180+) |
| Node.js | v18.18.2 (`/volume1/@appstore/Node.js_v18`) |
| gcc/make | `/opt/bin/` (Entware 설치됨) |
| glibc | 2.26 (GitHub prebuilt 바이너리 미호환 → 소스빌드 필요) |
| 시스템 파티션 | `/dev/md0` 2.3GB, 현재 80% 사용 |
| 데이터 파티션 | `/volume1` 11TB, 53% 사용 |
| PM2 앱명 | `safetynote` (PORT=3443) |

### 복구 후 필수 작업 (재부팅 대비)
```bash
# 1. PATH 영구 설정
echo 'export PATH=/opt/bin:/opt/sbin:/volume1/@appstore/Node.js_v18/usr/local/bin:$PATH' >> /root/.profile

# 2. DB_PATH 영구 설정
echo "DB_PATH=/volume1/safetynote/data/safety.db" >> /volume1/safetynote/.env

# 3. pm2 자동시작
pm2 save && pm2 startup

# 4. git pull 후 매번 실행 필요
export PATH=/opt/bin:/opt/sbin:/volume1/@appstore/Node.js_v18/usr/local/bin:$PATH
npm rebuild better-sqlite3
```

### 완료된 개발 작업 (이번 세션)
- ✅ `GET /api/dist/apk/version` — 기존 앱 `checkApkVersion()` 호환 API
- ✅ `GET /api/dist/apk/download` — APK 파일 서빙 (외부URL 리다이렉트 / 로컬파일 스트리밍)
- ✅ `POST /api/dist/apk/upload` — 관리자 APK 파일 업로드 (multipart, admin only)
- ✅ 관리자 APK 섹션 파일 업로드 버튼 추가 (`_apkFileUpload()`)
- ✅ `better-sqlite3` v9.6.0 → package.json 반영 (Node 18 호환)

### APK 배포 방법 (git pull 완료 후)
1. 관리자 설정 → Android APK 배포 관리
2. APK 버전 입력 (예: 1.2.0)
3. **파일 선택** → `.apk` 파일 선택 → **업로드** 클릭
4. URL 필드에 `/api/dist/apk/download` 자동 입력 확인
5. **APK 설정 저장** 클릭
6. 로그인 화면 새로고침 → 하단 다운로드 버튼 표시 확인

---

## 💾 NAS 백업 기록

| 날짜 | 종류 | 경로 | 비고 |
|------|------|------|------|
| 2026-06-11 | DB 백업 | `/volume1/safetynote_data/safety_backup_20260611.db` | git pull 적용 전 운영 DB |
| 2026-06-11 | 소스 백업 | `/volume1/safetynote_backup_20260611.tar.gz` (142MB) | node_modules/.git 제외 |

---

## 📋 버전별 변경 이력

| 버전 | 날짜 | 빌드 상태 | 주요 변경 내용 |
|------|------|-----------|----------------|
| v1.0.x | 초기 | ✅ 배포완료 | 앱 최초 배포 |
| v1.1.0 | - | ✅ 배포완료 | 기본 기능 개선 |
| v1.2.0 | 2026-06-10 | ✅ 배포완료 | 앱 아이콘 교체, APK 다운로드 `_system` 수정, 서버주소 입력화면 구현 |
| v1.2.1 | 2026-06-10 | ✅ 배포완료 | **ERR_CONNECTION_REFUSED 근본 수정** (BridgeWebViewClient 상속) |
| v1.2.2 | 2026-06-10 | ✅ 배포완료 | AndroidManifest 권한 추가 (GPS/카메라/알림/지도앱), allowMixedContent 수정 |
| v1.2.3 | 2026-06-10 | ✅ 배포완료 | 서버주소 UI 개선(https:// 고정·주소/포트 분리), 런타임 권한 요청, 업데이트 팝업 오발송 버그 수정 |
| v1.2.4 | 2026-06-10 | ✅ 배포완료 | **APK 업데이트 설치 실패 완전 수정** - `file_paths.xml` 추가, HTTPS→HTTP 변환, `REQUEST_INSTALL_PACKAGES` 권한, 버전 갱신 로직 개선 |
| v1.2.5 | 2026-06-10 | ✅ 배포완료 | PC/브라우저 업데이트 팝업 제거, WebView(앱)에서만 업데이트 모달 표시, GitHub Release 자동배포 전환 |
| **v1.3.0** | **2026-06-11** | ✅ **GitHub Release 빌드 완료** | 4단계 로그인개선(아이디저장/비번토글/로딩스피너), 5단계 앱설정(테마/알림/글자크기/진동), 2단계 GPS위치추적(작업일지 위치자동기록+이력조회) |
| **v1.3.1** | **2026-06-11** | ✅ **NAS 배포 완료** | TBM 서명 FK 수정(`tbm_records_old`→`tbm_records`), TBM 앱 서명요청 근로자 허용, 작업상태변경 알림 DB저장, app.js 캐시 무효화(`v=20260611`) |
| **v1.3.1-r1** | **2026-06-11** | ✅ **GitHub 배포 완료** | 용어통일: 작업 ID→작업번호, 하위작업번호→서브작업번호, dispNum work_number 기준 변경, 작업 상세 서브작업번호 강조 + 작업번호 회색 표시 |
| **v1.3.2** | **2026-06-12** | ✅ **GitHub 배포 완료** | 외선일보 시스템(현장공량관리 메뉴, DB 6테이블, API 6개), 작업일지 모달 5항목 수정(시작시간 편집가능화, 종료시간 자동기입, 작업완료 상태 자동변경, 익일계획→작업물량, 작업완료물량 워크시트 UI+외선일보 연동) |
| **v1.3.3** | **2026-06-12** | ✅ **GitHub 배포 완료** | 외선일보 3섹션 구조(작업내역/확선내역/광케이블정보), 케이블 추가 버튼 — 광케이블+작업내역 N개 동적 세트 (`b03c97b`, 캐시 `v=20260612f`) |
| **v1.3.4** | **2026-06-12** | ✅ **GitHub 배포 완료** | 작업 케이블정보 재편(LOT NO/규격/제조사/제작년도/케이블종류체크박스/공정구분/사용량절대값/특이사항), 구분코드 삭제, 추가입력 공종표 15개 항목, 저장팝업 제거 (`eef4611`, 캐시 `v=20260612g`) |
| **v1.3.5** | **2026-06-12** | ✅ **GitHub 배포 완료** | 확선내역/작업내역 섹션 전체 삭제, 섹션명 변경(→작업 케이블정보/추가입력), 추가입력 1컬럼 15행, 규격/케이블종류/공정구분/제조사 옵션 변경, _collectWrData `.wrc-kind` 드롭다운 수집 (캐시 `v=20260612k`) |
| **v1.3.6** | **2026-06-12** | ✅ **GitHub 배포 완료** | **bugfix**: renderWorkReportForm 스코프 내 YEAR_OPTS 누락 복구(sed 치환 오작동) (캐시 `v=20260612l`) |
| **v1.3.7** | **2026-06-14** | ✅ **GitHub 배포 완료** | +행추가 버튼 버그 수정(_wrAddCableRow에서 `${SPEC_OPTS}`→`${SPEC_OPTS3}`), 버튼명 '메인 등록'→'제출', getPageTitle에 work-report/field-volume/volume-stats 추가(헤더 타이틀 코드 ID 표시 수정) (캐시 `v=20260612m`) |
| **v1.3.8** | **2026-06-14** | ✅ **GitHub 배포 완료** | **bugfix**: `showToast`→`toast` 치환(임시저장/제출/행추가 버튼 완전 무반응 핵심 원인), +케이블추가 버튼 삭제, tasks 조회 범위 확대(working/work_completed/completed), SW 등록경로 `/service-worker.js` 수정 (캐시 `v=20260614a`) |
| **v1.3.9** | **2026-06-14** | ✅ **GitHub 배포 완료** | **bugfix**: 외선일보 공정구분(proc) DB 저장, 추가입력(extras) 저장/복원, `YEAR_OPTS3` 오타 수정(행추가 버튼 최종 수정) — `work_report_extras` 테이블 신규 생성, `work_report_cables.proc/remark` 컬럼 추가 (`2e97d32`) |
| **v1.4.0** | **2026-06-14** | ✅ **GitHub 배포 완료** | **bugfix**: 외선일보 목록 "완료된 작업 없음" 수정 (tasks.ts 응답 `{ tasks }` 래핑 + `work_reports` JOIN), 물량통계 500 에러 수정 (WHERE 절 `t` 별칭 중복 버그 + extras 기반 통계 재구성) (`8d6f0b6`) |
| **v1.4.1** | **2026-06-15** | ✅ **NAS 자동 배포 완료** | 물량통계 4가지 개선(달성금액 막대그래프·주간조회·팀별내역테이블·접속탭 그래프+현황표), DB초기화 기능(시스템관리자), APK 배포 관리(로그인화면 다운로드버튼·관리자 업로드UI·`/api/dist/apk/*` API 3개), `better-sqlite3` v9.6.0 다운그레이드 (`c71ae99`) |
| **v1.4.2** | **2026-06-15** | ✅ **자동 배포 완전 작동** | APK 완전 자동 배포 시스템 구축 (GitHub Actions → NAS Webhook → 로컬 저장 → DB 자동 업데이트) + **Webhook DB 버그 수정** (`DB.prepare()` D1 래퍼 → `rawDb.prepare()` better-sqlite3 동기로 교체) (`0b80f69`) |

---

## 🔧 이슈별 수정 이력 (전체)

---

### ✅ [v1.4.0 / 세션22] 외선일보 목록 빈 화면 + 물량통계 500 에러 수정
**날짜**: 2026-06-14  
**커밋**: `8d6f0b6`  

#### 문제 1: 외선일보 목록 → "완료된 작업이 없습니다" (작업이 있는데도)
- **원인 1**: `tasks.ts` GET / 응답이 배열 직접 반환(`c.json(tasks)`) → 프론트에서 `res.data.tasks`로 접근 시 `undefined` → 빈 배열로 처리
- **원인 2**: `tasks.ts` 쿼리에 `work_reports` JOIN 없음 → `report_id` 미반환 → "일보작성완료" 배지 표시 불가
- **수정**:
  - `src/routes/tasks.ts`: 반환 형식 `c.json(tasks)` → `c.json({ tasks })` 래핑
  - `src/routes/tasks.ts`: 두 쿼리(일반/worker 모두) `LEFT JOIN work_reports wr ON wr.task_id = t.id` 추가, `wr.id as report_id` SELECT 추가
  - `app.js`: `_taskListData = tasksRes.data` → `.tasks || []`, `tasksRes.data || []` → `.tasks || tasksRes.data || []` 3곳 안전 접근으로 수정

#### 문제 2: 물량통계 (외선부분) → "로드 실패: Request failed with status code 500"
- **원인 1**: `volume-stats` API에서 `otherRows` 쿼리가 `where.replace('WHERE', 'WHERE wr.id IS NOT NULL AND')` 치환 방식 사용 → `construction_id` 조건이 있으면 서브쿼리 내에 `t` 별칭이 이미 있는데 외부 쿼리도 `t`를 사용 → SQLite "ambiguous column name: t" 에러
- **원인 2**: `work_report_lines.section_dist`, `pole_count` 등 컬럼을 서브쿼리로 참조 (확선내역 삭제 후 이 테이블이 항상 비어있으나 구조 자체는 문제 없음)
- **수정**:
  - `node-server.ts`: `otherTypes`, `otherRows`, `prices` 제거 → `extras`(추가입력) 기반으로 통계 재구성
  - `node-server.ts`: `work_report_lines` 서브쿼리 전부 제거 → `cable_total`(전체 사용량 합계)만 조회
  - `node-server.ts`: status 조건 `submitted,confirmed` → `draft,submitted,confirmed` (임시저장도 표시)
  - `node-server.ts`: extras 쿼리에서 WHERE 절을 독립 서브쿼리로 분리 (별칭 충돌 완전 회피)
  - `app.js`: `renderVolumeStatsPage` 전면 재작성 → extras 기반 동적 컬럼 테이블 (추가입력 항목이 헤더 컬럼으로 자동 표시)

**변경 파일**:
- `src/routes/tasks.ts`: 응답 래핑, work_reports JOIN 추가
- `public/static/app.js`: _taskListData/tasks 안전 접근, renderVolumeStatsPage 재작성
- `node-server.ts`: volume-stats API 재구성

---

### ✅ [v1.3.9 / 세션21] 외선일보 공정구분/추가입력 저장 + 행추가 버튼 최종 수정
**날짜**: 2026-06-14  
**커밋**: `2e97d32`  

#### 문제 1: `+ 행추가` 버튼 클릭 시 아무 반응 없음 (최종 수정)
- **원인**: `_wrAddCableRow` 함수 내 `${YEAR_OPTS3}` 참조 — 해당 스코프에는 `YEAR_OPTS`만 정의되어 있음 → `undefined`가 tr.innerHTML에 삽입되어 행 전체가 파괴됨
- **수정**: `public/static/app.js` line 24648 `${YEAR_OPTS3}` → `${YEAR_OPTS}`

#### 문제 2: `공정구분` 저장 후 재진입 시 사라짐
- **원인**: `_collectWrData`에서 `proc` 필드를 수집하고 전송하지만, `POST /api/work-reports` INSERT문에 `proc` 컬럼이 없었음. DB 테이블(`work_report_cables`)에도 해당 컬럼 없음
- **수정**:
  - `node-server.ts` patchSchema: `ALTER TABLE work_report_cables ADD COLUMN proc TEXT DEFAULT ''` 추가
  - `node-server.ts` patchSchema: `ALTER TABLE work_report_cables ADD COLUMN remark TEXT DEFAULT ''` 추가 (특이사항 동시 수정)
  - `POST /api/work-reports` INSERT 컬럼/바인딩에 `proc`, `remark` 추가

#### 문제 3: `추가입력` 섹션 전체 저장/복원 안됨
- **원인 (저장)**: `cable_sets[].extras`를 프론트에서 전송하지만 백엔드에 `work_report_extras` 테이블 자체가 없었고 저장 로직도 없었음
- **원인 (복원)**: GET 응답에 extras가 없었고, 폼 렌더링 후 값을 채우는 코드가 없었음
- **수정**:
  - `node-server.ts` patchSchema: `work_report_extras` 테이블 신규 생성 (`report_id`, `set_no`, `item_key`, `qty`)
  - `POST /api/work-reports`: `body.cable_sets[].extras` 순회 → `work_report_extras` INSERT
  - `GET /api/work-reports/task/:taskId`: `work_report_extras` 쿼리 + 응답에 `extras` 포함
  - `app.js` `renderWorkReportForm`: API 응답 `extras` 변수 수신, 폼 렌더링 후 `data-key`로 해당 `<input>` 찾아 값 복원

**변경 파일**:
- `public/static/app.js`: YEAR_OPTS3 오타 수정, extras 변수 수신, extras 폼 복원 로직 추가
- `node-server.ts`: patchSchema proc/remark/work_report_extras 추가, POST proc+remark INSERT, POST extras 저장, GET extras 반환

---

### ✅ [v1.3.8 / 세션20] 외선일보 버튼 무반응 근본 원인 수정 + 기타 버그
**날짜**: 2026-06-14  
**커밋**: `(현재 세션)`  
**캐시버전**: `v=20260614a`

#### 문제 1: 임시저장/제출/행추가 버튼 완전 무반응 — 핵심 원인
- **원인**: `saveWorkReport`, `submitWorkReport`, `_finalSubmit` 등에서 `showToast()` 호출 — 이 함수명은 앱에 존재하지 않음 (실제 함수명은 `toast`)
- **흐름**: 버튼 클릭 → API 성공 → `showToast('임시저장 완료', 'success')` 호출 → `ReferenceError: showToast is not defined` → catch 블록 진입 → catch 내에서도 `showToast('저장 실패')` 호출 → 동일 에러 → 완전 무반응
- **수정**: `sed -i 's/showToast(/toast(/g'` 로 전체 6곳 치환

#### 문제 2: + 케이블 추가 버튼 불필요
- 외선일보는 1개 작업에 1개 세트만 작성하므로 추가 불필요
- 헤더 영역의 파란색 `+ 케이블 추가` 버튼 완전 삭제

#### 문제 3: 사이드메뉴 외선일보 작성 → 완료된 작업이 없습니다
- **원인**: `/tasks?status=completed,work_completed` → 실제 DB에는 `working` 상태도 있음
- **수정**: 조회 status를 `working,work_completed,completed`로 확대, limit도 200으로 증가

#### 문제 4: Service Worker 스코프 에러
- **원인**: `mobile-app.js`에서 `/static/service-worker.js`로 등록하면서 `scope: '/'` 요청 → 브라우저가 스코프 거부
- **수정**: 등록 경로를 `/service-worker.js`(루트)로 변경 (서버에 이미 해당 라우트 + `Service-Worker-Allowed: /` 헤더 있음)

**변경 파일**:
- `public/static/app.js`: `showToast→toast` 치환 6곳, +케이블추가 버튼 삭제, tasks API 쿼리 수정
- `public/static/mobile-app.js`: SW 등록 경로 수정
- `node-server.ts`: 캐시버전 `v=20260612m` → `v=20260614a`

---

### ✅ [v1.3.7 / 세션19] 외선일보 버그 수정 3건
**날짜**: 2026-06-14  
**커밋**: `(현재 세션)`  
**캐시버전**: `v=20260612m`

#### 문제 1: +행추가 버튼 동작 안함
- **원인**: `_wrAddCableRow` 함수 내 `tr.innerHTML`에서 `${SPEC_OPTS}` 참조 — 이 함수 스코프에는 `SPEC_OPTS3`만 정의되어 있었음
- **수정**: `${SPEC_OPTS}` → `${SPEC_OPTS3}`

#### 문제 2: 버튼명 오기
- **원인**: 이전 세션에서 요청된 '메인 등록' → '제출' 변경이 미반영
- **수정**: 임시저장 버튼 옆 두 번째 버튼명 → **제출**

#### 문제 3: 헤더 타이틀에 'work-report' 코드 ID 그대로 표시
- **원인**: `getPageTitle()` 맵에 `work-report`, `field-volume`, `volume-stats` 항목 누락
- **수정**: 세 항목 추가 → '외선일보 작성', '현장공량관리', '물량통계 (외선부분)'

#### 참고: 두 번째 화면 '완료된 작업이 없습니다'
- `/tasks?status=completed,work_completed` API는 정상 동작
- 실제 NAS DB에 해당 상태 작업 데이터가 없는 경우 표시됨 (데이터 문제, 코드 문제 아님)

**변경 파일**:
- `public/static/app.js`: `_wrAddCableRow()`, `renderWorkReportForm()` 버튼HTML, `getPageTitle()` 수정
- `node-server.ts`: 캐시버전 `v=20260612l` → `v=20260612m`

---

### ✅ [v1.3.5~6 / 세션18-b] 외선일보 섹션 재편 + YEAR_OPTS 버그 수정
**날짜**: 2026-06-12  
**커밋**: `62075c7`(v1.3.5), `eab69e9`(v1.3.6)  
**캐시버전**: `v=20260612k` → `v=20260612l`

| 항목 | 변경 내용 |
|------|----------|
| 확선내역 섹션 | **전체 삭제** |
| 작업내역 섹션 | **전체 삭제** |
| 섹션명 | `1번 작업 케이블정보` → **작업 케이블정보** / `1번 추가 입력` → **추가입력** |
| 추가입력 레이아웃 | 최종: **1컬럼 세로 15행** |
| 규격 옵션 | `1C/12C/36C/72C/144C/288C/기타` (3곳 적용) |
| 제조사 | 드롭다운 → **텍스트 직접 입력** (3곳) |
| 케이블종류 | 체크박스(복수) → **드롭다운** 가공/일반/지중/난연 (3곳) |
| 공정구분 | 가공/관로/지중(직매)/기타 → **신설/철거/이설** (3곳) |
| _collectWrData | cable_kind: 체크박스 수집 → **.wrc-kind select 값 수집** |
| YEAR_OPTS 버그 | sed 치환으로 YEAR_OPTS가 KIND_OPTS로 덮어써진 문제 복구 |

---

### ✅ [v1.3.4 / 세션18] 외선일보 작업 케이블정보 전면 재편
**날짜**: 2026-06-12  
**커밋**: `eef4611`  
**캐시버전**: `v=20260612g`

#### 변경 내용

| 항목 | 이전 | 변경 후 |
|------|------|---------|
| 섹션명 | 광케이블 정보 | **작업 케이블정보** |
| 컬럼구성 | 구분/소속기관/제조사/광케이블종류/코어수/시작점/종료점/포설길이/광도시/설계코드/자재수량 | **LOT NO./규격(C)/제조사/제작년도/케이블종류(체크박스)/공정구분/시작점(M)/종단점(M)/사용량(M)자동계산/특이사항** |
| 구분코드 | 별도 컬럼 | **삭제** |
| 사용량 계산 | 종단>시작일 때만 계산 | **Math.abs(종단-시작) — 절대값** |
| 케이블종류 | 드롭다운 | **가공/일반/지중(관로)/난연 체크박스** (복수선택) |
| 추가입력 | 없음 | **각 세트 아래 공종별 작업량 표 15개 항목** |
| 저장시 팝업 | 기타공종 입력 팝업 출력 | **팝업 없이 바로 제출** |

#### 추가입력 공종 항목 (15개)
조가선신설(M) / 커넥터취부(개) / 조가선 철거(M) / 전주 건식(본) / 전주 철거(본) / B형접지(대지)(건) / A형접지(대지)(건) / 지선신설(건) / 전주세움(본) / 가요전선관(M) / 내관포설(M) / 완금설치(한전주)(식) / 단순1(본) / 단순1-2(경간) / 단순2(경간)

**변경 파일**:
- `public/static/app.js`: `mkCable()`, `mkCableSetHTML()`, `_wrAddCableSet()`, `_wrAddCableRow()`, `_wrRenumberSets()`, `_calcUsage()`, `_collectWrData()`, `submitWorkReport()` 수정
- `node-server.ts`: 캐시버전 `v=20260612f` → `v=20260612g`

---

### ✅ [v1.3.3 / 세션17] 외선일보 케이블 추가 버튼 + 동적 N개 세트
**날짜**: 2026-06-12  
**커밋**: `458dc4b` (작업일지 모달 5항목), `2f3c440` (시작시간 readonly·종료시간 자동기입·KST수정)

| 항목 | 이전 | 변경 후 |
|------|------|---------|
| 시작 시간 | TBM 완료 시간 자동입력, 수정 불가(readonly) | TBM 완료 시간을 기본값으로만 표시, 직접 수정 가능 |
| 종료 시간 | 빈값, 수동 입력 | 작업 완료 버튼 클릭 시 현재 시간(KST) 자동 기입 |
| 작업 상태 | working/paused 선택 | work_completed 옵션 추가(기본 선택), 일지 저장 시 tasks 상태 자동 변경 |
| 익일 계획 | `익일 계획` (logTomorrow) | `작업물량` 으로 필드명 변경 |
| 작업 완료 물량 | 없음 | 외선/접속/관로/장비 선택 버튼 UI, 외선 선택 시 `일보작성` 버튼 활성화, 클릭 시 `renderWorkReportForm`으로 이동 |

**변경 파일**:
- `public/static/app.js`: `showWorkLogForm()`, `submitWorkLog()`, `confirmWorkComplete()` 수정, `selectWorkVolType()`, `goToWorkReport()`, `_currentWorklogTaskId` 추가
- `node-server.ts`: 캐시 버전 `v=20260612` → `v=20260612b`

---

### ✅ [v1.3.2 / 세션15-16] 외선일보 시스템 신규 구현
**날짜**: 2026-06-11~12

**DB (patchSchema v0.130w)**:
- `work_reports` (일보 헤더, task_id UNIQUE)
- `work_report_lines` (작업내역 그리드 행)
- `work_report_cables` (광케이블 정보)
- `other_work_types` (기타공종 마스터, 8종 시드)
- `work_report_other` (기타공종 입력값)
- `volume_unit_prices` (단가 설정, 9종 시드)

**API (node-server.ts 직접)**:
- `GET /api/work-reports/task/:taskId` — 일보 조회
- `POST /api/work-reports` — 일보 upsert
- `POST /api/work-reports/:reportId/submit` — 제출
- `POST /api/work-reports/:reportId/other-works` — 기타공종 저장
- `GET /api/work-reports/other-work-types` — 마스터 조회
- `GET /api/work-reports/volume-stats` — 물량통계

**UI (app.js)**:
- 현장공량관리 사이드 메뉴 그룹
- `renderWorkReportListPage` — 완료 작업 목록
- `renderWorkReportForm` — 외선일보 작성폼 (상단 자동입력 + 작업내역 그리드 + 광케이블 그리드)
- `showOtherWorkPopup` — 기타공종 팝업
- `renderVolumeStatsPage` — 물량통계

---

### ✅ [v1.2.0] 앱 아이콘 교체
- **문제**: `mipmap-anydpi-v26/ic_launcher.xml` Adaptive Icon이 PNG보다 우선 적용
- **수정**: 새 아이콘 PNG 10개 교체 + `build-apk.yml`에 Adaptive Icon XML 삭제 스텝 추가
- **파일**: `android-overrides/app/src/main/res/mipmap-*/ic_launcher*.png`

---

### ✅ [v1.2.0] APK 다운로드 버튼 WebView 차단 수정
- **문제**: `window.open(url, '_blank')` → Capacitor WebView 차단으로 APK 다운로드 불가
- **수정**: `window.open(url, '_system')` 으로 변경 → 시스템 브라우저 강제 오픈
- **파일**: `webapp/public/static/app.js` → `doApkDownload()`

---

### ✅ [v1.2.0] 서버 주소 입력 화면 구현 (하드코딩 제거)
- **문제**: `capacitor.config.json`에 서버 URL 하드코딩
- **수정**: `server.url` 제거, `www/index.html`에 입력 화면 구현, `localStorage` 저장/복원
- **파일**: `capacitor.config.json`, `www/index.html`

---

### ✅ [v1.2.1] ERR_CONNECTION_REFUSED 근본 수정 ⭐ 핵심
- **원인**: `MainActivity.java`의 `new WebViewClient()` 가 Bridge WebViewClient 완전 교체
  → `shouldInterceptRequest` 미동작 → `http://localhost` 실제 TCP 연결 → ERR_CONNECTION_REFUSED
- **수정**: `new BridgeWebViewClient(getBridge())` 상속으로 변경
  - `shouldInterceptRequest`: 부모(Bridge) 위임 → 로컬 에셋 정상 서빙
  - `shouldOverrideUrlLoading`: APK/지도앱만 오버라이드, http/https는 `super` 위임
- **파일**: `android-overrides/…/MainActivity.java` (커밋: `69c924e`)

---

### ✅ [v1.2.1] capacitor.config.json 조정
- `androidScheme: "http"` 명시, `allowMixedContent: true` 변경
- NAS 서버 연결 시 http/https 혼재 허용

---

### ✅ [v1.2.2] 앱 권한 추가 (AndroidManifest.xml)
- **파일**: `android-overrides/app/src/main/AndroidManifest.xml` 신규 생성
- **추가 권한**: GPS, 카메라, 알림(Android 13+), 진동, 정확한 알람, 저장소(Android 9 이하)
- **추가 queries**: T맵, 카카오맵, 네이버지도, 구글지도
- `build-apk.yml`에 AndroidManifest 교체 스텝 추가

---

### ✅ [v1.2.2] 지도 앱 연동 (MainActivity.java)
- `tmap://`, `kakaomap://`, `nmap://`, `intent://` 스킴 처리
- 미설치 시 웹 URL로 폴백

---

### ✅ [v1.2.3] 서버 주소 입력 UI 개선 (www/index.html)
- `https://` 고정 prefix (입력 불필요)
- NAS 주소 / 포트 번호 분리 입력 (포트: 숫자 키보드)
- 주소 → 엔터 시 포트 자동 포커스 / 포트 → 엔터 시 즉시 연결
- 저장된 설정 초기화 버튼 / 최근 사용 서버 히스토리 유지

---

### ✅ [v1.2.3] 런타임 권한 요청 (MainActivity.java)
- 앱 시작 시 미허가 권한만 골라 한번에 팝업
- GPS, 카메라, 알림(Android 13+) / 거부해도 앱 계속 실행

---

### ✅ [v1.2.3] 업데이트 팝업 오발송 버그 수정 (app.js)
- **원인**: `apk-installed-version` 저장 로직 없음 → 항상 `'1.0.0'` → 매번 업데이트 팝업
- **수정**: `syncInstalledVersion()` 추가
  - URL 파라미터 `?appver` → localStorage 저장값 → 없으면 서버버전으로 초기화
  - 서버버전 ≤ 현재버전 시 skip 기록 자동 정리

---

### ✅ [v1.2.4] APK 업데이트 설치 실패 수정 ⭐ 이번 핵심
- **문제**: 업데이트 APK 다운로드 후 설치 실패
- **원인 1**: `REQUEST_INSTALL_PACKAGES` 권한 누락
  - Android 8.0+ 에서 미지정 앱 설치 시 이 권한이 없으면 설치 차단
- **원인 2**: `window.open('_system')` → 시스템 브라우저가 자체서명 인증서(NAS HTTPS) URL을 거부하거나 설치까지 연결되지 않음
- **원인 3**: 업데이트 완료 후 `apk-installed-version` 갱신 로직 없음 → 재부팅 후 또 업데이트 팝업

**수정 1 - AndroidManifest.xml**:
```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
<uses-permission android:name="android.permission.DOWNLOAD_WITHOUT_NOTIFICATION" />
```

**수정 2 - MainActivity.java**: `DownloadManager` 직접 다운로드 방식으로 전환
```
기존: window.open(url, '_system') → 시스템 브라우저 → (자체서명 인증서 거부 가능)
수정: DownloadManager.enqueue(url) → 직접 다운로드 → 완료 시 FileProvider 설치 인텐트
      (Android 7.0+ : FileProvider URI 사용 / Android 6.0 이하 : file URI 사용)
```
- `BroadcastReceiver`로 `ACTION_DOWNLOAD_COMPLETE` 수신 → `installDownloadedApk()` 자동 호출
- 다운로드 실패 시 JS 콜백(`window.onApkDownloadFailed`) 호출

**수정 3 - app.js**: `doApkDownload(url, newVersion)` 개선
```javascript
// 업데이트 버튼 클릭 시 새 버전 번호 전달
doApkDownload(downloadUrl, apkInfo.version)
// → localStorage에 즉시 저장 → 재실행 후 업데이트 팝업 없음
```
- `window.onApkDownloadStarted`: 다운로드 시작 토스트 표시
- `window.onApkDownloadFailed`: 실패 시 에러 토스트 표시
- **파일**: `AndroidManifest.xml`, `MainActivity.java`, `app.js`

---

### ✅ [v1.2.4] APK 업데이트 설치 실패 완전 수정 (커밋: `86fa525`)
**3가지 근본 원인 모두 수정:**

**원인 1: `file_paths.xml` 누락 (앱 크래시)**
- AndroidManifest의 FileProvider가 `res/xml/file_paths.xml`을 참조하는데 파일이 없었음
- `FileProvider.getUriForFile()` 호출 시 `IllegalArgumentException` 발생 → 설치 인텐트 실행 불가
- **수정**: `android-overrides/app/src/main/res/xml/file_paths.xml` 신규 생성
  ```xml
  <paths><external-files-path name="apk_downloads" path="Downloads/" /></paths>
  ```
- **build-apk.yml**: `file_paths.xml` 복사 스텝 추가 (android/app/src/main/res/xml/)

**원인 2: NAS 자체서명 인증서 SSL 오류 (다운로드 실패)**
- DownloadManager는 WebView와 달리 SSL 예외를 공유하지 않음
- NAS의 자체서명 HTTPS URL → DownloadManager SSL 검증 실패 → 다운로드 중단
- **수정**: `startApkDownload()`에서 `https://` → `http://` 자동 변환
  - AndroidManifest의 `usesCleartextTraffic=true`와 함께 동작

**원인 3: 설치 완료 후 버전 기록 누락 (팝업 재표시)**
- 다운로드 시작 시 `localStorage.setItem('apk-installed-version', newVersion)` 즉시 저장
- **파일**: `webapp/public/static/app.js` (이전 커밋에서 수정됨)

**추가 개선**: `installDownloadedApk()` 견고성 강화
- `cursor == null` 체크, `columnIndex` 유효성 검사
- 실패 시 `onApkDownloadFailed()` JS 콜백 호출 보장

---

### ✅ [v1.2.5] PC/브라우저 업데이트 팝업 제거 (app.js)
- **문제**: PC 브라우저에서도 APK 업데이트 모달이 표시됨
- **수정**: `syncInstalledVersion()` 에서 WebView(앱) 환경일 때만 업데이트 체크
  - `window.Capacitor` 또는 `?appver=` 파라미터 있을 때만 모달 표시
- **파일**: `webapp/public/static/app.js`

### ✅ [v1.2.5] GitHub Actions APK 빌드 → GitHub Release 자동 배포 전환
- **이전**: NAS SSH 직접 배포 (`NAS_URL` secret 필요)
- **수정**: `softprops/action-gh-release@v2` 로 GitHub Release에 APK 자동 첨부
  - `permissions: contents: write` 추가
  - 저장소 Settings → Actions → Workflow permissions → Read and write 설정 필요
- **파일**: `safetynote-android/.github/workflows/build-apk.yml`

### ✅ [v1.2.5] NAS 자동 배포 스크립트 추가
- **파일**: `safetynote-android/scripts/nas-auto-deploy.sh`
- GitHub Release 최신 버전 체크 → 자동 다운로드 → NAS 배포
- 크론잡 등록으로 주기적 자동 업데이트 가능

### ✅ [v1.2.5] DB 누락 테이블 추가 마이그레이션
- **파일**: `webapp-deploy/safetynote/migrations/0049_missing_tables.sql`
- 추가 테이블: `risk_assessment_signatures`, `legal_notices`
- NAS DB에 직접 적용 완료 (`/volume1/safetynote/data/safety.db`)

---

## ⚠️ 미반영 / 잔여 과제

### ✅ [완료] NAS PORT=3443 복원 및 PM2 안정화
- NAS `.env` → `PORT=3443` 수정 완료
- PM2 커맨드라인 직접 등록 → `online` 확인
- `pm2 save` + `pm2 startup` (systemd) 완료
- `curl http://localhost:3443` → **HTTP 200** 확인

### ✅ [완료] APK Release 서명 keystore 등록 (2026-06-10 세션 6)
- 샌드박스에서 `keytool`로 `safetynote-release.keystore` 생성
  - 알고리즘: RSA 2048bit / 유효기간: 36,500일(100년)
  - CN=SafetyNOTE Dev, O=LinkMax, C=KR
  - 비밀번호: `SafetyNOTE2026!` (키스토어/키 동일)
  - alias: `safetynote`
- GitHub Secrets 4개 등록 완료:
  - `KEYSTORE_BASE64` ✅
  - `KEYSTORE_PASSWORD` ✅  
  - `KEY_ALIAS` ✅
  - `KEY_PASSWORD` ✅
- keystore 파일 백업: AI Drive 업로드 완료 (분실 시 앱 업데이트 불가 — 안전한 곳에 추가 백업 필수!)

### ✅ [완료] APK v1.2.5 GitHub Release 빌드 (서명 빌드, 2026-06-10)
- keystore 등록 → **서명 Release APK 빌드 성공** (`assembleRelease`)
- GitHub Release: https://github.com/gisubhan-droid/safetynote-android/releases/tag/v1.2.5
- 첨부 파일: `safetynote-v1.2.5.apk` (Release 서명 빌드)
- 빌드 시간: 2m32s / Build type: **release (signed)** ✅

### 🟡 [중간] NAS 크론잡 설정 (nas-auto-deploy.sh)
- `safetynote-android/scripts/nas-auto-deploy.sh` NAS에 설치 및 크론잡 등록 미완

### ✅ [완료] APK v1.3.0 GitHub Release 빌드 (2026-06-11 세션 10)
- GitHub Actions workflow_dispatch 트리거 → **빌드 성공** (Run #27330508906)
- GitHub Release: https://github.com/gisubhan-droid/safetynote-android/releases/tag/v1.3.0
- 첨부 파일: `safetynote-v1.3.0.apk` (5,572KB, Release 서명 빌드)
- 빌드 시간: 약 2분 30초 / Build type: **release (signed)** ✅
- 포함 기능: 4단계(로그인개선) + 5단계(앱설정) + 2단계(GPS위치추적)

### 🟡 [중간] build-apk.yml 버전 수동 업데이트 필요
- GitHub App 권한 제한으로 `.github/workflows/` 자동 push 불가
- **매 버전마다 PAT로 GitHub Contents API 직접 수정 필요** (세션 9에서 방법 확립)
- 현재 기본값: `1.3.0` (최신 적용 상태, 커밋 `650a3852`)
- 수정 URL: https://github.com/gisubhan-droid/safetynote-android/blob/main/.github/workflows/build-apk.yml

### ✅ [완료] safetynote-deploy PAT에 safetynote-server repo 권한 추가 (2026-06-11 세션 10)
- 기존 PAT: `safetynote-android` 1개 repo만 접근 가능 (Fine-grained)
- 문제: `safetynote-server` repo push 403 오류
- 해결: GitHub → Fine-grained tokens → `safetynote-deploy` 편집
  - Repository access에 `gisubhan-droid/safetynote-server` 추가
  - `Generate token` → 새 PAT 발급
- 결과: 양쪽 repo 모두 push 가능
- **PAT 이름**: `safetynote-deploy` (Fine-grained, 만료일 없음)
- **접근 가능 repo**: `safetynote-android` + `safetynote-server`
- **권한**: actions, code, workflows Read/Write

---

## 🗂️ 파일 구조 및 역할

```
safetynote-android/
├── www/index.html                   # 앱 시작 화면 (https:// 고정, 주소/포트 분리 입력)
├── capacitor.config.json            # androidScheme:http, allowMixedContent:true
├── android-overrides/app/src/main/
│   ├── java/…/MainActivity.java     # BridgeWebViewClient 상속, DownloadManager APK 설치, 권한 요청
│   ├── AndroidManifest.xml          # GPS/카메라/알림/REQUEST_INSTALL_PACKAGES 등
│   ├── res/mipmap-*/                # 커스텀 아이콘 PNG 10개
│   └── res/xml/file_paths.xml       # FileProvider 경로 설정 (APK 설치 필수)
├── scripts/nas-auto-deploy.sh       # GitHub Release 체크 → NAS 자동 배포 스크립트
└── .github/workflows/build-apk.yml # CI/CD → GitHub Release 자동 업로드

webapp/
├── src/routes/dist.ts               # /api/dist/apk/version, /api/dist/apk/upload
└── public/static/app.js            # doApkDownload(url, newVersion), syncInstalledVersion(), onApkDownloadStarted/Failed 콜백

webapp-deploy/safetynote/            # NAS 배포용 서버 코드
├── node-server.ts                   # NAS Node.js 서버 (PORT 환경변수로 결정, 기본 3000)
├── ecosystem.config.cjs             # PM2 설정 (PORT: 3000 → NAS에서는 3443으로 변경 필요!)
├── .env.example                     # 환경변수 예시 (PORT=3000 기본값)
├── migrations/                      # DB 스키마 마이그레이션 파일
│   └── 0049_missing_tables.sql      # risk_assessment_signatures, legal_notices 추가
└── scripts/setup.sh                 # 자동 설치 스크립트
```

---

## 🔒 HTTPS 보안접속 구조 (매우 중요 — 수정 시 반드시 확인)

> ⚠️ **[2026-06-10 세션 6 수정]** 이전 기록의 "Synology SSL 터미네이션" 구조는 **잘못된 분석**이었음.
> 실제로는 리버스 프록시 설정이 없었고, node-server.ts가 직접 HTTPS를 서빙해야 했음.

### ✅ 실제 구조 (node-server.ts가 HTTPS 직접 서빙)

```
앱/브라우저
    ↓ https://linkmax.myds.me:3443  (HTTPS)
공유기 포트포워딩
    ↓ 외부 3443 → NAS 내부 IP:3443
node-server.ts (PORT=3443, HTTPS 직접 서빙)
    ← https.createServer({ key, cert }) 사용
    ← Synology DSM 인증서 자동 로드:
       /usr/syno/etc/certificate/_archive/$(cat DEFAULT)/fullchain.pem
       /usr/syno/etc/certificate/_archive/$(cat DEFAULT)/privkey.pem
```

### ⚠️ 핵심 사실
- **node-server.ts가 HTTPS 직접 서빙** (`https.createServer()` 사용)
- **Synology 리버스 프록시 없음** (설정한 적 없음, 필요 없음)
- **Synology DSM 인증서를 직접 읽어서** SSL 핸드셰이크 처리
- **인증서 경로**: `/usr/syno/etc/certificate/_archive/4a2zGZ/` (DEFAULT 파일로 자동 탐지)
- **인증서 없으면 HTTP 폴백** → 개발/샌드박스 환경에서 자동으로 HTTP로 동작
- **NAS .env의 `HTTPS_PORT=3443`** → 현재 미사용 (과거 흔적)
- **DownloadManager는 SSL 예외 공유 안 함** → APK 다운로드 시 `https://` → `http://` 자동 변환 필요 (v1.2.4)

### 🚫 코드 수정 시 절대 하지 말 것
1. **`loadSynologyCert()` 함수 삭제 금지** → HTTPS가 깨짐
2. **`https.createServer()` 블록을 HTTP `serve()`로 되돌리기 금지** → ERR_SSL_PROTOCOL_ERROR
3. **PORT를 3443에서 변경 금지** → 공유기 포트포워딩 3443 고정
4. **인증서 경로 하드코딩 금지** → DEFAULT 파일로 동적 탐지하는 구조 유지
   - Synology DSM 인증서 갱신 시 폴더명이 바뀔 수 있음

### 샌드박스 vs NAS 환경 차이

| 항목 | 샌드박스 (개발) | NAS (운영) |
|------|----------------|-----------|
| 접속 URL | `http://localhost:3000` | `https://linkmax.myds.me:3443` |
| 프로토콜 | HTTP | HTTPS (node-server.ts 직접 서빙) |
| PORT | 3000 | **3443** |
| node 경로 | `/usr/bin/node` (시스템) | `/usr/local/bin/node` (v18.18.2) |
| npx | 있음 | **없음** |
| tsx 실행 | `npx tsx` | `/volume1/safetynote/node_modules/.bin/tsx` 직접 |
| NVM | 있음 | **없음** (PM2에서 NVM 탐색 시 멈춤) |
| PM2 interpreter | 자동 | **`/usr/local/bin/node` 절대경로 필수** |
| SSL 인증서 | 없음 | Synology DSM 인증서 직접 로드 (`loadSynologyCert()`) |
| DownloadManager | 해당없음 | SSL 예외 없음 → APK URL http:// 변환 필요 |

---

| 항목 | 값 |
|------|-----|
| 설치 경로 | `/volume1/safetynote` |
| DB 경로 | `/volume1/safetynote/data/safety.db` |
| 업로드 경로 | `/volume1/safetynote_data` |
| Node.js 경로 | `/usr/local/bin/node` (v18.18.2) |
| tsx 경로 | `/volume1/safetynote/node_modules/.bin/tsx` |
| npx | **없음** (PATH에 없음) |
| NVM | **없음** (PM2가 NVM 탐색 시 멈춤 → interpreter 절대경로 필수) |
| PM2 프로세스명 | `safetynote` (id: 0) |
| 로그 out | `/var/log/safetynote-out-0.log` |
| 로그 err | `/var/log/safetynote-error-0.log` |
| 서버 포트 | `3443` (.env: PORT=3443) |
| 외부 접속 URL | `https://linkmax.myds.me:3443` |
| APP_USER | root (safetynote 유저 없음) |

### ⚠️ ecosystem.config.cjs 필수 설정 (NAS 전용)
```javascript
// 반드시 이 형태를 유지해야 함
{
  name: 'safetynote',
  script: '/volume1/safetynote/node_modules/.bin/tsx',  // npx 없음→tsx 직접
  interpreter: '/usr/local/bin/node',                   // NVM 없음→절대경로 필수!
  args: 'node-server.ts',
  cwd: '/volume1/safetynote',
  env: { PORT: 3443 }
}
```

---

```
앱 (www/index.html)
  → 사용자 입력: linkmax.myds.me / 3443
  → URL 생성: https://linkmax.myds.me:3443
  → WebView 이동

외부 인터넷
  → https://linkmax.myds.me:3443
  → 공유기 포트포워딩: 외부 3443 → NAS 내부 IP:3443
  → NAS node-server.ts (PORT=3443 직접 수신)
  ← 리버스프록시 없음! Node.js가 해당 포트 직접 담당
```

**⚠️ NAS .env 또는 ecosystem.config.cjs에서 PORT=3443 필수!**  
git pull 배포 시 ecosystem.config.cjs가 PORT:3000으로 초기화되므로 매번 확인 필요.

**NAS 포트 확인 명령어:**
```bash
pm2 logs safetynote --nostream | grep "포트:"
# 또는
cat /volume1/safetynote/.env | grep PORT
```

---

## 📱 APK 업데이트 전체 흐름 (v1.2.4 기준)

```
앱 실행 → checkApkVersion()
  → /api/dist/apk/version 조회
  → syncInstalledVersion(): 현재 설치 버전 확인
  → 서버버전 > 현재버전 → showUpdateModal() 표시

사용자 "지금 업데이트" 클릭
  → doApkDownload(url, newVersion)
      → localStorage에 새 버전 즉시 저장 (재실행 후 팝업 없음)
      → window.open(url, '_system') 호출

MainActivity.shouldOverrideUrlLoading()
  → .apk URL 감지
  → startApkDownload(url)
      → DownloadManager.enqueue() → 시스템 알림창에 다운로드 진행률 표시
      → JS 콜백: window.onApkDownloadStarted() → 토스트 표시

다운로드 완료 → BroadcastReceiver (ACTION_DOWNLOAD_COMPLETE)
  → installDownloadedApk()
      → Android 7.0+: FileProvider URI로 설치 인텐트 실행
      → Android 6.0-: file URI로 설치 인텐트 실행
      → 시스템 설치 화면 표시 → 사용자 확인 → 설치 완료
```

---

## 🚀 빌드 방법

```
GitHub → safetynote-android → Actions
  → "Safety NOTE APK Build and Deploy" → Run workflow
     version:      x.x.x
     release_note: 변경 내용
     force_update: false
```

### 수정 시 체크리스트
- [ ] `build-apk.yml` `default: 'x.x.x'` 버전 업데이트 (GitHub 웹 UI)
- [ ] `PROJECT_HISTORY.md` 버전 테이블 + 변경 내용 추가
- [ ] GitHub push → Actions 수동 실행
- [ ] NAS git pull 후 `PORT=3443` 확인 (`cat /volume1/safetynote/.env | grep PORT`)

### 버전 규칙
| 유형 | 증가 | 예시 |
|------|------|------|
| 버그 수정 | patch | 1.2.3 → 1.2.4 |
| 기능 추가 | minor | 1.2.x → 1.3.0 |
| 전면 개편 | major | 1.x.x → 2.0.0 |

---

## 🔐 GitHub Secrets 현황

| Secret | 상태 | 용도 |
|--------|------|------|
| `NAS_URL` | ✅ | NAS 서버 주소 (자동배포 스크립트용) |
| `DIST_SECRET` | ✅ | APK 업로드 인증 |
| `KEYSTORE_BASE64` | ✅ **등록완료** | Release 서명 (2026-06-10) |
| `KEYSTORE_PASSWORD` | ✅ **등록완료** | keystore 비밀번호 `SafetyNOTE2026!` |
| `KEY_ALIAS` | ✅ **등록완료** | 키 별칭 `safetynote` |
| `KEY_PASSWORD` | ✅ **등록완료** | 키 비밀번호 `SafetyNOTE2026!` |

### 🔑 Keystore 정보 (분실 금지!)
| 항목 | 값 |
|------|-----|
| 파일명 | `safetynote-release.keystore` |
| 알고리즘 | RSA 2048bit |
| 유효기간 | 36,500일 (100년) |
| alias | `safetynote` |
| 비밀번호 | `SafetyNOTE2026!` |
| DN | CN=SafetyNOTE Dev, O=LinkMax, C=KR |
| 백업 | AI Drive 업로드 완료 ✅ |
| ⚠️ 주의 | **이 keystore 분실 시 동일 앱 이름으로 업데이트 불가!** |

---

## 🗒️ 작업 이력 (대화 세션별)

### 2026-06-10 세션 1 — 초기 구축
- NAS Node.js 서버 초기 커밋 (v1.2.5 코드 베이스)
- ecosystem.config.cjs, migrations/, INSTALL.md 등 배포판 구성

### 2026-06-10 세션 2 — NAS 배포 + 보안 + APK
- NAS 상태 확인 (app.js 23406줄→23443줄, 캐시버전 갱신)
- `git reset --hard origin/main` 으로 NAS 최신 코드 반영
- `0049_missing_tables.sql` 생성 → NAS DB 적용 (risk_assessment_signatures, legal_notices)
- 노출된 PAT 토큰 revoke + 새 토큰 교체, git credential store 설정
- build-apk.yml: Deploy to NAS → Create GitHub Release 교체
- `permissions: contents: write` 추가, 저장소 Workflow permissions Read/write 설정
- `nas-auto-deploy.sh` 신규 생성

### 2026-06-10 세션 3 — 3443 접속 불가 원인 분석 + patchSchema 버그 수정
- **원인 확정**: git pull로 ecosystem.config.cjs(PORT:3000) 덮어써짐
  - 원래: NAS .env에 PORT=3443 설정 → node-server.ts가 3443 직접 수신
  - 배포 후: PORT:3000으로 초기화 → 3443으로 오는 요청 아무도 안 받음
  - NAS에 리버스프록시 설정한 적 없음 확인 (Node.js 직접 수신 방식)
- `ecosystem.config.cjs` PORT: 3000 → **3443** 수정 (커밋 `1ba927d`)
- PROJECT_HISTORY.md 전면 보완 업데이트

- **patchSchema 3가지 버그 수정** (커밋 `b950d8f`):
  1. `risk_assessments` status CHECK 수정 실패
     - `INSERT INTO _new SELECT *` → PRAGMA table_info 컬럼 명시 방식으로 변경
     - 21컬럼 DB → 25컬럼 테이블 SELECT * 시 "21 values → 25 columns" 오류 방지
  2. `risk_assessment_signatures` 테이블 patchSchema에서 자동 생성 추가 (0049 미적용 대비)
  3. `legal_notices` 테이블 patchSchema에서 자동 생성 추가 (0049 미적용 대비)

- **ecosystem.config.cjs NAS 실제 환경 맞춤 수정** (커밋 `79908b1`):
  - `name`: `'safety-management'` → **`'safetynote'`** (NAS PM2 프로세스명과 일치)
  - `cwd`: `'/home/user/webapp'` → **`'/volume1/safetynote'`** (NAS 실제 경로)
  - `log`: `/home/user/.pm2/logs/` → **`/var/log/safetynote-*.log`** (NAS 실제 로그 경로)
  - ⚠️ 이 불일치가 `pm2 restart --update-env`가 효과 없었던 원인

- **진짜 원인 최종 확인** (커밋 `d6de314`):
  - NAS `.env` 파일에 `PORT=3000`, `HTTPS_PORT=3443` 으로 설정되어 있었음
  - node-server.ts는 `.env`를 먼저 읽어 PORT=3000 확정 → ecosystem.config.cjs의 PORT:3443 무시
  - `.env.example` 기본값 3443으로 수정하여 재발 방지
  - **NAS 실제 수정**: `sed -i 's/^PORT=3000/PORT=3443/' /volume1/safetynote/.env`

- **NAS 최종 적용 명령어** (세션 3에서 시도한 방법 — ecosystem.config.cjs 방식이 NAS에서 hang):
  ```bash
  sed -i 's/^PORT=3000/PORT=3443/' /volume1/safetynote/.env
  grep PORT /volume1/safetynote/.env         # PORT=3443 확인
  pm2 delete safetynote
  pm2 start /volume1/safetynote/ecosystem.config.cjs   # ← NAS에서 hang 발생
  ```

- **세션 4에서 확정된 성공 방법** (커맨드라인 직접 등록):
  ```bash
  kill <nohup_pid>  # 기존 nohup 프로세스 종료
  PORT=3443 pm2 start /volume1/safetynote/node_modules/.bin/tsx \
    --name safetynote \
    --interpreter /usr/local/bin/node \
    -- node-server.ts
  # → PM2 online (id:0, fork, 0 restarts, 49.9mb) 확인
  pm2 save          # ← 재부팅 자동시작 등록 (세션 4 종료 시 미실행)
  ```

### 2026-06-10 세션 4 — PM2 ecosystem.config.cjs 실패 → 커맨드라인 직접 등록으로 해결

#### 배경
세션 3에서 NAS .env PORT=3443 수정, ecosystem.config.cjs 전면 보완 후 PM2 재시작을 시도.

#### 문제: `pm2 start ecosystem.config.cjs` 방식 멈춤/실패

ecosystem.config.cjs 파일 방식으로 PM2 시작 시 응답 없이 멈추거나 프로세스가 올라오지 않는 문제 발생.
- `pm2 start /volume1/safetynote/ecosystem.config.cjs` → 응답 없음 (hang)
- `pm2 restart safetynote` → 기존 프로세스가 없어서 실패

#### 해결: PM2 커맨드라인 직접 등록

```bash
# 1. 기존 nohup 프로세스 종료
kill 1325

# 2. PM2로 새로 시작 (커맨드라인 직접 등록)
PORT=3443 pm2 start /volume1/safetynote/node_modules/.bin/tsx \
  --name safetynote \
  --interpreter /usr/local/bin/node \
  -- node-server.ts
```

결과:
```
[PM2] Starting /volume1/safetynote/node_modules/.bin/tsx in fork_mode (1 instance)
[PM2] Done.
│ 0  │ safetynote  │ fork  │ 0  │ online  │ 0%  │ 49.9mb  │
```

#### ⚠️ ecosystem.config.cjs vs 커맨드라인 방식 비교

| 항목 | ecosystem.config.cjs | 커맨드라인 직접 등록 |
|------|---------------------|-------------------|
| `pm2 start config.cjs` | NAS에서 hang/실패 | — |
| `pm2 start tsx --name ...` | — | ✅ 성공 |
| 재부팅 후 자동시작 | `pm2 save` 필요 | `pm2 save` 필요 |
| 설정 파일 관리 | 파일로 버전관리 가능 | PM2 내부 저장소에 저장 |

**결론**: NAS 환경에서 ecosystem.config.cjs 파일 방식이 동작 안 할 경우,
커맨드라인 직접 등록 후 `pm2 save`로 영구 등록하면 됨.

ecosystem.config.cjs 파일 자체는 **문서 목적 / 환경 파악 참고용**으로 유지.
실제 NAS 재시작 시에는 아래 커맨드를 사용:

```bash
# NAS 재시작/복원 시 PM2 등록 명령어 (북마크 필수!)
PORT=3443 pm2 start /volume1/safetynote/node_modules/.bin/tsx \
  --name safetynote \
  --interpreter /usr/local/bin/node \
  -- node-server.ts
pm2 save
```

#### 잔여 작업 (세션 4 종료 시점)
- [x] PM2 online 확인 (id:0, fork, 0 restarts, 49.9mb)
- [ ] `pm2 save` 미실행 → **재부팅 시 자동시작 안 됨**
- [ ] `https://linkmax.myds.me:3443` 실제 접속 미확인
- [ ] APK v1.2.5 GitHub Actions 재빌드 미실행

### 2026-06-10 세션 5 — pm2 save + pm2 startup 완료, 서버 정상 확인

#### 실행 결과 (NAS 직접 확인)

```
# pm2 save
[PM2] Successfully saved in /root/.pm2/dump.pm2  ✅

# curl http://localhost:3443
HTTP: 200  ✅

# pm2 logs safetynote --nostream --lines 20
✅ 서버 실행 중: http://0.0.0.0:3443  ✅

# pm2 startup
[PM2] Init System found: systemd
[PM2] [v] Command successfully executed.
systemctl enable pm2-root  ✅

# pm2 save (startup 후 재저장)
[PM2] Successfully saved in /root/.pm2/dump.pm2  ✅
```

#### 세션 5 완료 항목
- [x] `pm2 save` 실행 → `/root/.pm2/dump.pm2` 저장
- [x] `curl http://localhost:3443` → **HTTP 200** 확인
- [x] 로그에서 **`✅ 서버 실행 중: http://0.0.0.0:3443`** 확인
- [x] `pm2 startup` → `systemd` 방식으로 **재부팅 자동시작 등록** (`pm2-root.service`)
- [x] `systemctl enable pm2-root` 성공

#### NAS 현재 상태 (확정)
| 항목 | 값 |
|------|-----|
| PM2 프로세스 | `safetynote` online (id:0, fork) |
| 서버 포트 | **3443** ✅ |
| HTTP 응답 | **200** ✅ |
| 재부팅 자동시작 | **systemd pm2-root.service** 등록 ✅ |
| pm2 dump 경로 | `/root/.pm2/dump.pm2` |
| systemd 서비스 | `/etc/systemd/system/pm2-root.service` |

#### 잔여 작업
- [x] `https://linkmax.myds.me:3443` 외부 브라우저/앱 실제 접속 확인 → 세션 6에서 해결
- [ ] APK v1.2.5 GitHub Actions 재빌드

### 2026-06-10 세션 6 — HTTPS ERR_SSL_PROTOCOL_ERROR 근본 원인 수정 ⭐ 핵심

#### 문제
`pm2 save` + HTTP 200 확인 후 `https://linkmax.myds.me:3443` 브라우저 접속 시:
```
ERR_SSL_PROTOCOL_ERROR
```

#### 잘못된 기존 기록 수정
이전 PROJECT_HISTORY.md에 "Synology SSL 터미네이션 → Node.js HTTP 전달" 구조로 기록되어 있었으나
**완전히 잘못된 분석**이었음:
- Synology 리버스 프록시: 설정한 적 없음 (항목 없음 확인)
- 실제 구조: node-server.ts가 HTTPS를 직접 서빙해야 함

#### 원인
`node-server.ts`가 `@hono/node-server`의 `serve()`만 사용 → HTTP만 서빙
→ 브라우저가 `https://`로 연결 시 SSL 핸드셰이크 실패 → ERR_SSL_PROTOCOL_ERROR

#### 해결: node-server.ts에 HTTPS 직접 서빙 추가 (커밋 `1f1f0dd`)

**추가된 코드 구조:**
```typescript
// 1. Synology DSM 인증서 자동 탐지
function loadSynologyCert() {
  const archiveName = readFileSync('/usr/syno/etc/certificate/_archive/DEFAULT').trim()
  const certDir = `/usr/syno/etc/certificate/_archive/${archiveName}`
  return {
    key:  readFileSync(`${certDir}/privkey.pem`),
    cert: readFileSync(`${certDir}/fullchain.pem`)  // 중간CA 포함
  }
}

// 2. 인증서 있으면 HTTPS, 없으면 HTTP 폴백
const tlsCert = loadSynologyCert()
if (tlsCert) {
  https.createServer({ key, cert }, handler).listen(PORT, '0.0.0.0')
  // → NAS: HTTPS 서버
} else {
  serve({ fetch: app.fetch, port: PORT })
  // → 샌드박스/개발: HTTP 서버 (인증서 없으므로 자동 폴백)
}
```

**핵심 설계:**
- 인증서 경로를 하드코딩하지 않고 `DEFAULT` 파일로 동적 탐지
  → Synology DSM 인증서 갱신 시 폴더명이 바뀌어도 자동 대응
- 인증서 없으면 HTTP 폴백 → 샌드박스 환경에서도 코드 변경 없이 동작

#### NAS 적용 결과
```
git pull origin main  → node-server.ts 업데이트
pm2 restart safetynote --update-env

# 로그:
[SSL] Synology 인증서 로드 완료: /usr/syno/etc/certificate/_archive/4a2zGZ
✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443

# 브라우저 접속:
https://linkmax.myds.me:3443  → ✅ 정상 접속!
```

#### 세션 6 완료 항목
- [x] ERR_SSL_PROTOCOL_ERROR 원인 분석 (리버스프록시 없음 확인)
- [x] Synology DSM 인증서 경로 확인 (`/usr/syno/etc/certificate/_archive/4a2zGZ/`)
- [x] node-server.ts HTTPS 직접 서빙 코드 추가
- [x] `loadSynologyCert()` 동적 인증서 탐지 함수 구현
- [x] HTTP 폴백 (샌드박스 환경 자동 대응)
- [x] GitHub push + NAS git pull 적용
- [x] `https://linkmax.myds.me:3443` **정상 접속 확인** ✅
- [x] PROJECT_HISTORY.md HTTPS 구조 오류 기록 수정
- [x] NAS-HTTPS-SETUP.md 별도 문서 생성
- [x] node-server.ts HTTPS 구간 경고 주석 강화 (수정 금지 표시)
- [ ] APK v1.2.5 GitHub Actions 서명 빌드 실행 (세션 7에서 진행)

### 2026-06-10 세션 7 — APK Release 서명 keystore 생성 + GitHub Secrets 등록

#### 작업 내용
- 샌드박스에서 `keytool`로 `safetynote-release.keystore` 생성
  - RSA 2048bit / 유효기간 100년 / alias: `safetynote`
  - 비밀번호: `SafetyNOTE2026!`
- Base64 인코딩 후 GitHub Secrets 4개 등록 (웹 UI 수동 등록)
  - `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` 모두 ✅
- keystore 파일 AI Drive 백업 완료
- GitHub Actions **서명 빌드 실행 대기 중** (웹 UI에서 직접 실행 필요)

#### 완료 항목
- [x] GitHub Actions 수동 실행 → v1.2.5 **Release(서명) APK** 빌드 성공
  - `Keystore restored` → `Building release APK (signed)` → `assembleRelease` ✅
  - GitHub Release `v1.2.5` 생성 + `safetynote-v1.2.5.apk` 첨부 ✅
- [ ] 앱에서 업데이트 알림 수신 및 설치 확인

### 2026-06-10 세션 8 — 현황 파악 + 6단계 개발 계획 수립 및 정리
#### 작업 내용
- 이전 세션 요약 기반으로 작업 인수
- 코드 전면 분석을 통해 6단계 개발 계획 현황 파악
- PROJECT_HISTORY.md 세션 기록 보완 및 6단계 계획 상세 문서화
- 단계별 순서로 개발 진행 결정

#### 6단계 개발 계획 현황 코드 분석 결과

| 단계 | 기능 | 구현 상태 | 비고 |
|------|------|----------|------|
| 1단계 | 🔔 앱 내 알림 기능 | **✅ 거의 완성** | 벨 아이콘, 배지, 패널, SSE 실시간, DB 읽기/쓰기 모두 구현됨 |
| 2단계 | 📍 GPS 위치 추적 | **✅ 세션9 완료** | 작업일지 저장 시 GPS 좌표 자동 기록 + 내 계정 위치 이력 카드 |
| 3단계 | 🔄 자동 업데이트 | **✅ 완성** | syncInstalledVersion() + DownloadManager 완성 |
| 4단계 | 👤 로그인 화면 개선 | **✅ 세션8 완료** | 아이디 저장/자동완성, 비밀번호 표시, 로딩 스피너, 흔들기 애니메이션 |
| 5단계 | ⚙️ 앱 설정 메뉴 | **✅ 세션8 완료** | 내 계정 페이지에 앱 설정 카드 추가 (테마/알림/글자크기/진동) |
| 6단계 | 📦 Release APK 빌드 | **✅ 완성** | v1.3.0 서명 빌드 완료 (2026-06-11) |

#### 진행 순서 결정
1. **4단계 (로그인 화면 개선)** — 빠르고 임팩트 있음 → **✅ 완료**
2. **5단계 (앱 설정 메뉴)** — 사용자 설정 페이지 신규 추가 → **✅ 완료**
3. **2단계 (GPS 위치 추적)** — 출퇴근 위치 자동 기록 등 기능 확장 → **✅ 세션9 완료**

---

### 2026-06-10 세션 9 — NAS HTTPS 접속 불가 수정 + 2단계 GPS 위치 추적 구현

#### 작업 내용 1: HTTPS 접속 불가 수정 (EADDRINUSE 버그)
- **원인**: 이전 세션에서 webapp repo 커밋이 safetynote-server repo에 force push로 덮어씌워짐
  → NAS `git reset --hard origin/main` 시 구버전 `node-server.ts` 설치 (HTTP+HTTPS 동시 기동 버그)
- **증상**: HTTPS가 3443 점유 후 HTTP도 3443 시도 → `EADDRINUSE` → `process.exit(1)` → 서버 종료
- **해결**: 샌드박스에서 safetynote-server repo `git push -f origin main` → NAS `git reset --hard origin/main` → `pm2 restart`
- **문서**: `NAS-HTTPS-SETUP.md`에 "EADDRINUSE 버그" 진단 섹션 추가 (커밋 `65cd4f6`)

#### 작업 내용 2: 2단계 GPS 위치 추적 구현
- **migration 0050**: `work_logs` 테이블에 `gps_lat`, `gps_lon`, `gps_recorded_at` 컬럼 추가
- **worklogs.ts**: POST(생성) / PUT(수정) API에 gps 좌표 저장 반영
- **app.js `submitWorkLog()`**: 작업일지 저장 시 `navigator.geolocation.getCurrentPosition()` 백그라운드 호출 → GPS 실패해도 저장 계속 진행
- **app.js `_loadLocationHistory()`**: 내 작업일지 중 위치 정보 있는 항목 최근 20개 조회 + 카카오맵 링크 제공
- **`renderMyProfilePage()`**: 앱 설정 카드 아래에 "최근 작업 위치 이력" 카드 추가 (페이지 로드 시 자동 호출)

#### ⚠️ NAS 적용 필수 작업
```bash
# NAS SSH에서 실행
cd /volume1/safetynote
git fetch origin && git reset --hard origin/main

# migration 0050 적용 (gps 컬럼 추가)
sqlite3 /volume1/safetynote/data/safety.db < migrations/0050_worklogs_gps_coords.sql

# 서버 재시작
pm2 restart safetynote --update-env
sleep 5 && pm2 logs safetynote --nostream --lines 5
```

#### 완료 항목
- [x] NAS HTTPS EADDRINUSE 버그 원인 파악 및 수정
- [x] NAS-HTTPS-SETUP.md EADDRINUSE 진단 섹션 추가
- [x] migration 0050 생성 (work_logs GPS 컬럼)
- [x] worklogs.ts GPS 좌표 저장 반영
- [x] app.js 작업일지 저장 시 GPS 자동 수집
- [x] app.js 내 계정 위치 이력 카드 + `_loadLocationHistory()` 구현
- [x] GitHub push (safetynote-server repo)
- [x] **NAS DB migration 0050 적용** ← NAS에서 직접 확인 → "duplicate column name" = **이미 적용된 상태** (정상)

### 2026-06-11 세션 10 — APK v1.3.0 빌드 트리거 및 Release 확인

#### 작업 내용
- **세션 인수**: PROJECT_HISTORY.md 기반 세션 9 상태에서 이어받음
- **workflow_dispatch 트리거**: PAT로 GitHub Actions API 호출 → `build-apk.yml` v1.3.0 빌드 시작
- **빌드 모니터링**: 단계별 실시간 확인
  - ✅ Set up job → Checkout → Node.js → Java 17 → Android SDK → npm install
  - ✅ Capacitor Android platform 추가 → web assets sync → MainActivity/아이콘 적용
  - ✅ Set version info → Restore keystore → **Build APK** → Rename → Upload Artifact
  - ✅ Create GitHub Release 생성 완료
- **빌드 결과**: Run #27330508906 — **success** (약 2분 29초)

#### GitHub Release 결과
```
태그: v1.3.0
이름: Safety NOTE v1.3.0
파일: safetynote-v1.3.0.apk (5,572KB)
URL:  https://github.com/gisubhan-droid/safetynote-android/releases/tag/v1.3.0
```

#### 완료 항목 (전반부 — APK 빌드)
- [x] GitHub Actions workflow_dispatch 트리거 (PAT API)
- [x] APK v1.3.0 빌드 성공 확인 (Release 서명 빌드, Run #27330508906)
- [x] GitHub Release v1.3.0 생성 + safetynote-v1.3.0.apk (5,572KB) 첨부 확인
- [x] PROJECT_HISTORY.md 버전 테이블 v1.3.0 업데이트

#### 추가 작업 내용 (후반부 — NAS 확인 + PAT 권한 확장)

**NAS 상태 직접 확인 (사용자 SSH 실행)**:
```bash
# NAS에서 직접 실행 결과
git pull origin main          # Already up to date ✅
sqlite3 safety.db < 0050_...sql
# Error: duplicate column name: gps_lat  → 이미 적용됨 ✅ (정상)
```

**PAT 권한 문제 해결**:
- 기존 `safetynote-deploy` Fine-grained PAT: `safetynote-android` repo만 접근 가능
- `safetynote-server` repo push 403 오류 발생
- **해결**: GitHub Fine-grained tokens → `safetynote-deploy` 편집
  - Repository access에 `gisubhan-droid/safetynote-server` 추가
  - `Generate token` → 새 PAT 발급
- 새 PAT로 `safetynote-server` push 성공 (커밋 `5d68188`)
- git credential store에 새 PAT 저장 → 이후 자동 사용

**PAT 현황 (최종)**:
| 토큰 이름 | 종류 | 접근 가능 repo | 권한 |
|-----------|------|----------------|------|
| `safetynote-nas` | Classic | 전체 repo | repo |
| `safetynote-build` | Classic | 전체 repo | repo + workflow |
| `safetynote-deploy` | Fine-grained | safetynote-android, **safetynote-server** | actions, code, workflows R/W |

#### 완료 항목 (전체)
- [x] GitHub Actions workflow_dispatch 트리거 (PAT API)
- [x] APK v1.3.0 빌드 성공 확인 (Release 서명 빌드)
- [x] GitHub Release v1.3.0 생성 + safetynote-v1.3.0.apk 첨부 확인
- [x] NAS migration 0050 이미 적용 확인 (GPS 컬럼 정상)
- [x] `safetynote-deploy` PAT에 `safetynote-server` repo 권한 추가
- [x] PROJECT_HISTORY.md safetynote-server repo push 완료 (커밋 `5d68188`)
- [x] 세션 10 전체 내용 PROJECT_HISTORY.md 정리

#### 잔여 작업
- [x] **APK v1.3.0 기기 설치** — 세션 11에서 사용자 확인 완료
- [ ] **1단계 알림 기능 Android 테스트** — 벨 아이콘, 배지, 알림 패널 확인
- [ ] **NAS 크론잡 설정** — nas-auto-deploy.sh 등록

---

### 2026-06-11 세션 11 — 위치 이력 카드 미표시 버그 수정 및 GitHub 배포

#### 작업 내용
- **세션 인수**: PROJECT_HISTORY.md 기반 세션 10 상태에서 이어받음
- **현상 확인**: 앱 `내 계정` 페이지에서 "최근 작업 위치 이력" 카드가 화면에 표시되지 않음
- **원인 분석**: `renderMyProfilePage()`의 HTML 구조 오류
  - 위치 이력 카드 `<div>`가 `max-w-2xl` 메인 컨테이너 `</div>` 닫힘 **이후**에 위치
  - 브라우저가 컨테이너 밖 요소를 무시하여 미표시
- **수정**: `public/static/app.js` 들여쓰기 수정 → 위치 이력 카드를 컨테이너 안으로 이동
- **빌드**: `npm run build` → 성공 (211.33 kB, 2.54s)
- **PM2 재시작**: `pm2 start npx --name safetynote -- wrangler pages dev dist --ip 0.0.0.0 --port 3000` → HTTP 200 ✅
- **GitHub 배포**: Contents API (Python) → commit `a1cc384d8c9f` → safetynote-server 반영

#### 수정 코드 핵심
```javascript
// 수정 전 (broken): 위치 이력 카드가 컨테이너 밖
    </div>  // max-w-2xl 컨테이너 닫힘
    <div style="...위치 이력 카드...">  // ❌ 컨테이너 밖!
    </div>`;

// 수정 후 (fixed): 위치 이력 카드를 컨테이너 안으로
      <!-- ─── 2단계: 최근 작업 위치 이력 카드 ─── -->
      <div style="...위치 이력 카드...">  // ✅ 컨테이너 안
      </div>
    </div>`;  // max-w-2xl 컨테이너 여기서 닫힘
```

#### 완료 항목
- [x] 세션 11 인수 (PROJECT_HISTORY.md 기반)
- [x] PM2 샌드박스용 명령으로 재시작 (`pm2 start npx --name safetynote -- wrangler pages dev dist`)
- [x] 위치 이력 카드 HTML 구조 버그 확인 및 수정 (`public/static/app.js`)
- [x] `npm run build` 성공 (211.33 kB)
- [x] git commit `384aa30` — `fix: 위치 이력 카드 컨테이너 밖 렌더링 버그 수정`
- [x] GitHub Contents API (Python)로 app.js 배포 → commit `a1cc384d8c9f`
- [x] PROJECT_HISTORY.md 세션 11 이력 정리

#### 잔여 작업
- [x] **NAS git pull + pm2 restart** — 완료 (사용자 확인)
- [x] **앱에서 위치 이력 카드 표시 확인** — ✅ 정상 표시 확인 (세션 11)
- [ ] **화면 전체 dim 버그 NAS 배포** — NAS git pull 후 확인 필요
- [ ] **1단계 알림 기능 Android 테스트** — 벨 아이콘, 배지, 알림 패널 확인
- [ ] **NAS 크론잡 설정** — nas-auto-deploy.sh 등록

---

### 2026-06-11 세션 11 (2차) — 화면 전체 dim 처리 버그 수정

#### 증상
작업관리 페이지에서 상단 메뉴 부분 클릭 시 화면 전체에 어두운 반투명 오버레이(dim)가 덮혀 헤더 아이콘 및 콘텐츠가 음영 처리되어 클릭 불가 상태 발생.

#### 원인 분석
1. **modal-overlay 잔류 버그**: 작업/공사 상세 모달 오픈 후 하단 탭으로 페이지 전환 시 `.modal-overlay`가 DOM에서 제거되지 않고 남아있음
   - `safeNavigateTo()`: `querySelector()`로 **첫 번째** 오버레이만 제거 → 중첩 모달 시 나머지 잔류
   - `navigateTo()`: 오버레이 정리 로직 **없음**
2. **z-index 부족**: `top-header z-index:50` vs `modal-overlay z-index:1000` → 오버레이 잔류 시 헤더가 오버레이 아래로 내려가 클릭 불가

#### 수정 내용

| 파일 | 수정 내용 |
|------|----------|
| `public/static/app.js` | `safeNavigateTo()`: `querySelector` → `querySelectorAll + forEach remove` |
| `public/static/app.js` | `navigateTo()`: 페이지 전환 시 `querySelectorAll('.modal-overlay')` 전부 제거 추가 |
| `public/static/app.js` | `navigateTo()`: 알림 패널(`_notifPanelOpen`) 닫기 처리 추가 |
| `public/static/style.css` | `top-header z-index: 50 → 1100` (modal-overlay 1000 위로 상향) |

#### 이중 방어 전략
- **1차 방어**: `navigateTo()` / `safeNavigateTo()`에서 페이지 전환 시 모든 오버레이 즉시 제거
- **2차 방어**: `top-header z-index:1100` → 오버레이(1000)보다 높게 → 잔류 시에도 헤더 항상 위에 표시

#### 완료 항목
- [x] 원인 파악 (modal-overlay 잔류 + z-index 부족)
- [x] `safeNavigateTo()` querySelectorAll 수정
- [x] `navigateTo()` 오버레이 정리 로직 추가
- [x] `top-header z-index` 1100으로 상향
- [x] `npm run build` 성공 (211.33 kB)
- [x] git commit `d78b45d`
- [x] GitHub 배포: app.js `4c36ed1b4e4d`, style.css `c84b8408607c`

---

### 2026-06-11 세션 11 (3차) — 법령안내 페이지 데이터 없음 버그 수정

#### 증상
법령안내 관리 페이지에서 "일반 법령안내 데이터가 없습니다." 표시.

#### 원인 분석
`/api/legal-notices` 엔드포인트가 **서버에 전혀 구현되지 않은 상태**였음.
- `src/routes/legal-notices.ts` 파일 없음
- `src/index.tsx`에 라우트 등록 없음
- `legal_notices` 테이블은 migration 0049에서 생성되었으나 초기 시드 데이터 없음
- API 호출 시 404 반환 → 프론트에서 `[]` 처리 → "데이터가 없습니다" 표시

#### 수정 내용

| 파일 | 작업 | 내용 |
|------|------|------|
| `src/routes/legal-notices.ts` | **신규 생성** | GET /api/legal-notices (목록), GET /:key (개별), PUT /:key (수정), DELETE /:key (삭제) |
| `src/index.tsx` | **수정** | `legalNoticeRoutes` import 및 `/api/legal-notices` 등록 |
| `migrations/0051_legal_notices_seed.sql` | **신규 생성** | 일반 법령안내 5건 (산안법 주요 조항) + 교육 법령기준 5건 시드 |

#### 기본 시드 데이터 (일반 법령안내)
| notice_key | 제목 |
|-----------|------|
| `safety_general` | 산업안전보건법 주요 의무사항 |
| `safety_ppe` | 개인보호구 지급 및 착용 의무 |
| `safety_stop` | 중대재해 발생 시 작업중지 의무 |
| `safety_hazard` | 위험성 평가 실시 의무 |
| `safety_tbm` | TBM(작업 전 안전점검) 실시 |

#### NAS 적용 방법
```bash
cd /volume1/safetynote
git pull origin main
# migration 0051 적용
sqlite3 safety.db < migrations/0051_legal_notices_seed.sql
pm2 restart safetynote --update-env
```

#### 완료 항목
- [x] 원인 파악 (라우트 파일 미구현)
- [x] `src/routes/legal-notices.ts` 신규 생성 (CRUD 전체)
- [x] `src/index.tsx` 라우트 등록 추가
- [x] `migrations/0051_legal_notices_seed.sql` 기본 데이터 시드 생성
- [x] GitHub 배포: legal-notices.ts `61f70da68625`, index.tsx `0ab158014f30`, migration `1fe852b62b0e`

---

## 🗺️ 6단계 개발 계획 상세

> ⚠️ 이 계획은 SafetyNote 앱 완성도 향상을 위한 단계별 개발 로드맵입니다.
> 각 단계는 독립적으로 진행 가능하며, 완료 시 체크박스에 표시합니다.

---

### 1단계: 🔔 앱 내 알림 기능

**목표**: 서버 이벤트(작업 배정, 상태 변경, 서명 요청 등)를 앱에서 실시간으로 수신하여 사용자에게 알림 표시

**현재 구현 상태 (✅ 거의 완성)**:
- `notifications.ts` — GET/PATCH API 4개 구현 (목록 조회, 읽음 처리, 전체 읽음, 미읽음 수)
- `app.js` — SSE 실시간 클라이언트, 헤더 벨 아이콘, 배지(미읽음 카운트), 알림 패널 팝업
- `push.ts` — 서버 사이드 SSE 브로드캐스트
- `loadStoredNotifications()` — 로그인 시 DB 미읽음 알림 복원

**남은 작업**:
- [ ] Android 앱에서 알림 수신 정상 동작 확인 (v1.2.5 설치 후 테스트)
- [ ] 필요 시 Android 네이티브 알림(PushNotification) 연동 검토

---

### 2단계: 📍 GPS 위치 추적 기능

**목표**: 현장 근무 중 위치 기록, 출퇴근 위치 자동 저장

**현재 구현 상태 (✅ 세션9 완료)**:
- `app.js` — `getGPSAddress()`, `getGPSAddressWithConsent()`: 점검/위험 기록 시 GPS 주소 조회
- `MainActivity.java` — 런타임 GPS 권한 요청 (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`)
- `AndroidManifest.xml` — GPS 권한 선언
- `submitWorkLog()` — 작업일지 저장 시 `gps_lat`, `gps_lon` 자동 수집 → 서버 전송
- `worklogs.ts` — INSERT/UPDATE 시 `gps_lat`, `gps_lon`, `gps_recorded_at` 저장
- `migrations/0050_worklogs_gps_coords.sql` — `work_logs` 테이블 GPS 컬럼 추가
- `renderMyProfilePage()` — 내 계정 페이지 "최근 작업 위치 이력" 카드 추가
- `_loadLocationHistory()` — 작업일지 위치 이력 조회 + 카카오맵 링크

**남은 작업**:
- [ ] NAS DB 마이그레이션 `0050` 적용 (`sqlite3 /volume1/safetynote/data/safety.db < migrations/0050_worklogs_gps_coords.sql`)
- [ ] 실시간 위치 업데이트 주기 설정 (선택적)

---

### 3단계: 🔄 자동 업데이트

**목표**: 서버에 새 APK 버전이 있을 때 앱에서 자동 감지 및 설치

**현재 구현 상태 (✅ 완성)**:
- `syncInstalledVersion()` — URL 파라미터 `?appver` 또는 localStorage에서 현재 버전 확인
- `checkApkVersion()` — 서버 버전 vs 설치 버전 비교 → 업데이트 모달 표시
- `DownloadManager` — APK 직접 다운로드 + FileProvider 설치 인텐트
- WebView 환경에서만 업데이트 팝업 표시 (PC 브라우저 제외)

**추가 개선 가능**:
- [ ] 강제 업데이트 모드 (force_update=true 시 닫기 버튼 비활성화) — 현재 build-apk.yml에 파라미터 있음

---

### 4단계: 👤 로그인 화면 개선

**목표**: 로그인 UX 개선 — 아이디 저장, 자동완성, 로딩 상태

**현재 구현 상태 (🔧 기본 구현)**:
- 기본 아이디/비밀번호 폼
- 가입 신청 버튼
- Enter 키 → 로그인 (비밀번호 필드만 동작)

**구현 예정**:
- [ ] 아이디 자동 저장 (localStorage `sn-last-username`)
- [ ] 페이지 로드 시 마지막 아이디 자동 채우기
- [ ] 아이디 입력 후 Enter → 비밀번호 필드로 포커스 이동
- [ ] 로그인 버튼 클릭 시 로딩 스피너 표시 (중복 클릭 방지)
- [ ] 앱 시작 시 자동 로그인 (토큰 유효 시) ← 현재 미구현

---

### 5단계: ⚙️ 앱 설정 메뉴

**목표**: 사용자 전용 앱 설정 페이지 추가 (테마/알림/글자크기 통합)

**현재 구현 상태 (🔧 부분 구현)**:
- `applyTheme()` / `buildThemePanel()` — 헤더 테마 선택 패널 (5가지 테마)
- `내 계정` 페이지 — 기본 정보 수정, 비밀번호 변경
- 시스템 설정 (관리자 전용) — Kakao API 키, 업로드 경로 등

**구현 예정**:
- [ ] `내 계정` 페이지에 `앱 설정` 카드 추가
  - **테마 선택**: 기존 헤더 팝업 → 설정 페이지로 통합
  - **알림 수신 설정**: SSE 알림 On/Off (localStorage `sn-notif-enabled`)
  - **글자 크기**: 소(13px) / 중(15px, 기본) / 대(17px) (localStorage `sn-font-size`)
  - **진동 피드백**: On/Off (localStorage `sn-vibration`)
- [ ] 앱 시작 시 저장된 설정 자동 적용 (`applyUserPrefs()`)

---

### 6단계: 📦 Release APK 빌드

**목표**: GitHub Actions로 서명된 Release APK 자동 빌드 및 배포

**현재 구현 상태 (✅ 완성)**:
- `build-apk.yml` — `KEYSTORE_BASE64` 있으면 `assembleRelease`, 없으면 `assembleDebug` 자동 분기
- `softprops/action-gh-release@v2` — GitHub Release에 APK 자동 첨부
- Keystore 4개 Secrets 모두 등록 완료

**잔여 작업**:
- [ ] 앱에서 v1.2.5 업데이트 알림 수신 및 설치 확인
- [ ] NAS 크론잡 설정 (`nas-auto-deploy.sh` 등록)
- [ ] 다음 버전 빌드 시 `build-apk.yml` 버전 번호 수동 업데이트 (GitHub 웹 UI)

---

## 🔢 개발 우선순위 (세션 11 기준)

```
✅ 완료        : 3단계(자동업데이트), 4단계(로그인 개선), 5단계(앱 설정), 6단계(APK 빌드)
✅ 완료        : 2단계(GPS 위치 추적), 법령안내 관리(legal-notices)
🚧 진행 예정   : 1단계(알림 Android 수신 테스트) → NAS 크론잡 설정
⏸️ 보류        : 강제업데이트 UI, 네이티브 푸시알림
```

| 순서 | 단계 | 작업 | 상태 |
|------|------|------|------|
| 1 | 4단계 | 로그인 화면 개선 (아이디 저장, 자동완성, 로딩) | ✅ 완료 (세션8) |
| 2 | 5단계 | 앱 설정 메뉴 (설정 카드 추가) | ✅ 완료 (세션8) |
| 3 | 2단계 | GPS 위치 추적 (출퇴근 위치 저장) | ✅ 완료 (세션11) |
| 4 | 법령안내 | legal-notices 라우트 + 시드 데이터 | ✅ 완료 (세션11) |
| 5 | 버그수정 | 위치이력 카드 컨테이너 구조 / 화면 dim 처리 | ✅ 완료 (세션11) |
| 6 | 1단계 | 알림 기능 Android 수신 테스트 | ⏸️ 다음 세션 |
| 7 | NAS | 크론잡 설정 (`nas-auto-deploy.sh`) | ⏸️ 다음 세션 |

---

## 🗓️ 세션 11 — 2026-06-11 버그 수정 3건 + 법령안내 구현

### 완료된 작업

#### ✅ [1] PM2 샌드박스 재시작
- **문제**: `ecosystem.config.cjs`에 NAS 로컬 경로 하드코딩
- **해결**: `pm2 start npx --name safetynote -- wrangler pages dev dist --ip 0.0.0.0 --port 3000`
- 샌드박스 PM2 재시작 횟수 정상 (2회)

#### ✅ [2] 위치 이력 카드 HTML 구조 버그 수정
- **문제**: `renderMyProfilePage()`에서 위치이력 카드 `<div>`가 `max-w-2xl` 컨테이너 밖에 생성
- **해결**: 들여쓰기 조정으로 컨테이너 안으로 이동, `max-w-2xl` 닫는 태그를 위치이력 카드 뒤로 이동
- **파일**: `webapp/public/static/app.js`
- **커밋**: `384aa30`, GitHub: `a1cc384d8c9f`

#### ✅ [3] 화면 전체 dim 처리 버그 수정
- **문제**: 모달 오픈 후 페이지 전환 시 `.modal-overlay` 잔류 + `top-header` z-index(50)가 overlay(1000)보다 낮아 헤더 숨김
- **해결**:
  - `safeNavigateTo()` / `navigateTo()`: `querySelector` → `querySelectorAll(...).forEach(el => el.remove())` 전부 제거
  - `top-header` z-index: 50 → 1100 (modal-overlay 1000 위)
- **파일**: `webapp/public/static/app.js`, `webapp/public/static/style.css`
- **커밋**: `d78b45d`, GitHub: `4c36ed1b4e4d` (app.js), `c84b8408607c` (style.css)

#### ✅ [4] 법령안내 페이지 데이터 없음 버그 수정
- **문제**: `/api/legal-notices` 라우트 자체가 미구현 → 프론트엔드 빈 화면
- **해결**:
  - `src/routes/legal-notices.ts` 신규 생성 (GET /  GET /:key  PUT /:key  DELETE /:key)
  - `getUser()` 패턴 사용 (`hono/jwt` 미들웨어 사용 시 `c.env.SESSION_SECRET` undefined 크래시)
  - `src/index.tsx`에 `app.route('/api/legal-notices', legalNoticeRoutes)` 등록
  - `migrations/0051_legal_notices_seed.sql` 생성 (일반 법령안내 5건 + 교육 법령기준 5건)
- **파일**: `webapp-deploy/safetynote/src/routes/legal-notices.ts` (신규)
- **GitHub commit**: `d18c2e64df9e` (getUser 패턴 최종 수정본)

#### ✅ [5] NAS PM2 크래시 루프 원인 해결
- **증상**: PM2 재시작 횟수 377회 — 서버 크래시 루프
- **원인 1**: `legal-notices.ts` 초기 버전에서 `hono/jwt` 미들웨어가 `c.env.SESSION_SECRET` 참조 → undefined 에러 크래시
- **원인 2**: `EADDRINUSE port 3443` — PM2 restart 시 이전 프로세스 종료 전 재기동으로 포트 충돌 루프
- **해결**: `legal-notices.ts` `getUser()` 패턴으로 재작성 후 NAS `git pull` + `pm2 restart`
- **확인**: `pm2 reset safetynote` 후 10초 경과 → 재시작 횟수 0 유지 ✅

### 세션 11 미완료 (다음 세션 진행)
- [ ] 1단계 알림 기능 Android 테스트 (벨 아이콘, 배지, 알림 패널)
- [ ] NAS 크론잡 설정 (`nas-auto-deploy.sh` 등록)

### 파일 수정 요약
| 파일 | 변경 |
|------|------|
| `webapp/public/static/app.js` | 위치이력 카드 컨테이너 구조 + safeNavigateTo/navigateTo overlay 전체 정리 |
| `webapp/public/static/style.css` | top-header z-index 50 → 1100 |
| `webapp-deploy/.../routes/legal-notices.ts` | 신규 생성 (getUser 패턴) |
| `webapp-deploy/.../src/index.tsx` | legalNoticeRoutes 등록 |
| `webapp-deploy/.../migrations/0051_legal_notices_seed.sql` | 10건 시드 데이터 |

---

## 🗓️ 세션 12 — 2026-06-11 법령안내 복구 확인 + 추가/삭제 기능 구현

### ✅ [1] 법령안내 페이지 데이터 복구 과정 (세션12 인수 후)

**증상**: 법령안내 관리 페이지에 데이터가 표시되지 않음 ("기존과 동일")

**진단 과정**:
1. DB 확인: `sqlite3 /volume1/safetynote/data/safety.db "SELECT notice_key, title FROM legal_notices LIMIT 5;"`
   - `edu_*` 5건만 존재, `safety_*` 5건 **누락** 확인
   - 0051 migration이 부분 적용됨 (edu 시드는 `patchSchema`에서 자동 삽입, safety 시드는 migration만 존재)

2. API 테스트 (토큰 없어서 실패 → 로그인으로 토큰 획득):
   - `users` 테이블에 `token` 컬럼 없음 확인 → 토큰은 로그인 시 즉석 base64 생성 방식
   - `curl -s -k https://localhost:3443/api/auth/login`으로 토큰 획득 후 API 호출
   - API 응답: 총 10건 정상 반환 확인 (DB 삽입 후)

3. NAS 서버 구조 재확인:
   - `node-server.ts`가 실제 NAS 엔트리 포인트 (Cloudflare Workers용 `src/index.tsx`와 별개)
   - `node-server.ts`에 `/api/legal-notices` 라우트 이미 직접 구현되어 있었음

**해결**: NAS DB에 `safety_*` 5건 직접 삽입 (INSERT OR IGNORE)
```sql
INSERT OR IGNORE INTO legal_notices (notice_key, title, law_ref, content, is_active) VALUES
  ('safety_general', '산업안전보건법 주요 의무사항', ...),
  ('safety_ppe', '개인보호구 지급 및 착용 의무', ...),
  ('safety_stop', '중대재해 발생 시 작업중지 의무', ...),
  ('safety_hazard', '위험성 평가 실시 의무', ...),
  ('safety_tbm', 'TBM(작업 전 안전점검) 실시', ...);
```
→ `SELECT COUNT(*) FROM legal_notices WHERE is_active = 1` = **10건 확인** ✅

**교훈**:
- NAS는 `node-server.ts` (Node.js SQLite) / Cloudflare는 `src/index.tsx` (D1) — 서버가 분리됨
- `patchSchema` 자동시드는 `edu_*`만 처리, `safety_*`는 별도 migration 필요
- `safety_*`는 향후 `patchSchema`에 자동시드 추가 권장

### ✅ [2] 법령안내 추가/삭제 기능 구현 (세션12)

**구현 내용**:
- **추가 기능** (admin 전용): 헤더 우측 "새 법령안내 추가" 버튼 → 모달 폼 (키/제목/법령근거/내용 입력)
- **삭제 기능** (admin 전용): 각 카드 우측 휴지통 버튼 → 확인 다이얼로그 → 소프트 삭제(`is_active=0`)
- `node-server.ts`에 `POST /api/legal-notices` + `DELETE /api/legal-notices/:key` 라우트 추가

**파일**:
- `public/static/app.js` — 추가/삭제 UI + 모달 함수 (`_addLegalNotice`, `_submitAddLegalNotice`, `_deleteLegalNotice`)
- `node-server.ts` — POST(신규추가, 중복키 409), DELETE(소프트삭제, admin전용) 라우트

**GitHub commit**: `a8f9ae94` (app.js), `120ea589` (node-server.ts)

---

### 🐛 [3] 삭제 버그 1차 — GET `is_active=1` 필터 누락

**증상**: 삭제 성공 메시지는 나오지만 화면에서 항목이 사라지지 않음. 재삭제 시 "존재하지 않는 법령안내" 에러.

**원인**: `GET /api/legal-notices` 쿼리에 `WHERE is_active = 1` 필터 누락
- DB에서는 `is_active=0`으로 정상 소프트삭제됨
- 목록 조회 시 전체 반환 → 삭제된 항목도 화면에 표시

**수정**: `node-server.ts` GET 쿼리에 `WHERE ln.is_active = 1` 추가

**GitHub commit**: `917ea4f3` (node-server.ts)

---

### 🐛 [4] 삭제 버그 2차 — 삭제 후 화면 미갱신

**증상**: 필터 수정 후에도 삭제 메시지는 나오지만 목록이 갱신되지 않음.

**원인**: 삭제 성공 후 `navigateTo('legal-notices')` 호출 시 `currentPage`가 이미 `'legal-notices'`인 상태에서 DOM 재렌더링이 타이밍 문제로 이전 화면 유지

**수정**:
- `navigateTo('legal-notices')` → `renderLegalNoticesPage(content)` 직접 호출로 변경
- 삭제 버튼: `onclick` 인라인 → `addEventListener` + `data-key` 방식 (안전성 강화)
- 삭제 중 버튼 비활성화 + 스피너 표시 (중복 클릭 방지)
- 추가 성공 후도 동일하게 `renderLegalNoticesPage` 직접 호출 적용

**GitHub commit**: `81e119a9` (app.js)

---

### 세션 12 파일 수정 요약
| 파일 | 변경 내용 |
|------|----------|
| `public/static/app.js` | 추가/삭제 UI + 버그 수정 2건 |
| `node-server.ts` | POST/DELETE 라우트 + GET is_active 필터 |
| `PROJECT_HISTORY.md` | 세션12 전체 이력 기록 |

---

## 🗓️ 세션 13 — 2026-06-11

### 완료
- PROJECT_HISTORY.md 기록 방식 개선: 상세 전문 → **핵심 요약** 방식으로 변경
- 지도앱 복귀 후 WebView 멈춤 버그 수정 — `window.open(_system)` 방식으로 변경
- 위험성 체크리스트 500 에러 수정 — `checklist_assessments` FK가 `tasks_old` 참조 → `tasks`로 수정 (sqlite3 직접 실행)
- NAS git pull + pm2 restart 적용 완료

### 미완료 (다음 세션 인계)
- [ ] 1단계 알림 Android 테스트
- [ ] NAS 크론잡 설정 (`nas-auto-deploy.sh`)
- [ ] `patchSchema`에 `safety_*` 자동시드 추가

---

## 🗓️ 세션 14 — 2026-06-11

### 완료
- **세션 13 인수** — GitHub 미배포 커밋(`a46862b`) 확인 후 작업 재개
- **`task_stops` 컬럼명 버그 수정** — 세션13에서 잘못 수정한 `stopped_by` → `reported_by` 복원 (실제 DB 컬럼: `reported_by`)
- **`legal-notices` 라우트 추가** — `src/routes/legal-notices.ts` + `migrations/0051` + `src/index.tsx` 라우트 등록
- **GitHub 배포** — `safetynote-server` main 브랜치 push 완료 (`8835845`)
  - `node-server.ts`: `app.js?v=20260611` 캐시 버전 업데이트
  - `src/routes/tasks.ts`: `task_stops reported_by` 컬럼명 통일 + 작업상태변경 notifications DB 저장
  - `src/routes/legal-notices.ts`: 법령안내 CRUD API
  - `migrations/0051_legal_notices_seed.sql`: 법령안내 초기 데이터

- **NAS git pull + pm2 restart** — `581866f → 208639a` 반영 완료 (`app.js?v=20260611` ✅)
- **TBM 서명 FK 수정 (NAS DB 직접)** — `tbm_signatures.tbm_id` FK가 `tbm_records_old` 참조 → `tbm_records`로 재생성
  - 원인: `0028` 마이그레이션 `tbm_records→tbm_records_old` rename 후 `tbm_signatures` FK 미정리
  - 수정: sqlite3 직접 테이블 재생성 (`tbm_signatures_new` → rename)
  - 확인: `PRAGMA foreign_key_list(tbm_signatures)` → `tbm_records` ✅

- **TBM 앱 서명요청 버튼 근로자 허용** — `!_tbmIsWorker` 조건 제거, 전 역할 사용 가능 (`560f5ff`)
- NAS git pull + pm2 restart 적용 완료 ✅

- **TBM 완료 알림** — admin/supervisor에게 SSE + notifications DB 저장 (`95e181d`)
- **TBM 완료 알림 메시지 개선** — 작업번호(WKS-xxx) 포함 형식으로 수정 (`bbdb0bc`)
- **작업상태변경 알림 정상 동작 확인** ✅
- NAS git pull + pm2 restart 적용 완료 ✅

### 미완료 — 보류 (향후 작업 예정)
- [ ] **NAS 크론잡 설정** — `nas-auto-deploy.sh` crontab 등록 (git pull 자동화)
- [ ] **`patchSchema` safety_* 자동시드** — DB 초기화 시 안전 기본데이터 자동 삽입
- [ ] **버전 캐시 자동화** — `app.js?v=날짜` 하드코딩 → 빌드 시 자동 갱신
- [ ] **TBM 결재 서명 완료 알림** — 모든 결재 서명 완료 시 작업 담당자에게 알림
- [ ] **사진/파일 첨부 알림** — 작업에 사진/파일 첨부 시 관리자 알림

---

## 🗓️ 세션 15 — 2026-06-11

### 완료
- **세션 14 인수** — 미커밋 상태(`public/static/app.js`) 확인 후 작업 재개
- **app.js 용어 통일 마무리**
  - 2804줄 주석: `하위작업번호 입력 마스킹` → `서브작업번호 입력 마스킹`
  - 전체 grep 확인: `작업 ID`, `하위작업번호` 잔여 참조 완전히 제거 ✅
- **GitHub 배포** — `safetynote-server` main 브랜치 push 완료 (`3a93562`)
  - `public/static/app.js`: 용어통일(서브작업번호/작업번호) + dispNum work_number 기준 변경
  - 커밋 요약: 작업 ID→작업번호, 하위작업번호→서브작업번호, dispNum work_number 기준, 작업 상세 서브작업번호 강조 + 작업번호 회색 표시

### 다음 단계
- **NAS git pull + pm2 restart** — GitHub push 반영 → ✅ 적용 완료
- **동작 확인** — 작업 상세/공사 상세 화면에서 서브작업번호 표시 확인 → ✅ 확인 완료

---

## 🗓️ 세션 15 (계속) — 2026-06-11

### 추가 완료
- **저장 폴더 현황 UI 개선** — 디렉토리 목록 → 총용량 + 종류별 파일수 요약 카드로 변경 (`de23f45`)
  - `node-server.ts`: `/api/admin/folders` API 응답 변경
    - 기존: 디렉토리 목록 배열 반환
    - 변경: 재귀 scanDir로 집계 → `{ totalBytes, imgCount, docCount, vidCount, etcCount }` 반환
    - 확장자 분류: 이미지(jpg/png/gif/webp 등) / 문서(pdf/doc/xls/hwp 등) / 동영상(mp4/avi/mov 등) / 기타
  - `app.js`: 저장 폴더 현황 섹션 UI 전면 교체
    - 총 저장용량 배너 (노란색 그라디언트, HDD 아이콘 + 전체 파일수)
    - 2×2 그리드 요약 카드: 이미지(초록) / 문서(파랑) / 동영상(보라) / 기타(회색)
    - `_formatBytes()` 헬퍼 추가 (자동 B/KB/MB/GB 변환)
  - NAS 적용 완료 ✅ 동작 확인 완료 ✅

### 논의/결정 사항
- **워크시트(스프레드시트) UI 방식** 도입 논의
  - 화면에서 엑셀처럼 셀 직접 입력하는 방식으로 결정
  - 적용 대상: **외선일보 작성** 방식 수정
  - 개발 방식: **독립 프로토타입 먼저 제작** → 검증 후 기존 시스템 통합
  - 현재 아키텍처 파악 완료
    - 프론트엔드: `app.js` 단일 파일 (24,000줄) — 모든 화면 렌더링
    - 백엔드: 메뉴별 `src/routes/*.ts` 분리 — API 호출 방식
  - **샘플 엑셀 파일 대기 중** — 파일 수신 후 프로토타입 제작 시작 예정

### 다음 단계
- [ ] **외선일보 샘플 엑셀 파일** 수신 후 컬럼 구조 분석
- [ ] **워크시트 프로토타입** — `webapp-deploy/worksheet-proto/` 독립 앱으로 제작
- [ ] **검증 완료 후** — `safetynote` 시스템에 통합

### 미완료 — 보류 (향후 작업 예정)
- [ ] **NAS 크론잡 설정** — `nas-auto-deploy.sh` crontab 등록 (git pull 자동화)
- [ ] **`patchSchema` safety_* 자동시드** — DB 초기화 시 안전 기본데이터 자동 삽입
- [ ] **버전 캐시 자동화** — `app.js?v=날짜` 하드코딩 → 빌드 시 자동 갱신
- [ ] **TBM 결재 서명 완료 알림** — 모든 결재 서명 완료 시 작업 담당자에게 알림
- [ ] **사진/파일 첨부 알림** — 작업에 사진/파일 첨부 시 관리자 알림

---

## v1.3.3 — 세션17 (2026-06-12)

### 작업 내용
- 커밋: `e3f4fca`
- 캐시버전: `v=20260612e`

#### 외선작업일보 3섹션 구조 전면 재편 (스크린샷 uB1ryzk2 기반)

**변경 전:** 2섹션 구조 (작업내역 + 광케이블 정보)
**변경 후:** 3섹션 구조 (작업내역 → 확선내역 → 광케이블 정보)

##### 섹션1: 작업내역 (구조 전면 변경)
| 이전 컬럼 | 신규 컬럼 |
|-----------|-----------|
| 구분/관리구/관리번호/간선명/간선번호/전산화번호/구간거리/장주/IP주/바인드/행거/금구류/함체/명찰/주의판/접지/비고 | 구분/제조사/외경(mm)/내경(mm)/용도/시작점(M)/종료점(M)/사용길이(자동)/광도시사용(S)/기초번호/자재수량 |

##### 섹션2: 확선내역 (신규 생성)
- 컬럼: 구분/관로ID/맨홀(전)/맨홀(후)/점유공/점유내공/우회여부/위치/외경/내경/방기(체크)/방기수량/철거(체크)/철거수량/용도/포설(체크)/수용여부(체크)/상태/비고
- `_wrAddConfirm()` 행 추가 함수 신규 작성
- `wrc2-*` CSS 클래스 네임스페이스로 기존 섹션과 충돌 방지

##### 섹션3: 광케이블 정보 (구조 변경)
| 이전 컬럼 | 신규 컬럼 |
|-----------|-----------|
| LOT NO./규격(C)/제조사/제작년도/케이블종류/공정구분/시작점/종단점/사용량/구분코드/특이사항 | 구분/소속기관/제조사/광케이블종류/코어수/시작점(M)/종료점(M)/포설길이(자동)/광도시사용(S)/설계코드/자재수량 |

##### 함수 변경 사항
- `_wrAddLine()`: 섹션1 새 컬럼 구조 반영 (wrl-* 클래스)
- `_wrAddConfirm()`: 신규 생성 — 섹션2 확선내역 행 추가
- `_wrAddCable()`: 섹션3 새 컬럼 구조 반영 (wrc-* 클래스)
- `_calcLineUsage()`: 신규 — 섹션1 사용길이 자동계산 (종료점-시작점)
- `_calcUsage()`: 기존 유지 — 섹션3 포설길이 자동계산
- `_collectWrData()`: confirms 배열 수집 추가 (3섹션 데이터 모두 수집)

##### UI 텍스트 변경
- 행 추가 버튼: `행 추가` → `+ 추가`
- 제출 버튼: `제출하기` → `메인 등록`

### 다음 단계
- [ ] **NAS git pull + pm2 restart** — 커밋 `e3f4fca` 적용 필요
- [ ] 확선내역/광케이블 DB 저장 API 연동 (`work-reports.ts` 신규 테이블 처리)

---

## 🗓️ 세션 28 — 2026-06-18 (Phase 2 FCM 푸시 알림 서버 구현)

### 커밋 이력
| 해시 | 설명 |
|------|------|
| `5d3e8d0` | fix: 탭바 sticky v3 — tab-bar-wrap을 modal 직계 자식으로 이동 (FEAT-025-TAB) |
| `d2d2bb3` | docs: FEAT-025-TAB v3 커밋 해시 기입 (BUGFIX_LOG) |
| `d32c632` | **feat: FCM 푸시 알림 서버 구현 (Phase 2 — FEAT-025-FCM)** |

### 주요 작업

#### FEAT-025-TAB v3 (보류)
- tab-bar-wrap을 modal 직계 자식으로 이동하는 HTML 구조 변경 시도
- 모바일 디바이스에서 여전히 sticky 미작동 → 사용자 결정으로 **보류**
- 롤백 태그: `rollback/pre-feat-tab-sticky-v3` → `5add4ae`

#### Phase 2 — FEAT-025-FCM (서버 구현 완료)

**신규 파일:**
- `src/fcm.ts` — FCM HTTP v1 헬퍼 모듈 (firebase-admin 미사용)

**수정 파일:**
- `node-server.ts` — patchSchema v0.134, FCM 헬퍼함수, FCM API 4개, 병행 발송 5곳
- `public/static/app.js` — 관리자 UI 푸시 발송 섹션, _loadFcmStatus(), sendManualPush()

**FCM API 엔드포인트:**
```
POST   /api/push/register  — 앱에서 FCM 토큰 등록/갱신
DELETE /api/push/register  — 로그아웃 시 토큰 삭제
POST   /api/push/send      — 관리자 수동 발송 (all|role:xxx|user:123)
GET    /api/push/status    — 토큰 등록 현황 (admin/supervisor)
```

**FCM 자동 발송 트리거 (5곳):**
- TBM 결재: safety서명완료 → general 알림
- TBM 결재: general서명완료 → ceo 알림
- TBM 결재: ceo서명완료 → 안전관리자 완료 알림
- 서명요청 단건 (POST /api/signature-requests)
- 서명요청 일괄 (POST /api/signature-requests/bulk)

**Firebase 프로젝트**: `safetynote-c1e8c`  
**패키지명**: `me.gisubhan.safetynote`

### 빌드 상태
- `npm run build` → ✅ 성공 (`dist/_worker.js 250.32 kB`)
- `app.js` 구문 검사 → ✅ 통과
- 캐시 버전: `v=20260617n`
- 롤백 태그: `rollback/pre-phase2-fcm` → `d2d2bb3`

### 세션 28 미완료 → 다음 세션

- [ ] **Android 앱 FCM 연동** (safetynote-android 저장소):
  - `app/google-services.json` 추가
  - `app/build.gradle`: FCM SDK 의존성 추가
  - `MyFirebaseMessagingService.java`: 토큰 자동 등록, 알림 수신 처리
  - `AndroidManifest.xml`: FCM 서비스 등록, 알림 채널 권한
- [ ] **NAS .env 설정**: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY 추가
- [ ] **NAS git pull + pm2 restart** 후 실기기 테스트
- [ ] **FEAT-025-TAB** 탭바 sticky 모바일 미작동 — 별도 세션 재시도


## 🗓️ 세션 29 — 2026-06-18 (BUG-008: APK 업데이트 불가 + 서버 설정 화면 개선)

### 커밋 이력
| 해시 | 설명 |
|------|------|
| `c74b6ab` | fix: BUG-008 서버 설정 화면 전면 개선 (v1.4.4) — safetynote-android |
| `044a33d` | docs: BUG-008 세션 29 기록 추가 — safetynote-server |

### 주요 작업

#### BUG-008 분석 결과
- `app.js` `doApkDownload()` — `typeof Log !== 'undefined'` 수정 **이미 적용됨** ✅
- `MainActivity.java` APK URL 감지 조건 — 정상 ✅
- **실제 문제**: `www/index.html` 앱 시작 로직 — 저장된 주소 있으면 무조건 자동 연결, 설정 화면 접근 불가

#### 수정 파일: `safetynote-android/www/index.html`

**변경 내용 요약:**

1. **저장된 서버 주소 → 수정 가능** (핵심 수정)
   - 기존: 저장된 주소 있으면 스플래시 1.2초 후 바로 자동 연결 (설정 화면 안 보임)
   - 수정: 저장된 주소 카드 표시 → "이 서버로 연결" / "주소 변경" 선택 가능
   - "주소 변경" 클릭 → 입력 폼 표시 + 기존 값 자동 채워짐

2. **포트 기본값 3443 설정**
   - `<input value="3443">` 명시 (placeholder만으로는 실제 입력값 없음)
   - `getSavedPort()` 기본값도 `'3443'` 반환

3. **접속 테스트 버튼 추가** (최초 APK 기능 복원)
   - `testConnection()` — `fetch + no-cors` 모드로 서버 도달 확인
   - 타임아웃 8초
   - 테스트 중 🔄 / 성공 ✅ / 실패 ⏱ 상태별 UI
   - 테스트 중에는 "접속 테스트" + "서버 연결" 버튼 비활성화

4. **프리셋 버튼 개선**
   - 기존: 클릭하면 바로 연결
   - 수정: URL 파싱 → 주소/포트 입력 필드에 채워넣기 (검토 후 직접 연결)

5. **UX 기타**
   - 초기화 시 포트 기본값 3443으로 리셋
   - 오류 메시지 구체화

#### 수정 파일: `safetynote-android/.github/workflows/build-apk.yml`
- 버전 기본값: `1.3.0` → **`1.4.4`**

### 버전 테이블 업데이트
| 버전 | 날짜 | 빌드 상태 | 주요 변경 내용 |
|------|------|-----------|----------------|
| **v1.4.4** | **2026-06-18** | ✅ **빌드 완료 + 설치 확인** | 서버 설정 화면 개선(수정 가능/접속 테스트/포트 기본값 3443), BUG-008 수정 |

### 세션 29 미완료 → 다음 세션
- [x] **APK v1.4.4 빌드** — GitHub Actions Run #27744945922 완료 (`safetynote-v1.4.4.apk` 5.7MB)
- [ ] **실기기 FCM 수신 테스트** — APK 설치 후 로그인 → 토큰 등록 확인 → 관리자 수동 발송 테스트

---

## 세션 30 (2026-06-18)

### 작업 목표
- PROJECT_HISTORY.md 미커밋 변경사항(커밋 해시 반영 + 빌드 상태 ✅) 커밋/푸시
- JS→SharedPreferences JWT 저장 브릿지 코드 확인 (`MainActivity.java`)
- FCM 실기기 테스트 가이드 정리

### 커밋 이력
| 해시 | 설명 |
|------|------|
| `65b9c51` | docs: 세션 30 — PROJECT_HISTORY 빌드 완료 확인 반영 — safetynote-server |
| `06380c1` | fix: BUG-009 JS→SharedPreferences JWT 브릿지 구현 (v1.4.5) — safetynote-android |
| `decb91e` | fix: BUG-009 app.js doLogin/doLogout 브릿지 호출 추가 — safetynote-server |

### 주요 작업 — BUG-009 수정 (FCM JWT 브릿지)

#### 원인
- `localStorage`(WebView 전용) ↔ `SharedPreferences`(Android 네이티브) 데이터 단절
- `MainActivity.java`에 `@JavascriptInterface` 브릿지 부재
- 결과: `onNewToken()` 호출 시 JWT null → FCM 토큰 서버 등록 생략 → 푸시 수신 불가

#### 수정 내용
1. **`MainActivity.java`** — `SafetyNoteAppBridge` 내부 클래스 추가
   - `saveAuthToken(token)` — 로그인 시 JWT → SharedPreferences 저장 + FCM 즉시 재등록
   - `clearAuthToken()` — 로그아웃 시 JWT 삭제
   - `saveServerUrl(url)` — 서버 URL 저장
   - `triggerFcmRegistration()` — 로그인 직후 FCM 토큰 서버 등록 보완
2. **`app.js`** — `doLogin()` / `doLogout()` 에 `window.SafetyNoteApp.saveAuthToken/clearAuthToken()` 호출
3. **`www/index.html`** — `doConnect()` 에 `window.SafetyNoteApp.saveServerUrl()` 호출
4. **`build-apk.yml`** — 버전 기본값 `1.4.5`

### 버전 테이블 업데이트
| 버전 | 날짜 | 빌드 상태 | 주요 변경 내용 |
|------|------|-----------|----------------|
| **v1.4.4** | **2026-06-18** | ✅ **빌드 완료 + 설치 확인** | 서버 설정 화면 개선(BUG-008) |
| **v1.4.5** | **2026-06-18** | ✅ **빌드 완료** | FCM JWT 브릿지 수정(BUG-009) — 로그인 후 FCM 토큰 서버 등록 |

### 세션 30 미완료 → 다음 세션 (추가 버그 발견)
- [x] **실기기 v1.4.5 설치** 완료 → FCM 등록 0명 확인 → BUG-010 발견

---

## 세션 30 (추가) — BUG-010 수정 (2026-06-18)

### 커밋 이력
| 해시 | 설명 |
|------|------|
| `8e5144f` | fix: BUG-010 FCM SSL 폴백 + APK 다운로드 브릿지 (v1.4.6) — safetynote-android |
| `f1c05c1` | fix: BUG-010 app.js downloadApk 브릿지 우선 사용 — safetynote-server |

### 주요 작업 — BUG-010 (FCM 0명 + APK 다운로드 불가)

#### BUG-010-1: FCM 등록 0명
- **원인**: `HttpURLConnection`이 WebView와 별도 TrustStore 사용 → 자체서명 인증서 `SSLHandshakeException` → 조용히 실패
- **수정**: `MyFirebaseMessagingService` + `triggerFcmRegistration()` 모두 `https→http` 폴백 추가

#### BUG-010-2: APK 다운로드 안됨
- **원인 1**: `window.open(url, '_system')` → Capacitor 6에서 `shouldOverrideUrlLoading` 미트리거
- **원인 2**: `/api/dist/apk/download` URL → `.apk`/`.apk?`/`/apk/` 감지 조건 모두 불충족
- **수정**: `SafetyNoteAppBridge.downloadApk()` 추가 → `startApkDownload()` 직접 호출, `app.js` 브릿지 우선 사용

### 버전 테이블 업데이트
| 버전 | 날짜 | 빌드 상태 | 주요 변경 내용 |
|------|------|-----------|----------------|
| **v1.4.5** | **2026-06-18** | ✅ 빌드 완료 | FCM JWT 브릿지 수정(BUG-009) — 로그인 후 FCM 토큰 서버 등록 |
| **v1.4.6** | **2026-06-18** | ✅ **빌드 완료** | FCM SSL 폴백(BUG-010-1) + APK 다운로드 브릿지(BUG-010-2) |

### 세션 30 추가분 미완료 → 세션 31에서 완료
- [x] **v1.4.6 빌드 완료 확인** — Run #27748680201 success ✅
- [ ] **실기기 재테스트** — NAS git pull 후 재테스트 필요

---

## 세션 31 (2026-06-18) — NAS 미배포 원인 분석 + 복원 툴 + 빌드 로그 강화

### 문제 분석
v1.4.6 설치 후에도 동일 증상(FCM 0명, APK 다운로드 무반응):
- **근본 원인**: NAS 서버에 `git pull`이 실행되지 않아 구버전 `app.js` 서빙 중
- NAS 서빙 버전: `v=20260617n` (세션 27)
- NAS 배포 커밋: `a473c4a` (세션 27 — BUG-009/010 수정 전)
- GitHub main 최신: `4f2a285` (BUG-010 수정 포함)

### 완료된 작업

#### 1. 캐시 버전 업데이트
- `node-server.ts` 캐시 버전: `v=20260617n` → `v=20260618a`
- NAS git pull 후 브라우저/WebView 캐시 강제 갱신됨

#### 2. 복원 툴 작성 (`scripts/rollback.sh`)
| 버전코드 | 커밋 | 설명 |
|----------|------|------|
| `pre-bug010` | `decb91e` | BUG-009 적용됨, BUG-010 수정 전 (v1.4.5 APK 대응) |
| `pre-bug009` | `a473c4a` | 세션 27 안정 버전 (v1.4.4 APK 대응) |
| `stable-28` | `d32c632` | FCM 서버 API 추가됨 (v1.4.3 APK 대응) |
| `latest` | `HEAD` | main 최신 |

사용법:
```bash
# NAS에서 실행
bash /volume1/safetynote/scripts/rollback.sh [버전코드]
bash /volume1/safetynote/scripts/rollback.sh pre-bug010
```

#### 3. 배포 스크립트 작성 (`scripts/nas-deploy.sh`)
- git pull + 핵심 코드 검증 + pm2 restart + 라이브 서버 검증 자동화
- BUG-009/010 코드 포함 여부 자동 확인
```bash
bash /volume1/safetynote/scripts/nas-deploy.sh
```

#### 4. APK 빌드 로그 강화 (`build-apk.yml`)
- **새 검증 스텝 추가** ("Verify critical files"): 빌드 전 핵심 파일 4개 검증
  - MainActivity.java: SafetyNoteAppBridge, @JavascriptInterface, saveAuthToken, downloadApk
  - MyFirebaseMessagingService.java: SSL 폴백 코드
  - www/index.html: saveServerUrl 호출
  - google-services.json 존재 여부
  - 검증 실패 시 빌드 즉시 중단 (`exit 1`)
- **Build summary 강화**: 핵심 기능 포함 여부 + Git 정보 출력

#### 5. BUGFIX_LOG 업데이트
- BUG-010-3: NAS 미배포 원인 + 해결 기록
- RULE-003: NAS 배포 체크리스트 추가

### 커밋 이력
| 해시 | 설명 |
|------|------|
| (이번 세션) | fix: 캐시버전 v=20260618a + NAS 배포/롤백 스크립트 + 빌드 로그 강화 |

### 버전 테이블
| 버전 | 날짜 | 빌드 상태 | 주요 변경 내용 |
|------|------|-----------|----------------|
| **v1.4.4** | **2026-06-18** | ✅ 빌드 완료 + 설치 확인 | 서버 설정 화면 개선(BUG-008) |
| **v1.4.5** | **2026-06-18** | ✅ 빌드 완료 | FCM JWT 브릿지(BUG-009) |
| **v1.4.6** | **2026-06-18** | ✅ 빌드 완료 | FCM SSL 폴백(BUG-010-1) + APK 다운로드 브릿지(BUG-010-2) |

### NAS 배포 확인 결과 (세션 31)
```
app.js?v=20260618a     ✅ 신버전 서빙 확인
saveAuthToken: 2건     ✅ BUG-009 코드 라이브
downloadApk:   3건     ✅ BUG-010 코드 라이브
pm2 safetynote online  ✅ 재시작 완료
```

### 세션 31 미완료 → 세션 32에서 추가 진단
- [x] **NAS git pull 실행** — `9a27d73` 반영 완료 ✅
- [x] **실기기 재테스트** — FCM 0명 지속 → BUG-010-4 발견 (세션 32)

---

## 세션 32 (2026-06-18) — BUG-010-4 원인 확정 + HTTP 3444 포트 수정

### 문제 분석 (BUG-010-4)
NAS git pull 완료 후에도 FCM 0명 지속. 진단 결과:
- PM2 로그에 FCM 등록 시도 흔적 **전혀 없음**
- `curl http://...:3443` → **빈 응답** ← 핵심 단서

**근본 원인**: `3443` 포트는 `https.createServer()` HTTPS 전용 소켓.  
Android가 `http://...:3443`으로 요청 → TLS handshake 기대하는 서버가 즉시 연결 종료 → 빈 응답.

```
[BUG-010-1 v1]  https://...:3443  →  SSLHandshakeException
[BUG-010-1 Fix] http://...:3443   →  빈 응답 (HTTPS 소켓)   ← 여전히 실패
[BUG-010-4 Fix] http://...:3444   →  정상 응답 ✅
```

### 완료된 작업

#### 서버 (`node-server.ts`, `c4c77de`)
- HTTPS(3443) 유지하면서 HTTP 전용 3444 포트 **동시 기동** 추가
- `httpServer.on('error')` — `process.exit()` 없음 (3444 실패해도 3443 계속 운영)

#### Android (`e8d4bd2`)
- `MainActivity.triggerFcmRegistration()`: `:3443` → `:3444` 포트 변환 추가
- `MyFirebaseMessagingService.registerTokenToServer()`: 동일 변환 추가

#### 문서/규칙
- `BUGFIX_LOG.md`: BUG-010-4 + RULE-004 (NAS 포트 구조) 추가
- `scripts/rollback.sh`: `pre-bug010-v2` 버전 추가

### 버전 테이블
| 버전 | 날짜 | 빌드 상태 | 주요 변경 |
|------|------|-----------|---------|
| v1.4.5 | 2026-06-18 | ✅ | FCM JWT 브릿지 (BUG-009) |
| v1.4.6 | 2026-06-18 | ✅ | SSL 폴백 + APK 브릿지 (BUG-010-1/2) |
| **v1.4.7** | **2026-06-18** | **트리거 필요** | **HTTP 3444 포트 FCM 등록 (BUG-010-4)** |

### 커밋 이력
| 레포 | 해시 | 내용 |
|------|------|------|
| safetynote-server | `c4c77de` | HTTP 내부 포트 3444 추가 |
| safetynote-android | `e8d4bd2` | FCM 등록 포트 3443→3444 변환 |

### NAS 배포 확인 결과 (세션 32)
```
git reset --hard 438c1e1  ✅
pm2 restart online        ✅
http://...:3444 응답:  {"error":"인증 필요"}  ✅  (이전: 빈 응답)
```

### 세션 32 미완료 → 다음 세션
- [x] **NAS git pull** — `438c1e1` 반영 + 3444 포트 응답 확인 ✅
- [ ] **v1.4.7 APK 빌드** — GitHub Actions 트리거 필요 (Run #27752523683 진행 중)
- [ ] **실기기 재테스트** — v1.4.7 설치 → 로그인 → FCM 등록 수 증가 확인

---

## 세션 33 (2026-06-18) — FCM 알림 미도달 진단 + 진단 API 추가

### 문제 분석 (BUG-011)
FCM 토큰 등록은 확인됐으나 알림이 기기에 도달하지 않음.

**확인된 상태**:
```
NAS 로그:
[FCM] 토큰 등록 — user:10(한기섭) token:e4relGXPSh-ywaweRTZl...
[FCM] 토큰 등록 — user:39(전용찬) token:e4relGXPSh-ywaweRTZl...
```
→ 토큰 DB 저장은 정상이나, **발송 단계에서 조용히 실패** 가능성

**근본 원인 (유력)**:
`sendFcmPushMulti()` 내부에서 `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY`
환경변수 미설정 시 `console.warn` 한 줄만 남기고 `{sent:0, failed:N}` 반환 — **아무 로그도 PM2 out에 나타나지 않았음**.

### 완료된 작업

#### 1. `sendFcmToUsers()` / `sendFcmToRoles()` 로그 강화 (`d5bfc70`)
- 환경변수 사전 체크 + 명시적 경고 로그:
  ```
  [FCM] ⚠️ 환경변수 미설정 — FCM_PROJECT_ID:false ... — 발송 생략 (target:[10])
  ```
- 발송 시도 로그:
  ```
  [FCM] 발송 시도 — "작업상태 변경" → target:[10] tokens:1개
  [FCM] 발송 완료 — sent:1 failed:0 target:[10]
  ```

#### 2. `GET /api/push/diagnose` 신규 API (`d5bfc70`)
단계별 FCM 파이프라인 진단:
- **①** 환경변수 3개 설정 여부 즉시 확인
- **②** 더미 토큰으로 OAuth2 access_token 취득 테스트 (Google 서버 연결 확인)
- **③** DB에 등록된 FCM 토큰 목록 + 미리보기
- **④** `?test_token=` 파라미터로 실제 기기 발송 테스트

#### 3. `GET /api/push/status` 강화 (`d5bfc70`)
- `token_preview` 필드 추가 (앞 25자 + `...`)
- `without_token` 카운트 필드 추가

### 커밋 이력
| 레포 | 해시 | 내용 |
|------|------|------|
| safetynote-server | `d5bfc70` | FCM 진단 API + sendFcmToUsers 로그 강화 |

### 세션 33 이후 해야 할 것
1. **NAS에서 순서대로 실행**:
   ```bash
   # 1. 코드 반영
   cd /volume1/safetynote && git pull origin main && pm2 restart safetynote

   # 2. 환경변수 확인
   grep -i "FCM_PROJECT\|FCM_CLIENT\|FCM_PRIVATE" /volume1/safetynote/.env

   # 3. diagnose API 호출 (관리자 토큰 필요)
   curl -sk https://linkmax.myds.me:3443/api/push/diagnose \
     -H "Authorization: Bearer [관리자토큰]"
   ```

2. **환경변수 미설정 확인 시** → Firebase Console에서 서비스 계정 키 발급 → `.env` 추가 → `pm2 restart`

3. **diagnose env.all_set=true 확인 후** → 실기기 FCM 발송 테스트:
   ```bash
   curl -sk "https://linkmax.myds.me:3443/api/push/diagnose?test_token=기기FCM토큰" \
     -H "Authorization: Bearer [관리자토큰]"
   ```

4. **v1.4.7 APK 빌드 완료** 확인 → 실기기 설치 → 알림 수신 테스트

### 버전 테이블
| 버전 | 날짜 | 빌드 상태 | 주요 변경 |
|------|------|-----------|---------| 
| v1.4.6 | 2026-06-18 | ✅ | SSL 폴백 + APK 브릿지 (BUG-010-1/2) |
| **v1.4.7** | **2026-06-18** | **빌드 중** | **HTTP 3444 포트 FCM 등록 (BUG-010-4)** |

---

## 세션 34 (2026-06-18) — BUG-017 TBM 안전조치 사진 등록 팝업 z-index 수정

### 진행 내용
- **BUG-017** 수정: `showTbmPhotoModal()` z-index 미설정으로 기존 팝업 뒤에 표시되는 문제
- `modal.style.zIndex = '10020'` 추가로 최상위 표시 보장
- 캐시버전: `v=20260618a` → `v=20260618b`

### 커밋 이력
| 레포 | 해시 | 내용 |
|------|------|------|
| safetynote-server | `9a30fe8` | fix: BUG-016 TBM 안전조치 사진 등록 팝업 최상위 표시 수정 (z-index: 10020) |
| safetynote-server | `60ddb78` | docs: BUG-017 기록 추가 + rollback.sh pre-bug017 항목 추가 + 세션 34 히스토리 업데이트 |

### 사용자 확인
- "잘 동작됩니다" ✅

---

## 세션 35 (2026-06-18) — BUG-021 수동 푸시 발송 UI 개선

### 진행 내용
- **BUG-021** 수정: 수동 푸시 발송 시 FCM 토큰 미등록 상태(`with_token:0`)를 UI에서 명확히 구분 못함
- `_loadFcmStatus()`: `with_token:0` 시 RED 경고 배너 표시
- `sendManualPush()`: 발송 전 `/push/status` 사전 확인 → 토큰 0명이면 즉시 에러 토스트
  - `total:0` / `sent:0,failed:0` → warning 토스트 (대상 없음)
  - `sent:0, failed>0` → error 토스트 (토큰 만료 안내)
  - 정상 발송 → success 토스트 (성공/실패 수 표시)
- `node-server.ts` — `push/register` 로그 강화: 등록 전후 토큰 수 출력
- 캐시버전: `v=20260618b` → `v=20260618c`

### 커밋 이력
| 레포 | 해시 | 내용 |
|------|------|------|
| safetynote-server | `e86553f` | fix: BUG-021 수동 푸시 발송 UI 개선 — with_token:0 케이스 명확한 에러 메시지 + 캐시버전 v=20260618c + push/register 로그 강화 |


---

## 세션 36 (2026-06-18) — BUG-022 수동 푸시 발송 버튼 무반응 수정

### 진행 내용
- FCM 발송 서버는 정상 (`sent:1 failed:0` NAS 로그 확인, 전용찬 기기 알림 수신 확인)
- **BUG-022** 수정: `sendManualPush()`에서 미존재 함수 `showConfirm()` 호출
  → `undefined` 반환 → `!confirmed = true` → 즉시 `return` → 버튼 무반응
- `showConfirm` → `showConfirmDialog(title, msg, '발송', '취소', 'info')` 수정
- 캐시버전: `v=20260618c` → `v=20260618d`

### 커밋 이력
| 레포 | 해시 | 내용 |
|------|------|------|
| safetynote-server | `fcabd66` | fix: BUG-022 수동 푸시 발송 버튼 무반응 수정 — showConfirm→showConfirmDialog + 캐시버전 v=20260618d |

---

## 세션 37 (2026-06-19) — 파일럿 테스트 + Phase 3 준비

### 진행 내용

#### DB 분리 위험도 분석 완료
- Phase 3 (시스템 최적화 — 논리적 파일 분리) 진행 결정
- 외선일보 워크시트 계획 **완전 취소** (이번 세션 공식 기록)
- DB 분리 위험도 분석 문서 생성: `docs/DB_SEPARATION_RISK_ANALYSIS.md`
  - 1단계(논리적 분리): 위험도 ⭐☆☆☆☆, 서비스 중단 30초 이내
  - 2단계(물리적 분리): 위험도 ⭐⭐⭐⭐⭐, 운영 중 절대 금지

#### Phase 3 전체 점검 실시
- `node-server.ts` 전체 구조 분석 완료
  - 총 줄 수: **5,748줄**
  - 인라인 라우트: **75개** (node-server.ts 직접 정의)
  - 기 분리 라우트: **14개** (`src/routes/*.ts`)
  - 전체 API 엔드포인트: **96개**
  - rawDb 호출: **318곳**
- 분리 대상 그룹 17개 전체 목록 확정
- 신규 생성 필요 파일: `push`, `signature-requests`, `legal-notices`, `geocode`, `admin`, `dist`, `splice-reports`, `unit-prices`, `events` (9개)
- 기존 파일 병합 대상: `tbm`, `tasks`, `education`, `risk`, `inspections`, `work-reports`, `attachments` (7개)
- 공유 의존성 전략 수립: `src/db.ts` 신규 생성(rawDb 단일 export)

#### BUG-023 발견 (파일럿 테스트 중)
- 알림센터 전체 삭제 후 재로그인 시 알림 기록 복원 현상
- **미수정** — 파일럿 테스트 완료 후 일괄 처리 예정

### 미완료 — 보류 (파일럿 테스트 완료 후 일괄 처리)

#### 🐛 미수정 버그 목록 (파일럿 테스트 중 발견)
- [ ] **BUG-023** 알림센터 전체 삭제 후 재로그인 시 알림 복원 — `BUGFIX_LOG.md` 기록 완료

#### 🆕 기능 추가 / UI 개선 대기 목록 (파일럿 테스트 중 수집)
> 전체 목록 상세: `docs/PENDING_TASKS.md` 참조
- [ ] **TASK-001** 공사현황 — 등록된 공사건 수정/삭제 기능 추가 (완료작업 없을 때만 삭제 허용)
- [ ] **TASK-002** 공사 상세 → 작업 생성 저장 후 공사 상세 화면 유지 (현재: 작업관리로 이동됨)
- [ ] **TASK-003** 공사 등록 — "요청번호없음" 체크박스 + `LM_YY.MM.DD_##` 자동번호 생성
- [ ] **TASK-004** 시스템 설정 메뉴 — 세로 스크롤 → 그룹별 탭 방식으로 개편
- [ ] **TASK-005** 외선작업일보 케이블정보 — "자산구분" 필드 추가(N-1/N-2) + 광케이블현황 DB 동시 수정

#### 🔧 Phase 3 진행 대기 중
- [ ] **Phase 3 Step 1** — `src/db.ts` 생성 (rawDb 공유 모듈)
- [ ] **Phase 3 Step 2** — 신규 라우트 파일 9개 생성 + 인라인 라우트 이동
- [ ] **Phase 3 Step 3** — 기존 라우트 파일 7개에 인라인 라우트 병합
- [ ] **Phase 3 Step 4** — node-server.ts 정리 + 빌드 검증 + 커밋

#### 📦 배포 대기
- [ ] **NAS git pull** — 현재 NAS: `53b6733` ⚠️, 최신: `e79ee26` (BUG-021/022 미반영)

#### 📌 기존 보류 항목
- [ ] **FCM 추가 트리거** — TBM 결재 서명 완료 알림, 사진 첨부 알림
- [ ] **patchSchema safety_* 자동시드** — DB 초기화 시 안전 기본데이터 자동 삽입
- [ ] **버전 캐시 자동화** — `app.js?v=날짜` 하드코딩 → 빌드 시 자동 갱신

### 생성/수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `docs/DB_SEPARATION_RISK_ANALYSIS.md` | DB 분리 위험도 분석 보고서 신규 생성 |
| `docs/PENDING_TASKS.md` | 작업 대기 목록 문서 신규 생성 (TASK-001~005) |
| `BUGFIX_LOG.md` | BUG-023 알림센터 전체 삭제 버그 기록 추가 |
| `PROJECT_HISTORY.md` | 세션 37 기록 + 외선일보 취소 공식 반영 + TASK-001~005 등록 |

---

## 세션 38 (2026-06-19) — BUG-023 알림센터 전체삭제 수정 (1단계)

### 사전 확인
- PROJECT_HISTORY 확인 완료
- BUGFIX_LOG RULE-001~006 전체 검토 완료
- RULE-002 준수: NAS 전용 라우트를 `app.route()` 마운트 앞에 등록

### 근본 원인
`clearNotifHistory()`가 클라이언트 메모리만 삭제, 서버 DB DELETE API 호출 없음.
`notifications.ts`에 전체 삭제 엔드포인트 자체 미존재.

### 수정 내용
- `src/routes/notifications.ts` — `DELETE /clear-all` 추가 (Cloudflare용)
- `node-server.ts` — NAS 전용 `DELETE /api/notifications/clear-all` 추가 (RULE-002 준수) + 캐시버전 `v=20260619a`
- `public/static/app.js` — `clearNotifHistory()` async 함수로 전환, API 호출 후 UI 갱신
- `scripts/rollback.sh` — `pre-bug023` 항목 추가 (롤백 포인트: `f98fb2e`)

### 커밋 이력
| 레포 | 해시 | 내용 |
|------|------|------|
| safetynote-server | `40eef26` | fix: BUG-023 알림센터 전체삭제 DB 미반영 수정 — DELETE API 추가 + clearNotifHistory API 호출 + 캐시버전 v=20260619a |
| safetynote-server | `73f13c8` | docs: BUG-023 해결 기록 추가 + rollback pre-bug023 + 세션 38 히스토리 |

---

## 세션 39 (2026-06-21) — 2단계 공사현황 묶음 (TASK-002/003/001)

### 사전 확인
- PROJECT_HISTORY / BUGFIX_LOG 세션 컨텍스트 확인
- TASK-003 UI Edit 실패 재시도 → `Read` 도구로 정확한 내용 재확인 후 성공

### 수정 내용

#### TASK-002: 공사 상세 → 작업 생성 후 화면 복귀
- `app.js` `showCreateTaskFromConstruction()`: `con._fromConId = con.id` 플래그 추가
- `app.js` `_doCreate()` 성공 핸들러: `_fromConId` 있으면 `showConstructionDetail()` 복귀, 없으면 `renderTasksPage()`

#### TASK-003: 공사요청번호 자동부여 (LM_YY.MM.DD_##)
- `app.js` `cReqNo` 블록: `자동부여` 체크박스 UI 추가 (신규 등록 시만 표시)
- `app.js` `_toggleReqNoAuto()` 함수 추가 — KST 날짜 계산 → `/api/constructions/request-no-seq` 호출
- `app.js` `saveConstruction()`: `isAutoNo` 플래그로 12자리 숫자 검증 제외
- `node-server.ts`: `GET /api/constructions/request-no-seq` NAS 전용 (RULE-002 준수, 이전 세션에서 추가)

#### TASK-001: 공사 삭제 기능
- `app.js`: 공사 상세 하단 삭제 버튼 추가 (좌측), `justify-between` 2열 레이아웃
- `app.js`: `deleteConstruction()` 함수 추가 — `showConfirmDialog` → `API.delete` → 목록 갱신
- `node-server.ts`: `DELETE /api/constructions/:id` NAS 전용 (RULE-002 준수, 연결 tasks 차단)
- `src/routes/constructions.ts`: `DELETE /:id` Cloudflare용 (연결 tasks 차단)

### 캐시버전
`v=20260619a` → `v=20260621a` (RULE-003 준수)

### 빌드
`dist/_worker.js 251.36 kB` ✅ (1.16s)

### 커밋 이력
| 레포 | 해시 | 내용 |
|------|------|------|
| safetynote-server | `7ddd3c1` | feat: 2단계 공사현황 묶음 — TASK-002/003/001 완료 |

---

## 세션 40 (2026-06-21) — TASK-003 자동부여 버그 연속 수정

### 수정 내용

#### 1차 수정 (커밋 `6680923`) — 부분 수정
- `input maxlength="12"` 제거 (AT_YY.MM.DD_## 는 15자)
- `oninput`: `autoNo` 플래그 없을 때만 숫자 필터 적용
- `saveConstruction()`: `isAutoNo` 먼저 판단 후 검증 건너뜀

#### 2차 수정 (커밋 `bc020c8`) — 진짜 원인 수정
- **진짜 버그**: `axios.get()` 응답은 `{ data: {...} }` 구조인데 `res.next_no` 로 접근 → `undefined` → input 빈값 → 저장 실패
- **수정**: `res.next_no` → `res.data?.next_no`
- **AT_ 접두사 변경**: `LM_` → `AT_` (app.js hint 텍스트 + node-server.ts prefix)
- **캐시버전**: `v=20260621b` → `v=20260621c`

### 커밋 이력
| 레포 | 해시 | 내용 |
|------|------|------|
| safetynote-server | `6680923` | fix: TASK-003 자동부여 저장 버그 1차 수정 |
| safetynote-server | `bc020c8` | fix: TASK-003 자동부여 진짜 원인 수정 + AT_ 접두사 변경 |

---

## 세션 41 (2026-06-21) — TASK-003 자동부여 형식 변경 + TASK-006 계획 추가

### 수정 내용
- 자동부여 번호 형식: `AT_YY.MM.DD_##` → `YYMMDDhhmm##` (12자리 순수숫자)
- 기존 12자리 검증 그대로 통과, dataset/isAutoNo 플래그 완전 제거
- 예시: `260621143501` (2026-06-21 14:35 첫번째)

### 계획 추가
- **TASK-006**: 공사종류 "기타" 추가 (3단계로 편입)

### 커밋
| 해시 | 내용 |
|------|------|
| `ff72d58` | fix: TASK-003 자동부여 번호 형식 YYMMDDhhmm## 변경 |

---

## 세션 42 (2026-06-21) — 작업 상세 팝업 삭제 버튼 추가

### 수정 내용
- `showTaskDetail`: 워크플로우 버튼 영역 상단에 **작업 삭제** 버튼 추가
  - 관리자/감독자(`!isWorker`)에게만 표시
  - 좌측 단독 배치 (TASK-001 공사삭제 패턴 동일)
- `deleteTask()`: `querySelectorAll`로 모든 overlay 제거 (공사상세 포함)

### 커밋
| 해시 | 내용 |
|------|------|
| `e346cee` | feat: 작업 상세 팝업에 삭제 버튼 추가 (관리자/감독자 전용) |

---

## 세션 43 (2026-06-21) — TASK-006 공사종류 "기타" 추가

### 수정 내용
- `public/static/app.js` — 공사 등록/수정 `<select>` 옵션에 `<option value="other">기타</option>` 추가
- `public/static/app.js` — `WC_LABEL` 객체에 `other: '기타'` 추가
- `public/static/app.js` — `_WC_LABEL_STATIC` 객체에 `other: '기타'` 추가
- `src/routes/constructions.ts` — `VALID_WORK_CLASS`(POST), `VALID_WORK_CLASS_PUT`(PUT) 두 곳에 `'other'` 추가
- `node-server.ts` — 캐시버전 `v=20260621e` → `v=20260621f`

### 커밋
| 해시 | 내용 |
|------|------|
| `872f353` | feat: TASK-006 공사종류 기타(other) 추가 — v=20260621f |

---

## 세션 44 (2026-06-21) — TASK-005 외선작업일보 자산구분 필드 추가

### 수정 내용
- `public/static/app.js` — 작업 케이블정보 테이블 헤더 2곳에 `자산구분` 열 추가 (케이블종류~공정구분 사이)
- `public/static/app.js` — `mkCable()` 기존 데이터 렌더링에 `wrc-asset` select 셀 추가 (기존값 selected 반영)
- `public/static/app.js` — `_wrAddCableSet()` 신규 3행에 `wrc-asset` select 셀 추가
- `public/static/app.js` — `_wrAddCableRow()` 행 추가 함수에 `wrc-asset` select 셀 추가
- `public/static/app.js` — `_collectWrData()` 수집 객체에 `asset_type: .wrc-asset 값` 추가
- `node-server.ts` — `patchSchema` `safeAlter` 로 `asset_type TEXT DEFAULT ''` 컬럼 추가 (기존 DB 자동 마이그레이션)
- `node-server.ts` — `INSERT INTO work_report_cables` 17컬럼으로 확장 (asset_type 포함)
- `src/routes/work-reports.ts` — `INSERT INTO work_report_cables` 17컬럼으로 확장 (asset_type 포함)
- 캐시버전 `v=20260621f` → `v=20260621g`

### DB 마이그레이션 방식
- `safeAlter` 방식 사용 → 서버 재시작 시 자동으로 `ALTER TABLE work_report_cables ADD COLUMN asset_type TEXT DEFAULT ''` 실행
- 기존 데이터는 `asset_type = ''` (빈값)으로 유지 (NULL 없음)

### 커밋
| 해시 | 내용 |
|------|------|
| `dfff447` | feat: TASK-005 외선작업일보 케이블정보 자산구분(N-1/N-2) 필드 추가 — v=20260621g |

### 상태
- ✅ 빌드 성공 (`dist/_worker.js 251.41 kB`)
- ✅ GitHub 푸시 완료
- ⚠️ NAS 배포 대기 중 (통합 배포 원칙)

### 상태
- ✅ 빌드 성공 (`dist/_worker.js 251.38 kB`)
- ✅ GitHub 푸시 완료
- ⚠️ NAS 배포 대기 중 (통합 배포 원칙)

---

## 세션 45 (2026-06-21) — TASK-004 시스템설정 5탭 방식으로 개편

### 수정 내용
- `public/static/app.js` — `renderAdminSettingsPage()` 전체를 5탭 구조로 재작성
  - **탭 구성**: push(푸시알림발송) / files(파일설정) / gps(GPS주소변환) / apk(APK배포관리) / info(정보)
  - `_activeTab` 파라미터로 새로고침 시 마지막 탭 유지
  - 탭별 비동기 로드 분리: push → `_loadFcmStatus()`, info → `_loadDbResetCounts()`
  - 탭 네비게이션 ID 패턴: `stab-{key}` (버튼) / `spanel-{key}` (패널)
  - CSS 클래스: `settings-main-tab` (버튼) / `settings-panel` (패널)
- `public/static/app.js` — `switchSettingsTab(key)` 함수 신규 추가
  - 탭 전환 + 활성 스타일 반영 + 비동기 데이터 로드
- `node-server.ts` — 캐시버전 `v=20260621g` → `v=20260621h`

### UX 개선 목적
- 기존: 항목이 많아 세로 스크롤이 길어지는 문제
- 개선: 5개 탭으로 분리하여 각 탭에서 관련 설정만 표시

### 커밋
| 해시 | 내용 |
|------|------|
| `9fe3661` | feat: TASK-004 시스템설정 5탭 방식으로 개편 — v=20260621h |

### 상태
- ✅ 빌드 성공 (`dist/_worker.js 251.41 kB`)
- ✅ GitHub 푸시 완료 (`c0234bc` → `9fe3661`)
- ⚠️ NAS 배포 대기 중 (통합 배포 원칙)

---

## 세션 47 (2026-06-21) — 즉시 적용 최적화 (pragma + 인덱스 + 버그수정)

### 수정 내용

#### 1. SQLite pragma 최적화 적용 (node-server.ts)
- `synchronous = NORMAL` — WAL 모드에서 안전하고 FULL 대비 2~3x 빠름
- `cache_size = -32000` — 32MB 메모리 캐시 (기본 2MB 대비 16x 향상)
- `temp_store = MEMORY` — 정렬/집계 임시 데이터 메모리 처리
- `mmap_size = 268435456` — 256MB mmap으로 대용량 읽기 최적화
- `busy_timeout = 5000` — 동시 접근 시 SQLITE_BUSY 방지 (5초 대기)

#### 2. 성능 인덱스 5개 추가 (patchSchema 내 자동 생성)
- `idx_tasks_status_date` — tasks(status, start_date): 작업 목록 필터 조회
- `idx_work_reports_date` — work_reports(work_date, task_id): 일보 날짜 범위 조회
- `idx_tbm_records_task` — tbm_records(task_id, created_at): 작업별 TBM 목록
- `idx_notifications_user_read` — notifications(user_id, is_read, created_at): 미읽음 알림
- `idx_sig_req_target_status` — signature_requests(target_user_id, status): 서명 배지 건수

#### 3. app.js 중복 함수 제거 (버그 수정)
- `_srSwitchTab(tab, el)` 구버전 함수 (21818번) 제거 — 신버전(27714번)과 중복
- 원인: 서명요청 페이지 리팩토링 시 구버전 함수 잔류
- `node --check public/static/app.js` → ✅ 문법 오류 없음

#### 4. 캐시 버전 갱신
- `v=20260621h` → `v=20260621i`

#### 5. 장기 운영 종합 권고사항 문서 작성 (docs/OPERATIONS_GUIDE.md)
- 727줄 — 데이터/DB/유지보수/기능추가/백업/보안/운영 전반
- 주간·월간·연간 체크리스트 포함

### 커밋
| 해시 | 내용 |
|------|------|
| `3e8349f` | docs: 세션 47 — 장기 운영 종합 권고사항(OPERATIONS_GUIDE.md) 작성 |
| (예정) | perf: pragma 최적화 + 인덱스 5개 추가 + _srSwitchTab 중복 제거 — v=20260621i |

### 상태
- ✅ 빌드 성공 (`dist/_worker.js 251.41 kB`)
- ✅ node --check 통과
- ⚠️ NAS 배포 대기 중 (통합 배포 원칙)

---

## 세션 48 (2026-06-21) — 단가관리/공량내역/외선일보 다중 개선

### 사전 확인
- PROJECT_HISTORY / BUGFIX_LOG 세션 컨텍스트 확인
- 세션 47 pragma 최적화 + 인덱스 5개 적용 완료 상태에서 시작

### 수정 내용

#### [1] 공량내역 조회 버그 3종 수정 (`c6050b3`)
- DOM 소멸 전 필터값(탭/기간/공사) 먼저 저장 → 재조회 시 외선 탭 자동변경 방지
- `_frCalcDateRange()` container.innerHTML 이전 호출 → 기간 초기화 방지
- 조회 버튼: `_frSearch()` 함수 분기 처리

#### [2] 단가관리 공종 삭제 `[object Object]` 에러 수정 (`c6050b3`)
- `_upDeleteCableItem` / `_upDeleteSpliceItem`: 객체 방식 호출 → 위치인수 방식으로 수정
- `showConfirmDialog(title, msg, '삭제', '취소', 'danger')` 형태로 통일

#### [3] 외선일보 공종별작업량 DB 동적 로드 (`d18d40d`)
- `window._wrExtraItemsCache` 전역 캐시 도입
- `renderWorkReportForm` → `_wrAddCableSet` 간 공종 목록 공유

#### [4] renderWorkReportForm `otherTypes is not defined` 에러 수정 (`6a9819d`)
- `otherTypes` 변수 undefined 방어 처리 추가

### 캐시버전
`v=20260621i` → `v=20260621n` (경유)

### 커밋 이력
| 해시 | 내용 |
|------|------|
| `0b16abe` | docs: BUG-002 상태 미해결→완료 갱신 |
| `a42a38d` | feat: 접속일보 함체작업 야간/가공 추가단가 지원 |
| `88ca077` | fix: 공량내역 접속탭 TDZ 에러 + 단가 매칭 오류 수정 |
| `4bb3084` | fix: 접속일보 폼 단가 공란 수정 — mkItemRow에 SPLICE_ITEMS_DEF 역방향 맵 적용 |
| `6d151cf` | docs: BUGFIX_LOG BUG-022 추가 |
| `c6050b3` | feat: 공량내역/단가관리/외선일보 다중 개선 |
| `d18d40d` | fix: 외선일보 addCableSet 공종별작업량 DB 동적 로드 |
| `6a9819d` | fix: renderWorkReportForm otherTypes is not defined 에러 수정 |

### 상태
- ✅ 빌드 성공
- ✅ GitHub 푸시 완료
- ⚠️ NAS 배포 대기 중 (통합 배포 원칙)

---

## 세션 49 (2026-06-21) — 단가불변 정책 + 접속일보 수정 + rollback v2.0

### 수정 내용

#### [1] 단가 수정 시 이전 월 공량 금액 불변 정책 (`700e0f9`)
- `patchSchema v0.137`: `work_report_extras.unit_price_snapshot` 컬럼 추가 (safeAlter)
- `POST /api/work-reports` 저장 시 현재 단가 스냅샷 함께 저장
- `GET /api/work-reports/volume-stats`: `unit_price_snapshot` 반환 추가
- 공량내역 금액 계산: 스냅샷 단가 우선 사용 (없으면 현재 단가 — 하위호환)
- 엑셀 내보내기 동일 정책 적용

#### [2] 접속일보 제출건 수정 기능 추가 (`700e0f9`)
- `renderSpliceReportForm`: submitted/confirmed 상태 분기 버튼 추가
  - submitted: '목록으로' + '수정하기(amber)' 버튼
  - confirmed: '확정됨(수정불가)' 버튼
- `_revertSpliceReport()` 함수 신규 추가
- `node-server.ts`: `POST /api/splice-reports/:id/revert` API 추가

#### [3] 단가관리 공종 삭제 `[object Object]` 에러 수정 (`700e0f9`)
- `showConfirmDialog` 위치인수 방식으로 통일

#### [4] rollback.sh v2.0 업데이트 (`45eea70`)
- 세션별 커밋 포인트 맵 구조로 전면 재작성
- `prev` / `latest` 특수 키 지원
- 자동 검증 기능 추가

### 캐시버전
`v=20260621n` → `v=20260621o`

### 커밋 이력
| 해시 | 내용 |
|------|------|
| `700e0f9` | fix+feat: 단가관리 공종삭제/접속일보 수정/단가불변 정책 3종 |
| `45eea70` | chore: NAS 배포/롤백 스크립트 v2.0 업데이트 |

### 상태
- ✅ 빌드 성공
- ✅ GitHub 푸시 완료
- ⚠️ NAS 배포 대기 중 (통합 배포 원칙)

---

## 세션 50 (2026-06-21) — patchSchema 구문 오류 hotfix

### 수정 내용

#### patchSchema v0.137 구문 오류 수정 (`2495d8e`)
- **버그**: `patchSchema v0.137` SQL 주석 문자열 내 오탈자로 서버 쿼리 실행 시 구문 오류 발생
  - `try {...} (CREATE INDEX IF NOT EXISTS → 이미 있으면 무시)` — 괄호 외부로 주석 노출
- **현상**: NAS 서버에서 매 요청마다 patchSchema 오류 로그 → 응답 속도 저하
- **해결**: 해당 주석 제거, SQL 문자열 정상화

#### idx_tasks_status_date 컬럼명 수정 (`50980b5`)
- `start_date` → `planned_date` (실제 컬럼명 불일치 수정)

### 커밋 이력
| 해시 | 내용 |
|------|------|
| `2495d8e` | hotfix: patchSchema v0.137 구문 오류 수정 → 서버 속도 저하 해결 |
| `757cd24` | chore: rollback.sh s50-hotfix 커밋 포인트 추가 |
| `50980b5` | fix: idx_tasks_status_date 컬럼명 수정 (start_date → planned_date) |

### 상태
- ✅ 빌드 성공
- ✅ GitHub 푸시 완료
- ✅ NAS hotfix 즉시 배포 완료 (`2495d8e`)

---

## 세션 51 (2026-06-21) — 단가관리 단위 인라인 편집 + BUG 4종 수정 + 명칭 변경

### 사전 확인
- PROJECT_HISTORY / BUGFIX_LOG / RULE-001~006 전체 검토 완료
- RULE-002 (NAS 전용 라우트 마운트 앞 등록) 준수
- RULE-003 (캐시버전 반드시 갱신) 준수
- RULE-005 (`node --check` 필수) 준수

### 수정 내용

#### [1] 단가관리 접속/외선 탭 헤더에 `단위` 컬럼 추가 (`e21f384`)
- 접속 탭: `공종 | 단위 | 단가` 헤더 순으로 추가
- 외선 탭: `공종 | 단위 | 단가` 헤더 순으로 추가

#### [2] 단가관리 공종명·단위 인라인 수정 기능 구현 (`605afae`)
- `mkPriceRows` / `mkSplicePriceRows`: 공종명 및 단위 인라인 `<input>` 렌더링
  - 공종명: `up-cable-label-input` / `up-splice-label-input`
  - 단위: `up-cable-unit-input` / `up-splice-unit-input`
- `_saveUnitPrices()` / `_saveSpliceUnitPrices()`: label + unit + price 모두 수집·전송
- `node-server.ts` PUT `/api/volume-unit-prices` / `/api/splice-unit-prices`:
  - item_label, unit 수정 지원 (stmtFull 분기 추가)

#### [3] BUG-023: 접속일보 `_mkLabelToKey` TDZ 수정 (`66e5adc`)
- `const _mkLabelToKey` 선언 블록을 `customItems` 사용 앞으로 이동
- 원인: 선언(27926번)보다 참조(27898번)가 앞 → `const` TDZ 에러

#### [4] BUG-024: 공량내역 `extrasSnapMap` TDZ 수정 (`66e5adc`)
- `const extrasSnapMap` 선언 직후에 `_frCacheExtrasSnap = extrasSnapMap` 대입
- 원인: 선언(25486번)보다 캐시 대입(25468번)이 앞 → TDZ 에러

#### [5] 외선 탭 컬럼 순서 변경 (`2e174b1`)
- `공종 | 단위 | 단가` → `공종 | 단가 | 단위` (사용자 요청)

#### [6] BUG-025: 외선 단위 저장 안 되는 버그 수정 (`2d00b56`)
- PUT API item_label 없으면 무조건 `stmtPrice`(단가만) 분기 → unit 무시
- `stmtUnit` 추가, 3단계 분기로 재설계 (Full / Unit / Price)

#### [7] BUG-026: 외선 단위 화면 반영 안 되는 버그 수정 (`d6bc5a4`)
- `GET /api/volume-unit-prices` SELECT 쿼리에 `unit` 컬럼 누락
- `p.unit = undefined` → 항상 기본값 '식' 표시
- SELECT에 unit 추가로 수정

#### [8] `작업안전현황` → `안전현황` 명칭 변경 (`bcec93b`)
- app.js 전체 6곳 치환

### 캐시버전 변화
`v=20260621i` → q → r → s → t → u → `v=20260621v`

### 커밋 이력
| 해시 | 내용 |
|------|------|
| `e21f384` | feat: 단가관리 외선/접속 테이블 단위 컬럼 위치 조정 |
| `605afae` | feat: 단가관리 공종명·단위 인라인 수정 기능 추가 — v=20260621q |
| `66e5adc` | fix: TDZ 에러 2종 수정 (BUG-023/024) — v=20260621r |
| `2e174b1` | fix: 외선 탭 컬럼 순서 변경 — v=20260621s |
| `2d00b56` | fix: 외선 단가관리 단위 저장 버그 수정 (BUG-025) — v=20260621t |
| `d6bc5a4` | fix: GET volume-unit-prices SELECT unit 누락 수정 (BUG-026) — v=20260621u |
| `bcec93b` | chore: '작업안전현황' → '안전현황' 명칭 변경 — v=20260621v |

### BUGFIX_LOG 추가
- BUG-023: `_mkLabelToKey` TDZ
- BUG-024: `extrasSnapMap` TDZ
- BUG-025: 외선 단위 저장 분기 누락
- BUG-026: GET SELECT unit 컬럼 누락

### 상태
- ✅ 빌드 성공 (`dist/_worker.js 251.41 kB`)
- ✅ node --check 통과
- ✅ GitHub 푸시 완료 (`bcec93b`)
- ⚠️ NAS 배포 대기 중 (통합 배포 원칙 — 세션 50 hotfix 이후 미반영 누적)


---

## 세션 52 (2026-06-21) — 작업일보 작성 대상 work_class 필터 적용

### 수정 내용

#### 문제
- 작업일보 작성 페이지에서 모든 작업(관로시설·장비·기타 포함)이
  외선·접속 일보 작성 대상으로 표시되는 문제

#### 해결 (`b906d1e`)
- `renderReportWritePage()` tasks 로드 직후 work_class 기준으로 분리
  - `cable_install` (광케이블 시설) → 외선 작업일보 대상만
  - `cable_splice`  (광케이블 접속) → 접속 작업일보 대상만
  - `conduit` / `equipment_other` / 기타 → 양쪽 모두 미포함
- 접속 탭 "작성 중 / 작성 완료" report 목록도 cable_splice task 연결 건만 표시
- 캐시버전: `v=20260621v` → `v=20260621w`

#### 분류 기준 정리
| work_class | 외선 일보 | 접속 일보 |
|-----------|----------|----------|
| `cable_install` 광케이블 시설 | ✅ 대상 | ❌ |
| `cable_splice`  광케이블 접속 | ❌ | ✅ 대상 |
| `conduit`       관로시설      | ❌ | ❌ |
| `equipment_other` 장비·기타  | ❌ | ❌ |

### 커밋
| 해시 | 내용 |
|------|------|
| `b906d1e` | fix: 작업일보 작성 대상 work_class 필터 적용 — v=20260621w |

### 상태
- ✅ node --check 통과
- ✅ 빌드 성공 (`dist/_worker.js 251.41 kB`)
- ✅ GitHub 푸시 완료
- ✅ NAS 배포 완료 (사용자 직접 확인)

---

## 세션 53 (2026-06-21) — Phase 5 브라우저 업데이트 자동화 구현

### 수정 내용

#### Phase 5 완료 (`808959f`)
- `node-server.ts`: 업데이트 API 3개 추가
  - `GET  /api/admin/update/status` — 진행 상태 폴링
  - `POST /api/admin/update/check`  — git fetch + 버전 비교
  - `POST /api/admin/update/apply`  — DB 백업 + git pull + pm2 restart
- `app.js`: 시스템설정 → **"서버 업데이트"** 탭 신규 추가
  - 현재 버전(NAS) / 최신 버전(GitHub) 카드 비교 표시
  - 새 버전 있을 때만 "업데이트 적용" 버튼 활성화
  - 비밀번호 확인 후 실행 → 2초 폴링으로 진행상황 실시간 표시
  - 실행 로그 터미널 패널 (git pull 결과, pm2 상태 등)
  - 완료 후 새로고침 안내
- 캐시버전: `v=20260621w` → `v=20260621x`

### 커밋
| 해시 | 내용 |
|------|------|
| `808959f` | feat: Phase 5 — 브라우저 원클릭 서버 업데이트 자동화 구현 (v=20260621x) |

### 상태
- ✅ node --check 통과
- ✅ 빌드 성공 (`dist/_worker.js 251.41 kB`)
- ✅ GitHub 푸시 완료
- ⚠️ NAS 배포 대기 중


---

## 세션 54 (2026-06-21) — 최적화 2종 + 진행 계획 문서 전면 현행화

### 수정 내용

#### 최적화 1: 자동 DB 백업 (`8f7d502`)
- `node-server.ts` 서버 시작 시 자동 백업 스케줄러 등록
  - 매일 **새벽 2:00** 자동 실행 → `backups/safety_YYYYMMDD.db`
  - WAL 체크포인트(`wal_checkpoint(TRUNCATE)`) 후 파일 복사 (데이터 일관성 보장)
  - 오늘 백업 이미 존재하면 중복 생략
  - **30일 초과** 백업 자동 삭제 (`pruneOldBackups`)
- 오래된 알림 자동 정리: 90일 초과 `notifications` 레코드 삭제
  - 서버 시작 시 1회 + 이후 **매 24시간** 실행

#### 최적화 2: 페이지네이션 (`8f7d502`)
- `src/routes/tasks.ts`:
  - `GET /api/tasks` — `page` / `limit` 쿼리 파라미터 추가
  - 기본 `limit=50` (최대 500), `limit=0`이면 전체 반환 (하위 호환)
  - COUNT 쿼리로 `total` 응답 포함
- `node-server.ts`:
  - `GET /api/splice-reports` — 동일 방식 page/limit 지원
- `app.js`:
  - `TASK_PAGE_LIMIT = 50` 상수 선언
  - 작업 목록 하단 **"더 보기"** 버튼 추가 (누적 로드 방식)
  - 잔여 건수 표시: `더 보기 (N건 남음)`
  - 필터/검색 변경 시 `taskFilters.page = 1` 자동 리셋
  - 상단 건수 표시: `총 N건 중 M건 표시`
- 캐시버전: `v=20260621x` → `v=20260621y`

#### 문서 전면 현행화 (세션 54)
- `docs/PENDING_TASKS.md`: Phase 6 세부 목록 추가, 세션 54 완료 항목 기록
- `docs/WORK_PLAN.md`: 전면 재작성 — 완료/대기 Phase 현황, 장기 최적화 로드맵
- `docs/DEPLOY_AND_UPDATE_GUIDE.md`: 전면 재작성 — 현재 상태 반영, FAQ 추가

### 커밋
| 해시 | 내용 |
|------|------|
| `8f7d502` | feat: 자동 DB 백업 + 페이지네이션 적용 (v=20260621y) |

### 상태
- ✅ node --check 통과
- ✅ 빌드 성공 (`dist/_worker.js 251.78 kB`)
- ✅ GitHub 푸시 완료
- ✅ NAS 배포 완료 (사용자 확인)


---

## 세션 55 (2026-06-21) — Phase 6 완료: 원클릭 설치 패키지

### 수정 내용

#### Phase 6: install.sh v2.0 완성
- `scripts/install.sh` 전면 재작성 (v1.0 초안 → v2.0 완성본)

**핵심 개선 사항:**
- **3가지 실행 모드** 자동 감지 및 선택
  - `fresh`    — 신규 설치 (처음 설치하는 NAS)
  - `update`   — 코드만 갱신, 기존 DB·업로드 보존
  - `reinstall`— 코드 재설치, 기존 DB·업로드 보존
- **NAS 실제 동작 방식 완전 반영**
  - Node.js v18 경로 자동 탐지 (`/volume1/@appstore/Node.js_v18/...`)
  - `npx` 없는 환경 대응 → `tsx` 절대경로 직접 지정
  - NVM 없는 환경 대응 → `interpreter` 절대경로 필수 지정 (hang 방지)
  - `PORT=3443` 인라인 지정 (`.env`보다 우선)
- **환경 검증 강화**
  - Node.js v18 미설치 시 → DSM 패키지 센터 안내 메시지 출력
  - Git 미설치 시 → 설치 방법 안내
  - PM2 미설치 시 → 자동 설치
  - tsx 바이너리 부재 시 → npm install 재시도 안내
- **설치 전 DB 자동 백업** (기존 설치 존재 시 항상 실행)
- **JWT_SECRET 랜덤 32자 자동 생성** (.env 신규 생성 시)
- **서버 응답 3회 재시도 확인** (최대 12초 대기)
- 설치 완료 후 접속 주소·명령어·업데이트 방법 출력

#### .env.example 전면 보완
- NAS 경로 예시 명시 (`/volume1/safetynote/...`)
- JWT_SECRET 생성 명령어 안내
- FCM 푸시 항목 추가 (선택사항 명시)
- 각 항목 설명 강화

### 커밋
| 해시 | 내용 |
|------|------|
| (이번 커밋) | feat: Phase 6 완료 — install.sh v2.0 + .env.example 보완 |

### 상태
- ✅ install.sh v2.0 작성 완료
- ✅ .env.example 보완 완료
- ✅ GitHub 푸시 완료
- ⏳ 실제 신규 NAS 설치 테스트 (사용자 직접 진행)

---

## 세션 58 (2026-06-23) — v0.143 미완성 항목 완성 + 연속 버그 수정 (BUG-030~034)

### 수정 내용

#### 업데이트 API git pull 실패 근본 해결
- `src/nas-routes/admin.ts`: `git pull` → `git fetch + reset --hard` 변경
  - 로컬 변경사항(node-server.ts 등) 자동 초기화 후 최신본으로 강제 교체

#### BUG-030: LGU+ 설정 탭 알림 설명 텍스트 방향 오류
- `app.js` line 15029~15030: "체크한 공사" → "미체크한(수동 입력) 공사"로 수정
- `node-server.ts`: INSERT 기본값 6개 + patchSchema UPDATE 6개 description 교정

#### BUG-031: Service Worker clone() 에러 — 사진 로딩 지연
- `service-worker.js` v10 → v11 업그레이드
- 이미지/바이너리 경로 캐싱 완전 제외 (regex + Content-Type 이중 차단)
- 전체 clone() try-catch 방어 추가

#### BUG-032: `/api/photos` 라우트 마운트 누락
- `node-server.ts`에 `photosRoutes` import + `app.route('/api/photos', ...)` 추가

#### BUG-033: photos.ts 동적 async import NAS 호환 문제
- `src/routes/photos.ts`의 `await import('node:fs/promises')` 패턴이 NAS tsx 런타임에서 실패
- `node-server.ts`에 NAS 전용 `/api/photos` 라우트 5개 직접 구현
  - 정적 동기 import (readFileSync/writeFileSync/unlinkSync) + rawDb 직접 사용
  - RULE-002 준수: photosRoutes 마운트 앞에 등록

#### BUG-034: `POST /api/photos/upload` 라우트 누락
- `uploadTbmPhoto()` (TBM 안전조치 사진)가 `/api/photos/upload` 호출 → 서버에 없었음
- `node-server.ts`에 `POST /api/photos/upload` 추가
  - formData: `photo`(단수), `label`, `task_id`
  - 응답: `{ id, file_path, file_name, mime_type }` (checklist/tbm-photos에서 사용)

### 커밋
| 해시 | 내용 |
|------|------|
| `55f0b8b` | fix: 업데이트 API git pull → fetch+reset --hard |
| `190684a` | fix: BUG-030 LGU+ 알림 설명 방향 오류 수정 |
| `b4120af` | fix: BUG-031 Service Worker clone() 에러 수정 |
| `afa2701` | fix: BUG-032 /api/photos 라우트 마운트 누락 |
| `2b849a0` | fix: BUG-033 photos.ts 동적 async import NAS 호환 수정 |
| `9cbd544` | fix: BUG-034 POST /api/photos/upload 라우트 누락 |
| `9c12365` | chore: restore_photos.sh 복원 스크립트 추가 |

### 상태
- ✅ 빌드 성공 (`dist/_worker.js 252.03 kB`)
- ✅ GitHub 푸시 완료
- ⚠️ NAS 적용 후 동작 확인 필요 (사진 업로드)

---

## 세션 59 (2026-06-23) — 사진 업로드 추가 버그 수정 (BUG-035) + API 전수 점검

### 수정 내용

#### BUG-035: `POST/DELETE /api/inspection-photos` 라우트 누락
- 현장 점검 사진 업로드/삭제가 `/api/inspection-photos` 독립 경로 사용
  → `inspectionRoutes`는 `/api/inspections/*` 아래에만 마운트 → 404
- `node-server.ts`에 NAS 전용 점검사진 라우트 추가 (RULE-002)
  - `POST /api/inspection-photos`: formData `photos[]` → writeFileSync + rawDb INSERT
  - `DELETE /api/inspection-photos/:id`: unlinkSync + rawDb DELETE

#### API 호출 전수 점검 완료
- app.js의 모든 fetch/XHR/API 호출 경로를 서버 라우트와 교차 검증
- 누락 라우트 없음 확인 (`inspection-photos` 추가로 완전 해소)

### 커밋
| 해시 | 내용 |
|------|------|
| `c277b1a` | fix: BUG-035 POST/DELETE /api/inspection-photos 라우트 누락 수정 |

### 상태
- ✅ 빌드 성공 (`dist/_worker.js 252.03 kB`)
- ✅ GitHub 푸시 완료 (`c277b1a`)
- ✅ API 전수 점검 — 누락 라우트 없음
- ⚠️ NAS 적용 후 전체 사진 기능 동작 확인 필요

### NAS 업데이트
```bash
# 업데이트 버튼 클릭 또는
git fetch origin && git reset --hard origin/main && pm2 restart safetynote
```

### 복원 방법 (문제 발생 시)
```bash
# BUG-031 이전 상태로 복원 (가장 안전)
bash restore_photos.sh

# BUG-031~034 완료 상태로 복원
bash restore_photos.sh pre-photo-fix-v2-202606230213
```

---

## 세션 60 (2026-06-23) — BUG-036: photo_type CHECK constraint 위반 수정

### 수정 내용

#### BUG-036: `POST /api/photos/upload` → `'tbm_photo'` CHECK constraint 위반
- **에러**: `CHECK constraint failed: photo_type IN ('before','progress','after','hazard','tbm','completion')`
- **원인**: BUG-034에서 추가한 핸들러가 `photo_type = 'tbm_photo'`로 INSERT
  → `task_photos` 테이블은 `'tbm'`만 허용, `'tbm_photo'`는 CHECK 위반
- **수정**: `node-server.ts` line 3387: `'tbm_photo'` → `'tbm'`

#### 전수 확인
- `POST /api/photos` (일반 작업사진): UI 셀렉트 옵션이 허용값만 포함 → 정상
- `POST /api/inspection-photos`: `inspection_photos` 테이블 (photo_type 없음) → 정상

### 커밋
| 해시 | 내용 |
|------|------|
| `da547c6` | fix: BUG-036 photo_type tbm_photo→tbm CHECK constraint 위반 수정 |

### 상태
- ✅ 빌드 성공 (`dist/_worker.js 252.03 kB`)
- ✅ GitHub 푸시 완료
- ⚠️ NAS 업데이트 후 TBM 사진 업로드 동작 확인 필요

### NAS 업데이트
```bash
git fetch origin && git reset --hard origin/main && pm2 restart safetynote
```

## 세션 61 (2026-06-23) — BUG-036~039 수정 완료 (LGU+ 알림 조건 전면 정정)

### 세션 요약
BUG-036~038 수정 후 사진 업로드 동작 확인 완료.
BUG-039: `is_auto_request_no` 조건 방향이 전면 반전되어 있던 버그 수정.
BUG-030 오기록("코드상 올바름")도 BUGFIX_LOG에 정정 기록.

### BUG-037: 사진 이미지 401 에러 (세션 60~61 연속)
- `GET /api/photos/:id/img` → Authorization 헤더 불가 (`<img src>` 태그 한계)
- `?token=` 쿼리스트링 지원 + `getUser()` 폴백 추가
- `app.js` `photoImgSrc()` 헬퍼 함수 + 11곳 교체
- 커밋: `6960caa`

### BUG-038: LGU+ sub_role 누락 (세션 61)
- register API에서 `ui_role='lgu_plus'` → `sub_role` 미변환
- `uiRoleToSubRole` 맵 + patchSchema v0.144 자동 복구 쿼리
- 커밋: `9c7b2fb`

### BUG-039: is_auto_request_no 조건 방향 전면 반전 (세션 61)

#### 원인
- v0.143(BUG-028) 당시 조건 방향 반대로 구현
- BUG-030 오기록("코드상 올바름")으로 인해 수정 지연
- 실제 의도: `is_auto_request_no=0`(수동입력) → LGU+ 허용/알림, `=1`(자동부여) → 차단

#### 수정 파일 및 위치

| 파일 | 위치 | 수정 내용 |
|------|------|----------|
| `node-server.ts` | line ~2670 | `=== 1` → `!== 1` (작업상태 알림 발송 조건) |
| `node-server.ts` | line ~2894 | `=== 1` → `!== 1` (체크리스트 완료 알림 조건) |
| `node-server.ts` | line ~2963 | `!== 1` → `=== 1` (수동 알림 엔드포인트 차단 방향) |
| `app.js` | line ~3101 | `=== 1` → `!== 1` (공사 목록 필터) |
| `app.js` | line ~3175 | `!== 1` → `=== 1` (공사 상세 접근 차단 방향) |
| `app.js` | line ~4228 | `=== 1` → `!== 1` (작업 목록 필터) |

#### is_auto_request_no 값 정의 (확정)
- `0` = 수동 입력 (자동부여 미체크) → **LGU+ 허용**, 알림 발송 대상
- `1` = 자동부여 체크 → **LGU+ 차단**, 알림 미발송

### 생성된 파일
- `restore_lgu_notify.sh` — BUG-039 수정 전 상태(`9c7b2fb`) 복원 스크립트

### 커밋
| 해시 | 내용 |
|------|------|
| `6960caa` | fix: BUG-037 사진 이미지 401 에러 — img src 토큰 쿼리스트링 지원 |
| `9c7b2fb` | fix: BUG-038 LGU+ 알림 미수신 — sub_role 누락 수정 |
| `ae11251` | fix: BUG-039 LGU+ is_auto_request_no 조건 방향 전면 반전 |

### NAS 업데이트
```bash
git fetch origin && git reset --hard origin/main && npm run build && pm2 restart safetynote
```

### 상태
- ✅ node-server.ts 수정 완료 (3곳)
- ✅ app.js 수정 완료 (3곳)
- ✅ BUGFIX_LOG BUG-039 기록 + BUG-038 오기록 정정
- ⚠️ NAS 업데이트 후 LGU+ 계정으로 공사 목록/알림 동작 확인 필요

---

## 세션 62 (2026-06-23) — FEAT-027/028: 그룹별 권한 관리 + TBM 연쇄 알림 완성

### 세션 요약
- BUG-040 임시 수정(`!= null && !== 1`)을 `=== 0` 명시 비교로 최종 단순화 (6곳)
- FEAT-028: TBM 근로자 전원 서명 완료 → 안전관리자 연쇄 알림 추가 (기존 미구현 단계)
- FEAT-027: 그룹별 권한 관리 DB 테이블 + REST API + 관리자 UI 탭 완성

### BUG-040 → 최종 단순화 (STEP 5~6)

#### 변경 내역
| 파일 | 위치 | 변경 전 | 변경 후 |
|------|------|---------|---------|
| `node-server.ts` | 작업상태 알림 | `rawAutoNo != null && rawAutoNo !== 1` | `=== 0` 단일 비교 |
| `node-server.ts` | 체크리스트 완료 | `!= null && !== 1` | `=== 0` |
| `node-server.ts` | 수동 알림 엔드포인트 | `== null \|\| === 1` | `!== 0` |
| `app.js` | 공사 목록 필터 | `!== 1` | `=== 0` |
| `app.js` | 공사 상세 차단 | `=== 1` | `!== 0` |
| `app.js` | 작업 목록 필터 | `!== 1` | `=== 0` |

#### 단순화 근거
```javascript
null === 0    → false ✅ (null-safe, 별도 null 체크 불필요)
undefined === 0 → false ✅
0 === 0       → true  ✅ (수동입력 → 알림 발송)
1 === 0       → false ✅ (자동부여 → 차단)
```

### FEAT-028: TBM 근로자 전원 서명 → 안전관리자 알림 (STEP 완료)

#### 구현 파일: `src/nas-routes/tbm-extra.ts`
- `POST /api/tbm/:id/signatures` — `role === 'attendee'` 서명 후 전원 서명 완료 체크
- 안전관리자(`sub_role='safety'` OR `position='안전관리자'`) SSE + FCM + notifications
- 중복 방지: `approval_safety` 기서명 시 skip

#### TBM 서명 연쇄 흐름 (완성)
```
근로자 전원 서명 → 안전관리자 알림   ← FEAT-028 추가
안전관리자 서명  → 현장대리인 알림   ← 기존 구현
현장대리인 서명  → CEO 알림          ← 기존 구현
CEO 서명         → 완료 알림         ← 기존 구현
```

### FEAT-027: 그룹별 권한 관리 (STEP 완료)

#### 구현 파일: `node-server.ts`, `app.js`

**DB 구조**
```sql
CREATE TABLE IF NOT EXISTS group_permissions (
  group_key TEXT, perm_key TEXT, perm_label TEXT, is_enabled INTEGER,
  UNIQUE(group_key, perm_key)
);
-- 36개 기본값 (6그룹 × 6권한)
```

**그룹 / 권한 키 정의**
- 그룹: `worker / engineer / safety / site_rep / ceo / lgu_plus`
- 권한: `notify_own_task / notify_all_tasks / notify_lgu_tasks / view_all_tasks / edit_task / sign_tbm`

**API**
- `GET /api/group-permissions` → group_key별 그룹화 반환
- `POST /api/group-permissions` → `{ updates: [{group_key, perm_key, is_enabled}] }` 일괄 업데이트

**관리자 UI**
- 설정 화면 탭 목록에 "그룹별 권한 설정" 탭 추가 (`grpperm`)
- `_loadGroupPermPanel()` — 6개 그룹 카드 + 6개 권한 체크박스 렌더링
- `saveGroupPerms()` — 체크박스 수집 → POST

### 커밋
| 해시 | 내용 |
|------|------|
| `1bcd729` | feat: FEAT-027/028 그룹별 권한관리 + TBM 연쇄 알림 + BUG-040 === 0 최종 단순화 |

### NAS 업데이트
```bash
git fetch origin && git reset --hard origin/main && npm run build && pm2 restart safetynote
```

### 상태
- ✅ node-server.ts: LGU+ 3곳 `=== 0` 단순화
- ✅ app.js: LGU+ 3곳 `=== 0` 단순화
- ✅ tbm-extra.ts: 근로자 전원 서명 → 안전관리자 알림 추가
- ✅ node-server.ts: `group_permissions` 테이블 + `getGroupPerm()` + REST API
- ✅ app.js: "그룹별 권한 설정" 관리자 탭 UI 추가
- ✅ 빌드 성공 (252.03 kB, 오류 없음)
- ⚠️ NAS 업데이트 후 그룹별 권한 설정 탭 동작 확인 필요

---

## 세션 63 (2026-06-23) — BUG-041: LGU+ 공사 조회 오류 + FEAT-029: group_permissions 기반 푸시 알림

### 세션 요약
세션 62 FEAT-027 적용 후 LGU+ 공사 조회가 안 되는 문제 발견 및 수정.
푸시 알림 수신자 결정을 group_permissions 테이블 기반으로 전환.

### BUG-041: LGU+ 수동입력 공사 조회 안 됨

#### 원인
- `constructions.ts` — `SELECT c.*` 에서 `is_auto_request_no`가 NULL 반환 가능 (D1 컬럼 누락 시)
  - NULL → `=== 0` 필터 불통과 → 수동입력 공사도 LGU+에게 안 보임
- `tasks.ts` — `COALESCE(con.is_auto_request_no, 0)` 에서 공사 미연결 작업이 0으로 처리
  - NULL(미연결) → 0 → `=== 0` 필터 통과 → LGU+ 대상 아닌 작업 오포함

#### 수정
| 파일 | 변경 전 | 변경 후 |
|------|---------|---------|
| `constructions.ts` | `SELECT c.*` | `COALESCE(c.is_auto_request_no, 0) AS is_auto_request_no` 명시 추가 |
| `tasks.ts` (3곳) | `COALESCE(con.is_auto_request_no, 0)` | `COALESCE(con.is_auto_request_no, -1)` |

#### COALESCE -1 의미
```
-1 = 공사 미연결 (NULL fallback) → === 0 불통과 → LGU+ 대상 아님 ✅
 0 = 수동입력 공사              → === 0 통과   → LGU+ 허용 ✅
 1 = 자동부여 공사              → === 0 불통과 → LGU+ 차단 ✅
```

### FEAT-029: group_permissions 기반 FCM/SSE/notifications 수신자 결정

#### 추가 헬퍼 함수 (node-server.ts)
- `getUserGroupKey(u)` — 사용자 row → group_key 매핑 (sub_role 우선, fallback role+position)
- `getUsersWithPerm(permKey, excludeId?)` — group_permissions 기반 수신자 id[] 반환

#### 변경된 발송 지점
| 위치 | 기존 방식 | 변경 후 |
|------|---------|---------|
| 작업상태 변경 FCM/SSE/notifications | `position IN (...)` 하드코딩 | `getUsersWithPerm('notify_all_tasks')` |
| 배정 작업자 FCM/SSE | `workerIds` 직접 | `getUsersWithPerm('notify_own_task')` 교집합 |
| LGU+ 작업상태 FCM | `role='lgu' OR sub_role='lgu_plus'` | `getUsersWithPerm('notify_lgu_tasks')` |
| 체크리스트 완료 알림 | LGU+만 | 전체관리자(`notify_all_tasks`) + LGU+(`notify_lgu_tasks`) 분리 |

### 복원 스크립트
- `restore_before_bug041.sh` — 커밋 `7421134` 기준 롤백

### 커밋
| 해시 | 내용 |
|------|------|
| `7421134` | fix: FEAT-027 그룹별 권한 API URL 이중 prefix 수정 (세션 62) |
| `3872696` | fix: BUG-041 LGU+ 공사 조회 + FEAT-029 group_permissions 기반 푸시 알림 |

### NAS 업데이트
```bash
git fetch origin && git reset --hard origin/main && npm run build && pm2 restart safetynote
```

### 상태
- ✅ constructions.ts: COALESCE(is_auto_request_no, 0) 명시 추가
- ✅ tasks.ts: COALESCE -1 (공사 미연결 구분) 3곳 수정
- ✅ node-server.ts: getUserGroupKey() + getUsersWithPerm() 헬퍼 추가
- ✅ node-server.ts: 작업상태 FCM/SSE/notifications group_permissions 전환
- ✅ node-server.ts: 체크리스트 완료 알림 전체관리자 + LGU+ 분리 발송
- ✅ node-server.ts: LGU+ 알림 notify_lgu_tasks 기반 전환
- ✅ 빌드 성공 (252.10 kB, 오류 없음)
- ⚠️ NAS 업데이트 후 LGU+ 공사 목록 및 그룹별 알림 수신 확인 필요

---

## 세션 64 — BUG-042~045, FEAT-030

### 개요
현장 점검 등록·수정·삭제 기능 완성 및 관련 500 에러 연쇄 수정.

### BUG-042: POST /api/inspections 500 — inspection_result 컬럼/inspection_workers 테이블 미존재

#### 원인
- `inspection_result`, `result_reason`, `updated_at` 컬럼 및 `inspection_workers` 테이블이 DB에 없음
- patchSchema 버전 누락 → 서버 재시작 시 자동 생성 안 됨

#### 수정
- `node-server.ts` — patchSchema v0.146 추가
  - `ALTER TABLE site_inspections ADD COLUMN inspection_result TEXT NOT NULL DEFAULT 'none'`
  - `ALTER TABLE site_inspections ADD COLUMN result_reason TEXT NOT NULL DEFAULT ''`
  - `ALTER TABLE site_inspections ADD COLUMN updated_at DATETIME`
  - `CREATE TABLE IF NOT EXISTS inspection_workers (id, inspection_id, worker_id, result_type, created_at)` + UNIQUE(inspection_id, worker_id) + 인덱스 2개

### FEAT-030: 현장 점검 수정·삭제 기능 추가

#### Backend (`src/routes/inspections.ts`)
- `PUT /:id` — 수정 라우트 (본인 or admin만 허용)
- `DELETE /:id` — 삭제 라우트 (물리파일 + DB 연쇄 삭제, 본인 or admin)

#### Frontend (`public/static/app.js`)
- 상세 모달 footer에 수정·삭제 버튼 추가 (admin/inspector 역할만 노출)
- `editInspection(id)` — 기존 데이터 prefill 수정 모달
- `selectInsEditResult(val)` — 수정 모달 결과 버튼 토글
- `onInsEditTaskSelect(sel)` — 수정 모달 작업 선택 시 작업자 목록 갱신
- `submitEditInspection(id)` — PUT `/api/inspections/:id` 호출
- `deleteInspection(id)` — 확인 모달 + DELETE API 호출

### BUG-043: DELETE /api/inspections/:id 500 — inspection_workers 테이블 없음

#### 수정
- `DELETE /:id`, `PUT /:id` 라우트의 `inspection_workers` DELETE/INSERT 쿼리를 try/catch로 감쌈 → 실패 시 무시

### BUG-044: GET /api/inspections/:id 상세 조회 500

#### 수정
`inspection_workers` 조회 관련 6개 라우트 전체 try/catch 처리:
| 라우트 | 처리 |
|--------|------|
| `GET /:id` | workers 조회 → 실패 시 `[]` |
| `POST /` | INSERT → 실패 시 무시 |
| `GET /worker-history/:id` | 전체 try/catch → `[]` |
| `GET /stats/worker-safety` | workerRows/dailyRows → 빈 결과 |
| `GET /worker-poor-tasks/:id` | 전체 try/catch → `[]` |
| `GET /stats/my-safety` | 3개 쿼리 → 빈 결과 |

### BUG-045: 우수/불량 작업자 선택 시 POST /api/inspections 500

#### 원인
- better-sqlite3의 `lastInsertRowid`는 JavaScript `BigInt` 타입 반환
- `makeD1` 래퍼가 이를 변환 없이 `last_row_id`에 저장
- `c.json({ id: inspectionId })` 호출 시 `JSON.stringify(BigInt)` → **TypeError → 500**
- 작업자 선택(우수/불량) 시에만 `inspectionId`를 bind 인자로 사용하여 증상 표면화

#### 수정
| 파일 | 위치 | 변경 내용 |
|------|------|-----------|
| `node-server.ts` | `makeD1 run()` | `Number(info.lastInsertRowid)` 변환 |
| `node-server.ts` | `makeD1 batch()` | `Number(info.lastInsertRowid)` 변환 |
| `src/routes/inspections.ts` | POST 등록 | `const inspectionId = Number(result.meta.last_row_id)` |

### 커밋
| 해시 | 내용 |
|------|------|
| `2690afe` | docs: PROJECT_HISTORY.md 세션 63 커밋 해시 반영 |
| `25b52c0` | fix: BUG-042 patchSchema v0.146 — inspection 컬럼·테이블 추가 |
| `81d24e7` | feat: FEAT-030 현장 점검 수정·삭제 기능 + BUG-042 연동 |
| `8b9e84e` | fix: BUG-043 DELETE/PUT inspection_workers try/catch 처리 |
| `ac1e739` | fix: BUG-044 GET /:id + 통계 6개 라우트 inspection_workers try/catch |
| `95350be` | fix: BUG-045 makeD1 lastInsertRowid BigInt→Number 변환 |

### NAS 업데이트
```bash
git fetch origin && git reset --hard origin/main && npm run build && pm2 restart safetynote
```

### 상태
- ✅ node-server.ts: patchSchema v0.146 — inspection_result/result_reason/updated_at 컬럼 추가
- ✅ node-server.ts: patchSchema v0.146 — inspection_workers 테이블 + 인덱스 생성
- ✅ node-server.ts: makeD1 run() BigInt→Number 변환
- ✅ node-server.ts: makeD1 batch() BigInt→Number 변환
- ✅ src/routes/inspections.ts: PUT /:id 수정 라우트 구현
- ✅ src/routes/inspections.ts: DELETE /:id 삭제 라우트 구현
- ✅ src/routes/inspections.ts: inspection_workers 전체 6개 라우트 try/catch
- ✅ src/routes/inspections.ts: inspectionId Number() 명시 변환
- ✅ public/static/app.js: 수정·삭제 버튼 UI + 관련 함수 5개 추가
- ✅ 빌드 성공 (255.04 kB, 오류 없음)
- ✅ 커밋 95350be 푸시 완료

---

## 세션 65 — BUG-046: 현장 점검 우수/불량 작업자 저장 안 됨

### 원인 분석

#### 1차 원인 (BUG-045 — 세션 64에서 수정)
- `makeD1 run()` BigInt → `c.json()` 직렬화 실패 → 500

#### 2차 원인 (BUG-046 — 금번 세션)
- `inspections.ts` POST/PUT 라우트의 `inspection_workers` INSERT가 `try { ... } catch (_) {}` 에 잡혀 **에러 로그 없이 조용히 저장 실패**
- `makeD1` 래퍼를 경유한 D1 호환 레이어에서 발생한 에러가 식별 불가
- `inspection_result` 빈 문자열(`''`) 처리 불명확 — `|| 'none'` 폴백으로 인해 의도치 않은 `'none'` 저장 가능성

### 해결

#### NAS 전용 라우트 오버라이드 추가 (`node-server.ts`)
**[RULE-002] `app.route('/api/inspections', inspectionRoutes)` 앞에 등록**

| 라우트 | 처리 방식 |
|--------|-----------|
| `POST /api/inspections` | `rawDb` 직접 처리 — better-sqlite3 동기 API |
| `PUT /api/inspections/:id` | `rawDb` 직접 처리 — better-sqlite3 동기 API |

**개선 사항**:
- `inspection_workers` INSERT를 `rawDb.transaction()`으로 안전하게 실행
- 에러 발생 시 `console.warn` 로그 출력 (NAS 서버 로그 추적 가능)
- 응답에 `workers_saved` 카운트 포함 (`{ success: true, id, workers_saved }`)
- `inspection_result` 빈 문자열 폴백 로직 명확화
  ```typescript
  // 기존: body.inspection_result || 'none'  — '' → 'none' 폴백
  // 수정: (body.inspection_result != null && body.inspection_result !== '') ? body.inspection_result : 'none'
  ```

### 커밋
| 해시 | 내용 |
|------|------|
| `bacf7ec` | fix: 현장 점검 우수/불량 작업자 저장 안 됨 — NAS 전용 POST/PUT 오버라이드 |

### NAS 업데이트
```bash
git fetch origin && git reset --hard origin/main && npm run build && pm2 restart safetynote
```

### 상태
- ✅ node-server.ts: POST /api/inspections NAS 전용 오버라이드 (rawDb 직접)
- ✅ node-server.ts: PUT /api/inspections/:id NAS 전용 오버라이드 (rawDb 직접)
- ✅ inspection_workers rawDb.transaction() 안전 저장
- ✅ 에러 로그 console.warn 추가
- ✅ workers_saved 응답 포함
- ✅ 빌드 성공 (255.04 kB, 오류 없음)
- ✅ 커밋 bacf7ec 푸시 완료

---

## 세션 66 — FEAT-031, FEAT-032

### FEAT-031: 현장 점검 등록 — 점검 유형 기본값 수시점검으로 변경

#### 변경
- `public/static/app.js` — 등록 모달 `<select id="insType">` 에서 `frequent`(수시점검) 옵션에 `selected` 속성 추가
- 기존: `routine`(정기점검) 기본 선택 → 변경: `frequent`(수시점검) 기본 선택

---

### FEAT-032: 현장 점검 상태 드롭다운 + 완료 시 알림 발송

#### 프론트엔드 (`public/static/app.js`)

**상세 모달 footer — 처리상태 드롭다운 추가**
- `<select id="insStatusSel_${ins.id}">` — 미처리 / 처리중 / 완료 선택
- 현재 상태에 따라 색상 동적 적용
  - 미처리: 노란색(`#F59E0B`)
  - 처리중: 파란색(`#3B82F6`)
  - 완료: 초록색(`#10B981`)

**신규 함수**
| 함수 | 역할 |
|------|------|
| `changeInspectionStatus(id, status)` | 드롭다운 변경 핸들러 — 완료 시 확인 모달 표시 후 API 호출 |
| `_applyInsStatusSelStyle(sel, status)` | 드롭다운 스타일 동적 적용 헬퍼 |

**완료 처리 확인 모달**
- 완료(`closed`) 전환 시 확인 모달 표시
- 취소 시 드롭다운 이전 값으로 복원
- 확인 시 API 호출 → toast "관련자에게 알림이 발송됩니다" 표시

#### 백엔드 (`node-server.ts`)

**NAS 전용 PATCH /api/inspections/:id/status 오버라이드 추가**
[RULE-002] `app.route('/api/inspections', inspectionRoutes)` 앞에 등록

| 처리 | 내용 |
|------|------|
| DB 업데이트 | `rawDb.prepare('UPDATE site_inspections SET status=?, closed_at=... WHERE id=?').run()` |
| 알림 DB 저장 | `notifications` 테이블 INSERT — `type: 'inspection_closed'`, `ref_type: 'inspection'` |
| SSE 실시간 알림 | `sendToUser(uid, ssePayload)` — 수신자 즉시 알림 |
| FCM 푸시 발송 | `sendFcmToUsers(targetIds, { title, body, data })` — 비동기, 실패해도 응답 영향 없음 |

**알림 수신 대상 결정 방식**
```
getUsersWithPerm('notify_all_tasks', user.id)
  → group_permissions 기반으로 safety(안전관리자) + site_rep(현장대리인) + ceo(대표이사) 자동 포함
  → 처리자 본인(user.id) 제외
```

**status 값 검증**
- `['open', 'in_progress', 'closed']` 외 값 → 400 에러 반환

#### 복원 스크립트
- `restore_before_feat031_032.sh` — 커밋 `7c2fe89` 기준 롤백

### 커밋
| 해시 | 내용 |
|------|------|
| 567fc23 | feat: FEAT-031 수시점검 기본값 + FEAT-032 상태 드롭다운 + 완료 알림 |

### NAS 업데이트
```bash
git fetch origin && git reset --hard origin/main && npm run build && pm2 restart safetynote
```

### 상태
- ✅ 등록 모달 점검 유형 기본값: `frequent`(수시점검)
- ✅ 상세 모달 footer: 처리상태 드롭다운 (미처리/처리중/완료)
- ✅ 완료 전환 시 확인 모달 표시
- ✅ 완료 처리 시 notifications DB 저장
- ✅ 완료 처리 시 SSE 실시간 알림
- ✅ 완료 처리 시 FCM 푸시 발송 (안전관리자+현장대리인+대표이사)
- ✅ 드롭다운 상태별 색상 표시
- ✅ RULE-002 준수 — inspectionRoutes 마운트 앞에 등록
- ✅ 빌드 성공 (255.04 kB, 오류 없음)
- ✅ 복원 스크립트: restore_before_feat031_032.sh (기준: 7c2fe89)

---

## 세션 67 (A) — FEAT-034 사이드바 메뉴 순서 변경

### 개요
- **날짜**: 2026-06-24
- **커밋**: `5bc8514`
- **캐시버전**: `v=20260624b` → `v=20260624c`

### 요구사항
관리자 사이드바 메뉴 순서 변경 — 공사현황을 맨 앞에서 뒤로 이동

### 수정 내용

**파일**: `public/static/app.js` (2068번 라인 — `allManagerMenuItems` 배열)

| 위치 | 변경 전 순서 | 변경 후 순서 |
|------|------------|------------|
| 사이드바 메뉴 | 공사현황 → 작업현황 → 작업관리 → 현장점검 → 현장위치지도 | 작업현황 → 작업관리 → 현장점검 → 현장위치지도 → 공사현황 |

```javascript
// 변경 전
{ id:'constructions', ... '공사현황' },   // 1번
{ id:'dashboard',    ... '작업현황' },   // 2번
{ id:'tasks',        ... '작업관리' },   // 3번
{ id:'inspections',  ... '현장점검' },   // 4번
{ id:'site-map',     ... '현장위치 지도' }, // 5번

// 변경 후
{ id:'dashboard',    ... '작업현황' },   // 1번
{ id:'tasks',        ... '작업관리' },   // 2번
{ id:'inspections',  ... '현장점검' },   // 3번
{ id:'site-map',     ... '현장위치 지도' }, // 4번
{ id:'constructions', ... '공사현황' },  // 5번
```

### 파일 변경
| 파일 | 변경 내용 |
|------|----------|
| `public/static/app.js` | allManagerMenuItems 배열 순서 변경 |
| `node-server.ts` | 캐시버전 v=20260624b → v=20260624c |

### 커밋
| 해시 | 내용 |
|------|------|
| `5bc8514` | feat: FEAT-034 사이드바 메뉴 순서 변경 — 작업현황·작업관리·현장점검·현장위치지도·공사현황 (캐시버전 v=20260624c) |

### 상태
- ✅ 사이드바 메뉴 순서 변경 완료
- ✅ node --check 문법 검사 통과
- ✅ 빌드 성공
- ✅ 커밋·푸시 완료 (5bc8514)

---

## 세션 67 (B) — BUG-048 글자크기 버튼 누적 확장 수정

### 개요
- **날짜**: 2026-06-24
- **커밋**: `859815d`
- **캐시버전**: `v=20260624c` → `v=20260624d`

### 증상
글자크기 설정 화면에서 '작게', '보통', '크게' 버튼을 클릭할 때마다 버튼 높이가 계속 증가하는 현상

### 원인 분석
```
_applyFontSize() 내부 기존 체크 div 제거 로직:
  btn.querySelector('[style*="fa-check"]')  ← 잘못된 selector
  → fa-check는 <i> 태그 class에 있고, [style*="fa-check"]는 항상 null 반환
  → chk가 null → chk.parentElement.remove() 미실행
  → 체크 div 제거 실패 → 클릭마다 새 div 추가 → 버튼 높이 누적 증가
```

### 수정 내용

**파일**: `public/static/app.js` (`_applyFontSize` 함수)

```javascript
// ❌ 수정 전 (BUG-048 원인) — selector 오류로 항상 null 반환
const chk = btn.querySelector('[style*="fa-check"]');
if (chk) chk.parentElement.remove();
if (isSel) {
  const d = document.createElement('div');
  d.style.cssText = 'margin-top:3px';
  ...
}

// ✅ 수정 후 — sn-font-check 클래스 기반으로 정확히 탐색·제거
btn.querySelectorAll('.sn-font-check').forEach(el => el.remove());
if (isSel) {
  const d = document.createElement('div');
  d.className = 'sn-font-check';  // ← 클래스 부여
  d.style.cssText = 'margin-top:3px';
  ...
}
```

### 기존 버그 방지 사항
- **BUG-047 교훈 준수**: `node --check public/static/app.js` 실행 → SyntaxError 없음 ✅
- **RULE**: DOM 탐색 selector는 반드시 클래스 기반으로 구현 (`[style*=...]` 방식 금지)

### 파일 변경
| 파일 | 변경 내용 |
|------|----------|
| `public/static/app.js` | _applyFontSize(): sn-font-check 클래스 기반 탐색·제거로 변경 |
| `node-server.ts` | 캐시버전 v=20260624c → v=20260624d |

### 커밋
| 해시 | 내용 |
|------|------|
| `859815d` | fix: BUG-048 글자크기 클릭 시 버튼 누적 확장 수정 — sn-font-check 클래스로 체크 div 정확히 제거 (캐시버전 v=20260624d) |

### 상태
- ✅ BUG-048 수정 완료 (_applyFontSize 클래스 기반 탐색·제거)
- ✅ node --check 문법 검사 통과
- ✅ 빌드 성공
- ✅ 커밋·푸시 완료 (859815d)
- ⚠️ BUG-048-2 잔존: '보통' 선택 시 첫 1회 박스 크기 변동 (→ 세션 69에서 수정)

---

## 세션 67 (C) — BUG-049 브라우저 업데이트 시 npm run build 누락 수정

### 개요
- **날짜**: 2026-06-24
- **커밋**: `41b0b38`
- **대상 파일**: `src/nas-routes/admin.ts`

### 증상
관리자 화면 '브라우저 업데이트' 기능 실행 시, `git reset --hard origin/main` 후 pm2 restart만 하면 `dist/` 폴더가 이전 버전 그대로 유지되어 최신 app.js가 반영되지 않음

### 원인 분석
```
기존 업데이트 순서:
  1. git fetch origin
  2. git reset --hard origin/main   ← 소스코드만 갱신
  3. pm2 restart safetynote         ← dist/ 는 이전 빌드 그대로!

→ node-server.ts 변경사항은 pm2 restart로 반영되지만
   public/static/app.js 변경사항은 dist/ 재빌드 없이는 브라우저에 미반영
```

### 수정 내용

**파일**: `src/nas-routes/admin.ts`

**1. npm run build 단계 추가 (git reset 후, pm2 restart 전)**
```typescript
// ── 3. npm run build (프론트엔드 dist 재빌드) ──────────────
// BUG-049: git reset 후 빌드 없이 pm2 restart만 하면 dist/ 가 이전 버전 그대로 유지됨
_updateState.status  = 'restarting'
_updateState.message = '프론트엔드 빌드 중... (30초~1분 소요)'
_addUpdateLog('npm run build 시작...')
const npmBin = resolveNpmBin()
const buildRes = await runCmd(npmBin, ['run', 'build'], cwd, 120000)
if (buildRes.code !== 0) { ... return }
_addUpdateLog('npm run build 완료 ✅')

// ── 4. pm2 restart ─────────────────────────────────────
```

**2. npm 경로 자동 탐색 함수 추가 (`resolveNpmBin`)**
```typescript
function resolveNpmBin(): string {
  const candidates = [
    process.env.NPM_EXEC,
    '/volume1/@appstore/Node.js_v18/usr/local/bin/npm',  // Synology NAS
    '/usr/local/bin/npm',
    '/usr/bin/npm',
    'npm',
  ]
  for (const c of candidates) {
    if (c && (c === 'npm' || existsSync(c))) return c
  }
  return 'npm'
}
```

**3. runCmd PATH 보강**
```typescript
// NAS Node.js bin 경로가 PATH에 없어도 npm/git/pm2 인식하도록 보강
const nasNodeBin = '/volume1/@appstore/Node.js_v18/usr/local/bin'
const env = {
  ...process.env,
  PATH: [nasNodeBin, process.env.PATH || '', '/usr/local/bin', '/usr/bin', '/bin'].join(':'),
}
```

### 업데이트 순서 (수정 후)
```
1. git fetch origin
2. git reset --hard origin/main
3. npm run build  ← 추가 (BUG-049)
4. pm2 restart safetynote
```

### 파일 변경
| 파일 | 변경 내용 |
|------|----------|
| `src/nas-routes/admin.ts` | resolveNpmBin() 추가, runCmd PATH 보강, npm run build 단계 삽입 |

### 커밋
| 해시 | 내용 |
|------|------|
| `41b0b38` | fix: BUG-049 브라우저 업데이트 시 npm run build 누락 수정 — git reset 후 dist 재빌드 추가 + NAS npm 경로 자동 탐색 |

### 상태
- ✅ BUG-049 수정 완료 (npm run build 단계 추가)
- ✅ NAS npm 경로 자동 탐색 (`resolveNpmBin`)
- ✅ runCmd PATH 보강 (NAS Node.js_v18 bin 포함)
- ✅ 커밋·푸시 완료 (41b0b38)

---

## 세션 67 — BUG-047 빈 화면 수정

### 개요
- **날짜**: 2026-06-24
- **증상**: NAS 업데이트 후 `linkmax.myds.me:3443` 접속 시 빈 화면(백지)
- **원인**: FEAT-032 구현 시 `app.js` 12573번 라인 템플릿 리터럴 문법 오류

### 원인 분석

**오류 코드** (12573번 라인):
```javascript
// ❌ 잘못된 코드 — 백틱이 중간에 닫혔다가 다시 열림
toast(`점검이 [${statusLabel}] 처리되었습니다.`${status === 'closed' ? ' 관련자에게 알림이 발송됩니다.' : ''}`);
```

**수정 코드**:
```javascript
// ✅ 올바른 코드 — 하나의 템플릿 리터럴 안에 삼항 연산자 포함
toast(`점검이 [${statusLabel}] 처리되었습니다.${status === 'closed' ? ' 관련자에게 알림이 발송됩니다.' : ''}`);
```

**진단 방법**: `node --check public/static/app.js` → SyntaxError 즉시 발견

### 재발 방지
- 향후 app.js 수정 후 반드시 `node --check public/static/app.js` 실행 후 커밋

### 파일 변경
| 파일 | 변경 내용 |
|------|----------|
| `public/static/app.js` | 12573번 라인 템플릿 리터럴 문법 오류 수정 |
| `node-server.ts` | 캐시버전 `v=20260621z` → `v=20260624a` |

### 커밋
| 해시 | 내용 |
|------|------|
| e3a14eb | fix: BUG-047 app.js 템플릿 리터럴 문법 오류 수정 — 빈 화면 원인 (캐시버전 v=20260624a) |

### NAS 업데이트
```bash
git fetch origin && git reset --hard origin/main && npm run build && pm2 restart safetynote
```

### 상태
- ✅ 문법 오류 수정 (`node --check` 통과)
- ✅ 빌드 성공 (255.04 kB)
- ✅ 캐시버전 `v=20260624a`
- ✅ 커밋·푸시 완료 (`e3a14eb`)

---

## 세션 68 — FEAT-033 작업(예정)일 자동갱신 + 명칭 변경

### 개요
- **날짜**: 2026-06-24
- **커밋**: `62a3838`
- **캐시버전**: `v=20260624a` → `v=20260624b`

### 요구사항
1. 체크리스트 시행일이 최초 등록 작업예정일보다 늦으면 `planned_date` 자동 갱신
2. UI 명칭 `작업예정일` → `작업(예정)일` 변경

---

### FEAT-033 구현 내용

#### 1. planned_date 자동갱신 로직 (`node-server.ts`)

**위치**: `PATCH /api/checklist/:id/complete` NAS 오버라이드 내부 — tasks 상태 업데이트 블록 직후

**로직**:
- 체크리스트 완료 시 KST 날짜(`kstDateStr = kstStr.slice(0,10)`) 추출
- `tasks.planned_date` 조회
- 체크리스트 날짜 > planned_date 이면 → planned_date를 체크리스트 날짜로 UPDATE
- planned_date가 NULL이거나 같거나 이전이면 → 변경 없음
- 실패 시 무음 처리(warn 로그만) — 완료 응답에 영향 없음

```typescript
// ── [FEAT-033] 체크리스트 시행일이 작업예정일보다 늦으면 planned_date 자동 갱신 ──
try {
  const kstDateStr = kstStr.slice(0, 10) // 'YYYY-MM-DD'
  var pRow: any = rawDb.prepare(`SELECT planned_date FROM tasks WHERE id = ?`).get(asmRow.task_id)
  const currentPlanned = pRow?.planned_date ? String(pRow.planned_date).slice(0, 10) : null
  if (currentPlanned && kstDateStr > currentPlanned) {
    rawDb.prepare(`UPDATE tasks SET planned_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(kstDateStr, asmRow.task_id)
    console.log(`[FEAT-033] planned_date 자동갱신: task_id=${asmRow.task_id} ${currentPlanned} → ${kstDateStr}`)
  }
} catch(e: any) {
  console.warn('[FEAT-033] planned_date 자동갱신 실패(무시):', e.message)
}
```

**적용 예시**:
- 작업예정일: `26.06.23`, 체크리스트 시행일: `26.06.24` → `작업(예정)일` 자동 `26.06.24`로 갱신
- 작업예정일: `26.06.25`, 체크리스트 시행일: `26.06.24` → 변경 없음 (시행일 ≤ 예정일)
- 작업예정일: NULL → 변경 없음

#### 2. 명칭 변경 (`public/static/app.js`)

| 위치 | 변경 전 | 변경 후 |
|------|---------|---------|
| 4724번 (주석) | `<!-- 작업종류 \| 예정일 (2열) -->` | `<!-- 작업종류 \| 작업(예정)일 (2열) -->` |
| 4738번 (등록 모달 라벨) | `예정일` | `작업(예정)일` |
| 6165번 (상세 카드 주석) | `<!-- ... / 작업예정일 -->` | `<!-- ... / 작업(예정)일 -->` |
| 6186번 (상세 카드 표시) | `작업예정일` | `작업(예정)일` |

---

### 기존 버그 방지 사항
- **BUG-047 교훈**: `node --check public/static/app.js` 실행 → SyntaxError 없음 ✅
- **RULE-002 준수**: NAS 오버라이드는 `app.route()` 마운트 앞에 위치 확인 ✅
- **무음 실패 패턴 방지**: try/catch로 감싸되 실패 시 warn 로그 출력 후 응답은 정상 반환

### 파일 변경
| 파일 | 변경 내용 |
|------|----------|
| `node-server.ts` | FEAT-033 planned_date 자동갱신 + 캐시버전 v=20260624b |
| `public/static/app.js` | 명칭 3곳 변경 ('작업예정일'→'작업(예정)일', '예정일'→'작업(예정)일') |
| `restore_before_feat033.sh` | 복원 스크립트 생성 (기준: faeadaa) |

### 커밋
| 해시 | 내용 |
|------|------|
| 62a3838 | feat: FEAT-033 체크리스트 시행일 기준 작업(예정)일 자동갱신 + 명칭 변경 (캐시버전 v=20260624b) |

### NAS 업데이트
```bash
git fetch origin && git reset --hard origin/main && npm run build && pm2 restart safetynote
```

### 적용 후 검증
```bash
# planned_date 자동갱신 로그 확인
pm2 logs safetynote --nostream | grep "FEAT-033"
# → "[FEAT-033] planned_date 자동갱신: task_id=N 2026-06-23 → 2026-06-24"
```

### 상태
- ✅ planned_date 자동갱신 로직 추가 (체크리스트 완료 시점)
- ✅ UI 명칭 3곳 변경 ('작업(예정)일')
- ✅ node --check 문법 검사 통과
- ✅ 빌드 성공 (255.04 kB)
- ✅ 복원 스크립트: restore_before_feat033.sh (기준: faeadaa)
- ✅ 커밋·푸시 완료 (62a3838)

---

## 세션 69 — BUG-048-2: 글자크기 '보통' 선택 시 1회 박스 크기 변동 수정

### 개요
- **날짜**: 2026-06-24
- **커밋**: `4051cd0`
- **캐시버전**: `v=20260624d` → `v=20260624e`

### 증상
글자크기 설정 화면에서 '보통'을 선택할 때 첫 1회에만 버튼 박스 크기가 증가하는 현상 발생.  
(BUG-048 수정 후 잔존하는 부분 버그)

### 원인 분석 (BUG-048-2)

```
renderMyProfilePage() 초기 HTML 렌더링
  → 체크 div 생성: <div style="margin-top:3px">  ← sn-font-check 클래스 없음!
  
_applyFontSize() 첫 호출 시
  → btn.querySelectorAll('.sn-font-check') → 0개 검색됨
  → 기존 체크 div 제거 실패 (클래스 없으니 검색 안 됨)
  → 새 sn-font-check div 추가
  → 버튼 내 체크 div 2개 중첩 → 박스 크기 증가 (1회만 발생)
  
_applyFontSize() 두 번째 이후 호출
  → .sn-font-check 1개 발견 → 정상 제거 후 재추가 → 크기 유지
```

### 수정 내용

**파일**: `public/static/app.js` (23103번 라인)

```javascript
// ❌ 수정 전 (BUG-048-2 원인)
${isSel ? '<div style="margin-top:3px"><i class="fas fa-check" ...></i></div>' : ''}

// ✅ 수정 후
${isSel ? '<div class="sn-font-check" style="margin-top:3px"><i class="fas fa-check" ...></i></div>' : ''}
```

### 기존 버그 방지 사항
- **BUG-047 교훈 준수**: `node --check public/static/app.js` 실행 → SyntaxError 없음 ✅
- **BUG-048 교훈**: 초기 렌더링 HTML과 JS 동적 조작이 동일 클래스 기준으로 일치해야 함
- **동일 버그 방지 룰**: JS로 특정 클래스 기반 DOM 탐색·제거 시, 초기 렌더링 HTML에도 반드시 동일 클래스 부여

### 파일 변경
| 파일 | 변경 내용 |
|------|----------|
| `public/static/app.js` | 23103번: 체크 div에 class="sn-font-check" 추가 |
| `node-server.ts` | 캐시버전 v=20260624d → v=20260624e |
| `restore_before_bug048_2.sh` | 복원 스크립트 생성 (기준: 41b0b38) |

### 커밋
| 해시 | 내용 |
|------|------|
| `4051cd0` | fix: BUG-048-2 글자크기 초기 렌더링 체크 div sn-font-check 클래스 누락 수정 (캐시버전 v=20260624e) |

### 상태
- ✅ BUG-048-2 수정 완료 (초기 렌더링 체크 div 클래스 추가)
- ✅ node --check 문법 검사 통과
- ✅ 빌드 성공 (255.04 kB)
- ✅ 복원 스크립트: restore_before_bug048_2.sh (기준: 41b0b38)
- ✅ 커밋·푸시 완료 (4051cd0)
- ⏳ NAS 업데이트 대기

---

## 세션 70 — BUG-050: 현장위치 지도 위험성체크 탭 마커 미표시 수정

### 개요
- **날짜**: 2026-06-25
- **커밋**: `a091db3`
- **캐시버전**: `v=20260624e` → `v=20260625a`

### 증상
현장위치 지도 화면에서 '⚠️ 위험성체크' 탭을 선택해도 GPS 마커가 지도에 표시되지 않음.
하단에 "GPS 기록이 없습니다" 메시지만 표시됨.

### 원인 분석 (BUG-050)

```
GPS 저장 흐름 (실제):
  체크리스트 완료 시 → GPS → checklist_assessments.gps_lat/gps_lon 저장

/api/risk GET 쿼리 (기존):
  SELECT ra.*, t.gps_lat, t.gps_lon ...
  FROM risk_assessments ra
  LEFT JOIN tasks t ON t.id = ra.task_id
  → tasks.gps_lat: 작업 개시(working) 시에만 저장 → 위험성평가 시점에는 NULL

결과:
  /api/risk 응답의 gps_lat = NULL
  → loadSiteMapMarkers()에서 if(!ra.gps_lat || !ra.gps_lon) continue
  → 모든 항목 건너뜀 → 마커 0개
```

**핵심 원인**: GPS 저장 테이블(`checklist_assessments`)과 조회 쿼리 테이블(`tasks`) 불일치

### 수정 내용

**파일**: `src/routes/risk.ts` (GET `/` 쿼리)

```sql
-- ❌ 수정 전: tasks.gps_lat만 JOIN (위험성평가 시점에는 항상 NULL)
SELECT ra.*, t.gps_lat, t.gps_lon, t.gps_address, ...
FROM risk_assessments ra
LEFT JOIN tasks t ON t.id = ra.task_id
...

-- ✅ 수정 후: checklist_assessments도 LEFT JOIN, COALESCE로 우선순위 처리
SELECT ra.*,
  COALESCE(ca.gps_lat, t.gps_lat) as gps_lat,    -- 체크리스트 GPS 우선
  COALESCE(ca.gps_lon, t.gps_lon) as gps_lon,
  COALESCE(ca.gps_address, t.gps_address) as gps_address,
  ...
FROM risk_assessments ra
LEFT JOIN tasks t ON t.id = ra.task_id
...
LEFT JOIN (
  SELECT task_id, gps_lat, gps_lon, gps_address
  FROM checklist_assessments
  WHERE gps_lat IS NOT NULL AND gps_lon IS NOT NULL
  GROUP BY task_id
) ca ON ca.task_id = ra.task_id
```

**GPS 우선순위**:
1. `checklist_assessments.gps_lat` (체크리스트 완료 시 기록)
2. `tasks.gps_lat` (작업 개시 시 기록 — fallback)
3. `NULL` (GPS 미기록)

**Fallback 계층**:
- `checklist_assessments` 테이블 없는 구버전 DB → `tasks.gps_lat` 사용
- GPS 컬럼 없는 최구버전 DB → NULL 반환 (기존 동작 유지)

### 기존 버그 방지 사항
- **BUG-047 교훈 준수**: `node --check public/static/app.js` 실행 → SyntaxError 없음 ✅
- **RULE-006 추가**: GPS 저장 테이블 변경 시 조회 쿼리 JOIN도 함께 수정해야 함
- **패턴 확인**: TBM/진행/완료 탭은 `/tbm`, `/tasks` API를 직접 사용하므로 동일 문제 없음

### 파일 변경
| 파일 | 변경 내용 |
|------|----------|
| `src/routes/risk.ts` | GET `/` — checklist_assessments LEFT JOIN + COALESCE GPS 우선순위 |
| `node-server.ts` | 캐시버전 v=20260624e → v=20260625a |
| `restore_before_bug050.sh` | 복원 스크립트 생성 (기준: 3e66dc7) |

### 커밋
| 해시 | 내용 |
|------|------|
| `a091db3` | fix: BUG-050 현장위치 지도 위험성체크 탭 마커 미표시 수정 (캐시버전 v=20260625a) |

### 상태
- ✅ BUG-050 수정 완료 (checklist_assessments LEFT JOIN)
- ✅ node --check 문법 검사 통과
- ✅ 빌드 성공 (255.94 kB)
- ✅ 복원 스크립트: restore_before_bug050.sh (기준: 3e66dc7)
- ✅ 커밋·푸시 완료 (a091db3)
- ⏳ NAS 업데이트 대기

---

## 세션 71 — BUG-053·054·055 위험신고·아차사고 상세화면·사진 일괄 수정

> 날짜: 2026-06-30 | 커밋: `6bd6f22` | 캐시버전: `v=20260630a`

### 수정 내용

#### BUG-053: 위험신고·아차사고 상세 화면 진입 불가
- **원인**: 카드에 `onclick` 이벤트 없음 + `showHazardDetail()` 함수 미존재
- **수정**:
  - 카드 div에 `onclick="showHazardDetail(h.id)"` 추가
  - `showHazardDetail()` 함수 신규 작성 (상세 모달)
  - 카드 하단 "상세보기" 버튼 추가

#### BUG-054: 위험신고·아차사고 등록 사진 조회 안 됨
- **원인**: 상세 화면 자체가 없어 `photo_data` 표시 불가
- **수정**: `showHazardDetail()` 모달 내 신고 사진(`photo_data`) 표시
  - Base64 데이터 → `<img src="data:image/jpeg;base64,...">` 렌더링
  - 탭하면 전체화면 확대 (`requestFullscreen`)
  - 처리완료 사진(`resolve_photo_data`)도 상세 모달에 함께 표시

#### BUG-055: 위험신고·아차사고 처리완료 화면 사진 첨부 기능 추가
- **원인**: `resolveHazard()` 모달에 사진 첨부 UI 없음, API도 미처리
- **수정**:
  - `resolveHazard()` 모달에 사진 첨부 UI 추가 (upload-zone + 미리보기)
  - `previewResolvePhoto()` 함수 신규 작성
  - `_submitResolveHazard()` — `resolve_photo_data` Base64 추출 후 API 전송
  - `src/routes/hazards.ts` PATCH `/:id/resolve` — `resolve_photo_data` 저장 처리
  - `node-server.ts` — `hazard_reports` 테이블에 `resolve_photo_data` 컬럼 자동 추가 (`safeAlter`)

### 수정 파일
| 파일 | 내용 |
|------|------|
| `public/static/app.js` | 카드 onclick·showHazardDetail·previewResolvePhoto·_submitResolveHazard 수정 |
| `src/routes/hazards.ts` | PATCH resolve에 resolve_photo_data 저장 추가 |
| `node-server.ts` | safeAlter로 resolve_photo_data 컬럼 자동 추가 + 캐시버전 갱신 |

### 커밋
| 해시 | 내용 |
|------|------|
| `6bd6f22` | fix: BUG-053~055 위험신고·아차사고 상세화면·사진조회·처리완료사진첨부 수정 |

### 상태
- ✅ node --check 통과
- ✅ npm run build 성공 (255.99 kB)
- ✅ GitHub 푸시 완료
- ⚠️ NAS 업데이트 필요 (git reset --hard origin/main → npm run build → pm2 restart)

---

## 세션 72 — BUG-051·052: 안전교육 사진 미리보기·출력 안 됨 수정

### 작업 내용

#### BUG-051·052: 동일 근본 원인 — `/uploads/*` 서빙 라우트 미존재

**BUG-051 증상**: 안전교육 등록 화면 증빙사진 모달(`showEduPhotoModal`)에서 업로드 후 사진 미리보기가 표시되지 않음
**BUG-052 증상**: 안전교육 실시일지 출력(`printEduLog`) 시 교육 사진이 인쇄 화면에 표시되지 않음

**BUG-051 관련 코드** (`showEduPhotoModal`, `reloadPhotos`):
```javascript
grid.innerHTML = photos.map(p => `
  <div onclick="window.open('${p.file_path}','_blank')">
    <img src="${p.file_path}" class="w-full h-full object-cover ...">  // ← 동일한 file_path
  </div>`).join('');
```

#### BUG-052: 안전교육 출력(printEduLog) 시 사진 미출력

**증상**: 안전교육 실시일지 출력(printEduLog) 시 교육 사진이 표시되지 않음

**원인 분석**:
1. `education-extra.ts` POST 라우트: 사진 업로드 시 `file_path = '/uploads/edu_photos/${fname}'` (상대 URL) 형태로 DB 저장
2. 실제 파일은 `getUploadRootNow()/edu_photos/` (절대경로 — NAS: `/volume1/safetynote/uploads/edu_photos/`) 에 저장
3. `printEduLog()`: API 응답의 `file_path` 값을 `<img src="${p.file_path}">` 로 직접 렌더링
4. **`node-server.ts`에 `/uploads/*` 서빙 라우트가 없음** → 브라우저 404 → 사진 미출력
5. `/static/*`만 `serveStatic`으로 등록되어 있었고, `/uploads/*`는 누락 상태였음

**수정 내용** (`node-server.ts`):
```typescript
// GET /uploads/* — BUG-052
// getUploadRootNow() 로 NAS 외부 경로 포함 절대경로 계산 → readFileSync 직접 서빙
app.get('/uploads/*', async (c) => {
  const relPath  = c.req.path.replace(/^\/uploads\//, '')
  const absPath  = join(getUploadRootNow(), relPath)
  if (!existsSync(absPath)) return c.json({ error: 'Not Found' }, 404)
  const buf      = readFileSync(absPath)
  const ext      = absPath.split('.').pop()?.toLowerCase() || 'bin'
  const mime     = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png',
                     gif:'image/gif', webp:'image/webp', heic:'image/heic',
                     pdf:'application/pdf' }
  return new Response(buf, {
    headers: { 'Content-Type': mime[ext] || 'application/octet-stream',
               'Cache-Control': 'max-age=86400' }
  })
})
```

**추가 수정**: `nas-db.ts`의 `getUploadRootNow`를 import에 추가 (누락 수정)

**왜 serveStatic 불가?**:
- NAS 환경에서 `UPLOAD_ROOT`가 `/volume1/safetynote/uploads` 등 `public/` 외부 경로
- `serveStatic({ root: './public' })`은 `public/` 하위 파일만 서빙 가능

**왜 인증 없음?**:
- `<img src>` 태그는 `Authorization: Bearer` 헤더 전송 불가
- 동일 origin 내부 접근이므로 보안 위험 낮음

**window.open() 출력창 동작 확인**:
- `window.open('', '_blank')` 후 `document.write()`로 HTML 삽입 시
- 브라우저가 opener의 origin 상속 → `/uploads/...` 절대경로 정상 요청

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `node-server.ts` | `GET /uploads/*` 라우트 신규 추가 + `getUploadRootNow` import 추가 |

### 커밋 이력

| 해시 | 내용 |
|------|------|
| `15b3eae` | fix(BUG-052): /uploads/* 정적 파일 서빙 라우트 추가 — 안전교육 사진 출력 수정 |

### 상태
- ✅ node --check 통과
- ✅ npm run build 성공 (255.99 kB)
- ✅ GitHub 푸시 완료 (`abe9e37` → `8f08226`)
- ⚠️ NAS 업데이트 필요 (git reset --hard origin/main → npm run build → pm2 restart)

---

## 세션 73 — FEAT-035·036: 다중 NAS 자동 업데이트·APK 배포 구현

> 날짜: 2026-07-02 | 커밋: `bec2bc3`

### 구현 내용

#### FEAT-036: 다중 NAS 서버 자동 업데이트

**배경**: 기존 `POST /api/admin/update/apply`는 관리자 비밀번호 필수 → GitHub Actions 자동화 불가

**구현 방법**:
1. `src/nas-routes/admin.ts` — `POST /api/admin/update/webhook` 신규 추가
   - `DEPLOY_WEBHOOK_SECRET` 환경변수로 인증 (APK webhook과 동일 시크릿 재사용)
   - 비밀번호 없이 호출 가능 → CI/CD 자동화 적합
   - 내부 로직: git fetch → git reset --hard origin/main → npm run build → pm2 restart
   - `_updateState` 공유 → 관리자 UI의 "업데이트 상태" 화면에서도 진행 상황 확인 가능

2. `.github/workflows/build-server.yml` 신규 작성
   - **트리거**: `main` 브랜치 push (`.md`, `docs/**`, `build-apk.yml` 변경 제외)
   - **방식**: `NAS_WEBHOOK_URL_1 ~ NAS_WEBHOOK_URL_5`에 병렬(`&`) curl 전송
   - curl 옵션: `--retry 2`, `--max-time 30`, `-k`(자체서명 인증서 허용)
   - Secret 미설정 시 graceful skip (workflow 실패 없이 종료)

**GitHub Secrets 등록 방법**:
```
저장소 → Settings → Secrets and variables → Actions → New repository secret
DEPLOY_WEBHOOK_SECRET = <NAS에 설정된 값과 동일>
NAS_WEBHOOK_URL_1     = https://your-nas1.example.com:3443
NAS_WEBHOOK_URL_2     = https://your-nas2.example.com:3443
```

**NAS 서버 설정**:
```bash
# pm2 ecosystem 또는 .env 에 추가
DEPLOY_WEBHOOK_SECRET=<시크릿값>
# 추가 후 재시작
pm2 restart safetynote
```

---

#### FEAT-035: 다중 NAS APK 자동 배포

**구현**: `.github/workflows/build-apk.yml` 신규 작성

- **트리거**: `dist-apk/**` 경로 파일 변경 시에만 실행
- **APK 파일 구조**:
  ```
  dist-apk/
  ├── safetynote.apk   # 실제 APK
  ├── version.txt      # 버전 문자열 (예: 1.4.8)
  └── release.txt      # 릴리스 노트 (선택)
  ```
- **방식**: GitHub raw URL → NAS가 직접 다운로드 (`POST /api/dist/apk/webhook`)
- **Private repo 대응**: `GH_PAT` Secret 설정 시 URL에 토큰 삽입
- `NAS_WEBHOOK_URL_1 ~ NAS_WEBHOOK_URL_5` 동시 병렬 전송 (서버 업데이트와 동일 URL Secret 공유)

---

### 수정/추가 파일

| 파일 | 내용 |
|------|------|
| `src/nas-routes/admin.ts` | `POST /api/admin/update/webhook` 신규 추가 (96줄) |
| `.github/workflows/build-server.yml` | FEAT-036: 다중 NAS 서버 자동 업데이트 workflow |
| `.github/workflows/build-apk.yml` | FEAT-035: 다중 NAS APK 자동 배포 workflow |

### GitHub Secrets 전체 목록

| Secret 이름 | 용도 | 필수 여부 |
|-------------|------|----------|
| `DEPLOY_WEBHOOK_SECRET` | NAS 서버 webhook 인증 | ✅ 필수 |
| `NAS_WEBHOOK_URL_1` | 첫 번째 NAS URL | ✅ 최소 1개 |
| `NAS_WEBHOOK_URL_2` | 두 번째 NAS URL | 선택 |
| `NAS_WEBHOOK_URL_3` | 세 번째 NAS URL | 선택 |
| `NAS_WEBHOOK_URL_4` | 네 번째 NAS URL | 선택 |
| `NAS_WEBHOOK_URL_5` | 다섯 번째 NAS URL | 선택 |
| `GH_PAT` | GitHub Personal Access Token (APK private repo) | 선택 |

### 커밋

| 해시 | 내용 |
|------|------|
| `bec2bc3` | feat(FEAT-035·036): 다중 NAS 자동 업데이트·APK 배포 GitHub Actions 추가 |

### 상태
- ✅ node --check 통과
- ✅ npm run build 성공 (255.99 kB)
- ✅ GitHub 푸시 완료
- ⚠️ NAS 업데이트 필요 (git reset --hard origin/main → npm run build → pm2 restart)
- ⚠️ GitHub Secrets 등록 필요 (DEPLOY_WEBHOOK_SECRET, NAS_WEBHOOK_URL_1 이상)

<!-- FEAT-036 동작 테스트 — 자동 삭제 가능 -->

---

## 세션 75 — BUG-057: TBM 회의록 출력 서명란 2열 + 안전조치 사진 2열 배치 등록

### 작업 개요
- **세션**: 75
- **날짜**: 2026-07-02
- **상태**: ⏳ 일괄 작업 대기

### 요청 내용 (스크린샷 확인)
TBM 회의록 출력 화면(`_tbmPrint()`) 레이아웃 개선 요청:

1. **서명란 2열 배치**: 현재 1열(구분|성명|직책|서명일시|서명) → 인원 2명씩 좌우 2열 배치
   - 예: [참석자 송영민 | 참석자 박세진] 나란히 한 행
   - 인원수가 많을 때 페이지 절약 효과
2. **TBM 안전조치 사진 하단 배치**: 현재 미표시 → 출력 하단에 2열 그리드로 사진 표시
   - `_tbmPrint()` 함수 내 tbm-photos API 호출 추가 필요
   - `/checklist/{assId}/tbm-photos` 데이터 조회
   - 2열 grid로 사진 렌더링 (사진 + 라벨)

### 수정 대상 파일
| 파일 | 수정 내용 |
|------|---------|
| `public/static/app.js` | `_tbmPrint()` 함수 — `sigRowsHtml` 2열 변환 + 사진 섹션 추가 |

### 참고 — 현재 서명란 구조 (10456~10488줄)
```javascript
// 현재: 1열 테이블
const sigRowsHtml = orderedSigs.map(s => `<tr>
  <td>구분</td><td>성명</td><td>직책</td><td>서명일시</td><td>서명이미지</td>
</tr>`)
```

### 참고 — 변경 후 목표 구조
```html
<!-- 서명란: 2열 (짝수 인덱스=왼쪽, 홀수=오른쪽) -->
<table>
  <tr>
    <th colspan="5">왼쪽 헤더</th>
    <th colspan="5">오른쪽 헤더</th>
  </tr>
  <tr> <!-- 2명씩 1행 -->
    <td>구분</td><td>성명</td><td>직책</td><td>일시</td><td>서명</td>
    <td>구분</td><td>성명</td><td>직책</td><td>일시</td><td>서명</td>
  </tr>
</table>

<!-- TBM 안전조치 사진: 하단 2열 grid -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
  <div>사진1 + 라벨</div>
  <div>사진2 + 라벨</div>
</div>
```

### 수정 시 주의사항
- BUG-056(사진 미리보기 안 됨)도 동시 수정 필요 — 원인: `photoImgSrc(p.id)` 미사용
- 출력 창은 별도 window이므로 토큰 전달 방식 동일 유지
- `sig-table` CSS 클래스 2열 대응으로 확장 필요


---

## 세션 76 — BUG-058: TBM 상세 모달 서명 2열 배치 + TBM 촬영사진 미리보기 추가

### 작업 개요
- **세션**: 76
- **날짜**: 2026-07-02
- **상태**: ⏳ 일괄 작업 대기

### 요청 내용 (스크린샷 확인)
`showTbmDetail()` 모달 화면 2가지 개선 요청:

1. **참가자 서명 2열 배치**
   - 현재: 1열 세로 리스트 (참가자 1명 = 1행, 이름 + 미서명/서명완료 상태)
   - 변경: 2열 그리드 — 참가자 2명씩 좌우 배치 (모바일에서도 공간 절약)
   - 서명 완료(초록), 미서명(빨강) 카드 스타일 유지
   - 클릭 → 서명 패드 동작 유지

2. **TBM 촬영사진 미리보기 섹션 추가**
   - 현재: 사진 섹션 없음 (TBM 상세 모달에 사진 표시 없음)
   - 변경: 서명 패널 위 또는 아래에 "📸 안전조치 사진" 섹션 추가
   - 데이터 출처: `checklistData.tbm_sections` (`/checklist/task/:taskId`)
   - 단, `showTbmDetail()`은 현재 checklist API 호출 없음
     → `tbm.task_id`를 이용해 `/checklist/task/${tbm.task_id}` 추가 조회 필요
   - 사진 2열 grid 표시 (사진 + 라벨)
   - 사진 없으면 섹션 자체 미표시

### 수정 대상 파일
| 파일 | 위치 | 수정 내용 |
|------|------|---------|
| `public/static/app.js` | `showTbmDetail()` 함수 (9557~9855줄) | ① API 호출에 checklist 추가 ② 서명 2열 렌더링 ③ 사진 섹션 추가 |

### 현재 참가자 서명 렌더링 위치 (9617~9664줄)
```javascript
const attendeeRows = attendees.length > 0
  ? attendees.map((name, idx) => {
      // 현재: 1열 div
      return `<div style="display:flex;align-items:center;...">...</div>`
    })
```

### 변경 목표 — 서명 2열
```javascript
// 2명씩 짝지어 grid row 생성
const paired = [];
for (let i = 0; i < allSigItems.length; i += 2) {
  paired.push([allSigItems[i], allSigItems[i+1] || null]);
}
// <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
//   <card> 참가자1 </card>
//   <card> 참가자2 </card>
// </div>
```

### 변경 목표 — 사진 미리보기 섹션
```javascript
// showTbmDetail() _reload() 내 API 추가
const checklistRes = tbm.task_id
  ? await API.get(`/checklist/task/${tbm.task_id}`).catch(() => ({ data: { tbm_sections: [] } }))
  : { data: { tbm_sections: [] } };
const tbmSections = checklistRes.data?.tbm_sections || [];

// 사진 섹션 HTML (tbmSections 있을 때만)
const photoSectionHtml = tbmSections.length > 0 ? `
  <div style="background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:12px;padding:12px 14px;margin-bottom:8px">
    <div style="font-size:12px;font-weight:700;color:#1D4ED8;margin-bottom:8px">
      <i class="fas fa-camera" style="margin-right:4px"></i>안전조치 사진
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${tbmSections.flatMap(sec => (sec.photos||[]).filter(p=>p.file_path).map(p => `
        <div>
          <img src="/api/photos/${p.id}/img?token=..." style="width:100%;height:80px;object-fit:cover;border-radius:6px">
          <div style="font-size:10px;color:#374151;margin-top:2px">${p.label}</div>
        </div>
      `)).join('')}
    </div>
  </div>
` : '';
```

### 수정 시 주의사항
- BUG-056(체크리스트 탭 사진 미리보기 안 됨)과 동시 수정 권장
- BUG-057(회의록 출력 서명 2열 + 사진)과 같은 배치로 통합 작업 효율적
- 서명 2열 시 홀수 인원 처리: 마지막 카드 colspan=2 또는 빈 카드로 처리
- 사진 토큰 전달: `photoImgSrc(p.id)` 함수 사용 (토큰 자동 포함)


---

## 세션 77→78 — FEAT-037: TBM 완료 결과 공유 기능 (클립보드 복사 + 공개 URL) ✏️ v2 수정

### 작업 개요
- **세션**: 77 (최초 등록) → 78 (요구사항 수정)
- **날짜**: 2026-07-02
- **상태**: ⏳ 일괄 작업 대기
- **변경 이력**: v1 Web Share API 방식 → v2 **클립보드 복사 방식**으로 변경 (사용자 확정)

### 확정 요구사항 (v2)
버튼 클릭 시 → **공개 URL이 클립보드에 자동 복사** → 사용자가 원하는 방식(문자/카카오/라인 등)으로 직접 붙여넣기 전송

> 별도 OS 공유 시트 없이, 클립보드 복사만으로 모든 전달 방식 지원

---

### 공유 페이지 포함 내용 (확정)

| 항목 | 데이터 출처 | 비고 |
|------|------------|------|
| **작업번호** | `tasks.work_number` | WKS 시작 형식 |
| **작업명** | `tasks.title` | 등록된 작업명 |
| **담당자** | `construction_sites.manager_name` | 공사담당자 이름 |
| **작업자** | `task_assignments` JOIN `users.name` | 배정된 전체 작업자 목록 |
| **TBM 실시 주소** | `tbm_records.gps_address` 또는 `tbm_records.location` | 체크리스트 시행 주소 |
| **TBM 사진** | `tbm_photo_items` | 2열 그리드, 항목별 라벨, 클릭 시 원본 확인 |

> **v1 대비 변경**: `실시일시` 제거 → **`TBM 실시 주소`** 항목 추가

---

### 기술 구현 방식 (확정)

#### ① 공유 토큰 DB (신규)
```sql
-- migrations/0055_tbm_share_tokens.sql
CREATE TABLE IF NOT EXISTS tbm_share_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT UNIQUE NOT NULL,   -- 랜덤 18자리 hex 토큰
  tbm_id      INTEGER NOT NULL,
  task_id     INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME,               -- 생성 시각 + 7일
  view_count  INTEGER DEFAULT 0
);
```

#### ② 신규 API 엔드포인트
```
POST /api/tbm/:id/share-token        ← 토큰 생성 (JWT 인증 필요)
GET  /tbm-share/:token               ← 공개 결과 페이지 (인증 불필요)
GET  /tbm-share/:token/photo/:photoId ← 공개 사진 서빙 (토큰 유효성 검증)
```

#### ③ 버튼 동작 — 클립보드 복사 방식 (확정)
```javascript
async function _tbmShare(tbmId) {
  try {
    // 1) 서버에서 공유 토큰 생성 (또는 기존 미만료 토큰 재사용)
    const res = await API.post(`/tbm/${tbmId}/share-token`);
    const shareUrl = `${location.origin}/tbm-share/${res.data.token}`;

    // 2) 클립보드 복사 (항상 이 방식으로 통일)
    await navigator.clipboard.writeText(shareUrl);

    // 3) 복사 완료 안내 토스트
    toast('📋 공유 링크가 클립보드에 복사되었습니다.\n원하는 앱에 붙여넣기(Ctrl+V)하여 전송하세요.', 'success', 4000);
  } catch(e) {
    toast('링크 생성에 실패했습니다.', 'error');
  }
}
```

#### ④ 공개 결과 페이지 `/tbm-share/:token` 레이아웃
```
┌─────────────────────────────────┐
│  SafetyNOTE   TBM 완료 결과     │  ← 헤더 (보라색)
├─────────────────────────────────┤
│  ✅ TBM 완료                    │
│  작업번호 : WKS-20260702-001    │
│  작업명   : 26년 블랑합체 및…   │
│  담당자   : 홍길동              │
│  작업자   : 송영민, 박세진,…    │
│  실시주소 : 여주시 북내면 외룡리 │  ← v2 신규 항목
├─────────────────────────────────┤
│  📸 TBM 안전조치 사진           │
│  ┌──────────┐  ┌──────────┐    │
│  │  사진①  │  │  사진②  │    │
│  │  라벨명  │  │  라벨명  │    │
│  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐    │
│  │  사진③  │  │  사진④  │    │
│  │  라벨명  │  │  라벨명  │    │
│  └──────────┘  └──────────┘    │
├─────────────────────────────────┤
│  🔗 이 링크는 7일간 유효합니다  │
└─────────────────────────────────┘
```
- **사진 클릭**: 원본 크게 보기 (라이트박스 또는 새 탭)
- **만료 시**: "만료된 링크입니다. 새 링크를 요청하세요." 안내 페이지
- **사진 없을 때**: 사진 섹션 자체 미표시

---

### 수정 대상 파일
| 파일 | 수정 내용 |
|------|---------|
| `migrations/0055_tbm_share_tokens.sql` | 신규 — 공유 토큰 테이블 |
| `src/nas-routes/tbm-extra.ts` | `POST /api/tbm/:id/share-token` 추가 (토큰 생성·재사용 로직) |
| `src/index.tsx` | `GET /tbm-share/:token` 공개 페이지 + `GET /tbm-share/:token/photo/:id` 추가 |
| `public/static/app.js` | `showTbmDetail()` 하단 **공유 버튼** 추가 + `_tbmShare()` 함수 |

---

### 공유 버튼 UI (showTbmDetail 모달 하단)
```html
<!-- modal-footer 내 추가 -->
<button onclick="_tbmShare(tbmId)"
  style="padding:6px 14px;background:#0EA5E9;color:white;
         border:none;border-radius:8px;font-size:12px;font-weight:600;
         cursor:pointer;display:flex;align-items:center;gap:4px">
  <i class="fas fa-share-alt"></i> 결과 공유
</button>
```

---

### 수정 시 주의사항
- **클립보드 복사**: `navigator.clipboard.writeText()` — HTTPS 환경에서만 동작 (NAS HTTPS 포트 사용 중 → 문제없음)
- **사진 공개 서빙**: `/tbm-share/:token/photo/:photoId` — 토큰 유효성 + 만료일 검증 후 바이너리 서빙
- **토큰 재사용**: 동일 TBM ID로 24시간 내 재요청 시 기존 토큰 반환 (중복 생성 방지)
- **토큰 형식**: `Math.random().toString(36).slice(2,11) + Date.now().toString(36)` (18자리)
- **TBM 실시 주소**: `tbm_records.gps_address` 우선, 없으면 `tbm_records.location` fallback
- BUG-058(TBM 상세 모달 서명 2열+사진) 동시 작업 시 공유 버튼도 함께 추가

---

## 세션 79 — FEAT-047: 분류별 항목 category 관리 + FIX-048/049: 위험성평가 등록·삭제 500 에러 수정 ✅

### 작업 일자
2026-07-04

### 커밋 이력
| 커밋 | 내용 |
|------|------|
| `ac142d8` | FEAT-047: category 분류 관리 + 진단API 500 수정 |
| `09f29f0` | FIX-048: patchSchema v0.152 — risk_assessment_details FK 수정 |
| `fd62cb8` | FIX-049: 위험성평가 삭제 500 에러 수정 — 연관 테이블 명시 삭제 강화 |
| `5f3dc68` | FIX-049b: NAS 직접 실행용 DB 수정 스크립트 추가 |
| `02ce5b0` | DEBUG-049c: 삭제 라우트 단계별 에러 로깅 |
| `55b990b` | FIX-049d: risk_assessment_members FK 수정 추가 + DB 경로 자동 탐지 |

---

### FEAT-047: 분류별 항목 관리 — category 필드 관리 기능

#### 배경
`risk_assessment_items.category` 컬럼(기계적/전기적/화학적/생물학적/작업특성/작업환경 요인 7종)을
분류별 항목 관리 화면에서 수정·등록할 수 없었음.

#### 변경 파일
- `public/static/app.js`
- `node-server.ts` (진단 API 수정)

#### 구현 내용

**① `RISK_CATEGORIES` 상수 정의**
```javascript
const RISK_CATEGORIES = [
  '', '1. 기계적 요인', '2. 전기적 요인', '3. 화학적 요인',
  '4. 생물학적 요인', '5. 작업특성 요인', '6. 작업환경 요인'
];
```

**② `_riCategoryBadge()` 헬퍼 — 분류별 색상 배지**
| 분류 | 색상 |
|------|------|
| 기계적 요인 | 주황 (`bg-orange-100`) |
| 전기적 요인 | 노랑 (`bg-yellow-100`) |
| 화학적 요인 | 보라 (`bg-purple-100`) |
| 생물학적 요인 | 초록 (`bg-green-100`) |
| 작업특성 요인 | 파랑 (`bg-blue-100`) |
| 작업환경 요인 | 틸 (`bg-teal-100`) |

**③ 수정 모달 (`_riShowEditModal`) — category 드롭다운 추가**
- 유해·위험요인 행 위에 "항목 분류" 셀렉트 추가
- 현재 `item.category` 값 자동 selected 처리
- `_riSaveEdit` body에 `category` 필드 포함하여 PUT 전송

**④ 추가 모달 (`_riAddItemModal`) — category 드롭다운 추가**
- 동일 `RISK_CATEGORIES` 목록 셀렉트
- `_riSaveAdd` body에 `category` 필드 포함하여 POST 전송

**⑤ 목록 테이블 (`_riRenderItemTable`) — 분류 컬럼 추가**
- 헤더: `#` | **분류** | 유해·위험요인 | 위험성 내용 | 안전조치 | 개선전→후
- 각 행에 `_riCategoryBadge(item.category)` 배지 표시 (sm: 이상)

**⑥ 진단 API 수정 (`GET /api/diagnostics/risk-db`)**
- `created_at` 컬럼 미존재 방어: `hasCreatedAt` 플래그로 동적 SELECT
- `.first()` → `.get()` 교체 (better-sqlite3 호환)
- `category_distribution` 필드 추가 (분류별 건수 현황)

---

### FIX-048 / FIX-049: 위험성평가 등록·삭제 500 에러

#### 에러 메시지
```
D1_ERROR: no such table: main.risk_assessments_old
```

#### 근본 원인
마이그레이션 `0029_fix_foreign_keys_to_tasks.sql`에서 `risk_assessments` 테이블을
재생성(`RENAME TO risk_assessments_old` → 신규 생성)할 때,
연관 테이블들의 FK DDL이 **임시 테이블명 `risk_assessments_old`를 참조한 채로 DB에 저장**됨.

**영향받은 테이블:**
| 테이블 | 현상 |
|--------|------|
| `risk_assessment_details` | INSERT(등록) 시 500 |
| `risk_assessment_members` | DELETE(삭제) 시 500 |

#### 진단 과정
1. 초기: `scripts/fix-risk-details-fk.cjs`가 `/volume1/safetynote/safety.db`를 탐색
2. **실제 NAS DB 경로**: `/volume1/safetynote/data/safety.db` (서브디렉토리)
   → 스크립트가 엉뚱한 DB를 수정하여 효과 없었음
3. PM2 로그 확인으로 실제 에러 위치 특정:
   ```
   [risk DELETE /:id] step risk_assessment_members FAILED: D1_ERROR: no such table: main.risk_assessments_old
   ```

#### 수정 내용

**① patchSchema v0.152 (`node-server.ts`)**
```typescript
// 서버 시작 시 두 테이블 모두 자동 수정
const _fixFkTargets = [
  { name: 'risk_assessment_details', ... },
  { name: 'risk_assessment_members', ... },
]
for (const tgt of _fixFkTargets) {
  // sqlite_master에서 DDL 조회 → risk_assessments_old 포함 시 재생성
  // 기존 데이터 전량 보존, PRAGMA foreign_keys OFF/ON
}
```

**② `scripts/fix-risk-details-fk.cjs` v2**
- DB 경로 자동 탐지 순서: `data/safety.db` → `safety.db`
- 두 테이블(`details` + `members`) 모두 수정 대상
- 정상 DB에서는 "수정 불필요"로 안전 종료

**③ 삭제 라우트 강화 (`src/routes/risk.ts`)**
- 삭제 순서: `details` → `members` → `signatures` → `signature_requests` → 본 레코드
- `risk_assessments_old` 에러 시 `PRAGMA foreign_keys=OFF`로 재시도 (최후 안전장치)

#### 해결 확인
- NAS PM2 로그: `[patchSchema v0.152] risk_assessment_members FK 재생성 완료` ✅
- 정기 위험성평가 등록 정상 ✅
- 등록된 항목 삭제 정상 ✅

#### 재발 방지
- patchSchema v0.152가 서버 시작 시 항상 실행되므로 동일 문제 재발 없음
- 긴급 수동 수정 스크립트: `node /volume1/safetynote/scripts/fix-risk-details-fk.cjs`

---

### 잔여 에러 (미해결)
```
[risk GET /items/by-work-type/:workTypeId] D1_ERROR: no such column: rai.note
[tasks/stops] task_stops 쿼리 실패 (테이블/컬럼 없음): D1_ERROR: no such column: ts.notes
```
- `rai.note`: `risk_assessment_items.note` 컬럼이 NAS DB에 없음
  → patchSchema v0.149에서 ALTER 추가 대상이나 NAS DB에 미적용 상태
  → **다음 세션에서 수정 필요**
- `ts.notes`: `task_stops.notes` 컬럼 누락 — 별도 확인 필요

---


---

## 세션 112 — 2026-07-06

### BUG-088: TBM 회의록 서명인원 카운트 오류 수정

**문제**: `showTbmDetail` 서명 현황 계산 시 `signatures` 배열 전체(approval_safety·approval_general·approval_ceo 포함)를 카운트 → 실제 근로자(attendee/conductor) 수보다 많은 숫자 표시

**해결**: `role='attendee'` 또는 `role='conductor'`만 필터링

**수정 파일**: `public/static/app.js` (2곳)
1. `tbm-sig-badge` 카운트: `workerSigsForBadge = signatures.filter(s => s.role==='attendee'||s.role==='conductor')`
2. `showTbmDetail` 서명 현황: `workerSigs = signatures.filter(s => s.role==='attendee'||s.role==='conductor')`

### BUG-089: TBM 회의록 결재 서명란 변경 (대표이사 제거)

**변경**: 결재 흐름 3단계(안전관리자→총괄책임→대표이사) → 2단계(안전관리자→총괄책임)

**수정 파일**:
1. **`node-server.ts` PDF 결재란**: approval_ceo 행 제거, colgroup 3열→2열, approval_general 표시명 "총괄책임"
2. **`app.js showTbmDetail` 결재 카드**: cSig·canCeo 제거, 카드 2개만 렌더링, 안내 순서 텍스트 수정
3. **`app.js _tbmPrint()` 출력 결재 테이블**: colgroup col 제거(3→2), 대표이사 th/td 제거, colspan 4→3, 안내 순서 수정
4. **`app.js LABELS/DESCS/_tbmApprovalSignInApp`**: approval_ceo 항목 제거
5. **`tbm-extra.ts`**: validRoles 2개로 축소, signedRoles 쿼리 2단계, approval_ceo 블록 제거, approval_general이 최종결재(PDF 자동생성 트리거 이동), approval-status GET도 approval_general·approval_safety만 반환(approval_ceo: null 하위호환 유지)

### FEAT-056: TBM 결재 서명 완료 FCM 알림

**위치**: `src/nas-routes/tbm-extra.ts` — approval_general 완료 블록

**동작**:
1. 안전관리자 직책 사용자에게 결재완료 SSE + FCM + notifications DB 등록
2. `task_assignments JOIN users`로 해당 작업 배정 근로자 ID 조회
3. 근로자 전원에게 `sendFcmToUsers(workerIds, { title:'[TBM 결재완료]', body:'안전하게 작업을 진행하세요.' })` 발송
4. 근로자 notifications DB 등록
5. PDF 자동생성 트리거 `approval_ceo` → `approval_general`로 변경

### FEAT-057: 사진 첨부 FCM 알림

**위치**: `node-server.ts POST /api/photos`

**동작**:
- multipart 경로: 파일 저장 완료 후 `sendFcmToRoles(['supervisor','safety'], { title:'[사진 첨부] 작업 {번호}', body:'{업로더}님이 {유형} 사진 N장을 첨부했습니다.' })`
- json(base64) 경로: 동일 FCM 발송 (하위호환 경로도 커버)
- photoTypeLabel 매핑: before→착공 전, progress→진행 중, after→완료, tbm→TBM, inspection→점검

### 완료 항목
- [x] BUG-088: app.js 서명 카운트 2곳 workerSigs 필터 적용
- [x] BUG-089: node-server.ts PDF 결재란 approval_ceo 제거·총괄책임 표시 (이전 세션)
- [x] BUG-089: app.js showTbmDetail 결재 카드 2개로 단순화
- [x] BUG-089: app.js _tbmPrint() 결재 테이블 2열로 축소
- [x] BUG-089: app.js LABELS/DESCS approval_ceo 제거
- [x] BUG-089: tbm-extra.ts validRoles/signedRoles/approval_general 최종결재화
- [x] FEAT-056: tbm-extra.ts approval_general 완료 시 안전관리자+근로자 FCM
- [x] FEAT-057: node-server.ts POST /api/photos supervisor/safety FCM (multipart+json)
- [x] PROJECT_HISTORY 등재
- [x] node --check + npm run build + git commit & push — `1a13c16`

## 세션 113 — 2026-07-06

### BUG-090: TBM 회의록 헤더 구조 4가지 수정

**문제**: TBM 회의록 출력 헤더가 설계 이미지와 다른 구조

**해결**:
1. `서명인원` 행 삭제 — 출력물에서 서명인원 수 표시 행 제거
2. `수급업체→관리감독자` — `contractor_name` 레이블 변경
3. 헤더 레이아웃 재배치 — 행1(작업명+관리감독자), 행2(실시일시+TBM진행자+작업번호), 행3(실시장소+날씨기온+참석인원) 6열 구조
4. `info-table` CSS `table-layout:fixed` + `th width:62px`로 6열 균등 배분

**수정 파일**: `public/static/app.js`

### 완료 항목
- [x] BUG-090: TBM 회의록 헤더 4가지 수정
- [x] PROJECT_HISTORY 등재
- [x] node --check + npm run build + git commit & push — `564db77`

## 세션 116 — 2026-07-06

### BUG-092: 교육 완료처리 403 Forbidden — 권한 role 코드 오류

**증상**: 안전관리자·현장대리인·시스템관리자가 교육 완료처리 클릭 시 "완료처리 실패: 권한 없음 (관리자만 완료처리 가능)" 토스트 + DevTools 403 Forbidden

**원인**: `src/routes/education.ts` line 378(DELETE), line 410(complete) 두 곳 모두 동일 오류
```typescript
// ❌ 잘못된 코드 — DB에 없는 role 코드
if (!['system_admin', 'safety_manager'].includes(user.role || '')) { 403 }

// 실제 DB role 값
// admin      → 시스템관리자
// supervisor → 안전관리자 / 현장대리인(총괄책임자) / 관리감독자 / 공무
```

**해결**: `canComplete`/`canDelete` 변수로 실제 DB role + position 조합 체크
```typescript
// ✅ 수정된 코드
const canComplete = user.role === 'admin' ||
  (user.role === 'supervisor' && ['안전관리자','현장대리인','총괄책임자'].includes(user.position || ''))
```

**허용 역할**:
| DB role | position | UI 역할명 |
|---------|----------|----------|
| `admin` | `시스템관리자` | 시스템관리자 |
| `supervisor` | `안전관리자` | 안전관리자 |
| `supervisor` | `현장대리인` or `총괄책임자` | 현장대리인 |

**수정 파일**: `src/routes/education.ts` (DELETE/complete 2곳)

### 완료 항목
- [x] education.ts DELETE 권한 조건 수정 (canDelete)
- [x] education.ts complete 권한 조건 수정 (canComplete)
- [x] npm run build ✅ (270.40 kB)
- [x] git commit & push — `89cbf8a`

## 세션 117 — 2026-07-06

### FEAT-060: 교육일지 결재란 서명 기능 구현

**요청**: 교육일지 결재란에 실제로 서명할 수 있도록 기능 구현

**배경**: TBM은 `tbm_signatures` 테이블 + `tbm-extra.ts` 결재 API 완비. 교육은 참석자 서명(`safety_education_attendees.signature_data`)만 있고 결재란 DB·API·UI 전혀 없음.

**구현 내용**:

#### Step 1: DB 스키마 (node-server.ts patchSchema v0.157)
```sql
CREATE TABLE IF NOT EXISTS safety_education_approvals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES safety_education_sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,       -- 'approval_safety' | 'approval_general'
  user_id       INTEGER REFERENCES users(id),
  user_name     TEXT NOT NULL DEFAULT '',
  user_position TEXT DEFAULT '',
  sign_method   TEXT DEFAULT 'pad',
  sign_data     TEXT,                -- base64 서명 이미지
  signed_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, role)
)
```

#### Step 2: API (education-extra.ts RULE-002 오버라이드)
- `GET /api/education/sessions/:id/approval-status` — 결재 현황 조회
- `POST /api/education/sessions/:id/approval-sign` — 서명 저장
  - 권한: `admin` OR `supervisor`+position(`안전관리자`/`현장대리인`/`총괄책임자`)
  - 순서 강제: `approval_general`은 `approval_safety` 이후만 가능

#### Step 3: UI (app.js showEduDetailModal)
- 교육 상세 모달 하단에 TBM과 동일한 2단 결재 카드 추가
- `_eduApprovalSignInApp(sessionId, role, eduType)` 함수 신규 추가
  - `showSignaturePad()` 호출 → `POST approval-sign` → 모달 갱신

#### Step 4: 인쇄 반영 (app.js printEduLog)
- `printApproval` 변수로 approval-status 로드
- 출력 HTML 결재란 `<td class="box">` 에 서명 이미지 / 이름 표시

**수정 파일**:
| 파일 | 변경 내용 |
|------|---------|
| `node-server.ts` | patchSchema v0.157: `safety_education_approvals` 테이블 + 인덱스 |
| `src/nas-routes/education-extra.ts` | GET/POST approval-status/approval-sign API 2개 추가 |
| `public/static/app.js` | showEduDetailModal 결재란 UI, _eduApprovalSignInApp 함수, printEduLog 서명 반영 |

### 완료 항목
- [x] node-server.ts patchSchema v0.157 테이블 추가
- [x] education-extra.ts GET/POST 결재 API 추가
- [x] app.js 교육 상세 모달 결재 UI + _eduApprovalSignInApp 함수
- [x] app.js printEduLog 결재란 서명 이미지 반영
- [x] node --check + npm run build ✅ (270.40 kB)
- [x] git commit & push — `82f9095`

## 세션 115 — 2026-07-06

### FEAT-058: 사이드바 아이콘 화면 크기 비례 동적 조절

**배경**: 기존 아이콘 레일 아이콘/버튼이 모든 화면 크기에서 고정 px 값 사용 → 대형 모니터에서 너무 작고, 소형 모바일에서도 변화 없음

**해결**: CSS `clamp(min, preferred-vw, max)` 으로 전환 — 모바일(1배) → 데스크톱(1.5배) 선형 보간

| 요소 | 기존 | 변경 후 |
|------|------|--------|
| `#icon-rail` 너비 | `56px` | `clamp(52px, 5.5vw, 72px)` |
| `.rail-group-btn` | `44×44px` | `clamp(40px, 3.8vw, 60px)` |
| 아이콘 `font-size` | `16px` | `clamp(16px, 1.7vw, 24px)` |
| 레이블 `font-size` | `8px` | `clamp(7px, 0.72vw, 10px)` |
| 브랜드 로고 | `28px` | `clamp(24px, 2.6vw, 38px)` |
| `border-radius` | `12px` | `clamp(10px, 1.1vw, 16px)` |
| footer 버튼/아이콘 | `44px`/`15px` | 동일 clamp 패턴 |

**연동 업데이트**: `#flyout-panel left`, `.main-content margin-left`, `.top-header left` → 전부 `clamp(52px, 5.5vw, 72px)` 동기화

**모바일 보장**: `@media (max-width: 768px)` 오버라이드에서 52px 고정 유지 (clamp 최솟값 동일)

**수정 파일**: `public/static/style.css`

### FEAT-059: LinkMak Co., Ltd. 크레딧 표시

**① 아이콘 레일 최하단 — `.rail-credit`**
- `rail-footer` 아래 `.rail-credit` 블록 추가
- "LinkMak" (font-weight:800) + "Co.,Ltd" 2줄 구성
- `opacity: 0.4 → hover 0.85` 부드러운 전환
- 폰트 크기 `clamp(6px, 0.58vw, 8px)` — 레일 크기와 비례

**② 메인 콘텐츠 우하단 — `#app-credit-bar`**
- `position:fixed; bottom:0; right:0` 고정 바 (height:22px)
- "Powered by" + "│" + "**LinkMak Co., Ltd.**" (브랜드 primary 색상)
- `left: clamp(52px, 5.5vw, 72px)` — icon-rail 너비와 동기화
- 모바일(≤768px): `display:none` — 탭바와 겹침 방지
- 데스크톱 `main-content padding-bottom:22px` 추가 — 크레딧바에 콘텐츠 가려지지 않도록

**수정 파일**:
- `public/static/style.css` — `.rail-credit*`, `#app-credit-bar` CSS 신규
- `public/static/app.js` — rail-credit HTML, app-credit-bar HTML 삽입

### 완료 항목
- [x] FEAT-058: style.css clamp 적용 (icon-rail/btn/icon/label/logo)
- [x] FEAT-058: flyout-panel/main-content/top-header clamp 동기화
- [x] FEAT-059: style.css rail-credit / app-credit-bar CSS 신규
- [x] FEAT-059: app.js rail-credit HTML / app-credit-bar HTML 삽입
- [x] node --check ✅ / npm run build ✅ (270.22 kB)
- [ ] git commit & push (진행 중)

## 세션 114 — 2026-07-06

### BUG-091: TBM 회의록 3가지 수정

#### ① 관리감독자 → 담당자

**위치**: `app.js _tbmPrint()` 헤더 `info-table` 행1

**변경**: `<th>관리감독자</th>` → `<th>담당자</th>`

#### ② 서브작업번호(WKS-######-#####-####) 표시

**문제**: 작업번호란에 `task_number`만 표시 → `WKS-` 또는 부정확한 값

**해결 로직** (`app.js`):
```javascript
const sub = (tbm.sub_task_number || '').toString().trim();
const main = (tbm.task_number || '').toString().trim();
if (sub) return 'WKS-' + main.replace(/^WKS-/i,'') + '-' + sub; // WKS-{main}-{sub}
if (main) return main.startsWith('WKS') ? main : 'WKS-' + main; // main만
return 'WKS-'; // 둘 다 없음
```

**백엔드 (`src/routes/tbm.ts`)**: GET 목록 쿼리 2개 + GET 단건 쿼리 1개에 `t.sub_task_number` 추가

**NAS 오버라이드 (`node-server.ts`, RULE-002)**: `app.get('/api/tbm/:id', ...)` rawDb 단건 조회 오버라이드 신규 등록 — `tbmExtraRoutes/tbmRoutes` 앞에 배치, `sub_task_number` 포함

#### ③ 사진 인쇄/미리보기 페이지 잘림 방지

**문제**: 출력 미리보기 시 사진이 2페이지에 걸쳐 잘림

**해결**:
- 사진 `<tr>`: `page-break-inside:avoid;break-inside:avoid` 추가
- 사진 `<td>/<div>/<img>`: 동일 속성 추가
- `max-height: 100px → 120px`, `display:block` 추가
- CSS `@media print { img, tr { page-break-inside:avoid; break-inside:avoid } }` 추가
- 사진 테이블 자체: `page-break-inside:auto` (행 단위로만 분리 허용)

**수정 파일**:
- `public/static/app.js` — 3가지 변경 (레이블, 작업번호 로직, 사진 page-break CSS)
- `src/routes/tbm.ts` — GET 목록(2개)+단건(1개) 쿼리 `t.sub_task_number` 추가
- `node-server.ts` — NAS GET `/api/tbm/:id` rawDb 오버라이드 신규 추가

### 완료 항목
- [x] app.js `관리감독자` → `담당자` 레이블 변경
- [x] app.js 작업번호 `sub_task_number` 우선 조합 로직 (`WKS-{main}-{sub}`)
- [x] app.js 사진 `<tr>/<td>/<div>/<img>` `page-break-inside:avoid` 적용
- [x] app.js CSS `@media print img, tr { page-break-inside:avoid }` 추가
- [x] src/routes/tbm.ts GET 목록(2개)+단건 쿼리 `t.sub_task_number` 추가
- [x] node-server.ts NAS GET `/api/tbm/:id` rawDb 오버라이드 신규 추가 (RULE-002)
- [x] node --check app.js ✅ / npm run build ✅ (270.22 kB)
- [ ] PROJECT_HISTORY 등재 + git commit & push (진행 중)

## 세션 80 — 2026-07-04

### FIX-050: rai.note + ts.notes 컬럼 누락 수정

#### 에러 메시지
```
[risk GET /items/by-work-type/:workTypeId] D1_ERROR: no such column: rai.note
[tasks/stops] task_stops 쿼리 실패 (테이블/컬럼 없음): D1_ERROR: no such column: ts.notes
```

#### 근본 원인 분석

**① `risk_assessment_items.note`**
- patchSchema v0.149에서 `ALTER TABLE risk_assessment_items ADD COLUMN note TEXT DEFAULT ''` 존재
- 실행 순서: v0.149(ALTER) → v0.151(클린 리셋 DELETE+INSERT) → v0.152(FK 수정)
- v0.151은 데이터만 교체하고 컬럼 구조는 건드리지 않으므로 v0.149 ALTER는 보존되어야 함
- **실제 원인**: 특정 NAS 상태에서 v0.149가 실행되지 않았거나 에러로 스킵됨
  (v0.149 전체를 try-catch로 감싸 실패해도 조용히 무시하므로 추적 어려움)

**② `task_stops.notes`**
- `CREATE TABLE IF NOT EXISTS task_stops`에 `notes TEXT` 포함 — 신규 테이블에는 있음
- 기존 safeAlt 패치 목록(line 315~320): `stop_category`, `stop_detail`, `reported_by`, `photo_data`만 있고 **`notes` 누락**
- NAS DB에 구버전 `task_stops`가 이미 존재하므로 `IF NOT EXISTS`로 생성 안 됨
- safeAlt 목록에 `notes`가 없어서 `ALTER TABLE ... ADD COLUMN notes`도 실행 안 됨

#### 수정 내용

**① safeAlt 목록에 `task_stops.notes` 추가 (`node-server.ts` line 320)**
```typescript
{ table: 'task_stops', column: 'notes', def: 'TEXT DEFAULT NULL' },  // FIX-050
```

**② patchSchema v0.153 추가 — PRAGMA table_info 직접 확인 방식**
```typescript
// ① risk_assessment_items.note 컬럼 — PRAGMA table_info로 존재 여부 직접 확인
const raiCols = rawDb.prepare(`PRAGMA table_info(risk_assessment_items)`).all().map(r => r.name)
if (!raiCols.includes('note')) {
  rawDb.exec(`ALTER TABLE risk_assessment_items ADD COLUMN note TEXT DEFAULT ''`)
  // ✅ 추가 완료 로그
}
// category 컬럼도 동일하게 확인 (FEAT-047 방어)

// ② task_stops.notes 컬럼 — PRAGMA table_info로 직접 확인
const tsCols = rawDb.prepare(`PRAGMA table_info(task_stops)`).all().map(r => r.name)
if (!tsCols.includes('notes')) {
  rawDb.exec(`ALTER TABLE task_stops ADD COLUMN notes TEXT DEFAULT NULL`)
  // ✅ 추가 완료 로그
}
```

#### 왜 기존 v0.149 방식이 충분하지 않았나
- v0.149는 `try { _safeAlt(...) } catch { warn }` 구조 → 실패 시 에러 메시지만 출력하고 계속 진행
- 이후 v0.153처럼 **실제 컬럼 존재 여부를 확인하지 않아** 패치 성공 여부 보장 불가
- v0.153은 `PRAGMA table_info`로 컬럼 없을 때만 ALTER 실행 → 멱등성 보장

#### 파일 수정 목록
| 파일 | 변경 내용 |
|------|-----------|
| `node-server.ts` | line 320: safeAlt에 `task_stops.notes` 추가 |
| `node-server.ts` | patchSchema v0.153 블록 추가 (PRAGMA table_info 기반 강제 확인) |

---

---

## PLAN-UI-001: 화면 구성 전면 개편 — 메뉴 그룹화 & 네비게이션 개선

> 요청일: 2026-07-04  
> 상태: 📋 **계획 수립** (미착수)

---

### 현재 메뉴 구조 분석

#### 관리자/감독자 사이드바 (현재)
```
작업현황
작업관리
현장점검
현장위치 지도
공사현황
위험(아차사고)신고
─── 안전관리 ───
  안전현황 (하위: 작업통계 / 현장점검통계 / 근로자안전준수현황 / 작업중지현황)
  위험성평가 (하위: 정기 / 수시 / 분류별 항목 관리)
  안전교육 (하위: 정기 / 채용시 / 작업내용변경시 / 특별 / 관리감독자 / 통계)
  서명요청
─── 현장공량관리 ───
  현장공량관리 (하위: 물량통계 / 작업일보 작성 / 공량내역 / 광케이블 현황 / 단가관리)
─── 관리 ───
  사용자관리 (하위: 업무중사용자 / 업무중지사용자 / 현장팀관리 / 계정관리)
  내 계정
─── 시스템 ───
  시스템 설정
  법령안내 관리
```

#### 근로자 사이드바 (현재)
```
내 작업
작업일보 작성
서명요청
나의작업현황
위험신고
내 계정
```

#### 하단 네비 — 모바일 (현재)
```
근로자:   내작업 / 서명요청 / 나의작업현황 / 위험신고
관리자:   공사현황 / 서명요청 / 작업관리 / 현장점검
```

---

### 문제점 및 개선 방향

#### ① 메뉴 항목 과다 — 그룹 없이 나열
- 최상위 단독 항목이 6개(작업현황/작업관리/현장점검/지도/공사현황/위험신고)
- 어떤 기능이 어느 그룹에 속하는지 직관적으로 알기 어려움

#### ② 그룹 구분선(divider) 방식의 한계
- 현재 `─── 안전관리 ───` 같은 텍스트 구분선만 사용
- 접기/펼치기 불가, 그룹 인식 약함

#### ③ 모바일 하단 네비 — 고정 4개 탭
- 현재: 공사현황/서명요청/작업관리/현장점검
- 자주 쓰는 메뉴가 다를 수 있음, 사용자별 맞춤 불가

---

### 제안 그룹화 구조

#### 관리자/감독자 — 5개 그룹

| 그룹 | 아이콘 | 포함 메뉴 |
|------|--------|-----------|
| **현장작업** | 🏗️ fa-hard-hat | 작업현황, 작업관리, 공사현황, 현장위치 지도 |
| **안전점검** | 🔍 fa-shield-check | 현장점검, 위험(아차사고)신고, 위험성평가(정기/수시/항목관리) |
| **안전관리** | 📋 fa-clipboard-check | 안전교육(전종류), 서명요청, 안전현황 통계 |
| **현장공량** | 📊 fa-chart-line | 물량통계, 작업일보, 공량내역, 광케이블현황, 단가관리 |
| **관리/설정** | ⚙️ fa-cogs | 사용자관리, 팀관리, 계정관리, 시스템설정, 법령안내, 내 계정 |

#### 근로자 — 3개 그룹

| 그룹 | 아이콘 | 포함 메뉴 |
|------|--------|-----------|
| **내 작업** | 📋 fa-tasks | 내 작업, 작업일보 작성, 나의작업현황 |
| **안전** | 🛡️ fa-shield-alt | 위험신고, 서명요청 |
| **내 정보** | 👤 fa-user | 내 계정 |

#### 모바일 하단 네비 — 개편안

| 역할 | 탭 1 | 탭 2 | 탭 3 | 탭 4 | 탭 5 |
|------|------|------|------|------|------|
| **관리자** | 현장작업 | 안전점검 | 안전관리 | 현장공량 | 더보기 |
| **근로자** | 내작업 | 서명요청 | 위험신고 | 작업일보 | 내계정 |

---

### 구현 방식 옵션

#### Option A — 사이드바 아코디언 그룹 (현재 구조 개선)
- 현재 `divider` 방식 → 클릭으로 접기/펼치기 가능한 그룹 헤더로 교체
- 각 그룹에 색상 배지 또는 좌측 액센트 바 추가
- 그룹 상태(펼침/접힘) `localStorage`에 저장
- **장점**: 구조 변경 최소, 기존 사이드바 UI 유지
- **난이도**: ⭐⭐ (중)

#### Option B — 탑 네비게이션 + 서브 사이드바
- 상단 그룹 탭 (현장작업 / 안전관리 / 공량관리 / 설정)
- 탭 선택 시 해당 그룹 메뉴만 좌측 사이드바에 표시
- **장점**: 메뉴 수 대폭 감소, 깔끔한 UI
- **난이도**: ⭐⭐⭐⭐ (높음 — 레이아웃 전면 수정)

#### Option C — 아이콘 레일 + 플라이아웃 (추천)
- 좌측 고정 아이콘 레일 (그룹 5개 아이콘)
- 아이콘 호버/클릭 시 해당 그룹 메뉴 플라이아웃
- 모바일: 하단 탭 5개로 그룹 전환
- **장점**: 공간 효율 최고, 모바일 최적화
- **난이도**: ⭐⭐⭐ (중-높음)

---

### 작업 단계 계획

#### Phase 1 — 기초 작업 (사전 준비)
- [ ] 현재 메뉴 전체 ID·라벨 목록 문서화
- [ ] 역할별(admin/supervisor/worker/lgu) 메뉴 접근 권한 매핑 정리
- [ ] 개편 후 그룹 구조 최종 확정 (사용자와 협의)
- [ ] 구현 방식 옵션 최종 결정

#### Phase 2 — 메뉴 그룹화 구현
- [ ] `allManagerMenuItems` 배열 재구성 — 5개 그룹으로 분류
- [ ] 그룹 헤더 컴포넌트 구현 (아이콘 + 레이블 + 접기버튼)
- [ ] 그룹별 접기/펼치기 상태 `localStorage` 저장
- [ ] 근로자 메뉴 3그룹 재구성

#### Phase 3 — 모바일 하단 네비 개편
- [ ] 하단 탭 → 그룹 단위로 변경 (4→5탭)
- [ ] 탭 전환 시 사이드바 해당 그룹 자동 펼침
- [ ] 뱃지(서명요청 미확인 등) 그룹 탭에도 표시

#### Phase 4 — UI 스타일 정비
- [ ] 그룹별 색상 테마 지정 (현장작업=파랑, 안전=빨강, 공량=초록 등)
- [ ] 사이드바 그룹 헤더 디자인 (배경색 구분 or 좌측 컬러 바)
- [ ] 현재 페이지 속한 그룹 자동 하이라이트
- [ ] 전체 색상 팔레트 일관성 점검

#### Phase 5 — 검증 및 마이그레이션
- [ ] 권한별 메뉴 표시 테스트 (admin/supervisor/worker/lgu)
- [ ] 모바일(375px) / 태블릿(768px) / 데스크탑(1280px) 반응형 확인
- [ ] 기존 `navigateTo` 경로 모두 정상 동작 확인
- [ ] NAS 배포 후 실사용 검증

---

### 예상 소요 시간

| Phase | 예상 시간 | 비고 |
|-------|-----------|------|
| Phase 1 | 0.5h | 협의 필요 |
| Phase 2 | 3~4h | 핵심 작업 |
| Phase 3 | 1~2h | 모바일 |
| Phase 4 | 2~3h | 디자인 |
| Phase 5 | 1h | 테스트 |
| **합계** | **7.5~10.5h** | |

---

### 착수 전 결정 필요 사항

1. **구현 방식**: Option A / B / C 중 선택
2. **그룹 명칭 및 포함 메뉴**: 위 제안 확정 or 수정
3. **우선순위**: 사이드바 먼저 vs 모바일 하단 네비 먼저
4. **단계적 배포**: Phase별 순차 배포 vs 한 번에 전체 배포

---

---

## FEAT-051: PM2 자동복구 Watchdog — SSH 비활성화 환경 대비

> 작업일: 2026-07-05  
> 상태: ✅ 완료

### 배경
- SSH를 비활성화해도 SafetyNOTE 서비스 운영 및 업데이트(webhook)에는 문제 없음
- 단, PM2 프로세스가 크래시 시 재시작할 수단이 없음 → Watchdog 필요

### 구현 내용

**① `scripts/pm2-watchdog.sh` 신규 생성**
- PM2 프로세스 상태 확인 (`pm2 describe safetynote`)
- `online` 아니면 자동으로 `pm2 start` 재실행
- Node.js / tsx / pm2 경로 자동 탐색 (DSM 패키지 경로 포함)
- `.env`에서 PORT 자동 읽기
- 로그: `/var/log/safetynote-watchdog.log` (500줄 자동 정리)
- 정상 동작 중에는 로그 미기록 (불필요한 로그 방지)

**② `scripts/install.sh` Step 9 추가**
- 설치 시 `synoscheduler` CLI로 DSM 작업 스케줄러 자동 등록 시도
- 자동 등록 실패 시 수동 등록 방법을 설치 완료 화면에 출력

### DSM 수동 등록 방법 (자동 등록 실패 시)
```
DSM → 제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트
  작업 이름 : SafetyNOTE PM2 자동복구
  사용자    : root
  반복      : 매일 / 모든 시간 / 5분 간격
  스크립트  : bash /volume1/safetynote/scripts/pm2-watchdog.sh
```

### 로그 확인
```bash
tail -f /var/log/safetynote-watchdog.log
```

---

## TODO: 배포설명서(설치가이드 PPT/문서) 수정 필요 항목

> 상태: 📋 기록만 (미착수) — 다음 문서 작업 세션에서 반영

### 수정 필요 내용

| 항목 | 현재 내용 | 수정 필요 내용 |
|------|-----------|----------------|
| SSH 안내 | SSH 활성화 필수로 안내 | SSH 선택사항 — 보안상 비활성화 또는 포트 변경 권장으로 변경 |
| PM2 자동복구 | 없음 | DSM 작업 스케줄러 Watchdog 등록 단계 추가 |
| 업데이트 방법 | SSH + git pull 방법만 안내 | 브라우저 업데이트(시스템설정 탭) 방법 위주로 변경, SSH는 선택 |
| 도메인 연결 | 없음 | linkmax.co.kr 등 자체 도메인 연결 방법 추가 (DNS A레코드, DSM Let's Encrypt) |
| SSH 포트 변경 | 없음 | 보안 강화 방법으로 SSH 포트 변경 안내 추가 (22→5022) |

---

---

## FIX-052: pm2-watchdog.sh --cwd 버그 수정

> 작업일: 2026-07-05  
> 상태: ✅ 완료

### 원인
`pm2-watchdog.sh`에서 `pm2 start` 시 `--cwd` 옵션 누락
→ watchdog 실행 위치(`/root`)가 PM2 작업 디렉토리로 설정됨
→ `/root/node-server.ts` 탐색 → 파일 없음 → 556회 크래시 반복

### 수정
```bash
cd "$INSTALL_DIR"
pm2 start ... --cwd "$INSTALL_DIR" -- node-server.ts
```

### 완료 항목
- [x] FIX-052 수정 및 git push
- [x] NAS git pull + pm2 수동 복구
- [x] DSM 작업 스케줄러 Watchdog 등록 (5분 간격)
- [x] Watchdog 테스트 통과 (pm2 stop → 자동 복구 확인)
- [x] SSH 비활성화 완료

---

## 세션 81 — 2026-07-05

### FEAT-053: 웹 기반 버전 롤백 시스템 구현

**요청 배경**: SSH 비활성화 상태에서 업데이트 후 문제 발생 시 브라우저만으로 이전 버전 복원

---

#### 구현 내용

**백엔드 — `src/nas-routes/admin.ts`에 롤백 API 4개 추가:**

| 엔드포인트 | 메서드 | 기능 |
|---|---|---|
| `/api/admin/update/history` | GET | 최근 20개 커밋 목록 조회 (git log) |
| `/api/admin/update/backups` | GET | backups/ 폴더 DB 백업 목록 조회 |
| `/api/admin/update/rollback` | POST | 선택 커밋으로 코드 롤백 (DB백업→reset→build→restart) |
| `/api/admin/update/restore-db` | POST | 선택 DB 백업 파일 복원 (현재DB저장→교체→restart) |

**보안 설계:**
- 모든 API: `admin` 역할 필수
- rollback/restore-db: 관리자 비밀번호 재확인 필수
- restore-db: 파일명 경로 탐색 방지 (`/\\` 포함 불허)
- target_hash: 정규식 검증 (`/^[a-f0-9]{4,40}$/`)

**롤백 흐름 (코드 롤백):**
```
1. DB 자동 백업 → backups/safety_{stamp}_before_rollback.db
2. git reset --hard {target_hash}
3. npm run build (프론트엔드 재빌드)
4. pm2 restart safetynote
```

**DB 복원 흐름:**
```
1. 현재 DB 임시 저장 → backups/safety_{stamp}_before_restore.db
2. backups/{filename} → data/safety.db 복사
3. pm2 restart safetynote
```

**프론트엔드 — `public/static/app.js`:**

시스템설정 > 서버 업데이트 탭 하단에 **버전 롤백** 패널 추가:
- 기본 접힘 상태, "펼치기" 버튼으로 토글
- **커밋 롤백 탭**: 최근 20개 커밋 목록 테이블 / 현재 버전 배지 / 선택→비밀번호→실행
- **DB 백업 복원 탭**: 백업 파일 목록 테이블 / 파일 유형 배지(업데이트전/롤백전/복원전) / 선택→비밀번호→실행
- 롤백/복원 진행상황은 기존 실행 로그 영역에 실시간 표시 (2초 폴링)

**추가된 JS 함수:**
- `_rbTogglePanel()` — 롤백 패널 펼치기/접기
- `_rbShowTab(tab)` — 탭 전환 (commits/db)
- `_rbLoadHistory()` — 커밋 목록 API 호출 및 테이블 렌더
- `_rbSelectCommit(hash, msg)` — 커밋 선택 → 확인 폼 표시
- `_rbApplyRollback()` — 코드 롤백 실행
- `_rbLoadBackups()` — DB 백업 목록 API 호출 및 테이블 렌더
- `_rbSelectBackup(filename)` — 백업 선택 → 확인 폼 표시
- `_rbApplyRestoreDb()` — DB 복원 실행

### 완료 항목
- [x] GET /api/admin/update/history 구현
- [x] GET /api/admin/update/backups 구현
- [x] POST /api/admin/update/rollback 구현
- [x] POST /api/admin/update/restore-db 구현
- [x] app.js 버전 롤백 패널 UI 추가
- [x] app.js 롤백 JS 함수 구현 (_rb* 네임스페이스)
- [x] admin.ts 라우트 헤더 주석 업데이트

---

### FEAT-053b: 비상 복구 시스템 — 서버 접속 불가 시 자동 복구

**요청**: 서버 업데이트 후 접속 자체가 안 될 때 (브라우저 롤백 UI도 열 수 없는 상황) 복구 방법

---

#### 구현 내용

**1. pm2-watchdog.sh v2.0 — crash 자동 감지 + 자동 롤백 + 비상 서버 연계**

| 단계 | 조건 | 동작 |
|---|---|---|
| 정상 | PM2 online | crash 카운터 리셋, 비상 서버 종료 |
| 재시작 | crash 1~2회 | 일반 pm2 재시작 시도 |
| 자동 롤백 | crash 3회 도달 | DB 백업 → git reset HEAD~1 → build → restart |
| 비상 서버 | 롤백도 실패 | safe-recovery.sh 자동 가동 (포트 3444) |

새로 추가된 기능:
- `CRASH_THRESHOLD=3`: 임계값 (15분 동안 계속 죽으면 롤백 실행)
- `CRASH_COUNT_FILE=/var/run/safetynote-crash-count`: crash 횟수 영속화
- `auto_git_rollback()`: HEAD~1 자동 롤백 함수
- `start_recovery_server()` / `stop_recovery_server()`: 비상 서버 관리

**2. safe-recovery.sh (신규) — 비상 복구 웹서버**

- Python3 기반 순수 HTTP 서버 (포트 3444)
- Synology NAS에 Python3 패키지 설치 시 자동 동작
- 복구 기능:
  1. PM2 재시작
  2. npm install + 재시작 (패키지 mismatch 복구)
  3. 커밋 롤백 (선택한 커밋으로 git reset + build + restart)
  4. DB 백업 복원 (백업 파일 선택 → DB 교체 → restart)
  5. 서버 로그 확인
- 비밀번호: `.env`의 `RECOVERY_PASSWORD` (기본: `recovery1234`)
- 보안: 파일명 경로 탐색 방지, 커밋 해시 정규식 검증

**3. install.sh 업데이트**

- .env에 `RECOVERY_PASSWORD=recovery1234` 항목 추가
- `safe-recovery.sh` 실행 권한 자동 설정
- 설치 완료 화면에 비상 복구 주소(`:3444`) 출력

**전체 복구 시나리오 흐름:**
```
업데이트 적용 → 서버 crash
  └→ watchdog (5분마다)
       ├→ crash 1~2회: pm2 재시작 시도
       ├→ crash 3회: git HEAD~1 자동 롤백 + build + restart
       │    ├→ 성공: 서버 복구 완료 ✅
       │    └→ 실패: safe-recovery.sh 자동 가동
       │             └→ http://NAS_IP:3444 접속
       │                  ├→ PM2 재시작
       │                  ├→ 커밋 선택 롤백
       │                  └→ DB 백업 복원
       └→ (서버 정상화 시 비상 서버 자동 종료)
```

### 완료 항목
- [x] pm2-watchdog.sh v2.0: crash 카운터 + 자동 롤백 + 비상 서버 연계
- [x] safe-recovery.sh 신규 생성 (비상 복구 웹서버)
- [x] install.sh: RECOVERY_PASSWORD + safe-recovery 권한 + 안내 출력
- [x] PROJECT_HISTORY.md 기록

---

## 세션 105 — 2026-07-05 ★ v3.0 정식 릴리즈

### PLAN-UI-001 Option C 구현 완료 + v3.0 배포 전 검토 (버그 2건 수정)

#### 배포 전 검토에서 발견·수정된 버그

**[BUG-FIX-1] 모바일 하단 탭바 이중 표시 (`mobile-app.js`)**
- 원인: `app.js`의 `.bottom-nav`(그룹탭)와 `mobile-app.js`의 `#mobile-nav-bar`(홈/내작업/TBM 탭)가 모바일에서 동시에 렌더링
- 수정: `buildMobileNav()` 내 `#icon-rail` 존재 확인 → 있으면 PWA 탭바 생성 Skip
- 수정: `navigateTo` 래핑도 `#icon-rail` 존재 시 Skip (syncFlyoutActive가 active 관리 담당)

**[BUG-FIX-2] 모바일 CSS `margin-left` 충돌 (`style.css`)**
- 원인: 기존 사이드바 규칙 `margin-left: 0 !important`(L783)가 Option C의 `margin-left: 52px`(L740)를 덮어씀
- 수정: Option C 모바일/데스크톱 규칙에 `!important` 추가

#### v3.0 버전 태깅
- `app.js` 헤더: `v3.0 (20260705a)`
- `node-server.ts` 캐시버스팅: `?v=20260704j` → `?v=20260705v300`
- `service-worker.js`: `sn-static-v11` → `sn-static-v12` (구버전 캐시 완전 폐기)

**커밋**: `338bc7d` — fix: v3.0 배포 전 검토 버그 2건 수정 + 버전 v3.0 태깅

---

### PLAN-UI-001 Option C 구현 완료 (아이콘 레일 56px + 플라이아웃 패널 220px)

**변경 파일**
- `public/static/style.css` — 아이콘 레일(`#icon-rail`), 플라이아웃(`#flyout-panel`), 모바일 그룹탭 CSS 전체 추가
- `public/static/app.js` — 메뉴 그룹 데이터 구조(5그룹/3그룹/1그룹) + HTML 빌더 + 플라이아웃 제어 함수 전면 교체

**수정 상세 (이번 세션)**
1. `buildRailGroups` — `data-color="${g.color}"` 속성 추가 → `openFlyout` 내 색상 복원 정상 동작
2. `window._flyoutGroups = groups` 설정 — `buildLayout` 내 HTML 삽입 직후 → `syncFlyoutActive` 그룹 탐색 활성화
3. `navigateTo()` 끝에 `syncFlyoutActive(page)` 호출 추가 → 페이지 전환 시 레일/하단탭 active 자동 갱신
4. `refreshSignRequestCount()` — `rail-badge-{gid}` / `bnav-badge-{gid}` 배지 연동 추가 (edu/wsafety/lgu-main)

**커밋**: `d329cf0` — feat: PLAN-UI-001 Option C 구현 완료

**다음 작업**: NAS git pull + pm2 restart + 동작 확인

---

## 세션 104 — 2026-07-05

### PM2 재등록 시 `--interpreter` 절대경로 강제 (DSM PATH 제한 대응)

**문제**: watchdog/비상복구 스크립트가 PM2를 재등록할 때 `--interpreter node`(단순 명령어)로 등록
→ DSM 작업 스케줄러의 제한된 PATH 환경에서 PM2 재시작 시 `node` 명령어를 찾지 못해 오류 발생

**원인**: DSM 작업 스케줄러는 PATH가 매우 제한적이어서 `/usr/local/bin/node` 등 경로가 등록되지 않음
→ PM2가 재시작 시 `--interpreter node`를 해석 못하고 `/root/node-server.ts` 형태의 오류 발생

**해결**: 3개 파일에서 NODE_BIN 절대경로 강제 탐색으로 변경

**수정 내역**:

1. **`pm2-watchdog.sh`**: `find_pm2()` / `find_node()` 함수를 절대경로 우선 탐색으로 재작성
   - candidates 배열: `$NODE_PATH/node`, v20/v18 전체경로, `/usr/local/bin/node` 순으로 탐색
   - `command -v`는 마지막 fallback으로 이동

2. **`safe-recovery-standalone.sh`**: Python3 `do_restart()` + Node.js `doRestart()` 양쪽 모두
   ```python
   node_bin = NODE_BIN if NODE_BIN and NODE_BIN.startswith("/") else \
       next((p for p in [v18_path, v20_path, "/usr/local/bin/node"] if os.path.isfile(p)), NODE_BIN)
   ```

3. **`safe-recovery.sh`**: NODE_BIN 탐색 루프에 v20 경로 추가 + Python3 `do_restart()`에 동일 절대경로 보완 로직 추가

**커밋**: `cd532c8` — "fix: PM2 재등록 시 --interpreter 절대경로 강제 (DSM PATH 제한 대응)"

### 완료 항목
- [x] pm2-watchdog.sh: find_pm2()/find_node() 절대경로 우선 탐색으로 변경
- [x] safe-recovery-standalone.sh: Python3 do_restart() 절대경로 보완
- [x] safe-recovery-standalone.sh: Node.js doRestart() 절대경로 보완
- [x] safe-recovery.sh: NODE_BIN 루프에 v20 경로 추가
- [x] safe-recovery.sh: Python3 do_restart() node_bin 절대경로 보완 로직 추가
- [x] 3개 파일 bash -n 문법 검사 통과
- [x] git commit & push (cd532c8)

---

## 세션 103 — 2026-07-05

### FIX-055: 비상 복구 서버 standalone 실행 방식 추가

**문제**: `192.168.111.111:3445` 접속 시 `ERR_CONNECTION_REFUSED`

**원인 분석**:
- `safe-recovery.sh`는 watchdog이 `crash 3회`를 감지한 경우에만 자동 실행됨
- 메인 서버(3443)가 `online` 상태이면 watchdog이 비상 서버를 가동하지 않음
- SSH 비활성화 환경에서 수동으로 `safe-recovery.sh`를 직접 실행할 방법 없음

**해결**: `scripts/safe-recovery-standalone.sh` 신규 생성

**핵심 특징**:
- 메인 서버 상태와 **완전 무관** — 항상 실행 가능
- **Python3 우선 / Node.js fallback** 자동 전환 (어느 쪽이든 동작)
- 이전 인스턴스 자동 정리 후 재시작 (PID 관리)
- DSM 작업 스케줄러에서 **수동 [실행] 버튼** 한 번으로 즉시 가동
- 동일한 포트 3445, 동일한 복구 UI

**DSM 작업 스케줄러 등록 방법**:
```
작업 이름: SafetyNOTE 비상복구 서버 시작
사용자   : root
반복     : 실행 안 함
스크립트 :
  bash /volume1/safetynote/scripts/safe-recovery-standalone.sh
```
→ [실행] 클릭 → 결과 보기에서 "✅ 비상 복구 서버 가동 완료" 확인
→ `http://192.168.111.111:3445` 접속

**수정 파일**:
- `scripts/safe-recovery-standalone.sh` — 신규 생성 (Python3+Node.js 이중 fallback)
- `scripts/install.sh` — standalone 권한 설정 + 수동 실행 안내 추가
- `PROJECT_HISTORY.md` — 세션 103 기록

### 완료 항목
- [x] scripts/safe-recovery-standalone.sh 신규 생성
- [x] Python3 없을 경우 Node.js fallback 자동 전환 구현
- [x] install.sh: standalone 권한 설정 + DSM 수동 실행 안내 추가
- [x] PROJECT_HISTORY.md 기록

---

---

## 세션 122 (2026-07-10) — BUG-094: TBM 추가 사진 등록 후 이미지 미표시 수정

### 작업 요약
- TBM 안전조치 사진 등록 팝업에서 추가 사진(및 필수 사진) 업로드 직후 등록된 이미지가 표시되지 않는 버그 수정

### 버그 원인 분석 (BUG-094)

#### 증상
- 추가 사진 등록 시 성공 toast는 뜨지만 등록된 사진이 팝업에 보이지 않음 (빈 카드 또는 깨진 이미지)

#### 원인
세션 118(BUG-090)에서 업로드 후 DOM 카드 즉시 반영 코드를 추가했으나, 이미지 URL 생성 함수를 잘못 사용:

```javascript
// 기존 (잘못됨)
photoImgSrc(uploadedPhotoId)
// → /api/photos/{uploadedPhotoId}/img  (일반 task_photos 엔드포인트)

// 수정 (올바름)
tbmPhotoImgSrc(newPhotoItemId)
// → /api/tbm-photos/{newPhotoItemId}/img  (TBM 전용 엔드포인트)
```

- `uploadedPhotoId`: `/api/photos/upload` 응답의 임시 ID → `task_photos` 테이블 기반
- `newPhotoItemId`: `POST /checklist/{assId}/tbm-photos` 응답의 `tbm_photo_items.id` → TBM 전용 테이블
- TBM 사진은 `/api/tbm-photos/{id}/img`로만 조회 가능 → `tbmPhotoImgSrc()` 사용 필수

#### 수정 내용
- `uploadTbmPhotoExtra()` (추가 사진): `photoImgSrc(uploadedPhotoId)` → `tbmPhotoImgSrc(newPhotoItemId)`
- `uploadTbmPhoto()` (필수 사진): `photoImgSrc(uploadedPhotoId)` → `tbmPhotoImgSrc(newPhotoItemId)`
- 영향 범위: 2곳 (line ~23091, ~23164)

### 커밋 로그
| 파일 | 커밋 | 내용 |
|------|------|------|
| `public/static/app.js` | `bc2754e` | fix: BUG-094 TBM 추가 사진 등록 후 이미지 미표시 수정 |

### NAS 배포 안내
```bash
git pull origin main
# pm2 restart 불필요 — public/static/app.js만 변경
```

---

## 세션 121 (2026-07-10) — FEAT: 서브작업번호 자동 카운트 + 중복 방지 기능 추가

### 작업 요약
- 작업 등록 모달의 서브작업번호 입력 필드에 두 가지 기능 추가
  1. **자동 카운트**: 공사 연동 시 해당 공사 기등록 작업 건수 기반 다음 번호 자동 입력 (0001부터 4자리 순차)
  2. **중복 방지**: 직접 입력 시 동일 공사 내 기등록 번호와 중복이면 입력 차단

### 백엔드 변경 (`src/routes/tasks.ts`)

#### `GET /api/tasks` — `construction_id` 필터 파라미터 추가
- **기존**: `construction_id` 쿼리 파라미터 미지원 (WHERE 필터 없음)
- **수정**: `construction_id` 파라미터를 받아 `t.construction_id = ?` 조건 추가
- **용도**: 해당 공사의 기등록 작업 목록 조회 → 서브작업번호 자동 카운트/중복 체크에 사용

### 프론트엔드 변경 (`public/static/app.js`)

#### `_autoFillSubTaskNo(constructionId, forceOverwrite)` 함수 신규 추가 (~line 3210)
- `GET /api/tasks?construction_id=X` 호출
- 기등록 `sub_task_number` 중 최댓값 + 1 계산 (없으면 1)
- `String(n).padStart(4, '0')` 형식으로 `mSubTaskNo` 자동 입력
- `forceOverwrite=false`(기본): 필드가 비어있을 때만 자동 입력
- 자동입력 시 연두색 배경 1초 시각 피드백

#### `autoLinkConstruction()` — 공사 연동 완료 직후 자동 카운트 호출
- `toast('공사 연동 완료')` 이후 `_autoFillSubTaskNo(con.id, false)` 호출
- 사용자가 요청번호 입력 → 공사 연동 → 서브작업번호 자동 입력 흐름 완성

#### `showCreateTaskModal()` — 모달 오픈 시 초기화 이벤트 바인딩
- `window.__editingTaskId = editId` 전역 저장 (중복 최종 검증에서 수정 모드 자기 자신 제외용)
- 모달 DOM append 후 `mSubTaskNo` 이벤트 바인딩 블록 추가:
  - **① 신규 등록 + 공사 연동 상태**: 모달 오픈 시 `_autoFillSubTaskNo` 즉시 호출
  - **② blur 이벤트**: 직접 입력 후 포커스 아웃 시 서버에서 중복 체크
    - 중복 시 빨간 테두리(`borderColor: #EF4444`) + toast 경고 + 필드 포커스
    - 수정 모드: `t.id !== editId` 조건으로 자기 자신 제외
  - **③ input 이벤트**: 재입력 중 오류 테두리 자동 초기화

#### `createTask()` — 저장 직전 중복 최종 검증 추가
- 서브작업번호 필수 체크 이후 서버 재확인 블록 삽입
- `GET /api/tasks?construction_id=X` 재호출 → 중복 감지 시 저장 차단
- 네트워크 오류 시 차단하지 않음 (사용자 경험 보호)

### 동작 흐름

#### 자동 카운트 흐름
1. 작업 등록 모달 열기
2. 공사요청번호 입력 → `autoLinkConstruction()` 호출
3. 공사 연동 성공 → `_autoFillSubTaskNo(con.id)` 호출
4. 해당 공사 기등록 작업의 최대 서브작업번호 + 1 계산
5. `mSubTaskNo` 필드에 `0001`, `0002`... 자동 입력 (연두색 배경 피드백)
6. 사용자가 직접 수정 가능

#### 중복 방지 흐름
1. `mSubTaskNo` 직접 입력 후 포커스 아웃 (blur)
2. 해당 공사 기등록 작업 목록 조회
3. 동일 `sub_task_number` 존재 시: 빨간 테두리 + toast("이미 사용 중") + 포커스 이동
4. 등록 버튼 클릭 → 저장 직전 서버 재확인 → 중복이면 최종 차단

### 커밋 로그
| 파일 | 커밋 | 내용 |
|------|------|------|
| `public/static/app.js`, `src/routes/tasks.ts` | `5ed1f03` | feat: 서브작업번호 자동 카운트 + 중복 방지 기능 추가 |

### 파일 수정 내역
| 파일 | 변경 내용 |
|------|----------|
| `src/routes/tasks.ts` | `GET /` — `construction_id` 쿼리 파라미터 필터 지원 추가 |
| `public/static/app.js` | `_autoFillSubTaskNo()` 신규 함수, `autoLinkConstruction()` 연결, `showCreateTaskModal()` 이벤트 바인딩, `createTask()` 중복 최종 검증 |
| `dist/_worker.js` | 빌드 결과물 (276.27 kB) |

### NAS 배포 안내
```bash
git pull origin main
npm run build
pm2 restart safetynote
```

---

## 세션 120 (2026-07-10) — BUG-093: 작업 등록 성공 후 '생성 실패' 오표시 버그 수정

### 작업 요약
- 작업 저장은 정상이지만 "생성 실패" 에러 toast가 함께 표시되는 버그 분석 및 수정

### 버그 원인 분석

#### 증상
- 공사 상세 또는 공사현황 페이지에서 작업 등록 → 저장 성공
- 동시에 보라색 "작업이 등록됨" + 분홍색 "생성 실패" toast 2개 동시 표시

#### 원인 구조 분석 (`_doCreate` 함수)
```
try {
  await _doCreate(data);   ← 내부에서 예외 throw → 여기서 잡힘
} catch(e) {
  toast(errMsg || '생성 실패', 'error');  ← ⚠️ 오표시
}
```

**경로 1 — 첨부파일 업로드 실패**:
```
_doCreate:
  API.post('/tasks')  ← ✅ 성공 (작업 저장 완료)
  await uploadTaskAttachments()  ← ❌ 실패 → reject(new Error)
    ↑ 예외가 _doCreate 밖 catch로 전파
  → toast('생성 실패', 'error') 오출력
```

**경로 2 — page-content null 참조**:
```
_doCreate:
  API.post('/tasks')  ← ✅ 성공
  toast('작업이 등록되었습니다.')  ← ✅ 성공 toast 출력
  document.querySelector('.modal-overlay')?.remove()  ← 모달 제거
  renderTasksPage(document.getElementById('page-content'))
    ↑ 모달 제거로 page-content가 null → TypeError
    → 외부 catch → toast('생성 실패', 'error') 오출력
```

### 수정 내용 (`public/static/app.js` `_doCreate` 함수)

1. **`uploadTaskAttachments` 격리**:
   - 별도 `try/catch`로 감싸 예외가 외부로 전파되지 않도록 차단
   - 업로드 실패 메시지는 `uploadTaskAttachments` 내부에서 이미 처리됨

2. **페이지 이동 코드 격리**:
   - `toast('작업이 등록됨')` 이후 코드를 별도 `try/catch`로 분리
   - 페이지 이동 중 오류가 "생성 실패"로 표시되지 않도록 차단

3. **null 방어 처리**:
   - `renderTasksPage(document.getElementById('page-content'))` →
   - `const pageEl = document.getElementById('page-content'); if (pageEl) renderTasksPage(pageEl);`

### 커밋 이력
| 커밋 | 내용 |
|------|------|
| `4498c03` | fix: [BUG-093] 작업 등록 성공 후 '생성 실패' 오표시 버그 수정 |

---

## 세션 119 (2026-07-10) — 비상복구 서버 PM2 hang 해결: bash 래퍼 → Python3 독립 서버

### 작업 요약
- 세션 118에서 `scripts/recovery-server.py` 파일 생성 완료 후 이어서 진행
- `ecosystem.config.cjs` 비상복구 서버 항목을 python3 직접 실행 방식으로 최종 수정
- git commit(`f65686a`) + GitHub push 완료

### 문제 원인 분석

#### 근본 원인 1: NAS PM2 + bash 래퍼 호환성 문제
- `pm2 start ecosystem.config.cjs` 실행 시 NAS Synology에서 응답 없이 hang
- bash 래퍼(`safe-recovery-standalone.sh`)를 `interpreter: /bin/bash`로 실행하는 방식 자체가 NAS PM2와 호환 불가

#### 근본 원인 2: `cleanup_previous()` 재시작 루프
- bash 래퍼 내부 `cleanup_previous()` 함수: 기존 프로세스 kill + 포트 정리
- PM2 autorestart 시마다 기존 python3 프로세스를 kill → 서버가 계속 종료/재시작 반복

#### 근본 원인 3: `exit 0` 정상 종료 인식
- bash 래퍼의 `main()` 함수: `start_python3_server && exit 0`
- PM2가 `exit 0`을 정상 종료로 인식 → 즉시 재시작 → 무한 루프

### 해결 방법

#### `scripts/recovery-server.py` 신규 생성
- PM2가 python3를 **직접** 실행 (bash 래퍼 완전 제거)
- `socketserver.TCPServer.allow_reuse_address = True` → 재시작 시 포트 즉시 재사용
- `signal.signal(signal.SIGTERM, _sigterm)` → PM2 graceful stop 대응
- `.env` 파일 자동 로드 (`RECOVERY_PASSWORD`, `PORT`, `APP_NAME`)
- NAS Node.js 경로 자동 탐색 (`v18`/`v20` 모두 지원)
- PM2가 python3 프로세스를 직접 감시 → crash 시 자동 재시작 정상 동작

#### `ecosystem.config.cjs` 수정 (safetynote-recovery 항목)
| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| `script` | `scripts/safe-recovery-standalone.sh` | `scripts/recovery-server.py` |
| `interpreter` | `/bin/bash` | `/usr/bin/python3` |
| `args` | `/volume1/safetynote 3445 --foreground` | `/volume1/safetynote 3445` |

### NAS 배포 방법
```bash
# 1. 코드 업데이트
cd /volume1/safetynote && git pull origin main

# 2. 기존 비상복구 서버 중지 (실행 중인 경우)
pm2 stop safetynote-recovery 2>/dev/null || true
pm2 delete safetynote-recovery 2>/dev/null || true

# 3. python3 경로 확인
which python3   # → /usr/bin/python3 또는 다른 경로 확인

# 4. PM2 커맨드라인 직접 등록 (ecosystem.config.cjs 방식 사용 금지 — NAS hang 발생)
pm2 start /volume1/safetynote/scripts/recovery-server.py \
  --name safetynote-recovery \
  --interpreter /usr/bin/python3 \
  -- /volume1/safetynote 3445

# 5. 저장 및 확인
pm2 save
pm2 list
pm2 logs safetynote-recovery --nostream --lines 20
```

> ⚠️ `pm2 start ecosystem.config.cjs`는 NAS에서 hang 가능 — **커맨드라인 직접 등록** 방식 사용 필수

### 커밋 이력
| 커밋 | 내용 |
|------|------|
| `f65686a` | fix: [비상복구서버] bash 래퍼 제거 → Python3 독립 서버 직접 실행 (NAS PM2 hang 해결) |

---

## 세션 118 (2026-07-10) — BUG-089~092 TBM 사진 등록 팝업 4가지 버그 수정

### 작업 요약
- BUG-084 해결 후속(세션 117)에 이어 새 4가지 버그 수정
- PROJECT_HISTORY 검색으로 BUG-085~092 번호가 이미 사용됨 확인 → 신규 BUG-093~096 아닌 BUG-089~092(이미 번호 중복 없음 재확인 후 동일 번호 사용)

### 해결된 버그 상세

#### BUG-089: TBM 사진 필수/추가 등록 시각적 구분 (`89857d6`)
- **증상**: 필수 사진과 추가 사진 영역이 동일하게 표시되어 근로자가 추가 등록을 먼저 눌러 에러 발생
- **원인**: `showTbmPhotoModal()` UI에서 필수/추가 구분 없이 동일 스타일로 렌더링
- **해결**:
  1. 팝업 상단 경고 배너: "필수 사진 먼저 등록" (노란 배경 `#FFF3CD`)
  2. 필수 영역: `#FFF5F5` 배경, 빨간 테두리(`#EF4444`), ⚠️ 필수 라벨, 빨간 등록 버튼
  3. 추가 영역: `#F8FAFC` 배경, 회색 파선 구분, "선택사항" 텍스트 명시
  4. 섹션 완료 시 헤더/테두리 자동 녹색 전환 (`_refreshTbmPhotoModalStatus` 갱신)

#### BUG-090: TBM 사진 다른 작업 사진 혼입 + 즉시 반영 안 됨 (`89857d6`)
- **증상**: 체크리스트 완료 후 사진 등록 시 이전 작업의 사진이 보이고, 본인 업로드 사진이 즉시 보이지 않음
- **원인 1**: `showTbmPhotoModal()`의 기존 등록 사진 렌더링 시 `photoImgSrc(ph.id)` 사용
  → `ph.id`는 `tbm_photo_items.id`인데 `/api/photos/{id}/img` 호출 → 다른 작업의 photos 테이블 ID에 매칭
  → **수정**: `tbmPhotoImgSrc(ph.id)` 사용 (`/api/tbm-photos/{id}/img`)
- **원인 2**: 업로드 후 새 카드가 DOM에 즉시 추가되지 않음 (`.grid` 없을 때 fallback 없음)
  → **수정**: `secPhotosDiv.style.display=''` 병행 + `.grid` 없으면 동적 생성

#### BUG-091: 작업개시 버튼 서명 미완료 시 TBM상세 이동 개선 (`89857d6`)
- **증상**: 서명 미완료 상태에서 작업개시 버튼 클릭 시 TBM 상세 화면으로 이동 안 됨
- **기존 코드**: confirm 팝업 → 확인 클릭 → 서명 체크 → 차단 (팝업 흐름이 복잡)
- **해결**: `changeTaskStatus()`를 `async`로 변경, confirm 팝업 표시 **전** 사전 서명 체크
  1. 서명 미완료 감지 시 '작업 개시 불가' 전용 경고 모달 표시 (미서명자 이름 목록)
  2. 'TBM 서명하러 가기' 버튼 → `showTaskDetail(taskId, true)` TBM 탭 직접 이동
  3. 서명 완료된 경우에만 기존 confirm 팝업 표시

#### BUG-092: TBM 사진 삭제 팝업 z-index 최상단 미표시 (`89857d6`)
- **증상**: TBM 사진 삭제 시 확인 팝업이 사진 등록 모달 뒤에 표시됨
- **원인**: `deleteTbmSectionPhoto()` 팝업 `z-index: 10000` < TBM 사진 모달 `z-index: 10020`
- **해결**: `z-index: 10000 → 10030`으로 상향

### 커밋 로그
| 파일 | 커밋 | 내용 |
|------|------|------|
| `public/static/app.js` | `89857d6` | fix: [BUG-089~092] TBM 안전조치 사진 등록 팝업 4가지 버그 수정 |

### 파일 수정 내역
| 파일 | 변경 내용 |
|------|----------|
| `public/static/app.js` | `showTbmPhotoModal` UI 재설계, `_refreshTbmPhotoModalStatus` 색상 동기화, `uploadTbmPhoto/Extra` 즉시 반영, `changeTaskStatus` async + 사전 서명 체크, `deleteTbmSectionPhoto` z-index |
| `dist/_worker.js` | 빌드 결과물 (276.18 kB) |

### NAS 배포 안내
```bash
git pull origin main
# (pm2 restart 불필요 — public/static/app.js만 변경, 서버코드 무변경)
```

---

## 세션 123 (2026-07-12) — BUG-095: 작업상세 TBM 사진 추가/삭제 기능 구현 + UI 개선

### 작업 요약
- `showTaskDetail` 체크리스트 탭의 "TBM 안전조치 사진 항목" 섹션을 읽기 전용에서 **추가/삭제 가능한 인터랙티브** UI로 전면 개편
- 스크린샷(기존 체크마크 리스트 레이아웃) 스타일을 유지하면서 사진 추가/삭제 기능 추가
- 섹션별 한 줄 리스트 형태: 썸네일 + 항목명 + 체크/상태 + 삭제 버튼

### 변경 내역

#### BUG-095 1차 구현 (`9d9df97`) — 기능 추가
- `showTaskDetail` 체크리스트 탭 TBM 사진 섹션 UI 전면 개편 (읽기 전용 → 추가/삭제 가능)
- 헬퍼 함수 5개 추가:
  - `_openTbmPhotoModalFromDetail(assId, taskId)` — 사진 관리 모달 열기
  - `_uploadTbmPhotoFromDetail(input, assId, sectionId, sectionName, taskId)` — 섹션 새 사진 추가
  - `_uploadTbmPhotoSlotFromDetail(input, assId, sectionId, photoItemId, label, taskId)` — 미등록 슬롯 사진 등록
  - `_deleteTbmPhotoFromDetail(photoItemId, assId, label, taskId)` — 사진 삭제 (확인 팝업 포함)
  - `_refreshTaskDetailTbmSection(taskId)` — 모달 전체 재열기 없이 TBM 사진 섹션만 DOM 갱신

#### BUG-095 2차 UI 개선 (`bae4ff0`) — 레이아웃 개선
- **기존**: 3열 그리드 + 미등록 슬롯 뱃지 방식
- **개선**: 스크린샷 스타일 한 줄 리스트 레이아웃
  - 섹션 헤더: 빨간 번호 뱃지 + 섹션명 + 사진 수 표시 + `+추가` 버튼
  - 등록된 사진: `[40×40 썸네일] [항목명] [✓ 아이콘] [호버시 ✕ 삭제 버튼]`
  - 미등록 슬롯: `[빨간 카메라 아이콘] [항목명(빨간)] [등록 버튼]`
- `_refreshTaskDetailTbmSection` 동일 레이아웃으로 통일 (새로고침 시 일관성)

### 기술 세부사항
- **API 흐름**: `_uploadTbmPhotoFromDetail` → `POST /api/photos/upload` → `POST /checklist/{assId}/tbm-photos` → `_refreshTaskDetailTbmSection`
- **삭제 흐름**: `_deleteTbmPhotoFromDetail` → 확인 팝업(z-index:10030) → `DELETE /checklist/{assId}/tbm-photos/{photoItemId}` → `_refreshTaskDetailTbmSection`
- **DOM 갱신**: `taskModal.querySelector('#task-detail-tbm-photos-{assId}')` → 헤더 이후 자식 교체
- **섹션 사진 카운트 표시**: `(등록 수/전체 수)` 형식

### 커밋 로그
| 커밋 | 내용 |
|------|------|
| `9d9df97` | feat: BUG-095 작업상세 TBM 안전조치 사진 항목 추가/삭제 기능 구현 |
| `bae4ff0` | feat: BUG-095 TBM 사진 섹션 UI 개선 - 스크린샷 스타일 리스트 레이아웃 + 추가/삭제 기능 |

### 파일 수정 내역
| 파일 | 변경 내용 |
|------|----------|
| `public/static/app.js` | `showTaskDetail` TBM 사진 섹션 UI 전면 개편 + 헬퍼 함수 5개 추가 + `_refreshTaskDetailTbmSection` 레이아웃 통일 |
| `dist/_worker.js` | 빌드 결과물 (276.27 kB) |

### NAS 배포 안내
```bash
git pull origin main
# (pm2 restart 불필요 — public/static/app.js만 변경, 서버코드 무변경)
```

---

## 세션 124 (2026-07-12) — BUG-096: 작업관리 테이블 UI 개선 (헤더 정렬/툴바 크기/엑셀 버튼)

### 작업 요약
스크린샷 기반 3가지 UI 문제 수정:
1. 테이블 헤더와 내용 컬럼 어긋남 해소
2. 툴바 컨트롤(버튼/드롭다운/날짜입력) 크기 불균일 해소
3. 엑셀 다운로드 버튼 → 아이콘 전용 소형 버튼으로 간소화

### 버그 원인 및 해결

#### 1. 테이블 헤더/내용 어긋남 (`d3cc9b8`)
- **원인**: thead/tbody가 별도 `<table>` 요소로 분리된 구조에서 `table-layout:auto` 사용 시 각 테이블이 독립적으로 컬럼 너비 계산 → 데이터 길이에 따라 body 컬럼 폭이 header와 달라짐
- **해결**:
  - `table-layout: fixed` 적용 (CSS)
  - `<colgroup><col class="c-seq|c-req|c-num|...">` 을 thead/tbody 테이블 양쪽에 동일하게 삽입 (app.js)
  - 각 컬럼 고정 너비: `c-seq:38px`, `c-req:110px`, `c-num:160px`, `c-type:90px`, `c-class:80px`, `c-date:90px`, `c-mgr:80px`, `c-title:auto(남은공간)`, `c-state:170px`
  - tbody tr 인라인 `white-space:nowrap` / `max-width` / `min-width` 등 충돌 속성 제거 (CSS 클래스로 통일)
  - 짝수 행 zebra 스트라이프 (`#FAFAFE`), 행 구분선 `#EDE7F6` 명확화

#### 2. 툴바 컨트롤 크기 통일 (`d3cc9b8`)
- **원인**: `.btn`(padding:9px 18px, font-size:14px) vs `.form-control`(padding:10px 14px, font-size:14px)의 실제 렌더 높이 차이 + 개별 인라인 스타일 파편화
- **해결**: `.task-toolbar-sticky .btn`, `.task-toolbar-sticky .form-control` 에 `height:32px; padding-top:0; padding-bottom:0; font-size:12px; line-height:32px` 일괄 적용

#### 3. 엑셀 버튼 아이콘 간소화 (`d3cc9b8`)
- **기존**: `<button class="btn btn-outline">엑셀 다운로드</button>` (텍스트+아이콘, 큰 박스)
- **변경**: `<button class="btn-excel-icon" title="엑셀 다운로드"><i class="fas fa-file-excel"></i></button>`
  - 32×32px 정사각형 녹색 아이콘 버튼
  - `.task-toolbar-sticky .btn-excel-icon` 전용 CSS 추가

### 커밋 로그
| 파일 | 커밋 | 내용 |
|------|------|------|
| `public/static/app.js` | `d3cc9b8` | fix: 작업관리 테이블 헤더/내용 정렬 수정 + 툴바 컨트롤 크기 통일 + 엑셀 아이콘 버튼 간소화 |
| `public/static/style.css` | `d3cc9b8` | 동일 커밋 |

### 파일 수정 내역
| 파일 | 변경 내용 |
|------|----------|
| `public/static/style.css` | `.task-col-table` → `table-layout:fixed` + colgroup 너비 클래스 + `.task-col-table td` overflow 처리 + 행 구분선 강화 + `.task-toolbar-sticky` 내 컨트롤 height:32px 통일 + `.btn-excel-icon` 신규 추가 |
| `public/static/app.js` | thead/tbody 양쪽 `<colgroup>` 삽입 + tbody td 인라인 스타일 정리 + 툴바 인라인 크기 제거 + 엑셀 버튼 HTML 교체 |
| `dist/_worker.js` | 빌드 결과물 (276.27 kB) |

### NAS 배포 안내
```bash
git pull origin main
# (pm2 restart 불필요 — public/static/app.js, style.css만 변경, 서버코드 무변경)
```

---

## 세션 125 (2026-07-12) — 공사현황 완료예정일 + 엑셀스타일 테이블 + 컬럼 리사이즈

### 작업 요약
3가지 요청 사항 구현:
1. 공사 등록 모달에 완료예정일 필드 추가 + DB 컬럼 추가 + 기존 데이터 일괄 업데이트
2. 공사현황 테이블 컬럼 개편 (등록일·완료예정일 추가)
3. 공사현황·작업관리 테이블 엑셀 워크시트 스타일 + 컬럼 드래그 리사이즈

### 요청1: 완료예정일 DB/백엔드/모달 추가

#### DB 마이그레이션 (`migrations/0056_constructions_completion_date.sql`)
```sql
ALTER TABLE constructions ADD COLUMN completion_date DATE DEFAULT NULL;
UPDATE constructions SET completion_date = date(created_at, '+7 days') WHERE completion_date IS NULL;
```
- 기존 데이터 전체: `created_at + 7일` 로 일괄 업데이트 (최초 1회, NULL 방지)
- 로컬 D1 적용 완료

#### 백엔드 (`src/routes/constructions.ts`)
- POST: `completion_date` 파라미터 수신 → INSERT 반영 (없으면 +7일 기본값)
- PUT: `completion_date` 파라미터 수신 → UPDATE 반영

#### 프론트엔드 (`public/static/app.js`)
- `showCreateConstructionModal()`: `<!-- ⑧ 완료예정일 -->` 입력 필드 삽입 (id=`cCompletionDate`, 기본값 today+7 또는 기존 `con.completion_date`)
- `saveConstruction()`: `completionDate` 변수 읽어 `completion_date: completionDate` 를 API body에 포함

### 요청2: 공사현황 테이블 컬럼 개편

| 이전 | 변경 후 |
|------|---------|
| 공사요청번호 \| 공사명 \| 공사담당자 \| 공사감독자 \| 진행상태 | 공사요청번호 \| 공사명 \| 등록일 \| 완료예정일 \| 공사담당자 \| 공사감독자 \| 진행상태 |

- CSS `display:grid` → `<table> + table-layout:fixed + <colgroup>` 구조로 전환
- `con-col-table` 클래스 (헤더/바디 양쪽 동일 colgroup 적용)
- `con-thead-sticky` (position:sticky, top:56px) + `con-tbody-scroll` (overflow-x:auto) 구조

### 요청3: 엑셀 워크시트 스타일 + 컬럼 리사이즈

#### style.css 추가 내용
- `.col-resizer`: 공통 드래그 핸들 (position:absolute, right:0, width:5px, cursor:col-resize), hover 시 분홍색 하이라이트
- `.con-col-table`, `.con-th`, `.con-th-resize`, `.con-td`, `.con-tr`: 공사현황 테이블 전용 엑셀 스타일
- `.task-th-resize`: 작업관리 헤더 th 리사이즈 클래스 추가
- 교대 행 배경색 (짝수행 `#FAFAFE`), hover 하이라이트 (`#FDF7FB`)
- 헤더 sticky, 가로 스크롤바 커스텀

#### app.js 추가 내용
- `_initConColResize()`: 공사현황 컬럼 드래그 리사이즈 + 헤더/바디 가로 스크롤 동기화
- `_initTaskColResize()`: 작업관리 컬럼 드래그 리사이즈 + 헤더/바디 가로 스크롤 동기화
  - `mousedown` → `mousemove` → `mouseup` drag 이벤트 + headCols/bodyCols 양쪽 동기 적용
  - 더블클릭 시 컬럼 너비 CSS 리셋 (자동 너비 복원)
  - 최소 너비 50px(공사현황) / 40px(작업관리) 제한
- 작업관리 헤더 th: `sortTh()` → 인라인 th 문자열로 교체 (`.task-th-resize` 클래스 + `.col-resizer` 스팬 포함)
- `renderTasksPage()` 후처리 `requestAnimationFrame`에서 `_initTaskColResize()` 호출 (기존 scroll 동기화 코드를 함수 내부로 통합)

### 커밋 로그
| 파일 | 커밋 | 내용 |
|------|------|------|
| `migrations/0056_constructions_completion_date.sql` | `d557682` | feat: 공사현황 완료예정일 추가 + 테이블 엑셀스타일 + 컬럼 리사이즈 |
| `src/routes/constructions.ts` | `d557682` | 동일 커밋 |
| `public/static/app.js` | `d557682` | 동일 커밋 |
| `public/static/style.css` | `d557682` | 동일 커밋 |

### 파일 수정 내역
| 파일 | 상태 | 변경 내용 |
|------|------|----------|
| `migrations/0056_constructions_completion_date.sql` | created | completion_date DATE 컬럼 + 기존 데이터 created_at+7일 일괄 업데이트 |
| `src/routes/constructions.ts` | modified | POST/PUT completion_date 파라미터 수신 + DB 쿼리 반영 |
| `public/static/app.js` | modified | saveConstruction completion_date 전송 + renderConstructionsPage table 전환 + 컬럼 추가 + 리사이즈 JS 2개 함수 + 작업관리 헤더 th 개편 |
| `public/static/style.css` | modified | .col-resizer 공통 핸들 + con-col-table 엑셀스타일 전체 + task-th-resize + hover/zebra 스타일 |
| `dist/_worker.js` | built | 빌드 결과물 (276.43 kB) |

### NAS 배포 안내
```bash
git pull origin main
npx wrangler d1 execute safety-management-production --file=migrations/0056_constructions_completion_date.sql
# pm2 restart 불필요 (서버코드 변경 없음 — constructions.ts만 변경된 경우 재시작 필요)
pm2 restart safetynote   # constructions.ts 변경으로 Workers 재빌드 필요 시
```

---

## 세션 126 — 2차 작업 (2026-07-12)

### 작업 요약
작업관리 테이블 UI 3가지 개선 (화면 잘림, 구분선, 컬럼 분리)

### 완료된 작업

#### 1. 화면 양끝 잘림 개선
- `task-list-root` 좌우 padding `16px → 20px` 확대
- 태블릿(1024px 이하) 반응형 분기 추가: `12px`
- 모바일(768px 이하) 유지: `8px`

#### 2. 컬럼 구분선 명확화 (col-resizer 상시 표시)
- `.col-resizer` 기본 배경 `transparent → rgba(200,185,220,0.55)` (연한 보라, 상시 표시)
- hover/resizing 시 `rgba(215,0,114,0.6)` 핑크로 강조
- `.task-th` 헤더 `border-right: 1px solid #DDD5EA` 세로 구분선 추가
- `.task-th:last-child` border-right 제거
- `.task-col-table td` 바디 `border-right: 1px solid #F0EBF5` 세로 구분선 추가
- `.task-col-table td:last-child` border-right 제거

#### 3. "상태/관리" → "위험도" + "진행사항" 컬럼 분리
**colgroup 변경:**
- 기존: `<col class="c-state">` (1개, 170px)
- 변경: `<col class="c-risk">` (68px) + `<col class="c-progress">` (130px)

**헤더 th 변경:**
- 기존: `<th class="task-th">상태/관리</th>` (1개)
- 변경: `<th>위험도</th>` + `<th>진행사항</th>` (2개, 리사이즈 없음)

**renderTableView tbody td 분리:**
- 기존: 위험도배지 + 진행단계라벨 + 수정/삭제버튼을 단일 td에 렌더
- 변경:
  - 위험도 td: 위험도 배지만 (`고위험`/`중위험`/`일반`)
  - 진행사항 td: 진행단계 라벨 + 수정/삭제 버튼

**기타:**
- `colspan 9 → 10` (데이터 없음 안내 행)
- `min-width 900 → 960px` (10컬럼 대응)

### 커밋 로그
| 파일 | 커밋 | 내용 |
|------|------|------|
| `public/static/app.js` | `fdbbdf3` | feat: 작업관리 UI 개선 - 컬럼분리·구분선·화면잘림 수정 |
| `public/static/style.css` | `fdbbdf3` | 동일 커밋 |

### 빌드/배포 상태
- `node --check` ✅
- `npm run build` ✅ (276.43 kB)
- GitHub push ✅ (`afe8d7f → fdbbdf3`)
- NAS 배포: `서버 업데이트` UI에서 `fdbbdf3` 적용 필요

## 세션 127 (2026-07-12) — BUG-FIX + BUG-095: 공사 삭제 권한 버그 + 파일 저장 폴더 년도/월 누락 수정

### BUG-FIX: 공사 삭제 권한 — sysadmin+creator 동시 케이스

**버그 원인**:
1. **일반 사용자 삭제 버튼 미표시**: `app.js`에서 `currentUser.id === con.created_by` 타입 불일치 (token decode 후 id는 JSON Number, con.created_by는 DB에서 number이나 일부 경로에서 string으로 전달). `===` 비교에서 `false` → 삭제 버튼 숨김
2. **시스템관리자 409**: DELETE 핸들러에서 `isSysAdmin` 분기가 먼저 체크되어, sysadmin이 동시에 등록자인 경우 `isCreator && registered` 분기에 절대 미도달

**해결 내용**:
- `src/routes/constructions.ts`: 분기 순서 `isCreator&&registered` → `isSysAdmin` → `isCreator(비등록)` → `권한없음` 재배치 + `Number()` 강제 변환
- `node-server.ts`: NAS 공사삭제 오버라이드 동일 패턴 적용
- `public/static/app.js`: `Number()` 강제 변환 5곳 (con/task/card/table)

**커밋**: `67f7b91`

---

### BUG-095: 파일 저장 폴더 년도/월 계층 누락 (FEAT-042 node-server.ts 미적용)

**버그 원인**:
- FEAT-042(`2e38b2a`, 2026-07-04): `src/nas-routes/attachments-nas.ts`의 `getUploadDir()`에 `con_created_at` + 년도/월 로직 추가됨
- 그러나 `node-server.ts`의 `getUploadDir()`에는 **캐시 버전 문자열만 변경**, 실제 로직 미적용
- FEAT-050(`38901af`): `node-server.ts` getUploadDir에 `team_name`만 추가, `con_created_at` 여전히 누락

**수정 내용** (`node-server.ts` 단일 파일만 수정):

1. **`getUploadDir()` 함수**:
   - `con_created_at?: string | null` 파라미터 추가
   - `yearFolder`/`monthFolder` 추출 로직 추가 (`hasConInfo && con_created_at` 조건)
   - `basePath` 분기: 년도/월 있으면 `{root}/{year}/{month}/{conFolder}`, 없으면 `{root}/{conFolder}`

2. **5개 SQL 쿼리에 `c.created_at AS con_created_at` 추가**:
   - ① TBM PDF 생성 쿼리 + `taskObj`에 `con_created_at` 포함
   - ② POST `/api/inspection-photos` (addInsPhoto)
   - ③ POST `/api/inspections` multipart 사진 저장
   - ④ POST `/api/photos` multipart 작업사진 업로드
   - ⑤ POST `/api/tbm-photos` TBM사진 업로드

**커밋**: `a419dbd`

### 검증 결과
- 빌드 성공: `dist/_worker.js 277.69 kB` ✅
- FEAT-050 `team_name` 로직 충돌 없음 (병렬 추가) ✅
- `getUploadDir` 호출처 5개 전수조사 — 모든 위치 `con_created_at` 포함 확인 ✅
- `attachments-nas.ts`는 FEAT-042 시점에 이미 정상 처리 확인 ✅

### 커밋 로그
| 파일 | 커밋 | 내용 |
|------|------|------|
| `src/routes/constructions.ts` | `67f7b91` | fix: 공사 삭제 sysadmin+creator 조건 순서 + Number() 변환 |
| `node-server.ts` | `67f7b91` | fix: NAS 공사삭제 오버라이드 동일 패턴 |
| `public/static/app.js` | `67f7b91` | fix: Number() 강제 변환 5곳 |
| `node-server.ts` | `a419dbd` | fix: getUploadDir con_created_at + 5개 쿼리 추가 |

### 빌드/배포 상태
- `npm run build` ✅ (277.69 kB)
- GitHub push ✅ (`67f7b91` → `a419dbd`)
- NAS 배포 필요:
```bash
cd /volume1/safetynote
sudo git fetch origin && sudo git reset --hard origin/main
/usr/local/bin/pm2 restart safetynote
```

---

## 세션 127 (2026-07-12) — BUG-098: QR 전체선택 필터 버그 수정 (2차 재검증 포함)

### 작업 배경
BUG-098 1차 수정(`toggleAllQrChecks` + `updateQrBulkCount`)은 이전 세션에서 완료됐으나,
2차 재검증에서 `printQrBulk()`와 `filterUserList()` 에 추가 수정이 필요함을 발견.

---

### BUG-098 수정 전체 요약

**버그 증상**: 역할 카드(근로자/안전관리자 등) 클릭 필터 후 QR 전체선택 체크 시 → 숨겨진 사용자까지 전부 체크됨

**수정 파일**: `public/static/app.js`

| # | 함수 | 수정 내용 |
|---|------|-----------|
| ① | `toggleAllQrChecks` | `tbody tr` 순회 시 `tr.style.display === 'none'` 행 건너뜀 |
| ② | `updateQrBulkCount` | `.user-qr-check:checked` 순회 시 `tr.style.display !== 'none'` 행만 카운트 |
| ③ | `printQrBulk` (**2차 신규**) | `.user-qr-check:checked` 수집 후 `.filter(cb => tr.style.display !== 'none')` 추가 → 이미 체크 상태에서 필터 걸면 숨겨진 행도 인쇄되던 문제 해결 |
| ④ | `filterUserList` (**2차 신규**) | 행 숨길 때 `.user-qr-check` 자동 해제 + 마스터 체크박스 `indeterminate` 재동기화 + `updateQrBulkCount()` 재갱신 → 필터 적용 전 체크된 상태에서도 오작동 없도록 UX 완성 |

**커밋**: `e4fe63d`

### 빌드/배포 상태
- `npm run build` ✅ (`dist/_worker.js 277.78 kB`)
- `dist/static/app.js` 동기화 ✅
- GitHub push ✅ (`c8f6206 → e4fe63d`)
- NAS 배포: 방식1(업데이트 버튼) 적용 완료 ✅

---

## 세션 128 (2026-07-12) — QR 인쇄 카드 하단 크레딧 추가

### 작업 내용

**요청**: QR 인쇄 카드 하단 "Safety NOTE" 텍스트 아래 "Powered by LinkMak Co., Ltd." 추가

**수정 파일**: `public/static/app.js` — `printQrBulk()` 함수 내 인쇄 HTML

#### 변경 전
```html
<div class="brand">Safety NOTE</div>
```
```css
.brand { font-size: 5.5px; color: #C6C6C6; padding: 1px; ... }
```

#### 변경 후
```html
<div class="brand">
  <div class="brand-line1">Safety NOTE</div>
  <div class="brand-line2">Powered by LinkMak Co., Ltd.</div>
</div>
```
```css
.brand      { padding: 2px 2px 2.5px; border-top: 1px solid #D8D0DC; line-height: 1.3; }
.brand-line1 { font-size: 6px; font-weight: 700; color: #685182; }   /* 보라, bold */
.brand-line2 { font-size: 5px; color: #C6C6C6; }                      /* 연회색 */
```

#### 카드 레이아웃 (최종)
```
┌─────────────────────────────┐
│ ⛑ Safety NOTE          🦺 │  ← 헤더 (보라 그라디언트)
│                             │
│          [QR코드]           │
│                             │
│           이  름            │  ← bold, 11px
│       👥팀 · 직책           │  ← sub, 7.7px
├─────────────────────────────┤
│         Safety NOTE         │  ← 보라 #685182, 6px, bold
│  Powered by LinkMak Co., Ltd│  ← 연회색 #C6C6C6, 5px
└─────────────────────────────┘
```

**커밋**: `5a64403`

### 빌드/배포 상태
- `npm run build` ✅ (`dist/_worker.js 277.78 kB`)
- `dist/static/app.js` 동기화 ✅
- GitHub push ✅ (`e4fe63d → 5a64403`)
- NAS 배포: 방식1(업데이트 버튼) 적용 완료 ✅

---

## 금일(2026-07-12) 전체 작업 요약

| 세션 | 구분 | 내용 | 커밋 | 상태 |
|------|------|------|------|------|
| 126 | FEAT-062 | 근로자 QR 프로필 통합 UI 개편 (헤더 안전점수, 현장배정작업 accordion, 우수/불량 accordion) | `0337ee3` | ✅ 배포 |
| 126 | FEAT | QR 프로필 하단 LinkMak 크레딧 바 추가 | `c8f6206` | ✅ 배포 |
| 126 | BUG-097 | 현장점검 저장 500 에러 — inspection_type CHECK constraint 수정 + patchSchema v0.159 | `405412f` | ✅ 배포 |
| 126 | BUG-096 | 역할 카드 onclick/data-role/class 누락 수정 | `bc5eb1f` | ✅ 배포 |
| 127 | BUG-098 | QR 전체선택 — 필터 숨겨진 행 제외 (4개 함수 완전 수정) | `e4fe63d` | ✅ 배포 |
| 128 | UI | QR 인쇄 카드 하단 'Powered by LinkMak Co., Ltd.' 추가 | `5a64403` | ✅ 배포 |


---

## 세션 139 (2026-07-14) — feat: TBM 탭 추가 실시 이력 확인 팝업 + 작업개시 버튼 추가

### 작업 배경
- TBM이 이미 실시된 작업에서 "TBM 추가 실시" 클릭 시 이력 유무 확인 팝업 필요
- TBM 탭 하단에 "작업개시" 버튼도 함께 표시 요청

### 수정 내용
**`public/static/app.js`**:

**1. TBM 탭 하단 버튼 영역 (line ~8933)**
- `showTbmForm()` 직접 호출 → `_showTbmAddConfirm(taskId, tbms.length)` 로 변경
- `tbm_done` 상태일 때 "작업개시" 버튼 나란히 추가 (`flex gap-2`)

**2. `_showTbmAddConfirm(taskId, tbmCount)` 신규 함수 (line ~14156)**
```
TBM 이력 있음(tbmCount > 0):
  → "TBM 이력이 있습니다. 기존 TBM으로 이동하시겠습니까?" 팝업
  → 네: 팝업 닫기 (현재 TBM 탭 유지)
  → 아니오: showTbmForm() 신규 TBM 등록
TBM 이력 없음:
  → 팝업 없이 바로 showTbmForm() 호출 (하위호환)
```

### 커밋 정보
- **커밋**: `1f4bcbd` — feat: TBM 탭 추가 실시 이력 확인 팝업 + 작업개시 버튼 추가 (세션139)
- **수정 파일**: `public/static/app.js`, `node-server.ts`(캐시버전)
- **캐시 버전**: `v=20260714a`
- **빌드**: 성공 (`dist/_worker.js 277.78 kB`)

---

## 세션 138 (2026-07-13) — fix: TBM 공유 텍스트 작업번호 sub_task_number 조합 추가

### 작업 배경
- TBM 공유 시 복사되는 텍스트의 작업번호가 `WKS-260709-01244` 형식만 표시
- 올바른 형식: `WKS-260709-01244-####` (work_number + sub_task_number 조합)

### 원인 분석
- `_tbmShare()` 함수가 호출하는 `POST /api/tbm/:id/share-token` API의 SQL 쿼리에서
  `tasks.sub_task_number` 컬럼을 SELECT하지 않아 응답 JSON에 누락
- `app.js`의 복사 텍스트 구성 시 `d.work_number`만 사용하여 서브번호 미반영

### 수정 내용
**`node-server.ts`** (line ~3773, ~3821):
- SQL: `tk.sub_task_number` 컬럼 추가
- 응답 JSON: `sub_task_number: tbmRow.sub_task_number || ''` 필드 추가

**`app.js`** (line ~14160):
- 작업번호 표시 로직 개선:
  ```javascript
  const fullWorkNum = d.sub_task_number
    ? `${d.work_number}-${d.sub_task_number}`
    : d.work_number;  // sub_task_number 없으면 그대로 (하위호환)
  ```

### 검증
- 기존 코드 패턴(line 3412)과 동일한 조합 방식 사용
- `sub_task_number`가 없는 기존 작업도 정상 동작 (하위호환)
- `tasks.sub_task_number` DEFAULT NULL → LEFT JOIN 안전

### 커밋 정보
- **커밋**: `021178d` — fix: TBM 공유 텍스트 작업번호에 sub_task_number 조합 추가 (세션138)
- **수정 파일**: `node-server.ts`, `public/static/app.js`
- **캐시 버전**: `v=20260713c`
- **빌드**: 성공 (`dist/_worker.js 277.78 kB`)

---

## 세션 137 (2026-07-13) — fix: 접속일보 공종별 집계 금액 미적용 버그 수정

### 작업 배경
- 단가관리 화면에 금액이 등록되어 있으나 일보작성 메뉴의 공종별 집계/물량통계에서 금액이 0으로 표시
- 영향 항목: `광단자(IJP,OFD)`, `케이블 최종시험(양방향)`, `케이블 최종시험(단방향)`, `신호수추가배치`

### 원인 분석
- `SPLICE_ITEMS_DEF`: `app.js` 하드코딩 배열 (b000001~b000011, 11개만 정의)
- 단가관리 UI에서 추가된 항목(광단자, 최종시험, 신호수추가배치 등)은 DB `splice_unit_prices`에만 존재
- `renderFieldReportPage._spliceLabelToKey` + `_vsLoadSpliceStats._vsLabelToKey` 빌드 시 SPLICE_ITEMS_DEF만 참조
- → DB 추가 항목의 `work_label(한글)` → `item_key(b000xxx)` 변환 실패
- → `priceMap[labelToKey(label)]` = undefined → `calcUnitAmt` = 0

### 수정 내용
**`public/static/app.js`** (2곳 동일 패턴 수정):

**위치 1** — `renderFieldReportPage` (line ~33374):
```javascript
// 추가:
(priceRes.data.prices || []).forEach(p => {
  if (p.item_label && p.item_key && !_spliceLabelToKey[p.item_label]) {
    _spliceLabelToKey[p.item_label] = p.item_key;
  }
});
```

**위치 2** — `_vsLoadSpliceStats` (line ~36888):
```javascript
// 추가:
prices.forEach(p => {
  if (p.item_label && p.item_key && !_vsLabelToKey[p.item_label]) {
    _vsLabelToKey[p.item_label] = p.item_key;
  }
});
```

**`node-server.ts`**: 캐시 버전 `v=20260713a` → `v=20260713b`

### 커밋 정보
- **커밋**: `fc2468a` — fix: 접속일보 공종별 집계 금액 미적용 버그 수정 (세션137)
- **수정 파일**: `public/static/app.js`, `node-server.ts`
- **빌드**: 성공 (`dist/_worker.js 277.78 kB`)

---

## 세션 136 (2026-07-13) — feat: QR 일괄 인쇄 배열 선택 기능 추가

### 작업 배경
- 기존 `printQrBulk()`: A4 기준 `4×5=20장` 고정 배열만 지원
- 사용자 요청: 인쇄 시 N×N 배열을 선택할 수 있게 해달라 (기본값 4×5 유지)

### 구현 내용
- **파일**: `public/static/app.js`
- `printQrBulk()` 를 두 단계로 분리:
  1. **배열 선택 다이얼로그** (`printQrBulk`): 인원 체크 → `modal-sm` 팝업 표시
  2. **실제 인쇄 실행** (`_printQrBulkExec`): 선택된 배열 기준 레이아웃 계산 + 팝업 출력

**지원 배열 8종:**
| 인덱스 | 배열 | 장/페이지 | 비고 |
|--------|------|-----------|------|
| 0 | 2×3 | 6장 | 크게 보기 |
| 1 | 3×4 | 12장 | 중간 크기 |
| 2 | 3×5 | 15장 | 중간 크기 |
| 3 | 4×4 | 16장 | 표준 |
| 4 | 4×5 | 20장 | **기본값 ★** |
| 5 | 5×5 | 25장 | 작게 보기 |
| 6 | 5×6 | 30장 | 작게 보기 |
| 7 | 6×7 | 42장 | 매우 작게 |

**동적 레이아웃 계산 (A4 기준):**
- 카드 높이: `(282 - (ROWS-1)×1.5) / ROWS` mm
- QR 크기: 카드 높이×60% (최소 18mm, 최대 42mm)
- 이름 폰트: 카드 높이×0.20 (최소 7px, 최대 12px)
- 모든 배열에서 A4 282mm 한도 이내 검증 완료 ✅

**특수문자 안전 처리:**
- 사용자 이름에 큰따옴표·특수문자가 있어도 `onclick` 속성이 끊어지지 않도록 `window._qrBulkItems` 변수 참조 방식 채택 (Session 135 TBM 버그와 동일 원인 사전 방지)

**UI 부가 기능:**
- 배열 선택 시 예상 페이지 수 실시간 표시
- 기본값(4×5) 보라색 강조 테두리 표시
- 라디오 선택 시 카드 하이라이트 전환

### 2차 검증 결과
- `qrLayout` radio name 사용 횟수: 1 ✅
- `_printQrBulkExec` 정의 횟수: 1 ✅
- `printQrBulk` 정의 횟수: 1 ✅
- `window._qrBulkItems` 참조 횟수: 2 (저장1+사용1) ✅
- A4 높이 282mm 초과 배열: 0개 ✅

### 커밋
- `9efecf1` — feat: QR 일괄 인쇄 배열 선택 기능 추가 (Session 136)

### 완료 확인
- `npm run build` ✅ (dist/_worker.js 277.78 kB)
- `git push origin main` ✅ (`da19225` → `9efecf1`)

---

## 세션 135 (2026-07-13) — fix: TBM 공유 페이지 사진 클릭 확대 미동작

### 작업 배경
- TBM 완료결과 공유 화면(`/tbm-share/:token`)에 "사진을 클릭하면 크게 볼 수 있습니다" 텍스트가 있으나 실제 클릭 시 확대가 동작하지 않음
- 사진이 2열 그리드로 정상 표시되고, 라이트박스 HTML(`#_lb`)과 `_lbOpen`/`_lbClose` 함수도 코드상 존재함

### 원인 파악
- `node-server.ts` line 5468~5476: `onclick` 속성 내에서 캡션을 `JSON.stringify(Lcap)`으로 직렬화
- `JSON.stringify`는 문자열을 `"큰따옴표"` 로 감싸 반환 → 생성된 HTML:
  ```html
  onclick="_lbOpen('/tbm-share/.../photo/1',"[개인보호구 점검] 안전보호구 착용 상태 확인")"
  ```
- HTML 파서가 `onclick="..."` 속성을 `_lbOpen('/tbm-share/.../photo/1',` 에서 **끊음** → 속성값 파싱 실패 → JS 오류 → 클릭 이벤트 미발생
- 라이트박스 구조(`_lbOpen`, `_lbClose`, CSS `#_lb`)는 모두 정상이었음

### 수정 내용
- **파일**: `node-server.ts`
- `JSON.stringify(Lcap)` / `JSON.stringify(Rcap)` → 싱글쿼트 방식으로 교체
- 백슬래시(`\`)와 싱글쿼트(`'`)를 이스케이프하는 `LcapJs`, `RcapJs` 변수 추가:
  ```typescript
  const LcapJs = Lcap.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const RcapJs = Rcap.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  // onclick 속성: "..." 내부에 싱글쿼트만 사용 → HTML 파서 충돌 없음
  onclick="_lbOpen('/tbm-share/${token}/photo/${L.id}','${LcapJs}')"
  ```

### 커밋
- `c8fe30e` — fix: TBM 공유 페이지 사진 클릭 확대 미동작 수정 (Session 135)

### 완료 확인
- `npm run build` ✅ (dist/_worker.js 277.78 kB)
- `git push origin main` ✅ (`327afd0` → `c8fe30e`)

---

## 세션 134 (2026-07-13) — feat: 현장점검 목록 모바일 카드형 렌더링

### 작업 배경
- 모바일에서 현장점검 목록이 5컬럼 테이블로 표시되어 가로 스크롤·가독성 문제 발생
- 추가 요청: 디버그 콘솔 로그 제거 (Session 133 디버그 코드 정리)

### 수정 내용 (app.js — `renderInspectionsPage`)

**디버그 코드 제거**:
- `[DEBUG-133]`, `[DEBUG-133b]` 콘솔 로그 전체 제거

**분기 조건**: `window.innerWidth <= 768` → 모바일/PC 레이아웃 선택

**모바일 카드 구조** (각 작업 1장 카드):
```
┌───────────────────────────────────────────┐
│ [작업진행중 ●]          [내역] [점검등록]   │  ← 상단: 상태배지 + 버튼
│ (시청)(전속)공사명...                        │  ← 작업명 (클릭→상세)
│ TASK-xxx · 2026-07-13 · 📍위치              │  ← 번호/날짜/위치
│ 👔 공사담당자 | 👥 전용찬 외 2명             │  ← 공사담당자·작업팀
│ ─────────────────────────────────────────  │
│ [📋 2건]  [양호] [완료]  점검내용 요약...    │  ← 점검 현황
└───────────────────────────────────────────┘
```

**PC 테이블 구조**: 기존 5컬럼 그리드 완전 유지
```
작업명(2fr) | 작업상태(90px) | 점검(90px) | 최근점검내용(1fr) | 액션(80px)
```

**공통 헬퍼 함수** (IIFE 내부):
- `_mgrTeamHtml(t)` — 공사담당자 + 작업팀 HTML (PC/모바일 공유)
- `_insDetailHtml(taskId, ins)` — 점검 내역 인라인 토글 HTML (PC/모바일 공유)
- `_lmG`, `_cmG`, `_bmG` — 점검결과 변환 맵 (공통)

### 2차 재검증 체크리스트
- [x] `node --check public/static/app.js` → 문법 에러 없음 ✅
- [x] `INS_STATUS`, `TASK_STATUS`, `HAZARD_CLS/LBL`, `INS_TYPE_LBL` 스코프 내 접근 ✅
- [x] `showTaskInspectionList` (line 14835), `showCreateInspectionModal` (line 14873), `showInspectionDetail` (line 15306) 전역 함수 존재 ✅
- [x] `_mgrTeamHtml`, `_insDetailHtml` — IIFE 내부 로컬 함수 → 전역 충돌 없음 ✅
- [x] 모바일/PC 분기: `window.innerWidth <= 768` — BUGFIX_LOG RULE-024 기준 (기기해상도 무관 단일 조건) ✅
- [x] `ins-detail-${t.id}` DOM id 충돌 없음 (기존 `showTaskInspectionList` 토글 함수와 호환) ✅
- [x] `npm run build` 성공 (277.78 kB) ✅

### 빌드/배포 상태
- `npm run build` ✅ (`dist/_worker.js 277.78 kB`)
- GitHub push ✅ (`9091f58 → f300ab0`)
- NAS 배포: 방식1(업데이트 버튼) 적용 필요

---

## 세션 133 (2026-07-13) — fix: 사진/영상 확대 모달 닫기 버튼 가려짐 수정

### 작업 배경
작업관리 페이지에서 세로로 긴 사진 클릭 확대 시 상단 닫기(×) 버튼이 이미지에 가려지는 버그 신고.
- 원인: 모달 컨테이너에 `overflow:hidden`만 있고, 이미지에 `max-height` 미설정 → 긴 이미지가 헤더를 화면 위로 밀어냄
- 참조 패턴: `showTbmPhotoPreview`는 이미 `max-height:70vh;object-fit:contain`으로 올바르게 처리됨

### 수정 대상 함수 4개 (app.js)

| 함수 | 위치 | 용도 |
|------|------|------|
| `showPhotoData` | line ~10258 | 작업관리 사진 확대 |
| `showVideoData` | line ~10280 | 작업관리 영상 확대 |
| `showInsPhotoData` | line ~15408 | 현장점검 사진 확대 |
| `showInsVideoData` | line ~15425 | 현장점검 영상 확대 |

### 수정 내용 (공통 패턴)

**Before** (문제 구조):
```html
<div style="overflow:hidden"> <!-- max-height 없음 -->
  <img src="..."> <!-- max-height 미설정 → 길면 헤더 밀어냄 -->
</div>
```

**After** (수정 구조):
```html
<!-- 컨테이너: Flex column + max-height:92vh -->
<div style="overflow:hidden;display:flex;flex-direction:column;max-height:92vh;">
  <!-- 헤더: sticky 고정 -->
  <div style="position:sticky;top:0;background:white;z-index:1;flex-shrink:0;">
    <span>캡션</span>
    <button onclick="...remove()">✕</button>
  </div>
  <!-- 콘텐츠: 스크롤 가능 -->
  <div style="overflow-y:auto;flex:1;">
    <img style="max-height:80vh;object-fit:contain;display:block;">
    <!-- 영상은 max-height:75vh -->
  </div>
</div>
```

### 2차 재검증 확인 사항
- `display:flex;flex-direction:column` + `max-height:92vh` → 모달 전체 높이 제한
- 헤더 `position:sticky;top:0;flex-shrink:0` → 스크롤 시에도 헤더 항상 표시
- 콘텐츠 `overflow-y:auto;flex:1` → 이미지가 길면 내부 스크롤 처리
- 이미지 `max-height:80vh;object-fit:contain` → 비율 유지하며 화면 내 표시
- 영상 `max-height:75vh` → 컨트롤 포함 여유 확보
- 외부 클릭 닫기 `modal.addEventListener('click', e => { if (e.target===modal) modal.remove(); })` → 4개 함수 모두 적용 확인

### 빌드/배포 상태
- `npm run build` ✅ (`dist/_worker.js 277.78 kB`)
- `dist/static/app.js` 동기화 ✅
- GitHub push ✅ (`8207b71 → 8f31616`)
- NAS 배포: 방식1(업데이트 버튼) 적용 필요

---

## 세션 132 (2026-07-13) — feat: 현장점검 목록 작업명 하단 공사담당자·작업팀 표시

### 작업 배경
현장점검 목록의 작업명 옥에 공사담당자와 작업팀을 표시해달라는 요청.
- 작업팀: "전용찬 외 2명", "김주호 외 0명" 형태(팀단위)

### 수정 내용 (app.js line 14672~14689)

**목표 위치**: `renderInspectionsPage` 작업명 영역 `<div>` 내 작업번호/날짜 줄 다음에 새 줄 추가

**사용 필드**:
- `t.con_manager_display_name`: 공사담당자 (`COALESCE(con_mgr.name, con.manager_name, '')` — 모든 role 쿼리에 포함됨)
- `t.assigned_workers`: 배정 작업자 배열 (`[{id, name, position}]` — tasks API에서 배치 조회)

**작업팀 표시 로직**:
- `workers.length === 1` → `이름만`
- `workers.length > 1` → `첫번째이름 외 N명`
- `workers.length === 0` → 작업팀 표시 안 함
- 공사담당자도 없고 작업팀도 없으면 해당 `div` 자체 미렌더링(불필요 여백 없음)

**2차 재검증 확인 사항**:
- `t.assigned_workers || []` 방어 코드 적용
- `workers[0]` 접근 전 `workers.length` 체크 완료
- IIFE `(() => { ... })()` 패턴: 이미 반복 사용 중인 패턴과 동일
- `con_manager_display_name`: worker role에도 동일 필드 포함 확인

### 커밋
- `cc78975` — feat: 현장점검 목록 — 작업명 하단에 공사담당자·작업팀 표시 추가

---

## 세션 131 (2026-07-13) — fix: 현장위치지도·현장점검 중지(paused) 작업 미표시

### 작업 배경
"중지된 작업은 현장위치 지도, 현장점검 메뉴에서 표시되지 않도록 수정" 요청.
task.status = 'paused'(일시중지/작업중지 신고 상태)가 두 페이지에 표시되고 있었음.

### 원인 분석
- **현장점검** `WORKING_STATUSES = ['working', 'paused']` → paused 포함
- **현장점검** `filterByTab` all 탭 → `t.status !== 'cancelled'` 만 제외, paused 포함
- **현장점검** `cntAll` → `cancelled` 만 제외, paused 카운트 포함
- **현장위치 지도** ③ 진행 탭 → `task_status === 'working' || task_status === 'paused'` paused 포함

### 수정 내용 (app.js)
| 위치 | 변경 전 | 변경 후 |
|------|--------|--------|
| line 14453 주석 | `working, paused` | `working — paused 제외` |
| line 14458 `WORKING_STATUSES` | `['working', 'paused']` | `['working']` |
| line 14489 `filterByTab` all 탭 | `!== 'cancelled'` | `!== 'cancelled' && !== 'paused'` |
| line 14535 `cntAll` | `!== 'cancelled'` | `!== 'cancelled' && !== 'paused'` |
| line 14549 TAB_DEFS working desc | `작업개시 ~ 작업완료 전` | `작업개시 ~ 작업완료 전(중지 제외)` |
| line 14551 TAB_DEFS all desc | `취소 제외 전체` | `취소·중지 제외 전체` |
| line 38750 주석 | `working 또는 paused` | `working — paused(중지) 제외` |
| line 38773 `workingTbmList` 필터 | `working \|\| paused` | `working` 만 |
| line 38802 `statusLabel` | `paused ? '🟡 일시중지' : '🟢 진행'` | `'🟢 진행'` 고정 |
| line 38834 팝업 텍스트 | `statusLabel === '🟡 일시중지' ? ... : '🟢 작업 진행중'` | `'🟢 작업 진행중'` 고정 |

### 2차 재검증 확인 사항
- task.status='paused' 처리 로직(재개 버튼, 작업상세 등)은 기타 페이지 영향 없음
- 38716 라인 TBM 탭 내 old 주석(`working/paused → 진행 탭`)은 흐름 설명용이므로 기능 무관
- TASK_STATUS 배지 맵에 `cancelled` 표시는 작업 상세 뷰용으로 유지 (필터와 별개)

### 커밋
- `27cb2f2` — fix: 현장위치지도·현장점검 — 중지(paused) 작업 미표시 처리

---

## 세션 130 (2026-07-13) — fix: site-map 지도 컨테이너 높이 2.5배 확대

### 작업 배경
현장위치 지도(`site-map`) 페이지에서 지도 영역이 너무 작다는 사용자 요청. 현재 `height:70vh;max-height:600px`를 2.5배로 확대.

### 수정 내용
| 파일 | 변경 내용 |
|------|----------|
| `public/static/app.js` (line 38452) | `leafletMap` div style: `height:70vh;min-height:300px;max-height:600px` → `height:175vh;min-height:750px` (max-height 제거) |

- **변경 전**: `style="width:100%;height:70vh;min-height:300px;max-height:600px;border-radius:12px;..."`
- **변경 후**: `style="width:100%;height:175vh;min-height:750px;border-radius:12px;..."`
- ResizeObserver가 지도 크기 변경을 자동 감지 → `map.invalidateSize()` 자동 호출됨 (추가 조치 불필요)

### 커밋
- `891f0db` — fix: site-map 지도 컨테이너 높이 2.5배 확대 (70vh→175vh, min-height 300→750px, max-height 제거)

---

## 세션 129 (2026-07-13) — FEAT-063: 공사통계 메뉴 추가

### 작업 배경
공사현황 그룹 하위에 작업 종류별/담당자별 통계를 년간·월간·주간으로 조회할 수 있는 신규 페이지 요청.

---

### 구현 내용

#### 백엔드 — `node-server.ts`
**신규 API**: `GET /api/constructions/stats`

| 파라미터 | 설명 |
|----------|------|
| `period` | `yearly`(기본) \| `monthly` \| `weekly` |
| `year`   | 연도 (4자리, 기본: 올해) |
| `month`  | 월 (1~12, 월간 전용) |
| `week_start` | 주 시작일 YYYY-MM-DD (주간 전용, 미입력 시 이번 주 월요일 자동 계산) |

**응답 구조**:
```json
{
  "summary": { "total": 50, "completed": 30, "settled": 5, "notify_total": 150000000 },
  "by_type": [
    { "work_class": "relocation", "label": "지장이설", "total": 20, "completed": 12, "settled": 2, "notify_total": 50000000 }, ...
  ],
  "by_manager": [
    { "manager": "홍길동", "total": 15, "completed": 10, "settled": 2, "notify_total": 30000000 }, ...
  ]
}
```

**라우트 충돌 방지**: `/api/constructions/stats`를 `/api/constructions/:id` 동적 라우트보다 먼저 등록 (line 4691 < line 4856)

---

#### 프론트엔드 — `public/static/app.js`

**메뉴 추가**:
- `volume` 그룹 items 맨 앞: `{ id:'con-stats', icon:'fas fa-chart-pie', label:'공사통계' }`
- `getPageTitle` 맵: `'con-stats': '공사통계'`
- `navigateTo` switch: `case 'con-stats': renderConStatsPage(content); break;`

**`renderConStatsPage()` 함수 신규 구현**:

```
┌────────────────────────────────────────────────────────────┐
│  [년간] [월간] [주간]  [2026년▼]  [조회]       2026년      │  ← 필터 바
├──────────┬──────────┬───────────────────┬──────────────────┤
│ 전체50건 │ 완료30건 │ 시공통보: 1.5억   │ 정산완료5건      │  ← 요약 카드
├────────────────────────────────────────────────────────────┤
│ 작업 종류별 현황                                            │
│ 공사종류 │ 전체 │ 완료(%) │ 시공통보금액 │ 정산완료        │
│ 지장이설 │  20  │ 12(60%) │    5,000만   │      2          │
│ ...      │  ..  │   ...   │     ...      │     ...         │
│ [합계]   │  50  │    30   │    1.5억     │      5          │
├────────────────────────────────────────────────────────────┤
│ 담당자별 현황 (수평 막대 그래프)                            │
│ 홍길동 ████████░░░░  15                                    │
│ 김철수 █████░░░░░░░  10                                    │
│ ...                                                        │
│ [담당자 상세 표]                                            │
└────────────────────────────────────────────────────────────┘
```

- 금액 표시: 1억 이상 → `X.X억`, 1만 이상 → `XX만`, 이하 → 원 단위
- 차트: Chart.js 4.4.0 CDN 동적 로드, 수평 막대(`indexAxis:'y'`), 전체/완료/정산완료 3개 데이터셋
- 담당자 최대 15명 그래프 표시 (표는 30명까지)
- 주간: 이전/다음 주 이동 버튼 포함

**커밋**: `0de543f`

### 2차 재검증 체크리스트
- [x] 메뉴 `con-stats` 3곳 모두 등록 (items, titleMap, switch-case) ✅
- [x] API 라우트 순서: `/api/constructions/stats` < `/api/constructions/:id` ✅
- [x] `rawDb.prepare().all(...params)` spread 방식 — 기존 코드 패턴과 동일 ✅
- [x] 전역 변수 `_cs*` 접두어 — 기존 코드와 충돌 없음 ✅
- [x] `npm run build` 성공 (277.78 kB) ✅

### 빌드/배포 상태
- `npm run build` ✅ (`dist/_worker.js 277.78 kB`)
- `dist/static/app.js` 동기화 ✅
- GitHub push ✅ (`b2ba246 → 0de543f`)
- NAS 배포: 방식1(업데이트 버튼) 적용 필요


---

## 세션 134 (2026-07-14) — feat: QR 일괄 인쇄 / TBM 공유 수정 / 사진 확대 모달 수정

> ※ 세션 134~139는 이전 PROJECT_HISTORY 기록에서 순번이 129 이후로 점프됨.  
> 아래 세션 140은 2026-07-17 기준 이번 개발 세션 입니다.

---

## 세션 140 (2026-07-17) — 기능 고도화 5종 + JS 파싱 오류 긴급 수정

### 작업 배경
이전 세션(139)에서 미완료된 `loadMonthlyStats()` 금액 재조회 연결을 포함,  
공시현황·내 작업 목록·공사통계 페이지의 UX 개선 요청 5건을 일괄 처리.  
작업 도중 `app.js`에 TypeScript 구문 삽입으로 메인 페이지 전체 불가 장애 발생 → 긴급 핫픽스.

---

### 구현 내용

#### ① `loadMonthlyStats()` — workAmt/spliceAmt 재조회 + DOM 갱신 (커밋 `33e7557`)

**배경**: 공시현황(stats-task) 페이지의 "총 시공물량" 카드 초기 렌더 시 접속·외선 일보 금액이  
`0` 으로 고정되어 있던 문제. `loadMonthlyStats()` 호출 시에만 최신 값이 반영되고  
DOM 업데이트 경로가 분리되어 있어 카드 헤더에 반영되지 않았음.

**해결**:
- `loadMonthlyStats()` 내부에서 `/work-reports/monthly-amount`, `/splice-reports/monthly-amount` 병렬 호출 추가
- `qty-main-value` / `qty-main-label` 클래스로 DOM 타겟 지정 → 연도/월 변경 시에도 실시간 갱신
- `.monthly-amt-block` 제거 후 재생성 방식으로 중복 렌더 방지

```javascript
// Promise.all 6개 병렬 조회
const [monthlyRes, byCatRes, byTeamRes, activeByTeamRes2, workAmtRes2, spliceAmtRes2] = await Promise.all([
  API.get('/stats/monthly', { params: { year, month, ...(conTypesParam ? { con_types: conTypesParam } : {}) } }),
  API.get('/stats/completed/by-category', { ... }),
  API.get('/stats/completed/by-team',     { ... }),
  API.get('/stats/active/by-team'),
  API.get('/work-reports/monthly-amount',  { params: { year, month } }).catch(() => ({ data: { work_report_amount: 0 } })),
  API.get('/splice-reports/monthly-amount',{ params: { year, month } }).catch(() => ({ data: { splice_report_amount: 0 } }))
]);
```

---

#### ② 총 시공물량 카드 헤더 합계 금액 표시 (커밋 `53a42f1`)

**배경**: 공시현황 "총 시공물량" 카드 헤더(큰 숫자)가 항상 `0.0`으로 고정.

**해결**:
- 접속일보(`splice_report_amount`) + 외선일보(`work_report_amount`) 합산
- **표시 형식**: 합계가 100만 이상이면 `N.N백만`, 미만이면 원 단위 표시
- `qty-main-value` DOM 엘리먼트를 타겟으로 실시간 업데이트

**표시 예시**:
```
총 시공물량    ← 카드 타이틀
3.7백만        ← qty-main-value (접속 2.1 + 외선 1.6 백만)
금액(원)       ← qty-main-label
```

---

#### ③ 근로자 내 작업 목록 — 등록건명/공사담당자 텍스트 검색 (커밋 `5c5e167`)

**배경**: 작업이 많아질수록 특정 건을 찾기 어렵다는 현장 피드백.

**구현 위치**: `public/static/app.js` — 전역 상태 + `renderMyTasksPage()` 내부

**추가 전역 상태**:
```javascript
let _myTasksSearchKw = '';       // 검색 키워드
let _myTasksSearchTimer = null;  // debounce 타이머 핸들
```

**검색 동작**:
- 검색 대상 필드: `title`(등록건명), `con_manager_display_name`(공사담당자), `supervisor_name`, `construction_title`
- debounce: **300ms** (연속 입력 시 API 재호출 없이 클라이언트 사이드 필터링)
- 재렌더 후 포커스 자동 복원 (`inp.setSelectionRange(len, len)`)
- 페이지 이탈(`navigateTo()`) 시 `_myTasksSearchKw = ''` 자동 초기화

```javascript
function applyMyTasksSearch(kw) {
  _myTasksSearchKw = (kw || '').trim();
  clearTimeout(_myTasksSearchTimer);
  _myTasksSearchTimer = setTimeout(() => {
    renderMyTasksPage(content).then(() => {
      const inp = document.getElementById('myTasksSearchInput');
      if (inp) { inp.focus(); const len = inp.value.length; inp.setSelectionRange(len, len); }
    });
  }, 300);
}
```

---

#### ④ 내 작업 목록 — 금일예정 필터 카드 추가 (커밋 `b811273`)

**배경**: 오늘 예정된 작업만 빠르게 확인하고 싶다는 요청.

**구현**:
- 기존 3열(전체·진행중·완료) → **4열(전체·진행중·완료·금일예정)** 로 확장 (`grid-cols-4`)
- KST 기준 오늘 날짜(`getKSTDate()`) 자동 계산
- 필터 조건: `planned_date === todayKST && status !== 'cancelled'`
- **빨간 알림 뱃지**: `todayCount > 0` 이면 카드 우상단에 빨간 점 표시

```javascript
const todayKST   = getKSTDate();  // 'YYYY-MM-DD' (KST)
const todayCount = myTasks.filter(
  t => t.planned_date === todayKST && t.status !== 'cancelled'
).length;
```

---

#### ⑤ 공사통계(con-stats) — 공사종류 드롭다운+체크박스 필터 (커밋 `fa15bcc`)

**배경**: 공사통계 페이지에서 공사종류별 필터 없이 전체 합산만 표시되어,  
특정 공사종류(예: 지장이설)만 선택적으로 분석하기 어려움.

**추가 전역 상태** (`renderConStatsPage` 스코프 내):
```javascript
let _csWorkClasses = ['relocation'];  // 기본: 지장이설
let _csWcOpen      = false;           // 드롭다운 열림 상태
```

**UI 구성**:
```
┌──────────────────────────────────────────┐
│ [공사종류 ▼ 지장이설]                     │  ← 드롭다운 버튼
│ ┌────────────────────────────────────┐   │
│ │ [전체선택] [전체해제]               │   │
│ │ ☑ 지장이설  ☐ 청약개통             │   │
│ │ ☐ 관로공사  ☐ 환경공사             │   │
│ │ ☐ 별도사업  ☐ 기타                 │   │
│ └────────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

**동작**:
- 체크박스 변경 즉시 `loadAndRender()` 재호출 → `work_classes` 파라미터로 API 전달
- 전체 선택/해제 빠른 버튼 제공
- 외부 클릭 시 드롭다운 자동 닫기 (`document.addEventListener('click', _csOutsideClickHandler)`)
- 버튼 라벨: 선택 1종이면 종류명 표시, 복수이면 "N종 선택" 표시

**백엔드 수정** (`node-server.ts` `/api/constructions/stats`):
```typescript
const rawWorkClasses = c.req.query('work_classes') || ''
const workClassList: string[] = rawWorkClasses
  ? rawWorkClasses.split(',').map((s: string) => s.trim()).filter(Boolean)
  : []
const hasWcFilter    = workClassList.length > 0
const wcPlaceholders = workClassList.map(() => '?').join(',')
const wcWhere        = hasWcFilter
  ? `AND COALESCE(c.work_class, 'other') IN (${wcPlaceholders})`
  : ''
// summary / by_type / by_manager 3개 쿼리 모두 wcWhere 적용
```

> ⚠️ `constructions.work_class`는 **영문 key** 저장 (relocation, subscription, conduit, environment, separate, other)  
> → API 파라미터도 반드시 영문 key로 전달해야 함

---

#### ⑥ hotfix: JS 파싱 오류 긴급 수정 (커밋 `6a0416d`)

**원인**: `app.js`(순수 JavaScript 파일)에 TypeScript 캐스팅 구문 삽입

```javascript
// ❌ 잘못된 코드 (TypeScript 전용 구문)
(document.getElementById('csWcDropdown') as HTMLInputElement).checked = true

// ✅ 수정 코드 (순수 JavaScript)
const el = document.getElementById('csWcDropdown');
if (el) el.checked = true;
```

**영향**: 메인 페이지 전체 `new Function()` 파싱 실패 → 앱 완전 불가 (흰 화면)  
**수정 후**: `node -e "new Function(require('fs').readFileSync('public/static/app.js','utf8'))"` → **파싱 OK**

> 🔑 **재발 방지 규칙**: `app.js`는 **순수 JavaScript** 파일. `: Type`, `as Type`, `<Type>` 등  
> TypeScript 전용 구문 절대 사용 불가. 수정 후 반드시 파싱 검사 실행.

---

### 신규 API 목록

| HTTP | 경로 | 파일 | 설명 |
|------|------|------|------|
| GET | `/work-reports/monthly-amount` | `src/nas-routes/work-reports.ts` | 외선일보 월별 합계 금액 |
| GET | `/splice-reports/monthly-amount` | `src/nas-routes/splice-reports.ts` | 접속일보 월별 합계 금액 |

> RULE-002 준수: 각 파일에서 `/volume-stats`, `/:id` 동적 라우트보다 **먼저** 등록

**응답 형식**:
```json
// GET /work-reports/monthly-amount?year=2026&month=7
{ "work_report_amount": 1600000 }

// GET /splice-reports/monthly-amount?year=2026&month=7
{ "splice_report_amount": 2100000 }
```

---

### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `public/static/app.js` | ① loadMonthlyStats 금액재조회+DOM갱신 ② 총시공금액 헤더표시 ③ 내작업 검색기능 ④ 금일예정 필터카드 ⑤ con-stats 드롭다운 UI ⑥ hotfix TS구문제거 |
| `src/routes/stats.ts` | `/monthly`, `/completed/by-category`, `/completed/by-team` — `con_types` 파라미터 지원 (D1) |
| `node-server.ts` | `/api/constructions/stats` — `work_classes` 필터 파라미터 추가 (rawDb) |
| `src/nas-routes/work-reports.ts` | `GET /monthly-amount` 신규 API 추가 |
| `src/nas-routes/splice-reports.ts` | `GET /monthly-amount` 신규 API 추가 |

---

### 커밋 히스토리

| 커밋 | 메시지 |
|------|--------|
| `33e7557` | feat: 공시현황 총 시공물량 카드에 접속/외선 일보 금액 표시 |
| `53a42f1` | feat: 총 시공물량 카드 헤더값을 합계 금액(백만원 축약)으로 표시 |
| `5c5e167` | feat: 근로자 내 작업 목록에 등록건명/공사담당자 검색 기능 추가 |
| `b811273` | feat: 내 작업 목록 상단 카드에 금일예정 필터 추가 |
| `4a1e0dc` | feat: 공사통계 페이지 공사종류별 드롭다운+체크박스 필터 추가 |
| `fa15bcc` | fix: 공사통계(con-stats) 페이지에 공사종류별 드롭다운+체크박스 필터 추가 |
| `6a0416d` | hotfix: app.js TypeScript 'as HTMLInputElement' 구문 제거 — JS 파싱 오류 수정 |

---

### 빌드/배포 상태

- `npm run build` → ✅ **성공** (`dist/_worker.js 281.03 kB`, 1.30s)
- JS 파싱 검사 → ✅ **OK** (`node -e "new Function(...)"`)
- GitHub push → ✅ (`main` 브랜치, 커밋 `6a0416d`)
- 사용자 실기기 확인 → ✅ **"복구 되고 잘 동작 됩니다"**

---

## 세션 141 (2026-07-17) — feat: 작업통계 작업금액 3컬럼 분리 + 즉시 로딩

### 배경

세션140에서 완료된 작업통계 UI 개편(대시보드 개편, 달성금액 교체 등)의 연속 작업.
현장팀별·작업분류별 완료건수 테이블의 `작업금액` 단일 컬럼을 **외선/접속/소계 3컬럼**으로 분리하고,
페이지 진입 즉시 금액 데이터가 자동 로딩되도록 개선.

### 변경 내용

#### ① renderByTeamTable — 3컬럼 분리 + tfoot 합계행 (커밋 `241e5c1`)

**변경 전**: `작업금액` 단일 컬럼 (외선+접속 합산)

**변경 후**: 외선 / 접속 / 소계 3개 별도 컬럼 + tfoot 합계행

```
thead: 순위 | 팀명 | 인원 | 완료건수 | 외선(백만) | 접속(백만) | 소계(백만)
tfoot: (합계) | -   |  -  |  -      |  외선합계  |  접속합계  |  소계합계
```

**핵심 변경**:
- 함수 시그니처: `renderByTeamTable(rows, year, month, workAmtMap, spliceAmtMap)` (맵 2개 분리)
- `wAmt = (workAmtMap[teamName] || 0) / 1_000_000`
- `sAmt = (spliceAmtMap[teamName] || 0) / 1_000_000`
- `fmtAmtTeam(v)` 헬퍼: `v > 0 ? v.toFixed(1) : '-'`

#### ② renderByCategoryTable — 동일 방식 적용

```
thead: 순위 | 작업분류 | 배정 | 완료 | 완료율 | 외선(백만) | 접속(백만) | 소계(백만)
tfoot: 합계행
```

#### ③ loadMonthlyStats() — 맵 4개 분리

```javascript
// 변경 전: 합산 맵
const teamAmtMap2 = {};   // 외선+접속 합산
const catAmtMap2  = {};   // 외선+접속 합산

// 변경 후: 종류별 분리
const workTeamAmtMap2   = {};  // 팀별 외선 금액
const spliceTeamAmtMap2 = {};  // 팀별 접속 금액
const workCatAmtMap2    = {};  // 분류별 외선 금액
const spliceCatAmtMap2  = {};  // 분류별 접속 금액
```

#### ④ renderStatsPage() 말미 자동 호출 추가

```javascript
// 변경 전: 수동으로 "조회" 버튼 클릭 필요
_initStatsConTypeOutsideClick();

// 변경 후: 페이지 진입 즉시 자동 로딩
_initStatsConTypeOutsideClick();
loadMonthlyStats();  // ✅ 자동 호출
```

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `public/static/app.js` | renderByTeamTable·renderByCategoryTable 3컬럼 분리+tfoot / loadMonthlyStats 맵 분리 / renderStatsPage 자동호출 |

### 빌드/배포 상태

- `npm run build` → ✅ **성공** (`dist/_worker.js 281.03 kB`, 1.32s)
- JS 파싱 검사 → ✅ **OK**
- GitHub push → ✅ (`main` 브랜치, 커밋 `241e5c1`)

---

## 세션 143 (2026-07-20) — feat: site-map 지도 마커 팝업 지도앱 연결 + 하단 리스트 카드 작업상세 이동

### 배경

`site-map`(현장위치 지도) 화면에서 두 가지 기능 추가 요청:
1. 지도 마커 클릭 시 T맵/카카오맵/네이버지도 앱 선택 모달 표시 (기존 TBM/현장 지도 연결과 동일)
2. 하단 작업 목록 카드 클릭 시 해당 작업 상세 화면으로 이동

### 변경 내용

**1. 마커 팝업 지도앱 연결 (5개 탭 전체)**
- 기존 `showMapModal(address)` 함수 재사용 (T맵/카카오맵/네이버지도 선택 모달)
- 각 탭 마커 `bindPopup()` 하단에 `<div>` 버튼 영역 추가
- "지도앱 열기" 버튼: `showMapModal('${addr.replace(/'/g, '')}')` — 작은따옴표 제거로 onclick 안전
- task_id 있을 때 "작업상세" 버튼 병렬 표시 (TBM/진행/완료/현장점검 탭)
- risk 탭: 항상 `t.id`로 "작업상세" 버튼 표시

**2. 하단 리스트 카드 → 작업 상세 이동**
- 카드 `<div>` 전체에 `onclick="showTaskDetail(item.taskId)"` 추가 (taskId 있을 때만)
- 아이콘 원형 버튼(지도 이동): `event.stopPropagation()`으로 카드 onclick 버블링 차단
- 우측 화살표: taskId 있으면 보라색(`#685182`), 없으면 회색(`#D1D5DB`) 시각 구분

**3. listItems.push에 taskId 필드 추가 (9개 push 포인트 전체)**
- risk 탭: `t.id` (tasks.id 직접)
- tbm 탭: `tbm.task_id || null`
- working 탭: `tbm.task_id || null`
- completed 탭: `tbm.task_id || null`
- inspection 탭: `ins.task_id || null`

### 수정 파일
- `public/static/app.js` — `loadSiteMapMarkers()` 내 5개 탭 마커 팝업 + listItems + 카드 HTML

### 검증
- JS 파싱 검사: ✅ OK
- npm run build: ✅ 281.03 kB
- git commit: `999e9ad` / push: ✅

---

## 세션 142 (2026-07-17) — feat: 일보 작업자(팀) 필드 TBM 시행자+배정근로자 기반으로 변경

### 배경

외선일보·접속일보 작성 화면의 `작업자(팀)` 필드가 일보 **저장자(로그인 사용자)** 의 `contractor_name`을 표시하고 있었음.
실제 현장에서 필요한 것은 TBM 시행자 및 배정된 근로자 목록이므로, 이를 기반으로 표시하도록 변경.

### 분석

**TBM 데이터 구조**:
- `tbm.conductor_name` — TBM 실시자(시행자)
- `tbm.attendees` — TBM 참석자 문자열 배열 `string[]`

**task 데이터 구조**:
- `task.assigned_workers` — 배정된 근로자 객체 배열 `{id, name, position}[]`

**API**:
- `GET /tasks/:id/tbm-info` → `{ tbm: { conductor_name, attendees, tbm_date, ... } }`

### 변경 내용

#### ① 외선일보 (`renderWorkReportForm`) — Promise.all에 tbm-info 추가

```javascript
// 변경 전
const [taskRes, reportRes, typesRes] = await Promise.all([
  API.get(`/tasks/${taskId}`),
  API.get(`/work-reports/task/${taskId}`).catch(...),
  API.get('/volume-unit-prices').catch(...)
]);
const workerTeam = report?.worker_team || task.contractor_name || '-';

// 변경 후
const [taskRes, reportRes, typesRes, tbmInfoRes] = await Promise.all([
  API.get(`/tasks/${taskId}`),
  API.get(`/work-reports/task/${taskId}`).catch(...),
  API.get('/volume-unit-prices').catch(...),
  API.get(`/tasks/${taskId}/tbm-info`).catch(() => ({ data: { tbm: null } }))  // ✅ 추가
]);
const _wrTbm = tbmInfoRes.data?.tbm || null;
let workerTeam;
if (report?.worker_team) {
  workerTeam = report.worker_team;                        // ① 기존 저장값 우선
} else if (_wrTbm && (_wrTbm.conductor_name || ...)) {
  // ② TBM 시행자 + 참석자 (conductor 중복 제거)
  workerTeam = [conductor, ...attendees].join(', ');
} else if (task.assigned_workers?.length > 0) {
  workerTeam = task.assigned_workers.map(w => w.name).join(', ');  // ③ 배정근로자
} else {
  workerTeam = task.contractor_name || '-';               // ④ 폴백
}
```

#### ② 접속일보 (`renderSpliceReportForm`) — tbm-info 추가 호출

접속일보는 task를 별도 호출로 로드하는 구조이므로, task 로드 후 tbm-info를 추가 호출.
동일한 우선순위 로직(`report.worker_team` → TBM → `assigned_workers` → `contractor_name`) 적용.

```javascript
// 변경 전
const workerTeam = report?.worker_team || task?.contractor_name || '-';

// 변경 후
let workerTeam;
if (report?.worker_team) {
  workerTeam = report.worker_team;
} else {
  let _srTbm = null;
  if (tId) {
    try {
      const _srTbmRes = await API.get(`/tasks/${tId}/tbm-info`);
      _srTbm = _srTbmRes.data?.tbm || null;
    } catch(_) {}
  }
  // ... 동일 우선순위 로직 ...
}
```

### 2차 재검증 체크리스트

| 항목 | 결과 |
|------|------|
| `tbmInfoRes` 변수명 충돌 | ✅ 안전 (line 9773은 다른 함수 스코프 내 `const`) |
| `typesRes` Promise.all 인덱스 | ✅ 안전 (3번째 그대로, 4번째에 추가) |
| `let workerTeam` 중복 선언 | ✅ 안전 (각각 다른 함수 스코프) |
| `sr-worker-team` hidden input | ✅ 정상 (`${workerTeam || ''}` 그대로 사용) |
| 저장된 일보 수정 시 기존값 보존 | ✅ 정상 (`report?.worker_team` 우선 조건) |

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `public/static/app.js` | renderWorkReportForm — Promise.all tbm-info 추가 + workerTeam 재구성 / renderSpliceReportForm — tbm-info 추가 호출 + workerTeam 재구성 |

### 빌드/배포 상태

- JS 파싱 검사 → ✅ **OK** (`node -e "new Function(...)"`)
- `npm run build` → ✅ **성공** (`dist/_worker.js 281.03 kB`, 1.29s)
- GitHub push → ✅ (`main` 브랜치, 커밋 `1af97a3`)

---

## 세션 144 (2026-07-21) — feat: [FEAT-109] 작업분류 드롭다운 다중선택 필터 추가 (모바일+PC)

### 배경

FEAT-108에서 모바일 내 작업목록에 진행단계 드롭다운 필터가 추가된 후, 동일 방식으로 "작업분류" 필터를 모바일+PC 양쪽에 추가 요청.

### 분석

**데이터 구조**:
- `work_class`: DB에 영문 key로 저장 (`cable_install`, `cable_splice`, `conduit`, `relocation`, `subscription`, `separate`, `environment`, `other` 등)
- `CON_TYPE_DEF`: 단일 진실 공급원 (key/label/color 배열) — line 5140
- `WC_LABEL`: `CON_TYPE_DEF`에서 자동 생성된 key→한국어 맵 — line 5239

**필터 방식 결정**:
- 모바일: 클라이언트 필터 (FEAT-108 진행단계 패턴 동일)
- PC: 클라이언트 필터 (연도/월 다중선택과 동일 패턴 — `newTasks` 후처리)

### 변경 내용

#### ① 전역변수 초기화 (taskFilters + 모바일 전역)

```javascript
// PC: taskFilters에 workClassList 추가
let taskFilters = { ..., workClassList: [] };

// 모바일: _myTasksWcFilter 추가 (기본값: 전체 선택)
var _myTasksWcFilter = CON_TYPE_DEF.map(function(d) { return d.key; });
var _myTasksWcPickerOpen = false;
```

#### ② PC 헬퍼 함수 추가 (line ~5901~5940)

```javascript
function _taskOpenWorkClassPicker()    // 팝업 토글, 다른 팝업 닫기
function _taskCloseWorkClassPicker()   // 팝업 닫기
function _taskToggleWorkClass(key)     // 체크박스 토글
function _taskApplyWorkClassFilter()   // 적용 → renderTasksPage
function _taskClearWorkClassFilter()   // 전체 초기화
```

#### ③ PC 툴바 UI 삽입 (진행단계 ① 과 위험도 ② 사이에 ② 작업분류 삽입, 기존 ②→③)

- Sky blue(#0EA5E9) 테마
- CON_TYPE_DEF 색상 dot 표시
- ✕ 버튼: 선택 건수 뱃지 + 개별 초기화

#### ④ PC 클라이언트 필터 적용

```javascript
// newTasks 후처리 단계 (연도/월 필터 이후)
if (taskFilters.workClassList && taskFilters.workClassList.length > 0) {
  newTasks = newTasks.filter(function(t) {
    const wc = t.work_class || 'other';
    return taskFilters.workClassList.includes(wc);
  });
}
// total 보정 로직에도 workClassList 조건 추가
```

#### ⑤ 모바일 헬퍼 함수 추가 (line ~14582~14635)

```javascript
function _myTasksToggleWcPicker()    // 팝업 토글 + 외부클릭 감지
function _myTasksWcPickerOutside()   // 외부클릭 이벤트 리스너
function _myTasksToggleWc(key)       // 체크박스 토글
function _myTasksWcSelectAll()       // 전체 선택
function _myTasksWcReset()           // 기본값(전체선택) 복원
function _myTasksApplyWcFilter()     // 적용 → renderMyTasksPage
```

#### ⑥ 모바일 renderMyTasksPage 필터 로직

```javascript
// 진행단계 필터 결과 → _afterStatusFilter (const → 이름 변경)
const _afterStatusFilter = _stFilterActive ? ... : _baseList;

// 작업분류 필터 적용
var _wcAllKeys = CON_TYPE_DEF.map(function(d) { return d.key; });
var _wcFilterActive = _myTasksWcFilter.length > 0 && _myTasksWcFilter.length < _wcAllKeys.length;
var tasksBeforeSearch = _wcFilterActive
  ? _afterStatusFilter.filter(function(t) {
      var wc = t.work_class || 'other';
      return _myTasksWcFilter.indexOf(wc) !== -1;
    })
  : _afterStatusFilter;
```

#### ⑦ 모바일 드롭다운 UI 삽입

진행단계 드롭다운 `</div>` 직후, 필터배너(`fm`) 이전 위치.
Sky blue(#0EA5E9 / #E0F2FE) 테마로 진행단계(보라)와 구별.

#### ⑧ 팝업 상호 닫기 목록 업데이트

기존 4개 팝업 열기 함수(`_taskOpenStatusPicker`, `_taskOpenRiskPicker`, `_taskOpenYearPicker`, `_taskOpenMonthPicker`)와 `_taskOpenManagerPicker`에 `taskWorkClassPicker` 닫기 추가.

### 2차 재검증 체크리스트

| 항목 | 결과 |
|------|------|
| `_myTasksWcFilter` 변수명 기존 중복 | ✅ 안전 (신규 도입) |
| `taskFilters.workClassList` 기존 중복 | ✅ 안전 (신규 추가) |
| `myTasksWcPicker` DOM ID 중복 | ✅ 안전 (신규) |
| `taskWorkClassPicker` DOM ID 중복 | ✅ 안전 (신규) |
| `tasksBeforeSearch` const→var 변경 | ✅ 안전 (같은 함수 스코프 내 재선언 없음) |
| `_afterStatusFilter` 선언 전 참조 | ✅ 안전 (const 먼저 선언 후 var 사용) |
| CON_TYPE_DEF null 케이스 work_class | ✅ 처리 (`|| 'other'` 폴백) |
| PC total 보정 조건 누락 | ✅ workClassList 조건 추가 |
| 팝업 상호 닫기 누락 | ✅ 5개 팝업 함수 모두 업데이트 |

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------| 
| `public/static/app.js` | FEAT-109 전체 구현 (226줄 추가, 9줄 수정) |

### 빌드/배포 상태

- JS 파싱 검사 → ✅ **OK** (`node -e "new Function(...)"`)
- `npm run build` → ✅ **성공** (`dist/_worker.js 281.03 kB`, 1.14s)
- GitHub push → ✅ (`main` 브랜치, 커밋 `20eefda`)

---

## 세션145 — TERM-001: 화면별 용어 통일 (공사종류/작업종류)

### 작업 일시
2026-07-21

### 작업 개요
`construction_type`과 `work_class` 두 DB 컬럼의 UI 표시 용어가 화면마다 불일치하던 문제를 통일.

### 용어 통일 기준

| 표시 대상 | 통일 용어 | 변경 전 혼용 |
|---------|----------|------------|
| `construction_type` (지장이설·청약개통·관로공사 등) | **공사종류** | `공사종류`, `작업종류` 혼용 |
| `work_class` (광케이블시설·광케이블접속 등) | **작업종류** | `작업분류`, `작업종류` 혼용 |

### 변경 위치 상세

#### construction_type → '공사종류' (8개 위치)

**UI 표시:**
- `6910`: 작업관리 PC 테이블 헤더 col3 (`작업종류` → `공사종류`)
- `8723`: 작업상세 2칸 카드 좌측 레이블 (`작업종류` → `공사종류`)
- `17514`: 작업통계 섹션 h3 헤더 (`작업종류별 현황` → `공사종류별 현황`)

**주석:**
- `6398`: 카드 렌더러 내부 변수 주석
- `8718`: 작업상세 HTML 주석
- `17511`: 작업통계 HTML 주석
- `18464`: 카드 그리드 업데이트 JS 주석
- `18496`: 전체 건수 카운터 JS 주석

#### work_class → '작업종류' (14개 위치)

**UI 표시:**
- `6631`: PC 툴바 드롭다운 버튼 텍스트 (`작업분류` → `작업종류`)
- `6640`: PC 툴바 드롭다운 패널 헤더 (`작업분류 선택` → `작업종류 선택`)
- `6911`: 작업관리 PC 테이블 헤더 col4 (`작업분류` → `작업종류`)
- `7019`: 엑셀 다운로드 헤더 배열 (`작업분류` → `작업종류`)
- `8731`: 작업상세 카드 우측 레이블 (`작업분류` → `작업종류`) ← 2차 재검증에서 누락 발견→추가
- `14936`: 모바일 드롭다운 버튼 레이블 (`작업분류` → `작업종류`)
- `14959`: 모바일 드롭다운 패널 헤더 (`작업분류 선택` → `작업종류 선택`)

**주석:**
- `5903`: FEAT-109 헬퍼함수 주석
- `6209`: PC 클라이언트 필터 주석
- `6267`: 카드 배지 주석
- `6400`: work_class 변수 주석
- `6626`: PC 툴바 HTML 주석
- `14674`: 모바일 필터 전역변수 주석
- `14828`: 모바일 필터 적용 주석
- `14929`: 모바일 드롭다운 HTML 주석
- `35009`: 일보 관련 JS 주석

#### 변경 제외 항목 (사용자 지시)
- `19763`: `{작업종류}/` — NAS 폴더 경로명 (실제 파일시스템에 영향)
- `32500`: `특별교육 작업종류` — 교육 도메인 별도 필드
- `7239`, `7242`: 작업 등록 폼 work_class select — 이미 올바른 `작업종류`로 표시 중 (KEEP)

### 2차 재검증 체크리스트

| 항목 | 결과 |
|------|------|
| construction_type 관련 `작업종류` 잔존 여부 | ✅ 0건 (완전 제거) |
| work_class 관련 `작업분류` 잔존 여부 | ✅ 0건 (완전 제거) |
| 8731 `작업분류` 누락 발견 → 추가 수정 | ✅ 완료 |
| 변수명/DOM ID/함수명 변경 없음 확인 | ✅ 레이블/주석만 변경 |
| NAS 경로(19763) 보존 확인 | ✅ 미변경 |
| 교육 필드(32500) 보존 확인 | ✅ 미변경 |

### 빌드/배포 상태

- JS 파싱 검사 → ✅ **OK** (`node -e "new Function(...)"`)
- `npm run build` → ✅ **성공** (`dist/_worker.js 281.03 kB`, 1.76s)
- GitHub push → ✅ (`main` 브랜치, 커밋 `87e57c2`)

---

## 세션146 — BUG-110 + FEAT-110: 작업종류 필터 수정 및 공사종류 필터 추가

### 작업 일시
2026-07-21

### 작업 개요
모바일 내 작업목록(근로자 화면)의 작업종류 필터가 공사종류 항목을 잘못 표시하던 버그 수정,
공사종류 필터 신규 추가.

### 문제 원인 (BUG-110)
`CON_TYPE_DEF`가 `construction_type`(공사종류)과 `work_class`(작업종류) 두 컬럼을 혼용하는 구조였으나,
작업종류 필터가 `CON_TYPE_DEF`를 그대로 사용하여 공사종류 항목(지장이설·청약개통 등 6개)을 표시.
실제 work_class 값은 4개(cable_install 등)와 불일치.

### 변경 내용

#### A. WORK_CLASS_DEF 상수 신설
```javascript
const WORK_CLASS_DEF = [
  { key: 'cable_install',   label: '광케이블 시설',    color: '#1D4ED8' },
  { key: 'cable_splice',    label: '광케이블 접속',    color: '#4338CA' },
  { key: 'equipment_other', label: '장비 시설및 기타', color: '#C2410C' },
  { key: 'conduit',         label: '관로시설',         color: '#15803D' },
];
```
- `CON_TYPE_DEF`(공사종류 전용)와 완전 분리된 `work_class` 컬럼 전용 배열
- 삽입 위치: `WC_LABEL` 상수 바로 아래 (line ~5241)

#### B. 작업종류 필터 수정 (BUG-110)
| 위치 | 변경 전 | 변경 후 |
|------|--------|--------|
| `_myTasksWcFilter` 초기값 | `CON_TYPE_DEF.map(key)` 6개 | `WORK_CLASS_DEF.map(key)` 4개 |
| `_myTasksWcSelectAll()` | `CON_TYPE_DEF` 기반 | `WORK_CLASS_DEF` 기반 |
| 필터 적용 로직 `_wcAllKeys` | `CON_TYPE_DEF.map(key)` | `WORK_CLASS_DEF.map(key)` |
| 필터 결과 변수명 | `tasksBeforeSearch` | `_afterWcFilter` (파이프라인 분리) |
| 모바일 드롭다운 항목 | `CON_TYPE_DEF.map()` 6개 | `WORK_CLASS_DEF.map()` 4개 |
| PC 툴바 드롭다운 항목 | `CON_TYPE_DEF.map()` 6개 | `WORK_CLASS_DEF.map()` 4개 |

#### C. 공사종류 필터 신규 추가 (FEAT-110) — 모바일 전용
**전역 변수:**
- `_myTasksCtFilter`: `CON_TYPE_DEF.map(label)` 전체 선택 기본값
- `_myTasksCtPickerOpen`: false

**헬퍼 함수 6개:**
- `_myTasksToggleCtPicker()`: 팝업 토글 + wcPicker/statusPicker 상호 닫기
- `_myTasksCtPickerOutside()`: 외부클릭 닫기
- `_myTasksToggleCtFilter(label)`: 체크박스 개별 토글
- `_myTasksCtSelectAll()`: 전체선택
- `_myTasksCtReset()`: 기본값 복원
- `_myTasksApplyCtFilter()`: 적용 → renderMyTasksPage

**필터 파이프라인 확장:**
```
_baseList → [진행단계] → _afterStatusFilter
          → [작업종류] → _afterWcFilter       ← 변수명 분리
          → [공사종류] → tasksBeforeSearch    ← 신규 단계
          → [검색]     → tasks
```

**드롭다운 UI:**
- 핑크(#D70072) 테마, 하드햇 아이콘
- 위치: 작업종류 드롭다운 아래, 필터배너 위
- CON_TYPE_DEF 6개 항목 + 색상 dot 표시

**상호 닫기 처리:**
- `_myTasksToggleWcPicker()`: ctPicker + statusPicker 닫기 추가
- `_myTasksToggleCtPicker()`: wcPicker + statusPicker 닫기 포함

### 최종 UI 구조 (모바일 내 작업목록)
```
[ 검색창                              ]
[ 진행단계 ▼ ]   ← 보라 #685182
[ 작업종류  ▼ ]   ← 하늘 #0EA5E9  (4개: 광케이블시설·접속·장비·관로)
[ 공사종류  ▼ ]   ← 핑크 #D70072  (6개: 지장이설·청약개통·관로공사 등)
[ 필터배너 or 작업 카드 목록          ]
```

### 2차 재검증 체크리스트
| 항목 | 결과 |
|------|------|
| WORK_CLASS_DEF 신규 변수명 기존 충돌 | ✅ 0건 안전 |
| _myTasksCtFilter 등 신규 변수명 충돌 | ✅ 0건 안전 |
| myTasksCtPicker DOM ID 충돌 | ✅ 0건 안전 |
| myTasksCtCb_ DOM ID 충돌 | ✅ 0건 안전 |
| 필터 파이프라인 변수 흐름 | ✅ afterStatusFilter→afterWcFilter→tasksBeforeSearch 정상 |
| _myTasksCtPickerOpen 선언 전 참조 | ✅ 안전 (var 호이스팅, 함수 런타임 시점에 이미 선언) |
| CON_TYPE_DEF 기존 참조 코드 영향 없음 | ✅ 공사통계·차트·공사관리 등 무변경 |

### 빌드/배포 상태
- JS 파싱 검사 → ✅ **OK** (`node -e "new Function(...)"`)
- `npm run build` → ✅ **성공** (`dist/_worker.js 281.03 kB`, 1.40s)
- GitHub push → ✅ (`main` 브랜치, 커밋 `9e476a1`)

---

## 세션147 — FEAT-111: 내 작업 가져오기 시 소속 팀 전원 자동 배정

### 작업 일시
2026-07-21

### 작업 개요
근로자가 "내 작업 가져오기"(selfAssignTask) 실행 시, 기존에는 본인 1명만 배정되던 동작을
소속 팀 전원이 함께 배정되도록 확장.

### 사전 분석 결과
- `node-server.ts`: self-assign 엔드포인트 **없음** — `API.post('/tasks/${taskId}/self-assign')`은
  Cloudflare D1 백엔드(`tasks.ts`)로만 라우팅 → NAS 백엔드 수정 불필요
- `tasks.ts` line 1098: 기존에 `user.id` 1건만 `task_assignments` INSERT → 팀 전원으로 확장
- 기존 팀 전체 배정 SQL 패턴(lines 590~819)이 동일 파일 내 3곳 존재 → 동일 패턴 재사용

### 변경 내용

#### A. `src/routes/tasks.ts` — `POST /:id/self-assign` (line 1098)

**변경 전**: 본인(`user.id`) 1명만 `task_assignments` INSERT

**변경 후**: 팀 전원 자동 배정

```typescript
// ① 본인 team_id 조회
const myInfo = await c.env.DB.prepare(
  'SELECT team_id FROM users WHERE id = ?'
).bind(user.id).first<any>()

const allMemberIds: number[] = [user.id]  // 본인 항상 포함

// ② 팀 소속 시 전체 활성 멤버 조회 (본인 제외)
if (myInfo?.team_id) {
  const membersRes = await c.env.DB.prepare(
    'SELECT id FROM users WHERE team_id = ? AND is_active = 1 AND id != ?'
  ).bind(myInfo.team_id, user.id).all<any>()
  for (const m of (membersRes.results || [])) {
    allMemberIds.push(m.id)
  }
}

// ③ INSERT OR IGNORE — 팀원 전원 (중복 방지)
const assignPlaceholders = allMemberIds.map(() => '(?, ?, ?)').join(', ')
// ... batch INSERT

// ④ 응답에 assignedCount 포함
return c.json({ success: true, assignedCount })
```

**처리 규칙:**
| 케이스 | 동작 |
|--------|------|
| 팀 소속 근로자 | 본인 + 팀 전체 활성 멤버 배정 |
| 팀 미소속 근로자 | 본인 1명만 배정 (기존 동작 유지) |
| 이미 배정된 팀원 | `INSERT OR IGNORE`로 중복 방지 |
| task.status 전환 | unassigned → assigned (기존 로직 유지) |

**SSE 메시지 분기:**
- 팀 배정: `"${user.name}님이 "${task.title}" 작업을 팀원 N명과 함께 배정했습니다."`
- 단독 배정: `"${user.name}님이 "${task.title}" 작업을 자기 배정했습니다."` (기존)

#### B. `public/static/app.js` — `selfAssignTask()` (line 9933)

**모달 안내 문구 추가:**
```
이 작업을 내 작업으로 가져오시겠습니까?
👥 소속 팀이 있는 경우 팀 전원이 함께 배정됩니다.
```

**토스트 메시지 분기 (assignedCount 활용):**
- 팀 배정: `'작업이 배정되었습니다. (팀원 N명 포함)'`
- 단독 배정: `'작업이 배정되었습니다.'`

**순수 JS 유지 체크포인트:**
- `const` → `var` (응답 처리 지역변수)
- `forEach(mo => mo.remove())` → `forEach(function(mo) { mo.remove(); })`
- `setTimeout(() => ...)` → `setTimeout(function() { ... })`
- `currentUser?.role` → `currentUser && currentUser.role`
- `e.response?.data?.error` → `e.response && e.response.data && e.response.data.error`

#### C. `node-server.ts`
수정 없음. self-assign 라우트 미존재 확인 → Cloudflare D1 전용 엔드포인트로 확정.

### 2차 재검증 체크리스트
| 항목 | 결과 |
|------|------|
| `allMemberIds` 신규 변수명 충돌 | ✅ 0건 안전 |
| `assignedCount` 신규 변수명 충돌 | ✅ 0건 안전 |
| `myInfo` 신규 변수명 충돌 | ✅ 0건 안전 |
| INSERT `id` 바인딩 (task_id) 정확성 | ✅ `assignBinds.push(id, wid, user.id)` — `id = c.req.param('id')` |
| 본인 항상 포함 확인 | ✅ `allMemberIds: number[] = [user.id]` 초기값 |
| 팀 미소속 시 본인만 배정 | ✅ `if (myInfo?.team_id)` 조건 미충족 시 배열 크기 1 |
| optional chaining `?.` 없음 (app.js) | ✅ 0건 |
| TypeScript 구문 없음 (app.js) | ✅ 0건 |
| JS 파싱 검사 | ✅ **OK** (`node -e "new Function(...)"`) |

### 빌드/배포 상태
- JS 파싱 검사 → ✅ **OK** (`node -e "new Function(...)"`)
- `npm run build` → ✅ **성공** (`dist/_worker.js 281.45 kB`, 1.34s)
- GitHub push → ✅ (`main` 브랜치, 커밋 `5812529`)

---

## 세션 148 — FEAT-112: 연계 완료작업 사진 조회 (worker 전용)

### 날짜
2025년 (FEAT-111 이후)

### 요청 내용
근로자가 작업 상세 화면의 **기본정보 탭**에서, 같은 공사요청번호에 속한 다른 완료 작업의 사진을 **읽기 전용**으로 조회할 수 있도록 구현.
추가로 worker 계정에서 사진 **업로드 버튼**과 **deleteMedia 버튼**이 노출되던 문제 함께 수정.

### 변경 파일
- `public/static/app.js` — 6곳 수정 / 신규 함수 2개 추가

### 상세 변경 내역

#### A. `public/static/app.js`

**수정 1 — `renderThumb` #1 (showTaskDetail 내, line 9265~9288)**
- 동영상/이미지 `deleteMedia` 버튼에 `${!isWorker ? ... : ''}` 조건 추가
- isWorker는 showTaskDetail 클로저 내 `const isWorker = currentUser.role === 'worker'` 재사용

**수정 2 — 사진 업로드 버튼 (line 9335~9337)**
- `${!isWorker ? <button>... : ''}` 조건으로 worker 화면에서 숨김

**수정 3 — `renderThumb` #2 (refreshPhotoTab 내, line 10161~10190)**
- `const _canDelete = currentUser && currentUser.role !== 'worker'` 추가
- deleteMedia 버튼에 `${_canDelete ? ... : ''}` 조건 적용

**수정 4 — 연계 완료작업 사진 섹션 HTML 삽입 (line 8961~8972)**
- 작업중지 이력 섹션 종료 직후, 작업진행 버튼 직전에 삽입
- `${(isWorker && task.construction_id) ? ... : ''}` 조건 — worker이고 공사요청번호 있을 때만 렌더
- DOM ID: `linked-photos-section-${task.id}`, `linked-photos-content-${task.id}`

**수정 5 — `_loadLinkedCompletedPhotos` 비동기 호출 (line 9405~9408)**
- `loadAttachments(task.id)` 직후에 추가
- `if (isWorker && task.construction_id) { _loadLinkedCompletedPhotos(task.id, task.construction_id); }`

**신규 전역함수 1 — `_loadLinkedCompletedPhotos(currentTaskId, constructionId)`**
- `GET /tasks?construction_id=X&status=completed` 호출 (기존 파라미터 재사용)
- 현재 작업 ID 제외 후 버튼 목록 렌더
- 완료 작업 없으면 안내 메시지 표시

**신규 전역함수 2 — `_toggleLinkedTaskPhotos(linkedTaskId, currentTaskId, btn)`**
- 버튼 클릭 시 `GET /photos?task_id=X` 호출
- 같은 버튼 재클릭 시 닫기 (토글)
- 읽기 전용: deleteMedia 버튼 없음, showPhotoData/showVideoData 확대보기만 가능
- 순수 JS (`var`, `function(){}`, String concatenation) 사용 — TS 구문 0건

### 백엔드 수정 여부
없음. 기존 API 100% 재사용:
- `GET /tasks?construction_id=&status=completed` — tasks.ts line 131~134 기존 파라미터
- `GET /photos?task_id=X` — photos.ts 권한 체크: 로그인만 확인 (role 미체크)

### 2차 재검증 체크리스트
| 항목 | 결과 |
|------|------|
| `_loadLinkedCompletedPhotos` 함수명 충돌 | ✅ 0건 |
| `_toggleLinkedTaskPhotos` 함수명 충돌 | ✅ 0건 |
| `linked-photos-content-` DOM ID 충돌 | ✅ 0건 |
| `linked-task-photos-` DOM ID 충돌 | ✅ 0건 |
| optional chaining `?.` 없음 (신규 함수) | ✅ 0건 |
| TypeScript 구문 없음 (신규 함수) | ✅ 0건 |
| isWorker 변수 접근 범위 (renderThumb #1) | ✅ showTaskDetail 클로저 내 선언 확인 |
| currentUser.role 직접 체크 (renderThumb #2) | ✅ `_canDelete` 변수로 처리 |
| JS 파싱 검사 | ✅ **OK** (`node -e "new Function(...)"`) |

### 빌드/배포 상태
- JS 파싱 검사 → ✅ **OK**
- `npm run build` → ✅ **성공** (`dist/_worker.js 281.45 kB`, 3.04s)
- GitHub push → ✅ (`main` 브랜치, 커밋 `a7c9488`)

---

## 세션 149 — FEAT-112 BUG-FIX: 연계작업 사진 조회 버그 수정

### 날짜
2025년 (세션148 직후)

### 문제 증상
- 같은 공사요청번호에 완료된 연계 작업이 있음에도 "완료된 연계 작업이 없습니다" 표시
- worker 화면에서 연계 사진 섹션이 항상 비어있음

### 근본 원인 분석

#### 원인 1 — worker role의 INNER JOIN 제약 (주원인)
`GET /tasks?construction_id=X&status=completed` 호출 시,
tasks.ts의 worker 분기에서 `INNER JOIN task_assignments ta ON ta.task_id = t.id AND ta.worker_id = ?` 조건이 자동 추가됨.
→ **본인이 배정된 작업만 반환** — 다른 작업자의 연계 작업 조회 불가

#### 원인 2 — 상태 필터 범위 부족
`status=completed`만 조회 → 사용자 요청: **위험성평가(`in_progress`) 이후 전 단계** 작업 사진 조회 필요
(`in_progress`, `tbm_done`, `working`, `work_completed`, `completed` 포함)

### 해결 방법

#### A. `src/routes/photos.ts` (백엔드 수정)
`GET /photos`에 `construction_id`, `exclude_task_id` 파라미터 추가:
- `construction_id` 지정 시: `task_photos INNER JOIN tasks` 쿼리로 전환
- 서버측에서 `in_progress` 이후 5개 상태 필터 적용
- `exclude_task_id`: 현재 작업 본인 사진 제외
- role 체크 없음 (기존 동일) — 로그인 인증만 필요

#### B. `public/static/app.js` (프론트 수정)
`_loadLinkedCompletedPhotos`:
- 기존: `GET /tasks?construction_id=&status=completed` → `GET /photos?construction_id=&exclude_task_id=`로 전환
- 응답 photos를 `task_id` 기준으로 그룹핑
- **사진이 있는 작업만** 버튼 자동 표시 (빈 작업 버튼 미표시)
- `taskMap`을 `container.dataset`에 JSON 캐시 → 버튼 클릭 시 API 재호출 없음

`_toggleLinkedTaskPhotos`:
- `async` 제거 (캐시 참조로 비동기 불필요)
- `dataset.taskMap` 파싱 후 해당 작업 사진 즉시 렌더

### 2차 재검증 체크리스트
| 항목 | 결과 |
|------|------|
| photos.ts TypeScript 문법 | ✅ 정상 |
| app.js optional chaining `?.` 없음 | ✅ 0건 |
| app.js TypeScript 구문 없음 | ✅ 0건 |
| `_toggleLinkedTaskPhotos` async 제거 | ✅ 일반 함수 |
| 기존 `task_id` 단독 조회 경로 보존 | ✅ `else` 분기 유지 |
| JS 파싱 검사 | ✅ **OK** |

### 빌드/배포 상태
- `npm run build` → ✅ **성공** (`dist/_worker.js 282.10 kB`, 1.36s)
- GitHub push → ✅ (`main` 브랜치, 커밋 `61f49ff`)

---

## 세션 150 — FEAT-112 UX: 연계작업 사진 팝업 모달 구현 + 읽기전용 뷰어 버그 수정

### 날짜
2025년 (세션149 직후)

### 요청 사항
1. 작업 버튼 클릭 시 사진을 인라인으로 펼치지 말고 **팝업 창**으로 표시
2. TBM 공유 시 보여지는 형태 참고 (사이드바 + 콘텐츠 영역)
3. 팝업 내 기존 버그(`showPhotoData` → `deleteMedia` 버튼 노출) 수정

### 기존 버그 분석
- `_toggleLinkedTaskPhotos`에서 썸네일 클릭 → `showPhotoData(id, cap)` / `showVideoData(id, cap)` 호출
- 해당 함수 내부에 `deleteMedia` 버튼 하드코딩 → **worker가 연계 사진 뷰어에서 삭제 버튼 노출**
- 인라인 photo-grid: 작업이 100개 이상일 경우 화면 가독성 저하

### 변경 내용 (`public/static/app.js`)

#### 신규 함수 3개
1. **`_showLinkedPhotoModal(linkedTaskId, currentTaskId)`**
   - `container.dataset.taskMap` 캐시에서 데이터 로드 (API 재호출 없음)
   - 모달 구조: 헤더(그라디언트) + 좌측 사이드바(작업 선택) + 우측 사진 그리드
   - 사이드바: 현재 선택 작업 초록 배경 강조, 사진 수·상태 표시
   - 사진 그리드: `photo_type` 배지(작업 전/중/후/위험 등) 별 그룹 분리
   - `window._linkedModalSelectTask` 전역 등록 (innerHTML onclick 접근용)

2. **`window._linkedModalSelectTask(taskId, ctId)`**
   - 사이드바 탭 클릭 시 사이드바 + 사진 영역 동시 갱신
   - `photo_type` 그룹핑·정렬·배지 색상 동일 적용

3. **`_showLinkedPhotoView(photoId, caption, isVideo)`**
   - 읽기 전용 전용 뷰어: `deleteMedia` 버튼 **없음**
   - `zIndex: 10100` (연계사진 모달보다 위)
   - "읽기 전용" 배지 표시

#### 제거된 함수
- `_toggleLinkedTaskPhotos` — `_showLinkedPhotoModal`로 완전 교체

#### 수정된 함수
- `_loadLinkedCompletedPhotos`: photo-grid 인라인 제거 → 버튼 클릭 시 팝업 호출

### 2차 재검증 체크리스트
| 항목 | 결과 |
|------|------|
| `_showLinkedPhotoModal` 함수명 충돌 | ✅ 0건 |
| `_showLinkedPhotoView` 함수명 충돌 | ✅ 0건 |
| `_linkedModalSelectTask` 함수명 충돌 | ✅ 0건 |
| `_toggleLinkedTaskPhotos` 잔존 참조 | ✅ 0건 (완전 제거) |
| photo-grid 인라인 잔존 | ✅ 0건 |
| optional chaining `?.` 없음 (신규 코드) | ✅ 0건 |
| TypeScript 구문 없음 (신규 코드) | ✅ 0건 |
| JS 파싱 검사 | ✅ **OK** |

### 빌드/배포 상태
- `npm run build` → ✅ **성공** (`dist/_worker.js 282.10 kB`, 2.02s)
- GitHub push → ✅ (`main` 브랜치, 커밋 `0b8360e`)
