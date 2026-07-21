import React, { useEffect, useRef, useState } from 'react';
import type { Theme } from './types';
import { ChevronDown } from './icons';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** Small 12px semibold field label (Inter). */
export const FieldLabel: React.FC<{ theme: Theme; children: React.ReactNode; className?: string }> = ({ theme, children, className }) => (
  <p className={cx('font-inter text-[12px] font-semibold leading-[15px]', theme === 'light' ? 'text-black' : 'text-white/90', className)}>
    {children}
  </p>
);

// ─── Reusable floating-menu surface (matches the Export/Import popup) ─────────
// Solid panel, not transparent — safe to overlay busy content like the preview.

/** Solid popover panel style. Reuse for any floating menu / dropdown / popover. */
export const menuSurface = (theme: Theme) => cx(
  'p-1.5 rounded-2xl border shadow-2xl',
  theme === 'light'
    ? 'bg-white border-slate-200 shadow-slate-300/50 text-slate-800'
    : 'bg-[#1c1c1e] border-white/10 shadow-black/80 text-white',
);

/** Single menu-row style. `active` = selected, `danger` = destructive (e.g. remove). */
export const menuItemClass = (theme: Theme, opts: { active?: boolean; danger?: boolean } = {}) => cx(
  'flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-[13px] font-semibold transition-colors',
  opts.danger
    ? (theme === 'light' ? 'text-red-600 hover:bg-red-50' : 'text-red-400 hover:bg-red-500/10')
    : opts.active
      ? (theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-white/10 text-white')
      : (theme === 'light' ? 'text-slate-700 hover:bg-slate-100' : 'text-white/80 hover:bg-white/10'),
);

/** An option can be a plain string or an object with an icon / custom label / danger flag. */
export type DropdownOption =
  | string
  | { value: string; label?: React.ReactNode; icon?: React.ReactNode; danger?: boolean };

interface DropdownProps {
  theme: Theme;
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
  mono?: boolean;                 // IBM Plex Mono value (ratios / numeric)
  placeholder?: string;
  widthClass?: string;            // trigger width, e.g. "max-w-[180px]"
  menuWidthClass?: string;        // panel width, defaults to min-w-[220px]
  align?: 'left' | 'right';
  renderOption?: (opt: string) => React.ReactNode;
  footer?: React.ReactNode;       // e.g. "Remove this font" action row
}

/**
 * Reusable select-style dropdown: pill trigger (60% → 100% on hover/open) that
 * opens the solid Export/Import-style menu surface. Options support icons.
 */
export const Dropdown: React.FC<DropdownProps> = ({
  theme, value, options, onChange, mono, placeholder, widthClass,
  menuWidthClass = 'min-w-[220px]', align = 'left', renderOption, footer,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className={cx('relative', widthClass)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cx(
          'flex items-center gap-2.5 w-full px-1 py-0.5 transition-opacity duration-150',
          // Default rests at 60%; hover or open (editing) lifts to 100%.
          open ? 'opacity-100' : 'opacity-60 hover:opacity-100',
        )}
      >
        <span className={cx(
          'flex-1 min-w-0 text-left overflow-hidden text-ellipsis whitespace-nowrap text-[18px] leading-[32px] tracking-[0.2px]',
          mono ? 'font-plex' : 'font-inter font-medium',
          value ? (theme === 'light' ? 'text-[#131e36]' : 'text-white') : (theme === 'light' ? 'text-slate-400' : 'text-white/40'),
        )}>
          {value || placeholder}
        </span>
        <span className={cx('shrink-0 flex items-center justify-center w-5 h-5', theme === 'light' ? 'text-slate-500' : 'text-white/60')}>
          <ChevronDown size={16} strokeWidth={2.2} />
        </span>
      </button>

      {open && (
        <div className={cx(
          'absolute z-50 mt-2 max-h-[304px] overflow-y-auto no-scrollbar flex flex-col gap-0.5',
          menuWidthClass,
          align === 'right' ? 'right-0' : 'left-0',
          menuSurface(theme),
        )}>
          {options.map(o => {
            const obj = typeof o === 'string' ? { value: o } as Exclude<DropdownOption, string> : o;
            return (
              <button
                key={obj.value}
                type="button"
                onClick={() => { onChange(obj.value); setOpen(false); }}
                className={menuItemClass(theme, { active: obj.value === value, danger: obj.danger })}
              >
                {obj.icon && <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-80">{obj.icon}</span>}
                <span className={cx('flex-1 min-w-0 truncate', mono && 'font-plex')}>
                  {renderOption ? renderOption(obj.value) : (obj.label ?? obj.value)}
                </span>
              </button>
            );
          })}
          {footer}
        </div>
      )}
    </div>
  );
};

/**
 * Rounding loop button (Figma "Rounding Number"). Renders ".000" in IBM Plex Mono;
 * the leading dot + first `round` zeros are "clear", the rest dimmed.
 * States cycle on click: 0 (off / exact) → 1 → 2 → 3 → 0. Clear zeros = decimals.
 */
export const RoundingButton: React.FC<{ theme: Theme; round: number; onChange: (r: number) => void }> = ({ theme, round, onChange }) => {
  const clear = theme === 'light' ? 'text-[#131e36]' : 'text-white';
  const dim = theme === 'light' ? 'text-slate-300' : 'text-white/25';
  return (
    <button
      type="button"
      onClick={() => onChange((round + 1) % 4)}
      title={round === 0 ? 'Round to whole number' : `Round to ${round} decimal${round > 1 ? 's' : ''}`}
      className="font-plex text-[18px] leading-[32px] tracking-[1px] select-none transition-opacity hover:opacity-80"
    >
      <span className={round >= 1 ? clear : dim}>.</span>
      {[0, 1, 2].map(i => (
        <span key={i} className={i < round ? clear : dim}>0</span>
      ))}
    </button>
  );
};

/** Circular counter buttons (Figma "Counter": + / −). */
export const Counter: React.FC<{ theme: Theme; onInc: () => void; onDec: () => void }> = ({ theme, onInc, onDec }) => {
  const btn = cx(
    'w-5 h-5 rounded-full flex items-center justify-center transition-colors opacity-70 hover:opacity-100',
    theme === 'light' ? 'text-black hover:bg-black/10' : 'text-white hover:bg-white/15',
  );
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} onClick={onDec} aria-label="decrease">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      <button type="button" className={btn} onClick={onInc} aria-label="increase">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
};

/**
 * Inline editable field for text OR numbers (numeric derived from `value` type).
 * Mirrors the Figma "Editable Tittle" states — but expressed via opacity per spec:
 *   Default  → opacity 60
 *   Hover    → opacity 100
 *   Editing  → opacity 100 + active bottom border (#131e36 / white)
 * While editing a number: ↑/↓ = ±step, Shift+↑/↓ = ±bigStep. Enter/blur commit, Esc cancels. (§14)
 * The Color scale card title uses the same click-to-edit / select-all pattern.
 */
export function EditableField<T extends string | number>({
  theme, value, onCommit, className, suffix, align = 'left',
  min, max, step = 1, bigStep = 10, placeholder,
}: {
  theme: Theme;
  value: T;
  onCommit: (v: T) => void;
  className?: string;        // text-style override (font/size); defaults to mono 18px
  suffix?: string;
  align?: 'left' | 'center';
  min?: number; max?: number; step?: number; bigStep?: number;
  placeholder?: string;
}) {
  const numeric = typeof value === 'number';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { setDraft(String(value)); inputRef.current?.select(); } }, [editing, value]);

  const clamp = (n: number) => {
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return n;
  };

  const commit = () => {
    if (numeric) {
      const n = parseFloat(draft);
      if (!isNaN(n)) onCommit(clamp(n) as T);
    } else {
      const t = draft.trim();
      if (t) onCommit(t as T);
    }
    setEditing(false);
  };

  // ↑/↓ nudge while editing a number (Shift = big step), Figma-style.
  const bump = (dir: 1 | -1, big: boolean) => {
    const cur = parseFloat(draft);
    const s = big ? bigStep : step;
    const base = isNaN(cur) ? (min ?? 0) : cur;
    setDraft(String(clamp(base + dir * s)));
  };

  const textCls = cx(
    // self-start + explicit align so the resting button (which would otherwise
    // stretch full-width and center its text) and the edit input share one origin.
    'leading-[32px] px-1 self-start',
    className ?? 'font-plex text-[18px]',
    align === 'center' ? 'text-center' : 'text-left',
    theme === 'light' ? 'text-black' : 'text-white',
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); }
          else if (numeric && e.key === 'ArrowUp') { e.preventDefault(); bump(1, e.shiftKey); }
          else if (numeric && e.key === 'ArrowDown') { e.preventDefault(); bump(-1, e.shiftKey); }
        }}
        inputMode={numeric ? 'decimal' : 'text'}
        className={cx(textCls, 'bg-transparent outline-none border-b border-solid min-w-0 tabular-nums', theme === 'light' ? 'border-[#131e36]' : 'border-white')}
        style={{ width: `${Math.max(numeric ? 2 : 4, draft.length + 0.5)}ch` }}
        autoFocus
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cx(textCls, 'tabular-nums whitespace-nowrap opacity-60 hover:opacity-100 transition-opacity duration-150')}
    >
      {value}{suffix}
    </button>
  );
}
