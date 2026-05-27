/**
 * Builds a Map<itemId, GatheringInfo> by joining four XIVAPI v2 sheets:
 *
 *   GatheringItem       (rowId → itemId + level)
 *   GatheringPointBase  (which GatheringItems appear in which "base" node)
 *   GatheringPoint      (each instance points to a Base; rowId may have a Transient)
 *   GatheringPointTransient
 *                       (presence of EphemeralStartTime != 65535 or rare-pop table
 *                        marks the GatheringPoint as a timed node)
 *
 * Catalog flags:
 *   timed  — appears in at least one timed GatheringPoint
 *   level  — gathering level required (max across that item's GatheringItem rows)
 *
 * One-time fetch, cached in IDB.
 */

import { fetchXivapiPage, nextCursor } from './xivapiRetry';

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const PAGE_SIZE = 500;

// GatheringPointBase has 8 `Item` link slots per row. XIVAPI v2 expands each
// link's referenced row into the response, so even a moderate page of bases
// can blow past the 20k-row response budget. Lower its initial cap aggressively.
const SHEET_PAGE_SIZE: Record<string, number> = {
  GatheringPointBase: 100,
};

export interface GatheringInfo {
  level: number;
  timed: boolean;
  hidden: boolean;
}

export type GatheringCatalog = Map<number, GatheringInfo>;

// ---------- Raw types ----------

interface RawRow<F> { row_id: number; fields: F }
interface RawPage<F> { rows?: RawRow<F>[] }
interface Link<T = number> { value?: T }

interface GatheringItemFields {
  Item?: Link<number>;
  GatheringItemLevel?: { fields?: { GatheringLevel?: number } } | Link<number>;
  IsHidden?: boolean;
}
// GatheringPointBase has 8 slots referencing GatheringItem. XIVAPI v2 rejects
// our `Item` and `Item[0]` field shorthands with 400, so we fetch the full row
// and parse defensively — the response may come back as either an array under
// `Item` or as individually keyed fields like `Item[0]`..`Item[7]`.
type RawSlot = Link<number> | undefined;
type GatheringPointBaseFields = Record<string, unknown> & {
  Item?: RawSlot[] | RawSlot;
};
interface GatheringPointFields {
  GatheringPointBase?: Link<number>;
}
interface GatheringPointTransientFields {
  EphemeralStartTime?: number;
  EphemeralEndTime?: number;
  GatheringRarePopTimeTable?: Link<number>;
}

// ---------- Fetch + parse ----------

async function fetchSheet<F>(sheet: string, fields: string | null): Promise<RawRow<F>[]> {
  const out: RawRow<F>[] = [];
  let after = 0;
  let pageSize = SHEET_PAGE_SIZE[sheet] ?? PAGE_SIZE;
  // Floor must accommodate sheets whose link-expansion budget is tight even at
  // small page sizes. limit=5 keeps us under the 20k-row cap for any sheet.
  const MIN_PAGE = 5;
  while (true) {
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (fields) params.set('fields', fields);
    if (after > 0) params.set('after', String(after));
    const url = `${BASE.replace(/\/$/, '')}/api/sheet/${sheet}?${params.toString()}`;
    const res = await fetchXivapiPage(url);
    if (!res.ok) {
      // Some v2 sheet/field combinations (e.g. GatheringPointBase + Item array)
      // 400 at the requested page but succeed at smaller pages — XIVAPI v2's
      // 20k-row response budget is per-request, and link expansion multiplies
      // fast. Halve and retry the same cursor before giving up.
      if (res.status === 400 && pageSize > MIN_PAGE) {
        const prev = pageSize;
        pageSize = Math.max(MIN_PAGE, Math.floor(pageSize / 2));
        // eslint-disable-next-line no-console
        console.warn(`[gatheringCatalog] ${sheet} 400 at limit=${prev}, retrying at limit=${pageSize}`);
        continue;
      }
      throw new Error(`XIVAPI ${sheet} ${res.status}`);
    }
    const page = (await res.json()) as RawPage<F>;
    const rows = page.rows ?? [];
    if (rows.length === 0) break;
    out.push(...rows);
    after = nextCursor(after, rows[rows.length - 1].row_id);
  }
  return out;
}

