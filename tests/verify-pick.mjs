import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4476';
const browser = await chromium.launch();
const out = [];
const rec = (n, ok, note='') => { out.push(ok); console.log(`${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`); };

// ① 기기별 — 버튼이 항상 화면 안에 있는가
for (const name of ['iPhone 13', 'iPhone SE', 'Pixel 7', 'Galaxy S9+']) {
  const ctx = await browser.newContext({ ...devices[name] });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/tarot`);
  await page.waitForSelector('.t-topic:visible');
  await page.locator('.t-topic').first().click();
  await page.waitForSelector('.t-card.active');
  await page.waitForTimeout(350);
  const g = await page.evaluate(() => {
    const b = document.querySelector('#t-pick').getBoundingClientRect();
    return { vh: innerHeight, top: Math.round(b.top), bottom: Math.round(b.bottom) };
  });
  const cut = g.bottom - g.vh;
  rec(`① [${name}] 버튼이 화면 안 (뷰포트 ${g.vh}, 버튼 ${g.top}~${g.bottom})`, cut <= 0 && g.top >= 0, cut > 0 ? `${cut}px 잘림` : `여유 ${-cut}px`);
  // 스크롤을 끝까지 내려도 여전히 보이는가
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const g2 = await page.evaluate(() => { const b = document.querySelector('#t-pick').getBoundingClientRect(); return { vh: innerHeight, top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
  rec(`  └ 맨 아래로 스크롤해도 보임`, g2.bottom <= g2.vh && g2.top >= 0, `버튼 ${g2.top}~${g2.bottom}`);
  await ctx.close();
}

const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const touchOf = async () => {
  const cdp = await ctx.newCDPSession(page);
  return (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
};
const fresh = async () => {
  await page.goto(`${BASE}/#/tarot`);
  await page.reload();
  await page.waitForSelector('.t-topic:visible');
  await page.locator('.t-topic').first().click();
  await page.waitForSelector('.t-card.active');
  await page.waitForTimeout(350);
};
const filled = () => page.locator('.t-slot.filled').count();

// ② 가운데 카드 탭 — 손가락 흔들림별
for (const jitter of [0, 4, 8, 10, 14]) {
  await fresh();
  const card = await page.locator('.t-card.active').boundingBox();
  const touch = await touchOf();
  const x = card.x + card.width / 2, y = card.y + card.height / 2;
  await touch('touchStart', x, y);
  if (jitter) await touch('touchMove', x + jitter, y);
  await touch('touchEnd', x + jitter, y);
  await page.waitForTimeout(700);
  rec(`② 가운데 카드 탭 (흔들림 ${jitter}px)`, (await filled()) === 1, `채워진 슬롯=${await filled()}`);
}

// ③ 크게 민 경우는 여전히 '넘김'이어야 한다 (탭으로 오인 금지)
await fresh();
{
  const card = await page.locator('.t-card.active').boundingBox();
  const touch = await touchOf();
  const x = card.x + card.width / 2, y = card.y + card.height / 2;
  await touch('touchStart', x, y);
  for (let i = 1; i <= 6; i++) await touch('touchMove', x - i * 14, y);
  await touch('touchEnd', x - 84, y);
  await page.waitForTimeout(600);
  rec('③ 크게 밀면 뽑히지 않고 넘어가기만', (await filled()) === 0, `채워진 슬롯=${await filled()}`);
}

// ④ 누른 즉시 슬롯이 차는가 (0.15초 안)
await fresh();
await page.locator('#t-pick').tap();
await page.waitForTimeout(150);
rec('④ 누른 즉시(150ms) 슬롯 채워짐', (await filled()) === 1, `채워진 슬롯=${await filled()}`);

// ⑤ 연타해도 한 장만 (잔상 날아가는 중 재탭)
await fresh();
await page.locator('#t-pick').tap();
await page.waitForTimeout(60);
await page.locator('#t-pick').tap();
await page.waitForTimeout(60);
await page.locator('#t-pick').tap();
await page.waitForTimeout(900);
rec('⑤ 0.06초 간격 3연타 → 한 장만 뽑힘', (await filled()) === 1, `채워진 슬롯=${await filled()}`);

// ⑥ 정상 속도로 3장 → 결과 화면까지
await fresh();
for (let i = 0; i < 3; i++) { await page.locator('#t-pick').tap(); await page.waitForTimeout(600); }
await page.waitForTimeout(1600);
const onResult = await page.locator('#view-tarot-result:visible').count();
rec('⑥ 3장 뽑기 → 결과 화면 진입', onResult === 1, `결과 화면=${onResult}`);

await browser.close();
console.log(`\n${out.filter(Boolean).length}/${out.length} PASS`);
process.exit(out.every(Boolean) ? 0 : 1);
