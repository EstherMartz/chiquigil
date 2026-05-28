# QiqirnCompanion Dalamud Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone C# Dalamud plugin (`qiqirn-companion`) that lets FFXIV players browse FC craft projects and scan inventory for craftable items, all without alt-tabbing.

**Architecture:** Separate git repo using the official Dalamud plugin template (net8.0-windows). ImGui.NET provides the in-game UI. A typed `HttpClient` wrapper calls the qiqirn.tools backend APIs. `IInventoryManager` reads the game inventory. Plugin config is persisted via `IDalamudPluginInterface`.

**Tech Stack:** C# 12, .NET 8, Dalamud Plugin SDK, ImGui.NET (bundled by Dalamud), System.Text.Json, HttpClient

> ⚠️ **Prerequisites:** This plan assumes the backend plan (`2026-05-28-qiqirn-companion-backend.md`) is fully implemented and deployed first. The plugin calls `/api/plugin/claim` and `/api/plugin/craftable` — those endpoints must exist before testing the plugin end-to-end.

---

## File Map

All files live in a new repo called `qiqirn-companion` (separate from ffxiv-helper).

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `qiqirn-companion/QiqirnCompanion.csproj` | Project file, Dalamud NuGet refs |
| Create | `qiqirn-companion/Plugin.cs` | Entry point, DI wiring, window manager |
| Create | `qiqirn-companion/Configuration.cs` | Persisted settings (guild ID, API URL, char override) |
| Create | `qiqirn-companion/Services/ApiClient.cs` | Typed HttpClient wrappers for all endpoints |
| Create | `qiqirn-companion/Services/InventoryReader.cs` | Reads in-game bags via IInventoryManager |
| Create | `qiqirn-companion/Windows/MainWindow.cs` | ImGui window: Projects tab + Crafting tab |
| Create | `qiqirn-companion/Windows/ConfigWindow.cs` | Settings window opened via gear icon |

---

## Task 1: Bootstrap the repo and project file

**Files:**
- Create: `qiqirn-companion/` (new git repo)
- Create: `qiqirn-companion/QiqirnCompanion.csproj`
- Create: `qiqirn-companion/.gitignore`

- [ ] **Step 1: Create the repo**

```bash
mkdir qiqirn-companion
cd qiqirn-companion
git init
```

- [ ] **Step 2: Create `.gitignore`**

Create `qiqirn-companion/.gitignore`:
```
bin/
obj/
*.user
.vs/
```

- [ ] **Step 3: Create the project file**

Create `qiqirn-companion/QiqirnCompanion.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
    <AssemblyName>QiqirnCompanion</AssemblyName>
    <RootNamespace>QiqirnCompanion</RootNamespace>
  </PropertyGroup>

  <ItemGroup>
    <!-- Dalamud Plugin SDK — pulls in the Dalamud API interfaces -->
    <PackageReference Include="DalamudPackager" Version="2.1.13" />
  </ItemGroup>

  <ItemGroup>
    <!-- Dalamud.dll is provided at runtime by the game loader — reference locally -->
    <Reference Include="Dalamud">
      <HintPath>$(AppData)\XIVLauncher\addon\Hooks\dev\Dalamud.dll</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="ImGui.NET">
      <HintPath>$(AppData)\XIVLauncher\addon\Hooks\dev\ImGui.NET.dll</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="ImGuiScene">
      <HintPath>$(AppData)\XIVLauncher\addon\Hooks\dev\ImGuiScene.dll</HintPath>
      <Private>false</Private>
    </Reference>
  </ItemGroup>
</Project>
```

> **Note on Dalamud.dll path:** `$(AppData)` resolves to `C:\Users\<you>\AppData\Roaming`. The DLLs are placed there by XIVLauncher after it launches FFXIV at least once. If the path doesn't exist yet, launch FFXIV via XIVLauncher once first.

- [ ] **Step 4: Verify the project file resolves**

```bash
dotnet build
```

