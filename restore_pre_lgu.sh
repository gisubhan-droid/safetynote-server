#!/bin/bash
# ============================================================
# SafetyNOTE LGU+ 기능 롤백 스크립트 (세션 58)
# 사용법: bash restore_pre_lgu.sh
# 대상 태그: pre-lgu-role-202606221011
# ============================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SNAPSHOT_TAG="pre-lgu-role-202606221011"
DB_BACKUP="safety.db.backup_pre_lgu_202606221011"
LOG_FILE="restore_$(date +%Y%m%d%H%M).log"

echo "=================================================" | tee -a "$LOG_FILE"
echo "[복원] LGU+ 기능 롤백 시작: $(date)" | tee -a "$LOG_FILE"
echo "=================================================" | tee -a "$LOG_FILE"

# 1. DB 백업 파일 존재 확인
if [ ! -f "$DB_BACKUP" ]; then
  echo "[오류] DB 백업 파일이 없습니다: $DB_BACKUP" | tee -a "$LOG_FILE"
  echo "       수동으로 이전 DB를 복원하세요." | tee -a "$LOG_FILE"
  exit 1
fi

# 2. git 태그 존재 확인
if ! git tag | grep -q "$SNAPSHOT_TAG"; then
  echo "[오류] git 태그를 찾을 수 없습니다: $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
  echo "       git tag 목록:" | tee -a "$LOG_FILE"
  git tag | tail -10 | tee -a "$LOG_FILE"
  exit 1
fi

# 3. 현재 상태 임시 백업
echo "[1/4] 현재 변경사항 임시 저장..." | tee -a "$LOG_FILE"
CURR_BACKUP="safety.db.before_restore_$(date +%Y%m%d%H%M)"
cp safety.db "$CURR_BACKUP" 2>/dev/null || true
echo "      현재 DB 백업: $CURR_BACKUP" | tee -a "$LOG_FILE"

# 4. DB 복원
echo "[2/4] DB 복원: $DB_BACKUP → safety.db" | tee -a "$LOG_FILE"
cp "$DB_BACKUP" safety.db
echo "      DB 복원 완료" | tee -a "$LOG_FILE"

# 5. 코드 복원 (git reset to tag)
echo "[3/4] 코드 복원: git reset to tag $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
git stash 2>/dev/null || true
git checkout "$SNAPSHOT_TAG" -- node-server.ts public/static/app.js src/nas-routes/admin.ts 2>&1 | tee -a "$LOG_FILE"
echo "      코드 복원 완료" | tee -a "$LOG_FILE"

# 6. 빌드
echo "[4/4] 빌드 재실행..." | tee -a "$LOG_FILE"
npm run build 2>&1 | tail -5 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=================================================" | tee -a "$LOG_FILE"
echo "[완료] 롤백 완료: $(date)" | tee -a "$LOG_FILE"
echo "  복원된 태그: $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
echo "  복원된 DB:   $DB_BACKUP" | tee -a "$LOG_FILE"
echo "  로그:        $LOG_FILE" | tee -a "$LOG_FILE"
echo "=================================================" | tee -a "$LOG_FILE"
echo ""
echo "✅ 롤백 완료. NAS에서 pm2 restart safetynote 를 실행하세요."
