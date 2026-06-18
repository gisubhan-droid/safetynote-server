#!/bin/bash
# ============================================================
#  SafetyNOTE NAS 배포 스크립트
#  사용법: bash nas-deploy.sh
#
#  목적: GitHub main 브랜치 최신 코드를 NAS에 반영
#  작업: git pull → 캐시버전 확인 → pm2 restart → 동작 검증
#
#  NAS 경로: /volume1/safetynote
#  PM2 앱명: safetynote
# ============================================================

set -e

REPO_DIR="${SAFETYNOTE_DIR:-/volume1/safetynote}"
PM2_APP="${PM2_APP:-safetynote}"
SERVER_URL="${SERVER_URL:-https://linkmax.myds.me:3443}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "\n${CYAN}============================================${NC}"
echo -e "${CYAN}  SafetyNOTE NAS 배포 스크립트${NC}"
echo -e "${CYAN}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}============================================${NC}\n"

# ── [1/6] 저장소 이동 ────────────────────────────────────────
echo -e "${BLUE}[1/6] 저장소 디렉토리 이동${NC}"
cd "$REPO_DIR" || { echo -e "${RED}❌ 디렉토리 없음: $REPO_DIR${NC}"; exit 1; }
echo "  경로: $(pwd)"

BEFORE_COMMIT=$(git rev-parse --short HEAD)
echo "  배포 전 커밋: ${BEFORE_COMMIT}"

# ── [2/6] git pull ────────────────────────────────────────────
echo -e "\n${BLUE}[2/6] GitHub main 브랜치 동기화${NC}"

# git pull 실패 시 강제 동기화 시도
if ! git pull origin main --ff-only 2>/dev/null; then
  echo -e "  ${YELLOW}⚠️  fast-forward 실패 → 강제 동기화 시도${NC}"
  git fetch origin
  git reset --hard origin/main
fi

AFTER_COMMIT=$(git rev-parse --short HEAD)
echo "  배포 후 커밋: ${AFTER_COMMIT}"

if [ "$BEFORE_COMMIT" = "$AFTER_COMMIT" ]; then
  echo -e "  ${YELLOW}⚠️  이미 최신 버전입니다 (변경사항 없음)${NC}"
  echo -e "  ${YELLOW}    강제로 재시작하려면 Ctrl+C로 중단 후 pm2 restart ${PM2_APP}${NC}"
  echo ""
fi

# ── [3/6] 변경 파일 확인 ──────────────────────────────────────
echo -e "\n${BLUE}[3/6] 핵심 파일 변경 확인${NC}"

# app.js 버전 확인
CACHE_VER=$(grep -o "v=[0-9a-z]*" node-server.ts | head -1)
echo "  캐시 버전: ${CACHE_VER}"

# BUG-009/010 코드 확인
APP_JS="public/static/app.js"
if [ -f "$APP_JS" ]; then
  BUG009=$(grep -c "saveAuthToken" "$APP_JS" 2>/dev/null || echo 0)
  BUG010=$(grep -c "downloadApk" "$APP_JS" 2>/dev/null || echo 0)
  echo "  app.js BUG-009 (saveAuthToken): ${BUG009}건"
  echo "  app.js BUG-010 (downloadApk):   ${BUG010}건"

  if [ "$BUG009" -eq 0 ]; then
    echo -e "  ${RED}❌ BUG-009 수정코드 없음! git pull이 제대로 안 됐을 수 있음${NC}"
  fi
  if [ "$BUG010" -eq 0 ]; then
    echo -e "  ${RED}❌ BUG-010 수정코드 없음! git pull이 제대로 안 됐을 수 있음${NC}"
  fi
  if [ "$BUG009" -gt 0 ] && [ "$BUG010" -gt 0 ]; then
    echo -e "  ${GREEN}✅ BUG-009/010 수정코드 확인됨${NC}"
  fi
fi

# ── [4/6] npm 빌드 확인 ───────────────────────────────────────
echo -e "\n${BLUE}[4/6] Node.js 패키지 확인${NC}"
if [ -f "package.json" ] && command -v npm &>/dev/null; then
  # node_modules가 없으면 install
  if [ ! -d "node_modules" ]; then
    echo "  node_modules 없음 → npm install 실행"
    npm install --quiet
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
  echo -e "  ${YELLOW}⚠️  PM2 없음 — 수동 재시작 필요:${NC}"
  echo "    pm2 restart ${PM2_APP}"
  exit 1
fi

# ── [6/6] 동작 검증 ───────────────────────────────────────────
echo -e "\n${BLUE}[6/6] 서버 동작 검증${NC}"
sleep 2

# 서버 응답 확인
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "${SERVER_URL}/" --max-time 10 || echo "000")
echo "  서버 응답: HTTP ${HTTP_CODE}"

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "  ${GREEN}✅ 서버 정상 응답${NC}"

  # 캐시 버전 확인
  SERVED_VER=$(curl -sk "${SERVER_URL}/" | grep -o "app\.js?v=[^\"]*" | head -1)
  echo "  서빙 중인 캐시 버전: ${SERVED_VER}"

  # app.js 브릿지 코드 확인
  BUG009_LIVE=$(curl -sk "${SERVER_URL}/static/app.js" | grep -c "saveAuthToken" || echo 0)
  BUG010_LIVE=$(curl -sk "${SERVER_URL}/static/app.js" | grep -c "downloadApk" || echo 0)
  echo "  라이브 app.js BUG-009 코드: ${BUG009_LIVE}건"
  echo "  라이브 app.js BUG-010 코드: ${BUG010_LIVE}건"

  if [ "$BUG009_LIVE" -gt 0 ] && [ "$BUG010_LIVE" -gt 0 ]; then
    echo -e "  ${GREEN}✅ BUG-009/010 수정코드 라이브 서빙 확인!${NC}"
  else
    echo -e "  ${RED}❌ 수정코드 미서빙 — 서버 캐시/tsx 캐시 문제일 수 있음${NC}"
    echo -e "  ${YELLOW}시도: pm2 delete ${PM2_APP} && pm2 start 'tsx node-server.ts' --name ${PM2_APP}${NC}"
  fi
else
  echo -e "  ${RED}❌ 서버 응답 없음 (HTTP ${HTTP_CODE})${NC}"
  echo "  에러 로그 확인:"
  tail -5 /root/.pm2/logs/${PM2_APP}-error.log 2>/dev/null || echo "  로그 파일 없음"
fi

# ── 완료 요약 ─────────────────────────────────────────────────
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  배포 완료!${NC}"
echo -e "${GREEN}  배포 전: ${BEFORE_COMMIT}${NC}"
echo -e "${GREEN}  배포 후: ${AFTER_COMMIT}${NC}"
echo -e "${GREEN}  캐시 버전: ${CACHE_VER}${NC}"
echo -e "${GREEN}============================================${NC}\n"

echo -e "${CYAN}[다음 확인 사항]${NC}"
echo "  1. 앱에서 로그인 → FCM 등록 수 증가 확인"
echo "  2. 앱에서 APK 다운로드 버튼 클릭 테스트"
echo "  3. 에러 로그: tail -20 /root/.pm2/logs/${PM2_APP}-error.log"
echo ""
