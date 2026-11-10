// 칼럼 검사기 — node scripts/check.mjs  (빌드 전 실행 · ✗ 하나라도 있으면 중단)
// 대상: columns/YYYY-MM-DD-슬러그.md   ✗ = 위반(중단) · ! = 경고(진행)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readColumns, AUDIENCES, PUBLISH_RE, isWeekday0700 } from './columns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const cols = readColumns(ROOT);
const errs = []; const warns = [];
const E = (c, line, msg) => errs.push(`✗ ${c.file}:${line} — ${msg}`);
const W = (c, line, msg) => warns.push(`! ${c.file}:${line} — ${msg}`);

// 문자 위치 → 줄 번호
const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;

// ---- 금지 표현 ----
const BANNED = ['처방', '진단', '치료', '어르신', '노인', '무료 A/S', '무료 수리', '무료 조정', '낫습니다', '예방됩니다', '저희', '당점', '우리 매장'];
const MONEY = /(?:\d[\d,.]*\s*(?:만\s*)?원(?![장래인칙형리료본])|[일이삼사오육칠팔구십백천]+\s*만\s*원)/;
const SHORTS = new Set(D.stores.map((s) => s.short));
const GENERIC_JUMS = new Set(['지점', '가맹점', '전 지점', '각 지점']);

// ---- 기존 글 문장 모음 (30자 겹침 검사용) ----
const norm = (t) => String(t).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*#>`]/g, '').replace(/\s+/g, ' ').trim();
const N = 30;
const grams = new Map(); // 30자 조각 → 출처
const addCorpus = (text, src) => { const t = norm(text); for (let i = 0; i + N <= t.length; i++) { const g = t.slice(i, i + N); if (!grams.has(g)) grams.set(g, src); } };
for (const [list, name] of [[D.consumerArticles, '손님 칼럼'], [D.franchiseArticles, '원장님 칼럼']]) {
  for (const a of list) {
    const src = `${name} ${a.slug}`;
    [a.title, a.summary, a.intro, a.myth, ...(a.checklist || []), ...(a.sections || []).flatMap((s) => [s.h, s.p])].filter(Boolean).forEach((t) => addCorpus(t, src));
  }
}
for (const f of [...(D.consumerFaq || []), ...(D.franchiseFaq || [])]) { addCorpus(f.q, '자주 묻는 질문'); addCorpus(f.a, '자주 묻는 질문'); }

