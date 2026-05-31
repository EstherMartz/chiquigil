using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace QiqirnCompanion.Sync;

// ─────────────────────────────────────────────────────────────────────────────
// Live-sync protocol v2 — C# mirror of src/features/plugin/protocol.ts.
//
// The plugin hosts a local WebSocket server; the qiqirn.tools web app connects
// as the client. These DTOs MUST serialize to exactly the shapes the web parser
// validates (see protocol.ts / the fake-plugin server). Field casing is handled
// by JsonNamingPolicy.CamelCase, except crafterLevels which keeps its uppercase
// job keys (CRP, BSM, …) because it's a dictionary.
//
// playerSnapshot stays at v=1 for backward compatibility; everything else is v=2.
// ─────────────────────────────────────────────────────────────────────────────

public static class SyncJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

public static class Capabilities
{
    public const string PlayerSnapshot = "playerSnapshot";
    public const string Inventory = "inventory";
    public const string Gil = "gil";
    public const string Listings = "listings";
    public const string Actions = "actions";

    /// What this plugin build supports — sent in the welcome handshake.
    public static readonly string[] All =
        { PlayerSnapshot, Inventory, Gil, Listings, Actions };
}

// ── Outbound (plugin → web) ──────────────────────────────────────────────────

public sealed class WelcomeMessage
{
    public string Type => "welcome";
    public int V => 2;
    public string Plugin { get; init; } = "qiqirn-companion";
    public string PluginVersion { get; init; } = "2.0.0";
    public CharacterDto Character { get; init; } = new();
    public string[] Capabilities { get; init; } = QiqirnCompanion.Sync.Capabilities.All;
}

public sealed class CharacterDto
{
    public string Name { get; init; } = "";
    public string World { get; init; } = "";
    public string Dc { get; init; } = "";
}

public sealed class PlayerSnapshotMessage
{
    public string Type => "playerSnapshot";
    public int V => 1; // intentionally v1 — backward compatible
    public string World { get; init; } = "";
    public string Dc { get; init; } = "";
    // Uppercase job keys preserved by using a dictionary (CRP, BSM, ARM, GSM, LTW, WVR, ALC, CUL).
    public Dictionary<string, int> CrafterLevels { get; init; } = new();
}

public sealed class InventoryItemDto
{
    public int Id { get; init; }
    public int Qty { get; init; }
    public bool Hq { get; init; }
}

public sealed class InventorySnapshotMessage
{
    public string Type => "inventorySnapshot";
    public int V => 2;
    public string? ReqId { get; init; }
    public string Source { get; init; } = "all"; // bags | saddlebag | retainers | all
    public long CapturedAt { get; init; }
    public List<InventoryItemDto> Items { get; init; } = new();
}

public sealed class GilSnapshotMessage
{
    public string Type => "gilSnapshot";
    public int V => 2;
    public string? ReqId { get; init; }
    public long CapturedAt { get; init; }
    public long Gil { get; init; }
    public long? RetainerGil { get; init; }
    public long? FcCredits { get; init; }
}

public sealed class OwnListingDto
{
    public int ItemId { get; init; }
    public bool Hq { get; init; }
    public long UnitPrice { get; init; }
    public int Qty { get; init; }
    public string? Retainer { get; init; }
}

public sealed class ListingsSnapshotMessage
{
    public string Type => "listingsSnapshot";
    public int V => 2;
    public string? ReqId { get; init; }
    public long CapturedAt { get; init; }
    public List<OwnListingDto> Listings { get; init; } = new();
}

public sealed class ActionResultMessage
{
    public string Type => "actionResult";
    public int V => 2;
    public string ReqId { get; init; } = "";
    public bool Ok { get; init; }
    public string? Error { get; init; }
}

// ── Inbound (web → plugin) ───────────────────────────────────────────────────
// We only need the discriminator + a few fields, so parse leniently from a
// JsonDocument rather than binding a closed type hierarchy.

public sealed class InboundMessage
{
    public string Type { get; init; } = "";
    public int V { get; init; }
    public string? Id { get; init; }
    public string? Source { get; init; }
    public string? Action { get; init; }
    public JsonElement Payload { get; init; }
    public string[]? Capabilities { get; init; }

    public static InboundMessage? Parse(string raw)
    {
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            if (!root.TryGetProperty("type", out var typeEl) || typeEl.ValueKind != JsonValueKind.String)
                return null;

            return new InboundMessage
            {
                Type = typeEl.GetString()!,
                V = root.TryGetProperty("v", out var v) && v.TryGetInt32(out var vi) ? vi : 0,
                Id = root.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String ? id.GetString() : null,
                Source = root.TryGetProperty("source", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : null,
                Action = root.TryGetProperty("action", out var a) && a.ValueKind == JsonValueKind.String ? a.GetString() : null,
                Payload = root.TryGetProperty("payload", out var p) ? p.Clone() : default,
                Capabilities = root.TryGetProperty("capabilities", out var c) && c.ValueKind == JsonValueKind.Array
                    ? c.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray()
                    : null,
            };
        }
        catch
        {
            return null;
        }
    }
}
