import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../queries/useSpecialShopSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketItem } from '../../lib/universalis';
import { buildHeatmapCells, type HeatmapCell, type CellTag, type HeatmapSourceSets } from './buildHeatmapData';
import { HeatmapChart } from './HeatmapChart';
import { ITEM_SEARCH_CATEGORIES, type ItemSearchCategoryEntry } from '../../lib/itemSearchCategories';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { CopyButton } from '../../components/CopyButton';
import { fmtGil } from '../../lib/format';

type HeatmapMode = 'topMovers' | 'category';

const TOP_MOVERS_LIMIT = 200;

const GROUPS: ItemSearchCategoryEntry['group'][] = [
  'Medicines & Meals', 'Materials', 'Armor', 'Weapons', 'Accessories', 'Tools', 'Housing', 'Other',
];

interface RunResult {
  cells: HeatmapCell[];
  skipped: number;
}

const TAG_LABELS: { tag: CellTag; label: string }[] = [
  { tag: 'craftable', label: 'Craftable' },
  { tag: 'gatherable', label: 'Gatherable' },
  { tag: 'vendor', label: 'Vendor' },
  { tag: 'currency', label: 'Currency' },
  { tag: 'material', label: 'Materials' },
  { tag: 'consumable', label: 'Consumables' },
  { tag: 'equipment', label: 'Equipment' },
];

type ListSort = 'revenue' | 'velocity' | 'salePrice' | 'margin' | 'name';

interface PostFilter {
  activeTags: Set<CellTag>;
  minVelocity: number;
  minMargin: number;
}

const DEFAULT_POST_FILTER: PostFilter = { activeTags: new Set(), minVelocity: 0, minMargin: -100 };

const LIST_PAGE_SIZE = 50;

