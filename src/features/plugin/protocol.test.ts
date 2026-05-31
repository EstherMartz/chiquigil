import { describe, it, expect } from 'vitest';
import {
  parseInboundMessage, buildHello, buildRequestInventory, buildAction, WEB_CAPABILITIES,
} from './protocol';

function snapshot(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'playerSnapshot',
    v: 1,
    world: 'Phantom',
    dc: 'Chaos',
    crafterLevels: { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 },
    ...overrides,
  });
}

describe('parseInboundMessage', () => {
  it('parses a well-formed playerSnapshot', () => {
    const msg = parseInboundMessage(snapshot());
    expect(msg).toEqual({
      type: 'playerSnapshot',
      v: 1,
      world: 'Phantom',
      dc: 'Chaos',
      crafterLevels: { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 },
    });
  });

  it('floors fractional levels', () => {
    const msg = parseInboundMessage(snapshot({
      crafterLevels: { CRP: 99.9, BSM: 1, ARM: 1, GSM: 1, LTW: 1, WVR: 1, ALC: 1, CUL: 1 },
    }));
    expect(msg?.type).toBe('playerSnapshot');
    if (msg?.type !== 'playerSnapshot') throw new Error('expected playerSnapshot');
    expect(msg.crafterLevels.CRP).toBe(99);
  });

  it('rejects unknown message types', () => {
    expect(parseInboundMessage(JSON.stringify({ type: 'somethingElse', v: 1 }))).toBeNull();
  });

  it('rejects mismatched protocol versions', () => {
    expect(parseInboundMessage(snapshot({ v: 2 }))).toBeNull();
  });

  it('rejects missing crafter keys', () => {
    expect(parseInboundMessage(snapshot({
      crafterLevels: { CRP: 100 },
    }))).toBeNull();
  });

  it('rejects out-of-range levels', () => {
    expect(parseInboundMessage(snapshot({
      crafterLevels: { CRP: 200, BSM: 1, ARM: 1, GSM: 1, LTW: 1, WVR: 1, ALC: 1, CUL: 1 },
    }))).toBeNull();
    expect(parseInboundMessage(snapshot({
      crafterLevels: { CRP: -1, BSM: 1, ARM: 1, GSM: 1, LTW: 1, WVR: 1, ALC: 1, CUL: 1 },
    }))).toBeNull();
  });

  it('rejects non-string world/dc', () => {
    expect(parseInboundMessage(snapshot({ world: 42 }))).toBeNull();
    expect(parseInboundMessage(snapshot({ dc: null }))).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(parseInboundMessage('not json {')).toBeNull();
  });

  it('rejects non-object payloads', () => {
    expect(parseInboundMessage(JSON.stringify('hello'))).toBeNull();
    expect(parseInboundMessage(JSON.stringify(null))).toBeNull();
  });
});

describe('builders', () => {
  it('hello carries v2 + capabilities', () => {
    expect(buildHello()).toEqual({ type: 'hello', v: 2, client: 'chiquigil-web', capabilities: WEB_CAPABILITIES });
  });
  it('requestInventory + action stamp the id and version', () => {
    expect(buildRequestInventory('abc', 'bags')).toEqual({ type: 'requestInventory', v: 2, id: 'abc', source: 'bags' });
    expect(buildAction('x', 'openMarketboard', { itemId: 5 })).toEqual({
      type: 'action', v: 2, id: 'x', action: 'openMarketboard', payload: { itemId: 5 },
    });
  });
});

describe('parseInboundMessage — v2 messages', () => {
  it('parses welcome with capabilities and character, dropping unknown caps', () => {
    const msg = parseInboundMessage(JSON.stringify({
      type: 'welcome', v: 2, plugin: 'qiqirn-companion', pluginVersion: '2.0.0',
      character: { name: 'Estheria', world: 'Phantom', dc: 'Chaos' },
      capabilities: ['inventory', 'gil', 'bogus'],
    }));
    expect(msg).toEqual({
      type: 'welcome', v: 2, plugin: 'qiqirn-companion', pluginVersion: '2.0.0',
      character: { name: 'Estheria', world: 'Phantom', dc: 'Chaos' },
      capabilities: ['inventory', 'gil'],
    });
  });

  it('parses an inventorySnapshot and preserves reqId', () => {
    const msg = parseInboundMessage(JSON.stringify({
      type: 'inventorySnapshot', v: 2, reqId: 'r1', source: 'all', capturedAt: 1000,
      items: [{ id: 5058, qty: 40, hq: false }],
    }));
    expect(msg).toMatchObject({ type: 'inventorySnapshot', reqId: 'r1', source: 'all', items: [{ id: 5058, qty: 40, hq: false }] });
  });

  it('rejects an inventorySnapshot with a malformed item', () => {
    expect(parseInboundMessage(JSON.stringify({
      type: 'inventorySnapshot', v: 2, source: 'all', capturedAt: 1, items: [{ id: 'x', qty: 1, hq: false }],
    }))).toBeNull();
    expect(parseInboundMessage(JSON.stringify({
      type: 'inventorySnapshot', v: 2, source: 'nope', capturedAt: 1, items: [],
    }))).toBeNull();
  });

  it('parses gil and listings snapshots', () => {
    expect(parseInboundMessage(JSON.stringify({ type: 'gilSnapshot', v: 2, capturedAt: 1, gil: 12345 })))
      .toMatchObject({ type: 'gilSnapshot', gil: 12345 });
    expect(parseInboundMessage(JSON.stringify({
      type: 'listingsSnapshot', v: 2, capturedAt: 1,
      listings: [{ itemId: 5766, hq: true, unitPrice: 1200, qty: 3, retainer: 'Moppet' }],
    }))).toMatchObject({ type: 'listingsSnapshot', listings: [{ itemId: 5766, unitPrice: 1200 }] });
  });

  it('parses actionResult and rejects one without reqId', () => {
    expect(parseInboundMessage(JSON.stringify({ type: 'actionResult', v: 2, reqId: 'r9', ok: true })))
      .toEqual({ type: 'actionResult', v: 2, reqId: 'r9', ok: true, error: undefined });
    expect(parseInboundMessage(JSON.stringify({ type: 'actionResult', v: 2, ok: true }))).toBeNull();
  });

  it('rejects v2 messages sent at the wrong version', () => {
    expect(parseInboundMessage(JSON.stringify({ type: 'gilSnapshot', v: 1, capturedAt: 1, gil: 1 }))).toBeNull();
  });
});
