/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Small form primitives shared by the inspector panels.
 *
 * They exist so every panel presents the same rhythm and focus states, and so
 * value coercion (numbers, booleans, empty strings) is handled in one place.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</div>
        {hint ? <p className="mt-0.5 text-[10px] leading-3 text-zinc-600">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] text-zinc-500">{label}</span>
      {children}
      {hint ? <span className="block text-[10px] leading-3 text-zinc-600">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500';

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className={inputClass}
      />
    </Field>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-[11px] text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        {hint ? <span className="block text-[10px] leading-3 text-zinc-600">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className={cn(inputClass, disabled && 'opacity-60')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function IconButton({
  title,
  onClick,
  children,
  tone = 'default',
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  tone?: 'default' | 'danger' | 'accent';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded p-1 transition-colors disabled:cursor-not-allowed disabled:text-zinc-700',
        tone === 'danger' && 'text-zinc-500 hover:bg-red-950/60 hover:text-red-300',
        tone === 'accent' && 'text-zinc-400 hover:bg-zinc-800 hover:text-white',
        tone === 'default' && 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200',
      )}
    >
      {children}
    </button>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-zinc-800 px-3 py-3 text-center text-[11px] leading-4 text-zinc-600">
      {children}
    </div>
  );
}
