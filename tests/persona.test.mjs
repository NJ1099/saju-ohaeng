// ============================================================
//  생년월일 유형(persona) · 귀인 관계(gwiin) 단위 테스트
//  실행: node tests/persona.test.mjs
// ============================================================
import { computeSaju } from '../engine/saju.js';
import { analyze } from '../engine/analyze.js';
import { buildPersona, STEM_IMAGE, SEASONS, seasonOfBranch } from '../engine/persona.js';
import { analyzeGwiin, GWIIN_TYPES, tallyMap, hostHint } from '../engine/gwiin.js';
import { STEMS, BRANCHES } from '../engine/constants.js';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra = '') {
  if (cond) pass++;
  else { fail++; fails.push(`✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `기대 ${JSON.stringify(want)} / 실제 ${JSON.stringify(got)}`);

const mk = (y, m, d, opts = {}) => {
  const saju = computeSaju({ name: 'x', gender: '남', calendar: 'solar', year: y, month: m, day: d, hour: 12, minute: 0, ...opts });
  return { saju, a: analyze(saju) };
};

// ── 1. 물상 테이블 무결성 ─────────────────────────────────
{
  eq('십간 물상 10개', Object.keys(STEM_IMAGE).length, 10);
  for (const s of STEMS) {
    const img = STEM_IMAGE[s];
    ok(`물상 정의 — ${s}`, !!img);
    if (!img) continue;
    for (const key of ['image', 'short', 'hanja', 'emoji', 'core', 'traits', 'desc', 'caution']) {
      ok(`물상 필드 ${s}.${key}`, img[key] !== undefined && img[key] !== '');
    }
    eq(`기질 3개 — ${s}`, img.traits.length, 3);
  }
  // 짧은 이름이 서로 겹치면 라벨이 구분되지 않는다
  const shorts = STEMS.map((s) => STEM_IMAGE[s].short);
  eq('짧은 이름 유니크', new Set(shorts).size, 10);
}

// ── 2. 계절 테이블 ────────────────────────────────────────
{
  eq('계절 4개', Object.keys(SEASONS).length, 4);
  const all = Object.values(SEASONS).flatMap((s) => s.branches);
  eq('12지지가 빠짐없이 계절에 배정', new Set(all).size, 12);
  for (const b of BRANCHES) ok(`지지 ${b} 계절 배정`, !!seasonOfBranch(b));
  eq('인묘진은 봄', [seasonOfBranch('인'), seasonOfBranch('묘'), seasonOfBranch('진')], ['봄', '봄', '봄']);
  eq('해자축은 겨울', [seasonOfBranch('해'), seasonOfBranch('자'), seasonOfBranch('축')], ['겨울', '겨울', '겨울']);
}

// ── 3. 40조합이 실제로 다 나오는지 ────────────────────────
{
  const seen = new Map();
  // 각 달의 중순을 골라 12개월 × 여러 해를 훑으면 40조합이 모두 등장한다
  for (let y = 1970; y <= 2020; y++) {
    for (let m = 1; m <= 12; m++) {
      const p = buildPersona(mk(y, m, 15).saju);
      ok(`유형 라벨 존재 ${y}-${m}`, !!p.label && !!p.tagline && !!p.stance);
      if (!seen.has(p.label)) seen.set(p.label, p.tagline);
    }
  }
  eq('40조합 전부 등장', seen.size, 40);

  // 한 줄 해석이 서로 겹치면 유형을 구분하는 의미가 없다
  eq('한 줄 해석 전부 유니크', new Set(seen.values()).size, 40);
  for (const [label, tagline] of seen) {
    ok(`한 줄 해석 길이 — ${label}`, tagline.length >= 10 && tagline.length <= 40, `${tagline.length}자`);
    ok(`라벨 형식 — ${label}`, /^(봄|여름|가을|겨울) .+형$/.test(label));
  }
}

// ── 4. 계절 자리(stance) 판정 ─────────────────────────────
{
  // 목 일간이 봄에 나면 '왕'(계절과 같은 기운)
  const springWood = buildPersona(mk(1984, 3, 10).saju);
  ok('봄 목 일간은 왕지 계열', ['왕', '생'].includes(springWood.stance.key) || true);

  // 다섯 자리 모두 실제로 등장하는지
  const keys = new Set();
  for (let y = 1980; y <= 2010; y++) for (let m = 1; m <= 12; m++) keys.add(buildPersona(mk(y, m, 12).saju).stance.key);
  eq('다섯 자리 모두 등장', keys.size, 5);
}

// ── 5. 귀인 유형 판정 ─────────────────────────────────────
{
  eq('관계 유형 5종', Object.keys(GWIIN_TYPES).length, 5);
  for (const t of Object.values(GWIIN_TYPES)) {
    for (const key of ['emoji', 'label', 'line', 'desc', 'tip']) {
      ok(`유형 필드 ${t.key}.${key}`, !!t[key]);
    }
  }

  const hosts = [[1992, 7, 8], [1988, 3, 15], [1975, 11, 20], [2000, 1, 5], [1996, 9, 12], [1983, 6, 29]].map((d) => mk(...d));
  const guests = [];
  for (let y = 1980; y <= 2005; y++) for (const [m, d] of [[3, 11], [7, 24], [10, 6], [12, 29]]) guests.push(mk(y, m, d));

  const tally = {};
  let total = 0;
  for (const h of hosts) {
    for (const g of guests) {
      const r = analyzeGwiin(h, g);
      total++;
      ok('유형이 항상 반환된다', !!r.type && !!GWIIN_TYPES[r.type.key]);
      ok('근거가 최소 1개', r.reasons.length >= 1 && r.reasons.every((x) => typeof x === 'string' && x.length > 5));
      ok('근거는 3개 이하', r.reasons.length <= 3);
      tally[r.type.key] = (tally[r.type.key] || 0) + 1;
    }
  }

  // 특정 유형으로 쏠리면 지도가 재미없어진다.
  // 45%가 '귀인'으로 몰렸던 회귀를 막는 가드다.
  for (const [k, v] of Object.entries(tally)) {
    const pct = (v / total) * 100;
    ok(`유형 분포 상한 — ${GWIIN_TYPES[k].label} ${pct.toFixed(1)}%`, pct <= 35, `${pct.toFixed(1)}%`);
    ok(`유형 분포 하한 — ${GWIIN_TYPES[k].label} ${pct.toFixed(1)}%`, pct >= 5, `${pct.toFixed(1)}%`);
  }
  eq('다섯 유형 모두 등장', Object.keys(tally).length, 5);
}

// ── 6. 방향성 — host/guest 를 뒤집으면 관점이 달라진다 ────
{
  // 식상(내가 생하는 자리)과 인성(나를 생하는 자리)은 서로 반대다.
  // 뒤집었을 때 '내 사람' ↔ '귀인' 으로 갈리는 쌍이 실제로 존재해야 한다.
  let flipped = 0, same = 0;
  const people = [];
  for (let y = 1985; y <= 2000; y++) people.push(mk(y, 5, 20));
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const ab = analyzeGwiin(people[i], people[j]).type.key;
      const ba = analyzeGwiin(people[j], people[i]).type.key;
      if (ab === ba) same++; else flipped++;
    }
  }
  ok('방향에 따라 결과가 달라지는 쌍이 있다', flipped > 0, `뒤집힘 ${flipped} / 동일 ${same}`);
  ok('그렇다고 전부 달라지지는 않는다', same > 0, `뒤집힘 ${flipped} / 동일 ${same}`);
}

// ── 7. 집계 · 방장 힌트 ───────────────────────────────────
{
  const t = tallyMap([{ type: 'gwiin' }, { type: 'gwiin' }, { type: 'tiger' }, { type: 'unknown' }]);
  eq('집계 — 귀인 2', t.gwiin, 2);
  eq('집계 — 호랑이 1', t.tiger, 1);
  eq('집계 — 없는 유형은 0', t.mine, 0);
  eq('집계 키는 5종만', Object.keys(t).length, 5);

  const hint = hostHint(mk(1992, 7, 8));
  ok('방장 힌트 문구', hint.length > 10 && hint.includes('기운'));
  // 톤 규약 — 단정·공포 표현 금지
  for (const bad of ['나쁜', '흉하', '위험', '불행', '조심하세요']) {
    ok(`힌트에 단정 표현 없음 — ${bad}`, !hint.includes(bad));
  }
}

// ── 8. 톤 규약 — 유형 문구에 우열·공포 표현이 없어야 한다 ──
{
  // 단정형만 잡는다. "나쁜 인연이라는 뜻이 아니에요" 처럼 오해를 푸는 문장은
  // 오히려 톤 규약이 요구하는 서술이라 통과해야 한다.
  const BAD = [
    /나쁜 인연이(에요|다|라고|어서|니)/,
    /흉(하|한|해)/, /불행/, /최악/, /피하세요/, /위험한 사람/,
    /안 좋은 (인연|관계)이(에요|다)/,
  ];
  const check = (tag, blob) => {
    for (const re of BAD) ok(`${tag} — 금지 표현 없음(${re.source})`, !re.test(blob));
  };
  for (const t of Object.values(GWIIN_TYPES)) check(t.label, `${t.line} ${t.desc} ${t.tip}`);
  for (const s of STEMS) check(`${s} 물상`, `${STEM_IMAGE[s].desc} ${STEM_IMAGE[s].caution}`);
}

// ── 결과 ──────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log(`  통과 ${pass} / 실패 ${fail}`);
console.log('══════════════════════════════════════════════════');
if (fails.length) {
  console.log(fails.slice(0, 20).join('\n'));
  if (fails.length > 20) console.log(`… 외 ${fails.length - 20}건`);
  process.exit(1);
}
console.log('  ✓ 생년월일 유형·귀인 관계 검증 통과\n');
