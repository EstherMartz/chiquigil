import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { ItemCategory, CrafterCode } from '../items/types';
import { runCraftFlip } from '../queries/runCraftFlip';
import { runVendorFlip } from '../queries/runVendorFlip';
import { defaultVendorFlipFilter, type QueryFilter } from '../queries/types';
import { buildHeatmapCells } from '../heatmap/buildHeatmapData';
import { searchCatsForCategory } from './categorySearchCats';

export type SuggestionMode = 'craft' | 'vendor' | 'gather';

export interface Suggestion {
  id: number;
  name: string;
  cat: ItemCategory;
  mode: SuggestionMode;
  crafter: CrafterCode;
  lvl: number;
  /** What you pay to acquire one: material cost (craft), vendor price, or 0 (gather). */
  acquireCost: number;
  unitPrice: number;
  /** Sale − acquireCost. For gather it's the raw sale value. */
  profit: number;
  velocity: number;
  gilPerDay: number;
}

// Scoped craft-flip filter: this category's items, ranked by gil/day.
function craftFilter(searchCategories: number[]): QueryFilter {
  return {
    searchCategories, hq: 'either', minDealPct: 0, minVelocity: 0.5,
    minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 200,
    scope: 'home', maxListings: null, mode: 'craft', minGap: null, trainedEye: false,
  };
}

interface RankArgs {
  cat: ItemCategory;
  mode: SuggestionMode;
  snapshot: SnapshotItem[];
  market: MarketData;
  recipes: Map<number, Recipe | null>;
  trackedIds: Set<number>;
  excludedIds: Set<number>;
  limit: number;
  /** Vendor mode: itemId → vendor buy price. */
  vendorMap?: Map<number, number>;
  /** Gather mode: ids of gatherable items. */
  gatherableIds?: Set<number>;
}

/**
 * Top untracked items to add for a watchlist category, ranked by gil/day.
 * `mode` selects the play: craftables (runCraftFlip), vendor flips
 * (runVendorFlip), or gatherables (raw sale value × velocity). Pure — drops
 * tracked/dismissed ids and tags each with the target cat. [] for unsupported
 * categories or when the mode's source data is missing.
 */
export function rankSuggestions(args: RankArgs): Suggestion[] {
  const searchCategories = searchCatsForCategory(args.cat);
  if (searchCategories.length === 0) return [];
  const keep = (id: number) => !args.trackedIds.has(id) && !args.excludedIds.has(id);
  const take = <T,>(arr: T[]) => arr.slice(0, args.limit);

  if (args.mode === 'craft') {
    const rows = runCraftFlip(args.snapshot, args.market, args.recipes, craftFilter(searchCategories));
    return take(rows.filter((r) => keep(r.id)).map((r) => {
      const recipe = args.recipes.get(r.id);
      return {
        id: r.id, name: r.name, cat: args.cat, mode: 'craft' as const,
        crafter: (recipe?.classJob as CrafterCode) ?? 'ANY', lvl: recipe?.recipeLevel ?? 1,
        acquireCost: r.materialCost, unitPrice: r.unitPrice, profit: r.profit,
        velocity: r.velocity, gilPerDay: r.gilPerDay,
      };
    }));
  }

  if (args.mode === 'vendor') {
    if (!args.vendorMap) return [];
    const rows = runVendorFlip(args.snapshot, args.vendorMap, args.market, {
      ...defaultVendorFlipFilter(), searchCategories, sort: 'profitPerDay', limit: 200,
    });
    return take(rows.filter((r) => keep(r.id)).map((r) => ({
      id: r.id, name: r.name, cat: args.cat, mode: 'vendor' as const,
      crafter: 'ANY' as CrafterCode, lvl: 1,
      acquireCost: r.vendorPrice, unitPrice: r.salePrice, profit: r.profitPerUnit,
      velocity: r.velocity, gilPerDay: r.profitPerDay,
    })));
  }

  // gather: gatherable items in-category, ranked by raw money flow (no craft).
  if (!args.gatherableIds) return [];
  const scSet = new Set(searchCategories);
  const items = args.snapshot.filter(
    (i) => scSet.has(i.sc) && args.gatherableIds!.has(i.id) && !args.recipes.has(i.id),
  );
  const cells = buildHeatmapCells(items, args.market, new Map());
  const ranked = cells
    .filter((c) => keep(c.id))
    .map((c) => ({
      id: c.id, name: c.name, cat: args.cat, mode: 'gather' as const,
      crafter: 'ANY' as CrafterCode, lvl: 1,
      acquireCost: 0, unitPrice: c.salePrice, profit: c.salePrice,
      velocity: c.velocity, gilPerDay: Math.round(c.salePrice * c.velocity),
    }))
    .sort((a, b) => b.gilPerDay - a.gilPerDay);
  return take(ranked);
}
