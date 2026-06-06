// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CraftLists from './CraftLists';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

vi.mock('../features/queries/useItemSnapshot', () => ({
  useItemSnapshot: () => ({ data: { items: [
    { id: 100, name: 'Gunblade', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 },
    { id: 200, name: 'Gunhilda Cloak', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 },
  ] } }),
}));
vi.mock('../features/queries/useRecipeSnapshot', () => ({
  useRecipeSnapshot: () => ({ data: new Map() }),
}));
vi.mock('../features/queries/useSnapshotById', () => ({
  useSnapshotById: () => new Map(),
}));

const createMut = vi.fn();
vi.mock('../features/craftLists/useCraftLists', () => ({
  useCreateList: () => ({ mutateAsync: createMut, isPending: false }),
}));

function renderPage() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><CraftLists /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => { navigate.mockReset(); createMut.mockReset(); });

describe('CraftLists builder', () => {
  it('searches, adds to the tray, and creates a list', async () => {
    createMut.mockResolvedValue('newid');
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/search items/i), { target: { value: 'gun' } });
    // Two matches; check the first row
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByText(/1 item selected/i)).toBeInTheDocument();

    vi.spyOn(window, 'prompt').mockReturnValue('My Set');
    fireEvent.click(screen.getByRole('button', { name: /create list/i }));

    expect(createMut).toHaveBeenCalledWith({
      name: 'My Set',
      items: [{ itemId: 100, itemName: 'Gunblade', qty: 1, isHq: false }],
    });
  });
});
