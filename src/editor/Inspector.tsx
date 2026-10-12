/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Inspector: everything about the selected object — name, transform, appearance,
 * collision, behaviours and rules. With nothing selected it shows the scene.
 */

import { Box, Circle, Cone, Cylinder, Eye, EyeOff, Square, Trash2 } from 'lucide-react';
import type { ColliderComponent, GeometryKind, RenderComponent } from '../simulation/schema';
import BehaviourPanel from './BehaviourPanel';
import RulesPanel from './RulesPanel';
import ScenePanel from './ScenePanel';
import { useEditorStore } from './store';
import { CheckField, IconButton, NumberField, SectionTitle, inputClass } from './fields';
import { cn } from '../lib/utils';

const GEOMETRY_OPTIONS: { value: GeometryKind; label: string; icon: typeof Box }[] = [
  { value: 'box', label: 'Box', icon: Box },
  { value: 'sphere', label: 'Sphere', icon: Circle },
  { value: 'cylinder', label: 'Cylinder', icon: Cylinder },
  { value: 'cone', label: 'Cone', icon: Cone },
  { value: 'plane', label: 'Flat plane', icon: Square },
  { value: 'capsule', label: 'Capsule', icon: Box },
];

export default function Inspector() {
  const project = useEditorStore((state) => state.project);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const updateEntityTransform = useEditorStore((state) => state.updateEntityTransform);
  const updateEntityName = useEditorStore((state) => state.updateEntityName);
  const updateEntityComponent = useEditorStore((state) => state.updateEntityComponent);
  const removeEntityComponent = useEditorStore((state) => state.removeEntityComponent);
  const setEntityEnabled = useEditorStore((state) => state.setEntityEnabled);
  const selectEntity = useEditorStore((state) => state.selectEntity);

  const entity = selectedEntityId ? project.entities[selectedEntityId] : null;

  const handleTransformChange = (
    property: 'position' | 'rotation' | 'scale',
    axis: 0 | 1 | 2,
    value: string,
  ) => {
    if (!entity) return;
    const numberValue = Number.parseFloat(value);
    if (!Number.isFinite(numberValue)) return;

    const vector = [...entity.transform[property]] as [number, number, number];
    vector[axis] = numberValue;
    updateEntityTransform(entity.id, { ...entity.transform, [property]: vector });
  };

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900 text-zinc-300">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider">Inspector</span>
        {entity ? (
          <span className="flex items-center gap-1">
            <IconButton
              title={entity.enabled === false ? 'Switch on' : 'Switch off'}
              onClick={() => setEntityEnabled(entity.id, entity.enabled === false)}
            >
              {entity.enabled === false ? <EyeOff size={14} /> : <Eye size={14} />}
            </IconButton>
            <IconButton title="Deselect" onClick={() => selectEntity(null)}>
              <Trash2 size={14} />
            </IconButton>
          </span>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {!entity ? (
          <ScenePanel />
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-500">Name</label>
              <input
                type="text"
                value={entity.name}
                onChange={(event) => updateEntityName(entity.id, event.target.value)}
                className={cn(inputClass, 'text-sm')}
              />
            </div>

            <section className="space-y-3">
              <SectionTitle title="Transform" hint="Position is in metres, rotation in radians." />
              {(['position', 'rotation', 'scale'] as const).map((property) => (
                <div key={property} className="space-y-1">
                  <label className="text-[11px] capitalize text-zinc-500">{property}</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['X', 'Y', 'Z'] as const).map((axisLabel, index) => (
                      <div
                        key={axisLabel}
                        className="flex items-center overflow-hidden rounded border border-zinc-800 bg-zinc-950 px-1.5"
                      >
                        <span className="mr-1 font-mono text-[10px] text-zinc-500">{axisLabel}</span>
                        <input
                          type="number"
                          step={property === 'rotation' ? 0.1 : 0.1}
                          value={Number(entity.transform[property][index].toFixed(3))}
                          onChange={(event) =>
                            handleTransformChange(property, index as 0 | 1 | 2, event.target.value)
                          }
                          className="w-full bg-transparent py-1 text-xs outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <div className="h-px bg-zinc-800" />

            <section className="space-y-3">
              <SectionTitle title="Appearance" hint="What the object looks like." />
              {entity.components.render ? (
                <RenderEditor
                  render={entity.components.render}
                  onChange={(render) => updateEntityComponent(entity.id, render)}
                  onRemove={() => removeEntityComponent(entity.id, 'render')}
                />
              ) : (
                <button
                  onClick={() =>
                    updateEntityComponent(entity.id, {
                      type: 'render',
                      geometry: 'box',
                      color: '#888888',
                    })
                  }
                  className="w-full rounded border border-dashed border-zinc-700 px-3 py-2 text-[11px] text-zinc-500 hover:border-blue-500/60 hover:text-zinc-300"
                >
                  + Add appearance
                </button>
              )}
            </section>

            <div className="h-px bg-zinc-800" />

            <section className="space-y-3">
              <SectionTitle
                title="Collision"
                hint="Objects block movement. Triggers only report overlaps — that is how plates and pickups work."
              />
              {entity.components.collider ? (
                <ColliderEditor
                  collider={entity.components.collider}
                  scale={entity.transform.scale}
                  onChange={(collider) => updateEntityComponent(entity.id, collider)}
                  onRemove={() => removeEntityComponent(entity.id, 'collider')}
                />
              ) : (
                <button
                  onClick={() =>
                    updateEntityComponent(entity.id, { type: 'collider', shape: 'box', size: [1, 1, 1] })
                  }
                  className="w-full rounded border border-dashed border-zinc-700 px-3 py-2 text-[11px] text-zinc-500 hover:border-blue-500/60 hover:text-zinc-300"
                >
                  + Make it solid
                </button>
              )}
            </section>

            <div className="h-px bg-zinc-800" />

            <BehaviourPanel entityId={entity.id} />

            <div className="h-px bg-zinc-800" />

            <RulesPanel entityId={entity.id} title="Rules for this object" />
          </>
        )}
      </div>
    </div>
  );
}

function RenderEditor({
  render,
  onChange,
  onRemove,
}: {
  render: RenderComponent;
  onChange: (render: RenderComponent) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {GEOMETRY_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              title={option.label}
              onClick={() => onChange({ ...render, geometry: option.value })}
              className={cn(
                'flex items-center justify-center rounded border px-2 py-2',
                render.geometry === option.value
                  ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300',
              )}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="block text-[11px] text-zinc-500">Colour</span>
          <input
            type="color"
            value={render.color}
            onChange={(event) => onChange({ ...render, color: event.target.value })}
            className="h-8 w-full rounded border border-zinc-800 bg-zinc-950"
          />
        </label>
        <NumberField
          label="Opacity"
          value={render.opacity ?? 1}
          step={0.05}
          min={0}
          max={1}
          onChange={(value) => onChange({ ...render, opacity: value })}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex flex-1 items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-[11px]">
          <input
            type="checkbox"
            checked={render.visible ?? true}
            onChange={(event) => onChange({ ...render, visible: event.target.checked })}
          />
          Visible when the game starts
        </label>
        <IconButton title="Remove appearance" tone="danger" onClick={onRemove}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  );
}

function ColliderEditor({
  collider,
  scale,
  onChange,
  onRemove,
}: {
  collider: ColliderComponent;
  scale: [number, number, number];
  onChange: (collider: ColliderComponent) => void;
  onRemove: () => void;
}) {
  const size: [number, number, number] = [
    collider.size[0] * Math.abs(scale[0]),
    collider.size[1] * Math.abs(scale[1]),
    collider.size[2] * Math.abs(scale[2]),
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="block text-[11px] text-zinc-500">Shape</span>
          <select
            value={collider.shape}
            onChange={(event) =>
              onChange({ ...collider, shape: event.target.value as 'box' | 'sphere' })
            }
            className={inputClass}
          >
            <option value="box">Box</option>
            <option value="sphere">Sphere</option>
          </select>
        </label>
        <CheckField
          label="Trigger only"
          hint="Never blocks movement"
          checked={collider.isTrigger ?? false}
          onChange={(checked) => onChange({ ...collider, isTrigger: checked })}
        />
      </div>

      <div className="space-y-1">
        <span className="text-[11px] text-zinc-500">Size (before object scale)</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axisLabel, index) => (
            <div
              key={axisLabel}
              className="flex items-center overflow-hidden rounded border border-zinc-800 bg-zinc-950 px-1.5"
            >
              <span className="mr-1 font-mono text-[10px] text-zinc-500">{axisLabel}</span>
              <input
                type="number"
                step={0.1}
                min={0.01}
                value={collider.size[index]}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  const nextSize = [...collider.size] as [number, number, number];
                  nextSize[index] = Math.max(0.01, next);
                  onChange({ ...collider, size: nextSize });
                }}
                className="w-full bg-transparent py-1 text-xs outline-none"
              />
            </div>
          ))}
        </div>
        <span className="block text-[10px] text-zinc-600">
          Covers {size.map((value) => value.toFixed(2)).join(' × ')} m in the scene
        </span>
      </div>

      <div className="space-y-1">
        <span className="text-[11px] text-zinc-500">Offset</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axisLabel, index) => (
            <div
              key={axisLabel}
              className="flex items-center overflow-hidden rounded border border-zinc-800 bg-zinc-950 px-1.5"
            >
              <span className="mr-1 font-mono text-[10px] text-zinc-500">{axisLabel}</span>
              <input
                type="number"
                step={0.1}
                value={collider.offset?.[index] ?? 0}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  const offset = [...(collider.offset ?? [0, 0, 0])] as [number, number, number];
                  offset[index] = next;
                  onChange({ ...collider, offset });
                }}
                className="w-full bg-transparent py-1 text-xs outline-none"
              />
            </div>
          ))}
        </div>
        <span className="block text-[10px] text-zinc-600">
          Raise a trigger above the floor so the ground does not count as standing on it.
        </span>
      </div>

      <div className="flex justify-end">
        <IconButton title="Remove collision" tone="danger" onClick={onRemove}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  );
}
