# AI Chat Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/chat` slash command to the Discord bot that routes natural language queries to OpenRouter (LLM) with FFXIV market functions as tools, responding in the bot's Marie Kondo Spanish persona.

**Architecture:** New `bot/src/chat/` module contains the OpenRouter client, tool definitions, name lookup index, and system prompt. The bot's `index.ts` registers a `/chat` slash command at startup and routes ChatInputCommandInteractions to the chat router. Tools wrap existing pure functions (`runCraftFlip`, `findBestDeals`, `runVendorFlip`) plus a direct Universalis price check.

**Tech Stack:** discord.js v14, OpenRouter API (OpenAI-compatible), Vitest, existing FFXIV query functions

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `bot/src/chat/nameIndex.ts` | Create | Build name→ID lookup from snapshots, fuzzy substring search |
| `bot/src/chat/nameIndex.test.ts` | Create | Unit tests for name search |
| `bot/src/chat/openrouter.ts` | Create | OpenRouter API client (fetch, types, tool-call loop) |
| `bot/src/chat/openrouter.test.ts` | Create | Response parsing, tool extraction tests |
| `bot/src/chat/systemPrompt.ts` | Create | System prompt constant |
| `bot/src/chat/tools.ts` | Create | Tool definitions (OpenAI schema) + execute function per tool |
| `bot/src/chat/tools.test.ts` | Create | Tool execution with mock data |
| `bot/src/chat/chatRouter.ts` | Create | Slash command handler: defer, call LLM, tool loop, embed reply |
| `bot/src/registerCommands.ts` | Create | Register /chat slash command via Discord REST API |
| `bot/src/config.ts` | Modify | Add `openrouterApiKey`, `chatModel` |
| `bot/src/loadSnapshots.ts` | Modify | Load vendorShop.json, return `vendorMap` |
| `bot/src/index.ts` | Modify | Import registerCommands + chatRouter, wire slash command handling |

---

### Task 1: Name Index — Fuzzy Item Lookup

**Files:**
- Create: `bot/src/chat/nameIndex.ts`
- Create: `bot/src/chat/nameIndex.test.ts`

- [ ] **Step 1: Write failing tests**

In `bot/src/chat/nameIndex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildNameIndex, searchItems } from './nameIndex';

const SAMPLE_NAMES = new Map<number, string>([
  [100, 'Plain Hooded Tunic'],
  [200, 'Grade 4 Gemdraught of Dexterity'],
  [300, 'Yollal Extract'],
  [400, 'Courtly Lover\'s Cane'],
  [500, 'Open Book'],
]);

describe('buildNameIndex', () => {
  it('builds a lowercase name-to-id map', () => {
    const index = buildNameIndex(SAMPLE_NAMES);
    expect(index.get('plain hooded tunic')).toBe(100);
    expect(index.get('open book')).toBe(500);
  });
});

describe('searchItems', () => {
  const index = buildNameIndex(SAMPLE_NAMES);

  it('finds exact match (case-insensitive)', () => {
    const results = searchItems(index, 'Plain Hooded Tunic');
    expect(results[0]).toEqual({ id: 100, name: 'Plain Hooded Tunic' });
  });

  it('finds substring match', () => {
    const results = searchItems(index, 'gemdraught');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe(200);
  });

  it('returns empty for no match', () => {
    const results = searchItems(index, 'nonexistent garbage');
    expect(results).toEqual([]);
  });

  it('limits results', () => {
    const results = searchItems(index, 'o', 2); // matches multiple
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bot && npx vitest run src/chat/nameIndex.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement nameIndex**

In `bot/src/chat/nameIndex.ts`:

```ts
export interface NameEntry {
  id: number;
  name: string;
  lower: string;
}

export type NameIndex = Map<string, number> & { _entries: NameEntry[] };

export function buildNameIndex(namesById: Map<number, string>): NameIndex {
  const map = new Map<string, number>() as NameIndex;
  const entries: NameEntry[] = [];
  for (const [id, name] of namesById) {
    const lower = name.toLowerCase();
    map.set(lower, id);
    entries.push({ id, name, lower });
  }
  entries.sort((a, b) => a.lower.localeCompare(b.lower));
  map._entries = entries;
  return map;
}

export interface SearchResult {
  id: number;
  name: string;
}

