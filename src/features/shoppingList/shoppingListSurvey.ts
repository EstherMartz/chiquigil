import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import { getCurrencyById, type CurrencyId } from '../../lib/currencies';
import { EU_WORLDS, dcOf } from '../../lib/europeWorlds';

export interface IngredientSurvey {
  id: number;
  qty: number;
  mb: { world: string; price: number; count: number; isLightDc: boolean } | null;
  npc: { price: number } | null;
  currency: { id: CurrencyId; label: string; shortLabel: string; costPerUnit: number } | null;
  autoSource: 'mb' | 'npc' | null;
}

function cheapestEuNq(m: MarketItem | undefined): { world: string; price: number; count: number; isLightDc: boolean } | null {
  if (!m) return null;
  let best: { world: string; price: number } | null = null;
  for (const l of m.worldListings) {
    if (l.hq) continue;
    if (!EU_WORLDS.has(l.world)) continue;
    if (!best || l.price < best.price) best = { world: l.world, price: l.price };
  }
  if (!best) return null;
  return { ...best, count: m.listingCount, isLightDc: dcOf(best.world) === 'Light' };
}

function findCheapestCurrency(itemId: number, shopSnapshot: SpecialShopSnapshot): IngredientSurvey['currency'] {
  let best: { id: CurrencyId; costPerUnit: number } | null = null;
  for (const [currencyId, entries] of shopSnapshot.byCurrency.entries()) {
    for (const entry of entries) {
      if (entry.itemId !== itemId) continue;
      if (!best || entry.costPerUnit < best.costPerUnit ||
          (entry.costPerUnit === best.costPerUnit && currencyId < best.id)) {
        best = { id: currencyId, costPerUnit: entry.costPerUnit };
      }
    }
  }
  if (!best) return null;
  const def = getCurrencyById(best.id);
  if (!def) return null;
  return { id: best.id, label: def.label, shortLabel: def.shortLabel, costPerUnit: best.costPerUnit };
}

export function surveyIngredients(
  demand: Map<number, number>,
  prices: MarketData,
  vendorMap: Map<number, number>,
  shopSnapshot: SpecialShopSnapshot,
): IngredientSurvey[] {
  const out: IngredientSurvey[] = [];
  const sortedIds = [...demand.keys()].sort((a, b) => a - b);
  for (const id of sortedIds) {
    const qty = demand.get(id)!;
    const mb = cheapestEuNq(prices[id]);
    const npcPrice = vendorMap.get(id);
    const npc = npcPrice != null ? { price: npcPrice } : null;
    const currency = findCheapestCurrency(id, shopSnapshot);

    let autoSource: 'mb' | 'npc' | null = null;
    if (mb && npc) autoSource = mb.price <= npc.price ? 'mb' : 'npc';
    else if (mb) autoSource = 'mb';
    else if (npc) autoSource = 'npc';

    out.push({ id, qty, mb, npc, currency, autoSource });
  }
  return out;
}
