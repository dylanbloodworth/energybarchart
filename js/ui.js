/* App controller: palette, canvas editing, system list, properties and the energy readouts. */
(function (ES) {
  'use strict';

  const { SKATER_RADIUS, WALL_HALF } = ES.World.constants;
  const $ = (sel) => document.querySelector(sel);

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const ch of children.flat()) if (ch != null) node.append(ch);
    return node;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const round3 = (v) => Math.round(v * 1000) / 1000;

  const SVG = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const TOOLS = [
    { id: 'select', label: 'Select', icon: SVG('<path d="M5 3l13 8-6 1.5-2.5 6z" fill="currentColor" stroke="none"/>'),
      hint: 'Click an object to select it, then drag to move it. Drag the Ug = 0 tag up or down to move the reference level, or sideways to slide it out of the way.' },
    { id: 'ball', label: 'Ball', icon: SVG('<circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>'),
      hint: 'Click in the scene to place a ball.' },
    { id: 'cart', label: 'Cart', icon: SVG('<rect x="3" y="8" width="18" height="7" rx="1.5"/><circle cx="8" cy="18" r="2" fill="currentColor"/><circle cx="16" cy="18" r="2" fill="currentColor"/>'),
      hint: 'Click on or near a track to place a cart on it. Give it a spring plunger in Properties.' },
    { id: 'popper', label: 'Popper', icon: SVG('<path d="M4 17a8 6 0 0 1 16 0z"/><path d="M8 14.5l2-1.5 2 1.5 2-1.5 2 1.5" stroke="#ea8a1a"/>'),
      hint: 'Click to place a marble popper, already turned inside out. It pops when it sits on a surface.' },
    { id: 'skater', label: 'Skater', teacher: true, icon: SVG('<circle cx="13" cy="4.5" r="2"/><path d="M12.5 7v5.5M12.5 9l-4 1.5M12.5 9l4 2M12.5 12.5l-3 4.5M12.5 12.5l3 4.5M5 19h14"/><circle cx="8" cy="21" r="1" fill="currentColor"/><circle cx="16" cy="21" r="1" fill="currentColor"/>'),
      hint: 'Click on or near a track to place a skater on it.' },
    { id: 'track', label: 'Track', icon: SVG('<path d="M2 5c3 0 4 13 10 13s7-13 10-13" stroke-width="2.5"/>'),
      hint: 'Click to place a track. Select it, then drag its round handles to reshape it.' },
    { id: 'wall', label: 'Wall', icon: SVG('<path d="M12 3v18" stroke-width="5"/>'),
      hint: 'Press and drag to draw a wall.' },
    { id: 'pin', label: 'Pin', icon: SVG('<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
      hint: 'Click to place a fixed pin. Pins anchor springs and ropes and count as part of Earth.' },
    { id: 'spring', label: 'Spring', icon: SVG('<path d="M3 12h3l1.5-5 3 10 3-10 3 10 1.5-5h3"/>'),
      hint: 'Click two objects (ball, skater or pin) to join them with a spring. Clicking empty space adds a pin there.' },
    { id: 'rope', label: 'Rope', icon: SVG('<circle cx="5" cy="5" r="2"/><path d="M6.5 6.5c4 5 7 8 11 11"/><circle cx="18.5" cy="18.5" r="2.5" fill="currentColor"/>'),
      hint: 'Click two objects to join them with a rope. Clicking empty space adds a pin there.' },
    { id: 'bumper', label: 'Bumper', teacher: true, icon: SVG('<path d="M4 5v14"/><path d="M4 12h2l1.5-4 3 8 3-8 1.5 4h2"/><path d="M18 6v12" stroke-width="2.5"/>'),
      hint: 'Click to place a spring bumper. Choose which way it pushes in Properties.' },
  ];

  const NAME = ['name', 'Name', 'text'];
  const MASS = ['m', 'Mass (kg)', 'number', { min: 0.01, step: 0.1 }];
  const BOUNCE = ['e', 'Bounciness <i>e</i> (0 to 1)', 'number', { min: 0, max: 1, step: 0.05 }];
  const VX = ['vx', 'Starting <i>v<sub>x</sub></i> (m/s)', 'number', { step: 0.5 }];
  const VY = ['vy', 'Starting <i>v<sub>y</sub></i> (m/s)', 'number', { step: 0.5 }];
  const K = ['k', 'Spring constant <i>k</i> (N/m)', 'number', { min: 0.1, step: 10 }];
  const TILT = ['tilt', 'Tilt (degrees, + is counterclockwise)', 'number', { step: 15, get: (m) => Math.round(((m.angle || 0) * 180) / Math.PI) }];
  const LOOK = ['look', 'Looks like', 'select', { options: [['skateboard', 'Skater'], ['person', 'Person'], ['cart', 'Cart']] }];
  const PLUNGER_K = ['pk', 'Plunger spring constant <i>k</i> (N/m), 0 for none', 'number', { min: 0, step: 10 }];
  const PLUNGER_L = ['pL', 'Plunger length (m)', 'number', { min: 0.05, max: 2, step: 0.05 }];
  const POPPER_K = ['pk', 'Popper stiffness <i>k</i> (N/m)', 'number', { min: 1, step: 5 }];
  const FIELDS = {
    earth: [['g', 'Gravitational field <i>g</i> (N/kg)', 'number', { min: 0, max: 50, step: 0.1 }],
            ['mu', 'Ground friction <i>μ</i>', 'number', { min: 0, max: 2, step: 0.05 }]],
    ball: [NAME, MASS, ['r', 'Radius (m)', 'number', { min: 0.05, max: 2, step: 0.05 }], BOUNCE, VX, VY],
    popper: [NAME, MASS, POPPER_K, BOUNCE],
    skater: [NAME, MASS, BOUNCE, LOOK],
    cart: [NAME, MASS, PLUNGER_K, PLUNGER_L, BOUNCE, LOOK],
    track: [NAME, ['mu', 'Friction <i>μ</i> with skaters and balls', 'number', { min: 0, max: 2, step: 0.01 }],
            ['sticky', 'Skaters stay on the track (roller-coaster rails)', 'check']],
    wall: [NAME, ['mu', 'Friction <i>μ</i>', 'number', { min: 0, max: 2, step: 0.05 }]],
    pin: [NAME],
    spring: [NAME, K, ['L0', 'Relaxed length (m)', 'number', { min: 0.05, step: 0.1 }],
             ['slack', 'Goes slack when shorter than its relaxed length (bungee cord)', 'check']],
    rope: [NAME, ['L', 'Length (m)', 'number', { min: 0.1, step: 0.1 }]],
    bumper: [NAME, K, ['L0', 'Relaxed length (m)', 'number', { min: 0.1, step: 0.1 }],
             ['angle', 'Pushes toward', 'select', { options: [[0, 'Right →'], [90, 'Up ↑'], [180, 'Left ←'], [270, 'Down ↓']] }],
             ['width', 'Plate width (m)', 'number', { min: 0.2, max: 4, step: 0.1 }]],
  };
  // Settings left out of the student version: they rarely matter for the stations and add clutter.
  const TEACHER_ONLY = new Set(['e', 'width', 'sticky', 'slack', 'look', 'tilt', 'pL']);
  const fieldsKey = (o) => (o.type === 'ball' && o.look === 'popper' ? 'popper' : o.type === 'skater' && o.look === 'cart' ? 'cart' : o.type);

  const EQUATION = [
    ['Ki', 'K', 'i', 'k'], '+', ['Ugi', 'U', 'gi', 'ug'], '+', ['Usi', 'U', 'si', 'us'], '+', ['W', 'W', '', 'w'], '=',
    ['Kf', 'K', 'f', 'k'], '+', ['Ugf', 'U', 'gf', 'ug'], '+', ['Usf', 'U', 'sf', 'us'], '+', ['dUint', 'ΔU', 'int', 'uint'],
  ];

  class App {
    constructor() {
      // student.html sets data-mode="student": no work column, fewer settings, station scenes only.
      this.student = document.body.dataset.mode === 'student';
      this.tools = TOOLS.filter((t) => !(this.student && t.teacher));
      this.scenes = ES.SCENES.filter((s) => !(this.student && s.group !== 'Stations'));
      this.world = new ES.World();
      this.view = new ES.SceneView($('#scene'));
      this.chart = new ES.BarChart($('#chart'));
      this.running = false;
      this.speed = 1;
      this.tool = 'select';
      this.selectedId = null;
      this.selectedPoint = -1;
      this.drag = null;
      this.connectFrom = null;
      this.pointer = null;
      this.showGrid = true;
      this.showZero = true;
      this.zeroTagX = null; // world x the U_g = 0 tag was slid to; null = left edge
      this.showVectors = false;
      this.showValues = false; // qualitative bar heights first; "Show values" adds the numbers
      this.showWork = true;
      this.snapshot = null;
      this.undoStack = [];
      this.redoStack = [];
      this.dom = {
        hint: $('#hint'), time: $('#time-readout'), props: $('#props'), propsTitle: $('#props-title'),
        systemList: $('#system-list'), unit: $('#unit-note'), work: $('#work-list'), notes: $('#notes'),
        summary: $('#system-summary'), play: $('#btn-play'), boundary: $('#boundary'), live: null,
      };
      this.cache = {};

      this.buildPalette();
      this.buildEquation();
      this.bindToolbar();
      this.bindCanvas();
      this.bindKeys();
      new ResizeObserver(() => this.view.resize()).observe(this.view.canvas.parentElement);
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', () => { this.view.readColors(); this.chart.readColors(); });
      this.loadScene(this.scenes[0].id);
    }

    // ---- setup ---------------------------------------------------------------------------

    buildPalette() {
      const pal = $('#palette');
      for (const t of this.tools) {
        const btn = h('button', { type: 'button', class: 'tool', 'data-tool': t.id, title: t.hint, html: `${t.icon}<span>${t.label}</span>` });
        btn.addEventListener('click', () => this.setTool(t.id));
        pal.append(btn);
      }
      this.setTool('select');
    }

    buildEquation() {
      const box = $('#equation');
      this.eq = {};
      EQUATION.forEach((p, i) => {
        // The W term and the "+" before it are hidden together when the work column is off.
        const wPart = p === '+' ? EQUATION[i + 1][0] === 'W' : p[0] === 'W';
        if (typeof p === 'string') {
          const op = h('span', { class: 'eq-op' + (wPart ? ' w-part' : '') }, p);
          if (p === '=') this.eqEquals = op;
          box.append(op);
          return;
        }
        const [key, sym, sub, color] = p;
        const val = h('span', { class: 'eq-val' }, '0');
        const term = h('span', { class: `eq-term c-${color}` + (wPart ? ' w-part' : '') }, h('span', { class: 'eq-sym', html: `<i>${sym}</i><sub>${sub}</sub>` }), val);
        this.eq[key] = { term, val };
        box.append(term);
      });
    }

    bindToolbar() {
      const sel = $('#scene-select');
      const groups = {};
      for (const s of this.scenes) {
        if (!groups[s.group]) sel.append(groups[s.group] = h('optgroup', { label: s.group }));
        groups[s.group].append(new Option(s.name, s.id));
      }
      sel.addEventListener('change', () => { this.checkpoint(); this.loadScene(sel.value); });

      // The objects menu can be tucked away; remembered per browser.
      const pb = $('#btn-palette');
      let hidden = false;
      try { hidden = localStorage.getItem('energyLab.paletteHidden') === '1'; } catch (err) { /* storage unavailable */ }
      const showPalette = (on) => {
        $('.app').classList.toggle('palette-hidden', !on);
        pb.setAttribute('aria-pressed', String(on));
        pb.title = on ? 'Hide the objects menu' : 'Show the objects menu';
        if (!on && this.tool !== 'select') this.setTool('select');
      };
      showPalette(!hidden);
      pb.addEventListener('click', () => {
        const on = $('.app').classList.contains('palette-hidden');
        showPalette(on);
        try { localStorage.setItem('energyLab.paletteHidden', on ? '0' : '1'); } catch (err) { /* storage unavailable */ }
      });

      this.dom.play.addEventListener('click', () => this.setRunning(!this.running));
      $('#btn-step').addEventListener('click', () => { this.setRunning(false); this.world.step((1 / 30) * this.speed); });
      $('#btn-reset').addEventListener('click', () => { this.checkpoint(); this.resetToInitial(); });
      $('#btn-mark').addEventListener('click', () => {
        this.checkpoint();
        this.setRunning(false);
        this.markInitial();
        this.setHint('This moment is now the initial state for the bar chart.');
      });
      this.dom.undo = $('#btn-undo');
      this.dom.redo = $('#btn-redo');
      this.dom.undo.addEventListener('click', () => this.undo());
      this.dom.redo.addEventListener('click', () => this.redo());
      this.updateUndoButtons();
      $('#speed').addEventListener('change', (e) => { this.speed = Number(e.target.value); });
      $('#opt-grid').addEventListener('change', (e) => { this.showGrid = e.target.checked; });
      $('#opt-zero').addEventListener('change', (e) => { this.showZero = e.target.checked; });
      $('#opt-vectors').addEventListener('change', (e) => { this.showVectors = e.target.checked; });
      $('#opt-values').addEventListener('change', (e) => { this.showValues = e.target.checked; });

      // Remembered per browser so a teacher only has to set it once. Students never see work.
      const ow = $('#opt-work');
      try { this.showWork = localStorage.getItem('energyLab.showWork') !== '0'; } catch (err) { this.showWork = true; }
      if (this.student) this.showWork = false;
      ow.checked = this.showWork;
      ow.addEventListener('change', () => {
        this.showWork = ow.checked;
        this.chart.reset();
        try { localStorage.setItem('energyLab.showWork', ow.checked ? '1' : '0'); } catch (err) { /* storage unavailable */ }
      });

      $('#btn-save').addEventListener('click', () => this.saveScene());
      const file = $('#file-input');
      $('#btn-open').addEventListener('click', () => file.click());
      file.addEventListener('change', () => {
        const f = file.files[0];
        if (!f) return;
        f.text().then((text) => {
          const state = JSON.parse(text);
          this.checkpoint();
          this.world.load(state);
          this.afterLoad();
          this.setHint(`Opened ${f.name}.`);
        }).catch(() => this.setHint('That file could not be read as a saved scene.'));
        file.value = '';
      });
    }

    bindCanvas() {
      const c = this.view.canvas, view = this.view;
      const local = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

      // Two fingers on a touchscreen pinch-zoom and pan; one finger edits as usual.
      this.touches = new Map();
      this.pinch = null;
      const pinchState = () => {
        const [a, b] = [...this.touches.values()];
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      };
      c.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') {
          this.touches.set(e.pointerId, local(e));
          if (this.touches.size === 2) {
            // A second finger turns the gesture into a pinch; finish or drop any drag already started.
            if (this.drag) { if (this.drag.moved) this.onUp(); else this.drag = null; }
            this.pinch = pinchState();
          }
          if (this.pinch) return;
        }
        this.onDown(e);
      });
      c.addEventListener('pointermove', (e) => {
        if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, local(e));
        if (this.pinch) {
          if (this.touches.size < 2) return;
          const now = pinchState();
          view.pan(now.x - this.pinch.x, now.y - this.pinch.y);
          view.zoomAt(now.x, now.y, now.d / this.pinch.d);
          this.pinch = now;
          return;
        }
        this.onMove(e);
      });
      const up = (e) => {
        this.touches.delete(e.pointerId);
        if (this.pinch) { if (!this.touches.size) this.pinch = null; return; }
        this.onUp(e);
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', up);
      c.addEventListener('pointerleave', () => { if (!this.drag) this.pointer = null; });
      c.addEventListener('dblclick', (e) => this.onDouble(e));

      // Ctrl+scroll zooms around the pointer; trackpad pinches arrive as ctrl+wheel in Chrome,
      // Edge and Firefox. While zoomed in, plain scrolling pans instead of scrolling the page.
      c.addEventListener('wheel', (e) => {
        const p = local(e), unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.h : 1;
        if (e.ctrlKey) {
          e.preventDefault();
          view.zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * 0.002));
        } else if (view.zoom > 1.001) {
          e.preventDefault();
          view.pan(-e.deltaX * unit, -e.deltaY * unit);
        }
      }, { passive: false });

      // Safari reports trackpad pinches as gesture events instead.
      let lastScale = 1;
      c.addEventListener('gesturestart', (e) => { e.preventDefault(); lastScale = 1; });
      c.addEventListener('gesturechange', (e) => {
        e.preventDefault();
        if (!this.pinch) { const p = local(e); view.zoomAt(p.x, p.y, e.scale / lastScale); }
        lastScale = e.scale;
      });
    }

    bindKeys() {
      document.addEventListener('keydown', (e) => {
        if (e.target.closest && e.target.closest('input, select, textarea')) return; // let fields undo their own text
        const key = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
          e.preventDefault();
          if (key === 'y' || e.shiftKey) this.redo();
          else this.undo();
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === ' ') {
          if (e.target.closest && e.target.closest('button')) return; // the button handles its own Space
          e.preventDefault();
          this.setRunning(!this.running);
        }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelection(); }
        else if (e.key === 'Escape') { this.connectFrom = null; this.setTool('select'); }
      });
    }

    // ---- state ---------------------------------------------------------------------------

    loadScene(id) {
      const scene = this.scenes.find((s) => s.id === id) || this.scenes[0];
      this.world.clear();
      scene.build(this.world);
      this.view.resetZoom();
      $('#scene-select').value = scene.id;
      this.afterLoad();
    }

    afterLoad() {
      this.world.refreshContacts();
      this.selectedId = null;
      this.selectedPoint = -1;
      this.connectFrom = null;
      this.setRunning(false);
      this.markInitial();
      this.refreshPanels();
    }

    markInitial() {
      this.world.time = 0;
      this.world.E0 = null;
      this.snapshot = { state: this.world.serialize(), ledger: this.world.ledger() };
      this.chart.reset();
    }

    // Back to the initial state, but keep the current choice of system.
    resetToInitial() {
      this.setRunning(false);
      const membership = { earth: this.world.earth.inSystem };
      for (const o of this.world.objects) membership[o.id] = o.inSystem;
      this.world.load(this.snapshot.state);
      this.world.earth.inSystem = membership.earth;
      for (const o of this.world.objects) if (o.id in membership) o.inSystem = membership[o.id];
      this.world.E0 = null;
      this.chart.reset();
      this.refreshPanels();
    }

    // ---- undo / redo ----------------------------------------------------------------------
    // Each entry is the whole setup just before a change: world state, initial-state snapshot
    // and selection. Running the simulation is not recorded; Reset covers that.

    captureState() {
      return { world: this.world.serialize(), snapshot: this.snapshot, selectedId: this.selectedId };
    }

    restoreState(s) {
      this.setRunning(false);
      this.drag = null;
      this.connectFrom = null;
      this.world.load(s.world);
      this.world.E0 = null;
      this.snapshot = s.snapshot;
      this.selectedId = s.selectedId && this.world.get(s.selectedId) ? s.selectedId : null;
      this.selectedPoint = -1;
      this.chart.reset();
      this.refreshPanels();
    }

    checkpoint(state = this.captureState()) {
      this.undoStack.push(state);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
      this.updateUndoButtons();
    }

    undo() {
      if (!this.undoStack.length || this.drag) return;
      this.redoStack.push(this.captureState());
      this.restoreState(this.undoStack.pop());
      this.updateUndoButtons();
      this.setHint('Undone. Press Ctrl+Y to redo.');
    }

    redo() {
      if (!this.redoStack.length || this.drag) return;
      this.undoStack.push(this.captureState());
      this.restoreState(this.redoStack.pop());
      this.updateUndoButtons();
      this.setHint('Redone.');
    }

    updateUndoButtons() {
      if (!this.dom.undo) return;
      this.dom.undo.disabled = !this.undoStack.length;
      this.dom.redo.disabled = !this.redoStack.length;
    }

    // Any change to the setup redefines the initial state.
    edited(rebuildProps = true) {
      this.setRunning(false);
      this.world.refreshContacts();
      this.markInitial();
      this.refreshSystemList();
      if (rebuildProps) this.refreshProps();
    }

    setRunning(on) {
      this.running = on;
      this.dom.play.textContent = on ? 'Pause' : 'Play';
      this.dom.play.classList.toggle('primary', !on);
      this.dom.play.setAttribute('aria-pressed', String(on));
    }

    setTool(id) {
      this.tool = id;
      this.connectFrom = null;
      for (const b of document.querySelectorAll('.tool')) b.classList.toggle('active', b.dataset.tool === id);
      this.view.canvas.style.cursor = id === 'select' ? 'default' : 'crosshair';
      this.setHint(TOOLS.find((t) => t.id === id).hint);
    }

    setHint(text) { this.dom.hint.textContent = text; }

    selected() { return this.selectedId ? this.world.get(this.selectedId) : null; }

    select(id, point = -1) {
      this.selectedId = id;
      this.selectedPoint = point;
      this.refreshPanels();
    }

    setInSystem(id, on) {
      const o = this.world.get(id);
      if (!o || !!o.inSystem === on) return;
      this.checkpoint();
      o.inSystem = on;
      this.chart.reset();
      this.refreshSystemList();
      if (id === this.selectedId) this.refreshProps();
    }

    deleteSelection() {
      const obj = this.selected();
      if (!obj || obj.type === 'earth') return;
      this.checkpoint();
      if (obj.type === 'track' && this.selectedPoint >= 0) {
        if (obj.points.length > 2) {
          obj.points.splice(this.selectedPoint, 1);
          this.world.rebuildTrack(obj);
        }
        this.selectedPoint = -1;
      } else {
        this.world.remove(obj.id);
        this.selectedId = null;
      }
      this.edited();
    }

    saveScene() {
      const state = JSON.parse(JSON.stringify(this.snapshot.state));
      state.earth.inSystem = this.world.earth.inSystem;
      for (const o of state.objects) { const live = this.world.get(o.id); if (live && 'inSystem' in live) o.inSystem = live.inSystem; }
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: 'energy-scene.json' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // ---- canvas interaction --------------------------------------------------------------

    worldPoint(e) {
      const r = this.view.canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      return { x: this.view.wx(px), y: this.view.wy(py), px, py };
    }

    tol() { return 10 / this.view.scale; }

    hitTest(p) {
      const w = this.world, tol = this.tol(), sel = this.selected();
      const near = (x, y, r) => Math.hypot(p.x - x, p.y - y) < r;
      const segDist = (x1, y1, x2, y2) => { const c = ES.closestOnSegment(p.x, p.y, x1, y1, x2, y2); return Math.hypot(p.x - c.x, p.y - c.y); };

      if (sel && sel.type === 'track') {
        for (let i = 0; i < sel.points.length; i++) if (near(sel.points[i].x, sel.points[i].y, tol * 1.4)) return { obj: sel, part: 'point', index: i };
      }
      if (sel && sel.type === 'skater' && sel.mode !== 'track' && !this.student) {
        const hd = this.rotateHandle(sel);
        if (near(hd.x, hd.y, tol * 1.5)) return { obj: sel, part: 'rotate' };
      }
      if (sel && sel.type === 'wall') {
        if (near(sel.x1, sel.y1, tol * 1.4)) return { obj: sel, part: 'p1' };
        if (near(sel.x2, sel.y2, tol * 1.4)) return { obj: sel, part: 'p2' };
      }
      if (this.showZero && Math.abs(this.view.sy(w.zeroY) - p.py) < 12) {
        const left = this.view.zeroTagLeft(this.zeroTagX);
        if (p.px >= left - 2 && p.px <= left + 74) return { zero: true };
      }

      for (const m of w.masses().reverse()) {
        if (m.type === 'ball' && near(m.x, m.y, m.r + tol)) return { obj: m, part: 'body' };
        if (m.type === 'skater') {
          const f = w.skaterFrame(m), hh = w.riderHeight(m) * 0.45;
          if (near(m.x + f.ux * hh, m.y + f.uy * hh, Math.max(hh, 0.4) + tol * 0.5)) return { obj: m, part: 'body' };
        }
      }
      for (const pin of w.ofType('pin')) if (near(pin.x, pin.y, 0.12 + tol)) return { obj: pin, part: 'body' };
      for (const s of [...w.ofType('spring'), ...w.ofType('rope')]) {
        const A = w.get(s.a), B = w.get(s.b);
        if (A && B && segDist(A.x, A.y, B.x, B.y) < tol) return { obj: s, part: 'body' };
      }
      for (const b of w.ofType('bumper')) {
        const { dx, dy } = w.bumperDir(b);
        if (segDist(b.x, b.y, b.x + dx * b.L0, b.y + dy * b.L0) < Math.max(b.width / 2, tol)) return { obj: b, part: 'body' };
      }
      for (const wall of w.ofType('wall')) if (segDist(wall.x1, wall.y1, wall.x2, wall.y2) < WALL_HALF + tol) return { obj: wall, part: 'body' };
      for (const t of w.ofType('track')) if (t.geom.nearest(p.x, p.y).dist < tol * 1.5) return { obj: t, part: 'body' };      if (p.y < 0) return { obj: w.earth, part: 'body' };
      return null;
    }

    onDown(e) {
      const p = this.worldPoint(e), w = this.world;
      this.pointer = p;
      try { this.view.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-released pointer */ }
      // Select records undo once a drag actually moves something; connectors record on their first click.
      if (!['select', 'spring', 'rope'].includes(this.tool)) this.checkpoint();

      switch (this.tool) {
        case 'select': return this.beginDrag(p);
        case 'ball': return this.placed(w.create('ball', { x: p.x, y: Math.max(p.y, 0.3) }));
        case 'pin': return this.placed(w.create('pin', { x: p.x, y: p.y }));
        case 'bumper': return this.placed(w.create('bumper', { x: p.x, y: Math.max(p.y, 0) }));        case 'popper': {
          const n = w.masses().filter((m) => m.look === 'popper').length + 1;
          return this.placed(w.create('ball', {
            name: `Popper ${n}`, look: 'popper', color: '#f2a541', m: 0.02, r: 0.25, e: 0.3,
            pk: 50, pL: 0.15, pOnce: true, x: p.x, y: Math.max(p.y, 0.25),
          }));
        }
        case 'skater':
        case 'cart': {
          const cart = this.tool === 'cart';
          const n = w.masses().filter((m) => (m.look === 'cart') === cart && m.type === 'skater').length + 1;
          const s = w.create('skater', cart
            ? { name: `Cart ${n}`, look: 'cart', m: 0.5, x: p.x, y: Math.max(p.y, 0) }
            : { x: p.x, y: Math.max(p.y, 0) });
          const near = w.nearestTrack(p.x, p.y, 1);
          if (near) w.attachToTrack(s, near.track, near.s, 0, near.side);
          return this.placed(s);
        }
        case 'track': {
          const x = p.x, y = Math.max(p.y, 0.3);
          return this.placed(w.create('track', {
            points: [{ x: x - 3, y: y + 2.5 }, { x: x - 1.6, y: y + 0.6 }, { x, y }, { x: x + 1.6, y: y + 0.6 }, { x: x + 3, y: y + 2.5 }],
          }));
        }
        case 'wall':
          this.drag = { kind: 'newwall', x1: p.x, y1: Math.max(p.y, 0), x2: p.x, y2: Math.max(p.y, 0) };
          return;
        case 'spring':
        case 'rope':
          return this.connectClick(p);
      }
    }

    placed(obj) {
      this.setTool('select');
      this.selectedId = obj.id;
      this.selectedPoint = -1;
      this.edited();
    }

    connectClick(p) {
      if (!this.connectFrom) this.checkpoint();
      const w = this.world, hit = this.hitTest(p);
      const ok = hit && hit.obj && ['ball', 'skater', 'pin'].includes(hit.obj.type) && hit.part === 'body';
      const id = ok ? hit.obj.id : w.create('pin', { x: p.x, y: p.y }).id;
      if (!this.connectFrom) {
        this.connectFrom = id;
        this.setHint('Now click the second object (or empty space for a pin).');
        return;
      }
      if (id === this.connectFrom) return;
      const A = w.get(this.connectFrom), B = w.get(id);
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      const obj = this.tool === 'spring'
        ? w.create('spring', { a: A.id, b: B.id, L0: d > 0.1 ? d : 1 })
        : w.create('rope', { a: A.id, b: B.id, L: Math.max(d, 0.1) });
      this.connectFrom = null;
      this.placed(obj);
    }

    beginDrag(p) {
      const hit = this.hitTest(p);
      if (!hit) { this.select(null); return; }
      if (hit.zero) {
        this.drag = { kind: 'zero', pre: this.captureState(), moved: false, start: p, left: this.view.zeroTagLeft(this.zeroTagX), axis: null };
        return;
      }
      this.select(hit.obj.id, hit.part === 'point' ? hit.index : -1);
      if (hit.obj.type === 'earth' || hit.obj.type === 'spring' || hit.obj.type === 'rope') return;
      this.setRunning(false);
      this.drag = {
        kind: 'move', obj: hit.obj, part: hit.part, index: hit.index, start: p, moved: false, pre: this.captureState(),
        orig: JSON.parse(JSON.stringify(hit.obj, (k, v) => (k === 'geom' ? undefined : v))),
      };
    }

    onMove(e) {
      const p = this.worldPoint(e);
      this.pointer = p;
      const d = this.drag;
      if (!d) {
        if (this.tool === 'select') this.view.canvas.style.cursor = this.hitTest(p) ? 'pointer' : 'default';
        return;
      }
      if (d.kind === 'zero') {
        // The first few pixels decide the drag: sideways slides the tag out of the way (display
        // only), up and down moves the zero level. Locking keeps a sideways nudge off the chart.
        const dpx = p.px - d.start.px, dpy = p.py - d.start.py;
        if (!d.axis) {
          if (Math.max(Math.abs(dpx), Math.abs(dpy)) < 5) return;
          d.axis = Math.abs(dpx) > Math.abs(dpy) ? 'x' : 'y';
        }
        if (d.axis === 'x') { this.zeroTagX = this.view.wx(d.left + dpx); return; }
        const y = Math.max(-1, Math.round(p.y * 10) / 10);
        if (y === this.world.zeroY) return;
        if (!d.moved) { this.checkpoint(d.pre); d.moved = true; }
        this.world.zeroY = y;
        this.chart.reset();
        return;
      }
      if (d.kind === 'newwall') { d.x2 = p.x; d.y2 = Math.max(p.y, 0); return; }

      const DX = p.x - d.start.x, DY = p.y - d.start.y, o = d.obj, orig = d.orig;
      if (!d.moved && Math.hypot(DX, DY) < this.tol() * 0.3) return;
      if (!d.moved) this.checkpoint(d.pre);
      d.moved = true;
      if (d.part === 'rotate') {
        const deg = ((Math.atan2(p.y - o.y, p.x - o.x) - Math.PI / 2) * 180) / Math.PI;
        o.angle = (Math.round(deg / 5) * 5 * Math.PI) / 180; // snap to 5°
        return;
      }
      switch (o.type) {
        case 'ball':
          o.x = orig.x + DX; o.y = Math.max(orig.y + DY, o.r);
          break;
        case 'skater':
          if (o.mode === 'track') { o.mode = 'free'; o.trackId = null; }
          o.x = orig.x + DX; o.y = Math.max(orig.y + DY, 0);
          break;
        case 'pin':
        case 'bumper':
          o.x = orig.x + DX; o.y = orig.y + DY;
          break;        case 'wall':
          if (d.part !== 'p2') { o.x1 = orig.x1 + DX; o.y1 = Math.max(orig.y1 + DY, 0); }
          if (d.part !== 'p1') { o.x2 = orig.x2 + DX; o.y2 = Math.max(orig.y2 + DY, 0); }
          break;
        case 'track':
          if (d.part === 'point') {
            o.points[d.index] = { x: orig.points[d.index].x + DX, y: Math.max(orig.points[d.index].y + DY, 0) };
          } else {
            o.points = orig.points.map((q) => ({ x: q.x + DX, y: q.y + DY }));
          }
          this.world.rebuildTrack(o);
          break;
      }
    }

    onUp() {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.kind === 'zero') return;
      if (d.kind === 'newwall') {
        let { x1, y1, x2, y2 } = d;
        if (Math.hypot(x2 - x1, y2 - y1) < 0.3) { x2 = x1; y1 = Math.max(y1 - 1.5, 0); y2 = y1 + 3; }
        this.placed(this.world.create('wall', { x1, y1, x2, y2 }));
        return;
      }
      if (!d.moved) return;
      const o = d.obj;
      if (o.look === 'popper') o.pSpent = false; // picking a popper up turns it inside out again
      if (o.type === 'skater' && d.part !== 'rotate') {
        const near = this.world.nearestTrack(o.x, o.y, 0.5);
        if (near) {
          // Ride on whichever side of the track the skater's head points to, so an upside-down
          // skater dropped on a track ends up underneath it.
          const f = this.world.skaterFrame(o), q = near.track.geom.sample(near.s);
          const side = f.ux * q.nx + f.uy * q.ny >= 0 ? 1 : -1;
          this.world.attachToTrack(o, near.track, near.s, d.orig.mode === 'track' ? d.orig.vs : 0, side);
        } else if (d.orig.mode === 'track') { o.vx = 0; o.vy = 0; }
      }
      this.edited();
    }

    onDouble(e) {
      const sel = this.selected();
      if (this.tool !== 'select' || !sel || sel.type !== 'track') return;
      const p = this.worldPoint(e), n = sel.geom.nearest(p.x, p.y);
      if (n.dist > this.tol() * 2) return;
      this.checkpoint();
      const sOf = sel.points.map((q) => sel.geom.nearest(q.x, q.y).s);
      let idx = sOf.findIndex((s) => s > n.s);
      if (idx <= 0) idx = idx === 0 ? 1 : sel.points.length - 1;
      sel.points.splice(idx, 0, { x: n.x, y: n.y });
      this.world.rebuildTrack(sel);
      this.selectedPoint = idx;
      this.edited();
    }

    preview() {
      const d = this.drag;
      if (d && d.kind === 'newwall') return { kind: 'wall', x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 };
      if (this.connectFrom && this.pointer) {
        const A = this.world.get(this.connectFrom);
        if (A) return { kind: 'line', x1: A.x, y1: A.y, x2: this.pointer.x, y2: this.pointer.y };
      }
      return null;
    }

    // ---- panels --------------------------------------------------------------------------

    refreshPanels() {
      this.refreshSystemList();
      this.refreshProps();
    }

    refreshSystemList() {
      const ul = this.dom.systemList;
      ul.innerHTML = '';
      const items = [this.world.earth, ...this.world.objects.filter((o) => o.type !== 'pin')];
      for (const o of items) {
        const cb = h('input', { type: 'checkbox', 'aria-label': `${o.name} is part of the system` });
        cb.checked = !!o.inSystem;
        cb.addEventListener('change', () => this.setInSystem(o.id, cb.checked));
        const name = h('button', { type: 'button', class: 'linkish' + (o.id === this.selectedId ? ' current' : '') }, o.name);
        name.addEventListener('click', () => this.select(o.id));
        ul.append(h('li', {}, cb, name));
      }
    }

    refreshProps() {
      const box = this.dom.props, obj = this.selected();
      box.innerHTML = '';
      this.dom.live = null;
      this.dom.propsTitle.textContent = obj ? obj.name : 'Properties';
      if (!obj) {
        box.append(h('p', { class: 'muted' }, 'Select an object to edit it. Click the ground to edit Earth (gravitational field and ground friction).'));
        return;
      }
      if (obj.type !== 'pin') {
        const cb = h('input', { type: 'checkbox', id: 'f-insystem' });
        cb.checked = !!obj.inSystem;
        cb.addEventListener('change', () => this.setInSystem(obj.id, cb.checked));
        box.append(h('div', { class: 'field check system-toggle' }, cb, h('label', { for: 'f-insystem' }, 'Part of the system')));
      } else {
        box.append(h('p', { class: 'muted small' }, 'Pins are fixed to the Earth, so they are in the system whenever Earth is.'));
      }

      let fields = FIELDS[fieldsKey(obj)].slice();
      if (obj.type === 'skater') {
        if (obj.mode === 'track') fields.push(['vs', 'Starting speed along the track (m/s)', 'number', { step: 0.5 }]);
        else fields.push(VX, VY, TILT);
      }
      if (this.student) fields = fields.filter((f) => !TEACHER_ONLY.has(f[0]));
      for (const f of fields) box.append(this.field(obj, ...f));
      if (obj.type === 'skater' && !this.student) box.append(this.skaterActions(obj));

      this.dom.live = h('p', { class: 'live' });
      box.append(this.dom.live);
      if (obj.type === 'track') {
        box.append(h('p', { class: 'muted small' }, 'Drag the round handles to reshape the track. Double-click the track to add a handle. Select a handle and press Delete to remove it.'));
      }
      if (obj.type !== 'earth') {
        const label = obj.type === 'track' && this.selectedPoint >= 0 ? 'Delete handle' : 'Delete';
        box.append(h('button', { type: 'button', class: 'danger', onclick: () => this.deleteSelection() }, label));
      }
    }

    skaterActions(m) {
      const row = h('div', { class: 'skater-actions' });
      const act = (label, fn) => row.append(h('button', { type: 'button', onclick: () => { this.checkpoint(); fn(); this.edited(); } }, label));
      act(m.facing === -1 ? 'Face right' : 'Face left', () => { m.facing = m.facing === -1 ? 1 : -1; });
      if (m.mode === 'track') {
        act(m.side === 1 ? 'Ride under the track' : 'Ride on top of the track', () => {
          this.world.attachToTrack(m, this.world.get(m.trackId), m.s, m.vs, -m.side);
        });
      } else {
        act('Rotate ⟲ 15°', () => { m.angle += Math.PI / 12; });
        act('Rotate ⟳ 15°', () => { m.angle -= Math.PI / 12; });
      }
      return h('div', {}, row, h('p', { class: 'muted small' }, m.mode === 'track'
        ? 'On a track, the track sets the tilt. Drag the skater off the track to rotate freely.'
        : 'Drag the round handle above the head to rotate. Drop an upside-down skater on a track to ride underneath it.'));
    }

    rotateHandle(m) {
      const f = this.world.skaterFrame(m), d = this.world.riderHeight(m) + 0.9;
      return { x: m.x + f.ux * d, y: m.y + f.uy * d };
    }

    field(obj, key, label, kind, opts = {}) {
      const id = `f-${key}`;
      let input;
      if (kind === 'check') {
        input = h('input', { type: 'checkbox', id });
        input.checked = !!obj[key];
      } else if (kind === 'select') {
        input = h('select', { id });
        for (const [v, t] of opts.options) input.add(new Option(t, String(v)));
        input.value = String(obj[key]);
      } else {
        input = h('input', { type: kind === 'number' ? 'number' : 'text', id });
        if (kind === 'number') {
          if (opts.min != null) input.min = opts.min;
          if (opts.max != null) input.max = opts.max;
          if (opts.step != null) input.step = opts.step;
          input.value = String(round3(opts.get ? opts.get(obj) : obj[key]));
        } else {
          input.value = obj[key];
        }
      }
      input.addEventListener('change', () => {
        let v;
        if (kind === 'check') v = input.checked;
        else if (kind === 'select') v = typeof obj[key] === 'number' ? Number(input.value) : input.value;
        else if (kind === 'number') {
          v = parseFloat(input.value);
          if (!isFinite(v)) { input.value = String(round3(opts.get ? opts.get(obj) : obj[key])); return; }
          if (opts.min != null) v = Math.max(opts.min, v);
          if (opts.max != null) v = Math.min(opts.max, v);
          input.value = String(round3(v));
        } else {
          v = input.value.trim() || obj[key];
        }
        this.setProp(obj, key, v);
      });
      const lab = h('label', { for: id, html: label });
      return kind === 'check' ? h('div', { class: 'field check' }, input, lab) : h('div', { class: 'field' }, lab, input);
    }

    setProp(obj, key, v) {
      this.checkpoint();
      if (key === 'tilt') {
        obj.angle = (v * Math.PI) / 180;
        this.edited(false);
        return;
      }
      obj[key] = v;
      if (key === 'name') {
        this.dom.propsTitle.textContent = v;
        this.refreshSystemList();
        return;
      }
      if (key === 'vs') {
        const t = this.world.get(obj.trackId);
        if (t) { const p = t.geom.sample(obj.s); obj.vx = v * p.tx; obj.vy = v * p.ty; }
      }
      if (key === 'r') obj.y = Math.max(obj.y, v);
      this.edited(key === 'look'); // a new look brings different settings
    }

    // ---- per-frame -----------------------------------------------------------------------

    render() {
      const w = this.world;
      this.view.draw(w, {
        selectedId: this.selectedId, selectedPoint: this.selectedPoint,
        showGrid: this.showGrid, showVectors: this.showVectors, preview: this.preview(), canRotate: !this.student,
        showZero: this.showZero, zeroTagX: this.zeroTagX,
      });
      const E = ES.computeEnergy(w, this.snapshot.ledger, w.ledger(), { frictionInternal: this.frictionInternal });
      const unit = this.chart.draw(E, this.showValues, this.showWork);
      this.updateEquation(E, unit);
      this.dom.time.textContent = `t = ${w.time.toFixed(2)} s`;
      this.updateLive();
    }

    setHtml(node, key, html) {
      if (this.cache[key] === html) return;
      this.cache[key] = html;
      node.innerHTML = html;
    }

    updateEquation(E, unit) {
      const w = this.world;
      const tol = Math.max(1e-6, 0.002 * Math.max(this.chart.maxPos, this.chart.maxNeg));
      const fmt = (v) => ES.fmtEnergy(v, tol);
      const sign = (v) => (Math.abs(v) < tol ? 'zero' : v > 0 ? 'positive' : 'negative');

      const anyMass = w.masses().some((m) => m.inSystem);
      const anySpring = w.objects.some((o) => (o.type === 'spring' || o.type === 'bumper' || o.pk > 0) && o.inSystem);
      const off = { Ki: !anyMass, Kf: !anyMass, Ugi: !(anyMass && w.earth.inSystem), Ugf: !(anyMass && w.earth.inSystem), Usi: !anySpring, Usf: !anySpring };
      for (const [key, { term, val }] of Object.entries(this.eq)) {
        val.textContent = this.showValues ? fmt(E[key]) : '';
        term.classList.toggle('off', !!off[key]);
      }
      $('#equation').classList.toggle('no-work', !this.showWork);
      const unequal = !!this.chart.unequal;
      if (this.eqEquals.textContent !== (unequal ? '≠' : '=')) this.eqEquals.textContent = unequal ? '≠' : '=';
      this.eqEquals.classList.toggle('unequal', unequal);

      this.dom.unit.textContent = this.showValues
        ? `Values in joules. One grid square = ${unit.toLocaleString()} J.`
        : 'Values hidden: compare the bar heights.';

      const items = E.work.filter((it) => Math.abs(it.value) >= tol);
      if (Math.abs(E.residual) >= tol * 5) items.push({ label: 'other objects outside the system', value: E.residual });
      const initial = E.Ki + E.Ugi + E.Usi, final = E.Kf + E.Ugf + E.Usf + E.dUint;
      const workHtml = !this.showWork
        ? (this.showValues
          ? `<li class="totals"><span>Initial total <b>${fmt(initial)} J</b></span><span>Final total <b>${fmt(final)} J</b></span></li>`
          : '<li class="muted">Compare the total height of the initial bars with the final bars.</li>')
        : items.length
        ? items.map((it) => `<li><span>Work done by ${esc(it.label)}</span><b>${this.showValues ? fmt(it.value) + ' J' : sign(it.value)}</b></li>`).join('')
        : Math.abs(E.W) < tol
          ? '<li class="muted">No work crosses the system boundary. The system is isolated, so its total energy stays constant.</li>'
          : '';
      this.setHtml(this.dom.work, 'work', workHtml);

      // Without the work column, say plainly which outside objects are pushing or pulling.
      const warn = !this.showWork && unequal ? this.boundaryWarnings(E, tol) : [];
      this.setHtml(this.dom.boundary, 'boundary', warn.length
        ? '<p class="boundary-title">⚠ Not isolated: energy is crossing the system boundary.</p>'
          + '<p class="boundary-tip">To make the system isolated, add these objects to it.</p>'
          + `<ul>${warn.map((n) => `<li>${n}</li>`).join('')}</ul>`
        : '');
      this.dom.boundary.hidden = !warn.length;

      const notes = [];
      if (this.showWork && E.work.some((it) => it.kind === 'dissipation' && Math.abs(it.value) >= tol)) {
        notes.push('Friction or an impact is happening between an object inside the system and one outside it. Put both objects in the system to see that energy as an increase in internal energy (ΔU<sub>int</sub>).');
      }
      if (!w.masses().some((m) => m.inSystem)) notes.push('No moving objects are in the system. Check some boxes in the System list.');
      this.setHtml(this.dom.notes, 'notes', notes.map((n) => `<p>${n}</p>`).join(''));

      const members = [w.earth, ...w.objects.filter((o) => o.type !== 'pin')].filter((o) => o.inSystem).map((o) => esc(o.name));
      this.setHtml(this.dom.summary, 'summary', members.length ? `<b>System:</b> ${members.join(', ')}` : '<b>System:</b> empty');
    }

    // One sentence per outside object that changes the system's energy.
    boundaryWarnings(E, tol) {
      const w = this.world, name = (id) => `<b>${esc((w.get(id) || { name: id }).name)}</b>`;
      const list = (ids) => ids.map(name).join(' and ');
      const out = new Set();
      for (const it of E.work) {
        if (Math.abs(it.value) < tol) continue;
        if (it.kind === 'gravity') out.add('<b>Earth</b> is outside the system, but it pulls on objects inside it.');
        else if (it.kind === 'spring') out.add(`<b>${esc(it.label)}</b> is outside the system, but it pushes or pulls on an object inside it.`);
        else if (it.kind === 'dissipation') {
          const outside = it.parts.filter((id) => !w.inSystem(id)), inside = it.parts.filter((id) => w.inSystem(id));
          out.add(`${list(outside)} ${outside.length > 1 ? 'are' : 'is'} outside the system, but ${outside.length > 1 ? 'they rub' : 'it rubs'} against or ${outside.length > 1 ? 'hit' : 'hits'} ${list(inside)}.`);
        }
      }
      if (!out.size || Math.abs(E.residual) >= tol * 5) out.add('Something outside the system pushes or pulls on an object inside it.');
      return [...out];
    }

    updateLive() {
      const node = this.dom.live, o = this.selected();
      if (!node || !o) return;
      const w = this.world;
      let text = '';
      if (o.type === 'ball' || o.type === 'skater') {
        text = `Now: speed ${Math.hypot(o.vx, o.vy).toFixed(2)} m/s · height above the Ug = 0 line ${(o.y - w.zeroY).toFixed(2)} m`;
      } else if (o.type === 'spring') {
        const L = w.springLength(o);
        text = o.slack && L < o.L0
          ? `Now: length ${L.toFixed(2)} m · slack`
          : `Now: length ${L.toFixed(2)} m · stretch ${(L - o.L0).toFixed(2)} m`;
      } else if (o.type === 'bumper') {
        let comp = 0;
        for (const id of o.engaged) { const m = w.get(id); if (m) comp = Math.max(comp, w.bumperCompression(o, m)); }
        text = `Now: compressed ${comp.toFixed(2)} m`;
      } else if (o.type === 'rope') {
        text = o.taut ? 'Now: taut' : 'Now: slack';
      }
      if (node.textContent !== text) node.textContent = text;
    }
  }

  ES.App = App;
  ES.SKATER_RADIUS = SKATER_RADIUS;
})(window.ES = window.ES || {});
