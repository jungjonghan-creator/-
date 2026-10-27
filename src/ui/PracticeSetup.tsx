import { useState } from 'react';
import { SPEED_LABEL } from '../game/blinds';
import { AI_LEVELS, Difficulty, PERSONAS } from '../ai/profiles';
import { Mode, Speed, defaultAIs } from '../game/session';
import { useGame } from '../store/useGame';

/** 통장과 무관한 연습 경기 설정. 칩은 통장 자산으로 전환되지 않는다. */
export function PracticeSetup() {
  const { startPractice, setScreen } = useGame();
  const [mode, setMode] = useState<Mode>('cash');
  const [seats, setSeats] = useState(2);
  const [startBB, setStartBB] = useState(50);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [diff, setDiff] = useState<Difficulty>(3);
  const [profile, setProfile] = useState('AdaptivePro');
  const effSeats = mode === 'headsup-sng' ? 2 : seats;
  const go = () => startPractice({ mode, seats: effSeats, startBB: mode === 'cash' || mode === 'trainer' ? startBB : Math.max(startBB, 20), bb: 100, speed, humanName: 'TETO', ais: defaultAIs(effSeats - 1, diff, profile) });
  const sel = (v: boolean) => `btn ${v ? 'bg-sky-600' : 'bg-slate-700 hover:bg-slate-600'}`;
  return (
    <div className="max-w-xl mx-auto p-4 space-y-4 safe-pad overflow-y-auto h-full" data-testid="practice">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="practice-back">← 뒤로</button><h1 className="text-xl font-bold">연습 경기</h1></div>
      <p className="text-xs text-slate-400">통장과 연결되지 않습니다. 칩을 잃어도 자산이 줄지 않고, 따도 자산이 늘지 않습니다. 설정을 자유롭게 바꿔 연습하세요.</p>
      <section className="space-y-2">
        <h2 className="font-bold">유형</h2>
        <div className="grid grid-cols-2 gap-2">
          <button className={sel(mode === 'cash')} onClick={() => setMode('cash')} data-testid="mode-cash">연습 캐시게임</button>
          <button className={sel(mode === 'headsup-sng')} onClick={() => setMode('headsup-sng')} data-testid="mode-hu-sng">헤즈업 싯앤고</button>
          <button className={sel(mode === 'sng')} onClick={() => { setMode('sng'); if (seats === 2) setSeats(6); }} data-testid="mode-sng">6/9인 싯앤고</button>
          <button className={sel(mode === 'trainer')} onClick={() => setMode('trainer')} data-testid="mode-trainer">훈련 테이블(힌트)</button>
        </div>
      </section>
      {mode !== 'headsup-sng' && (
        <section className="space-y-2"><h2 className="font-bold">인원</h2>
          <div className="flex gap-2">{(mode === 'sng' ? [6, 9] : [2, 6, 9]).map((n) => <button key={n} className={sel(seats === n)} onClick={() => setSeats(n)} data-testid={`seats-${n}`}>{n === 2 ? '헤즈업' : n === 6 ? '6-Max' : 'Full Ring'}</button>)}</div>
        </section>
      )}
      <section className="space-y-2"><h2 className="font-bold">시작 스택 (BB)</h2>
        <div className="flex gap-2 items-center flex-wrap">
          {[20, 50, 100].map((n) => <button key={n} className={sel(startBB === n)} onClick={() => setStartBB(n)} data-testid={`stack-${n}`}>{n}BB</button>)}
          <input className="w-24 bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-right" inputMode="numeric" value={startBB} onChange={(e) => setStartBB(Math.max(5, Math.min(500, Number(e.target.value.replace(/\D/g, '')) || 5)))} data-testid="stack-custom" aria-label="사용자 지정 스택" />
        </div>
      </section>
      {(mode === 'sng' || mode === 'headsup-sng') && (
        <section className="space-y-2"><h2 className="font-bold">블라인드 속도</h2>
          <div className="flex gap-2 flex-wrap">{(['slow', 'normal', 'turbo', 'hyper'] as Speed[]).map((s) => <button key={s} className={sel(speed === s)} onClick={() => setSpeed(s)} data-testid={`speed-${s}`}>{SPEED_LABEL[s]}</button>)}</div>
        </section>
      )}
      <section className="space-y-2"><h2 className="font-bold">AI 수준</h2>
        <div className="flex gap-1 flex-wrap">{AI_LEVELS.map((l) => <button key={l.id} className={sel(diff === l.difficulty)} onClick={() => setDiff(l.difficulty)} data-testid={`diff-${l.difficulty}`}>{l.label}</button>)}</div>
        <h2 className="font-bold pt-1">대표 상대 성격</h2>
        <select className="w-full bg-slate-800 rounded-lg px-2 py-2" value={profile} onChange={(e) => setProfile(e.target.value)} data-testid="profile">
          {PERSONAS.map((p) => <option key={p.id} value={p.profileId}>{p.label} — {p.short}</option>)}
        </select>
      </section>
      <button className="btn w-full bg-gradient-to-r from-sky-600 to-indigo-600 text-lg" onClick={go} data-testid="btn-start">연습 시작</button>
    </div>
  );
}
