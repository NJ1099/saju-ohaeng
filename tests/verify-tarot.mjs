// 타로 UI 브라우저 검증 (Playwright).
// 서버가 http://localhost:4476 에 떠 있어야 한다: node server.js
// 실행: node tests/verify-tarot.mjs
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

// ── 1) 첫 진입은 메뉴, 버튼은 사주/타로 둘뿐 ───────────────
{
  console.log('\n[1] 메뉴 화면');
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });

  ok('메뉴 라우트 노출', await page.isVisible('#route-menu'));
  ok('사주 라우트 숨김', !(await page.isVisible('#route-saju')));
  ok('타로 라우트 숨김', !(await page.isVisible('#route-tarot')));
  eq('메뉴 타일 3개', await page.locator('.menu-tile').count(), 3);
  eq('타일 라벨', await page.locator('.menu-tile .mt-name').allTextContents(), ['사주', '타로', '귀인 지도']);
  eq('body data-route', await page.getAttribute('body', 'data-route'), 'menu');
  ok('뒤로가기 버튼 숨김', !(await page.isVisible('#btn-home')));
  await page.context().close();
}

// ── 2) 사주 라우트가 예전처럼 동작 (회귀) ──────────────────
{
  console.log('\n[2] 사주 회귀');
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('.menu-tile.saju');

  ok('사주 라우트 노출', await page.isVisible('#route-saju'));
  eq('body data-route', await page.getAttribute('body', 'data-route'), 'saju');
  ok('입력 폼 노출', await page.isVisible('#saju-form'));
  ok('뒤로가기 버튼 노출', await page.isVisible('#btn-home'));

  await page.selectOption('#in-year', '1992');
  await page.selectOption('#in-month', '7');
  await page.selectOption('#in-day', '15');
  await page.click('#btn-submit');
  await page.waitForSelector('#result-root .card', { timeout: 8000 });
  const body = await page.textContent('#result-root');
  ok('원국 결과 렌더', body.includes('오행') && body.length > 500);
  ok('이론 카드 존재', body.includes('격국') || body.includes('용신'));

  // 메뉴로 돌아가기
  await page.click('#btn-home');
  ok('메뉴 복귀', await page.isVisible('#route-menu'));
  await page.context().close();
}

