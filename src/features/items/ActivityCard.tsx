import { useMemo } from 'react';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { MarketItem } from '../../lib/universalis';

interface Props {
  phantom?: MarketItem;
  dc?: MarketItem;
  dcLabel: string;
  entries: HistoryEntry[];
  loading: boolean;
}

export function ActivityCard({ phantom, dc, dcLabel, entries, loading }: Props) {
  const stats = useMemo(() => {
    const cutoff30Ms = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const last30 = entries.filter((e) => e.timestamp * 1000 >= cutoff30Ms);

    // Last sale timestamp
    let lastSaleDate = '';
    if (last30.length > 0) {
      const mostRecent = last30.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
      const d = new Date(mostRecent.timestamp * 1000);
      lastSaleDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    }

    return {
      salesCount: last30.length,
      lastSaleDate,
      velocity: phantom?.velocity ?? 0,
      dcVelocity: dc?.velocity ?? 0,
      listings: phantom?.listingCount ?? 0,
    };
  }, [entries, phantom, dc]);

  if (loading) {
    return (
      <div className="border border-border-base bg-bg-card p-4">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-3">
          Activity
        </div>
        <div className="text-text-low text-sm italic">Loading…</div>
      </div>
    );
  }

  return (
    <div className="border border-border-base bg-bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-border-base">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
          Activity
        </div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">
          30 days
        </div>
      </div>

      {/* Sales stat */}
      <div className="mb-3">
        <div className="text-2xl font-display font-bold text-text-cream mb-1">
          {stats.salesCount}
        </div>
        <div className="font-mono text-[10px] uppercase text-text-low">Sales</div>
        <div className="text-sm text-text-dim mt-0.5">
          {stats.salesCount === 0
            ? 'no recent sales'
            : `last on ${stats.lastSaleDate}`}
        </div>
      </div>

      {/* Velocity stat */}
      <div className="mb-3">
        <div className="text-2xl font-display font-bold text-text-cream mb-1">
          {stats.velocity.toFixed(1)}
          <span className="text-lg font-mono text-text-low">/day</span>
        </div>
        <div className="font-mono text-[10px] uppercase text-text-low">Velocity</div>
        {dc && (
          <div className="text-sm text-text-dim mt-0.5">
            vs {stats.dcVelocity.toFixed(1)}/day on {dcLabel}
          </div>
        )}
      </div>

      {/* Listings stat */}
      <div>
        <div className="text-2xl font-display font-bold text-text-cream mb-1">
          {stats.listings}
        </div>
        <div className="font-mono text-[10px] uppercase text-text-low">Listings</div>
        <div className="text-sm text-text-dim mt-0.5">
          {stats.listings <= 1 ? 'thin book — single supplier' : `${stats.listings} active listing${stats.listings === 1 ? '' : 's'}`}
        </div>
      </div>
    </div>
  );
}
