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

export function MarketSnapshotRow({
  itemId,
  homeWorld,
  dcLabel,
  phantom,
  dc,
  region,
  canHq,
}: Props) {
  const [showAllWorlds, setShowAllWorlds] = useState(false);

  // Fetch home-world history for 90 days (all three cards filter client-side)
  const historyQuery = useQuery({
    queryKey: ['item-history', homeWorld, itemId, 90],
    enabled: itemId > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const map = await fetchHistoryWithin(homeWorld, [itemId], NINETY_DAYS_SEC);
      return map.get(itemId) ?? [];
    },
  });

  const entries: HistoryEntry[] = useMemo(
    () => historyQuery.data ?? [],
    [historyQuery.data],
  );

  return (
    <>
      {/* Three-card grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <PriceHistoryCard
          entries={entries}
          loading={historyQuery.isLoading}
          phantom={phantom}
          canHq={canHq}
          scopeLabel={homeWorld}
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
          phantom={phantom}
          dc={dc}
          dcLabel={dcLabel}
          entries={entries}
          loading={historyQuery.isLoading}
        />
      </div>

      {/* Full cross-world listings below if expanded */}
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
