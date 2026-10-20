/* ==========================================================================
   LeagueDB — Sala delle Maestrie
   Pagina dedicata ai punti maestria: hero animato, podio, insight,
   curiosità, collezione (griglia 3D + universo a bolle), modale e roulette.
   ========================================================================== */

const DD = 'https://ddragon.leagueoflegends.com/cdn';
const KEY_FIX = { FiddleSticks: 'Fiddlesticks' };
const fixKey = (k) => KEY_FIX[k] || k;
const splashImg = (k) => `${DD}/img/champion/splash/${fixKey(k)}_0.jpg`;
const loadingImg = (k) => `${DD}/img/champion/loading/${fixKey(k)}_0.jpg`;
const IMG_FALLBACK = `onerror="this.style.visibility='hidden'"`;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CLASS_META = {
  Fighter: { label: 'Combattente', emoji: '⚔️', color: 'hsl(14 85% 60%)' },
  Tank: { label: 'Tank', emoji: '🛡️', color: 'hsl(200 75% 56%)' },
  Mage: { label: 'Mago', emoji: '🔮', color: 'hsl(270 80% 68%)' },
  Assassin: { label: 'Assassino', emoji: '🗡️', color: 'hsl(340 80% 62%)' },
  Marksman: { label: 'Tiratore', emoji: '🏹', color: 'hsl(42 92% 58%)' },
  Support: { label: 'Supporto', emoji: '💖', color: 'hsl(160 60% 50%)' },
};

const LEVEL_BUCKETS = [
  [1, 3, '1–3'], [4, 6, '4–6'], [7, 9, '7–9'],
  [10, 14, '10–14'], [15, 24, '15–24'], [25, Infinity, '25+'],
];

const SORTS = {
  points_desc: (a, b) => b.points - a.points,
  points_asc: (a, b) => a.points - b.points,
  level_desc: (a, b) => b.level - a.level || b.points - a.points,
  recent: (a, b) => (b.lastPlay || 0) - (a.lastPlay || 0),
  games_desc: (a, b) => b.games - a.games || b.points - a.points,
  name_asc: (a, b) => a.name.localeCompare(b.name, 'it'),
};

let ctrl = null;            // AbortController della pagina corrente
let champDataCache = null;  // { version, map }

/** Interrompe animazioni, listener globali e sblocca lo scroll. */
export function cleanupMastery() {
  ctrl?.abort();
  ctrl = null;
  document.body.classList.remove('ms-lock');
}

function lvlInfo(l) {
  if (l >= 25) return { color: 'hsl(45 96% 62%)', cls: 'legend' };
  if (l >= 10) return { color: 'hsl(42 90% 58%)', cls: 'gold' };
  if (l >= 7) return { color: 'hsl(275 80% 70%)', cls: '' };
  if (l >= 4) return { color: 'hsl(222 90% 68%)', cls: '' };
  if (l >= 2) return { color: 'hsl(156 60% 50%)', cls: '' };
  return { color: 'hsl(225 10% 62%)', cls: '' };
}

async function loadChampData(version) {
  if (champDataCache?.version === version) return champDataCache.map;
  try {
    const res = await fetch(`${DD}/${version}/data/it_IT/champion.json`);
    const json = await res.json();
    const map = {};
    Object.values(json.data || {}).forEach((c) => {
      map[c.id] = { name: c.name, title: c.title, tags: c.tags || [] };
    });
    champDataCache = { version, map };
    return map;
  } catch {
    return {};
  }
}

/* ---------- Effetti riutilizzabili ---------- */
function countUp(el, target, fmtFn, dur = 1600) {
  if (REDUCED_MOTION) { el.textContent = fmtFn(target); return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = fmtFn(Math.round(target * e));
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const CONFETTI_COLORS = ['#f2c94c', '#7c6cf6', '#38bdf8', '#ff5b8a', '#3fbf7f', '#ff9f43', '#ffffff'];
function confetti(x, y, count = 140) {
  if (REDUCED_MOTION) return;
  const cv = document.createElement('canvas');
  cv.className = 'ms-confetti';
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 4 + Math.random() * 10;
    return {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6,
      s: 5 + Math.random() * 7, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35,
      c: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0], rect: Math.random() < 0.65,
    };
  });
  let t = 0;
  const LIFE = 150;
  (function frame() {
    t++;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach((p) => {
      p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, 1 - t / LIFE);
      ctx.fillStyle = p.c;
      if (p.rect) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      else { ctx.beginPath(); ctx.arc(0, 0, p.s / 3, 0, 6.283); ctx.fill(); }
      ctx.restore();
    });
    if (t < LIFE) requestAnimationFrame(frame); else cv.remove();
  })();
}

function burstFrom(el, count) {
  const r = el.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top + r.height / 3, count);
}

/* ==========================================================================
   RENDER
   ========================================================================== */
