import type { CrafterCode } from '../features/items/types.js';
import type { CurrencyId } from '../lib/currencies.js';

export type TaskSource = 'craft' | 'market' | 'vendor' | 'currency' | 'gather';

export interface CraftTaskMeta {
  job?: CrafterCode;
  world?: string;
  price?: number;
  currency?: string;        // shortLabel
  currencyId?: CurrencyId;
  costPerUnit?: number;
  gatherLevel?: number;
  timed?: boolean;
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
