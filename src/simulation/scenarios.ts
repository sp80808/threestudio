/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Ready-made scenes.
 *
 * Templates are plain project documents, so they double as executable
 * documentation: every one of them is covered by the runtime test suite
 * (see `src/runtime/scenario.test.ts`).
 */

import {
  createEntity,
  createRule,
  createRuleAction,
  createRuleCondition,
  createVariable,
  type Project,
} from './schema';
import { createBehaviourInstance } from '../runtime/behaviours';

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  create: () => Project;
}

function projectBase(id: string, name: string): Project {
  return {
    id,
    version: 2,
    name,
    entities: {},
    variables: {},
    rules: [],
    settings: { stepRate: 60, gravity: -9.81, cameraFollow: true, maxStepsPerFrame: 5 },
  };
}

/**
 * Tutorial scene and the project's acceptance scenario: walk onto the pressure
 * plate, the door slides open, collect three gems to reveal the portal.
 *
 * It exercises every layer of the runtime on purpose — behaviours (character,
 * door, pressure-plate, collectible, spin, bob), triggers, messages, rules,
 * variables and conditions.
 */
export function createPressurePlateDoorScene(): Project {
  const project = projectBase('scene-pressure-plate-door', 'Pressure Plate Door');

  project.variables = {
    gems: createVariable('gems', 'Gems', 'number', 0),
    allGems: createVariable('allGems', 'All gems found', 'boolean', false),
  };

  const ground = createEntity({
    id: 'ground',
    name: 'Ground',
    geometry: 'plane',
    color: '#2f3640',
    position: [0, -0.2, 0],
    scale: [26, 1, 26],
    collider: { size: [1, 0.4, 1] },
    tags: ['ground'],
  });

  const player = createEntity({
    id: 'player',
    name: 'Player',
    geometry: 'capsule',
    color: '#4c9aff',
    position: [0, 0.85, 8],
    collider: { size: [0.9, 1.7, 0.9] },
    tags: ['player'],
    behaviours: [
      createBehaviourInstance('character', {
        speed: 6,
        jumpSpeed: 5.2,
        turnToFaceMotion: true,
        relativeToCamera: true,
        useGravity: true,
      }),
    ],
  });

  const wallLeft = createEntity({
    id: 'wall-left',
    name: 'Wall (left)',
    geometry: 'box',
    color: '#59606d',
    position: [-4, 1.5, 0],
    collider: { size: [5, 3, 0.6] },
  });

  const wallRight = createEntity({
    id: 'wall-right',
    name: 'Wall (right)',
    geometry: 'box',
    color: '#59606d',
    position: [4, 1.5, 0],
    collider: { size: [5, 3, 0.6] },
  });

  const door = createEntity({
    id: 'door-main',
    name: 'Door',
    geometry: 'box',
    color: '#c98a2e',
    position: [0, 1.5, 0],
    collider: { size: [3, 3, 0.4] },
    behaviours: [
      createBehaviourInstance('door', {
        axis: 'y',
        distance: 3,
        duration: 0.8,
        autoClose: true,
        closeDelay: 2.5,
        openMessage: 'open',
        closeMessage: 'close',
      }),
    ],
  });

  const plate = createEntity({
    id: 'plate-main',
    name: 'Pressure plate',
    geometry: 'box',
    color: '#3f9e6a',
    position: [1.6, 0.12, 4.6],
    // The trigger volume is lifted above the floor: an overlap with the ground
    // would otherwise count as "something is standing on the plate".
    collider: { size: [2.4, 0.4, 2.4], isTrigger: true, offset: [0, 0.3, 0] },
    behaviours: [
      createBehaviourInstance('pressure-plate', {
        targetEntityId: '',
        message: 'open',
        releaseMessage: 'close',
        releaseDelay: 0.2,
        sinkDepth: 0.12,
      }),
    ],
    rules: [
      createRule({
        id: 'plate-open-door',
        name: 'Plate pressed → open the door',
        event: { type: 'custom', sourceEntityId: null, name: 'open', interval: null },
        actions: [createRuleAction('emit-event', { targetEntityId: 'door-main', property: 'open', value: true })],
      }),
      createRule({
        id: 'plate-release-door',
        name: 'Plate released → close the door',
        event: { type: 'custom', sourceEntityId: null, name: 'close', interval: null },
        actions: [createRuleAction('emit-event', { targetEntityId: 'door-main', property: 'close', value: false })],
      }),
      createRule({
        id: 'plate-click-open',
        name: 'Click the plate → open the door too',
        event: { type: 'pointer-click', sourceEntityId: null, name: null, interval: null },
        actions: [createRuleAction('emit-event', { targetEntityId: 'door-main', property: 'open', value: true })],
      }),
    ],
  });

  const gemPositions: [number, number, number][] = [
    [0, 0.6, -3],
    [1.6, 0.6, -4.8],
    [-1.6, 0.6, -4.8],
  ];

  const gems = gemPositions.map((position, index) =>
    createEntity({
      id: `gem-${index + 1}`,
      name: `Gem ${index + 1}`,
      geometry: 'sphere',
      color: '#e8c547',
      position,
      collider: { size: [0.9, 0.9, 0.9], isTrigger: true },
      behaviours: [
        createBehaviourInstance('collectible', {
          variableId: 'gems',
          amount: 1,
          onlyPlayer: true,
          hideWhenCollected: true,
          message: 'collected',
        }),
        createBehaviourInstance('spin', { axis: 'y', speed: 90 }),
      ],
    }),
  );

  const portal = createEntity({
    id: 'portal',
    name: 'Portal',
    geometry: 'sphere',
    color: '#7c5cff',
    position: [0, 1.6, -7],
    visible: false,
    behaviours: [createBehaviourInstance('spin', { axis: 'y', speed: 60 })],
  });

  const drone = createEntity({
    id: 'drone',
    name: 'Hovering drone',
    geometry: 'box',
    color: '#d16ba5',
    position: [-4, 2.2, 4.5],
    scale: [0.7, 0.7, 0.7],
    behaviours: [
      createBehaviourInstance('spin', { axis: 'y', speed: 60 }),
      createBehaviourInstance('bob', { axis: 'y', amplitude: 0.4, frequency: 0.4 }),
    ],
  });

  for (const entity of [ground, player, wallLeft, wallRight, door, plate, portal, drone, ...gems]) {
    project.entities[entity.id] = entity;
  }

  // Scene-wide rules: they belong to the scene rather than to one object, which
  // is what makes "reveal the portal when all gems are collected" natural.
  project.rules = [
    createRule({
      id: 'scene-reveal-portal',
      name: 'All gems collected → reveal the portal',
      event: { type: 'variable-changed', sourceEntityId: null, name: 'Gems', interval: null },
      conditions: [
        createRuleCondition('variable-greater-than', { property: 'gems', value: 2 }),
      ],
      actions: [
        createRuleAction('set-variable', { property: 'allGems', value: true }),
        createRuleAction('set-visible', {
          targetEntityId: 'portal',
          value: true,
        }),
        createRuleAction('emit-event', {
          targetEntityId: 'player',
          property: 'all-gems-found',
          value: true,
        }),
      ],
    }),
    createRule({
      id: 'scene-reset-door',
      name: 'On start → make sure the door is shut',
      event: { type: 'scene-start', sourceEntityId: null, name: null, interval: null },
      actions: [createRuleAction('emit-event', { targetEntityId: 'door-main', property: 'close' })],
    }),
    createRule({
      id: 'scene-gem-hint',
      name: 'Every 10s → nudge the player toward the gems',
      event: { type: 'interval', sourceEntityId: null, name: null, interval: 10 },
      conditions: [createRuleCondition('variable-greater-than', { property: 'gems', value: 0 })],
      actions: [
        createRuleAction('emit-event', { targetEntityId: 'player', property: 'hint', value: 'Keep going!' }),
      ],
    }),
  ];

  return project;
}

