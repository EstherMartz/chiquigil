export type Scope = string; // world or DC name, e.g. 'Phantom' | 'Chaos'

export interface WorldListing { world: string; price: number; hq: boolean }

export interface MarketItem {
  minNQ: number | null;
  minHQ: number | null;
  avgNQ: number | null;
  avgHQ: number | null;
  velocity: number;
  lastUploadTime: number;
  listingCount: number;
  worldListings: WorldListing[];
  averagePriceNQ: number | null;
  averagePriceHQ: number | null;
}

export type MarketData = Record<string, MarketItem>;

interface RawListing { hq: boolean; pricePerUnit: number; worldName?: string }
interface RawHistory { hq: boolean; pricePerUnit: number }
interface RawItem {
  listings?: RawListing[];
  recentHistory?: RawHistory[];
  regularSaleVelocity?: number;
  lastUploadTime?: number;
  averagePriceNQ?: number;
  averagePriceHQ?: number;
}
interface RawResponse { items?: Record<string, RawItem> }

export function buildMarketUrl(scope: Scope, ids: number[]): string {
  return `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=10&entries=15`;
}

function minPrice(arr: RawListing[], hq: boolean): number | null {
  const v = arr.filter((l) => l.hq === hq).map((l) => l.pricePerUnit);
  return v.length ? Math.min(...v) : null;
}

function avgPrice(arr: RawHistory[], hq: boolean): number | null {
  const v = arr.filter((l) => l.hq === hq).map((l) => l.pricePerUnit);
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

export function parseMarketResponse(raw: RawResponse): MarketData {
  const out: MarketData = {};
  const items = raw.items ?? {};
  for (const [id, item] of Object.entries(items)) {
    const listings = item.listings ?? [];
    const history = item.recentHistory ?? [];
    out[id] = {
      minNQ: minPrice(listings, false),
      minHQ: minPrice(listings, true),
      avgNQ: avgPrice(history, false),
      avgHQ: avgPrice(history, true),
      velocity: item.regularSaleVelocity ?? 0,
      lastUploadTime: item.lastUploadTime ?? 0,
      listingCount: listings.length,
      worldListings: listings.map((l) => ({
        world: l.worldName ?? '',
        price: l.pricePerUnit,
        hq: l.hq,
      })),
      averagePriceNQ: item.averagePriceNQ ?? null,
      averagePriceHQ: item.averagePriceHQ ?? null,
    };
  }
  return out;
}

export async function fetchMarketData(scope: Scope, ids: number[]): Promise<MarketData> {
  if (ids.length === 0) return {};
  const res = await fetch(buildMarketUrl(scope, ids));
  if (!res.ok) throw new Error(`Universalis ${res.status}`);
  const raw = (await res.json()) as RawResponse;
  return parseMarketResponse(raw);
}
