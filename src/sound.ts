let ctx: AudioContext | null = null;
let muted = false;
export const setMuted = (m: boolean) => { muted = m; };
function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.06, delay = 0) {
  if (muted) return;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
  } catch { /* 오디오 불가 환경 무시 */ }
}
export const sfx = {
  card: () => tone(900, 0.05, 'square', 0.03),
  chip: () => { tone(1400, 0.05, 'triangle', 0.05); tone(1800, 0.04, 'triangle', 0.04, 0.04); },
  click: () => tone(500, 0.04, 'square', 0.03),
  fold: () => tone(220, 0.12, 'sawtooth', 0.04),
  check: () => tone(700, 0.05, 'sine', 0.05),
  win: () => { tone(660, 0.12, 'sine', 0.06); tone(880, 0.12, 'sine', 0.06, 0.12); tone(1100, 0.2, 'sine', 0.06, 0.24); },
  lose: () => tone(200, 0.3, 'sawtooth', 0.04),
};
