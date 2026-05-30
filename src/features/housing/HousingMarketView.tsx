import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { fetchMarketData, type MarketData, type MarketItem } from '../../lib/universalis';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import { furnishingCandidates, materialCandidates, allHousingCandidates } from '../../lib/housingItems';
import { buildHousingRow, housingMaterialCost, sortHousingRows, type HousingRow, type HousingSortKey } from './spikeSignal';
import { ResultTableScaffold, EmptyResults } from '../queries/ResultTableScaffold';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { fmtGil } from '../../lib/format';

type Tab = 'furnishings' | 'materials' | 'all';
const TABS: { id: Tab; label: string; sort: HousingSortKey }[] = [
  { id: 'furnishings', label: 'Furnishings', sort: 'craftGilPerDay' },
  { id: 'materials', label: 'Materials', sort: 'momentumPct' },
  { id: 'all', label: 'All housing', sort: 'momentumPct' },
];

const MAX_CANDIDATES = 400;
const TOP_N_HISTORY = 100;
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;
const HISTORY_CHUNK = 100;

interface ScanResult {
  market: MarketData;
  history: Map<number, HistoryEntry[]>;
  skipped: number;
}

export function HousingMarketView() {
  const { world, dc } = useSettingsStore();
  const items = useItemSnapshot();
  const recipes = useRecipeSnapshot();
  const [tab, setTab] = useState<Tab>('furnishings');
  const now = Date.now();

  const itemById = useMemo(() => {
    if (!items.data) return new Map<number, SnapshotItem>();
    return new Map<number, SnapshotItem>(items.data.items.map((i) => [i.id, i]));
  }, [items.data]);

  const candidateIds = useMemo(() => {
    if (!items.data || !recipes.data) return [];
    if (tab === 'furnishings') return furnishingCandidates(items.data.items, recipes.data);
    if (tab === 'materials') {
      const furn = furnishingCandidates(items.data.items, recipes.data);
      return materialCandidates(recipes.data, furn);
    }
    return allHousingCandidates(items.data.items);
  }, [items.data, recipes.data, tab]);

  const run = useMutation<ScanResult>({
    mutationFn: async () => {
      if (!items.data || !recipes.data) throw new Error('Snapshot not ready');
      const ids = candidateIds.slice(0, MAX_CANDIDATES);
      const market = await fetchInBatches<MarketItem>(
        ids, (chunk) => fetchMarketData(world, chunk), { chunkSize: 100, concurrency: 4 },
      );
      const topIds = [...ids]
        .sort((a, b) => (market.data[String(b)]?.velocity ?? 0) - (market.data[String(a)]?.velocity ?? 0))
        .slice(0, TOP_N_HISTORY);
      const history = new Map<number, HistoryEntry[]>();
      for (let i = 0; i < topIds.length; i += HISTORY_CHUNK) {
        const chunk = topIds.slice(i, i + HISTORY_CHUNK);
        const got = await fetchHistoryWithin(dc, chunk, THIRTY_DAYS_SEC);
        for (const [id, entries] of got) history.set(id, entries);
      }
      return { market: market.data, history, skipped: market.errors.length };
    },
  });

  const rows = useMemo<HousingRow[]>(() => {
    if (!items.data || !recipes.data || !run.data) return [];
    const sortKey = TABS.find((t) => t.id === tab)!.sort;
    const built = candidateIds.slice(0, MAX_CANDIDATES).flatMap((id) => {
      const item = itemById.get(id);
      if (!item) return [];
      const market = run.data!.market[String(id)];
      const recipe = recipes.data!.get(id);
      const materialCost = recipe ? housingMaterialCost(recipe, run.data!.market) : 0;
      return [buildHousingRow({ item, market, recipe, materialCost, history: run.data!.history.get(id), now })];
    });
    return sortHousingRows(built, sortKey);
  }, [items.data, recipes.data, run.data, candidateIds, itemById, tab, now]);

  const notReady = !items.data || !recipes.data;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id} type="button"
            onClick={() => { setTab(t.id); run.reset(); }}
            className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
              tab === t.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { run.reset(); run.mutate(); }}
          disabled={run.isPending || notReady}
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 sm:ml-auto"
        >
          {run.isPending ? 'Scanning…' : 'Scan prices'}
        </button>
      </div>

      <div className="font-mono text-[10px] text-text-low">
        {notReady ? 'Loading catalog…' : `${candidateIds.length.toLocaleString()} candidate items`}
        {candidateIds.length > MAX_CANDIDATES && <span className="text-gold"> · showing first {MAX_CANDIDATES} — narrow with the tab</span>}
      </div>

      {run.isPending && <Spinner label="Fetching prices & recent sales…" />}
      {run.isError && <StatusBanner kind="error">Universalis fetch failed: {(run.error as Error).message}</StatusBanner>}

      {run.data && (
        <ResultTableScaffold<HousingRow>
          rows={rows}
          totalCandidates={Math.min(candidateIds.length, MAX_CANDIDATES)}
          skippedChunks={run.data.skipped}
          emptyState={<EmptyResults>No housing items matched. Try another tab or scan again.</EmptyResults>}
          renderTable={(visible) => (
            <table className="w-full text-sm">
              <thead>
                <tr className="font-mono text-[10px] tracking-widest uppercase text-text-low text-left border-b border-border-base">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Sales/day</th>
                  <th className="px-3 py-2 text-right">Momentum</th>
                  <th className="px-3 py-2 text-right">Craft margin</th>
                  <th className="px-3 py-2 text-right">Gil/day</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b border-border-base/50">
                    <td className="px-3 py-2"><ItemNameLinks id={r.id} name={r.name} /></td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.price != null ? fmtGil(r.price) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.velocity.toFixed(1)}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${r.momentumPct == null ? 'text-text-low' : r.momentumPct >= 0 ? 'text-jade' : 'text-crimson'}`}>
                      {r.momentumPct == null ? '—' : `${r.momentumPct >= 0 ? '+' : ''}${Math.round(r.momentumPct)}%`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.craftMargin != null ? fmtGil(r.craftMargin) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gold">{r.craftGilPerDay != null ? fmtGil(r.craftGilPerDay) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        />
      )}

      {!run.data && !run.isPending && (
        <EmptyResults>Pick a tab and hit "Scan prices" to rank housing items by craft opportunity and recent momentum.</EmptyResults>
      )}
    </div>
  );
}
