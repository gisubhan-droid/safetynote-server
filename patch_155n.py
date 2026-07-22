#!/usr/bin/env python3
# patch_155n.py
# 세션155n — 전체 KST(UTC+9) 시간 표현 일괄 통일
#
# ■ app.js 변경
#   PATCH-A1: getKSTNow() 함수 블록 직후에 getKSTYear() / getKSTMonth() 헬퍼 2개 추가
#   PATCH-A2: 전역 초기값 / 함수 내 now.getFullYear()/getMonth() → getKSTYear()/getKSTMonth()
#   PATCH-A3: new Date().toISOString().slice(0,10) → getKSTDate()
#   PATCH-A4: 날짜 계산 후 .toISOString().slice(0,10) → KST 보정 헬퍼 _kstDateOf(d)
#
# ■ node-server.ts 변경
#   PATCH-B1: 파일 상단(첫 번째 함수 전)에 kstDateStr()/kstNowStr() 헬퍼 삽입
#   PATCH-B2: new Date().toISOString() → kstNowStr()
#   PATCH-B3: new Date().toISOString().slice(0,10) → kstDateStr()
#   PATCH-B4: 이번 주 월요일 계산 UTC → KST 보정
#   PATCH-B5: scheduleDailyBackup getHours → KST 기준
#
# 주의: var 전용(app.js), 백틱 중첩 없음

import sys
import re

APP_JS   = '/home/user/webapp/public/static/app.js'
NODE_TS  = '/home/user/webapp/node-server.ts'

# ═══════════════════════════════════════════════════════════════════════════════
# app.js 패치
# ═══════════════════════════════════════════════════════════════════════════════
with open(APP_JS, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)
print(f'[INFO] app.js 원본 크기: {orig_len:,} 바이트')

# ─── PATCH-A1: getKSTYear / getKSTMonth 헬퍼 삽입 ───────────────────────────
# getKSTDate() 함수 블록 직후 삽입 (이미 getKSTNow가 존재, getKSTDate 다음)
A1_ANCHOR = (
    "// KST 기준 오늘 날짜 (YYYY-MM-DD)\n"
    "function getKSTDate() {\n"
    "  return getKSTNow().toISOString().split('T')[0];\n"
    "}"
)
A1_REPLACE = (
    "// KST 기준 오늘 날짜 (YYYY-MM-DD)\n"
    "function getKSTDate() {\n"
    "  return getKSTNow().toISOString().split('T')[0];\n"
    "}\n"
    "\n"
    "// KST 기준 현재 연도 (new Date().getFullYear() 대체)\n"
    "function getKSTYear() {\n"
    "  return parseInt(getKSTNow().toISOString().slice(0, 4), 10);\n"
    "}\n"
    "\n"
    "// KST 기준 현재 월 1~12 (new Date().getMonth()+1 대체)\n"
    "function getKSTMonth() {\n"
    "  return parseInt(getKSTNow().toISOString().slice(5, 7), 10);\n"
    "}\n"
    "\n"
    "// KST 기준 Date 객체를 YYYY-MM-DD 문자열로 변환\n"
    "// (Date 계산 후 .toISOString().slice(0,10) 대체 — UTC 기준 오류 방지)\n"
    "function _kstDateOf(dateObj) {\n"
    "  var kst = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);\n"
    "  return kst.toISOString().slice(0, 10);\n"
    "}"
)

if A1_ANCHOR not in src:
    print('[ERROR] PATCH-A1 앵커 없음')
    sys.exit(1)
src = src.replace(A1_ANCHOR, A1_REPLACE, 1)
print('[OK] PATCH-A1 — getKSTYear/getKSTMonth/_kstDateOf 헬퍼 삽입')

# ─── PATCH-A2: new Date().getFullYear() → getKSTYear() ─────────────────────
count_A2a = src.count('new Date().getFullYear()')
src = src.replace('new Date().getFullYear()', 'getKSTYear()')
print(f'[OK] PATCH-A2a — new Date().getFullYear() → getKSTYear() ({count_A2a}곳)')

