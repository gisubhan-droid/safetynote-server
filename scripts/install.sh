#!/bin/bash
# =============================================================================
# SafetyNOTE NAS 자동 설치 스크립트  v2.1
# =============================================================================
#
# ─── 다운로드 방법 (두 가지 중 하나 선택) ────────────────────────────────────
#
#  [방법 A] 현재 운영 중인 SafetyNOTE NAS에서 직접 다운로드 (권장):
#   curl -k -O https://NAS_IP:3443/static/install.sh
#   chmod +x install.sh && bash install.sh
#
#  [방법 B] GitHub에서 최신 버전 다운로드:
#   curl -fsSL https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh | bash
#
#   또는 wget 사용:
#   wget -O install.sh https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh
#   chmod +x install.sh && bash install.sh
#
# ─── 실행 전 필수 확인 ────────────────────────────────────────────────────────
#   1. DSM 패키지 센터 → "Node.js v18" 설치 완료
#   2. DSM 패키지 센터 → "Git" 또는 "Git Server" 설치 완료
#   3. DSM → 제어판 → 터미널 및 SNMP → SSH 서비스 활성화
#   4. SSH로 관리자(admin) 계정 접속 후 sudo -i 로 root 전환 후 실행
#
# ─── 지원 환경 ────────────────────────────────────────────────────────────────
#   Synology NAS (DSM 7.x) + Node.js v18 패키지
#
# =============================================================================

set -e
# install.sh 버전: v2.4 (2025-07-31)
# 변경 이력:
#   v2.4 — better-sqlite3 GLIBC 호환 바이너리 자동 교체 + DB 초기화 스크립트 자동 실행 통합
#          (NAS001/NAS002에서 발견된 patchSchema 미동작 문제 예방)

# ─── 색상 정의 ───────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# ─── 볼륨 자동 감지 ──────────────────────────────────────────────────────────
# 환경변수 SAFETYNOTE_VOLUME 으로 직접 지정 가능 (예: SAFETYNOTE_VOLUME=volume2 bash install.sh)
# 미지정 시 volume1 → volume2 → volume3 순서로 존재하는 볼륨 자동 선택
if [ -n "$SAFETYNOTE_VOLUME" ]; then
  VOLUME="$SAFETYNOTE_VOLUME"
else
  VOLUME=""
  for v in volume1 volume2 volume3 volume4; do
    if [ -d "/$v" ]; then
      VOLUME="$v"
      break
    fi
  done
  if [ -z "$VOLUME" ]; then
    VOLUME="volume1"   # fallback
  fi
fi

# ─── 설정값 ──────────────────────────────────────────────────────────────────
INSTALL_DIR="/${VOLUME}/safetynote"
REPO_URL="https://github.com/gisubhan-droid/safetynote-server.git"
APP_NAME="safetynote"
APP_PORT="3443"

# Synology Node.js 패키지 경로 후보 (v18 우선 → v20 → v22 순)
NODE_BIN_PATH="/${VOLUME}/@appstore/Node.js_v18/usr/local/bin"  # 1순위 (기본)
NODE_BIN_PATH_V20="/${VOLUME}/@appstore/Node.js_v20/usr/local/bin"  # 2순위
NODE_BIN_PATH_V22="/${VOLUME}/@appstore/Node.js_v22/usr/local/bin"  # 3순위
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
echo -e "${CYAN}║   SafetyNOTE NAS 설치 스크립트  v2.4        ║${NC}"
echo -e "${CYAN}║   $(date '+%Y-%m-%d %H:%M:%S')                         ║${NC}"
printf  "${CYAN}║   설치 볼륨 : %-30s${CYAN}║${NC}\n" "/${VOLUME}  (자동 감지)"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Step 0: Node.js 버전 사전 안내
# =============================================================================
info "Node.js 탐색 순서: v18 → v20 → v22 → 시스템 node"
info "권장: DSM 패키지 센터 → Node.js v18 (안정적)"
info "설치 단계: 총 11단계 (Step 7·9 서브 포함)"
info "v2.4 신규: better-sqlite3 GLIBC 호환 바이너리 자동 교체 + DB 핵심 테이블 자동 초기화"

# =============================================================================
# Step 1: Node.js 탐지
# =============================================================================
step "Step 1/10: Node.js 탐지"

detect_node() {
  # v18 우선 → v20 → v22 → 시스템 node 순서로 탐색
  local candidates=(
    "$NODE_BIN_PATH/node"
    "$NODE_BIN_PATH_V20/node"
    "$NODE_BIN_PATH_V22/node"
    "/usr/local/bin/node"
    "/usr/bin/node"
    "$(command -v node 2>/dev/null || true)"
  )
  for c in "${candidates[@]}"; do
    if [ -x "$c" ]; then
      local ver
      ver=$("$c" --version 2>/dev/null || echo "")
      # v18, v20, v22 모두 허용 (v18 권장)
      if [[ "$ver" == v18* ]] || [[ "$ver" == v20* ]] || [[ "$ver" == v22* ]]; then
        NODE_EXEC="$c"
        NPM_EXEC="$(dirname "$c")/npm"
        ok "Node.js 발견: $c  ($ver)"
        export PATH="$(dirname "$c"):$PATH"
        return 0
      fi
    fi
  done
  return 1
}

if ! detect_node; then
  err "Node.js v18/v20/v22 를 찾을 수 없습니다.
  해결 방법:
    1. DSM 패키지 센터 → 'Node.js v18' 또는 'Node.js v20' 검색 → 설치
    2. 설치 완료 후 이 스크립트를 다시 실행하세요."
fi

# =============================================================================
# Step 2: Git 확인
# =============================================================================
step "Step 2/10: Git 확인"

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
step "Step 3/10: PM2 확인 / 설치"

if ! command -v pm2 &>/dev/null; then
  info "PM2 설치 중..."
  "$NPM_EXEC" install -g pm2 2>&1 | tail -3
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
step "Step 4/10: 설치 경로 확인"

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
step "Step 5/10: 코드 다운로드"

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
    TEMP_DIR=$(mktemp -d)
    git clone "$REPO_URL" "$TEMP_DIR/src" --depth 1 --quiet
    rsync -a --exclude='safety.db' --exclude='data/' \
              --exclude='uploads/' --exclude='backups/' --exclude='.env' \
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
mkdir -p "$INSTALL_DIR/public/uploads/apk"
ok "폴더 구조 확인 완료"

# =============================================================================
# Step 6: npm 패키지 설치
# =============================================================================
step "Step 6/10: npm 패키지 설치"

if [ "$INSTALL_MODE" = "update" ] && [ -d "node_modules" ]; then
  info "node_modules 존재 — 업데이트 확인 중..."
  "$NPM_EXEC" install --quiet 2>&1 | tail -3
else
  info "패키지 설치 중... (3~10분 소요)"
  "$NPM_EXEC" install 2>&1 | tail -5
fi
ok "패키지 설치 완료"

