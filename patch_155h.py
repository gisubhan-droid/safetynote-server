#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_155h.py — 안전점검 사진 대장 전면 재설계
변경 내용:
  [1] _printInspectionReport 내 체크리스트 사진 데이터 로드 추가
      GET /api/inspections/:id/checklist-results → item_text + photo_path 포함 데이터 수신
  [2] photoPages 생성 로직 완전 교체
      - 사진 소스 통합: 전체사진(ins.photos) + 체크리스트 항목별 사진
      - 원본 양식 비율: 사진셀 충분한 높이, 캡션행 높이 확보, 세로라벨 너비 확대
      - 캡션: 항목별 사진은 item_text 표시, 전체사진은 caption 표시
      - 헤더행(점검사항): 사진 셀 위에 별도 헤더 표시
"""
import re, sys, os

APP = 'public/static/app.js'

def read():
    with open(APP, 'r', encoding='utf-8') as f:
        return f.read()

def write(src):
    with open(APP, 'w', encoding='utf-8') as f:
        f.write(src)


def patch1_load_chk_photos(src):
    """체크리스트 결과 로드 시 item_text + photo_path 포함 savedChkPhotoMap 추가"""
    OLD = (
        "    // ── 저장된 체크리스트 결과 로드 ──\n"
        "    var savedChkMap = {};\n"
        "    try {\n"
        "      var chkToken = localStorage.getItem('token');\n"
        "      var chkRes = await fetch('/api/inspections/' + insId + '/checklist-results', {\n"
        "        headers: chkToken ? { 'Authorization': 'Bearer ' + chkToken } : {}\n"
        "      });\n"
        "      if (chkRes.ok) {\n"
        "        var chkData = await chkRes.json();\n"
        "        (chkData.results || []).forEach(function(r) { savedChkMap[r.item_key] = r.result; });\n"
        "      }\n"
        "    } catch(_) {}"
    )
    NEW = (
        "    // ── 저장된 체크리스트 결과 + 항목별 사진 로드 ──\n"
        "    var savedChkMap = {};       // item_key → result\n"
        "    var savedChkTextMap = {};   // item_key → item_text\n"
        "    var savedChkPhotoList = []; // 사진 있는 항목: [{ item_key, item_text, result }]\n"
        "    try {\n"
        "      var chkToken = localStorage.getItem('token');\n"
        "      var chkRes = await fetch('/api/inspections/' + insId + '/checklist-results', {\n"
        "        headers: chkToken ? { 'Authorization': 'Bearer ' + chkToken } : {}\n"
        "      });\n"
        "      if (chkRes.ok) {\n"
        "        var chkData = await chkRes.json();\n"
        "        (chkData.results || []).forEach(function(r) {\n"
        "          savedChkMap[r.item_key] = r.result;\n"
        "          savedChkTextMap[r.item_key] = r.item_text || '';\n"
        "          // photo_path 컬럼이 있으면 사진 목록에 추가\n"
        "          if (r.photo_path) {\n"
        "            savedChkPhotoList.push({\n"
        "              item_key:  r.item_key,\n"
        "              item_text: r.item_text || '',\n"
        "              result:    r.result || 'na'\n"
        "            });\n"
        "          }\n"
        "        });\n"
        "      }\n"
        "    } catch(_) {}"
    )
    if OLD not in src:
        print('❌ [patch1] 체크리스트 로드 블록을 찾지 못함')
        return None
    result = src.replace(OLD, NEW, 1)
    print('✅ [patch1] 체크리스트 사진 데이터 로드 추가 완료')
    return result


def patch2_photo_helper(src):
    """_makePhotoCell 헬퍼: 체크리스트 사진 URL용 오버로드 추가"""
    OLD = (
        "// ── 사진 셀 생성 (for 루프 밖 독립 함수) ──\n"
        "function _makePhotoCell(photo, idx, escFn, origin) {\n"
        "  var _o = origin || '';\n"
        "  var captionDefault = photo ? (photo.caption || ('점검사진 #' + (idx + 1))) : '';\n"
        "  return photo\n"
        "    ? '<img src=\"' + _o + '/api/inspections/photo/' + photo.id + '/img\" alt=\"' + escFn(captionDefault) + '\" style=\"max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto\">'\n"
        "    : '<div style=\"width:100%;height:100%;background:#f5f5f5;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:9pt\">사진 없음</div>';\n"
        "}"
    )
    NEW = (
        "// ── 사진 셀 생성 (for 루프 밖 독립 함수) ──\n"
        "function _makePhotoCell(photo, idx, escFn, origin) {\n"
        "  var _o = origin || '';\n"
        "  var captionDefault = photo ? (photo.caption || ('점검사진 #' + (idx + 1))) : '';\n"
        "  return photo\n"
        "    ? '<img src=\"' + _o + '/api/inspections/photo/' + photo.id + '/img\" alt=\"' + escFn(captionDefault) + '\" style=\"max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto\">'\n"
        "    : '<div style=\"width:100%;height:100%;background:#f5f5f5;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:9pt\">사진 없음</div>';\n"
        "}\n"
        "\n"
        "// ── 체크리스트 항목별 사진 셀 생성 (item_key 기반 API URL) ──\n"
        "function _makeChkPhotoCell(itemKey, escFn, origin) {\n"
        "  var _o = origin || '';\n"
        "  if (!itemKey) {\n"
        "    return '<div style=\"width:100%;height:100%;background:#f5f5f5;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:9pt\">사진 없음</div>';\n"
        "  }\n"
        "  var encodedKey = encodeURIComponent(itemKey);\n"
        "  return '<img src=\"' + _o + '/api/inspections/' + _chkPhotoInsId + '/checklist-photo/' + encodedKey + '\" alt=\"\" style=\"max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto\" onerror=\"this.parentNode.innerHTML=\\'<div style=\\'\\''+'width:100%;height:100%;background:#f5f5f5;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:8pt\\'>사진 없음</div>\\'\">';\n"
        "}\n"
        "var _chkPhotoInsId = 0; // _printInspectionReport 내에서 설정"
    )
    if OLD not in src:
        print('❌ [patch2] _makePhotoCell 블록을 찾지 못함')
        return None
    result = src.replace(OLD, NEW, 1)
    print('✅ [patch2] _makeChkPhotoCell 헬퍼 추가 완료')
    return result


def patch3_set_ins_id(src):
    """_printInspectionReport 시작 시 _chkPhotoInsId 설정"""
    OLD = (
        "    // ── 로컬 esc 별칭 ──\n"
        "    var _esc = _escHtml;"
    )
    NEW = (
        "    // ── 로컬 esc 별칭 + 체크리스트 사진 전역 설정 ──\n"
        "    var _esc = _escHtml;\n"
        "    _chkPhotoInsId = insId; // _makeChkPhotoCell 에서 사용"
    )
    if OLD not in src:
        print('❌ [patch3] _esc 별칭 블록을 찾지 못함')
        return None
    result = src.replace(OLD, NEW, 1)
    print('✅ [patch3] _chkPhotoInsId 설정 완료')
    return result


def patch4_photo_pages(src):
    """사진대장 photoPages 생성 로직 전면 교체 — 원본 양식 비율 + 체크리스트 사진 통합"""
    OLD = (
        "    // ── 2페이지~: 안전점검 사진대장 ──\n"
        "    var photos = Array.isArray(ins.photos) ? ins.photos.filter(function(p) {\n"
        "      var fn = (p.file_name || '').toLowerCase();\n"
        "      return !fn.match(/\\.(mp4|mov|avi|webm|mkv)$/) && !(p.mime_type || '').startsWith('video/');\n"
        "    }) : [];\n"
        "\n"
        "    var photoPages = '';\n"
        "    var pageCount = Math.max(1, Math.ceil(photos.length / 4));\n"
        "\n"
        "    for (var pg = 0; pg < pageCount; pg++) {\n"
        "      var batch = photos.slice(pg * 4, pg * 4 + 4);\n"
        "      while (batch.length < 4) { batch.push(null); }\n"
        "\n"
        "      var slideLabel = (pg === 0) ? '사\\n진\\n대\\n지\\n(1)' : '사\\n진\\n대\\n지\\n(' + (pg + 1) + ')';\n"
        "      var pairTop = [batch[0], batch[1]];\n"
        "      var pairBot = [batch[2], batch[3]];\n"
        "\n"
        "      // 사진 셀 높이: 헤더(약 40mm) + 제목(12mm) + 여백 ≈ 297-8-8-52 = 229mm → /2 ≈ 109mm\n"
        "      photoPages += '<div class=\"photo-page\">' +\n"
        "        '<table style=\"margin-bottom:5px;flex-shrink:0\"><tr class=\"title-row\"><td colspan=\"4\">안&nbsp;전&nbsp;점&nbsp;검&nbsp;&nbsp;사&nbsp;진&nbsp;&nbsp;대&nbsp;장</td></tr></table>' +\n"
        "        makeHeaderTable() +\n"
        "        '<table style=\"flex:1;table-layout:fixed;border-collapse:collapse\">' +\n"
        "          '<colgroup>' +\n"
        "            '<col style=\"width:14px\">' +\n"
        "            '<col style=\"width:49%\">' +\n"
        "            '<col style=\"width:49%\">' +\n"
        "          '</colgroup>' +\n"
        "          '<tr style=\"height:108px\">' +\n"
        "            '<td class=\"sida-lbl\" rowspan=\"4\" style=\"white-space:pre-line\">' + slideLabel + '</td>' +\n"
        "            '<td class=\"photo-cell\" style=\"height:108px\">' + _makePhotoCell(pairTop[0], pg*4+0, _esc, _origin) + '</td>' +\n"
        "            '<td class=\"photo-cell\" style=\"height:108px\">' + _makePhotoCell(pairTop[1], pg*4+1, _esc, _origin) + '</td>' +\n"
        "          '</tr>' +\n"
        "          '<tr>' +\n"
        "            '<td class=\"caption-cell\">점검사항 · ' + _makePhotoCaption(pairTop[0], pg*4+0, _esc) + '</td>' +\n"
        "            '<td class=\"caption-cell\">점검사항 · ' + _makePhotoCaption(pairTop[1], pg*4+1, _esc) + '</td>' +\n"
        "          '</tr>' +\n"
        "          '<tr style=\"border-top:2px solid #888;height:108px\">' +\n"
        "            '<td class=\"photo-cell\" style=\"height:108px\">' + _makePhotoCell(pairBot[0], pg*4+2, _esc, _origin) + '</td>' +\n"
        "            '<td class=\"photo-cell\" style=\"height:108px\">' + _makePhotoCell(pairBot[1], pg*4+3, _esc, _origin) + '</td>' +\n"
        "          '</tr>' +\n"
        "          '<tr>' +\n"
        "            '<td class=\"caption-cell\">점검사항 · ' + _makePhotoCaption(pairBot[0], pg*4+2, _esc) + '</td>' +\n"
        "            '<td class=\"caption-cell\">점검사항 · ' + _makePhotoCaption(pairBot[1], pg*4+3, _esc) + '</td>' +\n"
        "          '</tr>' +\n"
        "        '</table>' +\n"
        "      '</div>';\n"
        "    }"
    )
    NEW = r"""    // ── 2페이지~: 안전점검 사진대장 (v155h — 원본 양식 비율 + 체크리스트 사진 통합) ──
    // 1) 전체사진 (ins.photos) — 동영상 제외
    var _genPhotos = Array.isArray(ins.photos) ? ins.photos.filter(function(p) {
      var fn = (p.file_name || '').toLowerCase();
      return !fn.match(/\.(mp4|mov|avi|webm|mkv)$/) && !(p.mime_type || '').startsWith('video/');
    }) : [];

    // 2) 통합 슬롯 배열 구성
    //    각 슬롯: { type:'gen'|'chk', photo?:object, item_key?:string, caption:string }
    var _allSlots = [];

    // 체크리스트 사진 (양호/불량 항목에 사진 있는 것)
    savedChkPhotoList.forEach(function(r) {
      _allSlots.push({
        type:     'chk',
        item_key: r.item_key,
        caption:  r.item_text || r.item_key
      });
    });

    // 전체사진 (점검 사진)
    _genPhotos.forEach(function(p, i) {
      _allSlots.push({
        type:    'gen',
        photo:   p,
        photoIdx: i,
        caption: p.caption || ('점검사진 #' + (i + 1))
      });
    });

    // 슬롯이 하나도 없으면 빈 슬롯 1개라도 만들어서 빈 페이지 출력
    if (_allSlots.length === 0) {
      _allSlots.push({ type:'empty', caption:'' });
      _allSlots.push({ type:'empty', caption:'' });
      _allSlots.push({ type:'empty', caption:'' });
      _allSlots.push({ type:'empty', caption:'' });
    }

    // 빈 슬롯 헬퍼
    function _makeSlotCell(slot) {
      if (!slot || slot.type === 'empty') {
        return '<div style="width:100%;height:100%;background:#f0f2f5;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:9pt">사진 없음</div>';
      }
      if (slot.type === 'chk') {
        return _makeChkPhotoCell(slot.item_key, _esc, _origin);
      }
      // gen
      return _makePhotoCell(slot.photo || null, slot.photoIdx || 0, _esc, _origin);
    }

    function _makeSlotCaption(slot) {
      if (!slot || slot.type === 'empty') return '&nbsp;';
      return _esc(slot.caption || '');
    }

    var photoPages = '';
    var _pgCount = Math.max(1, Math.ceil(_allSlots.length / 4));

    for (var pg = 0; pg < _pgCount; pg++) {
      var batch = _allSlots.slice(pg * 4, pg * 4 + 4);
      while (batch.length < 4) { batch.push({ type:'empty', caption:'' }); }

      var slideLabel = '사\n진\n대\n지\n(' + (pg + 1) + ')';
      var pairTop = [batch[0], batch[1]];
      var pairBot = [batch[2], batch[3]];

      // ── CSS 클래스: .sida-lbl 너비 확대, photo-cell 비율 원본 양식 기준
      // A4(297mm) - 패딩(12mm) - 헤더(약52mm) - 타이틀(11mm) - 캡션행2개(약12mm) - 구분선 = 약210mm → /2 ≈ 105mm
      photoPages += '<div class="photo-page">' +
        '<table style="margin-bottom:4px;flex-shrink:0"><tr class="title-row"><td>안&nbsp;전&nbsp;점&nbsp;검&nbsp;&nbsp;사&nbsp;진&nbsp;&nbsp;대&nbsp;장</td></tr></table>' +
        makeHeaderTable() +
        '<table style="flex:1;table-layout:fixed;border:1px solid #9ab;border-collapse:collapse">' +
          '<colgroup>' +
            '<col style="width:20px">' +
            '<col style="width:calc(50% - 10px)">' +
            '<col style="width:calc(50% - 10px)">' +
          '</colgroup>' +
          // ── 상단 캡션 헤더행 ──
          '<tr style="height:18px;background:#dce6f1">' +
            '<td rowspan="4" class="sida-lbl" style="white-space:pre-line;width:20px">' + slideLabel + '</td>' +
            '<td style="text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px">점검사항</td>' +
            '<td style="text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px">점검사항</td>' +
          '</tr>' +
          // ── 상단 사진 2장 ──
          '<tr>' +
            '<td class="photo-cell" style="height:105px;border-color:#9ab">' + _makeSlotCell(pairTop[0]) + '</td>' +
            '<td class="photo-cell" style="height:105px;border-color:#9ab">' + _makeSlotCell(pairTop[1]) + '</td>' +
          '</tr>' +
          // ── 상단 사진 캡션 ──
          '<tr style="height:20px;background:#eef2f7">' +
            '<td class="caption-cell" style="font-size:7pt;border-color:#9ab;padding:3px 5px;text-align:left">' +
              '<span style="color:#888;font-weight:400">▶ </span>' + _makeSlotCaption(pairTop[0]) + '</td>' +
            '<td class="caption-cell" style="font-size:7pt;border-color:#9ab;padding:3px 5px;text-align:left">' +
              '<span style="color:#888;font-weight:400">▶ </span>' + _makeSlotCaption(pairTop[1]) + '</td>' +
          '</tr>' +
          // ── 구분선 (사진대지 상/하 사이) ──
          '<tr style="height:4px;background:#dce6f1">' +
            '<td colspan="2" style="border-color:#9ab;padding:0;background:#dce6f1"></td>' +
          '</tr>' +
        '</table>' +
        // ── 하단 2장 별도 테이블 (구분선 분리) ──
        '<table style="flex:none;table-layout:fixed;border:1px solid #9ab;border-collapse:collapse;border-top:none">' +
          '<colgroup>' +
            '<col style="width:20px">' +
            '<col style="width:calc(50% - 10px)">' +
            '<col style="width:calc(50% - 10px)">' +
          '</colgroup>' +
          // ── 하단 캡션 헤더행 ──
          '<tr style="height:18px;background:#dce6f1">' +
            '<td rowspan="3" class="sida-lbl" style="white-space:pre-line;width:20px;color:transparent">' + slideLabel + '</td>' +
            '<td style="text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px">점검사항</td>' +
            '<td style="text-align:center;font-size:7.5pt;font-weight:700;color:#1E3A5F;border-color:#9ab;padding:2px 4px">점검사항</td>' +
          '</tr>' +
          // ── 하단 사진 2장 ──
          '<tr>' +
            '<td class="photo-cell" style="height:105px;border-color:#9ab">' + _makeSlotCell(pairBot[0]) + '</td>' +
            '<td class="photo-cell" style="height:105px;border-color:#9ab">' + _makeSlotCell(pairBot[1]) + '</td>' +
          '</tr>' +
          // ── 하단 사진 캡션 ──
          '<tr style="height:20px;background:#eef2f7">' +
            '<td class="caption-cell" style="font-size:7pt;border-color:#9ab;padding:3px 5px;text-align:left">' +
              '<span style="color:#888;font-weight:400">▶ </span>' + _makeSlotCaption(pairBot[0]) + '</td>' +
            '<td class="caption-cell" style="font-size:7pt;border-color:#9ab;padding:3px 5px;text-align:left">' +
              '<span style="color:#888;font-weight:400">▶ </span>' + _makeSlotCaption(pairBot[1]) + '</td>' +
          '</tr>' +
        '</table>' +
      '</div>';
    }"""
    if OLD not in src:
        print('❌ [patch4] photoPages 블록을 찾지 못함')
        return None
    result = src.replace(OLD, NEW, 1)
    print('✅ [patch4] 사진대장 photoPages 전면 재설계 완료')
    return result


def patch5_sida_css(src):
    """sida-lbl 클래스 너비 확대 + photo-cell 높이 조정"""
    OLD = (
        "      '.sida-lbl{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:bold;font-size:7.5pt;' +\n"
        "                'background:#dce6f1;color:#1E3A5F;padding:2px;width:13px}' +"
    )
    NEW = (
        "      '.sida-lbl{writing-mode:vertical-rl;text-orientation:mixed;text-align:center;font-weight:bold;font-size:7pt;' +\n"
        "                'background:#dce6f1;color:#1E3A5F;padding:2px 1px;width:20px;vertical-align:middle}' +"
    )
    if OLD not in src:
        print('❌ [patch5] .sida-lbl CSS를 찾지 못함')
        return None
    result = src.replace(OLD, NEW, 1)
    print('✅ [patch5] .sida-lbl 너비 확대 완료')
    return result


def main():
    if not os.path.exists(APP):
        print(f'파일 없음: {APP}')
        sys.exit(1)

    src = read()
    original_len = len(src)

    patches = [
        ('체크리스트 사진 데이터 로드',       patch1_load_chk_photos),
        ('_makeChkPhotoCell 헬퍼 추가',       patch2_photo_helper),
        ('_chkPhotoInsId 설정',               patch3_set_ins_id),
        ('사진대장 photoPages 전면 재설계',    patch4_photo_pages),
        ('.sida-lbl CSS 너비 확대',           patch5_sida_css),
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
    print('✅ 전체 패치 완료')

if __name__ == '__main__':
    main()
