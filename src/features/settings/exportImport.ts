import type { SettingsState } from './store';
import type { WatchlistState } from '../items/watchlistStore';

export interface ExportPayload {
  exportVersion: 1;
  settings: SettingsState;
  watchlist: WatchlistState;
}

const SUPPORTED_VERSIONS = [1];

export function buildExportPayload(settings: SettingsState, watchlist: WatchlistState): ExportPayload {
  return { exportVersion: 1, settings, watchlist };
}

export function parseImportPayload(raw: string): ExportPayload {
  const obj = JSON.parse(raw);
  if (typeof obj !== 'object' || obj === null) throw new Error('Invalid payload: not an object');
  if (!SUPPORTED_VERSIONS.includes(obj.exportVersion)) {
    throw new Error(`Unsupported exportVersion: ${obj.exportVersion}`);
  }
  if (!obj.settings || typeof obj.settings !== 'object') throw new Error('Invalid payload: missing settings');
  if (!obj.watchlist || typeof obj.watchlist !== 'object') throw new Error('Invalid payload: missing watchlist');
  return obj as ExportPayload;
}
