import type { CrafterCode } from '../features/items/types';
import type { CurrencyId } from '../lib/currencies';

export type TaskSource = 'craft' | 'workshop' | 'market' | 'vendor' | 'currency' | 'gather';

export type AccessLevel = 'default' | 'allow' | 'block';

export interface AppUser {
  discordId: string;
  username: string;
  avatar: string | null;
  guilds: string[];
  access: AccessLevel;
  firstSeen: number;
  lastSeen: number;
}

export interface CraftTaskMeta {
  job?: CrafterCode;
  world?: string;
  price?: number;
  currency?: string;        // shortLabel
  currencyId?: CurrencyId;
  costPerUnit?: number;
  gatherLevel?: number;
  timed?: boolean;
  /** CompanyCraft part name (e.g. "Hull", "Stern") — undefined for standard recipes. */
  partKey?: string;
  /** Zero-indexed phase within the part (0-N-1). Undefined for non-CompanyCraft tasks and workshop assembly. */
  phaseIndex?: number;
}

export interface CraftTask {
  itemId: number;
  itemName: string;
  qtyNeeded: number;
  source: TaskSource;
  meta: CraftTaskMeta;
}

export interface Breakdown {
  crafts: CraftTask[];
  acquire: CraftTask[];
}

export interface CraftProject {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  name: string;
  targetItemId: number;
  targetQty: number;
  createdBy: string;
  threadId: string | null;
  status: 'open' | 'closed';
  createdAt: number;
  /** Phase-navigation: which (part, phase) the project's embed is currently displaying. */
  displayPartKey: string | null;
  displayPhaseIndex: number | null;
}

export interface ChannelState {
  guildId: string;
  channelId: string;
  boardMessageId: string | null;
  requestMessageId: string | null;
}

export interface StoredTask {
  id: number;
  projectId: number;
  itemId: number;
  itemName: string;
  qtyNeeded: number;
  qtyDone: number;
  source: TaskSource;
  meta: CraftTaskMeta | null;
  assigneeId: string | null;
  status: 'open' | 'claimed' | 'done';
  updatedAt: number;
}
