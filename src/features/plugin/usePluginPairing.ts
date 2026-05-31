import { useEffect } from 'react';
import { usePluginStore } from './pluginStore';

/**
 * One-click pairing. The Dalamud plugin opens the default browser to
 * `https://qiqirn.tools/settings#pair=<token>[&url=<ws-url>]`. The token rides
 * in the URL *fragment*, so it never reaches the server or server logs. We
 * consume it, enable the connection, and strip the hash so the secret isn't
 * left sitting in the address bar or history.
 *
 * Mount once at the app root (next to usePluginConnection).
 */
export function usePluginPairing(): void {
  useEffect(() => {
    function consumeHash() {
      const hash = window.location.hash;
      if (!hash || !hash.includes('pair=')) return;
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const token = params.get('pair');
      if (!token) return;

      const url = params.get('url');
      const { setToken, setUrl, setEnabled } = usePluginStore.getState();
      setToken(token);
      if (url) setUrl(url);
      setEnabled(true);

      // Drop the fragment without a reload or a new history entry.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    consumeHash();
    window.addEventListener('hashchange', consumeHash);
    return () => window.removeEventListener('hashchange', consumeHash);
  }, []);
}
