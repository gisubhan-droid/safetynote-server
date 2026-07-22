#!/usr/bin/env python3
# patch_155l.py
# 세션155l — 체크리스트 섹션 헤더 우측 "전체 해당없음" 체크박스 추가
#
# 변경 범위:
#   1. _insRegChkHtml 빌더 (line ~16044): 등록 모달 섹션 헤더 → flex + 우측 체크박스
#   2. _renderInsChkTab (line ~16920): 수정 탭 섹션 헤더 → flex + 우측 체크박스
#   3. 신규 함수 _setInsRegSecAllNa(cb) — 등록 모달용, var 전용
#   4. 신규 함수 _setInsSecAllNa(cb) — 수정 탭용, var 전용
#   삽입 위치: _setInsRegChkByEl 함수 직전 (line 16788)
#
# 주의사항:
#   - var 전용 (const/let/옵셔널체이닝 금지)
#   - 백틱 중첩 금지 (템플릿 리터럴 안 백틱 → + 연결)
#   - 섹션 그룹명을 encodeURIComponent로 인코딩해 data-secgrp 속성에 저장
#     → onclick 핸들러에서 getAttribute + decodeURIComponent로 복원
#   - _setInsRegChk / _setInsChk 기존 함수와 충돌 없음 (동일 함수 호출)

import re, sys

TARGET = '/home/user/webapp/public/static/app.js'

with open(TARGET, 'r', encoding='utf-8') as f:
    src = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 1: 등록 모달 섹션 헤더 (OLD → NEW)
# ─────────────────────────────────────────────────────────────────────────────
OLD_REG_HDR = (
    "    _insRegChkHtml += '<div style=\"margin-bottom:8px\">' +\n"
    "      '<div style=\"background:#685182;color:#fff;border-radius:5px 5px 0 0;padding:4px 10px;font-size:11px;font-weight:700\">' +\n"
    "        sec.group +\n"
    "      '</div>';"
)

NEW_REG_HDR = (
    "    var _regEncGrp = encodeURIComponent(sec.group);\n"
    "    _insRegChkHtml += '<div style=\"margin-bottom:8px\">' +\n"
    "      '<div style=\"background:#685182;color:#fff;border-radius:5px 5px 0 0;padding:4px 10px;" +
    "font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:space-between\">' +\n"
    "        '<span>' + sec.group + '</span>' +\n"
    "        '<label style=\"display:flex;align-items:center;gap:4px;font-size:9px;font-weight:400;" +
    "cursor:pointer;opacity:.9;white-space:nowrap\">' +\n"
    "          '<input type=\"checkbox\" style=\"width:13px;height:13px;cursor:pointer;accent-color:#fff\"' +\n"
    "               ' data-secgrp=\"' + _regEncGrp + '\"' +\n"
    "               ' onchange=\"_setInsRegSecAllNa(this)\">' +\n"
    "          '전체 해당없음' +\n"
    "        '</label>' +\n"
    "      '</div>';"
)

if OLD_REG_HDR not in src:
    print('[ERROR] PATCH 1 OLD 문자열을 찾지 못했습니다.')
    sys.exit(1)

src = src.replace(OLD_REG_HDR, NEW_REG_HDR, 1)
print('[OK] PATCH 1 — 등록 모달 섹션 헤더 수정 완료')

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 2: 수정 탭 섹션 헤더 (OLD → NEW)
# ─────────────────────────────────────────────────────────────────────────────
OLD_CHK_HDR = (
    "    html += '<div style=\"margin-bottom:6px\">' +\n"
    "      '<div style=\"background:#e8e0f0;border-left:4px solid #685182;padding:4px 8px;font-size:11px;font-weight:700;color:#4E3A63\">' +\n"
    "        sec.group +\n"
    "      '</div>';"
)