Expected: Build succeeds (no source files yet — that's fine). If it fails on missing Dalamud.dll, launch FFXIV via XIVLauncher so the DLLs are downloaded, then retry.

- [ ] **Step 5: Commit**

```bash
git add .gitignore QiqirnCompanion.csproj
git commit -m "chore: bootstrap Dalamud plugin project"
```

---

## Task 2: Configuration

**Files:**
- Create: `qiqirn-companion/Configuration.cs`

- [ ] **Step 1: Create the file**

Create `qiqirn-companion/Configuration.cs`:
```csharp
using Dalamud.Configuration;
using Dalamud.Plugin;
using System;

namespace QiqirnCompanion;

[Serializable]
public class Configuration : IPluginConfiguration
{
    public int Version { get; set; } = 1;

    /// <summary>Discord Guild (server) ID for your FC. Paste once from Discord.</summary>
    public string GuildId { get; set; } = string.Empty;

    /// <summary>Base URL for the qiqirn.tools API. Change only if self-hosting.</summary>
    public string ApiBaseUrl { get; set; } = "https://qiqirn.tools";

    /// <summary>
    /// Leave empty to auto-read from the game client (ClientState.LocalPlayer.Name).
    /// Fill in only if you want to use a different name (e.g., for an alt).
    /// </summary>
    public string CharacterNameOverride { get; set; } = string.Empty;

    // Injected by Plugin.cs after loading — used to save.
    [NonSerialized]
    private IDalamudPluginInterface? _pluginInterface;

    public void Initialize(IDalamudPluginInterface pluginInterface)
    {
        _pluginInterface = pluginInterface;
    }

    public void Save()
    {
        _pluginInterface!.SavePluginConfig(this);
    }
}
```

- [ ] **Step 2: Build to verify**

```bash
dotnet build
```

Expected: Build succeeds, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add Configuration.cs
git commit -m "feat: add Configuration with guild ID, API URL, and char override"
```

---

## Task 3: ApiClient service

**Files:**
- Create: `qiqirn-companion/Services/ApiClient.cs`

The ApiClient wraps all HTTP calls to qiqirn.tools. It returns typed records and throws `HttpRequestException` on non-2xx responses (callers should catch and display errors in UI).

- [ ] **Step 1: Create the Services folder and ApiClient**

Create `qiqirn-companion/Services/ApiClient.cs`:
```csharp
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using System.Web;

namespace QiqirnCompanion.Services;

// ── DTOs ──────────────────────────────────────────────────────────────────────

public record ApiProject(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("targetItemId")] int TargetItemId,
    [property: JsonPropertyName("targetQty")] int TargetQty
);

public record ApiTask(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("itemName")] string ItemName,
    [property: JsonPropertyName("qtyNeeded")] int QtyNeeded,
    [property: JsonPropertyName("qtyDone")] int QtyDone,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("assigneeId")] string? AssigneeId,
    [property: JsonPropertyName("assigneeName")] string? AssigneeName
);

public record ApiProjectDetail(
    [property: JsonPropertyName("project")] ApiProject Project,
    [property: JsonPropertyName("tasks")] List<ApiTask> Tasks
);

public record CraftableItem(
    [property: JsonPropertyName("itemId")] int ItemId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("qty")] int Qty,
    [property: JsonPropertyName("minNQ")] int? MinNQ,
    [property: JsonPropertyName("velocity")] double Velocity
);

// ── Client ────────────────────────────────────────────────────────────────────

public class ApiClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    public ApiClient(string baseUrl)
    {
        _http = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/") };
        _http.DefaultRequestHeaders.Add("User-Agent", "QiqirnCompanion/1.0");
    }

    /// <summary>List all open projects for a guild.</summary>
    public async Task<List<ApiProject>> GetProjectsAsync(string guildId)
    {
        var res = await _http.GetAsync($"api/projects?guild={Uri.EscapeDataString(guildId)}");
        res.EnsureSuccessStatusCode();
        var data = await res.Content.ReadFromJsonAsync<JsonElement>(_json);
        return JsonSerializer.Deserialize<List<ApiProject>>(
            data.GetProperty("projects").GetRawText(), _json) ?? [];
    }

    /// <summary>Get a project and its tasks by ID.</summary>
    public async Task<ApiProjectDetail?> GetProjectDetailAsync(int id)
    {
        var res = await _http.GetAsync($"api/projects/{id}");
        if (res.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<ApiProjectDetail>(_json);
    }

    /// <summary>Claim a task as a character. Returns the updated task, or null if already claimed.</summary>
    public async Task<ApiTask?> ClaimTaskAsync(int projectId, int taskId, string characterName, string guildId)
    {
        var body = new { projectId, taskId, characterName, guildId };
        var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        var res = await _http.PostAsync("api/plugin/claim", content);
        if (res.StatusCode == System.Net.HttpStatusCode.Conflict) return null;
        res.EnsureSuccessStatusCode();
        var data = await res.Content.ReadFromJsonAsync<JsonElement>(_json);
        return JsonSerializer.Deserialize<ApiTask>(data.GetProperty("task").GetRawText(), _json);
    }

    /// <summary>
    /// Get craftable items for a given inventory.
    /// inv is a list of (itemId, qty) pairs.
    /// </summary>
    public async Task<List<CraftableItem>> GetCraftableAsync(List<(int id, int qty)> inv)
    {
        var invJson = JsonSerializer.Serialize(
            inv.ConvertAll(x => new { id = x.id, qty = x.qty }));
        var encoded = HttpUtility.UrlEncode(invJson);
        var res = await _http.GetAsync($"api/plugin/craftable?inv={encoded}");
        res.EnsureSuccessStatusCode();
        var data = await res.Content.ReadFromJsonAsync<JsonElement>(_json);
        return JsonSerializer.Deserialize<List<CraftableItem>>(
            data.GetProperty("craftable").GetRawText(), _json) ?? [];
    }

    public void Dispose() => _http.Dispose();
}
```

- [ ] **Step 2: Build to verify**

```bash
dotnet build
```

Expected: Build succeeds, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add Services/ApiClient.cs
git commit -m "feat: add ApiClient service with typed wrappers for all qiqirn.tools endpoints"
```

