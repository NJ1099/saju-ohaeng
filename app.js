// ============================================================
//  오행 · app.js — 입력 → 만세력 계산 → 분석 → 풀이 렌더링.
// ============================================================
import { computeSaju, pillarsText } from './engine/saju.js';
import { analyze } from './engine/analyze.js';
import { buildReading, buildSimpleSummary, buildElementWeakness, buildCompatibility } from './engine/reading.js';
import { analyzeCompatibility } from './engine/compat.js';
import { buildPrompt, buildCompatPrompt } from './engine/promptBuilder.js';
import { leapMonthOf, daysInLunarMonth } from './engine/lunar.js';
import { computeDaewoon, computeSewoon } from './engine/luck.js';
import { buildPersona } from './engine/persona.js';
import { GLOSSARY, INDICATOR_GLOSS } from './engine/glossary.js';
import { drawShareCard, canvasToBlob, deliverImage } from './share.js';
import { initRouter, onRoute, go } from './router.js';
import {
  STEMS, BRANCHES, STEM_ELEMENT, BRANCH_ELEMENT, ELEMENTS, sipseongOf, HIDDEN_STEMS,
} from './engine/constants.js';

// 카카오톡 공유를 켜려면: https://developers.kakao.com 에서 앱 생성 →
// JavaScript 키를 아래에 붙여넣고, 앱의 [플랫폼 > Web]에 배포 도메인(예: sajumoya.vercel.app) 등록.
// 비워두면 카카오톡 버튼은 '링크 복사'로 자동 대체됩니다.
const KAKAO_JS_KEY = '';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// 주요 도시 경도 (진태양시 보정용)
const REGIONS = [
  ['서울', 126.978], ['인천', 126.705], ['수원·경기', 127.029], ['춘천·강원', 127.731],
  ['강릉', 128.896], ['대전·세종', 127.385], ['청주·충북', 127.490], ['전주·전북', 127.148],
  ['광주·전남', 126.852], ['대구·경북', 128.601], ['포항', 129.365], ['부산', 129.075],
  ['울산', 129.311], ['창원·경남', 128.681], ['제주', 126.531], ['해외/기타(135°E)', 135.0],
];

const state = {
  mode: 'solo', // 'solo' | 'couple'
  boundary: '자시',
  // 사람별 세그먼트 상태 (1=본인, 2=상대)
  p: { 1: { gender: '남', calendar: 'solar' }, 2: { gender: '여', calendar: 'solar' } },
  lastSaju: null, lastReading: null, lastAnalyze: null, lastLuck: null,
  lastCompat: null, lastPair: null,
};

/** 사람 번호(1|2)를 붙인 요소 셀렉터. 1번은 기존 ID 유지. */
const P = (id, k = 1) => `#${id}${k === 2 ? '-2' : ''}`;

// ── 초기화 ────────────────────────────────────────────────
function init() {
  for (const k of [1, 2]) initPersonForm(k);

  bindSegment('#seg-mode', setMode);
  bindSegment('#seg-boundary', (v) => { state.boundary = v; });

  $('#saju-form').addEventListener('submit', onSubmit);
  $('#btn-restart').addEventListener('click', restart);
  initShareSheet();
  initTermPopover();
  initScrollTop();
  initShell();
}

// ── 셸(메뉴·라우팅·상단바) ────────────────────────────────
/** 라우트별 상단바 문구. 브랜드는 유지하고 부제만 바꾼다. */
const ROUTE_META = {
  menu: { sub: '사주 · 타로 · 귀인 지도', mark: '五' },
  saju: { sub: '사주 오행 분석', mark: '五' },
  tarot: { sub: '타로 3장 리딩', mark: '☾' },
  map: { sub: '귀인 지도', mark: '五' },
  terms: { sub: '이용약관', mark: '五' },
  privacy: { sub: '개인정보처리방침', mark: '五' },
};

function initShell() {
  // 메뉴 타일·푸터 링크·약관 화면 버튼 — data-goto 를 가진 것은 모두 라우트 이동
  for (const b of $$('[data-goto]')) {
    b.addEventListener('click', () => go(b.dataset.goto));
  }
  $('#btn-home').addEventListener('click', () => go('menu'));

  onRoute((to) => {
    const meta = ROUTE_META[to] || ROUTE_META.menu;
    $('#brand-sub').textContent = meta.sub;
    $('#brand-mark').textContent = meta.mark;
    $('#btn-home').hidden = to === 'menu';
    // 사주를 떠나면 결과 화면 상태를 초기화해 다음 진입이 깔끔하게 시작되도록 한다.
    if (to !== 'saju') $('#btn-restart').hidden = true;
    else $('#btn-restart').hidden = $('#view-result').classList.contains('hidden');
  });

  initRouter({
    hasSajuParams: () => !!new URLSearchParams(location.search).get('y'),
    hasTarotParams: () => {
      const p = new URLSearchParams(location.search);
      return !!(p.get('t') && p.get('c'));
    },
  });

  applyParamsIfAny(); // 사주 공유 링크로 들어오면 자동 입력·계산
}

/** 한 사람 분량의 입력 컨트롤을 채우고 이벤트를 연결한다. */
function initPersonForm(k) {
  fillSelect(P('in-year', k), range(1930, 2027).reverse(), (y) => [`${y}`, `${y}년`], 1995);
  fillSelect(P('in-month', k), range(1, 12), (m) => [`${m}`, `${m}월`], 1);
  refreshDays(k);
  fillSelect(P('in-hour', k), range(0, 23), (h) => [`${h}`, `${String(h).padStart(2, '0')}시`], 12);
  fillSelect(P('in-min', k), range(0, 59), (m) => [`${m}`, `${String(m).padStart(2, '0')}분`], 0);
  fillSelect(P('in-region', k), REGIONS.map((r, i) => i), (i) => [`${i}`, REGIONS[i][0]], 0);

  bindSegment(P('seg-gender', k), (v) => { state.p[k].gender = v; });
  bindSegment(P('seg-calendar', k), (v) => { state.p[k].calendar = v; refreshLeap(k); refreshDays(k); });

  $(P('in-year', k)).addEventListener('change', () => { refreshLeap(k); refreshDays(k); });
  $(P('in-month', k)).addEventListener('change', () => { refreshLeap(k); refreshDays(k); });
  $(P('in-leap', k)).addEventListener('change', () => refreshDays(k));
  $(P('in-notime', k)).addEventListener('change', (e) => {
    const off = e.target.checked;
    for (const sel of [P('in-hour', k), P('in-min', k)]) {
      $(sel).disabled = off; $(sel).style.opacity = off ? .4 : 1;
    }
  });
}

/** 모드 전환 — 내 사주 / 둘의 궁합 */
function setMode(v) {
  state.mode = v;
  const couple = v === 'couple';
  $('#person-2').hidden = !couple;
  $('#person-1 .person-head').hidden = !couple;
  $('#btn-submit').textContent = couple ? '궁합 보기' : '사주 풀이 보기';
  $('#hero-title').innerHTML = couple
    ? '두 사람의 사주,<br/>어떻게 어울릴까요'
    : '당신의 사주,<br/>오행으로 읽어드려요';
  $('#hero-desc').innerHTML = couple
    ? '두 분의 생년월일시를 넣으면 일간·일지·오행·조후까지<br/>함께 펼쳐 궁합의 결을 읽어드립니다.'
    : '이름과 생년월일, 태어난 시간만 적으면<br/>만세력으로 사주 원국을 자동 계산해 풀이합니다.';
  $('#form-disclaimer').textContent = couple
    ? '궁합은 관계를 정해 주는 판정이 아니라, 서로의 결을 이해하는 지도예요.'
    : '사주는 정답이 아니라 방향을 보는 지도입니다. 재미와 자기성찰의 참고로 봐 주세요.';
}

