/**
 * Freshness / stability tracking for DC-flip opportunities.
 *
 * A "scan cycle" is one server market-refresh run. `cycleCount` counts
 * CONSECUTIVE cycles in which a positive spread was seen for an (item, world)
 * pair, capped at MAX_CYCLES. A single missed cycle drops the entry, so the
 * next detection restarts as `New`. Labels: 1 → New, 2–4 → Volatile, ≥5 → Stable.
 *
 * Pure module — shared by the server (folds + persists) and the client
 * (derives the WINDOW cell). No IO here.
 */

export const MAX_CYCLES = 20;
export const STABLE_MIN_CYCLES = 5;
/** Spreads older than this read as "stale" (grey), even if Stable. */
export const OLD_AGE_MS = 6 * 3_600_000;

export interface SpreadHistoryEntry {
  /** ms epoch when the current unbroken run of positive spreads began. */
  firstSeenAt: number;
  /** consecutive cycles seen, capped at MAX_CYCLES. */
  cycleCount: number;
}

export type SpreadHistoryMap = Record<string, SpreadHistoryEntry>;

export function spreadKey(itemId: number, world: string): string {
  return `${itemId}|${world}`;
}

/**
 * Fold one cycle's observation into the prior entry.
 * `sawSpread` = a positive spread was detected this cycle.
 * Returns the next entry, or `undefined` when the entry should be dropped
 * (no spread this cycle → reset).
 */
export function foldSpreadCycle(
  prev: SpreadHistoryEntry | undefined,
  sawSpread: boolean,
  nowMs: number,
): SpreadHistoryEntry | undefined {
  if (!sawSpread) return undefined;
  if (!prev) return { firstSeenAt: nowMs, cycleCount: 1 };
  return { firstSeenAt: prev.firstSeenAt, cycleCount: Math.min(prev.cycleCount + 1, MAX_CYCLES) };
}

export type Stability = 'New' | 'Volatile' | 'Stable';

export function stabilityLabel(cycleCount: number): Stability {
  if (cycleCount >= STABLE_MIN_CYCLES) return 'Stable';
  if (cycleCount >= 2) return 'Volatile';
  return 'New';
}

export function fmtAge(firstSeenAt: number, nowMs: number): string {
  const ms = Math.max(0, nowMs - firstSeenAt);
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export type WindowTone = 'green' | 'amber' | 'grey';

export interface WindowCell {
  label: Stability;
  ageText: string;
  tone: WindowTone;
  /** full hover text */
  tooltip: string;
  /** raw cycle count for callers that want it */
  cycleCount: number;
}

/**
 * Derive the WINDOW cell for a row. `entry` is the persisted state for this
 * (item, world); `undefined` means no history → treated as New / just now.
 * Tone: grey when older than OLD_AGE_MS, else green when Stable/New, amber when Volatile.
 */
export function deriveWindow(entry: SpreadHistoryEntry | undefined, nowMs: number): WindowCell {
  const firstSeenAt = entry?.firstSeenAt ?? nowMs;
  const cycleCount = entry?.cycleCount ?? 1;
  const label = stabilityLabel(cycleCount);
  const ageText = fmtAge(firstSeenAt, nowMs);
  const old = nowMs - firstSeenAt > OLD_AGE_MS;
  const tone: WindowTone = old ? 'grey' : label === 'Volatile' ? 'amber' : 'green';
  const tooltip = `First seen ${ageText} · ${label} (seen in ${cycleCount} of last ${MAX_CYCLES} scans)`;
  return { label, ageText, tone, tooltip, cycleCount };
}
