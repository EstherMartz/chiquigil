import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from './useItemSnapshot';
import { useMutation } from '@tanstack/react-query';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { PRESETS, getPreset } from './presets';
import { runQuery } from './runQuery';
import { runCraftFlip, narrowForCraftFlip } from './runCraftFlip';
import { runRepost } from './runRepost';
import { useRecipes } from '../profit/useRecipes';
import { useGatheringCatalog } from './useGatheringCatalog';
import { QueryBuilder } from './QueryBuilder';
import { QueryResults } from './QueryResults';
import { CraftFlipResults } from './CraftFlipResults';
import { RepostResults } from './RepostResults';
import type { QueryFilter, QueryResultRow, CraftFlipRow, RepostRow, PresetCategory } from './types';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { InfoTooltip } from '../../components/InfoTooltip';
import { filterToParams, paramsToFilter } from '../../lib/queryUrlParams';

interface PriceFetchResult {
  priceMap: MarketData;
  candidateIds: number[];
  narrowedIds: number[];
  skipped: number;
  filterAtRun: QueryFilter;
}

interface Props {
  category: PresetCategory;
  heading?: string;
  onRowsChange?: (rows: QueryResultRow[]) => void;
  /** Pre-select a preset on first mount (e.g., via `?preset=top-food` deep-link). */
  initialPresetId?: string;
}

export function QueriesView({ category, heading, onRowsChange, initialPresetId }: Props) {
  const { world, dc } = useSettingsStore();
  const [params, setParams] = useSearchParams();
  const snapshot = useItemSnapshot();
  const isGathering = category === 'gathering';
  const gatheringCatalog = useGatheringCatalog();
  const catalogReady = !isGathering || gatheringCatalog.data != null;

  const presets = useMemo(() => PRESETS.filter((p) => p.category === category), [category]);
  const initialPreset = (initialPresetId && presets.find((p) => p.id === initialPresetId)) || presets[0];
  const [filter, setFilter] = useState<QueryFilter>(() => paramsToFilter(params, initialPreset.filter));
  const [activePresetId, setActivePresetId] = useState<string | null>(initialPreset.id);

  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
    const gatherSet = isGathering ? gatheringCatalog.data : null;
    const out: number[] = [];
    for (const item of snapshot.data.items) {
      if (catSet && !catSet.has(item.sc)) continue;
      if (filter.hq === 'hq' && !item.canHq) continue;
      if (gatherSet && !gatherSet.has(item.id)) continue;
      out.push(item.id);
    }
    return out;
  }, [snapshot.data, filter.searchCategories, filter.hq, isGathering, gatheringCatalog.data]);

  const run = useMutation<PriceFetchResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      const target = filter.scope === 'home' ? world : dc;
      const result = await fetchInBatches<MarketData[string]>(
        candidateIds,
        async (chunk) => fetchMarketData(target, chunk),
        { chunkSize: 25, concurrency: 4 },
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

  // Sync filter to URL params
  useEffect(() => {
    const next = filterToParams(filter);
    if (activePresetId) next.set('preset', activePresetId);
    setParams(next, { replace: true });
  }, [filter, activePresetId, setParams]);

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

  useEffect(() => {
    if (!onRowsChange) return;
    if (derived?.kind === 'query') onRowsChange(derived.rows);
    else onRowsChange([]);
  }, [derived, onRowsChange]);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      {heading && <h2 className="font-display text-lg text-gold tracking-wide">{heading}</h2>}

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <InfoTooltip key={p.id} label={p.desc}>
            <button
              onClick={() => applyPreset(p.id)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
                activePresetId === p.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              {p.label}
            </button>
          </InfoTooltip>
        ))}
      </div>

      {snapshot.isLoading && (
        <Spinner label={`Loading item DB (one-time, ~30s)… ${snapshot.progress.toLocaleString()} items`} />
      )}
      {snapshot.isError && (
        <StatusBanner kind="error">XIVAPI item snapshot failed: {(snapshot.error as Error).message}</StatusBanner>
      )}
      {isGathering && gatheringCatalog.isLoading && (
        <Spinner label={`Building gathering catalog (one-time)… ${gatheringCatalog.progress || 'starting'}`} />
      )}
      {isGathering && gatheringCatalog.isError && (
        <StatusBanner kind="error">Gathering catalog failed: {(gatheringCatalog.error as Error).message}</StatusBanner>
      )}

      {snapshot.data && catalogReady && (
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
              gatheringCatalog={isGathering ? gatheringCatalog.data : undefined}
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
