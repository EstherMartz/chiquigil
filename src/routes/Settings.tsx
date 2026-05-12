import { ExportImportPanel } from '../features/settings/ExportImportPanel';
import { clearRecipeCache, clearRecipeSnapshot } from '../lib/recipeCache';
import { useQueryClient } from '@tanstack/react-query';
import { useItemSnapshot, useRefreshItemSnapshot } from '../features/queries/useItemSnapshot';

export default function Settings() {
  const queryClient = useQueryClient();
  const itemDb = useItemSnapshot();
  const refreshItemDb = useRefreshItemSnapshot();

  async function bustCache() {
    await clearRecipeCache();
    await clearRecipeSnapshot();
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
    queryClient.invalidateQueries({ queryKey: ['recipe-snapshot'] });
  }

  function fmtDate(ts: number | null | undefined) {
    if (!ts) return 'never';
    return new Date(ts).toLocaleString();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-10">
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Recipe cache</h2>
        <p className="text-text-low text-sm mb-3">
          Recipes are cached locally in your browser indefinitely. Bust the cache after a game patch
          or if recipe data looks wrong.
        </p>
        <button
          onClick={bustCache}
          className="font-mono text-[10px] tracking-widest uppercase border border-crimson text-crimson px-4 py-2 hover:bg-crimson hover:text-bg-deep"
        >
          Clear recipe cache
        </button>
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Item DB</h2>
        <p className="text-text-low text-sm mb-3">
          Used by Best Deals Queries to scan the whole DC market. Fetched once from XIVAPI and cached
          indefinitely. Refresh after a game patch.
        </p>
        <div className="font-mono text-xs text-text-low mb-3">
          {itemDb.data
            ? <>Cached: <span className="text-text-cream">{itemDb.data.items.length.toLocaleString()}</span> items · last refreshed <span className="text-text-cream">{fmtDate(itemDb.data.updatedAt)}</span></>
            : <>Not yet fetched.</>}
        </div>
        <button
          onClick={refreshItemDb}
          className="font-mono text-[10px] tracking-widest uppercase border border-crimson text-crimson px-4 py-2 hover:bg-crimson hover:text-bg-deep"
        >
          Refresh item DB
        </button>
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
