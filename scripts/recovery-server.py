#!/usr/bin/env python3
# =============================================================================
# SafetyNOTE 비상 복구 서버 — 독립 Python3 실행 파일 (PM2 직접 등록용)
#
# 사용법 (PM2 직접 등록):
#   pm2 start /volume1/safetynote/scripts/recovery-server.py \
#     --name safetynote-recovery \
#     --interpreter /usr/bin/python3 \
#     -- /volume1/safetynote 3445
#   pm2 save
#
# 또는 수동 실행:
#   python3 /volume1/safetynote/scripts/recovery-server.py [INSTALL_DIR] [PORT]
#
# 특징:
#   - bash 래퍼 없음 → NAS PM2 hang 문제 없음
#   - PM2가 직접 python3 프로세스를 감시 → crash 시 자동 재시작
#   - .env 파일에서 설정 자동 로드
#   - 포트 충돌 시 SO_REUSEADDR로 자동 재사용
# =============================================================================
import http.server, json, subprocess, os, re, time, shutil, socketserver, sys, signal

# ─── 인자 파싱 ───────────────────────────────────────────────────────────────
INSTALL_DIR = sys.argv[1] if len(sys.argv) > 1 else "/volume1/safetynote"
PORT        = int(sys.argv[2]) if len(sys.argv) > 2 else 3445

# ─── .env 파일에서 설정 로드 ─────────────────────────────────────────────────
ENV_FILE          = os.path.join(INSTALL_DIR, ".env")
RECOVERY_PASSWORD = "recovery1234"
APP_NAME          = "safetynote"
APP_PORT          = 3443

if os.path.isfile(ENV_FILE):
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("PORT="):
                    APP_PORT = int(line.split("=", 1)[1].strip())
                elif line.startswith("RECOVERY_PASSWORD="):
                    RECOVERY_PASSWORD = line.split("=", 1)[1].strip()
                elif line.startswith("APP_NAME="):
                    APP_NAME = line.split("=", 1)[1].strip()
    except Exception:
        pass

# ─── NAS Node.js/PM2 경로 탐색 ───────────────────────────────────────────────
LOG_FILE = "/var/log/safetynote-watchdog.log"

def find_bin(name, candidates):
    for p in candidates:
        if p and os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    # PATH에서 탐색
    import shutil as _sh
    found = _sh.which(name)
    return found or ""

NODE_V18 = "/volume1/@appstore/Node.js_v18/usr/local/bin"
NODE_V20 = "/volume1/@appstore/Node.js_v20/usr/local/bin"

PM2_BIN = find_bin("pm2", [
    f"{NODE_V20}/pm2", f"{NODE_V18}/pm2",
    "/usr/local/bin/pm2",
    os.path.join(INSTALL_DIR, "node_modules/.bin/pm2")
])
NODE_BIN = find_bin("node", [
    f"{NODE_V18}/node", f"{NODE_V20}/node", "/usr/local/bin/node"
])
TSX_BIN = find_bin("tsx", [
    os.path.join(INSTALL_DIR, "node_modules/.bin/tsx"),
    f"{NODE_V20}/tsx", f"{NODE_V18}/tsx", "/usr/local/bin/tsx"
])
NPM_BIN = find_bin("npm", [
    f"{NODE_V18}/npm", f"{NODE_V20}/npm", "/usr/local/bin/npm"
])

# ─── 유틸 ────────────────────────────────────────────────────────────────────
def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [recovery-server] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass

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
    if not PM2_BIN:
        return "pm2_not_found"
    _, o = run(f"{PM2_BIN} describe {APP_NAME}")
    for l in o.splitlines():
        if "status" in l.lower():
            p = l.split()
            if len(p) >= 4:
                return p[3]
    return "unknown"

def restart_count():
    if not PM2_BIN:
        return "?"
    _, o = run(f"{PM2_BIN} describe {APP_NAME}")
    for l in o.splitlines():
        if "restart" in l.lower():
            p = l.split()
            if len(p) >= 4:
                return p[3]
    return "?"

def current_commit():
    _, o = run("git rev-parse --short HEAD")
    return o.strip() or "unknown"

def commit_list():
    _, o = run("git log --format='%h|%ad|%s' --date='format:%Y-%m-%d %H:%M' -15")
    return o.strip()

def backup_list():
    bdir = os.path.join(INSTALL_DIR, "backups")
    if not os.path.isdir(bdir):
        return []
    files = [f for f in os.listdir(bdir) if f.endswith(".db")]
    files.sort(reverse=True)
    return files[:15]

def recent_log():
    try:
        with open(LOG_FILE, "r", errors="replace") as f:
            lines = f.readlines()[-60:]
        return "".join(lines).replace("<", "&lt;").replace(">", "&gt;")
    except Exception:
        return "(로그 없음)"

