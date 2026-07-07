import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import authRoutes from './routes/auth'
import taskRoutes from './routes/tasks'
import userRoutes from './routes/users'
import riskRoutes from './routes/risk'
import tbmRoutes from './routes/tbm'
import photoRoutes from './routes/photos'
import statsRoutes from './routes/stats'
import inspectionRoutes from './routes/inspections'
import hazardRoutes from './routes/hazards'
import worklogRoutes from './routes/worklogs'
import { checklistRoutes } from './routes/checklist'
import attachmentRoutes from './routes/attachments'
import teamRoutes from './routes/teams'
import educationRoutes from './routes/education'
import constructionRoutes from './routes/constructions'
import notificationRoutes from './routes/notifications'
import legalNoticeRoutes from './routes/legal-notices'
import workReportRoutes from './routes/work-reports'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// API Routes
app.route('/api/auth', authRoutes)
app.route('/api/tasks', taskRoutes)
app.route('/api/users', userRoutes)
app.route('/api/risk', riskRoutes)
app.route('/api/tbm', tbmRoutes)
app.route('/api/photos', photoRoutes)
app.route('/api/stats', statsRoutes)
app.route('/api/inspections', inspectionRoutes)
app.route('/api/hazards', hazardRoutes)
app.route('/api/worklogs', worklogRoutes)
app.route('/api/checklist', checklistRoutes)
app.route('/api/attachments', attachmentRoutes)
app.route('/api/teams', teamRoutes)
app.route('/api/education', educationRoutes)
app.route('/api/constructions', constructionRoutes)
app.route('/api/notifications', notificationRoutes)
app.route('/api/legal-notices', legalNoticeRoutes)
app.route('/api/work-reports', workReportRoutes)

// Static files
app.use('/static/*', serveStatic({ root: './' }))

// 업로드된 원본 사진 파일 서빙 (/uploads/파일명)
app.get('/uploads/:filename', async (c) => {
  const filename = c.req.param('filename')
  // 경로 탐색 방지
  if (filename.includes('..') || filename.includes('/')) {
    return c.json({ error: 'Invalid filename' }, 400)
  }
  try {
    // @ts-ignore
    const fs = await import('node:fs/promises')
    // @ts-ignore
    const path = await import('node:path')
    const filePath = path.join('./public/uploads', filename)
    const fileBuffer = await fs.readFile(filePath)
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    }
    const mimeType = mimeMap[ext] || 'application/octet-stream'
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  } catch (_) {
    return c.json({ error: '파일을 찾을 수 없습니다.' }, 404)
  }
})