NEW_CHK_HDR = (
    "    var _chkEncGrp = encodeURIComponent(sec.group);\n"
    "    html += '<div style=\"margin-bottom:6px\">' +\n"
    "      '<div style=\"background:#e8e0f0;border-left:4px solid #685182;padding:4px 8px;" +
    "font-size:11px;font-weight:700;color:#4E3A63;display:flex;align-items:center;justify-content:space-between\">' +\n"
    "        '<span>' + sec.group + '</span>' +\n"
    "        '<label style=\"display:flex;align-items:center;gap:4px;font-size:9px;font-weight:400;" +
    "cursor:pointer;color:#685182;white-space:nowrap\">' +\n"
    "          '<input type=\"checkbox\" style=\"width:13px;height:13px;cursor:pointer;accent-color:#685182\"' +\n"
    "               ' data-secgrp=\"' + _chkEncGrp + '\" data-ins=\"' + insId + '\"' +\n"
    "               ' onchange=\"_setInsSecAllNa(this)\">' +\n"
    "          '전체 해당없음' +\n"
    "        '</label>' +\n"
    "      '</div>';"
)

if OLD_CHK_HDR not in src:
    print('[ERROR] PATCH 2 OLD 문자열을 찾지 못했습니다.')
    sys.exit(1)

src = src.replace(OLD_CHK_HDR, NEW_CHK_HDR, 1)
print('[OK] PATCH 2 — 수정 탭 섹션 헤더 수정 완료')

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 3: 신규 함수 2개 삽입 (_setInsRegChkByEl 직전)
# ─────────────────────────────────────────────────────────────────────────────
ANCHOR = "function _setInsRegChkByEl(btn) {"

NEW_FUNCS = (
    "// ── 섹션 전체 해당없음 — 등록 모달용 ──────────────────────────────────────\n"
    "function _setInsRegSecAllNa(cb) {\n"
    "  var grp = cb.getAttribute('data-secgrp');\n"
    "  var decodedGrp = decodeURIComponent(grp);\n"
    "  if (!cb.checked) return;\n"
    "  _INS_CHECKLIST.forEach(function(sec) {\n"
    "    if (sec.group !== decodedGrp) return;\n"
    "    sec.items.forEach(function(item, i) {\n"
    "      var key = sec.group + '::' + i;\n"
    "      var quotedKey = key.replace(/\"/g, '&quot;');\n"
    "      var naBtn = document.querySelector(\n"
    "        '[data-key=\"' + quotedKey + '\"][data-val=\"na\"]'\n"
    "      );\n"
    "      if (naBtn) _setInsRegChk(key, 'na', naBtn);\n"
    "    });\n"
    "  });\n"
    "}\n"
    "\n"
    "// ── 섹션 전체 해당없음 — 수정 탭용 ────────────────────────────────────────\n"
    "function _setInsSecAllNa(cb) {\n"
    "  var grp   = cb.getAttribute('data-secgrp');\n"
    "  var insId = cb.getAttribute('data-ins');\n"
    "  var decodedGrp = decodeURIComponent(grp);\n"
    "  if (!cb.checked) return;\n"
    "  _INS_CHECKLIST.forEach(function(sec) {\n"
    "    if (sec.group !== decodedGrp) return;\n"
    "    sec.items.forEach(function(item, i) {\n"
    "      var key = sec.group + '::' + i;\n"
    "      var quotedKey = key.replace(/\"/g, '&quot;');\n"
    "      var naBtn = document.querySelector(\n"
    "        '[data-ins=\"' + insId + '\"][data-key=\"' + quotedKey + '\"][data-val=\"na\"]'\n"
    "      );\n"
    "      if (naBtn) _setInsChk(insId, key, 'na', naBtn);\n"
    "    });\n"
    "  });\n"
    "}\n"
    "\n"
)

if ANCHOR not in src:
    print('[ERROR] PATCH 3 삽입 앵커를 찾지 못했습니다.')
    sys.exit(1)

src = src.replace(ANCHOR, NEW_FUNCS + ANCHOR, 1)
print('[OK] PATCH 3 — 신규 함수 2개 삽입 완료')

# ─────────────────────────────────────────────────────────────────────────────
# 저장
# ─────────────────────────────────────────────────────────────────────────────
with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(src)

print('[DONE] app.js 저장 완료')
