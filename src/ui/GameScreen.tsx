import { useEffect, useState } from 'react';
import { CoachCard } from './CoachCard';
import { StoryFeed } from './StoryFeed';
import { TourneyHud } from './TourneyHud';
import { tourneyStatus, ZONE_LABEL, STAGES } from '../game/tourney';
import { RebuyPanel } from './RebuyPanel';
import { currentBlinds, blindStructure, HANDS_PER_LEVEL, LEVEL_COUNT, sessionOver, Session } from '../game/session';
import { ActionBar } from './ActionBar';
import { ReviewPanel } from './Review';
import { TableView } from './Table';
import { useGame } from '../store/useGame';
import { decide } from '../ai/decide';
import { observe } from '../ai/observation';
import { createRng } from '../engine/rng';
import { legalActions } from '../engine/game';

export function GameScreen({ sess }: { sess: Session }) {
  const { nextHand, quit, busy, settings, setSettings, notice, reenter, declineReentry, simToEnd, skipAI, leaveTable, wallet } = useGame();
  const [panel, setPanel] = useState<'log' | 'hist' | null>(null);
  const [review, setReview] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [bubble, setBubble] = useState<{ name: string; text: string } | null>(null);
  const feed = sess.feed ?? [];
  const lastTalk = [...feed].reverse().find((l) => l.kind === 'talk');
  useEffect(() => {
    if (!lastTalk || Date.now() - lastTalk.ts > 8000) return;
    setBubble({ name: lastTalk.speaker, text: lastTalk.text });
    const t = setTimeout(() => setBubble(null), 5000);
    return () => clearTimeout(t);
  }, [lastTalk?.id]); // eslint-disable-line
  const lastSys = [...feed].reverse().find((l) => l.kind === 'system');
  const [announce, setAnnounce] = useState<string | null>(null);
  useEffect(() => {
    if (!lastSys || Date.now() - lastSys.ts > 8000) return;
    setAnnounce(lastSys.text);
    const t = setTimeout(() => setAnnounce(null), 7000);
    return () => clearTimeout(t);
  }, [lastSys?.id]); // eslint-disable-line
  const cash = sess.config.cash;
  const acct = sess.sid ? wallet.accounts[sess.sid] : undefined;
  const g = sess.game;
  const complete = g.street === 'complete';
  const heroSeat = g.players.findIndex((p) => p.isHuman);
  const hero = g.players[heroSeat];
  const bl = currentBlinds(sess);
  const mtt = sess.mtt;
  const tourney = sess.config.mode === 'sng' || sess.config.mode === 'headsup-sng' || sess.config.mode === 'mtt';
  const roundsLeft = mtt ? HANDS_PER_LEVEL[sess.config.speed] - (mtt.round % HANDS_PER_LEVEL[sess.config.speed]) : HANDS_PER_LEVEL[sess.config.speed] - sess.levelHand;
  const over = sessionOver(sess);
  const nextBl = tourney ? blindStructure(sess.config.bb)[Math.min(sess.level + 1, LEVEL_COUNT - 1)] : null;
  const rec = sess.records[sess.records.length - 1];
  const alive = g.players.filter((p) => !p.busted).length;
  const effBB = (() => { const live = g.players.filter((p) => p.inHand && !p.folded || (complete && p.stack > 0)); if (live.length < 2) return null; const st = live.map((p) => p.stack + p.bet).sort((a, b) => b - a); return Math.min(hero.stack + hero.bet, st[0] === hero.stack + hero.bet ? st[1] : st[0]) / g.config.bb; })();
  const heroFolded = hero.folded && !complete;
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
          블라인드 {bl.sb}/{bl.bb}{bl.ante ? ` 앤티 ${bl.ante}` : ''} · 핸드 #{g.handNo}{effBB !== null ? ` · 유효 ${effBB.toFixed(1)}BB` : ''}
          {sess.config.mode === 'trainer' && ' · 훈련 모드'}
          {cash && acct && acct.kind !== 'practice' && ` · 테이블 손익 ${(() => { const n = hero.stack + hero.bet + hero.invested * (complete ? 0 : 1) - acct.spent; return (n >= 0 ? '+' : '') + n.toLocaleString(); })()}`}
          {cash && ` · ${cash.label}`}
          {sess.prize && ` · 참가비 ${(sess.prize.buyIn + sess.prize.fee).toLocaleString()}`}
        </div>
        <button className="btn !min-h-[34px] !py-1 bg-slate-700" onClick={() => setSettings({ sound: !settings.sound })} aria-label="소리" data-testid="btn-sound">{settings.sound ? '🔊' : '🔇'}</button>
        <select className="bg-slate-800 rounded px-1 py-1" value={settings.animMs} onChange={(e) => setSettings({ animMs: Number(e.target.value) })} aria-label="속도" data-testid="speed">
          <option value={0}>즉시</option><option value={200}>빠름</option><option value={450}>보통</option><option value={900}>느림</option>
        </select>
        <button className={`btn !min-h-[34px] !py-1 ${settings.autoCoach ? 'bg-emerald-800' : 'bg-slate-700'}`} onClick={() => setSettings({ autoCoach: !settings.autoCoach })} title="핸드 종료 후 자동 코치" data-testid="btn-coach-toggle">코치 {settings.autoCoach ? 'ON' : 'OFF'}</button>
        <button className="btn !min-h-[34px] !py-1 bg-slate-700" onClick={() => setPanel(panel === 'log' ? null : 'log')} data-testid="btn-log">기록</button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {announce && <div className="mx-2 mt-2 rounded-lg bg-amber-500 text-black font-semibold text-xs sm:text-sm px-3 py-2 shadow-lg" role="alert" data-testid="announce">📣 {announce}</div>}
        {tourney && <TourneyHud sess={sess} />}
        <TableView sess={sess} bubble={bubble} />
        {feed.length > 0 && <StoryFeed lines={feed} />}
        {panel === 'log' && (
          <div className="mx-2 mb-2 p-2 rounded-lg bg-slate-900/90 border border-slate-700 text-xs max-h-40 overflow-y-auto" data-testid="log-panel">
            {g.events.filter((e) => e.type !== 'ante').map((e) => (
              <div key={e.seq}>{e.street} · {g.players[e.seat].name} {({ sb: '스몰블라인드', bb: '빅블라인드', fold: '폴드', check: '체크', call: '콜', bet: '베팅', raise: '레이즈', ante: '앤티' } as const)[e.type]}{e.paid ? ` ${e.paid}` : ''}{e.allIn ? ' (올인)' : ''}</div>
            ))}
          </div>
        )}
        {heroFolded && busy && <div className="px-2"><button className="btn !min-h-[34px] !py-1 bg-slate-700 text-xs" onClick={() => skipAI()} data-testid="btn-skip">⏩ 나머지 AI 핸드 건너뛰기</button></div>}
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
            {mtt?.heroOut && mtt.heroCanReenter && (
              <div className="p-3 rounded-lg bg-amber-900/50 space-y-2" data-testid="reenter-panel">
                <div>탈락했습니다. 재진입하시겠습니까? (엔트리 {mtt.entries})</div>
                <div className="flex gap-2"><button className="btn bg-amber-600 text-black" onClick={() => reenter()} data-testid="btn-reenter">재진입</button><button className="btn bg-slate-700" onClick={() => declineReentry()} data-testid="btn-decline">포기</button></div>
              </div>
            )}
            {mtt && over && (
              <div className="p-3 rounded-lg bg-indigo-900/60 space-y-1 text-sm" data-testid="mtt-over">
                <div className="text-lg font-bold">{mtt.places['hero'] === 1 ? '🏆 우승!' : `최종 ${mtt.places['hero'] ?? '-'}위 / ${mtt.totalEntries}명`}</div>
                <div>상금 {mtt.heroPrize.toLocaleString()} · 바이인 {(mtt.config.buyIn * mtt.entries).toLocaleString()} · ROI {(((mtt.heroPrize - mtt.config.buyIn * mtt.entries) / (mtt.config.buyIn * mtt.entries)) * 100).toFixed(0)}% (가상 칩)</div>
                {!mtt.finished && <button className="btn !min-h-[34px] !py-1 bg-slate-700 text-xs" onClick={() => simToEnd()} disabled={busy} data-testid="btn-sim-end">{busy ? '진행 중…' : '남은 대회 끝까지 진행해 우승자 보기'}</button>}
                {mtt.finished && mtt.winner && <div className="text-sm" data-testid="mtt-winner">우승: {mtt.names[mtt.winner] ?? mtt.winner}</div>}
                {mtt.icmLog.length > 0 && (
                  <div className="text-xs" data-testid="icm-log">
                    <div className="font-semibold mt-1">ICM 사후 분석 (파이널 테이블, 근사)</div>
                    {mtt.icmLog.slice(-8).map((r) => <div key={r.round}>R{r.round} · {r.players}명 · 칩 비중 {(r.chipShare * 100).toFixed(1)}% → ICM 비중 {r.icmShare === null ? '-' : (r.icmShare * 100).toFixed(1) + '%'}</div>)}
                    <div className="text-slate-400">ICM 비중은 Malmuth–Harville 모델 계산값입니다. 칩 리더의 칩 가치는 ICM에서 할인됩니다.</div>
                  </div>
                )}
              </div>
            )}
            {!mtt && over && (
              <div className="p-3 rounded-lg bg-indigo-900/60" data-testid="game-over">
                <div className="text-lg font-bold">{hero.finishPlace === 1 || !heroBusted ? '🏆 우승!' : `종료 — ${hero.finishPlace ?? '-'}위`}</div>
                <div className="text-sm">토너먼트 순위: {g.players.slice().sort((a, b) => (a.finishPlace ?? 99) - (b.finishPlace ?? 99)).map((p) => `${p.finishPlace ?? '-'}. ${p.name}`).join(' · ')}</div>
              </div>
            )}
            {cash && !over && <RebuyPanel sess={sess} />}
            {rec && settings.autoCoach && <CoachCard tctx={(() => { const ts = tourneyStatus(sess); return ts ? { M: ts.M, zone: ts.zone, zoneLabel: ZONE_LABEL[ts.zone], nearBubble: ts.nearBubble, bubble: ts.bubble, stageLabel: STAGES[ts.stageIndex].label, heroVsAvg: ts.heroVsAvg } : undefined; })()} rec={rec} onDetail={() => setReview(!review)} detailOpen={review} />}
            {review && rec && <ReviewPanel rec={rec} defaultLevel="detail" />}
          </div>
        )}
      </div>
      {complete ? (
        <div className="p-2 space-y-2 border-t border-slate-700 bg-slate-950/90" data-testid="hand-end-bar">
          {over ? (
            <div className="flex gap-2 items-center"><div className="text-sm text-slate-300 flex-1">경기가 종료되었습니다. 상금은 통장에 정산되었습니다.</div><button className="btn bg-slate-700" onClick={() => setReview(!review)} data-testid="btn-review">{review ? '복기 닫기' : '핸드 복기'}</button><button className="btn bg-emerald-600" onClick={() => leaveTable()} data-testid="btn-to-lobby">로비로</button></div>
          ) : mtt?.heroOut && mtt.heroCanReenter ? (
            <div className="text-sm text-amber-200">재진입 여부를 선택하세요.</div>
          ) : (
            <div className="flex gap-2 [&>button]:whitespace-nowrap [&>button]:px-3">
              {cash && <button className="btn bg-slate-700 text-xs sm:text-sm" onClick={() => leaveTable()} data-testid="btn-leave">테이블 나가기(정산)</button>}
              <button className="btn flex-1 bg-emerald-600" onClick={() => { setReview(false); setHint(null); nextHand(); }} disabled={busy || (heroBusted && !!cash) || !!(mtt?.heroOut && mtt.heroCanReenter)} data-testid="btn-next">{mtt && heroBusted ? '결과 확인' : '다음 핸드'}</button>
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
