import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

/**
 * Local-dev-only auth shim. The app gates every route behind a Discord-OAuth
 * session (AuthProvider fetches `/api/auth/me`). Under plain `vite dev` the
 * serverless `/api/*` functions don't run, so that fetch fails and you get
 * bounced to a Discord login that can't complete. This middleware answers
 * `/api/auth/me` with a stub authed user so the gate opens.
 *
 * Safe by construction: `apply: 'serve'` means it exists ONLY in the dev
 * server and is never part of a production build. Disable it (e.g. to exercise
 * the real login redirect) with `VITE_DEV_AUTH=0` in `.env.local`.
 */
function devAuthShim(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    name: 'dev-auth-shim',
    apply: 'serve',
    configureServer(server) {
      if (env.VITE_DEV_AUTH === '0') return
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/auth/me')) return next()
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          user: { sub: 'dev-local', username: 'Local Dev', avatar: null, guilds: [] },
          isAdmin: true,
        }))
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), devAuthShim(mode)],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the heavy, rarely-changing vendor libs in their own long-lived
        // chunks so app-code deploys don't bust their cache, and so recharts
        // (shared by the Item + Dashboard charts) loads once and is reused.
        // Order matters: match recharts/d3 before react so React itself stays
        // in react-vendor and the recharts chunk just depends on it.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'recharts'
          if (
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/react/') ||
            id.includes('/scheduler/') ||
            id.includes('@tanstack')
          ) return 'react-vendor'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'bot/**', '.worktrees/**'],
  },
}))
