# SafetyNOTE 설치 가이드

> **현장 안전관리 시스템** — 자체 서버(온프레미스) 배포판  
> Node.js + SQLite 기반 / NAS·Linux 서버 설치 가능

---

## 목차
1. [시스템 요구사항](#1-시스템-요구사항)
2. [자동 설치 (권장)](#2-자동-설치-권장)
3. [수동 설치](#3-수동-설치)
4. [환경변수 설정](#4-환경변수-설정)
5. [NAS 연동](#5-nas-연동)
6. [방화벽 설정](#6-방화벽-설정)
7. [HTTPS 설정 (Nginx)](#7-https-설정-nginx)
8. [서비스 관리](#8-서비스-관리)
9. [백업 및 복구](#9-백업-및-복구)
10. [초기 계정 및 사용자 등록](#10-초기-계정-및-사용자-등록)
11. [모바일 앱 설치 (PWA)](#11-모바일-앱-설치-pwa)
12. [문제 해결](#12-문제-해결)

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

## 7. HTTPS 설정 (Nginx)

### Nginx 설치
```bash
sudo apt-get install -y nginx
```

### 설정 파일
```bash
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
```

### SSL 인증서 (Let's Encrypt)
```bash
sudo apt-get install certbot python3-certbot-nginx
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

*SafetyNOTE v1.0 — 현장 안전관리 시스템*
