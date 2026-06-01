import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSettingsStore } from '../features/settings/store';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useRecipeSnapshot } from '../features/queries/useRecipeSnapshot';
import { useGatheringCatalog } from '../features/queries/useGatheringCatalog';
import { useGarlandItem } from '../features/queries/useGarlandItem';
import { useGarlandLocations } from '../features/queries/useGarlandLocations';
import { useUsedInIndex } from '../features/items/useUsedInIndex';
import { useGcSupplyUsedInIndex } from '../features/items/useGcSupplyUsedInIndex';
import { useLeveUsedInIndex } from '../features/items/useLeveUsedInIndex';
import { DeliverablesBlock } from '../features/items/DeliverablesBlock';
import { CraftTreeBlock } from '../features/items/CraftTreeBlock';
import { CraftSellMathCard } from '../features/items/CraftSellMathCard';
import { IngredientBreakdownModal } from '../features/items/IngredientBreakdownModal';
import { explode } from '../bot/craftExplode';
import { useMarketData } from '../features/watchlist/useMarketData';
import { useVendorShopSnapshot } from '../features/queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../features/queries/useSpecialShopSnapshot';
import { VendorSourceCard } from '../features/items/VendorSourceCard';
import { CurrencySourceCard } from '../features/items/CurrencySourceCard';
import { SupplyDepthBlock } from '../features/items/SupplyDepthBlock';
import { ConcentrationBlock } from '../features/items/ConcentrationBlock';
import { VerdictCard } from '../features/items/VerdictCard';
import { MarketSnapshotRow } from '../features/items/MarketSnapshotRow';
import { findItemCurrencyOffers } from '../features/items/currencyOffers';
import { AddToWatchlistButton } from '../features/items/AddToWatchlistButton';
import { AddToShoppingListButton } from '../features/shoppingList/AddToShoppingListButton';
import { PluginItemActions } from '../features/plugin/PluginItemActions';
import { fmtGil, fmtRelative, garlandItemUrl, gamerEscapeItemUrl, universalisItemUrl } from '../lib/format';
import { Gil } from '../components/Gil';
import { rarityBorderLeftClass, rarityLabel, rarityTextClass } from '../features/items/rarity';
import { categoryLabel } from '../lib/itemSearchCategories';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';
import { SectionHeader } from '../components/SectionHeader';
import { HqStar } from '../components/HqStar';
import { ItemNameLinks } from '../components/ItemNameLinks';
import { CopyButton } from '../components/CopyButton';
import { dcOf } from '../lib/europeWorlds';
import type { SnapshotItem } from '../lib/itemSnapshot';
import type { MarketItem } from '../lib/universalis';
import type { IngredientSource } from '../lib/garlandData';
import type { Recipe } from '../lib/recipes';

const USED_IN_LIMIT = 20;

/** Small bordered metadata chip used in the item header tag row. */
const CHIP = 'font-mono text-[10px] tracking-widest uppercase border border-border-hi px-2 py-0.5 leading-none';

const SOURCE_LABEL: Record<IngredientSource | 'mb', string> = {
  vendor: 'Vendor',
  gather: 'Gather',
  craft: 'Craft',
  other: 'MB',
  mb: 'MB',
};

const SOURCE_CHIP_CLASS: Record<IngredientSource | 'mb', string> = {
  vendor: 'text-jade border-jade/40',
  gather: 'text-aether border-aether/40',
  craft:  'text-gold border-gold/40',
  other:  'text-aether border-aether/40',
  mb:     'text-aether border-aether/40',
};

