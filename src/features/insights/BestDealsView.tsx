import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useMarketData } from '../watchlist/useMarketData';
import { allItemsFromEnabledPacks } from '../items/starterPacks';
import { findBestDeals } from './bestDeals';
import { fmtGil } from '../../lib/format';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

export function BestDealsView() {
  const { world, dc } = useSettingsStore();
  const { starterPacks, customItems, excludedItems } = useWatchlistStore();
  const [minDealPct, setMinDealPct] = useState(20);

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks, new Set(excludedItems));
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id) && !excludedItems.includes(i.id))];
  }, [starterPacks, customItems, excludedItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);

  const rows = useMemo(() => {
    if (!market.data) return [];
    return findBestDeals(items, market.data.dc, { minDealPct });
  }, [items, market.data, minDealPct]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min discount (%)</span>
          <input
            type="number" min={0} max={99}
            value={minDealPct}
            onChange={(e) => setMinDealPct(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
            className="mt-1 block w-32 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>
        <span className="font-mono text-[10px] text-text-low">
          Compares current DC min vs Universalis average price.
        </span>
      </div>

      {market.isError && <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>}
      {market.isLoading && <Spinner label="Fetching DC market data…" />}

      {!market.isLoading && rows.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
          No items below the discount threshold right now.
        </div>
      )}

      {!market.isLoading && rows.length > 0 && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Current</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">Average</th>
                <th className="text-right px-3 py-2">Discount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                  <td className="px-3 py-2.5">
                    <div className="text-text-cream">{r.name}</div>
                    <div className="font-mono text-[10px] text-text-low">{r.crafter}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.currentMin)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{fmtGil(r.averagePrice)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-jade">-{r.dealPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
