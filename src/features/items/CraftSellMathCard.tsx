import { useMemo } from 'react';
import { findBestSingleStopFor } from '../../routes/Item';
import type { Recipe } from '../../lib/recipes';
import type { MarketItem, MarketData } from '../../lib/universalis';
import { Gil } from '../../components/Gil';
import { SectionHeader } from '../../components/SectionHeader';

/**
 * Gil cost to *self-source* one unit: gatherable ingredients cost 0 (you
 * harvest them — costs time, not gil), craftable ones recurse into their own
 * self-source cost (divided by the sub-recipe's yield), everything else falls
 * back to its market buy price. Full-depth, with cycle protection. Returns the
 * floor cost in gil of making one of the target item yourself.
 */
export function selfSourceCost(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  market: MarketData,
  gatherableIds: Set<number>,
  seen: Set<number> = new Set(),
): number {
  let total = 0;
  for (const ing of recipe.ingredients) {
    total += selfSourceUnit(ing.itemId, recipeMap, market, gatherableIds, seen) * ing.amount;
  }
  return total;
}

function marketUnit(itemId: number, market: MarketData): number {
  const m = market[itemId];
  return m?.minNQ ?? m?.minHQ ?? 0;
}

function selfSourceUnit(
  itemId: number,
  recipeMap: Map<number, Recipe | null>,
  market: MarketData,
  gatherableIds: Set<number>,
  seen: Set<number>,
): number {
  if (gatherableIds.has(itemId)) return 0; // harvest it yourself — no gil
  const sub = recipeMap.get(itemId);
  if (sub && !seen.has(itemId)) {
    const next = new Set(seen).add(itemId); // guard against recipe cycles
    const perBatch = selfSourceCost(sub, recipeMap, market, gatherableIds, next);
    return perBatch / (sub.amountResult ?? 1);
  }
  return marketUnit(itemId, market); // must buy it
}

export interface CraftSellMathInput {
  materialsHome: number;
  materialsRegionBest: number;
  /** Display-only: floor cost if self-sourced. Doesn't affect the math output. */
  materialsSelf?: number | null;
  salePrice: number | null;
  velocity: number;
}

export interface CraftSellMathOutput {
  bestMaterials: number;
  profitPerCraft: number | null;
  daysToMove: number | null;
  gilPerHour: number | null;
}

export function craftSellMath(input: CraftSellMathInput): CraftSellMathOutput {
  const { materialsHome, materialsRegionBest, salePrice, velocity } = input;

  const bestMaterials = Math.min(materialsHome, materialsRegionBest);
  const profitPerCraft = salePrice != null ? salePrice - bestMaterials : null;
  const daysToMove = velocity > 0 ? 1 / velocity : null;
  const gilPerHour = profitPerCraft != null && daysToMove != null && daysToMove > 0
    ? profitPerCraft / (daysToMove * 24)
    : null;

  return {
    bestMaterials,
    profitPerCraft,
    daysToMove,
    gilPerHour,
  };
}

