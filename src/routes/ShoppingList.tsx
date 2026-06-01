import { useEffect, useMemo, useState } from 'react';
import { useShoppingListStore } from '../features/shoppingList/shoppingListStore';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useRecipeSnapshot } from '../features/queries/useRecipeSnapshot';
import { useMarketData } from '../features/watchlist/useMarketData';
import { useSettingsStore } from '../features/settings/store';
import { useVendorShopSnapshot } from '../features/queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../features/queries/useSpecialShopSnapshot';
import { CRYSTALS_SEARCH_CATEGORY } from '../features/queries/commonFilters';
import { buildCraftPlan, type SourceKind } from '../features/shoppingList/buildCraftPlan';
import { surveyIngredients } from '../features/shoppingList/shoppingListSurvey';
import { ShoppingListPanel } from '../features/shoppingList/ShoppingListPanel';
import { ShoppingListPlan } from '../features/shoppingList/ShoppingListPlan';
import { CraftSection } from '../features/shoppingList/CraftSection';
import { GatherSection } from '../features/shoppingList/GatherSection';
import { useGatheringCatalog } from '../features/queries/useGatheringCatalog';
import { PluginShoppingSend } from '../features/plugin/PluginShoppingSend';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function ShoppingList() {
  const items = useShoppingListStore((s) => s.items);
  const { world, dc, hideCrystals } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const vendor = useVendorShopSnapshot();
  const shop = useSpecialShopSnapshot();

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const recipes = useRecipeSnapshot(itemIds.length > 0);
  const gathering = useGatheringCatalog();
  const [overrides, setOverrides] = useState<Map<number, SourceKind>>(new Map());
  const setBuyOverride = (id: number) =>
    setOverrides((prev) => { const next = new Map(prev); next.set(id, 'buy'); return next; });
  const resetOverrides = () => setOverrides(new Map());
  const targetIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const plan = useMemo(() => {
    if (!recipes.data || !gathering.data) return null;
    return buildCraftPlan(items, recipes.data, gathering.data, overrides);
  }, [items, recipes.data, gathering.data, overrides]);

  const priceIds = useMemo(() => {
    const ids = new Set<number>(itemIds);
    if (plan) for (const id of plan.buy.keys()) ids.add(id);
    return [...ids];
  }, [itemIds, plan]);

  const market = useMarketData(priceIds, world, dc, 'Europe');

  const [planRequested, setPlanRequested] = useState(false);
  // Re-arm when the list changes — user must click Plan again.
  useEffect(() => { setPlanRequested(false); }, [itemIds.length]);

  const survey = useMemo(() => {
    if (!planRequested || !plan || !market.data || !snapshot.data) return null;
    const vendorMap = vendor.data?.snapshot ?? new Map<number, number>();
    const shopSnapshot = shop.data?.snapshot ?? { byCurrency: new Map() };

    let demand = plan.buy;
    if (hideCrystals) {
      const crystalIds = new Set(
        snapshot.data.items.filter((s) => s.sc === CRYSTALS_SEARCH_CATEGORY).map((s) => s.id),
      );
      demand = new Map([...demand].filter(([id]) => !crystalIds.has(id)));
    }

    return surveyIngredients(demand, market.data.region, vendorMap, shopSnapshot);
  }, [planRequested, plan, market.data, snapshot.data, vendor.data, shop.data, hideCrystals]);

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

  // Ingredient demand (name + qty) to push into the in-game plugin window.
  const pluginShoppingItems = useMemo(() => {
    if (!plan) return [];
    const acquire = new Map<number, number>();
    for (const [id, g] of plan.gather) acquire.set(id, g.qty);
    for (const [id, qty] of plan.buy) acquire.set(id, (acquire.get(id) ?? 0) + qty);
    return [...acquire].map(([id, qty]) => ({ name: nameById.get(id) ?? `#${id}`, qty }));
  }, [plan, nameById]);

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Craft Helper</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Plan a crafting session end-to-end — what to craft, what to gather, and what to buy, with the cheapest source per material.
        </p>
      </div>

      <ShoppingListPanel
        searchableItems={searchableItems}
        onPlan={() => setPlanRequested(true)}
      />

      <PluginShoppingSend items={pluginShoppingItems} />

      {plan && overrides.size > 0 && (
        <div className="font-mono text-[11px] text-text-low flex items-center gap-2">
          <span>{overrides.size} item{overrides.size === 1 ? '' : 's'} moved to Buy</span>
          <button onClick={resetOverrides} className="text-aether hover:underline decoration-1 underline-offset-4">
            reset
          </button>
        </div>
      )}
      {plan && (
        <CraftSection craft={plan.craft} targetIds={targetIds} nameById={nameById} onBuyInstead={setBuyOverride} />
      )}
      {plan && (
        <GatherSection gather={plan.gather} nameById={nameById} onBuyInstead={setBuyOverride} />
      )}

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
