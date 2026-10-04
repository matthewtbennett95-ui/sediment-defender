// ================================================================
//  SPRITES — the artwork for every pollutant and BMP.
//
//  Each picture is drawn ONCE with vector paths into a small offscreen
//  canvas and then stamped onto the map with drawImage, which is far
//  cheaper than re-drawing the paths every frame. That's what keeps
//  the game smooth on Chromebooks while still letting the art be
//  detailed.
//
//  All drawing functions work centered on (0, 0) in world units.
// ================================================================
import { POLLUTANTS } from '../data/pollutants.js';
import { BMPS } from '../data/bmps.js';

const TAU = Math.PI * 2;

// Pollutants are drawn a bit larger than their hit size so students can
// actually see what's coming down the channel.
export const POLLUTANT_VIS = 1.35;

// ---------------------------------------------------------------- helpers
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function circle(ctx, x, y, r, fill, stroke, lw = 1) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, rot, fill, stroke, lw = 1) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** An irregular rounded "blob" polygon — rocks, clods, puddles. */
function blob(ctx, x, y, r, n, jag, rnd, rot = 0) {
  ctx.beginPath();
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const rr = r * (1 - jag / 2 + rnd() * jag);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    i === 0 ? ctx.moveTo(mx, my) : null;
    ctx.quadraticCurveTo(q[0], q[1], (q[0] + pts[(i + 2) % n][0]) / 2, (q[1] + pts[(i + 2) % n][1]) / 2);
  }
  ctx.closePath();
}
/** Angular stone/pebble with a highlight and a shadow. */
function stone(ctx, x, y, r, base, rnd, opts = {}) {
  ctx.save();
  const sd = Math.floor(rnd() * 1e9), rot = rnd() * TAU, n = opts.n || 7, jag = opts.jag ?? 0.45;
  blob(ctx, x + r * 0.15, y + r * 0.2, r, n, jag, rng(sd), rot);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  blob(ctx, x, y, r, n, jag, rng(sd), rot);
  ctx.fillStyle = base; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(0.8, r * 0.12); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ellipse(ctx, x - r * 0.3, y - r * 0.32, r * 0.38, r * 0.24, -0.5, 'rgba(255,255,255,0.28)');
  ctx.restore();
}
function grassTuft(ctx, x, y, h, col) {
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, h * 0.14); ctx.lineCap = 'round';
  for (const a of [-0.5, -0.15, 0.2, 0.5]) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + a * h * 0.4, y - h * 0.6, x + a * h, y - h); ctx.stroke();
  }
}
function canopy(ctx, x, y, r, light, dark, rnd) {
  const sd = Math.floor(rnd() * 1e9);
  blob(ctx, x + r * 0.18, y + r * 0.22, r, 9, 0.28, rng(sd)); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  blob(ctx, x, y, r, 9, 0.28, rng(sd)); ctx.fillStyle = dark; ctx.fill();
  blob(ctx, x - r * 0.12, y - r * 0.12, r * 0.8, 8, 0.3, rnd); ctx.fillStyle = light; ctx.fill();
  circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.28, 'rgba(255,255,255,0.18)');
}
function cattail(ctx, x, y, h, rnd) {
  ctx.strokeStyle = '#3f8a3a'; ctx.lineWidth = Math.max(1, h * 0.08); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (rnd() - 0.5) * h * 0.3, y - h * 0.5, x, y - h); ctx.stroke();
  ellipse(ctx, x, y - h * 0.82, h * 0.11, h * 0.22, 0, '#6b4423', '#3a2410', 0.8);
  ctx.strokeStyle = '#5aa84a'; ctx.lineWidth = Math.max(0.8, h * 0.06);
  ctx.beginPath(); ctx.moveTo(x, y - h * 0.2); ctx.quadraticCurveTo(x + h * 0.35, y - h * 0.45, x + h * 0.4, y - h * 0.7); ctx.stroke();
}
function lilyPad(ctx, x, y, r, rot) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, rot + 0.35, rot + TAU - 0.35); ctx.closePath();
  ctx.fillStyle = '#4fa848'; ctx.fill(); ctx.strokeStyle = '#2a6a2a'; ctx.lineWidth = Math.max(0.6, r * 0.12); ctx.stroke();
}
function water(ctx, path, deep = '#1d5a80', shallow = '#3a86b4') {
  path(); ctx.fillStyle = deep; ctx.fill();
}

