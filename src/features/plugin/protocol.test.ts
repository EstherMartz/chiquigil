import { describe, it, expect } from 'vitest';
import { parseInboundMessage } from './protocol';

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
    expect(msg?.crafterLevels.CRP).toBe(99);
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
