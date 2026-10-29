# 무료 배포 가이드 (Cloudflare Workers + D1) 및 자가 호스팅

> **이 작업에서 실제 배포는 하지 않았다.** 계정 생성·로그인·D1 생성은 사용자 본인만 할 수 있다. 결제 수단 등록·유료 업그레이드는 하지 않는다.

## 가장 빠른 길 (권장 순서)
| 목표 | 명령 | 사용자가 해야 하는 것 | 주소 | 비고 |
|---|---|---|---|---|
| ① 오늘 바로 가족과 | `npm install` → `npm run share` | cloudflared 설치(무료·계정 불필요) | 실행마다 바뀌는 https 주소 | 이 PC가 켜져 있는 동안만 접속 |
| ② 고정 주소·PC 꺼도 됨 | `npx wrangler login`(1회) → `npm run deploy:cf` | Cloudflare 무료 가입 + 로그인 허용 | `poker-arena.<계정>.workers.dev` | 가입/로그인 CPU 한도 위험 아래 참고 |
| ③ 항상 켜진 PC·NAS | `npm run start` | 포트포워딩 또는 터널 | 직접 관리 | CPU 제한 없음 |
**가족 합류:** 앱 → 랭킹 → 친구 → 그룹 만들기 → 「초대 링크 보내기」(카톡·문자). 링크를 연 사람은 가입 화면이 열리고, 가입/로그인하면 자동으로 같은 그룹에 들어간다. **기기 간 이어하기**는 같은 아이디로 로그인하면 된다(서버 저장).

## 상세: 사용자가 할 일 (Cloudflare 3단계, `npm run deploy:cf` 가 2·3을 자동화)
1. Cloudflare 무료 계정 생성 후 터미널에서 `npx wrangler login`
2. `npx wrangler d1 create poker-arena` → 출력된 `database_id`를 `wrangler.toml`의 `REPLACE_WITH_D1_ID_AFTER_CREATE`에 붙여넣기
3. `npm run build && npx wrangler deploy`  → 출력된 `https://poker-arena.<계정>.workers.dev` 를 가족에게 공유 (스키마는 첫 요청에 자동 생성)

## 실행 구조
`wrangler.toml`: Worker(`server/worker.ts`)가 `/api/*`를 처리하고 나머지는 `dist/`(정적 자산, SPA 폴백). 같은 출처라 쿠키 인증이 동작한다. 모바일은 URL을 열고 「홈 화면에 추가」(PWA).

## 로컬 실행 / 자가 호스팅 (무료, 항상 켜 둘 PC·NAS·라즈베리파이)
```
npm install
npm run build
npm run serve          # http://localhost:8787  (API + 앱, DB: data/poker.sqlite)
```
개발: 터미널 1 `npm run serve`, 터미널 2 `npm run dev` (Vite가 `/api`를 8787로 프록시).
외부에서 접속하려면 `cloudflared tunnel`(무료) 등을 사용한다. DB 백업: `data/poker.sqlite*` 파일 복사.

## 무료 한도 (참고값 — **적용 직전 계정 화면과 공식 문서에서 다시 확인**)
| 항목 | 참고값(2026-10 문서 기준, 마스터 프롬프트 제공) |
|---|---|
| Workers Free 요청 | 약 100,000건/일 |
| Workers Free CPU | 약 10ms/호출 |
| D1 | DB당 500MB, 계정 전체 5GB |

설계상 대응: 정적 프론트는 Worker 요청이 아니다 · 시즌 스냅샷은 정적 번들(계산 없음) · 게임 진행은 브라우저에서 · API 호출은 입장/정산/랭킹/저장만 · 클라우드 저장은 5초 디바운스+분할 저장 · 랭킹은 AI 부분을 isolate 메모리에 캐시.

### ⚠ 알려진 위험: 무료 CPU 10ms vs 비밀번호 해시
PBKDF2-SHA256 100,000회는 이 개발 환경(Node)에서 **약 54ms**였다. Workers Free의 10ms CPU 한도에서는 가입/로그인 요청이 한도를 넘어 실패할 수 있다 (실측 불가: 배포하지 않았다). 선택지:
1. 그대로 배포해 보고 가입/로그인이 실패하면 → 2·3 중 선택.
2. Workers Paid(월 5달러)로 CPU 한도 상향 — **사용자 결정 사항, 임의로 업그레이드하지 않음.**
3. 자가 호스팅(`npm run serve`)은 CPU 제한이 없어 위험 없음.
4. (비권장) `PBKDF2_ITERATIONS` 환경 변수로 반복 횟수를 낮추면 해시는 빨라지지만 보안이 약해진다. 계정마다 반복 횟수를 저장하므로 나중에 올려도 기존 계정은 유지된다.
이메일+비밀번호 방식은 필요 없다(직접 구현한 아이디+비밀번호가 PBKDF2·세션·CSRF·속도 제한을 만족).

## 운영 한계 대응
- 로그 무한 저장 없음: 핸드 기록은 브라우저(IndexedDB)에, 서버에는 지갑 원장·정산·점수·클라우드 저장 슬롯(계정당 1개, 덮어쓰기)만 저장.
- 한도에 접근하면: 읽기 전용 대응(데이터 보존)이 필요하다 — 자동 전환은 **미구현**, 사용자가 대시보드의 사용량을 확인해야 한다.

## Windows 메모
- 설치: `winget install -e --id Cloudflare.cloudflared` (터널 `npm run share` 용). 배포(`npm run deploy:cf`)에는 cloudflared 가 필요 없다.
- 스크립트는 Windows 에서 `npx`/`npm`(.cmd)을 shell 로 실행하도록 처리되어 있다.
- **배포는 로그인한 PC 에서 실행해야 한다.** 클라우드 세션(Claude Code on the web)은 Cloudflare 호스트가 네트워크 정책에서 막혀 있고 `wrangler login` 의 브라우저 콜백도 받을 수 없어 배포할 수 없다(2026-10-29 확인: api.cloudflare.com → 프록시 403).
- 배포 스크립트는 끝에 `/api/health` 와 랭킹 API 를 호출해 서버·D1 연결을 점검하지만 계정은 만들지 않는다.
