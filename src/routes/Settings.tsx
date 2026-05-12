import { useEffect, useState } from 'react';
import { ExportImportPanel } from '../features/settings/ExportImportPanel';
import {
  clearRecipeCache,
  clearRecipeSnapshot,
  clearGatheringCatalog,
  clearMarketCache,
  getItemSnapshotUpdatedAt,
  getRecipeSnapshotUpdatedAt,
  getGatheringCatalogUpdatedAt,
} from '../lib/recipeCache';
import { _resetMarketCacheForTests } from '../lib/universalis';
import { useQueryClient } from '@tanstack/react-query';
import { useItemSnapshot, useRefreshItemSnapshot } from '../features/queries/useItemSnapshot';

const STALE_DAYS = 7;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

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

  const [recipeTs, setRecipeTs] = useState<number | null>(null);
  const [gatherTs, setGatherTs] = useState<number | null>(null);
  const [itemTs, setItemTs] = useState<number | null>(null);

  async function reloadTimestamps() {
    setRecipeTs((await getRecipeSnapshotUpdatedAt()) ?? null);
    setGatherTs((await getGatheringCatalogUpdatedAt()) ?? null);
    setItemTs((await getItemSnapshotUpdatedAt()) ?? null);
  }
  useEffect(() => { reloadTimestamps(); }, [itemDb.data]);

  async function bustRecipeCaches() {
    await clearRecipeCache();
    await clearRecipeSnapshot();
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
    queryClient.invalidateQueries({ queryKey: ['recipe-snapshot'] });
    await reloadTimestamps();
  }

  async function bustGatheringCatalog() {
    await clearGatheringCatalog();
    queryClient.invalidateQueries({ queryKey: ['gathering-catalog'] });
    await reloadTimestamps();
  }

  async function bustMarketCache() {
    _resetMarketCacheForTests();
    await clearMarketCache();
  }

  async function refreshAll() {
    await Promise.all([
      clearRecipeCache(),
      clearRecipeSnapshot(),
      clearGatheringCatalog(),
      clearMarketCache(),
    ]);
    _resetMarketCacheForTests();
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
    queryClient.invalidateQueries({ queryKey: ['recipe-snapshot'] });
    queryClient.invalidateQueries({ queryKey: ['gathering-catalog'] });
    refreshItemDb();
    await reloadTimestamps();
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
              ts={itemTs}
              detail={itemDb.data ? `${itemDb.data.items.length.toLocaleString()} items` : '—'}
              onRefresh={refreshItemDb}
            />
            <CacheRow
              label="Recipe snapshot"
              ts={recipeTs}
              detail="all recipes (bulk)"
              onRefresh={bustRecipeCaches}
            />
            <CacheRow
              label="Gathering catalog"
              ts={gatherTs}
              detail="gather nodes + timing"
              onRefresh={bustGatheringCatalog}
            />
            <CacheRow
              label="Universalis prices"
              ts={null}
              detail="in-memory + IDB, 30-min TTL"
              onRefresh={bustMarketCache}
            />
          </tbody>
        </table>
        <div className="mt-5">
          <button
            onClick={refreshAll}
            className="font-display text-xs tracking-widest uppercase bg-bg-card-hi border border-gold text-gold px-5 py-2.5 hover:bg-gold hover:text-bg-deep transition-colors"
          >
            ⟳ Refresh all data
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
  ts: number | null;
  detail: string;
  onRefresh: () => void;
}

function CacheRow({ label, ts, detail, onRefresh }: CacheRowProps) {
  const stale = isStale(ts);
  return (
    <tr className="border-b border-border-base">
      <td className="py-2.5 text-text-cream">{label}</td>
      <td className="py-2.5 text-text-low">
        {fmtDate(ts)}
        <div className="text-[10px] text-text-low">{detail}</div>
      </td>
      <td className="py-2.5">
        {ts == null ? (
          <span className="text-text-low">—</span>
        ) : stale ? (
          <span className="text-crimson">stale (&gt;{STALE_DAYS}d)</span>
        ) : (
          <span className="text-jade">fresh</span>
        )}
      </td>
      <td className="py-2.5 text-right">
        <button
          onClick={onRefresh}
          className="font-mono text-[10px] tracking-widest uppercase border border-crimson text-crimson px-3 py-1.5 hover:bg-crimson hover:text-bg-deep transition-colors"
        >
          Refresh
        </button>
      </td>
    </tr>
  );
}