/**
 * Sandbox scene for experimenting with pointer interaction, chasing enemies and
 * variables. Useful for manual play-testing of new behaviours.
 */
export function createPlaygroundScene(): Project {
  const project = projectBase('scene-playground', 'Playground');

  project.variables = {
    clicks: createVariable('clicks', 'Clicks', 'number', 0),
    lastClicked: createVariable('lastClicked', 'Last clicked', 'string', ''),
  };

  const ground = createEntity({
    id: 'ground',
    name: 'Ground',
    geometry: 'plane',
    color: '#262b33',
    position: [0, -0.2, 0],
    scale: [24, 1, 24],
    collider: { size: [1, 0.4, 1] },
    tags: ['ground'],
  });

  const player = createEntity({
    id: 'player',
    name: 'Player',
    geometry: 'capsule',
    color: '#4c9aff',
    position: [0, 0.85, 6],
    collider: { size: [0.9, 1.7, 0.9] },
    tags: ['player'],
    behaviours: [
      createBehaviourInstance('character', { speed: 5, jumpSpeed: 5.4, turnToFaceMotion: true }),
    ],
  });

  const clickable = createEntity({
    id: 'clickable',
    name: 'Click me',
    geometry: 'box',
    color: '#e2703a',
    position: [-3.5, 0.6, 2],
    collider: { size: [1.6, 1.2, 1.6] },
    behaviours: [createBehaviourInstance('bob', { axis: 'y', amplitude: 0.15, frequency: 0.6 })],
    rules: [
      createRule({
        id: 'click-count',
        name: 'Clicked → count it',
        event: { type: 'pointer-click', sourceEntityId: null, name: null, interval: null },
        actions: [
          createRuleAction('change-variable', { property: 'clicks', value: 1 }),
          createRuleAction('set-variable', { property: 'lastClicked', value: 'Click me' }),
        ],
      }),
    ],
  });

  const lamp = createEntity({
    id: 'lamp',
    name: 'Lamp',
    geometry: 'sphere',
    color: '#f6e05e',
    position: [-3.5, 2.6, 2],
    scale: [0.8, 0.8, 0.8],
    visible: false,
    behaviours: [createBehaviourInstance('spin', { axis: 'y', speed: 120 })],
  });

  const pedestal = createEntity({
    id: 'pedestal',
    name: 'Pedestal',
    geometry: 'cylinder',
    color: '#4a5568',
    position: [3, 0.5, 0],
    collider: { size: [1.2, 1, 1.2] },
  });

  const orbiter = createEntity({
    id: 'orbiter',
    name: 'Orbiter',
    geometry: 'sphere',
    color: '#63b3ed',
    position: [5, 1.6, 0],
    scale: [0.6, 0.6, 0.6],
    behaviours: [
      createBehaviourInstance('orbit', {
        targetEntityId: 'pedestal',
        radius: 2,
        speed: 90,
        height: 1.1,
      }),
    ],
  });

  const chaser = createEntity({
    id: 'chaser',
    name: 'Chaser',
    geometry: 'cone',
    color: '#f56565',
    position: [0, 0.8, -6],
    collider: { size: [1, 1.6, 1] },
    behaviours: [
      createBehaviourInstance('follow', {
        targetEntityId: 'player',
        speed: 2.4,
        stopDistance: 2,
        faceTarget: true,
      }),
    ],
  });

  const patroller = createEntity({
    id: 'patroller',
    name: 'Patroller',
    geometry: 'box',
    color: '#9f7aea',
    position: [-5, 0.5, -3],
    scale: [0.8, 0.8, 0.8],
    behaviours: [createBehaviourInstance('patrol', { axis: 'z', distance: 6, speed: 2 })],
  });

  for (const entity of [ground, player, clickable, lamp, pedestal, orbiter, chaser, patroller]) {
    project.entities[entity.id] = entity;
  }

  project.rules = [
    createRule({
      id: 'playground-lamp',
      name: 'Three clicks → switch the lamp on',
      event: { type: 'variable-changed', sourceEntityId: null, name: 'Clicks', interval: null },
      conditions: [createRuleCondition('variable-greater-than', { property: 'clicks', value: 2 })],
      actions: [createRuleAction('set-visible', { targetEntityId: 'lamp', value: true })],
    }),
    createRule({
      id: 'playground-catch',
      name: 'Chaser reaches the player → reset the chaser',
      event: { type: 'interval', sourceEntityId: null, name: null, interval: 0.25 },
      conditions: [
        // Conditions can look at any object, which is how "the chaser caught the
        // player" is expressed without adding a bespoke behaviour.
        createRuleCondition('distance-less-than', {
          subjectEntityId: 'chaser',
          property: 'player',
          value: 2.2,
        }),
        createRuleCondition('entity-enabled', { subjectEntityId: 'chaser', value: true }),
      ],
      actions: [
        createRuleAction('reset-entity', { targetEntityId: 'chaser' }),
        createRuleAction('emit-event', { targetEntityId: 'player', property: 'caught', value: true }),
      ],
    }),
    createRule({
      id: 'playground-hud',
      name: 'On start → greet',
      event: { type: 'scene-start', sourceEntityId: null, name: null, interval: null },
      actions: [createRuleAction('set-variable', { property: 'lastClicked', value: 'Ready!' })],
    }),
  ];

  return project;
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: 'pressure-plate-door',
    name: 'Pressure Plate Door',
    description: 'Tutorial scene: step on the plate to open a door, collect gems to reveal the portal.',
    create: createPressurePlateDoorScene,
  },
  {
    id: 'playground',
    name: 'Playground',
    description: 'Sandbox for pointer clicks, chasing enemies, orbiting props and variables.',
    create: createPlaygroundScene,
  },
];

export function createSceneTemplate(id: string): Project {
  const template = SCENE_TEMPLATES.find((candidate) => candidate.id === id);
  return template ? template.create() : createPressurePlateDoorScene();
}
