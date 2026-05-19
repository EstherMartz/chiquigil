import type { InventoryEntry } from './types';

const ITEM_ID_HEADERS = new Set(['item id', 'item_id', 'id']);
const ITEM_NAME_HEADERS = new Set(['item name', 'item_name', 'name']);
const QUANTITY_HEADERS = new Set(['quantity', 'qty', 'amount']);
const HQ_HEADERS = new Set(['hq', 'high quality']);
const LOCATION_HEADERS = new Set(['location', 'loc']);

const LOCATION_ALIASES: Record<string, string> = {
  bag: 'bag',
  pocket: 'bag',
  retainer: 'retainer',
  glamour: 'glamour',
  chocobo: 'chocobo',
  saddlebag: 'saddlebag',
  armoire: 'armoire',
};

function normalizeLocation(loc: string): string {
  const lower = loc.trim().toLowerCase();
  return LOCATION_ALIASES[lower] || lower;
}

export interface ParseResult {
  entries: InventoryEntry[];
  unrecognized: InventoryEntry[];
}

export function parseAllaganInventory(csv: string, namesById: Map<string, number>): ParseResult {
  const lines = csv.trim().split('\n');
  if (lines.length === 0) throw new Error('CSV is empty');

  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  // Detect column indices
  const idCol = headers.findIndex((h) => ITEM_ID_HEADERS.has(h));
  const nameCol = headers.findIndex((h) => ITEM_NAME_HEADERS.has(h));
  const qtyCol = headers.findIndex((h) => QUANTITY_HEADERS.has(h));
  const hqCol = headers.findIndex((h) => HQ_HEADERS.has(h));
  const locCol = headers.findIndex((h) => LOCATION_HEADERS.has(h));

  if (nameCol === -1 || qtyCol === -1 || hqCol === -1 || locCol === -1) {
    throw new Error("Couldn't detect column headers. Expected columns like: Item ID, Item Name, Quantity, HQ, Location");
  }

  // Merge entries by itemId
  type Key = number;
  const byKey = new Map<Key, InventoryEntry>();
  const unrecognized: InventoryEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = line.split(',').map((c) => c.trim());
    if (cells.length < Math.max(idCol >= 0 ? idCol : -1, nameCol, qtyCol, hqCol, locCol) + 1) continue;

    // Parse fields
    let itemId = 0;
    if (idCol >= 0) {
      const idCell = cells[idCol];
      if (idCell && idCell !== '0') {
        itemId = parseInt(idCell, 10);
        if (isNaN(itemId)) itemId = 0;
      }
    }

    const displayName = cells[nameCol];

    const qtyNum = parseInt(cells[qtyCol], 10);
    if (isNaN(qtyNum) || qtyNum < 0) continue;

    const hqStr = cells[hqCol]?.toLowerCase() ?? 'false';
    const isHq = hqStr === 'true' || hqStr === '1' || hqStr === 'yes';

    const location = normalizeLocation(cells[locCol]);

    // Resolve itemId from name if missing
    if (itemId === 0 && displayName) {
      const resolved = namesById.get(displayName);
      if (resolved) itemId = resolved;
    }

    if (itemId === 0) {
      unrecognized.push({
        itemId: 0,
        name: displayName || '(unknown)',
        qty: qtyNum,
        isHq,
        locations: [location],
      });
      continue;
    }

    const existing = byKey.get(itemId);
    if (existing) {
      existing.qty += qtyNum;
      existing.isHq = existing.isHq || isHq;
      if (!existing.locations.includes(location)) existing.locations.push(location);
    } else {
      byKey.set(itemId, { itemId, name: displayName, qty: qtyNum, isHq, locations: [location] });
    }
  }

  return { entries: [...byKey.values()], unrecognized };
}
