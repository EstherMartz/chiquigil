import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SnapshotItem } from '../../src/lib/itemSnapshot';
import type { Recipe } from '../../src/lib/recipes';

export interface BotSnapshots {
  itemsById: Map<number, SnapshotItem>;
  namesById: Map<number, string>;
  recipes: Map<number, Recipe>;
}

export async function loadSnapshots(snapshotsDir: string): Promise<BotSnapshots> {
  const [itemsRaw, recipesRaw] = await Promise.all([
    readFile(join(snapshotsDir, 'items.json'), 'utf8'),
    readFile(join(snapshotsDir, 'recipes.json'), 'utf8'),
  ]);
  const itemsBundle = JSON.parse(itemsRaw) as { bakedAt: number; items: SnapshotItem[] };
  const recipesBundle = JSON.parse(recipesRaw) as { bakedAt: number; entries: Array<[number, Recipe]> };

  const itemsById = new Map<number, SnapshotItem>();
  const namesById = new Map<number, string>();
  for (const i of itemsBundle.items) {
    itemsById.set(i.id, i);
    namesById.set(i.id, i.name);
  }
  const recipes = new Map<number, Recipe>(recipesBundle.entries);

  return { itemsById, namesById, recipes };
}