// ================================================================ POLLUTANTS
// Each takes (ctx, s, def) where s is the pollutant's radius.
const POLLUTANT_ART = {
  coarse(ctx, s) {
    // Sand & gravel: a little pile of angular pebbles
    const r = rng(11);
    stone(ctx, -s * 0.38, s * 0.15, s * 0.58, '#c98a3c', r);
    stone(ctx, s * 0.42, s * 0.22, s * 0.5, '#a8743a', r);
    stone(ctx, s * 0.02, -s * 0.38, s * 0.55, '#d9a052', r);
    for (let i = 0; i < 6; i++) circle(ctx, (r() - 0.5) * s * 1.6, (r() - 0.2) * s * 1.2, s * 0.08 + 0.4, '#e8c080');
  },
  fine(ctx, s) {
    // Silt & clay: a hazy cloud of tiny particles
    const r = rng(22);
    circle(ctx, 0, 0, s * 1.15, 'rgba(176,176,200,0.28)');
    circle(ctx, 0, 0, s * 0.75, 'rgba(176,176,200,0.35)');
    for (let i = 0; i < 14; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * s * 0.95;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, s * (0.1 + r() * 0.12) + 0.3, i % 3 ? '#c8c8dc' : '#8a8ab0');
    }
  },
  aggregate(ctx, s) {
    // A lumpy clod of clay with pebbles stuck in it — it breaks apart
    const r = rng(33);
    blob(ctx, s * 0.12, s * 0.15, s, 9, 0.35, rng(5)); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    blob(ctx, 0, 0, s, 9, 0.35, rng(5)); ctx.fillStyle = '#7a4414'; ctx.fill();
    ctx.strokeStyle = '#3e1f06'; ctx.lineWidth = Math.max(1, s * 0.09); ctx.stroke();
    blob(ctx, -s * 0.15, -s * 0.18, s * 0.72, 8, 0.35, r); ctx.fillStyle = '#93561f'; ctx.fill();
    // Cracks
    ctx.strokeStyle = '#3e1f06'; ctx.lineWidth = Math.max(0.8, s * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.7); ctx.lineTo(s * 0.05, -s * 0.15); ctx.lineTo(-s * 0.25, s * 0.3);
    ctx.moveTo(s * 0.05, -s * 0.15); ctx.lineTo(s * 0.55, s * 0.05); ctx.stroke();
    stone(ctx, s * 0.45, -s * 0.42, s * 0.17, '#b0a090', r);
    stone(ctx, -s * 0.5, s * 0.35, s * 0.15, '#c0b0a0', r);
    // Grass sprig
    grassTuft(ctx, s * 0.2, -s * 0.78, s * 0.45, '#6aa040');
  },
  turbidity(ctx, s) {
    // A muddy, swirling plume of suspended sediment
    const r = rng(44);
    blob(ctx, 0, 0, s * 1.35, 10, 0.3, r); ctx.fillStyle = 'rgba(138,110,70,0.35)'; ctx.fill();
    blob(ctx, 0, 0, s * 1.0, 9, 0.3, r); ctx.fillStyle = 'rgba(122,96,60,0.85)'; ctx.fill();
    ctx.strokeStyle = 'rgba(210,180,130,0.75)'; ctx.lineWidth = Math.max(1, s * 0.13); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let a = 0; a < TAU * 1.6; a += 0.25) {
      const d = s * 0.08 + a * s * 0.085;
      const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.8;
      a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 6; i++) circle(ctx, (r() - 0.5) * s * 1.7, (r() - 0.5) * s * 1.4, s * 0.09 + 0.3, '#4a3a20');
  },
  nutrient(ctx, s) {
    // Fertilizer runoff: green algae bubbles with a sprouting leaf
    circle(ctx, 0, 0, s * 1.3, 'rgba(82,196,90,0.22)');
    for (const [x, y, rr] of [[-0.45, 0.25, 0.55], [0.4, 0.3, 0.5], [0, -0.1, 0.62], [-0.2, 0.62, 0.35], [0.5, -0.35, 0.32]]) {
      circle(ctx, x * s, y * s, rr * s, '#46b04e', '#1f6a28', Math.max(0.8, s * 0.08));
      circle(ctx, (x - rr * 0.35) * s, (y - rr * 0.35) * s, rr * s * 0.3, 'rgba(255,255,255,0.4)');
    }
    // Leaf
    ctx.save(); ctx.translate(s * 0.05, -s * 0.55); ctx.rotate(-0.6);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.55, -s * 0.35, s * 0.95, 0); ctx.quadraticCurveTo(s * 0.55, s * 0.3, 0, 0);
    ctx.fillStyle = '#8be06a'; ctx.fill(); ctx.strokeStyle = '#2a7a2a'; ctx.lineWidth = Math.max(0.8, s * 0.07); ctx.stroke();
    ctx.restore();
  },
  oil(ctx, s) {
    // A black droplet with a rainbow sheen
    circle(ctx, 0, s * 0.15, s * 1.25, 'rgba(40,30,60,0.35)');
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, 'rgba(255,90,200,0.55)'); g.addColorStop(0.35, 'rgba(90,200,255,0.55)');
    g.addColorStop(0.65, 'rgba(120,255,140,0.5)'); g.addColorStop(1, 'rgba(255,220,90,0.55)');
    ellipse(ctx, 0, s * 0.45, s * 1.15, s * 0.5, 0, null, g, Math.max(1.2, s * 0.18));
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.15);
    ctx.bezierCurveTo(s * 0.95, -s * 0.05, s * 0.85, s * 0.9, 0, s * 0.9);
    ctx.bezierCurveTo(-s * 0.85, s * 0.9, -s * 0.95, -s * 0.05, 0, -s * 1.15);
    ctx.fillStyle = '#1c1c26'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(0.8, s * 0.08); ctx.stroke();
    ellipse(ctx, -s * 0.28, -s * 0.05, s * 0.16, s * 0.36, -0.35, 'rgba(255,255,255,0.55)');
    ellipse(ctx, s * 0.25, s * 0.45, s * 0.22, s * 0.1, 0.3, 'rgba(160,120,255,0.55)');
  },
  metals(ctx, s) {
    // A hex nut: zinc/copper/lead from roofs, brakes and tires
    circle(ctx, s * 0.15, s * 0.2, s, 'rgba(0,0,0,0.4)');
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, '#dfe8f2'); g.addColorStop(0.5, '#8a9aac'); g.addColorStop(1, '#4a5868');
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (Math.PI / 3) * i;
      i ? ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s) : ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
    }
    ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#2a3440'; ctx.lineWidth = Math.max(1, s * 0.1); ctx.stroke();
    circle(ctx, 0, 0, s * 0.42, '#1c242e', '#c8d4e0', Math.max(0.8, s * 0.08));
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(0.6, s * 0.06);
    ctx.beginPath(); ctx.arc(0, 0, s * 0.3, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
    // A fleck of copper
    circle(ctx, s * 0.62, -s * 0.15, s * 0.12 + 0.3, '#d0803a');
  },
  bacteria(ctx, s) {
    // A rod-shaped bacterium (like E. coli) with flagella
    ctx.strokeStyle = '#b84a84'; ctx.lineWidth = Math.max(0.8, s * 0.13); ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(-s * 1.1, i * s * 0.25);
      ctx.bezierCurveTo(-s * 1.5, i * s * 0.25 - s * 0.4, -s * 1.8, i * s * 0.4 + s * 0.4, -s * 2.15, i * s * 0.55);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, -s * 0.55); ctx.lineTo(s * 0.8, -s * 0.55); ctx.arc(s * 0.8, 0, s * 0.55, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-s * 0.8, s * 0.55); ctx.arc(-s * 0.8, 0, s * 0.55, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
    ctx.fillStyle = '#e07ab0'; ctx.fill(); ctx.strokeStyle = '#7a1e50'; ctx.lineWidth = Math.max(1, s * 0.12); ctx.stroke();
    ellipse(ctx, -s * 0.1, -s * 0.18, s * 0.9, s * 0.16, 0, 'rgba(255,255,255,0.35)');
    circle(ctx, -s * 0.35, s * 0.12, s * 0.17, '#8a2a5a');
    circle(ctx, s * 0.4, s * 0.08, s * 0.13, '#8a2a5a');
  },
  flash(ctx, s) {
    // A surge of fast storm runoff: a curling wave with debris
    circle(ctx, 0, 0, s * 1.45, 'rgba(58,138,232,0.22)');
    ctx.beginPath();
    ctx.moveTo(-s * 1.2, s * 0.75);
    ctx.bezierCurveTo(-s * 1.0, -s * 0.3, -s * 0.2, -s * 1.15, s * 0.6, -s * 0.85);
    ctx.bezierCurveTo(s * 1.15, -s * 0.6, s * 1.05, 0, s * 0.55, s * 0.05);
    ctx.bezierCurveTo(s * 0.3, -s * 0.25, -s * 0.05, -s * 0.1, s * 0.1, s * 0.3);
    ctx.lineTo(s * 1.2, s * 0.75); ctx.closePath();
    const g = ctx.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, '#6ab4ff'); g.addColorStop(1, '#1a4ab0');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#0e2a70'; ctx.lineWidth = Math.max(1, s * 0.1); ctx.stroke();
    // Foam
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, s * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.45); ctx.bezierCurveTo(-s * 0.1, -s * 0.95, s * 0.6, -s * 0.95, s * 0.85, -s * 0.5); ctx.stroke();
    circle(ctx, s * 0.95, -s * 0.85, s * 0.12, '#ffffff'); circle(ctx, s * 1.15, -s * 0.6, s * 0.09, '#ffffff');
    // Debris it's carrying
    const r = rng(99);
    stone(ctx, -s * 0.6, s * 0.45, s * 0.2, '#c4893a', r);
    stone(ctx, s * 0.6, s * 0.5, s * 0.17, '#6a7a8a', r);
  },
};

