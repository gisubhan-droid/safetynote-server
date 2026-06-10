# Safety NOTE — NAS HTTPS 설정 가이드

> **작성일**: 2026-06-10  
> **적용 버전**: node-server.ts (커밋 `1f1f0dd` 이후)  
> **검증 환경**: Synology NAS (LINKMAX_M), DSM 7.x

---

## ✅ 구조 요약

```
앱/브라우저
    ↓ https://linkmax.myds.me:3443
공유기 포트포워딩 (외부 3443 → NAS 내부 IP:3443)
    ↓
node-server.ts (PORT=3443)
    ← https.createServer() 로 HTTPS 직접 서빙
    ← Synology DSM 인증서 자동 로드
```

**핵심**: Synology 리버스 프록시 불필요. node-server.ts가 직접 HTTPS 처리.

---

## 📁 Synology 인증서 경로

```bash
# 현재 활성 인증서 폴더명 확인
cat /usr/syno/etc/certificate/_archive/DEFAULT
# 예: 4a2zGZ

# 인증서 파일 목록
ls /usr/syno/etc/certificate/_archive/4a2zGZ/
# cert.pem  chain.pem  fullchain.pem  privkey.pem  ...

# node-server.ts에서 사용하는 파일
# - privkey.pem   : 개인키
# - fullchain.pem : 인증서 + 중간CA (전체 체인)
```

---

## 🔧 node-server.ts 핵심 코드

```typescript
import * as https from 'node:https'

function loadSynologyCert() {
  const defaultPath = '/usr/syno/etc/certificate/_archive/DEFAULT'
  if (!existsSync(defaultPath)) return null
  const archiveName = readFileSync(defaultPath, 'utf-8').trim()
  const certDir = `/usr/syno/etc/certificate/_archive/${archiveName}`
  return {
    key:  readFileSync(join(certDir, 'privkey.pem'),  'utf-8'),
    cert: readFileSync(join(certDir, 'fullchain.pem'), 'utf-8'),
  }
}

const tlsCert = loadSynologyCert()

if (tlsCert) {
  // NAS: HTTPS 직접 서빙
  const httpsServer = https.createServer({ key: tlsCert.key, cert: tlsCert.cert }, handler)
  httpsServer.keepAliveTimeout = 65000
  httpsServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 서버 실행 중 (HTTPS): https://0.0.0.0:${PORT}`)
  })
} else {
  // 샌드박스/개발: HTTP 폴백 (인증서 없으면 자동)
  serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
    console.log(`✅ 서버 실행 중 (HTTP): http://0.0.0.0:${info.port}`)
  })
}
```

---

## 🚀 NAS 적용 방법

```bash
cd /volume1/safetynote

# 코드 업데이트
git pull origin main

# PM2 재시작
pm2 restart safetynote --update-env

