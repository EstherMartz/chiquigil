import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useUsedInIndex } from '../items/useUsedInIndex';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { useSpecialShopSnapshot } from '../queries/useSpecialShopSnapshot';
import { useMarketData } from '../watchlist/useMarketData';
import { findItemCurrencyOffers } from '../items/currencyOffers';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import {
  recipeMaterialCostHome,
  findBestSingleStopFor,
  selfSourceCost,
  type CurrencyResolver,
} from '../items/materialCost';
import { buildComparison, type Comparison, type ComparisonOutput } from './comparePaths';
import { effectiveUnitsPerDay } from '../items/verdict/pricing';
import type { MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

export type MaterialSource = 'home' | 'region' | 'self';

const NINETY_DAYS_SEC = 90 * 24 * 60 * 60;
/** Max craft→output cards; bounds expensive 90d history fetches. */
export const DEFAULT_OUTPUT_CAP = 5;

export interface UseComparePathsResult {
  comparison: Comparison | null;
  loading: boolean;
  error: boolean;
}

export function useComparePaths(
  itemId: number | null,
  materialSource: MaterialSource,
  quantity: number,
): UseComparePathsResult {
  const valid = itemId != null && Number.isFinite(itemId) && itemId > 0;
  const { world, dc } = useSettingsStore();

  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot(valid);
  const usedInIdx = useUsedInIndex();
  const gathering = useGatheringCatalog();
  const shop = useSpecialShopSnapshot();

  const recipeMap = recipes.data;
  const sourceItem = useMemo(
    () => (valid && snapshot.data ? snapshot.data.items.find((i) => i.id === itemId) : undefined),
    [valid, snapshot.data, itemId],
  );
  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of snapshot.data?.items ?? []) m.set(i.id, i.name);
    return (id: number) => m.get(id) ?? `Item #${id}`;
  }, [snapshot.data?.items]);

  const sourceRecipe = valid && recipeMap ? recipeMap.get(itemId!) : undefined;
  const usedIn = valid ? (usedInIdx.data.get(itemId!) ?? []) : [];

  const outputRecipes = useMemo(() => {
    if (!recipeMap) return [];
    const out: Recipe[] = [];
    for (const e of usedIn) {
      const r = recipeMap.get(e.resultId);
      if (r) out.push(r);
    }
    return out;
  }, [usedIn, recipeMap]);

  const priceIds = useMemo(() => {
    if (!valid) return [];
    const ids = new Set<number>([itemId!]);
    if (sourceRecipe) for (const ing of sourceRecipe.ingredients) ids.add(ing.itemId);
    for (const r of outputRecipes) {
      ids.add(r.itemResultId);
      for (const ing of r.ingredients) ids.add(ing.itemId);
    }
    return [...ids];
  }, [valid, itemId, sourceRecipe, outputRecipes]);

  const market = useMarketData(priceIds, world, dc, 'Europe', { enabled: valid && priceIds.length > 0 });
  const phantom = market.data?.phantom;
  const regionMap = market.data?.region;

  const gatherableIds = useMemo(
    () => (gathering.data ? new Set(gathering.data.keys()) : new Set<number>()),
    [gathering.data],
  );
  const currencyOf: CurrencyResolver = useMemo(() => {
    const snap = shop.data?.snapshot;
    return (id: number) => {
      if (!snap) return null;
      const offers = findItemCurrencyOffers(id, snap);
      if (offers.length === 0) return null;
      return { label: offers[0].currency.shortLabel, cost: offers[0].costPerUnit };
    };
  }, [shop.data?.snapshot]);

  const matCostOf = useMemo(() => {
    return (recipe: Recipe): number => {
      const home = recipeMaterialCostHome(recipe, phantom);
      if (materialSource === 'home') return home;
      if (materialSource === 'region') {
        if (!regionMap) return home;
        return findBestSingleStopFor(recipe.ingredients, regionMap, world, home).cost;
      }
      if (!recipeMap || !phantom) return home;
      return selfSourceCost(recipe, recipeMap, phantom, gatherableIds, currencyOf);
    };
  }, [materialSource, phantom, regionMap, recipeMap, world, gatherableIds, currencyOf]);

  const topOutputs = useMemo(() => {
    if (!phantom) return [];
    const scored = outputRecipes.map((r) => {
      const m = phantom[String(r.itemResultId)];
      const sale = m?.avgNQ ?? m?.medianNQ ?? m?.minNQ ?? m?.minHQ ?? 0;
      const profit = sale - matCostOf(r);
      const provisional = profit * effectiveUnitsPerDay(m?.velocity ?? 0, m?.listingCount ?? 0);
      return { recipe: r, provisional };
    });
    scored.sort((a, b) => b.provisional - a.provisional);
    return scored.slice(0, DEFAULT_OUTPUT_CAP).map((s) => s.recipe);
  }, [outputRecipes, phantom, matCostOf]);

  const hq = sourceItem?.canHq ?? false;

  const historyIds = useMemo(() => {
    if (!valid) return [];
    return [...new Set<number>([itemId!, ...topOutputs.map((r) => r.itemResultId)])];
  }, [valid, itemId, topOutputs]);

  const historyQ = useQuery({
    queryKey: ['compare-history', world, historyIds],
    enabled: valid && historyIds.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: () => fetchHistoryWithin(world, historyIds, NINETY_DAYS_SEC),
  });

  const comparison = useMemo<Comparison | null>(() => {
    if (!valid || !sourceItem || !phantom) return null;
    const histMap = historyQ.data ?? new Map<number, HistoryEntry[]>();
    const sourceMarket = phantom[String(itemId!)] as MarketItem | undefined;

    const outputs: ComparisonOutput[] = topOutputs.map((r) => ({
      itemId: r.itemResultId,
      itemName: nameOf(r.itemResultId),
      hq: false,
      market: phantom[String(r.itemResultId)],
      history: histMap.get(r.itemResultId) ?? [],
      recipe: r,
    }));

    return buildComparison({
      source: {
        itemId: itemId!,
        itemName: nameOf(itemId!),
        hq,
        market: sourceMarket,
        history: histMap.get(itemId!) ?? [],
        priceLow: sourceItem.priceLow ?? 0,
        recipe: sourceRecipe ?? undefined,
      },
      outputs,
      matCostOf,
      homeMarket: phantom,
      quantity,
      now: Date.now(),
    });
  }, [valid, sourceItem, phantom, historyQ.data, topOutputs, nameOf, itemId, hq, sourceRecipe, matCostOf, quantity]);

  return {
    comparison,
    loading: snapshot.isLoading || recipes.isLoading || market.isLoading || historyQ.isLoading,
    error: market.isError,
  };
}
