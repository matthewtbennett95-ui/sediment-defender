// ================================================================
//  BUILT-IN MAPS
//  World is always 1600 × 900. The creek is the band below creekY.
//  Every path is a list of [x, y] points that ends in the creek.
//
//  To add a map: use the Map Editor (editor.html), or copy one of
//  these objects into a new file and add it to BUILTIN_MAPS below.
//  Teachers can also publish editor maps from the dashboard with
//  no code changes at all.
// ================================================================

export const clearedSlope = {
  id: 'cleared-slope',
  name: 'The Cleared Slope',
  difficulty: 'Easy',
  description: 'A forested hillside cleared for a new subdivision. One long flow path with sharp switchbacks. Learn what each BMP is good at.',
  tags: ['Single path', '20 waves'],
  theme: 'construction',
  startMoney: 130, startHP: 100, loadScale: 1.1, rewardScale: 1.0, landAllowance: 8, efficiencyTarget: 65,
  creekY: 810, creekLabel: 'PROTECTED CREEK',
  paths: [
    { id: 'main', label: 'RUNOFF', opensAtWave: 1,
      points: [[800, 0], [800, 140], [240, 140], [240, 275], [1250, 275], [1250, 415], [290, 415], [290, 560], [1150, 560], [1150, 690], [610, 690], [610, 860]] },
  ],
  decor: [
    { type: 'trees', x: 70, y: 420, r: 70, n: 9 },
    { type: 'trees', x: 1500, y: 300, r: 80, n: 10 },
    { type: 'trees', x: 1480, y: 650, r: 70, n: 8 },
    { type: 'gravel', x: 460, y: 20, w: 260, h: 90 },
    { type: 'label', x: 590, y: 70, text: 'CLEARED LOTS' },
  ],
};

export const branchingWatershed = {
  id: 'branching-watershed',
  name: 'The Branching Watershed',
  difficulty: 'Medium',
  description: 'A farm stream and a construction stream meet at a choke point above the river. The farm carries nutrients and bacteria; the construction site carries sediment, oil, and metals. The construction branch opens at Wave 7.',
  tags: ['Two paths', 'Branch opens Wave 7'],
  theme: 'split',
  startMoney: 220, startHP: 100, loadScale: 1.0, rewardScale: 1.15, landAllowance: 9, efficiencyTarget: 55,
  creekY: 810, creekLabel: 'PROTECTED RIVER',
  paths: [
    { id: 'farm', label: 'FARM BRANCH', opensAtWave: 1, color: '#6aad3a',
      points: [[350, 0], [350, 160], [130, 160], [130, 320], [560, 320], [560, 470], [240, 470], [240, 615], [800, 615], [800, 860]] },
    { id: 'construction', label: 'CONSTRUCTION BRANCH', opensAtWave: 7, color: '#c4973a',
      points: [[1250, 0], [1250, 160], [1470, 160], [1470, 320], [1040, 320], [1040, 470], [1360, 470], [1360, 615], [800, 615], [800, 860]] },
  ],
  // Which branch each pollutant prefers (falls back to any open path).
  routing: {
    nutrient: 'farm', bacteria: 'farm', fine: 'farm',
    coarse: 'construction', aggregate: 'construction', turbidity: 'construction', oil: 'construction', metals: 'construction',
  },
  decor: [
    { type: 'rows', x: 20, y: 20, w: 720, h: 760 },
    { type: 'gravel', x: 880, y: 20, w: 700, h: 760 },
    { type: 'label', x: 350, y: 760, text: 'FARMLAND' },
    { type: 'label', x: 1250, y: 760, text: 'CONSTRUCTION SITE' },
  ],
};

