#!/bin/bash
# ============================================================
#  SafetyNOTE NAS 배포 스크립트  v2.0
#  사용법: bash scripts/nas-deploy.sh
#
#  목적: GitHub main 브랜치 최신 코드를 NAS에 반영
#  순서: git pull → 캐시버전 확인 → pm2 restart → 동작 검증
#
#  NAS 경로: /volume1/safetynote  (환경변수 SAFETYNOTE_DIR 로 변경 가능)
#  PM2 앱명: safetynote           (환경변수 PM2_APP 로 변경 가능)
#  서버 URL: https://linkmax.myds.me:3443  (환경변수 SERVER_URL 로 변경 가능)
# ============================================================

set -e

REPO_DIR="${SAFETYNOTE_DIR:-/volume1/safetynote}"
PM2_APP="${PM2_APP:-safetynote}"
SERVER_URL="${SERVER_URL:-https://linkmax.myds.me:3443}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

echo -e "\n${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   SafetyNOTE NAS 배포 스크립트  v2.0    ║${NC}"
echo -e "${CYAN}║   $(date '+%Y-%m-%d %H:%M:%S')                    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}\n"

# ── [1/6] 저장소 이동 ────────────────────────────────────────
echo -e "${BLUE}[1/6] 저장소 디렉토리 이동${NC}"
cd "$REPO_DIR" || { echo -e "${RED}❌ 디렉토리 없음: $REPO_DIR${NC}"; exit 1; }
echo "  경로: $(pwd)"

BEFORE_COMMIT=$(git rev-parse --short HEAD)
BEFORE_FULL=$(git rev-parse HEAD)
echo "  배포 전 커밋: ${BEFORE_COMMIT}"

# ── [2/6] git pull ────────────────────────────────────────────
echo -e "\n${BLUE}[2/6] GitHub main 브랜치 동기화${NC}"

git fetch origin main --quiet

if ! git pull origin main --ff-only 2>/dev/null; then
  echo -e "  ${YELLOW}⚠️  fast-forward 실패 → 강제 동기화 시도${NC}"
  git reset --hard origin/main
fi

AFTER_COMMIT=$(git rev-parse --short HEAD)
AFTER_FULL=$(git rev-parse HEAD)
echo "  배포 후 커밋: ${AFTER_COMMIT}"

if [ "$BEFORE_COMMIT" = "$AFTER_COMMIT" ]; then
  echo -e "  ${YELLOW}⚠️  이미 최신 버전입니다 (변경사항 없음)${NC}"
  echo -e "  ${YELLOW}    강제 재시작만 필요하면 Ctrl+C 후 pm2 restart ${PM2_APP}${NC}"
  echo ""
else
  echo -e "  ${GREEN}✅ 새 코드 반영됨: ${BEFORE_COMMIT} → ${AFTER_COMMIT}${NC}"
  echo ""
  echo "  변경된 파일:"
  git diff --name-only "$BEFORE_FULL" "$AFTER_FULL" 2>/dev/null | sed 's/^/    /' || true
fi

# ── [3/6] 핵심 파일 확인 ──────────────────────────────────────
echo -e "\n${BLUE}[3/6] 핵심 파일 및 버전 확인${NC}"

# 캐시 버전 확인
CACHE_VER=$(grep -o 'v=[0-9a-z]*' node-server.ts 2>/dev/null | head -1 || echo "알 수 없음")
echo "  캐시 버전  : ${CACHE_VER}"

# 최신 커밋 메시지
LAST_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null || echo "")
echo "  최근 커밋  : ${LAST_MSG}"

# node-server.ts 존재 확인
if [ -f "node-server.ts" ]; then
  echo -e "  node-server.ts: ${GREEN}✅ 존재${NC}"
else
  echo -e "  node-server.ts: ${RED}❌ 없음! 잘못된 경로일 수 있습니다.${NC}"
  exit 1
fi

# app.js 존재 확인
APP_JS="public/static/app.js"
if [ -f "$APP_JS" ]; then
  echo -e "  app.js         : ${GREEN}✅ 존재$(wc -l < "$APP_JS")줄${NC}"