# tsx 경로 확인 및 자동 복구 (BUG-202 영구 해결)
# start-server.sh가 PM2 래퍼로 tsx를 자동 복구하지만, 초기 설치 시에도 확인
TSX_EXEC="$INSTALL_DIR/node_modules/.bin/tsx"
if [ ! -x "$TSX_EXEC" ]; then
  warn "tsx 심볼릭 링크 없음 — 자동 복구 시도 중..."
  TSX_MJS="$INSTALL_DIR/node_modules/tsx/dist/cli.mjs"
  if [ -f "$TSX_MJS" ]; then
    ln -sf "$TSX_MJS" "$TSX_EXEC" && chmod +x "$TSX_EXEC"
    ok "tsx 심볼릭 링크 수동 생성 완료: $TSX_EXEC"
  else
    info "tsx 패키지 없음 — npm install tsx 실행 중..."
    "$NPM_EXEC" install tsx --save-dev --ignore-scripts 2>&1 | tail -3
    # 설치 후 링크 재확인
    if [ ! -x "$TSX_EXEC" ] && [ -f "$TSX_MJS" ]; then
      ln -sf "$TSX_MJS" "$TSX_EXEC" && chmod +x "$TSX_EXEC"
    fi
    if [ ! -x "$TSX_EXEC" ]; then
      err "tsx 복구 실패. scripts/start-server.sh가 서버 기동 시 자동으로 재시도합니다."
    fi
  fi
fi
ok "tsx 확인: $TSX_EXEC"

# start-server.sh 실행 권한 확인 (PM2 래퍼 — BUG-202 영구 해결)
START_SERVER_SH="$INSTALL_DIR/scripts/start-server.sh"
if [ -f "$START_SERVER_SH" ]; then
  chmod +x "$START_SERVER_SH"
  ok "start-server.sh 실행 권한 설정 완료"
else
  warn "start-server.sh 없음 — PM2 등록 시 tsx 직접 방식으로 폴백"
fi

# =============================================================================
# Step 6b: better-sqlite3 GLIBC 호환 바이너리 교체
# =============================================================================
# 배경: Synology NAS 구형 glibc(2.26~2.28) 환경에서 npm install이 설치하는
#   better-sqlite3 v9.x prebuilt 바이너리는 GLIBC_2.29 심볼을 사용하므로
#   서버 구동 시 "GLIBC_2.29 not found" 오류로 DB 전체 불능 상태가 됩니다.
#   v8.0.0 node-v108 바이너리는 GLIBC_2.14 이하만 사용 → 구형 NAS 완전 호환.
step "Step 7/10: better-sqlite3 GLIBC 호환 바이너리 교체"

SQLITE3_BINARY="$INSTALL_DIR/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
SQLITE3_URL="https://github.com/WiseLibs/better-sqlite3/releases/download/v8.0.0/better-sqlite3-v8.0.0-node-v108-linux-x64.tar.gz"
SQLITE3_TMP_TAR="/tmp/bs3_install_v800.tar.gz"
SQLITE3_TMP_DIR="/tmp/bs3_install_v800_dir"

# NAS glibc 버전 확인
GLIBC_VER=""
if command -v ldd &>/dev/null; then
  GLIBC_VER=$(ldd --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
fi

# glibc 2.29 미만이거나 판별 불가 시 교체 실행
NEEDS_FIX=false
if [ -z "$GLIBC_VER" ]; then
  warn "glibc 버전 판별 불가 — 안전을 위해 호환 바이너리로 교체합니다"
  NEEDS_FIX=true
else
  # 버전 비교: major.minor → major*1000+minor 숫자 비교
  GLIBC_MAJOR=$(echo "$GLIBC_VER" | cut -d. -f1)
  GLIBC_MINOR=$(echo "$GLIBC_VER" | cut -d. -f2)
  GLIBC_NUM=$((GLIBC_MAJOR * 1000 + GLIBC_MINOR))
  if [ "$GLIBC_NUM" -lt 2029 ]; then
    info "glibc ${GLIBC_VER} 감지 (< 2.29) — 호환 바이너리로 교체합니다"
    NEEDS_FIX=true
  else
    ok "glibc ${GLIBC_VER} (≥ 2.29) — 기본 바이너리 사용 가능"
  fi
fi

if $NEEDS_FIX; then
  if [ ! -d "$(dirname "$SQLITE3_BINARY")" ]; then
    warn "better-sqlite3 build 디렉토리 없음 — npm install이 완료됐는지 확인 필요"
  else
    info "v8.0.0 node-v108 바이너리 다운로드 중..."
    if wget -q "$SQLITE3_URL" -O "$SQLITE3_TMP_TAR" 2>/dev/null; then
      rm -rf "$SQLITE3_TMP_DIR"
      mkdir -p "$SQLITE3_TMP_DIR"
      tar -xzf "$SQLITE3_TMP_TAR" -C "$SQLITE3_TMP_DIR"
      if [ -f "${SQLITE3_TMP_DIR}/build/Release/better_sqlite3.node" ]; then
        # 기존 바이너리 백업
        [ -f "$SQLITE3_BINARY" ] && cp "$SQLITE3_BINARY" "${SQLITE3_BINARY}.orig_$(date +%Y%m%d%H%M%S)"
        cp "${SQLITE3_TMP_DIR}/build/Release/better_sqlite3.node" "$SQLITE3_BINARY"
        chmod 755 "$SQLITE3_BINARY"
        ok "better-sqlite3 v8.0.0 바이너리 교체 완료 (GLIBC_2.14 호환)"
      else
        warn "바이너리 추출 실패 — 서버 시작 후 오류 발생 시 scripts/fix-sqlite3-binary.sh 수동 실행 필요"
      fi
      rm -f "$SQLITE3_TMP_TAR"
      rm -rf "$SQLITE3_TMP_DIR"
    else
      warn "바이너리 다운로드 실패 (네트워크 확인 필요)"
      warn "설치 완료 후 수동 실행: bash ${INSTALL_DIR}/scripts/fix-sqlite3-binary.sh"
    fi
  fi
fi

# =============================================================================
# Step 7: .env 설정 파일 생성
# =============================================================================
step "Step 8/10: 환경설정 파일 생성"

ENV_FILE="$INSTALL_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  ok ".env 파일 이미 존재 — 기존 설정 유지"
else
  JWT_SECRET_VAL=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1 2>/dev/null \
                   || echo "safetynote_$(date +%s%N | md5sum | head -c 32)")

  cat > "$ENV_FILE" << EOF
# ══════════════════════════════════════════════════════
# SafetyNOTE 환경 설정
# ⚠️ 이 파일을 절대 공유하거나 GitHub에 업로드하지 마세요!
# ══════════════════════════════════════════════════════

# ── 서버 포트 ──────────────────────────────────────────
PORT=${APP_PORT}

# ── 데이터베이스 경로 ──────────────────────────────────
DB_PATH=${INSTALL_DIR}/safety.db

# ── 파일 업로드 경로 ───────────────────────────────────
UPLOAD_PATH=${INSTALL_DIR}/public/uploads

# 연도/월 하위폴더 자동 생성
UPLOAD_SUBDIR=true

# ── 보안 키 ────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET_VAL}

# ── APK 자동 배포 Webhook 시크릿 ──────────────────────
DEPLOY_WEBHOOK_SECRET=safetynote-nas-$(date +%Y)

# ── 비상 복구 서버 비밀번호 (포트 3445) ────────────────
# 메인 서버 접속 불가 시 http://NAS_IP:3445 에서 사용
# (3444는 Android FCM 전용 포트 — 충돌 방지로 3445 사용)
# ⚠️ 보안을 위해 이 값을 변경하세요!
RECOVERY_PASSWORD=recovery1234

