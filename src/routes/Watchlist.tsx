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
import { valuationMap } from '../features/dashboard/aggregate';
import type { HistorySummary } from '../features/fairvalue/fairValue';
import { filterAndSort } from '../features/watchlist/filterSort';
import { WatchlistTable } from '../features/watchlist/WatchlistTable';
import { SuggestionStrip } from '../features/watchlist/SuggestionStrip';
import { FilterBar } from '../features/watchlist/FilterBar';
import { RecipeModal } from '../features/profit/RecipeModal';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';
import { btnPrimaryLarge } from '../components/buttonStyles';

export default function Watchlist() {
  const { world, dc, retainerLevels, defaultCraftTimeSeconds, showSparklines, applyMarketTax } = useSettingsStore();
  const { perItemFlags, setCraftIntermediates, setCraftTime } = useWatchlistStore();
  const ui = useUiStore();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const items = useSelectedItems();

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  // Live: watchlist items may sell too slowly to be in the cron's "traded" bulk blob,
  // so fetch their prices straight from Universalis (small, user-specific set).
  const market = useMarketData(ids, world, dc, undefined, { live: true });
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
      retainerLevels, recipes.data, perItemFlags, Date.now(), applyMarketTax,
    );
  }, [items, market.data, recipes.data, retainerLevels, perItemFlags, applyMarketTax]);

  const rowsWithDelta = useMemo(() =>
    rows.map((r) => ({ ...r, delta: history.data?.get(r.id)?.delta ?? null })),
  [rows, history.data]);

  const filtered = useMemo(() => filterAndSort(rowsWithDelta, ui), [rowsWithDelta, ui]);

  // Per-category tab counts (all tracked rows, ignoring the active filter/search)
  // so each tab advertises how many items it holds — see FilterBar.
  const catCounts = useMemo(() => {
    const m: Record<string, number> = { All: rowsWithDelta.length };
    for (const r of rowsWithDelta) m[r.cat] = (m[r.cat] ?? 0) + 1;
    return m;
  }, [rowsWithDelta]);

  // Fair-value chip per row: cheap/rich (confident only), from the same history
  // fetch used for the trend delta. Shared with the dashboard so they agree.
  const summaryById = useMemo(() => {
    const m = new Map<number, HistorySummary>();
    if (history.data) for (const [id, h] of history.data) m.set(id, h.summary);
    return m;
  }, [history.data]);
  const valuationById = useMemo(() => valuationMap(filtered, summaryById), [filtered, summaryById]);

  const selected = selectedItemId != null ? items.find((i) => i.id === selectedItemId) : undefined;
  const selectedRecipe = selected && recipes.data?.get(selected.id);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <FilterBar counts={catCounts} />
        <button
          onClick={() => { market.refetch(); recipes.refetch(); }}
          disabled={market.isFetching || recipes.isFetching}
          className={`${btnPrimaryLarge} w-full sm:w-auto sm:ml-auto`}
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
        <>
          <SuggestionStrip category={ui.catFilter} />
          <WatchlistTable
            rows={filtered}
            onSelect={setSelectedItemId}
            sparklineMap={showSparklines ? sparklineHistory.data : undefined}
            sparklineLoading={sparklineHistory.isLoading}
            applyMarketTax={applyMarketTax}
            valuationById={valuationById}
          />
        </>
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
