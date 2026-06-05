import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VendorRefreshControl } from './VendorRefreshControl';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('VendorRefreshControl', () => {
  it('calls onRefresh when the button is clicked', () => {
    const onRefresh = vi.fn();
    render(<VendorRefreshControl onRefresh={onRefresh} busy={false} notReady={false} lastRefreshTs={null} />);
    fireEvent.click(screen.getByRole('button', { name: /refresh prices/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows Refreshing… and disables the button while busy', () => {
    render(<VendorRefreshControl onRefresh={vi.fn()} busy={true} notReady={false} lastRefreshTs={null} />);
    expect(screen.getByRole('button', { name: /refreshing/i })).toBeDisabled();
  });

  it('disables the button when notReady', () => {
    render(<VendorRefreshControl onRefresh={vi.fn()} busy={false} notReady={true} lastRefreshTs={null} />);
    expect(screen.getByRole('button', { name: /refresh prices/i })).toBeDisabled();
  });

  it('renders a freshness stamp once a refresh has happened', () => {
    render(<VendorRefreshControl onRefresh={vi.fn()} busy={false} notReady={false} lastRefreshTs={0} />);
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
  });

  it('locks with a countdown after a refresh, then re-enables', () => {
    render(<VendorRefreshControl onRefresh={vi.fn()} busy={false} notReady={false} lastRefreshTs={0} />);
    expect(screen.getByRole('button', { name: /wait/i })).toBeDisabled();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole('button', { name: /refresh prices/i })).toBeEnabled();
  });

  it('fires an immediate refresh when Auto is enabled and not on cooldown', () => {
    const onRefresh = vi.fn();
    render(<VendorRefreshControl onRefresh={onRefresh} busy={false} notReady={false} lastRefreshTs={null} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
