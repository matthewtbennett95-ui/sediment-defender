// ================================================================
//  SEDIMENT DEFENDER — app entry: screens, roster, maps, end report,
//  leaderboard. The game itself lives in ui/gameview.js.
// ================================================================
import { el, $, $$, clear, storage, fmt } from './ui/dom.js';
import { GameView } from './ui/gameview.js';
import { buildGuide } from './ui/guide.js';
import { BUILTIN_MAPS } from './maps/builtin.js';
import { normalizeMap } from './maps/normalize.js';
import { Game } from './engine/game.js';
import { Renderer } from './render/renderer.js';
import { computeScore, SCORE_MAX } from './engine/scoring.js';
import { POLLUTANTS, POLLUTANT_ORDER } from './data/pollutants.js';
import { MATERIAL_INFO } from './data/bmps.js';
import { pollutantIcon } from './render/sprites.js';
import { STAFF_GROUPS, currentSchoolYear } from './services/config.js';
import * as FB from './services/firebase.js';

const state = {
  player: null,          // { name, period, rosterYear, guest }
  rosters: null,         // { years: {...}, staff: {...} }
  maps: BUILTIN_MAPS.map(m => normalizeMap({ ...m, builtIn: true }).map),
  testMap: null,
  view: null,            // active GameView
  lastMapId: null,
  lbReturn: 'title',
};

// ---------------------------------------------------------------- screens
function show(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  if (name === 'player') renderPlayer();
  if (name === 'maps') renderMaps();
  if (name === 'guide') buildGuide($('#guide-root'), { onClose: () => show(state.player ? 'maps' : 'title') });
  if (name === 'leaderboard') renderLeaderboard();
}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  if (go.dataset.go === 'leaderboard') state.lbReturn = $('.screen.active')?.id.replace('screen-', '') || 'title';
  show(go.dataset.go);
});

// ---------------------------------------------------------------- roster / player
async function loadRostersOnce() {
  if (state.rosters) return state.rosters;
  try {
    state.rosters = await FB.loadRosters();
  } catch (err) {
    console.warn('Roster unavailable', err);
    state.rosters = { years: {}, staff: { periods: {} }, error: true };
  }
  return state.rosters;
}

async function renderPlayer() {
  const status = $('#roster-status');
  const yearSel = $('#sel-year'), perSel = $('#sel-period'), grid = $('#name-grid'), go = $('#btn-player-go');
  const r = await loadRostersOnce();
  const years = Object.keys(r.years).sort().reverse();
  const cur = currentSchoolYear();
  status.textContent = r.error ? 'Could not reach the class list. You can still play as a guest.' :
    years.length ? '' : 'No class list yet — ask your teacher, or play as a guest.';

  // Quick resume
  const last = readLastPlayer();
  const qr = clear($('#quick-resume'));
  if (last && !last.guest) {
    qr.append(el('div.quick-resume',
      el('span', 'Welcome back, ', el('strong', last.name), ` (${last.period})`),
      el('button.btn.small', { onclick: () => choosePlayer(last) }, "That's me →")));
  }

  clear(yearSel);
  const yearOpts = years.length ? years : [cur];
  yearOpts.forEach(y => yearSel.append(el('option', { value: y }, y === cur ? `${y} (this year)` : y)));
  yearSel.value = yearOpts.includes(last?.rosterYear) ? last.rosterYear : (yearOpts.includes(cur) ? cur : yearOpts[0]);

  let picked = null;
  const fillPeriods = () => {
    clear(perSel);
    perSel.append(el('option', { value: '' }, '— Select your class —'));
    const periods = Object.keys(r.years[yearSel.value]?.periods || {}).sort(naturalSort);
    periods.forEach(p => perSel.append(el('option', { value: 'Y|' + p }, p)));
    STAFF_GROUPS.forEach(gname => { if ((r.staff.periods[gname] || []).length) perSel.append(el('option', { value: 'S|' + gname }, gname)); });
    fillNames();
  };
  const fillNames = () => {
    clear(grid); picked = null; go.disabled = true;
    const v = perSel.value;
    if (!v) return;
    const [src, period] = [v.slice(0, 1), v.slice(2)];
    const names = (src === 'S' ? r.staff.periods[period] : r.years[yearSel.value].periods[period]) || [];
    [...names].sort((a, b) => a.localeCompare(b)).forEach(n => {
      const b = el('button.name-btn', { onclick: () => {
        $$('.name-btn', grid).forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        picked = { name: n, period, rosterYear: src === 'S' ? 'staff' : yearSel.value, guest: false };
        go.disabled = false;
      } }, n);
      grid.append(b);
    });
  };
  yearSel.onchange = fillPeriods;
  perSel.onchange = fillNames;
  fillPeriods();
  go.onclick = () => picked && choosePlayer(picked);
  $('#btn-guest').onclick = () => choosePlayer({ name: 'Guest', period: '', rosterYear: '', guest: true });
}

