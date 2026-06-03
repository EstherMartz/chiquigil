import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useSelectedItems } from '../items/useSelectedItems';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runMovers } from './runMovers';
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { CopyButton } from '../../components/CopyButton';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';
import { Spinner } from '../../components/Spinner';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import { useInitialScan } from '../queries/useInitialScan';

type SortKey = 'name' | 'price' | 'avg' | 'devPct' | 'velocity' | 'gilPerDay';
type SortDir = 'asc' | 'desc';

const MAX_CANDIDATES = 600;

export function MoversView() {
  const { dc } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const watchlistItems = useSelectedItems();
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);

  const [minVelocity, setMinVelocity] = useState(1);
  const [minDevPct, setMinDevPct] = useState(20);
  const [minPrice, setMinPrice] = useState(1000);
  const [sortKey, setSortKey] = useState<SortKey>('devPct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    const ids = new Set<number>();
    for (const item of watchlistItems) ids.add(item.id);
    const catalog = [...snapshot.data.items].filter((i) => i.sc > 0).sort((a, b) => b.ilvl - a.ilvl);
    for (const item of catalog) {
      if (ids.size >= MAX_CANDIDATES) break;
      ids.add(item.id);
    }
    return [...ids];
  }, [snapshot.data, watchlistItems]);

  const run = useMutation<{ market: MarketData; skipped: number; ranWith: { minVelocity: number; minDevPct: number; minPrice: number } }>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      setProgress({ current: 0, total: candidateIds.length });
      const res = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(dc, chunk),
        {
          chunkSize: 100, concurrency: 4,
          onProgress: (done) => setProgress({ current: Math.min(done * 100, candidateIds.length), total: candidateIds.length }),
        },
      );
      setProgress(null);
      return { market: res.data, skipped: res.errors.length, ranWith: { minVelocity, minDevPct, minPrice } };
    },
  });

  const rows = useMemo(() => {
    if (!snapshot.data || !run.data) return [];
    return runMovers(snapshot.data.items, run.data.market, { minVelocity, minDevPct, minPrice });
  }, [snapshot.data, run.data, minVelocity, minDevPct, minPrice]);

  const sortedRows = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * mul;
      return (a[sortKey] - b[sortKey]) * mul;
    });
  }, [rows, sortKey, sortDir]);

  const lm = useLoadMore(sortedRows, 25);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  const notReady = !snapshot.data;

  useInitialScan(!notReady, () => { run.reset(); run.mutate(); });

  const stale = run.data != null &&
    (run.data.ranWith.minVelocity !== minVelocity ||
     run.data.ranWith.minDevPct !== minDevPct ||
     run.data.ranWith.minPrice !== minPrice);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low">Min Δ vs avg (%)</span>
            <input type="number" inputMode="decimal" min={0} step={5} value={minDevPct}
              onChange={(e) => setMinDevPct(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 block w-32 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
          </label>
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low">Min velocity / day</span>
            <input type="number" inputMode="decimal" min={0} step={0.5} value={minVelocity}
              onChange={(e) => setMinVelocity(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 block w-32 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
          </label>
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low">Min price (gil)</span>
            <input type="number" inputMode="decimal" min={0} step={500} value={minPrice}
              onChange={(e) => setMinPrice(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 block w-32 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
          </label>
        </div>
        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          {stale && !run.isPending && (
            <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80">
              Filters changed — Run scan to refresh
            </span>
          )}
          <button
            type="button"
            onClick={() => { run.reset(); run.mutate(); }}
            disabled={run.isPending || notReady}
            title={notReady ? 'Loading item catalog…' : undefined}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity w-full sm:w-auto"
          >
            {run.isPending ? <>Scanning…<span aria-hidden className="ml-1 inline-block animate-spin">❖</span></> : 'Run scan'}
          </button>
        </div>
      </div>

      <p className="font-mono text-[10px] text-text-low">
        Items on {dc} whose current price has moved sharply from their recent average. Sort by Δ% (▼ spikes, ▲ dips) or gil/day. Scanned up to {MAX_CANDIDATES.toLocaleString()} items.
      </p>

      {run.isPending && (
        progress
          ? <ProgressBar current={progress.current} total={progress.total} label={`Scanning ${dc} market…`} />
          : <Spinner label={`Scanning ${dc} market…`} />
      )}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {!run.data && !run.isPending && (
        <EmptyState
          icon="📈"
          message={notReady
            ? 'Loading item catalog…'
            : `Scan ${dc} for items whose price is spiking or crashing right now.`}
        />
      )}
      {run.data && sortedRows.length === 0 && (
        <EmptyState icon="📈" message={`No movers above ${minDevPct}% Δ. Lower the threshold or re-scan after the market updates.`} />
      )}

      {run.data && sortedRows.length > 0 && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono text-[10px] tracking-widest uppercase">
                {([
                  { key: 'name' as SortKey, label: 'Item', align: 'left' },
                  { key: 'price' as SortKey, label: 'Now', align: 'right' },
                  { key: 'avg' as SortKey, label: 'Avg', align: 'right' },
                  { key: 'devPct' as SortKey, label: 'Δ vs avg', align: 'right' },
                  { key: 'velocity' as SortKey, label: 'Velocity', align: 'right', hideOnMobile: true },
                  { key: 'gilPerDay' as SortKey, label: 'Gil/day', align: 'right', hideOnMobile: true },
                ] as const).map((c) => {
                  const sorted = sortKey === c.key;
                  const arrow = sorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      aria-sort={sorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`px-3 py-2 cursor-pointer select-none ${c.align === 'right' ? 'text-right' : 'text-left'} ${sorted ? 'text-aether' : 'text-text-dim hover:text-aether'} ${'hideOnMobile' in c && c.hideOnMobile ? 'hidden md:table-cell' : ''}`}
                    >
                      {c.label}{arrow}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lm.visible.map((r) => (
                <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                  <td className={`px-3 ${rowY}`}>
                    <div className="flex items-center gap-2">
                      <ItemNameLinks id={r.id} name={r.name} />
                      <CopyButton text={r.name} />
                    </div>
                  </td>
                  <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.price)}</td>
                  <td className={`px-3 ${rowY} text-right font-mono text-text-dim`}>{fmtGil(r.avg)}</td>
                  <td className={`px-3 ${rowY} text-right font-mono ${r.direction === 'up' ? 'text-jade' : 'text-crimson'}`}>
                    {r.devPct >= 0 ? '+' : ''}{r.devPct.toFixed(0)}%
                  </td>
                  <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}/day</td>
                  <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{fmtGil(r.gilPerDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMoreFooter hasMore={lm.hasMore} total={lm.total} shown={lm.shown} onLoadMore={lm.loadMore} />
        </div>
      )}
    </div>
  );
}
