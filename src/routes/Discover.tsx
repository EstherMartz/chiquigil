import { useSearchParams } from 'react-router-dom';
import { DiscoverView } from '../features/watchlist/DiscoverView';

export default function Discover() {
  const [params] = useSearchParams();
  const category = params.get('category');
  const focus = params.get('focus');

  return <DiscoverView category={category} focus={focus} />;
}