function choosePlayer(p) {
  state.player = p;
  try { storage()?.setItem('sd-player', JSON.stringify(p)); } catch {}
  show('maps');
}

function readLastPlayer() {
  try { return JSON.parse(storage()?.getItem('sd-player') || 'null'); } catch { return null; }
}

function naturalSort(a, b) { return a.localeCompare(b, undefined, { numeric: true }); }

// ---------------------------------------------------------------- maps
let publishedLoaded = false;
async function loadPublishedMaps() {
  if (publishedLoaded) return;
  publishedLoaded = true;
  try {
    const list = await FB.loadPublishedMaps();
    for (const raw of list) {
      const { map, errors } = normalizeMap(raw);
      if (map && !errors.length && !state.maps.some(m => m.id === map.id)) state.maps.push(map);
    }
  } catch (err) { console.warn('Published maps unavailable', err); }
}

async function renderMaps() {
  const p = state.player;
  $('#maps-who').textContent = p ? (p.guest ? 'Playing as a guest — scores won\'t be saved.' : `Engineer: ${p.name} · ${p.period}`) : '';
  await loadPublishedMaps();
  const grid = clear($('#map-grid'));
  const list = state.testMap ? [state.testMap, ...state.maps] : state.maps;
  for (const m of list) {
    const thumb = el('canvas.map-thumb');
    grid.append(el('article.card.map-card',
      thumb,
      el('div.map-diff.diff-' + m.difficulty, m === state.testMap ? 'Test map · not saved' : m.difficulty),
      el('h3', m.name),
      m.author ? el('div.map-meta', 'Designed by ', el('b', m.author)) : null,
      el('p', m.description || ''),
      el('div.map-meta', `Budget `, el('b', '$' + m.startMoney), ` · River health `, el('b', m.startHP), ` · ${m.paths.length} channel${m.paths.length > 1 ? 's' : ''}`),
      el('button.btn', { onclick: () => startGame(m) }, 'Deploy →'),
    ));
    requestAnimationFrame(() => {
      try { Renderer.thumbnail(thumb, new Game(m, { seed: 1 }), 320, 180); } catch (e) { console.warn(e); }
    });
  }
}

// ---------------------------------------------------------------- game
function startGame(map) {
  state.lastMapId = map.id;
  show('game');
  state.view?.destroy();
  state.view = new GameView($('#screen-game'), map, {
    player: state.player,
    onEnd: game => showEnd(game, map),
    onQuit: () => { state.view.destroy(); state.view = null; show('maps'); },
  });
}

