# SafetyNOTE — NAS 신규 설치 지원 로그

> **목적**: 신규 NAS 설치 지원 세션별 진행 기록  
> **대상**: NAS001(링크맥스) 이후 추가되는 모든 신규 NAS  
> **주의**: NAS001(링크맥스 본사) 이력은 이 파일에 기록하지 않음 → `PROJECT_HISTORY.md` 참조

---

## 📊 신규 NAS 설치 현황

| NAS ID | 고객사 | 설치일 | 상태 | 현재 단계 |
|--------|--------|--------|------|----------|
| **NAS002** | 미확인 | 2026-07-31 | ✅ 완료 | 서버 정상 동작 확인 |

---

## 🏢 NAS002 — 신규 설치 (세션 126~)

### 환경 정보 (확인 완료)

| 항목 | 내용 |
|------|------|
| **호스트명** | `sh_sever` |
| **Node.js** | v18 (`/volume1/@appstore/Node.js_v18`) |
| **설치 경로** | `/volume1/safetynote` |
| **DB 경로** | `/volume1/safetynote/safety.db` |
| **PM2 앱명** | `safetynote` |
| **SSL 인증서** | `/usr/syno/etc/certificate/_archive/YJtSuj` |
| **포트** | HTTPS 3443, HTTP 3444 |
| **고객사** | 미확인 |

---

### 설치 진행 이력

#### ✅ 완료
| 단계 | 내용 | 비고 |
|------|------|------|
| 1 | install.sh 실행 → 설치 완료 | |
| 2 | better-sqlite3 GLIBC 불호환 해결 | NAS001과 동일: v8.0.0 node-v108 바이너리 교체 |
| 3 | 서버 online 확인 | pm2 status: online |
| 4 | 로그인 성공 | users 테이블 수동 CREATE + admin INSERT 후 성공 |
| 5 | 500 에러 원인 분석 | tasks/constructions/checklist_items 미생성 확인 |

#### 🔄 현재 진행 중
- **데이터 로드 500 에러** — `scripts/nas002_db_init.js` 실행 중

---

### 문제 1: better-sqlite3 GLIBC 불호환 (해결 ✅)

> NAS001과 동일한 문제 → `scripts/fix-sqlite3-binary.sh` 참조

---

### 문제 2: 로그인 불가 — users 테이블 미생성 (해결 ✅)

#### 원인
- DB에 `users` 테이블이 없어 로그인 API 500 에러

#### 해결
```bash
pm2 stop safetynote

/volume1/@appstore/Node.js_v18/usr/local/bin/node -e "
const Database = require('/volume1/safetynote/node_modules/better-sqlite3');
const db = new Database('/volume1/safetynote/safety.db');
db.exec(\`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','supervisor','worker','lgu','lgu_plus')),
  department TEXT, phone TEXT, position TEXT,
  company TEXT, is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)\`);
db.prepare('INSERT OR IGNORE INTO users (username,password_hash,name,role,is_active) VALUES (?,?,?,?,?)').run('admin','admin1234','시스템관리자','admin',1);
console.log('완료:', db.prepare('SELECT * FROM users').all());
db.close();
"

pm2 start safetynote
```
→ 로그인 성공 ("시스템관리자" 우측 상단 표시) ✅

---

### 문제 3: 데이터 로드 500 에러 (진행 중 🔄)

#### 원인 분석
```
[patchSchema v0.154] users 재생성 실패 (무시): no such table: users
[patchSchema v0.158] constructions.completion_date 패치 실패: no such table: constructions
[patchSchema v0.173] work_sub_class 컬럼 추가 실패: no such table: tasks
```

- NAS002 DB 상태: **불완전 초기화** (tasks_stops, task_types, teams 등 일부만 존재)
- `patchSchema v0.154`는 기존 users 테이블을 **마이그레이션**하는 코드
  → users가 없으면 "no such table: users" 실패 → tasks/constructions 연쇄 미생성
- 핵심 테이블 누락: `users`, `tasks`, `constructions`, `checklist_items`

#### 해결 과정
1. **시도**: users DROP → 서버 재시작 → 동일 실패 반복
2. **분석**: patchSchema는 마이그레이션 전용, 초기 테이블 생성은 migrations/0001~에 있음
3. **해결**: `scripts/nas002_db_init.js` 작성 — 0001~0060 마이그레이션 전체를 통합

#### 해결 명령 (NAS002에서 실행)

**Step 1: 스크립트 배포 확인**
```bash
# git pull로 최신 코드 가져오기
cd /volume1/safetynote && git pull

# 스크립트 확인
ls -la /volume1/safetynote/scripts/nas002_db_init.js
```

**Step 2: 서버 중지 후 초기화 실행**
```bash
pm2 stop safetynote

/volume1/@appstore/Node.js_v18/usr/local/bin/node \
  /volume1/safetynote/scripts/nas002_db_init.js
```

**Step 3: 서버 재시작 및 로그 확인**
```bash
pm2 start safetynote
sleep 10
pm2 logs safetynote --nostream --lines 30
```

#### 기대 결과 (성공 시 로그)
```
[patchSchema v0.154] users.role CHECK에 이미 lgu_plus 포함 — 재생성 생략
✅ 서버 실행 중 (HTTPS): https://0.0.0.0:3443
```
또는:
```
[patchSchema v0.154] ✅ users 재생성 완료 (lgu_plus 추가)
```

---

### 추가 패치 이력 (nas002_db_init.js 실행 후 발견된 누락)

| 패치 | 내용 | 해결 방법 |
|------|------|-----------|
| task_work_types | 테이블 누락 → `/api/tasks` 500 | 수동 CREATE |
| site_inspections.task_id | 컬럼 누락 → `/api/inspections` 500 | ALTER TABLE |
| site_inspections.inspection_date_only 등 | 컬럼 누락 | ALTER TABLE |
| task_attachments | 테이블 누락 → 첨부파일 500 | 수동 CREATE |
| tasks.risk_level CHECK | `urgent` 미포함 → INSERT 실패 | `nas002_patch_tasks_rl.cjs` |
| safety_committee_votes.voted_at | 컬럼 누락 | ALTER TABLE |

> ✅ 위 항목들은 `nas002_db_init.js` v2에 모두 반영 완료 (다음 NAS 설치 시 자동 처리)

### ✅ 최종 완료 (2026-07-31)
- 서버 정상 동작 확인
- 전체 메뉴 500 에러 해소
- 작업 상세 팝업 정상 로드

### 남은 작업
- [ ] 고객사 정보 확인 후 현황표 업데이트
- [ ] `NAS_OPERATIONS.md` NAS002 섹션 추가
- [ ] `nas-registry.json` NAS002 항목 추가
- [ ] GitHub Secrets 등록 (NAS_WEBHOOK_URL_2, NAS_WEBHOOK_SECRET_2)

---

*최초 작성: 2026-07-31 | 세션 126*  
*최종 업데이트: 2026-07-31 | 세션 127 (NAS002 정상 동작 확인 완료)*
