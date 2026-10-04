// ================================================================
//  RENDERER — draws the game in "world" units (1600 × 900).
//
//  Performance design (so it runs on Chromebooks):
//   • The ground, channels and scenery are painted ONCE into an
//     offscreen "world" image, then copied into a screen-sized "view"
//     image only when the camera moves. Each frame is one straight
//     pixel copy of that view plus the moving things on top, on a
//     single opaque canvas (cheap to composite, even without a GPU).
//   • Every BMP and pollutant is a cached image (see sprites.js).
//   • The per-frame canvas is capped in resolution, and "Performance"
//     quality lowers that cap further.
//
//  Camera: zoom ≥ 1 (1 = whole map fits). Pinch, wheel, or the
//  on-screen buttons change it; drag pans when zoomed in.
// ================================================================
import { WORLD_W, WORLD_H, pointAt } from '../engine/geometry.js';
import { PATH_HALF } from '../engine/game.js';
import { BMPS, statsAt } from '../data/bmps.js';
import { POLLUTANTS } from '../data/pollutants.js';
import { stampPollutant, stampBmp, stampCustom } from './sprites.js';
import { mulberry32, hashSeed } from '../engine/rng.js';

const TAU = Math.PI * 2;

const THEMES = {
  construction: { base: '#2e1e0c', edge: '#1e2e0e', tint: '#3a2810' },
  farm:         { base: '#1a3010', edge: '#14260c', tint: '#22401a' },
  split:        { base: '#1e2a10', edge: '#14200c', tint: '#2a2410' },
  pond:         { base: '#141c0c', edge: '#0e1408', tint: '#1e2a14' },
  urban:        { base: '#22252a', edge: '#1a1c20', tint: '#2c3036' },
  forest:       { base: '#12260e', edge: '#0c1a0a', tint: '#1a3414' },
};

// Pixel budgets (device pixels) for each quality level.
const QUALITY = {
  high: { fx: 2.2e6, bg: 4.2e6, maxDpr: 2, particles: 300, shake: 1 },
  low:  { fx: 0.9e6, bg: 1.6e6, maxDpr: 1.25, particles: 90, shake: 0.5 },
};

/** Paint the static world (ground, scenery, creek, channels) in world units. */
function paintWorld(ctx, g) {
  const map = g.map;
  const theme = THEMES[map.theme] || THEMES.construction;
  const rnd = mulberry32(hashSeed(map.id));
  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = (i % 2 ? theme.tint : theme.edge) + '55';
    ctx.beginPath();
    ctx.ellipse(rnd() * WORLD_W, rnd() * map.creekY, 40 + rnd() * 120, 20 + rnd() * 60, rnd() * 3, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = '#ffffff0a'; ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const y = 60 + i * (map.creekY - 60) / 9;
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= WORLD_W; x += 80) ctx.lineTo(x, y + Math.sin(x / 210 + i) * 14);
    ctx.stroke();
  }
  for (const d of map.decor) drawDecor(ctx, d, rnd);

  const cy = map.creekY;
  const grad = ctx.createLinearGradient(0, cy, 0, WORLD_H);
  grad.addColorStop(0, '#2a6a9a'); grad.addColorStop(1, '#16405e');
  ctx.fillStyle = '#3a2a1a'; ctx.fillRect(0, cy - 10, WORLD_W, 14);
  ctx.fillStyle = grad; ctx.fillRect(0, cy, WORLD_W, WORLD_H - cy);
  ctx.fillStyle = '#7ac0f0aa'; ctx.fillRect(0, cy, WORLD_W, 4);
  for (const p of g.paths) drawPathStatic(ctx, g, p);

  // Creek label in the widest gap between channel outlets
  const outs = g.paths.map(p => p.pts[p.pts.length - 1].x).sort((a, b) => a - b);
  const edges = [0, ...outs, WORLD_W];
  let gx = WORLD_W / 2, best = 0;
  for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > best) { best = edges[i] - edges[i - 1]; gx = (edges[i] + edges[i - 1]) / 2; }
  ctx.font = '600 22px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = '#0d2a40'; ctx.strokeText(map.creekLabel, gx, cy + (WORLD_H - cy) * 0.55);
  ctx.fillStyle = '#9ad0ff'; ctx.fillText(map.creekLabel, gx, cy + (WORLD_H - cy) * 0.55);
}

