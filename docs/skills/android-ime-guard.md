# SKILL: android-ime-guard

> Android WebView(Capacitor) 환경에서 한글 IME 입력이 깨지는 문제를 완전히 해결하는 패턴.
> BUG-IME + BUG-168 수정 경험에서 추출. 세션 86~87 (2026-07-26) 현장 검증 완료.

---

## 언제 사용하는가

다음 증상이 하나라도 있으면 이 스킬을 적용한다:

- Capacitor 기반 Android 앱에서 한글 입력 시 `ㅎ`, `ㅏ`, `ㄴ` 처럼 자음/모음이 분리됨
- 두 번째 글자를 입력해야 첫 번째 글자가 화면에 나타남
- `compositionstart` / `compositionend` 이벤트가 발생하지 않음
- `oninput` 핸들러가 조합 중간값을 읽어 검색/필터가 오동작함
- 모바일 웹(브라우저)에서는 정상인데 APK(WebView)에서만 버그 발생

---

## 근본 원인

```
Capacitor 기본값: captureInput: true
  ↓
CapacitorWebView.onCreateInputConnection()
  → BaseInputConnection(this, false)
     ※ false = non-composing mode
     ※ Android IME가 한글 조합 중간 상태를 WebView에 전달하지 않음
  ↓
compositionstart / compositionend 이벤트 미발생
  ↓
한글 자음/모음 분리 입력, oninput 중간값 읽힘
```

| captureInput | InputConnection | 한글 조합 | compositionstart/end |
|---|---|---|---|
| `true` (기본) | BaseInputConnection(false) | ❌ 불가 | ❌ 미발생 |
| `false` (수정) | super.onCreateInputConnection() | ✅ 정상 | ✅ 발생 |

---

## 수정 절차 (3단계)

### STEP 1 — capacitor.config.json 수정 (APK 레포)

```json
{
  "appId": "com.your.app",
  "appName": "YourApp",
  "android": {
    "captureInput": false
  }
}
```

> ⚠️ 이 수정은 APK 재빌드가 필요하다. 서버 코드만 수정해서는 효과 없음.
> ⚠️ `captureInput: true` 로 되돌리지 말 것 — 한글 IME 전면 파괴됨.

---

### STEP 2 — app.js 최상단에 전역 IME 가드 추가

파일 가장 첫 줄(다른 코드보다 먼저)에 삽입:

```javascript
// ── IME 가드: Android WebView 한글 조합 상태 전역 관리 ──
var _imeComposing = false;
document.addEventListener('compositionstart', function() {
  _imeComposing = true;
});
document.addEventListener('compositionend', function() {
  _imeComposing = false;
  // 조합 완료 시 input 이벤트 강제 발화 → 검색/필터 최종값 처리
  var ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
    ae.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
```

> ⚠️ RULE-001 적용 프로젝트: `var` 전용. `const` / `let` 금지.

---

### STEP 3 — 한글 입력 가능한 input 전수 점검

#### 3-A. input 속성 3개 추가 (모든 한글 입력 필드)

```html
<!-- Before -->
<input id="searchInput" class="form-control" placeholder="검색">

<!-- After -->
<input id="searchInput" type="text" autocomplete="off" inputmode="text"
       class="form-control" placeholder="검색">
```

필수 속성 3개:
| 속성 | 값 | 이유 |
|---|---|---|
| `type` | `"text"` | 미명시 시 브라우저/WebView가 타입 유추 실패 가능 |
| `autocomplete` | `"off"` | 자동완성 팝업이 IME 조합 방해 |
| `inputmode` | `"text"` | Android 소프트키보드 모드 명시 |

#### 3-B. oninput 핸들러 — IME 가드 추가

```html
<!-- Before: 조합 중간값도 즉시 실행됨 -->
<input oninput="searchItems(this.value)">

<!-- After: 조합 완료 후에만 실행 -->
<input oninput="if(!_imeComposing) searchItems(this.value)">
```

#### 3-C. Enter 키 핸들러 — isComposing 가드 추가

```html
<!-- Before: 한글 조합 중 Enter 누르면 조합 확정과 검색이 동시 실행 -->
<input onkeydown="if(event.key==='Enter') doSearch(this.value)">

<!-- After: 조합 중 Enter는 무시, 조합 완료 후 Enter만 실행 -->
<input onkeydown="if(event.key==='Enter' && !event.isComposing) doSearch(this.value)">
```

---

## 체크리스트

새 검색/입력 필드 추가 시 반드시 확인:

- [ ] `capacitor.config.json` — `captureInput: false` 확인
- [ ] `app.js` 최상단 — `_imeComposing` 전역 가드 존재 확인
- [ ] 새 `<input>` — `type="text" autocomplete="off" inputmode="text"` 3개 속성
- [ ] `oninput` 핸들러 — `if(!_imeComposing)` 가드
- [ ] Enter `onkeydown` 핸들러 — `&&!event.isComposing` 가드
- [ ] APK 재빌드 후 현장 테스트

---

## 실제 적용 예시 (SafetyNOTE 검색 input 8개)

```javascript
// 공사 키워드 검색
'<input id="conKeyword" type="text" autocomplete="off" inputmode="text" ... ' +
'onkeydown="if(event.key===\'Enter\'&&!event.isComposing){...}" ... >'

// 작업 키워드 검색
'<input id="keywordInput" type="text" autocomplete="off" inputmode="text" ... ' +
'onkeydown="if(event.key===\'Enter\'&&!event.isComposing){...}" ... >'

// 내 작업 검색
'<input id="myTasksSearchInput" type="text" autocomplete="off" inputmode="text" ... ' +
'oninput="if(!_imeComposing) applyMyTasksSearch(this.value)" ... >'

// FCM 사용자 검색
'<input id="fcm-user-search" type="text" autocomplete="off" inputmode="text" ... ' +
'oninput="if(!_imeComposing) _fcmRenderList()" ... >'
```

---

## 관련 버그 이력

| BUG ID | 증상 | 수정 | 커밋 |
|---|---|---|---|
| BUG-IME | Android WebView 한글 IME 근본 원인 | `captureInput: false` | `a172a6f` (android) |
| BUG-166 | photoCaption 한글 입력 지연 | `type="text"` + compositionstart/end | `ffc0b30` |
| BUG-168 | 검색 input 자음/모음 분리 | 전역 `_imeComposing` 가드 + 8개 input | `26fba0f` |

---

## 주의사항

1. **APK 재빌드 필수**: `captureInput` 변경은 JavaScript/서버 수정과 달리 APK를 다시 빌드해야 반영됨
2. **전역 가드 위치**: `_imeComposing` 선언은 반드시 `app.js` 최상단 — 다른 이벤트 핸들러보다 먼저 등록
3. **Capacitor 업그레이드 시**: `capacitor.config.json`의 `captureInput` 값 재확인 필수
4. **모바일 웹 vs APK**: 모바일 웹(Safari/Chrome)은 `captureInput` 무관, 브라우저 자체 IME 사용 → 증상 없음
