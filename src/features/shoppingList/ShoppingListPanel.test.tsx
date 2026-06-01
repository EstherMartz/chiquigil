import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShoppingListPanel } from './ShoppingListPanel';
import { useShoppingListStore, defaultShoppingList } from './shoppingListStore';

const sample = [
  { id: 1, name: 'Iron Ingot', hasRecipe: true },
  { id: 2, name: 'Bronze Ingot', hasRecipe: true },
  { id: 3, name: 'Fire Crystal', hasRecipe: false },
];

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

describe('ShoppingListPanel', () => {
  it('renders empty state when list is empty', () => {
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    expect(screen.getByText(/add items from the watchlist/i)).toBeInTheDocument();
  });

  it('adds a craftable item via the search + Add button', () => {
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    fireEvent.change(screen.getByLabelText(/search item/i), { target: { value: 'iron' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(useShoppingListStore.getState().items[0]).toMatchObject({ id: 1, qty: 1 });
  });

  it('respects qty input on add', () => {
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    fireEvent.change(screen.getByLabelText(/search item/i), { target: { value: 'iron' } });
    fireEvent.change(screen.getByLabelText(/qty/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(useShoppingListStore.getState().items[0]).toMatchObject({ id: 1, qty: 5 });
  });

  it('adds a non-craftable item from the search box', () => {
    useShoppingListStore.setState(defaultShoppingList());
    const searchable = [{ id: 7, name: 'Copper Ore', hasRecipe: false }];
    render(<ShoppingListPanel searchableItems={searchable} onPlan={() => {}} />);
    fireEvent.change(screen.getByLabelText(/search item/i), { target: { value: 'copper' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(useShoppingListStore.getState().items.map((i) => i.id)).toContain(7);
  });

  it('shows no-match inline error when search has no hits', () => {
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    fireEvent.change(screen.getByLabelText(/search item/i), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByText(/no match/i)).toBeInTheDocument();
  });

  it('renders rows for each item with editable qty and remove button', () => {
    useShoppingListStore.getState().addItem(1, 4);
    useShoppingListStore.getState().addItem(2, 1);
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
    expect(screen.getByText('Bronze Ingot')).toBeInTheDocument();

    // Edit qty on Iron Ingot
    const qtyInputs = screen.getAllByLabelText(/edit qty/i);
    fireEvent.change(qtyInputs[0], { target: { value: '7' } });
    expect(useShoppingListStore.getState().items.find((i) => i.id === 1)?.qty).toBe(7);

    // Remove Iron Ingot
    const removeButtons = screen.getAllByLabelText(/remove/i);
    fireEvent.click(removeButtons[0]);
    expect(useShoppingListStore.getState().items.map((i) => i.id)).toEqual([2]);
  });

  it('toggles craftIntermediates per item', () => {
    useShoppingListStore.getState().addItem(1);
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    const toggle = screen.getByLabelText(/craft sub-ingredients/i);
    fireEvent.click(toggle);
    expect(useShoppingListStore.getState().items[0].craftIntermediates).toBe(true);
  });

  it('clear button empties the store', () => {
    useShoppingListStore.getState().addItem(1);
    useShoppingListStore.getState().addItem(2);
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /clear list/i }));
    expect(useShoppingListStore.getState().items).toEqual([]);
  });

  it('calls onPlan when Plan shopping is clicked', () => {
    let called = 0;
    useShoppingListStore.getState().addItem(1);
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => { called++; }} />);
    fireEvent.click(screen.getByRole('button', { name: /plan shopping/i }));
    expect(called).toBe(1);
  });
});
