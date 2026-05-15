import type { SnapshotLeve } from '../../lib/leveSnapshot';
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';
import type { LeveJobFilter, LeveMode } from './levePlanStore';

const CLASS_JOB_TO_CODE: Record<number, string> = {
  8: 'CRP', 9: 'BSM', 10: 'ARM', 11: 'GSM',
  12: 'LTW', 13: 'WVR', 14: 'ALC', 15: 'CUL',
  16: 'MIN', 17: 'BTN', 18: 'FSH',
  99: 'GC',
};

export interface LeveRow {
  id: number;
  name: string;
  classJobCode: string;
  level: number;
  city: string;
  type: SnapshotLeve['type'];
  grossGil: number;
  matCost: number | null;
  netGil: number;
  exp: number;
  hasMatCostData: boolean;
  targetItemId: number | null;
  targetItemQty: number | null;
}

export interface LevePlanResult {
  rows: LeveRow[];
}

export interface ComputeLevePlanOpts {
  mode: LeveMode;
  jobFilter: LeveJobFilter;
  maxLevel: number;
}

const DOH_CODES = new Set(['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL']);
const DOL_CODES = new Set(['MIN', 'BTN', 'FSH']);

function passesJobFilter(filter: LeveJobFilter, code: string, type: SnapshotLeve['type']): boolean {
  if (filter === 'all') return true;
  if (filter === 'doh') return DOH_CODES.has(code);
  if (filter === 'dol') return DOL_CODES.has(code);
  if (filter === 'dow') return type === 'dow' || type === 'dom';
  return filter === code;
}

function ingredientPrice(prices: MarketData, itemId: number): number | null {
  const m = prices[String(itemId)];
  if (m?.minNQ != null) return m.minNQ;
  if (m?.avgNQ != null) return m.avgNQ;
  return null;
}

export function computeLevePlan(
  snapshot: SnapshotLeve[],
  recipes: Map<number, Recipe>,
  prices: MarketData,
  opts: ComputeLevePlanOpts,
): LevePlanResult {
  const rows: LeveRow[] = [];
  for (const leve of snapshot) {
    if (leve.level > opts.maxLevel) continue;
    const code = CLASS_JOB_TO_CODE[leve.classJob] ?? '';
    if (!passesJobFilter(opts.jobFilter, code, leve.type)) continue;

    const qty = leve.targetItemQty ?? 1;
    let grossGil: number;
    if (leve.type === 'dow' || leve.type === 'dom') {
      grossGil = leve.baseGil; // no qty multiplier for combat leves
    } else {
      grossGil = leve.baseGil * leve.hqGilMultiplier * qty;
    }

    let matCost: number | null = null;
    let hasMatCostData = true;
    if (leve.type === 'doh' && leve.targetItemId != null) {
      const recipe = recipes.get(leve.targetItemId);
      if (!recipe) {
        hasMatCostData = false;
      } else {
        let sum = 0;
        for (const ing of recipe.ingredients) {
          const p = ingredientPrice(prices, ing.itemId);
          if (p == null) { hasMatCostData = false; break; }
          sum += p * ing.amount;
        }
        if (hasMatCostData) matCost = sum * qty;
      }
    }

    const netGil = matCost != null ? grossGil - matCost : grossGil;

    rows.push({
      id: leve.id, name: leve.name, classJobCode: code, level: leve.level,
      city: leve.city, type: leve.type,
      grossGil, matCost, netGil, exp: leve.baseExp,
      hasMatCostData,
      targetItemId: leve.targetItemId, targetItemQty: leve.targetItemQty,
    });
  }

  rows.sort((a, b) => {
    if (opts.mode === 'gil') {
      if (a.hasMatCostData !== b.hasMatCostData) return a.hasMatCostData ? -1 : 1;
      return b.netGil - a.netGil;
    }
    return b.exp - a.exp;
  });

  return { rows };
}
