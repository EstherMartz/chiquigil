import { describe, it, expect } from 'vitest';
import { derivePatchStatus } from './patchStatus';

describe('derivePatchStatus', () => {
  it('returns null bakedAt with null patchDateIso and isNewPatch false when bakedAt is null', () => {
    const status = derivePatchStatus(null, null, Date.now());
    expect(status.bakedAt).toBe(null);
    expect(status.patchDateIso).toBe(null);
    expect(status.isNewPatch).toBe(false);
  });

  it('returns false for withinWindow when bakedAt is null', () => {
    const status = derivePatchStatus(null, null, Date.now());
    expect(status.withinWindow(14)).toBe(false);
    expect(status.withinWindow(7)).toBe(false);
  });

  it('is new patch when lastSeenPatchDate is null with a real bakedAt', () => {
    const bakedAt = Date.parse('2026-06-02T08:00:00Z');
    const status = derivePatchStatus(bakedAt, null, Date.now());
    expect(status.isNewPatch).toBe(true);
  });

  it('is NOT new patch when bakedAt and lastSeenPatchDate are the same date (same-patch guard)', () => {
    const bakedAt = Date.parse('2026-06-02T08:00:00Z'); // 2026-06-02 at 08:00 UTC
    const lastSeenPatchDate = '2026-06-02';
    const status = derivePatchStatus(bakedAt, lastSeenPatchDate, Date.now());
    expect(status.patchDateIso).toBe('2026-06-02');
    expect(status.isNewPatch).toBe(false);
  });

  it('is new patch when bakedAt is strictly after lastSeenPatchDate', () => {
    const bakedAt = Date.parse('2026-06-10T08:00:00Z'); // 2026-06-10
    const lastSeenPatchDate = '2026-06-02';
    const status = derivePatchStatus(bakedAt, lastSeenPatchDate, Date.now());
    expect(status.isNewPatch).toBe(true);
  });

  it('is not new patch when bakedAt is before lastSeenPatchDate (acknowledged in the future)', () => {
    const bakedAt = Date.parse('2026-06-02T08:00:00Z'); // 2026-06-02
    const lastSeenPatchDate = '2026-06-10';
    const status = derivePatchStatus(bakedAt, lastSeenPatchDate, Date.now());
    expect(status.isNewPatch).toBe(false);
  });

  it('withinWindow is true when elapsed time is less than window days', () => {
    const now = Date.parse('2026-06-15T12:00:00Z');
    const bakedAt = Date.parse('2026-06-12T08:00:00Z'); // 3+ days in past
    const status = derivePatchStatus(bakedAt, null, now);
    expect(status.withinWindow(14)).toBe(true); // 3 days < 14 days
  });

  it('withinWindow is false when elapsed time exceeds window days', () => {
    const now = Date.parse('2026-06-15T12:00:00Z');
    const bakedAt = Date.parse('2026-06-12T08:00:00Z'); // ~3 days in past
    const status = derivePatchStatus(bakedAt, null, now);
    expect(status.withinWindow(2)).toBe(false); // 3 days > 2 days
  });

  it('withinWindow is true at the boundary (exactly at elapsed time)', () => {
    const now = 1000 + 14 * 86_400_000; // exactly 14 days in future
    const bakedAt = 1000;
    const status = derivePatchStatus(bakedAt, null, now);
    // At exactly 14 days, withinWindow(14) should be false (< not <=)
    expect(status.withinWindow(14)).toBe(false);
  });

  it('withinWindow is true just before the boundary', () => {
    const now = 1000 + 14 * 86_400_000 - 1; // 1ms before 14 days
    const bakedAt = 1000;
    const status = derivePatchStatus(bakedAt, null, now);
    expect(status.withinWindow(14)).toBe(true);
  });

  it('withinWindow guards against negative elapsed time', () => {
    const now = Date.parse('2026-06-01T12:00:00Z');
    const bakedAt = Date.parse('2026-06-15T08:00:00Z'); // future bake
    const status = derivePatchStatus(bakedAt, null, now);
    expect(status.withinWindow(14)).toBe(false); // negative elapsed time
  });

  it('derives correct patchDateIso from bakedAt timestamp', () => {
    const bakedAt = Date.parse('2026-06-02T08:00:00Z');
    const status = derivePatchStatus(bakedAt, null, Date.now());
    expect(status.patchDateIso).toBe('2026-06-02');
  });

  it('derives correct patchDateIso even at end of day', () => {
    const bakedAt = Date.parse('2026-06-02T23:59:59Z');
    const status = derivePatchStatus(bakedAt, null, Date.now());
    expect(status.patchDateIso).toBe('2026-06-02');
  });

  it('date-slice comparison works lexicographically', () => {
    // "2026-06-10" > "2026-06-02" lexicographically
    const status1 = derivePatchStatus(Date.parse('2026-06-10T00:00:00Z'), '2026-06-02', Date.now());
    expect(status1.isNewPatch).toBe(true);

    // "2026-06-02" < "2026-06-10" lexicographically
    const status2 = derivePatchStatus(Date.parse('2026-06-02T00:00:00Z'), '2026-06-10', Date.now());
    expect(status2.isNewPatch).toBe(false);

    // "2026-07-01" > "2026-06-30" lexicographically
    const status3 = derivePatchStatus(Date.parse('2026-07-01T00:00:00Z'), '2026-06-30', Date.now());
    expect(status3.isNewPatch).toBe(true);
  });
});
