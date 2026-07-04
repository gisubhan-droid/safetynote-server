#!/bin/bash
# BUG-067 수정 전 복원 스크립트
# 기준 커밋: ee92eab (세션 89 PROJECT_HISTORY 확정)
# 생성일: 2026-07-04 세션 90

set -e
RESTORE_COMMIT="ee92eab"
echo "=== BUG-067 이전 상태로 복원합니다 (기준: $RESTORE_COMMIT) ==="
cd "$(dirname "$0")"
git fetch origin
git reset --hard "$RESTORE_COMMIT"
echo "✅ 복원 완료: $(git log --oneline -1)"
