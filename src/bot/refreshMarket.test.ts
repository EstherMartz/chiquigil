import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMarketForOutputs = vi.fn();
vi.mock('./marketFetch', () => ({ fetchMarketForOutputs: (...a: unknown[]) => fetchMarketForOutputs(...a) }));

const writeMarketCache = vi.fn();
const writeBlobJson = vi.fn();
const readBlobJson = vi.fn();
vi.mock('./marketCache', () => ({
  writeMarketCache: (...a: unknown[]) => writeMarketCache(...a),
  writeBlobJson: (...a: unknown[]) => writeBlobJson(...a),
  readBlobJson: (...a: unknown[]) => readBlobJson(...a),
}));

import { refreshHot, refreshFull } from './refreshMarket';

const mkItem = (velocity: number) => ({
  minNQ: 100, minHQ: null, avgNQ: 120, avgHQ: null, medianNQ: 110, medianHQ: null,
  recentSalesNQ: 5, recentSalesHQ: 0, velocity, lastUploadTime: 0, listingCount: 5,
  worldListings: [{ world: 'Phantom', price: 100, hq: false }],
  averagePriceNQ: 120, averagePriceHQ: null, lastSaleMs: null,
});

beforeEach(() => {
  fetchMarketForOutputs.mockReset(); writeMarketCache.mockReset();
  writeBlobJson.mockReset(); readBlobJson.mockReset();
});

describe('refreshHot', () => {
  it('bails (seeded:false) when hot-ids.json is missing', async () => {
    readBlobJson.mockResolvedValue(null);
    const r = await refreshHot({ world: 'Phantom', dc: 'Chaos', region: 'Europe' });
    expect(r).toEqual({ seeded: false });
    expect(fetchMarketForOutputs).not.toHaveBeenCalled();
  });

  it('fetches the hot set and writes the hot cache when seeded', async () => {
    readBlobJson.mockResolvedValue([1, 2]);
    fetchMarketForOutputs.mockResolvedValue({ phantom: {}, dc: {}, region: {} });
    writeMarketCache.mockResolvedValue('https://blob/market-cache-hot.json');
    const r = await refreshHot({ world: 'Phantom', dc: 'Chaos', region: 'Europe' });
    expect(fetchMarketForOutputs).toHaveBeenCalledWith([1, 2], 'Phantom', 'Chaos', 'Europe');
    expect(writeMarketCache).toHaveBeenCalledWith(expect.objectContaining({ ts: expect.any(Number) }), 'market-cache-hot.json');
    expect(r).toMatchObject({ seeded: true, items: 2 });
  });
});

describe('refreshFull', () => {
  it('writes cold cache, hot-ids, and opportunities', async () => {
    fetchMarketForOutputs.mockResolvedValue({
      phantom: { '1': mkItem(50) }, dc: { '1': mkItem(50) }, region: { '1': mkItem(50) },
    });
    writeMarketCache.mockResolvedValue('https://blob/market-cache-cold.json');
    readBlobJson.mockResolvedValue(null); // no existing opportunities feed
    writeBlobJson.mockResolvedValue('https://blob/x.json');
    const r = await refreshFull({ ids: [1], world: 'Phantom', dc: 'Chaos', region: 'Europe', velocityThreshold: 10, dealPct: 25 });
    expect(writeMarketCache).toHaveBeenCalledWith(expect.objectContaining({ ts: expect.any(Number) }), 'market-cache-cold.json');
    expect(writeBlobJson).toHaveBeenCalledWith('hot-ids.json', [1]);
    expect(writeBlobJson).toHaveBeenCalledWith('opportunities.json', expect.objectContaining({ opportunities: expect.any(Array) }));
    expect(r).toMatchObject({ items: 1, hotCount: 1 });
  });
});