# new Date().getMonth()+1 → getKSTMonth()
count_A2b = src.count('new Date().getMonth()+1')
src = src.replace('new Date().getMonth()+1', 'getKSTMonth()')
print(f'[OK] PATCH-A2b — new Date().getMonth()+1 → getKSTMonth() ({count_A2b}곳)')

# new Date().getMonth() + 1 (공백 포함)
count_A2c = src.count('new Date().getMonth() + 1')
src = src.replace('new Date().getMonth() + 1', 'getKSTMonth()')
print(f'[OK] PATCH-A2c — new Date().getMonth() + 1 → getKSTMonth() ({count_A2c}곳)')

# ─── PATCH-A3: now.getFullYear() / now.getMonth() 패턴 ──────────────────────
# 이 패턴들은 함수 내부에서 const now = new Date() 선언 후 사용하는 경우
# renderDashboard, renderStatsPage, 등 — now를 getKSTNow()로 교체

A3_PATCHES = [
    # renderDashboard (line ~5443)
    (
        "  const now = new Date();\n"
        "  if (!_dashStart) {\n"
        "    _dashYear  = now.getFullYear();\n"
        "    _dashMonth = now.getMonth() + 1;\n"
        "  }",
        "  var now = getKSTNow();\n"
        "  if (!_dashStart) {\n"
        "    _dashYear  = getKSTYear();\n"
        "    _dashMonth = getKSTMonth();\n"
        "  }"
    ),
    # renderStatsPage (line ~18886)
    (
        "  const now = new Date();\n"
        "  const year = now.getFullYear();\n"
        "  const month = (now.getMonth() + 1).toString().padStart(2, '0');",
        "  var now = getKSTNow();\n"
        "  var year = getKSTYear();\n"
        "  var month = String(getKSTMonth()).padStart(2, '0');"
    ),
    # showCompletedTasksModal (line ~19727)
    (
        "  const now = new Date();\n"
        "  const y = year || now.getFullYear();\n"
        "  const m = month || (now.getMonth() + 1).toString().padStart(2, '0');",
        "  var now = getKSTNow();\n"
        "  var y = year || getKSTYear();\n"
        "  var m = month || String(getKSTMonth()).padStart(2, '0');"
    ),
    # renderInspectionStatsPage (line ~20097)
    (
        "  const now = new Date();\n"
        "  const year = now.getFullYear();\n"
        "  const month = (now.getMonth() + 1).toString().padStart(2, '0');",
        "  var now = getKSTNow();\n"
        "  var year = getKSTYear();\n"
        "  var month = String(getKSTMonth()).padStart(2, '0');"
    ),
    # showInspectionListModal (line ~20411)
    (
        "  const now = new Date();\n"
        "  const y = year || now.getFullYear();\n"
        "  const m = month || String(now.getMonth()+1).padStart(2,'0');",
        "  var now = getKSTNow();\n"
        "  var y = year || getKSTYear();\n"
        "  var m = month || String(getKSTMonth()).padStart(2,'0');"
    ),
    # renderWorkerSafetyStatsPage (line ~30910)
    (
        "  const now = new Date();\n"
        "  const curYear  = now.getFullYear();\n"
        "  const curMonth = now.getMonth() + 1;\n"
        "  const curQ     = Math.ceil(curMonth / 3);",
        "  var now = getKSTNow();\n"
        "  var curYear  = getKSTYear();\n"
        "  var curMonth = getKSTMonth();\n"
        "  var curQ     = Math.ceil(curMonth / 3);"
    ),
]

for old, new in A3_PATCHES:
    if old not in src:
        print(f'[WARN] PATCH-A3 블록 없음 (스킵): {repr(old[:60])}')
    else:
        src = src.replace(old, new, 1)
        print(f'[OK] PATCH-A3 — {repr(old[:60])} 교체')

