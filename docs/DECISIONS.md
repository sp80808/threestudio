# Decisions

## 1. State vs. Three.js Objects
**Decision**: Three.js `Object3D` instances are *not* the source of truth. The serializable `Project` state is the source of truth.
**Reasoning**: Ensures easy serialization, undo/redo functionality, and a clear separation between editing data and rendering visualization.

## 2. Editor State Library
**Decision**: Zustand.
**Reasoning**: Lightweight, works well outside of React (for command execution), easy to implement history middleware or custom undo/redo logic.

## 3. Persistence
**Decision**: Dexie (IndexedDB).
**Reasoning**: Local-first as per requirements. Allows saving larger project structures and future asset blobs without hitting `localStorage` limits.

## 4. UI Framework
**Decision**: Tailwind CSS + generic accessible components.
**Reasoning**: Native to the environment, fast to iterate, keeps bundle small.
