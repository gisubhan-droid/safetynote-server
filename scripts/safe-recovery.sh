#!/bin/bash
# =============================================================================
# SafetyNOTE 비상 복구 웹서버 (safe-recovery.sh)
# FEAT-053b — SSH 없이 브라우저만으로 서버 복구
# =============================================================================
#
# 동작:
#   메인 서버(3443)가 완전히 죽어 브라우저 접속 불가한 상황에서
#   별도 포트(3444)로 간단한 복구 웹 페이지를 제공합니다.
#
# 기능:
#   1. git rollback   — 선택한 커밋으로 코드 복원 후 pm2 restart
#   2. DB 복원        — 선택한 DB 백업 파일로 DB 교체 후 pm2 restart
#   3. npm install    — node_modules 재설치 후 pm2 restart
#   4. pm2 재시작     — 단순 pm2 restart
#   5. 서버 로그 확인  — pm2 logs 최근 50줄
#
# 사용:
#   bash /volume1/safetynote/scripts/safe-recovery.sh [INSTALL_DIR] [PORT]
#   (watchdog이 자동 호출 — 직접 실행도 가능)
#
# 보안:
#   - .env 파일의 RECOVERY_PASSWORD 또는 기본 패스워드로 인증
#   - 로컬 NAS 네트워크에서만 접근 가능 (인터넷 노출 주의)
# =============================================================================

INSTALL_DIR="${1:-/volume1/safetynote}"
PORT="${2:-3444}"

# .env 에서 설정 읽기
ENV_FILE="$INSTALL_DIR/.env"
APP_PORT=3443
APP_NAME="safetynote"
RECOVERY_PASSWORD="recovery1234"   # 기본값 (변경 권장)

