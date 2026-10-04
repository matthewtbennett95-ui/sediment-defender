// ================================================================
//  GAME VIEW — the in-game screen: HUD, canvas, shop, info panel,
//  input (mouse + touch), and the fixed-timestep game loop.
// ================================================================
import { el, clear, $, storage, fmt } from './dom.js';
import { Game } from '../engine/game.js';
import { Renderer } from '../render/renderer.js';
import { BMPS, BMP_ORDER, statsAt, effectiveness, mechanismsAt, investedAt } from '../data/bmps.js';
import { POLLUTANTS, MECHANISMS } from '../data/pollutants.js';
import { bmpIcon, pollutantIcon } from '../render/sprites.js';
import { mechBars, effChips, pollutantCard, loadDiscovered, saveDiscovered, buildGuide } from './guide.js';

const STEP = 1 / 60;
// Add ?dev to the URL for a 10× speed option when testing.
const SPEEDS = /[?&]dev\b/.test(location.search) ? [1, 2, 3, 10] : [1, 2, 3];

export class GameView {
  constructor(root, map, { player, onEnd, onQuit, seed } = {}) {
    this.root = root;
    this.map = map;
    this.player = player;
    this.onEnd = onEnd;
    this.onQuit = onQuit;
    this.game = new Game(map, { seed });
    this.speedIdx = 0;
    this.paused = false;
    this.auto = storage()?.getItem('sd-auto') === '1';
    this.autoTimer = 0;
    this.placing = null;        // BMP id being placed
    this.selected = null;       // { kind: 'tower'|'enemy'|'wall'|'bmp', ref }
    this.pendingTouch = null;   // touch placement awaiting confirm
    this.discovered = loadDiscovered();
    this.lastInfoKey = '';
    this.ended = false;
    this.toastCooldown = {};
    this.build();
    this.renderer = new Renderer(this.canvas, this.game);
    this.renderer.reducedEffects = storage()?.getItem('sd-lite') === '1';
    this.renderer.onCamera = () => this.onCamera();
    this.slowTime = 0;
    this.bindInput();
    this.refreshShop();
    this.refreshStorm();
    this.showDefaultInfo();
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
    this.onResize = () => { this.renderer.resize(); };
    window.addEventListener('resize', this.onResize);
    this.ro = new ResizeObserver(() => this.renderer.resize());
    this.ro.observe(this.stage);
    this.banner(`${map.name}`, 'Build BMPs, then start the first storm', 2600);
    if (matchMedia('(pointer: coarse)').matches && !storage()?.getItem('sd-hint-zoom')) {
      storage()?.setItem('sd-hint-zoom', '1');
      setTimeout(() => this.toast('Pinch to zoom in on the map. Drag with one finger to move around.', 'info', 6000), 2800);
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.renderer.destroy();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    this.ro?.disconnect();
    clear(this.root);
  }

  // ---------------------------------------------------------------- DOM
  build() {
    clear(this.root);
    this.hud = {
      hpFill: el('div.hp-fill'), hpVal: el('span.hud-val'), money: el('span.hud-val.money'),
      wave: el('span.hud-val.wave'),
    };
    this.speedBtn = el('button.hud-btn', { title: 'Speed (F)', onclick: () => this.cycleSpeed() }, '1×');
    this.pauseBtn = el('button.hud-btn', { title: 'Pause (Space)', onclick: () => this.togglePause() }, '❚❚');
    this.canvas = el('canvas.game-canvas');
    this.bannerEl = el('div.banner');
    this.toasts = el('div.toasts');
    this.confirmEl = el('div.place-confirm.hidden');
    const zoomBy = f => { const r = this.renderer; r.zoomAt(r.cssW / 2, r.cssH / 2, f); };
    this.zoomCtl = el('div.zoom-ctl',
      el('button.zbtn', { title: 'Zoom in (+)', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.4) }, '+'),
      el('button.zbtn', { title: 'Zoom out (−)', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.4) }, '−'),
      el('button.zbtn.zfit', { title: 'Show the whole map (0)', 'aria-label': 'Show whole map', onclick: () => this.renderer.resetView() }, '⤢'),
    );
    this.stage = el('div.stage', this.canvas, this.zoomCtl, this.bannerEl, this.toasts, this.confirmEl);
    this.stormEl = el('section.storm');
    this.shopEl = el('section.shop');
    this.infoEl = el('section.info');
    this.guideEl = el('div.overlay.hidden');

