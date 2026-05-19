# Discord Uses-Bot Implementation Plan

**Goal:** Discord bot that accepts an Allagan-Tools CSV attachment and replies with a "used in N recipes" breakdown for each inventory item, including output MB prices.

**Architecture:**
- `/bot` subfolder at repo root. Bot imports the existing cleanup modules (`parseAllaganInventory`, `findInventoryUses`, `types`, `marketLookup`) via relative paths — no monorepo restructure since the scope is narrow.
- Snapshots (`items.json`, `recipes.json`) are read from disk at startup. Baked into the Docker image; re-deploy to refresh.
- Universalis fetched via the existing `src/lib/universalis.ts` (Node 18+ has native `fetch`, so it works unmodified). Only outputs from `findInventoryUses` results are queried — not full cleanup market scope — to keep latency low.
- Discord output: top-N summary embed + full breakdown attached as `uses.md` so long lists don't get truncated by Discord's 6000-char embed cap.
- Single-instance bot, guild-allowlisted (env var `GUILD_ALLOWLIST=id1,id2`). World/DC from `HOME_WORLD`/`HOME_DC`/`REGION` env vars.
- Fly.io deploy target. Dockerfile uses `node:20-alpine`, copies snapshots, runs `node dist/index.js`.

**Tech Stack:** TypeScript, discord.js v14, Node 20, Universalis API, existing cleanup-core modules.

---

### Task 1: Scaffold /bot package

**Files:**
- Create: `bot/package.json`
- Create: `bot/tsconfig.json`
- Create: `bot/.env.example`
- Create: `bot/.gitignore`
- Create: `bot/README.md`

- [ ] **Step 1: Create `bot/package.json`**

```json
{
  "name": "ffxiv-uses-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "discord.js": "^14.16.3"
  },
  "devDependencies": {
    "@types/node": "^20.16.10",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2"
  }
}
```

- [ ] **Step 2: Create `bot/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "..",
    "allowImportingTsExtensions": false,
    "noEmit": false,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "../src/features/cleanup/**/*.ts", "../src/lib/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

- [ ] **Step 3: Create `bot/.env.example`**

```
DISCORD_TOKEN=your-bot-token-here
GUILD_ALLOWLIST=123456789012345678,234567890123456789
HOME_WORLD=Phantom
HOME_DC=Chaos
REGION=Europe
SNAPSHOTS_DIR=../public/data/snapshots
```

- [ ] **Step 4: Create `bot/.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 5: Create `bot/README.md`**

```markdown
# ffxiv-uses-bot

Discord bot: attach an Allagan-Tools CSV, get a "used in N recipes" breakdown.

## Run locally

    cp .env.example .env
    # fill in DISCORD_TOKEN + GUILD_ALLOWLIST
    npm install
    npm run dev

## Deploy

See ../docs/superpowers/plans/2026-05-19-discord-uses-bot.md for Fly.io deployment.
```

- [ ] **Step 6: Install dependencies**

Run: `cd bot && npm install`
Expected: dependencies installed, lockfile generated.

- [ ] **Step 7: Commit**

```
git add bot/package.json bot/package-lock.json bot/tsconfig.json bot/.env.example bot/.gitignore bot/README.md
git commit -m "chore(bot): scaffold /bot package for Discord uses-bot"
```

---

### Task 2: loadSnapshots.ts

**Files:**
- Create: `bot/src/loadSnapshots.ts`

Snapshot shape verified ahead of plan (2026-05-19):
- `items.json`: `{ bakedAt: number, items: SnapshotItem[] }` — 49,848 entries.
- `recipes.json`: `{ bakedAt: number, entries: Array<[number, Recipe]> }` — 11,198 entries, serialized Map shape (per `src/lib/staticSnapshots.ts`).

- [ ] **Step 1: Write the file**

```ts
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
```

- [ ] **Step 2: Commit**

```
git add bot/src/loadSnapshots.ts
git commit -m "feat(bot): loadSnapshots reads items + recipes from disk"
```

