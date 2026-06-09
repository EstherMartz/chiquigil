import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { ItemNameLinks } from './ItemNameLinks';
import { IgnoreAffordanceContext } from '../features/items/ignoreAffordance';
import { useSettingsStore } from '../features/settings/store';

function ui(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ItemNameLinks hide chip', () => {
  beforeEach(() => useSettingsStore.setState({ ignoredItemIds: [] }));

  it('shows no hide chip outside the affordance context', () => {
    ui(<ItemNameLinks id={42} name="Widget" />);
    expect(screen.queryByTitle(/hide this item/i)).toBeNull();
  });

  it('shows a hide chip inside the context and calls ignoreItem on click', () => {
    const spy = vi.spyOn(useSettingsStore.getState(), 'ignoreItem');
    ui(
      <IgnoreAffordanceContext.Provider value={true}>
        <ItemNameLinks id={42} name="Widget" />
      </IgnoreAffordanceContext.Provider>,
    );
    fireEvent.click(screen.getByTitle(/hide this item/i));
    expect(spy).toHaveBeenCalledWith(42);
  });

  it('hides the chip when the item is already ignored', () => {
    useSettingsStore.setState({ ignoredItemIds: [42] });
    ui(
      <IgnoreAffordanceContext.Provider value={true}>
        <ItemNameLinks id={42} name="Widget" />
      </IgnoreAffordanceContext.Provider>,
    );
    expect(screen.queryByTitle(/hide this item/i)).toBeNull();
  });
});