function drawDecor(ctx, d, rnd) {
  if (d.type === 'trees') {
    for (let i = 0; i < d.n; i++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * d.r;
      const x = d.x + Math.cos(a) * r, y = d.y + Math.sin(a) * r, s = 12 + rnd() * 12;
      ctx.fillStyle = '#0a1a08'; ctx.beginPath(); ctx.arc(x + 3, y + 4, s, 0, TAU); ctx.fill();
      ctx.fillStyle = rnd() > 0.5 ? '#2a5a22' : '#1f4a1a'; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff10'; ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.3, s * 0.4, 0, TAU); ctx.fill();
    }
  } else if (d.type === 'rows') {
    ctx.strokeStyle = '#3a6a2a55'; ctx.lineWidth = 3;
    for (let y = d.y + 10; y < d.y + d.h; y += 34) {
      ctx.beginPath(); ctx.moveTo(d.x, y); ctx.lineTo(d.x + d.w, y); ctx.stroke();
    }
  } else if (d.type === 'gravel') {
    ctx.fillStyle = '#4a3a2244'; ctx.fillRect(d.x, d.y, d.w, d.h);
    for (let i = 0; i < d.w * d.h / 900; i++) {
      ctx.fillStyle = rnd() > 0.5 ? '#6a5a4255' : '#2a1a0a55';
      ctx.fillRect(d.x + rnd() * d.w, d.y + rnd() * d.h, 3, 3);
    }
  } else if (d.type === 'building') {
    ctx.fillStyle = '#00000055'; ctx.fillRect(d.x + 6, d.y + 6, d.w, d.h);
    ctx.fillStyle = '#5a5a62'; ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeStyle = '#7a7a82'; ctx.lineWidth = 2; ctx.strokeRect(d.x, d.y, d.w, d.h);
  } else if (d.type === 'label') {
    ctx.fillStyle = '#ffffff40'; ctx.font = '600 20px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.text, d.x, d.y);
  } else if (d.type === 'pond') {
    ctx.fillStyle = '#5a4026';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx + 16, d.ry + 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1e4a6a';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a7aaa'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx * 0.7, d.ry * 0.6, 0, 0, TAU); ctx.stroke();
    if (d.label) {
      ctx.fillStyle = '#9ad0ffcc'; ctx.font = '600 20px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.label, d.x, d.y);
    }
  }
}

function tracePath(ctx, p) {
  ctx.beginPath();
  ctx.moveTo(p.pts[0].x, p.pts[0].y);
  for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i].x, p.pts[i].y);
}

