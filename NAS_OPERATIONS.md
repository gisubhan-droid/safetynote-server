# SafetyNOTE — NAS별 운영 현황

> **마스터 문서**: 모든 NAS 운영 현황을 이 파일에서 일괄 관리합니다.  
> 신규 NAS 설치 시 이 문서를 가장 먼저 업데이트하세요.  
> 상세 이력: `PROJECT_HISTORY.md`(NAS001 기준) 또는 NAS별 별도 섹션 참조.

---

## 📊 NAS 운영 현황 마스터 테이블

| NAS ID | 고객사 | URL | 설치일 | 현재 버전 | Node.js | 상태 | 담당자 |
|--------|--------|-----|--------|-----------|---------|------|--------|
| **NAS001** | **LinkMax 본사** | https://linkmax.myds.me:3443 | 2026-06-10 | v2.0.0+ | v18 | ✅ 운영중 | 링크맥스 담당자 |

> 신규 NAS 추가 시 위 테이블에 행을 추가하고 아래 섹션도 함께 작성하세요.

---

## 🏢 NAS001 — LinkMax 본사 (최초 설치)

### 기본 정보

| 항목 | 내용 |
|------|------|
| **NAS ID** | NAS001 |
| **고객사** | LinkMax 본사 |
| **URL** | https://linkmax.myds.me:3443 |
| **최초 설치일** | 2026-06-10 (세션 1) |
| **역할** | 최초 설치 고객사 — 모든 개발·테스트·버그픽스의 기준 환경 |
| **레지스트리** | `nas-registry.json` → `"id": "NAS001"` |

### 환경 정보

| 항목 | 내용 |
|------|------|
| **OS** | Synology DSM (Linux 4.4.180+) |
| **Node.js** | v18.18.2 (`/volume1/@appstore/Node.js_v18`) |
| **PM2 앱명** | `safetynote` |
| **PORT** | 3443 |
| **설치 경로** | `/volume1/safetynote` |
| **실제 DB 경로** | `/volume1/safetynote/data/safety.db` ⚠️ 심볼릭 링크 구조 |
| **업로드 경로** | `/volume1/safetynote/public/uploads` |
| **시스템 파티션** | `/dev/md0` 2.3GB |
| **데이터 파티션** | `/volume1` 11TB |

### ⚠️ NAS001 특이사항

1. **DB 심볼릭 링크 구조**
   ```
   /volume1/safetynote/safety.db          → 심볼릭 링크 (실제 DB 아님)
   /volume1/safetynote/data/safety.db     → 실제 운영 DB ✅
   /volume1/safetynote/data/safetynote.db → 빈 파일 (무시)
   ```
   `.env`에 반드시 `DB_PATH=/volume1/safetynote/data/safety.db` 설정

2. **NAS Webhook URL** (GitHub Secrets 등록)
   ```
   NAS_WEBHOOK_URL_1 = https://linkmax.myds.me:3443/api/admin/update/webhook
   ```

3. **Node.js PATH 설정** (재부팅 후 적용)
   ```bash
   export PATH=/opt/bin:/opt/sbin:/volume1/@appstore/Node.js_v18/usr/local/bin:$PATH
   ```

4. **better-sqlite3** — glibc 2.26 환경, gcc/make 없음 (Entware 미설치)
   - v9.x prebuilt → GLIBC_2.29 필요 → ❌ 불가
   - **해결책: v8.0.0 node-v108 바이너리 교체** (GLIBC_2.14 이하만 사용) ✅
   - npm install 후 바이너리 재교체 필요 → `scripts/fix-sqlite3-binary.sh` 실행
   ```bash
   bash /volume1/safetynote/scripts/fix-sqlite3-binary.sh
   ```

### PM2 등록 명령어 (NAS001 기준)

```bash
PORT=3443 pm2 start /volume1/safetynote/node_modules/.bin/tsx \
  --name safetynote \
  --interpreter /usr/local/bin/node \
  -- node-server.ts

pm2 start /volume1/safetynote/scripts/recovery-server.py \
  --name safetynote-recovery \
  --interpreter /usr/bin/python3 \
  -- /volume1/safetynote 3445

pm2 save
```

> ⚠️ `ecosystem.config.cjs` 방식은 NAS PM2에서 hang 발생 → 반드시 커맨드라인 직접 등록 방식 사용

### 백업 기록

