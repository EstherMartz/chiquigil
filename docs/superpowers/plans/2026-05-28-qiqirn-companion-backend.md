# QiqirnCompanion Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new API endpoints (`POST /api/plugin/claim` and `GET /api/plugin/craftable`) and a new CraftStore method (`claimTaskByCharacter`) so the Dalamud plugin can claim tasks and retrieve craftable items from inside FFXIV.

**Architecture:** New method in `craftStore.ts` stores a character name string instead of a Discord user ID (same `assignee_id` TEXT column, no schema migration). Two new Vercel API handler files follow the existing `projects.ts` pattern. The esbuild `build:api` script and `vercel.json` rewrites are updated to include them.

**Tech Stack:** TypeScript, Vitest, libsql/Turso, esbuild, Vercel Node runtime, `@vercel/blob` for market-cache

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/bot/craftStore.ts` — add `claimTaskByCharacter` to interface + impl |
| Modify | `src/bot/craftStore.test.ts` — add test for `claimTaskByCharacter` |
| Create | `src/api/plugin-claim.ts` — `POST /api/plugin/claim` handler |
| Create | `src/api/plugin-craftable.ts` — `GET /api/plugin/craftable` handler |
| Modify | `vercel.json` — add 2 new rewrite entries + 2 function duration entries |
| Modify | `package.json` — add 2 new files to `build:api` script |

---

## Task 1: Add `claimTaskByCharacter` to CraftStore

**Files:**
- Modify: `src/bot/craftStore.ts`
- Modify: `src/bot/craftStore.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/bot/craftStore.test.ts`. Add this test inside the `describe('craftStore', ...)` block, after the existing claim/unclaim test:

```ts
it('claimTaskByCharacter claims a task with a character name', async () => {
  const pid = await store.createProject({
    guildId: 'g1', channelId: 'c1', name: 'Plugin Test', targetItemId: 1, targetQty: 1, createdBy: 'u1',
  });
  await store.addTasks(pid, [
    { itemId: 10, itemName: 'Cotton Boll', qtyNeeded: 40, source: 'market', meta: {} },
  ]);
  const tasks = await store.getTasks(pid);
  const result = await store.claimTaskByCharacter(tasks[0].id, 'Estheria Moonweave');
  expect(result).not.toBeNull();
  expect(result!.assigneeId).toBe('Estheria Moonweave');
  expect(result!.status).toBe('claimed');
});

