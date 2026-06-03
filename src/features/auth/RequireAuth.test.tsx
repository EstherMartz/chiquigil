import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { __TestAuthProvider } from './AuthProvider';

function renderAt(status: 'loading' | 'authed' | 'anon') {
  return render(
    <__TestAuthProvider value={{ status, user: status === 'authed' ? { sub: '1', username: 'E', avatar: null, guilds: ['1'] } : null, isAdmin: false }}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
          <Route path="/secret" element={<RequireAuth><div>SECRET</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    </__TestAuthProvider>,
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
