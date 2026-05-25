# Discord Bot → Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Discord bot from a local discord.js gateway process to Vercel serverless functions, storing market cache in Vercel Blob and craft projects in Turso.

**Architecture:** Two API routes (`/api/discord.ts` for all Discord interactions, `/api/refresh-cache.ts` for hourly market data refresh) alongside the existing Vite React SPA. Bot logic moves from `bot/src/` to `src/bot/`, sharing dependencies with the frontend. discord.js is replaced by plain HTTP + `discord-interactions` for signature verification.

**Tech Stack:** Vercel Functions, Vercel Blob, Turso (libSQL), Groq (Llama 4 Scout), discord-interactions

**Spec:** `docs/superpowers/specs/2026-05-26-vercel-bot-migration-design.md`

---

## File Structure

### New files

```
api/
  discord.ts                 ← Discord interactions endpoint (signature verify + routing)
  refresh-cache.ts           ← Cache refresh (Universalis → Vercel Blob)
src/bot/
  llm.ts                     ← Groq-only LLM caller (simplified from openrouter.ts)
  llm.test.ts                ← Tests for LLM caller
  tools.ts                   ← Tool definitions + executor (reuses src/lib/)
  tools.test.ts              ← Tests for tool executor
  chatHandler.ts             ← Tool call loop (from chatRouter.ts, minus Discord deps)
  chatHandler.test.ts        ← Tests for chat handler
  systemPrompt.ts            ← Qiqirn personality (copy from bot/src/chat/)
  craftStore.ts              ← Turso-backed craft project DB (async version of store.ts)
  craftStore.test.ts         ← Tests for Turso craft store
  craftCommands.ts           ← /craft command handlers (adapted from bot/src/craft/commands.ts)
  craftInteractions.ts       ← Button/modal/select handlers (from bot/src/craft/interactions.ts)
  craftRender.ts             ← Embed/component builders (from bot/src/craft/render.ts)
  craftTypes.ts              ← Type definitions (copy from bot/src/craft/types.ts)
  craftStrings.ts            ← Spanish UI strings (copy from bot/src/craft/strings.ts)
  craftSourcing.ts           ← Recipe breakdown (from bot/src/craft/sourcing.ts)
  craftExplode.ts            ← Recipe tree explosion (from bot/src/craft/explode.ts)
  discordApi.ts              ← Discord REST API helpers (deferred response, edit, delete)
  discordApi.test.ts         ← Tests for Discord API helpers
  nameIndex.ts               ← Item name fuzzy search (copy from bot/src/chat/)
  loadSnapshots.ts           ← Snapshot loader (adapted from bot/src/loadSnapshots.ts)
  marketFetch.ts             ← Universalis batch fetcher (from bot/src/fetchMarketForOutputs.ts)
  marketCache.ts             ← Vercel Blob read/write for market cache
scripts/
  register-commands.ts       ← One-time command registration script
```

### Modified files

```
src/lib/universalis.ts       ← loadSharedMarketCache fetches from VITE_CACHE_BLOB_URL
package.json                 ← Add discord-interactions, @vercel/blob, @libsql/client
vercel.json                  ← Add maxDuration for API routes
```

---

## Task 1: Install dependencies and configure Vercel

**Files:**
- Modify: `package.json`
- Modify: `vercel.json`

- [ ] **Step 1: Install new dependencies**

```bash
npm install discord-interactions @vercel/blob @libsql/client
```

- [ ] **Step 2: Update vercel.json for API function config**

Add `functions` config for longer timeouts on the refresh endpoint. The existing SPA rewrite stays — Vercel auto-prioritizes `/api` routes over rewrites.

```json
{
  "functions": {
    "api/refresh-cache.ts": {
      "maxDuration": 300
    },
    "api/discord.ts": {
      "maxDuration": 60
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json vercel.json
git commit -m "chore: add Vercel bot dependencies and function config"
```

---

## Task 2: Discord API helpers (`src/bot/discordApi.ts`)

**Files:**
- Create: `src/bot/discordApi.ts`
- Create: `src/bot/discordApi.test.ts`

- [ ] **Step 1: Write tests for Discord API helpers**

```typescript
// src/bot/discordApi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deferredReply, editOriginal, deleteMessages, sendToChannel } from './discordApi';

beforeEach(() => { vi.restoreAllMocks(); });

describe('deferredReply', () => {
  it('PATCHes the follow-up URL with the provided content', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    await editOriginal('app123', 'token456', 'Hello world');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/webhooks/app123/token456/messages/@original');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ content: 'Hello world' });
  });
});

describe('deleteMessages', () => {
  it('calls bulkDelete for > 1 message', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    await deleteMessages('token', 'ch1', ['m1', 'm2']);

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/channels/ch1/messages/bulk-delete');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/bot/discordApi.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement Discord API helpers**

```typescript
// src/bot/discordApi.ts
const BASE = 'https://discord.com/api/v10';

function headers(botToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bot ${botToken}`,
  };
}

/** Edit the deferred "@original" message with final content. */
export async function editOriginal(
  appId: string,
  interactionToken: string,
  content: string,
): Promise<void> {
  const url = `${BASE}/webhooks/${appId}/${interactionToken}/messages/@original`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    console.error(`[discord] editOriginal failed ${res.status}:`, await res.text().catch(() => ''));
  }
}

/** Send a message to a channel. Returns the created message object. */
export async function sendToChannel(
  botToken: string,
  channelId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: headers(botToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

/** Edit a message in a channel. */
export async function editMessage(
  botToken: string,
  channelId: string,
  messageId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await fetch(`${BASE}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: headers(botToken),
    body: JSON.stringify(payload),
  });
}

/** Bulk-delete messages in a channel. */
export async function deleteMessages(
  botToken: string,
  channelId: string,
  messageIds: string[],
): Promise<void> {
  if (messageIds.length === 0) return;
  if (messageIds.length === 1) {
    await fetch(`${BASE}/channels/${channelId}/messages/${messageIds[0]}`, {
      method: 'DELETE',
      headers: headers(botToken),
    });
    return;
  }
  await fetch(`${BASE}/channels/${channelId}/messages/bulk-delete`, {
    method: 'POST',
    headers: headers(botToken),
    body: JSON.stringify({ messages: messageIds }),
  });
}

