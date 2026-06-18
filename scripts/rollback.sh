#!/bin/bash
# ============================================================
#  SafetyNOTE 서버 롤백 툴 (NAS 실행용)
#  사용법: bash rollback.sh [버전코드]
#
#  버전코드 목록:
#    pre-bug021      → BUG-021 수정 직전 (세션 35, 수동 푸시 발송 UI 개선 전, 커밋 60ddb78)
#    pre-bug017      → BUG-017 수정 직전 (세션 34, TBM 사진 팝업 z-index 수정 전, 커밋 53b6733)
#    pre-bug012      → BUG-012 수정 직전 (세션 34 작업 전, push/send+APK 파일명 수정 전)
#    pre-bug011-safe → 세션 32 완료 (FCM 진단 없음, 가장 안전, 커밋 f20094a)
#    pre-bug011      → BUG-011 PATCH 라우트 추가 직전 (FCM 진단API는 있음, 커밋 a65acc0)
#    pre-bug010      → BUG-010 수정 직전 (BUG-009 적용 상태, 커밋 decb91e)
#    pre-bug009      → BUG-009 수정 직전 (세션 27 안정 상태, 커밋 a473c4a)
#    stable-28       → 세션 28 FCM 서버 구현 직후 (커밋 d32c632)
#    latest          → main 최신 (git pull)
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
  ["pre-bug021"]="60ddb78"      # 세션 35 — BUG-021(수동 푸시 발송 UI 개선) 수정 직전
  ["pre-bug017"]="53b6733"      # 세션 34 — BUG-017(TBM 사진 팝업 z-index) 수정 직전
  ["pre-bug012"]="c087a2a"      # 세션 34 작업 전 — BUG-012(push/send 버그+APK 파일명) 수정 직전
  ["pre-bug011-safe"]="f20094a" # 세션 32 완료 상태 — FCM 진단API 없음, 가장 안전한 복원점
  ["pre-bug011"]="a65acc0"      # BUG-011 PATCH 라우트 추가 직전 — FCM 진단/상세결과 있음
  ["pre-bug010"]="decb91e"      # BUG-009만 적용, BUG-010 수정 전
  ["pre-bug009"]="a473c4a"      # 세션 27 — FCM 서버 구현 완료 (앱.js 브릿지 없음)
  ["stable-28"]="d32c632"       # 세션 28 — FCM 서버 push/register API
  ["latest"]="HEAD"             # 최신
)

