import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQuestSnapshot } from './useQuestSnapshot';
import type { SnapshotQuest } from '../../lib/questSnapshot';

vi.mock('../../lib/staticSnapshots', () => ({
  loadStaticQuestSnapshot: vi.fn(),
}));

vi.mock('../../lib/recipeCache', () => ({
  getCachedQuests: vi.fn(),
  putCachedQuests: vi.fn(),
  getQuestSnapshotUpdatedAt: vi.fn(),
  clearQuestCache: vi.fn(),
}));

vi.mock('../../lib/questSnapshot', () => ({
  fetchQuestSnapshot: vi.fn(),
}));

import { loadStaticQuestSnapshot } from '../../lib/staticSnapshots';
import { getCachedQuests, getQuestSnapshotUpdatedAt, putCachedQuests } from '../../lib/recipeCache';
import { fetchQuestSnapshot } from '../../lib/questSnapshot';

function Probe({ onValue }: { onValue: (q: SnapshotQuest[] | undefined) => void }) {
  const q = useQuestSnapshot();
  if (q.data) onValue(q.data.snapshot);
  return null;
}

function renderProbe(onValue: (q: SnapshotQuest[] | undefined) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Probe onValue={onValue} />
    </QueryClientProvider>,
  );
}

describe('useQuestSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns IDB-cached snapshot when present', async () => {
    const cached: SnapshotQuest[] = [{
      questId: 1, questName: 'A', categoryName: 'All Classes', level: 1, requiredItems: [],
    }];
    vi.mocked(getCachedQuests).mockResolvedValue(cached);
    vi.mocked(getQuestSnapshotUpdatedAt).mockResolvedValue(123);

    let observed: SnapshotQuest[] | undefined;
    renderProbe((v) => { observed = v; });
    await waitFor(() => expect(observed).toEqual(cached));
    expect(loadStaticQuestSnapshot).not.toHaveBeenCalled();
    expect(fetchQuestSnapshot).not.toHaveBeenCalled();
  });

  it('falls back to static bundle on cache miss', async () => {
    const bundled: SnapshotQuest[] = [{
      questId: 2, questName: 'B', categoryName: 'Carpenter', level: 5, requiredItems: [],
    }];
    vi.mocked(getCachedQuests).mockResolvedValue(undefined);
    vi.mocked(loadStaticQuestSnapshot).mockResolvedValue({ data: bundled, bakedAt: 456 });

    let observed: SnapshotQuest[] | undefined;
    renderProbe((v) => { observed = v; });
    await waitFor(() => expect(observed).toEqual(bundled));
    expect(putCachedQuests).toHaveBeenCalledWith(bundled, 456);
    expect(fetchQuestSnapshot).not.toHaveBeenCalled();
  });

  it('falls back to live XIVAPI fetch when neither cache nor static bundle is present', async () => {
    const fresh: SnapshotQuest[] = [{
      questId: 3, questName: 'C', categoryName: '', level: 10, requiredItems: [],
    }];
    vi.mocked(getCachedQuests).mockResolvedValue(undefined);
    vi.mocked(loadStaticQuestSnapshot).mockResolvedValue(null);
    vi.mocked(fetchQuestSnapshot).mockResolvedValue(fresh);

    let observed: SnapshotQuest[] | undefined;
    renderProbe((v) => { observed = v; });
    await waitFor(() => expect(observed).toEqual(fresh));
    expect(putCachedQuests).toHaveBeenCalledWith(fresh);
  });
});
