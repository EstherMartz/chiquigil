import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddToWatchlistButton } from './AddToWatchlistButton';
import { useWatchlistStore, defaultWatchlist } from './watchlistStore';
import { STARTER_PACKS } from './starterPacks';
import type { Recipe } from '../../lib/recipes';

beforeEach(() => {
  localStorage.clear();
  useWatchlistStore.setState(defaultWatchlist());
});

const baseProps = {
  itemId: 1234,
  itemName: 'Test Glamour',
  ilvl: 90,
  recipe: { itemResultId: 1234, classJob: 'LTW', recipeLevel: 90, ingredients: [] } satisfies Recipe,
};

describe('AddToWatchlistButton', () => {
  it('shows "+ Watchlist" when the item is not added', () => {
    render(<AddToWatchlistButton {...baseProps} />);
    expect(screen.getByRole('button', { name: /\+ watchlist/i })).toBeInTheDocument();
  });

  it('adds the item with the recipe crafter when clicked', () => {
    render(<AddToWatchlistButton {...baseProps} />);
    fireEvent.click(screen.getByRole('button'));
    const stored = useWatchlistStore.getState().customItems;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 1234, name: 'Test Glamour', crafter: 'LTW', lvl: 90, cat: 'Glamour' });
  });

  it('uses crafter "ANY" when no recipe is provided', () => {
    render(<AddToWatchlistButton {...baseProps} recipe={null} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useWatchlistStore.getState().customItems[0].crafter).toBe('ANY');
  });

  it('shows the remove state once added and removes on click', () => {
    useWatchlistStore.getState().addCustomItem({
      id: 1234, name: 'Test Glamour', crafter: 'LTW', lvl: 90, cat: 'Glamour',
    });
    render(<AddToWatchlistButton {...baseProps} />);
    const btn = screen.getByRole('button', { name: /on watchlist · remove/i });
    fireEvent.click(btn);
    expect(useWatchlistStore.getState().customItems).toEqual([]);
  });

  it('shows the disabled "In starter pack" state when the item is in an enabled pack', () => {
    // Find any item from any starter pack and use its real id
    const packWithItem = STARTER_PACKS.find((p) => p.items.length > 0)!;
    const item = packWithItem.items[0];

    // Make sure the pack is enabled (it should be in defaults if defaultOn=true,
    // but force it on to be safe)
    useWatchlistStore.setState({
      ...useWatchlistStore.getState(),
      starterPacks: { ...useWatchlistStore.getState().starterPacks, [packWithItem.id]: true },
    });

    render(
      <AddToWatchlistButton
        itemId={item.id}
        itemName={item.name}
        ilvl={item.lvl}
        recipe={null}
      />,
    );
    const btn = screen.getByRole('button', { name: /in starter pack/i });
    expect(btn).toBeDisabled();
  });

  it('does NOT show disabled state when the item is in a DISABLED starter pack', () => {
    const packWithItem = STARTER_PACKS.find((p) => p.items.length > 0)!;
    const item = packWithItem.items[0];

    useWatchlistStore.setState({
      ...useWatchlistStore.getState(),
      starterPacks: { ...useWatchlistStore.getState().starterPacks, [packWithItem.id]: false },
    });

    render(
      <AddToWatchlistButton
        itemId={item.id}
        itemName={item.name}
        ilvl={item.lvl}
        recipe={null}
      />,
    );
    // Should show the normal "+ Watchlist" add button instead
    expect(screen.getByRole('button', { name: /\+ watchlist/i })).toBeInTheDocument();
  });

  it('treats excluded items as NOT in starter pack', () => {
    const packWithItem = STARTER_PACKS.find((p) => p.items.length > 0)!;
    const item = packWithItem.items[0];

    useWatchlistStore.setState({
      ...useWatchlistStore.getState(),
      starterPacks: { ...useWatchlistStore.getState().starterPacks, [packWithItem.id]: true },
      excludedItems: [item.id],
    });

    render(
      <AddToWatchlistButton
        itemId={item.id}
        itemName={item.name}
        ilvl={item.lvl}
        recipe={null}
      />,
    );
    expect(screen.getByRole('button', { name: /\+ watchlist/i })).toBeInTheDocument();
  });
});