---

## Task 4: InventoryReader service

**Files:**
- Create: `qiqirn-companion/Services/InventoryReader.cs`

- [ ] **Step 1: Create the file**

Create `qiqirn-companion/Services/InventoryReader.cs`:
```csharp
using Dalamud.Game.ClientState.Objects.Enums;
using Dalamud.Plugin.Services;
using FFXIVClientStructs.FFXIV.Client.Game;
using System.Collections.Generic;

namespace QiqirnCompanion.Services;

public static class InventoryReader
{
    // The four main character bags
    private static readonly InventoryType[] MainBags =
    [
        InventoryType.Inventory1,
        InventoryType.Inventory2,
        InventoryType.Inventory3,
        InventoryType.Inventory4,
    ];

    // Chocobo saddlebag (optional)
    private static readonly InventoryType[] SaddleBags =
    [
        InventoryType.SaddleBag1,
        InventoryType.SaddleBag2,
    ];

    /// <summary>
    /// Read all items from the player's bags.
    /// Returns a list of (itemId, quantity) pairs — multiple stacks of the same
    /// item are returned as separate entries; the caller can aggregate if needed.
    /// </summary>
    public static unsafe List<(int ItemId, int Qty)> ReadBags(bool includeSaddlebag = false)
    {
        var results = new List<(int, int)>();
        var manager = InventoryManager.Instance();
        if (manager == null) return results;

        var bagTypes = includeSaddlebag
            ? [.. MainBags, .. SaddleBags]
            : MainBags;

        foreach (var bagType in bagTypes)
        {
            var container = manager->GetInventoryContainer(bagType);
            if (container == null || !container->IsLoaded) continue;

            for (int i = 0; i < container->Size; i++)
            {
                var slot = container->GetInventorySlot(i);
                if (slot == null || slot->ItemId == 0) continue;
                results.Add(((int)slot->ItemId, (int)slot->Quantity));
            }
        }

        return results;
    }

    /// <summary>
    /// Aggregate ReadBags results into a map of itemId → total quantity.
    /// </summary>
    public static Dictionary<int, int> AggregatedBags(bool includeSaddlebag = false)
    {
        var agg = new Dictionary<int, int>();
        foreach (var (itemId, qty) in ReadBags(includeSaddlebag))
        {
            agg[itemId] = agg.GetValueOrDefault(itemId, 0) + qty;
        }
        return agg;
    }
}
```

- [ ] **Step 2: Build to verify**

```bash
dotnet build
```

Expected: Build succeeds. If you get `FFXIVClientStructs` errors, they resolve once `Dalamud.dll` is in place — the Dalamud reference carries the client structs.

- [ ] **Step 3: Commit**

```bash
git add Services/InventoryReader.cs
git commit -m "feat: add InventoryReader using FFXIVClientStructs unsafe inventory access"
```

---

## Task 5: MainWindow — Projects tab

**Files:**
- Create: `qiqirn-companion/Windows/MainWindow.cs` (initial version, Projects tab only)

- [ ] **Step 1: Create the Windows folder and MainWindow skeleton**

