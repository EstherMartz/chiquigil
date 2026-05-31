using System;
using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace QiqirnCompanion.Sync;

/// <summary>
/// Local WebSocket server that implements live-sync protocol v2. The web app
/// (https://qiqirn.tools) connects as the client; this server runs inside the
/// Dalamud plugin and answers with player/inventory/gil/listing data and runs
/// web→plugin actions via <see cref="IGameBridge"/>.
///
/// Security (do not weaken):
///   • Binds to 127.0.0.1 only — never reachable from the LAN.
///   • Requires the shared token (query string ?token=…).
///   • Origin allowlist — only the deployed site (and dev origin) may connect.
/// </summary>
public sealed class LiveSyncServer : IDisposable
{
    private readonly IGameBridge _game;
    private readonly string _token;
    private readonly int _port;
    private readonly HashSet<string> _allowedOrigins;
    private readonly string _pluginVersion;

    private HttpListener? _listener;
    private CancellationTokenSource? _cts;

    public LiveSyncServer(
        IGameBridge game,
        string token,
        int port = 7331,
        string pluginVersion = "2.0.0",
        IEnumerable<string>? allowedOrigins = null)
    {
        _game = game;
        _token = token;
        _port = port;
        _pluginVersion = pluginVersion;
        _allowedOrigins = new HashSet<string>(
            allowedOrigins ?? new[] { "https://qiqirn.tools", "http://localhost:5173", "http://127.0.0.1:5173" },
            StringComparer.OrdinalIgnoreCase);
    }

    public void Start()
    {
        if (_listener != null) return;
        _cts = new CancellationTokenSource();
        _listener = new HttpListener();
        // 127.0.0.1 (loopback) requires no urlacl/admin on Windows.
        _listener.Prefixes.Add($"http://127.0.0.1:{_port}/sync/");
        _listener.Start();
        _ = AcceptLoopAsync(_cts.Token);
    }

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _listener!.IsListening)
        {
            HttpListenerContext ctx;
            try { ctx = await _listener.GetContextAsync(); }
            catch { break; } // listener stopped

            if (!ctx.Request.IsWebSocketRequest) { ctx.Response.StatusCode = 426; ctx.Response.Close(); continue; }

            var token = ctx.Request.QueryString["token"];
            var origin = ctx.Request.Headers["Origin"];
            if (token != _token || (origin != null && !_allowedOrigins.Contains(origin)))
            {
                ctx.Response.StatusCode = 403;
                ctx.Response.Close();
                continue;
            }

            _ = HandleClientAsync(ctx, ct);
        }
    }

    private async Task HandleClientAsync(HttpListenerContext ctx, CancellationToken serverCt)
    {
        WebSocket ws;
        try { ws = (await ctx.AcceptWebSocketAsync(subProtocol: null)).WebSocket; }
        catch { ctx.Response.StatusCode = 500; ctx.Response.Close(); return; }

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(serverCt);
        var ct = linked.Token;
        Task? pulse = null;

        try
        {
            var buffer = new byte[16 * 1024];
            var sb = new StringBuilder();

            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
                    break;
                }
                if (result.MessageType != WebSocketMessageType.Text) continue;

                sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                if (!result.EndOfMessage) continue;
                var raw = sb.ToString();
                sb.Clear();

                var msg = InboundMessage.Parse(raw);
                if (msg == null) continue;

                switch (msg.Type)
                {
                    case "hello":
                        var snap = await _game.GetPlayerSnapshotAsync();
                        await SendAsync(ws, new WelcomeMessage
                        {
                            PluginVersion = _pluginVersion,
                            Character = new CharacterDto { Name = await GetCharacterNameAsync(), World = snap.World, Dc = snap.Dc },
                        }, ct);
                        await SendAsync(ws, snap, ct);                 // initial player snapshot
                        pulse ??= PlayerPulseAsync(ws, ct);            // then a periodic refresh
                        break;

                    case "requestInventory":
                        await SendAsync(ws, new InventorySnapshotMessage
                        {
                            ReqId = msg.Id,
                            Source = msg.Source ?? "all",
                            CapturedAt = Now(),
                            Items = await _game.GetInventoryAsync(msg.Source ?? "all"),
                        }, ct);
                        break;

                    case "requestGil":
                        var gil = await _game.GetGilAsync();
                        await SendAsync(ws, new GilSnapshotMessage
                        {
                            ReqId = msg.Id, CapturedAt = Now(),
                            Gil = gil.Gil, RetainerGil = gil.RetainerGil, FcCredits = gil.FcCredits,
                        }, ct);
                        break;

                    case "requestListings":
                        await SendAsync(ws, new ListingsSnapshotMessage
                        {
                            ReqId = msg.Id, CapturedAt = Now(),
                            Listings = await _game.GetListingsAsync(),
                        }, ct);
                        break;

                    case "action":
                        var ok = false; string? err = null;
                        try { ok = await _game.ExecuteActionAsync(msg.Action ?? "", msg.Payload); }
                        catch (Exception ex) { err = ex.Message; }
                        await SendAsync(ws, new ActionResultMessage { ReqId = msg.Id ?? "", Ok = ok, Error = ok ? null : (err ?? "failed") }, ct);
                        break;
                }
            }
        }
        catch (OperationCanceledException) { /* shutdown */ }
        catch { /* client dropped */ }
        finally
        {
            linked.Cancel();
            if (pulse != null) { try { await pulse; } catch { } }
            ws.Dispose();
        }
    }

    /// Push a fresh playerSnapshot every 15s so the web stays in sync without polling.
    private async Task PlayerPulseAsync(WebSocket ws, CancellationToken ct)
    {
        try
        {
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(15), ct);
                await SendAsync(ws, await _game.GetPlayerSnapshotAsync(), ct);
            }
        }
        catch (OperationCanceledException) { }
        catch { }
    }

    private static async Task SendAsync<T>(WebSocket ws, T message, CancellationToken ct)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(message, SyncJson.Options);
        await ws.SendAsync(new ArraySegment<byte>(json), WebSocketMessageType.Text, true, ct);
    }

    // The character name belongs on the welcome handshake; pull it from the bridge.
    private async Task<string> GetCharacterNameAsync()
    {
        // If you expose the name on the bridge, read it there. Otherwise reuse the
        // player snapshot's world/dc and read LocalPlayer.Name in the bridge.
        await Task.CompletedTask;
        return ""; // TODO: surface from IGameBridge / IClientState
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public void Dispose()
    {
        try { _cts?.Cancel(); } catch { }
        try { _listener?.Stop(); _listener?.Close(); } catch { }
        _listener = null;
    }
}
