// ================================================================
//  MECHANISMS + POLLUTANTS
//  The heart of the game's science. Every BMP removes pollutants
//  through one or more real treatment MECHANISMS. Every pollutant is
//  SUSCEPTIBLE to some mechanisms and immune to others.
//  Effectiveness = how well a BMP's mechanisms line up with what the
//  pollutant is vulnerable to (see bmps.js -> effectiveness()).
//
//  To tune: change the numbers (0 = no effect, 1 = full effect).
// ================================================================

export const MECHANISMS = {
  straining: {
    name: 'Filtration', icon: '▦', color: '#c4973a',
    desc: 'Physically traps particles bigger than the openings, like a coffee filter. Dissolved chemicals pass straight through.',
  },
  settling: {
    name: 'Settling', icon: '⬇', color: '#8a8aa8',
    desc: "Slows the water so gravity pulls particles to the bottom (Stokes' Law). Heavy sand drops fast, fine clay barely sinks, and floating oil never settles.",
  },
  infiltration: {
    name: 'Infiltration', icon: '⇣', color: '#b08850',
    desc: 'Water soaks down through soil or sand. The media strains out fine particles and the pollutants stuck to them.',
  },
  uptake: {
    name: 'Plant Uptake', icon: '❦', color: '#52c45a',
    desc: 'Roots absorb dissolved nitrogen and phosphorus and use them as fertilizer to grow.',
  },
  microbial: {
    name: 'Biological Treatment', icon: '✺', color: '#2fb8a8',
    desc: 'Bacteria and sunlight do chemistry: denitrifying bacteria turn nitrate into harmless N₂ gas, microbes eat oil, and pathogens die off.',
  },
  adsorption: {
    name: 'Adsorption', icon: '◈', color: '#b07ad8',
    desc: 'Dissolved metals and phosphorus chemically stick to soil, organic matter, and engineered media.',
  },
  flotation: {
    name: 'Flotation', icon: '⬆', color: '#d8b84a',
    desc: 'Oil is lighter than water and floats. Baffles and skimmers hold back the floating layer while water flows underneath.',
  },
  dissipation: {
    name: 'Energy Dissipation', icon: '≋', color: '#4a9de8',
    desc: 'Breaks up fast-moving water so it slows down and drops what it is carrying instead of scouring channels.',
  },
};

// Sediment-type pollutants fill up (clog) BMPs. Used by the maintenance system.
export const SEDIMENT_TYPES = new Set(['coarse', 'fine', 'aggregate', 'turbidity', 'flash']);

