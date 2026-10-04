// ================================================================
//  TEACHER DASHBOARD
//  Roster by school year · score moderation · publishing maps.
//  Only accounts in TEACHER_EMAILS (config.js) AND firestore.rules
//  can change anything.
// ================================================================
import { el, $, clear, fmt, storage } from './ui/dom.js';
import * as FB from './services/firebase.js';
import { TEACHER_EMAILS, STAFF_GROUPS, currentSchoolYear } from './services/config.js';
import { BUILTIN_MAPS } from './maps/builtin.js';
import { normalizeMap } from './maps/normalize.js';

const main = $('#main');
const auth = $('#auth');
let user = null;
let tab = 'roster';

// ---------------------------------------------------------------- auth
FB.onAuthChange(u => { user = u && !u.isAnonymous ? u : null; render(); })
  .catch(err => {
    clear(main).append(el('div.notice.err', 'Could not connect to Firebase. Check your internet connection and reload. (' + err.message + ')'));
  });

function isTeacher() { return !!user && TEACHER_EMAILS.includes((user.email || '').toLowerCase()); }

function render() {
  clear(auth);
  if (user) {
    auth.append(el('span', user.email), el('button.btn.ghost.small', { onclick: () => FB.signOut() }, 'Sign out'));
  }
  clear(main);
  if (!user) {
    main.append(el('div.card',
      el('h2', 'Sign in'),
      el('p', 'Sign in with the Google account listed as a teacher for this game.'),
      el('button.btn', { onclick: signIn }, 'Sign in with Google'),
      el('p.muted.small', { style: { marginTop: '12px' } }, el('a', { href: 'index.html' }, '← Back to the game')),
    ));
    return;
  }
  if (!isTeacher()) {
    main.append(el('div.notice.err', `${user.email} is not on the teacher list. Add it to TEACHER_EMAILS in js/services/config.js and to isTeacher() in firestore.rules, then deploy.`));
    return;
  }
  const tabs = [['roster', 'Class Roster'], ['scores', 'Scores'], ['maps', 'Maps'], ['help', 'Help']];
  main.append(el('div.tabs', tabs.map(([id, label]) => el('button.tab' + (tab === id ? '.on' : ''), { onclick: () => { tab = id; render(); } }, label))));
  const body = el('div');
  main.append(body);
  ({ roster: renderRoster, scores: renderScores, maps: renderMaps, help: renderHelp })[tab](body);
}

async function signIn() {
  try { await FB.teacherSignIn(); }
  catch (err) { alert('Sign-in failed: ' + err.message); }
}

function flash(container, text, kind = 'ok') {
  const n = el('div.notice.' + kind, text);
  container.prepend(n);
  setTimeout(() => n.remove(), 5000);
}

// ---------------------------------------------------------------- roster
let rosterCache = null;
let rosterDoc = null;

