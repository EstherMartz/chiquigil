import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { fetchMarketData, type MarketData, type MarketItem } from '../../lib/universalis';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import { furnishingCandidates, materialCandidates, allHousingCandidates, housingCategoryIds } from '../../lib/housingItems';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { buildHousingRow, housingMaterialCost, sortHousingRows, type HousingRow, type HousingSortKey } from './spikeSignal';
import { ResultTableScaffold, EmptyResults } from '../queries/ResultTableScaffold';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { CategorySelect } from '../../components/CategorySelect';
import { Spinner, SpinGlyph } from '../../components/Spinner';
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
const SCAN_STALE_MS = 5 * 60 * 1000; // re-opening a tab within 5 min serves cache

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
  const [housingCats, setHousingCats] = useState<number[]>([]);
  const [sortKey, setSortKey] = useState<HousingSortKey>('craftGilPerDay');
  const now = Date.now();

  function selectTab(next: Tab) {
    setTab(next);
    setSortKey(TABS.find((t) => t.id === next)!.sort);
  }

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
    // tab === 'all'
    const all = allHousingCandidates(items.data.items);
    if (housingCats.length === 0) return all;
    const catSet = new Set(housingCats);
    return all.filter((id) => {
      const item = itemById.get(id);
      return item && catSet.has(item.sc);
    });
  }, [items.data, recipes.data, tab, housingCats, itemById]);

  const notReady = !items.data || !recipes.data;

  // Per-tab cached scan: auto-runs when the tab (or world/dc/category filter) changes,
  // and serves cache when switching back within the stale window — no manual button needed.
  const scan = useQuery<ScanResult>({
    queryKey: ['housing-scan', tab, world, dc, housingCats.join(','), candidateIds.length],
    enabled: !notReady,
    staleTime: SCAN_STALE_MS,
    queryFn: async () => {
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
    if (!items.data || !recipes.data || !scan.data) return [];
    const built = candidateIds.slice(0, MAX_CANDIDATES).flatMap((id) => {
      const item = itemById.get(id);
      if (!item) return [];
      const market = scan.data!.market[String(id)];
      const recipe = recipes.data!.get(id);
      const materialCost = recipe ? housingMaterialCost(recipe, scan.data!.market) : 0;
      return [buildHousingRow({ item, market, recipe, materialCost, history: scan.data!.history.get(id), now })];
    });
    return sortHousingRows(built, sortKey);
  }, [items.data, recipes.data, scan.data, candidateIds, itemById, sortKey, now]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id} type="button"
            onClick={() => selectTab(t.id)}
            className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
              tab === t.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { void scan.refetch(); }}
          disabled={scan.isFetching || notReady}
          title="Re-fetch prices & recent sales for this tab"
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-2 hover:text-aether disabled:opacity-50 sm:ml-auto"
        >
          {scan.isFetching ? <>Refreshing…<SpinGlyph /></> : '⟳ Refresh'}
        </button>
      </div>

      {tab === 'all' && (
        <div className="mt-2">
          <CategorySelect
            categories={housingCategoryIds().map((id) => ({ id, name: categoryLabel(id) }))}
            selected={housingCats}
            onChange={setHousingCats}
            placeholder="Filter by housing category…"
          />
        </div>
      )}

      <div className="font-mono text-[10px] text-text-low">
        {notReady ? 'Loading catalog…' : `${candidateIds.length.toLocaleString()} candidate items`}
        {candidateIds.length > MAX_CANDIDATES && <span className="text-gold"> · showing first {MAX_CANDIDATES} — narrow with the filter</span>}
      </div>

      {scan.isLoading && <Spinner label="Fetching prices & recent sales…" />}
      {scan.isError && <StatusBanner kind="error">Universalis fetch failed: {(scan.error as Error).message}</StatusBanner>}

      {scan.data && (
        <ResultTableScaffold<HousingRow>
          rows={rows}
          totalCandidates={Math.min(candidateIds.length, MAX_CANDIDATES)}
          skippedChunks={scan.data.skipped}
          emptyState={<EmptyResults>No housing items matched. Try another tab or refresh.</EmptyResults>}
          renderTable={(visible) => (
            <table className="w-full text-sm">
              <thead>
                <tr className="font-mono text-[10px] tracking-widest uppercase text-text-low text-left border-b border-border-base">
                  <th className="px-3 py-2">Item</th>
                  <SortableHeader active={sortKey === 'price'} onClick={() => setSortKey('price')}>Price</SortableHeader>
                  <SortableHeader active={sortKey === 'velocity'} onClick={() => setSortKey('velocity')}>Sales/day</SortableHeader>
                  <SortableHeader active={sortKey === 'momentumPct'} onClick={() => setSortKey('momentumPct')}>Momentum</SortableHeader>
                  <SortableHeader active={sortKey === 'craftMargin'} onClick={() => setSortKey('craftMargin')}>Craft margin</SortableHeader>
                  <SortableHeader active={sortKey === 'craftGilPerDay'} onClick={() => setSortKey('craftGilPerDay')}>Gil/day</SortableHeader>
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
    </div>
  );
}

function SortableHeader({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-right ${active ? 'text-gold' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
      aria-sort={active ? 'descending' : 'none'}
    >
      {children}{active ? ' ▼' : ''}
    </th>
  );
}
