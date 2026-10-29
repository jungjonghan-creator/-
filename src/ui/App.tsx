import { useEffect, useState } from 'react';
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
import { api } from '../net/api';
import { captureInvite, clearInvite, pendingInvite } from '../net/invite';

export function App() {
  const { attachAccount, screen, session, ready, settings } = useGame();
  useEffect(() => { document.documentElement.classList.toggle('big-text', !!settings.bigText); document.documentElement.classList.toggle('reduce-motion', !!settings.reduceMotion); }, [settings.bigText, settings.reduceMotion]);
  const { mode, user, check } = useAccount();
  useEffect(() => { void check(); }, [check]);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  useEffect(() => { captureInvite(); }, []);
  useEffect(() => {
    const code = pendingInvite();
    if (mode !== 'online' || !user || !code) return;
    void api<{ name?: string }>('POST', '/api/groups/join', { code }).then((r) => {
      clearInvite();
      setInviteMsg(r.ok ? `초대받은 친구 그룹에 참여했습니다${(r.data as { name?: string }).name ? `: ${(r.data as { name?: string }).name}` : ''}. 랭킹 → 친구에서 확인하세요.` : `초대 코드를 쓸 수 없습니다: ${(r.data as { error?: string }).error ?? ''}`);
    });
  }, [mode, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === 'online' && user) void attachAccount(user.id);
    else if (mode === 'local') void attachAccount(null);
  }, [mode, user?.id, attachAccount]); // eslint-disable-line react-hooks/exhaustive-deps
  if (mode === 'unknown') return <div className="h-full grid place-items-center text-slate-400" data-testid="splash">연결 중…</div>;
  if (mode === 'needLogin') return <div className="h-full bg-[#05090f]"><AuthScreen /></div>;
  if (!ready) return <div className="h-full grid place-items-center text-slate-400" data-testid="loading">불러오는 중…</div>;
  return (
    <div className="h-full bg-[#05090f]">
      {inviteMsg && <div className="fixed top-2 inset-x-2 z-50 rounded bg-emerald-800 text-emerald-50 text-sm px-3 py-2 shadow" role="status" data-testid="invite-banner" onClick={() => setInviteMsg(null)}>{inviteMsg} <span className="opacity-70">(탭하여 닫기)</span></div>}
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
