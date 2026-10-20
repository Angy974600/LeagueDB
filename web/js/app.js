/* ==========================================================================
   LeagueDB — Dashboard SPA (vanilla JS, hash routing)
   ========================================================================== */

import { renderMastery, cleanupMastery } from './mastery.js';

const API = '/api';
const app = document.getElementById('app');
const DEFAULT_TITLE = document.title;

const state = {
  dd: '14.24.1',      // versione Data Dragon (aggiornata all'avvio)
  players: [],
  puuid: null,
  queue: null,
  sortBy: 'date_desc',
  dateFrom: '',
  dateTo: '',
  offset: 0,
  pageSize: 10,
  renderId: 0,
  prefill: null,
};

const QUEUES = {
  400: 'Normal Draft', 420: 'Ranked Solo/Duo', 430: 'Normal Blind', 440: 'Ranked Flex',
  450: 'ARAM', 490: 'Quickplay', 700: 'Clash', 720: 'ARAM Clash', 900: 'ARURF',
  1300: 'Nexus Blitz', 1700: 'Arena', 1710: 'Arena', 1900: 'URF',
};
const MODES = { CHERRY: 'Arena', CLASSIC: 'Normale', KIWI: 'ARAM Mayhem' };
const ROLES = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'ADC', UTILITY: 'Support' };
const RANK_QUEUES = { RANKED_SOLO_5x5: 'Solo/Duo', RANKED_FLEX_SR: 'Flex' };
const TIER_COLORS = {
  IRON: '#8c7b75', BRONZE: '#b9875a', SILVER: '#a3b1c2', GOLD: '#e3b54a', PLATINUM: '#4fb3a9',
  EMERALD: '#3fbf7f', DIAMOND: '#6f8fff', MASTER: '#b366ff', GRANDMASTER: '#ff5b6b', CHALLENGER: '#f2c94c',
};
const APEX = ['MASTER', 'GRANDMASTER', 'CHALLENGER'];
const CHAMP_FIX = { FiddleSticks: 'Fiddlesticks' };

