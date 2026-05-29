import { describe, it, expect } from 'vitest';
import { buildCraftTree } from './craftTree';
import type { Recipe } from '../../lib/recipes';
import type { MarketItem } from '../../lib/universalis';

const mk = (minNQ: number): MarketItem => ({ minNQ } as MarketItem);
const nameOf = (id: number) => `#${id}`;

function recipe(itemResultId: number, amountResult: number, ings: [number, number][]): Recipe {
  return {
    itemResultId,
    classJob: 'CRP' as Recipe['classJob'],
    recipeLevel: 1,
    amountResult,
    ingredients: ings.map(([itemId, amount]) => ({ itemId, amount })),
  } as Recipe;
}

describe('buildCraftTree', () => {
  it('crafts when cheaper and rolls up the optimal cost (respecting yield)', () => {
    // 100 = 2×200 + 1×300; 200 = 3×400 (yields 3); 300,400 raw.
    const recipes = new Map<number, Recipe>([
      [100, recipe(100, 1, [[200, 2], [300, 1]])],
      [200, recipe(200, 3, [[400, 3]])],
    ]);
    const dc: Record<string, MarketItem> = {
      '100': mk(1000), '200': mk(200), '300': mk(50), '400': mk(10),
    };

    const t = buildCraftTree(100, 1, recipes, dc, undefined, nameOf);

    expect(t.marketBuyCost).toBe(1000);
    // 200 costs 1 batch × 3×10 = 30 to craft (< 200 to buy) → craft
    const n200 = t.children.find((c) => c.itemId === 200)!;
    expect(n200.bestChoice).toBe('craft');
    expect(n200.bestCost).toBe(30);
    // 300 raw → buy 50
    const n300 = t.children.find((c) => c.itemId === 300)!;
    expect(n300.bestChoice).toBe('buy');
    expect(n300.bestCost).toBe(50);
    // root craft = 30 + 50 = 80 < 1000 → craft
    expect(t.craftCost).toBe(80);
    expect(t.bestChoice).toBe('craft');
    expect(t.bestCost).toBe(80);
  });

  it('buys an intermediate when crafting it is pricier', () => {
    const recipes = new Map<number, Recipe>([
      [100, recipe(100, 1, [[200, 2], [300, 1]])],
      [200, recipe(200, 3, [[400, 3]])],
    ]);
    const dc: Record<string, MarketItem> = {
      '100': mk(1000), '200': mk(200), '300': mk(50), '400': mk(10000),
    };
    const t = buildCraftTree(100, 1, recipes, dc, undefined, nameOf);
    const n200 = t.children.find((c) => c.itemId === 200)!;
    expect(n200.bestChoice).toBe('buy');   // craft would be 30000, buy 2× = 400
    expect(n200.bestCost).toBe(400);
    expect(t.craftCost).toBe(450);         // 400 (buy 200×2) + 50 (buy 300)
    expect(t.bestChoice).toBe('craft');    // still cheaper than buying 100 (1000)
  });

  it('crafts unbuyable items (no market price)', () => {
    const recipes = new Map<number, Recipe>([[100, recipe(100, 1, [[400, 2]])]]);
    const dc: Record<string, MarketItem> = { '400': mk(10) }; // 100 has no price
    const t = buildCraftTree(100, 1, recipes, dc, undefined, nameOf);
    expect(t.marketBuyCost).toBe(0);
    expect(t.craftCost).toBe(20);
    expect(t.bestChoice).toBe('craft');
  });

  it('terminates on a self-referential recipe', () => {
    const recipes = new Map<number, Recipe>([[500, recipe(500, 1, [[500, 1]])]]);
    const dc: Record<string, MarketItem> = { '500': mk(5) };
    const t = buildCraftTree(500, 1, recipes, dc, undefined, nameOf);
    // child 500 is cycle-guarded → treated as buy; no infinite recursion
    expect(t.children).toHaveLength(1);
    expect(t.children[0].bestChoice).toBe('buy');
  });
});
