#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_155f.py — 현장점검 등록 모달 체크리스트 항목별 사진 첨부 + 점검내용/조치사항 이동

변경사항:
  1. showCreateInspectionModal: 체크리스트 HTML에 사진 업로드 슬롯 추가
     - 각 항목 선택(양호/불량/해당없음) 시 → 해당 행 아래 사진 업로드 영역 노출
     - _setInsRegChk 함수에서 사진 슬롯 토글 처리
  2. 모달 섹션 순서 변경: 기본정보 → 체크리스트(사진포함) → 사진/동영상 → 점검내용/조치사항 → 최종결과
  3. submitInspection 4단계 추가: checklist-photos API 업로드
  4. _setInsRegChk: 사진 슬롯 토글 로직 추가
  5. window._insRegChkPhotoMap: 체크리스트 항목별 사진 파일 메모리

RULE:
  - app.js는 순수 JS: var 사용, const/let/?.  사용 금지 (단 기존 submitInspection async 내부는 const 허용)
  - 백틱 중첩 금지: 문자열 연결 + 문자열로 처리
  - data-* 속성 기반 onclick (따옴표 파싱 오류 방지)
"""

import sys
import re

APP_JS = '/home/user/webapp/public/static/app.js'

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
        print(f'  ⚠️  [{label}] 패턴 {count}회 → 첫 번째만 교체')
    result = content.replace(old, new, 1)
    print(f'  ✅ [{label}] 교체 완료')
    return result, True

errors = []
app = read_file(APP_JS)

# ══════════════════════════════════════════════════════════
# 1. _setInsRegChk 함수 수정: 사진 슬롯 토글 추가
#    기존: 버튼 색상 + _insRegChkMap 저장
#    신규: 버튼 색상 + _insRegChkMap 저장 + 사진 슬롯 표시/숨김
# ══════════════════════════════════════════════════════════
print('\n[1] _setInsRegChk 함수 수정 — 사진 슬롯 토글 추가')

OLD_SET_CHK = '''function _setInsRegChk(key, val, btn) {
  // 같은 항목의 버튼 전부 초기화
  var allBtns = document.querySelectorAll('[data-key="' + key.replace(/"/g, '&quot;') + '"]');
  allBtns.forEach(function(b) {
    b.style.background = '#fff';
    b.style.color = '#555';
    b.style.borderColor = '#ccc';
  });
  // 선택 버튼 활성화
  var colMap = { good: '#2DB400', bad: '#D70072', na: '#888' };
  var c = colMap[val] || '#555';
  btn.style.background = c;
  btn.style.color = '#fff';
  btn.style.borderColor = c;

  // 불량이면 행 배경 분홍
  var rowEl = document.getElementById('ins-reg-row-' + encodeURIComponent(key));
  if (rowEl) rowEl.style.background = val === 'bad' ? '#fff5f8' : '#fff';

  // 메모리에 저장
  if (!window._insRegChkMap) window._insRegChkMap = {};
  window._insRegChkMap[key] = val;
}'''

NEW_SET_CHK = '''function _setInsRegChk(key, val, btn) {
  // 같은 항목의 버튼 전부 초기화
  var allBtns = document.querySelectorAll('[data-key="' + key.replace(/"/g, '&quot;') + '"]');
  allBtns.forEach(function(b) {
    b.style.background = '#fff';
    b.style.color = '#555';
    b.style.borderColor = '#ccc';
  });
  // 선택 버튼 활성화
  var colMap = { good: '#2DB400', bad: '#D70072', na: '#888' };
  var c = colMap[val] || '#555';
  btn.style.background = c;
  btn.style.color = '#fff';
  btn.style.borderColor = c;

  // 불량이면 행 배경 분홍
  var rowEl = document.getElementById('ins-reg-row-' + encodeURIComponent(key));
  if (rowEl) rowEl.style.background = val === 'bad' ? '#fff5f8' : '#fff';

  // 메모리에 저장
  if (!window._insRegChkMap) window._insRegChkMap = {};
  window._insRegChkMap[key] = val;

  // 사진 슬롯 표시/숨김: 체크된 항목(good/bad — na 제외)만 슬롯 노출
  var photoSlot = document.getElementById('ins-reg-photo-' + encodeURIComponent(key));
  if (photoSlot) {
    if (val === 'good' || val === 'bad') {
      photoSlot.style.display = 'flex';
    } else {
      // 해당없음: 슬롯 숨기고 기존 선택 파일도 제거
      photoSlot.style.display = 'none';
      var fileInput = photoSlot.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
      var preview = photoSlot.querySelector('.ins-reg-photo-preview');
      if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
      if (!window._insRegChkPhotoMap) window._insRegChkPhotoMap = {};
      delete window._insRegChkPhotoMap[key];
    }
  }
}

// 체크리스트 항목 사진 파일 선택 핸들러
function _insRegChkPhotoChange(input, key) {
  var file = input.files[0];
  if (!file) return;
  if (!window._insRegChkPhotoMap) window._insRegChkPhotoMap = {};
  // 미리보기 URL 생성
  var url = URL.createObjectURL(file);
  window._insRegChkPhotoMap[key] = { file: file, url: url };
  // 미리보기 DOM 갱신
  var encodedKey = encodeURIComponent(key);
  var preview = document.getElementById('ins-reg-photo-prev-' + encodedKey);
  if (preview) {
    preview.innerHTML = '<img src="' + url + '" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:2px solid #2DB400">' +
      '<button type="button" onclick="_insRegChkPhotoRemove(this)" data-key="' + key.replace(/"/g, '&quot;') + '"' +
      ' style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;line-height:16px;text-align:center;cursor:pointer;padding:0">✕</button>';
    preview.style.display = 'block';
    preview.style.position = 'relative';
    preview.style.display = 'inline-block';
  }
  // 슬롯 테두리 초록으로 변경
  var slot = document.getElementById('ins-reg-photo-' + encodedKey);
  if (slot) slot.style.borderColor = '#2DB400';
}

// 체크리스트 항목 사진 삭제
function _insRegChkPhotoRemove(btn) {
  var key = btn.getAttribute('data-key');
  if (!key) return;
  if (!window._insRegChkPhotoMap) window._insRegChkPhotoMap = {};
  delete window._insRegChkPhotoMap[key];
  var encodedKey = encodeURIComponent(key);
  var preview = document.getElementById('ins-reg-photo-prev-' + encodedKey);
  if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
  var slot = document.getElementById('ins-reg-photo-' + encodedKey);
  if (slot) {
    slot.style.borderColor = '#d1d5db';
    var fileInput = slot.querySelector('input[type="file"]');
    if (fileInput) fileInput.value = '';
  }
}'''

app, ok1 = patch(app, OLD_SET_CHK, NEW_SET_CHK, '1 _setInsRegChk 사진슬롯 토글')

# ══════════════════════════════════════════════════════════
# 2. showCreateInspectionModal: 체크리스트 HTML 빌드 수정
#    각 체크 항목 행 아래에 사진 업로드 슬롯 추가
# ══════════════════════════════════════════════════════════
print('\n[2] showCreateInspectionModal — 체크리스트 HTML에 사진 슬롯 추가')

OLD_CHK_HTML_BUILD = '''  // 등록용 체크리스트 메모리 초기화
  window._insRegChkMap = {};

  // 체크리스트 HTML 빌드 (등록 모달 전용)
  var _insRegChkHtml = '<div style="background:#f8f6fb;border:1px solid #d0c8e8;border-radius:10px;padding:10px 12px;margin-bottom:0">';
  _INS_CHECKLIST.forEach(function(sec) {
    _insRegChkHtml += '<div style="margin-bottom:8px">' +
      '<div style="background:#685182;color:#fff;border-radius:5px 5px 0 0;padding:4px 10px;font-size:11px;font-weight:700">' +
        sec.group +
      '</div>';
    sec.items.forEach(function(item, i) {
      var key = sec.group + '::' + i;
      _insRegChkHtml +=
        '<div style="display:flex;align-items:flex-start;gap:6px;padding:5px 8px;border:1px solid #e8e0f0;border-top:none;background:#fff"' +
             ' id="ins-reg-row-' + encodeURIComponent(key) + '">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:10px;color:#333;line-height:1.35">' + item.text + '</div>' +
            '<div style="font-size:9px;color:#999;margin-top:1px">' + item.basis + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:3px;flex-shrink:0;margin-top:1px">' +
            '<button type="button" onclick="_setInsRegChkByEl(this)"' +
              ' style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid #ccc;cursor:pointer;font-weight:700;background:#fff;color:#555"' +
              ' data-key="' + key.replace(/"/g, '&quot;') + '" data-val="good">양호</button>' +
            '<button type="button" onclick="_setInsRegChkByEl(this)"' +
              ' style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid #ccc;cursor:pointer;font-weight:700;background:#fff;color:#555"' +
              ' data-key="' + key.replace(/"/g, '&quot;') + '" data-val="bad">불량</button>' +
            '<button type="button" onclick="_setInsRegChkByEl(this)"' +
              ' style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid #ccc;cursor:pointer;font-weight:700;background:#fff;color:#555"' +
              ' data-key="' + key.replace(/"/g, '&quot;') + '" data-val="na">해당없음</button>' +
          '</div>' +
        '</div>';
    });
    _insRegChkHtml += '</div>';
  });
  _insRegChkHtml += '</div>';'''

NEW_CHK_HTML_BUILD = '''  // 등록용 체크리스트 메모리 초기화
  window._insRegChkMap = {};
  window._insRegChkPhotoMap = {};

  // 체크리스트 HTML 빌드 (등록 모달 전용) — 항목별 사진 슬롯 포함
  var _insRegChkHtml = '<div style="background:#f8f6fb;border:1px solid #d0c8e8;border-radius:10px;padding:10px 12px;margin-bottom:0">';
  _insRegChkHtml += '<div style="font-size:10px;color:#685182;margin-bottom:6px;padding:4px 6px;background:#f0ecf8;border-radius:6px">' +
    '<i class="fas fa-camera" style="margin-right:4px"></i>' +
    '양호/불량 선택 시 사진 첨부 슬롯이 나타납니다. <strong>최소 4개 항목</strong>에 사진을 첨부해 주세요.' +
  '</div>';
  _INS_CHECKLIST.forEach(function(sec) {
    _insRegChkHtml += '<div style="margin-bottom:8px">' +
      '<div style="background:#685182;color:#fff;border-radius:5px 5px 0 0;padding:4px 10px;font-size:11px;font-weight:700">' +
        sec.group +
      '</div>';
    sec.items.forEach(function(item, i) {
      var key = sec.group + '::' + i;
      var encKey = encodeURIComponent(key);
      var quotedKey = key.replace(/"/g, '&quot;');
      _insRegChkHtml +=
        '<div style="border:1px solid #e8e0f0;border-top:none;background:#fff" id="ins-reg-row-' + encKey + '">' +
          // 체크 행
          '<div style="display:flex;align-items:flex-start;gap:6px;padding:5px 8px">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-size:10px;color:#333;line-height:1.35">' + item.text + '</div>' +
              '<div style="font-size:9px;color:#999;margin-top:1px">' + item.basis + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:3px;flex-shrink:0;margin-top:1px">' +
              '<button type="button" onclick="_setInsRegChkByEl(this)"' +
                ' style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid #ccc;cursor:pointer;font-weight:700;background:#fff;color:#555"' +
                ' data-key="' + quotedKey + '" data-val="good">양호</button>' +
              '<button type="button" onclick="_setInsRegChkByEl(this)"' +
                ' style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid #ccc;cursor:pointer;font-weight:700;background:#fff;color:#555"' +
                ' data-key="' + quotedKey + '" data-val="bad">불량</button>' +
              '<button type="button" onclick="_setInsRegChkByEl(this)"' +
                ' style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid #ccc;cursor:pointer;font-weight:700;background:#fff;color:#555"' +
                ' data-key="' + quotedKey + '" data-val="na">해당없음</button>' +
            '</div>' +
          '</div>' +
          // 사진 업로드 슬롯 (초기 hidden — _setInsRegChk에서 display:flex로 전환)
          '<div id="ins-reg-photo-' + encKey + '"' +
               ' style="display:none;align-items:center;gap:8px;padding:5px 10px 7px 10px;border-top:1px dashed #e0d8f0;background:#fafafe">' +
            '<div style="flex-shrink:0">' +
              '<div id="ins-reg-photo-prev-' + encKey + '" style="display:none;position:relative"></div>' +
              '<label id="ins-reg-photo-lbl-' + encKey + '"' +
                ' style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#685182;color:#fff;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">' +
                '<i class="fas fa-camera" style="font-size:10px"></i>사진 첨부' +
                '<input type="file" accept="image/*" capture="environment" style="display:none"' +
                  ' data-chk-key="' + quotedKey + '"' +
                  ' onchange="_insRegChkPhotoChange(this, this.getAttribute(\'data-chk-key\'))">' +
              '</label>' +
            '</div>' +
            '<div style="font-size:9px;color:#888;line-height:1.4">' +
              '<i class="fas fa-info-circle" style="color:#a0a0c0;margin-right:2px"></i>' +
              '이 항목 관련 현장 사진<br>1장 첨부 (선택)' +
            '</div>' +
          '</div>' +
        '</div>';
    });
    _insRegChkHtml += '</div>';
  });
  _insRegChkHtml += '</div>';'''

app, ok2 = patch(app, OLD_CHK_HTML_BUILD, NEW_CHK_HTML_BUILD, '2 showCreateInspectionModal 체크리스트 사진슬롯')

# ══════════════════════════════════════════════════════════
# 3. showCreateInspectionModal: 모달 섹션 순서 변경
#    기존 ①기본정보에서 점검내용/조치사항 분리 → ③사진 다음으로 이동
#    기존: ①기본정보(점검내용+조치사항 포함) → ②체크리스트 → ③사진 → ④결과
#    신규: ①기본정보(위치/날짜/위험도 등) → ②체크리스트(사진슬롯포함) → ③사진/동영상 → ④점검내용/조치사항 → ⑤최종결과
# ══════════════════════════════════════════════════════════
print('\n[3] showCreateInspectionModal — 점검내용/조치사항 섹션 이동')

OLD_MODAL_SECTIONS = '''        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:11px">점검 내용</label>
          <textarea id="insFindings" class="form-control" rows="2" placeholder="점검 내용 및 발견된 문제점"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:11px">조치 사항</label>
          <textarea id="insCorrectiveActions" class="form-control" rows="2" placeholder="필요한 시정/조치 사항"></textarea>
        </div>
      </div>

      <!-- ② 체크리스트 섹션 -->
      <div style="padding:12px 16px 10px;border-bottom:2px solid #e8f0fa">
        <div style="font-size:11px;font-weight:700;color:#685182;margin-bottom:8px">
          <i class="fas fa-list-check mr-1"></i>점검 체크리스트
          <span style="font-size:10px;font-weight:400;color:#aaa;margin-left:4px">항목별 양호/불량/해당없음 선택</span>
        </div>
        <div id="insRegChkContainer">${_insRegChkHtml}</div>
      </div>

      <!-- ③ 사진 첨부 섹션 -->
      <div style="padding:12px 16px 10px;border-bottom:2px solid #e8f0fa">
        <div style="font-size:11px;font-weight:700;color:#1E3A5F;margin-bottom:8px">
          <i class="fas fa-camera mr-1"></i>사진 / 동영상 첨부 <span style="font-size:10px;font-weight:400;color:#aaa">(선택)</span>
        </div>
        <div class="upload-zone" onclick="document.getElementById('insPhotoInput').click()">
          <i class="fas fa-photo-video text-3xl text-gray-300 mb-1"></i>
          <p class="text-xs text-gray-400">사진 및 동영상 첨부 (선택) · 동영상 최대 500MB</p>
        </div>
        <input type="file" id="insPhotoInput" accept="image/*,video/*,.heic,.mov,.avi,.mp4,.webm,.mkv" class="hidden" multiple onchange="previewInsPhotos(this)">
        <div id="insPhotoPreview" class="photo-grid mt-2"></div>
      </div>

      <!-- ④ 점검 결과 섹션 (마지막) -->'''

NEW_MODAL_SECTIONS = '''      </div>

      <!-- ② 체크리스트 섹션 (사진 슬롯 포함) -->
      <div style="padding:12px 16px 10px;border-bottom:2px solid #e8f0fa">
        <div style="font-size:11px;font-weight:700;color:#685182;margin-bottom:8px">
          <i class="fas fa-list-check mr-1"></i>점검 체크리스트
          <span style="font-size:10px;font-weight:400;color:#aaa;margin-left:4px">항목별 양호/불량/해당없음 + 사진</span>
        </div>
        <div id="insRegChkContainer">${_insRegChkHtml}</div>
      </div>

      <!-- ③ 전체 사진 / 동영상 첨부 섹션 -->
      <div style="padding:12px 16px 10px;border-bottom:2px solid #e8f0fa">
        <div style="font-size:11px;font-weight:700;color:#1E3A5F;margin-bottom:8px">
          <i class="fas fa-photo-video mr-1"></i>전체 사진 / 동영상 첨부 <span style="font-size:10px;font-weight:400;color:#aaa">(선택)</span>
        </div>
        <div class="upload-zone" onclick="document.getElementById('insPhotoInput').click()">
          <i class="fas fa-photo-video text-3xl text-gray-300 mb-1"></i>
          <p class="text-xs text-gray-400">전체 현장 사진 및 동영상 (선택) · 동영상 최대 500MB</p>
        </div>
        <input type="file" id="insPhotoInput" accept="image/*,video/*,.heic,.mov,.avi,.mp4,.webm,.mkv" class="hidden" multiple onchange="previewInsPhotos(this)">
        <div id="insPhotoPreview" class="photo-grid mt-2"></div>
      </div>

      <!-- ④ 점검 내용 / 조치 사항 (사진 첨부 이후) -->
      <div style="padding:12px 16px 10px;border-bottom:2px solid #e8f0fa">
        <div style="font-size:11px;font-weight:700;color:#1E3A5F;margin-bottom:8px">
          <i class="fas fa-clipboard-list mr-1"></i>점검 내용 / 조치 사항
        </div>
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:11px">점검 내용</label>
          <textarea id="insFindings" class="form-control" rows="2" placeholder="점검 내용 및 발견된 문제점"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:11px">조치 사항</label>
          <textarea id="insCorrectiveActions" class="form-control" rows="2" placeholder="필요한 시정/조치 사항"></textarea>
        </div>
      </div>

      <!-- ⑤ 점검 결과 섹션 (마지막) -->'''

app, ok3 = patch(app, OLD_MODAL_SECTIONS, NEW_MODAL_SECTIONS, '3 모달 섹션 순서 변경(점검내용 이동)')

# ══════════════════════════════════════════════════════════
# 4. submitInspection: 4단계 추가 — checklist-photos 업로드
#    _insRegChkPhotoMap에서 파일 수집 → FormData → POST
#    최소 4건 사진 검증
# ══════════════════════════════════════════════════════════
print('\n[4] submitInspection — 4단계 checklist-photos 업로드 추가')

OLD_SUBMIT_CHK_SAVE = '''    // 3단계: 등록 모달의 체크리스트 결과 자동 저장
    const _regChkMap = window._insRegChkMap || {};
    const _regChkItems = [];
    if (_INS_CHECKLIST && typeof _INS_CHECKLIST !== 'undefined') {
      _INS_CHECKLIST.forEach(function(sec) {
        sec.items.forEach(function(item, i) {
          const k = sec.group + '::' + i;
          if (_regChkMap[k]) {
            _regChkItems.push({
              item_key:   k,
              item_group: sec.group,
              item_text:  item.text,
              item_basis: item.basis,
              result:     _regChkMap[k],
              memo:       null
            });
          }
        });
      });
    }
    if (_regChkItems.length > 0) {
      try {
        const _chkToken = localStorage.getItem('token');
        await fetch('/api/inspections/' + inspectionId + '/checklist-results', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, _chkToken ? { 'Authorization': 'Bearer ' + _chkToken } : {}),
          body: JSON.stringify({ items: _regChkItems })
        });
      } catch(_e) { console.warn('체크리스트 자동 저장 실패:', _e.message); }
    }
    window._insRegChkMap = {};  // 등록 후 초기화

    // workers_saved가 응답에 있으면 → 새 서버 코드 실행 중
    let workerMsg = '';
    if (workersSaved !== null) {
      if ((insResult === '불량' || insResult === '우수') && selectedWorkerIds.length > 0) {
        workerMsg = workersSaved > 0
          ? ` · 작업자 ${workersSaved}명 기록됨`
          : ` · ⚠️ 작업자 저장 실패 (서버 로그 확인 필요)`;
      }
    }
    const _chkSavedMsg = _regChkItems.length > 0 ? ` · 체크리스트 ${_regChkItems.length}항목` : '';
    toast('현장 점검이 등록되었습니다.' + (photoFiles.length > 0 ? ` (사진 ${photoFiles.length}개)` : '') + _chkSavedMsg + workerMsg);'''

NEW_SUBMIT_CHK_SAVE = '''    // 3단계: 체크리스트 결과 + 항목별 사진 업로드
    const _regChkMap = window._insRegChkMap || {};
    const _regChkPhotoMap = window._insRegChkPhotoMap || {};
    const _regChkItems = [];
    let _chkPhotoCount = 0;
    if (_INS_CHECKLIST && typeof _INS_CHECKLIST !== 'undefined') {
      let _idx = 0;
      _INS_CHECKLIST.forEach(function(sec) {
        sec.items.forEach(function(item, i) {
          const k = sec.group + '::' + i;
          if (_regChkMap[k]) {
            _regChkItems.push({
              _idx:       _idx,
              item_key:   k,
              item_group: sec.group,
              item_text:  item.text,
              item_basis: item.basis,
              result:     _regChkMap[k],
              memo:       null
            });
            _idx++;
          }
        });
      });
    }

    if (_regChkItems.length > 0) {
      try {
        // 사진 포함 여부 확인
        const _hasPhotos = _regChkItems.some(function(it) {
          return _regChkPhotoMap[it.item_key] && _regChkPhotoMap[it.item_key].file;
        });

        if (_hasPhotos) {
          // 사진이 있으면 multipart/form-data로 한 번에 전송
          const _chkFormData = new FormData();
          _chkFormData.append('items', JSON.stringify(_regChkItems.map(function(it) {
            return { _idx: it._idx, item_key: it.item_key, item_group: it.item_group, item_text: it.item_text, item_basis: it.item_basis, result: it.result };
          })));
          _regChkItems.forEach(function(it) {
            const photoEntry = _regChkPhotoMap[it.item_key];
            if (photoEntry && photoEntry.file) {
              _chkFormData.append('chk_photo_' + it._idx, photoEntry.file);
              _chkPhotoCount++;
            }
          });
          const _chkToken2 = localStorage.getItem('token');
          const _chkUpRes = await _uploadWithProgress('/api/inspections/' + inspectionId + '/checklist-photos', _chkFormData, {
            onProgress: function(pct) { _showUploadToast('체크리스트 사진', pct, _chkPhotoCount); }
          });
          _hideUploadToast();
          if (!_chkUpRes.ok) console.warn('체크리스트 사진 업로드 경고:', _chkUpRes.data?.error);
        } else {
          // 사진 없으면 JSON으로만 저장
          const _chkToken = localStorage.getItem('token');
          await fetch('/api/inspections/' + inspectionId + '/checklist-results', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, _chkToken ? { 'Authorization': 'Bearer ' + _chkToken } : {}),
            body: JSON.stringify({ items: _regChkItems })
          });
        }
      } catch(_e) { console.warn('체크리스트 저장 실패:', _e.message); }
    }
    window._insRegChkMap = {};      // 등록 후 초기화
    window._insRegChkPhotoMap = {}; // 사진 메모리 초기화

    // workers_saved가 응답에 있으면 → 새 서버 코드 실행 중
    let workerMsg = '';
    if (workersSaved !== null) {
      if ((insResult === '불량' || insResult === '우수') && selectedWorkerIds.length > 0) {
        workerMsg = workersSaved > 0
          ? ` · 작업자 ${workersSaved}명 기록됨`
          : ` · ⚠️ 작업자 저장 실패 (서버 로그 확인 필요)`;
      }
    }
    const _chkSavedMsg = _regChkItems.length > 0
      ? ` · 체크리스트 ${_regChkItems.length}항목` + (_chkPhotoCount > 0 ? `(사진 ${_chkPhotoCount}장)` : '')
      : '';
    toast('현장 점검이 등록되었습니다.' + (photoFiles.length > 0 ? ` (사진 ${photoFiles.length}개)` : '') + _chkSavedMsg + workerMsg);'''

app, ok4 = patch(app, OLD_SUBMIT_CHK_SAVE, NEW_SUBMIT_CHK_SAVE, '4 submitInspection checklist-photos 4단계')

# ══════════════════════════════════════════════════════════
# 5. submitInspection: 저장 전 최소 4건 사진 검증 추가
#    위치: API.post 호출 직전 (location 체크 뒤)
# ══════════════════════════════════════════════════════════
print('\n[5] submitInspection — 최소 4건 사진 검증 추가')

OLD_SUBMIT_VALIDATE = '''async function submitInspection() {
  const location = document.getElementById('insLocation').value;
  if (!location) { toast('점검 위치를 입력하세요.', 'error'); return; }'''

NEW_SUBMIT_VALIDATE = '''async function submitInspection() {
  const location = document.getElementById('insLocation').value;
  if (!location) { toast('점검 위치를 입력하세요.', 'error'); return; }

  // 체크리스트 사진 최소 4건 검증
  const _photoMapForValidate = window._insRegChkPhotoMap || {};
  const _photoCount = Object.keys(_photoMapForValidate).filter(function(k) {
    return _photoMapForValidate[k] && _photoMapForValidate[k].file;
  }).length;
  const _checkedCount = Object.keys(window._insRegChkMap || {}).filter(function(k) {
    return (window._insRegChkMap || {})[k] !== 'na';
  }).length;
  if (_checkedCount > 0 && _photoCount < 4) {
    toast('체크된 항목에 사진을 최소 4개 이상 첨부해 주세요. (현재: ' + _photoCount + '개)', 'error', 4000);
    return;
  }'''

app, ok5 = patch(app, OLD_SUBMIT_VALIDATE, NEW_SUBMIT_VALIDATE, '5 submitInspection 최소4건 사진 검증')

# ══════════════════════════════════════════════════════════
# 최종 저장
# ══════════════════════════════════════════════════════════
write_file(APP_JS, app)

# ══════════════════════════════════════════════════════════
# 검증
# ══════════════════════════════════════════════════════════
print('\n[6] 검증')
import subprocess

# node --check 구문 검사
result = subprocess.run(['node', '--check', APP_JS], capture_output=True, text=True)
if result.returncode == 0:
    print('  ✅ node --check: 구문 OK')
else:
    print('  ❌ node --check 오류:')
    print(result.stderr[:500])
    errors.append('node --check 실패')

app2 = read_file(APP_JS)

critical = [
    ('_insRegChkPhotoMap 초기화',       'window._insRegChkPhotoMap = {}'),
    ('_insRegChkPhotoChange 함수',       'function _insRegChkPhotoChange(input, key)'),
    ('_insRegChkPhotoRemove 함수',       'function _insRegChkPhotoRemove(btn)'),
    ('사진슬롯 ins-reg-photo-',          'ins-reg-photo-'),
    ('사진슬롯 display:none 초기',       'display:none;align-items:center;gap:8px;padding:5px 10px'),
    ('submitInspection 최소4건 검증',    '최소 4개 이상 첨부해 주세요'),
    ('checklist-photos API 호출',        'checklist-photos'),
    ('chk_photo_ FormData 전송',         'chk_photo_'),
    ('점검내용 섹션 이동',               '점검 내용 / 조치 사항'),
    ('전체사진 섹션 헤더',               '전체 사진 / 동영상 첨부'),
    ('_setInsRegChk 사진슬롯 토글',      'photoSlot.style.display = \'flex\''),
]

all_ok = True
for label, pat in critical:
    if pat in app2:
        print(f'  ✅ [{label}]')
    else:
        print(f'  ❌ [{label}] 누락!')
        errors.append(label)
        all_ok = False

# var 사용 확인 (신규 함수들)
for fn_name in ['_insRegChkPhotoChange', '_insRegChkPhotoRemove', '_setInsRegChk']:
    idx = app2.find('function ' + fn_name)
    if idx == -1:
        print(f'  ⚠️  {fn_name} 함수 미발견')
        continue
    end_idx = app2.find('\nfunction ', idx + 10)
    if end_idx == -1: end_idx = idx + 3000
    chunk = app2[idx:end_idx]
    bad = re.findall(r'\b(const|let)\s+\w+', chunk)
    if bad:
        print(f'  ⚠️  {fn_name} 내 const/let 존재: {bad[:3]}')
    else:
        print(f'  ✅ {fn_name} var 전용 사용')

print()
if errors:
    print(f'❌ 오류 {len(errors)}개: {errors}')
    sys.exit(1)
else:
    print('✅ 모든 패치 완료')
