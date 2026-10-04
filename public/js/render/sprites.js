// Drawing code for pollutants and BMPs. Each function draws centered on
// (x, y) at the given size in whatever coordinate system ctx is using.
import { POLLUTANTS } from '../data/pollutants.js';
import { BMPS } from '../data/bmps.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- pollutants
export function drawPollutant(ctx, type, x, y, sz, t = 0, hit = false) {
  const def = POLLUTANTS[type];
  ctx.save();
  ctx.translate(x, y);
  const fn = POLLUTANT_DRAW[type] || POLLUTANT_DRAW.coarse;
  fn(ctx, sz, def, t);
  if (hit) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.9, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

const POLLUTANT_DRAW = {
  coarse(ctx, s, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(-s, -s * 0.4); ctx.lineTo(-s * 0.4, -s); ctx.lineTo(s * 0.3, -s); ctx.lineTo(s, -s * 0.3);
    ctx.lineTo(s * 0.8, s * 0.5); ctx.lineTo(s * 0.2, s); ctx.lineTo(-s * 0.5, s); ctx.lineTo(-s, s * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = d.outline; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ffffff22'; ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.35, s * 0.25, 0, TAU); ctx.fill();
  },
  fine(ctx, s, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.75, s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = d.outline; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.3, s * 0.25, 0, TAU); ctx.fill();
  },
  aggregate(ctx, s, d) {
    ctx.fillStyle = d.color; ctx.strokeStyle = d.outline;
    ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    for (const [cx, cy, cr] of [[-0.7, -0.5, 0.45], [0.65, -0.4, 0.4], [0.1, 0.75, 0.42]]) {
      ctx.beginPath(); ctx.arc(cx * s, cy * s, cr * s, 0, TAU); ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.fillStyle = d.outline + 'aa';
    for (const [cx, cy, cr] of [[-0.3, 0.15, 0.12], [0.25, -0.1, 0.1], [0, 0.4, 0.11]]) {
      ctx.beginPath(); ctx.arc(cx * s, cy * s, cr * s, 0, TAU); ctx.fill();
    }
  },
  turbidity(ctx, s, d, t) {
    const wob = Math.sin(t * 3) * 0.06;
    ctx.fillStyle = d.color + '44';
    ctx.beginPath(); ctx.ellipse(0, 0, s * (1.45 + wob), s * (1.1 - wob), 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = d.color + 'dd';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 1.1, s * 0.8, 0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = d.outline; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = d.outline + 'cc';
    for (const [cx, cy, cr] of [[-0.4, -0.1, 0.1], [0.3, 0.2, 0.09], [0, -0.25, 0.08], [0.5, -0.1, 0.07]]) {
      ctx.beginPath(); ctx.arc(cx * s, cy * s, cr * s, 0, TAU); ctx.fill();
    }
  },
  nutrient(ctx, s, d, t) {
    ctx.fillStyle = d.color + '33';
    ctx.beginPath(); ctx.arc(0, 0, s * (1.35 + Math.sin(t * 4) * 0.1), 0, TAU); ctx.fill();
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.85, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = d.outline; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#d8ffd8'; ctx.font = `bold ${s * 0.9}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, s * 0.05);
  },
  oil(ctx, s, d, t) {
    // Dark droplet with a rainbow sheen
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.1);
    ctx.bezierCurveTo(s * 0.9, -s * 0.1, s * 0.9, s, 0, s);
    ctx.bezierCurveTo(-s * 0.9, s, -s * 0.9, -s * 0.1, 0, -s * 1.1);
    ctx.fill();
    const g = ctx.createLinearGradient(-s, -s, s, s);
    const k = (Math.sin(t * 2) + 1) / 2;
    g.addColorStop(0, '#ff60c088'); g.addColorStop(0.3 + k * 0.2, '#60c0ff88'); g.addColorStop(1, '#ffe06088');
    ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffffff44'; ctx.beginPath(); ctx.ellipse(-s * 0.25, -s * 0.1, s * 0.18, s * 0.35, -0.4, 0, TAU); ctx.fill();
  },
  metals(ctx, s, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i;
      i ? ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s) : ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = d.outline; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#e0f0ff'; ctx.font = `bold ${s * 0.75}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Zn', 0, s * 0.05);
  },
  bacteria(ctx, s, d, t) {
    ctx.rotate(Math.sin(t * 5) * 0.3);
    ctx.strokeStyle = d.color; ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(-s * 1.1, i * s * 0.3);
      ctx.quadraticCurveTo(-s * 1.6, i * s * 0.3 + Math.sin(t * 9 + i) * s * 0.4, -s * 2, i * s * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.ellipse(0, 0, s * 1.2, s * 0.6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = d.outline; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = d.outline;
    ctx.beginPath(); ctx.arc(-s * 0.3, 0, s * 0.18, 0, TAU); ctx.arc(s * 0.35, s * 0.05, s * 0.14, 0, TAU); ctx.fill();
  },
  flash(ctx, s, d, t) {
    ctx.fillStyle = d.color + '30';
    ctx.beginPath(); ctx.arc(0, 0, s * (1.5 + Math.sin(t * 10) * 0.12), 0, TAU); ctx.fill();
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(0, s); ctx.lineTo(-s * 0.9, -s * 0.2); ctx.lineTo(-s * 0.35, -s * 0.2); ctx.lineTo(-s * 0.35, -s);
    ctx.lineTo(s * 0.35, -s); ctx.lineTo(s * 0.35, -s * 0.2); ctx.lineTo(s * 0.9, -s * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = d.outline; ctx.lineWidth = 1.8; ctx.stroke();
    ['#c4893a', '#b0b0c8', '#52c45a', '#3a3a48', '#6a7a8a'].forEach((c, i) => {
      const a = (i / 5) * TAU + t * 3;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(Math.cos(a) * s * 1.15, Math.sin(a) * s * 1.15, s * 0.2, 0, TAU); ctx.fill();
    });
  },
};

// ---------------------------------------------------------------- BMPs
export function drawBmp(ctx, type, x, y, sz, tier = 0, opts = {}) {
  const b = BMPS[type];
  ctx.save();
  ctx.translate(x, y);
  if (opts.scale) ctx.scale(opts.scale, opts.scale);
  if (!opts.bare) {
    // Base pad
    ctx.fillStyle = 'rgba(10,16,10,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.62, 0, TAU); ctx.fill();
    ctx.strokeStyle = tier >= 2 ? '#f0c040' : tier >= 1 ? b.color : b.dark;
    ctx.lineWidth = tier >= 1 ? 2.5 : 1.5;
    ctx.stroke();
  }
  (BMP_DRAW[type] || BMP_DRAW.silt_fence)(ctx, sz, b, tier);
  if (!opts.bare && tier > 0) {
    for (let i = 0; i < tier; i++) {
      ctx.fillStyle = '#f0c040';
      ctx.beginPath(); ctx.arc(-sz * 0.18 + i * sz * 0.36, -sz * 0.62, sz * 0.09 + 1, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  ctx.restore();
}

const BMP_DRAW = {
  silt_fence(ctx, s, b, tier) {
    const w = s * 0.8, h = s * 0.4;
    ctx.fillStyle = b.color + '33'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = b.dark; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const px = -w / 2 + (w / 2) * i; ctx.beginPath(); ctx.moveTo(px, -h / 2 - 4); ctx.lineTo(px, h / 2 + 4); ctx.stroke(); }
    if (tier >= 1) { ctx.strokeStyle = '#a0a0a0aa'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + (h / 4) * i); ctx.lineTo(w / 2, -h / 2 + (h / 4) * i); ctx.stroke(); } }
    if (tier >= 2) { ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.strokeRect(-w / 2, h / 2 + 5, w, 4); }
  },
  check_dam(ctx, s, b, tier) {
    ctx.fillStyle = tier >= 2 ? '#7a7a8a' : '#8a7f6a';
    const n = tier >= 1 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI;
      ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.35 - 0, -Math.sin(a) * s * 0.18 + s * 0.08, s * 0.15, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = b.dark; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.2); ctx.lineTo(s * 0.45, s * 0.2); ctx.stroke();
    if (tier >= 2) { ctx.strokeStyle = '#c0c0d0'; ctx.lineWidth = 1; ctx.strokeRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.35); }
    ctx.fillStyle = b.color; ctx.font = `bold ${s * 0.3}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('≋', 0, -s * 0.28);
  },
  bioswale(ctx, s, b, tier) {
    ctx.fillStyle = '#1a3a10';
    ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.46, s * 0.22, 0, 0, TAU); ctx.fill();
    const n = tier >= 1 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const px = -s * 0.28 + i * (s * 0.56 / (n - 1));
      const ph = s * (0.3 + Math.sin(i * 1.3) * 0.07);
      ctx.strokeStyle = i % 2 ? b.color : b.dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, s * 0.08); ctx.lineTo(px, -ph); ctx.stroke();
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(px, -ph, s * 0.07 + 1, 0, TAU); ctx.fill();
    }
    if (tier >= 2) { ctx.fillStyle = '#b08850'; ctx.fillRect(-s * 0.4, s * 0.2, s * 0.8, s * 0.06); }
  },
  sediment_basin(ctx, s, b, tier) {
    ctx.fillStyle = '#2a2a3a'; ctx.fillRect(-s * 0.45, -s * 0.28, s * 0.9, s * 0.56);
    ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.strokeRect(-s * 0.45, -s * 0.28, s * 0.9, s * 0.56);
    ctx.fillStyle = '#3a6a9a66'; ctx.fillRect(-s * 0.38, -s * 0.12, s * 0.76, s * 0.33);
    ctx.fillStyle = b.color + 'aa';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-s * 0.21 + i * s * 0.14, s * 0.12, s * 0.04 + 1, 0, TAU); ctx.fill(); }
    if (tier >= 1) { ctx.strokeStyle = '#c0c0d0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.28); ctx.lineTo(-s * 0.1, s * 0.1); ctx.moveTo(s * 0.15, s * 0.28); ctx.lineTo(s * 0.15, -s * 0.05); ctx.stroke(); }
    if (tier >= 2) { ctx.fillStyle = '#f0f0ff'; ctx.beginPath(); ctx.arc(s * 0.32, -s * 0.18, s * 0.06 + 1, 0, TAU); ctx.fill(); }
  },
  riparian_buffer(ctx, s, b, tier) {
    const h = tier >= 1 ? s * 0.55 : s * 0.42;
    for (const t of [{ px: -s * 0.26, k: 0.72 }, { px: s * 0.26, k: 0.72 }, { px: 0, k: 1 }]) {
      ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(t.px, s * 0.22); ctx.lineTo(t.px, -h * t.k + s * 0.08); ctx.stroke();
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(t.px, -h * t.k + s * 0.04, s * 0.17 * t.k + 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = b.dark; ctx.lineWidth = 1; ctx.stroke();
    }
    if (tier >= 2) { ctx.strokeStyle = '#4a9de8aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.3); ctx.quadraticCurveTo(0, s * 0.42, s * 0.45, s * 0.3); ctx.stroke(); }
  },
  oil_grit(ctx, s, b, tier) {
    ctx.fillStyle = '#5a5a5a'; ctx.fillRect(-s * 0.38, -s * 0.38, s * 0.76, s * 0.76);
    ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.strokeRect(-s * 0.38, -s * 0.38, s * 0.76, s * 0.76);
    ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.15, i * s * 0.08); ctx.lineTo(s * 0.15, i * s * 0.08); ctx.stroke(); }
    if (tier >= 1) { ctx.strokeStyle = b.color; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.3); ctx.lineTo(-s * 0.1, -s * 0.3); ctx.stroke(); }
    if (tier >= 2) { ctx.fillStyle = '#e0e0a0'; ctx.fillRect(s * 0.18, -s * 0.32, s * 0.12, s * 0.2); }
  },
  sand_filter(ctx, s, b, tier) {
    ctx.fillStyle = '#4a4030'; ctx.fillRect(-s * 0.45, -s * 0.3, s * 0.9, s * 0.6);
    const bands = ['#e0c890', '#c8b078', '#a89060'];
    bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-s * 0.4, -s * 0.24 + i * s * 0.16, s * 0.8, s * 0.15); });
    ctx.strokeStyle = b.dark; ctx.lineWidth = 2; ctx.strokeRect(-s * 0.45, -s * 0.3, s * 0.9, s * 0.6);
    if (tier >= 1) { ctx.fillStyle = '#3a6a9a99'; ctx.fillRect(-s * 0.45, -s * 0.3, s * 0.18, s * 0.6); }
    if (tier >= 2) { ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-s * 0.4, -s * 0.24, s * 0.8, s * 0.05); }
  },
  wetland(ctx, s, b, tier) {
    ctx.fillStyle = '#1a4a6a55';
    ctx.beginPath(); ctx.ellipse(0, s * 0.04, s * 0.5, s * 0.28, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = b.dark; ctx.lineWidth = 1.5; ctx.stroke();
    const r = tier >= 2 ? 7 : 5;
    for (let i = 0; i < r; i++) {
      const px = -s * 0.32 + i * (s * 0.64 / (r - 1));
      const ph = s * (0.24 + Math.sin(i * 0.8) * 0.06);
      ctx.strokeStyle = i % 2 ? '#1a6a30' : '#2d8040'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, s * 0.08); ctx.lineTo(px, -ph); ctx.stroke();
      ctx.fillStyle = '#7a5a30'; ctx.beginPath(); ctx.ellipse(px, -ph, 2.2, 5, 0, 0, TAU); ctx.fill();
    }
    if (tier >= 1) { ctx.fillStyle = '#2a5a8a'; ctx.beginPath(); ctx.ellipse(-s * 0.38, s * 0.12, s * 0.1, s * 0.08, 0, 0, TAU); ctx.fill(); }
  },
};

/** Small canvas icon (for shop cards, guide, etc). */
export function bmpIcon(type, px = 40, tier = 0) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = px * dpr; c.height = px * dpr;
  c.style.width = px + 'px'; c.style.height = px + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  drawBmp(ctx, type, px / 2, px / 2 + 2, px * 0.95, tier, { bare: false });
  return c;
}

export function pollutantIcon(type, px = 32) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = px * dpr; c.height = px * dpr;
  c.style.width = px + 'px'; c.style.height = px + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const def = POLLUTANTS[type];
  const sz = Math.min(px * 0.32, def.size * (px / 34));
  drawPollutant(ctx, type, px / 2, px / 2, type === 'bacteria' ? sz * 0.8 : sz, 0.4);
  return c;
}
