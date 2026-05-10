import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, defaultSettings } from './store';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
});

describe('settings store', () => {
  it('starts with Phantom/Chaos and the legacy retainer levels', () => {
    const s = useSettingsStore.getState();
    expect(s.world).toBe('Phantom');
    expect(s.dc).toBe('Chaos');
    expect(s.retainerLevels.LTW).toBe(100);
    expect(s.retainerLevels.BSM).toBe(33);
  });

  it('setRetainerLevel updates a single crafter', () => {
    useSettingsStore.getState().setRetainerLevel('BSM', 50);
    expect(useSettingsStore.getState().retainerLevels.BSM).toBe(50);
  });

  it('setWorld and setDc update scope', () => {
    useSettingsStore.getState().setWorld('Phoenix');
    useSettingsStore.getState().setDc('Light');
    expect(useSettingsStore.getState().world).toBe('Phoenix');
    expect(useSettingsStore.getState().dc).toBe('Light');
  });

  it('persists to localStorage under ffxiv-helper:settings', () => {
    useSettingsStore.getState().setRetainerLevel('CRP', 99);
    const raw = localStorage.getItem('ffxiv-helper:settings');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.retainerLevels.CRP).toBe(99);
  });
});
