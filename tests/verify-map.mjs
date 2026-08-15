// 귀인 지도 · 생년월일 유형 · 약관 UI 검증 (Playwright).
// 서버가 http://localhost:4476 에 떠 있어야 한다: node server.js
// 실행: node tests/verify-map.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:4476';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(`✗ ${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `기대 ${JSON.stringify(want)} / 실제 ${JSON.stringify(got)}`);
}

const browser = await chromium.launch();
const errors = [];

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return page;
}

/** 지도 화면에서 현재 링크를 만든다(앱과 같은 방식으로 조립). */
const mapLink = (page, withGuest) => page.evaluate((g) => {
  const s = window.__gwiinmap.state;
  const q = new URLSearchParams(g ? { h: s.hostEnc, g: s.guestEnc } : { h: s.hostEnc });
  return `${location.origin}${location.pathname}#/map?${q.toString()}`;
}, withGuest);

// ── 1) 메뉴에 귀인 지도가 있다 ─────────────────────────────
{
  console.log('\n[1] 메뉴');
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  eq('메뉴 타일 3개', await page.locator('.menu-tile').count(), 3);
  eq('타일 라벨', await page.locator('.menu-tile .mt-name').allTextContents(), ['사주', '타로', '귀인 지도']);
  ok('푸터 노출', await page.isVisible('.site-foot'));
  await page.context().close();
}

// ── 2) 생년월일 유형 카드 (사주 결과) ──────────────────────
{
  console.log('\n[2] 생년월일 유형');
  const page = await newPage();
  await page.goto(`${BASE}/#/saju`, { waitUntil: 'networkidle' });
  await page.fill('#in-name', '홍길동');
  await page.selectOption('#in-year', '1992');
  await page.selectOption('#in-month', '7');
  await page.selectOption('#in-day', '8');
  await page.click('#btn-submit');
  await page.waitForSelector('.persona-card', { timeout: 5000 });

  eq('유형 라벨', await page.textContent('.persona-label b'), '여름 화초형');
  eq('한 줄 해석', await page.textContent('.persona-tagline'), '뜨거운 날에도 쉽게 시들지 않는 사람');
  eq('기질 칩 3개', await page.locator('.persona-traits .chip').count(), 3);
  ok('계절 자리 설명', (await page.textContent('.persona-stance b')).includes('여름에 태어난 화초'));
  ok('그늘(주의) 접힘', !(await page.locator('.persona-more p').isVisible()));
  await page.click('.persona-more summary');
  await page.waitForTimeout(200);
  ok('그늘 펼침', await page.locator('.persona-more p').isVisible());

  // 용어 팝오버 — 물상론이 사전에 있어야 한다
  await page.locator('.persona-note .term[data-term="물상론"]').click();
  await page.waitForTimeout(250);
  ok('물상론 팝오버', (await page.textContent('#term-pop .tp-def')).includes('자연물에 빗대'));

  // 다른 생일은 다른 유형이 나온다 (40조합이 실제로 갈리는지)
  await page.click('#btn-restart');
  await page.waitForTimeout(300);
  await page.selectOption('#in-year', '2000');
  await page.selectOption('#in-month', '11');
  await page.selectOption('#in-day', '2');
  await page.click('#btn-submit');
  await page.waitForSelector('.persona-card', { timeout: 5000 });
  eq('다른 생일 → 다른 유형', await page.textContent('.persona-label b'), '가을 큰나무형');
  await page.context().close();
}

