// Encodes a gathering list into the clipboard string accepted by GatherBuddy
// Reborn's "Import an auto-gather list from clipboard" feature.
//
// Format (matches GBR source verbatim — see AutoGatherList.Config.ToBase64 in
// https://github.com/FFXIV-CombatReborn/GatherBuddyReborn/blob/main/GatherBuddy/AutoGather/Lists/AutoGatherList.cs
// and Functions.CompressedBase64 in the same repo):
//   base64( gzip( [0x05] ++ utf8(JSON.stringify(Config)) ) )
//
// `PrefferedLocations` is misspelled in the GBR source; we copy the typo so
// the field is not silently dropped on import. If GBR ever bumps the version
// byte, the round-trip test in gatherBuddyExport.test.ts will fail loudly.

export const GBR_VERSION_BYTE = 0x05;

export interface GbrListItem {
  id: number;
  qty: number;
}

export interface GbrListInput {
  name: string;
  items: GbrListItem[];
  description?: string;
  folderPath?: string;
}

interface GbrConfig {
  ItemIds: number[];
  Quantities: Record<string, number>;
  PrefferedLocations: Record<string, number>;
  EnabledItems: Record<string, boolean>;
  Name: string;
  Description: string;
  FolderPath: string;
  Order: number;
  Enabled: boolean;
  Fallback: boolean;
}

function buildConfig(input: GbrListInput): GbrConfig {
  const ItemIds: number[] = [];
  const Quantities: Record<string, number> = {};
  const EnabledItems: Record<string, boolean> = {};
  for (const item of input.items) {
    ItemIds.push(item.id);
    Quantities[String(item.id)] = item.qty;
    EnabledItems[String(item.id)] = true;
  }
  return {
    ItemIds,
    Quantities,
    PrefferedLocations: {},
    EnabledItems,
    Name: input.name,
    Description: input.description ?? '',
    FolderPath: input.folderPath ?? '',
    Order: 0,
    Enabled: true,
    Fallback: false,
  };
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Response(ab).body!.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function encodeGbrList(input: GbrListInput): Promise<string> {
  const json = JSON.stringify(buildConfig(input));
  const jsonBytes = new TextEncoder().encode(json);
  const payload = new Uint8Array(jsonBytes.length + 1);
  payload[0] = GBR_VERSION_BYTE;
  payload.set(jsonBytes, 1);
  const compressed = await gzip(payload);
  return bytesToBase64(compressed);
}
