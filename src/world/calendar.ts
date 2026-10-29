/**
 * 2035 월드 캘린더. 모든 시즌(2033~2035)은 가상 설정이다.
 * 실존 대회·도시는 "참고한 현실 앵커"로만 표기하고, 시리즈 이름은 자체 리그 명칭(공식 제휴 아님)을 쓴다.
 * 크레딧은 환전 불가능한 가상 재화. 표시 통화는 시즌 고정 환산율에 따른 "표시용 단위"이다.
 */
import type { Speed } from '../game/session';
import type { Region } from './cast';

export type Currency = 'KRW' | 'USD' | 'HKD' | 'EUR';
/** 1 크레딧의 표시용 환산 (시즌 고정, 매매 불가) */
export const DISPLAY_RATE: Record<Currency, { perCredit: number; symbol: string }> = {
  KRW: { perCredit: 1000, symbol: '₩' }, USD: { perCredit: 0.72, symbol: '$' }, HKD: { perCredit: 5.6, symbol: 'HK$' }, EUR: { perCredit: 0.66, symbol: '€' },
};
export const displayAmount = (credits: number, cur: Currency): string => {
  const v = credits * DISPLAY_RATE[cur].perCredit;
  return `${DISPLAY_RATE[cur].symbol}${(cur === 'KRW' ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString()}`;
};

export interface Venue { id: string; city: string; cityEn: string; country: string; region: Region; currency: Currency; domestic: boolean; blurb: string }
export const VENUES: Venue[] = [
  { id: 'seoul', city: '서울', cityEn: 'Seoul', country: '대한민국', region: 'KR', currency: 'KRW', domestic: true, blurb: '한강변 포커 아레나. 국내 마스터스의 본거지.' },
  { id: 'busan', city: '부산', cityEn: 'Busan', country: '대한민국', region: 'KR', currency: 'KRW', domestic: true, blurb: '해운대 오션뷰 홀. 터보 문화가 강한 항구도시.' },
  { id: 'incheon', city: '인천', cityEn: 'Incheon', country: '대한민국', region: 'KR', currency: 'KRW', domestic: true, blurb: '국제공항 인근 하이롤러 룸.' },
  { id: 'jeju', city: '제주', cityEn: 'Jeju', country: '대한민국', region: 'KR', currency: 'KRW', domestic: true, blurb: '아시아 고액 선수들이 모이는 국제 그랜드슬램 개최지.' },
  { id: 'daegu', city: '대구', cityEn: 'Daegu', country: '대한민국', region: 'KR', currency: 'KRW', domestic: true, blurb: '지역 리그와 클럽 대항전.' },
  { id: 'macau', city: '마카오', cityEn: 'Macau', country: '마카오(중국 특별행정구)', region: 'ASIA', currency: 'HKD', domestic: false, blurb: '네온 불빛 아래의 아시아 하이스테이크.' },
  { id: 'taipei', city: '타이베이', cityEn: 'Taipei', country: '대만', region: 'ASIA', currency: 'USD', domestic: false, blurb: '아시아·태평양 챔피언십 개최지.' },
  { id: 'manila', city: '마닐라', cityEn: 'Manila', country: '필리핀', region: 'ASIA', currency: 'USD', domestic: false, blurb: '장거리 멀티데이 문화.' },
  { id: 'tokyo', city: '도쿄', cityEn: 'Tokyo', country: '일본', region: 'ASIA', currency: 'USD', domestic: false, blurb: '정교한 6맥스 시리즈.' },
  { id: 'lasvegas', city: '라스베이거스', cityEn: 'Las Vegas', country: '미국', region: 'AM', currency: 'USD', domestic: false, blurb: '여름 대장정과 레전드 초청전의 도시.' },
  { id: 'paris', city: '파리', cityEn: 'Paris', country: '프랑스', region: 'EU', currency: 'EUR', domestic: false, blurb: '유럽 크라운 시리즈 개막지.' },
  { id: 'montecarlo', city: '몬테카를로', cityEn: 'Monte Carlo', country: '모나코', region: 'EU', currency: 'EUR', domestic: false, blurb: '슈퍼딥 스택의 요트항.' },
  { id: 'barcelona', city: '바르셀로나', cityEn: 'Barcelona', country: '스페인', region: 'EU', currency: 'EUR', domestic: false, blurb: '6맥스 마스터스.' },
  { id: 'prague', city: '프라하', cityEn: 'Prague', country: '체코', region: 'EU', currency: 'EUR', domestic: false, blurb: '유럽 시즌 피날레.' },
];
export const venueById = (id: string): Venue => VENUES.find((v) => v.id === id)!;

