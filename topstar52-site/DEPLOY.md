# topstar52.co.kr 공개 순서 (Cloudflare Pages · 무료 · HTTPS 자동)

## ★ 매주 올리기 (끌어다 놓기 · 예약 공개)
1. `npm run week` → 검사 통과하면 `dist` 폴더 완성 (위반이 있으면 줄 번호가 나오고 멈춤)
2. Cloudflare 대시보드 → Workers 및 Pages → topstar52 → 새 배포 만들기 → `dist` 폴더 끌어다 놓기 → 배포
3. `dist/_worker.js` 가 함께 올라가야 예약 공개가 작동한다. 올린 뒤 `https://topstar52.co.kr/_worker.js` 가 「찾는 페이지가 없습니다」면 정상, 코드 글자가 보이면 워커가 꺼진 것(예약 글이 미리 보임) → 바로 알릴 것

> 지금 topstar52.co.kr 은 도메인 회사의 「URL 포워딩」으로 본사 블로그(https://blog.naver.com/topstar52)로 넘어간다. 이 포워딩을 끄고 시안 홈페이지를 이 주소에 올린다. 블로그는 그대로 두고 홈페이지 맨 아래에서 연결한다. `/stores/dongnae/` 같은 주소는 새로 만드는 사이트가 아니라 **같은 홈페이지 안의 지점 페이지**다.
> 도메인 구매처·로그인 = 실장님 확인(11/6).

## 0. 추천 방식 — GitHub + Cloudflare Pages 자동 반영 (Claude Code로 고치기 가장 편함)
1. github.com 가입 → 새 저장소 `topstar52-site`(Private) → 이 폴더 전체 올리기(`dist` 제외 · .gitignore 있음)
2. Cloudflare Pages → Create → **Connect to Git** → 저장소 선택 → Build command `SITE_MODE=production node scripts/build.mjs` · Output `dist` → Deploy
3. 아래 2번(도메인 연결)
4. 이후: Claude Code에서 「동래 영업시간 바꿔줘」 → 수정 → commit·push → 자동 반영

아래 1번은 GitHub 없이 파일을 직접 올리는 방법(급할 때).

## 1. 홈페이지 올리기 (10분)
1. https://dash.cloudflare.com 가입(본사 이메일 권장: topstar52@naver.com)
2. Workers & Pages → Create → Pages → **Upload assets**
3. 프로젝트 이름 `topstar52` → `dist` 폴더 안의 파일 전부를 끌어다 놓기 → Deploy
4. `https://topstar52.pages.dev` 로 열리는지 휴대폰으로 확인

## 2. 도메인 연결 (도메인 산 곳에서 · 15분~하루)
1. Cloudflare Pages 프로젝트 → Custom domains → `topstar52.co.kr` 추가, `www.topstar52.co.kr` 도 추가
2. 화면에 나오는 방법 중 하나:
   - **추천 A** 도메인 산 곳(가비아·후이즈·카페24 등)에서 **네임서버를 Cloudflare가 알려 준 2개로 변경** → Cloudflare가 나머지를 자동 처리
   - B 네임서버를 못 바꾸면: 도메인 산 곳 DNS 관리에서 `www` = CNAME `topstar52.pages.dev` 추가, 루트(@)는 그 회사의 포워딩을 `https://www.topstar52.co.kr` 로 변경
3. 도메인 산 곳의 **기존 URL 포워딩(블로그로 넘기는 설정) 삭제** — 이것을 안 지우면 계속 블로그로 넘어간다
4. 하루 안에 `https://topstar52.co.kr` 이 새 홈페이지로 열리면 끝

## 3. 공개 후 바로 (30분)
- 구글 서치 콘솔 + 네이버 서치어드바이저: 사이트 등록 → `https://topstar52.co.kr/sitemap.xml` 제출
- 네이버 플레이스·카카오맵·구글 비즈니스 프로필(동래·학장)의 홈페이지 칸 = 각 지점 페이지 주소 (`/stores/dongnae/`, `/stores/hakjang/`)
- 카톡 채널 4개 프로필의 홈페이지 칸 = 같은 주소

## 4. 고칠 때
`data/site.json` 고치기 → `SITE_MODE=production node scripts/build.mjs --validate` → 새 `dist` 를 Cloudflare에 다시 올리기 (Create new deployment)
- 카톡 채널 주소 생기면 `kakaoChannels.*.url` 에 `https://pf.kakao.com/_xxxx` 넣기 → 버튼이 자동으로 켜진다
- 이사·팀장 휴대폰 공개 = `company.contacts[].publicApproved: true`