// How each pollutant moves on the map. A few animation frames are
// pre-rendered (rotation/scale baked in), so animating costs nothing
// extra at draw time. `bob` is a cheap up-and-down drift.
//   frames: [rotation, scale] for each frame;  fps: frames per second
const POLLUTANT_ANIM = {
  coarse:    { bob: 0.07 },
  fine:      { fps: 5, frames: [[0, 1], [0.5, 1.06], [1.0, 1], [1.5, 0.95]] },
  aggregate: { bob: 0.05 },
  turbidity: { fps: 4, frames: [[0, 1], [0.35, 1.07], [0.7, 1.02], [1.05, 0.95]] },
  nutrient:  { fps: 5, frames: [[0, 1], [0, 1.07], [0, 1.1], [0, 1.04]] },
  oil:       { bob: 0.08, fps: 3, frames: [[-0.12, 1], [0, 1], [0.12, 1], [0, 1]] },
  metals:    { fps: 6, frames: [[0, 1], [0.26, 1], [0.52, 1], [0.78, 1]] },   // hex nut: 60° repeats
  bacteria:  { fps: 7, frames: [[-0.28, 1], [-0.09, 1], [0.1, 1], [0.28, 1], [0.1, 1], [-0.09, 1]] },
  flash:     { bob: 0.05, fps: 6, frames: [[-0.06, 1], [0, 1.05], [0.06, 1], [0, 0.96]] },
};

