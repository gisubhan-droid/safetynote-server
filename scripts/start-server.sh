#!/bin/bash
# =============================================================================
# SafetyNOTE 서버 시작 래퍼 스크립트 (start-server.sh)
# BUG-202/BUG-206/BUG-207: 서버 코드와 무관하게 항상 최신 코드로 기동
# =============================================================================
#
# 역할 (pm2 restart 시마다 실행):
#   1. git pull → 최신 코드 동기화
#   2. npm install --ignore-scripts → optional 바이너리 복구
#   3. better-sqlite3 GLIBC 호환 바이너리 교체 (glibc < 2.29 환경)
#   4. tsx 심볼릭 링크 복구 (BUG-202)
#   5. vite build → dist 재빌드
#   6. node tsx node-server.ts → 서버 기동
#
# 핵심 설계 원칙:
#   Webhook은 pm2 restart만 트리거 → 업데이트 로직은 전부 이 스크립트 안에 있음
#   → 서버 코드 버전(admin.ts 등)에 전혀 의존하지 않음
#   → "구버전 서버가 업데이트를 처리"하는 치킨-에그 문제 완전 해소
#
# PM2 등록 방법 (NAS에서 최초 1회 실행):
#   pm2 delete safetynote 2>/dev/null || true
#   PORT=3443 pm2 start /volume1/safetynote/scripts/start-server.sh \
#     --name safetynote \
#     --interpreter /bin/bash \
#     --cwd /volume1/safetynote
#   pm2 save
# =============================================================================

# ── 경로 설정 ────────────────────────────────────────────────────────────────
if [ -n "$SAFETYNOTE_VOLUME" ]; then
  VOLUME="$SAFETYNOTE_VOLUME"
else
  VOLUME="volume1"
  for v in volume1 volume2 volume3 volume4; do
    if [ -d "/$v/safetynote" ]; then VOLUME="$v"; break; fi
  done
fi

INSTALL_DIR="/${VOLUME}/safetynote"
NODE_PATH="/${VOLUME}/@appstore/Node.js_v18/usr/local/bin"
NODE_PATH_V20="/${VOLUME}/@appstore/Node.js_v20/usr/local/bin"
export PATH="$NODE_PATH_V20:$NODE_PATH:/opt/bin:/opt/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Node, npm, git 절대경로 탐색
NODE_BIN="/usr/local/bin/node"
for c in "$NODE_PATH_V20/node" "$NODE_PATH/node" "/usr/local/bin/node"; do
  [ -x "$c" ] && NODE_BIN="$c" && break
done

NPM_BIN="/usr/local/bin/npm"
for c in "$NODE_PATH_V20/npm" "$NODE_PATH/npm" "/usr/local/bin/npm"; do
  [ -x "$c" ] && NPM_BIN="$c" && break
done

GIT_BIN="$(command -v git 2>/dev/null || echo '/usr/bin/git')"
VITE_BIN="$INSTALL_DIR/node_modules/.bin/vite"
VITE_JS="$INSTALL_DIR/node_modules/vite/bin/vite.js"
TSX_BIN="$INSTALL_DIR/node_modules/.bin/tsx"
TSX_ENTRY_MJS="$INSTALL_DIR/node_modules/tsx/dist/cli.mjs"
TSX_ENTRY_JS="$INSTALL_DIR/node_modules/tsx/dist/cli.js"
BS3_NODE="$INSTALL_DIR/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
BS3_URL="https://github.com/WiseLibs/better-sqlite3/releases/download/v8.0.0/better-sqlite3-v8.0.0-node-v108-linux-x64.tar.gz"

LOG="/var/log/safetynote-start.log"
ts() { date '+%Y-%m-%d %H:%M:%S'; }

echo "" >> "$LOG"
echo "[$(ts)] ====== start-server.sh 시작 ======" >> "$LOG"

cd "$INSTALL_DIR" || {
  echo "[$(ts)] FATAL: $INSTALL_DIR 없음" >> "$LOG"
  exit 1
}

# ── STEP 1: git pull — 최신 코드 동기화 ──────────────────────────────────────
echo "[$(ts)] STEP1: git pull..." >> "$LOG"
"$GIT_BIN" fetch origin main >> "$LOG" 2>&1
GIT_RESET=$("$GIT_BIN" reset --hard origin/main 2>&1)
echo "[$(ts)] git reset: $GIT_RESET" >> "$LOG"

# ── STEP 2: npm install --ignore-scripts ──────────────────────────────────────
# rollup optional 바이너리 복구 (BUG-ROLLUP / BUG-206)
echo "[$(ts)] STEP2: npm install --ignore-scripts..." >> "$LOG"
"$NPM_BIN" install --ignore-scripts >> "$LOG" 2>&1
echo "[$(ts)] npm install 완료" >> "$LOG"

