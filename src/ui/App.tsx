import { useEffect } from 'react';
import { useGame } from '../store/useGame';
import { useAccount } from '../store/useAccount';
import { GameScreen } from './GameScreen';
import { Menu } from './Menu';
import { StatsScreen } from './StatsScreen';
import { HistoryScreen } from './HistoryScreen';
import { TrainerScreen } from './Trainer';
import { LabScreen } from './LabScreen';
import { WalletScreen } from './WalletScreen';
import { PracticeSetup } from './PracticeSetup';
import { Lobby } from './Lobby';
import { AuthScreen } from './AuthScreen';
import { WorldScreen } from './WorldScreen';
import { RankingScreen } from './RankingScreen';
import { DexScreen } from './DexScreen';
import { NewsScreen } from './NewsScreen';
import { AccountScreen } from './AccountScreen';

export function App() {
  const { attachAccount, screen, session, ready } = useGame();
  const { mode, user, check } = useAccount();
  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    if (mode === 'online' && user) void attachAccount(user.id);
    else if (mode === 'local') void attachAccount(null);
  }, [mode, user?.id, attachAccount]); // eslint-disable-line react-hooks/exhaustive-deps
  if (mode === 'unknown') return <div className="h-full grid place-items-center text-slate-400" data-testid="splash">연결 중…</div>;
  if (mode === 'needLogin') return <div className="h-full bg-[#05090f]"><AuthScreen /></div>;
  if (!ready) return <div className="h-full grid place-items-center text-slate-400" data-testid="loading">불러오는 중…</div>;
  return (
    <div className="h-full bg-[#05090f]">
      {screen === 'menu' && <Menu />}
      {screen === 'table' && session && <GameScreen sess={session} />}
      {screen === 'stats' && <StatsScreen />}
      {screen === 'history' && <HistoryScreen />}
      {screen === 'trainer' && <TrainerScreen />}
      {screen === 'coach' && <LabScreen />}
      {screen === 'wallet' && <WalletScreen />}
      {screen === 'practice' && <PracticeSetup />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'world' && <WorldScreen />}
      {screen === 'ranking' && <RankingScreen />}
      {screen === 'dex' && <DexScreen />}
      {screen === 'news' && <NewsScreen />}
      {screen === 'account' && <AccountScreen />}
    </div>
  );
}
