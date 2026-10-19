import { StoryLine } from '../story/director';

export function StoryFeed({ lines }: { lines: StoryLine[] }) {
  const last = lines.slice(-4);
  if (!last.length) return null;
  return (
    <div className="mx-2 mb-2 rounded-lg bg-slate-900/80 border border-slate-700 p-2 space-y-1" data-testid="story-feed" aria-live="polite">
      {last.map((l) => (
        <div key={l.id} className={`text-xs sm:text-sm flex gap-2 ${l.kind === 'narr' ? 'text-slate-300 italic' : 'text-slate-100'}`}>
          <span aria-hidden className="shrink-0">{l.emoji}</span>
          <span><b className={l.kind === 'narr' ? 'not-italic text-slate-400' : 'text-sky-200'}>{l.speaker}</b> {l.kind === 'talk' ? `“${l.text}”` : l.text}</span>
        </div>
      ))}
    </div>
  );
}
