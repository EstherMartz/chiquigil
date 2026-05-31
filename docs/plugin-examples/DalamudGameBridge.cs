using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

// Dalamud usings you'll need — uncomment once wired into the plugin project:
// using Dalamud.Plugin.Services;            // IFramework, IClientState, IDataManager
// using Dalamud.Game.ClientState.Objects;   // for LocalPlayer
// using FFXIVClientStructs.FFXIV.Client.Game; // InventoryManager, InventoryType

namespace QiqirnCompanion.Sync;

/// <summary>
/// Dalamud-backed implementation of <see cref="IGameBridge"/>. The structure is
/// complete; the bodies marked TODO need the Dalamud service calls for your
/// plugin's target API level. Every read is marshalled onto the framework
/// thread via IFramework — never touch game memory from the socket thread.
/// </summary>
public sealed class DalamudGameBridge : IGameBridge
{
    // Inject these from Plugin.cs (Dalamud [PluginService] fields):
    //   private readonly IFramework _framework;
    //   private readonly IClientState _clientState;
    //   private readonly IDataManager _data;
    // public DalamudGameBridge(IFramework framework, IClientState clientState, IDataManager data) { ... }

    private static readonly string[] JobKeys = { "CRP", "BSM", "ARM", "GSM", "LTW", "WVR", "ALC", "CUL" };

    public Task<PlayerSnapshotMessage> GetPlayerSnapshotAsync() => RunOnFramework(() =>
    {
        // TODO: read from IClientState.LocalPlayer:
        //   world = LocalPlayer.CurrentWorld.GameData.Name
        //   dc    = LocalPlayer.CurrentWorld.GameData.DataCenter.Value.Name
        //   levels: ClassJob levels for the 8 DoH jobs (PlayerState / CharacterManager)
        var levels = new Dictionary<string, int>();
        foreach (var key in JobKeys) levels[key] = 0; // TODO: real levels

        return new PlayerSnapshotMessage
        {
            World = "", // TODO
            Dc = "",    // TODO
            CrafterLevels = levels,
        };
    });

    public Task<List<InventoryItemDto>> GetInventoryAsync(string source) => RunOnFramework(() =>
    {
        // TODO: via FFXIVClientStructs InventoryManager.Instance():
        //   bags       → InventoryType.Inventory1..4
        //   saddlebag  → InventoryType.SaddleBag1/2 (+ premium)
        //   retainers  → iterate RetainerManager + each retainer's InventoryType.RetainerPage1..7
        //   all        → union of the above
        // For each non-empty slot, emit { Id = item.ItemId, Qty = item.Quantity, Hq = (item.Flags & HQ) != 0 }.
        // Merge stacks by (id, hq) for a compact payload.
        _ = source;
        return new List<InventoryItemDto>();
    });

    public Task<GilSnapshotMessage> GetGilAsync() => RunOnFramework(() =>
    {
        // TODO: gil is item id 1 in InventoryType.Currency:
        //   InventoryManager.Instance()->GetInventoryItemCount(1)
        // Optionally sum retainer gil and read FC credits.
        return new GilSnapshotMessage
        {
            CapturedAt = Now(),
            Gil = 0, // TODO
        };
    });

    public Task<List<OwnListingDto>> GetListingsAsync() => RunOnFramework(() =>
    {
        // TODO: the player's own market listings. Easiest source is the retainer
        // sell list while the retainer bell UI / RetainerManager has it loaded:
        //   RetainerManager.Instance() → each retainer → market items (id, price, qty, hq).
        // If not loaded, return what you have and let the web show "no data".
        return new List<OwnListingDto>();
    });

    public Task<bool> ExecuteActionAsync(string action, JsonElement payload) => RunOnFramework(() =>
    {
        switch (action)
        {
            case "openMarketboard":
                // TODO: ItemFinderModule / "/pdr"-style MB open, or
                // AgentItemSearch + ItemSearchUtility.OpenMarketBoard(itemId).
                _ = GetInt(payload, "itemId");
                return true;

            case "searchItem":
                // TODO: focus/seed the in-game item search with the query string.
                _ = GetString(payload, "query");
                return true;

            case "setMapFlag":
                // TODO: AgentMap.Instance()->SetFlagMapMarker(territoryId, mapId, x, y)
                // or resolve a gathering node id to coords first.
                return true;

            case "copyToClipboard":
                // TODO: ImGui.SetClipboardText(GetString(payload, "text")) on the UI thread.
                return true;

            case "showShoppingList":
                // TODO: push payload.items ({ name, qty }[]) into your plugin's
                // shopping window and open it.
                return true;

            default:
                return false; // unknown action → actionResult { ok:false }
        }
    });

    // ── helpers ──────────────────────────────────────────────────────────────

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private static int? GetInt(JsonElement payload, string name) =>
        payload.ValueKind == JsonValueKind.Object && payload.TryGetProperty(name, out var v) && v.TryGetInt32(out var i) ? i : null;

    private static string? GetString(JsonElement payload, string name) =>
        payload.ValueKind == JsonValueKind.Object && payload.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    /// Marshal a game read/action onto the framework thread.
    private static Task<T> RunOnFramework<T>(Func<T> fn)
    {
        // TODO: return _framework.RunOnFrameworkThread(fn);
        // Stubbed so this file compiles standalone in the example folder.
        return Task.FromResult(fn());
    }
}
