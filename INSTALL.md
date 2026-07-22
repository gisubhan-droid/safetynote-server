# SafetyNOTE 설치 가이드

> **현장 안전관리 시스템** — 자체 서버(온프레미스) 배포판  
> Node.js + SQLite 기반 / 다중 NAS·Linux 서버 동시 설치 지원

---

## ⚠️ 다중 NAS 설치 핵심 원칙

| 항목 | 기본값 | 각 NAS별 독립 설정 방법 |
|------|--------|------------------------|
| 설치 경로 | `/volume1/safetynote` | `INSTALL_DIR` 변수 변경 |
| 서버 포트 | `3443` | `.env` `PORT=` 수정 |
| DB 경로 | `<INSTALL_DIR>/safety.db` | `.env` `DB_PATH=` 수정 |
| 업로드 경로 | `<INSTALL_DIR>/public/uploads` | `.env` `UPLOAD_PATH=` 수정 |
| JWT 시크릿 | 자동 생성(32자) | 자동 생성 — **NAS마다 다름** ✅ |
| 비상복구 PW | `recovery1234` | `.env` `RECOVERY_PASSWORD=` 수정 |

**🔴 NAS마다 반드시 달리 설정해야 할 항목**: `PORT`, `JWT_SECRET`, `RECOVERY_PASSWORD`

---