| 날짜 | 종류 | 경로 | 비고 |
|------|------|------|------|
| 2026-06-11 | DB 백업 | `/volume1/safetynote_data/safety_backup_20260611.db` | git pull 적용 전 운영 DB |
| 2026-06-11 | 소스 백업 | `/volume1/safetynote_backup_20260611.tar.gz` (142MB) | node_modules/.git 제외 |

### 주요 이력 요약

| 날짜 | 세션 | 내용 |
|------|------|------|
| 2026-06-10 | 세션 1 | **최초 설치** — NAS Node.js 서버 초기 커밋 (v1.2.5 코드베이스) |
| 2026-06-10 | 세션 2 | NAS 상태 확인, git reset --hard, 보안 토큰 교체 |
| 2026-06-10 | 세션 3~4 | PORT=3443 고정, PM2 커맨드라인 직접 등록 확정 |
| 2026-06-15 | 세션 23 | NAS 장애 복구 (better-sqlite3 소스빌드, 디스크 정리) |
| 2026-07-02 | 세션 73 | 다중 NAS 자동 업데이트 (GitHub Actions Webhook) 구축 |
| 2026-07-25 | 세션 80 | v2.0.0 최종 버전 태깅 + APK v2.0.0 동시 릴리즈 |
| 2026-07-30 | 세션 123 | FEAT-COL-PERSIST (현재 최신) |
| 2026-07-31 | — | NAS_OPERATIONS.md 문서 신규 작성 (NAS001/신규 NAS 구분 정리) |

> 전체 상세 이력 → `PROJECT_HISTORY.md` 참조 (전체가 NAS001 LinkMax 기준)

---

## 🆕 신규 NAS 추가 절차

신규 NAS 설치 시 아래 순서로 진행하세요.

### 1단계 — nas-registry.json 등록

```json
{
  "id": "NAS002",
  "name": "고객사명 본사",
  "url": "https://도메인:포트",
  "active": true,
  "install_date": "YYYY-MM-DD",
  "app_version": "v2.0.0+",
  "contact": "담당자명",
  "note": "특이사항"
}
```

### 2단계 — GitHub Secrets 등록

```
Settings → Secrets and variables → Actions → New repository secret
NAS_WEBHOOK_URL_2 = https://신규도메인:포트/api/admin/update/webhook
NAS_WEBHOOK_SECRET_2 = 신규NAS_DEPLOY_WEBHOOK_SECRET값
```

### 3단계 — NAS에서 install.sh 실행

```bash
curl -fsSL https://raw.githubusercontent.com/gisubhan-droid/safetynote-server/main/scripts/install.sh | bash
```

> 상세 설치 절차 → `INSTALL.md` 2장 참조

### 4단계 — 이 문서(NAS_OPERATIONS.md) 업데이트

- 마스터 테이블에 신규 행 추가
- 신규 NAS 전용 섹션 작성 (NAS002 섹션 형식 참조)
- `nas-registry.json` `_history` 배열에 설치 기록 추가

### 5단계 — 운영 이력 기록 방침

> ⚠️ **신규 NAS 이력은 PROJECT_HISTORY.md에 혼용 금지**  
> - PROJECT_HISTORY.md = NAS001 LinkMax 본사 전용 이력  
> - 신규 NAS 이슈/버그/작업 이력은 이 문서(NAS_OPERATIONS.md)의 해당 NAS 섹션에 기록

---

## 📋 NAS 공통 체크리스트 (설치 후 필수 확인)

- [ ] `.env` → `PORT` / `JWT_SECRET` / `RECOVERY_PASSWORD` NAS001과 다른지 확인
- [ ] `.env` → `DB_PATH` 실제 DB 경로 확인
- [ ] `pm2 save` + `pm2 startup` 완료 (재부팅 자동시작)
- [ ] Watchdog 등록 (`scripts/pm2-watchdog.sh` → DSM 작업 스케줄러 5분 주기)
- [ ] GitHub Secrets `NAS_WEBHOOK_URL_N` 등록
- [ ] 브라우저에서 `https://NAS주소:포트` 접속 확인
- [ ] 관리자 계정 초기 비밀번호 변경
- [ ] `nas-registry.json` + `NAS_OPERATIONS.md` 업데이트 후 git push

---

*최초 작성: 2026-07-31 | NAS001 LinkMax 본사 기준*  
*업데이트 시 반드시 마스터 테이블 + 해당 NAS 섹션 동시 수정*
