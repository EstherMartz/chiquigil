import type { CrafterCode } from '../features/items/types';
import type { CurrencyId } from '../lib/currencies';

export type TaskSource = 'craft' | 'workshop' | 'market' | 'vendor' | 'currency' | 'gather';

export interface CraftTaskMeta {
  job?: CrafterCode;
  world?: string;
  price?: number;
  currency?: string;        // shortLabel
  currencyId?: CurrencyId;
  costPerUnit?: number;
  gatherLevel?: number;
  timed?: boolean;
  /** CompanyCraft part name (e.g. "Hull", "Stern") — undefined for single-part workshops and standard recipes. */
  partKey?: string;
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
