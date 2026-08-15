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
function addEntry(hEnc, gEnc) {
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
  saveStore(state.store);
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
      <div class="gm-row">
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
      <div class="gm-row">
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
      이 지도는 <b>이 브라우저에만</b> 저장돼요. 다른 기기에서는 보이지 않고,
      브라우저 데이터를 지우면 함께 사라집니다.
    </p>
    <div class="gm-actions">
      <button type="button" class="gm-btn" id="gm-reset">전체 지우기</button>
      <button type="button" class="gm-btn" data-goto="saju">내 사주 보기</button>
    </div>`;
}

// ── 이벤트 ────────────────────────────────────────────────
function bind() {
  for (const b of $$('#map-root [data-goto]')) {
    b.addEventListener('click', () => go(b.dataset.goto));
  }
  for (const seg of $$('#map-root .segmented')) bindSegmented(seg);
  bindLeapToggle('gm-h');
  bindLeapToggle('gm-g');

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
  saveStore(state.store);
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
