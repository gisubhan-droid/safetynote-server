#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  SafetyNOTE  — 자동 설치 스크립트
#  지원 OS: Ubuntu 20.04/22.04/24.04 · Debian 11/12 · CentOS 8+ · RHEL 8+
# ═══════════════════════════════════════════════════════════════════════
set -e

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()  { echo -e "\n${BOLD}━━━ $* ━━━${NC}"; }

# ─── 루트 권한 확인 ────────────────────────────────────────────────
[ "$(id -u)" -ne 0 ] && error "root 또는 sudo 권한이 필요합니다. 'sudo bash setup.sh' 로 실행하세요."

INSTALL_DIR="${SAFETYNOTE_DIR:-/opt/safetynote}"
APP_USER="${SAFETYNOTE_USER:-safetynote}"
PORT="${PORT:-3000}"

echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       SafetyNOTE 설치 스크립트           ║"
echo "  ║       현장 안전관리 시스템               ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"
info "설치 경로  : $INSTALL_DIR"
info "실행 유저  : $APP_USER"
info "포트       : $PORT"
echo ""

# ─── 1. Node.js 확인 및 설치 ────────────────────────────────────────
step "1. Node.js 확인"
if command -v node &>/dev/null; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -ge 18 ]; then
    info "Node.js $(node -v) 이미 설치됨 ✓"
  else
    warn "Node.js 버전이 낮습니다 ($(node -v)). v20 LTS 설치를 진행합니다."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
  fi
else
  info "Node.js 설치 중 (v20 LTS)..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  else
    error "지원하지 않는 패키지 매니저입니다. Node.js 20을 수동 설치 후 재실행하세요."
  fi
fi
info "Node.js $(node -v) / npm $(npm -v)"

# ─── 2. PM2 설치 ─────────────────────────────────────────────────────
step "2. PM2 설치"
if command -v pm2 &>/dev/null; then
  info "PM2 $(pm2 --version) 이미 설치됨 ✓"
else
  npm install -g pm2
  info "PM2 설치 완료"
fi

# ─── 3. 앱 유저 생성 ─────────────────────────────────────────────────
step "3. 시스템 사용자 생성"
if id "$APP_USER" &>/dev/null; then
  info "사용자 '$APP_USER' 이미 존재 ✓"
else
  useradd -r -m -s /bin/bash "$APP_USER"
  info "사용자 '$APP_USER' 생성 완료"
fi

# ─── 4. 설치 디렉토리 구성 ──────────────────────────────────────────
step "4. 파일 배포"
mkdir -p "$INSTALL_DIR"

# 현재 스크립트 위치의 상위 = 소스 루트
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

info "소스 경로: $SOURCE_DIR → $INSTALL_DIR"
cp -r "$SOURCE_DIR/src"            "$INSTALL_DIR/"
cp -r "$SOURCE_DIR/migrations"     "$INSTALL_DIR/"
cp -r "$SOURCE_DIR/public"         "$INSTALL_DIR/"
cp    "$SOURCE_DIR/node-server.ts" "$INSTALL_DIR/"
cp    "$SOURCE_DIR/package.json"   "$INSTALL_DIR/"
cp    "$SOURCE_DIR/package-lock.json" "$INSTALL_DIR/" 2>/dev/null || true
cp    "$SOURCE_DIR/tsconfig.json"  "$INSTALL_DIR/"
cp    "$SOURCE_DIR/ecosystem.config.cjs" "$INSTALL_DIR/"

mkdir -p "$INSTALL_DIR/public/uploads"
chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"
info "파일 배포 완료"

# ─── 5. npm 의존성 설치 ─────────────────────────────────────────────
step "5. 패키지 설치 (npm install)"
cd "$INSTALL_DIR"
sudo -u "$APP_USER" npm install --omit=dev
info "패키지 설치 완료"

# ─── 6. .env 파일 생성 ──────────────────────────────────────────────
step "6. 환경변수 설정"
ENV_FILE="$INSTALL_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  warn ".env 파일이 이미 존재합니다. 덮어쓰지 않습니다."
else
  DB_PATH="$INSTALL_DIR/safety.db"
  UPLOAD_PATH="$INSTALL_DIR/public/uploads"
  cat > "$ENV_FILE" <<EOF
