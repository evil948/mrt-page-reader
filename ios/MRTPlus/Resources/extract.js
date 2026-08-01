/**
 * MRT+ article extraction + highlight helpers for WKWebView.
 * Exposed as window.MRTPlusExtract — called from Swift via evaluateJavaScript.
 */
(function (global) {
  'use strict';

  const UNIT_TARGET = 1600;
  const HARD_MAX = 4500;
  const TITLE_PID = 0;
  const STYLE_ID = 'mrt-plus-highlight-style';

  const JUNK_NODE = [
    'script', 'style', 'noscript', 'nav', 'footer', 'aside', 'form', 'iframe', 'button', 'svg',
    '.share', '.social', '.comments', '.related', '.recomend', '.recommend', '.tags',
    '.breadcrumb', '.breadcrumbs',
    '[class*="banner"]', '[class*="advert"]', '[class*="subscribe"]', '[class*="newsletter"]',
    '[class*="read-also"]', '[class*="read_also"]', '[class*="ReadAlso"]', '[data-nosnippet]',
  ].join(',');

  const SITE = {
    'ridus.ru': ['.article__content', '.article_text', '.js-mediator-article', 'article .text'],
    'ria.ru': ['.article__body', '.article__text'],
    'lenta.ru': ['.topic-body__content', '.topic-body'],
    'meduza.io': ['.GeneralMaterial-article', '.MaterialContent', 'article'],
    'bbc.com': ['article'],
    'rbc.ru': ['.article__text', '.article__content'],
    'tass.ru': ['.text-content', '.ArticleContent'],
    'kommersant.ru': ['.article_text_wrapper', '.doc__body'],
    'gazeta.ru': ['.b_article-text', '.article-text'],
    'dzen.ru': ['.article-render', 'article'],
  };

  const JUNK =
    /^(поделиться|share|читайте также|читайте ещё|вам может понравиться|подписывайтесь|подписка|реклама|комментарии|источник:|фото:|видео:|теги:|материалы по теме|новости партнёров|cookie|cookies|принять)/i;

  function cyrRatio(text) {
    const letters = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
    if (!letters.length) return 0;
    return letters.replace(/[^а-яА-ЯёЁ]/g, '').length / letters.length;
  }

  function normalize(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function scrub(text) {
    return normalize(
      text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !JUNK.test(l) && !/^https?:\/\//i.test(l))
        .join('\n')
    );
  }

  function prepareForTts(text) {
    let t = String(text || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/[“”«»]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/…+/g, '...')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\r/g, '')
      .replace(/\n+/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    t = t.replace(/^[-–—]+\s*/, '');
    t = t.replace(/\s*[—–]{1,2}\s*/g, ', ');
    t = t.replace(/\s+-\s+/g, ', ');
    t = t.replace(/\s{2,}/g, ' ');
    t = t.replace(/\s+([,.!?…:;])/g, '$1');
    t = t.replace(/([.!?…]){2,}/g, '$1');
    t = t.trim();

    if (!/[а-яА-ЯёЁa-zA-Z]/.test(t)) return '';
    const letters = (t.match(/[а-яА-ЯёЁa-zA-Z]/g) || []).length;
    if (letters < 2) return '';
    return t;
  }

  function softenForRetry(text) {
    let t = prepareForTts(text).replace(/,/g, '.').replace(/\s+/g, ' ').trim();
    if (!/[.!?…]$/.test(t)) t += '.';
    return t;
  }

  function split(text, limit) {
    if (text.length <= limit) return [text];
    const chunks = [];
    let rest = text;
    while (rest.length > limit) {
      const slice = rest.slice(0, limit);
      let cut = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('\n'),
        slice.lastIndexOf(' ')
      );
      if (cut < limit * 0.5) cut = limit;
      else if (slice[cut] === '.') cut += 1;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
    return chunks.filter(Boolean);
  }

  function textFromNode(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll(JUNK_NODE).forEach((el) => el.remove());
    return normalize(clone.innerText || '');
  }

  function findArticleRoot() {
    const host = location.hostname.replace(/^www\./, '');
    const selectors = [
      ...(SITE[host] || []),
      'article',
      '[itemprop="articleBody"]',
      '.article__text',
      '.article-text',
      '.article-body',
      '.post-content',
      '.entry-content',
      '.js-mediator-article',
      '[class*="article__content"]',
      'main article',
      'main',
    ];
    let best = null;
    let bestScore = 0;
    for (const sel of selectors) {
      for (const node of document.querySelectorAll(sel)) {
        if (node.closest('aside,nav,footer,[class*="sidebar"],[class*="recommend"],[class*="related"]')) continue;
        const text = textFromNode(node);
        if (text.length < 200) continue;
        const r = cyrRatio(text);
        if (r < 0.35) continue;
        const score = text.length * (0.4 + 0.6 * r);
        if (score > bestScore) {
          best = node;
          bestScore = score;
        }
      }
    }
    return best || document.querySelector('article') || document.body;
  }

  function collectParagraphs(root) {
    if (!root) return [];
    let nodes = [...root.querySelectorAll('p, h2, h3, h4, li, blockquote')];
    nodes = nodes.filter((el, _, arr) => !arr.some((o) => o !== el && el.contains(o)));
    nodes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

    const out = [];
    let id = 1;
    for (const el of nodes) {
      if (
        el.closest(
          'aside,nav,footer,[class*="sidebar"],[class*="recommend"],[class*="related"],[class*="share"],[class*="comment"]'
        )
      ) {
        continue;
      }
      const tag = el.tagName.toLowerCase();
      let text = scrub(normalize(el.innerText || ''));
      if (!text) continue;
      if (JUNK.test(text)) continue;
      if (cyrRatio(text) < 0.4) continue;
      const isHeading = /^h[2-4]$/.test(tag);
      const isDialogue = /^[-–—]\s*\S/.test(text);
      const minLen = isHeading || isDialogue ? 6 : 12;
      if (text.length < minLen) continue;
      out.push({ id: id++, el, text });
    }
    return out;
  }

  function pack(paragraphs, target, hardMax) {
    const units = [];
    let buf = [];
    let size = 0;

    const flush = () => {
      if (!buf.length) return;
      let text = '';
      const ranges = [];
      const pids = [];
      for (const p of buf) {
        const piece = prepareForTts(p.text);
        if (!piece) continue;
        let start;
        if (!text) {
          text = piece;
          start = 0;
        } else {
          const sep = /[.!?…:]$/.test(text) ? ' ' : '. ';
          const cleaned = piece.replace(/^[-–—]\s+/, '');
          start = text.length + sep.length;
          text = `${text}${sep}${cleaned}`;
        }
        pids.push(p.id);
        ranges.push({ pid: p.id, start, end: text.length });
      }
      if (!text) {
        buf = [];
        size = 0;
        return;
      }
      units.push({ text, pids, ranges });
      buf = [];
      size = 0;
    };

    for (const p of paragraphs) {
      if (p.text.length > hardMax) {
        flush();
        const cut = prepareForTts(p.text.slice(0, hardMax));
        if (cut) {
          units.push({
            text: cut,
            pids: [p.id],
            ranges: [{ pid: p.id, start: 0, end: cut.length }],
          });
        }
        continue;
      }
      if (size && size + p.text.length + 2 > hardMax) flush();
      if (size >= target && size + p.text.length > target * 1.35) flush();
      buf.push(p);
      size += p.text.length + 2;
      if (size >= target) flush();
    }
    flush();
    return units;
  }

  function findTitleElement(spokenTitle) {
    const target = prepareForTts(spokenTitle);
    if (!target) return null;
    const tip = target.slice(0, Math.min(28, target.length)).toLowerCase();
    const selectors = [
      'h1', 'h1 span', '[itemprop="headline"]', '.article__title', '.article-title',
      '.post__title', '.post-title', '.material__title',
      '[class*="articleTitle"]', '[class*="article__title"]', '[class*="ArticleTitle"]',
      'article h1', 'main h1',
    ];
    let best = null;
    let bestScore = 0;
    const seen = new Set();
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (el.closest('nav,aside,footer,[class*="recommend"],[class*="related"]')) continue;
        const raw = el.innerText || '';
        if (raw.length < 8 || raw.length > 300) continue;
        const t = prepareForTts(raw);
        if (!t) continue;
        const tl = t.toLowerCase();
        let score = 0;
        if (tl === target.toLowerCase()) score = 2000;
        else if (tl.startsWith(tip) || target.toLowerCase().startsWith(tl.slice(0, Math.min(28, tl.length)))) score = 1200;
        else if (tl.includes(tip)) score = 600;
        else continue;
        if (/^h[12]$/i.test(el.tagName)) score += 150;
        score -= Math.min(80, Math.abs(t.length - target.length));
        if (score > bestScore) {
          bestScore = score;
          best = /^h[12]$/i.test(el.tagName) ? el : el.closest('h1,h2') || el;
        }
      }
    }
    return bestScore >= 600 ? best : document.querySelector('article h1, main h1, h1');
  }

  function ensureHighlightStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      [data-mrt-plus-pid].mrt-plus-active {
        background-color: rgba(47,111,237,.28) !important;
        box-shadow: inset 4px 0 0 #2f6fed, 0 0 0 3px rgba(47,111,237,.4) !important;
        border-radius: 4px;
      }
      [data-mrt-plus-pid].mrt-plus-done {
        background-color: rgba(47,111,237,.1) !important;
        box-shadow: inset 4px 0 0 rgba(47,111,237,.4) !important;
        border-radius: 4px;
      }
      h1[data-mrt-plus-pid].mrt-plus-active,
      h2[data-mrt-plus-pid].mrt-plus-active,
      [data-mrt-plus-pid="${TITLE_PID}"].mrt-plus-active {
        background-color: rgba(47,111,237,.32) !important;
        box-shadow: 0 0 0 6px rgba(47,111,237,.35), inset 0 0 0 9999px rgba(47,111,237,.12) !important;
      }
      h1[data-mrt-plus-pid].mrt-plus-done,
      [data-mrt-plus-pid="${TITLE_PID}"].mrt-plus-done {
        background-color: rgba(47,111,237,.12) !important;
        box-shadow: 0 0 0 4px rgba(47,111,237,.2) !important;
      }`;
    document.documentElement.appendChild(s);
  }

  function clearHighlights() {
    document.querySelectorAll('.mrt-plus-active, .mrt-plus-done').forEach((el) => {
      el.classList.remove('mrt-plus-active', 'mrt-plus-done');
    });
    document.querySelectorAll('[data-mrt-plus-pid]').forEach((el) => {
      el.removeAttribute('data-mrt-plus-pid');
    });
  }

  function buildSpeakPlan(selectionOnly) {
    ensureHighlightStyle();
    clearHighlights();

    if (selectionOnly) {
      const t = prepareForTts(scrub(normalize(window.getSelection()?.toString() || '')));
      if (t.length < 40) return null;
      const chunks = split(t, HARD_MAX).map((c) => prepareForTts(c)).filter(Boolean);
      return {
        pageUrl: location.origin + location.pathname + location.search,
        chunks,
        units: chunks.map((x) => ({ text: x, pids: [], ranges: [] })),
      };
    }

    const root = findArticleRoot();
    const title = prepareForTts(
      scrub(
        normalize(
          document.querySelector('h1')?.innerText ||
            document.querySelector('[property="og:title"]')?.getAttribute('content') ||
            ''
        )
      )
    );

    const paragraphs = collectParagraphs(root);
    if (!paragraphs.length) {
      let fb = prepareForTts(scrub(textFromNode(root || document.body)));
      if (fb.length < 40) return null;
      if (title && !fb.startsWith(title)) fb = `${title}. ${fb}`;
      const chunks = split(fb, Math.min(HARD_MAX, UNIT_TARGET * 4)).map((c) => prepareForTts(c)).filter(Boolean);
      return {
        pageUrl: location.origin + location.pathname + location.search,
        chunks,
        units: chunks.map((x) => ({ text: x, pids: [], ranges: [] })),
      };
    }

    paragraphs.forEach((p) => {
      p.el.setAttribute('data-mrt-plus-pid', String(p.id));
    });

    let units = pack(paragraphs, UNIT_TARGET, HARD_MAX);
    if (title && units.length && !units[0].text.startsWith(title)) {
      const sep = /[.!?…:]$/.test(title) ? ' ' : '. ';
      const prefix = `${title}${sep}`;
      const shift = prefix.length;
      const titleEl = findTitleElement(title);
      if (titleEl) {
        titleEl.setAttribute('data-mrt-plus-pid', String(TITLE_PID));
      }
      units[0] = {
        text: prefix + units[0].text,
        pids: titleEl ? [TITLE_PID, ...units[0].pids] : units[0].pids,
        ranges: [
          { pid: TITLE_PID, start: 0, end: shift },
          ...(units[0].ranges || []).map((r) => ({
            pid: r.pid,
            start: r.start + shift,
            end: r.end + shift,
          })),
        ],
      };
    }

    return {
      pageUrl: location.origin + location.pathname + location.search,
      chunks: units.map((u) => u.text),
      units,
    };
  }

  function highlightPid(pid, donePids) {
    ensureHighlightStyle();
    document.querySelectorAll('.mrt-plus-active').forEach((el) => el.classList.remove('mrt-plus-active'));
    (donePids || []).forEach((id) => {
      const el = document.querySelector(`[data-mrt-plus-pid="${id}"]`);
      el?.classList.add('mrt-plus-done');
    });
    const active = document.querySelector(`[data-mrt-plus-pid="${pid}"]`);
    if (active) {
      active.classList.remove('mrt-plus-done');
      active.classList.add('mrt-plus-active');
      try {
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {}
    }
  }

  function pageUrlKey() {
    try {
      return location.origin + location.pathname + location.search;
    } catch (_) {
      return String(location.href || '');
    }
  }

  global.MRTPlusExtract = {
    buildSpeakPlan,
    clearHighlights,
    highlightPid,
    prepareForTts,
    softenForRetry,
    pageUrlKey,
    VERSION: '1.0.0',
  };
})(typeof window !== 'undefined' ? window : globalThis);