// ---------------------------------------------------------------- end report
async function showEnd(game, map) {
  const sc = computeScore(game);
  const won = game.phase === 'won';
  const ov = clear($('#end-overlay'));
  ov.classList.remove('hidden');
  const saveStatus = el('div.save-status');

  const why = {
    water: `Removed ${pct1(sc.detail.preventedPct)} of the pollution load (${fmt(Math.round(sc.detail.removed))} of ${fmt(Math.round(sc.detail.potential))} units). Each storm needs over 95% for any credit.`,
    health: `${Math.round(game.hp)} of ${game.maxHp} river health left — ${fmt(Math.round(sc.detail.potential - sc.detail.removed))} units reached the creek`,
    waves: `${game.stats.wavesCleared} of ${game.maxWaves} storms`,
    efficiency: `${sc.detail.perHundred.toFixed(1)} load removed per $100 · net spent $${fmt(sc.detail.netSpent)}`,
    land: `${sc.detail.acres.toFixed(2)} of ${map.landAllowance} acres used`,
    budget: `$${fmt(game.money)} left over`,
  };
  const names = { water: 'Water Quality', health: 'River Health', waves: 'Storms Survived', efficiency: 'Cost Efficiency', land: 'Land Use', budget: 'Unspent Budget' };

  // What got through
  const rows = POLLUTANT_ORDER
    .map(p => ({ p, t: game.stats.byType[p] }))
    .filter(r => r.t && r.t.potential > 0)
    .map(r => ({ ...r, leakPct: r.t.leaked / r.t.potential }))
    .sort((a, b) => b.leakPct - a.leakPct);
  const worst = rows.find(r => r.leakPct > 0.08);

  const mats = Object.entries(game.stats.materials).filter(([, v]) => v > 0);

  ov.append(el('div.end-box',
    el('div.end-result.' + (won ? 'win' : 'lose'), won ? 'Watershed Protected!' : 'Watershed Lost'),
    el('p.muted', won
      ? `Nice work${state.player && !state.player.guest ? ', ' + state.player.name : ''}. The creek made it through all ${game.maxWaves} storms.`
      : `The creek was overwhelmed during storm ${game.wave}.`),
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '12px' } },
      el('span.end-total', fmt(sc.total)), el('span.muted', `points (max ${fmt(Object.values(SCORE_MAX).reduce((a, b) => a + b, 0))})`)),
    (() => {
      // The "99% removed but the river is half dead" lesson
      const leaked = Math.round(sc.detail.potential - sc.detail.removed);
      const lost = game.maxHp - Math.round(game.hp);
      if (sc.detail.preventedPct < 0.95 || lost < game.maxHp * 0.2) return null;
      return el('div.tip', el('strong', `You removed ${pct1(sc.detail.preventedPct)} of the pollution, but the creek still lost ${lost} health. `),
        `About ${fmt(Math.round(sc.detail.potential))} units washed down the site, and a creek can only absorb a little. The ${fmt(leaked)} units that slipped through did the damage. That's why real stormwater permits limit how much pollution reaches a stream, not just the percent removed.`);
    })(),
    el('div.end-cols',
      el('div',
        el('h4', 'Score breakdown'),
        Object.keys(sc.parts).map(k => el('div.part-row',
          el('span', names[k]), el('b', `${fmt(sc.parts[k])} / ${fmt(SCORE_MAX[k])}`),
          el('div.bar', el('span', { style: { width: (sc.parts[k] / SCORE_MAX[k] * 100) + '%' } })),
          el('div.why', why[k]))),
      ),
      el('div',
        el('h4', 'What reached the creek'),
        rows.length ? rows.map(r => el('div.leak-row',
          pollutantIcon(r.p, 22),
          el('div', el('div.small', POLLUTANTS[r.p].name), el('div.leak-bar', el('span', { style: { width: Math.round(r.leakPct * 100) + '%', background: r.leakPct > 0.3 ? 'var(--red)' : r.leakPct > 0.1 ? 'var(--amber)' : 'var(--green)' } }))),
          el('span.small', { style: { textAlign: 'right' } }, Math.round(r.leakPct * 100) + '%'))) : el('p.small.muted', 'Nothing yet.'),
        worst ? el('div.tip', el('strong', `${POLLUTANTS[worst.p].name} got through the most. `), POLLUTANTS[worst.p].tip) : null,
        mats.length ? [el('h4', 'Materials used'), el('div.materials', mats.map(([k, v]) => [el('span', MATERIAL_INFO[k]?.name || k), el('b', `${fmt(v)} ${MATERIAL_INFO[k]?.unit || ''}`)]))] : null,
        el('div.small.muted', { style: { marginTop: '8px' } },
          `Spent $${fmt(game.stats.spentBuild)} building · $${fmt(game.stats.spentUpgrade)} upgrades · $${fmt(game.stats.spentMaintenance)} maintenance${game.stats.spentRepair ? ` · $${fmt(game.stats.spentRepair)} embankment repairs` : ''}${game.stats.salvage ? ` · salvaged $${fmt(game.stats.salvage)}` : ''}`),
      ),
    ),
    saveStatus,
    el('div.row-actions',
      el('button.btn.ghost', { onclick: () => { closeEnd(); state.lbReturn = 'maps'; show('leaderboard'); } }, '🏆 Leaderboard'),
      el('button.btn.ghost', { onclick: () => { closeEnd(); show('maps'); } }, 'Choose site'),
      el('button.btn', { onclick: () => { closeEnd(); startGame(map); } }, '↻ Play again'),
    ),
  ));

  // Save
  const p = state.player;
  if (!p || p.guest) { saveStatus.textContent = 'Guest game — score not saved.'; return; }
  if (map === state.testMap) { saveStatus.textContent = 'Test map — score not saved.'; return; }
  saveStatus.textContent = 'Saving score…';
  try {
    await FB.saveRun({
      v: 2,
      name: p.name, period: p.period, rosterYear: p.rosterYear,
      schoolYear: currentSchoolYear(),
      mapId: map.id, mapName: map.name,
      score: sc.total,
      parts: sc.parts,
      wavesCleared: game.stats.wavesCleared, won,
      hp: Math.round(game.hp),
      prevented: Math.round(sc.detail.preventedPct * 1000) / 1000,
      netSpent: Math.round(sc.detail.netSpent),
      acres: Math.round(sc.detail.acres * 100) / 100,
      seed: game.seed,
    });
    saveStatus.textContent = '✓ Score saved to the leaderboard.';
  } catch (err) {
    console.warn(err);
    saveStatus.textContent = 'Could not save the score (no connection?).';
  }
}

