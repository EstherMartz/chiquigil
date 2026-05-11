import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useMarketData } from '../watchlist/useMarketData';
import { allItemsFromEnabledPacks } from '../items/starterPacks';
import { findArbitrage } from './arbitrage';
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

export function ArbitrageView() {
  const { world, dc } = useSettingsStore();
  const { starterPacks, customItems, excludedItems } = useWatchlistStore();
  const [minSpread, setMinSpread] = useState(10_000);

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks, new Set(excludedItems));
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id) && !excludedItems.includes(i.id))];
  }, [starterPacks, customItems, excludedItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);

  const rows = useMemo(() => {
    if (!market.data) return [];
    return findArbitrage(items, market.data.dc, { homeWorld: world, minSpread });
  }, [items, market.data, world, minSpread]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min spread (gil)</span>
          <input
            type="number" min={0} step={1000}
            value={minSpread}
            onChange={(e) => setMinSpread(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 block w-40 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>
        <span className="font-mono text-[10px] text-text-low">
          Home world: <span className="text-gold">{world}</span>
        </span>
      </div>

      {market.isError && <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>}
      {market.isLoading && <Spinner label="Fetching DC market data…" />}

      {!market.isLoading && rows.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
          No arbitrage opportunities at this threshold.
        </div>
      )}

      {!market.isLoading && rows.length > 0 && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">{world} price</th>
                <th className="text-left px-3 py-2">Cheapest other</th>
                <th className="text-right px-3 py-2">Their price</th>
                <th className="text-right px-3 py-2">Spread</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                  <td className="px-3 py-2.5">
                    <ItemNameLinks id={r.id} name={r.name} sub={r.crafter} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.homePrice)}</td>
                  <td className="px-3 py-2.5 text-aether">{r.cheapestOther.world}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.cheapestOther.price)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-jade">+{fmtGil(r.spread)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{r.spreadPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
