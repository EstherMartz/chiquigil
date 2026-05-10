import { describe, it, expect } from 'vitest';
import { buildHistoryUrl, parseHistoryResponse, dailyBuckets } from './universalisHistory';

describe('buildHistoryUrl', () => {
  it('builds a Chaos history URL with entriesToReturn', () => {
    expect(buildHistoryUrl('Chaos', [1, 2])).toBe(
      'https://universalis.app/api/v2/history/Chaos/1,2?entriesToReturn=50'
    );
  });
});

describe('parseHistoryResponse', () => {
  it('extracts entries per item id', () => {
    const raw = {
      items: {
        '1': {
          entries: [
            { pricePerUnit: 100, quantity: 1, timestamp: 1, hq: false },
            { pricePerUnit: 110, quantity: 2, timestamp: 2, hq: true },
          ],
        },
      },
    };
    const out = parseHistoryResponse(raw);
    expect(out.get(1)).toHaveLength(2);
    expect(out.get(1)![0]).toEqual({ pricePerUnit: 100, quantity: 1, timestamp: 1, hq: false });
  });
});

describe('dailyBuckets', () => {
  it('groups entries into UTC daily buckets with mean price + total quantity', () => {
    const dayMs = 86_400_000;
    const day1 = 1_700_000_000_000;
    const day2 = day1 + dayMs;
    const entries = [
      { pricePerUnit: 100, quantity: 2, timestamp: Math.floor(day1 / 1000),     hq: false },
      { pricePerUnit: 200, quantity: 3, timestamp: Math.floor((day1 + 100) / 1000), hq: false },
      { pricePerUnit: 300, quantity: 1, timestamp: Math.floor(day2 / 1000),     hq: false },
    ];
    const out = dailyBuckets(entries, 99999);  // big lookback so test data isn't cut off
    expect(out).toEqual([
      { dayStartMs: Math.floor(day1 / dayMs) * dayMs, meanPrice: 160, quantity: 5 },
      { dayStartMs: Math.floor(day2 / dayMs) * dayMs, meanPrice: 300, quantity: 1 },
    ]);
  });

  it('drops days outside the lookback window', () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const oldEntry = { pricePerUnit: 50, quantity: 1, timestamp: Math.floor((now - 40 * dayMs) / 1000), hq: false };
    const recentEntry = { pricePerUnit: 60, quantity: 1, timestamp: Math.floor((now - 1 * dayMs) / 1000), hq: false };
    const out = dailyBuckets([oldEntry, recentEntry], 30);
    expect(out).toHaveLength(1);
    expect(out[0].meanPrice).toBe(60);
  });
});
