#!/bin/bash
# =============================================================================
# SafetyNOTE NAS 업데이트 스크립트
# update.sh v1.0 — Phase 5 브라우저 자동화 전까지 수동 업데이트용
# =============================================================================
#
# 사용법:
#   cd /volume1/safetynote
#   bash scripts/update.sh
#
#   특정 버전으로 업데이트:
#   bash scripts/update.sh bcec93b
# =============================================================================

set -e

# ─── 색상 출력 설정 ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC}  $1"; }

INSTALL_DIR="/volume1/safetynote"
APP_NAME="safetynote"
NODE_PATH="/volume1/@appstore/Node.js_v18/usr/local/bin"
TARGET_COMMIT="${1:-}"  # 인수로 특정 커밋 지정 가능

export PATH="$NODE_PATH:$PATH"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   SafetyNOTE NAS 업데이트 스크립트     ║"
echo "╚════════════════════════════════════════╝"
echo ""

cd "$INSTALL_DIR"

# ─── Step 1: 현재 버전 확인 ────────────────────────────────────────────────────
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "알 수 없음")
CURRENT_DATE=$(git log -1 --format="%ci" 2>/dev/null || echo "")
log_info "현재 버전: $CURRENT_COMMIT ($CURRENT_DATE)"

# ─── Step 2: DB 백업 (업데이트 전 필수!) ───────────────────────────────────────
log_info "Step 1: DB 백업 중..."

BACKUP_FILE="$INSTALL_DIR/backups/safety_$(date +%Y%m%d_%H%M)_before_update.db"
mkdir -p "$INSTALL_DIR/backups"

if [ -f "$INSTALL_DIR/data/safety.db" ]; then
    cp "$INSTALL_DIR/data/safety.db" "$BACKUP_FILE"
    log_success "DB 백업 완료: $BACKUP_FILE"
    
    # 30일 이전 자동 업데이트 백업 삭제 (수동 백업은 유지)
    find "$INSTALL_DIR/backups" -name "safety_*_before_update.db" -mtime +30 -delete 2>/dev/null || true
else
    log_warning "safety.db 파일을 찾을 수 없습니다. 건너뜁니다."
fi

# ─── Step 3: 코드 업데이트 ────────────────────────────────────────────────────
log_info "Step 2: 최신 코드 다운로드 중..."

git fetch origin main

if [ -n "$TARGET_COMMIT" ]; then
    # 특정 커밋으로 이동
    git checkout "$TARGET_COMMIT"
    log_success "특정 버전으로 전환: $TARGET_COMMIT"
else
    # 최신으로 업데이트
    LATEST_COMMIT=$(git rev-parse --short origin/main)
    
    if [ "$CURRENT_COMMIT" = "$LATEST_COMMIT" ]; then
        log_success "이미 최신 버전입니다! ($CURRENT_COMMIT)"
        echo ""
        exit 0
    fi
    
    git pull origin main
    NEW_COMMIT=$(git rev-parse --short HEAD)
    log_success "업데이트 완료: $CURRENT_COMMIT → $NEW_COMMIT"
fi

# ─── Step 4: 서버 재시작 ──────────────────────────────────────────────────────
log_info "Step 3: 서버 재시작 중..."

pm2 restart $APP_NAME

sleep 2

# 서버 응답 확인
if curl -s "http://localhost:3443/api/health" > /dev/null 2>&1; then
    log_success "서버 정상 응답 확인 ✅"
else
    log_warning "서버 응답 없음. 로그 확인 중..."
    pm2 logs $APP_NAME --lines 10 --nostream
fi

echo ""
NEW_COMMIT=$(git rev-parse --short HEAD)
NEW_DATE=$(git log -1 --format="%ci")
echo "════════════════════════════════════════"
echo "  ✅ 업데이트 완료!"
echo "  버전: $NEW_COMMIT ($NEW_DATE)"
echo "  백업: $BACKUP_FILE"
echo ""
echo "  ⚠️  문제 발생 시 롤백:"
echo "  bash scripts/rollback.sh prev"
echo "════════════════════════════════════════"
echo ""
