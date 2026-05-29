import type { WorldListing } from '../../lib/universalis';
import { dcOf } from '../../lib/europeWorlds';

export interface PreparedRow {
  world: string;
  price: number;
  hq: boolean;
  dc: 'Chaos' | 'Light' | null;
  isHome: boolean;
  diffPct: number | null;
}

export function prepare(
  listings: WorldListing[],
  homeWorld: string,
  homeMinNQ: number | null,
  homeMinHQ: number | null,
): PreparedRow[] {
  const rows: PreparedRow[] = [];
  for (const l of listings) {
    if (!l.world) continue;
    const isHome = l.world === homeWorld;
    const home = l.hq ? homeMinHQ : homeMinNQ;
    const diffPct = isHome || home == null || home === 0
      ? null
      : Math.round(((l.price - home) / home) * 100);
    rows.push({
      world: l.world,
      price: l.price,
      hq: l.hq,
      dc: dcOf(l.world),
      isHome,
      diffPct,
    });
  }
  rows.sort((a, b) => a.price - b.price || a.world.localeCompare(b.world));
  return rows;
}

export function dcClass(dc: 'Chaos' | 'Light' | null): string {
  if (dc === 'Chaos') return 'text-aether';
  if (dc === 'Light') return 'text-jade';
  return 'text-text-low';
}

export function diffClass(diff: number | null): string {
  if (diff == null) return 'text-text-low';
  if (diff < 0) return 'text-jade';
  if (diff > 0) return 'text-crimson';
  return 'text-text-cream';
}

export function formatDiff(diff: number | null): string {
  if (diff == null) return '—';
  return diff > 0 ? `+${diff}%` : `${diff}%`;
}

export interface CrossWorldArbStats {
  top: PreparedRow[];
  bestDiffPct: number | null;
  worldCount: number;
  maxTopPrice: number;
}

export function crossWorldArbStats(rows: PreparedRow[], _homeMinForQuality: number | null): CrossWorldArbStats {
  if (rows.length === 0) {
    return { top: [], bestDiffPct: null, worldCount: 0, maxTopPrice: 0 };
  }

  const uniqueWorlds = new Set(rows.map((r) => r.world));
  const top = rows.slice(0, 4);
  const maxTopPrice = top.length > 0 ? Math.max(...top.map((r) => r.price)) : 0;

  // bestDiffPct is the cheapest row's diffPct (if not home)
  const cheapest = top[0];
  const bestDiffPct = cheapest && !cheapest.isHome ? cheapest.diffPct : null;

  return {
    top,
    bestDiffPct,
    worldCount: uniqueWorlds.size,
    maxTopPrice,
  };
}
