import { useEffect, useMemo, useState } from 'react';
import { useShoppingListStore } from '../features/shoppingList/shoppingListStore';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useRecipes } from '../features/profit/useRecipes';
import { useMarketData } from '../features/watchlist/useMarketData';
import { useSettingsStore } from '../features/settings/store';
import { useVendorShopSnapshot } from '../features/queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../features/queries/useSpecialShopSnapshot';
import { aggregateIngredients } from '../features/shoppingList/aggregateIngredients';
import { surveyIngredients } from '../features/shoppingList/shoppingListSurvey';
import { ShoppingListPanel } from '../features/shoppingList/ShoppingListPanel';
import { ShoppingListPlan } from '../features/shoppingList/ShoppingListPlan';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function ShoppingList() {
  const items = useShoppingListStore((s) => s.items);
  const { world, dc } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const vendor = useVendorShopSnapshot();
  const shop = useSpecialShopSnapshot();

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const recipes = useRecipes(itemIds);

  const aggregate = useMemo(() => {
    if (!recipes.data) return null;
    return aggregateIngredients(items, recipes.data);
  }, [items, recipes.data]);

  const priceIds = useMemo(() => {
    const ids = new Set<number>(itemIds);
    if (aggregate) for (const id of aggregate.demand.keys()) ids.add(id);
    return [...ids];
  }, [itemIds, aggregate]);

  const market = useMarketData(priceIds, world, dc, 'Europe');

  const [planRequested, setPlanRequested] = useState(false);
  // Re-arm when the list changes — user must click Plan again.
  useEffect(() => { setPlanRequested(false); }, [itemIds.length]);

  const survey = useMemo(() => {
    if (!planRequested || !aggregate || !market.data || !snapshot.data) return null;
    const vendorMap = vendor.data?.snapshot ?? new Map<number, number>();
    const shopSnapshot = shop.data?.snapshot ?? { byCurrency: new Map() };
    return surveyIngredients(aggregate.demand, market.data.region, vendorMap, shopSnapshot);
  }, [planRequested, aggregate, market.data, snapshot.data, vendor.data, shop.data]);

  const searchableItems = useMemo(() => {
    if (!snapshot.data || !recipes.data) {
      return (snapshot.data?.items ?? []).map((s) => ({ id: s.id, name: s.name, hasRecipe: false }));
    }
    // Note: `hasRecipe` resolves only for items the recipe snapshot has been queried for.
    // For unqueried items we conservatively treat as craftable=false; the Item page Add button
    // gives a reliable per-item check. This panel's add field is a quick fallback.
    return snapshot.data.items.map((s) => ({
      id: s.id,
      name: s.name,
      hasRecipe: !!recipes.data?.get(s.id),
    }));
  }, [snapshot.data, recipes.data]);

  const nameById = useMemo(() => {
    const m = new Map<number, string>();
    if (snapshot.data) for (const it of snapshot.data.items) m.set(it.id, it.name);
    return m;
  }, [snapshot.data]);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Shopping List</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Plan a crafting session across multiple items — aggregates ingredients region-wide and finds the cheapest source per material.
        </p>
      </div>

      <ShoppingListPanel
        searchableItems={searchableItems}
        onPlan={() => setPlanRequested(true)}
      />

      {planRequested && (market.isLoading || recipes.isLoading) && (
        <Spinner label="Fetching prices + recipes…" />
      )}
      {planRequested && market.isError && (
        <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>
      )}
      {planRequested && recipes.isError && (
        <StatusBanner kind="error">Recipe fetch failed: {(recipes.error as Error).message}</StatusBanner>
      )}
      {survey && snapshot.data && market.data && (
        <ShoppingListPlan
          survey={survey}
          shoppingItems={items}
          snapshot={snapshot.data.items}
          prices={market.data.region}
          nameById={nameById}
        />
      )}
    </div>
  );
}