export const POLLUTANTS = {
  coarse: {
    id: 'coarse', name: 'Coarse Sediment', short: 'Coarse', sub: 'Sand & gravel',
    color: '#c4893a', outline: '#8b5e14',
    hp: 40, speed: 42, dmg: 2, reward: 3, size: 11,
    vuln: { straining: 1, settling: 1, infiltration: 0.2, dissipation: 0.3 },
    desc: 'Heavy soil particles knocked loose from bare slopes by rain. Easy to see. Slow, but it arrives in large amounts.',
    harm: 'Smothers stream beds and buries the insects at the base of the food web. Fills the gravel fish need to spawn.',
    tip: 'Coarse sediment is heavy. Anything that filters or lets water sit still will catch it.',
  },
  fine: {
    id: 'fine', name: 'Fine Sediment', short: 'Fine', sub: 'Silt & clay',
    color: '#b0b0c8', outline: '#7070a0',
    hp: 22, speed: 72, dmg: 1, reward: 2, size: 7,
    vuln: { straining: 0.2, settling: 0.35, infiltration: 0.9, adsorption: 0.2 },
    desc: 'Tiny particles that stay suspended long after sand settles. They slip right through silt fence fabric.',
    harm: 'Clogs fish gills and blocks sunlight. Carries attached phosphorus that feeds algae blooms.',
    tip: 'Fine sediment slips through fabric and barely settles. It has to soak into soil or sand media to be removed.',
  },
  aggregate: {
    id: 'aggregate', name: 'Sediment Aggregate', short: 'Aggregate', sub: 'Clumped clay',
    color: '#7a4010', outline: '#4a2005',
    hp: 90, speed: 30, dmg: 5, reward: 6, size: 16,
    splits: { into: 'coarse', count: 3 },
    vuln: { straining: 0.9, settling: 0.9, infiltration: 0.2, dissipation: 0.3 },
    desc: 'Clay particles that clumped (flocculated) together in the water. Tough and slow. Breaking one apart releases 3 coarse particles.',
    harm: 'The largest single sediment load. It can physically bury stream bottoms.',
    tip: 'When an aggregate breaks, 3 coarse particles keep going. Put a second line of defense downstream.',
  },
  turbidity: {
    id: 'turbidity', name: 'Turbidity Plume', short: 'Turbidity', sub: 'Muddy plume',
    color: '#8a7a60', outline: '#5a4a30',
    hp: 55, speed: 48, dmg: 4, reward: 5, size: 14,
    splits: { into: 'fine', count: 4 },
    vuln: { straining: 0.25, settling: 0.45, infiltration: 0.85 },
    desc: 'A cloud of suspended fine solids from bare construction soil. When it is broken up, it releases 4 fine particles.',
    harm: 'Blocks photosynthesis and makes it hard for fish to see prey.',
    tip: 'Turbidity breaks into fine sediment. Have infiltration (sand or soil media) ready downstream.',
  },
  nutrient: {
    id: 'nutrient', name: 'Nutrient Plume', short: 'Nutrients', sub: 'Dissolved N & P',
    color: '#52c45a', outline: '#2a8a32',
    hp: 45, speed: 58, dmg: 3, reward: 5, size: 9,
    vuln: { settling: 0.05, infiltration: 0.1, uptake: 1, microbial: 0.85, adsorption: 0.25 },
    desc: 'Dissolved nitrogen and phosphorus from fertilizer and manure. You cannot filter or settle something that is dissolved.',
    harm: 'Causes eutrophication. Algae blooms use up the oxygen and create dead zones. A major problem in Lake Lanier and the Chattahoochee.',
    tip: 'Dissolved nutrients pass through filters and basins. Living things remove them: plants and bacteria.',
  },
  oil: {
    id: 'oil', name: 'Oil & Grease', short: 'Oil', sub: 'Hydrocarbons',
    color: '#3a3a48', outline: '#c8a0ff',
    hp: 42, speed: 64, dmg: 3, reward: 6, size: 11,
    vuln: { straining: 0.1, infiltration: 0.45, microbial: 0.9, adsorption: 0.5, flotation: 1 },
    desc: 'Motor oil, fuel, and grease washed off parking lots and roads. Lighter than water, so it floats.',
    harm: 'Toxic to fish and insects even in small amounts. A single quart of oil can create a slick the size of two football fields.',
    tip: 'Oil floats, so settling basins pass it right over the top. Skim it (flotation) or let microbes eat it.',
  },
  metals: {
    id: 'metals', name: 'Heavy Metals', short: 'Metals', sub: 'Zinc, copper, lead',
    color: '#6a7a8a', outline: '#c0d0e0',
    hp: 55, speed: 52, dmg: 4, reward: 7, size: 10,
    vuln: { straining: 0.1, settling: 0.25, infiltration: 0.55, uptake: 0.15, adsorption: 1 },
    desc: 'Zinc from tires, copper from brake pads, and lead from old paint. Mostly dissolved or stuck to tiny particles.',
    harm: 'Metals never break down. They build up in sediment and in the bodies of fish, and copper interferes with fishes\' sense of smell.',
    tip: 'Metals do not break down, so microbes cannot help. They have to stick (adsorb) to soil, organic matter, or engineered media.',
  },
  bacteria: {
    id: 'bacteria', name: 'Bacteria', short: 'Bacteria', sub: 'E. coli & pathogens',
    color: '#d86aa0', outline: '#8a2a5a',
    hp: 26, speed: 82, dmg: 3, reward: 3, size: 7,
    vuln: { straining: 0.05, settling: 0.2, infiltration: 0.7, microbial: 1, adsorption: 0.15 },
    desc: 'Fecal bacteria from livestock, pet waste, and failing septic systems. Small, fast, and they come in swarms.',
    harm: 'The most common reason Georgia streams are listed as impaired. Makes water unsafe for swimming and fishing.',
    tip: 'Bacteria are too small to filter. Sunlight and other microbes kill them, and soil traps them as water soaks in.',
  },
  flash: {
    id: 'flash', name: 'Flash Runoff', short: 'Flash', sub: 'Peak flow surge',
    color: '#3a8ae8', outline: '#1a4ab0',
    hp: 70, speed: 95, dmg: 5, reward: 12, size: 14,
    payload: ['coarse', 'fine', 'nutrient', 'oil', 'metals'],
    vuln: { dissipation: 1, settling: 0.2, straining: 0.15, infiltration: 0.15 },
    desc: 'A violent surge from a big storm on paved or bare ground. It carries every pollutant type at once. Slowing it down releases what it carries.',
    harm: 'One peak-flow event can deliver more pollution than weeks of normal flow. It scours stream banks and overwhelms weak BMPs.',
    tip: 'Flash runoff is all about speed. Slow it down first (energy dissipation), then treat what it drops.',
  },
};

export const POLLUTANT_ORDER = ['coarse', 'fine', 'aggregate', 'turbidity', 'nutrient', 'oil', 'metals', 'bacteria', 'flash'];
