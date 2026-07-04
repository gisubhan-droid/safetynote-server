#!/bin/bash
# FEAT-041 작업 전 복원 스크립트
# 기준 커밋: be23091 (docs: PROJECT_HISTORY 세션 93 FEAT-040)
echo "=== FEAT-041 작업 전 상태로 복원합니다 ==="
echo "대상 커밋: be23091"
git checkout be23091 -- public/static/app.js node-server.ts
echo "✅ 복원 완료"
git status
