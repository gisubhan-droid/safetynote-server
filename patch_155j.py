#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_155j.py — 세션155j: 사진대장 sida-lbl 완전 제거 + 깔끔한 2열 레이아웃
수정 항목:
  1. CSS .sida-lbl 클래스 제거 (더 이상 불필요)
  2. CSS .photo-cell padding:3px → padding:0 (cover 이미지 꽉 채움)
  3. CSS .caption-cell 개선 (텍스트 좌측정렬, 패딩 명확화)
  4. photoPages 구조 전면 재구성:
     - colgroup: 3열(sida-lbl + 2사진) → 2열(사진 50:50)
     - rowspan sida-lbl td 전부 제거
     - 구분선: 별도 파란색 구분 행으로 처리
     - 사진셀 높이: 88mm → 100mm (라벨 제거로 생긴 공간 활용)
     - 헤더행: "점검사항" → 상단 페이지번호(N/M) 표시 포함
     - 캡션행: 좌측 점검내용 텍스트 깔끔하게
"""

TARGET = '/home/user/webapp/public/static/app.js'

with open(TARGET, 'r', encoding='utf-8') as f:
    src = f.read()

original_len = len(src)
patches_applied = []

# ─────────────────────────────────────────────────────────────
# PATCH 1: CSS 전면 개선
#   - .sida-lbl 제거
#   - .photo-cell padding:0
#   - .caption-cell 개선
#   - .photo-section-hdr 신규 (상단 구분 헤더)
#   - .photo-divider 신규 (중간 구분선)
# ─────────────────────────────────────────────────────────────
OLD1 = (
    "      // 사진대장\n"
    "      '.photo-page{width:210mm;min-height:297mm;height:297mm;padding:6mm 7mm 4mm 7mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}' +\n"
    "      '.photo-cell{text-align:center;vertical-align:middle;padding:3px;overflow:hidden;background:#f9f9f9}' +\n"
    "      '.photo-cell img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}' +\n"
    "      '.caption-cell{font-size:6.5pt;text-align:center;padding:2px 4px;background:#eef2f7;color:#1E3A5F;font-weight:600;vertical-align:middle;height:15px}' +\n"
    "      '.sida-lbl{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:bold;font-size:6pt;' +\n"
    "                'background:#dce6f1;color:#1E3A5F;padding:2px 1px;width:28px;vertical-align:middle;overflow:hidden;letter-spacing:-0.5pt}' +"
)
NEW1 = (
    "      // 사진대장\n"
    "      '.photo-page{width:210mm;min-height:297mm;height:297mm;padding:6mm 8mm 4mm 8mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box}' +\n"
    "      '.photo-cell{text-align:center;vertical-align:middle;padding:0;overflow:hidden;background:#eee}' +\n"
    "      '.photo-cell img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}' +\n"
    "      '.caption-cell{font-size:7pt;text-align:left;padding:4px 8px;background:#f0f4fa;color:#1E3A5F;font-weight:500;vertical-align:middle;line-height:1.4}' +\n"
    "      '.photo-sec-hdr{background:#1E3A5F;color:#fff;font-size:7.5pt;font-weight:700;text-align:center;padding:4px 6px;letter-spacing:0.5pt}' +\n"
    "      '.photo-divider{height:5mm;background:#dce6f1;border-top:1.5px solid #9ab;border-bottom:1.5px solid #9ab}' +"
)

if OLD1 in src:
    src = src.replace(OLD1, NEW1, 1)
    patches_applied.append('PATCH1: CSS 재구성 (sida-lbl 제거, photo-cell/caption-cell/신규 클래스)')
else:
    print('[WARN] PATCH1 not found')

# ─────────────────────────────────────────────────────────────
# PATCH 2: photoPages 전면 재구성
#   기존: 3열(sida-lbl + 사진2) rowspan 구조
#   신규: 2열(사진 50:50) 깔끔 구조
#         - 상단 구역: 네이비 헤더 + 사진2장 + 캡션2줄
#         - 구분선: 파란 배경 5mm 행
#         - 하단 구역: 네이비 헤더 + 사진2장 + 캡션2줄
# ─────────────────────────────────────────────────────────────
OLD2 = (
    "      // ── v155i: 단일 테이블 구조 — A4 고정 비율, cover 이미지, sida-lbl 개선\n"
    "      // A4(297mm) - 상하패딩(10mm) - 제목(10mm) - 헤더5행(약38mm) - 구분여백(4mm) = 약235mm\n"
    "      // 사진대지(1)+(2) 각 = 235mm/2 = 약117mm\n"
    "      // 각 구역: 헤더행(8mm) + 사진셀(88mm) + 캡션행(10mm) + 구분(11mm) = 117mm\n"
    "      var slideLabel1 = '사\\n진\\n대\\n지\\n(' + (pg + 1) + ')';\n"
    "      photoPages += '<div class=\"photo-page\">' +\n"
    "        '<table style=\"margin-bottom:3px;flex-shrink:0\"><tr class=\"title-row\"><td>안&nbsp;전&nbsp;점&nbsp;검&nbsp;&nbsp;사&nbsp;진&nbsp;&nbsp;대&nbsp;장</td></tr></table>' +\n"
    "        makeHeaderTable() +\n"
    "        '<table style=\"flex:1;width:100%;table-layout:fixed;border:1px solid #9ab;border-collapse:collapse\">' +\n"
    "          '<colgroup>' +\n"
    "            '<col style=\"width:28px\">' +\n"
    "            '<col style=\"width:calc(50% - 14px)\">' +\n"
    "            '<col style=\"width:calc(50% - 14px)\">' +\n"
    "          '</colgroup>' +\n"
    "          // ── 상단 헤더행 (사진대지(1) rowspan:4) ──\n"
    "          '<tr style=\"height:20px;background:#dce6f1\">' +\n"
    "            '<td rowspan=\"4\" class=\"sida-lbl\" style=\"width:28px;white-space:pre-line\">' + slideLabel1 + '</td>' +\n"
    "            '<td style=\"text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px\">점검사항</td>' +\n"
    "            '<td style=\"text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px\">점검사항</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 상단 사진 2장 (A4 고정 높이) ──\n"
    "          '<tr>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:88mm;padding:0;border-color:#9ab\">' + _makeSlotCell(pairTop[0]) + '</td>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:88mm;padding:0;border-color:#9ab\">' + _makeSlotCell(pairTop[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 상단 캡션 ──\n"
    "          '<tr style=\"height:12mm;background:#eef2f7\">' +\n"
    "            '<td class=\"caption-cell\" style=\"font-size:7pt;border-color:#9ab;padding:3px 6px;text-align:left;vertical-align:top\">' +\n"
    "              '<span style=\"color:#888;font-weight:400\">▶ </span>' + _makeSlotCaption(pairTop[0]) + '</td>' +\n"
    "            '<td class=\"caption-cell\" style=\"font-size:7pt;border-color:#9ab;padding:3px 6px;text-align:left;vertical-align:top\">' +\n"
    "              '<span style=\"color:#888;font-weight:400\">▶ </span>' + _makeSlotCaption(pairTop[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 구분선 (사진대지 1/2 경계) ──\n"
    "          '<tr style=\"height:6mm;background:#dce6f1\">' +\n"
    "            '<td colspan=\"2\" style=\"border-color:#9ab;padding:0;background:#dce6f1\"></td>' +\n"
    "          '</tr>' +\n"
    "          // ── 하단 헤더행 (사진대지(2) rowspan:3) ──\n"
    "          '<tr style=\"height:20px;background:#dce6f1\">' +\n"
    "            '<td rowspan=\"3\" class=\"sida-lbl\" style=\"width:28px;white-space:pre-line\">' +\n"
    "              '사\\n진\\n대\\n지\\n(' + (pg + 1) + ')' +\n"
    "            '</td>' +\n"
    "            '<td style=\"text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px\">점검사항</td>' +\n"
    "            '<td style=\"text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px\">점검사항</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 하단 사진 2장 ──\n"
    "          '<tr>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:88mm;padding:0;border-color:#9ab\">' + _makeSlotCell(pairBot[0]) + '</td>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:88mm;padding:0;border-color:#9ab\">' + _makeSlotCell(pairBot[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 하단 캡션 ──\n"
    "          '<tr style=\"height:12mm;background:#eef2f7\">' +\n"
    "            '<td class=\"caption-cell\" style=\"font-size:7pt;border-color:#9ab;padding:3px 6px;text-align:left;vertical-align:top\">' +\n"
    "              '<span style=\"color:#888;font-weight:400\">▶ </span>' + _makeSlotCaption(pairBot[0]) + '</td>' +\n"
    "            '<td class=\"caption-cell\" style=\"font-size:7pt;border-color:#9ab;padding:3px 6px;text-align:left;vertical-align:top\">' +\n"
    "              '<span style=\"color:#888;font-weight:400\">▶ </span>' + _makeSlotCaption(pairBot[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "        '</table>' +\n"
    "      '</div>';"
)

NEW2 = (
    "      // ── v155j: sida-lbl 완전 제거 — 깔끔한 2열 구조\n"
    "      // A4(297mm) - 패딩(10mm) - 제목(10mm) - 헤더(38mm) = 239mm 사진구역\n"
    "      // 상단구역: 헤더(8mm)+사진(95mm)+캡션(12mm) = 115mm\n"
    "      // 구분선: 5mm\n"
    "      // 하단구역: 헤더(8mm)+사진(95mm)+캡션(12mm) = 115mm  합: 235mm\n"
    "      var pgLabel = (pg + 1) + ' / ' + _pgCount;\n"
    "      photoPages += '<div class=\"photo-page\">' +\n"
    "        '<table style=\"margin-bottom:3px;flex-shrink:0\"><tr class=\"title-row\"><td>안&nbsp;전&nbsp;점&nbsp;검&nbsp;&nbsp;사&nbsp;진&nbsp;&nbsp;대&nbsp;장</td></tr></table>' +\n"
    "        makeHeaderTable() +\n"
    "        '<table style=\"flex:1;width:100%;table-layout:fixed;border-collapse:collapse;border:1.5px solid #1E3A5F\">' +\n"
    "          '<colgroup><col style=\"width:50%\"><col style=\"width:50%\"></colgroup>' +\n"
    "\n"
    "          // ── 상단 헤더행 ──\n"
    "          '<tr>' +\n"
    "            '<th class=\"photo-sec-hdr\" style=\"border-right:1px solid #4a6fa5;border-bottom:1px solid #4a6fa5\">점검사항</th>' +\n"
    "            '<th class=\"photo-sec-hdr\" style=\"border-bottom:1px solid #4a6fa5;text-align:right;padding-right:8px\">' +\n"
    "              '<span style=\"float:left;font-weight:700\">점검사항</span>' +\n"
    "              '<span style=\"font-size:6pt;font-weight:400;opacity:.8\">' + pgLabel + '쪽</span>' +\n"
    "            '</th>' +\n"
    "          '</tr>' +\n"
    "\n"
    "          // ── 상단 사진 2장 ──\n"
    "          '<tr>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:95mm;border-right:1px solid #9ab;border-bottom:none\">' + _makeSlotCell(pairTop[0]) + '</td>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:95mm;border-bottom:none\">' + _makeSlotCell(pairTop[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "\n"
    "          // ── 상단 캡션 ──\n"
    "          '<tr>' +\n"
    "            '<td class=\"caption-cell\" style=\"height:12mm;border-right:1px solid #9ab;border-top:1px solid #c5d0e0\">' +\n"
    "              '<span style=\"color:#1E3A5F;font-weight:700;margin-right:4px\">▶</span>' + _makeSlotCaption(pairTop[0]) + '</td>' +\n"
    "            '<td class=\"caption-cell\" style=\"height:12mm;border-top:1px solid #c5d0e0\">' +\n"
    "              '<span style=\"color:#1E3A5F;font-weight:700;margin-right:4px\">▶</span>' + _makeSlotCaption(pairTop[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "\n"
    "          // ── 구분선 ──\n"
    "          '<tr>' +\n"
    "            '<td colspan=\"2\" class=\"photo-divider\"></td>' +\n"
    "          '</tr>' +\n"
    "\n"
    "          // ── 하단 헤더행 ──\n"
    "          '<tr>' +\n"
    "            '<th class=\"photo-sec-hdr\" style=\"border-right:1px solid #4a6fa5;border-bottom:1px solid #4a6fa5\">점검사항</th>' +\n"
    "            '<th class=\"photo-sec-hdr\" style=\"border-bottom:1px solid #4a6fa5\">점검사항</th>' +\n"
    "          '</tr>' +\n"
    "\n"
    "          // ── 하단 사진 2장 ──\n"
    "          '<tr>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:95mm;border-right:1px solid #9ab;border-bottom:none\">' + _makeSlotCell(pairBot[0]) + '</td>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:95mm;border-bottom:none\">' + _makeSlotCell(pairBot[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "\n"
    "          // ── 하단 캡션 ──\n"
    "          '<tr>' +\n"
    "            '<td class=\"caption-cell\" style=\"height:12mm;border-right:1px solid #9ab;border-top:1px solid #c5d0e0\">' +\n"
    "              '<span style=\"color:#1E3A5F;font-weight:700;margin-right:4px\">▶</span>' + _makeSlotCaption(pairBot[0]) + '</td>' +\n"
    "            '<td class=\"caption-cell\" style=\"height:12mm;border-top:1px solid #c5d0e0\">' +\n"
    "              '<span style=\"color:#1E3A5F;font-weight:700;margin-right:4px\">▶</span>' + _makeSlotCaption(pairBot[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "\n"
    "        '</table>' +\n"
    "      '</div>';"
)

if OLD2 in src:
    src = src.replace(OLD2, NEW2, 1)
    patches_applied.append('PATCH2: photoPages 2열 구조 재구성 (sida-lbl 완전 제거, 95mm 사진셀, 네이비 헤더)')
else:
    print('[WARN] PATCH2 not found')
    # 부분 검색으로 원인 진단
    chk = "var slideLabel1 = '사\\n진\\n대\\n지\\n(' + (pg + 1) + ')';"
    if chk in src:
        print('  -> slideLabel1 라인 발견됨')
    else:
        print('  -> slideLabel1 라인 없음')
    chk2 = "// ── v155i: 단일 테이블 구조"
    if chk2 in src:
        print('  -> v155i 주석 발견됨')
    else:
        print('  -> v155i 주석 없음')

# ─────────────────────────────────────────────────────────────
# 결과 저장
# ─────────────────────────────────────────────────────────────
with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(src)

print('\n=== patch_155j 적용 결과 ===')
print('원본 크기: {:,} bytes'.format(original_len))
print('수정 크기: {:,} bytes'.format(len(src)))
print('적용된 패치:')
for p in patches_applied:
    print('  OK', p)
print('총 {}개 패치 완료'.format(len(patches_applied)))