function humanizeDays(days: number | null): string {
  if (days == null) return 'unknown';
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours}h`;
  }
  if (days < 14) {
    return `${Math.round(days)}d`;
  }
  const weeks = Math.round(days / 7);
  return `~${weeks}wk`;
}

export function CraftSellMathCard({
  recipe,
  materialsHome,
  regionMap,
  homeWorld,
  phantom,
  canHq,
  recipeMap,
  homeMarket,
  gatherableIds,
}: {
  recipe: Recipe;
  materialsHome: number;
  regionMap?: Record<string, MarketItem | undefined>;
  homeWorld: string;
  phantom?: MarketItem;
  canHq: boolean;
  /** Full recipe snapshot — enables recursive self-source costing. */
  recipeMap?: Map<number, Recipe | null>;
  /** Home-world prices for ingredients we still have to buy. */
  homeMarket?: MarketData;
  /** Ids of gatherable items (cost 0 to self-source). */
  gatherableIds?: Set<number>;
}) {
  // Compute the best single-stop region cost if we have region data.
  const { materialsRegionBest, bestWorld } = useMemo(() => {
    if (!regionMap) return { materialsRegionBest: materialsHome, bestWorld: null };
    const result = findBestSingleStopFor(recipe.ingredients, regionMap, homeWorld, materialsHome);
    return { materialsRegionBest: result.cost, bestWorld: result.world };
  }, [recipe.ingredients, regionMap, homeWorld, materialsHome]);

  // Floor cost if you gather + craft everything you can yourself.
  const materialsSelf = useMemo(() => {
    if (!recipeMap || !homeMarket) return null;
    return selfSourceCost(recipe, recipeMap, homeMarket, gatherableIds ?? new Set());
  }, [recipe, recipeMap, homeMarket, gatherableIds]);

  // Get the sale price: prefer HQ average, fall back to NQ average.
  const salePrice = useMemo(() => {
    if (!phantom) return null;
    if (canHq) {
      return phantom.averagePriceHQ ?? phantom.medianHQ ?? phantom.minHQ ?? null;
    }
    return phantom.averagePriceNQ ?? phantom.medianNQ ?? phantom.minNQ ?? null;
  }, [phantom, canHq]);

  const velocity = phantom?.velocity ?? 0;

  const math = useMemo(
    () => craftSellMath({
      materialsHome,
      materialsRegionBest,
      materialsSelf,
      salePrice,
      velocity,
    }),
    [materialsHome, materialsRegionBest, materialsSelf, salePrice, velocity],
  );

  // Self-source profit (sale − floor cost), shown alongside the buy-now profit.
  const profitSelf = salePrice != null && materialsSelf != null ? salePrice - materialsSelf : null;

  const regionCheaper = materialsRegionBest < materialsHome;

  const salePriceLabel = canHq && salePrice != null ? 'Sale price (Avg HQ)' : 'Sale price (Avg NQ)';

  return (
    <section>
      <SectionHeader label="Craft → sell math" compact />
      <div className="border border-border-base bg-bg-card p-4 space-y-3">
        {/* Input rows */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-baseline">
            <span className="text-text-dim font-mono text-[10px] tracking-widest uppercase">Materials @ home</span>
            <span className="font-mono"><Gil value={materialsHome} /></span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              Materials @ region
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono"><Gil value={materialsRegionBest} /></span>
              {regionCheaper && bestWorld && (
                <span className="text-[9px] text-text-low font-mono">
                  (best at {bestWorld})
                </span>
              )}
            </div>
          </div>
          {materialsSelf != null && (
            <div className="flex justify-between items-baseline">
              <span className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                Materials @ self-source
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono"><Gil value={materialsSelf} /></span>
                <span className="text-[9px] text-text-low font-mono">(gather + craft)</span>
              </div>
            </div>
          )}
          <div className="flex justify-between items-baseline">
            <span className="text-text-dim font-mono text-[10px] tracking-widest uppercase">HQ rate</span>
            <span className="text-text-low text-xs italic">
              —{' '}
              <span className="text-[9px]">depends on your gear</span>
            </span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              {salePriceLabel}
            </span>
            <span className="font-mono">
              {salePrice != null ? <Gil value={salePrice} /> : '—'}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border-base/50" />

        {/* Profit headline */}
        <div>
          <div className="flex justify-between items-baseline">
            <span className="text-text-dim font-mono text-[10px] tracking-widest uppercase">Profit / craft</span>
            <span
              className={`font-mono text-2xl ${
                math.profitPerCraft != null && math.profitPerCraft > 0
                  ? 'text-jade'
                  : 'text-text-low'
              }`}
            >
              {math.profitPerCraft != null ? (
                <>
                  +<Gil value={math.profitPerCraft} />
                </>
              ) : (
                '—'
              )}
            </span>
          </div>
          <div className="text-[11px] text-text-low">if you buy materials &amp; craft now</div>
          {profitSelf != null && (
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                Profit / craft (self-sourced)
              </span>
              <span className={`font-mono text-sm ${profitSelf > 0 ? 'text-jade' : 'text-text-low'}`}>
                {profitSelf >= 0 ? '+' : ''}<Gil value={profitSelf} />
              </span>
            </div>
          )}
        </div>

        {/* Reality check callout */}
        {velocity > 0 ? (
          <div className="text-[11px] text-text-low space-y-1">
            <div className="flex gap-1">
              <span className="text-gold flex-shrink-0">•</span>
              <span>
                At {velocity.toFixed(1)} sales/day you'd wait ~{humanizeDays(math.daysToMove)} to move 1.
                {math.gilPerHour != null && (
                  <>
                    {' '}True gil/hour ≈{' '}
                    <span className="text-text-cream font-mono">
                      <Gil value={Math.round(math.gilPerHour)} />
                    </span>
                    .
                  </>
                )}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-text-low flex gap-1">
            <span className="text-gold flex-shrink-0">•</span>
            <span>No recent sales — gil/hour unknown.</span>
          </div>
        )}

        {/* Self-source caveat — gil floor, but gathering costs time */}
        {materialsSelf != null && materialsSelf < math.bestMaterials && (
          <div className="text-[11px] text-text-low flex gap-1">
            <span className="text-gold flex-shrink-0">•</span>
            <span>Self-source is a gil floor — gathering raw mats costs time, not gil.</span>
          </div>
        )}

        {/* No home sale price yet */}
        {salePrice == null && (
          <div className="text-[11px] text-text-low flex gap-1">
            <span className="text-gold flex-shrink-0">•</span>
            <span>No home sale price yet.</span>
          </div>
        )}
      </div>
    </section>
  );
}
