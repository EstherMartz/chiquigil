import { BSON } from 'bson';
import type { WsListing, WsSale } from './marketPatch';

export interface MarketWsEvent {
  event: 'listings/add' | 'sales/add';
  item: number;
  world: number;
  listings?: WsListing[];
  sales?: WsSale[];
}
export type WsStatus = 'connecting' | 'open' | 'closed';

const WS_URL = 'wss://universalis.app/api/ws';
const CHANNELS = ['listings/add', 'sales/add'] as const;
const MAX_BACKOFF = 30_000;

/**
 * Open a Universalis market WebSocket subscribed to listings/add + sales/add for the given
 * world IDs (the only filter Universalis honors). Decodes BSON frames to MarketWsEvent and
 * calls onEvent. Reconnects with exponential backoff until close(). Generic — reused by the
 * item hook now and a live watchlist / server worker later.
 */
export function openMarketSocket(opts: {
  worldIds: number[];
  onEvent: (e: MarketWsEvent) => void;
  onStatus?: (s: WsStatus) => void;
}): { close(): void } {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = 1000;

  const connect = () => {
    if (stopped) return;
    opts.onStatus?.('connecting');
    ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      backoff = 1000;
      opts.onStatus?.('open');
      for (const w of opts.worldIds) {
        for (const ch of CHANNELS) {
          const frame: Uint8Array = BSON.serialize({ event: 'subscribe', channel: `${ch}{world=${w}}` });
          ws!.send(frame);
        }
      }
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const doc = BSON.deserialize(new Uint8Array(ev.data as ArrayBuffer)) as MarketWsEvent;
        if (doc.event === 'listings/add' || doc.event === 'sales/add') opts.onEvent(doc);
      } catch { /* ignore malformed frame */ }
    };
    ws.onclose = () => {
      opts.onStatus?.('closed');
      if (stopped) return;
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    };
    ws.onerror = () => { try { ws?.close(); } catch { /* */ } };
  };
  connect();

  return { close() { stopped = true; try { ws?.close(); } catch { /* */ } } };
}
