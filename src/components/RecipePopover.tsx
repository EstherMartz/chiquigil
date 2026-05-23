import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchRecipeForItem, type Recipe } from '../lib/recipes';
import { getCachedRecipe, putCachedRecipe } from '../lib/recipeCache';
import { useGarlandItem } from '../features/queries/useGarlandItem';
import { useSnapshotById } from '../features/queries/useSnapshotById';
import { garlandItemUrl, gamerEscapeItemUrl, universalisItemUrl } from '../lib/format';
import type { GarlandIngredient, IngredientSource } from '../lib/garlandData';

interface Props {
  itemId: number;
  itemName: string;
}

const SOURCE_LABEL: Record<IngredientSource, string> = {
  vendor: 'Vendor',
  gather: 'Gather',
  craft: 'Craft',
  other: 'Other',
};

const SOURCE_ORDER: IngredientSource[] = ['vendor', 'gather', 'craft', 'other'];

function useRecipeFor(itemId: number) {
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await getCachedRecipe(itemId);
      if (cached !== undefined) {
        if (!cancelled) setRecipe(cached);
        return;
      }
      try {
        const fresh = await fetchRecipeForItem(itemId);
        await putCachedRecipe(itemId, fresh);
        if (!cancelled) setRecipe(fresh);
      } catch {
        if (!cancelled) setRecipe(null);
      }
    })();
    return () => { cancelled = true; };
  }, [itemId]);
  return recipe;
}

export function RecipePopover({ itemId, itemName }: Props) {
  const recipe = useRecipeFor(itemId);
  const garland = useGarlandItem(itemId);
  const byId = useSnapshotById();
  const headerIlvl = byId.get(itemId)?.ilvl;

  const loading = recipe === undefined;
  const isNotCraftable = recipe === null;

  const grouped: Record<IngredientSource, GarlandIngredient[]> | null = (() => {
    if (!garland.data) return null;
    const m: Record<IngredientSource, GarlandIngredient[]> = { vendor: [], gather: [], craft: [], other: [] };
    for (const ing of garland.data.ingredients) m[ing.source].push(ing);
    return m;
  })();

  return (
    <div className="w-[22rem] sm:w-[24rem] bg-bg-card border border-border-base shadow-2xl p-4 font-body text-text-cream">
      <div className="flex items-baseline gap-2 flex-wrap border-b border-border-base pb-2">
        {headerIlvl != null && headerIlvl > 1 && (
          <span className="font-mono text-[10px] tracking-widest text-gold tabular-nums">i{headerIlvl}</span>
        )}
        <span className="font-display text-base text-gold-hi leading-tight">{itemName}</span>
      </div>

      {loading && (
        <div className="py-4 font-mono text-[10px] text-text-low tracking-widest uppercase">Loading recipe…</div>
      )}

      {isNotCraftable && (
        <div className="py-4 font-mono text-[10px] text-text-low tracking-widest uppercase">Not craftable</div>
      )}

      {recipe && (
        <>
          <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
            <span className="text-aether border border-border-base px-1.5 py-0.5 leading-none">{recipe.classJob}</span>
            <span className="text-text-cream">Lv. {recipe.recipeLevel}</span>
            {recipe.stats && recipe.stats.stars > 0 && (
              <span className="text-gold">{'★'.repeat(recipe.stats.stars)}</span>
            )}
          </div>

          {recipe.stats && (
            <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-[10px]">
              <Stat label="Dur" value={recipe.stats.durability} />
              <Stat label="Prog" value={recipe.stats.progress} />
              <Stat label="Qual" value={recipe.stats.quality} />
              {recipe.stats.requiredCraftsmanship > 0 && (
                <Stat label="Req Crfm" value={recipe.stats.requiredCraftsmanship} />
              )}
              {recipe.stats.requiredControl > 0 && (
                <Stat label="Req Ctrl" value={recipe.stats.requiredControl} />
              )}
            </dl>
          )}

          <div className="mt-3 border-t border-border-base pt-2">
            <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-text-low mb-1.5">Ingredients</div>
            {garland.isLoading && (
              <div className="font-mono text-[10px] text-text-low">Loading sources…</div>
            )}
            {garland.isError && (
              <FallbackIngredients recipe={recipe} />
            )}
            {grouped && (
              <div className="space-y-2">
                {SOURCE_ORDER.map((src) => {
                  const rows = grouped[src];
                  if (rows.length === 0) return null;
                  return (
                    <div key={src}>
                      <div className="font-mono text-[9px] tracking-widest uppercase text-text-low mb-0.5">
                        {SOURCE_LABEL[src]}
                      </div>
                      <ul className="space-y-0.5">
                        {rows.map((r) => <IngredientRow key={r.id} r={r} />)}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-border-base flex justify-end gap-3">
            <a
              href={gamerEscapeItemUrl(itemName)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-text-low hover:text-aether transition-colors"
              title="Gamer Escape wiki"
            >
              GE ↗
            </a>
            <a
              href={universalisItemUrl(itemId)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-text-low hover:text-aether transition-colors"
              title="Universalis (market data)"
            >
              UV ↗
            </a>
            <a
              href={garlandItemUrl(itemId)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-text-low hover:text-aether transition-colors"
              title="Open on Garland Tools"
            >
              Garland Tools ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-text-low uppercase tracking-widest">{label}</dt>
      <dd className="text-text-cream tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

function IngredientRow({ r }: { r: GarlandIngredient }) {
  return (
    <li className="flex items-baseline gap-2 font-mono text-[11px]">
      <span className="text-gold tabular-nums w-6 text-right">{r.amount}×</span>
      {r.ilvl > 1 && (
        <span className="text-[9px] text-gold tabular-nums">i{r.ilvl}</span>
      )}
      <Link
        to={`/item/${r.id}`}
        className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-2 transition-colors flex-1 truncate"
      >
        {r.name}
      </Link>
      <a
        href={gamerEscapeItemUrl(r.name)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-2 transition-colors"
        title="Gamer Escape wiki"
      >
        ↗
      </a>
      <a
        href={universalisItemUrl(r.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-2 transition-colors"
        title="Universalis (market data)"
      >
        UV
      </a>
    </li>
  );
}

function FallbackIngredients({ recipe }: { recipe: Recipe }) {
  const byId = useSnapshotById();
  return (
    <ul className="space-y-0.5">
      {recipe.ingredients.map((ing) => {
        const snap = byId.get(ing.itemId);
        const itemName = snap?.name ?? `#${ing.itemId}`;
        return (
          <li key={ing.itemId} className="flex items-baseline gap-2 font-mono text-[11px]">
            <span className="text-gold tabular-nums w-6 text-right">{ing.amount}×</span>
            {snap?.ilvl != null && snap.ilvl > 1 && (
              <span className="text-[9px] text-gold tabular-nums">i{snap.ilvl}</span>
            )}
            <Link
              to={`/item/${ing.itemId}`}
              className="text-text-cream hover:text-aether transition-colors flex-1 truncate"
            >
              {itemName}
            </Link>
            {snap?.name && (
              <>
                <a
                  href={gamerEscapeItemUrl(snap.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-2 transition-colors"
                  title="Gamer Escape wiki"
                >
                  ↗
                </a>
                <a
                  href={universalisItemUrl(ing.itemId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-2 transition-colors"
                  title="Universalis (market data)"
                >
                  UV
                </a>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
