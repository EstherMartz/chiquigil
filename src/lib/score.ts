export interface ScoreInput { refPrice: number; velocity: number }

export function computeRawScore({ refPrice, velocity }: ScoreInput): number {
  return refPrice * velocity;
}

export function normalizeScores(raw: number[]): number[] {
  const max = Math.max(0, ...raw);
  if (max === 0) return raw.map(() => 0);
  return raw.map((r) => Math.round((r / max) * 100));
}