# ── 버전별 설명 ───────────────────────────────────────────────
declare -A DESC_MAP=(
  ["pre-bug021"]="세션 35 — 수동 푸시 발송 UI 개선 직전 (with_token:0 케이스 구분 없음, v1.4.7 APK 대응)"
  ["pre-bug017"]="세션 34 — TBM 안전조치 사진 팝업 z-index 수정 직전 (v1.4.7 APK 대응)"
  ["pre-bug012"]="세션 34 작업 전 — push/send 순서버그+APK 파일명 수정 직전 (v1.4.7 APK 대응)"
  ["pre-bug011-safe"]="세션 32 완료 (FCM 진단 없음) — cc860f1 이전 가장 안전한 복원점"
  ["pre-bug011"]="BUG-011 PATCH 라우트만 제거 — FCM 진단/push/send 상세결과는 유지 (v1.4.7 APK 대응)"
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
  for key in pre-bug021 pre-bug017 pre-bug012 pre-bug011-safe pre-bug011 pre-bug010 pre-bug009 stable-28 latest; do
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

  echo -e "\n${BLUE}[5/6] PM2 서버 재시작${NC}"
  if command -v pm2 &>/dev/null; then
    pm2 restart "$PM2_APP" --update-env
    sleep 3
    pm2 status "$PM2_APP"
    echo -e "  ✅ PM2 재시작 완료"
  else
    echo -e "  ${YELLOW}⚠️  PM2 없음 — 수동으로 서버를 재시작하세요${NC}"
  fi

  echo -e "\n${BLUE}[6/6] 롤백 후 자동 검증${NC}"
  local verify_ok=true

  # ① 서버 HTTPS 응답 확인 (3443)
  echo -n "  ① HTTPS 3443 포트 응답: "
  if curl -sk --max-time 5 "https://localhost:3443/" -o /dev/null -w "%{http_code}" | grep -qE "^[23]"; then
    echo -e "${GREEN}✅ 정상${NC}"
  else
    local http_code
    http_code=$(curl -sk --max-time 5 "https://localhost:3443/" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
    echo -e "${RED}❌ 응답코드: ${http_code}${NC}"
    verify_ok=false
  fi

  # ② 서버 HTTP 응답 확인 (3444 — Android FCM용)
  echo -n "  ② HTTP  3444 포트 응답: "
  if curl -s --max-time 5 "http://localhost:3444/" -o /dev/null -w "%{http_code}" | grep -qE "^[23]"; then
    echo -e "${GREEN}✅ 정상${NC}"
  else
    local http_code2
    http_code2=$(curl -s --max-time 5 "http://localhost:3444/" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
    echo -e "${YELLOW}⚠️  응답코드: ${http_code2} (BUG-010 이전 버전은 정상)${NC}"
  fi

  # ③ PM2 에러 로그 마지막 5줄 출력
  echo -e "  ③ PM2 에러 로그 (최근 5줄):"
  local errlog="/root/.pm2/logs/${PM2_APP}-error.log"
  if [ -f "$errlog" ]; then
    tail -5 "$errlog" | sed 's/^/     /'
  else
    echo "     (로그 없음 또는 경로 다름: ${errlog})"
  fi

  # ④ FCM 환경변수 체크 (BUG-011 이후 버전에서만 의미 있음)
  echo -n "  ④ FCM 환경변수 체크: "
  local env_file="${REPO_DIR}/.env"
  if [ -f "$env_file" ]; then
    local pid_set ce_set pk_set
    pid_set=$(grep -c 'FCM_PROJECT_ID=' "$env_file" 2>/dev/null || echo 0)
    ce_set=$(grep -c 'FCM_CLIENT_EMAIL=' "$env_file" 2>/dev/null || echo 0)
    pk_set=$(grep -c 'FCM_PRIVATE_KEY=' "$env_file" 2>/dev/null || echo 0)
    if [ "$pid_set" -gt 0 ] && [ "$ce_set" -gt 0 ] && [ "$pk_set" -gt 0 ]; then
      echo -e "${GREEN}✅ 3개 모두 설정됨${NC}"
    else
      echo -e "${RED}❌ 미설정 항목 있음 (FCM_PROJECT_ID:${pid_set} FCM_CLIENT_EMAIL:${ce_set} FCM_PRIVATE_KEY:${pk_set})${NC}"
      verify_ok=false
    fi
  else
    echo -e "${YELLOW}⚠️  .env 파일 없음 — FCM 발송 불가${NC}"
  fi

  echo ""
  if [ "$verify_ok" = true ]; then
    echo -e "  ${GREEN}✅ 검증 통과 — 서버 정상 동작 중${NC}"
  else
    echo -e "  ${RED}❌ 검증 실패 — 아래 로그를 확인하세요:${NC}"
    echo "     pm2 logs safetynote --nostream --lines 30"
  fi

  echo -e "\n${GREEN}============================================${NC}"
  echo -e "${GREEN}  롤백 완료!${NC}"
  echo -e "${GREEN}  대상: ${target} (${commit})${NC}"
  echo -e "${GREEN}  설명: ${DESC_MAP[$target]}${NC}"
  echo -e "${GREEN}============================================${NC}\n"

  echo -e "${CYAN}[롤백 후 확인 방법]${NC}"
  echo "  1. 브라우저에서 앱 접속 후 로그인 테스트"
  echo "  2. pm2 logs safetynote --nostream --lines 30"
  echo "  3. curl -sk https://linkmax.myds.me:3443/ | grep app.js"
  echo "  4. curl -s  http://linkmax.myds.me:3444/  | grep app.js  (3444 지원 버전만)"
  echo ""
  echo -e "${CYAN}[원래대로 되돌리려면 (cc860f1 복원)]${NC}"
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
  ["pre-bug021"]="v1.4.7 (FCM 자동 알림 있음, 수동 푸시 UI 개선 전)"
  ["pre-bug017"]="v1.4.7 (FCM 자동 알림 있음, TBM 사진 팝업 z-index 버그 있음)"
  ["pre-bug012"]="v1.4.7 (FCM 자동 알림 있음, push/send 순서버그 있음)"
  ["pre-bug011-safe"]="v1.4.6 이하 (FCM 자동 알림 없음 — 수동 push/send만 가능)"
  ["pre-bug011"]="v1.4.7 (FCM 자동 알림 없음 — 수동 push/send만 가능)"
  ["pre-bug010-v2"]="v1.4.6 (BUG-010-1/2 수정, HTTP 3444 포트 없음)"
  ["pre-bug010"]="v1.4.5 (BUG-009만 적용)"
  ["pre-bug009"]="v1.4.4 (FCM 브릿지 없음)"
  ["stable-28"]="v1.4.3 이하"
  ["latest"]="최신 빌드 (v1.4.7 권장)"
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
