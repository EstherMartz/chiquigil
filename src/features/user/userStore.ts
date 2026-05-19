import { useSettingsStore } from '../settings/store';

/**
 * Hook for accessing user state (world and datacenter).
 * Selector-based API using Zustand pattern.
 */
export function useUserStore<T>(selector: (state: { world: string; dc: string }) => T): T {
  return useSettingsStore(selector);
}
