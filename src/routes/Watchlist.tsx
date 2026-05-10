import { useMemo } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { useWatchlistStore } from '../features/items/watchlistStore';
import { useUiStore } from '../features/ui/uiStore';
import { useMarketData } from '../features/watchlist/useMarketData';
import { allItemsFromEnabledPacks } from '../features/items/starterPacks';
import { buildRows } from '../features/watchlist/buildRows';
import { filterAndSort } from '../features/watchlist/filterSort';
import { WatchlistTable } from '../features/watchlist/WatchlistTable';
import { FilterBar } from '../features/watchlist/FilterBar';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function Watchlist() {
  const { world, dc, retainerLevels } = useSettingsStore();
  const { starterPacks, customItems } = useWatchlistStore();
  const ui = useUiStore();

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks);
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id))];
  }, [starterPacks, customItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);

  const rows = useMemo(() => {
    if (!market.data) return [];
    return buildRows(items, market.data.phantom, market.data.dc, retainerLevels, new Map(), {}, Date.now());
  }, [items, market.data, retainerLevels]);

  const filtered = useMemo(() => filterAndSort(rows, ui), [rows, ui]);

  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="flex items-center justify-between mb-3">
        <FilterBar />
        <button
          onClick={() => market.refetch()}
          disabled={market.isFetching}
          className="font-display text-xs tracking-widest uppercase bg-bg-card-hi border border-gold text-gold px-5 py-2.5 disabled:opacity-40 hover:bg-gold hover:text-bg-deep transition-colors"
        >
          ⟳ Refresh
        </button>
      </div>
      {market.isError && (
        <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>
      )}
      {market.isLoading && <div className="py-6"><Spinner label="Fetching Phantom + DC market data…" /></div>}
      {!market.isLoading && <WatchlistTable rows={filtered} />}
    </div>
  );
}