/**
 * Probe the first page of `sheet` with several field-syntax variants and
 * return the variant whose response actually carries data. Used to escape
 * the "v2 silently returned 0 fields when our shorthand was wrong" trap.
 */
async function probeFieldsSyntax(sheet: string, variants: string[]): Promise<string | null> {
  for (const fields of variants) {
    try {
      const params = new URLSearchParams({ fields, limit: '1' });
      const url = `${BASE.replace(/\/$/, '')}/api/sheet/${sheet}?${params.toString()}`;
      const res = await fetchXivapiPage(url);
      if (!res.ok) continue;
      const page = (await res.json()) as RawPage<unknown>;
      const first = page.rows?.[0];
      if (first && Object.keys(first.fields as object).length > 0) {
        // eslint-disable-next-line no-console
        console.info(`[gatheringCatalog] ${sheet} field syntax "${fields}" works`);
        return fields;
      }
    } catch {
      // ignore and try next
    }
  }
  // eslint-disable-next-line no-console
  console.warn(`[gatheringCatalog] no field syntax succeeded for ${sheet}; falling back to full-row`);
  return null;
}

function gatheringItemLevel(fields: GatheringItemFields): number {
  const lvl = fields.GatheringItemLevel;
  if (lvl && typeof lvl === 'object' && 'fields' in lvl) {
    return lvl.fields?.GatheringLevel ?? 0;
  }
  return 0;
}

function isTransientTimed(t: GatheringPointTransientFields): boolean {
  const start = t.EphemeralStartTime ?? 0;
  const end = t.EphemeralEndTime ?? 0;
  // 65535 = "unset"; equal start/end with non-zero values also means no spawn window
  const ephemeral = start !== end && start !== 65535 && end !== 65535;
  const rare = (t.GatheringRarePopTimeTable?.value ?? 0) > 0;
  return ephemeral || rare;
}

export interface BuildOpts {
  onProgress?: (msg: string) => void;
}