// ── 3) 타로: 주제 선택 → 78장 → 3장 뽑기 → 결과 ────────────
let sharedUrl = null;
{
  console.log('\n[3] 타로 전체 흐름');
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('.menu-tile.tarot');

  eq('body data-route', await page.getAttribute('body', 'data-route'), 'tarot');
  await page.waitForSelector('.t-topic', { timeout: 8000 });
  eq('주제 9개', await page.locator('.t-topic').count(), 9);

  const labels = await page.locator('.t-topic').allTextContents();
  for (const want of ['연애', '미래', '관계', '재회', '이직', '사업', '재물', '진로', '시험']) {
    ok(`주제 칩 — ${want}`, labels.some((l) => l.includes(want)));
  }

  // 재회운 선택
  await page.locator('.t-topic[data-topic="reunion"]').click();
  await page.waitForSelector('#view-tarot-draw:not(.hidden)', { timeout: 4000 });
  eq('덱 78장 렌더', await page.locator('.t-card').count(), 78);
  eq('슬롯 3개', await page.locator('.t-slot').count(), 3);
  eq('재회운 자리 이름',
    (await page.locator('.t-slot-label').allTextContents()),
    ['지난 관계가 남긴 것', '지금 두 사람의 거리', '재회의 가능성']);

  // 다시 섞기가 죽지 않는지
  await page.click('#t-shuffle');
  await page.waitForTimeout(700);
  eq('셔플 후에도 78장', await page.locator('.t-card').count(), 78);

  // ── 아치 캐러셀 (라운드 8) ──
  eq('활성 카드는 항상 한 장', await page.locator('.t-card.active').count(), 1);
  const actNo = await page.locator('.t-card.active b').textContent();
  eq('카운터가 활성 카드 번호와 같다', await page.textContent('#t-counter-no'), actNo);
  eq('남은 장수 표기', await page.textContent('#t-counter-total'), '남은 78장');

  // 가운데 카드는 이웃보다 확실히 크다 (작아서 잘못 고르던 문제의 회귀 방지)
  // 회전한 카드는 getBoundingClientRect 가 축정렬 박스라 실제보다 넓게 나온다.
  // 확대 배율은 --s 로 재고, 실측 폭은 회전이 0 인 활성 카드에서만 읽는다.
  const sizes = await page.evaluate(() => {
    const act = document.querySelector('.t-card.active');
    const nb = document.querySelector(`.t-card[data-i="${Number(act.dataset.i) + 1}"]`);
    const s = (el) => Number(getComputedStyle(el).getPropertyValue('--s'));
    return { width: act.querySelector('i').getBoundingClientRect().width, active: s(act), neighbor: s(nb) };
  });
  ok('활성 카드가 이웃보다 1.25배 이상 크다', sizes.active >= sizes.neighbor * 1.25,
    `${sizes.active} vs ${sizes.neighbor}`);
  ok('활성 카드 폭이 120px 이상', sizes.width >= 120, `${Math.round(sizes.width)}px`);

  // 휠로 카드가 넘어간다
  await page.mouse.move(210, 470);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(60); }
  await page.waitForTimeout(400);
  ok('휠을 굴리면 활성 카드가 바뀐다',
    (await page.locator('.t-card.active b').textContent()) !== actNo);

  // 옆 카드를 눌러도 뽑히지 않고 가운데로만 온다 (오선택 방지)
  const side = await page.evaluate(() => {
    const act = document.querySelector('.t-card.active');
    return Number(act.dataset.i) + 2;
  });
  await page.locator(`.t-card[data-i="${side}"]`).click();
  await page.waitForTimeout(450);
  eq('옆 카드 탭 → 가운데로만 이동', await page.locator('.t-slot.filled').count(), 0);
  eq('탭한 카드가 활성이 됐다', await page.evaluate(() =>
    Number(document.querySelector('.t-card.active').dataset.i)), side);

  // 3장 선택 — 가운데 카드 탭 1장, 뽑기 버튼 2장
  await page.locator('.t-card.active').click();
  await page.waitForTimeout(1100);
  eq('가운데 카드 탭 → 한 장 뽑힘', await page.locator('.t-slot.filled').count(), 1);
  eq('뽑은 만큼 덱이 줄어든다', await page.locator('.t-card').count(), 77);
  eq('남은 장수도 줄어든다', await page.textContent('#t-counter-total'), '남은 77장');

  for (let k = 0; k < 2; k++) {
    await page.click('#t-pick');
    await page.waitForTimeout(1100);
  }
  eq('슬롯 3개 채워짐', await page.locator('.t-slot.filled').count(), 3);

  await page.waitForSelector('#view-tarot-result:not(.hidden)', { timeout: 5000 });
  eq('공개된 카드 3장', await page.locator('.t-spread-item').count(), 3);
  eq('해석 블록 3개', await page.locator('.t-block').count(), 3);

  // 카드 이미지가 실제로 로드됐는지 (404면 naturalWidth 가 0).
  // lazy 로드 + 원격 배포 검증이면 네트워크 지연이 있으므로 기다렸다 판정한다.
  let imgOk = false;
  try {
    await page.waitForFunction(
      () => {
        const els = [...document.querySelectorAll('.t-face img')];
        return els.length === 3 && els.every((e) => e.complete && e.naturalWidth > 0);
      },
      { timeout: 20000 },
    );
    imgOk = true;
  } catch { /* 아래에서 실패로 기록 */ }
  ok('카드 앞면 이미지 3장 로드', imgOk);

  // 자리 이름이 결과에도 반영됐는지
  const posLabels = await page.locator('.t-block-pos').allTextContents();
  eq('결과의 자리 이름', posLabels, ['지난 관계가 남긴 것', '지금 두 사람의 거리', '재회의 가능성']);

  // 해석 본문이 채워졌는지
  const texts = await page.locator('.t-text').allTextContents();
  ok('해석 본문 3개 모두 채워짐', texts.length === 3 && texts.every((t) => t.trim().length >= 20));
  ok('키워드 노출', (await page.locator('.t-kw span').count()) >= 9);

  // 방향 배지
  const oris = await page.locator('.t-ori').allTextContents();
  ok('방향 배지 3개', oris.length === 3 && oris.every((o) => o === '정방향' || o === '역방향'));

  // 역방향 카드는 회전 클래스를 갖는다
  const revCount = oris.filter((o) => o === '역방향').length;
  eq('역방향 개수 == .reversed 개수', await page.locator('.t-face.reversed').count(), revCount);

  ok('면책 문구', (await page.textContent('.t-disclaimer')).includes('거울'));
  ok('액션 버튼 4종', (await page.locator('.t-actions .t-btn').count()) === 4);

  sharedUrl = page.url();
  ok('주소에 공유 파라미터 반영', /[?&]t=reunion/.test(sharedUrl) && /[?&]c=/.test(sharedUrl));
  await page.context().close();
}

