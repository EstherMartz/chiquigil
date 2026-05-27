import { describe, it, expect } from 'vitest';
import { chunkDescription } from './craftRender';

describe('chunkDescription', () => {
  it('keeps short text as a single chunk', () => {
    const text = 'short content\nline 2';
    expect(chunkDescription(text)).toEqual([text]);
  });

  it('splits long text at newline boundaries into multiple chunks', () => {
    // Force overflow past 3900-per-chunk but stay under 5800-cumulative.
    const lines = Array.from({ length: 80 }, (_, i) =>
      `27× Item Name ${i.toString().padStart(3, '0')} — sin asignar (0/27) — extra padding here`,
    );
    const text = lines.join('\n');
    expect(text.length).toBeGreaterThan(3900);
    expect(text.length).toBeLessThan(5800);
    const chunks = chunkDescription(text);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk exceeds the 3900-char per-chunk limit.
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(3900);
    // Recombining the chunks reproduces the original text.
    expect(chunks.join('\n')).toBe(text);
  });

  it('truncates with the "truncado" marker when total exceeds the cumulative limit', () => {
    // ~8000 chars of content — over the 5800-char cumulative cap.
    const lines = Array.from({ length: 200 }, (_, i) => `Task line padded out to forty characters ${i}`);
    const text = lines.join('\n');
    const chunks = chunkDescription(text);
    const last = chunks[chunks.length - 1];
    expect(last).toMatch(/truncado/i);
  });
});
