import { Link } from 'react-router-dom';
import type { MarketItem } from '../../lib/universalis';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';
import { HqStar } from '../../components/HqStar';
import { CurrencyIcon } from '../../lib/icons';
import type { CurrencyOffer } from './currencyOffers';

interface Props {
  offers: CurrencyOffer[];
  homeMarket: MarketItem | undefined;
  canHq: boolean;
  worldLabel: string;
  npcsByCurrencyItemId?: Map<number, { name: string; zone?: string }>;
}

function fmtCost(n: number): string {
  return n < 10 ? n.toFixed(2) : String(Math.round(n));
}

interface DisplayRow {
  offer: CurrencyOffer;
  tier: { unit: number; isHq: boolean } | null;
  gilPerUnit: number | null;
}

export function CurrencySourceCard({
  offers, homeMarket, canHq, worldLabel, npcsByCurrencyItemId,
}: Props) {
  if (offers.length === 0) return null;
  const tier = homeMarket ? pickHighestTrustedTier(homeMarket, 'either', canHq) : null;

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
          const npc = npcsByCurrencyItemId?.get(offer.currency.itemId);
          return (
            <div key={offer.currency.id} className="flex items-baseline gap-2 flex-wrap text-sm">
              <Link
                to={`/currency-flip?currency=${offer.currency.id}`}
                className="text-aether hover:underline decoration-1 underline-offset-4 inline-flex items-center gap-1"
              >
                <CurrencyIcon currencyKey={offer.currency.itemId} />
                <span>{offer.currency.shortLabel}</span>
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
              {npc && (
                <span className="text-text-low text-xs">
                  · {npc.name}{npc.zone ? ` · ${npc.zone}` : ''}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
