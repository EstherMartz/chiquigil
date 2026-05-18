import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSettingsStore } from '../features/settings/store';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useRecipeSnapshot } from '../features/queries/useRecipeSnapshot';
import { useGatheringCatalog } from '../features/queries/useGatheringCatalog';
import { useGarlandItem } from '../features/queries/useGarlandItem';
import { useGarlandLocations } from '../features/queries/useGarlandLocations';
import { useUsedInIndex } from '../features/items/useUsedInIndex';
import { useMarketData } from '../features/watchlist/useMarketData';
import { useVendorShopSnapshot } from '../features/queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../features/queries/useSpecialShopSnapshot';
import { SaleHistoryBlock } from '../features/items/SaleHistoryBlock';
import { VendorSourceCard } from '../features/items/VendorSourceCard';
import { CurrencySourceCard } from '../features/items/CurrencySourceCard';
import { CrossWorldListingsBlock } from '../features/items/CrossWorldListingsBlock';
import { findItemCurrencyOffers } from '../features/items/currencyOffers';
import { AddToWatchlistButton } from '../features/items/AddToWatchlistButton';
import { AddToShoppingListButton } from '../features/shoppingList/AddToShoppingListButton';
import { fmtGil, garlandItemUrl } from '../lib/format';
import { Gil } from '../components/Gil';
import { rarityBorderLeftClass, rarityLabel, rarityTextClass } from '../features/items/rarity';
import { categoryLabel } from '../lib/itemSearchCategories';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';
import { SectionHeader } from '../components/SectionHeader';
import { HqStar } from '../components/HqStar';
import { ItemNameLinks } from '../components/ItemNameLinks';
import { dcOf } from '../lib/europeWorlds';
import type { SnapshotItem } from '../lib/itemSnapshot';
import type { MarketItem } from '../lib/universalis';
import type { IngredientSource } from '../lib/garlandData';
import type { Recipe } from '../lib/recipes';

const USED_IN_LIMIT = 20;

const SOURCE_LABEL: Record<IngredientSource, string> = {
  vendor: 'Vendor',
  gather: 'Gather',
  craft: 'Craft',
  other: '—',
};

