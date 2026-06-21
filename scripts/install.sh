#!/bin/bash
# =============================================================================
# SafetyNOTE NAS 자동 설치 스크립트  v2.0
# =============================================================================
#
# 사용법 (신규 NAS SSH에서 실행):
#   curl -fsSL https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh | bash
#
#   또는 다운로드 후 실행:
#   wget -O install.sh https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh
#   chmod +x install.sh && bash install.sh
#
# 지원 환경:
#   Synology NAS (DSM 7.x) + Node.js v18 패키지
#
# 실행 전 필수 확인:
#   1. DSM 패키지 센터 → "Node.js v18" 설치 완료
#   2. DSM 패키지 센터 → "Git" 또는 "Git Server" 설치 완료
#   3. DSM → 제어판 → 터미널 및 SNMP → SSH 서비스 활성화
#   4. SSH로 관리자(admin) 계정 접속 후 실행
# =============================================================================

set -e

# ─── 색상 정의 ───────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# ─── 설정값 ──────────────────────────────────────────────────────────────────
INSTALL_DIR="/volume1/safetynote"
REPO_URL="https://github.com/gisubhan-droid/safetynote-server.git"
APP_NAME="safetynote"
APP_PORT="3443"

# Synology Node.js v18 패키지 경로 (DSM 패키지 센터로 설치 시)
NODE_BIN_PATH="/volume1/@appstore/Node.js_v18/usr/local/bin"
NODE_EXEC=""   # 아래 detect_node()에서 채워짐
NPM_EXEC=""
TSX_EXEC=""    # npm install 후 채워짐

# ─── 유틸 함수 ───────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()      { echo -e "${GREEN}[ OK ]${NC}  $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()     { echo -e "${RED}[ERR ]${NC}  $1"; exit 1; }
step()    { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ─── 배너 ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   SafetyNOTE NAS 설치 스크립트  v2.0        ║${NC}"
echo -e "${CYAN}║   $(date '+%Y-%m-%d %H:%M:%S')                         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Step 1: Node.js 탐지
# =============================================================================
step "Step 1/8: Node.js 탐지"

detect_node() {
  # 후보 경로 순서대로 확인
  local candidates=(
    "$NODE_BIN_PATH/node"          # Synology 패키지 센터 Node.js v18
    "/usr/local/bin/node"          # 시스템 설치
    "/usr/bin/node"
    "$(command -v node 2>/dev/null || true)"
  )
  for c in "${candidates[@]}"; do
    if [ -x "$c" ]; then
      local ver
      ver=$("$c" --version 2>/dev/null || echo "")
      if [[ "$ver" == v18* ]]; then
        NODE_EXEC="$c"
        NPM_EXEC="$(dirname "$c")/npm"
        ok "Node.js v18 발견: $c  ($ver)"
        # PATH에 추가 (npm, npx 등 같은 폴더에 있음)
        export PATH="$(dirname "$c"):$PATH"
        return 0
      fi
    fi
  done
  return 1
}

if ! detect_node; then
  err "Node.js v18을 찾을 수 없습니다.
  해결 방법:
    1. DSM 패키지 센터 → 'Node.js v18' 검색 → 설치
    2. 설치 완료 후 이 스크립트를 다시 실행하세요."
fi

# =============================================================================
# Step 2: Git 확인
# =============================================================================
step "Step 2/8: Git 확인"

if ! command -v git &>/dev/null; then
  err "Git이 설치되어 있지 않습니다.
  해결 방법:
    1. DSM 패키지 센터 → 'Git Server' 검색 → 설치
    2. 설치 완료 후 이 스크립트를 다시 실행하세요."
fi
GIT_VER=$(git --version)
ok "$GIT_VER"

# =============================================================================
# Step 3: PM2 확인 / 설치
# =============================================================================
step "Step 3/8: PM2 확인 / 설치"

if ! command -v pm2 &>/dev/null; then
  info "PM2 설치 중..."
  "$NPM_EXEC" install -g pm2 2>&1 | tail -3
  # pm2가 Node.js bin 폴더에 설치됨
  if ! command -v pm2 &>/dev/null; then
    PM2_EXEC="$(dirname "$NODE_EXEC")/pm2"
  else
    PM2_EXEC="pm2"
  fi
  ok "PM2 설치 완료"
else
  PM2_EXEC="pm2"
  ok "PM2 이미 설치됨: $(pm2 --version)"
fi

# =============================================================================
# Step 4: 기존 설치 확인 + DB 백업
# =============================================================================
step "Step 4/8: 설치 경로 확인"

if [ -d "$INSTALL_DIR" ]; then
  warn "$INSTALL_DIR 가 이미 존재합니다."
  echo ""
  echo "  선택하세요:"
  echo "    [1] 업데이트 — 코드만 갱신, 기존 데이터 보존 (권장)"
  echo "    [2] 재설치  — 코드 재설치, 기존 데이터 보존"
  echo "    [3] 취소"
  echo ""
  echo -n "  선택 (1/2/3): "
  read -r CHOICE

  case "$CHOICE" in
    1)
      info "업데이트 모드로 진행합니다."
      INSTALL_MODE="update"
      ;;
    2)
      info "재설치 모드로 진행합니다."
      INSTALL_MODE="reinstall"
      # 기존 서버 중지
      $PM2_EXEC stop "$APP_NAME" 2>/dev/null || true
      info "기존 서버 중지 완료"
      ;;
    *)
      info "취소되었습니다."
      exit 0
      ;;
  esac

  # DB 백업 (항상 실행)
  DB_FILE="$INSTALL_DIR/safety.db"
  if [ -f "$DB_FILE" ]; then
    BACKUP_DIR="$INSTALL_DIR/backups"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/safety_$(date +%Y%m%d_%H%M)_before_install.db"
    cp "$DB_FILE" "$BACKUP_FILE"
    ok "기존 DB 백업 완료: $BACKUP_FILE"
  fi
