# SafetyNOTE — NAS 설치 지원 로그 (NAS_INSTALL_SUPPORT_LOG)

> 목적: 새 NAS에 SafetyNOTE 설치 중 발생한 문제 및 해결 과정 기록  
> 작성 시작: 세션 99 (2026-07-27)  
> 담당: 에이전트 자동 기록  
> ⚠️ 이 파일은 세션이 끊겨도 이어서 지원할 수 있도록 유지됩니다.

---

## 📌 현재 상태 요약 (세션 124 기준)

| 항목 | 내용 |
|------|------|
| **지원 대상** | 신규 NAS (기존 운영 NAS와 별도) |
| **진행 단계** | Step 8/8 — PM2 기동 실패, 원인 파악 완료 |
| **현재 문제** | better-sqlite3 native binary GLIBC 버전 불일치 |
| **해결 방향** | Node.js 하위 버전 제거 후 Node18 재설치 |
| **해결 상태** | ⏳ 진행 중 — 사용자 Node 재설치 결과 대기 중 |

---

## 🖥️ 대상 NAS 환경 정보

| 항목 | 확인된 값 | 비고 |
|------|-----------|------|
| Node.js 버전 | `v18.18.2` | ✅ 확인 (세션 124) |
| npm 버전 | `9.8.1` | ✅ 확인 (세션 124) |
| Linux 커널 | `4.4.180+` | ⚠️ 구버전 — GLIBC 2.17 수준 |
| Git 버전 | `2.55.0` | ✅ 정상 |
| PM2 버전 | `7.0.3` | ✅ 정상 |
| 설치 경로 | `/volume1/safetynote` | ✅ 확인 |
| Node 설치 경로 | `/volume1/@appstore/Node.js_v18/` | ✅ 확인 |
| DSM 버전 | 미확인 | — |
| NAS 모델 | 미확인 | — |
| **추가 발견** | Node.js 하위 버전도 동시 설치됨 | ⚠️ PATH 충돌 원인 가능성 |

---

## 📋 세션 99 — 발생 문제 및 대응 기록

### [ISSUE-001] npm install eresolve 의존성 충돌

**발생 시각**: 2026-07-27 (세션 99)  
**발생 단계**: `install.sh` Step 6/8 npm 패키지 설치  
**상태**: ✅ 세션 123에서 해결 완료

#### 증상 (사용자 제공 로그)
```
━━━ Step 6/8: npm 패키지 설치 ━━━
npm ERR! code ERESOLVE
npm ERR! For a full report see:
npm ERR! /root/.npm/_logs/2026-07-27T07_00_21_543Z-eresolve-report.txt
[ OK ]  패키지 설치 완료          ← install.sh 버그: 오류 무시하고 진행
[ERR ]  tsx를 찾을 수 없습니다: /volume1/safetynote/node_modules/.bin/tsx
```

#### 원인
- `npm install` eresolve 오류(의존성 버전 충돌)로 실패
- `install.sh` 스크립트가 `npm ERR!` 이후에도 `[ OK ]`로 잘못 판단 → **버그 (미수정)**

#### 해결 (세션 123)
```bash
cd /volume1/safetynote
rm -rf node_modules
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install \
  --legacy-peer-deps --ignore-scripts
→ added 94 packages ✅
```

---

## 📋 세션 123 — better-sqlite3 prebuilt binary 수동 주입

### [ISSUE-002] better-sqlite3 빌드 실패 (GLIBC 2.29 미만)

**발생 시각**: 2026-07-30 (세션 123)  
**상태**: ⚠️ 부분 완료 — binary 주입했으나 여전히 GLIBC 오류 발생

#### 원인 분석

| 원인 | 상세 |
|------|------|
| GLIBC 버전 부족 | NAS 커널 4.4.180 → GLIBC 2.17 수준, better-sqlite3 요구: 2.29 이상 |
| `make`/`gcc` 미설치 | node-gyp 소스 컴파일 불가 |
| `--ignore-scripts` | postinstall 컴파일 단계 전체 건너뜀 → binary 없음 |

#### 시도한 해결: prebuilt binary 수동 주입
```bash
# better-sqlite3 v9.6.0, node-v108(Node18), linux-x64 prebuilt 다운로드
curl -L \
  "https://github.com/WiseLibs/better-sqlite3/releases/download/v9.6.0/better-sqlite3-v9.6.0-node-v108-linux-x64.tar.gz" \
  -o /tmp/bsql3.tar.gz

tar -xzf /tmp/bsql3.tar.gz -C /tmp/
cp /tmp/build/Release/better_sqlite3.node \
   /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node
→ 파일 복사 ✅
```