export async function renderMastery(puuid, d) {
  cleanupMastery();
  ctrl = new AbortController();
  const signal = ctrl.signal;
  const token = ++d.state.renderId;
  const { app, esc, fmt, fmtK, timeAgo, enc } = d;

  app.innerHTML = `
    <a href="#/player/${enc(puuid)}" class="back">‹ Profilo giocatore</a>
    <div class="card skeleton" style="height:340px"></div>
    <div class="card skeleton" style="height:300px"></div>
    <div class="ms-insights">${'<div class="card skeleton" style="height:260px"></div>'.repeat(3)}</div>`;

  let data, champMap;
  try {
    [data, champMap] = await Promise.all([
      d.api(`/players/${enc(puuid)}/mastery`),
      loadChampData(d.state.dd),
    ]);
  } catch (e) {
    if (token !== d.state.renderId) return;
    app.innerHTML = `<a href="#/player/${enc(puuid)}" class="back">‹ Profilo giocatore</a>${d.errorBox(e.message)}`;
    return;
  }
  if (token !== d.state.renderId) return;

  const p = data.player;
  document.title = `Maestrie di ${p.game_name}#${p.tag_line} — LeagueDB`;

  const list = data.masteries.map((m, i) => {
    const meta = champMap[m.champion_name] || {};
    const games = Number(m.games || 0);
    const wins = Number(m.wins || 0);
    return {
      key: m.champion_name,
      name: meta.name || m.champion_name,
      title: meta.title || m.champion_title || '',
      tags: meta.tags || [],
      points: Number(m.champion_points || 0),
      level: Number(m.champion_level || 0),
      lastPlay: m.last_play_time ? new Date(m.last_play_time).getTime() : null,
      lastPlayIso: m.last_play_time,
      games, wins,
      wr: games ? (wins / games) * 100 : null,
      kda: m.kda_ratio, avgK: m.avg_kills, avgD: m.avg_deaths, avgA: m.avg_assists,
      rank: i + 1,
    };
  });

  const back = `<a href="#/player/${enc(puuid)}" class="back fade-up">‹ Profilo giocatore</a>`;
  if (!list.length) {
    app.innerHTML = `${back}
      <div class="card empty ms-empty-state fade-up">
        <div class="ms-empty-emoji">🥚</div>
        <strong>Nessuna maestria ancora</strong>
        Torna al profilo e premi “Aggiorna” per scaricare i punti maestria dalla Riot API.
      </div>`;
    return;
  }

  /* ---------- Statistiche aggregate ---------- */
  const total = list.reduce((s, c) => s + c.points, 0);
  const levelSum = list.reduce((s, c) => s + c.level, 0);
  const lvl10 = list.filter((c) => c.level >= 10).length;
  const maxPts = list[0].points || 1;
  const top = list[0];
  const totalChamps = Object.keys(champMap).length || 170;
  const share = total ? (top.points / total) * 100 : 0;

  const classPts = {};
  list.forEach((c) => {
    const t = c.tags[0];
    if (t) classPts[t] = (classPts[t] || 0) + c.points;
  });
  const classList = Object.entries(classPts).sort((a, b) => b[1] - a[1]);

  const sparkles = Array.from({ length: 22 }, () =>
    `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;--s:${(2 + Math.random() * 4).toFixed(1)}px;--t:${(3 + Math.random() * 5).toFixed(1)}s;--dl:${(-Math.random() * 6).toFixed(1)}s"></i>`).join('');

  const heroStat = (val, label, icon, fmtFn = 'fmt') => `
    <div class="ms-hstat">
      <span class="ms-hstat-icon">${icon}</span>
      <div><b data-count="${val}" data-fmt="${fmtFn}">0</b><span>${label}</span></div>
    </div>`;

  app.innerHTML = `
    ${back}

    <section class="ms-hero fade-up" id="ms-hero">
      <div class="ms-hero-bg" style="background-image:url('${splashImg(top.key)}')"></div>
      <div class="ms-hero-shade"></div>
      <div class="ms-sparkles" aria-hidden="true">${sparkles}</div>
      <div class="ms-hero-content">
        <div class="ms-hero-id">
          <img class="avatar" src="${d.iconImg(p.profile_icon_id)}" alt="" ${IMG_FALLBACK}>
          <div>
            <span class="ms-eyebrow">✨ Sala delle Maestrie</span>
            <h1 class="ms-title">${esc(p.game_name)}<span class="tag">#${esc(p.tag_line)}</span></h1>
          </div>
        </div>
        <div class="ms-total">
          <span class="ms-total-num" data-count="${total}" data-fmt="fmt">0</span>
          <span class="ms-total-label">punti maestria totali</span>
        </div>
        <div class="ms-hero-stats">
          ${heroStat(list.length, 'Campioni', '🧩')}
          ${heroStat(levelSum, 'Punteggio maestria', '⭐')}
          ${heroStat(lvl10, 'Livello 10+', '🏅')}
          ${heroStat(Math.round(total / list.length), 'Media per campione', '📊', 'fmtK')}
        </div>
      </div>
      <button class="ms-main-badge" type="button" data-open="${esc(top.key)}" title="Apri dettagli">
        <img src="${d.champImg(top.key)}" alt="" ${IMG_FALLBACK}>
        <div><small>Il tuo main</small><strong>${esc(top.name)}</strong><span>${esc(top.title)}</span></div>
      </button>
    </section>

    <section class="card ms-podium-card ms-reveal">
      <div class="card-head"><h2>🏆 Il podio</h2><p class="muted small">I tuoi tre campioni con più punti. Cliccali per festeggiare!</p></div>
      <div class="ms-podium">
        ${[1, 0, 2].map((i) => (list[i] ? podiumHtml(list[i], i, d) : '<div></div>')).join('')}
      </div>
    </section>

    <section class="ms-insights">
      <div class="card ms-reveal ms-insight">
        <div class="card-head"><h2>🎯 One-trick meter</h2><p class="muted small">Quanto dipendi dal tuo main?</p></div>
        ${gaugeHtml(share, top, esc)}
      </div>
      <div class="card ms-reveal ms-insight" style="--rd:1">
        <div class="card-head"><h2>📶 Livelli</h2><p class="muted small">Quanti campioni per fascia di livello</p></div>
        ${levelsHtml(list, esc)}
      </div>
      <div class="card ms-reveal ms-insight" style="--rd:2">
        <div class="card-head"><h2>🎭 Classi preferite</h2><p class="muted small">Punti per classe principale · clicca per filtrare</p></div>
        ${donutHtml(classList, total)}
      </div>
    </section>

    <section class="card ms-facts ms-reveal" id="ms-facts">
      <div class="ms-fact-stage" id="ms-fact-stage"></div>
      <div class="ms-fact-nav">
        <button class="icon-btn" type="button" id="ms-fact-prev" aria-label="Curiosità precedente">‹</button>
        <div class="ms-fact-dots" id="ms-fact-dots"></div>
        <button class="icon-btn" type="button" id="ms-fact-next" aria-label="Curiosità successiva">›</button>
      </div>
    </section>

    <section class="card ms-collection" id="ms-collection">
      <div class="card-head row">
        <div><h2>📚 Collezione</h2><p class="muted small" id="ms-count">${list.length} campioni su ${totalChamps}</p></div>
        <button class="ms-random" id="ms-random" type="button">🎲 Cosa gioco stasera?</button>
      </div>
      <div class="ms-toolbar">
        <label class="ms-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="ms-search" type="search" placeholder="Cerca campione…" autocomplete="off" aria-label="Cerca campione">
          <kbd>/</kbd>
        </label>
        <select id="ms-sort" class="ms-select" aria-label="Ordina campioni">
          <option value="points_desc">🔥 Più punti</option>
          <option value="points_asc">🌱 Meno punti</option>
          <option value="level_desc">⭐ Livello più alto</option>
          <option value="recent">🕒 Giocati di recente</option>
          <option value="games_desc">🎮 Più partite indicizzate</option>
          <option value="name_asc">🔤 Nome (A–Z)</option>
        </select>
        <div class="ms-view-toggle" role="tablist" aria-label="Vista">
          <span class="ms-view-pill"></span>
          <button type="button" class="active" data-view="grid" role="tab">▦ Griglia</button>
          <button type="button" data-view="universe" role="tab">🪐 Universo</button>
        </div>
      </div>
      <div class="chips ms-class-chips" id="ms-class-chips">
        <button class="chip active" data-cls="">Tutte <small>${list.length}</small></button>
        ${Object.entries(CLASS_META).map(([k, m]) => {
          const n = list.filter((c) => c.tags.includes(k)).length;
          return n ? `<button class="chip" data-cls="${k}">${m.emoji} ${m.label} <small>${n}</small></button>` : '';
        }).join('')}
      </div>
      <div class="ms-grid" id="ms-grid"></div>
      <div class="ms-universe" id="ms-universe" hidden>
        <span class="ms-universe-hint">Trascina le bolle · lanciale · clicca per aprire</span>
      </div>
    </section>

    <div class="ms-modal" id="ms-modal" hidden>
      <div class="ms-modal-backdrop" data-close></div>
      <article class="ms-modal-card" role="dialog" aria-modal="true" aria-label="Dettaglio campione">
        <button class="ms-modal-close" type="button" data-close aria-label="Chiudi">✕</button>
        <button class="ms-modal-nav prev" type="button" data-nav="-1" aria-label="Precedente">‹</button>
        <button class="ms-modal-nav next" type="button" data-nav="1" aria-label="Successivo">›</button>
        <div class="ms-modal-content" id="ms-modal-content"></div>
      </article>
    </div>

    <div class="ms-roulette" id="ms-roulette" hidden>
      <div class="ms-roulette-card">
        <span class="ms-roulette-label">La ruota sta girando…</span>
        <div class="ms-roulette-img"><img id="ms-roulette-img" alt=""></div>
        <strong id="ms-roulette-name">—</strong>
      </div>
    </div>`;

  /* ---------- Stato vista collezione ---------- */
  const view = { q: '', sort: 'points_desc', cls: '', mode: 'grid' };
  let current = [];      // lista filtrata/ordinata
  let universe = null;
  const byKey = Object.fromEntries(list.map((c) => [c.key, c]));
  const fmts = { fmt, fmtK };

  /* ---------- Hero: contatori + parallasse ---------- */
  app.querySelectorAll('#ms-hero [data-count]').forEach((el) =>
    countUp(el, Number(el.dataset.count), fmts[el.dataset.fmt] || fmt));

  const hero = app.querySelector('#ms-hero');
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    hero.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  }, { signal });
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--mx', 0);
    hero.style.setProperty('--my', 0);
  }, { signal });

  /* ---------- Reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      en.target.querySelectorAll('[data-count]').forEach((el) => {
        if (el.dataset.done) return;
        el.dataset.done = '1';
        countUp(el, Number(el.dataset.count), fmts[el.dataset.fmt] || fmt, 1200);
      });
      io.unobserve(en.target);
    });
  }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });
  app.querySelectorAll('.ms-reveal').forEach((el) => io.observe(el));
  signal.addEventListener('abort', () => io.disconnect());

  /* ---------- Podio ---------- */
  app.querySelector('.ms-podium').addEventListener('click', (e) => {
    const pod = e.target.closest('.ms-pod');
    if (!pod) return;
    pod.classList.remove('jump');
    void pod.offsetWidth;
    pod.classList.add('jump');
    burstFrom(pod, pod.classList.contains('p1') ? 180 : 90);
  });

  /* ---------- Livelli: tooltip campioni ---------- */
  // (gestito via CSS :hover, nulla da fare qui)

  /* ---------- Donut classi ---------- */
  const donut = app.querySelector('.ms-donut-wrap');
  if (donut) {
    const center = donut.querySelector('.ms-donut-center');
    const defaultCenter = center.innerHTML;
    const highlight = (cls) => {
      donut.querySelectorAll('[data-seg]').forEach((s) => s.classList.toggle('dim', !!cls && s.dataset.seg !== cls));
      donut.querySelectorAll('.ms-legend-item').forEach((s) => s.classList.toggle('dim', !!cls && s.dataset.seg !== cls));
      if (!cls) { center.innerHTML = defaultCenter; return; }
      const m = CLASS_META[cls];
      const pts = classPts[cls] || 0;
      center.innerHTML = `<span class="ms-donut-emoji">${m.emoji}</span><b>${((pts / total) * 100).toFixed(1)}%</b><small>${m.label}</small>`;
    };
    donut.addEventListener('pointerover', (e) => {
      const seg = e.target.closest('[data-seg]');
      highlight(seg ? seg.dataset.seg : null);
    });
    donut.addEventListener('pointerleave', () => highlight(null));
    donut.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-seg]');
      if (!seg) return;
      setClass(seg.dataset.seg);
      app.querySelector('#ms-collection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------- Curiosità ---------- */
  setupFacts(buildFacts(list, { total, totalChamps, share, classList, timeAgo, fmt }), signal);

  /* ---------- Collezione ---------- */
  const grid = app.querySelector('#ms-grid');
  const uniEl = app.querySelector('#ms-universe');
  const countEl = app.querySelector('#ms-count');

  function compute() {
    const q = view.q.trim().toLowerCase();
    current = list
      .filter((c) => (!view.cls || c.tags.includes(view.cls))
        && (!q || c.name.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)))
      .sort(SORTS[view.sort]);
    countEl.textContent = current.length === list.length
      ? `${list.length} campioni su ${totalChamps}`
      : `${current.length} di ${list.length} campioni`;
  }

  function renderGrid() {
    if (!current.length) {
      grid.innerHTML = `<div class="ms-none"><span>🤷</span><strong>Nessun campione trovato</strong><p class="muted small">Prova a cambiare ricerca o filtro.</p></div>`;
      return;
    }
    grid.innerHTML = current.map((c, i) => cardHtml(c, i, maxPts, esc, fmt, timeAgo)).join('');
  }

  function refresh() {
    compute();
    if (view.mode === 'grid') renderGrid();
    else {
      universe?.destroy();
      universe = createUniverse(uniEl, current, openDetail, d, signal);
    }
  }

  function setClass(cls) {
    view.cls = cls || '';
    app.querySelectorAll('#ms-class-chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.cls === view.cls));
    refresh();
  }

  app.querySelector('#ms-class-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) setClass(chip.dataset.cls);
  });

  const search = app.querySelector('#ms-search');
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { view.q = search.value; refresh(); }, 120);
  });

  app.querySelector('#ms-sort').addEventListener('change', (e) => { view.sort = e.target.value; refresh(); });

  const toggle = app.querySelector('.ms-view-toggle');
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn || btn.dataset.view === view.mode) return;
    view.mode = btn.dataset.view;
    toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    toggle.classList.toggle('right', view.mode === 'universe');
    grid.hidden = view.mode !== 'grid';
    uniEl.hidden = view.mode !== 'universe';
    if (view.mode === 'grid') { universe?.destroy(); universe = null; }
    refresh();
  });

  // Tilt 3D + riflesso sulle card
  let tilted = null;
  grid.addEventListener('pointermove', (e) => {
    if (REDUCED_MOTION || e.pointerType === 'touch') return;
    const card = e.target.closest('.ms-card');
    if (tilted && tilted !== card) resetTilt(tilted);
    tilted = card;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${((0.5 - y) * 18).toFixed(2)}deg`);
    card.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  });
  grid.addEventListener('pointerleave', () => { if (tilted) resetTilt(tilted); tilted = null; });
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.ms-card');
    if (card) openDetail(card.dataset.key);
  });

  app.querySelector('.ms-main-badge').addEventListener('click', (e) => openDetail(e.currentTarget.dataset.open));

  /* ---------- Modale dettaglio ---------- */
  const modal = app.querySelector('#ms-modal');
  const modalContent = app.querySelector('#ms-modal-content');
  let openKey = null;

  function openDetail(key) {
    const c = byKey[key];
    if (!c) return;
    openKey = key;
    const prev = list[c.rank - 2];
    modalContent.innerHTML = detailHtml(c, prev, total, maxPts, esc, fmt, timeAgo);
    modal.hidden = false;
    document.body.classList.add('ms-lock');
    requestAnimationFrame(() => modal.classList.add('open'));
    modalContent.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count), fmt, 900));
    modal.querySelector('.ms-modal-close').focus({ preventScroll: true });
  }

  function closeDetail() {
    modal.classList.remove('open');
    document.body.classList.remove('ms-lock');
    openKey = null;
    setTimeout(() => { if (!openKey) modal.hidden = true; }, 250);
  }

  function navDetail(dir) {
    const order = current.length ? current : list;
    let idx = order.findIndex((c) => c.key === openKey);
    if (idx === -1) idx = 0;
    const next = order[(idx + dir + order.length) % order.length];
    const card = modal.querySelector('.ms-modal-card');
    card.classList.remove('swipe-l', 'swipe-r');
    void card.offsetWidth;
    card.classList.add(dir > 0 ? 'swipe-l' : 'swipe-r');
    openDetail(next.key);
  }

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeDetail();
    const nav = e.target.closest('[data-nav]');
    if (nav) navDetail(Number(nav.dataset.nav));
    if (e.target.closest('.ms-modal-level')) burstFrom(e.target.closest('.ms-modal-level'), 80);
  });

  document.addEventListener('keydown', (e) => {
    if (!modal.hidden && openKey) {
      if (e.key === 'Escape') closeDetail();
      else if (e.key === 'ArrowRight') navDetail(1);
      else if (e.key === 'ArrowLeft') navDetail(-1);
      return;
    }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (e.key === '/' && !typing) {
      e.preventDefault();
      search.focus();
      search.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, { signal });

  /* ---------- Roulette "Cosa gioco stasera?" ---------- */
  const roulette = app.querySelector('#ms-roulette');
  const rImg = app.querySelector('#ms-roulette-img');
  const rName = app.querySelector('#ms-roulette-name');
  const rBtn = app.querySelector('#ms-random');
  rBtn.addEventListener('click', () => {
    const pool = current.length ? current : list;
    if (!pool.length || rBtn.disabled) return;
    rBtn.disabled = true;
    const winner = pool[(Math.random() * pool.length) | 0];
    roulette.hidden = false;
    requestAnimationFrame(() => roulette.classList.add('open'));
    const steps = REDUCED_MOTION ? 1 : 22;
    let i = 0;
    const tick = () => {
      if (signal.aborted) return;
      const c = i === steps - 1 ? winner : pool[(Math.random() * pool.length) | 0];
      rImg.src = d.champImg(c.key);
      rName.textContent = c.name;
      rImg.parentElement.classList.remove('tick');
      void rImg.parentElement.offsetWidth;
      rImg.parentElement.classList.add('tick');
      i++;
      if (i < steps) {
        setTimeout(tick, 45 + Math.pow(i / steps, 3) * 380);
      } else {
        roulette.classList.add('done');
        setTimeout(() => {
          roulette.classList.remove('open', 'done');
          roulette.hidden = true;
          rBtn.disabled = false;
          openDetail(winner.key);
          confetti(innerWidth / 2, innerHeight / 3, 200);
        }, 700);
      }
    };
    tick();
  });

  refresh();
}

/* ==========================================================================
   TEMPLATE
   ========================================================================== */
function podiumHtml(c, i, d) {
  const lv = lvlInfo(c.level);
  return `
    <button class="ms-pod p${i + 1}" type="button" style="--lvl:${lv.color}; --pd:${[1, 0, 2].indexOf(i)}" aria-label="${d.esc(c.name)}">
      <div class="ms-pod-champ">
        ${i === 0 ? '<span class="ms-crown">👑</span>' : ''}
        <div class="ms-pod-avatar"><img src="${d.champImg(c.key)}" alt="" ${IMG_FALLBACK}></div>
        <span class="ms-lvl-badge">${c.level}</span>
      </div>
      <strong class="ms-pod-name">${d.esc(c.name)}</strong>
      <span class="ms-pod-pts"><b data-count="${c.points}" data-fmt="fmt">0</b> pt</span>
      <div class="ms-pod-block"><span>${i + 1}</span></div>
    </button>`;
}

function gaugeHtml(share, top, esc) {
  const s = Math.max(0, Math.min(100, share));
  const [emoji, label, desc] =
    s < 12 ? ['🧭', 'Esploratore', 'Ti piace provare di tutto, nessun campione ti domina.'] :
    s < 25 ? ['🎭', 'Versatile', 'Hai un main, ma il tuo champion pool è bello ampio.'] :
    s < 45 ? ['💍', 'Fedelissimo', `Tu e ${esc(top.name)} siete una coppia consolidata.`] :
             ['🐴', 'One-trick pony', `${esc(top.name)} o niente. Rispetto.`];
  return `
    <div class="ms-gauge-wrap" style="--angle:${(-90 + s * 1.8).toFixed(1)}deg">
      <svg class="ms-gauge" viewBox="0 0 200 116" aria-hidden="true">
        <defs>
          <linearGradient id="msGaugeGrad" x1="0" x2="1">
            <stop offset="0" stop-color="hsl(156 60% 50%)"/>
            <stop offset=".5" stop-color="hsl(42 92% 58%)"/>
            <stop offset="1" stop-color="hsl(340 80% 62%)"/>
          </linearGradient>
        </defs>
        <path class="track" d="M20 100 A80 80 0 0 1 180 100"/>
        <path class="val" d="M20 100 A80 80 0 0 1 180 100" pathLength="100" style="--off:${(100 - s).toFixed(1)}"/>
        <g class="ms-needle"><line x1="100" y1="100" x2="100" y2="36"/><circle cx="100" cy="100" r="7"/></g>
      </svg>
      <div class="ms-gauge-val"><b>${s.toFixed(1)}%</b><span>dei punti su ${esc(top.name)}</span></div>
    </div>
    <div class="ms-gauge-label"><span>${emoji}</span><div><strong>${label}</strong><p class="muted small">${desc}</p></div></div>`;
}

function levelsHtml(list, esc) {
  const buckets = LEVEL_BUCKETS.map(([lo, hi, label]) => ({
    label, lo, champs: list.filter((c) => c.level >= lo && c.level <= hi),
  }));
  const max = Math.max(1, ...buckets.map((b) => b.champs.length));
  return `
    <div class="ms-levels">
      ${buckets.map((b, i) => `
        <div class="ms-lvl-col" style="--h:${((b.champs.length / max) * 100).toFixed(1)}%; --lvl:${lvlInfo(b.lo).color}; --i:${i}" tabindex="0">
          <span class="ms-lvl-count">${b.champs.length}</span>
          <div class="ms-lvl-bar"><i></i></div>
          <span class="ms-lvl-label">${b.label}</span>
          ${b.champs.length ? `<div class="ms-lvl-tip">${b.champs.slice(0, 6).map((c) => esc(c.name)).join(', ')}${b.champs.length > 6 ? ` e altri ${b.champs.length - 6}` : ''}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

function donutHtml(classList, total) {
  if (!classList.length || !total) return '<p class="muted small">Dati sulle classi non disponibili.</p>';
  let offset = 0;
  const segs = classList.map(([cls, pts]) => {
    const pct = (pts / total) * 100;
    const seg = `<circle class="ms-seg" data-seg="${cls}" cx="70" cy="70" r="52" pathLength="100"
      style="--c:${CLASS_META[cls]?.color || 'var(--accent)'}; --len:${Math.max(0, pct - 0.6).toFixed(2)}; --off:${(-offset).toFixed(2)}"/>`;
    offset += pct;
    return seg;
  }).join('');
  const [topCls, topPts] = classList[0];
  const tm = CLASS_META[topCls] || { emoji: '❔', label: topCls };
  return `
    <div class="ms-donut-wrap">
      <div class="ms-donut">
        <svg viewBox="0 0 140 140"><circle class="ms-donut-track" cx="70" cy="70" r="52"/>${segs}</svg>
        <div class="ms-donut-center"><span class="ms-donut-emoji">${tm.emoji}</span><b>${((topPts / total) * 100).toFixed(1)}%</b><small>${tm.label}</small></div>
      </div>
      <div class="ms-legend">
        ${classList.map(([cls, pts]) => `
          <button type="button" class="ms-legend-item" data-seg="${cls}" style="--c:${CLASS_META[cls]?.color || 'var(--accent)'}">
            <i></i>${CLASS_META[cls]?.emoji || ''} ${CLASS_META[cls]?.label || cls}<b>${((pts / total) * 100).toFixed(0)}%</b>
          </button>`).join('')}
      </div>
    </div>`;
}

function cardHtml(c, i, maxPts, esc, fmt, timeAgo) {
  const lv = lvlInfo(c.level);
  return `
    <button class="ms-card ${lv.cls}" type="button" data-key="${esc(c.key)}" style="--lvl:${lv.color}; --d:${Math.min(i, 24)}">
      <div class="ms-card-inner">
        <img class="ms-card-art" src="${loadingImg(c.key)}" alt="" loading="lazy" ${IMG_FALLBACK}>
        <span class="ms-card-rank">#${c.rank}</span>
        <span class="ms-card-lvl">Lv ${c.level}</span>
        <div class="ms-card-body">
          <strong>${esc(c.name)}</strong>
          <span class="ms-card-title">${esc(c.title)}</span>
          <div class="ms-card-bar"><i style="width:${Math.max(2, (c.points / maxPts) * 100).toFixed(1)}%"></i></div>
          <div class="ms-card-meta"><span><b>${fmt(c.points)}</b> pt</span><span>${c.lastPlay ? timeAgo(c.lastPlayIso) : '—'}</span></div>
        </div>
        <span class="ms-card-glare"></span>
      </div>
    </button>`;
}

function resetTilt(card) {
  card.style.setProperty('--rx', '0deg');
  card.style.setProperty('--ry', '0deg');
}

function detailHtml(c, prev, total, maxPts, esc, fmt, timeAgo) {
  const lv = lvlInfo(c.level);
  const pctTotal = total ? (c.points / total) * 100 : 0;
  const goal = prev
    ? `🎯 Ti mancano <b>${fmt(prev.points - c.points + 1)}</b> punti per superare <b>${esc(prev.name)}</b> (#${prev.rank}).`
    : '👑 È il tuo campione numero uno. Lunga vita al re!';
  const matchStats = c.games
    ? `<div class="ms-mstats">
        <div><b>${c.games}</b><span>Partite indicizzate</span></div>
        <div><b class="${c.wr >= 55 ? 'good' : c.wr < 45 ? 'bad' : ''}">${c.wr.toFixed(0)}%</b><span>Winrate</span></div>
        <div><b>${c.kda ?? 'Perfect'}</b><span>KDA · ${c.avgK}/${c.avgD}/${c.avgA}</span></div>
      </div>`
    : `<p class="muted small ms-nogames">😴 Nessuna partita indicizzata con questo campione.</p>`;
  return `
    <div class="ms-modal-hero" style="background-image:url('${splashImg(c.key)}')">
      <div class="ms-modal-head">
        <span class="ms-modal-rank">#${c.rank} della collezione</span>
        <h2>${esc(c.name)}</h2>
        <p>${esc(c.title)}</p>
        <div class="ms-modal-tags">${c.tags.map((t) => `<span style="--c:${CLASS_META[t]?.color || 'var(--accent)'}">${CLASS_META[t]?.emoji || ''} ${CLASS_META[t]?.label || t}</span>`).join('')}</div>
      </div>
      <button class="ms-modal-level ${lv.cls}" type="button" style="--lvl:${lv.color}" title="Festeggia!">
        <small>Livello</small><b>${c.level}</b>
      </button>
    </div>
    <div class="ms-modal-body">
      <div class="ms-modal-stats">
        <div><b data-count="${c.points}">0</b><span>Punti maestria</span></div>
        <div><b>${pctTotal.toFixed(1)}%</b><span>Del tuo totale</span></div>
        <div><b>${c.lastPlay ? timeAgo(c.lastPlayIso) : '—'}</b><span>Ultima partita</span></div>
      </div>
      <div class="ms-modal-share">
        <div class="ms-modal-share-head"><span>Rispetto al tuo main</span><b>${((c.points / maxPts) * 100).toFixed(0)}%</b></div>
        <div class="ms-modal-bar" style="--lvl:${lv.color}"><i style="--w:${((c.points / maxPts) * 100).toFixed(1)}%"></i></div>
      </div>
      ${matchStats}
      <p class="ms-goal">${goal}</p>
    </div>`;
}

/* ==========================================================================
   CURIOSITÀ
   ========================================================================== */
function buildFacts(list, { total, totalChamps, share, classList, timeAgo, fmt }) {
  const facts = [];
  const top = list[0];
  facts.push(['👑', `<b>${top.name}</b> vale da solo il <b>${share.toFixed(1)}%</b> di tutti i tuoi punti maestria.`]);

  const pctOwned = (list.length / totalChamps) * 100;
  facts.push(['🧪', `Hai messo le mani su <b>${list.length}</b> campioni su ${totalChamps} (<b>${pctOwned.toFixed(0)}%</b>). ${pctOwned > 80 ? 'Collezionista seriale! 🏛️' : pctOwned > 50 ? 'Bel bottino!' : 'C’è ancora tanto da scoprire!'}`]);

  const games = Math.round(total / 800);
  const hours = Math.round((games * 30) / 60);
  facts.push(['⏳', `A occhio (~800 punti a partita) sono circa <b>${fmt(games)}</b> partite: più o meno <b>${fmt(hours)} ore</b> sulla Landa. ☕`]);

  const withDate = list.filter((c) => c.lastPlay);
  if (withDate.length) {
    const recent = withDate.reduce((a, b) => (b.lastPlay > a.lastPlay ? b : a));
    facts.push(['🔥', `L’ultimo campione con cui hai fatto punti è <b>${recent.name}</b>, ${timeAgo(recent.lastPlayIso)}.`]);
    const forgotten = withDate.slice(0, 10).reduce((a, b) => (b.lastPlay < a.lastPlay ? b : a));
    if (forgotten !== recent) {
      facts.push(['🥀', `Non giochi <b>${forgotten.name}</b> (uno dei tuoi top 10) da ${timeAgo(forgotten.lastPlayIso).replace(/ fa$/, '')}. Ti manca? 🥺`]);
    }
  }

  const high = list.filter((c) => c.level >= 10).length;
  if (high) facts.push(['🏅', `Hai <b>${high}</b> ${high === 1 ? 'campione' : 'campioni'} a livello 10 o superiore. Che dedizione!`]);

  const babies = list.filter((c) => c.level <= 2).length;
  if (babies) facts.push(['🐣', `<b>${babies}</b> ${babies === 1 ? 'campione è' : 'campioni sono'} ancora al livello 1–2. Dagli un’occasione!`]);

  const best = list.filter((c) => c.games >= 3).sort((a, b) => b.wr - a.wr)[0];
  if (best) facts.push(['📈', `Con <b>${best.name}</b> vinci il <b>${best.wr.toFixed(0)}%</b> delle partite indicizzate (${best.games} partite).`]);

  if (classList.length) {
    const [cls, pts] = classList[0];
    const m = CLASS_META[cls];
    if (m) facts.push([m.emoji, `La tua classe preferita è <b>${m.label}</b>: il <b>${((pts / total) * 100).toFixed(0)}%</b> dei tuoi punti.`]);
  }

  if (list[1]) {
    const gap = top.points - list[1].points;
    facts.push(['🥈', `Tra <b>${top.name}</b> e <b>${list[1].name}</b> ci sono <b>${fmt(gap)}</b> punti di distacco.`]);
  }
  return facts;
}

function setupFacts(facts, signal) {
  const stage = document.getElementById('ms-fact-stage');
  const dots = document.getElementById('ms-fact-dots');
  const box = document.getElementById('ms-facts');
  if (!stage || !facts.length) return;
  let idx = 0;
  let timer;

  dots.innerHTML = facts.map((_, i) => `<button type="button" data-i="${i}" aria-label="Curiosità ${i + 1}"></button>`).join('');

  const show = (i) => {
    idx = (i + facts.length) % facts.length;
    const [emoji, text] = facts[idx];
    stage.innerHTML = `<div class="ms-fact"><span class="ms-fact-emoji">${emoji}</span><p>${text}</p></div>`;
    dots.querySelectorAll('button').forEach((b, j) => b.classList.toggle('active', j === idx));
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!signal.aborted && stage.isConnected) { show(idx + 1); schedule(); } }, 6500);
  };

  document.getElementById('ms-fact-prev').addEventListener('click', () => { show(idx - 1); schedule(); });
  document.getElementById('ms-fact-next').addEventListener('click', () => { show(idx + 1); schedule(); });
  dots.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { show(Number(b.dataset.i)); schedule(); }
  });
  box.addEventListener('pointerenter', () => clearTimeout(timer));
  box.addEventListener('pointerleave', schedule);
  signal.addEventListener('abort', () => clearTimeout(timer));

  show(0);
  schedule();
}

