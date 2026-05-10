import { WorldDcPicker } from '../features/settings/WorldDcPicker';
import { LevelsEditor } from '../features/settings/LevelsEditor';
import { PackToggles } from '../features/settings/PackToggles';
import { AddItemSearch } from '../features/settings/AddItemSearch';
import { clearRecipeCache } from '../lib/recipeCache';
import { useQueryClient } from '@tanstack/react-query';

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
