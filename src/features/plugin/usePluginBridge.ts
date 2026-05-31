import { useMemo } from 'react';
import { usePluginStore } from './pluginStore';
import { usePluginDataStore } from './pluginDataStore';
import { sendRequest } from './pluginBridge';
import {
  buildRequestInventory, buildRequestGil, buildRequestListings, buildAction,
  type Capability, type InventorySource, type ActionKind,
  type InventorySnapshotMessage, type GilSnapshotMessage, type ListingsSnapshotMessage,
  type ActionResultMessage,
} from './protocol';

export interface ActionOutcome { ok: boolean; error?: string }

/**
 * The single surface other features use to talk to the in-game plugin. Methods
 * resolve against the plugin's reply (or reject on timeout/disconnect). Gate UI
 * on `connected && has(capability)` — everything no-ops gracefully when the
 * plugin is absent or doesn't advertise the capability.
 */
export function usePluginBridge() {
  const status = usePluginStore((s) => s.status);
  const capabilities = usePluginDataStore((s) => s.capabilities);
  const character = usePluginDataStore((s) => s.character);
  const connected = status === 'open';

  return useMemo(() => {
    const has = (c: Capability) => capabilities.includes(c);

    async function action(kind: ActionKind, payload: Record<string, unknown>): Promise<ActionOutcome> {
      const reply = (await sendRequest((id) => buildAction(id, kind, payload))) as ActionResultMessage;
      if (reply.type !== 'actionResult') return { ok: false, error: 'Unexpected reply' };
      return { ok: reply.ok, error: reply.error };
    }

    return {
      connected,
      capabilities,
      character,
      has,

      // On-demand pulls
      requestInventory: (source: InventorySource = 'all') =>
        sendRequest((id) => buildRequestInventory(id, source)) as Promise<InventorySnapshotMessage>,
      requestGil: () => sendRequest((id) => buildRequestGil(id)) as Promise<GilSnapshotMessage>,
      requestListings: () => sendRequest((id) => buildRequestListings(id)) as Promise<ListingsSnapshotMessage>,

      // Web → plugin actions
      openMarketboard: (itemId: number) => action('openMarketboard', { itemId }),
      searchItem: (query: string) => action('searchItem', { query }),
      setMapFlag: (payload: Record<string, unknown>) => action('setMapFlag', payload),
      copyToClipboard: (text: string) => action('copyToClipboard', { text }),
      pushShoppingList: (items: { name: string; qty: number }[]) => action('showShoppingList', { items }),
    };
  }, [connected, capabilities, character]);
}
