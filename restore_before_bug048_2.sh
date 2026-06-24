#!/bin/bash
# ============================================================
# 복원 스크립트: BUG-048-2 수정 직전 상태로 복원
# 작성일: 2026-06-24
# 복원 대상 커밋: 41b0b38
#   fix: BUG-049 브라우저 업데이트 시 npm run build 누락 수정
#
# 사용 방법:
#   bash restore_before_bug048_2.sh
#
# 주의:
#   - 이 스크립트 실행 시 BUG-048-2 수정 내용이 모두 되돌려집니다.
#   - 실행 전 현재 변경사항을 git stash 또는 별도 커밋 권장
# ============================================================

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_COMMIT="41b0b38"

echo "======================================================"
echo "  SafetyNOTE 복원 스크립트 — BUG-048-2 수정 직전"
echo "======================================================"
echo ""
echo "📂 대상 디렉토리: $REPO_DIR"
echo "🔖 복원 커밋   : $TARGET_COMMIT (BUG-049 수정 완료 시점)"
echo ""

# 현재 상태 확인
echo "[1/5] 현재 git 상태 확인..."
cd "$REPO_DIR"
git status --short
echo ""

# 미커밋 변경사항 경고
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️  미커밋 변경사항이 있습니다. stash 처리 후 진행합니다."
  git stash push -m "auto-stash before restore_before_bug048_2 $(date +%Y%m%d_%H%M%S)"
  echo "✅ git stash 완료"
  echo ""
fi

# 커밋으로 복원
echo "[2/5] $TARGET_COMMIT 커밋으로 git reset 실행..."
git reset --hard "$TARGET_COMMIT"
echo "✅ git reset 완료"
echo ""

# 빌드
echo "[3/5] npm run build 실행..."
npm run build
echo "✅ 빌드 완료"
echo ""

# D1 마이그레이션 (필요 시)
echo "[4/5] 로컬 D1 마이그레이션 확인..."
if [ -d "migrations" ]; then
  npx wrangler d1 migrations apply webapp-production --local 2>/dev/null && echo "✅ 마이그레이션 적용" || echo "ℹ️  마이그레이션 건너뜀 (이미 적용되어 있거나 불필요)"
else
  echo "ℹ️  migrations 디렉토리 없음, 건너뜀"
fi
echo ""

# 상태 출력
echo "[5/5] 복원 결과 확인..."
git log --oneline -3
echo ""

echo "======================================================"
echo "  ✅ 복원 완료!"
echo "  현재 상태: BUG-048-2 수정 직전 (커밋 $TARGET_COMMIT)"
echo ""
echo "  🔄 서버 재시작 방법:"
echo "    pm2 restart webapp    (또는)"
echo "    fuser -k 3000/tcp 2>/dev/null || true"
echo "    pm2 start ecosystem.config.cjs"
echo "======================================================"
