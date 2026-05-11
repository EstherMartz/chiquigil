import type { CraftFlipRow } from '../queries/types';
import type { Recipe } from '../../lib/recipes';
import type { CrafterLevels } from '../items/craftStatus';
import { craftStatus } from '../items/craftStatus';
import { resolveCraftSeconds } from './craftTime';
import type { SessionCandidate } from './buildCandidates';
import type { FlagMap } from '../profit/computeProfit';
import type { CrafterCode } from '../items/types';

export interface SessionFromCraftFlipOpts {
  recipeMap: Map<number, Recipe | null>;
  levels: CrafterLevels;
  baseSeconds: number;
  perItemFlags: FlagMap;
  crafterLock?: CrafterCode;
  minProfit?: number;
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
    const override = opts.perItemFlags[r.id]?.craftTimeSeconds;
    const craftSeconds = resolveCraftSeconds(lvl, opts.baseSeconds, override);
    const gilPerMinute = r.profit / (craftSeconds / 60);
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
    });
  }
  return out;
}
