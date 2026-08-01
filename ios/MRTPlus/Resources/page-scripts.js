/**
 * Injected after each page load: hide leftover ads, auto-accept cookie banners.
 */
(function () {
  if (window.__mrtPlusPageScripts) return;
  window.__mrtPlusPageScripts = true;

  const ACCEPT_RE =
    /^(принять|принимаю|согласен|согласна|соглашаюсь|хорошо|ок|ok|okay|accept|accept all|allow all|allow|agree|i agree|got it|понятно|закрыть)$/i;
  const ACCEPT_SOFT =
    /принять|соглас|accept\s*all|allow\s*all|agree|разрешить|хорошо|понятно/i;

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
    const candidates = [
      ...document.querySelectorAll(
        'button, a, [role="button"], input[type="button"], input[type="submit"]'
      ),
    ];
    for (const el of candidates) {
      const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
      if (!t || t.length > 48) continue;
      if (ACCEPT_RE.test(t) || ACCEPT_SOFT.test(t)) {
        if (tryClick(el)) return true;
      }
    }
    // common attribute hooks
    const attrs = [
      '[data-testid*="accept"]',
      '[data-action*="accept"]',
      '[id*="accept"][id*="cookie" i]',
      '[class*="accept"][class*="cookie" i]',
      '#onetrust-accept-btn-handler',
      '.cmptxt_btn_yes',
      'button[mode="primary"]',
    ];
    for (const sel of attrs) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          const t = (el.innerText || '').trim();
          if (t && /отклон|reject|deny|settings|настрой/i.test(t)) continue;
          if (tryClick(el)) return true;
        }
      } catch (_) {}
    }
    return false;
  }

  function hideNoise() {
    const style = document.getElementById('mrt-plus-noise-style') || document.createElement('style');
    style.id = 'mrt-plus-noise-style';
    style.textContent = `
      [class*="advert"],[id*="advert"],[class*="AdFox"],[id*="adfox"],
      iframe[src*="adfox"],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],
      iframe[src*="an.yandex"],.b-banner,[data-ad],
      #app-cookie,[class*="cookie-banner"],[class*="CookieBanner"],
      [class*="cookie-notice"],[class*="gdpr-banner"],[class*="consent-banner"] {
        display: none !important; visibility: hidden !important; pointer-events: none !important;
        max-height: 0 !important; overflow: hidden !important;
      }
    `;
    if (!style.parentNode) document.documentElement.appendChild(style);
  }

  hideNoise();
  acceptCookies();
  let n = 0;
  const timer = setInterval(() => {
    hideNoise();
    acceptCookies();
    if (++n > 15) clearInterval(timer);
  }, 700);

  const mo = new MutationObserver(() => {
    hideNoise();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
