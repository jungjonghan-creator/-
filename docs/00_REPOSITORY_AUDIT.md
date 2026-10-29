# 00 · 저장소 감사 (POKER ARENA 5.0 / 2035)

작성 기준: 2026-10-29 세션. **실측한 사실**과 **미확인**을 구분한다.

## 1. 프로젝트 사실 (실측)
| 항목 | 내용 |
|---|---|
| 언어/실행 | TypeScript(strict) · React 19 · Vite 8 · Tailwind 3 · Zustand 5 · idb(IndexedDB) · vite-plugin-pwa · Vitest · Playwright |
| 구조 | `src/engine`(규칙) · `src/ai`(AI) · `src/game`(세션·MTT·블라인드·ICM) · `src/economy`(지갑·카탈로그) · `src/world`(2035 월드) · `src/analysis`(분석) · `src/ui`(화면) · `server/`(API) |
| 저장 위치 | 브라우저 IndexedDB DB `poker-arena`, 스토어 `kv`: `session` · `wallet` · `archive` · `memory` · `tourneys` · `settings` · `favorites` · `spots` · `pfStats` |
| 터미널/SQLite | **이 저장소에는 없다.** 마스터 프롬프트가 말하는 「기존 터미널 기반 인터페이스·SQLite」 코드는 저장소 이력(커밋 13개, 최초 `PHASE 0-1`)에 존재하지 않는다 → 재사용 대상 아님. |
| 기능(코드로 존재) | 캐시(6/2인, 고정 블라인드, 탑업), SNG 9인/헤즈업, MTT(멀티테이블·균형·레이트 등록·재진입), 프리롤, 정규/적응형 블라인드, ICM, 분석실, PWA |
| 기능(글로만 존재했던 것) | 새틀라이트·PKO·미스터리 바운티·슛아웃·헤즈업 브래킷·휴식/핸드포핸드·Day2 — 2035 작업 이전에는 코드 없음 (현황은 `TOURNAMENT_RULES.md`) |
| 테스트 실행법 | `npm test`(Vitest) · `npm run e2e`(Playwright, 데스크톱+Pixel 5) · `npm run stress` · `npm run bench:world` |

## 2. TETO 데이터 (사용자의 실제 플레이·실력·성향 기록)
- **위치**: 사용자 기기 브라우저의 IndexedDB `poker-arena`. 클라우드 세션 컨테이너에서는 접근할 수 없다 → **내용은 미확인**. 임의 수치로 대신하지 않았다.
- **보존 장치**: (1) 로컬 모드는 같은 DB를 그대로 사용 → 기존 기록 무손실. (2) 계정 가입 시 `importLegacyInto()`가 `archive/memory/tourneys/settings`를 새 계정 DB로 **복사**(원본 삭제 없음). (3) 설정 > 「이 기기 전체 백업 내려받기」: JSON+SHA-256. (4) `npx tsx scripts/legacyProfile.ts <백업.json>`: 저장된 핸드에서 VPIP/PFR/3벳 등과 **표본 크기**를 읽기 전용으로 요약. 핸드 기록에는 타임스탬프가 없어 일시는 `미확인`으로 표시.
- 옛 통장 잔액은 검증되지 않은 값(`legacy/unverified`)이라 새 서버 지갑으로 가져오지 않는다.

## 3. 보고된 결함 「탈락/우승 상금 미지급·수령 불가·잔액 불변」 재현 결과
이벤트 흐름: 대회 종료 → 순위 산정 → 정산 → 원장 반영 → 저장 → UI 갱신. 코드 추적으로 **3개의 재현 가능한 결함**을 찾았고 `tests/fundsRepro.test.ts`로 먼저 실패를 확인한 뒤 고쳤다.

| # | 원인 | 증상 | 수정 |
|---|---|---|---|
| 1 | `tournamentResult()`가 SNG/헤즈업에서 `game.gameOver`일 때만 결과를 냈다 | ITM(3위 등)으로 **탈락해도 상금이 대회 전체 종료까지 지급되지 않음** | 탈락 순위(`finishPlace`)가 확정되는 순간 결과 산출 → 즉시 정산 (`finalizeTourney`는 종료 여부와 무관) |
| 2 | 앱 시작(`init`) 시 「끝났지만 정산 전」 세션이 있으면 계정이 `open`인 채 영구 방치 (`hasSave`는 false라 이어하기도 불가) | 우승 직후 앱/탭이 종료되면 **우승해도 잔액 불변** | `init`에서 확정 결과가 있는 열린 계정을 한 번 정산(멱등) |
| 3 | `simToEnd`(남은 대회 끝까지 진행) 완료 후 `finalizeTourney`를 호출하지 않음 | 시뮬레이션 완료로 순위가 확정돼도 계정이 닫히지 않음 | 완료 직후 정산 호출 |

회귀 방지: `tests/fundsRepro.test.ts`(4), `tests/economy/store`(기존 시나리오 12개), 서버 `tests/server.test.ts`(중복 정산 10회·동시 6요청·2탭 등).

## 4. 호환성 위험 (깨질 수 있는 것)
- 지갑 버전 1 유지(선택 필드 `tickets` 추가, `TxKind`에 `daily-grant`·`bounty-prize` 추가) → 구버전 데이터는 그대로 읽힌다.
- 로비 난이도 버튼 제거(요구 §4): 상대 실력은 판돈/참가자 구성으로 정해지고 개별 AI에 ±1 분포가 적용된다 → E2E 헬퍼 갱신.
- `Session.sid/instanceId/tierId`는 선택 필드.
