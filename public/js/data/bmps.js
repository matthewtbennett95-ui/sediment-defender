// ================================================================
//  BMPs (Best Management Practices) — the "towers"
//
//  mech:      treatment mechanism strengths (0–1). See pollutants.js.
//  attack:    how the BMP applies treatment in the game
//               area  – continuous treatment of everything in range
//               field – sits IN the channel; slows flow + light treatment
//               beam  – focuses on one (or two) pollutants at a time
//               pulse – treats everything in range every few seconds
//  dps:       treatment per second at 100% effectiveness
//  capacity:  how much sediment it holds before it clogs
//  acres:     land footprint (scored — land is expensive!)
//  materials: what it takes to build (end-of-game materials report)
//  tiers:     upgrades. Each one is a real engineering improvement.
// ================================================================
import { POLLUTANTS } from './pollutants.js';

export const BMPS = {
  silt_fence: {
    id: 'silt_fence', name: 'Silt Fence', abbr: 'SF', key: '1',
    cost: 50, unlockWave: 1, color: '#c4973a', dark: '#8b6914', size: 24,
    attack: 'area', dps: 13, range: 72, capacity: 900,
    mech: { straining: 0.85, settling: 0.3 },
    acres: 0.02, materials: { geotextile: 100 },
    desc: 'Woven fabric staked across a slope. The cheapest and most common construction-site BMP.',
    science: 'Silt fence works like a coffee filter. It catches sand and gravel, but water and anything dissolved in it pass straight through. It also fills up with sediment and has to be cleaned out.',
    tiers: [
      { name: 'Wire-Backed Fence', cost: 45,
        desc: 'Steel mesh behind the fabric lets it hold twice as much sediment without collapsing.',
        mods: { capacity: 2, dps: 1.25 }, materials: { geotextile: 0, stone: 0.5 } },
      { name: 'Double Row + J-Hooks', cost: 80,
        desc: 'A second row and curved "J-hook" ends make water pond behind the fence, so more settles out.',
        mods: { range: 1.3, dps: 1.2 }, mech: { settling: 0.3, straining: 0.1 }, materials: { geotextile: 100 } },
    ],
  },

  check_dam: {
    id: 'check_dam', name: 'Check Dam', abbr: 'CD', key: '2',
    cost: 80, unlockWave: 1, color: '#9a8fd0', dark: '#534ab7', size: 22,
    attack: 'field', dps: 14, range: 60, capacity: 1300, slow: 0.55,
    onPath: true,
    mech: { dissipation: 1, settling: 0.55, straining: 0.25 },
    acres: 0.01, materials: { stone: 6 },
    desc: 'A small rock dam built INSIDE the channel. It slows everything that flows past it.',
    science: 'Slower water has less energy to carry sediment, so particles drop out. Check dams are the go-to tool for taming fast flow, but they barely touch dissolved pollutants.',
    tiers: [
      { name: 'Rock Riprap Face', cost: 70,
        desc: 'Large armor stone survives bigger storms. Holds back more water and slows flow even more.',
        mods: { slow: 0.4, capacity: 2 }, materials: { stone: 6 } },
      { name: 'Gabion Weir', cost: 130,
        desc: 'Rock-filled wire baskets form a permanent weir that breaks up flash surges much faster.',
        mods: { range: 1.25, dps: 2.2 }, mech: { settling: 0.15 }, bonus: { flash: 0.25 }, materials: { stone: 10 } },
    ],
  },

  bioswale: {
    id: 'bioswale', name: 'Bioswale', abbr: 'BS', key: '3',
    cost: 150, unlockWave: 3, color: '#4a9a3a', dark: '#2d7a1d', size: 26,
    attack: 'beam', dps: 30, range: 110, capacity: 700, targets: 1,
    mech: { infiltration: 0.6, uptake: 0.7, straining: 0.35, adsorption: 0.2, microbial: 0.15, dissipation: 0.15 },
    acres: 0.15, materials: { excavation: 60, plants: 120, media: 20 },
    desc: 'A planted channel that slows, filters, and soaks in runoff.',
    science: 'A bioswale removes pollutants three ways: soil filters particles, roots take up nitrogen and phosphorus, and soil binds metals. Heavy sediment clogs the soil, so it works best with protection upstream.',
    tiers: [
      { name: 'Deep-Rooted Natives', cost: 120,
        desc: 'Native switchgrass and sedges grow roots 6+ feet deep, so they take up far more nutrients.',
        mods: { dps: 1.25 }, mech: { uptake: 0.3, infiltration: 0.1 }, materials: { plants: 120 } },
      { name: 'Bioretention Media', cost: 200,
        desc: 'Engineered sand-compost soil grabs metals, and the swale can now treat two pollutants at once.',
        mods: { targets: 2, range: 1.15 }, mech: { adsorption: 0.35 }, materials: { media: 40, excavation: 40 } },
    ],
  },

  sediment_basin: {
    id: 'sediment_basin', name: 'Sediment Basin', abbr: 'SB', key: '4',
    cost: 240, unlockWave: 5, color: '#8a8aa0', dark: '#5a5a6a', size: 30,
    attack: 'pulse', dps: 32, interval: 2.6, range: 125, capacity: 5000,
    mech: { settling: 1, dissipation: 0.7, straining: 0.15 },
    acres: 0.5, materials: { excavation: 900, stone: 15, concrete: 4 },
    desc: 'A large pond that holds runoff long enough for sediment to settle. Required in Georgia on big construction sites.',
    science: "Engineers size basins using residence time: how long water must sit for particles to settle (Stokes' Law). Basins hold a lot of sediment, but settling does nothing to dissolved pollutants or to floating oil.",
    tiers: [
      { name: 'Baffles + Skimmer', cost: 160,
        desc: 'Baffles make water take a longer path, and a floating skimmer drains clean water from the top. Treats faster and holds back some oil.',
        mods: { interval: 0.75 }, mech: { flotation: 0.45 }, materials: { concrete: 2, geotextile: 60 } },
      { name: 'Flocculant (PAM) Dosing', cost: 220,
        desc: 'Polyacrylamide makes fine clay clump together so it can actually settle.',
        mods: { range: 1.15 }, bonus: { fine: 0.4, turbidity: 0.35, bacteria: 0.1 }, materials: { concrete: 1 } },
    ],
  },

  riparian_buffer: {
    id: 'riparian_buffer', name: 'Riparian Buffer', abbr: 'RB', key: '5',
    cost: 220, unlockWave: 6, color: '#1a9e65', dark: '#0f6e45', size: 30,
    attack: 'area', dps: 11, range: 140, capacity: 3000,
    mech: { straining: 0.5, uptake: 0.85, infiltration: 0.45, dissipation: 0.4, adsorption: 0.25, microbial: 0.3 },
    acres: 0.6, materials: { plants: 300 },
    desc: 'A wide strip of native trees and shrubs along the waterway.',
    science: 'Tree roots hold the bank together and take up nitrogen. A 50-foot buffer can cut nitrogen 35–65%. It treats many pollutants a little, over a large area, but it takes up a lot of land.',
    tiers: [
      { name: 'Mature Canopy', cost: 150,
        desc: 'Trees grow in. A wider root zone reaches farther and slows the water entering it.',
        mods: { range: 1.25, slow: 0.85 }, materials: { plants: 100 } },
      { name: 'Floodplain Reconnection', cost: 260,
        desc: 'Lowering the banks lets floodwater spread out across the floodplain, which breaks up surges.',
        mods: { dps: 1.3 }, mech: { dissipation: 0.45, uptake: 0.15 }, materials: { excavation: 400 } },
    ],
  },

  oil_grit: {
    id: 'oil_grit', name: 'Oil-Grit Separator', abbr: 'OG', key: '6',
    cost: 180, unlockWave: 8, color: '#d8b84a', dark: '#8a7020', size: 22,
    attack: 'beam', dps: 42, range: 95, capacity: 800, targets: 1,
    mech: { flotation: 1, settling: 0.55, straining: 0.15 },
    acres: 0.02, materials: { concrete: 8, excavation: 30 },
    desc: 'An underground concrete vault with chambers that trap floating oil and heavy grit. Common under parking lots.',
    science: 'Oil floats, so an underwater opening lets water pass below while the oil stays trapped on the surface. Heavy grit drops into the first chamber. It does nothing for dissolved nutrients or metals.',
    tiers: [
      { name: 'Coalescing Plates', cost: 140,
        desc: 'Stacked angled plates make tiny oil droplets join into big ones that float up much faster.',
        mods: { dps: 1.5 }, materials: { concrete: 1 } },
      { name: 'Absorbent Media Filter', cost: 180,
        desc: 'An added filter cartridge soaks up dissolved oil and some metals, and treats two targets at once.',
        mods: { targets: 2, range: 1.2 }, mech: { adsorption: 0.45 }, materials: { media: 4 } },
    ],
  },

  sand_filter: {
    id: 'sand_filter', name: 'Sand Filter', abbr: 'SA', key: '7',
    cost: 200, unlockWave: 10, color: '#e0c890', dark: '#a08850', size: 24,
    attack: 'beam', dps: 36, range: 95, capacity: 500, targets: 1,
    mech: { infiltration: 0.9, straining: 0.4, adsorption: 0.45, microbial: 0.25 },
    acres: 0.05, materials: { media: 30, concrete: 6, excavation: 40 },
    desc: 'Runoff trickles down through a bed of sand into an underdrain. Used where land is too valuable for a pond.',
    science: 'Sand catches fine particles, bacteria, and the metals stuck to them, and a living film on the sand eats some bacteria. Heavy sediment clogs the surface fast, so it needs pretreatment upstream.',
    tiers: [
      { name: 'Pretreatment Chamber', cost: 140,
        desc: 'A settling chamber in front catches grit before it reaches the sand, so it clogs far less.',
        mods: { capacity: 3 }, mech: { settling: 0.3 }, materials: { concrete: 3 } },
      { name: 'Peat-Sand Blend', cost: 200,
        desc: 'Adding peat grabs more metals and supports more microbes.',
        mods: { dps: 1.3 }, mech: { adsorption: 0.35, microbial: 0.35 }, materials: { media: 15 } },
    ],
  },

  wetland: {
    id: 'wetland', name: 'Constructed Wetland', abbr: 'CW', key: '8',
    cost: 400, unlockWave: 12, color: '#2a8ab5', dark: '#1a5a85', size: 34,
    attack: 'pulse', dps: 42, interval: 3.0, range: 150, capacity: 900,
    mech: { uptake: 1, microbial: 1, settling: 0.5, adsorption: 0.6, infiltration: 0.2, dissipation: 0.2 },
    acres: 1.2, materials: { excavation: 1500, plants: 800, media: 60 },
    desc: 'An engineered shallow marsh. The strongest biological treatment you can build, but it is expensive and needs a lot of land.',
    science: 'Wetland bacteria convert nitrate to N₂ gas and eat oil. Sunlight kills pathogens. Metals get buried in organic muck. Without a sediment forebay in front, though, sediment fills it in and the marsh stops working.',
    tiers: [
      { name: 'Sediment Forebay', cost: 180,
        desc: 'A deep pool at the inlet catches sediment first. That is pretreatment built in, and it holds 3× more before clogging.',
        mods: { capacity: 3 }, mech: { settling: 0.25 }, materials: { excavation: 300, stone: 10 } },
      { name: 'Open-Water Treatment Cells', cost: 300,
        desc: 'Alternating marsh and open water: sunlight kills more pathogens and the treatment pulses come faster and reach wider.',
        mods: { interval: 0.75, range: 1.15 }, bonus: { bacteria: 0.1 }, materials: { excavation: 500, plants: 300 } },
    ],
  },
};

