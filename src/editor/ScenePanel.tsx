/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Scene settings and scene-wide rules, shown when nothing is selected.
 */

import { useEditorStore } from './store';
import { resolveSettings } from '../simulation/schema';
import RulesPanel from './RulesPanel';
import VariablesPanel from './VariablesPanel';
import { CheckField, NumberField, SectionTitle } from './fields';

export default function ScenePanel() {
  const project = useEditorStore((state) => state.project);
  const updateSettings = useEditorStore((state) => state.updateSettings);
  const settings = resolveSettings(project);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionTitle
          title="Scene settings"
          hint="How the game runs when you press Play. These values are saved with the project."
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Physics steps / second"
            value={settings.stepRate}
            step={10}
            min={10}
            max={240}
            hint="Fixed simulation rate"
            onChange={(value) => updateSettings({ stepRate: value })}
          />
          <NumberField
            label="Gravity"
            value={settings.gravity}
            step={0.5}
            hint="Negative pulls down"
            onChange={(value) => updateSettings({ gravity: value })}
          />
        </div>
        <CheckField
          label="Camera follows the player"
          hint="Uses the object with a Player character behaviour."
          checked={settings.cameraFollow}
          onChange={(checked) => updateSettings({ cameraFollow: checked })}
        />
      </section>

      <div className="h-px bg-zinc-800" />

      <VariablesPanel />

      <div className="h-px bg-zinc-800" />

      <RulesPanel entityId={null} title="Scene rules" hint="Rules that belong to the whole scene rather than one object." />

      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-[11px] leading-4 text-zinc-500">
        <div className="font-semibold uppercase tracking-wider text-zinc-500">Playing</div>
        <div className="mt-1">
          Move with <span className="font-mono text-zinc-300">WASD</span> or the arrow keys, jump with{' '}
          <span className="font-mono text-zinc-300">Space</span>. Clicking an object sends a click to the
          game, so <em>When an object is clicked</em> rules fire during play.
        </div>
      </div>
    </div>
  );
}
