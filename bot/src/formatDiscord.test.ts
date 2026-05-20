import { describe, it, expect } from 'vitest';
import {
  formatExpandedCraftReply,
  formatExpandedSellReply,
  formatExpandedVendorDiscardReply,
  formatCleanupReply,
} from './formatDiscord';
import type { CleanupResult, CleanupRow, InventoryEntry } from '../../src/features/cleanup/types';

function entry(id: number, name: string, qty = 1): InventoryEntry {
  return { itemId: id, name, qty, isHq: false, locations: ['bag'] };
}

function craftRow(id: number): CleanupRow {
  return {
    entry: entry(id, `Item ${id}`, 5),
    vendorRevenue: 0,
    mbRevenue: 0,
    mbListingCount: 0,
    mbScope: 'home',
    bucket: 'craft',
    bestCraft: {
      outputItemId: id + 1000,
      outputName: `Output ${id}`,
      outputUnitPrice: 5000,
      netProfit: 1000,
      usedFromInventory: [],
      missingIngredients: [],
    },
    otherCrafts: [],
    runnerUp: null,
  };
}

function sellRow(id: number): CleanupRow {
  return {
    entry: entry(id, `Sell ${id}`, 3),
    vendorRevenue: 0,
    mbRevenue: 30000,
    mbListingCount: 5,
    mbScope: 'home',
    bucket: 'sellMb',
    bestCraft: null,
    otherCrafts: [],
    runnerUp: null,
  };
}

function vendorRow(id: number): CleanupRow {
  return {
    entry: entry(id, `Vendor ${id}`, 10),
    vendorRevenue: 500,
    mbRevenue: 0,
    mbListingCount: 0,
    mbScope: null,
    bucket: 'vendor',
    bestCraft: null,
    otherCrafts: [],
    runnerUp: null,
  };
}

function discardRow(id: number): CleanupRow {
  return {
    entry: entry(id, `Discard ${id}`, 1),
    vendorRevenue: 0,
    mbRevenue: 0,
    mbListingCount: 0,
    mbScope: null,
    bucket: 'discard',
    bestCraft: null,
    otherCrafts: [],
    runnerUp: null,
  };
}

function emptyResult(overrides: Partial<CleanupResult> = {}): CleanupResult {
  return { craft: [], sellMb: [], vendor: [], discard: [], unrecognized: [], ...overrides };
}

describe('formatExpandedCraftReply', () => {
  it('returns 1 embed for ≤25 craft rows', () => {
    const rows = Array.from({ length: 20 }, (_, i) => craftRow(i + 1));
    const embeds = formatExpandedCraftReply(emptyResult({ craft: rows }), new Map());
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.fields).toHaveLength(20);
  });

  it('splits into multiple embeds when over 25 rows', () => {
    const rows = Array.from({ length: 60 }, (_, i) => craftRow(i + 1));
    const embeds = formatExpandedCraftReply(emptyResult({ craft: rows }), new Map());
    expect(embeds).toHaveLength(3);
    expect(embeds[0].data.fields).toHaveLength(25);
    expect(embeds[1].data.fields).toHaveLength(25);
    expect(embeds[2].data.fields).toHaveLength(10);
  });

  it('hard-caps at 75 rows and footer-links the rest to cleanup.md', () => {
    const rows = Array.from({ length: 120 }, (_, i) => craftRow(i + 1));
    const embeds = formatExpandedCraftReply(emptyResult({ craft: rows }), new Map());
    expect(embeds).toHaveLength(3);
    const lastFooter = embeds[2].data.footer?.text ?? '';
    expect(lastFooter).toContain('cleanup.md');
    expect(lastFooter).toContain('45');
  });
});

describe('formatExpandedSellReply', () => {
  it('returns 1 embed for small lists', () => {
    const rows = Array.from({ length: 10 }, (_, i) => sellRow(i + 1));
    const embeds = formatExpandedSellReply(emptyResult({ sellMb: rows }));
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.fields).toHaveLength(10);
  });

  it('caps at 75 rows', () => {
    const rows = Array.from({ length: 200 }, (_, i) => sellRow(i + 1));
    const embeds = formatExpandedSellReply(emptyResult({ sellMb: rows }));
    expect(embeds.flatMap((e) => e.data.fields ?? []).length).toBe(75);
  });
});

describe('formatExpandedVendorDiscardReply', () => {
  it('renders vendor and discard rows together, vendor first', () => {
    const vendors = [vendorRow(1), vendorRow(2)];
    const discards = [discardRow(10), discardRow(11)];
    const embeds = formatExpandedVendorDiscardReply(emptyResult({ vendor: vendors, discard: discards }));
    expect(embeds).toHaveLength(1);
    const labels = (embeds[0].data.fields ?? []).map((f) => f.name);
    expect(labels[0]).toContain('Vendor 1');
    expect(labels[1]).toContain('Vendor 2');
    expect(labels[2]).toContain('Discard 10');
    expect(labels[3]).toContain('Discard 11');
  });

  it('respects the 75-row cap across vendor + discard combined', () => {
    const vendors = Array.from({ length: 50 }, (_, i) => vendorRow(i + 1));
    const discards = Array.from({ length: 50 }, (_, i) => discardRow(i + 100));
    const embeds = formatExpandedVendorDiscardReply(emptyResult({ vendor: vendors, discard: discards }));
    expect(embeds.flatMap((e) => e.data.fields ?? []).length).toBe(75);
  });
});

describe('formatCleanupReply with buttons param', () => {
  it('attaches a components row when cacheId is provided', () => {
    const out = formatCleanupReply(
      { result: emptyResult({ craft: [craftRow(1)] }), usesByItemId: new Map(), totalRows: 1 },
      { ownerId: 'u1', cacheId: 'abcdef012345' },
    );
    expect(out.components).toHaveLength(1);
    expect(out.components![0].components).toHaveLength(4);
  });

  it('omits components when no ownerId/cacheId passed', () => {
    const out = formatCleanupReply({ result: emptyResult(), usesByItemId: new Map(), totalRows: 0 });
    expect(out.components).toBeUndefined();
  });
});
