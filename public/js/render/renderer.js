// ================================================================
//  RENDERER — draws the game. Works in "world" units (1600 × 900)
//  and scales to whatever screen it's on, with crisp high-DPI output.
// ================================================================
import { WORLD_W, WORLD_H } from '../engine/geometry.js';
import { PATH_HALF } from '../engine/game.js';
import { BMPS, statsAt } from '../data/bmps.js';
import { POLLUTANTS } from '../data/pollutants.js';
import { drawPollutant, drawBmp } from './sprites.js';
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

export class Renderer {
  /** Draw a small preview image of a map onto a canvas. */
  static thumbnail(canvas, game, w = 320, h = 180) {
    const r = Object.create(Renderer.prototype);
    r.canvas = canvas; r.ctx = canvas.getContext('2d'); r.game = game;
    r.static = document.createElement('canvas'); r.sctx = r.static.getContext('2d');
    r.t = 0;
    r.resize(w, h);
    r.drawStatic();
    r.ctx.drawImage(r.static, 0, 0);
    canvas.style.width = ''; canvas.style.height = '';
  }

  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.static = document.createElement('canvas');
    this.sctx = this.static.getContext('2d');
    this.dirty = true;
    this.effects = { particles: [], floats: [], rings: [], marks: [] };
    this.shake = 0;
    this.leakFlash = 0;
    this.t = 0;
    this.ghost = null;          // { type, x, y, ok }
    this.selectedTower = null;  // tower object
    this.selectedPath = null;   // path id
    this.reducedEffects = false;
    this.resize();
  }

  // ---------------------------------------------------------------- layout
  resize(fixedW, fixedH) {
    const r = fixedW ? { width: fixedW, height: fixedH } : this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cssW = Math.max(1, r.width); this.cssH = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.canvas.style.width = this.cssW + 'px';
    this.canvas.style.height = this.cssH + 'px';
    this.scale = Math.min(this.cssW / WORLD_W, this.cssH / WORLD_H);
    this.offX = (this.cssW - WORLD_W * this.scale) / 2;
    this.offY = (this.cssH - WORLD_H * this.scale) / 2;
    this.static.width = this.canvas.width;
    this.static.height = this.canvas.height;
    this.dirty = true;
  }

  /** CSS pixel (relative to canvas) → world coordinates. */
  toWorld(px, py) {
    return { x: (px - this.offX) / this.scale, y: (py - this.offY) / this.scale };
  }
  /** World → CSS pixel (relative to canvas). */
  toScreen(x, y) {
    return { x: x * this.scale + this.offX, y: y * this.scale + this.offY };
  }

  worldTransform(ctx) {
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, this.offX * this.dpr, this.offY * this.dpr);
  }

  // ---------------------------------------------------------------- static layer
  drawStatic() {
    const ctx = this.sctx, g = this.game, map = g.map;
    const theme = THEMES[map.theme] || THEMES.construction;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.edge;
    ctx.fillRect(0, 0, this.static.width, this.static.height);
    this.worldTransform(ctx);
    const rnd = mulberry32(hashSeed(map.id));

    // Ground
    ctx.fillStyle = theme.base;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // Soft texture blotches
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = (i % 2 ? theme.tint : theme.edge) + '55';
      ctx.beginPath();
      ctx.ellipse(rnd() * WORLD_W, rnd() * map.creekY, 40 + rnd() * 120, 20 + rnd() * 60, rnd() * 3, 0, TAU);
      ctx.fill();
    }
    // Contour lines (slope)
    ctx.strokeStyle = '#ffffff0a'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const y = 60 + i * (map.creekY - 60) / 9;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= WORLD_W; x += 80) ctx.lineTo(x, y + Math.sin(x / 210 + i) * 14);
      ctx.stroke();
    }

    for (const d of map.decor) this.drawDecor(ctx, d, rnd);

    // Creek
    const cy = map.creekY;
    const grad = ctx.createLinearGradient(0, cy, 0, WORLD_H);
    grad.addColorStop(0, '#2a6a9a'); grad.addColorStop(1, '#16405e');
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(0, cy - 10, WORLD_W, 14);
    ctx.fillStyle = grad; ctx.fillRect(0, cy, WORLD_W, WORLD_H - cy);
    ctx.fillStyle = '#7ac0f0aa'; ctx.fillRect(0, cy, WORLD_W, 4);
    // Paths
    for (const p of g.paths) this.drawPathStatic(ctx, p);

    // Creek label (after paths so it stays readable), placed in the
    // widest gap between channel outlets.
    const outs = g.paths.map(p => p.pts[p.pts.length - 1].x).sort((a, b) => a - b);
    const edges = [0, ...outs, WORLD_W];
    let gx = WORLD_W / 2, best = 0;
    for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > best) { best = edges[i] - edges[i - 1]; gx = (edges[i] + edges[i - 1]) / 2; }
    ctx.font = '600 22px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#0d2a40'; ctx.strokeText(map.creekLabel, gx, cy + (WORLD_H - cy) * 0.55);
    ctx.fillStyle = '#9ad0ff'; ctx.fillText(map.creekLabel, gx, cy + (WORLD_H - cy) * 0.55);

    this.dirty = false;
  }

  drawDecor(ctx, d, rnd) {
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

  tracePath(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p.pts[0].x, p.pts[0].y);
    for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i].x, p.pts[i].y);
  }

  drawPathStatic(ctx, p) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (p.status === 'open') {
      ctx.strokeStyle = '#1a120a'; ctx.lineWidth = PATH_HALF * 2 + 10; this.tracePath(ctx, p); ctx.stroke();
      ctx.strokeStyle = (p.color || '#8a6a3a'); ctx.lineWidth = PATH_HALF * 2 + 4; this.tracePath(ctx, p); ctx.stroke();
      ctx.strokeStyle = '#4a5a52'; ctx.lineWidth = PATH_HALF * 2 - 6; this.tracePath(ctx, p); ctx.stroke();
      ctx.strokeStyle = '#5a6a60'; ctx.lineWidth = PATH_HALF; this.tracePath(ctx, p); ctx.stroke();
      // Direction chevrons
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
      ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = PATH_HALF * 2 - 4; this.tracePath(ctx, p); ctx.stroke();
      ctx.setLineDash([]);
      const s = p.pts[0];
      ctx.fillStyle = '#ffffff88'; ctx.font = '600 18px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${p.label || 'CHANNEL'} — OPENS WAVE ${p.opensAtWave}`, Math.min(WORLD_W - 200, Math.max(200, s.x)), Math.max(20, s.y + 18));
    } else {
      // Breachable channel that isn't flowing: show a faint gully so
      // players can plan ahead.
      ctx.setLineDash([4, 14]);
      ctx.strokeStyle = p.status === 'repaired' ? '#ffffff12' : '#ffffff26';
      ctx.lineWidth = 6; this.tracePath(ctx, p); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.breachable || (this.game.map.breach && p.idx === 0)) this.drawWallMarker(ctx, p, false);
  }

  drawWallMarker(ctx, p, dynamic) {
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
      const k = (Math.sin(this.t * 6) + 1) / 2;
      ctx.fillStyle = `rgba(240,${120 + k * 60},40,${0.6 + k * 0.4})`; ctx.fillRect(-24, -7, 48, 14);
      ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(-2, 0); ctx.lineTo(-8, 7); ctx.moveTo(6, -7); ctx.lineTo(10, 0); ctx.stroke();
    } else {
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-24, -7, 48, 14);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- events → effects
  handleEvent(ev) {
    const fx = this.effects;
    const lite = this.reducedEffects;
    switch (ev.type) {
      case 'kill':
        this.burst(ev.x, ev.y, POLLUTANTS[ev.type].color, lite ? 3 : 7, 1);
        if (!lite) this.burst(ev.x, ev.y, ev.color, 4, 0.8);
        fx.floats.push({ x: ev.x, y: ev.y - 10, text: '+$' + ev.reward, color: '#f0c040', life: 0.9, vy: -40, size: 18 });
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
        fx.floats.push({ x: ev.x, y: this.game.map.creekY - 10, text: '−' + ev.dmg, color: '#ff7070', life: 1.1, vy: -30, size: 24 });
        break;
      case 'resist':
        fx.floats.push({ x: ev.x, y: ev.y - 18, text: 'passes through', color: '#b0b8c0', life: 1.1, vy: -18, size: 13, italic: true });
        break;
      case 'placed':
        fx.rings.push({ x: ev.tower.x, y: ev.tower.y, r: 6, max: 50, color: '#f0c040', life: 0.7 });
        break;
      case 'upgraded':
        fx.rings.push({ x: ev.tower.x, y: ev.tower.y, r: 6, max: statsAt(ev.tower.type, ev.tower.tier).range, color: '#f0c040', life: 1 });
        this.burst(ev.tower.x, ev.tower.y, '#f0c040', 12, 1.2);
        break;
      case 'cleaned':
        fx.floats.push({ x: ev.tower.x, y: ev.tower.y - 30, text: 'Cleaned!', color: '#9ad0ff', life: 1, vy: -24, size: 15 });
        break;
      case 'clogged':
        fx.floats.push({ x: ev.tower.x, y: ev.tower.y - 34, text: 'CLOGGED', color: '#f0a830', life: 1.6, vy: -16, size: 16 });
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
      case 'pathOpened': case 'sold':
        this.dirty = true;
        break;
    }
  }

  burst(x, y, color, n, power) {
    if (this.effects.particles.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (30 + Math.random() * 90) * power;
      this.effects.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.5 + Math.random() * 0.5, r: 2 + Math.random() * 3 * power, color });
    }
  }

  updateEffects(dt) {
    const fx = this.effects;
    this.t += dt;
    fx.particles = fx.particles.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.vx *= 0.97; p.life -= dt * 1.6; return p.life > 0; });
    fx.floats = fx.floats.filter(f => { f.y += f.vy * dt; f.life -= dt; return f.life > 0; });
    fx.rings = fx.rings.filter(r => { r.r += (r.max - r.r) * Math.min(1, dt * 6); r.life -= dt * 1.4; return r.life > 0; });
    this.shake = Math.max(0, this.shake - dt * 30);
    this.leakFlash = Math.max(0, this.leakFlash - dt * 1.5);
  }

  // ---------------------------------------------------------------- frame
  draw() {
    if (this.dirty) this.drawStatic();
    const ctx = this.ctx, g = this.game;
    const shx = this.shake > 0.3 ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake > 0.3 ? (Math.random() - 0.5) * this.shake : 0;
    ctx.setTransform(1, 0, 0, 1, shx * this.dpr, shy * this.dpr);
    ctx.drawImage(this.static, 0, 0);
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, (this.offX + shx) * this.dpr, (this.offY + shy) * this.dpr);

    // Flowing water on open channels
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([10, 30]);
    ctx.lineDashOffset = -this.t * 50;
    ctx.strokeStyle = '#9ac8e855'; ctx.lineWidth = 4;
    for (const p of g.paths) if (p.status === 'open') { this.tracePath(ctx, p); ctx.stroke(); }
    ctx.setLineDash([]);

    // Stressed walls + seepage
    for (const p of g.paths) {
      if (p.status !== 'stressed') continue;
      ctx.setLineDash([8, 10]); ctx.lineDashOffset = -this.t * 30;
      ctx.strokeStyle = `rgba(240,160,48,${0.35 + 0.25 * Math.sin(this.t * 5)})`; ctx.lineWidth = 8;
      this.tracePath(ctx, p); ctx.stroke(); ctx.setLineDash([]);
      this.drawWallMarker(ctx, p, true);
      const s = p.pts[0];
      ctx.fillStyle = '#f0a830'; ctx.font = '600 18px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚠ SEEPAGE', s.x, s.y + (s.y < 120 ? -22 : 26));
    }
    if (this.selectedPath) {
      const p = g.pathById[this.selectedPath];
      if (p) { ctx.strokeStyle = '#f0c04088'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); this.tracePath(ctx, p); ctx.stroke(); ctx.setLineDash([]); }
    }

    // Creek health tint
    const hpFrac = g.hp / g.maxHp;
    if (hpFrac < 1) {
      ctx.fillStyle = `rgba(110,80,40,${(1 - hpFrac) * 0.55})`;
      ctx.fillRect(0, g.map.creekY, WORLD_W, WORLD_H - g.map.creekY);
    }

    // Range of selected tower / ghost
    const sel = this.selectedTower;
    if (sel && g.towers.includes(sel)) this.drawRange(ctx, sel.x, sel.y, statsAt(sel.type, sel.tier).range, '#f0c040');

    // Towers
    for (const t of g.towers) this.drawTower(ctx, t);

    // Beams
    {
      const byId = new Map(g.enemies.map(e => [e.id, e]));
      for (const t of g.towers) {
        if (!t.beams || !t.beams.length || g.phase !== 'wave') continue;
        const b = BMPS[t.type];
        for (const id of t.beams) {
          const e = byId.get(id); if (!e) continue;
          ctx.strokeStyle = b.color; ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.t * 20);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(t.x, t.y - 6); ctx.lineTo(e.x, e.y); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, TAU); ctx.fill();
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

    // Pollutants
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const sz = e.def.size;
      if (e.slow < 1) {
        ctx.strokeStyle = '#9a8fd099'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, sz + 5, 0, TAU); ctx.stroke();
      }
      drawPollutant(ctx, e.type, e.x, e.y, sz, this.t + e.wobble, e.hit > 0);
      if (e.hp < e.maxHp) {
        const w = Math.max(18, sz * 2.4), f = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = '#000000aa'; ctx.fillRect(e.x - w / 2, e.y - sz - 12, w, 5);
        ctx.fillStyle = f > 0.6 ? '#5cb85c' : f > 0.3 ? '#f0a830' : '#e05050';
        ctx.fillRect(e.x - w / 2, e.y - sz - 12, w * f, 5);
      }
    }

    // Particles + floating text
    for (const p of this.effects.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.effects.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5));
      ctx.font = `${f.italic ? 'italic ' : ''}600 ${f.size}px Oswald, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = '#000000aa'; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // Placement ghost
    if (this.ghost) {
      const gh = this.ghost, b = BMPS[gh.type];
      if (b.onPath) {
        // Show where check dams can go
        ctx.strokeStyle = '#9a8fd066'; ctx.lineWidth = PATH_HALF * 2 + 8; ctx.lineCap = 'round';
        for (const p of g.paths) { this.tracePath(ctx, p); ctx.stroke(); }
      }
      this.drawRange(ctx, gh.x, gh.y, b.range, gh.ok ? '#5cb85c' : '#e05050');
      ctx.globalAlpha = 0.75;
      drawBmp(ctx, gh.type, gh.x, gh.y, b.size * 2, 0);
      ctx.globalAlpha = 1;
      if (!gh.ok) {
        ctx.strokeStyle = '#e05050'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(gh.x - 14, gh.y - 14); ctx.lineTo(gh.x + 14, gh.y + 14); ctx.moveTo(gh.x + 14, gh.y - 14); ctx.lineTo(gh.x - 14, gh.y + 14); ctx.stroke();
      }
    }

    // Leak flash vignette
    if (this.leakFlash > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const w = this.canvas.width, h = this.canvas.height;
      const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
      gr.addColorStop(0, 'rgba(224,60,60,0)');
      gr.addColorStop(1, `rgba(224,60,60,${this.leakFlash * 0.45})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    }
  }

  drawRange(ctx, x, y, r, color) {
    ctx.fillStyle = color + '18';
    ctx.strokeStyle = color + 'aa'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }

  drawTower(ctx, t) {
    const b = BMPS[t.type];
    const age = this.game.time - t.placedAt;
    const pop = age < 0.25 && age >= 0 ? 0.7 + age * 1.2 : 1;
    drawBmp(ctx, t.type, t.x, t.y, b.size * 2, t.tier, { scale: pop });
    if (t === this.selectedTower) {
      ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y, b.size * 1.35, 0, TAU); ctx.stroke();
    }
    // Sediment fill meter
    const s = statsAt(t.type, t.tier);
    const f = t.fill / s.capacity;
    if (f > 0.35) {
      const w = b.size * 1.6, y = t.y + b.size * 1.05;
      ctx.fillStyle = '#000000aa'; ctx.fillRect(t.x - w / 2, y, w, 6);
      ctx.fillStyle = f >= 0.98 ? '#e05050' : f >= 0.75 ? '#f0a830' : '#a08050';
      ctx.fillRect(t.x - w / 2, y, w * Math.min(1, f), 6);
      if (f >= 0.75) {
        const k = (Math.sin(this.t * 6) + 1) / 2;
        ctx.fillStyle = `rgba(240,168,48,${0.6 + k * 0.4})`;
        ctx.font = '600 16px Oswald, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🔧', t.x + b.size * 1.05, t.y - b.size * 0.9);
      }
    }
  }

  // ---------------------------------------------------------------- hit tests (world coords)
  towerAt(x, y) {
    let best = null, bd = Infinity;
    for (const t of this.game.towers) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < BMPS[t.type].size + 10 && d < bd) { bd = d; best = t; }
    }
    return best;
  }

  enemyAt(x, y) {
    let best = null, bd = 28;
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
      if (Math.hypot(s.x - x, s.y - y) < 40) return p;
    }
    return null;
  }
}