export default function Item() {
  const { id } = useParams();
  const itemId = Number(id);
  const valid = Number.isFinite(itemId) && itemId > 0;

  const { world, dc } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot(valid);
  const gathering = useGatheringCatalog();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const garland = useGarlandItem(valid ? itemId : null);
  const locations = useGarlandLocations();
  const usedInIdx = useUsedInIndex();
  const gcSupplyIdx = useGcSupplyUsedInIndex();
  const leveIdx = useLeveUsedInIndex();

  const item: SnapshotItem | undefined = useMemo(() => {
    if (!valid || !snapshot.data) return undefined;
    return snapshot.data.items.find((i) => i.id === itemId);
  }, [snapshot.data, itemId, valid]);

  const recipe = valid && recipes.data ? recipes.data.get(itemId) : undefined;

  const usedIn = valid ? (usedInIdx.data.get(itemId) ?? []) : [];
  const gcSupplyDeliverables = valid ? (gcSupplyIdx.data.get(itemId) ?? []) : [];
  const leveDeliverables = valid ? (leveIdx.data.get(itemId) ?? []) : [];
  const questDeliverables = garland.data?.usedInQuests ?? [];

  const ingredientIds = recipe?.ingredients.map((i) => i.itemId) ?? [];
  const usedInIds = useMemo(() => usedIn.map((e) => e.resultId), [usedIn]);
  // Every item in the full craft tree, so the make-vs-buy block has prices for
  // deep descendants (not just the direct ingredients).
  const craftTreeIds = useMemo(() => {
    if (!valid || !recipe || !recipes.data) return [];
    const { crafts, leaves } = explode(itemId, 1, recipes.data, { craftIntermediates: true });
    return [...crafts.keys(), ...leaves.keys()];
  }, [valid, recipe, recipes.data, itemId]);
  const priceIds = useMemo(() => {
    if (!valid) return [];
    return [...new Set<number>([itemId, ...ingredientIds, ...usedInIds, ...craftTreeIds])];
  }, [itemId, ingredientIds, usedInIds, craftTreeIds, valid]);

  const market = useMarketData(priceIds, world, dc, 'Europe');
  const vendors = useVendorShopSnapshot();
  const vendorPrice = valid && vendors.data?.snapshot.get(itemId);
  const shop = useSpecialShopSnapshot();
  const currencyOffers = useMemo(
    () => valid ? findItemCurrencyOffers(itemId, shop.data?.snapshot ?? { byCurrency: new Map() }) : [],
    [itemId, valid, shop.data],
  );

  // Resolver for the self-source breakdown: cheapest currency offer per item
  // (scrip/tome/seal). Such mats count as 0 gil — earned by playing.
  const currencyOf = useMemo(() => {
    const snap = shop.data?.snapshot;
    return (id: number) => {
      if (!snap) return null;
      const offers = findItemCurrencyOffers(id, snap);
      if (offers.length === 0) return null;
      const best = offers[0]; // sorted cheapest-first
      return { label: best.currency.shortLabel, cost: best.costPerUnit };
    };
  }, [shop.data]);

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

  const recipeMaterialCost = useMemo(() => {
    if (!recipe || !phantomMarket) return 0;
    let total = 0;
    for (const ing of recipe.ingredients) {
      const m = market.data?.phantom[ing.itemId];
      const px = m?.minNQ ?? m?.minHQ ?? 0;
      total += px * ing.amount;
    }
    return total;
  }, [recipe, phantomMarket, market.data]);

  // Ids of all gatherable items — feeds the self-source ("gather + craft")
  // floor cost in the craft→sell math card.
  const gatherableIds = useMemo(
    () => (gathering.data ? new Set(gathering.data.keys()) : new Set<number>()),
    [gathering.data],
  );

  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of snapshot.data?.items ?? []) m.set(i.id, i.name);
    return (id: number) => m.get(id) ?? `Item #${id}`;
  }, [snapshot.data?.items]);

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      {/* Breadcrumb row */}
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low flex items-center gap-1 flex-wrap">
        <Link to="/" className="hover:text-aether transition-colors">Search</Link>
        <span className="text-text-dim">›</span>
        {displaySc > 0 && (
          <>
            <span className="text-text-dim">{categoryLabel(displaySc)}</span>
            <span className="text-text-dim">›</span>
          </>
        )}
        <span className="text-text-dim truncate">{displayName}</span>
      </div>

      <HeaderBlock
        name={displayName}
        ilvl={displayIlvl}
        sc={displaySc}
        canHq={canHq}
        rarity={item?.rarity}
        itemId={itemId}
        recipe={recipe ?? null}
        world={world}
        dc={dc}
        updatedMs={phantomMarket?.lastUploadTime ?? null}
      />

      {snapshot.isLoading && (
        <div className="py-4"><Spinner label="Loading item catalog…" /></div>
      )}
      {market.isError && (
        <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>
      )}

      {!market.isLoading && (
        <VerdictCard
          phantom={phantomMarket}
          region={regionMarket}
          recipe={recipe ?? undefined}
          vendorPrice={vendorPrice || undefined}
          materialCost={recipeMaterialCost}
          homeWorld={world}
          canHq={canHq}
          now={Date.now()}
        />
      )}

      <MarketSnapshotRow
        itemId={itemId}
        homeWorld={world}
        dcLabel={dc}
        phantom={phantomMarket}
        dc={dcMarket}
        region={regionMarket}
        canHq={canHq}
        floor={recipe && recipeMaterialCost > 0 ? recipeMaterialCost : null}
        ceiling={vendorPrice || null}
      />

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

      {phantomMarket && phantomMarket.worldListings.length > 0 && (
        <SupplyDepthBlock listings={phantomMarket.worldListings} canHq={canHq} />
      )}

      {phantomMarket && phantomMarket.worldListings.length > 0 && (
        <ConcentrationBlock listings={phantomMarket.worldListings} canHq={canHq} />
      )}

      {recipes.isLoading && !recipe && (
        <div className="py-4"><Spinner label="Loading recipe catalog…" /></div>
      )}
      {recipe && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3 items-start">
          <RecipeBlock
            recipe={recipe}
            itemNames={snapshot.data?.items}
            phantom={market.data?.phantom}
            garlandIngredients={garland.data?.ingredients}
          />
          <CraftSellMathCard
            recipe={recipe}
            materialsHome={recipeMaterialCost}
            regionMap={market.data?.region}
            homeWorld={world}
            phantom={phantomMarket}
            canHq={canHq}
            recipeMap={recipes.data}
            homeMarket={market.data?.phantom}
            gatherableIds={gatherableIds}
            currencyOf={currencyOf}
            onShowBreakdown={() => setShowBreakdown(true)}
          />
        </div>
      )}

      {recipe && (
        <MaterialShoppingBlock
          recipe={recipe}
          homeWorld={world}
          regionMap={market.data?.region}
          itemNames={snapshot.data?.items}
        />
      )}

      {recipe && recipes.data && !market.isLoading && (
        <CraftTreeBlock
          itemId={itemId}
          recipeMap={recipes.data}
          dc={market.data?.dc}
          phantom={market.data?.phantom}
          nameOf={nameOf}
        />
      )}

      <UsedInBlock entries={usedIn} itemNames={snapshot.data?.items} phantom={market.data?.phantom} />

      <DeliverablesBlock
        gcSupply={gcSupplyDeliverables}
        leves={leveDeliverables}
        quests={questDeliverables}
      />

      <SourcesBlock
        itemId={itemId}
        itemName={displayName}
        gather={gather}
      />

      {showBreakdown && recipe && recipes.data && market.data && (
        <IngredientBreakdownModal
          itemId={itemId}
          itemName={displayName}
          recipe={recipe}
          recipeMap={recipes.data}
          market={market.data.phantom}
          gatherableIds={gatherableIds}
          currencyOf={currencyOf}
          nameOf={nameOf}
          onClose={() => setShowBreakdown(false)}
        />
      )}
    </div>
  );
}

