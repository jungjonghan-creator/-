import { useEffect } from 'react';
import { useGame } from '../store/useGame';
import { GameScreen } from './GameScreen';
import { Menu } from './Menu';
import { StatsScreen } from './StatsScreen';
import { HistoryScreen } from './HistoryScreen';
import { TrainerScreen } from './Trainer';

export function App() {
  const { init, screen, session } = useGame();
  useEffect(() => { void init(); }, [init]);
  return (
    <div className="h-full bg-[#05090f]">
      {screen === 'menu' && <div className="h-full overflow-y-auto"><Menu /></div>}
      {screen === 'table' && session && <GameScreen sess={session} />}
      {screen === 'stats' && <StatsScreen />}
      {screen === 'history' && <HistoryScreen />}
      {screen === 'trainer' && <TrainerScreen />}
    </div>
  );
}