function drawPathStatic(ctx, g, p) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (p.status === 'open') {
    ctx.strokeStyle = '#1a120a'; ctx.lineWidth = PATH_HALF * 2 + 10; tracePath(ctx, p); ctx.stroke();
    ctx.strokeStyle = (p.color || '#8a6a3a'); ctx.lineWidth = PATH_HALF * 2 + 4; tracePath(ctx, p); ctx.stroke();
    ctx.strokeStyle = '#4a5a52'; ctx.lineWidth = PATH_HALF * 2 - 6; tracePath(ctx, p); ctx.stroke();
    ctx.strokeStyle = '#5a6a60'; ctx.lineWidth = PATH_HALF; tracePath(ctx, p); ctx.stroke();
    ctx.fillStyle = '#ffffff30';
    for (let i = 1; i < p.pts.length; i++) {
      const a = p.pts[i - 1], b = p.pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      for (let d = 60; d < len - 30; d += 140) {
        const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    if (p.label && !p.breachable) {
      const s = p.pts[0];
      ctx.fillStyle = '#f0c070'; ctx.font = '600 18px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.label, Math.min(WORLD_W - 120, Math.max(120, s.x)), Math.max(18, s.y + (s.y < 30 ? 16 : -26)));
    }
  } else if (p.status === 'closed' && !p.breachable) {
    ctx.setLineDash([16, 12]);
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = PATH_HALF * 2 - 4; tracePath(ctx, p); ctx.stroke();
    ctx.setLineDash([]);
    const s = p.pts[0];
    ctx.fillStyle = '#ffffff88'; ctx.font = '600 18px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${p.label || 'CHANNEL'} — OPENS WAVE ${p.opensAtWave}`, Math.min(WORLD_W - 200, Math.max(200, s.x)), Math.max(20, s.y + 18));
  } else {
    // A breachable channel that isn't flowing: a faint gully to plan around
    ctx.setLineDash([4, 14]);
    ctx.strokeStyle = p.status === 'repaired' ? '#ffffff12' : '#ffffff26';
    ctx.lineWidth = 6; tracePath(ctx, p); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (p.breachable || (g.map.breach && p.idx === 0)) drawWallMarker(ctx, p, false, 0);
}

function drawWallMarker(ctx, p, dynamic, t) {
  const s = p.pts[0], n = p.pts[1];
  const ang = Math.atan2(n.y - s.y, n.x - s.x) + Math.PI / 2;
  const st = p.status;
  if (dynamic && st !== 'stressed') return;
  if (!dynamic && st === 'stressed') return;
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang);
  if (st === 'open') {
    ctx.fillStyle = '#e05050'; ctx.fillRect(-22, -6, 10, 12); ctx.fillRect(12, -6, 10, 12);
  } else if (st === 'repaired') {
    ctx.fillStyle = '#9a9aa8'; ctx.fillRect(-24, -7, 48, 14);
    ctx.fillStyle = '#6a6a78'; for (let i = -20; i < 20; i += 9) { ctx.beginPath(); ctx.arc(i + 4, 0, 4, 0, TAU); ctx.fill(); }
  } else if (st === 'stressed') {
    const k = (Math.sin(t * 6) + 1) / 2;
    ctx.fillStyle = `rgba(240,${120 + k * 60},40,${0.6 + k * 0.4})`; ctx.fillRect(-24, -7, 48, 14);
    ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(-2, 0); ctx.lineTo(-8, 7); ctx.moveTo(6, -7); ctx.lineTo(10, 0); ctx.stroke();
  } else {
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-24, -7, 48, 14);
  }
  ctx.restore();
}

