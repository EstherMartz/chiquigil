import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Sidebar } from './components/layout/Sidebar';
import { ContentBar } from './components/layout/ContentBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { usePluginConnection } from './features/plugin/usePluginConnection';
import { usePluginPairing } from './features/plugin/usePluginPairing';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequireAuth } from './features/auth/RequireAuth';
import { RequireAdmin } from './features/auth/RequireAdmin';
import { UserMenu } from './features/auth/UserMenu';
import { FeedbackButton } from './features/feedback/FeedbackButton';
import { Spinner } from './components/Spinner';
import Login from './routes/Login';

// Routes are code-split: each becomes its own chunk loaded on demand, so the
// initial download is just the app shell + the visited route instead of one
// ~1.5 MB bundle carrying every page (recharts, the craft engine, all 40+
// views). Login stays eager — it's the unauthenticated landing and must paint
// without waiting on a second round-trip.
const Home = lazy(() => import('./routes/Home'));
const Dashboard = lazy(() => import('./routes/Dashboard'));
const Watchlist = lazy(() => import('./routes/Watchlist'));
const Discover = lazy(() => import('./routes/Discover'));
const Crafts = lazy(() => import('./routes/Crafts'));
const Trading = lazy(() => import('./routes/Trading'));
const Gathering = lazy(() => import('./routes/Gathering'));
const GatheringPlan = lazy(() => import('./routes/GatheringPlan'));
const LevePlan = lazy(() => import('./routes/LevePlan'));
const GcSeals = lazy(() => import('./routes/GcSeals'));
const ShoppingList = lazy(() => import('./routes/ShoppingList'));
const VendorFlip = lazy(() => import('./routes/VendorFlip'));
const EmptyShelf = lazy(() => import('./routes/EmptyShelf'));
const WhatsNew = lazy(() => import('./routes/WhatsNew'));
const Travel = lazy(() => import('./routes/Travel'));
const CurrencyFlip = lazy(() => import('./routes/CurrencyFlip'));
const Cleanup = lazy(() => import('./routes/Cleanup'));
const CraftFromInventory = lazy(() => import('./routes/CraftFromInventory'));
const QuestItems = lazy(() => import('./routes/QuestItems'));
const Housing = lazy(() => import('./routes/Housing'));
const Heatmap = lazy(() => import('./routes/Heatmap'));
const GlamourDemand = lazy(() => import('./routes/GlamourDemand'));
const CraftBatch = lazy(() => import('./routes/CraftBatch'));
const BatchHistory = lazy(() => import('./routes/BatchHistory'));
const Compare = lazy(() => import('./routes/Compare'));
const Item = lazy(() => import('./routes/Item'));
const Settings = lazy(() => import('./routes/Settings'));
const Submarines = lazy(() => import('./routes/Submarines'));
const Planner = lazy(() => import('./routes/Planner'));
const Projects = lazy(() => import('./routes/Projects'));
const Project = lazy(() => import('./routes/Project'));
const CraftLists = lazy(() => import('./routes/CraftLists'));
const YourLists = lazy(() => import('./routes/YourLists'));
const ListDetail = lazy(() => import('./routes/ListDetail'));
const Opportunities = lazy(() => import('./routes/Opportunities'));
const Admin = lazy(() => import('./routes/Admin'));

