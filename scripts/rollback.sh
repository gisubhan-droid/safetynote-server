#!/bin/bash
# ============================================================
#  SafetyNOTE 서버 롤백 툴  v3.0  (NAS 실행용)
#
#  사용법:
#    bash scripts/rollback.sh           ← 버전 목록 출력 후 선택
#    bash scripts/rollback.sh latest    ← 최신(main)으로 업데이트
#    bash scripts/rollback.sh prev      ← 바로 직전 커밋으로 1단계 롤백
#    bash scripts/rollback.sh pre-v300  ← v3.0 적용 직전 (가장 빠른 원상복구)
#    bash scripts/rollback.sh v300      ← v3.0 Option C UI 완성 상태
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
  # ── v3.0 핫픽스 (세션 106) ─────────────────────────────────
  ["v300-hotfix"]="6c4db00"   # ★현재 — BUG-077 모바일 margin-left 겹침 수정
  ["pre-hotfix"]="baf7b23"    # 핫픽스 직전 (v3.0 최종 검토 완료 상태)

  # ── v3.0 릴리즈 (세션 105) ─────────────────────────────────
  ["v300-latest"]="ee1a077"   # v3.0 + PROJECT_HISTORY 기록 완료
  ["v300"]="338bc7d"          # v3.0 정식 — Option C + 버그픽스 2건
  ["v300-optc"]="d329cf0"     # v3.0 Option C 구현 완료 (버그픽스 전)
  ["pre-v300"]="9111ac2"      # ★v3.0 적용 직전 = v2.x 최신 안정 상태

  # ── 세션 104 (PM2 경로 수정) ────────────────────────────────
  ["s104"]="9111ac2"          # PM2 start 패턴 확정 + 경로 최적화
  ["pre-s104"]="cd532c8"      # 세션104 작업 직전

  # ── 세션 103 / 비상복구 시스템 ──────────────────────────────
  ["s103"]="cd532c8"          # PM2 interpreter 절대경로 강제
  ["s102-safe"]="347d747"     # ★ FIX-054 비상복구 포트 3445 (안정)

  # ── 세션 102 (BUG-076 수정) ─────────────────────────────────
  ["s102"]="8b33ad6"          # BUG-076 legal-notices 404→null 200 수정
  ["pre-s102"]="753d5b9"      # 세션102 직전

  # ── 세션 101 (BUG-075/074/073) ──────────────────────────────
  ["s101"]="1410b65"          # BUG-073 patchSchema v0.148 + 중복정리
  ["pre-s101"]="c4db7c8"      # 세션101 직전

  # ── 세션 100 (FEAT-046) ─────────────────────────────────────
  ["s100"]="9b64991"          # FEAT-046 위험성평가 메뉴 재편
  ["pre-s100"]="a825e74"      # 세션100 직전

  # ── 특수 ────────────────────────────────────────────────────
  ["prev"]="HEAD~1"           # 바로 직전 커밋 (1단계 롤백)
  ["latest"]="HEAD"           # 최신 (git pull 실행)
)

# ╔══════════════════════════════════════════════════════════════╗
# ║  버전별 설명                                                 ║
# ╚══════════════════════════════════════════════════════════════╝
declare -A DESC_MAP=(
  ["v300-hotfix"]="★현재 — BUG-077 모바일 아이콘 레일 겹침 핫픽스 (:has(#icon-rail) 선택자 분리) (6c4db00)"
  ["pre-hotfix"]="핫픽스 직전 — v3.0 최종 검토 완료 상태 (baf7b23)"
  ["v300-latest"]="v3.0 PROJECT_HISTORY + 문서 완료 (ee1a077)"
  ["v300"]="v3.0 정식 릴리즈 — Option C UI + 버그픽스(모바일 이중탭/CSS충돌) + 캐시 v300 (338bc7d)"
  ["v300-optc"]="v3.0 Option C 구현 (버그픽스 전) — 아이콘 레일 56px + 플라이아웃 220px (d329cf0)"
  ["pre-v300"]="★ v3.0 적용 직전 = v2.x 최신 안정 상태 ← v3.0에 문제 시 여기로 (9111ac2)"
  ["s104"]="세션104 — PM2 start 패턴 확정 + pm2/tsx 경로 탐색 최적화"
  ["pre-s104"]="세션104 작업 직전"
  ["s103"]="세션103 — PM2 interpreter 절대경로 강제 (DSM PATH 대응)"
  ["s102-safe"]="★ FIX-054 비상복구 포트 3445 — 안정 운영 권장 복원점"
  ["s102"]="세션102 — BUG-076 legal-notices 404→null 200 + 진단API"
  ["pre-s102"]="세션102 직전"
  ["s101"]="세션101 — BUG-073 patchSchema v0.148 + 분류별항목 중복정리"
  ["pre-s101"]="세션101 직전"
  ["s100"]="세션100 — FEAT-046 위험성평가 메뉴 3개 분리"
  ["pre-s100"]="세션100 직전"
  ["prev"]="바로 직전 커밋으로 1단계 롤백 (가장 빠른 되돌리기)"
  ["latest"]="main 최신으로 업데이트 (git pull + reset)"
)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; NC='\033[0m'