export function searchItems(index: NameIndex, query: string, limit = 5): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // Exact match first
  const exactId = index.get(q);
  if (exactId != null) {
    const entry = index._entries.find((e) => e.id === exactId)!;
    return [{ id: entry.id, name: entry.name }];
  }

  // Substring match
  const results: SearchResult[] = [];
  for (const entry of index._entries) {
    if (entry.lower.includes(q)) {
      results.push({ id: entry.id, name: entry.name });
      if (results.length >= limit) break;
    }
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bot && npx vitest run src/chat/nameIndex.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add bot/src/chat/nameIndex.ts bot/src/chat/nameIndex.test.ts
git commit -m "feat(bot): add item name index for fuzzy lookup"
```

---

### Task 2: OpenRouter API Client

**Files:**
- Create: `bot/src/chat/openrouter.ts`
- Create: `bot/src/chat/openrouter.test.ts`

- [ ] **Step 1: Write failing tests**

In `bot/src/chat/openrouter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseOpenRouterResponse, type OpenRouterResponse } from './openrouter';

describe('parseOpenRouterResponse', () => {
  it('extracts text content from a simple response', () => {
    const raw: OpenRouterResponse = {
      choices: [{
        message: { role: 'assistant', content: 'Hola ✨', tool_calls: undefined },
        finish_reason: 'stop',
      }],
    };
    const parsed = parseOpenRouterResponse(raw);
    expect(parsed.content).toBe('Hola ✨');
    expect(parsed.toolCalls).toEqual([]);
  });

  it('extracts tool calls when present', () => {
    const raw: OpenRouterResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'price_check', arguments: '{"item_name":"tunic"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
    const parsed = parseOpenRouterResponse(raw);
    expect(parsed.content).toBeNull();
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0].name).toBe('price_check');
    expect(parsed.toolCalls[0].args).toEqual({ item_name: 'tunic' });
  });

  it('handles empty choices gracefully', () => {
    const raw: OpenRouterResponse = { choices: [] };
    const parsed = parseOpenRouterResponse(raw);
    expect(parsed.content).toBeNull();
    expect(parsed.toolCalls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bot && npx vitest run src/chat/openrouter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement OpenRouter client**

In `bot/src/chat/openrouter.ts`:

```ts
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

export interface OpenRouterResponse {
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

export function parseOpenRouterResponse(raw: OpenRouterResponse): ParsedResponse {
  const choice = raw.choices[0];
  if (!choice) return { content: null, toolCalls: [] };

  const toolCalls = (choice.message.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

  return { content: choice.message.content, toolCalls };
}

export async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<OpenRouterResponse> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<OpenRouterResponse>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bot && npx vitest run src/chat/openrouter.test.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add bot/src/chat/openrouter.ts bot/src/chat/openrouter.test.ts
git commit -m "feat(bot): OpenRouter API client with response parsing"
```

---

### Task 3: System Prompt

**Files:**
- Create: `bot/src/chat/systemPrompt.ts`

- [ ] **Step 1: Create system prompt**

In `bot/src/chat/systemPrompt.ts`:

```ts
export const SYSTEM_PROMPT = `Eres la asistente del mercado de FFXIV — una Marie Kondo del gil, cariñosa y eficiente. Respondes siempre en español con un toque de ternura y emojis ocasionales (✨🌸💰). Tu mundo es Phantom, DC Chaos, región Europa.

Cuando el usuario pregunte sobre precios, crafteos, ofertas o ventas, usa las herramientas disponibles para buscar datos actuales del mercado. Presenta los resultados de forma clara y concisa, con los precios formateados (ej: 1.2M, 45K).

No inventes datos — si una herramienta no devuelve resultados, dilo con cariño. Mantén las respuestas cortas (máximo 3-4 párrafos).

Cuando muestres listas de items, usa formato con bullets y muestra nombre, precio y ganancia cuando aplique. Siempre incluye el dato de velocidad (ventas/día) para que el usuario sepa qué tan rápido se vende.`;
```

- [ ] **Step 2: Commit**

```bash
git add bot/src/chat/systemPrompt.ts
git commit -m "feat(bot): system prompt for AI chat persona"
```

---

### Task 4: Extend loadSnapshots with Vendor Map

**Files:**
- Modify: `bot/src/loadSnapshots.ts`

- [ ] **Step 1: Write failing test**

In `bot/src/chat/nameIndex.test.ts` (or verify by type checking) — the change is to `BotSnapshots` interface. We'll verify via TypeScript compilation.

- [ ] **Step 2: Add vendorMap to loadSnapshots**

In `bot/src/loadSnapshots.ts`, add vendorShop loading:

Update the `BotSnapshots` interface:
```ts
export interface BotSnapshots {
  itemsById: Map<number, SnapshotItem>;
  namesById: Map<number, string>;
  recipes: Map<number, Recipe>;
  gcSupplyIds: Set<number>;
  vendorMap: Map<number, number>;
}
```

Update `loadSnapshots` to load the vendor shop file. Add to the `Promise.all`:
```ts
  const [itemsRaw, recipesRaw, questsRaw, vendorRaw] = await Promise.all([
    readFile(join(snapshotsDir, 'items.json'), 'utf8'),
    readFile(join(snapshotsDir, 'recipes.json'), 'utf8'),
    readFile(join(snapshotsDir, 'quests.json'), 'utf8'),
    readFile(join(snapshotsDir, 'vendorShop.json'), 'utf8'),
  ]);
```

Parse vendor data and build map after the existing parsing:
```ts
  const vendorBundle = JSON.parse(vendorRaw) as { bakedAt: number; entries: Array<[number, number]> };
  const vendorMap = new Map<number, number>(vendorBundle.entries);
```

Update the return to include `vendorMap`:
```ts
  return { itemsById, namesById, recipes, gcSupplyIds, vendorMap };
```

- [ ] **Step 3: Verify types compile**

Run: `cd bot && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add bot/src/loadSnapshots.ts
git commit -m "feat(bot): load vendorShop.json in snapshots"
```

---

### Task 5: Tool Definitions & Execution

**Files:**
- Create: `bot/src/chat/tools.ts`
- Create: `bot/src/chat/tools.test.ts`

- [ ] **Step 1: Write failing tests**

In `bot/src/chat/tools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from './tools';

describe('TOOL_DEFINITIONS', () => {
  it('exports 4 tool definitions in OpenAI format', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(4);
    for (const t of TOOL_DEFINITIONS) {
      expect(t.type).toBe('function');
      expect(t.function.name).toBeTruthy();
      expect(t.function.parameters).toBeTruthy();
    }
  });

  it('has expected tool names', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names).toContain('price_check');
    expect(names).toContain('craft_flip_search');
    expect(names).toContain('best_deals');
    expect(names).toContain('vendor_flip_search');
  });
});

describe('executeTool', () => {
  it('returns error string for unknown tool', async () => {
    const result = await executeTool('nonexistent', {}, {} as ToolContext);
    expect(result).toContain('Unknown tool');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bot && npx vitest run src/chat/tools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tools**

In `bot/src/chat/tools.ts`:

```ts
import type { ToolDefinition } from './openrouter';
import type { BotSnapshots } from '../loadSnapshots';
import type { NameIndex } from './nameIndex';
import { searchItems } from './nameIndex';
import { fetchMarketForOutputs } from '../fetchMarketForOutputs';
import { runCraftFlip } from '../../../src/features/queries/runCraftFlip';
import { findBestDeals } from '../../../src/features/insights/bestDeals';
import { runVendorFlip } from '../../../src/features/queries/runVendorFlip';
import { defaultVendorFlipFilter } from '../../../src/features/queries/types';
import type { QueryFilter } from '../../../src/features/queries/types';
import type { TrackedItem } from '../../../src/features/items/types';

export interface ToolContext {
  snapshots: BotSnapshots;
  nameIndex: NameIndex;
  cfg: { world: string; dc: string; region: string };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'price_check',
      description: 'Look up current market prices for an FFXIV item by name. Returns prices on Phantom (home world) and Chaos DC, plus velocity (sales/day).',
      parameters: {
        type: 'object',
        properties: {
          item_name: { type: 'string', description: 'Item name or partial match' },
        },
        required: ['item_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'craft_flip_search',
      description: 'Find the most profitable items to craft and sell on the market board. Returns items sorted by gil profit per day.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of results (default 5)' },
          sort: { type: 'string', enum: ['gilPerDay', 'profit'], description: 'Sort field (default gilPerDay)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'best_deals',
      description: 'Find items currently selling below their average price (good deals/discounts). Returns items with the highest discount percentage.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of results (default 5)' },
          min_deal_pct: { type: 'number', description: 'Minimum discount % (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vendor_flip_search',
      description: 'Find items that can be bought from NPC vendors and resold on the market board for profit.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of results (default 5)' },
          sort: { type: 'string', enum: ['profitPerDay', 'markup'], description: 'Sort field (default profitPerDay)' },
        },
      },
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case 'price_check': return await priceCheck(args, ctx);
      case 'craft_flip_search': return await craftFlipSearch(args, ctx);
      case 'best_deals': return await bestDealsSearch(args, ctx);
      case 'vendor_flip_search': return await vendorFlipSearch(args, ctx);
      default: return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function priceCheck(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const itemName = String(args.item_name ?? '');
  const matches = searchItems(ctx.nameIndex, itemName, 3);
  if (matches.length === 0) return JSON.stringify({ error: 'No items found matching that name' });

  const ids = matches.map((m) => m.id);
  const market = await fetchMarketForOutputs(ids, ctx.cfg);

  const results = matches.map((m) => {
    const ph = market.phantom[m.id];
    const dc = market.dc[m.id];
    return {
      name: m.name,
      id: m.id,
      phantomMinNQ: ph?.minNQ ?? null,
      phantomMinHQ: ph?.minHQ ?? null,
      dcMinNQ: dc?.minNQ ?? null,
      dcMinHQ: dc?.minHQ ?? null,
      velocity: ph?.velocity ?? dc?.velocity ?? 0,
      listings: ph?.listingCount ?? 0,
    };
  });
  return JSON.stringify(results);
}

async function craftFlipSearch(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const sortArg = String(args.sort ?? 'gilPerDay');
  const sort = sortArg === 'profit' ? 'unitPrice' as const : 'gilFlow' as const;

  const snapshot = [...ctx.snapshots.itemsById.values()];
  const craftableIds = snapshot.filter((i) => ctx.snapshots.recipes.has(i.id)).map((i) => i.id);
  const market = await fetchMarketForOutputs(craftableIds, ctx.cfg);

  const filter: QueryFilter = {
    searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0.3,
    minPrice: null, maxPrice: null, sort, limit, scope: 'home',
    maxListings: null, mode: 'craft', minGap: null, trainedEye: false,
  };

  const rows = runCraftFlip(snapshot, market.phantom, ctx.snapshots.recipes, filter);
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name, materialCost: r.materialCost, salePrice: r.unitPrice,
    profit: r.profit, velocity: r.velocity, gilPerDay: Math.round(r.gilPerDay), hq: r.hq,
  }));
  return JSON.stringify(results);
}

