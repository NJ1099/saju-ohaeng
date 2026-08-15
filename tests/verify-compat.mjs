// 궁합 모드 · 이론 계층 UI 검증 (Playwright).
// node tests/verify-compat.mjs   (server.js 가 4476에 떠 있어야 함)
import { chromium } from 'playwright';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`✓ ${msg}`); } else { fail++; console.log(`✗ 실패 ${msg}`); } };

await page.goto('http://localhost:4476/#/saju', { waitUntil: 'networkidle' });

// ── 1) 솔로 모드: 이론 계층 카드 ──────────────────────────
await page.fill('#in-name', '홍길동');
await page.selectOption('#in-year', '1992');
await page.selectOption('#in-month', '7');
await page.selectOption('#in-day', '8');
await page.selectOption('#in-hour', '9');
await page.selectOption('#in-min', '30');
await page.click('#btn-submit');
await page.waitForTimeout(900);

const thBlocks = await page.$$eval('.th-block', (e) => e.length).catch(() => 0);
ok(thBlocks >= 5, `이론 카드 블록 ${thBlocks}개 (격국·용신·조후·통근·십이운성 등)`);
const usCells = await page.$$eval('.us-cell', (e) => e.length).catch(() => 0);
ok(usCells >= 3, `십이운성 셀 ${usCells}개`);
const gyeok = await page.textContent('.th-block .th-head b').catch(() => '');
ok(/격$|격\(/.test(gyeok.trim()), `격국 표기: ${gyeok.trim()}`);
const strengthTxt = await page.$$eval('.th-block', (els) => {
  const t = els.map((e) => e.textContent).find((x) => x.includes('통근'));
  return t || '';
});
ok(/신강|신약|중화/.test(strengthTxt), '통근 기반 신강·신약 판정 노출');

// 용어 팝오버 — 새 용어(격국)가 눌리는지
// 주의: 앱은 scroll 시 팝오버를 닫는다. Playwright 의 click 은 먼저 스크롤을 하므로
//       스크롤을 미리 끝내고 관성이 멎은 뒤에 눌러야 실제 동작을 잰다.
const termBtn = page.locator('button.term[data-term="격국"]').first();
await termBtn.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await termBtn.click();
await page.waitForTimeout(250);
const popVisible = await page.$eval('#term-pop', (el) => !el.hidden).catch(() => false);
const popTitle = await page.textContent('#term-pop .tp-title').catch(() => '');
ok(popVisible && popTitle.includes('격국'), `용어 팝오버 신규 항목 동작 (${popTitle})`);
await page.click('body', { position: { x: 5, y: 5 } });

// ── 2) 궁합 모드 전환 ─────────────────────────────────────
await page.click('#btn-restart');
await page.waitForTimeout(300);
await page.click('#seg-mode .seg[data-val="couple"]');
await page.waitForTimeout(200);

const partnerVisible = await page.$eval('#person-2', (el) => !el.hidden);
const ctaText = await page.textContent('#btn-submit');
const p1HeadVisible = await page.$eval('#person-1 .person-head', (el) => !el.hidden);
ok(partnerVisible, '궁합 모드: 두 번째 사람 입력 노출');
ok(ctaText.trim() === '궁합 보기', `궁합 모드: CTA 문구 "${ctaText.trim()}"`);
ok(p1HeadVisible, '궁합 모드: 첫 번째 사람 라벨 노출');

// ── 3) 두 사람 입력 → 궁합 결과 ───────────────────────────
await page.fill('#in-name', '민수');
await page.selectOption('#in-year', '1992');
await page.selectOption('#in-month', '7');
await page.selectOption('#in-day', '8');
await page.selectOption('#in-hour', '12');
await page.fill('#in-name-2', '지영');
await page.selectOption('#in-year-2', '1995');
await page.selectOption('#in-month-2', '3');
await page.selectOption('#in-day-2', '14');
await page.selectOption('#in-hour-2', '9');
await page.selectOption('#in-min-2', '30');
await page.click('#btn-submit');
await page.waitForTimeout(1000);

const score = await page.textContent('.cscore-ring span').catch(() => '');
ok(/^\d+$/.test(score.trim()) && +score >= 0 && +score <= 100, `궁합 총점 렌더: ${score}점`);
const bars = await page.$$eval('.cbar-row', (e) => e.length).catch(() => 0);
ok(bars === 6, `축별 막대 ${bars}개 (6축)`);
const axisCards = await page.$$eval('.axis-card', (e) => e.length).catch(() => 0);
ok(axisCards === 6, `항목별 카드 ${axisCards}개`);
const persons = await page.$$eval('.tp-person', (e) => e.length).catch(() => 0);
ok(persons === 2, `두 사람 원국 ${persons}명분 렌더`);
const lens = await page.$$eval('.lens-card', (e) => e.length).catch(() => 0);
ok(lens === 2, `서로에게 어떤 사람인가 카드 ${lens}개 (양방향)`);
const rows = await page.$$eval('.cm-row', (e) => e.length).catch(() => 0);
ok(rows === 4, `네 기둥 대조표 ${rows}행`);
const advice = await page.$$eval('.advice-list li', (e) => e.length).catch(() => 0);
ok(advice >= 1, `실천 제안 ${advice}건`);

// 막대 폭이 실제로 반영됐는지 (0%가 아닌지)
const barWidth = await page.$eval('.cbar i', (el) => el.style.width);
ok(barWidth && barWidth !== '0%', `막대 폭 반영: ${barWidth}`);

// ── 3-b) 궁합 프롬프트 복사 ───────────────────────────────
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4476' });
await page.click('#btn-copy');
await page.waitForTimeout(700);
const copyLabel = await page.textContent('#btn-copy');
ok(copyLabel.includes('복사됨'), `궁합 프롬프트 복사 버튼 상태: ${copyLabel.trim()}`);
const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
ok(clip.includes('궁합') && clip.includes('년주') && clip.includes('앱이 계산한 관계 판정'),
  `클립보드에 두 원국 + 관계 판정 포함 (${clip.length}자)`);

// ── 3-c) 상대만 음력 입력 (사람별 달력 독립 동작) ─────────
await page.click('#btn-restart');
await page.waitForTimeout(250);
await page.click('#seg-calendar-2 .seg[data-val="lunar"]');
await page.selectOption('#in-year-2', '1993');
await page.selectOption('#in-month-2', '3');
await page.waitForTimeout(200);
const leap1Hidden = await page.$eval('#leap-wrap', (el) => el.hidden);
const leap2Shown = await page.$eval('#leap-wrap-2', (el) => !el.hidden);
ok(leap1Hidden, '사람1은 양력이라 윤달 체크 숨김 유지');
ok(leap2Shown, '사람2 음력 1993년 3월 → 윤달 옵션 노출 (윤3월)');
await page.selectOption('#in-day-2', '15');
await page.click('#btn-submit');
await page.waitForTimeout(1000);
const mixedScore = await page.textContent('.cscore-ring span').catch(() => '');
ok(/^\d+$/.test(mixedScore.trim()), `양력×음력 혼합 궁합 산출: ${mixedScore}점`);

// ── 4) 공유 링크 왕복 (궁합 모드 복원) ────────────────────
const shareUrl = await page.evaluate(() => {
  const p = new URLSearchParams(location.search);
  return null; // state 는 모듈 스코프라 직접 못 읽음 → 링크 복사 버튼으로 확인
});
// 직접 URL 을 만들어 복원되는지 확인
const url = 'http://localhost:4476/?n=%EB%AF%BC%EC%88%98&g=%EB%82%A8&c=solar&y=1992&mo=7&d=8&h=12&mi=0&lon=126.978'
  + '&n2=%EC%A7%80%EC%98%81&g2=%EC%97%AC&c2=solar&y2=1995&mo2=3&d2=14&h2=9&mi2=30&lon2=126.978&tst=1&b=%EC%9E%90%EC%8B%9C&m=c';
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const score2 = await page.textContent('.cscore-ring span').catch(() => '');
const name2 = await page.textContent('.result-name').catch(() => '');
ok(score2.trim() === score.trim(), `공유 링크 복원: 같은 점수 (${score2})`);
ok(name2.includes('민수') && name2.includes('지영'), `공유 링크 복원: 두 이름 (${name2.trim()})`);

// ── 5) 콘솔 에러 ──────────────────────────────────────────
ok(errors.length === 0, `콘솔 에러 ${errors.length}건`);
if (errors.length) console.log(errors.join('\n'));

await page.screenshot({ path: 'tests/_shot-compat.png', fullPage: true });
console.log(`\n${'═'.repeat(46)}\n  통과 ${pass} / 실패 ${fail}\n${'═'.repeat(46)}`);
await b.close();
process.exit(fail ? 1 : 0);