print_header() {
  echo -e "\n${CYAN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   SafetyNOTE 롤백 툴  v3.0-hotfix             ║${NC}"
  echo -e "${CYAN}║   현재 운영 버전: v3.0-hotfix (BUG-077 수정)  ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}\n"
}

print_versions() {
  # 현재 HEAD 표시
  local CUR
  CUR=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "알수없음")
  echo -e "${MAGENTA}현재 서버 커밋: ${CUR}${NC}\n"

  echo -e "${BLUE}── 복원 포인트 (최신 → 과거) ────────────────────${NC}\n"

  local ORDER=(prev latest v300-hotfix pre-hotfix v300-latest v300 v300-optc pre-v300 s104 pre-s104 s103 s102-safe s102 pre-s102 s101 pre-s101 s100 pre-s100)
  local STARS=("prev" "latest" "v300-hotfix" "pre-v300" "s102-safe")

  for key in "${ORDER[@]}"; do
    local commit="${COMMIT_MAP[$key]:-?}"
    local desc="${DESC_MAP[$key]:-}"
    local is_star=0
    for s in "${STARS[@]}"; do [[ "$s" == "$key" ]] && is_star=1; done

    if [[ $is_star -eq 1 ]]; then
      echo -e "  ${GREEN}★ ${YELLOW}${key}${NC}"
    else
      echo -e "    ${YELLOW}${key}${NC}"
    fi
    echo -e "      커밋: ${commit}"
    echo -e "      설명: ${desc}\n"
  done

  echo -e "${CYAN}─────────────────────────────────────────────────${NC}"
  echo -e "${GREEN}★ = 권장 복원 포인트 | pre-v300 = v3.0 이전 최신 안정${NC}\n"
}

