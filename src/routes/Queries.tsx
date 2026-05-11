import { useMemo, useState } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useMutation } from '@tanstack/react-query';
import { fetchInBatches } from '../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../lib/universalis';
import { PRESETS, getPreset } from '../features/queries/presets';
import { runQuery } from '../features/queries/runQuery';
import { runCraftFlip, narrowForCraftFlip } from '../features/queries/runCraftFlip';
import { runRepost } from '../features/queries/runRepost';
import { useRecipes } from '../features/profit/useRecipes';
import { QueryBuilder } from '../features/queries/QueryBuilder';
import { QueryResults } from '../features/queries/QueryResults';
import { CraftFlipResults } from '../features/queries/CraftFlipResults';
import { RepostResults } from '../features/queries/RepostResults';
import type { QueryFilter, QueryResultRow, CraftFlipRow, RepostRow } from '../features/queries/types';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

const DEFAULT_FILTER: QueryFilter = PRESETS[0].filter;

interface PriceFetchResult {
  priceMap: MarketData;
  candidateIds: number[];
  narrowedIds: number[];
  skipped: number;
  filterAtRun: QueryFilter;
}

export default function Queries() {
  const { world, dc } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const [filter, setFilter] = useState<QueryFilter>(DEFAULT_FILTER);
  const [activePresetId, setActivePresetId] = useState<string | null>(PRESETS[0].id);

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

  const run = useMutation<PriceFetchResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      const target = filter.scope === 'home' ? world : dc;
      const result = await fetchInBatches<MarketData[string]>(
        candidateIds,
        async (chunk) => fetchMarketData(target, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      const narrowedIds = filter.mode === 'craft'
        ? narrowForCraftFlip(snapshot.data.items, result.data, filter)
        : [];
      return {
        priceMap: result.data,
        candidateIds: [...candidateIds],
        narrowedIds,
        skipped: result.errors.length,
        filterAtRun: filter,
      };
    },
  });

  const recipes = useRecipes(run.data?.narrowedIds ?? []);

  function applyPreset(id: string) {
    const p = getPreset(id);
    if (!p) return;
    setFilter(p.filter);
    setActivePresetId(id);
    run.reset();
  }

  function onFilterChange(next: QueryFilter) {
    setFilter(next);
    setActivePresetId(null);
  }

  const derived = useMemo(() => {
    if (!run.data || !snapshot.data) return null;
    const f = run.data.filterAtRun;
    switch (f.mode) {
      case 'craft': {
        if (run.data.narrowedIds.length === 0) {
          return { kind: 'craft' as const, rows: [] as CraftFlipRow[] };
        }
        if (!recipes.data) return null;
        const rows = runCraftFlip(snapshot.data.items, run.data.priceMap, recipes.data, f);
        return { kind: 'craft' as const, rows };
      }
      case 'repost': {
        const rows: RepostRow[] = runRepost(snapshot.data.items, run.data.priceMap, f);
        return { kind: 'repost' as const, rows };
      }
      case 'standard':
      default: {
        const rows: QueryResultRow[] = runQuery(snapshot.data.items, run.data.priceMap, f);
        return { kind: 'query' as const, rows };
      }
    }
  }, [run.data, recipes.data, snapshot.data]);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <h2 className="font-display text-lg text-gold tracking-wide">Best Deals Queries</h2>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
              activePresetId === p.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
            }`}
            title={p.desc}
          >
            {p.label}
          </button>
        ))}
      </div>

      {snapshot.isLoading && (
        <Spinner label={`Loading item DB (one-time, ~30s)… ${snapshot.progress.toLocaleString()} items`} />
      )}
      {snapshot.isError && (
        <StatusBanner kind="error">XIVAPI item snapshot failed: {(snapshot.error as Error).message}</StatusBanner>
      )}

      {snapshot.data && (
        <>
          <QueryBuilder
            value={filter}
            onChange={onFilterChange}
            onRun={() => run.mutate()}
            busy={run.isPending || (filter.mode === 'craft' && recipes.isLoading)}
          />
          <div className="font-mono text-[10px] text-text-low">
            {candidateIds.length.toLocaleString()} items in scope
            {run.data?.filterAtRun.mode === 'craft' && (
              <> · {run.data.narrowedIds.length.toLocaleString()} narrowed for recipe lookup</>
            )}
          </div>

          {run.isPending && <Spinner label={`Fetching prices for ${candidateIds.length} items…`} />}
          {run.isError && <StatusBanner kind="error">Query failed: {(run.error as Error).message}</StatusBanner>}
          {run.data?.filterAtRun.mode === 'craft' && recipes.isLoading && (
            <Spinner label={`Resolving ${run.data.narrowedIds.length} recipes…`} />
          )}
          {recipes.isError && <StatusBanner kind="error">XIVAPI recipe fetch failed.</StatusBanner>}

          {derived?.kind === 'query' && (
            <QueryResults
              rows={derived.rows}
              totalCandidates={candidateIds.length}
              skippedChunks={run.data?.skipped ?? 0}
            />
          )}
          {derived?.kind === 'craft' && (
            <CraftFlipResults
              rows={derived.rows}
              totalCandidates={run.data?.narrowedIds.length ?? 0}
              skippedChunks={run.data?.skipped ?? 0}
            />
          )}
          {derived?.kind === 'repost' && (
            <RepostResults
              rows={derived.rows}
              totalCandidates={candidateIds.length}
              skippedChunks={run.data?.skipped ?? 0}
            />
          )}
        </>
      )}
    </div>
  );
}
