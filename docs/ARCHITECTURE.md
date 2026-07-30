# Architecture

## Core Boundaries
- **editor/**: UI components, scene hierarchy, inspector, transform tools, project editing, state management.
- **simulation/**: Entity-Component model, Zod schemas, serializable state representation.
- **render/**: Three.js viewport, WebGL canvas, Three.js object synchronization.
- **persistence/**: Local IndexedDB storage via Dexie, save/load, import/export.
- **runtime/**: (Future) Play mode execution, fixed-step loop.
- **physics/**: (Future) Rapier physics integration.
- **assets/**: (Future) Asset management, import pipeline.

## State Management
- **Zustand**: Manages editor state (selection, current tool, history).
- **History**: Uses a Command pattern or snapshot approach for Undo/Redo.
- **Entity Model**: Flat record of entities with parent/child relationships to allow easy updates and serialization.

## Three.js Integration
- The Three.js scene is constructed from the `Project` state.
- `TransformControls` and `OrbitControls` are used for interaction.
- The editor reacts to Three.js control changes and commits them to the state on drag end to avoid flooding history.
