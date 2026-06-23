#!/bin/bash
# ============================================================
# 복원 스크립트: BUG-041 수정 전 상태(7421134)로 롤백
# 생성일: 2026-06-23 (세션 63)
# 사용 시점: BUG-041 수정 적용 후 오류 발생 시
# ============================================================

TARGET_COMMIT="7421134"

echo "========================================"
echo "SafetyNOTE 복원 스크립트 — BUG-041 이전"
echo "대상 커밋: ${TARGET_COMMIT}"
echo "========================================"
echo ""

# 1. 현재 상태 확인
echo "[1/4] 현재 상태 확인..."
git log --oneline -3
echo ""

# 2. 롤백
echo "[2/4] ${TARGET_COMMIT} 로 롤백 중..."
git reset --hard "${TARGET_COMMIT}"
if [ $? -ne 0 ]; then
  echo "❌ 롤백 실패. git 상태를 확인하세요."
  exit 1
fi
echo "✅ 롤백 완료"
echo ""

# 3. 빌드
echo "[3/4] 빌드 중 (약 10초)..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ 빌드 실패"
  exit 1
fi
echo "✅ 빌드 완료"
echo ""

# 4. 서버 재시작
echo "[4/4] PM2 재시작..."
pm2 restart safetynote
echo "✅ 서버 재시작 완료"
echo ""
echo "========================================"
echo "복원 완료! 커밋: $(git log --oneline -1)"
echo "========================================"
