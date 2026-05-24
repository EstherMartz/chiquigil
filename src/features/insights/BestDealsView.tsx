import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useMarketData } from '../watchlist/useMarketData';
import { useSelectedItems } from '../items/useSelectedItems';
import { findBestDeals } from './bestDeals';
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';

export function BestDealsView() {
  const { world, dc } = useSettingsStore();
  const [minDealPct, setMinDealPct] = useState(20);
  const items = useSelectedItems();

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);

  const rows = useMemo(() => {
    if (!market.data) return [];
    return findBestDeals(items, market.data.dc, { minDealPct });
  }, [items, market.data, minDealPct]);

  const lm = useLoadMore(rows, 25);

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
        <EmptyState icon="◇" message="No items below the discount threshold right now." />
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
              {lm.visible.map((r) => (
                <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                  <td className="px-3 py-2.5">
                    <ItemNameLinks id={r.id} name={r.name} sub={r.crafter} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.currentMin)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{fmtGil(r.averagePrice)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-jade">-{r.dealPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMoreFooter
            hasMore={lm.hasMore}
            total={lm.total}
            shown={lm.shown}
            onLoadMore={lm.loadMore}
          />
        </div>
      )}
    </div>
  );
}
