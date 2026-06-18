# SafetyNOTE APK 버전 업데이트 기록

> Android APK 릴리즈 이력 (최신순)
> 서버 연동 커밋은 `safetynote-server`, 앱 커밋은 `safetynote-android` 기준

---

## [v1.4.7] — 2026-06-18

**상태**: ✅ 빌드 완료 (Run #27752523683)
**APK 파일명**: `safetynote-v1.4.7.apk`

### 변경 사항
- **BUG-010-4 수정**: FCM 토큰 등록 실패 근본 원인 해결
  - NAS 서버 HTTP 포트 3444 추가 (`node-server.ts`)
  - Android `HttpURLConnection`이 HTTPS(3443)로 FCM 등록 시 SSLHandshakeException 발생
  - 해결: HTTP 전용 포트 3444 추가 → Android는 `http://...:3444`로 토큰 등록
- **연관 서버 커밋**: `c4c77de` (서버), `e8d4bd2` (앱)

### 호환 서버 버전
- 서버 커밋 `c4c77de` 이상 필요 (HTTP 3444 포트)

---

## [v1.4.6] — 2026-06-18

**상태**: ✅ 빌드 완료 (Run #27748680201)
**APK 파일명**: `safetynote-v1.4.6.apk`

### 변경 사항
- **BUG-010-1 수정**: FCM SSL 폴백
  - `HttpURLConnection` HTTPS → HTTP 자동 전환
- **BUG-010-2 수정**: APK 다운로드 브릿지
  - `downloadApk()` JS→Java 브릿지 호출 방식으로 변경
- **연관 서버 커밋**: `f1c05c1` (서버), `8e5144f` (앱)

---

## [v1.4.5] — 2026-06-18

**상태**: ✅ 빌드 완료
**APK 파일명**: `safetynote-v1.4.5.apk`

### 변경 사항
- **BUG-009 수정**: FCM JWT 브릿지
  - `doLogin()`/`doLogout()` JS→Java 브릿지 호출 추가
  - 로그인 후 FCM 토큰 서버 자동 등록
- **연관 서버 커밋**: `decb91e` (서버), `06380c1` (앱)

---

## [v1.4.4] — 2026-06-18

**상태**: ✅ 빌드 완료 + 실기기 설치 확인 (Run #27744945922, 5.7MB)
**APK 파일명**: `safetynote-v1.4.4.apk`

### 변경 사항
- **BUG-008 수정**: 서버 설정 화면 개선
  - 서버 URL/포트 수정 가능
  - 접속 테스트 버튼 추가
  - 포트 기본값 3443 설정
- **연관 앱 커밋**: `c74b6ab`

---

## [v1.4.3] — 2026-06-18

**상태**: ✅ 빌드 완료
**APK 파일명**: `safetynote-v1.4.3.apk`

### 변경 사항
- FCM 서버 push/register API 연동 초기 버전
- **연관 서버 커밋**: `d32c632`

---

## [v1.4.2] — 2026-06-15

**상태**: ✅ 자동 배포 완전 작동
**APK 파일명**: `safetynote-v1.4.2.apk`

### 변경 사항
- APK 완전 자동 배포 시스템 구축
  - GitHub Actions → NAS Webhook → 로컬 저장 → DB 자동 업데이트
- Webhook DB 버그 수정 (`DB.prepare()` D1 래퍼 → `rawDb.prepare()` better-sqlite3 동기)
- **연관 서버 커밋**: `0b80f69`

---

## [v1.4.1] — 2026-06-15

**상태**: ✅ NAS 자동 배포 완료
**APK 파일명**: `safetynote-v1.4.1.apk`

### 변경 사항
- 물량통계 4가지 개선 (달성금액 막대그래프·주간조회·팀별내역테이블·접속탭 그래프+현황표)
- DB 초기화 기능 (시스템관리자)
- APK 배포 관리 (로그인화면 다운로드버튼·관리자 업로드UI·`/api/dist/apk/*` API 3개)
- `better-sqlite3` v9.6.0 다운그레이드
- **연관 서버 커밋**: `c71ae99`

---

## [v1.4.0] — 2026-06-14

**상태**: ✅ GitHub 배포 완료
**APK 파일명**: `safetynote-v1.4.0.apk`

### 변경 사항
- 외선일보 목록 "완료된 작업 없음" 수정 (tasks.ts 응답 `{ tasks }` 래핑 + `work_reports` JOIN)
- 물량통계 500 에러 수정 (WHERE 절 `t` 별칭 중복 버그 + extras 기반 통계 재구성)
- **연관 서버 커밋**: `8d6f0b6`

---

## [v1.3.0] — 2026-06-11

**상태**: ✅ GitHub Release 빌드 완료 (서명 빌드)
**APK 파일명**: `safetynote-v1.3.0.apk`

### 변경 사항
- 4단계 로그인 개선 (아이디 저장/비밀번호 토글/로딩 스피너)
- 5단계 앱 설정 (테마/알림/글자크기/진동)
- 2단계 GPS 위치 추적 (작업일지 위치 자동기록+이력조회)
- **연관 서버 커밋**: GitHub Actions Run #27330508906

---

## [v1.2.5] — 2026-06-10

**상태**: ✅ GitHub Release 빌드 완료 (서명 빌드)
**APK 파일명**: `safetynote-v1.2.5.apk`

### 변경 사항
- APK 다운로드 방식 개선 (`https://` → `http://` 자동 변환)
- DownloadManager SSL 예외 공유 이슈 해결

---

## 📋 버전별 호환 서버 커밋 요약

| APK 버전 | 최소 서버 커밋 | 주요 서버 기능 |
|----------|--------------|--------------|
| **v1.4.7** | `c4c77de` | HTTP 3444 포트 (FCM 전용) |
| **v1.4.6** | `f1c05c1` | APK 다운로드 브릿지 |
| **v1.4.5** | `decb91e` | FCM 토큰 등록 API |
| **v1.4.4** | 서버 무관 | 앱 내부 개선 |
| **v1.4.3** | `d32c632` | FCM push/register API |
| **v1.4.2** | `0b80f69` | Webhook DB 버그 수정 |
| **v1.4.1** | `c71ae99` | APK 배포관리 API |
| **v1.4.0** | `8d6f0b6` | 외선일보/물량통계 버그수정 |

---

## 🔔 APK 자동 배포 구조

```
GitHub Actions (build-apk.yml)
  ↓ 빌드 완료
  ↓ NAS Webhook 호출 (POST /api/dist/apk/webhook)
NAS 서버
  ↓ APK 파일 다운로드 저장
  ↓ DB apk_version / apk_url 업데이트
로그인 화면
  ↓ apk_version 표시 + 다운로드 버튼
사용자
  ↓ safetynote-v{VERSION}.apk 다운로드
```

> ※ 수동 배포 시: 관리자 시스템 설정 → APK 배포 관리 → 파일 업로드 또는 URL 입력
