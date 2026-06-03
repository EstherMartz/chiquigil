import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RecipeHover } from './RecipeHover';

// Stub the data-heavy popover body so this test stays focused on portal/positioning.
vi.mock('./RecipePopover', () => ({
  RecipePopover: ({ itemName }: { itemName: string }) => (
    <div data-testid="popover">{itemName}</div>
  ),
}));

describe('RecipeHover', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function open() {
    render(
      <div data-testid="clip" style={{ overflow: 'hidden' }}>
        <RecipeHover itemId={1} itemName="Aspected Aether Agglomerate">
          <span>trigger</span>
        </RecipeHover>
      </div>,
    );
    fireEvent.mouseEnter(screen.getByText('trigger').parentElement!);
    act(() => { vi.advanceTimersByTime(200); }); // clear the 180ms open delay
  }

  it('portals the popover to document.body so overflow ancestors cannot clip it', () => {
    open();
    const popover = screen.getByTestId('popover');
    const clip = screen.getByTestId('clip');
    // The regression: popover rendered *inside* the overflow:hidden container.
    expect(clip.contains(popover)).toBe(false);
    expect(document.body.contains(popover)).toBe(true);
  });

  it('does not render the popover until hovered', () => {
    render(
      <RecipeHover itemId={1} itemName="X">
        <span>trigger</span>
      </RecipeHover>,
    );
    expect(screen.queryByTestId('popover')).toBeNull();
  });
});
