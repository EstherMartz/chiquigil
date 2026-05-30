import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useSpecialShopSnapshot, useRefreshSpecialShopSnapshot } from '../queries/useSpecialShopSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runCurrencyFlip } from '../queries/runCurrencyFlip';
import { CurrencyFlipResults } from '../queries/CurrencyFlipResults';
import { defaultCurrencyFlipFilter, type CurrencyFlipFilter, type CurrencyFlipSort } from '../queries/types';
import { CURRENCIES, getCurrencyById, type CurrencyId } from '../../lib/currencies';
import { CurrencyIcon } from '../../lib/icons';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { useInitialScan } from '../queries/useInitialScan';

interface RunResult {
  saleMap: MarketData;
  skipped: number;
  filterAtRun: CurrencyFlipFilter;
}

function isCurrencyId(v: string | null): v is CurrencyId {
  return v != null && CURRENCIES.some((c) => c.id === v);
}

export function CurrencyFlipView() {
  const { world, hideCrystals } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const shop = useSpecialShopSnapshot();
  const refreshShop = useRefreshSpecialShopSnapshot();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlCurrency = searchParams.get('currency');
  const initialCurrency: CurrencyId = isCurrencyId(urlCurrency) ? urlCurrency : 'poetics';
  const [filter, setFilter] = useState<CurrencyFlipFilter>({ ...defaultCurrencyFlipFilter(), currency: initialCurrency });

  const currency = getCurrencyById(filter.currency)!;

  function setCurrency(id: CurrencyId) {
    const next = { ...filter, currency: id };
    setFilter(next);
    setSearchParams((p) => { p.set('currency', id); return p; });
    run.reset();
    run.mutate();
  }

  const candidateIds = useMemo(() => {
    if (!snapshot.data || !shop.data) return [];
    const entries = shop.data.snapshot.byCurrency.get(filter.currency) ?? [];
    const itemIds = new Set(entries.map((e) => e.itemId));
    return [...itemIds].filter((id) => {
      const it = snapshot.data!.items.find((i) => i.id === id);
      if (!it) return false;
      if (hideCrystals && it.sc === CRYSTALS_SEARCH_CATEGORY) return false;
      return true;
    });
  }, [snapshot.data, shop.data, filter.currency, hideCrystals]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !shop.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length, filterAtRun: filter };
    },
  });

  const rows = useMemo(() => {
    if (!snapshot.data || !shop.data || !run.data) return [];
    return runCurrencyFlip(snapshot.data.items, shop.data.snapshot, run.data.saleMap, run.data.filterAtRun);
  }, [snapshot.data, shop.data, run.data]);

  const ready = snapshot.data != null && shop.data != null;
  const stale = run.data != null && run.data.filterAtRun !== filter;

  useInitialScan(ready, () => { run.reset(); run.mutate(); });

  function onSortChange(next: CurrencyFlipSort) {
    setFilter({ ...filter, sort: next });
  }

  return (
    <div className="space-y-4">
      <TopStrip
        currencyId={filter.currency}
        onChangeCurrency={setCurrency}
        onRun={() => { run.reset(); run.mutate(); }}
        onRefreshCatalog={async () => { await refreshShop(); }}
        busy={run.isPending}
        notReady={!snapshot.data || !shop.data}
        stale={stale}
      />

      {ready && (
        <FilterBar value={filter} onChange={setFilter} />
      )}

      <div className="font-mono text-[10px] text-text-low">
        {shop.isLoading
          ? 'Loading currency catalog…'
          : `${candidateIds.length.toLocaleString()} candidate items`}
        {run.data && <> · {rows.length.toLocaleString()} results</>}
      </div>

      {shop.isError && (
        <StatusBanner kind="error">Currency catalog fetch failed: {(shop.error as Error).message}</StatusBanner>
      )}
      {run.isPending && <Spinner label={`Fetching ${world} prices for ${candidateIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Universalis fetch failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {!run.data && !run.isPending && (
        <EmptyState
          icon="❖"
          message={ready
            ? 'Find the best gil return for your earned currency (scrips, poetics, etc.).'
            : 'Loading currency catalog…'}
        />
      )}

      {run.data && (
        <CurrencyFlipResults
          rows={rows}
          currency={currency}
          totalCandidates={candidateIds.length}
          skippedChunks={run.data.skipped}
          sort={run.data.filterAtRun.sort}
          onSortChange={onSortChange}
        />
      )}
    </div>
  );
}

function TopStrip({ currencyId, onChangeCurrency, onRun, onRefreshCatalog, busy, notReady, stale }: {
  currencyId: CurrencyId;
  onChangeCurrency: (id: CurrencyId) => void;
  onRun: () => void;
  onRefreshCatalog: () => Promise<void>;
  busy: boolean;
  notReady: boolean;
  stale: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Currency</span>
        <span className="mt-1 flex items-center gap-2">
          {(() => {
            const c = getCurrencyById(currencyId);
            return c ? <CurrencyIcon currencyKey={c.itemId} size={20} /> : null;
          })()}
          <select
            aria-label="Currency"
            value={currencyId}
            onChange={(e) => onChangeCurrency(e.target.value as CurrencyId)}
            className="bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          >
            {CURRENCIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </span>
      </label>
      <div className="flex gap-2 w-full sm:w-auto sm:ml-auto order-last">
        <button
          type="button"
          onClick={() => { void onRefreshCatalog(); }}
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-2 hover:text-aether"
          title="Re-fetch the SpecialShop catalog"
        >
          ⟳ Catalog
        </button>
        <div className="flex flex-col items-stretch gap-1 flex-1 sm:flex-initial">
          {stale && !busy && (
            <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80 text-right">
              Filters changed — Run scan to refresh
            </span>
          )}
          <button
            type="button"
            onClick={onRun} disabled={busy || notReady}
            title={notReady ? 'Loading currency catalog…' : undefined}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {busy ? <>Running…<SpinGlyph /></> : 'Run scan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterBar({ value, onChange }: {
  value: CurrencyFlipFilter;
  onChange: (f: CurrencyFlipFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min gil/unit</span>
        <input
          type="number" inputMode="decimal" min={0} step={100} value={value.minGilPerUnit}
          onChange={(e) => onChange({ ...value, minGilPerUnit: Math.max(0, Number(e.target.value) || 0) })}
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
          {(['nq', 'hq', 'either'] as const).map((mode) => (
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
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Sort</span>
        <select
          value={value.sort}
          onChange={(e) => onChange({ ...value, sort: e.target.value as CurrencyFlipSort })}
          className="mt-1 block bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
        >
          <option value="gilPerUnit">Gil/unit</option>
          <option value="salePrice">Sale price</option>
          <option value="velocity">Velocity</option>
          <option value="costPerUnit">Cost per unit</option>
        </select>
      </label>
    </div>
  );
}
