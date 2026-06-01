import { useShoppingListStore } from './shoppingListStore';

interface Props {
  itemId: number;
}

export function AddToShoppingListButton({ itemId }: Props) {
  const items = useShoppingListStore((s) => s.items);
  const addItem = useShoppingListStore((s) => s.addItem);
  const removeItem = useShoppingListStore((s) => s.removeItem);
  const onList = items.some((i) => i.id === itemId);

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
      + Craft Helper
    </button>
  );
}
