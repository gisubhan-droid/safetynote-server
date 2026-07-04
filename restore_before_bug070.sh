#!/bin/bash
# ============================================================
# restore_before_bug070.sh
# BUG-070 작업 직전 상태로 복원하는 스크립트
# 기준 커밋: 3268d11 (docs: PROJECT_HISTORY 세션 95 FEAT-042 커밋 해시 2e38b2a 확정)
# 생성일: 2026-07-04
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_COMMIT="3268d11"

echo "============================================================"
echo "  BUG-070 직전 상태 복원 스크립트"
echo "  대상 커밋: ${TARGET_COMMIT}"
echo "  기준: docs: PROJECT_HISTORY 세션 95 FEAT-042 커밋 해시 2e38b2a 확정"
echo "============================================================"
echo ""

cd "$SCRIPT_DIR"

# 현재 상태 확인
CURRENT=$(git rev-parse --short HEAD)
echo "[현재 HEAD] ${CURRENT}"
echo "[복원 대상] ${TARGET_COMMIT}"
echo ""

# 미커밋 변경사항 확인
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[경고] 미커밋 변경사항이 있습니다."
  echo "       stash 하거나 수동으로 처리 후 다시 실행하세요."
  git status --short
  exit 1
fi

# 복원 확인
read -p "정말 ${TARGET_COMMIT} 커밋으로 hard reset 하시겠습니까? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "복원을 취소했습니다."
  exit 0
fi

echo ""
echo "[1/3] git reset --hard ${TARGET_COMMIT} 실행 중..."
git reset --hard "${TARGET_COMMIT}"

echo "[2/3] 복원 완료 확인..."
RESTORED=$(git rev-parse --short HEAD)
echo "      현재 HEAD: ${RESTORED}"

if [ "$RESTORED" = "$TARGET_COMMIT" ]; then
  echo "[3/3] ✅ 복원 성공!"
  echo ""
  echo "  복원된 상태:"
  git log --oneline -5
else
  echo "[3/3] ❌ 복원 실패 — HEAD가 예상 커밋과 다릅니다."
  exit 1
fi

echo ""
echo "============================================================"
echo "  복원 완료. BUG-070 수정 전 상태입니다."
echo "  GitHub force push가 필요한 경우:"
echo "  git push --force origin main"
echo "============================================================"
