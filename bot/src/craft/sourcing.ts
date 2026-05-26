import type { Recipe } from '../../../src/lib/recipes';
import type { SpecialShopSnapshot } from '../../../src/lib/specialShopSnapshot';
import type { GatheringInfo } from '../../../src/lib/gatheringCatalog';
import type { MarketBundle } from '../../../src/features/watchlist/useMarketData';
import { surveyIngredients } from '../../../src/features/shoppingList/shoppingListSurvey';
import { explode, type ExplodeOpts } from './explode';
import type { Breakdown, CraftTask } from './types';

export interface SourcingDeps {
  recipes: Map<number, Recipe>;
  namesById: Map<number, string>;
  vendorMap: Map<number, number>;
  specialShop: SpecialShopSnapshot;
  gatheringCatalog: Map<number, GatheringInfo>;
}

export interface SourcingOpts extends ExplodeOpts {
  /** Max vendor price to prefer over gathering (default 100 gil). */
  cheapVendorThreshold?: number;
}

/**
 * Builds a full Breakdown from a target item + quantity.
 * Market data must be provided (caller fetches it).
 */
export function buildBreakdown(
  targetId: number,
  targetQty: number,
  market: MarketBundle,
  deps: SourcingDeps,
  opts: SourcingOpts = {},
): Breakdown {
  const cheapVendorThreshold = opts.cheapVendorThreshold ?? 100;

  // Step 1: recursive explosion
  const { crafts: craftMap, leaves } = explode(targetId, targetQty, deps.recipes, opts);

  // Step 2: survey leaves for sourcing
  const dcPrices = market.dc;
  const survey = surveyIngredients(leaves, dcPrices, deps.vendorMap, deps.specialShop);

  // Step 3: build acquire tasks from survey
  const acquire: CraftTask[] = [];
  for (const s of survey) {
    const name = deps.namesById.get(s.id) ?? `Item #${s.id}`;
    const gatherInfo = deps.gatheringCatalog.get(s.id);
    const vendorPrice = deps.vendorMap.get(s.id);

    // Priority: gather (if gatherable and no trivially cheap vendor/currency)
    //           → currency → vendor → market
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

  // Step 4: build craft tasks from explosion
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
