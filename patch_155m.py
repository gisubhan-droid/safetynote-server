#!/usr/bin/env python3
# patch_155m.py
# 세션155m — 현장 점검 등록 저장 버튼 클릭 시 4가지 검증 팝업
#
# 검증 항목:
#   1. 체크리스트 항목 미체크 — 1개라도 양호/불량/해당없음 미선택 시
#   2. 사진 4장 미만 — 체크된(good/bad) 항목 있을 때 사진 4장 미만
#   3. 최종점검결과 미선택 — 불량/적정/양호/우수 미체크
#   4. 우수/불량 선택 후 작업자 미선택
#
# 구현 방식:
#   - 신규 함수 _showInsValidationPopup(issues) : 검증 실패 항목 목록을 카드 팝업으로 표시
#   - submitInspection() 의 기존 검증 블록 → 새 통합 검증 블록으로 교체
#   - var 전용 (const/let/?.  금지), 백틱 중첩 없음
#
# 충돌 방지:
#   - 기존 location 검증(toast) 유지
#   - 기존 _photoCount/_checkedCount 검증 블록 → 통합 블록으로 교체
#   - _setInsRegChk/_setInsChk 등 기존 핸들러 무변경

import sys

TARGET = '/home/user/webapp/public/static/app.js'

with open(TARGET, 'r', encoding='utf-8') as f:
    src = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 1: 신규 함수 _showInsValidationPopup(issues) 삽입
#          삽입 위치: submitInspection 함수 직전
# ─────────────────────────────────────────────────────────────────────────────
ANCHOR_FUNC = "async function submitInspection() {"

NEW_POPUP_FUNC = (
    "// ── 현장점검 등록 검증 실패 팝업 ─────────────────────────────────────────────\n"
    "function _showInsValidationPopup(issues) {\n"
    "  // 기존 팝업 제거\n"
    "  var old = document.getElementById('insValidationPopup');\n"
    "  if (old) old.remove();\n"
    "\n"
    "  var itemsHtml = '';\n"
    "  for (var ii = 0; ii < issues.length; ii++) {\n"
    "    var iss = issues[ii];\n"
    "    var iconMap = {\n"
    "      checklist: 'fa-clipboard-list',\n"
    "      photo:     'fa-camera',\n"
    "      result:    'fa-clipboard-check',\n"
    "      worker:    'fa-users'\n"
    "    };\n"
    "    var colorMap = {\n"
    "      checklist: '#D97706',\n"  # amber
    "      photo:     '#2563EB',\n"  # blue
    "      result:    '#DC2626',\n"  # red
    "      worker:    '#7C3AED'\n"   # violet
    "    };\n"
    "    var icon  = iconMap[iss.type]  || 'fa-exclamation-circle';\n"
    "    var color = colorMap[iss.type] || '#555';\n"
    "    itemsHtml +=\n"
    "      '<div style=\"display:flex;align-items:flex-start;gap:10px;padding:10px 12px;'" +
    "           'background:#fff;border-radius:8px;border:1px solid ' + color + '33;margin-bottom:8px\">' +\n"
    "        '<i class=\"fas ' + icon + '\" style=\"color:' + color + ';font-size:16px;margin-top:2px;flex-shrink:0\"></i>' +\n"
    "        '<div>' +\n"
    "          '<div style=\"font-size:12px;font-weight:700;color:#1E3A5F;margin-bottom:3px\">' + iss.title + '</div>' +\n"
    "          '<div style=\"font-size:11px;color:#555;line-height:1.5\">' + iss.desc + '</div>' +\n"
    "        '</div>' +\n"
    "      '</div>';\n"
    "  }\n"
    "\n"
    "  var overlay = document.createElement('div');\n"
    "  overlay.id = 'insValidationPopup';\n"
    "  overlay.style.cssText =\n"
    "    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;'" +
    "    'background:rgba(0,0,0,0.5);padding:16px';\n"
    "\n"
    "  var popupHtml =\n"
    "    '<div style=\"background:#fff;border-radius:14px;width:100%;max-width:420px;'" +
    "         'box-shadow:0 20px 60px rgba(0,0,0,0.25);overflow:hidden\">' +\n"
    "      '<div style=\"background:linear-gradient(135deg,#1E3A5F,#2d5a9e);color:#fff;'" +
    "           'padding:14px 16px;display:flex;align-items:center;gap:8px\">' +\n"
    "        '<i class=\"fas fa-exclamation-triangle\" style=\"font-size:18px;color:#FCD34D\"></i>' +\n"
    "        '<div>' +\n"
    "          '<div style=\"font-size:14px;font-weight:700\">저장 전 확인 필요</div>' +\n"
    "          '<div style=\"font-size:10px;opacity:.8;margin-top:1px\">아래 항목을 확인하고 다시 저장해 주세요</div>' +\n"
    "        '</div>' +\n"
    "      '</div>' +\n"
    "      '<div style=\"padding:14px 14px 6px\">' +\n"
    "        itemsHtml +\n"
    "      '</div>' +\n"
    "      '<div style=\"padding:6px 14px 14px;display:flex;justify-content:flex-end\">' +\n"
    "        '<button onclick=\"document.getElementById(\\\"insValidationPopup\\\").remove()\"' +\n"
    "             ' style=\"padding:8px 24px;background:#1E3A5F;color:#fff;border:none;border-radius:8px;'" +
    "             'font-size:12px;font-weight:700;cursor:pointer\">' +\n"
    "          '<i class=\"fas fa-check\" style=\"margin-right:6px\"></i>확인' +\n"
    "        '</button>' +\n"
    "      '</div>' +\n"
    "    '</div>';\n"
    "\n"
    "  overlay.innerHTML = popupHtml;\n"
    "  // 배경 클릭 시 닫기\n"
    "  overlay.addEventListener('click', function(e) {\n"
    "    if (e.target === overlay) overlay.remove();\n"
    "  });\n"
    "  document.body.appendChild(overlay);\n"
    "}\n"
    "\n"
)

