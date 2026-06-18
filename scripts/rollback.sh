#!/bin/bash
# ============================================================
#  SafetyNOTE 서버 롤백 툴 (NAS 실행용)
#  사용법: bash rollback.sh [버전코드]
#
#  버전코드 목록:
#    pre-bug010   → BUG-010 수정 직전 (BUG-009 적용 상태, 커밋 decb91e)
#    pre-bug009   → BUG-009 수정 직전 (세션 27 안정 상태, 커밋 a473c4a)
#    stable-28    → 세션 28 FCM 서버 구현 직후 (커밋 d32c632)
#    latest       → main 최신 (git pull)
#
#  NAS 경로: /volume1/safetynote
#  PM2 앱명: safetynote
# ============================================================

set -e

REPO_DIR="${SAFETYNOTE_DIR:-/volume1/safetynote}"
PM2_APP="${PM2_APP:-safetynote}"

# ── 커밋 해시 맵 ──────────────────────────────────────────────
# 서버(safetynote-server) 커밋 기준
declare -A COMMIT_MAP=(
  ["pre-bug010"]="decb91e"      # BUG-009만 적용, BUG-010 수정 전
  ["pre-bug009"]="a473c4a"      # 세션 27 — FCM 서버 구현 완료 (앱.js 브릿지 없음)
  ["stable-28"]="d32c632"       # 세션 28 — FCM 서버 push/register API
  ["latest"]="HEAD"             # 최신
)

# ── 버전별 설명 ───────────────────────────────────────────────
declare -A DESC_MAP=(
  ["pre-bug010"]="BUG-009 적용됨 / BUG-010 수정 전 (v1.4.5 APK 대응)"
  ["pre-bug009"]="세션 27 안정 버전 — FCM 서버 구현 완료 (v1.4.4 APK 대응)"
  ["stable-28"]="세션 28 — FCM 서버 API 추가됨 (v1.4.3 APK 대응)"
  ["latest"]="main 최신 (git pull 실행)"
)

# ── 색상 ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

print_header() {
  echo -e "\n${CYAN}============================================${NC}"
  echo -e "${CYAN}  SafetyNOTE 서버 롤백 툴${NC}"
  echo -e "${CYAN}============================================${NC}\n"
}

print_versions() {
  echo -e "${BLUE}사용 가능한 버전코드:${NC}\n"
  for key in pre-bug010 pre-bug009 stable-28 latest; do
    echo -e "  ${YELLOW}${key}${NC}"
    echo -e "    커밋: ${COMMIT_MAP[$key]}"
    echo -e "    설명: ${DESC_MAP[$key]}\n"
  done
}

confirm() {
  local msg="$1"
  echo -e "${YELLOW}⚠️  ${msg}${NC}"
  echo -n "계속하시겠습니까? (y/N): "
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

do_rollback() {
  local target="$1"
  local commit="${COMMIT_MAP[$target]}"

  echo -e "\n${BLUE}[1/5] 저장소 디렉토리 이동${NC}"
  cd "$REPO_DIR" || { echo -e "${RED}❌ 디렉토리 없음: $REPO_DIR${NC}"; exit 1; }
  echo "  현재 경로: $(pwd)"

  echo -e "\n${BLUE}[2/5] 현재 상태 백업${NC}"
  local backup_tag="backup-$(date +%Y%m%d-%H%M%S)"
  git stash push -m "$backup_tag" 2>/dev/null || true
  local current_commit
  current_commit=$(git rev-parse --short HEAD)
  echo "  현재 커밋: ${current_commit}"
  echo "  백업 태그: ${backup_tag}"

  echo -e "\n${BLUE}[3/5] 원격 최신 정보 가져오기${NC}"
  git fetch origin main --quiet
  echo "  fetch 완료"

  echo -e "\n${BLUE}[4/5] 대상 커밋으로 전환${NC}"
  if [ "$target" = "latest" ]; then
    git reset --hard origin/main
    echo "  ✅ main 최신으로 업데이트"
  else
    git reset --hard "$commit"
    echo "  ✅ ${commit} 으로 롤백"
  fi

  echo -e "\n${BLUE}[5/5] PM2 서버 재시작${NC}"
  if command -v pm2 &>/dev/null; then
    pm2 restart "$PM2_APP" --update-env
    sleep 2
    pm2 status "$PM2_APP"
    echo -e "  ✅ PM2 재시작 완료"
  else
    echo -e "  ${YELLOW}⚠️  PM2 없음 — 수동으로 서버를 재시작하세요${NC}"
  fi

  echo -e "\n${GREEN}============================================${NC}"
  echo -e "${GREEN}  롤백 완료!${NC}"
  echo -e "${GREEN}  대상: ${target} (${commit})${NC}"
  echo -e "${GREEN}  설명: ${DESC_MAP[$target]}${NC}"
  echo -e "${GREEN}============================================${NC}\n"

  echo -e "${CYAN}[롤백 후 확인 방법]${NC}"
  echo "  1. 브라우저에서 앱 접속 후 로그인 테스트"
  echo "  2. tail -20 /root/.pm2/logs/safetynote-error.log"
  echo "  3. curl -sk https://linkmax.myds.me:3443/ | grep app.js"
  echo ""
  echo -e "${CYAN}[원래대로 되돌리려면]${NC}"
  echo "  bash rollback.sh latest"
  echo ""
}

# ── 메인 ──────────────────────────────────────────────────────
print_header

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  print_versions
  echo -n "버전코드를 입력하세요: "
  read -r TARGET
fi

if [ -z "${COMMIT_MAP[$TARGET]+_}" ]; then
  echo -e "${RED}❌ 알 수 없는 버전코드: '$TARGET'${NC}"
  echo ""
  print_versions
  exit 1
fi

echo -e "${BLUE}롤백 대상:${NC} ${YELLOW}${TARGET}${NC}"
echo -e "${BLUE}커밋:     ${NC} ${COMMIT_MAP[$TARGET]}"
echo -e "${BLUE}설명:     ${NC} ${DESC_MAP[$TARGET]}"

# ── 롤백 대상에 따른 APK 버전 안내 ──────────────────────────────────────
declare -A APK_MAP=(
  ["pre-bug010-v2"]="v1.4.6 (BUG-010-1/2 수정, HTTP 3444 포트 없음)"
  ["pre-bug010"]="v1.4.5 (BUG-009만 적용)"
  ["pre-bug009"]="v1.4.4 (FCM 브릿지 없음)"
  ["stable-28"]="v1.4.3 이하"
  ["latest"]="최신 빌드"
)
echo -e "${YELLOW}⚠️  이 서버 버전에 맞는 APK: ${APK_MAP[$TARGET]}${NC}"
echo -e "${YELLOW}   APK도 해당 버전으로 다운그레이드하세요.${NC}"
echo ""

if confirm "위 버전으로 롤백합니다. 현재 실행 중인 서버가 재시작됩니다."; then
  do_rollback "$TARGET"
else
  echo -e "\n${YELLOW}취소되었습니다.${NC}\n"
  exit 0
fi