function closeEnd() {
  $('#end-overlay').classList.add('hidden');
  state.view?.destroy();
  state.view = null;
}

// ---------------------------------------------------------------- leaderboard
let lbMap = null, lbView = 'year';
async function renderLeaderboard() {
  await loadPublishedMaps();
  $('#lb-back').onclick = () => show(state.lbReturn || 'title');
  if (!lbMap) lbMap = state.lastMapId || state.maps[0].id;
  const tabs = clear($('#lb-maps'));
  state.maps.forEach(m => tabs.append(el('button.tab' + (m.id === lbMap ? '.on' : ''), { onclick: () => { lbMap = m.id; renderLeaderboard(); } }, m.name)));
  const views = clear($('#lb-views'));
  [['year', `This year by class (${currentSchoolYear()})`], ['all', 'All-time top 25']].forEach(([v, label]) =>
    views.append(el('button.seg' + (lbView === v ? '.on' : ''), { onclick: () => { lbView = v; renderLeaderboard(); } }, label)));

  const content = clear($('#lb-content'));
  content.append(el('p.muted', 'Loading scores…'));
  let runs = [];
  try { runs = await FB.loadRuns(lbMap); }
  catch (err) { console.warn(err); clear(content).append(el('p.muted', 'Could not load scores right now.')); return; }

  clear(content);
  const best = bestPerPerson(runs);
  if (lbView === 'all') {
    content.append(scoreTable(best.slice(0, 25)));
  } else {
    const yr = currentSchoolYear();
    const rows = best.filter(r => STAFF_GROUPS.includes(r.period) || r.schoolYear === yr);
    if (!rows.length) { content.append(el('p.muted', 'No scores this school year yet. Be the first!')); return; }
    const byPeriod = {};
    rows.forEach(r => (byPeriod[r.period || 'Other'] ||= []).push(r));
    const order = Object.keys(byPeriod).filter(p => !STAFF_GROUPS.includes(p)).sort(naturalSort).concat(STAFF_GROUPS.filter(p => byPeriod[p]));
    order.forEach(p => content.append(el('div.period-head', p), scoreTable(byPeriod[p])));
  }
}

function bestPerPerson(runs) {
  const best = new Map();
  for (const r of runs) {
    const k = (r.name || '') + '|' + (r.period || '') + '|' + (r.rosterYear || '');
    if (!best.has(k) || r.score > best.get(k).score) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

function pct1(f) {
  // 99.6% shouldn't round up to a perfect-looking 100%
  const v = f * 100;
  return (v >= 99 && v < 100 ? Math.floor(v * 10) / 10 : Math.floor(v)) + '%';
}

function scoreTable(rows) {
  if (!rows.length) return el('p.muted', 'No scores yet. Play a round to get on the board!');
  const me = state.player;
  const maxHp = state.maps.find(m => m.id === lbMap)?.startHP;
  return el('table.lb-table',
    el('thead', el('tr', el('th', '#'), el('th', 'Engineer'), el('th', 'Class'), el('th.num', 'Storms'), el('th.num', 'River health'), el('th.num', 'Score'))),
    el('tbody', rows.map((r, i) => el('tr' + (me && r.name === me.name && r.period === me.period ? '.me' : ''),
      el('td', el('span.rank' + (i < 3 ? '.r' + (i + 1) : ''), i + 1)),
      el('td', r.name || '—'),
      el('td.muted', r.period || ''),
      el('td.num', (r.wavesCleared ?? '—') + (r.won ? ' ✓' : '')),
      el('td.num', r.hp != null ? (maxHp ? `${r.hp} / ${maxHp}` : String(r.hp)) : '—'),
      el('td.num.score', fmt(r.score)),
    ))),
  );
}

// ---------------------------------------------------------------- boot
(function boot() {
  // Map editor "Test play" hands a map over through localStorage.
  if (location.hash === '#test') {
    try {
      const raw = JSON.parse(storage()?.getItem('sd-test-map') || 'null');
      const { map, errors } = normalizeMap(raw);
      if (map && !errors.length) {
        state.testMap = map;
        state.player = { name: 'Guest', period: '', rosterYear: '', guest: true };
        startGame(map);
        return;
      }
    } catch (err) { console.warn(err); }
  }
  // Warm up Firebase in the background so the roster loads fast.
  FB.ensureSignedIn().catch(err => console.warn('Firebase sign-in failed', err));
})();