## 목차
1. [시스템 요구사항](#1-시스템-요구사항)
2. [자동 설치 (권장)](#2-자동-설치-권장)
3. [수동 설치](#3-수동-설치)
4. [환경변수 설정](#4-환경변수-설정)
5. [NAS 연동](#5-nas-연동)
6. [방화벽 설정](#6-방화벽-설정)
7. [HTTPS 설정 (Synology DSM)](#7-https-설정-synology-dsm)
8. [서비스 관리](#8-서비스-관리)
9. [백업 및 복구](#9-백업-및-복구)
10. [초기 계정 및 사용자 등록](#10-초기-계정-및-사용자-등록)
11. [모바일 앱 설치 (PWA)](#11-모바일-앱-설치-pwa)
12. [문제 해결](#12-문제-해결)
13. [다중 NAS 운영 체크리스트](#13-다중-nas-운영-체크리스트)

---

## 1. 시스템 요구사항

| 항목 | 최소 | 권장 |
|------|------|------|
| OS | Ubuntu 20.04 / CentOS 8 | Ubuntu 22.04 LTS |
| CPU | 1 Core | 2 Core 이상 |
| RAM | 1 GB | 2 GB 이상 |
| 디스크 | 10 GB | 50 GB 이상 (사진 저장 고려) |
| Node.js | v18 이상 | v20 LTS |
| 포트 | 3000 (기본) | 80/443 (Nginx 사용 시) |

---

## 2. 자동 설치 (권장)

```bash
# 1. 압축 해제
tar -xzf safetynote-v1.0.tar.gz
cd safetynote

# 2. 설치 스크립트 실행 (root 필요)
sudo bash scripts/setup.sh
```

설치 완료 후:
```
╔══════════════════════════════════════════╗
║      SafetyNOTE 설치 완료!              ║
╚══════════════════════════════════════════╝
  🌐 접속 URL  : http://서버IP:3000
  👤 초기 계정 : ID: admin  /  PW: admin1234
  ⚠️  최초 로그인 후 비밀번호를 변경하세요!
```

### 포트 변경 (선택)
```bash
sudo PORT=8080 bash scripts/setup.sh
```

---

## 3. 수동 설치

### Node.js 20 설치
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### PM2 설치
```bash
sudo npm install -g pm2
```

### 앱 설치
```bash
sudo mkdir -p /opt/safetynote
sudo cp -r . /opt/safetynote/
cd /opt/safetynote
sudo npm install --omit=dev
```

### 환경변수 설정
```bash
cp .env.example .env
nano .env
```

### DB 초기화
```bash
node -e "
const Database = require('better-sqlite3');
const fs = require('fs'), path = require('path');
const db = new Database('./safety.db');
db.pragma('journal_mode = WAL');
const files = fs.readdirSync('./migrations')
  .filter(f => f.endsWith('.sql')).sort();
for (const f of files) {
  try { db.exec(fs.readFileSync('./migrations/' + f, 'utf8')); console.log('✓', f); }
  catch(e) { console.warn('skip:', f, e.message); }
}
db.close(); console.log('DB 초기화 완료');
"
```

### 서비스 시작
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 4. 환경변수 설정

`.env` 파일 편집:

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `PORT` | 서버 포트 | `3000` |
| `DB_PATH` | SQLite DB 파일 경로 | `./safety.db` |
| `UPLOAD_PATH` | 업로드 저장 경로 | `./public/uploads` |
| `UPLOAD_SUBDIR` | 연도/월 하위폴더 자동생성 | `true` |

```env
PORT=3000
DB_PATH=/opt/safetynote/safety.db
UPLOAD_PATH=/opt/safetynote/public/uploads
UPLOAD_SUBDIR=true
```

변경 후 재시작:
```bash
pm2 restart safety-management
```

---

## 5. NAS 연동

### Synology NAS (NFS)
```bash
sudo apt-get install nfs-common
sudo mkdir -p /mnt/nas/safetynote
sudo mount -t nfs NAS_IP:/volume1/safetynote /mnt/nas/safetynote

# /etc/fstab 자동 마운트 등록
echo "NAS_IP:/volume1/safetynote /mnt/nas/safetynote nfs defaults,_netdev 0 0" \
  | sudo tee -a /etc/fstab
```

`.env` 설정:
```env
UPLOAD_PATH=/mnt/nas/safetynote/uploads
```

### QNAP NAS (SMB)
```bash
sudo apt-get install cifs-utils
sudo mount -t cifs //NAS_IP/safetynote /mnt/nas/safetynote \
  -o username=USER,password=PASS
```

---

## 6. 방화벽 설정

```bash
# UFW (Ubuntu)
sudo ufw allow 3000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload

# firewalld (CentOS)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

---

## 7. HTTPS 설정 (Synology DSM)

### Synology NAS — node-server.ts HTTPS 직접 서빙 (권장)

> Synology DSM Let's Encrypt 인증서를 node-server.ts가 **자동 탐지**하여 HTTPS 직접 서빙.  
> **Nginx 리버스 프록시 불필요** — DSM 인증서 갱신 시 `pm2 restart safetynote`만 실행.

```
앱/브라우저
    ↓ https://NAS_DDNS:3443
공유기 포트포워딩 (외부 3443 → NAS 내부 IP:3443)
    ↓
node-server.ts (PORT=3443)
    ← https.createServer() 로 HTTPS 직접 서빙
    ← Synology DSM 인증서 자동 로드
```

#### DSM 인증서 경로 (자동 탐지 — 수동 설정 불필요)
```bash
# 현재 활성 인증서 폴더 확인
cat /usr/syno/etc/certificate/_archive/DEFAULT  # 예: 4a2zGZ

# 인증서 파일 목록 확인
ls /usr/syno/etc/certificate/_archive/$(cat /usr/syno/etc/certificate/_archive/DEFAULT)/
# cert.pem  chain.pem  fullchain.pem  privkey.pem
```

#### 서버 시작 시 정상 로그
```
[SSL] Synology 인증서 로드 완료: /usr/syno/etc/certificate/_archive/4a2zGZ
✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443
```

#### 인증서 갱신 후 처리
```bash
# DSM이 Let's Encrypt 인증서 자동 갱신하면 → PM2 재시작만 하면 됨
pm2 restart safetynote --update-env
sleep 5 && pm2 logs safetynote --nostream --lines 5
```

#### 샌드박스/개발 환경 (자동 HTTP 폴백)
```
Synology 인증서 경로 없음 → HTTP 자동 폴백
✅ 서버 실행 중 (HTTP): http://0.0.0.0:3000
```
> 코드 변경 없이 두 환경에서 모두 동작.

---

### Linux 서버 (Ubuntu) — Nginx 리버스 프록시 + Let's Encrypt

```bash
# Nginx + Certbot 설치
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Nginx 설정
sudo nano /etc/nginx/sites-available/safetynote
```

```nginx
server {
    listen 80;
    server_name your-domain.com;
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # SSE 지원
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/safetynote /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

---

## 8. 서비스 관리

```bash
pm2 list                                    # 상태 확인
pm2 logs safety-management --nostream       # 로그 확인
pm2 restart safety-management               # 재시작
pm2 stop safety-management                  # 중지
pm2 monit                                   # 실시간 모니터링
```

---

## 9. 백업 및 복구

### 자동 백업 스크립트
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backup/safetynote
mkdir -p $BACKUP_DIR

# DB 백업
cp /opt/safetynote/safety.db $BACKUP_DIR/safety_$DATE.db

# 업로드 파일 백업
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz \
  /opt/safetynote/public/uploads/ 2>/dev/null

# 30일 초과 삭제
find $BACKUP_DIR -mtime +30 -delete
echo "백업 완료: $DATE"
```

### cron 등록 (매일 새벽 2시)
```bash
crontab -e
# 추가:
0 2 * * * /bin/bash /opt/safetynote/scripts/backup.sh >> /var/log/safetynote-backup.log 2>&1
```

### 복구
```bash
pm2 stop safety-management
cp /opt/backup/safetynote/safety_YYYYMMDD.db /opt/safetynote/safety.db
pm2 start safety-management
```

---

## 10. 초기 계정 및 사용자 등록

### 최초 로그인

| 항목 | 값 |
|------|-----|
| 접속 URL | `http://서버IP:3000` |
| 아이디 | `admin` |
| 비밀번호 | `admin1234` |

> ⚠️ **최초 로그인 후 반드시 비밀번호를 변경하세요.**

### 비밀번호 변경
1. `admin` 로그인
2. 좌측 메뉴 → **내 정보**
3. 비밀번호 변경

### 사용자 등록 순서
```
1. admin 로그인
2. 좌측 메뉴 → [계정관리]
3. [사용자 추가] 버튼
4. 역할별 계정 등록
```

### 역할 구분

| 역할 | 주요 기능 |
|------|-----------|
| 시스템관리자 (admin) | 계정관리, 시스템 설정 전체 |
| 관리자 (CEO) | 결재, 대시보드 |
| 안전관리자 | TBM 생성/결재, 작업 지시 |
| 현장대리인 | 현장 감독, 점검 |
| 작업자 | 작업 수행, TBM 서명, 사진 업로드 |

---

## 11. 모바일 앱 설치 (PWA)

SafetyNOTE는 **PWA(Progressive Web App)** 를 지원합니다.  
별도 앱스토어 없이 홈 화면에 설치하면 네이티브 앱처럼 사용할 수 있습니다.

### Android (Chrome)
1. 브라우저로 서버 주소 접속
2. 로그인 후 하단에 **"SafetyNOTE 앱 설치"** 배너 표시
3. **[설치]** 버튼 탭
4. 홈 화면에 아이콘 추가됨

### iOS (Safari)
1. **Safari** 로 서버 주소 접속 (Chrome은 미지원)
2. 로그인 후 안내 팝업 표시
3. 하단 **공유 버튼** ⬆️ → **"홈 화면에 추가"** 선택
4. 우측 상단 **"추가"** 탭

### PWA 주요 기능
- 📱 홈 화면 아이콘 (앱처럼 실행)
- 📶 오프라인 캐시 (네트워크 없어도 이전 데이터 조회 가능)
- 🔔 푸시 알림 지원
- ⬇️ 하단 탭 네비게이션 바
- 👆 모달 아래로 스와이프하여 닫기

---

## 12. 문제 해결

### 서버 시작 안 될 때
```bash
pm2 logs safety-management --nostream --lines 50
```

| 오류 | 원인 | 해결 |
|------|------|------|
| `EADDRINUSE` | 포트 충돌 | `.env`에서 PORT 변경 |
| `SQLITE_CANTOPEN` | DB 권한/경로 문제 | `chmod 664 safety.db` |
| `Cannot find module` | 의존성 미설치 | `npm install --omit=dev` |

### DB 권한 오류
```bash
chown safetynote:safetynote /opt/safetynote/safety.db
chmod 664 /opt/safetynote/safety.db
```

### 업로드 실패
```bash
chown -R safetynote:safetynote /opt/safetynote/public/uploads/
chmod 775 /opt/safetynote/public/uploads/
```

### 포트 점유 확인
```bash
lsof -i :3000
fuser -k 3000/tcp
```

---

## 업데이트

```bash
# 1. 새 버전 압축 해제
tar -xzf safetynote-vX.X.tar.gz

# 2. DB 백업 (필수)
cp /opt/safetynote/safety.db /opt/backup/safety_before_update.db

# 3. 서비스 중지
pm2 stop safety-management

# 4. 소스 교체 (DB/uploads/.env 제외)
cp -r safetynote-vX.X/src safetynote-vX.X/node-server.ts \
   safetynote-vX.X/public/static /opt/safetynote/
cd /opt/safetynote && npm install --omit=dev

# 5. 재시작
pm2 start safety-management
```

---

## 13. 다중 NAS 운영 체크리스트

> 2대 이상의 NAS에 동시 설치 시 반드시 확인할 항목.

### 📋 NAS별 독립 설정 체크리스트

```bash
# 각 NAS에서 아래 명령으로 설정 확인
cat /volume1/safetynote/.env
```

| 항목 | NAS-A (예시) | NAS-B (예시) | 비고 |
|------|------------|------------|------|
| `PORT` | `3443` | `3443` | 공유기 포트포워딩 각자 독립 |
| `DB_PATH` | `/volume1/safetynote/safety.db` | `/volume1/safetynote/safety.db` | NAS마다 별도 파일 |
| `UPLOAD_PATH` | `/volume1/safetynote/public/uploads` | `/volume1/safetynote/public/uploads` | NAS마다 별도 |
| `JWT_SECRET` | `auto-generated-32chars-A` | `auto-generated-32chars-B` | **⚠️ 반드시 달라야 함** |
| `RECOVERY_PASSWORD` | 변경 권장 | 변경 권장 | **⚠️ 보안상 변경 필수** |
| `DEPLOY_WEBHOOK_SECRET` | 각자 설정 | 각자 설정 | 선택사항 |

### 🔧 PM2 등록 방법 (NAS별 실행 — ecosystem.config.cjs 방식은 hang 발생)

```bash
# ── [메인 서버] ─────────────────────────────────────────────────────────────
PORT=3443 pm2 start /volume1/safetynote/node_modules/.bin/tsx \
  --name safetynote \
  --interpreter /usr/local/bin/node \
  -- node-server.ts

# ── [비상 복구 서버] ─────────────────────────────────────────────────────────
pm2 start /volume1/safetynote/scripts/recovery-server.py \
  --name safetynote-recovery \
  --interpreter /usr/bin/python3 \
  -- /volume1/safetynote 3445

pm2 save
```

> **주의**: `ecosystem.config.cjs`는 참고 문서용. NAS에서 `pm2 start ecosystem.config.cjs` 실행 시 hang 발생.  
> 반드시 위의 커맨드라인 직접 등록 방법 사용.

### 🔍 시스템 점검 결과 요약 (2026-07-22 기준)

#### ✅ 정상 동작 확인된 항목

| 항목 | 상태 | 내용 |
|------|------|------|
| `resolveDbPath()` | ✅ | 1) `DB_PATH` env → 2) wrangler D1 로컬 sqlite → 3) `safety.db` 순 자동 탐지 |
| `UPLOAD_ROOT` | ✅ | `UPLOAD_PATH` env 없으면 `<설치경로>/public/uploads` 기본값 |
| `patchSchema` | ✅ | 서버 시작 시 자동 실행. `duplicate column`/`already exists` 오류 무시 처리 — 다중 NAS 안전 |
| HTTPS 자동 탐지 | ✅ | Synology 인증서 없으면 HTTP 자동 폴백 — 코드 변경 불필요 |
| `recovery-server.py` | ✅ | `sys.argv[1]`로 설치 경로 주입 — 다중 NAS 대응 |
| KST 시간 표시 | ✅ | 전체 `_toKSTDateTime()` / `getKSTNow()` 헬퍼 적용 완료 |

#### ⚠️ 주의 필요 항목 (운영 시 확인)

| 항목 | 위치 | 내용 |
|------|------|------|
| `/volume1/safetynote` fallback | `node-server.ts` L2303, L3880 | `reset_risk_master_data.sql` 탐색 경로 마지막에 고정 경로 존재 — `cwd()/scriptDir()` 먼저 탐색하므로 정상 동작 |
| Node.js 버전 | `install.sh` | v18만 탐지 — v20 NAS는 수동 설치 필요 (v20 경로: `/volume1/@appstore/Node.js_v20/...`) |
| `pm2 startup` | 재부팅 대응 | 설치 후 `pm2 startup` + `pm2 save` 필수 |
| 비상복구 기본 PW | `.env` | `RECOVERY_PASSWORD=recovery1234` 기본값 → **반드시 변경** |

#### 🚫 각 NAS별 독립성 보장 확인

```bash
# 각 NAS에서 실행 — DB 분리 확인
pm2 logs safetynote --nostream --lines 5
# 정상: [DB] /volume1/safetynote/safety.db 또는 DB_PATH 값

# JWT 시크릿 서로 다른지 확인 (NAS-A와 NAS-B 비교)
grep JWT_SECRET /volume1/safetynote/.env
```

### 🔄 업데이트 절차 (다중 NAS 일괄 업데이트)

```bash
# 각 NAS에서 개별 실행 (원격 SSH 가능 시)
cd /volume1/safetynote
bash scripts/nas-deploy.sh   # git pull + pm2 restart + 동작 검증 자동화

# 또는 수동
git pull origin main
pm2 restart safetynote --update-env
sleep 5 && pm2 logs safetynote --nostream --lines 10
```

### 📁 NAS 필수 폴더 구조

```
/volume1/safetynote/          ← 설치 루트 (INSTALL_DIR)
├── .env                       ← ⚠️ NAS별 고유 설정 (git 제외)
├── safety.db                  ← SQLite DB (또는 DB_PATH 지정 경로)
├── node-server.ts             ← 메인 서버
├── public/uploads/            ← 업로드 파일 루트
│   ├── 2026/07/               ← 연도/월 자동 분류 (UPLOAD_SUBDIR=true)
│   └── apk/                   ← Android APK
├── backups/                   ← 자동 백업 DB
├── scripts/
│   ├── recovery-server.py     ← 비상복구 서버 (포트 3445)
│   ├── pm2-watchdog.sh        ← PM2 자동복구 (DSM 작업 스케줄러)
│   └── nas-deploy.sh          ← 업데이트 스크립트
└── node_modules/
    └── .bin/tsx               ← tsx 실행 파일 (PM2 직접 등록용)
```

---

*SafetyNOTE v1.0 — 현장 안전관리 시스템*  
*최종 점검: 2026-07-22 | 다중 NAS 설치 검증 완료*
