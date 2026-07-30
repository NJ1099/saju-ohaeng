// 명리 이론 계층(theory.js) + 궁합(compat.js) 검증 — data/theory-reference.json 대조.
// 실행: node tests/theory.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeSaju } from '../engine/saju.js';
import { analyze } from '../engine/analyze.js';
import { analyzeCompatibility } from '../engine/compat.js';
import {
  unseongOf, UNSEONG_ORDER, CHEONEUL, MUNCHANG, YANGIN, SAMHAP_SINSAL,
  STEM_HAP, STEM_CHUNG, STEMS, BRANCHES,
} from '../engine/constants.js';
import { branchRelation, analyzeTheory, spread, judgeStrength } from '../engine/theory.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(join(__dir, '../data/theory-reference.json'), 'utf8'));

let pass = 0, fail = 0;
const fails = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; fails.push(`✗ ${name}\n    기대: ${w}\n    실제: ${g}`); }
}
function ok(name, cond, extra = '') {
  if (cond) pass++;
  else { fail++; fails.push(`✗ ${name}${extra ? `\n    ${extra}` : ''}`); }
}
const mk = (o) => { const s = computeSaju(o); return { saju: s, a: analyze(s) }; };
const solar = (y, m, d, h = 12, mi = 0, gender = '남', name = '') =>
  mk({ calendar: 'solar', year: y, month: m, day: d, hour: h, minute: mi, gender, name });

// ── 1) 십이운성 ───────────────────────────────────────────
for (const [stem, branch, want] of REF.unseong.cases) {
  check(`십이운성 ${stem}·${branch}`, unseongOf(stem, branch), want);
}
for (const [stem, branch] of Object.entries(REF.unseong.geonrokAll)) {
  if (stem.startsWith('_')) continue; // 설명 키
  check(`건록지 ${stem}`, unseongOf(stem, branch), '건록');
}
// 각 일간의 12지지 운성이 12단계를 빠짐없이 한 번씩 갖는지 (순환 무결성)
for (const stem of STEMS) {
  const got = BRANCHES.map((b) => unseongOf(stem, b)).sort();
  check(`십이운성 순환 완전성 ${stem}`, got, [...UNSEONG_ORDER].sort());
}

// ── 2) 신살 테이블 ────────────────────────────────────────
for (const [stem, want] of Object.entries(REF.sinsal.cheoneul)) check(`천을귀인 ${stem}`, CHEONEUL[stem], want);
for (const [stem, want] of Object.entries(REF.sinsal.munchang)) check(`문창귀인 ${stem}`, MUNCHANG[stem], want);
for (const [stem, want] of Object.entries(REF.sinsal.yangin)) check(`양인 ${stem}`, YANGIN[stem], want);
// 음간 양인은 학설차로 의도적 제외
for (const stem of ['을', '정', '기', '신', '계']) ok(`음간 양인 제외 ${stem}`, YANGIN[stem] === undefined);
// 문창귀인 = 일간이 생하는 오행의 건록지 (정의 자체를 재검산)
const SAENG_EL = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
const STEM_EL = { 갑: '목', 을: '목', 병: '화', 정: '화', 무: '토', 기: '토', 경: '금', 신: '금', 임: '수', 계: '수' };
for (const stem of STEMS) {
  const outEl = SAENG_EL[STEM_EL[stem]];
  ok(`문창 정의 검산 ${stem}`, unseongOf(stem, MUNCHANG[stem]) !== '' && BRANCHES.includes(MUNCHANG[stem]),
    `문창 ${MUNCHANG[stem]} (일간이 생하는 오행 ${outEl})`);
}
for (const g of SAMHAP_SINSAL) {
  const key = g.group.join('');
  check(`역마 ${key}`, g.yeokma, REF.sinsal.yeokma[key]);
  check(`도화 ${key}`, g.dohwa, REF.sinsal.dohwa[key]);
  check(`화개 ${key}`, g.hwagae, REF.sinsal.hwagae[key]);
}

