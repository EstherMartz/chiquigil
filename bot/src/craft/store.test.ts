import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openCraftStore, type CraftStore } from './store';
import type { CraftTask } from './types';

describe('CraftStore', () => {
  let store: CraftStore;

  beforeEach(() => {
    store = openCraftStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  const sampleTasks: CraftTask[] = [
    { itemId: 1, itemName: 'Iron Ingot', qtyNeeded: 24, source: 'craft', meta: { job: 'BSM' } },
    { itemId: 2, itemName: 'Iron Ore', qtyNeeded: 72, source: 'gather', meta: { gatherLevel: 25 } },
    { itemId: 3, itemName: 'Fire Crystal', qtyNeeded: 48, source: 'market', meta: { world: 'Phantom', price: 50 } },
  ];

  it('creates a project and retrieves it', () => {
    const id = store.createProject({
      guildId: 'g1',
      channelId: 'c1',
      name: 'Test Project',
      targetItemId: 100,
      targetQty: 8,
      createdBy: 'u1',
    });

    const project = store.getProject(id);
    expect(project).not.toBeNull();
    expect(project!.name).toBe('Test Project');
    expect(project!.status).toBe('open');
    expect(project!.targetQty).toBe(8);
  });

  it('adds tasks and retrieves them', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    store.addTasks(projId, sampleTasks);

    const tasks = store.getTasks(projId);
    expect(tasks.length).toBe(3);
    expect(tasks.find(t => t.itemName === 'Iron Ingot')?.source).toBe('craft');
    expect(tasks.find(t => t.itemName === 'Iron Ingot')?.meta?.job).toBe('BSM');
  });

  it('claims a task', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    store.addTasks(projId, sampleTasks);

    const tasks = store.getTasks(projId);
    const taskId = tasks[0].id;

    const claimed = store.claimTask(taskId, 'user1');
    expect(claimed).toBe(true);

    const updated = store.getTasks(projId);
    const claimedTask = updated.find(t => t.id === taskId)!;
    expect(claimedTask.assigneeId).toBe('user1');
    expect(claimedTask.status).toBe('claimed');
  });

  it('prevents double-claiming', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    store.addTasks(projId, sampleTasks);
    const tasks = store.getTasks(projId);
    const taskId = tasks[0].id;

    store.claimTask(taskId, 'user1');
    const secondClaim = store.claimTask(taskId, 'user2');
    expect(secondClaim).toBe(false);
  });

  it('logs progress and auto-completes', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    store.addTasks(projId, [sampleTasks[0]]); // Iron Ingot, qty 24

    const tasks = store.getTasks(projId);
    const taskId = tasks[0].id;

    store.claimTask(taskId, 'user1');

    // Partial progress
    let result = store.logProgress(taskId, 'user1', 10);
    expect(result!.qtyDone).toBe(10);
    expect(result!.status).toBe('claimed');

    // Complete
    result = store.logProgress(taskId, 'user1', 20);
    expect(result!.qtyDone).toBe(24); // capped at qtyNeeded
    expect(result!.status).toBe('done');
  });

  it('rejects progress from non-assignee', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    store.addTasks(projId, [sampleTasks[0]]);
    const tasks = store.getTasks(projId);
    store.claimTask(tasks[0].id, 'user1');

    const result = store.logProgress(tasks[0].id, 'user2', 5);
    expect(result).toBeNull();
  });

  it('unclaims a task', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    store.addTasks(projId, [sampleTasks[0]]);
    const tasks = store.getTasks(projId);
    store.claimTask(tasks[0].id, 'user1');

    const unclaimed = store.unclaimTask(tasks[0].id, 'user1');
    expect(unclaimed).toBe(true);

    const updated = store.getTasks(projId);
    expect(updated[0].assigneeId).toBeNull();
    expect(updated[0].status).toBe('open');
  });

  it('only allows the assignee to unclaim', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    store.addTasks(projId, [sampleTasks[0]]);
    const tasks = store.getTasks(projId);
    store.claimTask(tasks[0].id, 'user1');

    const unclaimed = store.unclaimTask(tasks[0].id, 'user2');
    expect(unclaimed).toBe(false);
  });

  it('sets message id', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    store.setProjectMessageId(projId, 'msg123');

    const project = store.getProject(projId);
    expect(project!.messageId).toBe('msg123');
  });

  it('closes a project', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    store.closeProject(projId);

    const project = store.getProject(projId);
    expect(project!.status).toBe('closed');
  });

  it('lists only open projects for a guild', () => {
    store.createProject({ guildId: 'g1', channelId: 'c1', name: 'Open1', targetItemId: 1, targetQty: 1, createdBy: 'u1' });
    const closedId = store.createProject({ guildId: 'g1', channelId: 'c1', name: 'Closed', targetItemId: 2, targetQty: 1, createdBy: 'u1' });
    store.createProject({ guildId: 'g1', channelId: 'c1', name: 'Open2', targetItemId: 3, targetQty: 1, createdBy: 'u1' });
    store.createProject({ guildId: 'g2', channelId: 'c1', name: 'Other guild', targetItemId: 4, targetQty: 1, createdBy: 'u1' });
    store.closeProject(closedId);

    const open = store.listOpenProjects('g1');
    expect(open.length).toBe(2);
    expect(open.every(p => p.status === 'open')).toBe(true);
    expect(open.every(p => p.guildId === 'g1')).toBe(true);
  });

  it('sets and retrieves thread id', () => {
    const projId = store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 8, createdBy: 'u1',
    });
    expect(store.getProject(projId)!.threadId).toBeNull();

    store.setProjectThreadId(projId, 'thread123');
    expect(store.getProject(projId)!.threadId).toBe('thread123');
  });

  it('upserts and retrieves channel state', () => {
    expect(store.getChannelState('g1', 'c1')).toBeNull();

    store.upsertChannelState({
      guildId: 'g1', channelId: 'c1', boardMessageId: 'board1', requestMessageId: null,
    });
    const state = store.getChannelState('g1', 'c1');
    expect(state!.boardMessageId).toBe('board1');
    expect(state!.requestMessageId).toBeNull();

    // Update existing
    store.upsertChannelState({
      guildId: 'g1', channelId: 'c1', boardMessageId: 'board2', requestMessageId: 'req1',
    });
    const updated = store.getChannelState('g1', 'c1');
    expect(updated!.boardMessageId).toBe('board2');
    expect(updated!.requestMessageId).toBe('req1');
  });
});
