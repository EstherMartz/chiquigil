import { useState } from 'react';
import { useShoppingListStore } from './shoppingListStore';

interface Searchable { id: number; name: string; hasRecipe: boolean }

interface Props {
  searchableItems: Searchable[];
  onPlan: () => void;
}

export function ShoppingListPanel({ searchableItems, onPlan }: Props) {
  const items = useShoppingListStore((s) => s.items);
  const addItem = useShoppingListStore((s) => s.addItem);
  const removeItem = useShoppingListStore((s) => s.removeItem);
  const setQty = useShoppingListStore((s) => s.setQty);
  const setCraftIntermediates = useShoppingListStore((s) => s.setCraftIntermediates);
  const clear = useShoppingListStore((s) => s.clear);

  const [query, setQuery] = useState('');
  const [qty, setQtyInput] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const nameById = new Map(searchableItems.map((s) => [s.id, s.name]));

  function handleAdd() {
    setError(null);
    const q = query.trim().toLowerCase();
    if (!q) return;
    const match = searchableItems.find((s) => s.name.toLowerCase().includes(q));
    if (!match) {
      setError('No match in catalog.');
      return;
    }
    if (!match.hasRecipe) {
      setError(`"${match.name}" is not craftable.`);
      return;
    }
    addItem(match.id, Math.max(1, qty));
    setQuery('');
    setQtyInput(1);
  }

  return (
    <section className="border border-border-base bg-bg-card">
      <div className="flex flex-wrap items-end gap-2 p-3 border-b border-border-base">
        <div className="flex flex-col gap-1 grow min-w-[200px]">
          <label htmlFor="sl-search" className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            Search item
          </label>
          <input
            id="sl-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            placeholder="Type an item name…"
            className="bg-bg-card-lo border border-border-base text-text-cream font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-aether"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sl-qty" className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            Qty
          </label>
          <input
            id="sl-qty"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQtyInput(Math.max(1, parseInt(e.target.value) || 1))}
            className="bg-bg-card-lo border border-border-base text-text-cream font-mono text-xs px-2 py-1.5 w-20"
          />
        </div>
        <button
          onClick={handleAdd}
          className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-2 hover:bg-aether hover:text-bg-deep transition-colors"
        >
          Add
        </button>
        {error && <div className="text-crimson font-mono text-[11px] basis-full">{error}</div>}
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-text-low font-mono text-xs italic">
          Add items from the watchlist, an item page, or the search box above.
        </div>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.id} className="border-t border-border-base px-3 py-2 flex items-center gap-3 flex-wrap">
              <span className="text-text-cream grow min-w-[150px]">
                {nameById.get(it.id) ?? `Item #${it.id}`}
              </span>
              <label className="flex items-center gap-1 font-mono text-[10px] uppercase text-text-low">
                <span>Qty</span>
                <input
                  aria-label={`Edit qty for ${nameById.get(it.id) ?? it.id}`}
                  type="number"
                  min={1}
                  value={it.qty}
                  onChange={(e) => setQty(it.id, Math.max(1, parseInt(e.target.value) || 1))}
                  className="bg-bg-card-lo border border-border-base text-text-cream font-mono text-xs px-2 py-1 w-16"
                />
              </label>
              <label className="flex items-center gap-1 font-mono text-[10px] uppercase text-text-low">
                <input
                  type="checkbox"
                  checked={it.craftIntermediates}
                  onChange={(e) => setCraftIntermediates(it.id, e.target.checked)}
                />
                <span>Craft sub-ingredients</span>
              </label>
              <button
                onClick={() => removeItem(it.id)}
                aria-label={`Remove ${nameById.get(it.id) ?? it.id}`}
                className="font-mono text-text-low hover:text-crimson px-2"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 p-3 border-t border-border-base">
        <span className="font-mono text-[11px] text-text-low">{items.length} items</span>
        <div className="flex gap-2">
          <button
            onClick={() => clear()}
            disabled={items.length === 0}
            className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-crimson hover:text-crimson disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear list
          </button>
          <button
            onClick={onPlan}
            disabled={items.length === 0}
            className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-3 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Plan shopping
          </button>
        </div>
      </div>
    </section>
  );
}