export interface Series { id: string; name: string; nameEn: string; region: 'KR' | 'ASIA' | 'EU' | 'AM'; color: string; blurb: string; /** 현실 참고(공식 제휴 아님) */ realAnchor?: string }
export const SERIES: Series[] = [
  { id: 'kcl', name: '코리아 클럽 리그', nameEn: 'Korea Club League', region: 'KR', color: '#34d399', blurb: '동네 클럽 대항 월간 리그. 소액·6맥스.', realAnchor: '한국 KPHF 클럽리그 문화를 참고' },
  { id: 'busan', name: '부산 오픈', nameEn: 'Busan Open', region: 'KR', color: '#38bdf8', blurb: '항구도시의 터보 문화가 살아 있는 시리즈.', realAnchor: '한국 APS 부산 시리즈를 참고' },
  { id: 'seoul', name: '서울 마스터스', nameEn: 'Seoul Masters', region: 'KR', color: '#f472b6', blurb: '국내 최대 메이저급 시리즈.', realAnchor: 'WPT Seoul(2026 인천 개최) 등을 참고' },
  { id: 'jeju', name: '제주 인터내셔널 그랜드슬램', nameEn: 'Jeju International Grand Slam', region: 'KR', color: '#fbbf24', blurb: '아시아 고액 선수들이 모이는 국제 시리즈.', realAnchor: 'Triton 제주·APT 제주(2026)를 참고' },
  { id: 'incheon', name: '인천 하이롤러', nameEn: 'Incheon High Roller', region: 'KR', color: '#a78bfa', blurb: '공항 인근의 고액 룸.', realAnchor: 'APT 인천·WPT 서울 인천 개최(2026)를 참고' },
  { id: 'knpc', name: '코리아 내셔널 포커 챔피언십', nameEn: 'Korea National Poker Championship', region: 'KR', color: '#fb7185', blurb: '대한민국 최대 단일 토너먼트.', realAnchor: '국내 APL 서킷을 참고' },
  { id: 'knrf', name: '코리아 내셔널 랭킹 파이널', nameEn: 'Korea National Ranking Finals', region: 'KR', color: '#facc15', blurb: '국내 POY 상위권만 모이는 시즌 결산.' },
  { id: 'macau', name: '마카오 네온 하이스테이크', nameEn: 'Macau Neon High Stakes', region: 'ASIA', color: '#f97316', blurb: '네온사인 아래 아시아 하이롤러.', realAnchor: '2013 APPT/ACOP 마카오 등 과거 사례 참고(2026 개최 확정 행사가 아님)' },
  { id: 'pearl', name: '펄 리버 인비테이셔널', nameEn: 'Pearl River Invitational', region: 'ASIA', color: '#2dd4bf', blurb: '초청제 고액 대회.' },
  { id: 'apac', name: '아시아-퍼시픽 챔피언십', nameEn: 'Asia-Pacific Championship', region: 'ASIA', color: '#60a5fa', blurb: '아시아 투어 결산급.', realAnchor: 'APT 타이베이 등을 참고' },
  { id: 'vss', name: '베이거스 서머 시리즈', nameEn: 'Vegas Summer Series', region: 'AM', color: '#ef4444', blurb: '여름 내내 이어지는 메인 이벤트 대장정.', realAnchor: 'WSOP 2026(메인 이벤트 $10,000)를 참고' },
  { id: 'gli', name: '글로벌 레전드 인비테이셔널', nameEn: 'Global Legends Invitational', region: 'AM', color: '#e879f9', blurb: '2026 전성기 레전드 타임캡슐 초청전(가상 설정).' },
  { id: 'dhm', name: '데저트 헤즈업 마스터스', nameEn: 'Desert Heads-Up Masters', region: 'AM', color: '#fb923c', blurb: '32강 단판 토너먼트 헤즈업.' },
  { id: 'ecs', name: '유럽 크라운 시리즈', nameEn: 'European Crown Series', region: 'EU', color: '#818cf8', blurb: '파리·몬테카를로·바르셀로나·프라하.', realAnchor: 'EPT 2026 개최지(파리·몬테카를로·바르셀로나·프라하)를 참고' },
  { id: 'monaco', name: '모나코 슈퍼딥', nameEn: 'Monaco Super Deep', region: 'EU', color: '#c084fc', blurb: '300BB 슈퍼딥스택.' },
];
export const seriesById = (id: string): Series => SERIES.find((s) => s.id === id)!;

