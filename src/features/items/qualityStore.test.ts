import { describe, it, expect, beforeEach } from 'vitest';
import { useQualityStore } from './qualityStore';

describe('useQualityStore', () => {
  beforeEach(() => useQualityStore.setState({ hq: false }));

  it('defaults to NQ and flips with setHq', () => {
    expect(useQualityStore.getState().hq).toBe(false);
    useQualityStore.getState().setHq(true);
    expect(useQualityStore.getState().hq).toBe(true);
  });
});
