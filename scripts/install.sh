#!/bin/bash
# =============================================================================
# SafetyNOTE NAS 자동 설치 스크립트
# install.sh v1.0 — Phase 6 배포 패키지용 초안
# =============================================================================
#
# 사용법:
#   curl -sSL https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh | bash
#
#   또는 다운로드 후 실행:
#   wget https://raw.githubusercontent.com/.../install.sh
#   chmod +x install.sh
#   ./install.sh
#
# 지원 환경:
#   - Synology NAS (DSM 7.x)
#   - Node.js v18 (패키지 센터에서 설치 필요)
#
# ⚠️  실행 전 필수 확인:
#   1. DSM 패키지 센터에서 "Node.js v18" 설치 완료
#   2. SSH 서비스 활성화 (DSM → 제어판 → 터미널 및 SNMP)
#   3. 관리자(admin) 계정으로 SSH 접속
# =============================================================================

set -e  # 오류 발생 시 즉시 종료

# ─── 색상 출력 설정 ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # 색상 초기화

# ─── 설정값 (변경 가능) ──────────────────────────────────────────────────────
INSTALL_DIR="/volume1/safetynote"
REPO_URL="https://github.com/gisubhan-droid/safetynote-server.git"
NODE_PATH="/volume1/@appstore/Node.js_v18/usr/local/bin"
APP_NAME="safetynote"
APP_PORT="3443"

# ─── 유틸 함수 ────────────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   SafetyNOTE NAS 설치 스크립트 v1.0   ║"
echo "╚════════════════════════════════════════╝"
echo ""

# ─── Step 1: 환경 확인 ────────────────────────────────────────────────────────
log_info "Step 1: 환경 확인 중..."

# Node.js 경로 확인
if [ -d "$NODE_PATH" ]; then
    export PATH="$NODE_PATH:$PATH"
    log_success "Node.js v18 경로 확인: $NODE_PATH"
else
    log_error "Node.js v18이 설치되어 있지 않습니다.\nDSM 패키지 센터에서 'Node.js v18'을 먼저 설치해주세요."
fi

# Node.js 버전 확인
NODE_VERSION=$(node --version 2>/dev/null || echo "없음")
log_info "Node.js 버전: $NODE_VERSION"

if [[ "$NODE_VERSION" != v18* ]]; then
    log_error "Node.js v18이 필요합니다. 현재 버전: $NODE_VERSION"
fi

# Git 확인
if ! command -v git &> /dev/null; then
    log_error "Git이 설치되어 있지 않습니다.\nDSM 패키지 센터에서 'Git' 또는 'Git Server'를 설치해주세요."
fi

log_success "환경 확인 완료"
echo ""

# ─── Step 2: 설치 경로 확인 ────────────────────────────────────────────────────
log_info "Step 2: 설치 경로 확인 중..."

if [ -d "$INSTALL_DIR" ]; then
    log_warning "$INSTALL_DIR 이미 존재합니다."
    echo -n "  기존 설치를 덮어쓰시겠습니까? (y/N): "
    read -r OVERWRITE
    if [[ "$OVERWRITE" != "y" && "$OVERWRITE" != "Y" ]]; then
        log_info "설치를 취소했습니다."
        exit 0
    fi
    # 기존 서버 중지
    if command -v pm2 &> /dev/null; then
        pm2 stop $APP_NAME 2>/dev/null || true
        log_info "기존 서버 중지 완료"
    fi
    # DB 백업 (기존 설치 존재 시)
    if [ -f "$INSTALL_DIR/data/safety.db" ]; then
        BACKUP_FILE="$INSTALL_DIR/backups/safety_$(date +%Y%m%d_%H%M)_before_reinstall.db"
        mkdir -p "$INSTALL_DIR/backups"
        cp "$INSTALL_DIR/data/safety.db" "$BACKUP_FILE"
        log_success "기존 DB 백업 완료: $BACKUP_FILE"
    fi
fi

log_success "설치 경로 확인 완료"
echo ""

# ─── Step 3: 코드 다운로드 ────────────────────────────────────────────────────
log_info "Step 3: SafetyNOTE 코드 다운로드 중..."

if [ -d "$INSTALL_DIR/.git" ]; then
    # 이미 git 저장소가 있으면 pull
    cd "$INSTALL_DIR"
    git pull origin main
    log_success "코드 업데이트 완료 (git pull)"
else
    # 새로 clone
    git clone "$REPO_URL" "$INSTALL_DIR"
    log_success "코드 다운로드 완료"
fi

cd "$INSTALL_DIR"
echo ""

# ─── Step 4: 디렉토리 구조 생성 ────────────────────────────────────────────────
log_info "Step 4: 필요한 폴더 생성 중..."

mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/uploads"
mkdir -p "$INSTALL_DIR/backups"
mkdir -p "$INSTALL_DIR/logs"

