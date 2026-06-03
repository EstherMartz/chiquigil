import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const { status, user } = useAuth();
  return <div>status:{status} user:{user?.username ?? 'none'}</div>;
}

function AdminProbe() {
  const { isAdmin } = useAuth();
  return <div>admin:{String(isAdmin)}</div>;
}

afterEach(() => vi.restoreAllMocks());

describe('AuthProvider', () => {
  it('moves to authed and exposes the user when /api/auth/me returns 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { sub: '1', username: 'Esther', avatar: null, guilds: ['123'] } }),
    }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/status:authed/)).toBeInTheDocument());
    expect(screen.getByText(/user:Esther/)).toBeInTheDocument();
  });

  it('moves to anon when /api/auth/me returns 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/status:anon/)).toBeInTheDocument());
  });

  it('exposes isAdmin from the me response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { sub: '1', username: 'E', avatar: null, guilds: [] }, isAdmin: true }),
    }));
    render(<AuthProvider><AdminProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('admin:true')).toBeInTheDocument());
  });
});
