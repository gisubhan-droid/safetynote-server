# SafetyNOTE — NAS 배포 · 업데이트 · 운영 종합 가이드

> 최초 작성: 세션 51 (2026-06-21)
> 마지막 업데이트: 세션 54 (2026-06-21)
> 대상 독자: NAS 비전문가 운영자
> 환경: Synology NAS + Node.js v18 + PM2 + better-sqlite3

---

## 목차

1. [현재 상태 요약](#1-현재-상태-요약)
2. [남은 Phase 진행 계획](#2-남은-phase-진행-계획)
3. [데이터 증가 대비 운영 계획 (왕초보자용)](#3-데이터-증가-대비-운영-계획-왕초보자용)
4. [현재 NAS → 타 NAS 배포 방법](#4-현재-nas--타-nas-배포-방법)
5. [업데이트 관리 방안](#5-업데이트-관리-방안)
6. [장애 대응 FAQ](#6-장애-대응-faq)

---

## 1. 현재 상태 요약

### 개발 현황
```
GitHub 최신:  8f7d502  (세션 54 — 자동 DB 백업 + 페이지네이션)
캐시버전:     v=20260621y
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

### 📅 월 1회 직접 확인할 것

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
pm2 startup  # 부팅 시 자동 시작 설정
```

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

### 방법 C: DB만 이관 (초기 설치, 데이터 없이 시작)

신규 현장에 새로 시작하는 경우 DB 이관 없이 설치만 진행합니다.
서버 첫 실행 시 DB가 자동 생성됩니다.

---

## 5. 업데이트 관리 방안

### 방법 A: 브라우저 자동 업데이트 (Phase 5 완료, 권장)

1. 브라우저에서 SafetyNOTE 접속
2. **시스템설정 → 서버 업데이트** 탭
3. **버전 확인** 버튼 클릭 → GitHub 최신 버전과 비교
4. 새 버전이 있으면 **업데이트 적용** 버튼 활성화
5. 관리자 비밀번호 입력 후 진행
6. DB 자동 백업 → git pull → PM2 재시작 → 완료

```
현재 버전: 8f7d502 ──┐
                     ▼ 비교
GitHub 최신: 8f7d502  (최신 상태)
```

### 방법 B: NAS 수동 업데이트 (SSH)

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

### 방법 C: scripts/update.sh 사용

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

## 6. 장애 대응 FAQ

### Q. 서버가 응답하지 않을 때
```bash
pm2 status               # 프로세스 상태 확인
pm2 restart safetynote   # 재시작
pm2 logs safetynote --nostream --lines 50  # 오류 로그 확인
```

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

### Q. 부팅 후 서버가 자동 시작 안 될 때
```bash
pm2 startup    # 자동 시작 명령어 출력 → 해당 명령어 실행
pm2 save       # 현재 프로세스 목록 저장
```

### Q. 백업 파일 확인 방법
```bash
ls -lh /volume1/safetynote/backups/
# 출력 예시:
# -rw-r--r-- 1 user  2.1M Jun 21 02:00 safety_20260621.db
# -rw-r--r-- 1 user  2.0M Jun 20 02:00 safety_20260620.db
```
