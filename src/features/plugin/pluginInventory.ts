import type { InventorySnapshotMessage, InventorySource } from './protocol';
import type { InventoryEntry } from '../cleanup/types';
import type { ParseResult } from '../cleanup/parseAllaganInventory';

// Plugin snapshots don't carry per-item location, so tag everything with a
// single location derived from the requested source. (Locations are display
// metadata downstream — recipe matching ignores them.)
const SOURCE_LOCATION: Record<InventorySource, string> = {
  bags: 'bag',
  saddlebag: 'saddlebag',
  retainers: 'retainer',
  all: 'bag',
};

/**
 * Convert a live plugin inventory snapshot into the same `ParseResult` shape the
 * Allagan CSV parser produces, so Craft-from-Inventory and Cleanup can consume
 * it unchanged. Stacks are merged by item id + HQ flag (matching the CSV parser).
 */
export function pluginInventoryToParseResult(
  snapshot: InventorySnapshotMessage,
  namesById: Map<number, string>,
): ParseResult {
  const location = SOURCE_LOCATION[snapshot.source] ?? 'bag';
  const merged = new Map<string, InventoryEntry>();
  for (const item of snapshot.items) {
    if (item.qty <= 0) continue;
    const key = `${item.id}|${item.hq}`;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += item.qty;
    } else {
      merged.set(key, {
        itemId: item.id,
        name: namesById.get(item.id) ?? `#${item.id}`,
        qty: item.qty,
        isHq: item.hq,
        locations: [location],
      });
    }
  }
  return { entries: [...merged.values()], unrecognized: [] };
}
