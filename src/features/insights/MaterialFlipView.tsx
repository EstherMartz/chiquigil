import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipes } from '../profit/useRecipes';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import {
  runMaterialFlip, narrowForMaterialFlip, MATERIAL_FLIP_COMPARATORS,
} from '../queries/runMaterialFlip';
import { MaterialFlipResults } from '../queries/MaterialFlipResults';
import { defaultMaterialFlipFilter, type MaterialFlipFilter, type MaterialFlipRow, type MaterialFlipSort } from '../queries/types';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { Recipe } from '../../lib/recipes';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

const REGION = 'Europe';
const CHUNK_SIZE = 25;
const CONCURRENCY = 8;

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

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
      const total = Math.ceil(candidateIds.length / CHUNK_SIZE);
      setProgress({ done: 0, total });
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(REGION, chunk),
        {
          chunkSize: CHUNK_SIZE,
          concurrency: CONCURRENCY,
          onProgress: (done) => setProgress({ done, total }),
        },
      );
      const narrowedIds = narrowForMaterialFlip(snapshot.data.items, sale.data, filter);
      return {
        saleMap: sale.data, narrowedIds,
        skipped: sale.errors.length, filterAtRun: filter,
      };
    },
  });

  const recipes = useRecipes(run.data?.narrowedIds ?? []);

  // Streamed rows: populated as ingredient batches arrive during phase 2,
  // so the user sees the table fill in instead of waiting for the whole
  // ingredient scan to finish.
  const [streamedRows, setStreamedRows] = useState<MaterialFlipRow[]>([]);

  // Second pass: fetch region prices for the union of ingredient IDs once
  // recipes resolve. Streams rows via onChunk — each completed batch recomputes
  // any narrowed items whose ingredients are now fully present in the
  // accumulating ingMap and appends them to streamedRows.
  const ingFetch = useMutation<{ ingMap: MarketData; ids: number[]; skipped: number }>({
    mutationFn: async () => {
      if (!snapshot.data || !run.data || !recipes.data) {
        return { ingMap: {}, ids: [], skipped: 0 };
      }
      const ids = new Set<number>();
      for (const id of run.data.narrowedIds) {
        const r = recipes.data.get(id);
        if (!r) continue;
        for (const ing of r.ingredients) ids.add(ing.itemId);
      }
      const idArr = [...ids];
      if (idArr.length === 0) return { ingMap: {}, ids: idArr, skipped: 0 };

      const ingMap: MarketData = {};
      const computedIds = new Set<number>();
      const filterAtRun = run.data.filterAtRun;
      const saleMap = run.data.saleMap;
      const items = snapshot.data.items;
      const recipeMap = recipes.data;

      const res = await fetchInBatches<MarketData[string]>(
        idArr,
        (chunk) => fetchMarketData(REGION, chunk),
        {
          chunkSize: CHUNK_SIZE,
          concurrency: CONCURRENCY,
          onChunk: (chunkData) => {
            Object.assign(ingMap, chunkData);
            // Pass the growing ingMap through the existing runMaterialFlip to
            // pick up any narrowed item whose ingredients are now all present.
            // Items still missing ingredients won't appear; they'll be picked
            // up by a later chunk's recompute.
            const newRows = runMaterialFlipForReady(
              items, saleMap, ingMap, recipeMap, world, filterAtRun, computedIds,
            );
            if (newRows.length > 0) {
              setStreamedRows((prev) => [...prev, ...newRows]);
            }
          },
        },
      );
      return { ingMap: res.data, ids: idArr, skipped: res.errors.length };
    },
  });

  // Auto-fire ingFetch when recipes resolve. Reset streamedRows each time.
  useEffect(() => {
    if (recipes.data && run.data && !ingFetch.isPending && !ingFetch.data) {
      setStreamedRows([]);
      ingFetch.mutate();
    }
  }, [recipes.data, run.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render sorted streamedRows live. Once ingFetch completes, do a final
  // recompute through the canonical runMaterialFlip path (re-sorts + applies
  // limit so the final table matches the original semantics).
  const rows = useMemo(() => {
    if (!snapshot.data || !run.data || !recipes.data) return [];
    if (ingFetch.data) {
      return runMaterialFlip(
        snapshot.data.items, run.data.saleMap, ingFetch.data.ingMap,
        recipes.data, world, run.data.filterAtRun,
      );
    }
    // Streaming view: sort what we have so far by current filter.sort.
    const sorted = [...streamedRows];
    sorted.sort((a, b) => MATERIAL_FLIP_COMPARATORS[run.data!.filterAtRun.sort](a, b));
    return sorted;
  }, [snapshot.data, run.data, recipes.data, ingFetch.data, world, streamedRows]);

  function onSortChange(next: MaterialFlipSort) {
    setFilter({ ...filter, sort: next });
  }

  return (
    <div className="space-y-4">
      <FilterBar value={filter} onChange={setFilter} onRun={() => { run.reset(); ingFetch.reset(); setProgress(null); run.mutate(); }} busy={run.isPending} notReady={!snapshot.data} />

      <div className="font-mono text-[10px] text-text-low">
        {candidateIds.length.toLocaleString()} candidate items
        {run.data && <> · {run.data.narrowedIds.length.toLocaleString()} narrowed</>}
      </div>

      {run.isPending && (
        <Spinner label={
          progress
            ? `Fetching region prices — batch ${progress.done}/${progress.total} (${candidateIds.length} items)`
            : `Fetching region prices for ${candidateIds.length} items…`
        } />
      )}
      {run.isError && <StatusBanner kind="error">Region fetch failed: {(run.error as Error).message}</StatusBanner>}
      {recipes.isLoading && run.data && <Spinner label={`Resolving ${run.data.narrowedIds.length} recipes…`} />}
      {ingFetch.isPending && (
        <Spinner label={
          streamedRows.length > 0
            ? `Streaming results — ${streamedRows.length} rows so far`
            : 'Fetching region prices for ingredients…'
        } />
      )}

      {run.data && (ingFetch.data || rows.length > 0) && (
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

/**
 * Streaming helper: run the canonical material-flip compute, but only emit
 * rows for items NOT yet computed and whose ingredients are all present in
 * the (growing) ingMap. Mutates `computedIds` to record what we just emitted.
 */
function runMaterialFlipForReady(
  snapshot: SnapshotItem[],
  saleMap: MarketData,
  ingMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
  world: string,
  filter: MaterialFlipFilter,
  computedIds: Set<number>,
): MaterialFlipRow[] {
  const ready: SnapshotItem[] = [];
  for (const item of snapshot) {
    if (computedIds.has(item.id)) continue;
    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;
    let allPresent = true;
    for (const ing of recipe.ingredients) {
      if (!ingMap[ing.itemId]) { allPresent = false; break; }
    }
    if (!allPresent) continue;
    ready.push(item);
  }
  if (ready.length === 0) return [];
  // Compute via the canonical path so filter/sort logic stays in one place.
  // runMaterialFlip applies its own sort + limit; we slice limit later at
  // render time after merging the stream.
  const rows = runMaterialFlip(ready, saleMap, ingMap, recipeMap, world, { ...filter, limit: Number.POSITIVE_INFINITY });
  for (const r of rows) computedIds.add(r.id);
  // Also mark items that passed `ready` but didn't make it through narrow
  // (e.g. minSavings filter rejected them) — so we don't retry them on every
  // chunk.
  for (const item of ready) computedIds.add(item.id);
  return rows;
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
