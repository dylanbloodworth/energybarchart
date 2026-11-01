/* Energy accounting for the chosen system, and the bar chart that shows it.
 *
 *   K_i + U_gi + U_si + W = K_f + U_gf + U_sf + ΔU_int
 *
 * Gravitational energy belongs to the system only if Earth is in it; elastic energy only if the
 * spring is. Logged dissipation is ΔU_int when every object that took part is in the system;
 * otherwise it crosses the boundary and shows up as (negative) work.
 */
(function (ES) {
  'use strict';

  const BARS = [
    { key: 'Ki', sym: 'K', sub: 'i', color: 'k' },
    { key: 'Ugi', sym: 'U', sub: 'gi', color: 'ug' },
    { key: 'Usi', sym: 'U', sub: 'si', color: 'us' },
    { key: 'W', sym: 'W', sub: '', color: 'w' },
    { key: 'Kf', sym: 'K', sub: 'f', color: 'k' },
    { key: 'Ugf', sym: 'U', sub: 'gf', color: 'ug' },
    { key: 'Usf', sym: 'U', sub: 'sf', color: 'us' },
    { key: 'dUint', sym: 'ΔU', sub: 'int', color: 'uint' },
  ];
  // Left edge of each bar in slot units (null = not drawn); the gaps hold the "+" and "=" signs.
  const LAYOUTS = {
    withWork: {
      left: [0, 1, 2, 3.6, 5.2, 6.2, 7.2, 8.2], total: 9.2,
      ops: [['+', 3.3], ['=', 4.9]], groups: [['Initial', 0, 3], ['Work', 3.6, 1], ['Final', 5.2, 4]],
    },
    noWork: {
      left: [0, 1, 2, null, 3.6, 4.6, 5.6, 6.6], total: 7.6,
      ops: [['=', 3.3]], groups: [['Initial', 0, 3], ['Final', 3.6, 4]],
    },
  };

  function computeEnergy(world, snap, now) {
    const inSys = (id) => world.inSystem(id);
    const earthIn = inSys('earth');
    const name = (id) => (world.get(id) || { name: id }).name;

    const sums = (L) => {
      let K = 0, Ug = 0, Us = 0;
      for (const m of L.masses) {
        if (!inSys(m.id)) continue;
        K += m.K;
        if (earthIn) Ug += m.m * L.g * (m.y - world.zeroY);
      }
      for (const s of L.springs) if (inSys(s.id)) Us += s.U;
      return { K, Ug, Us };
    };
    const i = sums(snap), f = sums(now);

    let dUint = 0;
    const work = [];
    for (const [key, d] of Object.entries(now.diss)) {
      const amount = d.amount - (snap.diss[key] ? snap.diss[key].amount : 0);
      if (Math.abs(amount) < 1e-12) continue;
      const inside = d.parts.filter(inSys).length;
      if (inside === d.parts.length) dUint += amount;
      else if (inside > 0) {
        work.push({ kind: 'dissipation', label: `friction/impact (${d.parts.map(name).join(' ↔ ')})`, value: -amount, parts: d.parts });
      }
    }

    const W = f.K + f.Ug + f.Us + dUint - (i.K + i.Ug + i.Us);

    if (!earthIn) {
      const before = new Map(snap.masses.map((m) => [m.id, m]));
      let wg = 0, any = false;
      for (const m of now.masses) {
        if (!inSys(m.id) || !before.has(m.id)) continue;
        wg -= m.m * now.g * (m.y - before.get(m.id).y);
        any = true;
      }
      if (any) work.unshift({ kind: 'gravity', label: 'Earth (gravitational force)', value: wg });
    }

    const springBefore = new Map(snap.springs.map((s) => [s.id, s]));
    for (const s of now.springs) {
      if (inSys(s.id)) continue;
      const old = springBefore.get(s.id);
      if (!s.attached.some(inSys) && !(old && old.attached.some(inSys))) continue;
      work.push({ kind: 'spring', label: name(s.id), value: -(s.U - (old ? old.U : 0)) });
    }

    const residual = W - work.reduce((sum, w) => sum + w.value, 0);
    return { Ki: i.K, Ugi: i.Ug, Usi: i.Us, W, Kf: f.K, Ugf: f.Ug, Usf: f.Us, dUint, work, residual };
  }

  function niceStep(x) {
    if (!(x > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function fmtEnergy(v, tol = 1e-3) {
    const a = Math.abs(v);
    if (a < tol) return '0';
    if (a >= 100) return Math.round(v).toLocaleString();
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }

  class BarChart {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.colors = {};
      this.readColors();
      this.reset();
    }

    readColors() {
      const cs = getComputedStyle(document.documentElement);
      for (const n of ['k', 'ug', 'us', 'uint', 'w', 'ink', 'muted', 'grid', 'grid-strong', 'band']) {
        this.colors[n] = cs.getPropertyValue('--' + n).trim();
      }
    }

    // The scale only grows during a run so bars don't jump around; reset when the run restarts.
    reset() { this.maxPos = 0; this.maxNeg = 0; }

    // With the work column hidden, an open system won't balance; the sign becomes "≠" (this.unequal).
    draw(E, showValues, showWork = true) {
      const { canvas, ctx, colors: c } = this;
      const { left: LEFT, total: TOTAL, ops: OPS, groups: GROUPS } = showWork ? LAYOUTS.withWork : LAYOUTS.noWork;
      const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, rect.width), H = Math.max(1, rect.height);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const vals = BARS.map((b) => E[b.key]);
      const shown = vals.filter((v, i) => LEFT[i] !== null);
      for (const v of shown) this.maxPos = Math.max(this.maxPos, v);
      for (const v of shown) if (-v > 0.01 * Math.max(this.maxPos, 1e-9)) this.maxNeg = Math.max(this.maxNeg, -v);
      const big = Math.max(this.maxPos, this.maxNeg);
      this.unequal = !showWork && Math.abs(E.W) > 0.005 * big;
      const unit = big > 1e-6 ? niceStep(big / 6) : 1;
      const pos = Math.max(1, Math.ceil(this.maxPos / unit - 1e-6));
      const neg = this.maxNeg > 0 ? Math.ceil(this.maxNeg / unit - 1e-6) : 0;

      const top = 34, bottom = 30, padX = 2;
      const rowH = (H - top - bottom) / (pos + neg);
      const zero = top + pos * rowH;
      const slot = (W - 2 * padX) / TOTAL;
      const xOf = (u) => padX + u * slot;

      // Group backgrounds and headings
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      for (const [title, start, width] of GROUPS) {
        ctx.fillStyle = c.band;
        ctx.fillRect(xOf(start), top, width * slot, H - top - bottom);
        ctx.fillStyle = c.muted;
        ctx.fillText(title, xOf(start + width / 2), 14);
      }

      // Grid squares inside each group
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [, start, width] of GROUPS) {
        for (let r = 0; r <= pos + neg; r++) {
          const y = Math.round(top + r * rowH) + 0.5;
          ctx.moveTo(xOf(start), y); ctx.lineTo(xOf(start + width), y);
        }
        for (let k = 0; k <= width; k++) {
          const x = Math.round(xOf(start + k)) + 0.5;
          ctx.moveTo(x, top); ctx.lineTo(x, H - bottom);
        }
      }
      ctx.stroke();

      ctx.strokeStyle = c['grid-strong'];
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(xOf(0), zero); ctx.lineTo(xOf(TOTAL), zero); ctx.stroke();

      // Bars
      BARS.forEach((b, i) => {
        if (LEFT[i] === null) return;
        const v = vals[i], hpx = (v / unit) * rowH;
        const x = xOf(LEFT[i]) + slot * 0.17, w = slot * 0.66, cx = xOf(LEFT[i] + 0.5);
        ctx.fillStyle = c[b.color];
        if (Math.abs(hpx) >= 0.5) ctx.fillRect(x, hpx >= 0 ? zero - hpx : zero, w, Math.abs(hpx));
        if (showValues && Math.abs(v) >= unit * 0.01) {
          ctx.fillStyle = c.ink;
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = hpx >= 0 ? 'bottom' : 'top';
          ctx.fillText(fmtEnergy(v), cx, hpx >= 0 ? zero - hpx - 2 : zero - hpx + 2);
        }
        ctx.fillStyle = c[b.color];
        ctx.textBaseline = 'middle';
        const fontMain = 'italic 600 14px Georgia, serif', fontSub = '10px Georgia, serif';
        ctx.font = fontMain;
        const wm = ctx.measureText(b.sym).width;
        ctx.font = fontSub;
        const ws = ctx.measureText(b.sub).width;
        ctx.textAlign = 'left';
        ES.drawSub(ctx, b.sym, b.sub, '', cx - (wm + ws + 1) / 2, H - 14, fontMain, fontSub, fontSub);
      });

      ctx.fillStyle = c.ink;
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [op, at] of OPS) {
        const sign = op === '=' && this.unequal ? '≠' : op;
        ctx.fillStyle = sign === '≠' ? c.uint : c.ink;
        ctx.fillText(sign, xOf(at), zero - Math.min(rowH, 20));
      }

      return unit;
    }
  }

  ES.computeEnergy = computeEnergy;
  ES.fmtEnergy = fmtEnergy;
  ES.BarChart = BarChart;
})(window.ES = window.ES || {});
