/**
 * Retry helper for XIVAPI v2 paginated fetches.
 *
 * Cloudflare in front of XIVAPI occasionally returns transient 5xx (502/503/504)
 * for individual page requests. Without retry, one bad page kills a 30s+
 * catalog fetch and discards all earlier pages. tanstack-query's outer retry
 * would then restart from scratch.
 *
 * Retries on 5xx status and network errors only; 4xx fail fast.
 */

const RETRY_STATUSES: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);

export interface FetchRetryOpts {
  attempts?: number;
  initialDelayMs?: number;
  fetchImpl?: typeof fetch;
}

export async function fetchXivapiPage(url: string, opts: FetchRetryOpts = {}): Promise<Response> {
  const attempts = opts.attempts ?? 6;
  const initialDelay = opts.initialDelayMs ?? 1000;
  const fetchImpl = opts.fetchImpl ?? fetch;

  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) return res;
      if (!RETRY_STATUSES.has(res.status)) return res; // 4xx — give up, caller decides
      lastErr = new Error(`XIVAPI ${res.status}`);
    } catch (e) {
      lastErr = e; // network error — retry
    }
    if (i < attempts - 1) {
      const delay = initialDelay * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('XIVAPI fetch failed');
}
