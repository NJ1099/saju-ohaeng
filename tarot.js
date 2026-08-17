// ============================================================
//  타로 UI — 주제 선택 → 셔플 → 3장 선택 → 공개 → 해석 렌더.
//
//  · engine/tarot.js 는 순수 로직만 갖고, 이 파일이 DOM·fetch·이벤트를 맡는다.
//  · 덱 데이터(약 180KB)는 **타로 라우트에 처음 들어올 때만** 불러온다.
//    사주만 쓰는 사용자에게 타로 데이터를 지우지 않기 위함이다.
//  · 카드 앞면 이미지는 뽑힌 3장만 불러온다. 78장을 미리 받지 않는다.
// ============================================================
import {
  buildDeck, indexDeck, drawSpread, readSpread,
  encodeDraw, decodeDraw, SUITS,
} from './engine/tarot.js';
import { buildTarotPrompt } from './engine/promptBuilder.js';
import { onRoute, go, currentRoute } from './router.js';
import { drawTarotCard, canvasToBlob, deliverImage } from './share.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DRAW_COUNT = 3;

const state = {
  loaded: false,
  loading: null,      // 진행 중인 로드 Promise (중복 fetch 방지)
  deck: null,
  byId: null,
  topics: null,
  topicKey: null,
  allowReversed: true,
  fan: [],            // 아치에 남아 있는 카드 (deck 인덱스 배열, 셔플 결과)
  cardEls: [],        // fan 과 1:1 대응하는 버튼 요소
  active: 0,          // 아치 꼭대기 카드의 인덱스 (드래그 중에는 소수)
  picked: [],         // [{id, o}] 사용자가 고른 순서대로
  reading: null,
  pendingShare: null, // 공유 링크로 들어온 경우 로드 후 복원할 값
};

// ── 데이터 로드 ───────────────────────────────────────────
async function loadData() {
  if (state.loaded) return;
  if (state.loading) return state.loading;

  state.loading = (async () => {
    const files = ['major', 'wands', 'cups', 'swords', 'pents'];
    const [topicsJson, ...parts] = await Promise.all([
      fetch('./data/tarot-topics.json').then((r) => r.json()),
      ...files.map((f) => fetch(`./data/tarot/${f}.json`).then((r) => r.json())),
    ]);
    state.deck = buildDeck(Object.fromEntries(files.map((f, i) => [f, parts[i]])));
    state.byId = indexDeck(state.deck);
    state.topics = topicsJson.topics;
    state.loaded = true;
  })();

  try { await state.loading; } finally { state.loading = null; }
}

// ── 진입 ──────────────────────────────────────────────────
/** 타로 라우트에 들어올 때마다 하는 일. */
async function enterTarot() {
  try {
    await loadData();
  } catch (err) {
    showTopicView();
    $('#t-topics').innerHTML = `<div class="t-error">카드 데이터를 불러오지 못했습니다. 새로고침해 주세요.<br/><small>${esc(err.message)}</small></div>`;
    return;
  }
  renderTopics();
  // 공유 링크로 들어왔다면 곧바로 그 결과를 복원한다.
  if (state.pendingShare) { restoreShared(state.pendingShare); state.pendingShare = null; }
}

function init() {
  onRoute((to) => { if (to === 'tarot') enterTarot(); });

  // ⚠️ app.js 가 먼저 로드되면서 initRouter() 로 초기 라우트를 이미 적용해 버린다.
  //    위 리스너는 그 뒤에 등록되므로 첫 진입 이벤트를 놓친다 —
  //    지금 이미 타로 라우트라면 직접 한 번 태워 준다.
  if (currentRoute() === 'tarot') queueMicrotask(enterTarot);

  $('#t-reversed').addEventListener('change', (e) => { state.allowReversed = e.target.checked; });
  $('#t-shuffle').addEventListener('click', () => shuffleDeck());
  $('#t-auto').addEventListener('click', () => autoPick());
  $('#t-pick').addEventListener('click', () => pickActive());
  bindDeck();

  // 화면 회전·창 크기 변경 시 아치를 다시 잰다.
  // 카드 순서와 뽑은 카드는 그대로 두고 기하만 갱신한다.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!state.cardEls.length) return;
    if ($('#view-tarot-draw').classList.contains('hidden')) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); layout(false); }, 180);
  });

  // 해시 없는 공유 링크(?t=..&c=..)는 라우터가 tarot 으로 보내 준다.
  const p = new URLSearchParams(location.search);
  if (p.get('t') && p.get('c')) state.pendingShare = { t: p.get('t'), c: p.get('c') };
}

