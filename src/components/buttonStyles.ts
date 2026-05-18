/**
 * Shared button class tokens. Use these instead of hand-rolling button
 * styles so primary/secondary/danger affordances stay consistent across
 * the app. Each token is a static Tailwind class string the JIT can scan.
 *
 * Sizing variants live in the same token (we don't split size from
 * intent) — pick the named variant that matches the action's weight.
 */
const BASE = 'font-mono tracking-widest uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/** Primary call-to-action. Gold outline that fills on hover. */
export const btnPrimary = `${BASE} text-[10px] border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep`;

/** Bigger hero variant of the primary (mast-head refresh, run a session). Uses display font for weight. */
export const btnPrimaryLarge = 'font-display text-xs tracking-widest uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-gold text-gold bg-bg-card-hi px-5 py-2.5 hover:bg-gold hover:text-bg-deep';

/** Secondary action. Muted outline that lifts to aether on hover. */
export const btnSecondary = `${BASE} text-[10px] border border-border-base text-text-dim px-3 py-1.5 hover:text-aether hover:border-aether`;

/** Destructive action (clears caches, removes items, etc.). */
export const btnDanger = `${BASE} text-[10px] border border-crimson text-crimson px-3 py-1.5 hover:bg-crimson hover:text-bg-deep`;

/** Subtle text-only button for in-flow controls. */
export const btnGhost = `${BASE} text-[10px] text-text-low hover:text-aether`;
