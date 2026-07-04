#!/bin/bash
# 복원 스크립트 — BUG-067/068 작업 이전 상태로 복원
# 기준 커밋: 8ae3b6372de642f8cafa1635f43b25f044b16b7f
# 생성일: 2026-07-04 05:46
set -e
cd "$(dirname "$0")"
echo "⚠️  BUG-067/068 이전 상태로 복원합니다 (기준: 8ae3b6372de642f8cafa1635f43b25f044b16b7f)"
read -p "계속하시겠습니까? (y/N) " ans
[[ "$ans" =~ ^[Yy]$ ]] || { echo "취소됨"; exit 0; }
git reset --hard 8ae3b6372de642f8cafa1635f43b25f044b16b7f
echo "✅ 복원 완료 — $(git log --oneline -1)"
