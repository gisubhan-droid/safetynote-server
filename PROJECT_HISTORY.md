# Safety NOTE - 프로젝트 전체 진행 이력

> 최종 업데이트: 2026-06-17 (세션 26)
> **서버 현재 버전: 60532aa** ← 최신
> NAS 배포 버전: 0b80f69 (git pull 필요 — 세션26 변경사항 미반영)
> **APK 자동 배포**: ✅ 완전 작동 확인 (v1.4.2 DB 반영 완료)

---

## 🗺️ 전체 개발 로드맵 (2026-06-17 확정)

> 비전문가도 직접 운영·배포할 수 있는 완성형 시스템 구축이 최종 목표

### Phase 1 — 현재 진행 중 (버그 수정 / 안정화)
| 항목 | 상태 | 내용 |
|------|------|------|
| FEAT-024 모바일 스크롤 팝업 닫힘 | 🔄 실기기 확인 중 | CSS pointer-events 방식 적용, 실기기 검증 필요 |
| BUG-002 사진 탭 그룹 표시 | 🔴 미해결 | photo_type+caption 2단계 그룹핑 미반영 |

### Phase 2 — 외부 푸시 알림 (FEAT-025)
| 항목 | 내용 |
|------|------|
| **목표** | 앱에서 외부로 푸시 알림 발송 (Android 네이티브 수신) |
| **방식** | Firebase FCM (무료) — 서버→FCM→앱 Push |
| **서버측** | node-server.ts에 FCM 발송 API 추가 |
| **앱측** | safetynote-android FCM SDK 연동 |
| **알림 트리거** | TBM 미서명, 작업 배정, 긴급 안전 공지 등 |
| **비전문가 운영** | 관리자 화면에서 버튼 클릭으로 발송 |

### Phase 3 — 시스템 최적화 (FEAT-026)
| 항목 | 내용 |
|------|------|
| **목표** | 챕터(현장/팀)별 DB 분리 운영 |
| **방식** | 현재 단일 SQLite → 멀티 DB 구조 (현장코드별 별도 .db 파일) |
| **효과** | 데이터 격리, 백업 단위 분리, 성능 향상 |
| **기타** | 쿼리 최적화, 인덱스 정비, 불필요 API 정리 |

### Phase 4 — NAS 설치 매뉴얼 (DOCS-001)
| 항목 | 내용 |
|------|------|
| **목표** | 비전문가도 NAS에 혼자 설치할 수 있는 단계별 가이드 |
| **대상** | Synology NAS (DSM 7.x) |
| **포함 내용** | Node.js 설치 → git clone → .env 설정 → PM2 등록 → HTTPS 인증서 |
| **형식** | PDF + 스크린샷 포함 문서 |

### Phase 5 — 버전 업데이트 자동화 (FEAT-027)
| 항목 | 내용 |
|------|------|
| **목표** | NAS에서 클릭 한 번으로 서버 업데이트 완료 |
| **방식** | 관리자 화면 "업데이트 확인" 버튼 → git pull → pm2 restart 자동 실행 |
| **안전장치** | 업데이트 전 자동 백업, 실패 시 자동 롤백 |
| **비전문가 운영** | SSH 없이 브라우저에서 전체 업데이트 가능 |

### Phase 6 — 배포 버전 생성 (RELEASE-1.0) ← 최종 마무리
| 항목 | 내용 |
|------|------|
| **목표** | 완성형 배포 패키지 생성 |
| **서버** | NAS 설치 패키지 (install.sh 원클릭 설치 스크립트) |
| **앱** | 서명된 Release APK (GitHub Actions 자동 빌드) |
| **문서** | 설치 매뉴얼 + 운영 가이드 + 업데이트 방법 |
| **버전** | 서버 v2.0.0 + APK v2.0.0 동시 릴리즈 |

---

### 📌 Phase별 우선순위 및 의존관계
```
Phase 1 (안정화) → Phase 2 (푸시알림) → Phase 3 (최적화)
                                       → Phase 4 (설치매뉴얼)
                                       → Phase 5 (업데이트자동화)
Phase 2 + 3 + 4 + 5 완료 → Phase 6 (배포버전) ← 최종
```

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
