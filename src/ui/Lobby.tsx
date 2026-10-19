import { useState } from 'react';
import { Difficulty, DIFFICULTY_NAMES } from '../ai/profiles';
import { payoutStructure, sngPayouts } from '../game/icm';
import { HANDS_PER_LEVEL } from '../game/session';
import { bestFinish, TIERS, unlockedTiers } from '../game/tiers';
import { useGame } from '../store/useGame';

export function Lobby() {
  const { setScreen, startTier, tourneys, hasSave, resume } = useGame();
  const [diff, setDiff] = useState<Difficulty>(3);
  const unlocked = unlockedTiers(tourneys);
  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="lobby">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="lobby-back">← 뒤로</button><h1 className="text-xl font-bold">토너먼트 로비</h1></div>
      <p className="text-sm text-slate-300">규모가 커지는 7단계 래더입니다. 한 단계에서 입상(ITM)하면 다음 단계가 열립니다. 블라인드는 레벨마다 오르고, 큰 대회는 레이트 등록으로 참가자가 늘며 테이블이 합쳐집니다.</p>
      {hasSave && <button className="btn w-full bg-emerald-600" onClick={() => resume()} data-testid="lobby-resume">▶ 진행 중인 토너먼트 이어하기</button>}
      <div className="flex gap-1 flex-wrap items-center"><span className="text-xs text-slate-400">상대 수준</span>{([1, 2, 3, 4, 5] as Difficulty[]).map((d) => <button key={d} className={`btn !min-h-[32px] !py-0.5 text-xs ${diff === d ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setDiff(d)} data-testid={`lobby-diff-${d}`}>{DIFFICULTY_NAMES[d]}</button>)}</div>
      <ul className="space-y-2">
        {TIERS.map((t, i) => {
          const locked = i >= unlocked;
          const paid = t.kind === 'mtt' ? payoutStructure(t.entrants, t.buyIn).length : sngPayouts(t.entrants, t.buyIn).length;
          const best = bestFinish(tourneys, t.id);
          const pool = t.buyIn * t.entrants;
          const tables = Math.ceil(t.entrants / t.tableSize);
          return (
            <li key={t.id} className={`p-3 rounded-xl border ${locked ? 'border-slate-800 bg-slate-900/40 opacity-60' : 'border-slate-600 bg-slate-900'}`} data-testid={`tier-${t.id}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{i + 1}단계 · {t.name}{locked ? ' 🔒' : ''}</div>
                  <div className="text-xs text-slate-300">{t.desc}</div>
                  <div className="text-[11px] text-slate-400 mt-1">참가 {t.entrants}명{t.lateRegUntilLevel ? ` (레이트 등록 레벨 ${t.lateRegUntilLevel}까지 증가)` : ''} · 테이블 {tables}개 · 시작 {t.startBB}BB · 레벨당 {HANDS_PER_LEVEL[t.speed]}핸드 · 입상 {paid}명 · 상금 풀 {pool.toLocaleString()}{t.reentry ? ' · 재진입 가능' : ''}</div>
                  {best && <div className="text-[11px] text-emerald-300">최고 성적 {best.place}위 / {best.entrants}명</div>}
                  {locked && <div className="text-[11px] text-amber-200">이전 단계에서 입상하면 열립니다</div>}
                </div>
                <button className="btn bg-gradient-to-r from-sky-600 to-indigo-600 disabled:from-slate-700 disabled:to-slate-700 shrink-0" disabled={locked} onClick={() => startTier(t.id, 'TETO', diff)} data-testid={`start-${t.id}`}>시작</button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-500 pb-6">상금은 가상 칩 단위이며 실제 돈이 아닙니다. 참가자 AI는 서로 다른 성향과 약간씩 다른 난이도로 구성됩니다.</p>
    </div>
  );
}
