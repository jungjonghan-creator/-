# ♠ POKER ARENA 5.0 — WORLD POKER UNIVERSE 2035

가상 크레딧 기반 노리밋 텍사스 홀덤. 가족·친구가 각자 모바일/PC에서 **AI와 싱글플레이**하고, 성적을 **공통 국내·세계 랭킹**(AI와 사람이 한 순위표)에 반영합니다. 실제 돈·결제·환전·베팅과 무관하며 2033~2035 시즌의 대회·선수는 **가상 설정**입니다 (공식 WSOP/WPT/EPT 등과 제휴 없음).

TypeScript(strict) · React 19 · Vite 8 · Tailwind · Zustand · IndexedDB · PWA · Cloudflare Worker + D1 (또는 Node + SQLite) · Vitest · Playwright.

## 가장 쉬운 실행 (PC 한 대를 서버로)

```bash
npm install
npm run build
npm run serve            # http://localhost:8787  (API + 앱 + SQLite)
npm run share            # 가족·친구와 바로: 서버 + 무료 터널(cloudflared) 주소 출력
npm run deploy:cf        # Cloudflare 무료 배포 자동화 (먼저 npx wrangler login)
```
같은 와이파이의 폰: `http://<PC의 IP>:8787` → 가입 → 「홈 화면에 추가」. 아이디+비밀번호만 있으면 가입됩니다.
서버 없이 보려면 `npm run dev` (로컬 모드: 이 기기에서만, 랭킹은 이 기기 기록 + 공식 AI 스냅샷).
무료 공개 배포(Cloudflare)는 [docs/DEPLOY_FREE.md](docs/DEPLOY_FREE.md) — **계정 로그인이 필요해 직접 해야 합니다.**

## 주요 기능

| 영역 | 내용 |
|---|---|
| 계정 | 아이디+비밀번호(PBKDF2·세션 쿠키·로그인 제한·CSRF), 기기 간 자동 저장(클라우드 이어하기), 로컬 모드, 기존 기록 복사 이관·백업 |
| 월드 투어 | 2035 시즌 이벤트 51개 / 도시 14 / 시리즈 15 — 한국(서울·부산·인천·제주…), 아시아·마카오, 유럽, 라스베이거스. 카드마다 개최지·형식·인원·바이인(크레딧+표시통화)·시작 BB·레벨·상금 풀·ITM·예상 길이·등록 상태 |
| 형식 | 캐시, SNG, 헤즈업, MTT(6/8/9맥스·재진입·레이트 등록·터보/하이퍼/딥스택/슈퍼딥), PKO·미스터리 바운티, 새틀라이트(티켓), 보장 상금(오버레이), 프리즈아웃, 초청전, **최대 10,000명**(벤치마크). 구현 현황 표: [docs/TOURNAMENT_RULES.md](docs/TOURNAMENT_RULES.md) |
| 자금 | 서버 원장(append-only, 멱등 키): 탈락 **즉시** ITM 상금, 우승 직후 1등 상금, 바운티, 티켓 — 각각 한 번만. 일일 무료 크레딧(KST 하루 1회) |
| 랭킹 | 사람+AI 통합 세계/대한민국 랭킹, 실제 사용자만/AI만/친구·가족/시리즈/형식 필터, 검색·페이지네이션, 내 순위·바로 앞뒤, 공개 점수 산식 |
| 선수 | 실존 레전드 72(2026 전성기 타임캡슐, 시드 v3) + 2035 가상 66 + 기존 로스터 15 + 레귤러 1,500 = 1,653 AI. 138명은 대표 선수일 뿐 상한 아님 |
| 분석실 | 리플레이·복기(숨은 카드는 「알 수 없음」), 프리플랍 13×13, 포스트플랍 질감, ICM(정확/몬테카를로), 약점 지도, 맞춤 훈련(사전→사후→7일 복습), 상대 데이터, 경제 감사 |

## 테스트·벤치마크

```bash
npm test                 # Vitest: 엔진·AI·경제·서버·월드·분석실·이관
npm run e2e              # Playwright: 데스크톱 + 모바일(Pixel 5), 온라인 계정/가족 3계정/클라우드 이어하기
npm run stress           # 엔진 무작위 합법 행동 대량 시뮬레이션
npm run bench:world      # 배치 시뮬레이터 규모별 시간
npx tsx scripts/mttBench.ts   # 개인 인스턴스 MTT 180/1,000/5,000/10,000명
npm run build:world      # 공식 AI 세계 시즌 스냅샷 재생성 (결정론: 같은 시드 → 같은 SHA-256)
```
결과와 한계는 [docs/TEST_REPORT.md](docs/TEST_REPORT.md), 전체 상태는 [STATUS.md](STATUS.md).

## 문서
[00 저장소 감사](docs/00_REPOSITORY_AUDIT.md) · [01 이관 계획](docs/01_MIGRATION_PLAN.md) · [아키텍처](docs/ARCHITECTURE.md) · [경제 불변식](docs/ECONOMY_INVARIANTS.md) · [토너먼트 규칙/현황](docs/TOURNAMENT_RULES.md) · [월드 2035](docs/WORLD_2035_BIBLE.md) · [선수 근거](docs/PLAYERS_EVIDENCE.md) · [코칭 수학](docs/COACHING_MATH.md) · [테스트 보고서](docs/TEST_REPORT.md) · [무료 배포](docs/DEPLOY_FREE.md) · [이관 보고서](docs/MIGRATION_REPORT.md) · [랭킹 계약](RANKING_MODEL_v2.md)

## 구조
`src/engine` 규칙 · `src/ai` 의사결정 · `src/game` 세션/MTT/블라인드/ICM · `src/economy` 지갑/카탈로그/정산 · `src/world` 월드(선수·캘린더·상금·배치 시뮬레이터·스냅샷·랭킹) · `src/analysis` 복기/분석실 · `src/net` 서버 연동 · `src/ui`, `src/store` · `server/` API(Worker/Node 공용) · `scripts/` 측정·빌드.