# safety.db 심볼릭 링크 생성
if [ ! -L "$INSTALL_DIR/safety.db" ]; then
    ln -s "$INSTALL_DIR/data/safety.db" "$INSTALL_DIR/safety.db" 2>/dev/null || true
fi

log_success "폴더 구조 생성 완료"
echo ""

# ─── Step 5: npm 패키지 설치 ──────────────────────────────────────────────────
log_info "Step 5: npm 패키지 설치 중... (5~10분 소요될 수 있습니다)"

cd "$INSTALL_DIR"
npm install --production 2>&1 | tail -5

log_success "패키지 설치 완료"
echo ""

# ─── Step 6: 환경설정 파일 생성 ────────────────────────────────────────────────
log_info "Step 6: 환경설정 파일 생성 중..."

if [ -f "$INSTALL_DIR/.env" ]; then
    log_warning ".env 파일이 이미 존재합니다. 기존 설정을 유지합니다."
else
    # JWT_SECRET 랜덤 생성
    JWT_SECRET_VALUE=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1 2>/dev/null || echo "safetynote_$(date +%s)_secret")

    cat > "$INSTALL_DIR/.env" << EOF
# SafetyNOTE 환경 설정
# ⚠️ 이 파일은 절대 공유하거나 GitHub에 올리지 마세요!

PORT=$APP_PORT
DB_PATH=$INSTALL_DIR/data/safety.db
UPLOAD_DIR=$INSTALL_DIR/uploads
LOG_DIR=$INSTALL_DIR/logs

# JWT 보안 키 (각 NAS마다 반드시 고유하게 설정하세요!)
JWT_SECRET=$JWT_SECRET_VALUE

# APK 자동 배포 Webhook 시크릿 (GitHub Actions와 동일하게 설정)
DEPLOY_WEBHOOK_SECRET=safetynote-nas-2026

# 현장 이름 (화면 표시용 — 선택사항)
# SITE_NAME=현장명입력
EOF

    log_success ".env 파일 생성 완료"
    log_warning "⚠️  .env 파일을 열어 JWT_SECRET 및 기타 설정을 확인해주세요!"
fi

echo ""

# ─── Step 7: PM2 설치 및 서버 시작 ────────────────────────────────────────────
log_info "Step 7: PM2 설치 및 서버 시작 중..."

# PM2 전역 설치 확인
if ! command -v pm2 &> /dev/null; then
    log_info "PM2 설치 중..."
    npm install -g pm2
    log_success "PM2 설치 완료"
fi

# ts-node 전역 설치 확인
if ! command -v ts-node &> /dev/null; then
    log_info "ts-node 설치 중..."
    npm install -g ts-node typescript
    log_success "ts-node 설치 완료"
fi

cd "$INSTALL_DIR"

# 기존 PM2 프로세스 정리
pm2 delete $APP_NAME 2>/dev/null || true

# PM2로 서버 시작
pm2 start node-server.ts \
    --name $APP_NAME \
    --interpreter ts-node \
    --log "$INSTALL_DIR/logs/safetynote.log" \
    --time \
    -- node-server.ts

# PM2 자동 시작 등록
pm2 startup 2>/dev/null | grep -v "^\[" | bash 2>/dev/null || true
pm2 save

log_success "서버 시작 완료"
echo ""

# ─── Step 8: 설치 완료 확인 ────────────────────────────────────────────────────
log_info "Step 8: 설치 완료 확인 중..."

sleep 3  # 서버 시작 대기

# 서버 응답 확인
if curl -s "http://localhost:$APP_PORT/api/health" > /dev/null 2>&1; then
    log_success "서버 정상 응답 확인 ✅"
else
    log_warning "서버 응답 없음 — 로그를 확인해주세요: pm2 logs $APP_NAME --lines 20"
fi

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║              🎉 SafetyNOTE 설치 완료!                  ║"
echo "╠════════════════════════════════════════════════════════╣"
printf "║  접속 주소: http://$(hostname -i 2>/dev/null | awk '{print $1}' || echo 'NAS_IP_주소'):$APP_PORT%-20s║\n" ""
printf "║  설치 경로: $INSTALL_DIR%-20s║\n" ""
printf "║  DB 경로: $INSTALL_DIR/data/safety.db%-5s║\n" ""
echo "╠════════════════════════════════════════════════════════╣"
echo "║  다음 단계:                                            ║"
echo "║  1. 브라우저에서 위 주소로 접속                        ║"
echo "║  2. 초기 관리자 계정으로 로그인                        ║"
echo "║     ID: admin  PW: admin1234                           ║"
echo "║  3. 시스템 설정에서 비밀번호 즉시 변경!                ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║  유용한 명령어:                                        ║"
echo "║  pm2 status          ← 서버 상태 확인                  ║"
echo "║  pm2 logs safetynote ← 서버 로그 확인                  ║"
echo "║  pm2 restart safetynote ← 서버 재시작                  ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
