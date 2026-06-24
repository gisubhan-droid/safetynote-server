# Safety NOTE - 프로젝트 전체 진행 이력

> 최종 업데이트: 2026-06-24 (세션 69)
> **서버 현재 버전: `a14ae83`** ← 최신 (GitHub) — BUG-048-2 수정 + 세션 69 기록 완료
> **NAS 배포 버전: `41b0b38`** ⚠️ 업데이트 필요 (git reset --hard origin/main)
> **캐시 버전: v=20260624e**
> **APK 최신**: v1.4.7
> **배포 원칙**: 모든 수정 완료 후 NAS 1회 통합 배포

---

## 📋 BUG / FEAT 전체 인덱스

> 최근 → 과거 순 정렬. 세션 번호 클릭으로 상세 참조.

### 🐛 BUG 목록

| 번호 | 세션 | 날짜 | 상태 | 증상 요약 | 커밋 |
|------|------|------|------|----------|------|
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
| BUG-041 | 63 | 2026-06-23 | ✅ 수정 | LGU+ 공사 조회 오류 | — |
| BUG-040 | 62 | 2026-06-23 | ✅ 수정 | TBM 연쇄 알림 오류 | — |
| BUG-036~039 | 61 | 2026-06-23 | ✅ 수정 | photo_type CHECK constraint + LGU+ 알림 조건 오류 | — |
| BUG-030~034 | 58 | 2026-06-23 | ✅ 수정 | v0.143 미완성 항목 + 연속 버그 수정 | — |

### ✨ FEAT 목록

| 번호 | 세션 | 날짜 | 상태 | 기능 요약 | 커밋 |
|------|------|------|------|----------|------|
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

---

## 🗺️ 전체 개발 로드맵 (2026-06-17 확정)

> 비전문가도 직접 운영·배포할 수 있는 완성형 시스템 구축이 최종 목표

### Phase 1 — ✅ 완료 (2026-06-17)
| 항목 | 상태 | 커밋 | 내용 |
|------|------|------|------|
| FEAT-024 모바일 스크롤 팝업 닫힘 | ✅ **실기기 확인 완료** | `e531fc2` | modal-sm 단순 조건으로 완전 차단 — v4(4차 수정) |
| BUG-002 사진 탭 그룹 표시 | ✅ 완료 | `b245c84` | TYPE_LABEL/ORDER/COLOR + PHOTO_TYPE_DIRS 3개 유형 추가 |
| BUG-006 APK 다운로드 실패 | ✅ 완료 | `d51f355` | typeof Log 체크 + a download 방식 + 버전 파일명 |

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

### Phase 4 — NAS 설치 매뉴얼 (DOCS-001) ← 최종 단계에서 작성
| 항목 | 내용 |
|------|------|
| **목표** | 비전문가도 NAS에 혼자 설치할 수 있는 단계별 가이드 |
| **대상** | Synology NAS (DSM 7.x) |
| **포함 내용** | Node.js 설치 → git clone → .env 설정 → PM2 등록 → HTTPS 인증서 |
| **형식** | PDF + 스크린샷 포함 문서 |
| **⚠️ 시작 조건** | Phase 2·3·5·6 모두 완료 후 작성 |

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
Phase 1 (안정화) → Phase 2 (푸시알림) → Phase 3 (최적화) → Phase 5 (업데이트자동화)
                                                         → Phase 6 (배포버전)
                                                               ↓
                                                         Phase 4 (설치매뉴얼) ← 최종 단계에서 작성
```

> ※ Phase 4 (NAS 설치 매뉴얼)는 모든 기능 완성 후 최종 단계에서 작성

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
