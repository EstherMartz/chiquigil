import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddToShoppingListButton } from './AddToShoppingListButton';
import { useShoppingListStore, defaultShoppingList } from './shoppingListStore';

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

describe('AddToShoppingListButton', () => {
  it('renders disabled "Not craftable" when no recipe is provided', () => {
    render(<AddToShoppingListButton itemId={1} hasRecipe={false} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain('Not craftable');
  });

  it('renders "+ Shopping list" when item is craftable and not on list', () => {
    render(<AddToShoppingListButton itemId={1} hasRecipe={true} />);
    expect(screen.getByRole('button').textContent).toContain('+ Shopping list');
  });

  it('adds the item to the store on click', () => {
    render(<AddToShoppingListButton itemId={42} hasRecipe={true} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useShoppingListStore.getState().items).toEqual([
      { id: 42, qty: 1, craftIntermediates: false },
    ]);
  });

  it('renders "✓ On list · Remove" when item is on the list', () => {
    useShoppingListStore.getState().addItem(42);
    render(<AddToShoppingListButton itemId={42} hasRecipe={true} />);
    expect(screen.getByRole('button').textContent).toContain('On list');
  });

  it('removes the item on click when already on the list', () => {
    useShoppingListStore.getState().addItem(42);
    render(<AddToShoppingListButton itemId={42} hasRecipe={true} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useShoppingListStore.getState().items).toEqual([]);
  });
});