# ─── PATCH-A4: 주간계산 now = new Date() + getFullYear/getMonth 패턴들 ──────

# renderFieldReportPage 주간계산 (line ~35757)
A4_WEEK_OLD = (
    "    // 주간 기본값 계산\n"
    "    const _nowWeekStr = (() => {\n"
    "      const now = new Date();\n"
    "      const jan4 = new Date(now.getFullYear(), 0, 4);\n"
    "      const wk = Math.ceil(((now - new Date(now.getFullYear(),0,1)) / 86400000 + new Date(now.getFullYear(),0,1).getDay() + 1) / 7);\n"
    "      return `${now.getFullYear()}-W${String(wk).padStart(2,'0')}`;\n"
    "    })();\n"
    "    const displayWeekVal = savedFrWVal || _nowWeekStr;\n"
    "    const _curQ = Math.ceil((new Date().getMonth()+1)/3);"
)
A4_WEEK_NEW = (
    "    // 주간 기본값 계산 (KST 기준)\n"
    "    var _nowWeekStr = (function() {\n"
    "      var now = getKSTNow();\n"
    "      var yr  = getKSTYear();\n"
    "      var jan4 = new Date(yr, 0, 4);\n"
    "      var wk = Math.ceil(((now - new Date(yr,0,1)) / 86400000 + new Date(yr,0,1).getDay() + 1) / 7);\n"
    "      return yr + '-W' + String(wk).padStart(2,'0');\n"
    "    })();\n"
    "    var displayWeekVal = savedFrWVal || _nowWeekStr;\n"
    "    var _curQ = Math.ceil(getKSTMonth()/3);"
)
if A4_WEEK_OLD not in src:
    print('[WARN] PATCH-A4 주간계산 블록 없음 (스킵)')
else:
    src = src.replace(A4_WEEK_OLD, A4_WEEK_NEW, 1)
    print('[OK] PATCH-A4 — renderFieldReportPage 주간계산 KST 교체')

# 공사통계 주간 초기값 계산 (line ~38776)
A4_CS_OLD = (
    "  let _csWeekStart = (() => {\n"
    "    const now = new Date();\n"
    "    const d   = now.getDay();\n"
    "    const monday = new Date(now);\n"
    "    monday.setDate(now.getDate() - (d === 0 ? 6 : d - 1));\n"
    "    return monday.toISOString().slice(0, 10);\n"
    "  })();"
)
A4_CS_NEW = (
    "  var _csWeekStart = (function() {\n"
    "    var now = getKSTNow();\n"
    "    var d   = now.getUTCDay();\n"
    "    var monday = new Date(now.getTime());\n"
    "    monday.setUTCDate(now.getUTCDate() - (d === 0 ? 6 : d - 1));\n"
    "    return monday.toISOString().slice(0, 10);\n"
    "  })();"
)
if A4_CS_OLD not in src:
    print('[WARN] PATCH-A4 공사통계 주간 블록 없음 (스킵)')
else:
    src = src.replace(A4_CS_OLD, A4_CS_NEW, 1)
    print('[OK] PATCH-A4 — 공사통계 주간 초기값 KST 교체')

# ─── PATCH-A5: new Date().toISOString().slice(0,10) → getKSTDate() ───────────
# (직접 new Date() 사용하는 것만 — 변수 거치는 것은 아래서 처리)
count_A5 = src.count("new Date().toISOString().slice(0,10)")
src = src.replace("new Date().toISOString().slice(0,10)", "getKSTDate()")
print(f'[OK] PATCH-A5a — new Date().toISOString().slice(0,10) → getKSTDate() ({count_A5}곳)')

# 공지/완료예정일 +7일 계산 (line ~5073)
A5_PLUS7_OLD = (
    "(() => { const d=new Date(); d.setDate(d.getDate()+7); return d.toISOString().slice(0,10); })()"
)
A5_PLUS7_NEW = (
    "(function() { var d=getKSTNow(); d.setUTCDate(d.getUTCDate()+7); return d.toISOString().slice(0,10); })()"
)
if A5_PLUS7_OLD not in src:
    print('[WARN] PATCH-A5b +7일 패턴 없음 (스킵)')
