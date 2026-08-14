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
import { drawTarotCard, canvasToBlob } from './share.js';

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
  order: [],          // 화면에 펼쳐진 카드 순서 (셔플 결과)
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

  // 화면 회전·창 크기 변경 시 카드 간격을 다시 잰다.
  // 이미 뽑기 시작한 뒤에는 다시 그리지 않는다 — 고른 카드가 사라지면 안 된다.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (state.picked.length || !state.loaded) return;
    if ($('#view-tarot-draw').classList.contains('hidden')) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildFan, 180);
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

// 덱 배치 — 6줄 × 13장. 한 줄에 78장을 부채로 펴면 카드 하나가 5px 남짓만
// 노출돼 손가락으로 고를 수가 없다(뒤 카드가 앞 카드의 클릭을 가로챈다).
// 줄로 나누면 노출 폭이 넉넉해지고, 열마다 살짝 기울여 부채 느낌을 남긴다.
const ROWS = 6, COLS = 13;
const CARD_W = 54, CARD_H = 91;   // 원본 비율 100:168
const V_STEP = 46;                // 아랫줄이 윗줄을 덮는 만큼

/** 78장을 격자형 부채로 편다. */
function buildFan() {
  const deckEl = $('#t-deck');
  state.order = shuffledIndices(state.deck.length);

  // 컨테이너가 아직 안 그려졌으면(뷰 전환 직전) 모바일 기준으로 잡는다.
  const avail = deckEl.clientWidth || 360;
  const hStep = Math.max(16, (avail - CARD_W) / (COLS - 1));

  deckEl.style.height = `${CARD_H + V_STEP * (ROWS - 1)}px`;

  deckEl.innerHTML = state.order.map((deckIdx, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    // 클릭 영역은 **실제로 노출된 부분**과 정확히 겹치게 잡는다.
    // 마지막 열·마지막 줄은 가려지는 게 없으므로 카드 전체를 준다.
    const hitW = col === COLS - 1 ? CARD_W : hStep;
    const hitH = row === ROWS - 1 ? CARD_H : V_STEP;
    const angle = (col - (COLS - 1) / 2) * 1.7;
    return `<button type="button" class="t-card" data-i="${i}"
              style="left:${(col * hStep).toFixed(1)}px; top:${row * V_STEP}px;
                     width:${hitW.toFixed(1)}px; height:${hitH}px; z-index:${i + 1}"
              aria-label="${i + 1}번째 카드 뽑기"
            ><i style="--a:${angle.toFixed(2)}deg"></i></button>`;
  }).join('');

  for (const el of $$('.t-card', deckEl)) {
    el.addEventListener('click', () => pickCard(el));
  }
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

/** 다시 섞기 — 카드가 중앙으로 모였다가 새 순서로 다시 펴진다. */
function shuffleDeck() {
  const deckEl = $('#t-deck');
  const cards = $$('.t-card', deckEl);
  if (!cards.length) return;

  // 모이는 동작: 각 카드에 조금씩 다른 가로 오프셋을 줘 '섞이는' 느낌을 만든다.
  cards.forEach((el, i) => { el.style.setProperty('--sx', `${(i % 7 - 3) * 4}px`); });
  deckEl.classList.add('shuffling');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    deckEl.classList.remove('shuffling');
    state.picked = [];
    const topic = state.topics.find((t) => t.key === state.topicKey);
    renderSlots(topic);
    buildFan();
  }, reduce ? 0 : 360);
}

/** 카드 한 장 선택. 실제 카드는 부채 순서에 묶여 있어 조작이 불가능하다. */
function pickCard(el) {
  if (state.picked.length >= DRAW_COUNT) return;
  if (el.classList.contains('picked')) return;

  const fanIdx = Number(el.dataset.i);
  const card = state.deck[state.order[fanIdx]];
  const o = state.allowReversed && randBool() ? 'r' : 'u';

  state.picked.push({ id: card.id, o });
  el.classList.add('picked');
  el.disabled = true;

  fillSlot(state.picked.length - 1);

  if (state.picked.length === DRAW_COUNT) {
    $('#t-draw-title').textContent = '세 장이 모였어요';
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => reveal(), reduce ? 120 : 620);
  }
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

/** 알아서 뽑기 — 남은 카드 중에서 필요한 만큼 채운다. */
function autoPick() {
  const remaining = $$('.t-card').filter((el) => !el.classList.contains('picked'));
  const need = DRAW_COUNT - state.picked.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (let k = 0; k < need; k++) {
    const el = remaining[Math.floor(Math.random() * remaining.length)];
    remaining.splice(remaining.indexOf(el), 1);
    setTimeout(() => pickCard(el), reduce ? 0 : k * 260);
  }
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
  try {
    toast('이미지를 만드는 중이에요…');
    const canvas = await drawTarotCard(state.reading);
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], 'tarot.png', { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '타로 3장 리딩' });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `타로_${state.reading.topic.label}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('이미지를 저장했어요.');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    toast(`이미지 저장에 실패했습니다: ${err.message}`);
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
