import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  attachSocket, handleInbound, send, sendRequest, isConnected, _resetBridgeForTests,
} from './pluginBridge';
import { usePluginDataStore } from './pluginDataStore';
import { buildRequestInventory } from './protocol';

// Minimal fake socket that records sends and lets the test inject replies.
class FakeSocket {
  readyState = WebSocket.OPEN;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  lastMessage() { return JSON.parse(this.sent[this.sent.length - 1]); }
}

beforeEach(() => {
  _resetBridgeForTests();
  usePluginDataStore.getState().reset();
});
afterEach(() => {
  _resetBridgeForTests();
  vi.useRealTimers();
});

describe('pluginBridge', () => {
  it('reports connection state from the attached socket', () => {
    expect(isConnected()).toBe(false);
    const s = new FakeSocket();
    attachSocket(s as unknown as WebSocket);
    expect(isConnected()).toBe(true);
  });

  it('refuses to send when no socket is attached', () => {
    expect(send(buildRequestInventory('x', 'all'))).toBe(false);
  });

  it('resolves a request when a reply with the matching reqId arrives', async () => {
    const s = new FakeSocket();
    attachSocket(s as unknown as WebSocket);

    const p = sendRequest((id) => buildRequestInventory(id, 'bags'));
    const sentId = s.lastMessage().id as string;

    handleInbound({
      type: 'inventorySnapshot', v: 2, reqId: sentId, source: 'bags', capturedAt: 1,
      items: [{ id: 5058, qty: 40, hq: false }],
    });

    const reply = await p;
    expect(reply).toMatchObject({ type: 'inventorySnapshot', reqId: sentId });
  });

  it('rejects pending requests when the socket detaches', async () => {
    const s = new FakeSocket();
    attachSocket(s as unknown as WebSocket);
    const p = sendRequest((id) => buildRequestInventory(id, 'all'));
    attachSocket(null);
    await expect(p).rejects.toThrow(/disconnected/i);
  });

  it('times out a request that never gets a reply', async () => {
    vi.useFakeTimers();
    const s = new FakeSocket();
    attachSocket(s as unknown as WebSocket);
    const p = sendRequest((id) => buildRequestInventory(id, 'all'), 1000);
    const expectation = expect(p).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(1001);
    await expectation;
  });

  it('folds snapshots into the data store and clears them on disconnect', () => {
    const s = new FakeSocket();
    attachSocket(s as unknown as WebSocket);
    handleInbound({ type: 'gilSnapshot', v: 2, capturedAt: 1, gil: 999 });
    expect(usePluginDataStore.getState().gil?.gil).toBe(999);
    attachSocket(null);
    expect(usePluginDataStore.getState().gil).toBeNull();
  });
});
