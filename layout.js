/* Draggable gutters that resize the simulation, the side panels and the bar chart.
 * Sizes are CSS variables on <html>, remembered per browser. Double-click a gutter to reset it;
 * arrow keys nudge it when it has focus.
 */
(function (ES) {
  'use strict';

  const STORE = 'energyLab.layout';
  const NARROW = window.matchMedia('(max-width: 1100px)');
  const $ = (sel) => document.querySelector(sel);

  // Each size: the CSS variable it drives, the element it measures, and its allowed range (px).
  const SIZES = {
    inspector: {
      prop: '--inspector-w', el: () => $('.inspector'),
      // Leave the simulation at least 360 px: app padding 32, palette 84 + 12, gutter 14.
      range: () => [280, Math.max(280, $('.app').clientWidth - 32 - 96 - 14 - 360)],
    },
    stage: { prop: '--stage-h', el: () => $('.stage'), range: () => [260, Math.max(260, window.innerHeight * 1.5)] },
    chart: { prop: '--chart-h', el: () => $('#chart'), range: () => [150, 700] },
  };

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (err) { saved = {}; }

  const persist = () => {
    try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (err) { /* storage unavailable */ }
  };

  // `remember` is false when re-fitting a saved size to the window, so the user's choice survives.
  function apply(name, px, remember = true) {
    const [lo, hi] = SIZES[name].range();
    px = Math.round(Math.min(hi, Math.max(lo, px)));
    document.documentElement.style.setProperty(SIZES[name].prop, px + 'px');
    if (remember) saved[name] = px;
  }

  function reset(name) {
    document.documentElement.style.removeProperty(SIZES[name].prop);
    delete saved[name];
    persist();
  }

  function measure(name, axis) {
    const r = SIZES[name].el().getBoundingClientRect();
    return axis === 'x' ? r.width : r.height;
  }

  // `pick` returns what the gutter controls right now: { name, axis, sign }. sign = -1 means
  // dragging right/down makes the target smaller.
  function bind(gutter, pick) {
    let drag = null;
    const updateAria = () => gutter.setAttribute('aria-orientation', pick().axis === 'x' ? 'vertical' : 'horizontal');
    updateAria();
    if (NARROW.addEventListener) NARROW.addEventListener('change', updateAria);

    gutter.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const t = pick();
      drag = { t, start: t.axis === 'x' ? e.clientX : e.clientY, size: measure(t.name, t.axis) };
      try { gutter.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      gutter.classList.add('dragging');
      document.body.classList.add('resizing');
      document.body.style.setProperty('--resize-cursor', t.axis === 'x' ? 'col-resize' : 'row-resize');
      e.preventDefault();
    });
    gutter.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const pos = drag.t.axis === 'x' ? e.clientX : e.clientY;
      apply(drag.t.name, drag.size + drag.t.sign * (pos - drag.start));
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      gutter.classList.remove('dragging');
      document.body.classList.remove('resizing');
      persist();
    };
    gutter.addEventListener('pointerup', end);
    gutter.addEventListener('pointercancel', end);
    gutter.addEventListener('dblclick', () => reset(pick().name));
    gutter.addEventListener('keydown', (e) => {
      const t = pick();
      const keys = t.axis === 'x' ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      apply(t.name, measure(t.name, t.axis) + t.sign * keys[e.key] * (e.shiftKey ? 64 : 16));
      persist();
    });
  }

  for (const name of Object.keys(SIZES)) if (saved[name]) apply(name, saved[name], false);

  // Side by side, the main gutter sets the panel width; stacked, it sets the simulation height.
  bind($('#gutter-main'), () => (NARROW.matches ? { name: 'stage', axis: 'y', sign: 1 } : { name: 'inspector', axis: 'x', sign: -1 }));
  bind($('#gutter-chart'), () => ({ name: 'chart', axis: 'y', sign: 1 }));

  // A smaller window may no longer fit the saved panel width.
  window.addEventListener('resize', () => { if (saved.inspector && !NARROW.matches) apply('inspector', saved.inspector, false); });
})(window.ES = window.ES || {});
