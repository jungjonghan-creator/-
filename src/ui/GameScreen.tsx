import { useState } from 'react';
import { currentBlinds, blindStructure, HANDS_PER_LEVEL, sessionOver, Session } from '../game/session';
import { ActionBar } from './ActionBar';
import { ReviewPanel } from './Review';
import { TableView } from './Table';
import { useGame } from '../store/useGame';
import { decide } from '../ai/decide';
import { observe } from '../ai/observation';
import { createRng } from '../engine/rng';
import { legalActions } from '../engine/game';

export function GameScreen({ sess }: { sess: Session }) {
  const { nextHand, quit, busy, settings, setSettings, notice, doRebuy } = useGame();
  const [panel, setPanel] = useState<'log' | 'hist' | null>(null);
  const [review, setReview] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const g = sess.game;
  const complete = g.street === 'complete';
  const heroSeat = g.players.findIndex((p) => p.isHuman);
  const hero = g.players[heroSeat];
  const bl = currentBlinds(sess);
  const tourney = sess.config.mode === 'sng' || sess.config.mode === 'headsup-sng';
  const over = sessionOver(sess);
  const nextBl = tourney ? blindStructure(sess.config.bb)[Math.min(sess.level + 1, 16)] : null;
  const rec = sess.records[sess.records.length - 1];
  const alive = g.players.filter((p) => !p.busted).length;
  const heroBusted = hero.busted || hero.stack === 0;

  const getHint = () => {
    if (g.toAct !== heroSeat || !legalActions(g)) return;
    const obs = observe(g, heroSeat);
    const d = decide(obs, { profileId: 'Balanced', difficulty: 5 }, sess.memory, createRng(g.handNo * 31 + g.events.length), sess.config.seed);
    const a = d.action;
    const txt = a.type === 'bet' || a.type === 'raise' ? `${a.type === 'bet' ? '베팅' : '레이즈'} ${a.to}` : a.type;
    setHint(`힌트(근사 휴리스틱, 솔버 아님): ${txt} — 승률 ${d.info.equity !== undefined ? (d.info.equity * 100).toFixed(0) + '%' : '-'} ${d.info.need !== undefined ? `/ 필요 ${(d.info.need * 100).toFixed(0)}%` : ''} (${d.info.note})`);
  };

  return (
    <div className="flex flex-col h-full max-w-[1100px] mx-auto safe-pad">
      <header className="flex items-center gap-2 px-2 py-1.5 text-xs sm:text-sm bg-slate-900/80 border-b border-slate-700">
        <button className="btn !min-h-[34px] !py-1 bg-slate-700" onClick={() => quit()} data-testid="btn-menu">☰ 메뉴</button>
        <div className="flex-1 truncate" data-testid="blinds">
          블라인드 {bl.sb}/{bl.bb}{bl.ante ? ` 앤티 ${bl.ante}` : ''} · 핸드 #{g.handNo}
          {tourney && ` · 레벨 ${sess.level + 1} (${HANDS_PER_LEVEL[sess.config.speed] - sess.levelHand}핸드 후 ${nextBl?.sb}/${nextBl?.bb})`}
          {tourney && ` · 생존 ${alive}/${g.players.length}`}
          {sess.config.mode === 'trainer' && ' · 훈련 모드'}
        </div>
        <button className="btn !min-h-[34px] !py-1 bg-slate-700" onClick={() => setSettings({ sound: !settings.sound })} aria-label="소리" data-testid="btn-sound">{settings.sound ? '🔊' : '🔇'}</button>
        <select className="bg-slate-800 rounded px-1 py-1" value={settings.animMs} onChange={(e) => setSettings({ animMs: Number(e.target.value) })} aria-label="속도" data-testid="speed">
          <option value={0}>즉시</option><option value={200}>빠름</option><option value={450}>보통</option><option value={900}>느림</option>
        </select>
        <button className="btn !min-h-[34px] !py-1 bg-slate-700" onClick={() => setPanel(panel === 'log' ? null : 'log')} data-testid="btn-log">기록</button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <TableView sess={sess} />
        {panel === 'log' && (
          <div className="mx-2 mb-2 p-2 rounded-lg bg-slate-900/90 border border-slate-700 text-xs max-h-40 overflow-y-auto" data-testid="log-panel">
            {g.events.filter((e) => e.type !== 'ante').map((e) => (
              <div key={e.seq}>{e.street} · {g.players[e.seat].name} {({ sb: '스몰블라인드', bb: '빅블라인드', fold: '폴드', check: '체크', call: '콜', bet: '베팅', raise: '레이즈', ante: '앤티' } as const)[e.type]}{e.paid ? ` ${e.paid}` : ''}{e.allIn ? ' (올인)' : ''}</div>
            ))}
          </div>
        )}
        {notice && <div className="mx-2 text-rose-300 text-xs">{notice}</div>}
        {hint && <div className="mx-2 p-2 rounded bg-sky-900/60 text-xs" data-testid="hint">{hint}</div>}
        {complete && (
          <div className="px-2 pb-3 space-y-2" data-testid="hand-end">
            {rec && (
              <div className="text-sm" data-testid="hand-result">
                {(() => {
                  const net = rec.result!.net[heroSeat] ?? 0;
                  return <b className={net > 0 ? 'text-emerald-300' : net < 0 ? 'text-rose-300' : ''}>{net > 0 ? `승리 +${net.toLocaleString()}` : net < 0 ? `패배 ${net.toLocaleString()}` : '본전'}</b>;
                })()}
                {' · '}{rec.result!.endedByFold ? '폴드로 종료' : '쇼다운'}
              </div>
            )}
            {over && (
              <div className="p-3 rounded-lg bg-indigo-900/60" data-testid="game-over">
                <div className="text-lg font-bold">{hero.finishPlace === 1 || !heroBusted ? '🏆 우승!' : `종료 — ${hero.finishPlace ?? '-'}위`}</div>
                <div className="text-sm">토너먼트 순위: {g.players.slice().sort((a, b) => (a.finishPlace ?? 99) - (b.finishPlace ?? 99)).map((p) => `${p.finishPlace ?? '-'}. ${p.name}`).join(' · ')}</div>
              </div>
            )}
            {review && rec && <ReviewPanel rec={rec} />}
          </div>
        )}
      </div>
      {complete ? (
        <div className="p-2 space-y-2 border-t border-slate-700 bg-slate-950/90" data-testid="hand-end-bar">
          {over ? (
            <div className="text-sm text-slate-300">세션이 종료되었습니다.</div>
          ) : (
            <div className="flex gap-2">
              {sess.config.mode === 'cash' && heroBusted
                ? <button className="btn flex-1 bg-amber-600 text-black" onClick={() => doRebuy(sess.config.startBB * sess.config.bb)} data-testid="btn-rebuy">리바이 {(sess.config.startBB * sess.config.bb).toLocaleString()}</button>
                : null}
              {sess.config.mode === 'cash' && !heroBusted && <button className="btn bg-slate-700" onClick={() => doRebuy(sess.config.startBB * sess.config.bb - hero.stack > 0 ? sess.config.startBB * sess.config.bb - hero.stack : 1)} disabled={hero.stack >= sess.config.startBB * sess.config.bb} data-testid="btn-topup">탑업</button>}
              <button className="btn flex-1 bg-emerald-600" onClick={() => { setReview(false); setHint(null); nextHand(); }} disabled={busy || (heroBusted && sess.config.mode === 'cash')} data-testid="btn-next">다음 핸드</button>
              <button className="btn bg-slate-700" onClick={() => setReview(!review)} data-testid="btn-review">{review ? '복기 닫기' : '핸드 복기'}</button>
            </div>
          )}
        </div>
      ) : (
        <div className="border-t border-slate-700 bg-slate-950/80">
          {sess.config.mode === 'trainer' && <div className="px-2 pt-1"><button className="btn !min-h-[34px] !py-1 bg-sky-800 text-xs" onClick={getHint} disabled={g.toAct !== heroSeat} data-testid="btn-hint">힌트 요청</button></div>}
          <ActionBar sess={sess} />
        </div>
      )}
    </div>
  );
}
