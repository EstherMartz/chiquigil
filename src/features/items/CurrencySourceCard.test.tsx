import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CurrencySourceCard } from './CurrencySourceCard';
import type { CurrencyOffer } from './currencyOffers';
import type { MarketItem } from '../../lib/universalis';

function mkMarket(opts: Partial<MarketItem> = {}): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0,
    lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...opts,
  };
}

const poeticsOffer: CurrencyOffer = {
  currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', itemId: 28 },
  costPerUnit: 10, isHq: false,
};
const mgpOffer: CurrencyOffer = {
  currency: { id: 'mgp', label: 'MGP', shortLabel: 'MGP', itemId: 29 },
  costPerUnit: 50000, isHq: true,
};

function renderCard(props: Partial<React.ComponentProps<typeof CurrencySourceCard>> = {}) {
  return render(
    <MemoryRouter>
      <CurrencySourceCard
        offers={props.offers ?? [poeticsOffer]}
        homeMarket={props.homeMarket}
        canHq={props.canHq ?? false}
        worldLabel={props.worldLabel ?? 'Phantom'}
        npcsByCurrencyItemId={props.npcsByCurrencyItemId}
      />
    </MemoryRouter>,
  );
}

describe('CurrencySourceCard', () => {
  it('renders nothing when offers is empty', () => {
    const { container } = renderCard({ offers: [] });
    expect(container.textContent).toBe('');
  });

  it('renders one row per offer; currency shortLabel links to /currency-flip?currency=<id>', () => {
    renderCard({ offers: [poeticsOffer, mgpOffer] });
    const poeticsLink = screen.getByRole('link', { name: /^Poetics$/ });
    expect(poeticsLink.getAttribute('href')).toBe('/currency-flip?currency=poetics');
    const mgpLink = screen.getByRole('link', { name: /^MGP$/ });
    expect(mgpLink.getAttribute('href')).toBe('/currency-flip?currency=mgp');
  });

  it('renders HQ glyph on rows where offer.isHq is true', () => {
    renderCard({ offers: [poeticsOffer, mgpOffer] });
    const poeticsRow = screen.getByRole('link', { name: /^Poetics$/ }).closest('div')!;
    const mgpRow = screen.getByRole('link', { name: /^MGP$/ }).closest('div')!;
    expect(poeticsRow.querySelector('[aria-label="High Quality"]')).toBeNull();
    expect(mgpRow.querySelector('[aria-label="High Quality"]')).not.toBeNull();
  });

  it('renders profit comparison when homeMarket has a trusted tier', () => {
    const homeMarket = mkMarket({
      minNQ: 2000, medianNQ: 2000, recentSalesNQ: 20,
    });
    renderCard({ offers: [poeticsOffer], homeMarket, canHq: false });
    expect(screen.getByText(/Phantom\s+NQ/i)).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getByText(/gil\/unit/i)).toBeInTheDocument();
  });

  it('hides profit comparison when no trusted tier exists', () => {
    const homeMarket = mkMarket({});
    renderCard({ offers: [poeticsOffer], homeMarket, canHq: false });
    expect(screen.queryByText(/gil\/unit/i)).not.toBeInTheDocument();
    expect(screen.getByText(/10\s+per unit/i)).toBeInTheDocument();
  });

  it('renders per-row NPC name + zone when the map matches the row currency itemId', () => {
    const npcMap = new Map<number, { name: string; zone?: string }>([
      [28, { name: 'Auriana', zone: 'Mor Dhona' }],
      [29, { name: 'Ironworks Hand', zone: 'Mor Dhona' }],
    ]);
    renderCard({
      offers: [poeticsOffer, mgpOffer],
      npcsByCurrencyItemId: npcMap,
    });
    const poeticsRow = screen.getByRole('link', { name: /^Poetics$/ }).closest('div')!;
    expect(poeticsRow.textContent).toMatch(/Auriana/);
    expect(poeticsRow.textContent).toMatch(/Mor Dhona/);
    const mgpRow = screen.getByRole('link', { name: /^MGP$/ }).closest('div')!;
    expect(mgpRow.textContent).toMatch(/Ironworks Hand/);
  });

  it('renders NPC name without zone separator when zone is absent', () => {
    const npcMap = new Map<number, { name: string; zone?: string }>([
      [28, { name: 'Auriana' }],
    ]);
    renderCard({
      offers: [poeticsOffer],
      npcsByCurrencyItemId: npcMap,
    });
    const row = screen.getByRole('link', { name: /^Poetics$/ }).closest('div')!;
    expect(row.textContent).toMatch(/Auriana/);
    // Zone absent: 'Auriana' should not be followed by another ' · <word>' segment
    expect(row.textContent).not.toMatch(/Auriana\s+·\s+\w/);
  });

  it('omits NPC append when map is undefined', () => {
    renderCard({ offers: [poeticsOffer] });
    const row = screen.getByRole('link', { name: /^Poetics$/ }).closest('div')!;
    expect(row.textContent).not.toMatch(/Auriana/);
  });
});
