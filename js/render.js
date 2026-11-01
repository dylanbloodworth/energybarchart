/* Draws the world onto the scene canvas. World units are meters with y up. */
(function (ES) {
  'use strict';

  const { WALL_HALF } = ES.World.constants;
  const BASE_VIEW = { x0: -0.6, x1: 16.6, y0: -1.2, y1: 9.8 };
  const MIN_ZOOM = 1, MAX_ZOOM = 40;
  const ZERO_TAG = { w: 72, pad: 6 }; // px size of the U_g = 0 tag and its margin from the edges
  const GROUND_SHARE = 0.11; // most of the view's height the ground may fill, as in the unzoomed view
  const GRID_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]; // m; the grid picks one to suit the zoom
  const COLOR_NAMES = ['sky', 'grid', 'grid-strong', 'ground', 'ground-edge', 'ink', 'muted', 'panel',
    'track', 'wall', 'system', 'select', 'zero', 'skater', 'cart', 'us', 'water', 'water-edge'];

  class SceneView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.view = Object.assign({}, BASE_VIEW);
      this.colors = {};
      this.readColors();
      this.resetZoom();
      this.resize();
    }

    // Zoom 1 fits the whole base view; (cx, cy) is the world point at the middle of the canvas.
    resetZoom() {
      const v = this.view;
      this.zoom = 1;
      this.cx = (v.x0 + v.x1) / 2;
      this.cy = (v.y0 + v.y1) / 2;
      this.updateTransform();
    }

    updateTransform() {
      if (!this.w) return;
      const v = this.view;
      this.scale = Math.min(this.w / (v.x1 - v.x0), this.h / (v.y1 - v.y0)) * this.zoom;
      // Keep the visible window inside the scene, with no more ground showing than GROUND_SHARE
      // of the view. A view wider than the scene stays centered, and one taller than the scene
      // puts the extra space in the sky, so zooming all the way out is the reset.
      const hw = this.w / 2 / this.scale, hh = this.h / 2 / this.scale;
      const bottom = Math.max(v.y0, -GROUND_SHARE * 2 * hh);
      this.cx = v.x1 - v.x0 <= 2 * hw ? (v.x0 + v.x1) / 2 : Math.min(Math.max(this.cx, v.x0 + hw), v.x1 - hw);
      this.cy = v.y1 - bottom <= 2 * hh ? bottom + hh : Math.min(Math.max(this.cy, bottom + hh), v.y1 - hh);
      this.ox = this.w / 2 - this.cx * this.scale;
      this.oy = this.h / 2 + this.cy * this.scale;
    }

    // Zoom by `factor`, keeping the world point under canvas pixel (px, py) fixed.
    zoomAt(px, py, factor) {
      const x = this.wx(px), y = this.wy(py);
      this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
      this.scale = Math.min(this.w / (this.view.x1 - this.view.x0), this.h / (this.view.y1 - this.view.y0)) * this.zoom;
      this.cx = x - (px - this.w / 2) / this.scale;
      this.cy = y + (py - this.h / 2) / this.scale;
      this.updateTransform();
    }

    // Slide the view by a drag of (dpx, dpy) pixels.
    pan(dpx, dpy) {
      this.cx -= dpx / this.scale;
      this.cy += dpy / this.scale;
      this.updateTransform();
    }

    readColors() {
      const cs = getComputedStyle(document.documentElement);
      for (const n of COLOR_NAMES) this.colors[n] = cs.getPropertyValue('--' + n).trim();
    }

    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.updateTransform();
    }

    sx(x) { return this.ox + x * this.scale; }
    sy(y) { return this.oy - y * this.scale; }
    wx(px) { return (px - this.ox) / this.scale; }
    wy(py) { return (this.oy - py) / this.scale; }

    draw(world, ui) {
      const ctx = this.ctx, c = this.colors;
      ctx.fillStyle = c.sky;
      ctx.fillRect(0, 0, this.w, this.h);
      if (ui.showGrid) this.drawGrid();
      this.drawGround(world);

      for (const t of world.ofType('track')) this.drawTrack(t, ui);
      for (const w of world.ofType('wall')) this.drawWall(w, ui);
      for (const b of world.ofType('bumper')) this.drawBumper(world, b, ui);
      for (const s of world.ofType('spring')) this.drawSpring(world, s, ui);
      for (const r of world.ofType('rope')) this.drawRope(world, r, ui);
      for (const p of world.ofType('pin')) this.drawPin(p, ui);
      for (const m of world.masses()) {
        if (m.type === 'ball') this.drawBall(world, m, ui);
        else this.drawSkater(world, m, ui);
      }
      // Water goes on top so anything below the surface looks submerged.
      if (world.scenery.water) this.drawWater(world.scenery.water);
      if (ui.showZero) this.drawZeroLine(world, ui.zeroTagX);
      if (ui.showVectors) for (const m of world.masses()) this.drawVelocity(world, m);
      if (ui.preview) this.drawPreview(ui.preview);
    }

    // ---- background ------------------------------------------------------------------------

    // Grid squares stay at least ~40 px across, so zooming in brings finer spacing (down to 1 cm).
    drawGrid() {
      const ctx = this.ctx, c = this.colors;
      const step = GRID_STEPS.find((s) => s * this.scale >= 40) || GRID_STEPS[GRID_STEPS.length - 1];
      const digits = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
      const i0 = Math.floor(this.wx(0) / step), i1 = Math.ceil(this.wx(this.w) / step);
      const j0 = Math.max(0, Math.floor(this.wy(this.h) / step)), j1 = Math.ceil(this.wy(0) / step);
      const ground = Math.min(this.h, this.sy(0));
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) { const px = Math.round(this.sx(i * step)) + 0.5; ctx.moveTo(px, ground); ctx.lineTo(px, 0); }
      for (let j = j0; j <= j1; j++) { const py = Math.round(this.sy(j * step)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(this.w, py); }
      ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let j = Math.max(1, j0); j <= j1; j++) ctx.fillText(`${(j * step).toFixed(digits)} m`, this.w - 6, this.sy(j * step));
    }

    drawGround(world) {
      const ctx = this.ctx, c = this.colors, top = this.sy(0);
      ctx.fillStyle = c.ground;
      ctx.fillRect(0, top, this.w, this.h - top);
      ctx.strokeStyle = c['ground-edge'];
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(this.w, top); ctx.stroke();

      const inSys = world.earth.inSystem;
      if (inSys) {
        ctx.save();
        ctx.strokeStyle = c.system;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(4, top + 4, this.w - 8, Math.max(0, this.h - top - 8));
        ctx.restore();
      }
      ctx.fillStyle = inSys ? c.system : c.ink;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(inSys ? 'Earth (in system)' : 'Earth', this.w - 12, top + Math.min(22, (this.h - top) / 2));
    }

    // Left edge (px) of the U_g = 0 tag. tagX is the world x the user slid it to, or null for the
    // left edge of the view; it always stays on screen.
    zeroTagLeft(tagX) {
      const left = tagX == null ? ZERO_TAG.pad : this.sx(tagX);
      return Math.min(Math.max(left, ZERO_TAG.pad), this.w - ZERO_TAG.w - ZERO_TAG.pad);
    }

    drawZeroLine(world, tagX) {
      const ctx = this.ctx, c = this.colors, y = this.sy(world.zeroY), left = this.zeroTagLeft(tagX);
      ctx.save();
      ctx.strokeStyle = c.zero;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.w, y); ctx.stroke();
      ctx.restore();
      // Draggable tag: up and down moves the zero level, sideways moves just the tag.
      ctx.fillStyle = c.zero;
      roundRect(ctx, left, y - 11, ZERO_TAG.w, 22, 11);
      ctx.fill();
      ctx.fillStyle = c.panel;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      drawSub(ctx, 'U', 'g', ' = 0', left + 10, y, 'italic 13px Georgia, serif', '10px Georgia, serif', '13px system-ui, sans-serif');
    }

    // ---- objects ---------------------------------------------------------------------------

    trackPath(t) {
      const ctx = this.ctx, g = t.geom;
      ctx.beginPath();
      ctx.moveTo(this.sx(g.xs[0]), this.sy(g.ys[0]));
      const stride = this.scale > 300 ? 1 : 2; // every 2 cm sample when zoomed in, so curves stay smooth
      for (let i = stride; i < g.count; i += stride) ctx.lineTo(this.sx(g.xs[i]), this.sy(g.ys[i]));
      ctx.lineTo(this.sx(g.xs[g.count - 1]), this.sy(g.ys[g.count - 1]));
    }

    drawTrack(t, ui) {
      const ctx = this.ctx, c = this.colors, selected = ui.selectedId === t.id;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this.trackPath(t);
      if (t.inSystem) { ctx.strokeStyle = c.system; ctx.globalAlpha = 0.22; ctx.lineWidth = 18; ctx.stroke(); }
      if (selected) { ctx.strokeStyle = c.select; ctx.globalAlpha = 0.6; ctx.lineWidth = 11; ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.track;
      ctx.lineWidth = 5;
      ctx.stroke();
      if (t.mu > 0) {
        // Speckles signal a rough surface.
        ctx.strokeStyle = c.ground;
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 5]);
        ctx.stroke();
      }
      ctx.restore();

      if (selected) {
        t.points.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(this.sx(p.x), this.sy(p.y), 6, 0, Math.PI * 2);
          ctx.fillStyle = i === ui.selectedPoint ? c.select : c.panel;
          ctx.fill();
          ctx.strokeStyle = c.select;
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
    }

    drawWall(w, ui) {
      const ctx = this.ctx, c = this.colors;
      const thick = Math.max(4, 2 * WALL_HALF * this.scale);
      ctx.save();
      ctx.lineCap = 'butt';
      const line = () => { ctx.beginPath(); ctx.moveTo(this.sx(w.x1), this.sy(w.y1)); ctx.lineTo(this.sx(w.x2), this.sy(w.y2)); };
      line();
      if (w.inSystem) { ctx.strokeStyle = c.system; ctx.globalAlpha = 0.22; ctx.lineWidth = thick + 14; ctx.stroke(); }
      if (ui.selectedId === w.id) { ctx.strokeStyle = c.select; ctx.globalAlpha = 0.6; ctx.lineWidth = thick + 7; ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.wall;
      ctx.lineWidth = thick;
      ctx.stroke();
      if (ui.selectedId === w.id) {
        for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
          ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y), 6, 0, Math.PI * 2);
          ctx.fillStyle = c.panel; ctx.fill(); ctx.strokeStyle = c.select; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawBumper(world, b, ui) {
      const ctx = this.ctx, c = this.colors;
      const { dx, dy } = world.bumperDir(b);
      const px = -dy, py = dx, hw = b.width / 2;
      let comp = 0;
      for (const id of b.engaged) { const m = world.get(id); if (m) comp = Math.max(comp, world.bumperCompression(b, m)); }
      const len = Math.max(0.05, b.L0 - comp);
      const ex = b.x + dx * len, ey = b.y + dy * len;
      ctx.save();
      ctx.lineCap = 'round';
      if (b.inSystem || ui.selectedId === b.id) {
        ctx.strokeStyle = ui.selectedId === b.id ? c.select : c.system;
        ctx.globalAlpha = ui.selectedId === b.id ? 0.6 : 0.22;
        ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(this.sx(b.x), this.sy(b.y)); ctx.lineTo(this.sx(ex), this.sy(ey)); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = c.wall;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(this.sx(b.x - px * hw), this.sy(b.y - py * hw)); ctx.lineTo(this.sx(b.x + px * hw), this.sy(b.y + py * hw)); ctx.stroke();
      this.zigzag(b.x, b.y, ex, ey, 7, 0.18 * Math.min(1, b.width), c.us, 2.5);
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(this.sx(ex - px * hw), this.sy(ey - py * hw)); ctx.lineTo(this.sx(ex + px * hw), this.sy(ey + py * hw)); ctx.stroke();
      ctx.restore();
    }

    drawSpring(world, s, ui) {
      const A = world.get(s.a), B = world.get(s.b);
      if (!A || !B) return;
      const ctx = this.ctx, c = this.colors;
      if (s.inSystem || ui.selectedId === s.id) {
        ctx.save();
        ctx.strokeStyle = ui.selectedId === s.id ? c.select : c.system;
        ctx.globalAlpha = ui.selectedId === s.id ? 0.6 : 0.22;
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(this.sx(A.x), this.sy(A.y)); ctx.lineTo(this.sx(B.x), this.sy(B.y)); ctx.stroke();
        ctx.restore();
      }
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      if (s.slack && d < s.L0) {
        // A slack cord hangs in a loose curve, like a rope.
        const sag = Math.sqrt(s.L0 * s.L0 - d * d) / 2;
        ctx.save();
        ctx.strokeStyle = c.us;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.sx(A.x), this.sy(A.y));
        ctx.quadraticCurveTo(this.sx((A.x + B.x) / 2), this.sy((A.y + B.y) / 2 - sag), this.sx(B.x), this.sy(B.y));
        ctx.stroke();
        ctx.restore();
        return;
      }
      this.zigzag(A.x, A.y, B.x, B.y, 12, 0.16, c.us, 2.5);
    }

    // Scenery only: a band of water across the whole view, from the ground up to `level`.
    drawWater(water) {
      const ctx = this.ctx, c = this.colors, top = this.sy(water.level), bottom = this.sy(0);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = c.water;
      ctx.fillRect(0, top, this.w, bottom - top);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c['water-edge'];
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(this.w, top); ctx.stroke();
      ctx.restore();
    }

    drawRope(world, r, ui) {
      const A = world.get(r.a), B = world.get(r.b);
      if (!A || !B) return;
      const ctx = this.ctx, c = this.colors;
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      const sag = d < r.L - 0.01 ? Math.sqrt(r.L * r.L - d * d) / 2 : 0;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(this.sx(A.x), this.sy(A.y));
        ctx.quadraticCurveTo(this.sx((A.x + B.x) / 2), this.sy((A.y + B.y) / 2 - sag), this.sx(B.x), this.sy(B.y));
      };
      ctx.save();
      ctx.lineCap = 'round';
      if (r.inSystem || ui.selectedId === r.id) {
        path();
        ctx.strokeStyle = ui.selectedId === r.id ? c.select : c.system;
        ctx.globalAlpha = ui.selectedId === r.id ? 0.6 : 0.22;
        ctx.lineWidth = 12;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      path();
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    drawPin(p, ui) {
      const ctx = this.ctx, c = this.colors, x = this.sx(p.x), y = this.sy(p.y);
      if (ui.selectedId === p.id) {
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fillStyle = c.select; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = c.panel; ctx.fill();
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fillStyle = c.ink; ctx.fill();
    }

    drawBall(world, m, ui) {
      const ctx = this.ctx, c = this.colors;
      const x = this.sx(m.x), y = this.sy(m.y), r = m.r * this.scale;
      if (m.look === 'popper') this.drawPopper(m);
      else {
        this.drawPlunger(world, m);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = m.color; ctx.fill();
        ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (m.inSystem) this.systemRing(x, y, r + 6);
      if (ui.selectedId === m.id) this.selectRing(x, y, r + 11);
      this.label(m.name, x, y - r - (m.inSystem ? 14 : 8));
    }

    // A dome sitting on the bottom of the ball's circle. Turned inside out (still loaded) it is
    // flatter and shows its stored elastic energy as an orange spring line.
    drawPopper(m) {
      const ctx = this.ctx, c = this.colors, s = this.scale;
      const loaded = m.pk > 0 && !m.pSpent;
      const x = this.sx(m.x), base = this.sy(m.y - m.r), rx = m.r * 1.15 * s, ry = m.r * (loaded ? 0.8 : 1.5) * s;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, base, rx, ry, 0, Math.PI, 2 * Math.PI);
      ctx.closePath();
      ctx.fillStyle = m.color; ctx.fill();
      ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      if (loaded) this.zigzag(m.x - m.r * 0.8, m.y - m.r * 0.65, m.x + m.r * 0.8, m.y - m.r * 0.65, 4, m.r * 0.18, c.us, 2);
    }

    // A built-in spring sticking out of a cart or ball, drawn at its current length.
    drawPlunger(world, m) {
      if (!(m.pk > 0) || m.pSpent) return;
      const p = world.plungerFrame(m), ext = m.pL - world.plungerCompression(m);
      const x1 = p.bx + p.ux * p.body, y1 = p.by + p.uy * p.body;
      const x2 = x1 + p.ux * ext, y2 = y1 + p.uy * ext;
      const ctx = this.ctx, c = this.colors, hw = 0.16;
      this.zigzag(x1, y1, x2, y2, 4, 0.07, c.us, 2.5);
      ctx.save();
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(this.sx(x2 - p.uy * hw), this.sy(y2 + p.ux * hw)); ctx.lineTo(this.sx(x2 + p.uy * hw), this.sy(y2 - p.ux * hw)); ctx.stroke();
      ctx.restore();
    }

    drawSkater(world, m, ui) {
      if (m.look === 'cart') { this.drawCart(world, m, ui); return; }
      const ctx = this.ctx, c = this.colors, s = this.scale;
      this.drawPlunger(world, m);
      ctx.save();
      ctx.translate(this.sx(m.x), this.sy(m.y));
      ctx.rotate(-(m.angle || 0));
      ctx.scale(s * (m.facing === -1 ? -1 : 1), -s); // local meters, y up; mirrored when facing left
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const board = m.look !== 'person';
      if (board) {
        ctx.fillStyle = c.ink;
        for (const wx of [-0.3, 0.3]) { ctx.beginPath(); ctx.arc(wx, 0.07, 0.07, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.moveTo(-0.5, 0.22); ctx.lineTo(-0.42, 0.16); ctx.lineTo(0.42, 0.16); ctx.lineTo(0.5, 0.22); ctx.stroke();
      }

      ctx.strokeStyle = c.skater;
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      if (board) {
        ctx.moveTo(-0.22, 0.2); ctx.lineTo(-0.1, 0.52); ctx.lineTo(0, 0.85);
        ctx.moveTo(0.22, 0.2); ctx.lineTo(0.14, 0.52); ctx.lineTo(0, 0.85);
      } else {
        // Standing straight, feet at the origin.
        ctx.moveTo(-0.12, 0.02); ctx.lineTo(-0.06, 0.45); ctx.lineTo(0, 0.85);
        ctx.moveTo(0.12, 0.02); ctx.lineTo(0.07, 0.45); ctx.lineTo(0, 0.85);
      }
      ctx.lineTo(0.05, 1.3);
      ctx.moveTo(0.04, 1.2); ctx.lineTo(-0.38, 1.0);
      ctx.moveTo(0.04, 1.2); ctx.lineTo(0.42, 1.06);
      ctx.stroke();
      ctx.fillStyle = c.skater;
      ctx.beginPath(); ctx.arc(0.07, 1.48, 0.16, 0, Math.PI * 2); ctx.fill();

      if (m.inSystem) {
        ctx.strokeStyle = c.system;
        ctx.lineWidth = 2 / s;
        ctx.setLineDash([6 / s, 4 / s]);
        ctx.beginPath(); ctx.ellipse(0, 0.82, 0.72, 0.95, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (ui.selectedId === m.id) {
        ctx.strokeStyle = c.select;
        ctx.lineWidth = 3 / s;
        ctx.beginPath(); ctx.ellipse(0, 0.82, 0.86, 1.08, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      this.riderOverlay(world, m, ui);
    }

    drawCart(world, m, ui) {
      const ctx = this.ctx, c = this.colors, s = this.scale;
      this.drawPlunger(world, m);
      ctx.save();
      ctx.translate(this.sx(m.x), this.sy(m.y));
      ctx.rotate(-(m.angle || 0));
      ctx.scale(s * (m.facing === -1 ? -1 : 1), -s);
      ctx.fillStyle = c.ink;
      for (const wx of [-0.26, 0.26]) { ctx.beginPath(); ctx.arc(wx, 0.08, 0.08, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = c.cart;
      roundRect(ctx, -0.42, 0.12, 0.84, 0.22, 0.04);
      ctx.fill();
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 1.5 / s;
      ctx.stroke();
      if (m.inSystem) {
        ctx.strokeStyle = c.system;
        ctx.lineWidth = 2 / s;
        ctx.setLineDash([6 / s, 4 / s]);
        ctx.beginPath(); ctx.ellipse(0, 0.2, 0.62, 0.34, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (ui.selectedId === m.id) {
        ctx.strokeStyle = c.select;
        ctx.lineWidth = 3 / s;
        ctx.beginPath(); ctx.ellipse(0, 0.2, 0.74, 0.46, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      this.riderOverlay(world, m, ui);
    }

    // Name label, plus the rotation handle when a free rider is selected.
    riderOverlay(world, m, ui) {
      const ctx = this.ctx, c = this.colors, f = world.skaterFrame(m), h = world.riderHeight(m);
      if (ui.selectedId === m.id && m.mode !== 'track' && ui.canRotate) {
        const hx = this.sx(m.x + f.ux * (h + 0.9)), hy = this.sy(m.y + f.uy * (h + 0.9));
        ctx.save();
        ctx.strokeStyle = c.select;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(this.sx(m.x + f.ux * (h + 0.2)), this.sy(m.y + f.uy * (h + 0.2))); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2);
        ctx.fillStyle = c.panel; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(hx, hy, 3.5, -2.4, 1.6); ctx.stroke();
        ctx.restore();
        this.label(m.name, hx + 30, hy + 6);
      } else {
        this.label(m.name, this.sx(m.x + f.ux * (h + 0.35)), this.sy(m.y + f.uy * (h + 0.35)));
      }
    }

    drawVelocity(world, m) {
      const speed = Math.hypot(m.vx, m.vy);
      if (speed < 0.05) return;
      let cx = m.x, cy = m.y;
      if (m.type === 'skater') { const f = world.skaterFrame(m), h = world.riderHeight(m) * 0.47; cx += f.ux * h; cy += f.uy * h; }
      const k = 0.25; // m of arrow per m/s
      this.arrow(this.sx(cx), this.sy(cy), this.sx(cx + m.vx * k), this.sy(cy + m.vy * k), this.colors.ink);
      this.label(`${speed.toFixed(1)} m/s`, this.sx(cx + m.vx * k), this.sy(cy + m.vy * k) - 8);
    }

    drawPreview(p) {
      const ctx = this.ctx, c = this.colors;
      ctx.save();
      ctx.strokeStyle = c.select;
      ctx.lineWidth = p.kind === 'wall' ? Math.max(4, 2 * WALL_HALF * this.scale) : 2;
      if (p.kind !== 'wall') ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(this.sx(p.x1), this.sy(p.y1)); ctx.lineTo(this.sx(p.x2), this.sy(p.y2)); ctx.stroke();
      ctx.restore();
    }

    // ---- primitives ------------------------------------------------------------------------

    zigzag(x1, y1, x2, y2, coils, amp, color, width) {
      const ctx = this.ctx;
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-6;
      const ux = dx / L, uy = dy / L, px = -uy, py = ux;
      const lead = Math.min(0.15, L * 0.15);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.sx(x1), this.sy(y1));
      ctx.lineTo(this.sx(x1 + ux * lead), this.sy(y1 + uy * lead));
      const n = coils * 2, body = L - 2 * lead;
      for (let i = 1; i < n; i++) {
        const t = lead + (body * i) / n, side = i % 2 ? 1 : -1;
        ctx.lineTo(this.sx(x1 + ux * t + px * amp * side), this.sy(y1 + uy * t + py * amp * side));
      }
      ctx.lineTo(this.sx(x2 - ux * lead), this.sy(y2 - uy * lead));
      ctx.lineTo(this.sx(x2), this.sy(y2));
      ctx.stroke();
      ctx.restore();
    }

    arrow(x1, y1, x2, y2, color) {
      const ctx = this.ctx, a = Math.atan2(y2 - y1, x2 - x1), head = 9;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a - 0.4), y2 - head * Math.sin(a - 0.4));
      ctx.lineTo(x2 - head * Math.cos(a + 0.4), y2 - head * Math.sin(a + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    systemRing(x, y, r) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = this.colors.system;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    selectRing(x, y, r) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = this.colors.select;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    label(text, x, y) {
      const ctx = this.ctx;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.colors.sky;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = this.colors.ink;
      ctx.fillText(text, x, y);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Draws e.g. "U" with subscript "g" followed by a tail, left-aligned at (x, y) with middle baseline.
  function drawSub(ctx, main, sub, tail, x, y, mainFont, subFont, tailFont) {
    ctx.font = mainFont;
    ctx.fillText(main, x, y);
    x += ctx.measureText(main).width + 1;
    ctx.font = subFont;
    ctx.fillText(sub, x, y + 4);
    x += ctx.measureText(sub).width;
    ctx.font = tailFont;
    ctx.fillText(tail, x, y);
  }

  ES.SceneView = SceneView;
  ES.drawSub = drawSub;
})(window.ES = window.ES || {});
