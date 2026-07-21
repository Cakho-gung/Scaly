// ─────────────────────────────────────────────────────────────────────────────
// Typography feature — data model
// Source of truth: "Scaly Spec (Standalone).html" §2, §6.
// Golden rule (§6): separate IDENTITY (stable id) from POSITION (sorted by size).
// ─────────────────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark';

export type TypoMode = 'desktop' | 'tablet' | 'mobile';

export type TypoStage = 'generator' | 'mapping';

/** Per-mode base + ratio. Each mode tunes its own scale (§4). */
export interface ModeScaleConfig {
  base: number;   // px
  ratio: number;  // geometric ratio (>1)
}

export type ModeConfig = Record<TypoMode, ModeScaleConfig>;

/** A font a token can reference by ROLE, not by hard-coded name (§5.1). */
export interface FontEntry {
  id: string;            // stable id
  role: 'primary' | 'secondary';
  family: string;        // e.g. "IBM Plex Mono"
}

/** One weight assigned to a token: number ↔ Figma style name (§11). */
export interface TokenWeight {
  value: number;   // 400 / 500 / 600 …
  name: string;    // "Regular" / "Medium" / "SemiBold" …
}

/**
 * A token = one text style variant mapped onto a rung (§6).
 * Binds to the rung via the rung's stable id, never its index.
 */
export interface TypoToken {
  id: string;
  variantId: string;      // Font Style variant this token represents, e.g. "Heading-1"
  fontRole: string;       // FontEntry.id (primary or a secondary)
  lineHeightPct: number;  // % — export → absolute px per mode (§12)
  tracking: number;       // % (scales with size) — export → Number
  weights: TokenWeight[];
}

/** Rung state (§15). */
export type RungKind = 'generated' | 'overridden' | 'custom';

/**
 * A rung/step of the scale (§6).
 *   generated: follows base·ratio^step; no pinned cell.
 *   overridden: generated but ≥1 fixed[mode] pinned by hand (orange dot).
 *   custom: hand-added (insert / step-reduction protection); pinned px, off-ratio.
 */
export interface TypoRung {
  id: string;                              // STABLE, permanent — tokens bind here
  step: number;                            // used to COMPUTE size for generated rungs
  custom: boolean;                         // true → CUSTOM (off the ratio)
  fixed: Partial<Record<TypoMode, number>>; // per-mode pinned px
  tokens: TypoToken[];
}

/** Font Style category kinds (§10). */
export type CategoryKind = 'numbered' | 'sized';

export interface TypoCategory {
  id: string;
  name: string;          // "Display", "Heading", "Title", "Body", "Button", "Label"
  kind: CategoryKind;
  variants: string[];    // ordered variant labels, e.g. ["Display-1","Display-2"] or ["XL","L","M","S"]
}
