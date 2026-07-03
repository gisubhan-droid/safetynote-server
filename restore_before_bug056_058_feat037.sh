#!/bin/bash
# ============================================================
#  복원 스크립트 — BUG-056·057·058 + FEAT-037 작업 직전 상태
#  기준 커밋: e3594aa (2026-07-02, 세션 78)
#  생성일: 2026-07-03
# ============================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "⚠️  이 스크립트는 BUG-056·057·058 + FEAT-037 작업 이전 상태로 복원합니다."
echo "📌 기준 커밋: e3594aa"
echo ""
read -p "정말 복원하시겠습니까? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "❌ 취소되었습니다."
  exit 0
fi

echo ""
echo "🔄 복원 시작..."

# app.js 복원 (git 기준)
git checkout e3594aa -- public/static/app.js
echo "✅ public/static/app.js 복원 완료"

# src 파일 복원
git checkout e3594aa -- src/nas-routes/tbm-extra.ts 2>/dev/null && echo "✅ tbm-extra.ts 복원 완료" || echo "ℹ️  tbm-extra.ts 변경 없음"
git checkout e3594aa -- src/index.tsx 2>/dev/null && echo "✅ src/index.tsx 복원 완료" || echo "ℹ️  index.tsx 변경 없음"

# 마이그레이션 파일 제거 (신규 생성 파일)
[ -f migrations/0055_tbm_share_tokens.sql ] && rm migrations/0055_tbm_share_tokens.sql && echo "✅ migration 0055 제거 완료"

echo ""
echo "✅ 복원 완료! 현재 상태:"
git status --short
echo ""
echo "⚠️  빌드 및 재시작이 필요하면:"
echo "  npm run build && pm2 restart webapp"
