# Plugin Browsing API

Extends the QiqirnCompanion Dalamud plugin with server-side calculated browsing features. All heavy computation happens at the backend level, returning pre-computed results for the plugin to display in-game.

## Architecture Principle

- **Backend handles all calculations** — filtering, sorting, market price lookups, craft trees, cost estimation
- **Plugin receives pre-computed data** — ready-to-display results, no algorithmic work needed
- **Stateless requests** — each call is independent, no session state required

## Endpoints

### `GET /api/plugin/items` — Item Search

Search for items by name with pagination.

```
GET /api/plugin/items?q=cotton&page=1&pageSize=20
```

**Query Parameters:**
- `q` (string, required) — search term (minimum 2 characters)
- `page` (number, optional, default=1) — result page
- `pageSize` (number, optional, default=20, max=50) — items per page

**Response (200):**
```json
{
  "items": [
    { "id": 5058, "name": "Cotton Boll", "hasRecipe": true, "rarity": 1 },
    { "id": 5766, "name": "Cotton Yarn", "hasRecipe": true, "rarity": 1 }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

### `GET /api/plugin/item-sources` — Get Item Sources

Fetch all ways to obtain an item: recipes, vendors, special shops, gathering.

```
GET /api/plugin/item-sources?id=5766
```

**Query Parameters:**
- `id` (number, required) — item ID

**Response (200):**
```json
{
  "itemId": 5766,
  "itemName": "Cotton Yarn",
  "sources": [
    {
      "type": "recipe",
      "jobId": 12,
      "jobName": "Weaver",
      "level": 1,
      "ingredients": [
        { "itemId": 5058, "itemName": "Cotton Boll", "qty": 2 }
      ],
      "outputQty": 3
    },
    {
      "type": "vendor",
      "npcId": 0,
      "npcName": "NPC Vendor",
      "price": 450
    },
    {
      "type": "gather",
      "level": 1,
      "timed": false
    }
  ]
}
```

**Source Types:**
- `recipe` — crafting recipe (includes job, level, ingredients, output qty)
- `vendor` — NPC merchant (includes price)
- `gather` — gathering node (includes level and whether it's a timed node)
- `special_shop` — special shop currency cost
- `company_craft` — FC workshop craft (submarines, airships, etc.)

### `GET /api/plugin/craft-breakdown` — Get Full Craft Path

Calculate the complete craft path with all required materials and estimated cost.

```
GET /api/plugin/craft-breakdown?id=5766&qty=12
```

**Query Parameters:**
- `id` (number, required) — target item ID
- `qty` (number, required) — quantity needed (max 99,999)

**Response (200):**
```json
{
  "itemId": 5766,
  "itemName": "Cotton Yarn",
  "quantity": 12,
  "crafts": [
    {
      "itemId": 5766,
      "itemName": "Cotton Yarn",
      "qty": 2,
      "source": "craft"
    }
  ],
  "acquire": [
    {
      "itemId": 5058,
      "itemName": "Cotton Boll",
      "qtyNeeded": 24,
      "source": "gather",
      "meta": { "gatherLevel": 1, "timed": false }
    },
    {
      "itemId": 5059,
      "itemName": "Earth Crystal",
      "qtyNeeded": 6,
      "source": "market",
      "meta": { "world": "Unknown", "price": 75 }
    }
  ],
  "totalCost": 450
}
```

**Response Fields:**
- `crafts` — items to craft as intermediate steps
- `acquire` — base materials to gather/buy/craft from currency
- `totalCost` — estimated total cost in gil (from market prices and vendor prices)

## Existing Plugin Endpoints

The plugin can continue using these existing endpoints:

### `GET /api/projects?guild={guildId}`
Fetch all open FC projects for a guild.

### `GET /api/projects/{projectId}`
Get detailed project with all tasks.

### `POST /api/plugin/claim`
Claim a project task for your character.

**Request:**
```json
{
  "projectId": 5,
  "taskId": 12,
  "characterName": "Estheria Moonweave",
  "guildId": "123456789"
}
```

### `GET /api/plugin/craftable?inv=[{id:5058,qty:100}]`
Get list of items you can craft from your current inventory.

## TypeScript Client

A typed API client is available at `src/api/plugin-api-client.ts`:

```typescript
import { PluginApiClient } from './plugin-api-client';

const client = new PluginApiClient('https://qiqirn.tools');

// Search items
const results = await client.searchItems('cotton', 1, 20);

// Get item sources
const sources = await client.getItemSources(5766);

// Get craft breakdown
const breakdown = await client.getCraftBreakdown(5766, 12);

// Claim a task
const claimed = await client.claimTask({
  projectId: 5,
  taskId: 12,
  characterName: 'Estheria Moonweave',
  guildId: '123456789'
});

// Get craftable items
const craftable = await client.getCraftableItems([
  { id: 5058, qty: 100 },
  { id: 5059, qty: 50 }
]);
```

## Integration Pattern

In your plugin UI code:

```csharp
private PluginApiClient _apiClient;

// In your Main window, when user searches:
var results = await _apiClient.SearchItems(searchText);

// Display results in table...

// When user clicks an item:
var sources = await _apiClient.GetItemSources(itemId);

// Show "How to get" dialog with recipes, vendors, gathering...

// When user selects "Plan this craft":
var breakdown = await _apiClient.GetCraftBreakdown(itemId, quantity);

// Display materials list and estimated cost...
```

## Error Handling

All endpoints return:
- **200** on success
- **400** for invalid parameters (missing fields, invalid types)
- **405** for wrong HTTP method

Error responses include an `error` field with a user-friendly message.

## Performance Notes

- Item search is fast (filters pre-computed snapshot)
- Item sources load all data upfront
- Craft breakdown fetches market cache for cost estimation (may take 1–2 seconds if cache is cold)
- All responses are cached by Vercel's edge network

## Future Extensions (v2)

Deferred to plugin v2:
- Recipe ingredient cost preview
- Material price trends (requires historical data)
- Retainer inventory integration
- Real-time Universalis fallback (currently uses hourly cache)
