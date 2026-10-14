// ============================================================
//  map.js — 귀인 지도 UI
//
//  서버가 없는 정적 사이트에서 "여러 사람이 한 지도에 쌓이는" 경험을 만든다.
//  방법은 **링크 주고받기 + 방장 기기 저장**이다.
//
//    [나]   내 귀인 지도 만들기 → 링크 복사 (#/map?h=…)
//             ↓ 카톡·문자로 전달
//    [친구] 링크 열기 → 생년월일 입력 → "나는 ○○님에게 🌟 귀인"
//             ↓ '결과 보내기' 링크 (#/map?h=…&g=…)
//    [나]   그 링크를 열면 내 지도에 자동으로 쌓인다 (localStorage)
//
//  · 개인정보가 서버로 가지 않는다. 대신 지도는 **방장의 브라우저에만** 남는다.
//    이 한계는 화면에도 그대로 적어 둔다 — 사라질 수 있다는 걸 미리 알려야 한다.
//  · 링크에 생년월일이 담기므로, 보내는 사람이 그 사실을 알고 누르게 한다.
// ============================================================
import { computeSaju } from './engine/saju.js';
import { analyze } from './engine/analyze.js';
import { analyzeGwiin, GWIIN_TYPES, tallyMap, hostHint } from './engine/gwiin.js';
import { buildPersona } from './engine/persona.js';
import { onRoute, go, currentRoute } from './router.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STORE_KEY = 'ohaeng.gwiinmap.v1';
const MAX_ENTRIES = 60;   // 브라우저 저장소를 무한정 채우지 않는다

// ── 사람 정보 인코딩 ──────────────────────────────────────
// 링크에 실리므로 짧게. 순서: 이름~성별~달력~년~월~일~시~분~윤달
//
// ⚠️ 여기서는 URL 인코딩을 **하지 않는다.** 주소를 만들 때 URLSearchParams 가,
//    읽을 때도 URLSearchParams 가 한 번씩 처리한다. 여기서 한 번 더 감싸면
//    "저장해 둔 방장 값"과 "링크에서 읽은 방장 값"이 서로 달라져
//    내 지도인데도 남의 지도로 인식된다(실제로 겪은 버그).
function encodePerson(p) {
  const parts = [
    (p.name || '').replace(/~/g, '-'),   // 구분자와 겹치지 않게
    p.gender === '여' ? 'f' : 'm',
    p.calendar === 'lunar' ? 'l' : 's',
    p.year, p.month, p.day,
    p.hour === null ? '' : p.hour,
    p.hour === null ? '' : p.minute,
    p.isLeapMonth ? '1' : '',
  ];
  return parts.join('~');
}

function decodePerson(str) {
  try {
    const parts = String(str).split('~');
    if (parts.length < 6) return null;
    const [name, g, c, y, mo, d, h, mi, leap] = parts;
    const num = (v) => (v === '' || v === undefined ? null : Number(v));
    const p = {
      name: name || '',
      gender: g === 'f' ? '여' : '남',
      calendar: c === 'l' ? 'lunar' : 'solar',
      year: num(y), month: num(mo), day: num(d),
      hour: num(h), minute: num(mi) ?? 0,
      isLeapMonth: leap === '1',
    };
    if (!Number.isInteger(p.year) || !Number.isInteger(p.month) || !Number.isInteger(p.day)) return null;
    if (p.year < 1900 || p.year > 2100 || p.month < 1 || p.month > 12 || p.day < 1 || p.day > 31) return null;
    if (p.hour === null) p.minute = null;
    return p;
  } catch { return null; }
}

/** 입력 → {saju, a}. 계산이 실패하면 null. */
function build(person) {
  try {
    const saju = computeSaju(person);
    if (saju.error) return null;
    return { saju, a: analyze(saju) };
  } catch { return null; }
}

// ── 저장소 ────────────────────────────────────────────────
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.host || !Array.isArray(s.entries)) return null;
    return s;
  } catch { return null; }
}

function saveStore(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); return true; }
  catch { return false; }   // 사파리 프라이빗 모드 등
}