async function bestDealsSearch(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const minDealPct = Number(args.min_deal_pct) || 20;

  const snapshot = [...ctx.snapshots.itemsById.values()];
  const ids = snapshot.map((i) => i.id);
  const market = await fetchMarketForOutputs(ids, ctx.cfg);

  // Build TrackedItem-like objects from snapshot
  const tracked: TrackedItem[] = snapshot.map((i) => ({
    id: i.id, name: i.name, crafter: '' as TrackedItem['crafter'], lvl: 0, cat: 'other' as TrackedItem['cat'],
  }));

  const rows = findBestDeals(tracked, market.dc, { minDealPct });
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name, currentPrice: r.currentMin, averagePrice: r.averagePrice, dealPct: r.dealPct,
  }));
  return JSON.stringify(results);
}

async function vendorFlipSearch(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const sortArg = String(args.sort ?? 'profitPerDay');
  const sort = (sortArg === 'markup' ? 'markup' : 'profitPerDay') as 'markup' | 'profitPerDay';

  const snapshot = [...ctx.snapshots.itemsById.values()];
  const vendorIds = [...ctx.snapshots.vendorMap.keys()];
  const market = await fetchMarketForOutputs(vendorIds, ctx.cfg);

  const filter = { ...defaultVendorFlipFilter(), sort, limit };
  const rows = runVendorFlip(snapshot, ctx.snapshots.vendorMap, market.phantom, filter);
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name, vendorPrice: r.vendorPrice, salePrice: r.salePrice,
    profitPerUnit: r.profitPerUnit, markup: Math.round(r.markup * 100) / 100,
    velocity: r.velocity, profitPerDay: Math.round(r.profitPerDay),
  }));
  return JSON.stringify(results);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bot && npx vitest run src/chat/tools.test.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add bot/src/chat/tools.ts bot/src/chat/tools.test.ts