const PAGE_TITLES: Record<string, string> = {
  '/home': 'What Now?',
  '/dashboard': 'Dashboard',
  '/watchlist': 'Watchlist',
  '/discover': 'Discover',
  '/crafts': 'Crafts',
  '/trading': 'Trading',
  '/gathering': 'Gathering',
  '/gathering/plan': 'Gathering Plan',
  '/leves': 'Leves',
  '/shopping-list': 'Craft Helper',
  '/vendor-flip': 'Vendor Flip',
  '/empty-shelf': 'Empty Shelf',
  '/opportunities': 'Opportunities',
  '/whats-new': "What's New",
  '/travel': 'Travel Planner',
  '/housing': 'Housing',
  '/currency-flip': 'Currencies',
  '/gc-seals': 'GC Seals',
  '/craft-batch': 'Craft Batch',
  '/batch-history': 'Batch History',
  '/compare': 'Compare Paths',
  '/cleanup': 'Cleanup',
  '/craft-from-inventory': 'Craft from Inventory',
  '/quest-items': 'GC Supply',
  '/heatmap': 'Heatmap',
  '/glamour': 'Glamour Demand',
  '/settings': 'Settings',
  '/submarines': 'Submarines',
  '/planner': 'Plan',
  '/projects': 'Projects',
  '/craft-lists': 'Craft Lists',
  '/craft-lists/saved': 'Your Lists',
  '/admin': 'Admin',
};

/** Shown while a route's code-split chunk is fetched. Keeps the shell (sidebar,
 *  content bar) on screen so navigation never flashes to a blank page. */
function RouteFallback() {
  return (
    <div className="py-16">
      <Spinner label="Loading…" />
    </div>
  );
}

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const base = 'qiqirn.tools';
    let page = PAGE_TITLES[pathname];
    if (!page) {
      if (pathname.startsWith('/item/')) page = 'Item';
      else if (pathname.startsWith('/projects/')) page = 'Project';
      else if (pathname.startsWith('/craft-lists/')) page = 'Craft List';
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
  usePluginPairing();

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
                  <div className="mx-auto w-full max-w-[1280px]">
                    <div className="flex justify-end items-center gap-3"><FeedbackButton /><UserMenu /></div>
                    <ContentBar />
                    <ErrorBoundary>
                      <Suspense fallback={<RouteFallback />}>
                      <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/home" element={<Home />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/watchlist" element={<Watchlist />} />
                        <Route path="/discover" element={<Discover />} />
                        <Route path="/crafts" element={<Crafts />} />
                        <Route path="/trading" element={<Trading />} />
                        <Route path="/gathering" element={<Gathering />} />
                        <Route path="/gathering/plan" element={<GatheringPlan />} />
                        <Route path="/leves" element={<LevePlan />} />
                        <Route path="/shopping-list" element={<ShoppingList />} />
                        <Route path="/craft-helper" element={<Navigate to="/shopping-list" replace />} />
                        <Route path="/vendor-flip" element={<VendorFlip />} />
                        <Route path="/empty-shelf" element={<EmptyShelf />} />
                        <Route path="/opportunities" element={<Opportunities />} />
                        <Route path="/whats-new" element={<WhatsNew />} />
                        <Route path="/travel" element={<Travel />} />
                        <Route path="/housing" element={<Housing />} />
                        <Route path="/currency-flip" element={<CurrencyFlip />} />
                        <Route path="/gc-seals" element={<GcSeals />} />
                        <Route path="/craft-batch" element={<CraftBatch />} />
                        <Route path="/batch-history" element={<BatchHistory />} />
                        <Route path="/compare" element={<Compare />} />
                        <Route path="/cleanup" element={<Cleanup />} />
                        <Route path="/craft-from-inventory" element={<CraftFromInventory />} />
                        <Route path="/quest-items" element={<QuestItems />} />
                        <Route path="/heatmap" element={<Heatmap />} />
                        <Route path="/glamour" element={<GlamourDemand />} />
                        <Route path="/item/:id" element={<Item />} />
                        <Route path="/queries" element={<Navigate to="/crafts" replace />} />
                        <Route path="/insights" element={<Navigate to="/trading" replace />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
                        <Route path="/submarines" element={<Submarines />} />
                        <Route path="/planner" element={<Planner />} />
                        <Route path="/projects" element={<Projects />} />
                        <Route path="/projects/:id" element={<Project />} />
                        <Route path="/craft-lists" element={<CraftLists />} />
                        <Route path="/craft-lists/saved" element={<YourLists />} />
                        <Route path="/craft-lists/:id" element={<ListDetail />} />
                      </Routes>
                      </Suspense>
                    </ErrorBoundary>
                  </div>
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
