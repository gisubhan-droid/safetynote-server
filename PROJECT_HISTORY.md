# Safety NOTE - 프로젝트 전체 진행 이력

> 최종 업데이트: 2026-06-10 (세션 8)
> **앱 현재 버전: v1.2.5** ← 최신 (✅ GitHub Release 빌드 완료)
> NAS 배포 버전: v1.2.5 (PORT=3443 ✅, HTTPS ✅, PM2 online ✅, systemd 자동시작 ✅)
> **다음 작업**: 4단계(로그인 개선) → 5단계(앱 설정) → 2단계(GPS) → 빌드 v1.3.0

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
| **v1.2.5** | **2026-06-10** | 🔲 GitHub Release 빌드필요 | PC/브라우저 업데이트 팝업 제거, WebView(앱)에서만 업데이트 모달 표시, GitHub Release 자동배포 전환 |

---

## 🔧 이슈별 수정 이력 (전체)

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

### 🟡 [중간] build-apk.yml 버전 수동 업데이트 필요
- GitHub App 권한 제한으로 `.github/workflows/` 자동 push 불가
- **매 버전마다 GitHub 웹 UI에서 직접 수정 필요**
- 현재 기본값: `1.2.5` (최신 적용 상태)
- 수정 URL: https://github.com/gisubhan-droid/safetynote-android/blob/main/.github/workflows/build-apk.yml

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
| 2단계 | 📍 GPS 위치 추적 | **🔧 부분 구현** | 점검/위험 기록 시 GPS 주소 조회 있음. 실시간 위치 추적 없음 |
| 3단계 | 🔄 자동 업데이트 | **✅ 완성** | syncInstalledVersion() + DownloadManager 완성 |
| 4단계 | 👤 로그인 화면 개선 | **🔧 기본 구현** | 기본 로그인 폼만 있음. 아이디 저장/자동완성 없음 |
| 5단계 | ⚙️ 앱 설정 메뉴 | **🔧 부분 구현** | 테마 선택 패널 있음. 사용자 전용 설정 페이지 없음 |
| 6단계 | 📦 Release APK 빌드 | **✅ 완성** | v1.2.5 서명 빌드 완료 |

#### 진행 순서 결정
1. **4단계 (로그인 화면 개선)** — 빠르고 임팩트 있음 → **먼저 진행**
2. **5단계 (앱 설정 메뉴)** — 사용자 설정 페이지 신규 추가
3. **2단계 (GPS 위치 추적)** — 출퇴근 위치 자동 기록 등 기능 확장

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

**현재 구현 상태 (🔧 부분 구현)**:
- `app.js` — `getGPSAddress()`, `getGPSAddressWithConsent()`: 점검/위험 기록 시 GPS 주소 조회
- `MainActivity.java` — 런타임 GPS 권한 요청 (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`)
- `AndroidManifest.xml` — GPS 권한 선언

**남은 작업**:
- [ ] 출퇴근(근태) 기록 시 위치 자동 저장 (`worklogs` 테이블 `location` 컬럼 활용)
- [ ] 위치 기록 이력 조회 UI (내 계정 → 위치 이력 탭)
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

## 🔢 개발 우선순위 (세션 8 기준)

```
✅ 완료        : 3단계(자동업데이트), 6단계(APK 빌드)
🚧 진행 예정   : 4단계 → 5단계 → 2단계 → 1단계 확인
⏸️ 보류        : 강제업데이트 UI, 네이티브 푸시알림
```

| 순서 | 단계 | 작업 | 예상 난이도 |
|------|------|------|------------|
| 1 | 4단계 | 로그인 화면 개선 (아이디 저장, 자동완성, 로딩) | ⭐ 쉬움 |
| 2 | 5단계 | 앱 설정 메뉴 (설정 카드 추가) | ⭐⭐ 보통 |
| 3 | 2단계 | GPS 위치 추적 (출퇴근 위치 저장) | ⭐⭐⭐ 어려움 |
| 4 | 1단계 | 알림 기능 Android 수신 테스트 | ⭐ 쉬움 (테스트만) |
