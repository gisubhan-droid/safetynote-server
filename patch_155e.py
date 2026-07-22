#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_155e.py — 현장점검 등록 화면 개편

변경사항:
  1. showCreateInspectionModal: 체크리스트 항목 직접 포함 (22개 항목, 양호/불량/해당없음)
  2. 점검결과 위치 이동: 체크리스트 아래, 사진 첨부 후 마지막에 위치
  3. submitInspection: 체크리스트 결과를 등록 API 직후 자동 저장
  4. 체크리스트 항목은 등록 전용 독립 메모리(_insRegChkMap) 사용 (기존 _insChkResponses와 충돌 없음)
  5. 체크리스트 UI 함수 _setInsRegChk: data-* 속성 기반 (onclick 따옴표 이슈 없음)
"""

import sys

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
# 1. showCreateInspectionModal: 모달 HTML 교체
#    기본정보 → 체크리스트 → 사진 → 점검결과 순으로 재배치
# ══════════════════════════════════════════════════════════
print('\n[1] showCreateInspectionModal 모달 HTML 교체')

OLD_MODAL_HTML = '''  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
  <div class="modal" style="max-width:600px;">
    <div class="modal-header">
      <h3 class="font-bold text-lg"><i class="fas fa-search text-blue-500 mr-2"></i>현장 점검 등록</h3>
      <button onclick="this.closest('.modal-overlay').remove()" class="text-gray-400 text-xl"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">
          <i class="fas fa-hard-hat text-blue-400 mr-1"></i>진행중 작업 연결
          <span class="text-xs font-normal text-gray-400 ml-1">(선택 시 위치 자동 연동)</span>
        </label>
        ${taskSelectHtml}
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="form-group">
          <label class="form-label">점검일 <span class="text-red-500">*</span></label>
          <input id="insDateOnly" class="form-control" type="date" value="${todayStr}">
        </div>
        <div class="form-group"><label class="form-label">점검 유형</label>
          <select id="insType" class="form-control">
            <option value="routine">정기점검</option>
            <option value="special">합동점검</option>
            <option value="safety" selected>수시점검</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">점검 위치 <span class="text-red-500">*</span>
          <span class="text-xs font-normal text-gray-400 ml-1">(직접 입력 또는 GPS 버튼으로 자동 입력)</span>
        </label>
        <div class="flex gap-2">
          <input id="insLocation" class="form-control" placeholder="점검 위치를 입력하세요">
          <button type="button" id="insGpsBtn" onclick="refreshGPSInspection()"
            style="padding:6px 12px;background:#685182;color:white;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;min-width:72px">
            <i class="fas fa-location-arrow mr-1"></i>현재위치
          </button>
          <button type="button"
            onclick="showMapModal(document.getElementById('insLocation').value)"
            title="지도로 찾아가기"
            style="padding:6px 10px;background:#2DB400;color:white;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">
            <i class="fas fa-map-marker-alt"></i><span style="margin-left:3px">지도</span>
          </button>
        </div>
        <div id="insLocationStatus" class="hidden mt-2 rounded-lg px-3 py-2 text-xs flex items-center gap-2"></div>
      </div>
      <div class="form-group"><label class="form-label">위험도</label>
        <select id="insHazard" class="form-control">
          <option value="low">낮음</option>
          <option value="medium">보통</option>
          <option value="high">높음</option>
          <option value="critical">긴급</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">점검 내용</label><textarea id="insFindings" class="form-control" rows="3" placeholder="점검 내용 및 발견된 문제점"></textarea></div>
      <div class="form-group"><label class="form-label">조치 사항</label><textarea id="insCorrectiveActions" class="form-control" rows="2" placeholder="필요한 시정/조치 사항"></textarea></div>

      <!-- 점검 결과 선택 -->
      <div class="form-group">
        <label class="form-label"><i class="fas fa-clipboard-check text-green-500 mr-1"></i>점검 결과</label>
        <div class="flex gap-2 flex-wrap" id="insResultBtns">
          ${['불량','적정','양호','우수'].map((v,i) => {
            const colors = ['red','yellow','blue','green'];
            return `<button type="button" onclick="selectInsResult('${v}')"
              id="insResult_${v}"
              class="px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all border-gray-200 text-gray-500 hover:border-${colors[i]}-400"
              data-result="${v}">${v}</button>`;
          }).join('')}
        </div>
        <input type="hidden" id="insResult" value="">
      </div>
      <!-- 사유 입력 (결과 선택 시 표시) -->
      <div class="form-group hidden" id="insReasonGroup">
        <label class="form-label" id="insReasonLabel">사유 / 비고</label>
        <textarea id="insReason" class="form-control" rows="2" placeholder="선택 사유 또는 세부 내용을 입력해 주세요"></textarea>
      </div>
      <!-- 작업자 선택 (불량/우수 선택 시 표시) -->
      <div class="form-group hidden" id="insWorkerGroup">
        <label class="form-label">
          <i class="fas fa-users mr-1" id="insWorkerIcon"></i>
          <span id="insWorkerLabel">해당 작업자 선택</span>
          <span class="text-xs font-normal text-gray-400 ml-1">(다중 선택 가능)</span>
        </label>
        <div id="insWorkerList" class="border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-48 overflow-y-auto">
          <p class="text-sm text-gray-400 text-center py-2"><i class="fas fa-info-circle mr-1"></i>작업을 먼저 선택해 주세요</p>
        </div>
      </div>

      <div class="form-group"><label class="form-label">사진/동영상 (선택)</label>
        <div class="upload-zone" onclick="document.getElementById('insPhotoInput').click()">
          <i class="fas fa-photo-video text-3xl text-gray-300 mb-1"></i>
          <p class="text-xs text-gray-400">사진 및 동영상 첨부 (선택) · 동영상 최대 500MB</p>
        </div>
        <input type="file" id="insPhotoInput" accept="image/*,video/*,.heic,.mov,.avi,.mp4,.webm,.mkv" class="hidden" multiple onchange="previewInsPhotos(this)">
        <div id="insPhotoPreview" class="photo-grid mt-2"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-outline">취소</button>
      <button onclick="submitInspection()" class="btn btn-primary"><i class="fas fa-save"></i> 저장</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  markFormDirty();'''

NEW_MODAL_HTML = '''  // 등록용 체크리스트 메모리 초기화
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
  _insRegChkHtml += '</div>';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
  <div class="modal" style="max-width:640px;">
    <div class="modal-header" style="background:linear-gradient(135deg,#1E3A5F,#2d5a9e);color:white">
      <h3 class="font-bold text-lg"><i class="fas fa-clipboard-check mr-2"></i>현장 점검 등록</h3>
      <button onclick="this.closest('.modal-overlay').remove()" style="color:white;background:none;border:none;font-size:1.2rem;cursor:pointer"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:0">

      <!-- ① 기본정보 섹션 -->
      <div style="padding:14px 16px 10px;border-bottom:2px solid #e8f0fa">
        <div style="font-size:11px;font-weight:700;color:#1E3A5F;margin-bottom:10px">
          <i class="fas fa-info-circle mr-1"></i>기본 정보
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <label class="form-label" style="font-size:11px">
            <i class="fas fa-hard-hat text-blue-400 mr-1"></i>진행중 작업 연결
            <span style="font-size:10px;color:#aaa;font-weight:400;margin-left:4px">(선택 시 위치 자동 연동)</span>
          </label>
          ${taskSelectHtml}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:11px">점검일 <span class="text-red-500">*</span></label>
            <input id="insDateOnly" class="form-control" type="date" value="${todayStr}">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:11px">점검 유형</label>
            <select id="insType" class="form-control">
              <option value="routine">정기점검</option>
              <option value="special">합동점검</option>
              <option value="safety" selected>수시점검</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <label class="form-label" style="font-size:11px">점검 위치 <span class="text-red-500">*</span>
            <span style="font-size:10px;color:#aaa;font-weight:400;margin-left:4px">(직접 입력 또는 GPS)</span>
          </label>
          <div class="flex gap-2">
            <input id="insLocation" class="form-control" placeholder="점검 위치를 입력하세요">
            <button type="button" id="insGpsBtn" onclick="refreshGPSInspection()"
              style="padding:6px 10px;background:#685182;color:white;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">
              <i class="fas fa-location-arrow mr-1"></i>GPS
            </button>
            <button type="button"
              onclick="showMapModal(document.getElementById('insLocation').value)"
              style="padding:6px 10px;background:#2DB400;color:white;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">
              <i class="fas fa-map-marker-alt"></i>
            </button>
          </div>
          <div id="insLocationStatus" class="hidden mt-2 rounded-lg px-3 py-2 text-xs flex items-center gap-2"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:11px">위험도</label>
            <select id="insHazard" class="form-control">
              <option value="low">낮음</option>
              <option value="medium" selected>보통</option>
              <option value="high">높음</option>
              <option value="critical">긴급</option>
            </select>
          </div>
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

      <!-- ④ 점검 결과 섹션 (마지막) -->
      <div style="padding:12px 16px 14px">
        <div style="font-size:11px;font-weight:700;color:#1E3A5F;margin-bottom:8px">
          <i class="fas fa-clipboard-check text-green-500 mr-1"></i>최종 점검 결과
        </div>
        <div class="flex gap-2 flex-wrap" id="insResultBtns">
          ${['불량','적정','양호','우수'].map((v,i) => {
            const colors = ['red','yellow','blue','green'];
            return \`<button type="button" onclick="selectInsResult('\${v}')"
              id="insResult_\${v}"
              class="px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all border-gray-200 text-gray-500 hover:border-\${colors[i]}-400"
              data-result="\${v}">\${v}</button>\`;
          }).join('')}
        </div>
        <input type="hidden" id="insResult" value="">
        <!-- 사유 입력 -->
        <div class="form-group hidden mt-3" id="insReasonGroup" style="margin-bottom:8px">
          <label class="form-label" id="insReasonLabel" style="font-size:11px">사유 / 비고</label>
          <textarea id="insReason" class="form-control" rows="2" placeholder="선택 사유 또는 세부 내용을 입력해 주세요"></textarea>
        </div>
        <!-- 작업자 선택 -->
        <div class="form-group hidden mt-2" id="insWorkerGroup" style="margin-bottom:0">
          <label class="form-label" style="font-size:11px">
            <i class="fas fa-users mr-1" id="insWorkerIcon"></i>
            <span id="insWorkerLabel">해당 작업자 선택</span>
            <span class="text-xs font-normal text-gray-400 ml-1">(다중 선택 가능)</span>
          </label>
          <div id="insWorkerList" class="border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-48 overflow-y-auto">
            <p class="text-sm text-gray-400 text-center py-2"><i class="fas fa-info-circle mr-1"></i>작업을 먼저 선택해 주세요</p>
          </div>
        </div>
      </div>

    </div>
    <div class="modal-footer" style="border-top:2px solid #e8f0fa">
      <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-outline">취소</button>
      <button onclick="submitInspection()" class="btn btn-primary" style="background:#1E3A5F">
        <i class="fas fa-save mr-1"></i> 저장
      </button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  markFormDirty();'''

app, ok1 = patch(app, OLD_MODAL_HTML, NEW_MODAL_HTML, '1 showCreateInspectionModal 모달 HTML')

# ══════════════════════════════════════════════════════════
# 2. submitInspection: 저장 후 체크리스트 자동 저장 추가
# ══════════════════════════════════════════════════════════
print('\n[2] submitInspection: 체크리스트 자동 저장 추가')

# 기존 저장 성공 후 toast 직전에 체크리스트 저장 로직 추가
OLD_SUBMIT_AFTER = '''    // 2단계: 사진이 있으면 파일 서버에 별도 업로드
    if (photoFiles.length > 0) {
      const formData = new FormData();
      formData.append('inspection_id', inspectionId);
      for (const file of photoFiles) formData.append('photos', file);
      const token = localStorage.getItem('token');
      const uploadResult = await _uploadWithProgress('/api/inspection-photos', formData, {
        onProgress: (pct, loadedMB, totalMB) => {
          _showUploadToast('점검 사진', pct, photoFiles.length);
        }
      });
      _hideUploadToast();
      if (!uploadResult.ok) console.warn('사진 업로드 경고:', uploadResult.data?.error);
    }

    // workers_saved가 응답에 있으면 → 새 서버 코드 실행 중
    let workerMsg = '';
    if (workersSaved !== null) {
      if ((insResult === '불량' || insResult === '우수') && selectedWorkerIds.length > 0) {
        workerMsg = workersSaved > 0
          ? ` · 작업자 ${workersSaved}명 기록됨`
          : ` · ⚠️ 작업자 저장 실패 (서버 로그 확인 필요)`;
      }
    }
    toast('현장 점검이 등록되었습니다.' + (photoFiles.length > 0 ? ` (사진 ${photoFiles.length}개)` : '') + workerMsg);'''

NEW_SUBMIT_AFTER = '''    // 2단계: 사진이 있으면 파일 서버에 별도 업로드
    if (photoFiles.length > 0) {
      const formData = new FormData();
      formData.append('inspection_id', inspectionId);
      for (const file of photoFiles) formData.append('photos', file);
      const token = localStorage.getItem('token');
      const uploadResult = await _uploadWithProgress('/api/inspection-photos', formData, {
        onProgress: (pct, loadedMB, totalMB) => {
          _showUploadToast('점검 사진', pct, photoFiles.length);
        }
      });
      _hideUploadToast();
      if (!uploadResult.ok) console.warn('사진 업로드 경고:', uploadResult.data?.error);
    }

    // 3단계: 등록 모달의 체크리스트 결과 자동 저장
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

app, ok2 = patch(app, OLD_SUBMIT_AFTER, NEW_SUBMIT_AFTER, '2 submitInspection 체크리스트 저장')

# ══════════════════════════════════════════════════════════
# 3. _setInsRegChkByEl / _setInsRegChk 신규 함수 추가
#    _toggleInsChkTab 바로 앞에 삽입
# ══════════════════════════════════════════════════════════
print('\n[3] _setInsRegChkByEl / _setInsRegChk 신규 함수 추가')

OLD_TOGGLE_ANCHOR = '''function _toggleInsChkTab(insId) {'''

NEW_TOGGLE_ANCHOR = '''// ─── 등록 모달 전용 체크리스트 핸들러 ──────────────────────────────────────
// data-* 속성 기반 (onclick 따옴표 중첩 파싱 오류 방지)
function _setInsRegChkByEl(btn) {
  var key = btn.getAttribute('data-key');
  var val = btn.getAttribute('data-val');
  _setInsRegChk(key, val, btn);
}

function _setInsRegChk(key, val, btn) {
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
}

function _toggleInsChkTab(insId) {'''

app, ok3 = patch(app, OLD_TOGGLE_ANCHOR, NEW_TOGGLE_ANCHOR, '3 _setInsRegChkByEl 함수 추가')

# ══════════════════════════════════════════════════════════
# 최종 저장
# ══════════════════════════════════════════════════════════
write_file(APP_JS, app)

# ══════════════════════════════════════════════════════════
# 4. 검증
# ══════════════════════════════════════════════════════════
print('\n[4] 검증')
import re
app2 = read_file(APP_JS)

critical = [
    ('등록모달 체크리스트 섹션',  '_insRegChkHtml'),
    ('_INS_CHECKLIST forEach in modal', '_INS_CHECKLIST.forEach(function(sec)'),
    ('_setInsRegChkByEl 함수',   'function _setInsRegChkByEl(btn)'),
    ('_setInsRegChk 함수',       'function _setInsRegChk(key, val, btn)'),
    ('submitInspection 3단계',   '// 3단계: 등록 모달의 체크리스트 결과 자동 저장'),
    ('_insRegChkMap 초기화',     'window._insRegChkMap = {};  // 등록 후 초기화'),
    ('체크리스트 저장 fetch',     '/checklist-results'),
    ('최종 점검 결과 섹션',      '최종 점검 결과'),
    ('체크리스트 섹션 헤더',     '점검 체크리스트'),
    ('사진첨부 섹션 헤더',       '사진 / 동영상 첨부'),
]
all_ok = True
for label, pat in critical:
    if pat in app2:
        print(f'  ✅ [{label}]')
    else:
        print(f'  ❌ [{label}] 누락!')
        errors.append(label)
        all_ok = False

# var 사용 확인 (submitInspection 내)
start = app2.find('async function submitInspection()')
end   = app2.find('\nasync function showInspectionDetail', start)
if end == -1: end = start + 8000
chunk = app2[start:end]
bad_in_submit = re.findall(r'\b(const|let)\s+\w+', chunk)
if bad_in_submit:
    print(f'  ⚠️  submitInspection 내 const/let 존재 (확인 필요): {bad_in_submit[:5]}')
else:
    print('  ✅ submitInspection 내 var만 사용')

# _openPrintOverlay 사용 여부 확인 (printInspectionReport 에는 없어야)
if '_openPrintOverlay(fullHtml)' in app2:
    print('  ⚠️  _openPrintOverlay(fullHtml) 아직 남아있음 (확인 필요)')
else:
    print('  ✅ _openPrintOverlay(fullHtml) 없음 (window.open 방식)')

print()
if errors:
    print(f'❌ 오류 {len(errors)}개: {errors}')
    sys.exit(1)
else:
    print('✅ 모든 패치 완료')
