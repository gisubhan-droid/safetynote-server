#!/bin/bash
# =============================================================================
# SafetyNOTE PM2 자동복구 Watchdog 스크립트
# pm2-watchdog.sh v1.0
# =============================================================================
#
# 목적:
#   SSH 비활성화 환경에서 PM2 프로세스가 중단될 경우 자동 복구
#   DSM 작업 스케줄러에 등록하여 5분마다 실행
#
# DSM 등록 방법:
#   제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트
#   ┌─────────────────────────────────────────────────────┐
#   │ 작업 이름  : SafetyNOTE PM2 자동복구                   │
#   │ 사용자     : root                                     │
#   │ 반복       : 매 5분 (매일, 모든 시간, 5분 간격)           │
#   │ 스크립트   : bash /volume1/safetynote/scripts/pm2-watchdog.sh │
#   └─────────────────────────────────────────────────────┘
#
# 로그 위치: /var/log/safetynote-watchdog.log
# =============================================================================

# ─── 설정값 ──────────────────────────────────────────────────────────────────
INSTALL_DIR="/volume1/safetynote"
APP_NAME="safetynote"
LOG_FILE="/var/log/safetynote-watchdog.log"
MAX_LOG_LINES=500   # 로그 최대 줄 수 (초과 시 오래된 것 삭제)

# Node.js / PM2 경로 (Synology DSM Node.js v18 패키지 기준)
NODE_PATH="/volume1/@appstore/Node.js_v18/usr/local/bin"
export PATH="$NODE_PATH:/usr/local/bin:/usr/bin:/bin:$PATH"

# ─── 유틸 함수 ───────────────────────────────────────────────────────────────
timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

log() {
  echo "[$(timestamp)] $1" >> "$LOG_FILE"
}

# 로그 파일 크기 관리 (MAX_LOG_LINES 초과 시 오래된 줄 제거)
trim_log() {
  if [ -f "$LOG_FILE" ]; then
    local lines
    lines=$(wc -l < "$LOG_FILE")
    if [ "$lines" -gt "$MAX_LOG_LINES" ]; then
      local keep=$(( MAX_LOG_LINES - 50 ))
      tail -n "$keep" "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
      log "로그 정리 완료 (${lines}줄 → ${keep}줄)"
    fi
  fi
}

# PM2 실행 파일 탐색
find_pm2() {
  # 1순위: PATH에서 탐색
  if command -v pm2 &>/dev/null; then
    echo "pm2"
    return
  fi
  # 2순위: Node.js 패키지 경로
  local candidates=(
    "$NODE_PATH/pm2"
    "/usr/local/bin/pm2"
    "/usr/bin/pm2"
    "$INSTALL_DIR/node_modules/.bin/pm2"
  )
  for p in "${candidates[@]}"; do
    if [ -x "$p" ]; then
      echo "$p"
      return
    fi
  done
  echo ""
}

# Node.js 실행 파일 탐색
find_node() {
  if command -v node &>/dev/null; then
    echo "node"
    return
  fi
  local candidates=(
    "$NODE_PATH/node"
    "/usr/local/bin/node"
    "/usr/bin/node"
  )
  for p in "${candidates[@]}"; do
    if [ -x "$p" ]; then
      echo "$p"
      return
    fi
  done
  echo ""
}

# tsx 실행 파일 탐색
find_tsx() {
  local candidates=(
    "$INSTALL_DIR/node_modules/.bin/tsx"
    "$NODE_PATH/tsx"
    "/usr/local/bin/tsx"
  )
  for p in "${candidates[@]}"; do
    if [ -x "$p" ]; then
      echo "$p"
      return
    fi
  done
  echo ""
}

# ─── 메인 로직 ───────────────────────────────────────────────────────────────
main() {
  trim_log

  # PM2 바이너리 확인
  local PM2_BIN
  PM2_BIN=$(find_pm2)
  if [ -z "$PM2_BIN" ]; then
    log "[ERROR] PM2 실행 파일을 찾을 수 없습니다. Node.js 패키지 설치를 확인하세요."
    exit 1
  fi

  # PM2 프로세스 상태 확인
  local STATUS
  STATUS=$("$PM2_BIN" describe "$APP_NAME" 2>/dev/null | grep -E "status" | head -1 | awk '{print $4}')

  if [ "$STATUS" = "online" ]; then
    # 정상 동작 중 — 로그 없음 (매 5분 정상 로그는 불필요)
    exit 0
  fi

  # ── 비정상 상태 감지 → 복구 시도 ─────────────────────────────────────────
  log "[WARN] $APP_NAME 상태: '${STATUS:-없음}' — 복구 시작"

  # Node.js / tsx 확인
  local NODE_BIN TSX_BIN
  NODE_BIN=$(find_node)
  TSX_BIN=$(find_tsx)

  if [ -z "$NODE_BIN" ]; then
    log "[ERROR] Node.js 실행 파일을 찾을 수 없습니다."
    exit 1
  fi
  if [ -z "$TSX_BIN" ]; then
    log "[ERROR] tsx 실행 파일을 찾을 수 없습니다. ($INSTALL_DIR/node_modules/.bin/tsx)"
    exit 1
  fi

  # .env에서 PORT 읽기 (없으면 기본값 3443)
  local PORT=3443
  if [ -f "$INSTALL_DIR/.env" ]; then
    local ENV_PORT
    ENV_PORT=$(grep -E "^PORT=" "$INSTALL_DIR/.env" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -n "$ENV_PORT" ] && PORT="$ENV_PORT"
  fi

  # PM2 프로세스 삭제 후 재등록
  "$PM2_BIN" delete "$APP_NAME" 2>/dev/null || true

  # 재시작
  PORT=$PORT "$PM2_BIN" start "$TSX_BIN" \
    --name "$APP_NAME" \
    --interpreter "$NODE_BIN" \
    -- node-server.ts \
    2>> "$LOG_FILE"

  # 저장
  "$PM2_BIN" save 2>/dev/null || true

  # 결과 확인 (5초 대기 후)
  sleep 5
  local NEW_STATUS
  NEW_STATUS=$("$PM2_BIN" describe "$APP_NAME" 2>/dev/null | grep -E "status" | head -1 | awk '{print $4}')

  if [ "$NEW_STATUS" = "online" ]; then
    log "[OK] $APP_NAME 복구 완료 (PORT=$PORT)"
  else
    log "[ERROR] $APP_NAME 복구 실패 — 상태: '${NEW_STATUS:-알 수 없음}'"
  fi
}

# ─── 실행 ────────────────────────────────────────────────────────────────────
main "$@"
