import type { InventoryEntry } from './types';

interface ColumnMap {
  itemId: number | null;
  name: number | null;
  qty: number | null;
  hq: number | null;
  location: number | null;
}

const ID_HEADERS = new Set(['item id', 'id', 'itemid']);
const NAME_HEADERS = new Set(['item name', 'name', 'item']);
const QTY_HEADERS = new Set(['quantity', 'qty', 'amount', 'count']);
const HQ_HEADERS = new Set(['hq', 'high quality', 'ishq']);
const LOC_HEADERS = new Set(['location', 'source', 'type', 'inventory']);

const KEEP_LOCATIONS = new Set(['bag', 'saddlebag', 'retainer']);
const DROP_LOCATIONS = new Set(['armoury', 'glamour', 'equipped', 'other']);

function detectColumns(headerCells: string[]): ColumnMap | null {
  const map: ColumnMap = { itemId: null, name: null, qty: null, hq: null, location: null };
  headerCells.forEach((cell, i) => {
    const h = cell.trim().toLowerCase();
    if (ID_HEADERS.has(h)) map.itemId = i;
    else if (NAME_HEADERS.has(h)) map.name = i;
    else if (QTY_HEADERS.has(h)) map.qty = i;
    else if (HQ_HEADERS.has(h)) map.hq = i;
    else if (LOC_HEADERS.has(h)) map.location = i;
  });
  // need at least one resolution path (id or name) plus something we recognize as a real header
  if (map.itemId == null && map.name == null) return null;
  return map;
}

function parseHq(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'hq';
}

function normalizeLocation(raw: string | undefined): string | null {
  if (!raw) return 'bag';
  const v = raw.trim().toLowerCase();
  // exact matches first
  if (KEEP_LOCATIONS.has(v)) return v;
  if (DROP_LOCATIONS.has(v)) return null;
  // permissive contains: "retainer 1", "armoury chest", "glamour dresser"
  for (const keep of KEEP_LOCATIONS) {
    if (v.includes(keep)) return keep;
  }
  for (const drop of DROP_LOCATIONS) {
    if (v.includes(drop)) return null;
  }
  return null; // unknown → drop
}

function splitCsvLine(line: string): string[] {
  // Allagan exports don't use quoted commas in the columns we care about,
  // but be defensive: respect double-quoted cells.
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

interface ParseResult {
  entries: InventoryEntry[];
  unrecognized: InventoryEntry[];
}

export function parseAllaganInventory(csv: string, namesById: Map<number, string>): ParseResult {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("Couldn't detect column headers (empty input)");

  const cols = detectColumns(splitCsvLine(lines[0]));
  if (!cols) {
    throw new Error("Couldn't detect column headers. Paste should include a header row with at least Item ID or Item Name plus Quantity.");
  }

  // namesById serves double-duty: it gives us the canonical display name,
  // and resolves Item-Name-only rows to an itemId.
  const idByLowerName = new Map<string, number>();
  namesById.forEach((name, id) => idByLowerName.set(name.toLowerCase(), id));

  // key: `${itemId}|${isHq}` → entry being assembled
  const byKey = new Map<string, InventoryEntry>();
  const unrecognized: InventoryEntry[] = [];

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const idRaw = cols.itemId != null ? cells[cols.itemId] : undefined;
    const nameRaw = cols.name != null ? cells[cols.name] : undefined;
    const qtyRaw = cols.qty != null ? cells[cols.qty] : undefined;
    const hqRaw = cols.hq != null ? cells[cols.hq] : undefined;
    const locRaw = cols.location != null ? cells[cols.location] : undefined;

    let itemId = 0;
    if (idRaw && idRaw.trim()) {
      const parsed = Number.parseInt(idRaw.trim(), 10);
      if (Number.isFinite(parsed)) itemId = parsed;
    }
    if (itemId === 0 && nameRaw) {
      itemId = idByLowerName.get(nameRaw.trim().toLowerCase()) ?? 0;
    }

    const qty = qtyRaw && qtyRaw.trim() ? Math.max(1, Number.parseInt(qtyRaw.trim(), 10) || 1) : 1;
    const isHq = parseHq(hqRaw);
    const location = normalizeLocation(locRaw);
    if (location == null) continue; // drop armoury / glamour / equipped / unknown

    const displayName = (itemId > 0 ? namesById.get(itemId) : undefined) ?? nameRaw?.trim() ?? '';

    if (itemId === 0 || !namesById.has(itemId)) {
      unrecognized.push({ itemId, name: displayName || '(unknown)', qty, isHq, locations: [location] });
      continue;
    }

    const key = `${itemId}|${isHq}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += qty;
      if (!existing.locations.includes(location)) existing.locations.push(location);
    } else {
      byKey.set(key, { itemId, name: displayName, qty, isHq, locations: [location] });
    }
  }

  return { entries: [...byKey.values()], unrecognized };
}
