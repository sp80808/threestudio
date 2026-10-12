/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Importing external models (glTF / GLB).
 *
 * The document model deliberately has no binary asset slot: it is portable JSON
 * of primitives, behaviours and rules. Importing therefore converts a model's
 * node hierarchy into entities — each mesh becomes a box sized to its bounding
 * box, keeping the node's transform, colour and parent link — so the result is
 * editable with the same tools as hand-built objects, collides with the same
 * collision code, and can be exported again as GLB.
 *
 * This lives in `render/` because it is the only layer allowed to touch Three.js
 * (see `docs/ARCHITECTURE.md`); the resulting entities are plain document data.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createEntity, type Entity, type Vec3 } from '../simulation/schema';

/** Most imports are level blockouts; anything larger is probably a mistake. */
export const MAX_IMPORTED_OBJECTS = 2000;

export interface ImportedModel {
  entities: Entity[];
  /** True when the model had more objects than the importer kept. */
  truncated: boolean;
  /** Number of nodes in the file, including ones the importer skipped. */
  nodeCount: number;
  meshCount: number;
}

function toVec3(value: THREE.Vector3): Vec3 {
  return [value.x, value.y, value.z];
}

function colorOf(mesh: THREE.Mesh): string {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const color = (material as THREE.MeshStandardMaterial | undefined)?.color;
  return color ? `#${color.getHexString()}` : '#9aa3b2';
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

/**
 * Converts a loaded model into document entities.
 *
 * Geometry is approximated by its bounding box, because that is what the engine
 * can collide with and what an author can then tune. Non-mesh nodes still become
 * entities (without a render component) so the node hierarchy survives the trip.
 */
export function entitiesFromObject3D(
  root: THREE.Object3D,
  options: { idPrefix?: string; parentId?: string | null; includeRoot?: boolean } = {},
): ImportedModel {
  const prefix = options.idPrefix ?? 'model';
  const entities: Entity[] = [];
  let nodeCount = 0;
  let meshCount = 0;
  let truncated = false;

  const scratchCentre = new THREE.Vector3();
  const scratchSize = new THREE.Vector3();
  const scratchEuler = new THREE.Euler();

  const visit = (object: THREE.Object3D, parentId: string | null) => {
    nodeCount += 1;
    if (entities.length >= MAX_IMPORTED_OBJECTS) {
      truncated = true;
      return;
    }

    const id = `${prefix}-${entities.length + 1}`;
    const name = object.name?.trim() || (isMesh(object) ? 'Mesh' : 'Group');
    // glTF stores rotations as quaternions; the document uses XYZ Euler angles.
    scratchEuler.setFromQuaternion(object.quaternion, 'XYZ');

    if (isMesh(object)) {
      meshCount += 1;
      const geometry = object.geometry;
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox ?? new THREE.Box3();
      bounds.getCenter(scratchCentre);
      bounds.getSize(scratchSize);

      // The entity is a box: its size is the mesh's local extent (multiplied by
      // the node scale), and its position is the box centre expressed in the
      // parent's space, so an off-centre geometry still lands in the right place.
      const localCentre = scratchCentre
        .clone()
        .multiply(object.scale)
        .applyQuaternion(object.quaternion)
        .add(object.position);

      entities.push(
        createEntity({
          id,
          name,
          parentId,
          geometry: 'box',
          color: colorOf(object),
          position: toVec3(localCentre),
          rotation: [scratchEuler.x, scratchEuler.y, scratchEuler.z],
          scale: [
            Math.max(object.scale.x * scratchSize.x, 0.01),
            Math.max(object.scale.y * scratchSize.y, 0.01),
            Math.max(object.scale.z * scratchSize.z, 0.01),
          ],
        }),
      );
    } else {
      // A node without a mesh still carries the hierarchy (and often the pose of
      // the parts below it), so it becomes an object with no appearance.
      entities.push(
        createEntity({
          id,
          name,
          parentId,
          position: toVec3(object.position),
          rotation: [scratchEuler.x, scratchEuler.y, scratchEuler.z],
          scale: toVec3(object.scale),
        }),
      );
    }

    for (const child of object.children) visit(child, id);
  };

  if (options.includeRoot === false) {
    // A loaded glTF scene is a container, not something the author drew, so its
    // children become the top-level objects and no placeholder group appears.
    for (const child of root.children) visit(child, options.parentId ?? null);
  } else {
    visit(root, options.parentId ?? null);
  }

  return { entities, truncated, nodeCount, meshCount };
}

/** Parses a glTF/GLB file (or any ArrayBuffer of one) into a Three.js scene. */
export async function loadModel(data: ArrayBuffer | string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const result = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
    loader.parse(data, '', (gltf) => resolve(gltf as unknown as { scene: THREE.Object3D }), reject);
  });
  return result.scene;
}

/** Reads a file chosen in the editor and converts it into entities. */
export async function importModelFile(
  file: File,
  options: { idPrefix?: string } = {},
): Promise<ImportedModel> {
  const data = await file.arrayBuffer();
  const scene = await loadModel(data);
  const prefix = options.idPrefix ?? file.name.replace(/\.[^.]+$/, '') ?? '';
  return entitiesFromObject3D(scene, { idPrefix: prefix || 'model', includeRoot: false });
}
