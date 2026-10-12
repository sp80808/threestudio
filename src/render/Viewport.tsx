/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * The editor viewport.
 *
 * Two clearly separated modes:
 *
 *  - **Edit mode**: Three.js objects follow the document. Selecting, dragging the
 *    gizmo and clicking all write back into the store; the simulation is not
 *    running, so the scene always matches what will be saved.
 *  - **Play mode**: a `World` is created from a *clone* of the document and owns
 *    the scene. The viewport only mirrors runtime entity transforms into the
 *    Three.js objects and forwards input (keys, clicks) into the simulation.
 *
 * Because play mode never writes to the document, stopping always restores the
 * authored scene exactly — the isolation guarantee the architecture doc calls for.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { resolveSettings, type Entity, type Project } from '../simulation/schema';
import { createDomInput, type DomInput } from '../runtime/input';
import { createEmptyRecording, createRecordingInput, type Recording, type RecordingInput } from '../runtime/replay';
import { serializeRecording } from '../persistence/recording';
import { createWorld, type World } from '../runtime/world';
import { useEditorStore } from '../editor/store';
import { PLAY_EVENTS, usePlayStore } from '../editor/playStore';
import { useViewStore } from '../editor/viewStore';
import {
  applyRenderComponent,
  createEntityView,
  disposeObject,
  type EntityView,
} from './scene-builder';
import PlayHud from './PlayHud';

function applyEntityTransform(object: THREE.Object3D, entity: Entity): void {
  const { position, rotation, scale } = entity.transform;
  object.position.set(position[0], position[1], position[2]);
  object.rotation.set(rotation[0], rotation[1], rotation[2], 'XYZ');
  object.scale.set(scale[0], scale[1], scale[2]);
}