export const pondFailure = {
  id: 'pond-failure',
  name: 'The Detention Pond Failure',
  difficulty: 'Hard',
  description: 'An old detention pond is failing. The south wall has already breached, and the rest of the embankment is unstable. Watch for seepage warnings, decide what to repair, and be ready for the breach you didn\'t see coming.',
  tags: ['Random breaches', 'Embankment repair', 'Hard'],
  theme: 'pond',
  startMoney: 320, startHP: 80, loadScale: 1.0, rewardScale: 1.3, landAllowance: 9, efficiencyTarget: 45,
  creekY: 810, creekLabel: 'PROTECTED WATERSHED',
  // Breach channels drain into three gullies (west, center, east) that
  // carry the water downhill to the creek. Defending a gully covers every
  // breach that feeds it — but a breach high up the wall has a long,
  // undefended run before it gets there.
  paths: [
    { id: 'S', label: 'SOUTH BREACH', opensAtWave: 1,
      points: [[800, 260], [800, 360], [640, 360], [640, 470], [960, 470], [960, 590], [800, 590], [800, 700], [800, 860]] },
    { id: 'SW', label: 'SW WALL', breachable: true,
      points: [[670, 215], [540, 300], [420, 300], [420, 420], [180, 420], [180, 560], [480, 560], [480, 690], [330, 690], [330, 860]] },
    { id: 'W', label: 'WEST WALL', breachable: true,
      points: [[630, 165], [420, 165], [420, 420], [180, 420], [180, 560], [480, 560], [480, 690], [330, 690], [330, 860]] },
    { id: 'NW', label: 'NW WALL', breachable: true,
      points: [[700, 88], [520, 40], [90, 40], [90, 560], [480, 560], [480, 690], [330, 690], [330, 860]] },
    { id: 'SE', label: 'SE WALL', breachable: true,
      points: [[930, 215], [1060, 300], [1180, 300], [1180, 420], [1420, 420], [1420, 560], [1120, 560], [1120, 690], [1270, 690], [1270, 860]] },
    { id: 'E', label: 'EAST WALL', breachable: true,
      points: [[970, 165], [1180, 165], [1180, 420], [1420, 420], [1420, 560], [1120, 560], [1120, 690], [1270, 690], [1270, 860]] },
    { id: 'NE', label: 'NE WALL', breachable: true,
      points: [[900, 88], [1080, 40], [1510, 40], [1510, 560], [1120, 560], [1120, 690], [1270, 690], [1270, 860]] },
  ],
  // Tuned so patching every failure gets too expensive by mid-season:
  // most players end up defending 1 extra channel by ~storm 12, 2 by
  // ~storm 16, and 3 by storm 20. (Check with: npm run sim)
  breach: {
    firstEventAfterWave: 3,   // earliest storm that can end with a failure
    eventChance: 0.36,        // chance of a failure after each storm…
    eventRamp: 0.015,         // …rising this much every storm after that
    maxGap: 4,                // never more than this many storms without one
    doubleFromWave: 15,       // from here, two sections can fail at once…
    doubleChance: 0.3,        // …this often
    warnChance: 0.75,         // early on, most failures show seepage first…
    warnDecay: 0.04,          // …but warnings get rarer every storm after suddenFromWave
    warnMin: 0.35,
    suddenFromWave: 6,        // from here, some failures come with NO warning
    refailAfter: 4,           // a patched wall can fail AGAIN after this many storms
    refailWeight: 0.6,        // (patched walls are a bit less likely to fail than original ones)
    maxOpen: 4,               // never more than this many open channels at once
    repairBase: 200,          // emergency repair: base + step × (fixes so far)…
    repairStep: 70,
    reinforceCost: 110,       // reinforcing BEFORE failure: base + step × (fixes so far)…
    reinforceStep: 40,
    ageRate: 0.045,           // …and everything costs 4.5% more per storm as the wall ages
  },
  decor: [
    { type: 'pond', x: 800, y: 165, rx: 170, ry: 95, label: 'FAILING POND' },
    { type: 'trees', x: 640, y: 740, r: 60, n: 6 },
    { type: 'trees', x: 960, y: 740, r: 60, n: 6 },
  ],
};

export const BUILTIN_MAPS = [clearedSlope, branchingWatershed, pondFailure];
