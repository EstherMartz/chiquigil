import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequireAuth } from './RequireAuth';
import { __TestAuthProvider } from './AuthProvider';

function renderAt(status: 'loading' | 'authed' | 'anon') {
  // The loading state renders the app shell (incl. Sidebar, which reads the
  // What's New snapshot via react-query), so a QueryClient must be in the tree.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <__TestAuthProvider value={{ status, user: status === 'authed' ? { sub: '1', username: 'E', avatar: null, guilds: ['1'] } : null, isAdmin: false }}>
        <MemoryRouter initialEntries={['/secret']}>
          <Routes>
            <Route path="/login" element={<div>LOGIN PAGE</div>} />
            <Route path="/secret" element={<RequireAuth><div>SECRET</div></RequireAuth>} />
          </Routes>
        </MemoryRouter>
      </__TestAuthProvider>
    </QueryClientProvider>,
  );
}

describe('RequireAuth', () => {
  it('renders children when authed', () => {
    renderAt('authed');
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });

  it('redirects to /login when anon', () => {
    renderAt('anon');
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('shows a loading state while resolving', () => {
    renderAt('loading');
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });
});
