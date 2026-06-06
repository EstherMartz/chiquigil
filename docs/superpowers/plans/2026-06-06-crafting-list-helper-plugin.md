# Crafting List Helper — Part 2 (In-Game Plugin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-game **Crafting Lists** panel (LISTS / RECIPES / INGREDIENTS) to the Qiqirn Companion plugin that imports a `qq:list:v1:` paste-code, resolves it via the qiqirn.tools backend, and shows an inventory-aware "what's missing" view.

**Architecture:** A small backend extension in `ffxiv-helper` adds a `POST` list-breakdown to the **existing** `plugin-craft-breakdown` lambda, reusing Part-1 `resolveList.ts` server-side (one resolver, no new lambda). The `qiqirn-companion` plugin decodes the paste-code locally, POSTs the items, overlays local bag inventory, and renders three tabs following existing `MainWindow` ImGui patterns.

**Tech stack:** Backend — TypeScript, Vitest (TDD). Plugin — C# net10.0-windows, Dalamud API 15, `Dalamud.Bindings.ImGui`, System.Text.Json, FFXIVClientStructs. **No C# unit-test framework exists**, so plugin verification = `dotnet build` (compiles cleanly today) + manual in-game; backend stays Vitest-TDD.

**Specs:** `docs/superpowers/specs/2026-06-06-crafting-list-helper-plugin-design.md` (+ Part-1 `…-web-design.md`).

**Two repos:**
- `C:\Users\esthe\Documents\Dev\ffxiv-helper` (backend; Tasks 1–2)
- `C:\Users\esthe\Documents\Dev\qiqirn-companion` (plugin; Tasks 3–7)

**Branch setup (execution):** create a feature branch in EACH repo before starting (e.g. `feature/craft-lists-plugin`). The plugin must build in place (Dalamud dev plugin), so use a branch, not a separate worktree, for `qiqirn-companion`. Never `git checkout` in a shared worktree mid-stream.

---

## File Structure

**Backend (ffxiv-helper)**
- `src/api/_list-breakdown-core.ts` — *create*: validate items + `buildListBreakdown` (reuses `resolveList`).
- `src/api/plugin-craft-breakdown.ts` — *modify*: add `POST` branch.
- Tests: `src/api/_list-breakdown-core.test.ts`, `src/api/plugin-craft-breakdown.test.ts`.

**Plugin (qiqirn-companion)**
- `Models/CraftListModels.cs` — *create*: `ImportedList`, `ImportedListItem`, `ListBreakdown`, `BreakdownFinalItem`, `BreakdownIngredient`.
- `Services/ListCodec.cs` — *create*: decode `qq:list:v1:`.
- `Services/ApiClient.cs` — *modify*: `GetListBreakdownAsync`.
- `Configuration.cs` — *modify*: `ImportedLists`, `ActiveListId`.
- `Windows/CraftListsWindow.cs` — *create*: the panel (LISTS/RECIPES/INGREDIENTS via `DrawContent()`).
- `Plugin.cs`, `Windows/MainWindow.cs` — *modify*: construct + add the "Craft Lists" tab.

---

## Task 1: Backend — `_list-breakdown-core.ts`

**Files:**
- Create: `src/api/_list-breakdown-core.ts`
- Test: `src/api/_list-breakdown-core.test.ts`

Working dir: `C:\Users\esthe\Documents\Dev\ffxiv-helper`.

- [ ] **Step 1: Write the failing test**

Create `src/api/_list-breakdown-core.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateBreakdownItems, buildListBreakdown } from './_list-breakdown-core';
import type { ResolveDeps } from '../features/craftLists/resolveList';
import type { Recipe } from '../lib/recipes';
import type { SnapshotItem } from '../lib/itemSnapshot';

const recipes = new Map<number, Recipe | null>([
  [1, { itemResultId: 1, classJob: 'BSM', recipeLevel: 90, ingredients: [
    { itemId: 2, amount: 2 }, { itemId: 7, amount: 1 },
  ], amountResult: 1, stats: { durability: 80, progress: 1, quality: 1, stars: 4, requiredCraftsmanship: 0, requiredControl: 0 } }],
  [2, { itemResultId: 2, classJob: 'BSM', recipeLevel: 50, ingredients: [{ itemId: 3, amount: 3 }], amountResult: 1 }],
]);
const itemsById = new Map<number, SnapshotItem>([
  [1, { id: 1, name: 'Sword', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 }],
  [2, { id: 2, name: 'Ingot', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
  [3, { id: 3, name: 'Ore', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
  [7, { id: 7, name: 'Fire Shard', sc: 58, ui: 0, ilvl: 1, canHq: false, rarity: 1 }],
] as [number, SnapshotItem][]);
const deps: ResolveDeps = {
  recipes, gathering: new Map([[3, { level: 50, timed: false, hidden: false }]]),
  vendorMap: new Map(), specialShop: { byCurrency: new Map() }, itemsById,
};

describe('validateBreakdownItems', () => {
  it('accepts a valid list and maps hq', () => {
    const items = validateBreakdownItems([{ itemId: 1, qty: 2, hq: true }]);
    expect(items).toEqual([{ itemId: 1, qty: 2, isHq: true }]);
  });
  it('rejects empty / oversized / bad qty / bad id', () => {
    expect(validateBreakdownItems([])).toBeNull();
    expect(validateBreakdownItems('nope')).toBeNull();
    expect(validateBreakdownItems([{ itemId: 0, qty: 1 }])).toBeNull();
    expect(validateBreakdownItems([{ itemId: 1, qty: 0 }])).toBeNull();
    expect(validateBreakdownItems(Array.from({ length: 201 }, () => ({ itemId: 1, qty: 1 })))).toBeNull();
  });
});

describe('buildListBreakdown', () => {
  it('returns finalItems + flat ingredients with depth/source', () => {
    const out = buildListBreakdown([{ itemId: 1, qty: 1, isHq: false }], deps);
    expect(out.finalItems).toEqual([
      { itemId: 1, itemName: 'Sword', qty: 1, isHq: false, job: 'BSM', recipeLevel: 90, stars: 4 },
    ]);
    const ingot = out.ingredients.find((i) => i.itemId === 2)!;
    expect(ingot).toMatchObject({ requiredQty: 2, source: 'Crafted', depth: 1, usedToCraft: ['Sword'] });
    const ore = out.ingredients.find((i) => i.itemId === 3)!;
    expect(ore).toMatchObject({ requiredQty: 6, source: 'Gathered' });
    expect(out.ingredients.find((i) => i.itemId === 7)!.source).toBe('Crystal');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/api/_list-breakdown-core.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `_list-breakdown-core.ts`**

Create `src/api/_list-breakdown-core.ts`:

```ts
import { resolveList, type ListInput, type ResolveDeps, type ListSource } from '../features/craftLists/resolveList';

