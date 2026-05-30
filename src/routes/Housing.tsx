import { LotteryClockBanner } from '../features/housing/LotteryClockBanner';
import { HousingMarketView } from '../features/housing/HousingMarketView';

export default function Housing() {
  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      <LotteryClockBanner />
      <HousingMarketView />
    </div>
  );
}
