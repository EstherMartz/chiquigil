/**
 * IDs present in `next` but not in `prev`, sorted ascending.
 * Shared by the bake (prior on-disk vs freshly fetched) and the one-time
 * backfill (git-committed prior vs current on-disk).
 */
export function newIdsSince(prev: Iterable<number>, next: Iterable<number>): number[] {
  const prevSet = new Set(prev);
  const out: number[] = [];
  for (const id of next) {
    if (!prevSet.has(id)) out.push(id);
  }
  out.sort((a, b) => a - b);
  return out;
}