/** Draw a pollutant directly with vector paths (icons, cache building). */
export function drawPollutant(ctx, type, x, y, sz) {
  ctx.save();
  ctx.translate(x, y);
  (POLLUTANT_ART[type] || POLLUTANT_ART.coarse)(ctx, sz, POLLUTANTS[type]);
  ctx.restore();
}

// ================================================================ BMPs
// Each takes (ctx, s, b, tier) where s is the BMP's footprint diameter.
const BMP_ART = {
  silt_fence(ctx, s, b, tier) {
    const r = rng(101);
    // Trapped sediment piled against the uphill side
    ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.06); ctx.quadraticCurveTo(0, -s * 0.36, s * 0.4, -s * 0.06); ctx.quadraticCurveTo(0, s * 0.06, -s * 0.4, -s * 0.06);
    ctx.fillStyle = '#9a7040'; ctx.fill();
    for (let i = 0; i < 10; i++) circle(ctx, (r() - 0.5) * s * 0.6, -s * 0.08 - r() * s * 0.12, s * 0.022 + 0.4, i % 2 ? '#d8b070' : '#7a5228');
    // Muddy runoff arriving from uphill
    ctx.strokeStyle = 'rgba(160,120,70,0.7)'; ctx.lineWidth = Math.max(0.8, s * 0.03); ctx.lineCap = 'round';
    for (const x of [-0.18, 0.05, 0.24]) { ctx.beginPath(); ctx.moveTo(x * s, -s * 0.42); ctx.quadraticCurveTo(x * s - s * 0.04, -s * 0.34, x * s, -s * 0.26); ctx.stroke(); }
    const rows = tier >= 2 ? [0.08, 0.26] : [0.08];
    for (const off of rows) {
      const y0 = s * off;
      // Fabric
      ctx.beginPath(); ctx.moveTo(-s * 0.42, y0 - s * 0.08); ctx.quadraticCurveTo(0, y0 + s * 0.08, s * 0.42, y0 - s * 0.08);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111418'; ctx.lineWidth = s * 0.11; ctx.stroke();
      ctx.strokeStyle = '#2c3038'; ctx.lineWidth = s * 0.06; ctx.stroke();
      if (tier >= 1) {
        ctx.strokeStyle = 'rgba(200,200,210,0.55)'; ctx.lineWidth = Math.max(0.6, s * 0.012);
        for (let i = -4; i <= 4; i++) {
          const x = i * s * 0.09, yy = y0 - s * 0.08 + (1 - (x / (s * 0.42)) ** 2) * s * 0.08;
          ctx.beginPath(); ctx.moveTo(x - s * 0.04, yy - s * 0.05); ctx.lineTo(x + s * 0.04, yy + s * 0.05); ctx.stroke();
        }
      }
      // Wooden stakes
      for (let i = -2; i <= 2; i++) {
        const x = i * s * 0.18, yy = y0 - s * 0.08 + (1 - (x / (s * 0.42)) ** 2) * s * 0.08;
        roundRect(ctx, x - s * 0.035, yy - s * 0.1, s * 0.07, s * 0.16, s * 0.015);
        ctx.fillStyle = '#c08a4a'; ctx.fill(); ctx.strokeStyle = '#5a3a14'; ctx.lineWidth = Math.max(0.6, s * 0.015); ctx.stroke();
      }
    }
    if (tier >= 2) {
      // J-hooks at the ends
      ctx.strokeStyle = '#111418'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * s * 0.42, s * 0.18); ctx.quadraticCurveTo(sx * s * 0.5, -s * 0.05, sx * s * 0.36, -s * 0.2); ctx.stroke(); }
    }
    // Clear water seeping out the downhill side
    ctx.strokeStyle = 'rgba(120,190,240,0.75)'; ctx.lineWidth = Math.max(0.8, s * 0.025);
    for (const x of [-0.2, 0, 0.2]) { ctx.beginPath(); ctx.moveTo(x * s, s * (tier >= 2 ? 0.36 : 0.2)); ctx.quadraticCurveTo(x * s + s * 0.03, s * 0.32, x * s, s * 0.42); ctx.stroke(); }
  },

  check_dam(ctx, s, b, tier) {
    const r = rng(202);
    // Ponded water upstream
    ellipse(ctx, 0, -s * 0.2, s * 0.36, s * 0.14, 0, 'rgba(70,140,200,0.55)');
    ctx.strokeStyle = 'rgba(200,230,255,0.6)'; ctx.lineWidth = Math.max(0.6, s * 0.015);
    ctx.beginPath(); ctx.arc(0, -s * 0.38, s * 0.22, 0.4, Math.PI - 0.4); ctx.stroke();
    if (tier >= 2) {
      // Gabion basket
      roundRect(ctx, -s * 0.44, -s * 0.06, s * 0.88, s * 0.3, s * 0.03);
      ctx.fillStyle = '#5a5a62'; ctx.fill();
    }
    const n = tier >= 1 ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const x = -s * 0.38 + (i / (n - 1)) * s * 0.76;
      const y = s * 0.05 + Math.sin(i * 1.7) * s * 0.04 - Math.cos((i / (n - 1) - 0.5) * Math.PI) * s * 0.05;
      const shade = ['#8a8070', '#9a9080', '#7a7268', '#a09888'][i % 4];
      stone(ctx, x, y, s * (tier >= 1 ? 0.12 : 0.11) * (0.85 + r() * 0.3), tier >= 2 ? '#8a8a92' : shade, r);
    }
    for (let i = 0; i < 4; i++) stone(ctx, -s * 0.24 + i * s * 0.16, s * 0.2, s * 0.08, '#857a6a', r);
    if (tier >= 2) {
      ctx.strokeStyle = 'rgba(220,220,230,0.8)'; ctx.lineWidth = Math.max(0.6, s * 0.012);
      for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.1, -s * 0.06); ctx.lineTo(i * s * 0.1, s * 0.24); ctx.stroke(); }
      for (const y of [-0.06, 0.09, 0.24]) { ctx.beginPath(); ctx.moveTo(-s * 0.44, y * s); ctx.lineTo(s * 0.44, y * s); ctx.stroke(); }
    }
  },

  bioswale(ctx, s, b, tier) {
    const r = rng(303);
    // Grassy channel with a trickle of water down the middle
    ellipse(ctx, 0, 0, s * 0.46, s * 0.3, -0.25, tier >= 2 ? '#6a4a2a' : '#2a5a1e');
    ellipse(ctx, 0, 0, s * 0.42, s * 0.26, -0.25, '#3c7a2a');
    ellipse(ctx, 0, 0, s * 0.38, s * 0.07, -0.25, 'rgba(90,160,220,0.7)');
    const n = tier >= 1 ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = s * (0.16 + r() * 0.2);
      grassTuft(ctx, Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.75 + s * 0.06, s * (tier >= 1 ? 0.17 : 0.13), i % 2 ? '#6ac04a' : '#4a9a3a');
    }
    const flowers = ['#f0d040', '#d070e0', '#ff8a5a', '#f0f0f0'];
    for (let i = 0; i < (tier >= 1 ? 7 : 4); i++) {
      const a = r() * TAU, d = s * (0.14 + r() * 0.22);
      circle(ctx, Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.7 - s * 0.04, s * 0.035 + 0.6, flowers[i % 4]);
    }
  },

  sediment_basin(ctx, s, b, tier) {
    // Earthen embankment around a pool of settling water
    roundRect(ctx, -s * 0.47, -s * 0.34, s * 0.94, s * 0.68, s * 0.2);
    ctx.fillStyle = '#7a5a34'; ctx.fill(); ctx.strokeStyle = '#3e2a12'; ctx.lineWidth = Math.max(1, s * 0.02); ctx.stroke();
    roundRect(ctx, -s * 0.38, -s * 0.25, s * 0.76, s * 0.5, s * 0.14);
    const g = ctx.createLinearGradient(-s * 0.4, 0, s * 0.4, 0);
    g.addColorStop(0, tier >= 2 ? '#3a7aa8' : '#7a6a48'); g.addColorStop(1, tier >= 2 ? '#2a6a9a' : '#3a6a8a');
    ctx.fillStyle = g; ctx.fill();
    // Sediment settling to the bottom
    const r = rng(404);
    for (let i = 0; i < 10; i++) circle(ctx, -s * 0.3 + r() * s * 0.4, -s * 0.15 + r() * s * 0.32, s * 0.02 + 0.5, '#c0a070');
    // Ripples
    ctx.strokeStyle = 'rgba(220,240,255,0.45)'; ctx.lineWidth = Math.max(0.6, s * 0.012);
    ctx.beginPath(); ctx.arc(-s * 0.05, 0, s * 0.1, 0, TAU); ctx.stroke();
    if (tier >= 1) {
      // Baffles + a floating skimmer
      ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath(); ctx.moveTo(-s * 0.14, -s * 0.25); ctx.lineTo(-s * 0.14, s * 0.08); ctx.moveTo(s * 0.06, s * 0.25); ctx.lineTo(s * 0.06, -s * 0.08); ctx.stroke();
      circle(ctx, s * 0.24, -s * 0.12, s * 0.055, '#f08a30', '#7a3a10', Math.max(0.6, s * 0.012));
    }
    // Concrete riser pipe (outlet)
    circle(ctx, s * 0.26, s * 0.1, s * 0.09, '#b8b8c0', '#55555e', Math.max(0.8, s * 0.018));
    circle(ctx, s * 0.26, s * 0.1, s * 0.05, '#20242a');
    if (tier >= 2) {
      // Flocculant dosing station
      roundRect(ctx, -s * 0.45, s * 0.2, s * 0.14, s * 0.12, s * 0.02);
      ctx.fillStyle = '#e8e8ff'; ctx.fill(); ctx.strokeStyle = '#5a5a8a'; ctx.lineWidth = Math.max(0.6, s * 0.012); ctx.stroke();
    }
  },

  riparian_buffer(ctx, s, b, tier) {
    const r = rng(505);
    if (tier >= 2) {
      // Reconnected floodplain
      ctx.strokeStyle = 'rgba(74,157,232,0.8)'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.48, s * 0.32); ctx.bezierCurveTo(-s * 0.15, s * 0.14, s * 0.1, s * 0.5, s * 0.48, s * 0.28); ctx.stroke();
    }
    ellipse(ctx, 0, s * 0.05, s * 0.46, s * 0.36, 0, '#2a5a1e');
    for (let i = 0; i < 6; i++) grassTuft(ctx, (r() - 0.5) * s * 0.8, s * (0.1 + r() * 0.25), s * 0.1, '#5aa040');
    const big = tier >= 1 ? 1.15 : 1;
    // Shrubs then trees
    canopy(ctx, -s * 0.3, s * 0.16, s * 0.12, '#4aa850', '#2a7034', r);
    canopy(ctx, s * 0.32, s * 0.14, s * 0.11, '#5ab85a', '#2a7034', r);
    canopy(ctx, -s * 0.17, -s * 0.06, s * 0.19 * big, '#2fb878', '#11704a', r);
    canopy(ctx, s * 0.18, -s * 0.1, s * 0.17 * big, '#28a86a', '#0f6040', r);
    canopy(ctx, 0, -s * 0.24, s * 0.16 * big, '#3cc884', '#13784e', r);
  },

  oil_grit(ctx, s, b, tier) {
    // Underground concrete vault: what you see is the lid and access hatches
    roundRect(ctx, -s * 0.42, -s * 0.42, s * 0.84, s * 0.84, s * 0.08);
    ctx.fillStyle = '#9a9a9e'; ctx.fill(); ctx.strokeStyle = '#4a4a50'; ctx.lineWidth = Math.max(1, s * 0.025); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(0.6, s * 0.012);
    ctx.beginPath(); ctx.moveTo(-s * 0.42, s * 0.05); ctx.lineTo(s * 0.42, s * 0.05); ctx.stroke();
    // Cast-iron manhole cover
    circle(ctx, -s * 0.06, -s * 0.06, s * 0.25, '#3a3a40', '#18181c', Math.max(1, s * 0.025));
    ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = Math.max(0.7, s * 0.016);
    for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(-s * 0.06, -s * 0.06, s * 0.08 * i, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath(); ctx.moveTo(-s * 0.06 + Math.cos(a) * s * 0.08, -s * 0.06 + Math.sin(a) * s * 0.08);
      ctx.lineTo(-s * 0.06 + Math.cos(a) * s * 0.23, -s * 0.06 + Math.sin(a) * s * 0.23); ctx.stroke();
    }
    // Oil sheen trapped by the separator
    const g = ctx.createLinearGradient(s * 0.1, s * 0.15, s * 0.4, s * 0.38);
    g.addColorStop(0, 'rgba(255,90,200,0.7)'); g.addColorStop(0.5, 'rgba(90,200,255,0.7)'); g.addColorStop(1, 'rgba(255,220,90,0.7)');
    roundRect(ctx, s * 0.12, s * 0.14, s * 0.24, s * 0.2, s * 0.03);
    ctx.fillStyle = '#20242a'; ctx.fill(); ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, s * 0.03); ctx.stroke();
    if (tier >= 1) {
      // Coalescing plates visible through a second hatch
      roundRect(ctx, -s * 0.36, s * 0.14, s * 0.26, s * 0.2, s * 0.03);
      ctx.fillStyle = '#30343a'; ctx.fill();
      ctx.strokeStyle = '#c8c8d0'; ctx.lineWidth = Math.max(0.6, s * 0.014);
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.33, s * 0.17 + i * s * 0.045); ctx.lineTo(-s * 0.13, s * 0.17 + i * s * 0.045); ctx.stroke(); }
    }
    if (tier >= 2) {
      // Absorbent pillow
      roundRect(ctx, s * 0.2, -s * 0.37, s * 0.18, s * 0.14, s * 0.04);
      ctx.fillStyle = '#f0e8a0'; ctx.fill(); ctx.strokeStyle = '#8a7a30'; ctx.lineWidth = Math.max(0.6, s * 0.012); ctx.stroke();
    }
  },

  sand_filter(ctx, s, b, tier) {
    // Concrete chamber filled with a bed of sand
    roundRect(ctx, -s * 0.45, -s * 0.32, s * 0.9, s * 0.64, s * 0.06);
    ctx.fillStyle = '#8a8a8e'; ctx.fill(); ctx.strokeStyle = '#45454a'; ctx.lineWidth = Math.max(1, s * 0.022); ctx.stroke();
    const x0 = tier >= 1 ? -s * 0.2 : -s * 0.39;
    roundRect(ctx, x0, -s * 0.26, s * 0.39 - x0, s * 0.52, s * 0.04);
    ctx.fillStyle = tier >= 2 ? '#a88858' : '#e0c890'; ctx.fill();
    const r = rng(707);
    for (let i = 0; i < 30; i++) circle(ctx, x0 + r() * (s * 0.39 - x0), -s * 0.24 + r() * s * 0.48, s * 0.012 + 0.35, i % 3 ? '#b89a60' : '#fff2c8');
    if (tier >= 2) for (let i = 0; i < 8; i++) circle(ctx, x0 + r() * (s * 0.39 - x0), -s * 0.24 + r() * s * 0.48, s * 0.02 + 0.4, '#4a2a14');
    // Perforated underdrain pipe
    ctx.strokeStyle = '#f4f4f8'; ctx.lineWidth = Math.max(1, s * 0.035); ctx.setLineDash([s * 0.05, s * 0.03]);
    ctx.beginPath(); ctx.moveTo(x0 + s * 0.04, s * 0.14); ctx.lineTo(s * 0.35, s * 0.14); ctx.stroke(); ctx.setLineDash([]);
    if (tier >= 1) {
      // Pretreatment chamber (water)
      roundRect(ctx, -s * 0.39, -s * 0.26, s * 0.15, s * 0.52, s * 0.04);
      ctx.fillStyle = '#4a86b0'; ctx.fill();
      ctx.strokeStyle = 'rgba(220,240,255,0.6)'; ctx.lineWidth = Math.max(0.6, s * 0.012);
      ctx.beginPath(); ctx.arc(-s * 0.31, -s * 0.05, s * 0.04, 0, TAU); ctx.stroke();
    }
    // Inlet grate
    roundRect(ctx, -s * 0.12, -s * 0.36, s * 0.24, s * 0.08, s * 0.015);
    ctx.fillStyle = '#2a2a30'; ctx.fill();
    ctx.strokeStyle = '#7a7a82'; ctx.lineWidth = Math.max(0.5, s * 0.01);
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.12 + i * s * 0.04, -s * 0.36); ctx.lineTo(-s * 0.12 + i * s * 0.04, -s * 0.28); ctx.stroke(); }
  },

  wetland(ctx, s, b, tier) {
    const r = rng(808);
    // Marsh with open water, lily pads and cattails
    blob(ctx, 0, s * 0.02, s * 0.48, 11, 0.18, r); ctx.fillStyle = '#3a6a2a'; ctx.fill();
    blob(ctx, s * 0.04, s * 0.04, s * 0.38, 10, 0.25, r); ctx.fillStyle = '#2a6a8a'; ctx.fill();
    if (tier >= 2) { blob(ctx, -s * 0.18, -s * 0.1, s * 0.16, 8, 0.2, r); ctx.fillStyle = '#3a8ab5'; ctx.fill(); }
    if (tier >= 1) {
      // Deeper forebay behind a small berm
      ctx.beginPath(); ctx.ellipse(-s * 0.3, s * 0.2, s * 0.12, s * 0.09, 0, 0, TAU); ctx.fillStyle = '#16405e'; ctx.fill();
      ctx.strokeStyle = '#6a5030'; ctx.lineWidth = Math.max(1, s * 0.025); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(220,240,255,0.4)'; ctx.lineWidth = Math.max(0.6, s * 0.01);
    ctx.beginPath(); ctx.arc(s * 0.12, s * 0.12, s * 0.07, 0, TAU); ctx.stroke();
    lilyPad(ctx, s * 0.15, -s * 0.05, s * 0.07, 0.4);
    lilyPad(ctx, s * 0.28, s * 0.12, s * 0.055, 2.2);
    lilyPad(ctx, -s * 0.02, s * 0.2, s * 0.06, 4);
    circle(ctx, s * 0.15, -s * 0.05, s * 0.025, '#ffd8f0');
    const n = tier >= 2 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.95 + (i / (n - 1)) * 1.1);
      cattail(ctx, Math.cos(a) * s * 0.38, Math.sin(a) * s * 0.3 + s * 0.08, s * 0.22, r);
    }
  },
};

