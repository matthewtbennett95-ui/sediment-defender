// ================================================================
//  WAVES — the default 20-wave storm season.
//  Each group: { p: pollutant id, n: count, gap: seconds between,
//               delay: seconds before the group starts, path?: path id }
//  Each wave introduces at most ONE new pollutant, and the BMP that
//  counters it unlocks a wave or two before (see BMPS.unlockWave).
//
//  Maps can supply their own `waves` array in this same format.
// ================================================================

export const DEFAULT_WAVES = [
  { label: 'First Rain — Bare Slope',
    groups: [{ p: 'coarse', n: 12, gap: 1.5 }] },
  { label: 'Fine Sediment Joins',
    groups: [{ p: 'coarse', n: 14, gap: 1.3 }, { p: 'fine', n: 8, gap: 1.6, delay: 4 }] },
  { label: 'Steady Rain',
    groups: [{ p: 'coarse', n: 16, gap: 1.1 }, { p: 'fine', n: 14, gap: 1.2, delay: 2 }] },
  { label: 'Aggregates Forming',
    groups: [{ p: 'aggregate', n: 4, gap: 3.5, delay: 2 }, { p: 'coarse', n: 14, gap: 1.1 }, { p: 'fine', n: 12, gap: 1.2 }] },
  { label: 'Heavy Sediment Load',
    groups: [{ p: 'aggregate', n: 7, gap: 2.4 }, { p: 'coarse', n: 16, gap: 1.0 }, { p: 'fine', n: 14, gap: 1.0, delay: 3 }] },
  { label: 'Turbidity Plumes',
    groups: [{ p: 'turbidity', n: 5, gap: 3 }, { p: 'coarse', n: 14, gap: 1.0 }, { p: 'fine', n: 14, gap: 1.0 }, { p: 'aggregate', n: 4, gap: 3, delay: 6 }] },
  { label: 'Fertilizer Washoff',
    groups: [{ p: 'nutrient', n: 10, gap: 1.4 }, { p: 'turbidity', n: 6, gap: 2.6 }, { p: 'coarse', n: 14, gap: 1.0 }] },
  { label: 'Nutrient Surge',
    groups: [{ p: 'nutrient', n: 16, gap: 1.0 }, { p: 'fine', n: 16, gap: 0.9 }, { p: 'aggregate', n: 6, gap: 2.4 }] },
  { label: 'Parking Lot Runoff — Oil',
    groups: [{ p: 'oil', n: 9, gap: 1.6 }, { p: 'nutrient', n: 12, gap: 1.1 }, { p: 'coarse', n: 16, gap: 0.9 }] },
  { label: 'Road Runoff',
    groups: [{ p: 'oil', n: 14, gap: 1.1 }, { p: 'turbidity', n: 8, gap: 2.2 }, { p: 'nutrient', n: 12, gap: 1.0 }] },
  { label: 'Brake Dust & Tire Wear — Metals',
    groups: [{ p: 'metals', n: 9, gap: 1.5 }, { p: 'oil', n: 10, gap: 1.2 }, { p: 'fine', n: 18, gap: 0.8 }] },
  { label: 'Urban Mix',
    groups: [{ p: 'metals', n: 13, gap: 1.0 }, { p: 'nutrient', n: 14, gap: 0.9 }, { p: 'aggregate', n: 8, gap: 2.0 }] },
  { label: 'Failing Septic — Bacteria',
    groups: [{ p: 'bacteria', n: 16, gap: 0.7 }, { p: 'nutrient', n: 12, gap: 1.0 }, { p: 'turbidity', n: 8, gap: 2.0 }] },
  { label: 'Storm Warning — Flash Runoff',
    groups: [{ p: 'flash', n: 3, gap: 5, delay: 3 }, { p: 'bacteria', n: 14, gap: 0.8 }, { p: 'oil', n: 12, gap: 1.0 }, { p: 'metals', n: 10, gap: 1.2 }] },
  { label: 'Construction Storm',
    groups: [{ p: 'flash', n: 5, gap: 4 }, { p: 'coarse', n: 22, gap: 0.6 }, { p: 'aggregate', n: 10, gap: 1.6 }, { p: 'turbidity', n: 10, gap: 1.6 }] },
  { label: 'Farm Storm',
    groups: [{ p: 'flash', n: 5, gap: 4 }, { p: 'nutrient', n: 20, gap: 0.7 }, { p: 'bacteria', n: 18, gap: 0.6 }, { p: 'fine', n: 16, gap: 0.8 }] },
  { label: 'City Storm',
    groups: [{ p: 'flash', n: 7, gap: 3 }, { p: 'metals', n: 15, gap: 0.8 }, { p: 'oil', n: 15, gap: 0.8 }, { p: 'fine', n: 20, gap: 0.6 }] },
  { label: 'Everything at Once',
    groups: [{ p: 'flash', n: 8, gap: 2.6 }, { p: 'aggregate', n: 12, gap: 1.3 }, { p: 'turbidity', n: 12, gap: 1.3 }, { p: 'nutrient', n: 16, gap: 0.8 }, { p: 'bacteria', n: 16, gap: 0.7 }] },
  { label: 'Peak Discharge',
    groups: [{ p: 'flash', n: 10, gap: 2.2 }, { p: 'oil', n: 16, gap: 0.7 }, { p: 'metals', n: 16, gap: 0.7 }, { p: 'bacteria', n: 18, gap: 0.6 }, { p: 'coarse', n: 18, gap: 0.6 }] },
  { label: '100-Year Flood — Final Stand',
    groups: [{ p: 'flash', n: 14, gap: 1.7 }, { p: 'aggregate', n: 12, gap: 1.2 }, { p: 'turbidity', n: 12, gap: 1.2 }, { p: 'nutrient', n: 18, gap: 0.6 }, { p: 'oil', n: 16, gap: 0.7 }, { p: 'metals', n: 16, gap: 0.7 }, { p: 'bacteria', n: 18, gap: 0.6 }] },
];

/** Pollutant toughness grows each wave (storms get bigger). */
export function waveLoadScale(wave) {
  const w = wave - 1;
  return 1 + 0.085 * w + 0.0022 * w * w;
}

/** Bonus paid for clearing a wave. */
export function waveBonus(wave) {
  return 40 + 6 * wave;
}
