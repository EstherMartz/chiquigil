import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { ItemCategory, CrafterCode } from '../items/types';
import { runCraftFlip } from '../queries/runCraftFlip';
import type { QueryFilter } from '../queries/types';
import { searchCatsForCategory } from './categorySearchCats';

export interface Suggestion {
  id: number;
  name: string;
  cat: ItemCategory;
  crafter: CrafterCode;
  lvl: number;
  unitPrice: number;
  materialCost: number;
  profit: number;
  velocity: number;
  gilPerDay: number;
}

// Scoped craft-flip filter: this category's items, ranked by gil/day, that
// actually move and turn a profit. Mirrors the /crafts "Craft-flip" preset but
// targeted at one category and a gentler velocity floor (suggestions can be
// slower-moving than a flip play).
function categoryFilter(searchCategories: number[]): QueryFilter {
  return {
    searchCategories,
    hq: 'either',
    minDealPct: 0,
    minVelocity: 0.5,
    minPrice: null,
    maxPrice: null,
    sort: 'gilFlow',
    limit: 200,
    scope: 'home',
    maxListings: null,
    mode: 'craft',
    minGap: null,
    trainedEye: false,
  };
}

/**
 * Top untracked craftable items to add for a watchlist category, ranked by
 * gil/day. Pure: reuses runCraftFlip over the category's search categories,
 * drops anything already tracked or dismissed, and tags each with the target
 * `cat` plus its recipe's crafter/level. Returns [] for unsupported categories.
 */
export function rankSuggestions(args: {
  cat: ItemCategory;
  snapshot: SnapshotItem[];
  market: MarketData;
  recipes: Map<number, Recipe | null>;
  trackedIds: Set<number>;
  excludedIds: Set<number>;
  limit: number;
}): Suggestion[] {
  const searchCategories = searchCatsForCategory(args.cat);
  if (searchCategories.length === 0) return [];

  const rows = runCraftFlip(args.snapshot, args.market, args.recipes, categoryFilter(searchCategories));

  const out: Suggestion[] = [];
  for (const r of rows) {
    if (args.trackedIds.has(r.id) || args.excludedIds.has(r.id)) continue;
    const recipe = args.recipes.get(r.id);
    out.push({
      id: r.id,
      name: r.name,
      cat: args.cat,
      crafter: (recipe?.classJob as CrafterCode) ?? 'ANY',
      lvl: recipe?.recipeLevel ?? 1,
      unitPrice: r.unitPrice,
      materialCost: r.materialCost,
      profit: r.profit,
      velocity: r.velocity,
      gilPerDay: r.gilPerDay,
    });
    if (out.length >= args.limit) break;
  }
  return out;
}
