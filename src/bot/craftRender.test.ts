import { describe, it, expect } from 'vitest';
import { chunkDescription, buildProjectMessage } from './craftRender';
import type { CraftProject, StoredTask } from './craftTypes';

function project(over: Partial<CraftProject> = {}): CraftProject {
  return {
    id: 1, guildId: 'g', channelId: 'c', messageId: null, name: 'P',
    targetItemId: 100, targetQty: 1, createdBy: 'u', threadId: null,
    status: 'open', createdAt: 0,
    displayPartKey: null, displayPhaseIndex: null,
    ...over,
  };
}

function task(over: Partial<StoredTask>): StoredTask {
  return {
    id: 1, projectId: 1, itemId: 10, itemName: 'Iron',
    qtyNeeded: 5, qtyDone: 0, source: 'gather', meta: {},
    assigneeId: null, status: 'open', updatedAt: 0,
    ...over,
  };
}

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
    // ~9000 chars of content — over the cumulative cap.
    const lines = Array.from({ length: 200 }, (_, i) => `Task line padded out to forty characters ${i}`);
    const text = lines.join('\n');
    const chunks = chunkDescription(text);
    const last = chunks[chunks.length - 1];
    expect(last).toMatch(/truncado/i);
  });

  it('keeps the total across chunks under Discord\'s per-message embed budget', () => {
    // 80-char × 100 lines = ~8000 chars — over both per-embed and cumulative.
    // Regression: previously chunkDescription tracked the per-line delta
    // instead of the running total, so it could emit 2 chunks of ~3900 each
    // (~7800 total) and Discord rejected the message with
    // MAX_EMBED_SIZE_EXCEEDED.
    const lines = Array.from({ length: 100 }, (_, i) =>
      `Long task line ${i.toString().padStart(3, '0')} padded out so we hit limits faster`,
    );
    const text = lines.join('\n');
    const chunks = chunkDescription(text);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    // Leave plenty of room for title (~50) + footer.text (~15) within Discord's
    // 6000-char per-message embed cap.
    expect(total).toBeLessThanOrEqual(5800);
    // Each chunk also under the per-embed description limit.
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4000);
  });
});

describe('buildProjectMessage (phase navigation)', () => {
  it('does not render a phase select when the project has only one phase', () => {
    const p = project({ displayPartKey: 'Wall', displayPhaseIndex: 0 });
    const tasks = [
      task({ id: 1, meta: { partKey: 'Wall', phaseIndex: 0 } }),
      task({ id: 2, source: 'craft', meta: { partKey: 'Wall', phaseIndex: 0, job: 'BSM' } }),
    ];
    const { components } = buildProjectMessage(p, tasks);
    const flatCustomIds = JSON.stringify(components);
    expect(flatCustomIds).not.toContain(':phase');
  });

  it('renders a phase select with one option per (part, phase) when multi-phase', () => {
    const p = project({ displayPartKey: 'Wall', displayPhaseIndex: 0 });
    const tasks = [
      task({ id: 1, meta: { partKey: 'Wall', phaseIndex: 0 } }),
      task({ id: 2, meta: { partKey: 'Wall', phaseIndex: 1 } }),
      task({ id: 3, meta: { partKey: 'Door', phaseIndex: 0 } }),
    ];
    const { components } = buildProjectMessage(p, tasks);
    const select = (components as any[])
      .flatMap((row) => row.components)
      .find((c) => c?.custom_id?.endsWith(':phase'));
    expect(select).toBeDefined();
    expect(select.options).toHaveLength(3);
    expect(select.options.map((o: any) => o.value)).toEqual(['Wall#0', 'Wall#1', 'Door#0']);
    // Default option matches the project's stored display phase.
    expect(select.options[0].default).toBe(true);
    expect(select.options[1].default).toBe(false);
  });

  it('filters task lines and the claim dropdown to the active phase', () => {
    const p = project({ displayPartKey: 'Door', displayPhaseIndex: 0 });
    const tasks = [
      task({ id: 1, itemName: 'Wall-Ore', meta: { partKey: 'Wall', phaseIndex: 0 } }),
      task({ id: 2, itemName: 'Door-Wood', meta: { partKey: 'Door', phaseIndex: 0 } }),
      task({ id: 3, itemName: 'Final', source: 'workshop', meta: {} }), // untagged → always visible
    ];
    const { embeds, components } = buildProjectMessage(p, tasks);
    const desc = (embeds as any[])[0].description as string;
    expect(desc).toContain('Door-Wood');
    expect(desc).toContain('Final');       // workshop assembly always visible
    expect(desc).not.toContain('Wall-Ore');

    // Claim dropdown only sees the visible phase's tasks (+ no untagged claimables).
    const claim = (components as any[])
      .flatMap((row) => row.components)
      .find((c) => c?.custom_id?.endsWith(':claim'));
    expect(claim).toBeDefined();
    const labels = claim.options.map((o: any) => o.label);
    expect(labels.some((l: string) => l.includes('Door-Wood'))).toBe(true);
    expect(labels.some((l: string) => l.includes('Wall-Ore'))).toBe(false);
  });

  it('marks fully-done phases with a ✓ in the dropdown label', () => {
    const p = project({ displayPartKey: 'Wall', displayPhaseIndex: 0 });
    const tasks = [
      task({ id: 1, status: 'done', qtyDone: 5, meta: { partKey: 'Wall', phaseIndex: 0 } }),
      task({ id: 2, status: 'open', meta: { partKey: 'Wall', phaseIndex: 1 } }),
    ];
    const { components } = buildProjectMessage(p, tasks);
    const select = (components as any[])
      .flatMap((row) => row.components)
      .find((c) => c?.custom_id?.endsWith(':phase'));
    const done = select.options.find((o: any) => o.value === 'Wall#0');
    const todo = select.options.find((o: any) => o.value === 'Wall#1');
    expect(done.label).toMatch(/✓/);
    expect(todo.label).not.toMatch(/✓/);
  });
});