git commit -m "feat(bot): tool definitions and execution for AI chat"
```

---

### Task 6: Config + Register Slash Command

**Files:**
- Modify: `bot/src/config.ts`
- Create: `bot/src/registerCommands.ts`

- [ ] **Step 1: Add OpenRouter config**

In `bot/src/config.ts`, add to the config object:

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  guildAllowlist: new Set(
    required('GUILD_ALLOWLIST').split(',').map((s) => s.trim()).filter(Boolean),
  ),
  world: process.env.HOME_WORLD ?? 'Phantom',
  dc: process.env.HOME_DC ?? 'Chaos',
  region: process.env.REGION ?? 'Europe',
  snapshotsDir: process.env.SNAPSHOTS_DIR ?? '../public/data/snapshots',
  openrouterApiKey: optional('OPENROUTER_API_KEY'),
  chatModel: process.env.CHAT_MODEL ?? 'meta-llama/llama-3.1-70b-instruct',
};
```

- [ ] **Step 2: Create registerCommands**

In `bot/src/registerCommands.ts`:

```ts
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

export async function registerCommands(token: string, clientId: string, guildIds: string[]): Promise<void> {
  const command = new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Pregúntale al asistente del mercado ✨')
    .addStringOption((opt) =>
      opt.setName('message').setDescription('Tu pregunta').setRequired(true),
    );

  const rest = new REST({ version: '10' }).setToken(token);

  for (const guildId of guildIds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [command.toJSON()] },
      );
      console.log(`Registered /chat in guild ${guildId}`);
    } catch (e) {
      console.error(`Failed to register commands in guild ${guildId}:`, e);
    }
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd bot && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add bot/src/config.ts bot/src/registerCommands.ts
git commit -m "feat(bot): config for OpenRouter + slash command registration"
```

