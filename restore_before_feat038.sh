#!/bin/bash
# 복원 기준 커밋: 67c5909 (BUG-059 + FEAT-037 공유텍스트 형식 변경)
# 사용법: bash restore_before_feat038.sh
set -e
cd "$(dirname "$0")"
echo "[복원] 67c5909 커밋으로 복원합니다..."
git stash push -m "feat038-wip-backup" 2>/dev/null || true
git reset --hard 67c5909
echo "[완료] 복원 완료. 현재 커밋:"
git log --oneline -3