// ── 화면 전환 ─────────────────────────────────────────────
function showView(id) {
  for (const v of ['view-tarot-topic', 'view-tarot-draw', 'view-tarot-result']) {
    $(`#${v}`).classList.toggle('hidden', v !== id);
  }
  window.scrollTo(0, 0);
}
const showTopicView = () => showView('view-tarot-topic');

// ── 1. 주제 선택 ──────────────────────────────────────────
function renderTopics() {
  const wrap = $('#t-topics');
  if (wrap.dataset.ready === '1') return;   // 라우트를 오갈 때마다 다시 그리지 않는다
  wrap.innerHTML = state.topics.map((t) => `
    <button type="button" class="t-topic" data-topic="${esc(t.key)}" aria-pressed="false">
      ${esc(t.short)}<small>${esc(t.label)}</small>
    </button>`).join('');
  for (const b of $$('.t-topic', wrap)) {
    b.addEventListener('click', () => selectTopic(b.dataset.topic));
  }
  wrap.dataset.ready = '1';
}

function selectTopic(key) {
  state.topicKey = key;
  for (const b of $$('.t-topic')) b.setAttribute('aria-pressed', String(b.dataset.topic === key));
  startDraw();
}

// ── 2. 뽑기 화면 ──────────────────────────────────────────
function startDraw() {
  const topic = state.topics.find((t) => t.key === state.topicKey);
  state.picked = [];
  $('#t-draw-topic').textContent = `${topic.label} · 세 장`;
  $('#t-draw-title').textContent = '마음이 가는 카드를 세 장 골라 주세요';
  renderSlots(topic);
  showView('view-tarot-draw');
  buildFan();   // 뷰를 먼저 보여야 clientWidth 로 카드 간격을 잴 수 있다
}

/** 뽑은 카드가 안착할 세 자리. 자리 이름은 주제마다 다르다. */
function renderSlots(topic) {
  $('#t-slots').innerHTML = topic.positions.map((p, i) => `
    <div class="t-slot" data-i="${i}">
      <div class="t-slot-box">${i + 1}</div>
      <span class="t-slot-label">${esc(p.label)}</span>
    </div>`).join('');
}

// ── 덱 배치 — 무지개 아치 캐러셀 ──────────────────────────
// 라운드 7은 6줄 × 13장 격자였다. 카드 한 장의 노출 폭이 54px 남짓이라
// 옆 카드를 잘못 누르는 일이 잦았다. 라운드 8에서
// **"가운데 한 장을 크게 보고 고르는"** 방식으로 바꿨다.
//  · 78장이 위로 볼록한 원호(무지개) 위에 놓인다. 양끝은 화면 밖으로 흘러 반쯤만 보인다.
//  · 휠·드래그·좌우 방향키로 아치가 돌고, 꼭대기 한 장만 '활성'이다.
//  · 옆 카드를 눌러도 뽑히지 않고 가운데로 온다 — 오선택이 구조적으로 불가능하다.
const ARC = {
  MIN_W: 74, MAX_W: 110,   // 카드 폭 상·하한(px)
  RATIO: 1.68,             // 원본 카드 비율 100:168
  GAP: 0.46,               // 이웃 카드가 내어 주는 폭(카드 폭 대비) → 각도 간격을 정한다
  ACTIVE: 1.52,            // 가운데 카드 확대 배율
  SPAN: 1.45,              // 확대·부상이 번지는 범위(카드 장수). 작을수록 가운데만 도드라진다
};
/** 드래그 감도 — 1 이면 손끝과 카드가 1:1, 낮출수록 같은 거리로 더 많이 돈다. */
const DRAG_GAIN = 0.62;
/** 마지막으로 잰 아치 기하. `measure()`가 채운다. */
const geo = { w: 380, cw: 90, ch: 151, r: 330, step: 7.2 };

