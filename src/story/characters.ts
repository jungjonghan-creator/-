import { Difficulty } from '../ai/profiles';

export type EventKind = 'heroBigWin' | 'heroBigLoss' | 'heroFoldBig' | 'heroBluffWin' | 'heroHeroCall' | 'badBeat' | 'heroSteal' | 'streakWin' | 'streakLoss' | 'idle' | 'oppRebuy';

export interface Character {
  id: string;
  name: string;
  emoji: string;
  title: string;
  profileId: string;
  bio: string;
  /** 게임에서 실제로 쓰는 성향이 무엇인지는 분석실에서 관찰 후 공개 (UI에서 숨김) */
  voice: Partial<Record<EventKind, string[]>>;
}

export const CHARACTERS: Record<string, Character> = {
  nova: {
    id: 'nova', name: 'NOVA', emoji: '🐺', title: '전직 딜러, 영원한 라이벌', profileId: 'Balanced',
    bio: '카드를 만지던 손으로 이제는 칩을 굴린다. 표정이 없고 실수도 없다. 당신의 습관을 조용히 외운다.',
    voice: {
      heroBigWin: ['…좋은 콜이었어. 기억해 둘게.', '운이 아니라 판단이었네. 인정.'],
      heroBigLoss: ['그 라인, 비싸게 치렀지?', '다음엔 한 번 더 생각해 봐.'],
      heroFoldBig: ['좋은 폴드야. 아니면… 겁먹은 건가?', '접는 것도 기술이지.'],
      heroBluffWin: ['방금 그 벳, 진짜였어? 나중에 알려줘.', '블러프라면 꽤 그럴듯했어.'],
      heroHeroCall: ['…읽혔네.', '그 콜은 계산이었어, 감이었어?'],
      badBeat: ['확률은 네 편이었어. 카드가 아니었을 뿐.', '이런 날도 있어.'],
      heroSteal: ['블라인드 훔치는 건 예의가 없지.', '버튼에선 늘 그러더라.'],
      streakWin: ['오늘 잘 풀리네. 길게 안 갈 거야.', '흐름 탄 건 알겠어.'],
      streakLoss: ['호흡을 고르는 게 좋겠어.', '지금은 칩보다 마음을 지켜.'],
      idle: ['한 판 더?', '시간은 많아. 카드는 안 기다려 주지만.'],
      oppRebuy: ['다시 샀어. 자존심 값이야.'],
    },
  },
  kang: {
    id: 'kang', name: '강 사장', emoji: '🐯', title: '동네 사업가, 허풍선이', profileId: 'CallingStation',
    bio: '카드는 잘 못 읽지만 인심은 넉넉하다. 일단 보고 싶어서 콜한다. 이기면 크게 웃고 지면 더 크게 웃는다.',
    voice: {
      heroBigWin: ['아이고, 이걸 잡아? 한 판 더 가자!', '이 친구 손이 매섭네, 하하!'],
      heroBigLoss: ['껄껄! 내 콜 값 좀 하지?', '사장님 앞에서 큰소리 치면 못 써~'],
      heroFoldBig: ['접었어? 난 끝까지 보는 사람이야!', '아깝네, 나 약했는데~'],
      heroBluffWin: ['거참, 속았네! 그래도 다음엔 안 접는다.', '그거 블러프지? 그렇지?'],
      heroHeroCall: ['아니, 그걸 어떻게 알아!', '내 허세를 읽은 사람은 자네가 처음이야.'],
      badBeat: ['하늘도 무심하시지!', '이런 걸 보고 하수구에 빠졌다고 하지.'],
      heroSteal: ['야박하네, 블라인드까지 가져가나~', '사장 몫은 남겨 둬~'],
      streakWin: ['자네 오늘 물이 올랐구먼!', '내 술 한 잔 살게, 더 이겨 보게.'],
      streakLoss: ['괜찮아, 칩은 또 쌓이는 거야!', '기죽지 마, 사장님이 팁 줄게.'],
      idle: ['이 판은 내가 간다!', '다들 왜 이렇게 조용해~'],
      oppRebuy: ['칩 더 가져와! 오늘은 안 끝나!'],
    },
  },
  sunja: {
    id: 'sunja', name: '순자 여사', emoji: '🦉', title: '40년 단골, 인내의 화신', profileId: 'Nit',
    bio: '좋은 카드가 올 때까지 몇 시간이고 기다린다. 그녀가 레이즈하면 테이블이 조용해진다.',
    voice: {
      heroBigWin: ['젊은이, 운이 좋았구먼.', '이번엔 내가 한 수 졌네.'],
      heroBigLoss: ['급할수록 돌아가야지.', '내 카드를 존중했어야지.'],
      heroFoldBig: ['잘 접었네. 이 나이엔 그게 제일 어려워.', '현명해.'],
      heroBluffWin: ['허허, 빈손으로도 가져가는구먼.', '내가 접은 게 맞았나 모르겠네.'],
      heroHeroCall: ['…대단한 눈이야.', '내가 너무 얌전했나.'],
      badBeat: ['확률은 거짓말을 안 해, 대신 가끔 늦게 와.'],
      heroSteal: ['쯧, 버릇이 나쁘구먼.'],
      streakWin: ['오늘은 자네 날이네.'],
      streakLoss: ['오늘은 일찍 일어나는 것도 방법이야.'],
      idle: ['…', '난 서두르지 않아.'],
      oppRebuy: ['나는 한 번 앉으면 칩이 안 줄어.'],
    },
  },
  jihoon: {
    id: 'jihoon', name: '번개 지훈', emoji: '🦈', title: '스피드 레이저, 겁이 없는 청년', profileId: 'Maniac',
    bio: '생각보다 손이 먼저 나간다. 거의 모든 팟에서 칩을 밀어 넣고, 가끔은 정말로 강한 핸드를 든다.',
    voice: {
      heroBigWin: ['오! 그걸 받네! 다음 판 가자!', '한 방 먹었다, 인정!'],
      heroBigLoss: ['쾅! 이게 포커지!', '더 크게 갈걸 그랬나?'],
      heroFoldBig: ['접어? 진짜로? 와하하!', '겁쟁이 모드 ON!'],
      heroBluffWin: ['그거 블러프지?! 나도 질 수 없지!', '다음엔 내가 먼저 친다!'],
      heroHeroCall: ['소름! 어떻게 알았어?!', '내 올인을 콜하다니 대박이다!'],
      badBeat: ['이게 포커야, 이게 포커라고!', '하늘이 시험하나 봐!'],
      heroSteal: ['빠르다 빨라! 나도 해야지!', '오, 스틸! 맞받아쳐 줄까?'],
      streakWin: ['불붙었다 불붙었어!', '이 기세 이어서 칩 다 가져가!'],
      streakLoss: ['아직 시작도 안 했어, 다시 가자!', '칩은 쓰라고 있는 거야!'],
      idle: ['빨리빨리! 시간 끌지 마~', '다음 핸드 주세요!'],
      oppRebuy: ['리바이 완료! 풀 스택으로 돌아왔다!'],
    },
  },
  han: {
    id: 'han', name: '닥터 한', emoji: '🦅', title: '외과의, 계산된 공격', profileId: 'TAG',
    bio: '좁게 시작해서 정확하게 찌른다. 수술하듯 실수 없이 칩을 가져간다. 약점은 지는 걸 못 견디는 점.',
    voice: {
      heroBigWin: ['과감했지만 근거 있는 콜이었군요.', '이번 팟은 내 오판입니다.'],
      heroBigLoss: ['수술은 성공적이었습니다.', '확률적으로 당연한 결과죠.'],
      heroFoldBig: ['폴드의 가치를 아는군요.', '그 정도면 합리적입니다.'],
      heroBluffWin: ['흥미롭군요. 블러프의 빈도가 궁금해집니다.', '제 폴드가 맞았길 바랍니다.'],
      heroHeroCall: ['당신, 표본을 모으고 있었군요.', '그 콜은 계산을 한 사람의 콜입니다.'],
      badBeat: ['통계적으로는 분산의 범위 안입니다.'],
      heroSteal: ['버튼 스틸… 빈도가 높네요.'],
      streakWin: ['연승은 분산입니다. 방심하지 마세요.'],
      streakLoss: ['감정이 개입되면 EV는 떨어집니다.'],
      idle: ['표본이 쌓이는 중입니다.', '다음 핸드로.'],
      oppRebuy: ['자본 관리의 실패는 기술의 실패입니다.'],
    },
  },
  lina: {
    id: 'lina', name: '리나', emoji: '🦊', title: '항구의 승부사, 압박 전문', profileId: 'LAG',
    bio: '넓게 열고 크게 친다. 상대가 불편해하는 순간을 정확히 안다. 그녀 앞에서 약한 핸드를 보이면 끝이다.',
    voice: {
      heroBigWin: ['좋아, 이 정도는 되어야지.', '한 방 줄게. 다음엔 내 차례야.'],
      heroBigLoss: ['불편했지? 그게 내 무기야.', '압박은 칩보다 오래 남아.'],
      heroFoldBig: ['접네. 표정에 다 써 있었어.', '다음엔 더 세게 갈게.'],
      heroBluffWin: ['오, 나한테 블러프? 용기 가상하네.', '다음엔 내가 콜할 거야.'],
      heroHeroCall: ['이건 졌네. 하지만 계속 갈 거야.', '그 콜, 마음에 들어.'],
      badBeat: ['운도 실력이라지만, 오늘은 네 몫이 아니네.'],
      heroSteal: ['그렇게 쉽게 못 가져가.', '스틸? 재밌네.'],
      streakWin: ['잘 나가네. 곧 부딪히겠지.'],
      streakLoss: ['흔들리면 내가 알아.'],
      idle: ['다음 판, 누가 먼저 겁먹을까.', '조용하면 내가 심심하잖아.'],
      oppRebuy: ['한 번 더 해 보자.'],
    },
  },
  mia: {
    id: 'mia', name: '카멜레온 미아', emoji: '🐙', title: '정체불명의 변덕쟁이', profileId: 'Mixed',
    bio: '한 시간 전의 그녀와 지금의 그녀는 다른 사람이다. 어떤 스타일인지 알았다고 생각하는 순간 바뀐다.',
    voice: {
      heroBigWin: ['어머, 그렇게 나와? 취향이야.', '이번엔 내가 져 줄게.'],
      heroBigLoss: ['후후, 방금 건 어떤 나였을까?', '내 스타일 읽었다고 생각했지?'],
      heroFoldBig: ['접었다고? 그게 내 계획이었어.', '그 폴드, 예뻤어.'],
      heroBluffWin: ['오늘의 나는 콜 안 하는 날이거든.', '다음 판은 다를지도.'],
      heroHeroCall: ['앗, 들켰다.', '그걸 잡으면 반칙인데?'],
      badBeat: ['변덕스러운 건 나만이 아니네, 카드도.'],
      heroSteal: ['오늘은 내가 허락할게.'],
      streakWin: ['오늘의 승자는 너네.'],
      streakLoss: ['내일의 너는 다를 거야.'],
      idle: ['지금의 나, 어때 보여?', '글쎄, 다음 핸드는?'],
      oppRebuy: ['새 스택, 새 기분.'],
    },
  },
  ghost: {
    id: 'ghost', name: '고스트', emoji: '👻', title: '이름 없는 전 프로', profileId: 'AdaptivePro',
    bio: '은퇴했다고 알려진 전설. 단 20핸드면 당신의 습관을 파악한다. 같은 패턴을 두 번 쓰면 반드시 그 대가를 치른다.',
    voice: {
      heroBigWin: ['좋았어. 이제 내가 널 알아.', '졌지만 데이터를 얻었지.'],
      heroBigLoss: ['세 판 전에도 같은 짓을 했어.', '패턴이 보이는군.'],
      heroFoldBig: ['접는 타이밍이 정해져 있네.', '그래, 거기서 접을 줄 알았어.'],
      heroBluffWin: ['한 번은 통하지. 두 번은 안 통해.', '기억해 두지.'],
      heroHeroCall: ['…읽었군. 다음엔 바꿀게.', '좋은 콜. 이제부터 다른 게임이다.'],
      badBeat: ['오늘 밤은 네 확률이 이겼어야 했다.'],
      heroSteal: ['버튼에서의 네 빈도, 알고 있어.'],
      streakWin: ['연승은 아직 시작도 안 한 거다.'],
      streakLoss: ['스스로의 약점을 가장 잘 아는 건 너여야 해.'],
      idle: ['…', '준비됐어?'],
      oppRebuy: ['끝까지 가자.'],
    },
  },
};

export const rivalDifficulty = (id: string, base: Difficulty): Difficulty => (id === 'ghost' ? 5 : base);
export const byName = (name: string): Character | undefined => Object.values(CHARACTERS).find((c) => c.name === name);
