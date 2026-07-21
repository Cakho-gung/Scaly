import React, { useMemo, useState } from 'react';
import type { ModeConfig, Theme, TypoMode, TypoStage } from './types';
import {
  DEFAULT_MODE_CONFIG, MOCK_FONTS, MODE_ORDER, PREVIEW_TEXT,
  buildGeneratedRungs, fmtSize, orderedRungs, rungSize,
} from './logic';
import { cx, Counter, Dropdown, EditableField, FieldLabel, RoundingButton } from './ui';
import { Monitor, Tablet, Smartphone, Moon, Sun } from './icons';

interface TypoAppProps {
  theme: Theme;
  toggleTheme: () => void;
  onCancel: () => void;
  showToast: (msg: string) => void;
}

// Musical typographic scale ratios (value + name), per the design reference.
const RATIO_PRESETS: { value: string; name: string; display?: string }[] = [
  { value: '1.067', name: 'Minor Second' },
  { value: '1.125', name: 'Major Second' },
  { value: '1.2', name: 'Minor Third', display: '1.200' },
  { value: '1.25', name: 'Major Third', display: '1.250' },
  { value: '1.333', name: 'Perfect Fourth' },
  { value: '1.414', name: 'Augmented Fourth' },
  { value: '1.5', name: 'Perfect Fifth', display: '1.500' },
  { value: '1.6', name: 'Minor Sixth', display: '1.600' },
  { value: '1.618', name: 'Golden Ratio' },
  { value: '1.667', name: 'Major Sixth' },
  { value: '1.778', name: 'Minor Seventh' },
  { value: '1.875', name: 'Major Seventh' },
  { value: '2', name: 'Octave', display: '2.000' },
];
const MODE_META: Record<TypoMode, { label: string; Icon: typeof Monitor }> = {
  desktop: { label: 'Desktop', Icon: Monitor },
  tablet: { label: 'Tablet', Icon: Tablet },
  mobile: { label: 'Mobile', Icon: Smartphone },
};

export default function TypoApp({ theme, toggleTheme, onCancel, showToast }: TypoAppProps) {
  const [stage, setStage] = useState<TypoStage>('generator');
  const [mode, setMode] = useState<TypoMode>('desktop');
  const [cfg, setCfg] = useState<ModeConfig>(DEFAULT_MODE_CONFIG);
  const [stepsUp, setStepsUp] = useState(6);
  const [stepsDown, setStepsDown] = useState(3);
  const [round, setRound] = useState(0);   // 0 = whole number, 1/2/3 = decimals
  const [previewFont, setPreviewFont] = useState('IBM Plex Mono');

  const rungs = useMemo(() => buildGeneratedRungs(stepsUp, stepsDown), [stepsUp, stepsDown]);
  const ordered = useMemo(() => orderedRungs(rungs, cfg, round), [rungs, cfg, round]);

  const patchCfg = (m: TypoMode, patch: Partial<ModeConfig[TypoMode]>) =>
    setCfg(prev => ({ ...prev, [m]: { ...prev[m], ...patch } }));

  const card = theme === 'light'
    ? 'bg-white/40 border-white shadow-[0px_8px_30px_0px_rgba(0,0,0,0.04)]'
    : 'bg-white/[0.02] border-white/10 shadow-2xl';

  return (
    <>
      <div className="flex flex-col gap-6">
        {stage === 'generator' && (
          <GeneratorStage
            theme={theme}
            cfg={cfg}
            mode={mode}
            stepsUp={stepsUp}
            stepsDown={stepsDown}
            round={round}
            previewFont={previewFont}
            ordered={ordered}
            cardCls={card}
            onFont={setPreviewFont}
            onBase={(v) => patchCfg(mode, { base: v })}
            onRatio={(v) => patchCfg(mode, { ratio: v })}
            onStepsUp={setStepsUp}
            onStepsDown={setStepsDown}
            onRound={setRound}
          />
        )}

        {stage === 'mapping' && (
          <div className={cx('rounded-[24px] border p-6 backdrop-blur-[20px]', card)}>
            <p className="font-inter text-sm opacity-60">Stage 2 · Mapping — coming next (Phase 3–4).</p>
          </div>
        )}
      </div>

      <BottomBar
        theme={theme}
        stage={stage}
        mode={mode}
        onMode={setMode}
        onStage={setStage}
        toggleTheme={toggleTheme}
        showToast={showToast}
      />
    </>
  );
}

