/* Physics world for the energy lab.
 *
 * Objects are plain data so a scene can be saved as JSON. Masses (balls, skaters, carts) are point
 * particles; a skater or cart can also ride a track like a bead on a wire. Every process that turns
 * mechanical energy into internal energy (friction, inelastic impacts, a rope snapping taut)
 * is logged against the objects that took part, so the bar chart can decide whether it stays
 * inside the chosen system (ΔU_int) or crosses the boundary (work).
 */
(function (ES) {
  'use strict';

  const SUBSTEP = 1 / 2000;    // s
  const REST_SPEED = 0.05;     // m/s; slower impacts count as resting contact (no bounce, no loss logged)
  const SKATER_RADIUS = 0.25;  // m; how far a skater reaches when touching walls, balls and bumpers
  const WALL_HALF = 0.08;      // m; half the wall thickness
  const BALL_COLORS = ['#e4572e', '#2e86ab', '#f2a541', '#6a994e', '#9c51b6', '#d1495b'];
  const TRANSIENT = new Set(['geom', 'fx', 'fy', 'px', 'py', 'pvx', 'pvy', 'pLoaded']);
  const CART_MID = 0.22;       // m; height of a cart's plunger above its wheels
  const CART_HALF = 0.42;      // m; half a cart's length

  // Every mass can carry a built-in spring (plunger): pk = 0 means none. It sticks out pL beyond
  // the body in direction pDir (degrees; in the rider's own frame for skaters and carts, in the
  // world for balls). A one-shot plunger (pOnce, the marble popper) is spent after it releases.
  const PLUNGER = { pk: 0, pL: 0.3, pOnce: false, pSpent: false };

  const DEFAULTS = {
    ball:   Object.assign({ name: 'Ball', m: 1, r: 0.3, e: 1, x: 0, y: 0, vx: 0, vy: 0, inSystem: true, look: 'ball', pDir: 270 }, PLUNGER),
    // look: 'skateboard', 'person' or 'cart'. They share the physics; only the drawing differs.
    skater: Object.assign({ name: 'Skater', m: 50, e: 0.1, x: 0, y: 0, vx: 0, vy: 0, inSystem: true,
              mode: 'free', trackId: null, s: 0, vs: 0, side: 1, angle: 0, facing: 1, look: 'skateboard', pDir: 180 }, PLUNGER),
    pin:    { name: 'Pin', x: 0, y: 0 },
    wall:   { name: 'Wall', x1: 0, y1: 0, x2: 0, y2: 3, mu: 0, inSystem: true },
    track:  { name: 'Track', points: [], mu: 0, sticky: true, inSystem: true },
    spring: { name: 'Spring', a: null, b: null, k: 50, L0: 1, slack: false, inSystem: true },
    rope:   { name: 'Rope', a: null, b: null, L: 2, inSystem: true, taut: false },
    bumper: { name: 'Bumper', x: 0, y: 0, angle: 0, L0: 1.2, k: 2000, width: 1, inSystem: true, engaged: [] },
  };

  const isMass = (o) => !!o && (o.type === 'ball' || o.type === 'skater');
  const kinetic = (m) => 0.5 * m.m * (m.vx * m.vx + m.vy * m.vy);
  const contactRadius = (m) => (m.type === 'ball' ? m.r : SKATER_RADIUS);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  function closestOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / L2)) : 0;
    return { x: x1 + dx * u, y: y1 + dy * u };
  }

  class World {
    constructor() { this.clear(); }

    clear() {
      this.objects = [];
      this.nextId = 1;
      this.g = 9.8;
      this.zeroY = 0;
      this.time = 0;
      this.earth = { id: 'earth', type: 'earth', name: 'Earth', inSystem: true, mu: 0.2 };
      this.dissipation = {};
      this.E0 = null;
      this.scenery = {}; // drawing only, no physics (e.g. { water: { level } })
    }

    // ---- objects -------------------------------------------------------------------------

    create(type, props = {}) {
      const base = clone(DEFAULTS[type]);
      const obj = Object.assign({ type }, base, props);
      obj.id = props.id || `${type}-${this.nextId++}`;
      if (!props.name) obj.name = `${base.name} ${this.ofType(type).length + 1}`;
      if (type === 'ball' && !props.color) obj.color = BALL_COLORS[this.ofType('ball').length % BALL_COLORS.length];
      if (type === 'track') obj.geom = new ES.TrackGeometry(obj.points);
      this.objects.push(obj);
      return obj;
    }

    get(id) { return id === 'earth' ? this.earth : this.objects.find((o) => o.id === id) || null; }
    ofType(type) { return this.objects.filter((o) => o.type === type); }
    masses() { return this.objects.filter(isMass); }
    isMass(o) { return isMass(o); }

    // Pins are bolted to the Earth, so they share its membership.
    inSystem(id) {
      const o = this.get(id);
      if (!o) return false;
      return o.type === 'pin' ? this.earth.inSystem : !!o.inSystem;
    }

    remove(id) {
      const obj = this.get(id);
      if (!obj || obj === this.earth) return;
      this.objects = this.objects.filter((o) => o !== obj && !((o.type === 'spring' || o.type === 'rope') && (o.a === id || o.b === id)));
      if (obj.type === 'track') {
        for (const m of this.masses()) if (m.mode === 'track' && m.trackId === id) { m.mode = 'free'; m.trackId = null; }
      }
    }

    rebuildTrack(track) {
      track.geom = new ES.TrackGeometry(track.points);
      for (const m of this.masses()) {
        if (m.mode === 'track' && m.trackId === track.id) this.attachToTrack(m, track, track.geom.nearest(m.x, m.y).s, m.vs, m.side);
      }
    }

    nearestTrack(x, y, maxDist) {
      let best = null;
      for (const t of this.ofType('track')) {
        const n = t.geom.nearest(x, y);
        if (n.dist > maxDist || (best && n.dist >= best.dist)) continue;
        const p = t.geom.sample(n.s);
        // Close to the rail, assume the rider is on top; farther away, use the side they came from.
        const side = n.dist < 0.3 ? (p.ny >= 0 ? 1 : -1) : ((x - p.x) * p.nx + (y - p.y) * p.ny < 0 ? -1 : 1);
        best = { track: t, s: n.s, dist: n.dist, side };
      }
      return best;
    }

    attachToTrack(m, track, s, vs = 0, side = 1) {
      const p = track.geom.sample(s);
      Object.assign(m, { mode: 'track', trackId: track.id, s, vs, side, x: p.x, y: p.y, vx: vs * p.tx, vy: vs * p.ty });
      m.angle = side === 1 ? Math.atan2(p.ty, p.tx) : Math.atan2(-p.ty, -p.tx);
    }

    detach(m) {
      m.cooldown = 0.08;
      m.cooldownTrack = m.trackId;
      m.mode = 'free';
      m.trackId = null;
    }

    // Skater's "up" direction, used for drawing and hit testing.
    skaterFrame(m) {
      const a = m.angle || 0;
      return { ux: -Math.sin(a), uy: Math.cos(a), angle: a };
    }

    // How tall a rider is drawn, for hit testing, labels and handles.
    riderHeight(m) { return m.look === 'cart' ? 0.5 : 1.7; }

    // Where a mass's plunger starts, which way it points, and how far the body extends that way.
    plungerFrame(m) {
      const a = (m.pDir * Math.PI) / 180;
      if (m.type === 'ball') return { bx: m.x, by: m.y, ux: Math.cos(a), uy: Math.sin(a), body: m.r };
      const f = this.skaterFrame(m), dir = m.facing === -1 ? -1 : 1;
      const tx = Math.cos(f.angle) * dir, ty = Math.sin(f.angle) * dir; // the rider's local x axis
      return {
        bx: m.x + f.ux * CART_MID, by: m.y + f.uy * CART_MID,
        ux: Math.cos(a) * tx + Math.sin(a) * f.ux, uy: Math.cos(a) * ty + Math.sin(a) * f.uy,
        body: m.look === 'cart' ? CART_HALF : SKATER_RADIUS,
      };
    }

    // Distance from (bx, by) along the unit direction (ux, uy) to the nearest wall face, or Infinity.
    rayToWall(bx, by, ux, uy) {
      let best = { t: Infinity, wall: null };
      for (const w of this.ofType('wall')) {
        const sx = w.x2 - w.x1, sy = w.y2 - w.y1, qx = w.x1 - bx, qy = w.y1 - by;
        const denom = ux * sy - uy * sx;
        if (Math.abs(denom) < 1e-9) continue;
        const tw = (qx * sy - qy * sx) / denom, u = (qx * uy - qy * ux) / denom;
        if (tw < 0 || u < 0 || u > 1) continue;
        const cos = Math.abs(denom) / Math.hypot(sx, sy); // how square-on the ray meets the wall
        const t = tw - WALL_HALF / Math.max(cos, 0.2);
        if (t < best.t) best = { t, wall: w };
      }
      return best;
    }

    // How far the plunger is pushed in by the nearest wall or the ground along its direction.
    plungerCompression(m) {
      if (!(m.pk > 0) || m.pSpent) return 0;
      const p = this.plungerFrame(m), reach = p.body + m.pL;
      const t = Math.min(p.uy < -1e-6 ? p.by / -p.uy : Infinity, this.rayToWall(p.bx, p.by, p.ux, p.uy).t);
      return t < reach ? Math.min(m.pL, reach - t) : 0;
    }

    plungerEnergy(m) {
      const x = this.plungerCompression(m);
      return 0.5 * m.pk * x * x;
    }

    springLength(s) {
      const A = this.get(s.a), B = this.get(s.b);
      return A && B ? Math.hypot(B.x - A.x, B.y - A.y) : 0;
    }

    bumperDir(b) {
      const a = (b.angle * Math.PI) / 180;
      return { dx: Math.cos(a), dy: Math.sin(a) };
    }

    bumperCompression(b, m) {
      const { dx, dy } = this.bumperDir(b);
      const px = m.x - b.x, py = m.y - b.y;
      const along = px * dx + py * dy;
      const lateral = -px * dy + py * dx;
      if (along <= 0 || Math.abs(lateral) > b.width / 2) return 0;
      return Math.max(0, b.L0 - (along - contactRadius(m)));
    }

    // A slack spring (bungee cord) only stores energy while stretched.
    springStretch(s) {
      const x = this.springLength(s) - s.L0;
      return s.slack ? Math.max(0, x) : x;
    }

    elasticEnergy(s) {
      if (s.type === 'spring') {
        const x = this.springStretch(s);
        return 0.5 * s.k * x * x;
      }
      let U = 0;
      for (const id of s.engaged) {
        const m = this.get(id);
        if (m) { const x = this.bumperCompression(s, m); U += 0.5 * s.k * x * x; }
      }
      return U;
    }

    attachedMasses(s) {
      return s.type === 'spring' ? [s.a, s.b].filter((id) => isMass(this.get(id))) : s.engaged.slice();
    }

    // After an edit, decide which masses are pressing on bumpers and which ropes are taut.
    refreshContacts() {
      for (const b of this.ofType('bumper')) {
        b.engaged = this.masses().filter((m) => this.bumperCompression(b, m) > 0).map((m) => m.id);
      }
      for (const r of this.ofType('rope')) r.taut = this.springLength(r) >= r.L - 1e-3;
    }

    invMass(o) { return isMass(o) && o.mode !== 'track' ? 1 / o.m : 0; }

    // ---- dynamics ------------------------------------------------------------------------

    step(dt) {
      if (this.E0 === null) this.E0 = this.totalEnergy();
      const n = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-9));
      for (let i = 0; i < n; i++) this.substep(dt / n);
      this.time += dt;
      this.correctDrift();
    }

    substep(h) {
      const masses = this.masses();
      for (const m of masses) {
        m.fx = 0;
        m.fy = -m.m * this.g;
        m.px = m.x;
        m.py = m.y;
        m.pvx = m.vx;
        m.pvy = m.vy;
        if (m.cooldown > 0) m.cooldown -= h;
      }
      for (const s of this.ofType('spring')) this.applySpring(s);
      for (const b of this.ofType('bumper')) this.applyBumper(b, masses);
      for (const m of masses) this.applyPlunger(m);

      for (const m of masses) {
        if (m.mode === 'track' && this.integrateOnTrack(m, h)) {
          if (m.mode === 'track') this.collideOnTrack(m);
          continue;
        }
        m.vx += (m.fx / m.m) * h;
        m.vy += (m.fy / m.m) * h;
        m.x += m.vx * h;
        m.y += m.vy * h;
      }

      for (const r of this.ofType('rope')) this.solveRope(r);
      for (const m of masses) if (m.mode !== 'track') this.collideStatic(m);
      this.collidePairs(masses);
    }

    applySpring(s) {
      const A = this.get(s.a), B = this.get(s.b);
      if (!A || !B) return;
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
      if (L < 1e-9) return;
      if (s.slack && L <= s.L0) return;
      const f = s.k * (L - s.L0), ux = dx / L, uy = dy / L;
      if (isMass(A)) { A.fx += f * ux; A.fy += f * uy; }
      if (isMass(B)) { B.fx -= f * ux; B.fy -= f * uy; }
    }

    applyBumper(b, masses) {
      const { dx, dy } = this.bumperDir(b);
      const engaged = [];
      for (const m of masses) {
        const x = this.bumperCompression(b, m);
        if (x <= 0) continue;
        // Only masses that arrived through the plate push on it, so nothing appears
        // inside the spring from the side with energy it never stored.
        if (!b.engaged.includes(m.id) && x > 0.05) continue;
        engaged.push(m.id);
        m.fx += b.k * x * dx;
        m.fy += b.k * x * dy;
      }
      b.engaged = engaged;
    }

    applyPlunger(m) {
      if (!(m.pk > 0) || m.pSpent) return;
      const x = this.plungerCompression(m);
      if (x > 0) {
        const p = this.plungerFrame(m);
        m.fx -= m.pk * x * p.ux;
        m.fy -= m.pk * x * p.uy;
      } else if (m.pOnce && m.pLoaded) {
        m.pSpent = true; // the popper has snapped back; its stored energy is gone into motion
      }
      m.pLoaded = x > 0;
    }

    // Bead-on-a-wire motion along the track. Returns false if the mass left the track
    // before moving this substep (so it should be integrated as a free particle).
    integrateOnTrack(m, h) {
      const t = this.get(m.trackId);
      if (!t || t.type !== 'track') { m.mode = 'free'; return false; }
      const geo = t.geom;
      const p = geo.sample(m.s);
      const ft = m.fx * p.tx + m.fy * p.ty;
      const fn = m.fx * p.nx + m.fy * p.ny;
      let vs = m.vs + (ft / m.m) * h;
      const N = m.m * vs * vs * p.k - fn; // normal force from the track, along +n

      if (!t.sticky && N * m.side < 0) {
        m.vx = m.vs * p.tx;
        m.vy = m.vs * p.ty;
        this.detach(m);
        return false;
      }

      if (t.mu > 0 && vs !== 0) {
        const dv = ((t.mu * Math.abs(N)) / m.m) * h;
        const before = vs;
        vs = Math.abs(vs) > dv ? vs - Math.sign(vs) * dv : 0;
        this.dissipate(0.5 * m.m * (before * before - vs * vs), [m.id, t.id]);
      }

      m.vs = vs;
      m.s += vs * h;
      const off = m.s < 0 || m.s > geo.length;
      if (off) m.s = Math.min(Math.max(m.s, 0), geo.length);
      const q = geo.sample(m.s);
      m.x = q.x;
      m.y = q.y;
      m.vx = vs * q.tx;
      m.vy = vs * q.ty;
      m.angle = m.side === 1 ? Math.atan2(q.ty, q.tx) : Math.atan2(-q.ty, -q.tx);
      if (off) this.detach(m);
      return true;
    }

    // A rider on a track bumps into a wall standing across the track (an end stop) in the
    // direction it is travelling. The bounce keeps e of the speed; the rest becomes internal energy.
    collideOnTrack(m) {
      if (Math.abs(m.vs) < 1e-9) return;
      const geo = this.get(m.trackId).geom, p = geo.sample(m.s), f = this.skaterFrame(m);
      const dir = Math.sign(m.vs), body = m.look === 'cart' ? CART_HALF : SKATER_RADIUS;
      const hit = this.rayToWall(m.x + f.ux * CART_MID, m.y + f.uy * CART_MID, p.tx * dir, p.ty * dir);
      if (hit.t >= body) return;
      const k0 = kinetic(m);
      m.vs = Math.abs(m.vs) < REST_SPEED ? 0 : -m.e * m.vs;
      m.s = Math.min(Math.max(m.s - dir * (body - hit.t), 0), geo.length);
      const q = geo.sample(m.s);
      Object.assign(m, { x: q.x, y: q.y, vx: m.vs * q.tx, vy: m.vs * q.ty });
      this.dissipate(k0 - kinetic(m), [m.id, hit.wall.id]);
    }

    solveRope(r) {
      const A = this.get(r.a), B = this.get(r.b);
      if (!A || !B) return;
      const wa = this.invMass(A), wb = this.invMass(B), w = wa + wb;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
      if (d <= r.L || w === 0) {
        if (d < r.L - 1e-3) r.taut = false;
        return;
      }
      const nx = dx / d, ny = dy / d, excess = d - r.L;
      A.x += (nx * excess * wa) / w; A.y += (ny * excess * wa) / w;
      B.x -= (nx * excess * wb) / w; B.y -= (ny * excess * wb) / w;

      const vax = wa ? A.vx : 0, vay = wa ? A.vy : 0, vbx = wb ? B.vx : 0, vby = wb ? B.vy : 0;
      const vrel = (vbx - vax) * nx + (vby - vay) * ny;
      if (vrel > 0) {
        const kBefore = (wa ? kinetic(A) : 0) + (wb ? kinetic(B) : 0);
        const swinging = wa ? A : B;
        const J = vrel / w;
        if (wa) { A.vx += nx * J * wa; A.vy += ny * J * wa; }
        if (wb) { B.vx -= nx * J * wb; B.vy -= ny * J * wb; }
        if (r.taut && (wa === 0 || wb === 0)) {
          // Already taut and tied to something fixed: tension does no work, so the kinetic energy
          // changes only by the work the other forces did over this substep.
          const m = swinging, sp = Math.hypot(m.vx, m.vy);
          const K = 0.5 * m.m * (m.pvx * m.pvx + m.pvy * m.pvy) + m.fx * (m.x - m.px) + m.fy * (m.y - m.py);
          const target = K > 0 ? Math.sqrt((2 * K) / m.m) : 0;
          if (sp > 1e-9) { m.vx *= target / sp; m.vy *= target / sp; }
        } else if (vrel > REST_SPEED) {
          const kAfter = (wa ? kinetic(A) : 0) + (wb ? kinetic(B) : 0);
          this.dissipate(kBefore - kAfter, [r.id, ...[A, B].filter(isMass).map((o) => o.id)]);
        }
      }
      r.taut = true;
    }

    collideStatic(m) {
      const isBall = m.type === 'ball';
      const r = isBall ? m.r : 0;

      for (const t of this.ofType('track')) {
        if (isBall) {
          if (!t.geom.nearBox(m.x, m.y, r)) continue;
          const n = t.geom.nearest(m.x, m.y);
          if (n.dist < r && n.dist > 1e-9) {
            this.resolveContact(m, (m.x - n.x) / n.dist, (m.y - n.y) / n.dist, r - n.dist, t.mu, [m.id, t.id]);
          }
        } else {
          if (m.cooldown > 0 && m.cooldownTrack === t.id) continue;
          const hit = t.geom.intersectSegment(m.px, m.py, m.x, m.y);
          if (hit) { this.landOnTrack(m, t, hit.s); return; }
        }
      }

      if (m.y < r) {
        this.resolveContact(m, 0, 1, r - m.y, this.earth.mu, [m.id, 'earth']);
        if (!isBall) m.angle *= 0.99;
      }

      const reach = contactRadius(m) + WALL_HALF;
      for (const w of this.ofType('wall')) {
        const c = closestOnSegment(m.x, m.y, w.x1, w.y1, w.x2, w.y2);
        const dx = m.x - c.x, dy = m.y - c.y, d = Math.hypot(dx, dy);
        if (d < reach && d > 1e-9) this.resolveContact(m, dx / d, dy / d, reach - d, w.mu, [m.id, w.id]);
      }
    }

    landOnTrack(m, t, s) {
      const p = t.geom.sample(s);
      const side = (m.px - p.x) * p.nx + (m.py - p.y) * p.ny < 0 ? -1 : 1;
      const before = kinetic(m);
      this.attachToTrack(m, t, s, m.vx * p.tx + m.vy * p.ty, side);
      this.dissipate(before - kinetic(m), [m.id, t.id]);
    }

    resolveContact(m, nx, ny, pen, mu, parts) {
      m.x += nx * pen;
      m.y += ny * pen;
      const vn = m.vx * nx + m.vy * ny;
      if (vn >= 0) return;
      const k0 = kinetic(m);
      const resting = -vn < REST_SPEED;
      const jn = -(1 + (resting ? 0 : m.e)) * vn;
      m.vx += nx * jn;
      m.vy += ny * jn;
      if (!resting) this.dissipate(k0 - kinetic(m), parts);

      if (mu > 0) {
        const tx = -ny, ty = nx, vt = m.vx * tx + m.vy * ty;
        const dv = Math.min(Math.abs(vt), mu * jn);
        if (dv > 0) {
          const k1 = kinetic(m), c = -Math.sign(vt) * dv;
          m.vx += tx * c;
          m.vy += ty * c;
          this.dissipate(k1 - kinetic(m), parts);
        }
      }
    }

    collidePairs(masses) {
      const free = masses.filter((m) => m.mode !== 'track');
      for (let i = 0; i < free.length; i++) {
        for (let j = i + 1; j < free.length; j++) {
          const a = free[i], b = free[j];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          const rr = contactRadius(a) + contactRadius(b);
          if (d >= rr || d < 1e-9) continue;
          const nx = dx / d, ny = dy / d, wa = 1 / a.m, wb = 1 / b.m, w = wa + wb, pen = rr - d;
          a.x -= (nx * pen * wa) / w; a.y -= (ny * pen * wa) / w;
          b.x += (nx * pen * wb) / w; b.y += (ny * pen * wb) / w;
          const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (vrel >= 0) continue;
          const resting = -vrel < REST_SPEED;
          const k0 = kinetic(a) + kinetic(b);
          const J = (-(1 + (resting ? 0 : Math.min(a.e, b.e))) * vrel) / w;
          a.vx -= nx * J * wa; a.vy -= ny * J * wa;
          b.vx += nx * J * wb; b.vy += ny * J * wb;
          if (!resting) this.dissipate(k0 - kinetic(a) - kinetic(b), [a.id, b.id]);
        }
      }
    }

    dissipate(amount, parts) {
      if (!(amount > 0)) return;
      const key = parts.slice().sort().join('|');
      const d = this.dissipation[key] || (this.dissipation[key] = { parts: parts.slice(), amount: 0 });
      d.amount += amount;
    }

    // ---- energy bookkeeping --------------------------------------------------------------

    // Energy of everything (all objects plus Earth), measured from y = 0. Constant in an ideal world.
    totalEnergy() {
      let E = 0;
      for (const m of this.masses()) E += kinetic(m) + m.m * this.g * m.y;
      for (const s of this.objects) if (s.type === 'spring' || s.type === 'bumper') E += this.elasticEnergy(s);
      for (const m of this.masses()) E += this.plungerEnergy(m);
      for (const k in this.dissipation) E += this.dissipation[k].amount;
      return E;
    }

    // The integrator leaks a little energy; nudge speeds so the books stay balanced.
    correctDrift() {
      const err = this.totalEnergy() - this.E0;
      if (!isFinite(err)) return;
      const masses = this.masses();
      const K = masses.reduce((sum, m) => sum + kinetic(m), 0);
      if (Math.abs(err) > 1e-9 && K > 1e-6 && Math.abs(err) < 0.5 * K) {
        const f = Math.sqrt((K - err) / K);
        for (const m of masses) {
          m.vx *= f;
          m.vy *= f;
          if (m.mode === 'track') m.vs *= f;
        }
      } else {
        this.E0 += err;
      }
    }

    // Raw per-object energies; the bar chart applies the system choice on top of these.
    ledger() {
      const diss = {};
      for (const [k, d] of Object.entries(this.dissipation)) diss[k] = { parts: d.parts.slice(), amount: d.amount };
      return {
        g: this.g,
        masses: this.masses().map((m) => ({ id: m.id, m: m.m, y: m.y, K: kinetic(m) })),
        springs: this.objects
          .filter((o) => o.type === 'spring' || o.type === 'bumper')
          .map((s) => ({ id: s.id, U: this.elasticEnergy(s), attached: this.attachedMasses(s) }))
          // A plunger is part of its mass, so it is listed under the mass's id and shares its membership.
          .concat(this.masses().filter((m) => m.pk > 0).map((m) => ({ id: m.id, U: this.plungerEnergy(m), attached: [m.id] }))),
        diss,
      };
    }

    // ---- persistence ---------------------------------------------------------------------

    serialize() {
      const state = {
        version: 1, g: this.g, zeroY: this.zeroY, time: this.time, nextId: this.nextId,
        earth: this.earth, dissipation: this.dissipation, objects: this.objects, scenery: this.scenery,
      };
      return JSON.parse(JSON.stringify(state, (k, v) => (TRANSIENT.has(k) ? undefined : v)));
    }

    load(state) {
      const s = clone(state);
      this.clear();
      Object.assign(this.earth, s.earth || {}, { id: 'earth', type: 'earth' });
      this.g = s.g ?? 9.8;
      this.zeroY = s.zeroY ?? 0;
      this.time = s.time ?? 0;
      this.nextId = s.nextId ?? 1;
      this.dissipation = s.dissipation || {};
      this.scenery = s.scenery || {};
      this.objects = (s.objects || [])
        .filter((o) => DEFAULTS[o.type] && !(o.type === 'track' && !(o.points && o.points.length >= 2)))
        .map((o) => Object.assign(clone(DEFAULTS[o.type]), o));
      for (const t of this.ofType('track')) t.geom = new ES.TrackGeometry(t.points);
      const maxId = Math.max(0, ...this.objects.map((o) => parseInt(String(o.id).split('-').pop(), 10) || 0));
      this.nextId = Math.max(this.nextId, maxId + 1);
    }
  }

  World.constants = { SKATER_RADIUS, WALL_HALF, REST_SPEED, CART_HALF, CART_MID };
  ES.World = World;
  ES.closestOnSegment = closestOnSegment;
})(window.ES = window.ES || {});
