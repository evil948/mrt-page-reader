/* Generated from mrt-page-reader.user.js - do not edit by hand; run tools/build-extension.ps1 */
'use strict';

const GM = {
  async getValue(key, def) {
    const data = await browser.storage.local.get(key);
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : def;
  },
  async setValue(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
  registerMenuCommand() {
    /* context menus live in background.js */
  },
};

(function () {
  'use strict';

  /**
   * Прямая озвучка через тот же Uniproxy (Alice/Yandex Translate), что использует MRT.
   * Звук играет в этой вкладке → клик «Озвучить» / Alt+R разблокирует автозвук.
   */

  const SESSION_KEY = 'mrt_plus_session';
  const PREFS_KEY = 'mrt_plus_prefs';
  const UNIT_TARGET = 1600;
  const HARD_MAX = 4500;
  const TITLE_PID = 0;
  const HOST_ID = 'mrt-plus-host';
  const STYLE_ID = 'mrt-plus-highlight-style';
  const HOTKEY_CODE = 'KeyR';
  const CHARS_PER_MIN = 900;
  // Публичный browser-ключ из MRT / Yandex Translate
  const SPEECHKIT_KEY = 'bf4277fc-06c0-405a-b278-b796bbbd3f27';
  const UNIPROXY_URL = 'wss://uniproxy.alice.yandex.net/uni.ws';
  const TTS_FORMAT = 'audio/opus'; // сервер отдаёт Ogg Opus
  // Только «нормальные» голоса, которые реально отвечают через Uniproxy.
  // Cloud-голоса (filipp, alena, dasha…) и эффектные (zombie, robot, dude, smoky) — нет.
  const VOICES = [
    { id: 'zahar', label: 'Zahar' },
    { id: 'ermil', label: 'Ermil' },
    { id: 'ermilov', label: 'Ermilov' },
    { id: 'oksana', label: 'Oksana' },
    { id: 'jane', label: 'Jane' },
    { id: 'omazh', label: 'Omazh' },
    { id: 'nastya', label: 'Nastya' },
    { id: 'sasha', label: 'Sasha' },
    { id: 'alyss', label: 'Alyss' },
    { id: 'kolya', label: 'Kolya' },
    { id: 'kostya', label: 'Kostya' },
    { id: 'anton_samokhvalov', label: 'Anton' },
    { id: 'tatyana_shitova', label: 'Alice' },
    { id: 'tatyana_abramova', label: 'Tatyana' },
  ];
  const VOICE_IDS = new Set(VOICES.map((v) => v.id));
  const DEFAULT_PREFS = {
    voice: 'zahar',
    emotion: 'neutral',
    speed: 1,
    offsetRight: 16,
    offsetBottom: 16,
  };

  let prefs = { ...DEFAULT_PREFS };
  let paragraphMap = new Map();
  let isPlaying = false;
  let isPaused = false;
  let audioEl = null;
  let audioUrl = null;
  let audioCtx = null;
  let ttsClient = null;
  let runToken = 0;
  let lastHighlightKey = '';
  let lastPageUrl = '';

  if (window !== window.top) return;

  initParent();

  async function initParent() {
    prefs = { ...DEFAULT_PREFS, ...(await GM.getValue(PREFS_KEY, {})) };
    if (!VOICE_IDS.has(prefs.voice)) {
      prefs.voice = DEFAULT_PREFS.voice;
      await GM.setValue(PREFS_KEY, prefs);
    }
    ensureHighlightStyle();
    GM.registerMenuCommand('Озвучить страницу (MRT+) — Alt+R', () => startSpeak());
    GM.registerMenuCommand('Озвучить выделенное (MRT+)', () => startSpeak({ selectionOnly: true }));
    GM.registerMenuCommand('Стоп (MRT+)', () => stopPlayback());
    injectLauncher();
    bindHotkey();
    watchPageChanges();
  }

  function pageUrlKey() {
    try {
      return location.origin + location.pathname + location.search;
    } catch (_) {
      return String(location.href || '');
    }
  }

  function watchPageChanges() {
    lastPageUrl = pageUrlKey();
    const check = () => {
      const next = pageUrlKey();
      if (!next || next === lastPageUrl) return;
      lastPageUrl = next;
      resetForNewPage('Статья сменилась — озвучка сброшена.');
    };
    window.addEventListener('popstate', check);
    window.addEventListener('hashchange', check);
    for (const method of ['pushState', 'replaceState']) {
      const orig = history[method];
      if (typeof orig !== 'function') continue;
      history[method] = function (...args) {
        const ret = orig.apply(this, args);
        queueMicrotask(check);
        return ret;
      };
    }
    // запасной путь: часть сайтов меняет URL нестандартно
    setInterval(check, 800);
  }

  async function resetForNewPage(statusMsg = '') {
    runToken += 1;
    stopAudio();
    try {
      ttsClient?.close();
    } catch (_) {}
    ttsClient = null;
    clearHighlights();
    document.querySelectorAll('[data-mrt-plus-pid]').forEach((el) => {
      el.removeAttribute('data-mrt-plus-pid');
    });
    paragraphMap = new Map();
    lastHighlightKey = '';
    try {
      const session = (await GM.getValue(SESSION_KEY, null)) || {};
      session.stopped = true;
      session.paused = false;
      session.done = true;
      session.chunks = [];
      session.units = [];
      session.index = 0;
      await GM.setValue(SESSION_KEY, session);
    } catch (_) {}
    setTransportUi({ playing: false, paused: false });
    if (statusMsg) {
      setPanelOpen(true);
      setStatus(statusMsg);
      setTimeout(() => {
        setStatus('');
        setPanelOpen(false);
      }, 2000);
    } else {
      setStatus('');
      setPanelOpen(false);
    }
  }

  function ui() {
    const root = document.getElementById(HOST_ID)?.shadowRoot;
    return {
      root,
      wrap: root?.getElementById('wrap'),
      panel: root?.getElementById('panel'),
      fab: root?.getElementById('fab'),
      status: root?.getElementById('status'),
      speakBtn: root?.getElementById('speak'),
      pauseBtn: root?.getElementById('pause'),
      resumeBtn: root?.getElementById('resume'),
      stopBtn: root?.getElementById('stop'),
      voiceSel: root?.getElementById('voice'),
    };
  }

  function setPanelOpen(open) {
    const { wrap, fab } = ui();
    if (!wrap) return;
    wrap.classList.toggle('open', Boolean(open));
    if (fab) {
      fab.setAttribute('aria-expanded', open ? 'true' : 'false');
      fab.title = open ? 'Свернуть MRT+' : 'MRT+ · Alt+R';
      fab.textContent = open ? '×' : '▶';
    }
  }

  function ensureLauncher() {
    injectLauncher();
    return document.getElementById(HOST_ID);
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
    const { wrap, speakBtn, pauseBtn, resumeBtn, stopBtn } = ui();
    wrap?.classList.toggle('busy', playing || paused);
    if (speakBtn) speakBtn.style.display = !playing && !paused ? 'inline-flex' : 'none';
    if (pauseBtn) pauseBtn.style.display = playing && !paused ? 'inline-flex' : 'none';
    if (resumeBtn) resumeBtn.style.display = paused ? 'inline-flex' : 'none';
    if (stopBtn) stopBtn.style.display = playing || paused ? 'inline-flex' : 'none';
    if (playing || paused) setPanelOpen(true);
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
        outline: none !important;
      }
      [data-mrt-plus-pid].mrt-plus-done {
        background-color: rgba(47,111,237,.1) !important;
        box-shadow: inset 4px 0 0 rgba(47,111,237,.4) !important;
        border-radius: 4px;
      }
      /* заголовки часто без «фона абзаца» — делаем заметнее */
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
    lastHighlightKey = '';
  }

  function audioProgress() {
    const cur = audioEl;
    if (!cur || !Number.isFinite(cur.duration) || cur.duration <= 0) return 0;
    if (!Number.isFinite(cur.currentTime)) return 0;
    return Math.min(1, Math.max(0, cur.currentTime / cur.duration));
  }

  /** Позиция в тексте по доле проигранного аудио (без опережения — иначе скачет на следующий абзац). */
  function audioPosInText(text, progress) {
    const len = text?.length || 0;
    if (!len) return 0;
    const p = Math.min(1, Math.max(0, progress));
    return Math.min(len, p * len);
  }

  /** Подсветка текущего абзаца по прогрессу аудио внутри блока */
  function highlightProgress(session, { forceScroll = false } = {}) {
    const unit = session?.units?.[session.index];
    if (!unit?.ranges?.length) {
      highlightUnit(session);
      return;
    }

    const progress = session.audioConfirmed && !session.paused ? audioProgress() : 0;
    const pos = audioPosInText(unit.text, progress);
    let active = unit.ranges[0];
    for (const r of unit.ranges) {
      if (pos >= r.start) active = r;
      if (pos < r.end) {
        active = r;
        break;
      }
    }

    const key = `${session.index}:${active.pid}:${Math.floor(progress * 80)}`;
    // классы обновляем при смене абзаца; скролл — только тогда
    const paragraphChanged = lastHighlightKey.split(':').slice(0, 2).join(':') !== `${session.index}:${active.pid}`;
    if (key === lastHighlightKey && !forceScroll) return;
    lastHighlightKey = key;

    document.querySelectorAll('.mrt-plus-active, .mrt-plus-done').forEach((el) => {
      el.classList.remove('mrt-plus-active', 'mrt-plus-done');
    });

    let activeEl = null;
    for (const r of unit.ranges) {
      let el = paragraphMap.get(r.pid) || document.querySelector(`[data-mrt-plus-pid="${r.pid}"]`);
      if (!el && r.pid === TITLE_PID) {
        el = findTitleElement(unit.text.slice(0, r.end));
        if (el) {
          el.setAttribute('data-mrt-plus-pid', String(TITLE_PID));
          paragraphMap.set(TITLE_PID, el);
        }
      }
      if (!el) continue;
      if (r.end <= pos + 0.5) el.classList.add('mrt-plus-done');
      else if (r.pid === active.pid) {
        el.classList.add('mrt-plus-active');
        activeEl = el;
      }
    }
    if (!activeEl && active.pid === TITLE_PID) {
      activeEl = findTitleElement(unit.text.slice(0, Math.max(active.end, 40)));
      if (activeEl) {
        activeEl.setAttribute('data-mrt-plus-pid', String(TITLE_PID));
        paragraphMap.set(TITLE_PID, activeEl);
        activeEl.classList.add('mrt-plus-active');
      }
    }
    if (!activeEl) {
      activeEl = paragraphMap.get(active.pid) || document.querySelector(`[data-mrt-plus-pid="${active.pid}"]`);
      activeEl?.classList.add('mrt-plus-active');
    }

    if ((paragraphChanged || forceScroll) && activeEl) {
      try {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {}
    }
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
    const voiceOpts = VOICES.map(
      (v) => `<option value="${v.id}" ${prefs.voice === v.id ? 'selected' : ''}>${v.label}</option>`
    ).join('');
    root.innerHTML = `
      <style>
        .wrap{position:fixed;right:${prefs.offsetRight}px;bottom:${prefs.offsetBottom}px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:Segoe UI,system-ui,sans-serif}
        .panel{display:none;flex-direction:column;align-items:flex-end;gap:8px}
        .wrap.open .panel{display:flex}
        button,select{border:0;cursor:pointer;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.22);color:#fff;font-size:13px;font-weight:600;padding:10px 14px}
        select{background:#3a3a3c;appearance:none;padding-right:28px}
        .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center}
        .main{background:#2f6fed}.pause{background:#c48a16;display:none}.resume{background:#2f9e44;display:none}.stop{background:#d94848;display:none}
        .kbd{opacity:.85;font-size:11px;background:rgba(255,255,255,.18);padding:2px 6px;border-radius:6px;margin-left:6px}
        .status{max-width:340px;background:rgba(20,20,20,.92);color:#fff;font-size:12px;padding:8px 10px;border-radius:8px;display:none;white-space:pre-wrap}
        .status.show{display:block}
        .fab{width:40px;height:40px;padding:0;border-radius:50%;background:#2f6fed;opacity:.4;box-shadow:0 2px 10px rgba(0,0,0,.18);font-size:15px;line-height:1;display:inline-flex;align-items:center;justify-content:center;transition:opacity .15s ease,transform .15s ease}
        .fab:hover,.wrap.open .fab,.wrap.busy .fab{opacity:.95}
        .wrap.busy .fab{background:#c48a16}
        .wrap.open .fab{background:#4a4a4c}
      </style>
      <div class="wrap" id="wrap">
        <div class="panel" id="panel">
          <div class="status" id="status"></div>
          <div class="row">
            <select id="voice" title="Голос Яндекса">${voiceOpts}</select>
            <button class="pause" id="pause" type="button">⏸ Пауза</button>
            <button class="resume" id="resume" type="button">▶ Далее</button>
            <button class="stop" id="stop" type="button">■ Стоп</button>
            <button class="main" id="speak" type="button">Озвучить <span class="kbd">Alt+R</span></button>
          </div>
        </div>
        <button class="fab" id="fab" type="button" title="MRT+ · Alt+R" aria-expanded="false" aria-controls="panel">▶</button>
      </div>`;

    const fab = root.getElementById('fab');
    fab.onclick = (e) => {
      e.stopPropagation();
      const open = !root.getElementById('wrap').classList.contains('open');
      setPanelOpen(open);
    };
    root.getElementById('speak').onclick = () => startSpeak();
    root.getElementById('pause').onclick = () => togglePause(true);
    root.getElementById('resume').onclick = () => resumePlayback();
    root.getElementById('stop').onclick = () => stopPlayback();
    root.getElementById('voice').onchange = async (e) => {
      prefs.voice = e.target.value;
      await GM.setValue(PREFS_KEY, prefs);
    };

    // клик вне панели сворачивает, если не идёт озвучка
    document.addEventListener(
      'pointerdown',
      (e) => {
        const wrap = ui().wrap;
        if (!wrap?.classList.contains('open') || wrap.classList.contains('busy')) return;
        if (host.contains(e.target)) return;
        setPanelOpen(false);
      },
      true
    );
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

  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = audioCtx || new AC();
        audioCtx.resume?.();
      }
    } catch (_) {}
    try {
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.preload = 'auto';
      }
      // тихий unlock в том же жесте пользователя
      audioEl.muted = true;
      const p = audioEl.play();
      if (p?.then) {
        p.then(() => {
          audioEl.pause();
          audioEl.muted = false;
          audioEl.removeAttribute('src');
        }).catch(() => {
          audioEl.muted = false;
        });
      }
    } catch (_) {}
  }

  function eta(session) {
    const chunks = session.chunks || [];
    const idx = session.index || 0;
    if (idx >= chunks.length) return '~1 сек';

    // текущий блок — по реальному прогрессу Audio, остальные — по длине текста
    let sec = 0;
    const cur = audioEl;
    if (
      cur &&
      session.audioConfirmed &&
      !session.paused &&
      Number.isFinite(cur.duration) &&
      cur.duration > 0 &&
      Number.isFinite(cur.currentTime)
    ) {
      sec += Math.max(0, cur.duration - cur.currentTime);
    } else {
      sec += (chunks[idx].length / CHARS_PER_MIN) * 60;
    }
    for (let i = idx + 1; i < chunks.length; i++) {
      sec += (chunks[i].length / CHARS_PER_MIN) * 60;
    }

    if (sec < 5) return '~несколько сек';
    if (sec < 60) return `~${Math.max(5, Math.round(sec / 5) * 5)} сек`;
    const m = sec / 60;
    if (m < 10) return `~${m.toFixed(1).replace('.0', '')} мин`;
    return `~${Math.round(m)} мин`;
  }

  function formatStatus(session, prefix = '▶') {
    const n = session.chunks?.length || 1;
    const i = Math.min((session.index || 0) + 1, n);
    const head = n > 1 ? `Блок ${i}/${n}` : 'Озвучка';
    const voice = VOICES.find((v) => v.id === (prefs.voice || 'zahar'))?.label || prefs.voice;
    if (!session?.audioConfirmed && !session?.paused) return `Готовлю Яндекс… ${head} · ${voice}`;
    return `${prefix} ${head} · ${voice} · осталось ${eta(session)}`;
  }

  async function startSpeak({ selectionOnly = false, resumeSession = null } = {}) {
    unlockAudio();
    ensureLauncher();
    setPanelOpen(true);
    const token = ++runToken;
    let session = resumeSession;

    if (!session) {
      clearHighlights();
      paragraphMap = new Map();
      const built = buildSpeakPlan({ selectionOnly });
      if (!built?.chunks?.length) {
        setStatus(selectionOnly ? 'Слишком короткое выделение.' : 'Не удалось найти текст статьи.');
        setTimeout(() => {
          setStatus('');
          if (!isPlaying && !isPaused) setPanelOpen(false);
        }, 2200);
        return;
      }
      session = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pageUrl: pageUrlKey(),
        chunks: built.chunks,
        units: built.units,
        index: 0,
        stopped: false,
        paused: false,
        done: false,
        error: null,
        audioConfirmed: false,
        chunkStartedAt: null,
        mode: 'direct',
        ts: Date.now(),
      };
    } else {
      if (session.pageUrl && session.pageUrl !== pageUrlKey()) {
        setStatus('Статья сменилась. Нажмите «Озвучить» снова.');
        setTransportUi({ playing: false, paused: false });
        return;
      }
      Object.assign(session, {
        stopped: false,
        paused: false,
        done: false,
        error: null,
        audioConfirmed: false,
        mode: 'direct',
        pageUrl: session.pageUrl || pageUrlKey(),
        ts: Date.now(),
      });
      rebuildParagraphMapFromDom();
    }

    await GM.setValue(SESSION_KEY, session);
    setTransportUi({ playing: true, paused: false });
    highlightProgress(session, { forceScroll: true });
    setStatus(formatStatus(session));

    try {
      await playSession(session, token);
    } catch (err) {
      if (token !== runToken) return;
      setTransportUi({ playing: false, paused: true });
      setStatus(`Ошибка TTS: ${err?.message || err}\n«▶ Далее» — повторить.`);
    }
  }

  async function playSession(session, token) {
    ttsClient = ttsClient || new UniproxyTTS(SPEECHKIT_KEY);
    await ttsClient.connect();

    const voiceOpts = () => ({
      voice: prefs.voice || 'zahar',
      emotion: prefs.emotion || 'neutral',
      speed: Number(prefs.speed) || 1,
      lang: 'ru-RU',
    });

    const pageStillSame = () => !session.pageUrl || session.pageUrl === pageUrlKey();

    const synthAt = async (index) => {
      // текст блока уже подготовлен в pack/prepareForTts — не перетираем длину,
      // иначе прогресс подсветки разъезжается с аудио
      const prepared = session.chunks[index];
      const trySynth = async (text) => {
        try {
          return await ttsClient.synthesize(text, voiceOpts());
        } catch (_) {
          try {
            ttsClient.close();
          } catch (_) {}
          ttsClient = new UniproxyTTS(SPEECHKIT_KEY);
          await ttsClient.connect();
          return ttsClient.synthesize(text, voiceOpts());
        }
      };

      let audio = await trySynth(prepared);
      if (isWeakTtsAudio(audio, prepared)) {
        const retryText = softenForRetry(prepared);
        const audio2 = await trySynth(retryText);
        if (audio2 && audio2.byteLength >= (audio?.byteLength || 0)) audio = audio2;
      }
      return audio;
    };

    // пока играет блок N — уже качаем N+1 (без паузы на сеть между блоками)
    let nextOggPromise = synthAt(session.index);

    while (session.index < session.chunks.length) {
      if (token !== runToken) return;
      if (!pageStillSame()) {
        await resetForNewPage('Статья сменилась — озвучка сброшена.');
        return;
      }
      session = (await GM.getValue(SESSION_KEY, null)) || session;
      if (!session || session.stopped) {
        stopAudio();
        return;
      }
      while (session.paused) {
        await sleep(200);
        session = (await GM.getValue(SESSION_KEY, null)) || session;
        if (!session || session.stopped || token !== runToken) {
          stopAudio();
          return;
        }
      }

      session.audioConfirmed = false;
      session.chunkStartedAt = null;
      session.error = null;
      session.ts = Date.now();
      await GM.setValue(SESSION_KEY, session);
      highlightProgress(session, { forceScroll: true });
      setStatus(formatStatus(session));

      const ogg = await nextOggPromise;
      if (token !== runToken) return;

      // сразу заказываем следующий, пока текущий ещё только начнёт играть
      const following = session.index + 1;
      nextOggPromise =
        following < session.chunks.length ? synthAt(following) : null;

      session = (await GM.getValue(SESSION_KEY, null)) || session;
      if (!session || session.stopped) {
        stopAudio();
        return;
      }

      session.audioConfirmed = true;
      session.chunkStartedAt = Date.now();
      await GM.setValue(SESSION_KEY, session);
      setTransportUi({ playing: true, paused: false });
      setStatus(formatStatus(session, '▶'));

      await playOgg(ogg);

      if (token !== runToken) return;
      session = (await GM.getValue(SESSION_KEY, null)) || session;
      if (!session || session.stopped) return;
      if (session.paused) {
        // после паузы пересоберём текущий/следующий заново
        nextOggPromise = synthAt(session.index);
        continue;
      }

      session.index += 1;
      session.audioConfirmed = false;
      session.chunkStartedAt = null;
      await GM.setValue(SESSION_KEY, session);
    }

    session = (await GM.getValue(SESSION_KEY, null)) || session;
    if (!session) return;
    session.done = true;
    await GM.setValue(SESSION_KEY, session);
    clearHighlights();
    setTransportUi({ playing: false, paused: false });
    setStatus(session.chunks.length > 1 ? `Готово: ${session.chunks.length} блоков.` : 'Готово.');
    setTimeout(() => {
      setStatus('');
      setPanelOpen(false);
    }, 2200);
  }

  function playOgg(bytes) {
    return new Promise(async (resolve, reject) => {
      try {
        stopAudio(false);
        const blob = new Blob([bytes], { type: 'audio/ogg' });
        audioUrl = URL.createObjectURL(blob);
        audioEl = audioEl || new Audio();
        audioEl.src = audioUrl;
        audioEl.onended = () => resolve();
        audioEl.onerror = () => reject(new Error('не удалось проиграть аудио'));
        const p = audioEl.play();
        if (p?.catch) await p;

        const tick = async () => {
          const s = await GM.getValue(SESSION_KEY, null);
          if (!s || s.stopped) {
            stopAudio();
            resolve();
            return;
          }
          if (s.paused) {
            try {
              audioEl.pause();
            } catch (_) {}
            setStatus(formatStatus(s, '⏸'));
            while (true) {
              await sleep(300);
              const s2 = await GM.getValue(SESSION_KEY, null);
              if (!s2 || s2.stopped) {
                stopAudio();
                resolve();
                return;
              }
              if (!s2.paused) {
                try {
                  await audioEl.play();
                } catch (_) {}
                setStatus(formatStatus(s2, '▶'));
                break;
              }
            }
          } else if (s.audioConfirmed) {
            setStatus(formatStatus(s, '▶'));
            highlightProgress(s);
          }
          if (audioEl && !audioEl.paused && !audioEl.ended) {
            setTimeout(tick, 200);
          }
        };
        setTimeout(tick, 150);
      } catch (e) {
        reject(e);
      }
    });
  }

  function stopAudio(clearSrc = true) {
    try {
      if (audioEl) {
        audioEl.onended = null;
        audioEl.onerror = null;
        audioEl.pause();
        if (clearSrc) {
          audioEl.removeAttribute('src');
          audioEl.load?.();
        }
      }
    } catch (_) {}
    if (audioUrl) {
      try {
        URL.revokeObjectURL(audioUrl);
      } catch (_) {}
      audioUrl = null;
    }
  }

  async function togglePause(force) {
    ensureLauncher();
    setPanelOpen(true);
    const session = (await GM.getValue(SESSION_KEY, null)) || {};
    if (!session.chunks?.length || session.done || session.stopped) return;
    if (force || !session.paused) {
      session.paused = true;
      await GM.setValue(SESSION_KEY, session);
      try {
        audioEl?.pause();
      } catch (_) {}
      setTransportUi({ playing: true, paused: true });
      setStatus(formatStatus(session, '⏸'));
    } else resumePlayback();
  }

  async function resumePlayback() {
    ensureLauncher();
    setPanelOpen(true);
    let session = await GM.getValue(SESSION_KEY, null);
    if (!session?.chunks?.length || session.done) {
      setStatus('Нечего продолжать.');
      return;
    }
    if (session.pageUrl && session.pageUrl !== pageUrlKey()) {
      setStatus('Статья сменилась. Нажмите «Озвучить».');
      setTransportUi({ playing: false, paused: false });
      return;
    }
    session.stopped = false;
    session.paused = false;
    session.ts = Date.now();
    await GM.setValue(SESSION_KEY, session);
    rebuildParagraphMapFromDom();
    highlightProgress(session, { forceScroll: true });

    // если аудио на паузе в середине блока — продолжить элемент
    if (audioEl && audioEl.src && !audioEl.ended && audioEl.currentTime > 0) {
      unlockAudio();
      setTransportUi({ playing: true, paused: false });
      setStatus(formatStatus(session, '▶'));
      try {
        await audioEl.play();
      } catch (_) {
        await startSpeak({ resumeSession: session });
      }
      return;
    }
    unlockAudio();
    await startSpeak({ resumeSession: session });
  }

  async function stopPlayback() {
    runToken += 1;
    const session = (await GM.getValue(SESSION_KEY, null)) || {};
    session.stopped = true;
    session.paused = false;
    await GM.setValue(SESSION_KEY, session);
    stopAudio();
    try {
      ttsClient?.close();
    } catch (_) {}
    ttsClient = null;
    if (session.chunks?.length && !session.done && session.index < session.chunks.length) {
      ensureLauncher();
      setTransportUi({ playing: false, paused: true });
      setStatus(`Остановлено. ${formatStatus(session, '■')}\n«▶ Далее» — продолжить.`);
    } else {
      clearHighlights();
      setTransportUi({ playing: false, paused: false });
      setStatus('Остановлено.');
      setTimeout(() => {
        setStatus('');
        setPanelOpen(false);
      }, 1500);
    }
  }

  function rebuildParagraphMapFromDom() {
    paragraphMap = new Map();
    document.querySelectorAll('[data-mrt-plus-pid]').forEach((el) => {
      const id = Number(el.getAttribute('data-mrt-plus-pid'));
      if (Number.isFinite(id)) paragraphMap.set(id, el);
    });
  }

  // ---------------- Yandex Uniproxy TTS ----------------

  class UniproxyTTS {
    constructor(apiKey) {
      this.apiKey = apiKey;
      this.ws = null;
      this.seq = 1;
      this.uuid = guid();
      this.pending = null;
    }

    connect() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(UNIPROXY_URL);
        this.ws = ws;
        ws.binaryType = 'arraybuffer';
        const timer = setTimeout(() => reject(new Error('таймаут Uniproxy')), 12000);
        ws.onopen = () => {
          this.sendEvent('System', 'SynchronizeState', {
            uuid: this.uuid,
            auth_token: this.apiKey,
            vins: {
              application: {
                lang: 'ru',
                platform: 'windows',
                uuid: this.uuid,
                app_id: 'ru.yandex.translate.desktop',
              },
            },
          });
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('WebSocket Uniproxy'));
        };
        ws.onclose = () => {
          this.ws = null;
        };
        ws.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            let msg;
            try {
              msg = JSON.parse(ev.data);
            } catch (_) {
              return;
            }
            if (msg?.directive?.header?.name === 'SynchronizeStateResponse') {
              clearTimeout(timer);
              resolve();
              return;
            }
            this._onJson(msg);
            return;
          }
          if (ev.data instanceof ArrayBuffer) this._onBinary(ev.data);
        };
      });
    }

    close() {
      try {
        this.ws?.close();
      } catch (_) {}
      this.ws = null;
      this.pending = null;
    }

    sendEvent(namespace, name, payload = {}) {
      const messageId = guid();
      const { streamId, ...rest } = payload;
      const packet = {
        event: {
          header: {
            namespace,
            name,
            messageId,
            streamId,
            seqNumber: this.seq++,
          },
          payload: rest,
        },
      };
      this.ws.send(JSON.stringify(packet));
      return messageId;
    }

    synthesize(text, { voice = 'zahar', lang = 'ru-RU', speed = 1, emotion = 'neutral' } = {}) {
      return new Promise((resolve, reject) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          reject(new Error('нет соединения Uniproxy'));
          return;
        }
        const chunks = [];
        let streamId = null;
        const self = this;
        const timer = setTimeout(() => {
          self.pending = null;
          reject(new Error('таймаут синтеза'));
        }, 60000);

        const messageId = this.sendEvent('tts', 'Generate', {
          text,
          lang,
          voice,
          speed,
          emotion,
          format: TTS_FORMAT,
        });

        this.pending = {
          messageId,
          onSpeak(id) {
            streamId = id;
          },
          onData(sid, buf) {
            if (streamId == null) streamId = sid;
            if (sid === streamId) chunks.push(new Uint8Array(buf));
          },
          onClose(sid) {
            if (streamId != null && sid !== streamId) return;
            clearTimeout(timer);
            self.pending = null;
            if (!chunks.length) {
              reject(new Error('пустой ответ TTS'));
              return;
            }
            const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
            let off = 0;
            for (const c of chunks) {
              out.set(c, off);
              off += c.length;
            }
            resolve(out.buffer);
          },
          onError(err) {
            clearTimeout(timer);
            self.pending = null;
            reject(new Error(err || 'ошибка TTS'));
          },
        };
      });
    }

    _onJson(msg) {
      const p = this.pending;
      if (!p) return;
      if (msg?.directive) {
        const d = msg.directive;
        const h = d.header || {};
        if (h.namespace === 'System' && (h.name === 'EventException' || h.name === 'InvalidAuth')) {
          p.onError(d.payload?.error?.message || h.name);
          return;
        }
        if (h.namespace === 'TTS' && h.name === 'Speak' && h.refMessageId === p.messageId) {
          if (h.streamId != null) p.onSpeak(h.streamId);
          else p.onError('нет streamId');
        }
        return;
      }
      if (msg?.streamcontrol) {
        const sc = msg.streamcontrol;
        // CLOSE = 0
        if (sc.action === 0 || sc.action === 'close') p.onClose(sc.streamId);
      }
    }

    _onBinary(buf) {
      const p = this.pending;
      if (!p || buf.byteLength < 4) return;
      const sid = new DataView(buf).getUint32(0);
      p.onData(sid, buf.slice(4));
    }
  }

  function guid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---------------- Article extraction ----------------

  function cyrRatio(text) {
    const letters = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
    if (!letters.length) return 0;
    return letters.replace(/[^а-яА-ЯёЁ]/g, '').length / letters.length;
  }

  function buildSpeakPlan({ selectionOnly = false } = {}) {
    if (selectionOnly) {
      const t = prepareForTts(scrub(normalize(window.getSelection()?.toString() || '')));
      if (t.length < 40) return null;
      const chunks = split(t, HARD_MAX).map((c) => prepareForTts(c)).filter(Boolean);
      return { chunks, units: chunks.map((x) => ({ text: x, pids: [], ranges: [] })) };
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
      return { chunks, units: chunks.map((x) => ({ text: x, pids: [], ranges: [] })) };
    }

    paragraphMap = new Map();
    paragraphs.forEach((p) => {
      p.el.setAttribute('data-mrt-plus-pid', String(p.id));
      paragraphMap.set(p.id, p.el);
    });

    let units = pack(paragraphs, UNIT_TARGET, HARD_MAX);
    if (title && units.length && !units[0].text.startsWith(title)) {
      const sep = /[.!?…:]$/.test(title) ? ' ' : '. ';
      const prefix = `${title}${sep}`;
      const shift = prefix.length;
      const titleEl = findTitleElement(title);
      if (titleEl) {
        titleEl.setAttribute('data-mrt-plus-pid', String(TITLE_PID));
        paragraphMap.set(TITLE_PID, titleEl);
      }
      // range для title добавляем всегда: иначе пока читается заголовок
      // подсветка прыгает на первый абзац
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
    return { chunks: units.map((u) => u.text), units };
  }

  /** Ищем DOM-узел заголовка по тексту (не только h1 — вёрстка сайтов разная). */
  function findTitleElement(spokenTitle) {
    const target = prepareForTts(spokenTitle);
    if (!target) return null;
    const tip = target.slice(0, Math.min(28, target.length)).toLowerCase();
    const selectors = [
      'h1',
      'h1 span',
      '[itemprop="headline"]',
      '.article__title',
      '.article-title',
      '.post__title',
      '.post-title',
      '.material__title',
      '[class*="articleTitle"]',
      '[class*="article__title"]',
      '[class*="ArticleTitle"]',
      'article h1',
      'main h1',
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
        // предпочитаем сам заголовок, а не огромную обёртку
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

  function textFromNode(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll(JUNK_NODE).forEach((el) => el.remove());
    return normalize(clone.innerText || '');
  }

  const JUNK_NODE = [
    'script',
    'style',
    'noscript',
    'nav',
    'footer',
    'aside',
    'form',
    'iframe',
    'button',
    'svg',
    '.share',
    '.social',
    '.comments',
    '.related',
    '.recomend',
    '.recommend',
    '.tags',
    '.breadcrumb',
    '.breadcrumbs',
    '[class*="banner"]',
    '[class*="advert"]',
    '[class*="subscribe"]',
    '[class*="newsletter"]',
    '[class*="read-also"]',
    '[class*="read_also"]',
    '[class*="ReadAlso"]',
    '[data-nosnippet]',
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

  /**
   * Текст «для ушей»: убирает то, на чём Yandex TTS часто срывается в вздох/шум
   * (голые тире, переносы абзацев, мусорные символы).
   */
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

    // ведущее тире реплики и тире-паузы посередине
    t = t.replace(/^[-–—]+\s*/, '');
    t = t.replace(/\s*[—–]{1,2}\s*/g, ', ');
    t = t.replace(/\s+-\s+/g, ', ');
    t = t.replace(/\s{2,}/g, ' ');
    t = t.replace(/\s+([,.!?…:;])/g, '$1');
    t = t.replace(/([.!?…]){2,}/g, '$1');
    t = t.trim();

    if (!/[а-яА-ЯёЁa-zA-Z]/.test(t)) return '';
    // одна «голая» буква/междометие без контекста — модель часто «пыхтит»
    const letters = (t.match(/[а-яА-ЯёЁa-zA-Z]/g) || []).length;
    if (letters < 2) return '';
    return t;
  }

  function softenForRetry(text) {
    let t = prepareForTts(text)
      .replace(/,/g, '.')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/[.!?…]$/.test(t)) t += '.';
    return t;
  }

  function isWeakTtsAudio(buf, text) {
    const letters = ((text || '').match(/[а-яА-ЯёЁa-zA-Z]/g) || []).length;
    if (!buf || letters < 28) return false;
    // нормальный ogg opus обычно заметно тяжелее «вздоха»
    return buf.byteLength < Math.max(2800, letters * 35);
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

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Extension bridge: context menu + browser command Alt+R
  if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
    browser.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'mrt-plus') return;
      if (msg.action === 'speak') startSpeak();
      else if (msg.action === 'speak-selection') startSpeak({ selectionOnly: true });
      else if (msg.action === 'stop') stopPlayback();
      else if (msg.action === 'toggle') {
        if (isPaused) resumePlayback();
        else if (isPlaying) togglePause(true);
        else startSpeak();
      }
    });
  }
})();