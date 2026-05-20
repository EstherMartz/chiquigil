import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QuestItemFlipResults } from './QuestItemFlipResults';
import type { QuestItemRow } from './runQuestItemFlip';

function mkRow(overrides: Partial<QuestItemRow> = {}): QuestItemRow {
  return {
    questId: 1,
    questName: 'Way of the Carpenter',
    categoryName: 'All Classes',
    level: 5,
    itemId: 100,
    itemName: 'Maple Lumber',
    qty: 3,
    nqPrice: 120,
    hqPrice: 2400,
    listingCount: 4,
    velocity: 6.2,
    totalRevenue: 7200,
    ...overrides,
  };
}

function renderRows(rows: QuestItemRow[]) {
  return render(
    <MemoryRouter>
      <QuestItemFlipResults rows={rows} />
    </MemoryRouter>,
  );
}

describe('QuestItemFlipResults', () => {
  it('renders one row per QuestItemRow', () => {
    renderRows([
      mkRow({ itemId: 100, itemName: 'Maple Lumber' }),
      mkRow({ itemId: 200, itemName: 'Ash Lumber' }),
    ]);
    expect(screen.getByText('Maple Lumber')).toBeInTheDocument();
    expect(screen.getByText('Ash Lumber')).toBeInTheDocument();
  });

  it('renders an empty-state message when no rows', () => {
    renderRows([]);
    expect(screen.getByText(/no quest items match/i)).toBeInTheDocument();
  });

  it('item name links to /item/:id', () => {
    renderRows([mkRow({ itemId: 100, itemName: 'Maple Lumber' })]);
    const link = screen.getByRole('link', { name: 'Maple Lumber' });
    expect(link).toHaveAttribute('href', '/item/100');
  });

  it('shows category name in its own column', () => {
    renderRows([mkRow({ categoryName: 'Disciple of the Hand' })]);
    expect(screen.getByText('Disciple of the Hand')).toBeInTheDocument();
  });

  it('shows em-dash for null prices', () => {
    renderRows([mkRow({ nqPrice: null, hqPrice: null })]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows quest name in its own column', () => {
    renderRows([mkRow({ questName: 'Way of the Blacksmith' })]);
    expect(screen.getByText('Way of the Blacksmith')).toBeInTheDocument();
  });
});
