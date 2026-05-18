import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import { getCurrencyById, type CurrencyDef } from '../../lib/currencies';

export interface CurrencyOffer {
  currency: CurrencyDef;
  costPerUnit: number;
  isHq: boolean;
}

export function findItemCurrencyOffers(
  itemId: number,
  shopSnapshot: SpecialShopSnapshot,
): CurrencyOffer[] {
  const out: CurrencyOffer[] = [];
  for (const [currencyId, entries] of shopSnapshot.byCurrency.entries()) {
    let best: { costPerUnit: number; isHq: boolean } | null = null;
    for (const entry of entries) {
      if (entry.itemId !== itemId) continue;
      if (!best || entry.costPerUnit < best.costPerUnit) {
        best = { costPerUnit: entry.costPerUnit, isHq: entry.isHq };
      }
    }
    if (!best) continue;
    const currency = getCurrencyById(currencyId as any);
    if (!currency) continue;
    out.push({ currency, costPerUnit: best.costPerUnit, isHq: best.isHq });
  }
  out.sort((a, b) => a.costPerUnit - b.costPerUnit);
  return out;
}
