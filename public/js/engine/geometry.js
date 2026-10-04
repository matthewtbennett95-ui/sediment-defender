// Path + geometry helpers. No DOM — also runs in Node for balance testing.

export const WORLD_W = 1600;
export const WORLD_H = 900;

/** Precompute segment lengths so enemies can move by distance. */
export function preparePath(points) {
  const pts = points.map(([x, y]) => ({ x, y }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, cum, length: cum[cum.length - 1] };
}

/** Position (and direction) at distance d along a prepared path. */
export function pointAt(path, d) {
  const { pts, cum } = path;
  if (d <= 0) return { x: pts[0].x, y: pts[0].y, a: angleOf(pts[0], pts[1]) };
  for (let i = 1; i < pts.length; i++) {
    if (d <= cum[i]) {
      const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
        a: angleOf(pts[i - 1], pts[i]),
      };
    }
  }
  const n = pts.length - 1;
  return { x: pts[n].x, y: pts[n].y, a: angleOf(pts[n - 1], pts[n]) };
}

function angleOf(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

/** Shortest distance from a point to a segment. Returns { dist, x, y } of the closest point. */
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + t * dx, y = ay + t * dy;
  return { dist: Math.hypot(px - x, py - y), x, y };
}

/** Closest point on a whole path. */
export function closestOnPath(path, px, py) {
  let best = { dist: Infinity, x: 0, y: 0 };
  for (let i = 1; i < path.pts.length; i++) {
    const c = closestOnSegment(px, py, path.pts[i - 1].x, path.pts[i - 1].y, path.pts[i].x, path.pts[i].y);
    if (c.dist < best.dist) best = c;
  }
  return best;
}

export function insideEllipse(px, py, cx, cy, rx, ry, pad = 0) {
  const dx = (px - cx) / (rx + pad), dy = (py - cy) / (ry + pad);
  return dx * dx + dy * dy <= 1;
}