#### 결과 — 여전히 실패
```
Error: /lib64/libm.so.6: version `GLIBC_2.29' not found
(required by .../better-sqlite3/build/Release/better_sqlite3.node)
code: 'ERR_DLOPEN_FAILED'
```

**원인**: GitHub에서 배포되는 공식 linux-x64 prebuilt binary 자체가
Ubuntu 18.04+ 환경에서 빌드되어 GLIBC 2.29를 링크함.
NAS(GLIBC 2.17)에서는 로드 불가.

---

## 📋 세션 124 — tsx 확인 및 PM2 서버 기동 시도

### [ISSUE-003] PM2 서버 기동 실패 — GLIBC 불일치 확인

**발생 시각**: 2026-07-30 (세션 124)  
**상태**: ⏳ 진행 중

#### tsx 확인 (세션 124 시작 시점)
```bash
ls -la /volume1/safetynote/node_modules/.bin/tsx
→ lrwxrwxrwx ... tsx -> ../tsx/dist/cli.mjs ✅
```

#### .env 파일 생성
```bash
cat > /volume1/safetynote/.env << 'EOF'
PORT=3443
DB_PATH=/volume1/safetynote/safety.db
UPLOAD_PATH=/volume1/safetynote/public/uploads
UPLOAD_SUBDIR=true
TZ=Asia/Seoul
HTTP_PORT=3444
EOF
```

#### PM2 시작 명령
```bash
NODE_BIN=/volume1/@appstore/Node.js_v18/usr/local/bin/node
TSX_BIN=/volume1/safetynote/node_modules/.bin/tsx

PORT=3443 pm2 start "$TSX_BIN" \
  --name safetynote \
  --interpreter "$NODE_BIN" \
  --cwd /volume1/safetynote \
  -- node-server.ts
```

#### PM2 상태
```
status: errored  (↺ 16회 재시작 반복)
```

#### 에러 로그
```
Error: /lib64/libm.so.6: version `GLIBC_2.29' not found
(required by .../better-sqlite3/build/Release/better_sqlite3.node)
    at Module._extensions..node (node:internal/modules/cjs/loader:1340:18)
    ...
code: 'ERR_DLOPEN_FAILED'
Node.js v18.18.2
```

#### 새로 파악된 사실
- NAS에 **Node.js 하위 버전이 동시 설치**되어 있음
- PATH 오염 가능성: 잘못된 Node 버전으로 binary가 선택되었을 수 있음
- 사용자 제안: **하위 버전 Node 전부 삭제 → Node18 재설치**

---

## 🔧 현재 진행 중인 해결 방향

### 방향: Node.js 하위 버전 제거 + Node18 재설치

**이 방법이 효과적인 이유:**
1. 하위 Node 버전의 PATH 오염 제거
2. Node18 재설치 시 npm postinstall 스크립트가 정상 경로에서 실행
3. better-sqlite3 binary가 정확한 ABI(node-v108)로 다시 생성될 가능성

**단, 재설치 전 반드시 확인할 것:**

```bash
# 1. 현재 설치된 Node 버전 전체 확인
ls /volume1/@appstore/ | grep -i node

# 2. 각 버전 확인
ls /volume1/@appstore/Node.js_v16/usr/local/bin/node 2>/dev/null && \
  echo "v16: $(/volume1/@appstore/Node.js_v16/usr/local/bin/node --version)"
ls /volume1/@appstore/Node.js_v18/usr/local/bin/node 2>/dev/null && \
  echo "v18: $(/volume1/@appstore/Node.js_v18/usr/local/bin/node --version)"
ls /volume1/@appstore/Node.js_v20/usr/local/bin/node 2>/dev/null && \
  echo "v20: $(/volume1/@appstore/Node.js_v20/usr/local/bin/node --version)"

# 3. 현재 PATH node 확인
which node && node --version

# 4. PM2 중지 후 삭제
pm2 delete safetynote

# 5. DSM 패키지 센터에서 하위 버전 삭제 후 Node18 재설치
#    → 패키지 센터 → 설치된 패키지 → Node.js vXX → 제거
#    → 패키지 센터 → Node.js v18 재설치

# 6. 재설치 후 npm install 재실행
cd /volume1/safetynote
rm -rf node_modules
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install --legacy-peer-deps

# 7. tsx 확인
ls /volume1/safetynote/node_modules/.bin/tsx

# 8. PM2 재기동
NODE_BIN=/volume1/@appstore/Node.js_v18/usr/local/bin/node
TSX_BIN=/volume1/safetynote/node_modules/.bin/tsx

PORT=3443 pm2 start "$TSX_BIN" \
  --name safetynote \
  --interpreter "$NODE_BIN" \
  --cwd /volume1/safetynote \
  -- node-server.ts

pm2 save --force
pm2 logs safetynote --nostream --lines 30
```

