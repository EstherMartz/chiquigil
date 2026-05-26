import { describe, it, expect, vi, beforeEach } from 'vitest';
import { editOriginal, deleteMessages } from './discordApi';

beforeEach(() => { vi.restoreAllMocks(); });

describe('editOriginal', () => {
  it('PATCHes the follow-up URL with the provided content', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    await editOriginal('app123', 'token456', 'Hello world');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/webhooks/app123/token456/messages/@original');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ content: 'Hello world' });
  });
});

describe('deleteMessages', () => {
  it('calls bulkDelete for > 1 message', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    await deleteMessages('token', 'ch1', ['m1', 'm2']);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/channels/ch1/messages/bulk-delete');
  });

  it('calls single DELETE for 1 message', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    await deleteMessages('token', 'ch1', ['m1']);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain('/channels/ch1/messages/m1');
    expect(opts.method).toBe('DELETE');
  });

  it('does nothing for empty array', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await deleteMessages('token', 'ch1', []);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