export const BMP_ORDER = ['silt_fence', 'check_dam', 'bioswale', 'sediment_basin', 'riparian_buffer', 'oil_grit', 'sand_filter', 'wetland'];

export const MATERIAL_INFO = {
  geotextile: { name: 'Geotextile fabric', unit: 'ft' },
  stone:      { name: 'Stone / riprap', unit: 'tons' },
  excavation: { name: 'Excavation', unit: 'yd³' },
  plants:     { name: 'Native plants', unit: 'plants' },
  media:      { name: 'Engineered soil/sand media', unit: 'yd³' },
  concrete:   { name: 'Concrete', unit: 'yd³' },
};

/** Mechanism strengths for a BMP at a given tier (0 = base). */
export function mechanismsAt(bmpId, tier = 0) {
  const b = BMPS[bmpId];
  const m = { ...b.mech };
  for (let i = 0; i < tier; i++) {
    const add = b.tiers[i].mech || {};
    for (const k in add) m[k] = Math.min(1, (m[k] || 0) + add[k]);
  }
  return m;
}

const _statsCache = new Map();
/** Numeric stats for a BMP at a given tier (cached — treat as read-only). */
export function statsAt(bmpId, tier = 0) {
  const key = bmpId + tier;
  let v = _statsCache.get(key);
  if (!v) { v = computeStats(bmpId, tier); _statsCache.set(key, v); }
  return v;
}

