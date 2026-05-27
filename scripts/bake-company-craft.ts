// One-shot helper to bake ONLY companyCraft.json against the existing items.json.
// Use this to avoid re-baking every other snapshot when iterating on CompanyCraft.
// Equivalent to running `npm run snapshots` but for the new step only.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchCompanyCraftSnapshot } from '../src/lib/companyCraftSnapshot';

const OUT_DIR = join(process.cwd(), 'public', 'data', 'snapshots');

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const itemsRaw = JSON.parse(await readFile(join(OUT_DIR, 'items.json'), 'utf-8')) as {
    items: Array<{ id: number; name: string }>;
  };
  const namesById = new Map<number, string>(itemsRaw.items.map((i) => [i.id, i.name]));
  process.stdout.write(`[items] loaded ${namesById.size} names\n`);

  const bakedAt = Date.now();
  process.stdout.write('[companyCraft] fetching XIVAPI CompanyCraftSequence sheet…\n');
  const map = await fetchCompanyCraftSnapshot(namesById, {
    onProgress: (n) => process.stdout.write(`\r[companyCraft] ${n} sequences…`),
  });
  process.stdout.write('\n');
  await writeFile(
    join(OUT_DIR, 'companyCraft.json'),
    JSON.stringify({ bakedAt, entries: [...map.entries()] }),
  );
  process.stdout.write(`[companyCraft] wrote ${map.size} sequences\n`);
}

main().catch((err) => {
  process.stderr.write(`\nbake failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
