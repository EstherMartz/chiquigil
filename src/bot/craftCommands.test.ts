import { describe, it, expect } from 'vitest';
import { buildTasksForProjectItems, resolveItemsByName, type CraftCommandDeps } from './craftCommands';
import { buildNameIndex } from './nameIndex';
import type { BotSnapshots } from './loadSnapshots';
import type { MarketBundle } from '../features/watchlist/useMarketData';
import type { CompanyCraftRecipe } from '../lib/companyCraftSnapshot';

const emptyMarket: MarketBundle = { phantom: {}, dc: {}, region: {} };

function snapshots(over: Partial<BotSnapshots> = {}): BotSnapshots {
  return {
    recipes: new Map(),
    namesById: new Map(),
    vendorMap: new Map(),
    specialShop: { byCurrency: new Map() },
    gatheringCatalog: new Map(),
    companyCraft: new Map(),
    ...over,
  } as BotSnapshots;
}

function deps(snap: BotSnapshots): CraftCommandDeps {
  return { snapshots: snap, marketBundle: emptyMarket } as unknown as CraftCommandDeps;
}

describe('resolveItemsByName', () => {
  it('resolves known names and collects unknowns', () => {
    const nameIndex = buildNameIndex(new Map([[5106, 'Iron Ore'], [5107, 'Hardsilver Ore']]));
    const { resolved, unmatched } = resolveItemsByName(nameIndex, [
      { name: 'Iron Ore', qty: 6 },
      { name: 'Nonexistent Widget', qty: 2 },
    ]);
    expect(resolved).toEqual([{ itemId: 5106, itemName: 'Iron Ore', qty: 6 }]);
    expect(unmatched).toEqual(['Nonexistent Widget']);
  });
});

describe('buildTasksForProjectItems', () => {
  it('merges the same leaf item across multiple project items', () => {
    const cc: CompanyCraftRecipe = {
      resultItemId: 31600,
      resultName: 'Tatanora Hull',
      parts: [{
        name: 'Hull',
        phases: [{
          ingredients: [
            { itemId: 5106, qty: 6 },
            { itemId: 5107, qty: 10 },
          ],
        }],
      }],
    };
    const snap = snapshots({
      companyCraft: new Map([[31600, cc]]),
      namesById: new Map([[31600, 'Tatanora Hull'], [5106, 'Iron Ore'], [5107, 'Hardsilver Ore']]),
    });
    const tasks = buildTasksForProjectItems(
      [{ itemId: 31600, qty: 2 }, { itemId: 31600, qty: 3 }],
      deps(snap),
    );
    // 2 + 3 = 5 total qty of result item
    // Each needs 6x Iron Ore → 6 * 5 = 30 total
    const iron = tasks.filter((t) => t.itemId === 5106);
    expect(iron).toHaveLength(1);
    expect(iron[0].qtyNeeded).toBe(30);
  });
});
