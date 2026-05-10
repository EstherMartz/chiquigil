import type { WatchlistRow } from '../watchlist/buildRows';
import type { CrafterCode } from '../items/types';
import type { FlagMap } from '../profit/computeProfit';
import { resolveCraftSeconds } from './craftTime';

export interface SessionCandidate {
  id: number;
  name: string;
  crafter: CrafterCode;
  lvl: number;
  profit: number;
  velocity: number;
  craftSeconds: number;
  gilPerMinute: number;
  setKey: string;
}

export interface CandidateOpts {
  baseSeconds: number;
  perItemFlags: FlagMap;
  minProfit?: number;
  crafterLock?: CrafterCode;
}

function setKeyFor(name: string): string {
  return name.split(' of ')[0].split("'s")[0].trim();
}

export function buildCandidates(rows: WatchlistRow[], opts: CandidateOpts): SessionCandidate[] {
  const out: SessionCandidate[] = [];
  for (const r of rows) {
    if (r.craftable !== true) continue;
    if (r.craftStatus !== 'ok') continue;
    if (r.profit == null || r.profit <= 0) continue;
    if (opts.minProfit != null && r.profit < opts.minProfit) continue;
    if (opts.crafterLock && r.crafter !== opts.crafterLock) continue;
    const override = opts.perItemFlags[r.id]?.craftTimeSeconds;
    const craftSeconds = resolveCraftSeconds(r.lvl, opts.baseSeconds, override);
    const gilPerMinute = r.profit / (craftSeconds / 60);
    out.push({
      id: r.id,
      name: r.name,
      crafter: r.crafter,
      lvl: r.lvl,
      profit: r.profit,
      velocity: r.dcSpd,
      craftSeconds,
      gilPerMinute,
      setKey: setKeyFor(r.name),
    });
  }
  return out;
}
