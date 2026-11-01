# Energy Bar Chart Lab

An open-ended sandbox for teaching energy with the **system approach** and **energy bar charts**:

> K<sub>i</sub> + U<sub>gi</sub> + U<sub>si</sub> + W = K<sub>f</sub> + U<sub>gf</sub> + U<sub>sf</sub> + ΔU<sub>int</sub>

Students build a situation out of general-purpose objects, choose which objects are in the system, and watch the bar chart account for the energy as the motion plays out.

## Running it

Double-click `index.html` (teacher version) or `student.html` (student version). There is no build step, no server, and no internet connection required; it runs in any current browser (Chrome, Edge, Firefox, Safari, Chromebooks).

To put it on a website, copy the whole folder (`index.html`, `student.html`, `css/`, `js/`) to the site. To embed it in an existing page:

```html
<iframe src="energy_simulations/index.html" style="width:100%;height:900px;border:0"></iframe>
```

## Teacher and student versions

`student.html` runs the same code with `data-mode="student"` on `<body>`, and is otherwise a copy of `index.html` (keep the two in step when editing the markup). The student version:

- lists only the seven station scenes;
- never shows work: no W column, no work list and no work toggle. When the system isn't isolated the chart shows **≠** and a red box under the chart names each outside object that is pushing, pulling, rubbing or hitting something inside the system;
- keeps the grid always on (no Grid checkbox) and adds a checkbox to hide the U<sub>g</sub> = 0 line;
- hides the Skater and Bumper tools and these settings: bounciness, bumper plate width, track rails (always on), the skater's look, tilt, rotate and face buttons, the slack-spring option and the plunger length.

The teacher version shows the same red box whenever the work column is turned off.

## Stations

The **Stations** group in the Scene menu follows the *Energy Transformations of Isolated Systems* worksheet. Stations 1–4 start with the worksheet's system checked; stations 5–7 start with only the moving object checked, since students choose the system there.

| Station | Scene |
|---|---|
| 1. Cart rolling down a ramp | A cart released at rest at the top of a frictionless ramp. System: cart and Earth. |
| 2. Swinging pendulum | A mass on a 4 m string, pulled back 40°. System: mass and Earth. |
| 3. Spring-plunger cart launch | A cart on a level track with its plunger pushed 0.25 m in against the end stop; launches at 2.5 m/s. System: cart (with plunger) and track. |
| 4. Basketball drop and bounce | A ball (e = 0.8) dropped onto a separate Floor object. System: ball, Earth and floor. |
| 5. Soccer ball rolling to a stop | A ball rolling at 3 m/s on a floor with friction, with a wall at the far end. |
| 6. Mass dropping on a hanging spring | A mass released at rest with the spring unstretched. |
| 7. Marble popper | A popper turned inside out on a table; it pops about 2.9 m high. |

Sizes are scaled up so they are visible in the 16 m scene; the bar heights, not the joule values, are what compare to the real equipment. The simulation is ideal, so the popper's snap makes no sound: all its stored energy goes into motion.

## Using it

| Action | How |
|---|---|
| Add an object | Pick it in the left palette, then click in the scene. Walls are dragged. Springs and ropes need two clicks (on a ball, cart, skater or pin; empty space makes a pin). |
| Zoom | **Ctrl+scroll** or a trackpad pinch over the simulation zooms around the pointer (up to 40×); a two-finger pinch does the same on a touchscreen. While zoomed in, scrolling moves the view. Zoom all the way out, or change scenes, to see the whole scene again. The grid switches to finer spacing as you zoom, down to 1 cm. |
| Hide the objects menu | **☰ Objects** in the toolbar. The browser remembers the choice. |
| Move / reshape | Select tool: drag objects. Select a track to show its handles; double-click it to add a handle. |
| Delete | Select, then press Delete (or use the button in Properties). |
| Choose the system | Check boxes in the **System** panel, or "Part of the system" in Properties. Earth is the ground. |
| Move the U<sub>g</sub> = 0 level | Drag the U<sub>g</sub> = 0 tag up or down. Drag it sideways to slide just the tag out of the way of objects; that never changes the chart. The student version also has a **U<sub>g</sub> = 0 line** checkbox to hide the line. |
| Initial state | Any edit makes the current setup the initial state. **Set as initial** picks a moment mid-motion. **Reset** returns to it. |
| Values | The chart starts qualitative: bar heights only. Check **Show values** to add the numbers in joules. |
| Hide the work column | Uncheck **Show the work (W) column** under the chart. Nothing else changes, so when the system isn't isolated the two sides no longer match and the chart shows **≠**, with initial and final totals. This sets up a later discussion of work. The browser remembers the setting. |
| Undo / redo | **Ctrl+Z** / **Ctrl+Y** (or Ctrl+Shift+Z), or the toolbar buttons. Covers every change to the setup (objects, properties, system choice, U<sub>g</sub> = 0 line, scene changes, Set as initial, Reset). |
| Resize panels | Drag the gutter between the simulation and the side panels, or the bar under the chart. Arrow keys nudge a focused gutter; double-click resets it. The browser remembers the sizes. |
| Rotate a skater | Select a skater that is not on a track and drag the round handle above its head (or use the Tilt field or the rotate buttons). Drop an upside-down skater on a track to ride underneath it, or use **Ride under the track**. **Face left/right** mirrors the skater. |

