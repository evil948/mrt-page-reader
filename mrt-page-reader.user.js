// ==UserScript==
// @name         [MRT+] Озвучить страницу
// @namespace    https://github.com/evil948/mrt-page-reader
// @version      1.5.7
// @description  Озвучка статьи через MRT (голоса Яндекса): Alt+R, подсветка, таймер
// @author       evil948
// @match        *://*/*
// @match        https://alkohole.github.io/machine-reading-text/*
// @updateURL    https://raw.githubusercontent.com/evil948/mrt-page-reader/main/mrt-page-reader.user.js
// @downloadURL  https://raw.githubusercontent.com/evil948/mrt-page-reader/main/mrt-page-reader.user.js
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /**
   * MRT (alkohole.github.io) + Яндекс SpeechKit (Web Audio).
   * Автозвук: пробуем popup по клику «Озвучить» (жест сохраняется);
   * иначе iframe — один клик «Старт» из‑за политики браузера.
   */

  const MRT_URL = 'https://alkohole.github.io/machine-reading-text/index.html';
  const SESSION_KEY = 'mrt_plus_session';
  const PREFS_KEY = 'mrt_plus_prefs';
  const UNIT_TARGET = 1600;
  const HARD_MAX = 19000;
  const HOST_ID = 'mrt-plus-host';
  const STYLE_ID = 'mrt-plus-highlight-style';
  const HOTKEY_CODE = 'KeyR';
  const CHARS_PER_MIN = 900;
  const DEFAULT_PREFS = { showPanel: true, offsetRight: 16, offsetBottom: 16 };

  let prefs = { ...DEFAULT_PREFS };
  let paragraphMap = new Map();
  let isPlaying = false;
  let isPaused = false;
  let playerPopup = null;

  const isMrtUi =
    location.hostname === 'alkohole.github.io' &&
    location.pathname.includes('machine-reading-text');

  if (isMrtUi) {
    bootMrtReceiver();
    return;
  }
  if (window !== window.top) return;

  initParent();

  async function initParent() {
    prefs = { ...DEFAULT_PREFS, ...(await GM.getValue(PREFS_KEY, {})) };
    ensureHighlightStyle();
    GM.registerMenuCommand('Озвучить страницу (MRT+) — Alt+R', () => startSpeak());
    GM.registerMenuCommand('Озвучить выделенное (MRT+)', () => startSpeak({ selectionOnly: true }));
    GM.registerMenuCommand('Стоп (MRT+)', () => stopPlayback());
    injectLauncher();
    bindHotkey();
  }

  function ui() {
    const root = document.getElementById(HOST_ID)?.shadowRoot;
    return {
      root,
      wrap: root?.getElementById('wrap'),
      panel: root?.getElementById('panel'),
      frame: root?.getElementById('frame'),
      status: root?.getElementById('status'),
      speakBtn: root?.getElementById('speak'),
      pauseBtn: root?.getElementById('pause'),
      resumeBtn: root?.getElementById('resume'),
      stopBtn: root?.getElementById('stop'),
    };
  }

  function setStatus(msg) {
    const el = ui().status;
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('show', Boolean(msg));
  }

  function setTransportUi({ playing = false, paused = false } = {}) {
    isPlaying = playing;
    isPaused = paused;
    const { speakBtn, pauseBtn, resumeBtn, stopBtn } = ui();
    if (speakBtn) speakBtn.style.display = !playing && !paused ? 'inline-flex' : 'none';
    if (pauseBtn) pauseBtn.style.display = playing && !paused ? 'inline-flex' : 'none';
    if (resumeBtn) resumeBtn.style.display = paused ? 'inline-flex' : 'none';
    if (stopBtn) stopBtn.style.display = playing || paused ? 'inline-flex' : 'none';
  }

  function ensureHighlightStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      [data-mrt-plus-pid].mrt-plus-active {
        background: rgba(47,111,237,.16) !important;
        box-shadow: inset 3px 0 0 #2f6fed;
        border-radius: 4px;
      }`;
    document.documentElement.appendChild(s);
  }

  function clearHighlights() {
    document.querySelectorAll('.mrt-plus-active').forEach((el) => el.classList.remove('mrt-plus-active'));
  }

  function highlightUnit(session) {
    clearHighlights();
    const unit = session?.units?.[session.index];
    if (!unit?.pids?.length) return;
    let first = null;
    for (const pid of unit.pids) {
      const el = paragraphMap.get(pid) || document.querySelector(`[data-mrt-plus-pid="${pid}"]`);
      if (!el) continue;
      el.classList.add('mrt-plus-active');
      if (!first) first = el;
    }
    try {
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {}
  }

  function injectLauncher() {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;';
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .wrap{position:fixed;right:${prefs.offsetRight}px;bottom:${prefs.offsetBottom}px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:Segoe UI,system-ui,sans-serif}
        button{border:0;cursor:pointer;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.25);color:#fff;font-size:13px;font-weight:600;padding:10px 14px;display:inline-flex;gap:8px;align-items:center}
        .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .main{background:#2f6fed}.pause{background:#c48a16;display:none}.resume{background:#2f9e44;display:none}.stop{background:#d94848;display:none}
        .kbd{opacity:.85;font-size:11px;background:rgba(255,255,255,.18);padding:2px 6px;border-radius:6px}
        .panel{display:none;width:min(360px,calc(100vw - 24px));height:520px;background:#1c1c1e;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 12px 40px rgba(0,0,0,.35)}
        .panel.open{display:block}
        iframe{width:100%;height:100%;border:0;background:#f4f1ea}
        .close{position:absolute;top:8px;right:8px;z-index:2;width:28px;height:28px;padding:0;justify-content:center;background:#ff5e5e}
        .status{max-width:340px;background:rgba(20,20,20,.92);color:#fff;font-size:12px;padding:8px 10px;border-radius:8px;display:none;white-space:pre-wrap}
        .status.show{display:block}
      </style>
      <div class="wrap" id="wrap">
        <div class="status" id="status"></div>
        <div class="panel" id="panel">
          <button class="close" id="close" type="button">×</button>
          <iframe id="frame" title="MRT" allow="autoplay; fullscreen"></iframe>
        </div>
        <div class="row">
          <button class="pause" id="pause" type="button">⏸ Пауза</button>
          <button class="resume" id="resume" type="button">▶ Далее</button>
          <button class="stop" id="stop" type="button">■ Стоп</button>
          <button class="main" id="speak" type="button">Озвучить <span class="kbd">Alt+R</span></button>
        </div>
      </div>`;

    root.getElementById('speak').onclick = () => startSpeak();
    root.getElementById('pause').onclick = () => togglePause(true);
    root.getElementById('resume').onclick = () => resumePlayback();
    root.getElementById('stop').onclick = () => stopPlayback();
    root.getElementById('close').onclick = () => ui().panel?.classList.remove('open');
  }

  function bindHotkey() {
    window.addEventListener(
      'keydown',
      (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (e.code !== HOTKEY_CODE) return;
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
        e.preventDefault();
        e.stopPropagation();
        if (isPaused) resumePlayback();
        else if (isPlaying) togglePause(true);
        else startSpeak();
      },
      true
    );
  }

  function postToFrame(msg) {
    try {
      ui().frame?.contentWindow?.postMessage(msg, '*');
    } catch (_) {}
    try {
      if (playerPopup && !playerPopup.closed) playerPopup.postMessage(msg, '*');
    } catch (_) {}
  }

  function eta(session) {
    let left = 0;
    for (let i = session.index || 0; i < (session.chunks?.length || 0); i++) left += session.chunks[i].length;
    if (session.chunkStartedAt && !session.paused) {
      left = Math.max(0, left - ((Date.now() - session.chunkStartedAt) / 60000) * CHARS_PER_MIN);
    }
    const m = left / CHARS_PER_MIN;
    if (m < 1) return `~${Math.max(1, Math.round(m * 60))} сек`;
    if (m < 10) return `~${m.toFixed(1).replace('.0', '')} мин`;
    return `~${Math.round(m)} мин`;
  }

  function formatStatus(session, prefix = '▶') {
    if (session?.needsGesture) {
      return session.mode === 'popup'
        ? 'В окне MRT нажмите ▶ Старт — один раз.'
        : 'Текст в панели MRT готов.\nНажмите ▶ Старт в панели — один раз (иначе браузер глушит звук).';
    }
    const n = session.chunks?.length || 1;
    const i = Math.min((session.index || 0) + 1, n);
    const head = n > 1 ? `Блок ${i}/${n}` : 'Озвучка';
    if (!session?.audioConfirmed && !session?.paused) {
      return session.mode === 'popup' ? `Окно MRT… ${head}` : `Готовлю MRT… ${head}`;
    }
    return `${prefix} ${head} · осталось ${eta(session)}`;
  }

  async function startSpeak({ selectionOnly = false, resumeSession = null } = {}) {
    const { panel, frame } = ui();
    let session = resumeSession;

    if (!session) {
      clearHighlights();
      paragraphMap = new Map();
      const built = buildSpeakPlan({ selectionOnly });
      if (!built?.chunks?.length) {
        setStatus(selectionOnly ? 'Слишком короткое выделение.' : 'Не удалось найти текст статьи.');
        return;
      }
      session = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        chunks: built.chunks,
        units: built.units,
        index: 0,
        stopped: false,
        paused: false,
        done: false,
        error: null,
        audioConfirmed: false,
        needsGesture: false,
        chunkStartedAt: null,
        ts: Date.now(),
      };
    } else {
      Object.assign(session, {
        stopped: false,
        paused: false,
        done: false,
        error: null,
        audioConfirmed: false,
        needsGesture: false,
        ts: Date.now(),
      });
      rebuildParagraphMapFromDom();
    }

    const playUrl = `${MRT_URL}?mrtplus=${encodeURIComponent(session.id)}&t=${Date.now()}`;

    // Popup открывается в том же пользовательском жесте, что и «Озвучить» —
    // браузер чаще разрешает автозвук, чем во вложенном iframe.
    let popup = null;
    try {
      popup = window.open(playUrl, 'mrt_plus_player', 'popup=yes,width=400,height=720');
    } catch (_) {
      popup = null;
    }
    const usePopup = Boolean(popup && !popup.closed);
    session.mode = usePopup ? 'popup' : 'iframe';
    playerPopup = usePopup ? popup : null;

    await GM.setValue(SESSION_KEY, session);
    setTransportUi({ playing: false, paused: false });
    highlightUnit(session);

    if (usePopup) {
      panel?.classList.remove('open');
      if (frame) frame.src = 'about:blank';
      setStatus('Озвучка в окне MRT (Яндекс)…\nНе закрывайте его до конца статьи.');
      try {
        popup.focus();
      } catch (_) {}
    } else {
      setStatus('Открываю MRT (Яндекс)…');
      panel?.classList.add('open');
      if (frame) frame.src = playUrl;
    }
    watchSession(session.id);
  }

  async function togglePause(force) {
    const session = (await GM.getValue(SESSION_KEY, null)) || {};
    if (!session.chunks?.length || session.done || session.stopped) return;
    if (force || !session.paused) {
      session.paused = true;
      await GM.setValue(SESSION_KEY, session);
      postToFrame({ type: 'mrt-plus-pause' });
      setTransportUi({ playing: true, paused: true });
      setStatus(formatStatus(session, '⏸'));
    } else resumePlayback();
  }

  async function resumePlayback() {
    let session = await GM.getValue(SESSION_KEY, null);
    if (!session?.chunks?.length || session.done) {
      setStatus('Нечего продолжать.');
      return;
    }
    const { frame, panel } = ui();
    const dead = !frame || !frame.src || frame.src === 'about:blank';
    session.stopped = false;
    session.paused = false;
    session.needsGesture = false;
    await GM.setValue(SESSION_KEY, session);
    rebuildParagraphMapFromDom();
    highlightUnit(session);
    panel?.classList.add('open');
    setTransportUi({ playing: true, paused: false });
    setStatus(formatStatus(session, '▶'));
    if (dead) {
      await startSpeak({ resumeSession: session });
      return;
    }
    postToFrame({ type: 'mrt-plus-resume' });
    watchSession(session.id);
  }

  async function stopPlayback() {
    const session = (await GM.getValue(SESSION_KEY, null)) || {};
    session.stopped = true;
    session.paused = false;
    await GM.setValue(SESSION_KEY, session);
    postToFrame({ type: 'mrt-plus-stop' });
    const { frame, panel } = ui();
    if (frame) frame.src = 'about:blank';
    panel?.classList.remove('open');
    try {
      if (playerPopup && !playerPopup.closed) playerPopup.close();
    } catch (_) {}
    playerPopup = null;
    try {
      window.open('', 'mrt_plus_player')?.close();
    } catch (_) {}
    if (session.chunks?.length && !session.done && session.index < session.chunks.length) {
      setTransportUi({ playing: false, paused: true });
      setStatus(`Остановлено. ${formatStatus(session, '■')}\n«▶ Далее» — продолжить.`);
    } else {
      clearHighlights();
      setTransportUi({ playing: false, paused: false });
      setStatus('Остановлено.');
    }
  }

  async function watchSession(sessionId) {
    let last = -1;
    const t0 = Date.now();
    while (Date.now() - t0 < 6 * 60 * 60 * 1000) {
      await sleep(600);
      const session = await GM.getValue(SESSION_KEY, null);
      if (!session || session.id !== sessionId) return;
      if (session.error) {
        setTransportUi({ playing: false, paused: true });
        setStatus(`Ошибка: ${session.error}`);
        return;
      }
      if (session.stopped && !session.paused) return;
      if (session.needsGesture) {
        ui().panel?.classList.add('open');
        setTransportUi({ playing: false, paused: false });
        setStatus(formatStatus(session));
        continue;
      }
      if (session.paused) {
        setTransportUi({ playing: true, paused: true });
        setStatus(formatStatus(session, '⏸'));
        continue;
      }
      if (session.done) {
        clearHighlights();
        setTransportUi({ playing: false, paused: false });
        setStatus(session.chunks.length > 1 ? `Готово: ${session.chunks.length} блоков.` : 'Готово.');
        return;
      }
      if (session.index !== last) {
        last = session.index;
        highlightUnit(session);
      }
      if (session.audioConfirmed) {
        setTransportUi({ playing: true, paused: false });
        setStatus(formatStatus(session, '▶'));
      } else {
        setStatus(formatStatus(session));
      }
    }
  }

  function rebuildParagraphMapFromDom() {
    paragraphMap = new Map();
    document.querySelectorAll('[data-mrt-plus-pid]').forEach((el) => {
      const id = Number(el.getAttribute('data-mrt-plus-pid'));
      if (Number.isFinite(id)) paragraphMap.set(id, el);
    });
  }

  function cyrRatio(text) {
    const letters = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
    if (!letters.length) return 0;
    return letters.replace(/[^а-яА-ЯёЁ]/g, '').length / letters.length;
  }

  function buildSpeakPlan({ selectionOnly = false } = {}) {
    if (selectionOnly) {
      const t = scrub(normalize(window.getSelection()?.toString() || ''));
      if (t.length < 40) return null;
      const chunks = split(t, HARD_MAX);
      return { chunks, units: chunks.map((x) => ({ text: x, pids: [] })) };
    }

    const root = findArticleRoot();
    const title = scrub(
      normalize(
        document.querySelector('h1')?.innerText ||
          document.querySelector('[property="og:title"]')?.getAttribute('content') ||
          ''
      )
    );

    const paragraphs = collectParagraphs(root);
    if (!paragraphs.length) {
      let fb = scrub(textFromNode(root || document.body));
      if (fb.length < 40) return null;
      if (title && !fb.startsWith(title)) fb = `${title}\n\n${fb}`;
      const chunks = split(fb, Math.min(HARD_MAX, UNIT_TARGET * 4));
      return { chunks, units: chunks.map((x) => ({ text: x, pids: [] })) };
    }

    paragraphMap = new Map();
    paragraphs.forEach((p) => {
      p.el.setAttribute('data-mrt-plus-pid', String(p.id));
      paragraphMap.set(p.id, p.el);
    });

    let units = pack(paragraphs, UNIT_TARGET, HARD_MAX);
    if (title && units.length && !units[0].text.startsWith(title)) {
      units[0] = { text: `${title}\n\n${units[0].text}`, pids: units[0].pids };
    }
    return { chunks: units.map((u) => u.text), units };
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

    // Всегда берём и абзацы, и подзаголовки, и цитаты (раньше h2/h3 пропускались,
    // если хватало обычных <p> — из‑за этого выпадали куски вроде «Петер Мадьяр…»)
    let nodes = [
      ...root.querySelectorAll('p, h2, h3, h4, li, blockquote'),
    ];

    // убрать обёртки, если внутри уже есть текстовые узлы из списка
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

      // подзаголовки и короткие реплики («— Кому угодно?») часто < 15 символов
      const isHeading = /^h[2-4]$/.test(tag);
      const isDialogue = /^[-–—]\s*\S/.test(text);
      const minLen = isHeading || isDialogue ? 6 : 12;
      if (text.length < minLen) continue;

      // не резать огромные обёртки-blockquote целиком, если внутри уже разобрали p
      // (такие blockquote отфильтрованы через contains выше)

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
      units.push({ text: buf.map((p) => p.text).join('\n\n'), pids: buf.map((p) => p.id) });
      buf = [];
      size = 0;
    };
    for (const p of paragraphs) {
      if (p.text.length > hardMax) {
        flush();
        units.push({ text: p.text.slice(0, hardMax), pids: [p.id] });
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

  function textFromNode(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll(JUNK_NODE).forEach((el) => el.remove());
    return normalize(clone.innerText || '');
  }

  const JUNK_NODE = [
    'script','style','noscript','nav','footer','aside','form','iframe','button','svg',
    '.share','.social','.comments','.related','.recomend','.recommend','.tags','.breadcrumb','.breadcrumbs',
    '[class*="banner"]','[class*="advert"]','[class*="subscribe"]','[class*="newsletter"]',
    '[class*="read-also"]','[class*="read_also"]','[class*="ReadAlso"]','[data-nosnippet]',
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

  function scrub(text) {
    return normalize(
      text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !JUNK.test(l) && !/^https?:\/\//i.test(l))
        .join('\n')
    );
  }

  function normalize(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
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

  // ---------------- MRT page (Яндекс TTS) ----------------

  async function bootMrtReceiver() {
    window.addEventListener('message', (e) => {
      const t = e.data?.type;
      if (t === 'mrt-plus-stop') forceStop(true);
      if (t === 'mrt-plus-pause') forcePause();
      if (t === 'mrt-plus-resume') forceResume();
    });

    const textarea = await waitFor(() => document.getElementById('textarea'), 20000);
    const playBtn = await waitFor(() => document.getElementById('textSpeaker'), 20000);
    if (!textarea || !playBtn) return;

    const session = await GM.getValue(SESSION_KEY, null);
    if (!session?.chunks?.length || session.stopped || session.done) return;
    if (Date.now() - (session.ts || 0) > 30 * 60 * 1000) return;

    await runLoop(textarea, playBtn);
  }

  async function runLoop(textarea, playBtn) {
    let session = await GM.getValue(SESSION_KEY, null);
    let unlocked = false;

    while (session && session.index < session.chunks.length) {
      session = (await GM.getValue(SESSION_KEY, null)) || session;
      if (!session || session.stopped) {
        forceStop(true);
        return;
      }
      while (session.paused) {
        await sleep(400);
        session = (await GM.getValue(SESSION_KEY, null)) || session;
        if (!session || session.stopped) {
          forceStop(true);
          return;
        }
      }

      const chunk = session.chunks[session.index];
      session.audioConfirmed = false;
      session.needsGesture = false;
      session.chunkStartedAt = null;
      session.error = null;
      session.ts = Date.now();
      await GM.setValue(SESSION_KEY, session);

      let ok = await playChunk(textarea, playBtn, chunk, session.id, !unlocked);
      if (!ok && unlocked) {
        // следующий блок иногда снова глушит автозвук — даём ещё один «Старт»
        ok = await playChunk(textarea, playBtn, chunk, session.id, true);
      }
      if (ok) unlocked = true;

      session = (await GM.getValue(SESSION_KEY, null)) || session;
      if (!session || session.stopped) {
        forceStop(true);
        return;
      }
      if (session.paused) continue;
      if (!ok) {
        session.error = 'нет звука';
        await GM.setValue(SESSION_KEY, session);
        return;
      }
      session.index += 1;
      session.audioConfirmed = false;
      session.chunkStartedAt = null;
      await GM.setValue(SESSION_KEY, session);
      await sleep(700);
    }

    session = (await GM.getValue(SESSION_KEY, null)) || session;
    if (!session) return;
    session.done = true;
    await GM.setValue(SESSION_KEY, session);
  }

  async function playChunk(textarea, playBtn, chunk, sessionId, allowGesture) {
    textarea.value = chunk;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(500);
    if (playBtn.textContent.includes('✖')) return false;

    if (playBtn.classList.contains('state-playing')) {
      playBtn.click();
      await sleep(400);
    }

    resumeAudioContexts();
    playBtn.click();
    let audible = await waitAudible(5000);

    if (!audible && allowGesture) {
      await setFlag(sessionId, { needsGesture: true, audioConfirmed: false });
      const clicked = await gestureOverlay(playBtn, sessionId);
      await setFlag(sessionId, { needsGesture: false });
      if (!clicked) return false;
      audible = await waitAudible(12000);
    }

    if (!audible) {
      resumeAudioContexts();
      playBtn.click();
      audible = await waitAudible(5000);
    }

    if (!audible) return false;

    await setFlag(sessionId, { audioConfirmed: true, chunkStartedAt: Date.now(), needsGesture: false });

    // ждём конца блока: MRT часто без <audio>, только Web Audio + state-playing
    let sawPlaying = false;
    const waitStart = Date.now();
    while (true) {
      const s = await GM.getValue(SESSION_KEY, null);
      if (!s || s.id !== sessionId || s.stopped) {
        forceStop(true);
        return false;
      }
      if (s.paused) {
        forcePause();
        while (true) {
          await sleep(400);
          const s2 = await GM.getValue(SESSION_KEY, null);
          if (!s2 || s2.id !== sessionId || s2.stopped) {
            forceStop(true);
            return false;
          }
          if (!s2.paused) {
            forceResume();
            break;
          }
        }
      }

      const playing = isMrtPlaying(playBtn);
      if (playing) sawPlaying = true;
      if (sawPlaying && !playing) {
        await sleep(600);
        if (!isMrtPlaying(playBtn)) break;
      }
      // страховка: если так и не увидели playing — не крутимся вечно
      if (!sawPlaying && Date.now() - waitStart > 15000) return false;
      await sleep(350);
    }
    await sleep(500);
    return true;
  }

  async function setFlag(sessionId, patch) {
    const s = await GM.getValue(SESSION_KEY, null);
    if (!s || s.id !== sessionId) return;
    Object.assign(s, patch, { ts: Date.now() });
    await GM.setValue(SESSION_KEY, s);
  }

  function gestureOverlay(playBtn, sessionId) {
    return new Promise((resolve) => {
      let overlay = document.getElementById('mrt-plus-gesture');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'mrt-plus-gesture';
        overlay.innerHTML = `
          <style>
            #mrt-plus-gesture{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(10,10,15,.75);font-family:Segoe UI,system-ui,sans-serif}
            #mrt-plus-gesture .box{background:#1f2430;color:#fff;border-radius:16px;padding:22px;width:min(320px,calc(100vw - 32px));text-align:center}
            #mrt-plus-gesture button{border:0;border-radius:999px;background:#2f6fed;color:#fff;font-weight:700;font-size:16px;padding:12px 18px;width:100%;cursor:pointer}
          </style>
          <div class="box">
            <p style="margin:0 0 14px;line-height:1.4">Браузер блокирует автозвук.<br>Один клик — и дальше блоки пойдут сами (голос Яндекса).</p>
            <button type="button" id="mrt-plus-go">▶ Старт</button>
          </div>`;
        document.documentElement.appendChild(overlay);
      }
      const btn = overlay.querySelector('#mrt-plus-go');
      overlay.style.display = 'flex';
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        overlay.style.display = 'none';
        resolve(ok);
      };
      btn.onclick = () => {
        try {
          resumeAudioContexts();
          if (playBtn.classList.contains('state-playing')) playBtn.click();
          playBtn.click();
        } catch (_) {}
        finish(true);
      };
      (async () => {
        while (!done) {
          const s = await GM.getValue(SESSION_KEY, null);
          if (!s || s.id !== sessionId || s.stopped) {
            finish(false);
            return;
          }
          await sleep(400);
        }
      })();
    });
  }

  function resumeAudioContexts() {
    try {
      const set = window.audioSources?.audioContexts;
      if (!set) return;
      for (const ctx of set) {
        try {
          if (ctx?.state === 'suspended') ctx.resume();
        } catch (_) {}
      }
    } catch (_) {}
  }

  function anyHtmlAudio() {
    try {
      return [...document.querySelectorAll('audio')].some(
        (a) => !a.paused && !a.ended && a.currentTime > 0.02
      );
    } catch (_) {
      return false;
    }
  }

  function anyAudioContextRunning() {
    try {
      const set = window.audioSources?.audioContexts;
      if (!set) return false;
      for (const ctx of set) {
        if (ctx && ctx.state === 'running') return true;
      }
    } catch (_) {}
    return false;
  }

  function isMrtPlaying(playBtn) {
    if (playBtn?.classList.contains('state-playing')) return true;
    if (anyHtmlAudio()) return true;
    if (anyAudioContextRunning()) return true;
    return false;
  }

  async function waitAudible(ms) {
    const t0 = Date.now();
    const playBtn = document.getElementById('textSpeaker');
    while (Date.now() - t0 < ms) {
      if (isMrtPlaying(playBtn)) return true;
      await sleep(150);
    }
    return isMrtPlaying(playBtn);
  }

  function forcePause() {
    try {
      const playBtn = document.getElementById('textSpeaker');
      document.getElementById('speakerPause')?.click();
      if (playBtn?.classList.contains('state-playing')) document.getElementById('speakerPause')?.click();
      document.querySelectorAll('audio').forEach((a) => a.pause());
      try {
        const set = window.audioSources?.audioContexts;
        if (set) for (const ctx of set) ctx.suspend?.();
      } catch (_) {}
    } catch (_) {}
  }

  function forceResume() {
    try {
      resumeAudioContexts();
      document.getElementById('speakerPause')?.click();
      document.querySelectorAll('audio').forEach((a) => a.play()?.catch?.(() => {}));
    } catch (_) {}
  }

  function forceStop(reset) {
    try {
      const ov = document.getElementById('mrt-plus-gesture');
      if (ov) ov.style.display = 'none';
      const playBtn = document.getElementById('textSpeaker');
      if (playBtn?.classList.contains('state-playing')) playBtn.click();
      document.querySelectorAll('audio').forEach((a) => {
        a.pause();
        if (reset) a.currentTime = 0;
      });
    } catch (_) {}
  }

  function waitFor(fn, timeout) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const v = fn();
        if (v) return resolve(v);
        if (Date.now() - t0 > timeout) return resolve(null);
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