Create `qiqirn-companion/Windows/MainWindow.cs`:
```csharp
using Dalamud.Game.ClientState;
using Dalamud.Interface.Windowing;
using Dalamud.Plugin.Services;
using ImGuiNET;
using QiqirnCompanion.Services;
using System;
using System.Collections.Generic;
using System.Numerics;
using System.Threading.Tasks;

namespace QiqirnCompanion.Windows;

public class MainWindow : Window, IDisposable
{
    private readonly Configuration _config;
    private readonly ApiClient _api;
    private readonly IClientState _clientState;

    // ── Projects tab state ────────────────────────────────────────────────────
    private List<ApiProject> _projects = [];
    private int _selectedProjectIndex = 0;
    private ApiProjectDetail? _projectDetail;
    private bool _projectsLoading = false;
    private string _projectsError = string.Empty;
    private bool _claimInProgress = false;
    private string _claimError = string.Empty;

    // ── Crafting tab state ─────────────────────────────────────────────────────
    private List<CraftableItem> _craftable = [];
    private bool _craftLoading = false;
    private string _craftError = string.Empty;
    private bool _includeSaddlebag = false;

    public MainWindow(Configuration config, ApiClient api, IClientState clientState)
        : base("Qiqirn Companion##main", ImGuiWindowFlags.None)
    {
        _config = config;
        _api = api;
        _clientState = clientState;

        SizeConstraints = new WindowSizeConstraints
        {
            MinimumSize = new Vector2(460, 320),
            MaximumSize = new Vector2(900, 700),
        };
    }

    private string CharacterName =>
        !string.IsNullOrEmpty(_config.CharacterNameOverride)
            ? _config.CharacterNameOverride
            : _clientState.LocalPlayer?.Name.TextValue ?? "(not in game)";

    public override void Draw()
    {
        if (!ImGui.BeginTabBar("##tabs")) return;

        DrawProjectsTab();
        DrawCraftingTab();

        ImGui.EndTabBar();
    }

    // ── Projects tab ──────────────────────────────────────────────────────────

    private void DrawProjectsTab()
    {
        if (!ImGui.BeginTabItem("Projects")) return;

        // Header: refresh button + project dropdown
        if (ImGui.Button("↻ Refresh") || (_projects.Count == 0 && !_projectsLoading && string.IsNullOrEmpty(_projectsError)))
        {
            LoadProjects();
        }

        if (_projectsLoading)
        {
            ImGui.SameLine();
            ImGui.TextDisabled("Loading...");
        }

        if (!string.IsNullOrEmpty(_projectsError))
        {
            ImGui.TextColored(new Vector4(1, 0.3f, 0.3f, 1), _projectsError);
        }

        if (_projects.Count > 0)
        {
            ImGui.SameLine();
            ImGui.SetNextItemWidth(280);
            var projectNames = _projects.ConvertAll(p => p.Name).ToArray();
            if (ImGui.Combo("##project", ref _selectedProjectIndex, projectNames, projectNames.Length))
            {
                LoadProjectDetail(_projects[_selectedProjectIndex].Id);
            }
        }

        ImGui.Separator();

        // Tasks table
        if (_projectDetail is not null)
        {
            DrawTasksTable(_projectDetail);
        }

        // Footer: claiming-as label
        ImGui.Spacing();
        ImGui.TextDisabled($"Claiming as: {CharacterName}");

        if (!string.IsNullOrEmpty(_claimError))
        {
            ImGui.TextColored(new Vector4(1, 0.3f, 0.3f, 1), _claimError);
        }

        ImGui.EndTabItem();
    }

    private void DrawTasksTable(ApiProjectDetail detail)
    {
        const ImGuiTableFlags flags =
            ImGuiTableFlags.Borders |
            ImGuiTableFlags.RowBg |
            ImGuiTableFlags.ScrollY |
            ImGuiTableFlags.SizingFixedFit;

        if (!ImGui.BeginTable("##tasks", 5, flags, new Vector2(0, 220))) return;

        ImGui.TableSetupColumn("Item",     ImGuiTableColumnFlags.WidthStretch);
        ImGui.TableSetupColumn("Qty",      ImGuiTableColumnFlags.WidthFixed, 50);
        ImGui.TableSetupColumn("Status",   ImGuiTableColumnFlags.WidthFixed, 70);
        ImGui.TableSetupColumn("Assignee", ImGuiTableColumnFlags.WidthFixed, 140);
        ImGui.TableSetupColumn("",         ImGuiTableColumnFlags.WidthFixed, 60);
        ImGui.TableHeadersRow();

        foreach (var task in detail.Tasks)
        {
            ImGui.TableNextRow();

            ImGui.TableSetColumnIndex(0);
            ImGui.TextUnformatted(task.ItemName);

            ImGui.TableSetColumnIndex(1);
            ImGui.TextUnformatted($"{task.QtyDone}/{task.QtyNeeded}");

            ImGui.TableSetColumnIndex(2);
            var statusColor = task.Status switch
            {
                "done"    => new Vector4(0.4f, 0.9f, 0.4f, 1),
                "claimed" => new Vector4(0.9f, 0.9f, 0.4f, 1),
                _         => new Vector4(1, 1, 1, 1),
            };
            ImGui.TextColored(statusColor, task.Status);

            ImGui.TableSetColumnIndex(3);
            var assignee = task.AssigneeName ?? task.AssigneeId ?? "—";
            ImGui.TextUnformatted(assignee);

            ImGui.TableSetColumnIndex(4);
            if (task.Status == "open")
            {
                ImGui.PushID(task.Id);
                if (_claimInProgress)
                {
                    ImGui.BeginDisabled();
                }
                if (ImGui.SmallButton("Claim"))
                {
                    ClaimTask(detail.Project.Id, task.Id);
                }
                if (_claimInProgress)
                {
                    ImGui.EndDisabled();
                }
                ImGui.PopID();
            }
        }

        ImGui.EndTable();
    }

    // ── Async helpers ─────────────────────────────────────────────────────────

    private void LoadProjects()
    {
        if (string.IsNullOrEmpty(_config.GuildId))
        {
            _projectsError = "Guild ID not set — open config (⚙) and paste your Discord server ID.";
            return;
        }

        _projectsLoading = true;
        _projectsError = string.Empty;

        Task.Run(async () =>
        {
            try
            {
                _projects = await _api.GetProjectsAsync(_config.GuildId);
                _projectsError = string.Empty;
                if (_projects.Count > 0)
                {
                    _selectedProjectIndex = 0;
                    await Task.Run(() => LoadProjectDetail(_projects[0].Id));
                }
            }
            catch (Exception ex)
            {
                _projectsError = $"Failed to load projects: {ex.Message}";
            }
            finally
            {
                _projectsLoading = false;
            }
        });
    }

    private void LoadProjectDetail(int projectId)
    {
        Task.Run(async () =>
        {
            try
            {
                _projectDetail = await _api.GetProjectDetailAsync(projectId);
            }
            catch (Exception ex)
            {
                _projectsError = $"Failed to load tasks: {ex.Message}";
            }
        });
    }

    private void ClaimTask(int projectId, int taskId)
    {
        _claimInProgress = true;
        _claimError = string.Empty;

        Task.Run(async () =>
        {
            try
            {
                var updated = await _api.ClaimTaskAsync(projectId, taskId, CharacterName, _config.GuildId);
                if (updated is null)
                {
                    _claimError = "Task was already claimed — refresh to see latest state.";
                }
                else
                {
                    // Optimistically update the local task list
                    if (_projectDetail is not null)
                    {
                        var idx = _projectDetail.Tasks.FindIndex(t => t.Id == updated.Id);
                        if (idx >= 0) _projectDetail.Tasks[idx] = updated;
                    }
                }
            }
            catch (Exception ex)
            {
                _claimError = $"Claim failed: {ex.Message}";
            }
            finally
            {
                _claimInProgress = false;
            }
        });
    }

    // ── Crafting tab (stub — filled in Task 6) ────────────────────────────────

    private void DrawCraftingTab()
    {
        if (!ImGui.BeginTabItem("Crafting")) return;
        ImGui.TextDisabled("(Crafting tab coming soon)");
        ImGui.EndTabItem();
    }

    public void Dispose() { }
}
```

