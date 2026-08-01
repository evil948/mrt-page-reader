/**
 * Cookie auto-accept + surgical ad hiding.
 * Hides blocks labeled «РЕКЛАМА» without blanking the whole feed via broad class*=advert rules.
 */
(function () {
  if (window.__mrtPlusPageScripts) return;
  window.__mrtPlusPageScripts = true;

  const ACCEPT_RE =
    /^(принять|принимаю|согласен|согласна|соглашаюсь|хорошо|ок|ok|okay|accept|accept all|allow all|allow|agree|i agree|got it|понятно)$/i;
  const ACCEPT_SOFT =
    /принять все|принимаю|согласен|accept\s*all|allow\s*all|i agree|разрешить все/i;
  const AD_LABEL = /^\s*реклама(\s*[•·\-—|]|\s+\d+\+)?/i;

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
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('max-height', '0', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('padding', '0', 'important');
  }

  function pickAdRoot(labelEl) {
    let best = labelEl;
    let el = labelEl;
    for (let i = 0; i < 8 && el && el !== document.body; i++) {
      const r = el.getBoundingClientRect?.();
      const text = (el.innerText || '').trim();
      // Prefer a card-sized block that still looks like an ad unit
      if (r && r.height > 80 && r.height < window.innerHeight * 0.9 && r.width > 120) {
        best = el;
        // Stop if this node is mostly the ad (short-ish or starts with РЕКЛАМА)
        if (text.length < 1200 || AD_LABEL.test(text.slice(0, 40))) {
          // keep walking one more for wrappers
        }
      }
      el = el.parentElement;
    }
    return best;
  }

  function hideLabeledAds() {
    const nodes = document.querySelectorAll('div, span, p, section, aside, article, a');
    for (const el of nodes) {
      if (el.dataset.mrtAdHidden === '1') continue;
      const raw = (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3)
        ? el.textContent
        : el.innerText) || '';
      const t = raw.trim();
      if (!t || t.length > 80) continue;
      if (!AD_LABEL.test(t)) continue;
      // Prefer labels that are small badge lines like "РЕКЛАМА • 16+"
      markHidden(pickAdRoot(el));
    }

    // Common partner / promo slots (narrow selectors)
    for (const sel of [
      'iframe[src*="adfox"]',
      'iframe[src*="doubleclick"]',
      'iframe[src*="googlesyndication"]',
      'iframe[src*="an.yandex"]',
      'iframe[src*="yandexadexchange"]',
      '[data-ad-type]',
      '[data-erasable="ad"]',
      '.adfox',
      '#adfox',
    ]) {
      try {
        document.querySelectorAll(sel).forEach(markHidden);
      } catch (_) {}
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
    if (++n > 25) clearInterval(timer);
  }, 600);

  const mo = new MutationObserver(() => {
    hideLabeledAds();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
