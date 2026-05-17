import type { MarketItem } from '../../lib/universalis';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';

interface Props {
  vendorPrice: number;
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

export function VendorSourceCard({ vendorPrice, homeMarket, canHq, worldLabel }: Props) {
  const tier = homeMarket ? pickHigherTrustedTier(homeMarket, canHq) : null;
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
