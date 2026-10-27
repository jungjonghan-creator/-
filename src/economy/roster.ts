import { PERSONAS } from '../ai/profiles';
import { createRng } from '../engine/rng';

/** 고정된 이름을 가진 AI 상대. 같은 id 는 경기 사이에도 같은 인물로 취급된다(관찰 기록 유지). */
export interface RosterEntry { id: string; name: string; persona: (typeof PERSONAS)[number]['id']; profileId: string; bio: string }

const P = (id: string): { persona: RosterEntry['persona']; profileId: string } => { const p = PERSONAS.find((x) => x.id === id)!; return { persona: p.id, profileId: p.profileId }; };
export const ROSTER: RosterEntry[] = [
  { id: 'r-han', name: '돌부처 한', ...P('conservative'), bio: '좋은 카드가 올 때까지 몇 시간이고 기다린다.' },
  { id: 'r-sunja', name: '순자 여사', ...P('conservative'), bio: '레이즈하면 테이블이 조용해진다.' },
  { id: 'r-park', name: '박 선생', ...P('conservative'), bio: '계산대로만 움직이는 은퇴 교사.' },
  { id: 'r-lina', name: '리나', ...P('aggressive'), bio: '넓게 열고 크게 친다. 압박이 무기.' },
  { id: 'r-teo', name: '태오', ...P('aggressive'), bio: '리레이즈를 즐기는 젊은 레귤러.' },
  { id: 'r-jihoon', name: '번개 지훈', ...P('aggressive'), bio: '손이 생각보다 먼저 나간다.' },
  { id: 'r-mia', name: '미아', ...P('wild'), bio: '어떤 스타일인지 알았다고 생각하는 순간 바뀐다.' },
  { id: 'r-dokkaebi', name: '도깨비 준', ...P('wild'), bio: '가끔 이해할 수 없을 만큼 공격적이다.' },
  { id: 'r-haru', name: '하루', ...P('wild'), bio: '넓은 범위, 예측 불가의 리듬.' },
  { id: 'r-ghost', name: '고스트', ...P('trapper'), bio: '강한 패를 숨기고 기다린다.' },
  { id: 'r-seoyeon', name: '여우 서연', ...P('trapper'), bio: '체크 뒤에 칼이 있다.' },
  { id: 'r-noel', name: '노을', ...P('trapper'), bio: '슬로우플레이의 장인.' },
  { id: 'r-nova', name: 'NOVA', ...P('balanced'), bio: '전직 딜러. 실수가 없고 습관을 외운다.' },
  { id: 'r-dr', name: '닥터 한', ...P('balanced'), bio: '포지션과 레인지로 수술하듯 이긴다.' },
  { id: 'r-ian', name: '이안', ...P('balanced'), bio: '균형 잡힌 숙련 레귤러.' },
];
export const rosterById = (id: string) => ROSTER.find((r) => r.id === id);
export const rosterByName = (name: string) => ROSTER.find((r) => r.name === name);

/** 5가지 성격을 한 명씩 포함해 n 명을 고른다 (seed 로 재현 가능). 5명 초과면 남은 자리는 로스터에서 추가. */
export function pickOpponents(n: number, seed: number): RosterEntry[] {
  const rng = createRng(seed);
  const byPersona = PERSONAS.map((p) => ROSTER.filter((r) => r.persona === p.id));
  const out: RosterEntry[] = [];
  const order = byPersona.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  for (const idx of order) { if (out.length >= n) break; out.push(byPersona[idx][rng.int(byPersona[idx].length)]); }
  const rest = ROSTER.filter((r) => !out.includes(r));
  for (let i = rest.length - 1; i > 0; i--) { const j = rng.int(i + 1); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  while (out.length < n && rest.length) out.push(rest.pop()!);
  return out.slice(0, n);
}