// ─── QR 스캔 공개 프로필 페이지 (인증 불필요) ───────────────────────────────
app.get('/qr/:userId', async (c) => {
  const userId = c.req.param('userId')
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>작업자 안전 프로필 — Safety NOTE</title>
  <link rel="icon" type="image/png" href="/static/app-icon.png">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: linear-gradient(135deg, #F2F0EB 0%, #FDE8F3 100%); min-height: 100vh; font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; }
    .profile-wrap { max-width: 440px; margin: 0 auto; padding: 20px 14px 48px; }
    /* Header */
    .lgu-header { background: linear-gradient(135deg, #E6007E 0%, #6B5B9A 100%); border-radius: 22px 22px 0 0; padding: 28px 24px 22px; text-align: center; color: white; }
    .lgu-avatar { width: 80px; height: 80px; border-radius: 50%; background: rgba(255,255,255,0.22); display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 900; color: white; margin: 0 auto 12px; border: 3px solid rgba(255,255,255,0.45); }
    .lgu-name { font-size: 23px; font-weight: 900; letter-spacing: -0.5px; }
    .lgu-sub { font-size: 13px; opacity: 0.82; margin-top: 3px; }
    .lgu-badges { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin-top: 10px; }
    .lgu-badge { display: inline-block; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.38); border-radius: 20px; padding: 3px 13px; font-size: 12px; font-weight: 700; }
    .blood-badge { background: rgba(255,80,80,0.3); border-color: rgba(255,120,120,0.5); }
    /* Cards */
    .info-card { background: white; box-shadow: 0 8px 32px rgba(230,0,126,0.10); overflow: hidden; }
    .info-card:last-of-type { border-radius: 0 0 22px 22px; }
    .section-title { display: flex; align-items: center; gap: 7px; padding: 12px 18px 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.3px; border-bottom: 1px solid #F5F0EB; }
    .info-row { display: flex; align-items: flex-start; padding: 11px 18px; border-bottom: 1px solid #F5F0EB; gap: 12px; }
    .info-row:last-child { border-bottom: none; }
    .info-icon { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; margin-top: 1px; }
    .info-label { font-size: 10px; font-weight: 700; color: #9CA3AF; line-height: 1; text-transform: uppercase; letter-spacing: 0.3px; }
    .info-value { font-size: 14px; font-weight: 600; color: #1A1A1A; line-height: 1.4; margin-top: 3px; }
    /* Education section */
    .edu-card { background: white; border-top: 1px solid #F5F0EB; }
    .edu-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 18px; border-bottom: 1px solid #F9F6F2; }
    .edu-row:last-child { border-bottom: none; }
    .edu-name { font-size: 12px; color: #4B5563; font-weight: 500; }
    .edu-date { font-size: 12px; font-weight: 700; color: #1A1A1A; }
    .edu-none { font-size: 11px; color: #D1D5DB; }
    /* Task card */
    .task-card { margin: 0 18px 14px; padding: 12px 14px; border-radius: 12px; border: 1.5px solid #E6007E; background: #FEF0F8; }
    .status-badge { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .footer-note { text-align: center; font-size: 11px; color: #9CA3AF; margin-top: 20px; line-height: 1.6; }
    /* Inspection history */
    .insp-summary { display: flex; gap: 8px; padding: 12px 18px 10px; }
    .insp-stat-box { flex: 1; border-radius: 10px; padding: 8px 6px; text-align: center; }
    .insp-record { padding: 10px 18px; border-bottom: 1px solid #F9F6F2; display: flex; align-items: flex-start; gap: 10px; }
    .insp-record:last-child { border-bottom: none; }
    .insp-badge { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 800; color: white; }
  </style>
</head>
<body>
<div class="profile-wrap">
  <div id="profileCard">
    <div style="text-align:center;padding:80px 20px">
      <div style="width:44px;height:44px;border:4px solid #F0EDE8;border-top-color:#E6007E;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px"></div>
      <p style="color:#9CA3AF;font-size:14px">프로필 불러오는 중...</p>
    </div>
  </div>
  <p class="footer-note"><i class="fas fa-shield-alt" style="color:#E6007E"></i>&nbsp;Safety NOTE<br>LGU+ 협력사 현장 안전관리 시스템</p>
</div>
<style>@keyframes spin { to { transform: rotate(360deg); } }</style>
<script>
(async function() {
  const userId = '${userId}';
  const card = document.getElementById('profileCard');

  function fmtDate(d) {
    if (!d) return '';
    return d.replace(/-/g, '.');
  }

  // 값이 있을 때만 표시
  function infoRow(iconBg, iconColor, iconClass, label, value) {
    if (!value) return '';
    return \`<div class="info-row">
      <div class="info-icon" style="background:\${iconBg}"><i class="fas \${iconClass}" style="color:\${iconColor}"></i></div>
      <div><div class="info-label">\${label}</div><div class="info-value">\${value}</div></div>
    </div>\`;
  }
  // 값 없어도 항상 표시 (미입력 표기)
  function infoRowAlways(iconBg, iconColor, iconClass, label, value) {
    return \`<div class="info-row">
      <div class="info-icon" style="background:\${iconBg}"><i class="fas \${iconClass}" style="color:\${iconColor}"></i></div>
      <div><div class="info-label">\${label}</div><div class="info-value" style="\${value ? '' : 'color:#C9CBD0;font-weight:500'}">\${value || '미입력'}</div></div>
    </div>\`;
  }

  function eduRow(label, dateVal) {
    return \`<div class="edu-row">
      <span class="edu-name">\${label}</span>
      \${dateVal ? \`<span class="edu-date">\${fmtDate(dateVal)}</span>\` : \`<span class="edu-none">미이수</span>\`}
    </div>\`;
  }

  try {
    const res = await fetch('/api/users/qr-profile/' + userId);
    if (!res.ok) throw new Error('사용자를 찾을 수 없습니다.');
    const u = await res.json();

    const statusMap = {
      unassigned: { label: '미배정', bg: '#F0EFEB', color: '#6B7280' },
      assigned:   { label: '배정완료', bg: '#FDE8F3', color: '#E6007E' },
      in_progress:{ label: '진행중',  bg: '#FFF3CD', color: '#B45309' },
      tbm_done:   { label: 'TBM완료', bg: '#EDE9F7', color: '#6B5B9A' },
      working:    { label: '작업중',  bg: '#E8F5E9', color: '#2E7D32' },
      completed:  { label: '완료',    bg: '#EDE9F7', color: '#6B5B9A' },
    };
    const st = u.current_task
      ? (statusMap[u.current_task.status] || { label: u.current_task.status, bg: '#F0EFEB', color: '#6B7280' })
      : null;

    card.innerHTML = \`
      <!-- ① 헤더 -->
      <div class="lgu-header">
        <div class="lgu-avatar">\${u.name.charAt(0)}</div>
        <div class="lgu-name">\${u.name}</div>
        \${(u.company || u.position) ? \`<div class="lgu-sub">\${[u.company, u.position].filter(Boolean).join(' · ')}</div>\` : ''}
        <div class="lgu-badges">
          <span class="lgu-badge">\${u.role_label}</span>
          \${u.blood_type ? \`<span class="lgu-badge blood-badge"><i class="fas fa-tint mr-1"></i>\${u.blood_type}</span>\` : ''}
        </div>
      </div>

      <!-- ② 기본 정보 -->
      <div class="info-card">
        <div class="section-title" style="color:#E6007E"><i class="fas fa-id-card"></i> 인적사항</div>
        \${infoRow('#FDE8F3','#E6007E','fa-building','소속 부서', u.department)}
        \${infoRowAlways('#EDE9F7','#6B5B9A','fa-phone','연락처', u.phone)}
        \${infoRowAlways('#FFF8E1','#B45309','fa-exclamation-triangle','긴급연락처', u.emergency_contact)}
        \${infoRowAlways('#FFF0F0','#E53E3E','fa-tint','혈액형', u.blood_type)}
        \${infoRowAlways('#F0FFF4','#2E7D32','fa-heartbeat','건강정보', u.health_info)}
        <div class="info-row">
          <div class="info-icon" style="background:#FFF3CD"><i class="fas fa-clipboard-check" style="color:#B45309"></i></div>
          <div><div class="info-label">완료 작업</div><div class="info-value">\${u.completed_tasks}건</div></div>
        </div>
      </div>

      <!-- ③ 현재 작업 -->
      \${u.current_task ? \`
      <div class="info-card" style="border-top:1px solid #F5F0EB">
        <div class="section-title" style="color:#E6007E"><i class="fas fa-hard-hat"></i> 현재 배정 작업</div>
        <div class="task-card">
          <div style="font-size:14px;font-weight:700;color:#1A1A1A;margin-bottom:7px">\${u.current_task.title}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="status-badge" style="background:\${st.bg};color:\${st.color}">\${st.label}</span>
            \${u.current_task.work_order_address ? \`<span style="font-size:11px;color:#6B7280"><i class="fas fa-map-marker-alt"></i> \${u.current_task.work_order_address}</span>\` : ''}
          </div>
        </div>
      </div>\` : \`
      <div class="info-card" style="border-top:1px solid #F5F0EB">
        <div style="padding:14px 18px;font-size:13px;color:#9CA3AF;text-align:center">
          <i class="fas fa-check-circle" style="color:#6B5B9A"></i> 현재 배정된 작업 없음
        </div>
      </div>\`}

      <!-- ④ 안전교육 이수 현황 (항상 표시) -->
      <div class="edu-card">
        <div class="section-title" style="color:#B45309"><i class="fas fa-graduation-cap"></i> 안전교육 이수 현황</div>
        \${eduRow('채용시교육', u.edu_hire_date)}
        \${eduRow('특별안전교육 — 전기작업', u.edu_special_electric)}
        \${eduRow('특별안전교육 — 밀폐공간작업', u.edu_special_confined)}
        \${eduRow('특별안전교육 — 하역작업', u.edu_special_loading)}
        \${eduRow('체험안전교육', u.edu_experience_date)}
      </div>

      <!-- ⑤ 안전준수 현황 (점검 이력) -->
      \${(() => {
        const sm   = u.insp_summary || { poor:0, excel:0, total:0 };
        const hist = u.insp_history || [];
        const safetyIdx = sm.total === 0 ? null : Math.round(sm.excel / sm.total * 100);
        const idxColor  = safetyIdx === null ? '#9CA3AF'
          : safetyIdx >= 70 ? '#16A34A' : safetyIdx >= 40 ? '#D97706' : '#DC2626';
        let html = \`<div class="edu-card">
          <div class="section-title" style="color:#705789">
            <i class="fas fa-shield-alt"></i> 안전준수 현황
          </div>
          <div class="insp-summary">
            <div class="insp-stat-box" style="background:#FEF2F2;border:1px solid #DC262633">
              <div style="font-size:20px;font-weight:900;color:#DC2626">\${sm.poor}</div>
              <div style="font-size:10px;color:#6B7280;margin-top:2px">불량</div>
            </div>
            <div class="insp-stat-box" style="background:#F0FDF4;border:1px solid #16A34A33">
              <div style="font-size:20px;font-weight:900;color:#16A34A">\${sm.excel}</div>
              <div style="font-size:10px;color:#6B7280;margin-top:2px">우수</div>
            </div>
            <div class="insp-stat-box" style="background:#F5F0EB;border:1px solid #70578933">
              <div style="font-size:20px;font-weight:900;color:#705789">\${sm.total}</div>
              <div style="font-size:10px;color:#6B7280;margin-top:2px">합계</div>
            </div>
            <div class="insp-stat-box" style="background:#F8F6F2;border:1px solid #E0D8CE">
              <div style="font-size:20px;font-weight:900;color:\${idxColor}">\${safetyIdx !== null ? safetyIdx+'%' : '-'}</div>
              <div style="font-size:10px;color:#6B7280;margin-top:2px">안전지수</div>
            </div>
          </div>\`;
        if (hist.length === 0) {
          html += \`<div style="padding:14px 18px;font-size:12px;color:#9CA3AF;text-align:center">
            <i class="fas fa-check-circle" style="color:#16A34A;margin-right:4px"></i>불량·우수 기록 없음
          </div>\`;
        } else {
          html += hist.map((r:any) => {
            const isPoor = r.result_type === '불량';
            const col    = isPoor ? '#DC2626' : '#16A34A';
            const bg     = isPoor ? '#FEF2F2' : '#F0FDF4';
            const ico    = isPoor ? 'fa-exclamation-triangle' : 'fa-star';
            const dt     = r.inspection_date_only || (r.recorded_at||'').slice(0,10);
            return \`<div class="insp-record">
              <div style="width:30px;height:30px;border-radius:8px;background:\${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="fas \${ico}" style="color:\${col};font-size:12px"></i>
              </div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span class="insp-badge" style="background:\${col}">\${r.result_type}</span>
                  <span style="font-size:11px;color:#6B7280">\${dt}</span>
                </div>
                \${r.task_title ? \`<div style="font-size:11px;color:#4B5563;margin-top:2px;font-weight:600">\${r.task_number?'['+r.task_number+'] ':''}\${r.task_title}</div>\` : ''}
                <div style="font-size:11px;color:#9CA3AF;margin-top:1px"><i class="fas fa-map-marker-alt" style="margin-right:3px"></i>\${r.location||'-'}</div>
                \${r.findings ? \`<div style="font-size:10px;color:#6B7280;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${r.findings}</div>\` : ''}
                <div style="font-size:10px;color:#B0B8C1;margin-top:1px">점검자: \${r.inspector_name||'-'}</div>
              </div>
            </div>\`;
          }).join('');
        }
        html += \`</div>\`;
        return html;
      })()}
    \`;
    // 마지막 카드에 하단 radius 적용
    const cards = card.querySelectorAll('.info-card, .edu-card');
    if (cards.length) cards[cards.length-1].style.borderRadius = '0 0 22px 22px';

  } catch(e) {
    card.innerHTML = \`<div style="background:white;border-radius:22px;padding:40px 24px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <i class="fas fa-user-slash" style="font-size:40px;color:#E6007E;margin-bottom:12px;display:block"></i>
      <p style="color:#1A1A1A;font-weight:700;font-size:16px">프로필을 불러올 수 없습니다</p>
      <p style="color:#9CA3AF;font-size:13px;margin-top:4px">\${e.message}</p>
    </div>\`;
  }
})();
</script>
</body>
</html>`)
})

// Main SPA - serve index.html for all non-API routes
app.get('*', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Safety NOTE</title>
  <link rel="icon" type="image/png" href="/static/app-icon.png">
  <!-- SheetJS: 로컬 파일로 서빙 (CDN 차단 환경 대응) -->
  <script src="/static/xlsx.full.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <link rel="stylesheet" href="/static/style.css?v=5dfc5a8d">
</head>
<body class="bg-gray-50 min-h-screen">
  <div id="app"></div>
  <script src="/static/app.js?v=df44a2dd"></script>
</body>
</html>`)
})

export default app
