# SafetyNOTE — NAS 배포 · 업데이트 · 운영 종합 가이드

> 최초 작성: 세션 51 (2026-06-21)
> 마지막 업데이트: 세션 57 (2026-07-23)
> 대상 독자: NAS 비전문가 운영자
> 환경: Synology NAS + Node.js v18 + PM2 + better-sqlite3

---

## 목차

1. [현재 상태 요약](#1-현재-상태-요약)
2. [남은 Phase 진행 계획](#2-남은-phase-진행-계획)
3. [데이터 증가 대비 운영 계획 (왕초보자용)](#3-데이터-증가-대비-운영-계획-왕초보자용)
4. [현재 NAS → 타 NAS 배포 방법](#4-현재-nas--타-nas-배포-방법)
5. [업데이트 관리 방안](#5-업데이트-관리-방안)
6. [PM2 자동복구 (Watchdog) 설정](#6-pm2-자동복구-watchdog-설정)
7. [장애 대응 FAQ](#7-장애-대응-faq)

---

## 1. 현재 상태 요약

### 개발 현황
```
GitHub 최신:  4fbdf3f  (세션 56 — TASK-005 광케이블 자산구분 + BUG-165 수정)
캐시버전:     v=20260723a
서버 포트:    3443 (HTTPS, Synology 인증서 자동 탐지)
```

### Phase 완료 현황
| Phase | 내용 | 상태 | 최종 커밋 |
|-------|------|------|-----------|
| Phase 1 | 핵심 기능 구현 + 파일럿 안정화 | ✅ 완료 | — |
| Phase 2 | Firebase FCM 외부 푸시 알림 | ✅ 완료 | `fcabd66` |
| Phase 3 | 코드 구조 정리 (라우트 분리) | ⏳ 선택적 | — |
| Phase 4 | NAS 설치 매뉴얼 PDF | ⏳ Phase 6 후 | — |
| Phase 5 | 브라우저 원클릭 서버 업데이트 | ✅ 완료 | `808959f` |
| Phase 6 | 타 NAS 원클릭 설치 패키지 | ⏳ 다음 목표 | — |
| 최적화 | 자동 DB 백업 + 페이지네이션 | ✅ 완료 | `8f7d502` |

### 현재 적용된 최적화 현황
| 항목 | 내용 | 상태 |
|------|------|------|
| SQLite PRAGMA | WAL + NORMAL + 32MB캐시 + mmap256MB | ✅ |
| 복합 인덱스 | tasks/tbm/알림/서명요청 등 10개+ | ✅ |
| 자동 DB 백업 | 매일 새벽 2시, 30일 보관 | ✅ 세션 54 |
| 알림 자동 정리 | 90일 초과 자동 삭제, 매 24시간 | ✅ 세션 54 |
| 페이지네이션 | tasks · splice_reports 50건 단위 | ✅ 세션 54 |
| PM2 자동복구 | DSM 작업 스케줄러 Watchdog 등록 | ✅ 세션 57 |

---

## 2. 남은 Phase 진행 계획

### 권고 진행 순서

```
[다음 목표] Phase 6 — 타 NAS 원클릭 설치
      ↓
[선택적]    Phase 3 — 코드 구조 정리
      ↓
[마지막]    Phase 4 — 설치 매뉴얼 PDF
```

### Phase 6 — 타 NAS 원클릭 설치 패키지

**목표**: 신규 NAS에서 명령어 한 줄로 SafetyNOTE 전체 설치

```bash
# 신규 NAS SSH에서 이 한 줄 실행 → 전체 설치 완료 (목표)
curl -fsSL https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh | bash
```

**현재 상태**: `scripts/install.sh` v1.0 초안 완성 (세션 51)
- [x] Node.js v18 확인
- [x] git clone
- [x] npm install
- [x] .env 기본 생성
- [x] PM2 시작
- [ ] 환경 검증 강화 (실패 시 명확한 오류 메시지)
- [ ] 관리자 계정 초기화 자동화
- [ ] 실제 신규 NAS 환경 테스트

---

## 3. 데이터 증가 대비 운영 계획 (왕초보자용)

### 📦 자동으로 처리되는 것들 (신경 안 써도 됩니다)

| 항목 | 처리 방법 | 보관 기간 |
|------|-----------|-----------|
| **DB 자동 백업** | 매일 새벽 2시 자동 실행 | 30일 |
| **오래된 알림 삭제** | 매일 자동으로 90일 초과 삭제 | — |
| **목록 로딩 속도** | 50건씩 나눠서 불러옴 (더보기 버튼) | — |
| **PM2 자동복구** | 매일 00:00 Watchdog 체크 + crash 시 자동 재시작 | — |

### 📅 월 1회 직접 확인할 것

> ℹ️ SSH 접속 방법은 [선택사항 — SSH 접속](#선택사항--ssh-접속) 참고

```bash
# NAS SSH 접속 후

# 1. 백업 파일 목록 확인
ls -lh /volume1/safetynote/backups/

# 2. DB 파일 크기 확인
ls -lh /volume1/safetynote/safety.db

# 3. 업로드 폴더 크기 확인
du -sh /volume1/safetynote/public/uploads/

# 4. PM2 상태 확인
pm2 status
```

### 📊 데이터 규모별 대응 기준

| 작업 건수 | 예상 시점 | 상태 | 대응 |
|-----------|-----------|------|------|
| 500건 이하 | **현재** | 🟢 정상 | 없음 |
| 1,000건 | 6~12개월 후 | 🟢 정상 | 없음 (페이지네이션 적용됨) |
| 3,000건 | 1~2년 후 | 🟡 주의 | 날짜 필터 적극 활용 |
| 5,000건+ | 2~3년 후 | 🟠 대응 필요 | 완료 공사 아카이브 검토 |

### 💾 업로드 파일 관리 (연 1~2회)

사진/첨부파일이 쌓이면 NAS 저장공간을 차지합니다.
2년 이상 지난 오래된 파일은 압축 보관하세요.

```bash
# 예시: 2024년 파일 압축 보관
cd /volume1/safetynote/public/uploads/
tar -czf /volume1/safetynote/backups/uploads_2024.tar.gz 2024/
# 압축 확인 후 원본 삭제
rm -rf 2024/
```

---

## 4. 현재 NAS → 타 NAS 배포 방법

### 방법 A: 원클릭 설치 스크립트 (Phase 6 완료 후 권장)

```bash
# 신규 NAS SSH에서 실행
curl -fsSL https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh | bash
```

### 방법 B: 수동 배포 (현재 사용 가능)

**1단계: 신규 NAS에 필수 소프트웨어 설치**

> ℹ️ SSH 접속 방법은 [선택사항 — SSH 접속](#선택사항--ssh-접속) 참고

```bash
# Node.js v18 설치 (Synology Package Center 또는 nvm 사용)
# nvm 방식 (권장)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
node --version  # v18.x.x 확인

# PM2 설치
npm install -g pm2
```

**2단계: 소스코드 클론**
```bash
cd /volume1
git clone https://github.com/gisubhan-droid/safetynote-server.git safetynote
cd safetynote
npm install
```

**3단계: 환경 설정 파일 생성**
```bash
# 기존 NAS의 .env 복사 또는 신규 생성
cat > .env << 'EOF'
PORT=3443
DB_FILE=/volume1/safetynote/safety.db
UPLOAD_ROOT=/volume1/safetynote/public/uploads
USE_SUBDIR=true
JWT_SECRET=여기에_랜덤_문자열_입력
ADMIN_PASSWORD=관리자_비밀번호
EOF
```

**4단계: PM2로 서버 시작**
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

> ⚠️ `pm2 startup` 명령은 Synology DSM 환경에서 동작하지 않습니다.
> NAS 재부팅 후 자동 복구는 **6장 Watchdog 설정**을 사용하세요.

**5단계: 데이터 이관 (기존 NAS에서)**
```bash
# 기존 NAS에서 DB + 업로드 파일 압축
tar -czf safetynote_data.tar.gz safety.db public/uploads/

# 신규 NAS로 전송 (scp 사용)
scp safetynote_data.tar.gz 신규NAS주소:/volume1/safetynote/

# 신규 NAS에서 압축 해제
cd /volume1/safetynote
tar -xzf safetynote_data.tar.gz
pm2 restart safetynote
```

**6단계: Watchdog 등록 (필수)**

> ℹ️ 신규 NAS 배포 후 반드시 **6장 Watchdog 설정** 절차를 따라 DSM 작업 스케줄러에 등록하세요.
> 등록하지 않으면 NAS 재부팅 시 SafetyNOTE가 자동으로 시작되지 않습니다.

### 방법 C: DB만 이관 (초기 설치, 데이터 없이 시작)

신규 현장에 새로 시작하는 경우 DB 이관 없이 설치만 진행합니다.
서버 첫 실행 시 DB가 자동 생성됩니다.

---

## 5. 업데이트 관리 방안

### 방법 A: 브라우저 자동 업데이트 ✅ **권장**

SSH 없이 브라우저만으로 업데이트할 수 있습니다.

**절차:**
1. 브라우저에서 SafetyNOTE 접속
2. **시스템설정 → 서버 업데이트** 탭 선택
3. **버전 확인** 버튼 클릭 → GitHub 최신 버전과 자동 비교
4. 새 버전이 있으면 **업데이트 적용** 버튼 활성화
5. 관리자 비밀번호 입력 후 진행
6. 내부 자동 처리: DB 백업 → git pull → PM2 재시작 → 완료

```
현재 버전: 4fbdf3f ──┐
                     ▼ 비교
GitHub 최신: 4fbdf3f  (최신 상태)
```

> ✅ 이 방법이 가장 쉽고 안전합니다. SSH 접속이 필요 없습니다.

---

### 방법 B: NAS 수동 업데이트 (선택사항 — SSH 필요)

> ⚠️ 방법 A(브라우저 업데이트)가 불가능한 경우에만 사용하세요.
> SSH 접속 방법은 [선택사항 — SSH 접속](#선택사항--ssh-접속) 참고

```bash
cd /volume1/safetynote

# 1. 수동 DB 백업 (안전을 위해)
cp safety.db backups/safety_$(date +%Y%m%d)_manual.db

# 2. 최신 코드 받기
git pull origin main

# 3. 의존성 업데이트 (필요한 경우)
npm install

# 4. 서버 재시작
pm2 restart safetynote

# 5. 로그 확인
pm2 logs safetynote --nostream --lines 20
```

### 방법 C: scripts/update.sh 사용 (선택사항 — SSH 필요)

```bash
cd /volume1/safetynote
bash scripts/update.sh
```

### 업데이트 후 롤백이 필요한 경우

```bash
# 이전 커밋으로 되돌리기
git log --oneline -10          # 커밋 목록 확인
git checkout 이전커밋해시 -- . # 특정 파일만 복원
pm2 restart safetynote

# DB 복원 (업데이트 전 백업으로)
cp backups/safety_YYYYMMDD_before_update.db safety.db
pm2 restart safetynote
```

---

### 선택사항 — SSH 접속

> SSH는 고급 관리 작업에 사용합니다. 일반 운영 및 업데이트에는 필요하지 않습니다.

**SSH 활성화 방법:**
1. DSM 제어판 → 터미널 및 SNMP → 터미널 탭
2. **SSH 서비스 활성화** 체크 → 포트 확인 (기본 22, 변경 권장)
3. 적용 버튼 클릭

**SSH 포트 변경 권장 (보안):**
- 기본 포트 22는 자동화된 공격 대상이 됩니다
- DSM 제어판 → 터미널 및 SNMP → 포트를 22 이외 값(예: 2222)으로 변경
- 공유기/방화벽에서도 변경된 포트를 열어야 합니다

**접속 방법:**
```bash
# 기본 포트(22) 사용 시
ssh 관리자계정@NAS_IP주소

# 포트 변경 시 (예: 2222)
ssh -p 2222 관리자계정@NAS_IP주소
```

---

## 6. PM2 자동복구 (Watchdog) 설정

> **이 설정은 필수입니다.**  
> NAS가 재부팅되거나 PM2 프로세스가 비정상 종료될 때 SafetyNOTE를 자동으로 복구합니다.

### Watchdog 동작 원리

```
DSM 작업 스케줄러 (매일 00:00 실행)
         ↓
pm2-watchdog.sh 실행
         ↓
PM2 프로세스 상태 확인
    ├─ [online] → 정상, 종료
    └─ [비정상] → 자동 재시작 시도
              ├─ 재시작 성공 → 완료
              └─ crash 3회 반복 → git 자동 롤백
                          └─ 롤백도 실패 → 비상 복구 서버(3445포트) 가동
```

> ⚠️ **왜 `pm2 startup`이 아닌 Watchdog을 사용하나요?**  
> Synology DSM은 부팅 시 시스템 서비스 등록(`systemd`, `init.d`)이 제한되어  
> `pm2 startup` 명령이 정상 동작하지 않습니다.  
> DSM 작업 스케줄러는 DSM이 직접 관리하는 공식 자동화 도구로 안정적입니다.

---

### DSM 작업 스케줄러 등록 절차

#### 1단계: 제어판 → 작업 스케줄러 열기

1. DSM 바탕화면에서 **제어판** 클릭
2. 좌측 메뉴에서 **작업 스케줄러** 클릭

#### 2단계: 새 작업 생성

1. 상단 **생성** 버튼 클릭
2. 메뉴에서 **예약된 작업 → 사용자 정의 스크립트** 선택

#### 3단계: 일반 탭 설정

| 항목 | 값 |
|------|----|
| 작업 이름 | `SafetyNOTE PM2 자동복구` |
| 사용자 | `root` |
| 활성화됨 | ✅ 체크 |

#### 4단계: 스케줄 탭 설정

| 항목 | 값 |
|------|----|
| 반복 실행 날짜 | **매일** |
| 첫 실행 시간 | **00:00** |
| 주기 | **매일** (반복 안 함) |

> 💡 **권장 설정**: 현재 등록된 설정(매일 00:00)은 최소 보호 수준입니다.
> 더 빠른 복구가 필요하다면 **매 5분**으로 변경할 수 있습니다:
> 반복 실행 → 매일 체크 → 첫 실행 00:00 → **매 5분**

#### 5단계: 작업 설정 탭 — 실행 명령 입력

**사용자 정의 스크립트** 입력란에 아래 내용을 그대로 입력합니다:

```
bash /volume1/safetynote/scripts/pm2-watchdog.sh
```

#### 6단계: 확인 및 저장

1. **확인** 버튼 클릭
2. 비밀번호 입력창이 나타나면 DSM 관리자 비밀번호 입력
3. 작업 목록에 `SafetyNOTE PM2 자동복구`가 추가된 것 확인

---

### 등록 확인 및 수동 실행 테스트

#### 등록 확인

DSM 작업 스케줄러 목록에서 다음을 확인하세요:

| 항목 | 확인값 |
|------|--------|
| 작업 이름 | SafetyNOTE PM2 자동복구 |
| 유형 | 사용자 정의 스크립트 |
| 활성화 | ✅ |
| 스케줄 | 매일, 00:00 |

#### 수동 실행 테스트

등록 직후 한 번 수동으로 실행해 정상 동작을 확인하세요:

1. 작업 목록에서 `SafetyNOTE PM2 자동복구` 선택 (클릭)
2. 상단 **실행** 버튼 클릭
3. 확인창에서 **확인** 클릭
4. 잠시 후 작업 결과 확인:
   - 상태: **정상 종료(0)**이면 성공

#### 로그 확인 (선택사항 — SSH 필요)

```bash
# Watchdog 실행 로그 확인
cat /var/log/safetynote-watchdog.log

# 마지막 10줄만 확인
tail -10 /var/log/safetynote-watchdog.log
```

정상 동작 시 로그 예시:
```
[2026-07-23 00:00:01] [OK] safetynote 상태: online — 정상 동작 중
```

---

### Watchdog 자동복구 단계

| 상황 | 동작 |
|------|------|
| PM2 프로세스 정상(online) | 아무것도 하지 않음 (정상 종료) |
| PM2 프로세스 비정상 (1~2회) | 자동 재시작 시도 |
| PM2 프로세스 비정상 (3회 연속) | git 자동 롤백 → 이전 버전으로 복구 |
| 롤백도 실패 | 비상 복구 웹서버 가동 (http://NAS_IP:3445) |

> 💡 **비상 복구 서버 (3445포트)**  
> 모든 자동 복구가 실패한 극단적 상황에서 최소한의 관리 화면을 제공합니다.  
> 브라우저에서 `http://NAS_IP:3445` 접속 시 현재 상태와 복구 안내를 확인할 수 있습니다.

---

### Watchdog 관련 파일 경로

| 파일 | 경로 | 설명 |
|------|------|------|
| Watchdog 스크립트 | `/volume1/safetynote/scripts/pm2-watchdog.sh` | 메인 복구 스크립트 |
| 실행 로그 | `/var/log/safetynote-watchdog.log` | 실행 이력 (최대 500줄) |
| Crash 카운터 | `/var/run/safetynote-crash-count` | 연속 실패 횟수 |
| 비상복구 PID | `/var/run/safetynote-recovery.pid` | 비상 서버 프로세스 ID |

---

## 7. 장애 대응 FAQ

### Q. 서버가 응답하지 않을 때
```bash
pm2 status               # 프로세스 상태 확인
pm2 restart safetynote   # 재시작
pm2 logs safetynote --nostream --lines 50  # 오류 로그 확인
```

> 💡 **SSH 없이도 대응 가능**: 브라우저에서 시스템설정 → 서버 상태 탭에서  
> 현재 서버 상태를 확인하고 재시작 버튼을 사용할 수 있습니다.

### Q. NAS 재부팅 후 SafetyNOTE가 시작 안 될 때

**Watchdog이 등록된 경우**: 다음 날 00:00에 자동 복구됩니다.  
**즉시 복구가 필요한 경우**: DSM 작업 스케줄러에서 수동 실행하세요.

> ⚠️ Watchdog이 등록되지 않은 경우 → [6장 Watchdog 설정](#6-pm2-자동복구-watchdog-설정) 참고

### Q. DB가 손상된 것 같을 때
```bash
# SQLite 무결성 검사
sqlite3 /volume1/safetynote/safety.db "PRAGMA integrity_check;"
# OK 가 나오면 정상

# 손상 시 가장 최근 백업으로 복원
ls -lt /volume1/safetynote/backups/safety_*.db | head -5
cp /volume1/safetynote/backups/safety_YYYYMMDD.db /volume1/safetynote/safety.db
pm2 restart safetynote
```

### Q. 업로드 사진이 안 보일 때
```bash
# 업로드 폴더 권한 확인
ls -la /volume1/safetynote/public/uploads/
# 권한 수정
chmod -R 755 /volume1/safetynote/public/uploads/
```

### Q. 백업 파일 확인 방법
```bash
ls -lh /volume1/safetynote/backups/
# 출력 예시:
# -rw-r--r-- 1 user  2.1M Jun 21 02:00 safety_20260621.db
# -rw-r--r-- 1 user  2.0M Jun 20 02:00 safety_20260620.db
```

### Q. Watchdog 로그에 오류가 있을 때

**"PM2 실행 파일을 찾을 수 없습니다"**
- Node.js 패키지가 설치되어 있는지 확인 (DSM Package Center)
- Node.js v18 또는 v20이 설치되어 있어야 합니다

**"tsx 실행 파일을 찾을 수 없습니다"**
```bash
cd /volume1/safetynote
npm install  # 의존성 재설치
```

**crash 3회 후 자동 롤백 발생 시**
- `/var/log/safetynote-watchdog.log`에서 롤백된 커밋 해시 확인
- 브라우저 시스템설정 → 서버 업데이트 탭에서 최신 버전으로 재업데이트 가능