/** 컨테이너 폭에 맞춰 카드 크기·반지름·각도 간격을 다시 잰다. */
function measure() {
  const deckEl = $('#t-deck');
  // 뷰 전환 직전이라 아직 폭이 0이면 모바일 기준으로 잡는다.
  const w = Math.min(deckEl.clientWidth || 380, 470);
  const cw = Math.round(Math.min(ARC.MAX_W, Math.max(ARC.MIN_W, w * 0.235)));
  const ch = Math.round(cw * ARC.RATIO);
  const r = Math.round(Math.max(250, w * 0.86));
  const step = ((cw * ARC.GAP) / r) * (180 / Math.PI);
  Object.assign(geo, { w, cw, ch, r, step });

  deckEl.style.setProperty('--cw', `${cw}px`);
  deckEl.style.setProperty('--ch', `${ch}px`);
  deckEl.style.setProperty('--r', `${r}px`);
  // 히트 박스 폭 = 이웃 카드 사이의 실제 간격(호 길이). 이보다 넓히면 클릭을 서로 가로챈다.
  deckEl.style.setProperty('--hit-w', `${(cw * ARC.GAP).toFixed(1)}px`);

  // 높이 = 확대 여유 + 카드 + 아치가 내려앉는 만큼.
  // 가장자리까지 전부 담으면 화면을 다 먹으므로 55%만 담고 나머지는 잘리게 둔다
  // (잘리는 구간은 이미 흐려져 있어 '무지개 끝'처럼 보인다).
  const edge = Math.min(1, (w / 2 + cw) / r);
  const sag = r * (1 - Math.cos(Math.asin(edge)));
  const padTop = Math.round(ch * (ARC.ACTIVE - 1)) + 14;
  deckEl.style.setProperty('--pad-top', `${padTop}px`);
  deckEl.style.height = `${Math.round(padTop + ch + sag * 0.55 + 8)}px`;
}

/** 78장을 아치 위에 새로 편다(순서도 다시 섞는다). */
function buildFan() {
  const deckEl = $('#t-deck');
  state.fan = shuffledIndices(state.deck.length);
  state.active = (state.fan.length - 1) / 2;

  measure();
  deckEl.innerHTML = state.fan
    .map((_, i) => `<button type="button" class="t-card" data-i="${i}" tabindex="-1"
        aria-label="${i + 1}번째 카드"><i><b>${i + 1}</b></i></button>`)
    .join('');
  state.cardEls = $$('.t-card', deckEl);

  state.active = Math.round(state.active);
  layout(false);
  updateCounter();
}

/** 활성 인덱스를 기준으로 78장의 위치·크기·밝기를 다시 계산한다. */
function layout(animate = true) {
  const deckEl = $('#t-deck');
  deckEl.classList.toggle('no-anim', !animate);

  const active = state.active;
  const edgeX = geo.w / 2 + geo.cw * 0.85;   // 이 밖으로 나가면 완전히 사라진다

  state.cardEls.forEach((el, i) => {
    const d = i - active;
    const deg = d * geo.step;
    const x = geo.r * Math.sin((deg * Math.PI) / 180);
    const near = Math.max(0, 1 - Math.abs(d) / ARC.SPAN);   // 1=꼭대기, 0=멀리

    // 가장자리에서 서서히 사라진다(t 0.72 부터 페이드).
    const t = Math.abs(x) / edgeX;
    const fade = t >= 1 ? 0 : t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
    const shown = fade > 0.02 && Math.abs(deg) < 100;

    el.style.transform = `rotate(${deg.toFixed(2)}deg)`;
    el.style.opacity = shown ? fade.toFixed(3) : '0';
    el.style.visibility = shown ? '' : 'hidden';
    el.style.zIndex = String(300 - Math.min(299, Math.round(Math.abs(d) * 10)));
    el.style.setProperty('--s', (1 + (ARC.ACTIVE - 1) * near).toFixed(3));
    el.style.setProperty('--lift', `${(-12 * near).toFixed(1)}px`);
    el.style.setProperty('--dim', (0.72 + 0.28 * near).toFixed(3));
    // 번호는 **가려지지 않는 바깥쪽 가장자리**에 붙인다. 이웃 카드는 중앙에 가까운
    // 쪽이 위에 쌓이므로, 중앙 정렬로 두면 양옆 카드의 번호가 전부 가려진다.
    el.style.setProperty('--nx', d > 0.5 ? '32%' : d < -0.5 ? '-32%' : '0%');
  });

  const cur = Math.round(active);
  state.cardEls.forEach((el, i) => {
    const on = i === cur;
    el.classList.toggle('active', on);
    el.tabIndex = on ? 0 : -1;
    el.setAttribute('aria-label', on ? `${i + 1}번째 카드 — 다시 누르면 뽑아요` : `${i + 1}번째 카드`);
  });
}

