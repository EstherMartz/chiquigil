import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCooldown } from './useCooldown';

describe('useCooldown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is not on cooldown initially', () => {
    const { result } = renderHook(() => useCooldown(60_000));
    expect(result.current.onCooldown).toBe(false);
    expect(result.current.secondsLeft).toBe(0);
  });

  it('goes on cooldown after start() and counts down', () => {
    const { result } = renderHook(() => useCooldown(60_000));
    act(() => { result.current.start(); });
    expect(result.current.onCooldown).toBe(true);
    expect(result.current.secondsLeft).toBe(60);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current.onCooldown).toBe(true);
    expect(result.current.secondsLeft).toBe(30);
  });

  it('clears after the full duration', () => {
    const { result } = renderHook(() => useCooldown(60_000));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.onCooldown).toBe(false);
    expect(result.current.secondsLeft).toBe(0);
  });

  it('re-start() resets the countdown', () => {
    const { result } = renderHook(() => useCooldown(60_000));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(40_000); });
    expect(result.current.secondsLeft).toBe(20);
    act(() => { result.current.start(); });
    expect(result.current.secondsLeft).toBe(60);
  });
});
