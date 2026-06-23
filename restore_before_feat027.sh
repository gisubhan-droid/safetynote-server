#!/bin/bash
# ============================================================
# restore_before_feat027.sh — FEAT-027/028 적용 전 상태 복원
# ============================================================
# 복원 기준 커밋: 97392c4
#   "fix: BUG-040 LGU+ 알림 NULL 취약점 — 공사 미연결/NULL 시 알림 누출 차단"
#
# 이 스크립트로 복원되는 상태:
#   ✅ BUG-036~040 수정 완료
#   ❌ FEAT-027 그룹별 권한 관리 (롤백)
#   ❌ FEAT-028 TBM 근로자→안전관리자 알림 연쇄 (롤백)
#
# 사용법:
#   bash /home/user/webapp/restore_before_feat027.sh
# ============================================================

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_COMMIT="97392c4"

echo "============================================================"
echo " SafetyNOTE — FEAT-027/028 이전 상태 복원 스크립트"
echo " 복원 대상 커밋: ${TARGET_COMMIT} (BUG-040 수정 완료 상태)"
echo "============================================================"
echo ""
echo "⚠️  경고: FEAT-027/028 변경사항이 모두 사라집니다."
echo "     계속하려면 Enter, 취소하려면 Ctrl+C"
read -r

cd "$REPO_DIR"

echo "[1/4] 현재 상태 확인..."
git log --oneline -5

echo ""
echo "[2/4] 원격 저장소 fetch..."
git fetch origin main

echo ""
echo "[3/4] 커밋 ${TARGET_COMMIT}으로 hard reset..."
git reset --hard "${TARGET_COMMIT}"

echo ""
echo "[4/4] 빌드 및 PM2 재시작..."
npm run build
pm2 restart safetynote 2>/dev/null || pm2 restart all 2>/dev/null || echo "(PM2 재시작 실패 — 수동 재시작 필요)"

echo ""
echo "============================================================"
echo " ✅ 복원 완료!"
echo " 현재 상태: $(git log --oneline -1)"
echo "============================================================"