else
  INSTALL_MODE="fresh"
  info "신규 설치를 시작합니다."
fi

# =============================================================================
# Step 5: 코드 다운로드 / 업데이트
# =============================================================================
step "Step 5/8: 코드 다운로드"

if [ "$INSTALL_MODE" = "update" ] && [ -d "$INSTALL_DIR/.git" ]; then
  cd "$INSTALL_DIR"
  git fetch origin main --quiet
  BEFORE=$(git rev-parse --short HEAD)
  git pull origin main --ff-only 2>/dev/null || git reset --hard origin/main
  AFTER=$(git rev-parse --short HEAD)
  if [ "$BEFORE" = "$AFTER" ]; then
    ok "이미 최신 버전입니다 ($AFTER)"
  else
    ok "코드 업데이트 완료: $BEFORE → $AFTER"
  fi
else
  if [ -d "$INSTALL_DIR" ] && [ "$INSTALL_MODE" = "reinstall" ]; then
    # 코드만 재clone (DB/업로드 폴더 제외)
    TEMP_DIR=$(mktemp -d)
    git clone "$REPO_URL" "$TEMP_DIR/src" --depth 1 --quiet
    # 코드 파일만 복사 (data, uploads, backups, .env 제외)
    rsync -a --exclude='safety.db' --exclude='uploads/' \
              --exclude='backups/' --exclude='.env' \
              "$TEMP_DIR/src/" "$INSTALL_DIR/"
    rm -rf "$TEMP_DIR"
    ok "코드 재설치 완료"
  else
    git clone "$REPO_URL" "$INSTALL_DIR" --depth 1 --quiet
    ok "코드 다운로드 완료"
  fi
  cd "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 필수 폴더 생성
mkdir -p "$INSTALL_DIR/backups"
mkdir -p "$INSTALL_DIR/public/uploads"
ok "폴더 구조 확인 완료"

# =============================================================================
# Step 6: npm 패키지 설치
# =============================================================================
step "Step 6/8: npm 패키지 설치"

if [ "$INSTALL_MODE" = "update" ] && [ -d "node_modules" ]; then
  info "node_modules 존재 — 업데이트 확인 중..."
  "$NPM_EXEC" install --quiet 2>&1 | tail -3
else
  info "패키지 설치 중... (3~10분 소요)"
  "$NPM_EXEC" install 2>&1 | tail -5
fi
ok "패키지 설치 완료"

# tsx 경로 확인 (NAS는 npx 없음 → 절대경로 사용 필수)
TSX_EXEC="$INSTALL_DIR/node_modules/.bin/tsx"
if [ ! -x "$TSX_EXEC" ]; then
  err "tsx를 찾을 수 없습니다: $TSX_EXEC
  npm install 이 정상적으로 완료됐는지 확인해주세요."
fi
ok "tsx 확인: $TSX_EXEC"

# =============================================================================
# Step 7: .env 설정 파일 생성
# =============================================================================
step "Step 7/8: 환경설정 파일 생성"

ENV_FILE="$INSTALL_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  ok ".env 파일 이미 존재 — 기존 설정 유지"
else
  # JWT_SECRET 랜덤 32자 생성
  JWT_SECRET_VAL=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1 2>/dev/null \
                   || echo "safetynote_$(date +%s%N | md5sum | head -c 32)")

  cat > "$ENV_FILE" << EOF
