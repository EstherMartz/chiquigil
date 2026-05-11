import { Routes, Route } from 'react-router-dom';
import { Header } from './components/layout/Header';
import Home from './routes/Home';
import Watchlist from './routes/Watchlist';
import Insights from './routes/Insights';
import Queries from './routes/Queries';
import Settings from './routes/Settings';

export default function App() {
  return (
    <div className="min-h-screen pt-8 pb-20">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/queries" element={<Queries />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