- [ ] **Step 2: Build to verify**

```bash
dotnet build
```

Expected: Build succeeds, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add Windows/MainWindow.cs
git commit -m "feat: add MainWindow with Projects tab (Crafting tab stub)"
```

---

## Task 6: MainWindow — Crafting tab

**Files:**
- Modify: `qiqirn-companion/Windows/MainWindow.cs` (replace crafting tab stub)

- [ ] **Step 1: Replace `DrawCraftingTab` with the full implementation**

Find the stub method in `Windows/MainWindow.cs`:
```csharp
// ── Crafting tab (stub — filled in Task 6) ────────────────────────────────

private void DrawCraftingTab()
{
    if (!ImGui.BeginTabItem("Crafting")) return;
    ImGui.TextDisabled("(Crafting tab coming soon)");
    ImGui.EndTabItem();
}
```

Replace it with:
```csharp
// ── Crafting tab ──────────────────────────────────────────────────────────────

private void DrawCraftingTab()
{
    if (!ImGui.BeginTabItem("Crafting")) return;

    // Scan button + saddlebag toggle
    if (_craftLoading) ImGui.BeginDisabled();
    if (ImGui.Button("📦 Scan Inventory"))
    {
        ScanInventory();
    }
    if (_craftLoading) ImGui.EndDisabled();

    ImGui.SameLine();
    ImGui.Checkbox("Include Saddlebag", ref _includeSaddlebag);

    if (_craftLoading)
    {
        ImGui.SameLine();
        ImGui.TextDisabled("Scanning...");
    }

    if (!string.IsNullOrEmpty(_craftError))
    {
        ImGui.TextColored(new Vector4(1, 0.3f, 0.3f, 1), _craftError);
    }

    ImGui.Separator();

    if (_craftable.Count == 0 && !_craftLoading)
    {
        ImGui.TextDisabled("Click 'Scan Inventory' to see what you can craft.");
    }
    else
    {
        DrawCraftableTable();
    }

    ImGui.EndTabItem();
}

