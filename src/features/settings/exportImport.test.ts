import { describe, it, expect } from 'vitest';
import { buildExportPayload, parseImportPayload } from './exportImport';
import type { SettingsState } from './store';
import type { WatchlistState } from '../items/watchlistStore';

const settings = { _v: 1, world: 'Phantom', dc: 'Chaos' } as unknown as SettingsState;
const watchlist = { _v: 1, starterPacks: { 'raid-current': true }, customItems: [], perItemFlags: {} } as unknown as WatchlistState;

describe('buildExportPayload', () => {
  it('produces a versioned object with settings + watchlist', () => {
    const out = buildExportPayload(settings, watchlist);
    expect(out.exportVersion).toBe(1);
    expect(out.settings.world).toBe('Phantom');
    expect(out.watchlist.starterPacks['raid-current']).toBe(true);
  });
});

describe('parseImportPayload', () => {
  it('returns parsed object on valid JSON', () => {
    const raw = JSON.stringify({ exportVersion: 1, settings, watchlist });
    const out = parseImportPayload(raw);
    expect(out.settings.world).toBe('Phantom');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseImportPayload('not json')).toThrow();
  });

  it('throws on missing top-level keys', () => {
    expect(() => parseImportPayload(JSON.stringify({ exportVersion: 1 }))).toThrow(/settings/);
    expect(() => parseImportPayload(JSON.stringify({ exportVersion: 1, settings }))).toThrow(/watchlist/);
  });

  it('throws on unsupported exportVersion', () => {
    expect(() => parseImportPayload(JSON.stringify({ exportVersion: 99, settings, watchlist }))).toThrow('Unsupported exportVersion');
  });
});