export default function Item() {
  const { id } = useParams();
  const itemId = Number(id);
  const valid = Number.isFinite(itemId) && itemId > 0;

  const { world, dc } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot(valid);
  const gathering = useGatheringCatalog();
  const garland = useGarlandItem(valid ? itemId : null);
  const locations = useGarlandLocations();
  const usedInIdx = useUsedInIndex();

  const item: SnapshotItem | undefined = useMemo(() => {
    if (!valid || !snapshot.data) return undefined;
    return snapshot.data.items.find((i) => i.id === itemId);
  }, [snapshot.data, itemId, valid]);

  const recipe = valid && recipes.data ? recipes.data.get(itemId) : undefined;

  const ingredientIds = recipe?.ingredients.map((i) => i.itemId) ?? [];
  const priceIds = useMemo(() => {
    if (!valid) return [];
    return [...new Set<number>([itemId, ...ingredientIds])];
  }, [itemId, ingredientIds, valid]);

  const market = useMarketData(priceIds, world, dc, 'Europe');
  const vendors = useVendorShopSnapshot();
  const vendorPrice = valid && vendors.data?.vendors.get(itemId);
  const shop = useSpecialShopSnapshot();
  const currencyOffers = useMemo(
    () => valid ? findItemCurrencyOffers(itemId, shop.data?.snapshot ?? { byCurrency: new Map() }) : [],
    [itemId, valid, shop.data],
  );

  const vendorNpc = useMemo(() => {
    if (!vendorPrice || !garland.data?.gilShopNpcs.length) return undefined;
    const first = garland.data.gilShopNpcs[0];
    const zone = first.locationId != null ? locations.data?.get(first.locationId) : undefined;
    return { name: first.name, zone };
  }, [vendorPrice, garland.data, locations.data]);

  const currencyNpcsByItemId = useMemo(() => {
    if (!garland.data?.tradeShopNpcs.length) return undefined;
    const map = new Map<number, { name: string; zone?: string }>();
    for (const npc of garland.data.tradeShopNpcs) {
      if (map.has(npc.currencyItemId)) continue;
      const zone = npc.locationId != null ? locations.data?.get(npc.locationId) : undefined;
      map.set(npc.currencyItemId, { name: npc.name, zone });
    }
    return map.size ? map : undefined;
  }, [garland.data, locations.data]);

  const usedIn = valid ? (usedInIdx.data.get(itemId) ?? []) : [];

  if (!valid) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <StatusBanner kind="error">Invalid item id.</StatusBanner>
      </div>
    );
  }

  // Fall back to Garland's name/ilvl if the snapshot doesn't have this item.
  const displayName = item?.name ?? garland.data?.name ?? `Item #${itemId}`;
  const displayIlvl = item?.ilvl ?? garland.data?.ilvl ?? 0;
  const displaySc = item?.sc ?? 0;
  const canHq = item?.canHq ?? false;

  const gather = gathering.data?.get(itemId);
  const phantomMarket = market.data?.phantom[itemId];
  const dcMarket = market.data?.dc[itemId];
  const regionMarket = market.data?.region[itemId];

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      <HeaderBlock
        name={displayName}
        ilvl={displayIlvl}
        sc={displaySc}
        canHq={canHq}
        rarity={item?.rarity}
        itemId={itemId}
        recipe={recipe ?? null}
      />

      {snapshot.isLoading && (
        <div className="py-4"><Spinner label="Loading item catalog…" /></div>
      )}
      {market.isError && (
        <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>
      )}

      <PricesBlock
        worldLabel={world}
        dcLabel={dc}
        loading={market.isLoading}
        phantom={phantomMarket}
        dc={dcMarket}
      />

      {regionMarket && regionMarket.worldListings.length > 0 && (
        <CrossWorldListingsBlock
          listings={regionMarket.worldListings}
          homeWorld={world}
          homeMinNQ={phantomMarket?.minNQ ?? null}
          homeMinHQ={phantomMarket?.minHQ ?? null}
        />
      )}

      {vendorPrice ? (
        <VendorSourceCard
          vendorPrice={vendorPrice}
          homeMarket={phantomMarket}
          canHq={canHq}
          worldLabel={world}
          npcName={vendorNpc?.name}
          npcZone={vendorNpc?.zone}
        />
      ) : null}

      {currencyOffers.length > 0 && (
        <CurrencySourceCard
          offers={currencyOffers}
          homeMarket={phantomMarket}
          canHq={canHq}
          worldLabel={world}
          npcsByCurrencyItemId={currencyNpcsByItemId}
        />
      )}

      <SaleHistoryBlock itemId={itemId} scope={dc} canHq={canHq} />

      {recipes.isLoading && !recipe && (
        <div className="py-4"><Spinner label="Loading recipe catalog…" /></div>
      )}
      {recipe && (
        <RecipeBlock
          recipe={recipe}
          itemNames={snapshot.data?.items}
          phantom={market.data?.phantom}
          garlandIngredients={garland.data?.ingredients}
        />
      )}

      {recipe && (
        <MaterialShoppingBlock
          recipe={recipe}
          homeWorld={world}
          regionMap={market.data?.region}
          itemNames={snapshot.data?.items}
        />
      )}

      <UsedInBlock entries={usedIn} itemNames={snapshot.data?.items} />

      <SourcesBlock
        itemId={itemId}
        gather={gather}
      />
    </div>
  );
}

