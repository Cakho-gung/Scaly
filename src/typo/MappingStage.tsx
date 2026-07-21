import React, { useEffect, useRef, useState } from 'react';
import type { Theme, TypoCategory } from './types';
import { DEFAULT_CATEGORIES, uid } from './logic';
import { cx, FieldLabel, FontPicker } from './ui';
import { Plus, Minus, X } from './icons';

// Size ladder for "sized" categories — prepend grows larger, append grows smaller (§10).
const SIZE_ORDER = ['XXXL', 'XXL', 'XL', 'L', 'M', 'S', 'XS', 'XXS', 'XXXS'];

// Font rank labels — max 4 slots
const FONT_RANK_LABELS = ['Primary', 'Secondary', 'Tertiary', 'Quaternary'];
const MAX_FONTS = 4;

interface MappingStageProps {
  theme: Theme;
  fonts: string[];               // available font families
  primaryFamily: string;         // inherited from Stage 1
  onPrimaryChange: (f: string) => void;
  cardCls: string;
  isMapped: (variantId: string) => boolean;   // orange (mapped) vs dark (unmapped)
}

export default function MappingStage({ theme, fonts, primaryFamily, onPrimaryChange, cardCls, isMapped }: MappingStageProps) {
  const [secondaries, setSecondaries] = useState<string[]>([]);
  const [categories, setCategories] = useState<TypoCategory[]>(() => DEFAULT_CATEGORIES);

  // ── Fonts ──────────────────────────────────────────────────────────────────
  const addSecondary = () => setSecondaries(s =>
    s.length < MAX_FONTS - 1 ? [...s, fonts.find(f => f !== primaryFamily) ?? primaryFamily] : s
  );
  const setSecondary = (i: number, f: string) => setSecondaries(s => s.map((v, j) => (j === i ? f : v)));
  const removeSecondary = (i: number) => setSecondaries(s => s.filter((_, j) => j !== i));

  // ── Variants (§10) ───────────────────────────────────────────────────────────
  const addVariant = (catId: string, side: 'prepend' | 'append') => setCategories(cs => cs.map(c => {
    if (c.id !== catId) return c;
    if (c.kind === 'numbered') return c.variants.length >= 12 ? c : { ...c, variants: [...c.variants, String(c.variants.length + 1)] };
    const first = SIZE_ORDER.indexOf(c.variants[0]);
    const last = SIZE_ORDER.indexOf(c.variants[c.variants.length - 1]);
    if (side === 'prepend' && first > 0) return { ...c, variants: [SIZE_ORDER[first - 1], ...c.variants] };
    if (side === 'append' && last < SIZE_ORDER.length - 1) return { ...c, variants: [...c.variants, SIZE_ORDER[last + 1]] };
    return c;
  }));
  const removeVariant = (catId: string, side: 'prepend' | 'append') => setCategories(cs => cs.map(c => {
    if (c.id !== catId || c.variants.length <= 1) return c;
    if (c.kind === 'numbered' || side === 'append') return { ...c, variants: c.variants.slice(0, -1) };
    return { ...c, variants: c.variants.slice(1) };
  }));

  // ── Categories ───────────────────────────────────────────────────────────────
  const deleteCategory = (id: string) => setCategories(cs => cs.filter(c => c.id !== id));
  const renameCategory = (id: string, name: string) => setCategories(cs => cs.map(c => (c.id === id ? { ...c, name } : c)));
  const addCategory = () => setCategories(cs => [...cs, { id: uid('c'), name: 'New', kind: 'sized', variants: ['L', 'M', 'S'] }]);

  const fontRows = [primaryFamily, ...secondaries];

  return (
    <div className={cx('p-4', cardCls)}>
      {/* ── Font Combine ── */}
      <div className="flex items-start bg-transparent gap-1">
        <div className="w-[166px] shrink-0 ">
          <FieldLabel theme={theme}>Font Combine</FieldLabel>
        </div>
        <div className="flex-1 min-w-0 flex items-start gap-3 flex-wrap">
          {fontRows.map((family, i) => (
            <div key={i} className="flex flex-col gap-1 flex-1 min-w-[150px] max-w-[200px]">
              <FieldLabel theme={theme} className="px-1">{FONT_RANK_LABELS[i]}</FieldLabel>
              <div className="flex items-center gap-1">
                <FontPicker
                  theme={theme}
                  value={family}
                  options={fonts}
                  onChange={f => (i === 0 ? onPrimaryChange(f) : setSecondary(i - 1, f))}
                  widthClass="flex-1 min-w-0"
                  menuWidthClass="w-[220px]"
                />
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => removeSecondary(i - 1)}
                    title="Remove font"
                    className={cx('shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors',
                      theme === 'light' ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-white/40 hover:text-red-400 hover:bg-red-500/10')}
                  >
                    <X size={13} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {fontRows.length < MAX_FONTS && (
            <button
              type="button"
              onClick={addSecondary}
              title="Add font"
              className={cx('shrink-0 self-end w-6 h-6 rounded-full border border-dashed flex items-center justify-center transition-colors mb-1',
                theme === 'light' ? 'border-slate-300 text-slate-400 bg-slate-400/10 hover:text-slate-600 hover:border-slate-400'
                  : 'border-white/20 text-white/40 bg-white/5 hover:text-white/70 hover:border-white/40')}
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* ── Font Style ── */}
      <div className="mt-6 flex flex-col gap-1">
        {categories.map(cat => (
          <CategoryRow
            key={cat.id}
            theme={theme}
            cat={cat}
            onRename={name => renameCategory(cat.id, name)}
            onDelete={() => deleteCategory(cat.id)}
            onAdd={side => addVariant(cat.id, side)}
            onRemove={side => removeVariant(cat.id, side)}
            isMapped={isMapped}
          />
        ))}
        <button
          type="button"
          onClick={addCategory}
          className={cx('self-start mt-1 flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium font-inter transition-colors',
            theme === 'light' ? 'text-slate-500 hover:bg-slate-100' : 'text-white/50 hover:bg-white/10')}
        >
          <Plus size={14} strokeWidth={2.5} /> Add
        </button>
      </div>
    </div>
  );
}

// ── Category row ────────────────────────────────────────────────────────────

/**
 * Category chip: outlined by default, turns black + reveals the × delete badge on
 * hover. Double-click enters rename mode; committing updates the tokens beside it
 * (the variant tags derive from the category name).
 */
const CategoryChip: React.FC<{ theme: Theme; name: string; onRename: (n: string) => void; onDelete: () => void }> = ({ theme, name, onRename, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { setDraft(name); const t = setTimeout(() => inputRef.current?.select(), 0); return () => clearTimeout(t); }
  }, [editing, name]);

  const commit = () => { const t = draft.trim(); if (t) onRename(t); setEditing(false); };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setEditing(false);
        }}
        className={cx('px-3 py-1.5 rounded-full text-[12px] font-medium font-inter leading-[14px] w-[104px] outline-none border',
          theme === 'light' ? 'bg-black text-white border-black' : 'bg-white text-black border-white')}
        autoFocus
      />
    );
  }

  return (
    <div className="relative inline-flex group/chip">
      <button
        type="button"
        onDoubleClick={() => setEditing(true)}
        title="Double-click to rename"
        className={cx('flex items-center justify-center px-3 py-1.5 rounded-full text-[12px] font-medium font-inter leading-[14px] max-w-[110px] border transition-colors',
          theme === 'light'
            ? 'border-slate-400/50 text-slate-500 group-hover/chip:bg-black group-hover/chip:text-white group-hover/chip:border-black'
            : 'border-white/20 text-white/60 group-hover/chip:bg-white group-hover/chip:text-black group-hover/chip:border-white')}
      >
        <span className="truncate">{name}</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete category"
        className={cx('absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-[0px_1px_2px_rgba(0,0,0,0.15)] opacity-0 group-hover/chip:opacity-100 transition-opacity',
          theme === 'light' ? 'bg-white text-slate-600 hover:text-red-500' : 'bg-[#2a2a2a] text-white/70 hover:text-red-400')}
      >
        <X size={10} strokeWidth={2.5} />
      </button>
    </div>
  );
};