export type EventKind = 'mtt' | 'hu' | 'shootout' | 'satellite';
export type Tier = 'free' | 'micro' | 'low' | 'mid' | 'high' | 'super' | 'ultra';

export interface EventDef {
  id: string;            // 시즌 무관 템플릿 id (시즌 인스턴스는 `${season}:${id}`)
  seriesId: string;
  name: string;
  venueId: string;
  day: number;           // 1~365
  kind: EventKind;
  speed: Speed;          // slow/normal/turbo/hyper → 레벨당 핸드 수
  stackBB: number;       // 시작 스택(BB)
  bb0: number;           // 1레벨 BB (칩)
  tableSize: 2 | 6 | 8 | 9;
  field: number;         // 공식 AI 세계의 참가 인원 (재진입 제외)
  buyIn: number;         // 크레딧 (수수료 제외)
  feePct: number;        // 수수료율 (예 0.1)
  guarantee?: number;    // 보장 상금 (부족분은 주최 오버레이)
  paidPct: number;       // 입상 비율
  reentry?: { untilLevel: number; max: number };
  lateRegLevels?: number;
  pko?: { share: number; mystery?: boolean };
  /** 새틀라이트: 승자에게 발행되는 대상 이벤트 */
  satelliteFor?: string;
  prestige: number;      // 1~5 (포인트 가중)
  tier: Tier;
  invite?: 'legends' | 'top-domestic' | 'top-global';
  tags: string[];
  note: string;
}

const T = (buyIn: number): Tier => (buyIn <= 0 ? 'free' : buyIn <= 150 ? 'micro' : buyIn <= 600 ? 'low' : buyIn <= 1500 ? 'mid' : buyIn <= 5000 ? 'high' : buyIn <= 12000 ? 'super' : 'ultra');
const E = (e: Omit<EventDef, 'tier' | 'bb0' | 'tableSize' | 'feePct' | 'speed' | 'stackBB' | 'paidPct' | 'tags' | 'note'> & Partial<Pick<EventDef, 'bb0' | 'tableSize' | 'feePct' | 'speed' | 'stackBB' | 'paidPct' | 'tags' | 'note'>>): EventDef => ({
  bb0: 100, tableSize: 9, feePct: 0.1, speed: 'normal', stackBB: 100, paidPct: 0.15, tags: [], note: '', ...e, tier: T(e.buyIn),
});

const monthly: EventDef[] = Array.from({ length: 12 }, (_, m) => E({
  id: `kcl-m${m + 1}`, seriesId: 'kcl', name: `코리아 클럽 리그 ${m + 1}월전`, venueId: ['seoul', 'busan', 'daegu', 'incheon'][m % 4], day: 10 + m * 30, kind: 'mtt', field: 108 + (m % 4) * 36, buyIn: 100, tableSize: 6, speed: 'normal', reentry: { untilLevel: 4, max: 1 }, prestige: 1, tags: ['클럽', '6맥스', '재진입'], note: '동네 클럽 월간 대항전',
}));

