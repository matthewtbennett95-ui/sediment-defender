// ================================================================
//  GAME ENGINE
//  Pure simulation: no drawing, no DOM. The UI calls step(dt) with a
//  FIXED timestep (see main.js), so a Chromebook at 30 fps and a
//  phone at 120 fps play exactly the same game.
//
//  The engine reports what happened through `this.events` (an array
//  the UI drains each frame): kills, leaks, breaches, unlocks, etc.
// ================================================================
import { POLLUTANTS, SEDIMENT_TYPES, POLLUTANT_ORDER } from '../data/pollutants.js';
import { BMPS, BMP_ORDER, statsAt, effectiveness, investedAt } from '../data/bmps.js';
import { DEFAULT_WAVES, waveLoadScale, waveBonus } from '../data/waves.js';
import { preparePath, pointAt, closestOnPath, insideEllipse, WORLD_W } from './geometry.js';
import { mulberry32 } from './rng.js';

export const PATH_HALF = 18;          // half-width of a flow channel (world units)
export const SELL_RATE = 0.5;         // salvage value when you remove a BMP
export const CLEAN_RATE = 0.18;       // clean-out cost as a fraction of build cost
const CLOG_START = 0.75;              // fill fraction where performance starts dropping
const CLOG_FLOOR = 0.3;               // performance when completely full
const RESIST_EFF = 0.12;              // below this, show "passes through" feedback

export class Game {
  constructor(map, opts = {}) {
    this.map = map;
    this.seed = opts.seed ?? (Math.floor(Math.random() * 2 ** 31));
    this.rng = mulberry32(this.seed);
    this.waves = map.waves || DEFAULT_WAVES;
    this.maxWaves = this.waves.length;

    this.paths = map.paths.map((p, idx) => {
      const prep = preparePath(p.points);
      const status = p.breachable ? 'closed' : ((p.opensAtWave || 1) <= 1 ? 'open' : 'closed');
      return { ...p, ...prep, idx, status };
    });
    this.pathById = Object.fromEntries(this.paths.map(p => [p.id, p]));

    this.money = map.startMoney;
    this.hp = this.maxHp = map.startHP;
    this.wave = 1;               // wave currently running, or the next one to run
    this.phase = 'prep';         // prep | wave | between | won | lost
    this.waveTime = 0;
    this.time = 0;
    this.towers = [];
    this.enemies = [];
    this.queue = [];
    this.events = [];
    this.nextId = 1;
    this.seenPollutants = new Set();
    this.rr = 0;                 // round-robin counter for path assignment
    // Which BMP × pollutant pairings this player has actually seen interact
    // (fills in the Field Guide matrix as students play).
    this.seenPairs = new Uint8Array(BMP_ORDER.length * 16);

    this.stats = {
      spentBuild: 0, spentUpgrade: 0, spentMaintenance: 0, spentRepair: 0, salvage: 0,
      acres: 0, materials: {},
      wavePotential: [], wavePrevented: [],
      byType: {},                // id -> { potential, prevented, leaked, count, stopped }
      wavesCleared: 0, repairs: 0, reinforced: 0, cleanings: 0,
    };

    this.breach = map.breach ? { wavesSinceEvent: 0, pendingSudden: null, events: [] } : null;
  }

  // ------------------------------------------------------------------
  //  Queries
  // ------------------------------------------------------------------
  emit(type, data = {}) { this.events.push({ type, ...data }); }

  openPaths() { return this.paths.filter(p => p.status === 'open'); }

  isUnlocked(type) { return this.wave >= BMPS[type].unlockWave; }

  nextWaveDef() { return this.waves[this.wave - 1] || null; }

  /** Upcoming wave summary for the preview card. */
  previewWave() {
    const w = this.nextWaveDef();
    if (!w) return null;
    const counts = {};
    w.groups.forEach(g => { counts[g.p] = (counts[g.p] || 0) + g.n; });
    return {
      label: w.label,
      items: Object.entries(counts).map(([p, n]) => ({ p, n, isNew: !this.seenPollutants.has(p) })),
    };
  }