/** Draw a BMP directly with vector paths (icons, cache building). */
export function drawBmp(ctx, type, x, y, sz, tier = 0, opts = {}) {
  const b = BMPS[type];
  ctx.save();
  ctx.translate(x, y);
  if (opts.scale) ctx.scale(opts.scale, opts.scale);
  if (!opts.bare) {
    // Ground pad, ringed in the BMP's color (gold once fully upgraded)
    circle(ctx, sz * 0.03, sz * 0.05, sz * 0.6, 'rgba(0,0,0,0.4)');
    circle(ctx, 0, 0, sz * 0.58, '#2a3a1e');
    ctx.strokeStyle = tier >= 2 ? '#f0c040' : tier >= 1 ? b.color : b.dark;
    ctx.lineWidth = tier >= 1 ? Math.max(2, sz * 0.05) : Math.max(1.5, sz * 0.035);
    ctx.stroke();
  }
  (BMP_ART[type] || BMP_ART.silt_fence)(ctx, sz, b, tier);
  if (!opts.bare && tier > 0) {
    for (let i = 0; i < tier; i++) {
      const px = (tier === 1 ? 0 : -sz * 0.11 + i * sz * 0.22);
      circle(ctx, px, -sz * 0.58, sz * 0.075 + 1, '#f0c040', '#3a2a00', 1);
      ctx.fillStyle = '#3a2a00';
      ctx.beginPath();
      const rr = sz * 0.045 + 0.5;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * (TAU / 5) * 2;
        k ? ctx.lineTo(px + Math.cos(a) * rr, -sz * 0.58 + Math.sin(a) * rr) : ctx.moveTo(px + Math.cos(a) * rr, -sz * 0.58 + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

// ================================================================ cache
// Sprites are cached at EXACTLY the size they appear on screen and drawn
// at whole-pixel positions, so stamping one is a straight pixel copy
// (no resampling) — the cheapest thing a canvas can do. The cache is
// rebuilt when the zoom level changes.
const cache = new Map();
let cacheK = 0;
function sameK(k) {
  const q = Math.round(k * 32) / 32;
  if (q !== cacheK) { cache.clear(); cacheK = q; }
  return q;
}

function makeSprite(radius, k, paint) {
  const px = Math.max(4, Math.ceil(radius * 2 * k));
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  ctx.setTransform(px / (radius * 2), 0, 0, px / (radius * 2), px / 2, px / 2);
  paint(ctx);
  return c;
}

function getSprite(key, radius, k, paint) {
  let s = cache.get(key);
  if (!s) { s = makeSprite(radius, k, paint); cache.set(key, s); }
  return s;
}

/** Blit a sprite centered on device pixel (dx, dy). */
function blit(ctx, img, dx, dy) {
  ctx.drawImage(img, Math.round(dx - img.width / 2), Math.round(dy - img.height / 2));
}

/**
 * Stamp a pollutant. The context must be in DEVICE pixels (identity
 * transform); (dx, dy) is the device-pixel position; `k` = device
 * pixels per world unit; `t` drives the animation.
 */
export function stampPollutant(ctx, type, dx, dy, size, k, t, hit) {
  k = sameK(k);
  const vs = Math.max(size * POLLUTANT_VIS, 10.5);
  const R = vs * 2.3;
  const a = POLLUTANT_ANIM[type] || {};
  const n = a.frames ? a.frames.length : 1;
  const f = a.frames ? Math.floor(t * a.fps) % n : 0;
  const img = getSprite(`p:${type}:${size}:${f}`, R, k, c => {
    if (a.frames) { c.rotate(a.frames[f][0]); c.scale(a.frames[f][1], a.frames[f][1]); }
    drawPollutant(c, type, 0, 0, vs);
  });
  const y = dy + (a.bob ? Math.sin(t * 5) * a.bob * vs * k : 0);
  blit(ctx, img, dx, y);
  if (hit) {
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45;
    blit(ctx, img, dx, y);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
}

/** Stamp a BMP (device-pixel context, like stampPollutant). */
export function stampBmp(ctx, type, dx, dy, tier, k, scale = 1) {
  k = sameK(k);
  const sz = BMPS[type].size * 2;
  const R = sz * 0.72;
  const img = getSprite('b:' + type + ':' + tier, R, k, c => drawBmp(c, type, 0, 0, sz, tier));
  if (scale === 1) { blit(ctx, img, dx, dy); return; }
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, dx - w / 2, dy - h / 2, w, h);
}

/** Stamp any small cached picture by key (device-pixel context). */
export function stampCustom(ctx, key, radius, k, paint, dx, dy) {
  k = sameK(k);
  blit(ctx, getSprite('c:' + key, radius, k, paint), dx, dy);
}

// ================================================================ icons (UI)
const iconCache = new Map();
function iconCanvas(key, px, paint) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let src = iconCache.get(key + ':' + dpr);
  if (!src) {
    src = document.createElement('canvas');
    src.width = Math.round(px * dpr); src.height = Math.round(px * dpr);
    const ctx = src.getContext('2d');
    ctx.scale(dpr, dpr);
    paint(ctx);
    iconCache.set(key + ':' + dpr, src);
  }
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.style.width = px + 'px'; c.style.height = px + 'px';
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

/** Small canvas icon (for shop cards, guide, etc). */
export function bmpIcon(type, px = 40, tier = 0) {
  return iconCanvas(`b:${type}:${tier}:${px}`, px, ctx => drawBmp(ctx, type, px / 2, px * 0.53, px * 0.8, tier));
}

export function pollutantIcon(type, px = 32) {
  return iconCanvas(`p:${type}:${px}`, px, ctx => {
    const ext = type === 'bacteria' ? 2.2 : type === 'flash' || type === 'turbidity' ? 1.45 : 1.25;
    const s = (px / 2) / ext * 0.95;
    drawPollutant(ctx, type, px / 2 + (type === 'bacteria' ? s * 0.5 : 0), px / 2, s);
  });
}