// ---- 내부 주소 목록 ----
const ROUTES = new Set(['/', '/services/', '/benefits/', '/stores/', '/guide/', '/guide/progressive/', '/guide/questions/', '/brand/', '/franchise/', '/franchise/requirements/', '/franchise/stories/', '/franchise/insights/', '/franchise/contact/', '/company/', '/privacy/', '/sitemap.xml', '/rss.xml']);
D.stores.forEach((s) => ROUTES.add(`/stores/${s.slug}/`));
D.consumerArticles.filter((a) => a.status === 'published' && a.sections).forEach((a) => ROUTES.add(`/guide/articles/${a.slug}/`));
D.franchiseArticles.filter((a) => a.status === 'published' && a.sections).forEach((a) => ROUTES.add(`/franchise/insights/${a.slug}/`));
cols.forEach((c) => ROUTES.add(`/guide/articles/${c.slug}/`));
const linkOk = (u) => {
  let p = u.split(/[?#]/)[0];
  if (p.startsWith('/assets/')) return fs.existsSync(path.join(ROOT, p));
  if (!p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
  return ROUTES.has(p);
};

// ---- 슬러그 중복 ----
const taken = new Set([...D.consumerArticles, ...D.franchiseArticles].map((a) => a.slug));
const seen = new Set();

for (const c of cols) {
  const d = c.data; const L = (k) => c.lineOf[k] || 1;
  c.errors.forEach((e) => E(c, e.line, e.msg));
  if (taken.has(c.slug)) E(c, 1, `슬러그 「${c.slug}」가 site.json 칼럼과 겹침`);
  if (seen.has(c.slug)) E(c, 1, `슬러그 「${c.slug}」가 다른 칼럼 파일과 겹침`);
  seen.add(c.slug);

  // 필수 앞머리
  for (const k of ['title', 'description', 'publishAt', 'audience', 'faq', 'cta']) if (d[k] === undefined || d[k] === '' || (Array.isArray(d[k]) && !d[k].length)) E(c, 1, `앞머리 「${k}」 없음`);
  if (!d.image) W(c, 1, '앞머리 「image」 없음 → 기본 대표 그림(og.png) 사용');
  if (d.description && [...d.description].length > 80) E(c, L('description'), `description ${[...d.description].length}자 (80자 이내)`);
  if (d.audience && !AUDIENCES[d.audience]) E(c, L('audience'), `audience 「${d.audience}」 → 손님|자녀|원장님 중 하나`);
  if (d.store && !D.stores.some((s) => s.slug === d.store)) E(c, L('store'), `store 「${d.store}」는 없는 지점 (예: ${D.stores.slice(0, 3).map((s) => s.slug).join(', ')})`);
  if (Array.isArray(d.faq) && d.faq.length) {
    if (d.faq.length !== 3) E(c, L('faq'), `faq ${d.faq.length}개 (3개)`);
    d.faq.forEach((f, i) => { if (typeof f !== 'object' || !f.q || !f.a) E(c, (f && f._line) || L('faq'), `faq ${i + 1}번에 q·a 둘 다 필요`); });
  }
  if (d.publishAt) {
    if (!PUBLISH_RE.test(d.publishAt)) E(c, L('publishAt'), `publishAt 형식 「${d.publishAt}」 → "YYYY-MM-DDT07:00:00+09:00"`);
    else {
      if (!isWeekday0700(d.publishAt)) W(c, L('publishAt'), `publishAt ${d.publishAt} — 평일 07:00이 아님`);
      if (d.publishAt.slice(0, 10) !== c.date) W(c, L('publishAt'), `파일 이름 날짜(${c.date})와 publishAt 날짜(${d.publishAt.slice(0, 10)})가 다름`);
    }
  }
  if (d.image && d.image.startsWith('/') && !linkOk(d.image)) E(c, L('image'), `image 파일 없음 ${d.image}`);
  c.body.forEach((l, i) => { if (/^#\s/.test(l.trim())) E(c, c.bodyStart + i, '본문에 「# 」(큰 제목) 금지 — 제목은 title, 본문 소제목은 「## 」'); });

  const text = c.lines.join('\n');
  const skipLine = new Set(['image', 'publishAt', 'store', 'audience'].map((k) => c.lineOf[k]).filter(Boolean));

  // 금지어
  for (const w of BANNED) {
    let i = -1;
    while ((i = text.indexOf(w, i + 1)) > -1) { const ln = lineAt(text, i); if (!skipLine.has(ln)) E(c, ln, `금지 표현 「${w}」`); }
  }
  // 렌즈 ± 20자 금액
  for (const m of text.matchAll(/렌즈/g)) {
    const win = text.slice(Math.max(0, m.index - 20), m.index + 2 + 20);
    const mm = win.match(MONEY);
    if (mm) E(c, lineAt(text, m.index), `「렌즈」 가까이에 금액 「${mm[0].trim()}」 — 렌즈 가격 표기 금지`);
  }
  // 상호 표기
  for (const m of text.matchAll(/으뜸[^\s]*(?:\s+[가-힣]+점)?/g)) {
    const s = m[0]; const ln = lineAt(text, m.index);
    if (!s.startsWith('으뜸스타안경')) { E(c, ln, `상호 표기 「${s}」 → 「으뜸스타안경」`); continue; }
    if (/^으뜸스타안경원/.test(s) || /^으뜸스타안경[가-힣]*점/.test(s)) { E(c, ln, `상호 표기 「${s}」 → 「으뜸스타안경」 또는 「으뜸스타안경 ○○점」`); continue; }
    const jm = s.match(/^으뜸스타안경\s+([가-힣]+점)$/);
    if (jm && !SHORTS.has(jm[1]) && !GENERIC_JUMS.has(jm[1])) E(c, ln, `「${s}」 — 「${jm[1]}」은 지점 목록에 없음 (${[...SHORTS].join('·')})`);
  }
  for (const m of text.matchAll(/탑스타|top\s?star(?!52)/gi)) E(c, lineAt(text, m.index), `상호 표기 「${m[0]}」 → 「으뜸스타안경」`);
  // 출처 없는 숫자 (경고)
  c.lines.forEach((l, i) => {
    if (skipLine.has(i + 1)) return;
    const m = l.match(/\d[\d,.]*\s*(%|퍼센트|명|건)/);
    if (m && !/출처|기준|자료|조사|통계/.test(l)) W(c, i + 1, `숫자 「${m[0]}」에 출처·기준이 없음`);
  });
  // 30자 이상 같은 문장 (site.json 글 + 먼저 쓴 칼럼)
  const own = [d.description, ...(Array.isArray(d.faq) ? d.faq.flatMap((f) => [f.q, f.a]) : [])].filter(Boolean);
  const checkLine = (t, ln) => {
    const n = norm(t);
    for (let i = 0; i + N <= n.length; i++) { const src = grams.get(n.slice(i, i + N)); if (src) { E(c, ln, `기존 글(${src})과 30자 이상 같음: 「${n.slice(i, i + N)}…」`); return; } }
  };
  c.body.forEach((l, i) => checkLine(l, c.bodyStart + i));
  if (d.description) checkLine(d.description, L('description'));
  if (Array.isArray(d.faq)) d.faq.forEach((f) => { if (f && f.a) checkLine(f.a, f._line || L('faq')); });
  // 깨진 내부 링크
  c.lines.forEach((l, i) => {
    for (const m of l.matchAll(/\]\((\/[^)\s]*)\)|href="(\/[^"]*)"/g)) { const u = m[1] || m[2]; if (!linkOk(u)) E(c, i + 1, `깨진 내부 링크 ${u}`); }
  });
  // 이 칼럼을 다음 칼럼의 비교 대상으로
  [...c.body, ...own].forEach((t) => addCorpus(t, c.file));
}

console.log(`칼럼 검사 — ${cols.length}편`);
warns.forEach((w) => console.log(w));
errs.forEach((e) => console.log(e));
if (errs.length) { console.log(`\n✗ 위반 ${errs.length}건 — 고친 뒤 다시 실행하세요. 빌드를 멈춥니다.`); process.exit(1); }
console.log(`✓ 위반 0건${warns.length ? ` · 경고 ${warns.length}건(진행)` : ''}`);
