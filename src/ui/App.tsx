import { useEffect } from 'react';
import { useGame } from '../store/useGame';
import { GameScreen } from './GameScreen';
import { Menu } from './Menu';
import { StatsScreen } from './StatsScreen';
import { HistoryScreen } from './HistoryScreen';
import { TrainerScreen } from './Trainer';
import { CoachScreen } from './CoachScreen';
import { WalletScreen } from './WalletScreen';
import { PracticeSetup } from './PracticeSetup';
import { Lobby } from './Lobby';

export function App() {
  const { init, screen, session } = useGame();
  useEffect(() => { void init(); }, [init]);
  return (
    <div className="h-full bg-[#05090f]">
      {screen === 'menu' && <Menu />}
      {screen === 'table' && session && <GameScreen sess={session} />}
      {screen === 'stats' && <StatsScreen />}
      {screen === 'history' && <HistoryScreen />}
      {screen === 'trainer' && <TrainerScreen />}
      {screen === 'coach' && <CoachScreen />}
      {screen === 'wallet' && <WalletScreen />}
      {screen === 'practice' && <PracticeSetup />}
      {screen === 'lobby' && <Lobby />}
    </div>
  );
}
