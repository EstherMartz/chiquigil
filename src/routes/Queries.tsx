import { useMemo, useState } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useMutation } from '@tanstack/react-query';
import { fetchInBatches } from '../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../lib/universalis';
import { PRESETS, getPreset } from '../features/queries/presets';
import { runQuery } from '../features/queries/runQuery';
import { QueryBuilder } from '../features/queries/QueryBuilder';
import { QueryResults } from '../features/queries/QueryResults';
import type { QueryFilter, QueryResultRow } from '../features/queries/types';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

const DEFAULT_FILTER: QueryFilter = PRESETS[0].filter;

export default function Queries() {
  const { dc } = useSettingsStore();
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

  const run = useMutation<{ rows: QueryResultRow[]; skipped: number }>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      const result = await fetchInBatches<MarketData[string]>(
        candidateIds,
        async (chunk) => fetchMarketData(dc, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      const rows = runQuery(snapshot.data.items, result.data, filter);
      return { rows, skipped: result.errors.length };
    },
  });

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
            busy={run.isPending}
          />
          <div className="font-mono text-[10px] text-text-low">
            {candidateIds.length.toLocaleString()} items in scope
          </div>

          {run.isPending && <Spinner label={`Fetching prices for ${candidateIds.length} items…`} />}
          {run.isError && <StatusBanner kind="error">Query failed: {(run.error as Error).message}</StatusBanner>}
          {run.data && (
            <QueryResults
              rows={run.data.rows}
              totalCandidates={candidateIds.length}
              skippedChunks={run.data.skipped}
            />
          )}
        </>
      )}
    </div>
  );
}