export class Renderer {
  /** Draw a small preview image of a map onto a canvas. */
  static thumbnail(canvas, game, w = 320, h = 180) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    const theme = THEMES[game.map.theme] || THEMES.construction;
    ctx.fillStyle = theme.edge; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const k = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H);
    ctx.setTransform(k, 0, 0, k, (canvas.width - WORLD_W * k) / 2, (canvas.height - WORLD_H * k) / 2);
    paintWorld(ctx, game);
  }

  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.stage = canvas.parentElement;
    this.game = game;
    // Screen-sized background view + the painted world it shows
    this.bg = document.createElement('canvas');
    this.bctx = this.bg.getContext('2d', { alpha: false });
    this.world = document.createElement('canvas');
    this.wctx = this.world.getContext('2d');
    this.bgF = 0;
    this.viewDirty = true;
    // Red vignette when pollution reaches the creek (CSS, so it's free)
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'leak-flash';
    this.stage.append(this.flashEl);

    this.quality = 'high';
    this.dirty = true;
    this.effects = { particles: [], floats: [], rings: [] };
    this.textCache = new Map();
    this.shake = 0;
    this.leakFlash = 0;
    this.shownFlash = 0;
    this.t = 0;
    this.ghost = null;          // { type, x, y, ok }
    this.selectedTower = null;  // tower object
    this.selectedPath = null;   // path id
    this.zoom = 1; this.cx = WORLD_W / 2; this.cy = WORLD_H / 2;
    this.onCamera = null;
    this.resize(true);
  }

  get reducedEffects() { return this.quality === 'low'; }
  set reducedEffects(v) { this.setQuality(v ? 'low' : 'high'); }
  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.textCache.clear();
    this.bgF = 0;
    this.resize(true);
  }

  destroy() {
    clearTimeout(this._bgTimer);
    this.flashEl.remove();
    this.bg.width = this.bg.height = this.world.width = this.world.height = 0;
  }

  // ---------------------------------------------------------------- layout / camera
  resize(force = false) {
    const r = this.stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (!force && w === this.cssW && h === this.cssH) return;
    this.cssW = w; this.cssH = h;
    const Q = QUALITY[this.quality];
    const want = Math.min(Q.maxDpr, window.devicePixelRatio || 1);
    const budget = Math.sqrt(Q.fx / (w * h));
    this.dpr = Math.max(Math.min(1, want), Math.min(want, budget));
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.bg.width = this.canvas.width; this.bg.height = this.canvas.height;
    this.layout();
  }

  get fitScale() { return Math.min(this.cssW / WORLD_W, this.cssH / WORLD_H); }
  /** Max zoom: roughly 1.6 screen px per world unit, at least 2×. */
  get maxZoom() { return Math.min(5, Math.max(2, 1.6 / this.fitScale)); }

  bgFactor() {
    const Q = QUALITY[this.quality];
    return Math.min(Math.sqrt(Q.bg / (WORLD_W * WORLD_H)), this.scale * (window.devicePixelRatio || 1));
  }

  layout() {
    this.scale = this.fitScale * this.zoom;
    const halfW = this.cssW / (2 * this.scale), halfH = this.cssH / (2 * this.scale);
    this.cx = halfW * 2 >= WORLD_W ? WORLD_W / 2 : Math.max(halfW, Math.min(WORLD_W - halfW, this.cx));
    this.cy = halfH * 2 >= WORLD_H ? WORLD_H / 2 : Math.max(halfH, Math.min(WORLD_H - halfH, this.cy));
    this.offX = this.cssW / 2 - this.cx * this.scale;
    this.offY = this.cssH / 2 - this.cy * this.scale;
    this.viewDirty = true;
    // Repaint the background sharper (or smaller) once zooming settles
    const f = this.bgFactor();
    if (!this.bgF) this.dirty = true;
    else if (f > this.bgF * 1.15 || f < this.bgF * 0.6) {
      clearTimeout(this._bgTimer);
      this._bgTimer = setTimeout(() => { this.dirty = true; }, 160);
    }
    this.onCamera?.();
  }

  /** Copy the visible part of the painted world onto the background canvas. */
  drawView() {
    const ctx = this.bctx, theme = THEMES[this.game.map.theme] || THEMES.construction;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.edge;
    ctx.fillRect(0, 0, this.bg.width, this.bg.height);
    const k = this.scale * this.dpr;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(this.world, this.offX * this.dpr, this.offY * this.dpr, WORLD_W * k, WORLD_H * k);
    this.viewDirty = false;
  }

  zoomAt(px, py, factor) {
    const w = this.toWorld(px, py);
    const z = Math.max(1, Math.min(this.maxZoom, this.zoom * factor));
    if (z === this.zoom) return;
    this.zoom = z;
    const s = this.fitScale * z;
    this.cx = w.x - (px - this.cssW / 2) / s;
    this.cy = w.y - (py - this.cssH / 2) / s;
    this.layout();
  }
  panBy(dx, dy) {
    if (this.zoom <= 1) return;
    this.cx -= dx / this.scale; this.cy -= dy / this.scale;
    this.layout();
  }
  resetView() { this.zoom = 1; this.cx = WORLD_W / 2; this.cy = WORLD_H / 2; this.layout(); }

  /** CSS pixel (relative to canvas) → world coordinates. */
  toWorld(px, py) { return { x: (px - this.offX) / this.scale, y: (py - this.offY) / this.scale }; }
  /** World → CSS pixel (relative to canvas). */
  toScreen(x, y) { return { x: x * this.scale + this.offX, y: y * this.scale + this.offY }; }

  worldTransform(ctx) {
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, this.offX * this.dpr, this.offY * this.dpr);
  }

  // ---------------------------------------------------------------- static layer
  drawStatic() {
    const f = this.bgFactor();
    const theme = THEMES[this.game.map.theme] || THEMES.construction;
    this.stage.style.background = theme.edge;
    const W = Math.round(WORLD_W * f), H = Math.round(WORLD_H * f);
    if (this.world.width !== W || this.world.height !== H) { this.world.width = W; this.world.height = H; }
    const ctx = this.wctx;
    ctx.setTransform(W / WORLD_W, 0, 0, H / WORLD_H, 0, 0);
    paintWorld(ctx, this.game);
    this.bgF = f;
    this.dirty = false;
    this.viewDirty = true;
  }

  // ---------------------------------------------------------------- events → effects
  handleEvent(ev) {
    const fx = this.effects;
    const lite = this.reducedEffects;
    switch (ev.type) {
      case 'kill':
        this.burst(ev.x, ev.y, POLLUTANTS[ev.ptype]?.color || '#ffffff', lite ? 3 : 7, 1);
        if (!lite) this.burst(ev.x, ev.y, ev.color, 4, 0.8);
        this.float(ev.x, ev.y - 10, '+$' + ev.reward, '#f0c040', 18, 0.9, -40);
        break;
      case 'split':
        this.burst(ev.x, ev.y, '#ffffff', ev.big ? 14 : 6, ev.big ? 1.8 : 1);
        if (ev.big) fx.rings.push({ x: ev.x, y: ev.y, r: 10, max: 90, color: '#3a8ae8', life: 1 });
        break;
      case 'pulse':
        fx.rings.push({ x: ev.tower.x, y: ev.tower.y, r: 10, max: ev.range, color: BMPS[ev.tower.type].color, life: 1, fill: true });
        break;
      case 'leak':
        this.leakFlash = Math.min(1, this.leakFlash + 0.35 + ev.dmg * 0.04);
        this.shake = Math.min(10, this.shake + 2 + ev.dmg * 0.5);
        this.burst(ev.x, this.game.map.creekY + 8, '#e05050', 10, 1.4);
        this.float(ev.x, this.game.map.creekY - 10, '−' + ev.dmg, '#ff7070', 24, 1.1, -30);
        break;
      case 'resist':
        if (fx.floats.length < 30) this.float(ev.x, ev.y - 18, 'passes through', '#b0b8c0', 13, 1.1, -18, true);
        break;
      case 'placed':
        fx.rings.push({ x: ev.tower.x, y: ev.tower.y, r: 6, max: 50, color: '#f0c040', life: 0.7 });
        break;
      case 'upgraded':
        fx.rings.push({ x: ev.tower.x, y: ev.tower.y, r: 6, max: statsAt(ev.tower.type, ev.tower.tier).range, color: '#f0c040', life: 1 });
        this.burst(ev.tower.x, ev.tower.y, '#f0c040', 12, 1.2);
        break;
      case 'cleaned':
        this.float(ev.tower.x, ev.tower.y - 30, 'Cleaned!', '#9ad0ff', 15, 1, -24);
        break;
      case 'clogged':
        this.float(ev.tower.x, ev.tower.y - 34, 'CLOGGED', '#f0a830', 16, 1.6, -16);
        break;
      case 'breach':
        this.shake = 14; this.dirty = true;
        this.burst(ev.path.pts[0].x, ev.path.pts[0].y, '#4a9de8', 20, 2);
        fx.rings.push({ x: ev.path.pts[0].x, y: ev.path.pts[0].y, r: 10, max: 140, color: '#e05050', life: 1.2 });
        break;
      case 'repaired': case 'reinforced':
        this.dirty = true;
        this.burst(ev.path.pts[0].x, ev.path.pts[0].y, '#b0b0c0', 12, 1.2);
        break;
      case 'pathOpened': case 'sold': case 'breachWarning':
        this.dirty = true;
        break;
    }
  }

  float(x, y, text, color, size, life, vy, italic = false) {
    if (this.effects.floats.length > 40) this.effects.floats.shift();
    this.effects.floats.push({ x, y, text, color, size, life, vy, italic });
  }

  burst(x, y, color, n, power) {
    if (this.effects.particles.length > QUALITY[this.quality].particles) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (30 + Math.random() * 90) * power;
      this.effects.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.5 + Math.random() * 0.5, r: 1.5 + Math.random() * 2.5 * power, color });
    }
  }

  updateEffects(dt) {
    const fx = this.effects;
    this.t += dt;
    if (fx.particles.length) fx.particles = fx.particles.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.vx *= 0.97; p.life -= dt * 1.6; return p.life > 0; });
    if (fx.floats.length) fx.floats = fx.floats.filter(f => { f.y += f.vy * dt; f.life -= dt; return f.life > 0; });
    if (fx.rings.length) fx.rings = fx.rings.filter(r => { r.r += (r.max - r.r) * Math.min(1, dt * 6); r.life -= dt * 1.4; return r.life > 0; });
    this.shake = Math.max(0, this.shake - dt * 30);
    this.leakFlash = Math.max(0, this.leakFlash - dt * 1.5);
  }

  /** Cached image of a floating text label. */
  textSprite(text, color, size, italic, k) {
    const key = `${text}|${color}|${size}|${italic}|${k}`;
    let s = this.textCache.get(key);
    if (s) return s;
    if (this.textCache.size > 200) this.textCache.clear();
    const font = `${italic ? 'italic ' : ''}600 ${size}px Oswald, sans-serif`;
    const m = this.ctx; m.save(); m.font = font; const tw = m.measureText(text).width; m.restore();
    const w = tw + 10, h = size * 1.5;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
    const x = c.getContext('2d');
    x.scale(c.width / w, c.height / h);
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 4; x.strokeStyle = '#000000aa'; x.strokeText(text, w / 2, h / 2);
    x.fillStyle = color; x.fillText(text, w / 2, h / 2);
    s = { c, w, h };
    this.textCache.set(key, s);
    return s;
  }

  // ---------------------------------------------------------------- frame
  draw() {
    if (this.dirty) this.drawStatic();
    if (this.viewDirty) this.drawView();
    const ctx = this.ctx, g = this.game;
    const sh = this.shake * QUALITY[this.quality].shake;
    // Whole-pixel shake so the background copy stays a straight blit
    const shx = sh > 0.3 ? Math.round((Math.random() - 0.5) * sh * this.dpr) / this.dpr : 0;
    const shy = sh > 0.3 ? Math.round((Math.random() - 0.5) * sh * this.dpr) / this.dpr : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (shx || shy) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    ctx.drawImage(this.bg, shx * this.dpr, shy * this.dpr);
    const k = this.scale * this.dpr;
    const ox = (this.offX + shx) * this.dpr, oy = (this.offY + shy) * this.dpr;
    const world = () => ctx.setTransform(k, 0, 0, k, ox, oy);
    const device = () => ctx.setTransform(1, 0, 0, 1, 0, 0);
    world();
    const t = this.t;

    // Flowing water: little flecks moving down every open channel
    ctx.fillStyle = '#a8d4f088';
    ctx.beginPath();
    const phase = (t * 45) % 36;
    for (const p of g.paths) {
      if (p.status !== 'open') continue;
      for (let d = phase; d < p.length; d += 36) { const q = pointAt(p, d); ctx.rect(q.x - 2, q.y - 2, 4, 4); }
    }
    ctx.fill();

    // Stressed walls + seepage
    for (const p of g.paths) {
      if (p.status !== 'stressed') continue;
      ctx.setLineDash([8, 10]); ctx.lineDashOffset = -t * 30;
      ctx.strokeStyle = `rgba(240,160,48,${0.35 + 0.25 * Math.sin(t * 5)})`; ctx.lineWidth = 8;
      tracePath(ctx, p); ctx.stroke(); ctx.setLineDash([]);
      drawWallMarker(ctx, p, true, t);
      const s = p.pts[0];
      ctx.fillStyle = '#f0a830'; ctx.font = '600 18px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚠ SEEPAGE', s.x, s.y + (s.y < 120 ? -22 : 26));
    }
    if (this.selectedPath) {
      const p = g.pathById[this.selectedPath];
      if (p) { ctx.strokeStyle = '#f0c04088'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); tracePath(ctx, p); ctx.stroke(); ctx.setLineDash([]); }
    }

    // Creek health tint
    const hpFrac = g.hp / g.maxHp;
    if (hpFrac < 1) {
      ctx.fillStyle = `rgba(110,80,40,${(1 - hpFrac) * 0.55})`;
      ctx.fillRect(0, g.map.creekY, WORLD_W, WORLD_H - g.map.creekY);
    }

    const sel = this.selectedTower;
    if (sel && g.towers.includes(sel)) this.drawRange(ctx, sel.x, sel.y, statsAt(sel.type, sel.tier).range, '#f0c040');

    // Towers: sprites (device pixels), then meters/badges (world units)
    device();
    for (const tw of g.towers) {
      const age = g.time - tw.placedAt;
      stampBmp(ctx, tw.type, tw.x * k + ox, tw.y * k + oy, tw.tier, k, age < 0.25 && age >= 0 ? 0.7 + age * 1.2 : 1);
    }
    world();
    for (const tw of g.towers) this.drawTowerOverlay(ctx, tw);
    device();
    for (const tw of g.towers) {
      const b = BMPS[tw.type];
      if (tw.fill / statsAt(tw.type, tw.tier).capacity < 0.75) continue;
      ctx.globalAlpha = 0.6 + 0.4 * (Math.sin(t * 6) + 1) / 2;
      stampCustom(ctx, 'wrench', 11, k, wrenchBadge, (tw.x + b.size) * k + ox, (tw.y - b.size * 0.85) * k + oy);
    }
    ctx.globalAlpha = 1;
    world();

    // Beams
    if (g.phase === 'wave') {
      let byId = null;
      ctx.lineWidth = 3;
      for (const tw of g.towers) {
        if (!tw.beams || !tw.beams.length) continue;
        byId = byId || new Map(g.enemies.map(e => [e.id, e]));
        const b = BMPS[tw.type];
        ctx.strokeStyle = b.color; ctx.fillStyle = b.color;
        for (const id of tw.beams) {
          const e = byId.get(id); if (!e) continue;
          ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 20);
          ctx.beginPath(); ctx.moveTo(tw.x, tw.y - 6); ctx.lineTo(e.x, e.y); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, TAU); ctx.fill();
        }
      }
    }

    // Rings
    for (const r of this.effects.rings) {
      ctx.globalAlpha = Math.max(0, r.life) * 0.8;
      ctx.strokeStyle = r.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
      if (r.fill) { ctx.globalAlpha = Math.max(0, r.life) * 0.12; ctx.fillStyle = r.color; ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    // Pollutants: "slowed" rings, sprites, then health bars (batched)
    const enemies = g.enemies;
    ctx.strokeStyle = '#9a8fd099'; ctx.lineWidth = 2;
    ctx.beginPath();
    let anySlow = false;
    for (const e of enemies) if (e.alive && e.slow < 1) { const r = Math.max(e.def.size * 1.35, 10.5) + 4; ctx.moveTo(e.x + r, e.y); ctx.arc(e.x, e.y, r, 0, TAU); anySlow = true; }
    if (anySlow) ctx.stroke();
    device();
    for (const e of enemies) if (e.alive) stampPollutant(ctx, e.type, e.x * k + ox, e.y * k + oy, e.def.size, k, t + e.wobble, e.hit > 0);
    world();
    const bars = [];
    for (const e of enemies) if (e.alive && e.hp < e.maxHp) bars.push(e);
    if (bars.length) {
      const top = e => e.y - Math.max(e.def.size * 1.35, 10.5) - 9;
      ctx.fillStyle = '#000000aa';
      ctx.beginPath();
      for (const e of bars) { const w = Math.max(20, e.def.size * 2.6); ctx.rect(e.x - w / 2, top(e), w, 5); }
      ctx.fill();
      for (const [col, lo, hi] of [['#5cb85c', 0.6, 2], ['#f0a830', 0.3, 0.6], ['#e05050', -1, 0.3]]) {
        ctx.fillStyle = col; ctx.beginPath(); let any = false;
        for (const e of bars) {
          const f = Math.max(0, e.hp / e.maxHp); if (f <= lo || f > hi) continue;
          const w = Math.max(20, e.def.size * 2.6);
          ctx.rect(e.x - w / 2, top(e), w * f, 5); any = true;
        }
        if (any) ctx.fill();
      }
    }

    // Particles
    for (const p of this.effects.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;

    // Floating text (cached images)
    const tk = Math.round(k * 32) / 32;
    device();
    for (const f of this.effects.floats) {
      const s = this.textSprite(f.text, f.color, f.size, f.italic, tk);
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5));
      ctx.drawImage(s.c, Math.round(f.x * k + ox - s.c.width / 2), Math.round(f.y * k + oy - s.c.height / 2));
    }
    ctx.globalAlpha = 1;
    world();

    // Placement ghost
    if (this.ghost) {
      const gh = this.ghost, b = BMPS[gh.type];
      if (b.onPath) {
        ctx.strokeStyle = '#9a8fd066'; ctx.lineWidth = PATH_HALF * 2 + 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const p of g.paths) if (p.status === 'open') { tracePath(ctx, p); ctx.stroke(); }
      }
      this.drawRange(ctx, gh.x, gh.y, b.range, gh.ok ? '#5cb85c' : '#e05050');
      ctx.globalAlpha = 0.8;
      device(); stampBmp(ctx, gh.type, gh.x * k + ox, gh.y * k + oy, 0, k); world();
      ctx.globalAlpha = 1;
      if (!gh.ok) {
        ctx.strokeStyle = '#e05050'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(gh.x - 14, gh.y - 14); ctx.lineTo(gh.x + 14, gh.y + 14); ctx.moveTo(gh.x + 14, gh.y - 14); ctx.lineTo(gh.x - 14, gh.y + 14); ctx.stroke();
      }
    }

    // Leak flash (a CSS overlay; only touch the DOM when it changes)
    const lf = Math.round(this.leakFlash * 20) / 20;
    if (lf !== this.shownFlash) { this.shownFlash = lf; this.flashEl.style.opacity = String(lf * 0.9); }
  }

  drawRange(ctx, x, y, r, color) {
    ctx.fillStyle = color + '18';
    ctx.strokeStyle = color + 'aa'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }

  drawTowerOverlay(ctx, tw) {
    const b = BMPS[tw.type];
    if (tw === this.selectedTower) {
      ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tw.x, tw.y, b.size * 1.35, 0, TAU); ctx.stroke();
    }
    // Sediment fill meter
    const f = tw.fill / statsAt(tw.type, tw.tier).capacity;
    if (f > 0.35) {
      const w = b.size * 1.6, y = tw.y + b.size * 1.05;
      ctx.fillStyle = '#000000aa'; ctx.fillRect(tw.x - w / 2, y, w, 6);
      ctx.fillStyle = f >= 0.98 ? '#e05050' : f >= 0.75 ? '#f0a830' : '#a08050';
      ctx.fillRect(tw.x - w / 2, y, w * Math.min(1, f), 6);
    }
  }

  // ---------------------------------------------------------------- hit tests (world coords)
  /** Minimum touch radius in world units, so small things stay tappable when zoomed out. */
  touchPad(px = 22) { return px / this.scale; }

  towerAt(x, y) {
    let best = null, bd = Infinity;
    for (const t of this.game.towers) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < Math.max(BMPS[t.type].size + 10, this.touchPad(20)) && d < bd) { bd = d; best = t; }
    }
    return best;
  }

  enemyAt(x, y) {
    let best = null, bd = Math.max(28, this.touchPad(24));
    for (const e of this.game.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  wallAt(x, y) {
    if (!this.game.map.breach) return null;
    for (const p of this.game.paths) {
      const s = p.pts[0];
      if (Math.hypot(s.x - x, s.y - y) < Math.max(40, this.touchPad(26))) return p;
    }
    return null;
  }
}

/** Little amber "needs maintenance" badge with a wrench. */
function wrenchBadge(ctx) {
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU);
  ctx.fillStyle = '#f0a830'; ctx.fill(); ctx.strokeStyle = '#3a2400'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.save(); ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#2a1a00';
  ctx.fillRect(-1.6, -2, 3.2, 9);
  ctx.beginPath(); ctx.arc(0, -4, 3.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f0a830'; ctx.fillRect(-1.3, -8.5, 2.6, 4.5);
  ctx.restore();
}
