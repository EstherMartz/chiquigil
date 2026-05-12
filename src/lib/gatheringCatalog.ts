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

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const PAGE_SIZE = 500;

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
interface GatheringPointBaseFields {
  Item?: Array<Link<number>>;  // 8-slot array of GatheringItem rowIds
}
interface GatheringPointFields {
  GatheringPointBase?: Link<number>;
}
interface GatheringPointTransientFields {
  EphemeralStartTime?: number;
  EphemeralEndTime?: number;
  GatheringRarePopTimeTable?: Link<number>;
}

// ---------- Fetch + parse ----------

async function fetchSheet<F>(sheet: string, fields: string): Promise<RawRow<F>[]> {
  const out: RawRow<F>[] = [];
  let after = 0;
  while (true) {
    const params = new URLSearchParams({ fields, limit: String(PAGE_SIZE) });
    if (after > 0) params.set('after', String(after));
    const url = `${BASE.replace(/\/$/, '')}/api/sheet/${sheet}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`XIVAPI ${sheet} ${res.status}`);
    const page = (await res.json()) as RawPage<F>;
    const rows = page.rows ?? [];
    if (rows.length === 0) break;
    out.push(...rows);
    after = rows[rows.length - 1].row_id;
  }
  return out;
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

  progress('Fetching gathering items…');
  const gatheringItems = await fetchSheet<GatheringItemFields>(
    'GatheringItem',
    'Item,GatheringItemLevel.GatheringLevel,IsHidden',
  );

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

  progress('Fetching gathering point bases…');
  const bases = await fetchSheet<GatheringPointBaseFields>(
    'GatheringPointBase',
    'Item',
  );

  // baseRowId → set of gatheringItemRowIds
  const baseItems = new Map<number, Set<number>>();
  for (const b of bases) {
    const set = new Set<number>();
    for (const slot of b.fields.Item ?? []) {
      const giId = slot.value ?? 0;
      if (giId > 0) set.add(giId);
    }
    if (set.size > 0) baseItems.set(b.row_id, set);
  }

  progress('Fetching gathering points…');
  const points = await fetchSheet<GatheringPointFields>(
    'GatheringPoint',
    'GatheringPointBase',
  );

  // pointRowId → baseRowId
  const pointBase = new Map<number, number>();
  for (const p of points) {
    const b = p.fields.GatheringPointBase?.value ?? 0;
    if (b > 0) pointBase.set(p.row_id, b);
  }

  progress('Fetching gathering point transients…');
  const transients = await fetchSheet<GatheringPointTransientFields>(
    'GatheringPointTransient',
    'EphemeralStartTime,EphemeralEndTime,GatheringRarePopTimeTable',
  );

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

  return catalog;
}
