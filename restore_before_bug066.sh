#!/bin/bash
# BUG-066 수정 전 복원 스크립트
# 기준 커밋: fa3bd82 (세션 88 PROJECT_HISTORY 확정)
# 생성일: 2026-07-04 세션 89

set -e
RESTORE_COMMIT="fa3bd82"
echo "=== BUG-066 이전 상태로 복원합니다 (기준: $RESTORE_COMMIT) ==="
cd "$(dirname "$0")"
git fetch origin
git reset --hard "$RESTORE_COMMIT"
echo "✅ 복원 완료: $(git log --oneline -1)"
