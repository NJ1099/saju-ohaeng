// ============================================================
//  오행 · app.js — 입력 → 만세력 계산 → 분석 → 풀이 렌더링.
// ============================================================
import { computeSaju, pillarsText } from './engine/saju.js';
import { analyze } from './engine/analyze.js';
import { buildReading } from './engine/reading.js';
import { buildPrompt } from './engine/promptBuilder.js';
import { leapMonthOf, daysInLunarMonth } from './engine/lunar.js';
import { computeDaewoon, computeSewoon } from './engine/luck.js';
import { drawShareCard, canvasToBlob } from './share.js';
import {
  STEMS, BRANCHES, STEM_ELEMENT, BRANCH_ELEMENT, ELEMENTS, sipseongOf, HIDDEN_STEMS,
} from './engine/constants.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// 주요 도시 경도 (진태양시 보정용)
const REGIONS = [
  ['서울', 126.978], ['인천', 126.705], ['수원·경기', 127.029], ['춘천·강원', 127.731],
  ['강릉', 128.896], ['대전·세종', 127.385], ['청주·충북', 127.490], ['전주·전북', 127.148],
  ['광주·전남', 126.852], ['대구·경북', 128.601], ['포항', 129.365], ['부산', 129.075],
  ['울산', 129.311], ['창원·경남', 128.681], ['제주', 126.531], ['해외/기타(135°E)', 135.0],
];

const state = { gender: '남', calendar: 'solar', boundary: '자시', lastSaju: null, lastReading: null, lastAnalyze: null, lastLuck: null };

// ── 초기화 ────────────────────────────────────────────────
function init() {
  fillSelect('#in-year', range(1930, 2027).reverse(), (y) => [`${y}`, `${y}년`], 1995);
  fillSelect('#in-month', range(1, 12), (m) => [`${m}`, `${m}월`], 1);
  refreshDays();
  fillSelect('#in-hour', range(0, 23), (h) => [`${h}`, `${String(h).padStart(2, '0')}시`], 12);
  fillSelect('#in-min', range(0, 59), (m) => [`${m}`, `${String(m).padStart(2, '0')}분`], 0);
  fillSelect('#in-region', REGIONS.map((r, i) => i), (i) => [`${i}`, REGIONS[i][0]], 0);

  bindSegment('#seg-gender', (v) => { state.gender = v; });
  bindSegment('#seg-calendar', (v) => { state.calendar = v; refreshLeap(); refreshDays(); });
  bindSegment('#seg-boundary', (v) => { state.boundary = v; });

  $('#in-year').addEventListener('change', () => { refreshLeap(); refreshDays(); });
  $('#in-month').addEventListener('change', () => { refreshLeap(); refreshDays(); });
  $('#in-leap').addEventListener('change', refreshDays);
  $('#in-notime').addEventListener('change', (e) => {
    const off = e.target.checked;
    $('#in-hour').disabled = off; $('#in-min').disabled = off;
    $('#in-hour').style.opacity = off ? .4 : 1; $('#in-min').style.opacity = off ? .4 : 1;
  });

  $('#saju-form').addEventListener('submit', onSubmit);
  $('#btn-restart').addEventListener('click', restart);
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
function refreshDays() {
  const y = +$('#in-year').value || 1995, m = +$('#in-month').value || 1;
  const cur = +$('#in-day')?.value || 1;
  let max;
  if (state.calendar === 'lunar') {
    try { max = daysInLunarMonth(y, m, $('#in-leap').checked); } catch { max = 30; }
    if (max !== 29 && max !== 30) max = 30; // 안전망
  } else max = daysInMonth(y, m);
  fillSelect('#in-day', range(1, max), (d) => [`${d}`, `${d}일`], Math.min(cur, max));
}
function refreshLeap() {
  const wrap = $('#leap-wrap');
  if (state.calendar !== 'lunar') { wrap.hidden = true; $('#in-leap').checked = false; return; }
  const y = +$('#in-year').value, m = +$('#in-month').value;
  let leap = 0;
  try { leap = leapMonthOf(y); } catch { leap = 0; }
  if (leap === m) { wrap.hidden = false; $('#leap-hint').textContent = `(${y}년은 윤${leap}월이 있어요)`; }
  else { wrap.hidden = true; $('#in-leap').checked = false; }
}
function bindSegment(sel, cb) {
  const segs = $$('.seg', $(sel));
  segs.forEach((s) => s.addEventListener('click', () => {
    segs.forEach((x) => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
    s.classList.add('active'); s.setAttribute('aria-pressed', 'true'); cb(s.dataset.val);
  }));
}

// ── 제출 ──────────────────────────────────────────────────
function onSubmit(e) {
  e.preventDefault();
  const notime = $('#in-notime').checked;
  const regionIdx = +$('#in-region').value;
  const input = {
    name: $('#in-name').value.trim(),
    gender: state.gender,
    calendar: state.calendar,
    isLeapMonth: $('#in-leap').checked,
    year: +$('#in-year').value, month: +$('#in-month').value, day: +$('#in-day').value,
    hour: notime ? null : +$('#in-hour').value,
    minute: notime ? null : +$('#in-min').value,
    options: {
      trueSolarTime: $('#in-tst').checked,
      longitude: REGIONS[regionIdx][1],
      equationOfTime: true,
      useDST: true,
      dayBoundary: state.boundary,
    },
  };

  showResultView();
  $('#result-root').innerHTML = `<div class="loading"><div class="spinner"></div><p>만세력으로 사주를 계산하는 중…</p></div>`;

  setTimeout(() => {
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
    state.lastSaju = saju; state.lastReading = reading; state.lastAnalyze = a;
    state.lastLuck = { daewoon, sewoon };
    renderResult(saju, a, reading, { daewoon, sewoon });
  }, 280);
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
function renderResult(saju, a, reading, luck) {
  const root = $('#result-root');
  const name = saju.input.name;
  const birthLine = birthText(saju);
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([], 'x.png', { type: 'image/png' })] }));

  root.innerHTML = `
    <div class="result-head fade-in">
      ${name ? `<div class="result-name">${esc(name)} 님의 사주</div>` : `<div class="result-name">당신의 사주</div>`}
      <div class="result-type">${typeHtml(reading.typeLabel)}</div>
      <div class="result-birth">${birthLine}</div>
    </div>

    <div class="card fade-in">
      <p class="sec-title">사주 원국 · 만세력</p>
      ${pillarsHtml(saju, a)}
      ${corrHtml(saju)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">오행 분포</p>
      ${ohaengHtml(a)}
      <div class="section-gap"></div>
      ${ohaengKpiHtml(a)}
    </div>

    <div class="card fade-in">
      <p class="sec-title">영성 잠재력 · 7대 지표</p>
      ${gaugeHtml(a)}
      <div class="section-gap"></div>
      ${indicatorsHtml(a)}
      ${a.specialCombos.length ? `<div class="section-gap"></div>${combosHtml(a)}` : ''}
    </div>

    <div class="card fade-in">
      <p class="sec-title">대운(大運) · 인생 10년 흐름</p>
      ${daewoonHtml(luck.daewoon)}
      <div class="section-gap"></div>
      <p class="sec-title">세운(歲運) · 해마다의 기운</p>
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
        <button class="btn-ghost" id="btn-save">🖼️ 이미지 저장</button>
        <button class="btn-ghost" id="btn-share"${canShare ? '' : ' style="display:none"'}>↗ 공유</button>
      </div>
      <button class="btn-ghost" id="btn-again">다시 입력하기</button>
    </div>
    <p class="disclaimer" style="margin-top:14px">사주는 정답이 아니라 방향을 보는 지도입니다.<br/>고통의 가능성도 성장과 실천으로 이어지길 바랍니다.</p>
  `;

  $('#btn-copy').addEventListener('click', copyPrompt);
  $('#btn-again').addEventListener('click', restart);
  $('#btn-save').addEventListener('click', () => exportImage('save'));
  if (canShare) $('#btn-share').addEventListener('click', () => exportImage('share'));
  root.removeAttribute('tabindex');
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

