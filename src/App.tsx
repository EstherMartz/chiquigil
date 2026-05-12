import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
import Home from './routes/Home';
import Watchlist from './routes/Watchlist';
import Crafts from './routes/Crafts';
import Trading from './routes/Trading';
import Gathering from './routes/Gathering';
import Settings from './routes/Settings';

export default function App() {
  return (
    <div className="min-h-screen pt-8 pb-20">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/crafts" element={<Crafts />} />
        <Route path="/trading" element={<Trading />} />
        <Route path="/gathering" element={<Gathering />} />
        <Route path="/queries" element={<Navigate to="/crafts" replace />} />
        <Route path="/insights" element={<Navigate to="/trading" replace />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
