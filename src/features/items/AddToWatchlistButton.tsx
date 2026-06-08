import { useWatchlistStore } from './watchlistStore';
import { STARTER_PACKS } from './starterPacks';
import { inferCategory } from '../watchlist/categorySearchCats';
import { InfoTooltip } from '../../components/InfoTooltip';
import type { Recipe } from '../../lib/recipes';
import type { TrackedItem, CrafterCode } from './types';

interface Props {
  itemId: number;
  itemName: string;
  ilvl: number;
  recipe: Recipe | null;
  /** Item search category, used to tag the watchlist category on add. */
  sc?: number;
}

function findEnabledPackContaining(
  itemId: number,
  toggles: Record<string, boolean>,
  excluded: number[],
): { label: string } | null {
  if (excluded.includes(itemId)) return null;
  for (const pack of STARTER_PACKS) {
    if (!toggles[pack.id]) continue;
    if (pack.items.some((it) => it.id === itemId)) {
      return { label: pack.label };
    }
  }
  return null;
}

export function AddToWatchlistButton({ itemId, itemName, ilvl, recipe, sc }: Props) {
  const { customItems, starterPacks, excludedItems, addCustomItem, removeCustomItem } = useWatchlistStore();
  const onList = customItems.some((i) => i.id === itemId);
  const enabledPack = findEnabledPackContaining(itemId, starterPacks, excludedItems);

  function handleAdd() {
    const crafter: CrafterCode = recipe?.classJob ?? 'ANY';
    const lvl = recipe?.recipeLevel || ilvl || 1;
    const cat = sc != null ? inferCategory(sc) : 'Glamour';
    const item: TrackedItem = { id: itemId, name: itemName, crafter, lvl, cat };
    addCustomItem(item);
  }

  if (enabledPack) {
    return (
      <InfoTooltip label={`Included via the "${enabledPack.label}" pack — disable in Settings to remove`}>
        {/* Native title too: a disabled button can swallow the JS hover, so the
            explanation would otherwise never appear and it reads as a dead chip. */}
        <button
          disabled
          title={`Already tracked via the "${enabledPack.label}" starter pack — disable that pack in Settings to remove it.`}
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 opacity-60 cursor-not-allowed"
        >
          In starter pack
        </button>
      </InfoTooltip>
    );
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
