#!/bin/bash
# 복원 스크립트: FEAT-031, FEAT-032 적용 전 상태로 롤백
# 기준 커밋: 7c2fe89 (fix: BUG-045-2 inspection_workers FK 수정)

echo "=== FEAT-031/032 롤백 스크립트 ==="
echo "현재 커밋: $(git rev-parse --short HEAD)"
echo "롤백 대상: 7c2fe89"
echo ""
echo "⚠️  이 스크립트는 현재 변경사항을 되돌립니다."
read -p "계속하시겠습니까? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "취소되었습니다."
  exit 0
fi

git fetch origin
git reset --hard 7c2fe89
npm run build
pm2 restart safetynote
echo ""
echo "✅ 롤백 완료 — 커밋 7c2fe89 상태로 복원되었습니다."
echo "현재 커밋: $(git rev-parse --short HEAD)"
