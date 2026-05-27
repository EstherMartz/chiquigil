import type { Recipe } from '../lib/recipes';
import type { CompanyCraftRecipe } from '../lib/companyCraftSnapshot';
import type { SpecialShopSnapshot } from '../lib/specialShopSnapshot';
import type { GatheringInfo } from '../lib/gatheringCatalog';
import type { MarketBundle } from '../features/watchlist/useMarketData';
import { surveyIngredients } from '../features/shoppingList/shoppingListSurvey';
import { explode, type ExplodeOpts } from './craftExplode';
import type { Breakdown, CraftTask } from './craftTypes';

export interface SourcingDeps {
  recipes: Map<number, Recipe>;
  namesById: Map<number, string>;
  vendorMap: Map<number, number>;
  specialShop: SpecialShopSnapshot;
  gatheringCatalog: Map<number, GatheringInfo>;
  companyCraft: Map<number, CompanyCraftRecipe>;
}

export interface SourcingOpts extends ExplodeOpts {
  /** Max vendor price to prefer over gathering (default 100 gil). */
  cheapVendorThreshold?: number;
}

/**
 * Build acquire tasks from a flat leaf-map (Map<itemId, qty>) using the same
 * sourcing priority (gather → currency → vendor → market) used by the
 * standard recipe path.
 */
function sourceLeaves(
  leaves: Map<number, number>,
  market: MarketBundle,
  deps: SourcingDeps,
  cheapVendorThreshold: number,
): CraftTask[] {
  const survey = surveyIngredients(leaves, market.dc, deps.vendorMap, deps.specialShop);
  const acquire: CraftTask[] = [];
  for (const s of survey) {
    const name = deps.namesById.get(s.id) ?? `Item #${s.id}`;
    const gatherInfo = deps.gatheringCatalog.get(s.id);
    const vendorPrice = deps.vendorMap.get(s.id);

    if (gatherInfo && !(vendorPrice != null && vendorPrice <= cheapVendorThreshold) && !s.currency) {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: 'gather',
        meta: { gatherLevel: gatherInfo.level, timed: gatherInfo.timed },
      });
    } else if (s.currency) {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: 'currency',
        meta: { currency: s.currency.shortLabel, currencyId: s.currency.id, costPerUnit: s.currency.costPerUnit },
      });
    } else if (s.npc && s.autoSource === 'npc') {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: 'vendor',
        meta: { price: s.npc.price },
      });
    } else {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: 'market',
        meta: s.mb ? { world: s.mb.world, price: s.mb.price } : {},
      });
    }
  }
  return acquire;
}

/**
 * Builds a full Breakdown from a target item + quantity. Falls back to the
 * companyCraft snapshot when no standard recipe exists (e.g. submarine parts,
 * FC workshop furniture); recipes always win the tie if both exist.
 */
export function buildBreakdown(
  targetId: number,
  targetQty: number,
  market: MarketBundle,
  deps: SourcingDeps,
  opts: SourcingOpts = {},
): Breakdown {
  const cheapVendorThreshold = opts.cheapVendorThreshold ?? 100;

  // Path A — standard recipe: recursive explosion + per-leaf survey.
  if (deps.recipes.get(targetId)) {
    const { crafts: craftMap, leaves } = explode(targetId, targetQty, deps.recipes, opts);
    const acquire = sourceLeaves(leaves, market, deps, cheapVendorThreshold);
    const crafts: CraftTask[] = [];
    for (const [itemId, info] of craftMap) {
      const name = deps.namesById.get(itemId) ?? `Item #${itemId}`;
      crafts.push({
        itemId,
        itemName: name,
        qtyNeeded: info.outputQty,
        source: 'craft',
        meta: { job: info.job as CraftTask['meta']['job'] },
      });
    }
    return { crafts, acquire };
  }

  // Path B — CompanyCraft fallback: one synthetic workshop task + flat acquire leaves.
  const cc = deps.companyCraft.get(targetId);
  if (cc) {
    const leaves = new Map<number, number>();
    for (const ing of cc.ingredients) {
      leaves.set(ing.itemId, (leaves.get(ing.itemId) ?? 0) + ing.qty * targetQty);
    }
    const acquire = sourceLeaves(leaves, market, deps, cheapVendorThreshold);
    const workshopTask: CraftTask = {
      itemId: cc.resultItemId,
      itemName: deps.namesById.get(cc.resultItemId) ?? cc.resultName,
      qtyNeeded: targetQty,
      source: 'workshop',
      meta: {},
    };
    return { crafts: [workshopTask], acquire };
  }

  // Neither path matches.
  return { crafts: [], acquire: [] };
}
