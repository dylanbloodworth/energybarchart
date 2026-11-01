/* Entry point: start the app and run the animation loop. */
(function (ES) {
  'use strict';

  function showError(message) {
    const box = document.getElementById('error');
    if (!box) return;
    box.hidden = false;
    box.textContent = `Something went wrong: ${message}`;
  }
  window.addEventListener('error', (e) => showError(e.message));

  const app = new ES.App();
  window.energyLab = app;

  let last = performance.now();
  function frame(now) {
    // rAF timestamps can precede the performance.now() taken at startup, so clamp at zero.
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    try {
      if (app.running && dt > 0) app.world.step(dt * app.speed);
      app.render();
    } catch (err) {
      app.setRunning(false);
      showError(err.message);
      console.error(err);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})(window.ES = window.ES || {});
