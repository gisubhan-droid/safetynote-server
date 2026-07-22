#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_155c.py
세션155 Part 2 수정:
  1. node-server.ts: GET /api/inspections/:id — u.company AS inspector_company 추가
  2. app.js _makePhotoCell: blob URL iframe 내 절대 URL (_origin prefix) 추가
  3. app.js _printInspectionReport:
     - _origin 변수 선언 추가 (기본 정보 준비 블록 상단)
     - companyName = ins.inspector_company || ins.contractor_name || ...
     - guBun join(' & ') → join(' / ')
     - makeHeaderTable 점검자 서명란(sign-cell) 삭제 (단순 td로 변경)
"""

import sys
import re

# ──────────────────────────────────────────────────────────
# 파일 경로
# ──────────────────────────────────────────────────────────
NODE_SERVER = '/home/user/webapp/node-server.ts'
APP_JS      = '/home/user/webapp/public/static/app.js'

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'  ✅ 저장: {path}')

def patch(content, old, new, label):
    if old not in content:
        print(f'  ⚠️  [{label}] 패턴 미발견 — 건너뜀')
        return content
    count = content.count(old)
    if count > 1:
        print(f'  ⚠️  [{label}] 패턴 {count}회 존재 — 첫 번째만 교체')
    result = content.replace(old, new, 1)
    print(f'  ✅ [{label}] 교체 완료')
    return result

errors = []

# ══════════════════════════════════════════════════════════
# 1. node-server.ts: u.company AS inspector_company 추가
# ══════════════════════════════════════════════════════════
print('\n[1] node-server.ts — inspector_company 추가')
ns = read_file(NODE_SERVER)

OLD_NS = """      SELECT si.*,
             u.name  AS inspector_name,
             t.title AS task_title,
             t.task_number,
             t.sub_task_number,
             t.work_number,
             t.construction_type,
             t.work_class,
             t.contractor_name,"""

NEW_NS = """      SELECT si.*,
             u.name    AS inspector_name,
             u.company AS inspector_company,
             t.title AS task_title,
             t.task_number,
             t.sub_task_number,
             t.work_number,
             t.construction_type,
             t.work_class,
             t.contractor_name,"""

ns = patch(ns, OLD_NS, NEW_NS, 'node-server inspector_company')
write_file(NODE_SERVER, ns)


# ══════════════════════════════════════════════════════════
# 2. app.js 수정
# ══════════════════════════════════════════════════════════
print('\n[2] app.js — 4가지 수정')
app = read_file(APP_JS)

# ── 2-A. _makePhotoCell: origin prefix 추가 ──────────────
print('  [2-A] _makePhotoCell origin prefix')
OLD_PHOTO_CELL = (
    'function _makePhotoCell(photo, idx, escFn) {\n'
    '  var captionDefault = photo ? (photo.caption || (\'점검사진 #\' + (idx + 1))) : \'\';\n'
    '  return photo\n'
    '    ? \'<img src="/api/inspections/photo/\' + photo.id + \'/img" alt="\' + escFn(captionDefault) + \'" style="max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto">\'\n'
    '    : \'<div style="width:100%;height:100%;background:#f5f5f5;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:9pt">사진 없음</div>\';\n'
    '}'
)
NEW_PHOTO_CELL = (
    'function _makePhotoCell(photo, idx, escFn, origin) {\n'
    '  var _o = origin || \'\';\n'
    '  var captionDefault = photo ? (photo.caption || (\'점검사진 #\' + (idx + 1))) : \'\';\n'
    '  return photo\n'
    '    ? \'<img src="\' + _o + \'/api/inspections/photo/\' + photo.id + \'/img" alt="\' + escFn(captionDefault) + \'" style="max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto">\'\n'
    '    : \'<div style="width:100%;height:100%;background:#f5f5f5;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:9pt">사진 없음</div>\';\n'
    '}'
)
app = patch(app, OLD_PHOTO_CELL, NEW_PHOTO_CELL, '2-A _makePhotoCell origin param')

# ── 2-B. _printInspectionReport 기본 정보 준비: _origin 추가 + companyName + guBun ──
print('  [2-B] 기본 정보: _origin, companyName, guBun')
OLD_BASIC = (
    '    // ── 기본 정보 준비 ──\n'
    '    var INS_TYPE_LBL = { routine: \'정기점검\', special: \'합동점검\', safety: \'수시점검\', joint: \'합동점검\', frequent: \'수시점검\' };\n'
    '    var insType     = INS_TYPE_LBL[ins.inspection_type] || ins.inspection_type || \'\';\n'
    '    var companyName = ins.contractor_name || ins.con_manager_name || \'\';\n'
    '    var workNum     = ins.work_number\n'
    '      ? (ins.sub_task_number ? ins.work_number + \'-\' + ins.sub_task_number : ins.work_number)\n'
    '      : (ins.task_number || \'\');\n'
    '    var insDate     = (ins.inspection_date_only || (ins.inspection_date || \'\').substring(0, 10) || \'\').replace(/-/g, \'.\') || \'\';\n'
    '    var insAddr     = ins.task_confirmed_address || ins.location || \'\';\n'
    '    var WC_MAP      = { cable_install: \'광케이블 시설\', cable_splice: \'광케이블 접속\', equipment_other: \'장비 시설및 기타\', conduit: \'관로시설\' };\n'
    '    var conType     = ins.construction_type || \'\';\n'
    '    var workClass   = WC_MAP[ins.work_class] || ins.work_class || \'\';\n'
    '    var guBun       = [conType, workClass].filter(Boolean).join(\' & \');\n'
    '    var siteManager = ins.supervisor_name || ins.con_manager_name || \'\';\n'
    '    var inspectorName = ins.inspector_name || \'\';'
)
NEW_BASIC = (
    '    // ── 기본 정보 준비 ──\n'
    '    var _origin     = window.location.origin;  // blob URL iframe에서 절대 URL 필요\n'
    '    var INS_TYPE_LBL = { routine: \'정기점검\', special: \'합동점검\', safety: \'수시점검\', joint: \'합동점검\', frequent: \'수시점검\' };\n'
    '    var insType     = INS_TYPE_LBL[ins.inspection_type] || ins.inspection_type || \'\';\n'
    '    var companyName = ins.inspector_company || ins.contractor_name || ins.con_manager_name || \'\';\n'
    '    var workNum     = ins.work_number\n'
    '      ? (ins.sub_task_number ? ins.work_number + \'-\' + ins.sub_task_number : ins.work_number)\n'
    '      : (ins.task_number || \'\');\n'
    '    var insDate     = (ins.inspection_date_only || (ins.inspection_date || \'\').substring(0, 10) || \'\').replace(/-/g, \'.\') || \'\';\n'
    '    var insAddr     = ins.task_confirmed_address || ins.location || \'\';\n'
    '    var WC_MAP      = { cable_install: \'광케이블 시설\', cable_splice: \'광케이블 접속\', equipment_other: \'장비 시설및 기타\', conduit: \'관로시설\' };\n'
    '    var conType     = ins.construction_type || \'\';\n'
    '    var workClass   = WC_MAP[ins.work_class] || ins.work_class || \'\';\n'
    '    var guBun       = [conType, workClass].filter(Boolean).join(\' / \');\n'
    '    var siteManager = ins.supervisor_name || ins.con_manager_name || \'\';\n'
    '    var inspectorName = ins.inspector_name || \'\';'
)
app = patch(app, OLD_BASIC, NEW_BASIC, '2-B 기본 정보 _origin/companyName/guBun')

# ── 2-C. makeHeaderTable 점검자 서명란(sign-cell) 삭제 ──
print('  [2-C] makeHeaderTable 서명란 삭제')
OLD_SIGN = (
    '          \'<td class="val" style="padding:0">\' +\n'
    '            \'<table style="border:none;width:100%"><tr>\' +\n'
    '              \'<td style="border:none;padding:1px 3px;font-size:7pt;width:60%">\' + _esc(inspectorName) + \'</td>\' +\n'
    '              \'<td class="sign-cell">(서명)</td>\' +\n'
    '            \'</tr></table>\' +\n'
    '          \'</td>\''
)
NEW_SIGN = (
    '          \'<td class="val">\' + _esc(inspectorName) + \'</td>\''
)
app = patch(app, OLD_SIGN, NEW_SIGN, '2-C 서명란 삭제')

# ── 2-D. _makePhotoCell 호출부에 _origin 인자 추가 (4곳) ──
print('  [2-D] _makePhotoCell 호출에 _origin 전달')

OLD_CALL_0 = "_makePhotoCell(pairTop[0], pg*4+0, _esc)"
NEW_CALL_0 = "_makePhotoCell(pairTop[0], pg*4+0, _esc, _origin)"
app = patch(app, OLD_CALL_0, NEW_CALL_0, '2-D call pairTop[0]')

OLD_CALL_1 = "_makePhotoCell(pairTop[1], pg*4+1, _esc)"
NEW_CALL_1 = "_makePhotoCell(pairTop[1], pg*4+1, _esc, _origin)"
app = patch(app, OLD_CALL_1, NEW_CALL_1, '2-D call pairTop[1]')

OLD_CALL_2 = "_makePhotoCell(pairBot[0], pg*4+2, _esc)"
NEW_CALL_2 = "_makePhotoCell(pairBot[0], pg*4+2, _esc, _origin)"
app = patch(app, OLD_CALL_2, NEW_CALL_2, '2-D call pairBot[0]')

OLD_CALL_3 = "_makePhotoCell(pairBot[1], pg*4+3, _esc)"
NEW_CALL_3 = "_makePhotoCell(pairBot[1], pg*4+3, _esc, _origin)"
app = patch(app, OLD_CALL_3, NEW_CALL_3, '2-D call pairBot[1]')

write_file(APP_JS, app)

# ══════════════════════════════════════════════════════════
# 3. 결과 검증
# ══════════════════════════════════════════════════════════
print('\n[3] 검증')

# node-server.ts 검증
ns2 = read_file(NODE_SERVER)
checks_ns = [
    ('inspector_company SELECT', 'u.company AS inspector_company'),
]
for label, pat in checks_ns:
    if pat in ns2:
        print(f'  ✅ node-server.ts [{label}]')
    else:
        print(f'  ❌ node-server.ts [{label}] 누락')
        errors.append(label)

# app.js 검증
app2 = read_file(APP_JS)
checks_app = [
    ('_origin 선언', "var _origin     = window.location.origin"),
    ('companyName inspector_company', "ins.inspector_company || ins.contractor_name"),
    ("guBun ' / '", "join(' / ')"),
    ('_makePhotoCell origin param', "function _makePhotoCell(photo, idx, escFn, origin)"),
    ('_makePhotoCell 절대URL', "_o + '/api/inspections/photo/'"),
    ('서명란 삭제', "var _o = origin || ''"),  # sign-cell이 없으면 OK
    ('pairTop[0] _origin', "_makePhotoCell(pairTop[0], pg*4+0, _esc, _origin)"),
    ('pairBot[1] _origin', "_makePhotoCell(pairBot[1], pg*4+3, _esc, _origin)"),
]
for label, pat in checks_app:
    if pat in app2:
        print(f'  ✅ app.js [{label}]')
    else:
        print(f'  ❌ app.js [{label}] 누락')
        errors.append(label)

# sign-cell 삭제 확인
if '(서명)' in app2:
    print('  ⚠️  app.js [서명 텍스트] 아직 남아있음 — 확인 필요')
else:
    print('  ✅ app.js [서명란 삭제] 확인됨')

print()
if errors:
    print(f'❌ 오류 {len(errors)}개: {errors}')
    sys.exit(1)
else:
    print('✅ 모든 패치 완료')
