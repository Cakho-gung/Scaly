import React, { useEffect, useRef, useState } from 'react';
import type { Theme, TypoMode, TypoRung, TypoToken, TokenWeight, ModeConfig } from './types';
import {
  MODE_ORDER, PREVIEW_TEXT, MOCK_WEIGHTS, weightAbbr, fmtVariant, rungSize, fmtSize,
} from './logic';
import { cx, menuSurface, menuItemClass } from './ui';
import { Monitor, Tablet, Smartphone, Plus, X } from './icons';

// A font a token can point at, resolved to a real family for preview (§5.1).
export interface FontRole { key: string; label: string; family: string }
// Unassigned variants grouped by category, for the "Add style" popover (§5.3).
export interface VariantGroup { cat: string; variants: { id: string; label: string }[] }

const MODE_ICON: Record<TypoMode, typeof Monitor> = {
  desktop: Monitor, tablet: Tablet, mobile: Smartphone,
};

// ── Theme colour tokens (mapped from the Figma variables) ─────────────────────
const c = {
  text0: (t: Theme) => (t === 'light' ? 'text-black' : 'text-white'),          // preview
  text1: (t: Theme) => (t === 'light' ? 'text-[#131e36]' : 'text-white'),      // active
  text2: (t: Theme) => (t === 'light' ? 'text-[#6b7280]' : 'text-white/60'),   // label
  text4: (t: Theme) => (t === 'light' ? 'text-[#94a3b8]' : 'text-white/40'),   // dimmed
};
const PIN = '#ff7818'; // orange accent for pinned / mapped state

// ── Small inline numeric editable (blur/Enter commit, Esc cancel, ↑/↓ nudge) ──
// Kept local to match the tight 14px card styling; §14 draft-then-commit rules.
const MiniEdit: React.FC<{
  value: number; onCommit: (v: number) => void; textCls: string;
  suffix?: string; min?: number; max?: number; step?: number; bigStep?: number;
}> = ({ value, onCommit, textCls, suffix, min, max, step = 1, bigStep = 10 }) => {
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
    const n = parseFloat(draft);
    if (!isNaN(n)) onCommit(clamp(n));   // invalid/empty is ignored (§14)
    setEditing(false);
  };
  const bump = (dir: 1 | -1, big: boolean) => {
    const cur = parseFloat(draft);
    setDraft(String(clamp((isNaN(cur) ? (min ?? 0) : cur) + dir * (big ? bigStep : step))));
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); bump(1, e.shiftKey); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1, e.shiftKey); }
        }}
        inputMode="decimal"
        className={cx(textCls, 'bg-transparent outline-none tabular-nums text-center')}
        style={{ width: `${Math.max(2, draft.length + 0.5)}ch` }}
        autoFocus
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className={cx(textCls, 'tabular-nums whitespace-nowrap opacity-80 hover:opacity-100 transition-opacity px-1')}>
      {fmtSize(value)}{suffix}
    </button>
  );
};

export interface TypeScaleCardsProps {
  theme: Theme;
  rungs: TypoRung[];              // already sorted (desktop desc) & filtered by caller
  mode: TypoMode;
  cfg: ModeConfig;
  round: number;
  roles: FontRole[];
  collapsed: boolean;
  availableGroups: () => VariantGroup[];   // unassigned variants, computed lazily
  onEditSize: (rungId: string, mode: TypoMode, px: number) => void;
  onResetPin: (rungId: string, mode: TypoMode) => void;
  onAddToken: (rungId: string, variantId: string) => void;
  onRemoveToken: (rungId: string, tokenId: string) => void;
  onSetTokenFont: (rungId: string, tokenId: string, roleKey: string) => void;
  onSetTokenLH: (rungId: string, tokenId: string, pct: number) => void;
  onSetTokenTracking: (rungId: string, tokenId: string, val: number) => void;
  onSetTokenWeights: (rungId: string, tokenId: string, weights: TokenWeight[]) => void;
  onInsert: (aboveId: string, belowId: string) => void;
  onDeleteRung: (rungId: string) => void;
}

