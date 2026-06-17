#!/bin/bash
# ================================================================
# BUG-020 패치 롤백 스크립트
# 용도: 86fe9b0 패치 적용 후 문제 발생 시 a849e37 으로 즉시 복원
# 실행: bash /volume1/safetynote/rollback-020.sh
# ================================================================
set -e

NAS_DIR="/volume1/safetynote"
ROLLBACK_COMMIT="a849e37"
APP_NAME="safetynote"

echo "========================================"
echo "  BUG-020 롤백 시작 → $ROLLBACK_COMMIT"
echo "========================================"

cd "$NAS_DIR"

echo "[1/4] 현재 상태 확인..."
git log --oneline -3

echo ""
echo "[2/4] 원격 최신 정보 가져오기..."
git fetch origin

echo ""
echo "[3/4] $ROLLBACK_COMMIT 으로 체크아웃..."
git checkout "$ROLLBACK_COMMIT" -- node-server.ts public/static/app.js BUGFIX_LOG.md
# HEAD는 main으로 유지, 파일 내용만 롤백 커밋 버전으로 복원

echo ""
echo "[4/4] PM2 재시작..."
pm2 restart "$APP_NAME"

sleep 2
echo ""
echo "========================================"
echo "  롤백 완료! 현재 실행 파일 상태:"
git log --oneline -1
echo "  node-server.ts: $(git show $ROLLBACK_COMMIT:node-server.ts | md5sum | cut -c1-8)..."
echo "========================================"
echo ""
echo "확인 명령:"
echo "  pm2 logs $APP_NAME --nostream | tail -20"
