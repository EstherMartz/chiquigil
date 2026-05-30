import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import type { MarketItem } from '../../lib/universalis';
import { PriceHistoryCard } from './PriceHistoryCard';
import { CrossWorldArbCard } from './CrossWorldArbCard';
import { ActivityCard } from './ActivityCard';
import { CrossWorldListingsBlock } from './CrossWorldListingsBlock';

const NINETY_DAYS_SEC = 90 * 24 * 60 * 60;

interface Props {
  itemId: number;
  homeWorld: string;
  dcLabel: string;
  phantom?: MarketItem;
  dc?: MarketItem;
  region?: MarketItem;
  canHq: boolean;
}

/** Does this market item show any real activity (price, listings, or velocity)? */
function hasMarketPresence(m?: MarketItem): boolean {
  if (!m) return false;
  return (m.minNQ != null || m.minHQ != null) || (m.listingCount ?? 0) > 0 || (m.velocity ?? 0) > 0;
}

export function MarketSnapshotRow({ itemId, homeWorld, dcLabel, phantom, dc, region, canHq }: Props) {
  const [showAllWorlds, setShowAllWorlds] = useState(false);

  // --- Bulk scope (price / velocity / listings): prefer the player's home
  // world, fall back to the DC when the home board is quiet.
  const useHomeBulk = hasMarketPresence(phantom);
  const bulkMarket = useHomeBulk ? phantom : dc;
  const compareMarket = useHomeBulk ? dc : phantom;
  const bulkFellBack = !useHomeBulk && hasMarketPresence(dc);

  // --- History scope (chart + sales count): Universalis per-world history is
  // often sparse, so prefer the home world but fall back to the (richer) DC
  // history when the home world has no recorded sales.
  const homeHistory = useQuery({
    queryKey: ['item-history', homeWorld, itemId, 90],
    enabled: itemId > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => (await fetchHistoryWithin(homeWorld, [itemId], NINETY_DAYS_SEC)).get(itemId) ?? [],
  });
  const homeEntries = homeHistory.data ?? [];
  const needDcHistory = !homeHistory.isLoading && homeEntries.length === 0 && dcLabel !== homeWorld;
  const dcHistory = useQuery({
    queryKey: ['item-history', dcLabel, itemId, 90],
    enabled: itemId > 0 && needDcHistory,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => (await fetchHistoryWithin(dcLabel, [itemId], NINETY_DAYS_SEC)).get(itemId) ?? [],
  });

  const useHomeHistory = homeEntries.length > 0;
  const entries: HistoryEntry[] = useMemo(
    () => (useHomeHistory ? homeEntries : (dcHistory.data ?? [])),
    [useHomeHistory, homeEntries, dcHistory.data],
  );
  const historyScopeLabel = useHomeHistory ? homeWorld : dcLabel;
  const historyLoading = homeHistory.isLoading || (needDcHistory && dcHistory.isLoading);

  return (
    <>
      {bulkFellBack && (
        <p className="font-mono text-[10px] tracking-widest uppercase text-text-low -mb-1">
          Quiet on {homeWorld} — showing {dcLabel} data
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <PriceHistoryCard
          entries={entries}
          loading={historyLoading}
          market={bulkMarket}
          listings={bulkMarket?.worldListings}
          canHq={canHq}
          scopeLabel={historyScopeLabel}
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
          primary={bulkMarket}
          compare={compareMarket}
          compareLabel={useHomeBulk ? dcLabel : homeWorld}
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
