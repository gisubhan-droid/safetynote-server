#!/bin/bash
# =============================================================================
# SafetyNOTE PM2 자동복구 Watchdog 스크립트
# pm2-watchdog.sh v2.0  (FEAT-053b: crash 자동 rollback + 비상 복구 서버 연계)
# =============================================================================
#
# 목적:
#   SSH 비활성화 환경에서 PM2 프로세스가 중단될 경우 자동 복구
#   일정 횟수 이상 crash 반복 시 → 이전 git 커밋으로 자동 롤백
#   롤백도 실패 시 → 비상 복구 웹서버(3445포트) 자동 가동
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
# 로그 위치    : /var/log/safetynote-watchdog.log
# crash 카운터 : /var/run/safetynote-crash-count
# 비상 복구    : http://NAS_IP:3445  (서버가 살아날 때까지 유지)
# =============================================================================

# ─── 설정값 ──────────────────────────────────────────────────────────────────
INSTALL_DIR="/volume1/safetynote"
APP_NAME="safetynote"
LOG_FILE="/var/log/safetynote-watchdog.log"
MAX_LOG_LINES=500

# crash 임계값: 이 횟수만큼 연속으로 서버가 죽어 있으면 자동 rollback 실행
# (watchdog이 5분 간격이므로 3회 = 약 15분간 계속 죽어 있을 때)
CRASH_THRESHOLD=3
CRASH_COUNT_FILE="/var/run/safetynote-crash-count"

# 비상 복구 웹서버 스크립트
RECOVERY_SCRIPT="$INSTALL_DIR/scripts/safe-recovery.sh"
RECOVERY_PORT=3445
RECOVERY_PID_FILE="/var/run/safetynote-recovery.pid"

# Node.js / PM2 경로 (Synology DSM Node.js v18 패키지 기준)
NODE_PATH="/volume1/@appstore/Node.js_v18/usr/local/bin"
export PATH="$NODE_PATH:/usr/local/bin:/usr/bin:/bin:$PATH"

# ─── 유틸 함수 ───────────────────────────────────────────────────────────────
timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

log() {
  echo "[$(timestamp)] $1" >> "$LOG_FILE"
}

trim_log() {
  if [ -f "$LOG_FILE" ]; then
    local lines
    lines=$(wc -l < "$LOG_FILE")
    if [ "$lines" -gt "$MAX_LOG_LINES" ]; then
      local keep=$(( MAX_LOG_LINES - 50 ))
      tail -n "$keep" "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    fi
  fi
}

# PM2 실행 파일 탐색
find_pm2() {
  if command -v pm2 &>/dev/null; then echo "pm2"; return; fi
  local candidates=(
    "$NODE_PATH/pm2"
    "/usr/local/bin/pm2"
    "/usr/bin/pm2"
    "$INSTALL_DIR/node_modules/.bin/pm2"
  )
  for p in "${candidates[@]}"; do
    [ -x "$p" ] && echo "$p" && return
  done
  echo ""
}

# Node.js 실행 파일 탐색
find_node() {
  if command -v node &>/dev/null; then echo "node"; return; fi
  local candidates=(
    "$NODE_PATH/node"
    "/usr/local/bin/node"
    "/usr/bin/node"
  )
  for p in "${candidates[@]}"; do
    [ -x "$p" ] && echo "$p" && return
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
    [ -x "$p" ] && echo "$p" && return
  done
  echo ""
}

# npm 실행 파일 탐색
find_npm() {
  if command -v npm &>/dev/null; then echo "npm"; return; fi
  local candidates=(
    "$NODE_PATH/npm"
    "/volume1/@appstore/Node.js_v20/usr/local/bin/npm"
    "/usr/local/bin/npm"
    "/usr/bin/npm"
  )
  for p in "${candidates[@]}"; do
    [ -x "$p" ] && echo "$p" && return
  done
  echo ""
}