  netSpent() {
    const s = this.stats;
    return s.spentBuild + s.spentUpgrade + s.spentMaintenance + s.spentRepair - s.salvage;
  }

  towerStats(t) { return statsAt(t.type, t.tier); }

  cleanCost(t) { return Math.round(BMPS[t.type].cost * CLEAN_RATE); }
  sellValue(t) { return Math.round(investedAt(t.type, t.tier) * SELL_RATE); }
  canSell() { return this.phase === 'prep' || this.phase === 'between'; }

  repairCost() {
    const b = this.map.breach;
    return b ? b.repairBase + b.repairStep * this.stats.repairs : 0;
  }

  // ------------------------------------------------------------------
  //  Placement
  // ------------------------------------------------------------------
  canPlace(type, x, y) {
    const b = BMPS[type];
    if (!b) return { ok: false, reason: 'Unknown BMP' };
    if (this.phase === 'won' || this.phase === 'lost') return { ok: false, reason: 'Game over' };
    if (!this.isUnlocked(type)) return { ok: false, reason: `Unlocks on Wave ${b.unlockWave}` };
    if (this.money < b.cost) return { ok: false, reason: 'Not enough budget' };

    let px = x, py = y;
    if (b.onPath) {
      // Check dams snap onto the nearest channel.
      let best = null;
      for (const p of this.paths) {
        const c = closestOnPath(p, x, y);
        if (!best || c.dist < best.dist) best = c;
      }
      if (!best || best.dist > PATH_HALF + 26) return { ok: false, reason: 'Check dams go IN a channel' };
      px = best.x; py = best.y;
      if (this.paths.some(p => p.pts[0] && Math.hypot(p.pts[0].x - px, p.pts[0].y - py) < 40)) {
        return { ok: false, reason: 'Too close to the channel entrance' };
      }
    } else {
      for (const p of this.paths) {
        if (closestOnPath(p, x, y).dist < PATH_HALF + b.size - 4) return { ok: false, reason: "Can't build on a flow channel" };
      }
    }
    if (px < b.size || px > WORLD_W - b.size || py < b.size) return { ok: false, reason: 'Too close to the edge' };
    if (py + b.size * 0.6 > this.map.creekY) return { ok: false, reason: "Can't build in the creek" };
    for (const d of this.map.decor) {
      if (d.type === 'pond' && insideEllipse(px, py, d.x, d.y, d.rx, d.ry, b.size)) return { ok: false, reason: "Can't build in the pond" };
    }
    for (const t of this.towers) {
      const tb = BMPS[t.type];
      if (Math.hypot(t.x - px, t.y - py) < (tb.size + b.size) * 0.85) return { ok: false, reason: 'Overlaps another BMP' };
    }
    return { ok: true, x: px, y: py };
  }

  placeTower(type, x, y) {
    const c = this.canPlace(type, x, y);
    if (!c.ok) return c;
    const b = BMPS[type];
    const t = {
      id: this.nextId++, type, bi: BMP_ORDER.indexOf(type), x: c.x, y: c.y, tier: 0, fill: 0, timer: 0,
      targeting: 'first', clogged: false, lastResist: -9, placedAt: this.time,
      treated: 0, kills: 0,
    };
    this.towers.push(t);
    this.money -= b.cost;
    this.stats.spentBuild += b.cost;
    this.stats.acres += b.acres;
    addMaterials(this.stats.materials, b.materials);
    this.emit('placed', { tower: t });
    return { ok: true, tower: t };
  }

  upgradeTower(id) {
    const t = this.towers.find(t => t.id === id);
    if (!t) return { ok: false, reason: 'No BMP selected' };
    const b = BMPS[t.type];
    if (t.tier >= b.tiers.length) return { ok: false, reason: 'Fully upgraded' };
    const tier = b.tiers[t.tier];
    if (this.money < tier.cost) return { ok: false, reason: 'Not enough budget' };
    this.money -= tier.cost;
    this.stats.spentUpgrade += tier.cost;
    addMaterials(this.stats.materials, tier.materials);
    const oldCap = statsAt(t.type, t.tier).capacity;
    t.tier++;
    // Keep the same fill fraction when capacity grows.
    const newCap = statsAt(t.type, t.tier).capacity;
    t.fill = t.fill * Math.min(1, oldCap / newCap);
    t.clogged = false;
    this.emit('upgraded', { tower: t, name: tier.name });
    return { ok: true };
  }