// ── 4) 공유 링크로 같은 결과 재현 ──────────────────────────
{
  console.log('\n[4] 공유 링크 재현');
  const page = await newPage();
  await page.goto(sharedUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-tarot-result:not(.hidden)', { timeout: 8000 });

  eq('body data-route', await page.getAttribute('body', 'data-route'), 'tarot');
  eq('카드 3장 재현', await page.locator('.t-spread-item').count(), 3);
  eq('주제 재현', (await page.textContent('.t-res-topic')).trim(), '재회운');

  const names = await page.locator('.t-card-name').allTextContents();
  ok('카드 이름 3개 복원', names.length === 3 && names.every((n) => n.trim()));
  await page.context().close();
}

// ── 5) 손상된 공유 링크로도 죽지 않음 ──────────────────────
{
  console.log('\n[5] 손상된 링크 방어');
  const page = await newPage();
  await page.goto(`${BASE}/?t=reunion&c=zzz9x,m00u`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok('타로 라우트 유지', await page.isVisible('#route-tarot'));
  ok('주제 선택으로 안전 복귀', await page.isVisible('#view-tarot-topic'));
  eq('주제 칩 정상 렌더', await page.locator('.t-topic').count(), 9);
  await page.context().close();
}

// ── 6) 기존 사주 공유 링크 하위호환 ────────────────────────
{
  console.log('\n[6] 기존 사주 공유 링크 하위호환');
  const page = await newPage();
  await page.goto(`${BASE}/?n=%ED%99%8D%EA%B8%B8%EB%8F%99&g=%EB%82%A8&c=solar&y=1990&mo=3&d=5&h=9&mi=30&lon=126.978&tst=1&b=%EC%9E%90%EC%8B%9C`,
    { waitUntil: 'networkidle' });
  await page.waitForSelector('#result-root .card', { timeout: 9000 });
  eq('메뉴를 건너뛰고 사주로', await page.getAttribute('body', 'data-route'), 'saju');
  ok('결과 자동 계산', (await page.textContent('#result-root')).includes('오행'));
  await page.context().close();
}

// ── 7) 역방향 끄기 ─────────────────────────────────────────
{
  console.log('\n[7] 역방향 끄기');
  const page = await newPage();
  await page.goto(`${BASE}/#/tarot`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.t-topic', { timeout: 8000 });
  await page.uncheck('#t-reversed');
  await page.locator('.t-topic[data-topic="money"]').click();
  await page.waitForSelector('#view-tarot-draw:not(.hidden)');
  await page.click('#t-auto');
  await page.waitForSelector('#view-tarot-result:not(.hidden)', { timeout: 8000 });
  const oris = await page.locator('.t-ori').allTextContents();
  eq('전부 정방향', oris, ['정방향', '정방향', '정방향']);
  eq('재물운 자리 이름', await page.locator('.t-block-pos').allTextContents(),
    ['지금의 돈 흐름', '새거나 막힌 곳', '들어올 자리']);
  await page.context().close();
}

// ── 8) prefers-reduced-motion 에서도 완주 ──────────────────
{
  console.log('\n[8] 모션 최소화 환경');
  const page = await newPage({ reducedMotion: 'reduce' });
  await page.goto(`${BASE}/#/tarot`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.t-topic', { timeout: 8000 });
  await page.locator('.t-topic[data-topic="exam"]').click();
  await page.waitForSelector('#view-tarot-draw:not(.hidden)');
  for (let k = 0; k < 3; k++) { await page.click('#t-pick'); await page.waitForTimeout(120); }
  await page.waitForSelector('#view-tarot-result:not(.hidden)', { timeout: 5000 });
  eq('모션 최소화에서도 3장 공개', await page.locator('.t-spread-item').count(), 3);
  await page.context().close();
}

// ── 9) 용어 팝오버가 타로에서도 동작 ───────────────────────
{
  console.log('\n[9] 용어 팝오버');
  const page = await newPage();
  await page.goto(`${BASE}/#/tarot`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.t-topic', { timeout: 8000 });
  await page.locator('.t-topic[data-topic="love"]').click();
  await page.waitForSelector('#view-tarot-draw:not(.hidden)');
  await page.click('#t-auto');
  await page.waitForSelector('#view-tarot-result:not(.hidden)', { timeout: 8000 });
  await page.locator('.term[data-term="역방향"]').first().click();
  await page.waitForTimeout(250);
  ok('팝오버 노출', await page.isVisible('#term-pop'));
  ok('역방향 설명 내용', (await page.textContent('#term-pop .tp-def')).includes('나쁘다는 뜻이 아닙니다'));
  await page.context().close();
}

// ── 10) 이미지 저장 (라운드 8) ─────────────────────────────
// 모바일에서 "눌러도 아무 일이 없다"는 신고로 경로를 다시 짠 자리.
// 데스크톱은 다운로드 경로를 타므로 여기서 파일이 실제로 떨어지는지 본다.
{
  console.log('\n[10] 이미지 저장');
  const page = await newPage({ acceptDownloads: true });
  await page.goto(`${BASE}/#/tarot`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.t-topic', { timeout: 8000 });
  await page.locator('.t-topic[data-topic="career"]').click();
  await page.waitForSelector('#view-tarot-draw:not(.hidden)');
  await page.click('#t-auto');
  await page.waitForSelector('#view-tarot-result:not(.hidden)', { timeout: 8000 });

  let dl = null;
  try {
    [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.click('#t-image'),
    ]);
  } catch { /* 아래에서 실패로 기록 */ }

  ok('이미지 저장 → 다운로드 발생', !!dl);
  if (dl) {
    const name = dl.suggestedFilename();
    ok('PNG 파일명', /\.png$/.test(name), name);
    // 한글 파일명은 일부 안드로이드 브라우저가 저장하다 실패한다 — ASCII 로 유지한다.
    ok('파일명이 ASCII', /^[\x20-\x7E]+$/.test(name), name);
    const p = await dl.path();
    const size = p ? (await import('node:fs')).statSync(p).size : 0;
    ok('PNG 내용이 비어 있지 않다', size > 20000, `${size} bytes`);
  }
  await page.context().close();
}

// ── 결과 ───────────────────────────────────────────────────
const realErrors = errors.filter((e) => !/favicon|ERR_NETWORK_CHANGED/i.test(e));
ok('콘솔 에러 0', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n타로 UI 검증: ${pass} PASS / ${fail} FAIL`);
if (fails.length) { console.log('\n' + fails.join('\n')); process.exit(1); }