// ── Stage 1 ───────────────────────────────────────────────────────────────────

interface GeneratorStageProps {
  theme: Theme;
  cfg: ModeConfig;
  mode: TypoMode;
  stepsUp: number;
  stepsDown: number;
  round: number;
  previewFont: string;
  ordered: ReturnType<typeof orderedRungs>;
  cardCls: string;
  onFont: (v: string) => void;
  onBase: (v: number) => void;
  onRatio: (v: number) => void;
  onStepsUp: (updater: (n: number) => number) => void;
  onStepsDown: (updater: (n: number) => number) => void;
  onRound: (r: number) => void;
}

const GeneratorStage: React.FC<GeneratorStageProps> = ({
  theme, cfg, mode, stepsUp, stepsDown, round, previewFont, ordered, cardCls,
  onFont, onBase, onRatio, onStepsUp, onStepsDown, onRound,
}) => {
  const pad2 = (n: number) => String(n).padStart(2, '0');

  // Precompute rows so the size column can fit its widest value: narrow for
  // whole numbers, wider for decimals. Monospace → char count == exact ch width.
  const rows = ordered.map(rung => ({
    rung,
    size: rungSize(rung, mode, cfg, round),
    triple: MODE_ORDER.map(m => fmtSize(rungSize(rung, m, cfg, round))).join('/'),
  }));
  const sizeColCh = Math.max(5, ...rows.map(r => r.triple.length));

  return (
    <>
      {/* Controls card (Figma 1:4569) */}
      <div className={cx('rounded-[24px] border-b border-solid p-6 backdrop-blur-[20px]', cardCls)}>
        <div className="flex items-start gap-2">
          {/* Font Family */}
          <div className="flex flex-col gap-1 w-[200px] shrink-0">
            <FieldLabel theme={theme} className="px-1">Font Family</FieldLabel>
            <Dropdown theme={theme} value={previewFont} options={MOCK_FONTS} onChange={onFont} widthClass="max-w-[180px]" />
          </div>

          {/* Base size — editable (↑/↓ ±1, Shift+↑/↓ ±10) */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <FieldLabel theme={theme} className="px-1">Base size</FieldLabel>
            <EditableField theme={theme} value={cfg[mode].base} onCommit={onBase} min={4} max={200} bigStep={10} />
          </div>

          {/* Scale Ratio */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <FieldLabel theme={theme} className="px-1">Scale Ratio</FieldLabel>
            <Dropdown
              theme={theme}
              mono
              value={String(cfg[mode].ratio)}
              options={RATIO_PRESETS.map(r => ({
                value: r.value,
                label: (
                  <span className="flex items-baseline">
                    <span className="w-[46px] shrink-0 tabular-nums">{r.display ?? r.value}</span>
                    <span className="font-inter">- {r.name}</span>
                  </span>
                ),
              }))}
              onChange={(v) => onRatio(parseFloat(v))}
              widthClass="max-w-[120px]"
              menuWidthClass="w-[248px]"
            />
          </div>

          {/* Increase Step — counter reveals on hover */}
          <div className="flex flex-col gap-1 flex-1 min-w-0 group">
            <FieldLabel theme={theme} className="px-1">Increase Step</FieldLabel>
            <div className="flex items-center gap-1 px-1">
              <span className={cx('font-plex text-[18px] leading-[32px] tabular-nums', theme === 'light' ? 'text-black' : 'text-white')}>{pad2(stepsUp)}</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <Counter theme={theme} onInc={() => onStepsUp(n => Math.min(20, n + 1))} onDec={() => onStepsUp(n => Math.max(0, n - 1))} />
              </span>
            </div>
          </div>

          {/* Decrease Step — counter reveals on hover */}
          <div className="flex flex-col gap-1 flex-1 min-w-0 group">
            <FieldLabel theme={theme} className="px-1">Decrease Step</FieldLabel>
            <div className="flex items-center gap-1 px-1">
              <span className={cx('font-plex text-[18px] leading-[32px] tabular-nums', theme === 'light' ? 'text-black' : 'text-white')}>{pad2(stepsDown)}</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <Counter theme={theme} onInc={() => onStepsDown(n => Math.min(20, n + 1))} onDec={() => onStepsDown(n => Math.max(0, n - 1))} />
              </span>
            </div>
          </div>

          {/* Round number — loop button: whole → 1 → 2 → 3 decimals */}
          <div className="flex flex-col gap-1 shrink-0">
            <FieldLabel theme={theme} className="px-1">Round number</FieldLabel>
            <div className="flex items-center px-1">
              <RoundingButton theme={theme} round={round} onChange={onRound} />
            </div>
          </div>
        </div>
      </div>

      {/* Live preview list (Figma "Typo Step") */}
      <div className="flex flex-col">
        {rows.map(({ rung, size, triple }) => (
          <div key={rung.id} className="flex items-center gap-5 py-2 px-2">
            <span
              className={cx('font-plex text-[11px] shrink-0 text-left tabular-nums whitespace-nowrap', theme === 'light' ? 'text-slate-400' : 'text-white/40')}
              style={{ width: `${sizeColCh}ch` }}
            >
              {triple}
            </span>
            <span
              className={cx('flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap leading-none', theme === 'light' ? 'text-slate-900' : 'text-white')}
              style={{ fontFamily: `'${previewFont}', sans-serif`, fontSize: `${size}px` }}
            >
              {PREVIEW_TEXT}
            </span>
          </div>
        ))}
      </div>
    </>
  );
};

// ── Bottom bar ────────────────────────────────────────────────────────────────

interface BottomBarProps {
  theme: Theme;
  stage: TypoStage;
  mode: TypoMode;
  onMode: (m: TypoMode) => void;
  onStage: (s: TypoStage) => void;
  toggleTheme: () => void;
  showToast: (msg: string) => void;
}

const BottomBar: React.FC<BottomBarProps> = ({ theme, stage, mode, onMode, onStage, toggleTheme, showToast }) => {
  const iconBtn = (active: boolean) => cx(
    'w-10 h-10 rounded-full flex items-center justify-center transition-all',
    active
      ? (theme === 'light' ? 'bg-black text-white' : 'bg-white text-black')
      : (theme === 'light' ? 'text-slate-500 hover:bg-black/5' : 'text-slate-400 hover:bg-white/10'),
  );
  const divider = cx('w-px h-6 mx-1', theme === 'light' ? 'bg-slate-200' : 'bg-white/10');
  const pill = cx(
    'font-inter font-bold text-sm px-4 h-10 rounded-full transition-all flex items-center justify-center gap-1.5',
    theme === 'light' ? 'bg-black/5 hover:bg-black hover:text-white text-black' : 'bg-white/5 hover:bg-white/10 text-white',
  );

  return (
    <div className={cx(
      'fixed bottom-6 left-1/2 -translate-x-1/2 backdrop-blur-2xl border rounded-full p-2 flex gap-2 items-center z-40 transition-colors duration-300',
      theme === 'light' ? 'bg-white/80 border-white/60 shadow-xl shadow-slate-200/50' : 'bg-[#111111]/80 border-white/10 shadow-2xl shadow-black/80',
    )}>
      {/* Mode switch */}
      <div className="flex gap-2 items-center">
        {MODE_ORDER.map(m => {
          const { label, Icon } = MODE_META[m];
          return (
            <button key={m} className={iconBtn(mode === m)} title={label} onClick={() => onMode(m)}>
              <Icon size={18} strokeWidth={2} />
            </button>
          );
        })}
      </div>

      <div className={divider} />

      {/* Middle group */}
      {stage === 'generator' ? (
        <button className={pill} onClick={() => onStage('mapping')}>Mapping</button>
      ) : (
        <div className="flex gap-2 items-center">
          <button className={pill} onClick={() => onStage('generator')}>Scale generator</button>
          <button className={pill} onClick={() => showToast('Export — coming in Phase 6')}>Export</button>
        </div>
      )}

      <div className={divider} />

      {/* Theme */}
      <button
        className={cx('w-10 h-10 flex items-center justify-center rounded-full transition-all', theme === 'light' ? 'text-slate-500 hover:bg-black hover:text-white' : 'text-slate-400 hover:bg-white hover:text-black')}
        title={theme === 'light' ? 'Dark mode' : 'Light mode'}
        onClick={toggleTheme}
      >
        {theme === 'light' ? <Moon size={18} strokeWidth={2.5} /> : <Sun size={18} strokeWidth={2.5} />}
      </button>
    </div>
  );
};
