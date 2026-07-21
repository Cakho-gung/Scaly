import type { ModeConfig, TypoMode, TypoRung, TypoCategory, TokenWeight } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Core scale logic (§6). Kept pure so Phase 5 can extend (pin / regenerate).
// ─────────────────────────────────────────────────────────────────────────────

export const FLOOR_PX = 10;          // minimum readable size (§4, §6)
export const MODE_ORDER: TypoMode[] = ['desktop', 'tablet', 'mobile'];

/**
 * Rounding control (loop button): 0 = whole number, 1/2/3 = decimal places.
 * `round` = number of decimals to keep; 0 rounds to the nearest integer.
 */
export function applyRound(raw: number, round: number): number {
  const f = Math.pow(10, Math.max(0, round));
  return Math.round(raw * f) / f;
}

/** Format a size for display: integers bare, otherwise trimmed to ≤4 decimals. */
export function fmtSize(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
}

/** size(rung, mode) = fixed[mode] ?? applyRound(base · ratio^step), with floor. (§6) */
export function rungSize(rung: TypoRung, mode: TypoMode, cfg: ModeConfig, round = 0): number {
  const pinned = rung.fixed[mode];
  if (pinned != null) return pinned;
  const { base, ratio } = cfg[mode];
  const raw = base * Math.pow(ratio, rung.step);
  return Math.max(FLOOR_PX, applyRound(raw, round));
}

/** order = rungs sorted by desktop size, descending. Never stored — always recomputed. (§6) */
export function orderedRungs(rungs: TypoRung[], cfg: ModeConfig, round = 0): TypoRung[] {
  return [...rungs].sort((a, b) => rungSize(b, 'desktop', cfg, round) - rungSize(a, 'desktop', cfg, round));
}

/** Geometric mean of two sizes — the correct midpoint on a geometric scale (§9). */
export function geometricMid(a: number, b: number): number {
  return Math.round(Math.sqrt(a * b));
}

let _id = 0;
export const uid = (prefix = 'r') => `${prefix}_${Date.now().toString(36)}_${(_id++).toString(36)}`;

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_MODE_CONFIG: ModeConfig = {
  desktop: { base: 16, ratio: 1.25 },   // Major Third
  tablet: { base: 15, ratio: 1.2 },     // Minor Third
  mobile: { base: 14, ratio: 1.125 },   // Major Second
};

/** Build a fresh set of generated rungs spanning +up … 0 … -down steps. */
export function buildGeneratedRungs(stepsUp: number, stepsDown: number): TypoRung[] {
  const rungs: TypoRung[] = [];
  for (let s = stepsUp; s >= -stepsDown; s--) {
    rungs.push({ id: uid(), step: s, custom: false, fixed: {}, tokens: [] });
  }
  return rungs;
}

/** Default Font Style categories (§10). */
// Variants are stored "bare" (numbers for numbered, sizes for sized); the full
// token label is composed as `${category.name}-${variant}` in the UI/export.
export const DEFAULT_CATEGORIES: TypoCategory[] = [
  { id: uid('c'), name: 'Display', kind: 'numbered', variants: ['1', '2', '3'] },
  { id: uid('c'), name: 'Heading', kind: 'numbered', variants: ['1', '2', '3', '4', '5', '6'] },
  { id: uid('c'), name: 'Title', kind: 'sized', variants: ['XL', 'L', 'M', 'S', 'XS'] },
  { id: uid('c'), name: 'Body', kind: 'sized', variants: ['XL', 'L', 'M', 'S', 'XS'] },
  { id: uid('c'), name: 'Button', kind: 'sized', variants: ['XL', 'L', 'M', 'S', 'XS'] },
  { id: uid('c'), name: 'Label', kind: 'sized', variants: ['XL', 'L', 'M', 'S', 'XS'] },
];

/** Fonts shown while UI-first (Phase 6 replaces with listAvailableFontsAsync). */
export const MOCK_FONTS = [
  'IBM Plex Mono', 'Inter', 'Montserrat', 'Lora', 'Raleway',
  'Merriweather', 'Open Sans', 'Poppins', 'Oswald',
];

export const PREVIEW_TEXT =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

// ── Weights (§11) ─────────────────────────────────────────────────────────────
// UI-first mock. Phase 6 replaces with the font's real styles from
// listAvailableFontsAsync (variable font → named instances / wght range).
export const MOCK_WEIGHTS: TokenWeight[] = [
  { value: 100, name: 'Thin' },
  { value: 200, name: 'ExtraLight' },
  { value: 300, name: 'Light' },
  { value: 400, name: 'Regular' },
  { value: 500, name: 'Medium' },
  { value: 600, name: 'SemiBold' },
  { value: 700, name: 'Bold' },
  { value: 800, name: 'ExtraBold' },
  { value: 900, name: 'Black' },
];

/** Compact chip label for a weight, e.g. "Regular" → "R", "SemiBold" → "SB" (§11). */
export function weightAbbr(name: string): string {
  const caps = name.replace(/[^A-Z]/g, '');
  return caps || name.slice(0, 1).toUpperCase();
}

/** Token variant id → display label: "Heading-1" → "Heading 1" (§5.3). */
export function fmtVariant(id: string): string {
  return id.replace('-', ' ');
}

/**
 * Insert a CUSTOM rung between two neighbours (§9). Size = geometric mean per
 * mode (the correct midpoint on a geometric scale), pinned so it won't drift.
 */
export function makeInsertRung(above: TypoRung, below: TypoRung, cfg: ModeConfig, round = 0): TypoRung {
  const fixed: Partial<Record<TypoMode, number>> = {};
  for (const m of MODE_ORDER) {
    fixed[m] = applyRound(geometricMid(rungSize(above, m, cfg, round), rungSize(below, m, cfg, round)), round);
  }
  return { id: uid('c'), step: 0, custom: true, fixed, tokens: [] };
}
