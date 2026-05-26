import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SnapshotItem } from '../../src/lib/itemSnapshot';
import type { Recipe } from '../../src/lib/recipes';
import type { SnapshotQuest } from '../../src/lib/questSnapshot';
import type { ShopEntry, SpecialShopSnapshot } from '../../src/lib/specialShopSnapshot';
import type { GatheringInfo } from '../../src/lib/gatheringCatalog';
import type { CurrencyId } from '../../src/lib/currencies';

export interface BotSnapshots {
  itemsById: Map<number, SnapshotItem>;
  namesById: Map<number, string>;
  recipes: Map<number, Recipe>;
  gcSupplyIds: Set<number>;
  vendorMap: Map<number, number>;
  specialShop: SpecialShopSnapshot;
  gatheringCatalog: Map<number, GatheringInfo>;
}

export async function loadSnapshots(snapshotsDir: string): Promise<BotSnapshots> {
  console.log(`[snapshots] loading from ${snapshotsDir}…`);
  const start = Date.now();
  const [itemsRaw, recipesRaw, questsRaw, vendorRaw, specialShopRaw, gatheringRaw] = await Promise.all([
    readFile(join(snapshotsDir, 'items.json'), 'utf8'),
    readFile(join(snapshotsDir, 'recipes.json'), 'utf8'),
    readFile(join(snapshotsDir, 'quests.json'), 'utf8'),
    readFile(join(snapshotsDir, 'vendorShop.json'), 'utf8'),
    readFile(join(snapshotsDir, 'specialShop.json'), 'utf8'),
    readFile(join(snapshotsDir, 'gathering.json'), 'utf8'),
  ]);
  console.log(`[snapshots] read 6 files in ${Date.now() - start}ms`);
  const itemsBundle = JSON.parse(itemsRaw) as { bakedAt: number; items: SnapshotItem[] };
  const recipesBundle = JSON.parse(recipesRaw) as { bakedAt: number; entries: Array<[number, Recipe]> };
  const questsBundle = JSON.parse(questsRaw) as { bakedAt: number; quests: SnapshotQuest[] };
  const vendorBundle = JSON.parse(vendorRaw) as { bakedAt: number; entries: Array<[number, number]> };
  const specialShopBundle = JSON.parse(specialShopRaw) as { bakedAt: number; byCurrency: Array<[CurrencyId, ShopEntry[]]> };
  const gatheringBundle = JSON.parse(gatheringRaw) as { bakedAt: number; entries: Array<[number, GatheringInfo]> };

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

  const vendorMap = new Map<number, number>(vendorBundle.entries);
  const specialShop: SpecialShopSnapshot = { byCurrency: new Map(specialShopBundle.byCurrency) };
  const gatheringCatalog = new Map<number, GatheringInfo>(gatheringBundle.entries);

  console.log(`[snapshots] specialShop: ${[...specialShop.byCurrency.values()].reduce((s, e) => s + e.length, 0)} entries, gathering: ${gatheringCatalog.size} items`);

  return { itemsById, namesById, recipes, gcSupplyIds, vendorMap, specialShop, gatheringCatalog };
}
