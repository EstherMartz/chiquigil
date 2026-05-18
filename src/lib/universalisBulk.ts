export function chunkIds<T>(ids: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunkIds: size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

export interface FetchInBatchesOpts<V = unknown> {
  chunkSize: number;
  concurrency: number;
  onProgress?: (chunksDone: number) => void;
  /** Fires after each successful chunk with that chunk's parsed data only. */
  onChunk?: (chunkData: Record<string, V>) => void;
}

export interface FetchInBatchesResult<V> {
  data: Record<string, V>;
  errors: number[][];
}

export async function fetchInBatches<V>(
  ids: number[],
  fetchOne: (chunk: number[]) => Promise<Record<string, V>>,
  opts: FetchInBatchesOpts<V>,
): Promise<FetchInBatchesResult<V>> {
  const chunks = chunkIds(ids, opts.chunkSize);
  const data: Record<string, V> = {};
  const errors: number[][] = [];
  let nextChunkIdx = 0;
  let chunksDone = 0;

  async function worker() {
    while (true) {
      const idx = nextChunkIdx++;
      if (idx >= chunks.length) return;
      const chunk = chunks[idx];
      try {
        const result = await fetchOne(chunk);
        Object.assign(data, result);
        opts.onChunk?.(result);
      } catch {
        errors.push(chunk);
      }
      chunksDone++;
      opts.onProgress?.(chunksDone);
    }
  }

  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, () => worker());
  await Promise.all(workers);
  return { data, errors };
}
