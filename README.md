# ThreeStudio

ThreeStudio is an experimental browser-native WYSIWYG 3D game engine built around Three.js,
a local-first project model, direct scene manipulation, reusable behaviours, and
beginner-friendly no-code rules.

Open `npm run dev` and the editor opens on the **Pressure Plate Door** tutorial scene:
walk onto the plate, the door slides open; collect three gems and the portal appears.

## What works today

| Area | Status |
| --- | --- |
| Scene editing | Hierarchy, inspector, transform gizmo, primitives, collider authoring |
| Hierarchy | Attach objects to each other: children inherit the parent's transform and are drawn, exported and collided with where they end up |
| Behaviours | Registry-driven: spin, bob, patrol, orbit, look-at, follow, player character, door, pressure plate, collectible |
| Rules | WHEN / IF / DO authoring and execution (scene-wide and per object) |
| Variables | Numbers, switches and text shared by behaviours and rules, with live play values |
| Play mode | Fixed-step simulation, isolated from the document, with HUD, pause and single-step |
| Physics | Kinematic collision (solid volumes + triggers) — deterministic, no dependencies |
| Persistence | IndexedDB library (open, save a copy, delete), autosave, JSON import/export with v1→v2 migration |
| Record & replay | Record a play session's input in the editor and replay it headlessly, frame for frame |
| Playtesting | `npm run playtest` drives a scene headlessly with a scripted pilot and prints a timeline + pass/fail report |
| Quality gates | `npm run lint` (strict TS), `npm test` (133 tests incl. acceptance play-throughs, record/replay and jsdom panel mounts), `npm run playtest`, `npm run build` |

The engine core (`src/runtime/`) is free of React and Three.js: it is a pure TypeScript
simulation that can run headlessly, in a worker, or inside tests.

## Controls

Edit mode: WASD/arrow keys navigate, `W`/`E`/`R` switch the gizmo, `F` focuses the selection,
`Delete` removes it, `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo, `Ctrl+D` duplicates.
Play mode: `WASD`/arrows move, `Space` jumps, clicking sends a click to the game,
`P` pauses, `.` steps one frame, `Esc` stops and restores the scene.

## Playtesting

`npm run playtest` runs a scene through the runtime with a scripted pilot — no browser, no
clicking — and reports what happened:

```
npm run playtest                          # the Pressure Plate Door acceptance scene
npm run playtest -- playground            # the sandbox scene
npm run playtest -- --list                # available scenes
npm run playtest -- --document my.json    # play any exported document
npm run playtest -- --replay session.json # replay a recorded session
npm run playtest -- --json                # machine-readable report
```

A run prints a timeline of everything that changed (overlaps, messages turned into movement,
variables, visibility), the checks it made, and the final variable values. It exits non-zero
when a check fails or the runtime logs a warning, which is why CI runs it after the unit tests.

### Record and replay

Press **Play** in the editor and hit **Record** in the play bar: every fixed step of input
(keys, movement axis, clicks) is captured. Stop recording, then press the download button to
save a `.threestudio-recording.json` and replay it:

```
npm run playtest -- --replay session.threestudio-recording.json
npm run playtest -- --replay session.json --document my-scene.json
npm run playtest -- --save-recording out.json     # capture the scripted pilot instead
```

A replayed run reproduces the recorded session frame for frame, so a recording works as a
regression test (and as a bug report: it carries the exact input that caused the problem).

## Prototype branches

- `prototype/lovable-editor` — product/editor UX track.
- `prototype/replit-runtime` — runtime/engine track.

Both branches must preserve the shared contracts under `docs/contracts/` and are intended to
be reviewed through pull requests before selective integration into `main`.

## Open-source policy

Only licence-compatible FOSS components may be copied or adapted. Every reuse decision must
record repository, commit SHA, licence, attribution, maintenance state, security
considerations, and the exact files or concepts reused. See `docs/FOSS_REUSE.md` and
`docs/DECISIONS.md` for the decisions taken so far (including the deliberate choice to build
the collision layer in-house rather than adopting an engine now).

Core references include Three.js, the Three.js Editor and examples, Rapier, GDevelop
interaction patterns, glTF-Transform, and img2threejs. The project prefers adapters and
bounded extraction over inheriting whole legacy architectures.
