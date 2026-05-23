const GREEN = '#4ade80';
const RED = '#f87171';
const AMBER = '#c9a84c';
const GREY = '#6b7280';

/** Derive colour from existing delta value (Watchlist rows). */
export function colorFromDelta(delta: number | null): string {
  if (delta === null) return GREY;
  if (delta > 5) return GREEN;
  if (delta < -5) return RED;
  return AMBER;
}

/** Derive colour from first/last non-null points (Crafts rows). */
export function colorFromPoints(points: (number | null)[]): string {
  const nonNull = points.filter((p): p is number => p !== null);
  if (nonNull.length < 2) return GREY;
  const first = nonNull[0];
  const last = nonNull[nonNull.length - 1];
  if (last > first) return GREEN;
  if (last < first) return RED;
  return GREY;
}
