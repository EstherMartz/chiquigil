import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadStaticItemsSnapshot,
  loadStaticRecipesSnapshot,
  loadStaticVendorSnapshot,
  loadStaticSpecialShopSnapshot,
  loadStaticGatheringCatalog,
  loadStaticLevesSnapshot,
  loadStaticWhatsNewSnapshot,
  loadStaticGlamourRanking,
} from './staticSnapshots';

const origFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = origFetch; });

function mockFetch(map: Record<string, { status: number; body?: unknown }>) {
  globalThis.fetch = vi.fn(async (url: string | URL) => {
    const key = typeof url === 'string' ? url : url.toString();
    const hit = map[key] ?? { status: 404 };
    return new Response(hit.body == null ? '' : JSON.stringify(hit.body), { status: hit.status });
  }) as unknown as typeof fetch;
}

describe('loadStaticItemsSnapshot', () => {
  it('returns null on 404', async () => {
    mockFetch({});
    expect(await loadStaticItemsSnapshot()).toBeNull();
  });

  it('returns data and bakedAt on 200', async () => {
    const items = [{ id: 1, name: 'X', sc: 1, ui: 1, ilvl: 1, canHq: false }];
    mockFetch({
      '/data/snapshots/items.json': { status: 200, body: { bakedAt: 1700000000000, items } },
    });
    const got = await loadStaticItemsSnapshot();
    expect(got).toEqual({ bakedAt: 1700000000000, data: items });
  });
});

describe('loadStaticRecipesSnapshot', () => {
  it('reconstitutes Map from entries array', async () => {
    const entries: Array<[number, { itemResultId: number }]> = [[1, { itemResultId: 1 } as never]];
    mockFetch({
      '/data/snapshots/recipes.json': { status: 200, body: { bakedAt: 1, entries } },
    });
    const got = await loadStaticRecipesSnapshot();
    expect(got).not.toBeNull();
    expect(got!.data.get(1)).toEqual({ itemResultId: 1 });
    expect(got!.bakedAt).toBe(1);
  });
});

describe('loadStaticVendorSnapshot', () => {
  it('reconstitutes Map<number,number>', async () => {
    mockFetch({
      '/data/snapshots/vendorShop.json': { status: 200, body: { bakedAt: 2, entries: [[10, 99]] } },
    });
    const got = await loadStaticVendorSnapshot();
    expect(got!.data.get(10)).toBe(99);
  });
});

describe('loadStaticSpecialShopSnapshot', () => {
  it('reconstitutes the byCurrency Map', async () => {
    mockFetch({
      '/data/snapshots/specialShop.json': {
        status: 200,
        body: { bakedAt: 3, byCurrency: [['poetics', [{ itemId: 5, receiveQty: 1, costPerUnit: 100, isHq: false }]]] },
      },
    });
    const got = await loadStaticSpecialShopSnapshot();
    expect(got!.data.byCurrency.get('poetics' as never)).toHaveLength(1);
  });
});

describe('loadStaticGatheringCatalog', () => {
  it('reconstitutes Map<number,GatheringInfo>', async () => {
    mockFetch({
      '/data/snapshots/gathering.json': {
        status: 200,
        body: { bakedAt: 4, entries: [[1, { level: 50, timed: false, hidden: false }]] },
      },
    });
    const got = await loadStaticGatheringCatalog();
    expect(got!.data.get(1)?.level).toBe(50);
  });
});

describe('loadStaticLevesSnapshot', () => {
  it('returns array verbatim', async () => {
    mockFetch({
      '/data/snapshots/leves.json': { status: 200, body: { bakedAt: 5, leves: [{ id: 1 }] } },
    });
    const got = await loadStaticLevesSnapshot();
    expect(got!.data).toHaveLength(1);
  });
});

describe('loadStaticWhatsNewSnapshot', () => {
  it('maps the bundle into StaticBundle<WhatsNewData>', async () => {
    mockFetch({
      '/data/snapshots/whatsNew.json': {
        status: 200,
        body: { bakedAt: 123, prevBakedAt: 100, newItems: [7, 8], newRecipeItems: [9] },
      },
    });
    const got = await loadStaticWhatsNewSnapshot();
    expect(got).toEqual({
      bakedAt: 123,
      data: { prevBakedAt: 100, newItems: [7, 8], newRecipeItems: [9] },
    });
  });

  it('returns null when the bundle is missing', async () => {
    mockFetch({});
    expect(await loadStaticWhatsNewSnapshot()).toBeNull();
  });
});

describe('loadStaticGlamourRanking', () => {
  it('returns generatedAt + ranking on 200', async () => {
    mockFetch({
      '/data/snapshots/glamours.json': {
        status: 200,
        body: { generated_at: '2026-06-01T00:00:00Z', ranking: [{ item: 'Dream Hat', uses: 87 }] },
      },
    });
    const got = await loadStaticGlamourRanking();
    expect(got).toEqual({
      generatedAt: '2026-06-01T00:00:00Z',
      ranking: [{ item: 'Dream Hat', uses: 87 }],
    });
  });

  it('returns null when the bundle is missing', async () => {
    mockFetch({});
    expect(await loadStaticGlamourRanking()).toBeNull();
  });

  it('defaults a missing ranking to an empty array', async () => {
    mockFetch({
      '/data/snapshots/glamours.json': { status: 200, body: { generated_at: 'x' } },
    });
    const got = await loadStaticGlamourRanking();
    expect(got).toEqual({ generatedAt: 'x', ranking: [] });
  });
});
