import type { SessionCandidate } from './buildCandidates';

export type SessionStrategy = 'balanced' | 'quickwin' | 'patient';

export interface SessionPick {
  id: number;
  name: string;
  crafter: string;
  batch: number;
  craftSeconds: number;
  profit: number;
  totalSeconds: number;
  totalGil: number;
  velocity: number;
  unitPrice: number;
  materialCost: number;
  listingCount: number;
}

export interface SessionResult {
  picks: SessionPick[];
  totalGil: number;
  totalSeconds: number;
}

export interface PackOpts {
  budgetMinutes: number;
  overheadMinutes: number;
  batchCapDays: number;
  strategy: SessionStrategy;
}

function strategyScore(c: SessionCandidate, strategy: SessionStrategy): number {
  switch (strategy) {
    case 'quickwin':
      return c.gilPerMinute * Math.min(1, c.velocity / 3);
    case 'patient':
      return c.gilPerMinute * (Math.log10(c.profit + 1) / 6);
    case 'balanced':
    default:
      return c.gilPerMinute;
  }
}

const SET_DIVERSITY_LIMIT = 3;

export function packSession(candidates: SessionCandidate[], opts: PackOpts): SessionResult {
  const budgetSeconds = Math.max(0, (opts.budgetMinutes - opts.overheadMinutes) * 60);
  if (budgetSeconds === 0) {
    return { picks: [], totalGil: 0, totalSeconds: 0 };
  }
  const ranked = [...candidates].sort((a, b) => strategyScore(b, opts.strategy) - strategyScore(a, opts.strategy));

  let remaining = budgetSeconds;
  const setCounts: Record<string, number> = {};
  const picks: SessionPick[] = [];

  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    if (remaining < c.craftSeconds) continue;
    const setSoFar = setCounts[c.setKey] ?? 0;
    if (setSoFar >= SET_DIVERSITY_LIMIT) continue;

    const velocityCap = Math.max(1, Math.ceil(c.velocity * opts.batchCapDays));
    let timeCap = Math.floor(remaining / c.craftSeconds);

    const nextFromSameSet = ranked.slice(i + 1).some(other => other.setKey === c.setKey);
    if (nextFromSameSet) {
      const slotsRemaining = SET_DIVERSITY_LIMIT - setSoFar;
      const timeCapWithReservation = Math.floor(remaining / (slotsRemaining * c.craftSeconds));
      timeCap = Math.min(timeCap, timeCapWithReservation);
    }

    const batch = Math.min(velocityCap, timeCap, 99);
    if (batch <= 0) continue;

    const totalSeconds = batch * c.craftSeconds;
    const totalGil = batch * c.profit;
    picks.push({
      id: c.id,
      name: c.name,
      crafter: c.crafter,
      batch,
      craftSeconds: c.craftSeconds,
      profit: c.profit,
      totalSeconds,
      totalGil,
      velocity: c.velocity,
      unitPrice: c.unitPrice,
      materialCost: c.materialCost,
      listingCount: c.listingCount,
    });
    setCounts[c.setKey] = setSoFar + 1;
    remaining -= totalSeconds;
  }

  return {
    picks,
    totalGil: picks.reduce((acc, p) => acc + p.totalGil, 0),
    totalSeconds: picks.reduce((acc, p) => acc + p.totalSeconds, 0),
  };
}
