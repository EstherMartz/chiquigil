# Plugin Live-Sync — C# Implementation Guide

How to build the **direct, real-time link** between the QiqirnCompanion Dalamud
plugin and the qiqirn.tools web app. This is separate from the HTTP browse API
(`PluginApiClient.cs` / `plugin-browsing-api.md`): the plugin runs a **local
WebSocket server**, the web connects as the client, and they speak
**protocol v2** (`src/features/plugin/protocol.ts`).

The web side is already shipped. This guide + the scaffold files implement the
plugin side to the same contract, so the two are drop-in compatible.

## Files provided (copy into the plugin repo)

```
QiqirnCompanion/
└── Sync/
    ├── SyncProtocol.cs      — message DTOs (C# mirror of protocol.ts) + parsing
    ├── IGameBridge.cs       — what the server needs from the game
    ├── DalamudGameBridge.cs — Dalamud-backed reads/actions (TODOs to fill in)
    └── LiveSyncServer.cs    — the WebSocket server + handshake + dispatch
```

## Architecture

```
[FFXIV + Dalamud]
   │  IFramework / IClientState / InventoryManager / RetainerManager / AgentMap
   ▼
[DalamudGameBridge]  ──implements──▶  IGameBridge
   ▲
   │ reads/actions (on framework thread)
[LiveSyncServer]  ws://127.0.0.1:7331/sync   ◀── token + Origin gated
   ▲
   │ WebSocket (text JSON, protocol v2)
[qiqirn.tools web app]  usePluginConnection → pluginBridge
```

## Message flow (matches the web exactly)

1. Web connects to `ws://127.0.0.1:7331/sync?token=…` and sends `hello`.
2. Plugin replies `welcome` (plugin name/version, character, capabilities), then
   an initial `playerSnapshot`, then pushes `playerSnapshot` every ~15s.
3. Web requests data on demand:
   `requestInventory|requestGil|requestListings` (each with an `id`) →
   plugin answers with the matching `*Snapshot` carrying `reqId`.
4. Web sends `action {id, action, payload}` →
   plugin runs it and replies `actionResult {reqId, ok, error?}`.

All shapes/field-casing are defined in `SyncProtocol.cs`; `crafterLevels` keeps
its uppercase job keys (`CRP`…`CUL`).

## Wiring into Plugin.cs

```csharp
using QiqirnCompanion.Sync;

public sealed class Plugin : IDalamudPlugin
{
    [PluginService] internal static IFramework Framework { get; private set; } = null!;
    [PluginService] internal static IClientState ClientState { get; private set; } = null!;

    private LiveSyncServer? _sync;
    private Configuration _config = null!;

    public Plugin(IDalamudPluginInterface pi)
    {
        _config = pi.GetPluginConfig() as Configuration ?? new Configuration();
        if (string.IsNullOrEmpty(_config.SyncToken))
        {
            _config.SyncToken = Guid.NewGuid().ToString("N"); // strong, persisted once
            pi.SavePluginConfig(_config);
        }

        var bridge = new DalamudGameBridge(/* Framework, ClientState, … */);
        _sync = new LiveSyncServer(bridge, _config.SyncToken, port: 7331, pluginVersion: "2.0.0");
        if (_config.SyncEnabled) _sync.Start();
    }

    public void Dispose() => _sync?.Dispose();
}
```

`Configuration.cs` additions:

```csharp
public string SyncToken { get; set; } = "";      // generated once, persisted
public bool   SyncEnabled { get; set; } = true;
public string WebOrigin { get; set; } = "https://qiqirn.tools";
```

## One-click pairing (config window button)

Instead of making the user copy the token, open the browser to the web app's
pairing deep link. The token rides in the **URL fragment**, so it never reaches
any server:

```csharp
if (ImGui.Button("Pair with web"))
{
    var token = Uri.EscapeDataString(_config.SyncToken);
    var url   = Uri.EscapeDataString("ws://127.0.0.1:7331/sync");
    Dalamud.Utility.Util.OpenLink($"{_config.WebOrigin}/settings#pair={token}&url={url}");
}
```

The web's `usePluginPairing` hook consumes `#pair=…`, enables the connection,
and strips the hash. (Manual URL + token paste in Settings remains a fallback.)

## Security requirements (already implemented in LiveSyncServer — keep them)

| Control | Why |
|---|---|
| Bind `http://127.0.0.1:{port}/sync/` | Loopback only; not reachable from the LAN, and no urlacl/admin needed on Windows. |
| Require `?token=` match | A malicious local app/page can reach 127.0.0.1 but can't guess the token. |
| `Origin` allowlist | Browsers always send `Origin`; blocks drive-by web pages from connecting. |
| v2 actions are benign | open MB / search / map flag / clipboard / show list — nothing spends gil or lists items. |

## Capability → Dalamud API map (fill these into DalamudGameBridge)

| Capability | Source |
|---|---|
| `playerSnapshot` | `IClientState.LocalPlayer` (world, DC); DoH job levels via PlayerState. |
| `inventory` | `InventoryManager` — `Inventory1..4`, `SaddleBag1/2`; retainers via `RetainerManager` + `RetainerPage1..7`. |
| `gil` | `InventoryManager.GetInventoryItemCount(1)` (Currency); optional retainer gil / FC credits. |
| `listings` | The player's own retainer market listings (read while the retainer/market UI is loaded). |
| `actions.openMarketboard` | `ItemFinderModule` / `AgentItemSearch` open + search by item id. |
| `actions.setMapFlag` | `AgentMap.SetFlagMapMarker(territory, map, x, y)`. |
| `actions.copyToClipboard` | `ImGui.SetClipboardText` on the UI thread. |
| `actions.showShoppingList` | Push `payload.items` into your plugin's shopping window. |

Run **every** game read/action on the framework thread (`IFramework.RunOnFrameworkThread`)
— the server calls the bridge from a background socket task.

## Build & load

```
dotnet build
# copy the DLL to %APPDATA%\XIVLauncher\devPlugins\QiqirnCompanion\
# in-game: /xlplugins → Dev Tools → Load Dev Plugin
```

## Verification

You can validate the plugin side against the **already-shipped web app** — no
guesswork about the contract:

1. **Protocol parity, no game needed:** the repo ships a reference server,
   `docs/plugin-examples/fake-plugin-server.mjs`, that implements this exact v2
   contract. Diff your plugin's JSON against it (same `welcome`, `*Snapshot`,
   `actionResult` shapes). If the web app works against the fake server, it will
   work against your plugin when the bytes match.
2. **End-to-end in-game:** load the dev plugin, click **Pair with web**, then in
   the web app confirm:
   - Settings → In-game plugin shows **Connected** + capability badges; "Pull
     inventory/gil/listings" return data.
   - **Craft from Inventory / Cleanup** → "Use in-game inventory" populates rows.
   - **Planner** → "Sync from game" sets the treasury; "Your Listings" flags undercuts.
   - **Item page** → "Open in-game MB" opens the board; **Shopping List** →
     "Send to plugin" returns `actionResult ok`.
3. **Security:** confirm a connection with a wrong `?token=` is rejected (403),
   and that connecting from an origin other than the allowlist is refused.

## Deferred (v2.1+)

- Push-on-change for inventory/gil/listings (debounced) instead of pull-only.
- `setMapFlag` by gathering node id (resolve node → coords server-side first).
- Retainer inventory edge cases (premium saddlebag, multiple retainers loaded).
