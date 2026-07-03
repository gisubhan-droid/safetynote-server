#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
# 복원 스크립트: FEAT-038b 공유버튼 관리자상세 추가 작업 직전 상태로 복원
# 기준 커밋: 73e6d14 (docs: PROJECT_HISTORY FEAT-038 커밋 해시 f976aaf 확정)
# 생성일: 2026-07-03 (세션 83)
# ────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

TARGET="73e6d14"
echo "⏪  복원 대상 커밋: ${TARGET}"
echo "   docs: PROJECT_HISTORY FEAT-038 커밋 해시 f976aaf 확정"
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
