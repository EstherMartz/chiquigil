import { usePluginDataStore } from './pluginDataStore';
import type { PluginInboundMessage, PluginOutboundMessage } from './protocol';

/**
 * Module-level singleton that owns the *active* socket and the request/response
 * correlation map, so any component (deep in the tree) can send actions or
 * on-demand requests without threading the WebSocket through React.
 *
 * `usePluginConnection` drives the lifecycle: it calls `attachSocket` on open,
 * `attachSocket(null)` on close, and `handleInbound` for every parsed message.
 */

interface Pending {
  resolve: (m: PluginInboundMessage) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let socket: WebSocket | null = null;
const pending = new Map<string, Pending>();
let counter = 0;

export const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

function nextId(): string {
  counter += 1;
  return `web-${Date.now().toString(36)}-${counter.toString(36)}`;
}

function rejectAllPending(reason: string): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
  }
  pending.clear();
}

/** Called by the connection hook when a socket opens (or null when it closes). */
export function attachSocket(s: WebSocket | null): void {
  socket = s;
  if (!s) {
    rejectAllPending('Plugin disconnected');
    usePluginDataStore.getState().reset();
  }
}

export function isConnected(): boolean {
  return socket != null && socket.readyState === WebSocket.OPEN;
}

/**
 * Route a parsed inbound message: resolve any pending request keyed by `reqId`,
 * then fold snapshot/handshake data into the live data store. `playerSnapshot`
 * settings auto-apply stays in the connection hook.
 */
export function handleInbound(msg: PluginInboundMessage): void {
  const reqId = (msg as { reqId?: unknown }).reqId;
  if (typeof reqId === 'string') {
    const p = pending.get(reqId);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(reqId);
      p.resolve(msg);
    }
  }

  const ds = usePluginDataStore.getState();
  switch (msg.type) {
    case 'welcome':           ds.setHandshake(msg); break;
    case 'inventorySnapshot': ds.setInventory(msg); break;
    case 'gilSnapshot':       ds.setGil(msg); break;
    case 'listingsSnapshot':  ds.setListings(msg); break;
    default: break; // playerSnapshot / actionResult: no store mutation here
  }
}

/** Fire-and-forget send. Returns false if the socket isn't open. */
export function send(msg: PluginOutboundMessage): boolean {
  if (!isConnected()) return false;
  socket!.send(JSON.stringify(msg));
  return true;
}

/**
 * Send a request and resolve with the matching reply (by `reqId`). `make`
 * receives a fresh correlation id and returns the outbound message.
 */
export function sendRequest(
  make: (id: string) => PluginOutboundMessage,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<PluginInboundMessage> {
  return new Promise((resolve, reject) => {
    if (!isConnected()) {
      reject(new Error('Plugin not connected'));
      return;
    }
    const id = nextId();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Plugin request timed out'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    socket!.send(JSON.stringify(make(id)));
  });
}

/** Test helper: clear socket + pending without touching the data store reset path. */
export function _resetBridgeForTests(): void {
  socket = null;
  rejectAllPending('reset');
  counter = 0;
}