  sellTower(id) {
    if (!this.canSell()) return { ok: false, reason: "Crews can't remove BMPs during a storm" };
    const i = this.towers.findIndex(t => t.id === id);
    if (i < 0) return { ok: false, reason: 'No BMP selected' };
    const t = this.towers[i];
    const value = this.sellValue(t);
    this.money += value;
    this.stats.salvage += value;
    this.stats.acres = Math.max(0, this.stats.acres - BMPS[t.type].acres);
    this.towers.splice(i, 1);
    this.emit('sold', { tower: t, value });
    return { ok: true, value };
  }

  cleanTower(id) {
    const t = this.towers.find(t => t.id === id);
    if (!t) return { ok: false, reason: 'No BMP selected' };
    if (t.fill <= 0) return { ok: false, reason: 'Already clean' };
    const cost = this.cleanCost(t);
    if (this.money < cost) return { ok: false, reason: 'Not enough budget' };
    this.money -= cost;
    this.stats.spentMaintenance += cost;
    this.stats.cleanings++;
    t.fill = 0; t.clogged = false;
    this.emit('cleaned', { tower: t, cost });
    return { ok: true, cost };
  }

  /** Clean every BMP that is at least half full. */
  cleanAll() {
    const list = this.towers.filter(t => t.fill >= 0.5 * statsAt(t.type, t.tier).capacity);
    let total = 0, n = 0;
    for (const t of list) {
      if (this.money < this.cleanCost(t)) break;
      total += this.cleanCost(t); n++;
      this.cleanTower(t.id);
    }
    return { n, total };
  }

  cleanAllCost() {
    return this.towers
      .filter(t => t.fill >= 0.5 * statsAt(t.type, t.tier).capacity)
      .reduce((s, t) => s + this.cleanCost(t), 0);
  }

  setTargeting(id, mode) {
    const t = this.towers.find(t => t.id === id);
    if (t) t.targeting = mode;
  }

  // ------------------------------------------------------------------
  //  Embankment repair (breach maps)
  // ------------------------------------------------------------------
  repairChannel(pathId) {
    const p = this.pathById[pathId];
    if (!p || !p.breachable) return { ok: false, reason: "This breach is too big to repair" };
    if (p.status === 'stressed') {
      const cost = this.map.breach.reinforceCost;
      if (this.money < cost) return { ok: false, reason: 'Not enough budget' };
      this.money -= cost;
      this.stats.spentRepair += cost;
      this.stats.reinforced++;
      addMaterials(this.stats.materials, { stone: 25, excavation: 40 });
      p.status = 'repaired';
      this.emit('reinforced', { path: p, cost });
      return { ok: true, cost };
    }
    if (p.status !== 'open') return { ok: false, reason: 'Nothing to repair here' };
    const cost = this.repairCost();
    if (this.money < cost) return { ok: false, reason: 'Not enough budget' };
    this.money -= cost;
    this.stats.spentRepair += cost;
    this.stats.repairs++;
    addMaterials(this.stats.materials, { stone: 60, excavation: 120 });
    p.status = 'repaired';
    this.emit('repaired', { path: p, cost });
    return { ok: true, cost };
  }