# ── 앱 버전 ────────────────────────────────────────────
APP_VERSION=1.4
EOF

  ok ".env 파일 생성 완료"
  warn ".env 파일을 열어 내용을 확인하세요: cat ${ENV_FILE}"
fi

# =============================================================================
# Step 7b: DB 핵심 테이블 초기화
# =============================================================================
# 배경: node-server.ts의 patchSchema는 기존 테이블을 점진적으로 마이그레이션하는
#   시스템입니다. 초기 설치 시 테이블 자체가 없으면 "no such table: users" 오류로
#   마이그레이션 전체가 실패하고, tasks/constructions 등 핵심 테이블이 생성되지 않아
#   로그인 자체가 불가능한 증상이 발생합니다(NAS001/NAS002에서 재현됨).
# 이 단계는 신규·재설치 시 DB를 미리 초기화하여 위 증상을 원천 차단합니다.
step "Step 9/10: DB 핵심 테이블 초기화"

DB_FILE="$INSTALL_DIR/safety.db"
DB_INIT_SCRIPT="$INSTALL_DIR/scripts/db-init.cjs"

# 신규/재설치 시 or DB 파일이 없을 때 초기화 실행
# 업데이트 모드에서도 DB 파일이 없으면 초기화 (비어있는 DB 방지)
RUN_DB_INIT=false
if [ "$INSTALL_MODE" = "fresh" ]; then
  info "신규 설치 — DB 초기화 실행"
  RUN_DB_INIT=true
elif [ "$INSTALL_MODE" = "reinstall" ]; then
  info "재설치 모드 — DB 초기화 실행"
  RUN_DB_INIT=true
elif [ ! -f "$DB_FILE" ]; then
  info "DB 파일 없음 — DB 초기화 실행 (업데이트 모드이나 DB 부재)"
  RUN_DB_INIT=true
else
  ok "업데이트 모드 + 기존 DB 존재 — DB 초기화 건너뜀 (기존 데이터 보존)"
fi

if $RUN_DB_INIT; then
  info "DB 초기화 스크립트 생성 중..."

  # ── 인라인으로 db-init.cjs 생성 (ES Module 충돌 방지용 .cjs) ────────────────
  cat > "$DB_INIT_SCRIPT" << 'DBINIT_EOF'
'use strict';
/**
 * SafetyNOTE DB 핵심 테이블 초기화 스크립트
 * 생성: install.sh v2.4 (2025-07-31)
 * 목적: patchSchema v0.154+ 정상 동작을 위한 전체 스키마 사전 생성
 *       기존 테이블은 IF NOT EXISTS + ALTER로 보존됨
 */

const path = require('path');
const INSTALL_DIR = path.resolve(__dirname, '..');
const Database = require(path.join(INSTALL_DIR, 'node_modules', 'better-sqlite3'));
const DB_PATH   = process.env.DB_PATH || path.join(INSTALL_DIR, 'safety.db');

console.log('='.repeat(60));
console.log('[SafetyNOTE] DB 핵심 테이블 초기화');
console.log('DB 경로:', DB_PATH);
console.log('='.repeat(60));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');
db.pragma('synchronous = NORMAL');

// ── 헬퍼 ──────────────────────────────────────────────────────
function hasColumn(table, col) {
  try {
    return db.prepare('PRAGMA table_info(' + table + ')').all().map(function(r){ return r.name; }).includes(col);
  } catch(_) { return false; }
}
function safeAlter(sql, label) {
  try {
    db.exec(sql);
    console.log('  ✅ ' + label);
  } catch(e) {
    if (e.message && e.message.includes('duplicate column')) {
      console.log('  ⏩ ' + label + ' (이미 존재)');
    } else {
      console.log('  ⚠️  ' + label + ' 실패(무시): ' + e.message);
    }
  }
}

var existingTables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).all().map(function(r){ return r.name; });
console.log('[현재 테이블] ' + (existingTables.join(', ') || '(없음)'));

// ── Step 1: teams (users FK 선행) ─────────────────────────────
console.log('\n[1] teams...');
db.exec([
  'CREATE TABLE IF NOT EXISTS teams (',
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
  '  name TEXT NOT NULL UNIQUE,',
  '  description TEXT DEFAULT \'\',',
  '  is_active INTEGER DEFAULT 1,',
  '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
  '  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP',
  ')'
].join('\n'));
console.log('  ✅ teams');

