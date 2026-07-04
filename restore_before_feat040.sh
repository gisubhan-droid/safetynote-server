#!/bin/bash
# FEAT-040 작업 전 복원 스크립트
# 기준 커밋: 4656039 (docs: PROJECT_HISTORY 세션 92 BUG-069)
echo "=== FEAT-040 작업 전 상태로 복원합니다 ==="
echo "대상 커밋: 4656039"
git checkout 4656039 -- public/static/app.js node-server.ts
echo "✅ 복원 완료"
git status