---

### Task 3: fetchMarketForOutputs.ts

Bot needs MB prices for recipe outputs (uses display). We could reuse `src/lib/universalis.ts` directly — its in-memory + IDB cache is browser-only (IDB persistence falls through gracefully in Node since `indexedDB` is undefined, and the persist is wrapped in try/catch). But the file imports from `./recipeCache` which uses `idb`. To avoid pulling `idb` into the bot, wrap with a tiny Node-side fetcher that talks to Universalis directly with the same cascade logic as `marketLookup.lookupMbTier`.

**Files:**
- Create: `bot/src/fetchMarketForOutputs.ts`

- [ ] **Step 1: Write the file**

```ts
import { parseMarketResponse, type MarketData, type MarketItem } from '../../src/lib/universalis';
import type { MarketBundle } from '../../src/features/watchlist/useMarketData';

interface Config {
  world: string;
  dc: string;
  region: string;
}

const BATCH_SIZE = 100;
const MAX_CONCURRENT = 4;

async function fetchScope(scope: string, ids: number[]): Promise<MarketData> {
  const out: MarketData = {};
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));
  let inFlight = 0;
  let cursor = 0;
  await new Promise<void>((resolve, reject) => {
    const launch = () => {
      while (inFlight < MAX_CONCURRENT && cursor < batches.length) {
        const batch = batches[cursor++];
        inFlight++;
        fetchBatch(scope, batch).then((data) => {
          Object.assign(out, data);
          inFlight--;
          if (cursor >= batches.length && inFlight === 0) resolve();
          else launch();
        }).catch(reject);
      }
    };
    if (batches.length === 0) resolve();
    else launch();
  });
  return out;
}

async function fetchBatch(scope: string, batch: number[]): Promise<MarketData> {
  const url = `https://universalis.app/api/v2/${scope}/${batch.join(',')}?listings=10&entries=15`;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(url);
      if (res.status === 404) return {};
      if (!res.ok) continue;
      const raw = await res.json();
      return parseMarketResponse(raw as Parameters<typeof parseMarketResponse>[0]);
    } catch { /* retry */ }
  }
  return {};
}

export async function fetchMarketForOutputs(
  outputItemIds: number[],
  cfg: Config,
): Promise<MarketBundle> {
  const ids = Array.from(new Set(outputItemIds)).filter((id) => id > 0).sort((a, b) => a - b);
  const [phantom, dc, region] = await Promise.all([
    fetchScope(cfg.world, ids),
    fetchScope(cfg.dc, ids),
    fetchScope(cfg.region, ids),
  ]);
  return { phantom, dc, region } as MarketBundle;
}

export type { MarketItem };
```

- [ ] **Step 2: Commit**

```
git add bot/src/fetchMarketForOutputs.ts
git commit -m "feat(bot): node-side Universalis cascade fetcher"
```

---

### Task 4: formatDiscord.ts

**Files:**
- Create: `bot/src/formatDiscord.ts`

- [ ] **Step 1: Write the file**

```ts
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import type { InventoryEntry, UsesEntry } from '../../src/features/cleanup/types';

const EMBED_MAX_FIELDS = 25;
const EMBED_FIELD_MAX = 1024;

export interface FormatInput {
  entries: InventoryEntry[];
  usesByItemId: Map<number, UsesEntry[]>;
  unrecognized: InventoryEntry[];
}

export interface FormatOutput {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  summary: string;
}

