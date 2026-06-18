// 신기능 검증 — 대운/세운 렌더 + 이미지 저장. node tests/screenshot2.mjs
import { chromium } from 'playwright';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:4476/', { waitUntil: 'networkidle' });
await page.fill('#in-name', '홍길동');
await page.selectOption('#in-year', '1992');
await page.selectOption('#in-month', '7');
await page.selectOption('#in-day', '8');
await page.selectOption('#in-hour', '9');
await page.selectOption('#in-min', '30');
await page.click('#btn-submit');
await page.waitForTimeout(900);

// 대운/세운 카드까지 스크롤
const dwExists = await page.$('.daewoon') !== null;
const swCells = await page.$$eval('.sw-cell', (e) => e.length).catch(() => 0);
const dwNow = await page.$eval('.dw-cell.now .dw-age', (e) => e.textContent).catch(() => '(없음)');
const swNow = await page.$eval('.sw-cell.now .sw-year', (e) => e.textContent).catch(() => '(없음)');

await page.evaluate(() => { const el = document.querySelector('.daewoon'); if (el) el.scrollIntoView(); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'tests/shot-luck.png' });

// 이미지 저장 클릭 → 다운로드 캡처
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 6000 }).catch(() => null),
  page.click('#btn-save'),
]);
await page.waitForTimeout(500);

console.log('대운 타임라인:', dwExists ? 'O' : 'X', '| 세운 셀:', swCells, '| 현재대운:', dwNow, '| 올해세운:', swNow);
console.log('이미지 다운로드:', download ? ('O (' + download.suggestedFilename() + ')') : 'X');
console.log('콘솔 에러:', errors.length ? errors : '없음');

if (download) { await download.saveAs('tests/share-card.png'); }
await b.close();