async function renderRoster(body) {
  body.append(el('p.muted', 'Loading roster…'));
  try { rosterCache = await FB.loadRosters(); }
  catch (err) { clear(body).append(el('div.notice.err', 'Could not load roster: ' + err.message)); return; }
  clear(body);
  const cur = currentSchoolYear();
  const years = Object.keys(rosterCache.years).sort().reverse();
  if (!rosterDoc) rosterDoc = years.includes(cur) ? cur : (years[0] || cur);

  const sel = el('select', { onchange: e => { rosterDoc = e.target.value; render(); } });
  const opts = new Set([...years, cur]);
  [...opts].sort().reverse().forEach(y => sel.append(el('option', { value: y, selected: y === rosterDoc }, y + (y === cur ? ' (this year)' : '') + (rosterCache.years[y] ? '' : ' — new'))));
  sel.append(el('option', { value: 'staff', selected: rosterDoc === 'staff' }, 'Teachers & Peer Leaders (every year)'));

  body.append(
    el('div.notice', 'Names here appear in the game\'s name picker for anyone with the link. First name + last initial is a good habit. Students from past years stay selectable under their year, so they can keep playing.'),
    el('div.t-row',
      el('label', 'Roster', sel),
      el('button.btn.ghost.small', { onclick: () => { const y = prompt('School year (like 2027-2028):', nextYear(cur)); if (y && /^\d{4}-\d{4}$/.test(y)) { rosterDoc = y; rosterCache.years[y] ||= { periods: {} }; render(); } } }, '+ Another school year'),
    ),
  );

  const isStaff = rosterDoc === 'staff';
  const periods = structuredClone(isStaff ? rosterCache.staff.periods : (rosterCache.years[rosterDoc]?.periods || {}));
  if (isStaff) STAFF_GROUPS.forEach(g => { periods[g] ||= []; });

  const grid = el('div.period-grid');
  const cards = [];
  const addCard = (name, names) => {
    const nameIn = el('input', { type: 'text', value: name, placeholder: 'Class name (e.g. 2nd Period)', disabled: isStaff });
    const ta = el('textarea', { placeholder: 'One name per line' });
    ta.value = (names || []).join('\n');
    const count = el('span.count');
    const upd = () => { count.textContent = ta.value.split('\n').filter(s => s.trim()).length + ' students'; };
    ta.addEventListener('input', upd); upd();
    const card = el('div.card.period-card',
      el('div.t-row', nameIn, isStaff ? null : el('button.btn.ghost.small', { title: 'Remove class', onclick: () => { if (confirm(`Remove ${nameIn.value || 'this class'}?`)) { card.remove(); cards.splice(cards.indexOf(rec), 1); } } }, '✕')),
      ta, count);
    const rec = { nameIn, ta };
    cards.push(rec);
    grid.append(card);
  };
  Object.keys(periods).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach(p => addCard(p, periods[p]));
  if (!isStaff && !Object.keys(periods).length) ['1st Period', '2nd Period', '3rd Period', '4th Period'].forEach(p => addCard(p, []));

  const status = el('div');
  body.append(
    el('div.t-row',
      isStaff ? null : el('button.btn.ghost.small', { onclick: () => addCard('', []) }, '+ Add class'),
      el('button.btn', { onclick: save }, 'Save roster'),
      isStaff || !rosterCache.years[rosterDoc] ? null : el('button.btn.danger.small', { onclick: del }, 'Delete this year'),
    ),
    status, grid,
    el('h3', { style: { marginTop: '28px' } }, 'Import from a spreadsheet'),
    importBox(),
  );

  async function save() {
    const out = {};
    for (const c of cards) {
      const n = c.nameIn.value.trim();
      if (!n) continue;
      const names = [...new Set(c.ta.value.split('\n').map(s => s.trim()).filter(Boolean))];
      out[n] = names;
    }
    try {
      await FB.saveRoster(rosterDoc, out);
      rosterCache = null;
      render();
      setTimeout(() => flash($('#main > div:last-child') || main, `Saved ${rosterDoc === 'staff' ? 'staff list' : rosterDoc} roster.`), 300);
    } catch (err) { flash(status, 'Save failed: ' + err.message, 'err'); }
  }
  async function del() {
    if (!confirm(`Delete the whole ${rosterDoc} roster? Scores are kept.`)) return;
    try { await FB.deleteRoster(rosterDoc); rosterDoc = null; render(); }
    catch (err) { flash(status, 'Delete failed: ' + err.message, 'err'); }
  }
}

function nextYear(y) { const a = +y.slice(0, 4) + 1; return `${a}-${a + 1}`; }

