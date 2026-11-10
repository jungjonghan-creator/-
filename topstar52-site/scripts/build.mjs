// 으뜸스타안경 공식 홈페이지 빌드 — node scripts/build.mjs [--validate] [--production] [--week]
// SITE_MODE=demo(기본) | production (또는 --production) · 모든 사실값 = data/site.json 한 곳
// 예약 공개 칼럼 = columns/YYYY-MM-DD-슬러그.md (publishAt) → dist/publish-manifest.json + dist/_worker.js 가 시각에 맞춰 공개
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readColumns, AUDIENCES, mdToHtml } from './columns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const MODE = process.env.SITE_MODE === 'production' || process.argv.includes('--production') ? 'production' : 'demo';
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const DEMO = MODE === 'demo';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const tel = (p) => 'tel:' + String(p).replace(/[^0-9]/g, '');
const READY = '정보 준비 중';

// 공개 여부: production 은 승인(published)된 것만
const visible = (status) => DEMO ? status !== 'archived' : status === 'published';

let current = '';
const depthOf = (p) => (p === '' || p === '404/' ? 0 : p.replace(/\/$/, '').split('/').length);
const href = (to) => DEMO ? '../'.repeat(depthOf(current)) + to + 'index.html' : '/' + to;
const asset = (f) => DEMO ? '../'.repeat(depthOf(current)) + 'assets/' + f : '/assets/' + f;

const pages = [];
const noindexPages = new Set();
const missing = new Set();

