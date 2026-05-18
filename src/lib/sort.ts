/**
 * Generic descending-by-numeric-extractor comparator factory.
 *
 * Lets run*Flip modules describe their sort options as a Record<SortKey, extractor>
 * instead of repeating an identical switch statement.
 *
 * Example:
 *   const COMPARATORS: Record<MyFlipSort, (a: Row, b: Row) => number> = {
 *     profit:   descBy(r => r.profit),
 *     velocity: descBy(r => r.velocity),
 *   };
 *   rows.sort(COMPARATORS[sort]);
 */
export function descBy<T>(extract: (row: T) => number): (a: T, b: T) => number {
  return (a, b) => extract(b) - extract(a);
}