/* ==========================================================================
   UNIVERSO A BOLLE (fisica semplice: gravità al centro, collisioni, drag)
   ========================================================================== */
function createUniverse(container, items, onOpen, d, signal) {
  container.querySelectorAll('.ms-bubble').forEach((n) => n.remove());
  const local = new AbortController();
  const stop = () => local.abort();
  signal.addEventListener('abort', stop);

  const subset = [...items].sort((a, b) => b.points - a.points).slice(0, 90);
  if (!subset.length) return { destroy: stop };

  let W = container.clientWidth;
  let H = container.clientHeight;
  const sumP = subset.reduce((s, c) => s + Math.max(c.points, 1), 0);
  const fill = subset.length < 8 ? 0.28 : 0.5;
  const k = Math.sqrt((W * H * fill) / (Math.PI * sumP));
  const maxR = Math.min(W, H) * 0.2;

  const nodes = subset.map((c, i) => {
    const r = Math.max(16, Math.min(maxR, k * Math.sqrt(Math.max(c.points, 1))));
    const lv = lvlInfo(c.level);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `ms-bubble ${lv.cls}`;
    el.style.cssText = `width:${2 * r}px;height:${2 * r}px;--lvl:${lv.color};--i:${Math.min(i, 40)}`;
    el.innerHTML = `<img src="${d.champImg(c.key)}" alt="" draggable="false" ${IMG_FALLBACK}>
      <span class="ms-bubble-tip"><b>${d.esc(c.name)}</b>${d.fmt(c.points)} pt · Lv ${c.level}</span>`;
    container.appendChild(el);
    const a = Math.random() * Math.PI * 2;
    const dist = Math.random() * Math.min(W, H) * 0.45;
    return { c, el, r, x: W / 2 + Math.cos(a) * dist, y: H / 2 + Math.sin(a) * dist, vx: 0, vy: 0 };
  });

  const pointer = { x: -999, y: -999, inside: false };
  let drag = null;

  const rel = (e) => {
    const r = container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  container.addEventListener('pointermove', (e) => {
    const p = rel(e);
    pointer.x = p.x; pointer.y = p.y; pointer.inside = true;
    if (drag) {
      drag.moved += Math.abs(p.x - drag.lx) + Math.abs(p.y - drag.ly);
      drag.n.vx = (p.x - drag.lx) * 0.9;
      drag.n.vy = (p.y - drag.ly) * 0.9;
      drag.n.x = p.x; drag.n.y = p.y;
      drag.lx = p.x; drag.ly = p.y;
    }
  }, { signal: local.signal });
  container.addEventListener('pointerleave', () => { pointer.inside = false; }, { signal: local.signal });

  container.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.ms-bubble');
    if (!el) return;
    const n = nodes.find((x) => x.el === el);
    if (!n) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const p = rel(e);
    drag = { n, lx: p.x, ly: p.y, moved: 0 };
    el.classList.add('dragging');
  }, { signal: local.signal });

  const endDrag = () => {
    if (!drag) return;
    drag.n.el.classList.remove('dragging');
    if (drag.moved < 6) onOpen(drag.n.c.key);
    drag = null;
  };
  container.addEventListener('pointerup', endDrag, { signal: local.signal });
  container.addEventListener('pointercancel', endDrag, { signal: local.signal });

  window.addEventListener('resize', () => { W = container.clientWidth; H = container.clientHeight; }, { signal: local.signal });

  let visible = true;
  const vio = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
  vio.observe(container);
  local.signal.addEventListener('abort', () => vio.disconnect());

  const step = () => {
    const cx = W / 2;
    const cy = H / 2;
    for (const n of nodes) {
      if (drag && drag.n === n) continue;
      n.vx += (cx - n.x) * 0.0016;
      n.vy += (cy - n.y) * 0.0022;
      if (pointer.inside && !drag) {
        const dx = n.x - pointer.x;
        const dy = n.y - pointer.y;
        const dist = Math.hypot(dx, dy) || 1;
        const reach = n.r + 50;
        if (dist < reach) {
          const f = ((reach - dist) / reach) * 0.9;
          n.vx += (dx / dist) * f;
          n.vy += (dy / dist) * f;
        }
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r + 3;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const dist = Math.sqrt(d2) || 0.01;
        const push = (min - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        const aFixed = drag && drag.n === a;
        const bFixed = drag && drag.n === b;
        if (!aFixed) { a.x -= nx * push * (bFixed ? 2 : 1); a.y -= ny * push * (bFixed ? 2 : 1); a.vx -= nx * 0.12; a.vy -= ny * 0.12; }
        if (!bFixed) { b.x += nx * push * (aFixed ? 2 : 1); b.y += ny * push * (aFixed ? 2 : 1); b.vx += nx * 0.12; b.vy += ny * 0.12; }
      }
    }
    for (const n of nodes) {
      if (!(drag && drag.n === n)) {
        n.vx *= 0.88; n.vy *= 0.88;
        n.x += n.vx; n.y += n.vy;
      }
      if (n.x < n.r) { n.x = n.r; n.vx = Math.abs(n.vx) * 0.6; }
      if (n.x > W - n.r) { n.x = W - n.r; n.vx = -Math.abs(n.vx) * 0.6; }
      if (n.y < n.r) { n.y = n.r; n.vy = Math.abs(n.vy) * 0.6; }
      if (n.y > H - n.r) { n.y = H - n.r; n.vy = -Math.abs(n.vy) * 0.6; }
      n.el.style.transform = `translate(${(n.x - n.r).toFixed(1)}px, ${(n.y - n.r).toFixed(1)}px)`;
    }
  };

  const loop = () => {
    if (local.signal.aborted || !container.isConnected) return;
    if (visible && !container.hidden) step();
    requestAnimationFrame(loop);
  };
  loop();

  return {
    destroy() {
      stop();
      signal.removeEventListener('abort', stop);
      nodes.forEach((n) => n.el.remove());
    },
  };
}
