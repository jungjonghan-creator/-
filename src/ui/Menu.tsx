import { useState } from 'react';
import { Difficulty, DIFFICULTY_NAMES, PROFILE_IDS, PROFILES, AISetup } from '../ai/profiles';
import { Mode, Speed, defaultAIs } from '../game/session';
import { useGame } from '../store/useGame';

export function Menu() {
  const { start, resume, hasSave, setScreen, corrupt, dismissCorrupt } = useGame();
  const [mode, setMode] = useState<Mode>('cash');
  const [seats, setSeats] = useState(2);
  const [startBB, setStartBB] = useState(50);
  const [bb, setBB] = useState(100);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [diff, setDiff] = useState<Difficulty>(3);
  const [profile, setProfile] = useState('Balanced');
  const [name, setName] = useState('TETO');

  const effSeats = mode === 'headsup-sng' ? 2 : seats;
  const go = () => {
    const first = profile;
    const ais: AISetup[] = defaultAIs(effSeats - 1, diff, first);
    start({ mode, seats: effSeats, startBB: mode === 'sng' || mode === 'headsup-sng' ? Math.max(startBB, 20) : startBB, bb, speed, humanName: name || 'TETO', ais });
  };
  const sel = (v: boolean) => `btn ${v ? 'bg-sky-600' : 'bg-slate-700 hover:bg-slate-600'}`;
  return (
    <div className="max-w-xl mx-auto p-4 space-y-4 safe-pad" data-testid="menu">
      <h1 className="text-3xl font-extrabold tracking-wide">♠ POKER ARENA <span className="text-sky-400">5.0</span></h1>
      <p className="text-xs text-slate-400">가상 칩 기반 개인용 노리밋 홀덤 시뮬레이터 — 실제 돈 없음.</p>
      {corrupt && (
        <div className="p-3 rounded-lg bg-rose-900/60 text-sm space-y-1" data-testid="corrupt">
          <b>저장 데이터가 손상되어 불러올 수 없습니다.</b>
          <ul className="list-disc pl-5 text-xs">{corrupt.errors.slice(0, 4).map((e, i) => <li key={i}>{e}</li>)}</ul>
          <button className="btn !min-h-[34px] bg-rose-700 text-xs" onClick={() => dismissCorrupt()}>손상된 저장 삭제</button>
        </div>
      )}
      {hasSave && <button className="btn w-full bg-emerald-600" onClick={() => resume()} data-testid="btn-resume">▶ 이어하기</button>}
      <section className="space-y-2">
        <h2 className="font-bold">게임 모드</h2>
        <div className="grid grid-cols-2 gap-2">
          <button className={sel(mode === 'cash')} onClick={() => setMode('cash')} data-testid="mode-cash">캐시게임</button>
          <button className={sel(mode === 'headsup-sng')} onClick={() => setMode('headsup-sng')} data-testid="mode-hu-sng">헤즈업 싯앤고</button>
          <button className={sel(mode === 'sng')} onClick={() => { setMode('sng'); if (seats === 2) setSeats(6); }} data-testid="mode-sng">6/9인 싯앤고</button>
          <button className={sel(mode === 'trainer')} onClick={() => setMode('trainer')} data-testid="mode-trainer">훈련 테이블(힌트)</button>
        </div>
      </section>
      {mode !== 'headsup-sng' && (
        <section className="space-y-2">
          <h2 className="font-bold">인원</h2>
          <div className="flex gap-2">
            {(mode === 'sng' ? [6, 9] : [2, 6, 9]).map((n) => <button key={n} className={sel(seats === n)} onClick={() => setSeats(n)} data-testid={`seats-${n}`}>{n === 2 ? '헤즈업' : n === 6 ? '6-Max' : 'Full Ring'}</button>)}
          </div>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-bold">시작 스택 (BB)</h2>
        <div className="flex gap-2 items-center flex-wrap">
          {[20, 50, 100].map((n) => <button key={n} className={sel(startBB === n)} onClick={() => setStartBB(n)} data-testid={`stack-${n}`}>{n}BB</button>)}
          <input className="w-24 bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-right" inputMode="numeric" value={startBB} onChange={(e) => setStartBB(Math.max(5, Math.min(500, Number(e.target.value.replace(/\D/g, '')) || 5)))} data-testid="stack-custom" aria-label="사용자 지정 스택" />
          <span className="text-xs text-slate-400">BB={bb}</span>
        </div>
      </section>
      {(mode === 'sng' || mode === 'headsup-sng') && (
        <section className="space-y-2"><h2 className="font-bold">블라인드 속도</h2>
          <div className="flex gap-2">{(['normal', 'turbo', 'hyper'] as Speed[]).map((s) => <button key={s} className={sel(speed === s)} onClick={() => setSpeed(s)}>{{ normal: '일반', turbo: '터보', hyper: '하이퍼터보' }[s]}</button>)}</div>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-bold">AI 난이도</h2>
        <div className="flex gap-1 flex-wrap">{([1, 2, 3, 4, 5] as Difficulty[]).map((d) => <button key={d} className={sel(diff === d)} onClick={() => setDiff(d)} data-testid={`diff-${d}`}>{DIFFICULTY_NAMES[d]}</button>)}</div>
        <h2 className="font-bold pt-1">대표 상대(NOVA) 성향</h2>
        <select className="w-full bg-slate-800 rounded-lg px-2 py-2" value={profile} onChange={(e) => setProfile(e.target.value)} data-testid="profile">
          {PROFILE_IDS.map((p) => <option key={p} value={p}>{PROFILES[p].label} — {PROFILES[p].desc}</option>)}
        </select>
        <p className="text-xs text-slate-400">나머지 AI는 서로 다른 성향으로 자동 배정됩니다. 실전에서는 성향이 숨겨집니다.</p>
      </section>
      <input className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} aria-label="이름" />
      <button className="btn w-full bg-gradient-to-r from-sky-600 to-indigo-600 text-lg" onClick={go} data-testid="btn-start">게임 시작</button>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn bg-slate-800 text-sm" onClick={() => setScreen('stats')} data-testid="nav-stats">통계</button>
        <button className="btn bg-slate-800 text-sm" onClick={() => setScreen('history')} data-testid="nav-history">핸드 기록</button>
        <button className="btn bg-slate-800 text-sm" onClick={() => setScreen('trainer')} data-testid="nav-trainer">푸시/폴드·스팟 훈련</button>
      </div>
    </div>
  );
}
