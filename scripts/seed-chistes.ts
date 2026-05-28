/**
 * One-time seed script: fetches ~2K Spanish jokes from HuggingFace
 * (mrm8488/CHISTES_spanish_jokes) and inserts them into the Turso DB.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/seed-chistes.ts
 *
 * Idempotent: re-running clears and re-seeds the table.
 */

import { createClient } from '@libsql/client';

const HF_DATASET = 'mrm8488/CHISTES_spanish_jokes';
const HF_BASE = 'https://datasets-server.huggingface.co/rows';
const BATCH_SIZE = 100;

async function fetchPage(offset: number, limit: number): Promise<string[]> {
  const url = `${HF_BASE}?dataset=${encodeURIComponent(HF_DATASET)}&config=default&split=train&offset=${offset}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HuggingFace API error: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { rows: Array<{ row: Record<string, unknown> }> };
  // Each row has a single text column — grab the first string value we find.
  return json.rows
    .map((r) => {
      const values = Object.values(r.row);
      const text = values.find((v) => typeof v === 'string' && (v as string).trim().length > 0);
      return (text as string | undefined)?.trim() ?? '';
    })
    .filter((t) => t.length > 0);
}

async function fetchAll(): Promise<string[]> {
  const jokes: string[] = [];
  let offset = 0;

  // First request to discover total rows
  const firstBatch = await fetchPage(0, BATCH_SIZE);
  jokes.push(...firstBatch);
  offset += firstBatch.length;

  if (firstBatch.length < BATCH_SIZE) {
    // Dataset smaller than one page
    return jokes;
  }

  // Keep fetching until we get a short page (end of dataset) or hit 5K
  while (offset < 5000) {
    const batch = await fetchPage(offset, BATCH_SIZE);
    if (batch.length === 0) break;
    jokes.push(...batch);
    offset += batch.length;
    process.stdout.write(`\rFetched ${jokes.length} jokes…`);
    if (batch.length < BATCH_SIZE) break;
  }
  process.stdout.write('\n');
  return jokes;
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');

  const isLocal = url === ':memory:' || url.startsWith('file:');
  const client = createClient({
    url: url === ':memory:' ? 'file::memory:' : url,
    ...(isLocal ? {} : { authToken }),
  });

  console.log('📥 Fetching jokes from HuggingFace…');
  const jokes = await fetchAll();
  console.log(`✅ Fetched ${jokes.length} jokes`);

  console.log('🗄️  Setting up chistes table…');
  await client.execute(`
    CREATE TABLE IF NOT EXISTS chistes (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      joke    TEXT NOT NULL
    )
  `);

  // Clear existing data so re-runs are idempotent
  await client.execute('DELETE FROM chistes');

  console.log('📝 Inserting jokes…');
  // libsql doesn't support multi-row VALUES in one statement easily,
  // so batch with client.batch()
  const CHUNK = 200;
  for (let i = 0; i < jokes.length; i += CHUNK) {
    const chunk = jokes.slice(i, i + CHUNK);
    const stmts = chunk.map((joke) => ({
      sql: 'INSERT INTO chistes (joke) VALUES (?)',
      args: [joke] as [string],
    }));
    await client.batch(stmts, 'write');
    process.stdout.write(`\rInserted ${Math.min(i + CHUNK, jokes.length)}/${jokes.length}…`);
  }
  process.stdout.write('\n');

  const count = await client.execute('SELECT COUNT(*) as n FROM chistes');
  console.log(`🎉 Done! ${count.rows[0].n} jokes in DB.`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
