# ThreeStudio

ThreeStudio is an experimental browser-native WYSIWYG 3D game engine built around Three.js, a local-first project model, direct scene manipulation, reusable behaviours, and beginner-friendly no-code rules.

## Prototype branches

- `prototype/lovable-editor` — product/editor UX track: hierarchy, inspector, viewport, behaviours, recipes, and readable `WHEN / IF / DO` authoring.
- `prototype/replit-runtime` — runtime/engine track: serialisable entities, renderer bridge, play-mode isolation, Rapier integration, persistence, diagnostics, and export.

Both branches must preserve the shared contracts under `docs/contracts/` and are intended to be reviewed through pull requests before selective integration into `main`.

## Open-source policy

Only licence-compatible FOSS components may be copied or adapted. Every reuse decision must record repository, commit SHA, licence, attribution, maintenance state, security considerations, and the exact files or concepts reused. See `THIRD_PARTY_NOTICES.md` and `docs/FOSS_REUSE.md` as the project develops.

Core references include Three.js, the Three.js Editor and examples, Rapier, GDevelop interaction patterns, glTF-Transform, and img2threejs. The project should prefer adapters and bounded extraction over inheriting whole legacy architectures.