else:
    src = src.replace(A5_PLUS7_OLD, A5_PLUS7_NEW, 1)
    print('[OK] PATCH-A5b — 완료예정일 +7일 KST 교체')

# ─── PATCH-A6: 날짜계산 변수.toISOString().slice(0,10) → _kstDateOf(변수) ─────
# 이미 KST 보정된 곳(getKSTNow 기반) 제외, 순수 Date 계산 후 toISOString 하는 곳

# 공사비 보고서 주간/분기/월간 날짜 범위 계산 (line ~35688~35699)
A6_FR_OLD = (
    "    from = startOfWeek.toISOString().slice(0,10);\n"
    "    to   = endOfWeek.toISOString().slice(0,10);\n"
    "  } else if (mode === 'month' && mVal) {\n"
    "    from = mVal + '-01';\n"
    "    const d = new Date(mVal + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "    to = d.toISOString().slice(0,10);\n"
    "  } else if (mode === 'quarter' && qVal && yVal) {\n"
    "    const q = parseInt(qVal);\n"
    "    from = `${yVal}-${String((q-1)*3+1).padStart(2,'0')}-01`;\n"
    "    const d = new Date(`${yVal}-${String(q*3).padStart(2,'0')}-01`);\n"
    "    d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "    to = d.toISOString().slice(0,10);"
)
A6_FR_NEW = (
    "    from = _kstDateOf(startOfWeek);\n"
    "    to   = _kstDateOf(endOfWeek);\n"
    "  } else if (mode === 'month' && mVal) {\n"
    "    from = mVal + '-01';\n"
    "    var d = new Date(mVal + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "    to = _kstDateOf(d);\n"
    "  } else if (mode === 'quarter' && qVal && yVal) {\n"
    "    var q = parseInt(qVal);\n"
    "    from = yVal + '-' + String((q-1)*3+1).padStart(2,'0') + '-01';\n"
    "    var d = new Date(yVal + '-' + String(q*3).padStart(2,'00') + '-01');\n"
    "    d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "    to = _kstDateOf(d);"
)
if A6_FR_OLD not in src:
    print('[WARN] PATCH-A6 공사비보고서 날짜범위 없음 (스킵)')
else:
    src = src.replace(A6_FR_OLD, A6_FR_NEW, 1)
    print('[OK] PATCH-A6 — 공사비보고서 날짜범위 _kstDateOf 교체')

# 공사통계 월간/분기 날짜 범위 (line ~39307)
A6_VS_M_OLD = (
    "      const d = new Date(vsMVal + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      vsToDate = d.toISOString().slice(0,10);"
)
A6_VS_M_NEW = (
    "      var d = new Date(vsMVal + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      vsToDate = _kstDateOf(d);"
)
if A6_VS_M_OLD not in src:
    print('[WARN] PATCH-A6 공사통계 월간 없음 (스킵)')
else:
    src = src.replace(A6_VS_M_OLD, A6_VS_M_NEW, 1)
    print('[OK] PATCH-A6 — 공사통계 월간 vsToDate _kstDateOf 교체')

A6_VS_Q_OLD = (
    "      const d = new Date(`${vsYVal}-${endM}-01`); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      vsToDate = d.toISOString().slice(0,10);"
)
A6_VS_Q_NEW = (
    "      var d = new Date(vsYVal + '-' + endM + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      vsToDate = _kstDateOf(d);"
)
if A6_VS_Q_OLD not in src:
    print('[WARN] PATCH-A6 공사통계 분기 없음 (스킵)')
else:
    src = src.replace(A6_VS_Q_OLD, A6_VS_Q_NEW, 1)
    print('[OK] PATCH-A6 — 공사통계 분기 vsToDate _kstDateOf 교체')

