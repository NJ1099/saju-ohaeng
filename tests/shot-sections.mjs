// 신규 섹션 클로즈업 — 부족한 기운(자세히 보기 펼친 상태) / 잘 맞는 사주.
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:4476/', { waitUntil: 'networkidle' });
await page.fill('#in-name', '김민수');
await page.selectOption('#in-year', '1988');
await page.selectOption('#in-month', '3');
await page.selectOption('#in-day', '21');
await page.selectOption('#in-hour', '14');
await page.selectOption('#in-min', '0');
await page.click('#btn-submit');
await page.waitForTimeout(900);

// 부족한 기운 카드: 첫 자세히보기 펼친 상태로 캡처
const weakCard = page.locator('.card', { hasText: '부족한 기운, 이런 뜻이에요' });
await page.click('.el-more > summary');
await page.waitForTimeout(200);
await weakCard.screenshot({ path: 'tests/shot-weakness.png' });

// 잘 맞는 사주 카드
const compatCard = page.locator('.card', { hasText: '어떤 사주와 잘 맞을까' });
await compatCard.screenshot({ path: 'tests/shot-compat.png' });
console.log('완료: shot-weakness.png, shot-compat.png');
await b.close();