else
  echo -e "  app.js         : ${RED}❌ 없음${NC}"
fi

# ── [4/6] Node.js 패키지 확인 ─────────────────────────────────
echo -e "\n${BLUE}[4/6] Node.js 패키지 확인${NC}"
if [ -f "package.json" ] && command -v npm &>/dev/null; then
  if [ ! -d "node_modules" ]; then
    echo "  node_modules 없음 → npm install 실행"
    npm install --quiet
    echo -e "  ${GREEN}✅ npm install 완료${NC}"
  else
    echo "  node_modules 존재 — 스킵"
  fi
fi

# ── [5/6] PM2 재시작 ─────────────────────────────────────────
echo -e "\n${BLUE}[5/6] PM2 서버 재시작${NC}"
if command -v pm2 &>/dev/null; then
  pm2 restart "$PM2_APP" --update-env
  sleep 3
  pm2 status "$PM2_APP"
  echo -e "  ${GREEN}✅ PM2 재시작 완료${NC}"
else
  echo -e "  ${RED}❌ PM2 없음. 아래 명령으로 수동 재시작:${NC}"
  echo "    npm install -g pm2"
  echo "    pm2 start 'npx tsx node-server.ts' --name ${PM2_APP}"
  exit 1
fi

# ── [6/6] 동작 검증 ───────────────────────────────────────────
echo -e "\n${BLUE}[6/6] 서버 동작 검증${NC}"
sleep 2

# HTTPS 3443 응답 확인
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "${SERVER_URL}/" --max-time 10 2>/dev/null || echo "000")
echo "  서버 응답 (HTTPS): HTTP ${HTTP_CODE}"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
  echo -e "  ${GREEN}✅ 서버 정상 응답${NC}"

  # 서빙 중인 캐시 버전 확인
  SERVED_VER=$(curl -sk "${SERVER_URL}/" --max-time 10 2>/dev/null | grep -o 'app\.js?v=[^"]*' | head -1 || echo "확인불가")
  echo "  서빙 캐시 버전  : ${SERVED_VER}"

  # 캐시버전 일치 여부
  if echo "$SERVED_VER" | grep -qF "${CACHE_VER#v=}"; then
    echo -e "  ${GREEN}✅ 캐시 버전 일치 — 최신 코드 정상 서빙 중${NC}"
  else
    echo -e "  ${YELLOW}⚠️  캐시 버전 불일치. pm2 restart 후 재확인 권장${NC}"
  fi
else
  echo -e "  ${RED}❌ 서버 응답 없음 (HTTP ${HTTP_CODE})${NC}"
  echo "  에러 로그 확인:"
  local ERRLOG="/root/.pm2/logs/${PM2_APP}-error.log"
  tail -5 "$ERRLOG" 2>/dev/null || echo "  (로그 없음: $ERRLOG)"
fi

# ── 완료 요약 ─────────────────────────────────────────────────
echo -e "\n${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   배포 완료!                             ║${NC}"
echo -e "${GREEN}║   배포 전: ${BEFORE_COMMIT}                        ║${NC}"
echo -e "${GREEN}║   배포 후: ${AFTER_COMMIT}                        ║${NC}"
echo -e "${GREEN}║   캐시  : ${CACHE_VER}                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}\n"

echo -e "${CYAN}[배포 후 확인 체크리스트]${NC}"
echo "  1. 브라우저 강제새로고침 (Ctrl+Shift+R) 후 로그인 테스트"
echo "  2. 단가관리 → 외선/접속 공종 추가·삭제 테스트"
echo "  3. 외선일보/접속일보 제출 후 '수정하기' 버튼 테스트"
echo "  4. 공량내역 → 합계금액 계산 확인"
echo ""
echo -e "${CYAN}[에러 발생 시]${NC}"
echo "  로그 확인 : pm2 logs ${PM2_APP} --nostream --lines 50"
echo "  즉시 롤백 : bash scripts/rollback.sh  (버전 목록 출력)"
echo ""
