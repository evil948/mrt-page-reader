/**
 * Cookie auto-accept + surgical ad hiding (incl. Yandex «Я Реклама» overlays).
 */
(function () {
  if (window.__mrtPlusPageScripts) return;
  window.__mrtPlusPageScripts = true;

  const ACCEPT_RE =
    /^(принять|принимаю|согласен|согласна|соглашаюсь|хорошо|ок|ok|okay|accept|accept all|allow all|allow|agree|i agree|got it|понятно)$/i;
  const ACCEPT_SOFT =
    /принять все|принимаю|согласен|accept\s*all|allow\s*all|i agree|разрешить все/i;
  const AD_LABEL = /^\s*(я\s*)?реклама(\s*[•·\-—|]|\s+\d+\+)?/i;
  const YANDEX_AD = /я\s*реклама|yandex\s*advertising|partner-code|rtb-banner/i;

  function visible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }

  function tryClick(el) {
    if (!visible(el)) return false;
    try {
      el.click();
      return true;
    } catch (_) {
      return false;
    }
  }

  function acceptCookies() {
    const attrs = [
      '#onetrust-accept-btn-handler',
      '.cmptxt_btn_yes',
      '[data-testid="cookie-policy-dialog-accept-button"]',
      'button[data-action="accept"]',
    ];
    for (const sel of attrs) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          if (tryClick(el)) return true;
        }
      } catch (_) {}
    }
    for (const el of document.querySelectorAll(
      'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]'
    )) {
      const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
      if (!t || t.length > 40) continue;
      if (/отклон|reject|deny|настрой|settings|manage|подробн/i.test(t)) continue;
      if (ACCEPT_RE.test(t) || ACCEPT_SOFT.test(t)) {
        if (tryClick(el)) return true;
      }
    }
    return false;
  }

  function markHidden(el) {
    if (!el || el.dataset.mrtAdHidden === '1') return;
    el.dataset.mrtAdHidden = '1';
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('max-height', '0', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('opacity', '0', 'important');
  }

  function pickAdRoot(labelEl) {
    let best = labelEl;
    let el = labelEl;
    for (let i = 0; i < 10 && el && el !== document.body; i++) {
      const r = el.getBoundingClientRect?.();
      if (r && r.height > 60 && r.height < window.innerHeight * 0.98 && r.width > 100) {
        best = el;
      }
      // Full-viewport overlays: prefer the fixed/sticky ancestor
      const st = getComputedStyle(el);
      if ((st.position === 'fixed' || st.position === 'sticky') && r && r.height > window.innerHeight * 0.4) {
        return el;
      }
      el = el.parentElement;
    }
    return best;
  }

  function closeYandexOverlay(root) {
    if (!root) return false;
    const closers = root.querySelectorAll(
      'button, [role="button"], a, span, div[class*="close"], div[class*="Close"], [aria-label*="закры"], [aria-label*="close" i]'
    );
    for (const btn of closers) {
      const t = (btn.innerText || btn.getAttribute('aria-label') || '').trim();
      const looksClose =
        t === '×' ||
        t === '✕' ||
        t === 'X' ||
        t === 'x' ||
        /^закры/i.test(t) ||
        /close/i.test(t) ||
        (btn.getBoundingClientRect().width < 48 && btn.getBoundingClientRect().height < 48 && t.length <= 2);
      if (looksClose && tryClick(btn)) return true;
    }
    return false;
  }

  function hideLabeledAds() {
    // Direct known containers
    for (const sel of [
      'iframe[src*="adfox"]',
      'iframe[src*="doubleclick"]',
      'iframe[src*="googlesyndication"]',
      'iframe[src*="an.yandex"]',
      'iframe[src*="yandexadexchange"]',
      'iframe[src*="ads.yandex"]',
      '[data-ad-type]',
      '[data-erasable="ad"]',
      '.adfox',
      '#adfox',
      '[id*="yandex_rtb"]',
      '[class*="yandex_rtb"]',
      '[id*="Ya"][id*="rtb" i]',
      '[class*="i-ua"][class*="ad"]',
    ]) {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          markHidden(pickAdRoot(el) || el);
        });
      } catch (_) {}
    }

    const nodes = document.querySelectorAll('div, span, p, section, aside, article, a, header');
    for (const el of nodes) {
      if (el.dataset.mrtAdHidden === '1') continue;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 120) continue;

      const isBadge = AD_LABEL.test(t) || YANDEX_AD.test(t);
      if (!isBadge) continue;

      const root = pickAdRoot(el);
      // Try closing interstitial first (keeps page usable if hide fails)
      closeYandexOverlay(root);
      markHidden(root);
    }

    // Fixed full-screen layers that mention ads / partner grid
    for (const el of document.querySelectorAll('div, section, aside')) {
      if (el.dataset.mrtAdHidden === '1') continue;
      const st = getComputedStyle(el);
      if (st.position !== 'fixed' && st.position !== 'sticky') continue;
      const r = el.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.7 || r.height < window.innerHeight * 0.45) continue;
      const text = (el.innerText || '').slice(0, 400);
      if (!/реклама|я\s*реклама|partner|спонсор/i.test(text)) continue;
      // Avoid hiding the whole page shell
      if (el === document.body || el === document.documentElement) continue;
      if (el.querySelector('nav, header, main, article') && !/я\s*реклама/i.test(text.slice(0, 80))) continue;
      closeYandexOverlay(el);
      markHidden(el);
    }
  }

  function tick() {
    acceptCookies();
    hideLabeledAds();
  }

  tick();
  let n = 0;
  const timer = setInterval(() => {
    tick();
    if (++n > 40) clearInterval(timer);
  }, 500);

  const mo = new MutationObserver(() => {
    hideLabeledAds();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