if ANCHOR_FUNC not in src:
    print('[ERROR] PATCH 1 앵커를 찾지 못했습니다.')
    sys.exit(1)

src = src.replace(ANCHOR_FUNC, NEW_POPUP_FUNC + ANCHOR_FUNC, 1)
print('[OK] PATCH 1 — _showInsValidationPopup 함수 삽입 완료')

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 2: submitInspection 내 기존 검증 블록 교체
#
# OLD: location 검증 + 사진4장 검증 (2블록)
# NEW: location 검증 유지 + 통합 4개 검증 블록
# ─────────────────────────────────────────────────────────────────────────────

OLD_VALIDATION = (
    "  // 체크리스트 사진 최소 4건 검증\n"
    "  const _photoMapForValidate = window._insRegChkPhotoMap || {};\n"
    "  const _photoCount = Object.keys(_photoMapForValidate).filter(function(k) {\n"
    "    return _photoMapForValidate[k] && _photoMapForValidate[k].file;\n"
    "  }).length;\n"
    "  const _checkedCount = Object.keys(window._insRegChkMap || {}).filter(function(k) {\n"
    "    return (window._insRegChkMap || {})[k] !== 'na';\n"
    "  }).length;\n"
    "  if (_checkedCount > 0 && _photoCount < 4) {\n"
    "    toast('체크된 항목에 사진을 최소 4개 이상 첨부해 주세요. (현재: ' + _photoCount + '개)', 'error', 4000);\n"
    "    return;\n"
    "  }"
)

