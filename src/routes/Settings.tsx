import { useEffect, useState } from 'react';
import { ExportImportPanel } from '../features/settings/ExportImportPanel';
import { SectionHeader } from '../components/SectionHeader';
import { LevelsEditor } from '../features/settings/LevelsEditor';
import { OnboardingWizard } from '../features/onboarding/OnboardingWizard';
import { PluginPanel } from '../features/plugin/PluginPanel';
import { useSettingsStore } from '../features/settings/store';
import { useUiStore, type Density } from '../features/ui/uiStore';
import { btnPrimaryLarge, btnDanger } from '../components/buttonStyles';
import { fmtDateTime } from '../lib/format';
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
  // Unambiguous YYYY-MM-DD HH:MM — `toLocaleString()` rendered an ambiguous
  // `2/6/2026` that clashed with the ISO dates shown elsewhere (e.g. What's New).
  if (!ts) return 'never';
  return fmtDateTime(ts);
}

function isStale(ts: number | null | undefined): boolean {
  return ts != null && Date.now() - ts > STALE_MS;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const itemDb = useItemSnapshot();
  const refreshItemDb = useRefreshItemSnapshot();
  const density = useUiStore((s) => s.density);
  const setDensity = useUiStore((s) => s.setDensity);
  const hideCrystals = useSettingsStore((s) => s.hideCrystals);
  const setHideCrystals = useSettingsStore((s) => s.setHideCrystals);
  const showSparklines = useSettingsStore((s) => s.showSparklines);
  const setShowSparklines = useSettingsStore((s) => s.setShowSparklines);
  const applyMarketTax = useSettingsStore((s) => s.applyMarketTax);
  const setApplyMarketTax = useSettingsStore((s) => s.setApplyMarketTax);

  const [showRedo, setShowRedo] = useState(false);

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
    <div className="space-y-10">
      <h2 className="font-display text-lg text-gold tracking-wide">Settings</h2>
      <section>
        <SectionHeader label="My Crafters" />
        <p className="font-mono text-[10px] text-text-low mb-3">
          Set each DoH job's level. Used to filter craftable items and power the Trained Eye threshold.
        </p>
        <LevelsEditor />
      </section>
      <section>
        <SectionHeader label="Display" />
        <DensityToggle value={density} onChange={setDensity} />
        <label className="flex items-center gap-2 cursor-pointer mt-3">
          <input
            type="checkbox"
            checked={showSparklines}
            onChange={(e) => setShowSparklines(e.target.checked)}
            className="accent-gold w-4 h-4"
          />
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
            Show price sparklines
          </span>
        </label>
        <p className="font-mono text-[10px] text-text-low mt-1 ml-6">
          Loads 7-day sale history for items in Watchlist and Crafts results. Uses additional Universalis API calls.
        </p>
        <label className="flex items-center gap-2 cursor-pointer mt-3">
          <input
            type="checkbox"
            checked={applyMarketTax}
            onChange={(e) => setApplyMarketTax(e.target.checked)}
            className="accent-gold w-4 h-4"
          />
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
            Subtract 5% marketboard tax from profit
          </span>
        </label>
        <p className="font-mono text-[10px] text-text-low mt-1 ml-6">
          Nets the marketboard retainer fee out of profit and gil/day on the Watchlist and Dashboard, so the numbers match what you actually keep.
        </p>
      </section>
      <section>
        <SectionHeader label="Filters" />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hideCrystals}
            onChange={(e) => setHideCrystals(e.target.checked)}
            className="accent-gold w-4 h-4"
          />
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
            Hide crystals, shards & clusters
          </span>
        </label>
        <p className="font-mono text-[10px] text-text-low mt-1 ml-6">
          Excludes elemental crystals (category 58) from all scan results. Quest items always exclude them.
        </p>
      </section>
      <section>
        <SectionHeader label="In-game plugin" />
        <p className="text-text-low text-sm mb-3 max-w-prose">
          Connect the ChiquigilBridge Dalamud plugin to keep your world, datacenter,
          and crafter levels in sync with your character automatically.
        </p>
        <PluginPanel />
      </section>
      <section>
        <SectionHeader label="Backup & restore" />
        <p className="text-text-low text-sm mb-3">
          Export saves your retainer levels, world/DC, watchlist, starter pack toggles, custom items,
          and per-item overrides as a JSON file.
        </p>
        <p className="text-crimson text-xs mb-3 font-mono">
          ⚠ Importing will overwrite all current settings, watchlist, and saved data.
        </p>
        <ExportImportPanel />
      </section>
      <section>
        <SectionHeader label="Data caches" />
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
            className={btnPrimaryLarge}
          >
            {allBusy ? '⟳ Refreshing…' : '⟳ Refresh all data'}
          </button>
        </div>
      </section>
      <section>
        <SectionHeader label="About" />
        <dl className="font-mono text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 max-w-md">
          <dt className="text-text-low tracking-widest uppercase text-[10px]">Web app</dt>
          <dd className="text-text-cream">v{__APP_VERSION__}</dd>
          <dt className="text-text-low tracking-widest uppercase text-[10px]">Built</dt>
          <dd className="text-text-low">{fmtDate(Date.parse(__BUILD_TIME__))}</dd>
        </dl>
        <p className="font-mono text-[10px] text-text-low mt-2 max-w-prose">
          Connected plugin version (when paired) shows under <span className="text-aether">In-game plugin</span> above.
        </p>
      </section>
      <div className="pt-4 border-t border-border-base">
        <button
          type="button"
          onClick={() => setShowRedo(true)}
          className="font-mono text-[10px] text-text-low hover:text-aether transition-colors"
        >
          Not your world? Run setup again →
        </button>
        {showRedo && (
          <OnboardingWizard
            prefill
            onComplete={() => setShowRedo(false)}
          />
        )}
      </div>
    </div>
  );
}

function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  const opts: { id: Density; label: string }[] = [
    { id: 'comfortable', label: 'Comfortable' },
    { id: 'compact',     label: 'Compact' },
  ];
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Row density</span>
      <div className="inline-flex border border-border-base">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 border-r border-border-base last:border-r-0 transition-colors ${
              value === o.id ? 'bg-bg-card-hi text-gold' : 'text-text-dim hover:text-aether'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
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
        <button onClick={onRefresh} disabled={busy} className={btnDanger}>
          {busy ? '…' : 'Refresh'}
        </button>
      </td>
    </tr>
  );
}
