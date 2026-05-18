import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipes } from '../profit/useRecipes';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import {
  runMaterialFlip, narrowForMaterialFlip,
} from '../queries/runMaterialFlip';
import { MaterialFlipResults } from '../queries/MaterialFlipResults';
import { defaultMaterialFlipFilter, type MaterialFlipFilter, type MaterialFlipSort } from '../queries/types';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

const REGION = 'Europe';

interface RunResult {
  saleMap: MarketData;
  narrowedIds: number[];
  skipped: number;
  filterAtRun: MaterialFlipFilter;
}

export function MaterialFlipView() {
  const { world } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const [filter, setFilter] = useState<MaterialFlipFilter>(defaultMaterialFlipFilter());

  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
    const out: number[] = [];
    for (const item of snapshot.data.items) {
      if (catSet && !catSet.has(item.sc)) continue;
      if (filter.hq === 'hq' && !item.canHq) continue;
      out.push(item.id);
    }
    return out;
  }, [snapshot.data, filter.searchCategories, filter.hq]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(REGION, chunk),
        { chunkSize: 25, concurrency: 4 },
      );
      const narrowedIds = narrowForMaterialFlip(snapshot.data.items, sale.data, filter);
      return {
        saleMap: sale.data, narrowedIds,
        skipped: sale.errors.length, filterAtRun: filter,
      };
    },
  });

  const recipes = useRecipes(run.data?.narrowedIds ?? []);

  // Second pass: fetch region prices for the union of ingredient IDs once recipes resolve.
  const ingFetch = useMutation<{ ingMap: MarketData; ids: number[]; skipped: number }>({
    mutationFn: async () => {
      const ids = new Set<number>();
      for (const id of run.data?.narrowedIds ?? []) {
        const r = recipes.data?.get(id);
        if (!r) continue;
        for (const ing of r.ingredients) ids.add(ing.itemId);
      }
      const idArr = [...ids];
      if (idArr.length === 0) return { ingMap: {}, ids: idArr, skipped: 0 };
      const res = await fetchInBatches<MarketData[string]>(
        idArr,
        (chunk) => fetchMarketData(REGION, chunk),
        { chunkSize: 25, concurrency: 4 },
      );
      return { ingMap: res.data, ids: idArr, skipped: res.errors.length };
    },
  });

  // Auto-fire ingFetch when recipes resolve.
  useEffect(() => {
    if (recipes.data && run.data && !ingFetch.isPending && !ingFetch.data) {
      ingFetch.mutate();
    }
  }, [recipes.data, run.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!snapshot.data || !run.data || !recipes.data || !ingFetch.data) return [];
    return runMaterialFlip(
      snapshot.data.items, run.data.saleMap, ingFetch.data.ingMap,
      recipes.data, world, run.data.filterAtRun,
    );
  }, [snapshot.data, run.data, recipes.data, ingFetch.data, world]);

  function onSortChange(next: MaterialFlipSort) {
    setFilter({ ...filter, sort: next });
  }

  return (
    <div className="space-y-4">
      <FilterBar value={filter} onChange={setFilter} onRun={() => { run.reset(); ingFetch.reset(); run.mutate(); }} busy={run.isPending} notReady={!snapshot.data} />

      <div className="font-mono text-[10px] text-text-low">
        {candidateIds.length.toLocaleString()} candidate items
        {run.data && <> · {run.data.narrowedIds.length.toLocaleString()} narrowed</>}
      </div>

      {run.isPending && <Spinner label={`Fetching region prices for ${candidateIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Region fetch failed: {(run.error as Error).message}</StatusBanner>}
      {recipes.isLoading && run.data && <Spinner label={`Resolving ${run.data.narrowedIds.length} recipes…`} />}
      {ingFetch.isPending && <Spinner label="Fetching region prices for ingredients…" />}

      {rows.length >= 0 && run.data && ingFetch.data && (
        <MaterialFlipResults
          rows={rows}
          totalCandidates={run.data.narrowedIds.length}
          skippedChunks={run.data.skipped + (ingFetch.data?.skipped ?? 0)}
          sort={filter.sort}
          onSortChange={onSortChange}
        />
      )}
    </div>
  );
}

function FilterBar({ value, onChange, onRun, busy, notReady }: {
  value: MaterialFlipFilter; onChange: (f: MaterialFlipFilter) => void;
  onRun: () => void; busy: boolean; notReady: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min sale velocity</span>
        <input
          type="number" min={0} step={0.5} value={value.minVelocity}
          onChange={(e) => onChange({ ...value, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Max listings</span>
        <input
          type="number" min={0} step={1} value={value.maxListings ?? 0}
          onChange={(e) => onChange({ ...value, maxListings: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min savings/craft</span>
        <input
          type="number" min={0} step={500} value={value.minSavings}
          onChange={(e) => onChange({ ...value, minSavings: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-32 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox" checked={value.includeLightDc}
          onChange={(e) => onChange({ ...value, includeLightDc: e.target.checked })}
        />
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Include Light DC</span>
      </label>
      <button
        onClick={onRun} disabled={busy || notReady}
        title={notReady ? 'Loading item catalog…' : undefined}
        className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? 'Running…' : 'Run scan'}
      </button>
    </div>
  );
}
