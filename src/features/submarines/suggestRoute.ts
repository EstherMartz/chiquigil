import type { Sector } from './submarineTypes';
import type { MarketData } from '../../lib/universalis';
import { expectedGil } from './dropRates';

interface SuggestOpts {
  rank: number;
  slots: number;
  /** If null, auto-pick the best zone. */
  zone: string | null;
}

/** Score a sector by summing expected gil across its loot using cached market prices. */
function scoreSector(sector: Sector, market: MarketData): number {
  return sector.loot.reduce((sum, item) => {
    const m = market[String(item.itemId)];
    return sum + expectedGil(item.tier, m?.minNQ ?? null);
  }, 0);
}

/**
 * Zone-constrained greedy optimizer. Filters sectors by rank within a zone
 * (or finds the best zone if none specified), scores each sector individually,
 * and picks the top N by score descending.
 */
export function suggestRoute(
  sectors: Sector[],
  market: MarketData,
  opts: SuggestOpts,
): Sector[] {
  const eligible = sectors.filter((s) => s.rankReq <= opts.rank);

  if (opts.zone) {
    const zoneSectors = eligible.filter((s) => s.zone === opts.zone);
    return topN(zoneSectors, market, opts.slots);
  }

  // No zone specified — find the best zone by total top-N score
  const zones = [...new Set(eligible.map((s) => s.zone))];
  let bestZone = '';
  let bestScore = -1;

  for (const zone of zones) {
    const zoneSectors = eligible.filter((s) => s.zone === zone);
    const top = topN(zoneSectors, market, opts.slots);
    const score = top.reduce((sum, s) => sum + scoreSector(s, market), 0);
    if (score > bestScore) {
      bestScore = score;
      bestZone = zone;
    }
  }

  return topN(eligible.filter((s) => s.zone === bestZone), market, opts.slots);
}

function topN(sectors: Sector[], market: MarketData, n: number): Sector[] {
  return [...sectors]
    .map((s) => ({ sector: s, score: scoreSector(s, market) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.sector);
}
