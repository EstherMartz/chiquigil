import { useMemo, useState } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { useWatchlistStore } from '../features/items/watchlistStore';
import { useUiStore } from '../features/ui/uiStore';
import { useMarketData } from '../features/watchlist/useMarketData';
import { useWatchlistHistory } from '../features/watchlist/useWatchlistHistory';
import { useSparklineHistory } from '../features/sparklines/useSparklineHistory';
import { useRecipes } from '../features/profit/useRecipes';
import { useItemNames } from '../features/profit/useItemNames';
import { useSelectedItems } from '../features/items/useSelectedItems';
import { buildRows } from '../features/watchlist/buildRows';
import { filterAndSort } from '../features/watchlist/filterSort';
import { WatchlistTable } from '../features/watchlist/WatchlistTable';
import { FilterBar } from '../features/watchlist/FilterBar';
import { RecipeModal } from '../features/profit/RecipeModal';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';
import { btnPrimaryLarge } from '../components/buttonStyles';

export default function Watchlist() {
  const { world, dc, retainerLevels, defaultCraftTimeSeconds, showSparklines } = useSettingsStore();
  const { perItemFlags, setCraftIntermediates, setCraftTime } = useWatchlistStore();
  const ui = useUiStore();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const items = useSelectedItems();

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);
  const history = useWatchlistHistory(ids, dc);
  const sparklineHistory = useSparklineHistory(ids, world, showSparklines);
  const recipes = useRecipes(ids);

  const ingredientIds = useMemo(() => {
    if (!recipes.data) return [];
    const out = new Set<number>();
    for (const recipe of recipes.data.values()) {
      if (!recipe) continue;
      for (const ing of recipe.ingredients) out.add(ing.itemId);
    }
    return [...out];
  }, [recipes.data]);

  const allNameIds = useMemo(
    () => [...new Set([...ids, ...ingredientIds])],
    [ids, ingredientIds],
  );

  const names = useItemNames(allNameIds);

  const rows = useMemo(() => {
    if (!market.data || !recipes.data) return [];
    return buildRows(
      items, market.data.phantom, market.data.dc,
      retainerLevels, recipes.data, perItemFlags, Date.now(),
    );
  }, [items, market.data, recipes.data, retainerLevels, perItemFlags]);

  const rowsWithDelta = useMemo(() =>
    rows.map((r) => ({ ...r, delta: history.data?.get(r.id) ?? null })),
  [rows, history.data]);

  const filtered = useMemo(() => filterAndSort(rowsWithDelta, ui), [rowsWithDelta, ui]);

  const selected = selectedItemId != null ? items.find((i) => i.id === selectedItemId) : undefined;
  const selectedRecipe = selected && recipes.data?.get(selected.id);

  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="flex items-center justify-between mb-3">
        <FilterBar />
        <button
          onClick={() => { market.refetch(); recipes.refetch(); }}
          disabled={market.isFetching || recipes.isFetching}
          className={btnPrimaryLarge}
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
      {!market.isLoading && !recipes.isLoading && (
        <WatchlistTable
          rows={filtered}
          onSelect={setSelectedItemId}
          sparklineMap={showSparklines ? sparklineHistory.data : undefined}
          sparklineLoading={sparklineHistory.isLoading}
        />
      )}

      {selected && selectedRecipe && market.data && (
        <RecipeModal
          item={selected}
          recipe={selectedRecipe}
          recipeMap={recipes.data!}
          nameMap={names.data ?? new Map()}
          phantom={market.data.phantom}
          dc={market.data.dc}
          craftIntermediates={!!perItemFlags[selected.id]?.craftIntermediates}
          onToggleCraftIntermediates={(v) => setCraftIntermediates(selected.id, v)}
          craftTimeSeconds={perItemFlags[selected.id]?.craftTimeSeconds}
          defaultCraftTimeSeconds={defaultCraftTimeSeconds}
          onChangeCraftTime={(v) => setCraftTime(selected.id, v ?? 0)}
          onClose={() => setSelectedItemId(null)}
          historyScope={dc}
        />
      )}
    </div>
  );
}