function fmtGil(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

export function formatUsesReply(input: FormatInput): FormatOutput {
  const { entries, usesByItemId, unrecognized } = input;
  const totalRecognized = entries.length;
  const itemsWithUses = entries.filter((e) => (usesByItemId.get(e.itemId)?.length ?? 0) > 0);
  itemsWithUses.sort((a, b) => (usesByItemId.get(b.itemId)?.length ?? 0) - (usesByItemId.get(a.itemId)?.length ?? 0));

  const summary = `Parsed ${totalRecognized + unrecognized.length} rows · ${totalRecognized} recognized · ${itemsWithUses.length} have crafting uses.`;

  const embed = new EmbedBuilder()
    .setTitle('Inventory uses')
    .setDescription(summary)
    .setColor(0xc8a14a);

  const top = itemsWithUses.slice(0, EMBED_MAX_FIELDS - 1);
  for (const e of top) {
    const uses = usesByItemId.get(e.itemId) ?? [];
    const lines = uses.slice(0, 5).map((u) => `• ${u.outputName} (needs ${u.amountNeeded}×) · ${fmtGil(u.outputUnitPrice)}g`);
    if (uses.length > 5) lines.push(`…+${uses.length - 5} more`);
    const value = lines.join('\n').slice(0, EMBED_FIELD_MAX);
    embed.addFields({ name: `${e.name}${e.isHq ? ' ✦' : ''} ×${e.qty}`, value: value || '—', inline: false });
  }

  const md = buildMarkdown(itemsWithUses, usesByItemId, unrecognized);
  const file = new AttachmentBuilder(Buffer.from(md, 'utf8'), { name: 'uses.md' });

  return { embeds: [embed], files: [file], summary };
}

function buildMarkdown(
  itemsWithUses: InventoryEntry[],
  usesByItemId: Map<number, UsesEntry[]>,
  unrecognized: InventoryEntry[],
): string {
  const lines: string[] = ['# Inventory uses', ''];
  for (const e of itemsWithUses) {
    const uses = usesByItemId.get(e.itemId) ?? [];
    lines.push(`## ${e.name}${e.isHq ? ' ✦' : ''} ×${e.qty} — used in ${uses.length} recipes`);
    for (const u of uses) {
      lines.push(`- ${u.outputName} (needs ${u.amountNeeded}×) · ${fmtGil(u.outputUnitPrice)}g`);
    }
    lines.push('');
  }
  if (unrecognized.length > 0) {
    lines.push(`## Unrecognized (${unrecognized.length})`);
    for (const u of unrecognized) lines.push(`- "${u.name}" ×${u.qty}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 2: Commit**

```
git add bot/src/formatDiscord.ts
git commit -m "feat(bot): Discord embed + .md attachment formatter"
```

---

### Task 5: handleCsv.ts

**Files:**
- Create: `bot/src/handleCsv.ts`

- [ ] **Step 1: Write the file**

```ts
import { parseAllaganInventory } from '../../src/features/cleanup/parseAllaganInventory';
import { findInventoryUses } from '../../src/features/cleanup/findInventoryUses';
import { fetchMarketForOutputs } from './fetchMarketForOutputs';
import { formatUsesReply, type FormatOutput } from './formatDiscord';
import type { BotSnapshots } from './loadSnapshots';

interface Cfg { world: string; dc: string; region: string }

export async function handleCsv(
  csv: string,
  snapshots: BotSnapshots,
  cfg: Cfg,
): Promise<FormatOutput> {
  const parsed = parseAllaganInventory(csv, snapshots.namesById);

  // Find which recipe outputs we need MB prices for: outputs of recipes that use
  // any of the inventory items as ingredients. Pass through findInventoryUses
  // with an empty market first to discover the outputs.
  const emptyMarket = { phantom: {}, dc: {}, region: {} } as Parameters<typeof findInventoryUses>[2];
  const usesNoPrice = findInventoryUses(parsed.entries, snapshots.recipes, emptyMarket, snapshots.itemsById);
  const outputIds = new Set<number>();
  for (const arr of usesNoPrice.values()) for (const u of arr) outputIds.add(u.outputItemId);

  const market = await fetchMarketForOutputs([...outputIds], cfg);
  const usesByItemId = findInventoryUses(parsed.entries, snapshots.recipes, market, snapshots.itemsById);

  return formatUsesReply({
    entries: parsed.entries,
    usesByItemId,
    unrecognized: parsed.unrecognized,
  });
}
```

- [ ] **Step 2: Commit**

```
git add bot/src/handleCsv.ts
git commit -m "feat(bot): handleCsv orchestrates parse → uses → format"
```

---

### Task 6: index.ts (Discord client)

**Files:**
- Create: `bot/src/index.ts`
- Create: `bot/src/config.ts`

- [ ] **Step 1: Create `bot/src/config.ts`**

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  guildAllowlist: new Set(required('GUILD_ALLOWLIST').split(',').map((s) => s.trim()).filter(Boolean)),
  world: process.env.HOME_WORLD ?? 'Phantom',
  dc: process.env.HOME_DC ?? 'Chaos',
  region: process.env.REGION ?? 'Europe',
  snapshotsDir: process.env.SNAPSHOTS_DIR ?? '../public/data/snapshots',
};
```

- [ ] **Step 2: Create `bot/src/index.ts`**

```ts
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config';
import { loadSnapshots } from './loadSnapshots';
import { handleCsv } from './handleCsv';

async function main() {
  console.log('Loading snapshots…');
  const snapshots = await loadSnapshots(config.snapshotsDir);
  console.log(`Loaded ${snapshots.itemsById.size} items, ${snapshots.recipes.size} recipes.`);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
  });

  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;
    if (!msg.guildId || !config.guildAllowlist.has(msg.guildId)) return;
    const attachment = msg.attachments.find((a) => a.name?.toLowerCase().endsWith('.csv'));
    if (!attachment) return;

    await msg.channel.sendTyping();
    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
      const csv = await res.text();
      const reply = await handleCsv(csv, snapshots, { world: config.world, dc: config.dc, region: config.region });
      await msg.reply({ content: reply.summary, embeds: reply.embeds, files: reply.files });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await msg.reply(`Couldn't process CSV: \`${m}\``);
    }
  });

  await client.login(config.token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Run typecheck**

Run: `cd bot && npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```
git add bot/src/config.ts bot/src/index.ts
git commit -m "feat(bot): discord.js client with guild allowlist + CSV attachment handler"
```

---

### Task 7: Dockerfile + deploy notes

**Files:**
- Create: `bot/Dockerfile`
- Create: `bot/.dockerignore`
- Create: `bot/fly.toml`

- [ ] **Step 1: Create `bot/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY bot/package.json bot/package-lock.json bot/tsconfig.json ./bot/
COPY bot/src ./bot/src
COPY src ./src
COPY public/data/snapshots ./public/data/snapshots
RUN cd bot && npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/bot/node_modules ./bot/node_modules
COPY --from=build /app/bot/dist ./bot/dist
COPY --from=build /app/public/data/snapshots ./public/data/snapshots
ENV SNAPSHOTS_DIR=/app/public/data/snapshots
CMD ["node", "bot/dist/bot/src/index.js"]
```

- [ ] **Step 2: Create `bot/.dockerignore`**

```
node_modules
dist
.env
```

- [ ] **Step 3: Create `bot/fly.toml`**

```toml
app = "ffxiv-uses-bot"
primary_region = "ams"

[build]
  dockerfile = "Dockerfile"

[env]
  HOME_WORLD = "Phantom"
  HOME_DC    = "Chaos"
  REGION     = "Europe"

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

- [ ] **Step 4: Commit**

```
git add bot/Dockerfile bot/.dockerignore bot/fly.toml
git commit -m "chore(bot): Dockerfile + fly.toml for deployment"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full repo typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. (The web app's tsconfig should not pick up `bot/` files because they're outside its `include`.)

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run --pool=forks`
Expected: all green (no new tests added; verifying no regression).

- [ ] **Step 3: Confirm bot typecheck**

Run: `cd bot && npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Done**

User can `cd bot && cp .env.example .env`, fill in `DISCORD_TOKEN` + `GUILD_ALLOWLIST`, then `npm run dev` to test locally. Deploy with `fly launch --no-deploy` (once) then `fly deploy` from `bot/`.
