# Project State

## Phase 2: Playable Runtime and No-Code Authoring — In Progress

The vertical slice from Phase 1 (editor shell, transform gizmo, Spin/Bob play mode)
has been replaced by a real simulation runtime plus the authoring UI that drives it.

### Completed

**Serialisable document (`src/simulation/`)**
- `schema.ts`: versioned `Project` document (v2) — entities, keyed components
  (render, collider), behaviours, variables, rules, scene settings; Zod schemas plus
  factories (`createEntity`, `createBehaviour`, `createRule`, `createRuleAction`,
  `createRuleCondition`, `createVariable`). No Three.js/React imports, so documents stay
  portable.
- `scenarios.ts`: two shipped scenes — **Pressure Plate Door** (the acceptance scenario)
  and **Playground** (pointer clicks, chasing enemy, orbiting props).

**Hierarchy (`src/runtime/world.ts`, `src/render/scene-builder.ts`)**
- Parent/child transforms are composed as `world = parent * local` (TRS, XYZ Euler),
  memoised per read phase and invalidated whenever behaviours, rules or the editor move
  something — so collision, triggers, camera follow and the glTF export all agree with what
  the player sees. Children inherit their parent's scale, like Three.js.
- `CollisionContext` keeps the world-space resolution out of the collision module: the
  runtime supplies parent transforms, `collision.ts` stays a pure 3D maths module.
- Broken documents degrade visibly: a parent cycle or a missing parent is reported once as a
  `hierarchy` diagnostic and the object keeps its own transform, instead of hanging the frame.
- The editor's "Attached to" picker refuses self/cycle attachments, the hierarchy list nests
  children under their parents, and the tutorial scene ships a door sign attached to the door.
- `getWorldPosition` / `getWorldMatrix` / `getWorldAabb` expose world space to behaviours,
  rules, the renderer and tests.

**Game runtime (`src/runtime/`)**
- `world.ts`: fixed-step simulation (`stepRate`), lifecycle (`start/pause/resume/step/stop`),
  deterministic iteration and seeded randomness, event queue with an anti-event-storm guard,
  trigger/overlap tracking, message delivery, interval rules, diagnostics, `syncFromProject`.
- `behaviours.ts`: behaviour **registry** with ten built-ins
  (spin, bob, patrol, orbit, look-at, follow, character, door, pressure-plate, collectible).
  Parameters are declared as data, so UI, defaults and templates share one source.
- `rules.ts`: WHEN / IF / DO execution with reference tokens (`$self`, `$source`, `$other`,
  `$all`), conditions and actions; broken rules become diagnostics, never exceptions.
- `collision.ts`: kinematic collision — AABB volumes, exact sphere/sphere tests, per-axis
  sub-stepped movement resolution, triggers that report instead of blocking.
- `variables.ts`, `values.ts`, `math.ts`, `state.ts`, `diagnostics.ts`, `input.ts`
  (DOM + scripted input), `types.ts` (runtime contracts), `testHarness.ts`.

**Record & replay (`src/runtime/replay.ts`, `src/persistence/recording.ts`)**
- Every play session can be recorded: `createRecordingInput` wraps the live DOM input and
  captures one frame per fixed step (movement axis, pressed/held keys, pointer picks).
  Replays go through `createReplayInput` / `createReplayHarness`, so a recorded session
  reproduces itself frame for frame (same document, seed and step rate).
- The play HUD has Record / stop / download controls; recordings are validated on import
  (`parseRecording`, with a migration path for older frames).
- `npm run playtest -- --replay session.json` plays a recording headlessly and reports it;
  `--save-recording out.json` captures the scripted pilot's input for the same purpose.

**Rendering and play mode (`src/render/`)**
- `Viewport.tsx`: edit mode mirrors the document; play mode hands the scene to a `World`
  created from a **copy** of the document, so stopping always restores the authored scene.
  Camera follow, camera-relative movement, pointer→click forwarding, GLB export.
- `PlayHud.tsx`: transport controls (Play/Pause/Step/Stop), live variables, runtime
  statistics and diagnostics overlay.
- `scene-builder.ts`: geometry/material mapping, collider wireframes, disposal.

**Editor (`src/editor/`)**
- Snapshot-based undo/redo store covering entities, components, behaviours, rules,
  variables and settings.
- Registry-driven behaviour panel, full WHEN/IF/DO rule editor, variables panel with live
  values, collider editor with world-size read-out, hierarchy with search/hide/duplicate.
- `scene-builder`, `playStore`, `viewStore`, `StatusBar`, template picker, JSON import/export.

**Persistence and quality**
- `persistence/db.ts`: IndexedDB (Dexie v2 schema with an upgrade path), save/load/list.
- `persistence/io.ts`: JSON export/import, v1→v2 migration, validation, normalisation.
- TypeScript `strict` enabled; `@types/react`/`@types/react-dom` added.
- 119 tests (`npm test`): runtime unit suites (record/replay determinism, hierarchy
  composition and world-space collision), a full play-through of the acceptance scenario,
  jsdom mounts of the editor panels (`src/editor/app.test.tsx`) and of the runner itself
  (`src/runtime/playtest.test.ts`).
- `tools/playtest.ts` (`npm run playtest`): headless playtest runner with a scripted pilot, a
  timeline of world changes and a pass/fail report (18 checks on the acceptance scene). It also
  plays any exported document with `--document <file.json>`.
- `npm run lint`, `npm test`, `npm run playtest` and `npm run build` all pass.

### Next Steps
- Rapier-backed physics behind the existing `resolveMovement` / `WorldAccess` contract.
- Balance regression runs: record a session per level and diff `npm run playtest` reports in CI.
- Asset import pipeline (glTF/GLB in): the GLB export button is wired, the reverse is not.
- Project browser UI on top of `listProjects()`, plus autosave.
