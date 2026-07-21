import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
          'absolute z-50 mt-2 max-h-[304px] overflow-y-auto overscroll-contain figma-scrollbar flex flex-col gap-0.5',
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
 * Searchable font combobox: the trigger doubles as a text input — click to type
 * and filter, ↑/↓ to move, Enter to pick, Esc to close. Normal font-select UX.
 * Reuses the solid menu surface. Options are font-family names.
 */
export const FontPicker: React.FC<{
  theme: Theme;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  widthClass?: string;
  menuWidthClass?: string;
}> = ({ theme, value, options, onChange, widthClass, menuWidthClass = 'w-[240px]' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Calculate fixed position from trigger bounding rect.
  // Auto-flip: if menu would overflow the right edge of the viewport, align
  // its right edge to the trigger's right edge instead.
  const updatePos = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    // Parse pixel width from class like "w-[240px]" → 240
    const match = menuWidthClass.match(/w-\[(\d+)px\]/);
    const menuW = match ? parseInt(match[1], 10) : 240;
    const viewportW = window.innerWidth;
    const wouldOverflow = r.left + menuW > viewportW - 8;
    const left = wouldOverflow ? Math.max(8, r.right - menuW) : r.left;
    setMenuPos({ top: r.bottom + 8, left });
  }, [menuWidthClass]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = Math.max(0, options.indexOf(value));
    setHi(idx);
    updatePos();
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, options, value, updatePos]);

  // Close on outside click; also update position on scroll/resize
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    const onScroll = () => { updatePos(); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePos]);

  // keep the highlighted row scrolled into view
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const pick = (v: string) => { onChange(v); setOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(filtered.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  const valueTextCls = cx(
    'flex-1 min-w-0 text-left overflow-hidden text-ellipsis whitespace-nowrap font-inter font-medium text-[18px] leading-[32px] tracking-[0.2px]',
    theme === 'light' ? 'text-[#131e36]' : 'text-white',
  );
  const chevron = (
    <span className={cx('shrink-0 w-5 h-5 flex items-center justify-center', theme === 'light' ? 'text-slate-500' : 'text-white/60')}>
      <ChevronDown size={16} strokeWidth={2.2} />
    </span>
  );

  return (
    <div ref={ref} className={cx('relative', widthClass)}>
      {open ? (
        <div className="flex items-center gap-2.5 px-1">
          <input
            ref={inputRef}
            value={query}
            placeholder={value}
            onChange={e => { setQuery(e.target.value); setHi(0); }}
            onKeyDown={onKey}
            className={cx('flex-1 min-w-0 bg-transparent outline-none font-inter font-medium text-[18px] leading-[32px] tracking-[0.2px]',
              theme === 'light' ? 'text-[#131e36] placeholder:text-slate-400' : 'text-white placeholder:text-white/40')}
          />
          {chevron}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2.5 w-full px-1 opacity-60 hover:opacity-100 transition-opacity duration-150"
        >
          <span className={valueTextCls}>{value}</span>
          {chevron}
        </button>
      )}

      {open && createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className={cx('max-h-[304px] overflow-y-auto overscroll-contain figma-scrollbar flex flex-col gap-0.5', menuWidthClass, menuSurface(theme))}
        >
          {filtered.length === 0 ? (
            <div className={cx('px-3 py-2 text-[13px] font-semibold', theme === 'light' ? 'text-slate-400' : 'text-white/40')}>No font found</div>
          ) : filtered.map((o, i) => (
            <button
              key={o}
              type="button"
              data-idx={i}
              onMouseEnter={() => setHi(i)}
              onMouseDown={e => { e.preventDefault(); pick(o); }}
              className={menuItemClass(theme, { active: i === hi })}
            >
              <span className="flex-1 min-w-0 truncate">{o}</span>
              {o === value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-70"><path d="M20 6 9 17l-5-5" /></svg>
              )}
            </button>
          ))}
        </div>,
        document.body,
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
