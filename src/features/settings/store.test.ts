import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, defaultSettings } from './store';

describe('settings store — ignored items', () => {
  beforeEach(() => {
    useSettingsStore.setState({ ignoredItemIds: [], hideIgnored: true });
  });

  it('defaults to an empty list with hiding on', () => {
    const d = defaultSettings();
    expect(d.ignoredItemIds).toEqual([]);
    expect(d.hideIgnored).toBe(true);
  });

  it('ignoreItem adds an id and dedupes', () => {
    useSettingsStore.getState().ignoreItem(5);
    useSettingsStore.getState().ignoreItem(5);
    useSettingsStore.getState().ignoreItem(9);
    expect(useSettingsStore.getState().ignoredItemIds).toEqual([5, 9]);
  });

  it('unignoreItem removes an id', () => {
    useSettingsStore.setState({ ignoredItemIds: [5, 9] });
    useSettingsStore.getState().unignoreItem(5);
    expect(useSettingsStore.getState().ignoredItemIds).toEqual([9]);
  });

  it('clearIgnored empties the list', () => {
    useSettingsStore.setState({ ignoredItemIds: [5, 9] });
    useSettingsStore.getState().clearIgnored();
    expect(useSettingsStore.getState().ignoredItemIds).toEqual([]);
  });

  it('setHideIgnored toggles the master flag', () => {
    useSettingsStore.getState().setHideIgnored(false);
    expect(useSettingsStore.getState().hideIgnored).toBe(false);
  });
});
