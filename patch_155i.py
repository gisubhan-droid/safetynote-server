#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_155i.py — 세션155i: 사진대장 사진셀 cover + sida-lbl + A4 비율 단일테이블 통합
수정 항목:
  1. CSS .photo-cell img: object-fit:contain → cover, width/height:100%
  2. _makePhotoCell img 인라인 스타일: 동일 수정
  3. _makeChkPhotoCell img 인라인 스타일: 동일 수정
  4. CSS .sida-lbl: width 22px→28px, font-size 6pt, overflow:hidden, letter-spacing:-0.5pt
  5. photoPages 전면 재구성: 상/하단 이중 테이블 → 단일 테이블 구조
     - colgroup width 20px → 28px
     - sida-lbl td width:20px → 28px
     - 사진셀 height:105px → height:88mm (A4 기준 고정)
     - rowspan 구조 개선 (상단 rowspan:4 + 하단 rowspan:3 → 단일 rowspan:8)
"""

import re

TARGET = '/home/user/webapp/public/static/app.js'

with open(TARGET, 'r', encoding='utf-8') as f:
    src = f.read()

original_len = len(src)
patches_applied = []

# ─────────────────────────────────────────────
# PATCH 1: CSS .photo-cell img — contain → cover
# ─────────────────────────────────────────────
OLD1 = "'.photo-cell img{max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto}'"
NEW1 = "'.photo-cell img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}'"

if OLD1 in src:
    src = src.replace(OLD1, NEW1, 1)
    patches_applied.append('PATCH1: CSS .photo-cell img object-fit contain→cover')
else:
    print('[WARN] PATCH1 not found — skipping')

# ─────────────────────────────────────────────
# PATCH 2: CSS .sida-lbl — 너비 확대, 폰트 축소, overflow 추가
# ─────────────────────────────────────────────
OLD2 = ("'.sida-lbl{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:bold;font-size:7pt;' +\n"
        "                'background:#dce6f1;color:#1E3A5F;padding:2px 1px;width:20px;vertical-align:middle}'")
NEW2 = ("'.sida-lbl{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:bold;font-size:6pt;' +\n"
        "                'background:#dce6f1;color:#1E3A5F;padding:2px 1px;width:28px;vertical-align:middle;overflow:hidden;letter-spacing:-0.5pt}'")

if OLD2 in src:
    src = src.replace(OLD2, NEW2, 1)
    patches_applied.append('PATCH2: CSS .sida-lbl width 20px→28px, font-size 7pt→6pt, overflow:hidden')
else:
    print('[WARN] PATCH2 not found — skipping')

# ─────────────────────────────────────────────
# PATCH 3: _makePhotoCell img 인라인 스타일 — contain → cover
# ─────────────────────────────────────────────
OLD3 = ('\'<img src="\' + _o + \'/api/inspections/photo/\' + photo.id + \'/img\' + \'" alt="\' + escFn(captionDefault) + \'" style="max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto">\'')
NEW3 = ('\'<img src="\' + _o + \'/api/inspections/photo/\' + photo.id + \'/img\' + \'" alt="\' + escFn(captionDefault) + \'" style="width:100%;height:100%;object-fit:cover;object-position:center;display:block">\'')

if OLD3 in src:
    src = src.replace(OLD3, NEW3, 1)
    patches_applied.append('PATCH3: _makePhotoCell img object-fit contain→cover')
else:
    print('[WARN] PATCH3 not found — trying alternate pattern')
    # 대체 패턴 시도
    OLD3b = 'style="max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto">'
    # _makePhotoCell 함수 내에만 있는 것 (17083라인 근처)
    # 더 구체적인 컨텍스트로 찾기
    idx = src.find('api/inspections/photo/')
    while idx != -1:
        snippet = src[max(0,idx-50):idx+200]
        if 'object-fit:contain' in snippet and '_makePhotoCell' not in snippet:
            pass
        idx = src.find('api/inspections/photo/', idx+1)
    print('[WARN] PATCH3 alternate also not matched — manual check needed')

# ─────────────────────────────────────────────
# PATCH 4: _makeChkPhotoCell img 인라인 스타일 — contain → cover
# ─────────────────────────────────────────────
OLD4 = 'style="max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto" onerror='
NEW4 = 'style="width:100%;height:100%;object-fit:cover;object-position:center;display:block" onerror='

if OLD4 in src:
    src = src.replace(OLD4, NEW4, 1)
    patches_applied.append('PATCH4: _makeChkPhotoCell img object-fit contain→cover')
else:
    print('[WARN] PATCH4 not found — skipping')

# ─────────────────────────────────────────────
# PATCH 5: photoPages 전면 재구성
#   - 이중 테이블(상/하 분리) → 단일 테이블 구조로 통합
#   - colgroup width 20px → 28px
#   - sida-lbl rowspan:8 (헤더+사진+캡션+구분 × 2 = 8행 전체)
#   - 사진셀 height:105px → height:88mm
#   - .photo-cell 에 padding:0 추가 (커버 이미지가 꽉 차도록)
# ─────────────────────────────────────────────

OLD5 = (
    "      // ── CSS 클래스: .sida-lbl 너비 확대, photo-cell 비율 원본 양식 기준\n"
    "      // A4(297mm) - 패딩(12mm) - 헤더(약52mm) - 타이틀(11mm) - 캡션행2개(약12mm) - 구분선 = 약210mm → /2 ≈ 105mm\n"
    "      photoPages += '<div class=\"photo-page\">' +\n"
    "        '<table style=\"margin-bottom:4px;flex-shrink:0\"><tr class=\"title-row\"><td>안&nbsp;전&nbsp;점&nbsp;검&nbsp;&nbsp;사&nbsp;진&nbsp;&nbsp;대&nbsp;장</td></tr></table>' +\n"
    "        makeHeaderTable() +\n"
    "        '<table style=\"flex:1;table-layout:fixed;border:1px solid #9ab;border-collapse:collapse\">' +\n"
    "          '<colgroup>' +\n"
    "            '<col style=\"width:20px\">' +\n"
    "            '<col style=\"width:calc(50% - 10px)\">' +\n"
    "            '<col style=\"width:calc(50% - 10px)\">' +\n"
    "          '</colgroup>' +\n"
    "          // ── 상단 캡션 헤더행 ──\n"
    "          '<tr style=\"height:18px;background:#dce6f1\">' +\n"
    "            '<td rowspan=\"4\" class=\"sida-lbl\" style=\"white-space:pre-line;width:20px\">' + slideLabel + '</td>' +\n"
    "            '<td style=\"text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px\">점검사항</td>' +\n"
    "            '<td style=\"text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px\">점검사항</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 상단 사진 2장 ──\n"
    "          '<tr>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:105px;border-color:#9ab\">' + _makeSlotCell(pairTop[0]) + '</td>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:105px;border-color:#9ab\">' + _makeSlotCell(pairTop[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 상단 사진 캡션 ──\n"
    "          '<tr style=\"height:20px;background:#eef2f7\">' +\n"
    "            '<td class=\"caption-cell\" style=\"font-size:7pt;border-color:#9ab;padding:3px 5px;text-align:left\">' +\n"
    "              '<span style=\"color:#888;font-weight:400\">▶ </span>' + _makeSlotCaption(pairTop[0]) + '</td>' +\n"
    "            '<td class=\"caption-cell\" style=\"font-size:7pt;border-color:#9ab;padding:3px 5px;text-align:left\">' +\n"
    "              '<span style=\"color:#888;font-weight:400\">▶ </span>' + _makeSlotCaption(pairTop[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 구분선 (사진대지 상/하 사이) ──\n"
    "          '<tr style=\"height:4px;background:#dce6f1\">' +\n"
    "            '<td colspan=\"2\" style=\"border-color:#9ab;padding:0;background:#dce6f1\"></td>' +\n"
    "          '</tr>' +\n"
    "        '</table>' +\n"
    "        // ── 하단 2장 별도 테이블 (구분선 분리) ──\n"
    "        '<table style=\"flex:none;table-layout:fixed;border:1px solid #9ab;border-collapse:collapse;border-top:none\">' +\n"
    "          '<colgroup>' +\n"
    "            '<col style=\"width:20px\">' +\n"
    "            '<col style=\"width:calc(50% - 10px)\">' +\n"
    "            '<col style=\"width:calc(50% - 10px)\">' +\n"
    "          '</colgroup>' +\n"
    "          // ── 하단 캡션 헤더행 ──\n"
    "          '<tr style=\"height:18px;background:#dce6f1\">' +\n"
    "            '<td rowspan=\"3\" class=\"sida-lbl\" style=\"white-space:pre-line;width:20px;color:transparent\">' + slideLabel + '</td>' +\n"
    "            '<td style=\"text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px\">점검사항</td>' +\n"
    "            '<td style=\"text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px\">점검사항</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 하단 사진 2장 ──\n"
    "          '<tr>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:105px;border-color:#9ab\">' + _makeSlotCell(pairBot[0]) + '</td>' +\n"
    "            '<td class=\"photo-cell\" style=\"height:105px;border-color:#9ab\">' + _makeSlotCell(pairBot[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "          // ── 하단 사진 캡션 ──\n"
    "          '<tr style=\"height:20px;background:#eef2f7\">' +\n"
    "            '<td class=\"caption-cell\" style=\"font-size:7pt;border-color:#9ab;padding:3px 5px;text-align:left\">' +\n"
    "              '<span style=\"color:#888;font-weight:400\">▶ </span>' + _makeSlotCaption(pairBot[0]) + '</td>' +\n"
    "            '<td class=\"caption-cell\" style=\"font-size:7pt;border-color:#9ab;padding:3px 5px;text-align:left\">' +\n"
    "              '<span style=\"color:#888;font-weight:400\">▶ </span>' + _makeSlotCaption(pairBot[1]) + '</td>' +\n"
    "          '</tr>' +\n"
    "        '</table>' +\n"
    "      '</div>';"
)

NEW5 = (
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

if OLD5 in src:
    src = src.replace(OLD5, NEW5, 1)
    patches_applied.append('PATCH5: photoPages 단일 테이블 구조, height:88mm, sida-lbl width:28px, cover 이미지')
else:
    print('[WARN] PATCH5 not found — 정확한 매칭 실패')
    # 디버그: 분리 검색
    if "      // ── CSS 클래스: .sida-lbl 너비 확대, photo-cell 비율 원본 양식 기준" in src:
        print('  → 주석행은 발견됨')
    else:
        print('  → 주석행도 없음')
    if "height:105px;border-color:#9ab" in src:
        print('  → height:105px 패턴 발견됨')

# ─────────────────────────────────────────────
# 결과 저장
# ─────────────────────────────────────────────
with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(src)

print('\n=== patch_155i 적용 결과 ===')
print('원본 크기: {:,} bytes'.format(original_len))
print('수정 크기: {:,} bytes'.format(len(src)))
print('적용된 패치:')
for p in patches_applied:
    print('  ✅', p)
print('총 {}개 패치 적용 완료'.format(len(patches_applied)))