# ══════════════════════════════════════════════════════
# SafetyNOTE 환경 설정
# ⚠️ 이 파일을 절대 공유하거나 GitHub에 업로드하지 마세요!
# ══════════════════════════════════════════════════════

# ── 서버 포트 ──────────────────────────────────────────
# ⚠️ NAS 배포 시 반드시 3443 유지 (공유기 포트포워딩 고정)
PORT=${APP_PORT}

# ── 데이터베이스 경로 ──────────────────────────────────
DB_PATH=${INSTALL_DIR}/safety.db

# ── 파일 업로드 경로 ───────────────────────────────────
UPLOAD_PATH=${INSTALL_DIR}/public/uploads

# 연도/월 하위폴더 자동 생성 (true: YYYY/MM/파일명)
UPLOAD_SUBDIR=true

# ── 보안 키 ────────────────────────────────────────────
# ⚠️ 각 NAS마다 반드시 고유한 값으로 설정하세요!
JWT_SECRET=${JWT_SECRET_VAL}

# ── APK 자동 배포 Webhook 시크릿 ──────────────────────
# GitHub Actions 에서 사용하는 값과 동일하게 설정
DEPLOY_WEBHOOK_SECRET=safetynote-nas-$(date +%Y)

# ── 앱 버전 ────────────────────────────────────────────
APP_VERSION=1.4
EOF

  ok ".env 파일 생성 완료"
  warn ".env 파일을 열어 내용을 확인하세요: cat ${ENV_FILE}"
fi

# =============================================================================
# Step 8: PM2 서버 시작
# =============================================================================
step "Step 8/8: PM2 서버 시작"

# 기존 프로세스 정리
$PM2_EXEC delete "$APP_NAME" 2>/dev/null || true
sleep 1

# ⚠️ NAS PM2 시작 핵심 규칙:
#   1. npx 없음  → tsx 절대경로 직접 지정
#   2. NVM 없음  → interpreter 절대경로 필수 (없으면 NVM 탐색하다 hang)
#   3. PORT 인라인 지정 → .env보다 우선 적용
info "PM2 프로세스 등록 중..."
PORT=$APP_PORT $PM2_EXEC start "$TSX_EXEC" \
  --name "$APP_NAME" \
  --interpreter "$NODE_EXEC" \
  -- node-server.ts

sleep 4  # 서버 시작 대기

# PM2 부팅 자동 시작 등록
$PM2_EXEC save --force 2>/dev/null || true

# 서버 응답 확인
SERVER_OK=false
for i in 1 2 3; do
  HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
    "http://localhost:${APP_PORT}/" --max-time 5 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
    SERVER_OK=true
    break
  fi
  info "서버 응답 대기 중... ($i/3)"
  sleep 3
done

if $SERVER_OK; then
  ok "서버 정상 응답 확인 (HTTP ${HTTP_CODE})"
else
  warn "서버 응답 없음 (HTTP ${HTTP_CODE})"
  warn "로그 확인: $PM2_EXEC logs $APP_NAME --nostream --lines 30"
fi

# =============================================================================
# 설치 완료 출력
# =============================================================================
NAS_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' \
         || hostname -i 2>/dev/null | awk '{print $1}' \
         || echo "NAS_IP")

INSTALLED_COMMIT=$(git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo "알 수 없음")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          🎉  SafetyNOTE 설치 완료!                      ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
printf "${GREEN}║${NC}  접속 주소 : http://%-36s${GREEN}║${NC}\n" "${NAS_IP}:${APP_PORT}"
printf "${GREEN}║${NC}  설치 경로 : %-39s${GREEN}║${NC}\n" "${INSTALL_DIR}"
printf "${GREEN}║${NC}  커밋 버전 : %-39s${GREEN}║${NC}\n" "${INSTALLED_COMMIT}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  ✅ 다음 단계                                        ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   1. 위 주소로 브라우저 접속                         ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   2. 초기 관리자 계정으로 로그인                     ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}      ID: admin    PW: admin1234                      ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   3. 시스템설정 → 비밀번호 즉시 변경! ⚠️              ${GREEN}║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  📋 유용한 명령어                                    ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   pm2 status              ← 서버 상태 확인           ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   pm2 logs $APP_NAME  ← 서버 로그 확인           ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   pm2 restart $APP_NAME   ← 서버 재시작              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   cat ${INSTALL_DIR}/.env  ← 설정 확인    ${GREEN}║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  🔄 향후 업데이트 방법                               ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   브라우저: 시스템설정 → 서버 업데이트 탭            ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   수동:     bash ${INSTALL_DIR}/scripts/update.sh    ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
