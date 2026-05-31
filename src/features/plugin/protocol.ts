import type { CrafterLevels } from '../items/craftStatus';

// ── Capabilities (feature negotiation) ───────────────────────────────────────

export type Capability = 'playerSnapshot' | 'inventory' | 'gil' | 'listings' | 'actions';
export const ALL_CAPABILITIES: readonly Capability[] = [
  'playerSnapshot', 'inventory', 'gil', 'listings', 'actions',
] as const;
/** What the web client can make use of — advertised in the hello handshake. */
export const WEB_CAPABILITIES: Capability[] = [...ALL_CAPABILITIES];

export type InventorySource = 'bags' | 'saddlebag' | 'retainers' | 'all';
const INVENTORY_SOURCES: readonly InventorySource[] = ['bags', 'saddlebag', 'retainers', 'all'] as const;

export type ActionKind =
  | 'openMarketboard' | 'searchItem' | 'setMapFlag' | 'copyToClipboard' | 'showShoppingList';

// ── Outbound (web → plugin) ──────────────────────────────────────────────────

export interface HelloMessage {
  type: 'hello';
  v: 2;
  client: 'chiquigil-web';
  capabilities: Capability[];
}
export interface RequestInventoryMessage { type: 'requestInventory'; v: 2; id: string; source: InventorySource }
export interface RequestGilMessage { type: 'requestGil'; v: 2; id: string }
export interface RequestListingsMessage { type: 'requestListings'; v: 2; id: string }
export interface ActionMessage {
  type: 'action'; v: 2; id: string; action: ActionKind; payload: Record<string, unknown>;
}

export type PluginOutboundMessage =
  | HelloMessage | RequestInventoryMessage | RequestGilMessage | RequestListingsMessage | ActionMessage;

// ── Inbound (plugin → web) ───────────────────────────────────────────────────

export interface WelcomeMessage {
  type: 'welcome';
  v: 2;
  plugin: string;
  pluginVersion: string;
  character: { name: string; world: string; dc: string };
  capabilities: Capability[];
}

/** Existing v1 message — kept at v1 for backward compatibility. */
export interface PlayerSnapshotMessage {
  type: 'playerSnapshot';
  v: 1;
  world: string;
  dc: string;
  crafterLevels: CrafterLevels;
}

export interface InventoryItem { id: number; qty: number; hq: boolean }
export interface InventorySnapshotMessage {
  type: 'inventorySnapshot'; v: 2; reqId?: string;
  source: InventorySource; capturedAt: number; items: InventoryItem[];
}
export interface GilSnapshotMessage {
  type: 'gilSnapshot'; v: 2; reqId?: string;
  capturedAt: number; gil: number; retainerGil?: number; fcCredits?: number;
}
export interface OwnListing { itemId: number; hq: boolean; unitPrice: number; qty: number; retainer?: string }
export interface ListingsSnapshotMessage {
  type: 'listingsSnapshot'; v: 2; reqId?: string;
  capturedAt: number; listings: OwnListing[];
}
export interface ActionResultMessage { type: 'actionResult'; v: 2; reqId: string; ok: boolean; error?: string }

export type PluginInboundMessage =
  | WelcomeMessage | PlayerSnapshotMessage | InventorySnapshotMessage
  | GilSnapshotMessage | ListingsSnapshotMessage | ActionResultMessage;

// ── Builders (centralize the version + shape) ────────────────────────────────

export function buildHello(capabilities: Capability[] = WEB_CAPABILITIES): HelloMessage {
  return { type: 'hello', v: 2, client: 'chiquigil-web', capabilities };
}
export function buildRequestInventory(id: string, source: InventorySource = 'all'): RequestInventoryMessage {
  return { type: 'requestInventory', v: 2, id, source };
}
export function buildRequestGil(id: string): RequestGilMessage {
  return { type: 'requestGil', v: 2, id };
}
export function buildRequestListings(id: string): RequestListingsMessage {
  return { type: 'requestListings', v: 2, id };
}
export function buildAction(id: string, action: ActionKind, payload: Record<string, unknown>): ActionMessage {
  return { type: 'action', v: 2, id, action, payload };
}

// ── Inbound parsing / validation ─────────────────────────────────────────────

const CRAFTER_KEYS: readonly (keyof CrafterLevels)[] = [
  'CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL',
] as const;

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOptStr = (v: unknown): v is string | undefined => v === undefined || (typeof v === 'string');

function parseCapabilities(v: unknown): Capability[] | null {
  if (!Array.isArray(v)) return null;
  const out: Capability[] = [];
  for (const c of v) {
    if (typeof c === 'string' && (ALL_CAPABILITIES as readonly string[]).includes(c)) out.push(c as Capability);
  }
  return out;
}

