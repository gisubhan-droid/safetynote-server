#!/bin/bash
# ============================================================
# restore_before_feat043.sh
# FEAT-043 작업 직전 상태로 복원하는 스크립트
# 기준 커밋: 8a6eefc (feat: 현장위치 지도 화면 크기 자동 비율 조정)
# 생성일: 2026-07-04
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_COMMIT="8a6eefc"

echo "============================================================"
echo "  FEAT-043 직전 상태 복원 스크립트"
echo "  대상 커밋: ${TARGET_COMMIT}"
echo "  기준: feat: 현장위치 지도 화면 크기 자동 비율 조정"
echo "============================================================"
echo ""

cd "$SCRIPT_DIR"

CURRENT=$(git rev-parse --short HEAD)
echo "[현재 HEAD] ${CURRENT}"
echo "[복원 대상] ${TARGET_COMMIT}"
echo ""

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[경고] 미커밋 변경사항이 있습니다."
  git status --short
  exit 1
fi

read -p "정말 ${TARGET_COMMIT} 커밋으로 hard reset 하시겠습니까? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "복원을 취소했습니다."
  exit 0
fi

echo "[1/3] git reset --hard ${TARGET_COMMIT} 실행 중..."
git reset --hard "${TARGET_COMMIT}"

RESTORED=$(git rev-parse --short HEAD)
echo "[2/3] 현재 HEAD: ${RESTORED}"

if [ "$RESTORED" = "$TARGET_COMMIT" ]; then
  echo "[3/3] ✅ 복원 성공!"
  git log --oneline -5
else
  echo "[3/3] ❌ 복원 실패"
  exit 1
fi

echo ""
echo "  GitHub force push 필요 시: git push --force origin main"
echo "============================================================"
