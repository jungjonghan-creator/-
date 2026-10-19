import { useMemo } from 'react';
import { positionLabels } from '../ai/observation';
import { PROFILES } from '../ai/profiles';
import { buildPots, potTotal } from '../engine/game';
import { Session } from '../game/session';
import { CardView } from './CardView';
import { useGame } from '../store/useGame';

const AVATARS = ['🦊', '🐺', '🦉', '🐯', '🦈', '🐙', '🦅', '🐻'];

export function seatXY(rel: number, n: number) {
  const ang = Math.PI / 2 + (rel * 2 * Math.PI) / n;
  return { x: 50 + 40 * Math.cos(ang), y: 50 + 37 * Math.sin(ang), ix: 50 + 23 * Math.cos(ang), iy: 50 + 21 * Math.sin(ang) };
}

export function TableView({ sess, revealAll = false, bubble = null }: { sess: Session; revealAll?: boolean; bubble?: { name: string; text: string } | null }) {
  const g = sess.game;
  const { settings } = useGame();
  const heroSeat = g.players.findIndex((p) => p.isHuman);
  const n = g.players.length;
  const labels = useMemo(() => positionLabels(g), [g.handNo, g.players.length]);
  const complete = g.street === 'complete';
  const pots = useMemo(() => (g.street !== 'complete' ? buildPots(g.players).layers : (g.result?.pots ?? []).map((p) => ({ amount: p.amount, eligible: p.eligible }))), [g]);
  const total = complete ? (g.result?.pots.reduce((t, p) => t + p.amount, 0) ?? 0) : potTotal(g);
  const anim = { ['--anim' as any]: `${Math.max(60, settings.animMs / 2)}ms` };
  const winners = new Set<number>(complete ? g.result?.pots.flatMap((p) => p.winners) ?? [] : []);
  const showdown = complete && g.result && !g.result.endedByFold;

  return (
    <div className="relative w-full mx-auto" style={{ ...anim, maxWidth: 980 }}>
      <div className="relative w-full aspect-[3/4] sm:aspect-[16/10] max-h-[68vh] [@media(max-height:520px)_and_(orientation:landscape)]:aspect-auto [@media(max-height:520px)_and_(orientation:landscape)]:max-h-none [@media(max-height:520px)_and_(orientation:landscape)]:h-[calc(100dvh-178px)]" data-testid="table">
        <div className="felt absolute inset-[11%] sm:inset-[9%] rounded-[50%]" />
        {/* 중앙: 보드 + 팟 */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 w-[70%]">
          <div className="text-[10px] sm:text-xs uppercase tracking-widest text-sky-200/70" data-testid="street">{({ preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운', complete: '핸드 종료' } as const)[g.street]}</div>
          <div className="flex gap-1 min-h-[3.5rem]" data-testid="board">
            {g.board.map((c, i) => <CardView key={`${g.handNo}-${c}`} card={c} size="md" delayMs={i * 60} />)}
          </div>
          <div className="px-3 py-1 rounded-full bg-black/50 text-yellow-300 font-bold text-sm" data-testid="pot">팟 {total.toLocaleString()}</div>
          {pots.length > 1 && (
            <div className="flex gap-1 flex-wrap justify-center text-[10px] text-sky-100/80" data-testid="sidepots">
              {pots.map((p, i) => <span key={i} className="px-1.5 rounded bg-black/40">{i === 0 ? '메인' : `사이드${i}`} {p.amount.toLocaleString()}</span>)}
            </div>
          )}
        </div>
        {/* 좌석 */}
        {g.players.map((p, i) => {
          const rel = (i - heroSeat + n) % n;
          const { x, y, ix, iy } = seatXY(rel, n);
          const isHero = i === heroSeat;
          const isTurn = g.toAct === i;
          const showCards = p.inHand && !p.folded && (isHero || (showdown && g.result?.shown[i]) || revealAll);
          const inactive = p.busted || !p.inHand;
          return (
            <div key={p.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }} data-testid={`seat-${i}`}>
              {bubble && bubble.name === p.name && (
                <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-[calc(100%-6px)] w-[8.5rem] sm:w-48 rounded-xl bg-white text-slate-900 text-[10px] sm:text-xs px-2 py-1 shadow-lg chip-pop leading-snug" data-testid="bubble" role="status">
                  {bubble.text}
                  <span className="absolute left-1/2 -bottom-1 w-2 h-2 bg-white rotate-45 -translate-x-1/2" aria-hidden />
                </div>
              )}
              <div className={`flex flex-col items-center ${p.folded || inactive ? 'opacity-50' : ''}`}>
                <div className="flex -mb-2 z-10">
                  {p.inHand && !p.folded && p.hole.map((c, k) => (
                    <div key={`${g.handNo}-${k}`} className={k ? '-ml-2' : ''}>
                      <CardView card={c} hidden={!showCards} size={isHero ? 'md' : 'sm'} delayMs={k * 80 + rel * 40} />
                    </div>
                  ))}
                </div>
                <div className={`relative rounded-xl px-2 py-1 min-w-[78px] sm:min-w-[104px] text-center bg-slate-900/95 border ${isTurn ? 'acting border-yellow-400' : winners.has(i) ? 'border-emerald-400' : 'border-slate-600'}`}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-base sm:text-xl" aria-hidden>{AVATARS[i % AVATARS.length]}</span>
                    <span className="text-[11px] sm:text-sm font-semibold truncate max-w-[64px] sm:max-w-[90px]" data-testid={`name-${i}`}>{p.name}</span>
                  </div>
                  <div className="text-[11px] sm:text-sm text-yellow-200 font-bold" data-testid={`stack-${i}`}>{p.busted ? '탈락' : p.allIn ? '올인' : p.stack.toLocaleString()}</div>
                  <div className="text-[9px] sm:text-[11px] text-slate-300 min-h-[12px]">{p.inHand ? labels[i] : ''}{p.lastAction && !complete ? ` · ${p.lastAction}` : ''}</div>
                  {settings.revealAI && !isHero && sess.aiBySeat[i] && <div className="text-[9px] text-sky-300">{PROFILES[sess.aiBySeat[i].profileId]?.label} d{sess.aiBySeat[i].difficulty}</div>}
                  {i === g.button && !inactive && <div className="absolute -right-2 -top-2 w-5 h-5 rounded-full bg-white text-black text-[10px] font-extrabold flex items-center justify-center" title="버튼" data-testid="dealer-button">D</div>}
                  {complete && g.result && g.result.net[i] !== undefined && g.result.net[i] !== 0 && (
                    <div className={`absolute left-1/2 -translate-x-1/2 -bottom-4 text-xs font-bold ${g.result.net[i] > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{g.result.net[i] > 0 ? '+' : ''}{g.result.net[i].toLocaleString()}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {/* 베팅 칩 (좌석 → 중앙 방향) */}
        {g.players.map((p, i) => {
          if (p.bet <= 0 || complete) return null;
          const { ix, iy } = seatXY((i - heroSeat + n) % n, n);
          return (
            <div key={`bet-${p.id}`} className="absolute chip-pop px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] sm:text-xs font-bold whitespace-nowrap -translate-x-1/2 -translate-y-1/2" style={{ left: `${ix}%`, top: `${iy}%` }} data-testid={`bet-${i}`}>
              {p.bet.toLocaleString()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
