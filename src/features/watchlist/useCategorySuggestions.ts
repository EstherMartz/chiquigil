import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { useSelectedItems } from '../items/useSelectedItems';
import { useWatchlistStore } from '../items/watchlistStore';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData, type MarketItem } from '../../lib/universalis';
import { searchCatsForCategory } from './categorySearchCats';
import { rankSuggestions, type Suggestion, type SuggestionMode } from './suggestions';
import type { ItemCategory } from '../items/types';

const SUGGESTION_LIMIT = 6;

interface ScanArgs { cat: ItemCategory; mode: SuggestionMode }

/**
 * On-demand suggestion scan for one watchlist category + mode (craft / vendor /
 * gather). Lazy: nothing runs until `run.mutate({ cat, mode })`. It narrows the
 * snapshot to the category's search categories (filtered by what the mode can
 * source), bulk-fetches just those items' (+ craft ingredients') home-world
 * prices, then ranks untracked plays by gil/day. Far lighter than a
 * whole-catalog scan.
 */
export function useCategorySuggestions() {
  const { world } = useSettingsStore();
  const itemSnap = useItemSnapshot();
  const recipeSnap = useRecipeSnapshot();
  const vendorSnap = useVendorShopSnapshot();
  const gatherSnap = useGatheringCatalog();
  const tracked = useSelectedItems();
  const excludedItems = useWatchlistStore((s) => s.excludedItems);

  const notReady = !itemSnap.data || !recipeSnap.data;

  const run = useMutation<Suggestion[], Error, ScanArgs>({
    mutationFn: async ({ cat, mode }) => {
      if (!itemSnap.data || !recipeSnap.data) throw new Error('Catalogs still loading');
      const scSet = new Set(searchCatsForCategory(cat));
      if (scSet.size === 0) return [];

      const items = itemSnap.data.items;
      const recipes = recipeSnap.data;
      const vendorMap = vendorSnap.data?.snapshot;
      const gatherableIds = gatherSnap.data ? new Set(gatherSnap.data.keys()) : undefined;

      // Candidate ids depend on mode; include craft ingredients so cost resolves.
      const ids = new Set<number>();
      for (const item of items) {
        if (!scSet.has(item.sc)) continue;
        if (mode === 'craft') {
          const recipe = recipes.get(item.id);
          if (!recipe) continue;
          ids.add(item.id);
          for (const ing of recipe.ingredients) ids.add(ing.itemId);
        } else if (mode === 'vendor') {
          if (vendorMap?.has(item.id)) ids.add(item.id);
        } else { // gather
          if (gatherableIds?.has(item.id) && !recipes.has(item.id)) ids.add(item.id);
        }
      }
      if (ids.size === 0) return [];

      const fetched = await fetchInBatches<MarketItem>(
        [...ids],
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      const market: MarketData = fetched.data;

      return rankSuggestions({
        cat, mode, snapshot: items, market, recipes,
        trackedIds: new Set(tracked.map((t) => t.id)),
        excludedIds: new Set(excludedItems),
        limit: SUGGESTION_LIMIT,
        vendorMap,
        gatherableIds,
      });
    },
  });

  return { run, notReady };
}
