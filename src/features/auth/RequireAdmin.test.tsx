import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAdmin } from './RequireAdmin';
import { __TestAuthProvider, type AuthUser } from './AuthProvider';

const user: AuthUser = { sub: '1', username: 'E', avatar: null, guilds: [] };

function renderAt(value: { status: 'loading' | 'authed' | 'anon'; user: AuthUser | null; isAdmin: boolean }) {
  return render(
    <__TestAuthProvider value={value}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<RequireAdmin><div>ADMIN PAGE</div></RequireAdmin>} />
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </__TestAuthProvider>,
  );
}

describe('RequireAdmin', () => {
  it('renders children for an admin', () => {
    renderAt({ status: 'authed', user, isAdmin: true });
    expect(screen.getByText('ADMIN PAGE')).toBeInTheDocument();
  });

  it('redirects an authed non-admin to /dashboard', () => {
    renderAt({ status: 'authed', user, isAdmin: false });
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  it('redirects an anon user to /login', () => {
    renderAt({ status: 'anon', user: null, isAdmin: false });
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });
});
