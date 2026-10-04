// ================================================================
//  MAP EDITOR — draw channels, add scenery, test, and export a map.
//  Exported .json files can be imported on the Teacher Dashboard and
//  published so everyone can play them.
// ================================================================
import { el, $, clear, storage } from './ui/dom.js';
import { normalizeMap, DIFFICULTY_PRESETS } from './maps/normalize.js';
import { BUILTIN_MAPS } from './maps/builtin.js';
import { Game } from './engine/game.js';
import { Renderer } from './render/renderer.js';
import { closestOnSegment } from './engine/geometry.js';

const DRAFT_KEY = 'sd-editor-draft';
const SNAP = 10;
const canvas = $('#cv');
const side = $('#side');
const tools = $('#tools');
const hint = $('#hint');

let draft = loadDraft() || blankMap();
let tool = 'path';
let drawing = null;        // index of path being drawn
let sel = null;            // { kind: 'path'|'decor', i }
let drag = null;           // { kind: 'vertex'|'decor', pi, vi, di }
let hover = null;          // world point
let renderer = null;

function blankMap() {
  return {
    id: 'map-' + Math.random().toString(36).slice(2, 7),
    name: 'My New Watershed', author: '', description: '', difficulty: 'Medium', theme: 'construction',
    creekLabel: 'PROTECTED CREEK', paths: [], decor: [],
  };
}

