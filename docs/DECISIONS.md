# Decisions

## 1. State vs. Three.js Objects
**Decision**: Three.js `Object3D` instances are *not* the source of truth. The serialisable
`Project` state is the source of truth.
**Reasoning**: Ensures easy serialisation, undo/redo, and a clean separation between editing
data and rendering visualisation. It is what makes play-mode isolation a one-line guarantee:
the runtime works on a copy of the document.

## 2. Editor State Library
**Decision**: Zustand, with play state in a separate store.
**Reasoning**: Lightweight, usable outside React (the command path stays imperative), and it
keeps "the document I am editing" apart from "the simulation that is running".

## 3. Undo/Redo by Document Snapshots
**Decision**: capped snapshots rather than per-command inverse operations.
**Reasoning**: Every new editable concept (behaviours, rules, variables, settings) would
otherwise need a matching inverse command. Snapshots are cheap at this document size, correct
by construction, and transforms are committed once per drag so drags do not flood the stack.

## 4. Persistence
**Decision**: Dexie (IndexedDB) with a records table (id, name, updatedAt, project) and a
Dexie schema upgrade that migrates v1 rows.
**Reasoning**: Local-first as required, large documents and future asset blobs without hitting
`localStorage` limits, and a real migration example for the "recent projects" feature.

## 5. UI Framework
**Decision**: Tailwind CSS + generic accessible components.
**Reasoning**: Native to the environment, fast to iterate, keeps the bundle small.

## 6. Runtime Owns Its Own Math and Collision (no engine dependency yet)
**Decision**: implement the game loop, vectors and kinematic collision in `src/runtime/`
rather than adopting Rapier or another engine now.
**Reasoning per the FOSS policy**: the required capability today is deterministic, testable,
dependency-free movement, triggers and message flow — all of which are ~300 lines and fully
covered by unit tests. Adopting a rigid-body engine would add a WASM dependency and a second
source of truth for transforms before the authoring model is proven.
**Follow-up**: physics is behind `WorldAccess` + `resolveMovement`, so a Rapier adapter can be
introduced later without gameplay changes; evaluate it when joints, forces or mesh colliders
are needed. Record the evaluation (licence, maintenance, bundle size) here first.

## 7. Rules Are Executed, Not Interpreted by the UI
**Decision**: `RuleSchema` is exactly what the runtime executes; the rules panel is a direct
view of it.
**Reasoning**: No translation layer means no drift between "what the editor shows" and "what
the game does", which is the usual failure mode of no-code authoring tools.

## 8. Strict TypeScript
**Decision**: enable `strict`, `noUnusedLocals`, `noUnusedParameters`, and add
`@types/react` / `@types/react-dom`.
**Reasoning**: Without them, JSX was implicitly `any` and discriminated-union narrowing
silently failed (which hid a real document-import bug). The runtime is safety-critical code
for the editor's promises, so the compiler should be able to check it.

## 9. Behaviour Types Are Open Strings
**Decision**: `BehaviourSchema.type` accepts any string; the registry is the source of truth
and unknown types become diagnostics (the behaviour is disabled for the session).
**Reasoning**: New behaviours can be added, documented and tested in one place without a
schema migration, while documents from a newer build degrade visibly instead of crashing.

## 10. Headless Playtests Are a Gate, Not a Debug Script
**Decision**: keep the scripted play-through of the shipped scenes in `tools/playtest.ts`
(`npm run playtest`), run it in CI after the unit tests, and assert its report from
`src/runtime/playtest.test.ts`.
**Reasoning**: the runtime's contract is gameplay, not function calls. A runner that steers the
player with the same input interface the keyboard drives, and prints what changed, catches
regressions that unit tests miss (a door that opens but never closes, a plate that stops
reporting overlaps) while doubling as the tool an author reaches for when a scene misbehaves.
It exits non-zero on a failed check or any runtime warning, so it is a hard gate.

## 11. Editor Panels Are Tested by Mounting Them (not by SSR)
**Decision**: render the editor panels in jsdom with `createRoot` + `act` and drive them with
real DOM events.
**Reasoning**: an SSR pass of a Zustand-backed UI repaints nothing — `renderToString` sees the
store's initial state, so assertions about selection and editing silently passed against the
wrong panel. Mounting the real components keeps the test honest about what a user sees, and
lets the tests assert that a UI edit reaches the store.

## 12. Input Is Recorded as Data, Not as a Video
**Decision**: a recording is one frame per fixed step (movement axis, pressed/held keys, pointer
picks) in `src/runtime/replay.ts`, validated in `src/persistence/recording.ts`, and replayed
through the same `GameInput` interface the keyboard implements.
**Reasoning**: the world is already fixed-step and seeded, so recorded input reproduces a
session exactly (asserted in `src/runtime/replay.test.ts`). That turns a play session into a
regression test and a bug report at once, and it needs no video, no codec and no new runtime
dependency — the recording is a few kilobytes of JSON that a reviewer can read.
**Trade-off**: a recording only reproduces against the document, seed and step rate it was
captured with. The runner therefore checks the recording's `projectId` against the document it
is playing and fails loudly on a mismatch rather than reporting a misleading result.