// ── 용어 팝오버 ───────────────────────────────────────────
function initTermPopover() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.term');
    if (t) { e.preventDefault(); showTerm(t.dataset.term, t); return; }
    if (!e.target.closest('.tp-card')) hideTerm();
  });
  // 탭 직후의 관성 스크롤이 팝오버를 즉시 닫아 버리는 걸 막는다
  // (긴 결과 페이지 아래쪽 용어를 누르면 열리자마자 사라졌다).
  window.addEventListener('scroll', () => { if (Date.now() - termOpenedAt > 350) hideTerm(); }, { passive: true });
  window.addEventListener('resize', hideTerm);
}
let termOpenedAt = 0;
function showTerm(key, anchor) {
  const g = GLOSSARY[key]; if (!g) return;
  termOpenedAt = Date.now();
  const pop = $('#term-pop'); const card = pop.querySelector('.tp-card');
  pop.querySelector('.tp-title').textContent = g.title;
  pop.querySelector('.tp-def').textContent = g.def;
  pop.hidden = false;
  const margin = 12;
  const cardW = Math.min(300, window.innerWidth - margin * 2);
  card.style.width = `${cardW}px`;
  const r = anchor.getBoundingClientRect();
  const cardH = card.offsetHeight;
  let left = r.left + r.width / 2 - cardW / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));
  let top = r.bottom + 8;
  if (top + cardH > window.innerHeight - margin) top = Math.max(margin, r.top - cardH - 8);
  card.style.left = `${left}px`; card.style.top = `${top}px`;
}
function hideTerm() { const p = $('#term-pop'); if (p && !p.hidden) p.hidden = true; }

