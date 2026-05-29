import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DeliverablesBlock } from './DeliverablesBlock';

function renderBlock(props: Parameters<typeof DeliverablesBlock>[0]) {
  return render(<MemoryRouter><DeliverablesBlock {...props} /></MemoryRouter>);
}

describe('DeliverablesBlock', () => {
  it('renders nothing when all sources are empty', () => {
    const { container } = renderBlock({ gcSupply: [], leves: [], quests: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders the GC supply sub-block with category and level', () => {
    renderBlock({
      gcSupply: [{ level: 40, categoryName: 'BSM', qty: 2 }],
      leves: [], quests: [],
    });
    expect(screen.getByText(/Grand Company Supply/i)).toBeInTheDocument();
    expect(screen.getByText(/BSM/)).toBeInTheDocument();
    expect(screen.getByText(/Lv\.40/)).toBeInTheDocument();
  });

  it('renders quest rows with a job tag when genre is known and a link', () => {
    renderBlock({
      gcSupply: [], leves: [],
      quests: [{ id: 65539, name: 'Way of the Botanist', genre: 174 }],
    });
    expect(screen.getByText('Way of the Botanist')).toBeInTheDocument();
    expect(screen.getByText(/BTN class quest/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Way of the Botanist/ });
    expect(link).toHaveAttribute('href', 'https://www.garlandtools.org/db/#quest/65539');
  });

  it('renders a leve row with job, level and quantity', () => {
    renderBlock({
      gcSupply: [], quests: [],
      leves: [{ leveId: 100, name: 'Bake Sale', level: 20, type: 'doh', jobCode: 'CUL', qty: 3 }],
    });
    expect(screen.getByText('Bake Sale')).toBeInTheDocument();
    expect(screen.getByText(/CUL Lv\.20/)).toBeInTheDocument();
    expect(screen.getByText(/×3/)).toBeInTheDocument();
  });
});
