# SafetyNOTE — APK 빌드 가이드

> 최초 작성: 세션 87 (2026-07-26)
> 마지막 업데이트: 세션 145 (2026-08-07)
> 대상: AI 에이전트 (다음 세션에서 APK 빌드 요청 시 이 문서 참조)

---

## 📌 핵심 요약 (에이전트용)

APK 빌드는 **GitHub Actions `build-apk.yml` workflow_dispatch** 방식으로 실행한다.
로컬 Gradle 빌드 불필요. REST API 한 번 호출로 완료.

---

## 1. 저장소 구조

| 저장소 | 역할 | 경로 |
|--------|------|------|
| `gisubhan-droid/safetynote-server` | 웹앱 (Hono + app.js) | `/home/user/webapp/` |
| `gisubhan-droid/safetynote-android` | Android APK (Capacitor 6.x) | `/home/user/safetynote-android/` |

> **APK 빌드는 `safetynote-android` 저장소 기준.**
> 웹앱 코드(`app.js`)는 `safetynote-server`에만 있으며, APK는 서버 URL을 가리키는 WebView 앱이므로
> 웹앱 코드 수정만으로는 APK 재빌드 불필요. **Android 네이티브 코드 또는 `capacitor.config.json` 변경 시에만 APK 재빌드 필요.**

---

## 2. APK 재빌드가 필요한 경우

| 변경 대상 | APK 재빌드 필요? |
|-----------|----------------|
| `app.js` (프론트엔드 로직) | ❌ 불필요 (서버 배포만으로 즉시 반영) |
| `src/index.tsx` (Hono 서버) | ❌ 불필요 |
| `capacitor.config.json` | ✅ **필요** |
| `android-overrides/` (MainActivity.java 등) | ✅ **필요** |
| `www/index.html` (스플래시/서버설정 화면) | ✅ **필요** |
| FCM 설정 (`google-services.json`) | ✅ **필요** |
| 앱 아이콘 변경 | ✅ **필요** |
| 앱 버전 번호 변경 | ✅ **필요** |

---

## 3. APK 빌드 절차

### 3-1. 사전 준비

```bash
# GitHub 환경 설정 (항상 먼저 실행)
# setup_github_environment 툴 호출

# 토큰 확인
cd /home/user/safetynote-android
TOKEN=$(git remote get-url origin | grep -oP 'ghp_[A-Za-z0-9]+')

# 현재 최신 커밋 확인
git log --oneline -3
```

### 3-2. 버전 결정 규칙

- 현재 최신 APK 버전: **v1.4.17** (세션 145 기준)
- 다음 빌드 시 **버전을 +0.0.1 올린다**: `1.4.17` → `1.4.18`
- 형식: `MAJOR.MINOR.PATCH` (예: `1.4.16`)

### 3-3. GitHub Actions workflow_dispatch 실행

```bash
# safetynote-android 디렉토리에서 실행
cd /home/user/safetynote-android

TOKEN=$(git remote get-url origin | grep -oP 'ghp_[A-Za-z0-9]+')

curl -s -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/gisubhan-droid/safetynote-android/actions/workflows/build-apk.yml/dispatches" \
  -d "{
    \"ref\": \"main\",
    \"inputs\": {
      \"version\": \"1.4.XX\",
      \"release_note\": \"fix: [BUG-XXX] 수정 내용 요약\",
      \"force_update\": \"false\"
    }
  }"
# 응답 없음(빈 줄) = HTTP 204 = 성공
```

> `force_update: "true"` 는 앱 내 강제 업데이트 팝업을 띄울 때 사용. 보통은 `"false"`.

### 3-4. 빌드 상태 모니터링

```bash
# 3~5초 후 실행 확인
sleep 5
TOKEN=$(cd /home/user/safetynote-android && git remote get-url origin | grep -oP 'ghp_[A-Za-z0-9]+')

curl -s \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/gisubhan-droid/safetynote-android/actions/runs?per_page=3" \
  | python3 -c "
import json, sys
runs = json.load(sys.stdin).get('workflow_runs', [])
for r in runs[:3]:
    print(f\"ID:{r['id']}  status:{r['status']}  conclusion:{r['conclusion']}  created:{r['created_at']}\")
"
```

```bash
# 빌드 완료 확인 (RUN_ID 교체)
curl -s \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/gisubhan-droid/safetynote-android/actions/runs/RUN_ID" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
print(f\"status:{r['status']}  conclusion:{r['conclusion']}\")
"
# conclusion: success → 완료
# 평균 소요 시간: 약 2~3분
```

### 3-5. 릴리즈 및 다운로드 URL 확인

