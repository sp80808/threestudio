# FOSS Reuse Register

This register is required for every external project whose code, package, architecture or interaction patterns materially influence ThreeStudio.

## Decision states

- **Dependency** — imported through the package manager without copying upstream source.
- **Adapted** — bounded upstream code or design adapted into ThreeStudio; exact files and licence headers required.
- **Reference only** — inspected for architecture or interaction patterns; no source copied.
- **Rejected** — assessed but not used, with the reason recorded.

## `@dimforge/rapier3d-compat`

| Field | Decision |
| --- | --- |
| State | Dependency |
| Upstream | `dimforge/rapier.js` |
| Package | `@dimforge/rapier3d-compat` |
| Version | `0.19.3` requested in `package.json` |
| Source revision | Package release `0.19.3`; verify and record the resolved tarball integrity and upstream release commit when the lockfile is generated |
| Licence | Apache-2.0 |
| Maintenance | Active upstream physics project; package release metadata reviewed July 2026 |
| Why selected | Official Three-dimensional JavaScript/WASM bindings; compatibility build embeds WASM and avoids a separate asset-loading path in browser bundlers |
| Runtime boundary | Loaded only when Play mode starts; the editor and project persistence remain usable without creating a physics world |
| Security boundary | No remote code or network access; project data is converted into bounded rigid-body and collider descriptors |
| Performance boundary | Fixed `1/60` timestep, maximum five catch-up steps, box colliders only in the initial slice |
| Cleanup | `EventQueue.free()` and `World.free()` on Stop, failed initialization and component teardown |
| Files in ThreeStudio | `src/runtime/physics.ts`, `src/simulation/schema.ts`, `src/editor/recipes.ts` |
| Copied upstream source | None |

## `three`

| Field | Decision |
| --- | --- |
| State | Dependency and reference only |
| Upstream | `mrdoob/three.js` |
| Package | `three` |
| Version | `^0.185.1` requested in `package.json` |
| Licence | MIT |
| Use | Renderer, scene graph instances, controls, raycasting, geometry/materials and GLB export |
| Architectural rule | Three.js objects are disposable render/runtime instances, not canonical project state |
| Copied upstream source | None |

## Interaction-pattern references

The following projects inform product design but no source has been copied into the current implementation:

- Three.js Editor — command history, hierarchy and viewport interaction patterns; MIT.
- GDevelop — beginner-facing behaviours and event/action authoring concepts; MIT for the IDE.
- `img2threejs/img2threejs` — staged, specification-first generation and validation; Apache-2.0.
- `WesUnwin/three-game-engine` — reference architecture for Three.js and Rapier integration; MIT.
- `donmccurdy/glTF-Transform` — planned local asset inspection and optimisation pipeline; MIT.

Any future source adaptation must add the exact upstream file path, commit SHA, modification summary and retained licence header before merge.