// ── 3) 귀인 지도 — 만들기 → 참여 → 누적 ────────────────────
{
  console.log('\n[3] 귀인 지도 전체 흐름');
  const host = await newPage();
  await host.goto(`${BASE}/#/map`, { waitUntil: 'networkidle' });
  await host.waitForSelector('#gm-host-form', { timeout: 5000 });
  eq('유형 소개 5종', await host.locator('.gm-type-chip').count(), 5);

  await host.fill('#gm-h-name', '기웅');
  await host.selectOption('#gm-h-year', '1992');
  await host.selectOption('#gm-h-month', '7');
  await host.selectOption('#gm-h-day', '8');
  await host.click('#gm-host-form .cta');
  await host.waitForSelector('.gm-tally', { timeout: 5000 });

  eq('지도 제목', await host.textContent('.gm-title'), '기웅님의 귀인 지도');
  ok('방장 유형 표시', (await host.textContent('.gm-host-card b')).includes('형'));
  ok('부족한 기운 힌트', (await host.textContent('.gm-host-hint')).includes('귀한 구성'));
  ok('처음엔 비어 있음', (await host.textContent('.gm-empty')).includes('아직 아무도 없어요'));

  const invite = await mapLink(host, false);
  ok('초대 링크에 방장 정보', invite.includes('#/map?h='));

  // 친구가 참여
  const guest = await newPage();
  await guest.goto(invite, { waitUntil: 'networkidle' });
  await guest.waitForSelector('#gm-guest-form', { timeout: 5000 });
  ok('참여 화면에 방장 이름', (await guest.textContent('.gm-title')).includes('기웅'));
  ok('참여 폼 안내', (await guest.textContent('.gm-form-title')).includes('어떤 사람일까'));

  await guest.fill('#gm-g-name', '지영');
  await guest.selectOption('#gm-g-year', '1990');
  await guest.selectOption('#gm-g-month', '3');
  await guest.selectOption('#gm-g-day', '21');
  await guest.click('#gm-guest-form .cta');
  await guest.waitForSelector('.gm-result-type', { timeout: 5000 });

  const type = (await guest.textContent('.gm-result-type')).replace(/\s+/g, ' ').trim();
  ok('관계 유형 판정', /귀인|단짝|내 사람|오른팔|호랑이 선생/.test(type), type);
  ok('판정 근거 노출', (await guest.locator('.gm-reasons li').count()) >= 1);
  ok('참여자 본인 유형도 보여 줌', await guest.isVisible('.gm-host-card.inline'));
  ok('생년월일이 링크에 담긴다는 고지', (await guest.textContent('.gm-send .gm-privacy')).includes('생년월일'));

  // 방장이 결과 링크를 열면 지도에 쌓인다
  const resultUrl = await mapLink(guest, true);
  await host.goto(resultUrl, { waitUntil: 'networkidle' });
  await host.waitForSelector('.gm-entry', { timeout: 5000 });
  eq('지도에 1명', await host.locator('.gm-entry').count(), 1);
  ok('이름 표시', (await host.textContent('.gm-entry-body b')) === '지영');
  ok('집계 반영', (await host.textContent('.gm-tally')).replace(/\s+/g, '').includes('1'));

  // 새로고침해도 남아 있다
  await host.goto(`${BASE}/#/map`, { waitUntil: 'networkidle' });
  await host.waitForSelector('.gm-entry', { timeout: 5000 });
  eq('새로고침 후에도 유지', await host.locator('.gm-entry').count(), 1);

  // 삭제
  await host.click('.gm-entry-del');
  await host.waitForTimeout(400);
  eq('삭제되면 사라짐', await host.locator('.gm-entry').count(), 0);

  // 전체 지우기 → 다시 만들기 화면
  await host.click('#gm-reset');
  await host.waitForSelector('#gm-host-form', { timeout: 5000 });
  ok('전체 지우기 후 초기 화면', await host.isVisible('#gm-host-form'));

  await guest.context().close();
  await host.context().close();
}

// ── 4) 손상된 지도 링크 방어 ───────────────────────────────
{
  console.log('\n[4] 손상 링크 방어');
  const page = await newPage();
  await page.goto(`${BASE}/#/map?h=%EA%B9%A8%EC%A7%84%EA%B0%92`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  ok('안내 메시지 노출', await page.isVisible('.gm-error'));
  eq('라우트 유지', await page.getAttribute('body', 'data-route'), 'map');
  await page.context().close();
}

// ── 5) 약관 · 개인정보처리방침 ─────────────────────────────
{
  console.log('\n[5] 약관·개인정보처리방침');
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.click('.foot-link:has-text("이용약관")');
  await page.waitForTimeout(400);
  eq('약관 라우트', await page.getAttribute('body', 'data-route'), 'terms');
  eq('약관 제목', await page.textContent('#route-terms .legal-title'), '이용약관');
  ok('면책 조항', (await page.textContent('#route-terms')).includes('전문적 판단도 대체하지 않습니다'));

  await page.click('#route-terms .legal-btn:has-text("개인정보처리방침")');
  await page.waitForTimeout(400);
  eq('개인정보 라우트', await page.getAttribute('body', 'data-route'), 'privacy');
  eq('개인정보 제목', await page.textContent('#route-privacy .legal-title'), '개인정보처리방침');
  ok('서버 미전송 고지', (await page.textContent('#route-privacy')).includes('서버로 전송되거나 저장되지 않습니다'));
  ok('공유 링크 주의', (await page.textContent('#route-privacy')).includes('주소(URL) 안에 담깁니다'));
  ok('문의 이메일', (await page.textContent('#route-privacy')).includes('kiwoong0219@gmail.com'));
  eq('표 2개', await page.locator('#route-privacy .legal-table').count(), 2);

  // 새로고침으로 직접 진입
  await page.goto(`${BASE}/#/privacy`, { waitUntil: 'networkidle' });
  ok('직접 진입 가능', await page.isVisible('#route-privacy'));
  await page.context().close();
}

// ── 결과 ───────────────────────────────────────────────────
const realErrors = errors.filter((e) => !/favicon|ERR_NETWORK_CHANGED/i.test(e));
ok('콘솔 에러 0', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n귀인 지도·유형·약관 검증: ${pass} PASS / ${fail} FAIL`);
if (fails.length) { console.log('\n' + fails.join('\n')); process.exit(1); }
