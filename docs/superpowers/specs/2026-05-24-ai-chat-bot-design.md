# AI Chat Assistant for Discord Bot

**Date:** 2026-05-24
**Status:** Approved

## Problem

The FFXIV helper web app has powerful market analysis tools (craft flips, best
deals, vendor flips, price checks) but using them requires opening the browser.
Users want quick market answers while playing, directly in Discord chat.

## Solution

Add a `/chat` slash command to the existing Discord bot. User messages are sent
to OpenRouter (LLM API) with the bot's existing pure functions registered as
tools. The LLM interprets intent, calls the right tools, and responds in the
bot's existing Marie Kondo-themed Spanish persona.

## OpenRouter Integration

- **Endpoint:** `https://openrouter.ai/api/v1/chat/completions`
- **API format:** OpenAI-compatible (messages array, tool definitions, tool_choice)
- **Model:** `meta-llama/llama-3.1-70b-instruct` (good tool calling, ~$0.0004/1K tokens)
- **Fallback:** configurable via `CHAT_MODEL` env var
- **Auth:** `OPENROUTER_API_KEY` env var, sent as `Authorization: Bearer <key>`
- **Max tokens:** 1024 per response
- **Temperature:** 0.7

No SDK needed — plain `fetch` to the OpenAI-compatible endpoint.

## Slash Command

```
/chat message:<string>
```

Registered as a guild command (not global) using Discord's REST API. A one-time
registration script runs at bot startup if the command doesn't exist yet.

## Tool Definitions (4 tools)

### 1. `price_check`

Look up current market prices for an item by name.

**Parameters:**
- `item_name` (string, required) — item name or partial match

**Implementation:**
1. Fuzzy-match `item_name` against `namesById` map (case-insensitive substring)
2. Take top match (or return "not found")
3. Fetch market data via `fetchMarketForOutputs([itemId], cfg)`
4. Return: `{ name, id, phantomPrice, dcPrice, velocity, listingCount }`

### 2. `craft_flip_search`

Find profitable items to craft and sell.

**Parameters:**
- `limit` (number, optional, default 5) — how many results
- `sort` (enum: "gilPerDay" | "profit", optional, default "gilPerDay")

**Implementation:**
1. Load full item snapshot array from `snapshots.itemsById`
2. Fetch market data for craftable items (use snapshot item IDs that have recipes)
3. Call `runCraftFlip(snapshot, priceMap, recipeMap, defaultFilter, undefined)`
4. Sort by requested field, take top N
5. Return array of `{ name, materialCost, salePrice, profit, velocity, gilPerDay }`

### 3. `best_deals`

Find items selling below their average price (discounts).

**Parameters:**
- `limit` (number, optional, default 5)
- `min_deal_pct` (number, optional, default 20) — minimum discount %

**Implementation:**
1. Build `TrackedItem[]` from snapshot
2. Fetch DC market data
3. Call `findBestDeals(items, dcMarket, { minDealPct, limit })`
4. Return array of `{ name, currentPrice, averagePrice, dealPct }`

### 4. `vendor_flip_search`

Find items buyable from NPCs and resellable on the market board.

**Parameters:**
- `limit` (number, optional, default 5)
- `sort` (enum: "profitPerDay" | "markup", optional, default "profitPerDay")

**Implementation:**
1. Load vendor shop snapshot (new: `vendorShop.json`)
2. Build `vendorMap: Map<number, number>` from it
3. Fetch market data for vendor-sold items
4. Call `runVendorFlip(snapshot, vendorMap, saleMap, defaultFilter)`
5. Return array of `{ name, vendorPrice, salePrice, profitPerUnit, markup, velocity }`

## Tool Execution Loop

The LLM may call multiple tools or call tools sequentially. The bot runs a
standard tool-call loop:

