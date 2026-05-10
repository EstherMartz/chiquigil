import { WorldDcPicker } from '../features/settings/WorldDcPicker';
import { LevelsEditor } from '../features/settings/LevelsEditor';
import { PackToggles } from '../features/settings/PackToggles';
import { AddItemSearch } from '../features/settings/AddItemSearch';
import { clearRecipeCache } from '../lib/recipeCache';
import { useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '../features/settings/store';

function SessionDefaults() {
  const {
    overheadMinutes, batchCapDays, defaultCraftTimeSeconds,
    setOverheadMinutes, setBatchCapDays, setDefaultCraftTimeSeconds,
  } = useSettingsStore();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Overhead (min)</span>
        <input
          type="number" min={0} max={60}
          value={overheadMinutes}
          onChange={(e) => setOverheadMinutes(Math.max(0, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
        <span className="block mt-1 font-mono text-[10px] text-text-low">subtracted from time budget</span>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Default craft (sec)</span>
        <input
          type="number" min={5} max={600}
          value={defaultCraftTimeSeconds}
          onChange={(e) => setDefaultCraftTimeSeconds(Math.max(5, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
        <span className="block mt-1 font-mono text-[10px] text-text-low">heuristic baseline</span>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Batch cap (days)</span>
        <input
          type="number" min={1} max={30}
          value={batchCapDays}
          onChange={(e) => setBatchCapDays(Math.max(1, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
        <span className="block mt-1 font-mono text-[10px] text-text-low">qty cap = velocity × this</span>
      </label>
    </div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();

  async function bustCache() {
    await clearRecipeCache();
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
  }
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-10">
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">World &amp; Data Center</h2>
        <WorldDcPicker />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Retainer levels</h2>
        <LevelsEditor />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Session defaults</h2>
        <SessionDefaults />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Starter packs</h2>
        <PackToggles />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Add custom items</h2>
        <AddItemSearch />
      </section>
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
    </div>
  );
}