export default function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ---------------------------------------------------------------------
    // Renderer, scene and camera
    // ---------------------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x18181b);

    const camera = new THREE.PerspectiveCamera(
      50,
      (container.clientWidth || 1) / (container.clientHeight || 1),
      0.1,
      2000,
    );
    camera.position.set(8, 9, 14);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.12;
    orbit.maxPolarAngle = Math.PI * 0.495;
    orbit.target.set(0, 1, 0);

    const grid = new THREE.GridHelper(60, 60, 0x3f3f46, 0x27272a);
    grid.position.y = 0;
    scene.add(grid);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    const hemisphere = new THREE.HemisphereLight(0xbfd4ff, 0x2b2b31, 0.5);
    scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    scene.add(sun);

    const transformControl = new TransformControls(camera, renderer.domElement);
    transformControl.size = 0.9;
    scene.add(transformControl.getHelper());

    const selectionHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x60a5fa);
    selectionHelper.visible = false;
    scene.add(selectionHelper);

    // ---------------------------------------------------------------------
    // Document → scene synchronisation
    // ---------------------------------------------------------------------
    const views = new Map<string, EntityView>();

    const removeView = (id: string) => {
      const view = views.get(id);
      if (!view) return;
      scene.remove(view.group);
      disposeObject(view.group);
      views.delete(id);
    };

    const syncScene = (project: Project) => {
      for (const id of [...views.keys()]) {
        if (!project.entities[id]) removeView(id);
      }

      for (const entity of Object.values(project.entities)) {
        let view = views.get(entity.id);
        if (!view) {
          view = createEntityView();
          scene.add(view.group);
          views.set(entity.id, view);
        }
        view.group.name = entity.name;
        applyRenderComponent(view, entity.components.render, entity.components.collider);
        if (!world) applyEntityTransform(view.group, entity);
      }
    };

    // ---------------------------------------------------------------------
    // Selection and gizmo
    // ---------------------------------------------------------------------
    const syncGizmo = () => {
      const state = useEditorStore.getState();
      const selectedId = state.selectedEntityId;
      const view = selectedId ? views.get(selectedId) : undefined;
      const hideGizmo = useViewStore.getState().hideGizmo || isPlaying();

      if (view && !isPlaying()) {
        transformControl.attach(view.group);
        selectionHelper.setFromObject(view.group);
        selectionHelper.visible = !hideGizmo;
      } else {
        transformControl.detach();
        selectionHelper.visible = false;
      }
    };

    transformControl.addEventListener('dragging-changed', (event) => {
      const dragging = (event as unknown as { value: boolean }).value;
      orbit.enabled = !dragging;
      if (dragging || world) return;

      const state = useEditorStore.getState();
      const id = state.selectedEntityId;
      const view = id ? views.get(id) : undefined;
      if (!id || !view) return;

      const { position, rotation, scale } = view.group;
      state.updateEntityTransform(id, {
        position: [position.x, position.y, position.z],
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [scale.x, scale.y, scale.z],
      });
    });

    // ---------------------------------------------------------------------
    // Play mode
    // ---------------------------------------------------------------------
    let world: World | null = null;
    let input: DomInput | null = null;
    let recordingInput: RecordingInput | null = null;
    /** Kept after the session ends so a recording can still be downloaded. */
    let lastRecording: Recording | null = null;
    let sessionSeed = 0;
    const hudThrottle = { frames: 0 };
    const isPlaying = () => world !== null;

    const publishSnapshot = () => {
      if (!world) {
        usePlayStore.getState().setSnapshot({
          status: 'stopped',
          stats: null,
          variables: [],
          diagnostics: [],
          recording: false,
          recordedFrames: lastRecording?.frames.length ?? 0,
        });
        return;
      }
      usePlayStore.getState().setSnapshot({
        status: world.isPaused() ? 'paused' : 'playing',
        stats: world.getStats(),
        variables: world.getVariableEntries(),
        diagnostics: world.getDiagnostics().slice(-30).reverse(),
        recording: recordingInput?.isRecording ?? false,
        recordedFrames: recordingInput?.frames.length ?? 0,
      });
    };

    const startPlayMode = () => {
      if (world) return;
      const project = useEditorStore.getState().project;
      if (Object.keys(project.entities).length === 0) return;

      input = createDomInput(renderer.domElement);
      // Every session is replayable: the runtime reads from the recording
      // wrapper, which forwards to the DOM input and captures frames on demand.
      recordingInput = createRecordingInput(input);
      sessionSeed = project.id.length * 7919 + 13;
      world = createWorld({ project, input: recordingInput, seed: sessionSeed });
      world.start();

      // Play mode owns the scene: hide editor-only helpers and hand control to
      // the runtime transforms.
      grid.visible = false;
      transformControl.detach();
      transformControl.enabled = false;
      selectionHelper.visible = false;
      for (const view of views.values()) {
        if (view.colliderHelper) view.colliderHelper.visible = false;
        view.group.rotation.set(0, 0, 0);
      }

      publishSnapshot();
    };

    const syncFromWorld = () => {
      if (!world) return;

      for (const [id, view] of views) {
        const entity = world.getEntity(id);
        if (!entity) {
          view.group.visible = false;
          continue;
        }
        view.group.visible = entity.visible;
        view.group.position.set(entity.position[0], entity.position[1], entity.position[2]);
        view.group.rotation.set(entity.rotation[0], entity.rotation[1], entity.rotation[2], 'XYZ');
        view.group.scale.set(entity.scale[0], entity.scale[1], entity.scale[2]);
      }

      const settings = resolveSettings(useEditorStore.getState().project);
      const player = world.getPlayer();
      if (settings.cameraFollow && player) {
        // Keep whatever orbit offset the author chose, but follow the player.
        scratchTarget.set(player.position[0], player.position[1], player.position[2]);
        scratchShift.copy(scratchTarget).sub(orbit.target).multiplyScalar(0.12);
        orbit.target.add(scratchShift);
        camera.position.add(scratchShift);
      }

      // Camera yaw uses the three.js convention (looking down -Z at yaw 0),
      // which is what the character behaviour expects for camera-relative input.
      camera.getWorldDirection(scratchForward);
      world.setCameraYaw(Math.atan2(-scratchForward.x, -scratchForward.z));
    };

    const stopPlayMode = () => {
      if (!world) return;
      world.dispose();
      world = null;
      input?.dispose();
      input = null;

      // Keep whatever was captured so it can still be downloaded afterwards.
      if (recordingInput) {
        recordingInput.stop();
        if (recordingInput.frames.length > 0) {
          lastRecording = {
            ...createEmptyRecording({
              stepRate: resolveSettings(useEditorStore.getState().project).stepRate,
              seed: sessionSeed,
              projectId: useEditorStore.getState().project.id,
              createdAt: Date.now(),
            }),
            frames: recordingInput.frames,
          };
        }
        recordingInput = null;
      }

      grid.visible = useViewStore.getState().showGrid;
      transformControl.enabled = true;
      for (const [id, view] of views) {
        const entity = useEditorStore.getState().project.entities[id];
        if (entity) {
          applyEntityTransform(view.group, entity);
          view.group.visible = entity.components.render?.visible ?? true;
        }
        if (view.colliderHelper) view.colliderHelper.visible = useViewStore.getState().showColliders;
      }
      syncGizmo();
      publishSnapshot();
    };

    const pausePlayMode = () => {
      if (!world) return;
      if (world.isPaused()) world.resume();
      else world.pause();
      publishSnapshot();
    };

    const recordPlayMode = () => {
      if (!recordingInput) return;
      recordingInput.start();
      publishSnapshot();
    };

    const stopRecording = () => {
      if (!recordingInput) return;
      recordingInput.stop();
      publishSnapshot();
    };

    const downloadRecording = () => {
      const recording: Recording | null =
        recordingInput && recordingInput.frames.length > 0
          ? {
              ...createEmptyRecording({
                stepRate: resolveSettings(useEditorStore.getState().project).stepRate,
                seed: sessionSeed,
                projectId: useEditorStore.getState().project.id,
                createdAt: Date.now(),
              }),
              frames: recordingInput.frames,
            }
          : lastRecording;
      if (!recording) return;

      const project = useEditorStore.getState().project;
      const blob = new Blob([serializeRecording(recording, { pretty: true })], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.name || 'session'}.threestudio-recording.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    };

    const stepPlayMode = () => {
      if (!world) return;
      world.pause();
      world.stepOnce();
      syncFromWorld();
      publishSnapshot();
    };

    // ---------------------------------------------------------------------
    // Store subscriptions
    // ---------------------------------------------------------------------
    const unsubscribeEditor = useEditorStore.subscribe((state, previous) => {
      if (state.project !== previous.project) {
        syncScene(state.project);
        // Structural edits during play are adopted without restarting the session.
        world?.syncFromProject(state.project);
        if (!world) syncGizmo();
      }
      if (state.selectedEntityId !== previous.selectedEntityId) syncGizmo();
      if (state.transformMode !== previous.transformMode) transformControl.setMode(state.transformMode);
      if (state.transformSpace !== previous.transformSpace) transformControl.setSpace(state.transformSpace);
    });

    const unsubscribeView = useViewStore.subscribe((state, previous) => {
      grid.visible = state.showGrid && !world;
      if (state.showColliders !== previous.showColliders || state.hideGizmo !== previous.hideGizmo) {
        for (const view of views.values()) {
          if (view.colliderHelper) view.colliderHelper.visible = state.showColliders && !world;
        }
        syncGizmo();
      }
    });

    // Global keyboard shortcuts (editor conveniences, not simulation input).
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const store = useEditorStore.getState();

      // While the game runs the keyboard belongs to the game, apart from the
      // transport controls.
      if (world) {
        if (event.key === 'Escape') {
          event.preventDefault();
          stopPlayMode();
        } else if (event.key.toLowerCase() === 'p') {
          event.preventDefault();
          pausePlayMode();
        } else if (event.key === '.' || event.key === ',') {
          event.preventDefault();
          stepPlayMode();
        }
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        startPlayMode();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        if (store.selectedEntityId) store.duplicateEntity(store.selectedEntityId);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (store.selectedEntityId) store.removeEntity(store.selectedEntityId);
        return;
      }
      if (event.key.toLowerCase() === 'w') store.setTransformMode('translate');
      if (event.key.toLowerCase() === 'e') store.setTransformMode('rotate');
      if (event.key.toLowerCase() === 'r') store.setTransformMode('scale');
      if (event.key.toLowerCase() === 'f') window.dispatchEvent(new CustomEvent('focus-selected'));
    };

    window.addEventListener('keydown', onKeyDown);

    // ---------------------------------------------------------------------
    // Pointer interaction (selection in edit mode, clicks in play mode)
    // ---------------------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerDown = new THREE.Vector2();
    // Reused every frame: the render loop must not allocate.
    const scratchForward = new THREE.Vector3();
    const scratchTarget = new THREE.Vector3();
    const scratchShift = new THREE.Vector3();

    const pickEntity = (event: PointerEvent): { id: string; point: THREE.Vector3 } | null => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const roots: THREE.Object3D[] = [...views.values()].map((view) => view.group);
      const intersections = raycaster.intersectObjects(roots, true);
      if (intersections.length === 0) return null;

      let object: THREE.Object3D | null = intersections[0].object;
      while (object && !roots.includes(object)) object = object.parent;
      if (!object) return null;

      for (const [id, view] of views) {
        if (view.group === object) return { id, point: intersections[0].point };
      }
      return null;
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerDown.set(event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (Math.abs(event.clientX - pointerDown.x) > 3 || Math.abs(event.clientY - pointerDown.y) > 3) {
        return;
      }
      if (transformControl.dragging) return;

      const hit = pickEntity(event);

      if (world) {
        // Clicking is gameplay input: the renderer resolves *what* was clicked,
        // the simulation decides what that means.
        input?.pushPick(hit?.id ?? null, hit ? [hit.point.x, hit.point.y, hit.point.z] : [0, 0, 0]);
        return;
      }

      useEditorStore.getState().selectEntity(hit?.id ?? null);
    };

    // ---------------------------------------------------------------------
    // Export and view commands
    // ---------------------------------------------------------------------
    const handleExport = () => {
      stopPlayMode();
      const exporter = new GLTFExporter();
      const exportScene = new THREE.Scene();
      for (const view of views.values()) exportScene.add(view.group.clone() as THREE.Group);

      const fileName = `${useEditorStore.getState().project.name || 'scene'}.glb`;

      exporter.parse(
        exportScene,
        (gltf) => {
          const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = fileName;
          anchor.click();
          URL.revokeObjectURL(url);
          // The toolbar owns the toast, so report the result back to it.
          window.dispatchEvent(new CustomEvent('glb-exported', { detail: { ok: true, name: fileName } }));
        },
        (error) => {
          console.error('Error exporting GLB:', error);
          window.dispatchEvent(
            new CustomEvent('glb-exported', {
              detail: { ok: false, error: error instanceof Error ? error.message : String(error) },
            }),
          );
        },
        { binary: true },
      );
    };

    const handleZoomIn = () => {
      const offset = new THREE.Vector3().subVectors(camera.position, orbit.target);
      camera.position.copy(orbit.target).add(offset.divideScalar(1.2));
      orbit.update();
    };

    const handleZoomOut = () => {
      const offset = new THREE.Vector3().subVectors(camera.position, orbit.target);
      camera.position.copy(orbit.target).add(offset.multiplyScalar(1.2));
      orbit.update();
    };

    const handleFocus = () => {
      const selectedId = useEditorStore.getState().selectedEntityId;
      const view = selectedId ? views.get(selectedId) : undefined;
      if (!view) return;

      const bounds = new THREE.Box3().setFromObject(view.group);
      if (bounds.isEmpty()) return;

      const centre = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z, 1);
      const fieldOfView = camera.fov * (Math.PI / 180);
      const distance = Math.max(Math.abs(maxDimension / Math.sin(fieldOfView / 2)), maxDimension * 1.6);

      const direction = new THREE.Vector3().subVectors(camera.position, orbit.target).normalize();
      if (direction.lengthSq() < 0.01) direction.set(1, 1, 1).normalize();

      orbit.target.copy(centre);
      camera.position.copy(centre).add(direction.multiplyScalar(distance));
      camera.lookAt(centre);
      camera.updateProjectionMatrix();
      orbit.update();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('export-glb', handleExport);
    window.addEventListener('zoom-in', handleZoomIn);
    window.addEventListener('zoom-out', handleZoomOut);
    window.addEventListener('focus-selected', handleFocus);
    window.addEventListener(PLAY_EVENTS.start, startPlayMode);
    window.addEventListener(PLAY_EVENTS.stop, stopPlayMode);
    window.addEventListener(PLAY_EVENTS.record, recordPlayMode);
    window.addEventListener(PLAY_EVENTS.stopRecording, stopRecording);
    window.addEventListener(PLAY_EVENTS.downloadRecording, downloadRecording);
    window.addEventListener(PLAY_EVENTS.pause, pausePlayMode);
    window.addEventListener(PLAY_EVENTS.step, stepPlayMode);

    // ---------------------------------------------------------------------
    // Initial sync, render loop, resize
    // ---------------------------------------------------------------------
    const initialProject = useEditorStore.getState().project;
    syncScene(initialProject);
    transformControl.setMode(useEditorStore.getState().transformMode);
    transformControl.setSpace(useEditorStore.getState().transformSpace);
    grid.visible = useViewStore.getState().showGrid;
    for (const view of views.values()) {
      if (view.colliderHelper) view.colliderHelper.visible = useViewStore.getState().showColliders;
    }
    publishSnapshot();

    const clock = new THREE.Clock();
    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.25);

      if (world && !world.isPaused()) {
        world.step(delta);
        syncFromWorld();

        hudThrottle.frames += 1;
        if (hudThrottle.frames >= 6) {
          hudThrottle.frames = 0;
          publishSnapshot();
        }
      }

      if (!world) {
        for (const view of views.values()) {
          if (view.colliderHelper) view.colliderHelper.visible = useViewStore.getState().showColliders;
        }
        selectionHelper.visible = transformControl.object !== undefined && !useViewStore.getState().hideGizmo;
      }

      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    return () => {
      unsubscribeEditor();
      unsubscribeView();
      window.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('export-glb', handleExport);
      window.removeEventListener('zoom-in', handleZoomIn);
      window.removeEventListener('zoom-out', handleZoomOut);
      window.removeEventListener('focus-selected', handleFocus);
      window.removeEventListener(PLAY_EVENTS.start, startPlayMode);
      window.removeEventListener(PLAY_EVENTS.stop, stopPlayMode);
      window.removeEventListener(PLAY_EVENTS.record, recordPlayMode);
      window.removeEventListener(PLAY_EVENTS.stopRecording, stopRecording);
      window.removeEventListener(PLAY_EVENTS.downloadRecording, downloadRecording);
      window.removeEventListener(PLAY_EVENTS.pause, pausePlayMode);
      window.removeEventListener(PLAY_EVENTS.step, stepPlayMode);

      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      world?.dispose();
      input?.dispose();
      for (const view of views.values()) disposeObject(view.group);
      renderer.dispose();
      transformControl.dispose();
      orbit.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" style={{ outline: 'none' }} />
      <PlayHud />
    </div>
  );
}
