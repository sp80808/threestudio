import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { useEditorStore } from '../editor/store';
import {
  applyRuntimeBehaviours,
  createRuntimeBehaviourState,
  RuntimeBehaviourState,
} from '../runtime/behaviours';

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();

    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) material.dispose();
    } else {
      mesh.material?.dispose();
    }
  });
}

export default function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(5, 5, 5);

    const orbit = new OrbitControls(camera, renderer.domElement);
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(gridHelper);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    const transformControl = new TransformControls(camera, renderer.domElement);
    scene.add(transformControl.getHelper());

    const objectMap = new Map<string, THREE.Object3D>();
    const runtimeStateMap = new Map<string, RuntimeBehaviourState>();
    const clock = new THREE.Clock();
    let isPlaying = false;
    let isInitialSyncDone = false;

    const restoreEditTransforms = () => {
      const project = useEditorStore.getState().project;
      for (const [id, object] of objectMap.entries()) {
        const entity = project.entities[id];
        if (!entity) continue;
        object.position.fromArray(entity.transform.position);
        object.rotation.fromArray([...entity.transform.rotation, entity.transform.rotation[2], 'XYZ'] as never);
        object.rotation.set(
          entity.transform.rotation[0],
          entity.transform.rotation[1],
          entity.transform.rotation[2],
        );
        object.scale.fromArray(entity.transform.scale);
      }
    };

    const announcePlayState = () => {
      window.dispatchEvent(new CustomEvent('play-mode-state', { detail: { playing: isPlaying } }));
    };

    const startPlayMode = () => {
      if (isPlaying) return;
      restoreEditTransforms();
      runtimeStateMap.clear();
      for (const [id, object] of objectMap.entries()) {
        runtimeStateMap.set(id, createRuntimeBehaviourState(object));
      }
      transformControl.detach();
      transformControl.enabled = false;
      isPlaying = true;
      clock.start();
      announcePlayState();
    };

    const stopPlayMode = () => {
      if (!isPlaying) return;
      isPlaying = false;
      clock.stop();
      runtimeStateMap.clear();
      restoreEditTransforms();
      transformControl.enabled = true;

      const selectedId = useEditorStore.getState().selectedEntityId;
      const selectedObject = selectedId ? objectMap.get(selectedId) : undefined;
      if (selectedObject) transformControl.attach(selectedObject);
      announcePlayState();
    };

    transformControl.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
      if (!event.value && !isPlaying) {
        const selectedId = useEditorStore.getState().selectedEntityId;
        const object = selectedId ? objectMap.get(selectedId) : undefined;
        if (selectedId && object) {
          useEditorStore.getState().updateEntityTransform(selectedId, {
            position: [object.position.x, object.position.y, object.position.z],
            rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
            scale: [object.scale.x, object.scale.y, object.scale.z],
          });
        }
      }
    });

    const unsubscribe = useEditorStore.subscribe((state, previousState) => {
      const currentEntities = state.project.entities;

      for (const [id, object] of objectMap.entries()) {
        if (!currentEntities[id]) {
          scene.remove(object);
          disposeObject(object);
          objectMap.delete(id);
          runtimeStateMap.delete(id);
        }
      }

      for (const [id, entity] of Object.entries(currentEntities)) {
        let object = objectMap.get(id);

        if (!object) {
          object = new THREE.Group();
          object.name = entity.name;

          if (entity.components.render) {
            const renderComponent = entity.components.render;
            let geometry: THREE.BufferGeometry;

            switch (renderComponent.geometry) {
              case 'sphere':
                geometry = new THREE.SphereGeometry(0.5, 32, 16);
                break;
              case 'cylinder':
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
                break;
              case 'plane':
                geometry = new THREE.PlaneGeometry(1, 1);
                break;
              default:
                geometry = new THREE.BoxGeometry(1, 1, 1);
            }

            const material = new THREE.MeshStandardMaterial({ color: renderComponent.color });
            object.add(new THREE.Mesh(geometry, material));
          }

          scene.add(object);
          objectMap.set(id, object);
          if (isPlaying) runtimeStateMap.set(id, createRuntimeBehaviourState(object));
        }

        object.name = entity.name;
        if (!isPlaying && orbit.enabled) {
          object.position.fromArray(entity.transform.position);
          object.rotation.set(
            entity.transform.rotation[0],
            entity.transform.rotation[1],
            entity.transform.rotation[2],
          );
          object.scale.fromArray(entity.transform.scale);
        }
      }

      if (!isPlaying && state.selectedEntityId !== previousState.selectedEntityId) {
        const selectedObject = state.selectedEntityId
          ? objectMap.get(state.selectedEntityId)
          : undefined;
        if (selectedObject) transformControl.attach(selectedObject);
        else transformControl.detach();
      } else if (!state.selectedEntityId && isInitialSyncDone) {
        transformControl.detach();
      }

      if (state.transformMode !== previousState.transformMode) {
        transformControl.setMode(state.transformMode);
      }
      if (state.transformSpace !== previousState.transformSpace) {
        transformControl.setSpace(state.transformSpace);
      }
      isInitialSyncDone = true;
    });

    let animationFrameId = 0;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const deltaSeconds = Math.min(clock.getDelta(), 0.1);

      if (isPlaying) {
        const project = useEditorStore.getState().project;
        for (const [id, object] of objectMap.entries()) {
          const entity = project.entities[id];
          const runtimeState = runtimeStateMap.get(id);
          if (entity && runtimeState) {
            applyRuntimeBehaviours(entity, object, runtimeState, deltaSeconds);
          }
        }
      }

      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerDownPosition = new THREE.Vector2();

    const onPointerDown = (event: PointerEvent) => {
      pointerDownPosition.set(event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (isPlaying) return;
      if (
        Math.abs(event.clientX - pointerDownPosition.x) > 2 ||
        Math.abs(event.clientY - pointerDownPosition.y) > 2 ||
        !orbit.enabled
      ) return;

      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const roots = Array.from(objectMap.values());
      const intersections = raycaster.intersectObjects(roots, true);
      if (intersections.length === 0) {
        useEditorStore.getState().selectEntity(null);
        return;
      }

      let selected: THREE.Object3D | null = intersections[0].object;
      while (selected && !roots.includes(selected)) selected = selected.parent;
      if (!selected) return;

      for (const [id, object] of objectMap.entries()) {
        if (object === selected) {
          useEditorStore.getState().selectEntity(id);
          break;
        }
      }
    };

    const handleExport = () => {
      if (isPlaying) stopPlayMode();
      const exporter = new GLTFExporter();
      const exportScene = new THREE.Scene();
      for (const object of objectMap.values()) exportScene.add(object.clone());

      exporter.parse(
        exportScene,
        (gltf) => {
          const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = 'scene.glb';
          anchor.click();
          URL.revokeObjectURL(url);
        },
        (error) => console.error('Error exporting GLB:', error),
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
      const object = selectedId ? objectMap.get(selectedId) : undefined;
      if (!object) return;

      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return;

      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      const fieldOfView = camera.fov * (Math.PI / 180);
      const distance = Math.max(
        Math.abs(maxDimension / Math.sin(fieldOfView / 2)),
        maxDimension * 1.5,
      );

      const direction = new THREE.Vector3().subVectors(camera.position, orbit.target).normalize();
      if (direction.lengthSq() < 0.01) direction.set(1, 1, 1).normalize();

      orbit.target.copy(center);
      camera.position.copy(center).add(direction.multiplyScalar(distance));
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      orbit.update();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    window.addEventListener('export-glb', handleExport);
    window.addEventListener('zoom-in', handleZoomIn);
    window.addEventListener('zoom-out', handleZoomOut);
    window.addEventListener('focus-selected', handleFocus);
    window.addEventListener('start-play-mode', startPlayMode);
    window.addEventListener('stop-play-mode', stopPlayMode);

    useEditorStore.setState((state) => ({ ...state }));
    announcePlayState();

    return () => {
      if (isPlaying) stopPlayMode();
      unsubscribe();
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('export-glb', handleExport);
      window.removeEventListener('zoom-in', handleZoomIn);
      window.removeEventListener('zoom-out', handleZoomOut);
      window.removeEventListener('focus-selected', handleFocus);
      window.removeEventListener('start-play-mode', startPlayMode);
      window.removeEventListener('stop-play-mode', stopPlayMode);

      for (const object of objectMap.values()) disposeObject(object);
      renderer.dispose();
      transformControl.dispose();
      orbit.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="relative h-full w-full" style={{ outline: 'none' }} />;
}
