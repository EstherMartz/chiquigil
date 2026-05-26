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

// Pre-seed market cache from bot's hourly dump BEFORE rendering.
// This ensures memCache is populated when hooks fire on first render.
const { world, dc } = useSettingsStore.getState();
loadSharedMarketCache(world, dc, 'Europe').finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
