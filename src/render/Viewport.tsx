import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { useEditorStore } from '../editor/store';

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
    
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);
    
    const orbit = new OrbitControls(camera, renderer.domElement);
    
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(gridHelper);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);
    
    const transformControl = new TransformControls(camera, renderer.domElement);
    scene.add(transformControl.getHelper());
    
    const objectMap = new Map<string, THREE.Object3D>();
    
    transformControl.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
      if (!event.value) {
         const selectedId = useEditorStore.getState().selectedEntityId;
         if (selectedId) {
             const obj = objectMap.get(selectedId);
             if (obj) {
                 useEditorStore.getState().updateEntityTransform(selectedId, {
                     position: [obj.position.x, obj.position.y, obj.position.z],
                     rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
                     scale: [obj.scale.x, obj.scale.y, obj.scale.z]
                 });
             }
         }
      }
    });

    let rafId: number;
    let isInitialSyncDone = false;
    
    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      const currentEntities = state.project.entities;
      
      for (const [id, obj] of Array.from(objectMap.entries())) {
        if (!currentEntities[id]) {
          scene.remove(obj);
          objectMap.delete(id);
        }
      }
      
      for (const [id, entity] of Object.entries(currentEntities)) {
        let obj = objectMap.get(id);
        if (!obj) {
          obj = new THREE.Group();
          
          if (entity.components.render) {
            const rc = entity.components.render as any;
            let geometry;
            switch(rc.geometry) {
              case 'box': geometry = new THREE.BoxGeometry(1,1,1); break;
              case 'sphere': geometry = new THREE.SphereGeometry(0.5, 32, 16); break;
              case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
              case 'plane': geometry = new THREE.PlaneGeometry(1, 1); break;
              default: geometry = new THREE.BoxGeometry(1,1,1);
            }
            const material = new THREE.MeshStandardMaterial({ color: rc.color });
            const mesh = new THREE.Mesh(geometry, material);
            obj.add(mesh);
          }
          
          scene.add(obj);
          objectMap.set(id, obj);
        }
        
        if (orbit.enabled) { 
            obj.position.set(entity.transform.position[0], entity.transform.position[1], entity.transform.position[2]);
            obj.rotation.set(entity.transform.rotation[0], entity.transform.rotation[1], entity.transform.rotation[2]);
            obj.scale.set(entity.transform.scale[0], entity.transform.scale[1], entity.transform.scale[2]);
        }
      }
      
      if (state.selectedEntityId && state.selectedEntityId !== prevState.selectedEntityId) {
        const obj = objectMap.get(state.selectedEntityId);
        if (obj) transformControl.attach(obj);
        else transformControl.detach();
      } else if (!state.selectedEntityId && isInitialSyncDone) {
        transformControl.detach();
      }
      
      if (state.transformMode !== prevState.transformMode) {
        transformControl.setMode(state.transformMode);
      }
      if (state.transformSpace !== prevState.transformSpace) {
        transformControl.setSpace(state.transformSpace);
      }
      isInitialSyncDone = true;
    });

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();
    
    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downMouse = new THREE.Vector2();
    
    const onPointerDown = (e: PointerEvent) => {
        downMouse.set(e.clientX, e.clientY);
    }

    const onPointerUp = (e: PointerEvent) => {
       if (Math.abs(e.clientX - downMouse.x) > 2 || Math.abs(e.clientY - downMouse.y) > 2) return;
       if (!orbit.enabled) return;

      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      
      const meshes = Array.from(objectMap.values());
      const intersects = raycaster.intersectObjects(meshes, true);
      
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while(obj && !meshes.includes(obj)) {
            obj = obj.parent;
        }
        
        if (obj) {
            for (const [id, o] of objectMap.entries()) {
                if (o === obj) {
                    useEditorStore.getState().selectEntity(id);
                    return;
                }
            }
        }
      } else {
        useEditorStore.getState().selectEntity(null);
      }
    };
    
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointerdown', onPointerDown);

    const handleExport = () => {
      const exporter = new GLTFExporter();
      
      // We only want to export the user's objects, not helpers.
      const exportScene = new THREE.Scene();
      for (const obj of Array.from(objectMap.values())) {
          exportScene.add(obj.clone());
      }
      
      exporter.parse(
          exportScene,
          (gltf) => {
              const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'scene.glb';
              a.click();
              URL.revokeObjectURL(url);
          },
          (error) => {
              console.error('Error exporting GLB:', error);
          },
          { binary: true }
      );
    };

    const handleZoomIn = () => {
      const vec = new THREE.Vector3().subVectors(camera.position, orbit.target);
      camera.position.copy(orbit.target).add(vec.divideScalar(1.2));
      orbit.update();
    };

    const handleZoomOut = () => {
      const vec = new THREE.Vector3().subVectors(camera.position, orbit.target);
      camera.position.copy(orbit.target).add(vec.multiplyScalar(1.2));
      orbit.update();
    };

    const handleFocus = () => {
      const selectedId = useEditorStore.getState().selectedEntityId;
      if (!selectedId) return;
      const obj = objectMap.get(selectedId);
      if (!obj) return;
      
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      
      const center = new THREE.Vector3();
      box.getCenter(center);
      
      const size = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2));
      
      // ensure minimum distance
      cameraDistance = Math.max(cameraDistance, maxDim * 1.5);
      
      orbit.target.copy(center);
      const direction = new THREE.Vector3().subVectors(camera.position, orbit.target).normalize();
      if (direction.lengthSq() < 0.01) {
          direction.set(1, 1, 1).normalize();
      }
      
      camera.position.copy(center).add(direction.multiplyScalar(cameraDistance));
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      orbit.update();
    };

    window.addEventListener('export-glb', handleExport);
    window.addEventListener('zoom-in', handleZoomIn);
    window.addEventListener('zoom-out', handleZoomOut);
    window.addEventListener('focus-selected', handleFocus);

    // Initial manual sync trick to get zustand data correctly parsed once
    useEditorStore.setState(s => ({ ...s }));

    return () => {
      unsubscribe();
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('export-glb', handleExport);
      window.removeEventListener('zoom-in', handleZoomIn);
      window.removeEventListener('zoom-out', handleZoomOut);
      window.removeEventListener('focus-selected', handleFocus);
      renderer.dispose();
      transformControl.dispose();
      orbit.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full relative" style={{ outline: 'none' }} />;
}
