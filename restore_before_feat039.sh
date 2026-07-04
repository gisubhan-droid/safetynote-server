#!/bin/bash
# 복원 스크립트 — FEAT-039 작업 이전 상태로 복원
# 기준 커밋: ee92eabbdb0eb623b0d57138ac8625f51cc5fa19
# 생성일: 2026-07-04 05:35
set -e
cd "$(dirname "$0")"
echo "⚠️  FEAT-039 이전 상태로 복원합니다 (기준: ee92eabbdb0eb623b0d57138ac8625f51cc5fa19)"
read -p "계속하시겠습니까? (y/N) " ans
[[ "$ans" =~ ^[Yy]$ ]] || { echo "취소됨"; exit 0; }
git reset --hard ee92eabbdb0eb623b0d57138ac8625f51cc5fa19
echo "✅ 복원 완료 — ee92eab docs: PROJECT_HISTORY 세션 89 BUG-066 커밋 해시 27227ad 확정"