# SafetyNOTE 환경변수 — $(date +%Y-%m-%d) 자동 생성
PORT=$PORT
DB_PATH=$DB_PATH
UPLOAD_PATH=$UPLOAD_PATH
UPLOAD_SUBDIR=true
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  info ".env 파일 생성: $ENV_FILE"
fi

# ─── 7. DB 초기화 ────────────────────────────────────────────────────
step "7. 데이터베이스 초기화"
DB_PATH=$(grep '^DB_PATH=' "$ENV_FILE" | cut -d= -f2)
[ -z "$DB_PATH" ] && DB_PATH="$INSTALL_DIR/safety.db"

if [ -f "$DB_PATH" ]; then
  warn "DB 파일이 이미 존재합니다: $DB_PATH (초기화 건너뜀)"
else
  info "DB 초기화 중..."
  # Node.js로 SQLite 직접 초기화
  sudo -u "$APP_USER" node - <<'JSEOF'
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const dbPath = (envFile.match(/^DB_PATH=(.+)$/m) || [])[1]?.trim() || path.join(__dirname, 'safety.db');

console.log('[DB] 경로:', dbPath);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrationsDir = path.join(__dirname, 'migrations');
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  try {
    db.exec(sql);
    console.log('[DB] 적용:', file);
  } catch(e) {
    console.warn('[DB] 경고 (무시):', file, e.message);
  }
}
db.close();
console.log('[DB] 초기화 완료');
JSEOF
  chown "$APP_USER:$APP_USER" "$DB_PATH" 2>/dev/null || true
  info "DB 초기화 완료: $DB_PATH"
fi

# ─── 8. ecosystem.config.cjs 포트 적용 ──────────────────────────────
step "8. PM2 설정 적용"
ECOSYSTEM="$INSTALL_DIR/ecosystem.config.cjs"
sed -i "s/PORT: 3000/PORT: $PORT/g" "$ECOSYSTEM"
sed -i "s|cwd: '/home/user/webapp'|cwd: '$INSTALL_DIR'|g" "$ECOSYSTEM"
# 로그 경로 업데이트
LOG_DIR="$INSTALL_DIR/logs"
mkdir -p "$LOG_DIR"
chown "$APP_USER:$APP_USER" "$LOG_DIR"
sed -i "s|error_file: '.*'|error_file: '$LOG_DIR/safetynote-error.log'|g" "$ECOSYSTEM"
sed -i "s|out_file: '.*'|out_file: '$LOG_DIR/safetynote-out.log'|g" "$ECOSYSTEM"
info "PM2 설정 완료"

# ─── 9. PM2 서비스 시작 ─────────────────────────────────────────────
step "9. 서비스 시작"
cd "$INSTALL_DIR"
# 기존 프로세스 정리
sudo -u "$APP_USER" pm2 delete safety-management 2>/dev/null || true
# 서비스 시작
sudo -u "$APP_USER" pm2 start "$ECOSYSTEM"
sudo -u "$APP_USER" pm2 save

# PM2 부팅 자동시작 설정
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" 2>/dev/null || \
  warn "부팅 자동시작 설정에 실패했습니다. 수동으로 'pm2 startup' 을 실행하세요."

sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  info "서비스 정상 기동 확인 ✓ (HTTP $HTTP_CODE)"
else
  warn "HTTP 응답: $HTTP_CODE — 로그를 확인하세요: pm2 logs safety-management --nostream"
fi

# ─── 완료 메시지 ─────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║        SafetyNOTE 설치 완료!                        ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  🌐 접속 URL   : ${BOLD}http://서버IP:$PORT${NC}"
echo -e "  👤 초기 계정  : ${BOLD}ID: admin  /  PW: admin1234${NC}"
echo -e "  ⚠️   최초 로그인 후 즉시 비밀번호를 변경하세요!"
echo ""
echo -e "  📂 설치 경로  : $INSTALL_DIR"
echo -e "  🗄️  DB 경로    : $DB_PATH"
echo -e "  📁 업로드 경로: $(grep '^UPLOAD_PATH=' "$ENV_FILE" | cut -d= -f2)"
echo ""
echo -e "  📋 유용한 명령어:"
echo -e "     pm2 list                    # 서비스 상태 확인"
echo -e "     pm2 logs safety-management  # 로그 확인"
echo -e "     pm2 restart safety-management  # 서비스 재시작"
echo ""
