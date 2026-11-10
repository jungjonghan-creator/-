# 으뜸스타안경 공식 홈페이지 (topstar52.co.kr) — Claude Code 작업 안내

## 한 줄 구조
`data/site.json`(모든 사실·글) → `node scripts/build.mjs` → `dist/`(올릴 파일). **사실값은 site.json 한 곳만 고친다.** 코드에 숫자·주소·전화를 직접 쓰지 않는다.

## 명령
- 미리보기(시연판·상대 링크·검색 차단): `node scripts/build.mjs --validate` → `dist/index.html` 열기
- 공개용: `SITE_MODE=production node scripts/build.mjs --validate` → 실패(✗)가 있으면 고친 뒤 다시
- 로컬 서버 확인: `cd dist && python3 -m http.server 8000`

## 파일
| 파일 | 고칠 때 |
|---|---|
| data/site.json | 지점 정보·전화·영업시간·카톡/오토블로그 링크·FAQ·칼럼·가맹 조건·성과 숫자 |
| scripts/build.mjs | 페이지 구성·섹션 순서·문구 틀 (페이지 = `add('경로/', () => layout({...}))`) |
| src/site.css | 디자인 (색 = :root 변수) |
| src/site.js | 지점 필터·스타루봇(규칙형 안내) |
| assets/images | 로고·스타루·매장 사진 (실제 사진만) |

## 자주 하는 일
- 지점 사진 넣기: `assets/images/stores/<slug>-1.jpg`(정면)·`-2`(내부)·`-3`(진열) 저장 → site.json 해당 지점 `photos`에 `{"src":"출처 주소","alt":"사진 설명","saveAs":"assets/images/stores/<slug>-1.jpg"}` → 파일이 있을 때만 갤러리 자동 표시
- 네이버 예약: 스마트플레이스에서 「예약 URL 복사」한 주소만 `stores[].reserveUrl`에 (지어내지 않음 · 없으면 버튼 숨김)
- 검색 제외 지점: `stores[].indexable: false` → noindex·sitemap 제외·구조화 데이터 없음 (화명점 = 소속 확인 전)
- GA4: `site.ga4Id`에 G-번호 → 전화·카톡·플레이스·예약·지도 클릭이 `contact_click`(method·store_slug·audience)으로 기록
- 새 칼럼: `consumerArticles`에 slug·category·title·summary·intro·sections·checklist·myth·related·status("published")
- 카톡·오토블로그 링크 변경: `kakaoChannels.*.url` / `stores[].autoblog`
- 휴대폰 번호 공개: `company.contacts[].publicApproved`

## 🔴 지켜야 할 것 (검사기가 자동으로 막는 것 + 사람이 볼 것)
지어낸 숫자·후기·경력 0 · 렌즈 가격 0 · 「처방·진단·치료」·「어르신·노인」 0 · 결과·매출 보장 0 · 리뷰 조건 혜택 0 · 교방점 본문에 「부산」 0 · 성과 숫자엔 지점 수·기간·비교 기준 · 확인 안 된 정보 = null(화면에 「정보 준비 중」) · AI가 만든 매장·사람 사진 0

## 올리기
GitHub에 올리고 Cloudflare Pages가 자동 빌드(빌드 명령 `SITE_MODE=production node scripts/build.mjs`, 출력 `dist`) → **Claude Code로 고치고 push하면 1~2분 뒤 topstar52.co.kr에 반영.** 자세한 순서 = DEPLOY.md

## 평일 07:00 예약 공개 (2026-11-10 추가)
- 칼럼 원본 = `columns/YYYY-MM-DD-슬러그.md` (견본 `columns/_TEMPLATE.md`) · 앞머리: title · description(80자) · publishAt("YYYY-MM-DDT07:00:00+09:00") · audience(손님|자녀|원장님) · store(선택) · faq(3개) · cta · image
- `npm run week` = `scripts/check.mjs`(위반이면 줄 번호와 함께 중단) → `build.mjs --production --validate` → `dist/` 완성
- `dist/_worker.js`(원본 `src/_worker.js`) = Cloudflare Pages 고급 모드: 미래 publishAt 칼럼 주소 404 · `data-publish`가 미래인 목록 항목 제거 · `/sitemap.xml`·`/rss.xml`을 `publish-manifest.json`으로 그때그때 생성
- 칼럼 목록 항목은 반드시 `articleCard()`로 만든다(= `data-publish` 자동). 빌드 검사가 빠진 항목을 잡는다.
- 첫 배포 시험: `npm run test-post` → `npm run week` → 업로드 / 확인 뒤 `npm run test-post:remove` → `npm run week` → 다시 업로드
