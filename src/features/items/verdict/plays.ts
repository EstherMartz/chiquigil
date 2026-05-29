import { fmtGil } from '../../../lib/format';
import type { MarketItem, WorldListing } from '../../../lib/universalis';
import type { Recipe } from '../../../lib/recipes';
import type { Play, Quality } from './types';
import { robustSellPrice, playMetrics, riskLabel, ARB_DISCOUNT } from './pricing';

function homeQuality(canHq: boolean): Quality {
  return canHq ? 'HQ' : 'NQ';
}

function bestForeignListing(
  m: MarketItem | undefined, homeWorld: string, canHq: boolean,
): WorldListing | null {
  if (!m) return null;
  const candidates = m.worldListings
    .filter((l) => l.world !== homeWorld && l.hq === canHq)
    .sort((a, b) => a.price - b.price);
  return candidates[0] ?? null;
}

export function listPlay(phantom: MarketItem, now: number): Play | null {
  const quality: Quality = phantom.recentSalesHQ > phantom.recentSalesNQ ? 'HQ' : 'NQ';
  const sellPrice = robustSellPrice(phantom, quality);
  if (sellPrice == null) return null;
  const mtr = playMetrics(sellPrice, 0, phantom, quality, now);
  const thin = mtr.confidence < 0.35 && phantom.velocity < 1;
  return {
    kind: 'list',
    quality,
    sellPrice,
    cost: 0,
    ...mtr,
    score: 0,
    headline: thin ? "Don't trust the home price" : 'Normal marketboard listing',
    rationale: thin
      ? `Only ${phantom.listingCount} listing(s) and ${phantom.velocity.toFixed(1)} sales/day — the listed price likely isn't backed by real trades.`
      : `Sells around ${fmtGil(sellPrice)} at ${phantom.velocity.toFixed(1)}/day. No obvious arb or craft edge.`,
    bestPlay: 'List on MB',
    bestPlayDetail: `~ ${fmtGil(sellPrice)} per unit (${quality})`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: thin ? 'bad' : phantom.velocity >= 1 ? 'gold' : 'mute',
  };
}

export function craftPlay(
  phantom: MarketItem, recipe: Recipe, materialCost: number, quality: Quality, now: number,
): Play | null {
  if (materialCost <= 0) return null;
  const sellPrice = robustSellPrice(phantom, quality);
  if (sellPrice == null) return null;
  const mtr = playMetrics(sellPrice, materialCost, phantom, quality, now);
  if (mtr.netPerUnit <= 0) return null;
  return {
    kind: 'craft',
    quality,
    sellPrice,
    cost: materialCost,
    ...mtr,
    score: 0,
    headline: `Craft and sell (${quality})`,
    rationale: `Materials cost about ${fmtGil(materialCost)}; ${quality} sells around ${fmtGil(sellPrice)} at ${phantom.velocity.toFixed(1)}/day.`,
    bestPlay: 'Craft-flip',
    bestPlayDetail: `${recipe.classJob} · Lv ${recipe.recipeLevel} · ${quality}`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: 'gold',
  };
}

export function arbPlay(
  phantom: MarketItem, region: MarketItem | undefined, homeWorld: string, canHq: boolean, now: number,
): Play | null {
  const quality = homeQuality(canHq);
  const homePrice = robustSellPrice(phantom, quality);
  if (homePrice == null) return null;
  const foreign = bestForeignListing(region, homeWorld, canHq);
  if (!foreign || foreign.price <= 0 || foreign.price >= homePrice * ARB_DISCOUNT) return null;
  const mtr = playMetrics(homePrice, foreign.price, phantom, quality, now);
  if (mtr.netPerUnit <= 0) return null;
  return {
    kind: 'arb',
    quality,
    sellPrice: homePrice,
    cost: foreign.price,
    ...mtr,
    score: 0,
    headline: `Cheaper on ${foreign.world}`,
    rationale: `Buy on ${foreign.world} for ${fmtGil(foreign.price)}, resell home around ${fmtGil(homePrice)}.`,
    bestPlay: 'Cross-world arb',
    bestPlayDetail: `Buy on ${foreign.world} · resell home`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: 'good',
  };
}

export function vendorPlay(
  phantom: MarketItem, vendorPrice: number | undefined, canHq: boolean, now: number,
): Play | null {
  if (!vendorPrice || vendorPrice <= 0) return null;
  const quality = homeQuality(canHq);
  const homePrice = robustSellPrice(phantom, quality);
  if (homePrice == null) return null;
  const mtr = playMetrics(homePrice, vendorPrice, phantom, quality, now);
  if (mtr.netPerUnit <= 0) return null;
  return {
    kind: 'vendor',
    quality,
    sellPrice: homePrice,
    cost: vendorPrice,
    ...mtr,
    score: 0,
    headline: 'Buy from NPC, sell on MB',
    rationale: `Vendor sells for ${fmtGil(vendorPrice)}, MB sells around ${fmtGil(homePrice)}.`,
    bestPlay: 'Vendor flip',
    bestPlayDetail: `Buy ${fmtGil(vendorPrice)} → sell ${fmtGil(homePrice)}`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: 'gold',
  };
}
