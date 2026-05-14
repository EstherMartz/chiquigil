import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
// @ts-expect-error - node:stream/web is provided at runtime by Node 18+ but not in the project's TS types
import { CompressionStream, DecompressionStream } from 'node:stream/web';

// jsdom doesn't ship Web Streams compression. Use Node's built-in
// implementation (same API surface) so the gatherBuddyExport helper and its
// round-trip test work the same way in tests as in the browser.
if (typeof (globalThis as Record<string, unknown>).CompressionStream === 'undefined') {
  (globalThis as Record<string, unknown>).CompressionStream = CompressionStream;
}
if (typeof (globalThis as Record<string, unknown>).DecompressionStream === 'undefined') {
  (globalThis as Record<string, unknown>).DecompressionStream = DecompressionStream;
}