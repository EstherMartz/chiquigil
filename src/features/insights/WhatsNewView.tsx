import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useWhatsNewSnapshot } from '../queries/useWhatsNewSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runWhatsNew } from '../queries/runWhatsNew';
import { WhatsNewResults } from '../queries/WhatsNewResults';
import { defaultWhatsNewFilter, type WhatsNewFilter, type WhatsNewSort, type WhatsNewTab } from '../queries/types';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { useInitialScan } from '../queries/useInitialScan';
import type { SnapshotItem } from '../../lib/itemSnapshot';

interface RunResult { saleMap: MarketData; skipped: number; tabAtRun: WhatsNewTab; }

export function WhatsNewView() {
  const { world } = useSettingsStore();
  const itemSnap = useItemSnapshot();
  const recipeSnap = useRecipeSnapshot();
  const whatsNew = useWhatsNewSnapshot();
  const [filter, setFilter] = useState<WhatsNewFilter>(defaultWhatsNewFilter());
  const [sort, setSort] = useState<WhatsNewSort>(defaultWhatsNewFilter().sort);

  const itemsById = useMemo(() => {
    const m = new Map<number, SnapshotItem>();
    if (itemSnap.data) for (const it of itemSnap.data.items) m.set(it.id, it);
    return m;
  }, [itemSnap.data]);

  const recipeKeys = useMemo(
    () => new Set<number>(recipeSnap.data ? [...recipeSnap.data.keys()] : []),
    [recipeSnap.data],
  );

  const activeIds = useMemo(() => {
    if (!whatsNew.data) return [];
    return filter.tab === 'items' ? whatsNew.data.newItems : whatsNew.data.newRecipeItems;
  }, [whatsNew.data, filter.tab]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      const sale = await fetchInBatches<MarketData[string]>(
        activeIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length, tabAtRun: filter.tab };
    },
  });

  const rows = useMemo(() => {
    if (!run.data) return [];
    return runWhatsNew(activeIds, itemsById, run.data.saleMap, recipeKeys, { ...filter, sort }, Date.now());
  }, [run.data, activeIds, itemsById, recipeKeys, filter, sort]);

  const ready = itemSnap.data != null && whatsNew.data != null;
  const tabStale = run.data != null && run.data.tabAtRun !== filter.tab;
  useInitialScan(ready, () => { run.reset(); run.mutate(); });

  const patchDate = whatsNew.data?.bakedAt ? new Date(whatsNew.data.bakedAt).toISOString().slice(0, 10) : null;
  const count = activeIds.length;

  return (
    <div className="space-y-4">
      {patchDate && (
        <div className="font-mono text-[11px] tracking-widest uppercase text-text-low">
          {count.toLocaleString()} new {filter.tab === 'items' ? 'items' : 'recipes'} since the {patchDate} update
        </div>
      )}

      <TabBar
        tab={filter.tab}
        onTab={(tab) => { setFilter({ ...filter, tab }); run.reset(); run.mutate(); }}
        filter={filter}
        onChange={setFilter}
        onRun={() => { run.reset(); run.mutate(); }}
        busy={run.isPending}
        notReady={!ready}
        stale={tabStale}
      />

      {run.isPending && <Spinner label={`Checking ${world} market for new ${filter.tab}…`} />}
      {run.isError && <StatusBanner kind="error">Lookup failed: {(run.error as Error).message}</StatusBanner>}

      {!run.data && !run.isPending && (
        <EmptyState icon="✦" message={ready ? "Loading the patch's new entries…" : 'Loading catalog…'} />
      )}

      {run.data && (
        <WhatsNewResults
          rows={rows}
          totalCandidates={count}
          skippedChunks={run.data.skipped}
          tab={filter.tab}
          sort={sort}
          onSortChange={setSort}
        />
      )}
    </div>
  );
}

function TabBar({ tab, onTab, filter, onChange, onRun, busy, notReady, stale }: {
  tab: WhatsNewTab; onTab: (t: WhatsNewTab) => void;
  filter: WhatsNewFilter; onChange: (f: WhatsNewFilter) => void;
  onRun: () => void; busy: boolean; notReady: boolean; stale: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Show</span>
        <div className="flex gap-2">
          {(['items', 'recipes'] as WhatsNewTab[]).map((t) => (
            <button key={t} type="button" onClick={() => onTab(t)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${tab === t ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {t === 'items' ? 'New items' : 'New recipes'}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min sales/day</span>
        <input type="number" inputMode="decimal" min={0} step={0.1} value={filter.minVelocity}
          onChange={(e) => onChange({ ...filter, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <label className="flex items-center gap-2 pb-2">
        <input type="checkbox" checked={filter.tradeableOnly}
          onChange={(e) => onChange({ ...filter, tradeableOnly: e.target.checked })} />
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Tradeable only</span>
      </label>
      <div className="flex flex-col items-stretch gap-1 w-full sm:w-auto sm:ml-auto order-last">
        {stale && !busy && (
          <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80 text-right">Tab changed — Refresh to load</span>
        )}
        <button type="button" onClick={onRun} disabled={busy || notReady}
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
          {busy ? <>Loading…<SpinGlyph /></> : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