confirm() {
  echo -e "${YELLOW}⚠️  $1${NC}"
  echo -n "계속하시겠습니까? (y/N): "
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

# PM2 바이너리 탐색 (DSM PATH 대응)
find_pm2() {
  if command -v pm2 &>/dev/null; then echo "$(command -v pm2)"; return; fi
  for p in /usr/local/bin/pm2 /usr/bin/pm2 /opt/local/bin/pm2 \
            /usr/local/lib/node_modules/pm2/bin/pm2; do
    [[ -x "$p" ]] && echo "$p" && return
  done
  echo ""
}

do_rollback() {
  local target="$1"
  local commit="${COMMIT_MAP[$target]}"

  # ── [1/6] 디렉토리 이동 ───────────────────────────────────
  echo -e "\n${BLUE}[1/6] 저장소 디렉토리 이동${NC}"
  cd "$REPO_DIR" || { echo -e "${RED}❌ 디렉토리 없음: $REPO_DIR${NC}"; exit 1; }
  echo "  경로: $(pwd)"

  # ── [2/6] 현재 상태 기록 & stash ──────────────────────────
  echo -e "\n${BLUE}[2/6] 현재 상태 기록 & 백업${NC}"
  local CURRENT_COMMIT
  CURRENT_COMMIT=$(git rev-parse --short HEAD)
  local BACKUP_TAG="rollback-backup-$(date +%Y%m%d-%H%M%S)"

  if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push -m "$BACKUP_TAG" 2>/dev/null || true
    echo "  미커밋 변경사항 → stash 저장 (태그: ${BACKUP_TAG})"
  fi
  echo "  현재 커밋: ${CURRENT_COMMIT}"
  echo -e "  ${GREEN}↩ 되돌아오려면: cd $REPO_DIR && git reset --hard ${CURRENT_COMMIT} && pm2 restart ${PM2_APP}${NC}"

  # ── [3/6] 원격 fetch ──────────────────────────────────────
  echo -e "\n${BLUE}[3/6] 원격 최신 정보 fetch${NC}"
  git fetch origin main --quiet 2>&1 && echo "  fetch 완료" || echo "  fetch 경고 (오프라인 환경?)"

  # ── [4/6] 대상 커밋으로 전환 ─────────────────────────────
  echo -e "\n${BLUE}[4/6] 대상 커밋으로 전환${NC}"
  if [ "$target" = "latest" ]; then
    git reset --hard origin/main
    echo -e "  ${GREEN}✅ main 최신으로 업데이트${NC}"
  elif [ "$target" = "prev" ]; then
    git reset --hard HEAD~1
    local ACTUAL
    ACTUAL=$(git rev-parse --short HEAD)
    echo -e "  ${GREEN}✅ 직전 커밋으로 롤백: ${ACTUAL}${NC}"
  else
    git reset --hard "$commit"
    echo -e "  ${GREEN}✅ ${commit} 으로 롤백${NC}"
  fi

  local AFTER_COMMIT
  AFTER_COMMIT=$(git rev-parse --short HEAD)
  local CACHE_VER
  CACHE_VER=$(grep -o 'v=[0-9a-zA-Z_]*' node-server.ts 2>/dev/null | head -1 || echo "알 수 없음")
  echo "  롤백 후 커밋 : ${AFTER_COMMIT}"
  echo "  캐시 버전    : ${CACHE_VER}"

  # ── [5/6] PM2 재시작 ──────────────────────────────────────
  echo -e "\n${BLUE}[5/6] PM2 서버 재시작${NC}"
  local PM2_BIN
  PM2_BIN=$(find_pm2)
  if [ -n "$PM2_BIN" ]; then
    "$PM2_BIN" restart "$PM2_APP" --update-env
    sleep 3
    "$PM2_BIN" status "$PM2_APP"
    echo -e "  ${GREEN}✅ PM2 재시작 완료${NC}"
  else
    echo -e "  ${RED}❌ PM2 없음 — 수동으로 재시작하세요:${NC}"
    echo "    /usr/local/bin/pm2 restart ${PM2_APP}"
  fi

  # ── [6/6] 서버 응답 확인 ─────────────────────────────────
  echo -e "\n${BLUE}[6/6] 서버 응답 확인${NC}"
  sleep 3

  echo -n "  HTTPS 3443: "
  local HC
  HC=$(curl -sk --max-time 8 "https://localhost:3443/" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
  if [[ "$HC" =~ ^[23] ]]; then
    echo -e "${GREEN}✅ HTTP ${HC}${NC}"
  else
    echo -e "${RED}❌ HTTP ${HC} — pm2 logs ${PM2_APP} --nostream 으로 확인${NC}"
  fi

  echo -n "  HTTP  3445: "
  local HC2
  HC2=$(curl -s --max-time 5 "http://localhost:3445/" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
  if [[ "$HC2" =~ ^[23] ]]; then
    echo -e "${GREEN}✅ HTTP ${HC2}${NC}"
  else
    echo -e "${YELLOW}⚠️  HTTP ${HC2}${NC}"
  fi

  echo "  최근 에러 로그 (5줄):"
  tail -5 "/root/.pm2/logs/${PM2_APP}-error.log" 2>/dev/null | sed 's/^/    /' \
    || echo "    (로그 없음 또는 경로 다름)"

  # ── 완료 요약 ─────────────────────────────────────────────
  echo -e "\n${GREEN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   ✅ 롤백 완료!                              ║${NC}"
  printf  "${GREEN}║   복원점 : %-32s ║${NC}\n" "${target} (${AFTER_COMMIT})"
  echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}\n"

  echo -e "${CYAN}[롤백 후 확인 방법]${NC}"
  echo "  1. 브라우저 강제새로고침 (Ctrl+Shift+R) 후 로그인 테스트"
  echo "  2. pm2 logs ${PM2_APP} --nostream --lines 30"
  echo "  3. curl -sk https://linkmax.myds.me:3443/ | grep 'app.js'"
  echo ""
  echo -e "${CYAN}[원래 v3.0으로 되돌리려면]${NC}"
  echo "  bash scripts/rollback.sh latest"
  echo "  또는: git reset --hard ${CURRENT_COMMIT} && pm2 restart ${PM2_APP}"
  echo ""
}

# ── 메인 ──────────────────────────────────────────────────────
print_header

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  print_versions
  echo -n "버전코드를 입력하세요 (예: prev, pre-v300): "
  read -r TARGET
fi

if [ -z "$TARGET" ]; then
  echo -e "${RED}❌ 버전코드가 입력되지 않았습니다.${NC}"
  exit 1
fi

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
