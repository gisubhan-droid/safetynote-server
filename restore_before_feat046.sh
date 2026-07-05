#!/bin/bash
# FEAT-046 작업 전 복원 스크립트 — 기준 커밋: a825e74
set -e
echo "[복원] FEAT-046 이전 상태로 복원합니다..."
git checkout a825e74 -- public/static/app.js
git checkout a825e74 -- node-server.ts
echo "[완료] 복원 완료. npm run build 후 pm2 restart 하세요."
