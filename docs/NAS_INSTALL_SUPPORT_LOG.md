# SafetyNOTE — NAS 설치 지원 로그 (NAS_INSTALL_SUPPORT_LOG)

> 목적: 새 NAS에 SafetyNOTE 설치 중 발생한 문제 및 해결 과정 기록  
> 작성 시작: 세션 99 (2026-07-27)  
> 담당: 에이전트 자동 기록  
> ⚠️ 이 파일은 세션이 끊겨도 이어서 지원할 수 있도록 유지됩니다.

---

## 📌 현재 상태 요약 (세션 100 기준)

| 항목 | 내용 |
|------|------|
| **지원 대상** | 신규 NAS (기존 운영 NAS와 별도) |
| **진행 단계** | Step 6/8 (npm 패키지 설치) 실패 |
| **현재 문제** | `npm install` eresolve 의존성 충돌 → `tsx` 미설치 → 서버 시작 불가 |
| **해결 상태** | ⏳ 진행 중 — 사용자 재설치 결과 대기 중 |

---

## 🖥️ 대상 NAS 환경 정보

| 항목 | 확인된 값 | 비고 |
|------|-----------|------|
| Git 버전 | `2.55.0` | ✅ 정상 |
| PM2 버전 | `7.0.3` | ✅ 정상 |
| Node.js 버전 | 미확인 | ⚠️ 확인 필요 (`v18` or `v20`) |
| DSM 버전 | 미확인 | 확인 필요 |
| NAS 모델 | 미확인 | 확인 필요 |
| 설치 경로 | `/volume1/safetynote` | 기본값 |

---

## 📋 세션 99 — 발생 문제 및 대응 기록

### [ISSUE-001] npm install eresolve 의존성 충돌

**발생 시각**: 2026-07-27 (세션 99)  
**발생 단계**: `install.sh` Step 6/8 npm 패키지 설치  
**상태**: ⏳ 해결 시도 중

#### 증상 (사용자 제공 로그)
```
━━━ Step 6/8: npm 패키지 설치 ━━━
[INFO]  패키지 설치 중... (3~10분 소요)
npm ERR! 
npm ERR! For a full report see:
npm ERR! /root/.npm/_logs/2026-07-27T07_00_21_543Z-eresolve-report.txt

npm ERR! A complete log of this run can be found in: /root/.npm/_logs/2026-07-27T07_00_21_543Z-debug-0.log
[ OK ]  패키지 설치 완료
[ERR ]  tsx를 찾을 수 없습니다: /volume1/safetynote/node_modules/.bin/tsx
npm install 이 정상적으로 완료됐는지 확인해주세요.
```

#### 원인 분석
- `npm install` 이 `eresolve` 오류(의존성 버전 충돌)로 실패
- `install.sh` 스크립트가 `npm ERR!` 이후에도 `[ OK ]` 로 잘못 판단하고 진행
- `tsx` 바이너리가 `node_modules/.bin/`에 생성되지 않아 서버 시작 불가

#### 처방 (에이전트 안내 내용)

**Step 1** — 오류 상세 확인:
```bash
cat /root/.npm/_logs/2026-07-27T07_00_21_543Z-eresolve-report.txt
```

**Step 2** — `--legacy-peer-deps` 옵션으로 재설치:
```bash
cd /volume1/safetynote
rm -rf node_modules
/volume1/@appstore/Node.js_v18/usr/local/bin/npm install --legacy-peer-deps
```

**Step 3** — tsx 설치 확인:
```bash
ls -la /volume1/safetynote/node_modules/.bin/tsx
```

**Step 4** — 서버 시작:
```bash
NODE_BIN=/volume1/@appstore/Node.js_v18/usr/local/bin/node
TSX_BIN=/volume1/safetynote/node_modules/.bin/tsx

PORT=3443 pm2 start "$TSX_BIN" \
  --name safetynote \
  --interpreter "$NODE_BIN" \
  --cwd /volume1/safetynote \
  -- node-server.ts

pm2 save --force
```

**Step 5** — 기동 확인:
```bash
pm2 status
pm2 logs safetynote --nostream --lines 20
```
> 정상: `✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443`

#### 결과
- ⏳ **사용자 재설치 결과 대기 중** — 세션 99 종료 시점 미해결

---

## 📝 다음 세션 인계 사항

### 즉시 확인할 것
1. **ISSUE-001 해결 여부** — `--legacy-peer-deps` 재설치 성공 여부
2. 실패 시 → 오류 로그 내용 확인 후 추가 처방 필요

### 추가 수집 필요한 환경 정보
```bash
# Node.js 버전 확인
/volume1/@appstore/Node.js_v18/usr/local/bin/node --version

# v18 없으면 v20 경로 확인
ls /volume1/@appstore/Node.js_v20/usr/local/bin/node 2>/dev/null && \
  /volume1/@appstore/Node.js_v20/usr/local/bin/node --version

# npm 버전 확인
/volume1/@appstore/Node.js_v18/usr/local/bin/npm --version

# 설치 폴더 상태
ls -la /volume1/safetynote/
```

### 예상 후속 이슈 (미리 파악)

| 예상 이슈 | 조건 | 처방 |
|-----------|------|------|
| Node.js v20만 설치됨 | v18 경로 없음 | v20 경로로 npm install 시도 |
| npm 버전 너무 낮음 | npm < 8 | `npm install -g npm@latest` 후 재시도 |
| 특정 패키지 설치 실패 | eresolve 지속 | `--force` 옵션 또는 문제 패키지 수동 처리 |
| tsx 설치 후 서버 시작 오류 | PM2 path 문제 | `--cwd /volume1/safetynote` 옵션 확인 (FIX-052) |

---

## ✅ 해결 완료 항목

_(아직 없음 — 진행 중)_

---

## 📎 관련 문서

| 문서 | 경로 | 설명 |
|------|------|------|
| NAS 설치 가이드 | `docs/NAS_INSTALL_GUIDE.md` | 전체 설치 절차 |
| 빌드/배포 가이드 | `docs/BUILD_AND_DEPLOY_GUIDE.md` | 자동배포 구조 |
| 버그픽스 로그 | `BUGFIX_LOG.md` | 기존 NAS 버그 이력 |

---

*NAS_INSTALL_SUPPORT_LOG.md — 최초 작성: 세션 99 (2026-07-27)*  
*다음 세션 시작 시 이 파일을 먼저 읽어 컨텍스트 복원*