// ── 맨 위로 ────────────────────────────────────────────────
function initScrollTop() {
  const btn = $('#to-top');
  window.addEventListener('scroll', () => { btn.classList.toggle('show', window.scrollY > 400); }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/** 세그먼트를 값으로 프로그램 활성화 */
function setSeg(sel, val) {
  $$('.seg', $(sel)).forEach((s) => {
    const on = s.dataset.val === val;
    s.classList.toggle('active', on);
    s.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/** 공유 링크 파라미터 키 — 2번 사람은 접미사 '2' */
const K = (base, k) => (k === 2 ? `${base}2` : base);

/** URL 쿼리(공유 링크)로 한 사람 분량의 폼을 복원 */
function fillPersonFromParams(p, k) {
  $(P('in-name', k)).value = p.get(K('n', k)) || '';
  state.p[k].gender = p.get(K('g', k)) || (k === 1 ? '남' : '여');
  setSeg(P('seg-gender', k), state.p[k].gender);
  state.p[k].calendar = p.get(K('c', k)) || 'solar';
  setSeg(P('seg-calendar', k), state.p[k].calendar);
  $(P('in-year', k)).value = p.get(K('y', k));
  $(P('in-month', k)).value = p.get(K('mo', k));
  refreshLeap(k);
  if (p.get(K('leap', k)) === '1') $(P('in-leap', k)).checked = true;
  refreshDays(k);
  $(P('in-day', k)).value = p.get(K('d', k));
  const h = p.get(K('h', k));
  const notime = $(P('in-notime', k)), hh = $(P('in-hour', k)), mm = $(P('in-min', k));
  if (h !== null && h !== '') {
    notime.checked = false; hh.disabled = false; mm.disabled = false;
    hh.style.opacity = 1; mm.style.opacity = 1;
    hh.value = h; mm.value = p.get(K('mi', k)) || '0';
  } else {
    notime.checked = true; hh.disabled = true; mm.disabled = true;
    hh.style.opacity = .4; mm.style.opacity = .4;
  }
  const lon = parseFloat(p.get(K('lon', k)));
  if (!isNaN(lon)) {
    const idx = REGIONS.findIndex((r) => Math.abs(r[1] - lon) < 0.01);
    if (idx >= 0) $(P('in-region', k)).value = idx;
  }
}

/** URL 쿼리(공유 링크)가 있으면 폼을 채우고 자동 제출 */
function applyParamsIfAny() {
  const p = new URLSearchParams(location.search);
  if (!p.get('y')) return;
  const couple = p.get('m') === 'c' && !!p.get('y2');
  setMode(couple ? 'couple' : 'solo');
  setSeg('#seg-mode', couple ? 'couple' : 'solo');
  fillPersonFromParams(p, 1);
  if (couple) fillPersonFromParams(p, 2);
  $('#in-tst').checked = p.get('tst') !== '0';
  state.boundary = p.get('b') || '자시'; setSeg('#seg-boundary', state.boundary);
  if ($('#saju-form').requestSubmit) $('#saju-form').requestSubmit();
}

function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
function fillSelect(sel, items, fmt, def) {
  const el = $(sel); el.innerHTML = '';
  for (const it of items) {
    const [val, label] = fmt(it);
    const o = document.createElement('option');
    o.value = val; o.textContent = label;
    if (it === def) o.selected = true;
    el.appendChild(o);
  }
}
function daysInMonth(y, m) { return [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
function refreshDays(k = 1) {
  const y = +$(P('in-year', k)).value || 1995, m = +$(P('in-month', k)).value || 1;
  const cur = +$(P('in-day', k))?.value || 1;
  let max;
  if (state.p[k].calendar === 'lunar') {
    try { max = daysInLunarMonth(y, m, $(P('in-leap', k)).checked); } catch { max = 30; }
    if (max !== 29 && max !== 30) max = 30; // 안전망
  } else max = daysInMonth(y, m);
  fillSelect(P('in-day', k), range(1, max), (d) => [`${d}`, `${d}일`], Math.min(cur, max));
}
function refreshLeap(k = 1) {
  const wrap = $(P('leap-wrap', k));
  if (state.p[k].calendar !== 'lunar') { wrap.hidden = true; $(P('in-leap', k)).checked = false; return; }
  const y = +$(P('in-year', k)).value, m = +$(P('in-month', k)).value;
  let leap = 0;
  try { leap = leapMonthOf(y); } catch { leap = 0; }
  if (leap === m) { wrap.hidden = false; $(P('leap-hint', k)).textContent = `(${y}년은 윤${leap}월이 있어요)`; }
  else { wrap.hidden = true; $(P('in-leap', k)).checked = false; }
}
function bindSegment(sel, cb) {
  const segs = $$('.seg', $(sel));
  segs.forEach((s) => s.addEventListener('click', () => {
    segs.forEach((x) => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
    s.classList.add('active'); s.setAttribute('aria-pressed', 'true'); cb(s.dataset.val);
  }));
}

// ── 제출 ──────────────────────────────────────────────────
/** 폼에서 한 사람 분량의 computeSaju 입력을 읽는다. */
function readPersonInput(k) {
  const notime = $(P('in-notime', k)).checked;
  const regionIdx = +$(P('in-region', k)).value;
  return {
    name: $(P('in-name', k)).value.trim(),
    gender: state.p[k].gender,
    calendar: state.p[k].calendar,
    isLeapMonth: $(P('in-leap', k)).checked,
    year: +$(P('in-year', k)).value, month: +$(P('in-month', k)).value, day: +$(P('in-day', k)).value,
    hour: notime ? null : +$(P('in-hour', k)).value,
    minute: notime ? null : +$(P('in-min', k)).value,
    options: {
      trueSolarTime: $('#in-tst').checked,
      longitude: REGIONS[regionIdx][1],
      equationOfTime: true,
      useDST: true,
      dayBoundary: state.boundary,
    },
  };
}

function onSubmit(e) {
  e.preventDefault();
  const couple = state.mode === 'couple';
  const inputs = couple ? [readPersonInput(1), readPersonInput(2)] : [readPersonInput(1)];

  showResultView();
  $('#result-root').innerHTML = `<div class="loading"><div class="spinner"></div><p>${couple ? '두 사주를 만세력으로 계산하는 중…' : '만세력으로 사주를 계산하는 중…'}</p></div>`;

  setTimeout(() => { (couple ? runCouple : runSolo)(inputs); }, 280);
}

function runSolo([input]) {
  let saju;
  try { saju = computeSaju(input); }
  catch (err) { return renderError(`계산 중 오류가 발생했습니다: ${err.message}`); }
  if (saju.error) return renderError(saju.error);
  const a = analyze(saju);
  const reading = buildReading(saju, a);
  saju._typeLabel = reading.typeLabel; // 공유 카드용
  const now = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const daewoon = computeDaewoon(saju, today);
  const sewoon = computeSewoon(saju, today.year, 12, today.year);
  const summary = buildSimpleSummary(saju, a, { daewoon, sewoon });
  const weakness = buildElementWeakness(a);
  const compat = buildCompatibility(saju, a);
  state.lastSaju = saju; state.lastReading = reading; state.lastAnalyze = a;
  state.lastLuck = { daewoon, sewoon }; state.lastCompat = null; state.lastPair = null;
  state.shareUrl = buildShareUrl([input], 'solo');
  state.shareText = `${saju.input.name ? saju.input.name + '님의 ' : '내 '}사주 오행 분석 — ${reading.typeLabel}`;
  renderResult(saju, a, reading, { daewoon, sewoon }, summary, weakness, compat);
  prewarmShareImage();
}

// 결과가 뜨는 순간 공유 이미지를 미리 만들어 둔다.
// iOS 는 사용자가 버튼을 누른 '직후'에만 공유 시트를 열어 주므로, 클릭 뒤에 캔버스를
// 그리기 시작하면 활성화가 만료돼 저장이 통째로 실패한다. (라운드 8)
let imageReady = null;
function prewarmShareImage() {
  imageReady = (async () => canvasToBlob(await drawShareCard(state.lastSaju, state.lastAnalyze)))()
    .catch(() => null);
}

function runCouple(inputs) {
  const pair = [];
  for (let i = 0; i < 2; i++) {
    let saju;
    try { saju = computeSaju(inputs[i]); }
    catch (err) { return renderError(`${i === 0 ? '첫 번째' : '두 번째'} 사주 계산 중 오류가 발생했습니다: ${err.message}`); }
    if (saju.error) return renderError(`${i === 0 ? '첫 번째' : '두 번째'} 사람 — ${saju.error}`);
    pair.push({ saju, a: analyze(saju) });
  }
  let compat;
  try { compat = analyzeCompatibility(pair[0], pair[1]); }
  catch (err) { return renderError(`궁합 분석 중 오류가 발생했습니다: ${err.message}`); }

  state.lastPair = pair; state.lastCompat = compat;
  state.lastSaju = pair[0].saju; state.lastAnalyze = pair[0].a;
  state.lastReading = null; state.lastLuck = null;
  imageReady = null;   // 궁합은 카드 렌더러가 없다 — 앞 결과의 이미지를 물려주면 안 된다
  state.shareUrl = buildShareUrl(inputs, 'couple');
  state.shareText = `${compat.names.a} × ${compat.names.b} 사주 궁합 — ${compat.score}점 · ${compat.grade.label}`;
  renderCouple(compat, pair);
}

function showResultView() {
  $('#view-input').classList.add('hidden');
  $('#view-result').classList.remove('hidden');
  $('#btn-restart').hidden = false;
  window.scrollTo(0, 0);
  // 결과 영역으로 포커스 이동 (키보드·스크린리더 사용자 인지)
  const root = $('#result-root');
  root.setAttribute('tabindex', '-1');
  root.focus({ preventScroll: true });
}
function restart() {
  $('#view-result').classList.add('hidden');
  $('#view-input').classList.remove('hidden');
  $('#btn-restart').hidden = true;
  window.scrollTo(0, 0);
}
function renderError(msg) {
  $('#result-root').innerHTML = `<div class="card"><div class="error-box">${esc(msg)}</div>
    <div class="actions"><button class="btn-ghost" onclick="location.reload()">다시 입력하기</button></div></div>`;
}

// ── 결과 렌더링 ───────────────────────────────────────────
function renderResult(saju, a, reading, luck, summary, weakness, compat) {
  const root = $('#result-root');
  const name = saju.input.name;
  const birthLine = birthText(saju);

  root.innerHTML = `
    <div class="result-head fade-in">
      ${name ? `<div class="result-name">${esc(name)} 님의 사주</div>` : `<div class="result-name">당신의 사주</div>`}
      <div class="result-type">${typeHtml(reading.typeLabel)}</div>
      <div class="result-birth">${birthLine}</div>
    </div>

    ${personaHtml(buildPersona(saju))}

    <div class="card fade-in">
      <p class="sec-title">사주 ${termSpan('원국', '원국')} · 만세력</p>
      <p class="term-hint">밑줄 친 단어를 누르면 <b>뜻 설명</b>이 떠요</p>
      ${pillarsHtml(saju, a)}
      ${corrHtml(saju)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">${termSpan('오행', '오행')} 분포</p>
      ${ohaengHtml(a)}
      <div class="section-gap"></div>
      ${ohaengKpiHtml(a)}
    </div>

    <div class="summary-card fade-in">
      <p class="sec-title" style="color:var(--accent-ink); margin-bottom:12px">한눈에 보는 쉬운 풀이</p>
      <div class="summary-head">${esc(summary.headline)}</div>
      <div class="summary-chips chips">${summary.chips.map((c) => `<span class="chip on">${esc(c)}</span>`).join('')}</div>
      <div class="summary-lines">${summary.lines.map((l) => `<p>${mdInline(l)}</p>`).join('')}</div>
    </div>

    <div class="card fade-in">
      <p class="sec-title">부족한 기운, 이런 뜻이에요</p>
      <p class="term-hint">먼저 <b>뜻</b>을 보고, ‘자세히 보기’로 더 펼쳐 보세요</p>
      ${weaknessHtml(weakness)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">어떤 사주와 잘 맞을까</p>
      ${compatHtml(compat)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">사주 깊이 보기 — ${termSpan('격국', '격국')}·${termSpan('용신', '용신')}·${termSpan('신살', '신살')}</p>
      <p class="term-hint">명리에서 원국을 한 단계 더 들여다볼 때 쓰는 기준들이에요</p>
      ${theoryHtml(a)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">${termSpan('영성잠재력', '영성 잠재력')} · 7대 지표</p>
      ${gaugeHtml(a)}
      <div class="section-gap"></div>
      ${indicatorsHtml(a)}
      ${a.specialCombos.length ? `<div class="section-gap"></div>${combosHtml(a)}` : ''}
    </div>

    <div class="card fade-in">
      <p class="sec-title">${termSpan('대운', '대운(大運)')} · 인생 10년 흐름</p>
      ${daewoonHtml(luck.daewoon)}
      <div class="section-gap"></div>
      <p class="sec-title">${termSpan('세운', '세운(歲運)')} · 해마다의 기운</p>
      ${sewoonHtml(luck.sewoon)}
      <p class="corr-note" style="margin-top:12px">대운수·방향은 ${luck.daewoon.direction}(${luck.daewoon.startAge}세 시작). 대운/세운은 시기를 단정하는 도구가 아니라 흐름의 결을 보는 참고입니다.</p>
    </div>

    <div class="card reading-card fade-in">
      <p class="sec-title">사주 풀이</p>
      ${reading.sections.map(secHtml).join('')}
    </div>

    <div class="actions fade-in">
      <button class="btn-prompt" id="btn-copy">✦ 이 원국으로 GPT·Claude에 깊이 물어보기 (프롬프트 복사)</button>
      <div class="actions-row">
        <button class="btn-ghost" id="btn-share">↗ 공유하기</button>
        <button class="btn-ghost" id="btn-save">🖼️ 이미지 저장</button>
      </div>
      <button class="btn-ghost" id="btn-again">다시 입력하기</button>
    </div>
    <p class="disclaimer" style="margin-top:14px">사주는 정답이 아니라 방향을 보는 지도입니다.<br/>고통의 가능성도 성장과 실천으로 이어지길 바랍니다.</p>
  `;

  $('#btn-copy').addEventListener('click', copyPrompt);
  $('#btn-again').addEventListener('click', restart);
  $('#btn-share').addEventListener('click', onShareLink);
  $('#btn-save').addEventListener('click', onShareImage);
  root.removeAttribute('tabindex');
}

// ── 궁합 결과 렌더링 ──────────────────────────────────────
function renderCouple(c, pair) {
  const root = $('#result-root');
  const [A, B] = pair;

  root.innerHTML = `
    <div class="result-head fade-in">
      <div class="result-name">${esc(c.names.a)} <span class="x-mark">×</span> ${esc(c.names.b)}</div>
      <div class="result-type"><b>${esc(c.grade.label)}</b></div>
      <div class="result-birth">${esc(coupleBirthLine(A.saju))} &nbsp;·&nbsp; ${esc(coupleBirthLine(B.saju))}</div>
    </div>

    <div class="card fade-in">
      ${compatScoreHtml(c)}
      <div class="section-gap"></div>
      ${compatBarsHtml(c)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">두 사람의 ${termSpan('원국', '원국')}</p>
      ${twoPillarsHtml(A, B, c.names)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">서로에게 어떤 사람일까</p>
      ${lensHtml(c)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">항목별로 자세히</p>
      <p class="term-hint">배점이 큰 <b>일간·일지</b>가 궁합의 뼈대예요</p>
      ${c.axes.map(axisHtml).join('')}
    </div>

    <div class="card fade-in">
      <p class="sec-title">네 기둥 대조표</p>
      <p class="term-hint">같은 자리끼리 어떤 관계를 맺는지 한눈에 봐요</p>
      ${matrixHtml(c, c.names)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">정리하면</p>
      ${summaryListHtml('💚 잘 맞는 자리', c.strengths, 'good')}
      ${summaryListHtml('🌗 결이 다른 자리', c.mixed, 'mixed')}
      ${summaryListHtml('⚖️ 조율이 필요한 자리', c.cautions, 'tense')}
      <p class="el-sub" style="margin:16px 0 8px">🌱 오늘부터 해 볼 것</p>
      <ul class="advice-list">${c.advice.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="corr-note" style="margin-top:14px">${esc(c.disclaimer)}</p>
    </div>

    <div class="actions fade-in">
      <button class="btn-prompt" id="btn-copy">✦ 두 원국으로 GPT·Claude에 궁합 물어보기 (프롬프트 복사)</button>
      <div class="actions-row">
        <button class="btn-ghost" id="btn-share">↗ 공유하기</button>
      </div>
      <button class="btn-ghost" id="btn-again">다시 입력하기</button>
    </div>
    <p class="disclaimer" style="margin-top:14px">궁합은 두 사람을 판정하는 점수가 아니라,<br/>서로를 이해하기 위한 지도입니다.</p>
  `;

  $('#btn-copy').addEventListener('click', copyCompatPrompt);
  $('#btn-again').addEventListener('click', restart);
  $('#btn-share').addEventListener('click', onShareLink);
  root.removeAttribute('tabindex');
}

function coupleBirthLine(s) {
  const sol = s.solar;
  const t = sol.hour === null ? '시간 미상' : `${String(sol.hour).padStart(2, '0')}:${String(sol.minute).padStart(2, '0')}`;
  return `${sol.year}.${String(sol.month).padStart(2, '0')}.${String(sol.day).padStart(2, '0')} ${t}`;
}

function compatScoreHtml(c) {
  return `<div class="cscore">
    <div class="cscore-ring" style="--p:${c.score}"><span>${c.score}</span><i>점</i></div>
    <div class="cscore-txt">
      <div class="cscore-grade">${c.grade.emoji} <b>${esc(c.grade.label)}</b></div>
      <p>${esc(c.grade.desc)}</p>
    </div>
  </div>`;
}

function compatBarsHtml(c) {
  return `<div class="cbars">${c.axes.map((ax) => {
    const pct = Math.round((ax.score / ax.weight) * 100);
    return `<div class="cbar-row">
      <span class="cbar-lab">${esc(ax.title.split(' — ')[0])}</span>
      <span class="cbar"><i class="tone-${ax.tone}" style="width:${pct}%"></i></span>
      <span class="cbar-val">${ax.score}<em>/${ax.weight}</em></span>
    </div>`;
  }).join('')}</div>`;
}

/** 두 사람 원국을 나란히 (기둥별 간지 + 일간 강조) */
function twoPillarsHtml(A, B, names) {
  const one = (P2, name, cls) => {
    const p = P2.saju.pillars;
    const cells = [['년', p.year], ['월', p.month], ['일', p.day], ['시', p.hour]].map(([lab, pil]) => {
      if (!pil) return `<div class="tp-cell"><span class="tp-lab">${lab}</span><span class="tp-gz muted">미상</span></div>`;
      const sEl = STEM_ELEMENT[pil.stemIdx], bEl = BRANCH_ELEMENT[pil.branchIdx];
      return `<div class="tp-cell ${lab === '일' ? 'me' : ''}">
        <span class="tp-lab">${lab}</span>
        <span class="tp-gz"><b class="txt-${sEl}">${pil.hanja[0]}</b><b class="txt-${bEl}">${pil.hanja[1]}</b></span>
        <span class="tp-kor">${esc(pil.kor)}</span>
      </div>`;
    }).join('');
    const a = P2.a;
    return `<div class="tp-person ${cls}">
      <div class="tp-name">${esc(name)} <em>${esc(P2.saju.ilgan)}(${esc(P2.saju.ilganHanja)}) · ${esc(a.elements.ilganElement)} 일간</em></div>
      <div class="tp-row">${cells}</div>
      <div class="tp-meta">
        <span>${esc(a.strength.label)}</span>
        <span>${esc(a.theory.gyeokguk.name)}</span>
        <span>${a.elements.missing.length ? `${esc(a.elements.missing.join('·'))} 부족` : '오행 고름'}</span>
      </div>
    </div>`;
  };
  return `<div class="two-pillars">${one(A, names.a, 'p1')}${one(B, names.b, 'p2')}</div>`;
}

function lensHtml(c) {
  const card = (from, to, l, cls) => `
    <div class="lens-card ${cls}">
      <div class="lens-top">${esc(from)}에게 <b>${esc(to)}</b>는</div>
      <div class="lens-tag">“${esc(l.tag)}”<span class="lens-sip">${esc(l.sipseong)}</span></div>
      <p class="lens-desc">${esc(l.desc)}</p>
    </div>`;
  return `<div class="lens-wrap">
    ${card(c.names.a, c.names.b, c.lens.aSees, 'l1')}
    ${card(c.names.b, c.names.a, c.lens.bSees, 'l2')}
  </div>
  <p class="corr-note" style="margin-top:12px">상대의 ${termSpan('일간', '일간')}이 내 일간 기준으로 어떤 ${termSpan('십성', '십성')}인지 본 거예요. 역할이 서로 다르게 보이는 건 자연스러운 일이에요.</p>`;
}

function axisHtml(ax) {
  const pct = Math.round((ax.score / ax.weight) * 100);
  return `<div class="axis-card tone-${ax.tone}">
    <div class="axis-head">
      <span class="axis-title">${esc(ax.title)}</span>
      <span class="axis-score">${ax.score}<em>/${ax.weight}</em></span>
    </div>
    <div class="axis-meter"><i class="tone-${ax.tone}" style="width:${pct}%"></i></div>
    <p class="axis-headline">${esc(ax.headline)}</p>
    <ul class="axis-detail">${ax.detail.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    <p class="axis-basis">근거 · ${esc(ax.basis)}</p>
    ${ax.note ? `<p class="axis-basis">${esc(ax.note)}</p>` : ''}
  </div>`;
}

function matrixHtml(c, names) {
  return `<div class="cmatrix">
    <div class="cm-head"><span></span><span>${esc(names.a)}</span><span>${esc(names.b)}</span><span>관계</span></div>
    ${c.matrix.map((m) => {
    if (m.unknown) {
      return `<div class="cm-row"><span class="cm-pos">${m.pos}주</span><span class="cm-gz muted">—</span><span class="cm-gz muted">—</span><span class="cm-rel muted">시간 미상</span></div>`;
    }
    const rels = m.rels.length
      ? m.rels.map((r) => `<b class="rel-${r.tone}">${esc(r.kind)}</b>`).join(' ')
      : '<span class="muted">—</span>';
    return `<div class="cm-row">
        <span class="cm-pos">${m.pos}주<em>${esc(m.meaning)}</em></span>
        <span class="cm-gz">${esc(m.a.hanja)}<i>${esc(m.a.kor)}</i></span>
        <span class="cm-gz">${esc(m.b.hanja)}<i>${esc(m.b.kor)}</i></span>
        <span class="cm-rel">${rels}</span>
      </div>`;
  }).join('')}
  </div>`;
}

function summaryListHtml(title, items, cls) {
  if (!items.length) return '';
  return `<p class="el-sub" style="margin:14px 0 8px">${title}</p>
    <ul class="sum-list ${cls}">${items.map((x) => `<li><b>${esc(x.title.split(' — ')[0])}</b> ${esc(x.line)}</li>`).join('')}</ul>`;
}

function mdInline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_(.+?)_/g, '<em>$1</em>');
}

/** 클릭하면 설명이 뜨는 용어 */
function termSpan(key, label) {
  return GLOSSARY[key] ? `<button type="button" class="term" data-term="${key}">${esc(label)}</button>` : esc(label);
}

function weaknessHtml(w) {
  const list = (arr) => `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const blocks = w.items.map((d) => {
    const essence = String(d.symbol).split('·').slice(0, 3).join('·'); // 핵심 3키워드를 '뜻'으로
    return `
    <div class="el-card">
      <div class="el-card-head"><span class="el-emoji">${d.emoji}</span><b>${d.el}(${d.hanja})</b> 기운이 부족해요</div>
      <p class="el-meaning"><span class="el-tag">뜻</span>${d.el}${josaEunNeun(d.el)} <b>${esc(essence)}</b>을 상징하는 기운이에요.</p>
      <p class="el-brief">${esc(d.brief)}</p>
      <details class="el-more">
        <summary>자세히 보기</summary>
        <div class="el-body">
          <p class="el-sub">이런 경향이 나타날 수 있어요</p>
          ${list(d.weak)}
          <p class="el-sub">대신 이런 장점이 있어요 👍</p>
          ${list(d.merit)}
          <p class="el-sub">이렇게 채우면 좋아요 🌱</p>
          ${list(d.remedy)}
        </div>
      </details>
    </div>`;
  }).join('');
  const combined = w.combined.length
    ? `<div class="el-combined-wrap"><p class="el-sub" style="margin:14px 0 8px">두 기운이 함께 약하면</p>${w.combined.map((c) => `<div class="el-combined">${esc(c)}</div>`).join('')}</div>`
    : '';
  return blocks + combined;
}

/** 한글 받침 유무로 은/는 조사 선택 (목→은, 화→는 …) */
function josaEunNeun(word) {
  const ch = String(word).charCodeAt(String(word).length - 1);
  if (ch < 0xAC00 || ch > 0xD7A3) return '는';
  return (ch - 0xAC00) % 28 ? '은' : '는';
}

// ── 잘 맞는 사주(궁합) — 두 렌즈를 시각적으로 분리: 보완 오행 vs 천간합 ──
function compatHtml(c) {
  const lead = `<p class="compat-lead">${esc(c.headline)}</p>`;

  const comp = c.balanced
    ? `<p class="compat-balanced">${esc(c.balancedNote)}</p>`
    : `<p class="compat-sub">🤝 내 빈자리를 채워 주는 사람</p>
       <div class="compat-list">${c.complements.map((x) => `
         <div class="compat-row">
           <span class="compat-el el-${x.el}">${x.el}<i>${x.hanja}</i></span>
           <div class="compat-rt"><b>${esc(x.person)}</b><span>${esc(x.gift)}</span></div>
         </div>`).join('')}</div>`;

  const hap = `
    <div class="compat-hap">
      <div class="compat-hap-top"><span class="compat-hap-badge">💞 ${esc(c.hap.label)}</span><span class="compat-hap-q">천간합(天干合) 인연</span></div>
      <p class="compat-hap-text">일간이 <b>${esc(c.hap.partnerStem)}(${esc(c.hap.partnerHanja)})</b>인 사람과 만나면, ${esc(c.hap.desc)}</p>
    </div>`;

  const nur = c.nurturer
    ? `<p class="compat-note">🌱 나를 북돋아 주는 <b>${esc(c.nurturer.el)}(${esc(c.nurturer.hanja)})</b> 기운이 강한 사람 — ${esc(c.nurturer.person)} — 도 곁에서 기댈 언덕이 되어 줄 수 있어요.</p>`
    : '';

  const caution = `<p class="compat-note warn">⚖️ ${esc(c.caution)}</p>`;
  const disc = `<p class="corr-note" style="margin-top:13px">${esc(c.disclaimer)}</p>`;

  return lead + comp + hap + nur + caution + disc;
}

// ── 사주 깊이 보기 (격국·용신·조후·통근·십이운성·신살) ──────
function theoryHtml(a) {
  const t = a.theory;
  const el = (e) => `<span class="txt-${e}">${e}(${esc({ 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' }[e])})</span>`;
  const sinsal = t.sinsal.filter((s) => s.present);

  const gyeok = `<div class="th-block">
    <div class="th-head"><span class="th-key">${termSpan('격국', '격국(格局)')}</span><b>${esc(t.gyeokguk.name)}</b></div>
    <p class="th-desc">${esc(t.gyeokguk.desc)}</p>
    <p class="th-basis">${esc(t.gyeokguk.basis)} · ${esc(t.gyeokguk.note)}</p>
  </div>`;

  const yong = `<div class="th-block">
    <div class="th-head"><span class="th-key">${termSpan('용신', '용신(用神) 후보')}</span><b>${t.yongsin.primary.map(el).join(' · ')}</b></div>
    <p class="th-desc">${esc(t.yongsin.reason)}</p>
    ${t.yongsin.johuFirst ? `<p class="th-desc">${esc(t.johu.summary)}</p>` : ''}
    <p class="th-basis">덜 필요한 기운 ${t.yongsin.avoid.map((e) => e).join('·')} · ${esc(t.yongsin.note)}</p>
  </div>`;

  const johu = `<div class="th-block">
    <div class="th-head"><span class="th-key">${termSpan('조후', '조후(調候)')}</span><b>${esc(t.johu.tempLabel)} · ${esc(t.johu.humidLabel)}</b></div>
    <p class="th-desc">${esc(t.johu.summary)}</p>
  </div>`;

  const root = `<div class="th-block">
    <div class="th-head"><span class="th-key">${termSpan('통근', '통근(通根)')}</span><b>${esc(a.strength.label)}</b></div>
    <ul class="th-list">${a.strength.detail.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    <p class="th-basis">일간 세력 ${a.strength.supportRatio}% · 뿌리 ${a.strength.rootCount}곳 · ${esc(a.strength.note)}</p>
  </div>`;

  const stages = `<div class="th-block">
    <div class="th-head"><span class="th-key">${termSpan('십이운성', '십이운성(十二運星)')}</span></div>
    <div class="unseong-row">${t.stages.map((s) => `
      <div class="us-cell"><span class="us-pos">${esc(s.pos)}지 ${esc(s.branch)}</span><b>${esc(s.unseong)}</b></div>`).join('')}</div>
    <p class="th-basis">일간이 각 지지에서 갖는 기세의 단계예요. 좋고 나쁨이 아니라 에너지의 국면을 봅니다.</p>
  </div>`;

  const sinsalBlock = `<div class="th-block">
    <div class="th-head"><span class="th-key">${termSpan('신살', '신살(神殺)')}</span><b>${sinsal.length ? `${sinsal.length}개 성립` : '두드러진 신살 없음'}</b></div>
    ${sinsal.length ? `<div class="sinsal-wrap">${sinsal.map((s) => `
      <div class="sinsal-card">
        <div class="sinsal-name">${esc(s.name)}<em>${esc(s.hanja)}</em>${s.where.length ? `<span>${esc(s.where.join('·'))}</span>` : ''}</div>
        <p>${esc(s.meaning)}</p>
      </div>`).join('')}</div>`
    : '<p class="th-desc">뚜렷하게 성립하는 신살이 없어요. 신살이 없다고 부족한 사주는 아니에요 — 특정 색이 덜 칠해졌을 뿐이에요.</p>'}
    <p class="th-basis">신살은 유파마다 기준이 조금씩 달라 참고로 봐 주세요.</p>
  </div>`;

  const rels = t.relations.length ? `<div class="th-block">
    <div class="th-head"><span class="th-key">${termSpan('형충회합', '형충회합(刑沖會合)')}</span><b>${t.relations.length}건</b></div>
    <div class="rel-chips">${t.relations.map((r) => `<span class="rel-chip rel-${r.tone}">${esc(r.label)}<em>${esc(r.from)}·${esc(r.to)}</em></span>`).join('')}</div>
    <p class="th-basis">원국 안 글자끼리 맺는 관계예요. 합(合)은 묶이고, 충·형은 흔들어 변화를 만들어요.</p>
  </div>` : '';

  return gyeok + yong + johu + root + stages + sinsalBlock + rels;
}

function daewoonHtml(d) {
  return `<div class="daewoon" role="list">${d.list.map((x, i) => {
    const cur = i === d.currentIndex;
    return `<div class="dw-cell ${cur ? 'now' : ''}" role="listitem">
      <div class="dw-age">${x.age}세${cur ? ' · 현재' : ''}</div>
      <div class="dw-gan el-${x.stemEl}">${x.hanja[0]}</div>
      <div class="dw-ji el-${x.branchEl}">${x.hanja[1]}</div>
      <div class="dw-kor">${esc(x.kor)}</div>
      <div class="dw-sip">${esc(x.sipseong)}</div>
    </div>`;
  }).join('')}</div>`;
}
function sewoonHtml(list) {
  return `<div class="sewoon">${list.map((x) => `
    <div class="sw-cell ${x.isCurrent ? 'now' : ''}">
      <div class="sw-year">${x.year}${x.isCurrent ? ' · 올해' : ''}</div>
      <div class="sw-gan">${esc(x.kor)}</div>
      <div class="sw-sip">${esc(x.sipseong)}·${esc(x.jisipseong)}</div>
    </div>`).join('')}</div>`;
}

// ── 공유 ───────────────────────────────────────────────────
function buildShareUrl(inputs, mode = 'solo') {
  const p = new URLSearchParams();
  inputs.forEach((input, i) => {
    const k = i + 1;
    if (input.name) p.set(K('n', k), input.name);
    p.set(K('g', k), input.gender); p.set(K('c', k), input.calendar);
    p.set(K('y', k), input.year); p.set(K('mo', k), input.month); p.set(K('d', k), input.day);
    if (input.hour !== null && input.hour !== undefined) { p.set(K('h', k), input.hour); p.set(K('mi', k), input.minute || 0); }
    if (input.isLeapMonth) p.set(K('leap', k), '1');
    p.set(K('lon', k), input.options.longitude);
  });
  // 계산 방식은 두 사람 공통
  p.set('tst', inputs[0].options.trueSolarTime ? '1' : '0');
  p.set('b', inputs[0].options.dayBoundary);
  if (mode === 'couple') p.set('m', 'c');
  return `${location.origin}${location.pathname}?${p.toString()}`;
}

// 공유하기 — 모바일은 OS 공유시트로 직행(카톡·텔레그램 등), PC는 자체 시트
async function onShareLink() {
  const url = state.shareUrl || location.href;
  const text = state.shareText || '사주 오행 분석';
  if (navigator.share) {
    try { await navigator.share({ title: '내 사주 오행 분석', text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  openShareSheet();
}

function openShareSheet() {
  const sheet = $('#share-sheet');
  const native = $('#share-native');
  native.hidden = !(navigator.share);
  sheet.hidden = false;
}
function closeShareSheet() { $('#share-sheet').hidden = true; }

function initShareSheet() {
  const sheet = $('#share-sheet');
  $('#share-close').addEventListener('click', closeShareSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeShareSheet(); });
  $$('.share-opt', sheet).forEach((b) => b.addEventListener('click', () => doShare(b.dataset.share)));
  if (KAKAO_JS_KEY) loadKakao();
}

function loadKakao() {
  if (window.Kakao) return;
  const s = document.createElement('script');
  s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
  s.onload = () => { try { window.Kakao.init(KAKAO_JS_KEY); } catch { /* noop */ } };
  document.head.appendChild(s);
}

async function doShare(kind) {
  const url = state.shareUrl || location.href;
  const text = state.shareText || '사주 오행 분석';
  switch (kind) {
    case 'telegram':
      window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      break;
    case 'x':
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
      break;
    case 'link':
      await copyText(url); toast('링크를 복사했어요 🔗');
      break;
    case 'kakao':
      if (window.Kakao && window.Kakao.isInitialized && window.Kakao.isInitialized()) {
        try {
          window.Kakao.Share.sendDefault({
            objectType: 'text', text: `${text}\n${url}`,
            link: { webUrl: url, mobileWebUrl: url },
          });
        } catch { await copyText(url); toast('링크를 복사했어요. 카카오톡에 붙여넣어 보내세요 💬'); }
      } else { await copyText(url); toast('링크를 복사했어요. 카카오톡에 붙여넣어 보내세요 💬'); }
      break;
    case 'image':
      await onShareImage(); break;
    case 'more':
      try { await navigator.share({ title: '내 사주 오행 분석', text, url }); } catch { /* 취소 */ }
      break;
  }
  if (kind !== 'image') closeShareSheet();
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch {
    const ta = document.createElement('textarea'); ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* noop */ } ta.remove();
  }
}

// 이미지 — 모바일은 파일 공유(카톡·텔레그램 전송 / 갤러리 저장), PC는 다운로드
async function onShareImage() {
  // 궁합 결과는 두 사람 카드 렌더러가 없어 링크 공유로 안내한다.
  if (state.lastCompat) { toast('궁합 결과는 링크로 공유해 주세요 🔗'); return; }
  const btn = $('#btn-save');
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '이미지 만드는 중…'; }
  else toast('이미지 만드는 중…');
  try {
    // 프리워밍이 끝나 있으면 대기 시간이 사실상 0 이라 iOS 공유 시트가 열린다.
    let blob = imageReady ? await imageReady : null;
    if (!blob) { prewarmShareImage(); blob = await imageReady; }
    if (!blob) throw new Error('canvas');
    closeShareSheet();

    // 파일명은 ASCII 로 — 일부 안드로이드 브라우저가 한글 파일명을 저장하다 실패한다.
    const how = await deliverImage(blob, {
      fileName: `ohaeng-saju-${state.lastSaju.solar.year}${String(state.lastSaju.solar.month).padStart(2, '0')}${String(state.lastSaju.solar.day).padStart(2, '0')}.png`,
      title: '내 사주 오행 분석',
      text: state.shareText,
    });
    if (how === 'downloaded') toast('이미지를 저장했어요 🖼️');
  } catch { toast('이미지 생성에 실패했어요. 다시 시도해 주세요.'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
}

/**
 * 생년월일 한 줄 해석 카드 (라운드 8).
 * 원국 표를 읽기 전에 "나는 어떤 결의 사람인가"를 먼저 잡아 준다.
 */
function personaHtml(p) {
  return `
    <div class="persona-card fade-in">
      <div class="persona-top">
        <span class="persona-emoji" aria-hidden="true">${p.emoji}</span>
        <div class="persona-label">
          <b>${esc(p.label)}</b>
          <small>${esc(p.stem)}(${esc(p.stemImage.hanja)}) 일간 · ${esc(p.season)}에 태어남</small>
        </div>
      </div>
      <p class="persona-tagline">${esc(p.tagline)}</p>
      <div class="persona-traits chips">
        ${p.traits.map((t) => `<span class="chip on">${esc(t)}</span>`).join('')}
      </div>
      <p class="persona-desc">${esc(p.desc)}</p>
      <div class="persona-stance">
        <b>${esc(p.season)}에 태어난 ${esc(p.stemImage.short)} — ${esc(p.stance.label)}</b>
        <p>${esc(p.stance.line)} ${esc(p.stance.advice)}</p>
      </div>
      <details class="persona-more">
        <summary>이 결이 가진 그늘도 볼게요</summary>
        <p>${esc(p.caution)}</p>
      </details>
      <p class="persona-note">
        일간을 자연물에 빗대 읽는 <span class="term" data-term="물상론">물상론</span>과
        태어난 달의 기운(<span class="term" data-term="조후">조후</span>)을 겹쳐 본 첫인상이에요.
        정밀한 판정은 아래 격국·용신에서 이어집니다.
      </p>
    </div>`;
}

function birthText(s) {
  const i = s.input, sol = s.solar;
  const cal = i.calendar === 'lunar' ? `음력 ${i.year}.${i.month}.${i.day}${i.isLeapMonth ? '(윤)' : ''} → ` : '';
  const time = sol.hour === null ? '시간 미상' : `${String(sol.hour).padStart(2, '0')}:${String(sol.minute).padStart(2, '0')}`;
  return `${cal}양력 ${sol.year}.${String(sol.month).padStart(2, '0')}.${String(sol.day).padStart(2, '0')} · ${time} · ${i.gender}`;
}
function typeHtml(label) {
  // 마지막 'OO형' 만 강조
  const m = label.match(/(.+?)([가-힣]+형)$/);
  return m ? `${esc(m[1])}<b>${esc(m[2])}</b>` : esc(label);
}

// 주의: 아래 pillarsHtml/corrHtml에 삽입되는 값(한자·한글 간지, 십성명, 절기명, 수치 보정)은
// 모두 엔진의 고정 상수 테이블에서 산출된 결정적 데이터로 사용자 입력이 아니다(주입 벡터 없음).
// 유일한 자유입력인 '이름'은 result-name·풀이 마크다운에서 esc()로 처리된다.
function pillarsHtml(saju, a) {
  const order = [['년', saju.pillars.year], ['월', saju.pillars.month], ['일', saju.pillars.day], ['시', saju.pillars.hour]];
  return `<div class="pillars">${order.map(([lab, pil]) => {
    if (!pil) return `<div class="pcol"><div class="pcol-label">${lab}주</div>
      <div class="gan el-금" style="opacity:.5"><div class="han">?</div><div class="kor">미상</div></div>
      <div class="ji el-금" style="opacity:.5"><div class="han">?</div><div class="kor"></div></div>
      <div class="sipseong-tag"></div></div>`;
    const sEl = STEM_ELEMENT[pil.stemIdx], bEl = BRANCH_ELEMENT[pil.branchIdx];
    const isMe = lab === '일';
    const ganSip = isMe ? '일간(나)' : sipseongOf(saju.ilgan, STEMS[pil.stemIdx]);
    const bMain = HIDDEN_STEMS[BRANCHES[pil.branchIdx]].slice(-1)[0];
    const jiSip = sipseongOf(saju.ilgan, bMain);
    return `<div class="pcol ${isMe ? 'me' : ''}">
      <div class="pcol-label">${lab}주</div>
      <div class="gan el-${sEl}"><div class="han">${pil.hanja[0]}</div><div class="kor">${pil.kor[0]} · ${sEl}</div></div>
      <div class="ji el-${bEl}"><div class="han">${pil.hanja[1]}</div><div class="kor">${pil.kor[1]} · ${bEl}</div></div>
      <div class="sipseong-tag">${ganSip} / ${jiSip}</div>
    </div>`;
  }).join('')}</div>`;
}

function corrHtml(saju) {
  const c = saju.corrections;
  const parts = [];
  parts.push(`${termSpan('일간', '일간')} <b>${saju.ilgan}(${saju.ilganHanja})</b> · 절기 <b>${saju.currentTerm}</b>`);
  if (c.trueSolarTime && saju.solar.hour !== null) {
    parts.push(`${termSpan('진태양시', '진태양시')} 보정 적용 (경도 ${c.longitudeCorrMin > 0 ? '+' : ''}${c.longitudeCorrMin}분, 균시차 ${c.eotMin > 0 ? '+' : ''}${c.eotMin}분 → 보정시각 <b>${c.correctedTime}</b>)`);
  }
  if (c.dstApplied) parts.push(`서머타임 적용 시기 (−60분 보정)`);
  parts.push(`${termSpan('자시', '일주 경계')}: ${c.dayBoundary === '자시' ? '자시(23시)설' : '자정(00시)설'}`);
  return `<div class="corr-note">${parts.join('<br/>')}</div>`;
}

function ohaengHtml(a) {
  const c = a.elements.count;
  const max = Math.max(...Object.values(c), 1);
  return `<div class="ohaeng-list">${ELEMENTS.map((e) => `
    <div class="ohaeng-row">
      <span class="ohaeng-name txt-${e}">${e}</span>
      <span class="ohaeng-bar"><i class="bar-${e}" style="width:${(c[e] / max) * 100}%"></i></span>
      <span class="ohaeng-val">${c[e]}자 · ${a.elements.weightedPct[e]}%</span>
    </div>`).join('')}</div>`;
}
function ohaengKpiHtml(a) {
  return `<div class="kpi-row">
    <div class="kpi"><div class="kpi-lab">강한 오행</div><div class="kpi-val txt-${a.elements.strong[0]}">${a.elements.strong.join('·')}</div><div class="kpi-sub">기운이 가장 두텁습니다</div></div>
    <div class="kpi"><div class="kpi-lab">${a.elements.missing.length ? '없는 오행' : '약한 오행'}</div><div class="kpi-val">${(a.elements.missing.length ? a.elements.missing : a.elements.weak).join('·') || '—'}</div><div class="kpi-sub">의식적으로 채울 자리</div></div>
    <div class="kpi"><div class="kpi-lab">${termSpan('신강신약', '신강·신약')}</div><div class="kpi-val">${a.strength.label.replace(/\(.+\)/, '')}</div><div class="kpi-sub">일간 세력 ${a.strength.supportRatio}% (참고)</div></div>
    <div class="kpi"><div class="kpi-lab">${termSpan('월령', '월령')} ${termSpan('십성', '십성')}</div><div class="kpi-val">${a.sipseong.monthGod}</div><div class="kpi-sub">타고난 기질 방향</div></div>
  </div>`;
}

function gaugeHtml(a) {
  return `<div class="gauge">
    <div class="gauge-ring" style="--p:${a.spiritScore}"><span>${a.spiritScore}</span></div>
    <div class="gauge-txt">
      <b>영성 잠재력 ${a.spiritScore}점</b>
      <p>7대 지표 중 <b>${a.presentCount}개</b>가 원국에 드러납니다. 점수는 잠재력의 요약일 뿐, 우열이 아닙니다.</p>
    </div>
  </div>`;
}
function indicatorsHtml(a) {
  return a.indicators.map((i) => `
    <div class="ind-card ${i.present ? 'on' : ''}">
      <div class="ind-head"><span class="ind-dot"></span>${termSpan(INDICATOR_GLOSS[i.key], i.name)}</div>
      <p class="ind-evi">${esc(i.evidence)}</p>
      ${i.present ? `<p class="ind-mean">${esc(i.meaning)}</p>` : ''}
    </div>`).join('');
}
function combosHtml(a) {
  return a.specialCombos.map((c) => {
    const [head, tail] = c.split(' — ');
    return `<div class="combo"><b>${esc(head)}</b>${tail ? `<br/>${esc(tail)}` : ''}</div>`;
  }).join('');
}
function secHtml(s) {
  return `<div class="reading-sec"><h3 class="r-title">${esc(s.title)}</h3><div class="md">${md(s.md)}</div></div>`;
}

// ── 프롬프트 복사 ─────────────────────────────────────────
async function copyPrompt() {
  const btn = $('#btn-copy');
  try {
    const res = await fetch('./data/prompt-template.txt');
    const template = await res.text();
    const full = buildPrompt(state.lastSaju, template, state.lastLuck);
    await navigator.clipboard.writeText(full);
    toast('프롬프트를 복사했어요! GPT·Claude에 붙여넣어 보세요 📋');
    btn.textContent = '✓ 복사됨 — GPT·Claude에 붙여넣기';
    setTimeout(() => { btn.textContent = '✦ 이 원국으로 GPT·Claude에 깊이 물어보기 (프롬프트 복사)'; }, 2600);
  } catch {
    // 클립보드 API 실패 시 fallback: 텍스트 영역 노출
    fallbackCopy();
  }
}
/** 궁합 프롬프트 복사 */
async function copyCompatPrompt() {
  const btn = $('#btn-copy');
  const orig = '✦ 두 원국으로 GPT·Claude에 궁합 물어보기 (프롬프트 복사)';
  let full;
  try {
    const res = await fetch('./data/compat-prompt-template.txt');
    if (!res.ok) throw new Error('template');
    full = buildCompatPrompt(state.lastPair[0].saju, state.lastPair[1].saju, await res.text(), state.lastCompat);
  } catch {
    toast('프롬프트 파일을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  try {
    await navigator.clipboard.writeText(full);
    toast('궁합 프롬프트를 복사했어요! GPT·Claude에 붙여넣어 보세요 📋');
    btn.textContent = '✓ 복사됨 — GPT·Claude에 붙여넣기';
    setTimeout(() => { btn.textContent = orig; }, 2600);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = full; ta.style.cssText = 'position:fixed;top:10%;left:5%;width:90%;height:70%;z-index:200;font-size:12px;padding:12px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('궁합 프롬프트를 복사했어요 📋'); } catch { toast('아래 텍스트를 길게 눌러 복사하세요'); }
    setTimeout(() => ta.remove(), 4000);
  }
}

async function fallbackCopy() {
  let full;
  try {
    const res = await fetch('./data/prompt-template.txt');
    full = buildPrompt(state.lastSaju, await res.text(), state.lastLuck);
  } catch {
    toast('프롬프트 파일을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = full; ta.style.cssText = 'position:fixed;top:10%;left:5%;width:90%;height:70%;z-index:200;font-size:12px;padding:12px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('프롬프트를 복사했어요 📋'); } catch { toast('아래 텍스트를 길게 눌러 복사하세요'); }
  setTimeout(() => ta.remove(), 4000);
}

// ── 토스트 ────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── 미니 마크다운 렌더러 ──────────────────────────────────
function md(src) {
  const lines = src.split('\n');
  let html = '', i = 0;
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_(.+?)_/g, '<em>$1</em>');
  while (i < lines.length) {
    let l = lines[i];
    if (l.trim() === '') { i++; continue; }
    // 표
    if (l.trim().startsWith('|')) {
      const tbl = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tbl.push(lines[i]); i++; }
      const rows = tbl.filter((r) => !/^\|[\s|:]*-[\s|:-]*\|$/.test(r.trim())); // separator는 '-' 필수
      html += '<table>';
      rows.forEach((r, ri) => {
        const cells = r.split('|').slice(1, -1).map((c) => c.trim());
        const tag = ri === 0 ? 'th' : 'td';
        html += '<tr>' + cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('') + '</tr>';
      });
      html += '</table>'; continue;
    }
    // 헤딩
    if (l.startsWith('### ')) { html += `<h3>${inline(l.slice(4))}</h3>`; i++; continue; }
    // 인용
    if (l.startsWith('> ')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('> ')) { q.push(lines[i].slice(2)); i++; }
      html += `<blockquote>${inline(q.join('<br/>'))}</blockquote>`; continue;
    }
    // 순서 목록
    if (/^\d+\.\s/.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++; }
      html += `<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`; continue;
    }
    // 비순서 목록
    if (l.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(lines[i].slice(2)); i++; }
      html += `<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`; continue;
    }
    // 문단
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#|>|-|\d+\.|\|)/.test(lines[i])) { para.push(lines[i]); i++; }
    html += `<p>${inline(para.join(' '))}</p>`;
  }
  return html;
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

init();