/** Create a thread on a message. Returns the thread channel object. */
export async function createThread(
  botToken: string,
  channelId: string,
  messageId: string,
  name: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/channels/${channelId}/messages/${messageId}/threads`, {
    method: 'POST',
    headers: headers(botToken),
    body: JSON.stringify({ name, auto_archive_duration: 10080 }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

/** Fetch messages from a channel (for /purge). */
export async function fetchMessages(
  botToken: string,
  channelId: string,
  limit: number,
): Promise<Array<{ id: string }>> {
  const res = await fetch(`${BASE}/channels/${channelId}/messages?limit=${limit}`, {
    headers: headers(botToken),
  });
  if (!res.ok) return [];
  return res.json() as Promise<Array<{ id: string }>>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/bot/discordApi.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/bot/discordApi.ts src/bot/discordApi.test.ts
git commit -m "feat(bot): add Discord REST API helpers"
```

---

## Task 3: Groq-only LLM caller (`src/bot/llm.ts`)

**Files:**
- Create: `src/bot/llm.ts`
- Create: `src/bot/llm.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/bot/llm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGroq, parseResponse } from './llm';

describe('parseResponse', () => {
  it('extracts native tool calls', () => {
    const raw = {
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'tc1',
            type: 'function' as const,
            function: { name: 'price_check', arguments: '{"item_name":"potion"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
    const parsed = parseResponse(raw);
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0].name).toBe('price_check');
    expect(parsed.toolCalls[0].args).toEqual({ item_name: 'potion' });
  });

  it('detects malformed <function=...> XML from Llama', () => {
    const raw = {
      choices: [{
        message: {
          role: 'assistant',
          content: '<function=price_check>{"item_name":"sword"}</function>',
        },
        finish_reason: 'stop',
      }],
    };
    const parsed = parseResponse(raw);
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0].name).toBe('price_check');
  });

  it('returns content when no tool calls', () => {
    const raw = {
      choices: [{
        message: { role: 'assistant', content: 'Hola aventurero!' },
        finish_reason: 'stop',
      }],
    };
    const parsed = parseResponse(raw);
    expect(parsed.content).toBe('Hola aventurero!');
    expect(parsed.toolCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/bot/llm.test.ts
```

- [ ] **Step 3: Implement Groq-only LLM caller**

```typescript
// src/bot/llm.ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface GroqResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
}

export interface ParsedResponse {
  content: string | null;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

export function parseResponse(raw: GroqResponse): ParsedResponse {
  const choice = raw.choices[0];
  if (!choice) return { content: null, toolCalls: [] };

  if (choice.message.tool_calls?.length) {
    const toolCalls = choice.message.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));
    return { content: choice.message.content, toolCalls };
  }

  // Detect malformed tool calls from Llama (XML pattern)
  const text = choice.message.content ?? '';
  const fnMatch = text.match(/<function=(\w+)>([\s\S]*?)<\/function>/);
  if (fnMatch) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(fnMatch[2]); } catch { /* empty args */ }
    const cleanContent = text.replace(/<function=\w+>[\s\S]*?<\/function>/g, '').trim() || null;
    return {
      content: cleanContent,
      toolCalls: [{ id: 'fn_' + Date.now(), name: fnMatch[1], args }],
    };
  }

  return { content: choice.message.content, toolCalls: [] };
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export async function callGroq(
  apiKey: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<GroqResponse> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<GroqResponse>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/bot/llm.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/bot/llm.ts src/bot/llm.test.ts
git commit -m "feat(bot): add Groq-only LLM caller"
```

---

## Task 4: Copy static bot modules

These files are copied from `bot/src/` with minimal or no changes. They don't need tests because they're already tested or are pure data.

**Files:**
- Create: `src/bot/systemPrompt.ts` (copy from `bot/src/chat/systemPrompt.ts`)
- Create: `src/bot/nameIndex.ts` (copy from `bot/src/chat/nameIndex.ts`)
- Create: `src/bot/craftTypes.ts` (copy from `bot/src/craft/types.ts`)
- Create: `src/bot/craftStrings.ts` (copy from `bot/src/craft/strings.ts`)
- Create: `src/bot/craftExplode.ts` (copy from `bot/src/craft/explode.ts`)
- Create: `src/bot/craftSourcing.ts` (copy from `bot/src/craft/sourcing.ts`)
- Create: `src/bot/craftRender.ts` (copy from `bot/src/craft/render.ts`)

- [ ] **Step 1: Copy systemPrompt.ts**

Copy `bot/src/chat/systemPrompt.ts` → `src/bot/systemPrompt.ts`. No changes needed — this file exports a plain string.

- [ ] **Step 2: Copy nameIndex.ts**

Copy `bot/src/chat/nameIndex.ts` → `src/bot/nameIndex.ts`. Update the import path for `SnapshotItem`:

Change: `import type { SnapshotItem } from '../../../src/lib/itemSnapshot';`
To: `import type { SnapshotItem } from '../lib/itemSnapshot';`

- [ ] **Step 3: Copy craft type/string/utility files**

Copy the following files from `bot/src/craft/` → `src/bot/`:
- `types.ts` → `craftTypes.ts`
- `strings.ts` → `craftStrings.ts`
- `explode.ts` → `craftExplode.ts`
- `sourcing.ts` → `craftSourcing.ts`
- `render.ts` → `craftRender.ts`

Update all import paths from `../../../src/...` to `../...` patterns (these files imported from the root `src/` via relative paths — now they're inside `src/` themselves).

Also update cross-references: `./types` → `./craftTypes`, `./strings` → `./craftStrings`, etc.

The render module (`craftRender.ts`) uses discord.js `EmbedBuilder`, `ActionRowBuilder`, `ButtonBuilder`, `StringSelectMenuBuilder`. Replace these with plain JSON objects that match the Discord API embed/component format. The structure is the same — discord.js builders just produce JSON. Example:

Replace:
```typescript
new EmbedBuilder().setTitle('foo').setColor(0x00ff00)
```
With:
```typescript
{ title: 'foo', color: 0x00ff00 }
```

Replace `ActionRowBuilder`/`ButtonBuilder`/`StringSelectMenuBuilder` with plain component objects:
```typescript
{ type: 1, components: [{ type: 2, style: 1, label: 'Click', custom_id: 'btn1' }] }
```

Refer to Discord API docs: Component type 1 = action row, 2 = button, 3 = string select. Button style 1 = primary, 2 = secondary, 4 = danger.

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/bot/systemPrompt.ts src/bot/nameIndex.ts src/bot/craftTypes.ts src/bot/craftStrings.ts src/bot/craftExplode.ts src/bot/craftSourcing.ts src/bot/craftRender.ts
git commit -m "feat(bot): copy static bot modules to src/bot/"
```

---

## Task 5: Snapshot loader and market fetcher (`src/bot/loadSnapshots.ts`, `src/bot/marketFetch.ts`)

**Files:**
- Create: `src/bot/loadSnapshots.ts` (adapted from `bot/src/loadSnapshots.ts`)
- Create: `src/bot/marketFetch.ts` (adapted from `bot/src/fetchMarketForOutputs.ts`)

- [ ] **Step 1: Implement loadSnapshots.ts**

Adapt `bot/src/loadSnapshots.ts` to work in Vercel's serverless environment. The snapshots are static JSON files in `public/data/snapshots/`. In Vercel, these are served as static assets, so we fetch them via HTTP instead of `fs.readFile`.

```typescript
// src/bot/loadSnapshots.ts
import type { SnapshotItem } from '../lib/itemSnapshot';
import type { Recipe } from '../lib/recipes';

export interface BotSnapshots {
  itemsById: Map<number, SnapshotItem>;
  namesById: Map<number, string>;
  recipes: Map<number, Recipe>;
  vendorMap: Map<number, number>;
  gatheringCatalog: Map<number, { level: number; timed: boolean }>;
}

let cached: BotSnapshots | null = null;

/**
 * Load snapshot data. In Vercel, fetches from the app's own static files.
 * Caches in module scope so subsequent invocations within the same function
 * instance reuse the parsed data.
 */
export async function loadSnapshots(baseUrl: string): Promise<BotSnapshots> {
  if (cached) return cached;

  const [itemsRaw, recipesRaw, vendorRaw, gatherRaw] = await Promise.all([
    fetch(`${baseUrl}/data/snapshots/items.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/recipes.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/vendorShop.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/gathering.json`).then(r => r.json()),
  ]);

  const itemsById = new Map<number, SnapshotItem>();
  const namesById = new Map<number, string>();
  for (const item of (itemsRaw as { items: SnapshotItem[] }).items) {
    itemsById.set(item.id, item);
    namesById.set(item.id, item.name);
  }

  const recipes = new Map<number, Recipe>();
  for (const [id, recipe] of (recipesRaw as { entries: [number, Recipe][] }).entries) {
    recipes.set(id, recipe);
  }

  const vendorMap = new Map<number, number>();
  for (const [id, price] of (vendorRaw as { entries: [number, number][] }).entries) {
    vendorMap.set(id, price);
  }

  const gatheringCatalog = new Map<number, { level: number; timed: boolean }>();
  for (const [id, info] of (gatherRaw as { entries: [number, { level: number; timed: boolean }][] }).entries) {
    gatheringCatalog.set(id, info);
  }

  cached = { itemsById, namesById, recipes, vendorMap, gatheringCatalog };
  return cached;
}
```

- [ ] **Step 2: Implement marketFetch.ts**

Adapt `bot/src/fetchMarketForOutputs.ts`. Same batch logic, same Universalis API calls. Remove the progress bar (no terminal in serverless).

```typescript
// src/bot/marketFetch.ts
import { parseMarketResponse, type MarketData } from '../lib/universalis';

const BATCH_SIZE = 100;
const MAX_CONCURRENT = 8;

async function fetchBatch(scope: string, ids: number[]): Promise<MarketData> {
  const url = `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=10&entries=15`;
  let res = await fetch(url);
  if (!res.ok) {
    await new Promise(r => setTimeout(r, 400));
    res = await fetch(url);
  }
  if (!res.ok) return {};
  const raw = await res.json();
  return parseMarketResponse(raw as Parameters<typeof parseMarketResponse>[0]);
}

async function fetchScope(scope: string, batches: number[][]): Promise<MarketData> {
  const merged: MarketData = {};
  const queue = [...batches];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const idx = cursor++;
      const batch = queue[idx];
      const result = await fetchBatch(scope, batch);
      Object.assign(merged, result);
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => worker());
  await Promise.all(workers);
  return merged;
}

export interface MarketBundle {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
}

export async function fetchMarketForOutputs(
  ids: number[],
  world: string,
  dc: string,
  region: string,
): Promise<MarketBundle> {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  const batches: number[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    batches.push(unique.slice(i, i + BATCH_SIZE));
  }

  const [phantom, dcData, regionData] = await Promise.all([
    fetchScope(world, batches),
    fetchScope(dc, batches),
    fetchScope(region, batches),
  ]);

  return { phantom, dc: dcData, region: regionData };
}
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/bot/loadSnapshots.ts src/bot/marketFetch.ts
git commit -m "feat(bot): add snapshot loader and market fetcher for Vercel"
```

---

## Task 6: Market cache on Vercel Blob (`src/bot/marketCache.ts`)

**Files:**
- Create: `src/bot/marketCache.ts`
- Modify: `src/lib/universalis.ts`

- [ ] **Step 1: Implement Blob read/write for market cache**

```typescript
// src/bot/marketCache.ts
import { put } from '@vercel/blob';
import type { MarketData } from '../lib/universalis';

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

export async function writeMarketCache(cache: SharedCache): Promise<string> {
  const blob = await put('market-cache.json', JSON.stringify(cache), {
    access: 'public',
    addRandomSuffix: false,
  });
  return blob.url;
}
```

- [ ] **Step 2: Update loadSharedMarketCache to use Blob URL**

In `src/lib/universalis.ts`, change `loadSharedMarketCache` to accept a URL parameter:

Find in `src/lib/universalis.ts`:
```typescript
    const res = await fetch('/data/market-cache.json');
```

Replace with:
```typescript
    const cacheUrl = (import.meta as any).env?.VITE_CACHE_BLOB_URL || '/data/market-cache.json';
    const res = await fetch(cacheUrl);
```

This falls back to the local file if the env var isn't set (local dev).

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/bot/marketCache.ts src/lib/universalis.ts
git commit -m "feat: market cache read/write via Vercel Blob"
```

---

## Task 7: Tools and chat handler (`src/bot/tools.ts`, `src/bot/chatHandler.ts`)

**Files:**
- Create: `src/bot/tools.ts`
- Create: `src/bot/tools.test.ts`
- Create: `src/bot/chatHandler.ts`
- Create: `src/bot/chatHandler.test.ts`

- [ ] **Step 1: Write tool executor tests**

```typescript
// src/bot/tools.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeArgs, TOOL_DEFINITIONS } from './tools';

describe('sanitizeArgs', () => {
  it('coerces string numbers to numbers', () => {
    expect(sanitizeArgs({ limit: '5' })).toEqual({ limit: 5 });
  });

  it('strips empty string values', () => {
    expect(sanitizeArgs({ category: '', limit: 3 })).toEqual({ limit: 3 });
  });
});

describe('TOOL_DEFINITIONS', () => {
  it('exports 4 tool definitions', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(4);
    const names = TOOL_DEFINITIONS.map(t => t.function.name);
    expect(names).toContain('price_check');
    expect(names).toContain('craft_flip_search');
    expect(names).toContain('best_deals');
    expect(names).toContain('vendor_flip_search');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/bot/tools.test.ts
```

- [ ] **Step 3: Implement tools.ts**

Port `bot/src/chat/tools.ts` lines 18-429 (category mapping, tool definitions, tool executor, sanitizeArgs). Remove the cache system (cachedMarketFetch, warmup, disk persistence) — the tools now receive pre-loaded market data as a parameter instead of managing their own cache.

Key changes from the original:
- `executeTool()` takes a `deps` object with `{ marketBundle, snapshots, nameIndex }` instead of accessing global cache
- Tool handlers (`priceCheck`, `craftFlipSearch`, `bestDealsSearch`, `vendorFlipSearch`) use `deps.marketBundle` instead of `cachedMarketFetch()`
- Export `TOOL_DEFINITIONS` array and `executeTool()` function
- Export `sanitizeArgs()` for testing
- Copy the category mapping, tool definitions, and all 4 tool handler functions from the original

The tool definitions and handler logic are identical to `bot/src/chat/tools.ts` lines 242-429. The only difference is how market data is accessed.

- [ ] **Step 4: Write chatHandler tests**

```typescript
// src/bot/chatHandler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { stripLeakedMarkup } from './chatHandler';

describe('stripLeakedMarkup', () => {
  it('removes <function=...> XML tags', () => {
    const input = 'Hello <function=price_check>{"item":"sword"}</function> world';
    expect(stripLeakedMarkup(input)).toBe('Hello  world');
  });

  it('returns original text when no markup', () => {
    expect(stripLeakedMarkup('Just a normal message')).toBe('Just a normal message');
  });
});
```

- [ ] **Step 5: Implement chatHandler.ts**

Port the tool call loop from `bot/src/chat/chatRouter.ts`. This is the core `/oye` logic extracted from Discord-specific code:

```typescript
// src/bot/chatHandler.ts
import { callGroq, parseResponse, type ChatMessage, type ToolDefinition } from './llm';
import { TOOL_DEFINITIONS, executeTool, type ToolDeps } from './tools';
import { SYSTEM_PROMPT } from './systemPrompt';

const MAX_ITERATIONS = 5;
const CAT_GIFS = [
  'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
  'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
  'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',
  'https://media.giphy.com/media/VbnUQpnihPSIgIXuZv/giphy.gif',
  'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif',
];
const CAT_CHANCE = 0.15;

export function stripLeakedMarkup(text: string): string {
  return text.replace(/<function=\w+>[\s\S]*?<\/function>/g, '');
}

export async function handleChat(
  question: string,
  groqApiKey: string,
  deps: ToolDeps,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const raw = await callGroq(groqApiKey, messages, TOOL_DEFINITIONS);
    const parsed = parseResponse(raw);

    // Hallucination guard: if LLM mentions prices without calling tools, force retry
    if (parsed.toolCalls.length === 0 && parsed.content) {
      const looksLikeMarketData = /\d{2,}[\s.,]*gil/i.test(parsed.content);
      if (looksLikeMarketData && i === 0) {
        messages.push(
          { role: 'assistant', content: parsed.content },
          { role: 'user', content: 'Usa tus herramientas antes de hablar de precios. No inventes datos.' },
        );
        continue;
      }
    }

    if (parsed.toolCalls.length === 0) {
      let text = parsed.content ?? 'Qiqirn no sabe qué decir...';
      text = stripLeakedMarkup(text).trim();
      if (!text) text = 'Qiqirn no sabe qué decir...';

      // Cat GIF easter egg
      if (Math.random() < CAT_CHANCE) {
        const gif = CAT_GIFS[Math.floor(Math.random() * CAT_GIFS.length)];
        text += `\n${gif}`;
      }
      return text;
    }

    // Build assistant message with tool_calls for the message history
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: parsed.content,
      tool_calls: parsed.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    };
    messages.push(assistantMsg);

    // Execute each tool and add results
    for (const tc of parsed.toolCalls) {
      const result = await executeTool(tc.name, tc.args, deps);
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
        name: tc.name,
      });
    }
  }

  return 'Qiqirn se cansó de pensar... intenta otra vez.';
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/bot/tools.test.ts src/bot/chatHandler.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/bot/tools.ts src/bot/tools.test.ts src/bot/chatHandler.ts src/bot/chatHandler.test.ts
git commit -m "feat(bot): add tool executor and chat handler for /oye"
```

---

## Task 8: Turso craft store (`src/bot/craftStore.ts`)

**Files:**
- Create: `src/bot/craftStore.ts`
- Create: `src/bot/craftStore.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/bot/craftStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from './craftStore';

let store: CraftStore;

beforeEach(async () => {
  // Use in-memory libSQL for tests
  store = await openCraftStore(':memory:');
});

describe('craftStore', () => {
  it('creates a project and retrieves it', async () => {
    const id = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 5, createdBy: 'u1',
    });
    expect(id).toBeGreaterThan(0);
    const project = await store.getProject(id);
    expect(project).not.toBeNull();
    expect(project!.name).toBe('Test');
    expect(project!.status).toBe('open');
  });

  it('adds tasks and lists them', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 1, targetQty: 1, createdBy: 'u1',
    });
    await store.addTasks(pid, [
      { itemId: 10, itemName: 'Iron Ore', qtyNeeded: 5, source: 'gather', meta: {} },
      { itemId: 20, itemName: 'Iron Ingot', qtyNeeded: 2, source: 'craft', meta: { job: 'BSM' } },
    ]);
    const tasks = await store.getTasks(pid);
    expect(tasks).toHaveLength(2);
  });

  it('claims and unclaims a task', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 1, targetQty: 1, createdBy: 'u1',
    });
    await store.addTasks(pid, [
      { itemId: 10, itemName: 'Ore', qtyNeeded: 5, source: 'market', meta: {} },
    ]);
    const tasks = await store.getTasks(pid);
    const claimed = await store.claimTask(tasks[0].id, 'user1');
    expect(claimed).toBe(true);
    const unclaimed = await store.unclaimTask(tasks[0].id, 'user1');
    expect(unclaimed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/bot/craftStore.test.ts
```

- [ ] **Step 3: Implement Turso-backed craft store**

Port `bot/src/craft/store.ts` from better-sqlite3 to `@libsql/client`. Same schema, same queries, all methods become async.

```typescript
// src/bot/craftStore.ts
import { createClient, type Client } from '@libsql/client';
import type { CraftProject, StoredTask, CraftTask, CraftTaskMeta, ChannelState } from './craftTypes';

export interface CraftStore {
  createProject(p: { guildId: string; channelId: string; name: string; targetItemId: number; targetQty: number; createdBy: string }): Promise<number>;
  addTasks(projectId: number, tasks: CraftTask[]): Promise<void>;
  getProject(id: number): Promise<CraftProject | null>;
  getTasks(projectId: number): Promise<StoredTask[]>;
  listOpenProjects(guildId: string): Promise<CraftProject[]>;
  claimTask(taskId: number, userId: string): Promise<boolean>;
  logProgress(taskId: number, userId: string, amount: number): Promise<StoredTask | null>;
  unclaimTask(taskId: number, userId: string): Promise<boolean>;
  setProjectMessageId(projectId: number, messageId: string): Promise<void>;
  setProjectThreadId(projectId: number, threadId: string): Promise<void>;
  closeProject(projectId: number): Promise<void>;
  getChannelState(guildId: string, channelId: string): Promise<ChannelState | null>;
  upsertChannelState(state: ChannelState): Promise<void>;
}

function rowToProject(row: Record<string, unknown>): CraftProject {
  return {
    id: row.id as number,
    guildId: row.guild_id as string,
    channelId: row.channel_id as string,
    messageId: (row.message_id as string) ?? null,
    name: row.name as string,
    targetItemId: row.target_item_id as number,
    targetQty: row.target_qty as number,
    createdBy: row.created_by as string,
    threadId: (row.thread_id as string) ?? null,
    status: row.status as 'open' | 'closed',
    createdAt: row.created_at as number,
  };
}

function rowToTask(row: Record<string, unknown>): StoredTask {
  return {
    id: row.id as number,
    projectId: row.project_id as number,
    itemId: row.item_id as number,
    itemName: row.item_name as string,
    qtyNeeded: row.qty_needed as number,
    qtyDone: row.qty_done as number,
    source: row.source as StoredTask['source'],
    meta: row.meta ? JSON.parse(row.meta as string) as CraftTaskMeta : null,
    assigneeId: (row.assignee_id as string) ?? null,
    status: row.status as StoredTask['status'],
    updatedAt: row.updated_at as number,
  };
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
    message_id TEXT, name TEXT NOT NULL, target_item_id INTEGER NOT NULL,
    target_qty INTEGER NOT NULL, created_by TEXT NOT NULL, thread_id TEXT,
    status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
    item_id INTEGER NOT NULL, item_name TEXT NOT NULL, qty_needed INTEGER NOT NULL,
    qty_done INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, meta TEXT,
    assignee_id TEXT, status TEXT NOT NULL DEFAULT 'open', updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS channel_state (
    guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
    board_message_id TEXT, request_message_id TEXT,
    PRIMARY KEY (guild_id, channel_id)
  );
`;

export async function openCraftStore(urlOrPath: string): Promise<CraftStore> {
  const db: Client = urlOrPath === ':memory:'
    ? createClient({ url: 'file::memory:' })
    : createClient({
        url: urlOrPath,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });

  // Run schema migration
  for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }

  return {
    async createProject(p) {
      const result = await db.execute({
        sql: 'INSERT INTO projects (guild_id, channel_id, name, target_item_id, target_qty, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [p.guildId, p.channelId, p.name, p.targetItemId, p.targetQty, p.createdBy, Date.now()],
      });
      return Number(result.lastInsertRowid);
    },

    async addTasks(projectId, tasks) {
      const now = Date.now();
      for (const t of tasks) {
        await db.execute({
          sql: 'INSERT INTO tasks (project_id, item_id, item_name, qty_needed, source, meta, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [projectId, t.itemId, t.itemName, t.qtyNeeded, t.source, t.meta ? JSON.stringify(t.meta) : null, now],
        });
      }
    },

    async getProject(id) {
      const { rows } = await db.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [id] });
      return rows[0] ? rowToProject(rows[0] as Record<string, unknown>) : null;
    },

    async getTasks(projectId) {
      const { rows } = await db.execute({ sql: 'SELECT * FROM tasks WHERE project_id = ? ORDER BY source, item_name', args: [projectId] });
      return rows.map(r => rowToTask(r as Record<string, unknown>));
    },

    async listOpenProjects(guildId) {
      const { rows } = await db.execute({ sql: "SELECT * FROM projects WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC", args: [guildId] });
      return rows.map(r => rowToProject(r as Record<string, unknown>));
    },

    async claimTask(taskId, userId) {
      const { rowsAffected } = await db.execute({
        sql: "UPDATE tasks SET assignee_id = ?, status = 'claimed', updated_at = ? WHERE id = ? AND status = 'open'",
        args: [userId, Date.now(), taskId],
      });
      return rowsAffected > 0;
    },

    async logProgress(taskId, userId, amount) {
      const { rows } = await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ?', args: [taskId] });
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row || row.assignee_id !== userId) return null;
      const newDone = Math.min(row.qty_needed as number, (row.qty_done as number) + amount);
      const newStatus = newDone >= (row.qty_needed as number) ? 'done' : 'claimed';
      await db.execute({
        sql: 'UPDATE tasks SET qty_done = ?, status = ?, updated_at = ? WHERE id = ?',
        args: [newDone, newStatus, Date.now(), taskId],
      });
      return rowToTask({ ...row, qty_done: newDone, status: newStatus, updated_at: Date.now() });
    },

    async unclaimTask(taskId, userId) {
      const { rowsAffected } = await db.execute({
        sql: "UPDATE tasks SET assignee_id = NULL, status = 'open', updated_at = ? WHERE id = ? AND assignee_id = ?",
        args: [Date.now(), taskId, userId],
      });
      return rowsAffected > 0;
    },

    async setProjectMessageId(projectId, messageId) {
      await db.execute({ sql: 'UPDATE projects SET message_id = ? WHERE id = ?', args: [messageId, projectId] });
    },

    async setProjectThreadId(projectId, threadId) {
      await db.execute({ sql: 'UPDATE projects SET thread_id = ? WHERE id = ?', args: [threadId, projectId] });
    },

    async closeProject(projectId) {
      await db.execute({ sql: "UPDATE projects SET status = 'closed' WHERE id = ?", args: [projectId] });
    },

    async getChannelState(guildId, channelId) {
      const { rows } = await db.execute({ sql: 'SELECT * FROM channel_state WHERE guild_id = ? AND channel_id = ?', args: [guildId, channelId] });
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return { guildId: row.guild_id as string, channelId: row.channel_id as string, boardMessageId: (row.board_message_id as string) ?? null, requestMessageId: (row.request_message_id as string) ?? null };
    },

    async upsertChannelState(state) {
      await db.execute({
        sql: 'INSERT INTO channel_state (guild_id, channel_id, board_message_id, request_message_id) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, channel_id) DO UPDATE SET board_message_id = ?, request_message_id = ?',
        args: [state.guildId, state.channelId, state.boardMessageId, state.requestMessageId, state.boardMessageId, state.requestMessageId],
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/bot/craftStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/bot/craftStore.ts src/bot/craftStore.test.ts
git commit -m "feat(bot): add Turso-backed craft store"
```

---

## Task 9: Craft command and interaction handlers (`src/bot/craftCommands.ts`, `src/bot/craftInteractions.ts`)

**Files:**
- Create: `src/bot/craftCommands.ts` (adapted from `bot/src/craft/commands.ts`)
- Create: `src/bot/craftInteractions.ts` (adapted from `bot/src/craft/interactions.ts`)

- [ ] **Step 1: Port craftCommands.ts**

Adapt `bot/src/craft/commands.ts` to work without discord.js. Key changes:

- Replace `ChatInputCommandInteraction` parameter with a plain object containing the parsed interaction data (options, user, guild, channel)
- Replace `interaction.reply()` / `interaction.editReply()` with returns — the caller (`/api/discord.ts`) handles the Discord response
- Replace `interaction.options.getString()` etc. with plain property access from parsed options
- All store calls become `await` (Turso is async)
- Replace discord.js embed builders with plain JSON objects (same as Task 4's render changes)
- Keep the core logic identical: explode recipe tree, fetch market, build breakdown, create project

Each handler returns a response payload (content + embeds + components) instead of calling Discord directly. The API route handles sending it.

- [ ] **Step 2: Port craftInteractions.ts**

Adapt `bot/src/craft/interactions.ts`. Same approach:

- Replace discord.js interaction objects with plain parsed data
- Button/modal/select handlers return response payloads instead of calling `interaction.reply()`
- All store calls become `await`
- The `refreshEmbed` helper returns the new embed/components payload; the API route PATCHes the message
- The `sendThreadNote` helper calls `discordApi.sendToChannel()` instead of `client.channels.fetch()`
- `parseCustomId()` stays the same — it just parses strings

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/bot/craftCommands.ts src/bot/craftInteractions.ts
git commit -m "feat(bot): add craft command and interaction handlers"
```

---

## Task 10: Cache refresh API route (`/api/refresh-cache.ts`)

**Files:**
- Create: `api/refresh-cache.ts`

- [ ] **Step 1: Implement the cache refresh endpoint**

```typescript
// api/refresh-cache.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchMarketForOutputs } from '../src/bot/marketFetch';
import { writeMarketCache } from '../src/bot/marketCache';
import { loadSnapshots } from '../src/bot/loadSnapshots';

const WORLD = process.env.HOME_WORLD ?? 'Phantom';
const DC = process.env.HOME_DC ?? 'Chaos';
const REGION = process.env.REGION ?? 'Europe';
const SECRET = process.env.REFRESH_SECRET ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET with valid secret
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SECRET || req.query.token !== SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const t0 = Date.now();
  try {
    // Determine base URL for fetching snapshots from our own static files
    const proto = req.headers['x-forwarded-proto'] ?? 'https';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
    const baseUrl = `${proto}://${host}`;

    const snapshots = await loadSnapshots(baseUrl);
    const ids = [...snapshots.itemsById.keys()];

    console.log(`[refresh] fetching ${ids.length} items across 3 scopes...`);
    const bundle = await fetchMarketForOutputs(ids, WORLD, DC, REGION);

    const cache = {
      phantom: bundle.phantom,
      dc: bundle.dc,
      region: bundle.region,
      ts: Date.now(),
    };
    const blobUrl = await writeMarketCache(cache);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[refresh] done in ${elapsed}s, ${ids.length} items, blob: ${blobUrl}`);
    return res.status(200).json({ ok: true, items: ids.length, elapsed: `${elapsed}s`, blobUrl });
  } catch (e) {
    console.error('[refresh] error:', e);
    return res.status(500).json({ error: (e as Error).message });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/refresh-cache.ts
git commit -m "feat: add cache refresh API route"
```

---

## Task 11: Discord interactions endpoint (`/api/discord.ts`)

**Files:**
- Create: `api/discord.ts`

- [ ] **Step 1: Implement the Discord interactions endpoint**

This is the main router. It verifies signatures, handles PING, defers most commands, and dispatches to handlers via `waitUntil()`.

```typescript
// api/discord.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyKey } from 'discord-interactions';
import { waitUntil } from '@vercel/functions';
import { handleChat } from '../src/bot/chatHandler';
import { editOriginal, deleteMessages, fetchMessages, sendToChannel } from '../src/bot/discordApi';
import { loadSnapshots } from '../src/bot/loadSnapshots';
import { buildNameIndex } from '../src/bot/nameIndex';
import type { MarketData } from '../src/lib/universalis';

const APP_ID = process.env.DISCORD_APP_ID!;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GROQ_KEY = process.env.GROQ_API_KEY!;
const GUILD_ALLOWLIST = (process.env.GUILD_ALLOWLIST ?? '').split(',').filter(Boolean);
const CACHE_BLOB_URL = process.env.VITE_CACHE_BLOB_URL ?? '';

// Interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const APPLICATION_COMMAND_AUTOCOMPLETE = 4;
const MODAL_SUBMIT = 5;

// Response types
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;
const DEFERRED_UPDATE_MESSAGE = 6;
const UPDATE_MESSAGE = 7;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verify Discord signature
  const signature = req.headers['x-signature-ed25519'] as string;
  const timestamp = req.headers['x-signature-timestamp'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!signature || !timestamp || !verifyKey(rawBody, signature, timestamp, PUBLIC_KEY)) {
    return res.status(401).end('Invalid signature');
  }

  const interaction = req.body;

  // Handle PING
  if (interaction.type === PING) {
    return res.status(200).json({ type: PONG });
  }

  // Guild allowlist check
  if (GUILD_ALLOWLIST.length > 0 && !GUILD_ALLOWLIST.includes(interaction.guild_id)) {
    return res.status(200).json({ type: CHANNEL_MESSAGE, data: { content: 'Not allowed in this server.', flags: 64 } });
  }

  const token = interaction.token;

  // APPLICATION_COMMAND — slash commands
  if (interaction.type === APPLICATION_COMMAND) {
    const name = interaction.data.name;

    if (name === 'oye') {
      const question = interaction.data.options?.[0]?.value as string ?? '';
      // Defer and process in background
      res.status(200).json({ type: DEFERRED_CHANNEL_MESSAGE });
      waitUntil(handleOye(question, token));
      return;
    }

    if (name === 'purge') {
      const amount = interaction.data.options?.[0]?.value as number ?? 100;
      const channelId = interaction.channel_id;
      // Check permissions (ManageMessages = 0x2000)
      const perms = BigInt(interaction.member?.permissions ?? '0');
      if (!(perms & 0x2000n)) {
        return res.status(200).json({ type: CHANNEL_MESSAGE, data: { content: 'Need Manage Messages permission.', flags: 64 } });
      }
      res.status(200).json({ type: DEFERRED_CHANNEL_MESSAGE, data: { flags: 64 } });
      waitUntil(handlePurge(channelId, amount, token));
      return;
    }

    if (name === 'craft') {
      res.status(200).json({ type: DEFERRED_CHANNEL_MESSAGE });
      waitUntil(handleCraftCommand(interaction, token));
      return;
    }

    if (name === 'cleanup') {
      res.status(200).json({ type: DEFERRED_CHANNEL_MESSAGE });
      waitUntil(handleCleanup(interaction, token));
      return;
    }

    return res.status(200).json({ type: CHANNEL_MESSAGE, data: { content: 'Unknown command.', flags: 64 } });
  }

  // MESSAGE_COMPONENT — buttons and select menus
  if (interaction.type === MESSAGE_COMPONENT) {
    const customId = interaction.data.custom_id as string;
    if (customId.startsWith('cproj:')) {
      res.status(200).json({ type: DEFERRED_UPDATE_MESSAGE });
      waitUntil(handleCraftInteraction(interaction, token));
      return;
    }
    return res.status(200).json({ type: UPDATE_MESSAGE });
  }

  // MODAL_SUBMIT
  if (interaction.type === MODAL_SUBMIT) {
    const customId = interaction.data.custom_id as string;
    if (customId.startsWith('cproj:')) {
      res.status(200).json({ type: DEFERRED_CHANNEL_MESSAGE });
      waitUntil(handleCraftModal(interaction, token));
      return;
    }
    return res.status(200).json({ type: CHANNEL_MESSAGE, data: { content: 'OK', flags: 64 } });
  }

  // APPLICATION_COMMAND_AUTOCOMPLETE
  if (interaction.type === APPLICATION_COMMAND_AUTOCOMPLETE) {
    const snapshots = await loadSnapshots(getBaseUrl(req));
    const nameIndex = buildNameIndex(snapshots.itemsById);
    const focused = interaction.data.options
      ?.flatMap((o: any) => o.options ?? [o])
      .find((o: any) => o.focused);
    const query = (focused?.value as string ?? '').toLowerCase();
    // Return up to 25 autocomplete choices
    const matches = nameIndex._entries
      .filter(e => e.lower.includes(query))
      .slice(0, 25)
      .map(e => ({ name: e.name, value: e.name }));
    return res.status(200).json({ type: 8, data: { choices: matches } });
  }

  return res.status(200).json({ type: CHANNEL_MESSAGE, data: { content: 'Unhandled interaction type.', flags: 64 } });
}

function getBaseUrl(req: VercelRequest): string {
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

async function loadMarketCache(): Promise<{ phantom: MarketData; dc: MarketData; region: MarketData }> {
  if (!CACHE_BLOB_URL) return { phantom: {}, dc: {}, region: {} };
  try {
    const res = await fetch(CACHE_BLOB_URL);
    if (!res.ok) return { phantom: {}, dc: {}, region: {} };
    const data = await res.json() as { phantom: MarketData; dc: MarketData; region: MarketData };
    return data;
  } catch {
    return { phantom: {}, dc: {}, region: {} };
  }
}

async function handleOye(question: string, interactionToken: string): Promise<void> {
  try {
    // Load dependencies — these are cached in module scope across invocations
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const [snapshots, market] = await Promise.all([
      loadSnapshots(baseUrl),
      loadMarketCache(),
    ]);
    const nameIndex = buildNameIndex(snapshots.itemsById);
    const deps = { marketBundle: market, snapshots, nameIndex };
    const reply = await handleChat(question, GROQ_KEY, deps);
    await editOriginal(APP_ID, interactionToken, reply);
  } catch (e) {
    console.error('[oye] error:', e);
    await editOriginal(APP_ID, interactionToken, 'Qiqirn se tropezó... intenta otra vez.');
  }
}

async function handlePurge(channelId: string, amount: number, interactionToken: string): Promise<void> {
  try {
    const msgs = await fetchMessages(BOT_TOKEN, channelId, amount);
    if (msgs.length === 0) {
      await editOriginal(APP_ID, interactionToken, 'No messages to delete.');
      return;
    }
    await deleteMessages(BOT_TOKEN, channelId, msgs.map(m => m.id));
    await editOriginal(APP_ID, interactionToken, `Deleted ${msgs.length} messages.`);
  } catch (e) {
    console.error('[purge] error:', e);
    await editOriginal(APP_ID, interactionToken, 'Failed to purge messages.');
  }
}

// Placeholder — will be fully wired in Task 9's craftCommands.ts
async function handleCraftCommand(interaction: any, interactionToken: string): Promise<void> {
  // TODO: Wire to craftCommands.ts handlers
  await editOriginal(APP_ID, interactionToken, 'Craft commands coming soon.');
}

async function handleCraftInteraction(interaction: any, interactionToken: string): Promise<void> {
  // TODO: Wire to craftInteractions.ts handlers
}

async function handleCraftModal(interaction: any, interactionToken: string): Promise<void> {
  // TODO: Wire to craftInteractions.ts handlers
}

async function handleCleanup(interaction: any, interactionToken: string): Promise<void> {
  // TODO: Port cleanup logic
  await editOriginal(APP_ID, interactionToken, 'Cleanup coming soon.');
}
```

Note: The `handleCraftCommand`, `handleCraftInteraction`, `handleCraftModal`, and `handleCleanup` functions are stubs. They'll be fully wired once the craft command handlers from Task 9 are integrated. The core `/oye` and `/purge` flows are complete.

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add api/discord.ts
git commit -m "feat: add Discord interactions API endpoint"
```

---

## Task 12: Command registration script

**Files:**
- Create: `scripts/register-commands.ts`

- [ ] **Step 1: Implement the registration script**

```typescript
// scripts/register-commands.ts
// Run: npx tsx --env-file=.env scripts/register-commands.ts

const APP_ID = process.env.DISCORD_APP_ID!;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;

const commands = [
  {
    name: 'oye',
    description: 'Pregunta a Qiqirn sobre el mercado',
    options: [{ type: 3, name: 'question', description: 'Tu pregunta', required: true }],
  },
  {
    name: 'craft',
    description: 'Coordinar proyectos de crafteo',
    options: [
      {
        type: 1, name: 'new', description: 'Crear proyecto',
        options: [
          { type: 3, name: 'item', description: 'Item a craftear', required: true, autocomplete: true },
          { type: 4, name: 'qty', description: 'Cantidad', required: true, min_value: 1 },
          { type: 3, name: 'name', description: 'Nombre del proyecto', required: false },
          { type: 5, name: 'intermediates', description: 'Incluir intermedios', required: false },
          { type: 8, name: 'ping_role', description: 'Rol a mencionar', required: false },
        ],
      },
      { type: 1, name: 'list', description: 'Ver proyectos abiertos' },
      { type: 1, name: 'show', description: 'Ver proyecto', options: [{ type: 4, name: 'id', description: 'ID del proyecto', required: true }] },
      { type: 1, name: 'close', description: 'Cerrar proyecto', options: [{ type: 4, name: 'id', description: 'ID del proyecto', required: true }] },
      { type: 1, name: 'setup', description: 'Configurar canal de craft (admin)' },
    ],
  },
  {
    name: 'cleanup',
    description: 'Analizar inventario CSV',
    options: [{ type: 11, name: 'csv', description: 'Archivo CSV de inventario', required: true }],
  },
  {
    name: 'purge',
    description: 'Borrar mensajes (admin)',
    options: [{ type: 4, name: 'amount', description: 'Cantidad (1-100)', required: false, min_value: 1, max_value: 100 }],
  },
];

async function main() {
  const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${BOT_TOKEN}`,
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    console.error('Failed:', res.status, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  console.log(`Registered ${(data as unknown[]).length} commands globally.`);
}

main();
```

- [ ] **Step 2: Add npm script**

In `package.json`, add:
```json
"register-commands": "tsx --env-file=.env scripts/register-commands.ts"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/register-commands.ts package.json
git commit -m "feat: add command registration script"
```

---

## Task 13: Wire craft command stubs and final integration

**Files:**
- Modify: `api/discord.ts` (wire craft stubs to real handlers)

- [ ] **Step 1: Wire handleCraftCommand to craftCommands.ts**

Replace the stub `handleCraftCommand` in `api/discord.ts` with real logic that:
1. Loads snapshots, market cache, and name index
2. Opens the Turso craft store
3. Parses the subcommand from `interaction.data.options[0].name`
4. Delegates to the appropriate handler from `craftCommands.ts`
5. Sends the response payload via `editOriginal` or `sendToChannel`

- [ ] **Step 2: Wire handleCraftInteraction and handleCraftModal**

Replace the stubs with real logic that parses `customId`, loads the craft store, delegates to `craftInteractions.ts` handlers, and sends responses.

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add api/discord.ts
git commit -m "feat: wire craft commands to real handlers"
```

---

## Task 14: Cleanup and deployment

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Add market-cache.json to .gitignore**

Add to `.gitignore`:
```
public/data/market-cache.json
```

- [ ] **Step 2: Remove market-cache.json from git tracking**

```bash
git rm --cached public/data/market-cache.json
```

(The file stays on disk but is no longer tracked.)

- [ ] **Step 3: Set up Vercel environment variables**

Set these in the Vercel dashboard (Settings → Environment Variables):
- `DISCORD_APP_ID`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_BOT_TOKEN`
- `GROQ_API_KEY`
- `GUILD_ALLOWLIST`
- `REFRESH_SECRET` (generate a random string)
- `VITE_CACHE_BLOB_URL` (set after first cache refresh)
- Turso vars are auto-set by Marketplace install

- [ ] **Step 4: Install Turso from Vercel Marketplace**

In the Vercel dashboard: Integrations → Marketplace → search "Turso" → Install. This auto-provisions `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

- [ ] **Step 5: Install Vercel Blob**

In Vercel dashboard: Storage → Create → Blob Store. This auto-provisions `BLOB_READ_WRITE_TOKEN`.

- [ ] **Step 6: Deploy and test**

```bash
vercel deploy
```

After deploy:
1. Run `npm run register-commands` to register slash commands
2. Set the Interactions Endpoint URL in Discord Developer Portal → your app → General → "Interactions Endpoint URL" to `https://your-app.vercel.app/api/discord`
3. Trigger a cache refresh: `curl "https://your-app.vercel.app/api/refresh-cache?token=YOUR_SECRET"`
4. Copy the returned `blobUrl` → set as `VITE_CACHE_BLOB_URL` in Vercel env vars
5. Set up the external cron service to hit the refresh URL every hour

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```

Verify all 921+ tests still pass.

- [ ] **Step 8: Commit**

```bash
git add .gitignore
git commit -m "chore: finalize Vercel bot migration"
```
