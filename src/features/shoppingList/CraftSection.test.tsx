import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CraftSection } from './CraftSection';

const craft = new Map([
  [100, { qty: 1, craftCount: 1, job: 'CRP' }],
  [50, { qty: 2, craftCount: 1, job: 'BSM' }],
]);
const nameById = new Map([[100, 'Oak Chair'], [50, 'Oak Lumber']]);

function ui(node: React.ReactNode) {
  return <MemoryRouter>{node}</MemoryRouter>;
}

describe('CraftSection', () => {
  it('renders a row per craftable item with its job', () => {
    render(ui(<CraftSection craft={craft} targetIds={new Set([100])} nameById={nameById} onBuyInstead={() => {}} />));
    expect(screen.getByText('Oak Chair')).toBeInTheDocument();
    expect(screen.getByText('Oak Lumber')).toBeInTheDocument();
    expect(screen.getByText('BSM')).toBeInTheDocument();
  });

  it('offers "Buy instead" only for non-target intermediates', () => {
    const onBuy = vi.fn();
    render(ui(<CraftSection craft={craft} targetIds={new Set([100])} nameById={nameById} onBuyInstead={onBuy} />));
    const buyButtons = screen.getAllByRole('button', { name: /buy instead/i });
    expect(buyButtons).toHaveLength(1);
    fireEvent.click(buyButtons[0]);
    expect(onBuy).toHaveBeenCalledWith(50);
  });

  it('renders nothing when the craft bucket is empty', () => {
    const { container } = render(ui(<CraftSection craft={new Map()} targetIds={new Set()} nameById={nameById} onBuyInstead={() => {}} />));
    expect(container).toBeEmptyDOMElement();
  });
});