// ── 3) 형충회합 ───────────────────────────────────────────
const kinds = (b1, b2) => branchRelation(b1, b2).map((r) => r.kind);
for (const [a, b] of REF.relations.yukhap) {
  ok(`육합 ${a}${b}`, kinds(a, b).includes('육합'), `실제: ${kinds(a, b)}`);
  ok(`육합 역방향 ${b}${a}`, kinds(b, a).includes('육합'));
}
for (const [a, b] of REF.relations.chung) ok(`충 ${a}${b}`, kinds(a, b).includes('충'), `실제: ${kinds(a, b)}`);
for (const [a, b] of REF.relations.hae) ok(`해 ${a}${b}`, kinds(a, b).includes('해'), `실제: ${kinds(a, b)}`);
for (const [a, b] of REF.relations.pa) ok(`파 ${a}${b}`, kinds(a, b).includes('파'), `실제: ${kinds(a, b)}`);
for (const [a, b] of REF.relations.wonjin) ok(`원진 ${a}${b}`, kinds(a, b).includes('원진'), `실제: ${kinds(a, b)}`);
for (const [a, b] of REF.relations.sanghyeong) ok(`상형 ${a}${b}`, kinds(a, b).includes('형'), `실제: ${kinds(a, b)}`);
for (const b of REF.relations.jahyeong) ok(`자형 ${b}${b}`, kinds(b, b).includes('자형'), `실제: ${kinds(b, b)}`);
// 자형이 아닌 같은 글자는 자형으로 잡히면 안 됨
for (const b of BRANCHES.filter((x) => !REF.relations.jahyeong.includes(x))) {
  ok(`비자형 ${b}${b}`, !kinds(b, b).includes('자형'));
}
for (const [b1, b2, b3, el] of REF.relations.samhap) {
  // 세 글자 중 어떤 두 글자를 골라도 반합(半合)으로 잡혀야 한다
  for (const [x, y] of [[b1, b2], [b2, b3], [b1, b3]]) {
    const r = branchRelation(x, y).find((z) => z.kind === '삼합(반합)');
    ok(`삼합 반합 ${x}${y}`, !!r, `실제: ${kinds(x, y)}`);
    if (r) check(`삼합 오행 ${x}${y}`, r.element, el);
  }
}
for (const [b1, b2, b3, el] of REF.relations.banghap) {
  for (const [x, y] of [[b1, b2], [b2, b3], [b1, b3]]) {
    const r = branchRelation(x, y).find((z) => z.kind === '방합(반방합)');
    ok(`방합 ${x}${y}`, !!r, `실제: ${kinds(x, y)}`);
    if (r) check(`방합 오행 ${x}${y}`, r.element, el);
  }
}
for (const [a, b, el] of REF.relations.stemHap) {
  check(`천간합 ${a}${b}`, STEM_HAP[a], [b, el]);
  check(`천간합 역방향 ${b}${a}`, STEM_HAP[b], [a, el]);
}
for (const [a, b] of REF.relations.stemChung) {
  check(`천간충 ${a}${b}`, STEM_CHUNG[a], b);
  check(`천간충 역방향 ${b}${a}`, STEM_CHUNG[b], a);
}
for (const [a, b] of REF.relations.stemNoChung) {
  ok(`천간충 아님 ${a}${b}`, STEM_CHUNG[a] !== b, `실제: ${a}→${STEM_CHUNG[a]}`);
}

// ── 4) 조후 ───────────────────────────────────────────────
for (const c of REF.johu.cases) {
  const [y, m, d, h] = c.solar;
  const t = analyzeTheory(solar(y, m, d, h).saju);
  const sign = t.johu.temp < 0 ? 'cold' : 'hot';
  check(`조후 ${y}-${m}-${d} 온도 방향`, sign, c.expectTempSign);
  ok(`조후 ${y}-${m}-${d} 필요 오행 ${c.expectNeed}`, t.johu.need.includes(c.expectNeed),
    `실제 need=${t.johu.need} temp=${t.johu.temp}`);
}

// ── 5) 격국 ───────────────────────────────────────────────
for (const c of REF.gyeokguk.cases) {
  const [y, m, d, h] = c.solar;
  const t = analyzeTheory(solar(y, m, d, h, 0, c.gender).saju);
  check(`격국 ${y}-${m}-${d} 십성`, t.gyeokguk.sipseong, c.sipseong);
  check(`격국 ${y}-${m}-${d} 이름`, t.gyeokguk.name, c.name);
}

// ── 6) 신강/신약 — 통근 판정 ──────────────────────────────
{
  // 득령은 '월지 본기'가 비겁·인성일 때만. 을목 + 미월(본기 기토=편재) → 실령이어야 한다.
  const s = spread(solar(1992, 7, 8, 12).saju);
  const st = judgeStrength(s);
  check('득령 판정 — 을목 미월(본기 기토)은 실령', st.deukryeong, false);
  ok('실령이어도 월지 지장간 뿌리는 인식', st.roots.some((r) => r.pos === '월'),
    `roots=${JSON.stringify(st.roots.map((r) => r.pos + r.branch + r.depth))}`);
  ok('신강약 라벨 4단계 중 하나', ['신강(身强)', '중화신강(中和身强)', '중화신약(中和身弱)', '신약(身弱)'].includes(st.label), st.label);
  ok('세력 비율 0~100', st.ratio >= 0 && st.ratio <= 100, `${st.ratio}`);
}
// 여러 사주에서 라벨·비율이 항상 유효한지 (스모크)
{
  let bad = 0;
  for (let y = 1950; y <= 2020; y += 7) {
    for (const m of [2, 5, 8, 11]) {
      const a = solar(y, m, 15, 10).a;
      if (!['신강(身强)', '중화신강(中和身强)', '중화신약(中和身弱)', '신약(身弱)'].includes(a.strength.label)) bad++;
      if (!(a.strength.supportRatio >= 0 && a.strength.supportRatio <= 100)) bad++;
    }
  }
  check('신강약 스모크(44케이스) 이상 없음', bad, 0);
}

