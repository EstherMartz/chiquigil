import { describe, it, expect, vi } from 'vitest';
import { fetchXivapiPage, nextCursor } from './xivapiRetry';

function mockRes(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe('fetchXivapiPage', () => {
  it('returns 200 on first try', async () => {
    const f = vi.fn().mockResolvedValue(mockRes(200, { ok: true }));
    const res = await fetchXivapiPage('https://x.test/a', { fetchImpl: f, initialDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries on 502 and succeeds on second attempt', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(mockRes(502))
      .mockResolvedValueOnce(mockRes(200, { ok: true }));
    const res = await fetchXivapiPage('https://x.test/a', { fetchImpl: f, initialDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('retries on 503/504/429/408/500 then throws after attempts exhausted', async () => {
    const f = vi.fn().mockResolvedValue(mockRes(503));
    await expect(
      fetchXivapiPage('https://x.test/a', { fetchImpl: f, attempts: 3, initialDelayMs: 1 }),
    ).rejects.toThrow(/XIVAPI 503/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 4xx — returns the response immediately', async () => {
    const f = vi.fn().mockResolvedValue(mockRes(404));
    const res = await fetchXivapiPage('https://x.test/a', { fetchImpl: f, initialDelayMs: 1 });
    expect(res.status).toBe(404);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries on network error and recovers', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(mockRes(200));
    const res = await fetchXivapiPage('https://x.test/a', { fetchImpl: f, initialDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('nextCursor', () => {
  it('returns lastRowId when it differs from current cursor', () => {
    expect(nextCursor(100, 150)).toBe(150);
    expect(nextCursor(0, 42)).toBe(42);
  });

  it('force-advances by 1 when lastRowId equals current cursor (subrow loop guard)', () => {
    expect(nextCursor(263299, 263299)).toBe(263300);
    expect(nextCursor(0, 0)).toBe(1);
  });
});
