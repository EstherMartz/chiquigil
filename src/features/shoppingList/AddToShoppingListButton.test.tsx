import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddToShoppingListButton } from './AddToShoppingListButton';
import { useShoppingListStore, defaultShoppingList } from './shoppingListStore';

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

describe('AddToShoppingListButton', () => {
  it('renders an enabled add button for any item (no recipe required)', () => {
    render(<AddToShoppingListButton itemId={1} />);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toContain('Craft Helper');
  });

  it('adds the item to the store on click', () => {
    render(<AddToShoppingListButton itemId={42} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useShoppingListStore.getState().items).toEqual([
      { id: 42, qty: 1, craftIntermediates: false },
    ]);
  });

  it('renders "On list · Remove" when the item is already on the list', () => {
    useShoppingListStore.getState().addItem(42);
    render(<AddToShoppingListButton itemId={42} />);
    expect(screen.getByRole('button').textContent).toContain('On list');
  });

  it('removes the item on click when already on the list', () => {
    useShoppingListStore.getState().addItem(42);
    render(<AddToShoppingListButton itemId={42} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useShoppingListStore.getState().items).toEqual([]);
  });
});
