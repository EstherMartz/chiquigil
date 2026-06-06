// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ListDetail from './ListDetail';

vi.mock('../features/craftLists/useCraftLists', () => ({
  useCraftList: () => ({
    data: { id: 'a', ownerId: 'owner1', name: 'Set of Fending', createdAt: 0, updatedAt: 0,
      items: [{ itemId: 1, itemName: 'Sword', qty: 1, isHq: false }] },
    isLoading: false, isError: false,
  }),
}));
vi.mock('../features/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'authed', user: { sub: 'owner1', username: 'E', avatar: null, guilds: [] }, isAdmin: false }),
}));
vi.mock('../components/ItemNameLinks', () => ({
  ItemNameLinks: ({ name }: { name: string }) => <span>{name}</span>,
}));
// Provide a deterministic resolved list so we don't need real snapshots.
vi.mock('../features/craftLists/useResolvedList', () => ({
  useResolvedList: () => ({
    ready: true,
    resolved: {
      finalItems: [{ itemId: 1, itemName: 'Sword', qty: 1, isHq: false, job: 'BSM', recipeLevel: 90, stars: 4 }],
      subCraftsByDepth: new Map([[1, [{ itemId: 2, itemName: 'Ingot', requiredQty: 2, source: 'Crafted', depth: 1, usedToCraft: ['Sword'] }]]]),
      gathered: [{ itemId: 3, itemName: 'Ore', requiredQty: 6, source: 'Gathered', usedToCraft: ['Sword'] }],
      otherAcquired: [],
      crystals: [{ itemId: 7, itemName: 'Fire Shard', requiredQty: 1, source: 'Crystal', usedToCraft: ['Sword'] }],
      all: [
        { itemId: 2, itemName: 'Ingot', requiredQty: 2, source: 'Crafted', depth: 1, usedToCraft: ['Sword'] },
        { itemId: 3, itemName: 'Ore', requiredQty: 6, source: 'Gathered', usedToCraft: ['Sword'] },
        { itemId: 7, itemName: 'Fire Shard', requiredQty: 1, source: 'Crystal', usedToCraft: ['Sword'] },
      ],
    },
  }),
}));

function renderAt(id = 'a') {
  return render(
    <MemoryRouter initialEntries={[`/craft-lists/${id}`]}>
      <Routes><Route path="/craft-lists/:id" element={<ListDetail />} /></Routes>
    </MemoryRouter>,
  );
}

describe('ListDetail', () => {
  it('renders sections by default and toggles to table', () => {
    renderAt();
    expect(screen.getByText('Set of Fending')).toBeInTheDocument();
    expect(screen.getByText(/Final Items/i)).toBeInTheDocument();
    expect(screen.getByText('Ingot')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^table$/i }));
    // Table view shows the "Used to Craft" column header
    expect(screen.getByText(/used to craft/i)).toBeInTheDocument();
  });
});
