import { describe, it, expect } from 'vitest';
import { encodeGbrList, GBR_VERSION_BYTE } from './gatherBuddyExport';

async function decode(b64: string): Promise<{ versionByte: number; json: Record<string, unknown> }> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Response(bin).body!.pipeThrough(new DecompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  const versionByte = buf[0];
  const json = JSON.parse(new TextDecoder().decode(buf.slice(1)));
  return { versionByte, json };
}

describe('gatherBuddyExport', () => {
  it('emits version byte 0x05 followed by gzip-compressed JSON', async () => {
    const blob = await encodeGbrList({
      name: 'AFK 45m',
      items: [
        { id: 5544, qty: 320 },
        { id: 5543, qty: 151 },
      ],
    });
    const { versionByte, json } = await decode(blob);
    expect(versionByte).toBe(GBR_VERSION_BYTE);
    expect(versionByte).toBe(0x05);
    expect(json).toEqual({
      ItemIds: [5544, 5543],
      Quantities: { '5544': 320, '5543': 151 },
      PrefferedLocations: {},
      EnabledItems: { '5544': true, '5543': true },
      Name: 'AFK 45m',
      Description: '',
      FolderPath: '',
      Order: 0,
      Enabled: true,
      Fallback: false,
    });
  });

  it('preserves item order from the input array', async () => {
    const blob = await encodeGbrList({
      name: 'order test',
      items: [
        { id: 999, qty: 1 },
        { id: 1, qty: 2 },
        { id: 500, qty: 3 },
      ],
    });
    const { json } = await decode(blob);
    expect(json.ItemIds).toEqual([999, 1, 500]);
  });

  it('uses standard base64 (a-z A-Z 0-9 + / =)', async () => {
    const blob = await encodeGbrList({
      name: 'charset',
      items: [{ id: 1, qty: 1 }],
    });
    expect(blob).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