function clearStore() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* noop */ }
}

// ── 상태 ──────────────────────────────────────────────────
const state = {
  store: null,      // { host: enc, entries: [{enc, name, type, at}] }
  view: 'intro',    // intro | join | joined | map
  hostEnc: null,    // 지금 보고 있는 지도의 방장 (URL 또는 저장소)
  joinResult: null, // 참여자가 방금 받은 판정
};

/** 해시 뒤에 붙은 쿼리(#/map?h=…&g=…)를 읽는다. */
function hashQuery() {
  const h = location.hash || '';
  const q = h.includes('?') ? h.slice(h.indexOf('?') + 1) : '';
  return new URLSearchParams(q);
}

function mapUrl(params) {
  const p = new URLSearchParams(params);
  return `${location.origin}${location.pathname}#/map?${p.toString()}`;
}

// ── 진입 ──────────────────────────────────────────────────
function enterMap() {
  state.store = loadStore();
  const q = hashQuery();
  const h = q.get('h');
  const g = q.get('g');
  const all = q.get('all');

  // ⓪ 내 지도 링크(h+all) — 다른 브라우저·토스 앱·카톡 브라우저에서 열어도 같은 지도로 합친다.
  //    지도는 기기마다 따로 저장되므로(서버 없음), 이 링크가 기기 사이를 잇는 유일한 다리다.
  if (h && all != null) {
    if (!state.store || state.store.host !== h) state.store = { host: h, entries: [], createdAt: Date.now() };
    for (const enc of all.split(',').filter(Boolean).reverse()) addEntry(h, enc, { silent: true });
    if (!saveStore(state.store)) toast('이 브라우저에 저장할 수 없어요. 시크릿 모드에서는 지도가 유지되지 않아요.');
    state.hostEnc = h; state.view = 'map'; render(); return;
  }

  // ① 결과 링크(h+g) — 내가 방장이면 지도에 담는다
  if (h && g) {
    if (state.store && state.store.host === h) {
      addEntry(h, g);
      state.hostEnc = h;
      state.view = 'map';
      render();
      return;
    }
    // 내 지도가 아니다 — 방장에게 보내라는 안내를 띄운다
    state.hostEnc = h;
    state.joinResult = judge(h, g);
    state.view = state.joinResult ? 'joined' : 'intro';
    render();
    return;
  }

  // ② 초대 링크(h만) — 참여 화면
  if (h) {
    if (state.store && state.store.host === h) { state.hostEnc = h; state.view = 'map'; render(); return; }
    state.hostEnc = h;
    state.view = 'join';
    render();
    return;
  }

  // ③ 파라미터 없음 — 내 지도가 있으면 지도, 없으면 만들기
  if (state.store) { state.hostEnc = state.store.host; state.view = 'map'; }
  else { state.hostEnc = null; state.view = 'intro'; }
  render();
}

/** host/guest 인코딩 쌍을 판정한다. */
function judge(hEnc, gEnc) {
  const hp = decodePerson(hEnc), gp = decodePerson(gEnc);
  if (!hp || !gp) return null;
  const host = build(hp), guest = build(gp);
  if (!host || !guest) return null;
  return { host, guest, hostPerson: hp, guestPerson: gp, result: analyzeGwiin(host, guest) };
}

/** 지도에 한 사람 추가 (같은 사람은 갱신). */
function addEntry(hEnc, gEnc, { silent = false } = {}) {
  const j = judge(hEnc, gEnc);
  if (!j) return;
  const entries = state.store.entries.filter((e) => e.enc !== gEnc);
  entries.unshift({
    enc: gEnc,
    name: j.guestPerson.name || '이름 없음',
    type: j.result.type.key,
    at: Date.now(),
  });
  state.store.entries = entries.slice(0, MAX_ENTRIES);
  if (silent) return;
  // 저장 실패를 삼키지 않는다. `state.store` 는 메모리에서 이미 갱신됐으므로
  // **화면에는 친구가 보이는데 새로고침하면 사라진다** — 지도의 존재 이유가
  // 누적인데 그 누적만 조용히 실패한다(시크릿 모드·저장공간 부족).
  // 지도 생성 경로(`onCreate`)는 이미 같은 경고를 띄운다. 여기만 빠져 있었다.
  if (!saveStore(state.store)) {
    toast('이 브라우저에 저장할 수 없어요. 시크릿 모드에서는 지도가 유지되지 않아요.');
  }
}

