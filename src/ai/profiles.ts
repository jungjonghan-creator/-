export type Difficulty = 1 | 2 | 3 | 4 | 5;
export const DIFFICULTY_NAMES = ['', 'Beginner', 'Casual', 'Intermediate', 'Advanced', 'Expert'];

/** 스타일 파라미터: 모두 실제 의사결정 수식에 사용된다 (이름만 다른 AI 금지). */
export interface Style {
  vpipMul: number;      // 프리플랍 참여 레인지 배율 (1=기준)
  openSize: number;     // 오픈 레이즈 BB 배수
  threeBet: number;     // 3벳 레인지 배율
  foldToRaise: number;  // 레이즈에 대한 이탈 경향 (높을수록 폴드)
  cbet: number;         // 프리플랍 어그레서의 컨티뉴에이션 벳 빈도
  checkRaise: number;   // 체크레이즈 빈도
  bluff: number;        // 블러프 빈도
  bluffCatch: number;   // 블러프 캐치(콜다운) 의지 (높을수록 얇게 콜)
  valueThresh: number;  // 밸류벳 최소 에퀴티 (낮을수록 얇게 벳)
  betSize: number;      // 벳 크기 (팟 비율)
  adapt: number;        // 상대 적응 속도 0~1
}

export interface AIProfile {
  id: string;
  label: string;
  desc: string;
  style: Style;
  /** Mixed 전용: 이 아키타입들 사이에서 블록마다 변동 */
  mixOf?: string[];
}

const S = (o: Partial<Style>): Style => ({
  vpipMul: 1, openSize: 2.5, threeBet: 1, foldToRaise: 0.5, cbet: 0.6, checkRaise: 0.08, bluff: 0.25, bluffCatch: 0.5,
  valueThresh: 0.62, betSize: 0.6, adapt: 0.3, ...o,
});

export const PROFILES: Record<string, AIProfile> = {
  TAG: { id: 'TAG', label: '타이트 어그레시브', desc: '좁은 레인지를 강하게 플레이', style: S({ vpipMul: 0.8, openSize: 2.5, threeBet: 1.1, foldToRaise: 0.55, cbet: 0.65, bluff: 0.22, valueThresh: 0.62, betSize: 0.62, adapt: 0.4 }) },
  LAG: { id: 'LAG', label: '루즈 어그레시브', desc: '넓게 참여하고 압박', style: S({ vpipMul: 1.5, openSize: 3, threeBet: 1.6, foldToRaise: 0.35, cbet: 0.75, checkRaise: 0.14, bluff: 0.42, bluffCatch: 0.55, valueThresh: 0.57, betSize: 0.7, adapt: 0.5 }) },
  Nit: { id: 'Nit', label: '니트', desc: '프리미엄만 플레이', style: S({ vpipMul: 0.5, openSize: 2.2, threeBet: 0.6, foldToRaise: 0.8, cbet: 0.45, checkRaise: 0.03, bluff: 0.05, bluffCatch: 0.2, valueThresh: 0.72, betSize: 0.5, adapt: 0.2 }) },
  CallingStation: { id: 'CallingStation', label: '콜링 스테이션', desc: '잘 폴드하지 않고 콜', style: S({ vpipMul: 1.6, openSize: 2, threeBet: 0.4, foldToRaise: 0.1, cbet: 0.3, checkRaise: 0.02, bluff: 0.04, bluffCatch: 0.95, valueThresh: 0.7, betSize: 0.4, adapt: 0.1 }) },
  Maniac: { id: 'Maniac', label: '매니악', desc: '거의 항상 공격', style: S({ vpipMul: 2.2, openSize: 4, threeBet: 2.4, foldToRaise: 0.15, cbet: 0.92, checkRaise: 0.2, bluff: 0.65, bluffCatch: 0.6, valueThresh: 0.5, betSize: 0.95, adapt: 0.1 }) },
  Balanced: { id: 'Balanced', label: '균형형 레귤러', desc: '표준적인 빈도로 균형 플레이', style: S({ vpipMul: 1, openSize: 2.5, threeBet: 1, foldToRaise: 0.5, cbet: 0.6, checkRaise: 0.09, bluff: 0.3, bluffCatch: 0.5, valueThresh: 0.6, betSize: 0.66, adapt: 0.5 }) },
  AdaptivePro: { id: 'AdaptivePro', label: '적응형 프로', desc: '상대 데이터를 읽고 익스플로잇', style: S({ vpipMul: 1.05, openSize: 2.5, threeBet: 1.1, foldToRaise: 0.5, cbet: 0.6, checkRaise: 0.1, bluff: 0.3, bluffCatch: 0.5, valueThresh: 0.6, betSize: 0.66, adapt: 1 }) },
  Mixed: { id: 'Mixed', label: '믹스드', desc: '경기 중 성향이 바뀜', style: S({ adapt: 0.4 }), mixOf: ['TAG', 'LAG', 'Nit', 'CallingStation', 'Maniac', 'Balanced'] },
};
export const PROFILE_IDS = Object.keys(PROFILES);

/** 난이도별 내부 실력 수치 */
export interface Skill {
  noise: number;      // 에퀴티 추정 오차 σ
  sims: number;       // 몬테카를로 횟수
  mistake: number;    // 의도치 않은 비최적 선택 확률
  potOddsAware: number; // 팟오즈 고려 정도 0~1
  rangeReading: number; // 상대 레인지 추론 정도 0~1
  pushFoldAcc: number;
  eqBias: number;     // 에퀴티 과대평가 편향 (초보일수록 +)
  realize: number;    // 에퀴티 실현 할인 인식(포지션/미래 베팅)
}
export const SKILLS: Record<Difficulty, Skill> = {
  1: { noise: 0.16, sims: 50, mistake: 0.2, potOddsAware: 0.3, rangeReading: 0.1, pushFoldAcc: 0.5, eqBias: 0.08, realize: 0 },
  2: { noise: 0.1, sims: 100, mistake: 0.12, potOddsAware: 0.6, rangeReading: 0.45, pushFoldAcc: 0.7, eqBias: 0.04, realize: 0.3 },
  3: { noise: 0.06, sims: 220, mistake: 0.06, potOddsAware: 0.85, rangeReading: 0.75, pushFoldAcc: 0.85, eqBias: 0.015, realize: 0.7 },
  4: { noise: 0.03, sims: 450, mistake: 0.025, potOddsAware: 1, rangeReading: 0.92, pushFoldAcc: 0.95, eqBias: 0, realize: 1 },
  5: { noise: 0.012, sims: 900, mistake: 0.006, potOddsAware: 1, rangeReading: 1, pushFoldAcc: 1, eqBias: 0, realize: 1 },
};

export interface AISetup { profileId: string; difficulty: Difficulty }

export function resolveStyle(profileId: string, handNo: number, gameSeed: number): Style {
  const p = PROFILES[profileId] ?? PROFILES.Balanced;
  if (!p.mixOf) return p.style;
  const block = Math.floor(handNo / 15);
  const h = (Math.imul(block + 1, 2654435761) ^ Math.imul(gameSeed | 0, 40503)) >>> 0;
  const a = PROFILES[p.mixOf[h % p.mixOf.length]].style;
  const b = PROFILES[p.mixOf[(h >>> 8) % p.mixOf.length]].style;
  const t = ((h >>> 16) % 100) / 100;
  const out: any = {};
  for (const k of Object.keys(a) as (keyof Style)[]) out[k] = a[k] * (1 - t) + b[k] * t;
  return out as Style;
}