---

### Task 7: Chat Router — Slash Command Handler

**Files:**
- Create: `bot/src/chat/chatRouter.ts`

- [ ] **Step 1: Create chatRouter**

In `bot/src/chat/chatRouter.ts`:

```ts
import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { callOpenRouter, parseOpenRouterResponse, type ChatMessage } from './openrouter';
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from './tools';
import { SYSTEM_PROMPT } from './systemPrompt';

const MAX_ITERATIONS = 3;
const COOLDOWN_MS = 5000;
const cooldowns = new Map<string, number>();

export interface ChatDeps {
  apiKey: string;
  model: string;
  toolCtx: ToolContext;
}

export async function handleChatCommand(
  interaction: ChatInputCommandInteraction,
  deps: ChatDeps,
): Promise<void> {
  const userId = interaction.user.id;

  // Rate limit
  const lastTs = cooldowns.get(userId) ?? 0;
  if (Date.now() - lastTs < COOLDOWN_MS) {
    await interaction.reply({ content: 'Espera un momentito ✨', ephemeral: true });
    return;
  }
  cooldowns.set(userId, Date.now());

  await interaction.deferReply();
  const userMessage = interaction.options.getString('message', true);
  const startTime = Date.now();

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];

    let finalContent: string | null = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const raw = await callOpenRouter(deps.apiKey, deps.model, messages, TOOL_DEFINITIONS);
      const parsed = parseOpenRouterResponse(raw);

      if (parsed.toolCalls.length === 0) {
        finalContent = parsed.content;
        break;
      }

      // Append assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: parsed.content,
        tool_calls: raw.choices[0].message.tool_calls,
      });

      // Execute each tool and append results
      for (const tc of parsed.toolCalls) {
        const result = await executeTool(tc.name, tc.args, deps.toolCtx);
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        });
      }
    }

    if (!finalContent) {
      finalContent = 'No pude completar tu consulta — inténtalo de nuevo ✨';
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const embed = new EmbedBuilder()
      .setColor(0xD4A958)
      .setDescription(finalContent)
      .setFooter({ text: `${deps.model} · ${elapsed}s` });

    await interaction.editReply({ embeds: [embed] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Chat error:', msg);
    await interaction.editReply({
      content: 'Ay, mi conexión con las estrellas falló ✨ Inténtalo otra vez',
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add bot/src/chat/chatRouter.ts
git commit -m "feat(bot): chat router with tool-call loop and embed reply"
```

---

### Task 8: Wire Everything into index.ts

**Files:**
- Modify: `bot/src/index.ts`

- [ ] **Step 1: Update index.ts**

Replace `bot/src/index.ts` with the following (preserving all existing functionality, adding chat):

