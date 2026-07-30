# Parallel Prototype Strategy

## Branch roles

### `prototype/lovable-editor`
Owns the product/editor experience:
- WYSIWYG viewport shell
- hierarchy, selection and inspector
- transform tools and direct manipulation
- Behaviours, Rules and States authoring
- recipes/templates and onboarding
- responsive editor layout and interaction polish

### `prototype/replit-runtime`
Owns the runtime/engine foundation:
- serialisable project/entity/component model
- renderer bridge and scene synchronisation
- isolated Edit and Play modes
- deterministic update loop and Rapier fixed-step physics
- persistence, import/export and diagnostics
- runtime execution of Behaviours, Rules and States

### `integration/prototype-merge`
Receives only reviewed, contract-compatible changes from both tracks. It is not an experimental branch.

## Shared contracts

Both prototypes must converge on these boundaries before substantial integration:

1. `ProjectDocument` schema and versioning.
2. Stable entity IDs and component definitions.
3. Editor command and undo/redo interface.
4. Behaviour, Rule and State serialisation.
5. Runtime lifecycle: load, start, pause, step, stop and reset.
6. Asset manifest and import status model.
7. Diagnostics event format.

Create these definitions under `docs/contracts/` before implementing incompatible local equivalents.

## Merge sequence

1. Each prototype reaches its own vertical-slice acceptance gate.
2. Open separate draft PRs from each prototype branch into `integration/prototype-merge`.
3. Compare overlapping systems and choose one owner per subsystem.
4. Port through adapters rather than copying both implementations.
5. Run type-check, tests, production build and the Pressure Plate Door scenario.
6. Merge integration into `main` only after provenance and third-party notices are current.

## Iterative FOSS expansion loop

For every proposed open-source API, connector, SDK or project:

1. Define the missing user capability.
2. Search maintained FOSS candidates.
3. Verify licence, provenance, maintenance, browser compatibility, security and bundle impact.
4. Prototype behind a narrow adapter or feature flag.
5. Add automated acceptance checks.
6. Compare against the current implementation.
7. Adopt, defer or reject in `docs/DECISIONS.md`.
8. Record adopted code and attribution in `docs/FOSS_REUSE.md` and `THIRD_PARTY_NOTICES.md`.

Do not merge a dependency merely because it is free or open source. It must improve capability without compromising maintainability or licensing clarity.
