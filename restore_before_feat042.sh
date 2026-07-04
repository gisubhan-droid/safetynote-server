#!/bin/bash
# ============================================================
# FEAT-042 작업 전 상태로 복원하는 스크립트
# 기준 커밋: dddd814 (docs: PROJECT_HISTORY 세션 94 FEAT-041)
# 생성일: 2026-07-04
# ============================================================
set -e

RESTORE_COMMIT="dddd814"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=================================================="
echo " SafetyNOTE — FEAT-042 이전 상태 복원"
echo " 기준 커밋: ${RESTORE_COMMIT}"
echo " 경로: ${PROJECT_DIR}"
echo "=================================================="
echo ""
echo "⚠️  현재 변경사항이 모두 삭제됩니다."
read -p "계속하시겠습니까? (y/N): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "❌ 복원이 취소되었습니다."
  exit 1
fi

cd "$PROJECT_DIR"

echo ""
echo "🔄 git reset --hard ${RESTORE_COMMIT} 실행 중..."
git reset --hard "${RESTORE_COMMIT}"

echo ""
echo "✅ 복원 완료!"
echo ""
echo "현재 상태:"
git log --oneline -3
echo ""
echo "💡 서버 재시작이 필요하다면:"
echo "   npm run build && pm2 restart webapp"