function importBox() {
  const ta = el('textarea.mono', { placeholder: 'Year,Period,Name\n2026-2027,1st Period,"Bennett, Matt"\n...,Teachers,Mr. Bennett' });
  const out = el('div');
  return el('div.card',
    el('p', 'Paste rows from your old Google Sheet (or any spreadsheet) with the columns ', el('strong', 'Year, Period, Name'), '. "Teachers" and "Peer Leaders" rows go to the every-year list. Imported names are ADDED to what is already saved.'),
    ta,
    el('div.t-row', { style: { marginTop: '8px' } },
      el('input', { type: 'file', accept: '.csv,text/csv', onchange: async e => { const f = e.target.files[0]; if (f) ta.value = await f.text(); } }),
      el('button.btn.small', { onclick: () => doImport(ta.value, out) }, 'Import'),
    ),
    out);
}

async function doImport(text, out) {
  clear(out);
  const rows = parseCSV(text).filter(r => r.length >= 3);
  if (rows.length && /year/i.test(rows[0][0])) rows.shift();
  const byDoc = {};
  for (const [year, period, name] of rows) {
    if (!name?.trim() || !period?.trim()) continue;
    const p = period.trim();
    const doc = STAFF_GROUPS.includes(p) ? 'staff' : year.trim();
    if (doc !== 'staff' && !/^\d{4}-\d{4}$/.test(doc)) continue;
    ((byDoc[doc] ||= {})[p] ||= new Set()).add(name.trim());
  }
  const docs = Object.keys(byDoc);
  if (!docs.length) { out.append(el('div.notice.err', 'No valid rows found. Expected: Year (like 2026-2027), Period, Name.')); return; }
  const summary = docs.map(d => `${d}: ${Object.values(byDoc[d]).reduce((a, s) => a + s.size, 0)} names in ${Object.keys(byDoc[d]).length} groups`).join('\n');
  if (!confirm('Import these?\n\n' + summary)) return;
  try {
    const current = await FB.loadRosters();
    for (const d of docs) {
      const existing = d === 'staff' ? current.staff.periods : (current.years[d]?.periods || {});
      const merged = structuredClone(existing);
      for (const p in byDoc[d]) merged[p] = [...new Set([...(merged[p] || []), ...byDoc[d][p]])];
      await FB.saveRoster(d, merged);
    }
    out.append(el('div.notice.ok', 'Imported.\n' + summary));
    rosterCache = null;
  } catch (err) { out.append(el('div.notice.err', 'Import failed: ' + err.message)); }
}

/** Minimal CSV parser that handles quoted fields with commas. */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(s => s.trim()));
}

