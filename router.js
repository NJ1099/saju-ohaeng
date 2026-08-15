// ============================================================
//  라우터 — 메뉴 / 사주 / 타로 세 갈래를 해시로 전환한다.
//
//  · 해시 라우팅을 쓰는 이유: 정적 호스팅(Vercel @vercel/static)이라
//    서버 리라이트 없이도 새로고침·뒤로가기가 그대로 동작한다.
//  · 라우트마다 테마가 다르다(사주=라이트 / 타로=다크). 테마는 <body>의
//    data-route 로 스코프되며, 각 라우트 안에서는 절대 뒤집히지 않는다.
//  · 기존 사주 공유 링크(?y=…&g=…)는 해시가 없다. 그 경우 메뉴를 건너뛰고
//    곧바로 사주로 보낸다 — 하위호환이 깨지면 안 된다.
// ============================================================

export const ROUTES = ['menu', 'saju', 'tarot', 'map', 'terms', 'privacy'];

const listeners = [];
let current = null;

/** 라우트 전환 시 호출될 콜백 등록. fn(to, from) */
export function onRoute(fn) { listeners.push(fn); }

export function currentRoute() { return current; }

/** 해시 문자열에서 라우트 이름을 뽑는다. 모르는 값은 menu 로 떨어진다. */
function parseHash(hash) {
  const name = String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/')[0];
  return ROUTES.includes(name) ? name : 'menu';
}

/**
 * 라우트 이동.
 * @param {string} name 'menu' | 'saju' | 'tarot'
 * @param {Object} [opts]
 * @param {boolean} [opts.replace=false] 히스토리를 남기지 않고 교체
 */
export function go(name, opts = {}) {
  const to = ROUTES.includes(name) ? name : 'menu';
  const target = `#/${to}`;
  if (location.hash !== target) {
    if (opts.replace) history.replaceState(null, '', target);
    else location.hash = target;
  }
  apply(to);
}

/** 실제 DOM 전환. 해시 변경과 직접 호출 양쪽에서 들어온다. */
function apply(to) {
  if (to === current) return;
  const from = current;
  current = to;

  for (const name of ROUTES) {
    const el = document.getElementById(`route-${name}`);
    if (el) el.hidden = name !== to;
  }
  // 테마·상단바 표시를 이 한 곳에서만 결정한다 (CSS가 data-route로 분기).
  document.body.dataset.route = to;
  window.scrollTo(0, 0);

  for (const fn of listeners) {
    try { fn(to, from); } catch (err) { console.error('[router]', err); }
  }
}

/**
 * 첫 진입 처리.
 * @param {Object} opts
 * @param {Function} opts.hasSajuParams  쿼리에 사주 공유 파라미터가 있는지
 * @param {Function} opts.hasTarotParams 쿼리에 타로 공유 파라미터가 있는지
 */
export function initRouter(opts = {}) {
  window.addEventListener('hashchange', () => apply(parseHash(location.hash)));

  // 해시가 명시돼 있으면 그대로 따른다.
  if (location.hash) { apply(parseHash(location.hash)); return; }

  // 해시가 없는 공유 링크 — 파라미터를 보고 목적지를 정한다.
  if (opts.hasTarotParams?.()) { go('tarot', { replace: true }); return; }
  if (opts.hasSajuParams?.()) { go('saju', { replace: true }); return; }

  go('menu', { replace: true });
}
