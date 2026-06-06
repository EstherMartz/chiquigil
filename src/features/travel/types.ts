import type { HqMode } from '../../lib/priceTrust';

export type { HqMode };

export type TravelMetric = 'profit' | 'roi' | 'spread';

export interface TravelOpts {
  /** The user's home world (where items are resold). */
  homeWorld: string;
  /** Spend cap in gil. null or 0 = unlimited. */
  budget: number | null;
  /** Which metric orders the greedy allocation (and the resulting table). */
  metric: TravelMetric;
  hq: HqMode;
  /** Skip items whose home velocity is below this (sales/day). */
  minVelocity: number;
  /** How many days of home sales we assume we can offload. Sets the per-item cap. */
  horizonDays: number;
  applyMarketTax: boolean;
}

export interface TravelRow {
  id: number;
  name: string;
  sc: number;
  /** Units to buy on the destination world. */
  units: number;
  avgBuyPrice: number;
  /** Net-of-tax home sell price per unit. */
  homeSell: number;
  /** Total gil spent buying the allocated units. */
  cost: number;
  /** Projected net profit (revenue − cost). */
  profit: number;
  /** profit / cost. */
  roi: number;
  velocity: number;
  /** Whether the chosen home sell tier was HQ. */
  hq: boolean;
}

export interface TravelPlan {
  rows: TravelRow[];
  totalCost: number;
  totalProfit: number;
  totalUnits: number;
  /** totalProfit / totalCost, 0 when nothing allocated. */
  blendedRoi: number;
}
