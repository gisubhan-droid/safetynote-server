# SafetyNOTE — NAS 설치 지원 로그 (NAS_INSTALL_SUPPORT_LOG)

> 목적: 새 NAS에 SafetyNOTE 설치 중 발생한 문제 및 해결 과정 기록  
> 작성 시작: 세션 99 (2026-07-27)  
> 담당: 에이전트 자동 기록  
> ⚠️ 이 파일은 세션이 끊겨도 이어서 지원할 수 있도록 유지됩니다.

---

## 📌 현재 상태 요약 (세션 124 최종)

| 항목 | 내용 |
|------|------|
| **지원 대상** | 신규 NAS (`root@sh_sever`) |
| **진행 단계** | ✅ **설치 완료** |
| **최종 상태** | 서버 정상 기동 확인, 브라우저 접속 성공 |
| **해결 세션** | 세션 124 (2026-07-30) |

---

## 🖥️ 대상 NAS 환경 정보

| 항목 | 확인된 값 | 비고 |
|------|-----------|------|
| NAS 호스트명 | `sh_sever` | — |
| Node.js 버전 | `v18.18.2` | `/volume1/@appstore/Node.js_v18/` |
| npm 버전 | `9.8.1` | — |
| Linux 커널 | `4.4.180+` | ⚠️ 구형 커널 |
| GLIBC 버전 | `2.17` (추정) | GLIBC_2.29 미지원 |
| make/gcc | **없음** | node-gyp 컴파일 불가 |
| Git 버전 | `2.55.0` | ✅ |
| PM2 버전 | `7.0.3` | ✅ |
| Python | `3.8.12` | ✅ (node-gyp에서 탐지) |
| 설치 경로 | `/volume1/safetynote` | ✅ |
| SSL 인증서 | Synology 자동 탐지 | `/usr/syno/etc/certificate/_archive/mpOrcR` |
| Node v12 | 초기 설치됨 → **제거 완료** | PATH 오염 원인이었음 |

---

## ✅ 해결 완료 항목 (전체)

| # | 문제 | 원인 | 해결 방법 | 세션 |
|---|------|------|-----------|------|
| 1 | `npm install` eresolve | wrangler↔@cloudflare/workers-types 버전 충돌 | `--legacy-peer-deps` 옵션 추가 | 123 |
| 2 | `tsx` 미설치 | npm install 실패로 패키지 미설치 | `--ignore-scripts`로 설치 완료 | 123 |
| 3 | `.env` 파일 없음 | 신규 NAS라 생성 필요 | 직접 생성 (PORT/DB_PATH/UPLOAD_PATH 등) | 124 |
| 4 | better-sqlite3 GLIBC_2.29 오류 | NAS GLIBC_2.17 < 요구 GLIBC_2.29 | **v8.0.0 prebuilt binary 주입** | 124 |
| 5 | Node v12 동시 설치 | PATH 오염 가능성 | DSM 패키지 센터에서 v12 제거 | 124 |

---

## 📋 세션별 상세 기록

### 세션 99~100 — ISSUE-001 최초 발생

- `install.sh` Step 6 npm install eresolve 실패
- `install.sh` 버그: 오류 무시하고 `[ OK ]` 출력 → tsx 미설치 → 서버 기동 불가
- `--legacy-peer-deps` 처방 후 세션 종료 (미해결)

### 세션 123 — npm 설치 및 tsx 완료

```bash
# eresolve + make 없음 → 두 옵션 동시 사용
npm install --legacy-peer-deps --ignore-scripts
→ added 94 packages ✅

# tsx 확인
ls node_modules/.bin/tsx
→ tsx -> ../tsx/dist/cli.mjs ✅
```

### 세션 124 — better-sqlite3 GLIBC 문제 해결 (핵심)

#### 원인 분석 과정

```
1차 시도: npm install --legacy-peer-deps (ignore-scripts 없이)
→ better-sqlite3 postinstall 실행
→ prebuild-install: GLIBC_2.29 not found (현재 설치된 v12.9.0 binary)
→ node-gyp 소스 컴파일 시도
→ make not found → 실패

발견: npm이 자동으로 better-sqlite3@12.9.0 설치
→ v12.9.0은 node-v108(Node18) prebuilt 자체가 없음!
→ node-v115(Node20) 이상만 지원

GitHub Releases 전수 조사:
- v12.9.0: node-v108 없음 ❌
- v11.10.0: node-v108 있음, but GLIBC_2.29 요구 ❌
- v9.6.0:  node-v108 있음, but GLIBC_2.29 요구 ❌
- v8.6.0:  node-v108 있음, but GLIBC_2.29 요구 ❌
- v8.0.0:  node-v108 있음, GLIBC 최대 2.14 ✅ ← 채택
- v7.6.2:  node-v108 있음, GLIBC 최대 2.14 ✅
```

#### 최종 해결 절차

