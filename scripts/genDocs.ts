// 사용: npx tsx scripts/genDocs.ts → docs/PLAYERS_EVIDENCE.md, docs/WORLD_2035_BIBLE.md 의 데이터 표를 코드/시드에서 생성 (손으로 옮기지 않아 오타·불일치 방지)
import { writeFileSync } from 'node:fs';
import { LEGENDS, FUTURE, SEED_META, ROSTER_PLAYERS } from '../src/world/cast';
import { EVENT_TEMPLATES, SERIES, VENUES, DISPLAY_RATE, seriesById, venueById, dayToDate } from '../src/world/calendar';
import { prizeStructure } from '../src/world/prizes';

const row = (...c: (string | number)[]) => `| ${c.join(' | ')} |`;
let pe = `# 선수 근거 문서 (PLAYERS_EVIDENCE)

> ${SEED_META.title} (${SEED_META.createdOn})
> ${SEED_META.realNotice}
> ${SEED_META.fictionalNotice}

- 이 문서의 표는 \`scripts/genDocs.ts\`가 \`POKER_ARENA_5_2035_Player_Seed_v2_90.json\`에서 생성한다. 선수 조사는 GPT 데이터팩으로 종료했고 재조사하지 않았다.
- \`evidence_level\`: confirmed_result(공개 대회 결과) / public_interview / reported_style / design_hypothesis(창작).
- **0~100 실력 수치(preflop/postflop/ICM/HU/exploit/risk/adaptation/consistency)는 게임 밸런스용 시뮬레이션 파라미터**이며 실존 인물의 실제 능력·평가·검증 통계가 아니다. \`stats_are_verified=false\`, \`official_appearance_rights_confirmed=false\`.
- 실존 선수는 **2026 전성기 타임캡슐** 버전으로 출전하는 허구 설정이며 선수 본인의 허락·후원·참여를 의미하지 않는다. 사진·로고·영상·기사 원문을 사용하지 않고 이니셜만 표시한다. ID가 분리되어 있어 권리 문제 시 가명 데이터팩으로 교체할 수 있다.

## 실존 레전드 AI (${LEGENDS.length}명)
${row('ID', '이름', '국적', '근거 수준', 'AI 프로필', '강점(가설)', '공개 근거 URL')}
${row('---', '---', '---', '---', '---', '---', '---')}
${LEGENDS.map((p) => row(`\`${p.id}\``, p.name.replace(/\|/g, '/'), p.nationality, p.evidenceLevel, p.profileId, p.strength, p.evidenceSources.join('<br>'))).join('\n')}

## 2035 가상 신예 (${FUTURE.length}명, 전부 창작)
${row('ID', '이름', '국적', '거점', '주 무대', '강점', '약점/대응')}
${row('---', '---', '---', '---', '---', '---', '---')}
${FUTURE.map((p) => row(`\`${p.id}\``, p.name, p.nationality, p.homeCity, p.archetype, p.strength, p.counterplay)).join('\n')}

## 고정 로스터 (기존 POKER ARENA, ${ROSTER_PLAYERS.length}명)
${ROSTER_PLAYERS.map((p) => `- \`${p.id}\` ${p.name} — ${p.archetype}`).join('\n')}

대표 선수 ${LEGENDS.length + FUTURE.length}명은 **상한이 아니다.** 월드에는 이 외에 결정론적으로 생성된 레귤러 1,500명이 더 등록되어 있고(등록부 합계 1,605명) 서버는 실제 가입자를 같은 등록부에 무제한으로 추가한다.
`;
writeFileSync('docs/PLAYERS_EVIDENCE.md', pe);

const fmt = (n: number) => n.toLocaleString();
let wb = `# WORLD 2035 BIBLE

> 2033~2035 시즌의 모든 대회·상금·수상자·선수 설정은 **가상**이다. 실제 대회 역사(WSOP/WPT/EPT/APT/Triton/KPHF 등)는 \`참고한 현실 앵커\`로만 표기하며 공식 제휴가 아니다. 실제 로고·트레이드 드레스를 쓰지 않고 자체 리그 명칭으로 대체했다.
> **공식 WSOP/WPT/EPT 게임 아님 · 실제 현금 연동 없음 · 2035 기록은 가상.**

## 세계 규칙
- 월드 시계: 현실 2026-10-29 = 월드 2035-03-15. 현실 하루 = 월드 하루. 2035-12-31에서 멈춘다(다음 시즌은 스냅샷 확장 필요).
- 공식 AI 세계는 **사전 계산된 시즌 스냅샷**(시드 고정, SHA-256 기록)을 날짜에 맞춰 공개한다. 오프라인 동안 AI가 계속 연산했다고 주장하지 않는다. 공개 범위 밖(미래) 이벤트 결과는 보이지 않는다.
- 자유 로비: 강제 스토리·레벨 잠금·선행 대회 없음. 자금과 티켓만 필요.
- 유일하게 검증된 종목은 **NLHE**. PLO·숏덱·믹스드는 배경 설명일 뿐이며 참가 버튼이 없다.
- 표시 통화(시즌 고정, 매매 불가): ${Object.entries(DISPLAY_RATE).map(([k, v]) => `1크레딧=${v.symbol}${v.perCredit.toLocaleString()}(${k})`).join(' · ')}.

## 도시/개최지
${row('ID', '도시', '국가', '표시 통화', '설명')}
${row('---', '---', '---', '---', '---')}
${VENUES.map((v) => row(v.id, `${v.city} (${v.cityEn})`, v.country, v.currency, v.blurb)).join('\n')}

## 시리즈
${row('시리즈', '영문', '지역', '설명', '참고한 현실 앵커(제휴 아님)')}
${row('---', '---', '---', '---', '---')}
${SERIES.map((s) => row(s.name, s.nameEn, s.region, s.blurb, s.realAnchor ?? '—')).join('\n')}

## 2035 시즌 이벤트 (${EVENT_TEMPLATES.length}개)
${row('날짜(월드)', '이벤트', '시리즈', '개최지', '형식', '바이인', '인원', '스택/속도', '상금 풀(보장 포함)', 'ITM')}
${row('---', '---', '---', '---', '---', '---', '---', '---', '---', '---')}
${[...EVENT_TEMPLATES].sort((a, b) => a.day - b.day).map((e) => { const ps = prizeStructure(e, e.field, e.satelliteFor ? EVENT_TEMPLATES.find((x) => x.id === e.satelliteFor)!.buyIn : 0); return row(dayToDate(2035, e.day).label, e.name, seriesById(e.seriesId).name, venueById(e.venueId).city, [e.kind, e.pko ? (e.pko.mystery ? 'mystery' : 'PKO') : '', e.reentry ? 're-entry' : ''].filter(Boolean).join('/'), fmt(e.buyIn), fmt(e.field), `${e.stackBB}BB/${e.speed}`, e.kind === 'satellite' ? `티켓 ${ps.tickets}장` : fmt(ps.prizePool), `${Math.round(e.paidPct * 100)}%`); }).join('\n')}

## 연출 원칙
소셜 미디어식 속보를 꾸미지 않는다. 뉴스에는 스냅샷에 **확정된 결과**와 사용자 개인 인스턴스의 확정 결과만 게시하며, 둘은 다른 분류 라벨을 쓴다. 연속 승패로 난이도를 몰래 바꾸거나 리버를 조작하지 않는다.
`;
writeFileSync('docs/WORLD_2035_BIBLE.md', wb);
console.log('문서 생성 완료');
