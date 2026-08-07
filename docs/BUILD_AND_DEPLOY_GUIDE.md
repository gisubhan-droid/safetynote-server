# SafetyNOTE — 서버 빌드 & 배포 가이드

> 최초 작성: 세션 87 (2026-07-26)
> 마지막 업데이트: 세션 145 (2026-08-07)
> 목적: **에이전트 전용 참조 파일** — 다음 세션에서 빌드/배포 요청 시 이 파일을 먼저 읽는다.

---

## 📌 핵심 요약 (에이전트용)

| 항목 | 방법 |
|------|------|
| **서버 코드 배포** | `git push origin main` → GitHub Actions 자동 NAS 배포 |
| **APK 빌드** | `docs/APK_BUILD_GUIDE.md` 참조 |
| **NAS 수동 업데이트** | NAS에서 `git pull origin main && pm2 restart safetynote` |

> **서버는 push만 하면 끝.** GitHub Actions(`build-server.yml`)가 자동으로 모든 NAS에 Webhook 전송 → NAS가 스스로 git pull + 재시작.

---

## 1. 저장소 구조

| 저장소 | 용도 | 로컬 경로 |
|--------|------|-----------|
| `gisubhan-droid/safetynote-server` | 웹앱 서버 코드 | `/home/user/webapp/` |
| `gisubhan-droid/safetynote-android` | Android APK | `/home/user/safetynote-android/` |

---

## 2. 서버 코드 빌드 & 배포 절차

### 2-1. 코드 수정 후 표준 커밋 절차

```bash
cd /home/user/webapp

# 1. 문법 검증 (RULE-001: app.js는 var 전용)
node --check public/static/app.js

# 2. 빌드 검증
npm run build

# 3. 커밋 & 푸시
git add -A
git commit -m "fix: [BUG-XXX] 수정 내용 요약"
git push origin main
```

### 2-2. push 후 자동 처리 흐름

```
git push origin main
        ↓
GitHub Actions build-server.yml 자동 실행
        ↓
nas-registry.json 의 활성 NAS 목록 읽기
        ↓
각 NAS에 Webhook POST /api/admin/update/webhook 전송 (배치, 10대씩)
        ↓
NAS 자동 처리:
  git fetch + git reset --hard origin/main
  → npm run build
  → pm2 restart safetynote
```

> **트리거 조건**: `.md` 파일, `docs/**`, `build-apk.yml` 변경은 자동 배포 **건너뜀**
> (순수 문서 수정은 NAS 재시작 불필요하므로)

### 2-3. 캐시 버스팅

서버 코드(`app.js`, `index.tsx`) 수정 시 **반드시** `src/index.tsx`의 버전 문자열 갱신:

```typescript
// src/index.tsx 내 app.js 로드 라인
<script src="/static/app.js?v=YYYYMMDD{a/b/c...}"></script>
```

- 형식: `20260726a` → 같은 날 두 번째 배포면 `20260726b`
- **현재 최신**: `?v=20260726c` (세션 87 기준)

---

## 3. GitHub Actions 워크플로우

### 3-1. build-server.yml (서버 자동 배포)

| 항목 | 내용 |
|------|------|
| **파일** | `.github/workflows/build-server.yml` |
| **트리거** | `main` 브랜치 push (`.md`/`docs/**` 제외) |
| **동작** | `nas-registry.json` 등록 NAS 전체에 업데이트 Webhook 전송 |
| **필요 Secret** | `DEPLOY_WEBHOOK_SECRET` |
| **타임아웃** | 30분 |

### 3-2. build-apk.yml (APK 빌드)

> **→ `docs/APK_BUILD_GUIDE.md` 참조**

| 항목 | 내용 |
|------|------|
| **파일** | `safetynote-android/.github/workflows/build-apk.yml` |
| **트리거** | `workflow_dispatch` (수동 실행) |
| **동작** | Capacitor 빌드 → 서명 APK → GitHub Release 생성 → NAS Webhook |
| **현재 최신 버전** | `v1.4.17` |

---

## 4. NAS 배포 대상 관리 (`nas-registry.json`)

