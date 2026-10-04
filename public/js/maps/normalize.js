// Fills in defaults and checks a map definition (built-in, editor, or
// published from the teacher dashboard) so the engine can trust it.
import { WORLD_W, WORLD_H } from '../engine/geometry.js';
import { POLLUTANTS } from '../data/pollutants.js';

export const DIFFICULTY_PRESETS = {
  Easy:   { startMoney: 140, startHP: 100, loadScale: 0.95, rewardScale: 1.0 },
  Medium: { startMoney: 180, startHP: 100, loadScale: 1.08, rewardScale: 1.0 },
  Hard:   { startMoney: 260, startHP: 80,  loadScale: 1.18, rewardScale: 1.1 },
};

export const DEFAULT_BREACH = {
  firstEventAfterWave: 3, eventChance: 0.45, eventRamp: 0.04, maxGap: 3,
  doubleFromWave: 11, doubleChance: 0.35,
  warnChance: 0.75, warnDecay: 0.05, warnMin: 0.3, suddenFromWave: 5,
  refailAfter: 4, refailWeight: 0.6, maxOpen: 5,
  repairBase: 220, repairStep: 75, reinforceCost: 120, reinforceStep: 45, ageRate: 0.05,
};

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Returns { map, errors }. If errors is non-empty the map should not be played.
 */
export function normalizeMap(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { map: null, errors: ['Map is not an object.'] };
  const preset = DIFFICULTY_PRESETS[input.difficulty] || DIFFICULTY_PRESETS.Medium;
  const creekY = clamp(num(input.creekY, 810), 600, 860);

  const map = {
    id: String(input.id || 'custom-' + Math.random().toString(36).slice(2, 8)).slice(0, 60).replace(/[^a-zA-Z0-9_-]/g, '-'),
    name: String(input.name || 'Untitled Map').slice(0, 60),
    author: String(input.author || '').slice(0, 60),
    difficulty: DIFFICULTY_PRESETS[input.difficulty] ? input.difficulty : 'Medium',
    description: String(input.description || '').slice(0, 400),
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 4).map(t => String(t).slice(0, 30)) : [],
    theme: ['construction', 'farm', 'split', 'pond', 'urban', 'forest'].includes(input.theme) ? input.theme : 'construction',
    startMoney: clamp(num(input.startMoney, preset.startMoney), 50, 2000),
    startHP: clamp(num(input.startHP, preset.startHP), 10, 200),
    loadScale: clamp(num(input.loadScale, preset.loadScale), 0.5, 3),
    rewardScale: clamp(num(input.rewardScale, preset.rewardScale), 0.5, 3),
    landAllowance: clamp(num(input.landAllowance, 8), 1, 50),
    efficiencyTarget: clamp(num(input.efficiencyTarget, 60), 10, 200),
    creekY,
    creekLabel: String(input.creekLabel || 'PROTECTED CREEK').slice(0, 40),
    paths: [],
    routing: {},
    decor: [],
    breach: null,
    waves: Array.isArray(input.waves) ? input.waves : null,
    builtIn: !!input.builtIn,
  };

  // ---- paths
  const ids = new Set();
  (Array.isArray(input.paths) ? input.paths : []).slice(0, 12).forEach((p, i) => {
    const pts = (Array.isArray(p.points) ? p.points : [])
      .filter(pt => Array.isArray(pt) && pt.length >= 2)
      .map(([x, y]) => [clamp(Math.round(num(x, 0)), 0, WORLD_W), clamp(Math.round(num(y, 0)), 0, WORLD_H)]);
    if (pts.length < 2) { errors.push(`Path ${i + 1} needs at least 2 points.`); return; }
    // Make sure every path finishes in the creek.
    const last = pts[pts.length - 1];
    if (last[1] < creekY + 20) pts.push([last[0], creekY + 50]);
    let id = String(p.id || 'path' + (i + 1)).slice(0, 20);
    while (ids.has(id)) id += '_';
    ids.add(id);
    map.paths.push({
      id,
      label: String(p.label || '').slice(0, 30),
      color: typeof p.color === 'string' ? p.color.slice(0, 9) : undefined,
      opensAtWave: p.breachable ? null : clamp(Math.round(num(p.opensAtWave, 1)), 1, 40),
      breachable: !!p.breachable,
      points: pts,
    });
  });
  if (!map.paths.length) errors.push('A map needs at least one path.');
  if (map.paths.length && !map.paths.some(p => !p.breachable && p.opensAtWave === 1)) {
    errors.push('At least one path must be open on Wave 1.');
  }

  // ---- routing (pollutant -> path id)
  if (input.routing && typeof input.routing === 'object') {
    for (const k in input.routing) {
      if (POLLUTANTS[k] && ids.has(input.routing[k])) map.routing[k] = input.routing[k];
    }
  }

  // ---- breach settings (only if a path can breach)
  if (map.paths.some(p => p.breachable)) {
    map.breach = { ...DEFAULT_BREACH, ...(input.breach || {}) };
  }

  // ---- decor (visual + pond no-build zones)
  (Array.isArray(input.decor) ? input.decor : []).slice(0, 40).forEach(d => {
    if (!d || typeof d !== 'object') return;
    const t = d.type;
    if (!['pond', 'trees', 'rows', 'gravel', 'label', 'building', 'road'].includes(t)) return;
    map.decor.push({
      type: t,
      x: num(d.x, 0), y: num(d.y, 0), w: num(d.w, 100), h: num(d.h, 100),
      rx: num(d.rx, 120), ry: num(d.ry, 80), r: num(d.r, 60), n: clamp(Math.round(num(d.n, 6)), 0, 30),
      text: String(d.text || d.label || '').slice(0, 30),
      label: String(d.label || '').slice(0, 30),
    });
  });

  // ---- waves (optional custom list)
  if (map.waves) {
    const ok = map.waves.length > 0 && map.waves.length <= 40 && map.waves.every(w =>
      w && Array.isArray(w.groups) && w.groups.every(g => POLLUTANTS[g.p] && g.n > 0 && g.n < 200));
    if (!ok) { errors.push('Custom waves are not valid — using the default storm season.'); map.waves = null; }
  }

  return { map, errors: errors.filter(e => !e.startsWith('Custom waves')), warnings: errors.filter(e => e.startsWith('Custom waves')) };
}