interface CategoryRowProps {
  theme: Theme;
  cat: TypoCategory;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAdd: (side: 'prepend' | 'append') => void;
  onRemove: (side: 'prepend' | 'append') => void;
  isMapped: (variantId: string) => boolean;
}

const CategoryRow: React.FC<CategoryRowProps> = ({ theme, cat, onRename, onDelete, onAdd, onRemove, isMapped }) => (
  <div className="flex gap-1 items-center w-full py-1 group/row">
    {/* Category chip */}
    <div className="w-[120px] shrink-0">
      <CategoryChip theme={theme} name={cat.name} onRename={onRename} onDelete={onDelete} />
    </div>

    {/* Steppers + variant tags */}
    <div className="flex-1 min-w-0 flex gap-2 items-center">
      {/* prepend — hidden for numbered (can't add before) */}
      <VariantStepper theme={theme} hidden={cat.kind === 'numbered'} onAdd={() => onAdd('prepend')} onRemove={() => onRemove('prepend')} />
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        {cat.variants.map((v, i) => {
          const label = `${cat.name}-${v}`;
          const mapped = isMapped(label);
          return (
            <span
              key={`${v}-${i}`}
              title={label}
              className={cx('font-plex font-bold text-[11px] tracking-[0.2px] leading-[12px] w-[84px] shrink-0 flex items-center overflow-hidden',
                mapped ? 'text-[#ff7818]' : (theme === 'light' ? 'text-[#131e36]' : 'text-white/85'))}
            >
              {/* Category name — truncates when too long */}
              <span className="truncate min-w-0 opacity-50 hover:opacity-100">{cat.name}</span>
              {/* Size suffix — always visible */}
              <span className="shrink-0">-{v}</span>
            </span>
          );
        })}
      </div>
      {/* append */}
      <VariantStepper theme={theme} onAdd={() => onAdd('append')} onRemove={() => onRemove('append')} />
    </div>
  </div>
);

// ── −/+ stepper pair ──────────────────────────────────────────────────────────

const VariantStepper: React.FC<{ theme: Theme; hidden?: boolean; onAdd: () => void; onRemove: () => void }> = ({ theme, hidden, onAdd, onRemove }) => {
  const btn = cx('w-5 h-5 rounded-full flex items-center justify-center transition-colors',
    theme === 'light' ? 'text-slate-500 hover:bg-black/5' : 'text-white/60 hover:bg-white/10');
  return (
    // `hidden` (numbered prepend) stays invisible; otherwise reveal on row hover.
    <div className={cx('flex items-center gap-1 shrink-0 transition-opacity duration-150',
      hidden ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover/row:opacity-100')}>
      <button type="button" className={btn} onClick={onRemove} aria-label="remove variant"><Minus size={14} strokeWidth={2.5} /></button>
      <button type="button" className={btn} onClick={onAdd} aria-label="add variant"><Plus size={14} strokeWidth={2.5} /></button>
    </div>
  );
};
