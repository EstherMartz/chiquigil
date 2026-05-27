/**
 * Bake static XIVAPI snapshots into public/data/snapshots/*.json.
 *
 * Run via `npm run snapshots`. Output is committed to the repo so users
 * download a single static bundle per dataset on first visit instead of
 * paginating 30+ XIVAPI requests.
 *
 * The runtime hooks fall back to live fetch if a bundle is missing, so
 * partial bakes are safe.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { fetchItemSnapshot } from '../src/lib/itemSnapshot';
import { fetchRecipeSnapshot } from '../src/lib/recipeSnapshot';
import { fetchLeveSnapshot } from '../src/lib/leveSnapshot';
import { fetchQuestSnapshot } from '../src/lib/questSnapshot';
import { fetchVendorSnapshot } from '../src/lib/vendorShopSnapshot';
import { fetchSpecialShopSnapshot } from '../src/lib/specialShopSnapshot';
import { buildGatheringCatalog } from '../src/lib/gatheringCatalog';
import { fetchCompanyCraftSnapshot } from '../src/lib/companyCraftSnapshot';
import { currencyByItemId } from '../src/lib/currencies';

const OUT_DIR = join(process.cwd(), 'public', 'data', 'snapshots');

function log(label: string, msg: string) {
  process.stdout.write(`[${label}] ${msg}\n`);
}

async function bakeItems(bakedAt: number) {
  log('items', 'fetching XIVAPI Item sheet…');
  const items = await fetchItemSnapshot({
    onProgress: (n) => process.stdout.write(`\r[items] ${n} rows…`),
  });
  process.stdout.write('\n');
  await writeFile(join(OUT_DIR, 'items.json'), JSON.stringify({ bakedAt, items }));
  log('items', `wrote ${items.length} items`);
  return items.length;
}

async function bakeRecipes(bakedAt: number) {
  log('recipes', 'fetching XIVAPI Recipe sheet…');
  const map = await fetchRecipeSnapshot({
    onProgress: (n) => process.stdout.write(`\r[recipes] ${n} recipes…`),
  });
  process.stdout.write('\n');
  await writeFile(join(OUT_DIR, 'recipes.json'), JSON.stringify({ bakedAt, entries: [...map.entries()] }));
  log('recipes', `wrote ${map.size} recipes`);
  return map.size;
}

async function bakeLeves(bakedAt: number) {
  log('leves', 'fetching XIVAPI Leve + CraftLeve sheets…');
  const leves = await fetchLeveSnapshot({
    onProgress: (n) => process.stdout.write(`\r[leves] ${n} leves…`),
  });
  process.stdout.write('\n');
  await writeFile(join(OUT_DIR, 'leves.json'), JSON.stringify({ bakedAt, leves }));
  log('leves', `wrote ${leves.length} leves`);
  return leves.length;
}

async function bakeVendor(bakedAt: number) {
  log('vendorShop', 'fetching XIVAPI GilShopItem sheet…');
  const map = await fetchVendorSnapshot({
    onProgress: (n) => process.stdout.write(`\r[vendorShop] ${n} entries…`),
  });
  process.stdout.write('\n');
  await writeFile(join(OUT_DIR, 'vendorShop.json'), JSON.stringify({ bakedAt, entries: [...map.entries()] }));
  log('vendorShop', `wrote ${map.size} vendor entries`);
  return map.size;
}

async function bakeSpecialShop(bakedAt: number) {
  log('specialShop', 'fetching XIVAPI SpecialShop sheet…');
  const snap = await fetchSpecialShopSnapshot(currencyByItemId, {
    onProgress: (n) => process.stdout.write(`\r[specialShop] ${n} entries…`),
  });
  process.stdout.write('\n');
  await writeFile(
    join(OUT_DIR, 'specialShop.json'),
    JSON.stringify({ bakedAt, byCurrency: [...snap.byCurrency.entries()] }),
  );
  const total = [...snap.byCurrency.values()].reduce((a, v) => a + v.length, 0);
  log('specialShop', `wrote ${total} entries across ${snap.byCurrency.size} currencies`);
  return total;
}

async function bakeGathering(bakedAt: number) {
  log('gathering', 'building gathering catalog (4-sheet join)…');
  const map = await buildGatheringCatalog({ onProgress: (msg) => log('gathering', msg) });
  await writeFile(join(OUT_DIR, 'gathering.json'), JSON.stringify({ bakedAt, entries: [...map.entries()] }));
  log('gathering', `wrote ${map.size} gathering items`);
  return map.size;
}

async function bakeQuests(bakedAt: number) {
  log('quests', 'fetching Teamcraft gc-supply data…');
  const quests = await fetchQuestSnapshot({
    onProgress: (n) => log('quests', `${n} GC supply entries`),
  });
  await writeFile(join(OUT_DIR, 'quests.json'), JSON.stringify({ bakedAt, quests }));
  log('quests', `wrote ${quests.length} GC supply entries`);
  return quests.length;
}

async function bakeCompanyCraft(bakedAt: number, namesById: Map<number, string>) {
  log('companyCraft', 'fetching XIVAPI CompanyCraftSequence sheet…');
  const map = await fetchCompanyCraftSnapshot(namesById, {
    onProgress: (n) => process.stdout.write(`\r[companyCraft] ${n} sequences…`),
  });
  process.stdout.write('\n');
  await writeFile(
    join(OUT_DIR, 'companyCraft.json'),
    JSON.stringify({ bakedAt, entries: [...map.entries()] }),
  );
  log('companyCraft', `wrote ${map.size} sequences`);
  return map.size;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const bakedAt = Date.now();
  const bakedAtIso = new Date(bakedAt).toISOString();

  const items = await bakeItems(bakedAt);
  const recipes = await bakeRecipes(bakedAt);
  const leves = await bakeLeves(bakedAt);
  const vendor = await bakeVendor(bakedAt);
  const special = await bakeSpecialShop(bakedAt);
  const gathering = await bakeGathering(bakedAt);
  const quests = await bakeQuests(bakedAt);

  // Read baked items back to build names map for CompanyCraft.
  const { readFile } = await import('node:fs/promises');
  const itemsRaw = JSON.parse(await readFile(join(OUT_DIR, 'items.json'), 'utf-8')) as {
    items: Array<{ id: number; name: string }>;
  };
  const namesById = new Map<number, string>(itemsRaw.items.map((i) => [i.id, i.name]));
  const companyCraft = await bakeCompanyCraft(bakedAt, namesById);

  const manifest = {
    bakedAt,
    bakedAtIso,
    counts: { items, recipes, leves, vendorShop: vendor, specialShop: special, gathering, quests, companyCraft },
  };
  await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log('manifest', `bake complete at ${bakedAtIso}`);
}

main().catch((err) => {
  process.stderr.write(`\nbake failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