export async function buildGatheringCatalog(opts: BuildOpts = {}): Promise<GatheringCatalog> {
  const progress = opts.onProgress ?? (() => {});

  progress('Probing GatheringPointBase field syntax…');
  // XIVAPI v2 rejects `Item` and `Item[0]` outright (400), and omitting the
  // fields= param returns rows with empty fields. Probe several plausible
  // syntaxes against a single row, then use whichever shape actually carries
  // data for the full paginated fetch.
  const baseFields = await probeFieldsSyntax('GatheringPointBase', [
    // Leaf-value forms first — these don't trigger XIVAPI v2's link
    // expansion, so they stay well under the 20k-row response budget at
    // higher page sizes than the link-expanding shorthand below.
    'Item[].value',
    'Item.value',
    'Item[0].value,Item[1].value,Item[2].value,Item[3].value,Item[4].value,Item[5].value,Item[6].value,Item[7].value',
    // Expansion shorthand fallbacks — these work but force expansion.
    'Item',
    'Item[0],Item[1],Item[2],Item[3],Item[4],Item[5],Item[6],Item[7]',
    'Item.0,Item.1,Item.2,Item.3,Item.4,Item.5,Item.6,Item.7',
    'Item0,Item1,Item2,Item3,Item4,Item5,Item6,Item7',
    'Items',
  ]);

  progress('Fetching gathering sheets in parallel…');
  // All four sheets are independent — fire them concurrently.
  const [gatheringItems, bases, points, transients] = await Promise.all([
    fetchSheet<GatheringItemFields>('GatheringItem', 'Item,GatheringItemLevel.GatheringLevel,IsHidden'),
    fetchSheet<GatheringPointBaseFields>('GatheringPointBase', baseFields),
    fetchSheet<GatheringPointFields>('GatheringPoint', 'GatheringPointBase'),
    fetchSheet<GatheringPointTransientFields>(
      'GatheringPointTransient',
      'EphemeralStartTime,EphemeralEndTime,GatheringRarePopTimeTable',
    ),
  ]);

  progress('Joining sheets…');

  if (gatheringItems.length > 0) {
    // eslint-disable-next-line no-console
    console.info('[gatheringCatalog] sample GatheringItem row:', gatheringItems[0]);
  }

  // gatheringItemRowId → { itemId, level, hidden }
  const giIndex = new Map<number, { itemId: number; level: number; hidden: boolean }>();
  for (const row of gatheringItems) {
    const itemId = row.fields.Item?.value ?? 0;
    if (itemId <= 0) continue;
    giIndex.set(row.row_id, {
      itemId,
      level: gatheringItemLevel(row.fields),
      hidden: row.fields.IsHidden === true,
    });
  }
  if (giIndex.size === 0 && gatheringItems.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[gatheringCatalog] parsed 0 GatheringItem rows from', gatheringItems.length);
  }

  // Diagnostic: dump the first row's shape so we know what XIVAPI v2 is sending.
  // Without this we'd silently produce an empty catalog when the response shape
  // doesn't match what we expected.
  if (bases.length > 0) {
    // eslint-disable-next-line no-console
    console.info('[gatheringCatalog] sample GatheringPointBase row:', bases[0]);
  }

  // baseRowId → set of gatheringItemRowIds. Cast a wide net: collect any field
  // whose key starts with "Item" and whose value looks like a link, array of
  // links, or raw numbers. Handles every plausible v2 shape:
  //   `Item: [{value: N}, ...]`            link expansion
  //   `Item: [N, ...]`                     `Item[].value` leaf form
  //   `Item[N]: {value: M}` / `Item0: ...` indexed shorthand
  const baseItems = new Map<number, Set<number>>();
  const collect = (raw: unknown, set: Set<number>) => {
    if (raw == null) return;
    if (typeof raw === 'number') {
      if (raw > 0 && raw < 1_000_000) set.add(raw);
    } else if (Array.isArray(raw)) {
      for (const slot of raw) collect(slot, set);
    } else if (typeof raw === 'object') {
      const v = (raw as Link<number>).value ?? 0;
      if (v > 0 && v < 1_000_000) set.add(v);
    }
  };
  for (const b of bases) {
    const set = new Set<number>();
    for (const [key, raw] of Object.entries(b.fields)) {
      if (!/^Item(\b|[\[0-9])/.test(key)) continue;
      collect(raw, set);
    }
    if (set.size > 0) baseItems.set(b.row_id, set);
  }
  if (baseItems.size === 0 && bases.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[gatheringCatalog] parsed 0 item slots from', bases.length, 'bases — schema mismatch?');
  }

  // pointRowId → baseRowId
  const pointBase = new Map<number, number>();
  for (const p of points) {
    const b = p.fields.GatheringPointBase?.value ?? 0;
    if (b > 0) pointBase.set(p.row_id, b);
  }

  // Set of baseRowIds that have at least one timed point
  const timedBases = new Set<number>();
  for (const t of transients) {
    if (!isTransientTimed(t.fields)) continue;
    const baseId = pointBase.get(t.row_id);
    if (baseId != null) timedBases.add(baseId);
  }

  // Final assembly: walk every base, mark its items.
  const catalog: GatheringCatalog = new Map();
  for (const [baseId, giIds] of baseItems) {
    const baseTimed = timedBases.has(baseId);
    for (const giId of giIds) {
      const gi = giIndex.get(giId);
      if (!gi) continue;
      const prev = catalog.get(gi.itemId);
      if (prev) {
        prev.level = Math.max(prev.level, gi.level);
        prev.timed = prev.timed || baseTimed;
        prev.hidden = prev.hidden && gi.hidden;
      } else {
        catalog.set(gi.itemId, {
          level: gi.level,
          timed: baseTimed,
          hidden: gi.hidden,
        });
      }
    }
  }
  // eslint-disable-next-line no-console
  console.info('[gatheringCatalog] built', catalog.size, 'items',
    `(${baseItems.size} bases, ${giIndex.size} GatheringItem rows, ${timedBases.size} timed bases)`);

  return catalog;
}
