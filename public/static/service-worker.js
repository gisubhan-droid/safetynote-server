// SafetyNOTE Service Worker v12 (v3.0 — Option C 아이콘 레일)
const STATIC_CACHE = 'sn-static-v12';
const API_CACHE    = 'sn-api-v12';

// Network First 대상: 자주 업데이트되는 파일 (항상 서버에서 최신 버전을 받아옴)
const NETWORK_FIRST_URLS = [
  '/',
  '/static/app.js',
  '/static/style.css',
  '/static/mobile-app.js',
];

// Cache First 대상 (거의 변경되지 않는 리소스만 PRECACHE)
const PRECACHE = [
  '/static/manifest.json',
  '/static/app-icon.png',
  '/static/fonts/LGSmartKR-regular.woff2',
  '/static/fonts/LGSmartKR-semibold.woff2',
  '/static/fonts/LGSmartKR-bold.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/sse'))      return;
  if (url.pathname.startsWith('/uploads/')) return;

  // ── 캐싱 완전 제외: 이미지/바이너리 스트리밍 응답 경로 ──────────────
  // /api/photos/:id/img, /api/inspection-photos/:id/img 등
  // clone() 시 "Response body is already used" 에러 발생 원인
  if (url.pathname.match(/\/api\/(photos|inspection-photos|attachments)\/\d+\/(img|file|thumb)/)) return;

  // API: Network First — clone()을 먼저 캐시에 저장 후 원본 반환
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // 바이너리(이미지/파일) 응답은 캐싱 제외 (Content-Type 기반)
          const ct = res.headers.get('Content-Type') || '';
          const isBinary = ct.startsWith('image/') || ct.startsWith('video/') || ct.startsWith('application/octet-stream');
          if (res.ok && !isBinary) {
            try {
              const toCache = res.clone();
              caches.open(API_CACHE).then(c => c.put(e.request, toCache)).catch(() => {});
            } catch (_) { /* clone 실패 무시 */ }
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || offlineJson()))
    );
    return;
  }

  // app.js / style.css / mobile-app.js / 루트(/): Network First — clone() 먼저
  if (NETWORK_FIRST_URLS.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const toCache = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(e.request, toCache));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || offlinePage()))
    );
    return;
  }

  // 기타 정적 파일 (폰트, 아이콘, manifest 등): Cache First
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request)
        .then(res => {
          if (res.ok) {
            try {
              caches.open(STATIC_CACHE).then(c => c.put(e.request, res.clone())).catch(() => {});
            } catch (_) { /* clone 실패 무시 */ }
          }
          return res;
        })
        .catch(() => offlinePage());
    })
  );
});

function offlineJson() {
  return new Response(JSON.stringify({ error: '오프라인 상태입니다.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } });
}

function offlinePage() {
  return new Response(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>오프라인 — SafetyNOTE</title>
    <style>
      body{margin:0;display:flex;align-items:center;justify-content:center;
           min-height:100vh;background:#F5F0F8;font-family:sans-serif}
      .box{background:#fff;border-radius:20px;padding:40px 28px;text-align:center;
           max-width:320px;width:90%;box-shadow:0 8px 32px rgba(78,58,99,.15)}
      h2{color:#4E3A63;margin:16px 0 8px;font-size:20px}
      p{color:#685182;font-size:14px;line-height:1.7;margin-bottom:24px}
      button{background:linear-gradient(135deg,#685182,#8E72A8);color:#fff;
             border:none;border-radius:12px;padding:14px;font-size:15px;
             cursor:pointer;width:100%}
    </style></head>
    <body><div class="box">
      <div style="font-size:54px">📡</div>
      <h2>오프라인 상태</h2>
      <p>네트워크 연결이 없습니다.<br>Wi-Fi 또는 데이터를 확인해 주세요.</p>
      <button onclick="location.reload()">다시 시도</button>
    </div></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
  );
}

// 푸시 알림
self.addEventListener('push', e => {
  if (!e.data) return;
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'SafetyNOTE', body: e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'SafetyNOTE', {
    body: d.body || '', icon: '/static/app-icon.png',
    badge: '/static/app-icon.png', tag: d.tag || 'sn',
    data: { url: d.url || '/' }, vibrate: [200, 100, 200]
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if (c.url === url && 'focus' in c) return c.focus();
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