# 공사통계 월간/분기 to 계산 (line ~39800, 39806)
A6_VS2_M_OLD = (
    "      const d = new Date(mv + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      to = d.toISOString().slice(0,10);"
)
A6_VS2_M_NEW = (
    "      var d = new Date(mv + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      to = _kstDateOf(d);"
)
if A6_VS2_M_OLD not in src:
    print('[WARN] PATCH-A6 공사통계 to 월간 없음 (스킵)')
else:
    src = src.replace(A6_VS2_M_OLD, A6_VS2_M_NEW, 1)
    print('[OK] PATCH-A6 — 공사통계 to 월간 _kstDateOf 교체')

A6_VS2_Q_OLD = (
    "      const d = new Date(`${y}-${String(q*3).padStart(2,'0')}-01`); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      to = d.toISOString().slice(0,10);"
)
A6_VS2_Q_NEW = (
    "      var d = new Date(y + '-' + String(q*3).padStart(2,'0') + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      to = _kstDateOf(d);"
)
if A6_VS2_Q_OLD not in src:
    print('[WARN] PATCH-A6 공사통계 to 분기 없음 (스킵)')
else:
    src = src.replace(A6_VS2_Q_OLD, A6_VS2_Q_NEW, 1)
    print('[OK] PATCH-A6 — 공사통계 to 분기 _kstDateOf 교체')

# 근로자통계 월간/분기 (line ~40397)
A6_WS_M_OLD = (
    "      const d = new Date(mVal + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      toDate = d.toISOString().slice(0,10);"
)
A6_WS_M_NEW = (
    "      var d = new Date(mVal + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      toDate = _kstDateOf(d);"
)
if A6_WS_M_OLD not in src:
    print('[WARN] PATCH-A6 근로자통계 toDate 월간 없음 (스킵)')
else:
    src = src.replace(A6_WS_M_OLD, A6_WS_M_NEW, 1)
    print('[OK] PATCH-A6 — 근로자통계 toDate 월간 _kstDateOf 교체')

A6_WS_Q_OLD = (
    "      const d = new Date(`${yVal}-${endM}-01`); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      toDate = d.toISOString().slice(0,10);"
)
A6_WS_Q_NEW = (
    "      var d = new Date(yVal + '-' + endM + '-01'); d.setMonth(d.getMonth()+1); d.setDate(0);\n"
    "      toDate = _kstDateOf(d);"
)
if A6_WS_Q_OLD not in src:
    print('[WARN] PATCH-A6 근로자통계 toDate 분기 없음 (스킵)')
else:
    src = src.replace(A6_WS_Q_OLD, A6_WS_Q_NEW, 1)
    print('[OK] PATCH-A6 — 근로자통계 toDate 분기 _kstDateOf 교체')

# 공사통계 주간 이동 (line ~38826)
A6_CS_W_OLD = "    _csWeekStart = d.toISOString().slice(0, 10);"
A6_CS_W_NEW = "    _csWeekStart = _kstDateOf(d);"
if A6_CS_W_OLD not in src:
    print('[WARN] PATCH-A6 공사통계 _csWeekStart 이동 없음 (스킵)')
else:
    src = src.replace(A6_CS_W_OLD, A6_CS_W_NEW, 1)
    print('[OK] PATCH-A6 — 공사통계 _csWeekStart 이동 _kstDateOf 교체')

# 공사통계 fmt 함수 (line ~38762)
A6_FMT_OLD = "  const fmt = d => d.toISOString().slice(0, 10);"
A6_FMT_NEW = "  var fmt = function(d) { return _kstDateOf(d); };"
if A6_FMT_OLD not in src:
    print('[WARN] PATCH-A6 공사통계 fmt 함수 없음 (스킵)')
else:
    src = src.replace(A6_FMT_OLD, A6_FMT_NEW, 1)
    print('[OK] PATCH-A6 — 공사통계 fmt 함수 _kstDateOf 교체')

