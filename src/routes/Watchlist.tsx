import { useMemo, useState } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { useWatchlistStore } from '../features/items/watchlistStore';
import { useUiStore } from '../features/ui/uiStore';
import { useMarketData } from '../features/watchlist/useMarketData';
import { useRecipes } from '../features/profit/useRecipes';
import { allItemsFromEnabledPacks } from '../features/items/starterPacks';
import { buildRows } from '../features/watchlist/buildRows';
import { filterAndSort } from '../features/watchlist/filterSort';
import { WatchlistTable } from '../features/watchlist/WatchlistTable';
import { FilterBar } from '../features/watchlist/FilterBar';
import { RecipeModal } from '../features/profit/RecipeModal';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function Watchlist() {
  const { world, dc, retainerLevels } = useSettingsStore();
  const { starterPacks, customItems, perItemFlags, setCraftIntermediates } = useWatchlistStore();
  const ui = useUiStore();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks);
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id))];
  }, [starterPacks, customItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);
  const recipes = useRecipes(ids);

  const rows = useMemo(() => {
    if (!market.data || !recipes.data) return [];
    return buildRows(
      items, market.data.phantom, market.data.dc,
      retainerLevels, recipes.data, perItemFlags, Date.now(),
    );
  }, [items, market.data, recipes.data, retainerLevels, perItemFlags]);

  const filtered = useMemo(() => filterAndSort(rows, ui), [rows, ui]);

  const selected = selectedItemId != null ? items.find((i) => i.id === selectedItemId) : undefined;
  const selectedRecipe = selected && recipes.data?.get(selected.id);

  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="flex items-center justify-between mb-3">
        <FilterBar />
        <button
          onClick={() => { market.refetch(); recipes.refetch(); }}
          disabled={market.isFetching || recipes.isFetching}
          className="font-display text-xs tracking-widest uppercase bg-bg-card-hi border border-gold text-gold px-5 py-2.5 disabled:opacity-40 hover:bg-gold hover:text-bg-deep transition-colors"
        >
          ⟳ Refresh
        </button>
      </div>
      {market.isError && (
        <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>
      )}
      {recipes.isError && (
        <StatusBanner kind="error">XIVAPI recipe fetch failed: {(recipes.error as Error).message}</StatusBanner>
      )}
      {(market.isLoading || recipes.isLoading) && (
        <div className="py-6"><Spinner label="Fetching market data + recipes…" /></div>
      )}
      {!market.isLoading && !recipes.isLoading && <WatchlistTable rows={filtered} onSelect={setSelectedItemId} />}

      {selected && selectedRecipe && market.data && (
        <RecipeModal
          item={selected}
          recipe={selectedRecipe}
          recipeMap={recipes.data!}
          phantom={market.data.phantom}
          dc={market.data.dc}
          craftIntermediates={!!perItemFlags[selected.id]?.craftIntermediates}
          onToggleCraftIntermediates={(v) => setCraftIntermediates(selected.id, v)}
          onClose={() => setSelectedItemId(null)}
        />
      )}
    </div>
  );
}
