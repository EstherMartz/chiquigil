import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../settings/store';
import { usePluginStore } from './pluginStore';
import { parseInboundMessage, type HelloMessage } from './protocol';

const BACKOFF_MS = [1000, 2000, 5000, 10000, 15000] as const;

/**
 * Owns the lifecycle of the WebSocket connection to the local Dalamud plugin.
 * Mount once at the app root. Reads runtime status via `usePluginStore`.
 */
export function usePluginConnection(): void {
  const enabled = usePluginStore((s) => s.enabled);
  const url = usePluginStore((s) => s.url);
  const token = usePluginStore((s) => s.token);

  const autoApplyRef = useRef(usePluginStore.getState().autoApplySnapshots);
  useEffect(
    () => usePluginStore.subscribe((s) => { autoApplyRef.current = s.autoApplySnapshots; }),
    [],
  );

  useEffect(() => {
    const { setRuntime } = usePluginStore.getState();
    if (!enabled || !url || !token) {
      setRuntime({ status: 'idle', lastError: null });
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function connect() {
      if (cancelled) return;
      setRuntime({ status: 'connecting', lastError: null });
      const connectUrl = `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
      let socket: WebSocket;
      try {
        socket = new WebSocket(connectUrl);
      } catch (e) {
        setRuntime({ status: 'error', lastError: (e as Error).message });
        scheduleRetry();
        return;
      }
      ws = socket;

      socket.addEventListener('open', () => {
        if (cancelled) return;
        attempt = 0;
        setRuntime({ status: 'open', lastError: null });
        const hello: HelloMessage = { type: 'hello', v: 1, client: 'chiquigil-web' };
        socket.send(JSON.stringify(hello));
      });

      socket.addEventListener('message', (ev) => {
        if (cancelled) return;
        if (typeof ev.data !== 'string') return;
        const msg = parseInboundMessage(ev.data);
        if (!msg) return;
        if (msg.type === 'playerSnapshot') {
          setRuntime({ lastSnapshotAt: Date.now() });
          if (autoApplyRef.current) {
            useSettingsStore.setState({
              world: msg.world,
              dc: msg.dc,
              retainerLevels: msg.crafterLevels,
            });
          }
        }
      });

      socket.addEventListener('error', () => {
        if (cancelled) return;
        setRuntime({ status: 'error', lastError: 'WebSocket error' });
      });

      socket.addEventListener('close', () => {
        if (cancelled) return;
        setRuntime({ status: 'closed' });
        scheduleRetry();
      });
    }

    function scheduleRetry() {
      if (cancelled) return;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
      setRuntime({ status: 'idle' });
    };
  }, [enabled, url, token]);
}
