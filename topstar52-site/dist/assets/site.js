// 메뉴 · 지점 필터 · 칼럼 주제 필터 · 시연용 양식 (외부 전송 없음)
(function () {
  var mb = document.querySelector('.menu-btn'), gnb = document.getElementById('gnb');
  if (mb && gnb) mb.addEventListener('click', function () { var o = gnb.classList.toggle('is-open'); mb.setAttribute('aria-expanded', o); });

  function chips(attr, listSel, extra) {
    var list = document.querySelector(listSel); if (!list) return;
    var cs = document.querySelectorAll('.chip[data-' + attr + ']'), val = '';
    function run() {
      var q = extra ? extra.value.trim() : '', shown = 0;
      list.querySelectorAll('li').forEach(function (li) {
        var ok = (!val || li.getAttribute('data-' + attr) === val) && (!q || (li.getAttribute('data-name') || li.textContent).indexOf(q) > -1);
        li.hidden = !ok; if (ok) shown++;
      });
      var e = document.getElementById('store-empty'); if (e) e.hidden = shown > 0;
    }
    cs.forEach(function (c) { c.addEventListener('click', function () { cs.forEach(function (x) { x.classList.remove('is-on'); }); c.classList.add('is-on'); val = c.getAttribute('data-' + attr); run(); }); });
    if (extra) extra.addEventListener('input', run);
  }
  chips('area', '#store-list', document.getElementById('store-q'));
  chips('cat', '#art-list');

  var f = document.getElementById('fr-form');
  if (f) f.addEventListener('submit', function (e) { e.preventDefault(); });

  // GA4: 측정 ID가 연결된 경우에만 기록 (전화번호·이름·상담 내용은 보내지 않음)
  document.addEventListener('click', function (e) {
    if (typeof window.gtag !== 'function') return;
    var a = e.target.closest && e.target.closest('a'); if (!a) return;
    var h = a.getAttribute('href') || '', m = '';
    if (h.indexOf('tel:') === 0) m = 'phone';
    else if (h.indexOf('pf.kakao.com') > -1) m = 'kakao';
    else if (h.indexOf('booking.naver.com') > -1) m = 'naver_booking';
    else if (/naver\.me|map\.naver\.com|place\.naver\.com/.test(h)) m = 'naver_place';
    else if (/map\.kakao\.com|kko\.to|google\.[a-z.]+\/maps|maps\.app\.goo\.gl/.test(h)) m = 'map';
    if (!m) return;
    var st = (location.pathname.match(/\/stores\/([a-z-]+)\//) || [])[1] || '';
    window.gtag('event', 'contact_click', { method: m, page_path: location.pathname, store_slug: st, audience: location.pathname.indexOf('/franchise') === 0 ? 'franchise' : 'consumer' });
  });
})();

// 스타루봇 — 규칙 기반 길 안내 (자유 대화·개인정보 수집 없음 · 공식 지점 데이터만)
(function () {
  var D = window.SB; var box = document.getElementById('sb'); if (!D || !box) return;
  var body = document.getElementById('sb-body'), hist = [], area = '';
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x) e.textContent = x; return e; }
  function say(t) { body.appendChild(el('p', 'sb-msg', t)); }
  function opts(list) { var w = el('div', 'sb-opts'); list.forEach(function (o) { var b; if (o.u) { b = el('a', 'sb-opt', o.l); b.href = o.u; } else { b = el('button', 'sb-opt', o.l); b.type = 'button'; b.onclick = function () { go(o.s, o.v); }; } w.appendChild(b); }); body.appendChild(w); var f = w.querySelector('.sb-opt'); if (f) f.focus(); }
  var S = {
    start: function () { say('안녕하세요! 스타루가 안내해 드릴게요. 무엇을 도와드릴까요?'); opts([{ l: '가까운 지점을 찾고 싶어요', s: 'area' }, { l: '안경 서비스를 알아보고 싶어요', s: 'svc' }, { l: '예약·상담하고 싶어요', s: 'area', v: 'r' }, { l: '구매 후 A/S가 궁금해요', s: 'care' }, { l: '카톡으로 바로 상담할래요', s: 'kakao' }, { l: '안경원 원장님이에요 (가맹)', s: 'fr' }]); },
    kakao: function () { say('상담할 곳을 골라 주세요. 카카오톡 채널로 바로 연결돼요.'); opts((D.kakao || []).map(function (k) { return { l: k.n + ' 카톡 상담', u: k.u }; }).concat([{ l: '다른 지점은 전화로', s: 'area' }])); },
    area: function () { say('어느 지역이 편하세요?'); opts([{ l: '부산', s: 'list', v: '부산' }, { l: '경남', s: 'list', v: '경남' }, { l: '전체 보기', s: 'list', v: '' }]); },
    list: function (v) { area = v; var L = D.stores.filter(function (x) { return !v || x.a === v; }); say(L.length + '곳이 있어요. 지점을 누르면 주소·전화를 볼 수 있어요.'); opts(L.map(function (x) { return { l: x.n + (x.d ? ' · ' + x.d.replace(/^부산 |^경남 /, '') : ' · 정보 확인 중'), u: x.u }; })); },
    svc: function () { say('찾으시는 서비스를 골라 주세요. 지점마다 갖춘 것이 다를 수 있어요.'); opts([{ l: '안경테·렌즈', u: D.links.services + '#frames' }, { l: '노안·다초점', u: D.links.prog }, { l: '콘택트렌즈', u: D.links.services + '#contact' }, { l: '선글라스·기능성 렌즈', u: D.links.services + '#sun' }, { l: '학생 안경', u: D.links.services + '#student' }, { l: '진행 중인 혜택', u: D.links.benefits }]); },
    care: function () { say('쓰던 안경이 불편하시군요. 맞추신 지점에 안경을 가져가 보여 주세요. 조정·수리 가능 여부는 지점에서 안내해 드려요.'); opts([{ l: '피팅·A/S 안내 보기', u: D.links.care }, { l: '지점 찾기', s: 'area' }]); },
    fr: function () { say('원장님, 가맹 안내로 모실게요. 조건·운영 사례를 보고 대표에게 바로 문의하실 수 있어요.'); opts([{ l: '가맹 안내 보기', u: D.links.fr }, { l: '대표 상담', u: D.links.frc }]); }
  };
  function go(s, v) { hist.push([s, v]); body.innerHTML = ''; S[s](v); }
  function open() { box.hidden = false; if (!hist.length) go('start'); }
  document.querySelectorAll('[data-sb-open]').forEach(function (b) { b.addEventListener('click', open); });
  document.querySelector('[data-sb-close]').addEventListener('click', function () { box.hidden = true; });
  document.getElementById('sb-reset').addEventListener('click', function () { hist = []; go('start'); });
  document.getElementById('sb-back').addEventListener('click', function () { if (hist.length > 1) { hist.pop(); var p = hist.pop(); go(p[0], p[1]); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') box.hidden = true; });
  if (location.search.indexOf('sb=1') > -1) open();
})();
