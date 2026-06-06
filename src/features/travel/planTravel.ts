import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import { applyTax } from '../items/verdict/pricing';
import type { TravelMetric, TravelOpts, TravelPlan, TravelRow } from './types';

interface Unit {
  id: number;
  buyPrice: number;
  netRevenue: number;   // net-of-tax home sell per unit
  grossRevenue: number; // pre-tax home sell per unit (for the 'spread' metric)
  isHq: boolean;
}

function metricKey(u: Unit, metric: TravelMetric): number {
  if (metric === 'roi') return u.buyPrice > 0 ? (u.netRevenue - u.buyPrice) / u.buyPrice : 0;
  if (metric === 'spread') return u.grossRevenue - u.buyPrice;
  return u.netRevenue - u.buyPrice; // 'profit'
}

export function planTravel(
  items: SnapshotItem[],
  destMarket: MarketData,
  homeMarket: MarketData,
  opts: TravelOpts,
): TravelPlan {
  const byId = new Map<number, SnapshotItem>();
  for (const it of items) byId.set(it.id, it);

  // 1. Expand each item into marginal buy-units, cheapest-listing-first, capped by absorption.
  const pool: Unit[] = [];
  for (const it of items) {
    const home = homeMarket[it.id];
    const dest = destMarket[it.id];
    if (!home || !dest) continue;
    if (home.velocity < opts.minVelocity) continue;

    const tier = pickHighestTrustedTier(home, opts.hq, it.canHq);
    if (!tier) continue;
    const grossRevenue = tier.unit;
    const netRevenue = opts.applyMarketTax ? applyTax(grossRevenue) : grossRevenue;

    const cap = Math.max(1, Math.ceil(home.velocity * opts.horizonDays));

    const listings = dest.worldListings
      .filter((l) => (opts.hq === 'hq' ? l.hq : opts.hq === 'nq' ? !l.hq : true))
      .slice()
      .sort((a, b) => a.price - b.price);

    let emitted = 0;
    for (const l of listings) {
      if (emitted >= cap) break;
      if (netRevenue - l.price <= 0) break; // listings only get pricier from here
      const qty = Math.max(1, l.quantity ?? 1);
      const take = Math.min(qty, cap - emitted);
      for (let q = 0; q < take; q++) {
        pool.push({ id: it.id, buyPrice: l.price, netRevenue, grossRevenue, isHq: tier.isHq });
      }
      emitted += take;
    }
  }

  // 2. Greedy fill by the chosen metric, honoring the budget.
  pool.sort((a, b) => metricKey(b, opts.metric) - metricKey(a, opts.metric));
  const budget = opts.budget && opts.budget > 0 ? opts.budget : Infinity;

  interface Agg { units: number; cost: number; netRevenue: number; grossRevenue: number; isHq: boolean }
  const agg = new Map<number, Agg>();
  let spent = 0;
  for (const u of pool) {
    if (spent + u.buyPrice > budget) continue; // a cheaper later unit may still fit
    spent += u.buyPrice;
    const a = agg.get(u.id) ?? { units: 0, cost: 0, netRevenue: u.netRevenue, grossRevenue: u.grossRevenue, isHq: u.isHq };
    a.units += 1;
    a.cost += u.buyPrice;
    agg.set(u.id, a);
  }

  // 3. Aggregate into rows. Carry grossSpread alongside each row so the display
  //    sort for 'spread' uses the same gross (pre-tax) basis the allocation did.
  const built: { row: TravelRow; grossSpread: number }[] = [];
  let totalCost = 0, totalProfit = 0, totalUnits = 0;
  for (const [id, a] of agg) {
    const it = byId.get(id)!;
    const home = homeMarket[id]!;
    const profit = a.netRevenue * a.units - a.cost;
    const avgBuyPrice = Math.round(a.cost / a.units);
    built.push({
      row: {
        id, name: it.name, sc: it.sc,
        units: a.units,
        avgBuyPrice,
        homeSell: Math.round(a.netRevenue),
        cost: Math.round(a.cost),
        profit: Math.round(profit),
        roi: a.cost > 0 ? profit / a.cost : 0,
        velocity: home.velocity,
        hq: a.isHq,
      },
      grossSpread: a.grossRevenue - avgBuyPrice,
    });
    totalCost += a.cost;
    totalProfit += profit;
    totalUnits += a.units;
  }

  built.sort((a, b) => {
    if (opts.metric === 'roi') return b.row.roi - a.row.roi;
    if (opts.metric === 'spread') return b.grossSpread - a.grossSpread;
    return b.row.profit - a.row.profit;
  });
  const rows = built.map((b) => b.row);

  return {
    rows,
    totalCost: Math.round(totalCost),
    totalProfit: Math.round(totalProfit),
    totalUnits,
    blendedRoi: totalCost > 0 ? totalProfit / totalCost : 0,
  };
}
