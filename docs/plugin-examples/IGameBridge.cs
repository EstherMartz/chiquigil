using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace QiqirnCompanion.Sync;

/// <summary>
/// Everything the live-sync server needs from the game. Implement this against
/// Dalamud services (see DalamudGameBridge). Kept separate from the WebSocket
/// transport so the server is testable with a fake bridge and the Dalamud
/// specifics live in one place.
///
/// IMPORTANT: all game reads must run on the framework thread. Marshal via
/// IFramework.RunOnFrameworkThread(...) inside the implementation; the server
/// calls these from a background socket task.
/// </summary>
public interface IGameBridge
{
    /// Current character world/DC + the 8 DoH job levels (keys CRP..CUL).
    Task<PlayerSnapshotMessage> GetPlayerSnapshotAsync();

    /// Inventory for the requested source: "bags" | "saddlebag" | "retainers" | "all".
    Task<List<InventoryItemDto>> GetInventoryAsync(string source);

    /// Current character gil (+ optional retainer gil / FC credits).
    Task<GilSnapshotMessage> GetGilAsync();

    /// The player's own active marketboard retainer listings.
    Task<List<OwnListingDto>> GetListingsAsync();

    /// <summary>
    /// Run a web→plugin action. Return true on success, false (or throw) on
    /// failure. Recognized actions and payload fields:
    ///   openMarketboard  { itemId:number }
    ///   searchItem       { query:string }
    ///   setMapFlag       { zoneId,x,y } | { gatheringNodeId }
    ///   copyToClipboard  { text:string }
    ///   showShoppingList { items: { name:string, qty:number }[] }
    /// </summary>
    Task<bool> ExecuteActionAsync(string action, JsonElement payload);
}
