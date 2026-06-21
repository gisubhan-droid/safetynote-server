#!/bin/bash
# ============================================================
#  SafetyNOTE 서버 롤백 툴  v2.0  (NAS 실행용)
#
#  사용법:
#    bash scripts/rollback.sh           ← 버전 목록 출력 후 선택
#    bash scripts/rollback.sh latest    ← 최신(main) 으로 업데이트
#    bash scripts/rollback.sh prev      ← 바로 직전 커밋으로 1단계 롤백
#    bash scripts/rollback.sh s50       ← 세션50 이전 안정 상태
#    bash scripts/rollback.sh s49       ← 세션49 이전 안정 상태
#    bash scripts/rollback.sh <버전코드>
#
#  NAS 경로: /volume1/safetynote  (환경변수 SAFETYNOTE_DIR 로 변경 가능)
#  PM2 앱명: safetynote           (환경변수 PM2_APP 로 변경 가능)
# ============================================================

set -e

REPO_DIR="${SAFETYNOTE_DIR:-/volume1/safetynote}"
PM2_APP="${PM2_APP:-safetynote}"

# ╔══════════════════════════════════════════════════════════════╗
# ║  커밋 맵 — 세션별 복원 포인트 (최신순)                       ║
# ╚══════════════════════════════════════════════════════════════╝
declare -A COMMIT_MAP=(
  # ── 세션 50 (최신) ─────────────────────────────────────────
  ["s50-hotfix"]="2495d8e"  # ★현재 — patchSchema 구문오류(속도저하) 핫픽스
  ["s50-final"]="700e0f9"  # 세션50 최종 — 공종삭제·접속일보수정·단가불변 3종
  ["s50"]="6a9819d"        # 세션50 중간 — addCableSet DB동적로드 + otherTypes 에러 수정
  ["pre-s50"]="c6050b3"    # 세션50 작업 직전 = 세션49 완료 상태 ★ 안정 복원점
  # ── 세션 49 ────────────────────────────────────────────────
  ["s49"]="c6050b3"        # 세션49 완료 — 공량내역 버그3종+단가관리 공종+외선일보 개선
  ["pre-s49"]="6d151cf"    # 세션49 작업 직전 — BUG-022 로그 추가 상태
  # ── 세션 48 ────────────────────────────────────────────────
  ["s48"]="4bb3084"        # 세션48 완료 — BUG-022 접속일보 단가 공란 수정
  ["pre-s48"]="88ca077"    # 세션48 작업 직전 — 접속탭 TDZ에러+단가매칭 수정 완료
  # ── 세션 47 ────────────────────────────────────────────────
  ["s47"]="88ca077"        # 세션47 완료 — 접속탭 TDZ에러+단가매칭 수정
  ["s46"]="a42a38d"        # 세션46 완료 — 접속일보 야간/가공 추가단가 지원
  # ── 세션 36~45 (이전 세션) ─────────────────────────────────
  ["pre-bug023"]="f98fb2e" # 세션37 — 알림센터 전체삭제 수정 직전
  ["pre-bug022"]="4b9789e" # 세션36 — 푸시버튼 무반응 수정 직전
  ["pre-bug011-safe"]="f20094a" # 세션32 완료 (FCM 진단 없음, 가장 안전)
  # ── 특수 ────────────────────────────────────────────────────
  ["prev"]="HEAD~1"        # 바로 직전 커밋 (1단계 롤백)
  ["latest"]="HEAD"        # 최신 (git pull 실행)
)

# ╔══════════════════════════════════════════════════════════════╗
# ║  버전별 설명                                                 ║
# ╚══════════════════════════════════════════════════════════════╝
declare -A DESC_MAP=(
  ["s50-hotfix"]="★현재 — patchSchema 구문오류(서버속도저하) 핫픽스 완료"
  ["s50-final"]="세션50 최종 — 단가관리공종삭제·접속일보수정·단가불변정책 (캐시 o)"
  ["s50"]="세션50 중간 — addCableSet DB동적로드 + otherTypes 에러 수정 (캐시 n)"
  ["pre-s50"]="세션50 작업 직전 = 세션49 완료 상태 ★ 안정 복원점"
  ["s49"]="세션49 완료 — 공량내역 버그3종·단가관리 공종추가삭제·외선일보 개선"
  ["pre-s49"]="세션49 작업 직전 — BUG-022 로그만 추가된 상태"
  ["s48"]="세션48 완료 — BUG-022 접속일보 단가 공란/X표시 수정"
  ["pre-s48"]="세션48 작업 직전 — 접속탭 TDZ에러+단가매칭 수정 완료 상태"
  ["s47"]="세션47 완료 — 공량내역 접속탭 TDZ에러+단가매칭 수정"
  ["s46"]="세션46 완료 — 접속일보 함체작업 야간/가공 추가단가 지원"
  ["pre-bug023"]="세션37 — 알림센터 전체삭제 DB미반영 수정 직전"
  ["pre-bug022"]="세션36 — 푸시버튼 무반응(showConfirm 미존재) 수정 직전"
  ["pre-bug011-safe"]="세션32 완료 (FCM 진단 없음) — 오래된 안전 복원점"
  ["prev"]="바로 직전 커밋으로 1단계 롤백 (가장 빠른 되돌리기)"
  ["latest"]="main 최신으로 업데이트 (git pull)"
)

