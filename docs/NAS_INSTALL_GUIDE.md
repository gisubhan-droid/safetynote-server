# SafetyNOTE — NAS 설치 매뉴얼 (DOCS-001)

> 작성: 세션 79 (2026-07-25)  
> 대상: 신규 NAS 설치 담당자 (IT 비전문가 가능)  
> 환경: Synology NAS (DSM 7.x) + Node.js v18 + PM2  
> 소요 시간: 약 20~40분 (네트워크 환경에 따라 상이)

---

## 📋 목차

1. [설치 전 체크리스트](#1-설치-전-체크리스트)
2. [설치 방법 선택 — 원클릭 vs 수동](#2-설치-방법-선택--원클릭-vs-수동)
3. [방법 A — 원클릭 자동 설치 (권장)](#3-방법-a--원클릭-자동-설치-권장)
4. [방법 B — 수동 설치 (원클릭 실패 시)](#4-방법-b--수동-설치-원클릭-실패-시)
5. [설치 후 초기 설정](#5-설치-후-초기-설정)
6. [HTTPS 인증서 설정](#6-https-인증서-설정)
7. [PM2 자동복구(Watchdog) 등록 — 필수](#7-pm2-자동복구watchdog-등록--필수)
8. [외부 접속 설정 (공유기 포트포워딩)](#8-외부-접속-설정-공유기-포트포워딩)
9. [설치 완료 최종 확인](#9-설치-완료-최종-확인)
10. [문제 해결 FAQ](#10-문제-해결-faq)
11. [설치 후 일상 운영 요약](#11-설치-후-일상-운영-요약)

---

## 1. 설치 전 체크리스트

설치 시작 전 아래 항목을 모두 확인하세요.

### ✅ 필수 확인 항목

| # | 항목 | 확인 방법 | 완료 |
|---|------|-----------|------|
| 1 | Synology NAS 전원 켜짐 | NAS 전면 LED 확인 | ☐ |
| 2 | NAS가 인터넷에 연결됨 | DSM → 제어판 → 네트워크 | ☐ |
| 3 | DSM 관리자(admin) 계정 비밀번호 알고 있음 | — | ☐ |
| 4 | NAS 내부 IP 주소 알고 있음 | 공유기 관리 페이지 또는 DSM 확인 | ☐ |
| 5 | SSH 접속 가능 (또는 다른 컴퓨터에서 접속 준비) | — | ☐ |

### ✅ DSM 패키지 설치 (설치 전 필수)

DSM 웹 브라우저 접속 → **패키지 센터** → 검색 → 설치:

| # | 패키지 이름 | 검색어 | 필수 여부 |
|---|-------------|--------|-----------|
| 1 | **Node.js v18** | `Node.js v18` | ✅ 필수 |
| 2 | **Git** 또는 **Git Server** | `Git` | ✅ 필수 |
| 3 | **Python 3** | `Python 3` | 🔵 권장 (비상복구 서버용) |

> ⚠️ **Node.js v18** 이 반드시 설치되어야 합니다.  
> v20, v22가 아닌 **v18** 을 설치하세요. (현재 호환 검증된 버전)

---

## 2. 설치 방법 선택 — 원클릭 vs 수동

```
NAS SSH 접속 가능?
    ├─ YES → 방법 A (원클릭 자동 설치) ← 권장
    └─ NO  → 방법 B (수동 설치)
```

**SSH 접속 활성화 방법:**
> DSM → 제어판 → 터미널 및 SNMP → SSH 서비스 활성화 체크 → 적용

---

## 3. 방법 A — 원클릭 자동 설치 (권장)

### Step A-1. NAS에 SSH 접속

**Windows:** PuTTY 또는 Windows Terminal 사용  
**Mac / Linux:** 터미널 앱 사용

```bash
# NAS IP가 192.168.0.100 이고 SSH 포트가 22인 경우
ssh admin@192.168.0.100

# SSH 포트를 변경했다면 (예: 22번 → 2222번)
ssh -p 2222 admin@192.168.0.100
```

접속 후 관리자 비밀번호 입력 → 접속 성공 시 프롬프트 표시됨.

### Step A-2. root 권한으로 전환

```bash
sudo -i
```
> 비밀번호 입력 요청 시 관리자(admin) 비밀번호 입력

### Step A-3. 설치 스크립트 실행

**[방법 1] GitHub에서 직접 실행 (인터넷 연결 필요)**
```bash
curl -fsSL https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh | bash
```

**[방법 2] 기존 운영 중인 SafetyNOTE NAS에서 다운로드**
```bash
curl -k -O https://기존NAS주소:3443/static/install.sh
chmod +x install.sh && bash install.sh
```

> 💡 curl이 없다면 wget으로 대체:
> ```bash
> wget -O install.sh https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh
> chmod +x install.sh && bash install.sh
> ```

### Step A-4. 설치 진행 — 화면 안내 따르기

설치 스크립트가 시작되면 아래 순서로 자동 진행됩니다:

```
━━━ Step 1/8: Node.js 탐지 ━━━
[INFO]  Node.js v18 탐지 중...
[ OK ]  Node.js v18 발견: /volume1/@appstore/Node.js_v18/usr/local/bin/node (v18.x.x)

━━━ Step 2/8: Git 확인 ━━━
[ OK ]  git version 2.xx.x

━━━ Step 3/8: PM2 확인 / 설치 ━━━
[ OK ]  PM2 이미 설치됨: x.x.x
  (또는: PM2 설치 중... → 완료)

━━━ Step 4/8: 설치 경로 확인 ━━━
```

**기존 설치가 있는 경우 (재설치/업데이트):**
```
[WARN]  /volume1/safetynote 가 이미 존재합니다.

  선택하세요:
    [1] 업데이트 — 코드만 갱신, 기존 데이터 보존 (권장)
    [2] 재설치  — 코드 재설치, 기존 데이터 보존
    [3] 취소

  선택 (1/2/3):
```
> → 신규 설치: 아무것도 묻지 않고 자동 진행  
> → 기존 설치 있을 때: `1` 입력 후 Enter (업데이트 권장)

**계속 자동 진행:**
```
━━━ Step 5/8: 코드 다운로드 ━━━
[ OK ]  코드 다운로드 완료

━━━ Step 6/8: npm 패키지 설치 ━━━
[INFO]  패키지 설치 중... (3~10분 소요)
  (기다리세요 — 진행 중)
[ OK ]  패키지 설치 완료
[ OK ]  tsx 확인: /volume1/safetynote/node_modules/.bin/tsx

━━━ Step 7/8: 환경설정 파일 생성 ━━━
[ OK ]  .env 파일 생성 완료
[WARN]  .env 파일을 열어 내용을 확인하세요

━━━ Step 8/8: PM2 서버 시작 ━━━
[INFO]  PM2 프로세스 등록 중...
[ OK ]  서버 정상 응답 확인 (HTTP 200)

━━━ Step 9: PM2 자동복구 Watchdog 등록 ━━━
[ OK ]  watchdog 스크립트 실행 권한 설정
[WARN]  DSM 작업 스케줄러 수동 등록 필요 (아래 안내 참고)
```

### Step A-5. 설치 완료 화면 확인

```
╔══════════════════════════════════════════════════════════╗
║          🎉  SafetyNOTE 설치 완료!                      ║
╠══════════════════════════════════════════════════════════╣
║  접속 주소 : https://192.168.0.100:3443                  ║
║  설치 경로 : /volume1/safetynote                         ║
║  커밋 버전 : a1b2c3d                                     ║
╠══════════════════════════════════════════════════════════╣
║  ⚠️  HTTPS 인증서 설정 필요 (Synology 인증서 적용)       ║
╠══════════════════════════════════════════════════════════╣
║  ✅ 다음 단계                                            ║
║   1. 위 주소로 브라우저 접속                             ║
║   2. 초기 관리자 계정으로 로그인                         ║
║      ID: admin    PW: admin1234                          ║
║   3. 시스템설정 → 비밀번호 즉시 변경! ⚠️                 ║
╚══════════════════════════════════════════════════════════╝
```

> ✅ 이 화면이 나타나면 자동 설치 완료!  
> **Step 5. 설치 후 초기 설정**으로 진행하세요.

---

## 4. 방법 B — 수동 설치 (원클릭 실패 시)

원클릭 설치 스크립트 실행 중 오류가 발생했거나 SSH 접속 없이 설치해야 할 경우 사용합니다.

### Step B-1. 설치 디렉토리 생성

```bash
mkdir -p /volume1/safetynote
cd /volume1/safetynote
```

### Step B-2. 코드 다운로드

```bash
git clone https://github.com/gisubhan-droid/safetynote-server.git /volume1/safetynote --depth 1
cd /volume1/safetynote
```

### Step B-3. 필수 폴더 생성

```bash
mkdir -p backups
mkdir -p public/uploads/apk
```

### Step B-4. npm 패키지 설치

```bash
# Node.js v18 절대경로 사용 (NAS는 npx 명령 없을 수 있음)
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install
```

> ⏳ 3~10분 소요됩니다. 완료될 때까지 기다리세요.

### Step B-5. .env 설정 파일 생성

```bash
cat > /volume1/safetynote/.env << 'EOF'
# ══════════════════════════════════════════════════
# SafetyNOTE 환경 설정
# ⚠️ 이 파일은 절대 공유하거나 GitHub에 업로드하지 마세요!
# ══════════════════════════════════════════════════

# 서버 포트 (변경 금지 — 공유기 포트포워딩 고정값)
PORT=3443

# 데이터베이스 경로
DB_PATH=/volume1/safetynote/safety.db

# 파일 업로드 경로
UPLOAD_PATH=/volume1/safetynote/public/uploads

# 연도/월 하위폴더 자동 생성
UPLOAD_SUBDIR=true

# 보안 키 (랜덤 문자열로 변경 권장)
JWT_SECRET=여기에_영문숫자_32자_이상_입력

# APK 배포 Webhook 시크릿
DEPLOY_WEBHOOK_SECRET=safetynote-nas-2026

# 비상 복구 서버 비밀번호 (포트 3445)
RECOVERY_PASSWORD=recovery1234

# 앱 버전
APP_VERSION=1.4
EOF
```

> ⚠️ `JWT_SECRET` 값을 반드시 변경하세요.  
> 아래 명령으로 랜덤값 생성 가능:
> ```bash
> cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1
> ```

### Step B-6. PM2 설치 확인 및 서버 시작

```bash
# PM2 설치 확인
pm2 --version

# PM2 없으면 설치
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install -g pm2

# tsx 경로 확인
ls /volume1/safetynote/node_modules/.bin/tsx

# PM2로 서버 시작
NODE_BIN=/volume1/@appstore/Node.js_v18/usr/local/bin/node
TSX_BIN=/volume1/safetynote/node_modules/.bin/tsx

cd /volume1/safetynote
PORT=3443 pm2 start "$TSX_BIN" \
  --name safetynote \
  --interpreter "$NODE_BIN" \
  --cwd /volume1/safetynote \
  -- node-server.ts

pm2 save --force
```

### Step B-7. 서버 응답 확인

```bash
# HTTP 내부 포트(3444)로 응답 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost:3444/

# 200 또는 302가 나오면 정상
```

---

## 5. 설치 후 초기 설정

### 5-1. 브라우저로 접속

설치 완료 화면에 표시된 주소로 접속합니다:
```
https://NAS_IP주소:3443
```
> 예: `https://192.168.0.100:3443`

> ⚠️ **HTTPS 인증서 경고가 표시될 수 있습니다.**  
> 이는 정상입니다. 브라우저에서 "고급" → "계속 진행" 클릭  
> (6장에서 인증서를 설정하면 이 경고가 사라집니다)

### 5-2. 초기 관리자 로그인

| 항목 | 값 |
|------|----|
| 아이디 | `admin` |
| 비밀번호 | `admin1234` |

### 5-3. 비밀번호 즉시 변경 (필수)

로그인 후 즉시:
1. 우측 상단 **내 정보** 또는 **시스템설정** 클릭
2. **비밀번호 변경** 탭 선택
3. 새 비밀번호 설정 (8자 이상, 영문+숫자 조합 권장)

> 🔴 **반드시 첫 로그인 즉시 변경하세요.**  
> 기본 비밀번호(admin1234)는 누구나 알고 있습니다.

### 5-4. APK 파일 등록

Android 앱 설치를 위한 APK 파일을 등록합니다:

1. **시스템설정 → APK 탭** 선택
2. **APK 파일 업로드** 버튼 클릭
3. 받아둔 `.apk` 파일 선택하여 업로드

> 💡 APK 파일이 없다면 GitHub에서 다운로드:  
> https://github.com/gisubhan-droid/safetynote-android/releases/latest

### 5-5. 기본 데이터 설정 (선택)

신규 설치 시 기본 설정을 입력합니다:

| 메뉴 경로 | 설정 내용 |
|-----------|-----------|
| 시스템설정 → 사용자 관리 | 사용자 계정 추가 (관리자/감독자/작업자) |
| 시스템설정 → 작업유형 설정 | 공사 작업 유형 추가 |
| 시스템설정 → 안전설정 | 작업유형별 안전 체크리스트 항목 설정 |

---

## 6. HTTPS 인증서 설정

SafetyNOTE는 HTTPS(포트 3443)로 실행됩니다.  
Synology DSM의 인증서를 사용하도록 설정합니다.

### 6-1. DSM Let's Encrypt 인증서 발급 (도메인 있는 경우)

> 도메인이 있고 외부 접속을 사용하는 경우 권장합니다.

1. **DSM → 제어판 → 보안 → 인증서** 탭 클릭
2. **추가** 버튼 클릭
3. **새 인증서 추가** → **Let's Encrypt 인증서 얻기** 선택
4. 도메인 이름 입력 (예: `linkmax.myds.me`)
5. 이메일 주소 입력 → **적용** 클릭
6. 발급 완료 후 인증서 목록에서 해당 인증서 선택
7. **설정** 버튼 → `3443` 포트 서비스에 인증서 적용

> 💡 Synology DDNS 주소(예: `이름.myds.me`)를 사용하면 무료 SSL 인증서 발급 가능

### 6-2. 자체 서명 인증서 (도메인 없는 경우)

도메인 없이 내부 IP로만 사용하는 경우 자체 서명 인증서를 사용합니다.

> SafetyNOTE는 NAS의 기본 인증서를 자동으로 탐지하여 HTTPS를 시작합니다.  
> 별도 설정 없이도 서버가 기동되며, 브라우저에서 "경고 무시" 후 사용 가능합니다.

### 6-3. 인증서 설정 확인

```bash
# NAS SSH에서 현재 인증서 경로 확인
ls /usr/syno/etc/certificate/_archive/
# DEFAULT 파일 내용 확인
cat /usr/syno/etc/certificate/_archive/DEFAULT
# 인증서 파일 존재 확인
ls /usr/syno/etc/certificate/_archive/$(cat /usr/syno/etc/certificate/_archive/DEFAULT)/
```

인증서 적용 후 PM2 재시작:
```bash
pm2 restart safetynote
pm2 logs safetynote --nostream --lines 10
# "✅ 서버 실행 중 (HTTPS)" 로그 확인
```

---

## 7. PM2 자동복구(Watchdog) 등록 — 필수

> ⚠️ **이 단계를 완료해야 NAS 재부팅 후에도 SafetyNOTE가 자동으로 실행됩니다.**  
> 등록하지 않으면 NAS 재부팅 시 수동으로 서버를 다시 시작해야 합니다.

### Watchdog 동작 설명

```
[매 5분마다 자동 실행]
pm2-watchdog.sh
  ├─ PM2 프로세스 정상(online) → 아무것도 안 함
  └─ PM2 비정상 → 자동 재시작
              ├─ 재시작 성공 → 완료 ✅
              └─ 3회 이상 실패 → git 이전 버전 자동 롤백
                              └─ 롤백도 실패 → 비상 복구 서버 가동 (http://NAS_IP:3445)
```

### Step 7-1. DSM 작업 스케줄러 열기

1. DSM 바탕화면 → **제어판** 클릭
2. 좌측 메뉴 → **작업 스케줄러** 클릭

### Step 7-2. 새 작업 생성

1. 상단 **생성** 버튼 클릭
2. 드롭다운에서 **예약된 작업 → 사용자 정의 스크립트** 클릭

### Step 7-3. 일반 탭 설정

| 항목 | 입력값 |
|------|--------|
| **작업 이름** | `SafetyNOTE PM2 자동복구` |
| **사용자** | `root` |
| **활성화됨** | ✅ 체크 |

### Step 7-4. 스케줄 탭 설정

| 항목 | 입력값 |
|------|--------|
| **반복 실행 날짜** | 매일 |
| **첫 실행 시간** | 00:00 |
| **빈도** | 매 5분 |

> 💡 **매 5분** 설정 방법:  
> "반복 실행 날짜" = 매일 체크 →  "첫 실행 시간" = 00:00 →  
> 아래 "매" 체크박스 활성화 → **5분** 선택

### Step 7-5. 작업 설정 탭 — 스크립트 입력

**사용자 정의 스크립트** 입력란에 아래 내용을 그대로 입력:

```
bash /volume1/safetynote/scripts/pm2-watchdog.sh
```

### Step 7-6. 저장 및 테스트

1. **확인** 클릭 → 비밀번호 입력창에 DSM 관리자 비밀번호 입력
2. 작업 목록에 `SafetyNOTE PM2 자동복구` 추가 확인
3. 작업 선택 후 상단 **실행** 버튼 클릭 (수동 테스트)
4. 잠시 후 작업 결과 → **정상 종료(0)** 확인

> ✅ 등록 완료 후 NAS 재부팅이 있어도 자동으로 복구됩니다.

---

## 8. 외부 접속 설정 (공유기 포트포워딩)

사무실 밖(외부 인터넷)에서도 SafetyNOTE에 접속하려면 공유기 포트포워딩을 설정합니다.

### 8-1. 포트포워딩 설정

공유기 관리 페이지 접속 → 포트포워딩 메뉴에서 아래와 같이 추가:

| 외부 포트 | 내부 IP | 내부 포트 | 프로토콜 | 설명 |
|-----------|---------|-----------|----------|------|
| `3443` | `NAS 내부 IP` | `3443` | TCP | SafetyNOTE HTTPS |

> 예: 외부 포트 3443 → 192.168.0.100:3443

> ⚠️ **주의**: 포트 3444(Android FCM 전용)는 포트포워딩 불필요  
> 포트 3445(비상복구)는 보안상 외부 노출 금지 권장

### 8-2. Synology DDNS 설정 (동적 IP 사용 시)

외부 IP가 바뀌는 경우 Synology DDNS를 사용합니다:

1. **DSM → 제어판 → 외부 액세스 → DDNS** 탭
2. **추가** 클릭
3. 서비스 공급자: **Synology** 선택
4. 호스트 이름: `원하는이름.myds.me` 입력
5. **확인** 클릭

설정 후 접속 주소: `https://원하는이름.myds.me:3443`

### 8-3. 접속 주소 정리

| 접속 위치 | 주소 형식 | 예시 |
|-----------|-----------|------|
| 사무실 내부 (LAN) | `https://NAS_IP:3443` | `https://192.168.0.100:3443` |
| 외부 (포트포워딩 설정 후) | `https://외부IP:3443` | `https://1.2.3.4:3443` |
| 외부 (DDNS 설정 후) | `https://이름.myds.me:3443` | `https://linkmax.myds.me:3443` |
| Android 앱 내부 HTTP | `http://NAS_IP:3444` | `http://192.168.0.100:3444` (앱 자동 설정) |

---

## 9. 설치 완료 최종 확인

설치 완료 후 아래 항목을 순서대로 확인하세요.

### ✅ 최종 확인 체크리스트

| # | 확인 항목 | 확인 방법 | 완료 |
|---|-----------|-----------|------|
| 1 | 브라우저에서 SafetyNOTE 접속 됨 | `https://NAS_IP:3443` 접속 | ☐ |
| 2 | admin 계정 로그인 성공 | ID: admin / 초기PW: admin1234 | ☐ |
| 3 | **관리자 비밀번호 변경 완료** | 시스템설정 → 비밀번호 변경 | ☐ |
| 4 | APK 파일 업로드 완료 | 시스템설정 → APK 탭 | ☐ |
| 5 | Watchdog 등록 완료 | DSM 작업 스케줄러 목록 확인 | ☐ |
| 6 | Watchdog 수동 실행 성공 | 작업 선택 → 실행 → 정상종료(0) | ☐ |
| 7 | 외부 접속 확인 (외부망 사용 시) | 핸드폰 LTE로 접속 테스트 | ☐ |

### PM2 상태 확인 (SSH)

```bash
pm2 status
# 출력 예시:
# ┌─────┬────────────┬─────────┬─────┬───────────┐
# │ id  │ name       │ status  │ cpu │ memory    │
# ├─────┼────────────┼─────────┼─────┼───────────┤
# │ 0   │ safetynote │ online  │ 0%  │ 150.0mb   │
# └─────┴────────────┴─────────┴─────┴───────────┘
# status가 "online" 이면 정상
```

### 서버 로그 확인 (SSH)

```bash
pm2 logs safetynote --nostream --lines 20
# 아래 라인이 보이면 정상:
# ✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443
# ✅ HTTP 내부 포트 실행 중: http://0.0.0.0:3444 (Android FCM 전용)
```

---

## 10. 문제 해결 FAQ

### ❌ "Node.js v18을 찾을 수 없습니다" 오류

**원인**: DSM 패키지 센터에 Node.js v18이 설치되어 있지 않음  
**해결**:
1. DSM → 패키지 센터 → `Node.js v18` 검색
2. 설치 완료 후 스크립트 재실행

---

### ❌ "Git이 설치되어 있지 않습니다" 오류

**원인**: DSM 패키지 센터에 Git이 설치되어 있지 않음  
**해결**:
1. DSM → 패키지 센터 → `Git Server` 검색 → 설치
2. 설치 완료 후 스크립트 재실행

---

### ❌ npm install이 오래 걸리거나 중단될 때

**증상**: `패키지 설치 중...` 메시지 이후 오랫동안 진행 없음  
**원인**: 네트워크 속도 문제 또는 npm 캐시 충돌  
**해결**:
```bash
cd /volume1/safetynote
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install --prefer-offline
# 또는 강제 재설치
rm -rf node_modules
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install
```

---

### ❌ 서버 응답 확인 실패 (HTTPS 인증서 경고)

**증상**: 설치 완료 후 `[WARN] 서버 응답 확인 실패` 메시지  
**원인**: HTTPS 인증서 미설정 상태 — 서버는 정상 실행 중  
**해결**:
```bash
# PM2 상태 확인
pm2 status
# status = online 이면 서버는 정상
# 6장 HTTPS 인증서 설정 후 해결됨
```

---

### ❌ 브라우저에서 "연결 거부" 오류

**증상**: `https://NAS_IP:3443` 접속 시 연결 거부  
**원인**: PM2 프로세스 미실행 또는 포트 충돌  
**해결**:
```bash
# PM2 상태 확인
pm2 status

# 프로세스 없으면 수동 시작
cd /volume1/safetynote
PORT=3443 pm2 start /volume1/safetynote/node_modules/.bin/tsx \
  --name safetynote \
  --interpreter /volume1/@appstore/Node.js_v18/usr/local/bin/node \
  --cwd /volume1/safetynote \
  -- node-server.ts

# 로그 확인
pm2 logs safetynote --nostream --lines 30
```

---

### ❌ "tsx를 찾을 수 없습니다" 오류

**원인**: `npm install` 이 완전히 완료되지 않음  
**해결**:
```bash
cd /volume1/safetynote
ls node_modules/.bin/tsx   # 파일 있는지 확인
# 없으면:
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install
```

---

### ❌ NAS 재부팅 후 서버가 안 켜짐

**원인**: Watchdog 미등록 또는 등록 오류  
**해결**:
1. [7장 Watchdog 등록](#7-pm2-자동복구watchdog-등록--필수) 절차 다시 진행
2. 등록 후 수동 실행 테스트 확인

---

### ❌ 비상 복구 서버가 필요한 경우

**상황**: 브라우저로 SafetyNOTE가 전혀 접속 안 되고 SSH도 불가  
**해결**: DSM 작업 스케줄러에서 비상 복구 서버 수동 실행

1. DSM → 제어판 → 작업 스케줄러 → **생성** → 예약된 작업 → 사용자 정의 스크립트
2. 아래 스크립트 입력 후 저장:
   ```
   bash /volume1/safetynote/scripts/safe-recovery-standalone.sh
   ```
3. **반복: 실행 안 함** 설정 후 저장
4. 작업 선택 → **실행** 클릭
5. 브라우저에서 `http://NAS_IP:3445` 접속 (HTTP, 포트 3445)
6. 비밀번호 입력 (`.env`의 `RECOVERY_PASSWORD`, 기본값: `recovery1234`)
7. 원하는 복구 작업 선택

---

## 11. 설치 후 일상 운영 요약

설치 완료 후 일상적인 운영은 모두 **브라우저**에서 가능합니다.

### 브라우저만으로 가능한 작업

| 작업 | 방법 |
|------|------|
| 서버 업데이트 | 시스템설정 → 서버 업데이트 탭 → 업데이트 적용 |
| 서버 상태 확인 | 시스템설정 → 서버 상태 탭 |
| 사용자 관리 | 시스템설정 → 사용자 관리 탭 |
| APK 업데이트 | 시스템설정 → APK 탭 → 새 APK 업로드 |
| DB 백업 확인 | 시스템설정 → 백업 탭 |
| 커밋 롤백 | 시스템설정 → 서버 업데이트 탭 → 롤백 |

### SSH가 필요한 고급 작업 (선택사항)

| 작업 | 명령어 |
|------|--------|
| PM2 상태 확인 | `pm2 status` |
| 서버 로그 확인 | `pm2 logs safetynote --nostream --lines 50` |
| 서버 수동 재시작 | `pm2 restart safetynote` |
| 수동 업데이트 | `cd /volume1/safetynote && git pull && pm2 restart safetynote` |
| Watchdog 로그 | `tail -20 /var/log/safetynote-watchdog.log` |
| DB 백업 목록 | `ls -lh /volume1/safetynote/backups/` |

### 월 1회 점검 권장 항목

```bash
# 1. PM2 상태 확인
pm2 status

# 2. 디스크 여유 공간 확인
df -h /volume1

# 3. 백업 파일 확인 (30일치 유지)
ls -lh /volume1/safetynote/backups/

# 4. 서버 최신 버전 확인
# → 브라우저에서: 시스템설정 → 서버 업데이트 탭
```

---

## 📎 참고 파일 경로

| 파일/경로 | 설명 |
|-----------|------|
| `/volume1/safetynote/` | SafetyNOTE 설치 루트 |
| `/volume1/safetynote/.env` | 환경 설정 파일 (비밀정보 포함 — 공유 금지) |
| `/volume1/safetynote/safety.db` | 데이터베이스 파일 |
| `/volume1/safetynote/public/uploads/` | 업로드된 사진/파일 |
| `/volume1/safetynote/backups/` | 자동 DB 백업 파일들 |
| `/volume1/safetynote/scripts/install.sh` | 설치 스크립트 |
| `/volume1/safetynote/scripts/pm2-watchdog.sh` | PM2 자동복구 스크립트 |
| `/volume1/safetynote/scripts/safe-recovery-standalone.sh` | 비상 복구 서버 |
| `/var/log/safetynote-watchdog.log` | Watchdog 실행 로그 |

---

## 📞 설치 지원

설치 중 문제가 발생하면 아래 정보를 준비하여 문의하세요:

1. **오류 메시지 전체 텍스트** (화면 캡처 또는 복사)
2. **DSM 버전** (DSM → 제어판 → 정보 센터)
3. **NAS 모델명** (NAS 뒷면 스티커 또는 DSM → 정보 센터)
4. **Node.js 설치 여부** (패키지 센터에서 확인)
5. **서버 로그** (가능한 경우): `pm2 logs safetynote --nostream --lines 50`

---

*SafetyNOTE NAS 설치 매뉴얼 v1.0 — 2026-07-25*  
*실 사용자 권한별 설명서는 별도 문서로 제공 예정*
