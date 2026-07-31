#!/bin/bash
# =============================================================================
# fix-sqlite3-binary.sh — better-sqlite3 바이너리 GLIBC 호환 수정 스크립트
#
# 배경:
#   NAS001 (LinkMax, glibc 2.26) 환경에서 better-sqlite3 v9.x prebuilt 바이너리는
#   GLIBC_2.29 심볼(exp/log/pow/fcntl64)을 요구하여 동작 불가.
#   v8.0.0 node-v108 바이너리는 GLIBC_2.14 이하만 사용 → 완전 호환.
#
# 사용법:
#   bash /volume1/safetynote/scripts/fix-sqlite3-binary.sh
#
# npm install 후 바이너리가 덮어씌워졌을 때 재실행하면 됩니다.
#
# 자동 실행 등록 (DSM 작업 스케줄러):
#   서버 시작 트리거로 이 스크립트를 등록하면 재부팅 후에도 자동 복구됩니다.
# =============================================================================

set -e

INSTALL_DIR="${SAFETYNOTE_DIR:-/volume1/safetynote}"
BINARY_TARGET="${INSTALL_DIR}/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
BINARY_URL="https://github.com/WiseLibs/better-sqlite3/releases/download/v8.0.0/better-sqlite3-v8.0.0-node-v108-linux-x64.tar.gz"
TMP_TAR="/tmp/bs3_fix_v800.tar.gz"
TMP_DIR="/tmp/bs3_fix_v800_dir"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${YELLOW}━━━ better-sqlite3 바이너리 GLIBC 호환 수정 ━━━${NC}"
echo "대상: ${BINARY_TARGET}"
echo ""

# ── Step 1: 바이너리 디렉토리 존재 확인 ──────────────────────────────────────
BINARY_DIR=$(dirname "$BINARY_TARGET")
if [ ! -d "$BINARY_DIR" ]; then
  echo -e "${RED}❌ 오류: node_modules/better-sqlite3가 없습니다.${NC}"
  echo "   먼저 npm install --ignore-scripts 를 실행하세요:"
  echo "   cd ${INSTALL_DIR} && npm install --ignore-scripts"
  exit 1
fi

# ── Step 2: 이미 올바른 바이너리인지 확인 ────────────────────────────────────
if [ -f "$BINARY_TARGET" ]; then
  # 파일 크기로 v8.0.0 바이너리 여부 판별 (1724152 bytes)
  FILE_SIZE=$(wc -c < "$BINARY_TARGET" 2>/dev/null || echo 0)
  if [ "$FILE_SIZE" -eq 1724152 ]; then
    echo -e "${GREEN}✅ 이미 v8.0.0 호환 바이너리가 적용되어 있습니다. (${FILE_SIZE} bytes)${NC}"
    echo "   재적용이 필요하면 --force 옵션을 사용하세요."
    if [ "${1}" != "--force" ]; then
      exit 0
    fi
    echo "   --force 옵션으로 강제 재적용합니다."
  fi
fi

# ── Step 3: 바이너리 다운로드 ─────────────────────────────────────────────────
echo "📥 v8.0.0 node-v108 바이너리 다운로드 중..."
rm -f "$TMP_TAR"
if ! wget -q --show-progress "$BINARY_URL" -O "$TMP_TAR" 2>/dev/null; then
  # wget --show-progress 미지원 버전 대응
  wget -q "$BINARY_URL" -O "$TMP_TAR"
fi

if [ ! -s "$TMP_TAR" ]; then
  echo -e "${RED}❌ 다운로드 실패. 네트워크 연결을 확인하세요.${NC}"
  exit 1
fi
echo -e "${GREEN}   다운로드 완료: $(wc -c < "$TMP_TAR") bytes${NC}"

# ── Step 4: 압축 해제 ─────────────────────────────────────────────────────────
echo "📦 압축 해제 중..."
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"
tar -xzf "$TMP_TAR" -C "$TMP_DIR"

NEW_BINARY="${TMP_DIR}/build/Release/better_sqlite3.node"
if [ ! -f "$NEW_BINARY" ]; then
  echo -e "${RED}❌ 압축 해제 실패: better_sqlite3.node 파일을 찾을 수 없습니다.${NC}"
  exit 1
fi

# ── Step 5: 현재 바이너리 백업 ───────────────────────────────────────────────
if [ -f "$BINARY_TARGET" ]; then
  BACKUP="${BINARY_TARGET}.backup_$(date +%Y%m%d%H%M%S)"
  cp "$BINARY_TARGET" "$BACKUP"
  echo "   기존 바이너리 백업: ${BACKUP}"
fi

# ── Step 6: 바이너리 교체 ────────────────────────────────────────────────────
echo "🔄 바이너리 교체 중..."
cp "$NEW_BINARY" "$BINARY_TARGET"
chmod 755 "$BINARY_TARGET"

NEW_SIZE=$(wc -c < "$BINARY_TARGET")
echo -e "${GREEN}   교체 완료: ${NEW_SIZE} bytes${NC}"

# ── Step 7: 정리 ──────────────────────────────────────────────────────────────
rm -f "$TMP_TAR"
rm -rf "$TMP_DIR"

# ── Step 8: PM2 재시작 ───────────────────────────────────────────────────────
PM2_APP="${PM2_APP:-safetynote}"
echo ""
echo "🔄 PM2 재시작: ${PM2_APP}"

# PM2 경로 탐색
PM2_BIN=""
for p in /usr/local/bin/pm2 /volume1/@appstore/Node.js_v18/usr/local/bin/pm2 /volume1/@appstore/Node.js_v20/usr/local/bin/pm2; do
  [ -x "$p" ] && PM2_BIN="$p" && break
done
[ -z "$PM2_BIN" ] && PM2_BIN=$(command -v pm2 2>/dev/null || echo "")

if [ -n "$PM2_BIN" ]; then
  "$PM2_BIN" restart "$PM2_APP" --update-env
  sleep 3
  echo ""
  "$PM2_BIN" status "$PM2_APP"
else
  echo -e "${YELLOW}⚠️  PM2를 찾을 수 없습니다. 수동으로 재시작하세요:${NC}"
  echo "   pm2 restart ${PM2_APP}"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ better-sqlite3 바이너리 교체 완료!${NC}"
echo -e "${GREEN}   v8.0.0 node-v108 (GLIBC_2.14 이하) 적용됨${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "⚠️  주의: npm install 실행 후에는 이 스크립트를 다시 실행해야 합니다."
echo "    bash ${INSTALL_DIR}/scripts/fix-sqlite3-binary.sh"