// ── 렌더 ──────────────────────────────────────────────────
function render() {
  const root = $('#map-root');
  if (!root) return;
  if (state.view === 'intro') root.innerHTML = introHtml();
  else if (state.view === 'join') root.innerHTML = joinHtml();
  else if (state.view === 'joined') root.innerHTML = joinedHtml();
  else root.innerHTML = mapHtml();
  bind();
  window.scrollTo(0, 0);
}

/** 생년월일 입력 폼 — 사주 화면 것과 별개로, 귀인 지도에 필요한 만큼만 둔다. */
function formHtml(prefix, { needName = true } = {}) {
  const years = [];
  for (let y = 2026; y >= 1930; y--) years.push(y);
  const opts = (arr, fmt, sel) => arr.map((v) => `<option value="${v}"${v === sel ? ' selected' : ''}>${fmt(v)}</option>`).join('');
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  return `
    ${needName ? `
    <label class="gm-field">
      <span>이름 <em>(별명도 괜찮아요)</em></span>
      <input type="text" id="${prefix}-name" class="input" maxlength="20" placeholder="홍길동" />
    </label>` : ''}
    <div class="gm-field">
      <span>성별</span>
      <div class="segmented" id="${prefix}-gender" role="group" aria-label="성별">
        <button type="button" class="seg active" data-val="남" aria-pressed="true">남</button>
        <button type="button" class="seg" data-val="여" aria-pressed="false">여</button>
      </div>
    </div>
    <div class="gm-field">
      <span>달력</span>
      <div class="segmented" id="${prefix}-cal" role="group" aria-label="양력 음력">
        <button type="button" class="seg active" data-val="solar" aria-pressed="true">양력</button>
        <button type="button" class="seg" data-val="lunar" aria-pressed="false">음력</button>
      </div>
    </div>
    <div class="gm-field">
      <span>생년월일</span>
      <div class="gm-picker">
        <select id="${prefix}-year" class="select" aria-label="년">${opts(years, (y) => `${y}년`, 1995)}</select>
        <select id="${prefix}-month" class="select" aria-label="월">${opts(range(1, 12), (m) => `${m}월`, 1)}</select>
        <select id="${prefix}-day" class="select" aria-label="일">${opts(range(1, 31), (d) => `${d}일`, 1)}</select>
      </div>
      <label class="gm-check" id="${prefix}-leap-wrap" hidden>
        <input type="checkbox" id="${prefix}-leap" /> <span>윤달이에요</span>
      </label>
    </div>
    <details class="gm-more">
      <summary>태어난 시간을 알아요 <em>(몰라도 괜찮아요)</em></summary>
      <div class="gm-picker">
        <select id="${prefix}-hour" class="select" aria-label="시">
          <option value="">시간 미상</option>
          ${opts(range(0, 23), (h) => `${String(h).padStart(2, '0')}시`, -1)}
        </select>
        <select id="${prefix}-min" class="select" aria-label="분">${opts(range(0, 59), (m) => `${String(m).padStart(2, '0')}분`, 0)}</select>
      </div>
      <p class="gm-hint">관계 유형은 <b>연주·월주·일주</b>로 봐요. 시간은 더 자세한 풀이에만 쓰여요.</p>
    </details>`;
}

