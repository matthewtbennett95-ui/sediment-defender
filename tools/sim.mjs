// Headless balance tester: plays every map with simple bot strategies
// and prints win rates and scores. Run:  node tools/sim.mjs [runs]
import { Game } from '../public/js/engine/game.js';
import { computeScore } from '../public/js/engine/scoring.js';
import { BUILTIN_MAPS } from '../public/js/maps/builtin.js';
import { normalizeMap } from '../public/js/maps/normalize.js';
import { BMPS, BMP_ORDER, statsAt, effectiveness } from '../public/js/data/bmps.js';
import { POLLUTANTS } from '../public/js/data/pollutants.js';
import { pointAt } from '../public/js/engine/geometry.js';
import { waveLoadScale } from '../public/js/data/waves.js';

const RUNS = +process.argv[2] || 8;
globalThis.TRACE = process.env.TRACE;
const ONLY = process.argv[3];

function samplePaths(game, includeClosed) {
  const pts = [];
  for (const p of game.paths) {
    const w = p.status === 'open' ? 1 : (includeClosed && p.breachable && p.status === 'stressed' ? 0.6 : includeClosed && p.breachable && p.status === 'closed' ? 0.06 : (p.status === 'closed' && !p.breachable ? 0.8 : 0));
    if (!w) continue;
    for (let d = 0; d < p.length; d += 12) { const q = pointAt(p, d); pts.push({ x: q.x, y: q.y, w, prog: d / p.length }); }
  }
  return pts;
}

function coverage(samples, x, y, r) {
  let c = 0; const r2 = r * r;
  for (const s of samples) { const dx = s.x - x, dy = s.y - y; if (dx * dx + dy * dy <= r2) c += s.w; }
  return c;
}

function power(type, tier) {
  const s = statsAt(type, tier); const b = BMPS[type];
  return b.attack === 'beam' ? s.dps * s.targets : s.dps * (b.attack === 'pulse' ? 1.1 : 1);
}

function bestSpot(game, type, samples, tries = 260) {
  let best = null;
  const r = statsAt(type, 0).range;
  for (let i = 0; i < tries; i++) {
    const s = samples[Math.floor(game.rng() * samples.length)];
    if (!s) break;
    const ang = game.rng() * Math.PI * 2;
    const dist = BMPS[type].onPath ? 0 : 40 + game.rng() * r * 0.7;
    const x = s.x + Math.cos(ang) * dist, y = s.y + Math.sin(ang) * dist;
    const c = game.canPlace(type, x, y);
    if (!c.ok) continue;
    const cov = coverage(samples, c.x, c.y, r);
    if (!best || cov > best.cov) best = { x, y, cov };
  }
  return best;
}

