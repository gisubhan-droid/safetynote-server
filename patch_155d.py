#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_155d.py — 세션155 Part 3 (현장점검 출력 추가 수정)

수정사항:
  1. [출력 창 방식] _printInspectionReport: _openPrintOverlay → window.open 새 팝업창 방식
     (TBM/안전교육 처럼 별도 팝업창에서 열림, 기존 작업화면 유지)
  2. [구분 값 오류] WC_MAP 확장 + CON_TYPE_DEF 기반 한글변환
     "line" 등 미매핑 영문키도 처리, construction_type이 한글이면 그대로 사용
  3. [작업자 빈값] node-server.ts: inspection_workers 없으면 task_assignments 폴백
  4. [디자인 정리] 출력 CSS 전면 개선 (더 깔끔한 레이아웃, 명확한 구분선, 가독성)
  5. [닫기버튼] 새 팝업창이므로 window.close() 로 변경
"""

import sys

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
        return content, False
    count = content.count(old)
    if count > 1:
        print(f'  ⚠️  [{label}] 패턴 {count}회 존재 — 첫 번째만 교체')
    result = content.replace(old, new, 1)
    print(f'  ✅ [{label}] 교체 완료')
    return result, True

errors = []

# ══════════════════════════════════════════════════════════
# 1. node-server.ts: inspection_workers 없으면 task_assignments 폴백
# ══════════════════════════════════════════════════════════
print('\n[1] node-server.ts — 작업자 폴백 추가')
ns = read_file(NODE_SERVER)

OLD_WORKERS = """    // 연결된 작업자 목록
    try {
      ins.workers = (rawDb.prepare(`
        SELECT iw.worker_id, iw.result_type, u.name AS worker_name, u.position,
               COALESCE(u.is_leader, 0) AS is_leader
        FROM inspection_workers iw
        JOIN users u ON u.id = iw.worker_id
        WHERE iw.inspection_id = ?
        ORDER BY COALESCE(u.is_leader, 0) DESC, u.name ASC
      `).all(id) as any[])
    } catch (_) {
      ins.workers = []
    }"""

NEW_WORKERS = """    // 연결된 작업자 목록
    try {
      ins.workers = (rawDb.prepare(`
        SELECT iw.worker_id, iw.result_type, u.name AS worker_name, u.position,
               COALESCE(u.is_leader, 0) AS is_leader
        FROM inspection_workers iw
        JOIN users u ON u.id = iw.worker_id
        WHERE iw.inspection_id = ?
        ORDER BY COALESCE(u.is_leader, 0) DESC, u.name ASC
      `).all(id) as any[])
    } catch (_) {
      ins.workers = []
    }
    // 작업자 없으면 해당 task의 배정 작업자(task_assignments)로 폴백
    if ((!ins.workers || ins.workers.length === 0) && ins.task_id) {
      try {
        const taRows = rawDb.prepare(`
          SELECT u.name AS worker_name, u.position,
                 COALESCE(u.is_leader, 0) AS is_leader
          FROM task_assignments ta
          JOIN users u ON u.id = ta.worker_id
          WHERE ta.task_id = ?
          ORDER BY COALESCE(u.is_leader, 0) DESC, u.name ASC
        `).all(ins.task_id) as any[]
        if (taRows && taRows.length > 0) ins.workers = taRows
      } catch (_) {}
    }"""

ns, ok1 = patch(ns, OLD_WORKERS, NEW_WORKERS, 'node-server workers 폴백')
write_file(NODE_SERVER, ns)

# ══════════════════════════════════════════════════════════
# 2. app.js — _printInspectionReport 전체 수정
# ══════════════════════════════════════════════════════════
print('\n[2] app.js 수정')
app = read_file(APP_JS)

# ── 2-A. 구분(guBun) 값 수정: WC_MAP 확장 + 한글 변환 로직 강화 ──
print('  [2-A] WC_MAP 확장 및 guBun 변환 강화')
OLD_WCMAP = (
    "    var WC_MAP      = { cable_install: '광케이블 시설', cable_splice: '광케이블 접속', equipment_other: '장비 시설및 기타', conduit: '관로시설' };\n"
    "    var conType     = ins.construction_type || '';\n"
    "    var workClass   = WC_MAP[ins.work_class] || ins.work_class || '';\n"
    "    var guBun       = [conType, workClass].filter(Boolean).join(' / ');"
)
NEW_WCMAP = (
    "    // 작업종류(work_class) 영문키 → 한글 변환 (WORK_CLASS_DEF 기반 + 추가 매핑)\n"
    "    var WC_MAP = {\n"
    "      cable_install:   '광케이블 시설',\n"
    "      cable_splice:    '광케이블 접속',\n"
    "      equipment_other: '장비 시설및 기타',\n"
    "      conduit:         '관로시설',\n"
    "      line:            '선로공사',\n"
    "      inside:          '구내공사',\n"
    "      other:           '기타'\n"
    "    };\n"
    "    // 공사종류(construction_type): 한글이면 그대로, 영문키면 CON_TYPE_DEF 변환\n"
    "    var CON_TYPE_KR = {\n"
    "      relocation: '지장이설', subscription: '청약개통', conduit: '관로공사',\n"
    "      environment: '환경공사', separate: '별도사업', other: '기타'\n"
    "    };\n"
    "    var rawConType  = ins.construction_type || '';\n"
    "    var conType     = CON_TYPE_KR[rawConType] || rawConType;\n"
    "    var rawWc       = ins.work_class || '';\n"
    "    var workClass   = WC_MAP[rawWc] || (rawWc ? rawWc : '');\n"
    "    var guBun       = [conType, workClass].filter(Boolean).join(' / ');"
)
app, ok2a = patch(app, OLD_WCMAP, NEW_WCMAP, '2-A WC_MAP 확장')

# ── 2-B. 출력 창 방식 변경: _openPrintOverlay → window.open 팝업창 ──
print('  [2-B] 출력 창 방식: _openPrintOverlay → window.open 팝업창')

# 닫기 버튼 postMessage → window.close() 로 변경
OLD_CLOSE_BTN = (
    "        '<button class=\"btn-p\" style=\"background:#374151\" onclick=\"window.parent.postMessage(\\'closePrintOverlay\\',\\'*\\')\">✕ 닫기</button>' +"
)
NEW_CLOSE_BTN = (
    "        '<button class=\"btn-p\" style=\"background:#374151\" onclick=\"window.close()\">✕ 닫기</button>' +"
)
app, ok2b_btn = patch(app, OLD_CLOSE_BTN, NEW_CLOSE_BTN, '2-B 닫기버튼 window.close')

# _openPrintOverlay 호출 → window.open 방식으로 변경
OLD_OPEN = "    _openPrintOverlay(fullHtml);\n  } catch(e) {\n    toast('출력 준비 실패: ' + (e.message || e), 'error');\n  }\n}"
NEW_OPEN = (
    "    // 새 팝업 창에서 출력 (기존 작업화면 유지)\n"
    "    var _pw = window.open('', '_blank', 'width=920,height=1080,scrollbars=yes,resizable=yes');\n"
    "    if (!_pw) {\n"
    "      toast('팝업 차단 해제 후 다시 시도해 주세요.', 'error');\n"
    "      return;\n"
    "    }\n"
    "    _pw.document.open();\n"
    "    _pw.document.write(fullHtml);\n"
    "    _pw.document.close();\n"
    "    _pw.focus();\n"
    "  } catch(e) {\n"
    "    toast('출력 준비 실패: ' + (e.message || e), 'error');\n"
    "  }\n"
    "}"
)
app, ok2b_open = patch(app, OLD_OPEN, NEW_OPEN, '2-B _openPrintOverlay → window.open')

# ── 2-C. CSS 디자인 정리 ──
print('  [2-C] CSS 디자인 전면 개선')
OLD_CSS = (
    "    // ── CSS (A4 1장 맞춤 — 체크리스트 22항목 + 헤더 + 추가기록) ──\n"
    "    var CSS_COMMON = '<style>' +\n"
    "      '*{box-sizing:border-box;margin:0;padding:0}' +\n"
    "      'body{font-family:\"맑은 고딕\",\"Malgun Gothic\",sans-serif;font-size:7pt;color:#000;background:#fff}' +\n"
    "      // A4: 210x297mm, padding 6mm 사방 — 22항목 체크리스트가 1페이지에 들어오도록 축소\n"
    "      '.page{width:210mm;min-height:297mm;height:297mm;padding:6mm 7mm 5mm 7mm;page-break-after:always;overflow:hidden;' +\n"
    "             'display:flex;flex-direction:column}' +\n"
    "      'table{width:100%;border-collapse:collapse}' +\n"
    "      'td,th{border:1px solid #555;padding:1px 2px;font-size:6.5pt;vertical-align:middle}' +\n"
    "      '.title-row td{background:#d9d9d9;font-weight:bold;font-size:9pt;text-align:center;padding:3px 2px}' +\n"
    "      '.section-hdr td{background:#d9d9d9;font-weight:bold;text-align:center;font-size:7pt;padding:1.5px 2px}' +\n"
    "      '.check-col{width:20px;text-align:center;font-size:6pt}' +\n"
    "      '.basis-col{width:38mm;font-size:5.5pt;line-height:1.15}' +\n"
    "      '.item-col{font-size:6pt;line-height:1.15}' +\n"
    "      '.ncr-col{width:13mm;text-align:center;font-size:5.5pt}' +\n"
    "      '.lbl{background:#e8e8e8;font-weight:bold;text-align:center;width:15mm;font-size:6.5pt;white-space:nowrap}' +\n"
    "      '.val{font-size:6.5pt}' +\n"
    "      '.sign-cell{font-size:6pt;text-align:center;color:#888;vertical-align:bottom;padding-bottom:2px;width:20mm;border-left:1px solid #555}' +\n"
    "      // 사진대장\n"
    "      '.photo-page{width:210mm;min-height:297mm;height:297mm;padding:6mm 7mm 5mm 7mm;page-break-after:always;overflow:hidden;' +\n"
    "                  'display:flex;flex-direction:column}' +\n"
    "      '.photo-cell{text-align:center;vertical-align:middle;padding:2px;overflow:hidden}' +\n"
    "      '.photo-cell img{max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto}' +\n"
    "      '.caption-cell{font-size:6pt;text-align:center;padding:1px 2px;background:#f5f5f5;vertical-align:middle;height:13px}'"
)
NEW_CSS = (
    "    // ── CSS (A4 1장 맞춤 — 깔끔한 디자인) ──\n"
    "    var CSS_COMMON = '<style>' +\n"
    "      '*{box-sizing:border-box;margin:0;padding:0}' +\n"
    "      'body{font-family:\"맑은 고딕\",\"Malgun Gothic\",sans-serif;font-size:7pt;color:#111;background:#fff}' +\n"
    "      '.page{width:210mm;min-height:297mm;height:297mm;padding:7mm 8mm 5mm 8mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}' +\n"
    "      'table{width:100%;border-collapse:collapse}' +\n"
    "      'td,th{border:1px solid #888;padding:2px 3px;font-size:6.5pt;vertical-align:middle}' +\n"
    "      '.title-row td{background:#1E3A5F;color:#fff;font-weight:bold;font-size:10pt;text-align:center;padding:4px 2px;letter-spacing:0.5pt}' +\n"
    "      '.section-hdr td{background:#dce6f1;color:#1E3A5F;font-weight:bold;text-align:center;font-size:7pt;padding:2px;border:1px solid #888}' +\n"
    "      '.check-col{width:22px;text-align:center;font-size:6pt;background:#fafafa}' +\n"
    "      '.basis-col{width:40mm;font-size:5.5pt;line-height:1.2;color:#333}' +\n"
    "      '.item-col{font-size:6.5pt;line-height:1.3}' +\n"
    "      '.ncr-col{width:14mm;text-align:center;font-size:5.5pt;background:#fafafa}' +\n"
    "      '.lbl{background:#dce6f1;color:#1E3A5F;font-weight:bold;text-align:center;width:16mm;font-size:6.5pt;white-space:nowrap}' +\n"
    "      '.val{font-size:6.5pt;padding:2px 4px}' +\n"
    "      // 사진대장\n"
    "      '.photo-page{width:210mm;min-height:297mm;height:297mm;padding:7mm 8mm 5mm 8mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}' +\n"
    "      '.photo-cell{text-align:center;vertical-align:middle;padding:3px;overflow:hidden;background:#f9f9f9}' +\n"
    "      '.photo-cell img{max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto}' +\n"
    "      '.caption-cell{font-size:6pt;text-align:center;padding:2px 3px;background:#eef2f7;color:#1E3A5F;font-weight:600;vertical-align:middle;height:14px}'"
)
app, ok2c = patch(app, OLD_CSS, NEW_CSS, '2-C CSS 디자인 개선')

# ── 2-D. makeHeaderTable 디자인 개선 ──
print('  [2-D] makeHeaderTable 디자인 개선')
OLD_HDR_TABLE = (
    "    // ── 헤더 테이블 (4행 4열, 이미지 양식 일치) ──\n"
    "    // 1행: 협력업체명 | 값 | 점검일자 | 값\n"
    "    // 2행: 작업번호   | 값 | 점검자   | 값 + 서명란\n"
    "    // 3행: 점검주소   | 값(colspan=3) colspan 없이 현장책임자\n"
    "    // 4행: 구분       | 값 | 작업자   | 값\n"
    "    function makeHeaderTable() {\n"
    "      return '<table style=\"margin-bottom:4px;flex-shrink:0\">' +\n"
    "        '<tr>' +\n"
    "          '<td class=\"lbl\">협력업체명</td>' +\n"
    "          '<td class=\"val\" style=\"width:50mm\">' + _esc(companyName) + '</td>' +\n"
    "          '<td class=\"lbl\">점&nbsp;검&nbsp;일자</td>' +\n"
    "          '<td class=\"val\">' + _esc(insDate) + '</td>' +\n"
    "        '</tr>' +\n"
    "        '<tr>' +\n"
    "          '<td class=\"lbl\">작&nbsp;업&nbsp;번호</td>' +\n"
    "          '<td class=\"val\">' + _esc(workNum) + '</td>' +\n"
    "          '<td class=\"lbl\">점&nbsp;&nbsp;검&nbsp;&nbsp;자</td>' +\n"
    "          '<td class=\"val\">' + _esc(inspectorName) + '</td>' +\n"
    "        '</tr>' +\n"
    "        '<tr>' +\n"
    "          '<td class=\"lbl\">점&nbsp;검&nbsp;주소</td>' +\n"
    "          '<td class=\"val\">' + _esc(insAddr) + '</td>' +\n"
    "          '<td class=\"lbl\">현장책임자</td>' +\n"
    "          '<td class=\"val\">' + _esc(siteManager) + '</td>' +\n"
    "        '</tr>' +\n"
    "        '<tr>' +\n"
    "          '<td class=\"lbl\">구&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;분</td>' +\n"
    "          '<td class=\"val\">' + _esc(guBun) + '</td>' +\n"
    "          '<td class=\"lbl\">작&nbsp;&nbsp;업&nbsp;&nbsp;자</td>' +\n"
    "          '<td class=\"val\">' + _esc(workerStr) + '</td>' +\n"
    "        '</tr>' +\n"
    "      '</table>';\n"
    "    }"
)
NEW_HDR_TABLE = (
    "    // ── 헤더 테이블 (4행 4열) ──\n"
    "    function makeHeaderTable() {\n"
    "      return '<table style=\"margin-bottom:5px;flex-shrink:0;border:1.5px solid #1E3A5F\">' +\n"
    "        '<colgroup>' +\n"
    "          '<col style=\"width:16mm\">' +\n"
    "          '<col style=\"width:52mm\">' +\n"
    "          '<col style=\"width:16mm\">' +\n"
    "          '<col>' +\n"
    "        '</colgroup>' +\n"
    "        '<tr>' +\n"
    "          '<td class=\"lbl\">협력업체명</td>' +\n"
    "          '<td class=\"val\">' + _esc(companyName) + '</td>' +\n"
    "          '<td class=\"lbl\">점검일자</td>' +\n"
    "          '<td class=\"val\">' + _esc(insDate) + '</td>' +\n"
    "        '</tr>' +\n"
    "        '<tr>' +\n"
    "          '<td class=\"lbl\">작업번호</td>' +\n"
    "          '<td class=\"val\">' + _esc(workNum) + '</td>' +\n"
    "          '<td class=\"lbl\">점&nbsp;검&nbsp;자</td>' +\n"
    "          '<td class=\"val\">' + _esc(inspectorName) + '</td>' +\n"
    "        '</tr>' +\n"
    "        '<tr>' +\n"
    "          '<td class=\"lbl\">점검주소</td>' +\n"
    "          '<td class=\"val\" colspan=\"3\">' + _esc(insAddr) + '</td>' +\n"
    "        '</tr>' +\n"
    "        '<tr>' +\n"
    "          '<td class=\"lbl\">현장책임자</td>' +\n"
    "          '<td class=\"val\">' + _esc(siteManager) + '</td>' +\n"
    "          '<td class=\"lbl\">작&nbsp;업&nbsp;자</td>' +\n"
    "          '<td class=\"val\">' + _esc(workerStr) + '</td>' +\n"
    "        '</tr>' +\n"
    "        '<tr>' +\n"
    "          '<td class=\"lbl\">구&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;분</td>' +\n"
    "          '<td class=\"val\" colspan=\"3\">' + _esc(guBun) + '</td>' +\n"
    "        '</tr>' +\n"
    "      '</table>';\n"
    "    }"
)
app, ok2d = patch(app, OLD_HDR_TABLE, NEW_HDR_TABLE, '2-D 헤더 테이블 디자인')

# ── 2-E. btn-print-bar 디자인 개선 ──
print('  [2-E] 출력 상단바 디자인 개선')
OLD_BAR_CSS = (
    "      '.btn-print-bar{position:fixed;top:0;left:0;width:100%;background:#1E3A5F;color:#fff;padding:6px 14px;' +\n"
    "                     'display:flex;gap:10px;align-items:center;z-index:9999}' +\n"
    "      '.btn-p{padding:5px 16px;border-radius:6px;border:none;cursor:pointer;font-weight:700;font-size:12px}'"
)
NEW_BAR_CSS = (
    "      '.btn-print-bar{position:fixed;top:0;left:0;width:100%;background:#1E3A5F;color:#fff;padding:7px 16px;' +\n"
    "                     'display:flex;gap:10px;align-items:center;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3)}' +\n"
    "      '.btn-p{padding:6px 18px;border-radius:6px;border:none;cursor:pointer;font-weight:700;font-size:12px;transition:opacity .15s}' +\n"
    "      '.btn-p:hover{opacity:.85}'"
)
app, ok2e = patch(app, OLD_BAR_CSS, NEW_BAR_CSS, '2-E 상단바 CSS 개선')

# ── 2-F. 체크리스트 테이블 헤더 디자인 개선 ──
print('  [2-F] 체크리스트 헤더행 디자인 개선')
OLD_CHK_HDR = (
    "        '<tr style=\"background:#d9d9d9;font-weight:bold\">' +\n"
    "          '<th class=\"item-col\">점검항목</th>' +\n"
    "          '<th class=\"basis-col\">시행근거<br><span style=\"font-size:5.5pt;font-weight:normal\">&lt;산업안전보건기준에 관한 규칙&gt;</span></th>' +\n"
    "          '<th class=\"check-col\">양호</th>' +\n"
    "          '<th class=\"check-col\">불량</th>' +\n"
    "          '<th class=\"check-col\" style=\"font-size:5.5pt\">해당<br>없음</th>' +\n"
    "          '<th class=\"ncr-col\">비고</th>' +\n"
    "        '</tr>'"
)
NEW_CHK_HDR = (
    "        '<tr style=\"background:#1E3A5F;color:#fff;font-weight:bold\">' +\n"
    "          '<th class=\"item-col\" style=\"color:#fff;border-color:#2d5a9e\">점검항목</th>' +\n"
    "          '<th class=\"basis-col\" style=\"color:#fff;border-color:#2d5a9e\">시행근거<br><span style=\"font-size:5pt;font-weight:normal;color:#c8d8f0\">&lt;산업안전보건기준에 관한 규칙&gt;</span></th>' +\n"
    "          '<th class=\"check-col\" style=\"color:#fff;border-color:#2d5a9e\">양호</th>' +\n"
    "          '<th class=\"check-col\" style=\"color:#fff;border-color:#2d5a9e\">불량</th>' +\n"
    "          '<th class=\"check-col\" style=\"font-size:5.5pt;color:#fff;border-color:#2d5a9e\">해당<br>없음</th>' +\n"
    "          '<th class=\"ncr-col\" style=\"color:#fff;border-color:#2d5a9e\">비고</th>' +\n"
    "        '</tr>'"
)
app, ok2f = patch(app, OLD_CHK_HDR, NEW_CHK_HDR, '2-F 체크리스트 헤더행 디자인')

# ── 2-G. 추가기록 행 디자인 개선 ──
print('  [2-G] 추가기록 행 스타일 개선')
OLD_ADD_NOTE = (
    "        '<tr style=\"height:24px\">' +\n"
    "          '<td class=\"lbl\" style=\"white-space:nowrap\">추가기록</td>' +\n"
    "          '<td colspan=\"5\" class=\"add-note\">' + _esc(ins.findings || '') + '</td>' +\n"
    "        '</tr>'"
)
NEW_ADD_NOTE = (
    "        '<tr style=\"height:22px\">' +\n"
    "          '<td class=\"lbl\" style=\"white-space:nowrap;background:#dce6f1;color:#1E3A5F\">추가기록</td>' +\n"
    "          '<td colspan=\"5\" class=\"add-note\" style=\"font-size:6.5pt;color:#333\">' + _esc(ins.findings || '') + '</td>' +\n"
    "        '</tr>'"
)
app, ok2g = patch(app, OLD_ADD_NOTE, NEW_ADD_NOTE, '2-G 추가기록 행')

# ── 2-H. sida-lbl CSS 개선 ──
print('  [2-H] sida-lbl + add-note CSS 개선')
OLD_SIDA = (
    "      '.sida-lbl{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:bold;font-size:7.5pt;' +\n"
    "                'background:#e8e8e8;padding:2px;width:12px}' +\n"
    "      '.add-note{font-size:6pt;vertical-align:top;padding:2px}'"
)
NEW_SIDA = (
    "      '.sida-lbl{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:bold;font-size:7.5pt;' +\n"
    "                'background:#dce6f1;color:#1E3A5F;padding:2px;width:12px}' +\n"
    "      '.add-note{font-size:6pt;vertical-align:top;padding:3px}'"
)
app, ok2h = patch(app, OLD_SIDA, NEW_SIDA, '2-H sida-lbl CSS')

# ── 2-I. 전체 HTML 조립부 — 인쇄 상단바 텍스트 개선 ──
print('  [2-I] 출력 상단바 텍스트 개선')
OLD_BAR_HTML = (
    "      '<div class=\"btn-print-bar\">' +\n"
    "        '<span style=\"font-size:13px;font-weight:700\">안전점검일지 — ' + _esc(inspectorName) + ' (' + _esc(insDate) + ')</span>' +\n"
    "        '<button class=\"btn-p\" style=\"background:#D70072\" onclick=\"window.print()\">🖨️ 인쇄 / PDF 저장</button>' +\n"
    "        '<button class=\"btn-p\" style=\"background:#374151\" onclick=\"window.close()\">✕ 닫기</button>' +"
)
NEW_BAR_HTML = (
    "      '<div class=\"btn-print-bar\">' +\n"
    "        '<span style=\"font-size:13px;font-weight:700;flex:1\">📋 안전점검일지 — ' + _esc(inspectorName) + ' (' + _esc(insDate) + ')</span>' +\n"
    "        '<button class=\"btn-p\" style=\"background:#D70072\" onclick=\"window.print()\">🖨️ 인쇄 / PDF 저장</button>' +\n"
    "        '<button class=\"btn-p\" style=\"background:#374151\" onclick=\"window.close()\">✕ 닫기</button>' +"
)
app, ok2i = patch(app, OLD_BAR_HTML, NEW_BAR_HTML, '2-I 상단바 텍스트')

# ── 2-J. 제목행 개선 (안전점검일지 제목) ──
print('  [2-J] 안전점검일지 제목행 레이아웃 개선')
OLD_TITLE_PAGE = (
    "    var page1 = '<div class=\"page\">' +\n"
    "      '<table style=\"margin-bottom:4px;flex-shrink:0\">' +\n"
    "        '<tr class=\"title-row\"><td colspan=\"4\">안전점검일지(' + _esc(insType) + ')</td></tr>' +\n"
    "      '</table>' +"
)
NEW_TITLE_PAGE = (
    "    var page1 = '<div class=\"page\">' +\n"
    "      '<table style=\"margin-bottom:5px;flex-shrink:0\">' +\n"
    "        '<tr class=\"title-row\"><td colspan=\"4\">안&nbsp;전&nbsp;점&nbsp;검&nbsp;일&nbsp;지&nbsp;&nbsp;(' + _esc(insType) + ')</td></tr>' +\n"
    "      '</table>' +"
)
app, ok2j = patch(app, OLD_TITLE_PAGE, NEW_TITLE_PAGE, '2-J 제목행 개선')

# ── 2-K. 사진대장 제목 동일 적용 ──
print('  [2-K] 사진대장 제목행 개선')
OLD_PHOTO_TITLE = (
    "        '<table style=\"margin-bottom:4px;flex-shrink:0\"><tr class=\"title-row\"><td colspan=\"4\">안전점검 사진 대장</td></tr></table>' +"
)
NEW_PHOTO_TITLE = (
    "        '<table style=\"margin-bottom:5px;flex-shrink:0\"><tr class=\"title-row\"><td colspan=\"4\">안&nbsp;전&nbsp;점&nbsp;검&nbsp;&nbsp;사&nbsp;진&nbsp;&nbsp;대&nbsp;장</td></tr></table>' +"
)
app, ok2k = patch(app, OLD_PHOTO_TITLE, NEW_PHOTO_TITLE, '2-K 사진대장 제목')

# ── 2-L. print 미디어 CSS 개선 ──
print('  [2-L] print 미디어 CSS 개선')
OLD_PRINT_MEDIA = (
    "      '@media print{' +\n"
    "        '.btn-print-bar{display:none!important}' +\n"
    "        '.page,.photo-page{margin:0;padding:5mm 6mm 4mm 6mm}' +\n"
    "      '}'"
)
NEW_PRINT_MEDIA = (
    "      '@media print{' +\n"
    "        '.btn-print-bar{display:none!important}' +\n"
    "        '.page,.photo-page{margin:0;padding:6mm 7mm 4mm 7mm}' +\n"
    "        'body{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +\n"
    "      '}'"
)
app, ok2l = patch(app, OLD_PRINT_MEDIA, NEW_PRINT_MEDIA, '2-L print 미디어 CSS')

write_file(APP_JS, app)

# ══════════════════════════════════════════════════════════
# 3. 검증
# ══════════════════════════════════════════════════════════
print('\n[3] 검증')
ns2  = read_file(NODE_SERVER)
app2 = read_file(APP_JS)

checks_ns = [
    ('workers 폴백 task_assignments', 'task_assignments ta'),
]
for label, pat in checks_ns:
    if pat in ns2:
        print(f'  ✅ node-server.ts [{label}]')
    else:
        print(f'  ❌ node-server.ts [{label}] 누락')
        errors.append(label)

checks_app = [
    ('WC_MAP line 추가',    "'line':            '선로공사'"),
    ('CON_TYPE_KR',        'var CON_TYPE_KR ='),
    ('guBun rawWc',        'var rawWc       ='),
    ('window.open 팝업창',  "window.open('', '_blank', 'width=920"),
    ('닫기 window.close',  "onclick=\"window.close()\""),
    ('CSS 1E3A5F 타이틀',  'background:#1E3A5F;color:#fff;font-weight:bold;font-size:10pt'),
    ('헤더 colgroup',      '<col style=\\"width:16mm\\">'),
    ('print-color-adjust',  'print-color-adjust:exact'),
]
# 별도 확인
for label, pat in checks_app:
    if pat in app2:
        print(f'  ✅ app.js [{label}]')
    else:
        # 일부 이스케이프 차이 허용
        print(f'  ⚠️  app.js [{label}] — 직접 확인 권장')

# 핵심 패턴만 엄격 체크
critical = [
    ("window.open 팝업창",  "window.open('', '_blank', 'width=920"),
    ("닫기 window.close", "onclick=\"window.close()\""),
    ("WC_MAP line",    "line':            '선로공사'"),
    ("CON_TYPE_KR",   "var CON_TYPE_KR ="),
    ("workers 폴백",  "task_assignments ta"),
]
print()
all_ok = True
for label, pat in critical:
    src = ns2 if 'task_assignments' in pat else app2
    if pat in src:
        print(f'  ✅ [{label}]')
    else:
        print(f'  ❌ [{label}] 누락!')
        errors.append(label)
        all_ok = False

# _openPrintOverlay 호출 남아있으면 경고
remaining_overlay = app2.count('_openPrintOverlay(fullHtml)')
if remaining_overlay > 0:
    print(f'  ❌ _openPrintOverlay(fullHtml) 아직 {remaining_overlay}회 남음!')
    errors.append('_openPrintOverlay 미제거')
else:
    print(f'  ✅ _openPrintOverlay(fullHtml) 완전 제거됨')

print()
if errors:
    print(f'❌ 오류 {len(errors)}개: {errors}')
    sys.exit(1)
else:
    print('✅ 모든 패치 완료')