/** 드래그·휠처럼 연속으로 들어오는 입력은 프레임당 한 번만 그린다. */
let layoutRaf = 0;
function scheduleLayout() {
  if (layoutRaf) return;
  layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; layout(false); });
}

const clampIdx = (v) => Math.max(0, Math.min(state.cardEls.length - 1, v));

/** 특정 카드를 꼭대기로 굴린다. */
function setActive(i, animate = true) {
  state.active = clampIdx(i);
  layout(animate);
  updateCounter();
}

/** 지금 몇 번째 카드를 보고 있는지 + 남은 장수. */
function updateCounter() {
  const left = state.cardEls.length;
  const no = left ? Math.round(state.active) + 1 : 0;
  const noEl = $('#t-counter-no');
  if (noEl) noEl.textContent = left ? String(no) : '–';
  const totalEl = $('#t-counter-total');
  if (totalEl) totalEl.textContent = `남은 ${left}장`;
  const pickEl = $('#t-pick');
  if (pickEl) pickEl.disabled = !left || state.picked.length >= DRAW_COUNT;
}

const prefersReduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 덱 조작 (휠 · 드래그 · 키보드 · 탭) ───────────────────
/** #t-deck 은 재빌드 때 innerHTML 만 갈리므로 리스너는 한 번만 건다. */
function bindDeck() {
  const deckEl = $('#t-deck');
  const locked = () => state.picked.length >= DRAW_COUNT || !state.cardEls.length;

  // 휠·트랙패드 — 세로/가로 어느 쪽으로 굴려도 아치가 돈다.
  // WHEEL_PX 는 카드 한 장을 넘기는 데 필요한 스크롤 양. 마우스 휠 한 노치(≈100px)에
  // 네 장쯤 넘어가는 감도다. 더 낮추면 트랙패드에서 통제가 안 된다.
  const WHEEL_PX = 22;
  let wheelAcc = 0;
  deckEl.addEventListener('wheel', (e) => {
    if (locked()) return;
    e.preventDefault();
    wheelAcc += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    const n = Math.trunc(wheelAcc / WHEEL_PX);
    if (!n) return;
    wheelAcc -= n * WHEEL_PX;
    setActive(Math.round(state.active) + n);
  }, { passive: false });

  // 드래그 — 가로·세로 모두 받는다(모바일에서 세로로 쓸어도 카드가 넘어가게).
  let drag = null;
  deckEl.addEventListener('pointerdown', (e) => {
    if (locked()) return;
    // 캡처 뒤에는 e.target 이 덱으로 바뀔 수 있어, 누른 카드를 지금 기억해 둔다.
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: state.active, moved: 0, el: e.target.closest('.t-card') };
    try { deckEl.setPointerCapture(e.pointerId); } catch { /* 캡처 미지원 */ }
    deckEl.classList.add('dragging');
  });
  deckEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    // 한 장 넘기는 데 필요한 픽셀. 호 길이 그대로 쓰면 78장을 훑는 데 손이 너무 많이 가서
    // DRAG_GAIN 만큼 짧게 잡는다(= 같은 거리로 더 많이 돈다).
    const perCard = ((geo.r * geo.step * Math.PI) / 180) * DRAG_GAIN;
    state.active = clampIdx(drag.from - (dx + dy) / perCard);
    scheduleLayout();
    updateCounter();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, el } = drag;
    drag = null;
    deckEl.classList.remove('dragging');
    setActive(Math.round(state.active));
    if (moved >= 8 || !el) return;         // 밀었으면 탭이 아니다
    tapCard(Number(el.dataset.i));
  };
  deckEl.addEventListener('pointerup', endDrag);
  deckEl.addEventListener('pointercancel', endDrag);

  // 키보드로 누른 클릭(detail === 0)만 여기서 받는다 — 포인터 탭은 위에서 처리했다.
  deckEl.addEventListener('click', (e) => {
    if (e.detail !== 0 || locked()) return;
    const el = e.target.closest('.t-card');
    if (el) tapCard(Number(el.dataset.i));
  });

  deckEl.addEventListener('keydown', (e) => {
    if (locked()) return;
    const cur = Math.round(state.active);
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1, PageUp: -8, PageDown: 8 }[e.key];
    if (move !== undefined) { e.preventDefault(); setActive(cur + move); focusActive(); return; }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); focusActive(); return; }
    if (e.key === 'End') { e.preventDefault(); setActive(state.cardEls.length - 1); focusActive(); }
  });
}