export interface ApiFinalItem {
  itemId: number; itemName: string; qty: number; isHq: boolean;
  job?: string; recipeLevel?: number; stars?: number;
}
export interface ApiResolvedIngredient {
  itemId: number; itemName: string; requiredQty: number; source: ListSource;
  craftedByJob?: string; recipeLevel?: number; usedToCraft: string[]; depth?: number; canHq?: boolean;
}
export interface ListBreakdownResponse {
  finalItems: ApiFinalItem[];
  ingredients: ApiResolvedIngredient[];
}

const MAX_ITEMS = 200;

/** Validate the POST body's `items` into resolveList inputs, or null if invalid. */
export function validateBreakdownItems(raw: unknown): ListInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return null;
  const out: ListInput[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const itemId = Number(o.itemId);
    const qty = Number(o.qty);
    if (!Number.isInteger(itemId) || itemId <= 0) return null;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99999) return null;
    out.push({ itemId, qty, isHq: !!o.hq });
  }
  return out;
}

/** Resolve a list (reusing the Part-1 resolver) and flatten for JSON transport. */
export function buildListBreakdown(items: ListInput[], deps: ResolveDeps): ListBreakdownResponse {
  const r = resolveList(items, deps);
  return {
    finalItems: r.finalItems.map((f) => ({
      itemId: f.itemId, itemName: f.itemName, qty: f.qty, isHq: f.isHq,
      job: f.job, recipeLevel: f.recipeLevel, stars: f.stars,
    })),
    ingredients: r.all.map((i) => ({
      itemId: i.itemId, itemName: i.itemName, requiredQty: i.requiredQty, source: i.source,
      craftedByJob: i.craftedByJob, recipeLevel: i.recipeLevel,
      usedToCraft: i.usedToCraft, depth: i.depth, canHq: i.canHq,
    })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/_list-breakdown-core.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/_list-breakdown-core.ts src/api/_list-breakdown-core.test.ts
git commit -m "feat(craft-lists): server list-breakdown core (reuses resolveList)"
```

---

## Task 2: Backend — add POST to `plugin-craft-breakdown`

**Files:**
- Modify: `src/api/plugin-craft-breakdown.ts`
- Test: `src/api/plugin-craft-breakdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/plugin-craft-breakdown.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Recipe } from '../lib/recipes';
import type { SnapshotItem } from '../lib/itemSnapshot';

// Mock the snapshot loader so the handler doesn't hit the network.
vi.mock('../bot/loadSnapshots', () => {
  const recipes = new Map<number, Recipe>([
    [1, { itemResultId: 1, classJob: 'BSM', recipeLevel: 90, ingredients: [
      { itemId: 2, amount: 2 }, { itemId: 7, amount: 1 },
    ], amountResult: 1, stats: { durability: 1, progress: 1, quality: 1, stars: 4, requiredCraftsmanship: 0, requiredControl: 0 } }],
    [2, { itemResultId: 2, classJob: 'BSM', recipeLevel: 50, ingredients: [{ itemId: 3, amount: 3 }], amountResult: 1 }],
  ]);
  const itemsById = new Map<number, SnapshotItem>([
    [1, { id: 1, name: 'Sword', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 }],
    [2, { id: 2, name: 'Ingot', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
    [3, { id: 3, name: 'Ore', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
    [7, { id: 7, name: 'Fire Shard', sc: 58, ui: 0, ilvl: 1, canHq: false, rarity: 1 }],
  ] as [number, SnapshotItem][]);
  const namesById = new Map([...itemsById].map(([id, it]) => [id, it.name]));
  return {
    loadSnapshots: vi.fn(async () => ({
      itemsById, namesById, recipes,
      vendorMap: new Map<number, number>(),
      specialShop: { byCurrency: new Map() },
      gatheringCatalog: new Map([[3, { level: 50, timed: false, hidden: false }]]),
      companyCraft: new Map(),
    })),
  };
});

import handler from './plugin-craft-breakdown';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/plugin/craft-breakdown (list)', () => {
  it('returns finalItems + ingredients for a list', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { items: [{ itemId: 1, qty: 1 }] }, query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.finalItems[0]).toMatchObject({ itemId: 1, itemName: 'Sword' });
    expect(body.ingredients.find((i: any) => i.itemId === 3)).toMatchObject({ requiredQty: 6, source: 'Gathered' });
  });

  it('400s on an empty/invalid items array', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { items: [] }, query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('still 400s a GET with no id/qty (existing behavior)', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/api/plugin-craft-breakdown.test.ts`
Expected: FAIL — POST returns 405 (no POST branch yet).

- [ ] **Step 3: Add the POST branch**

In `src/api/plugin-craft-breakdown.ts`, add imports at the top (after the existing imports):

```ts
import type { Recipe } from '../lib/recipes';
import type { ResolveDeps } from '../features/craftLists/resolveList';
import { validateBreakdownItems, buildListBreakdown } from './_list-breakdown-core';
```

Then, at the very start of the `handler` function body — **before** the existing `if (req.method !== 'GET')` guard — insert:

```ts
  // ── POST: whole-list breakdown (plugin Crafting Lists) ─────────────────────
  if (req.method === 'POST') {
    const items = validateBreakdownItems((req.body ?? {}).items);
    if (!items) {
      return res.status(400).json({ error: 'items must be a 1–200 entry array of { itemId, qty, hq? }' });
    }
    const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
    const snapshots = await loadSnapshots(baseUrl);
    const deps: ResolveDeps = {
      recipes: snapshots.recipes as Map<number, Recipe | null>,
      gathering: snapshots.gatheringCatalog,
      vendorMap: snapshots.vendorMap,
      specialShop: snapshots.specialShop,
      itemsById: snapshots.itemsById,
    };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(buildListBreakdown(items, deps));
  }
```

Leave the existing `GET` logic untouched below it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/plugin-craft-breakdown.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + lint the touched files**

Run: `npx tsc --noEmit && npx eslint src/api/_list-breakdown-core.ts src/api/plugin-craft-breakdown.ts`
Expected: clean. (The `as Map<number, Recipe | null>` cast satisfies `resolveList`'s dep type.)

- [ ] **Step 6: Commit**

```bash
git add src/api/plugin-craft-breakdown.ts src/api/plugin-craft-breakdown.test.ts
git commit -m "feat(craft-lists): POST list breakdown on plugin-craft-breakdown lambda"
```

> Backend done. The plugin (Tasks 3–7) integrates against `POST {ApiBaseUrl}/api/plugin/craft-breakdown`. For local plugin testing before deploy, point the plugin's `ApiBaseUrl` at a running `vercel dev`, or test against the deployed endpoint after pushing.

---

## Task 3: Plugin — models + `ListCodec`

**Files (qiqirn-companion):**
- Create: `Models/CraftListModels.cs`
- Create: `Services/ListCodec.cs`

Working dir: `C:\Users\esthe\Documents\Dev\qiqirn-companion`.

- [ ] **Step 1: Create the models**

Create `Models/CraftListModels.cs`:

```csharp
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace QiqirnCompanion.Models;

// ── Persisted (config) ──────────────────────────────────────────────────────
public class ImportedListItem
{
    public int  ItemId { get; set; }
    public int  Qty    { get; set; }
    public bool Hq     { get; set; }
}

public class ImportedList
{
    public string Id         { get; set; } = "";   // local guid
    public string Name       { get; set; } = "";
    public long   ImportedAt { get; set; }          // unix ms
    public List<ImportedListItem> Items { get; set; } = new();
}

// ── API response (POST /api/plugin/craft-breakdown) ─────────────────────────
public record BreakdownFinalItem(
    [property: JsonPropertyName("itemId")]      int     ItemId,
    [property: JsonPropertyName("itemName")]    string  ItemName,
    [property: JsonPropertyName("qty")]         int     Qty,
    [property: JsonPropertyName("isHq")]        bool    IsHq,
    [property: JsonPropertyName("job")]         string? Job,
    [property: JsonPropertyName("recipeLevel")] int?    RecipeLevel,
    [property: JsonPropertyName("stars")]       int?    Stars
);

public record BreakdownIngredient(
    [property: JsonPropertyName("itemId")]       int          ItemId,
    [property: JsonPropertyName("itemName")]     string       ItemName,
    [property: JsonPropertyName("requiredQty")]  int          RequiredQty,
    [property: JsonPropertyName("source")]       string       Source,
    [property: JsonPropertyName("craftedByJob")] string?      CraftedByJob,
    [property: JsonPropertyName("recipeLevel")]  int?         RecipeLevel,
    [property: JsonPropertyName("usedToCraft")]  List<string> UsedToCraft,
    [property: JsonPropertyName("depth")]        int?         Depth,
    [property: JsonPropertyName("canHq")]        bool?        CanHq
);

public record ListBreakdown(
    [property: JsonPropertyName("finalItems")]  List<BreakdownFinalItem>  FinalItems,
    [property: JsonPropertyName("ingredients")] List<BreakdownIngredient> Ingredients
);
```

- [ ] **Step 2: Create the decoder**

Create `Services/ListCodec.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Text;
using System.Text.Json;
using QiqirnCompanion.Models;

namespace QiqirnCompanion.Services;

/// <summary>
/// Decodes the web app's "qq:list:v1:&lt;base64url&gt;" share code into an
/// <see cref="ImportedList"/>. Mirrors ffxiv-helper's src/features/craftLists/listCode.ts
/// encoder: payload JSON is { n: name, i: [[itemId, qty, hqFlag], ...] }.
/// Returns null on any malformed input (never throws).
/// </summary>
public static class ListCodec
{
    private const string Prefix = "qq:list:v1:";

    public static ImportedList? Decode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        code = code.Trim();
        if (!code.StartsWith(Prefix, StringComparison.Ordinal)) return null;

        try
        {
            var b64 = code[Prefix.Length..].Replace('-', '+').Replace('_', '/');
            switch (b64.Length % 4) { case 2: b64 += "=="; break; case 3: b64 += "="; break; }
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(b64));

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            if (!root.TryGetProperty("n", out var nameEl) || nameEl.ValueKind != JsonValueKind.String) return null;
            if (!root.TryGetProperty("i", out var itemsEl) || itemsEl.ValueKind != JsonValueKind.Array) return null;

            var items = new List<ImportedListItem>();
            foreach (var tup in itemsEl.EnumerateArray())
            {
                if (tup.ValueKind != JsonValueKind.Array || tup.GetArrayLength() < 2) return null;
                var id  = tup[0].GetInt32();
                var qty = tup[1].GetInt32();
                var hq  = tup.GetArrayLength() >= 3 && tup[2].GetInt32() == 1;
                if (id <= 0 || qty < 1) return null;
                items.Add(new ImportedListItem { ItemId = id, Qty = qty, Hq = hq });
            }
            if (items.Count == 0) return null;

            return new ImportedList
            {
                Id    = Guid.NewGuid().ToString("N")[..12],
                Name  = nameEl.GetString() ?? "Imported list",
                Items = items,
            };
        }
        catch
        {
            return null;
        }
    }
}
```

- [ ] **Step 3: Build to verify it compiles**

Run: `dotnet build -clp:ErrorsOnly`
Expected: `Compilación correcta` / Build succeeded, 0 errors.

- [ ] **Step 4: Sanity-check the decoder against a real code**

Generate a code from the web encoder and confirm the C# decoder agrees. From `C:\Users\esthe\Documents\Dev\ffxiv-helper` run:

```bash
npx tsx -e "import('./src/features/craftLists/listCode.ts').then(m=>console.log(m.encodeListCode('Set of Fending',[{itemId:100,itemName:'Gunblade',qty:1,isHq:false},{itemId:200,itemName:'Surcoat',qty:2,isHq:true}])))"
```

Note the printed `qq:list:v1:…` string. (Round-trip correctness of the codec is covered by manual verification in Task 8 — paste this exact string into the plugin and confirm name + 2 items, qty 1 and 2, second HQ.)

- [ ] **Step 5: Commit (in the qiqirn-companion repo)**

```bash
git add Models/CraftListModels.cs Services/ListCodec.cs
git commit -m "feat(craft-lists): plugin models + qq:list:v1 decoder"
```

---

## Task 4: Plugin — `ApiClient.GetListBreakdownAsync` + config

**Files (qiqirn-companion):**
- Modify: `Services/ApiClient.cs`
- Modify: `Configuration.cs`

- [ ] **Step 1: Add the API method**

In `Services/ApiClient.cs`, add `using QiqirnCompanion.Models;` to the usings, then add this method inside the `ApiClient` class (e.g. after `GetCraftableAsync`):

```csharp
    /// <summary>Resolve a whole crafting list into final items + flat ingredients
    /// (sub-crafts by depth, sources, used-to-craft). Reuses the web resolver server-side.</summary>
    public async Task<ListBreakdown?> GetListBreakdownAsync(IEnumerable<ImportedListItem> items)
    {
        var body = new { items = new List<object>() };
        foreach (var it in items)
            body.items.Add(new { itemId = it.ItemId, qty = it.Qty, hq = it.Hq });
        var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        var res     = await _http.PostAsync("api/plugin/craft-breakdown", content);
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<ListBreakdown>(_json);
    }
```

- [ ] **Step 2: Add config fields**

In `Configuration.cs`, add `using System.Collections.Generic;` and `using QiqirnCompanion.Models;`, then add these properties (after `Planner`):

```csharp
    /// <summary>Crafting lists imported via qq:list: paste-code, persisted locally.</summary>
    public List<ImportedList> ImportedLists { get; set; } = new();

    /// <summary>Id of the currently selected imported list (empty = none).</summary>
    public string ActiveListId { get; set; } = string.Empty;
```

- [ ] **Step 3: Build to verify**

Run: `dotnet build -clp:ErrorsOnly`
Expected: Build succeeded, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add Services/ApiClient.cs Configuration.cs
git commit -m "feat(craft-lists): plugin GetListBreakdownAsync + imported-lists config"
```

---

## Task 5: Plugin — `CraftListsWindow` shell + LISTS tab + wire-in

**Files (qiqirn-companion):**
- Create: `Windows/CraftListsWindow.cs`
- Modify: `Plugin.cs`, `Windows/MainWindow.cs`

- [ ] **Step 1: Create the window with the LISTS tab (RECIPES/INGREDIENTS are placeholders for now)**

Create `Windows/CraftListsWindow.cs`:

```csharp
using Dalamud.Bindings.ImGui;
using QiqirnCompanion.Models;
using QiqirnCompanion.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using System.Threading.Tasks;

namespace QiqirnCompanion.Windows;

/// <summary>
/// The Crafting Lists panel: import a qq:list: code, then view the active list's
/// resolved breakdown across LISTS / RECIPES / INGREDIENTS sub-tabs. Drawn as a
/// tab inside MainWindow via DrawContent().
/// </summary>
public class CraftListsWindow
{
    private readonly Configuration _config;
    private readonly ApiClient     _api;

    // Import box state
    private string         _codeInput   = string.Empty;
    private ImportedList?  _decoded     = null;  // preview of a valid pasted code
    private string         _listFilter  = string.Empty;

    // Active breakdown state
    private string         _activeId    = string.Empty;
    private ListBreakdown? _breakdown   = null;
    private bool           _loading     = false;
    private string         _error       = string.Empty;

    public CraftListsWindow(Configuration config, ApiClient api)
    {
        _config = config;
        _api    = api;
    }

    public void DrawContent()
    {
        if (!ImGui.BeginTabBar("##cl_subtabs")) return;
        DrawListsTab();
        DrawRecipesTab();
        DrawIngredientsTab();
        ImGui.EndTabBar();
    }

    private ImportedList? Active =>
        _config.ImportedLists.FirstOrDefault(l => l.Id == _config.ActiveListId);

    // ── LISTS tab ───────────────────────────────────────────────────────────
    private void DrawListsTab()
    {
        if (!ImGui.BeginTabItem("Lists")) return;

        ImGui.TextDisabled("Import from Qiqirn — paste a list code (the web 'Send to plugin' button)");
        ImGui.SetNextItemWidth(420);
        if (ImGui.InputTextWithHint("##clcode", "qq:list:v1:…", ref _codeInput, 8192))
            _decoded = ListCodec.Decode(_codeInput);

        if (_decoded != null)
        {
            ImGui.TextColored(new Vector4(0.4f, 0.9f, 0.4f, 1f),
                $"✓ {_decoded.Name} — {_decoded.Items.Count} items · ready to import");
            ImGui.SameLine();
            if (ImGui.Button("Import##cl"))
            {
                _config.ImportedLists.Insert(0, _decoded);
                _config.ActiveListId = _decoded.Id;
                _config.Save();
                _codeInput = string.Empty;
                _decoded   = null;
                LoadBreakdown();
            }
        }
        else if (!string.IsNullOrWhiteSpace(_codeInput))
        {
            ImGui.TextDisabled("Not a valid qq:list:v1: code.");
        }

        ImGui.Separator();

        if (_config.ImportedLists.Count == 0)
        {
            ImGui.TextDisabled("No lists yet. Build one on qiqirn.tools, hit 'Send to plugin', and paste the code above.");
            ImGui.EndTabItem();
            return;
        }

        ImGui.SetNextItemWidth(260);
        ImGui.InputTextWithHint("##clfilter", "Filter lists…", ref _listFilter, 100);

        ImGui.SameLine();
        if (ImGui.Button("Refresh##cl") && Active != null) LoadBreakdown();
        if (_loading) { ImGui.SameLine(); ImGui.TextDisabled("Loading…"); }
        if (!string.IsNullOrEmpty(_error)) ImGui.TextColored(new Vector4(1, 0.3f, 0.3f, 1), _error);

        var q = _listFilter.Trim();
        foreach (var list in _config.ImportedLists.ToList())
        {
            if (q.Length > 0 && !list.Name.Contains(q, StringComparison.OrdinalIgnoreCase)) continue;

            var isActive = list.Id == _config.ActiveListId;
            if (ImGui.Selectable($"{list.Name}##cl{list.Id}", isActive))
            {
                _config.ActiveListId = list.Id;
                _config.Save();
                LoadBreakdown();
            }
            ImGui.SameLine();
            ImGui.TextDisabled($"  {list.Items.Count} items");
            ImGui.SameLine();
            if (ImGui.SmallButton($"×##del{list.Id}"))
            {
                _config.ImportedLists.RemoveAll(l => l.Id == list.Id);
                if (_config.ActiveListId == list.Id)
                {
                    _config.ActiveListId = string.Empty;
                    _breakdown = null;
                }
                _config.Save();
            }
        }

        ImGui.EndTabItem();
    }

    // Placeholders filled in by Tasks 6 & 7.
    private void DrawRecipesTab()
    {
        if (!ImGui.BeginTabItem("Recipes")) return;
        ImGui.TextDisabled("Recipes view — coming in a later task.");
        ImGui.EndTabItem();
    }

    private void DrawIngredientsTab()
    {
        if (!ImGui.BeginTabItem("Ingredients")) return;
        ImGui.TextDisabled("Ingredients view — coming in a later task.");
        ImGui.EndTabItem();
    }

    // ── Async ────────────────────────────────────────────────────────────────
    private void LoadBreakdown()
    {
        var list = Active;
        if (list == null) return;
        _activeId  = list.Id;
        _loading   = true;
        _error     = string.Empty;
        var items  = list.Items.ToList();

        Task.Run(async () =>
        {
            try
            {
                var bd = await _api.GetListBreakdownAsync(items);
                // Ignore a stale response if the user switched lists mid-flight.
                if (_activeId == list.Id) _breakdown = bd;
            }
            catch (Exception ex)
            {
                _error = $"Breakdown failed: {ex.Message}";
            }
            finally
            {
                _loading = false;
            }
        });
    }
}
```

- [ ] **Step 2: Construct it in `Plugin.cs` and pass to `MainWindow`**

In `Plugin.cs`: add a field `private readonly CraftListsWindow _craftListsWindow;` (near the other window fields). Construct it before `_mainWindow` is created:

```csharp
        _craftListsWindow = new CraftListsWindow(Config, _api);
```

Update the `_mainWindow` construction to pass it as the final argument:

```csharp
        _mainWindow = new MainWindow(Config, _api, playerState, _searchWindow, _tradingWindow, _plannerWindow, _cleanupWindow, _settingsPanel, _craftListsWindow);
```

(The `CraftListsWindow` is not a Dalamud `Window`, so it is NOT added to `_windowSystem` — it's drawn via MainWindow's tab, exactly like `_settingsPanel`.)

- [ ] **Step 3: Add the tab in `MainWindow.cs`**

In `Windows/MainWindow.cs`: add a field and constructor parameter mirroring `_settingsPanel`:

```csharp
    private readonly CraftListsWindow _craftListsWindow;
```

Add `, CraftListsWindow craftListsWindow` to the constructor signature (last parameter) and `_craftListsWindow = craftListsWindow;` in the body.

In `Draw()`, add a call after `DrawProjectsTab();`:

```csharp
        DrawCraftListsTab();
```

Add the method (near the other tab methods):

```csharp
    private void DrawCraftListsTab()
    {
        if (!ImGui.BeginTabItem("Craft Lists")) return;
        _craftListsWindow.DrawContent();
        ImGui.EndTabItem();
    }
```

- [ ] **Step 4: Build to verify**

Run: `dotnet build -clp:ErrorsOnly`
Expected: Build succeeded, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add Windows/CraftListsWindow.cs Plugin.cs Windows/MainWindow.cs
git commit -m "feat(craft-lists): plugin Craft Lists panel shell + LISTS tab"
```

---

## Task 6: Plugin — INGREDIENTS tab

**Files (qiqirn-companion):**
- Modify: `Windows/CraftListsWindow.cs`

- [ ] **Step 1: Add ingredients-tab state fields**

In `CraftListsWindow`, add these fields (with the other state):

```csharp
    private bool _includeSaddlebag = false;
    private bool _onlyHq           = false;
    private string _exportStatus   = string.Empty;
```

- [ ] **Step 2: Add the source-tag color + label helpers**

Add these static helpers to the class:

```csharp
    private static string SourceLabel(string source) => source switch
    {
        "Crafted"     => "CRAFTED",
        "Gathered"    => "GATHERED",
        "TimedGather" => "TIMED GATHER",
        "Vendor"      => "VENDOR",
        "Tome"        => "TOME / TOKEN",
        "Crystal"     => "CRYSTAL",
        _             => "MONSTER / OTHER",
    };

    private static Vector4 RowColor(string source, int required, int inInventory)
    {
        if (inInventory >= required) return new Vector4(0.4f, 0.9f, 0.4f, 1f);        // green: have enough
        if (source == "Crafted")     return new Vector4(0.45f, 0.7f, 1f, 1f);          // blue: will be crafted
        if (inInventory > 0)         return new Vector4(0.95f, 0.85f, 0.4f, 1f);       // yellow: partial
        return new Vector4(1f, 0.45f, 0.4f, 1f);                                       // red: need gather/buy
    }
```

- [ ] **Step 3: Replace the `DrawIngredientsTab` placeholder**

Replace the placeholder `DrawIngredientsTab()` with:

```csharp
    private void DrawIngredientsTab()
    {
        if (!ImGui.BeginTabItem("Ingredients")) return;

        if (_breakdown == null)
        {
            ImGui.TextDisabled(_loading ? "Loading…" : "Select a list in the Lists tab.");
            ImGui.EndTabItem();
            return;
        }

        ImGui.Checkbox("Include Saddlebag", ref _includeSaddlebag);
        ImGui.SameLine();
        ImGui.Checkbox("Only show HQ", ref _onlyHq);
        ImGui.SameLine();
        if (ImGui.Button("Export remaining as text")) ExportRemaining();
        if (!string.IsNullOrEmpty(_exportStatus)) { ImGui.SameLine(); ImGui.TextDisabled(_exportStatus); }

        // Live bag inventory (read on the framework draw thread — safe).
        Dictionary<int, int> inv;
        try { inv = InventoryReader.AggregatedBags(_includeSaddlebag); }
        catch { inv = new Dictionary<int, int>(); }

        const ImGuiTableFlags flags =
            ImGuiTableFlags.Borders | ImGuiTableFlags.RowBg | ImGuiTableFlags.ScrollY | ImGuiTableFlags.SizingFixedFit;
        var height = ImGui.GetContentRegionAvail().Y;
        if (!ImGui.BeginTable("##cl_ingredients", 6, flags, new Vector2(0, height)))
        {
            ImGui.EndTabItem();
            return;
        }

        ImGui.TableSetupColumn("Item",         ImGuiTableColumnFlags.WidthStretch);
        ImGui.TableSetupColumn("Required",     ImGuiTableColumnFlags.WidthFixed, 70);
        ImGui.TableSetupColumn("In Inventory", ImGuiTableColumnFlags.WidthFixed, 90);
        ImGui.TableSetupColumn("Remaining",    ImGuiTableColumnFlags.WidthFixed, 80);
        ImGui.TableSetupColumn("Source",       ImGuiTableColumnFlags.WidthFixed, 120);
        ImGui.TableSetupColumn("Used to Craft",ImGuiTableColumnFlags.WidthStretch);
        ImGui.TableHeadersRow();

        foreach (var ing in _breakdown.Ingredients)
        {
            if (_onlyHq && ing.CanHq != true) continue;

            var have      = inv.GetValueOrDefault(ing.ItemId, 0);
            var remaining = Math.Max(0, ing.RequiredQty - have);
            var color     = RowColor(ing.Source, ing.RequiredQty, have);

            ImGui.TableNextRow();

            ImGui.TableSetColumnIndex(0);
            ImGui.TextColored(color, "●");
            ImGui.SameLine();
            ImGui.Selectable(ing.ItemName);
            ItemInteractions.HandleRow((uint)ing.ItemId, ing.ItemName);

            ImGui.TableSetColumnIndex(1);
            ImGui.TextUnformatted(ing.RequiredQty.ToString());

            ImGui.TableSetColumnIndex(2);
            ImGui.TextUnformatted(have.ToString());

            ImGui.TableSetColumnIndex(3);
            ImGui.TextColored(color, remaining.ToString());

            ImGui.TableSetColumnIndex(4);
            ImGui.TextUnformatted(SourceLabel(ing.Source));

            ImGui.TableSetColumnIndex(5);
            ImGui.TextUnformatted(ing.UsedToCraft.Count > 0 ? string.Join(", ", ing.UsedToCraft) : "—");
        }

        ImGui.EndTable();

        // Legend
        ImGui.TextDisabled("Green = have enough · Blue = will be crafted · Yellow = partial · Red = gather/buy.  (Retainers not counted.)");

        ImGui.EndTabItem();
    }

    private void ExportRemaining()
    {
        if (_breakdown == null) { _exportStatus = "Nothing to export"; return; }
        Dictionary<int, int> inv;
        try { inv = InventoryReader.AggregatedBags(_includeSaddlebag); }
        catch { inv = new Dictionary<int, int>(); }

        var lines = new List<string>();
        foreach (var ing in _breakdown.Ingredients)
        {
            if (_onlyHq && ing.CanHq != true) continue;
            var remaining = Math.Max(0, ing.RequiredQty - inv.GetValueOrDefault(ing.ItemId, 0));
            if (remaining > 0) lines.Add($"{ing.ItemName} x{remaining}");
        }
        if (lines.Count == 0) { _exportStatus = "Nothing remaining 🎉"; return; }
        ImGui.SetClipboardText(string.Join("\n", lines));
        _exportStatus = $"Copied {lines.Count} items";
    }
```

- [ ] **Step 4: Build to verify**

Run: `dotnet build -clp:ErrorsOnly`
Expected: Build succeeded, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add Windows/CraftListsWindow.cs
git commit -m "feat(craft-lists): plugin INGREDIENTS tab (inventory overlay + color + export)"
```

---

## Task 7: Plugin — RECIPES tab

**Files (qiqirn-companion):**
- Modify: `Windows/CraftListsWindow.cs`

- [ ] **Step 1: Add recipes-tab state fields**

```csharp
    private bool _autoScale = true;
    private int  _detailItemId = 0;
    private ItemSourcesResponse? _detail = null;
    private bool _detailLoading = false;
```

- [ ] **Step 2: Replace the `DrawRecipesTab` placeholder**

Replace the placeholder `DrawRecipesTab()` with:

```csharp
    private void DrawRecipesTab()
    {
        if (!ImGui.BeginTabItem("Recipes")) return;

        var list = Active;
        if (list == null || _breakdown == null)
        {
            ImGui.TextDisabled(_loading ? "Loading…" : "Select a list in the Lists tab.");
            ImGui.EndTabItem();
            return;
        }

        ImGui.Checkbox("Auto-scale sub-crafts", ref _autoScale);
        if (ImGui.IsItemHovered())
            ImGui.SetTooltip("When on, changing a final item's quantity re-resolves so sub-craft amounts scale with it.");
        ImGui.Separator();

        // ── Final items (editable qty) ───────────────────────────────────────
        ImGui.TextDisabled("Final items");
        foreach (var f in _breakdown.FinalItems)
        {
            ImGui.PushID(f.ItemId);
            var qty = f.Qty;
            ImGui.SetNextItemWidth(90);
            if (ImGui.InputInt("##fqty", ref qty))
            {
                qty = Math.Clamp(qty, 1, 99999);
                var li = list.Items.FirstOrDefault(x => x.ItemId == f.ItemId);
                if (li != null && qty != li.Qty)
                {
                    li.Qty = qty;
                    _config.Save();
                    if (_autoScale) LoadBreakdown();
                }
            }
            ImGui.SameLine();
            ImGui.Selectable($"{f.ItemName}{(f.Stars is > 0 ? "  " + new string('★', f.Stars.Value) : "")}");
            ItemInteractions.HandleRow((uint)f.ItemId, f.ItemName);
            if (ImGui.IsItemClicked()) LoadDetail(f.ItemId);
            ImGui.PopID();
        }

        // ── Sub-crafts grouped by depth ──────────────────────────────────────
        var crafted = _breakdown.Ingredients.Where(i => i.Source == "Crafted").ToList();
        foreach (var depth in crafted.Select(i => i.Depth ?? 1).Distinct().OrderBy(d => d))
        {
            ImGui.Spacing();
            ImGui.TextDisabled($"Sub-crafts — Level {depth}");
            foreach (var c in crafted.Where(i => (i.Depth ?? 1) == depth))
            {
                ImGui.Bullet();
                ImGui.SameLine();
                ImGui.Selectable($"{c.ItemName}  ×{c.RequiredQty}##sc{c.ItemId}");
                ItemInteractions.HandleRow((uint)c.ItemId, c.ItemName);
                if (ImGui.IsItemClicked()) LoadDetail(c.ItemId);
                if (c.UsedToCraft.Count > 0)
                {
                    ImGui.SameLine();
                    ImGui.TextDisabled($"feeds: {string.Join(", ", c.UsedToCraft)}");
                }
            }
        }

        // ── Selected recipe detail ───────────────────────────────────────────
        if (_detailItemId != 0)
        {
            ImGui.Separator();
            if (_detailLoading) { ImGui.TextDisabled("Loading recipe…"); }
            else if (_detail != null)
            {
                var recipe = _detail.Sources.OfType<RecipeSource>().FirstOrDefault();
                ImGui.TextColored(new Vector4(0.85f, 0.7f, 0.35f, 1f), _detail.ItemName);
                if (recipe != null)
                {
                    ImGui.TextDisabled($"{recipe.JobName} · Lv{recipe.Level} · yields {recipe.OutputQty}");
                    foreach (var ing in recipe.Ingredients)
                        ImGui.TextUnformatted($"  {ing.Qty}× {ing.ItemName}");
                }
                else
                {
                    ImGui.TextDisabled("No recipe (gathered / bought).");
                }
            }
        }

        ImGui.EndTabItem();
    }

    private void LoadDetail(int itemId)
    {
        _detailItemId  = itemId;
        _detail        = null;
        _detailLoading = true;
        Task.Run(async () =>
        {
            try { _detail = await _api.GetItemSourcesAsync(itemId); }
            catch { /* leave _detail null; UI shows nothing */ }
            finally { _detailLoading = false; }
        });
    }
```

> `RecipeSource`, `ItemSourcesResponse`, and `IngredientItem` already exist in `Services/ApiClient.cs`; add `using QiqirnCompanion.Services;` if not already present (it is, since the window already uses `ApiClient`/`ItemInteractions`). `OfType<RecipeSource>()` needs `using System.Linq;` (already added in Task 5).

- [ ] **Step 3: Build to verify**

Run: `dotnet build -clp:ErrorsOnly`
Expected: Build succeeded, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add Windows/CraftListsWindow.cs
git commit -m "feat(craft-lists): plugin RECIPES tab (queue + detail + auto-scale)"
```

---

## Task 8: Full verification

- [ ] **Step 1: Backend suite + lint + build (ffxiv-helper)**

From `C:\Users\esthe\Documents\Dev\ffxiv-helper`:
- `npx vitest run src/api/_list-breakdown-core.test.ts src/api/plugin-craft-breakdown.test.ts` → all pass.
- `npm run lint` → clean.
- `npm run build` → succeeds (still 12 lambdas; `plugin-craft-breakdown` unchanged in count).

- [ ] **Step 2: Plugin build (qiqirn-companion)**

From `C:\Users\esthe\Documents\Dev\qiqirn-companion`: `dotnet build` → 0 warnings, 0 errors.

- [ ] **Step 3: Manual in-game smoke**

1. Deploy/point the backend: either push the ffxiv-helper branch (Vercel rebuilds) or run `vercel dev` and set the plugin `ApiBaseUrl` to it.
2. Build the plugin and load it as a dev plugin (copy DLL to `%APPDATA%\XIVLauncher\devPlugins\QiqirnCompanion\`), `/xlplugins` → reload.
3. On qiqirn.tools, open a Craft List → **Send to plugin** (copies the code).
4. In-game `/qiqirn` → **Craft Lists** tab → **Lists** → paste the code → green confirm → **Import**.
5. **Ingredients** tab: rows show Required / In Inventory / Remaining / Source / Used-to-Craft; colors reflect bags; toggle **Include Saddlebag** and **Only show HQ**; **Export remaining as text** copies the shortfall.
6. **Recipes** tab: final items + sub-crafts by depth; click an item → recipe detail; edit a final qty with **Auto-scale** on → sub-craft quantities change after the re-resolve.
7. Remove a list (×) and confirm it disappears and persists across a window reopen.

- [ ] **Step 4: Commit any verification fixes; push branches when ready**

(Backend branch push triggers Vercel; plugin release is a separate tag-to-release flow — out of scope for this plan.)

---

## Spec coverage check

- Paste-code import (qq:list:v1) + cached imported lists + select/refresh/remove → **Tasks 3, 4, 5**.
- Server-side resolution reusing Part-1 `resolveList`, no new lambda → **Tasks 1, 2**.
- LISTS tab → **Task 5**; INGREDIENTS tab (Required/In-Inventory/Remaining/Source/Used-to-Craft + color + Only-HQ + Saddlebag + export) → **Task 6**; RECIPES tab (queue + recipe detail + qty edit + auto-scale) → **Task 7**.
- Bags-based inventory + color legend noting retainers excluded → **Task 6**.
- Out of scope (cloud sync, WS bridge, premade lists, Artisan/autocraft, retainers, node timers) → not built; matches spec.