function computeStats(bmpId, tier) {
  const b = BMPS[bmpId];
  const s = {
    dps: b.dps, range: b.range, capacity: b.capacity, interval: b.interval || 0,
    slow: b.slow || 1, targets: b.targets || 1,
  };
  for (let i = 0; i < tier; i++) {
    const md = b.tiers[i].mods || {};
    if (md.dps) s.dps *= md.dps;
    if (md.range) s.range *= md.range;
    if (md.capacity) s.capacity *= md.capacity;
    if (md.interval) s.interval *= md.interval;
    if (md.slow) s.slow = Math.min(s.slow, md.slow);
    if (md.targets) s.targets = md.targets;
  }
  return s;
}

/**
 * Effectiveness (0–1) of a BMP against a pollutant.
 * Each mechanism removes a share; shares combine like independent
 * treatment steps: 1 - (1-a)(1-b)(1-c)...
 */
const _effCache = new Map();
export function effectiveness(bmpId, tier, pollutantId) {
  const key = bmpId + tier + pollutantId;
  let v = _effCache.get(key);
  if (v === undefined) { v = computeEffectiveness(bmpId, tier, pollutantId); _effCache.set(key, v); }
  return v;
}

function computeEffectiveness(bmpId, tier, pollutantId) {
  const m = mechanismsAt(bmpId, tier);
  const v = POLLUTANTS[pollutantId].vuln;
  let pass = 1;
  for (const k in m) pass *= 1 - Math.min(1, (m[k] || 0) * (v[k] || 0));
  let eff = 1 - pass;
  const b = BMPS[bmpId];
  for (let i = 0; i < tier; i++) {
    const bonus = b.tiers[i].bonus || {};
    if (bonus[pollutantId]) eff += bonus[pollutantId];
  }
  return Math.max(0, Math.min(0.98, eff));
}

/** The mechanism doing the most work for this pairing (for explanations). */
export function mainMechanism(bmpId, tier, pollutantId) {
  const m = mechanismsAt(bmpId, tier);
  const v = POLLUTANTS[pollutantId].vuln;
  let best = null, bestVal = 0;
  for (const k in m) {
    const val = (m[k] || 0) * (v[k] || 0);
    if (val > bestVal) { bestVal = val; best = k; }
  }
  return best;
}

export function effLabel(e) {
  if (e >= 0.7) return { text: 'Strong', cls: 'hi' };
  if (e >= 0.4) return { text: 'Good', cls: 'med' };
  if (e >= 0.15) return { text: 'Weak', cls: 'lo' };
  return { text: 'None', cls: 'none' };
}

/** Total money put into a tower (build + upgrades) up to a tier. */
export function investedAt(bmpId, tier) {
  const b = BMPS[bmpId];
  let total = b.cost;
  for (let i = 0; i < tier; i++) total += b.tiers[i].cost;
  return total;
}
