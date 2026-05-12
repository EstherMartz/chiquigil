import { useEffect, useState } from 'react';
import { ExportImportPanel } from '../features/settings/ExportImportPanel';
import {
  clearRecipeCache,
  clearRecipeSnapshot,
  clearGatheringCatalog,
  clearMarketCache,
  putCachedRecipeSnapshot,
  putCachedGatheringCatalog,
  getItemSnapshotUpdatedAt,
  getRecipeSnapshotUpdatedAt,
  getGatheringCatalogUpdatedAt,
  getMarketCacheLastFetchedAt,
} from '../lib/recipeCache';
import { fetchRecipeSnapshot } from '../lib/recipeSnapshot';
import { buildGatheringCatalog } from '../lib/gatheringCatalog';
import { _resetMarketCacheForTests } from '../lib/universalis';
import { useQueryClient } from '@tanstack/react-query';
import { useItemSnapshot, useRefreshItemSnapshot } from '../features/queries/useItemSnapshot';

const STALE_DAYS = 7;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

type DatasetKey = 'item' | 'recipe' | 'gather' | 'market';

interface CacheStatus {
  ts: number | null;
  hasData: boolean;
}

function fmtDate(ts: number | null | undefined): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString();
}

function isStale(ts: number | null | undefined): boolean {
  return ts != null && Date.now() - ts > STALE_MS;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const itemDb = useItemSnapshot();
  const refreshItemDb = useRefreshItemSnapshot();

  const [status, setStatus] = useState<Record<DatasetKey, CacheStatus>>({
    item:   { ts: null, hasData: false },
    recipe: { ts: null, hasData: false },
    gather: { ts: null, hasData: false },
    market: { ts: null, hasData: false },
  });
  const [busy, setBusy] = useState<Record<DatasetKey, boolean>>({
    item: false, recipe: false, gather: false, market: false,
  });
  const [allBusy, setAllBusy] = useState(false);
  const [errors, setErrors] = useState<Record<DatasetKey, string | null>>({
    item: null, recipe: null, gather: null, market: null,
  });

  async function reloadTimestamps() {
    const [item, recipe, gather, market] = await Promise.all([
      getItemSnapshotUpdatedAt(),
      getRecipeSnapshotUpdatedAt(),
      getGatheringCatalogUpdatedAt(),
      getMarketCacheLastFetchedAt(),
    ]);
    setStatus({
      item:   { ts: item ?? null,   hasData: !!itemDb.data && itemDb.data.items.length > 0 },
      recipe: { ts: recipe ?? null, hasData: recipe != null },
      gather: { ts: gather ?? null, hasData: gather != null },
      market: { ts: market,         hasData: market != null },
    });
  }
  useEffect(() => { reloadTimestamps(); }, [itemDb.data]);

  function setBusyFor(key: DatasetKey, value: boolean) {
    setBusy((b) => ({ ...b, [key]: value }));
  }
  function setErrorFor(key: DatasetKey, msg: string | null) {
    setErrors((e) => ({ ...e, [key]: msg }));
  }

  async function refreshItem() {
    setBusyFor('item', true); setErrorFor('item', null);
    try { await refreshItemDb(); }
    catch (e) { setErrorFor('item', (e as Error).message); }
    finally {
      await reloadTimestamps();
      setBusyFor('item', false);
    }
  }

  async function refreshRecipe() {
    setBusyFor('recipe', true); setErrorFor('recipe', null);
    try {
      await clearRecipeCache();
      await clearRecipeSnapshot();
      const fresh = await fetchRecipeSnapshot();
      await putCachedRecipeSnapshot([...fresh.entries()]);
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe-snapshot'] });
    } catch (e) { setErrorFor('recipe', (e as Error).message); }
    finally {
      await reloadTimestamps();
      setBusyFor('recipe', false);
    }
  }

  async function refreshGather() {
    setBusyFor('gather', true); setErrorFor('gather', null);
    try {
      await clearGatheringCatalog();
      const fresh = await buildGatheringCatalog();
      await putCachedGatheringCatalog([...fresh.entries()]);
      queryClient.invalidateQueries({ queryKey: ['gathering-catalog'] });
    } catch (e) { setErrorFor('gather', (e as Error).message); }
    finally {
      await reloadTimestamps();
      setBusyFor('gather', false);
    }
  }

  async function refreshMarket() {
    setBusyFor('market', true); setErrorFor('market', null);
    try {
      _resetMarketCacheForTests();
      await clearMarketCache();
    } catch (e) { setErrorFor('market', (e as Error).message); }
    finally {
      await reloadTimestamps();
      setBusyFor('market', false);
    }
  }

  async function refreshAll() {
    setAllBusy(true);
    await Promise.all([
      refreshItem(),
      refreshRecipe(),
      refreshGather(),
      refreshMarket(),
    ]);
    setAllBusy(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-10">
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Data caches</h2>
        <p className="text-text-low text-sm mb-4 max-w-prose">
          All catalogs are cached locally and reused across sessions. Universalis prices have a 30-minute
          freshness window. Sheet snapshots are cached indefinitely — refresh after a game patch.
        </p>
        <table className="font-mono text-xs w-full max-w-3xl">
          <thead>
            <tr className="text-text-low tracking-widest uppercase text-[10px]">
              <th className="text-left py-2">Dataset</th>
              <th className="text-left py-2">Last fetched</th>
              <th className="text-left py-2">Status</th>
              <th className="text-right py-2">Action</th>
            </tr>
          </thead>
          <tbody className="border-t border-border-base">
            <CacheRow
              label="Item catalog"
              status={status.item}
              detail={itemDb.data ? `${itemDb.data.items.length.toLocaleString()} items` : '—'}
              error={errors.item}
              busy={busy.item}
              onRefresh={refreshItem}
            />
            <CacheRow
              label="Recipe snapshot"
              status={status.recipe}
              detail="all recipes (bulk)"
              error={errors.recipe}
              busy={busy.recipe}
              onRefresh={refreshRecipe}
            />
            <CacheRow
              label="Gathering catalog"
              status={status.gather}
              detail="gather nodes + timing"
              error={errors.gather}
              busy={busy.gather}
              onRefresh={refreshGather}
            />
            <CacheRow
              label="Universalis prices"
              status={status.market}
              detail="in-memory + IDB, 30-min TTL"
              error={errors.market}
              busy={busy.market}
              onRefresh={refreshMarket}
              hideStale
            />
          </tbody>
        </table>
        <div className="mt-5">
          <button
            onClick={refreshAll}
            disabled={allBusy}
            className="font-display text-xs tracking-widest uppercase bg-bg-card-hi border border-gold text-gold px-5 py-2.5 hover:bg-gold hover:text-bg-deep transition-colors disabled:opacity-40"
          >
            {allBusy ? '⟳ Refreshing…' : '⟳ Refresh all data'}
          </button>
        </div>
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Backup &amp; restore</h2>
        <p className="text-text-low text-sm mb-3">
          Export saves your retainer levels, world/DC, watchlist, starter pack toggles, custom items,
          and per-item overrides as a JSON file. Import overwrites your current state.
        </p>
        <ExportImportPanel />
      </section>
    </div>
  );
}

interface CacheRowProps {
  label: string;
  status: CacheStatus;
  detail: string;
  error: string | null;
  busy: boolean;
  onRefresh: () => void;
  hideStale?: boolean;
}

function CacheRow({ label, status, detail, error, busy, onRefresh, hideStale }: CacheRowProps) {
  const { ts, hasData } = status;
  const stale = !hideStale && isStale(ts);
  let statusDisplay;
  if (busy) statusDisplay = <span className="text-aether">refreshing…</span>;
  else if (error) statusDisplay = <span className="text-crimson">error</span>;
  else if (ts == null && !hasData) statusDisplay = <span className="text-text-low">—</span>;
  else if (ts == null && hasData) statusDisplay = <span className="text-text-low">legacy</span>;
  else if (stale) statusDisplay = <span className="text-crimson">stale (&gt;{STALE_DAYS}d)</span>;
  else statusDisplay = <span className="text-jade">fresh</span>;

  return (
    <tr className="border-b border-border-base">
      <td className="py-2.5 text-text-cream align-top">{label}</td>
      <td className="py-2.5 text-text-low align-top">
        {ts == null && hasData ? <span className="text-text-low italic">unknown</span> : fmtDate(ts)}
        <div className="text-[10px] text-text-low">{detail}</div>
        {error && <div className="text-[10px] text-crimson mt-0.5">{error}</div>}
      </td>
      <td className="py-2.5 align-top">{statusDisplay}</td>
      <td className="py-2.5 text-right align-top">
        <button
          onClick={onRefresh}
          disabled={busy}
          className="font-mono text-[10px] tracking-widest uppercase border border-crimson text-crimson px-3 py-1.5 hover:bg-crimson hover:text-bg-deep transition-colors disabled:opacity-40"
        >
          {busy ? '…' : 'Refresh'}
        </button>
      </td>
    </tr>
  );
}