private void DrawCraftableTable()
{
    const ImGuiTableFlags flags =
        ImGuiTableFlags.Borders |
        ImGuiTableFlags.RowBg |
        ImGuiTableFlags.ScrollY |
        ImGuiTableFlags.SizingFixedFit;

    if (!ImGui.BeginTable("##craftable", 4, flags, new Vector2(0, 260))) return;

    ImGui.TableSetupColumn("Item",         ImGuiTableColumnFlags.WidthStretch);
    ImGui.TableSetupColumn("Can Make",     ImGuiTableColumnFlags.WidthFixed, 80);
    ImGui.TableSetupColumn("Min Price NQ", ImGuiTableColumnFlags.WidthFixed, 100);
    ImGui.TableSetupColumn("Sales/day",    ImGuiTableColumnFlags.WidthFixed, 80);
    ImGui.TableHeadersRow();

    foreach (var item in _craftable)
    {
        ImGui.TableNextRow();

        ImGui.TableSetColumnIndex(0);
        // Click item name to copy to clipboard
        if (ImGui.Selectable(item.Name, false, ImGuiSelectableFlags.SpanAllColumns))
        {
            ImGui.SetClipboardText(item.Name);
        }
        if (ImGui.IsItemHovered())
        {
            ImGui.SetTooltip("Click to copy item name");
        }

        ImGui.TableSetColumnIndex(1);
        ImGui.TextUnformatted(item.Qty.ToString());

        ImGui.TableSetColumnIndex(2);
        ImGui.TextUnformatted(item.MinNQ.HasValue
            ? item.MinNQ.Value.ToString("N0")
            : "—");

        ImGui.TableSetColumnIndex(3);
        ImGui.TextUnformatted(item.Velocity > 0
            ? item.Velocity.ToString("F1")
            : "—");
    }

    ImGui.EndTable();
}

private void ScanInventory()
{
    _craftLoading = true;
    _craftError = string.Empty;
    _craftable = [];

    // Read inventory on this thread (game data — must be read synchronously before
    // leaving the framework update context; safe here because Draw runs on framework thread)
    Dictionary<int, int> aggregated;
    try
    {
        aggregated = InventoryReader.AggregatedBags(_includeSaddlebag);
    }
    catch (Exception ex)
    {
        _craftError = $"Could not read inventory: {ex.Message}";
        _craftLoading = false;
        return;
    }

    if (aggregated.Count == 0)
    {
        _craftError = "Inventory appears empty. Make sure you are logged in.";
        _craftLoading = false;
        return;
    }

    var invList = new List<(int id, int qty)>();
    foreach (var (id, qty) in aggregated) invList.Add((id, qty));

    Task.Run(async () =>
    {
        try
        {
            _craftable = await _api.GetCraftableAsync(invList);
            _craftError = string.Empty;
        }
        catch (Exception ex)
        {
            _craftError = $"Craftable fetch failed: {ex.Message}";
        }
        finally
        {
            _craftLoading = false;
        }
    });
}
```

- [ ] **Step 2: Build to verify**

```bash
dotnet build
```

Expected: Build succeeds, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add Windows/MainWindow.cs
git commit -m "feat: implement Crafting tab with inventory scan and craftable item table"
```