# 공사통계 this-week monday (line ~38781)
A6_MSTR_OLD = "    return monday.toISOString().slice(0, 10);"
A6_MSTR_NEW = "    return _kstDateOf(monday);"
if A6_MSTR_OLD not in src:
    print('[WARN] PATCH-A6 공사통계 this-week monday 없음 (스킵)')
else:
    src = src.replace(A6_MSTR_OLD, A6_MSTR_NEW, 1)
    print('[OK] PATCH-A6 — 공사통계 this-week monday _kstDateOf 교체')

# 일별통계 now 변수 (line ~19213 근처)
A6_DAILY_OLD = (
    '          <input id="dailyDate" type="date" value="${now.toISOString().split(\'T\')[0]}" class="form-control w-40">'
)
A6_DAILY_NEW = (
    '          <input id="dailyDate" type="date" value="${getKSTDate()}" class="form-control w-40">'
)
if A6_DAILY_OLD not in src:
    print('[WARN] PATCH-A6 dailyDate now.toISOString 없음 (스킵)')
else:
    src = src.replace(A6_DAILY_OLD, A6_DAILY_NEW, 1)
    print('[OK] PATCH-A6 — dailyDate getKSTDate() 교체')

with open(APP_JS, 'w', encoding='utf-8') as f:
    f.write(src)
new_len = len(src)
print(f'[OK] app.js 저장 완료. 크기: {new_len:,} ({new_len-orig_len:+,} 바이트)')

# ═══════════════════════════════════════════════════════════════════════════════
# node-server.ts 패치
# ═══════════════════════════════════════════════════════════════════════════════
with open(NODE_TS, 'r', encoding='utf-8') as f:
    ts = f.read()

orig_ts_len = len(ts)
print(f'\n[INFO] node-server.ts 원본 크기: {orig_ts_len:,} 바이트')

# ─── PATCH-B1: kstDateStr / kstNowStr 헬퍼 삽입 ─────────────────────────────
# fmtDateStr 함수 직전에 삽입
B1_ANCHOR = "function fmtDateStr(d: string | null | undefined): string {"
B1_INSERT = (
    "// KST(UTC+9) 기준 현재 날짜 문자열 (YYYY-MM-DD)\n"
    "function kstDateStr(): string {\n"
    "  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)\n"
    "}\n"
    "\n"
    "// KST(UTC+9) 기준 현재 datetime 문자열 (YYYY-MM-DD HH:MM:SS)\n"
    "function kstNowStr(): string {\n"
    "  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)\n"
    "}\n"
    "\n"
)
if B1_ANCHOR not in ts:
    print('[ERROR] PATCH-B1 앵커 없음')
    sys.exit(1)
ts = ts.replace(B1_ANCHOR, B1_INSERT + B1_ANCHOR, 1)
print('[OK] PATCH-B1 — kstDateStr/kstNowStr 헬퍼 삽입')

# ─── PATCH-B2: new Date().toISOString().slice(0,10) → kstDateStr() ──────────
B2_PATCHES = [
    # fmtDateStr fallback (line ~2909)
    (
        "  if (!d) return new Date().toISOString().slice(0, 10)",
        "  if (!d) return kstDateStr()"
    ),
    # TBM PDF 파일명 (line ~3084)
    (
        "    const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '')",
        "    const dateStr  = kstDateStr().replace(/-/g, '')"
    ),
    # 백업 스탬프 (line ~6846)
    (
        "    const stamp   = new Date().toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD",
        "    const stamp   = kstDateStr().replace(/-/g, '') // YYYYMMDD (KST 기준)"
    ),
]
for old, new in B2_PATCHES:
    if old not in ts:
        print(f'[WARN] PATCH-B2 없음 (스킵): {repr(old[:60])}')
    else:
        ts = ts.replace(old, new, 1)
        print(f'[OK] PATCH-B2 — {repr(old[:60])} → kstDateStr()')

