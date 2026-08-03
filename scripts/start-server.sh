#!/bin/bash
# =============================================================================
# SafetyNOTE 서버 시작 래퍼 스크립트 (start-server.sh)
# BUG-202/BUG-205: tsx 바이너리 소멸 방지 영구 해결
# =============================================================================
#
# 역할:
#   PM2 script로 이 파일을 등록하여, tsx가 소멸되어도 자동 복구 후 서버 시작
#   → pm2 restart 시마다 tsx 존재 여부 검증 → 없으면 설치 → 서버 기동
#
# PM2 등록 방법 (NAS에서 최초 1회 실행):
#   pm2 delete safetynote 2>/dev/null || true
#   PORT=3443 pm2 start /volume1/safetynote/scripts/start-server.sh \
#     --name safetynote \
#     --interpreter /bin/bash \
#     --cwd /volume1/safetynote
#   pm2 save
#
# 이후부터는 pm2 restart safetynote 만으로 tsx 자동 복구 + 서버 시작
# =============================================================================

# ── 경로 설정 ────────────────────────────────────────────────────────────────
# 볼륨 자동 감지
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
export PATH="$NODE_PATH_V20:$NODE_PATH:/usr/local/bin:/usr/bin:/bin:$PATH"

# Node, npm 절대경로 탐색
NODE_BIN="/usr/local/bin/node"
for c in "$NODE_PATH_V20/node" "$NODE_PATH/node" "/usr/local/bin/node"; do
  [ -x "$c" ] && NODE_BIN="$c" && break
done

NPM_BIN="/usr/local/bin/npm"
for c in "$NODE_PATH_V20/npm" "$NODE_PATH/npm" "/usr/local/bin/npm"; do
  [ -x "$c" ] && NPM_BIN="$c" && break
done

TSX_BIN="$INSTALL_DIR/node_modules/.bin/tsx"
TSX_ENTRY_MJS="$INSTALL_DIR/node_modules/tsx/dist/cli.mjs"
TSX_ENTRY_JS="$INSTALL_DIR/node_modules/tsx/dist/cli.js"

LOG="/var/log/safetynote-start.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] start-server.sh 시작" >> "$LOG"

cd "$INSTALL_DIR" || {
  echo "[$(date)] ERROR: $INSTALL_DIR 없음" >> "$LOG"
  exit 1
}

# ── tsx 자동 복구 (BUG-202 영구 해결) ────────────────────────────────────────
ensure_tsx() {
  # Case 1: .bin/tsx 정상 존재 → 바로 통과
  if [ -x "$TSX_BIN" ]; then
    echo "[$(date '+%H:%M:%S')] tsx ✅ 정상 ($TSX_BIN)" >> "$LOG"
    return 0
  fi

  echo "[$(date '+%H:%M:%S')] tsx 없음 — 자동 복구 시작..." >> "$LOG"

  # Case 2: tsx 패키지는 있으나 .bin 링크만 없는 경우 — 링크 수동 생성
  if [ -d "$INSTALL_DIR/node_modules/tsx" ]; then
    local TSX_ENTRY=""
    [ -f "$TSX_ENTRY_MJS" ] && TSX_ENTRY="$TSX_ENTRY_MJS"
    [ -z "$TSX_ENTRY" ] && [ -f "$TSX_ENTRY_JS" ] && TSX_ENTRY="$TSX_ENTRY_JS"

    if [ -n "$TSX_ENTRY" ]; then
      ln -sf "$TSX_ENTRY" "$TSX_BIN" && chmod +x "$TSX_BIN"
      if [ -x "$TSX_BIN" ]; then
        echo "[$(date '+%H:%M:%S')] tsx 링크 복구 ✅ → $TSX_ENTRY" >> "$LOG"
        return 0
      fi
    fi
  fi

  # Case 3: tsx 패키지 자체 없음 → npm install tsx
  echo "[$(date '+%H:%M:%S')] tsx npm 설치 중..." >> "$LOG"
  "$NPM_BIN" install tsx --save-dev --ignore-scripts >> "$LOG" 2>&1

  # 설치 후 링크 재확인
  if [ ! -x "$TSX_BIN" ]; then
    # postinstall 없이 설치 → 링크 수동 생성
    local TSX_ENTRY=""
    [ -f "$TSX_ENTRY_MJS" ] && TSX_ENTRY="$TSX_ENTRY_MJS"
    [ -z "$TSX_ENTRY" ] && [ -f "$TSX_ENTRY_JS" ] && TSX_ENTRY="$TSX_ENTRY_JS"
    if [ -n "$TSX_ENTRY" ]; then
      ln -sf "$TSX_ENTRY" "$TSX_BIN" && chmod +x "$TSX_BIN"
    fi
  fi

  if [ -x "$TSX_BIN" ]; then
    echo "[$(date '+%H:%M:%S')] tsx 설치 + 복구 완료 ✅" >> "$LOG"
    return 0
  fi

  echo "[$(date '+%H:%M:%S')] ERROR: tsx 복구 실패" >> "$LOG"
  return 1
}

# tsx 복구 실행
ensure_tsx || {
  echo "[$(date '+%H:%M:%S')] FATAL: tsx 없이 서버 시작 불가" >> "$LOG"
  exit 1
}

# ── 서버 시작 ─────────────────────────────────────────────────────────────────
echo "[$(date '+%H:%M:%S')] 서버 시작: $NODE_BIN $TSX_BIN node-server.ts" >> "$LOG"
exec "$NODE_BIN" "$TSX_BIN" node-server.ts
