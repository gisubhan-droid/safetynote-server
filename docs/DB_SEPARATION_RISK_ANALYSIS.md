# DB 분리 위험도 분석 보고서

> 작성일: 2026-06-19  
> 프로젝트: 건설 현장 안전관리 앱 (safety.db)  
> 작성 근거: node-server.ts 5,748줄 / JOIN 53개 / rawDb 318호출 / API 81개 실측값 기반

---

## 배경 — 현재 DB 구조

| 항목 | 현황 |
|------|------|
| DB 파일 | `safety.db` 단일 파일 |
| 테이블 수 | 약 35개 |
| JOIN 총계 | 53개 |
| 크로스 JOIN | **45개** (users / constructions / tasks 상호 참조) |
| rawDb 호출 | 318곳 |
| API 엔드포인트 | 81개 |
| 서버 파일 | `node-server.ts` 5,748줄 (단일 파일) |

---

## 1단계: 논리적 분리 (node-server.ts → 메뉴별 파일 분리)

### 위험도: ⭐☆☆☆☆ (매우 낮음)

| 항목 | 내용 |
|------|------|
| DB 변경 | ❌ 없음 — safety.db 그대로 유지 |
| 쿼리 변경 | ❌ 없음 — 53개 JOIN 그대로 유지 |
| 서비스 중단 | PM2 재시작 1회 → **30초 이내** |
| 롤백 방법 | `git revert` 즉시 → 재시작 1회 |
| 데이터 위험 | ✅ 없음 |
| 실패 시 | 빌드 에러로 배포 자체가 차단 → 운영 영향 없음 |

### 작업 개요

```
[현재]
node-server.ts (5,748줄 단일 파일)

[1단계 분리 후]
node-server.ts          ← 200줄 (import + app.use() 만 남음)
src/routes/push.ts      ← 푸시 알림 관련
src/routes/safety.ts    ← 안전 점검 관련
src/routes/users.ts     ← 사용자 관리 관련
src/routes/tasks.ts     ← 업무/TBM 관련
...
```

### 핵심 포인트

- **rawDb 객체를 모든 파일이 공유** → 쿼리/JOIN 수정 불필요
- 파일 구조만 바뀌고 동작 로직은 100% 동일
- 빌드 실패 시 운영 서버에 배포 자체가 되지 않아 안전

### 권장 여부: ✅ 지금 바로 진행 가능

---

## 2단계: 물리적 분리 (실제 .db 파일 분리)

### 위험도: ⭐⭐⭐⭐⭐ (매우 높음 — 운영 중 절대 금지)

| 항목 | 내용 |
|------|------|
| DB 변경 | ✅ safety.db → 3~5개 파일로 분리 |
| 쿼리 변경 | ✅ **크로스 JOIN 45개 전부 수정 필요** |
| 서비스 중단 | **최소 수 시간 ~ 수일** |
| 롤백 방법 | 데이터 마이그레이션 역방향 → 복잡하고 위험 |
| 데이터 위험 | ⚠️ 마이그레이션 실패 시 **데이터 손실 가능** |
| 실패 시 | 운영 서비스 전면 장애 |

### 왜 이렇게 위험한가?

현재 동작 중인 크로스 JOIN 예시 (45개 중 하나):

```sql
-- 현재 (safety.db 단일 파일, 정상 동작)
SELECT t.*, u.name, c.site_name
FROM tasks t
JOIN users u        ON t.user_id  = u.id
JOIN constructions c ON t.constr_id = c.id
```

물리 분리 후 모든 쿼리를 아래처럼 변경해야 함:

```sql
-- 분리 후 (ATTACH DATABASE 방식)
ATTACH DATABASE '/data/users.db'         AS udb;
ATTACH DATABASE '/data/constructions.db' AS cdb;

SELECT t.*, u.name, c.site_name
FROM tasks t
JOIN udb.users u          ON t.user_id  = u.id
JOIN cdb.constructions c  ON t.constr_id = c.id
```

**→ 이 작업을 45개 쿼리에 전부 적용해야 함**  
**→ NAS 환경에서 ATTACH 경로 설정 + 데이터 마이그레이션 + 전체 검증 = 수일 소요**

### 2단계 진행 조건 (필수)

- [ ] 별도 테스트 NAS 환경 구성 완료
- [ ] 사용자 대상 점검 공지 발송
- [ ] 새벽 시간대 작업 일정 확보
- [ ] safety.db 백업 3중 확인 (로컬 + 외장 + 클라우드)
- [ ] 45개 쿼리 수정 및 단위 테스트 완료
- [ ] 롤백 스크립트 사전 준비

### 권장 여부: ❌ 현재 시점에서 진행 불가 — 장기 계획으로 보류

---

## 전체 비교 요약

```
현재 상태           1단계 (권장)            2단계 (장기 보류)
──────────────────────────────────────────────────────────────
safety.db (단일)    safety.db (그대로)      users.db
                                            constructions.db
node-server.ts      src/routes/*.ts          tasks.db
(5,748줄)           (파일만 분리)            safety_logs.db
                                            ...

위험도: 기준        ★☆☆☆☆                  ★★★★★
서비스 중단: 없음   30초 (PM2 재시작)       수 시간 ~ 수일
롤백: 해당없음      git revert (즉시)       마이그레이션 역방향 (복잡)
데이터 위험: 없음   없음                    손실 가능
진행 가능: 기준     ✅ 지금 바로             ❌ 테스트 환경 필수
```

---

## 최종 권장 사항

1. **지금 진행** → 1단계 (논리적 분리)  
   `node-server.ts` 5,748줄을 메뉴별 `src/routes/*.ts` 파일로 분리  
   → DB/쿼리/서비스 중단 없이 코드 유지보수성 대폭 향상

2. **장기 계획** → 2단계 (물리적 분리)  
   테스트 환경 + 점검 공지 + 새벽 작업 + 3중 백업 조건이 모두 갖춰진 후  
   → **운영 중 서버에서 직접 진행 절대 금지**

---

> 이 문서는 세션 37 (2026-06-19) 에서 작성되었습니다.  
> 관련 프로젝트 기록: `PROJECT_HISTORY.md` 세션 37 참조
