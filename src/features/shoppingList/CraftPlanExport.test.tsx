import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CraftPlanExport } from './CraftPlanExport';
import type { CraftPlan } from './buildCraftPlan';

function mkPlan(p: Partial<CraftPlan>): CraftPlan {
  return { craft: p.craft ?? new Map(), gather: p.gather ?? new Map(), buy: p.buy ?? new Map() };
}
const nameById = new Map<number, string>([[1, 'Bronze Ingot'], [2, 'Copper Ore']]);

describe('CraftPlanExport', () => {
  it('renders nothing for an empty plan', () => {
    const { container } = render(<CraftPlanExport plan={mkPlan({})} nameById={nameById} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the text list in a textarea plus a copy button', () => {
    const plan = mkPlan({
      craft: new Map([[1, { qty: 2, craftCount: 2, job: 'BSM' }]]),
      buy: new Map([[2, 4]]),
    });
    render(<CraftPlanExport plan={plan} nameById={nameById} />);
    const ta = screen.getByLabelText('Craft plan as text') as HTMLTextAreaElement;
    expect(ta.value).toBe('2x Bronze Ingot\n4x Copper Ore');
    expect(screen.getByRole('button', { name: /copy list/i })).toBeInTheDocument();
  });
});