function HeaderBlock({ name, ilvl, sc, canHq, rarity, itemId, recipe }: {
  name: string; ilvl: number; sc: number; canHq: boolean; rarity: number | undefined; itemId: number; recipe: Recipe | null;
}) {
  const rarityBorder = rarityBorderLeftClass(rarity);
  const rarityName = rarityTextClass(rarity);
  const rarityTier = rarityLabel(rarity);
  return (
    <header className={`border border-border-base bg-bg-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 ${rarityBorder ? `border-l-4 ${rarityBorder}` : ''}`}>
      <div>
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-text-low mb-1 flex items-center gap-3 flex-wrap">
          {ilvl > 1 && <span className="text-gold">Item Level {ilvl}</span>}
          {sc > 0 && <span>{categoryLabel(sc)}</span>}
          {rarityTier && <span className={rarityName ?? ''}>{rarityTier}</span>}
          {canHq && <span className="text-gold inline-flex items-center gap-1"><HqStar /> HQ</span>}
        </div>
        <h1 className={`font-display text-2xl sm:text-3xl tracking-tight ${rarityName ?? 'text-text-cream'}`}>
          {name}
        </h1>
      </div>
      <div className="flex flex-wrap gap-2 self-start sm:self-end">
        <AddToWatchlistButton itemId={itemId} itemName={name} ilvl={ilvl} recipe={recipe} />
        <AddToShoppingListButton itemId={itemId} hasRecipe={recipe != null} />
        <a
          href={garlandItemUrl(itemId)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-aether px-3 py-2 hover:border-aether transition-colors"
          title="Open on Garland Tools"
        >
          Open on Garland ↗
        </a>
      </div>
    </header>
  );
}

function PricesBlock({ worldLabel, dcLabel, loading, phantom, dc }: {
  worldLabel: string; dcLabel: string; loading: boolean;
  phantom: MarketItem | undefined; dc: MarketItem | undefined;
}) {
  return (
    <section>
      <SectionHeader label="Prices" compact />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PriceCard scope={worldLabel} m={phantom} loading={loading} />
        <PriceCard scope={dcLabel} m={dc} loading={loading} />
      </div>
    </section>
  );
}

function PriceCard({ scope, m, loading }: { scope: string; m: MarketItem | undefined; loading: boolean }) {
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">{scope}</div>
      {loading && !m ? (
        <div className="text-text-low text-sm italic">Loading…</div>
      ) : !m || (m.minNQ == null && m.minHQ == null) ? (
        <div className="text-text-low text-sm italic">No marketboard data.</div>
      ) : (
        <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 font-mono text-xs">
          <PriceRow label="Min NQ" value={m.minNQ} />
          <PriceRow label="Min HQ" value={m.minHQ} />
          <PriceRow label="Avg NQ" value={m.averagePriceNQ} dim />
          <PriceRow label="Avg HQ" value={m.averagePriceHQ} dim />
          <PriceRow label="Velocity" raw={`${m.velocity.toFixed(1)} /day`} />
          <PriceRow label="Listings" raw={String(m.listingCount)} />
        </dl>
      )}
    </div>
  );
}

function PriceRow({ label, value, raw, dim }: {
  label: string; value?: number | null; raw?: string; dim?: boolean;
}) {
  const text = raw ?? fmtGil(value ?? null);
  return (
    <>
      <dt className="text-text-low">{label}</dt>
      <dd className={`text-right tabular-nums ${dim ? 'text-text-dim' : 'text-text-cream'}`}>{text}</dd>
    </>
  );
}

