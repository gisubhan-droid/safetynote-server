#!/bin/bash
# =============================================================================
# SafetyNOTE 비상 복구 서버 — 독립 실행 버전 (standalone)
# FIX-055: watchdog 없이 DSM 작업 스케줄러에서 직접 실행 가능
# =============================================================================
#
# 사용법:
#   bash /volume1/safetynote/scripts/safe-recovery-standalone.sh [INSTALL_DIR] [PORT]
#
# DSM 작업 스케줄러 등록 예시:
#   작업 이름: SafetyNOTE 비상복구 서버 시작
#   사용자   : root
#   반복     : 실행 안 함 (수동 실행용)
#   스크립트 :
#     bash /volume1/safetynote/scripts/safe-recovery-standalone.sh
#
# 특징:
#   - 메인 서버(3443) 정상 여부에 상관없이 항상 실행 가능
#   - 이미 실행 중이면 기존 프로세스 종료 후 재시작
#   - Python3 우선 / 없으면 Node.js HTTP 서버로 자동 전환
#   - 포트 3445 (기본값, 두 번째 인자로 변경 가능)
#   - 실행 후 접속: http://NAS_IP:3445
# =============================================================================

INSTALL_DIR="${1:-/volume1/safetynote}"
PORT="${2:-3445}"

# ─── 기본 설정 ────────────────────────────────────────────────────────────────
NODE_PATH_V18="/volume1/@appstore/Node.js_v18/usr/local/bin"
NODE_PATH_V20="/volume1/@appstore/Node.js_v20/usr/local/bin"
export PATH="$NODE_PATH_V18:$NODE_PATH_V20:/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_FILE="/var/log/safetynote-watchdog.log"
PID_FILE="/var/run/safetynote-recovery.pid"
ENV_FILE="$INSTALL_DIR/.env"

RECOVERY_PASSWORD="recovery1234"
APP_NAME="safetynote"
APP_PORT=3443

