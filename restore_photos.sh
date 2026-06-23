#!/bin/bash
# ============================================================
# SafetyNOTE 사진 업로드 버그 수정 롤백 스크립트 (BUG-031~034)
# 사용법: bash restore_photos.sh [태그명]
#
# 사용 가능한 스냅샷 태그:
#   pre-photo-fix-202606230150   — BUG-031 수정 직전 (사진 기능 변경사항 없음, 가장 안전)
#   pre-sw-fix-202606230142      — Service Worker 수정 직전 (BUG-030 완료 상태)
#   pre-photo-fix-v2-202606230213 — BUG-031~034 모두 완료된 최신 정상 상태
#
# 인수 없이 실행 시 → pre-photo-fix-202606230150 (BUG-031 이전 상태)으로 복원
# ============================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SNAPSHOT_TAG="${1:-pre-photo-fix-202606230150}"
LOG_FILE="restore_photos_$(date +%Y%m%d%H%M).log"

echo "=================================================" | tee -a "$LOG_FILE"
echo "[복원] 사진 업로드 버그 롤백 시작: $(date)" | tee -a "$LOG_FILE"
echo "  대상 태그: $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
echo "=================================================" | tee -a "$LOG_FILE"

# 1. 태그 존재 확인
if ! git tag | grep -q "^${SNAPSHOT_TAG}$"; then
  echo "[오류] git 태그를 찾을 수 없습니다: $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
  echo "       사용 가능한 태그:" | tee -a "$LOG_FILE"
  git tag | grep "pre-photo\|pre-sw" | tee -a "$LOG_FILE"
  exit 1
fi

# 2. 현재 상태 임시 백업
echo "[1/3] 현재 node-server.ts 백업..." | tee -a "$LOG_FILE"
cp node-server.ts "node-server.ts.before_restore_$(date +%Y%m%d%H%M)"
echo "      백업 완료" | tee -a "$LOG_FILE"

# 3. 코드 복원 (사진 관련 파일만)
echo "[2/3] 코드 복원: git checkout $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
git stash 2>/dev/null || true
git checkout "$SNAPSHOT_TAG" -- \
  node-server.ts \
  public/static/service-worker.js \
  2>&1 | tee -a "$LOG_FILE"
echo "      코드 복원 완료" | tee -a "$LOG_FILE"

# 4. 빌드
echo "[3/3] 빌드 재실행..." | tee -a "$LOG_FILE"
npm run build 2>&1 | tail -5 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=================================================" | tee -a "$LOG_FILE"
echo "[완료] 롤백 완료: $(date)" | tee -a "$LOG_FILE"
echo "  복원된 태그: $SNAPSHOT_TAG" | tee -a "$LOG_FILE"
echo "  로그:        $LOG_FILE" | tee -a "$LOG_FILE"
echo "=================================================" | tee -a "$LOG_FILE"
echo ""
echo "✅ 롤백 완료. NAS에서 pm2 restart safetynote 를 실행하세요."
echo ""
echo "─── 사용 가능한 롤백 시점 ───────────────────────────────────────────"
echo "  BUG-031 이전 (가장 안전):      bash restore_photos.sh pre-photo-fix-202606230150"
echo "  Service Worker 수정 전:         bash restore_photos.sh pre-sw-fix-202606230142"
echo "  BUG-031~034 전부 완료 상태:    bash restore_photos.sh pre-photo-fix-v2-202606230213"
echo "──────────────────────────────────────────────────────────────────────"