/** ① 내 지도 만들기 */
function introHtml() {
  return `
    <div class="gm-hero">
      <span class="gm-badge">귀인 지도</span>
      <h1 class="gm-title">내 곁의 사람들,<br/>어떤 인연인지 모아 보기</h1>
      <p class="gm-desc">
        링크를 뿌리면 친구들이 각자 생일을 넣고 <b>나에게 어떤 사람인지</b> 지도에 올라와요.
      </p>
    </div>

    <div class="gm-types">
      ${Object.values(GWIIN_TYPES).map((t) => `
        <div class="gm-type-chip"><span>${t.emoji}</span><b>${esc(t.label)}</b><small>${esc(t.line)}</small></div>`).join('')}
    </div>

    <form class="card gm-form" id="gm-host-form">
      <p class="gm-form-title">먼저 내 생년월일을 알려 주세요</p>
      ${formHtml('gm-h')}
      <button type="submit" class="cta">내 귀인 지도 만들기</button>
      <p class="gm-privacy">
        입력한 값은 <b>서버로 전송되지 않아요.</b> 지도는 이 브라우저에만 저장되고,
        공유 링크에는 결과를 계산하기 위한 생년월일이 담깁니다.
        <button type="button" class="gm-inline-link" data-goto="privacy">개인정보처리방침</button>
      </p>
    </form>`;
}

/** ② 친구가 참여하는 화면 */
function joinHtml() {
  const hp = decodePerson(state.hostEnc);
  const host = hp && build(hp);
  if (!host) {
    return `<div class="gm-error">링크가 손상되어 지도를 열 수 없어요.<br/>보내 준 사람에게 링크를 다시 받아 주세요.</div>
      <div class="gm-actions"><button type="button" class="gm-btn primary" data-goto="menu">처음으로</button></div>`;
  }
  const persona = buildPersona(host.saju);
  const name = hp.name || '이 사람';

  return `
    <div class="gm-hero">
      <span class="gm-badge">귀인 지도</span>
      <h1 class="gm-title">${esc(name)}님의 귀인 지도</h1>
      <div class="gm-host-card">
        <span class="gm-host-emoji">${persona.emoji}</span>
        <div>
          <b>${esc(persona.label)}</b>
          <small>${esc(persona.tagline)}</small>
        </div>
      </div>
      <p class="gm-host-hint">${esc(hostHint(host))}</p>
    </div>

    <form class="card gm-form" id="gm-guest-form">
      <p class="gm-form-title">🙋 나는 ${esc(name)}님에게 어떤 사람일까?</p>
      <p class="gm-form-sub">생일만 넣으면 바로 나와요. 관계는 연주·월주·일주를 기준으로 봅니다.</p>
      ${formHtml('gm-g')}
      <button type="submit" class="cta">내 관계 보기</button>
      <p class="gm-privacy">
        결과를 만들면 <b>내 생년월일이 담긴 링크</b>가 만들어져요.
        그 링크를 ${esc(name)}님에게 보낼지는 내가 직접 정합니다.
      </p>
    </form>`;
}

