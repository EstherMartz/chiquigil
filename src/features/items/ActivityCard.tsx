import { useMemo } from 'react';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { MarketItem } from '../../lib/universalis';

interface Props {
  /** Market item for the active scope (home world, or DC if home is quiet). */
  primary?: MarketItem;
  /** The other scope, used for the velocity comparison line. */
  compare?: MarketItem;
  compareLabel: string;
  /** Sale history for the active scope. */
  entries: HistoryEntry[];
  loading: boolean;
}

/**
 * "Offer vs real sales": how the current listings (supply) compare to how fast
 * the item actually sells (demand). `days` is how long the current listings
 * would take to clear at the recent sale rate.
 */
export function supplyDepth(listings: number, velocity: number): { days: number | null; note: string } {
  if (velocity <= 0) {
    return { days: null, note: listings > 0 ? 'listed but not selling' : 'no recent sales' };
  }
  if (listings === 0) return { days: 0, note: 'sold out — none listed' };
  const days = listings / velocity;
  if (days < 1) return { days, note: 'clears in under a day' };
  if (days < 14) return { days, note: `~${Math.round(days)}d to clear` };
  return { days, note: `oversupplied · ~${Math.round(days)}d to clear` };
}

export function ActivityCard({ primary, compare, compareLabel, entries, loading }: Props) {
  const stats = useMemo(() => {
    const cutoff30Ms = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const last30 = entries.filter((e) => e.timestamp * 1000 >= cutoff30Ms);

    let lastSaleDate = '';
    if (last30.length > 0) {
      const mostRecent = last30.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
      lastSaleDate = new Date(mostRecent.timestamp * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    }

    return {
      salesCount: last30.length,
      lastSaleDate,
      velocity: primary?.velocity ?? 0,
      compareVelocity: compare?.velocity ?? 0,
      listings: primary?.listingCount ?? 0,
    };
  }, [entries, primary, compare]);

  if (loading) {
    return (
      <div className="border border-border-base bg-bg-card p-4">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-3">Activity</div>
        <div className="text-text-low text-sm italic">Loading…</div>
      </div>
    );
  }

  // Offer-vs-sales read: are the listed offers actually moving?
  const listingsNote = supplyDepth(stats.listings, stats.velocity).note;

  return (
    <div className="border border-border-base bg-bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-border-base">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Activity</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">30 days</div>
      </div>

      <div className="space-y-3">
        <Stat
          value={String(stats.salesCount)}
          label="Sales"
          sub={stats.salesCount === 0 ? 'no recent sales' : `last on ${stats.lastSaleDate}`}
        />
        <Stat
          value={<>{stats.velocity.toFixed(1)}<span className="text-base font-mono text-text-low">/day</span></>}
          label="Velocity"
          sub={stats.compareVelocity > 0 ? `vs ${stats.compareVelocity.toFixed(1)}/day on ${compareLabel}` : undefined}
        />
        <Stat value={String(stats.listings)} label="Listings" sub={listingsNote} />
      </div>
    </div>
  );
}

function Stat({ value, label, sub }: { value: React.ReactNode; label: string; sub?: string }) {
  return (
    <div>
      <div className="text-2xl font-display font-bold text-text-cream leading-none">{value}</div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mt-1">{label}</div>
      {sub && <div className="text-[13px] text-text-dim mt-0.5">{sub}</div>}
    </div>
  );
}
