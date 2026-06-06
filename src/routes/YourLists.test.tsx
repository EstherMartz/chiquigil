// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import YourLists from './YourLists';

const del = vi.fn();
vi.mock('../features/craftLists/useCraftLists', () => ({
  useCraftLists: () => ({
    data: [
      { id: 'a', name: 'Set of Fending', itemCount: 13, createdAt: 0, updatedAt: 1 },
      { id: 'b', name: 'Scrip Turn-ins', itemCount: 6, createdAt: 0, updatedAt: 2 },
    ],
    isLoading: false, isError: false,
  }),
  useDeleteList: () => ({ mutate: del, isPending: false }),
}));

beforeEach(() => { del.mockReset(); });

function renderPage() {
  return render(<MemoryRouter><YourLists /></MemoryRouter>);
}

describe('YourLists', () => {
  it('renders saved lists with counts', () => {
    renderPage();
    expect(screen.getByText('Set of Fending')).toBeInTheDocument();
    expect(screen.getByText(/13 recipes/i)).toBeInTheDocument();
  });

  it('filters by name', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/filter lists/i), { target: { value: 'scrip' } });
    expect(screen.queryByText('Set of Fending')).not.toBeInTheDocument();
    expect(screen.getByText('Scrip Turn-ins')).toBeInTheDocument();
  });

  it('deletes after confirm', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0]);
    expect(del).toHaveBeenCalledWith('a');
  });
});
