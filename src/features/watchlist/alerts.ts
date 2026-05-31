import type { WatchlistRow } from './buildRows';

export type AlertKind = 'crashed' | 'spike' | 'stale' | null;

// Week-over-week price move (%) that counts as a real signal, and the staleness
// cutoff (days since last upload). Shared so the Watchlist table and the
// Dashboard "what changed" digest agree on what fires.
export const CRASH_PCT = -20;
export const SPIKE_PCT = 20;
export const STALE_DAYS = 7;

// Detect alert state from price movement + freshness. A crash/spike takes
// precedence over staleness so a moving-but-old item still reads as a mover.
export function detectAlert(row: Pick<WatchlistRow, 'delta' | 'staleDays'>): AlertKind {
  if (row.delta != null) {
    if (row.delta <= CRASH_PCT) return 'crashed';
    if (row.delta >= SPIKE_PCT) return 'spike';
  }
  if (row.staleDays != null && row.staleDays > STALE_DAYS) return 'stale';
  return null;
}

export const ALERT_LABEL: Record<Exclude<AlertKind, null>, string> = {
  crashed: 'crashed',
  spike: 'spike',
  stale: 'stale',
};

export const ALERT_CLASS: Record<Exclude<AlertKind, null>, string> = {
  crashed: 'text-crimson border-crimson/40',
  spike: 'text-jade border-jade/40',
  stale: 'text-gold border-gold/40',
};
