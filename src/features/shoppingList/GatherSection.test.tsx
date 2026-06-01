import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GatherSection } from './GatherSection';

const gather = new Map([
  [5, { qty: 8, level: 50, timed: false }],
  [6, { qty: 3, level: 90, timed: true }],
]);
const nameById = new Map([[5, 'Iron Ore'], [6, 'Darksteel Ore']]);

function ui(node: React.ReactNode) {
  return <MemoryRouter>{node}</MemoryRouter>;
}

describe('GatherSection', () => {
  it('renders a row per gatherable with level and qty', () => {
    render(ui(<GatherSection gather={gather} nameById={nameById} onBuyInstead={() => {}} />));
    expect(screen.getByText('Iron Ore')).toBeInTheDocument();
    expect(screen.getByText('Darksteel Ore')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('calls onBuyInstead with the row id', () => {
    const onBuy = vi.fn();
    render(ui(<GatherSection gather={gather} nameById={nameById} onBuyInstead={onBuy} />));
    fireEvent.click(screen.getAllByRole('button', { name: /buy instead/i })[0]);
    expect(onBuy).toHaveBeenCalledWith(5);
  });

  it('renders nothing when empty', () => {
    const { container } = render(ui(<GatherSection gather={new Map()} nameById={nameById} onBuyInstead={() => {}} />));
    expect(container).toBeEmptyDOMElement();
  });
});
