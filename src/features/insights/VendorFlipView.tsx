import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useVendorShopSnapshot, useRefreshVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runVendorFlip } from '../queries/runVendorFlip';
import { VendorFlipResults } from '../queries/VendorFlipResults';
import { defaultVendorFlipFilter, type VendorFlipFilter, type VendorFlipSort, type HqMode } from '../queries/types';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

interface RunResult {
  saleMap: MarketData;
  skipped: number;
  filterAtRun: VendorFlipFilter;
}

export function VendorFlipView() {
  const { world } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const vendors = useVendorShopSnapshot();
  const refreshVendors = useRefreshVendorShopSnapshot();
  const [filter, setFilter] = useState<VendorFlipFilter>(defaultVendorFlipFilter());

  const candidateIds = useMemo(() => {
    if (!snapshot.data || !vendors.data) return [];
    const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
    const out: number[] = [];
    for (const item of snapshot.data.items) {
      if (!vendors.data.vendors.has(item.id)) continue;
      if (catSet && !catSet.has(item.sc)) continue;
      if (filter.hq === 'hq' && !item.canHq) continue;
      out.push(item.id);
    }
    return out;
  }, [snapshot.data, vendors.data, filter.searchCategories, filter.hq]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !vendors.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length, filterAtRun: filter };
    },
  });

  const rows = useMemo(() => {
    if (!snapshot.data || !vendors.data || !run.data) return [];
    return runVendorFlip(snapshot.data.items, vendors.data.vendors, run.data.saleMap, run.data.filterAtRun);
  }, [snapshot.data, vendors.data, run.data]);

  function onSortChange(next: VendorFlipSort) {
    setFilter({ ...filter, sort: next });
  }

  return (
    <div className="space-y-4">
      <FilterBar
        value={filter}
        onChange={setFilter}
        onRun={() => { run.reset(); run.mutate(); }}
        onRefreshVendors={async () => { await refreshVendors(); }}
        busy={run.isPending}
      />

      <div className="font-mono text-[10px] text-text-low">
        {vendors.isLoading
          ? 'Loading vendor catalog…'
          : `${candidateIds.length.toLocaleString()} candidate items`}
        {run.data && <> · {rows.length.toLocaleString()} results</>}
      </div>

      {vendors.isError && (
        <StatusBanner kind="error">Vendor catalog fetch failed: {(vendors.error as Error).message}</StatusBanner>
      )}
      {run.isPending && <Spinner label={`Fetching ${world} prices for ${candidateIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Universalis fetch failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {run.data && (
        <VendorFlipResults
          rows={rows}
          totalCandidates={candidateIds.length}
          skippedChunks={run.data.skipped}
          sort={run.data.filterAtRun.sort}
          onSortChange={onSortChange}
        />
      )}
    </div>
  );
}

function FilterBar({ value, onChange, onRun, onRefreshVendors, busy }: {
  value: VendorFlipFilter;
  onChange: (f: VendorFlipFilter) => void;
  onRun: () => void;
  onRefreshVendors: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min profit (gil/u)</span>
        <input
          type="number" min={0} step={100} value={value.minProfit}
          onChange={(e) => onChange({ ...value, minProfit: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min markup (×)</span>
        <input
          type="number" min={1} step={0.5} value={value.minMarkup}
          onChange={(e) => onChange({ ...value, minMarkup: Math.max(1, Number(e.target.value) || 1) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min sales/day</span>
        <input
          type="number" min={0} step={0.1} value={value.minVelocity}
          onChange={(e) => onChange({ ...value, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Max listings</span>
        <input
          type="number" min={0} step={1} value={value.maxListings ?? ''}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ ...value, maxListings: Number.isFinite(n) && n > 0 ? n : null });
          }}
          placeholder="∞"
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">HQ mode</span>
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
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Sort</span>
        <select
          value={value.sort}
          onChange={(e) => onChange({ ...value, sort: e.target.value as VendorFlipSort })}
          className="mt-1 block bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        >
          <option value="profitPerDay">Profit/day</option>
          <option value="markup">Markup</option>
          <option value="profitPerUnit">Profit/unit</option>
          <option value="salePrice">Sale price</option>
          <option value="velocity">Velocity</option>
        </select>
      </label>
      <button
        type="button"
        onClick={onRun} disabled={busy}
        className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50"
      >
        {busy ? 'Running…' : 'Run scan'}
      </button>
      <button
        type="button"
        onClick={() => { void onRefreshVendors(); }}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-aether hover:text-aether"
        title="Re-fetch the gil-shop catalog"
      >
        ⟳ Vendors
      </button>
    </div>
  );
}