function focusActive() {
  const el = state.cardEls[Math.round(state.active)];
  if (el && document.activeElement !== el) el.focus({ preventScroll: true });
}

/** 카드 탭 — 가운데 카드면 뽑고, 아니면 가운데로 굴려 온다. */
function tapCard(i) {
  if (!Number.isFinite(i)) return;
  if (i === Math.round(state.active)) pickActive();
  else setActive(i);
}

/** 0..n-1 을 섞은 배열 (어떤 카드가 어느 자리에 있는지는 사용자에게 안 보인다). */
function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  const rnd = () => {
    const c = globalThis.crypto;
    if (c?.getRandomValues) { const b = new Uint32Array(1); c.getRandomValues(b); return b[0] / 2 ** 32; }
    return Math.random();
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 다시 섞기 — 카드가 가운데로 겹쳤다가 새 순서로 다시 펴진다. */
function shuffleDeck() {
  const deckEl = $('#t-deck');
  if (!state.cardEls.length) return;

  const rebuild = () => {
    deckEl.classList.remove('shuffling');
    state.picked = [];
    $('#t-draw-title').textContent = '마음이 가는 카드를 세 장 골라 주세요';
    renderSlots(state.topics.find((t) => t.key === state.topicKey));
    buildFan();
  };

  if (prefersReduce()) { rebuild(); return; }
  deckEl.classList.add('shuffling');
  setTimeout(rebuild, 340);
}

/** 가운데 카드를 뽑는다. 뽑힌 자리는 나머지 카드가 메운다. */
function pickActive() {
  if (state.picked.length >= DRAW_COUNT) return;
  const idx = Math.round(state.active);
  const el = state.cardEls[idx];
  if (!el) return;

  const card = state.deck[state.fan[idx]];
  const o = state.allowReversed && randBool() ? 'r' : 'u';
  const slotIdx = state.picked.length;
  state.picked.push({ id: card.id, o });

  flyToSlot(el, slotIdx);
  removeCard(idx);

  if (state.picked.length === DRAW_COUNT) {
    $('#t-draw-title').textContent = '세 장이 모였어요';
    setTimeout(() => reveal(), prefersReduce() ? 120 : 1000);
  }
}

/** 뽑힌 카드를 아치에서 빼고, 뒤 카드들의 번호를 당긴다. */
function removeCard(idx) {
  state.fan.splice(idx, 1);
  const [el] = state.cardEls.splice(idx, 1);
  el.remove();
  state.cardEls.forEach((c, i) => {
    c.dataset.i = String(i);
    c.querySelector('b').textContent = String(i + 1);
  });
  state.active = clampIdx(idx);
  layout();
  updateCounter();
}

/** 카드가 아치에서 위로 쑥 빠져나와 슬롯에 안착하는 연출 (FLIP). */
function flyToSlot(el, slotIdx) {
  const slot = $(`.t-slot[data-i="${slotIdx}"] .t-slot-box`);
  if (!slot || prefersReduce()) { fillSlot(slotIdx); return; }

  const from = el.querySelector('i').getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  if (!from.width || !to.width) { fillSlot(slotIdx); return; }

  const ghost = document.createElement('div');
  ghost.className = 't-ghost';
  ghost.style.cssText =
    `left:${from.left}px; top:${from.top}px; width:${from.width}px; height:${from.height}px;`;
  document.body.appendChild(ghost);

  // ① 아치에서 위로 뽑혀 나온다
  requestAnimationFrame(() => { ghost.style.transform = 'translateY(-46px) scale(1.06)'; });

  // ② 슬롯 자리로 날아가 크기를 맞춘다
  setTimeout(() => {
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    ghost.style.transition = 'transform .46s cubic-bezier(.5,0,.2,1), opacity .3s ease .3s';
    ghost.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(to.width / from.width).toFixed(3)})`;
    ghost.style.opacity = '0';
    setTimeout(() => { ghost.remove(); fillSlot(slotIdx); }, 430);
  }, 300);
}

function randBool() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) { const b = new Uint32Array(1); c.getRandomValues(b); return b[0] / 2 ** 32 < 0.5; }
  return Math.random() < 0.5;
}

function fillSlot(i) {
  const slot = $(`.t-slot[data-i="${i}"]`);
  if (!slot) return;
  slot.classList.add('filled');
  slot.querySelector('.t-slot-box').innerHTML = '<div class="t-slot-card"></div>';
}

/** 알아서 뽑기 — 아치를 무작위 위치로 굴린 뒤 한 장씩 순서대로 뽑는다. */
function autoPick() {
  const reduce = prefersReduce();
  const step = () => {
    if (state.picked.length >= DRAW_COUNT || !state.cardEls.length) return;
    setActive(Math.floor(Math.random() * state.cardEls.length));
    setTimeout(() => {
      pickActive();
      if (state.picked.length < DRAW_COUNT) setTimeout(step, reduce ? 0 : 520);
    }, reduce ? 0 : 420);
  };
  step();
}

// ── 3. 공개 · 결과 ────────────────────────────────────────
function reveal() {
  let reading;
  try {
    reading = readSpread(state.picked, state.topicKey, state.topics, state.byId);
  } catch (err) {
    showView('view-tarot-result');
    $('#t-result-root').innerHTML = `<div class="t-error">해석을 만들지 못했습니다: ${esc(err.message)}</div>`;
    return;
  }
  state.reading = reading;
  renderReading(reading);
  showView('view-tarot-result');
  updateShareUrl();
}

/** 공유 링크로 들어온 결과를 그대로 되살린다. */
function restoreShared({ t, c }) {
  const draw = decodeDraw(c, state.byId);
  const topic = state.topics.find((x) => x.key === t);
  if (!draw || !topic || draw.length !== DRAW_COUNT) {
    showTopicView();   // 손상된 링크는 조용히 주제 선택으로 떨어뜨린다
    return;
  }
  state.topicKey = t;
  state.picked = draw;
  for (const b of $$('.t-topic')) b.setAttribute('aria-pressed', String(b.dataset.topic === t));
  reveal();
}

function renderReading(r) {
  const { topic, cards, summary } = r;

  const spread = cards.map((c, i) => `
    <div class="t-spread-item">
      <div class="t-face-wrap">
        <div class="t-face${c.reversed ? ' reversed' : ''}" style="--d:${(i * 0.16).toFixed(2)}s">
          <img src="./${esc(c.card.img)}" alt="${esc(c.card.name)}" loading="lazy" decoding="async" width="330" height="554" />
        </div>
      </div>
      <div class="t-spread-cap">
        <span class="t-pos-label">${esc(c.position.label)}</span>
        <span class="t-card-name">${esc(c.card.name)}</span>
        <span class="t-card-en">${esc(c.card.en)}</span>
        <span class="t-ori${c.reversed ? ' rev' : ''}">${c.reversed ? '역방향' : '정방향'}</span>
      </div>
    </div>`).join('');

  const blocks = cards.map((c) => `
    <div class="t-block">
      <div class="t-block-head">
        <span class="t-block-pos">${esc(c.position.label)}</span>
        <span class="t-block-name">${esc(c.card.name)}</span>
        <span class="t-block-hint">${esc(c.position.hint)} · ${esc(c.card.suitLabel)}${c.card.element ? ` · ${esc(c.card.element)}` : ''}</span>
      </div>
      <div class="t-kw">${c.keywords.map((k) => `<span>${esc(k)}</span>`).join('')}</div>
      <p class="t-text">${esc(c.text)}</p>
      <p class="t-core">${esc(c.core)}</p>
    </div>`).join('');

  const notes = summary.notes.length ? `
    <div class="t-notes">
      <h3>세 장을 함께 보면</h3>
      ${summary.notes.map((n) => `<div class="t-note"><b>${esc(n.tag)}</b><p>${mdBold(n.text)}</p></div>`).join('')}
    </div>` : '';

  $('#t-result-root').innerHTML = `
    <div class="t-res-head">
      <span class="t-res-topic">${esc(topic.label)}</span>
      <h2 class="t-res-title">${esc(topic.question)}</h2>
      <p class="t-res-sub">${esc(topic.lens)} — <span class="term" data-term="라이더웨이트">라이더-웨이트</span> 78장 중 세 장</p>
    </div>
    <div class="t-spread">${spread}</div>
    ${blocks}
    ${notes}
    <div class="t-actions">
      <button type="button" class="t-btn primary wide" id="t-again">다른 주제로 다시 뽑기</button>
      <button type="button" class="t-btn" id="t-prompt">프롬프트 복사</button>
      <button type="button" class="t-btn" id="t-share">공유하기</button>
      <button type="button" class="t-btn wide" id="t-image">이미지로 저장</button>
    </div>
    <p class="t-disclaimer">
      타로는 정해진 미래를 알려 주는 도구가 아니라, 지금의 생각을 정리하도록 돕는 거울이에요.
      <span class="term" data-term="역방향">역방향</span>은 나쁜 뜻이 아니라 기운이 안으로 향했다는 신호입니다.
      재미와 자기성찰의 참고로 봐 주세요.
    </p>`;

  $('#t-again').addEventListener('click', () => { state.picked = []; showTopicView(); });
  $('#t-prompt').addEventListener('click', onCopyPrompt);
  $('#t-share').addEventListener('click', onShare);
  $('#t-image').addEventListener('click', onSaveImage);

  prewarmImage();
}

// 결과가 뜨는 순간 공유 이미지를 미리 만들어 둔다.
// iOS 는 사용자가 버튼을 누른 '직후'에만 공유 시트를 열어 주므로,
// 클릭한 다음에 캔버스를 그리기 시작하면 활성화가 만료돼 저장이 통째로 실패한다.
let imageReady = null;
function prewarmImage() {
  imageReady = (async () => canvasToBlob(await drawTarotCard(state.reading)))().catch(() => null);
}

/** **굵게** 만 지원하는 최소 인라인 렌더러 (app.js 의 md 와 같은 취지). */
function mdBold(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// ── 공유 · 프롬프트 · 이미지 ──────────────────────────────
function shareUrl() {
  const p = new URLSearchParams();
  p.set('t', state.topicKey);
  p.set('c', encodeDraw(state.picked));
  return `${location.origin}${location.pathname}?${p.toString()}#/tarot`;
}

/** 결과를 열어 둔 동안 주소창도 같은 결과를 가리키게 한다(새로고침 안전). */
function updateShareUrl() {
  try { history.replaceState(null, '', shareUrl()); } catch { /* 파일 프로토콜 등 */ }
}

async function onCopyPrompt() {
  try {
    const tpl = await fetch('./data/tarot-prompt-template.txt').then((r) => r.text());
    await copyText(buildTarotPrompt(tpl, state.reading));
    toast('타로 프롬프트를 복사했어요. GPT·Claude에 붙여넣어 보세요.');
  } catch (err) {
    toast(`복사에 실패했습니다: ${err.message}`);
  }
}

async function onShare() {
  const r = state.reading;
  const text = `${r.topic.label} 타로 — ${r.cards.map((c) => c.card.name).join(' · ')}`;
  const url = shareUrl();
  if (navigator.share) {
    try { await navigator.share({ title: '타로 3장 리딩', text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  await copyText(url);
  toast('링크를 복사했어요.');
}

async function onSaveImage() {
  const btn = $('#t-image');
  const orig = btn ? btn.textContent : '';
  try {
    // 프리워밍이 끝나 있으면 여기서 기다리는 시간이 사실상 0 이라 iOS 활성화가 유지된다.
    let blob = imageReady ? await imageReady : null;
    if (!blob) {
      if (btn) { btn.disabled = true; btn.textContent = '이미지 만드는 중…'; }
      else toast('이미지를 만드는 중이에요…');
      prewarmImage();
      blob = await imageReady;
    }
    if (!blob) throw new Error('이미지를 만들지 못했어요');

    const r = state.reading;
    const how = await deliverImage(blob, {
      fileName: `ohaeng-tarot-${state.topicKey}.png`,
      title: '타로 3장 리딩',
      text: `${r.topic.label} — ${r.cards.map((c) => c.card.name).join(' · ')}`,
    });
    if (how === 'downloaded') toast('이미지를 저장했어요.');
    // 'shared'(공유 시트에서 저장) · 'longpress'(안내 시트) · 'canceled' 는 별도 안내가 필요 없다.
  } catch (err) {
    toast(`이미지 저장에 실패했습니다: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
  }
}

/** 사주 쪽과 같은 토스트 요소를 재사용한다. */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

init();

// 테스트에서 상태를 들여다볼 수 있게 최소한만 노출한다.
if (typeof window !== 'undefined') window.__tarot = { state, SUITS, go };
