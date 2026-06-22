#!/bin/bash
# ============================================================
# SafetyNOTE LGU+ 기능 롤백 스크립트 (세션 58/59)
# 사용법: bash restore_pre_lgu.sh [태그명]
#
# 사용 가능한 스냅샷 태그:
#   pre-lgu-role-202606221011  — v0.142 구현 직전 (LGU+ 미구현 상태)
#   pre-lgu-v2-202606222145    — v0.143 재수정 직전 (v0.142 완성 상태)
#   pre-lgu-v3-202606222151    — v0.143 최종 작업 직전
#   pre-lgu-v4-202606222343    — BUG-028/029 수정 직전 (현재 최신)
#
# 인수 없이 실행 시 → 가장 최근 스냅샷(pre-lgu-v4)으로 복원
# ============================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── 태그 선택 ──────────────────────────────────────────────
SNAPSHOT_TAG="${1:-pre-lgu-v4-202606222343}"

# 태그에 맞는 DB 백업 파일 자동 선택
case "$SNAPSHOT_TAG" in
  pre-lgu-role-202606221011)
    DB_BACKUP="safety.db.backup_pre_lgu_202606221011"
    ;;
  pre-lgu-v2-202606222145)
    DB_BACKUP="safety.db.backup_pre_lgu_v2_202606222145"
    ;;
  pre-lgu-v3-202606222151)
    DB_BACKUP="safety.db.backup_pre_lgu_v3_202606222151"
    ;;
  pre-lgu-v4-202606222343)
    DB_BACKUP="safety.db.backup_pre_lgu_v4_202606222343"
    ;;
  *)
    # 사용자가 직접 태그 지정한 경우 DB 백업은 수동 지정
    DB_BACKUP="${2:-}"
    if [ -z "$DB_BACKUP" ]; then
      echo "[경고] DB 백업 파일을 특정하지 않았습니다."
      echo "       코드만 롤백하고 DB는 현재 상태 유지합니다."
    fi
    ;;
esac

LOG_FILE="restore_$(date +%Y%m%d%H%M).log"

echo "=================================================" | tee -a "$LOG_FILE"
echo "[복원] LGU+ 기능 롤백 시작: $(date)" | tee -a "$LOG_FILE"
echo "  대상 태그: $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
echo "  DB 백업:   ${DB_BACKUP:-'(건너뜀)'}" | tee -a "$LOG_FILE"
echo "=================================================" | tee -a "$LOG_FILE"

# 1. git 태그 존재 확인
if ! git tag | grep -q "$SNAPSHOT_TAG"; then
  echo "[오류] git 태그를 찾을 수 없습니다: $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
  echo "       사용 가능한 태그:" | tee -a "$LOG_FILE"
  git tag | grep pre-lgu | tee -a "$LOG_FILE"
  exit 1
fi

# 2. 현재 상태 임시 백업
echo "[1/4] 현재 DB 임시 백업..." | tee -a "$LOG_FILE"
CURR_BACKUP="safety.db.before_restore_$(date +%Y%m%d%H%M)"
cp safety.db "$CURR_BACKUP" 2>/dev/null || echo "      (DB 없음 — 건너뜀)"
echo "      현재 DB 백업: $CURR_BACKUP" | tee -a "$LOG_FILE"

# 3. DB 복원 (백업 파일이 있을 때만)
if [ -n "$DB_BACKUP" ] && [ -f "$DB_BACKUP" ]; then
  echo "[2/4] DB 복원: $DB_BACKUP → safety.db" | tee -a "$LOG_FILE"
  cp "$DB_BACKUP" safety.db
  echo "      DB 복원 완료" | tee -a "$LOG_FILE"
else
  echo "[2/4] DB 복원 건너뜀 (백업 파일 없음 또는 미지정)" | tee -a "$LOG_FILE"
fi

# 4. 코드 복원
echo "[3/4] 코드 복원: git checkout $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
git stash 2>/dev/null || true
git checkout "$SNAPSHOT_TAG" -- \
  node-server.ts \
  public/static/app.js \
  src/routes/constructions.ts \
  src/routes/tasks.ts \
  src/nas-routes/admin.ts \
  2>&1 | tee -a "$LOG_FILE"
echo "      코드 복원 완료" | tee -a "$LOG_FILE"

# 5. 빌드
echo "[4/4] 빌드 재실행..." | tee -a "$LOG_FILE"
npm run build 2>&1 | tail -5 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=================================================" | tee -a "$LOG_FILE"
echo "[완료] 롤백 완료: $(date)" | tee -a "$LOG_FILE"
echo "  복원된 태그: $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
echo "  복원된 DB:   ${DB_BACKUP:-'(건너뜀)'}" | tee -a "$LOG_FILE"
echo "  로그:        $LOG_FILE" | tee -a "$LOG_FILE"
echo "=================================================" | tee -a "$LOG_FILE"
echo ""
echo "✅ 롤백 완료. NAS에서 pm2 restart safetynote 를 실행하세요."
echo ""
echo "─── 사용 가능한 롤백 시점 ───────────────────────────────"
echo "  최초 LGU+ 미구현 상태:        bash restore_pre_lgu.sh pre-lgu-role-202606221011"
echo "  v0.142 완성(잘못된조건):      bash restore_pre_lgu.sh pre-lgu-v2-202606222145"
echo "  v0.143 작업 직전:             bash restore_pre_lgu.sh pre-lgu-v3-202606222151"
echo "  BUG-028/029 수정 직전(최신):  bash restore_pre_lgu.sh pre-lgu-v4-202606222343"
echo "────────────────────────────────────────────────────────"
