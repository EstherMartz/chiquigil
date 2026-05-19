import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
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
import Item from './routes/Item';
import Settings from './routes/Settings';

export default function App() {
  return (
    <div className="min-h-screen pt-8 pb-20">
      <Header />
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
        <Route path="/cleanup" element={<Cleanup />} />
        <Route path="/item/:id" element={<Item />} />
        <Route path="/queries" element={<Navigate to="/crafts" replace />} />
        <Route path="/insights" element={<Navigate to="/trading" replace />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