function parsePlayerSnapshot(o: Record<string, unknown>): PlayerSnapshotMessage | null {
  if (o.v !== 1) return null;
  const world = isStr(o.world) ? o.world : null;
  const dc = isStr(o.dc) ? o.dc : null;
  const levelsRaw = o.crafterLevels as Record<string, unknown> | undefined;
  if (!world || !dc || !levelsRaw || typeof levelsRaw !== 'object') return null;
  const crafterLevels = {} as CrafterLevels;
  for (const k of CRAFTER_KEYS) {
    const v = levelsRaw[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return null;
    crafterLevels[k] = Math.floor(v);
  }
  return { type: 'playerSnapshot', v: 1, world, dc, crafterLevels };
}

function parseWelcome(o: Record<string, unknown>): WelcomeMessage | null {
  if (o.v !== 2) return null;
  const c = o.character as Record<string, unknown> | undefined;
  if (!isStr(o.plugin) || !isStr(o.pluginVersion) || !c || typeof c !== 'object') return null;
  if (!isStr(c.name) || !isStr(c.world) || !isStr(c.dc)) return null;
  const capabilities = parseCapabilities(o.capabilities);
  if (!capabilities) return null;
  return {
    type: 'welcome', v: 2, plugin: o.plugin, pluginVersion: o.pluginVersion,
    character: { name: c.name, world: c.world, dc: c.dc }, capabilities,
  };
}

function parseInventorySnapshot(o: Record<string, unknown>): InventorySnapshotMessage | null {
  if (o.v !== 2 || !isNum(o.capturedAt) || !isOptStr(o.reqId)) return null;
  if (typeof o.source !== 'string' || !(INVENTORY_SOURCES as readonly string[]).includes(o.source)) return null;
  if (!Array.isArray(o.items)) return null;
  const items: InventoryItem[] = [];
  for (const raw of o.items) {
    if (!raw || typeof raw !== 'object') return null;
    const it = raw as Record<string, unknown>;
    if (!isNum(it.id) || !isNum(it.qty) || typeof it.hq !== 'boolean') return null;
    items.push({ id: it.id, qty: it.qty, hq: it.hq });
  }
  return { type: 'inventorySnapshot', v: 2, reqId: o.reqId as string | undefined, source: o.source as InventorySource, capturedAt: o.capturedAt, items };
}

function parseGilSnapshot(o: Record<string, unknown>): GilSnapshotMessage | null {
  if (o.v !== 2 || !isNum(o.capturedAt) || !isNum(o.gil) || !isOptStr(o.reqId)) return null;
  if (o.retainerGil !== undefined && !isNum(o.retainerGil)) return null;
  if (o.fcCredits !== undefined && !isNum(o.fcCredits)) return null;
  return {
    type: 'gilSnapshot', v: 2, reqId: o.reqId as string | undefined, capturedAt: o.capturedAt, gil: o.gil,
    retainerGil: o.retainerGil as number | undefined, fcCredits: o.fcCredits as number | undefined,
  };
}

function parseListingsSnapshot(o: Record<string, unknown>): ListingsSnapshotMessage | null {
  if (o.v !== 2 || !isNum(o.capturedAt) || !isOptStr(o.reqId) || !Array.isArray(o.listings)) return null;
  const listings: OwnListing[] = [];
  for (const raw of o.listings) {
    if (!raw || typeof raw !== 'object') return null;
    const l = raw as Record<string, unknown>;
    if (!isNum(l.itemId) || !isNum(l.unitPrice) || !isNum(l.qty) || typeof l.hq !== 'boolean' || !isOptStr(l.retainer)) return null;
    listings.push({ itemId: l.itemId, unitPrice: l.unitPrice, qty: l.qty, hq: l.hq, retainer: l.retainer as string | undefined });
  }
  return { type: 'listingsSnapshot', v: 2, reqId: o.reqId as string | undefined, capturedAt: o.capturedAt, listings };
}

function parseActionResult(o: Record<string, unknown>): ActionResultMessage | null {
  if (o.v !== 2 || !isStr(o.reqId) || typeof o.ok !== 'boolean' || !isOptStr(o.error)) return null;
  return { type: 'actionResult', v: 2, reqId: o.reqId, ok: o.ok, error: o.error as string | undefined };
}

/**
 * Parse + strictly validate an inbound message from the plugin. Returns null on
 * any malformed input. `playerSnapshot` stays v1 for backward compatibility;
 * all new message types are v2.
 */
export function parseInboundMessage(raw: string): PluginInboundMessage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  switch (o.type) {
    case 'playerSnapshot':   return parsePlayerSnapshot(o);
    case 'welcome':          return parseWelcome(o);
    case 'inventorySnapshot':return parseInventorySnapshot(o);
    case 'gilSnapshot':      return parseGilSnapshot(o);
    case 'listingsSnapshot': return parseListingsSnapshot(o);
    case 'actionResult':     return parseActionResult(o);
    default:                 return null;
  }
}
