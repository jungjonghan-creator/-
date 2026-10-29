import type { Session } from '../game/session';
import { templateById } from '../world/calendar';

/** 헤즈업 토너먼트표/슛아웃 진행 안내: 라운드, 생존자, 다음 단계 */
export function StagedPanel({ sess }: { sess: Session }) {
  const st = sess.staged;
  if (!st) return null;
  const ev = templateById(st.eventId);
  const names = st.tables[0].filter((x) => x !== 'hero').map((id) => st.field[id]?.name ?? id).join(', ');
  return (
    <div className="p-3 rounded-lg bg-indigo-950/60 border border-indigo-700 text-sm space-y-1" data-testid="staged-panel">
      <div className="font-bold">{ev.kind === 'hu' ? '헤즈업 토너먼트표' : '슛아웃'} · 라운드 {st.round}{st.final ? ' (결승)' : ''} · 생존 {st.alive.length}/{st.entries}명</div>
      {!st.finished && <div className="text-xs text-slate-300">{st.advance ? '이번 라운드를 이겼습니다. 같은 라운드의 다른 매치는 공식 AI 규칙의 시뮬레이션으로 결정됩니다.' : `이번 상대: ${names || '—'}`}</div>}
      {st.finished && <div className="text-amber-200" data-testid="staged-final">결과: {st.heroPlace}위{st.kind === 'hu' && st.heroPlace! > 2 ? ' (같은 라운드 탈락자는 공동 순위, 상금은 균등 분배)' : ''}</div>}
      <div className="text-[11px] text-slate-500">{st.log.slice(-3).join(' → ')}</div>
    </div>
  );
}