function HeaderBlock({ name, ilvl, sc, canHq, rarity, itemId, recipe, world, dc, updatedMs }: {
  name: string; ilvl: number; sc: number; canHq: boolean; rarity: number | undefined; itemId: number; recipe: Recipe | null;
  world: string; dc: string; updatedMs: number | null;
}) {
  const rarityBorder = rarityBorderLeftClass(rarity);
  const rarityName = rarityTextClass(rarity);
  const rarityTier = rarityLabel(rarity);
  const relativeTime = updatedMs ? fmtRelative(updatedMs) : '—';
  return (
    <header className={`border border-border-base bg-bg-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 ${rarityBorder ? `border-l-4 ${rarityBorder}` : ''}`}>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {ilvl > 1 && <span className={`${CHIP} text-gold`}>Item Lvl {ilvl}</span>}
          {sc > 0 && <span className={`${CHIP} text-text-dim`}>{categoryLabel(sc)}</span>}
          {rarityTier && <span className={`${CHIP} ${rarityName ?? 'text-text-dim'}`}>{rarityTier}</span>}
          {canHq && <span className={`${CHIP} text-gold inline-flex items-center gap-1`}><HqStar /> HQ-Capable</span>}
        </div>
        <h1 className={`font-display text-2xl sm:text-3xl tracking-tight inline-flex items-center gap-2 ${rarityName ?? 'text-text-cream'}`}>
          {name}
          <CopyButton text={name} label="Copy item name" className="text-base" />
        </h1>
        {/* Meta subtitle line */}
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mt-2 flex items-center gap-1 flex-wrap">
          <span>• {world}</span>
          <span>•</span>
          <span>{dc}</span>
          <span>•</span>
          <span>Updated {relativeTime}</span>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 self-start sm:self-end">
        <div className="flex flex-wrap gap-2">
          <AddToWatchlistButton itemId={itemId} itemName={name} ilvl={ilvl} recipe={recipe} sc={sc} />
          <AddToShoppingListButton itemId={itemId} />
          <PluginItemActions itemId={itemId} />
          <Link
            to="/projects"
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-3 py-2 hover:opacity-90 transition-opacity"
            title="Open crafting projects"
          >
            + Project
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:border-l sm:border-border-base sm:pl-3">
          <a
            href={garlandItemUrl(itemId)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-aether px-2 py-1 transition-colors"
            title="Open on Garland Tools"
          >
            Garland ↗
          </a>
          <a
            href={gamerEscapeItemUrl(name)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-aether px-2 py-1 transition-colors"
            title="Gamer Escape wiki"
          >
            GE ↗
          </a>
          <a
            href={universalisItemUrl(itemId)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-aether px-2 py-1 transition-colors"
            title="Universalis (market data)"
          >
            UV ↗
          </a>
        </div>
      </div>
    </header>
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
              <th className="text-right py-1">Sub-total</th>
              <th className="text-right py-1 hidden sm:table-cell">Source</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ing) => {
              const m = phantom?.[String(ing.itemId)];
              const unit = m?.minNQ ?? m?.minHQ ?? null;
              const subtotal = unit != null ? unit * ing.amount : null;
              const source = sourceById.get(ing.itemId);
              const displaySource = source ?? 'mb';
              const name = nameById.get(ing.itemId) ?? `Item #${ing.itemId}`;
              return (
                <tr key={ing.itemId} className="border-t border-border-base">
                  <td className="py-2">
                    <Link to={`/item/${ing.itemId}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                      {name}
                    </Link>
                    <CopyButton text={name} />
                  </td>
                  <td className="py-2 text-right font-mono">{ing.amount}</td>
                  <td className="py-2 text-right font-mono">{fmtGil(unit)}</td>
                  <td className="py-2 text-right font-mono">{fmtGil(subtotal)}</td>
                  <td className="py-2 text-right hidden sm:table-cell">
                    <span className={`font-mono text-[10px] tracking-widest uppercase border ${SOURCE_CHIP_CLASS[displaySource]} px-2 py-0.5 rounded-sm`}>
                      {SOURCE_LABEL[displaySource]}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-border-base">
              <td colSpan={2} className="py-2 font-mono text-[10px] tracking-widest uppercase text-text-low text-right">
                Material total (home)
              </td>
              <td colSpan={2} className="py-2 text-right font-mono text-gold"><Gil value={total} /></td>
              <td className="hidden sm:table-cell" />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

type UsedInSort = 'score' | 'salePrice' | 'velocity' | 'crafter' | 'level';

function UsedInBlock({ entries, itemNames, phantom }: {
  entries: { resultId: number; amount: number; classJob: string; recipeLevel: number }[];
  itemNames: SnapshotItem[] | undefined;
  phantom: Record<string, MarketItem> | undefined;
}) {
  const [sort, setSort] = useState<UsedInSort>('score');

  const nameById = useMemo(() => {
    const m = new Map<number, string>();
    if (itemNames) for (const i of itemNames) m.set(i.id, i.name);
    return m;
  }, [itemNames]);

  const rows = useMemo(() => {
    return entries.map((e) => {
      const m = phantom?.[String(e.resultId)];
      const salePrice = m?.medianNQ ?? m?.medianHQ ?? m?.minNQ ?? m?.minHQ ?? 0;
      const velocity = m?.velocity ?? 0;
      return { ...e, salePrice, velocity, score: salePrice * velocity };
    });
  }, [entries, phantom]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    switch (sort) {
      case 'score':     copy.sort((a, b) => b.score - a.score); break;
      case 'salePrice': copy.sort((a, b) => b.salePrice - a.salePrice); break;
      case 'velocity':  copy.sort((a, b) => b.velocity - a.velocity); break;
      case 'crafter':   copy.sort((a, b) => a.classJob.localeCompare(b.classJob)); break;
      case 'level':     copy.sort((a, b) => b.recipeLevel - a.recipeLevel); break;
    }
    return copy;
  }, [rows, sort]);

  if (entries.length === 0) return null;
  const visible = sorted.slice(0, USED_IN_LIMIT);
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
              <UsedInSortHeader col="crafter" current={sort} onClick={setSort} hideOnMobile>Crafter</UsedInSortHeader>
              <UsedInSortHeader col="level" current={sort} onClick={setSort} hideOnMobile>Lvl</UsedInSortHeader>
              <UsedInSortHeader col="salePrice" current={sort} onClick={setSort}>Price</UsedInSortHeader>
              <UsedInSortHeader col="velocity" current={sort} onClick={setSort}>Vel</UsedInSortHeader>
              <UsedInSortHeader col="score" current={sort} onClick={setSort}>Score</UsedInSortHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const name = nameById.get(e.resultId) ?? `Item #${e.resultId}`;
              return (
                <tr key={e.resultId} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                  <td className="px-3 py-2">
                    <Link to={`/item/${e.resultId}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                      {name}
                    </Link>
                    <CopyButton text={name} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-aether hidden sm:table-cell">{e.classJob}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-low hidden sm:table-cell">{e.recipeLevel}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.salePrice > 0 ? fmtGil(e.salePrice) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.velocity > 0 ? e.velocity.toFixed(1) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-gold">{e.score > 0 ? fmtGil(Math.round(e.score)) : '—'}</td>
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

function UsedInSortHeader({ col, current, onClick, hideOnMobile, children }: {
  col: UsedInSort; current: UsedInSort; onClick: (c: UsedInSort) => void;
  hideOnMobile?: boolean; children: React.ReactNode;
}) {
  const active = col === current;
  return (
    <th
      className={`text-right px-3 py-2 cursor-pointer select-none ${active ? 'text-gold' : 'text-text-dim hover:text-text-cream'} ${hideOnMobile ? 'hidden sm:table-cell' : ''}`}
      onClick={() => onClick(col)}
    >
      {children}{active ? ' ▼' : ''}
    </th>
  );
}

function SourcesBlock({ itemId, itemName, gather }: {
  itemId: number;
  itemName: string;
  gather: { level: number; timed: boolean; hidden: boolean } | undefined;
}) {
  const linkClass = 'font-mono text-[10px] tracking-widest uppercase text-text-low hover:text-aether transition-colors';
  return (
    <footer className="border-t border-border-base mt-2 pt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim mr-1">External sources</span>
        <a href={garlandItemUrl(itemId)} target="_blank" rel="noopener noreferrer" className={linkClass}>Garland Tools ↗</a>
        <span className="text-text-low">·</span>
        <a href={gamerEscapeItemUrl(itemName)} target="_blank" rel="noopener noreferrer" className={linkClass}>Gamer Escape ↗</a>
        <span className="text-text-low">·</span>
        <a href={universalisItemUrl(itemId)} target="_blank" rel="noopener noreferrer" className={linkClass}>Universalis ↗</a>
      </div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
        {gather ? (
          <span>
            Gathering Lv {gather.level || '?'}
            {gather.timed && <span className="text-gold"> · ⏱ Timed</span>}
          </span>
        ) : (
          <span>No gathering data in catalog</span>
        )}
      </div>
    </footer>
  );
}

export function findBestSingleStopFor(
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
                <tr key={r.ing.itemId} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
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