/** 모든 시즌에 공통으로 쓰는 이벤트 템플릿 (인원·참가자는 시즌별로 다르게 시뮬레이션) */
export const EVENT_TEMPLATES: EventDef[] = [
  ...monthly,
  E({ id: 'busan-spring', seriesId: 'busan', name: '부산 오픈 스프링 터보', venueId: 'busan', day: 60, kind: 'mtt', field: 270, buyIn: 300, speed: 'turbo', stackBB: 75, reentry: { untilLevel: 6, max: 2 }, prestige: 2, tags: ['터보', '재진입'], note: '해운대 터보 대회' }),
  E({ id: 'busan-main', seriesId: 'busan', name: '부산 오픈 메인 이벤트', venueId: 'busan', day: 270, kind: 'mtt', field: 360, buyIn: 500, prestige: 3, reentry: { untilLevel: 8, max: 1 }, guarantee: 150000, tags: ['메인', '보장상금'], note: '부산 오픈의 메인' }),
  E({ id: 'busan-hyper', seriesId: 'busan', name: '부산 심야 하이퍼', venueId: 'busan', day: 62, kind: 'mtt', field: 180, buyIn: 100, speed: 'hyper', stackBB: 50, prestige: 1, tags: ['하이퍼'], note: '밤 11시 시작 하이퍼터보' }),
  E({ id: 'seoul-main', seriesId: 'seoul', name: '서울 마스터스 메인 이벤트', venueId: 'seoul', day: 120, kind: 'mtt', field: 450, buyIn: 1000, prestige: 4, reentry: { untilLevel: 8, max: 1 }, lateRegLevels: 8, guarantee: 400000, tags: ['메인', '보장상금', '레이트등록'], note: '국내 메이저' }),
  E({ id: 'seoul-pko', seriesId: 'seoul', name: '서울 마스터스 PKO', venueId: 'seoul', day: 118, kind: 'mtt', field: 300, buyIn: 500, pko: { share: 0.5 }, prestige: 3, tags: ['PKO'], note: '진행형 바운티' }),
  E({ id: 'seoul-hu', seriesId: 'seoul', name: '서울 헤즈업 오픈', venueId: 'seoul', day: 122, kind: 'hu', field: 64, buyIn: 500, tableSize: 2, speed: 'turbo', prestige: 2, tags: ['헤즈업', '토너먼트표'], note: '64강 단판 토너먼트 헤즈업' }),
  E({ id: 'seoul-winter', seriesId: 'seoul', name: '서울 마스터스 윈터 하이롤러', venueId: 'seoul', day: 330, kind: 'mtt', field: 120, buyIn: 3000, prestige: 4, tableSize: 8, tags: ['하이롤러'], note: '8맥스 하이롤러' }),
  E({ id: 'jeju-main', seriesId: 'jeju', name: '제주 그랜드슬램 메인', venueId: 'jeju', day: 200, kind: 'mtt', field: 360, buyIn: 3000, prestige: 5, reentry: { untilLevel: 8, max: 1 }, guarantee: 900000, tags: ['메인', '보장상금'], note: '아시아 고액 메인' }),
  E({ id: 'jeju-mystery', seriesId: 'jeju', name: '제주 미스터리 바운티', venueId: 'jeju', day: 198, kind: 'mtt', field: 300, buyIn: 1000, pko: { share: 0.5, mystery: true }, prestige: 3, tags: ['미스터리바운티'], note: '바운티 금액이 비밀' }),
  E({ id: 'jeju-super', seriesId: 'jeju', name: '제주 슈퍼 하이롤러', venueId: 'jeju', day: 204, kind: 'mtt', field: 96, buyIn: 10000, prestige: 5, tableSize: 8, tags: ['슈퍼하이롤러'], note: '초고액' }),
  E({ id: 'incheon-hr', seriesId: 'incheon', name: '인천 하이롤러', venueId: 'incheon', day: 150, kind: 'mtt', field: 80, buyIn: 5000, prestige: 4, tableSize: 8, tags: ['하이롤러', '프리즈아웃'], note: '8맥스 프리즈아웃' }),
  E({ id: 'incheon-pko', seriesId: 'incheon', name: '인천 PKO 터보', venueId: 'incheon', day: 148, kind: 'mtt', field: 400, buyIn: 500, pko: { share: 0.5 }, speed: 'turbo', prestige: 2, tags: ['PKO', '터보'], note: '공항 터보 PKO' }),
  E({ id: 'knpc-main', seriesId: 'knpc', name: '코리아 내셔널 포커 챔피언십', venueId: 'seoul', day: 240, kind: 'mtt', field: 900, buyIn: 1500, prestige: 5, reentry: { untilLevel: 10, max: 2 }, lateRegLevels: 10, guarantee: 1200000, speed: 'slow', stackBB: 150, tags: ['내셔널', '딥스택', '레이트등록'], note: '대한민국 챔피언 결정전' }),
  E({ id: 'knrf-final', seriesId: 'knrf', name: '코리아 내셔널 랭킹 파이널', venueId: 'seoul', day: 355, kind: 'mtt', field: 108, buyIn: 1000, prestige: 4, invite: 'top-domestic', tags: ['초청', '시즌결산'], note: '국내 POY 상위 108명' }),
  E({ id: 'macau-1', seriesId: 'macau', name: '마카오 네온 하이스테이크 I', venueId: 'macau', day: 55, kind: 'mtt', field: 100, buyIn: 10000, prestige: 4, reentry: { untilLevel: 6, max: 1 }, tableSize: 8, tags: ['하이스테이크'], note: '네온 하이스테이크' }),
  E({ id: 'macau-2', seriesId: 'macau', name: '마카오 네온 하이스테이크 II', venueId: 'macau', day: 310, kind: 'mtt', field: 120, buyIn: 10000, prestige: 4, reentry: { untilLevel: 6, max: 1 }, tableSize: 8, tags: ['하이스테이크'], note: '시즌 후반전' }),
  E({ id: 'pearl-inv', seriesId: 'pearl', name: '펄 리버 인비테이셔널', venueId: 'macau', day: 220, kind: 'mtt', field: 48, buyIn: 15000, prestige: 4, tableSize: 6, invite: 'top-global', tags: ['초청'], note: '글로벌 상위 48명' }),
  E({ id: 'apac-taipei', seriesId: 'apac', name: '아시아-퍼시픽 챔피언십', venueId: 'taipei', day: 90, kind: 'mtt', field: 500, buyIn: 2000, prestige: 4, reentry: { untilLevel: 8, max: 1 }, lateRegLevels: 8, guarantee: 800000, tags: ['메인', '재진입'], note: '타이베이' }),
  E({ id: 'apac-manila', seriesId: 'apac', name: '아시아-퍼시픽 마닐라 딥스택', venueId: 'manila', day: 265, kind: 'mtt', field: 260, buyIn: 800, stackBB: 200, speed: 'slow', prestige: 3, tags: ['딥스택'], note: '장거리 대회' }),
  E({ id: 'apac-tokyo6', seriesId: 'apac', name: '도쿄 6맥스 마스터스', venueId: 'tokyo', day: 285, kind: 'mtt', field: 180, buyIn: 1000, tableSize: 6, prestige: 3, tags: ['6맥스'], note: '정교한 6맥스' }),
  E({ id: 'vss-sat1', seriesId: 'vss', name: '메인 이벤트 새틀라이트 1', venueId: 'lasvegas', day: 150, kind: 'satellite', field: 110, buyIn: 300, satelliteFor: 'vss-main', prestige: 1, speed: 'turbo', tags: ['새틀라이트'], note: '메인 이벤트 좌석 획득' }),
  E({ id: 'vss-sat2', seriesId: 'vss', name: '메인 이벤트 새틀라이트 2', venueId: 'lasvegas', day: 165, kind: 'satellite', field: 130, buyIn: 300, satelliteFor: 'vss-main', prestige: 1, speed: 'turbo', tags: ['새틀라이트'], note: '메인 이벤트 좌석 획득' }),
  E({ id: 'vss-sat3', seriesId: 'vss', name: '메인 이벤트 슈퍼 새틀라이트', venueId: 'lasvegas', day: 178, kind: 'satellite', field: 220, buyIn: 1000, satelliteFor: 'vss-main', prestige: 2, tags: ['새틀라이트'], note: '대형 새틀라이트' }),
  E({ id: 'vss-mystery', seriesId: 'vss', name: '베이거스 미스터리 바운티', venueId: 'lasvegas', day: 186, kind: 'mtt', field: 600, buyIn: 1000, pko: { share: 0.5, mystery: true }, prestige: 3, tags: ['미스터리바운티'], note: '600명 미스터리' }),
  E({ id: 'vss-main', seriesId: 'vss', name: '베이거스 서머 시리즈 메인 이벤트', venueId: 'lasvegas', day: 192, kind: 'mtt', field: 3000, buyIn: 10000, prestige: 5, stackBB: 150, speed: 'slow', reentry: { untilLevel: 8, max: 1 }, lateRegLevels: 8, guarantee: 25000000, tags: ['메인', '딥스택', '보장상금'], note: '현실 메인 이벤트에서 영감을 받은 가상 3,000명 대회' }),
  E({ id: 'vss-turbo', seriesId: 'vss', name: '베이거스 하이퍼 데일리', venueId: 'lasvegas', day: 188, kind: 'mtt', field: 360, buyIn: 300, speed: 'hyper', stackBB: 50, prestige: 1, tags: ['하이퍼'], note: '하이퍼 데일리' }),
  E({ id: 'gli-inv', seriesId: 'gli', name: '글로벌 레전드 인비테이셔널', venueId: 'lasvegas', day: 100, kind: 'mtt', field: 54, buyIn: 25000, prestige: 5, tableSize: 6, invite: 'legends', tags: ['레전드초청', '2026타임캡슐'], note: '2026 전성기 레전드 약 30명(명단 72명 중 시즌별 초청) + 글로벌 상위권' }),
  E({ id: 'dhm-hu', seriesId: 'dhm', name: '데저트 헤즈업 마스터스', venueId: 'lasvegas', day: 80, kind: 'hu', field: 32, buyIn: 5000, tableSize: 2, prestige: 4, speed: 'turbo', invite: 'top-global', tags: ['헤즈업'], note: '32강 헤즈업' }),
  E({ id: 'ecs-paris', seriesId: 'ecs', name: '유럽 크라운 파리 메인', venueId: 'paris', day: 40, kind: 'mtt', field: 700, buyIn: 5000, prestige: 4, reentry: { untilLevel: 8, max: 1 }, guarantee: 3000000, tags: ['메인', '재진입'], note: '크라운 시리즈 개막' }),
  E({ id: 'ecs-mc', seriesId: 'ecs', name: '몬테카를로 하이롤러', venueId: 'montecarlo', day: 115, kind: 'mtt', field: 220, buyIn: 10000, prestige: 4, tableSize: 8, tags: ['하이롤러'], note: '요트항 하이롤러' }),
  E({ id: 'monaco-deep', seriesId: 'monaco', name: '모나코 슈퍼딥 스택', venueId: 'montecarlo', day: 125, kind: 'mtt', field: 80, buyIn: 10000, stackBB: 300, speed: 'slow', prestige: 4, tableSize: 8, tags: ['슈퍼딥'], note: '300BB 슈퍼딥' }),
  E({ id: 'ecs-bcn6', seriesId: 'ecs', name: '바르셀로나 6맥스 마스터스', venueId: 'barcelona', day: 175, kind: 'mtt', field: 300, buyIn: 2500, tableSize: 6, prestige: 3, tags: ['6맥스'], note: '6맥스 마스터스' }),
  E({ id: 'ecs-shoot', seriesId: 'ecs', name: '바르셀로나 슛아웃', venueId: 'barcelona', day: 177, kind: 'shootout', field: 108, buyIn: 1500, prestige: 3, tags: ['슛아웃'], note: '테이블 1명만 진출' }),
  E({ id: 'ecs-prague', seriesId: 'ecs', name: '프라하 시즌 피날레', venueId: 'prague', day: 295, kind: 'mtt', field: 600, buyIn: 3000, prestige: 4, reentry: { untilLevel: 8, max: 1 }, guarantee: 1500000, tags: ['메인'], note: '유럽 시즌 결산' }),
  E({ id: 'kcl-shoot', seriesId: 'kcl', name: '코리아 클럽 슛아웃', venueId: 'daegu', day: 175, kind: 'shootout', field: 108, buyIn: 300, tableSize: 6, prestige: 2, tags: ['슛아웃', '6맥스'], note: '6인 테이블 1명 진출' }),
  E({ id: 'kcl-sat', seriesId: 'kcl', name: '제주 그랜드슬램 새틀라이트', venueId: 'jeju', day: 180, kind: 'satellite', field: 90, buyIn: 300, satelliteFor: 'jeju-main', prestige: 1, speed: 'turbo', tags: ['새틀라이트'], note: '제주 메인 좌석' }),
  E({ id: 'mega-5k', seriesId: 'apac', name: '아시아 모바일 메가 5K', venueId: 'manila', day: 20, kind: 'mtt', field: 5000, buyIn: 100, speed: 'turbo', stackBB: 60, reentry: { untilLevel: 6, max: 2 }, lateRegLevels: 6, paidPct: 0.12, prestige: 2, tags: ['메가필드', '터보', '재진입'], note: '5,000명 규모 모바일 메가 토너먼트' }),
  E({ id: 'mega-10k', seriesId: 'vss', name: '월드 메가 10K 프리즈아웃', venueId: 'lasvegas', day: 280, kind: 'mtt', field: 10000, buyIn: 200, speed: 'turbo', stackBB: 75, paidPct: 0.12, prestige: 3, tags: ['메가필드', '프리즈아웃'], note: '10,000명 프리즈아웃 — 한 번 탈락하면 끝' }),
  E({ id: 'seoul-hu-hyper', seriesId: 'seoul', name: '서울 심야 헤즈업 하이퍼', venueId: 'seoul', day: 300, kind: 'hu', field: 32, buyIn: 300, tableSize: 2, speed: 'hyper', prestige: 1, tags: ['헤즈업', '하이퍼'], note: '32강' }),
];

