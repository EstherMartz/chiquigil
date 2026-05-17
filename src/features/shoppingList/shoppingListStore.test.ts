import { describe, it, expect, beforeEach } from 'vitest';
import { useShoppingListStore, defaultShoppingList } from './shoppingListStore';

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

describe('shoppingList store', () => {
  it('starts empty', () => {
    expect(useShoppingListStore.getState().items).toEqual([]);
  });

  it('addItem appends with qty 1 and craftIntermediates false by default', () => {
    useShoppingListStore.getState().addItem(123);
    expect(useShoppingListStore.getState().items).toEqual([
      { id: 123, qty: 1, craftIntermediates: false },
    ]);
  });

  it('addItem dedupes by id and increments qty', () => {
    useShoppingListStore.getState().addItem(123);
    useShoppingListStore.getState().addItem(123, 2);
    expect(useShoppingListStore.getState().items).toEqual([
      { id: 123, qty: 3, craftIntermediates: false },
    ]);
  });

  it('addItem respects an explicit qty for first-time add', () => {
    useShoppingListStore.getState().addItem(7, 5);
    expect(useShoppingListStore.getState().items[0].qty).toBe(5);
  });

  it('removeItem drops by id', () => {
    useShoppingListStore.getState().addItem(1);
    useShoppingListStore.getState().addItem(2);
    useShoppingListStore.getState().removeItem(1);
    expect(useShoppingListStore.getState().items.map((i) => i.id)).toEqual([2]);
  });

  it('setQty updates qty in place', () => {
    useShoppingListStore.getState().addItem(42);
    useShoppingListStore.getState().setQty(42, 9);
    expect(useShoppingListStore.getState().items[0].qty).toBe(9);
  });

  it('setQty with 0 or negative removes the row', () => {
    useShoppingListStore.getState().addItem(42);
    useShoppingListStore.getState().setQty(42, 0);
    expect(useShoppingListStore.getState().items).toEqual([]);
  });

  it('setCraftIntermediates flips the per-item flag', () => {
    useShoppingListStore.getState().addItem(99);
    useShoppingListStore.getState().setCraftIntermediates(99, true);
    expect(useShoppingListStore.getState().items[0].craftIntermediates).toBe(true);
  });

  it('clear empties the list', () => {
    useShoppingListStore.getState().addItem(1);
    useShoppingListStore.getState().addItem(2);
    useShoppingListStore.getState().clear();
    expect(useShoppingListStore.getState().items).toEqual([]);
  });

  it('persists to localStorage under ffxiv-helper:shoppingList', () => {
    useShoppingListStore.getState().addItem(555, 3);
    const raw = localStorage.getItem('ffxiv-helper:shoppingList');
    expect(raw).toBeTruthy();
    expect(raw!).toContain('"id":555');
    expect(raw!).toContain('"qty":3');
  });
});