---

## Task 7: ConfigWindow

**Files:**
- Create: `qiqirn-companion/Windows/ConfigWindow.cs`

- [ ] **Step 1: Create the file**

Create `qiqirn-companion/Windows/ConfigWindow.cs`:
```csharp
using Dalamud.Interface.Windowing;
using ImGuiNET;
using System.Numerics;

namespace QiqirnCompanion.Windows;

public class ConfigWindow : Window
{
    private readonly Configuration _config;

    // Edit buffers — ImGui requires fixed-length char arrays via InputText
    private string _guildIdBuf;
    private string _apiBaseUrlBuf;
    private string _charOverrideBuf;

    public ConfigWindow(Configuration config)
        : base("Qiqirn Companion — Config##config",
               ImGuiWindowFlags.NoResize | ImGuiWindowFlags.NoScrollbar)
    {
        _config = config;
        Size = new Vector2(440, 220);
        SizeCondition = Dalamud.Interface.Utility.Condition.Always;

        // Copy current config into edit buffers
        _guildIdBuf     = config.GuildId;
        _apiBaseUrlBuf  = config.ApiBaseUrl;
        _charOverrideBuf = config.CharacterNameOverride;
    }

    public override void OnOpen()
    {
        // Refresh buffers from current config each time the window opens
        _guildIdBuf      = _config.GuildId;
        _apiBaseUrlBuf   = _config.ApiBaseUrl;
        _charOverrideBuf = _config.CharacterNameOverride;
    }

    public override void Draw()
    {
        ImGui.TextWrapped("Configure QiqirnCompanion. Hover any label for help.");
        ImGui.Spacing();

        ImGui.SetNextItemWidth(260);
        ImGui.InputText("Guild ID##gid", ref _guildIdBuf, 32);
        if (ImGui.IsItemHovered())
            ImGui.SetTooltip("Your Discord server (guild) ID.\nRight-click server icon → Copy Server ID.");

        ImGui.Spacing();

        ImGui.SetNextItemWidth(260);
        ImGui.InputText("API URL##url", ref _apiBaseUrlBuf, 128);
        if (ImGui.IsItemHovered())
            ImGui.SetTooltip("Leave as https://qiqirn.tools unless you are self-hosting.");

        ImGui.Spacing();

        ImGui.SetNextItemWidth(260);
        ImGui.InputText("Character Name Override##char", ref _charOverrideBuf, 64);
        if (ImGui.IsItemHovered())
            ImGui.SetTooltip("Leave empty to use your logged-in character name automatically.");

        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        if (ImGui.Button("Save"))
        {
            _config.GuildId                = _guildIdBuf.Trim();
            _config.ApiBaseUrl             = string.IsNullOrWhiteSpace(_apiBaseUrlBuf)
                                               ? "https://qiqirn.tools"
                                               : _apiBaseUrlBuf.Trim();
            _config.CharacterNameOverride  = _charOverrideBuf.Trim();
            _config.Save();
            IsOpen = false;
        }

        ImGui.SameLine();

        if (ImGui.Button("Cancel"))
        {
            IsOpen = false;
        }
    }
}
```

- [ ] **Step 2: Build to verify**

```bash
dotnet build
```

Expected: Build succeeds, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add Windows/ConfigWindow.cs
git commit -m "feat: add ConfigWindow for guild ID, API URL, and character override settings"
```

---

## Task 8: Plugin.cs entry point + build verification

**Files:**
- Create: `qiqirn-companion/Plugin.cs`

`Plugin.cs` is the Dalamud entry point. It wires together the services and windows, registers the `/qiqirn` slash command, draws a gear icon in the window title bar, and tears everything down on dispose.

- [ ] **Step 1: Create Plugin.cs**

Create `qiqirn-companion/Plugin.cs`:
```csharp
using Dalamud.Game.Command;
using Dalamud.Interface.Windowing;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;
using QiqirnCompanion.Services;
using QiqirnCompanion.Windows;

namespace QiqirnCompanion;

public sealed class Plugin : IDalamudPlugin
{
    private const string CommandName = "/qiqirn";

    private readonly IDalamudPluginInterface _pi;
    private readonly ICommandManager _commands;
    private readonly IClientState _clientState;

