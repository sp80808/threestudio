import { Entity } from '../simulation/schema';

export interface PressurePlateDoorRecipe {
  entities: Entity[];
  selectedEntityId: string;
  ids: {
    ground: string;
    plate: string;
    door: string;
    crate: string;
  };
}

export function createPressurePlateDoorRecipe(): PressurePlateDoorRecipe {
  const ids = {
    ground: crypto.randomUUID(),
    plate: crypto.randomUUID(),
    door: crypto.randomUUID(),
    crate: crypto.randomUUID(),
  };

  const ground: Entity = {
    id: ids.ground,
    name: 'Recipe Ground',
    parentId: null,
    transform: {
      position: [0, -0.5, 0],
      rotation: [0, 0, 0],
      scale: [8, 1, 8],
    },
    components: {
      render: { type: 'render', geometry: 'box', color: '#3f3f46' },
      physics: { type: 'physics', bodyType: 'fixed', collider: 'box', sensor: false },
    },
  };

  const door: Entity = {
    id: ids.door,
    name: 'Recipe Door',
    parentId: null,
    transform: {
      position: [0, 1.5, -3],
      rotation: [0, 0, 0],
      scale: [1.5, 3, 0.4],
    },
    components: {
      render: { type: 'render', geometry: 'box', color: '#2563eb' },
      physics: { type: 'physics', bodyType: 'kinematic-position', collider: 'box', sensor: false },
    },
    behaviours: [
      {
        id: crypto.randomUUID(),
        type: 'door',
        label: 'Slide Up Door',
        enabled: true,
        parameters: {
          direction: 'y',
          distance: 3,
          duration: 0.4,
          autoClose: false,
          closeDelay: 0,
        },
      },
    ],
  };

  const plate: Entity = {
    id: ids.plate,
    name: 'Recipe Pressure Plate',
    parentId: null,
    transform: {
      position: [0, 0.1, 0],
      rotation: [0, 0, 0],
      scale: [2, 0.2, 2],
    },
    components: {
      render: { type: 'render', geometry: 'box', color: '#f59e0b' },
      physics: { type: 'physics', bodyType: 'fixed', collider: 'box', sensor: true },
    },
    behaviours: [
      {
        id: crypto.randomUUID(),
        type: 'pressure-plate',
        label: 'Open linked door',
        enabled: true,
        parameters: {
          targetEntityId: ids.door,
          releaseDelay: 0.2,
        },
      },
    ],
    rules: [
      {
        id: crypto.randomUUID(),
        name: 'WHEN crate enters plate DO open door',
        enabled: true,
        event: { type: 'trigger-enter', sourceEntityId: ids.plate },
        conditions: [],
        actions: [
          {
            id: crypto.randomUUID(),
            type: 'open-door',
            targetEntityId: ids.door,
            property: null,
            value: true,
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        name: 'WHEN crate leaves plate DO close door',
        enabled: true,
        event: { type: 'trigger-exit', sourceEntityId: ids.plate },
        conditions: [],
        actions: [
          {
            id: crypto.randomUUID(),
            type: 'close-door',
            targetEntityId: ids.door,
            property: null,
            value: false,
          },
        ],
      },
    ],
  };

  const crate: Entity = {
    id: ids.crate,
    name: 'Recipe Test Crate',
    parentId: null,
    transform: {
      position: [0, 4, 0],
      rotation: [0, 0, 0],
      scale: [0.8, 0.8, 0.8],
    },
    components: {
      render: { type: 'render', geometry: 'box', color: '#eab308' },
      physics: { type: 'physics', bodyType: 'dynamic', collider: 'box', sensor: false },
    },
  };

  return {
    entities: [ground, door, plate, crate],
    selectedEntityId: ids.plate,
    ids,
  };
}
