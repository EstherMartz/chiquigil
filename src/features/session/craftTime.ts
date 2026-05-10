const MAX_SECONDS = 180;
const SOFT_FLOOR_LEVEL = 50;

export function defaultCraftSeconds(recipeLevel: number, baseSeconds: number): number {
  const extra = Math.max(0, recipeLevel - SOFT_FLOOR_LEVEL);
  return Math.min(MAX_SECONDS, baseSeconds + extra);
}

export function resolveCraftSeconds(
  recipeLevel: number,
  baseSeconds: number,
  override: number | undefined,
): number {
  if (override && override > 0) return override;
  return defaultCraftSeconds(recipeLevel, baseSeconds);
}
