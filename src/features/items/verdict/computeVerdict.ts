import type { MarketItem } from '../../../lib/universalis';
import type { Recipe } from '../../../lib/recipes';
import type { Play, VerdictResult } from './types';
import { robustSellPrice, BLEND_GIL, BLEND_ROI, RUNNER_UP_MIN_SCORE } from './pricing';
import { listPlay, craftPlay, arbPlay, vendorPlay } from './plays';

export interface VerdictInput {
  phantom: MarketItem | undefined;
  region: MarketItem | undefined;
  recipe: Recipe | undefined;
  vendorPrice: number | undefined;
  materialCost: number;
  homeWorld: string;
  canHq: boolean;
  now: number;
}

function untradedVerdict(): VerdictResult {
  return {
    best: {
      kind: 'untraded', quality: 'NQ', sellPrice: 0, cost: 0, netPerUnit: 0,
      effectiveUnitsPerDay: 0, gilPerDay: 0, roi: null, confidence: 0, score: 0,
      headline: 'Not enough data',
      rationale: 'No marketboard activity on the home world. Check Garland or Universalis, or wait for a listing.',
      bestPlay: 'Wait or check externally',
      bestPlayDetail: 'No play yet',
      risk: 'n/a',
      tone: 'mute',
    },
    runnerUp: null,
  };
}

export function computeVerdict(input: VerdictInput): VerdictResult {
  const { phantom, region, recipe, vendorPrice, materialCost, homeWorld, canHq, now } = input;

  // Untraded — no usable home price for either quality.
  if (!phantom || (robustSellPrice(phantom, 'NQ') == null && robustSellPrice(phantom, 'HQ') == null)) {
    return untradedVerdict();
  }

  const candidates: Play[] = [];
  const push = (p: Play | null) => { if (p) candidates.push(p); };

  push(listPlay(phantom, now));
  if (recipe) {
    push(craftPlay(phantom, recipe, materialCost, 'NQ', now));
    if (canHq) push(craftPlay(phantom, recipe, materialCost, 'HQ', now));
  }
  push(arbPlay(phantom, region, homeWorld, canHq, now));
  push(vendorPlay(phantom, vendorPrice, canHq, now));

  // Score each candidate by confidence * balanced blend, normalized within this item's set.
  const maxGil = Math.max(1, ...candidates.map((c) => c.gilPerDay));
  const roiVals = candidates.filter((c) => c.roi != null).map((c) => c.roi as number);
  const maxRoi = roiVals.length ? Math.max(1, ...roiVals) : 1;
  const costBearingRNorms = candidates
    .filter((c) => c.roi != null)
    .map((c) => (c.roi as number) / maxRoi);
  const meanRoiNorm = costBearingRNorms.length
    ? costBearingRNorms.reduce((a, b) => a + b, 0) / costBearingRNorms.length
    : 0;

  for (const c of candidates) {
    const gNorm = c.gilPerDay / maxGil;
    const rNorm = c.roi != null ? c.roi / maxRoi : meanRoiNorm;
    c.score = c.confidence * (BLEND_GIL * gNorm + BLEND_ROI * rNorm);
  }

  candidates.sort((a, b) => b.score - a.score);

  // Active plays (craft/arb/vendor) win over the passive `list` fallback.
  const best = candidates.find((c) => c.kind !== 'list') ?? candidates[0];

  // Runner-up: highest-scoring play of a DIFFERENT kind than best, above the score floor.
  const runnerUp = candidates.find(
    (c) => c !== best && c.kind !== best.kind && c.score >= RUNNER_UP_MIN_SCORE,
  ) ?? null;

  return { best, runnerUp };
}