export function HeatmapView() {
  const { world, hideCrystals } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot();
  const vendorSnap = useVendorShopSnapshot();
  const shopSnap = useSpecialShopSnapshot();
  const gatherSnap = useGatheringCatalog();

  const [mode, setMode] = useState<HeatmapMode>('topMovers');
  const [group, setGroup] = useState<ItemSearchCategoryEntry['group']>('Medicines & Meals');
  const [postFilter, setPostFilter] = useState<PostFilter>(DEFAULT_POST_FILTER);

  const sourceSets = useMemo<HeatmapSourceSets>(() => {
    const gatherableIds = gatherSnap.data ? new Set(gatherSnap.data.keys()) : undefined;
    const vendorIds = vendorSnap.data ? new Set(vendorSnap.data.snapshot.keys()) : undefined;
    const currencyIds = shopSnap.data ? (() => {
      const ids = new Set<number>();
      for (const entries of shopSnap.data.snapshot.byCurrency.values()) {
        for (const e of entries) ids.add(e.itemId);
      }
      return ids;
    })() : undefined;
    return { gatherableIds, vendorIds, currencyIds };
  }, [gatherSnap.data, vendorSnap.data, shopSnap.data]);

  const groupCategoryIds = useMemo(() => {
    return new Set(ITEM_SEARCH_CATEGORIES.filter((c) => c.group === group).map((c) => c.id));
  }, [group]);

  const candidateItems = useMemo(() => {
    if (!snapshot.data) return [];
    return snapshot.data.items.filter((item) => {
      if (item.sc === 0) return false;
      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) return false;
      if (mode === 'category' && !groupCategoryIds.has(item.sc)) return false;
      return true;
    });
  }, [snapshot.data, mode, groupCategoryIds, hideCrystals]);

  const candidateIds = useMemo(() => candidateItems.map((i) => i.id), [candidateItems]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !recipes.data) throw new Error('Snapshots not ready');
      const sale = await fetchInBatches<MarketItem>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      const ingredientIds = new Set<number>();
      for (const item of candidateItems) {
        const recipe = recipes.data.get(item.id);
        if (recipe) {
          for (const ing of recipe.ingredients) {
            if (!(String(ing.itemId) in sale.data)) ingredientIds.add(ing.itemId);
          }
        }
      }
      let skipped = sale.errors.length;
      if (ingredientIds.size > 0) {
        const ingResult = await fetchInBatches<MarketItem>(
          [...ingredientIds],
          (chunk) => fetchMarketData(world, chunk),
          { chunkSize: 100, concurrency: 4 },
        );
        Object.assign(sale.data, ingResult.data);
        skipped += ingResult.errors.length;
      }

      let cells = buildHeatmapCells(candidateItems, sale.data, recipes.data, sourceSets);
      if (mode === 'topMovers') {
        cells.sort((a, b) => b.velocity - a.velocity);
        cells = cells.slice(0, TOP_MOVERS_LIMIT);
      }
      return { cells, skipped };
    },
  });

  const notReady = !snapshot.data || !recipes.data;

  const [listSort, setListSort] = useState<ListSort>('revenue');
  const [listCount, setListCount] = useState(LIST_PAGE_SIZE);

  const filteredCells = useMemo(() => {
    if (!run.data) return [];
    const active = postFilter.activeTags;
    return run.data.cells.filter((c) => {
      if (active.size > 0 && !Array.from(active).some((t) => c.tags.has(t))) return false;
      if (c.velocity < postFilter.minVelocity) return false;
      if (c.craftable && c.margin != null && c.margin * 100 < postFilter.minMargin) return false;
      return true;
    });
  }, [run.data, postFilter]);

  return (
    <div className="space-y-4">
      {/* Scan controls */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
        <div className="flex gap-2">
          {(['topMovers', 'category'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
                mode === m ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              {m === 'topMovers' ? 'Top movers' : 'By category'}
            </button>
          ))}
        </div>

        {mode === 'category' && (
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Group</span>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as ItemSearchCategoryEntry['group'])}
              className="mt-1 block bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            >
              {GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={() => { run.reset(); run.mutate(); setPostFilter(DEFAULT_POST_FILTER); }}
          disabled={run.isPending || notReady}
          title={notReady ? 'Loading catalogs…' : undefined}
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {run.isPending ? <>Scanning…<SpinGlyph /></> : 'Run scan'}
        </button>
      </div>

      {/* Post-scan filters — appear after results */}
      {run.data && run.data.cells.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Show</span>
            <div className="flex flex-wrap gap-1.5">
              {TAG_LABELS.map(({ tag, label }) => {
                const active = postFilter.activeTags.has(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const next = new Set(postFilter.activeTags);
                      if (active) next.delete(tag); else next.add(tag);
                      setPostFilter({ ...postFilter, activeTags: next });
                    }}
                    className={`font-mono text-[10px] tracking-widest uppercase px-2.5 py-1.5 border ${
                      active ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min vel/day</span>
            <input
              type="number" min={0} step={0.5} value={postFilter.minVelocity}
              onChange={(e) => setPostFilter({ ...postFilter, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 block w-24 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min margin %</span>
            <input
              type="number" min={-100} max={100} step={5} value={postFilter.minMargin}
              onChange={(e) => setPostFilter({ ...postFilter, minMargin: Number(e.target.value) || -100 })}
              className="mt-1 block w-24 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
      )}

      {/* Status */}
      <div className="font-mono text-[10px] text-text-low">
        {notReady
          ? 'Loading catalogs…'
          : `${candidateIds.length.toLocaleString()} candidate items`}
        {run.data && <> · {filteredCells.length.toLocaleString()} of {run.data.cells.length.toLocaleString()} shown</>}
      </div>

      {run.isPending && <Spinner label={`Fetching ${world} prices for ${candidateIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {!run.data && !run.isPending && (
        <EmptyState
          icon="❖"
          message="Visualize market activity — size shows velocity, color shows margin."
          action={!notReady ? { label: 'Run Scan', onClick: () => { run.reset(); run.mutate(); } } : undefined}
        />
      )}

      {run.data && filteredCells.length > 0 && (
        <>
          <div className="flex items-center gap-4 font-mono text-[10px] text-text-low">
            <span>Size = velocity</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3" style={{ backgroundColor: 'rgb(200,80,40)' }} /> low margin
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3" style={{ backgroundColor: 'rgb(200,220,50)' }} /> mid
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3" style={{ backgroundColor: 'rgb(60,190,100)' }} /> high margin
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3" style={{ backgroundColor: 'rgb(70,120,220)' }} /> non-craftable
            </span>
          </div>
          <HeatmapChart cells={filteredCells} />
        </>
      )}

      {/* Sortable list */}
      {run.data && filteredCells.length > 0 && (
        <HeatmapList
          cells={filteredCells}
          sort={listSort}
          onSort={setListSort}
          visibleCount={listCount}
          onShowMore={() => setListCount((n) => n + LIST_PAGE_SIZE)}
        />
      )}

      {run.data && filteredCells.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-center text-text-low text-sm italic">
          {run.data.cells.length > 0 ? 'No items match your filters.' : 'No items with market activity found.'}
        </div>
      )}
    </div>
  );
}

function HeatmapList({ cells, sort, onSort, visibleCount, onShowMore }: {
  cells: HeatmapCell[];
  sort: ListSort;
  onSort: (s: ListSort) => void;
  visibleCount: number;
  onShowMore: () => void;
}) {
  const sorted = useMemo(() => {
    const copy = [...cells];
    switch (sort) {
      case 'revenue':   copy.sort((a, b) => (b.salePrice * b.velocity) - (a.salePrice * a.velocity)); break;
      case 'velocity':  copy.sort((a, b) => b.velocity - a.velocity); break;
      case 'salePrice': copy.sort((a, b) => b.salePrice - a.salePrice); break;
      case 'margin':    copy.sort((a, b) => (b.margin ?? -999) - (a.margin ?? -999)); break;
      case 'name':      copy.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return copy;
  }, [cells, sort]);

  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  return (
    <div className="border border-border-base bg-bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
            <th className="text-left px-3 py-2">Item</th>
            <SortTh col="salePrice" current={sort} onClick={onSort}>Price</SortTh>
            <SortTh col="velocity" current={sort} onClick={onSort}>Vel/day</SortTh>
            <SortTh col="revenue" current={sort} onClick={onSort}>Rev/day</SortTh>
            <SortTh col="margin" current={sort} onClick={onSort} hideOnMobile>Margin</SortTh>
            <th className="text-right px-3 py-2 hidden sm:table-cell">Tags</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((c) => {
            const rev = c.salePrice * c.velocity;
            return (
              <tr key={c.id} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Link
                      to={`/item/${c.id}`}
                      target="_blank"
                      className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 truncate"
                    >
                      {c.name}
                    </Link>
                    <CopyButton text={c.name} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtGil(c.salePrice)}</td>
                <td className="px-3 py-2 text-right font-mono">{c.velocity.toFixed(1)}</td>
                <td className="px-3 py-2 text-right font-mono text-gold">{fmtGil(Math.round(rev))}</td>
                <td className={`px-3 py-2 text-right font-mono hidden sm:table-cell ${
                  c.margin != null ? (c.margin > 0.2 ? 'text-jade' : c.margin > 0 ? 'text-text-cream' : 'text-red-400') : 'text-text-low'
                }`}>
                  {c.margin != null ? `${(c.margin * 100).toFixed(0)}%` : '—'}
                </td>
                <td className="px-3 py-2 text-right hidden sm:table-cell">
                  <div className="flex flex-wrap justify-end gap-1">
                    {[...c.tags].map((t) => (
                      <span key={t} className="font-mono text-[9px] text-text-dim border border-border-base px-1 py-0.5 leading-none">{t}</span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasMore && (
        <div className="px-3 py-2 border-t border-border-base text-center">
          <button
            type="button"
            onClick={onShowMore}
            className="font-mono text-[10px] tracking-widest uppercase text-aether hover:underline"
          >
            Show more ({sorted.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

function SortTh({ col, current, onClick, hideOnMobile, children }: {
  col: ListSort; current: ListSort; onClick: (c: ListSort) => void;
  hideOnMobile?: boolean; children: React.ReactNode;
}) {
  const active = col === current;
  return (
    <th
      className={`text-right px-3 py-2 cursor-pointer select-none ${active ? 'text-gold' : 'text-text-dim hover:text-text-cream'} ${hideOnMobile ? 'hidden sm:table-cell' : ''}`}
      onClick={() => onClick(col)}
    >
      {children}{active ? ' ▼' : ''}
    </th>
  );
}