function loadDraft() {
  try { return JSON.parse(storage()?.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
}
function saveDraft() {
  try { storage()?.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
}

// ---------------------------------------------------------------- preview
function rebuild() {
  const { map } = normalizeMap(structuredClone(draft));
  const game = new Game(map, { seed: 1 });
  game.paths.forEach(p => { p.status = 'open'; });
  if (!renderer) {
    renderer = new Renderer(canvas, game);
    new ResizeObserver(() => { renderer.resize(); draw(); }).observe($('#stage'));
  } else {
    renderer.game = game;
    renderer.dirty = true;
  }
  saveDraft();
  draw();
}

function draw() {
  if (!renderer) return;
  renderer.draw();
  const ctx = renderer.ctx;
  renderer.worldTransform(ctx);
  // Breach channels
  draft.paths.forEach((p, pi) => {
    if (p.breachable && p.points.length) {
      ctx.fillStyle = '#f0a830'; ctx.font = '600 18px Oswald, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('BREACH', p.points[0][0], p.points[0][1] - 16);
    }
    const on = sel?.kind === 'path' && sel.i === pi || drawing === pi;
    ctx.strokeStyle = on ? '#f0c040' : '#ffffff55'; ctx.lineWidth = on ? 3 : 1.5;
    ctx.beginPath();
    p.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    if (drawing === pi && hover) ctx.lineTo(hover.x, hover.y);
    ctx.stroke();
    p.points.forEach(([x, y], vi) => {
      ctx.fillStyle = vi === 0 ? '#5cb85c' : on ? '#f0c040' : '#ffffffaa';
      ctx.beginPath(); ctx.arc(x, y, vi === 0 ? 9 : 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  });
  draft.decor.forEach((d, di) => {
    if (!(sel?.kind === 'decor' && sel.i === di)) return;
    ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
    const r = d.type === 'pond' ? Math.max(d.rx, d.ry) : d.type === 'trees' ? d.r : 40;
    const cx = ['gravel', 'rows', 'building'].includes(d.type) ? d.x + d.w / 2 : d.x;
    const cy = ['gravel', 'rows', 'building'].includes(d.type) ? d.y + d.h / 2 : d.y;
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  });
}

// ---------------------------------------------------------------- tools
const TOOLS = [
  ['select', '↖ Select / Move', 'Drag the dots to reshape a channel. Click a channel or scenery item to edit it. Right-click a dot to delete it.'],
  ['path', '〰 Draw Channel', 'Click to add points. The green dot is where runoff enters. Click in the creek (bottom) or press Finish / Enter to end the channel.'],
  ['pond', '◯ Pond', 'Click to place a pond. Ponds block building.'],
  ['trees', '♣ Trees', 'Click to place a cluster of trees (decoration).'],
  ['gravel', '▦ Bare Soil', 'Click to place a patch of bare construction soil (decoration).'],
  ['rows', '≡ Farm Field', 'Click to place crop rows (decoration).'],
  ['building', '▭ Building', 'Click to place a building (decoration).'],
  ['label', 'T Label', 'Click to place a text label.'],
];

function renderTools() {
  clear(tools);
  TOOLS.forEach(([id, label]) => tools.append(el('button.tool' + (tool === id ? '.on' : ''), { onclick: () => setTool(id) }, label)));
  tools.append(el('span.tool-sep'));
  if (drawing != null) tools.append(el('button.tool.on', { onclick: finishPath }, '✓ Finish channel'));
  hint.textContent = TOOLS.find(t => t[0] === tool)[2];
}

function setTool(t) {
  if (drawing != null) finishPath();
  tool = t; renderTools(); draw();
}

function finishPath() {
  if (drawing == null) return;
  const p = draft.paths[drawing];
  if (p.points.length < 2) draft.paths.splice(drawing, 1);
  sel = p.points.length >= 2 ? { kind: 'path', i: drawing } : null;
  drawing = null;
  renderTools(); renderSide(); rebuild();
}

// ---------------------------------------------------------------- input
const snap = v => Math.round(v / SNAP) * SNAP;
function worldFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  const w = renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
  return { x: Math.max(0, Math.min(1600, snap(w.x))), y: Math.max(0, Math.min(900, snap(w.y))) };
}

function hitVertex(p) {
  for (let pi = draft.paths.length - 1; pi >= 0; pi--) {
    const pts = draft.paths[pi].points;
    for (let vi = 0; vi < pts.length; vi++) if (Math.hypot(pts[vi][0] - p.x, pts[vi][1] - p.y) < 16) return { pi, vi };
  }
  return null;
}
function hitPath(p) {
  for (let pi = draft.paths.length - 1; pi >= 0; pi--) {
    const pts = draft.paths[pi].points;
    for (let i = 1; i < pts.length; i++) if (closestOnSegment(p.x, p.y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]).dist < 20) return pi;
  }
  return -1;
}
function hitDecor(p) {
  for (let di = draft.decor.length - 1; di >= 0; di--) {
    const d = draft.decor[di];
    if (['gravel', 'rows', 'building'].includes(d.type)) { if (p.x >= d.x && p.x <= d.x + d.w && p.y >= d.y && p.y <= d.y + d.h) return di; }
    else if (Math.hypot(d.x - p.x, d.y - p.y) < (d.type === 'pond' ? Math.max(d.rx, d.ry) : d.type === 'trees' ? d.r : 40)) return di;
  }
  return -1;
}

canvas.addEventListener('pointerdown', e => {
  if (!renderer) return;
  const p = worldFromEvent(e);
  if (e.button === 2) {
    const v = hitVertex(p);
    if (v && draft.paths[v.pi].points.length > 2) { draft.paths[v.pi].points.splice(v.vi, 1); rebuild(); }
    return;
  }
  if (tool === 'path') {
    if (drawing == null) {
      draft.paths.push({ id: 'ch' + (draft.paths.length + 1) + Math.random().toString(36).slice(2, 4), label: '', points: [], opensAtWave: 1 });
      drawing = draft.paths.length - 1;
      renderTools(); renderSide();
    }
    draft.paths[drawing].points.push([p.x, p.y]);
    const creekY = 810;
    if (p.y >= creekY && draft.paths[drawing].points.length >= 2) { finishPath(); return; }
    rebuild();
    return;
  }
  if (tool === 'select') {
    const v = hitVertex(p);
    if (v) { drag = { kind: 'vertex', ...v }; sel = { kind: 'path', i: v.pi }; renderSide(); canvas.setPointerCapture(e.pointerId); return; }
    const di = hitDecor(p);
    if (di >= 0) { drag = { kind: 'decor', di, ox: p.x - draft.decor[di].x, oy: p.y - draft.decor[di].y }; sel = { kind: 'decor', i: di }; renderSide(); canvas.setPointerCapture(e.pointerId); draw(); return; }
    const pi = hitPath(p);
    sel = pi >= 0 ? { kind: 'path', i: pi } : null;
    renderSide(); draw();
    return;
  }
  // Decoration tools
  const defaults = {
    pond: { type: 'pond', x: p.x, y: p.y, rx: 150, ry: 90, label: '' },
    trees: { type: 'trees', x: p.x, y: p.y, r: 60, n: 7 },
    gravel: { type: 'gravel', x: p.x - 120, y: p.y - 60, w: 240, h: 120 },
    rows: { type: 'rows', x: p.x - 150, y: p.y - 100, w: 300, h: 200 },
    building: { type: 'building', x: p.x - 50, y: p.y - 35, w: 100, h: 70 },
    label: { type: 'label', x: p.x, y: p.y, text: 'LABEL' },
  };
  draft.decor.push(defaults[tool]);
  sel = { kind: 'decor', i: draft.decor.length - 1 };
  setTool('select');
  renderSide(); rebuild();
});

canvas.addEventListener('pointermove', e => {
  if (!renderer) return;
  hover = worldFromEvent(e);
  if (drag?.kind === 'vertex') { draft.paths[drag.pi].points[drag.vi] = [hover.x, hover.y]; rebuild(); return; }
  if (drag?.kind === 'decor') { const d = draft.decor[drag.di]; d.x = hover.x - drag.ox; d.y = hover.y - drag.oy; rebuild(); return; }
  if (drawing != null) draw();
});
canvas.addEventListener('pointerup', () => { if (drag) { drag = null; renderSide(); } });
canvas.addEventListener('dblclick', () => { if (drawing != null) { draft.paths[drawing].points.pop(); finishPath(); } });
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'Enter' || e.key === 'Escape') finishPath();
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { removeSelected(); }
});

function removeSelected() {
  if (!sel) return;
  if (sel.kind === 'path') draft.paths.splice(sel.i, 1);
  else draft.decor.splice(sel.i, 1);
  sel = null; renderSide(); rebuild();
}

// ---------------------------------------------------------------- side panel
function field(label, input) { return el('label.field', label, input); }
function bind(obj, key, type = 'text', after) {
  const input = type === 'textarea' ? el('textarea') : el('input', { type });
  input.value = obj[key] ?? '';
  input.addEventListener('input', () => {
    obj[key] = type === 'number' ? (input.value === '' ? undefined : +input.value) : input.value;
    after?.(); rebuild();
  });
  return input;
}

function renderSide() {
  clear(side);
  const preset = DIFFICULTY_PRESETS[draft.difficulty] || DIFFICULTY_PRESETS.Medium;
  const diffSel = el('select', { onchange: e => { draft.difficulty = e.target.value; renderSide(); rebuild(); } },
    Object.keys(DIFFICULTY_PRESETS).map(d => el('option', { value: d, selected: d === draft.difficulty }, d)));
  const themeSel = el('select', { onchange: e => { draft.theme = e.target.value; rebuild(); } },
    ['construction', 'farm', 'split', 'pond', 'urban', 'forest'].map(t => el('option', { value: t, selected: t === draft.theme }, t[0].toUpperCase() + t.slice(1))));
  const money = bind(draft, 'startMoney', 'number'); money.placeholder = preset.startMoney;
  const hp = bind(draft, 'startHP', 'number'); hp.placeholder = preset.startHP;

  side.append(
    el('div', el('h2', 'Map Editor'), el('p.muted.small', 'Design a watershed. Test it, then export it and send the file to your teacher.')),
    field('Map name', bind(draft, 'name')),
    field('Designed by', bind(draft, 'author')),
    field('Description (what makes this site tricky?)', bind(draft, 'description', 'textarea')),
    el('div.two', field('Difficulty', diffSel), field('Ground', themeSel)),
    el('div.two', field('Starting budget', money), field('River health', hp)),
    field('Water body name', bind(draft, 'creekLabel')),
  );

  side.append(el('h3', `Channels (${draft.paths.length})`));
  if (!draft.paths.length) side.append(el('p.muted.small', 'Pick "Draw Channel" and click on the map to add one.'));
  draft.paths.forEach((p, i) => {
    const on = sel?.kind === 'path' && sel.i === i;
    const waveIn = bind(p, 'opensAtWave', 'number');
    waveIn.min = 1; waveIn.disabled = !!p.breachable;
    side.append(el('div.item' + (on ? '.on' : ''), { onclick: e => { if (e.target.tagName === 'DIV' || e.target.tagName === 'SPAN') { sel = { kind: 'path', i }; renderSide(); draw(); } } },
      el('div.item-head', el('span', `Channel ${i + 1} · ${p.points.length} points`), el('button.btn.ghost', { onclick: () => { sel = { kind: 'path', i }; removeSelected(); } }, 'Delete')),
      field('Label', bind(p, 'label')),
      el('div.two', field('Opens on wave', waveIn),
        el('label.check', el('input', { type: 'checkbox', checked: !!p.breachable, onchange: e => { p.breachable = e.target.checked; renderSide(); rebuild(); } }), 'Random breach')),
    ));
  });

  if (sel?.kind === 'decor' && draft.decor[sel.i]) {
    const d = draft.decor[sel.i];
    const props = { pond: [['rx', 'Width'], ['ry', 'Height'], ['label', 'Label', 'text']], trees: [['r', 'Spread'], ['n', 'How many']], gravel: [['w', 'Width'], ['h', 'Height']], rows: [['w', 'Width'], ['h', 'Height']], building: [['w', 'Width'], ['h', 'Height']], label: [['text', 'Text', 'text']] }[d.type] || [];
    side.append(el('h3', 'Selected: ' + d.type),
      el('div.item.on', el('div.two', props.map(([k, label, type]) => field(label, bind(d, k, type || 'number')))),
        el('button.btn.ghost.small', { onclick: removeSelected }, 'Delete')));
  }

  // Validation
  const { map, errors } = normalizeMap(structuredClone(draft));
  side.append(el('h3', 'Check'), el('div.msgs',
    errors.length ? errors.map(e => el('div.bad', e)) : el('div.good', `Ready to play: ${map.paths.length} channel${map.paths.length > 1 ? 's' : ''}${map.breach ? ', with random breaches' : ''}.`)));

  // Actions
  const file = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try { draft = JSON.parse(await f.text()); draft.paths ||= []; draft.decor ||= []; sel = null; renderSide(); rebuild(); }
    catch { alert('That file is not a valid map.'); }
  } });
  const tmpl = el('select', { onchange: e => {
    const m = BUILTIN_MAPS.find(b => b.id === e.target.value);
    if (m && confirm('Replace your current map with a copy of ' + m.name + '?')) {
      draft = structuredClone(m); delete draft.builtIn; draft.id = m.id + '-remix-' + Math.random().toString(36).slice(2, 5); draft.name = m.name + ' (Remix)'; draft.author = '';
      sel = null; renderSide(); rebuild();
    }
    e.target.value = '';
  } }, el('option', { value: '' }, 'Start from a built-in map…'), BUILTIN_MAPS.map(m => el('option', { value: m.id }, m.name)));

  side.append(el('h3', 'Save & test'), el('div.actions',
    el('button.btn', { disabled: errors.length > 0, onclick: testPlay }, '▶ Test play'),
    el('button.btn.ghost', { disabled: errors.length > 0, onclick: exportJSON }, '⬇ Export file'),
    el('button.btn.ghost', { onclick: () => file.click() }, '⬆ Open file'),
    el('button.btn.ghost', { onclick: () => { if (confirm('Start a brand new blank map?')) { draft = blankMap(); sel = null; drawing = null; renderTools(); renderSide(); rebuild(); } } }, 'New map'),
  ), tmpl, file,
  el('p.muted.small', 'Your work auto-saves in this browser. ', el('a', { href: 'index.html' }, 'Back to game')));
}

function testPlay() {
  storage()?.setItem('sd-test-map', JSON.stringify(normalizeMap(structuredClone(draft)).map));
  window.open('index.html#test', '_blank');
}

function exportJSON() {
  const { map } = normalizeMap(structuredClone(draft));
  delete map.builtIn;
  const slug = (map.name || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' })), download: slug + '.json' });
  document.body.append(a); a.click(); a.remove();
}

// ---------------------------------------------------------------- boot
draft.paths ||= []; draft.decor ||= [];
renderTools();
renderSide();
requestAnimationFrame(rebuild);