Changing the system never changes the motion, only how it is accounted for. Students can pause and toggle Earth, a spring, or a track in and out to see the same event described as energy inside the system or as work crossing its boundary.

## How the accounting works

- **K**: kinetic energy of the masses in the system.
- **U<sub>g</sub>**: counted only when Earth *and* the object are in the system, measured from the U<sub>g</sub> = 0 line.
- **U<sub>s</sub>**: counted only when the spring (or bumper) is in the system. A cart's plunger and a popper are part of their object, so their elastic energy counts whenever that object is in the system.
- **ΔU<sub>int</sub>**: friction, inelastic bounces and ropes snapping taut are recorded together with the objects involved. If all of them are in the system, the energy is ΔU<sub>int</sub>.
- **W**: whatever crosses the boundary. The chart breaks it down by source: Earth's gravitational force when Earth is outside, springs outside the system, friction or impacts with outside objects, and other outside objects.

Friction between an object in the system and a surface outside it shows up as negative work with a note. A rubbing interaction heats both surfaces, so the clean approach is to put both in the system.

The integrator keeps total energy within about 0.1% and makes a small correction every frame, so an isolated system shows W = 0.

## Objects

- **Ball.**
- **Cart:** rides tracks like a skater. An optional spring plunger (plunger *k* > 0) pushes off walls and the ground.
- **Popper:** a marble popper. Its built-in spring pushes off the surface it sits on once, then it is spent. Dragging it re-arms it, and so does Reset.
- **Skater:** rides tracks, and can fly off the ends or off any track whose "stays on track" box is unchecked. **Looks like** switches between skater, person and cart.
- **Track:** an editable spline.
- **Wall:** also used for floors, tables and end stops. A cart or skater riding a track stops at a wall across the track, keeping *e* of its speed. The lost kinetic energy is recorded against the rider and the wall.
- **Pin:** fixed to Earth.
- **Spring:** check "Goes slack" for a bungee cord that only pulls.
- **Rope.**
- **Bumper:** a one-way spring that pushes.

The **Bungee jump** scene uses these: a jumper hangs head-down from a bridge on a slack cord and dips into the river at the bottom of the fall. The river is scenery only (`world.scenery.water`); it is drawn but has no physics.

## Code layout

| File | Purpose |
|---|---|
| `js/track.js` | Spline track geometry (arc length, tangent, curvature) |
| `js/world.js` | Physics, dissipation log, save/load |
| `js/barchart.js` | System energy accounting and the bar chart |
| `js/render.js` | Scene drawing |
| `js/ui.js` | Palette, editing, panels |
| `js/scenes.js` | Starter scenes, built only from palette objects |
| `js/layout.js` | Resizable panel gutters |
| `js/main.js` | Startup and animation loop |

To add a starter scene, add an entry to `ES.SCENES` in `js/scenes.js`.

## Ideas for later

- Guided activities: a scene plus prediction questions ("sketch the bar chart, then run it").
- Energy vs. time graph and pie chart views.
- Blocks that slide, ramps with friction regions.
- Zoomable scene, so equipment can be shown at its real size.
- Student drawing mode: sketch a predicted bar chart and compare it to the simulation.