// ---------------------------------------------------------------- scores
async function renderScores(body) {
  body.append(el('p.muted', 'Loading scores…'));
  let runs;
  try { runs = await FB.loadAllRuns(); }
  catch (err) { clear(body).append(el('div.notice.err', 'Could not load scores: ' + err.message)); return; }
  clear(body);
  const mapNames = Object.fromEntries(BUILTIN_MAPS.map(m => [m.id, m.name]));
  const mapHp = Object.fromEntries(BUILTIN_MAPS.map(m => [m.id, m.startHP]));
  runs.forEach(r => { if (r.mapName) mapNames[r.mapId] ||= r.mapName; });
  const years = [...new Set(runs.map(r => r.schoolYear).filter(Boolean))].sort().reverse();
  const f = { map: '', year: currentSchoolYear(), q: '' };

  const mapSel = el('select', { onchange: e => { f.map = e.target.value; draw(); } }, el('option', { value: '' }, 'All maps'), Object.entries(mapNames).map(([id, n]) => el('option', { value: id }, n)));
  const yearSel = el('select', { onchange: e => { f.year = e.target.value; draw(); } }, el('option', { value: '' }, 'All years'), years.map(y => el('option', { value: y, selected: y === f.year }, y)));
  if (!years.includes(f.year)) f.year = '';
  const search = el('input', { type: 'text', placeholder: 'Search name or class', oninput: e => { f.q = e.target.value.toLowerCase(); draw(); } });
  const tableWrap = el('div.table-wrap');
  const info = el('div.count');
  body.append(
    el('p.muted.small', 'Hidden scores stay in the database but don\'t show on the leaderboard. This list shows the most recent 1,000 games.'),
    el('div.t-row', el('label', 'Map', mapSel), el('label', 'School year', yearSel), el('label', 'Search', search),
      el('button.btn.ghost.small', { onclick: () => exportCSV(filtered()) }, '⬇ Export CSV')),
    info, tableWrap,
  );

  const filtered = () => runs.filter(r =>
    (!f.map || r.mapId === f.map) && (!f.year || r.schoolYear === f.year) &&
    (!f.q || (r.name || '').toLowerCase().includes(f.q) || (r.period || '').toLowerCase().includes(f.q)));

  function draw() {
    const list = filtered();
    info.textContent = `${list.length} games`;
    clear(tableWrap).append(el('table.t-table',
      el('thead', el('tr', ['When', 'Name', 'Class', 'Map', 'Storms', 'River health', 'Removed', 'Score', ''].map(h => el('th', h)))),
      el('tbody', list.map(r => {
        const tr = el('tr' + (r.hidden ? '.is-hidden' : ''),
          el('td', r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : ''),
          el('td', r.name || ''), el('td', r.period || ''), el('td', mapNames[r.mapId] || r.mapId),
          el('td.num', (r.wavesCleared ?? '') + (r.won ? ' ✓' : '')),
          el('td.num', r.hp != null ? (mapHp[r.mapId] ? `${r.hp} / ${mapHp[r.mapId]}` : String(r.hp)) : ''),
          el('td.num', r.prevented != null ? (r.prevented * 100).toFixed(1) + '%' : ''),
          el('td.num', fmt(r.score || 0)),
          el('td', el('div.map-actions',
            el('button.btn.ghost.small', { onclick: async () => { try { await FB.setRunHidden(r.id, !r.hidden); r.hidden = !r.hidden; draw(); } catch (err) { alert(err.message); } } }, r.hidden ? 'Unhide' : 'Hide'),
            el('button.btn.danger.small', { onclick: async () => { if (!confirm(`Delete ${r.name}'s score of ${r.score}?`)) return; try { await FB.deleteRun(r.id); runs.splice(runs.indexOf(r), 1); draw(); } catch (err) { alert(err.message); } } }, 'Delete'))),
        );
        return tr;
      })),
    ));
  }
  draw();
}

function exportCSV(list) {
  const cols = ['date', 'name', 'period', 'rosterYear', 'schoolYear', 'mapId', 'score', 'wavesCleared', 'won', 'hp', 'prevented', 'netSpent', 'acres', 'hidden'];
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [cols.join(',')].concat(list.map(r => cols.map(c => esc(c === 'date' ? (r.createdAt?.toDate?.().toISOString() || '') : r[c])).join(',')));
  download('sediment-defender-scores.csv', lines.join('\n'), 'text/csv');
}

function download(name, text, type) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

// ---------------------------------------------------------------- maps
async function renderMaps(body) {
  body.append(el('p.muted', 'Loading maps…'));
  let maps;
  try { maps = await FB.loadAllMaps(); }
  catch (err) { clear(body).append(el('div.notice.err', 'Could not load maps: ' + err.message)); return; }
  clear(body);
  const status = el('div');
  body.append(
    el('p', 'Students (or you) design maps in the ', el('a', { href: 'editor.html', target: '_blank' }, 'Map Editor'), ' and export a .json file. Import it here, test it, then publish it to make it show up for everyone. A great prize for the leaderboard winner: their map becomes the next mission.'),
    status,
    el('div.card', { style: { marginBottom: '16px' } }, el('h3', 'Built-in maps'),
      BUILTIN_MAPS.map(m => el('div.map-row', el('div', el('h3', m.name, el('span.pill.live', 'always on')), el('div.muted.small', m.difficulty)),
        el('div.map-actions', el('button.btn.ghost.small', { onclick: () => testPlay(m) }, 'Play'))))),
    el('div.card', { style: { marginBottom: '16px' } }, el('h3', 'Custom maps'),
      maps.length ? maps.map(row => mapRow(row, status)) : el('p.muted', 'None yet.')),
    el('div.card', el('h3', 'Import a map'), importMapBox(status)),
  );
}

