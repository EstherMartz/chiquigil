import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { usePluginStore } from '../../features/plugin/pluginStore';

beforeEach(() => {
  usePluginStore.setState({ status: 'idle' });
});

function ui() {
  return <MemoryRouter><Sidebar /></MemoryRouter>;
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
