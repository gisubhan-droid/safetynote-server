#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
# 복원 스크립트: BUG-063 수정 직전 상태로 복원
# 기준 커밋: ed4d3d1 (docs: PROJECT_HISTORY 세션 84 커밋 해시 e817a2c 확정)
# 생성일: 2026-07-04 (세션 85)
# 증상: 단가 엑셀 업로드 시 404 에러 (/api/api/volume-unit-prices/import)
# ────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

TARGET="ed4d3d1"
echo "⏪  복원 대상 커밋: ${TARGET}"
echo "   docs: PROJECT_HISTORY 세션 84 커밋 해시 e817a2c 확정"
echo ""

read -p "❓ 정말 ${TARGET} 상태로 복원하시겠습니까? (yes/no): " ans
if [ "$ans" != "yes" ]; then
  echo "취소되었습니다."
  exit 0
fi

git reset --hard ${TARGET}
echo "✅ 복원 완료: $(git log --oneline -1)"
echo ""
echo "다음 단계:"
echo "  npm run build   # 재빌드"
echo "  pm2 restart safetynote  # NAS에서 실행"
