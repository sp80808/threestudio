/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Three.js scene building blocks.
 *
 * Kept separate from the viewport component so the mapping between document
 * components and Three.js objects is testable and reusable by the glTF export.
 */

import * as THREE from 'three';
import type { ColliderComponent, Project, RenderComponent } from '../simulation/schema';

/** The visual half of an entity: its mesh plus the collider/selection helpers. */
export interface EntityView {
  group: THREE.Group;
  mesh: THREE.Mesh | null;
  colliderHelper: THREE.LineSegments | null;
  geometryKind: RenderComponent['geometry'] | null;
  color: string | null;
  opacity: number | null;
}

const COLLIDER_COLOR = 0x38bdf8;
const TRIGGER_COLOR = 0xfbbf24;

export function createGeometry(kind: RenderComponent['geometry']): THREE.BufferGeometry {
  switch (kind) {
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 32, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, 32);
    case 'capsule':
      return new THREE.CapsuleGeometry(0.4, 0.8, 8, 16);
    case 'plane': {
      // Floors are authored as scaled unit planes, so lay the plane flat.
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

export function createMaterial(color: string, opacity?: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.6,
    metalness: 0.05,
  });
  if (opacity !== undefined && opacity < 1) {
    material.transparent = true;
    material.opacity = opacity;
  }
  return material;
}

/** Wireframe outline matching a collider component (box or sphere). */
export function createColliderHelper(collider: ColliderComponent): THREE.LineSegments {
  const size = collider.size;
  const geometry =
    collider.shape === 'sphere'
      ? new THREE.SphereGeometry(Math.max(size[0], size[1], size[2]) / 2, 12, 8)
      : new THREE.BoxGeometry(size[0], size[1], size[2]);
  const material = new THREE.LineBasicMaterial({
    color: collider.isTrigger ? TRIGGER_COLOR : COLLIDER_COLOR,
    transparent: true,
    opacity: 0.7,
  });

  const helper = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), material);
  const offset = collider.offset ?? [0, 0, 0];
  helper.position.set(offset[0], offset[1], offset[2]);
  helper.userData.isColliderHelper = true;
  geometry.dispose();
  return helper;
}

export function createEntityView(): EntityView {
  const group = new THREE.Group();
  group.name = 'entity';
  return {
    group,
    mesh: null,
    colliderHelper: null,
    geometryKind: null,
    color: null,
    opacity: null,
  };
}

/**
 * Restores the scene graph to match `parentId` links.
 *
 * Object groups are nested like the document says, so Three.js composes parent
 * transforms for both viewports and the glTF export — the runtime composes the
 * same way for collision (`src/runtime/hierarchy.test.ts` pins that down).
 * Groups are only re-parented when they are in the wrong place, so this is cheap
 * enough to run on every document change.
 */
export function applyHierarchy(
  project: Project,
  views: Map<string, EntityView>,
  root: THREE.Object3D,
): void {
  /**
   * True when attaching `id` under `parentId` would put an object inside itself
   * (imported documents can contain a cycle; the runtime reports it and uses the
   * transform as-is, and Three.js must not be handed a cycle at all).
   */
  const wouldCycle = (id: string, parentId: string): boolean => {
    let cursor: string | null = parentId;
    const seen = new Set<string>([id]);
    while (cursor) {
      if (cursor === id) return true;
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = project.entities[cursor]?.parentId ?? null;
    }
    return false;
  };

  for (const [id, view] of views) {
    if (!project.entities[id]) continue;
    const parentId = project.entities[id].parentId;
    const parentView = parentId ? views.get(parentId) : undefined;
    const desired: THREE.Object3D =
      parentView && parentView.group !== view.group && !wouldCycle(id, parentId as string)
        ? parentView.group
        : root;
    if (view.group.parent !== desired) desired.add(view.group);
  }
}

/** Applies the render component, rebuilding geometry/materials only on change. */
export function applyRenderComponent(
  view: EntityView,
  render: RenderComponent | undefined,
  collider: ColliderComponent | undefined,
): void {
  if (!render) {
    if (view.mesh) {
      view.group.remove(view.mesh);
      view.mesh.geometry.dispose();
      disposeMaterial(view.mesh.material);
      view.mesh = null;
      view.geometryKind = null;
      view.color = null;
      view.opacity = null;
    }
  } else {
    const needsMesh = !view.mesh || view.geometryKind !== render.geometry;
    if (needsMesh) {
      if (view.mesh) {
        view.group.remove(view.mesh);
        view.mesh.geometry.dispose();
        disposeMaterial(view.mesh.material);
      }
      const mesh = new THREE.Mesh(
        createGeometry(render.geometry),
        createMaterial(render.color, render.opacity),
      );
      mesh.userData.entityView = true;
      view.group.add(mesh);
      view.mesh = mesh;
      view.geometryKind = render.geometry;
      view.color = render.color;
      view.opacity = render.opacity ?? null;
    } else if (view.mesh) {
      if (view.color !== render.color || view.opacity !== (render.opacity ?? null)) {
        disposeMaterial(view.mesh.material);
        view.mesh.material = createMaterial(render.color, render.opacity);
        view.color = render.color;
        view.opacity = render.opacity ?? null;
      }
    }
  }

  if (collider) {
    if (!view.colliderHelper) {
      view.colliderHelper = createColliderHelper(collider);
      view.group.add(view.colliderHelper);
    }
  } else if (view.colliderHelper) {
    view.group.remove(view.colliderHelper);
    view.colliderHelper.geometry.dispose();
    disposeMaterial(view.colliderHelper.material);
    view.colliderHelper = null;
  }
}

export function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose();
  } else {
    material.dispose();
  }
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) disposeMaterial(mesh.material);
  });
}

export function createColliderPreview(collider: ColliderComponent): THREE.Object3D {
  const helper = createColliderHelper(collider);
  helper.userData.previewOnly = true;
  return helper;
}