/* ---------- Helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => Number(v ?? 0);
const fmt = (v) => num(v).toLocaleString('it-IT');
const fmtK = (v) => (num(v) >= 1000 ? `${(num(v) / 1000).toFixed(1).replace('.', ',')}k` : fmt(v));
const cap = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');
const pct = (v) => `${num(v).toFixed(1).replace('.0', '')}%`;
const wrClass = (wr) => (num(wr) >= 55 ? 'good' : num(wr) < 45 ? 'bad' : '');
const kda = (k, d, a) => (num(d) === 0 ? 'Perfect' : ((num(k) + num(a)) / num(d)).toFixed(2));
const duration = (s) => `${Math.floor(num(s) / 60)}:${String(num(s) % 60).padStart(2, '0')}`;
const roleLabel = (r) => ROLES[r] || 'Altro';
const queueLabel = (id, mode) => QUEUES[id] || MODES[mode] || cap(mode) || `Coda ${id}`;
const enc = encodeURIComponent;

const dd = `https://ddragon.leagueoflegends.com/cdn`;
const champImg = (name) => `${dd}/${state.dd}/img/champion/${CHAMP_FIX[name] || name}.png`;
const itemImg = (id) => `${dd}/${state.dd}/img/item/${id}.png`;
const iconImg = (id) => `${dd}/${state.dd}/img/profileicon/${id ?? 29}.png`;
const IMG_FALLBACK = `onerror="this.style.visibility='hidden'"`;

const rtf = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (new Date(iso) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, sec] of units) {
    if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return 'adesso';
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(', ') : data.detail;
    throw new Error(detail || `Errore ${res.status}`);
  }
  return data;
}

let toastTimer;
function toast(msg, type = 'info') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4500);
}

const errorBox = (msg) => `<div class="error-box">${esc(msg)}</div>`;

function tierBadge(tier, rank, lp) {
  if (!tier) return `<span class="tier" style="--tier:var(--muted)">Unranked</span>`;
  const r = APEX.includes(tier) ? '' : ` ${rank}`;
  return `<span class="tier" style="--tier:${TIER_COLORS[tier] || 'var(--accent)'}">${cap(tier)}${r} · ${lp} LP</span>`;
}

function itemsHtml(o, size = '') {
  const slot = (id, extra = '') => (id
    ? `<img class="item ${extra}" src="${itemImg(id)}" alt="" loading="lazy" ${IMG_FALLBACK}>`
    : `<span class="item ${extra}"></span>`);
  return `<div class="items ${size}">
    ${[o.item_0, o.item_1, o.item_2, o.item_3, o.item_4, o.item_5].map((id) => slot(id)).join('')}
    ${slot(o.item_6, 'trinket')}
  </div>`;
}

const CHEVRON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>`;

/* ---------- Router ---------- */
function router() {
  const hash = location.hash || '#/';
  const mastery = hash.match(/^#\/player\/([^/]+)\/mastery$/);
  const m = hash.match(/^#\/player\/([^/]+)$/);
  cleanupMastery();
  window.scrollTo({ top: 0 });
  if (mastery) renderMastery(decodeURIComponent(mastery[1]), masteryDeps());
  else if (m) renderPlayer(decodeURIComponent(m[1]));
  else renderHome();
}

function masteryDeps() {
  return { app, state, api, esc, fmt, fmtK, timeAgo, enc, iconImg, champImg, errorBox };
}

/* ==========================================================================
   HOME
   ========================================================================== */
async function renderHome() {
  const token = ++state.renderId;
  const pre = state.prefill || {};
  state.prefill = null;
  document.title = DEFAULT_TITLE;

  app.innerHTML = `
    <section class="hero fade-up">
      <span class="eyebrow">Mini op.gg · PostgreSQL Medallion</span>
      <h1>Statistiche giocatori</h1>
      <p class="lead">Profili, campioni e cronologia delle partite, elaborati dalla pipeline Bronze → Silver → Gold.</p>
    </section>

    <section class="home-top">
      <form class="card sync-card fade-up" id="sync-form" style="--d:1" autocomplete="off">
        <div class="card-head">
          <h2>Aggiungi o aggiorna un giocatore</h2>
          <p class="muted small">Scarica profilo, rank e partite dalla Riot API.</p>
        </div>
        <div class="sync-fields">
          <label class="field grow"><span>Game name</span>
            <input id="sync-name" required maxlength="50" placeholder="Anfrost" value="${esc(pre.name || '')}">
          </label>
          <label class="field tag"><span>Tag</span>
            <div class="tag-input"><span>#</span><input id="sync-tag" required maxlength="20" placeholder="EUW" value="${esc(pre.tag || '')}"></div>
          </label>
          <label class="field count" style="width: auto; min-width: 140px;"><span>Partite</span>
            <select id="sync-count">
              <option value="20">20 partite</option>
              <option value="50" selected>50 partite</option>
              <option value="100">100 partite</option>
              <option value="200">200 partite</option>
              <option value="500">500 partite</option>
              <option value="0">Tutte (Backfill)</option>
            </select>
          </label>
        </div>
        <button class="btn btn-primary" id="sync-submit" type="submit">
          <span class="spinner"></span><span class="btn-label">Sincronizza</span>
        </button>
      </form>

      <div class="card fade-up" id="pipeline-card" style="--d:2">
        <div class="card-head"><h2>Data pipeline</h2><p class="muted small">Stato dei layer nel warehouse</p></div>
        <div class="layers">${'<div class="layer skeleton" style="height:58px"></div>'.repeat(3)}</div>
      </div>
    </section>

    <section class="fade-up" style="--d:3">
      <div class="section-head">
        <h2>Giocatori tracciati</h2>
        <span class="pill" id="players-count">—</span>
      </div>
      <div class="players-grid" id="players-grid">
        ${'<div class="card skeleton sk-card"></div>'.repeat(3)}
      </div>
    </section>`;

  $('#sync-form').addEventListener('submit', (e) => {
    e.preventDefault();
    syncPlayer(
      $('#sync-name').value.trim(),
      $('#sync-tag').value.trim().replace(/^#/, ''),
      Number($('#sync-count').value),
      $('#sync-submit'),
    );
  });
  if (pre.name) $('#sync-name').focus();

  try {
    const [stats, players] = await Promise.all([api('/stats'), api('/players')]);
    if (token !== state.renderId) return;
    state.players = players;
    renderPipeline(stats);
    renderPlayersGrid(players);
  } catch (e) {
    if (token !== state.renderId) return;
    $('#players-grid').innerHTML = errorBox(`Impossibile caricare i dati: ${e.message}`);
    $('#pipeline-card .layers').innerHTML = errorBox('Database non raggiungibile. Docker è avviato?');
  }
}

function renderPipeline(s) {
  const layer = (cls, name, desc, val, unit) => `
    <div class="layer ${cls}">
      <span class="layer-dot"></span>
      <div class="layer-info"><strong>${name}</strong><span class="muted small">${desc}</span></div>
      <span class="layer-val">${fmt(val)}<small>${unit}</small></span>
    </div>`;
  $('#pipeline-card .layers').innerHTML =
    layer('bronze', 'Bronze', 'Staging JSONB grezzo', s.bronze_matches, 'payload') +
    layer('silver', 'Silver', `${fmt(s.participants)} righe partecipante`, s.matches, 'partite') +
    layer('gold', 'Gold', 'Data mart analitici', s.gold_marts, 'viste');
}

function renderPlayersGrid(players) {
  $('#players-count').textContent = `${players.length} ${players.length === 1 ? 'giocatore' : 'giocatori'}`;
  if (!players.length) {
    $('#players-grid').innerHTML = `
      <div class="card empty" style="grid-column:1/-1">
        <strong>Nessun giocatore ancora</strong>
        Usa il modulo qui sopra per sincronizzare il primo profilo.
      </div>`;
    return;
  }
  $('#players-grid').innerHTML = players.map((p, i) => `
    <a class="card player-card fade-up" style="--d:${Math.min(i, 8)}" href="#/player/${enc(p.puuid)}"
       data-search="${esc(`${p.game_name}#${p.tag_line}`.toLowerCase())}">
      <div class="pc-top">
        <img class="avatar" src="${iconImg(p.profile_icon_id)}" alt="" loading="lazy" ${IMG_FALLBACK}>
        <div>
          <div class="pc-name">${esc(p.game_name)}<span class="tag">#${esc(p.tag_line)}</span></div>
          <div class="pc-sub">${tierBadge(p.solo_tier, p.solo_rank, p.solo_lp)}<span>Lv ${p.summoner_level ?? '—'}</span></div>
        </div>
      </div>
      <div class="pc-stats">
        <div><span class="k ${wrClass(p.overall_winrate_pct)}">${p.overall_winrate_pct != null ? pct(p.overall_winrate_pct) : '—'}</span><span class="l">Winrate</span></div>
        <div><span class="k">${p.overall_kda_ratio ?? '—'}</span><span class="l">KDA</span></div>
        <div><span class="k">${fmt(p.total_indexed_matches)}</span><span class="l">Partite</span></div>
      </div>
    </a>`).join('');
}

/* ---------- Sync ---------- */
async function syncPlayer(gameName, tagLine, count, btn) {
  if (!gameName || !tagLine) return toast('Inserisci game name e tag', 'error');
  const label = btn.querySelector('.btn-label');
  const original = label.textContent;
  btn.disabled = true;
  btn.classList.add('is-loading');
  label.textContent = 'Sincronizzazione…';
  try {
    const res = await api('/sync', {
      method: 'POST',
      body: JSON.stringify({ game_name: gameName, tag_line: tagLine, count }),
    });
    toast(`${res.player}: ${res.matches_processed} nuove partite elaborate`, 'success');
    api('/players').then((p) => { state.players = p; }).catch(() => {});
    const target = `#/player/${enc(res.puuid)}`;
    if (location.hash === target) router(); else location.hash = target;
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      label.textContent = original;
    }
  }
}

/* ==========================================================================
   PLAYER
   ========================================================================== */
function playerSkeleton() {
  return `
    <a href="#/" class="back">‹ Tutti i giocatori</a>
    <div class="card skeleton" style="height:128px"></div>
    <div class="kpis">${'<div class="card skeleton" style="height:112px"></div>'.repeat(4)}</div>
    <div class="split">
      <div class="card skeleton" style="height:320px"></div>
      <div class="card skeleton" style="height:320px"></div>
    </div>`;
}

async function renderPlayer(puuid) {
  const token = ++state.renderId;
  state.puuid = puuid;
  state.queue = null;
  state.sortBy = 'date_desc';
  state.dateFrom = '';
  state.dateTo = '';
  state.offset = 0;
  app.innerHTML = playerSkeleton();

  let d;
  try {
    d = await api(`/players/${enc(puuid)}`);
  } catch (e) {
    if (token !== state.renderId) return;
    app.innerHTML = `<a href="#/" class="back">‹ Tutti i giocatori</a>${errorBox(e.message)}`;
    return;
  }
  if (token !== state.renderId) return;

  const o = d.overview;
  document.title = `${o.game_name}#${o.tag_line} — LeagueDB`;

  app.innerHTML = `
    <a href="#/" class="back fade-up">‹ Tutti i giocatori</a>

    <section class="card profile fade-up">
      <div class="profile-id">
        <div class="avatar-wrap">
          <img class="avatar lg" src="${iconImg(o.profile_icon_id)}" alt="Icona profilo" ${IMG_FALLBACK}>
          <span class="level">${o.summoner_level ?? '—'}</span>
        </div>
        <div>
          <h1 class="profile-name">${esc(o.game_name)}<span class="tag">#${esc(o.tag_line)}</span></h1>
          <p class="muted small">Aggiornato ${timeAgo(o.updated_at)} · ${fmt(o.total_indexed_matches)} partite indicizzate</p>
        </div>
      </div>
      <div class="profile-ranks">${ranksHtml(d.ranks)}</div>
      <div class="profile-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
        <a class="btn btn-mastery" href="#/player/${enc(puuid)}/mastery" id="mastery-btn">🏆 Maestrie</a>
        <button class="btn btn-ghost" id="refresh-btn" type="button">
          <span class="spinner"></span><span class="btn-label">Aggiorna</span>
        </button>
      </div>
    </section>

    ${masteryTeaser(puuid, d.masteries || [])}

    ${num(o.total_indexed_matches) === 0
      ? `<div class="card empty"><strong>Nessuna partita collegata</strong>Premi “Aggiorna” per scaricare le partite.</div>`
      : `
    <section class="kpis">
      ${kpiCards(o)}
    </section>

    <section class="split">
      <div class="stack">
        <div class="card fade-up" style="--d:2">
          <div class="card-head"><h2>Forma recente</h2><p class="muted small">Ultime ${d.recent_form.length} partite, dalla più vecchia alla più recente</p></div>
          ${formHtml(d.recent_form)}
        </div>
        <div class="card fade-up" style="--d:3">
          <div class="card-head"><h2>Ruoli</h2><p class="muted small">Distribuzione e winrate per posizione</p></div>
          ${rolesHtml(d.roles)}
        </div>
      </div>
      <div class="card fade-up" style="--d:3">
        <div class="card-head row">
          <div><h2>Campioni</h2><p class="muted small">${d.champions.length} campioni giocati</p></div>
        </div>
        ${championsHtml(d.champions)}
      </div>
    </section>

    <section class="card fade-up" style="--d:4">
      <div class="card-head row">
        <div><h2>Cronologia partite</h2><p class="muted small">Clicca una partita per vedere tutti i giocatori</p></div>
        <div class="chips" id="queue-chips">
          <button class="chip active" data-queue="">Tutte <small>${fmt(o.total_indexed_matches)}</small></button>
          ${d.queues.map((q) => `<button class="chip" data-queue="${q.queue_id}">${esc(queueLabel(q.queue_id, q.game_mode))} <small>${q.matches}</small></button>`).join('')}
        </div>
      </div>

      <div class="match-toolbar">
        <div class="match-toolbar-row">
          <div class="filter-group">
            <span class="filter-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18M6 12h12m-9 6h6"/></svg>
              Ordina per
            </span>
            <select id="match-sort" class="sort-select" aria-label="Ordina partite">
              <option value="date_desc">📅 Data: Più recenti</option>
              <option value="date_asc">📅 Data: Meno recenti</option>
              <option value="kda_desc">⭐ KDA più alto</option>
              <option value="kills_desc">⚔️ Uccisioni (più alte)</option>
              <option value="deaths_desc">💀 Morti (più alte)</option>
              <option value="deaths_asc">🛡️ Morti (più basse)</option>
              <option value="damage_desc">💥 Danno ai campioni (più alto)</option>
              <option value="cs_desc">🌾 CS / Farm (più alto)</option>
              <option value="duration_desc">⏱️ Durata partita (più lunga)</option>
            </select>
          </div>

          <div class="filter-group date-filter-wrap">
            <span class="filter-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              Filtra per data
            </span>
            <div class="date-inputs">
              <label class="date-label"><span>Da</span><input type="date" id="match-date-from" class="date-input" aria-label="Data inizio"></label>
              <span class="date-sep">—</span>
              <label class="date-label"><span>A</span><input type="date" id="match-date-to" class="date-input" aria-label="Data fine"></label>
            </div>
            <div class="date-presets" id="date-presets">
              <button type="button" class="date-preset-btn active" data-range="all">Tutte</button>
              <button type="button" class="date-preset-btn" data-range="7d">7 gg</button>
              <button type="button" class="date-preset-btn" data-range="30d">30 gg</button>
              <button type="button" class="date-preset-btn" data-range="90d">90 gg</button>
              <button type="button" class="date-preset-btn" data-range="year">Quest'anno</button>
            </div>
          </div>
        </div>

        <div class="match-toolbar-sub">
          <div class="match-count-badge" id="match-count-badge"></div>
          <button type="button" class="clear-btn" id="reset-filters-btn" style="display:none">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            Azzera filtri
          </button>
        </div>
      </div>

      <div class="match-list" id="match-list"></div>
      <button class="btn btn-ghost load-more" id="load-more" type="button" hidden>
        <span class="spinner"></span><span class="btn-label">Carica altre partite</span>
      </button>
    </section>`}`;

  $('#refresh-btn').addEventListener('click', (e) =>
    syncPlayer(o.game_name, o.tag_line, 20, e.currentTarget));

  if (num(o.total_indexed_matches) === 0) return;

  $('#queue-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#queue-chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
    state.queue = chip.dataset.queue || null;
    loadMatches(true);
  });
  $('#load-more').addEventListener('click', () => loadMatches(false));
  bindMatchList($('#match-list'));
  initMatchFilters();
  loadMatches(true);
}

function masteryTeaser(puuid, masteries) {
  if (!masteries.length) return '';
  const top = masteries.slice(0, 3);
  const total = masteries.reduce((s, m) => s + num(m.champion_points), 0);
  const lvlColor = (l) => (l >= 10 ? 'hsl(42 90% 58%)' : l >= 7 ? 'hsl(275 80% 70%)' : l >= 4 ? 'hsl(222 90% 68%)' : 'hsl(156 60% 50%)');
  const key = CHAMP_FIX[top[0].champion_name] || top[0].champion_name;
  return `
    <a class="card ms-teaser fade-up" style="--d:1" href="#/player/${enc(puuid)}/mastery" id="mastery-teaser">
      <div class="ms-teaser-bg" style="background-image:url('${dd}/img/champion/splash/${key}_0.jpg')"></div>
      <div class="ms-teaser-champs">
        ${top.map((m) => `<div class="ms-teaser-champ" style="--lvl:${lvlColor(num(m.champion_level))}">
          <img src="${champImg(m.champion_name)}" alt="${esc(m.champion_name)}" ${IMG_FALLBACK}><span>${m.champion_level}</span>
        </div>`).join('')}
      </div>
      <div class="ms-teaser-text">
        <small>✨ Sala delle Maestrie</small>
        <h2>${fmt(total)}+ punti maestria nei top ${masteries.length}</h2>
        <p>Podio, universo dei campioni, curiosità e la ruota “Cosa gioco stasera?”</p>
      </div>
      <span class="ms-teaser-cta">Esplora →</span>
    </a>`;
}

function ranksHtml(ranks) {
  const list = ranks.filter((r) => RANK_QUEUES[r.queue_type]);
  if (!list.length) {
    return `<div class="rank-card" style="--tier:var(--muted)"><span class="rank-queue">Ranked</span><strong>Unranked</strong><span class="muted small">Nessuna coda classificata</span></div>`;
  }
  return list.map((r) => {
    const total = num(r.wins) + num(r.losses);
    const wr = total ? (r.wins / total) * 100 : 0;
    const tierTxt = `${cap(r.tier)}${APEX.includes(r.tier) ? '' : ` ${r.rank}`}`;
    return `
      <div class="rank-card" style="--tier:${TIER_COLORS[r.tier] || 'var(--accent)'}">
        <span class="rank-queue">${RANK_QUEUES[r.queue_type]}</span>
        <strong>${tierTxt}</strong>
        <span class="muted small">${r.league_points} LP · ${r.wins}V ${r.losses}S · <b class="${wrClass(wr)}">${pct(wr)}</b></span>
      </div>`;
  }).join('');
}

function kpiCards(o) {
  const wr = num(o.overall_winrate_pct);
  const C = 2 * Math.PI * 34; // 213.6
  const color = wr >= 50 ? 'var(--win)' : 'var(--loss)';
  return `
    <div class="card kpi ring-kpi fade-up" style="--d:1">
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 80 80">
          <circle class="track" cx="40" cy="40" r="34"/>
          <circle class="val" cx="40" cy="40" r="34" style="--c:${color}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - wr / 100)}"/>
        </svg>
        <span>${pct(wr)}</span>
      </div>
      <div>
        <span class="kpi-label">Winrate</span>
        <div class="kpi-sub"><b class="good">${o.total_wins}V</b> · <b class="bad">${o.total_losses}S</b></div>
      </div>
    </div>
    <div class="card kpi fade-up" style="--d:2">
      <span class="kpi-label">KDA medio</span>
      <span class="kpi-value">${o.overall_kda_ratio ?? 'Perfect'}</span>
      <span class="kpi-sub">${o.avg_kills} / <span class="bad">${o.avg_deaths}</span> / ${o.avg_assists}</span>
    </div>
    <div class="card kpi fade-up" style="--d:3">
      <span class="kpi-label">Danni medi</span>
      <span class="kpi-value">${fmtK(o.avg_damage_per_game)}</span>
      <span class="kpi-sub">${fmtK(o.avg_gold)} oro a partita</span>
    </div>
    <div class="card kpi fade-up" style="--d:4">
      <span class="kpi-label">CS medi</span>
      <span class="kpi-value">${o.avg_cs ?? '—'}</span>
      <span class="kpi-sub">Visione ${o.avg_vision ?? '—'} · ultima ${timeAgo(o.latest_match_played)}</span>
    </div>`;
}

function formHtml(form) {
  if (!form.length) return '<p class="muted small">Nessuna partita.</p>';
  const ordered = [...form].reverse();
  const wins = form.filter((f) => f.win).length;
  return `
    <div class="form-dots">
      ${ordered.map((f) => `<span class="dot ${f.win ? 'w' : 'l'}" title="${esc(f.champion_name)} · ${f.win ? 'Vittoria' : 'Sconfitta'}">${f.win ? 'V' : 'S'}</span>`).join('')}
    </div>
    <p class="form-summary small muted"><b class="good">${wins}V</b> · <b class="bad">${form.length - wins}S</b> · winrate recente <b class="${wrClass((wins / form.length) * 100)}">${pct((wins / form.length) * 100)}</b></p>`;
}

function rolesHtml(roles) {
  // Unisce le posizioni non valide (ARAM, Arena...) sotto "Altro"
  const merged = {};
  roles.forEach((r) => {
    const key = roleLabel(r.role);
    merged[key] ??= { label: key, matches: 0, wins: 0 };
    merged[key].matches += num(r.matches_count);
    merged[key].wins += num(r.wins);
  });
  const list = Object.values(merged).sort((a, b) => b.matches - a.matches);
  if (!list.length) return '<p class="muted small">Nessun dato.</p>';
  const max = Math.max(...list.map((r) => r.matches));
  return list.map((r) => {
    const wr = (r.wins / r.matches) * 100;
    return `
      <div class="role-row">
        <span class="role-name">${r.label}</span>
        <div class="bar"><i style="width:${(r.matches / max) * 100}%"></i></div>
        <span class="role-meta">${r.matches} · <b class="${wrClass(wr)}">${pct(wr)}</b></span>
      </div>`;
  }).join('');
}

function championsHtml(champs) {
  if (!champs.length) return '<p class="muted small">Nessun campione.</p>';
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Campione</th><th>Partite</th><th>Winrate</th><th>KDA</th><th>CS</th><th>Danni</th></tr></thead>
        <tbody>
          ${champs.slice(0, 10).map((c) => `
            <tr>
              <td><div class="champ-cell"><img class="champ-icon sm" src="${champImg(c.champion_name)}" alt="" loading="lazy" ${IMG_FALLBACK}>${esc(c.champion_name)}</div></td>
              <td>${c.total_matches}</td>
              <td><div class="wr-cell">
                <span class="${wrClass(c.winrate_pct)}">${pct(c.winrate_pct)}</span>
                <div class="minibar"><i style="width:${num(c.winrate_pct)}%;--c:${num(c.winrate_pct) >= 50 ? 'var(--win)' : 'var(--loss)'}"></i></div>
              </div></td>
              <td><b>${c.kda_ratio ?? 'Perfect'}</b><span class="muted small block">${c.avg_kills}/${c.avg_deaths}/${c.avg_assists}</span></td>
              <td>${c.avg_cs}</td>
              <td>${fmtK(c.avg_damage)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ---------- Match history ---------- */
async function loadMatches(reset) {
  const list = $('#match-list');
  const more = $('#load-more');
  const countBadge = $('#match-count-badge');
  const resetBtn = $('#reset-filters-btn');
  if (!list) return;
  const token = state.renderId;

  if (reset) {
    state.offset = 0;
    list.innerHTML = '<div class="skeleton" style="height:76px;border-radius:14px"></div>'.repeat(3);
  }
  more.disabled = true;
  more.classList.add('is-loading');

  const hasActiveFilters = Boolean(state.queue || state.dateFrom || state.dateTo || state.sortBy !== 'date_desc');
  if (resetBtn) {
    resetBtn.style.display = hasActiveFilters ? 'inline-flex' : 'none';
  }

  try {
    const q = state.queue ? `&queue=${state.queue}` : '';
    const sort = state.sortBy ? `&sort_by=${state.sortBy}` : '';
    const df = state.dateFrom ? `&date_from=${state.dateFrom}` : '';
    const dt = state.dateTo ? `&date_to=${state.dateTo}` : '';
    const data = await api(`/players/${enc(state.puuid)}/matches?limit=${state.pageSize}&offset=${state.offset}${q}${sort}${df}${dt}`);
    if (token !== state.renderId) return;
    if (reset) list.innerHTML = '';
    if (!data.matches.length && reset) {
      list.innerHTML = `
        <div class="empty">
          <strong>Nessuna partita trovata</strong>
          <p class="muted small">Nessuna partita corrisponde ai filtri impostati (date, modalità o criteri selezionati).</p>
        </div>`;
    }
    list.insertAdjacentHTML('beforeend', data.matches.map(matchRow).join(''));
    state.offset += data.matches.length;
    more.hidden = state.offset >= data.total;

    if (countBadge) {
      if (data.total === 0) {
        countBadge.innerHTML = '0 partite trovate';
      } else {
        countBadge.innerHTML = `Mostrando <strong>${state.offset}</strong> di <strong>${fmt(data.total)}</strong> partite ${hasActiveFilters ? '<span class="filter-indicator">(filtrate)</span>' : ''}`;
      }
    }
  } catch (e) {
    if (token !== state.renderId) return;
    list.innerHTML = errorBox(e.message);
  } finally {
    more.disabled = false;
    more.classList.remove('is-loading');
  }
}

function initMatchFilters() {
  const sortSelect = $('#match-sort');
  const dateFrom = $('#match-date-from');
  const dateTo = $('#match-date-to');
  const presetContainer = $('#date-presets');
  const resetBtn = $('#reset-filters-btn');

  if (sortSelect) {
    sortSelect.value = state.sortBy || 'date_desc';
    sortSelect.addEventListener('change', () => {
      state.sortBy = sortSelect.value;
      loadMatches(true);
    });
  }

  const applyCustomDates = () => {
    state.dateFrom = dateFrom.value;
    state.dateTo = dateTo.value;
    if (presetContainer) {
      presetContainer.querySelectorAll('.date-preset-btn').forEach((btn) => btn.classList.remove('active'));
    }
    loadMatches(true);
  };

  if (dateFrom) {
    dateFrom.value = state.dateFrom || '';
    dateFrom.addEventListener('change', applyCustomDates);
  }
  if (dateTo) {
    dateTo.value = state.dateTo || '';
    dateTo.addEventListener('change', applyCustomDates);
  }

  if (presetContainer) {
    presetContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.date-preset-btn');
      if (!btn) return;
      presetContainer.querySelectorAll('.date-preset-btn').forEach((b) => b.classList.toggle('active', b === btn));
      const range = btn.dataset.range;
      const today = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      if (range === 'all') {
        state.dateFrom = '';
        state.dateTo = '';
      } else if (range === 'today') {
        state.dateFrom = formatDate(today);
        state.dateTo = formatDate(today);
      } else if (range === '7d') {
        const past = new Date(today);
        past.setDate(past.getDate() - 7);
        state.dateFrom = formatDate(past);
        state.dateTo = formatDate(today);
      } else if (range === '30d') {
        const past = new Date(today);
        past.setDate(past.getDate() - 30);
        state.dateFrom = formatDate(past);
        state.dateTo = formatDate(today);
      } else if (range === '90d') {
        const past = new Date(today);
        past.setDate(past.getDate() - 90);
        state.dateFrom = formatDate(past);
        state.dateTo = formatDate(today);
      } else if (range === 'year') {
        state.dateFrom = `${today.getFullYear()}-01-01`;
        state.dateTo = formatDate(today);
      }

      if (dateFrom) dateFrom.value = state.dateFrom;
      if (dateTo) dateTo.value = state.dateTo;
      loadMatches(true);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.queue = null;
      state.sortBy = 'date_desc';
      state.dateFrom = '';
      state.dateTo = '';

      if (sortSelect) sortSelect.value = 'date_desc';
      if (dateFrom) dateFrom.value = '';
      if (dateTo) dateTo.value = '';
      if (presetContainer) {
        presetContainer.querySelectorAll('.date-preset-btn').forEach((b) => b.classList.toggle('active', b.dataset.range === 'all'));
      }
      document.querySelectorAll('#queue-chips .chip').forEach((c) => c.classList.toggle('active', !c.dataset.queue));
      loadMatches(true);
    });
  }
}

function matchRow(m) {
  const mins = num(m.game_duration_seconds) / 60 || 1;
  const kp = num(m.team_kills) ? Math.round(((num(m.kills) + num(m.assists)) / num(m.team_kills)) * 100) : 0;
  const matchDate = m.game_creation ? new Date(m.game_creation) : null;
  const dateFormatted = matchDate ? matchDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  const dateFull = matchDate ? matchDate.toLocaleString('it-IT') : '';
  return `
    <article class="match ${m.win ? 'win' : 'loss'}" data-match="${esc(m.match_id)}">
      <div class="match-summary" role="button" tabindex="0" aria-expanded="false">
        <div class="m-result">
          <span class="m-outcome">${m.win ? 'Vittoria' : 'Sconfitta'}</span>
          <span class="small">${esc(queueLabel(m.queue_id, m.game_mode))}</span>
          <span class="muted small" title="${esc(dateFull)}">${dateFormatted ? `${dateFormatted} · ` : ''}${timeAgo(m.game_creation)} · ${duration(m.game_duration_seconds)}</span>
        </div>
        <div class="m-champ">
          <img class="champ-icon" src="${champImg(m.champion_name)}" alt="" loading="lazy" ${IMG_FALLBACK}>
          <div style="min-width:0">
            <span class="m-champ-name">${esc(m.champion_name)}</span>
            <span class="muted small">${roleLabel(m.team_position)}</span>
          </div>
        </div>
        <div class="m-kda">
          <strong>${m.kills} / <span class="d">${m.deaths}</span> / ${m.assists}</strong>
          <span class="muted small block">${kda(m.kills, m.deaths, m.assists)} KDA</span>
        </div>
        <div class="m-stats">
          <span><b>${m.cs}</b> CS (${(num(m.cs) / mins).toFixed(1)}/min)</span>
          <span>KP <b>${kp}%</b> · <b>${fmtK(m.total_damage_dealt_to_champions)}</b> danni</span>
        </div>
        ${itemsHtml(m)}
        <span class="chev">${CHEVRON}</span>
      </div>
      <div class="match-details" hidden></div>
    </article>`;
}

function bindMatchList(list) {
  const toggle = async (summary) => {
    const art = summary.closest('.match');
    const det = art.querySelector('.match-details');
    const open = summary.getAttribute('aria-expanded') === 'true';
    summary.setAttribute('aria-expanded', String(!open));
    art.classList.toggle('open', !open);
    det.hidden = open;
    if (open || det.dataset.loaded) return;

    det.innerHTML = '<div class="details-loading"><span class="spinner on"></span></div>';
    try {
      const match = await api(`/matches/${enc(art.dataset.match)}`);
      det.innerHTML = matchDetails(match);
      det.dataset.loaded = '1';
    } catch (e) {
      det.innerHTML = errorBox(e.message);
    }
  };
  list.addEventListener('click', (e) => {
    const s = e.target.closest('.match-summary');
    if (s) toggle(s);
  });
  list.addEventListener('keydown', (e) => {
    const s = e.target.closest('.match-summary');
    if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(s); }
  });
}

function matchDetails(m) {
  const ps = m.participants;
  const maxDmg = Math.max(1, ...ps.map((p) => num(p.total_damage_dealt_to_champions)));
  const teamIds = [...new Set(ps.map((p) => p.team_id))].sort((a, b) => a - b);
  const teamName = (id) => (id === 100 ? 'Team blu' : id === 200 ? 'Team rosso' : `Team ${id}`);
  const dotCls = (id) => (id === 100 ? 'blue' : id === 200 ? 'red' : '');

  return `<div class="details-grid">${teamIds.map((id) => {
    const team = ps.filter((p) => p.team_id === id);
    const win = team[0]?.win;
    const kills = team.reduce((s, p) => s + num(p.kills), 0);
    const gold = team.reduce((s, p) => s + num(p.gold_earned), 0);
    return `
      <div class="team ${win ? 'win' : 'loss'}">
        <div class="team-head">
          <span class="team-name"><i class="team-dot ${dotCls(id)}"></i>${teamName(id)} · ${win ? 'Vittoria' : 'Sconfitta'}</span>
          <span class="muted small">${kills} kill · ${fmtK(gold)} oro</span>
        </div>
        ${team.map((p) => participantRow(p, maxDmg)).join('')}
      </div>`;
  }).join('')}</div>`;
}

function participantRow(p, maxDmg) {
  const name = esc(p.riot_id_game_name || 'Sconosciuto');
  const link = p.puuid
    ? `<a href="#/player/${enc(p.puuid)}">${name}</a>`
    : `<span>${name}</span>`;
  const dmg = num(p.total_damage_dealt_to_champions);
  return `
    <div class="p-row ${p.puuid && p.puuid === state.puuid ? 'me' : ''}">
      <img class="champ-icon sm" src="${champImg(p.champion_name)}" alt="${esc(p.champion_name)}" title="${esc(p.champion_name)}" loading="lazy" ${IMG_FALLBACK}>
      <div class="p-name">${link}<span class="muted small">${roleLabel(p.team_position)} · ${p.cs} CS</span></div>
      <div class="p-kda"><span>${p.kills}/${p.deaths}/${p.assists}</span><span class="muted small">${kda(p.kills, p.deaths, p.assists)}</span></div>
      <div class="p-dmg"><span class="small">${fmt(dmg)}</span><div class="minibar"><i style="width:${(dmg / maxDmg) * 100}%"></i></div></div>
      ${itemsHtml(p, 'sm')}
    </div>`;
}

/* ==========================================================================
   Init
   ========================================================================== */
function initTheme() {
  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  });
}

function initSearch() {
  const input = $('#search-input');

  // Filtro live sulla griglia giocatori in home
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll('.player-card').forEach((c) => {
      c.hidden = q && !c.dataset.search.includes(q);
    });
  });

  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    const [rawName, rawTag = ''] = value.split('#');
    const name = rawName.trim().toLowerCase();
    const tag = rawTag.trim().toLowerCase();
    const found = state.players.find((p) =>
      p.game_name.toLowerCase() === name && (!tag || p.tag_line.toLowerCase() === tag));

    input.value = '';
    input.blur();
    if (found) {
      location.hash = `#/player/${enc(found.puuid)}`;
      return;
    }
    toast('Giocatore non presente: sincronizzalo dal modulo', 'info');
    state.prefill = { name: rawName.trim(), tag: rawTag.trim() };
    if (location.hash === '#/' || location.hash === '') router(); else location.hash = '#/';
  });
}

async function loadDDragonVersion() {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await res.json();
    if (versions?.length) state.dd = versions[0];
  } catch { /* usa la versione di fallback */ }
}

(async function init() {
  initTheme();
  initSearch();
  window.addEventListener('hashchange', router);
  api('/players').then((p) => { state.players = p; }).catch(() => {});
  await Promise.race([loadDDragonVersion(), new Promise((r) => setTimeout(r, 1500))]);
  router();
})();