# ── 세션50 이후 최신 커밋 추가 (아래에 계속 append) ────────────
# 형식: ["s51"]="커밋해시"   ["pre-s51"]="이전커밋해시"
# 세션51 이후 작업이 완료되면 아래에 추가하세요.
# ────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

print_header() {
  echo -e "\n${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   SafetyNOTE 롤백 툴  v2.0              ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}\n"
}

print_versions() {
  echo -e "${BLUE}── 세션별 복원 포인트 (최신순) ──────────────${NC}\n"

  local ORDER=(prev latest s50-hotfix s50-final s50 pre-s50 s49 pre-s49 s48 pre-s48 s47 s46 pre-bug023 pre-bug022 pre-bug011-safe)
  for key in "${ORDER[@]}"; do
    local commit="${COMMIT_MAP[$key]:-?}"
    local desc="${DESC_MAP[$key]:-}"
    # 주요 복원점 강조
    if [[ "$key" == "prev" || "$key" == "pre-s50" || "$key" == "pre-s49" ]]; then
      echo -e "  ${GREEN}★ ${YELLOW}${key}${NC}"
    else
      echo -e "  ${YELLOW}  ${key}${NC}"
    fi
    echo -e "      커밋: ${commit}"
    echo -e "      설명: ${desc}\n"
  done

  echo -e "${CYAN}─────────────────────────────────────────────${NC}"
  echo -e "${GREEN}★ 표시 = 권장 복원 포인트${NC}\n"
}

