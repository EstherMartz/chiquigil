import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Sidebar } from './components/layout/Sidebar';
import { ContentBar } from './components/layout/ContentBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { usePluginConnection } from './features/plugin/usePluginConnection';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequireAuth } from './features/auth/RequireAuth';
import { UserMenu } from './features/auth/UserMenu';
import Login from './routes/Login';
import Home from './routes/Home';
import Watchlist from './routes/Watchlist';
import Crafts from './routes/Crafts';
import Trading from './routes/Trading';
import Gathering from './routes/Gathering';
import GatheringPlan from './routes/GatheringPlan';
import LevePlan from './routes/LevePlan';
import GcSeals from './routes/GcSeals';
import ShoppingList from './routes/ShoppingList';
import VendorFlip from './routes/VendorFlip';
import CurrencyFlip from './routes/CurrencyFlip';
import Cleanup from './routes/Cleanup';
import CraftFromInventory from './routes/CraftFromInventory';
import QuestItems from './routes/QuestItems';
import Housing from './routes/Housing';
import Heatmap from './routes/Heatmap';
import CraftBatch from './routes/CraftBatch';
import BatchHistory from './routes/BatchHistory';
import Item from './routes/Item';
import Settings from './routes/Settings';
import Submarines from './routes/Submarines';
import Planner from './routes/Planner';
import Projects from './routes/Projects';
import Project from './routes/Project';

const PAGE_TITLES: Record<string, string> = {
  '/home': 'What Now?',
  '/watchlist': 'Watchlist',
  '/crafts': 'Crafts',
  '/trading': 'Trading',
  '/gathering': 'Gathering',
  '/gathering/plan': 'Gathering Plan',
  '/leves': 'Leves',
  '/shopping-list': 'Shopping List',
  '/vendor-flip': 'Vendor Flip',
  '/housing': 'Housing',
  '/currency-flip': 'Currencies',
  '/gc-seals': 'GC Seals',
  '/craft-batch': 'Craft Batch',
  '/batch-history': 'Batch History',
  '/cleanup': 'Cleanup',
  '/craft-from-inventory': 'Craft from Inventory',
  '/quest-items': 'GC Supply',
  '/heatmap': 'Heatmap',
  '/settings': 'Settings',
  '/submarines': 'Submarines',
  '/planner': 'Plan',
  '/projects': 'Projects',
};

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const base = 'qiqirn.tools';
    let page = PAGE_TITLES[pathname];
    if (!page) {
      if (pathname.startsWith('/item/')) page = 'Item';
      else if (pathname.startsWith('/projects/')) page = 'Project';
    }
    document.title = page ? `${page} — ${base}` : base;
  }, [pathname]);
  return null;
}

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('ffxiv-helper:onboarded'),
  );

  usePluginConnection();

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <div className="flex min-h-screen">
                <DocumentTitle />
                <Sidebar />
                {showOnboarding && (
                  <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
                )}
                <main className="flex-1 min-w-0 pt-16 md:pt-8 px-4 pb-[max(5rem,env(safe-area-inset-bottom))]">
                  <div className="flex justify-end"><UserMenu /></div>
                  <ContentBar />
                  <ErrorBoundary>
                    <Routes>
                      <Route path="/" element={<Navigate to="/trading" replace />} />
                      <Route path="/home" element={<Home />} />
                      <Route path="/watchlist" element={<Watchlist />} />
                      <Route path="/crafts" element={<Crafts />} />
                      <Route path="/trading" element={<Trading />} />
                      <Route path="/gathering" element={<Gathering />} />
                      <Route path="/gathering/plan" element={<GatheringPlan />} />
                      <Route path="/leves" element={<LevePlan />} />
                      <Route path="/shopping-list" element={<ShoppingList />} />
                      <Route path="/vendor-flip" element={<VendorFlip />} />
                      <Route path="/housing" element={<Housing />} />
                      <Route path="/currency-flip" element={<CurrencyFlip />} />
                      <Route path="/gc-seals" element={<GcSeals />} />
                      <Route path="/craft-batch" element={<CraftBatch />} />
                      <Route path="/batch-history" element={<BatchHistory />} />
                      <Route path="/cleanup" element={<Cleanup />} />
                      <Route path="/craft-from-inventory" element={<CraftFromInventory />} />
                      <Route path="/quest-items" element={<QuestItems />} />
                      <Route path="/heatmap" element={<Heatmap />} />
                      <Route path="/item/:id" element={<Item />} />
                      <Route path="/queries" element={<Navigate to="/crafts" replace />} />
                      <Route path="/insights" element={<Navigate to="/trading" replace />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/submarines" element={<Submarines />} />
                      <Route path="/planner" element={<Planner />} />
                      <Route path="/projects" element={<Projects />} />
                      <Route path="/projects/:id" element={<Project />} />
                    </Routes>
                  </ErrorBoundary>
                </main>
              </div>
            </RequireAuth>
          }
        />
      </Routes>
      <Analytics />
    </AuthProvider>
  );
}
