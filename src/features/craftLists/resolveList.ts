import type { Recipe } from '../../lib/recipes';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';

export type ListSource =
  | 'Crafted' | 'Gathered' | 'TimedGather' | 'Vendor' | 'MonsterDrop' | 'Tome' | 'Crystal';

export interface ResolvedIngredient {
  itemId: number;
  itemName: string;
  requiredQty: number;
  source: ListSource;
  craftedByJob?: string;
  recipeLevel?: number;
  usedToCraft: string[];
  depth?: number;
  canHq?: boolean;
}

export interface FinalItemRow {
  itemId: number;
  itemName: string;
  qty: number;
  isHq: boolean;
  job?: string;
  recipeLevel?: number;
  stars?: number;
}

export interface ResolvedList {
  finalItems: FinalItemRow[];
  subCraftsByDepth: Map<number, ResolvedIngredient[]>;
  gathered: ResolvedIngredient[];      // Gathered + TimedGather
  otherAcquired: ResolvedIngredient[]; // Vendor + Tome + MonsterDrop
  crystals: ResolvedIngredient[];
  all: ResolvedIngredient[];           // flat, for the Table view
}

export interface ResolveDeps {
  recipes: Map<number, Recipe | null>;
  gathering: GatheringCatalog;
  vendorMap: Map<number, number>;
  specialShop: SpecialShopSnapshot;
  itemsById: Map<number, SnapshotItem>;
}

export interface ListInput {
  itemId: number;
  qty: number;
  isHq?: boolean;
}

interface Node {
  qty: number;
  minDepth: number;
  roots: Set<string>;
  isCraft: boolean;
  job?: string;
  recipeLevel?: number;
}

const MAX_DEPTH = 20;

function classifyLeaf(itemId: number, deps: ResolveDeps): ListSource {
  // Crystals first — shards can also appear in gathering nodes, but they belong
  // in their own section regardless.
  if (deps.itemsById.get(itemId)?.sc === CRYSTALS_SEARCH_CATEGORY) return 'Crystal';
  const g = deps.gathering.get(itemId);
  if (g) return g.timed ? 'TimedGather' : 'Gathered';
  for (const entries of deps.specialShop.byCurrency.values()) {
    if (entries.some((e) => e.itemId === itemId)) return 'Tome';
  }
  if (deps.vendorMap.has(itemId)) return 'Vendor';
  return 'MonsterDrop';
}

export function resolveList(inputs: ListInput[], deps: ResolveDeps): ResolvedList {
  const nodes = new Map<number, Node>();

  function touch(id: number, qty: number, depth: number, root: string): Node {
    let n = nodes.get(id);
    if (!n) {
      n = { qty: 0, minDepth: depth, roots: new Set(), isCraft: false };
      nodes.set(id, n);
    }
    n.qty += qty;
    if (depth < n.minDepth) n.minDepth = depth;
    n.roots.add(root);
    return n;
  }

  function walk(id: number, qty: number, depth: number, root: string, path: Set<number>) {
    const recipe = depth > MAX_DEPTH || path.has(id) ? null : deps.recipes.get(id);
    const node = touch(id, qty, depth, root);
    if (recipe) {
      node.isCraft = true;
      node.job = recipe.classJob;
      node.recipeLevel = recipe.recipeLevel;
      const craftCount = Math.ceil(qty / (recipe.amountResult ?? 1));
      path.add(id);
      for (const ing of recipe.ingredients) {
        walk(ing.itemId, ing.amount * craftCount, depth + 1, root, path);
      }
      path.delete(id);
    }
  }

  const finalItems: FinalItemRow[] = [];
  for (const input of inputs) {
    const recipe = deps.recipes.get(input.itemId) ?? undefined;
    const meta = deps.itemsById.get(input.itemId);
    const rootName = meta?.name ?? `Item #${input.itemId}`;
    finalItems.push({
      itemId: input.itemId,
      itemName: rootName,
      qty: input.qty,
      isHq: !!input.isHq,
      job: recipe?.classJob,
      recipeLevel: recipe?.recipeLevel,
      stars: recipe?.stats?.stars,
    });
    if (recipe) {
      const craftCount = Math.ceil(input.qty / (recipe.amountResult ?? 1));
      const path = new Set<number>([input.itemId]);
      for (const ing of recipe.ingredients) {
        walk(ing.itemId, ing.amount * craftCount, 1, rootName, path);
      }
    }
  }

  const subCraftsByDepth = new Map<number, ResolvedIngredient[]>();
  const gathered: ResolvedIngredient[] = [];
  const otherAcquired: ResolvedIngredient[] = [];
  const crystals: ResolvedIngredient[] = [];
  const all: ResolvedIngredient[] = [];

  for (const [id, n] of nodes) {
    const meta = deps.itemsById.get(id);
    const name = meta?.name ?? `Item #${id}`;
    const usedToCraft = [...n.roots].sort((a, b) => a.localeCompare(b));
    const base: ResolvedIngredient = {
      itemId: id, itemName: name, requiredQty: n.qty,
      usedToCraft, canHq: meta?.canHq,
      source: 'MonsterDrop',
    };
    if (n.isCraft) {
      const row: ResolvedIngredient = {
        ...base, source: 'Crafted', depth: n.minDepth, craftedByJob: n.job, recipeLevel: n.recipeLevel,
      };
      const bucket = subCraftsByDepth.get(n.minDepth) ?? [];
      bucket.push(row);
      subCraftsByDepth.set(n.minDepth, bucket);
      all.push(row);
    } else {
      const source = classifyLeaf(id, deps);
      const row: ResolvedIngredient = { ...base, source };
      if (source === 'Crystal') crystals.push(row);
      else if (source === 'Gathered' || source === 'TimedGather') gathered.push(row);
      else otherAcquired.push(row);
      all.push(row);
    }
  }

  const byName = (a: ResolvedIngredient, b: ResolvedIngredient) => a.itemName.localeCompare(b.itemName);
  for (const rows of subCraftsByDepth.values()) rows.sort(byName);
  gathered.sort(byName);
  otherAcquired.sort(byName);
  crystals.sort(byName);
  all.sort(byName);

  return { finalItems, subCraftsByDepth, gathered, otherAcquired, crystals, all };
}
