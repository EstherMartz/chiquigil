import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePluginPairing } from './usePluginPairing';
import { usePluginStore, DEFAULT_PLUGIN_URL } from './pluginStore';

beforeEach(() => {
  usePluginStore.setState({ token: '', url: DEFAULT_PLUGIN_URL, enabled: false });
  window.history.replaceState(null, '', '/settings');
});

describe('usePluginPairing', () => {
  it('consumes a #pair= fragment: sets token, enables, and strips the hash', () => {
    window.history.replaceState(null, '', '/settings#pair=secret-token-123');
    renderHook(() => usePluginPairing());

    const s = usePluginStore.getState();
    expect(s.token).toBe('secret-token-123');
    expect(s.enabled).toBe(true);
    expect(window.location.hash).toBe('');
  });

  it('also applies an optional url from the fragment', () => {
    window.history.replaceState(null, '', '/settings#pair=tok&url=ws%3A%2F%2F127.0.0.1%3A9000%2Fsync');
    renderHook(() => usePluginPairing());

    const s = usePluginStore.getState();
    expect(s.token).toBe('tok');
    expect(s.url).toBe('ws://127.0.0.1:9000/sync');
  });

  it('does nothing without a pair fragment', () => {
    window.history.replaceState(null, '', '/settings');
    renderHook(() => usePluginPairing());

    const s = usePluginStore.getState();
    expect(s.token).toBe('');
    expect(s.enabled).toBe(false);
  });
});
