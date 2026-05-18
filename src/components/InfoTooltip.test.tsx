import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoTooltip } from './InfoTooltip';

describe('InfoTooltip', () => {
  it('renders the trigger content', () => {
    render(<InfoTooltip label="Description"><span>Trigger</span></InfoTooltip>);
    expect(screen.getByText('Trigger')).toBeInTheDocument();
  });

  it('renders the tooltip label with role="tooltip"', () => {
    render(<InfoTooltip label="Description text"><span>Trigger</span></InfoTooltip>);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Description text');
  });

  it('keeps the tooltip in the DOM but hidden by default (CSS-driven hover reveal)', () => {
    render(<InfoTooltip label="Description"><span>Trigger</span></InfoTooltip>);
    const tip = screen.getByRole('tooltip');
    // The component relies on Tailwind `hidden group-hover/tt:block` — the
    // class is on the element. JSDOM doesn't evaluate :hover, so it stays
    // `hidden`. We assert the class is present to lock in the contract.
    expect(tip.className).toContain('hidden');
    expect(tip.className).toContain('group-hover/tt:block');
  });
});