# ── STEP 3: better-sqlite3 GLIBC 호환 바이너리 교체 (BUG-BS3) ───────────────
fix_bs3() {
  # glibc 버전 확인
  GLIBC_VER=$(ldd --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "0")
  GLIBC_NUM=$(echo "$GLIBC_VER" | awk -F. '{printf "%d%03d", $1, $2}')
  if [ "$GLIBC_NUM" -ge "2029" ] 2>/dev/null; then
    echo "[$(ts)] STEP3: glibc $GLIBC_VER >= 2.29 — bs3 교체 불필요" >> "$LOG"
    return 0
  fi
  echo "[$(ts)] STEP3: glibc $GLIBC_VER < 2.29 — bs3 바이너리 교체 중..." >> "$LOG"
  TMP_TAR="/tmp/bs3_v800.tar.gz"
  TMP_DIR="/tmp/bs3_v800_dir"
  if [ ! -f "$TMP_TAR" ]; then
    curl -fsSL "$BS3_URL" -o "$TMP_TAR" >> "$LOG" 2>&1 || {
      echo "[$(ts)] STEP3: bs3 다운로드 실패 (무시)" >> "$LOG"; return 0
    }
  fi
  rm -rf "$TMP_DIR" && mkdir -p "$TMP_DIR"
  tar -xzf "$TMP_TAR" -C "$TMP_DIR" >> "$LOG" 2>&1
  BS3_NEW=$(find "$TMP_DIR" -name "*.node" | head -1)
  if [ -n "$BS3_NEW" ] && [ -f "$BS3_NODE" ]; then
    cp "$BS3_NEW" "$BS3_NODE" && echo "[$(ts)] STEP3: bs3 바이너리 교체 완료 ✅" >> "$LOG"
  fi
}
fix_bs3

# ── STEP 4: tsx 심볼릭 링크 복구 (BUG-202) ───────────────────────────────────
ensure_tsx() {
  if [ -x "$TSX_BIN" ]; then
    echo "[$(ts)] STEP4: tsx ✅ 정상" >> "$LOG"
    return 0
  fi
  echo "[$(ts)] STEP4: tsx 없음 — 복구 시도..." >> "$LOG"
  if [ -d "$INSTALL_DIR/node_modules/tsx" ]; then
    local ENTRY=""
    [ -f "$TSX_ENTRY_MJS" ] && ENTRY="$TSX_ENTRY_MJS"
    [ -z "$ENTRY" ] && [ -f "$TSX_ENTRY_JS" ] && ENTRY="$TSX_ENTRY_JS"
    if [ -n "$ENTRY" ]; then
      ln -sf "$ENTRY" "$TSX_BIN" && chmod +x "$TSX_BIN"
      [ -x "$TSX_BIN" ] && echo "[$(ts)] STEP4: tsx 링크 복구 ✅" >> "$LOG" && return 0
    fi
  fi
  echo "[$(ts)] STEP4: tsx npm 설치 중..." >> "$LOG"
  "$NPM_BIN" install tsx --save-dev --ignore-scripts >> "$LOG" 2>&1
  [ -f "$TSX_ENTRY_MJS" ] && ln -sf "$TSX_ENTRY_MJS" "$TSX_BIN" && chmod +x "$TSX_BIN"
  if [ -x "$TSX_BIN" ]; then
    echo "[$(ts)] STEP4: tsx 설치+복구 완료 ✅" >> "$LOG"
    return 0
  fi
  echo "[$(ts)] STEP4: FATAL tsx 복구 실패" >> "$LOG"
  return 1
}
ensure_tsx || { echo "[$(ts)] FATAL: tsx 없이 서버 시작 불가" >> "$LOG"; exit 1; }

# ── STEP 5: vite build — dist 재빌드 ─────────────────────────────────────────
echo "[$(ts)] STEP5: vite build 시작..." >> "$LOG"
BUILD_OK=false
if [ -x "$VITE_BIN" ]; then
  "$VITE_BIN" build >> "$LOG" 2>&1 && BUILD_OK=true
elif [ -f "$VITE_JS" ]; then
  "$NODE_BIN" "$VITE_JS" build >> "$LOG" 2>&1 && BUILD_OK=true
fi

if $BUILD_OK; then
  echo "[$(ts)] STEP5: 빌드 완료 ✅" >> "$LOG"
else
  echo "[$(ts)] STEP5: 빌드 실패 — 기존 dist로 기동 (서버는 뜨지만 구버전)" >> "$LOG"
fi

# ── STEP 6: 서버 기동 ─────────────────────────────────────────────────────────
echo "[$(ts)] STEP6: 서버 기동: node tsx node-server.ts" >> "$LOG"
exec "$NODE_BIN" "$TSX_BIN" node-server.ts
