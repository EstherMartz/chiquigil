import { useMemo, useState } from 'react';
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
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

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

interface PostFilter {
  activeTags: Set<CellTag>;
  minVelocity: number;
  minMargin: number;
}

const DEFAULT_POST_FILTER: PostFilter = { activeTags: new Set(), minVelocity: 0, minMargin: -100 };

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
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Group</span>
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
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {run.isPending ? 'Scanning…' : 'Run scan'}
        </button>
      </div>

      {/* Post-scan filters — appear after results */}
      {run.data && run.data.cells.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Show</span>
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
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min vel/day</span>
            <input
              type="number" min={0} step={0.5} value={postFilter.minVelocity}
              onChange={(e) => setPostFilter({ ...postFilter, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 block w-24 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min margin %</span>
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

      {run.data && filteredCells.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-center text-text-low text-sm italic">
          {run.data.cells.length > 0 ? 'No items match your filters.' : 'No items with market activity found.'}
        </div>
      )}
    </div>
  );
}