function btn(label, url, opts = {}) {
  if (!has(url)) return `<span class="btn ${opts.cls || ''} is-off" aria-disabled="true">${esc(label)} · 준비 중</span>`;
  const ext = /^https?:/.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a class="btn ${opts.cls || ''}" href="${esc(url)}"${ext}${opts.ev ? ` data-ev="${esc(opts.ev)}"` : ''}>${esc(label)}</a>`;
}
const crumbLd = (items) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['홈', ''], ...items].map(([l, u], i) => ({ '@type': 'ListItem', position: i + 1, name: l, ...(u !== undefined ? { item: D.site.canonicalOrigin + '/' + (u || '') } : {}) })) })}</script>`;
const crumb = (items, ld = true) => `${ld ? crumbLd(items) : ''}<nav class="crumb" aria-label="현재 위치"><a href="${href('')}">홈</a>${items.map(([l, u]) => u ? ` › <a href="${href(u)}">${esc(l)}</a>` : ` › <span>${esc(l)}</span>`).join('')}</nav>`;

function layout({ p, title, desc, body, sticky = '', jsonld = [], h1check = true, noindex = false, ogImage = null, ogType = 'website', head = '' }) {
  if (noindex) noindexPages.add(p);
  current = p;
  const canonical = D.site.canonicalOrigin + '/' + p;
  const ld = jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('');
  const nav = [['서비스 안내', 'services/'], ['전 지점 찾기', 'stores/'], ['진행 중인 혜택', 'benefits/'], ['안경 이야기', 'guide/'], ['브랜드 소개', 'brand/']];
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta name="robots" content="${DEMO ? 'noindex,nofollow' : noindex ? 'noindex,follow' : 'index,follow'}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:type" content="${ogType}"><meta property="og:site_name" content="${esc(D.site.siteName)}"><meta property="og:locale" content="ko_KR">
<meta property="og:image" content="${esc(ogImage || D.site.canonicalOrigin + '/assets/images/og.png')}"><meta name="twitter:card" content="summary_large_image">${head}${DEMO ? '' : `<link rel="alternate" type="application/rss+xml" title="으뜸스타 안경 이야기" href="/rss.xml">`}${D.site.naverVerification ? `<meta name="naver-site-verification" content="${esc(D.site.naverVerification)}">` : ''}${D.site.googleVerification ? `<meta name="google-site-verification" content="${esc(D.site.googleVerification)}">` : ''}
<link rel="icon" href="${asset('images/star.png')}"><link rel="apple-touch-icon" href="${asset('images/star.png')}"><link rel="stylesheet" href="${asset('site.css')}">${ld}
${(!DEMO && D.site.ga4Id) ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(D.site.ga4Id)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(D.site.ga4Id)}');</script>` : ''}
</head><body${sticky ? ' class="has-sticky"' : ''}>
${DEMO ? `<div class="demo-bar"><div class="wrap">시연판 · 공개 전 · 검색 노출 안 함 · <a href="${href('preview/')}">대표님 시연 순서</a></div></div>` : ''}
<header class="top"><div class="wrap top-in">
<a class="logo" href="${href('')}"><img src="${asset('images/wordmark_dark.png')}" alt="으뜸스타안경" width="180" height="33"></a>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="gnb">메뉴</button>
<nav id="gnb" class="gnb" aria-label="주 메뉴">${nav.map(([l, u]) => `<a href="${href(u)}">${l}</a>`).join('')}<a class="gnb-fr" href="${href('franchise/')}">가맹 안내</a></nav>
</div></header>
<main id="main">${body}</main>
<footer class="foot"><div class="wrap foot-in">
<div><strong>${esc(D.company.legalName)}</strong> · 으뜸스타안경 운영사<br>사업자등록번호 ${esc(D.company.bizNo)}<br>본사 ${esc(D.company.address)}<br>본사 전화 <a href="${tel(D.company.phone)}">${esc(D.company.phone)}</a> · ${esc(D.company.email)}</div>
<div class="foot-links">${has(D.kakaoChannels.headquarters.url) ? `<a href="${esc(D.kakaoChannels.headquarters.url)}" target="_blank" rel="noopener noreferrer">카카오톡 본사 채널</a>` : ''}<a href="${href('company/')}">회사 소개</a><a href="${esc(D.site.blogUrl)}" target="_blank" rel="noopener noreferrer">공식 블로그</a><a href="${esc(D.site.social.instagram)}" target="_blank" rel="noopener noreferrer">인스타그램</a><a href="${esc(D.site.social.threads)}" target="_blank" rel="noopener noreferrer">스레드</a><a href="${href('franchise/')}">가맹 안내</a><a href="${href('privacy/')}">개인정보 처리방침</a></div>
</div></footer>
${sticky}
${starubot()}
<script src="${asset('site.js')}" defer></script>
</body></html>`;
}


function starubot() {
  const data = { stores: D.stores.map((x) => ({ n: x.short, a: x.area || '', d: x.district || '', t: x.phone || '', u: href('stores/' + x.slug + '/') })),
    kakao: D.stores.filter((x) => x.kakao && D.kakaoChannels[x.kakao].url).map((x) => ({ n: x.short, u: D.kakaoChannels[x.kakao].url })).concat(has(D.kakaoChannels.headquarters.url) ? [{ n: '본사', u: D.kakaoChannels.headquarters.url }] : []),
    links: { stores: href('stores/'), services: href('services/'), care: href('services/') + '#care', fr: href('franchise/'), frc: href('franchise/contact/'), prog: href('guide/progressive/'), benefits: href('benefits/') } };
  return `<button type="button" class="sb-fab" data-sb-open aria-haspopup="dialog"><img src="${asset('images/staru-face.png')}" alt="" width="44" height="44"><span>스타루봇</span></button>
<div class="sb" id="sb" role="dialog" aria-modal="false" aria-labelledby="sb-t" hidden><div class="sb-head"><img src="${asset('images/staru-face.png')}" alt="" width="40" height="40"><div><b id="sb-t">스타루봇</b><span>으뜸스타안경 길 안내</span></div><button type="button" class="sb-x" data-sb-close aria-label="닫기">닫기</button></div>
<div class="sb-body" id="sb-body" aria-live="polite"></div><div class="sb-foot"><button type="button" id="sb-back">이전</button><button type="button" id="sb-reset">처음으로</button></div></div>
<script>window.SB=${JSON.stringify(data)}</script>`;
}
function add(p, f) { current = p; pages.push({ p, html: f() }); }

// ---------- 공통 조각 ----------
const stores = D.stores;
const storeCard = (s) => `<li class="store-card" data-area="${esc(s.area || '')}" data-name="${esc(s.name + ' ' + (s.district || '') + ' ' + (s.address || ''))}">
<a href="${href('stores/' + s.slug + '/')}"><span class="sc-name">${esc(s.short)}${s.isNew ? ' <em class="tag">새 지점</em>' : ''}</span>
<span class="sc-meta">${has(s.address) ? esc(s.address) : READY}</span>
<span class="sc-meta">${has(s.phone) ? '☎ ' + esc(s.phone) : '전화 ' + READY}${has(s.hours) ? ' · ' + esc(s.hours) : ''}</span>
${has(s.experience) ? `<span class="sc-exp">${esc(s.experience)}</span>` : ''}</a></li>`;
const pubArticles = (list) => list.filter((a) => a.sections && visible(a.status));
const pick = (slugs) => { const P = pubArticles(D.consumerArticles); const got = slugs.map((x) => P.find((a) => a.slug === x)).filter(Boolean); return got.length ? got : P.slice(0, slugs.length); };
// ---------- 예약 공개 칼럼 (columns/*.md) ----------
const pubAt = (a) => a.publishAt || (a.publishedAt ? a.publishedAt + 'T07:00:00+09:00' : null);
const dp = (a) => pubAt(a) ? ` data-publish="${esc(pubAt(a))}"` : '';
const byNewest = (x, y) => Date.parse(pubAt(y)) - Date.parse(pubAt(x));
const COLS = readColumns(ROOT).filter((c) => c.data.title && AUDIENCES[c.data.audience] && c.data.publishAt).map((c) => ({
  md: true, file: c.file, slug: c.slug, title: c.data.title, summary: c.data.description, publishAt: c.data.publishAt, audience: c.data.audience,
  category: c.data.category || AUDIENCES[c.data.audience].category, store: c.data.store || null, cta: c.data.cta, image: c.data.image || null,
  faq: (Array.isArray(c.data.faq) ? c.data.faq : []).filter((f) => f && f.q && f.a), test: String(c.data.test) === 'true', body: c.body })).sort(byNewest);
const colsFor = (list) => COLS.filter((c) => AUDIENCES[c.audience].list === list);
const confirmedStore = (s) => s.indexable !== false && has(s.district);
const articleCard = (a, base) => `<li class="art-card"${dp(a)}><a href="${href(base + a.slug + '/')}"><span class="cat">${esc(a.category)}</span><span class="art-t">${esc(a.title)}</span><span class="art-s">${esc(a.summary)}</span></a></li>`;
const faqList = (list) => `<div class="faq">${list.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`;
const AUTHOR = '으뜸스타안경 본사';
const draftNote = DEMO ? `<p class="review-note">검토 전 초안 · 안경사·담당자 검토 후 발행 · 발행일 미정</p>` : '';

const svc9 = [
  ['frames', '안경테', '디자인만큼 착용감이 중요합니다. 코·귀가 눌리지 않는지, 고개를 숙여도 흘러내리지 않는지 직접 써 보고 고르세요. 테는 매장에서 가격을 보고 고르실 수 있습니다.'],
  ['lens', '일반 안경렌즈', '렌즈는 눈을 확인한 뒤 생활에 맞게 안내받으세요. 가격은 눈 확인 후 매장에서 안내합니다.'],
  ['progressive', '노안·누진다초점', '먼 곳·중간·가까운 곳을 렌즈 한 장으로 나눠 봅니다. 처음이거나 예전에 불편했다면 생활과 착용 경험부터 이야기해 주세요.'],
  ['sun', '선글라스·기능성 렌즈', '운전·야외·컴퓨터처럼 쓰는 곳에 따라 고르는 기준이 다릅니다. 도수가 필요한지도 함께 물어보세요.'],
  ['student', '학생 안경', '공부하는 거리, 운동, 쓰는 시간을 함께 봅니다. 가볍고 튼튼한 테가 맞는지 같이 써 보세요.'],
  ['contact', '콘택트렌즈', '원하는 제품이 있다면 취급 여부와 재고를 먼저 지점에 물어보세요.'],
  ['consult', '시력 확인·맞춤 상담', '지금 시력과 쓰던 안경을 확인하고, 하루 중 무엇을 오래 보시는지 여쭤본 뒤 안내합니다. 갑자기 잘 안 보이거나 눈이 아프면 안과에서 먼저 확인받으세요.'],
  ['care', '피팅·A/S', '안경이 흘러내리거나 기울면 맞춘 지점에 보여 주세요. 조정·수리 가능 여부와 비용은 지점에서 안내합니다.'],
  ['benefit', '예약·구매 혜택', '지점별로 예약과 쿠폰이 다릅니다. 진행 중인 혜택에서 조건을 확인하세요.']];
// ---------- 손님 첫 화면 (11/3 전면 개편 지시서: 서비스 중심 · 경력 섹션 메인 제외 · 스타루봇) ----------
const featured = ['dongnae', 'hakjang'].map((s) => stores.find((x) => x.slug === s));
const expStores = stores.filter((s) => has(s.experience));
const ic = {
  glasses: '<path d="M3 13a4 4 0 1 0 8 0 4 4 0 0 0-8 0Zm10 0a4 4 0 1 0 8 0 4 4 0 0 0-8 0Zm-2 0h2M3 13 5 6m16 7-2-7"/>',
  contact: '<circle cx="12" cy="12" r="8"/><path d="M6 10c2-3 10-3 12 0"/>',
  student: '<path d="M3 8l9-4 9 4-9 4-9-4Zm4 2v5c3 2 7 2 10 0v-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2m10-10 2-2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  prog: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M8 16h8"/>',
  tool: '<path d="M14 6a4 4 0 0 0 5 5l-8 8-3-3 8-8a4 4 0 0 0-2-2Z"/>'};
const svg = (k) => `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic[k]}</svg>`;
const services6 = [['glasses', '안경테·안경렌즈', '일반 안경부터 맞춤 렌즈까지', 'frames'], ['prog', '노안·다초점', '강점 · 생활부터 듣고 상담', 'progressive'], ['contact', '콘택트렌즈', '제품 종류와 취급 지점 확인', 'contact'], ['sun', '선글라스·기능성 렌즈', '쓰는 곳에 맞는 선택', 'sun'], ['student', '학생 안경', '공부·생활 환경을 고려', 'student'], ['tool', '피팅·A/S', '착용 조정·관리·수리 안내', 'care']];
const reserve = [['정밀 시력검사·상담', '시력과 지금 안경 확인'], ['1:1 개인 맞춤 안경', '새 안경 맞추기'], ['누진다초점 개인 맞춤 상담', '노안·다초점'], ['콘택트렌즈 제품·재고 확인', '원하는 제품 있는지'], ['A/S 및 기타 상담', '쓰던 안경이 불편할 때']];
add('', () => layout({ p: '', title: D.site.siteName + ' | 부산·경남 12개 지점', desc: D.site.description,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'Organization', name: '으뜸스타안경', legalName: D.company.legalName, url: D.site.canonicalOrigin, telephone: D.company.phone, email: D.company.email, sameAs: [D.site.blogUrl, D.kakaoChannels.headquarters.url, D.site.social.instagram, D.site.social.threads].filter(has), areaServed: '부산·경남' }, { '@context': 'https://schema.org', '@type': 'WebSite', name: D.site.siteName, alternateName: ['으뜸스타안경', 'topstar52.co.kr'], url: D.site.canonicalOrigin + '/', inLanguage: 'ko-KR' }],
  body: `
<section class="hero2"><div class="wrap hero2-in">
<div class="hero-text"><p class="eyebrow">${esc(D.site.regionLabel)} ${esc(D.site.storeCountLabel)}</p>
<h1><span class="h1-sub">안경, 콘택트렌즈, A/S 수리까지</span><br>노안·다초점 전문 <wbr>으뜸스타안경</h1>
<p class="lead">맞지 않는 안경, 참고 쓰고 계셨나요? 지금 쓰는 안경과 평소 생활을 먼저 듣고 함께 고릅니다.</p>
<div class="cta-row"><a class="btn btn-main" href="${href('stores/')}">가까운 지점 찾기</a><a class="btn" href="${href('services/')}">서비스 둘러보기</a></div>
<button type="button" class="ask-staru" data-sb-open><img src="${asset('images/staru-face.png')}" alt="" width="40" height="40">스타루에게 물어보기</button></div>
${DEMO ? `<div class="photo-slot hero-photo">실제 상담 사진 자리<br><span class="small">손님이 테를 써 보고 안경사가 설명하는 장면 · 촬영 동의 받은 실제 사진으로 교체</span></div>` : `<div class="hero-card hero-list"><b>으뜸스타안경에서 할 수 있는 일</b><ul>${[['일반 안경·안경테', 'services/#frames'], ['안경렌즈·기능성 렌즈', 'services/#lens'], ['노안·다초점 상담 <em class="tag">강점</em>', 'services/#progressive'], ['콘택트렌즈·선글라스', 'services/#contact'], ['학생 안경', 'services/#student'], ['맞춘 뒤 착용 조정·A/S', 'services/#care']].map(([t, u]) => `<li><a href="${href(u.split('#')[0])}#${u.split('#')[1]}">${t}</a></li>`).join('')}</ul><span>${esc(D.site.regionLabel)} ${esc(D.site.storeCountLabel)} · 가까운 곳에서 직접 써 보고 고르세요</span></div>`}
</div></section>
<section class="band"><div class="wrap"><h2>어떤 서비스를 찾으세요?</h2>
<ul class="svc">${services6.map(([k, t, s, a]) => `<li><a href="${href('services/')}#${a}"><span class="ico">${svg(k)}</span><b>${t}</b><span>${s}</span></a></li>`).join('')}</ul>
<p><a href="${href('services/')}">서비스 안내 ${svc9.length}가지 모두 보기</a></p></div></section>
<section><div class="wrap"><h2>으뜸스타안경을 선택하는 이유</h2>
<ul class="three four"><li><b>${esc(D.site.storeCountLabel)}</b><span>${esc(D.site.regionLabel)} 지점 네트워크</span></li><li><b>다양한 안경</b><span>일반 안경·기능성 렌즈·콘택트렌즈</span></li><li><b>맞춤 상담</b><span>쓰는 곳과 생활 습관을 듣고 안내</span></li><li><b>구매 후 관리</b><span>착용 조정·수리 안내 · 범위는 지점별 확인</span></li></ul></div></section>
<section class="band"><div class="wrap"><h2>내 안경을 고르는 과정, 이렇게 진행됩니다</h2>
<ol class="flow"><li>${DEMO ? '<span class="photo-mini">사진</span>' : ''}<b>1. 이야기 듣기</b>지금 안경·불편한 점·생활</li><li>${DEMO ? '<span class="photo-mini">사진</span>' : ''}<b>2. 눈 확인</b>지금 시력과 쓰던 안경 확인</li><li>${DEMO ? '<span class="photo-mini">사진</span>' : ''}<b>3. 테·렌즈 고르기</b>직접 써 보고 설명 듣고 정하기</li><li>${DEMO ? '<span class="photo-mini">사진</span>' : ''}<b>4. 받으실 때 맞춤</b>얼굴에 맞게 착용 조정</li></ol></div></section>
<section><div class="wrap"><h2>가까운 으뜸스타안경을 찾아보세요</h2>
<p>${esc(D.site.regionLabel)} ${esc(D.site.storeCountLabel)} 전부 한곳에 모았습니다.</p>
<ul class="mini-stores">${stores.map((s) => `<li><a href="${href('stores/' + s.slug + '/')}"><b>${esc(s.short)}</b><span>${esc(s.district || '정보 확인 중')}</span></a></li>`).join('')}</ul>
<p><a class="btn btn-main" href="${href('stores/')}">전 지점 찾기</a></p></div></section>
<section class="band"><div class="wrap"><h2>방문 전에 편하게 문의하세요</h2>
<ul class="reserve">${reserve.map(([t, s]) => `<li><a href="${href('stores/')}"><b>${t}</b><span>${s} → 지점 고르기</span></a></li>`).join('')}</ul>
<div class="benefit-card"><b>진행 중인 혜택 · 네이버 쿠폰</b><span>${D.benefits[0].stores.map((x) => stores.find((y) => y.slug === x).short).join(' · ')}</span><a href="${href('benefits/')}">지점별 조건 보기</a></div></div></section>
<section><div class="wrap"><h2>으뜸스타 안경 이야기</h2><ul class="art-list" data-limit="3">${[...colsFor('consumer').filter((c) => !c.test), ...pick(['why-glasses-prices-differ', 'frame', 'first-progressive'])].map((a) => articleCard(a, 'guide/articles/')).join('')}</ul><p><a href="${href('guide/')}">안경 이야기 모두 보기</a></p></div></section>
<section class="final"><div class="wrap"><h2>가까운 매장에서 상담해 보세요</h2><a class="btn btn-main" href="${href('stores/')}">가까운 지점 찾기</a></div></section>` }));

// ---------- 서비스 안내 (9가지) ----------
add('services/', () => layout({ p: 'services/', title: '서비스 안내 | 으뜸스타안경', desc: '안경테, 안경렌즈, 누진다초점, 선글라스, 학생 안경, 콘택트렌즈, 맞춤 상담, 피팅·A/S까지 으뜸스타안경 서비스 안내입니다.',
  body: `<div class="wrap page narrow">${crumb([['서비스 안내']])}<h1>어떤 서비스를 찾으세요?</h1>
<p class="lead">지점마다 갖춘 제품과 서비스가 다를 수 있습니다. 찾는 것이 있으면 오시기 전에 전화로 물어봐 주세요.</p>
<nav class="toc-chips" aria-label="서비스 목록">${svc9.map(([a, t]) => `<a href="#${a}">${t}</a>`).join('')}</nav>
${svc9.map(([a, t, p]) => `<section class="svc-sec" id="${a}"><h2>${t}</h2><p>${esc(p)}</p>${a === 'progressive' ? `<p><a href="${href('guide/progressive/')}">노안·다초점 자세히 보기</a></p>` : ''}${a === 'benefit' ? `<p><a href="${href('benefits/')}">진행 중인 혜택 보기</a></p>` : ''}</section>`).join('')}
<section class="final"><a class="btn btn-main" href="${href('stores/')}">가까운 지점 찾기</a></section></div>` }));

// ---------- 진행 중인 혜택 ----------
add('benefits/', () => layout({ p: 'benefits/', title: '진행 중인 혜택 | 으뜸스타안경', desc: '으뜸스타안경 지점별 네이버 쿠폰 등 진행 중인 혜택입니다.',
  body: `<div class="wrap page narrow">${crumb([['진행 중인 혜택']])}<h1>진행 중인 혜택</h1>
${D.benefits.map((b) => `<h2>${esc(b.name)}</h2><p class="small">${esc(b.note)}</p><ul class="store-list">${b.stores.map((x) => { const st = stores.find((y) => y.slug === x); return `<li class="store-card"><a href="${has(st.placeUrl) ? esc(st.placeUrl) : href('stores/' + st.slug + '/')}"${has(st.placeUrl) ? ' target="_blank" rel="noopener noreferrer"' : ''}><span class="sc-name">${esc(st.short)}</span><span class="sc-meta">${esc((b.detail || {})[x] || '조건은 네이버 플레이스에서 확인')}</span></a></li>`; }).join('')}</ul>`).join('')}
<p class="small">혜택은 지점마다 다릅니다. 끝난 혜택은 이 페이지에서 내립니다.</p>
<section class="final"><a class="btn btn-main" href="${href('stores/')}">가까운 지점 찾기</a></section></div>` }));

// ---------- 지점 찾기 ----------
add('stores/', () => layout({ p: 'stores/', title: '으뜸스타안경 지점 찾기 | 부산·경남 매장 안내', desc: '으뜸스타안경 부산·경남 지점의 주소, 전화번호, 영업시간을 확인하세요.',
  jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: stores.filter(confirmedStore).map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: D.site.canonicalOrigin + '/stores/' + s.slug + '/' })) }],
  body: `<div class="wrap page">${crumb([['지점 찾기']])}<h1>가까운 으뜸스타안경을 찾아보세요</h1>
<div class="filter" role="group" aria-label="지역 선택"><button type="button" class="chip is-on" data-area="">전체</button><button type="button" class="chip" data-area="부산">부산</button><button type="button" class="chip" data-area="경남">경남</button></div>
<label class="search" for="store-q">지점 이름이나 동네로 찾기<input id="store-q" type="search" placeholder="예: 동래, 해운대, 사상"></label>
<ul class="store-list" id="store-list">${stores.map(storeCard).join('')}</ul>
<p class="empty" id="store-empty" hidden>찾는 지점이 없습니다. 다른 말로 찾아보세요.</p>
<p class="note">영업시간은 바뀔 수 있습니다. 오시기 전에 전화로 한 번 확인해 주세요.</p></div>` }));

// ---------- 지점 상세 ----------
for (const s of stores) {
  if (!has(s.address)) missing.add(`${s.short}: 주소`);
  if (!has(s.phone)) missing.add(`${s.short}: 대표 전화`);
  if (!has(s.hours)) missing.add(`${s.short}: 영업시간·휴무`);
  missing.add(`${s.short}: 실제 매장 사진 · 카카오맵·구글 지도 링크`);
  const mapSearch = has(s.address) ? 'https://map.naver.com/p/search/' + encodeURIComponent(s.name) : null;
  const place = s.placeUrl || mapSearch;
  const kakao = s.kakao ? D.kakaoChannels[s.kakao] : null;
  const ld = { '@context': 'https://schema.org', '@type': 'Optician', name: s.name, url: D.site.canonicalOrigin + '/stores/' + s.slug + '/', parentOrganization: { '@type': 'Organization', name: '으뜸스타안경' } };
  if (has(s.address)) ld.address = { '@type': 'PostalAddress', streetAddress: s.address, addressCountry: 'KR' };
  if (has(s.phone)) ld.telephone = s.phone;
  const same = [s.placeUrl, s.blog, s.autoblog, kakao && kakao.url, s.daangn, s.kakaomap, s.google].filter(has); if (same.length) ld.sameAs = same;
  if (has(s.hours)) ld.openingHours = s.hours;
  ld.brand = { '@type': 'Brand', name: '으뜸스타안경' };
  const rows = [['주소', s.address], ['전화', s.phone ? `<a href="${tel(s.phone)}">${esc(s.phone)}</a>` : null, true], ['영업시간', s.hours], ['쉬는 날', s.closedDays], ['주차', s.parking], ['찾아오는 길', s.directions]];
  const idx = s.indexable !== false;
  const photos = (s.photos || []).filter((ph) => ph && has(ph.saveAs) && fs.existsSync(path.join(ROOT, ph.saveAs))).slice(0, 3);
  const gallery = photos.length ? `<div class="gallery">${photos.map((ph, i) => `<img src="${asset(ph.saveAs.replace(/^assets\//, ''))}" alt="${esc(ph.alt)}" width="${i ? 400 : 960}" height="${i ? 300 : 640}"${i ? ' loading="lazy"' : ''} class="${i ? 'g-sub' : 'g-main'}">`).join('')}</div>` : '';
  add('stores/' + s.slug + '/', () => layout({ p: 'stores/' + s.slug + '/', title: `${s.name} | 주소·전화·영업시간 | 으뜸스타안경`, desc: `${s.name}${has(s.address) ? ' · ' + s.address : ''}${has(s.phone) ? ' · ' + s.phone : ''}. 안경·렌즈·노안·다초점 상담.`,
    jsonld: idx && has(s.address) && has(s.phone) ? [ld] : [], noindex: !idx,
    sticky: `<div class="sticky"><div class="wrap">${btn('이 지점에 전화하기', s.phone ? tel(s.phone) : null, { cls: 'btn-main', ev: 'phone_click:' + s.slug })}</div></div>`,
    body: `<div class="wrap page">${crumb([['지점 찾기', 'stores/'], [s.short]], confirmedStore(s))}
<p class="eyebrow">${esc(s.district || '지역 확인 중')}</p><h1>${esc(s.name)}</h1>
${s.intro ? `<p class="lead">${esc(s.intro)}</p>` : `<p class="lead">이 지점의 소개는 원장님 확인 뒤 올립니다.</p>`}
${gallery || (DEMO ? '<div class="photo-slot">매장 사진 자리 · 원장님이 승인한 실제 사진으로 교체</div>' : '')}
${has(s.experience) || has(s.who) ? `<h2>상담하는 사람</h2><p>${esc([s.experience, s.who].filter(has).join(' · '))}</p>` : ''}
<h2>방문 전에 확인하세요</h2><dl class="info">${rows.map(([k, v, raw]) => `<div><dt>${k}</dt><dd>${has(v) ? (raw ? v : esc(v)) : READY}</dd></div>`).join('')}</dl>
<div class="cta-row">${btn('이 지점에 전화하기', s.phone ? tel(s.phone) : null, { cls: 'btn-main' })}${kakao && (DEMO || kakao.url) ? btn('카카오톡으로 상담하기', kakao.url, { cls: 'btn-kakao' }) : ''}${has(s.reserveUrl) ? btn('네이버 예약하기', s.reserveUrl) : ''}${btn('네이버 플레이스 바로 가기', place, { ev: 'directions_click:' + s.slug })}${has(s.blog) ? btn('네이버 블로그', s.blog) : ''}${has(s.autoblog) ? btn('지점 소식 홈페이지', s.autoblog) : ''}${has(s.daangn) ? btn('당근에서 보기', s.daangn) : ''}</div>
${D.benefits[0].stores.includes(s.slug) ? `<div class="benefit-card"><b>네이버 쿠폰 진행 중</b><span>${esc((D.benefits[0].detail || {})[s.slug] || '조건은 네이버 플레이스에서 확인')}</span></div>` : ''}
${s.renamed ? `<p class="quote">이름은 바뀌었어도 원장도 자리도 그대로입니다.</p>` : ''}
<h2>오시면 이렇게 이야기합니다</h2><ol class="steps4"><li><b>생활</b>무엇을 오래 보시는지</li><li><b>지금 안경</b>편했던 점과 불편했던 장면</li><li><b>쓰임새</b>운전·휴대폰·컴퓨터·책</li><li><b>고르기</b>설명을 듣고 직접 정하기</li></ol>
<h2>방문 전에 읽어 보세요</h2><ul class="art-list" data-limit="3">${[...COLS.filter((c) => c.store === s.slug && !c.test), ...pick(['bring-old', 'kakao-first-question'])].map((a) => articleCard(a, 'guide/articles/')).join('')}</ul>
${has(s.autoblog) ? `<p>지점 홈페이지: <a href="${esc(s.autoblog)}" target="_blank" rel="noopener noreferrer">${esc(s.short)} 안내 페이지</a></p>` : ''}
${has(s.blog) ? `<p>지점 소식: <a href="${esc(s.blog)}" target="_blank" rel="noopener noreferrer">${esc(s.short)} 블로그</a></p>` : ''}
</div>` }));
}

// ---------- 가이드 ----------
const cats = [...new Set([...colsFor('consumer').map((a) => a.category), ...D.consumerArticles.filter((a) => visible(a.status)).map((a) => a.category)])];
const draftCard = (a) => `<li class="art-card is-draft" data-cat="${esc(a.category)}"><span class="cat">${esc(a.category)}</span><span class="art-t">${esc(a.title)}</span><span class="art-s">준비 중인 글</span></li>`;
const catCard = (a, base) => articleCard(a, base).replace('<li class="art-card"', `<li class="art-card" data-cat="${esc(a.category)}"`);
add('guide/', () => layout({ p: 'guide/', title: '으뜸스타 안경 이야기 | 으뜸스타안경', desc: '안경테·렌즈·가격·상담 준비부터 노안·다초점까지, 안경을 고르기 전에 알아두면 좋은 정보입니다.',
  body: `<div class="wrap page">${crumb([['안경 이야기']])}<p class="eyebrow">으뜸스타 안경 이야기</p><h1>안경을 고르기 전에, 알아두면 좋은 이야기</h1>
<p class="lead">새 안경을 맞추기 전, 테·렌즈·가격·상담 준비부터 노안·다초점까지 궁금한 것을 먼저 확인해 보세요.</p>
<div class="guide-cols">
<section class="guide-col" aria-labelledby="g-consumer"><h2 id="g-consumer">손님 이야기</h2>
<div class="filter" role="group" aria-label="주제 선택"><button type="button" class="chip is-on" data-cat="">전체</button>${cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
<ul class="art-list" id="art-list">${[...colsFor('consumer'), ...D.consumerArticles.filter((a) => visible(a.status))].map((a) => a.md || a.sections ? catCard(a, 'guide/articles/') : draftCard(a)).join('')}</ul>
<p><a class="btn" href="${href('guide/progressive/')}">노안·다초점 안내</a> <a class="btn" href="${href('guide/questions/')}">자주 묻는 질문</a></p></section>
<section class="guide-col" aria-labelledby="g-owner"><h2 id="g-owner">원장님 운영 이야기</h2>
<ul class="art-list">${[...colsFor('owner').map((a) => articleCard(a, 'guide/articles/')), ...pubArticles(D.franchiseArticles).map((a) => articleCard(a, 'franchise/insights/'))].join('')}</ul>
<p><a class="btn" href="${href('franchise/')}">가맹 안내 보기</a></p></section>
</div>
<section class="final"><h2>상담할 지점을 찾아보세요</h2><a class="btn btn-main" href="${href('stores/')}">가까운 지점 찾기</a></section></div>` }));

add('guide/progressive/', () => layout({ p: 'guide/progressive/', title: '다초점 안경 처음이라면? 고르기 전 확인할 점 | 으뜸스타안경', desc: '노안 안경과 다초점 안경의 차이, 상담 전에 정리하면 좋은 내용을 쉬운 말로 정리했습니다.',
  body: `<div class="wrap page narrow">${crumb([['안경 이야기', 'guide/'], ['노안·다초점 안내']])}<h1>다초점 안경이 처음이라면</h1>
<p class="lead">가까운 글씨를 볼 때 휴대폰을 멀리 들게 되면, 안경을 바꿔야 하나 고민이 시작됩니다.</p>
<h2>돋보기와 다초점은 무엇이 다른가요</h2><div class="compare"><div><b>돋보기(독서용)</b><p>가까운 거리 한 곳을 편하게 봅니다. 멀리 볼 때는 벗어야 합니다.</p></div><div><b>다초점(누진)</b><p>렌즈 한 장 안에서 먼 곳·중간·가까운 곳을 나눠 봅니다. 위는 먼 곳, 아래로 갈수록 가까운 곳입니다.</p></div></div>
<h2>예전에 불편했던 경험이 있다면</h2><p>어떤 장면에서 불편했는지가 다음 상담의 가장 좋은 자료입니다. 계단, 옆 보기, 컴퓨터, 책 중 어느 쪽이었는지 떠올려 보세요.</p>
<h2>방문 전 체크</h2><ul class="check"><li>가장 오래 하는 일 3가지</li><li>그때 보는 거리</li><li>불편했던 장면 1~2개</li><li>지금 쓰는 안경</li><li>물어볼 질문 2개</li></ul>
<h2>자주 묻는 질문</h2>${faqList(D.consumerFaq.slice(0, 6))}
<p class="small">갑자기 잘 안 보이거나 눈이 아프다면 안경원보다 안과에서 먼저 확인받으세요.</p>
<section class="final"><a class="btn btn-main" href="${href('stores/')}">가까운 지점 찾기</a></section></div>` }));

add('guide/questions/', () => layout({ p: 'guide/questions/', title: '노안·다초점 안경 자주 묻는 질문 | 으뜸스타안경', desc: `다초점 안경을 처음 알아보는 분들이 가장 많이 묻는 질문 ${D.consumerFaq.length}개와 답입니다.`,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: D.consumerFaq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }],
  body: `<div class="wrap page narrow">${crumb([['안경 이야기', 'guide/'], ['자주 묻는 질문']])}<h1>자주 묻는 질문 ${D.consumerFaq.length}가지</h1>${draftNote}${faqList(D.consumerFaq)}
<section class="final"><a class="btn btn-main" href="${href('stores/')}">가까운 지점 찾기</a></section></div>` }));

const artLd = (a, base) => ({ '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.summary, author: { '@type': 'Organization', name: AUTHOR }, publisher: { '@type': 'Organization', name: '으뜸스타안경' }, ...(a.publishedAt ? { datePublished: a.publishedAt } : {}), mainEntityOfPage: D.site.canonicalOrigin + '/' + base + a.slug + '/', inLanguage: 'ko-KR' });
const frCta = () => `<h2>궁금한 조건부터 물어보세요</h2><div class="cta-row">${btn('염대홍 대표에게 전화하기', tel(D.company.contacts[0].phone), { cls: 'btn-main' })}${btn('본사 카카오톡으로 가맹 문의', D.kakaoChannels.headquarters.url, { cls: 'btn-kakao' })}</div>`;
function articlePage(a, base, list, cta) {
  const rel = (a.related || []).map((s) => list.find((x) => x.slug === s)).filter((x) => x && x.sections && visible(x.status));
  return `<article class="wrap page narrow">${crumb(base === 'guide/articles/' ? [['안경 이야기', 'guide/'], [a.title]] : [['가맹 안내', 'franchise/'], ['원장님 운영 칼럼', 'franchise/insights/'], [a.title]])}
<p class="eyebrow">${esc(a.category)}</p><h1>${esc(a.title)}</h1>
<p class="byline">${AUTHOR} · ${DEMO ? '검토 전 초안 · 발행일 미정' : '발행 ' + esc(a.publishedAt || new Date().toISOString().slice(0, 10))}</p>
<div class="summary"><b>한눈에</b><p>${esc(a.summary)}</p></div>
<p class="lead">${esc(a.intro)}</p>
${a.sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join('')}
<h2>체크리스트</h2><ul class="check">${a.checklist.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
<h2>자주 있는 오해</h2><p>${esc(a.myth)}</p>
${rel.length ? `<h2>다음에 읽을 글</h2><ul class="art-list">${rel.map((r) => articleCard(r, base)).join('')}</ul>` : ''}
<section class="final">${cta}</section></article>`;
}
for (const a of pubArticles(D.consumerArticles)) {
  add('guide/articles/' + a.slug + '/', () => layout({ p: 'guide/articles/' + a.slug + '/', title: `${a.title} | 으뜸스타안경`, desc: a.summary,
    jsonld: [artLd(a, 'guide/articles/')],
    body: articlePage(a, 'guide/articles/', D.consumerArticles, `<h2>가까운 지점에서 직접 물어보세요</h2><div class="cta-row"><a class="btn btn-main" href="${href('stores/')}">가까운 지점 찾기 · 예약·위치</a>${btn('카카오톡으로 먼저 물어보기', D.kakaoChannels.headquarters.url, { cls: 'btn-kakao' })}</div>`) }));
}

// ---------- 브랜드 ----------
add('brand/', () => layout({ p: 'brand/', title: '으뜸스타안경 브랜드 이야기와 스타루', desc: '안경의 모든 서비스를 가까운 동네에서 상담하는 부산·경남 안경 브랜드 으뜸스타안경과 캐릭터 스타루를 소개합니다.',
  body: `<div class="wrap page">${crumb([['브랜드']])}<h1>가까운 동네에서, 안경의 모든 것을</h1>
<p class="lead">으뜸스타안경은 ${esc(D.site.regionLabel)}에서 일반 안경·안경테·렌즈, 콘택트렌즈·선글라스, 학생 안경, 맞춘 뒤 조정까지 안경에 필요한 일을 함께하는 안경 브랜드입니다. 특히 노안·다초점 상담에 강합니다. 지점마다 그 동네에서 오래 일해 온 안경사가 상담합니다.</p>
<ul class="exp">${expStores.map((s) => `<li><b>${esc(s.experience.replace('안경사 경력 ', ''))}</b><span>${esc(s.short)}</span></li>`).join('')}</ul>
<div class="staru"><img src="${asset('images/staru.jpg')}" alt="스타루" width="220" height="220"><div><h2>스타루를 소개합니다</h2><p>당신의 시야를 밝혀 주는 별, 스타루입니다. 둥근 안경과 남색 나비넥타이가 표시입니다. 스타루는 길을 안내하고, 상담은 매장의 안경사가 합니다.</p></div></div>
<section class="final"><a class="btn btn-main" href="${href('stores/')}">가까운 지점 찾기</a></section></div>` }));

// ---------- 가맹 ----------
const ev = D.evidence.filter((e) => e.approved);
const evCards = `<ul class="ev">${ev.map((e) => `<li><b>${esc(e.value)}</b><span class="ev-m">${esc(e.metric)}</span><span class="ev-b">${esc(e.storeCount)} · ${esc(e.period)} · ${esc(e.basis)}</span></li>`).join('')}</ul><p class="small">${esc(D.evidenceNote)}</p>`;
const ceo = D.company.contacts[0];
const ceoSticky = () => `<div class="sticky"><div class="wrap">${btn('대표에게 전화하기', tel(ceo.phone), { cls: 'btn-main', ev: 'phone_click:ceo' })}</div></div>`;
const frNav = () => `<nav class="subnav" aria-label="가맹 메뉴"><a href="${href('franchise/')}">가맹 소개</a><a href="${href('franchise/insights/')}">운영 칼럼</a><a href="${href('franchise/stories/')}">운영 사례</a><a href="${href('franchise/requirements/')}">조건·절차</a><a href="${href('franchise/contact/')}">대표 상담</a></nav>`;
const steps6 = `<ol class="steps6">${D.franchise.process.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;

add('franchise/', () => layout({ p: 'franchise/', title: '으뜸스타안경 가맹 안내 | 안경원 운영·전환 상담', desc: '체인 전환을 고민하는 안경원 원장님께 가맹 조건, 운영 사례, 대표 직접 상담을 안내합니다.', sticky: ceoSticky(),
  body: `<div class="fr">${frNav()}<section class="hero hero-fr"><div class="wrap"><p class="eyebrow">원장님을 위한 공간</p><h1>본사 물량 배정 없이,<br>원장님이 선택합니다.</h1>
<p class="lead">가맹비는 300만 원 내외(부가세 별도·협의)입니다. 로열티는 월 30만 원 정액(부가세 별도)입니다. 신규 가맹 마케팅은 3개월 동안 지원하며, 구체적인 범위는 상담 시 확인합니다.</p>
<div class="cta-row">${btn('대표에게 전화하기', tel(ceo.phone), { cls: 'btn-main' })}${btn('본사 카카오톡 문의', D.kakaoChannels.headquarters.url, { cls: 'btn-kakao' })}</div>
<p class="small">별도 비용과 세부 약정은 정보공개서·계약서에서 확인하세요.</p></div></section>
<div class="wrap page"><h2>원장님이 가장 먼저 묻는 것</h2><dl class="info">${D.franchise.conditions.map((c) => `<div><dt>${esc(c.label)}</dt><dd><b>${esc(c.value)}</b><br><span class="small">${esc(c.note)}</span></dd></div>`).join('')}</dl><p class="small">${esc(D.franchise.legalNote)}</p>
<h2>실제 지점의 기록</h2>${evCards}
<h2>${esc(D.franchise.story.title)}</h2><p>${esc(D.franchise.story.text)}</p>
<h2>가맹은 이렇게 진행됩니다</h2>${steps6}
<h2>대표 인사말</h2><div class="greet">${D.greeting.map((g) => `<p>${esc(g)}</p>`).join('')}</div>
<section class="final"><a class="btn btn-main" href="${href('franchise/contact/')}">가맹 상담 안내 보기</a></section></div></div>` }));

add('franchise/requirements/', () => layout({ p: 'franchise/requirements/', title: '으뜸스타안경 가맹 조건과 절차', desc: '으뜸스타안경 가맹비, 로열티, 영업 지역, 가맹 6단계 절차를 안내합니다.', sticky: ceoSticky(),
  body: `<div class="fr">${frNav()}<div class="wrap page">${crumb([['가맹 안내', 'franchise/'], ['조건·절차']])}<h1>가맹 전, 이것부터 확인하세요</h1>
<dl class="info">${D.franchise.conditions.map((c) => `<div><dt>${esc(c.label)}</dt><dd><b>${esc(c.value)}</b><br><span class="small">${esc(c.note)}</span></dd></div>`).join('')}</dl>
<h2>6단계 진행 순서</h2>${steps6}<p class="small">${esc(D.franchise.legalNote)} 진행 순서 그림은 법에서 정한 계약 전 절차를 대신하지 않습니다.</p>
<h2>원장님 자주 묻는 질문</h2>${faqList(D.franchiseFaq)}
<section class="final"><a class="btn btn-main" href="${href('franchise/contact/')}">가맹 상담 안내 보기</a></section></div></div>` }));

add('franchise/stories/', () => layout({ p: 'franchise/stories/', title: '으뜸스타안경 지점 운영 사례 | 기준과 함께 보는 기록', desc: '으뜸스타안경 일부 지점의 매출·유입·전화 기록을 기간과 기준과 함께 공개합니다.', sticky: ceoSticky(),
  body: `<div class="fr">${frNav()}<div class="wrap page">${crumb([['가맹 안내', 'franchise/'], ['운영 사례']])}<h1>숫자는 기준과 함께 보여 드립니다</h1>
<p class="lead">숫자마다 몇 개 지점인지, 언제와 비교했는지를 함께 적었습니다.</p>${evCards}
<h2>지점 바로 가기</h2><ul class="mini-stores">${stores.map((x) => `<li><a href="${href('stores/' + x.slug + '/')}"><b>${esc(x.short)}</b><span>${esc(x.experience || x.district || '정보 확인 중')}</span></a></li>`).join('')}</ul>
<h2>숫자를 읽는 법</h2><ul class="check"><li>증가율(%)과 횟수(회)는 다른 숫자입니다.</li><li>광고 도달은 광고가 보인 사람 수이고, 방문이나 구매가 아닙니다.</li><li>한 지점의 기록은 다른 매장의 결과를 약속하지 않습니다.</li></ul>
<section class="final"><a class="btn btn-main" href="${href('franchise/contact/')}">가맹 상담 안내 보기</a></section></div></div>` }));

const frCats = [...new Set([...colsFor('owner').map((a) => a.category), ...D.franchiseArticles.map((a) => a.category)])];
add('franchise/insights/', () => layout({ p: 'franchise/insights/', title: '원장님 운영 칼럼 | 으뜸스타안경', desc: '체인 전환, 지역 마케팅, 성과 지표를 원장님 입장에서 정리한 안경원 운영 칼럼입니다.', sticky: ceoSticky(),
  body: `<div class="fr">${frNav()}<div class="wrap page">${crumb([['가맹 안내', 'franchise/'], ['원장님 운영 칼럼']])}<p class="eyebrow">원장님 운영 칼럼</p><h1>안경원 운영의 중요한 결정, 근거부터 확인하세요</h1>
<div class="filter" role="group" aria-label="주제 선택"><button type="button" class="chip is-on" data-cat="">전체</button>${frCats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
<ul class="art-list" id="art-list">${colsFor('owner').map((a) => catCard(a, 'guide/articles/')).join('')}${D.franchiseArticles.filter((a) => visible(a.status)).map((a) => a.sections ? articleCard(a, 'franchise/insights/').replace('<li class="art-card">', `<li class="art-card" data-cat="${esc(a.category)}">`) : `<li class="art-card is-draft" data-cat="${esc(a.category)}"><span class="cat">${esc(a.category)}</span><span class="art-t">${esc(a.title)}</span><span class="art-s">준비 중인 글</span></li>`).join('')}</ul>
<section class="final"><a class="btn btn-main" href="${href('franchise/contact/')}">가맹 상담 안내 보기</a></section></div></div>` }));
for (const a of pubArticles(D.franchiseArticles)) {
  add('franchise/insights/' + a.slug + '/', () => layout({ p: 'franchise/insights/' + a.slug + '/', title: `${a.title} | 으뜸스타안경 원장님 운영 칼럼`, desc: a.summary, sticky: ceoSticky(),
    jsonld: [artLd(a, 'franchise/insights/')],
    body: `<div class="fr">${frNav()}${articlePage(a, 'franchise/insights/', D.franchiseArticles, frCta())}</div>` }));
}

add('franchise/contact/', () => layout({ p: 'franchise/contact/', title: '으뜸스타안경 가맹 상담 | 대표 직접 문의', desc: '으뜸스타안경 가맹 상담은 대표 염대홍이 직접 합니다.', sticky: ceoSticky(),
  body: `<div class="fr">${frNav()}<div class="wrap page narrow">${crumb([['가맹 안내', 'franchise/'], ['대표 상담']])}<h1>가맹, 대표에게 직접 물어보세요</h1>
<div class="ceo-card"><span>대표</span><b>${esc(ceo.name)}</b><a class="big-tel" href="${tel(ceo.phone)}">${esc(ceo.phone)}</a><p>상담만 받으셔도 됩니다. 그날 정하지 않으셔도 됩니다.</p></div>
${has(D.kakaoChannels.headquarters.url) ? `<p class="cta-row"><a class="btn" href="${esc(D.kakaoChannels.headquarters.url)}" target="_blank" rel="noopener noreferrer">카카오톡 본사 채널로 문의</a></p>` : ''}
${DEMO ? `<h2>상담 요청 남기기</h2>
<form class="form" id="fr-form" novalidate><p class="form-demo">${DEMO ? '시연용 양식 · 실제로 접수되지 않습니다' : '온라인 접수는 준비 중입니다 · 지금은 대표에게 전화로 문의해 주세요'}</p>
<label for="f-name">이름<input id="f-name" name="name" autocomplete="name" required></label>
<label for="f-tel">연락처<input id="f-tel" name="tel" type="tel" autocomplete="tel" required></label>
<label for="f-own">지금 안경원을 운영하고 계신가요?<select id="f-own" name="own"><option value="">선택</option><option>운영 중</option><option>새로 열 계획</option></select></label>
<label for="f-msg">상담 내용 (선택)<textarea id="f-msg" name="msg" rows="3"></textarea></label>
<label class="agree" for="f-agree"><input id="f-agree" type="checkbox" required> [필수] 가맹 상담을 위한 개인정보 수집·이용에 동의합니다. 수집 항목: 이름, 연락처, 상담 내용 · 목적: 상담 답변 · 보관 기간: [확인 필요] · 동의하지 않으셔도 전화 상담은 가능합니다. <a href="${href('privacy/')}">처리방침</a></label>
<button class="btn btn-main" type="submit" disabled>상담 요청 보내기 · 준비 중</button></form>` : ''}
<p class="small">가맹 조건은 정보공개서와 계약서로 확인합니다. 이 페이지의 숫자는 같은 성과를 약속하지 않습니다.</p></div></div>` }));

// ---------- 예약 공개 칼럼 페이지 (columns/*.md → /guide/articles/{슬러그}/) ----------
const absUrl = (u) => !has(u) ? null : /^https?:/.test(u) ? u : D.site.canonicalOrigin + (u.startsWith('/') ? u : '/' + u);
const cardAuto = (a) => articleCard(a, a.md || D.consumerArticles.includes(a) ? 'guide/articles/' : 'franchise/insights/');
const featuredStores = ['dongnae', 'hakjang'].map((x) => stores.find((y) => y.slug === x)).filter(Boolean);
for (const c of COLS) {
  const p = 'guide/articles/' + c.slug + '/';
  const st = c.store ? stores.find((x) => x.slug === c.store) : null;
  const owner = c.audience === '원장님';
  const kakaoUrl = (st && st.kakao && D.kakaoChannels[st.kakao] && D.kakaoChannels[st.kakao].url) || D.kakaoChannels.headquarters.url;
  const phone = st && has(st.phone) ? st.phone : owner ? ceo.phone : D.company.phone;
  const phoneLabel = st && has(st.phone) ? `${st.short}에 전화하기` : owner ? '대표에게 전화하기' : '본사에 전화하기';
  const place = st ? (st.placeUrl || (has(st.address) ? 'https://map.naver.com/p/search/' + encodeURIComponent(st.name) : null)) : null;
  const third = place ? btn(`${st.short} 네이버 플레이스`, place, { ev: 'directions_click:' + st.slug })
    : owner ? `<a class="btn" href="${href('franchise/contact/')}">가맹 상담 안내 보기</a>`
    : `<a class="btn" href="${href('stores/')}">가까운 지점 네이버 플레이스 찾기</a>`;
  const relStores = st ? [st] : owner ? [] : featuredStores;
  const imgUrl = absUrl(c.image);
  const localImg = c.image && c.image.startsWith('/assets/') && fs.existsSync(path.join(ROOT, c.image)) ? asset(c.image.replace(/^\/assets\//, '')) : null;
  const others = [...COLS.filter((x) => x !== c && AUDIENCES[x.audience].list === AUDIENCES[c.audience].list && !x.test),
    ...(owner ? pubArticles(D.franchiseArticles).slice(0, 3) : pick(['first-progressive', 'bring-old', 'frame']))];
  const crumbs = [['안경 이야기', 'guide/'], [c.title]];
  add(p, () => layout({ p, title: `${c.title} | 으뜸스타안경`, desc: c.summary, ogImage: imgUrl, ogType: 'article', noindex: c.test,
    head: `<meta property="article:published_time" content="${esc(c.publishAt)}">`,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'Article', headline: c.title, description: c.summary, ...(imgUrl ? { image: [imgUrl] } : {}),
        author: { '@type': 'Organization', name: AUTHOR, url: D.site.canonicalOrigin + '/' },
        publisher: { '@type': 'Organization', name: '으뜸스타안경', logo: { '@type': 'ImageObject', url: D.site.canonicalOrigin + '/assets/images/star.png' } },
        datePublished: c.publishAt, dateModified: c.publishAt, mainEntityOfPage: D.site.canonicalOrigin + '/' + p, inLanguage: 'ko-KR' },
      ...(c.faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: c.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : [])],
    body: `<article class="wrap page narrow" data-publish="${esc(c.publishAt)}">${crumb(crumbs)}
<p class="eyebrow">${esc(c.category)}</p><h1>${esc(c.title)}</h1>
<p class="byline">${AUTHOR} · ${DEMO ? '예약 공개 ' + esc(c.publishAt.replace('T', ' ').slice(0, 16)) : '발행 ' + esc(c.publishAt.slice(0, 10))}</p>
<div class="summary"><b>한눈에</b><p>${esc(c.summary)}</p></div>
${localImg ? `<img class="art-img" src="${localImg}" alt="${esc(c.title)}" width="960" height="540">` : ''}
${mdToHtml(c.body, { esc, link: (u) => href(u.replace(/^\//, '').split('#')[0]) + (u.includes('#') ? '#' + u.split('#')[1] : '') })}
${c.faq.length ? `<h2>자주 묻는 질문</h2>${faqList(c.faq)}` : ''}
<section class="final art-cta"><h2>${esc(c.cta || (owner ? '궁금한 조건부터 물어보세요' : '가까운 지점에서 직접 물어보세요'))}</h2>
<div class="cta-row">${btn(phoneLabel, tel(phone), { cls: 'btn-main', ev: 'phone_click:' + (st ? st.slug : owner ? 'ceo' : 'hq') })}${btn('카카오톡으로 물어보기', kakaoUrl, { cls: 'btn-kakao' })}${third}</div></section>
${relStores.length ? `<h2>관련 지점</h2><ul class="mini-stores">${relStores.map((x) => `<li><a href="${href('stores/' + x.slug + '/')}"><b>${esc(x.short)}</b><span>${esc(x.district || '')} · 주소·전화·영업시간</span></a></li>`).join('')}</ul><p><a href="${href('stores/')}">전 지점 찾기</a></p>`
    : `<p><a href="${href('franchise/')}">으뜸스타안경 가맹 안내 보기</a></p>`}
${others.length ? `<h2>다음에 읽을 글</h2><ul class="art-list" data-limit="3">${others.map(cardAuto).join('')}</ul>` : ''}
</article>` }));
}

// ---------- 회사·개인정보·시연·404 ----------
add('company/', () => layout({ p: 'company/', title: '(주)에이치컴퍼니 | 으뜸스타안경 운영사', desc: '으뜸스타안경을 운영하는 (주)에이치컴퍼니의 본사 위치와 연락처입니다.',
  jsonld: [{ '@context': 'https://schema.org', '@type': 'Organization', name: D.company.legalName, brand: '으뜸스타안경', telephone: D.company.phone, email: D.company.email, address: { '@type': 'PostalAddress', streetAddress: D.company.address, addressCountry: 'KR' } }],
  body: `<div class="wrap page narrow">${crumb([['회사 소개']])}<h1>으뜸스타안경을 운영하는 ${esc(D.company.legalName)}</h1>
<dl class="info"><div><dt>본사 주소</dt><dd>${esc(D.company.address)}<br><span class="small">${esc(D.company.directions)}</span></dd></div><div><dt>본사 전화</dt><dd><a href="${tel(D.company.phone)}">${esc(D.company.phone)}</a></dd></div><div><dt>이메일</dt><dd>${esc(D.company.email)}</dd></div><div><dt>사업자등록번호</dt><dd>${esc(D.company.bizNo)}</dd></div></dl>
<h2>담당자</h2><ul class="contacts">${D.company.contacts.filter((c) => DEMO || c.publicApproved).map((c) => `<li><span>${esc(c.role)} · ${esc(c.note)}</span><b>${esc(c.name)}</b><a href="${tel(c.phone)}">${esc(c.phone)}</a></li>`).join('')}</ul>
${DEMO ? '<p class="review-note">개인 휴대전화 공개는 각 담당자 동의 확인 후</p>' : ''}
<section class="final"><a class="btn btn-main" href="${tel(D.company.phone)}">본사에 전화하기</a></section></div>` }));

const PRIV_PROD = [['개인정보처리자', D.company.legalName + ' (으뜸스타안경)'], ['수집하는 개인정보', '현재 이 홈페이지는 방문자의 이름·연락처 등 개인정보를 받지 않습니다. 상담은 전화와 카카오톡 채널로 받습니다.'], ['쿠키·방문 기록', D.site.ga4Id ? '방문 통계를 위해 구글 애널리틱스 쿠키를 씁니다. 어느 페이지를 몇 번 봤는지, 전화·카톡 버튼을 몇 번 눌렀는지만 이름 없이 모으며, 사람을 알아볼 수 있는 정보는 모으지 않습니다. 브라우저 설정에서 쿠키를 거부할 수 있습니다.' : '방문 통계 도구를 쓰기 시작하면 이 방침을 먼저 고쳐 알립니다.'], ['상담 양식', '온라인 상담 양식을 열 때 수집 항목·목적·보관 기간을 이 방침에 먼저 적고 동의를 받습니다.'], ['문의처', D.company.email + ' · ' + D.company.phone], ['시행일', new Date().toISOString().slice(0, 10)]];
add('privacy/', () => layout({ p: 'privacy/', title: '개인정보 처리방침 | 으뜸스타안경', desc: '으뜸스타안경 홈페이지의 개인정보 처리방침입니다.',
  body: `<div class="wrap page narrow">${crumb([['개인정보 처리방침']])}<h1>개인정보 처리방침</h1>${DEMO ? '<p class="review-note">초안 · 법률·개인정보 전문가 검토 전 · 승인 전에는 상담 양식을 열지 않습니다</p>' : ''}
${(DEMO ? [['개인정보처리자', D.company.legalName], ['수집 항목', '이름, 연락처, 상담 내용(가맹 상담 요청 시)'], ['수집·이용 목적', '가맹 상담 문의 확인과 답변'], ['보유·이용 기간', '[확인 필요]'], ['위탁·제3자 제공', '[확인 필요] (호스팅·양식 수신 서비스 확정 후)'], ['이용자의 권리', '열람·정정·삭제·처리 정지를 요청할 수 있습니다. 방법: [확인 필요]'], ['문의처', D.company.email], ['시행일', '[확인 필요]']] : PRIV_PROD).map(([h, t]) => `<h2>${h}</h2><p>${esc(t)}</p>`).join('')}</div>` }));

if (DEMO) add('preview/', () => layout({ p: 'preview/', title: '대표님 시연 순서 | 으뜸스타안경', desc: '11월 5일 대표님 시연용 화면 순서',
  body: `<div class="wrap page narrow"><h1>대표님 시연 순서 (1분)</h1><ol class="demo-steps">
<li><a href="${href('')}">손님 첫 화면</a><span>안경을 고민하는 손님에게 먼저 말을 겁니다.</span></li>
<li><a href="${href('stores/')}">지점 찾기</a><span>가까운 으뜸스타안경을 찾습니다.</span></li>
<li><a href="${href('stores/dongnae/')}">동래본점 상세</a><span>지점마다 따로 공식 정보가 있습니다.</span></li>
<li><a href="${href('franchise/')}">가맹 첫 화면</a><span>원장님은 별도 공간에서 조건과 기록을 봅니다.</span></li>
<li><a href="${href('franchise/contact/')}">대표 상담</a><span>원장님이 대표님께 바로 연락합니다.</span></li>
<li><a href="${href('guide/articles/first-progressive/')}">칼럼 (덤)</a><span>홈페이지는 글이 쌓일수록 힘이 붙습니다.</span></li></ol></div>` }));

add('404/', () => layout({ p: '404/', title: '페이지를 찾을 수 없습니다 | 으뜸스타안경', desc: '요청한 페이지가 없습니다.',
  body: `<div class="wrap page narrow"><h1>찾는 페이지가 없습니다</h1><p>주소가 바뀌었을 수 있습니다.</p><a class="btn btn-main" href="${href('stores/')}">지점 찾기로 가기</a></div>` }));

// ---------- 쓰기 ----------
fs.rmSync(OUT, { recursive: true, force: true });
for (const { p, html } of pages) {
  const f = p === '404/' ? path.join(OUT, '404.html') : path.join(OUT, p, 'index.html');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src/site.css'), path.join(OUT, 'assets/site.css'));
fs.copyFileSync(path.join(ROOT, 'src/site.js'), path.join(OUT, 'assets/site.js'));
const BOTS = ['Googlebot', 'Yeti', 'GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'];
fs.writeFileSync(path.join(OUT, 'robots.txt'), DEMO ? 'User-agent: *\nDisallow: /\n' : `${BOTS.map((b) => `User-agent: ${b}\nAllow: /\n`).join('\n')}\nUser-agent: *\nAllow: /\n\nSitemap: ${D.site.canonicalOrigin}/sitemap.xml\n`);
// 예약 공개 장부: 고정 페이지 + 모든 칼럼(publishAt) → _worker.js 가 sitemap·rss·404 판단에 사용
const BUILT = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
const articleEntries = [
  ...COLS.map((c) => ({ slug: c.slug, path: '/guide/articles/' + c.slug + '/', publishAt: c.publishAt, title: c.title, audience: c.audience, description: c.summary, source: c.file, ...(c.test ? { noindex: true } : {}) })),
  ...pubArticles(D.consumerArticles).map((a) => ({ slug: a.slug, path: '/guide/articles/' + a.slug + '/', publishAt: pubAt(a), title: a.title, audience: '손님', description: a.summary, source: 'site.json' })),
  ...pubArticles(D.franchiseArticles).map((a) => ({ slug: a.slug, path: '/franchise/insights/' + a.slug + '/', publishAt: pubAt(a), title: a.title, audience: '원장님', description: a.summary, source: 'site.json' }))
].filter((a) => a.publishAt).sort((x, y) => Date.parse(y.publishAt) - Date.parse(x.publishAt));
const articlePaths = new Set(articleEntries.map((a) => a.path));
const manifest = { origin: D.site.canonicalOrigin, builtAt: new Date().toISOString(), mode: MODE,
  static: pages.filter((x) => x.p !== '404/' && x.p !== 'preview/' && !noindexPages.has(x.p) && !articlePaths.has('/' + x.p)).map((x) => ({ path: '/' + x.p, lastmod: BUILT })),
  articles: articleEntries };
fs.writeFileSync(path.join(OUT, 'publish-manifest.json'), JSON.stringify(manifest, null, 1));
if (!DEMO) {
  fs.copyFileSync(path.join(ROOT, 'src/_worker.js'), path.join(OUT, '_worker.js'));
  // 예비 sitemap (워커가 /sitemap.xml 을 그때그때 새로 만들어 이 파일을 대신함) — 빌드 시점에 이미 공개된 글만
  const nowMs = Date.now();
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...manifest.static, ...articleEntries.filter((a) => !a.noindex && Date.parse(a.publishAt) <= nowMs).map((a) => ({ path: a.path, lastmod: a.publishAt }))].map((x) => `<url><loc>${D.site.canonicalOrigin}${x.path}</loc><lastmod>${x.lastmod}</lastmod></url>`).join('')}</urlset>\n`);
}

// ---------- 검증 ----------
const report = [];
const BAN = ['어르신', '노인', '처방', '진단', '치료', '최저가', '1위', '만족도 100', '리뷰 작성 시', '무조건 적응', '완벽 적응', '평생 무료', '무상 교환', '무료 재조정', '안질환', '가격이 합리', '합리적인 가격', '가격은 합리'];
for (const { p, html } of pages) {
  const main = (html.match(/<main[\s\S]*<\/main>/) || [''])[0].replace(/<[^>]+>/g, ' ');
  for (const w of BAN) if (main.includes(w)) report.push(`✗ 금지어 「${w}」 — /${p}`);
  if (/보장/.test(main.replace(/보장하지 않|약속하지 않/g, ''))) report.push(`? 「보장」 확인 — /${p}`);
  if (p === 'stores/gyobang/' && main.includes('부산')) report.push('✗ 교방 본문에 「부산」');
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) report.push(`✗ H1 개수 — /${p}`);
  if (!/<title>[^<]+<\/title>/.test(html)) report.push(`✗ title 없음 — /${p}`);
  if (/href=""/.test(html) || /href="tel:"/.test(html)) report.push(`✗ 빈 링크 — /${p}`);
  if (DEMO) {
    const base = path.dirname(p === '404/' ? path.join(OUT, '404.html') : path.join(OUT, p, 'index.html'));
    for (const m of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) {
      if (!fs.existsSync(path.resolve(base, m[1]))) report.push(`✗ 깨진 링크 ${m[1]} — /${p}`);
    }
  }
  if (!DEMO) {
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#:]*)"/g)) {
      if (m[1] === '/rss.xml' || m[1] === '/sitemap.xml') continue; // 워커가 만듦
      const t = m[1].endsWith('/') ? path.join(OUT, m[1], 'index.html') : path.join(OUT, m[1]);
      if (!fs.existsSync(t)) report.push(`✗ 깨진 링크 ${m[1]} — /${p}`);
    }
  }
  if (p.startsWith('stores/') && p !== 'stores/') {
    const s = stores.find((x) => p === 'stores/' + x.slug + '/');
    if (s && s.slug !== 'dongnae' && main.includes('26년') && s.experience !== '안경사 경력 26년') report.push(`✗ 26년 복제 — /${p}`);
  }
}
for (const e of D.evidence) if (e.approved && !(e.storeCount && e.period && e.basis)) report.push(`✗ 숫자 기준 누락 ${e.id}`);
// --- 2차 보강 검사 ---
const SLUGS = ['dongnae', 'hakjang', 'dusil', 'bugok', 'deokcheon', 'hwamyeong', 'yeonsan-togok', 'jwadong', 'banyeo', 'centum', 'motgol', 'gyobang'];
const ss = D.stores.map((x) => x.slug);
if (new Set(ss).size !== ss.length || SLUGS.some((x) => !ss.includes(x)) || ss.length !== 12) report.push('✗ 지점 slug 중복·누락');
const COUPON = ['dongnae', 'hakjang', 'yeonsan-togok', 'dusil', 'deokcheon', 'centum', 'gyobang'];
if ([...D.benefits[0].stores].sort().join() !== [...COUPON].sort().join()) report.push('✗ 쿠폰 적용 지점이 확정 7곳과 다름');
const sentences = (t) => String(t).split(/(?<=[.?!])\s+/).filter((x) => x.trim()).length;
for (const [list, base] of [[D.consumerArticles, 'guide/articles/'], [D.franchiseArticles, 'franchise/insights/']]) {
  const sl = list.map((a) => a.slug); if (new Set(sl).size !== sl.length) report.push(`✗ 칼럼 slug 중복 — ${base}`);
  for (const a of list.filter((x) => x.status === 'published')) {
    const n = (a.sections || []).length; if (n < 4 || n > 7) report.push(`✗ 소제목 ${n}개(4~7) — ${a.slug}`);
    if (sentences(a.summary) !== 2) report.push(`✗ 요약 문장 ${sentences(a.summary)}개(2) — ${a.slug}`);
    const c = (a.checklist || []).length; if (c < 5 || c > 7) report.push(`✗ 체크리스트 ${c}개 — ${a.slug}`);
    for (const r of a.related || []) { const t = list.find((x) => x.slug === r); if (!t || t.status !== 'published') report.push(`✗ 관련 글 연결 오류 ${a.slug} → ${r}`); }
    const pg = pages.find((x) => x.p === base + a.slug + '/'); if (!DEMO && pg && !pg.html.includes(`class="byline">${AUTHOR}`)) report.push(`✗ 작성자 표기 — ${a.slug}`);
  }
}
const okTel = new Set([D.company.phone, ...D.company.contacts.map((c) => c.phone), ...D.stores.map((x) => x.phone)].filter(has).map((x) => x.replace(/[^0-9]/g, '')));
const canon = new Map();
for (const { p, html } of pages) {
  for (const m of html.matchAll(/href="tel:([0-9]+)"/g)) if (!okTel.has(m[1])) report.push(`✗ 확인 안 된 전화 ${m[1]} — /${p}`);
  const main = (html.match(/<main[\s\S]*<\/main>/) || [''])[0];
  for (const e of D.evidence.filter((x) => !x.approved)) if (main.includes(e.value)) report.push(`✗ 보류 숫자 ${e.value} 노출 — /${p}`);
  if (/booking\.naver\.com/.test(html) && !D.stores.some((x) => has(x.reserveUrl) && html.includes(x.reserveUrl))) report.push(`✗ 확인 안 된 예약 링크 — /${p}`);
  const c = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1]; if (canon.has(c)) report.push(`✗ canonical 중복 ${c}`); canon.set(c, p);
}
if (!DEMO) { const sm = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8'); for (const p of noindexPages) if (sm.includes(`/${p}<`)) report.push(`✗ noindex 페이지가 sitemap에 — /${p}`); }
const hw = pages.find((x) => x.p === 'stores/hwamyeong/'); if (hw && !DEMO && (!hw.html.includes('noindex,follow') || /"@type":"Optician"/.test(hw.html))) report.push('✗ 화명점 noindex·구조화 데이터 처리');
// --- 예약 공개 검사 ---
const svcN = (pages.find((x) => x.p === 'services/').html.match(/class="svc-sec"/g) || []).length;
const homeN = +((pages.find((x) => x.p === '').html.match(/서비스 안내 (\d+)가지/) || [])[1] || 0);
if (svcN !== homeN) report.push(`✗ 홈 「서비스 ${homeN}가지」 ≠ 서비스 안내 실제 항목 ${svcN}개`);
for (const { p, html } of pages) for (const m of html.matchAll(/<li class="art-card"(?![^>]*data-publish)[^>]*><a href/g)) report.push(`✗ data-publish 없는 칼럼 목록 항목 — /${p}`);
for (const c of COLS) {
  const pg = pages.find((x) => x.p === 'guide/articles/' + c.slug + '/');
  if (!pg || !pg.html.includes('"datePublished":"' + c.publishAt + '"') || !pg.html.includes('"@type":"FAQPage"') || !pg.html.includes('"@type":"BreadcrumbList"')) report.push(`✗ 칼럼 구조화 데이터 누락 — ${c.slug}`);
}
for (const x of D.stores.filter((y) => !confirmedStore(y))) for (const { p, html } of pages) {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) if (m[1].includes('/stores/' + x.slug + '/')) report.push(`✗ 확인 중 지점(${x.short})이 구조화 데이터에 — /${p}`);
}
const held = D.evidence.filter((e) => !e.approved).map((e) => `${e.value} ${e.metric}(${e.basis})`);
const out = [`# QA_REPORT (${MODE}) — ${new Date().toISOString().slice(0, 10)}`, `페이지 ${pages.length}개 생성`, report.length ? report.join('\n') : '✓ 금지어·H1·title·빈 링크·깨진 링크·교방 지역·26년 복제·숫자 기준·지점 slug·쿠폰 7곳·칼럼 형식·관련 글·작성자·전화·예약 링크·canonical·sitemap·화명 처리 검사 통과', '', '## 보류한 숫자', ...held.map((h) => '- ' + h), '', '## 화면 검사', '- 모바일 390px 캡처는 Playwright로 따로 실행(이 스크립트는 코드 검사만)'];
fs.writeFileSync(path.join(ROOT, 'QA_REPORT.md'), out.join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, 'DATA_MISSING.md'), `# DATA_MISSING — 원장님·본사 확인이 필요한 빈칸 (${missing.size}개)\n\n${[...missing].map((m) => '- [ ] ' + m).join('\n')}\n\n## 공통\n- [ ] 화명점: 현재 소속·주소·전화 확인 (확인 전 noindex · 구조화 데이터 없음)\n- [ ] 못골점: 주소·전화\n- [ ] 네이버 예약 URL 9곳 (스마트플레이스 → 예약 → 「예약 URL 복사」 · 지어내지 않음)\n- [ ] 동래·두실·부곡·덕천·연산토곡·좌동·못골 플레이스 공유 주소\n- [ ] 카카오맵·구글 지도 주소 (11/7 세팅 후)\n- [ ] 쉬는 날 12곳 · 주차 6곳\n- [ ] 실제 매장 사진 (지점이 올린 사진 · 재사용 동의) → assets/images/stores/<slug>-1~3.jpg\n- [ ] 가맹 인터뷰 (이름·원문·사진 동의)\n- [ ] +122% 비교 기준\n- [ ] 칼럼 일러스트 24장 (사람·매장 재현 없는 그림)\n`);
console.log(out.slice(0, 3).join('\n'));
const ldCount = pages.reduce((n, x) => n + (x.html.match(/application\/ld\+json/g) || []).length, 0);
const future = articleEntries.filter((a) => Date.parse(a.publishAt) > Date.now());
console.log(`구조화 데이터(JSON-LD) ${ldCount}개 · 예약 칼럼 ${COLS.length}편 (아직 숨김 ${future.length}편${future.length ? ': ' + future.map((a) => a.slug + ' ' + a.publishAt).join(', ') : ''})`);
if (process.argv.includes('--validate') && report.some((r) => r.startsWith('✗'))) { report.filter((r) => r.startsWith('✗')).forEach((r) => console.log(r)); process.exit(1); }
if (process.argv.includes('--week')) console.log(`\n✓ dist 폴더 완성 (${OUT})
1. Cloudflare 대시보드(dash.cloudflare.com)에 로그인 → 왼쪽 「Workers 및 Pages」 → topstar52 프로젝트를 누릅니다.
2. 「새 배포 만들기」(Create deployment)를 누르고, 컴퓨터의 dist 폴더를 통째로 화면에 끌어다 놓습니다.
3. 「배포 저장」을 누르면 끝 — 예약한 글은 정해진 시각(평일 아침 7시)에 저절로 열립니다.`);