```bash
# Step 1: node_modules 완전 삭제
rm -rf /volume1/safetynote/node_modules

# Step 2: --ignore-scripts로 전체 설치
npm install --legacy-peer-deps --ignore-scripts
→ 94 packages ✅

# Step 3: better-sqlite3 v8.0.0으로 교체
npm install better-sqlite3@8.0.0 --legacy-peer-deps --ignore-scripts

# Step 4: v8.0.0 Node18용 prebuilt binary 주입
curl -L \
  "https://github.com/WiseLibs/better-sqlite3/releases/download/v8.0.0/better-sqlite3-v8.0.0-node-v108-linux-x64.tar.gz" \
  -o /tmp/bsql3.tar.gz
tar -xzf /tmp/bsql3.tar.gz -C /tmp/
mkdir -p node_modules/better-sqlite3/build/Release/
cp /tmp/build/Release/better_sqlite3.node \
   node_modules/better-sqlite3/build/Release/better_sqlite3.node

# GLIBC 검증
grep -ao "GLIBC_[0-9.]*" \
  node_modules/better-sqlite3/build/Release/better_sqlite3.node | sort -u
→ GLIBC_2.14, GLIBC_2.2.5, GLIBC_2.3.4, GLIBC_2.4 ✅ (2.29 없음)

# Step 5: PM2 기동
NODE_BIN=/volume1/@appstore/Node.js_v18/usr/local/bin/node
TSX_BIN=/volume1/safetynote/node_modules/.bin/tsx

pm2 start "$TSX_BIN" \
  --name safetynote \
  --interpreter "$NODE_BIN" \
  --cwd /volume1/safetynote \
  -- node-server.ts

pm2 save --force
```

#### 최종 확인 로그

```
✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443
✅ HTTP 내부 포트 실행 중: http://0.0.0.0:3444 (Android FCM 전용)
[SSL] Synology 인증서 로드 완료: /usr/syno/etc/certificate/_archive/mpOrcR
[설정] rawDb system_settings 동기화 완료 (25건)
[백업] 다음 자동 백업 예약: 33시간 24분 후 (새벽 2:00)
```

**브라우저 접속 성공 ✅ — 세션 124 (2026-07-30)**

---

## 📌 설치 후 남은 작업 (선택적)

| 항목 | 상태 | 설명 |
|------|------|------|
| Watchdog 등록 | ⏳ 권장 | DSM 작업 스케줄러 → `bash /volume1/safetynote/scripts/pm2-watchdog.sh` |
| 초기 비밀번호 변경 | ⏳ 필수 | 브라우저 로그인 후 admin → 비밀번호 변경 |
| APK 파일 업로드 | ⏳ 권장 | 시스템설정 → APK 탭 |
| install.sh 버그 수정 | ⏳ 선택 | npm 실패 시 OK 오판 로직 수정 |

---

## 🔑 핵심 교훈 (다음 유사 NAS 설치 시 참고)

### 구형 NAS(커널 4.4.x, GLIBC 2.17) better-sqlite3 설치 공식

```
better-sqlite3 v8.0.0 + node-v108-linux-x64 prebuilt binary
= GLIBC 최대 2.14 요구 → GLIBC 2.17 NAS에서 동작 ✅
```

### GLIBC 버전별 호환 better-sqlite3 버전

| better-sqlite3 버전 | node-v108 prebuilt | GLIBC 요구 | NAS(2.17) 호환 |
|---------------------|--------------------|-----------:|:---:|
| v12.9.0 | ❌ 없음 | — | ❌ |
| v11.10.0 | ✅ 있음 | 2.29 | ❌ |
| v9.6.0 | ✅ 있음 | 2.29 | ❌ |
| v8.6.0 | ✅ 있음 | 2.29 | ❌ |
| **v8.0.0** | ✅ 있음 | **2.14** | ✅ **채택** |
| v7.6.2 | ✅ 있음 | 2.14 | ✅ |

### GLIBC 요구사항 확인 명령 (NAS에서)

```bash
# objdump/strings 없는 NAS에서 사용 가능한 방법
grep -c "GLIBC_2.29" /path/to/better_sqlite3.node
# → 0 이면 GLIBC_2.29 불필요 ✅
# → 1 이상이면 이 NAS에서 불가 ❌

grep -ao "GLIBC_[0-9.]*" /path/to/better_sqlite3.node | sort -u
# → 요구하는 GLIBC 버전 전체 목록
```

---

## 📎 관련 문서

| 문서 | 경로 | 설명 |
|------|------|------|
| NAS 설치 가이드 | `docs/NAS_INSTALL_GUIDE.md` | 전체 설치 절차 (13장: 구형 NAS 전용) |
| 빌드/배포 가이드 | `docs/BUILD_AND_DEPLOY_GUIDE.md` | 자동배포 구조 |
| 버그픽스 로그 | `BUGFIX_LOG.md` | 기존 NAS 버그 이력 |

---

*NAS_INSTALL_SUPPORT_LOG.md*  
*최초 작성: 세션 99 (2026-07-27)*  
*최종 업데이트: 세션 124 (2026-07-30) — ISSUE-001 해결 완료*