NEW_VALIDATION = (
    "  // ── 통합 검증 블록 (4개 항목) ──────────────────────────────────────────\n"
    "  var _valIssues = [];\n"
    "\n"
    "  // [검증1] 체크리스트 미체크 항목 확인\n"
    "  var _chkMap = window._insRegChkMap || {};\n"
    "  var _uncheckList = [];\n"
    "  if (typeof _INS_CHECKLIST !== 'undefined' && _INS_CHECKLIST) {\n"
    "    _INS_CHECKLIST.forEach(function(sec) {\n"
    "      sec.items.forEach(function(item, i) {\n"
    "        var key = sec.group + '::' + i;\n"
    "        if (!_chkMap[key]) _uncheckList.push(item.text);\n"
    "      });\n"
    "    });\n"
    "  }\n"
    "  if (_uncheckList.length > 0) {\n"
    "    var _maxShow = 3;\n"
    "    var _shown = _uncheckList.slice(0, _maxShow);\n"
    "    var _moreCount = _uncheckList.length - _maxShow;\n"
    "    var _descItems = _shown.map(function(t) {\n"
    "      return '&bull; ' + (t.length > 22 ? t.slice(0, 22) + '…' : t);\n"
    "    }).join('<br>');\n"
    "    if (_moreCount > 0) _descItems += '<br><span style=\"color:#aaa\">외 ' + _moreCount + '개 항목</span>';\n"
    "    _valIssues.push({\n"
    "      type: 'checklist',\n"
    "      title: '체크리스트 미완료 (' + _uncheckList.length + '개 항목)',\n"
    "      desc: _descItems\n"
    "    });\n"
    "  }\n"
    "\n"
    "  // [검증2] 사진 최소 4장 (체크된 good/bad 항목이 있을 때)\n"
    "  var _photoMapV = window._insRegChkPhotoMap || {};\n"
    "  var _photoCount = Object.keys(_photoMapV).filter(function(k) {\n"
    "    return _photoMapV[k] && _photoMapV[k].file;\n"
    "  }).length;\n"
    "  var _checkedCount = Object.keys(_chkMap).filter(function(k) {\n"
    "    return _chkMap[k] !== 'na';\n"
    "  }).length;\n"
    "  if (_checkedCount > 0 && _photoCount < 4) {\n"
    "    _valIssues.push({\n"
    "      type: 'photo',\n"
    "      title: '체크리스트 사진 부족 (최소 4장 필요)',\n"
    "      desc: '현재 <strong>' + _photoCount + '장</strong> 첨부됨 &mdash; ' +\n"
    "            '<strong>' + (4 - _photoCount) + '장</strong> 더 추가해 주세요.<br>' +\n"
    "            '양호/불량 항목 옆 <i class=\"fas fa-camera\" style=\"color:#2563EB\"></i> 버튼으로 첨부하세요.'\n"
    "    });\n"
    "  }\n"
    "\n"
    "  // [검증3] 최종점검결과 미선택\n"
    "  var _valInsResult = document.getElementById('insResult');\n"
    "  var _valResultVal = _valInsResult ? _valInsResult.value : '';\n"
    "  if (!_valResultVal) {\n"
    "    _valIssues.push({\n"
    "      type: 'result',\n"
    "      title: '최종 점검 결과 미선택',\n"
    "      desc: '하단 <strong>불량 / 적정 / 양호 / 우수</strong> 중 하나를 선택해 주세요.'\n"
    "    });\n"
    "  }\n"
    "\n"
    "  // [검증4] 우수/불량 선택 시 작업자 미선택\n"
    "  if (_valResultVal === '불량' || _valResultVal === '우수') {\n"
    "    var _workerChecked = document.querySelectorAll('.ins-worker-check:checked');\n"
    "    if (!_workerChecked || _workerChecked.length === 0) {\n"
    "      var _resultLabel = _valResultVal === '불량' ? '불량 해당' : '우수 해당';\n"
    "      _valIssues.push({\n"
    "        type: 'worker',\n"
    "        title: _valResultVal + ' 결과 — 작업자 미선택',\n"
    "        desc: '<strong>' + _resultLabel + ' 작업자</strong>를 1명 이상 선택해 주세요.<br>' +\n"
    "              '최종 점검 결과 아래 작업자 목록에서 선택하세요.'\n"
    "      });\n"
    "    }\n"
    "  }\n"
    "\n"
    "  // 검증 실패 시 팝업 표시 후 중단\n"
    "  if (_valIssues.length > 0) {\n"
    "    _showInsValidationPopup(_valIssues);\n"
    "    return;\n"
    "  }"
)

if OLD_VALIDATION not in src:
    print('[ERROR] PATCH 2 OLD 블록을 찾지 못했습니다.')
    sys.exit(1)

src = src.replace(OLD_VALIDATION, NEW_VALIDATION, 1)
print('[OK] PATCH 2 — submitInspection 통합 검증 블록 교체 완료')

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 3: submitInspection 내 insResult/insReason/selectedWorkerIds 수집 부분
#          이미 위에서 _valResultVal로 구했으므로, 아래 const 선언과 중복 방지
#          → insResult 수집을 _valResultVal 재사용하도록 교체
# ─────────────────────────────────────────────────────────────────────────────

OLD_RESULT_COLLECT = (
    "  const taskIdEl = document.getElementById('insTaskId');\n"
    "  const taskId = taskIdEl ? (taskIdEl.value ? parseInt(taskIdEl.value) : null) : null;\n"
    "  const insResult = document.getElementById('insResult')?.value || '';\n"
    "  const insReason = document.getElementById('insReason')?.value || '';\n"
    "  const insDateOnly = document.getElementById('insDateOnly')?.value || getKSTDate();"
)

NEW_RESULT_COLLECT = (
    "  var _taskIdEl = document.getElementById('insTaskId');\n"
    "  var taskId = _taskIdEl ? (_taskIdEl.value ? parseInt(_taskIdEl.value) : null) : null;\n"
    "  var insResult = _valResultVal;\n"
    "  var _insReasonEl = document.getElementById('insReason');\n"
    "  var insReason = _insReasonEl ? (_insReasonEl.value || '') : '';\n"
    "  var _insDateEl = document.getElementById('insDateOnly');\n"
    "  var insDateOnly = _insDateEl ? (_insDateEl.value || getKSTDate()) : getKSTDate();"
)