```json
{
  "batch_size": 10,
  "batch_delay_sec": 5,
  "nas_list": [
    {
      "id": "NAS001",
      "name": "LinkMax 본사",
      "url": "https://linkmax.myds.me:3443",
      "active": true
    }
  ]
}
```

### NAS 추가 방법
```json
// nas-registry.json 에 항목 추가 후 git push
{
  "id": "NAS002",
  "name": "현장명",
  "url": "https://현장NAS주소:3443",
  "active": true
}
```

### NAS 비활성화 (임시 제외)
```json
"active": false   // 이 NAS는 Webhook 전송 건너뜀
```

---

## 5. GitHub Secrets 목록

| Secret 이름 | 저장소 | 용도 |
|-------------|--------|------|
| `DEPLOY_WEBHOOK_SECRET` | safetynote-server | NAS 자동 업데이트 Webhook 인증 |
| `KEYSTORE_BASE64` | safetynote-android | APK 서명 키스토어 (base64) |
| `KEYSTORE_PASSWORD` | safetynote-android | 키스토어 비밀번호 |
| `KEY_ALIAS` | safetynote-android | 키 별칭 |
| `KEY_PASSWORD` | safetynote-android | 키 비밀번호 |

---

## 6. 빌드/푸시 이력

| 세션 | 날짜 | 커밋 | 내용 | 비고 |
|------|------|------|------|------|
| 세션 85 | 2026-07-26 | `fc33a03` | 브라우저 로컬TZ 방식 전면 전환 | |
| 세션 86 | 2026-07-26 | `ffc0b30` | BUG-166 photoCaption 한글 IME 수정 | |
| 세션 86 | 2026-07-26 | `8fab226` | BUG-167 WebView 캐시 + IME 41개 일괄 수정 | |
| 세션 86 | 2026-07-26 | `fb103eb` | docs: BUG-IME 근본 원인 기록 | docs only |
| 세션 87 | 2026-07-26 | `26fba0f` | BUG-168 검색 input IME 자음/모음 분리 수정 | 캐시버스팅 `v=20260726c` |
| 세션 87 | 2026-07-26 | `820e358` | docs: APK v1.4.15 빌드 완료 기록 | docs only |
| 세션 87 | 2026-07-26 | `643a093` | docs: BUG-168 기록 추가 | docs only |
| 세션 87 | 2026-07-26 | `bf1be78` | docs: APK_BUILD_GUIDE.md 최초 작성 | docs only |
| 세션 87 | 2026-07-26 | `bc02654` | docs: 남은 작업 현황 최종 업데이트 | docs only |
| 세션 88~143 | 2026-07-26~2026-08-07 | (다수) | BUG-168~FEAT-216-2 다수 수정 | 캐시버스팅 최대 `v=20260807g` |
| 세션 144 | 2026-08-07 | `5eb1153` | FEAT-217: 알람 수신 대상 공사담당자+현장대리인+안전관리자 한정 | |
| 세션 144 | 2026-08-07 | `7f95653` | docs: [세션144] FEAT-217 커밋 5eb1153 반영 | docs only |
| 세션 145 | 2026-08-07 | `009dd2e` | FEAT-218: FCM 알림 클릭 화면 이동 — tasks.ts FCM 발송 + app.js tbm/edu 타입 | 캐시버스팅 `v=20260807b` |

> **다음 배포 시 이 표에 행 추가할 것.**

---

## 7. 현재 상태 (세션 145 기준)

```
safetynote-server  main  009dd2e  ✅ 최신 (FEAT-218)
safetynote-android main  04782ca  ✅ 최신 (APK v1.4.17 빌드 중)
캐시 버스팅              ?v=20260807b
NAS001 (LinkMax 본사)    https://linkmax.myds.me:3443  ✅ 활성
```

---

## 8. 주의사항

- **`git push origin main` 은 항상 `main` 브랜치** 사용
- **docs 파일만 수정 시** NAS 자동 배포 건너뜀 (의도적 설계)
- **app.js 수정 시 반드시 캐시 버스팅 버전 갱신** — 미갱신 시 브라우저/WebView 캐시로 수정 미반영
- **`node --check` + `npm run build` 이중 검증** 후 push
- **RULE-001**: `app.js` 내 `const`/`let` 금지 — `var` 전용
