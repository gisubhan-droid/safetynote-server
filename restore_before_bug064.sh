#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
# 복원 스크립트: BUG-064 수정 직전 상태로 복원
# 기준 커밋: 48bf84c (docs: PROJECT_HISTORY 세션 86 BUG-063 커밋 해시 f4f5bae 확정)
# 생성일: 2026-07-04 (세션 87)
# 증상: 접속단가 CSV 업로드 400 에러 (기본(원)/신호수배치 컬럼 파싱 실패)
# ────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

TARGET="48bf84c"
echo "⏪  복원 대상 커밋: ${TARGET}"
echo "   docs: PROJECT_HISTORY 세션 86 BUG-063 커밋 해시 f4f5bae 확정"
echo ""

read -p "❓ 정말 ${TARGET} 상태로 복원하시겠습니까? (yes/no): " ans
if [ "$ans" != "yes" ]; then
  echo "취소되었습니다."
  exit 0
fi

git reset --hard ${TARGET}
echo "✅ 복원 완료: $(git log --oneline -1)"
echo ""
echo "다음 단계: npm run build && pm2 restart safetynote"