export default function TypeScaleCards(props: TypeScaleCardsProps) {
  const { theme, rungs, collapsed, onInsert } = props;

  if (rungs.length === 0) {
    return (
      <div className={cx('mt-6 py-10 text-center font-inter text-[13px]', c.text4(theme))}>
        No steps to show.
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col">
      {rungs.map((rung, i) => (
        <React.Fragment key={rung.id}>
          {collapsed
            ? <CompactRow {...props} rung={rung} />
            // "First Above" (Figma): earlier cards get a higher z-index so a card's
            // overflowing popover always paints above the cards below it.
            : <TypoStepCard {...props} rung={rung} z={rungs.length - i} />}
          {/* Insert step: thin strip between two cards (§9) */}
          {i < rungs.length - 1 && (
            <InsertStrip theme={theme} onClick={() => onInsert(rung.id, rungs[i + 1].id)} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Single card ───────────────────────────────────────────────────────────────

interface CardProps extends TypeScaleCardsProps { rung: TypoRung; z?: number }

const TypoStepCard: React.FC<CardProps> = (p) => {
  const { theme, rung, mode, cfg, round, roles, z } = p;
  const size = rungSize(rung, mode, cfg, round);

  // Distinct fonts used by this card's tokens → what the corner picker offers (§5.3).
  const cardFamilies = [...new Set(
    rung.tokens.map(t => roles.find(r => r.key === t.fontRole)?.family).filter((f): f is string => !!f),
  )];
  // Which font previews this card. Defaults to the first token's font; user can
  // switch when the card mixes fonts. Falls back if the chosen font goes away.
  const [previewFamily, setPreviewFamily] = useState<string>();
  const activeFamily = previewFamily && cardFamilies.includes(previewFamily)
    ? previewFamily
    : (cardFamilies[0] ?? roles[0]?.family);

  const card = theme === 'light'
    ? 'bg-white/40 border-white shadow-[0px_8px_30px_0px_rgba(0,0,0,0.04)]'
    : 'bg-white/[0.03] border-white/10 shadow-2xl';

  return (
    <div className={cx('relative rounded-[32px] border border-solid px-[21px] py-[17px] backdrop-blur-[20px] flex flex-col items-start w-full', card)} style={{ zIndex: z }}>
      {/* Header — mode trio + first-token font */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-4">
          {MODE_ORDER.map(m => (
            <ModeSizeCell
              key={m}
              theme={theme}
              mode={m}
              active={m === mode}
              value={rungSize(rung, m, cfg, round)}
              pinned={rung.fixed[m] != null}
              onCommit={(px) => p.onEditSize(rung.id, m, px)}
              onReset={() => p.onResetPin(rung.id, m)}
            />
          ))}
        </div>
        <CardFontPicker theme={theme} families={cardFamilies} value={activeFamily} onChange={setPreviewFamily} />
      </div>

      {/* Preview — real size, card's chosen font (§5.3) */}
      <div className="w-full py-4 min-w-0">
        <p
          className={cx('overflow-hidden text-ellipsis whitespace-nowrap leading-[1.2]', c.text0(theme))}
          style={{ fontFamily: activeFamily ? `'${activeFamily}', sans-serif` : undefined, fontSize: `${size}px` }}
        >
          {PREVIEW_TEXT}
        </p>
      </div>

      {/* Set-up — token rows + add-style + custom badge */}
      <div className="w-full flex flex-col gap-2 items-start">
        {rung.tokens.map(tk => (
          <TokenRow
            key={tk.id}
            theme={theme}
            token={tk}
            roles={roles}
            onRemove={() => p.onRemoveToken(rung.id, tk.id)}
            onFont={(k) => p.onSetTokenFont(rung.id, tk.id, k)}
            onLH={(v) => p.onSetTokenLH(rung.id, tk.id, v)}
            onTracking={(v) => p.onSetTokenTracking(rung.id, tk.id, v)}
            onWeights={(w) => p.onSetTokenWeights(rung.id, tk.id, w)}
          />
        ))}

        <div className="flex items-center gap-2">
          <AddStyleButton theme={theme} groups={p.availableGroups} onPick={(vid) => p.onAddToken(rung.id, vid)} />
          {rung.custom && (
            <CustomBadge
              theme={theme}
              empty={rung.tokens.length === 0}
              onDelete={() => p.onDeleteRung(rung.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Mode size cell (editable when it's the active mode) ───────────────────────

const ModeSizeCell: React.FC<{
  theme: Theme; mode: TypoMode; active: boolean; value: number; pinned: boolean;
  onCommit: (px: number) => void; onReset: () => void;
}> = ({ theme, mode, active, value, pinned, onCommit, onReset }) => {
  const Icon = MODE_ICON[mode];
  return (
    <div className="flex items-center gap-1 px-1">
      <span className={cx('w-5 h-5 flex items-center justify-center shrink-0', active ? c.text1(theme) : c.text4(theme))}>
        <Icon size={16} strokeWidth={2} />
      </span>
      <MiniEdit
        value={value}
        onCommit={onCommit}
        textCls={cx(
          'font-inter text-[14px] leading-[32px]',
          active
            ? cx('font-bold border-b border-solid', c.text1(theme), theme === 'light' ? 'border-[#131e36]' : 'border-white')
            : cx('font-semibold', c.text4(theme)),
        )}
        min={4}
        max={400}
      />
      {/* Pinned marker (§7): click to reset back to auto */}
      {pinned && (
        <button
          type="button"
          onClick={onReset}
          title="Pinned — click to reset to auto"
          className="shrink-0 w-2.5 h-2.5 rounded-full transition-transform hover:scale-125"
          style={{ backgroundColor: PIN }}
        />
      )}
    </div>
  );
};

// ── Token row ─────────────────────────────────────────────────────────────────

const TokenRow: React.FC<{
  theme: Theme; token: TypoToken; roles: FontRole[];
  onRemove: () => void; onFont: (k: string) => void; onLH: (v: number) => void;
  onTracking: (v: number) => void; onWeights: (w: TokenWeight[]) => void;
}> = ({ theme, token, roles, onRemove, onFont, onLH, onTracking, onWeights }) => {
  const role = roles.find(r => r.key === token.fontRole) ?? roles[0];
  return (
    <div className="flex gap-8 items-center w-full">
      {/* Variant chip — hover-invert + × delete badge (mirrors the setup category chip) */}
      <div className="w-[120px] shrink-0">
        <div className="relative inline-flex group/chip">
          <span
            title={fmtVariant(token.variantId)}
            className={cx('flex items-center justify-center px-3 py-1.5 rounded-full text-[12px] font-medium font-inter leading-[14px] max-w-[120px] border transition-colors cursor-default',
              theme === 'light'
                ? 'border-[rgba(107,114,128,0.5)] text-[#6b7280] group-hover/chip:bg-black group-hover/chip:text-white group-hover/chip:border-black'
                : 'border-white/20 text-white/70 group-hover/chip:bg-white group-hover/chip:text-black group-hover/chip:border-white')}
          >
            <span className="truncate">{fmtVariant(token.variantId)}</span>
          </span>
          <button
            type="button"
            onClick={onRemove}
            title="Remove style"
            className={cx('absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-[0px_1px_2px_rgba(0,0,0,0.15)] opacity-0 group-hover/chip:opacity-100 transition-opacity',
              theme === 'light' ? 'bg-white text-slate-600 hover:text-red-500' : 'bg-[#2a2a2a] text-white/70 hover:text-red-400')}
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Middle: font role · line-height · tracking */}
      <div className="flex gap-4 items-center">
        <RolePicker theme={theme} roles={roles} value={role?.key} onChange={onFont} />
        <div className="w-[56px] flex items-center justify-center px-1">
          <MiniEdit value={token.lineHeightPct} onCommit={onLH} suffix="%" min={0} max={400}
            textCls={cx('font-plex font-semibold text-[14px] leading-[32px]', c.text4(theme))} />
        </div>
        <div className="w-[56px] flex items-center justify-center px-1">
          <MiniEdit value={token.tracking} onCommit={onTracking} min={-20} max={40} step={0.1} bigStep={1}
            textCls={cx('font-plex font-semibold text-[14px] leading-[32px]', c.text4(theme))} />
        </div>
      </div>

      {/* Weights */}
      <div className="flex-1 min-w-0 flex items-center">
        <WeightsCell theme={theme} weights={token.weights} onChange={onWeights} />
      </div>
    </div>
  );
};

// ── Card preview-font picker (top-right corner) ───────────────────────────────
// Static text with one font; a dropdown once the card mixes ≥2 fonts (§5.3).
const CardFontPicker: React.FC<{ theme: Theme; families: string[]; value?: string; onChange: (f: string) => void }> = ({ theme, families, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const textCls = cx('font-inter font-medium text-[14px] leading-[32px] tracking-[0.2px] truncate', c.text4(theme));

  if (families.length <= 1) {
    return <div className={cx('flex items-center max-w-[180px]', textCls)}><span className="truncate">{value ?? '—'}</span></div>;
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} title="Preview font for this step" className="flex items-center gap-1 max-w-[180px] opacity-80 hover:opacity-100 transition-opacity">
        <span className={textCls}>{value}</span>
        <span className={cx('shrink-0 w-4 h-4 flex items-center justify-center', c.text4(theme))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && (
        <div className={cx('absolute z-50 mt-1 right-0 w-[200px] flex flex-col gap-0.5', menuSurface(theme))}>
          {families.map(f => (
            <button key={f} type="button" onClick={() => { onChange(f); setOpen(false); }} className={menuItemClass(theme, { active: f === value })}>
              <span className="flex-1 min-w-0 truncate">{f}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Font role picker (small dropdown) ─────────────────────────────────────────

const RolePicker: React.FC<{ theme: Theme; roles: FontRole[]; value?: string; onChange: (k: string) => void }> = ({ theme, roles, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const cur = roles.find(r => r.key === value) ?? roles[0];
  return (
    <div ref={ref} className="relative w-[160px]">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1 w-full opacity-80 hover:opacity-100 transition-opacity">
        <span className={cx('flex-1 min-w-0 text-left truncate font-inter font-medium text-[14px] leading-[32px] tracking-[0.2px]', c.text4(theme))}>{cur?.label ?? 'Font'}</span>
        <span className={cx('shrink-0 w-4 h-4 flex items-center justify-center', c.text4(theme))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && (
        <div className={cx('absolute z-50 mt-1 left-0 w-[200px] flex flex-col gap-0.5', menuSurface(theme))}>
          {roles.map(r => (
            <button key={r.key} type="button" onClick={() => { onChange(r.key); setOpen(false); }} className={menuItemClass(theme, { active: r.key === cur?.key })}>
              <span className="flex-1 min-w-0 truncate">{r.label}</span>
              <span className={cx('shrink-0 text-[11px] truncate max-w-[80px]', c.text4(theme))}>{r.family}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Weights cell + popover (§11) ──────────────────────────────────────────────

const WeightsCell: React.FC<{ theme: Theme; weights: TokenWeight[]; onChange: (w: TokenWeight[]) => void }> = ({ theme, weights, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const has = (v: number) => weights.some(w => w.value === v);
  const toggle = (w: TokenWeight) => {
    const next = has(w.value) ? weights.filter(x => x.value !== w.value) : [...weights, w].sort((a, b) => a.value - b.value);
    onChange(next);
  };
  const summary = weights.map(w => weightAbbr(w.name)).join('·');

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      {weights.length === 0 ? (
        <>
          <span className={cx('font-inter font-medium text-[14px] leading-[32px] tracking-[0.2px]', c.text4(theme))}>Add Weight</span>
          <button type="button" onClick={() => setOpen(o => !o)} title="Add weight"
            className={cx('shrink-0 w-7 h-7 rounded-full border border-dashed flex items-center justify-center transition-colors',
              theme === 'light' ? 'border-[#cbd5e1] bg-[rgba(174,179,188,0.1)] text-slate-500 hover:text-slate-700'
                : 'border-white/20 bg-white/5 text-white/50 hover:text-white/80')}>
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setOpen(o => !o)} title="Edit weights"
          className={cx('px-3 h-7 rounded-full border font-plex font-semibold text-[12px] tracking-[0.3px] transition-colors',
            theme === 'light' ? 'border-[rgba(107,114,128,0.5)] text-[#131e36] hover:bg-black/5' : 'border-white/20 text-white hover:bg-white/10')}>
          {summary}
        </button>
      )}

      {open && (
        <div className={cx('absolute z-50 top-9 left-0 w-[200px] flex flex-col gap-0.5 max-h-[280px] overflow-y-auto overscroll-contain figma-scrollbar', menuSurface(theme))}>
          {MOCK_WEIGHTS.map(w => (
            <button key={w.value} type="button" onClick={() => toggle(w)} className={menuItemClass(theme, { active: has(w.value) })}>
              <span className={cx('shrink-0 w-4 h-4 rounded-[5px] border flex items-center justify-center',
                has(w.value) ? 'bg-[color:var(--pin)] border-transparent' : (theme === 'light' ? 'border-slate-300' : 'border-white/30'))}
                style={has(w.value) ? { backgroundColor: PIN, borderColor: PIN } : undefined}>
                {has(w.value) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
              <span className="flex-1 min-w-0 truncate">{w.name}</span>
              <span className={cx('shrink-0 font-plex text-[11px]', c.text4(theme))}>{w.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Add-style button + popover (§5.3) ─────────────────────────────────────────

const AddStyleButton: React.FC<{ theme: Theme; groups: () => VariantGroup[]; onPick: (variantId: string) => void }> = ({ theme, groups, onPick }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const list = open ? groups() : [];

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium font-inter transition-colors', c.text2(theme),
          theme === 'light' ? 'hover:bg-black/5' : 'hover:bg-white/10')}>
        <Plus size={14} strokeWidth={2.5} /> Add
      </button>
      {open && (
        <div className={cx('absolute z-50 top-9 left-0 w-[220px] flex flex-col gap-0.5 max-h-[300px] overflow-y-auto overscroll-contain figma-scrollbar', menuSurface(theme))}>
          {list.every(g => g.variants.length === 0) ? (
            <div className={cx('px-3 py-2 text-[13px] font-semibold', c.text4(theme))}>All styles assigned</div>
          ) : list.map(g => (
            g.variants.length === 0 ? null : (
              <div key={g.cat} className="flex flex-col gap-0.5">
                <div className={cx('px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider', c.text4(theme))}>{g.cat}</div>
                {g.variants.map(v => (
                  <button key={v.id} type="button" onClick={() => { onPick(v.id); setOpen(false); }} className={menuItemClass(theme)}>
                    <span className="flex-1 min-w-0 truncate">{v.label}</span>
                  </button>
                ))}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
};

// ── CUSTOM badge (§9, §15) ────────────────────────────────────────────────────

const CustomBadge: React.FC<{ theme: Theme; empty: boolean; onDelete: () => void }> = ({ theme, empty, onDelete }) => (
  <div className="inline-flex items-center gap-1 pl-2.5 pr-1 h-6 rounded-full text-[10px] font-bold font-inter tracking-wider"
    style={{ color: PIN, backgroundColor: theme === 'light' ? 'rgba(255,120,24,0.1)' : 'rgba(255,120,24,0.15)' }}>
    CUSTOM
    <button
      type="button"
      onClick={onDelete}
      disabled={!empty}
      title={empty ? 'Delete step' : 'Remove all styles before deleting'}
      className={cx('w-4 h-4 rounded-full flex items-center justify-center transition-colors', empty ? 'hover:bg-[rgba(255,120,24,0.2)]' : 'opacity-30 cursor-not-allowed')}
      style={{ color: PIN }}
    >
      <X size={11} strokeWidth={2.5} />
    </button>
  </div>
);

// ── Insert strip between cards (§9) ───────────────────────────────────────────

const InsertStrip: React.FC<{ theme: Theme; onClick: () => void }> = ({ theme, onClick }) => (
  <div className="relative h-8 flex items-center justify-center group/insert">
    <div className={cx('absolute left-6 right-6 h-px opacity-0 group-hover/insert:opacity-100 transition-opacity',
      theme === 'light' ? 'bg-slate-300' : 'bg-white/15')} />
    <button type="button" onClick={onClick}
      className={cx('relative flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium font-inter transition-all opacity-40 group-hover/insert:opacity-100',
        c.text2(theme), theme === 'light' ? 'bg-white hover:bg-black/5' : 'bg-[#111] hover:bg-white/10')}>
      <Plus size={14} strokeWidth={2.5} /> Add
    </button>
  </div>
);

// ── Compact overview row (collapse view, §13) ─────────────────────────────────

const CompactRow: React.FC<CardProps> = (p) => {
  const { theme, rung, cfg, round } = p;
  const triple = MODE_ORDER.map(m => fmtSize(rungSize(rung, m, cfg, round))).join('/');
  const anyPinned = MODE_ORDER.some(m => rung.fixed[m] != null);
  return (
    <div className="flex items-center gap-4 py-2 px-3">
      <span className={cx('font-plex text-[11px] tabular-nums whitespace-nowrap shrink-0 w-[92px]', c.text4(theme))}>{triple}</span>
      {anyPinned && <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: PIN }} />}
      {rung.custom && <span className="shrink-0 text-[9px] font-bold tracking-wider" style={{ color: PIN }}>CUSTOM</span>}
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        {rung.tokens.length === 0 ? (
          <span className={cx('text-[11px] font-inter italic', c.text4(theme))}>empty</span>
        ) : rung.tokens.map(tk => (
          <span key={tk.id} className={cx('font-plex font-semibold text-[11px] tracking-[0.2px]', theme === 'light' ? 'text-[#131e36]' : 'text-white/85')}>
            {fmtVariant(tk.variantId)}
          </span>
        ))}
      </div>
    </div>
  );
};
