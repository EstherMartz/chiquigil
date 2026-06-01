import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShoppingListItem {
  id: number;
  qty: number;
  craftIntermediates: boolean;
}

export interface ShoppingListState {
  _v: 1;
  items: ShoppingListItem[];
  addItem: (id: number, qty?: number) => void;
  removeItem: (id: number) => void;
  setQty: (id: number, qty: number) => void;
  clear: () => void;
}

export function defaultShoppingList(): Pick<ShoppingListState, '_v' | 'items'> {
  return { _v: 1, items: [] };
}

export const useShoppingListStore = create<ShoppingListState>()(
  persist(
    (set) => ({
      ...defaultShoppingList(),
      addItem: (id, qty = 1) => set((s) => {
        const existing = s.items.find((i) => i.id === id);
        if (existing) {
          return {
            items: s.items.map((i) =>
              i.id === id ? { ...i, qty: i.qty + qty } : i,
            ),
          };
        }
        return { items: [...s.items, { id, qty, craftIntermediates: false }] };
      }),
      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      setQty: (id, qty) => set((s) => {
        if (qty <= 0) return { items: s.items.filter((i) => i.id !== id) };
        return { items: s.items.map((i) => (i.id === id ? { ...i, qty } : i)) };
      }),
      clear: () => set({ items: [] }),
    }),
    { name: 'ffxiv-helper:shoppingList' },
  ),
);
