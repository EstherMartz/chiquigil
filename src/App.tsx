import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ContentBar } from './components/layout/ContentBar';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
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
import QuestItems from './routes/QuestItems';
import Heatmap from './routes/Heatmap';
import CraftBatch from './routes/CraftBatch';
import BatchHistory from './routes/BatchHistory';
import Item from './routes/Item';
import Settings from './routes/Settings';
import Submarines from './routes/Submarines';
import Planner from './routes/Planner';

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('ffxiv-helper:onboarded'),
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}
      <main className="flex-1 min-w-0 pt-16 md:pt-8 pb-20 px-4">
        <ContentBar />
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
            <Route path="/currency-flip" element={<CurrencyFlip />} />
            <Route path="/gc-seals" element={<GcSeals />} />
            <Route path="/craft-batch" element={<CraftBatch />} />
            <Route path="/batch-history" element={<BatchHistory />} />
            <Route path="/cleanup" element={<Cleanup />} />
            <Route path="/quest-items" element={<QuestItems />} />
            <Route path="/heatmap" element={<Heatmap />} />
            <Route path="/item/:id" element={<Item />} />
            <Route path="/queries" element={<Navigate to="/crafts" replace />} />
            <Route path="/insights" element={<Navigate to="/trading" replace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/submarines" element={<Submarines />} />
            <Route path="/planner" element={<Planner />} />
          </Routes>
      </main>
    </div>
  );
}