**예상 정상 로그:**
```
✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443
✅ HTTP 내부 포트 실행 중: http://0.0.0.0:3444 (Android FCM 전용)
[patchSchema] DB 스키마 최신 상태 확인 완료
```

---

## ⚠️ 만약 Node 재설치 후에도 GLIBC 오류가 계속되면

### 플랜 B: better-sqlite3 버전 다운그레이드

현재 설치된 버전(`12.9.0` 또는 `9.6.0`)이 모두 GLIBC 2.29를 요구함.
구버전(v7.x)은 더 낮은 GLIBC에서 동작 가능할 수 있음.

```bash
cd /volume1/safetynote
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install \
  better-sqlite3@7.6.2 --legacy-peer-deps --ignore-scripts

# v7.6.2용 node-v108 prebuilt binary 주입
curl -L \
  "https://github.com/WiseLibs/better-sqlite3/releases/download/v7.6.2/better-sqlite3-v7.6.2-node-v108-linux-x64.tar.gz" \
  -o /tmp/bsql3_v7.tar.gz
tar -xzf /tmp/bsql3_v7.tar.gz -C /tmp/
cp /tmp/build/Release/better_sqlite3.node \
   /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

### 플랜 C: linuxmusl binary 시도 (마지막 수단)

> ⚠️ NAS는 glibc 기반 → musl binary는 통상 동작하지 않음. 확률 낮음.

```bash
curl -L \
  "https://github.com/WiseLibs/better-sqlite3/releases/download/v9.6.0/better-sqlite3-v9.6.0-node-v108-linuxmusl-x64.tar.gz" \
  -o /tmp/bsql3_musl.tar.gz
tar -xzf /tmp/bsql3_musl.tar.gz -C /tmp/
cp /tmp/build/Release/better_sqlite3.node \
   /volume1/safetynote/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

---

## ✅ 해결 완료 항목

| 항목 | 해결 세션 | 방법 |
|------|-----------|------|
| npm install eresolve | 세션 123 | `--legacy-peer-deps --ignore-scripts` |
| tsx 미설치 | 세션 123 | `--ignore-scripts` 후 tsx 포함 94 packages 설치 |
| .env 파일 없음 | 세션 124 | 직접 생성 (PORT/DB_PATH/UPLOAD_PATH/TZ 등) |

---

## 📝 다음 세션 인계 사항

### 즉시 확인할 것
1. **Node.js 하위 버전 제거 + Node18 재설치 결과** 확인
2. 재설치 후 `npm install` → `pm2 logs` 출력 내용 확인
3. 여전히 GLIBC 오류 시 → 플랜 B(버전 다운그레이드) 진행

### 재설치 완료 후 남은 작업
- [ ] Watchdog(pm2-watchdog.sh) DSM 작업 스케줄러 등록
- [ ] 브라우저 접속 확인 (`https://NAS_IP:3443`)
- [ ] 초기 관리자 계정(admin/admin1234) 로그인 → 비밀번호 변경
- [ ] APK 파일 업로드 (시스템설정 → APK 탭)
- [ ] install.sh 버그 수정 (npm 실패 시 OK 오판 로직) ← 별도 진행

---

## 📎 관련 문서

| 문서 | 경로 | 설명 |
|------|------|------|
| NAS 설치 가이드 | `docs/NAS_INSTALL_GUIDE.md` | 전체 설치 절차 (Node 다중설치 충돌 주의사항 포함) |
| 빌드/배포 가이드 | `docs/BUILD_AND_DEPLOY_GUIDE.md` | 자동배포 구조 |
| 버그픽스 로그 | `BUGFIX_LOG.md` | 기존 NAS 버그 이력 |

---

*NAS_INSTALL_SUPPORT_LOG.md*  
*최초 작성: 세션 99 (2026-07-27)*  
*최종 업데이트: 세션 124 (2026-07-30)*  
*다음 세션 시작 시 이 파일을 먼저 읽어 컨텍스트 복원*