/** ③ 참여 결과 */
function joinedHtml() {
  const j = state.joinResult;
  if (!j) return `<div class="gm-error">결과를 만들지 못했어요. 생년월일을 다시 확인해 주세요.</div>`;

  const { result, hostPerson, guestPerson } = j;
  const t = result.type;
  const hostName = hostPerson.name || '상대';
  const myPersona = result.detail.guestPersona;

  return `
    <div class="gm-result">
      <p class="gm-result-lead">나는 <b>${esc(hostName)}</b>님에게</p>
      <div class="gm-result-type">
        <span class="gm-result-emoji">${t.emoji}</span>
        <b>${esc(t.label)}</b>
      </div>
      <p class="gm-result-line">${esc(t.line)}</p>
    </div>

    <div class="card">
      <p class="sec-title">왜 이렇게 나왔나요</p>
      <ul class="gm-reasons">
        ${result.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}
      </ul>
      <p class="gm-type-desc">${esc(t.desc)}</p>
      <p class="gm-type-tip"><b>이 관계를 잘 쓰는 법</b> ${esc(t.tip)}</p>
    </div>

    <div class="card">
      <p class="sec-title">그런데 나는 어떤 사람일까</p>
      <div class="gm-host-card inline">
        <span class="gm-host-emoji">${myPersona.emoji}</span>
        <div><b>${esc(myPersona.label)}</b><small>${esc(myPersona.tagline)}</small></div>
      </div>
      <p class="gm-mypersona">${esc(myPersona.desc)}</p>
      <button type="button" class="gm-btn wide" data-goto="saju">내 사주 전체로 보기</button>
    </div>

    <div class="gm-send">
      <b>${esc(hostName)}님 지도에 올리려면</b>
      <p>아래 링크를 ${esc(hostName)}님에게 보내 주세요. ${esc(hostName)}님이 링크를 열면 지도에 내가 올라가요.</p>
      <div class="gm-actions">
        <button type="button" class="gm-btn primary" id="gm-send">결과 보내기</button>
        <button type="button" class="gm-btn" id="gm-copy-result">링크 복사</button>
      </div>
      <p class="gm-privacy">이 링크에는 <b>내 생년월일</b>이 담겨 있어요. 보낼 상대를 확인해 주세요.</p>
    </div>

    <div class="gm-owner">
      <b>${esc(hostName)}님 본인이신가요?</b>
      <p>지도를 만든 브라우저와 지금 연 곳(카톡 안 브라우저·토스 앱 등)이 다르면 지도가 안 보여요. 아래를 누르면 <b>여기에 ${esc(hostName)}님 지도를 만들고</b> ${esc(guestPerson.name || '이 사람')}님을 바로 올려요.</p>
      <button type="button" class="gm-btn primary wide" id="gm-claim">내 지도에 추가하기</button>
    </div>

    <div class="gm-actions">
      <button type="button" class="gm-btn wide" id="gm-make-mine">나도 내 귀인 지도 만들기</button>
    </div>`;
}

/** ④ 내 지도 */
function mapHtml() {
  const hp = decodePerson(state.hostEnc);
  const host = hp && build(hp);
  if (!host) {
    return `<div class="gm-error">지도 정보를 읽지 못했어요.</div>
      <div class="gm-actions"><button type="button" class="gm-btn primary" id="gm-reset">새로 만들기</button></div>`;
  }
  const persona = buildPersona(host.saju);
  const entries = state.store ? state.store.entries : [];
  const counts = tallyMap(entries);
  const name = hp.name || '나';

  const rows = entries.map((e) => {
    const t = GWIIN_TYPES[e.type] || GWIIN_TYPES.gwiin;
    const gp = decodePerson(e.enc);
    const birth = gp ? `${gp.year}.${String(gp.month).padStart(2, '0')}.${String(gp.day).padStart(2, '0')}${gp.calendar === 'lunar' ? ' 음력' : ''}` : '';
    return `
      <li class="gm-entry">
        <span class="gm-entry-emoji">${t.emoji}</span>
        <div class="gm-entry-body">
          <b>${esc(e.name)}</b>
          <small>${esc(t.label)} · ${esc(birth)}</small>
        </div>
        <button type="button" class="gm-entry-del" data-del="${esc(e.enc)}" aria-label="${esc(e.name)} 지우기">✕</button>
      </li>`;
  }).join('');

  return `
    <div class="gm-hero">
      <span class="gm-badge">귀인 지도</span>
      <h1 class="gm-title">${esc(name)}님의 귀인 지도</h1>
      <div class="gm-host-card">
        <span class="gm-host-emoji">${persona.emoji}</span>
        <div><b>${esc(persona.label)}</b><small>${esc(persona.tagline)}</small></div>
      </div>
      <p class="gm-host-hint">${esc(hostHint(host))}</p>
    </div>

    ${orbitHtml(name, persona.emoji, entries)}

    <div class="gm-tally">
      ${Object.values(GWIIN_TYPES).map((t) => `
        <div class="gm-tally-item${counts[t.key] ? ' on' : ''}">
          <b>${counts[t.key]}</b>
          <span>${t.emoji} ${esc(t.label)}</span>
        </div>`).join('')}
    </div>

    <div class="card">
      <p class="sec-title">지도에 올라온 사람 · ${entries.length}명</p>
      ${entries.length
        ? `<ul class="gm-entries">${rows}</ul>`
        : `<p class="gm-empty">아직 아무도 없어요 — 링크를 보내면 친구들이 여기 올라와요.</p>`}
    </div>

    <div class="gm-share">
      <b>🔗 친구에게 공유해 보세요</b>
      <p>친구가 생일만 넣으면 ${esc(name)}님과 어떤 인연인지 지도에 떠요.</p>
      <div class="gm-actions">
        <button type="button" class="gm-btn primary" id="gm-invite">초대 링크 보내기</button>
        <button type="button" class="gm-btn" id="gm-copy-invite">링크 복사</button>
      </div>
    </div>

    <p class="gm-note">
      이 지도는 <b>이 브라우저에만</b> 저장돼요. 친구 결과 링크는 <b>지도를 만든 곳에서</b> 열어야 쌓여요.
      다른 기기·앱으로 옮기려면 아래 <b>내 지도 링크</b>를 그곳에서 열어 주세요.
    </p>
    <div class="gm-actions">
      <button type="button" class="gm-btn" id="gm-copy-map">내 지도 링크 복사</button>
    </div>
    <div class="gm-actions">
      <button type="button" class="gm-btn" id="gm-reset">전체 지우기</button>
      <button type="button" class="gm-btn" data-goto="saju">내 사주 보기</button>
    </div>`;
}

