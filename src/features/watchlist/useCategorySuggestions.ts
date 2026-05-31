import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useSelectedItems } from '../items/useSelectedItems';
import { useWatchlistStore } from '../items/watchlistStore';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData, type MarketItem } from '../../lib/universalis';
import { searchCatsForCategory } from './categorySearchCats';
import { rankSuggestions, type Suggestion } from './suggestions';
import type { ItemCategory } from '../items/types';

const SUGGESTION_LIMIT = 6;

/**
 * On-demand suggestion scan for one watchlist category. Lazy: nothing runs until
 * `run.mutate(cat)` is called (panel opened / section expanded). It narrows the
 * item snapshot to that category's search categories, bulk-fetches just those
 * items' (+ their ingredients') home-world prices, then ranks untracked
 * craftables by gil/day. Far lighter than a whole-catalog scan.
 */
export function useCategorySuggestions() {
  const { world } = useSettingsStore();
  const itemSnap = useItemSnapshot();
  const recipeSnap = useRecipeSnapshot();
  const tracked = useSelectedItems();
  const excludedItems = useWatchlistStore((s) => s.excludedItems);

  const notReady = !itemSnap.data || !recipeSnap.data;

  const run = useMutation<Suggestion[], Error, ItemCategory>({
    mutationFn: async (cat) => {
      if (!itemSnap.data || !recipeSnap.data) throw new Error('Catalogs still loading');
      const scSet = new Set(searchCatsForCategory(cat));
      if (scSet.size === 0) return [];

      const items = itemSnap.data.items;
      const recipes = recipeSnap.data;

      // Candidate ids: items in this category that have a recipe, plus their
      // ingredients (so material cost resolves).
      const ids = new Set<number>();
      for (const item of items) {
        if (!scSet.has(item.sc)) continue;
        const recipe = recipes.get(item.id);
        if (!recipe) continue;
        ids.add(item.id);
        for (const ing of recipe.ingredients) ids.add(ing.itemId);
      }
      if (ids.size === 0) return [];

      const fetched = await fetchInBatches<MarketItem>(
        [...ids],
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      const market: MarketData = fetched.data;

      return rankSuggestions({
        cat,
        snapshot: items,
        market,
        recipes,
        trackedIds: new Set(tracked.map((t) => t.id)),
        excludedIds: new Set(excludedItems),
        limit: SUGGESTION_LIMIT,
      });
    },
  });

  return { run, notReady };
}
