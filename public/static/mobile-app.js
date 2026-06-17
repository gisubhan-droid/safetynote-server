// SafetyNOTE Mobile App JS
// PWA 등록 / 설치 배너 / 하단 탭바 / 스와이프 닫기 / 오프라인 토스트
(function () {
  'use strict';

  const UA       = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|IEMobile|WPDesktop/i.test(UA);
  const isIOS    = /iPad|iPhone|iPod/.test(UA) && !window.MSStream;
  const isPWA    = window.matchMedia('(display-mode: standalone)').matches
                || window.navigator.standalone === true;

  // ── 1. Service Worker 등록 ────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then(reg => {
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateBanner(reg);
              }
            });
          });
        })
        .catch(err => console.warn('[SW] 등록 실패:', err));
    });
  }

  // ── 2. PWA 설치 배너 (Android Chrome 모바일 전용) ───────────────
  // [BUG-007-PWA] PC 브라우저(Edge/Chrome 데스크톱)에서도 beforeinstallprompt
  // 이벤트가 발생하여 배너가 표시되는 문제 → isMobile 조건으로 차단
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isMobile) return; // PC 브라우저에서는 설치 배너 표시 안 함
    if (!localStorage.getItem('pwa-dismissed') &&
        !localStorage.getItem('pwa-installed') && !isPWA) {
      setTimeout(showInstallBanner, 4000);
    }
  });
  window.addEventListener('appinstalled', () => {
    localStorage.setItem('pwa-installed', '1');
    document.getElementById('pwa-install-banner')?.remove();
    if (window.toast) window.toast('앱이 홈 화면에 추가되었습니다! 📱', 'success');
  });

  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    const el = document.createElement('div');
    el.id = 'pwa-install-banner';
    el.style.cssText = `position:fixed;bottom:${isMobile ? '76px' : '20px'};left:50%;
      transform:translateX(-50%);z-index:9990;width:calc(100% - 32px);max-width:340px`;
    el.innerHTML = `
      <div style="background:linear-gradient(135deg,#4E3A63,#8E72A8);color:#fff;
        border-radius:16px;padding:14px 16px;display:flex;align-items:center;
        gap:12px;box-shadow:0 8px 24px rgba(78,58,99,.4)">
        <img src="/static/app-icon.png" style="width:40px;height:40px;border-radius:10px;flex-shrink:0"
          onerror="this.style.display='none'">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">SafetyNOTE 앱 설치</div>
          <div style="font-size:12px;opacity:.85;margin-top:2px">홈 화면에 추가하면 더 빠르게 접속</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button id="pwa-install-btn" style="background:#fff;color:#4E3A63;border:none;
            border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer">설치</button>
          <button id="pwa-dismiss-btn" style="background:none;color:rgba(255,255,255,.7);
            border:none;font-size:11px;cursor:pointer;padding:2px">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#pwa-install-btn').onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') localStorage.setItem('pwa-installed', '1');
      deferredPrompt = null;
      el.remove();
    };
    el.querySelector('#pwa-dismiss-btn').onclick = () => {
      localStorage.setItem('pwa-dismissed', '1');
      el.remove();
    };
  }

  // ── iOS Safari 설치 안내 ─────────────────────────────────────────
  function showIOSGuide() {
    if (isPWA || !isIOS || localStorage.getItem('ios-guide-dismissed')) return;
    if (document.getElementById('ios-guide')) return;
    const el = document.createElement('div');
    el.id = 'ios-guide';
    el.innerHTML = `
      <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;
        border-radius:20px 20px 0 0;padding:24px 20px 36px;z-index:9991;
        box-shadow:0 -8px 32px rgba(0,0,0,.15)">
        <div style="width:40px;height:4px;background:#E5E7EB;border-radius:2px;margin:0 auto 20px"></div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <img src="/static/app-icon.png" style="width:48px;height:48px;border-radius:12px"
            onerror="this.style.display='none'">
          <div>
            <div style="font-weight:700;font-size:16px;color:#1F2937">SafetyNOTE 앱 설치</div>
            <div style="font-size:13px;color:#6B7280">홈 화면에 추가하기</div>
          </div>
        </div>
        <div style="background:#F9FAFB;border-radius:12px;padding:16px;font-size:13px;
          color:#374151;line-height:2">
          <div style="font-weight:600;margin-bottom:4px">Safari 에서 여는 방법:</div>
          <div>1. 하단 <strong>공유 버튼</strong> ⬆️ 탭</div>
          <div>2. <strong>"홈 화면에 추가"</strong> 선택</div>
          <div>3. 우측 상단 <strong>"추가"</strong> 탭</div>
        </div>
        <button id="ios-guide-close" style="width:100%;margin-top:16px;padding:14px;
          background:linear-gradient(135deg,#685182,#8E72A8);color:#fff;border:none;
          border-radius:12px;font-size:15px;font-weight:600;cursor:pointer">확인</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#ios-guide-close').onclick = () => {
      localStorage.setItem('ios-guide-dismissed', '1');
      el.remove();
    };
  }

  // ── 3. 오프라인/온라인 토스트 ────────────────────────────────────
  function showNetworkToast(online) {
    document.getElementById('sn-net-toast')?.remove();
    const el = document.createElement('div');
    el.id = 'sn-net-toast';
    el.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:9999;
      padding:12px 16px;background:${online ? '#059669' : '#DC2626'};
      color:#fff;font-size:14px;font-weight:600;text-align:center;
      padding-top:calc(env(safe-area-inset-top,0px) + 12px);transition:opacity .3s`;
    el.textContent = online ? '✅ 네트워크 연결됨' : '📡 오프라인 — 일부 기능이 제한됩니다';
    document.body.appendChild(el);
    if (online) setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
  }
  window.addEventListener('online',  () => showNetworkToast(true));
  window.addEventListener('offline', () => showNetworkToast(false));
  if (!navigator.onLine) {
    document.addEventListener('DOMContentLoaded', () => showNetworkToast(false));
  }

  // ── 4. 앱 업데이트 배너 ──────────────────────────────────────────
  function showUpdateBanner(reg) {
    if (document.getElementById('sn-update-banner')) return;
    const el = document.createElement('div');
    el.id = 'sn-update-banner';
    el.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:9998;
      background:linear-gradient(135deg,#1D4ED8,#3B82F6);color:#fff;
      padding:12px 16px;display:flex;align-items:center;justify-content:space-between;
      font-size:13px;padding-top:calc(env(safe-area-inset-top,0px) + 12px)`;
    el.innerHTML = `<span>🔄 새 버전이 있습니다!</span>
      <button onclick="(function(){navigator.serviceWorker.controller&&
        navigator.serviceWorker.controller.postMessage({type:'SKIP_WAITING'});
        location.reload();})()" style="background:#fff;color:#1D4ED8;border:none;
        border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer">
        새로고침</button>`;
    document.body.appendChild(el);
  }

  // ── 5. 하단 네비게이션 탭 바 ─────────────────────────────────────
  const NAV_ITEMS = [
    { page: 'dashboard',     icon: 'fa-home',           label: '홈'    },
    { page: 'my-tasks',      icon: 'fa-hard-hat',       label: '내 작업' },
    { page: 'tbm',           icon: 'fa-clipboard-list', label: 'TBM'   },
    { page: 'notifications', icon: 'fa-bell',           label: '알림', badge: true },
    { page: 'profile',       icon: 'fa-user-circle',    label: '내 정보' },
  ];

  function buildMobileNav() {
    if (document.getElementById('mobile-nav-bar')) return;
    const nav = document.createElement('nav');
    nav.id = 'mobile-nav-bar';
    nav.setAttribute('role', 'navigation');
    nav.innerHTML = `<div class="mobile-nav-inner">${NAV_ITEMS.map(it => `
      <button class="mobile-nav-item" data-page="${it.page}" aria-label="${it.label}">
        <i class="fas ${it.icon}"></i>
        <span>${it.label}</span>
        ${it.badge ? '<span id="mobile-nav-badge" style="display:none"></span>' : ''}
      </button>`).join('')}</div>`;
    document.body.appendChild(nav);
    nav.querySelectorAll('.mobile-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (typeof window.navigateTo === 'function') window.navigateTo(page);
        setNavActive(page);
        if (navigator.vibrate) navigator.vibrate(10);
      });
    });
  }

  function setNavActive(pageId) {
    document.querySelectorAll('.mobile-nav-item').forEach(b =>
      b.classList.toggle('active', b.dataset.page === pageId));
  }

  // 알림 배지 (외부 호출용)
  window.updateMobileNavBadge = count => {
    const badge = document.getElementById('mobile-nav-badge');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = count > 0 ? 'flex' : 'none';
  };

  // navigateTo 래핑 — 탭 active 연동
  const _wrapNav = setInterval(() => {
    if (typeof window.navigateTo === 'function') {
      clearInterval(_wrapNav);
      const _orig = window.navigateTo;
      window.navigateTo = page => { _orig(page); setNavActive(page); };
    }
  }, 200);

  // ── 6. 스와이프로 모달 닫기 ─────────────────────────────────────
  // [FEAT-024 v4] 전체화면 모달(.modal 내부 터치)은 스와이프 닫기 완전 차단
  // - modal-sm 소형 확인팝업만 스와이프 닫기 허용
  // - .modal 내부 어디를 터치하든(헤더·탭·body·sticky 영역 포함) 차단
  // - window.innerWidth 조건 제거 → 기기 해상도 무관하게 동작
  let _sy = 0, _sx = 0;
  document.addEventListener('touchstart', e => {
    _sy = e.touches[0].clientY; _sx = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - _sy;
    const dx = Math.abs(e.changedTouches[0].clientX - _sx);
    if (dy > 80 && dx < 60) {
      const modals = document.querySelectorAll('.modal-overlay');
      if (!modals.length) return;
      const top = modals[modals.length - 1];
      // [FEAT-024 v4] modal-sm 이 아니면 무조건 스와이프 닫기 차단
      // (헤더·탭·body 등 .modal 내부 어느 요소 터치 여부와 무관)
      if (!top.classList.contains('modal-sm')) return;
      // modal-sm: 기존 로직 유지 (스크롤 최상단일 때만 닫기)
      const sb = e.target.closest('.modal-body');
      if (!sb || sb.scrollTop === 0) {
        top.style.animation = 'snFadeOut .2s ease forwards';
        setTimeout(() => top.remove(), 200);
        if (navigator.vibrate) navigator.vibrate(30);
      }
    }
  }, { passive: true });

  // ── 7. 키보드 열림 시 하단 바 숨김 ─────────────────────────────
  if (isMobile) {
    const origH = window.innerHeight;
    window.addEventListener('resize', () => {
      const isKb = window.innerHeight < origH * 0.75;
      document.documentElement.classList.toggle('keyboard-open', isKb);
    });
  }

  // ── 초기화 ───────────────────────────────────────────────────────
  function init() {
    if (!isMobile) return;
    const tid = setInterval(() => {
      if (window.currentUser) {
        clearInterval(tid);
        buildMobileNav();
        if (isIOS && !isPWA) setTimeout(showIOSGuide, 10000);
      }
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.SafetyNOTEMobile = { isPWA, isMobile, isIOS, setNavActive };
})();

// keyframes 주입
(function () {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes snFadeOut { to { opacity:0; transform:translateY(60px); } }
  `;
  document.head.appendChild(s);
})();
