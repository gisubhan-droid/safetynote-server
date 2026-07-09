# SafetyNOTE 개발 노트

---

## ⚠️ 필수 참고사항 — NAS 이중 핸들러 구조

### NAS는 두 곳에 같은 라우트가 존재한다

| 파일 | 역할 | 우선순위 |
|------|------|----------|
| `node-server.ts` | NAS 전용 오버라이드 핸들러 (rawDb 직접 사용) | **높음 — 먼저 매칭** |
| `src/routes/tasks.ts` | Cloudflare D1용 원본 핸들러 | 낮음 — 오버라이드에 가려짐 |

**규칙**: 작업(tasks) 관련 권한·상태 조건을 수정할 때는  
**반드시 `node-server.ts`와 `src/routes/tasks.ts` 두 곳 모두 수정**해야 한다.

### 현재 확인된 NAS 전용 오버라이드 목록 (`node-server.ts`)

| 라우트 | 위치(라인) | 이유 |
|--------|-----------|------|
| `DELETE /api/tasks/:id` | ~3434 (BUG-087) | NAS SQLite FK 환경에서 safeDelete 체인 실패 → rawDb로 대체 |
| `POST /api/auth/register` | ~3137 | c.env.DB 없는 NAS 환경 대응 |
| `PATCH /api/inspections/:id` | ~4242 | c.env.DB → rawDb 직접 처리 |
| `POST /api/checklist/*` | ~4348 | c.env.DB → rawDb 직접 처리 |

---

## 📋 작업 이력

---

### 2026-07-09 — 취소 작업 삭제 허용 외 3건 ✅ 전체 완료

#### 1. TBM 회의록 인쇄 빈 페이지 근본 해결 ✅ 사용자 확인 완료 (2026-07-09)

**증상**: TBM 인쇄 시 빈 페이지 출력  
**원인 1**: `page-sheet-wrap`에 `no-print` 클래스 적용 → 인쇄 시 숨겨짐  
**원인 2**: `page-sheet { position:relative; height:297mm; overflow:hidden }` + `page-inner { position:absolute }` 조합이 인쇄 엔진에서 콘텐츠 미인식  

**해결**:
```css
@media print {
  .page-sheet {
    height: auto !important;
    overflow: visible !important;
    position: static !important;
  }
  .page-inner {
    position: static !important;
    transform: none !important;
    width: 100% !important;
  }
}
```

**커밋**: `b152b5c` (no-print 제거), `e39e054` (position:static 해제)  
**수정 파일**: `public/static/app.js`

---

#### 2. 안전교육 자료 첨부 기능 추가 ✅ 사용자 확인 완료 (2026-07-09)

**구현 내용**:
- `edu_materials` 테이블 자동 생성 (서버 기동 시 `CREATE TABLE IF NOT EXISTS`)
- API 3개 추가:
  - `GET  /api/education/sessions/:id/materials` — 목록
  - `POST /api/education/sessions/:id/materials` — 업로드 (50MB, PDF·PPT·HWP·Word 허용)
  - `DELETE /api/education/materials/:materialId` — 삭제 + 물리 파일 삭제
- 교육 등록/수정 모달 — 자료 첨부 섹션 추가
- 교육 상세 모달 — 자료 목록/다운로드/삭제 UI 추가
- 신규 헬퍼 함수 9개: `_loadEsfMaterials`, `_onEsfMatSelect`, `_matFileIcon`, `_formatFileSize`, `_deleteEduMaterial`, `_showEduMatUploadInDetail`, `_onEduMatUpInputChange`, `_uploadEduMatInDetail`, `_deleteEduMatInDetail`

**커밋**: `38fb3b4`  
**수정 파일**: `public/static/app.js`, `src/nas-routes/education-extra.ts`

---

#### 3. 취소(cancelled) 작업 시스템관리자 삭제 허용 ✅ 사용자 확인 완료 (2026-07-09)

**증상**: 취소된 작업 삭제 시 "완료된 작업만 삭제할 수 있습니다." 오류  

**수정 파일 및 내용**:

| 파일 | 수정 내용 |
|------|-----------|
| `src/routes/tasks.ts` | `status !== 'completed'` → `status !== 'completed' && status !== 'cancelled'` |
| `node-server.ts` (BUG-087) | 동일 조건 수정 — **이곳이 실제 NAS 실행 코드** |
| `public/static/app.js` | `_taskCanDelete` 조건에 `cancelled` 추가, 삭제 버튼 안내 문구 수정 |
| `public/static/app.js` | `deleteTask(id, knownStatus)` — 호출부에서 status 직접 전달, 409 메시지 가로채기 |

**디버깅 과정**:
1. `src/routes/tasks.ts` 수정 → NAS pm2 restart → 여전히 409
2. DB 직접 확인: `sqlite3 ... "SELECT id, status FROM tasks WHERE id=50;"` → `cancelled` 정상
3. `node-server.ts`에 **BUG-087 NAS 전용 오버라이드**가 존재하며 여기에 `cancelled` 조건 누락 발견
4. `node-server.ts` 수정 → 정상 동작 확인 ✅

**커밋**: `86f06c2`, `1056a25`, `77346a4`, `f64b9cf`

---

## 🏗️ NAS 아키텍처 메모

```
GitHub push
    ↓
webhook (update_mode=auto일 때만)
    ↓
git fetch + reset --hard origin/main
    ↓
npm run build  (vite → dist/_worker.js, Cloudflare용)
    ↓
pm2 restart safetynote
    ↓
tsx node-server.ts  ← NAS 실행 진입점
    ↓
src/routes/*.ts 직접 import (TypeScript, 빌드 없음)
```

**NAS PM2 실행 명령** (ecosystem.config.cjs 참고):
```bash
PORT=3443 pm2 start /volume1/safetynote/node_modules/.bin/tsx \
  --name safetynote \
  --interpreter /volume1/@appstore/Node.js_v18/usr/local/bin/node \
  -- node-server.ts
```

**DB 직접 조회** (NAS SSH):
```bash
sqlite3 /volume1/safetynote/data/safety.db "SELECT id, status, title FROM tasks WHERE id=?;"
sqlite3 /volume1/safetynote/data/safety.db "SELECT id, status, title FROM tasks WHERE status='cancelled';"
```

**NAS 수동 업데이트** (SSH):
```bash
cd /volume1/safetynote
git fetch origin main && git reset --hard origin/main
pm2 restart safetynote
pm2 logs safetynote --nostream --lines 30
```

---

## 🔑 권한 구조

| UI 역할 | DB 조건 |
|---------|---------|
| `sysadmin` | `role='admin' AND position='시스템관리자'` |
| `admin` | `role='admin' AND position != '시스템관리자'` |
| `worker` | `role='worker'` |

**작업 삭제 권한**: `sysadmin`만 가능, `completed` 또는 `cancelled` 상태만 허용

---

## 📁 주요 파일 구조

```
/volume1/safetynote/          ← NAS 실행 루트
├── node-server.ts            ← NAS 진입점 + 오버라이드 핸들러
├── src/
│   ├── routes/
│   │   ├── tasks.ts          ← Cloudflare D1용 (NAS에서도 import되나 오버라이드에 가려짐)
│   │   ├── auth.ts
│   │   ├── education.ts
│   │   └── ...
│   └── nas-routes/
│       ├── education-extra.ts  ← edu_materials API
│       ├── admin.ts            ← webhook 자동 업데이트
│       └── ...
├── public/static/
│   └── app.js                ← 프론트엔드 전체 (단일 파일)
└── data/
    └── safety.db             ← SQLite DB
```
