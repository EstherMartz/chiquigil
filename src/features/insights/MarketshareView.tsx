import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useMarketData } from '../watchlist/useMarketData';
import { useRecipes } from '../profit/useRecipes';
import { STARTER_PACKS, allItemsFromEnabledPacks } from '../items/starterPacks';
import type { TrackedItem } from '../items/types';
import { buildRows } from '../watchlist/buildRows';
import { rankMarketshare } from './marketshare';
import { fmtGil } from '../../lib/format';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

export function MarketshareView() {
  const settings = useSettingsStore();
  const { starterPacks, customItems, excludedItems, perItemFlags } = useWatchlistStore();
  const [expandAll, setExpandAll] = useState(false);

  const items = useMemo(() => {
    if (expandAll) {
      const seen = new Set<number>();
      const out: TrackedItem[] = [];
      for (const pack of STARTER_PACKS) {
        for (const i of pack.items) {
          if (seen.has(i.id)) continue;
          seen.add(i.id);
          out.push(i);
        }
      }
      for (const i of customItems) {
        if (seen.has(i.id)) continue;
        seen.add(i.id);
        out.push(i);
      }
      return out;
    }
    const fromPacks = allItemsFromEnabledPacks(starterPacks, new Set(excludedItems));
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id) && !excludedItems.includes(i.id))];
  }, [expandAll, starterPacks, customItems, excludedItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, settings.world, settings.dc);
  const recipes = useRecipes(ids);

  const rows = useMemo(() => {
    if (!market.data || !recipes.data) return [];
    const watchlistRows = buildRows(
      items, market.data.phantom, market.data.dc,
      settings.retainerLevels, recipes.data, perItemFlags, Date.now(),
    );
    return rankMarketshare(watchlistRows);
  }, [items, market.data, recipes.data, settings.retainerLevels, perItemFlags]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={expandAll}
            onChange={(e) => setExpandAll(e.target.checked)}
          />
          <span>Include all starter packs (even disabled)</span>
        </label>
        <span className="font-mono text-[10px] text-text-low">
          {items.length} items in pool
        </span>
      </div>

      {(market.isLoading || recipes.isLoading) && <Spinner label="Loading market + recipe data…" />}
      {market.isError && <StatusBanner kind="error">Universalis fetch failed.</StatusBanner>}
      {recipes.isError && <StatusBanner kind="error">XIVAPI fetch failed.</StatusBanner>}

      {!market.isLoading && !recipes.isLoading && rows.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
          Nothing has any velocity in the current pool.
        </div>
      )}

      {!market.isLoading && !recipes.isLoading && rows.length > 0 && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">Unit value</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">Velocity</th>
                <th className="text-right px-3 py-2">Gil/day</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Mode</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                  <td className="px-3 py-2.5 font-mono text-text-low">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="text-text-cream">{r.name}</div>
                    <div className="font-mono text-[10px] text-text-low">{r.crafter} · {r.cat}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{fmtGil(r.unitValue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{r.velocity.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gold-hi">{fmtGil(Math.round(r.gilFlow))}</td>
                  <td className="px-3 py-2.5 text-[10px] font-mono uppercase tracking-widest text-text-low hidden md:table-cell">
                    {r.craftable ? 'profit' : 'sale-only'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