  // ------------------------------------------------------------------
  //  Waves
  // ------------------------------------------------------------------
  startWave() {
    if (this.phase !== 'prep' && this.phase !== 'between') return false;
    const w = this.nextWaveDef();
    if (!w) return false;

    // Paths scheduled to open this wave (e.g. Map 2's construction branch)
    for (const p of this.paths) {
      if (!p.breachable && p.status === 'closed' && p.opensAtWave && p.opensAtWave <= this.wave) {
        p.status = 'open';
        this.emit('pathOpened', { path: p });
      }
    }

    this.queue = w.groups.map(g => ({ ...g, spawned: 0, timer: g.delay || 0 }));
    this.phase = 'wave';
    this.waveTime = 0;
    this.stats.wavePotential[this.wave - 1] = 0;
    this.stats.wavePrevented[this.wave - 1] = 0;
    w.groups.forEach(g => this.seenPollutants.add(g.p));
    this.emit('waveStart', { wave: this.wave, label: w.label });
    return true;
  }

  pickPath(group) {
    const open = this.openPaths();
    if (!open.length) return this.paths[0];
    const want = group.path || this.map.routing?.[group.p];
    if (want && this.pathById[want]?.status === 'open') return this.pathById[want];
    return open[(this.rr++) % open.length];
  }

  spawn(type, path, d = 0, hpMul = 1, parentWave = this.wave) {
    const def = POLLUTANTS[type];
    const scale = waveLoadScale(parentWave) * this.map.loadScale * hpMul;
    const hp = def.hp * scale;
    const pos = pointAt(path, d);
    const e = {
      id: this.nextId++, type, pi: POLLUTANT_ORDER.indexOf(type), def, path, d, x: pos.x, y: pos.y, a: pos.a,
      hp, maxHp: hp,
      speed: def.speed * (0.92 + this.rng() * 0.16),
      lane: (this.rng() - 0.5) * 12,
      slow: 1, hit: 0, alive: true, wobble: this.rng() * 6.28,
    };
    this.enemies.push(e);
    this.addPotential(type, def.dmg);
    return e;
  }

  addPotential(type, w) {
    const i = this.wave - 1;
    this.stats.wavePotential[i] = (this.stats.wavePotential[i] || 0) + w;
    const bt = this.byType(type);
    bt.potential += w; bt.count++;
  }

  byType(type) {
    return this.stats.byType[type] || (this.stats.byType[type] = { potential: 0, prevented: 0, leaked: 0, count: 0, stopped: 0 });
  }

  // ------------------------------------------------------------------
  //  Simulation step (dt in seconds; called with a fixed 1/60 step)
  // ------------------------------------------------------------------
  step(dt) {
    if (this.phase !== 'wave') return;
    this.time += dt;
    this.waveTime += dt;

    this.spawnStep(dt);
    this.breachStep();
    this.slowStep();
    this.moveStep(dt);
    this.treatStep(dt);

    // Remove dead/finished
    if (this.enemies.some(e => !e.alive)) this.enemies = this.enemies.filter(e => e.alive);

    if (this.phase === 'wave' && this.queue.every(g => g.spawned >= g.n) && this.enemies.length === 0) {
      this.endWave();
    }
  }

  spawnStep(dt) {
    for (const g of this.queue) {
      if (g.spawned >= g.n) continue;
      g.timer -= dt;
      if (g.timer > 0) continue;
      this.spawn(g.p, this.pickPath(g));
      g.spawned++;
      g.timer += g.gap;
    }
  }

  breachStep() {
    const b = this.breach;
    if (!b || !b.pendingSudden || this.waveTime < b.pendingSudden.at) return;
    const p = this.pathById[b.pendingSudden.pathId];
    b.pendingSudden = null;
    if (p && p.status === 'closed') {
      p.status = 'open';
      this.emit('breach', { path: p, sudden: true });
    }
  }

  slowStep() {
    for (const e of this.enemies) e.slow = 1;
    for (const t of this.towers) {
      const s = statsAt(t.type, t.tier);
      if (s.slow >= 1) continue;
      const r2 = s.range * s.range;
      for (const e of this.enemies) {
        const dx = e.x - t.x, dy = e.y - t.y;
        if (dx * dx + dy * dy <= r2) e.slow = Math.min(e.slow, s.slow);
      }
    }
  }

