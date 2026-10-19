import { Difficulty } from '../ai/profiles';

export interface Chapter {
  id: number;
  title: string;
  place: string;
  seats: 2 | 6;
  bb: number;
  buyInBBs: number[];            // 선택 가능한 바이인(BB)
  rivals: { id: string; difficulty: Difficulty }[];
  goalNetWorth: number;          // 순자산 목표
  minHands: number;              // 클리어에 필요한 최소 핸드
  intro: string[];
  outro: string[];
}

export const START_BANKROLL = 3000;

export const CHAPTERS: Chapter[] = [
  {
    id: 1, title: '지하 클럽의 신입', place: '부산 서면 골목의 비밀 카드룸', seats: 6, bb: 20, buyInBBs: [50, 100],
    rivals: [{ id: 'kang', difficulty: 2 }, { id: 'sunja', difficulty: 2 }, { id: 'jihoon', difficulty: 2 }, { id: 'han', difficulty: 3 }, { id: 'nova', difficulty: 3 }],
    goalNetWorth: 6000, minHands: 40,
    intro: [
      '새벽 한 시, 서면 골목 끝의 간판 없는 문. 안에서는 칩 소리와 낮은 웃음이 섞여 흘러나온다.',
      '주머니에는 3,000칩이 전부다. 테이블에는 허풍 좋은 강 사장, 말없는 순자 여사, 쉬지 않고 칩을 미는 번개 지훈, 그리고 카드를 만지던 손으로 칩을 굴리는 NOVA가 앉아 있다.',
      '목표는 하나. 이 방에서 자본을 6,000칩으로 불려 다음 방의 문을 여는 것.',
    ],
    outro: ['"여기까지 올 줄은 몰랐네." NOVA가 칩을 정리하며 말한다. "항구 쪽에 큰 방이 열렸어. 거기서도 그 표정으로 앉아 있을 수 있나 보자."'],
  },
  {
    id: 2, title: '항구의 하이롤러 룸', place: '부산항 창고 개조 카드룸', seats: 6, bb: 50, buyInBBs: [50, 100],
    rivals: [{ id: 'lina', difficulty: 3 }, { id: 'mia', difficulty: 3 }, { id: 'han', difficulty: 4 }, { id: 'kang', difficulty: 3 }, { id: 'nova', difficulty: 4 }],
    goalNetWorth: 20000, minHands: 60,
    intro: [
      '컨테이너 사이로 바닷바람이 스민다. 창고 안쪽의 방은 조명이 낮고 판돈이 높다.',
      '리나가 먼저 당신을 알아본다. "서면에서 소문 들었어. 신입이라며?" 카멜레온 미아는 미소만 지을 뿐 아무 말도 하지 않는다.',
      '이곳에서 20,000칩을 만들어야 마지막 두 사람과 마주 앉을 자격이 생긴다.',
    ],
    outro: ['리나가 어깨를 으쓱한다. "이긴 건 인정할게." 그때 구석의 그림자가 일어난다. "NOVA, 결판 낼 때가 됐어. 헤즈업으로."'],
  },
  {
    id: 3, title: 'NOVA와의 결전', place: '항구 위층 VIP 룸', seats: 2, bb: 100, buyInBBs: [50, 100],
    rivals: [{ id: 'nova', difficulty: 4 }],
    goalNetWorth: 40000, minHands: 60,
    intro: [
      '위층 룸에는 테이블이 하나뿐이다. 맞은편에 NOVA가 앉아 있다. 오늘만은 말이 없다.',
      '"한 가지만 말해 줄게." NOVA가 칩을 가지런히 쌓는다. "넌 이제 내 레벨이야. 그러니까 이번엔 봐주지 않을 거야."',
      '헤즈업, 100BB. 상대가 당신의 습관을 읽는 속도와 당신이 상대를 읽는 속도의 싸움이다.',
    ],
    outro: ['NOVA가 천천히 일어나 손을 내민다. "…졌다. 그런데 네가 상대할 사람이 아직 남았어. 이름도 얼굴도 없는 사람."'],
  },
  {
    id: 4, title: '고스트', place: '이름 없는 최상층 룸', seats: 2, bb: 200, buyInBBs: [50, 100],
    rivals: [{ id: 'ghost', difficulty: 5 }],
    goalNetWorth: 100000, minHands: 80,
    intro: [
      '엘리베이터는 가장 높은 층에서 멈춘다. 방 안에는 불이 하나뿐이다. 후드를 쓴 사람이 천천히 고개를 든다.',
      '"20핸드면 충분해." 고스트가 말한다. "네가 어떤 사람인지. 같은 패턴을 두 번 쓰면, 그 대가를 치르게 될 거야."',
      '마지막 목표는 100,000칩. 이 상대는 당신의 습관을 읽고 되받아친다. 빈도를 섞고 라인을 바꿔야 한다.',
    ],
    outro: ['후드가 내려간다. 고스트가 웃는다. "…좋아. 이제 네가 이 방의 주인이다." 칩 소리가 멎고, 서면 골목의 새벽빛이 떠오른다. 이야기는 여기까지지만, 테이블은 열려 있다.'],
  },
];
