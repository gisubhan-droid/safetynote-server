#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_155g.py — 안전점검일지 출력 디자인 개선
- CSS: 셀 높이/폰트/테두리 전면 정비
- 헤더 테이블: 원본 양식과 동일한 구조 (협력업체명·작업번호·점검주소·현장책임자·구분 + 점검일자·점검자·작업자)
- 체크리스트 헤더: 양호/불량/해당없음 컬럼 명칭 가시성 개선
- 추가기록란 디자인 개선
"""
import re, sys, os

APP = 'public/static/app.js'

def read():
    with open(APP, 'r', encoding='utf-8') as f:
        return f.read()

def write(src):
    with open(APP, 'w', encoding='utf-8') as f:
        f.write(src)

def patch1_css(src):
    """CSS 전면 재정비 — 가독성·비율·클린 디자인"""
    OLD = (
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
        "      '.caption-cell{font-size:6pt;text-align:center;padding:2px 3px;background:#eef2f7;color:#1E3A5F;font-weight:600;vertical-align:middle;height:14px}' +\n"
        "      '.sida-lbl{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:bold;font-size:7.5pt;' +\n"
        "                'background:#dce6f1;color:#1E3A5F;padding:2px;width:12px}' +\n"
        "      '.add-note{font-size:6pt;vertical-align:top;padding:3px}' +\n"
        "      '.btn-print-bar{position:fixed;top:0;left:0;width:100%;background:#1E3A5F;color:#fff;padding:7px 16px;' +\n"
        "                     'display:flex;gap:10px;align-items:center;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3)}' +\n"
        "      '.btn-p{padding:6px 18px;border-radius:6px;border:none;cursor:pointer;font-weight:700;font-size:12px;transition:opacity .15s}' +\n"
        "      '.btn-p:hover{opacity:.85}' +\n"
        "      '@media print{' +\n"
        "        '.btn-print-bar{display:none!important}' +\n"
        "        '.page,.photo-page{margin:0;padding:6mm 7mm 4mm 7mm}' +\n"
        "        'body{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +\n"
        "      '}' +\n"
        "      '</style>';"
    )
    NEW = (
        "    // ── CSS (A4 1장 맞춤 — 클린 디자인 v155g) ──\n"
        "    var CSS_COMMON = '<style>' +\n"
        "      '*{box-sizing:border-box;margin:0;padding:0}' +\n"
        "      'body{font-family:\"맑은 고딕\",\"Malgun Gothic\",sans-serif;font-size:7.5pt;color:#111;background:#fff}' +\n"
        "      '.page{width:210mm;min-height:297mm;height:297mm;padding:6mm 7mm 4mm 7mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}' +\n"
        "      'table{width:100%;border-collapse:collapse}' +\n"
        "      'td,th{border:1px solid #aab;padding:2.5px 4px;font-size:7pt;vertical-align:middle}' +\n"
        "      /* 제목 행 */\n"
        "      '.title-row td{background:#1E3A5F;color:#fff;font-weight:bold;font-size:11pt;text-align:center;padding:5px 2px;letter-spacing:1.5pt}' +\n"
        "      /* 체크리스트 섹션 구분 행 */\n"
        "      '.section-hdr td{background:#dce6f1;color:#1E3A5F;font-weight:bold;text-align:center;font-size:7.5pt;padding:3px 4px;border:1px solid #9ab}' +\n"
        "      /* 체크(양호/불량/해당없음) 컬럼 */\n"
        "      '.check-col{width:14mm;text-align:center;font-size:7pt;background:#fafafa}' +\n"
        "      /* 시행근거 컬럼 */\n"
        "      '.basis-col{width:38mm;font-size:6pt;line-height:1.35;color:#333;padding:2px 4px}' +\n"
        "      /* 점검항목 컬럼 */\n"
        "      '.item-col{font-size:7pt;line-height:1.4;padding:2.5px 4px}' +\n"
        "      /* 비고 컬럼 */\n"
        "      '.ncr-col{width:16mm;text-align:center;font-size:6pt;background:#fafafe;padding:2px}' +\n"
        "      /* 헤더 라벨 셀 */\n"
        "      '.lbl{background:#dce6f1;color:#1E3A5F;font-weight:bold;text-align:center;font-size:7pt;white-space:nowrap;padding:3px 4px}' +\n"
        "      /* 헤더 값 셀 */\n"
        "      '.val{font-size:7pt;padding:3px 5px}' +\n"
        "      /* 추가기록 라벨 */\n"
        "      '.add-lbl{background:#dce6f1;color:#1E3A5F;font-weight:bold;text-align:center;font-size:7pt;white-space:nowrap;padding:3px 4px}' +\n"
        "      /* 추가기록 내용 */\n"
        "      '.add-note{font-size:7pt;vertical-align:top;padding:3px 5px;color:#333}' +\n"
        "      // 사진대장\n"
        "      '.photo-page{width:210mm;min-height:297mm;height:297mm;padding:6mm 7mm 4mm 7mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}' +\n"
        "      '.photo-cell{text-align:center;vertical-align:middle;padding:3px;overflow:hidden;background:#f9f9f9}' +\n"
        "      '.photo-cell img{max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto}' +\n"
        "      '.caption-cell{font-size:6.5pt;text-align:center;padding:2px 4px;background:#eef2f7;color:#1E3A5F;font-weight:600;vertical-align:middle;height:15px}' +\n"
        "      '.sida-lbl{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:bold;font-size:7.5pt;' +\n"
        "                'background:#dce6f1;color:#1E3A5F;padding:2px;width:13px}' +\n"
        "      /* 인쇄 버튼 바 */\n"
        "      '.btn-print-bar{position:fixed;top:0;left:0;width:100%;background:#1E3A5F;color:#fff;padding:7px 16px;' +\n"
        "                     'display:flex;gap:10px;align-items:center;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3)}' +\n"
        "      '.btn-p{padding:6px 18px;border-radius:6px;border:none;cursor:pointer;font-weight:700;font-size:12px;transition:opacity .15s}' +\n"
        "      '.btn-p:hover{opacity:.85}' +\n"
        "      '@media print{' +\n"
        "        '.btn-print-bar{display:none!important}' +\n"
        "        '.page,.photo-page{margin:0;padding:5mm 6mm 3mm 6mm}' +\n"
        "        'body{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +\n"
        "      '}' +\n"
        "      '</style>';"
    )
    if OLD not in src:
        print('❌ [patch1] CSS 블록을 찾지 못함')
        return None
    result = src.replace(OLD, NEW, 1)
    print('✅ [patch1] CSS 전면 개선 완료')
    return result


def patch2_header(src):
    """헤더 테이블: 원본 양식과 동일한 구조
    원본:
      행1: 협력업체명 | 값    | 점검일자   | 값
      행2: 작업번호   | 값    | 점  검  자 | 값
      행3: 점검주소   | 값(colspan3)
      행4: 현장책임자 | 값    | 작  업  자 | 값
      행5: 구    분   | 값(colspan3)
    """
    OLD = (
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
    NEW = (
        "    // ── 헤더 테이블 (5행 4열 — v155g 원본 양식 동일 구조) ──\n"
        "    function makeHeaderTable() {\n"
        "      return '<table style=\"margin-bottom:4px;flex-shrink:0;border:1.5px solid #1E3A5F\">' +\n"
        "        '<colgroup>' +\n"
        "          '<col style=\"width:18mm\">' +\n"
        "          '<col style=\"width:50mm\">' +\n"
        "          '<col style=\"width:18mm\">' +\n"
        "          '<col>' +\n"
        "        '</colgroup>' +\n"
        "        '<tr>' +\n"
        "          '<td class=\"lbl\">협력업체명</td>' +\n"
        "          '<td class=\"val\">' + _esc(companyName) + '</td>' +\n"
        "          '<td class=\"lbl\" style=\"white-space:nowrap\">점&nbsp;검&nbsp;일&nbsp;자</td>' +\n"
        "          '<td class=\"val\">' + _esc(insDate) + '</td>' +\n"
        "        '</tr>' +\n"
        "        '<tr>' +\n"
        "          '<td class=\"lbl\">작&nbsp;업&nbsp;번&nbsp;호</td>' +\n"
        "          '<td class=\"val\">' + _esc(workNum) + '</td>' +\n"
        "          '<td class=\"lbl\">점&nbsp;&nbsp;검&nbsp;&nbsp;자</td>' +\n"
        "          '<td class=\"val\">' + _esc(inspectorName) + '</td>' +\n"
        "        '</tr>' +\n"
        "        '<tr>' +\n"
        "          '<td class=\"lbl\">점&nbsp;검&nbsp;주&nbsp;소</td>' +\n"
        "          '<td class=\"val\" colspan=\"3\">' + _esc(insAddr) + '</td>' +\n"
        "        '</tr>' +\n"
        "        '<tr>' +\n"
        "          '<td class=\"lbl\">현장책임자</td>' +\n"
        "          '<td class=\"val\">' + _esc(siteManager) + '</td>' +\n"
        "          '<td class=\"lbl\">작&nbsp;&nbsp;업&nbsp;&nbsp;자</td>' +\n"
        "          '<td class=\"val\">' + _esc(workerStr) + '</td>' +\n"
        "        '</tr>' +\n"
        "        '<tr>' +\n"
        "          '<td class=\"lbl\">구&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;분</td>' +\n"
        "          '<td class=\"val\" colspan=\"3\">' + _esc(guBun) + '</td>' +\n"
        "        '</tr>' +\n"
        "      '</table>';\n"
        "    }"
    )
    if OLD not in src:
        print('❌ [patch2] 헤더 테이블 블록을 찾지 못함')
        return None
    result = src.replace(OLD, NEW, 1)
    print('✅ [patch2] 헤더 테이블 5행 구조 수정 완료')
    return result


def patch3_checklist_table(src):
    """체크리스트 테이블: 컬럼 비율·헤더 가시성·행 높이 개선"""
    OLD = (
        "    var page1 = '<div class=\"page\">' +\n"
        "      '<table style=\"margin-bottom:5px;flex-shrink:0\">' +\n"
        "        '<tr class=\"title-row\"><td colspan=\"4\">안&nbsp;전&nbsp;점&nbsp;검&nbsp;일&nbsp;지&nbsp;&nbsp;(' + _esc(insType) + ')</td></tr>' +\n"
        "      '</table>' +\n"
        "      makeHeaderTable() +\n"
        "      '<table style=\"flex:1;table-layout:fixed\">' +\n"
        "        '<colgroup>' +\n"
        "          '<col style=\"width:auto\">' +\n"
        "          '<col style=\"width:42mm\">' +\n"
        "          '<col style=\"width:22px\">' +\n"
        "          '<col style=\"width:22px\">' +\n"
        "          '<col style=\"width:22px\">' +\n"
        "          '<col style=\"width:15mm\">' +\n"
        "        '</colgroup>' +\n"
        "        '<tr style=\"background:#1E3A5F;color:#fff;font-weight:bold\">' +\n"
        "          '<th class=\"item-col\" style=\"color:#fff;border-color:#2d5a9e\">점검항목</th>' +\n"
        "          '<th class=\"basis-col\" style=\"color:#fff;border-color:#2d5a9e\">시행근거<br><span style=\"font-size:5pt;font-weight:normal;color:#c8d8f0\">&lt;산업안전보건기준에 관한 규칙&gt;</span></th>' +\n"
        "          '<th class=\"check-col\" style=\"color:#fff;border-color:#2d5a9e\">양호</th>' +\n"
        "          '<th class=\"check-col\" style=\"color:#fff;border-color:#2d5a9e\">불량</th>' +\n"
        "          '<th class=\"check-col\" style=\"font-size:5.5pt;color:#fff;border-color:#2d5a9e\">해당<br>없음</th>' +\n"
        "          '<th class=\"ncr-col\" style=\"color:#fff;border-color:#2d5a9e\">비고</th>' +\n"
        "        '</tr>' +\n"
        "        checklistRows +\n"
        "        '<tr style=\"height:22px\">' +\n"
        "          '<td class=\"lbl\" style=\"white-space:nowrap;background:#dce6f1;color:#1E3A5F\">추가기록</td>' +\n"
        "          '<td colspan=\"5\" class=\"add-note\" style=\"font-size:6.5pt;color:#333\">' + _esc(ins.findings || '') + '</td>' +\n"
        "        '</tr>' +\n"
        "      '</table>' +\n"
        "    '</div>';"
    )
    NEW = (
        "    var page1 = '<div class=\"page\">' +\n"
        "      '<table style=\"margin-bottom:4px;flex-shrink:0\">' +\n"
        "        '<tr class=\"title-row\"><td colspan=\"4\">안&nbsp;전&nbsp;점&nbsp;검&nbsp;일&nbsp;지&nbsp;&nbsp;(' + _esc(insType) + ')</td></tr>' +\n"
        "      '</table>' +\n"
        "      makeHeaderTable() +\n"
        "      '<table style=\"flex:1;table-layout:fixed;border:1px solid #9ab\">' +\n"
        "        '<colgroup>' +\n"
        "          '<col style=\"width:auto\">' +\n"
        "          '<col style=\"width:40mm\">' +\n"
        "          '<col style=\"width:14mm\">' +\n"
        "          '<col style=\"width:14mm\">' +\n"
        "          '<col style=\"width:16mm\">' +\n"
        "          '<col style=\"width:16mm\">' +\n"
        "        '</colgroup>' +\n"
        "        '<tr style=\"background:#1E3A5F;color:#fff;font-weight:bold;height:18px\">' +\n"
        "          '<th style=\"font-size:7.5pt;color:#fff;border-color:#2d5a9e;text-align:center;padding:3px 4px\">' +\n"
        "            '점검항목' +\n"
        "          '</th>' +\n"
        "          '<th style=\"font-size:6.5pt;color:#fff;border-color:#2d5a9e;text-align:center;padding:2px 3px;line-height:1.3\">' +\n"
        "            '시행근거<br><span style=\"font-size:5.5pt;font-weight:400;color:#c8d8f0\">&lt;산업안전보건기준에 관한 규칙&gt;</span>' +\n"
        "          '</th>' +\n"
        "          '<th style=\"font-size:7.5pt;color:#fff;border-color:#2d5a9e;text-align:center;padding:3px 2px\">양호</th>' +\n"
        "          '<th style=\"font-size:7.5pt;color:#fff;border-color:#2d5a9e;text-align:center;padding:3px 2px\">불량</th>' +\n"
        "          '<th style=\"font-size:7pt;color:#fff;border-color:#2d5a9e;text-align:center;padding:3px 2px;line-height:1.2\">해당<br>없음</th>' +\n"
        "          '<th style=\"font-size:7.5pt;color:#fff;border-color:#2d5a9e;text-align:center;padding:3px 2px\">비고</th>' +\n"
        "        '</tr>' +\n"
        "        checklistRows +\n"
        "        '<tr style=\"height:24px\">' +\n"
        "          '<td class=\"add-lbl\" style=\"white-space:nowrap\">추가기록</td>' +\n"
        "          '<td colspan=\"5\" class=\"add-note\">' + _esc(ins.findings || '') + '</td>' +\n"
        "        '</tr>' +\n"
        "      '</table>' +\n"
        "    '</div>';"
    )
    if OLD not in src:
        print('❌ [patch3] page1 블록을 찾지 못함')
        return None
    result = src.replace(OLD, NEW, 1)
    print('✅ [patch3] 체크리스트 테이블 컬럼·헤더 개선 완료')
    return result


def patch4_checklist_rows(src):
    """체크리스트 행: 높이 지정 + 체크마크 크기 개선"""
    OLD = (
        "        checklistRows +=\n"
        "          '<tr style=\"height:auto;' + rowBg + '\">' +\n"
        "            '<td class=\"item-col\" style=\"padding:1px 2px\">' + _esc(item.text) + '</td>' +\n"
        "            '<td class=\"basis-col\">' + _esc(item.basis) + '</td>' +\n"
        "            '<td class=\"check-col\" style=\"font-size:9pt;font-weight:700;color:#2DB400\">' + goodMark + '</td>' +\n"
        "            '<td class=\"check-col\" style=\"font-size:9pt;font-weight:700;color:#D70072\">' + badMark + '</td>' +\n"
        "            '<td class=\"check-col\" style=\"font-size:9pt;font-weight:700;color:#888\">' + naMark + '</td>' +\n"
        "            '<td class=\"ncr-col\" style=\"font-size:5pt\">NCR 발행대상</td>' +\n"
        "          '</tr>';"
    )
    NEW = (
        "        checklistRows +=\n"
        "          '<tr style=\"' + rowBg + '\">' +\n"
        "            '<td class=\"item-col\">' + _esc(item.text) + '</td>' +\n"
        "            '<td class=\"basis-col\">' + _esc(item.basis) + '</td>' +\n"
        "            '<td class=\"check-col\" style=\"font-size:10pt;font-weight:700;color:#2DB400;text-align:center\">' + goodMark + '</td>' +\n"
        "            '<td class=\"check-col\" style=\"font-size:10pt;font-weight:700;color:#D70072;text-align:center\">' + badMark + '</td>' +\n"
        "            '<td class=\"check-col\" style=\"font-size:10pt;font-weight:700;color:#555;text-align:center\">' + naMark + '</td>' +\n"
        "            '<td class=\"ncr-col\">NCR 발행대상</td>' +\n"
        "          '</tr>';"
    )
    if OLD not in src:
        print('❌ [patch4] checklistRows 행 블록을 찾지 못함')
        return None
    result = src.replace(OLD, NEW, 1)
    print('✅ [patch4] 체크리스트 행 스타일 개선 완료')
    return result


def main():
    if not os.path.exists(APP):
        print(f'파일 없음: {APP}')
        sys.exit(1)

    src = read()
    original_len = len(src)

    patches = [
        ('CSS 전면 개선',                patch1_css),
        ('헤더 테이블 5행 구조',          patch2_header),
        ('체크리스트 테이블 헤더/컬럼',    patch3_checklist_table),
        ('체크리스트 행 스타일',           patch4_checklist_rows),
    ]

    for name, fn in patches:
        result = fn(src)
        if result is None:
            print(f'\n💥 [{name}] 패치 실패 — 중단')
            sys.exit(1)
        src = result

    write(src)
    new_len = len(src)
    print(f'\n📝 파일 크기: {original_len:,} → {new_len:,} bytes (Δ{new_len - original_len:+,})')
    print('✅ 전체 패치 완료 — node --check 로 구문 검증 권장')


if __name__ == '__main__':
    main()