```ts
import { Client, Events, GatewayIntentBits, Partials, type Message, type ChatInputCommandInteraction } from 'discord.js';
import { config } from './config';
import { loadSnapshots } from './loadSnapshots';
import { handleCsv } from './handleCsv';
import { createCleanupCache, type CachedCleanup } from './cleanupCache';
import { handleInteraction, newCacheId } from './interactions';
import { fetchMarketForOutputs } from './fetchMarketForOutputs';
import { registerCommands } from './registerCommands';
import { handleChatCommand } from './chat/chatRouter';
import { buildNameIndex } from './chat/nameIndex';

const TTL_MS = 30 * 60_000;       // 30-min sliding TTL
const MAX_ENTRIES = 100;
const SWEEP_MS = 5 * 60_000;      // sweep every 5 minutes

const GREETINGS = [
  'Gracias por confiarme tu inventario ✨ Voy a saludar a cada objeto y descubrir cuáles te traen alegría. Dame un par de minutos para ordenarlo todo con cariño.',
  '¡Qué tesoros tan bonitos! 🌸 Permíteme un momento para sentarme con cada uno y agradecerle su servicio antes de decidir su lugar.',
  'Hola, qué colección tan adorable ✨ Voy a tomar mi tiempo para saludar a cada objeto y preguntarle si aún chispea alegría en tu corazón.',
  'Gracias por compartir tus pertenencias conmigo 🌷 Voy a ordenar con cariño — dame un ratito mientras saludo a cada una y descubro cuáles te siguen dando alegría.',
];

function pickGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

async function main() {
  console.log('Loading snapshots…');
  const snapshots = await loadSnapshots(config.snapshotsDir);
  console.log(`Loaded ${snapshots.itemsById.size} items, ${snapshots.recipes.size} recipes, ${snapshots.vendorMap.size} vendor prices.`);

  const cache = createCleanupCache({ ttlMs: TTL_MS, maxEntries: MAX_ENTRIES });
  const sweepTimer = setInterval(() => cache.evictExpired(), SWEEP_MS);
  sweepTimer.unref?.();

  const nameIndex = buildNameIndex(snapshots.namesById);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);

    // Register slash commands
    if (config.openrouterApiKey) {
      await registerCommands(config.token, c.user.id, [...config.guildAllowlist]);
      console.log('Chat feature enabled (OpenRouter key present)');
    } else {
      console.log('Chat feature disabled (no OPENROUTER_API_KEY)');
    }
  });

  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.bot) return;
    if (!msg.guildId || !config.guildAllowlist.has(msg.guildId)) return;
    const attachment = msg.attachments.find((a) => a.name?.toLowerCase().endsWith('.csv'));
    if (!attachment) return;

    if (msg.channel.isTextBased() && 'sendTyping' in msg.channel) {
      await msg.channel.sendTyping();
    }
    await msg.reply(pickGreeting());

    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
      const csv = await res.text();
      const cacheId = newCacheId();
      const out = await handleCsv(csv, snapshots, {
        world: config.world,
        dc: config.dc,
        region: config.region,
      }, { ownerId: msg.author.id, cacheId });
      await msg.reply({
        content: out.reply.summary,
        embeds: out.reply.embeds,
        files: out.reply.files,
        components: out.reply.components,
      });
      const entry: CachedCleanup = {
        ownerId: msg.author.id,
        cacheId,
        csv,
        parsed: out.parsed,
        marketIds: out.marketIds,
        result: out.result,
        usesByItemId: out.usesByItemId,
        createdAt: Date.now(),
        lastTouchedAt: Date.now(),
      };
      cache.set(msg.author.id, entry);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await msg.reply(`Couldn't process CSV: \`${m}\``);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    // Handle /chat slash command
    if (interaction.isChatInputCommand() && interaction.commandName === 'chat') {
      if (!config.openrouterApiKey) {
        await interaction.reply({ content: 'Chat no está configurado — falta OPENROUTER_API_KEY', ephemeral: true });
        return;
      }
      await handleChatCommand(interaction as ChatInputCommandInteraction, {
        apiKey: config.openrouterApiKey,
        model: config.chatModel,
        toolCtx: {
          snapshots,
          nameIndex,
          cfg: { world: config.world, dc: config.dc, region: config.region },
        },
      });
      return;
    }

    // Handle button interactions (existing cleanup flow)
    handleInteraction(interaction, {
      cache,
      snapshots,
      cfg: { world: config.world, dc: config.dc, region: config.region },
      fetchMarket: fetchMarketForOutputs,
    }).catch((err) => console.error('Interaction handler error:', err));
  });

  await client.login(config.token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Verify types compile**

Run: `cd bot && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add bot/src/index.ts
git commit -m "feat(bot): wire /chat slash command into bot entry point"
```

---

### Task 9: Run Full Test Suite & Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all bot tests**

Run: `cd bot && npx vitest run`
Expected: all tests PASS

- [ ] **Step 2: Run web test suite (no regressions)**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 3: Type check bot**

Run: `cd bot && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix(bot): test fixes for AI chat integration"
```
