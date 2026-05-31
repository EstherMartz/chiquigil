#!/usr/bin/env node
/**
 * Fake QiqirnCompanion plugin — a stand-in WebSocket server implementing the
 * v2 live-sync contract (docs/superpowers/specs/2026-05-31-plugin-live-sync-design.md).
 *
 * Lets the web side be developed and tested end-to-end before the real Dalamud
 * (C#) plugin exists. It speaks the same protocol as src/features/plugin/protocol.ts.
 *
 * Usage:
 *   node docs/plugin-examples/fake-plugin-server.mjs
 *   # then in the web app's Settings → In-game plugin:
 *   #   URL   ws://127.0.0.1:7331/sync
 *   #   Token (printed below on startup)
 *
 * Requires the `ws` package (already present in node_modules).
 */
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = 7331;
const PATH = '/sync';
const TOKEN = process.env.FAKE_PLUGIN_TOKEN ?? randomUUID();
// Origins a real plugin would allow; we only warn here so localhost dev is easy.
const ALLOWED_ORIGINS = ['https://qiqirn.tools', 'http://localhost:5173', 'http://127.0.0.1:5173'];

const CAPABILITIES = ['playerSnapshot', 'inventory', 'gil', 'listings', 'actions'];

// Canned data so every web feature has something to render.
const CHARACTER = { name: 'Estheria Moonweave', world: 'Phantom', dc: 'Chaos' };
const CRAFTER_LEVELS = { CRP: 100, BSM: 90, ARM: 88, GSM: 100, LTW: 100, WVR: 100, ALC: 95, CUL: 80 };
const INVENTORY = [
  { id: 5058, qty: 99, hq: false },  // Cotton Boll
  { id: 5059, qty: 40, hq: false },  // Earth Crystal-ish
  { id: 5366, qty: 12, hq: false },
  { id: 5366, qty: 3, hq: true },
];
const LISTINGS = [
  { itemId: 5766, hq: false, unitPrice: 1200, qty: 20, retainer: 'Moppet' },
  { itemId: 44232, hq: true, unitPrice: 540000, qty: 1, retainer: 'Buttons' },
];

const wss = new WebSocketServer({ port: PORT, path: PATH });

function send(ws, msg) { ws.send(JSON.stringify(msg)); }

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const token = url.searchParams.get('token');
  const origin = req.headers.origin;

  if (token !== TOKEN) {
    console.log(`✗ rejected connection (bad token) origin=${origin}`);
    ws.close(4001, 'bad token');
    return;
  }
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.log(`⚠ origin not in allowlist: ${origin} (a real plugin would reject)`);
  }
  console.log(`✓ web client connected (origin=${origin ?? 'none'})`);

  // Periodic playerSnapshot push, like the real plugin.
  const pulse = setInterval(() => {
    send(ws, { type: 'playerSnapshot', v: 1, world: CHARACTER.world, dc: CHARACTER.dc, crafterLevels: CRAFTER_LEVELS });
  }, 15000);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    console.log(`→ ${msg.type}${msg.action ? `:${msg.action}` : ''}`);

    switch (msg.type) {
      case 'hello':
        send(ws, {
          type: 'welcome', v: 2, plugin: 'qiqirn-companion-fake', pluginVersion: '2.0.0-fake',
          character: CHARACTER, capabilities: CAPABILITIES,
        });
        // Immediately push an initial player snapshot too.
        send(ws, { type: 'playerSnapshot', v: 1, world: CHARACTER.world, dc: CHARACTER.dc, crafterLevels: CRAFTER_LEVELS });
        break;
      case 'requestInventory':
        send(ws, { type: 'inventorySnapshot', v: 2, reqId: msg.id, source: msg.source ?? 'all', capturedAt: Date.now(), items: INVENTORY });
        break;
      case 'requestGil':
        send(ws, { type: 'gilSnapshot', v: 2, reqId: msg.id, capturedAt: Date.now(), gil: 4_812_300, retainerGil: 1_200_000 });
        break;
      case 'requestListings':
        send(ws, { type: 'listingsSnapshot', v: 2, reqId: msg.id, capturedAt: Date.now(), listings: LISTINGS });
        break;
      case 'action':
        // A real plugin would open the MB / set a flag / copy text here.
        console.log(`   action payload: ${JSON.stringify(msg.payload)}`);
        send(ws, { type: 'actionResult', v: 2, reqId: msg.id, ok: true });
        break;
      default:
        break;
    }
  });

  ws.on('close', () => { clearInterval(pulse); console.log('✗ web client disconnected'); });
});

console.log('Fake QiqirnCompanion plugin (v2 live-sync) listening:');
console.log(`  URL:   ws://127.0.0.1:${PORT}${PATH}`);
console.log(`  Token: ${TOKEN}`);
console.log('Paste both into the web app → Settings → In-game plugin, then enable.');
