import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runVendorFlip } from '../queries/runVendorFlip';
import { VendorFlipResults } from '../queries/VendorFlipResults';
import { defaultVendorFlipFilter, type VendorFlipFilter, type VendorFlipSort, type HqMode } from '../queries/types';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { useInitialScan } from '../queries/useInitialScan';
import { CategorySelect } from '../../components/CategorySelect';
import { ITEM_SEARCH_CATEGORIES, categoryLabel, CATEGORY_GROUPS } from '../../lib/itemSearchCategories';
import { VendorRefreshControl } from './VendorRefreshControl';

interface RunResult {
  saleMap: MarketData;
  skipped: number;
}

export function VendorFlipView() {
  const { world, hideCrystals } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const vendors = useVendorShopSnapshot();
  const [filter, setFilter] = useState<VendorFlipFilter>(defaultVendorFlipFilter());
  const [sort, setSort] = useState<VendorFlipSort>(defaultVendorFlipFilter().sort);
  const [lastRefreshTs, setLastRefreshTs] = useState<number | null>(null);

  const scanIds = useMemo(() => {
    if (!snapshot.data || !vendors.data) return [];
    const out: number[] = [];
    for (const item of snapshot.data.items) {
      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;
      if (!vendors.data.snapshot.has(item.id)) continue;
      out.push(item.id);
    }
    return out;
  }, [snapshot.data, vendors.data, hideCrystals]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !vendors.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        scanIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length };
    },
    onSuccess: () => setLastRefreshTs(Date.now()),
  });

  const rows = useMemo(() => {
    if (!snapshot.data || !vendors.data || !run.data) return [];
    return runVendorFlip(snapshot.data.items, vendors.data.snapshot, run.data.saleMap, { ...filter, sort });
  }, [snapshot.data, vendors.data, run.data, filter, sort]);

  const ready = snapshot.data != null && vendors.data != null;

  useInitialScan(ready, () => { run.mutate(); });

  return (
    <div className="space-y-4">
      <FilterBar
        value={filter}
        onChange={setFilter}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-mono text-[10px] text-text-low">
          {vendors.isLoading
            ? 'Loading vendor catalog…'
            : `${scanIds.length.toLocaleString()} candidate items`}
          {run.data && <> · {rows.length.toLocaleString()} results</>}
        </div>
        <VendorRefreshControl
          onRefresh={() => run.mutate()}
          busy={run.isPending}
          notReady={!snapshot.data || !vendors.data}
          lastRefreshTs={lastRefreshTs}
        />
      </div>

      {vendors.isError && (
        <StatusBanner kind="error">Vendor catalog fetch failed: {(vendors.error as Error).message}</StatusBanner>
      )}
      {run.isPending && !run.data && <Spinner label={`Fetching ${world} prices for ${scanIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Universalis fetch failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {!run.data && !run.isPending && (
        <EmptyState
          icon="❖"
          message={ready
            ? 'Scan for NPC vendor items you can flip on the marketboard for profit.'
            : 'Loading vendor catalog…'}
        />
      )}

      {run.data && (
        <VendorFlipResults
          rows={rows}
          totalCandidates={scanIds.length}
          skippedChunks={run.data.skipped}
          sort={sort}
          onSortChange={setSort}
        />
      )}
    </div>
  );
}

function FilterBar({ value, onChange }: {
  value: VendorFlipFilter;
  onChange: (f: VendorFlipFilter) => void;
}) {
  return (
    <div className="border border-border-base bg-bg-card p-3 space-y-3">
      <div>
        <label className="font-mono text-[13px] tracking-widest text-text-low uppercase block mb-1">
          Categories ({value.searchCategories.length || 'all'})
        </label>
        <CategorySelect
          categories={ITEM_SEARCH_CATEGORIES.map((c) => ({ id: c.id, name: categoryLabel(c.id) }))}
          selected={value.searchCategories}
          onChange={(ids) => onChange({ ...value, searchCategories: ids })}
          placeholder="Search categories…"
          groups={CATEGORY_GROUPS}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min profit (gil/u)</span>
          <input
            type="number" inputMode="decimal" min={0} step={100} value={value.minProfit}
            onChange={(e) => onChange({ ...value, minProfit: Math.max(0, Number(e.target.value) || 0) })}
            className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min markup (×)</span>
          <input
            type="number" inputMode="decimal" min={1} step={0.5} value={value.minMarkup}
            onChange={(e) => onChange({ ...value, minMarkup: Math.max(1, Number(e.target.value) || 1) })}
            className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min sales/day</span>
          <input
            type="number" inputMode="decimal" min={0} step={0.1} value={value.minVelocity}
            onChange={(e) => onChange({ ...value, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
            className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Max listings</span>
          <input
            type="number" inputMode="decimal" min={0} step={1} value={value.maxListings ?? ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({ ...value, maxListings: Number.isFinite(n) && n > 0 ? n : null });
            }}
            placeholder="∞"
            className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">HQ mode</span>
          <div className="flex gap-2">
            {(['nq', 'hq', 'either'] as HqMode[]).map((mode) => (
              <button
                key={mode} type="button"
                onClick={() => onChange({ ...value, hq: mode })}
                className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
                  value.hq === mode ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
                }`}
              >
                {mode === 'either' ? 'Either' : mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
