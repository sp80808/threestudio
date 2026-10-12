/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Play-mode overlay: control hints, live variables, simulation statistics and
 * runtime diagnostics.
 *
 * Everything shown here comes from the runtime, never from the document, so the
 * HUD proves at a glance that play mode is running on isolated state.
 */

import { AlertTriangle, Circle, Download, Info, Pause, Play, SkipForward, Square } from 'lucide-react';
import { usePlayStore } from '../editor/playStore';
import { useEditorStore } from '../editor/store';
import { cn } from '../lib/utils';

export default function PlayHud() {
  const status = usePlayStore((state) => state.status);
  const stats = usePlayStore((state) => state.stats);
  const variables = usePlayStore((state) => state.variables);
  const diagnostics = usePlayStore((state) => state.diagnostics);
  const requestPause = usePlayStore((state) => state.requestPause);
  const requestStep = usePlayStore((state) => state.requestStep);
  const requestStop = usePlayStore((state) => state.requestStop);
  const recording = usePlayStore((state) => state.recording);
  const recordedFrames = usePlayStore((state) => state.recordedFrames);
  const requestRecord = usePlayStore((state) => state.requestRecord);
  const requestStopRecording = usePlayStore((state) => state.requestStopRecording);
  const requestDownloadRecording = usePlayStore((state) => state.requestDownloadRecording);

  const project = useEditorStore((state) => state.project);
  const stepRate = project.settings?.stepRate ?? 60;

  if (status === 'stopped') {
    return (
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-[11px] leading-4 text-zinc-500 backdrop-blur">
        <div className="font-medium text-zinc-400">Edit mode</div>
        <div>WASD to move · F focus · W/E/R gizmo · Del delete · Ctrl+Z undo</div>
        <div>Press Play to run the game (Space also starts it).</div>
      </div>
    );
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.level !== 'info');

  return (
    <>
      <div className="pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/85 p-1 text-xs text-zinc-300 shadow-lg backdrop-blur">
        <span
          className={cn(
            'flex items-center gap-1.5 rounded px-2 py-1 font-medium',
            status === 'playing' ? 'text-emerald-400' : 'text-amber-400',
          )}
        >
          <Play size={12} fill="currentColor" /> {status === 'playing' ? 'Playing' : 'Paused'}
        </span>
        <button
          onClick={requestPause}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-zinc-800"
          title={status === 'playing' ? 'Pause (P)' : 'Resume (P)'}
        >
          <Pause size={12} /> {status === 'playing' ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={requestStep}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-zinc-800"
          title="Advance one fixed step (.)"
        >
          <SkipForward size={12} /> Step
        </button>
        <button
          onClick={requestStop}
          className="flex items-center gap-1 rounded px-2 py-1 text-red-300 hover:bg-red-950/60"
          title="Stop and restore the authored scene (Esc)"
        >
          <Square size={12} /> Stop
        </button>
        {recording ? (
          <button
            onClick={requestStopRecording}
            className="flex items-center gap-1 rounded bg-red-950/60 px-2 py-1 text-red-300 hover:bg-red-900/60"
            title="Stop capturing input (the game keeps running)"
          >
            <Circle size={12} fill="currentColor" /> {recordedFrames}
          </button>
        ) : (
          <button
            onClick={requestRecord}
            className="flex items-center gap-1 rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800"
            title="Record this session's input so it can be replayed later"
          >
            <Circle size={12} className="text-red-400" /> Record
          </button>
        )}
        {recordedFrames > 0 && !recording ? (
          <button
            onClick={requestDownloadRecording}
            className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800"
            title="Download the recorded session as JSON — replay it with `npm run playtest -- --replay <file>`"
          >
            <Download size={12} /> {recordedFrames}
          </button>
        ) : null}
        <span className="ml-1 border-l border-zinc-800 pl-2 font-mono text-[10px] text-zinc-500">
          {stepRate} Hz · t {stats?.time.toFixed(2) ?? '0.00'}s · {stats?.steps ?? 0} steps
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 w-64 space-y-2">
        <div className="rounded-md border border-zinc-800 bg-zinc-950/85 px-3 py-2 backdrop-blur">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Variables
          </div>
          {variables.length === 0 ? (
            <div className="text-[11px] italic text-zinc-600">This scene has no variables yet.</div>
          ) : (
            <ul className="space-y-0.5">
              {variables.map((variable) => (
                <li key={variable.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="truncate text-zinc-400">{variable.name}</span>
                  <span className="font-mono text-zinc-200">{String(variable.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-950/85 px-3 py-2 text-[10px] text-zinc-500 backdrop-blur">
          <div className="font-semibold uppercase tracking-wider">Runtime</div>
          <div className="mt-0.5 font-mono">
            {stats?.behaviourUpdates ?? 0} behaviour updates · {stats?.eventsProcessed ?? 0} events ·{' '}
            {stats?.ruleFirings ?? 0} rule firings
          </div>
          {/* The scene's collision work: the broad phase keeps this far below
              the number of possible pairs (see src/runtime/broadphase.ts). */}
          <div className="mt-0.5 font-mono">
            {stats?.overlapTests ?? 0} collision pair tests · {stats?.entityCount ?? 0} objects
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="pointer-events-none absolute bottom-4 right-4 max-h-64 w-80 space-y-1 overflow-hidden">
          {errors.slice(0, 5).map((diagnostic, index) => (
            <div
              key={`${diagnostic.code}-${index}`}
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] backdrop-blur',
                diagnostic.level === 'error'
                  ? 'border-red-900/60 bg-red-950/60 text-red-200'
                  : 'border-amber-900/60 bg-amber-950/50 text-amber-200',
              )}
            >
              {diagnostic.level === 'error' ? (
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              ) : (
                <Info size={12} className="mt-0.5 shrink-0" />
              )}
              <div>
                <div className="font-mono text-[10px] opacity-70">{diagnostic.code}</div>
                <div>{diagnostic.message}</div>
                {diagnostic.occurrences && diagnostic.occurrences > 1 ? (
                  <div className="opacity-70">×{diagnostic.occurrences}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