confirm() {
  echo -e "${YELLOW}⚠️  $1${NC}"
  echo -n "계속하시겠습니까? (y/N): "
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

do_rollback() {
  local target="$1"
  local commit="${COMMIT_MAP[$target]}"

  # ── [1/5] 디렉토리 이동 ───────────────────────────────────
  echo -e "\n${BLUE}[1/5] 저장소 디렉토리 이동${NC}"
  cd "$REPO_DIR" || { echo -e "${RED}❌ 디렉토리 없음: $REPO_DIR${NC}"; exit 1; }
  echo "  경로: $(pwd)"

  # ── [2/5] 현재 상태 백업 ──────────────────────────────────
  echo -e "\n${BLUE}[2/5] 현재 상태 백업${NC}"
  local CURRENT_COMMIT
  CURRENT_COMMIT=$(git rev-parse --short HEAD)
  local BACKUP_TAG="backup-before-rollback-$(date +%Y%m%d-%H%M%S)"
  # 미커밋 변경사항이 있으면 stash
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push -m "$BACKUP_TAG" 2>/dev/null || true
    echo "  미커밋 변경사항 → stash 저장 (태그: ${BACKUP_TAG})"
  fi
  echo "  현재 커밋: ${CURRENT_COMMIT}"
  echo -e "  ${GREEN}✅ 되돌아오려면: git reset --hard ${CURRENT_COMMIT}${NC}"

  # ── [3/5] 원격 최신 정보 가져오기 ────────────────────────
  echo -e "\n${BLUE}[3/5] 원격 최신 정보 가져오기${NC}"
  git fetch origin main --quiet
  echo "  fetch 완료"

  # ── [4/5] 대상 커밋으로 전환 ─────────────────────────────
  echo -e "\n${BLUE}[4/5] 대상 커밋으로 전환${NC}"
  if [ "$target" = "latest" ]; then
    git reset --hard origin/main
    echo -e "  ${GREEN}✅ main 최신으로 업데이트${NC}"
  elif [ "$target" = "prev" ]; then
    git reset --hard HEAD~1
    ACTUAL=$(git rev-parse --short HEAD)
    echo -e "  ${GREEN}✅ 직전 커밋으로 롤백: ${ACTUAL}${NC}"
  else
    git reset --hard "$commit"
    echo -e "  ${GREEN}✅ ${commit} 으로 롤백${NC}"
  fi

  local AFTER_COMMIT
  AFTER_COMMIT=$(git rev-parse --short HEAD)
  local CACHE_VER
  CACHE_VER=$(grep -o 'v=[0-9a-z]*' node-server.ts 2>/dev/null | head -1 || echo "알 수 없음")
  echo "  롤백 후 커밋 : ${AFTER_COMMIT}"
  echo "  캐시 버전     : ${CACHE_VER}"

  # ── [5/5] PM2 재시작 ─────────────────────────────────────
  echo -e "\n${BLUE}[5/5] PM2 서버 재시작${NC}"
  if command -v pm2 &>/dev/null; then
    pm2 restart "$PM2_APP" --update-env
    sleep 3
    pm2 status "$PM2_APP"
    echo -e "  ${GREEN}✅ PM2 재시작 완료${NC}"
  else
    echo -e "  ${RED}❌ PM2 없음 — 수동으로 재시작하세요:${NC}"
    echo "    pm2 restart ${PM2_APP}  또는"
    echo "    pm2 start 'npx tsx node-server.ts' --name ${PM2_APP}"
  fi

  # ── 검증 ─────────────────────────────────────────────────
  echo -e "\n${BLUE}[검증] 서버 응답 확인${NC}"
  sleep 2

  echo -n "  HTTPS 3443: "
  local HC
  HC=$(curl -sk --max-time 8 "https://localhost:3443/" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
  if [[ "$HC" =~ ^[23] ]]; then
    echo -e "${GREEN}✅ HTTP ${HC}${NC}"
  else
    echo -e "${RED}❌ HTTP ${HC} — pm2 logs ${PM2_APP} --nostream 로 에러 확인${NC}"
  fi

  echo -n "  HTTP  3444: "
  local HC2
  HC2=$(curl -s --max-time 5 "http://localhost:3444/" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
  if [[ "$HC2" =~ ^[23] ]]; then
    echo -e "${GREEN}✅ HTTP ${HC2}${NC}"
  else
    echo -e "${YELLOW}⚠️  HTTP ${HC2} (이전 버전에선 정상)${NC}"
  fi

  echo -e "  PM2 에러 로그 (최근 5줄):"
  tail -5 "/root/.pm2/logs/${PM2_APP}-error.log" 2>/dev/null | sed 's/^/    /' \
    || echo "    (로그 없음 또는 경로 다름)"

  # ── 완료 요약 ─────────────────────────────────────────────
  echo -e "\n${GREEN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   롤백 완료!                             ║${NC}"
  echo -e "${GREEN}║   복원점: ${target} (${AFTER_COMMIT})       ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}\n"

  echo -e "${CYAN}[롤백 후 확인 방법]${NC}"
  echo "  1. 브라우저 강제새로고침 (Ctrl+Shift+R) 후 로그인 테스트"
  echo "  2. pm2 logs ${PM2_APP} --nostream --lines 30"
  echo "  3. curl -sk https://linkmax.myds.me:3443/ | grep app.js"
  echo ""
  echo -e "${CYAN}[원래 상태로 되돌리려면]${NC}"
  echo "  bash scripts/rollback.sh latest"
  echo "  또는: git reset --hard ${CURRENT_COMMIT} && pm2 restart ${PM2_APP}"
  echo ""
}

# ── 메인 ──────────────────────────────────────────────────────
print_header

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  print_versions
  echo -n "버전코드를 입력하세요 (예: prev, pre-s50): "
  read -r TARGET
fi

# 빈 입력 처리
if [ -z "$TARGET" ]; then
  echo -e "${RED}❌ 버전코드가 입력되지 않았습니다.${NC}"
  exit 1
fi

# 알 수 없는 버전코드 처리
if [ -z "${COMMIT_MAP[$TARGET]+_}" ]; then
  echo -e "${RED}❌ 알 수 없는 버전코드: '${TARGET}'${NC}\n"
  print_versions
  exit 1
fi

echo -e "${BLUE}롤백 대상 : ${YELLOW}${TARGET}${NC}"
echo -e "${BLUE}커밋      : ${COMMIT_MAP[$TARGET]}${NC}"
echo -e "${BLUE}설명      : ${DESC_MAP[$TARGET]}${NC}"
echo ""

if confirm "위 버전으로 롤백합니다. 현재 실행 중인 서버가 재시작됩니다."; then
  do_rollback "$TARGET"
else
  echo -e "\n${YELLOW}취소되었습니다.${NC}\n"
  exit 0
fi