  moveStep(dt) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.d += e.speed * e.slow * dt;
      if (e.hit > 0) e.hit -= dt;
      if (e.d >= e.path.length) { this.leak(e); continue; }
      const pos = pointAt(e.path, e.d);
      // Offset sideways a little so pollutants don't stack in a single file.
      e.x = pos.x - Math.sin(pos.a) * e.lane;
      e.y = pos.y + Math.cos(pos.a) * e.lane;
      e.a = pos.a;
    }
  }

  treatStep(dt) {
    for (const t of this.towers) {
      const b = BMPS[t.type];
      const s = statsAt(t.type, t.tier);
      const r2 = s.range * s.range;
      const clogMul = clogMultiplier(t.fill / s.capacity);

      if (b.attack === 'area' || b.attack === 'field') {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - t.x, dy = e.y - t.y;
          if (dx * dx + dy * dy > r2) continue;
          const eff = effectiveness(t.type, t.tier, e.type);
          this.resistCheck(t, e, eff);
          this.treat(t, e, s.dps * eff * clogMul * dt, s.capacity);
        }
      } else if (b.attack === 'beam') {
        const targets = this.pickTargets(t, r2, s.targets);
        t.beams = targets.map(e => e.id);
        for (const e of targets) {
          const eff = effectiveness(t.type, t.tier, e.type);
          this.treat(t, e, s.dps * eff * clogMul * dt, s.capacity);
        }
      } else if (b.attack === 'pulse') {
        t.timer -= dt;
        if (t.timer > 0) continue;
        const inRange = this.enemies.filter(e => {
          if (!e.alive) return false;
          const dx = e.x - t.x, dy = e.y - t.y;
          return dx * dx + dy * dy <= r2;
        });
        if (!inRange.length) { t.timer = 0; continue; }
        t.timer = s.interval;
        this.emit('pulse', { tower: t, range: s.range });
        for (const e of inRange) {
          const eff = effectiveness(t.type, t.tier, e.type);
          this.resistCheck(t, e, eff);
          this.treat(t, e, s.dps * s.interval * eff * clogMul, s.capacity);
        }
      }
    }
  }

  pickTargets(t, r2, n) {
    const cands = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - t.x, dy = e.y - t.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      this.seenPairs[t.bi * 16 + e.pi] = 1;
      // Skip pollutants this BMP can barely touch — it focuses where it helps.
      if (effectiveness(t.type, t.tier, e.type) < 0.1) continue;
      cands.push({ e, dist2 });
    }
    if (t.targeting === 'strong') cands.sort((a, b) => b.e.hp - a.e.hp);
    else if (t.targeting === 'close') cands.sort((a, b) => a.dist2 - b.dist2);
    else cands.sort((a, b) => (b.e.d / b.e.path.length) - (a.e.d / a.e.path.length));
    return cands.slice(0, n).map(c => c.e);
  }

  resistCheck(t, e, eff) {
    this.seenPairs[t.bi * 16 + e.pi] = 1;
    if (eff >= RESIST_EFF || this.time - t.lastResist < 1.6) return;
    t.lastResist = this.time;
    this.emit('resist', { x: e.x, y: e.y, type: e.type, tower: t });
  }

  treat(t, e, amount, capacity) {
    if (amount <= 0 || !e.alive) return;
    const dealt = Math.min(amount, e.hp);
    e.hp -= amount;
    e.hit = 0.1;
    t.treated += dealt;
    if (SEDIMENT_TYPES.has(e.type)) {
      t.fill = Math.min(capacity, t.fill + dealt);
      if (!t.clogged && t.fill >= capacity * 0.98) {
        t.clogged = true;
        this.emit('clogged', { tower: t });
      }
    }
    if (e.hp <= 0) this.kill(e, t);
  }

  kill(e, t) {
    if (!e.alive) return;
    e.alive = false;
    const def = e.def;
    const reward = Math.max(1, Math.round(def.reward * this.map.rewardScale));
    this.money += reward;
    t.kills++;
    const bt = this.byType(e.type);
    bt.prevented += def.dmg; bt.stopped++;
    const wi = this.wave - 1;
    this.stats.wavePrevented[wi] = (this.stats.wavePrevented[wi] || 0) + def.dmg;
    this.emit('kill', { x: e.x, y: e.y, ptype: e.type, reward, color: BMPS[t.type].color });

    // Breakups release smaller pollutants that keep flowing.
    if (def.splits) {
      for (let i = 0; i < def.splits.count; i++) {
        const c = this.spawn(def.splits.into, e.path, Math.max(0, e.d - this.rng() * 14), 0.6);
        c.lane = e.lane + (this.rng() - 0.5) * 16;
      }
      this.emit('split', { x: e.x, y: e.y, type: e.type });
    }
    if (def.payload) {
      for (const p of def.payload) {
        const c = this.spawn(p, e.path, Math.max(0, e.d - this.rng() * 20), 0.6);
        c.lane = (this.rng() - 0.5) * 22;
      }
      this.emit('split', { x: e.x, y: e.y, type: e.type, big: true });
    }
  }

  leak(e) {
    e.alive = false;
    let dmg = e.def.dmg;
    const bt = this.byType(e.type);
    bt.leaked += e.def.dmg;
    if (e.def.payload) {
      // A flash surge that reaches the river dumps everything it carries.
      for (const p of e.def.payload) {
        const pd = POLLUTANTS[p].dmg;
        this.addPotential(p, pd);
        this.byType(p).leaked += pd;
        dmg += pd;
      }
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.emit('leak', { x: e.x, y: e.y, ptype: e.type, dmg });
    if (this.hp <= 0 && this.phase === 'wave') {
      this.phase = 'lost';
      this.emit('lost', {});
    }
  }

  endWave() {
    const cleared = this.wave;
    this.stats.wavesCleared = cleared;
    if (cleared >= this.maxWaves) {
      this.phase = 'won';
      this.emit('won', {});
      return;
    }
    const bonus = Math.round(waveBonus(cleared) * this.map.rewardScale);
    this.money += bonus;
    this.wave++;
    this.phase = 'between';
    this.emit('waveEnd', { wave: cleared, bonus });

    // New BMPs available for the coming wave
    for (const id of BMP_ORDER) {
      if (BMPS[id].unlockWave === this.wave) this.emit('unlock', { bmp: id });
    }
    this.breachWaveEnd(cleared);
  }

  // Decide what the failing embankment does next.
  breachWaveEnd(cleared) {
    const b = this.breach, cfg = this.map.breach;
    if (!b) return;
    // A warned (stressed) wall that wasn't reinforced now fails.
    for (const p of this.paths) {
      if (p.status === 'stressed') {
        p.status = 'open';
        this.emit('breach', { path: p, sudden: false });
      }
    }
    if (cleared < cfg.firstEventAfterWave) return;
    b.wavesSinceEvent++;
    const openCount = this.paths.filter(p => p.status === 'open').length;
    const candidates = this.paths.filter(p => p.breachable && p.status === 'closed');
    if (!candidates.length || openCount >= cfg.maxOpen) return;
    const trigger = this.rng() < cfg.eventChance || b.wavesSinceEvent >= cfg.maxGap;
    if (!trigger) return;
    b.wavesSinceEvent = 0;
    const p = candidates[Math.floor(this.rng() * candidates.length)];
    const sudden = this.wave >= cfg.suddenFromWave && this.rng() > cfg.warnChance;
    if (sudden) {
      // Fails without warning partway through the next storm.
      b.pendingSudden = { pathId: p.id, at: 8 + this.rng() * 14 };
    } else {
      p.status = 'stressed';
      this.emit('breachWarning', { path: p });
    }
  }
}

export function clogMultiplier(frac) {
  if (frac <= CLOG_START) return 1;
  const t = Math.min(1, (frac - CLOG_START) / (1 - CLOG_START));
  return 1 - (1 - CLOG_FLOOR) * t;
}

function addMaterials(into, add) {
  if (!add) return;
  for (const k in add) into[k] = (into[k] || 0) + add[k];
}
