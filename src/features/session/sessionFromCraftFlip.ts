import type { CraftFlipRow } from '../queries/types';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { CrafterLevels } from '../items/craftStatus';
import { craftStatus } from '../items/craftStatus';
import { resolveCraftSeconds } from './craftTime';
import type { SessionCandidate } from './buildCandidates';
import type { FlagMap } from '../profit/computeProfit';
import type { CrafterCode } from '../items/types';

export interface SessionFromCraftFlipOpts {
  recipeMap: Map<number, Recipe | null>;
  priceMap: MarketData;
  levels: CrafterLevels;
  baseSeconds: number;
  perItemFlags: FlagMap;
  crafterLock?: CrafterCode;
  minProfit?: number;
  ilvlById?: Map<number, number>;
  minIlvl?: number;
  maxIlvl?: number;
}

function setKeyFor(name: string): string {
  return name.split(' of ')[0].split("'s")[0].trim();
}

export function sessionCandidatesFromCraftFlip(
  rows: CraftFlipRow[],
  opts: SessionFromCraftFlipOpts,
): SessionCandidate[] {
  const out: SessionCandidate[] = [];
  for (const r of rows) {
    const recipe = opts.recipeMap.get(r.id);
    if (!recipe) continue;
    const crafter = recipe.classJob;
    const lvl = recipe.recipeLevel;
    if (craftStatus({ crafter, lvl }, opts.levels) !== 'ok') continue;
    if (r.profit <= 0) continue;
    if (opts.minProfit != null && r.profit < opts.minProfit) continue;
    if (opts.crafterLock && crafter !== opts.crafterLock) continue;
    if (opts.minIlvl != null || opts.maxIlvl != null) {
      const ilvl = opts.ilvlById?.get(r.id) ?? 0;
      if (opts.minIlvl != null && ilvl < opts.minIlvl) continue;
      if (opts.maxIlvl != null && ilvl > opts.maxIlvl) continue;
    }
    const override = opts.perItemFlags[r.id]?.craftTimeSeconds;
    const craftSeconds = resolveCraftSeconds(lvl, opts.baseSeconds, override);
    const gilPerMinute = r.profit / (craftSeconds / 60);
    const m = opts.priceMap[r.id];
    out.push({
      id: r.id,
      name: r.name,
      crafter,
      lvl,
      profit: r.profit,
      velocity: r.velocity,
      craftSeconds,
      gilPerMinute,
      setKey: setKeyFor(r.name),
      unitPrice: r.unitPrice,
      materialCost: r.materialCost,
      listingCount: m?.listingCount ?? 0,
    });
  }
  return out;
}