if [ -f "$ENV_FILE" ]; then
  _P=$(grep -E "^PORT=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '[:space:]')
  [ -n "$_P" ] && APP_PORT="$_P"
  _PW=$(grep -E "^RECOVERY_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '[:space:]')
  [ -n "$_PW" ] && RECOVERY_PASSWORD="$_PW"
  _AN=$(grep -E "^APP_NAME=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '[:space:]')
  [ -n "$_AN" ] && APP_NAME="$_AN"
fi

NODE_PATH="/volume1/@appstore/Node.js_v18/usr/local/bin"
export PATH="$NODE_PATH:/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_FILE="/var/log/safetynote-watchdog.log"

# ─── 경로 탐색 ───────────────────────────────────────────────────────────────
find_bin() {
  local name="$1"
  command -v "$name" 2>/dev/null \
    || [ -x "$NODE_PATH/$name" ] && echo "$NODE_PATH/$name" \
    || echo "$name"
}
PM2_BIN=$(find_bin pm2)
NODE_BIN=$(find_bin node)
NPM_BIN=$(find_bin npm)
for c in "$NODE_PATH/pm2" "/usr/local/bin/pm2" "$INSTALL_DIR/node_modules/.bin/pm2"; do
  [ -x "$c" ] && PM2_BIN="$c" && break
done
for c in "$NODE_PATH/npm" "/volume1/@appstore/Node.js_v20/usr/local/bin/npm" "/usr/local/bin/npm"; do
  [ -x "$c" ] && NPM_BIN="$c" && break
done
for c in "$NODE_PATH/node" "/usr/local/bin/node"; do
  [ -x "$c" ] && NODE_BIN="$c" && break
done
TSX_BIN="$INSTALL_DIR/node_modules/.bin/tsx"

# ─── 상태 수집 헬퍼 ─────────────────────────────────────────────────────────
get_pm2_status() {
  "$PM2_BIN" describe "$APP_NAME" 2>/dev/null | grep -E "status" | head -1 | awk '{print $4}' || echo "unknown"
}

get_current_commit() {
  git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

get_restart_count() {
  "$PM2_BIN" describe "$APP_NAME" 2>/dev/null | grep -E "restarts" | head -1 | awk '{print $4}' || echo "?"
}

get_recent_log() {
  "$PM2_BIN" logs "$APP_NAME" --nostream --lines 40 2>/dev/null \
    | tail -40 | sed 's/</\&lt;/g; s/>/\&gt;/g' | tr '\n' '\n' \
    || cat "$LOG_FILE" 2>/dev/null | tail -40 | sed 's/</\&lt;/g; s/>/\&gt;/g' \
    || echo "(로그 없음)"
}

get_commit_list() {
  git -C "$INSTALL_DIR" log --format='%h|%ad|%s' --date='format:%Y-%m-%d %H:%M' -15 2>/dev/null \
    | sed 's/</\&lt;/g; s/>/\&gt;/g' \
    || echo "커밋 목록 조회 실패"
}

get_backup_list() {
  ls -t "$INSTALL_DIR/backups/"*.db 2>/dev/null | head -15 | xargs -I{} basename {} 2>/dev/null || echo ""
}

# ─── HTML 생성 ───────────────────────────────────────────────────────────────
build_html() {
  local PM2_STATUS MSG_COLOR STATUS_ICON COMMITS BACKUPS RECENT_LOG CURRENT_COMMIT RESTARTS

  PM2_STATUS=$(get_pm2_status)
  CURRENT_COMMIT=$(get_current_commit)
  RESTARTS=$(get_restart_count)
  RECENT_LOG=$(get_recent_log)
  COMMITS=$(get_commit_list)
  BACKUPS=$(get_backup_list)

  if [ "$PM2_STATUS" = "online" ]; then
    MSG_COLOR="#16a34a"; STATUS_ICON="✅"
  elif [ "$PM2_STATUS" = "stopped" ] || [ "$PM2_STATUS" = "errored" ]; then
    MSG_COLOR="#dc2626"; STATUS_ICON="❌"
  else
    MSG_COLOR="#d97706"; STATUS_ICON="⚠️"
  fi

  # 커밋 목록 → <option> 태그
  local COMMIT_OPTIONS=""
  local FIRST=true
  while IFS='|' read -r hash date msg; do
    [ -z "$hash" ] && continue
    local SEL=""
    $FIRST && SEL=" selected" && FIRST=false
    COMMIT_OPTIONS="${COMMIT_OPTIONS}<option value=\"${hash}\"${SEL}>${hash} | ${date} | ${msg}</option>\n"
  done <<< "$COMMITS"

  # 백업 파일 목록 → <option> 태그
  local BACKUP_OPTIONS="<option value=\"\">-- 백업 파일 선택 --</option>"
  while IFS= read -r fname; do
    [ -z "$fname" ] && continue
    BACKUP_OPTIONS="${BACKUP_OPTIONS}<option value=\"${fname}\">${fname}</option>"
  done <<< "$BACKUPS"

  cat <<HTMLEOF
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SafetyNOTE 비상 복구</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:20px}
  .container{max-width:800px;margin:0 auto}
  .header{text-align:center;padding:24px 0 20px}
  .header h1{font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:6px}
  .header p{font-size:13px;color:#94a3b8}
  .status-card{background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:16px;border:1px solid #334155;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
  .status-badge{font-size:13px;font-weight:700;padding:4px 12px;border-radius:20px;background:#0f172a}
  .card{background:#1e293b;border-radius:12px;padding:20px;margin-bottom:14px;border:1px solid #334155}
  .card h2{font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:14px;display:flex;align-items:center;gap:8px}
  .form-row{display:flex;gap-8px;gap:8px;margin-bottom:10px;flex-wrap:wrap}
  .form-row label{font-size:12px;color:#94a3b8;display:block;margin-bottom:4px}
  select,input[type=password]{background:#0f172a;border:1px solid #475569;border-radius:8px;color:#e2e8f0;padding:8px 12px;font-size:13px;width:100%}
  input[type=password]{max-width:240px}
  .btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
  .btn-orange{background:#ea580c;color:#fff}.btn-orange:hover{background:#c2410c}
  .btn-red{background:#dc2626;color:#fff}.btn-red:hover{background:#b91c1c}
  .btn-blue{background:#2563eb;color:#fff}.btn-blue:hover{background:#1d4ed8}
  .btn-green{background:#16a34a;color:#fff}.btn-green:hover{background:#15803d}
  .btn-gray{background:#475569;color:#fff}.btn-gray:hover{background:#334155}
  .log-box{background:#020617;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#4ade80;max-height:280px;overflow-y:auto;white-space:pre-wrap;border:1px solid #1e3a5f;margin-top:10px;line-height:1.5}
  .divider{height:1px;background:#334155;margin:14px 0}
  .warn-box{background:#431407;border:1px solid #7c2d12;border-radius:8px;padding:10px 14px;font-size:12px;color:#fed7aa;margin-bottom:12px}
  .result-box{background:#0f172a;border-radius:8px;padding:10px 14px;font-size:12px;margin-top:10px;display:none;border:1px solid #334155}
  .flex-row{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
  select{flex:1;min-width:200px}
  @media(max-width:600px){.flex-row{flex-direction:column}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🚨 SafetyNOTE 비상 복구 페이지</h1>
    <p>메인 서버(포트 ${APP_PORT}) 접속 불가 시 이 페이지에서 복구합니다</p>
  </div>

  <!-- 현재 상태 -->
  <div class="status-card">
    <span style="font-size:22px">${STATUS_ICON}</span>
    <div style="flex:1">
      <div style="font-size:13px;color:#94a3b8">PM2 프로세스 상태</div>
      <div style="font-size:18px;font-weight:700;color:${MSG_COLOR}">${PM2_STATUS}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:12px;color:#64748b">현재 커밋</div>
      <div style="font-family:monospace;color:#7dd3fc">${CURRENT_COMMIT}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">재시작 ${RESTARTS}회</div>
    </div>
  </div>

  <!-- 인증 -->
  <div class="card">
    <h2>🔑 인증</h2>
    <div class="flex-row">
      <div style="flex:1">
        <label>복구 비밀번호 (.env의 RECOVERY_PASSWORD)</label>
        <input type="password" id="pw" placeholder="recovery1234 (기본값)" autocomplete="current-password">
      </div>
    </div>
    <p style="font-size:11px;color:#64748b;margin-top:8px">⚠️ 이 페이지는 같은 네트워크에서만 접근 가능합니다. 작업 완료 후 메인 서버가 정상화되면 자동으로 닫힙니다.</p>
  </div>

  <!-- 빠른 복구 -->
  <div class="card">
    <h2>⚡ 빠른 복구</h2>
    <div class="flex-row" style="margin-bottom:8px">
      <button class="btn btn-green" onclick="doAction('restart')">▶ PM2 재시작</button>
      <button class="btn btn-blue" onclick="doAction('npm_install')">📦 npm install + 재시작</button>
    </div>
    <p style="font-size:11px;color:#94a3b8">PM2 재시작: 코드 변경 없이 서버만 재시작 | npm install: 패키지 mismatch 오류 시</p>
    <div class="result-box" id="result-quick"></div>
  </div>

  <!-- 커밋 롤백 -->
  <div class="card">
    <h2>🔄 버전 롤백 (코드)</h2>
    <div class="warn-box">⚠️ 선택한 커밋으로 소스 코드를 되돌립니다. DB 데이터는 유지됩니다.</div>
    <div class="flex-row">
      <select id="sel-commit">\n${COMMIT_OPTIONS}</select>
      <button class="btn btn-orange" onclick="doAction('rollback')">↩ 롤백 실행</button>
    </div>
    <div class="result-box" id="result-rollback"></div>
  </div>

  <!-- DB 복원 -->
  <div class="card">
    <h2>🗄️ DB 백업 복원</h2>
    <div class="warn-box">🔴 복원 이후의 <b>모든 데이터(공사·작업·보고서 등)가 삭제</b>됩니다. 현재 DB는 자동 저장됩니다.</div>
    <div class="flex-row">
      <select id="sel-backup">${BACKUP_OPTIONS}</select>
      <button class="btn btn-red" onclick="doAction('restore_db')">🗄️ DB 복원</button>
    </div>
    <div class="result-box" id="result-db"></div>
  </div>

  <!-- 서버 로그 -->
  <div class="card">
    <h2>📋 서버 로그 (최근 40줄)</h2>
    <button class="btn btn-gray" onclick="loadLog()" style="margin-bottom:8px">🔄 새로고침</button>
    <div class="log-box" id="log-box">${RECENT_LOG}</div>
  </div>

  <p style="text-align:center;font-size:11px;color:#475569;padding:16px 0">
    SafetyNOTE 비상 복구 서버 | 포트 ${PORT} | 메인 서버 정상화 시 자동 종료
  </p>
</div>

<script>
async function doAction(action) {
  const pw = document.getElementById('pw').value.trim();
  if (!pw) { alert('비밀번호를 입력하세요'); return; }

  let extra = {};
  if (action === 'rollback') {
    const h = document.getElementById('sel-commit')?.value;
    if (!h) { alert('롤백할 커밋을 선택하세요'); return; }
    extra.target_hash = h;
    if (!confirm(h + ' 커밋으로 롤백합니다. 계속하시겠습니까?')) return;
  }
  if (action === 'restore_db') {
    const f = document.getElementById('sel-backup')?.value;
    if (!f) { alert('복원할 백업 파일을 선택하세요'); return; }
    extra.filename = f;
    if (!confirm(f + ' 파일로 DB를 복원합니다.\n복원 이후의 모든 데이터가 삭제됩니다.\n계속하시겠습니까?')) return;
  }

  const resultId = action === 'rollback' ? 'result-rollback'
    : action === 'restore_db' ? 'result-db' : 'result-quick';
  const resultEl = document.getElementById(resultId);
  resultEl.style.display = 'block';
  resultEl.style.color = '#94a3b8';
  resultEl.textContent = '⏳ 실행 중... (최대 2분 소요, 페이지를 닫지 마세요)';

  try {
    const res = await fetch('/action', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action, password: pw, ...extra })
    });
    const data = await res.json();
    if (data.ok) {
      resultEl.style.color = '#4ade80';
      resultEl.textContent = '✅ ' + data.message;
      if (action === 'restart' || data.restart) {
        setTimeout(() => {
          resultEl.textContent += '\n\n잠시 후 메인 서버 접속을 시도합니다...';
          setTimeout(() => { window.location.href = 'http://' + location.hostname + ':${APP_PORT}'; }, 5000);
        }, 2000);
      }
    } else {
      resultEl.style.color = '#f87171';
      resultEl.textContent = '❌ ' + (data.error || '실패');
    }
  } catch(e) {
    resultEl.style.color = '#f87171';
    resultEl.textContent = '❌ 요청 실패: ' + e.message;
  }
}

async function loadLog() {
  const res = await fetch('/log').catch(() => null);
  if (!res) return;
  const t = await res.text();
  document.getElementById('log-box').textContent = t;
  document.getElementById('log-box').scrollTop = 9999;
}
</script>
</body>
</html>
HTMLEOF
}

# ─── 액션 처리 ───────────────────────────────────────────────────────────────
do_action() {
  local action="$1"
  local password="$2"
  local extra="$3"   # JSON-like string: "key=value"

  # 비밀번호 검증
  if [ "$password" != "$RECOVERY_PASSWORD" ]; then
    echo '{"ok":false,"error":"비밀번호가 올바르지 않습니다."}'
    return
  fi

  local RESULT=""
  local OK=true

  case "$action" in
    restart)
      # 단순 PM2 재시작
      "$PM2_BIN" restart "$APP_NAME" >> "$LOG_FILE" 2>&1 && RESULT="PM2 재시작 완료" || {
        # restart 실패 시 delete + start
        "$PM2_BIN" delete "$APP_NAME" 2>/dev/null || true
        cd "$INSTALL_DIR"
        local ENV_PORT=3443
        local _P; _P=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
        [ -n "$_P" ] && ENV_PORT="$_P"
        PORT=$ENV_PORT "$PM2_BIN" start "$TSX_BIN" \
          --name "$APP_NAME" \
          --interpreter "$NODE_BIN" \
          --cwd "$INSTALL_DIR" \
          -- node-server.ts >> "$LOG_FILE" 2>&1 \
          && RESULT="PM2 재등록 후 시작 완료" \
          || { OK=false; RESULT="PM2 시작 실패 — 로그를 확인하세요"; }
      }
      ;;

    npm_install)
      cd "$INSTALL_DIR" || { OK=false; RESULT="디렉토리 이동 실패"; break; }
      "$NPM_BIN" install --production >> "$LOG_FILE" 2>&1 \
        && RESULT="npm install 완료" \
        || { OK=false; RESULT="npm install 실패"; }
      if $OK; then
        "$PM2_BIN" restart "$APP_NAME" >> "$LOG_FILE" 2>&1 \
          && RESULT="$RESULT + PM2 재시작 완료" \
          || RESULT="$RESULT (PM2 재시작 실패)"
      fi
      ;;

    rollback)
      local TARGET_HASH
      TARGET_HASH=$(echo "$extra" | sed 's/.*target_hash=//;s/ .*//')
      if [ -z "$TARGET_HASH" ] || ! echo "$TARGET_HASH" | grep -qE '^[a-f0-9]{4,40}$'; then
        OK=false; RESULT="유효하지 않은 커밋 해시"
        break
      fi
      cd "$INSTALL_DIR" || { OK=false; RESULT="디렉토리 이동 실패"; break; }

      # DB 백업
      local DB_SRC; DB_SRC=$(grep -E "^DB_PATH=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
      DB_SRC="${DB_SRC:-$INSTALL_DIR/safety.db}"
      if [ -f "$DB_SRC" ]; then
        local STAMP; STAMP=$(date '+%Y%m%d%H%M')
        mkdir -p "$INSTALL_DIR/backups"
        cp "$DB_SRC" "$INSTALL_DIR/backups/safety_${STAMP}_before_recovery_rollback.db" 2>/dev/null || true
      fi

      git reset --hard "$TARGET_HASH" >> "$LOG_FILE" 2>&1 \
        && RESULT="git reset → $TARGET_HASH 완료" \
        || { OK=false; RESULT="git reset 실패"; }

      if $OK; then
        # npm run build
        timeout 120 "$NPM_BIN" run build >> "$LOG_FILE" 2>&1 \
          && RESULT="$RESULT | build 완료" \
          || RESULT="$RESULT | build 실패(재시작 시도)"
        sleep 2
        "$PM2_BIN" delete "$APP_NAME" 2>/dev/null || true
        local ENV_PORT=3443
        local _P2; _P2=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
        [ -n "$_P2" ] && ENV_PORT="$_P2"
        PORT=$ENV_PORT "$PM2_BIN" start "$TSX_BIN" \
          --name "$APP_NAME" \
          --interpreter "$NODE_BIN" \
          --cwd "$INSTALL_DIR" \
          -- node-server.ts >> "$LOG_FILE" 2>&1 \
          && RESULT="$RESULT | PM2 시작 완료 ✅" \
          || { OK=false; RESULT="$RESULT | PM2 시작 실패"; }
      fi
      ;;

    restore_db)
      local FILENAME
      FILENAME=$(echo "$extra" | sed 's/.*filename=//;s/ .*//')
      # 경로 탐색 방지
      if [ -z "$FILENAME" ] || echo "$FILENAME" | grep -q '[/\\]' || ! echo "$FILENAME" | grep -q '\.db$'; then
        OK=false; RESULT="유효하지 않은 파일명"
        break
      fi
      local SRC_PATH="$INSTALL_DIR/backups/$FILENAME"
      if [ ! -f "$SRC_PATH" ]; then
        OK=false; RESULT="백업 파일을 찾을 수 없습니다: $FILENAME"
        break
      fi
      local DB_DEST; DB_DEST=$(grep -E "^DB_PATH=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
      DB_DEST="${DB_DEST:-$INSTALL_DIR/safety.db}"

      # 현재 DB 임시 저장
      local STAMP2; STAMP2=$(date '+%Y%m%d%H%M')
      if [ -f "$DB_DEST" ]; then
        cp "$DB_DEST" "$INSTALL_DIR/backups/safety_${STAMP2}_before_recovery_restore.db" 2>/dev/null || true
      fi

      cp "$SRC_PATH" "$DB_DEST" 2>/dev/null \
        && RESULT="DB 복원 완료: $FILENAME" \
        || { OK=false; RESULT="DB 복원 실패"; }

      if $OK; then
        "$PM2_BIN" restart "$APP_NAME" >> "$LOG_FILE" 2>&1 \
          && RESULT="$RESULT | PM2 재시작 완료 ✅" \
          || RESULT="$RESULT | PM2 재시작 실패"
      fi
      ;;

    *)
      OK=false; RESULT="알 수 없는 액션"
      ;;
  esac

  if $OK; then
    echo "{\"ok\":true,\"message\":\"${RESULT}\",\"restart\":true}"
  else
    echo "{\"ok\":false,\"error\":\"${RESULT}\"}"
  fi
}

# ─── 간이 HTTP 서버 (netcat 또는 python3 사용) ───────────────────────────────
start_http_server() {
  log_file_ref="$LOG_FILE"

  # Python3 선호 (더 안정적)
  if command -v python3 &>/dev/null; then
    python3 - <<PYEOF
import http.server, json, subprocess, os, sys, urllib.parse

INSTALL_DIR = "$INSTALL_DIR"
PORT = $PORT
RECOVERY_PASSWORD = "$RECOVERY_PASSWORD"
APP_NAME = "$APP_NAME"
APP_PORT = $APP_PORT
ENV_FILE = "$ENV_FILE"
PM2_BIN  = "$PM2_BIN"
NODE_BIN = "$NODE_BIN"
NPM_BIN  = "$NPM_BIN"
TSX_BIN  = "$TSX_BIN"
LOG_FILE = "$LOG_FILE"

def run(cmd, cwd=INSTALL_DIR, timeout=180):
    try:
        r = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        return -1, "TIMEOUT"
    except Exception as e:
        return -1, str(e)

def get_pm2_status():
    _, out = run(f"{PM2_BIN} describe {APP_NAME}")
    for l in out.splitlines():
        if "status" in l.lower():
            parts = l.split()
            if len(parts) >= 4:
                return parts[3]
    return "unknown"

def get_current_commit():
    _, out = run("git rev-parse --short HEAD", cwd=INSTALL_DIR)
    return out.strip() or "unknown"

def get_commit_list():
    _, out = run("git log --format='%h|%ad|%s' --date='format:%Y-%m-%d %H:%M' -15", cwd=INSTALL_DIR)
    return out.strip()

def get_backup_list():
    bdir = os.path.join(INSTALL_DIR, "backups")
    if not os.path.isdir(bdir):
        return []
    files = [f for f in os.listdir(bdir) if f.endswith(".db")]
    files.sort(reverse=True)
    return files[:15]

def get_recent_log():
    try:
        with open(LOG_FILE, "r") as f:
            lines = f.readlines()[-50:]
        return "".join(lines).replace("<","&lt;").replace(">","&gt;")
    except:
        return "(로그 없음)"

def do_restart():
    code, out = run(f"{PM2_BIN} restart {APP_NAME}")
    if code == 0:
        return True, "PM2 재시작 완료"
    # 재시작 실패 → delete + start
    env_port = "3443"
    try:
        with open(ENV_FILE) as f:
            for l in f:
                if l.startswith("PORT="):
                    env_port = l.split("=",1)[1].strip()
    except: pass
    os.environ["PORT"] = env_port
    code2, out2 = run(
        f"PORT={env_port} {PM2_BIN} delete {APP_NAME} ; "
        f"cd {INSTALL_DIR} && PORT={env_port} {PM2_BIN} start {TSX_BIN} "
        f"--name {APP_NAME} --interpreter {NODE_BIN} --cwd {INSTALL_DIR} -- node-server.ts"
    )
    ok2 = code2 == 0
    return ok2, ("PM2 재등록 완료" if ok2 else f"PM2 시작 실패: {out2[:200]}")

def build_page():
    pm2s = get_pm2_status()
    commit = get_current_commit()
    commits = get_commit_list()
    backups = get_backup_list()
    log_text = get_recent_log()

    status_color = "#16a34a" if pm2s == "online" else "#dc2626" if pm2s in ("stopped","errored") else "#d97706"
    status_icon  = "✅" if pm2s == "online" else "❌" if pm2s in ("stopped","errored") else "⚠️"

    commit_opts = ""
    first = True
    for line in commits.splitlines():
        if not line.strip(): continue
        parts = line.split("|", 2)
        if len(parts) < 3: continue
        h, d, m = parts[0].strip(), parts[1].strip(), parts[2].strip()
        sel = " selected" if first else ""
        first = False
        commit_opts += f'<option value="{h}"{sel}>{h} | {d} | {m[:60]}</option>\n'

    backup_opts = '<option value="">-- 백업 파일 선택 --</option>'
    for f in backups:
        backup_opts += f'<option value="{f}">{f}</option>'

    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SafetyNOTE 비상 복구</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:20px}}
.container{{max-width:800px;margin:0 auto}}
.header{{text-align:center;padding:24px 0 20px}}
.header h1{{font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:6px}}
.header p{{font-size:13px;color:#94a3b8}}
.status-card{{background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:16px;border:1px solid #334155;display:flex;gap:16px;align-items:center;flex-wrap:wrap}}
.card{{background:#1e293b;border-radius:12px;padding:20px;margin-bottom:14px;border:1px solid #334155}}
.card h2{{font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:14px}}
select,input[type=password]{{background:#0f172a;border:1px solid #475569;border-radius:8px;color:#e2e8f0;padding:8px 12px;font-size:13px;width:100%}}
input[type=password]{{max-width:260px}}
.btn{{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;margin-right:8px;margin-top:6px}}
.btn-orange{{background:#ea580c;color:#fff}}.btn-red{{background:#dc2626;color:#fff}}
.btn-blue{{background:#2563eb;color:#fff}}.btn-green{{background:#16a34a;color:#fff}}
.btn-gray{{background:#475569;color:#fff}}
.log-box{{background:#020617;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#4ade80;max-height:280px;overflow-y:auto;white-space:pre-wrap;border:1px solid #1e3a5f;margin-top:10px;line-height:1.5}}
.warn-box{{background:#431407;border:1px solid #7c2d12;border-radius:8px;padding:10px 14px;font-size:12px;color:#fed7aa;margin-bottom:12px}}
.result-box{{background:#0f172a;border-radius:8px;padding:10px 14px;font-size:12px;margin-top:10px;display:none;border:1px solid #334155;white-space:pre-wrap}}
.flex-row{{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px}}
.flex-row select{{flex:1;min-width:200px}}
</style></head><body>
<div class="container">
<div class="header"><h1>🚨 SafetyNOTE 비상 복구 페이지</h1>
<p>메인 서버(포트 {APP_PORT}) 접속 불가 시 이 페이지에서 복구합니다</p></div>

<div class="status-card">
  <span style="font-size:22px">{status_icon}</span>
  <div style="flex:1">
    <div style="font-size:13px;color:#94a3b8">PM2 프로세스 상태</div>
    <div style="font-size:18px;font-weight:700;color:{status_color}">{pm2s}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:12px;color:#64748b">현재 커밋</div>
    <div style="font-family:monospace;color:#7dd3fc">{commit}</div>
  </div>
</div>

<div class="card"><h2>🔑 인증</h2>
  <input type="password" id="pw" placeholder="복구 비밀번호 (기본: recovery1234)">
  <p style="font-size:11px;color:#64748b;margin-top:8px">⚠️ .env 파일의 RECOVERY_PASSWORD 값을 사용합니다</p>
</div>

<div class="card"><h2>⚡ 빠른 복구</h2>
  <button class="btn btn-green" onclick="act('restart')">▶ PM2 재시작</button>
  <button class="btn btn-blue" onclick="act('npm_install')">📦 npm install + 재시작</button>
  <div class="result-box" id="r-quick"></div>
</div>

<div class="card"><h2>🔄 버전 롤백 (코드)</h2>
  <div class="warn-box">⚠️ 선택한 커밋으로 소스를 되돌립니다. DB 데이터는 유지됩니다.</div>
  <div class="flex-row">
    <select id="sel-commit">{commit_opts}</select>
    <button class="btn btn-orange" onclick="act('rollback')">↩ 롤백</button>
  </div>
  <div class="result-box" id="r-rollback"></div>
</div>

<div class="card"><h2>🗄️ DB 백업 복원</h2>
  <div class="warn-box">🔴 복원 이후의 <b>모든 데이터가 삭제</b>됩니다. 현재 DB는 자동 저장됩니다.</div>
  <div class="flex-row">
    <select id="sel-backup">{backup_opts}</select>
    <button class="btn btn-red" onclick="act('restore_db')">🗄️ DB 복원</button>
  </div>
  <div class="result-box" id="r-db"></div>
</div>

<div class="card"><h2>📋 서버 로그</h2>
  <button class="btn btn-gray" onclick="loadLog()">🔄 새로고침</button>
  <div class="log-box" id="log-box">{log_text}</div>
</div>

<p style="text-align:center;font-size:11px;color:#475569;padding:16px 0">
  SafetyNOTE 비상 복구 | 포트 {PORT} | 메인 서버 정상화 시 자동 종료
</p></div>

<script>
async function act(action){{
  const pw=document.getElementById('pw').value.trim();
  if(!pw){{alert('비밀번호를 입력하세요');return;}}
  let body={{action,password:pw}};
  if(action==='rollback'){{
    const h=document.getElementById('sel-commit')?.value;
    if(!h){{alert('커밋을 선택하세요');return;}}
    if(!confirm(h+' 커밋으로 롤백합니다. 계속?'))return;
    body.target_hash=h;
  }}
  if(action==='restore_db'){{
    const f=document.getElementById('sel-backup')?.value;
    if(!f){{alert('백업 파일을 선택하세요');return;}}
    if(!confirm(f+' 파일로 DB 복원합니다.\\n이후 데이터가 삭제됩니다. 계속?'))return;
    body.filename=f;
  }}
  const rid=action==='rollback'?'r-rollback':action==='restore_db'?'r-db':'r-quick';
  const el=document.getElementById(rid);
  el.style.display='block';el.style.color='#94a3b8';
  el.textContent='⏳ 실행 중... (최대 2분, 페이지 닫지 마세요)';
  try{{
    const res=await fetch('/action',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(body)}});
    const d=await res.json();
    if(d.ok){{el.style.color='#4ade80';el.textContent='✅ '+d.message;
      setTimeout(()=>{{el.textContent+='\\n\\n5초 후 메인 서버 접속 시도...';
        setTimeout(()=>{{window.location.href='http://'+location.hostname+':{APP_PORT}';}},5000);}},2000);
    }}else{{el.style.color='#f87171';el.textContent='❌ '+(d.error||'실패');}}
  }}catch(e){{el.style.color='#f87171';el.textContent='❌ '+e.message;}}
}}
async function loadLog(){{
  const r=await fetch('/log').catch(()=>null);if(!r)return;
  const t=await r.text();const b=document.getElementById('log-box');
  b.textContent=t;b.scrollTop=9999;
}}
</script></body></html>"""

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass  # 액세스 로그 억제

    def do_GET(self):
        if self.path == "/log":
            body = get_recent_log().encode()
            self.send_response(200)
            self.send_header("Content-Type","text/plain;charset=utf-8")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            body = build_page().encode()
            self.send_response(200)
            self.send_header("Content-Type","text/html;charset=utf-8")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def do_POST(self):
        if self.path != "/action":
            self.send_response(404); self.end_headers(); return
        length = int(self.headers.get("Content-Length",0))
        data   = json.loads(self.rfile.read(length))
        action = data.get("action","")
        pw     = data.get("password","")

        if pw != RECOVERY_PASSWORD:
            resp = json.dumps({"ok":False,"error":"비밀번호가 올바르지 않습니다."}).encode()
            self.send_response(403); self.send_header("Content-Type","application/json")
            self.send_header("Content-Length",str(len(resp))); self.end_headers(); self.wfile.write(resp); return

        ok, msg = False, "알 수 없는 액션"

        if action == "restart":
            ok, msg = do_restart()

        elif action == "npm_install":
            code, out = run(f"cd {INSTALL_DIR} && {NPM_BIN} install --production")
            if code == 0:
                ok2, msg2 = do_restart()
                ok, msg = ok2, f"npm install 완료 | {msg2}"
            else:
                ok, msg = False, f"npm install 실패: {out[:300]}"

        elif action == "rollback":
            th = data.get("target_hash","").strip()
            import re
            if not th or not re.match(r'^[a-f0-9]{4,40}$', th):
                ok, msg = False, "유효하지 않은 커밋 해시"
            else:
                # DB 백업
                db_src = INSTALL_DIR + "/safety.db"
                try:
                    with open(ENV_FILE) as f:
                        for l in f:
                            if l.startswith("DB_PATH="):
                                db_src = l.split("=",1)[1].strip()
                except: pass
                if os.path.isfile(db_src):
                    import time; stamp = time.strftime("%Y%m%d%H%M")
                    os.makedirs(INSTALL_DIR+"/backups", exist_ok=True)
                    try: import shutil; shutil.copy2(db_src, f"{INSTALL_DIR}/backups/safety_{stamp}_before_recovery_rollback.db")
                    except: pass
                code1, _ = run(f"cd {INSTALL_DIR} && git reset --hard {th}")
                if code1 != 0:
                    ok, msg = False, f"git reset 실패"
                else:
                    run(f"cd {INSTALL_DIR} && {NPM_BIN} run build", timeout=120)
                    ok2, msg2 = do_restart()
                    ok, msg = ok2, f"롤백 → {th} 완료 | {msg2}"

        elif action == "restore_db":
            fname = data.get("filename","").strip()
            import re
            if not fname or "/" in fname or "\\" in fname or not fname.endswith(".db"):
                ok, msg = False, "유효하지 않은 파일명"
            else:
                src = os.path.join(INSTALL_DIR, "backups", fname)
                if not os.path.isfile(src):
                    ok, msg = False, f"파일 없음: {fname}"
                else:
                    db_dest = INSTALL_DIR + "/safety.db"
                    try:
                        with open(ENV_FILE) as f:
                            for l in f:
                                if l.startswith("DB_PATH="):
                                    db_dest = l.split("=",1)[1].strip()
                    except: pass
                    import time; stamp = time.strftime("%Y%m%d%H%M")
                    if os.path.isfile(db_dest):
                        try:
                            import shutil; shutil.copy2(db_dest, f"{INSTALL_DIR}/backups/safety_{stamp}_before_recovery_restore.db")
                        except: pass
                    try:
                        import shutil; shutil.copy2(src, db_dest)
                        ok2, msg2 = do_restart()
                        ok, msg = ok2, f"DB 복원 완료: {fname} | {msg2}"
                    except Exception as e:
                        ok, msg = False, f"DB 복원 실패: {e}"

        resp = json.dumps({"ok":ok,"message":msg if ok else "","error":msg if not ok else ""}).encode()
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

import socketserver
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    with open("$LOG_FILE","a") as lf:
        lf.write(f"[safe-recovery] Python3 HTTP 서버 시작 (포트 {PORT})\n")
    httpd.serve_forever()
PYEOF
    exit 0
  fi

  # Python3 없을 경우 — 안내 메시지만 로그에 기록
  echo "[safe-recovery] python3 없음 — 비상 복구 서버를 시작할 수 없습니다." >> "$LOG_FILE"
  echo "[safe-recovery] Synology DSM: Python3 패키지를 패키지 센터에서 설치하세요." >> "$LOG_FILE"
  exit 1
}

# ─── 실행 ────────────────────────────────────────────────────────────────────
start_http_server