def do_restart():
    if not PM2_BIN:
        return False, "PM2를 찾을 수 없습니다"
    code, _ = run(f"{PM2_BIN} restart {APP_NAME}")
    if code == 0:
        return True, "PM2 재시작 완료"
    # restart 실패 → delete + start
    env_port = str(APP_PORT)
    try:
        with open(ENV_FILE) as f:
            for l in f:
                if l.startswith("PORT="):
                    env_port = l.split("=", 1)[1].strip()
    except Exception:
        pass
    node_bin = NODE_BIN
    if not node_bin or not node_bin.startswith("/"):
        for p in [f"{NODE_V18}/node", f"{NODE_V20}/node", "/usr/local/bin/node"]:
            if os.path.isfile(p):
                node_bin = p
                break
    run(f"{PM2_BIN} delete {APP_NAME}")
    code2, out2 = run(
        f"PORT={env_port} {PM2_BIN} start {TSX_BIN} "
        f"--name {APP_NAME} --interpreter {node_bin} "
        f"--cwd {INSTALL_DIR} -- node-server.ts"
    )
    return (code2 == 0,
            "PM2 재등록 완료" if code2 == 0 else f"PM2 실패: {out2[:200]}")

# ─── HTML 페이지 빌더 ─────────────────────────────────────────────────────────
def build_page():
    pm2s    = pm2_status()
    commit  = current_commit()
    restarts = restart_count()
    commits = commit_list()
    backups = backup_list()
    log_txt = recent_log()

    sc = "#16a34a" if pm2s == "online" else "#dc2626" if pm2s in ("stopped", "errored") else "#d97706"
    si = "✅" if pm2s == "online" else "❌" if pm2s in ("stopped", "errored") else "⚠️"

    commit_opts = ""
    first = True
    for line in commits.splitlines():
        if not line.strip():
            continue
        parts = line.split("|", 2)
        if len(parts) < 3:
            continue
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
  <h1>🚨 SafetyNOTE 비상 복구 <span class="badge">STANDALONE v3</span></h1>
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
  SafetyNOTE 비상 복구 (Standalone v3 — Python직접실행) | PORT {PORT} | Python3
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

# ─── HTTP 핸들러 ──────────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # 액세스 로그 억제

    def do_GET(self):
        if self.path == "/log":
            body = recent_log().encode("utf-8", errors="replace")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain;charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/ping":
            body = b"ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(body)
        else:
            body = build_page().encode("utf-8", errors="replace")
            self.send_response(200)
            self.send_header("Content-Type", "text/html;charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def do_POST(self):
        if self.path != "/action":
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            data = json.loads(self.rfile.read(length))
        except Exception:
            self.send_response(400)
            self.end_headers()
            return

        action = data.get("action", "")
        pw     = data.get("password", "")

        if pw != RECOVERY_PASSWORD:
            resp = json.dumps({"ok": False, "error": "비밀번호가 올바르지 않습니다."}).encode()
            self.send_response(403)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return

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
                db_src = os.path.join(INSTALL_DIR, "safety.db")
                try:
                    with open(ENV_FILE) as f:
                        for l in f:
                            if l.startswith("DB_PATH="):
                                db_src = l.split("=", 1)[1].strip()
                except Exception:
                    pass
                if os.path.isfile(db_src):
                    stamp = time.strftime("%Y%m%d%H%M")
                    os.makedirs(os.path.join(INSTALL_DIR, "backups"), exist_ok=True)
                    try:
                        shutil.copy2(db_src, f"{INSTALL_DIR}/backups/safety_{stamp}_before_rollback.db")
                    except Exception:
                        pass
                code1, out1 = run(f"git reset --hard {th}")
                if code1 != 0:
                    ok, msg = False, f"git reset 실패: {out1[:200]}"
                else:
                    if NPM_BIN:
                        run(f"cd {INSTALL_DIR} && {NPM_BIN} run build", timeout=120)
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
                    db_dest = os.path.join(INSTALL_DIR, "safety.db")
                    try:
                        with open(ENV_FILE) as f:
                            for l in f:
                                if l.startswith("DB_PATH="):
                                    db_dest = l.split("=", 1)[1].strip()
                    except Exception:
                        pass
                    stamp = time.strftime("%Y%m%d%H%M")
                    if os.path.isfile(db_dest):
                        try:
                            shutil.copy2(db_dest,
                                f"{INSTALL_DIR}/backups/safety_{stamp}_before_restore.db")
                        except Exception:
                            pass
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
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)


# ─── SIGTERM 핸들러 (PM2 graceful stop 대응) ─────────────────────────────────
def _sigterm(sig, frame):
    log("SIGTERM 수신 — 종료")
    sys.exit(0)

signal.signal(signal.SIGTERM, _sigterm)

# ─── 서버 시작 ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log(f"━━━ SafetyNOTE 비상 복구 서버 (v3) 시작 PORT={PORT} ━━━")
    log(f"INSTALL_DIR={INSTALL_DIR}")
    log(f"PM2={PM2_BIN}, NODE={NODE_BIN}, TSX={TSX_BIN}")

    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
            log(f"✅ 서버 가동 완료 — http://0.0.0.0:{PORT}")
            httpd.serve_forever()
    except OSError as e:
        log(f"❌ 서버 시작 실패: {e}")
        sys.exit(1)
