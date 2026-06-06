import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { fetchMarketData, type MarketData, type MarketItem } from '../../lib/universalis';
import { furnishingCandidates, materialCandidates, allHousingCandidates, housingCategoryIds } from '../../lib/housingItems';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { buildHousingRow, housingMaterialCost, collectRecipeIngredientIds, sortHousingRows, fmtDelta, type HousingRow, type HousingSortKey } from './spikeSignal';
import { useHousingMomentum } from './useHousingMomentum';
import { ResultTableScaffold, EmptyResults } from '../queries/ResultTableScaffold';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { CategorySelect } from '../../components/CategorySelect';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { fmtGil } from '../../lib/format';

type Tab = 'furnishings' | 'materials' | 'all';
const TABS: { id: Tab; label: string; sort: HousingSortKey }[] = [
  { id: 'furnishings', label: 'Furnishings', sort: 'craftGilPerDay' },
  { id: 'materials', label: 'Materials', sort: 'velocity' },
  { id: 'all', label: 'All housing', sort: 'velocity' },
];

const SCAN_STALE_MS = 5 * 60 * 1000; // re-opening a tab within 5 min serves cache

interface MarketScanResult {
  /** Home-world prices (sale side + the home-average mat fallback). */
  market: MarketData;
  /** DC-wide prices (the cheapest-mat side of the craft margin). */
  dcMarket: MarketData;
  ids: number[];
  skipped: number;
}

export function HousingMarketView() {
  const { world, dc } = useSettingsStore();
  const items = useItemSnapshot();
  const recipes = useRecipeSnapshot();
  const [tab, setTab] = useState<Tab>('furnishings');
  const [housingCats, setHousingCats] = useState<number[]>([]);
  const [sortKey, setSortKey] = useState<HousingSortKey>('craftGilPerDay');
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
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

  // Two-phase scan: market data first (served from blob cache in-memory, fast),
  // history second (live Universalis call, slow — non-blocking so Momentum just
  // shows "—" if it fails or is still loading rather than blocking the whole table).
  const marketScan = useQuery<MarketScanResult>({
    queryKey: ['housing-market', tab, world, dc, housingCats.join(','), candidateIds.length],
    enabled: !notReady,
    staleTime: SCAN_STALE_MS,
    queryFn: async () => {
      const ids = candidateIds;
      // Also fetch prices for each candidate's recipe ingredients — they aren't
      // furnishings, so they're absent from `ids`, and without them
      // housingMaterialCost can't price any recipe (every craft margin null).
      const ingredientIds = recipes.data ? collectRecipeIngredientIds(ids, recipes.data) : [];
      const fetchIds = [...new Set([...ids, ...ingredientIds])];
      // Both scopes are cache-only (in-memory map reads, no network), so fetching
      // the whole candidate set on two scopes is cheap. Home prices the sale side
      // + the mat-cost home-average fallback; DC prices the cheapest-mat side.
      const [home, dcScan] = await Promise.all([
        fetchInBatches<MarketItem>(fetchIds, (chunk) => fetchMarketData(world, chunk), { chunkSize: 100, concurrency: 4 }),
        fetchInBatches<MarketItem>(fetchIds, (chunk) => fetchMarketData(dc, chunk), { chunkSize: 100, concurrency: 4 }),
      ]);
      return { market: home.data, dcMarket: dcScan.data, ids, skipped: home.errors.length + dcScan.errors.length };
    },
  });


  const rows = useMemo<HousingRow[]>(() => {
    if (!items.data || !recipes.data || !marketScan.data) return [];
    const built = marketScan.data.ids.flatMap((id) => {
      const item = itemById.get(id);
      if (!item) return [];
      const market = marketScan.data!.market[String(id)];
      const recipe = recipes.data!.get(id);
      const materialCost = recipe ? housingMaterialCost(recipe, marketScan.data!.dcMarket, marketScan.data!.market) : 0;
      return [buildHousingRow({ item, market, recipe, materialCost, history: undefined, now })];
    });
    return sortHousingRows(built, sortKey);
  }, [items.data, recipes.data, marketScan.data, itemById, sortKey, now]);

  const momentum = useHousingMomentum(world, `${world}:${tab}`, visibleIds);

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
          onClick={() => { void marketScan.refetch(); }}
          disabled={marketScan.isFetching || notReady}
          title="Re-fetch prices & recent sales for this tab"
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-2 hover:text-aether disabled:opacity-50 sm:ml-auto"
        >
          {marketScan.isFetching ? <>Refreshing…<SpinGlyph /></> : '⟳ Refresh'}
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
      </div>

      {marketScan.isLoading && <Spinner label="Fetching prices…" />}
      {marketScan.isError && <StatusBanner kind="error">Universalis fetch failed: {(marketScan.error as Error).message}</StatusBanner>}

      {marketScan.data && (
        <ResultTableScaffold<HousingRow>
          rows={rows}
          totalCandidates={candidateIds.length}
          skippedChunks={marketScan.data.skipped}
          onVisibleRows={(vis) => setVisibleIds(vis.map((r) => r.id))}
          emptyState={<EmptyResults>No housing items matched. Try another tab or refresh.</EmptyResults>}
          renderTable={(visible) => (
            <table className="w-full text-sm">
              <thead>
                <tr className="font-mono text-[10px] tracking-widest uppercase text-text-low text-left border-b border-border-base">
                  <th className="px-3 py-2">Item</th>
                  <SortableHeader active={sortKey === 'price'} onClick={() => setSortKey('price')}>Price</SortableHeader>
                  <SortableHeader active={sortKey === 'velocity'} onClick={() => setSortKey('velocity')}>Sales/day</SortableHeader>
                  <th className="px-3 py-2 text-right text-text-low">7d Δ</th>
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
                    <td className="px-3 py-2 text-right font-mono tabular-nums"><MomentumCell value={momentum.get(r.id)} /></td>
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

function MomentumCell({ value }: { value: number | null | undefined }) {
  if (value === undefined) return <span className="text-text-low">…</span>;
  if (value === null) return <span className="text-text-low">—</span>;
  const cls = value > 0 ? 'text-jade' : value < 0 ? 'text-crimson' : 'text-text-dim';
  return <span className={cls}>{fmtDelta(value)}</span>;
}
