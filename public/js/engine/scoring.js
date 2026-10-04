// ================================================================
//  SCORING — engineering trade-offs, not just "survive"
//
//  Water Quality   up to 5000  share of the pollutant load you kept out, wave by wave
//  River Health    up to 2000  health left at the end
//  Waves           up to 2000  100 per wave cleared
//  Cost Efficiency up to 1500  pollution removed per dollar actually spent
//  Land Use        up to 1000  smaller footprint = more land left for the project
//  Unspent Budget  up to 1000  money you didn't need to spend ($0.50 = 1 pt)
//
//  Efficiency, land and budget are scaled by how much of the season
//  you finished, so quitting early can't farm those points.
// ================================================================

export const SCORE_MAX = { water: 5000, health: 2000, waves: 2000, efficiency: 1500, land: 1000, budget: 1000 };
export const SCORE_CAP = Object.values(SCORE_MAX).reduce((a, b) => a + b, 0);

// Pollution load units removed per $100 spent that earns full efficiency points.
// (A map can override this with `efficiencyTarget`.)
export const EFFICIENCY_TARGET = 60;
// Points per unspent dollar (capped at SCORE_MAX.budget).
export const BUDGET_RATE = 0.5;

export function computeScore(game) {
  const s = game.stats;
  const maxW = game.maxWaves;
  const played = Math.min(maxW, game.phase === 'won' ? maxW : game.wave);
  const cleared = s.wavesCleared;
  const completion = cleared / maxW;

  // Water quality, wave by wave
  let water = 0;
  const perWave = SCORE_MAX.water / maxW;
  for (let i = 0; i < played; i++) {
    const pot = s.wavePotential[i] || 0;
    const prev = s.wavePrevented[i] || 0;
    if (pot > 0) water += perWave * Math.min(1, prev / pot);
  }

  const health = SCORE_MAX.health * (game.hp / game.maxHp);
  const waves = (SCORE_MAX.waves / maxW) * cleared;

  const removed = Object.values(s.byType).reduce((a, t) => a + t.prevented, 0);
  const potential = Object.values(s.byType).reduce((a, t) => a + t.potential, 0);
  const net = Math.max(1, game.netSpent());
  const perHundred = removed / (net / 100);
  const target = game.map.efficiencyTarget || EFFICIENCY_TARGET;
  const efficiency = SCORE_MAX.efficiency * Math.min(1, perHundred / target) * completion;

  const landFrac = Math.max(0, 1 - s.acres / game.map.landAllowance);
  const land = SCORE_MAX.land * landFrac * completion;

  const budget = Math.min(SCORE_MAX.budget, game.money * BUDGET_RATE) * completion;

  const parts = {
    water: Math.round(water), health: Math.round(health), waves: Math.round(waves),
    efficiency: Math.round(efficiency), land: Math.round(land), budget: Math.round(budget),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return {
    total, parts,
    detail: {
      preventedPct: potential > 0 ? removed / potential : 0,
      removed, potential, netSpent: net, perHundred, acres: s.acres,
      landAllowance: game.map.landAllowance, money: game.money, completion,
    },
  };
}