function RecipeBlock({ recipe, itemNames, phantom, garlandIngredients }: {
  recipe: Recipe;
  itemNames: SnapshotItem[] | undefined;
  phantom: Record<string, MarketItem> | undefined;
  garlandIngredients: { id: number; source: IngredientSource }[] | undefined;
}) {
  const nameById = useMemo(() => {
    const m = new Map<number, string>();
    if (itemNames) for (const i of itemNames) m.set(i.id, i.name);
    return m;
  }, [itemNames]);

  const sourceById = useMemo(() => {
    const m = new Map<number, IngredientSource>();
    if (garlandIngredients) for (const g of garlandIngredients) m.set(g.id, g.source);
    return m;
  }, [garlandIngredients]);

  let total = 0;
  for (const ing of recipe.ingredients) {
    const px = phantom?.[String(ing.itemId)]?.minNQ ?? phantom?.[String(ing.itemId)]?.minHQ ?? 0;
    total += px * ing.amount;
  }

  return (
    <section>
      <SectionHeader label="Crafting recipe" compact />
      <div className="border border-border-base bg-bg-card p-4">
        <div className="font-mono text-[11px] tracking-widest uppercase text-text-dim mb-3 flex items-center gap-3 flex-wrap">
          <span className="text-aether border border-border-base px-2 py-0.5 leading-none">{recipe.classJob}</span>
          <span>Recipe Lv {recipe.recipeLevel}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left py-1">Ingredient</th>
              <th className="text-right py-1">Qty</th>
              <th className="text-right py-1">Unit (home)</th>
              <th className="text-right py-1 hidden sm:table-cell">Source</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ing) => {
              const m = phantom?.[String(ing.itemId)];
              const unit = m?.minNQ ?? m?.minHQ ?? null;
              const source = sourceById.get(ing.itemId);
              const name = nameById.get(ing.itemId) ?? `Item #${ing.itemId}`;
              return (
                <tr key={ing.itemId} className="border-t border-border-base">
                  <td className="py-2">
                    <Link to={`/item/${ing.itemId}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                      {name}
                    </Link>
                  </td>
                  <td className="py-2 text-right font-mono">{ing.amount}</td>
                  <td className="py-2 text-right font-mono">{fmtGil(unit)}</td>
                  <td className="py-2 text-right font-mono text-text-low hidden sm:table-cell">
                    {source ? SOURCE_LABEL[source] : '—'}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-border-base">
              <td colSpan={2} className="py-2 font-mono text-[10px] tracking-widest uppercase text-text-low text-right">
                Material total (home)
              </td>
              <td className="py-2 text-right font-mono text-gold"><Gil value={total} /></td>
              <td className="hidden sm:table-cell" />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsedInBlock({ entries, itemNames }: {
  entries: { resultId: number; amount: number; classJob: string; recipeLevel: number }[];
  itemNames: SnapshotItem[] | undefined;
}) {
  const nameById = useMemo(() => {
    const m = new Map<number, string>();
    if (itemNames) for (const i of itemNames) m.set(i.id, i.name);
    return m;
  }, [itemNames]);
  if (entries.length === 0) return null;
  const visible = entries.slice(0, USED_IN_LIMIT);
  const more = entries.length - visible.length;
  return (
    <section>
      <SectionHeader
        label={`Used in ${entries.length} recipe${entries.length === 1 ? '' : 's'}`}
        compact
      />
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Result</th>
              <th className="text-right px-3 py-2">Per craft</th>
              <th className="text-right px-3 py-2">Crafter</th>
              <th className="text-right px-3 py-2">Lvl</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const name = nameById.get(e.resultId) ?? `Item #${e.resultId}`;
              return (
                <tr key={e.resultId} className="border-t border-border-base">
                  <td className="px-3 py-2">
                    <Link to={`/item/${e.resultId}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                      {name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">×{e.amount}</td>
                  <td className="px-3 py-2 text-right font-mono text-aether">{e.classJob}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-low">{e.recipeLevel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {more > 0 && (
          <div className="px-3 py-2 font-mono text-[10px] text-text-low italic border-t border-border-base">
            …and {more} more.
          </div>
        )}
      </div>
    </section>
  );
}

function SourcesBlock({ itemId, gather }: {
  itemId: number;
  gather: { level: number; timed: boolean; hidden: boolean } | undefined;
}) {
  if (!gather) {
    return (
      <section>
        <SectionHeader label="Sources" compact />
        <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
          No gathering data in catalog.{' '}
          <a
            href={garlandItemUrl(itemId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-aether hover:underline decoration-1 underline-offset-4 not-italic"
          >
            View full sources on Garland ↗
          </a>
        </div>
      </section>
    );
  }
  return (
    <section>
      <SectionHeader label="Sources" compact />
      <div className="border border-border-base bg-bg-card p-4 space-y-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Gathering</span>
          <span className="text-text-cream">Lv {gather.level || '?'}</span>
          {gather.timed && <span className="text-gold font-mono text-[10px] tracking-widest uppercase">⏱ Timed</span>}
        </div>
        <div className="text-text-low text-xs italic">
          <a
            href={garlandItemUrl(itemId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-aether hover:underline decoration-1 underline-offset-4 not-italic"
          >
            View full sources on Garland ↗
          </a>
        </div>
      </div>
    </section>
  );
}

function findBestSingleStopFor(
  ingredients: Recipe['ingredients'],
  regionByIngId: Record<string, MarketItem | undefined>,
  homeWorld: string,
  homeBasketCost: number,
): { world: string; cost: number } {
  let best = { world: homeWorld, cost: homeBasketCost };
  const worlds = new Set<string>();
  for (const ing of ingredients) {
    const m = regionByIngId[ing.itemId];
    if (!m) continue;
    for (const l of m.worldListings) if (!l.hq) worlds.add(l.world);
  }
  for (const world of worlds) {
    let total = 0;
    let complete = true;
    for (const ing of ingredients) {
      const m = regionByIngId[ing.itemId];
      const here = m?.worldListings.filter((l) => !l.hq && l.world === world) ?? [];
      if (here.length === 0) { complete = false; break; }
      total += Math.min(...here.map((l) => l.price)) * ing.amount;
    }
    if (complete && total < best.cost) best = { world, cost: total };
  }
  return best;
}

function MaterialShoppingBlock({
  recipe, homeWorld, regionMap, itemNames,
}: {
  recipe: Recipe;
  homeWorld: string;
  regionMap: Record<string, MarketItem | undefined> | undefined;
  itemNames: SnapshotItem[] | undefined;
}) {
  if (!regionMap) return null;

  let homeMatCost = 0;
  let bestPerIngredientCost = 0;
  const rows = recipe.ingredients.map((ing) => {
    const m = regionMap[ing.itemId];
    const homeNq = m?.worldListings.filter((l) => !l.hq && l.world === homeWorld) ?? [];
    const homeUnit = homeNq.length ? Math.min(...homeNq.map((l) => l.price)) : 0;
    const allNq = m?.worldListings.filter((l) => !l.hq) ?? [];
    const cheapest = allNq.length
      ? allNq.reduce((a, b) => (a.price <= b.price ? a : b))
      : null;
    homeMatCost += homeUnit * ing.amount;
    bestPerIngredientCost += (cheapest?.price ?? homeUnit) * ing.amount;
    return {
      ing,
      name: itemNames?.find((it) => it.id === ing.itemId)?.name ?? `Item #${ing.itemId}`,
      homeUnit,
      cheapestWorld: cheapest?.world ?? homeWorld,
      cheapestUnit: cheapest?.price ?? homeUnit,
    };
  });
  const perIngredientSavings = homeMatCost - bestPerIngredientCost;
  const singleStop = findBestSingleStopFor(recipe.ingredients, regionMap, homeWorld, homeMatCost);
  const singleStopSavings = homeMatCost - singleStop.cost;
  const needsDcTravel = dcOf(singleStop.world) === 'Light';

  if (perIngredientSavings <= 0 && singleStopSavings <= 0) {
    return (
      <section id="material-flip">
        <SectionHeader label="Material shopping (region)" compact />
        <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
          Your home world is already the cheapest source for every ingredient.
        </div>
      </section>
    );
  }

  return (
    <section id="material-flip">
      <SectionHeader label="Material shopping (region)" compact />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="border border-border-base bg-bg-card p-4">
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">Per-ingredient cheapest</div>
          <div className="text-sm">Home: <Gil value={homeMatCost} /></div>
          <div className="text-sm">Region cheapest: <Gil value={bestPerIngredientCost} /></div>
          <div className="text-sm text-jade">Save: <Gil value={perIngredientSavings} /></div>
        </div>
        <div className="border border-border-base bg-bg-card p-4">
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">Best single stop</div>
          <div className="text-sm">
            <span className="text-aether">{singleStop.world}</span>: <Gil value={singleStop.cost} />
          </div>
          <div className="text-sm text-jade">Save vs home: <Gil value={singleStopSavings} /></div>
          <div className="text-xs text-text-low">
            {needsDcTravel ? 'Requires DC travel ✈' : 'One travel hop, no DC change'}
          </div>
        </div>
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Ingredient</th>
              <th className="text-right px-3 py-2">Need</th>
              <th className="text-right px-3 py-2">Home price</th>
              <th className="text-left px-3 py-2">Cheapest world</th>
              <th className="text-right px-3 py-2">Cheapest price</th>
              <th className="text-right px-3 py-2">Save/unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const save = r.homeUnit - r.cheapestUnit;
              const isHome = r.cheapestWorld === homeWorld;
              return (
                <tr key={r.ing.itemId} className="border-t border-border-base hover:bg-bg-card-hi">
                  <td className="px-3 py-2">
                    <ItemNameLinks id={r.ing.itemId} name={r.name} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.ing.amount}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtGil(r.homeUnit)}</td>
                  <td className={`px-3 py-2 ${isHome ? 'text-text-low' : 'text-jade'}`}>{r.cheapestWorld}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtGil(r.cheapestUnit)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${save > 0 ? 'text-jade' : 'text-text-low'}`}>
                    {save > 0 ? `+${fmtGil(save)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
