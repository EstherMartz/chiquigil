import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from './useItemSnapshot';
import { useSparklineHistory } from '../sparklines/useSparklineHistory';
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
import { useInitialScan } from './useInitialScan';
import { CraftFlipResults } from './CraftFlipResults';
import { RepostResults } from './RepostResults';
import type { QueryFilter, QueryResultRow, CraftFlipRow, RepostRow, PresetCategory } from './types';
import { Spinner } from '../../components/Spinner';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusBanner } from '../../components/StatusBanner';
import { InfoTooltip } from '../../components/InfoTooltip';
import { filterToParams, paramsToFilter } from '../../lib/queryUrlParams';
import { filterHash } from './types';
import { passesMaxRisk } from './craftListingAnalysis';
import { CRYSTALS_SEARCH_CATEGORY } from './commonFilters';

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
  const { world, dc, retainerLevels, hideCrystals, showSparklines } = useSettingsStore();
  const [params, setParams] = useSearchParams();
  const snapshot = useItemSnapshot();
  const isGathering = category === 'gathering';
  const gatheringCatalog = useGatheringCatalog();
  const catalogReady = !isGathering || gatheringCatalog.data != null;

  const presets = useMemo(() => PRESETS.filter((p) => p.category === category), [category]);
  const initialPreset = (initialPresetId && presets.find((p) => p.id === initialPresetId)) || presets[0];
  const [filter, setFilter] = useState<QueryFilter>(() => paramsToFilter(params, initialPreset.filter));
  const [activePresetId, setActivePresetId] = useState<string | null>(initialPreset.id);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const candidateIdsFor = useMemo(() => {
    return (f: QueryFilter): number[] => {
      if (!snapshot.data) return [];
      const catSet = f.searchCategories.length ? new Set(f.searchCategories) : null;
      const gatherSet = isGathering ? gatheringCatalog.data : null;
      const out: number[] = [];
      for (const item of snapshot.data.items) {
        if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;
        if (catSet && !catSet.has(item.sc)) continue;
        if (f.hq === 'hq' && !item.canHq) continue;
        if (gatherSet && !gatherSet.has(item.id)) continue;
        out.push(item.id);
      }
      return out;
    };
  }, [snapshot.data, isGathering, gatheringCatalog.data, hideCrystals]);

  const candidateIds = useMemo(
    () => candidateIdsFor(filter),
    [candidateIdsFor, filter],
  );

  const run = useMutation<PriceFetchResult, Error, QueryFilter | undefined>({
    mutationFn: async (override?: QueryFilter) => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      const f = override ?? filter;
      const ids = override ? candidateIdsFor(override) : candidateIds;
      const target = f.scope === 'home' ? world : dc;
      setProgress({ current: 0, total: ids.length });
      const result = await fetchInBatches<MarketData[string]>(
        ids,
        async (chunk) => fetchMarketData(target, chunk),
        {
          chunkSize: 25,
          concurrency: 4,
          onProgress: (done) => setProgress({ current: Math.min(done * 25, ids.length), total: ids.length }),
        },
      );
      const narrowedIds = f.mode === 'craft'
        ? narrowForCraftFlip(snapshot.data.items, result.data, f)
        : [];
      return {
        priceMap: result.data,
        candidateIds: [...ids],
        narrowedIds,
        skipped: result.errors.length,
        filterAtRun: f,
      };
    },
  });

  const recipes = useRecipes(run.data?.narrowedIds ?? []);

  const ready = snapshot.data != null && catalogReady;

  // Stale only when a *scan-affecting* input changed. maxRisk is a display-only
  // post-scan filter and is intentionally excluded from filterHash, so changing
  // it never marks results stale.
  const stale = run.data != null && filterHash(run.data.filterAtRun) !== filterHash(filter);

  useInitialScan(ready, () => run.mutate(undefined));

  const derived = useMemo(() => {
    if (!run.data || !snapshot.data) return null;
    const f = run.data.filterAtRun;
    switch (f.mode) {
      case 'craft': {
        if (run.data.narrowedIds.length === 0) {
          return { kind: 'craft' as const, rows: [] as CraftFlipRow[] };
        }
        if (!recipes.data) return null;
        const rows = runCraftFlip(snapshot.data.items, run.data.priceMap, recipes.data, f, retainerLevels);
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

  const visibleCraftRows = useMemo(() => {
    if (derived?.kind !== 'craft') return [];
    const max = filter.maxRisk ?? 'any';
    if (max === 'any') return derived.rows;
    return derived.rows.filter((r) => passesMaxRisk(r.risk, max));
  }, [derived, filter.maxRisk]);

  const sparklineIds = useMemo(() => {
    if (!run.data) return [];
    if (derived?.kind === 'query') return derived.rows.map((r) => r.id);
    if (derived?.kind === 'craft') return derived.rows.map((r) => r.id);
    return [];
  }, [run.data, derived]);

  const sparklineHistory = useSparklineHistory(sparklineIds, world, showSparklines);

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
    setProgress(null);
    // A preset is a curated default — show its results immediately.
    run.mutate(p.filter);
  }

  function onFilterChange(next: QueryFilter) {
    setFilter(next);
    setActivePresetId(null);
  }

  useEffect(() => {
    if (!onRowsChange) return;
    if (derived?.kind === 'query') onRowsChange(derived.rows);
    else onRowsChange([]);
  }, [derived, onRowsChange]);

  return (
    <div className="space-y-4">
      {heading && <h2 className="font-display text-lg text-gold tracking-wide">{heading}</h2>}

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <InfoTooltip key={p.id} label={p.desc}>
            <button
              onClick={() => applyPreset(p.id)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
                activePresetId === p.id ? 'border-aether text-aether' : 'border-border-base text-text-dim hover:text-aether'
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
            onRun={() => run.mutate(undefined)}
            busy={run.isPending || (filter.mode === 'craft' && recipes.isLoading)}
            stale={stale}
          />
          <div className="font-mono text-[10px] text-text-low">
            {candidateIds.length.toLocaleString()} items in scope
            {run.data?.filterAtRun.mode === 'craft' && (
              <> · {run.data.narrowedIds.length.toLocaleString()} narrowed for recipe lookup</>
            )}
          </div>

          {run.isPending && (
            progress
              ? <ProgressBar current={progress.current} total={progress.total} label="Fetching prices…" />
              : <Spinner label={`Fetching prices for ${candidateIds.length} items…`} />
          )}
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
              sparklineMap={showSparklines ? sparklineHistory.data : undefined}
              sparklineLoading={sparklineHistory.isLoading}
            />
          )}
          {derived?.kind === 'craft' && (
            <CraftFlipResults
              rows={visibleCraftRows}
              totalCandidates={run.data?.narrowedIds.length ?? 0}
              skippedChunks={run.data?.skipped ?? 0}
              scope={run.data?.filterAtRun.scope ?? 'home'}
              sparklineMap={showSparklines ? sparklineHistory.data : undefined}
              sparklineLoading={sparklineHistory.isLoading}
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