# 정상 로그 확인
sleep 5 && pm2 logs safetynote --nostream --lines 10
```

### 정상 로그
```
[SSL] Synology 인증서 로드 완료: /usr/syno/etc/certificate/_archive/4a2zGZ
✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443
```

---

## ⚠️ 주의사항

### 1. 인증서 갱신 시
Synology DSM이 Let's Encrypt 인증서를 자동 갱신하면 `DEFAULT` 파일의 폴더명이 바뀔 수 있음.
- `loadSynologyCert()`는 매 서버 시작 시 `DEFAULT` 파일을 읽어 동적으로 경로를 탐지
- **인증서 갱신 후 `pm2 restart safetynote` 필요** (새 인증서 로드)

### 2. 절대 하지 말 것
| ❌ 금지 | 이유 |
|---------|------|
| `loadSynologyCert()` 삭제 | HTTPS 불가 |
| `https.createServer()` → `serve()`로 교체 | ERR_SSL_PROTOCOL_ERROR |
| 인증서 경로 하드코딩 | DSM 갱신 시 경로 변경으로 실패 |
| PORT 3443 변경 | 공유기 포트포워딩 3443 고정 |
| Synology 리버스 프록시 설정 추가 | 이중 SSL로 충돌 |

### 3. 샌드박스 vs NAS 동작 차이
| 환경 | 인증서 | 서버 종류 | 로그 |
|------|--------|-----------|------|
| NAS (운영) | `/usr/syno/etc/certificate/_archive/*/` 있음 | **HTTPS** | `✅ 서버 실행 중 (HTTPS)` |
| 샌드박스 (개발) | 경로 없음 | **HTTP 자동 폴백** | `✅ 서버 실행 중 (HTTP)` |

→ **코드 변경 없이** 두 환경에서 모두 동작

---

## 🔍 문제 진단

### ERR_SSL_PROTOCOL_ERROR 발생 시
```bash
# 1. 로그 확인
pm2 logs safetynote --nostream --lines 20
# "[SSL] Synology 인증서 로드 완료" 메시지 있는지 확인

# 2. 인증서 파일 존재 확인
cat /usr/syno/etc/certificate/_archive/DEFAULT
ls /usr/syno/etc/certificate/_archive/$(cat /usr/syno/etc/certificate/_archive/DEFAULT)/

# 3. 포트 확인
netstat -tlnp | grep 3443
# HTTPS면: 3443 LISTEN node (정상)

# 4. PM2 재시작
pm2 restart safetynote --update-env
```

### "인증서 로드 실패" 로그 시
```bash
# DSM 인증서 경로 직접 확인
ls /usr/syno/etc/certificate/system/default/
# RSA-cert.pem, RSA-privkey.pem, RSA-fullchain.pem 등 있으면
# loadSynologyCert()의 대체 경로로 이 경로 추가 고려
```

### EADDRINUSE: 포트 3443 이미 사용 중 (접속 불가)

**증상**: 서버가 `online` 상태인데 `https://linkmax.myds.me:3443` 접속 불가.  
로그에 `EADDRINUSE: address already in use 0.0.0.0:3443` 에러.

**원인**: `node-server.ts` 구버전에서 HTTPS 성공 후 HTTP `serve()`도 같은 포트로 시작하는 버그.  
즉, HTTPS가 3443을 점유한 직후 HTTP도 3443에 bind 시도 → `EADDRINUSE` → `process.exit(1)` → **서버 즉시 종료**.

```
[SSL] Synology 인증서 로드 완료         ← HTTPS가 3443 점유
✅ HTTP  서버 실행 중: http://0.0.0.0:3443  ← HTTP도 3443 시도 (버그)
Error: listen EADDRINUSE 0.0.0.0:3443   ← 충돌
→ process.exit(1)  → 서버 종료, netstat에 3443 없음
```

**근본 원인**: GitHub repo에 잘못된 커밋(구버전 `node-server.ts`)이 올라가 있을 때,  
NAS에서 `git reset --hard origin/main` 실행 시 구버전으로 되돌아가는 현상.

> ⚠️ **발생 패턴**: 샌드박스에서 **두 개의 다른 repo 작업 중** 커밋이 잘못된 remote에 force push되면  
> NAS의 `node-server.ts`가 예전 버전으로 교체될 수 있음.

**해결 절차**:
```bash
# [샌드박스] safetynote-server repo가 올바른 node-server.ts를 포함하는지 확인
cd /home/user/webapp-deploy/safetynote
grep -c "HTTPS" node-server.ts   # 12 이상이면 정상

# [샌드박스] 로컬 기준으로 GitHub force push
git push -f origin main

# [NAS] 최신 코드로 동기화 후 재시작
cd /volume1/safetynote
git fetch origin
git reset --hard origin/main
pm2 restart safetynote --update-env
sleep 5 && pm2 logs safetynote --nostream --lines 10
```

**정상 확인**: 로그에 아래 한 줄만 나와야 함 (HTTP 줄 없어야 함)
```
[SSL] Synology 인증서 로드 완료: /usr/syno/etc/certificate/_archive/4a2zGZ
✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443
```

---

### 포트 강제 해제 후 재시작 (EADDRINUSE 잔존 시)

```bash
fuser -k 3443/tcp 2>/dev/null || true
pm2 restart safetynote --update-env
sleep 5 && pm2 logs safetynote --nostream --lines 10
```

---

## 📝 히스토리

| 날짜 | 이슈 | 해결 |
|------|------|------|
| 2026-06-10 | ERR_SSL_PROTOCOL_ERROR — Synology 리버스프록시 없음 | node-server.ts에 HTTPS 직접 서빙 추가 |
| 2026-06-10 | 인증서 로드 완료, https://linkmax.myds.me:3443 정상 접속 | ✅ 확인 |
| 2026-06-10 | git reset 후 접속 불가 — EADDRINUSE로 서버 즉시 종료 | safetynote-server repo force push → NAS git reset → pm2 restart ✅ |
