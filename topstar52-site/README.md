# 으뜸스타안경 공식 홈페이지 v3 (시연판)

- 빌드: `node scripts/build.mjs` → `dist/` · 검사: `node scripts/build.mjs --validate` (금지어·H1·깨진 링크·교방 「부산」·26년 복제·숫자 기준)
- 모드: `SITE_MODE=demo`(기본 · 전 페이지 noindex · 상대 링크) / `SITE_MODE=production`(승인된 `published` 글만 · sitemap.xml · 절대 링크)
- 사실값은 `data/site.json` 한 곳만 고친다. 빈칸(null)은 화면에 「정보 준비 중」, 버튼은 꺼진 상태, 구조화 데이터에서 빠짐.

## 자주 하는 수정 (site.json)
| 하고 싶은 일 | 고칠 곳 |
|---|---|
| 지점 전화·주소·영업시간 | `stores[].phone / address / hours` |
| 새 지점 | `stores`에 한 줄 추가 (slug = 영문, 한 번 정하면 바꾸지 않음) |
| 카카오톡 채널 연결 | `kakaoChannels.*.url` (11/5 개설 후) |
| 칼럼 공개 | `consumerArticles[].status` → `published` (안경사 검토 후) |
| 성과 숫자 | `evidence[]` — 지점 수·기간·비교 기준 셋 다 있어야 표시 · `approved:false`는 숨김 |
| 공개 | 대표님 승인 → `site.approvedForPublic` + `SITE_MODE=production` |

## 공개 전에 할 일 (PRODUCTION_CHECKLIST)
1. 대표님 승인(첫 화면·가맹 페이지·숫자) 2. 지점 빈칸 확인(`DATA_MISSING.md`) 3. 실제 매장 사진 4. 카톡 URL 5. 정보공개서 대조 6. 개인정보 보관 기간·양식 수신 방법(그 전까지 양식은 꺼 둠) 7. 호스팅 결정 → 도메인 www.topstar52.co.kr 연결(현재 블로그 연결 설정 먼저 확인) 8. 구글 서치 콘솔·네이버 서치어드바이저에 sitemap 제출 9. 구글 비즈니스 프로필·카카오맵·플레이스 홈페이지 칸에 지점 페이지 주소 넣기 10. GA4 측정 ID(전화·길찾기 클릭 = 클릭일 뿐 통화·방문 아님)

## 칼럼 원칙 (CONTENT_GUIDE)
손님 글 끝 = 「가까운 지점 찾기」 / 원장님 글 끝 = 「가맹 상담 안내 보기」 · 렌즈 가격·의학 단정·「어르신·노인」·결과 보장·리뷰 조건 혜택 0 · 숫자 옆에 기준 기간 · AI 초안을 안경사가 쓴 것처럼 표시하지 않음

## AI 답변 점검 질문 12개
`site.json` → `aiQuestions` (매달 제미나이·ChatGPT 각 12회 = 월 24회)
