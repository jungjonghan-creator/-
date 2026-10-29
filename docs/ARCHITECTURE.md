# 아키텍처

```
브라우저(PWA, React)                         서버(Cloudflare Worker + D1  /  로컬 node:sqlite)
┌─────────────────────────┐   HTTPS/JSON     ┌──────────────────────────────┐
│ UI (src/ui)              │ ───────────────▶ │ server/api.ts (fetch 핸들러)   │
│ 스토어 useGame/useAccount │ ◀─────────────── │  · 인증(PBKDF2, 세션 쿠키)      │
│ 엔진/AI/MTT 시뮬 (로컬)    │  서버 확정 지갑    │  · 지갑 원장(append-only)       │
│ IndexedDB (계정별 DB)     │                  │  · 대회 입장/정산(멱등)          │
└─────────────────────────┘                  │  · 랭킹 포인트 원장·통합 랭킹     │
        ▲ 같은 순수 함수 공유                      └──────────────────────────────┘
src/economy (지갑)  src/world (월드·상금·랭킹 규칙)  ← 서버와 클라이언트가 동일 코드를 사용
```

## 레이어
| 레이어 | 위치 | 비고 |
|---|---|---|
| 도메인 엔진 | `src/engine` | 덱·규칙·팟·평가기·리플레이. UI/네트워크 비의존, 시드 결정론 |
| AI | `src/ai` | 공개 정보 DTO(`Observation`)만 입력. 숨은 카드·덱 접근 불가 |
| 대회 | `src/game` | 세션, MTT(테이블 균형·레이트 등록·재진입·PKO), 배치 테이블(`src/world/fastTable`) |
| 경제 | `src/economy` | 지갑(원장), 카탈로그, 정산 — **서버와 공유** |
| 월드 | `src/world` | 선수(90+15), 캘린더, 상금표, 배치 시뮬레이터, 시즌 스냅샷, 랭킹 규칙 |
| 분석 | `src/analysis` | 복기·코치·분석실(`lab.ts`)·훈련 — 게임 루프 밖(온디맨드) |
| 서버 | `server/` | `api.ts`(핸들러) · `walletStore.ts`(원자 연산) · `schema.ts` · `nodeDb.ts`(테스트/로컬) · `worker.ts`(Cloudflare) · `node.ts`(자가 호스팅) |

## 신뢰 모델 (정직한 한계)
- **서버가 확정하는 것**: 잔액·원장·참가비 차감·상금 계산(서버 상금표)·티켓 발행·랭킹 포인트 계산·1회성.
- **클라이언트가 보고하는 것**: 개인 대회의 최종 순위/참가자 수/핸드 수/바운티. 대회 진행 자체는 브라우저의 엔진이 하므로 서버는 **범위·일관성·1회성**만 검증한다(순위≤참가자, 참가자 수 상한, 바운티 풀 상한 등). AI 의사결정(MC 시뮬레이션)을 Workers 무료 CPU(10ms)에서 재현할 수 없어 전체 재실행 검증은 하지 않는다 → 지인용 게임에는 충분하지만 적대적 사용자를 막는 부정 방지는 아니다.
- 클라이언트가 보낸 잔액·상금액·점수는 **무시**한다 (API에 해당 필드가 없다).

## 공식 AI 세계 vs 개인 인스턴스
- 공식 AI 세계: `scripts/buildWorld.ts`가 시드 고정으로 2033~2035 시즌(153 이벤트)을 계산 → `src/world/data/season.json` + SHA-256. 앱/서버는 이 **스냅샷을 날짜(월드 시계)에 맞춰 공개**한다. 모든 계정이 같은 결과를 본다. 「백그라운드에서 실시간 진행」이라고 주장하지 않는다.
- 개인 인스턴스: 서버가 발급한 `instance_id`+시드로 각자 독립 진행. 결과는 해당 계정의 지갑·점수에만 반영되고 공식 우승 기록을 바꾸지 않는다.
- 통합 랭킹: 두 출처의 확정 결과를 **같은 공개 점수 규칙(`poy-v1`)**으로 환산해 정렬 (`RANKING_MODEL_v2.md`).

## 데이터 모델 (서버, `server/schema.ts`)
`accounts` · `sessions` · `login_attempts` · `wallets`/`wallet_txs`(PK `(account_id, tx_id)`)/`wallet_accounts` · `tournament_entries`(UNIQUE `instance_id`) · `tickets`(UNIQUE `source_entry`) · `ranked_submissions`(PK `(instance_id, participant_id, rules_version)`, UNIQUE `ranked_result_id`) · `points_ledger` · `global_roster`(`human:`/`ai:` 네임스페이스) · `friend_groups`/`friend_group_members` · `saves`/`save_chunks`(클라우드 이어하기, CAS) · `audit` · `meta`.
AI 선수 등록부(1,653명)는 코드/스냅샷에서 결정론적으로 생성되며 서버 `global_roster`에는 **사람 계정만** 저장한다(합쳐서 조회).

## 기술 결정 기록
1. 서버 프레임워크 없음: 표준 `Request/Response` 핸들러 하나 → Workers/Node/테스트 모두 동일 코드.
2. DB 어댑터: D1 호환 최소 인터페이스(`prepare/bind/first/all/run/batch`), 테스트는 `node:sqlite`(실험적 모듈 — 로컬/테스트 전용).
3. 낙관적 잠금: `wallets.version` + `last_op` 토큰, 모든 지갑 쓰기 문장에 `WHERE EXISTS(last_op=…)` 가드 + 거래 PK. 충돌하면 재시도(멱등).
4. 비밀번호: PBKDF2-SHA256 100,000회(Workers WebCrypto 상한), 계정별 16바이트 솔트, 상수시간 비교, 계정 부재 시에도 동일 비용 해시, 8회 실패/15분 잠금, 세션 토큰은 해시로 저장, 쿠키 `HttpOnly; SameSite=Lax(+Secure)`, CSRF 방어(`X-Requested-With` + Origin 검사).
