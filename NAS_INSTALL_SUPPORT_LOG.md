# SafetyNOTE — NAS 신규 설치 지원 로그

> **목적**: 신규 NAS 설치 지원 세션별 진행 기록  
> **대상**: NAS001(링크맥스) 이후 추가되는 모든 신규 NAS  
> **주의**: NAS001(링크맥스 본사) 이력은 이 파일에 기록하지 않음 → `PROJECT_HISTORY.md` 참조

---

## 📊 신규 NAS 설치 현황

| NAS ID | 고객사 | 설치일 | 상태 | 현재 단계 |
|--------|--------|--------|------|----------|
| **NAS002** | 미확인 | 2026-07-31 | 🔄 진행중 | 로그인 에러 해결 중 |

---

## 🏢 NAS002 — 신규 설치 (세션 126~)

### 설치 진행 이력

#### ✅ 완료된 단계
- `install.sh` 실행 → 설치 완료
- 서버 기동 확인 (pm2 online)

#### 🔄 현재 진행 중
- **로그인 에러** — admin 계정 문제

### 문제: 로그인 불가

#### 현상
- 설치 후 브라우저에서 로그인 시도 → 에러 발생
- admin 계정 password_hash 문제로 추정

#### 시도한 해결책

**방법 1: admin 계정 존재 확인 및 INSERT**
```bash
/volume1/@appstore/Node.js_v18/usr/local/bin/node -e "
const Database = require('/volume1/safetynote/node_modules/better-sqlite3');
const db = new Database('/volume1/safetynote/safety.db');
const users = db.prepare('SELECT id, username, name, role FROM users').all();
console.log('현재 users:', JSON.stringify(users, null, 2));
if (!users.find(u => u.username === 'admin')) {
  db.prepare(
    'INSERT INTO users (username, password_hash, name, role, department, position, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('admin', 'admin1234', '시스템관리자', 'admin', '관리부', '시스템관리자', 1);
  console.log('✅ admin 계정 생성 완료!');
} else {
  console.log('ℹ️ admin 계정 이미 존재');
}
db.close();
"
```

**방법 2: 비밀번호 재설정 (admin 계정은 있으나 비밀번호 불일치 시)**
```bash
/volume1/@appstore/Node.js_v18/usr/local/bin/node -e "
const Database = require('/volume1/safetynote/node_modules/better-sqlite3');
const db = new Database('/volume1/safetynote/safety.db');
db.prepare(\"UPDATE users SET password_hash = 'admin1234' WHERE username = 'admin'\").run();
const u = db.prepare(\"SELECT id, username, name, role, password_hash FROM users WHERE username='admin'\").get();
console.log('✅ admin 계정:', JSON.stringify(u));
db.close();
"
```

#### 결과
- ⏳ 미확인 — 세션 재개 후 확인 예정

### NAS002 환경 정보
> ⚠️ 설치 완료 후 아래 항목 확인 필요

| 항목 | 내용 |
|------|------|
| **고객사** | 미확인 |
| **URL** | 미확인 |
| **Node.js** | v18 추정 (`/volume1/@appstore/Node.js_v18`) |
| **설치 경로** | `/volume1/safetynote` 추정 |
| **DB 경로** | `/volume1/safetynote/safety.db` 추정 |
| **PM2 앱명** | `safetynote` 추정 |

### 다음 작업
- [ ] 방법 1 실행 결과 확인
- [ ] 로그인 정상 동작 확인
- [ ] NAS002 환경 정보 확정 후 `NAS_OPERATIONS.md` 업데이트
- [ ] `nas-registry.json` NAS002 항목 추가
- [ ] GitHub Secrets 등록 (NAS_WEBHOOK_URL_2, NAS_WEBHOOK_SECRET_2)

---

*최초 작성: 2026-07-31 | 세션 126*