if OLD_RESULT_COLLECT not in src:
    print('[ERROR] PATCH 3 OLD 블록을 찾지 못했습니다.')
    sys.exit(1)

src = src.replace(OLD_RESULT_COLLECT, NEW_RESULT_COLLECT, 1)
print('[OK] PATCH 3 — insResult/insReason/taskId var 전용으로 교체 완료')

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 4: photoFiles Array.from 라인 — const → var
# ─────────────────────────────────────────────────────────────────────────────
OLD_PHOTOFILES = (
    "  // 1단계: 점검 데이터를 JSON으로 wrangler API에 저장 (사진 제외)\n"
    "  const input = document.getElementById('insPhotoInput');\n"
    "  const photoFiles = Array.from(input.files).filter(f => {"
)

NEW_PHOTOFILES = (
    "  // 1단계: 점검 데이터를 JSON으로 wrangler API에 저장 (사진 제외)\n"
    "  var _photoInput = document.getElementById('insPhotoInput');\n"
    "  var photoFiles = Array.from(_photoInput.files).filter(function(f) {"
)

if OLD_PHOTOFILES not in src:
    print('[ERROR] PATCH 4 OLD 블록을 찾지 못했습니다.')
    sys.exit(1)

src = src.replace(OLD_PHOTOFILES, NEW_PHOTOFILES, 1)
print('[OK] PATCH 4 — photoFiles var 전용 교체 완료')

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 5: photoFiles filter 화살표 함수 닫는 부분
# ─────────────────────────────────────────────────────────────────────────────
OLD_PHOTOFILES_END = (
    "    return f.size <= (isVideo ? 500 : 50) * 1024 * 1024;\n"
    "  });"
)

# 이 패턴이 파일에 여러 곳에 있을 수 있으므로, PATCH4 직후의 위치 기준으로 1회만 교체
# submitInspection 안의 photoFiles.filter 다음에 나오는 것
OLD_PHOTOF_BODY = (
    "  var photoFiles = Array.from(_photoInput.files).filter(function(f) {\n"
    "    const isVideo = f.type.startsWith('video/') || /\\.(mp4|mov|avi|webm|mkv)$/i.test(f.name);\n"
    "    return f.size <= (isVideo ? 500 : 50) * 1024 * 1024;\n"
    "  });"
)
NEW_PHOTOF_BODY = (
    "  var photoFiles = Array.from(_photoInput.files).filter(function(f) {\n"
    "    var isVideo = f.type.startsWith('video/') || /\\.(mp4|mov|avi|webm|mkv)$/i.test(f.name);\n"
    "    return f.size <= (isVideo ? 500 : 50) * 1024 * 1024;\n"
    "  });"
)

if OLD_PHOTOF_BODY not in src:
    print('[WARN] PATCH 5 대상 없음 — 이미 var 일 수 있음 (skip)')
else:
    src = src.replace(OLD_PHOTOF_BODY, NEW_PHOTOF_BODY, 1)
    print('[OK] PATCH 5 — photoFiles filter const→var 완료')

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 6: selectedWorkerIds 수집 — const → var
# ─────────────────────────────────────────────────────────────────────────────
OLD_WORKER_COLLECT = (
    "  // 불량/우수 선택된 작업자 수집\n"
    "  const selectedWorkerIds = [];\n"
    "  if (insResult === '불량' || insResult === '우수') {\n"
    "    document.querySelectorAll('.ins-worker-check:checked').forEach(cb => {\n"
    "      const wid = parseInt(cb.value);\n"
    "      if (wid) selectedWorkerIds.push(wid);\n"
    "    });\n"
    "  }"
)

NEW_WORKER_COLLECT = (
    "  // 불량/우수 선택된 작업자 수집\n"
    "  var selectedWorkerIds = [];\n"
    "  if (insResult === '불량' || insResult === '우수') {\n"
    "    document.querySelectorAll('.ins-worker-check:checked').forEach(function(cb) {\n"
    "      var wid = parseInt(cb.value);\n"
    "      if (wid) selectedWorkerIds.push(wid);\n"
    "    });\n"
    "  }"
)

if OLD_WORKER_COLLECT not in src:
    print('[ERROR] PATCH 6 OLD 블록을 찾지 못했습니다.')
    sys.exit(1)

src = src.replace(OLD_WORKER_COLLECT, NEW_WORKER_COLLECT, 1)
print('[OK] PATCH 6 — selectedWorkerIds var 전용 교체 완료')

# ─────────────────────────────────────────────────────────────────────────────
# 저장
# ─────────────────────────────────────────────────────────────────────────────
with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(src)

print('[DONE] app.js 저장 완료')
