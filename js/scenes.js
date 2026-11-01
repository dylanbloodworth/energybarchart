/* Starter scenes. Each one is built only from the general-purpose objects in the palette.
 *
 * The "Stations" group follows the Energy Transformations of Isolated Systems worksheet. Where
 * the worksheet names the system (stations 1-4), the scene starts with that system checked.
 * Where students choose it (stations 5-7), only the moving object starts in the system.
 * The student version (student.html) lists only the stations.
 */
(function (ES) {
  'use strict';

  function placeOnTrack(w, m, x, y) {
    const near = w.nearestTrack(x, y, 100);
    if (near) w.attachToTrack(m, near.track, near.s, 0, near.side);
  }

  // A floor that is its own object, so it can be in or out of the system separately from Earth.
  // Its top surface is at 0.16 m.
  const FLOOR_TOP = 0.16;
  const floor = (w, props) => w.create('wall', Object.assign({ name: 'Floor', x1: -0.6, y1: 0.08, x2: 16.6, y2: 0.08 }, props));

  const HALF_PIPE = [
    { x: 1, y: 7 }, { x: 2.6, y: 3.4 }, { x: 5, y: 1.3 }, { x: 8, y: 1 },
    { x: 11, y: 1.3 }, { x: 13.4, y: 3.4 }, { x: 15, y: 7 },
  ];

  ES.SCENES = [
    {
      id: 'station-1',
      group: 'Stations',
      name: '1. Cart rolling down a ramp',
      build(w) {
        // System: the cart and Earth. The frictionless track pushes at right angles to the
        // motion, so it transfers no energy and can stay outside. The end stop catches the cart
        // (e = 0) after the final state; leaving it out of the system makes that impact show up.
        w.create('track', {
          name: 'Track', inSystem: false,
          // The extra point at x = 12 keeps the run-out truly level, so a stopped cart stays put.
          points: [{ x: 0.6, y: 4.4 }, { x: 6, y: 1 }, { x: 7.5, y: 0.45 }, { x: 9, y: 0.4 }, { x: 12, y: 0.4 }, { x: 15.6, y: 0.4 }],
        });
        w.create('wall', { name: 'End stop', x1: 15.2, y1: 0.4, x2: 15.2, y2: 1.3, inSystem: false });
        placeOnTrack(w, w.create('skater', { name: 'Cart', look: 'cart', m: 0.5, e: 0 }), 1.1, 4.1);
      },
    },
    {
      id: 'station-2',
      group: 'Stations',
      name: '2. Swinging pendulum',
      build(w) {
        // System: the mass and Earth. A taut string pulls at right angles to the motion.
        const pin = w.create('pin', { name: 'Ring stand', x: 8, y: 8.5 });
        const theta = (40 * Math.PI) / 180;
        const ball = w.create('ball', { name: 'Mass', m: 0.2, r: 0.25, color: '#9c51b6', x: 8 + 4 * Math.sin(theta), y: 8.5 - 4 * Math.cos(theta) });
        w.create('rope', { name: 'String', a: pin.id, b: ball.id, L: 4, inSystem: false });
      },
    },
    {
      id: 'station-3',
      group: 'Stations',
      name: '3. Spring-plunger cart launch',
      build(w) {
        // System: the cart (with its plunger) and the track. The track is level, so Earth does
        // no work and can stay outside. The plunger starts pushed in 0.25 m against the end stop.
        w.earth.inSystem = false;
        w.earth.mu = 0; // the cart glides on after it rolls off the far end of the track
        w.create('track', { name: 'Track', points: [{ x: 0.6, y: 0 }, { x: 15.6, y: 0 }] });
        w.create('wall', { name: 'End stop', x1: 1, y1: 0, x2: 1, y2: 0.9 });
        placeOnTrack(w, w.create('skater', { name: 'Cart', look: 'cart', m: 0.5, pk: 50, pL: 0.35 }), 1.6, 0);
      },
    },
    {
      id: 'station-4',
      group: 'Stations',
      name: '4. Basketball drop and bounce',
      build(w) {
        // System: the ball, Earth and the floor. The bounce loses energy to the ball and floor.
        floor(w);
        w.create('ball', { name: 'Basketball', m: 0.6, r: 0.3, e: 0.8, color: '#e07b28', x: 8, y: 6 });
      },
    },
    {
      id: 'station-5',
      group: 'Stations',
      name: '5. Soccer ball rolling to a stop',
      build(w) {
        // Students choose the system. Rubbing on the floor slows the ball; the wall is there
        // for students who let it reach a wall instead.
        w.earth.inSystem = false;
        floor(w, { mu: 0.06, inSystem: false });
        w.create('wall', { name: 'Wall', x1: 15.6, y1: FLOOR_TOP, x2: 15.6, y2: 2.5, inSystem: false });
        w.create('ball', { name: 'Soccer ball', m: 0.43, r: 0.3, e: 0.6, color: '#2e86ab', x: 1.5, y: FLOOR_TOP + 0.3, vx: 3 });
      },
    },
    {
      id: 'station-6',
      group: 'Stations',
      name: '6. Mass dropping on a hanging spring',
      build(w) {
        // Students choose the system. Released at rest with the spring unstretched.
        w.earth.inSystem = false;
        const pin = w.create('pin', { name: 'Ring stand', x: 8, y: 9 });
        const ball = w.create('ball', { name: 'Mass', m: 1, r: 0.3, color: '#9c51b6', x: 8, y: 7 });
        w.create('spring', { name: 'Spring', a: pin.id, b: ball.id, k: 10, L0: 2, inSystem: false });
      },
    },
    {
      id: 'station-7',
      group: 'Stations',
      name: '7. Marble popper',
      build(w) {
        // Students choose the system. The popper starts turned inside out on the table, its
        // stored elastic energy ready to push off the tabletop.
        w.earth.inSystem = false;
        const top = 1.5;
        w.create('wall', { name: 'Table', x1: 4.5, y1: top, x2: 11.5, y2: top, inSystem: false });
        w.create('wall', { name: 'Table leg', x1: 5, y1: 0, x2: 5, y2: top, inSystem: false });
        w.create('wall', { name: 'Table leg', x1: 11, y1: 0, x2: 11, y2: top, inSystem: false });
        w.create('ball', {
          name: 'Popper', look: 'popper', color: '#f2a541', m: 0.02, r: 0.25, e: 0.3,
          pk: 50, pL: 0.15, pOnce: true, x: 8, y: top + 0.08 + 0.25,
        });
      },
    },
    {
      id: 'skatepark',
      group: 'More scenes',
      name: 'Skate park',
      build(w) {
        w.create('track', { name: 'Half-pipe', points: HALF_PIPE });
        placeOnTrack(w, w.create('skater', { name: 'Skater', m: 50 }), 1.6, 6);
      },
    },
    {
      id: 'skatepark-friction',
      group: 'More scenes',
      name: 'Skate park with friction',
      build(w) {
        w.create('track', { name: 'Half-pipe', points: HALF_PIPE, mu: 0.06 });
        placeOnTrack(w, w.create('skater', { name: 'Skater', m: 50 }), 1.6, 6);
      },
    },
    {
      id: 'bungee',
      group: 'More scenes',
      name: 'Bungee jump',
      build(w) {
        w.scenery.water = { level: 1.2 }; // the river is only drawn; it has no physics
        w.create('wall', { name: 'Bridge deck', x1: -0.6, y1: 9, x2: 6, y2: 9 });
        w.create('wall', { name: 'Bridge pier', x1: 2.5, y1: 0, x2: 2.5, y2: 9 });
        const anchor = w.create('pin', { name: 'Anchor', x: 6, y: 9 });
        // Head-down directly below the anchor, cord tied at the ankles, the instant before letting
        // go. Straight below, the bounce goes straight up and down and never clips the deck.
        const jumper = w.create('skater', { name: 'Jumper', m: 60, look: 'person', x: 6, y: 8.6, angle: Math.PI });
        w.create('spring', { name: 'Bungee cord', a: anchor.id, b: jumper.id, k: 600, L0: 3.2, slack: true });
      },
    },
    {
      id: 'blank',
      group: 'More scenes',
      name: 'Blank',
      build() {},
    },
  ];
})(window.ES = window.ES || {});
