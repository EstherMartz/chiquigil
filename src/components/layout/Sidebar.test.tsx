import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { usePluginStore } from '../../features/plugin/pluginStore';

beforeEach(() => {
  usePluginStore.setState({ status: 'idle' });
});

function ui() {
  // Sidebar reads the What's New snapshot (via usePatchStatus) for the "New patch"
  // cue, so it needs a QueryClient in the tree.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter><Sidebar /></MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Sidebar Plan gating', () => {
  it('hides the Plan nav item when the plugin is disconnected', () => {
    usePluginStore.setState({ status: 'idle' });
    render(ui());
    expect(screen.queryAllByText('Plan')).toHaveLength(0);
  });

  it('shows the Plan nav item when the plugin is connected', () => {
    usePluginStore.setState({ status: 'open' });
    render(ui());
    expect(screen.queryAllByText('Plan').length).toBeGreaterThan(0);
  });
});
