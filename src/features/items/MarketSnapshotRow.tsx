import { useState } from 'react';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { MarketItem } from '../../lib/universalis';
import { PriceHistoryCard } from './PriceHistoryCard';
import { CrossWorldArbCard } from './CrossWorldArbCard';
import { ActivityCard } from './ActivityCard';
import { CrossWorldListingsBlock } from './CrossWorldListingsBlock';

interface Props {
  homeWorld: string;
  dcLabel: string;
  phantom?: MarketItem;
  dc?: MarketItem;
  region?: MarketItem;
  canHq: boolean;
  /** Crafting material cost (support) + vendor price (ceiling) for fair value. */
  floor?: number | null;
  ceiling?: number | null;
  /**
   * 90-day sale history for the *active* scope, fetched once by the parent and
   * shared with the verdict card (avoids a duplicate Universalis round-trip).
   * The parent must pick the scope with the same `hasMarketPresence(phantom)`
   * rule used here so the chart and its data describe the same market.
   */
  history: HistoryEntry[];
  historyLoading: boolean;
}

/** Does this market item show any real activity (price, listings, or velocity)? */
export function hasMarketPresence(m?: MarketItem): boolean {
  if (!m) return false;
  return (m.minNQ != null || m.minHQ != null) || (m.listingCount ?? 0) > 0 || (m.velocity ?? 0) > 0;
}

export function MarketSnapshotRow({ homeWorld, dcLabel, phantom, dc, region, canHq, floor, ceiling, history, historyLoading }: Props) {
  const [showAllWorlds, setShowAllWorlds] = useState(false);

  // ONE active scope drives the whole card: the player's home world, or the DC
  // when the home board is quiet. History, headline price, current asks, velocity
  // and the scope label then all describe the *same* market — no mixing.
  const useHome = hasMarketPresence(phantom);
  const activeMarket = useHome ? phantom : dc;
  const compareMarket = useHome ? dc : phantom;
  const activeLabel = useHome ? homeWorld : dcLabel;
  const compareLabel = useHome ? dcLabel : homeWorld;
  const fellBack = !useHome && hasMarketPresence(dc);

  const entries = history;

  return (
    <>
      {fellBack && (
        <p className="font-mono text-[10px] tracking-widest uppercase text-text-low -mb-1">
          Quiet on {homeWorld} — showing {dcLabel} data
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <PriceHistoryCard
          entries={entries}
          loading={historyLoading}
          market={activeMarket}
          listings={activeMarket?.worldListings}
          canHq={canHq}
          scopeLabel={activeLabel}
          floor={floor}
          ceiling={ceiling}
        />

        <CrossWorldArbCard
          region={region}
          homeWorld={homeWorld}
          dcLabel={dcLabel}
          homeMinNQ={phantom?.minNQ ?? null}
          homeMinHQ={phantom?.minHQ ?? null}
          onSeeAll={() => setShowAllWorlds(!showAllWorlds)}
          expanded={showAllWorlds}
        />

        <ActivityCard
          primary={activeMarket}
          compare={compareMarket}
          compareLabel={compareLabel}
          entries={entries}
          loading={historyLoading}
        />
      </div>

      {showAllWorlds && region && region.worldListings.length > 0 && (
        <div className="mt-3">
          <CrossWorldListingsBlock
            listings={region.worldListings}
            homeWorld={homeWorld}
            homeMinNQ={phantom?.minNQ ?? null}
            homeMinHQ={phantom?.minHQ ?? null}
          />
        </div>
      )}
    </>
  );
}
