import { useState } from 'react';
import { CHAPTERS } from '../story/chapters';
import { CHARACTERS } from '../story/characters';
import { canSit, chapterOf, minBuyIn, needsLoan, netWorth } from '../story/state';
import { useGame } from '../store/useGame';
import { PROFILES } from '../ai/profiles';

const fmt = (n: number) => n.toLocaleString();

export function StoryScreen() {
  const { story, setScreen, startStory, resume, hasSave, takeStoryLoan, dismissChapterClear, notice } = useGame();
  const [sel, setSel] = useState(story.chapter);
  const ch = chapterOf(sel);
  const worth = netWorth(story);
  const prog = Math.min(1, Math.max(0, worth / ch.goalNetWorth));
  const handsDone = story.handsInChapter[ch.id] ?? 0;
  const cleared = story.cleared.includes(ch.id);
  const clearedNow = story.chapterJustCleared ? chapterOf(story.chapterJustCleared) : null;
  const loan = needsLoan(story, ch);
  const seatedHere = !!story.seated;

  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="story">
      <div className="flex items-center gap-2">
        <button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="story-back">← 뒤로</button>
        <h1 className="text-xl font-bold">더 서킷 <span className="text-sm font-normal text-slate-400">스토리 모드</span></h1>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center" data-testid="story-wallet">
        <div className="bg-slate-800 rounded-lg p-2"><div className="text-xs text-slate-400">자본</div><div className="text-lg font-bold" data-testid="bankroll">{fmt(story.bankroll)}</div></div>
        <div className="bg-slate-800 rounded-lg p-2"><div className="text-xs text-slate-400">빚</div><div className={`text-lg font-bold ${story.debt ? 'text-rose-300' : ''}`}>{fmt(story.debt)}</div></div>
        <div className="bg-slate-800 rounded-lg p-2"><div className="text-xs text-slate-400">순자산</div><div className="text-lg font-bold text-yellow-300">{fmt(worth)}</div></div>
      </div>

      {clearedNow && (
        <div className="p-4 rounded-xl border border-yellow-500 bg-yellow-950/40 space-y-2" data-testid="chapter-clear">
          <div className="text-lg font-bold text-yellow-300">챕터 {clearedNow.id} 클리어 — {clearedNow.title}</div>
          {clearedNow.outro.map((t, i) => <p key={i} className="text-sm leading-relaxed">{t}</p>)}
          <button className="btn bg-yellow-600 text-black" onClick={() => { dismissChapterClear(); setSel(Math.min(CHAPTERS.length, clearedNow.id + 1)); }} data-testid="chapter-continue">계속하기</button>
        </div>
      )}

      {story.lastSummary && !clearedNow && (
        <div className="p-3 rounded-lg bg-slate-800/80 space-y-1" data-testid="story-summary">
          <div className="text-xs text-slate-400">지난 밤</div>
          <div className="font-semibold">{story.lastSummary.headline}</div>
          <div className="text-sm text-slate-300">{story.lastSummary.hands}핸드 · 바이인 {fmt(story.lastSummary.buyIn)} → {fmt(story.lastSummary.cashOut)} (<b className={story.lastSummary.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{story.lastSummary.net >= 0 ? '+' : ''}{fmt(story.lastSummary.net)}</b>)</div>
          {(story.lastSummary.best || story.lastSummary.worst) && <div className="text-xs text-slate-400">{story.lastSummary.best && `최고: ${story.lastSummary.best}`} {story.lastSummary.worst && ` · 최악: ${story.lastSummary.worst}`}</div>}
          <button className="btn !min-h-[34px] !py-1 bg-indigo-700 text-sm" onClick={() => setScreen('coach')} data-testid="story-to-coach">이 밤을 분석실에서 복기하기</button>
        </div>
      )}

      <div className="flex gap-1 flex-wrap">
        {CHAPTERS.map((c) => (
          <button key={c.id} disabled={c.id > story.unlocked} onClick={() => setSel(c.id)} className={`btn !min-h-[36px] text-sm ${sel === c.id ? 'bg-sky-600' : 'bg-slate-700'}`} data-testid={`chapter-tab-${c.id}`}>
            {story.cleared.includes(c.id) ? '✓ ' : c.id > story.unlocked ? '🔒 ' : ''}챕터 {c.id}
          </button>
        ))}
      </div>

      <section className="p-3 rounded-xl bg-slate-900 border border-slate-700 space-y-2" data-testid="chapter-card">
        <div className="text-xs text-slate-400">{ch.place}</div>
        <h2 className="text-lg font-bold">{ch.title}</h2>
        {ch.intro.map((t, i) => <p key={i} className="text-sm leading-relaxed text-slate-200">{t}</p>)}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-xs text-slate-400"><span>목표 순자산 {fmt(ch.goalNetWorth)}</span><span>{cleared ? '클리어' : `${Math.round(prog * 100)}%`}</span></div>
          <div className="h-2 rounded bg-slate-700 overflow-hidden"><div className="h-full bg-yellow-500" style={{ width: `${prog * 100}%` }} /></div>
          <div className="text-xs text-slate-400">이 챕터 플레이 {handsDone}/{ch.minHands}핸드 이상 필요 · {ch.seats === 2 ? '헤즈업' : '6-max'} · 블라인드 {ch.bb / 2}/{ch.bb}</div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold text-sm">테이블의 사람들</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ch.rivals.map((r) => {
            const c = CHARACTERS[r.id];
            return (
              <div key={r.id} className="p-2 rounded-lg bg-slate-800/80 flex gap-2" data-testid={`rival-${r.id}`}>
                <div className="text-2xl" aria-hidden>{c.emoji}</div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{c.name} <span className="text-xs text-slate-400">{c.title}</span></div>
                  <div className="text-xs text-slate-300">{c.bio}</div>
                  <div className="text-[11px] text-slate-500">{cleared ? `성향: ${PROFILES[c.profileId].label}` : '성향: 관찰 중 (챕터를 클리어하면 공개)'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        {seatedHere && hasSave ? (
          <button className="btn w-full bg-emerald-600" onClick={() => resume()} data-testid="story-resume">▶ 앉아 있던 자리로 돌아가기</button>
        ) : loan ? (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-700 space-y-2" data-testid="loan-offer">
            <div className="text-sm">자본이 최소 바이인({fmt(minBuyIn(ch))})에 못 미칩니다. 스폰서가 빚으로 {fmt(ch.buyInBBs[ch.buyInBBs.length - 1] * ch.bb)}칩을 빌려주겠다고 합니다. 이익이 나면 자동으로 갚습니다.</div>
            <button className="btn bg-rose-700" onClick={() => takeStoryLoan()} data-testid="btn-take-loan">빚을 지고 계속하기</button>
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="font-bold text-sm">자리에 앉기</h3>
            <div className="grid grid-cols-2 gap-2">
              {ch.buyInBBs.map((b) => (
                <button key={b} className="btn bg-gradient-to-r from-sky-700 to-indigo-700 disabled:from-slate-700 disabled:to-slate-700" disabled={!canSit(story, ch, b)} onClick={() => startStory(ch.id, b)} data-testid={`sit-${b}`}>
                  {b}BB ({fmt(b * ch.bb)}칩)
                </button>
              ))}
            </div>
          </div>
        )}
        {notice && <div className="text-rose-300 text-xs">{notice}</div>}
      </section>

      {story.journal.length > 0 && (
        <section className="space-y-1" data-testid="journal">
          <h3 className="font-bold text-sm">저널</h3>
          {story.journal.slice(0, 8).map((j) => (
            <div key={j.date} className="text-xs text-slate-300 p-2 rounded bg-slate-800/60">
              <b>챕터 {j.chapter}</b> · {new Date(j.date).toLocaleDateString()} · {j.hands}핸드 · <span className={j.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{j.net >= 0 ? '+' : ''}{fmt(j.net)}</span>
              <div className="text-slate-400">{j.headline}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
