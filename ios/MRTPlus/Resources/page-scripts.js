/**
 * Soft page helpers: auto-accept cookie banners only.
 * Ad blocking is handled by WKContentRuleList (network domains + ad iframes).
 * Do not hide generic ".banner" / "[class*=advert]" — news sites break.
 */
(function () {
  if (window.__mrtPlusPageScripts) return;
  window.__mrtPlusPageScripts = true;

  const ACCEPT_RE =
    /^(принять|принимаю|согласен|согласна|соглашаюсь|хорошо|ок|ok|okay|accept|accept all|allow all|allow|agree|i agree|got it|понятно)$/i;
  const ACCEPT_SOFT =
    /принять все|принимаю|согласен|accept\s*all|allow\s*all|i agree|разрешить все/i;

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

    const candidates = [
      ...document.querySelectorAll(
        'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]'
      ),
    ];
    for (const el of candidates) {
      const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
      if (!t || t.length > 40) continue;
      if (/отклон|reject|deny|настрой|settings|manage|подробн/i.test(t)) continue;
      if (ACCEPT_RE.test(t) || ACCEPT_SOFT.test(t)) {
        if (tryClick(el)) return true;
      }
    }
    return false;
  }

  acceptCookies();
  let n = 0;
  const timer = setInterval(() => {
    acceptCookies();
    if (++n > 12) clearInterval(timer);
  }, 800);
})();