// ── Step 2: users (patchSchema v0.154 최종 스키마) ────────────
console.log('\n[2] users...');
if (!existingTables.includes('users')) {
  db.exec([
    'CREATE TABLE users (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    '  username TEXT UNIQUE NOT NULL,',
    '  password_hash TEXT NOT NULL,',
    '  name TEXT NOT NULL,',
    '  role TEXT NOT NULL CHECK(role IN (\'admin\',\'supervisor\',\'worker\',\'lgu\',\'lgu_plus\')),',
    '  department TEXT,',
    '  phone TEXT,',
    '  position TEXT,',
    '  is_active INTEGER NOT NULL DEFAULT 1,',
    '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
    '  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
    '  company TEXT,',
    '  blood_type TEXT,',
    '  emergency_contact TEXT,',
    '  health_info TEXT,',
    '  edu_hire_date TEXT,',
    '  edu_special_electric TEXT,',
    '  edu_special_confined TEXT,',
    '  edu_special_loading TEXT,',
    '  edu_experience_date TEXT,',
    '  team_id INTEGER REFERENCES teams(id),',
    '  is_leader INTEGER DEFAULT 0,',
    '  is_pending INTEGER DEFAULT 0,',
    '  rejection_reason TEXT DEFAULT NULL,',
    '  approved_by INTEGER DEFAULT NULL,',
    '  approved_at DATETIME DEFAULT NULL,',
    '  id_number TEXT,',
    '  privacy_agreed INTEGER DEFAULT 0,',
    '  privacy_agreed_at DATETIME,',
    '  security_agreed INTEGER DEFAULT 0,',
    '  security_agreed_at DATETIME,',
    '  location_agreed INTEGER DEFAULT 0,',
    '  location_agreed_at DATETIME,',
    '  sub_role TEXT NOT NULL DEFAULT \'\',',
    '  grade TEXT DEFAULT \'\',',
    '  edu_periodic_date DATE,',
    '  edu_job_change_date DATE,',
    '  edu_special_date DATE,',
    '  edu_supervisor_date DATE,',
    '  edu_special_records TEXT DEFAULT \'{}\',',
    '  fcm_token TEXT DEFAULT NULL,',
    '  permissions TEXT DEFAULT NULL',
    ')'
  ].join('\n'));
  // admin 계정 삽입
  db.prepare(
    'INSERT OR IGNORE INTO users (username,password_hash,name,role,department,position,is_active,sub_role)' +
    ' VALUES (?,?,?,?,?,?,?,?)'
  ).run('admin','admin1234','시스템관리자','admin','관리부','시스템관리자',1,'');
  console.log('  ✅ users 생성 + admin 삽입');
} else {
  console.log('  ⏩ users 이미 존재 — 누락 컬럼만 보완');
  var userAlters = [
    ['company',             'ALTER TABLE users ADD COLUMN company TEXT'],
    ['blood_type',          'ALTER TABLE users ADD COLUMN blood_type TEXT'],
    ['emergency_contact',   'ALTER TABLE users ADD COLUMN emergency_contact TEXT'],
    ['health_info',         'ALTER TABLE users ADD COLUMN health_info TEXT'],
    ['edu_hire_date',       'ALTER TABLE users ADD COLUMN edu_hire_date TEXT'],
    ['edu_special_electric','ALTER TABLE users ADD COLUMN edu_special_electric TEXT'],
    ['edu_special_confined','ALTER TABLE users ADD COLUMN edu_special_confined TEXT'],
    ['edu_special_loading', 'ALTER TABLE users ADD COLUMN edu_special_loading TEXT'],
    ['edu_experience_date', 'ALTER TABLE users ADD COLUMN edu_experience_date TEXT'],
    ['team_id',             'ALTER TABLE users ADD COLUMN team_id INTEGER'],
    ['is_leader',           'ALTER TABLE users ADD COLUMN is_leader INTEGER DEFAULT 0'],
    ['is_pending',          'ALTER TABLE users ADD COLUMN is_pending INTEGER DEFAULT 0'],
    ['rejection_reason',    'ALTER TABLE users ADD COLUMN rejection_reason TEXT DEFAULT NULL'],
    ['approved_by',         'ALTER TABLE users ADD COLUMN approved_by INTEGER DEFAULT NULL'],
    ['approved_at',         'ALTER TABLE users ADD COLUMN approved_at DATETIME DEFAULT NULL'],
    ['id_number',           'ALTER TABLE users ADD COLUMN id_number TEXT'],
    ['privacy_agreed',      'ALTER TABLE users ADD COLUMN privacy_agreed INTEGER DEFAULT 0'],
    ['privacy_agreed_at',   'ALTER TABLE users ADD COLUMN privacy_agreed_at DATETIME'],
    ['security_agreed',     'ALTER TABLE users ADD COLUMN security_agreed INTEGER DEFAULT 0'],
    ['security_agreed_at',  'ALTER TABLE users ADD COLUMN security_agreed_at DATETIME'],
    ['location_agreed',     'ALTER TABLE users ADD COLUMN location_agreed INTEGER DEFAULT 0'],
    ['location_agreed_at',  'ALTER TABLE users ADD COLUMN location_agreed_at DATETIME'],
    ['sub_role',            "ALTER TABLE users ADD COLUMN sub_role TEXT NOT NULL DEFAULT ''"],
    ['grade',               "ALTER TABLE users ADD COLUMN grade TEXT DEFAULT ''"],
    ['edu_periodic_date',   'ALTER TABLE users ADD COLUMN edu_periodic_date DATE'],
    ['edu_job_change_date', 'ALTER TABLE users ADD COLUMN edu_job_change_date DATE'],
    ['edu_special_date',    'ALTER TABLE users ADD COLUMN edu_special_date DATE'],
    ['edu_supervisor_date', 'ALTER TABLE users ADD COLUMN edu_supervisor_date DATE'],
    ['edu_special_records', "ALTER TABLE users ADD COLUMN edu_special_records TEXT DEFAULT '{}'"],
    ['fcm_token',           'ALTER TABLE users ADD COLUMN fcm_token TEXT DEFAULT NULL'],
    ['permissions',         'ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL'],
  ];
  for (var i = 0; i < userAlters.length; i++) {
    if (!hasColumn('users', userAlters[i][0])) safeAlter(userAlters[i][1], 'users.' + userAlters[i][0]);
  }
}

// ── Step 3: work_categories / work_types ──────────────────────
console.log('\n[3] work_categories, work_types...');
db.exec('CREATE TABLE IF NOT EXISTS work_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS work_types (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (category_id) REFERENCES work_categories(id))');
console.log('  ✅ work_categories, work_types');

