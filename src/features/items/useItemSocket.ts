import { useEffect, useRef, useState } from 'react';
import { openMarketSocket, type MarketWsEvent, type WsStatus } from '../../lib/marketSocket';
import { applyListingUpdate, applySaleUpdate } from '../../lib/marketPatch';
import type { MarketItem } from '../../lib/universalis';
import type { WorldsMap } from '../../lib/worldsMap';

export type LiveStatus = WsStatus | 'off';

/**
 * Stream live updates for one item across its DC's worlds. Returns a patched overlay
 * (`liveItem`) the page renders in place of the cached DC item. Closes on unmount / itemId
 * change. `dcWorldIds` MUST be a memoized array (stable identity) — it keys the socket.
 */
export function useItemSocket(
  itemId: number,
  dcWorldIds: number[],
  base: MarketItem | undefined,
  worlds: WorldsMap | undefined,
): { liveItem: MarketItem | undefined; liveAt: number | null; status: LiveStatus } {
  const [liveItem, setLiveItem] = useState<MarketItem | undefined>(base);
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const [status, setStatus] = useState<LiveStatus>('off');

  // Re-seed the overlay whenever fresh REST data arrives (manual refresh / first load).
  const liveRef = useRef<MarketItem | undefined>(base);
  useEffect(() => { liveRef.current = base; setLiveItem(base); }, [base]);

  useEffect(() => {
    if (!dcWorldIds.length || !worlds) { setStatus('off'); return; }
    const sock = openMarketSocket({
      worldIds: dcWorldIds,
      onStatus: setStatus,
      onEvent: (e: MarketWsEvent) => {
        if (e.item !== itemId) return;
        const world = worlds.get(e.world);
        const cur = liveRef.current;
        if (!world || !cur) return;
        const next =
          e.event === 'listings/add' && e.listings ? applyListingUpdate(cur, e.listings, world)
          : e.event === 'sales/add' && e.sales?.[0] ? applySaleUpdate(cur, e.sales[0], Date.now())
          : cur;
        if (next === cur) return;
        liveRef.current = next;
        setLiveItem(next);
        setLiveAt(Date.now());
      },
    });
    return () => sock.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // base intentionally excluded: the socket persists across REST refreshes; the overlay
    // re-seeds via liveRef above. dcWorldIds must be memoized by the caller.
  }, [itemId, dcWorldIds, worlds]);

  return { liveItem, liveAt, status };
}