# ─── PATCH-B3: new Date().toISOString() (datetime 전체) → kstNowStr() ────────
B3_OLD = "      ).run(status, work_completed_at || new Date().toISOString(), id)"
B3_NEW = "      ).run(status, work_completed_at || kstNowStr(), id)"
if B3_OLD not in ts:
    print('[WARN] PATCH-B3 work_completed_at 없음 (스킵)')
else:
    ts = ts.replace(B3_OLD, B3_NEW, 1)
    print('[OK] PATCH-B3 — work_completed_at kstNowStr() 교체')

# ─── PATCH-B4: 이번주 월요일 계산 UTC → KST 보정 ────────────────────────────
B4_OLD = (
    "      // 기본: 이번 주 월요일 계산 (KST 근사)\n"
    "      const now = new Date()\n"
    "      const dayOfWeek = now.getDay() // 0=일\n"
    "      const monday = new Date(now)\n"
    "      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))\n"
    "      const ws = monday.toISOString().slice(0, 10)"
)
B4_NEW = (
    "      // 기본: 이번 주 월요일 계산 (KST 기준)\n"
    "      const nowKstMs = Date.now() + 9 * 3600 * 1000\n"
    "      const nowKstD  = new Date(nowKstMs)\n"
    "      const dayOfWeek = nowKstD.getUTCDay() // 0=일\n"
    "      const monday = new Date(nowKstMs)\n"
    "      monday.setUTCDate(nowKstD.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))\n"
    "      const ws = monday.toISOString().slice(0, 10)"
)
if B4_OLD not in ts:
    print('[WARN] PATCH-B4 이번주 월요일 없음 (스킵)')
else:
    ts = ts.replace(B4_OLD, B4_NEW, 1)
    print('[OK] PATCH-B4 — 이번주 월요일 KST 기준 교체')

# ─── PATCH-B5: scheduleDailyBackup getHours() → KST 기준 ────────────────────
B5_OLD = (
    "  const now   = new Date()\n"
    "  const next  = new Date(now)\n"
    "  next.setDate(now.getDate() + (now.getHours() >= 2 ? 1 : 0))\n"
    "  next.setHours(2, 0, 0, 0)                     // 다음 새벽 2:00:00"
)
B5_NEW = (
    "  const now   = new Date()\n"
    "  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)\n"
    "  const next  = new Date(now)\n"
    "  // KST 기준 새벽 2시 = UTC 전날 17:00\n"
    "  next.setUTCDate(kstNow.getUTCDate() + (kstNow.getUTCHours() >= 2 ? 1 : 0))\n"
    "  next.setUTCHours(17, 0, 0, 0)                 // UTC 17:00 = KST 02:00"
)
if B5_OLD not in ts:
    print('[WARN] PATCH-B5 scheduleDailyBackup 없음 (스킵)')
else:
    ts = ts.replace(B5_OLD, B5_NEW, 1)
    print('[OK] PATCH-B5 — scheduleDailyBackup KST 새벽2시 기준 교체')

# ─── PATCH-B6: 공사통계 연도 fallback ───────────────────────────────────────
B6_OLD = "  const year       = c.req.query('year')         || String(new Date().getFullYear())"
B6_NEW = "  const year       = c.req.query('year')         || String(new Date(Date.now() + 9*3600*1000).getUTCFullYear())"
if B6_OLD not in ts:
    print('[WARN] PATCH-B6 연도 fallback 없음 (스킵)')
else:
    ts = ts.replace(B6_OLD, B6_NEW, 1)
    print('[OK] PATCH-B6 — 공사통계 연도 fallback KST 교체')

with open(NODE_TS, 'w', encoding='utf-8') as f:
    f.write(ts)
new_ts_len = len(ts)
print(f'[OK] node-server.ts 저장 완료. 크기: {new_ts_len:,} ({new_ts_len-orig_ts_len:+,} 바이트)')
print('\n[ALL DONE] patch_155n 완료')