## 13. Hierarchy Is Real: `world = parent * local`
**Decision**: compose parent/child transforms in the runtime (`src/runtime/math.ts`,
`world.ts`) and mirror the same nesting in the renderer, rather than treating `parentId` as
an editor-only grouping.
**Reasoning**: once objects can be attached to other objects, three things must agree or the
editor lies to the author: what is drawn, what is collided with, and what behaviours read.
Composing in one place (`world = parent * local`) and exposing `getWorldPosition` /
`getWorldMatrix` / `getWorldAabb` keeps that agreement checkable — `hierarchy.test.ts` compares
the runtime's composition with Three.js to ~1e-15 and asserts that a trigger on a moving parent
reports overlaps where the player sees it.
**Consequences**:
- Children inherit the parent's scale, exactly like Three.js and every other 3D tool, so a
  child authored in local units is scaled by its parent (the tutorial's door sign documents it).
- Collision gains one indirection — a `CollisionContext` that answers "where is this object's
  parent?" — so `collision.ts` stays a pure module and no other rule about solids changes.
- Broken documents (a parent cycle, a parent that was deleted) become a single `hierarchy`
  diagnostic and the object keeps its own transform: a mistake in the hierarchy is visible,
  not fatal, and can never hang a frame.

## 14. The Browser Is the Server
**Decision**: the project library is IndexedDB plus a modal panel — open, save a copy, delete,
autosave — with JSON export as the escape hatch, and no account, sync or backend.
**Reasoning**: the editor is local-first, so the "cloud" it needs is a list of documents and a
way to fork one. IndexedDB already stores the document; the work was the operations (a copy
gets a new id and a fresh history stack, deleting asks first, autosave writes a moment after
editing stops) and being honest about the state in the UI: the status bar shows the last
autosave, the toolbar can switch autosave off, and a dirty document warns before the tab
closes. `fake-indexeddb` makes all of it testable in Node.
**Trade-off**: nothing leaves the machine, so sharing means exporting JSON. That is the right
default until import/export formats settle (see decision 3, which keeps the document portable).

## 15. Imported Models Become Engine Objects
**Decision**: importing a `.glb` / `.gltf` converts its nodes into document entities — a box per
mesh, sized to the mesh's bounding box, with the node's transform, colour and parent link —
rather than storing the file as an asset beside the document.
**Reasoning**: the document is portable JSON of primitives, behaviours and rules (decisions 3 and
13). An asset slot would either bloat that JSON with megabytes of base64 or split the project
into a document plus hidden binaries, and any exported `.json` would no longer be a complete
project. Converting keeps every promise the editor makes about imported objects: they appear in
the hierarchy, can be attached to other objects, take colliders and behaviours, undo as one edit,
play through the same collision code, and export back out as GLB.
**Trade-off**: fidelity is lost — meshes become boxes and materials become a colour. That is the
honest limit of a blockout tool, and the follow-up is an asset store *beside* the document
(imported meshes referenced by id, packaged on export) if authored models become the main input.

## 16. Overlaps Come From a Broad Phase, Not From Every Pair
**Decision**: `world.updateOverlaps` no longer walks every pair of colliders. It asks
`src/runtime/broadphase.ts` for *candidate* pairs — a uniform grid over the colliders' world
AABBs, with oversized volumes paired against everything — and runs the exact
`collidersOverlap` test only on those. Scenes small enough that brute force is cheaper than
building a grid keep using brute force (`BRUTE_FORCE_PAIR_LIMIT`).
**Reasoning**: the all-pairs loop was the one part of the step that grew quadratically with the
document, and a browser game loops at 60 Hz inside a frame budget. The acceptance scene never
noticed; the **Object Crowd** template does — 325 objects mean 51,681 pairwise tests per step
against ~460 with the grid, measured at ~1.05 ms/step versus ~16 ms/step for the same scene
without it. The grid costs one pass over the colliders, is dependency-free (no Rapier, no
spatial hash library) and preserves the property everything else relies on: the world is still
a pure function of the document, the seed and the input.
**Consequences**:
- The contract is a **superset**, checked in `broadphase.test.ts` against brute force on random
  scenes and against a 400 m floor: a missed pair would silently drop a trigger event, so the
  test asserts that the candidate set contains every real overlap rather than trusting the maths.
- Enters and exits are found differently — enters from the candidates, exits by re-testing the
  overlaps recorded in the previous step — because a pair that stopped overlapping is no longer
  a candidate. An entity that disappears or loses its collider now also gets its stale overlap
  entries cleaned up, which the old loop leaked.
- Candidate order is deterministic (`entity.order`), so record & replay still reproduces a
  session frame for frame.
- The cost is visible rather than assumed: `WorldStats.overlapTests` is in the play HUD, the
  crowd template makes the number meaningful, and the `crowd` playtest fails if the step ever
  goes back to testing most pairs.