```bash
TOKEN=$(cd /home/user/safetynote-android && git remote get-url origin | grep -oP 'ghp_[A-Za-z0-9]+')

curl -s \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/gisubhan-droid/safetynote-android/releases/latest" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
print(f\"태그: {r.get('tag_name')}\")
print(f\"이름: {r.get('name')}\")
for a in r.get('assets', []):
    print(f\"APK:  {a['browser_download_url']}\")
    print(f\"크기: {a['size']//1024//1024:.1f} MB\")
"
```

---

## 4. 빌드 워크플로우 동작 내용 (`build-apk.yml`)

빌드 시 자동으로 수행되는 작업:

1. `npm ci` — npm 패키지 설치
2. `npx cap add android` — Capacitor Android 플랫폼 추가
3. `npx cap sync android` — 웹 에셋 동기화
4. `android-overrides/` 적용:
   - `MainActivity.java` 복사 (JS↔Java 브릿지: saveAuthToken, downloadApk 등)
   - `MyFirebaseMessagingService.java` 복사 (FCM)
   - `google-services.json` 복사
   - `AndroidManifest.xml` 교체 (권한: GPS, 카메라, 알림 등)
   - 아이콘 PNG 5종 복사 (mdpi~xxxhdpi)
   - Adaptive icon XML 삭제 (PNG 우선 적용)
5. 핵심 파일 검증 (SafetyNoteAppBridge, saveAuthToken, downloadApk 등)
6. FCM SDK Gradle 주입 (`firebase-messaging:23.4.0`)
7. 버전 코드/이름 주입 (`versionCode`, `versionName`)
8. Keystore 복원 (GitHub Secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)
9. `./gradlew assembleRelease` 서명 빌드
10. GitHub Release 생성 (`v버전` 태그)
11. **NAS Webhook 자동 호출** → NAS 서버에 APK 자동 배포

---

## 5. 빌드 입력값 (workflow_dispatch inputs)

| 파라미터 | 설명 | 기본값 | 예시 |
|---------|------|--------|------|
| `version` | APK 버전 문자열 | `1.4.14` | `1.4.16` |
| `release_note` | GitHub Release 설명 | (이전 내용) | `fix: [BUG-168] 설명` |
| `force_update` | 강제 업데이트 팝업 | `false` | `true` / `false` |

---

## 6. GitHub Actions URL

- **워크플로우 목록**: https://github.com/gisubhan-droid/safetynote-android/actions
- **릴리즈 목록**: https://github.com/gisubhan-droid/safetynote-android/releases
- **최신 릴리즈**: https://github.com/gisubhan-droid/safetynote-android/releases/latest

---

## 7. APK 빌드 이력

| 버전 | 세션 | 커밋 | 주요 변경 |
|------|------|------|-----------|
| v1.4.13 | 이전 | - | BUG-011 첨부파일 다운로드 수정 |
| v1.4.14 | 이전 | `ff62cbf` | BUG-011 Thread 방식 교체, 컴파일 오류 수정 |
| v1.4.15 | 세션87 | `a172a6f` | **BUG-IME: `captureInput: false` — 한글 IME 근본 수정** |
| v1.4.16 | 세션98 | `45f995e` | **BUG-179b: `saveImageToGallery()` 브릿지 추가 — Android 갤러리 직접 저장** |
| v1.4.17 | 세션145 | `04782ca` | **FEAT-218: FCM 알림 클릭 → 해당 화면 이동 — MyFirebaseMessagingService data→Intent + MainActivity handleFcmIntent** |

---

## 8. 주요 파일 위치

```
/home/user/safetynote-android/
├── capacitor.config.json          ← captureInput 등 WebView 설정
├── package.json                   ← Capacitor 6.x 버전
├── www/index.html                 ← 앱 스플래시 + 서버 주소 설정 화면
├── safetynote-release.keystore    ← 릴리즈 서명 키스토어 (로컬 전용)
├── setup-and-build.sh             ← 로컬 디버그 빌드 스크립트
├── make-snupdate.sh               ← 업데이트 패키지 생성 스크립트
├── .github/workflows/
│   └── build-apk.yml              ← ⭐ GitHub Actions 빌드 워크플로우
└── android-overrides/
    └── app/src/main/java/me/linkmax/safetynote/
        ├── MainActivity.java      ← JS↔Java 브릿지 (downloadApk, saveAuthToken 등)
        └── MyFirebaseMessagingService.java  ← FCM 푸시 알림
```

---

## 9. 주의사항

- **`wrangler login` 불가** — 샌드박스에서 OAuth 인증 불가. GitHub REST API 직접 호출만 사용.
- **`gh workflow run` 403 오류** — gh CLI 인증 방식 문제. 대신 `curl` + REST API 사용.
- **Keystore는 GitHub Secrets에 등록됨** — 로컬(`safetynote-release.keystore`)은 참고용. 빌드는 GitHub Actions에서 자동 복원.
- **APK 빌드 후 NAS 자동 배포** — 빌드 완료 후 NAS Webhook이 자동 호출됨. 앱 내 업데이트 알림 자동 발송.