    this.root.append(el('div.gv',
      el('div.gv-main',
        el('div.hud',
          el('div.hud-item.hp', el('span.hud-lbl', 'River'), el('div.hp-bar', this.hud.hpFill), this.hud.hpVal),
          el('div.hud-item', el('span.hud-lbl', 'Budget'), this.hud.money),
          el('div.hud-item', el('span.hud-lbl', 'Storm'), this.hud.wave),
          el('div.hud-spacer'),
          this.speedBtn, this.pauseBtn,
          el('button.hud-btn', { title: 'Field Guide (G)', onclick: () => this.openGuide() }, '📖'),
          el('button.hud-btn', { title: 'Menu', onclick: () => this.menu() }, '☰'),
        ),
        this.stage,
      ),
      el('aside.panel', el('div.rotate-hint', 'Tip: turn your phone sideways for a bigger map.'), this.stormEl, el('div.panel-title', 'BMPs'), this.shopEl, this.infoEl),
      this.guideEl,
    ));
  }

  // ---------------------------------------------------------------- loop
  frame = (now) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const g = this.game;
    if (g.phase === 'wave' && !this.paused) {
      this.acc += dt * SPEEDS[this.speedIdx];
      let n = 0;
      while (this.acc >= STEP && n < 80) { g.step(STEP); this.acc -= STEP; n++; }
      if (n >= 80) this.acc = 0;
    } else {
      this.acc = 0;
    }
    if (g.events.length) {
      const evs = g.events.splice(0);
      for (const ev of evs) { this.renderer.handleEvent(ev); this.onEvent(ev); }
    }
    if (this.auto && g.phase === 'between' && !this.paused) {
      this.autoTimer += dt;
      if (this.autoTimer > 2.5) { this.autoTimer = 0; this.startWave(); }
    }
    this.renderer.updateEffects(this.paused ? 0 : dt * (g.phase === 'wave' ? SPEEDS[this.speedIdx] : 1));
    this.renderer.draw();
    this.watchPerformance(dt);
    this.updateHud();
    this.infoTick = (this.infoTick || 0) + dt;
    if (this.infoTick > 0.25) { this.infoTick = 0; this.refreshInfo(); this.refreshShopState(); }
    this.raf = requestAnimationFrame(this.frame);
  };

  /**
   * If the game is visibly struggling (under ~30 fps for a few seconds of
   * a storm), switch to Performance graphics automatically. Students can
   * switch back in the menu; an explicit choice is remembered.
   */
  watchPerformance(dt) {
    const r = this.renderer;
    if (r.quality !== 'high' || this.paused || this.game.phase !== 'wave' || storage()?.getItem('sd-lite') === '0') return;
    this.slowTime = dt > 0.034 ? this.slowTime + dt : Math.max(0, this.slowTime - dt * 0.5);
    if (this.slowTime > 3) {
      r.setQuality('low');
      storage()?.setItem('sd-lite', '1');
      this.toast('Switched to Performance graphics so the game runs smoothly. You can change this in the ☰ menu.', 'info', 6000);
    }
  }

  updateHud() {
    const g = this.game;
    const hp = Math.max(0, Math.round(g.hp));
    if (this.hud.hpVal.textContent !== String(hp)) {
      this.hud.hpVal.textContent = hp;
      const f = g.hp / g.maxHp;
      this.hud.hpFill.style.width = (f * 100) + '%';
      this.hud.hpFill.style.background = f > 0.6 ? 'var(--green)' : f > 0.3 ? 'var(--amber)' : 'var(--red)';
    }
    const m = '$' + fmt(g.money);
    if (this.hud.money.textContent !== m) this.hud.money.textContent = m;
    const w = `${Math.min(g.wave, g.maxWaves)} / ${g.maxWaves}`;
    if (this.hud.wave.textContent !== w) this.hud.wave.textContent = w;
  }

  // ---------------------------------------------------------------- events
  onEvent(ev) {
    const g = this.game;
    switch (ev.type) {
      case 'waveStart':
        this.banner(`Storm ${ev.wave}`, ev.label, 2000);
        this.refreshStorm();
        if (!this.selected) this.showDefaultInfo();
        break;
      case 'waveEnd':
        this.banner(`Storm ${ev.wave} cleared!`, `+$${ev.bonus} bonus`, 2200);
        this.refreshStorm(); this.refreshShop();
        if (!this.selected) this.showDefaultInfo();
        break;
      case 'unlock':
        this.toast(`New BMP unlocked: ${BMPS[ev.bmp].name}`, 'good');
        break;
      case 'clogged':
        if (this.cooldown('clog', 8)) this.toast(`${BMPS[ev.tower.type].name} is clogged with sediment — it's barely working. Clean it out!`, 'warn');
        if (!storage()?.getItem('sd-hint-clog')) {
          storage()?.setItem('sd-hint-clog', '1');
          this.toast('Tip: BMPs upstream that catch sediment first (pretreatment) keep the ones downstream from clogging.', 'info', 7000);
        }
        break;
      case 'breachWarning':
        this.banner('⚠ Seepage detected', `${ev.path.label} will fail after the next storm`, 3200);
        this.toast(`Seepage on the ${ev.path.label}${ev.refail ? ' — the old patch is giving way' : ''}. Tap the orange wall to reinforce it for $${g.reinforceCost()}, or let it go and defend the channel.`, 'warn', 6000);
        break;
      case 'breach':
        this.banner(`💥 ${ev.path.label} BREACHED`, ev.refail ? 'The patch failed — repairs on old walls don\'t last forever' : ev.sudden ? 'No warning — that happens in real life too' : 'Polluted water is pouring out', 3000);
        this.toast(`${ev.path.label} breached! Repair it (tap the red wall) for $${g.repairCost()} or defend its channel.`, 'bad', 6000);
        break;
      case 'repaired':
        this.toast(`${ev.path.label} repaired with riprap and compacted clay (−$${ev.cost}).`, 'good');
        this.clearSelection();
        break;
      case 'reinforced':
        this.toast(`${ev.path.label} reinforced before it failed (−$${ev.cost}). Prevention is cheaper than repair!`, 'good');
        this.clearSelection();
        break;
      case 'pathOpened':
        this.banner(`${ev.path.label || 'New channel'} opens!`, 'Runoff now flows down a second branch', 2800);
        break;
      case 'won': case 'lost':
        this.finish();
        break;
    }
  }

  cooldown(key, sec) {
    const now = performance.now() / 1000;
    if ((this.toastCooldown[key] || -99) + sec > now) return false;
    this.toastCooldown[key] = now;
    return true;
  }

  finish() {
    if (this.ended) return;
    this.ended = true;
    this.discovered = saveDiscovered(this.game);
    this.banner(this.game.phase === 'won' ? 'WATERSHED PROTECTED' : 'WATERSHED LOST', '', 2000);
    setTimeout(() => this.onEnd?.(this.game), 1500);
  }

  // ---------------------------------------------------------------- controls
  startWave() {
    const g = this.game;
    if (g.phase === 'prep' || g.phase === 'between') {
      this.cancelPlacing();
      g.startWave();
      this.paused = false; this.pauseBtn.textContent = '❚❚';
    }
  }

  togglePause() {
    if (this.game.phase !== 'wave') return;
    this.paused = !this.paused;
    this.pauseBtn.textContent = this.paused ? '▶' : '❚❚';
    this.pauseBtn.classList.toggle('on', this.paused);
    if (this.paused) this.banner('Paused', 'Press Space or ▶ to resume', 100000);
    else this.bannerEl.classList.remove('show');
  }

  cycleSpeed() {
    this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
    this.speedBtn.textContent = SPEEDS[this.speedIdx] + '×';
    this.speedBtn.classList.toggle('on', this.speedIdx > 0);
  }

  menu() {
    const wasPaused = this.paused;
    if (this.game.phase === 'wave') { this.paused = true; }
    const close = () => { modal.remove(); this.paused = wasPaused; };
    const lite = this.renderer.reducedEffects;
    const modal = el('div.overlay.modal-wrap',
      el('div.modal',
        el('h2', 'Menu'),
        el('button.btn', { onclick: close }, 'Resume'),
        el('button.btn.ghost', { onclick: () => { this.renderer.reducedEffects = !lite; storage()?.setItem('sd-lite', lite ? '0' : '1'); this.slowTime = 0; close(); } },
          lite ? 'Graphics: Performance (tap for Quality)' : 'Graphics: Quality (tap for Performance)'),
        el('button.btn.danger', { onclick: () => { modal.remove(); this.onQuit?.(); } }, 'Quit game (score not saved)'),
      ));
    this.root.append(modal);
  }

  openGuide(tab = 0) {
    const wasPaused = this.paused;
    if (this.game.phase === 'wave') this.paused = true;
    this.guideEl.classList.remove('hidden');
    const box = el('div.guide-box');
    clear(this.guideEl).append(box);
    buildGuide(box, { startTab: tab, onClose: () => { this.guideEl.classList.add('hidden'); this.paused = wasPaused; } });
  }

  // ---------------------------------------------------------------- banner/toasts
  banner(title, sub, ms = 2000) {
    clear(this.bannerEl).append(el('div.banner-title', title));
    if (sub) this.bannerEl.append(el('div.banner-sub', sub));
    this.bannerEl.classList.add('show');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  toast(text, kind = 'info', ms = 4000) {
    const t = el(`div.toast.${kind}`, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  // ---------------------------------------------------------------- storm card
  refreshStorm() {
    const g = this.game;
    clear(this.stormEl);
    if (g.phase === 'won' || g.phase === 'lost') return;
    if (g.phase === 'wave') {
      const w = g.waves[g.wave - 1];
      this.stormEl.append(
        el('div.storm-head', el('span.storm-kicker', `Storm ${g.wave} in progress`), el('span.storm-label', w.label)),
        el('div.muted.small', 'You can keep building during the storm.'),
      );
      return;
    }
    const prev = g.previewWave();
    const cleanCost = g.cleanAllCost();
    this.stormEl.append(...[
      el('div.storm-head', el('span.storm-kicker', `Next storm · ${g.wave} of ${g.maxWaves}`), el('span.storm-label', prev.label)),
      el('div.storm-items', prev.items.map(it => el('button.storm-item' + (it.isNew ? '.is-new' : ''), {
        title: POLLUTANTS[it.p].name, onclick: () => this.select({ kind: 'enemy', type: it.p }),
      }, pollutantIcon(it.p, 26), el('span', '×' + it.n), it.isNew ? el('span.new-dot', 'NEW') : null))),
      el('div.storm-actions',
        el('button.btn.start', { onclick: () => this.startWave() }, g.phase === 'prep' ? '▶ Start first storm' : '▶ Start storm'),
        el('label.auto', { title: 'Automatically start the next storm' },
          el('input', { type: 'checkbox', checked: this.auto, onchange: e => { e.target.blur(); this.auto = e.target.checked; storage()?.setItem('sd-auto', this.auto ? '1' : '0'); this.autoTimer = 0; } }), 'Auto'),
      ),
      cleanCost > 0 ? el('button.btn.ghost.small', { onclick: () => { const r = g.cleanAll(); if (r.n) this.toast(`Cleaned ${r.n} BMP${r.n > 1 ? 's' : ''} for $${r.total}.`, 'good'); this.refreshStorm(); } },
        `🔧 Clean out full BMPs ($${cleanCost})`) : null,
    ].filter(Boolean));
  }

  // ---------------------------------------------------------------- shop
  refreshShop() {
    clear(this.shopEl);
    this.shopCards = {};
    for (const id of BMP_ORDER) {
      const b = BMPS[id];
      const card = el('button.shop-card', { onclick: () => this.pickBmp(id), title: b.name },
        bmpIcon(id, 34),
        el('span.shop-name', b.name),
        el('span.shop-cost', `$${b.cost}`),
        el('span.shop-key', b.key),
        el('span.shop-lock', `Wave ${b.unlockWave}`),
      );
      this.shopCards[id] = card;
      this.shopEl.append(card);
    }
    this.refreshShopState();
  }

  refreshShopState() {
    const g = this.game;
    for (const id of BMP_ORDER) {
      const c = this.shopCards[id]; if (!c) continue;
      const unlocked = g.isUnlocked(id);
      c.classList.toggle('locked', !unlocked);
      c.classList.toggle('poor', unlocked && g.money < BMPS[id].cost);
      c.classList.toggle('selected', this.placing === id);
      c.classList.toggle('fresh', unlocked && BMPS[id].unlockWave === g.wave && g.wave > 1 && g.phase !== 'wave');
    }
  }

  pickBmp(id) {
    const g = this.game;
    if (!g.isUnlocked(id)) { this.select({ kind: 'bmp', type: id }); this.toast(`${BMPS[id].name} unlocks on storm ${BMPS[id].unlockWave}.`, 'info', 2500); return; }
    if (this.placing === id) { this.cancelPlacing(); return; }
    this.placing = id;
    this.pendingTouch = null;
    this.hideConfirm();
    this.select({ kind: 'bmp', type: id }, true);
    this.refreshShopState();
  }

  cancelPlacing() {
    this.placing = null;
    this.pendingTouch = null;
    this.renderer.ghost = null;
    this.hideConfirm();
    this.refreshShopState();
  }

  // ---------------------------------------------------------------- selection / info
  select(sel, keepPlacing = false) {
    if (!keepPlacing) this.cancelPlacing();
    this.selected = sel;
    this.renderer.selectedTower = sel?.kind === 'tower' ? sel.ref : null;
    this.renderer.selectedPath = sel?.kind === 'wall' ? sel.ref.id : null;
    this.lastInfoKey = '';
    this.refreshInfo(true);
  }

  clearSelection() { this.select(null); this.showDefaultInfo(); }

  showDefaultInfo() {
    if (this.selected) return;
    const g = this.game;
    clear(this.infoEl);
    this.lastInfoKey = 'default';
    if (g.phase !== 'wave') {
      const prev = g.previewWave();
      const fresh = prev ? prev.items.filter(i => i.isNew) : [];
      if (g.phase === 'prep' && g.wave === 1) {
        this.infoEl.append(el('div.hint',
          el('strong', 'Welcome, engineer!'),
          el('p', 'Pick a BMP above, then tap beside the channel to build it. Check what each one is good at, then press Start.'),
        ));
      }
      fresh.forEach(it => this.infoEl.append(pollutantCard(it.p, { isNew: true })));
      if (!fresh.length && g.wave > 1) this.infoEl.append(el('div.hint', el('p', 'Tap any BMP on the map to upgrade or clean it. Tap a pollutant icon to read about it.')));
    } else {
      this.infoEl.append(el('div.hint', el('p', 'Tap a pollutant on the map to see what it is and what removes it.')));
    }
  }

  refreshInfo(force = false) {
    const s = this.selected;
    if (!s) return;
    const g = this.game;
    if (s.kind === 'tower' && !g.towers.includes(s.ref)) { this.clearSelection(); return; }
    let key = s.kind;
    if (s.kind === 'tower') {
      const t = s.ref, st = statsAt(t.type, t.tier);
      key += [t.id, t.tier, Math.round(t.fill / st.capacity * 20), g.money >= (BMPS[t.type].tiers[t.tier]?.cost ?? 1e9), g.money >= g.cleanCost(t), g.canSell(), t.targeting, t.kills].join('|');
    } else if (s.kind === 'wall') {
      key += s.ref.id + s.ref.status + g.repairCost() + g.reinforceCost() + (g.money >= g.repairCost()) + (g.money >= g.reinforceCost());
    } else key += s.type;
    if (!force && key === this.lastInfoKey) return;
    this.lastInfoKey = key;
    clear(this.infoEl);
    if (s.kind === 'bmp') this.infoEl.append(this.bmpInfo(s.type));
    if (s.kind === 'enemy') this.infoEl.append(pollutantCard(s.type, { showTip: true }));
    if (s.kind === 'tower') this.infoEl.append(this.towerInfo(s.ref));
    if (s.kind === 'wall') this.infoEl.append(this.wallInfo(s.ref));
  }

  bmpInfo(id) {
    const b = BMPS[id];
    return el('div.card.compact',
      el('header.card-head', bmpIcon(id, 40), el('div', el('h3', b.name), el('div.card-sub', `$${b.cost} · ${b.acres} acres${b.onPath ? ' · goes IN the channel' : ''}`))),
      el('p', b.desc),
      mechBars(mechanismsAt(id, 0)),
      effChips(id, 0, this.discovered),
      el('div.science', b.science),
      this.placing === id ? el('div.hint.small', 'Tap the map to place. Esc or tap the card again to cancel.') : null,
    );
  }

  towerInfo(t) {
    const g = this.game, b = BMPS[t.type];
    const st = statsAt(t.type, t.tier);
    const fillPct = Math.min(100, Math.round(t.fill / st.capacity * 100));
    const next = b.tiers[t.tier];
    const kids = [];
    kids.push(el('header.card-head', bmpIcon(t.type, 40, t.tier),
      el('div', el('h3', b.name), el('div.card-sub', t.tier ? b.tiers[t.tier - 1].name : 'Base design', ' · ',
        el('span.tier-pips', [0, 1].map(i => el('span.pip' + (i < t.tier ? '.on' : ''))))))));
    kids.push(el('div.tower-stats',
      el('div', el('b', fmt(t.treated)), el('span', 'load treated')),
      el('div', el('b', t.kills), el('span', 'stopped')),
      el('div', el('b', Math.round(st.range)), el('span', 'range')),
    ));
    // Sediment / maintenance
    kids.push(el('div.fill-row',
      el('div.fill-label', `Sediment stored: ${fillPct}%`, fillPct >= 75 ? el('span.warn', fillPct >= 98 ? ' — CLOGGED' : ' — losing performance') : null),
      el('div.fill-bar', el('div.fill-in', { style: { width: fillPct + '%', background: fillPct >= 98 ? 'var(--red)' : fillPct >= 75 ? 'var(--amber)' : '#a08050' } })),
      el('button.btn.small' + (fillPct > 0 ? '' : '.ghost'), { disabled: t.fill <= 0 || g.money < g.cleanCost(t), onclick: () => this.act(g.cleanTower(t.id)) },
        `🔧 Clean out ($${g.cleanCost(t)})`),
    ));
    // Upgrade
    if (next) {
      const after = statsAt(t.type, t.tier + 1);
      const changes = [];
      if (after.range > st.range + 0.5) changes.push(`Range ${Math.round(st.range)} → ${Math.round(after.range)}`);
      if (after.dps > st.dps + 0.01) changes.push(`Treatment +${Math.round((after.dps / st.dps - 1) * 100)}%`);
      if (after.capacity > st.capacity) changes.push(`Holds ${Math.round(after.capacity / st.capacity * 10) / 10}× sediment`);
      if (after.interval && after.interval < st.interval - 0.01) changes.push(`Pulses ${Math.round((1 - after.interval / st.interval) * 100)}% faster`);
      if (after.slow < st.slow) changes.push(`Slows flow to ${Math.round(after.slow * 100)}% speed`);
      if (after.targets > st.targets) changes.push(`Treats ${after.targets} at once`);
      const m0 = mechanismsAt(t.type, t.tier), m1 = mechanismsAt(t.type, t.tier + 1);
      for (const k in m1) if ((m1[k] || 0) > (m0[k] || 0) + 0.01) changes.push(`${(m0[k] || 0) > 0 ? 'More' : 'NEW:'} ${MECHANISMS[k].name}`);
      for (const p in (next.bonus || {})) changes.push(`Better vs ${POLLUTANTS[p].short}`);
      kids.push(el('div.upgrade',
        el('div.upgrade-name', `Upgrade ${t.tier + 1}: ${next.name}`),
        el('p', next.desc),
        el('ul.changes', changes.map(c => el('li', c))),
        el('button.btn.upgrade-btn', { disabled: g.money < next.cost, onclick: () => this.act(g.upgradeTower(t.id)) },
          g.money < next.cost ? `Need $${next.cost}` : `⬆ Upgrade ($${next.cost})`),
      ));
    } else {
      kids.push(el('div.upgrade.done', '★ Fully upgraded'));
    }
    if (b.attack === 'beam') {
      kids.push(el('div.targeting', el('span', 'Focus on: '),
        [['first', 'Closest to creek'], ['strong', 'Toughest'], ['close', 'Nearest']].map(([m, label]) =>
          el('button.seg' + (t.targeting === m ? '.on' : ''), { onclick: () => { g.setTargeting(t.id, m); this.refreshInfo(true); } }, label))));
    }
    kids.push(el('h4', 'Effectiveness'), effChips(t.type, t.tier, this.discovered));
    kids.push(el('button.btn.ghost.small.sell', {
      disabled: !g.canSell(),
      title: g.canSell() ? '' : "Crews can't remove BMPs during a storm",
      onclick: () => { const r = g.sellTower(t.id); if (r.ok) { this.toast(`Removed ${b.name}. Salvaged $${r.value} of $${investedAt(t.type, t.tier)} spent.`, 'info'); this.clearSelection(); } else this.toast(r.reason, 'warn'); },
    }, g.canSell() ? `Remove (+$${g.sellValue(t)} salvage)` : "Can't remove during a storm"));
    return el('div.card.compact', kids);
  }

  wallInfo(p) {
    const g = this.game, cfg = g.map.breach;
    const kids = [el('h3', p.label || 'Embankment')];
    if (!p.breachable) {
      kids.push(el('p', 'This is the original breach. The hole is too big to patch during the storm season — you have to treat what comes out.'));
    } else if (p.status === 'stressed') {
      kids.push(el('p.warn', '⚠ Water is seeping through this wall. It will fail after the next storm.'),
        el('p', 'Reinforcing now (riprap + compacted clay) stops the breach before it happens. It costs much less than an emergency repair.'),
        el('button.btn', { disabled: g.money < g.reinforceCost(), onclick: () => this.act(g.repairChannel(p.id)) }, `Reinforce wall ($${g.reinforceCost()})`),
        el('p.muted.small', 'Every fix costs more than the last, and the whole wall gets older each storm. At some point it\'s cheaper to let a section go and build BMPs along its channel instead.'));
    } else if (p.status === 'open') {
      kids.push(el('p', 'This wall has failed and runoff is pouring out. An emergency repair closes the channel. Pollutants already in it keep flowing.'),
        el('p.muted.small', 'Every fix costs more than the last, and costs rise each storm as the wall ages. Compare this price to building BMPs along the channel instead.'),
        el('button.btn', { disabled: g.money < g.repairCost(), onclick: () => this.act(g.repairChannel(p.id)) }, `Emergency repair ($${g.repairCost()})`));
    } else if (p.status === 'repaired') {
      kids.push(el('p', 'Repaired and holding — for now. Patched walls can fail again after a few storms.'));
    } else {
      kids.push(el('p', 'Holding — for now. Walls that start to fail will show orange seepage first… usually.'));
    }
    return el('div.card.compact', kids);
  }

  act(result) {
    if (!result.ok) this.toast(result.reason, 'warn', 2500);
    this.refreshInfo(true);
    this.refreshStorm();
    return result;
  }

  // ---------------------------------------------------------------- input
  // One finger / mouse: tap to select or build; drag to pan when zoomed in.
  // Two fingers: pinch to zoom. Mouse wheel / trackpad pinch: zoom.
  bindInput() {
    const cv = this.canvas, R = () => this.renderer;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
    const dist = (a, b) => Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1;
    const mid = (a, b) => ({ sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 });
    const pts = new Map();
    let gesture = null;   // { mode: 'tap' | 'pan' | 'pinch', ... }

    cv.addEventListener('pointerdown', e => {
      const p = pos(e);
      pts.set(e.pointerId, p);
      try { cv.setPointerCapture(e.pointerId); } catch {}
      if (pts.size === 1) gesture = { mode: 'tap', start: p, last: p, type: e.pointerType, button: e.button };
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        gesture = { mode: 'pinch', d0: dist(a, b), z0: R().zoom, mid: mid(a, b) };
      }
    });
    cv.addEventListener('pointermove', e => {
      const p = pos(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (gesture?.mode === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()], m = mid(a, b);
        R().panBy(m.sx - gesture.mid.sx, m.sy - gesture.mid.sy);
        R().zoomAt(m.sx, m.sy, (gesture.z0 * dist(a, b) / gesture.d0) / R().zoom);
        gesture.mid = m;
        return;
      }
      if (gesture && pts.has(e.pointerId)) {
        const moved = Math.hypot(p.sx - gesture.start.sx, p.sy - gesture.start.sy);
        if (gesture.mode === 'tap' && moved > (gesture.type === 'mouse' ? 6 : 10) && R().zoom > 1) gesture.mode = 'pan';
        if (gesture.mode === 'pan') { R().panBy(p.sx - gesture.last.sx, p.sy - gesture.last.sy); cv.style.cursor = 'grabbing'; }
        gesture.last = p;
        if (gesture.mode === 'pan') return;
      }
      if (e.pointerType !== 'mouse') return;
      if (!this.placing) { cv.style.cursor = R().zoom > 1 ? 'grab' : ''; return; }
      const w = R().toWorld(p.sx, p.sy);
      const c = this.game.canPlace(this.placing, w.x, w.y);
      R().ghost = { type: this.placing, x: c.ok ? c.x : w.x, y: c.ok ? c.y : w.y, ok: c.ok };
      cv.style.cursor = c.ok ? 'pointer' : 'not-allowed';
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = pos(e);
      pts.delete(e.pointerId);
      if (!gesture) return;
      if (gesture.mode === 'pinch') {
        // One finger still down: let it keep panning, but never count it as a tap
        if (pts.size === 1) { const rem = [...pts.values()][0]; gesture = { mode: 'pan', start: rem, last: rem, type: 'touch' }; }
        else if (pts.size === 0) gesture = null;
        return;
      }
      if (gesture.mode === 'tap' && e.type === 'pointerup' && gesture.button !== 2) {
        if (Math.hypot(p.sx - gesture.start.sx, p.sy - gesture.start.sy) <= 14) this.tap(p.sx, p.sy, e.pointerType);
      }
      if (pts.size === 0) { gesture = null; cv.style.cursor = ''; }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.pendingTouch && !pts.size) R().ghost = null; });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const p = pos(e);
      // Trackpad pinch arrives as ctrl+wheel with small deltas
      R().zoomAt(p.sx, p.sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0015)));
    }, { passive: false });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); this.cancelPlacing(); });

    this.onKey = (e) => {
      if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox')) return;
      if (!this.guideEl.classList.contains('hidden')) { if (e.key === 'Escape' || e.key === 'g' || e.key === 'G') this.guideEl.querySelector('.guide-top .btn')?.click(); return; }
      const m = BMP_ORDER.find(id => BMPS[id].key === e.key);
      if (m) { this.pickBmp(m); return; }
      const r = this.renderer;
      if (e.key === ' ') { e.preventDefault(); document.activeElement?.blur?.(); if (this.game.phase === 'wave') this.togglePause(); else this.startWave(); }
      else if (e.key === 'f' || e.key === 'F') this.cycleSpeed();
      else if (e.key === 'g' || e.key === 'G') this.openGuide();
      else if (e.key === '+' || e.key === '=') r.zoomAt(r.cssW / 2, r.cssH / 2, 1.4);
      else if (e.key === '-' || e.key === '_') r.zoomAt(r.cssW / 2, r.cssH / 2, 1 / 1.4);
      else if (e.key === '0') r.resetView();
      else if (e.key === 'Escape') { this.cancelPlacing(); this.clearSelection(); }
      else if ((e.key === 'u' || e.key === 'U') && this.selected?.kind === 'tower') this.act(this.game.upgradeTower(this.selected.ref.id));
    };
    window.addEventListener('keydown', this.onKey);
  }

  onCamera() {
    this.zoomCtl?.classList.toggle('zoomed', this.renderer.zoom > 1.01);
    if (this.pendingTouch && !this.confirmEl.classList.contains('hidden')) this.positionConfirm();
  }

  tap(sx, sy, pointerType) {
    const g = this.game, r = this.renderer;
    const w = r.toWorld(sx, sy);
    if (this.placing) {
      const c = g.canPlace(this.placing, w.x, w.y);
      if (pointerType === 'mouse') {
        if (c.ok) this.place(w.x, w.y);
        else { const t = r.towerAt(w.x, w.y); if (t) this.select({ kind: 'tower', ref: t }); else this.toast(c.reason, 'warn', 1800); }
        return;
      }
      // Touch: first tap previews, second tap on the ghost (or ✓) builds.
      if (this.pendingTouch && Math.hypot(this.pendingTouch.x - w.x, this.pendingTouch.y - w.y) < Math.max(40, r.touchPad(26)) && this.pendingTouch.ok) {
        this.place(this.pendingTouch.x, this.pendingTouch.y);
        return;
      }
      if (!c.ok) { const t = r.towerAt(w.x, w.y); if (t) { this.select({ kind: 'tower', ref: t }); return; } }
      const gx = c.ok ? c.x : w.x, gy = c.ok ? c.y : w.y;
      this.pendingTouch = { x: gx, y: gy, ok: c.ok };
      r.ghost = { type: this.placing, x: gx, y: gy, ok: c.ok };
      this.showConfirm(gx, gy, c);
      return;
    }
    const t = r.towerAt(w.x, w.y);
    if (t) { this.select({ kind: 'tower', ref: t }); return; }
    const wall = r.wallAt(w.x, w.y);
    if (wall) { this.select({ kind: 'wall', ref: wall }); return; }
    const e = r.enemyAt(w.x, w.y);
    if (e) { this.select({ kind: 'enemy', type: e.type }); return; }
    this.clearSelection();
  }

  place(x, y) {
    const res = this.game.placeTower(this.placing, x, y);
    if (!res.ok) { this.toast(res.reason, 'warn', 1800); return; }
    this.pendingTouch = null;
    this.hideConfirm();
    // Keep placing the same BMP if you can afford another (fast building),
    // except on touch where the ghost would get in the way.
    const id = this.placing;
    if (this.game.money < BMPS[id].cost) this.cancelPlacing();
    else { this.renderer.ghost = null; }
    this.refreshShopState();
    this.refreshStorm();
  }

  showConfirm(x, y, c) {
    clear(this.confirmEl);
    this.confirmEl.append(
      c.ok ? el('button.cf-ok', { onclick: () => this.place(x, y) }, `✓ Build $${BMPS[this.placing].cost}`) : el('span.cf-bad', c.reason),
      el('button.cf-x', { onclick: () => this.cancelPlacing() }, '✕'),
    );
    this.confirmEl.classList.remove('hidden');
    this.positionConfirm();
  }

  positionConfirm() {
    const pt = this.pendingTouch; if (!pt) return;
    const s = this.renderer.toScreen(pt.x, pt.y);
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    const bw = this.confirmEl.offsetWidth || 200;
    const off = BMPS[this.placing]?.size * this.renderer.scale + 14 || 50;
    const left = Math.max(8, Math.min(W - bw - 8, s.x - bw / 2));
    const top = s.y - off - 50 > 4 ? s.y - off - 50 : Math.min(H - 54, s.y + off);
    this.confirmEl.style.left = left + 'px';
    this.confirmEl.style.top = top + 'px';
  }

  hideConfirm() { this.confirmEl.classList.add('hidden'); }
}