# .env 에서 설정 읽기
if [ -f "$ENV_FILE" ]; then
  _P=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
  [ -n "$_P" ] && APP_PORT="$_P"
  _PW=$(grep -E "^RECOVERY_PASSWORD=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
  [ -n "$_PW" ] && RECOVERY_PASSWORD="$_PW"
  _AN=$(grep -E "^APP_NAME=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
  [ -n "$_AN" ] && APP_NAME="$_AN"
fi

# ─── 로그 함수 ───────────────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [standalone] $1" | tee -a "$LOG_FILE"
}

# ─── 이전 인스턴스 정리 ──────────────────────────────────────────────────────
cleanup_previous() {
  # PID 파일로 이전 프로세스 종료
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      log "이전 비상 복구 서버 종료 중 (PID=$OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$PID_FILE"
  fi
  # 포트 직접 정리
  if command -v fuser &>/dev/null; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
    sleep 1
  fi
}

# ─── PM2 바이너리 찾기 ───────────────────────────────────────────────────────
find_pm2() {
  for p in \
    "$NODE_PATH_V18/pm2" \
    "$NODE_PATH_V20/pm2" \
    "/usr/local/bin/pm2" \
    "$INSTALL_DIR/node_modules/.bin/pm2"; do
    [ -x "$p" ] && echo "$p" && return
  done
  command -v pm2 2>/dev/null && echo "pm2" && return
  echo ""
}

# ─── Node.js 바이너리 찾기 ───────────────────────────────────────────────────
find_node() {
  for p in \
    "$NODE_PATH_V18/node" \
    "$NODE_PATH_V20/node" \
    "/usr/local/bin/node"; do
    [ -x "$p" ] && echo "$p" && return
  done
  command -v node 2>/dev/null && echo "node" && return
  echo ""
}

# ─── tsx 바이너리 찾기 ───────────────────────────────────────────────────────
find_tsx() {
  for p in \
    "$INSTALL_DIR/node_modules/.bin/tsx" \
    "$NODE_PATH_V18/tsx" \
    "/usr/local/bin/tsx"; do
    [ -x "$p" ] && echo "$p" && return
  done
  echo ""
}

# ─── npm 바이너리 찾기 ───────────────────────────────────────────────────────
find_npm() {
  for p in \
    "$NODE_PATH_V18/npm" \
    "$NODE_PATH_V20/npm" \
    "/usr/local/bin/npm"; do
    [ -x "$p" ] && echo "$p" && return
  done
  command -v npm 2>/dev/null && echo "npm" && return
  echo ""
}

PM2_BIN=$(find_pm2)
NODE_BIN=$(find_node)
TSX_BIN=$(find_tsx)
NPM_BIN=$(find_npm)

# ─── Python3 서버 실행 ───────────────────────────────────────────────────────
start_python3_server() {
  log "Python3 HTTP 서버 시작 중 (PORT=$PORT)..."

  python3 - <<PYEOF &
import http.server, json, subprocess, os, sys, re, time, shutil
import socketserver

INSTALL_DIR = "$INSTALL_DIR"
PORT        = $PORT
RECOVERY_PASSWORD = "$RECOVERY_PASSWORD"
APP_NAME    = "$APP_NAME"
APP_PORT    = $APP_PORT
ENV_FILE    = "$ENV_FILE"
PM2_BIN     = "$PM2_BIN"
NODE_BIN    = "$NODE_BIN"
NPM_BIN     = "$NPM_BIN"
TSX_BIN     = "$TSX_BIN"
LOG_FILE    = "$LOG_FILE"

def run(cmd, cwd=INSTALL_DIR, timeout=180):
    try:
        r = subprocess.run(cmd, shell=True, cwd=cwd,
                           capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        return -1, "TIMEOUT"
    except Exception as e:
        return -1, str(e)

def get_pm2_status():
    if not PM2_BIN: return "pm2_not_found"
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

def get_restart_count():
    if not PM2_BIN: return "?"
    _, out = run(f"{PM2_BIN} describe {APP_NAME}")
    for l in out.splitlines():
        if "restart" in l.lower():
            parts = l.split()
            if len(parts) >= 4:
                return parts[3]
    return "?"

def get_commit_list():
    _, out = run(
        "git log --format='%h|%ad|%s' --date='format:%Y-%m-%d %H:%M' -15",
        cwd=INSTALL_DIR
    )
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
        with open(LOG_FILE, "r", errors="replace") as f:
            lines = f.readlines()[-60:]
        return "".join(lines).replace("<","&lt;").replace(">","&gt;")
    except:
        return "(로그 없음)"

def do_restart():
    if not PM2_BIN:
        return False, "PM2를 찾을 수 없습니다"
    code, out = run(f"{PM2_BIN} restart {APP_NAME}")
    if code == 0:
        return True, "PM2 재시작 완료"
    env_port = "3443"
    try:
        with open(ENV_FILE) as f:
            for l in f:
                if l.startswith("PORT="):
                    env_port = l.split("=",1)[1].strip()
    except: pass
    run(f"{PM2_BIN} delete {APP_NAME}")
    code2, out2 = run(
        f"PORT={env_port} {PM2_BIN} start {TSX_BIN} "
        f"--name {APP_NAME} --interpreter {NODE_BIN} "
        f"--cwd {INSTALL_DIR} -- node-server.ts"
    )
    ok2 = code2 == 0
    return ok2, ("PM2 재등록 완료" if ok2 else f"PM2 시작 실패: {out2[:200]}")

def build_page():
    pm2s    = get_pm2_status()
    commit  = get_current_commit()
    restarts = get_restart_count()
    commits = get_commit_list()
    backups = get_backup_list()
    log_txt = get_recent_log()

    sc = "#16a34a" if pm2s=="online" else "#dc2626" if pm2s in ("stopped","errored") else "#d97706"
    si = "✅" if pm2s=="online" else "❌" if pm2s in ("stopped","errored") else "⚠️"

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
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SafetyNOTE 비상 복구</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:20px}}
.container{{max-width:820px;margin:0 auto}}
.header{{text-align:center;padding:24px 0 20px}}
.header h1{{font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:6px}}
.header p{{font-size:13px;color:#94a3b8}}
.status-card{{background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:14px;border:1px solid #334155;display:flex;gap:14px;align-items:center;flex-wrap:wrap}}
.card{{background:#1e293b;border-radius:12px;padding:20px;margin-bottom:14px;border:1px solid #334155}}
.card h2{{font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:14px}}
select,input[type=password]{{background:#0f172a;border:1px solid #475569;border-radius:8px;color:#e2e8f0;padding:8px 12px;font-size:13px;width:100%}}
input[type=password]{{max-width:280px}}
.btn{{display:inline-flex;align-items:center;gap:5px;padding:9px 16px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;margin-right:6px;margin-top:6px;transition:.15s}}
.btn-orange{{background:#ea580c;color:#fff}}.btn-orange:hover{{background:#c2410c}}
.btn-red{{background:#dc2626;color:#fff}}.btn-red:hover{{background:#b91c1c}}
.btn-blue{{background:#2563eb;color:#fff}}.btn-blue:hover{{background:#1d4ed8}}
.btn-green{{background:#16a34a;color:#fff}}.btn-green:hover{{background:#15803d}}
.btn-gray{{background:#475569;color:#fff}}.btn-gray:hover{{background:#334155}}
.log-box{{background:#020617;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#4ade80;max-height:300px;overflow-y:auto;white-space:pre-wrap;border:1px solid #1e3a5f;margin-top:10px;line-height:1.5}}
.warn-box{{background:#431407;border:1px solid #7c2d12;border-radius:8px;padding:10px 14px;font-size:12px;color:#fed7aa;margin-bottom:12px}}
.result-box{{background:#0f172a;border-radius:8px;padding:10px 14px;font-size:12px;margin-top:10px;display:none;border:1px solid #334155;white-space:pre-wrap;word-break:break-all}}
.flex-row{{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px}}
.flex-row select{{flex:1;min-width:180px}}
.badge-standalone{{background:#7c3aed;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;margin-left:8px}}
@media(max-width:600px){{.flex-row{{flex-direction:column}}}}
</style></head><body>
<div class="container">
<div class="header">
  <h1>🚨 SafetyNOTE 비상 복구 <span class="badge-standalone">STANDALONE</span></h1>
  <p>포트 {PORT} | 메인 서버(:{APP_PORT}) 상태와 무관하게 항상 접근 가능</p>
</div>

<div class="status-card">
  <span style="font-size:26px">{si}</span>
  <div style="flex:1">
    <div style="font-size:12px;color:#94a3b8">PM2 프로세스 상태</div>
    <div style="font-size:20px;font-weight:700;color:{sc}">{pm2s}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#64748b">현재 커밋</div>
    <div style="font-family:monospace;color:#7dd3fc;font-size:14px">{commit}</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px">재시작 {restarts}회</div>
  </div>
</div>

<div class="card"><h2>🔑 인증</h2>
  <input type="password" id="pw" placeholder="복구 비밀번호 (기본: recovery1234)" autocomplete="current-password">
  <p style="font-size:11px;color:#64748b;margin-top:8px">⚠️ .env 파일의 RECOVERY_PASSWORD 값을 입력하세요</p>
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

<div class="card"><h2>📋 서버 로그 (최근 60줄)</h2>
  <button class="btn btn-gray" onclick="loadLog()">🔄 새로고침</button>
  <div class="log-box" id="log-box">{log_txt}</div>
</div>

<p style="text-align:center;font-size:11px;color:#475569;padding:16px 0">
  SafetyNOTE 비상 복구 서버 (Standalone) | PORT {PORT} | Python3
</p>
</div>

<script>
async function act(action){{
  const pw=document.getElementById('pw').value.trim();
  if(!pw){{alert('비밀번호를 입력하세요');return;}}
  let body={{action,password:pw}};
  if(action==='rollback'){{
    const h=document.getElementById('sel-commit')?.value;
    if(!h){{alert('커밋을 선택하세요');return;}}
    if(!confirm(h+' 커밋으로 롤백합니다.\\n계속하시겠습니까?'))return;
    body.target_hash=h;
  }}
  if(action==='restore_db'){{
    const f=document.getElementById('sel-backup')?.value;
    if(!f){{alert('백업 파일을 선택하세요');return;}}
    if(!confirm(f+' 파일로 DB를 복원합니다.\\n복원 이후 모든 데이터가 삭제됩니다.\\n계속?'))return;
    body.filename=f;
  }}
  const rid=action==='rollback'?'r-rollback':action==='restore_db'?'r-db':'r-quick';
  const el=document.getElementById(rid);
  el.style.display='block';el.style.color='#94a3b8';
  el.textContent='⏳ 실행 중... (최대 2분 소요, 페이지를 닫지 마세요)';
  try{{
    const res=await fetch('/action',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(body)}});
    const d=await res.json();
    if(d.ok){{
      el.style.color='#4ade80';el.textContent='✅ '+d.message;
      setTimeout(()=>{{
        el.textContent+='\\n\\n5초 후 메인 서버 접속을 시도합니다...';
        setTimeout(()=>{{window.location.href='http://'+location.hostname+':{APP_PORT}';}},5000);
      }},2000);
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
    def log_message(self, fmt, *args): pass

    def do_GET(self):
        if self.path == "/log":
            body = get_recent_log().encode("utf-8", errors="replace")
            self.send_response(200)
            self.send_header("Content-Type","text/plain;charset=utf-8")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers(); self.wfile.write(body)
        else:
            body = build_page().encode("utf-8", errors="replace")
            self.send_response(200)
            self.send_header("Content-Type","text/html;charset=utf-8")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        if self.path != "/action":
            self.send_response(404); self.end_headers(); return
        length = int(self.headers.get("Content-Length",0))
        data   = json.loads(self.rfile.read(length))
        action = data.get("action","")
        pw     = data.get("password","")

        if pw != RECOVERY_PASSWORD:
            resp = json.dumps({"ok":False,"error":"비밀번호 오류"}).encode()
            self.send_response(403)
            self.send_header("Content-Type","application/json")
            self.send_header("Content-Length",str(len(resp)))
            self.end_headers(); self.wfile.write(resp); return

        ok, msg = False, "알 수 없는 액션"

        if action == "restart":
            ok, msg = do_restart()

        elif action == "npm_install":
            if not NPM_BIN:
                ok, msg = False, "npm을 찾을 수 없습니다"
            else:
                code, out = run(f"cd {INSTALL_DIR} && {NPM_BIN} install --production")
                if code == 0:
                    ok2, msg2 = do_restart()
                    ok, msg = ok2, f"npm install 완료 | {msg2}"
                else:
                    ok, msg = False, f"npm install 실패: {out[:300]}"

        elif action == "rollback":
            th = data.get("target_hash","").strip()
            if not th or not re.match(r'^[a-f0-9]{4,40}$', th):
                ok, msg = False, "유효하지 않은 커밋 해시"
            else:
                db_src = INSTALL_DIR + "/safety.db"
                try:
                    with open(ENV_FILE) as f:
                        for l in f:
                            if l.startswith("DB_PATH="):
                                db_src = l.split("=",1)[1].strip()
                except: pass
                if os.path.isfile(db_src):
                    stamp = time.strftime("%Y%m%d%H%M")
                    os.makedirs(INSTALL_DIR+"/backups", exist_ok=True)
                    try: shutil.copy2(db_src, f"{INSTALL_DIR}/backups/safety_{stamp}_before_rollback.db")
                    except: pass
                code1, out1 = run(f"git reset --hard {th}", cwd=INSTALL_DIR)
                if code1 != 0:
                    ok, msg = False, f"git reset 실패: {out1[:200]}"
                else:
                    if NPM_BIN:
                        run(f"cd {INSTALL_DIR} && {NPM_BIN} run build", timeout=120)
                    ok2, msg2 = do_restart()
                    ok, msg = ok2, f"롤백 → {th} 완료 | {msg2}"

        elif action == "restore_db":
            fname = data.get("filename","").strip()
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
                    stamp = time.strftime("%Y%m%d%H%M")
                    if os.path.isfile(db_dest):
                        try: shutil.copy2(db_dest, f"{INSTALL_DIR}/backups/safety_{stamp}_before_restore.db")
                        except: pass
                    try:
                        shutil.copy2(src, db_dest)
                        ok2, msg2 = do_restart()
                        ok, msg = ok2, f"DB 복원: {fname} | {msg2}"
                    except Exception as e:
                        ok, msg = False, f"DB 복원 실패: {e}"

        resp = json.dumps({
            "ok": ok,
            "message": msg if ok else "",
            "error": msg if not ok else ""
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(resp)))
        self.end_headers(); self.wfile.write(resp)

socketserver.TCPServer.allow_reuse_address = True
print(f"[safe-recovery-standalone] Python3 서버 시작 PORT={PORT}", flush=True)
with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    try:
        with open(LOG_FILE,"a") as lf:
            lf.write(f"[safe-recovery-standalone] Python3 HTTP 서버 시작 (포트 {PORT})\n")
    except: pass
    httpd.serve_forever()
PYEOF

  PYTHON_PID=$!
  echo "$PYTHON_PID" > "$PID_FILE"
  sleep 3

  # 응답 확인
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/" --max-time 4 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    NAS_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' 2>/dev/null \
             || hostname -i 2>/dev/null | awk '{print $1}' \
             || echo "NAS_IP")
    log "✅ Python3 비상 복구 서버 정상 가동!"
    log "👉 브라우저 접속: http://${NAS_IP}:${PORT}"
    echo ""
    echo "================================================================"
    echo "  ✅  비상 복구 서버 가동 완료"
    echo "  👉  http://${NAS_IP}:${PORT}"
    echo "  📋  로그: $LOG_FILE"
    echo "================================================================"
    return 0
  else
    log "⚠️ Python3 서버 응답 없음 (HTTP=$HTTP_CODE) — Node.js fallback 시도"
    kill "$PYTHON_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    return 1
  fi
}

# ─── Node.js fallback 서버 ───────────────────────────────────────────────────
start_nodejs_server() {
  if [ -z "$NODE_BIN" ]; then
    log "❌ Node.js를 찾을 수 없습니다. Python3 또는 Node.js 설치 필요."
    echo ""
    echo "================================================================"
    echo "  ❌  Python3 및 Node.js 모두 없음 — 비상 서버 실행 불가"
    echo "  📦  Synology 패키지 센터에서 Python3 설치 후 재시도하세요."
    echo "================================================================"
    exit 1
  fi

  log "Node.js HTTP 서버로 fallback 시작 (PORT=$PORT)..."

  # Node.js 인라인 HTTP 서버
  "$NODE_BIN" - <<NJSEOF &
const http = require('http');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const INSTALL_DIR = '$INSTALL_DIR';
const PORT = $PORT;
const RECOVERY_PASSWORD = '$RECOVERY_PASSWORD';
const APP_NAME = '$APP_NAME';
const APP_PORT = $APP_PORT;
const PM2_BIN = '$PM2_BIN';
const NODE_BIN = '$NODE_BIN';
const TSX_BIN = '$TSX_BIN';
const NPM_BIN = '$NPM_BIN';
const LOG_FILE = '$LOG_FILE';

function run(cmd, opts={}) {
  try {
    return { code: 0, out: execSync(cmd, { cwd: INSTALL_DIR, encoding: 'utf8', timeout: 180000, ...opts }) };
  } catch(e) {
    return { code: e.status||1, out: (e.stdout||'')+(e.stderr||'') };
  }
}

function getPm2Status() {
  if (!PM2_BIN) return 'pm2_not_found';
  try {
    const r = run(PM2_BIN + ' describe ' + APP_NAME);
    const lines = r.out.split('\n');
    for (const l of lines) {
      if (l.includes('status')) {
        const parts = l.trim().split(/\s+/);
        if (parts.length >= 4) return parts[3];
      }
    }
  } catch(e) {}
  return 'unknown';
}

function getCurrentCommit() {
  try { return run('git rev-parse --short HEAD').out.trim(); } catch(e) { return 'unknown'; }
}

function getCommitList() {
  try { return run("git log --format='%h|%ad|%s' --date='format:%Y-%m-%d %H:%M' -15").out.trim(); } catch(e) { return ''; }
}

function getBackupList() {
  try {
    const bdir = path.join(INSTALL_DIR, 'backups');
    if (!fs.existsSync(bdir)) return [];
    return fs.readdirSync(bdir).filter(f=>f.endsWith('.db')).sort().reverse().slice(0,15);
  } catch(e) { return []; }
}

function getRecentLog() {
  try {
    const lines = fs.readFileSync(LOG_FILE,'utf8').split('\n');
    return lines.slice(-60).join('\n').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  } catch(e) { return '(로그 없음)'; }
}

function doRestart() {
  if (!PM2_BIN) return { ok: false, msg: 'PM2 없음' };
  let r = run(PM2_BIN + ' restart ' + APP_NAME);
  if (r.code === 0) return { ok: true, msg: 'PM2 재시작 완료' };
  run(PM2_BIN + ' delete ' + APP_NAME);
  const cmd = 'PORT=3443 ' + PM2_BIN + ' start ' + TSX_BIN +
    ' --name ' + APP_NAME +
    ' --interpreter ' + NODE_BIN +
    ' --cwd ' + INSTALL_DIR + ' -- node-server.ts';
  r = run(cmd);
  return r.code === 0
    ? { ok: true, msg: 'PM2 재등록 완료' }
    : { ok: false, msg: 'PM2 시작 실패: ' + r.out.slice(0,200) };
}

function buildPage() {
  const pm2s = getPm2Status();
  const commit = getCurrentCommit();
  const commits = getCommitList();
  const backups = getBackupList();
  const logTxt = getRecentLog();

  const sc = pm2s==='online' ? '#16a34a' : (pm2s==='stopped'||pm2s==='errored') ? '#dc2626' : '#d97706';
  const si = pm2s==='online' ? '✅' : (pm2s==='stopped'||pm2s==='errored') ? '❌' : '⚠️';

  let commitOpts = '';
  let first = true;
  for (const line of commits.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const [h,d,...rest] = parts;
    const m = rest.join('|').slice(0,60);
    const sel = first ? ' selected' : '';
    first = false;
    commitOpts += \`<option value="\${h.trim()}"\${sel}>\${h.trim()} | \${d.trim()} | \${m}</option>\n\`;
  }

  let backupOpts = '<option value="">-- 백업 파일 선택 --</option>';
  for (const f of backups) backupOpts += \`<option value="\${f}">\${f}</option>\`;

  return \`<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SafetyNOTE 비상 복구</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:20px}
.container{max-width:820px;margin:0 auto}
.header{text-align:center;padding:24px 0 20px}
.header h1{font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:6px}
.header p{font-size:13px;color:#94a3b8}
.status-card{background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:14px;border:1px solid #334155;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.card{background:#1e293b;border-radius:12px;padding:20px;margin-bottom:14px;border:1px solid #334155}
.card h2{font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:14px}
select,input[type=password]{background:#0f172a;border:1px solid #475569;border-radius:8px;color:#e2e8f0;padding:8px 12px;font-size:13px;width:100%}
input[type=password]{max-width:280px}
.btn{display:inline-flex;align-items:center;gap:5px;padding:9px 16px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;margin-right:6px;margin-top:6px;transition:.15s}
.btn-orange{background:#ea580c;color:#fff}.btn-red{background:#dc2626;color:#fff}
.btn-blue{background:#2563eb;color:#fff}.btn-green{background:#16a34a;color:#fff}
.btn-gray{background:#475569;color:#fff}
.log-box{background:#020617;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#4ade80;max-height:300px;overflow-y:auto;white-space:pre-wrap;border:1px solid #1e3a5f;margin-top:10px;line-height:1.5}
.warn-box{background:#431407;border:1px solid #7c2d12;border-radius:8px;padding:10px 14px;font-size:12px;color:#fed7aa;margin-bottom:12px}
.result-box{background:#0f172a;border-radius:8px;padding:10px 14px;font-size:12px;margin-top:10px;display:none;border:1px solid #334155;white-space:pre-wrap;word-break:break-all}
.flex-row{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px}
.flex-row select{flex:1;min-width:180px}
.badge-node{background:#f59e0b;color:#000;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;margin-left:8px}
</style></head><body>
<div class="container">
<div class="header">
  <h1>🚨 SafetyNOTE 비상 복구 <span class="badge-node">NODE.JS</span></h1>
  <p>포트 \${PORT} | 메인 서버(:\${APP_PORT}) 상태와 무관하게 항상 접근 가능</p>
</div>
<div class="status-card">
  <span style="font-size:26px">\${si}</span>
  <div style="flex:1">
    <div style="font-size:12px;color:#94a3b8">PM2 프로세스 상태</div>
    <div style="font-size:20px;font-weight:700;color:\${sc}">\${pm2s}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#64748b">현재 커밋</div>
    <div style="font-family:monospace;color:#7dd3fc;font-size:14px">\${commit}</div>
  </div>
</div>
<div class="card"><h2>🔑 인증</h2>
  <input type="password" id="pw" placeholder="복구 비밀번호 (기본: recovery1234)" autocomplete="current-password">
  <p style="font-size:11px;color:#64748b;margin-top:8px">⚠️ .env 파일의 RECOVERY_PASSWORD 값을 입력하세요</p>
</div>
<div class="card"><h2>⚡ 빠른 복구</h2>
  <button class="btn btn-green" onclick="act('restart')">▶ PM2 재시작</button>
  <button class="btn btn-blue" onclick="act('npm_install')">📦 npm install + 재시작</button>
  <div class="result-box" id="r-quick"></div>
</div>
<div class="card"><h2>🔄 버전 롤백 (코드)</h2>
  <div class="warn-box">⚠️ 선택한 커밋으로 소스를 되돌립니다. DB 데이터는 유지됩니다.</div>
  <div class="flex-row">
    <select id="sel-commit">\${commitOpts}</select>
    <button class="btn btn-orange" onclick="act('rollback')">↩ 롤백</button>
  </div>
  <div class="result-box" id="r-rollback"></div>
</div>
<div class="card"><h2>🗄️ DB 백업 복원</h2>
  <div class="warn-box">🔴 복원 이후의 <b>모든 데이터가 삭제</b>됩니다. 현재 DB는 자동 저장됩니다.</div>
  <div class="flex-row">
    <select id="sel-backup">\${backupOpts}</select>
    <button class="btn btn-red" onclick="act('restore_db')">🗄️ DB 복원</button>
  </div>
  <div class="result-box" id="r-db"></div>
</div>
<div class="card"><h2>📋 서버 로그 (최근 60줄)</h2>
  <button class="btn btn-gray" onclick="loadLog()">🔄 새로고침</button>
  <div class="log-box" id="log-box">\${logTxt}</div>
</div>
<p style="text-align:center;font-size:11px;color:#475569;padding:16px 0">
  SafetyNOTE 비상 복구 (Node.js Fallback) | PORT \${PORT}
</p>
</div>
<script>
async function act(action){
  const pw=document.getElementById('pw').value.trim();
  if(!pw){alert('비밀번호를 입력하세요');return;}
  let body={action,password:pw};
  if(action==='rollback'){
    const h=document.getElementById('sel-commit')?.value;
    if(!h){alert('커밋을 선택하세요');return;}
    if(!confirm(h+' 커밋으로 롤백합니다.\\n계속?'))return;
    body.target_hash=h;
  }
  if(action==='restore_db'){
    const f=document.getElementById('sel-backup')?.value;
    if(!f){alert('백업 파일을 선택하세요');return;}
    if(!confirm(f+' 로 DB 복원합니다.\\n이후 데이터 삭제됩니다. 계속?'))return;
    body.filename=f;
  }
  const rid=action==='rollback'?'r-rollback':action==='restore_db'?'r-db':'r-quick';
  const el=document.getElementById(rid);
  el.style.display='block';el.style.color='#94a3b8';
  el.textContent='⏳ 실행 중... (최대 2분, 페이지 닫지 마세요)';
  try{
    const res=await fetch('/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await res.json();
    if(d.ok){el.style.color='#4ade80';el.textContent='✅ '+d.message;
      setTimeout(()=>{el.textContent+='\\n\\n5초 후 메인 서버 접속 시도...';
        setTimeout(()=>{window.location.href='http://'+location.hostname+':${APP_PORT}';},5000);},2000);
    }else{el.style.color='#f87171';el.textContent='❌ '+(d.error||'실패');}
  }catch(e){el.style.color='#f87171';el.textContent='❌ '+e.message;}
}
async function loadLog(){
  const r=await fetch('/log').catch(()=>null);if(!r)return;
  const t=await r.text();const b=document.getElementById('log-box');
  b.textContent=t;b.scrollTop=9999;
}
</script></body></html>\`;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    if (req.url === '/log') {
      const body = Buffer.from(getRecentLog(), 'utf8');
      res.writeHead(200, {'Content-Type':'text/plain;charset=utf-8','Content-Length':body.length});
      res.end(body);
    } else {
      const body = Buffer.from(buildPage(), 'utf8');
      res.writeHead(200, {'Content-Type':'text/html;charset=utf-8','Content-Length':body.length});
      res.end(body);
    }
  } else if (req.method === 'POST' && req.url === '/action') {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      let data;
      try { data = JSON.parse(raw); } catch(e) { res.writeHead(400); res.end(); return; }
      const { action, password, target_hash, filename } = data;

      if (password !== RECOVERY_PASSWORD) {
        const resp = Buffer.from(JSON.stringify({ok:false,error:'비밀번호 오류'}));
        res.writeHead(403, {'Content-Type':'application/json','Content-Length':resp.length});
        res.end(resp); return;
      }

      let result;
      if (action === 'restart') {
        result = doRestart();
      } else if (action === 'npm_install') {
        if (!NPM_BIN) {
          result = { ok: false, msg: 'npm 없음' };
        } else {
          const r = run('cd ' + INSTALL_DIR + ' && ' + NPM_BIN + ' install --production');
          if (r.code === 0) {
            const r2 = doRestart();
            result = { ok: r2.ok, msg: 'npm install 완료 | ' + r2.msg };
          } else {
            result = { ok: false, msg: 'npm install 실패: ' + r.out.slice(0,300) };
          }
        }
      } else if (action === 'rollback') {
        const th = (target_hash||'').trim();
        if (!th || !/^[a-f0-9]{4,40}$/.test(th)) {
          result = { ok: false, msg: '유효하지 않은 커밋 해시' };
        } else {
          const r1 = run('git reset --hard ' + th);
          if (r1.code !== 0) {
            result = { ok: false, msg: 'git reset 실패: ' + r1.out.slice(0,200) };
          } else {
            if (NPM_BIN) run(NPM_BIN + ' run build');
            const r2 = doRestart();
            result = { ok: r2.ok, msg: '롤백→' + th + ' | ' + r2.msg };
          }
        }
      } else if (action === 'restore_db') {
        const fname = (filename||'').trim();
        if (!fname || fname.includes('/') || !fname.endsWith('.db')) {
          result = { ok: false, msg: '유효하지 않은 파일명' };
        } else {
          const src = path.join(INSTALL_DIR, 'backups', fname);
          if (!fs.existsSync(src)) {
            result = { ok: false, msg: '파일 없음: ' + fname };
          } else {
            const dest = INSTALL_DIR + '/safety.db';
            try {
              if (fs.existsSync(dest)) {
                const stamp = new Date().toISOString().replace(/\D/g,'').slice(0,12);
                fs.copyFileSync(dest, INSTALL_DIR+'/backups/safety_'+stamp+'_before_restore.db');
              }
              fs.copyFileSync(src, dest);
              const r2 = doRestart();
              result = { ok: r2.ok, msg: 'DB 복원: ' + fname + ' | ' + r2.msg };
            } catch(e) {
              result = { ok: false, msg: 'DB 복원 실패: ' + e.message };
            }
          }
        }
      } else {
        result = { ok: false, msg: '알 수 없는 액션' };
      }

      const resp = Buffer.from(JSON.stringify({
        ok: result.ok,
        message: result.ok ? result.msg : '',
        error: result.ok ? '' : result.msg
      }));
      res.writeHead(200, {'Content-Type':'application/json','Content-Length':resp.length});
      res.end(resp);
    });
  } else {
    res.writeHead(404); res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[safe-recovery-standalone] Node.js 서버 시작 PORT=' + PORT);
  try { fs.appendFileSync(LOG_FILE, '[safe-recovery-standalone] Node.js HTTP 서버 시작 (포트 ' + PORT + ')\n'); } catch(e) {}
});
NJSEOF

  NODE_PID=$!
  echo "$NODE_PID" > "$PID_FILE"
  sleep 3

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/" --max-time 4 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    NAS_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' 2>/dev/null \
             || hostname -i 2>/dev/null | awk '{print $1}' \
             || echo "NAS_IP")
    log "✅ Node.js 비상 복구 서버 정상 가동!"
    log "👉 브라우저 접속: http://${NAS_IP}:${PORT}"
    echo ""
    echo "================================================================"
    echo "  ✅  비상 복구 서버 가동 완료 (Node.js fallback)"
    echo "  👉  http://${NAS_IP}:${PORT}"
    echo "  📋  로그: $LOG_FILE"
    echo "================================================================"
  else
    log "❌ Node.js 서버도 응답 없음 (HTTP=$HTTP_CODE)"
    echo ""
    echo "================================================================"
    echo "  ❌  비상 복구 서버 시작 실패"
    echo "  📋  로그를 확인하세요: $LOG_FILE"
    echo "================================================================"
    kill "$NODE_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
  fi
}

# ─── 메인 실행 ────────────────────────────────────────────────────────────────
main() {
  log "━━━ 비상 복구 서버 (Standalone) 시작 요청 ━━━"
  log "INSTALL_DIR=$INSTALL_DIR, PORT=$PORT"

  # 이전 인스턴스 정리
  cleanup_previous

  # Python3 우선 시도
  if command -v python3 &>/dev/null; then
    log "Python3 감지됨 — Python3 서버 시작"
    start_python3_server && exit 0
    log "Python3 서버 실패 — Node.js fallback 시도"
  else
    log "Python3 없음 — Node.js fallback 사용"
  fi

  # Node.js fallback
  start_nodejs_server
}

main "$@"
