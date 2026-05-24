import { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { fetchInBatches } from '../../lib/universalisBulk';
import sectorData from '../../data/submarineSectors.json';
import type { Sector, Indicator, LootPricerRow } from './submarineTypes';
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';

const sectors = (sectorData as { sectors: Sector[] }).sectors;

const ZONES = [...new Set(sectors.map((s) => s.zone))];

/** Exported for testing. */
export function computeIndicator(
  minPrice: number | null,
  avgPrice: number | null,
  velocity: number,
): Indicator {
  if (minPrice == null || minPrice < 100 || velocity < 1) return 'SKIP';
  if (avgPrice != null && minPrice < avgPrice * 0.8) return 'HOLD';
  return 'SELL';
}

const INDICATOR_CLASS: Record<Indicator, string> = {
  SELL: 'text-jade',
  HOLD: 'text-gold',
  SKIP: 'text-text-low',
};

type SortKey = 'name' | 'tier' | 'minPrice' | 'avgPrice' | 'velocity' | 'indicator';
type SortDir = 'asc' | 'desc';

export function LootPricer() {
  const { world } = useSettingsStore();
  const [zone, setZone] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('minPrice');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Unique loot items with zone associations
  const lootItems = useMemo(() => {
    const filtered = zone ? sectors.filter((s) => s.zone === zone) : sectors;
    const map = new Map<number, { name: string; zones: Set<string>; tier: 'common' | 'uncommon' | 'rare' }>();
    for (const s of filtered) {
      for (const item of s.loot) {
        const existing = map.get(item.itemId);
        if (existing) {
          existing.zones.add(s.zone);
        } else {
          map.set(item.itemId, { name: item.name, zones: new Set([s.zone]), tier: item.tier });
        }
      }
    }
    return map;
  }, [zone]);

  const lootIds = useMemo(() => [...lootItems.keys()], [lootItems]);

  const scan = useMutation({
    mutationFn: async () => {
      setProgress({ current: 0, total: lootIds.length });
      const result = await fetchInBatches<MarketData[string]>(
        lootIds,
        (chunk) => fetchMarketData(world, chunk),
        {
          chunkSize: 100,
          concurrency: 4,
          onProgress: (done) =>
            setProgress({ current: Math.min(done * 100, lootIds.length), total: lootIds.length }),
        },
      );
      setProgress(null);
      return { market: result.data, skipped: result.errors.length };
    },
  });

  const rows = useMemo((): LootPricerRow[] => {
    if (!scan.data) return [];
    const market = scan.data.market;
    const out: LootPricerRow[] = [];
    for (const [itemId, info] of lootItems) {
      const m = market[String(itemId)];
      const minPrice = m?.minNQ ?? null;
      const avgPrice = m?.avgNQ ?? null;
      const velocity = m?.velocity ?? 0;
      out.push({
        itemId,
        name: info.name,
        zones: [...info.zones],
        tier: info.tier,
        minPrice,
        avgPrice,
        velocity,
        indicator: computeIndicator(minPrice, avgPrice, velocity),
      });
    }
    return out;
  }, [scan.data, lootItems]);

  const sortedRows = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * mul;
      if (sortKey === 'tier') return a.tier.localeCompare(b.tier) * mul;
      if (sortKey === 'indicator') return a.indicator.localeCompare(b.indicator) * mul;
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      return (av - bv) * mul;
    });
  }, [rows, sortKey, sortDir]);

  const lm = useLoadMore(sortedRows, 25);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'tier' || key === 'indicator' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low">Zone</span>
          <select
            value={zone ?? ''}
            onChange={(e) => setZone(e.target.value || null)}
            className="mt-1 block w-44 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            <option value="">All zones</option>
            {ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => { scan.reset(); scan.mutate(); }}
          disabled={scan.isPending || lootIds.length === 0}
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {scan.isPending ? 'Scanning...' : `Run scan · ${lootIds.length} items`}
        </button>
      </div>

      {/* Progress / errors */}
      {scan.isPending && progress && (
        <ProgressBar current={progress.current} total={progress.total} label="Fetching loot prices..." />
      )}
      {scan.isError && <StatusBanner kind="error">Scan failed: {(scan.error as Error).message}</StatusBanner>}
      {scan.data && scan.data.skipped > 0 && (
        <StatusBanner kind="error">{scan.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {/* Pre-scan empty state */}
      {!scan.data && !scan.isPending && (
        <EmptyState icon="📦" message="Scan to see live prices and sell/hold/skip indicators for all submarine loot." />
      )}

      {/* Results table */}
      {scan.data && sortedRows.length > 0 && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono text-[10px] tracking-widest uppercase">
                {([
                  { key: 'name' as SortKey, label: 'Item', align: 'left' },
                  { key: 'tier' as SortKey, label: 'Tier', align: 'left', hide: true },
                  { key: 'minPrice' as SortKey, label: 'Price', align: 'right' },
                  { key: 'avgPrice' as SortKey, label: 'Avg', align: 'right', hide: true },
                  { key: 'velocity' as SortKey, label: 'Velocity', align: 'right' },
                  { key: 'indicator' as SortKey, label: 'Action', align: 'left' },
                ] as const).map((c) => {
                  const sorted = sortKey === c.key;
                  const arrow = sorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`px-3 py-2 cursor-pointer select-none ${
                        c.align === 'right' ? 'text-right' : 'text-left'
                      } ${sorted ? 'text-gold' : 'text-text-dim hover:text-aether'} ${
                        'hide' in c && c.hide ? 'hidden md:table-cell' : ''
                      }`}
                    >
                      {c.label}{arrow}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lm.visible.map((r) => (
                <tr key={r.itemId} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                  <td className="px-3 py-1.5">
                    <ItemNameLinks id={r.itemId} name={r.name} sub={r.zones.join(', ')} />
                  </td>
                  <td className="px-3 py-1.5 capitalize text-text-low hidden md:table-cell">{r.tier}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtGil(r.minPrice)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-text-low hidden md:table-cell">{fmtGil(r.avgPrice)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{r.velocity.toFixed(1)}/day</td>
                  <td className={`px-3 py-1.5 font-mono text-[10px] tracking-widest uppercase font-semibold ${INDICATOR_CLASS[r.indicator]}`}>
                    {r.indicator}
                  </td>
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

      {scan.data && sortedRows.length === 0 && (
        <EmptyState icon="📦" message="No loot items found for the selected zone." />
      )}
    </div>
  );
}
