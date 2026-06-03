import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from './craftStore';

let store: CraftStore;

beforeEach(async () => {
  store = await openCraftStore(':memory:');
});

describe('app_users store', () => {
  it('upsert inserts a row and lists it', async () => {
    await store.upsertAppUser({ discordId: 'U1', username: 'Esther', avatar: 'av1', guilds: ['G1'] });
    const users = await store.listAppUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      discordId: 'U1', username: 'Esther', avatar: 'av1', guilds: ['G1'], access: 'default',
    });
    expect(users[0].firstSeen).toBeGreaterThan(0);
    expect(users[0].lastSeen).toBeGreaterThan(0);
  });

  it('upsert preserves access and first_seen but refreshes name/last_seen', async () => {
    await store.upsertAppUser({ discordId: 'U1', username: 'Old', avatar: null, guilds: ['G1'] });
    const first = (await store.getAppUser('U1'))!;
    await store.setUserAccess('U1', 'block');
    await store.upsertAppUser({ discordId: 'U1', username: 'New', avatar: 'av2', guilds: ['G1', 'G2'] });
    const after = (await store.getAppUser('U1'))!;
    expect(after.username).toBe('New');
    expect(after.avatar).toBe('av2');
    expect(after.guilds).toEqual(['G1', 'G2']);
    expect(after.access).toBe('block');
    expect(after.firstSeen).toBe(first.firstSeen);
    expect(after.lastSeen).toBeGreaterThanOrEqual(first.lastSeen);
  });

  it('getAppUser returns null for unknown user', async () => {
    expect(await store.getAppUser('nope')).toBeNull();
  });

  it('setUserAccess updates the access level', async () => {
    await store.upsertAppUser({ discordId: 'U1', username: 'E', avatar: null, guilds: [] });
    await store.setUserAccess('U1', 'allow');
    expect((await store.getAppUser('U1'))!.access).toBe('allow');
  });
});
