// 브라우저 렌더링 검증 — Playwright. node tests/screenshot.mjs
import { chromium } from 'playwright';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:4476/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: 'tests/shot-1-input.png' });

// 입력: 이름, 1992-07-08, 시간모름 해제하고 09:30
await page.fill('#in-name', '홍길동');
await page.selectOption('#in-year', '1992');
await page.selectOption('#in-month', '7');
await page.selectOption('#in-day', '8');
await page.selectOption('#in-hour', '9');
await page.selectOption('#in-min', '30');
await page.screenshot({ path: 'tests/shot-2-filled.png' });

await page.click('#btn-submit');
await page.waitForTimeout(900);
await page.screenshot({ path: 'tests/shot-3-result-top.png' });

// 결과 전체 길이 + 풀이까지 스크롤 스크린샷
await page.evaluate(() => window.scrollTo(0, 1100));
await page.waitForTimeout(300);
await page.screenshot({ path: 'tests/shot-4-result-mid.png' });

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(300);
await page.screenshot({ path: 'tests/shot-5-result-bottom.png' });

// 풀스크린샷
await page.screenshot({ path: 'tests/shot-6-full.png', fullPage: true });

const typeText = await page.textContent('.result-type').catch(() => '(없음)');
const pillarCount = await page.$$eval('.pcol', (els) => els.length).catch(() => 0);
console.log('결과 유형:', typeText.trim());
console.log('기둥 컬럼 수:', pillarCount);
console.log('콘솔 에러:', errors.length ? errors : '없음');

await b.close();
