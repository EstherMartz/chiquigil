import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategorySelect } from './CategorySelect';

const CATS = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
];
const GROUPS = [
  { label: 'AB', ids: [1, 2] },
  { label: 'C', ids: [3] },
];

function Harness({ initial = [] as number[], withGroups = true }) {
  const [sel, setSel] = useState<number[]>(initial);
  return (
    <div>
      <CategorySelect
        categories={CATS}
        selected={sel}
        onChange={setSel}
        groups={withGroups ? GROUPS : undefined}
      />
      <div data-testid="sel">{[...sel].sort((a, b) => a - b).join(',')}</div>
    </div>
  );
}

function openDropdown() {
  fireEvent.focus(screen.getByPlaceholderText(/search categories/i));
}

describe('CategorySelect group chips', () => {
  it('selecting a group chip adds all its category ids', () => {
    render(<Harness />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: 'AB' }));
    expect(screen.getByTestId('sel').textContent).toBe('1,2');
  });

  it('clicking an active group chip removes all its ids (toggle off)', () => {
    render(<Harness initial={[1, 2]} />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: 'AB' }));
    expect(screen.getByTestId('sel').textContent).toBe('');
  });

  it('marks a fully-selected group chip active (aria-pressed=true)', () => {
    render(<Harness initial={[1, 2]} />);
    openDropdown();
    expect(screen.getByRole('button', { name: 'AB' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks a partially-selected group chip mixed (aria-pressed=mixed)', () => {
    render(<Harness initial={[1]} />);
    openDropdown();
    expect(screen.getByRole('button', { name: 'AB' })).toHaveAttribute('aria-pressed', 'mixed');
  });

  it('renders no group chips when groups prop is omitted', () => {
    render(<Harness withGroups={false} />);
    openDropdown();
    expect(screen.queryByRole('button', { name: 'AB' })).not.toBeInTheDocument();
  });
});
