import type { MarketItem } from '../../lib/universalis';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';

interface Props {
  vendorPrice: number;
  homeMarket: MarketItem | undefined;
  canHq: boolean;
  worldLabel: string;
}

export function VendorSourceCard({ vendorPrice, homeMarket, canHq, worldLabel }: Props) {
  const tier = homeMarket ? pickHighestTrustedTier(homeMarket, 'either', canHq) : null;
  const profit = tier ? tier.unit - vendorPrice : null;
  const profitClass = profit == null ? 'text-text-low'
    : profit > 0 ? 'text-jade'
    : profit < 0 ? 'text-crimson'
    : 'text-text-cream';

  return (
    <section>
      <SectionHeader label="Vendor source" compact />
      <div className="border border-border-base bg-bg-card p-4">
        <div className="text-sm">Sold by NPC: <span className="font-mono text-gold">{fmtGil(vendorPrice)}</span></div>
        {tier && profit != null && (
          <div className="text-xs text-text-low mt-1">
            (vs. {worldLabel} {tier.isHq ? 'HQ' : 'NQ'} <span className="font-mono">{fmtGil(tier.unit)}</span>
            {' · '}
            <span className={profitClass}>profit <span className="font-mono">{fmtGil(profit)}</span>/unit</span>)
          </div>
        )}
      </div>
    </section>
  );
}
