#!/bin/bash
# =============================================================================
# SafetyNOTE 비상 복구 서버 — 독립 실행 버전 (standalone) v2
# FIX-056: Node.js heredoc bash 변수 치환 충돌 수정
#           → Node.js 코드를 임시 .js 파일로 분리하여 완전 해결
# =============================================================================
#
# 사용법:
#   bash /volume1/safetynote/scripts/safe-recovery-standalone.sh [INSTALL_DIR] [PORT]
#
# DSM 작업 스케줄러 등록:
#   작업 이름: SafetyNOTE 비상복구 서버 시작
#   사용자   : root
#   반복     : 실행 안 함
#   스크립트 : /bin/sh /volume1/safetynote/scripts/safe-recovery-standalone.sh
#
# 특징:
#   - 메인 서버 상태와 무관하게 언제든 실행 가능
#   - Python3 우선 / 없으면 Node.js 자동 전환
#   - 이전 인스턴스 자동 정리
#   - 포트 3445 (두 번째 인자로 변경 가능)
# =============================================================================

INSTALL_DIR="${1:-/volume1/safetynote}"
PORT="${2:-3445}"

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
NODE_PATH_V18="/volume1/@appstore/Node.js_v18/usr/local/bin"
NODE_PATH_V20="/volume1/@appstore/Node.js_v20/usr/local/bin"
export PATH="$NODE_PATH_V18:$NODE_PATH_V20:/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_FILE="/var/log/safetynote-watchdog.log"
PID_FILE="/var/run/safetynote-recovery.pid"
TMP_JS="/tmp/safetynote-recovery-server.js"
ENV_FILE="$INSTALL_DIR/.env"

RECOVERY_PASSWORD="recovery1234"
APP_NAME="safetynote"
APP_PORT=3443

