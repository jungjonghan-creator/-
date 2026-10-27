import { Speed } from './session';

export type BlindMode = 'regular' | 'adaptive';

/** 레벨당 기본 핸드 수. 일반 = 10핸드 (명세의 출발점), 토너먼트 시작 전에 공개된다. */
export const BASE_HANDS_PER_LEVEL: Record<Speed, number> = { slow: 15, normal: 10, turbo: 6, hyper: 3 };
export const SPEED_LABEL: Record<Speed, string> = { slow: '느림', normal: '일반', turbo: '터보', hyper: '하이퍼터보' };

export interface FieldState {
  avgBB: number;        // 남은 전체 필드의 평균 스택(BB)
  playersLeft: number;
  entrants: number;
  handsPlayed: number;  // 지금까지 진행된 핸드(라운드) 수
}

/**
 * 상황 적응형 레벨 길이. 입력은 "필드 전체의 공개 상태"뿐이며 특정 플레이어(사용자 포함)의
 * 칩이나 성적은 전혀 사용하지 않는다. 같은 상태에는 항상 같은 길이를 낸다(결정론).
 *
 * 규칙(경기 시작 전 공개):
 *  1) 평균 스택 12BB 미만 → ×1.30, 20BB 미만 → ×1.15  (짧은 스택에게 생존·플레이 시간 확보)
 *  2) 평균 스택 60BB 초과 → ×0.75, 40BB 초과 → ×0.90  (스택이 너무 깊어 늘어지는 경기 가속)
 *  3) 정체: 남은 인원이 85% 이상인데 기본 4레벨분 이상 진행 → ×0.80
 *  결과는 기본 길이의 70%~140% 안으로 제한하고 정수 올림.
 */
export function adaptiveLevelLength(base: number, f: FieldState): number {
  let m = 1;
  if (f.avgBB < 12) m *= 1.3; else if (f.avgBB < 20) m *= 1.15;
  else if (f.avgBB > 60) m *= 0.75; else if (f.avgBB > 40) m *= 0.9;
  if (f.entrants > 0 && f.playersLeft / f.entrants >= 0.85 && f.handsPlayed >= base * 4) m *= 0.8;
  m = Math.max(0.7, Math.min(1.4, m));
  return Math.max(1, Math.ceil(base * m));
}

export function nextLevelLength(mode: BlindMode, speed: Speed, f: FieldState): number {
  const base = BASE_HANDS_PER_LEVEL[speed];
  return mode === 'adaptive' ? adaptiveLevelLength(base, f) : base;
}

export const ADAPTIVE_RULES_TEXT = [
  '평균 스택이 12BB 미만이면 다음 레벨까지 간격 +30%, 20BB 미만이면 +15%',
  '평균 스택이 60BB 초과면 −25%, 40BB 초과면 −10%',
  '남은 인원이 85% 이상인데 기본 4레벨분을 진행했다면 −20% (정체 해소)',
  '결과는 기본 간격의 70%~140% 이내. 특정 플레이어의 칩·성적은 사용하지 않습니다.',
];
