#!/bin/bash
# ============================================================
# 복원 스크립트: FEAT-033 적용 전 상태로 롤백
# 기준 커밋: faeadaa
# 대상: 작업(예정)일 명칭 변경 + 체크리스트 완료 시 planned_date 자동 갱신
# 생성일: 2026-06-24
# ============================================================
set -e

INSTALL_DIR="${SAFETYNOTE_DIR:-/volume1/safetynote}"
APP_NAME="safetynote"
RESTORE_COMMIT="faeadaa"

echo "=================================================="
echo "  SafetyNOTE 복원 스크립트 — FEAT-033 이전"
echo "  기준 커밋: ${RESTORE_COMMIT}"
echo "=================================================="
echo ""
echo "⚠️  경고: 이 스크립트는 FEAT-033 (작업(예정)일 명칭 변경 + planned_date 자동 갱신)"
echo "   적용 전 상태로 소스 코드를 되돌립니다."
echo "   데이터베이스(safety.db)는 변경되지 않습니다."
echo ""
read -p "계속하시겠습니까? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "취소되었습니다."
  exit 0
fi

echo ""
echo "[1/4] 디렉터리 이동..."
cd "$INSTALL_DIR"

echo "[2/4] 원격 최신 정보 가져오기..."
git fetch origin

echo "[3/4] 커밋 ${RESTORE_COMMIT} 으로 복원..."
git reset --hard "${RESTORE_COMMIT}"

echo "[4/4] 빌드 및 서버 재시작..."
npm run build
pm2 restart "$APP_NAME"

echo ""
echo "✅ 복원 완료!"
echo "   복원된 커밋: $(git log --oneline -1)"
echo "   서버 상태 확인: pm2 status"
echo "   로그 확인: pm2 logs ${APP_NAME} --nostream --lines 30"