function mapRow(row, status) {
  const m = row.map || {};
  return el('div.map-row',
    el('div', el('h3', m.name || row.id, el('span.pill' + (row.published ? '.live' : ''), row.published ? 'published' : 'hidden')),
      el('div.muted.small', [m.author ? 'by ' + m.author : null, m.difficulty, `${(m.paths || []).length} channels`].filter(Boolean).join(' · '))),
    el('div.map-actions',
      el('button.btn.ghost.small', { onclick: () => testPlay(m) }, 'Test play'),
      el('button.btn.ghost.small', { onclick: () => { storage()?.setItem('sd-editor-draft', JSON.stringify(m)); window.open('editor.html', '_blank'); } }, 'Edit'),
      el('button.btn.ghost.small', { onclick: () => download((m.id || 'map') + '.json', JSON.stringify(m, null, 2), 'application/json') }, 'Download'),
      el('button.btn.small' + (row.published ? '.ghost' : ''), { onclick: async () => { try { await FB.setMapPublished(row.id, !row.published); render(); } catch (err) { flash(status, err.message, 'err'); } } }, row.published ? 'Unpublish' : 'Publish'),
      el('button.btn.danger.small', { onclick: async () => { if (!confirm(`Delete ${m.name}? Scores on it are kept.`)) return; try { await FB.deleteMap(row.id); render(); } catch (err) { flash(status, err.message, 'err'); } } }, 'Delete'),
    ));
}

function testPlay(m) {
  storage()?.setItem('sd-test-map', JSON.stringify(m));
  window.open('index.html#test', '_blank');
}

function importMapBox(status) {
  const ta = el('textarea.mono', { placeholder: 'Paste map JSON here, or choose a file' });
  const pub = el('input', { type: 'checkbox' });
  return el('div',
    ta,
    el('div.t-row', { style: { marginTop: '8px' } },
      el('input', { type: 'file', accept: '.json,application/json', onchange: async e => { const f = e.target.files[0]; if (f) ta.value = await f.text(); } }),
      el('label.toggle', pub, ' Publish right away'),
      el('button.btn.small', { onclick: async () => {
        let raw;
        try { raw = JSON.parse(ta.value); } catch { flash(status, 'That is not valid JSON.', 'err'); return; }
        const { map, errors } = normalizeMap(raw);
        if (errors.length) { flash(status, 'Map has problems: ' + errors.join(' '), 'err'); return; }
        if (BUILTIN_MAPS.some(b => b.id === map.id)) map.id += '-custom';
        try { await FB.saveMap(map, pub.checked); flash(status, `Saved "${map.name}".`); render(); }
        catch (err) { flash(status, 'Save failed: ' + err.message, 'err'); }
      } }, 'Import map'),
    ));
}

// ---------------------------------------------------------------- help
function renderHelp(body) {
  body.append(el('div.card',
    el('h3', 'Quick reference'),
    el('ul', { style: { paddingLeft: '20px', lineHeight: '1.7', color: 'var(--text2)' } },
      el('li', 'Each August, add a new school year in Class Roster and enter the new classes. Last year\'s students stay selectable under last year.'),
      el('li', 'Leaderboard "This year" view uses the school year a game was played in (August–July).'),
      el('li', 'If a score looks impossible, Hide it. Hidden scores stay in the database so you can restore them.'),
      el('li', 'Add ?dev to the game URL (index.html?dev) for a 10× speed button when testing.'),
      el('li', 'Game balance numbers live in public/js/data/ (BMPs, pollutants, waves) and public/js/maps/builtin.js. Each file has comments explaining what to change.'),
    ),
  ));
}
