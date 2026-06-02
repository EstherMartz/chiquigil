/**
 * One-time generator for the current patch's whatsNew.json.
 * Reads the PRIOR items.json/recipes.json from git commit a42c4b0 (the
 * pre-bake state) and diffs them against the CURRENT on-disk bundles using
 * the same newIdsSince() the bake uses. No XIVAPI re-fetch.
 *
 * Run once:  npx tsx scripts/backfillWhatsNew.ts
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newIdsSince } from './whatsNewDiff';

const PRIOR_COMMIT = 'a42c4b0';
const OUT_DIR = join(process.cwd(), 'public', 'data', 'snapshots');

function gitShow(path: string): string {
  return execFileSync('git', ['show', `${PRIOR_COMMIT}:${path}`], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function itemIds(raw: string): number[] {
  const parsed = JSON.parse(raw) as { items: Array<{ id: number }> };
  return parsed.items.map((i) => i.id);
}

function recipeKeys(raw: string): number[] {
  const parsed = JSON.parse(raw) as { entries: Array<[number, unknown]> };
  return parsed.entries.map(([id]) => id);
}

async function main() {
  const priorItems = itemIds(gitShow('public/data/snapshots/items.json'));
  const priorRecipes = recipeKeys(gitShow('public/data/snapshots/recipes.json'));

  const curItemsRaw = await readFile(join(OUT_DIR, 'items.json'), 'utf-8');
  const curRecipesRaw = await readFile(join(OUT_DIR, 'recipes.json'), 'utf-8');
  const curItems = JSON.parse(curItemsRaw) as { bakedAt: number; items: Array<{ id: number }> };
  const priorBaked = JSON.parse(gitShow('public/data/snapshots/items.json')) as { bakedAt: number };

  const bundle = {
    bakedAt: curItems.bakedAt,
    prevBakedAt: priorBaked.bakedAt ?? null,
    newItems: newIdsSince(priorItems, curItems.items.map((i) => i.id)),
    newRecipeItems: newIdsSince(priorRecipes, recipeKeys(curRecipesRaw)),
  };

  await writeFile(join(OUT_DIR, 'whatsNew.json'), JSON.stringify(bundle));
  process.stdout.write(
    `whatsNew.json: ${bundle.newItems.length} new items, ${bundle.newRecipeItems.length} new recipes ` +
    `(prev bake ${new Date(bundle.prevBakedAt!).toISOString()})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`backfill failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
