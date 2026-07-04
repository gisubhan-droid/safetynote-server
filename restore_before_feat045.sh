#!/bin/bash
# FEAT-045 작업 전 복원 스크립트
# 기준 커밋: 31da8d7
set -e
echo "[복원] FEAT-045 이전 상태로 복원합니다..."
git checkout 31da8d7 -- src/routes/risk.ts
git checkout 31da8d7 -- public/static/app.js
git checkout 31da8d7 -- node-server.ts
echo "[완료] 복원 완료. 빌드 후 재시작하세요."