# .env 설정 읽기
if [ -f "$ENV_FILE" ]; then
  _P=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
  [ -n "$_P" ] && APP_PORT="$_P"
  _PW=$(grep -E "^RECOVERY_PASSWORD=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
  [ -n "$_PW" ] && RECOVERY_PASSWORD="$_PW"
  _AN=$(grep -E "^APP_NAME=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]')
  [ -n "$_AN" ] && APP_NAME="$_AN"
fi

# ─── 바이너리 탐색 ───────────────────────────────────────────────────────────
find_bin() {
  local name="$1"
  shift
  for p in "$@"; do [ -x "$p" ] && echo "$p" && return; done
  command -v "$name" 2>/dev/null && echo "$name" && return
  echo ""
}

PM2_BIN=$(find_bin pm2 \
  "$NODE_PATH_V18/pm2" "$NODE_PATH_V20/pm2" \
  "/usr/local/bin/pm2" "$INSTALL_DIR/node_modules/.bin/pm2")
NODE_BIN=$(find_bin node \
  "$NODE_PATH_V18/node" "$NODE_PATH_V20/node" "/usr/local/bin/node")
TSX_BIN=$(find_bin tsx \
  "$INSTALL_DIR/node_modules/.bin/tsx" "$NODE_PATH_V18/tsx" "/usr/local/bin/tsx")
NPM_BIN=$(find_bin npm \
  "$NODE_PATH_V18/npm" "$NODE_PATH_V20/npm" "/usr/local/bin/npm")

# ─── 로그 ────────────────────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [standalone] $1" | tee -a "$LOG_FILE"
}

# ─── 이전 인스턴스 정리 ──────────────────────────────────────────────────────
cleanup_previous() {
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      log "이전 비상 복구 서버 종료 (PID=$OLD_PID)"
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$PID_FILE"
  fi
  if command -v fuser &>/dev/null; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
    sleep 1
  fi
}

# ─── Python3 서버 ────────────────────────────────────────────────────────────
start_python3_server() {
  log "Python3 서버 시작 (PORT=$PORT)..."

  # NOTE: <<'PYEOF' (따옴표) — bash 변수 치환 완전 차단
  #       Python 코드 내 변수는 bash sed로 치환 후 실행
  local PY_SCRIPT="/tmp/safetynote-recovery.py"

  cat > "$PY_SCRIPT" << 'PYEOF'
import http.server, json, subprocess, os, re, time, shutil, socketserver

# ── 설정 (bash가 sed로 치환) ──
INSTALL_DIR = "%%INSTALL_DIR%%"
PORT        = %%PORT%%
RECOVERY_PASSWORD = "%%RECOVERY_PASSWORD%%"
APP_NAME    = "%%APP_NAME%%"
APP_PORT    = %%APP_PORT%%
PM2_BIN     = "%%PM2_BIN%%"
NODE_BIN    = "%%NODE_BIN%%"
NPM_BIN     = "%%NPM_BIN%%"
TSX_BIN     = "%%TSX_BIN%%"
LOG_FILE    = "%%LOG_FILE%%"
ENV_FILE    = "%%ENV_FILE%%"

def run(cmd, cwd=None, timeout=180):
    cwd = cwd or INSTALL_DIR
    try:
        r = subprocess.run(cmd, shell=True, cwd=cwd,
                           capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        return -1, "TIMEOUT"
    except Exception as e:
        return -1, str(e)

def pm2_status():
    if not PM2_BIN: return "pm2_not_found"
    _, o = run(f"{PM2_BIN} describe {APP_NAME}")
    for l in o.splitlines():
        if "status" in l.lower():
            p = l.split()
            if len(p) >= 4: return p[3]
    return "unknown"

def current_commit():
    _, o = run("git rev-parse --short HEAD")
    return o.strip() or "unknown"

def restart_count():
    if not PM2_BIN: return "?"
    _, o = run(f"{PM2_BIN} describe {APP_NAME}")
    for l in o.splitlines():
        if "restart" in l.lower():
            p = l.split()
            if len(p) >= 4: return p[3]
    return "?"

def commit_list():
    _, o = run("git log --format='%h|%ad|%s' --date='format:%Y-%m-%d %H:%M' -15")
    return o.strip()

def backup_list():
    bdir = os.path.join(INSTALL_DIR, "backups")
    if not os.path.isdir(bdir): return []
    files = [f for f in os.listdir(bdir) if f.endswith(".db")]
    files.sort(reverse=True)
    return files[:15]

def recent_log():
    try:
        with open(LOG_FILE, "r", errors="replace") as f:
            lines = f.readlines()[-60:]
        return "".join(lines).replace("<","&lt;").replace(">","&gt;")
    except:
        return "(로그 없음)"

def do_restart():
    if not PM2_BIN: return False, "PM2를 찾을 수 없습니다"
    code, _ = run(f"{PM2_BIN} restart {APP_NAME}")
    if code == 0: return True, "PM2 재시작 완료"
    env_port = "3443"
    try:
        with open(ENV_FILE) as f:
            for l in f:
                if l.startswith("PORT="): env_port = l.split("=",1)[1].strip()
    except: pass
    run(f"{PM2_BIN} delete {APP_NAME}")
    code2, out2 = run(
        f"PORT={env_port} {PM2_BIN} start {TSX_BIN} "
        f"--name {APP_NAME} --interpreter {NODE_BIN} "
        f"--cwd {INSTALL_DIR} -- node-server.ts"
    )
    return (code2 == 0, "PM2 재등록 완료" if code2 == 0 else f"PM2 실패: {out2[:200]}")

def build_page():
    pm2s = pm2_status()
    commit = current_commit()
    restarts = restart_count()
    commits = commit_list()
    backups = backup_list()
    log_txt = recent_log()

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
.badge{{background:#7c3aed;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;margin-left:8px}}
</style></head><body>
<div class="container">
<div class="header">
  <h1>🚨 SafetyNOTE 비상 복구 <span class="badge">STANDALONE</span></h1>
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
  SafetyNOTE 비상 복구 (Standalone v2) | PORT {PORT} | Python3
</p>
</div>
<script>
async function act(action){{
  const pw=document.getElementById('pw').value.trim();
  if(!pw){{alert('비밀번호를 입력하세요');return;}}
  let body={{action,password:pw}};
  if(action==='rollback'){{
    const h=document.getElementById('sel-commit').value;
    if(!h){{alert('커밋을 선택하세요');return;}}
    if(!confirm(h+' 커밋으로 롤백합니다. 계속?'))return;
    body.target_hash=h;
  }}
  if(action==='restore_db'){{
    const f=document.getElementById('sel-backup').value;
    if(!f){{alert('백업 파일을 선택하세요');return;}}
    if(!confirm(f+' 로 DB 복원합니다. 이후 데이터 삭제됩니다. 계속?'))return;
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
      el.style.color='#4ade80';
      el.textContent='✅ '+d.message;
      setTimeout(()=>{{
        el.textContent+='\\n\\n5초 후 메인 서버 접속 시도...';
        setTimeout(()=>{{window.location.href='http://'+location.hostname+':{APP_PORT}';}},5000);
      }},2000);
    }}else{{
      el.style.color='#f87171';
      el.textContent='❌ '+(d.error||'실패');
    }}
  }}catch(e){{
    el.style.color='#f87171';
    el.textContent='❌ 요청 실패: '+e.message;
  }}
}}
async function loadLog(){{
  const r=await fetch('/log').catch(()=>null);
  if(!r)return;
  const t=await r.text();
  const b=document.getElementById('log-box');
  b.textContent=t;b.scrollTop=9999;
}}
</script></body></html>"""

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass

    def do_GET(self):
        if self.path == "/log":
            body = recent_log().encode("utf-8", errors="replace")
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
        length = int(self.headers.get("Content-Length", 0))
        try:
            data = json.loads(self.rfile.read(length))
        except:
            self.send_response(400); self.end_headers(); return

        action = data.get("action", "")
        pw = data.get("password", "")

        if pw != RECOVERY_PASSWORD:
            resp = json.dumps({"ok": False, "error": "비밀번호가 올바르지 않습니다."}).encode()
            self.send_response(403)
            self.send_header("Content-Type","application/json")
            self.send_header("Content-Length", str(len(resp)))
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
            th = data.get("target_hash", "").strip()
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
                code1, out1 = run(f"git reset --hard {th}")
                if code1 != 0:
                    ok, msg = False, f"git reset 실패: {out1[:200]}"
                else:
                    if NPM_BIN: run(f"cd {INSTALL_DIR} && {NPM_BIN} run build", timeout=120)
                    ok2, msg2 = do_restart()
                    ok, msg = ok2, f"롤백 → {th} 완료 | {msg2}"

        elif action == "restore_db":
            fname = data.get("filename", "").strip()
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
        self.send_header("Content-Length", str(len(resp)))
        self.end_headers(); self.wfile.write(resp)

socketserver.TCPServer.allow_reuse_address = True
print(f"[safe-recovery-standalone] Python3 서버 시작 PORT={PORT}", flush=True)
try:
    with open(LOG_FILE,"a") as lf:
        lf.write(f"[safe-recovery-standalone] Python3 서버 시작 (포트 {PORT})\n")
except: pass
with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.serve_forever()
PYEOF

  # bash 변수를 sed로 치환 (따옴표 heredoc이므로 변수가 그대로 남아있음)
  # 경로에 / 가 있으므로 | 를 구분자로 사용
  sed -i \
    -e "s|%%INSTALL_DIR%%|${INSTALL_DIR}|g" \
    -e "s|%%PORT%%|${PORT}|g" \
    -e "s|%%RECOVERY_PASSWORD%%|${RECOVERY_PASSWORD}|g" \
    -e "s|%%APP_NAME%%|${APP_NAME}|g" \
    -e "s|%%APP_PORT%%|${APP_PORT}|g" \
    -e "s|%%PM2_BIN%%|${PM2_BIN}|g" \
    -e "s|%%NODE_BIN%%|${NODE_BIN}|g" \
    -e "s|%%NPM_BIN%%|${NPM_BIN}|g" \
    -e "s|%%TSX_BIN%%|${TSX_BIN}|g" \
    -e "s|%%LOG_FILE%%|${LOG_FILE}|g" \
    -e "s|%%ENV_FILE%%|${ENV_FILE}|g" \
    "$PY_SCRIPT"

  python3 "$PY_SCRIPT" >> "$LOG_FILE" 2>&1 &
  PYTHON_PID=$!
  echo "$PYTHON_PID" > "$PID_FILE"
  sleep 3

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/" --max-time 4 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    NAS_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' 2>/dev/null \
             || hostname -i 2>/dev/null | awk '{print $1}' \
             || echo "NAS_IP")
    log "✅ Python3 비상 복구 서버 정상 가동!"
    log "👉 브라우저 접속: http://${NAS_IP}:${PORT}"
    echo "================================================================"
    echo "  ✅  비상 복구 서버 가동 완료"
    echo "  👉  http://${NAS_IP}:${PORT}"
    echo "  📋  로그: $LOG_FILE"
    echo "================================================================"
    return 0
  else
    log "⚠️ Python3 서버 응답 없음 (HTTP=$HTTP_CODE) — Node.js 시도"
    kill "$PYTHON_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    return 1
  fi
}

# ─── Node.js 서버 (임시 파일 방식 — bash 변수 치환 충돌 없음) ────────────────
start_nodejs_server() {
  if [ -z "$NODE_BIN" ]; then
    log "❌ Node.js를 찾을 수 없습니다. Python3 또는 Node.js가 필요합니다."
    echo "================================================================"
    echo "  ❌  Python3, Node.js 모두 없음 — 비상 서버 실행 불가"
    echo "  📦  Synology 패키지 센터에서 Python3 설치 후 재시도하세요."
    echo "================================================================"
    exit 1
  fi

  log "Node.js 서버 시작 (PORT=$PORT)..."

  # Node.js 코드를 임시 파일로 먼저 작성 (bash heredoc 변수 충돌 방지)
  # ── 설정값을 JS 상수로 먼저 작성 ──
  cat > "$TMP_JS" << JSEOF
'use strict';
const http = require('http');
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── 설정 (bash에서 직접 주입) ──
const INSTALL_DIR       = '${INSTALL_DIR}';
const PORT              = ${PORT};
const RECOVERY_PASSWORD = '${RECOVERY_PASSWORD}';
const APP_NAME          = '${APP_NAME}';
const APP_PORT          = ${APP_PORT};
const PM2_BIN           = '${PM2_BIN}';
const NODE_BIN          = '${NODE_BIN}';
const TSX_BIN           = '${TSX_BIN}';
const NPM_BIN           = '${NPM_BIN}';
const LOG_FILE          = '${LOG_FILE}';
const ENV_FILE          = '${ENV_FILE}';
JSEOF

  # ── JS 로직 부분을 별도 heredoc으로 작성 (단일 따옴표 JSEOF2 → bash 변수 치환 없음) ──
  cat >> "$TMP_JS" << 'JSEOF2'

function run(cmd) {
  try {
    const out = execSync(cmd, {
      cwd: INSTALL_DIR, encoding: 'utf8',
      timeout: 180000, stdio: ['pipe','pipe','pipe']
    });
    return { code: 0, out: out };
  } catch(e) {
    return { code: e.status || 1, out: (e.stdout||'') + (e.stderr||'') };
  }
}

function pm2Status() {
  if (!PM2_BIN) return 'pm2_not_found';
  try {
    const out = run(PM2_BIN + ' describe ' + APP_NAME).out;
    for (const l of out.split('\n')) {
      if (l.toLowerCase().includes('status')) {
        const p = l.trim().split(/\s+/);
        if (p.length >= 4) return p[3];
      }
    }
  } catch(e) {}
  return 'unknown';
}

function currentCommit() {
  try { return run('git rev-parse --short HEAD').out.trim(); }
  catch(e) { return 'unknown'; }
}

function commitList() {
  try {
    return run("git log --format='%h|%ad|%s' --date='format:%Y-%m-%d %H:%M' -15").out.trim();
  } catch(e) { return ''; }
}

function backupList() {
  try {
    const bdir = path.join(INSTALL_DIR, 'backups');
    if (!fs.existsSync(bdir)) return [];
    return fs.readdirSync(bdir)
      .filter(f => f.endsWith('.db'))
      .sort().reverse().slice(0, 15);
  } catch(e) { return []; }
}

function recentLog() {
  try {
    return fs.readFileSync(LOG_FILE, 'utf8')
      .split('\n').slice(-60).join('\n')
      .replace(/</g,'&lt;').replace(/>/g,'&gt;');
  } catch(e) { return '(로그 없음)'; }
}

function doRestart() {
  if (!PM2_BIN) return { ok: false, msg: 'PM2 없음' };
  let r = run(PM2_BIN + ' restart ' + APP_NAME);
  if (r.code === 0) return { ok: true, msg: 'PM2 재시작 완료' };
  run(PM2_BIN + ' delete ' + APP_NAME);
  let envPort = '3443';
  try {
    fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(l => {
      if (l.startsWith('PORT=')) envPort = l.split('=')[1].trim();
    });
  } catch(e) {}
  const cmd = 'PORT=' + envPort + ' ' + PM2_BIN + ' start ' + TSX_BIN +
    ' --name ' + APP_NAME +
    ' --interpreter ' + NODE_BIN +
    ' --cwd ' + INSTALL_DIR + ' -- node-server.ts';
  r = run(cmd);
  return r.code === 0
    ? { ok: true,  msg: 'PM2 재등록 완료' }
    : { ok: false, msg: 'PM2 시작 실패: ' + r.out.slice(0, 200) };
}

function buildPage() {
  const pm2s    = pm2Status();
  const commit  = currentCommit();
  const commits = commitList();
  const backups = backupList();
  const logTxt  = recentLog();

  const sc = pm2s==='online' ? '#16a34a'
    : (pm2s==='stopped'||pm2s==='errored') ? '#dc2626' : '#d97706';
  const si = pm2s==='online' ? '✅'
    : (pm2s==='stopped'||pm2s==='errored') ? '❌' : '⚠️';

  let commitOpts = '';
  let first = true;
  commits.split('\n').forEach(line => {
    if (!line.trim()) return;
    const p = line.split('|');
    if (p.length < 3) return;
    const h = p[0].trim(), d = p[1].trim(), m = p.slice(2).join('|').trim().slice(0,60);
    const sel = first ? ' selected' : '';
    first = false;
    commitOpts += '<option value="' + h + '"' + sel + '>' + h + ' | ' + d + ' | ' + m + '</option>\n';
  });

  let backupOpts = '<option value="">-- 백업 파일 선택 --</option>';
  backups.forEach(f => { backupOpts += '<option value="' + f + '">' + f + '</option>'; });

  const mainPort = APP_PORT;

  return `<!DOCTYPE html>
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
.btn-orange{background:#ea580c;color:#fff}.btn-orange:hover{background:#c2410c}
.btn-red{background:#dc2626;color:#fff}.btn-red:hover{background:#b91c1c}
.btn-blue{background:#2563eb;color:#fff}.btn-blue:hover{background:#1d4ed8}
.btn-green{background:#16a34a;color:#fff}.btn-green:hover{background:#15803d}
.btn-gray{background:#475569;color:#fff}.btn-gray:hover{background:#334155}
.log-box{background:#020617;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#4ade80;max-height:300px;overflow-y:auto;white-space:pre-wrap;border:1px solid #1e3a5f;margin-top:10px;line-height:1.5}
.warn-box{background:#431407;border:1px solid #7c2d12;border-radius:8px;padding:10px 14px;font-size:12px;color:#fed7aa;margin-bottom:12px}
.result-box{background:#0f172a;border-radius:8px;padding:10px 14px;font-size:12px;margin-top:10px;display:none;border:1px solid #334155;white-space:pre-wrap;word-break:break-all}
.flex-row{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px}
.flex-row select{flex:1;min-width:180px}
.badge{background:#f59e0b;color:#000;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;margin-left:8px}
</style></head><body>
<div class="container">
<div class="header">
  <h1>🚨 SafetyNOTE 비상 복구 <span class="badge">NODE.JS</span></h1>
  <p>포트 ${PORT} | 메인 서버(:${mainPort}) 상태와 무관하게 항상 접근 가능</p>
</div>
<div class="status-card">
  <span style="font-size:26px">${si}</span>
  <div style="flex:1">
    <div style="font-size:12px;color:#94a3b8">PM2 프로세스 상태</div>
    <div style="font-size:20px;font-weight:700;color:${sc}">${pm2s}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#64748b">현재 커밋</div>
    <div style="font-family:monospace;color:#7dd3fc;font-size:14px">${commit}</div>
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
    <select id="sel-commit">${commitOpts}</select>
    <button class="btn btn-orange" onclick="act('rollback')">↩ 롤백</button>
  </div>
  <div class="result-box" id="r-rollback"></div>
</div>
<div class="card"><h2>🗄️ DB 백업 복원</h2>
  <div class="warn-box">🔴 복원 이후의 <b>모든 데이터가 삭제</b>됩니다. 현재 DB는 자동 저장됩니다.</div>
  <div class="flex-row">
    <select id="sel-backup">${backupOpts}</select>
    <button class="btn btn-red" onclick="act('restore_db')">🗄️ DB 복원</button>
  </div>
  <div class="result-box" id="r-db"></div>
</div>
<div class="card"><h2>📋 서버 로그 (최근 60줄)</h2>
  <button class="btn btn-gray" onclick="loadLog()">🔄 새로고침</button>
  <div class="log-box" id="log-box">${logTxt}</div>
</div>
<p style="text-align:center;font-size:11px;color:#475569;padding:16px 0">
  SafetyNOTE 비상 복구 (Node.js) | PORT ${PORT}
</p>
</div>
<script>
async function act(action) {
  const pw = document.getElementById('pw').value.trim();
  if (!pw) { alert('비밀번호를 입력하세요'); return; }
  let body = { action, password: pw };
  if (action === 'rollback') {
    const h = document.getElementById('sel-commit').value;
    if (!h) { alert('커밋을 선택하세요'); return; }
    if (!confirm(h + ' 커밋으로 롤백합니다. 계속?')) return;
    body.target_hash = h;
  }
  if (action === 'restore_db') {
    const f = document.getElementById('sel-backup').value;
    if (!f) { alert('백업 파일을 선택하세요'); return; }
    if (!confirm(f + ' 로 DB 복원합니다.\\n이후 데이터 삭제됩니다. 계속?')) return;
    body.filename = f;
  }
  const rid = action === 'rollback' ? 'r-rollback'
    : action === 'restore_db' ? 'r-db' : 'r-quick';
  const el = document.getElementById(rid);
  el.style.display = 'block'; el.style.color = '#94a3b8';
  el.textContent = '⏳ 실행 중... (최대 2분, 페이지 닫지 마세요)';
  try {
    const res = await fetch('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (d.ok) {
      el.style.color = '#4ade80';
      el.textContent = '✅ ' + d.message;
      setTimeout(() => {
        el.textContent += '\\n\\n5초 후 메인 서버 접속 시도...';
        setTimeout(() => {
          window.location.href = 'http://' + location.hostname + ':' + ${mainPort};
        }, 5000);
      }, 2000);
    } else {
      el.style.color = '#f87171';
      el.textContent = '❌ ' + (d.error || '실패');
    }
  } catch(e) {
    el.style.color = '#f87171';
    el.textContent = '❌ 요청 실패: ' + e.message;
  }
}
async function loadLog() {
  const r = await fetch('/log').catch(() => null);
  if (!r) return;
  const t = await r.text();
  const b = document.getElementById('log-box');
  b.textContent = t; b.scrollTop = 9999;
}
</script></body></html>`;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    if (req.url === '/log') {
      const body = Buffer.from(recentLog(), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain;charset=utf-8', 'Content-Length': body.length });
      res.end(body);
    } else {
      const body = Buffer.from(buildPage(), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Content-Length': body.length });
      res.end(body);
    }
  } else if (req.method === 'POST' && req.url === '/action') {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(raw); }
      catch(e) { res.writeHead(400); res.end(); return; }

      const { action, password, target_hash, filename } = data;

      if (password !== RECOVERY_PASSWORD) {
        const resp = Buffer.from(JSON.stringify({ ok: false, error: '비밀번호가 올바르지 않습니다.' }));
        res.writeHead(403, { 'Content-Type': 'application/json', 'Content-Length': resp.length });
        res.end(resp); return;
      }

      let result = { ok: false, msg: '알 수 없는 액션' };

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
            result = { ok: false, msg: 'npm install 실패: ' + r.out.slice(0, 300) };
          }
        }

      } else if (action === 'rollback') {
        const th = (target_hash || '').trim();
        if (!th || !/^[a-f0-9]{4,40}$/.test(th)) {
          result = { ok: false, msg: '유효하지 않은 커밋 해시' };
        } else {
          const r1 = run('git reset --hard ' + th);
          if (r1.code !== 0) {
            result = { ok: false, msg: 'git reset 실패: ' + r1.out.slice(0, 200) };
          } else {
            if (NPM_BIN) run(NPM_BIN + ' run build');
            const r2 = doRestart();
            result = { ok: r2.ok, msg: '롤백 → ' + th + ' | ' + r2.msg };
          }
        }

      } else if (action === 'restore_db') {
        const fname = (filename || '').trim();
        if (!fname || fname.includes('/') || fname.includes('\\') || !fname.endsWith('.db')) {
          result = { ok: false, msg: '유효하지 않은 파일명' };
        } else {
          const src = path.join(INSTALL_DIR, 'backups', fname);
          if (!fs.existsSync(src)) {
            result = { ok: false, msg: '파일 없음: ' + fname };
          } else {
            let dbDest = INSTALL_DIR + '/safety.db';
            try {
              fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(l => {
                if (l.startsWith('DB_PATH=')) dbDest = l.split('=')[1].trim();
              });
            } catch(e) {}
            try {
              if (fs.existsSync(dbDest)) {
                const stamp = new Date().toISOString().replace(/\D/g,'').slice(0,12);
                fs.copyFileSync(dbDest, INSTALL_DIR + '/backups/safety_' + stamp + '_before_restore.db');
              }
              fs.copyFileSync(src, dbDest);
              const r2 = doRestart();
              result = { ok: r2.ok, msg: 'DB 복원: ' + fname + ' | ' + r2.msg };
            } catch(e) {
              result = { ok: false, msg: 'DB 복원 실패: ' + e.message };
            }
          }
        }
      }

      const resp = Buffer.from(JSON.stringify({
        ok: result.ok,
        message: result.ok ? result.msg : '',
        error:   result.ok ? '' : result.msg
      }));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': resp.length });
      res.end(resp);
    });
  } else {
    res.writeHead(404); res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[safe-recovery-standalone] Node.js 서버 시작 PORT=' + PORT);
  try {
    fs.appendFileSync(LOG_FILE, '[safe-recovery-standalone] Node.js 서버 시작 (포트 ' + PORT + ')\n');
  } catch(e) {}
});

process.on('uncaughtException', err => {
  console.error('[safe-recovery-standalone] 오류:', err.message);
  try { fs.appendFileSync(LOG_FILE, '[safe-recovery-standalone] 오류: ' + err.message + '\n'); } catch(e) {}
});
JSEOF2

  "$NODE_BIN" "$TMP_JS" >> "$LOG_FILE" 2>&1 &
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
    echo "================================================================"
    echo "  ✅  비상 복구 서버 가동 완료 (Node.js)"
    echo "  👉  http://${NAS_IP}:${PORT}"
    echo "  📋  로그: $LOG_FILE"
    echo "================================================================"
  else
    log "❌ Node.js 서버 응답 없음 (HTTP=$HTTP_CODE)"
    echo "================================================================"
    echo "  ❌  비상 복구 서버 시작 실패"
    echo "  📋  로그 확인: $LOG_FILE"
    echo "================================================================"
    kill "$NODE_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
  fi
}

# ─── 메인 ────────────────────────────────────────────────────────────────────
main() {
  log "━━━ 비상 복구 서버 (Standalone v2) 시작 요청 ━━━"
  log "INSTALL_DIR=$INSTALL_DIR, PORT=$PORT"

  cleanup_previous

  if command -v python3 &>/dev/null; then
    log "Python3 감지 — Python3 서버 시작"
    start_python3_server && exit 0
    log "Python3 실패 — Node.js 시도"
  else
    log "Python3 없음 — Node.js 사용"
  fi

  start_nodejs_server
}

main "$@"
