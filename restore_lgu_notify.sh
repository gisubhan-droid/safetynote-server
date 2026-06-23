#!/bin/bash
# ============================================================
# restore_lgu_notify.sh — BUG-039 수정 전 상태 복원 스크립트
# ============================================================
# 복원 기준 커밋: 9c7b2fb
#   "fix: BUG-038 LGU+ 알림 미수신 — sub_role 누락 수정"
#
# 사용 시점: BUG-039 수정(is_auto_request_no 조건 반전) 후
#             문제 발생 시 이 스크립트로 즉시 롤백
#
# 사용법:
#   bash /home/user/webapp/restore_lgu_notify.sh
#   또는 NAS에서:
#   cd /path/to/webapp && bash restore_lgu_notify.sh
# ============================================================

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_COMMIT="9c7b2fb"

echo "============================================================"
echo " SafetyNOTE — BUG-039 복원 스크립트"
echo " 복원 대상 커밋: ${TARGET_COMMIT}"
echo " (BUG-038까지 수정 완료된 상태, BUG-039 수정 이전)"
echo "============================================================"
echo ""
echo "⚠️  경고: 현재 커밋 이후 변경사항이 모두 사라집니다."
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
pm2 restart safetynote 2>/dev/null || pm2 restart all 2>/dev/null || echo "(PM2 재시작 실패 — 수동으로 재시작 필요)"

echo ""
echo "============================================================"
echo " ✅ 복원 완료!"
echo " 현재 상태: $(git log --oneline -1)"
echo ""
echo " 복원된 내용:"
echo "  - BUG-036: photo_type tbm_photo→tbm ✅"
echo "  - BUG-037: img src ?token 쿼리스트링 ✅"
echo "  - BUG-038: LGU+ sub_role 누락 수정 ✅"
echo "  - BUG-039: is_auto_request_no 조건 반전 ❌ (수정 전 상태로 복원됨)"
echo "============================================================"
