// 으뜸스타안경 topstar52.co.kr — Cloudflare Pages 고급 모드 워커 (평일 07:00 예약 공개)
// build.mjs 가 dist/_worker.js 로 복사한다. 고칠 곳은 src/_worker.js.
// 1) publishAt 이 아직 안 된 칼럼 주소 → 404
// 2) HTML 안의 data-publish 가 미래인 요소(목록 항목 등) → 지움
// 3) /sitemap.xml · /rss.xml → publish-manifest.json 으로 그때그때 생성
// 4) 그 밖 → 정적 파일 그대로 (HTML 은 Cache-Control: public, max-age=300)

const MANIFEST = '/publish-manifest.json';
const HIDDEN = new Set([MANIFEST, '/_worker.js']);
let cached = null;
let cachedAt = 0;

async function loadManifest(env, url) {
  if (cached && Date.now() - cachedAt < 60_000) return cached;
  const r = await env.ASSETS.fetch(new Request(new URL(MANIFEST, url).toString()));
  if (!r.ok) throw new Error('manifest ' + r.status);
  cached = await r.json();
  cachedAt = Date.now();
  return cached;
}

const isOpen = (publishAt, now) => {
  const t = Date.parse(publishAt);
  return Number.isNaN(t) || t <= now; // 요청 시각(UTC ms)과 비교
};

function normPath(p) {
  let x = p.replace(/\/index\.html$/, '/');
  if (!x.endsWith('/') && !/\.[a-z0-9]+$/i.test(x)) x += '/';
  return x;
}

const xmlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function sitemap(m, now) {
  const items = [
    ...m.static.map((s) => ({ loc: m.origin + s.path, lastmod: s.lastmod })),
    ...m.articles.filter((a) => !a.noindex && isOpen(a.publishAt, now)).map((a) => ({ loc: m.origin + a.path, lastmod: a.publishAt }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.map((i) => `<url><loc>${xmlEsc(i.loc)}</loc><lastmod>${xmlEsc(i.lastmod)}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

function rss(m, now) {
  const items = m.articles.filter((a) => !a.noindex && isOpen(a.publishAt, now))
    .sort((x, y) => Date.parse(y.publishAt) - Date.parse(x.publishAt)).slice(0, 50);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n<title>으뜸스타 안경 이야기</title><link>${m.origin}/guide/</link><description>으뜸스타안경 본사가 쓰는 안경 이야기와 원장님 운영 이야기</description><language>ko-KR</language>\n${items.map((a) => `<item><title>${xmlEsc(a.title)}</title><link>${xmlEsc(m.origin + a.path)}</link><guid isPermaLink="true">${xmlEsc(m.origin + a.path)}</guid><pubDate>${new Date(a.publishAt).toUTCString()}</pubDate><description>${xmlEsc(a.description)}</description><category>${xmlEsc(a.audience)}</category></item>`).join('\n')}\n</channel></rss>\n`;
}

async function notFound(env, url) {
  let body = '<!doctype html><meta charset="utf-8"><title>페이지를 찾을 수 없습니다 | 으뜸스타안경</title><p>찾는 페이지가 없습니다. <a href="/stores/">지점 찾기로 가기</a></p>';
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/__not-found__/', url).toString()));
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('text/html')) body = await r.text();
  } catch (e) { /* 기본 문구 사용 */ }
  return new Response(body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-robots-tag': 'noindex' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const now = Date.now();
    const path = normPath(url.pathname);

    if (HIDDEN.has(url.pathname)) return notFound(env, url);

    let m = null;
    try { m = await loadManifest(env, url); } catch (e) { m = null; }

    if (m && (url.pathname === '/sitemap.xml' || url.pathname === '/rss.xml')) {
      const isMap = url.pathname === '/sitemap.xml';
      return new Response(isMap ? sitemap(m, now) : rss(m, now), {
        headers: { 'content-type': isMap ? 'application/xml; charset=utf-8' : 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' }
      });
    }

    if (m) {
      const art = m.articles.find((a) => a.path === path);
      if (art && !isOpen(art.publishAt, now)) return notFound(env, url);
    }

    const res = await env.ASSETS.fetch(request);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return res;

    const out = new Response(res.body, res);
    out.headers.set('cache-control', 'public, max-age=300');
    return new HTMLRewriter()
      .on('[data-publish]', {
        element(el) {
          if (!isOpen(el.getAttribute('data-publish'), now)) el.remove();
        }
      })
      .transform(out);
  }
};