1. Send user message + tool definitions to OpenRouter
2. If response contains `tool_calls`: execute each, collect results
3. Append tool results as tool-role messages
4. Re-send to OpenRouter for final response
5. Max 3 iterations (prevent infinite loops)

## System Prompt

```
Eres la asistente del mercado de FFXIV — una Marie Kondo del gil, cariñosa y
eficiente. Respondes siempre en español con un toque de ternura y emojis
ocasionales (✨🌸💰). Tu mundo es Phantom, DC Chaos, región Europa.

Cuando el usuario pregunte sobre precios, crafteos, ofertas o ventas, usa las
herramientas disponibles para buscar datos actuales del mercado. Presenta los
resultados de forma clara y concisa, con los precios formateados (ej: 1.2M, 45K).

No inventes datos — si una herramienta no devuelve resultados, dilo con cariño.
Mantén las respuestas cortas (máximo 3-4 párrafos).
```

## Data Loading

### Existing (no changes)
- `items.json` → `itemsById`, `namesById`
- `recipes.json` → `recipes`
- `quests.json` → `gcSupplyIds`

### New: load at startup
- `vendorShop.json` → `vendorMap: Map<number, number>` (itemId → vendorPrice)

Extend `loadSnapshots` to also load and return `vendorMap`.

### New: name lookup index
Build a reverse map at startup: `nameToId: Map<string, number>` (lowercase
name → item ID) for the `price_check` tool. Also build a `nameIndex: string[]`
(sorted lowercase names) for substring search.

## Rate Limiting

Per-user cooldown: 5 seconds between `/chat` invocations. Enforced via a
simple `Map<userId, lastTs>` in memory. If cooldown not met, reply with
ephemeral "Espera un momentito ✨".

## Discord Response Format

- Use `interaction.deferReply()` immediately (LLM + market fetches take seconds)
- Final response via `interaction.editReply()` with an embed:
  - Color: gold (`0xD4A958`)
  - Author: bot name
  - Description: LLM response text (markdown)
  - Footer: model name + response time

## New Files

| File | Purpose |
|------|---------|
| `bot/src/chat/chatRouter.ts` | Slash command handler: defer, call OpenRouter, tool loop, reply |
| `bot/src/chat/tools.ts` | Tool definitions (OpenAI format) + execute function per tool |
| `bot/src/chat/systemPrompt.ts` | System prompt constant |
| `bot/src/chat/openrouter.ts` | OpenRouter API client (fetch wrapper, types) |
| `bot/src/chat/nameIndex.ts` | Item name fuzzy lookup (substring match on sorted names) |
| `bot/src/registerCommands.ts` | Register /chat slash command via Discord REST API |

## Modified Files

| File | Change |
|------|--------|
| `bot/src/config.ts` | Add `openrouterApiKey` and `chatModel` env vars |
| `bot/src/loadSnapshots.ts` | Load `vendorShop.json`, return `vendorMap` in `BotSnapshots` |
| `bot/src/index.ts` | Call `registerCommands`, route slash command interactions to `chatRouter` |

## Error Handling

| Scenario | Response |
|----------|----------|
| OpenRouter API error/timeout | "Ay, mi conexión con las estrellas falló ✨ Inténtalo otra vez" |
| No results from tool | LLM handles naturally ("No encontré nada rentable...") |
| Rate limited | Ephemeral: "Espera un momentito ✨" |
| Missing API key | Bot starts without chat; logs warning. CSV cleanup still works. |
| Tool execution error | Return error string to LLM, let it explain gracefully |

## Testing

- `bot/src/chat/nameIndex.test.ts` — fuzzy name lookup
- `bot/src/chat/tools.test.ts` — tool execution with mock market data
- `bot/src/chat/openrouter.test.ts` — response parsing, tool call extraction

## Out of Scope

- Multi-turn conversation memory (each `/chat` is stateless)
- Planner/sales tracking via chat
- Streaming responses
- Image generation
- Inventory cleanup via chat (stays as CSV attachment)
