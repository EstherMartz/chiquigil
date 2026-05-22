import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SnapshotItem } from '../../src/lib/itemSnapshot';
import type { Recipe } from '../../src/lib/recipes';
import type { SnapshotQuest } from '../../src/lib/questSnapshot';

export interface BotSnapshots {
  itemsById: Map<number, SnapshotItem>;
  namesById: Map<number, string>;
  recipes: Map<number, Recipe>;
  gcSupplyIds: Set<number>;
}

export async function loadSnapshots(snapshotsDir: string): Promise<BotSnapshots> {
  const [itemsRaw, recipesRaw, questsRaw] = await Promise.all([
    readFile(join(snapshotsDir, 'items.json'), 'utf8'),
    readFile(join(snapshotsDir, 'recipes.json'), 'utf8'),
    readFile(join(snapshotsDir, 'quests.json'), 'utf8'),
  ]);
  const itemsBundle = JSON.parse(itemsRaw) as { bakedAt: number; items: SnapshotItem[] };
  const recipesBundle = JSON.parse(recipesRaw) as { bakedAt: number; entries: Array<[number, Recipe]> };
  const questsBundle = JSON.parse(questsRaw) as { bakedAt: number; quests: SnapshotQuest[] };

  const itemsById = new Map<number, SnapshotItem>();
  const namesById = new Map<number, string>();
  for (const i of itemsBundle.items) {
    itemsById.set(i.id, i);
    namesById.set(i.id, i.name);
  }
  const recipes = new Map<number, Recipe>(recipesBundle.entries);

  const gcSupplyIds = new Set<number>();
  for (const quest of questsBundle.quests) {
    for (const req of quest.requiredItems) gcSupplyIds.add(req.itemId);
  }

  return { itemsById, namesById, recipes, gcSupplyIds };
}
