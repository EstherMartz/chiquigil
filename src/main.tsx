import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/index.css';
import { loadSharedMarketCache } from './lib/universalis';
import { useSettingsStore } from './features/settings/store';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
});

// Kick off the market cache pre-seed (bot's hourly dump + persisted live rows) in
// the background — don't block first paint on it. Market reads await the seed
// internally (see awaitSeed in lib/universalis), so they read a populated cache
// and the UI shows skeletons meanwhile instead of a blank gate.
const { world, dc } = useSettingsStore.getState();
void loadSharedMarketCache(world, dc, 'Europe');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
