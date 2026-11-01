/* Track geometry: a Catmull-Rom spline through the control points, resampled at uniform
   arc length so the dynamics can look up position, tangent and curvature from s. */
(function (ES) {
  'use strict';

  const SAMPLE_DS = 0.02;     // m between resampled points
  const STEPS_PER_SPAN = 32;  // dense samples per control-point span before resampling
  const COARSE = 4;           // stride for the coarse nearest-point scan

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function smooth(arr, radius) {
    const out = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let sum = 0, n = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(arr.length - 1, i + radius); j++) { sum += arr[j]; n++; }
      out[i] = sum / n;
    }
    return out;
  }

  class TrackGeometry {
    constructor(points) {
      const n = points.length;
      const dense = [];
      for (let i = 0; i < n - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, n - 1)];
        for (let k = 0; k < STEPS_PER_SPAN; k++) dense.push(catmull(p0, p1, p2, p3, k / STEPS_PER_SPAN));
      }
      dense.push({ x: points[n - 1].x, y: points[n - 1].y });

      const cum = new Float64Array(dense.length);
      for (let i = 1; i < dense.length; i++) {
        cum[i] = cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y);
      }
      const length = Math.max(cum[dense.length - 1], 1e-6);
      const count = Math.max(2, Math.ceil(length / SAMPLE_DS) + 1);
      const ds = length / (count - 1);

      const xs = new Float64Array(count), ys = new Float64Array(count);
      for (let k = 0, j = 0; k < count; k++) {
        const s = k * ds;
        while (j < dense.length - 2 && cum[j + 1] < s) j++;
        const span = cum[j + 1] - cum[j];
        const u = span > 0 ? Math.min(1, Math.max(0, (s - cum[j]) / span)) : 0;
        xs[k] = dense[j].x + (dense[j + 1].x - dense[j].x) * u;
        ys[k] = dense[j].y + (dense[j + 1].y - dense[j].y) * u;
      }

      const tx = new Float64Array(count), ty = new Float64Array(count), theta = new Float64Array(count);
      for (let k = 0; k < count; k++) {
        const a = Math.max(k - 1, 0), b = Math.min(k + 1, count - 1);
        const dx = xs[b] - xs[a], dy = ys[b] - ys[a], len = Math.hypot(dx, dy) || 1;
        tx[k] = dx / len;
        ty[k] = dy / len;
        theta[k] = Math.atan2(ty[k], tx[k]);
      }

      // Signed curvature dθ/ds: positive when the track turns toward its left normal.
      let kappa = new Float64Array(count);
      for (let k = 0; k < count; k++) {
        const a = Math.max(k - 1, 0), b = Math.min(k + 1, count - 1);
        kappa[k] = wrapAngle(theta[b] - theta[a]) / ((b - a) * ds);
      }
      kappa = smooth(smooth(kappa, 3), 3);

      Object.assign(this, { xs, ys, tx, ty, kappa, count, ds, length });
      this.minX = Math.min(...xs); this.maxX = Math.max(...xs);
      this.minY = Math.min(...ys); this.maxY = Math.max(...ys);
    }

    sample(s) {
      const f = Math.min(Math.max(s / this.ds, 0), this.count - 1);
      const i = Math.min(Math.floor(f), this.count - 2), u = f - i;
      const lerp = (arr) => arr[i] + (arr[i + 1] - arr[i]) * u;
      let tx = lerp(this.tx), ty = lerp(this.ty);
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      return { x: lerp(this.xs), y: lerp(this.ys), tx, ty, nx: -ty, ny: tx, k: lerp(this.kappa) };
    }

    nearBox(x, y, r) {
      return x >= this.minX - r && x <= this.maxX + r && y >= this.minY - r && y <= this.maxY + r;
    }

    nearest(px, py) {
      const { xs, ys, count } = this;
      const d2 = (i) => (xs[i] - px) * (xs[i] - px) + (ys[i] - py) * (ys[i] - py);
      let bi = 0, best = Infinity;
      for (let i = 0; i < count; i += COARSE) { const d = d2(i); if (d < best) { best = d; bi = i; } }
      if (d2(count - 1) < best) { best = d2(count - 1); bi = count - 1; }
      const lo = Math.max(0, bi - COARSE), hi = Math.min(count - 1, bi + COARSE);
      for (let i = lo; i <= hi; i++) { const d = d2(i); if (d < best) { best = d; bi = i; } }

      let res = { s: bi * this.ds, x: xs[bi], y: ys[bi], dist: Math.sqrt(best) };
      for (const i of [bi - 1, bi]) {
        if (i < 0 || i >= count - 1) continue;
        const ax = xs[i], ay = ys[i], bx = xs[i + 1] - ax, by = ys[i + 1] - ay;
        const L2 = bx * bx + by * by;
        if (!L2) continue;
        const u = Math.min(1, Math.max(0, ((px - ax) * bx + (py - ay) * by) / L2));
        const x = ax + bx * u, y = ay + by * u, dist = Math.hypot(px - x, py - y);
        if (dist < res.dist) res = { s: (i + u) * this.ds, x, y, dist };
      }
      return res;
    }

    // First crossing of the segment a→b with the track, or null.
    intersectSegment(ax, ay, bx, by) {
      if (Math.max(ax, bx) < this.minX || Math.min(ax, bx) > this.maxX ||
          Math.max(ay, by) < this.minY || Math.min(ay, by) > this.maxY) return null;
      const rx = bx - ax, ry = by - ay;
      let bestT = Infinity, bestS = -1;
      for (let i = 0; i < this.count - 1; i++) {
        const px = this.xs[i], py = this.ys[i];
        const sx = this.xs[i + 1] - px, sy = this.ys[i + 1] - py;
        const denom = rx * sy - ry * sx;
        if (Math.abs(denom) < 1e-14) continue;
        const qx = px - ax, qy = py - ay;
        const t = (qx * sy - qy * sx) / denom;
        const u = (qx * ry - qy * rx) / denom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < bestT) { bestT = t; bestS = (i + u) * this.ds; }
      }
      return bestS < 0 ? null : { s: bestS, t: bestT };
    }
  }

  ES.TrackGeometry = TrackGeometry;
})(window.ES = window.ES || {});
