/**
 * Garland Tools static-doc API for item details + ingredient source classification.
 *
 * Endpoint shape (subset we rely on):
 *   {
 *     item: { id, name, ilvl, ingredients?: [{ id, amount }], craft?: [{ ingredients }] },
 *     partials: [
 *       { type: 'item', id, obj: { n, i?, v?, s?, c?, f?, t?, ... } },
 *       { type: 'npc',  id, obj: { n, l? } },
 *       { type: 'node', id, obj: { n, t? } },
 *     ]
 *   }
 *
 * Source flags on item partials we observe in the wild:
 *   v: 1   → sold by vendor (Gil shop)
 *   t: 1   → has a recipe (craftable)
 *   has linked node/instance partials in graph → gatherable / drop
 *
 * Best-effort: if Garland blocks CORS or response shape shifts, callers fall back.
 */

const GARLAND_BASE = 'https://www.garlandtools.org/db/doc/item/en/3';

export type IngredientSource = 'vendor' | 'gather' | 'craft' | 'other';

export interface GarlandIngredient {
  id: number;
  amount: number;
  name: string;
  ilvl: number;
  source: IngredientSource;
  vendorName?: string;
  nodeName?: string;
}

export interface GarlandItem {
  id: number;
  name: string;
  ilvl: number;
  ingredients: GarlandIngredient[];
}

interface RawPartialItemObj {
  n?: string;
  i?: number;
  v?: number;
  t?: number;
  s?: number;
  partials?: Array<[string, number]>;
}
interface RawPartial {
  type?: string;
  id?: number | string;
  obj?: RawPartialItemObj & { l?: string };
}
interface RawItem {
  id?: number;
  name?: string;
  ilvl?: number;
  ingredients?: Array<{ id?: number; amount?: number }>;
  craft?: Array<{ ingredients?: Array<{ id?: number; amount?: number }> }>;
}
interface RawResponse { item?: RawItem; partials?: RawPartial[] }

function classify(obj: RawPartialItemObj | undefined): IngredientSource {
  if (!obj) return 'other';
  if (obj.t === 1) return 'craft';
  if (obj.v === 1) return 'vendor';
  if (obj.s === 1) return 'gather';
  return 'other';
}

export function parseGarlandItem(raw: RawResponse): GarlandItem | null {
  const item = raw.item;
  if (!item || item.id == null) return null;
  const partials = raw.partials ?? [];
  const itemPartials = new Map<number, RawPartialItemObj>();
  const npcPartials = new Map<number, string>();
  for (const p of partials) {
    const id = typeof p.id === 'string' ? Number(p.id) : p.id;
    if (id == null || Number.isNaN(id)) continue;
    if (p.type === 'item' && p.obj) itemPartials.set(id, p.obj);
    else if (p.type === 'npc' && p.obj?.n) npcPartials.set(id, p.obj.n);
  }
  const ingSrc = item.craft?.[0]?.ingredients ?? item.ingredients ?? [];
  const ingredients: GarlandIngredient[] = [];
  for (const ing of ingSrc) {
    const id = ing.id;
    const amount = ing.amount;
    if (id == null || amount == null || amount <= 0) continue;
    const part = itemPartials.get(id);
    ingredients.push({
      id,
      amount,
      name: part?.n ?? `#${id}`,
      ilvl: part?.i ?? 0,
      source: classify(part),
    });
  }
  return {
    id: item.id,
    name: item.name ?? '',
    ilvl: item.ilvl ?? 0,
    ingredients,
  };
}

export async function fetchGarlandItem(itemId: number): Promise<GarlandItem | null> {
  const res = await fetch(`${GARLAND_BASE}/${itemId}.json`);
  if (!res.ok) throw new Error(`Garland ${res.status}`);
  return parseGarlandItem(await res.json());
}
