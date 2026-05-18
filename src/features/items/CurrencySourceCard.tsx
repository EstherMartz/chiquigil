import { Link } from 'react-router-dom';
import type { MarketItem } from '../../lib/universalis';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';
import { HqStar } from '../../components/HqStar';
import type { CurrencyOffer } from './currencyOffers';

interface Props {
  offers: CurrencyOffer[];
  homeMarket: MarketItem | undefined;
  canHq: boolean;
  worldLabel: string;
}

function pickHigherTrustedTier(m: MarketItem, canHq: boolean): { unit: number; isHq: boolean } | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if (canHq) candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  let best: { unit: number; isHq: boolean } | null = null;
  for (const c of candidates) {
    if (c.rawMin == null) continue;
    if (c.recent < MIN_RECENT_SALES) continue;
    if (c.median == null) continue;
    if (c.rawMin > c.median * MAX_LISTING_RATIO) continue;
    const unit = Math.min(c.rawMin, c.median);
    if (!best || unit > best.unit) best = { unit, isHq: c.isHq };
  }
  return best;
}

function fmtCost(n: number): string {
  return n < 10 ? n.toFixed(2) : String(Math.round(n));
}

interface DisplayRow {
  offer: CurrencyOffer;
  tier: { unit: number; isHq: boolean } | null;
  gilPerUnit: number | null;
}

export function CurrencySourceCard({ offers, homeMarket, canHq, worldLabel }: Props) {
  if (offers.length === 0) return null;
  const tier = homeMarket ? pickHigherTrustedTier(homeMarket, canHq) : null;

  const rows: DisplayRow[] = offers.map((offer) => ({
    offer,
    tier,
    gilPerUnit: tier ? tier.unit / offer.costPerUnit : null,
  }));

  rows.sort((a, b) => {
    if (a.gilPerUnit != null && b.gilPerUnit != null) return b.gilPerUnit - a.gilPerUnit;
    if (a.gilPerUnit != null) return -1;
    if (b.gilPerUnit != null) return 1;
    return a.offer.costPerUnit - b.offer.costPerUnit;
  });

  return (
    <section>
      <SectionHeader label="Currency source" compact />
      <div className="border border-border-base bg-bg-card p-4 space-y-2">
        {rows.map(({ offer, tier, gilPerUnit }) => {
          const profitable = gilPerUnit != null && gilPerUnit > 0;
          return (
            <div key={offer.currency.id} className="flex items-baseline gap-2 flex-wrap text-sm">
              <Link
                to={`/currency-flip?currency=${offer.currency.id}`}
                className="text-aether hover:underline decoration-1 underline-offset-4"
              >
                {offer.currency.shortLabel}
              </Link>
              <span className="text-text-low">→</span>
              <span className="font-mono text-gold">{fmtCost(offer.costPerUnit)} per unit</span>
              {offer.isHq && (
                <span aria-label="HQ" className="text-gold inline-flex items-baseline"><HqStar /></span>
              )}
              {tier && gilPerUnit != null && (
                <span className="text-text-low text-xs">
                  · vs {worldLabel} {tier.isHq ? 'HQ' : 'NQ'}{' '}
                  <span className="font-mono">{fmtGil(tier.unit)}</span>
                  {' · '}
                  <span className={profitable ? 'text-jade' : 'text-text-low'}>
                    gil/unit <span className="font-mono">{Math.round(gilPerUnit)}</span>
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
