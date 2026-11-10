// 첫 배포 시험 글 — npm run test-post [-- 분]  /  지우기: npm run test-post:remove
// 지금 + N분(기본 10분) 뒤 publishAt 인 시험 글 1편을 columns/ 에 만든다. 검색에는 안 나가게 test: true (noindex · sitemap·rss 제외).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'columns');
const SLUG = 'publish-test';
const mine = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR) : []).filter((f) => f.endsWith('-' + SLUG + '.md'));

if (process.argv.includes('--remove')) {
  const fs_ = mine();
  fs_.forEach((f) => fs.rmSync(path.join(DIR, f)));
  console.log(fs_.length ? `시험 글 삭제: ${fs_.join(', ')}\n→ npm run week 다시 실행 → 새 dist 폴더를 한 번 더 올리면 사이트에서도 사라집니다.` : '지울 시험 글이 없습니다.');
  process.exit(0);
}

const min = Number(process.argv.slice(2).find((x) => /^\d+$/.test(x)) || 10);
const kst = new Date(Date.now() + min * 60_000 + 9 * 3600_000); // 한국 시각
kst.setUTCSeconds(0, 0);
const iso = kst.toISOString().slice(0, 19) + '+09:00';
const date = iso.slice(0, 10);
mine().forEach((f) => fs.rmSync(path.join(DIR, f)));
fs.mkdirSync(DIR, { recursive: true });
const file = path.join(DIR, `${date}-${SLUG}.md`);
fs.writeFileSync(file, `---
title: 예약 공개 시험 글
description: 정해진 시각에 글이 저절로 열리는지 확인하는 시험 글입니다. 확인 뒤 지웁니다.
publishAt: "${iso}"
audience: 손님
category: 시험
test: true
faq:
  - q: 이 글은 무엇인가요?
    a: 홈페이지 예약 공개 기능을 확인하려고 잠깐 올린 시험 글입니다.
  - q: 언제 사라지나요?
    a: 확인이 끝나면 담당자가 바로 지우고 다시 올립니다.
  - q: 검색에 나오나요?
    a: 검색 제외 표시를 해 두어 검색 결과와 사이트맵에는 나오지 않습니다.
cta: 시험이 끝나면 이 글은 지워집니다
image: /assets/images/og.png
---

## 시험 중입니다

이 글은 ${iso.replace('T', ' ').slice(0, 16)} (한국 시각)에 열리도록 예약해 둔 시험 글입니다.

그 시각 전에는 주소를 직접 넣어도 「찾는 페이지가 없습니다」가 나오고, 안경 이야기 목록에도 보이지 않아야 합니다.
`);
console.log(`시험 글 생성: columns/${date}-${SLUG}.md · 공개 시각 ${iso}
→ 이제 npm run week → dist 폴더를 바로 올리세요 (${min}분 안에).`);
