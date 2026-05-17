import { useWatchlistStore } from './watchlistStore';
import type { Recipe } from '../../lib/recipes';
import type { TrackedItem, CrafterCode } from './types';

interface Props {
  itemId: number;
  itemName: string;
  ilvl: number;
  recipe: Recipe | null;
}

export function AddToWatchlistButton({ itemId, itemName, ilvl, recipe }: Props) {
  const customItems = useWatchlistStore((s) => s.customItems);
  const addCustomItem = useWatchlistStore((s) => s.addCustomItem);
  const removeCustomItem = useWatchlistStore((s) => s.removeCustomItem);
  const onList = customItems.some((i) => i.id === itemId);

  function handleAdd() {
    const crafter: CrafterCode = recipe?.classJob ?? 'ANY';
    const lvl = recipe?.recipeLevel || ilvl || 1;
    const item: TrackedItem = { id: itemId, name: itemName, crafter, lvl, cat: 'Glamour' };
    addCustomItem(item);
  }

  if (onList) {
    return (
      <button
        onClick={() => removeCustomItem(itemId)}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-crimson hover:text-crimson transition-colors"
      >
        ✓ On watchlist · Remove
      </button>
    );
  }
  return (
    <button
      onClick={handleAdd}
      className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-2 hover:bg-aether hover:text-bg-deep transition-colors"
    >
      + Watchlist
    </button>
  );
}
