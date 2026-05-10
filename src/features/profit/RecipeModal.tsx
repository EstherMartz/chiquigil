import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';
import type { TrackedItem } from '../items/types';
import { fmtGil } from '../../lib/format';

interface Props {
  item: TrackedItem;
  recipe: Recipe;
  recipeMap: Map<number, Recipe | null>;
  nameMap: Map<number, string>;
  phantom: MarketData;
  dc: MarketData;
  craftIntermediates: boolean;
  onToggleCraftIntermediates: (value: boolean) => void;
  craftTimeSeconds: number | undefined;
  defaultCraftTimeSeconds: number;
  onChangeCraftTime: (seconds: number | undefined) => void;
  onClose: () => void;
}

export function RecipeModal({
  item,
  recipe,
  recipeMap,
  nameMap,
  phantom,
  dc,
  craftIntermediates,
  onToggleCraftIntermediates,
  craftTimeSeconds,
  defaultCraftTimeSeconds,
  onChangeCraftTime,
  onClose,
}: Props) {
  const ingredientName = (id: number) => {
    const name = nameMap.get(id);
    if (!name) return `#${id}`;
    return recipeMap.get(id) ? `${name} (craftable)` : name;
  };

  return (
    <div
      className="fixed inset-0 bg-bg-deep/80 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-hi max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="font-mono text-[10px] tracking-widest text-aether uppercase">
              {recipe.classJob} · lvl {recipe.recipeLevel}
            </div>
            <h3 className="font-display text-xl text-gold">{item.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-text-dim hover:text-aether font-mono text-sm"
          >
            ✕ Close
          </button>
        </div>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase border-b border-border-base">
              <th className="text-left py-2">Ingredient</th>
              <th className="text-right py-2">Qty</th>
              <th className="text-right py-2">Unit price</th>
              <th className="text-right py-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ing) => {
              const unit = dc[ing.itemId]?.minNQ ?? phantom[ing.itemId]?.avgNQ ?? 0;
              return (
                <tr key={ing.itemId} className="border-b border-border-base">
                  <td className="py-2">{ingredientName(ing.itemId)}</td>
                  <td className="py-2 text-right font-mono">{ing.amount}</td>
                  <td className="py-2 text-right font-mono">{fmtGil(unit)}</td>
                  <td className="py-2 text-right font-mono">{fmtGil(unit * ing.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <label className="flex items-center gap-2 text-sm mb-4">
          <input
            type="checkbox"
            checked={craftIntermediates}
            onChange={(e) => onToggleCraftIntermediates(e.target.checked)}
          />
          <span>Recurse: craft intermediates myself (one level deep)</span>
        </label>

        <label className="flex items-center gap-2 text-sm mb-4">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Craft time (sec)</span>
          <input
            type="number"
            min={0}
            placeholder={`auto: ${Math.min(180, defaultCraftTimeSeconds + Math.max(0, recipe.recipeLevel - 50))}`}
            value={craftTimeSeconds ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0);
              onChangeCraftTime(v);
            }}
            className="bg-bg-card border border-border-base px-2 py-1 font-mono text-sm w-24"
          />
          <span className="text-text-low text-xs">empty = use heuristic</span>
        </label>

        <div className="text-xs text-text-low font-mono">
          Note: Phase 2 looks up ingredient names by id only. Names land in Phase 4 via XIVAPI item-name cache.
        </div>
      </div>
    </div>
  );
}