export const SEASONS = [2033, 2034, 2035] as const;
export type SeasonYear = (typeof SEASONS)[number];
/** 시즌별 규모 변동 (같은 템플릿이라도 해마다 인원이 달라진다) */
export const SEASON_GROWTH: Record<number, number> = { 2033: 0.82, 2034: 0.92, 2035: 1 };
export const eventKey = (season: number, id: string) => `${season}:${id}`;
export const templateById = (id: string) => EVENT_TEMPLATES.find((e) => e.id === id)!;

// ───── 월드 시계 ─────
/** 현실 2026-10-29 = 월드 2035-03-15. 현실 하루 = 월드 하루. 시즌 끝(2035-12-31)에서 멈춘다. (실시간 AI 연산이 아니라 사전 계산된 공식 시즌 스냅샷을 날짜에 맞춰 공개) */
export const WORLD_ANCHOR_REAL_UTC = Date.UTC(2026, 9, 29);
export const WORLD_ANCHOR_DAY = 74; // 2035-03-15 (1월 31 + 2월 28 + 15)
export function worldDay(nowMs = Date.now()): number {
  const d = Math.floor((nowMs - WORLD_ANCHOR_REAL_UTC) / 86400000);
  return Math.max(1, Math.min(365, WORLD_ANCHOR_DAY + d));
}
export function dayToDate(season: number, day: number): { m: number; d: number; label: string } {
  const lens = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let rest = day; let m = 0;
  while (m < 11 && rest > lens[m]) { rest -= lens[m]; m++; }
  return { m: m + 1, d: rest, label: `${season}.${String(m + 1).padStart(2, '0')}.${String(rest).padStart(2, '0')}` };
}