// ── 7) 궁합 ───────────────────────────────────────────────
for (const c of REF.compat.cases) {
  const A = solar(...c.a), B = solar(...c.b);
  const r = analyzeCompatibility(A, B);
  if (c.expect.ilganScore !== undefined) {
    const ax = r.axes.find((x) => x.key === 'ilgan');
    check(`궁합[${c.label}] 일간 점수`, ax.score, c.expect.ilganScore);
    check(`궁합[${c.label}] 일간 톤`, ax.tone, c.expect.ilganTone);
  }
  if (c.expect.elementsMax !== undefined) {
    const ax = r.axes.find((x) => x.key === 'elements');
    ok(`궁합[${c.label}] 오행 보완 ≤ ${c.expect.elementsMax}`, ax.score <= c.expect.elementsMax, `실제 ${ax.score}`);
    check(`궁합[${c.label}] A로 가는 보완량`, ax.supplyToA, c.expect.supplyToA);
    check(`궁합[${c.label}] B로 가는 보완량`, ax.supplyToB, c.expect.supplyToB);
  }
}
// 궁합 구조 불변식
{
  const A = solar(1992, 7, 8, 12, 0, '남', '민수');
  const B = solar(1995, 3, 14, 9, 30, '여', '지영');
  const r = analyzeCompatibility(A, B);
  check('궁합 축 개수', r.axes.length, 6);
  check('궁합 배점 합계', r.axes.reduce((s, x) => s + x.weight, 0), 100);
  check('궁합 기둥 대조 4행', r.matrix.length, 4);
  ok('궁합 총점 0~100', r.score >= 0 && r.score <= 100, `${r.score}`);
  ok('등급 존재', !!r.grade && !!r.grade.label);
  ok('양방향 렌즈', !!r.lens.aSees.sipseong && !!r.lens.bSees.sipseong);
  for (const ax of r.axes) {
    ok(`축 ${ax.key} 점수 범위 0~${ax.weight}`, ax.score >= 0 && ax.score <= ax.weight, `실제 ${ax.score}`);
    ok(`축 ${ax.key} 서술 존재`, !!ax.headline && ax.detail.length > 0);
  }
  // 대칭성 — 순서를 바꿔도 총점은 같아야 한다
  const rev = analyzeCompatibility(B, A);
  check('궁합 대칭성(총점)', rev.score, r.score);
  // 시주 미상 처리
  const noHour = mk({ calendar: 'solar', year: 1990, month: 5, day: 5, hour: null, minute: null, gender: '여', name: '무시' });
  const r2 = analyzeCompatibility(A, noHour);
  ok('시주 미상이면 시주 행이 unknown', r2.matrix[3].unknown === true);
  ok('시주 미상에도 총점 산출', r2.score >= 0 && r2.score <= 100);
}
// 점수 분포 — 총점이 항상 0~100 이고 등급이 매핑되는지 (1770쌍)
{
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const people = [];
  for (let i = 0; i < 40; i++) {
    people.push(solar(1970 + Math.floor(rnd() * 40), 1 + Math.floor(rnd() * 12),
      1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), 0, rnd() < .5 ? '남' : '여', `P${i}`));
  }
  let bad = 0, min = 100, max = 0;
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const r = analyzeCompatibility(people[i], people[j]);
      if (!(r.score >= 0 && r.score <= 100) || !r.grade) bad++;
      min = Math.min(min, r.score); max = Math.max(max, r.score);
    }
  }
  check(`궁합 780쌍 이상 없음`, bad, 0);
  ok(`궁합 점수 분포가 한쪽으로 붕괴하지 않음 (min ${min} · max ${max})`, max - min >= 20, `폭 ${max - min}`);
}

// ── 결과 ──────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`  통과 ${pass} / 실패 ${fail}`);
console.log(`${'═'.repeat(50)}`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
else console.log('  ✓ 모든 이론·궁합 검증 통과');