function botTurn(game, skill) {
  // maintenance
  for (const t of game.towers) {
    const cap = statsAt(t.type, t.tier).capacity;
    if (t.fill > cap * 0.6 && game.money > game.cleanCost(t)) game.cleanTower(t.id);
  }
  // breach management
  if (game.map.breach && skill === 'good') {
    for (const p of game.paths) {
      if (p.status === 'stressed' && game.money >= game.map.breach.reinforceCost) game.repairChannel(p.id);
    }
    const open = game.paths.filter(p => p.breachable && p.status === 'open');
    if (open.length >= 2 && game.money > game.repairCost() + 50) {
      // repair the shortest (least defensible) open breach
      open.sort((a, b) => a.length - b.length);
      game.repairChannel(open[0].id);
    }
  }
  const prev = game.previewWave();
  if (!prev) return;
  const samples = samplePaths(game, true);
  const scale = waveLoadScale(game.wave) * game.map.loadScale;
  const threat = {};
  prev.items.forEach(({ p, n }) => {
    threat[p] = (threat[p] || 0) + n * POLLUTANTS[p].hp * scale;
    if (POLLUTANTS[p].splits) threat[POLLUTANTS[p].splits.into] = (threat[POLLUTANTS[p].splits.into] || 0) + n * POLLUTANTS[p].splits.count * POLLUTANTS[POLLUTANTS[p].splits.into].hp * scale * 0.6;
    if (POLLUTANTS[p].payload) POLLUTANTS[p].payload.forEach(q => { threat[q] = (threat[q] || 0) + n * POLLUTANTS[q].hp * scale * 0.6; });
  });
  let guard = 0;
  const reserve = 0;
  const cand = BMP_ORDER.filter(id => game.isUnlocked(id));
  while (guard++ < 40) {
    if (skill === 'naive') {
      const ok = cand.filter(id => game.money >= BMPS[id].cost);
      if (!ok.length) break;
      const id = ok[Math.floor(game.rng() * ok.length)];
      const spot = bestSpot(game, id, samples, 40);
      if (!spot) break;
      game.placeTower(id, spot.x, spot.y);
      continue;
    }
    // need per pollutant = threat / current defense
    const need = {}; let needSum = 0;
    for (const p in threat) {
      let d = 30;
      for (const t of game.towers) {
        const cov = t._cov ?? (t._cov = coverage(samples, t.x, t.y, statsAt(t.type, t.tier).range));
        d += effectiveness(t.type, t.tier, p) * power(t.type, t.tier) * cov;
      }
      need[p] = threat[p] / d; needSum += need[p];
    }
    const score = (type, tier, cov) => {
      let v = 0; for (const p in need) v += need[p] * effectiveness(type, tier, p);
      return v * power(type, tier) * cov;
    };
    let best = null;
    for (const id of cand) {
      if (game.money - reserve < BMPS[id].cost) continue;
      const spot = bestSpot(game, id, samples, 120);
      if (!spot) continue;
      const v = score(id, 0, spot.cov) / BMPS[id].cost;
      if (!best || v > best.v) best = { kind: 'build', id, spot, v };
    }
    for (const t of game.towers) {
      const b = BMPS[t.type];
      if (t.tier >= b.tiers.length) continue;
      const c = b.tiers[t.tier].cost;
      if (game.money - reserve < c) continue;
      const cov0 = t._cov, cov1 = coverage(samples, t.x, t.y, statsAt(t.type, t.tier + 1).range);
      const v = (score(t.type, t.tier + 1, cov1) - score(t.type, t.tier, cov0)) / c;
      if (!best || v > best.v) best = { kind: 'up', t, v };
    }
    if (!best || best.v <= 0) { if (globalThis.TRACE && game.money > 150) console.log('    stop: money', game.money, 'best', best && best.kind, best && best.v, 'cands', cand.join('|')); break; }
    if (best.kind === 'up') { game.upgradeTower(best.t.id); best.t._cov = undefined; }
    else game.placeTower(best.id, best.spot.x, best.spot.y);
  }
}

function play(map, skill, seed) {
  const game = new Game(map, { seed });
  while (game.phase !== 'won' && game.phase !== 'lost') {
    botTurn(game, skill);
    game.startWave();
    let guard = 0;
    const hp0 = game.hp;
    while (game.phase === 'wave' && guard++ < 60 * 600) game.step(1 / 60);
    if (globalThis.TRACE) {
      const leaks = {}; game.events.filter(e => e.type === 'leak').forEach(e => leaks[e.type2 || e.type === 'leak' && e.typeP] = 1);
      const lk = {}; game.events.filter(e=>e.type==='leak').forEach(e=>{lk[e.ptype]=(lk[e.ptype]||0)+e.dmg});
      console.log('  wave', game.stats.wavesCleared, 'hp', hp0, '->', game.hp, 'towers', game.towers.map(t=>BMPS[t.type].abbr+t.tier).join(','), '$', game.money, JSON.stringify(lk));
    }
    game.events.length = 0;
  }
  return { game, score: computeScore(game) };
}

for (const raw of BUILTIN_MAPS) {
  if (ONLY && raw.id !== ONLY) continue;
  const { map } = normalizeMap({ ...raw, builtIn: true });
  for (const skill of ['good', 'naive']) {
    let wins = 0, tot = 0, waves = 0, hp = 0; const parts = {};
    let money = 0, towers = 0, acres = 0, per100 = 0;
    for (let i = 0; i < RUNS; i++) {
      const { game, score } = play(map, skill, 1000 + i);
      if (game.phase === 'won') wins++;
      tot += score.total; waves += game.stats.wavesCleared; hp += game.hp;
      for (const k in score.parts) parts[k] = (parts[k] || 0) + score.parts[k];
      money += game.money; towers += game.towers.length; acres += game.stats.acres; per100 += score.detail.perHundred;
    }
    const avg = v => Math.round(v / RUNS);
    console.log(`${map.id.padEnd(20)} ${skill.padEnd(6)} win ${wins}/${RUNS}  waves ${(waves / RUNS).toFixed(1)}  hp ${avg(hp)}  score ${avg(tot)}  towers ${(towers / RUNS).toFixed(1)}  acres ${(acres / RUNS).toFixed(2)}  $left ${avg(money)}  per100 ${(per100 / RUNS).toFixed(1)}`);
    console.log('   ', Object.entries(parts).map(([k, v]) => `${k}:${avg(v)}`).join(' '));
  }
}
