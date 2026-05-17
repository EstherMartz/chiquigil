import { useShoppingListStore } from './shoppingListStore';

interface Props {
  itemId: number;
  hasRecipe: boolean;
}

export function AddToShoppingListButton({ itemId, hasRecipe }: Props) {
  const items = useShoppingListStore((s) => s.items);
  const addItem = useShoppingListStore((s) => s.addItem);
  const removeItem = useShoppingListStore((s) => s.removeItem);
  const onList = items.some((i) => i.id === itemId);

  if (!hasRecipe) {
    return (
      <button
        disabled
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 opacity-60 cursor-not-allowed"
      >
        Not craftable
      </button>
    );
  }

  if (onList) {
    return (
      <button
        onClick={() => removeItem(itemId)}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-crimson hover:text-crimson transition-colors"
      >
        ✓ On list · Remove
      </button>
    );
  }

  return (
    <button
      onClick={() => addItem(itemId)}
      className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-2 hover:bg-aether hover:text-bg-deep transition-colors"
    >
      + Shopping list
    </button>
  );
}
