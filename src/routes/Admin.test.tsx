import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Admin from './Admin';

const ROSTER = {
  users: [
    { discordId: 'U1', username: 'Esther', avatar: null, guilds: ['G1'], access: 'default', firstSeen: 1, lastSeen: 2 },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    if (url.endsWith('/admin/users')) return new Response(JSON.stringify(ROSTER), { status: 200 });
    if (url.endsWith('/admin/access')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response('{}', { status: 404 });
  }));
});

describe('Admin page', () => {
  it('renders the roster', async () => {
    render(<Admin />);
    expect(await screen.findByText('Esther')).toBeInTheDocument();
    expect(screen.getByText('U1')).toBeInTheDocument();
  });

  it('POSTs an access change when a level is clicked', async () => {
    render(<Admin />);
    await screen.findByText('Esther');
    fireEvent.click(screen.getByRole('button', { name: 'block' }));
    await waitFor(() => {
      expect((globalThis.fetch as any).mock.calls.some(
        ([u, init]: [string, any]) => u.endsWith('/admin/access') && init?.method === 'POST'
          && JSON.parse(init.body).access === 'block' && JSON.parse(init.body).discordId === 'U1',
      )).toBe(true);
    });
  });
});