/** 내 지도를 다른 브라우저·앱으로 옮기는 링크 — 방장 + 올라온 사람 전부. */
function myMapUrl() {
  const entries = state.store ? state.store.entries : [];
  return mapUrl({ h: state.hostEnc, all: entries.map((e) => e.enc).join(',') });
}

/** 결과 링크를 연 사람이 「내가 방장」이라고 고르면, 이 브라우저에 지도를 만들고 그 사람을 올린다. */
function onClaim() {
  const j = state.joinResult;
  if (!j) return;
  if (state.store && state.store.host !== state.hostEnc
      && !confirm('이 브라우저에 있던 다른 지도는 지워지고 새 지도로 바뀌어요. 계속할까요?')) return;
  if (!state.store || state.store.host !== state.hostEnc) state.store = { host: state.hostEnc, entries: [], createdAt: Date.now() };
  addEntry(state.hostEnc, encodePerson(j.guestPerson));
  state.view = 'map';
  render();
}

// ── 궤도 그림: 나를 가운데 두고 관계별 색 선으로 잇는다. 천천히 돈다(동작 줄이기 설정이면 멈춤).
const TYPE_COLOR = { gwiin: '#F2B705', soulmate: '#3182F6', mine: '#2FB67A', righthand: '#8B5CF6', tiger: '#F04452' };
function orbitHtml(name, emoji, entries) {
  const list = entries.slice(0, 24);
  const R = 118, C = 160;
  const nodes = list.map((e, i) => {
    const t = GWIIN_TYPES[e.type] || GWIIN_TYPES.gwiin;
    const ring = list.length > 12 ? (i % 2 ? R : R - 34) : R;
    const a = (i / Math.max(list.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const x = C + Math.cos(a) * ring, y = C + Math.sin(a) * ring;
    const col = TYPE_COLOR[t.key] || '#8B95A1';
    return `<line x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${col}" stroke-width="2.5" stroke-linecap="round" opacity=".75"/>
      <g class="gm-orb-node" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <g class="gm-orb-upright"><circle r="17" fill="#fff" stroke="${col}" stroke-width="3"/>
        <text y="6" text-anchor="middle" font-size="16">${t.emoji}</text>
        <text y="33" text-anchor="middle" font-size="11" fill="#4E5968">${esc((e.name || '').slice(0, 5))}</text></g>
      </g>`;
  }).join('');
  const legend = Object.values(GWIIN_TYPES).map((t) => `<span><i style="background:${TYPE_COLOR[t.key]}"></i>${esc(t.label)}</span>`).join('');
  return `
    <div class="gm-orbit card" aria-label="귀인 지도 그림 — 나를 가운데 두고 관계별 색 선으로 이은 그림">
      <svg viewBox="0 0 320 320" role="img">
        <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#E5E8EB" stroke-dasharray="3 6"/>
        <g class="gm-orb-spin">${nodes}</g>
        <circle cx="${C}" cy="${C}" r="30" fill="#191F28"/>
        <text x="${C}" y="${C + 7}" text-anchor="middle" font-size="22">${emoji}</text>
        <text x="${C}" y="${C + 50}" text-anchor="middle" font-size="12" font-weight="700" fill="#191F28">${esc(name)}</text>
      </svg>
      ${list.length ? '' : '<p class="gm-orb-empty">친구가 올라오면 여기 궤도에 떠요.</p>'}
      <div class="gm-orb-legend">${legend}</div>
    </div>`;
}
let orbitRaf = 0;
function startOrbit() {
  cancelAnimationFrame(orbitRaf);
  const spin = $('#map-root .gm-orb-spin');
  if (!spin || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const uprights = $$('#map-root .gm-orb-upright');
  const t0 = performance.now();
  const step = (now) => {
    if (!spin.isConnected) return;
    const deg = ((now - t0) / 1000) * 6;   // 1분에 한 바퀴 — 천천히
    spin.setAttribute('transform', `rotate(${deg.toFixed(2)} 160 160)`);
    for (const u of uprights) u.setAttribute('transform', `rotate(${(-deg).toFixed(2)})`);   // 글자는 똑바로
    orbitRaf = requestAnimationFrame(step);
  };
  orbitRaf = requestAnimationFrame(step);
}

// ── 이벤트 ────────────────────────────────────────────────
function bind() {
  for (const b of $$('#map-root [data-goto]')) {
    b.addEventListener('click', () => go(b.dataset.goto));
  }
  for (const seg of $$('#map-root .segmented')) bindSegmented(seg);
  bindLeapToggle('gm-h');
  bindLeapToggle('gm-g');
  bindMinuteToggle('gm-h');
  bindMinuteToggle('gm-g');

  $('#gm-host-form')?.addEventListener('submit', onCreateMap);
  $('#gm-guest-form')?.addEventListener('submit', onJoin);
  $('#gm-invite')?.addEventListener('click', () => shareLink(inviteUrl(), '귀인 지도 초대'));
  $('#gm-copy-invite')?.addEventListener('click', () => copyAndToast(inviteUrl()));
  $('#gm-send')?.addEventListener('click', () => shareLink(resultUrl(), '귀인 지도 결과'));
  $('#gm-copy-result')?.addEventListener('click', () => copyAndToast(resultUrl()));
  $('#gm-make-mine')?.addEventListener('click', () => {
    state.view = 'intro'; state.hostEnc = null; render();
  });
  $('#gm-reset')?.addEventListener('click', onReset);
  $('#gm-claim')?.addEventListener('click', onClaim);
  $('#gm-copy-map')?.addEventListener('click', () => copyAndToast(myMapUrl()));
  startOrbit();
  for (const b of $$('#map-root [data-del]')) {
    b.addEventListener('click', () => onDelete(b.dataset.del));
  }
}

function bindSegmented(wrap) {
  for (const b of $$('.seg', wrap)) {
    b.addEventListener('click', () => {
      for (const x of $$('.seg', wrap)) { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); }
      b.classList.add('active'); b.setAttribute('aria-pressed', 'true');
      if (wrap.id.endsWith('-cal')) refreshLeap(wrap.id.replace('-cal', ''));
    });
  }
}

/** 음력을 고르고 그 해에 윤달이 있을 때만 체크박스를 보여 준다. */
function bindLeapToggle(prefix) {
  const y = $(`#${prefix}-year`), m = $(`#${prefix}-month`);
  if (!y || !m) return;
  y.addEventListener('change', () => refreshLeap(prefix));
  m.addEventListener('change', () => refreshLeap(prefix));
}

/** 시간 미상이면 분은 쓰이지 않는다(readForm 이 null 로 버린다) — 고를 수 있게 두면 오해를 준다. */
function bindMinuteToggle(prefix) {
  const h = $(`#${prefix}-hour`), m = $(`#${prefix}-min`);
  if (!h || !m) return;
  const sync = () => { m.disabled = h.value === ''; };
  h.addEventListener('change', sync);
  sync();
}

function refreshLeap(prefix) {
  const wrap = $(`#${prefix}-leap-wrap`);
  const calSeg = $(`#${prefix}-cal .seg.active`);
  if (!wrap || !calSeg) return;
  wrap.hidden = calSeg.dataset.val !== 'lunar';
  if (wrap.hidden) { const c = $(`#${prefix}-leap`); if (c) c.checked = false; }
}

function readForm(prefix) {
  const val = (id) => $(`#${prefix}-${id}`)?.value ?? '';
  const seg = (id) => $(`#${prefix}-${id} .seg.active`)?.dataset.val;
  const hourRaw = val('hour');
  return {
    name: (val('name') || '').trim(),
    gender: seg('gender') || '남',
    calendar: seg('cal') || 'solar',
    year: Number(val('year')), month: Number(val('month')), day: Number(val('day')),
    hour: hourRaw === '' ? null : Number(hourRaw),
    minute: hourRaw === '' ? null : Number(val('min') || 0),
    isLeapMonth: !!$(`#${prefix}-leap`)?.checked,
  };
}

function onCreateMap(e) {
  e.preventDefault();
  const person = readForm('gm-h');
  const built = build(person);
  if (!built) { toast('생년월일을 다시 확인해 주세요.'); return; }
  const enc = encodePerson(person);
  state.store = { host: enc, entries: [] };
  if (!saveStore(state.store)) {
    toast('이 브라우저에 저장할 수 없어요. 시크릿 모드에서는 지도가 유지되지 않아요.');
  }
  state.hostEnc = enc;
  state.view = 'map';
  history.replaceState(null, '', `#/map?${new URLSearchParams({ h: enc })}`);
  render();
}

function onJoin(e) {
  e.preventDefault();
  const person = readForm('gm-g');
  if (!person.name) { toast('이름(별명)을 적어 주세요.'); return; }
  const gEnc = encodePerson(person);
  const j = judge(state.hostEnc, gEnc);
  if (!j) { toast('생년월일을 다시 확인해 주세요.'); return; }
  state.joinResult = j;
  state.guestEnc = gEnc;
  state.view = 'joined';
  render();
}

function onDelete(enc) {
  if (!state.store) return;
  state.store.entries = state.store.entries.filter((x) => x.enc !== enc);
  // 저장에 실패하면 "지웠다"고 말하면 안 된다 — 새로고침하면 되살아난다.
  if (!saveStore(state.store)) {
    render();
    toast('이 브라우저에 저장할 수 없어 지우지 못했어요.');
    return;
  }
  render();
  toast('지도에서 지웠어요.');
}

function onReset() {
  clearStore();
  state.store = null;
  state.hostEnc = null;
  state.view = 'intro';
  history.replaceState(null, '', '#/map');
  render();
  toast('지도를 지웠어요.');
}

const inviteUrl = () => mapUrl({ h: state.hostEnc });
const resultUrl = () => mapUrl({ h: state.hostEnc, g: state.guestEnc || encodePerson(state.joinResult.guestPerson) });

async function shareLink(url, title) {
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; }
    catch (err) { if (err?.name === 'AbortError') return; }
  }
  await copyAndToast(url);
}

async function copyAndToast(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
  }
  toast('링크를 복사했어요.');
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ── 초기화 ────────────────────────────────────────────────
function init() {
  onRoute((to) => { if (to === 'map') enterMap(); });
  // app.js 가 먼저 initRouter() 를 돌려 첫 이벤트를 놓칠 수 있다 (tarot.js 와 같은 사정).
  if (currentRoute() === 'map') queueMicrotask(enterMap);
  // 지도 안에서 h/g 가 바뀌는 링크로 이동했을 때도 다시 읽는다.
  window.addEventListener('hashchange', () => { if (currentRoute() === 'map') enterMap(); });
}

init();

if (typeof window !== 'undefined') {
  window.__gwiinmap = { state, encodePerson, decodePerson, STORE_KEY };
}