# ─── crash 카운터 관리 ───────────────────────────────────────────────────────
read_crash_count() {
  if [ -f "$CRASH_COUNT_FILE" ]; then
    cat "$CRASH_COUNT_FILE" 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

write_crash_count() {
  echo "$1" > "$CRASH_COUNT_FILE"
}

reset_crash_count() {
  echo "0" > "$CRASH_COUNT_FILE"
}

# ─── 비상 복구 웹서버 시작/확인 ─────────────────────────────────────────────
start_recovery_server() {
  # 이미 실행 중인지 확인
  if [ -f "$RECOVERY_PID_FILE" ]; then
    local pid
    pid=$(cat "$RECOVERY_PID_FILE" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      log "[RECOVERY] 비상 복구 서버 이미 실행 중 (PID=$pid, PORT=$RECOVERY_PORT)"
      return 0
    fi
  fi

  # safe-recovery.sh 존재 확인
  if [ ! -f "$RECOVERY_SCRIPT" ]; then
    log "[RECOVERY] 비상 복구 스크립트 없음: $RECOVERY_SCRIPT"
    return 1
  fi

  chmod +x "$RECOVERY_SCRIPT"
  log "[RECOVERY] 비상 복구 웹서버 시작 중... (PORT=$RECOVERY_PORT)"
  bash "$RECOVERY_SCRIPT" "$INSTALL_DIR" "$RECOVERY_PORT" >> "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$RECOVERY_PID_FILE"
  sleep 2

  # 포트 응답 확인
  if command -v curl &>/dev/null; then
    local resp
    resp=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$RECOVERY_PORT/" --max-time 3 2>/dev/null || echo "000")
    if [ "$resp" = "200" ]; then
      log "[RECOVERY] ✅ 비상 복구 서버 정상 가동 (PID=$pid)"
      # NAS IP 감지
      local NAS_IP
      NAS_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || hostname -i 2>/dev/null | awk '{print $1}' || echo "NAS_IP")
      log "[RECOVERY] 👉 브라우저에서 접속: http://${NAS_IP}:${RECOVERY_PORT}"
    else
      log "[RECOVERY] ⚠️ 비상 복구 서버 응답 없음 (HTTP=$resp) — 수동 확인 필요"
    fi
  else
    log "[RECOVERY] 비상 복구 서버 시작됨 (PID=$pid) — curl 없어서 응답 확인 불가"
  fi
}

stop_recovery_server() {
  if [ -f "$RECOVERY_PID_FILE" ]; then
    local pid
    pid=$(cat "$RECOVERY_PID_FILE" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      log "[RECOVERY] 비상 복구 서버 종료 (PID=$pid)"
    fi
    rm -f "$RECOVERY_PID_FILE"
  fi
  # 포트 3445에 남아있는 프로세스 강제 종료
  if command -v fuser &>/dev/null; then
    fuser -k "${RECOVERY_PORT}/tcp" 2>/dev/null || true
  fi
}

# ─── git 자동 롤백 ───────────────────────────────────────────────────────────
# HEAD~1 (바로 이전 커밋)으로 reset --hard 후 build + restart 시도
auto_git_rollback() {
  local PM2_BIN="$1"
  local NODE_BIN="$2"
  local TSX_BIN="$3"
  local PORT="$4"

  log "[ROLLBACK] ━━━ 자동 롤백 시작 ━━━"

  # git 확인
  if ! command -v git &>/dev/null; then
    log "[ROLLBACK] git 명령어 없음 — 롤백 불가"
    return 1
  fi

  cd "$INSTALL_DIR" || { log "[ROLLBACK] cd 실패"; return 1; }

  # 현재 커밋 해시 저장
  local CURRENT_HASH
  CURRENT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  log "[ROLLBACK] 현재 커밋: $CURRENT_HASH"

  # 이전 커밋 존재 확인
  local PREV_HASH
  PREV_HASH=$(git rev-parse --short HEAD~1 2>/dev/null || echo "")
  if [ -z "$PREV_HASH" ]; then
    log "[ROLLBACK] 이전 커밋 없음 — 롤백 불가 (첫 번째 커밋)"
    return 1
  fi
  log "[ROLLBACK] 대상 커밋: $PREV_HASH (HEAD~1)"

  # DB 백업 (롤백 전)
  local DB_SRC
  DB_SRC=$(grep -E "^DB_PATH=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
  DB_SRC="${DB_SRC:-$INSTALL_DIR/safety.db}"
  if [ -f "$DB_SRC" ]; then
    local STAMP
    STAMP=$(date '+%Y%m%d%H%M')
    local BACKUP_PATH="$INSTALL_DIR/backups/safety_${STAMP}_watchdog_rollback.db"
    mkdir -p "$INSTALL_DIR/backups"
    cp "$DB_SRC" "$BACKUP_PATH" 2>/dev/null \
      && log "[ROLLBACK] DB 백업: backups/safety_${STAMP}_watchdog_rollback.db" \
      || log "[ROLLBACK] DB 백업 실패 (무시)"
  fi

  # git reset --hard HEAD~1
  log "[ROLLBACK] git reset --hard HEAD~1 실행..."
  if ! git reset --hard HEAD~1 >> "$LOG_FILE" 2>&1; then
    log "[ROLLBACK] git reset 실패"
    return 1
  fi
  local NEW_HASH
  NEW_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  log "[ROLLBACK] git reset 완료: $CURRENT_HASH → $NEW_HASH"

  # npm run build
  local NPM_BIN
  NPM_BIN=$(find_npm)
  if [ -n "$NPM_BIN" ]; then
    log "[ROLLBACK] npm run build 시작 (최대 2분)..."
    if timeout 120 "$NPM_BIN" run build >> "$LOG_FILE" 2>&1; then
      log "[ROLLBACK] npm run build 완료 ✅"
    else
      log "[ROLLBACK] npm run build 실패 — 빌드 없이 재시작 시도"
    fi
  else
    log "[ROLLBACK] npm 없음 — 빌드 스킵"
  fi

  # PM2 재시작
  "$PM2_BIN" delete "$APP_NAME" 2>/dev/null || true
  cd "$INSTALL_DIR" || true
  PORT=$PORT "$PM2_BIN" start "$TSX_BIN" \
    --name "$APP_NAME" \
    --interpreter "$NODE_BIN" \
    --cwd "$INSTALL_DIR" \
    -- node-server.ts \
    >> "$LOG_FILE" 2>&1
  "$PM2_BIN" save 2>/dev/null || true

  sleep 8

  local FINAL_STATUS
  FINAL_STATUS=$("$PM2_BIN" describe "$APP_NAME" 2>/dev/null | grep -E "status" | head -1 | awk '{print $4}')
  if [ "$FINAL_STATUS" = "online" ]; then
    log "[ROLLBACK] ✅ 자동 롤백 성공! 현재 커밋: $NEW_HASH"
    reset_crash_count
    return 0
  else
    log "[ROLLBACK] ❌ 자동 롤백 후에도 서버 기동 실패 (상태: ${FINAL_STATUS:-없음})"
    return 1
  fi
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
    # ── 정상 동작 중 ─────────────────────────────────────────────────────
    reset_crash_count
    # 비상 복구 서버가 떠 있으면 종료
    if [ -f "$RECOVERY_PID_FILE" ]; then
      stop_recovery_server
      log "[OK] 서버 정상 복구됨 — 비상 복구 서버 종료"
    fi
    exit 0
  fi

  # ── 비정상 상태 감지 ─────────────────────────────────────────────────────
  local CRASH_COUNT
  CRASH_COUNT=$(read_crash_count)
  CRASH_COUNT=$(( CRASH_COUNT + 1 ))
  write_crash_count "$CRASH_COUNT"

  log "[WARN] $APP_NAME 상태: '${STATUS:-없음}' — crash #${CRASH_COUNT} 감지"

  # Node.js / tsx 확인
  local NODE_BIN TSX_BIN
  NODE_BIN=$(find_node)
  TSX_BIN=$(find_tsx)

  if [ -z "$NODE_BIN" ]; then
    log "[ERROR] Node.js 실행 파일을 찾을 수 없습니다."
    exit 1
  fi
  if [ -z "$TSX_BIN" ]; then
    log "[ERROR] tsx 실행 파일을 찾을 수 없습니다."
    exit 1
  fi

  # .env에서 PORT 읽기 (없으면 기본값 3443)
  local PORT=3443
  if [ -f "$INSTALL_DIR/.env" ]; then
    local ENV_PORT
    ENV_PORT=$(grep -E "^PORT=" "$INSTALL_DIR/.env" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -n "$ENV_PORT" ] && PORT="$ENV_PORT"
  fi

  # ── crash 임계값 미만: 일반 재시작 시도 ─────────────────────────────────
  if [ "$CRASH_COUNT" -lt "$CRASH_THRESHOLD" ]; then
    log "[WARN] 일반 재시작 시도 중... (${CRASH_COUNT}/${CRASH_THRESHOLD})"

    "$PM2_BIN" delete "$APP_NAME" 2>/dev/null || true
    cd "$INSTALL_DIR" || { log "[ERROR] cd $INSTALL_DIR 실패"; exit 1; }
    PORT=$PORT "$PM2_BIN" start "$TSX_BIN" \
      --name "$APP_NAME" \
      --interpreter "$NODE_BIN" \
      --cwd "$INSTALL_DIR" \
      -- node-server.ts \
      2>> "$LOG_FILE"
    "$PM2_BIN" save 2>/dev/null || true

    sleep 5
    local NEW_STATUS
    NEW_STATUS=$("$PM2_BIN" describe "$APP_NAME" 2>/dev/null | grep -E "status" | head -1 | awk '{print $4}')
    if [ "$NEW_STATUS" = "online" ]; then
      log "[OK] 재시작 성공 (PORT=$PORT)"
      reset_crash_count
    else
      log "[WARN] 재시작 실패 — 다음 watchdog 실행 시 재시도 (${CRASH_COUNT}/${CRASH_THRESHOLD})"
    fi
    return
  fi

  # ── crash 임계값 도달: 자동 git rollback 시도 ─────────────────────────
  log "[CRITICAL] crash ${CRASH_COUNT}회 도달 — 자동 git rollback 실행!"

  if auto_git_rollback "$PM2_BIN" "$NODE_BIN" "$TSX_BIN" "$PORT"; then
    # 롤백 성공 → 비상 복구 서버 불필요
    stop_recovery_server
  else
    # 롤백도 실패 → 비상 복구 서버 가동
    log "[CRITICAL] 자동 rollback 실패 — 비상 복구 서버 가동"
    write_crash_count "$CRASH_THRESHOLD"  # 카운터 임계값 유지 (재롤백 방지)
    start_recovery_server
  fi
}

# ─── 실행 ────────────────────────────────────────────────────────────────────
main "$@"