// ── Step 4: tasks (urgent CHECK 포함) ─────────────────────────
console.log('\n[4] tasks...');
if (!existingTables.includes('tasks')) {
  db.exec([
    'CREATE TABLE tasks (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    '  task_number TEXT UNIQUE NOT NULL,',
    '  title TEXT NOT NULL,',
    '  description TEXT,',
    '  category_id INTEGER,',
    '  work_type_id INTEGER,',
    '  location TEXT,',
    '  planned_date DATE,',
    '  planned_quantity REAL,',
    '  quantity_unit TEXT DEFAULT \'개\',',
    '  supervisor_id INTEGER,',
    '  status TEXT NOT NULL DEFAULT \'unassigned\'',
    '    CHECK(status IN (\'unassigned\',\'assigned\',\'in_progress\',\'tbm_done\',\'working\',\'completed\',\'cancelled\',\'work_completed\')),',
    '  priority TEXT DEFAULT \'normal\' CHECK(priority IN (\'low\',\'normal\',\'high\',\'urgent\')),',
    '  notes TEXT,',
    '  created_by INTEGER,',
    '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
    '  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
    '  work_class TEXT DEFAULT \'line\' CHECK(work_class IN (\'line\',\'equipment\',\'pipe\',\'bucket\',\'pole\',\'rooftop\',\'ladder\',\'heavy\',\'all\')),',
    '  started_at DATETIME,',
    '  completed_at DATETIME,',
    '  tbm_done_at DATETIME,',
    '  construction_type TEXT DEFAULT \'\',',
    '  request_no TEXT DEFAULT \'\',',
    '  contractor_name TEXT DEFAULT \'\',',
    '  risk_level TEXT DEFAULT \'low\' CHECK(risk_level IN (\'low\',\'medium\',\'high\',\'urgent\')),',
    '  lgu_supervisor TEXT DEFAULT \'\',',
    '  work_number TEXT DEFAULT \'\',',
    '  work_completed_at DATETIME,',
    '  confirmed_address TEXT DEFAULT \'\',',
    '  construction_id INTEGER REFERENCES constructions(id),',
    '  sub_task_number TEXT DEFAULT \'\',',
    '  gps_lat REAL, gps_lng REAL, gps_accuracy REAL, gps_captured_at DATETIME,',
    '  start_gps_lat REAL, start_gps_lng REAL, start_gps_accuracy REAL, start_gps_captured_at DATETIME,',
    '  work_sub_class TEXT DEFAULT \'\',',
    '  FOREIGN KEY (category_id) REFERENCES work_categories(id),',
    '  FOREIGN KEY (work_type_id) REFERENCES work_types(id),',
    '  FOREIGN KEY (supervisor_id) REFERENCES users(id),',
    '  FOREIGN KEY (created_by) REFERENCES users(id)',
    ')'
  ].join('\n'));
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_supervisor ON tasks(supervisor_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_planned_date ON tasks(planned_date)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_construction_id ON tasks(construction_id)');
  console.log('  ✅ tasks 생성 (risk_level urgent 포함)');
} else {
  console.log('  ⏩ tasks 이미 존재 — 컬럼 보완 + risk_level CHECK 확인');
  var taskAlters = [
    ['work_class',        "ALTER TABLE tasks ADD COLUMN work_class TEXT DEFAULT 'line'"],
    ['construction_type', "ALTER TABLE tasks ADD COLUMN construction_type TEXT DEFAULT ''"],
    ['request_no',        "ALTER TABLE tasks ADD COLUMN request_no TEXT DEFAULT ''"],
    ['contractor_name',   "ALTER TABLE tasks ADD COLUMN contractor_name TEXT DEFAULT ''"],
    ['risk_level',        "ALTER TABLE tasks ADD COLUMN risk_level TEXT DEFAULT 'low'"],
    ['lgu_supervisor',    "ALTER TABLE tasks ADD COLUMN lgu_supervisor TEXT DEFAULT ''"],
    ['work_number',       "ALTER TABLE tasks ADD COLUMN work_number TEXT DEFAULT ''"],
    ['confirmed_address', "ALTER TABLE tasks ADD COLUMN confirmed_address TEXT DEFAULT ''"],
    ['construction_id',   'ALTER TABLE tasks ADD COLUMN construction_id INTEGER'],
    ['sub_task_number',   "ALTER TABLE tasks ADD COLUMN sub_task_number TEXT DEFAULT ''"],
    ['gps_lat',           'ALTER TABLE tasks ADD COLUMN gps_lat REAL'],
    ['gps_lng',           'ALTER TABLE tasks ADD COLUMN gps_lng REAL'],
    ['gps_accuracy',      'ALTER TABLE tasks ADD COLUMN gps_accuracy REAL'],
    ['gps_captured_at',   'ALTER TABLE tasks ADD COLUMN gps_captured_at DATETIME'],
    ['work_sub_class',    "ALTER TABLE tasks ADD COLUMN work_sub_class TEXT DEFAULT ''"],
  ];
  for (var j = 0; j < taskAlters.length; j++) {
    if (!hasColumn('tasks', taskAlters[j][0])) safeAlter(taskAlters[j][1], 'tasks.' + taskAlters[j][0]);
  }
  // risk_level CHECK에 urgent 없으면 테이블 재생성
  var tRow = db.prepare("SELECT sql FROM sqlite_master WHERE name='tasks'").get();
  if (tRow && tRow.sql && tRow.sql.indexOf("'urgent'") === -1) {
    console.log('  ⚠️  tasks.risk_level CHECK에 urgent 없음 → 재생성');
    try {
      db.exec('ALTER TABLE tasks RENAME TO tasks_bak_install');
      var newSql = tRow.sql.replace(
        "CHECK(risk_level IN ('low','medium','high'))",
        "CHECK(risk_level IN ('low','medium','high','urgent'))"
      );
      db.exec(newSql);
      db.exec('INSERT INTO tasks SELECT * FROM tasks_bak_install');
      db.exec('DROP TABLE tasks_bak_install');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_supervisor ON tasks(supervisor_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_planned_date ON tasks(planned_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_construction_id ON tasks(construction_id)');
      console.log('  ✅ tasks.risk_level urgent 추가 완료');
    } catch(e) {
      console.log('  ⚠️  재생성 실패(무시): ' + e.message);
      try { db.exec('ALTER TABLE tasks_bak_install RENAME TO tasks'); } catch(_) {}
    }
  } else {
    console.log('  ✅ tasks.risk_level urgent 이미 포함');
  }
}

// ── Step 5: task_assignments ───────────────────────────────────
console.log('\n[5] task_assignments...');
db.exec('CREATE TABLE IF NOT EXISTS task_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, worker_id INTEGER NOT NULL, assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP, assigned_by INTEGER, FOREIGN KEY (task_id) REFERENCES tasks(id), FOREIGN KEY (worker_id) REFERENCES users(id), FOREIGN KEY (assigned_by) REFERENCES users(id), UNIQUE(task_id, worker_id))');
db.exec('CREATE INDEX IF NOT EXISTS idx_task_assignments_worker ON task_assignments(worker_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id)');
console.log('  ✅ task_assignments');

// ── Step 6: task_work_types ────────────────────────────────────
console.log('\n[6] task_work_types...');
db.exec('CREATE TABLE IF NOT EXISTS task_work_types (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, work_type_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE, FOREIGN KEY (work_type_id) REFERENCES work_types(id), UNIQUE(task_id, work_type_id))');
db.exec('CREATE INDEX IF NOT EXISTS idx_task_work_types_task ON task_work_types(task_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_task_work_types_type ON task_work_types(work_type_id)');
console.log('  ✅ task_work_types');

// ── Step 7: task_attachments ───────────────────────────────────
console.log('\n[7] task_attachments...');
db.exec('CREATE TABLE IF NOT EXISTS task_attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, uploader_id INTEGER NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL, file_size INTEGER DEFAULT 0, mime_type TEXT DEFAULT \'application/octet-stream\', attach_type TEXT DEFAULT \'order\', description TEXT DEFAULT \'\', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (task_id) REFERENCES tasks(id), FOREIGN KEY (uploader_id) REFERENCES users(id))');
db.exec('CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id)');
console.log('  ✅ task_attachments');

// ── Step 8: constructions ──────────────────────────────────────
console.log('\n[8] constructions...');
if (!existingTables.includes('constructions')) {
  db.exec([
    'CREATE TABLE constructions (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    '  request_no TEXT UNIQUE NOT NULL,',
    '  work_number TEXT NOT NULL DEFAULT \'\',',
    '  title TEXT NOT NULL,',
    '  work_order_address TEXT DEFAULT \'\',',
    '  manager_id INTEGER,',
    '  manager_name TEXT DEFAULT \'\',',
    '  supervisor_name TEXT DEFAULT \'\',',
    '  description TEXT DEFAULT \'\',',
    '  status TEXT NOT NULL DEFAULT \'registered\'',
    '    CHECK(status IN (\'registered\',\'in_progress\',\'completed\',\'settled\')),',
    '  work_class TEXT DEFAULT \'\',',
    '  settlement_requested INTEGER DEFAULT 0,',
    '  settlement_requested_at DATETIME,',
    '  completion_date DATE,',
    '  notification_date DATE,',
    '  notification_amount REAL DEFAULT 0,',
    '  con_number TEXT DEFAULT \'\',',
    '  created_by INTEGER,',
    '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
    '  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
    '  FOREIGN KEY (manager_id) REFERENCES users(id),',
    '  FOREIGN KEY (created_by) REFERENCES users(id)',
    ')'
  ].join('\n'));
  db.exec('CREATE INDEX IF NOT EXISTS idx_constructions_request_no ON constructions(request_no)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_constructions_status ON constructions(status)');
  console.log('  ✅ constructions 생성');
} else {
  console.log('  ⏩ constructions 이미 존재 — 컬럼 보완');
  var conAlters = [
    ['work_class',              "ALTER TABLE constructions ADD COLUMN work_class TEXT DEFAULT ''"],
    ['settlement_requested',    'ALTER TABLE constructions ADD COLUMN settlement_requested INTEGER DEFAULT 0'],
    ['settlement_requested_at', 'ALTER TABLE constructions ADD COLUMN settlement_requested_at DATETIME'],
    ['completion_date',         'ALTER TABLE constructions ADD COLUMN completion_date DATE'],
    ['notification_date',       'ALTER TABLE constructions ADD COLUMN notification_date DATE'],
    ['notification_amount',     'ALTER TABLE constructions ADD COLUMN notification_amount REAL DEFAULT 0'],
    ['con_number',              "ALTER TABLE constructions ADD COLUMN con_number TEXT DEFAULT ''"],
  ];
  for (var k = 0; k < conAlters.length; k++) {
    if (!hasColumn('constructions', conAlters[k][0])) safeAlter(conAlters[k][1], 'constructions.' + conAlters[k][0]);
  }
}

// ── Step 9: checklist_items ────────────────────────────────────
console.log('\n[9] checklist_items...');
db.exec("CREATE TABLE IF NOT EXISTS checklist_items (id INTEGER PRIMARY KEY AUTOINCREMENT, work_class TEXT NOT NULL DEFAULT 'all', category TEXT NOT NULL, question TEXT NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
console.log('  ✅ checklist_items');

// ── Step 10: 기타 핵심 테이블 ─────────────────────────────────
console.log('\n[10] 기타 핵심 테이블...');

db.exec('CREATE TABLE IF NOT EXISTS risk_assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, assessor_id INTEGER NOT NULL, assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP, weather TEXT, temperature TEXT, workers_count INTEGER DEFAULT 1, notes TEXT, status TEXT DEFAULT \'draft\' CHECK(status IN (\'draft\',\'completed\',\'approved\',\'submitted\')), kakao_shared INTEGER DEFAULT 0, kakao_shared_at DATETIME, type TEXT DEFAULT \'checklist\', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (task_id) REFERENCES tasks(id), FOREIGN KEY (assessor_id) REFERENCES users(id))');
db.exec('CREATE INDEX IF NOT EXISTS idx_risk_assessments_task ON risk_assessments(task_id)');

db.exec('CREATE TABLE IF NOT EXISTS tbm_records (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, conductor_id INTEGER NOT NULL, tbm_date DATETIME DEFAULT CURRENT_TIMESTAMP, location TEXT, weather TEXT, temperature TEXT, workers_count INTEGER DEFAULT 1, attendees TEXT, safety_topics TEXT, precautions TEXT, special_notes TEXT, signature_data TEXT, kakao_shared INTEGER DEFAULT 0, kakao_shared_at DATETIME, status TEXT DEFAULT \'draft\' CHECK(status IN (\'draft\',\'completed\')), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (task_id) REFERENCES tasks(id), FOREIGN KEY (conductor_id) REFERENCES users(id))');
db.exec('CREATE INDEX IF NOT EXISTS idx_tbm_records_task ON tbm_records(task_id)');

db.exec("CREATE TABLE IF NOT EXISTS work_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, worker_id INTEGER NOT NULL, log_date DATE NOT NULL, start_time TIME, end_time TIME, actual_quantity REAL DEFAULT 0, quantity_unit TEXT DEFAULT '개', work_description TEXT, issues TEXT, tomorrow_plan TEXT, status TEXT DEFAULT 'working' CHECK(status IN ('working','completed','paused')), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (task_id) REFERENCES tasks(id), FOREIGN KEY (worker_id) REFERENCES users(id))");
db.exec('CREATE INDEX IF NOT EXISTS idx_work_logs_task ON work_logs(task_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_work_logs_worker ON work_logs(worker_id)');

db.exec("CREATE TABLE IF NOT EXISTS task_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, uploader_id INTEGER NOT NULL, photo_type TEXT DEFAULT 'progress' CHECK(photo_type IN ('before','progress','after','hazard','tbm','completion')), file_name TEXT NOT NULL, file_path TEXT, file_size INTEGER, mime_type TEXT DEFAULT 'image/jpeg', caption TEXT, stage TEXT DEFAULT '03', taken_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (task_id) REFERENCES tasks(id), FOREIGN KEY (uploader_id) REFERENCES users(id))");
db.exec('CREATE INDEX IF NOT EXISTS idx_task_photos_task ON task_photos(task_id)');

// site_inspections (0006/0007 컬럼 포함)
db.exec("CREATE TABLE IF NOT EXISTS site_inspections (id INTEGER PRIMARY KEY AUTOINCREMENT, inspector_id INTEGER NOT NULL, inspection_date DATETIME DEFAULT CURRENT_TIMESTAMP, location TEXT NOT NULL, inspection_type TEXT DEFAULT 'routine' CHECK(inspection_type IN ('routine','special','safety')), findings TEXT, corrective_actions TEXT, hazard_level TEXT DEFAULT 'low' CHECK(hazard_level IN ('low','medium','high','critical')), status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')), due_date DATE, closed_at DATETIME, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, task_id INTEGER REFERENCES tasks(id), inspection_date_only TEXT, inspection_result TEXT NOT NULL DEFAULT 'none', result_reason TEXT NOT NULL DEFAULT '', updated_at DATETIME, FOREIGN KEY (inspector_id) REFERENCES users(id))");
db.exec('CREATE INDEX IF NOT EXISTS idx_site_inspections_task_id ON site_inspections(task_id)');
// site_inspections 누락 컬럼 보완
['task_id','inspection_date_only','inspection_result','result_reason','updated_at'].forEach(function(col) {
  var sql = col === 'task_id'
    ? 'ALTER TABLE site_inspections ADD COLUMN task_id INTEGER'
    : col === 'inspection_date_only'
      ? 'ALTER TABLE site_inspections ADD COLUMN inspection_date_only TEXT'
      : col === 'inspection_result'
        ? "ALTER TABLE site_inspections ADD COLUMN inspection_result TEXT NOT NULL DEFAULT 'none'"
        : col === 'result_reason'
          ? "ALTER TABLE site_inspections ADD COLUMN result_reason TEXT NOT NULL DEFAULT ''"
          : 'ALTER TABLE site_inspections ADD COLUMN updated_at DATETIME';
  safeAlter(sql, 'site_inspections.' + col);
});

db.exec("CREATE TABLE IF NOT EXISTS inspection_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, inspection_id INTEGER NOT NULL, file_name TEXT NOT NULL, file_path TEXT, file_size INTEGER, mime_type TEXT DEFAULT 'image/jpeg', caption TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (inspection_id) REFERENCES site_inspections(id))");

db.exec("CREATE TABLE IF NOT EXISTS hazard_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL, task_id INTEGER, report_date DATETIME DEFAULT CURRENT_TIMESTAMP, location TEXT NOT NULL, hazard_type TEXT NOT NULL, hazard_description TEXT NOT NULL, risk_level TEXT DEFAULT 'medium' CHECK(risk_level IN ('low','medium','high','critical')), immediate_action TEXT, suggestion TEXT DEFAULT '', photo_data TEXT, status TEXT DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved')), report_type TEXT DEFAULT 'hazard' CHECK(report_type IN ('hazard','near_miss','improvement')), resolved_by INTEGER, resolved_at DATETIME, resolution_notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (reporter_id) REFERENCES users(id), FOREIGN KEY (task_id) REFERENCES tasks(id), FOREIGN KEY (resolved_by) REFERENCES users(id))");
db.exec('CREATE INDEX IF NOT EXISTS idx_hazard_reports_status ON hazard_reports(status)');

console.log('  ✅ 기타 핵심 테이블');

// ── Step 11: checklist 관련 ────────────────────────────────────
console.log('\n[11] 체크리스트 관련...');
db.exec("CREATE TABLE IF NOT EXISTS checklist_assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, work_class TEXT NOT NULL, assessor_id INTEGER NOT NULL, assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'draft' CHECK(status IN ('draft','completed')), kakao_shared INTEGER DEFAULT 0, notes TEXT, FOREIGN KEY (task_id) REFERENCES tasks(id), FOREIGN KEY (assessor_id) REFERENCES users(id))");
db.exec("CREATE TABLE IF NOT EXISTS checklist_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER NOT NULL, item_id INTEGER NOT NULL, response TEXT DEFAULT NULL CHECK(response IS NULL OR response IN ('na','ok','nok')), memo TEXT, FOREIGN KEY (assessment_id) REFERENCES checklist_assessments(id) ON DELETE CASCADE, FOREIGN KEY (item_id) REFERENCES checklist_items(id), UNIQUE(assessment_id, item_id))");
db.exec("CREATE TABLE IF NOT EXISTS tbm_photo_sections (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER NOT NULL, section_type TEXT NOT NULL, section_name TEXT NOT NULL, is_required INTEGER DEFAULT 1, FOREIGN KEY (assessment_id) REFERENCES checklist_assessments(id) ON DELETE CASCADE)");
db.exec("CREATE TABLE IF NOT EXISTS tbm_photo_items (id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL, label TEXT NOT NULL, file_path TEXT, file_name TEXT, mime_type TEXT, uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (section_id) REFERENCES tbm_photo_sections(id) ON DELETE CASCADE)");
console.log('  ✅ 체크리스트');

// ── Step 12: system_settings ───────────────────────────────────
console.log('\n[12] system_settings...');
db.exec("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', label TEXT, description TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
var ins = db.prepare("INSERT OR IGNORE INTO system_settings (key,value,label,description) VALUES (?,?,?,?)");
ins.run('upload_root_path','','파일 저장 루트 경로','NAS 또는 로컬 경로');
ins.run('use_task_folder','true','작업별 폴더 구조 사용','');
ins.run('task_photo_subdir','작업사진','작업 사진 하위폴더명','');
ins.run('inspection_subdir','안전점검','점검 사진 하위폴더명','');
console.log('  ✅ system_settings');

// ── Step 13: periodic_risk_assessments ────────────────────────
console.log('\n[13] periodic_risk_assessments...');
db.exec("CREATE TABLE IF NOT EXISTS periodic_risk_assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL DEFAULT 'periodic' CHECK(type IN ('periodic','special')), title TEXT NOT NULL, work_type TEXT, location TEXT, assessor_id INTEGER NOT NULL, assessed_date DATE NOT NULL, status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved')), notes TEXT, kakao_shared INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (assessor_id) REFERENCES users(id))");
db.exec("CREATE TABLE IF NOT EXISTS periodic_risk_details (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER NOT NULL, hazard_category TEXT NOT NULL, hazard_factor TEXT NOT NULL, risk_before INTEGER DEFAULT 1, risk_after INTEGER DEFAULT 1, control_measures TEXT, responsible TEXT, due_date DATE, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','done')), FOREIGN KEY (assessment_id) REFERENCES periodic_risk_assessments(id) ON DELETE CASCADE)");
console.log('  ✅ periodic_risk_assessments');

// ── Step 14: risk_assessment_signatures ───────────────────────
console.log('\n[14] risk_assessment_signatures...');
db.exec("CREATE TABLE IF NOT EXISTS risk_assessment_signatures (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), user_name TEXT NOT NULL, position TEXT DEFAULT '', role TEXT DEFAULT 'member', signed_at DATETIME DEFAULT CURRENT_TIMESTAMP, sign_method TEXT DEFAULT 'account', sign_data TEXT, UNIQUE(assessment_id, user_id))");
db.exec('CREATE INDEX IF NOT EXISTS idx_ra_sigs_assessment ON risk_assessment_signatures(assessment_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_ra_sigs_user ON risk_assessment_signatures(user_id)');
console.log('  ✅ risk_assessment_signatures');

// ── Step 15: 보조 테이블들 ────────────────────────────────────
console.log('\n[15] 보조 테이블...');
db.exec("CREATE TABLE IF NOT EXISTS legal_notices (id INTEGER PRIMARY KEY AUTOINCREMENT, notice_key TEXT UNIQUE NOT NULL, title TEXT NOT NULL, law_ref TEXT, content TEXT, is_active INTEGER DEFAULT 1, updated_by INTEGER REFERENCES users(id), updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
db.exec("CREATE TABLE IF NOT EXISTS signature_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE, requester_id INTEGER NOT NULL REFERENCES users(id), worker_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','signed','rejected')), requested_at DATETIME DEFAULT CURRENT_TIMESTAMP, responded_at DATETIME, sign_data TEXT, UNIQUE(assessment_id, worker_id))");
db.exec("CREATE TABLE IF NOT EXISTS safety_education_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, edu_type TEXT NOT NULL, edu_subject TEXT NOT NULL, edu_date DATE NOT NULL, edu_hours REAL NOT NULL, edu_location TEXT DEFAULT '', instructor TEXT DEFAULT '', year INTEGER NOT NULL, month INTEGER NOT NULL, notes TEXT DEFAULT '', edu_content TEXT, created_by INTEGER REFERENCES users(id), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
db.exec("CREATE TABLE IF NOT EXISTS safety_education_attendees (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL REFERENCES safety_education_sessions(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), name TEXT NOT NULL, department TEXT DEFAULT '', position TEXT DEFAULT '', sign_data TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
db.exec("CREATE TABLE IF NOT EXISTS edu_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL REFERENCES safety_education_sessions(id) ON DELETE CASCADE, file_name TEXT NOT NULL, file_path TEXT, file_size INTEGER, mime_type TEXT DEFAULT 'image/jpeg', uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
db.exec("CREATE TABLE IF NOT EXISTS edu_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL UNIQUE REFERENCES safety_education_sessions(id) ON DELETE CASCADE, report_data TEXT, generated_at DATETIME DEFAULT CURRENT_TIMESTAMP, generated_by INTEGER REFERENCES users(id))");
db.exec("CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, data TEXT, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id)');
console.log('  ✅ 보조 테이블');

// ── 최종 검증 ─────────────────────────────────────────────────
db.pragma('foreign_keys = ON');
var finals = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(function(r){ return r.name; });
var critical = ['users','tasks','constructions','checklist_items','system_settings','teams','task_work_types','task_attachments','site_inspections'];
var allOk = true;
console.log('\n[핵심 테이블 검증]');
critical.forEach(function(t) {
  var ok = finals.includes(t);
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + t);
  if (!ok) allOk = false;
});

var admin = db.prepare("SELECT id FROM users WHERE username='admin'").get();
console.log('  ' + (admin ? '✅' : '⚠️ ') + ' admin 계정');

db.close();
console.log('\n' + '='.repeat(60));
if (allOk) {
  console.log('✅ DB 초기화 완료 — 서버 시작 준비 완료');
} else {
  console.log('⚠️  일부 테이블 누락 — 위 로그 확인 필요');
  process.exit(1);
}
console.log('='.repeat(60));
DBINIT_EOF

  ok "DB 초기화 스크립트 생성 완료: $DB_INIT_SCRIPT"

  # DB 초기화 실행
  info "DB 핵심 테이블 초기화 실행 중..."
  if "$NODE_EXEC" "$DB_INIT_SCRIPT" 2>&1; then
    ok "DB 핵심 테이블 초기화 완료"
  else
    warn "DB 초기화 중 일부 경고 발생 — 서버 시작 후 pm2 logs로 확인하세요"
  fi
fi

# =============================================================================
# Step 8: PM2 서버 시작
# =============================================================================
step "Step 10/10: PM2 서버 시작"

$PM2_EXEC delete "$APP_NAME" 2>/dev/null || true
sleep 1

info "PM2 프로세스 등록 중..."
# [BUG-202 영구 해결] start-server.sh 래퍼 방식 사용
# tsx 소멸 시 자동 복구(링크 재생성 or npm install tsx) 후 서버 기동
# → 자동업데이트/재시작 후 503 악순환 구조적 차단
if [ -x "$START_SERVER_SH" ]; then
  PORT=$APP_PORT $PM2_EXEC start "$START_SERVER_SH" \
    --name "$APP_NAME" \
    --interpreter /bin/bash \
    --cwd "$INSTALL_DIR"
  ok "PM2 등록: start-server.sh 래퍼 방식 (tsx 자동 복구 포함)"
else
  warn "start-server.sh 없음 — tsx 직접 방식으로 폴백 (tsx 소멸 시 503 위험)"
  PORT=$APP_PORT $PM2_EXEC start "$TSX_EXEC" \
    --name "$APP_NAME" \
    --interpreter "$NODE_EXEC" \
    --cwd "$INSTALL_DIR" \
    -- node-server.ts
fi

sleep 4

$PM2_EXEC save --force 2>/dev/null || true

# 서버 응답 확인 (HTTP 내부 포트 3444로 확인)
SERVER_OK=false
CHECK_PORT="3444"
for i in 1 2 3; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:${CHECK_PORT}/" --max-time 5 2>/dev/null || echo "000")
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
  warn "서버 응답 확인 실패 (HTTP ${HTTP_CODE}) — HTTPS 인증서 설정 후 정상 동작 가능"
  warn "로그 확인: $PM2_EXEC logs $APP_NAME --nostream --lines 30"
fi

# =============================================================================
# Step 9: DSM 작업 스케줄러 — PM2 자동복구 Watchdog 등록
# =============================================================================
step "Step 11: PM2 자동복구 Watchdog 등록 (SSH 비활성화 환경 대비)"

WATCHDOG_SCRIPT="$INSTALL_DIR/scripts/pm2-watchdog.sh"
RECOVERY_SCRIPT="$INSTALL_DIR/scripts/safe-recovery.sh"
STANDALONE_SCRIPT="$INSTALL_DIR/scripts/safe-recovery-standalone.sh"
SYNO_TASK_CONF="/usr/syno/etc/scheduled_task"
WATCHDOG_REGISTERED=false

# watchdog / safe-recovery / standalone 스크립트 실행 권한 부여
if [ -f "$WATCHDOG_SCRIPT" ]; then
  chmod +x "$WATCHDOG_SCRIPT"
  ok "watchdog 스크립트 실행 권한 설정: $WATCHDOG_SCRIPT"
else
  warn "watchdog 스크립트 없음: $WATCHDOG_SCRIPT (git pull 후 재시도)"
fi

if [ -f "$RECOVERY_SCRIPT" ]; then
  chmod +x "$RECOVERY_SCRIPT"
  ok "safe-recovery 스크립트 실행 권한 설정: $RECOVERY_SCRIPT"
else
  warn "safe-recovery 스크립트 없음: $RECOVERY_SCRIPT (git pull 후 재시도)"
fi

if [ -f "$STANDALONE_SCRIPT" ]; then
  chmod +x "$STANDALONE_SCRIPT"
  ok "safe-recovery-standalone 스크립트 실행 권한 설정: $STANDALONE_SCRIPT"
else
  warn "safe-recovery-standalone 스크립트 없음: $STANDALONE_SCRIPT (git pull 후 재시도)"
fi

# DSM 작업 스케줄러 자동 등록 시도
# Synology DSM 7.x: /usr/syno/bin/synoscheduler 또는 직접 conf 파일 생성
SYNO_SCHED_BIN=""
for _bin in /usr/syno/bin/synoscheduler /usr/bin/synoscheduler; do
  [ -x "$_bin" ] && SYNO_SCHED_BIN="$_bin" && break
done

if [ -n "$SYNO_SCHED_BIN" ]; then
  # synoscheduler CLI로 등록 시도
  "$SYNO_SCHED_BIN" --add \
    --name "SafetyNOTE PM2 자동복구" \
    --user root \
    --minute "*/5" \
    --script "bash $WATCHDOG_SCRIPT" 2>/dev/null \
  && WATCHDOG_REGISTERED=true \
  || true
fi

if [ "$WATCHDOG_REGISTERED" = true ]; then
  ok "DSM 작업 스케줄러 자동 등록 완료 (5분 간격)"
else
  # 자동 등록 실패 시 — 수동 등록 안내 출력
  warn "DSM 작업 스케줄러 수동 등록 필요 (아래 안내 참고)"
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
printf "${GREEN}║${NC}  접속 주소 : https://%-35s${GREEN}║${NC}\n" "${NAS_IP}:${APP_PORT}"
printf "${GREEN}║${NC}  설치 경로 : %-39s${GREEN}║${NC}\n" "${INSTALL_DIR}"
printf "${GREEN}║${NC}  커밋 버전 : %-39s${GREEN}║${NC}\n" "${INSTALLED_COMMIT}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  ⚠️  HTTPS 인증서 설정 필요 (Synology 인증서 적용)   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     DSM → 제어판 → 보안 → 인증서 → 기본 인증서 확인 ${GREEN}║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  ✅ 다음 단계                                        ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   1. 위 주소로 브라우저 접속                         ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   2. 초기 관리자 계정으로 로그인                     ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}      ID: admin    PW: admin1234                      ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   3. 시스템설정 → 비밀번호 즉시 변경! ⚠️              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   4. 시스템설정 → APK 탭 → APK 파일 업로드          ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}      (Android 앱 설치용 APK 등록 필요)               ${GREEN}║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  📋 유용한 명령어                                    ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   pm2 status              ← 서버 상태 확인           ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   pm2 logs $APP_NAME  ← 서버 로그 확인           ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   pm2 restart $APP_NAME   ← 서버 재시작              ${GREEN}║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  🔄 향후 업데이트 방법                               ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   브라우저: 시스템설정 → 서버 업데이트 탭            ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   수동SSH:  cd ${INSTALL_DIR} && git pull && pm2 restart $APP_NAME ${GREEN}║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  🛡️  PM2 자동복구 Watchdog (SSH 비활성화 시 필수)    ${GREEN}║${NC}"
if [ "$WATCHDOG_REGISTERED" = true ]; then
echo -e "${GREEN}║${NC}   ✅ DSM 작업 스케줄러 자동 등록 완료 (5분 간격)    ${GREEN}║${NC}"
else
echo -e "${GREEN}║${NC}   ⚠️  아직 미등록 — DSM에서 수동 등록 필요:          ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   제어판 → 작업 스케줄러 → 생성 → 예약된 작업       ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   사용자: root / 반복: 매 5분                        ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   스크립트:                                          ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   bash ${WATCHDOG_SCRIPT}   ${GREEN}║${NC}"
fi
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  🚨 비상 복구 (서버 완전 다운 시)                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   ① watchdog이 crash 3회 감지 시 자동 가동           ${GREEN}║${NC}"
printf "${GREEN}║${NC}   비상 복구 주소 : http://%-31s${GREEN}║${NC}\n" "${NAS_IP}:3445"
echo -e "${GREEN}║${NC}   비밀번호: .env 파일의 RECOVERY_PASSWORD 값         ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   (기본값: recovery1234 — 변경 강력 권장!)           ${GREEN}║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  🆘 비상 복구 서버 수동 즉시 실행 (언제든 가능)      ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   DSM 작업 스케줄러 → 생성 → 예약된 작업            ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   사용자: root / 반복: 실행 안 함                    ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   스크립트:                                          ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   bash ${STANDALONE_SCRIPT}  ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   → [실행] 클릭 후 http://${NAS_IP}:3445 접속        ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
