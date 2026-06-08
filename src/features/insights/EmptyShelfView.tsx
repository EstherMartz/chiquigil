import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runEmptyShelf } from '../queries/runEmptyShelf';
import { EmptyShelfResults } from '../queries/EmptyShelfResults';
import { defaultEmptyShelfFilter, type EmptyShelfFilter, type EmptyShelfSort, type HqMode } from '../queries/types';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { DecimalInput } from '../../components/DecimalInput';
import { useInitialScan } from '../queries/useInitialScan';

interface RunResult { saleMap: MarketData; skipped: number; filterAtRun: EmptyShelfFilter; }

function scanParamsChanged(a: EmptyShelfFilter, b: EmptyShelfFilter): boolean {
  return a.minVelocity !== b.minVelocity || a.maxListings !== b.maxListings
    || a.maxDaysSinceSale !== b.maxDaysSinceSale || a.hq !== b.hq;
}

export function EmptyShelfView() {
  const { world, hideCrystals } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const [filter, setFilter] = useState<EmptyShelfFilter>(defaultEmptyShelfFilter());
  const [sort, setSort] = useState<EmptyShelfSort>(defaultEmptyShelfFilter().sort);

  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    const out: number[] = [];
    for (const item of snapshot.data.items) {
      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;
      if (filter.hq === 'hq' && !item.canHq) continue;
      out.push(item.id);
    }
    return out;
  }, [snapshot.data, filter.hq, hideCrystals]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length, filterAtRun: filter };
    },
  });

  const rows = useMemo(() => {
    if (!snapshot.data || !run.data) return [];
    return runEmptyShelf(snapshot.data.items, run.data.saleMap, { ...run.data.filterAtRun, sort }, Date.now());
  }, [snapshot.data, run.data, sort]);

  const ready = snapshot.data != null;
  const stale = run.data != null && scanParamsChanged(run.data.filterAtRun, filter);
  useInitialScan(ready, () => { run.reset(); run.mutate(); });

  return (
    <div className="space-y-4">
      <FilterBar value={filter} onChange={setFilter} onRun={() => { run.reset(); run.mutate(); }} busy={run.isPending} notReady={!ready} stale={stale} />

      <div className="font-mono text-[10px] text-text-low">
        {snapshot.isLoading ? 'Loading item catalog…' : `${candidateIds.length.toLocaleString()} candidate items`}
        {run.data && <> · {rows.length.toLocaleString()} results</>}
      </div>

      {run.isPending && <Spinner label={`Scanning ${world} for empty shelves…`} />}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}

      {!run.data && !run.isPending && (
        <EmptyState icon="❖" message={ready ? 'Scan for sold-out items that still sell — list into the gap.' : 'Loading item catalog…'} />
      )}

      {run.data && (
        <EmptyShelfResults rows={rows} totalCandidates={candidateIds.length} skippedChunks={run.data.skipped} sort={sort} onSortChange={setSort} />
      )}
    </div>
  );
}

function FilterBar({ value, onChange, onRun, busy, notReady, stale }: {
  value: EmptyShelfFilter; onChange: (f: EmptyShelfFilter) => void; onRun: () => void; busy: boolean; notReady: boolean; stale: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min sales/day</span>
        <DecimalInput min={0} value={value.minVelocity}
          onChange={(minVelocity) => onChange({ ...value, minVelocity })}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Sold within (days)</span>
        <input type="number" inputMode="decimal" min={1} step={1} value={value.maxDaysSinceSale ?? ''}
          onChange={(e) => { const n = Number(e.target.value); onChange({ ...value, maxDaysSinceSale: Number.isFinite(n) && n > 0 ? n : null }); }}
          placeholder="∞"
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Empty threshold</span>
        <input type="number" inputMode="decimal" min={0} step={1} value={value.maxListings}
          onChange={(e) => onChange({ ...value, maxListings: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">HQ mode</span>
        <div className="flex gap-2">
          {(['nq', 'hq', 'either'] as HqMode[]).map((mode) => (
            <button key={mode} type="button" onClick={() => onChange({ ...value, hq: mode })}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${value.hq === mode ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {mode === 'either' ? 'Either' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-stretch gap-1 w-full sm:w-auto sm:ml-auto order-last">
        {stale && !busy && (
          <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80 text-right">Filters changed — Run scan to refresh</span>
        )}
        <button type="button" onClick={onRun} disabled={busy || notReady}
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
          {busy ? <>Running…<SpinGlyph /></> : 'Run scan'}
        </button>
      </div>
    </div>
  );
}