    public readonly Configuration Config;
    private readonly ApiClient _api;
    private readonly WindowSystem _windowSystem = new("QiqirnCompanion");

    private readonly MainWindow   _mainWindow;
    private readonly ConfigWindow _configWindow;

    public Plugin(
        IDalamudPluginInterface pluginInterface,
        ICommandManager commandManager,
        IClientState clientState)
    {
        _pi          = pluginInterface;
        _commands    = commandManager;
        _clientState = clientState;

        // Load or create config
        Config = _pi.GetPluginConfig() as Configuration ?? new Configuration();
        Config.Initialize(_pi);

        // Services
        _api = new ApiClient(Config.ApiBaseUrl);

        // Windows
        _mainWindow   = new MainWindow(Config, _api, _clientState);
        _configWindow = new ConfigWindow(Config);
        _windowSystem.AddWindow(_mainWindow);
        _windowSystem.AddWindow(_configWindow);

        // Commands
        _commands.AddHandler(CommandName, new CommandInfo(OnCommand)
        {
            HelpMessage = "Open/close the Qiqirn Companion window.",
        });

        // Hook draw loop
        _pi.UiBuilder.Draw         += DrawUI;
        _pi.UiBuilder.OpenConfigUi += ToggleConfig;
        _pi.UiBuilder.OpenMainUi   += ToggleMain;
    }

    private void OnCommand(string command, string args) => ToggleMain();

    private void ToggleMain()   => _mainWindow.Toggle();
    private void ToggleConfig() => _configWindow.Toggle();

    private void DrawUI() => _windowSystem.Draw();

    public void Dispose()
    {
        _pi.UiBuilder.Draw         -= DrawUI;
        _pi.UiBuilder.OpenConfigUi -= ToggleConfig;
        _pi.UiBuilder.OpenMainUi   -= ToggleMain;

        _commands.RemoveHandler(CommandName);
        _windowSystem.RemoveAllWindows();
        _api.Dispose();
    }
}
```

- [ ] **Step 2: Final build**

```bash
dotnet build --configuration Release
```

Expected: Build succeeds, 0 errors, 0 warnings. Output DLL at `bin/Release/net8.0-windows/QiqirnCompanion.dll`.

- [ ] **Step 3: Install into XIVLauncher dev plugins**

```bash
# Create dev plugin folder (run once)
mkdir -p "$APPDATA/XIVLauncher/devPlugins/QiqirnCompanion"

# Copy the output DLL
cp bin/Release/net8.0-windows/QiqirnCompanion.dll "$APPDATA/XIVLauncher/devPlugins/QiqirnCompanion/"
```

(On Windows in PowerShell, `$APPDATA` expands to `C:\Users\<you>\AppData\Roaming`.)

- [ ] **Step 4: Load in-game**

1. Launch FFXIV via XIVLauncher
2. Type `/xlplugins` in game chat
3. Click **Dev Tools** → **Dev Plugin Locations** → confirm the folder above is listed
4. Click **Load Dev Plugin** → select `QiqirnCompanion.dll`
5. Type `/qiqirn` — the Qiqirn Companion window should open

- [ ] **Step 5: Smoke test Projects tab**

1. Open Config (gear icon or `/xlplugins` → QiqirnCompanion → Settings)
2. Paste your Discord server ID into **Guild ID** and click **Save**
3. Switch to the **Projects** tab — open projects should appear
4. Click **Claim** on an open task → row should update to "claimed / your character name"
5. Open Discord and run `/craft show id:<projectId>` — task should show your character name as assignee

- [ ] **Step 6: Smoke test Crafting tab**

1. Switch to the **Crafting** tab
2. Click **📦 Scan Inventory** — the table should populate with items you can craft
3. Click any item name — it should be copied to clipboard

- [ ] **Step 7: Commit**

```bash
git add Plugin.cs
git commit -m "feat: add Plugin.cs entry point — wires services, windows, /qiqirn command"
```

---

## Verification Checklist

- [ ] `dotnet build --configuration Release` — 0 errors
- [ ] Plugin loads in-game without crashing (`/xlplugins`)
- [ ] `/qiqirn` opens the main window
- [ ] Config window saves guild ID, API URL, character override
- [ ] Projects tab loads project list after setting guild ID
- [ ] Claiming a task shows it as "claimed" in the row + character name in Discord `/craft show`
- [ ] Crafting tab scans bags and returns craftable items with prices
- [ ] Clicking item name in Crafting tab copies it to clipboard
