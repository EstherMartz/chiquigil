/**
 * Bake public/data/snapshots/marketable-ids.json — the Universalis-authoritative
 * set of marketable item ids, intersected with our catalog. The refresh sweep uses
 * this instead of the full ~50k catalog (which is ~67% untradeable items that 404).
 * Run standalone: `npx tsx scripts/bake-marketable.ts` (also chained into
 * `npm run snapshots`). On a fetch failure it keeps the existing committed file
 * rather than overwriting it with a partial/empty list.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'data', 'snapshots');
const MARKETABLE_URL = 'https://universalis.app/api/v2/marketable';

async function main() {
  const catalogRaw = JSON.parse(await readFile(join(OUT_DIR, 'items.json'), 'utf-8')) as {
    items: Array<{ id: number }>;
  };
  const catalog = new Set(catalogRaw.items.map((i) => i.id));

  let marketable: number[];
  try {
    const res = await fetch(MARKETABLE_URL);
    if (!res.ok) throw new Error(`Universalis ${res.status}`);
    marketable = (await res.json()) as number[];
    if (!Array.isArray(marketable) || marketable.length === 0) throw new Error('empty/invalid marketable list');
  } catch (err) {
    process.stdout.write(`[marketable] fetch failed (${err instanceof Error ? err.message : String(err)}); keeping existing marketable-ids.json\n`);
    return; // leave the committed file untouched
  }

  const ids = marketable.filter((id) => catalog.has(id)).sort((a, b) => a - b);
  await writeFile(join(OUT_DIR, 'marketable-ids.json'), JSON.stringify({ bakedAt: Date.now(), ids }));
  process.stdout.write(`[marketable] wrote ${ids.length} marketable ids (of ${marketable.length} from Universalis)\n`);
}

main().catch((err) => {
  process.stderr.write(`bake-marketable failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
