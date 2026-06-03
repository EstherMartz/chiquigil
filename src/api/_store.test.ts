// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { openCraftStore } from '../bot/craftStore';
import { getStore } from './_store';

afterEach(() => { delete (globalThis as any).__testCraftStore; });

describe('getStore', () => {
  it('returns the injected test store when present', async () => {
    const injected = await openCraftStore(':memory:');
    (globalThis as any).__testCraftStore = injected;
    expect(await getStore()).toBe(injected);
  });
});
