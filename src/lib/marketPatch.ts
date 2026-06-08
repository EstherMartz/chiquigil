import type { MarketItem, WorldListing } from './universalis';

/** A listing as it arrives over the Universalis WebSocket (worldName is null there). */
export interface WsListing { pricePerUnit: number; hq: boolean; quantity?: number; retainerName?: string }
/** A sale as it arrives over the WebSocket. */
export interface WsSale { pricePerUnit: number; hq: boolean; quantity?: number; timestamp?: number }

function cheapest(listings: WorldListing[], hq: boolean): number | null {
  let min: number | null = null;
  for (const l of listings) if (l.hq === hq && (min == null || l.price < min)) min = l.price;
  return min;
}

/**
 * Fold a `listings/add` event into a DC-scope MarketItem: the event carries the item's full
 * current listings on `world`, so we drop that world's existing slice, add the new ones,
 * re-sort cheapest-first, and recompute minNQ/minHQ/listingCount. Pure (returns a new item).
 * NOTE: base worldListings is the cron blob's cheapest-50, so listingCount is best-effort.
 */
export function applyListingUpdate(item: MarketItem, listings: WsListing[], world: string): MarketItem {
  const others = item.worldListings.filter((l) => l.world !== world);
  const incoming: WorldListing[] = listings.map((l) => ({
    world, price: l.pricePerUnit, hq: l.hq, quantity: l.quantity ?? 1, seller: l.retainerName ?? '',
  }));
  const worldListings = [...others, ...incoming].sort((a, b) => a.price - b.price);
  return {
    ...item,
    worldListings,
    listingCount: worldListings.length,
    minNQ: cheapest(worldListings, false),
    minHQ: cheapest(worldListings, true),
  };
}

/** Fold a `sales/add` event into a MarketItem: advance lastSaleMs + bump the recent-sales count. */
export function applySaleUpdate(item: MarketItem, sale: WsSale, now: number): MarketItem {
  const saleMs = sale.timestamp ? sale.timestamp * 1000 : now;
  return {
    ...item,
    lastSaleMs: Math.max(item.lastSaleMs ?? 0, saleMs),
    recentSalesNQ: item.recentSalesNQ + (sale.hq ? 0 : 1),
    recentSalesHQ: item.recentSalesHQ + (sale.hq ? 1 : 0),
  };
}
