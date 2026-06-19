// 신규 기능 검증 — 맨위로 버튼 / 잘 맞는 사주 / 부족한 기운 자세히보기.
// node tests/verify-features.mjs   (server.js 가 4476에 떠 있어야 함)
import { chromium } from 'playwright';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const ok = (cond, msg) => console.log(`${cond ? '✓' : '✗ 실패'} ${msg}`);

await page.goto('http://localhost:4476/', { waitUntil: 'networkidle' });
await page.fill('#in-name', '홍길동');
await page.selectOption('#in-year', '1992');
await page.selectOption('#in-month', '7');
await page.selectOption('#in-day', '8');
await page.selectOption('#in-hour', '9');
await page.selectOption('#in-min', '30');
await page.click('#btn-submit');
await page.waitForTimeout(900);

// 1) 잘 맞는 사주 카드
const compatHap = await page.$('.compat-hap');
const compatRows = await page.$$eval('.compat-row', (e) => e.length).catch(() => 0);
const hapText = await page.textContent('.compat-hap-text').catch(() => '');
ok(!!compatHap, '잘 맞는 사주: 천간합 블록 존재');
ok(compatRows >= 1, `잘 맞는 사주: 보완 오행 ${compatRows}행 렌더`);
console.log('   천간합 문구:', hapText.trim());

// 2) 부족한 기운 — 뜻(항상) + 자세히 보기(접힘)
const meaning = await page.$$eval('.el-meaning', (e) => e.length).catch(() => 0);
const more = await page.$$('.el-more');
const firstOpen = more.length ? await more[0].evaluate((el) => el.hasAttribute('open')) : null;
ok(meaning >= 1, `부족한 기운: 뜻 줄 ${meaning}개 노출`);
ok(more.length >= 1 && firstOpen === false, `부족한 기운: '자세히 보기' ${more.length}개, 기본 접힘`);
// 펼치기 동작 — summary(좁은 인라인) 를 직접 탭
if (more.length) {
  await page.click('.el-more > summary');
  await page.waitForTimeout(150);
  const opened = await more[0].evaluate((el) => el.hasAttribute('open'));
  ok(opened, "부족한 기운: '자세히 보기' 탭하면 펼쳐짐");
}

// 3) 맨 위로 버튼 — 스크롤 시 노출 + 클릭 시 최상단
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(400);
const vis = await page.$eval('#to-top', (el) => {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { display: s.display, opacity: +s.opacity, hasShow: el.classList.contains('show'),
    inView: r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1, right: Math.round(window.innerWidth - r.right), bottom: Math.round(window.innerHeight - r.bottom) };
});
ok(vis.display !== 'none', `맨 위로: display=${vis.display} (none 아님)`);
ok(vis.hasShow && vis.opacity > 0.9, `맨 위로: 스크롤 후 노출(opacity=${vis.opacity})`);
ok(vis.inView, `맨 위로: 우하단 화면 안 (right ${vis.right}px, bottom ${vis.bottom}px)`);
await page.screenshot({ path: 'tests/verify-totop-visible.png' });
await page.click('#to-top');
// 부드러운 스크롤(behavior:smooth) 완료까지 폴링 (최대 ~2.5s)
let y = 9999;
for (let i = 0; i < 25; i++) {
  y = await page.evaluate(() => window.scrollY);
  if (y < 10) break;
  await page.waitForTimeout(100);
}
ok(y < 10, `맨 위로: 클릭 시 최상단 복귀 (scrollY=${y})`);
await page.waitForTimeout(200);
const afterHide = await page.$eval('#to-top', (el) => el.classList.contains('show'));
ok(!afterHide, '맨 위로: 최상단에서 다시 숨김');

await page.screenshot({ path: 'tests/verify-full.png', fullPage: true });
console.log('콘솔 에러:', errors.length ? errors : '없음');
await b.close();