// ── 이미지 저장·공유 ──────────────────────────────────────
async function exportImage(mode) {
  const btn = mode === 'save' ? $('#btn-save') : $('#btn-share');
  const orig = btn.textContent; btn.textContent = '이미지 만드는 중…'; btn.disabled = true;
  try {
    const cv = await drawShareCard(state.lastSaju, state.lastAnalyze);
    const blob = await canvasToBlob(cv);
    const fname = `사주-${state.lastSaju.input.name || '결과'}.png`;
    if (mode === 'share' && navigator.canShare) {
      const file = new File([blob], fname, { type: 'image/png' });
      await navigator.share({ files: [file], title: '내 사주 오행 분석', text: '오행 사주 분석 결과' });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('이미지를 저장했어요 🖼️');
    }
  } catch (err) {
    if (err && err.name !== 'AbortError') toast('이미지 생성에 실패했어요. 다시 시도해 주세요.');
  } finally { btn.textContent = orig; btn.disabled = false; }
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
  parts.push(`일간 <b>${saju.ilgan}(${saju.ilganHanja})</b> · 절기 <b>${saju.currentTerm}</b>`);
  if (c.trueSolarTime && saju.solar.hour !== null) {
    parts.push(`진태양시 보정 적용 (경도 ${c.longitudeCorrMin > 0 ? '+' : ''}${c.longitudeCorrMin}분, 균시차 ${c.eotMin > 0 ? '+' : ''}${c.eotMin}분 → 보정시각 <b>${c.correctedTime}</b>)`);
  }
  if (c.dstApplied) parts.push(`서머타임 적용 시기 (−60분 보정)`);
  parts.push(`일주 경계: ${c.dayBoundary === '자시' ? '자시(23시)설' : '자정(00시)설'}`);
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
    <div class="kpi"><div class="kpi-lab">신강·신약</div><div class="kpi-val">${a.strength.label.replace(' 경향', '')}</div><div class="kpi-sub">일간 세력 ${a.strength.supportRatio}% (참고)</div></div>
    <div class="kpi"><div class="kpi-lab">월령 십성</div><div class="kpi-val">${a.sipseong.monthGod}</div><div class="kpi-sub">타고난 기질 방향</div></div>
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
      <div class="ind-head"><span class="ind-dot"></span>${esc(i.name)}</div>
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
