import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChangedDigest } from './ChangedDigest';
import { useSettingsStore } from '../../settings/store';
import type { MoversDigest } from '../aggregate';

const row = (id: number, name: string) => ({ id, name, delta: 10, dcMinHQ: 100, dcMinNQ: 100, staleDays: 0, craftable: false, profit: 0 } as any);
const digest: MoversDigest = { gainers: [row(1, 'KeepUp'), row(2, 'DropUp')], losers: [], stale: [] } as any;

describe('ChangedDigest ignore filtering', () => {
  beforeEach(() => useSettingsStore.setState({ ignoredItemIds: [], hideIgnored: true }));

  it('omits ignored items from the movers columns', () => {
    useSettingsStore.setState({ ignoredItemIds: [2], hideIgnored: true });
    render(<MemoryRouter><ChangedDigest digest={digest} /></MemoryRouter>);
    expect(screen.getByText('KeepUp')).toBeInTheDocument();
    expect(screen.queryByText('DropUp')).toBeNull();
  });
});
