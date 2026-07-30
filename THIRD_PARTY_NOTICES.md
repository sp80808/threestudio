# Third-Party Notices

ThreeStudio uses open-source software. This file records direct runtime and validation dependencies that require explicit attribution or implementation review. Complete transitive dependency reporting should be generated from the lockfile before a public release.

## Rapier JavaScript 3D compatibility build

- Package: `@dimforge/rapier3d-compat`
- Version requested by ThreeStudio: `^0.19.3`
- Upstream: https://github.com/dimforge/rapier.js
- Licence: Apache License 2.0
- Copyright: Dimforge and Rapier contributors
- Use in ThreeStudio: browser-side rigid bodies, colliders, sensors, collision events and kinematic door motion during disposable Play sessions.
- Distribution note: the compatibility package embeds its WebAssembly payload for bundler portability.

Rapier remains subject to its upstream Apache-2.0 licence and notices. ThreeStudio does not claim ownership of Rapier or its WebAssembly engine.

## Playwright

- Package: `@playwright/test`
- Version used by ThreeStudio CI: `1.62.0`
- Upstream: https://github.com/microsoft/playwright
- Licence: Apache License 2.0
- Use in ThreeStudio: development-only Chromium smoke tests for the editor and Rapier recipe.

Playwright and its browser tooling remain subject to their upstream licences and notices. Playwright is not included in the production editor bundle.

## Three.js

- Package: `three`
- Upstream: https://github.com/mrdoob/three.js
- Licence: MIT
- Use in ThreeStudio: rendering, scene objects, editor controls, picking and GLB export.

Three.js remains subject to its upstream MIT licence and copyright notice.
