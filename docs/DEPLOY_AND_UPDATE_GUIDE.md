# SafetyNOTE — NAS 배포 · 업데이트 · 운영 종합 가이드

> 작성: 세션 51 (2026-06-21)  
> 대상 독자: NAS 비전문가 운영자  
> 환경: Synology NAS + Node.js v18 + PM2 + better-sqlite3  

---

## 목차

1. [현재 상태 요약](#1-현재-상태-요약)
2. [남은 Phase 2~6 효율적 진행 계획](#2-남은-phase-26-효율적-진행-계획)
3. [데이터 증가 대비 운영 계획 (왕초보자용)](#3-데이터-증가-대비-운영-계획-왕초보자용)
4. [현재 NAS → 타 NAS 배포 방법](#4-현재-nas--타-nas-배포-방법)
5. [현재 NAS에서 배포 전 변경 필요 작업](#5-현재-nas에서-배포-전-변경-필요-작업)
6. [각 NAS 업데이트 관리 방안](#6-각-nas-업데이트-관리-방안)

---

## 1. 현재 상태 요약

### 개발 현황
```
GitHub 최신:  bcec93b  (세션 51 완료)
NAS 현재:     2495d8e  (세션 50 hotfix — 세션 51 미반영)
캐시버전:     v=20260621v
```

### Phase 완료 현황
| Phase | 내용 | 상태 |
|-------|------|------|
| Phase 1 | 핵심 버그 수정 + 파일럿 안정화 | ✅ 완료 |
| Phase 2 | Firebase FCM 외부 푸시 알림 | ✅ 완료 (세션 28~36) |
| Phase 3 | 코드 구조 최적화 (라우트 분리) | ⏳ 설계 완료, 실행 대기 |
| Phase 4 | NAS 설치 매뉴얼 (PDF) | ❌ Phase 3·5·6 완료 후 작성 |
| Phase 5 | 브라우저 원클릭 업데이트 자동화 | ❌ 미시작 |
| Phase 6 | 완성형 배포 패키지 (install.sh) | ❌ 미시작 |

### 파일럿 테스트 완료 후 처리된 TASK 목록
| 항목 | 세션 | 상태 |
|------|------|------|
| TASK-001 공사 삭제 기능 | 39 | ✅ 완료 |
| TASK-002 공사 상세에서 작업 생성 후 화면 유지 | 39 | ✅ 완료 |
| TASK-003 공사요청번호 자동생성 | 39~41 | ✅ 완료 |
| TASK-004 시스템설정 5탭 방식 개편 | 45 | ✅ 완료 |
| TASK-005 외선일보 자산구분 필드 | 44 | ✅ 완료 |
| TASK-006 공사종류 "기타" 추가 | 43 | ✅ 완료 |

---

## 2. 남은 Phase 2~6 효율적 진행 계획

### 🗓️ 권고 진행 순서

```
[즉시] NAS 통합 배포 (세션 51 미반영분 반영)
   ↓
[단기] Phase 3 — 코드 구조 정리 (선택사항, 기능에 영향 없음)
   ↓
[중기] Phase 5 — 브라우저 업데이트 자동화 (★ 핵심 편의 기능)
   ↓
[중기] Phase 6 — install.sh 배포 패키지 (★ 타 NAS 배포 필수)
   ↓
[후기] Phase 4 — 설치 매뉴얼 PDF (Phase 5·6 완료 후 작성)
```

---

### Phase 3 — 코드 구조 최적화 (선택적 진행)

> **⚠️ 중요**: Phase 3은 **기능 추가가 아닌 내부 코드 정리**입니다.  
> 실제 사용자에게 보이는 변화는 없으며, **개발 편의성 향상**이 목적입니다.  
> 현재 시스템이 안정적으로 운영된다면 Phase 5 → 6을 먼저 진행해도 무방합니다.

**작업 내용 (총 4 Step, 예상 2~3 세션):**

| Step | 내용 | 예상 시간 |
|------|------|-----------|
| Step 1 | `src/db.ts` 생성 — rawDb 공유 모듈 | 30분 |
| Step 2 | 신규 라우트 파일 9개 생성 + 인라인 라우트 이동 | 2~3시간 |
| Step 3 | 기존 라우트 파일 7개에 인라인 라우트 병합 | 1~2시간 |
| Step 4 | node-server.ts 정리 + 빌드 검증 + 커밋 | 1시간 |

**Phase 3 진행 여부 판단 기준:**
- 앞으로 기능 추가가 많을 예정 → Phase 3 먼저 진행 (코드 관리 편의)
- 빠른 배포가 우선 → Phase 5 → 6을 먼저 진행

---

### Phase 5 — 브라우저 원클릭 업데이트 자동화 ★★★

> **왜 중요한가?** 현재는 NAS에 직접 SSH 접속해서 `git pull` + `pm2 restart`를 해야 합니다.  
> Phase 5 완료 후에는 **브라우저에서 버튼 하나**로 업데이트가 완료됩니다.  
> 여러 NAS를 운영할 때 특히 필수적입니다.

**구현 방식:**

```
관리자 브라우저 → "업데이트 확인" 버튼 클릭
        ↓
서버: GitHub 최신 커밋 확인 → 현재 버전과 비교
        ↓
새 버전 있으면 → "업데이트 적용" 버튼 표시
        ↓
클릭 → 서버 내부에서 자동 실행:
  1. 현재 DB 백업
  2. git pull origin main
  3. npm run build (Cloudflare용 빌드, NAS에선 생략 가능)
  4. pm2 restart safetynote
        ↓
완료 → 브라우저 자동 새로고침 + "업데이트 완료" 알림
```

**구현 난이도**: 중간 (예상 1~2 세션)

**필요한 코드:**
```typescript
// node-server.ts — Phase 5 업데이트 API (예시)
app.get('/api/admin/update/check', ...)     // GitHub 최신 커밋 확인
app.post('/api/admin/update/apply', ...)    // git pull + pm2 restart 실행
app.get('/api/admin/update/status', ...)    // 업데이트 진행 상황 조회
```

**보안 고려사항:**
- 관리자 전용 API (토큰 인증 필수)
- 업데이트 전 자동 DB 백업 필수
- 실패 시 자동 롤백 지원

---

### Phase 6 — 완성형 배포 패키지 ★★★

> **왜 중요한가?** 새 NAS에 설치할 때 매번 수동으로 긴 명령어를 입력해야 하는 불편함을 없애줍니다.  
> `install.sh` 스크립트 하나로 모든 설치가 자동 완료됩니다.

**포함 내용:**
1. `scripts/install.sh` — 원클릭 NAS 설치 스크립트
2. `scripts/update.sh` — 서버 업데이트 스크립트  
3. `scripts/backup.sh` — 데이터 백업 스크립트
4. 서명된 Release APK (GitHub Actions 자동 빌드)

**install.sh 상세 설계는 [4. 현재 NAS → 타 NAS 배포 방법](#4-현재-nas--타-nas-배포-방법) 참조**

---

### Phase 4 — 설치 매뉴얼 (최종 단계)

> Phase 5·6 완료 후 작성. 스크린샷 포함 PDF 형태.  
> 비전문가가 혼자 처음부터 설치할 수 있도록 단계별 작성.

---

## 3. 데이터 증가 대비 운영 계획 (왕초보자용)

### 📊 이 프로그램의 데이터는 얼마나 쌓이나요?

```
매월 예상 데이터 증가량:
┌─────────────────┬──────────┬──────────────┐
│ 종류            │ 월 증가  │ 3년 후 예상  │
├─────────────────┼──────────┼──────────────┤
│ 작업 기록       │ ~300건   │ ~10,800건    │
│ 작업일보        │ ~200건   │ ~7,200건     │
│ TBM 기록        │ ~300건   │ ~10,800건    │
│ 알림 기록       │ ~2,000건 │ ~72,000건    │
│ 사진 파일       │ ~500개   │ ~18,000개    │
└─────────────────┴──────────┴──────────────┘

DB 파일 크기 예상: 3년 후 약 500MB ~ 1GB
사진 용량 예상:    3년 후 약 10GB ~ 30GB
```

**결론: SQLite는 이 정도 규모에서 충분히 안정적입니다.**  
(현재 이미 pragma 최적화 + WAL 모드 + 인덱스 5개가 적용되어 있습니다)

---

### 🔧 초보자도 할 수 있는 월간 유지보수 (5분이면 충분!)

#### 월 1회 — DB 백업 (필수!)

```bash
# NAS에 SSH로 접속한 후 아래 명령어 한 줄만 입력하면 됩니다:

cd /volume1/safetynote && \
cp data/safety.db "backups/safety_$(date +%Y%m%d).db"

# 예: backups/safety_20260701.db 파일이 생성됩니다
```

**더 쉬운 방법**: 아래 내용으로 `backup.sh` 파일을 만들어두면 실행만 하면 됩니다:
```bash
#!/bin/bash
# /volume1/safetynote/scripts/backup.sh
BACKUP_DIR="/volume1/safetynote/backups"
mkdir -p "$BACKUP_DIR"
cp /volume1/safetynote/data/safety.db "$BACKUP_DIR/safety_$(date +%Y%m%d_%H%M).db"
# 30일 이전 백업 자동 삭제 (디스크 절약)
find "$BACKUP_DIR" -name "safety_*.db" -mtime +30 -delete
echo "✅ 백업 완료: safety_$(date +%Y%m%d_%H%M).db"
```

#### 월 1회 — 서버 상태 확인

```bash
# PM2 상태 확인 (정상이면 'online' 표시)
pm2 status

# 메모리 사용량 확인 (100MB 이상이면 restart 고려)
pm2 monit
```

#### 분기 1회 — 사진 용량 확인

```bash
# uploads 폴더 용량 확인
du -sh /volume1/safetynote/uploads/
```

---

### ⚠️ 이것만 절대 하지 마세요!

| 하면 안 되는 것 | 이유 |
|----------------|------|
| `safety.db` 파일을 직접 삭제 | 모든 데이터 영구 삭제됨 |
| 서버 실행 중 `safety.db` 복사 이외의 조작 | DB 손상 가능 |
| `node_modules` 폴더 삭제 | 서버 재시작 불가 |
| `.env` 파일 삭제 | 서버 시작 안 됨 |

---

### 🚑 응급 처치 — 서버가 안 켜질 때

```bash
# 1단계: 상태 확인
pm2 status
pm2 logs safetynote --lines 20

# 2단계: 재시작 시도
pm2 restart safetynote

# 3단계: 그래도 안 되면 완전 재시작
pm2 delete safetynote
cd /volume1/safetynote
pm2 start node-server.ts --name safetynote --interpreter ts-node
```

---

### 📅 연간 선택적 유지보수 (데이터 정리)

1~2년 후 DB가 커지면 **선택적으로** 진행:

```sql
-- 오래된 알림 정리 (읽은 알림 중 1년 이전 것 삭제)
-- NAS에서: wrangler d1 execute OR sqlite3 직접 실행
DELETE FROM notifications 
WHERE is_read = 1 AND created_at < date('now', '-1 year');

-- 빈 공간 회수 (DB 파일 크기 줄임)
VACUUM;
```

> ⚠️ **주의**: 이 작업 전에 반드시 DB 백업을 먼저 하세요!

---

## 4. 현재 NAS → 타 NAS 배포 방법

### 🎯 배포 방식 2가지

| 방식 | 난이도 | 시간 | 권장 대상 |
|------|--------|------|-----------|
| **방식 A: install.sh 자동 설치** | ⭐ 쉬움 | 15분 | Phase 6 완료 후 |
| **방식 B: 수동 설치** | ⭐⭐⭐ 보통 | 1~2시간 | 현재 (Phase 6 전) |

---

### 방식 A: install.sh 자동 설치 (Phase 6 완료 후)

```bash
# 새 NAS에 SSH로 접속 후 이 명령어 한 줄만 입력:
curl -sSL https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh | bash
```

스크립트가 자동으로:
1. Node.js v18 설치 확인
2. 프로그램 다운로드 (git clone)
3. 필요한 패키지 설치 (npm install)
4. 환경설정 파일 생성 (.env)
5. PM2로 자동 시작 등록

---

### 방식 B: 수동 설치 (현재 방법 — 단계별 가이드)

#### 사전 준비 (새 NAS에서)

**Step 1: NAS에 Node.js v18 설치**
```
Synology DSM 관리자 화면 → 패키지 센터 → "Node.js v18" 검색 → 설치
```

**Step 2: SSH 활성화**
```
DSM → 제어판 → 터미널 및 SNMP → SSH 서비스 활성화 체크
```

**Step 3: SSH 접속**
```bash
# Windows: PuTTY 또는 PowerShell
ssh admin@NAS의IP주소 -p 22

# Mac/Linux: 터미널
ssh admin@NAS의IP주소
```

---

#### 프로그램 설치

**Step 4: 설치 폴더 생성 및 코드 다운로드**
```bash
# Node.js v18 경로 설정 (매우 중요!)
export PATH=/volume1/@appstore/Node.js_v18/usr/local/bin:$PATH

# 설치 폴더 이동
cd /volume1

# GitHub에서 코드 다운로드
git clone https://github.com/gisubhan-droid/safetynote-server.git safetynote

# 폴더 이동
cd safetynote

# 필요한 패키지 설치 (5~10분 소요)
npm install
```

**Step 5: 환경설정 파일 생성**
```bash
# .env 파일 생성 (아래 내용을 복사하여 입력)
cat > .env << 'EOF'
PORT=3443
DB_PATH=/volume1/safetynote/data/safety.db
UPLOAD_DIR=/volume1/safetynote/uploads
JWT_SECRET=여기에_랜덤_문자열_입력_예시_safetynote2026
DEPLOY_WEBHOOK_SECRET=safetynote-nas-2026
EOF
```

> ⚠️ `JWT_SECRET`은 반드시 바꾸세요! 아무 영문+숫자 조합으로 변경.  
> 예: `JWT_SECRET=mynas_safety_abc123xyz789`

**Step 6: DB 폴더 및 데이터 폴더 생성**
```bash
mkdir -p /volume1/safetynote/data
mkdir -p /volume1/safetynote/uploads
mkdir -p /volume1/safetynote/backups

# safety.db 심볼릭 링크 생성 (중요!)
ln -s /volume1/safetynote/data/safety.db /volume1/safetynote/safety.db
```

**Step 7: PM2로 서버 시작**
```bash
# PM2 설치 (전역)
npm install -g pm2

# 서버 시작
pm2 start node-server.ts \
  --name safetynote \
  --interpreter npx \
  --interpreter-args "ts-node" \
  -- node-server.ts

# 또는 더 간단하게:
npx ts-node node-server.ts &

# 재시작 시 자동 실행 등록
pm2 startup
pm2 save
```

**Step 8: 접속 테스트**
```bash
# 서버 동작 확인
curl http://localhost:3443/api/health

# 브라우저에서 접속
http://NAS의IP주소:3443
```

---

#### 기존 NAS 데이터 이전 (선택사항)

기존 NAS의 데이터를 새 NAS로 옮기려면:

```bash
# 기존 NAS에서: DB 파일 내보내기
scp /volume1/safetynote/data/safety.db admin@새NAS_IP:/volume1/safetynote/data/

# 기존 NAS에서: 업로드 사진 내보내기 (용량이 크면 시간 소요)
scp -r /volume1/safetynote/uploads/ admin@새NAS_IP:/volume1/safetynote/
```

---

### 🌐 HTTPS 보안 접속 설정 (선택사항이지만 강력 권장)

앱에서 접속 시 HTTPS가 필요합니다:

```
DSM → 제어판 → 로그인 포털 → 고급 탭
→ 역방향 프록시 추가
  - 원본: HTTPS, 포트 3443
  - 대상: HTTP, localhost, 3443
→ 인증서 탭에서 Let's Encrypt 인증서 발급
```

또는 Synology DDNS + DSM 인증서를 활용하면 자동 HTTPS 가능.

---

## 5. 현재 NAS에서 배포 전 변경 필요 작업

> 현재 운영 중인 NAS는 **단일 NAS 전용** 설정으로 되어 있습니다.  
> 여러 NAS에 배포하려면 아래 항목을 수정해야 합니다.

### ✅ 필수 변경 항목

#### 1. JWT_SECRET 개별화 (가장 중요!)

**현재 상태**: 모든 NAS가 동일한 `JWT_SECRET`을 공유하면 로그인 토큰이 NAS 간 교차 인증됨

**해결**: 각 NAS마다 다른 `JWT_SECRET` 사용
```bash
# 각 NAS의 .env 파일에서:
JWT_SECRET=현장코드_safetynote_2026_랜덤값
# 예: 강남현장 NAS → JWT_SECRET=gangnam_safetynote_k8x3m1
# 예: 부산현장 NAS → JWT_SECRET=busan_safetynote_q7p2n9
```

#### 2. ADMIN_INITIAL_PASSWORD 개별화 (권장)

**현재**: 초기 관리자 비밀번호가 코드에 하드코딩되어 있을 가능성
**해결**: 각 현장별로 다른 초기 비밀번호 설정 후 .env으로 관리

#### 3. Webhook URL 현장별 설정

```bash
# .env
NAS_WEBHOOK_URL=https://현장명.myds.me:3443/api/dist/apk/webhook
```

#### 4. DDNS 주소 개별화

각 NAS에 고유한 Synology DDNS 서브도메인 설정:
- 현장A: `safetynote-a.synology.me`
- 현장B: `safetynote-b.synology.me`

---

### ⚙️ 코드 레벨 변경 (개발자 작업 필요)

#### 1. .env 설정 항목 표준화

```bash
# .env 표준 템플릿 (install.sh에서 자동 생성)
PORT=3443
DB_PATH=/volume1/safetynote/data/safety.db
UPLOAD_DIR=/volume1/safetynote/uploads
JWT_SECRET=CHANGE_ME_UNIQUE_PER_NAS
SITE_NAME=SafetyNOTE              # 현장명 (화면 표시용)
DEPLOY_WEBHOOK_SECRET=CHANGE_ME
```

#### 2. patchSchema DB 초기화 개선

현재: 서버 시작 시 자동으로 테이블/컬럼 생성  
권장: 첫 설치 시 초기 관리자 계정 자동 생성 추가

```typescript
// node-server.ts — 추가 예정
function seedInitialData() {
  const count = rawDb.prepare('SELECT COUNT(*) as cnt FROM users').get() as any
  if (count.cnt === 0) {
    // 초기 관리자 계정 자동 생성
    const hashedPw = hashPassword(process.env.ADMIN_INITIAL_PASSWORD || 'admin1234')
    rawDb.prepare(`INSERT INTO users (name, login_id, password, role) VALUES (?, ?, ?, ?)`)
      .run('관리자', 'admin', hashedPw, 'admin')
    console.log('[seed] 초기 관리자 계정 생성 완료')
  }
}
```

---

## 6. 각 NAS 업데이트 관리 방안

### 현재 방법 (Phase 5 완료 전)

각 NAS에 개별 SSH 접속하여 수동 업데이트:

```bash
# 각 NAS에서 실행
cd /volume1/safetynote
export PATH=/volume1/@appstore/Node.js_v18/usr/local/bin:$PATH
git pull origin main
pm2 restart safetynote
```

**문제점**: NAS가 2개 이상이면 매번 각각 접속해야 함 → 번거롭고 누락 위험

---

### Phase 5 완료 후 — 브라우저 원클릭 업데이트

각 NAS의 관리자 화면에서 직접 업데이트:

```
관리자 로그인 → 시스템 설정 → [업데이트] 탭
→ "최신 버전 확인" 버튼 클릭
→ 새 버전 있으면 → "업데이트 적용" 버튼 클릭
→ 자동으로: git pull + pm2 restart 실행
→ 완료 메시지 표시
```

---

### 여러 NAS 동시 관리 방안 (중장기)

#### 방안 1: 업데이트 공지 시스템 (쉬운 방법)

```
GitHub에 새 버전 릴리즈 → 각 NAS 관리자에게 카카오톡/문자 공지
→ 각 관리자가 본인 NAS에서 브라우저로 업데이트 적용
```

#### 방안 2: 중앙 관리 서버 (어려운 방법, 장기 계획)

```
중앙 GitHub Actions → 각 현장 NAS에 Webhook 발송
→ 각 NAS에서 자동으로 git pull + pm2 restart
```

---

### 📋 업데이트 체크리스트 (매 배포 시)

```
[ ] 1. GitHub 최신 커밋 확인 (버그 수정인지 기능 추가인지)
[ ] 2. DB 백업 (업데이트 전 필수!)
    cd /volume1/safetynote
    cp data/safety.db "backups/safety_$(date +%Y%m%d_before_update).db"
[ ] 3. 업데이트 적용
    git pull origin main
[ ] 4. 서버 재시작
    pm2 restart safetynote
[ ] 5. 동작 확인 (로그인 → 기본 화면 정상 표시)
[ ] 6. 문제 발생 시 롤백
    cd /volume1/safetynote
    git checkout 이전_커밋_해시
    pm2 restart safetynote
```

---

### 🔄 롤백 방법 (업데이트 후 문제 발생 시)

```bash
# 1. 롤백할 커밋 찾기
git log --oneline -10

# 2. 특정 버전으로 롤백
git checkout 커밋해시

# 3. 서버 재시작
pm2 restart safetynote

# 4. DB 롤백 필요 시 (DB 구조 변경이 있었던 경우)
cp backups/safety_20260701_before_update.db data/safety.db
pm2 restart safetynote
```

---

## 📎 부록: NAS 운영 환경 참고 정보

### 현재 운영 NAS 환경
| 항목 | 내용 |
|------|------|
| OS | Synology DSM (Linux 4.4.180+) |
| Node.js | v18 (`/volume1/@appstore/Node.js_v18/`) |
| PM2 | 전역 설치 |
| 서버 | node-server.ts (better-sqlite3 동기 API) |
| DB | SQLite (`/volume1/safetynote/data/safety.db`) |
| 포트 | 3443 (HTTPS) |
| DDNS | `linkmax.myds.me` |
| NAS 경로 | `/volume1/safetynote/` |

### 중요한 파일/폴더 위치
```
/volume1/safetynote/
├── node-server.ts          ← 서버 메인 파일
├── .env                    ← 환경설정 (비밀번호 등)
├── data/
│   └── safety.db           ← 실제 운영 DB ★ 백업 필수!
├── uploads/                ← 업로드된 사진/파일
├── backups/                ← DB 백업 보관
├── scripts/
│   ├── backup.sh           ← 백업 스크립트
│   ├── update.sh           ← 업데이트 스크립트
│   └── rollback.sh         ← 롤백 스크립트
└── safety.db               ← 심볼릭 링크 (data/safety.db 가리킴)
```

---

*최종 업데이트: 세션 51 (2026-06-21)*  
*다음 업데이트 예정: Phase 5 (브라우저 업데이트 자동화) 완료 후*
