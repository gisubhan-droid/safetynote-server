# SafetyNOTE — NAS 설치 매뉴얼 (DOCS-001)

> 작성: 세션 79 (2026-07-25) | 보강: 세션 81 (2026-07-25) | 보강: 세션 124 (2026-07-30)
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
10. [업데이트 및 재설치 가이드](#10-업데이트-및-재설치-가이드)
11. [문제 해결 FAQ](#11-문제-해결-faq)
12. [설치 후 일상 운영 요약](#12-설치-후-일상-운영-요약)
13. [⚠️ 구형 NAS 특수 환경 설치 가이드](#13-️-구형-nas-특수-환경-설치-가이드-glibc-낮은-커널)

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
>
> 💡 **install.sh v2.1**은 Node.js v18과 v20을 자동 탐지합니다.
> DSM에 두 버전이 모두 설치된 경우 v18이 우선 사용됩니다.

### 🔴 Node.js 다중 버전 설치 시 반드시 확인 (중요)

> 📌 **실제 장애 사례 (세션 124, 2026-07-30)**
> Node.js v16/v14 등 하위 버전이 v18과 동시에 설치된 경우,
> PATH 오염으로 인해 `better-sqlite3` native binary가 잘못된 ABI 버전으로
> 선택되어 서버 기동에 실패하는 문제가 발생함.

**설치 전 확인 명령:**
```bash
# 설치된 Node 버전 전체 확인
ls /volume1/@appstore/ | grep -i node

# 현재 PATH의 node 확인
which node && node --version
```

**v18만 남겨야 하는 경우 조치:**
1. DSM → 패키지 센터 → 설치된 패키지
2. `Node.js v16` (또는 v14 등 하위 버전) → **제거**
3. `Node.js v18` → **재설치** (기존 설치 있어도 재설치 권장)
4. 재설치 후 `node --version` → `v18.x.x` 확인

> ✅ Node.js는 **v18 단일 버전만** 설치된 상태에서 SafetyNOTE를 설치하세요.

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
║   1. 위 주소로 브라우저 접속                              ║
║   2. 초기 관리자 계정으로 로그인                          ║
║      ID: admin    PW: admin1234                          ║
║   3. 시스템설정 → 비밀번호 즉시 변경! ⚠️                 ║
╚══════════════════════════════════════════════════════════╝
```

> ✅ 이 화면이 나타나면 자동 설치 완료!
> **Step 5. 설치 후 초기 설정**으로 진행하세요.

### 📌 DB 스키마 자동 적용 (patchSchema) 안내

> SafetyNOTE 서버는 시작 시 `patchSchema` 로직이 자동 실행됩니다.
> 이 로직은 현재 DB 구조를 확인하여 **누락된 테이블·컬럼을 자동으로 추가**합니다.
>
> - 신규 설치 시: 전체 스키마를 처음 생성합니다.
> - 업데이트 후 재시작 시: 신규 버전에서 추가된 컬럼/테이블만 자동으로 적용됩니다.
> - 기존 데이터는 보존됩니다. (DROP 명령은 실행하지 않습니다)
>
> 따라서 버전을 업데이트해도 별도의 DB 마이그레이션 작업이 필요하지 않습니다.

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

# PM2로 서버 시작 (반드시 --cwd 옵션 포함)
NODE_BIN=/volume1/@appstore/Node.js_v18/usr/local/bin/node
TSX_BIN=/volume1/safetynote/node_modules/.bin/tsx

PORT=3443 pm2 start "$TSX_BIN" \
  --name safetynote \
  --interpreter "$NODE_BIN" \
  --cwd /volume1/safetynote \
  -- node-server.ts

pm2 save --force
```

> ⚠️ **`--cwd /volume1/safetynote` 옵션 필수** (FIX-052)
> 이 옵션이 없으면 서버가 잘못된 경로에서 실행되어 DB·업로드 파일을 찾지 못합니다.

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

### 5-5. 기본 데이터 설정

신규 설치 시 기본 설정을 입력합니다:

| 메뉴 경로 | 설정 내용 |
|-----------|-----------|
| 관리/설정 → 사용자관리 → 계정관리 | 사용자 계정 추가 (관리자/감독자/근로자) |
| 시스템설정 → GPS 주소변환 탭 | 카카오 API 키 입력 (현장 주소 자동 변환) |
| 시스템설정 → 그룹별 권한 설정 탭 | 감독자·근로자 메뉴 표시 여부 커스터마이징 |

### 5-6. 첫 사용자 계정 등록 순서

```
관리/설정 → 사용자관리 → 계정관리

① [+ 사용자 추가] 버튼 클릭
② 정보 입력:
   - 이름: 실명 입력
   - 전화번호: 로그인 아이디로 사용됨 (예: 01012345678)
   - 역할: 드롭다운에서 선택 (CEO / 시스템관리자 / 안전관리자 / 공무 / 현장대리인 / 근로자 / LGU+)
   - 직위: 자유 입력
③ [저장] 클릭
④ 임시 비밀번호 전달 → 해당 사용자에게 첫 로그인 후 변경 안내
```

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

### Watchdog 동작 원리 (pm2-watchdog.sh v2.0)

```
[매 5분마다 DSM 작업 스케줄러가 자동 실행]

pm2-watchdog.sh 실행
  │
  ├─ PM2 프로세스 상태 확인
  │    ├─ online (정상) → 아무것도 안 함 ✅
  │    └─ 비정상 (stopped / errored / 없음)
  │          │
  │          ├─ 재시작 시도
  │          │    ├─ 성공 → crash 카운터 초기화 ✅
  │          │    └─ 실패 → crash 카운터 +1
  │          │
  │          └─ crash 카운터 ≥ 3회
  │                │
  │                ├─ git 자동 롤백 (이전 커밋으로 되돌림)
  │                │    ├─ 롤백 후 재시작 성공 → 완료 ✅
  │                │    └─ 롤백도 실패
  │                │
  │                └─ 비상복구 서버 가동 (포트 3445)
  │                     → 브라우저: http://NAS_IP:3445 접속
  │                     → RECOVERY_PASSWORD 입력 후 수동 복구
  │
로그: /var/log/safetynote-watchdog.log (자동 기록)
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
> "반복 실행 날짜" = 매일 체크 → "첫 실행 시간" = 00:00 →
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

### Watchdog 관련 파일 경로

| 파일 | 경로 | 설명 |
|------|------|------|
| Watchdog 스크립트 | `/volume1/safetynote/scripts/pm2-watchdog.sh` | 자동복구 메인 스크립트 |
| Watchdog 로그 | `/var/log/safetynote-watchdog.log` | 실행 기록 (자동 누적) |
| Crash 카운터 | `/tmp/safetynote_crash_count` | 재시작 실패 횟수 기록 |
| 비상복구 PID | `/tmp/safetynote_recovery.pid` | 비상복구 서버 프로세스 ID |
| 비상복구 스크립트 | `/volume1/safetynote/scripts/safe-recovery-standalone.sh` | 포트 3445 서버 |

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
# [patchSchema] DB 스키마 최신 상태 확인 완료
```

---

## 10. 업데이트 및 재설치 가이드

> `install.sh v2.1`은 **fresh / update / reinstall** 3가지 모드를 지원합니다.
> 각 상황에 맞는 모드를 선택하세요.

### 모드 비교표

| 모드 | 언제 사용 | DB 보존 | 업로드 파일 보존 | .env 보존 |
|------|-----------|---------|----------------|-----------|
| **fresh** (신규) | 처음 설치 | — | — | — |
| **update** (업데이트) | 코드 버전 업그레이드 | ✅ | ✅ | ✅ |
| **reinstall** (재설치) | 코드 오류 복구 | ✅ | ✅ | ✅ |

### 10-1. 브라우저 원클릭 업데이트 (권장)

SSH 없이 브라우저에서 바로 업데이트 가능합니다.

```
시스템설정 → 서버 업데이트 탭

① [현재 버전 확인] 클릭 → 현재 서버 버전 vs GitHub 최신 버전 비교 표시

② 업데이트 버전이 있으면 [업데이트 적용] 버튼 활성화

③ [업데이트 적용] 클릭 → 실시간 진행 로그 출력 (약 1~3분 소요)
   - git pull 실행
   - npm install (필요 시)
   - DB 스키마 자동 적용 (patchSchema)
   - PM2 재시작

④ "업데이트 완료" 메시지 → 자동 재접속 (약 30초 후)

⑤ 롤백 필요 시: [이전 버전 목록] → 원하는 버전 선택 → [롤백 적용]
```

> ⚠️ 업데이트 적용 중 다른 사용자의 접속이 약 30~60초 끊길 수 있습니다.
> 업무 외 시간(저녁/주말)에 진행을 권장합니다.

### 10-2. install.sh 업데이트 모드 (SSH)

브라우저 업데이트가 실패하거나 서버가 기동되지 않을 때 사용합니다.

```bash
# SSH 접속 후 root 전환
sudo -i

# install.sh 최신본 다운로드 (선택)
curl -fsSL https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh -o /tmp/install.sh
chmod +x /tmp/install.sh && bash /tmp/install.sh

# 또는 기존 설치된 스크립트 재실행
bash /volume1/safetynote/scripts/install.sh
```

스크립트 실행 후 **기존 설치 감지** 메시지:
```
[WARN]  /volume1/safetynote 가 이미 존재합니다.
  [1] 업데이트 — 코드만 갱신, 기존 데이터 보존 (권장)  ← 이것을 선택
  [2] 재설치  — 코드 재설치, 기존 데이터 보존
  [3] 취소
```

**`1` 선택 (업데이트):**
```
[INFO]  기존 DB, .env, 업로드 파일 보존
[INFO]  git fetch + reset --hard origin/main 실행
[ OK ]  코드 업데이트 완료
[INFO]  npm install 실행 (신규 패키지만 추가)
[ OK ]  npm install 완료
[INFO]  PM2 재시작
[ OK ]  서버 정상 응답 확인
```

**`2` 선택 (재설치):**  
코드만 재설치하며, DB(safety.db), 업로드 파일(public/uploads), .env는 유지됩니다.

### 10-3. 수동 업데이트 (SSH — 고급)

```bash
cd /volume1/safetynote

# 최신 코드 가져오기
git fetch origin
git reset --hard origin/main

# 패키지 재설치 (의존성 변경 시)
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install

# 서버 재시작
pm2 restart safetynote

# 정상 기동 확인
pm2 logs safetynote --nostream --lines 20
# "[patchSchema] DB 스키마 최신 상태 확인 완료" 로그 확인
```

### 10-4. patchSchema — DB 자동 마이그레이션

서버가 재시작될 때마다 `patchSchema` 로직이 자동으로 실행됩니다:

```
서버 시작
  └─ patchSchema 실행
       ├─ 현재 DB 스키마 확인
       ├─ 신규 버전에서 추가된 테이블 → AUTO CREATE
       ├─ 신규 버전에서 추가된 컬럼 → AUTO ADD COLUMN
       └─ 기존 데이터 변경 없음 (안전)
```

| 상황 | patchSchema 동작 | 결과 |
|------|-----------------|------|
| 신규 설치 | 전체 스키마 생성 | 빈 DB 초기화 |
| 마이너 업데이트 | 신규 컬럼만 추가 | 기존 데이터 보존 |
| 메이저 업데이트 | 신규 테이블 + 컬럼 추가 | 기존 데이터 보존 |
| 롤백 | 신규 컬럼 남아있음 (해롭지 않음) | 서버 정상 동작 |

> ✅ 별도의 DB 마이그레이션 명령어를 실행할 필요가 없습니다.
> 서버 재시작만으로 자동 완료됩니다.

---

## 11. 문제 해결 FAQ

### ❌ "Node.js v18을 찾을 수 없습니다" 오류

**원인**: DSM 패키지 센터에 Node.js v18이 설치되어 있지 않음
**해결**:
1. DSM → 패키지 센터 → `Node.js v18` 검색
2. 설치 완료 후 스크립트 재실행

> 💡 Node.js v20이 설치된 경우: install.sh v2.1이 v20도 자동 탐지합니다.
> v18과 v20이 모두 없을 때만 오류가 발생합니다.

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

# 프로세스 없으면 수동 시작 (--cwd 필수)
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

> 💡 Watchdog 로그 확인으로 원인 파악:
> ```bash
> tail -30 /var/log/safetynote-watchdog.log
> ```

---

### ❌ 업데이트 후 서버가 시작되지 않음 (DB 오류)

**증상**: `pm2 logs safetynote` 에 DB 관련 오류 메시지
**원인**: patchSchema 실행 중 예외 발생
**해결**:
```bash
# 서버 로그에서 오류 확인
pm2 logs safetynote --nostream --lines 50

# 브라우저 롤백 (가장 안전)
# → 시스템설정 → 서버 업데이트 탭 → 이전 버전 선택 → 롤백 적용

# SSH 수동 롤백
cd /volume1/safetynote
git log --oneline -5          # 이전 커밋 확인
git reset --hard HEAD~1       # 1단계 이전 버전으로 롤백
pm2 restart safetynote
```

---

### ❌ better-sqlite3 GLIBC 오류 (구형 NAS)

**증상**: PM2 status = `errored`, 로그에 아래 메시지 반복
```
Error: /lib64/libm.so.6: version `GLIBC_2.29' not found
(required by .../better-sqlite3/build/Release/better_sqlite3.node)
code: 'ERR_DLOPEN_FAILED'
```

**원인**: NAS Linux 커널이 오래되어 GLIBC 버전이 2.29 미만 (예: 커널 4.4.x → GLIBC 2.17 수준)

**1차 해결: Node.js 단일 버전 재설치 (가장 권장)**
```bash
# 1. PM2 중지
pm2 delete safetynote

# 2. DSM 패키지 센터에서 하위 Node 버전 제거 후 v18 재설치
#    → 패키지 센터 → 설치된 패키지 → Node.js vXX(하위 버전) → 제거
#    → Node.js v18 재설치

# 3. node_modules 완전 삭제 후 재설치
cd /volume1/safetynote
rm -rf node_modules
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install --legacy-peer-deps

# 4. PM2 재기동
NODE_BIN=/volume1/@appstore/Node.js_v18/usr/local/bin/node
TSX_BIN=/volume1/safetynote/node_modules/.bin/tsx
PORT=3443 pm2 start "$TSX_BIN" \
  --name safetynote \
  --interpreter "$NODE_BIN" \
  --cwd /volume1/safetynote \
  -- node-server.ts
```

**2차 해결: --ignore-scripts + prebuilt binary 수동 주입**

> Node 재설치 후에도 여전히 GLIBC 오류 발생 시 사용

```bash
# 1. --ignore-scripts로 컴파일 건너뛰고 설치
cd /volume1/safetynote
rm -rf node_modules
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install \
  --legacy-peer-deps --ignore-scripts

# 2. better-sqlite3 설치 버전 확인
cat node_modules/better-sqlite3/package.json | grep '"version"'
# → 예: "9.6.0"

# 3. Node ABI 버전 확인 (Node18 = node-v108)
/volume1/@appstore/Node.js_v18/usr/local/bin/node -e \
  "console.log('node-v' + process.versions.modules)"
# → node-v108

# 4. 해당 버전 prebuilt binary 다운로드 및 주입
BSQL3_VER=9.6.0   # 위에서 확인한 버전
NODE_ABI=108       # 위에서 확인한 ABI 번호

curl -L \
  "https://github.com/WiseLibs/better-sqlite3/releases/download/v${BSQL3_VER}/better-sqlite3-v${BSQL3_VER}-node-v${NODE_ABI}-linux-x64.tar.gz" \
  -o /tmp/bsql3.tar.gz

tar -xzf /tmp/bsql3.tar.gz -C /tmp/
mkdir -p /volume1/safetynote/node_modules/better-sqlite3/build/Release/
cp /tmp/build/Release/better_sqlite3.node \
   /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node
ls -lh /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node
# → 파일 존재 확인
```

> ⚠️ 이 방법으로도 GLIBC 오류가 계속되면 → **13장 구형 NAS 특수 환경 가이드** 참조

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

### ❌ Watchdog이 계속 재시작 시도를 반복함

**증상**: `safetynote-watchdog.log`에 재시작 실패 기록이 계속 쌓임
**원인**: 서버 코드 오류 또는 DB 손상으로 PM2가 시작 즉시 종료됨
**해결**:
```bash
# 1단계: 서버 로그에서 실제 오류 확인
pm2 logs safetynote --nostream --lines 50

# 2단계: crash 카운터 초기화
rm -f /tmp/safetynote_crash_count

# 3단계: 브라우저 롤백 or SSH 수동 롤백
cd /volume1/safetynote
git log --oneline -5
git reset --hard HEAD~1
pm2 restart safetynote
```

---

## 12. 설치 후 일상 운영 요약

설치 완료 후 일상적인 운영은 모두 **브라우저**에서 가능합니다.

### 브라우저만으로 가능한 작업

| 작업 | 경로 |
|------|------|
| 서버 업데이트 | 시스템설정 → 서버 업데이트 탭 → 업데이트 적용 |
| 이전 버전 롤백 | 시스템설정 → 서버 업데이트 탭 → 이전 버전 선택 → 롤백 |
| 사용자 계정 추가/삭제 | 관리/설정 → 사용자관리 → 계정관리 |
| APK 새 버전 업로드 | 시스템설정 → APK 배포 관리 탭 |
| DB 백업 현황 확인 | 시스템설정 → 파일 설정 탭 |
| 서버/APK 버전 확인 | 시스템설정 → 정보 탭 |
| 푸시 알림 발송 | 시스템설정 → 푸시 알림 발송 탭 |

### SSH가 필요한 고급 작업 (선택사항)

| 작업 | 명령어 |
|------|--------|
| PM2 상태 확인 | `pm2 status` |
| 서버 로그 확인 | `pm2 logs safetynote --nostream --lines 50` |
| 서버 수동 재시작 | `pm2 restart safetynote` |
| Watchdog 로그 확인 | `tail -30 /var/log/safetynote-watchdog.log` |
| DB 백업 목록 | `ls -lh /volume1/safetynote/backups/` |
| crash 카운터 확인 | `cat /tmp/safetynote_crash_count` |

### 월 1회 점검 권장 항목

```bash
# 1. PM2 상태 확인
pm2 status

# 2. 디스크 여유 공간 확인
df -h /volume1

# 3. 백업 파일 확인 (30일치 자동 유지)
ls -lh /volume1/safetynote/backups/

# 4. 서버 최신 버전 확인
# → 브라우저: 시스템설정 → 서버 업데이트 탭

# 5. Watchdog 최근 실행 확인
tail -10 /var/log/safetynote-watchdog.log
```

---

## 📎 참고 파일 경로

| 파일/경로 | 설명 |
|-----------|------|
| `/volume1/safetynote/` | SafetyNOTE 설치 루트 |
| `/volume1/safetynote/.env` | 환경 설정 파일 (비밀정보 포함 — 공유 금지) |
| `/volume1/safetynote/safety.db` | 데이터베이스 파일 |
| `/volume1/safetynote/public/uploads/` | 업로드된 사진/파일 |
| `/volume1/safetynote/backups/` | 자동 DB 백업 파일들 (30일치) |
| `/volume1/safetynote/scripts/install.sh` | 설치 스크립트 v2.1 |
| `/volume1/safetynote/scripts/pm2-watchdog.sh` | PM2 자동복구 스크립트 v2.0 |
| `/volume1/safetynote/scripts/safe-recovery-standalone.sh` | 비상 복구 서버 |
| `/var/log/safetynote-watchdog.log` | Watchdog 실행 로그 |
| `/tmp/safetynote_crash_count` | 연속 재시작 실패 카운터 |

---

## 13. ⚠️ 구형 NAS 특수 환경 설치 가이드 (GLIBC 낮은 커널)

> 📌 **해당 조건**: Linux 커널 4.4.x 이하, GLIBC 2.29 미만 (Synology 구형 모델)  
> 📌 **실제 발생**: 세션 123~124 (2026-07-30) — `sh_sever` NAS  
> 📌 **이 장은 일반 설치와 별개로 구형 NAS 전용 절차입니다.**

---

### 13-1. 구형 NAS 해당 여부 확인

NAS SSH에서 실행:

```bash
# 커널 버전 확인
uname -r
# → 4.4.180+bsp  (4.4.x = 구형 해당)
# → 4.18.x 이상 = 일반 설치 가능

# GLIBC 버전 확인
ldd --version | head -1
# → ldd (GNU libc) 2.17  (2.29 미만 = 구형 해당)
# → ldd (GNU libc) 2.31 이상 = 일반 설치 가능
```

| 커널 버전 | GLIBC | 설치 방법 |
|-----------|-------|-----------|
| 4.4.x 이하 | 2.17~2.28 | **이 장(13장) 절차 사용** |
| 4.18.x 이상 | 2.29 이상 | 일반 설치 (방법 A/B) 사용 |

---

### 13-2. 구형 NAS 설치 전 필수 준비

#### ① DSM 패키지 센터에서 Node.js 단일 버전만 유지

> ⚠️ **핵심**: Node.js는 **v18 하나만** 설치되어야 합니다.
> 하위 버전(v16, v14 등)이 동시에 설치된 경우 PATH 오염으로 기동 실패.

```
DSM → 패키지 센터 → 설치된 패키지
  → Node.js v16 (또는 v14) : 제거
  → Node.js v18 : 재설치 (기존 설치 있어도 재설치)
```

재설치 후 확인:
```bash
# v18만 응답해야 함
/volume1/@appstore/Node.js_v18/usr/local/bin/node --version
# → v18.18.2
which node && node --version
# → v18.x.x (다른 버전 나오면 PATH 문제 — 절대경로만 사용)
```

#### ② make/gcc 없음 확인 (컴파일 불가 환경)

```bash
which make || echo "make 없음"
which gcc  || echo "gcc 없음"
# → 둘 다 없음 = --ignore-scripts 방식 필수
```

---

### 13-3. 구형 NAS 설치 절차 (전체)

#### Step 1. 코드 다운로드

```bash
cd /volume1
git clone https://github.com/gisubhan-droid/safetynote-server.git safetynote --depth 1
cd /volume1/safetynote
mkdir -p backups public/uploads/apk
```

#### Step 2. npm 설치 — 컴파일 건너뛰기

```bash
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install \
  --legacy-peer-deps --ignore-scripts
# → added 94 packages (또는 유사 숫자) ✅
```

> `--ignore-scripts`: 네이티브 모듈 컴파일 postinstall 전체 건너뜀  
> `--legacy-peer-deps`: 의존성 버전 충돌 무시

#### Step 3. tsx 설치 확인

```bash
ls -la /volume1/safetynote/node_modules/.bin/tsx
# → lrwxrwxrwx ... tsx -> ../tsx/dist/cli.mjs ✅
```

#### Step 4. better-sqlite3 버전 및 Node ABI 확인

```bash
# 설치된 better-sqlite3 버전
cat /volume1/safetynote/node_modules/better-sqlite3/package.json | grep '"version"'
# → "version": "9.6.0"  (예시)

# Node ABI 번호 확인 (Node18 = 108)
/volume1/@appstore/Node.js_v18/usr/local/bin/node -e \
  "console.log('node-v' + process.versions.modules)"
# → node-v108
```

#### Step 5. better-sqlite3 prebuilt binary 다운로드 및 주입

```bash
# 위에서 확인한 버전/ABI 값을 변수에 설정
BSQL3_VER=9.6.0    # cat package.json 결과
NODE_ABI=108        # node -e 결과

# binary 다운로드
curl -L \
  "https://github.com/WiseLibs/better-sqlite3/releases/download/v${BSQL3_VER}/better-sqlite3-v${BSQL3_VER}-node-v${NODE_ABI}-linux-x64.tar.gz" \
  -o /tmp/bsql3.tar.gz

# 압축 해제 및 복사
tar -xzf /tmp/bsql3.tar.gz -C /tmp/
mkdir -p /volume1/safetynote/node_modules/better-sqlite3/build/Release/
cp /tmp/build/Release/better_sqlite3.node \
   /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node

# 복사 확인
ls -lh /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

> ⚠️ 이 binary도 GLIBC 2.29를 요구할 수 있음.
> 그 경우 **Node.js v18 단일 재설치** 후 `npm install` (--ignore-scripts 없이) 재시도 권장.
> Node PATH가 정리되면 자동 컴파일 또는 올바른 binary 선택이 이루어질 수 있음.

#### Step 6. .env 파일 생성

```bash
cat > /volume1/safetynote/.env << 'EOF'
PORT=3443
DB_PATH=/volume1/safetynote/safety.db
UPLOAD_PATH=/volume1/safetynote/public/uploads
UPLOAD_SUBDIR=true
TZ=Asia/Seoul
HTTP_PORT=3444
EOF

cat /volume1/safetynote/.env   # 확인
```

#### Step 7. PM2 서버 기동

```bash
# 기존 프로세스 정리
pm2 delete safetynote 2>/dev/null || true

# 절대경로로 PM2 기동 (PATH 오염 방지)
NODE_BIN=/volume1/@appstore/Node.js_v18/usr/local/bin/node
TSX_BIN=/volume1/safetynote/node_modules/.bin/tsx

PORT=3443 pm2 start "$TSX_BIN" \
  --name safetynote \
  --interpreter "$NODE_BIN" \
  --cwd /volume1/safetynote \
  -- node-server.ts

pm2 save --force
```

#### Step 8. 기동 확인

```bash
# 상태 확인 (30초 후)
pm2 status
# → status: online ✅

# 로그 확인
pm2 logs safetynote --nostream --lines 30
```

**정상 로그:**
```
[ENV] .env 파일 로드 완료: /volume1/safetynote/.env
[DB] /volume1/safetynote/safety.db
[patchSchema] DB 스키마 최신 상태 확인 완료
✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443
✅ HTTP 내부 포트 실행 중: http://0.0.0.0:3444 (Android FCM 전용)
```

**실패 로그 (GLIBC 오류 지속 시):**
```
Error: /lib64/libm.so.6: version `GLIBC_2.29' not found
→ 13-4 트러블슈팅 참조
```

---

### 13-4. 구형 NAS 트러블슈팅

#### 🔴 GLIBC 오류 계속 발생 시 단계별 시도

**시도 순서:**

| 단계 | 방법 | 성공 확률 |
|------|------|-----------|
| 1 | Node.js 단일 버전(v18) 재설치 후 `npm install` (일반) | ⭐⭐⭐ 높음 |
| 2 | `--ignore-scripts` + v9.6.0 linux-x64 prebuilt binary | ⭐⭐ 중간 |
| 3 | `--ignore-scripts` + 구버전(v7.6.2) prebuilt binary | ⭐ 낮음 |
| 4 | `--ignore-scripts` + linuxmusl binary (비권장) | ☆ 매우 낮음 |

**시도 1 — Node18 단일 재설치 후 일반 설치:**
```bash
# DSM 패키지 센터에서 하위 Node 제거 → v18 재설치 완료 후
pm2 delete safetynote
cd /volume1/safetynote && rm -rf node_modules
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install --legacy-peer-deps
# (--ignore-scripts 없이 — 정상 postinstall 실행 시도)
```

**시도 3 — 구버전 better-sqlite3 v7.6.2:**
```bash
cd /volume1/safetynote
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install \
  better-sqlite3@7.6.2 --legacy-peer-deps --ignore-scripts

curl -L \
  "https://github.com/WiseLibs/better-sqlite3/releases/download/v7.6.2/better-sqlite3-v7.6.2-node-v108-linux-x64.tar.gz" \
  -o /tmp/bsql3_v7.tar.gz
tar -xzf /tmp/bsql3_v7.tar.gz -C /tmp/
cp /tmp/build/Release/better_sqlite3.node \
   /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

#### 🔍 binary GLIBC 요구사항 직접 확인

```bash
# 현재 주입된 binary가 어떤 GLIBC를 요구하는지 확인
objdump -p /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node \
  | grep GLIBC
# → GLIBC_2.29  (이 NAS에서 불가)
# → GLIBC_2.17  (이 NAS에서 가능 ✅)

# NAS에서 사용 가능한 GLIBC 버전 확인
strings /lib64/libc.so.6 | grep "GLIBC_2\." | sort -V | tail -5
# → 가장 높은 버전이 이 NAS의 최대 GLIBC 버전
```

---

### 13-5. 구형 NAS 설치 완료 후 추가 주의사항

1. **Watchdog 스크립트도 절대경로 확인 필요**  
   `scripts/pm2-watchdog.sh` 내부에서 Node/TSX 경로를 절대경로로 지정했는지 확인:
   ```bash
   grep -n "NODE_BIN\|TSX_BIN\|node-server" /volume1/safetynote/scripts/pm2-watchdog.sh
   ```

2. **npm update/재설치 시 주의**  
   패키지 업데이트로 better-sqlite3 버전이 바뀌면 binary 재주입 필요.
   서버 재시작 실패 시 이 절차를 먼저 확인.

3. **NAS 재부팅 후 PATH 문제 재발 가능**  
   Watchdog이 PM2를 재시작할 때도 `--interpreter` 절대경로 옵션이 포함되어야 함.
   `pm2 save` 저장 내용에 반드시 절대경로가 포함되어 있어야 함.

---

*13장 추가: 세션 124 (2026-07-30) — sh_sever NAS 실제 장애 사례 기반*

---

## 📞 설치 지원

설치 중 문제가 발생하면 아래 정보를 준비하여 문의하세요:

1. **오류 메시지 전체 텍스트** (화면 캡처 또는 복사)
2. **DSM 버전** (DSM → 제어판 → 정보 센터)
3. **NAS 모델명** (NAS 뒷면 스티커 또는 DSM → 정보 센터)
4. **Node.js 설치 여부** (패키지 센터에서 확인)
5. **서버 로그** (가능한 경우): `pm2 logs safetynote --nostream --lines 50`
6. **Watchdog 로그** (가능한 경우): `tail -30 /var/log/safetynote-watchdog.log`

---

*SafetyNOTE NAS 설치 매뉴얼 v2.1 — 2026-07-30*  
*v1.0 (2026-07-25): 초안*  
*v2.0 (2026-07-25): update/reinstall 모드, patchSchema, Watchdog 상세, 트러블슈팅 보강*  
*v2.1 (2026-07-30): Node 다중설치 충돌 경고 추가, 13장 구형 NAS 특수 환경 가이드 신설 (GLIBC 2.17 환경 대응)*
