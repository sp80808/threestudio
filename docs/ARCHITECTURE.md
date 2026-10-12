# Architecture

## Core Boundaries

- **editor/**: UI components, scene hierarchy, inspector panels, play/view state, editor store.
- **simulation/**: the serialisable document — entity/component model, behaviours, variables,
  rules, scene settings, Zod schemas, factories and the shipped scene templates.
- **runtime/**: the game itself. Pure TypeScript, no React and no Three.js:
  `world.ts` (fixed-step loop and lifecycle), `behaviours.ts` (registry), `rules.ts`
  (WHEN/IF/DO), `collision.ts` (kinematic volumes), `variables.ts`, `input.ts`,
  `diagnostics.ts`, plus `math.ts` / `values.ts` helpers.
- **render/**: Three.js viewport, document→scene synchronisation, collider visualisation,
  play-mode HUD, glTF export.
- **persistence/**: IndexedDB via Dexie, JSON import/export, document migration.

## State Management

- **Zustand** holds the editor state: document, selection, tools, undo/redo stacks.
- **Undo/redo** uses capped document snapshots. Transforms are committed once per drag, so
  snapshots stay cheap and *every* edit — entity, component, behaviour, rule, variable or
  setting — is undoable without per-action bookkeeping.
- **Play state** (`editor/playStore.ts`) is a separate store holding the runtime snapshot
  (status, statistics, live variables, diagnostics). Commands travel as window events so the
  viewport stays the single owner of the `World` instance.
- **Entity model**: a flat record of entities with parent/child references, which keeps
  updates, diffs and serialisation trivial.

## Three.js Integration

- The scene is constructed from the `Project` document; Three.js objects are never the source
  of truth (`docs/DECISIONS.md`).
- `TransformControls`/`OrbitControls` write back into the store on drag end.
- Collider components are drawn as wireframes (blue = solid, amber = trigger) and are scaled
  by the object's scale, matching the runtime's collision maths exactly.

## The Runtime Contract

`WorldAccess` (see `runtime/types.ts`) is the only surface gameplay code can touch:

```
getEntity / getEntities / getPlayer / findEntitiesByTag / getOverlaps
moveEntity / setColliderEnabled / resetEntity
hasVariable / getVariable / getVariableByName / setVariable / changeVariable
sendMessage / emitEvent / report        (+ time, delta, gravity, cameraYaw, input, random)
```

Fixed-step order inside one step:

1. pointer picks collected since the previous step become `pointer-click` events;
2. overlaps are diffed, producing `trigger-enter` / `trigger-exit` events;
3. behaviours update in document order;
4. queued events are drained: listeners, then rules (scene rules first, then per entity),
   with messages delivered to the receiving behaviours immediately on `sendMessage`;
5. interval rules tick;
6. input edges are cleared.

Guarantees:

- **Isolation** — play mode runs on a copy of the document; stopping restores it exactly.
- **Determinism** — fixed timestep, stable iteration order, seeded randomness, bounded events.
- **No frame-time exceptions** — unknown behaviours, missing references and runaway event
  chains become diagnostics.

## Extending the Engine

- **New behaviour**: one `registerBehaviour({...})` call in `src/runtime/behaviours.ts`. The
  inspector UI, defaults and templates pick it up automatically; add a spec to
  `src/runtime/behaviours.test.ts`.
- **New rule event/condition/action**: extend the enums in `src/simulation/schema.ts`, handle
  it in `runtime/rules.ts`, and add the labels + editor fields in `editor/RulesPanel.tsx`.
- **Physics swap**: implement `resolveMovement` and the collision predicates against Rapier
  while keeping `WorldAccess` unchanged; gameplay code does not need to change.

## Testing

- Unit tests per runtime module (`src/runtime/*.test.ts`).
- The acceptance scenario is a play-through test (`src/runtime/scenario.test.ts`): scripted
  input drives the tutorial scene, asserting that the plate opens the door, gems count up and
  the portal appears, with no diagnostics raised.
- `src/runtime/testHarness.ts` provides `createHarness()` (started session + scripted input)
  and `makeRuntimeEntity()` for focused tests.
- `src/editor/app.test.tsx` mounts the real editor panels in jsdom to check that any document
  the editor can be handed (empty, unknown behaviour types, freshly imported) renders and that
  edits made through the UI reach the store.
- `tools/playtest.ts` (`npm run playtest`) plays a scene headlessly with a scripted pilot and
  prints a timeline plus a pass/fail report; it exits non-zero on failure, so CI runs it after
  the unit tests. `--document <file.json>` plays any exported document instead of a built-in
  scene.