it('claimTaskByCharacter returns null when task is already claimed', async () => {
  const pid = await store.createProject({
    guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 1, targetQty: 1, createdBy: 'u1',
  });
  await store.addTasks(pid, [
    { itemId: 10, itemName: 'Ore', qtyNeeded: 5, source: 'market', meta: {} },
  ]);
  const tasks = await store.getTasks(pid);
  await store.claimTask(tasks[0].id, 'discordUser1');
  const result = await store.claimTaskByCharacter(tasks[0].id, 'Estheria Moonweave');
  expect(result).toBeNull();
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```
npm test -- --reporter=verbose src/bot/craftStore.test.ts
```

Expected: Two new tests FAIL with `TypeError: store.claimTaskByCharacter is not a function`

- [ ] **Step 3: Add `claimTaskByCharacter` to the `CraftStore` interface**

In `src/bot/craftStore.ts`, find the `CraftStore` interface (lines 4–33). Add this line after `claimTask`:

```ts
claimTaskByCharacter(taskId: number, characterName: string): Promise<StoredTask | null>;
```

The interface block should now include:
```ts
claimTask(taskId: number, userId: string): Promise<boolean>;
claimTaskByCharacter(taskId: number, characterName: string): Promise<StoredTask | null>;
logProgress(taskId: number, userId: string, amount: number): Promise<StoredTask | null>;
```

- [ ] **Step 4: Add the implementation**

In the `return { ... }` block of `openCraftStore`, find the `claimTask` implementation (around line 227). Add the following method immediately after it:

```ts
async claimTaskByCharacter(taskId, characterName) {
  const now = Date.now();
  const result = await client.execute({
    sql: "UPDATE tasks SET assignee_id = ?, status = 'claimed', updated_at = ? WHERE id = ? AND status = 'open'",
    args: [characterName, now, taskId],
  });
  if (result.rowsAffected === 0) return null;
  const row = await client.execute({
    sql: 'SELECT * FROM tasks WHERE id = ?',
    args: [taskId],
  });
  return row.rows[0] ? rowToTask(row.rows[0]) : null;
},
```

- [ ] **Step 5: Run the tests to confirm they pass**

```
npm test -- --reporter=verbose src/bot/craftStore.test.ts
```

Expected: All tests PASS (green), including the two new ones.

- [ ] **Step 6: Commit**

```bash
git add src/bot/craftStore.ts src/bot/craftStore.test.ts
git commit -m "feat: add claimTaskByCharacter to CraftStore for plugin task claiming"
```

---

## Task 2: Create `POST /api/plugin/claim` handler

**Files:**
- Create: `src/api/plugin-claim.ts`

- [ ] **Step 1: Create the file**

Create `src/api/plugin-claim.ts` with this content:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';

function getAllowList(): string[] {
  return (process.env.GUILD_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowed(guildId: string): boolean {
  const list = getAllowList();
  return list.length > 0 && list.includes(guildId);
}

let storePromise: Promise<CraftStore> | null = null;
function getStore(): Promise<CraftStore> {
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectId, taskId, characterName, guildId } = req.body ?? {};

  if (!projectId || !taskId || !characterName || !guildId) {
    return res.status(400).json({ error: 'Missing required fields: projectId, taskId, characterName, guildId' });
  }

  if (!isAllowed(String(guildId))) {
    return res.status(403).json({ error: 'Guild not in allow-list' });
  }

  const store = await getStore();

  // Verify the task belongs to a project owned by this guild.
  const project = await store.getProject(Number(projectId));
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (project.guildId !== String(guildId)) {
    return res.status(403).json({ error: 'Project does not belong to this guild' });
  }

  const task = await store.claimTaskByCharacter(Number(taskId), String(characterName));
  if (!task) {
    return res.status(409).json({ error: 'Task not found or already claimed' });
  }

  return res.status(200).json({ ok: true, task });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/plugin-claim.ts
git commit -m "feat: add POST /api/plugin/claim handler"
```

---

## Task 3: Create `GET /api/plugin/craftable` handler

**Files:**
- Create: `src/api/plugin-craftable.ts`

- [ ] **Step 1: Create the file**

Create `src/api/plugin-craftable.ts` with this content:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadSnapshots } from '../bot/loadSnapshots';
import type { MarketData } from '../lib/universalis';

interface InventoryEntry { id: number; qty: number }

interface CraftableResult {
  itemId: number;
  name: string;
  qty: number;
  minNQ: number | null;
  velocity: number;
}

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse inventory from ?inv= query param (URL-encoded JSON array)
  let inventory: InventoryEntry[];
  try {
    const raw = req.query.inv;
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'Missing inv query param' });
    }
    inventory = JSON.parse(raw) as InventoryEntry[];
    if (!Array.isArray(inventory)) throw new Error('Not an array');
  } catch {
    return res.status(400).json({ error: 'inv must be a URL-encoded JSON array of {id, qty} objects' });
  }

  // Build a lookup map: itemId → qty in inventory
  const invMap = new Map<number, number>();
  for (const entry of inventory) {
    invMap.set(entry.id, (invMap.get(entry.id) ?? 0) + entry.qty);
  }

  // Load recipe snapshot
  const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
  const snapshots = await loadSnapshots(baseUrl);

  // Check each recipe: can we fully cover all ingredients?
  const craftable: CraftableResult[] = [];

  for (const [outputItemId, recipe] of snapshots.recipes) {
    const amountResult = recipe.amountResult ?? 1;

    // Find the minimum number of times we can craft this recipe
    let canMake = Infinity;
    for (const ing of recipe.ingredients) {
      const have = invMap.get(ing.itemId) ?? 0;
      const batchesFromThis = Math.floor(have / ing.amount);
      if (batchesFromThis < canMake) canMake = batchesFromThis;
    }

    // Skip if we can't make even one batch
    if (!isFinite(canMake) || canMake === 0) continue;

    const totalQty = canMake * amountResult;
    const name = snapshots.namesById.get(outputItemId) ?? `Item #${outputItemId}`;

    craftable.push({
      itemId: outputItemId,
      name,
      qty: totalQty,
      minNQ: null, // filled in below after market fetch
      velocity: 0,
    });
  }

  if (craftable.length === 0) {
    return res.status(200).json({ craftable: [] });
  }

  // Fetch market prices from the hourly bot cache blob
  try {
    const cacheUrl = process.env.MARKET_CACHE_BLOB_URL ?? `${baseUrl}/data/market-cache.json`;
    const cacheRes = await fetch(cacheUrl, { cache: 'no-store' } as RequestInit);
    if (cacheRes.ok) {
      const cache = (await cacheRes.json()) as SharedCache;
      // Use phantom (home world) prices — client can send ?scope= in v2 if needed
      const market = cache.phantom;
      for (const item of craftable) {
        const entry = market[String(item.itemId)];
        if (entry) {
          item.minNQ = entry.minNQ;
          item.velocity = entry.velocity;
        }
      }
    }
  } catch {
    // Cache unavailable — return items without prices rather than failing
  }

  // Sort by estimated gil opportunity (minNQ × qty), descending
  craftable.sort((a, b) => {
    const aVal = (a.minNQ ?? 0) * a.qty;
    const bVal = (b.minNQ ?? 0) * b.qty;
    return bVal - aVal;
  });

  return res.status(200).json({ craftable });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/plugin-craftable.ts
git commit -m "feat: add GET /api/plugin/craftable handler"
```

---

## Task 4: Wire up vercel.json, build script, and deploy

**Files:**
- Modify: `vercel.json`
- Modify: `package.json`

- [ ] **Step 1: Update `vercel.json`**

Current content of `vercel.json`:
```json
{
  "functions": {
    "api/refresh-cache.mjs": { "maxDuration": 300 },
    "api/discord.mjs": { "maxDuration": 60 },
    "api/projects.mjs": { "maxDuration": 30 }
  },
  "rewrites": [
    { "source": "/api/projects/:id", "destination": "/api/projects" },
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

Replace with:
```json
{
  "functions": {
    "api/refresh-cache.mjs": { "maxDuration": 300 },
    "api/discord.mjs": { "maxDuration": 60 },
    "api/projects.mjs": { "maxDuration": 30 },
    "api/plugin-claim.mjs": { "maxDuration": 15 },
    "api/plugin-craftable.mjs": { "maxDuration": 30 }
  },
  "rewrites": [
    { "source": "/api/projects/:id", "destination": "/api/projects" },
    { "source": "/api/plugin/claim", "destination": "/api/plugin-claim" },
    { "source": "/api/plugin/craftable", "destination": "/api/plugin-craftable" },
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

Note: the two new plugin rewrites must appear **before** the `/(.*)`  catch-all.

- [ ] **Step 2: Update the `build:api` script in `package.json`**

Find the `build:api` line in `package.json`:
```
"build:api": "esbuild src/api/discord.ts src/api/refresh-cache.ts src/api/projects.ts --bundle --platform=node --format=esm --outdir=api --out-extension:.js=.mjs --packages=external",
```

Replace with:
```
"build:api": "esbuild src/api/discord.ts src/api/refresh-cache.ts src/api/projects.ts src/api/plugin-claim.ts src/api/plugin-craftable.ts --bundle --platform=node --format=esm --outdir=api --out-extension:.js=.mjs --packages=external",
```

- [ ] **Step 3: Build locally**

```
npm run build:api
```

Expected: Outputs `api/plugin-claim.mjs` and `api/plugin-craftable.mjs` with no errors.

- [ ] **Step 4: Smoke test locally**

```bash
# Start Vercel dev server (requires vercel CLI)
vercel dev
```

In another terminal:
```bash
# Test claim endpoint (will return 403 — no env vars — but proves routing works)
curl -X POST http://localhost:3000/api/plugin/claim \
  -H "Content-Type: application/json" \
  -d '{"projectId":1,"taskId":1,"characterName":"Test","guildId":"badguild"}'
# Expected: {"error":"Guild not in allow-list"}

# Test craftable endpoint (will return 400 without inv param)
curl "http://localhost:3000/api/plugin/craftable"
# Expected: {"error":"Missing inv query param"}

# Test craftable with empty inventory
curl "http://localhost:3000/api/plugin/craftable?inv=%5B%5D"
# Expected: {"craftable":[]}
```

- [ ] **Step 5: Commit and push**

```bash
git add vercel.json package.json
git commit -m "feat: wire plugin-claim and plugin-craftable into build and vercel.json"
git push
```

- [ ] **Step 6: Verify deployment on Vercel**

After Vercel deploys (check dashboard or run `vercel logs`), run:
```bash
# Replace YOUR_GUILD_ID with a real value from GUILD_ALLOWLIST env var
curl -X POST https://qiqirn.tools/api/plugin/claim \
  -H "Content-Type: application/json" \
  -d '{"projectId":1,"taskId":1,"characterName":"Estheria Moonweave","guildId":"BAD"}'
# Expected: {"error":"Guild not in allow-list"}

curl "https://qiqirn.tools/api/plugin/craftable?inv=%5B%7B%22id%22%3A5058%2C%22qty%22%3A100%7D%5D"
# Expected: {"craftable":[...]} — list of craftable items, possibly empty if item 5058 isn't an ingredient in any recipe
```

---

## Verification Checklist

- [ ] `npm test` — all tests pass including the two new `claimTaskByCharacter` tests
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] `npm run build:api` — builds `api/plugin-claim.mjs` and `api/plugin-craftable.mjs`
- [ ] `POST /api/plugin/claim` with invalid guild → 403
- [ ] `POST /api/plugin/claim` with valid guild and open task → 200 `{ ok: true, task: { ... } }`
- [ ] `GET /api/plugin/craftable?inv=[...]` → 200 with craftable list
- [ ] Discord `/craft show` on a task claimed via the plugin API shows the character name as assignee
